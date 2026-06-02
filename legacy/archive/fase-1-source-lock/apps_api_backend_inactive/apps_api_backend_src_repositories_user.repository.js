async function findByLoginIdentity(pool, identity) {
  const [rows] = await pool.query(
    `SELECT
       id,
       username,
       email,
       phone,
       password_hash,
       role,
       saldo,
       locked_balance,
       bot_access_unlocked,
       bot_disabled_reason,
       api_key,
       reseller_request_status,
       created_at,
       updated_at
     FROM users
     WHERE username = ? OR email = ?
     LIMIT 1`,
    [identity, identity]
  );

  return rows[0] || null;
}

async function updateApiKey(pool, userId, apiKey) {
  await pool.query(
    `UPDATE users
     SET api_key = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [apiKey, userId]
  );
}

async function findByIdForUpdate(connection, userId) {
  const [rows] = await connection.query(
    `SELECT
       id,
       username,
       role,
       saldo,
       locked_balance,
       bot_access_unlocked,
       bot_disabled_reason
     FROM users
     WHERE id = ?
     FOR UPDATE`,
    [userId]
  );

  return rows[0] || null;
}

async function findById(pool, userId) {
  const [rows] = await pool.query(
    `SELECT
       id,
       username,
       role,
       saldo,
       locked_balance,
       bot_access_unlocked,
       bot_disabled_reason
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

async function updateSaldo(connection, userId, saldo) {
  await connection.query(
    'UPDATE users SET saldo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [saldo, userId]
  );
}

async function disableBotAccess(connection, userId, reason) {
  await connection.query(
    `UPDATE users
     SET bot_access_unlocked = 0,
         bot_disabled_reason = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [reason, userId]
  );
}

module.exports = {
  findByLoginIdentity,
  findById,
  findByIdForUpdate,
  updateApiKey,
  updateSaldo,
  disableBotAccess
};
