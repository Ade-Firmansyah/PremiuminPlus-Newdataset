import { execute, query, parseDbJson } from '../config/db.js';

function toLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    amount: Number(row.amount || 0),
    balance_before: Number(row.balance_before || 0),
    balance_after: Number(row.balance_after || 0),
    reference: row.reference || '',
    notes: row.notes || '',
    created_at: row.created_at,
  };
}

export async function createSaldoLog(payload) {
  await execute(
    `INSERT INTO saldo_logs
      (user_id, type, amount, balance_before, balance_after, reference, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.user_id,
      payload.type,
      Number(payload.amount || 0),
      Number(payload.balance_before || 0),
      Number(payload.balance_after || 0),
      payload.reference || null,
      payload.notes || null,
    ],
  );
  const rows = await query('SELECT * FROM saldo_logs WHERE user_id = ? ORDER BY id DESC LIMIT 1', [Number(payload.user_id)]);
  return toLog(rows[0] || null);
}

export async function listSaldoLogs() {
  const rows = await query('SELECT * FROM saldo_logs ORDER BY id DESC');
  return rows.map(toLog);
}

export async function listSaldoLogsByUser(userId) {
  const rows = await query('SELECT * FROM saldo_logs WHERE user_id = ? ORDER BY id DESC', [Number(userId)]);
  return rows.map(toLog);
}
