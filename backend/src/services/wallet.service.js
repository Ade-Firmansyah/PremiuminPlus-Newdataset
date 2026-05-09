import { transaction } from '../config/db.js';
import { deleteCachePrefix } from './cache.service.js';

function resolveUserId(userOrId) {
  if (!userOrId) return null;
  if (typeof userOrId === 'object') return Number(userOrId.id);
  return Number(userOrId);
}

function assertPositiveAmount(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    const error = new Error('Nominal saldo tidak valid');
    error.statusCode = 400;
    throw error;
  }
  return value;
}

async function changeSaldo(userOrId, amount, reference, type, notes = '') {
  const userId = resolveUserId(userOrId);
  const value = assertPositiveAmount(amount);

  const result = await transaction(async (connection) => {
    const [rows] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
    const user = rows[0];

    if (!user) {
      const error = new Error('User tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    const before = Number(user.saldo || 0);
    const after = type === 'debit' ? before - value : before + value;

    if (after < 0) {
      const error = new Error('Saldo tidak cukup');
      error.statusCode = 400;
      throw error;
    }

    await connection.query('UPDATE users SET saldo = ? WHERE id = ?', [after, userId]);
    await connection.query(
      `INSERT INTO saldo_logs
        (user_id, type, amount, balance_before, balance_after, reference, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, type, value, before, after, reference || null, notes || null],
    );
    await connection.query(
      `INSERT INTO saldo_mutations
        (user_id, mutation_type, amount, balance_before, balance_after, reference)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, type === 'debit' ? 'order' : 'adjustment', value, before, after, reference || null],
    );

    return { before, after };
  });
  deleteCachePrefix(`dashboard:user:${userId}`);
  deleteCachePrefix('leaderboard:');
  deleteCachePrefix('admin:summary');
  return result;
}

export async function deductSaldo(userOrId, amount, reference = '', notes = '') {
  const result = await changeSaldo(userOrId, amount, reference, 'debit', notes);
  if (typeof userOrId === 'object') {
    userOrId.saldo = result.after;
  }
  return result.after;
}

export async function addSaldo(userOrId, amount, reference = '', notes = '') {
  const result = await changeSaldo(userOrId, amount, reference, 'credit', notes);
  if (typeof userOrId === 'object') {
    userOrId.saldo = result.after;
  }
  return result.after;
}

export async function setSaldo(userOrId, nextSaldo, reference = 'admin-adjustment') {
  const userId = resolveUserId(userOrId);
  const value = Number(nextSaldo);
  if (!Number.isFinite(value) || value < 0) {
    const error = new Error('Saldo tidak valid');
    error.statusCode = 400;
    throw error;
  }

  const result = await transaction(async (connection) => {
    const [rows] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
    const user = rows[0];

    if (!user) {
      const error = new Error('User tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    const before = Number(user.saldo || 0);
    if (before === value) {
      return value;
    }

    await connection.query('UPDATE users SET saldo = ? WHERE id = ?', [value, userId]);
    await connection.query(
      `INSERT INTO saldo_logs
        (user_id, type, amount, balance_before, balance_after, reference, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, value > before ? 'credit' : 'debit', Math.abs(value - before), before, value, reference || null, 'adjustment'],
    );
    await connection.query(
      `INSERT INTO saldo_mutations
        (user_id, mutation_type, amount, balance_before, balance_after, reference)
       VALUES (?, 'adjustment', ?, ?, ?, ?)`,
      [userId, Math.abs(value - before), before, value, reference || null],
    );

    return value;
  });
  deleteCachePrefix(`dashboard:user:${userId}`);
  deleteCachePrefix('leaderboard:');
  deleteCachePrefix('admin:summary');
  return result;
}
