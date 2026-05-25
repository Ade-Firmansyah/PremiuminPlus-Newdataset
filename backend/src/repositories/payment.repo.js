import { execute, query, parseDbJson } from '../config/db.js';

function toPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    invoice: row.invoice,
    amount: Number(row.amount || 0),
    total_bayar: Number(row.total_bayar || row.amount || 0),
    payment_type: row.payment_type || 'direct_order',
    status: row.status,
    qr_image: null,
    qr_raw: null,
    product_id: row.product_id || null,
    qty: Number(row.qty || 1),
    target_whatsapp: row.target_whatsapp || null,
    role_price: Number(row.role_price || 0),
    bot_markup: Number(row.bot_markup || 0),
    final_price: Number(row.final_price || row.amount || 0),
    order_invoice: row.order_invoice || null,
    reserved_manual_account_id: row.reserved_manual_account_id || null,
    raw_response: parseDbJson(row.raw_response, null),
    status_response: parseDbJson(row.status_response, null),
    processed_at: row.processed_at || null,
    expired_at: row.expired_at || null,
    canceled_at: row.canceled_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createPayment(payload) {
  await execute(
    `INSERT INTO payments
      (user_id, invoice, amount, total_bayar, payment_type, status, qr_image, qr_raw, product_id, qty, target_whatsapp, role_price, bot_markup, final_price, reserved_manual_account_id, raw_response, expired_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?)`,
    [
      payload.user_id,
      payload.invoice,
      Number(payload.amount || 0),
      Number(payload.total_bayar || payload.amount || 0),
      payload.payment_type || 'direct_order',
      payload.status || 'pending',
      null,
      null,
      payload.product_id || null,
      Number(payload.qty || 1),
      payload.target_whatsapp || null,
      Number(payload.role_price || 0),
      Number(payload.bot_markup || 0),
      Number(payload.final_price || payload.amount || 0),
      payload.reserved_manual_account_id || null,
      JSON.stringify(payload.raw_response ?? null),
      payload.expired_at || null,
    ],
  );
  return findPaymentByInvoice(payload.invoice);
}

export async function findPaymentByInvoice(invoice) {
  const rows = await query(
    `SELECT id, user_id, invoice, amount, total_bayar, payment_type, status, qr_image, qr_raw, product_id, qty,
            target_whatsapp, role_price, bot_markup, final_price, order_invoice, reserved_manual_account_id,
            raw_response, status_response, processed_at, expired_at, canceled_at, created_at, updated_at
     FROM payments WHERE invoice = ? LIMIT 1`,
    [invoice],
  );
  return toPayment(rows[0] || null);
}

export async function updatePayment(invoice, payload = {}) {
  const current = await findPaymentByInvoice(invoice);
  if (!current) return null;

  await execute(
    `UPDATE payments
     SET status = ?, qr_image = NULL, qr_raw = NULL, status_response = CAST(? AS JSON), order_invoice = ?, processed_at = ?, expired_at = ?, canceled_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE invoice = ?`,
    [
      payload.status || current.status,
      JSON.stringify(payload.status_response ?? current.status_response ?? null),
      payload.order_invoice ?? current.order_invoice ?? null,
      payload.processed_at ?? current.processed_at ?? null,
      payload.expired_at ?? current.expired_at ?? null,
      payload.canceled_at ?? current.canceled_at ?? null,
      invoice,
    ],
  );
  return findPaymentByInvoice(invoice);
}
