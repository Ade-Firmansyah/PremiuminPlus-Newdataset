function safeCredential(order) {
  const canShowCredential = order.order_status === 'provider_success' || order.order_status === 'credential_delivery';
  return {
    ...order,
    email_account: canShowCredential ? order.email_account : null,
    password_account: canShowCredential ? order.password_account : null
  };
}

async function findByInvoice(poolOrConnection, invoice) {
  const [rows] = await poolOrConnection.query(
    `SELECT
       id,
       invoice,
       user_id,
       product_id,
       payment_invoice,
       product_name,
       email_account,
       password_account,
       payment_status,
       order_status,
       target_whatsapp,
       delivery_status,
       delivery_time,
       raw_response,
       created_at,
       updated_at
     FROM orders
     WHERE invoice = ?
     LIMIT 1`,
    [invoice]
  );

  return rows[0] ? safeCredential(rows[0]) : null;
}

async function findByInvoiceForUpdate(connection, invoice) {
  const [rows] = await connection.query(
    'SELECT * FROM orders WHERE invoice = ? LIMIT 1 FOR UPDATE',
    [invoice]
  );
  return rows[0] || null;
}

async function createPending(connection, payload) {
  await connection.query(
    `INSERT INTO orders
       (invoice, user_id, product_id, payment_invoice, product_name, payment_status,
        order_status, target_whatsapp, delivery_status, raw_response)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.invoice,
      payload.user_id,
      payload.product_id,
      payload.payment_invoice || null,
      payload.product_name,
      payload.payment_status,
      payload.order_status,
      payload.target_whatsapp || null,
      payload.delivery_status || 'pending',
      payload.raw_response ? JSON.stringify(payload.raw_response) : null
    ]
  );
}

async function updateProviderResult(connection, invoice, payload) {
  await connection.query(
    `UPDATE orders
     SET product_name = COALESCE(?, product_name),
         email_account = ?,
         password_account = ?,
         payment_status = ?,
         order_status = ?,
         raw_response = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE invoice = ?`,
    [
      payload.product_name || null,
      payload.email_account || null,
      payload.password_account || null,
      payload.payment_status,
      payload.order_status,
      payload.raw_response ? JSON.stringify(payload.raw_response) : null,
      invoice
    ]
  );
}

async function updateDeliveryStatus(connection, invoice, deliveryStatus) {
  await connection.query(
    `UPDATE orders
     SET delivery_status = ?,
         delivery_time = CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE delivery_time END,
         updated_at = CURRENT_TIMESTAMP
     WHERE invoice = ?
       AND delivery_status <> 'sent'`,
    [deliveryStatus, deliveryStatus, invoice]
  );
}

async function listForUser(pool, userId, limit = 50, offset = 0) {
  const [rows] = await pool.query(
    `SELECT
       invoice,
       product_name,
       payment_status,
       order_status,
       delivery_status,
       email_account,
       password_account,
       created_at
     FROM orders
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );

  return rows.map(safeCredential);
}

async function listAll(pool, limit = 50, offset = 0) {
  const [rows] = await pool.query(
    `SELECT
       invoice,
       user_id,
       product_name,
       payment_status,
       order_status,
       delivery_status,
       email_account,
       password_account,
       created_at
     FROM orders
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  return rows.map(safeCredential);
}

module.exports = {
  safeCredential,
  findByInvoice,
  findByInvoiceForUpdate,
  createPending,
  updateProviderResult,
  updateDeliveryStatus,
  listForUser,
  listAll
};
