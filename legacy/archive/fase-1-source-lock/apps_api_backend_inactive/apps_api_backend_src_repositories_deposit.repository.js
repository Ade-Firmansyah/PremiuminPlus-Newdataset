async function create(pool, payload) {
  const [result] = await pool.query(
    `INSERT INTO deposits
       (invoice, user_id, amount, total_bayar, payment_type, status, qr_image, qr_raw, expired_at)
     VALUES (?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?)`,
    [
      payload.invoice,
      payload.user_id,
      payload.amount,
      payload.total_bayar,
      payload.payment_type,
      payload.qr_image || null,
      payload.qr_raw || null,
      payload.expired_at || null
    ]
  );

  return result.insertId;
}

async function findByInvoice(poolOrConnection, invoice) {
  const [rows] = await poolOrConnection.query(
    `SELECT *
     FROM deposits
     WHERE invoice = ?
     LIMIT 1`,
    [invoice]
  );

  return rows[0] || null;
}

async function findByInvoiceForUpdate(connection, invoice) {
  const [rows] = await connection.query(
    `SELECT *
     FROM deposits
     WHERE invoice = ?
     LIMIT 1
     FOR UPDATE`,
    [invoice]
  );

  return rows[0] || null;
}

async function markPaymentSuccess(connection, invoice) {
  await connection.query(
    `UPDATE deposits
     SET status = 'payment_success',
         processed_at = COALESCE(processed_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
     WHERE invoice = ?`,
    [invoice]
  );
}

async function listForUser(pool, userId, limit = 50, offset = 0) {
  const [rows] = await pool.query(
    `SELECT
       invoice, amount, total_bayar, payment_type, status, qr_image, qr_raw,
       processed_at, expired_at, canceled_at, created_at, updated_at
     FROM deposits
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );

  return rows;
}

async function listAll(pool, limit = 50, offset = 0) {
  const [rows] = await pool.query(
    `SELECT
       invoice, user_id, amount, total_bayar, payment_type, status, qr_image, qr_raw,
       processed_at, expired_at, canceled_at, created_at, updated_at
     FROM deposits
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  return rows;
}

module.exports = {
  create,
  findByInvoice,
  findByInvoiceForUpdate,
  markPaymentSuccess,
  listForUser,
  listAll
};
