async function create(connection, payload) {
  await connection.query(
    `INSERT INTO transactions
       (invoice, user_id, transaction_type, amount, direction, status, reference_table, reference_id, description, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.invoice,
      payload.user_id,
      payload.transaction_type,
      payload.amount,
      payload.direction,
      payload.status,
      payload.reference_table || null,
      payload.reference_id || null,
      payload.description || null,
      payload.metadata ? JSON.stringify(payload.metadata) : null
    ]
  );
}

module.exports = { create };
