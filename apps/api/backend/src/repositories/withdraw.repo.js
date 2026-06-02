import { execute, query } from '../config/db.js';

function createWithdrawInvoice() {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `WD${Date.now()}${suffix}`;
}

function toWithdraw(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    username: row.username || '',
    email: row.email || '',
    amount: Number(row.amount || 0),
    status: row.status,
    invoice: row.invoice || '',
    bank_account: row.bank_account || '',
    bank_name: row.bank_name || '',
    method: row.bank_name || '',
    account_number: row.account_number || '',
    account_name: row.account_name || '',
    admin_note: row.admin_note || '',
    notes: row.notes || '',
    approved_at: row.approved_at || null,
    rejected_at: row.rejected_at || null,
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
  const invoice = payload.invoice || createWithdrawInvoice();
  const result = await execute(
    `INSERT INTO withdraws
       (invoice, user_id, amount, status, bank_account, bank_name, account_number, account_name, notes, created_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      invoice,
      Number(payload.user_id),
      Number(payload.amount || 0),
      payload.bank_account || null,
      payload.bank_name || payload.method || null,
      payload.account_number || null,
      payload.account_name || null,
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
     SET status = ?,
         bank_account = ?,
         bank_name = ?,
         account_number = ?,
         account_name = ?,
         notes = ?,
         admin_note = ?,
         approved_at = CASE WHEN ? = 'approved' THEN COALESCE(approved_at, CURRENT_TIMESTAMP) ELSE approved_at END,
         rejected_at = CASE WHEN ? IN ('rejected', 'canceled', 'cancelled') THEN COALESCE(rejected_at, CURRENT_TIMESTAMP) ELSE rejected_at END,
         processed_at = CASE WHEN ? <> 'pending' THEN COALESCE(processed_at, CURRENT_TIMESTAMP) ELSE processed_at END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      payload.status || current.status,
      payload.bank_account !== undefined ? payload.bank_account : current.bank_account,
      payload.bank_name !== undefined ? payload.bank_name : current.bank_name,
      payload.account_number !== undefined ? payload.account_number : current.account_number,
      payload.account_name !== undefined ? payload.account_name : current.account_name,
      payload.notes !== undefined ? payload.notes : current.notes,
      payload.admin_note !== undefined ? payload.admin_note : current.admin_note,
      payload.status || current.status,
      payload.status || current.status,
      payload.status || current.status,
      Number(id),
    ],
  );

  return findWithdrawById(id);
}
