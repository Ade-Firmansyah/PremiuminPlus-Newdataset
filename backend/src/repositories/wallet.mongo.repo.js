import { getDb, startSession } from '../config/mongo.js';
import { getDb as getSqlDb } from '../config/db.js';

const users = () => getDb().collection('users');
const saldoLogs = () => getDb().collection('saldo_logs');
const saldoMutations = () => getDb().collection('saldo_mutations');
const activityLogs = () => getDb().collection('activity_logs');

function toPublicUser(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    saldo_utama: Number(doc.saldo_utama || 0),
    saldo: Number(doc.saldo || doc.saldo_utama || 0),
    locked_balance: Number(doc.locked_balance || 0),
    usable_balance: Number((doc.saldo || doc.saldo_utama || 0) - (doc.locked_balance || 0)),
  };
}

export async function changeSaldo(userId, amount, reference, type, notes = '', mutationType = null) {
  const session = startSession();
  try {
    session.startTransaction();
    const ucol = users();
    const userObjId = userId;
    const user = await ucol.findOne({ _id: userObjId }, { session });
    if (!user) {
      const error = new Error('User tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    const before = Number(user.saldo_utama || 0);
    const locked = Number(user.locked_balance || 0);
    const usableBefore = Math.max(0, before - locked);
    const value = Number(amount);
    const after = type === 'debit' ? before - value : before + value;

    if (type === 'debit' && value > usableBefore) {
      const error = new Error('Saldo tidak cukup');
      error.statusCode = 400;
      throw error;
    }

    await ucol.updateOne({ _id: userObjId }, { $set: { saldo_utama: after, saldo: after } }, { session });
    await saldoLogs().insertOne({ user_id: userObjId, type, amount: value, balance_before: before, balance_after: after, reference: reference || null, notes: notes || null, createdAt: new Date() }, { session });
    await saldoMutations().insertOne({ user_id: userObjId, mutation_type: mutationType || (type === 'debit' ? 'order' : 'adjustment'), amount: value, balance_before: before, balance_after: after, reference: reference || null, createdAt: new Date() }, { session });

    await session.commitTransaction();
    return { before, after };
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    await session.endSession().catch(() => {});
  }
}

export async function setSaldo(userId, nextSaldo, reference = 'admin-adjustment') {
  const session = startSession();
  try {
    session.startTransaction();
    const ucol = users();
    const userObjId = userId;
    const user = await ucol.findOne({ _id: userObjId }, { session });
    if (!user) {
      const error = new Error('User tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }
    const before = Number(user.saldo_utama || 0);
    const value = Number(nextSaldo);
    if (before === value) {
      await session.commitTransaction();
      return { userId, value, changed: false };
    }
    await ucol.updateOne({ _id: userObjId }, { $set: { saldo_utama: value, saldo: value } }, { session });
    await saldoLogs().insertOne({ user_id: userObjId, type: value > before ? 'credit' : 'debit', amount: Math.abs(value - before), balance_before: before, balance_after: value, reference: reference || null, notes: 'adjustment', createdAt: new Date() }, { session });
    await saldoMutations().insertOne({ user_id: userObjId, mutation_type: 'adjustment', amount: Math.abs(value - before), balance_before: before, balance_after: value, reference: reference || null, createdAt: new Date() }, { session });
    await session.commitTransaction();
    return { userId, value, changed: true };
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    await session.endSession().catch(() => {});
  }
}

export async function setBotBalanceLock(userId, wantsEnabled) {
  const session = startSession();
  try {
    session.startTransaction();
    const ucol = users();
    const user = await ucol.findOne({ _id: userId }, { session });
    if (!user) {
      const error = new Error('User tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    const role = String(user.role || 'member').toLowerCase();
    const required = role === 'reseller' || role === 'admin' ? 25000 : 5000;
    const saldo = Number(user.saldo_utama || 0);
    const previousLocked = Number(user.locked_balance || 0);
    const nextLocked = wantsEnabled ? required : 0;
    const nextUsable = Math.max(0, saldo - nextLocked);
    const nextBotRole = role === 'member' ? 'member' : 'reseller';

    if (wantsEnabled && saldo < required) {
      const error = new Error(`Saldo minimal Rp${required.toLocaleString('id-ID')} diperlukan untuk mengaktifkan bot.`);
      error.statusCode = 400;
      throw error;
    }

    await ucol.updateOne({ _id: userId }, { $set: { locked_balance: nextLocked, bot_enabled: wantsEnabled, bot_role: nextBotRole } }, { session });

    if (previousLocked !== nextLocked || Boolean(user.bot_enabled) !== wantsEnabled) {
      await activityLogs().insertOne({ actor_id: userId, user_id: userId, scope: 'BOT', message: wantsEnabled ? 'Bot balance locked' : 'Bot balance unlocked', activity: wantsEnabled ? 'Bot balance locked' : 'Bot balance unlocked', metadata: { role, saldo, locked_balance_before: previousLocked, locked_balance_after: nextLocked, usable_balance: nextUsable }, createdAt: new Date() }, { session });
    }

    await session.commitTransaction();

    return {
      id: String(userId),
      role,
      saldo,
      locked_balance: nextLocked,
      usable_balance: nextUsable,
      bot_enabled: wantsEnabled,
      bot_role: nextBotRole,
      changed: previousLocked !== nextLocked || Boolean(user.bot_enabled) !== wantsEnabled,
    };
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    await session.endSession().catch(() => {});
  }
}

export default { changeSaldo, setSaldo, setBotBalanceLock };
