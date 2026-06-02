import { execute } from '../config/db.js';
import { logger } from '../utils/logger.js';

export async function createAdminLog({ admin_id = null, action, target_type = null, target_id = null, ip_address = null, metadata = null }) {
  await execute(
    `INSERT INTO admin_logs (admin_id, action, target_type, target_id, ip_address, metadata)
     VALUES (?, ?, ?, ?, ?, CAST(? AS JSON))`,
    [
      admin_id || null,
      String(action || '').slice(0, 80),
      target_type ? String(target_type).slice(0, 80) : null,
      target_id ? String(target_id).slice(0, 120) : null,
      ip_address ? String(ip_address).slice(0, 64) : null,
      JSON.stringify(metadata ?? null),
    ],
  );
}

export async function safeCreateAdminLog(payload) {
  try {
    await createAdminLog(payload);
  } catch (error) {
    logger('BACKEND', {
      event: 'admin-log-skipped',
      error: error instanceof Error ? error.message : 'unknown error',
    });
  }
}
