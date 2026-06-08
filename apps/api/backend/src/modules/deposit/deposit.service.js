import { createDeposit as saveDeposit, findDepositByInvoice, updateDeposit } from '../../repositories/deposit.repo.js';
import { createActivityLog } from '../../repositories/activity.repo.js';
import { premkuCancelPay, premkuPay, premkuPayStatus } from '../../services/premku.service.js';
import { createInvoice } from '../../utils/invoice.js';
import { transaction, parseDbJson, query } from '../../config/db.js';
import { logger } from '../../utils/logger.js';
import { notifyAdmin } from '../../services/notification.service.js';
import env from '../../config/env.js';
import { deleteCachePrefix, getCache, setCache } from '../../services/cache.service.js';
import { applyBotActivationSuccess, applyWalletMutationInTransaction, BOT_LOCKED_BALANCE } from '../../services/wallet.service.js';

function toMysqlDate(value = new Date()) {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeDepositStatus(value) {
  const raw = value?.data?.status ?? value?.pay_status ?? value?.payment_status ?? value?.transaction_status ?? value?.status ?? value;
  const status = typeof raw === 'boolean' ? '' : String(raw || '').toLowerCase();
  if (['success', 'sukses', 'paid', 'settlement', 'capture'].includes(status)) return 'success';
  if (['canceled', 'cancelled'].includes(status)) return 'canceled';
  if (['failed', 'fail', 'gagal', 'error'].includes(status)) return 'failed';
  if (['expired', 'expire'].includes(status)) return 'expired';
  return 'pending';
}

function isPendingDepositStatus(status) {
  return ['pending', 'pending_payment'].includes(String(status || '').toLowerCase());
}

function resolveDepositProviderInvoice(deposit) {
  return deposit?.provider_invoice || deposit?.invoice;
}

function extractDepositStatusInvoice(payload) {
  return String(payload?.data?.invoice ?? payload?.invoice ?? payload?.data?.ref_id ?? payload?.ref_id ?? '').trim();
}

function extractDepositTotalBayar(payload) {
  const value = payload?.data?.total_bayar ?? payload?.total_bayar ?? payload?.data?.amount_total ?? payload?.amount_total;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function validateDepositSuccess(deposit, statusResponse) {
  if (statusResponse?.success === false || statusResponse?.status === false) {
    return { ok: false, status: 'manual_required', reason: statusResponse?.message || 'Premku pay_status failed' };
  }
  const nextStatus = normalizeDepositStatus(statusResponse);
  if (nextStatus !== 'success') {
    return { ok: false, status: nextStatus, reason: `pay_status_not_success:${nextStatus}` };
  }
  const providerInvoice = resolveDepositProviderInvoice(deposit);
  const responseInvoice = extractDepositStatusInvoice(statusResponse);
  if (responseInvoice && providerInvoice && responseInvoice !== providerInvoice) {
    return { ok: false, status: 'payment_mismatch', reason: `invoice_mismatch:${responseInvoice}` };
  }
  const responseTotal = extractDepositTotalBayar(statusResponse);
  const expectedTotal = Number(deposit?.total_bayar || deposit?.amount || 0);
  if (responseTotal !== null && expectedTotal > 0 && responseTotal !== expectedTotal) {
    return { ok: false, status: 'payment_mismatch', reason: `total_bayar_mismatch:${responseTotal}` };
  }
  return { ok: true, status: 'success', reason: '' };
}

function mapDepositRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    invoice: row.invoice,
    provider_invoice: row.provider_invoice || null,
    amount: Number(row.amount || 0),
    total_bayar: Number(row.total_bayar || 0),
    payment_type: row.payment_type || 'deposit',
    status: row.status,
    qr_data: row.qr_data || null,
    qr_image: row.qr_image || null,
    qr_raw: row.qr_raw || null,
    external_response: parseDbJson(row.external_response, null),
    external_status_response: parseDbJson(row.external_status_response, null),
    processed_at: row.processed_at || null,
    expired_at: row.expired_at || null,
    canceled_at: row.canceled_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function resolvePremkuInvoice(payment, fallback) {
  return String(payment?.invoice ?? payment?.data?.invoice ?? payment?.ref_id ?? payment?.data?.ref_id ?? fallback);
}

function resolveExpiredAt(payment, ttlMinutes = env.PAYMENT_QR_TTL_MINUTES) {
  const raw = payment?.expired_at ?? payment?.expires_at ?? payment?.data?.expired_at ?? payment?.data?.expires_at ?? null;
  const localExpiry = new Date(Date.now() + Math.max(1, Number(ttlMinutes || 5)) * 60 * 1000);
  if (raw) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return toMysqlDate(date.getTime() < localExpiry.getTime() ? date : localExpiry);
  }
  return toMysqlDate(localExpiry);
}

function isExpiredAt(value) {
  if (!value) return false;
  const expiry = new Date(value).getTime();
  return Number.isFinite(expiry) && expiry <= Date.now();
}

export async function createDeposit(user, amount, options = {}) {
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
  const invoice = createInvoice('DEP');
  const providerInvoice = resolvePremkuInvoice(payment, invoice);
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
  void notifyAdmin('deposit pending', {
    user: user.username,
    amount: numericAmount,
    invoice,
    status: 'PENDING PAYMENT',
  });

  return saveDeposit({
    user_id: user.id,
    invoice,
    provider_invoice: providerInvoice,
    amount: numericAmount,
    total_bayar: Number(payment?.total_bayar ?? payment?.data?.total_bayar ?? numericAmount),
    payment_type: options.payment_type || 'deposit',
    status: 'pending_payment',
    qr_data: qrValue,
    qr_image: qrImageValue,
    qr_raw: qrValue,
    expired_at: expiredAt,
    external_response: payment,
  });
}

export async function createBotActivationDeposit(user) {
  if (Number(user.saldo || 0) >= BOT_LOCKED_BALANCE || (user.bot_access_unlocked && Number(user.locked_balance || 0) >= BOT_LOCKED_BALANCE && Number(user.saldo || 0) >= Number(user.locked_balance || 0))) {
    const error = new Error('Akses Bot WhatsApp sudah aktif');
    error.statusCode = 409;
    throw error;
  }

  const pendingRows = await query(
    `SELECT *
     FROM deposits
     WHERE user_id = ?
       AND payment_type = 'bot_activation'
       AND status IN ('pending', 'pending_payment')
       AND (expired_at IS NULL OR expired_at > NOW())
     ORDER BY id DESC
     LIMIT 1`,
    [user.id],
  );
  if (pendingRows[0]) {
    return mapDepositRow(pendingRows[0]);
  }

  return createDeposit(user, BOT_LOCKED_BALANCE, { payment_type: 'bot_activation' });
}

export async function applyDepositSuccess(invoice, externalResponse = {}) {
  return transaction(async (connection) => {
    const [rows] = await connection.query('SELECT * FROM deposits WHERE invoice = ? FOR UPDATE', [invoice]);
    const deposit = rows[0];
    if (!deposit) {
      const error = new Error('Deposit tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    if (deposit.status === 'success' || deposit.processed_at) {
      if (deposit.qr_data || deposit.qr_image || deposit.qr_raw) {
        await connection.query(
          `UPDATE deposits
           SET qr_data = NULL, qr_image = NULL, qr_raw = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE invoice = ?`,
          [invoice],
        );
        const [updatedRows] = await connection.query('SELECT * FROM deposits WHERE invoice = ? LIMIT 1', [invoice]);
        return mapDepositRow(updatedRows[0] || deposit);
      }
      return mapDepositRow(deposit);
    }

    if (['canceled', 'expired', 'failed'].includes(deposit.status)) {
      if (deposit.qr_data || deposit.qr_image || deposit.qr_raw) {
        await connection.query(
          `UPDATE deposits
           SET qr_data = NULL, qr_image = NULL, qr_raw = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE invoice = ?`,
          [invoice],
        );
        const [updatedRows] = await connection.query('SELECT * FROM deposits WHERE invoice = ? LIMIT 1', [invoice]);
        return mapDepositRow(updatedRows[0] || deposit);
      }
      return mapDepositRow(deposit);
    }

    const validation = validateDepositSuccess(deposit, externalResponse);
    if (!validation.ok) {
      await connection.query(
        `UPDATE deposits
         SET status = ?, external_status_response = ?, qr_data = NULL, qr_image = NULL, qr_raw = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE invoice = ?`,
        [
          validation.status || 'manual_required',
          JSON.stringify({ ...(externalResponse ?? {}), validation_error: validation.reason }),
          invoice,
        ],
      );
      const [updatedRows] = await connection.query('SELECT * FROM deposits WHERE invoice = ? LIMIT 1', [invoice]);
      return mapDepositRow(updatedRows[0] || deposit);
    }

    const [userRows] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [deposit.user_id]);
    const user = userRows[0];
    if (!user) {
      const error = new Error('User tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    const amount = Number(deposit.amount || 0);
    const paymentType = String(deposit.payment_type || 'deposit');
    const processedAt = toMysqlDate();

    await connection.query(
      `UPDATE deposits
       SET status = 'success', external_status_response = ?, processed_at = ?, qr_data = NULL, qr_image = NULL, qr_raw = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE invoice = ? AND processed_at IS NULL AND status <> 'success'`,
      [JSON.stringify(externalResponse ?? parseDbJson(deposit.external_response, null)), processedAt, invoice],
    );
    await connection.query(
      `INSERT INTO transactions
        (invoice, ref_id, user_id, product_id, product_name, qty, price_base, price_sell, total_price, profit, status, account_data, channel, product_image, description, transaction_type, amount, processed_at)
       VALUES (?, ?, ?, NULL, ?, 1, 0, ?, ?, 0, 'success', CAST(? AS JSON), 'deposit', NULL, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        transaction_type = VALUES(transaction_type),
        amount = VALUES(amount),
        processed_at = COALESCE(processed_at, VALUES(processed_at))`,
      [
        deposit.invoice,
        deposit.invoice,
        deposit.user_id,
        paymentType === 'bot_activation' ? 'Bot WhatsApp Activation' : 'Deposit Saldo',
        amount,
        amount,
        JSON.stringify({ type: paymentType, invoice: deposit.invoice }),
        paymentType === 'bot_activation' ? 'Bot WhatsApp activation success' : 'QRIS deposit success',
        paymentType,
        amount,
        processedAt,
      ],
    );
    const wallet = await applyWalletMutationInTransaction(connection, deposit.user_id, {
      mutation_type: paymentType === 'bot_activation' ? 'bot_activation' : 'deposit',
      direction: 'in',
      amount,
      source_type: paymentType,
      source_ref: invoice,
      notes: paymentType === 'bot_activation' ? 'bot-activation-deposit-success' : 'deposit-success',
    });
    if (paymentType === 'bot_activation') {
      await applyBotActivationSuccess(connection, deposit.user_id, invoice, BOT_LOCKED_BALANCE);
    }
    await connection.query(
      `INSERT INTO activity_logs (actor_id, scope, message, metadata)
      VALUES (?, 'PAYMENT', 'Deposit success', ?)`,
      [deposit.user_id, JSON.stringify({ invoice, amount, balance_before: wallet.before, balance_after: wallet.after })],
    );

    logger('PAYMENT', { invoice, user_id: deposit.user_id, amount });
    logger('SALDO', { user_id: deposit.user_id, balance_before: wallet.before, balance_after: wallet.after });
    void notifyAdmin('deposit success', {
      user_id: deposit.user_id,
      amount,
      invoice,
      status: 'SUCCESS',
    });

    deleteCachePrefix(`dashboard:user:${deposit.user_id}`);
    deleteCachePrefix('leaderboard:');
    deleteCachePrefix('admin:summary');

    const [updatedRows] = await connection.query('SELECT * FROM deposits WHERE invoice = ? LIMIT 1', [invoice]);
    return mapDepositRow(updatedRows[0] || deposit);
  });
}

export async function updateDepositStatus(invoice, status, externalResponse = {}) {
  const normalizedStatus = normalizeDepositStatus(status);
  if (normalizedStatus === 'success') {
    return applyDepositSuccess(invoice, externalResponse);
  }

  return updateDeposit(invoice, {
    status: normalizedStatus,
    external_status_response: externalResponse,
    clear_qr: normalizedStatus !== 'pending',
  });
}

export async function refreshDepositStatus(invoice) {
  const deposit = await findDepositByInvoice(invoice);
  if (!deposit) {
    return null;
  }

  if (['success', 'failed', 'expired', 'canceled', 'payment_mismatch', 'manual_required'].includes(deposit.status)) {
    return deposit;
  }

  if (isPendingDepositStatus(deposit.status) && isExpiredAt(deposit.expired_at)) {
    let statusResponse = {};
    try {
      statusResponse = await premkuPayStatus(resolveDepositProviderInvoice(deposit));
    } catch (error) {
      statusResponse = { message: error instanceof Error ? error.message : 'Premku pay status failed before expiry lock' };
    }

    const providerStatus = normalizeDepositStatus(statusResponse);
    if (providerStatus === 'success') {
      return applyDepositSuccess(invoice, statusResponse);
    }

    try {
      await premkuCancelPay(resolveDepositProviderInvoice(deposit));
    } catch {
      // Provider cancel is best-effort; local expiry still prevents stale QR reuse.
    }

    const updated = await updateDeposit(invoice, {
      status: providerStatus === 'pending' ? 'expired' : providerStatus,
      external_status_response: statusResponse,
      canceled_at: toMysqlDate(),
      clear_qr: true,
    });
    return updated || findDepositByInvoice(invoice);
  }

  const syncCacheKey = `sync:deposit:${invoice}`;
  if (isPendingDepositStatus(deposit.status) && getCache(syncCacheKey)) {
    return deposit;
  }

  let statusResponse;
  try {
    statusResponse = await premkuPayStatus(resolveDepositProviderInvoice(deposit));
    setCache(syncCacheKey, true, 3);
  } catch (error) {
    const updated = await updateDeposit(invoice, {
      external_status_response: { message: error instanceof Error ? error.message : 'Premku pay status failed' },
    });
    return updated || findDepositByInvoice(invoice);
  }

  const nextStatus = normalizeDepositStatus(statusResponse);
  if (nextStatus === 'success') {
    return applyDepositSuccess(invoice, statusResponse);
  }

  const updated = await updateDeposit(invoice, {
    status: nextStatus === 'pending' ? 'pending_payment' : nextStatus,
    external_status_response: statusResponse,
    clear_qr: nextStatus && nextStatus !== 'pending',
  });
  return updated || findDepositByInvoice(invoice);
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
  if (!isPendingDepositStatus(deposit.status)) {
    const error = new Error('Deposit sudah terminal dan tidak bisa dibatalkan');
    error.statusCode = 409;
    throw error;
  }

  let cancelResponse = {};
  try {
    cancelResponse = await premkuCancelPay(resolveDepositProviderInvoice(deposit));
  } catch (error) {
    cancelResponse = { message: error instanceof Error ? error.message : 'Premku cancel_pay failed' };
  }

  const updated = await updateDeposit(invoice, {
    status: 'canceled',
    external_status_response: cancelResponse,
    canceled_at: toMysqlDate(),
    clear_qr: true,
  });

  await createActivityLog({
    actor_id: user.id,
    scope: 'CANCEL',
    message: 'Deposit canceled',
    metadata: { invoice },
  });
  logger('CANCEL', { invoice, user_id: user.id });
  return updated || findDepositByInvoice(invoice);
}
