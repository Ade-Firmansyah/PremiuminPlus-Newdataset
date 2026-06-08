import { execute, query, parseDbJson } from '../config/db.js';
import { decryptString, encryptString } from '../utils/password.js';

function pickAccountValue(accounts, key) {
  const first = Array.isArray(accounts) ? accounts[0] : null;
  return first?.[key] || first?.[key === 'email' ? 'username' : 'pass'] || null;
}

function toOrder(row) {
  if (!row) return null;
  const manualEmail = row.manual_email ? decryptString(row.manual_email) : null;
  const manualPassword = row.manual_password ? decryptString(row.manual_password) : null;
  const accountData = manualEmail || manualPassword
    ? { email: manualEmail, password: manualPassword, note: row.manual_note || null }
    : row.email_account || row.password_account
      ? { email: row.email_account, password: row.password_account }
      : null;

  return {
    id: row.id,
    user_id: row.user_id,
    role: row.role,
    invoice: row.invoice,
    payment_invoice: row.payment_invoice || null,
    product_id: row.product_id || null,
    product_name: row.product_name || '',
    product_image: row.product_image || null,
    product_price: Number(row.product_price || row.total_price || 0),
    product_tutorial_url: row.product_tutorial_url || null,
    email_account: row.email_account || null,
    password_account: row.password_account || null,
    manual_email: manualEmail,
    manual_password: manualPassword,
    manual_note: row.manual_note || null,
    fulfilled_by_admin_id: row.fulfilled_by_admin_id || null,
    fulfilled_at: row.fulfilled_at || null,
    fulfillment_type: row.fulfillment_type || 'provider_auto',
    retry_count: Number(row.retry_count || 0),
    payment_status: row.payment_status,
    provider_invoice: row.provider_invoice || null,
    provider_status: row.provider_status || row.order_status || 'pending',
    order_status: row.order_status,
    target_whatsapp: row.target_whatsapp || null,
    delivery_status: row.delivery_status || 'pending',
    delivery_time: row.delivery_time || null,
    total_price: Number(row.total_price || 0),
    raw_response: parseDbJson(row.raw_response, null),
    processing_started_at: row.processing_started_at || null,
    success_at: row.success_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    account_data: accountData,
    username: row.username || null,
  };
}

export async function upsertOrderRecord(payload) {
  const accounts = payload.accounts || [];
  const email = payload.email_account ?? pickAccountValue(accounts, 'email');
  const password = payload.password_account ?? pickAccountValue(accounts, 'password');
  const manualEmail = payload.manual_email ? encryptString(payload.manual_email) : null;
  const manualPassword = payload.manual_password ? encryptString(payload.manual_password) : null;

  await execute(
    `INSERT INTO orders
      (user_id, role, invoice, payment_invoice, product_id, product_name, product_image, product_price, product_tutorial_url, email_account, password_account, manual_email, manual_password, manual_note, fulfilled_by_admin_id, fulfilled_at, fulfillment_type, retry_count, payment_status, provider_invoice, provider_status, order_status, target_whatsapp, delivery_status, delivery_time, total_price, raw_response, processing_started_at, success_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      payment_status = VALUES(payment_status),
      product_image = COALESCE(NULLIF(VALUES(product_image), ''), product_image),
      product_price = CASE WHEN VALUES(product_price) > 0 THEN VALUES(product_price) ELSE product_price END,
      product_tutorial_url = COALESCE(NULLIF(VALUES(product_tutorial_url), ''), product_tutorial_url),
      provider_invoice = COALESCE(VALUES(provider_invoice), provider_invoice),
      provider_status = VALUES(provider_status),
      order_status = VALUES(order_status),
      fulfillment_type = COALESCE(VALUES(fulfillment_type), fulfillment_type),
      retry_count = COALESCE(VALUES(retry_count), retry_count),
      email_account = COALESCE(VALUES(email_account), email_account),
      password_account = COALESCE(VALUES(password_account), password_account),
      manual_email = COALESCE(VALUES(manual_email), manual_email),
      manual_password = COALESCE(VALUES(manual_password), manual_password),
      manual_note = COALESCE(VALUES(manual_note), manual_note),
      fulfilled_by_admin_id = COALESCE(VALUES(fulfilled_by_admin_id), fulfilled_by_admin_id),
      fulfilled_at = COALESCE(VALUES(fulfilled_at), fulfilled_at),
      target_whatsapp = COALESCE(VALUES(target_whatsapp), target_whatsapp),
      delivery_status = VALUES(delivery_status),
      delivery_time = COALESCE(VALUES(delivery_time), delivery_time),
      processing_started_at = COALESCE(processing_started_at, VALUES(processing_started_at)),
      success_at = COALESCE(success_at, VALUES(success_at)),
      raw_response = VALUES(raw_response),
      updated_at = CURRENT_TIMESTAMP`,
    [
      payload.user_id,
      payload.role || 'reseller',
      payload.invoice,
      payload.payment_invoice || null,
      payload.product_id || null,
      payload.product_name || null,
      payload.product_image || null,
      Number(payload.product_price || payload.total_price || 0),
      payload.product_tutorial_url || null,
      email || null,
      password || null,
      manualEmail,
      manualPassword,
      payload.manual_note || null,
      payload.fulfilled_by_admin_id || null,
      payload.fulfilled_at || null,
      payload.fulfillment_type || 'provider_auto',
      Number(payload.retry_count || 0),
      payload.payment_status || 'success',
      payload.provider_invoice || null,
      payload.provider_status || payload.order_status || 'pending',
      payload.order_status || 'processing',
      payload.target_whatsapp || null,
      payload.delivery_status || 'pending',
      payload.delivery_time || null,
      Number(payload.total_price || 0),
      JSON.stringify(payload.raw_response ?? null),
      payload.processing_started_at || null,
      payload.success_at || null,
    ],
  );

  return findOrderByInvoice(payload.invoice);
}

export async function updateOrderProviderStatus(invoice, payload = {}) {
  await execute(
    `UPDATE orders
     SET provider_status = ?, order_status = ?, raw_response = CAST(? AS JSON), success_at = COALESCE(?, success_at), updated_at = CURRENT_TIMESTAMP
     WHERE invoice = ?`,
    [
      payload.provider_status || payload.order_status || 'processing',
      payload.order_status || 'processing',
      JSON.stringify(payload.raw_response ?? null),
      payload.success_at || null,
      invoice,
    ],
  );
  return findOrderByInvoice(invoice);
}

export async function findOrderByInvoice(invoice) {
  const rows = await query('SELECT * FROM orders WHERE invoice = ? LIMIT 1', [invoice]);
  return toOrder(rows[0] || null);
}

export async function listPendingOrders() {
  const rows = await query(
    `SELECT o.*, u.username
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     WHERE o.order_status IN ('pending_manual','waiting_provider','provider_processing','manual_required')
        OR o.payment_status = 'pending'
     ORDER BY o.id DESC
     LIMIT 100`,
  );
  return rows.map(toOrder);
}

export async function updateOrderStatusByInvoice(invoice, payload = {}) {
  const updates = [];
  const values = [];

  if (payload.payment_status !== undefined) {
    updates.push('payment_status = ?');
    values.push(payload.payment_status);
  }
  if (payload.provider_status !== undefined) {
    updates.push('provider_status = ?');
    values.push(payload.provider_status);
  }
  if (payload.order_status !== undefined) {
    updates.push('order_status = ?');
    values.push(payload.order_status);
  }
  if (payload.fulfillment_type !== undefined) {
    updates.push('fulfillment_type = ?');
    values.push(payload.fulfillment_type);
  }
  if (payload.manual_email !== undefined) {
    updates.push('manual_email = ?');
    values.push(payload.manual_email ? encryptString(payload.manual_email) : null);
  }
  if (payload.manual_password !== undefined) {
    updates.push('manual_password = ?');
    values.push(payload.manual_password ? encryptString(payload.manual_password) : null);
  }
  if (payload.manual_note !== undefined) {
    updates.push('manual_note = ?');
    values.push(payload.manual_note || null);
  }
  if (payload.fulfilled_by_admin_id !== undefined) {
    updates.push('fulfilled_by_admin_id = ?');
    values.push(payload.fulfilled_by_admin_id || null);
  }
  if (payload.fulfilled_at !== undefined) {
    updates.push('fulfilled_at = ?');
    values.push(payload.fulfilled_at || null);
  }
  if (payload.retry_count !== undefined) {
    updates.push('retry_count = ?');
    values.push(Number(payload.retry_count || 0));
  }
  if (payload.raw_response !== undefined) {
    updates.push('raw_response = CAST(? AS JSON)');
    values.push(JSON.stringify(payload.raw_response ?? null));
  }

  if (!updates.length) {
    return findOrderByInvoice(invoice);
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  await execute(`UPDATE orders SET ${updates.join(', ')} WHERE invoice = ?`, [...values, invoice]);
  return findOrderByInvoice(invoice);
}

export async function incrementOrderRetryCount(invoice) {
  await execute(
    `UPDATE orders
     SET retry_count = retry_count + 1,
         fulfillment_type = 'retry',
         updated_at = CURRENT_TIMESTAMP
     WHERE invoice = ?`,
    [invoice],
  );
  return findOrderByInvoice(invoice);
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
