import { execute, query, parseDbJson } from '../config/db.js';
import env from '../config/env.js';

function toActivity(row) {
  if (!row) return null;
  return {
    id: row.id,
    actor_id: row.actor_id || row.user_id || null,
    user_id: row.user_id || row.actor_id || null,
    scope: row.scope,
    message: row.message,
    activity: row.activity || row.message,
    ip_address: row.ip_address || '',
    metadata: parseDbJson(row.metadata, null),
    created_at: row.created_at,
  };
}

export async function createActivityLog({ actor_id = null, scope = 'SYSTEM', message, metadata = null, ip_address = null }) {
  await execute(
    `INSERT INTO activity_logs (actor_id, user_id, scope, message, activity, ip_address, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [actor_id, actor_id, scope, message, message, ip_address, JSON.stringify(metadata ?? null)],
  );
}

export async function safeCreateActivityLog(payload) {
  try {
    await createActivityLog(payload);
  } catch (error) {
    if (env.VERBOSE_SYSTEM_LOGS) {
      console.warn('[ERROR]', {
        message: 'Activity log skipped',
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }
}

export async function listActivityLogs(limit = 50) {
  const rows = await query('SELECT * FROM activity_logs ORDER BY id DESC LIMIT ?', [Number(limit)]);
  return rows.map(toActivity);
}
