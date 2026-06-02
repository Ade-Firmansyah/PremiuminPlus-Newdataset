async function create(pool, payload) {
  await pool.query(
    `INSERT INTO activity_logs
       (user_id, actor_role, action, entity_type, entity_id, ip_address, user_agent, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.user_id || null,
      payload.actor_role || null,
      payload.action,
      payload.entity_type || null,
      payload.entity_id || null,
      payload.ip_address || null,
      payload.user_agent || null,
      payload.metadata ? JSON.stringify(payload.metadata) : null
    ]
  );
}

module.exports = { create };
