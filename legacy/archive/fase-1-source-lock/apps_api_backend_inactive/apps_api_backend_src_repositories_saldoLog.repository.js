async function create(connection, payload) {
  await connection.query(
    `INSERT INTO saldo_logs
       (user_id, before_saldo, after_saldo, amount, log_type, reference_table, reference_id, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.user_id,
      payload.before_saldo,
      payload.after_saldo,
      payload.amount,
      payload.log_type,
      payload.reference_table || null,
      payload.reference_id || null,
      payload.description || null
    ]
  );
}

async function listForUser(pool, userId, limit = 50, offset = 0) {
  const [rows] = await pool.query(
    `SELECT
       id,
       before_saldo,
       after_saldo,
       amount,
       log_type,
       reference_table,
       reference_id,
       description,
       created_at
     FROM saldo_logs
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
       id,
       user_id,
       before_saldo,
       after_saldo,
       amount,
       log_type,
       reference_table,
       reference_id,
       description,
       created_at
     FROM saldo_logs
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  return rows;
}

module.exports = {
  create,
  listForUser,
  listAll
};
