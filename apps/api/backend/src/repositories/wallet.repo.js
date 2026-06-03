import { execute, query, parseDbJson } from '../config/db.js';

function toLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type || row.log_type || 'adjustment',
    amount: Number(row.amount || 0),
    balance_before: Number(row.balance_before ?? row.before_saldo ?? 0),
    balance_after: Number(row.balance_after ?? row.after_saldo ?? 0),
    reference: row.reference || row.reference_id || '',
    notes: row.notes || row.description || '',
    created_at: row.created_at,
  };
}

export async function createSaldoLog(payload) {
  const type = payload.type || payload.log_type || 'adjustment';
  const before = Number(payload.balance_before ?? payload.before_saldo ?? 0);
  const after = Number(payload.balance_after ?? payload.after_saldo ?? 0);
  const reference = payload.reference || payload.reference_id || null;
  const notes = payload.notes || payload.description || null;

  await execute(
    `INSERT INTO saldo_logs
      (user_id, type, log_type, amount, balance_before, balance_after, before_saldo, after_saldo, reference, notes, reference_table, reference_id, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.user_id,
      type,
      type,
      Number(payload.amount || 0),
      before,
      after,
      before,
      after,
      reference,
      notes,
      payload.reference_table || null,
      reference,
      notes,
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
