async function create(connection, payload) {
  await connection.query(
    `INSERT INTO saldo_mutations
       (user_id, mutation_type, direction, amount, balance_before, balance_after,
        locked_before, locked_after, reference_table, reference_id, description, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.user_id,
      payload.mutation_type,
      payload.direction,
      payload.amount,
      payload.balance_before,
      payload.balance_after,
      payload.locked_before,
      payload.locked_after,
      payload.reference_table || null,
      payload.reference_id || null,
      payload.description || null,
      payload.metadata ? JSON.stringify(payload.metadata) : null
    ]
  );
}

async function listForUser(pool, userId, limit = 50, offset = 0) {
  const [rows] = await pool.query(
    `SELECT
       id,
       mutation_type,
       direction,
       amount,
       balance_before,
       balance_after,
       locked_before,
       locked_after,
       reference_table,
       reference_id,
       description,
       metadata,
       created_at
     FROM saldo_mutations
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
       mutation_type,
       direction,
       amount,
       balance_before,
       balance_after,
       locked_before,
       locked_after,
       reference_table,
       reference_id,
       description,
       metadata,
       created_at
     FROM saldo_mutations
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
