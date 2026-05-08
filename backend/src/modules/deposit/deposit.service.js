import { createDeposit as saveDeposit, findDepositByInvoice, updateDeposit } from '../../repositories/deposit.repo.js';
import { createActivityLog } from '../../repositories/activity.repo.js';
import { premkuCancelPay, premkuPay, premkuPayStatus } from '../../services/premku.service.js';
import { createInvoice } from '../../utils/invoice.js';
import { transaction, parseDbJson } from '../../config/db.js';
import { logger } from '../../utils/logger.js';
import { notifyAdmin } from '../../services/notification.service.js';

function toMysqlDate(value = new Date()) {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeDepositStatus(value) {
  const status = String(value || '').toLowerCase();
  if (['success', 'sukses', 'paid'].includes(status)) return 'success';
  if (['canceled', 'cancelled'].includes(status)) return 'canceled';
  if (['failed', 'fail', 'gagal', 'error'].includes(status)) return 'failed';
  if (['expired', 'expire'].includes(status)) return 'expired';
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

function resolvePremkuInvoice(payment, fallback) {
  return String(payment?.invoice ?? payment?.data?.invoice ?? payment?.ref_id ?? payment?.data?.ref_id ?? fallback);
}

function resolveExpiredAt(payment) {
  const raw = payment?.expired_at ?? payment?.expires_at ?? payment?.data?.expired_at ?? payment?.data?.expires_at ?? null;
  if (raw) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return toMysqlDate(date);
  }
  return toMysqlDate(new Date(Date.now() + 15 * 60 * 1000));
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
  const invoice = resolvePremkuInvoice(payment, createInvoice('DEP'));
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
    amount: numericAmount,
    total_bayar: Number(payment?.total_bayar ?? payment?.data?.total_bayar ?? numericAmount),
    qr_data: qrValue,
    qr_image: qrImageValue,
    expired_at: expiredAt,
    external_response: payment,
  });
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
      return mapDepositRow(deposit);
    }

    if (['canceled', 'expired', 'failed'].includes(deposit.status)) {
      return mapDepositRow(deposit);
    }

    const [userRows] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [deposit.user_id]);
    const user = userRows[0];
    if (!user) {
      const error = new Error('User tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    const amount = Number(deposit.amount || 0);
    const before = Number(user.saldo || 0);
    const after = before + amount;
    const processedAt = toMysqlDate();

    await connection.query(
      `UPDATE deposits
       SET status = 'success', external_status_response = ?, processed_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE invoice = ? AND processed_at IS NULL AND status <> 'success'`,
      [JSON.stringify(externalResponse ?? parseDbJson(deposit.external_response, null)), processedAt, invoice],
    );
    await connection.query('UPDATE users SET saldo = ? WHERE id = ?', [after, deposit.user_id]);
    await connection.query(
      `INSERT INTO transactions
        (invoice, ref_id, user_id, product_id, product_name, qty, price_base, price_sell, total_price, profit, status, account_data, channel, product_image, description, transaction_type, amount, processed_at)
       VALUES (?, ?, ?, NULL, ?, 1, 0, ?, ?, 0, 'success', CAST(? AS JSON), 'deposit', NULL, ?, 'deposit', ?, ?)
       ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        transaction_type = 'deposit',
        amount = VALUES(amount),
        processed_at = COALESCE(processed_at, VALUES(processed_at))`,
      [
        deposit.invoice,
        deposit.invoice,
        deposit.user_id,
        'Deposit Saldo',
        amount,
        amount,
        JSON.stringify({ type: 'deposit', invoice: deposit.invoice }),
        'QRIS deposit success',
        amount,
        processedAt,
      ],
    );
    await connection.query(
      `INSERT INTO saldo_logs
        (user_id, type, amount, balance_before, balance_after, reference, notes)
       VALUES (?, 'credit', ?, ?, ?, ?, ?)`,
      [deposit.user_id, amount, before, after, invoice, 'deposit-success'],
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
    void notifyAdmin('deposit success', {
      user_id: deposit.user_id,
      amount,
      invoice,
      status: 'SUCCESS',
    });

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
  });
}

export async function refreshDepositStatus(invoice) {
  const deposit = await findDepositByInvoice(invoice);
  if (!deposit) {
    return null;
  }

  if (['success', 'failed', 'expired', 'canceled'].includes(deposit.status)) {
    return deposit;
  }

  let statusResponse;
  try {
    statusResponse = await premkuPayStatus(invoice);
  } catch (error) {
    const updated = await updateDeposit(invoice, {
      external_status_response: { message: error instanceof Error ? error.message : 'Premku pay status failed' },
    });
    return updated || findDepositByInvoice(invoice);
  }

  const nextStatus = normalizeDepositStatus(statusResponse?.pay_status ?? statusResponse?.status ?? statusResponse?.data?.status);
  if (nextStatus === 'success') {
    return applyDepositSuccess(invoice, statusResponse);
  }

  const updated = await updateDeposit(invoice, {
    status: nextStatus || 'pending',
    external_status_response: statusResponse,
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

  let cancelResponse = {};
  try {
    cancelResponse = await premkuCancelPay(invoice);
  } catch (error) {
    cancelResponse = { message: error instanceof Error ? error.message : 'Premku cancel_pay failed' };
  }

  const updated = await updateDeposit(invoice, {
    status: 'canceled',
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
  return updated || findDepositByInvoice(invoice);
}
