import { execute, query, parseDbJson } from '../config/db.js';

function toLog(row) {
  if (!row) return null;
  const mutationType = row.mutation_type || '';
  const direction = resolveDirection(row);
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type || directionToLegacyType(direction),
    mutation_type: mutationType,
    direction,
    category: resolveCategory(row),
    amount: Number(row.amount || 0),
    signed_amount: direction === 'out' ? -Number(row.amount || 0) : Number(row.amount || 0),
    balance_before: Number(row.balance_before || 0),
    balance_after: Number(row.balance_after || 0),
    reference: row.reference || '',
    notes: row.notes || buildMutationNotes(row),
    created_at: row.created_at,
  };
}

function resolveDirection(row = {}) {
  const type = String(row.mutation_type || row.type || '').toLowerCase();
  if (['deposit', 'payment_in', 'refund'].includes(type)) return 'in';
  if (['provider_purchase', 'order', 'withdraw', 'bot_activation'].includes(type)) return 'out';
  if (['profit_income', 'bot_profit'].includes(type)) return 'profit';
  if (type === 'adjustment') {
    return Number(row.balance_after || 0) >= Number(row.balance_before || 0) ? 'in' : 'out';
  }
  return Number(row.balance_after || 0) >= Number(row.balance_before || 0) ? 'in' : 'out';
}

function resolveCategory(row = {}) {
  const type = String(row.mutation_type || row.type || '').toLowerCase();
  if (['profit_income', 'bot_profit'].includes(type)) return 'profit';
  if (['deposit', 'payment_in', 'refund'].includes(type)) return 'income';
  if (['provider_purchase', 'order', 'withdraw'].includes(type)) return 'expense';
  return 'other';
}

function directionToLegacyType(direction) {
  if (direction === 'out') return 'debit';
  if (direction === 'profit') return 'credit';
  return 'credit';
}

function buildMutationNotes(row = {}) {
  const type = String(row.mutation_type || '').toLowerCase();
  const product = row.product_name ? `: ${row.product_name}` : '';
  if (type === 'payment_in') return `Saldo masuk dari pembayaran customer ${row.reference || ''}`.trim();
  if (type === 'deposit') return `Deposit saldo ${row.reference || ''}`.trim();
  if (type === 'provider_purchase') return `Modal provider${product} ${row.reference || ''}`.trim();
  if (type === 'order') return `Order produk${product} ${row.reference || ''}`.trim();
  if (type === 'withdraw') return `Penarikan saldo ${row.reference || ''}`.trim();
  if (['profit_income', 'bot_profit'].includes(type)) return `Pendapatan margin${product} ${row.reference || ''}`.trim();
  if (type === 'refund') return `Refund saldo ${row.reference || ''}`.trim();
  return row.reference || 'Mutasi saldo';
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
  const rows = await query(
    `SELECT
      s.id,
      s.user_id,
      s.mutation_type,
      s.amount,
      s.balance_before,
      s.balance_after,
      s.reference,
      s.created_at,
      t.product_name,
      t.qty,
      t.channel,
      t.provider_cost,
      t.user_profit,
      t.final_amount,
      t.payment_amount
     FROM saldo_mutations s
     LEFT JOIN transactions t ON t.invoice = s.reference
     WHERE s.user_id = ?
     ORDER BY s.id DESC
     LIMIT 500`,
    [Number(userId)],
  );
  return rows.map(toLog);
}

export async function getSaldoMutationSummaryByUser(userId) {
  const rows = await query(
    `SELECT
      COALESCE(SUM(CASE
        WHEN mutation_type IN ('deposit', 'payment_in', 'refund') THEN amount
        WHEN mutation_type = 'adjustment' AND balance_after >= balance_before THEN amount
        ELSE 0
      END), 0) AS total_in,
      COALESCE(SUM(CASE
        WHEN mutation_type IN ('provider_purchase', 'order', 'withdraw', 'bot_activation') THEN amount
        WHEN mutation_type = 'adjustment' AND balance_after < balance_before THEN amount
        ELSE 0
      END), 0) AS total_out,
      COALESCE(SUM(CASE
        WHEN mutation_type IN ('profit_income', 'bot_profit') THEN amount
        ELSE 0
      END), 0) AS total_profit
     FROM saldo_mutations
     WHERE user_id = ?`,
    [Number(userId)],
  );

  return {
    total_in: Number(rows[0]?.total_in || 0),
    total_out: Number(rows[0]?.total_out || 0),
    total_profit: Number(rows[0]?.total_profit || 0),
  };
}
