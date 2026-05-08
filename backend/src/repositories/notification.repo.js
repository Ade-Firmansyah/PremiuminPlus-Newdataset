import { execute, query } from '../config/db.js';

function toNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    type: row.type || 'broadcast',
    is_active: Boolean(row.is_active ?? true),
    is_pinned: Boolean(row.is_pinned ?? false),
    target_role: row.target_role,
    created_by: row.created_by || null,
    created_at: row.created_at,
  };
}

export async function listNotificationsForRole(role) {
  const rows = await query(
    `SELECT *
     FROM notifications
     WHERE is_active = 1 AND (target_role = 'all' OR target_role = ?)
     ORDER BY is_pinned DESC, id DESC
     LIMIT 20`,
    [role],
  );
  return rows.map(toNotification);
}

export async function listNotifications() {
  const rows = await query('SELECT * FROM notifications ORDER BY is_pinned DESC, id DESC LIMIT 100');
  return rows.map(toNotification);
}

export async function createNotification(payload) {
  const result = await execute(
    `INSERT INTO notifications (title, message, type, is_active, is_pinned, target_role, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.title,
      payload.message,
      payload.type || 'broadcast',
      payload.is_active === undefined ? 1 : Number(Boolean(payload.is_active)),
      payload.is_pinned === undefined ? 0 : Number(Boolean(payload.is_pinned)),
      payload.target_role || 'all',
      payload.created_by || null,
    ],
  );

  const rows = await query('SELECT * FROM notifications WHERE id = ? LIMIT 1', [result.insertId]);
  return toNotification(rows[0] || null);
}

export async function updateNotification(id, payload = {}) {
  const currentRows = await query('SELECT * FROM notifications WHERE id = ? LIMIT 1', [Number(id)]);
  const current = currentRows[0];
  if (!current) return null;

  await execute(
    `UPDATE notifications
     SET title = ?, message = ?, type = ?, is_active = ?, is_pinned = ?, target_role = ?
     WHERE id = ?`,
    [
      payload.title !== undefined ? String(payload.title).trim() : current.title,
      payload.message !== undefined ? String(payload.message).trim() : current.message,
      payload.type !== undefined ? String(payload.type || 'broadcast').trim() : current.type || 'broadcast',
      payload.is_active !== undefined ? Number(Boolean(payload.is_active)) : Number(current.is_active ?? 1),
      payload.is_pinned !== undefined ? Number(Boolean(payload.is_pinned)) : Number(current.is_pinned ?? 0),
      payload.target_role !== undefined ? payload.target_role : current.target_role,
      Number(id),
    ],
  );

  const rows = await query('SELECT * FROM notifications WHERE id = ? LIMIT 1', [Number(id)]);
  return toNotification(rows[0] || null);
}

export async function deleteNotification(id) {
  const rows = await query('SELECT * FROM notifications WHERE id = ? LIMIT 1', [Number(id)]);
  const current = rows[0];
  if (!current) return null;
  await execute('DELETE FROM notifications WHERE id = ?', [Number(id)]);
  return toNotification(current);
}
