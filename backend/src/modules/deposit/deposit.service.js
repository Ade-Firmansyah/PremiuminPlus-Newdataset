import { createDeposit as saveDeposit, findDepositByInvoice, listDepositsByUser, updateDeposit } from '../../repositories/deposit.repo.js';
import { createActivityLog } from '../../repositories/activity.repo.js';
import { premkuCancelPay, premkuPay, premkuPayStatus } from '../../services/premku.service.js';
import { transaction, parseDbJson } from '../../config/db.js';
import { logger } from '../../utils/logger.js';
import { deleteCache, getCache, setCache } from '../../services/cache.service.js';
import { publishUserRefresh } from '../../services/realtime.service.js';
import { getSaldoUtama } from '../../services/wallet.service.js';
import { parseMysqlDate, toMysqlDate } from '../../utils/date.js';
import env from '../../config/env.js';

const QR_EXPIRY_MS = 30 * 60 * 1000;
const PAY_STATUS_CACHE_MS = env.PREMKU_PAY_STATUS_CACHE_MS;

function cacheDepositQr(invoice, qrPayload = {}) {
  const qr = {
    qr_data: typeof qrPayload.qr_data === 'string' ? qrPayload.qr_data : null,
    qr_image: typeof qrPayload.qr_image === 'string' ? qrPayload.qr_image : null,
  };
  setCache(`deposit-qr:${invoice}`, qr, QR_EXPIRY_MS);
  return qr;
}

function attachDepositQr(deposit) {
  if (!deposit || deposit.status !== 'pending') return deposit;
  const qr = getCache(`deposit-qr:${deposit.invoice}`);
  return qr ? { ...deposit, ...qr } : deposit;
}

function clearDepositQr(invoice) {
  deleteCache(`deposit-qr:${invoice}`);
}

function resolveDepositStatusValue(payload) {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';

  const candidates = [
    payload.pay_status,
    payload.data?.pay_status,
    payload.payment_status,
    payload.data?.payment_status,
    payload.transaction_status,
    payload.data?.transaction_status,
    payload.status_pembayaran,
    payload.data?.status_pembayaran,
    payload.status_bayar,
    payload.data?.status_bayar,
    payload.data?.status,
    payload.status,
  ];

  const value = candidates.find((item) => typeof item === 'string' && item.trim());
  return value || '';
}

function normalizeDepositStatus(value) {
  const status = String(resolveDepositStatusValue(value) || value || '').toLowerCase();
  if (['success', 'sukses', 'paid'].includes(status)) return 'success';
  if (['canceled', 'cancelled', 'cancel'].includes(status)) return 'canceled';
  if (['failed', 'fail', 'gagal', 'error'].includes(status)) return 'failed';
  if (['expired', 'expire'].includes(status)) return 'expired';
  if (['pending', 'process', 'processing', 'waiting', 'wait', 'unpaid', 'menunggu pembayaran', 'belum dibayar'].includes(status)) return 'pending';
  return 'pending';
}

function mapDepositRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    invoice: row.invoice,
    amount: Number(row.amount || 0),
    total_bayar: Number(row.total_bayar || 0),
    status: row.status,
    qr_data: row.qr_data || null,
    qr_image: row.qr_image || null,
    external_response: parseDbJson(row.external_response, null),
    external_status_response: parseDbJson(row.external_status_response, null),
    processed_at: row.processed_at || null,
    expired_at: row.expired_at || null,
    canceled_at: row.canceled_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function resolvePremkuInvoice(payment) {
  const invoice =
    payment?.data?.invoice_id ??
    payment?.invoice_id ??
    payment?.data?.invoice ??
    payment?.invoice ??
    payment?.data?.ref_id ??
    payment?.ref_id ??
    payment?.data?.id ??
    payment?.id;
  return invoice ? String(invoice) : '';
}

function resolveExpiredAt(payment) {
  return toMysqlDate(new Date(Date.now() + QR_EXPIRY_MS));
}

function nextExpiryFromNow() {
  return toMysqlDate(new Date(Date.now() + QR_EXPIRY_MS));
}

function isDepositExpired(deposit) {
  const expiredAt = parseMysqlDate(deposit?.expired_at);
  return Boolean(expiredAt && expiredAt.getTime() <= Date.now());
}

async function expireDeposit(invoice, externalResponse = {}) {
  let cancelResponse = null;
  try {
    cancelResponse = await premkuCancelPay(invoice);
  } catch (error) {
    cancelResponse = { message: error instanceof Error ? error.message : 'Premku cancel_pay failed' };
  }

  const expired = await updateDeposit(invoice, {
    status: 'expired',
    qr_data: null,
    qr_image: null,
    external_status_response: {
      ...externalResponse,
      cancel_response: cancelResponse,
      message: externalResponse?.message || 'Invoice expired and canceled at Premku',
    },
  });
  clearDepositQr(invoice);
  if (expired?.user_id) publishUserRefresh(expired.user_id, 'deposit_updated', { scope: 'deposit', entity: 'deposit', id: invoice });
  return expired;
}

export async function createDeposit(user, amount) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount < 1000) {
    const error = new Error('Minimal deposit Rp1.000');
    error.statusCode = 400;
    throw error;
  }

  let payment = null;
  try {
    payment = await premkuPay({ amount: numericAmount });
  } catch (error) {
    const wrapped = new Error(error instanceof Error ? error.message : 'Premku payment call failed');
    wrapped.statusCode = 502;
    throw wrapped;
  }

  const paymentStatus = String(payment?.status ?? payment?.success ?? payment?.data?.status ?? '').toLowerCase();
  const invoice = resolvePremkuInvoice(payment);
  if (!invoice) {
    const error = new Error('Premku tidak mengirim invoice payment yang valid');
    error.statusCode = 502;
    throw error;
  }
  const qrImage = payment?.qr_image ?? payment?.data?.qr_image ?? null;
  const qrData = payment?.qr_data ?? payment?.qr_raw ?? payment?.data?.qr_data ?? payment?.data?.qr_raw ?? payment?.data?.qr ?? qrImage ?? null;
  if (['false', 'failed', 'error', 'gagal'].includes(paymentStatus) || (!qrData && !qrImage)) {
    const error = new Error(payment?.message || payment?.error || 'Gagal membuat QR pembayaran');
    error.statusCode = 502;
    throw error;
  }

  const qrValue = typeof qrData === 'string' ? qrData : JSON.stringify(qrData);
  const qrImageValue = typeof qrImage === 'string' ? qrImage : '';
  const expiredAt = resolveExpiredAt(payment);

  logger('DEPOSIT', { invoice, user_id: user.id, amount: numericAmount });
  await createActivityLog({
    actor_id: user.id,
    scope: 'DEPOSIT',
    message: 'Deposit created',
    metadata: { invoice, amount: numericAmount },
  });

  const created = await saveDeposit({
    user_id: user.id,
    invoice,
    amount: numericAmount,
    total_bayar: Number(payment?.total_bayar ?? payment?.data?.total_bayar ?? numericAmount),
    qr_data: qrValue,
    qr_image: qrImageValue,
    expired_at: expiredAt,
    external_response: payment,
  });
  publishUserRefresh(user.id, 'deposit_updated', { scope: 'deposit', entity: 'deposit', id: created.invoice });
  return { ...created, ...cacheDepositQr(created.invoice, { qr_data: qrValue, qr_image: qrImageValue }) };
}

export async function applyDepositSuccess(invoice, externalResponse = {}) {
  const result = await transaction(async (connection) => {
    const [rows] = await connection.query('SELECT * FROM deposits WHERE invoice = ? FOR UPDATE', [invoice]);
    const deposit = rows[0];
    if (!deposit) {
      const error = new Error('Deposit tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    if (deposit.status === 'success' || deposit.processed_at) {
      return { deposit: mapDepositRow(deposit), userId: deposit.user_id, changed: false };
    }

    if (['canceled', 'failed'].includes(deposit.status)) {
      return { deposit: mapDepositRow(deposit), userId: deposit.user_id, changed: false };
    }

    const [userRows] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [deposit.user_id]);
    const user = userRows[0];
    if (!user) {
      const error = new Error('User tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    const amount = Number(deposit.amount || 0);
    const before = getSaldoUtama(user);
    const after = before + amount;
    const processedAt = toMysqlDate();

    await connection.query(
      `UPDATE deposits
       SET status = 'success', qr_data = NULL, qr_image = NULL, external_status_response = ?, processed_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE invoice = ? AND processed_at IS NULL AND status <> 'success'`,
      [JSON.stringify(externalResponse ?? parseDbJson(deposit.external_response, null)), processedAt, invoice],
    );
    await connection.query('UPDATE users SET saldo_utama = ?, saldo = ? WHERE id = ?', [after, after, deposit.user_id]);
    await connection.query(
      `INSERT INTO saldo_logs
        (user_id, type, amount, balance_before, balance_after, reference, notes)
       VALUES (?, 'credit', ?, ?, ?, ?, ?)`,
      [deposit.user_id, amount, before, after, invoice, 'QRIS Payment / Deposit saldo'],
    );
    await connection.query(
      `INSERT INTO saldo_mutations
        (user_id, mutation_type, amount, balance_before, balance_after, reference)
       VALUES (?, 'deposit', ?, ?, ?, ?)`,
      [deposit.user_id, amount, before, after, invoice],
    );
    await connection.query(
      `INSERT INTO activity_logs (actor_id, scope, message, metadata)
       VALUES (?, 'PAYMENT', 'Deposit success', ?)`,
      [deposit.user_id, JSON.stringify({ invoice, amount, balance_before: before, balance_after: after })],
    );

    logger('PAYMENT', { invoice, user_id: deposit.user_id, amount });
    logger('SALDO', { user_id: deposit.user_id, balance_before: before, balance_after: after });

    const [updatedRows] = await connection.query('SELECT * FROM deposits WHERE invoice = ? LIMIT 1', [invoice]);
    const mapped = mapDepositRow(updatedRows[0] || deposit);
    return { deposit: mapped, userId: deposit.user_id, changed: true };
  });

  if (result.changed) {
    clearDepositQr(invoice);
    publishUserRefresh(result.userId, 'deposit_updated', { scope: 'deposit', entity: 'deposit', id: invoice });
    publishUserRefresh(result.userId, 'wallet_updated', { scope: 'wallet', entity: 'saldo', id: invoice });
  }
  return result.deposit;
}

export async function updateDepositStatus(invoice, status, externalResponse = {}) {
  const normalizedStatus = normalizeDepositStatus(status || externalResponse);
  if (normalizedStatus === 'success') {
    return applyDepositSuccess(invoice, externalResponse);
  }

  const existing = await findDepositByInvoice(invoice);
  if (normalizedStatus === 'expired' && existing && !isDepositExpired(existing)) {
    return updateDeposit(invoice, {
      status: 'pending',
      external_status_response: {
        ...externalResponse,
        ignored_status: 'expired',
        message: 'Premku webhook returned expired before local 30 minute limit; keeping deposit pending',
      },
    });
  }

  if (['expired', 'failed', 'canceled'].includes(normalizedStatus)) clearDepositQr(invoice);
  return updateDeposit(invoice, {
    status: normalizedStatus,
    external_status_response: externalResponse,
  });
}

export async function refreshDepositStatus(invoice) {
  const deposit = await findDepositByInvoice(invoice);
  if (!deposit) {
    return null;
  }

  if (deposit.status === 'success' || deposit.status === 'canceled') {
    return deposit;
  }

  let statusResponse;
  try {
    const cached = getCache(`deposit-status:${invoice}`);
    if (cached) return attachDepositQr(cached);
    statusResponse = await premkuPayStatus(invoice);
  } catch (error) {
    const updated = await updateDeposit(invoice, {
      external_status_response: { message: error instanceof Error ? error.message : 'Premku pay status failed' },
    });
    const result = updated || (await findDepositByInvoice(invoice));
    if (result?.user_id) publishUserRefresh(result.user_id, 'deposit_updated', { scope: 'deposit', entity: 'deposit', id: invoice });
    return attachDepositQr(result);
  }

  const nextStatus = normalizeDepositStatus(statusResponse);
  const locallyExpired = isDepositExpired(deposit);
  if (nextStatus === 'success') {
    const applied = await applyDepositSuccess(invoice, statusResponse);
    setCache(`deposit-status:${invoice}`, applied, 5000);
    return applied;
  }

  if (nextStatus === 'expired' && !isDepositExpired(deposit)) {
    const pending = await updateDeposit(invoice, {
      status: 'pending',
      external_status_response: {
        ...statusResponse,
        ignored_status: 'expired',
        message: 'Premku returned expired before local 30 minute limit; keeping deposit pending',
      },
    });
    const response = pending || (await findDepositByInvoice(invoice));
    if (response?.user_id) publishUserRefresh(response.user_id, 'deposit_updated', { scope: 'deposit', entity: 'deposit', id: invoice });
    const withQr = attachDepositQr(response);
    setCache(`deposit-status:${invoice}`, withQr, PAY_STATUS_CACHE_MS);
    return withQr;
  }

  if (nextStatus === 'expired') {
    const expired = await expireDeposit(invoice, statusResponse);
    clearDepositQr(invoice);
    setCache(`deposit-status:${invoice}`, expired, 5000);
    return expired;
  }

  if (nextStatus === 'canceled' || nextStatus === 'failed') {
    const updated = await updateDeposit(invoice, {
      status: nextStatus,
      external_status_response: statusResponse,
    });
    const response = updated || (await findDepositByInvoice(invoice));
    clearDepositQr(invoice);
    if (response?.user_id) publishUserRefresh(response.user_id, 'deposit_updated', { scope: 'deposit', entity: 'deposit', id: invoice });
    setCache(`deposit-status:${invoice}`, response, 5000);
    return attachDepositQr(response);
  }

  if (locallyExpired || ['failed', 'expired'].includes(deposit.status)) {
    const restored = await updateDeposit(invoice, {
      status: 'pending',
      expired_at: nextExpiryFromNow(),
      external_status_response: {
        ...statusResponse,
        restored_from_status: deposit.status,
        message: 'Premku masih menunggu pembayaran; deposit lokal dipulihkan ke pending',
      },
    });
    const response = restored || (await findDepositByInvoice(invoice));
    if (response?.user_id) publishUserRefresh(response.user_id, 'deposit_updated', { scope: 'deposit', entity: 'deposit', id: invoice });
    const withQr = attachDepositQr(response);
    setCache(`deposit-status:${invoice}`, withQr, PAY_STATUS_CACHE_MS);
    return withQr;
  }

  const updated = await updateDeposit(invoice, {
    status: nextStatus || 'pending',
    external_status_response: statusResponse,
  });
  const response = updated || (await findDepositByInvoice(invoice));
  if (response?.user_id) publishUserRefresh(response.user_id, 'deposit_updated', { scope: 'deposit', entity: 'deposit', id: invoice });
  const withQr = attachDepositQr(response);
  setCache(`deposit-status:${invoice}`, withQr, nextStatus === 'pending' ? PAY_STATUS_CACHE_MS : 5000);
  return withQr;
}

export async function listSyncedDepositsByUser(userId) {
  const deposits = await listDepositsByUser(userId);
  const pendingDeposits = deposits.filter((deposit) => deposit.status === 'pending');
  if (!pendingDeposits.length) return deposits;

  const synced = new Map();
  for (const deposit of pendingDeposits.slice(0, 10)) {
    try {
      const refreshed = await refreshDepositStatus(deposit.invoice);
      if (refreshed) synced.set(refreshed.invoice, refreshed);
    } catch (error) {
      logger('ERROR', {
        task: 'deposit-history-sync',
        invoice: deposit.invoice,
        message: error instanceof Error ? error.message : 'Deposit status sync failed',
      });
    }
  }

  if (!synced.size) return deposits;
  return deposits.map((deposit) => synced.get(deposit.invoice) || deposit);
}

export async function cancelDeposit(invoice, user) {
  const deposit = await findDepositByInvoice(invoice);
  if (!deposit) {
    const error = new Error('Deposit tidak ditemukan');
    error.statusCode = 404;
    throw error;
  }

  if (user.role !== 'admin' && deposit.user_id !== user.id) {
    const error = new Error('Invoice bukan milik akun ini');
    error.statusCode = 403;
    throw error;
  }

  if (deposit.status === 'success' || deposit.processed_at) {
    const error = new Error('Deposit sukses tidak bisa dibatalkan');
    error.statusCode = 409;
    throw error;
  }

  let cancelResponse = {};
  try {
    cancelResponse = await premkuCancelPay(invoice);
  } catch (error) {
    cancelResponse = { message: error instanceof Error ? error.message : 'Premku cancel_pay failed' };
  }

  const updated = await updateDeposit(invoice, {
    status: 'canceled',
    qr_data: null,
    qr_image: null,
    external_status_response: cancelResponse,
    canceled_at: toMysqlDate(),
  });

  await createActivityLog({
    actor_id: user.id,
    scope: 'CANCEL',
    message: 'Deposit canceled',
    metadata: { invoice },
  });
  logger('CANCEL', { invoice, user_id: user.id });
  const result = updated || (await findDepositByInvoice(invoice));
  if (result?.user_id) publishUserRefresh(result.user_id, 'deposit_updated', { scope: 'deposit', entity: 'deposit', id: invoice });
  return result;
}
