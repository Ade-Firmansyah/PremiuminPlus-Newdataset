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
    account_number: row.account_number || '',
    account_name: row.account_name || '',
    withdraw_method: row.withdraw_method || '',
    fee: Number(row.fee || 0),
    net_amount: Number(row.net_amount || row.amount || 0),
    notes: row.notes || '',
    processed_at: row.processed_at || null,
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
    `INSERT INTO withdraws (user_id, amount, status, bank_account, account_number, account_name, withdraw_method, fee, net_amount, notes, created_at)
     VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      Number(payload.user_id),
      Number(payload.amount || 0),
      payload.bank_account || null,
      payload.account_number || null,
      payload.account_name || null,
      payload.withdraw_method || null,
      Number(payload.fee || 0),
      Number(payload.net_amount || payload.amount || 0),
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

export async function sumPendingWithdrawAmountByUser(userId) {
  const rows = await query(
    `SELECT COALESCE(SUM(amount), 0) AS pending_amount
     FROM withdraws
     WHERE user_id = ? AND status = 'pending'`,
    [Number(userId)],
  );
  return Number(rows[0]?.pending_amount || 0);
}

export async function findWithdrawById(id) {
  return toWithdraw(await getWithdrawRow(id));
}

export async function updateWithdraw(id, payload) {
  const current = await findWithdrawById(id);
  if (!current) return null;

  await execute(
    `UPDATE withdraws
     SET status = ?, bank_account = ?, account_number = ?, account_name = ?, withdraw_method = ?, fee = ?, net_amount = ?, notes = ?, processed_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      payload.status || current.status,
      payload.bank_account !== undefined ? payload.bank_account : current.bank_account,
      payload.account_number !== undefined ? payload.account_number : current.account_number,
      payload.account_name !== undefined ? payload.account_name : current.account_name,
      payload.withdraw_method !== undefined ? payload.withdraw_method : current.withdraw_method,
      payload.fee !== undefined ? Number(payload.fee || 0) : current.fee,
      payload.net_amount !== undefined ? Number(payload.net_amount || 0) : current.net_amount,
      payload.notes !== undefined ? payload.notes : current.notes,
      payload.processed_at !== undefined ? payload.processed_at : current.processed_at,
      Number(id),
    ],
  );

  return findWithdrawById(id);
}
