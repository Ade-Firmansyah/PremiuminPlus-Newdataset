import { transaction } from '../config/db.js';
import { deleteCachePrefix } from './cache.service.js';

const TYPE_DIRECTION = {
  deposit: 'in',
  refund: 'in',
  bonus: 'in',
  reseller_commission: 'in',
  bot_payment_in: 'in',
  reseller_profit: 'in',
  commission: 'in',
  credit: 'in',
  withdraw: 'out',
  bot_order_cost: 'out',
  order_payment: 'out',
  order: 'out',
  debit: 'out',
  admin_adjustment: 'neutral',
  adjustment: 'neutral',
  locked_balance: 'neutral',
};

function resolveUserId(userOrId) {
  if (!userOrId) return null;
  if (typeof userOrId === 'object') return Number(userOrId.id);
  return Number(userOrId);
}

function assertAmount(amount, { allowZero = false } = {}) {
  const value = Number(amount);
  const valid = Number.isFinite(value) && (allowZero ? value >= 0 : value > 0);
  if (!valid) {
    const error = new Error('Nominal saldo tidak valid');
    error.statusCode = 400;
    throw error;
  }
  return Math.round(value);
}

function normalizeMutationType(type = 'admin_adjustment') {
  return String(type || 'admin_adjustment').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
}

function resolveDirection(type, before, after) {
  const normalized = normalizeMutationType(type);
  if (TYPE_DIRECTION[normalized]) return TYPE_DIRECTION[normalized];
  if (after > before) return 'in';
  if (after < before) return 'out';
  return 'neutral';
}

export function invalidateBalanceCaches(userId) {
  deleteCachePrefix(`dashboard:user:${userId}`);
  deleteCachePrefix(`bot:catalog:user:${userId}`);
  deleteCachePrefix('leaderboard:');
  deleteCachePrefix('admin:summary');
  deleteCachePrefix('admin:users');
  deleteCachePrefix('admin:balance-mutations');
}

export async function recordBalanceMutation(connection, payload) {
  const mutationType = normalizeMutationType(payload.mutation_type);
  const before = Number(payload.balance_before || 0);
  const after = Number(payload.balance_after || 0);
  const amount = assertAmount(payload.amount, { allowZero: true });
  const direction = payload.direction || resolveDirection(mutationType, before, after);

  await connection.query(
    `INSERT INTO balance_mutations
      (user_id, mutation_type, direction, amount, balance_before, balance_after, source_type, source_ref, admin_executor_id, notes, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
    [
      Number(payload.user_id),
      mutationType,
      direction,
      amount,
      before,
      after,
      payload.source_type || null,
      payload.source_ref || payload.reference || null,
      payload.admin_executor_id || null,
      payload.notes || null,
      JSON.stringify(payload.metadata ?? null),
    ],
  );

  await connection.query(
    `INSERT INTO saldo_mutations
      (user_id, mutation_type, amount, balance_before, balance_after, reference)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [Number(payload.user_id), mutationType, amount, before, after, payload.source_ref || payload.reference || null],
  );
}

export async function applyBalanceMutation(userOrId, payload) {
  const userId = resolveUserId(userOrId);
  const amount = assertAmount(payload.amount);
  const mutationType = normalizeMutationType(payload.mutation_type);
  const direction = payload.direction || resolveDirection(mutationType, 0, mutationType === 'admin_adjustment' ? 0 : amount);

  const result = await transaction(async (connection) => {
    const [rows] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
    const user = rows[0];
    if (!user) {
      const error = new Error('User tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    const before = Number(user.saldo || 0);
    const lockedBalance = Number(user.locked_balance || 0);
    let after = before;
    if (direction === 'in') after = before + amount;
    if (direction === 'out') after = before - amount;
    if (payload.next_balance !== undefined) after = Number(payload.next_balance);

    if (!Number.isFinite(after) || after < 0) {
      const error = new Error('Saldo tidak cukup');
      error.statusCode = 400;
      throw error;
    }
    if (direction === 'out' && before - lockedBalance < amount) {
      const error = new Error('Saldo usable tidak cukup karena sebagian saldo terkunci untuk akses bot');
      error.statusCode = 400;
      throw error;
    }

    const logType = direction === 'in' ? 'credit' : direction === 'out' ? 'debit' : 'adjustment';
    await connection.query('UPDATE users SET saldo = ? WHERE id = ?', [after, userId]);
    await connection.query(
      `INSERT INTO saldo_logs
        (user_id, type, amount, balance_before, balance_after, reference, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, logType, amount, before, after, payload.source_ref || payload.reference || null, payload.notes || null],
    );
    await recordBalanceMutation(connection, {
      ...payload,
      user_id: userId,
      mutation_type: mutationType,
      direction,
      amount,
      balance_before: before,
      balance_after: after,
    });

    return { before, after, user };
  });

  invalidateBalanceCaches(userId);
  if (typeof userOrId === 'object') userOrId.saldo = result.after;
  return result;
}
