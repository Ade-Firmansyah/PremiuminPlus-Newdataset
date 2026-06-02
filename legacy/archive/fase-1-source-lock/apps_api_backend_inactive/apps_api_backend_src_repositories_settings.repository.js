async function get(pool, key) {
  const [rows] = await pool.query(
    'SELECT setting_key, setting_value, value_type, is_secret FROM settings WHERE setting_key = ? LIMIT 1',
    [key]
  );
  return rows[0] || null;
}

async function upsert(pool, key, value, options = {}) {
  const valueType = options.valueType || 'string';
  const isSecret = options.isSecret ? 1 : 0;
  const description = options.description || null;

  await pool.query(
    `INSERT INTO settings (setting_key, setting_value, value_type, is_secret, description)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       setting_value = VALUES(setting_value),
       value_type = VALUES(value_type),
       is_secret = VALUES(is_secret),
       description = COALESCE(VALUES(description), description),
       updated_at = CURRENT_TIMESTAMP`,
    [key, value, valueType, isSecret, description]
  );
}

module.exports = { get, upsert };
