async function create(pool, payload) {
  await pool.query(
    `INSERT INTO withdraws
       (invoice, user_id, amount, fee, status, bank_name, account_number, account_name, admin_note)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    [
      payload.invoice,
      payload.user_id,
      payload.amount,
      payload.fee || 0,
      payload.bank_name || null,
      payload.account_number || null,
      payload.account_name || null,
      payload.admin_note || null
    ]
  );
}

async function findByIdForUpdate(connection, id) {
  const [rows] = await connection.query(
    'SELECT * FROM withdraws WHERE id = ? LIMIT 1 FOR UPDATE',
    [id]
  );
  return rows[0] || null;
}

async function listForUser(pool, userId, limit = 50, offset = 0) {
  const [rows] = await pool.query(
    `SELECT *
     FROM withdraws
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );
  return rows;
}

async function listAll(pool, limit = 50, offset = 0) {
  const [rows] = await pool.query(
    `SELECT *
     FROM withdraws
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return rows;
}

async function markApproved(connection, id) {
  await connection.query(
    `UPDATE withdraws
     SET status = 'approved',
         approved_at = CURRENT_TIMESTAMP,
         processed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [id]
  );
}

async function markRejected(connection, id, adminNote) {
  await connection.query(
    `UPDATE withdraws
     SET status = 'rejected',
         rejected_at = CURRENT_TIMESTAMP,
         processed_at = CURRENT_TIMESTAMP,
         admin_note = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [adminNote || null, id]
  );
}

module.exports = {
  create,
  findByIdForUpdate,
  listForUser,
  listAll,
  markApproved,
  markRejected
};
