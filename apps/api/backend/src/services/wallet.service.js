import { transaction } from '../config/db.js';
import { applyBalanceMutation, invalidateBalanceCaches, recordBalanceMutation } from './balance.service.js';

export const BOT_LOCKED_BALANCE = 50000;

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

export function getUsableBalance(user = {}) {
  return Math.max(Number(user.saldo || 0) - Number(user.locked_balance || 0), 0);
}

function invalidateWalletCaches(userId) {
  invalidateBalanceCaches(userId);
}

export async function applyWalletMutationInTransaction(connection, userOrId, payload) {
  const userId = resolveUserId(userOrId);
  const amount = assertPositiveAmount(payload.amount);
  const direction = payload.direction || 'neutral';

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

  await connection.query('UPDATE users SET saldo = ? WHERE id = ?', [after, userId]);
  await connection.query(
    `INSERT INTO saldo_logs
      (user_id, type, amount, balance_before, balance_after, reference, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      direction === 'in' ? 'credit' : direction === 'out' ? 'debit' : 'adjustment',
      amount,
      before,
      after,
      payload.source_ref || payload.reference || null,
      payload.notes || null,
    ],
  );
  await recordBalanceMutation(connection, {
    ...payload,
    user_id: userId,
    direction,
    amount,
    balance_before: before,
    balance_after: after,
  });

  if (after < lockedBalance && lockedBalance >= BOT_LOCKED_BALANCE && user.bot_access_unlocked) {
    await disableBotForUser(connection, userId, 'Saldo lebih kecil dari locked balance bot');
  }

  return { before, after, user };
}

async function changeSaldo(userOrId, amount, reference, type, notes = '') {
  const value = assertPositiveAmount(amount);
  const result = await applyBalanceMutation(userOrId, {
    mutation_type: type === 'debit' ? 'order_payment' : 'admin_adjustment',
    direction: type === 'debit' ? 'out' : 'in',
    amount: value,
    source_type: type === 'debit' ? 'order' : 'wallet',
    source_ref: reference || null,
    notes,
  });
  return { before: result.before, after: result.after };
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

export async function setSaldo(userOrId, nextSaldo, reference = 'admin-adjustment', options = {}) {
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
    await recordBalanceMutation(connection, {
      user_id: userId,
      mutation_type: 'admin_adjustment',
      direction: value > before ? 'in' : 'out',
      amount: Math.abs(value - before),
      balance_before: before,
      balance_after: value,
      source_type: 'admin_adjustment',
      source_ref: reference || null,
      admin_executor_id: options.admin_executor_id || null,
      notes: 'adjustment',
    });

    return value;
  });
  invalidateWalletCaches(userId);
  return result;
}

export async function applyBotActivationSuccess(connection, userId, reference, amount = BOT_LOCKED_BALANCE) {
  const [userRows] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
  const user = userRows[0];
  if (!user) {
    const error = new Error('User tidak ditemukan');
    error.statusCode = 404;
    throw error;
  }

  const lockedAmount = Math.max(Number(user.locked_balance || 0), Number(amount || BOT_LOCKED_BALANCE));
  await connection.query(
    `UPDATE users
     SET locked_balance = ?,
         bot_access_unlocked = 1,
         bot_disabled_reason = NULL
     WHERE id = ?`,
    [lockedAmount, userId],
  );
  await recordBalanceMutation(connection, {
    user_id: userId,
    mutation_type: 'locked_balance',
    direction: 'neutral',
    amount: lockedAmount,
    balance_before: Number(user.saldo || 0),
    balance_after: Number(user.saldo || 0),
    source_type: 'bot_activation',
    source_ref: `${reference}-locked`,
  });
  await connection.query(
    `INSERT INTO transactions
      (invoice, ref_id, user_id, product_name, transaction_type, amount, total_price, status, description, channel, processed_at)
     VALUES (?, ?, ?, 'Bot WhatsApp Activation', 'bot_unlock', ?, ?, 'success', 'Bot access unlocked', 'system', NOW())
     ON DUPLICATE KEY UPDATE status = 'success', processed_at = COALESCE(processed_at, NOW())`,
    [`${reference}-unlock`, `${reference}-unlock`, userId, lockedAmount, lockedAmount],
  );
  await connection.query(
    `INSERT INTO activity_logs (actor_id, user_id, scope, message, activity, metadata)
     VALUES (?, ?, 'BOT', 'Bot access unlocked', 'Bot access unlocked', CAST(? AS JSON))`,
    [userId, userId, JSON.stringify({ reference, locked_balance: lockedAmount })],
  );
}

export async function disableBotForUser(connection, userId, reason = 'Saldo minimum akses bot tidak terpenuhi') {
  const reference = `BOTDIS-${userId}-${Date.now()}`;
  const [userRows] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
  const user = userRows[0] || {};
  await connection.query(
    `UPDATE users
     SET bot_access_unlocked = 0,
         bot_disabled_reason = ?
     WHERE id = ?`,
    [reason, userId],
  );
  await connection.query(
    `INSERT INTO transactions
      (invoice, ref_id, user_id, product_name, transaction_type, amount, total_price, status, description, channel, processed_at)
     VALUES (?, ?, ?, 'Bot WhatsApp Disabled', 'bot_disable', 0, 0, 'success', ?, 'system', NOW())
     ON DUPLICATE KEY UPDATE status = 'success'`,
    [reference, reference, userId, reason],
  );
  await connection.query(
    `INSERT INTO activity_logs (actor_id, user_id, scope, message, activity, metadata)
     VALUES (?, ?, 'BOT', 'Bot disabled', 'Bot disabled', CAST(? AS JSON))`,
    [userId, userId, JSON.stringify({ reason })],
  );
  await recordBalanceMutation(connection, {
    user_id: userId,
    mutation_type: 'bot_disable',
    direction: 'neutral',
    amount: 0,
    balance_before: Number(user.saldo || 0),
    balance_after: Number(user.saldo || 0),
    source_type: 'bot',
    source_ref: reference,
    notes: reason,
    metadata: { locked_balance: Number(user.locked_balance || 0) },
  });
}

async function applyWithdrawDebit(connection, user, amount, reference) {
  const value = assertPositiveAmount(amount);
  const userId = Number(user.id);
  const before = Number(user.saldo || 0);
  const beforeLocked = Number(user.locked_balance || 0);
  const after = before - value;
  if (after < 0 || before - beforeLocked < value) {
    const error = new Error('Saldo tidak cukup');
    error.statusCode = 400;
    throw error;
  }

  await connection.query(
    `UPDATE users
     SET saldo = ?
     WHERE id = ?`,
    [after, userId],
  );
  await connection.query(
    `INSERT INTO saldo_logs
      (user_id, type, amount, balance_before, balance_after, reference, notes)
     VALUES (?, 'debit', ?, ?, ?, ?, ?)`,
    [userId, value, before, after, reference, 'withdraw-approved'],
  );
  await recordBalanceMutation(connection, {
    user_id: userId,
    mutation_type: 'withdraw',
    direction: 'out',
    amount: value,
    balance_before: before,
    balance_after: after,
    source_type: 'withdraw',
    source_ref: reference,
    notes: 'withdraw-approved',
  });

  return { before, after, locked_before: beforeLocked, locked_after: beforeLocked, bot_disabled: false };
}

export async function approveWithdrawBalance(userId, amount, reference) {
  const result = await transaction(async (connection) => {
    const [rows] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
    const user = rows[0];
    if (!user) {
      const error = new Error('User tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    return applyWithdrawDebit(connection, user, amount, reference);
  });
  invalidateWalletCaches(userId);
  return result;
}

export async function approveWithdrawRequest(withdrawId) {
  const result = await transaction(async (connection) => {
    const [withdrawRows] = await connection.query(
      `SELECT w.*, u.username, u.email, u.saldo, u.locked_balance, u.bot_access_unlocked, u.bot_disabled_reason
       FROM withdraws w
       INNER JOIN users u ON u.id = w.user_id
       WHERE w.id = ?
       FOR UPDATE`,
      [Number(withdrawId)],
    );
    const withdraw = withdrawRows[0];
    if (!withdraw) {
      const error = new Error('Withdraw tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }
    if (withdraw.status !== 'pending') {
      const error = new Error('Withdraw sudah diproses');
      error.statusCode = 400;
      throw error;
    }

    await applyWithdrawDebit(
      connection,
      {
        id: withdraw.user_id,
        saldo: withdraw.saldo,
        locked_balance: withdraw.locked_balance,
        bot_access_unlocked: withdraw.bot_access_unlocked,
        bot_disabled_reason: withdraw.bot_disabled_reason,
      },
      Number(withdraw.amount || 0),
      `withdraw-${withdraw.id}-approve`,
    );
    await connection.query(
      `UPDATE withdraws
       SET status = 'approved',
           approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP),
           processed_at = COALESCE(processed_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
      [Number(withdrawId)],
    );

    return {
      id: withdraw.id,
      invoice: withdraw.invoice || '',
      user_id: withdraw.user_id,
      username: withdraw.username || '',
      email: withdraw.email || '',
      amount: Number(withdraw.amount || 0),
      status: 'approved',
      bank_account: withdraw.bank_account || '',
      bank_name: withdraw.bank_name || '',
      method: withdraw.bank_name || '',
      account_number: withdraw.account_number || '',
      account_name: withdraw.account_name || '',
      notes: withdraw.notes || '',
      approved_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
      created_at: withdraw.created_at,
      updated_at: new Date().toISOString(),
    };
  });
  invalidateWalletCaches(result.user_id);
  return result;
}
