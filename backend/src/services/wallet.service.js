import { query, transaction } from '../config/db.js';
import { publishUserRefresh } from './realtime.service.js';

export const BOT_LOCKS = {
  member: 5000,
  reseller: 25000,
  admin: 25000,
};

function resolveUserId(userOrId) {
  if (!userOrId) return null;
  if (typeof userOrId === 'object') return Number(userOrId.id);
  return Number(userOrId);
}

export function getBotLockRequired(userOrRole) {
  const role = typeof userOrRole === 'object' ? userOrRole?.role : userOrRole;
  return BOT_LOCKS[String(role || '').toLowerCase()] ?? BOT_LOCKS.member;
}

export function getSaldoUtama(user = {}) {
  return Number(user.saldo_utama ?? 0);
}

export function getLockedBalance(user = {}) {
  return Math.max(0, Number(user.locked_balance || 0));
}

export function getUsableBalance(user = {}) {
  return Math.max(0, getSaldoUtama(user) - getLockedBalance(user));
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

async function changeSaldo(userOrId, amount, reference, type, notes = '', mutationType = null) {
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

    const before = getSaldoUtama(user);
    const usableBefore = getUsableBalance(user);
    const after = type === 'debit' ? before - value : before + value;

    if (type === 'debit' && value > usableBefore) {
      const error = new Error('Saldo tidak cukup');
      error.statusCode = 400;
      throw error;
    }

    await connection.query('UPDATE users SET saldo_utama = ?, saldo = ? WHERE id = ?', [after, after, userId]);
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
      [userId, mutationType || (type === 'debit' ? 'order' : 'adjustment'), value, before, after, reference || null],
    );

    return { before, after };
  });

  if (!result || !Number.isFinite(Number(result.after))) {
    const rows = await query('SELECT saldo_utama FROM users WHERE id = ? LIMIT 1', [userId]);
    const after = Number(rows[0]?.saldo_utama);
    if (Number.isFinite(after)) {
      return { before: null, after };
    }
    const error = new Error('Gagal memproses mutasi saldo');
    error.statusCode = 500;
    throw error;
  }

  return result;
}

export async function deductSaldo(userOrId, amount, reference = '', notes = '') {
  const result = await changeSaldo(userOrId, amount, reference, 'debit', notes);
  if (typeof userOrId === 'object') {
    userOrId.saldo_utama = result.after;
    userOrId.saldo = result.after;
  }
  publishUserRefresh(resolveUserId(userOrId), 'wallet_updated', { scope: 'wallet', entity: 'saldo', id: reference || null });
  return result.after;
}

export async function addSaldo(userOrId, amount, reference = '', notes = '', mutationType = 'adjustment') {
  const result = await changeSaldo(userOrId, amount, reference, 'credit', notes, mutationType);
  if (typeof userOrId === 'object') {
    userOrId.saldo_utama = result.after;
    userOrId.saldo = result.after;
  }
  publishUserRefresh(resolveUserId(userOrId), 'wallet_updated', { scope: 'wallet', entity: 'saldo', id: reference || null });
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

    const before = getSaldoUtama(user);
    if (before === value) {
      return { userId, value, changed: false };
    }

    await connection.query('UPDATE users SET saldo_utama = ?, saldo = ? WHERE id = ?', [value, value, userId]);
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

    return { userId, value, changed: true };
  });

  if (result.changed) {
    publishUserRefresh(result.userId, 'wallet_updated', { scope: 'wallet', entity: 'saldo', id: reference || null });
  }
  return result.value;
}

export async function setBotBalanceLock(userOrId, enabled) {
  const userId = resolveUserId(userOrId);
  const wantsEnabled = Boolean(enabled);

  const result = await transaction(async (connection) => {
    const [rows] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
    const user = rows[0];

    if (!user) {
      const error = new Error('User tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    const role = String(user.role || 'member').toLowerCase();
    const required = getBotLockRequired(role);
    const saldo = getSaldoUtama(user);
    const previousLocked = getLockedBalance(user);
    const nextLocked = wantsEnabled ? required : 0;
    const nextUsable = Math.max(0, saldo - nextLocked);
    const nextBotRole = role === 'member' ? 'member' : 'reseller';

    if (wantsEnabled && saldo < required) {
      const error = new Error(`Saldo minimal Rp${required.toLocaleString('id-ID')} diperlukan untuk mengaktifkan bot.`);
      error.statusCode = 400;
      throw error;
    }

    await connection.query(
      `UPDATE users
       SET locked_balance = ?, bot_enabled = ?, bot_role = ?
       WHERE id = ?`,
      [nextLocked, wantsEnabled ? 1 : 0, nextBotRole, userId],
    );

    if (previousLocked !== nextLocked || Boolean(user.bot_enabled) !== wantsEnabled) {
      await connection.query(
        `INSERT INTO activity_logs (actor_id, user_id, scope, message, activity, metadata)
         VALUES (?, ?, 'BOT', ?, ?, ?)`,
        [
          userId,
          userId,
          wantsEnabled ? 'Bot balance locked' : 'Bot balance unlocked',
          wantsEnabled ? 'Bot balance locked' : 'Bot balance unlocked',
          JSON.stringify({
            role,
            saldo,
            locked_balance_before: previousLocked,
            locked_balance_after: nextLocked,
            usable_balance: nextUsable,
          }),
        ],
      );
    }

    return {
      id: userId,
      role,
      saldo,
      locked_balance: nextLocked,
      usable_balance: nextUsable,
      bot_enabled: wantsEnabled,
      bot_role: nextBotRole,
      changed: previousLocked !== nextLocked || Boolean(user.bot_enabled) !== wantsEnabled,
    };
  });

  if (result.changed) {
    publishUserRefresh(result.id, 'bot_settings_updated', { scope: 'bot', entity: 'bot_lock' });
  }
  return result;
}
