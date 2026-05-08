import { execute, query } from '../config/db.js';

function toWithdraw(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    username: row.username || '',
    email: row.email || '',
    amount: Number(row.amount || 0),
    status: row.status,
    bank_account: row.bank_account || '',
    notes: row.notes || '',
    created_at: row.created_at,
    updated_at: row.updated_at || null,
  };
}

async function getWithdrawRow(id) {
  const rows = await query(
    `SELECT w.*, u.username, u.email
     FROM withdraws w
     LEFT JOIN users u ON u.id = w.user_id
     WHERE w.id = ?
     LIMIT 1`,
    [Number(id)],
  );
  return rows[0] || null;
}

export async function createWithdraw(payload) {
  const result = await execute(
    `INSERT INTO withdraws (user_id, amount, status, bank_account, notes, created_at)
     VALUES (?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP)`,
    [
      Number(payload.user_id),
      Number(payload.amount || 0),
      payload.bank_account || null,
      payload.notes || null,
    ],
  );

  return findWithdrawById(result.insertId);
}

export async function listWithdraws() {
  const rows = await query(
    `SELECT w.*, u.username, u.email
     FROM withdraws w
     LEFT JOIN users u ON u.id = w.user_id
     ORDER BY w.id DESC`,
  );
  return rows.map(toWithdraw);
}

export async function listWithdrawsByUser(userId) {
  const rows = await query(
    `SELECT w.*, u.username, u.email
     FROM withdraws w
     LEFT JOIN users u ON u.id = w.user_id
     WHERE w.user_id = ?
     ORDER BY w.id DESC`,
    [Number(userId)],
  );
  return rows.map(toWithdraw);
}

export async function findWithdrawById(id) {
  return toWithdraw(await getWithdrawRow(id));
}

export async function updateWithdraw(id, payload) {
  const current = await findWithdrawById(id);
  if (!current) return null;

  await execute(
    `UPDATE withdraws
     SET status = ?, bank_account = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      payload.status || current.status,
      payload.bank_account !== undefined ? payload.bank_account : current.bank_account,
      payload.notes !== undefined ? payload.notes : current.notes,
      Number(id),
    ],
  );

  return findWithdrawById(id);
}
