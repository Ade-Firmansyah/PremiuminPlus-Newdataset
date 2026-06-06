import { execute, query, parseDbJson } from '../config/db.js';

function toPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    invoice: row.invoice,
    provider_invoice: row.provider_invoice || null,
    amount: Number(row.amount || 0),
    total_bayar: Number(row.total_bayar || row.amount || 0),
    payment_type: row.payment_type || 'direct_order',
    source: row.source || 'dashboard',
    status: row.status,
    qr_image: row.qr_image || null,
    qr_raw: row.qr_raw || null,
    product_id: row.product_id || null,
    qty: Number(row.qty || 1),
    target_whatsapp: row.target_whatsapp || null,
    buyer_whatsapp: row.buyer_whatsapp || null,
    buyer_name: row.buyer_name || null,
    client_ref_id: row.client_ref_id || null,
    modal_price: Number(row.modal_price || 0),
    sell_price: Number(row.sell_price || row.amount || 0),
    reseller_profit: Number(row.reseller_profit || 0),
    order_invoice: row.order_invoice || null,
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
      (user_id, invoice, provider_invoice, amount, total_bayar, payment_type, source, status, qr_image, qr_raw, product_id, qty, target_whatsapp, buyer_whatsapp, buyer_name, client_ref_id, modal_price, sell_price, reseller_profit, raw_response, expired_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?)`,
    [
      payload.user_id,
      payload.invoice,
      payload.provider_invoice || payload.invoice,
      Number(payload.amount || 0),
      Number(payload.total_bayar || payload.amount || 0),
      payload.payment_type || 'direct_order',
      payload.source || 'dashboard',
      payload.status || 'pending',
      payload.qr_image || null,
      payload.qr_raw || null,
      payload.product_id || null,
      Number(payload.qty || 1),
      payload.target_whatsapp || null,
      payload.buyer_whatsapp || null,
      payload.buyer_name ? String(payload.buyer_name).trim().slice(0, 120) : null,
      payload.client_ref_id ? String(payload.client_ref_id).trim().slice(0, 120) : null,
      Number(payload.modal_price || 0),
      Number(payload.sell_price || payload.amount || 0),
      Number(payload.reseller_profit || 0),
      JSON.stringify(payload.raw_response ?? null),
      payload.expired_at || null,
    ],
  );
  return findPaymentByInvoice(payload.invoice);
}

export async function findPaymentByUserRef(userId, clientRefId) {
  const reference = String(clientRefId || '').trim();
  if (!reference) return null;
  const rows = await query(
    'SELECT * FROM payments WHERE user_id = ? AND client_ref_id = ? LIMIT 1',
    [Number(userId), reference],
  );
  return toPayment(rows[0] || null);
}

export async function findPaymentByInvoice(invoice) {
  const reference = String(invoice || '').trim();
  if (!reference) return null;

  const rows = await query(
    `SELECT *
     FROM payments
     WHERE invoice = ? OR provider_invoice = ?
     ORDER BY CASE WHEN invoice = ? THEN 0 ELSE 1 END, id DESC
     LIMIT 1`,
    [reference, reference, reference],
  );
  return toPayment(rows[0] || null);
}

export async function updatePayment(invoice, payload = {}) {
  const current = await findPaymentByInvoice(invoice);
  if (!current) return null;

  await execute(
    `UPDATE payments
     SET status = ?,
         provider_invoice = ?,
         status_response = CAST(? AS JSON),
         order_invoice = ?,
         processed_at = ?,
         canceled_at = ?,
         qr_image = CASE WHEN ? THEN NULL ELSE qr_image END,
         qr_raw = CASE WHEN ? THEN NULL ELSE qr_raw END,
         updated_at = CURRENT_TIMESTAMP
     WHERE invoice = ?`,
    [
      payload.status || current.status,
      payload.provider_invoice ?? current.provider_invoice ?? null,
      JSON.stringify(payload.status_response ?? current.status_response ?? null),
      payload.order_invoice ?? current.order_invoice ?? null,
      payload.processed_at ?? current.processed_at ?? null,
      payload.canceled_at ?? current.canceled_at ?? null,
      payload.clear_qr ? 1 : 0,
      payload.clear_qr ? 1 : 0,
      invoice,
    ],
  );
  return findPaymentByInvoice(invoice);
}
