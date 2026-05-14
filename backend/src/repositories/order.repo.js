import { execute, query, parseDbJson } from '../config/db.js';

function pickAccountValue(accounts, key) {
  const first = Array.isArray(accounts) ? accounts[0] : null;
  return first?.[key] || first?.[key === 'email' ? 'username' : 'pass'] || null;
}

function toOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    role: row.role,
    invoice: row.invoice,
    payment_invoice: row.payment_invoice || null,
    product_id: row.product_id || null,
    product_name: row.product_name || '',
    email_account: row.email_account || null,
    password_account: row.password_account || null,
    payment_status: row.payment_status,
    order_status: row.order_status,
    target_whatsapp: row.target_whatsapp || null,
    delivery_status: row.delivery_status || 'pending',
    delivery_time: row.delivery_time || null,
    total_price: Number(row.total_price || 0),
    raw_response: parseDbJson(row.raw_response, null),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function upsertOrderRecord(payload) {
  const accounts = payload.accounts || [];
  const email = payload.email_account ?? pickAccountValue(accounts, 'email');
  const password = payload.password_account ?? pickAccountValue(accounts, 'password');

  await execute(
    `INSERT INTO orders
      (user_id, role, invoice, payment_invoice, product_id, product_name, email_account, password_account, payment_status, order_status, target_whatsapp, delivery_status, delivery_time, total_price, raw_response)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE
      payment_status = VALUES(payment_status),
      order_status = VALUES(order_status),
      email_account = COALESCE(VALUES(email_account), email_account),
      password_account = COALESCE(VALUES(password_account), password_account),
      target_whatsapp = COALESCE(VALUES(target_whatsapp), target_whatsapp),
      delivery_status = VALUES(delivery_status),
      delivery_time = COALESCE(VALUES(delivery_time), delivery_time),
      raw_response = VALUES(raw_response),
      updated_at = CURRENT_TIMESTAMP`,
    [
      payload.user_id,
      payload.role || 'member',
      payload.invoice,
      payload.payment_invoice || null,
      payload.product_id || null,
      payload.product_name || null,
      email || null,
      password || null,
      payload.payment_status || 'success',
      payload.order_status || 'processing',
      payload.target_whatsapp || null,
      payload.delivery_status || 'pending',
      payload.delivery_time || null,
      Number(payload.total_price || 0),
      JSON.stringify(payload.raw_response ?? null),
    ],
  );

  return findOrderByInvoice(payload.invoice);
}

export async function findOrderByInvoice(invoice) {
  const rows = await query('SELECT * FROM orders WHERE invoice = ? LIMIT 1', [invoice]);
  return toOrder(rows[0] || null);
}

export async function listOrdersByUser(userId) {
  const rows = await query('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC', [Number(userId)]);
  return rows.map(toOrder);
}

export async function updateOrderDelivery(invoice, payload = {}) {
  await execute(
    `UPDATE orders
     SET delivery_status = ?, delivery_time = ?, target_whatsapp = COALESCE(?, target_whatsapp)
     WHERE invoice = ? AND delivery_status <> 'sent'`,
    [
      payload.delivery_status || 'manual_pending',
      payload.delivery_time || null,
      payload.target_whatsapp || null,
      invoice,
    ],
  );
  return findOrderByInvoice(invoice);
}
