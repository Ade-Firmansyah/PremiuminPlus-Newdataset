import { getDb, startSession } from '../config/mongo.js';
import crypto from 'node:crypto';

function generateApiKey(username) {
  return `api_${String(username).toLowerCase()}_${crypto.randomBytes(18).toString('hex')}`;
}

function toPublicUser(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    username: doc.username,
    api_key: doc.api_key,
    role: doc.role || 'member',
    fullName: doc.fullName || doc.username,
    email: doc.email || '',
    phone: doc.phone || '',
    saldo_utama: Number(doc.saldo_utama || 0),
    saldo: Number(doc.saldo || doc.saldo_utama || 0),
    locked_balance: Number(doc.locked_balance || 0),
    usable_balance: Number((doc.saldo || doc.saldo_utama || 0) - (doc.locked_balance || 0)),
    bot_enabled: Boolean(doc.bot_enabled),
    theme: doc.theme || 'dark',
    status: doc.status || 'active',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

const collection = () => getDb().collection('users');

export async function findUserByUsername(username) {
  const doc = await collection().findOne({ username: String(username) });
  return doc ? { ...doc, id: String(doc._id) } : null;
}

export async function findUserByEmail(email) {
  const doc = await collection().findOne({ email: String(email).trim() });
  return doc ? { ...doc, id: String(doc._id) } : null;
}

export async function findUserByPhone(phone) {
  const doc = await collection().findOne({ phone: String(phone).trim() });
  return doc ? { ...doc, id: String(doc._id) } : null;
}

export async function findUserByApiKey(apiKey) {
  const doc = await collection().findOne({ api_key: apiKey });
  return doc ? { ...doc, id: String(doc._id) } : null;
}

export async function getUserById(id) {
  const { ObjectId } = await import('mongodb');
  const doc = await collection().findOne({ _id: new ObjectId(id) });
  return doc ? { ...doc, id: String(doc._id) } : null;
}

export async function createUser(payload) {
  const now = new Date();
  const api_key = payload.api_key || generateApiKey(payload.username);
  const doc = {
    username: payload.username,
    email: payload.email || null,
    phone: payload.phone || null,
    password_hash: payload.password || null,
    api_key,
    saldo_utama: 0,
    saldo: 0,
    locked_balance: Number(payload.locked_balance || 0),
    role: payload.role || 'member',
    status: payload.status || 'active',
    fullName: payload.fullName || payload.username,
    theme: payload.theme || 'dark',
    createdAt: now,
    updatedAt: now,
  };
  const result = await collection().insertOne(doc);
  return toPublicUser({ ...doc, _id: result.insertedId });
}

export async function updateUser(id, payload) {
  const { ObjectId } = await import('mongodb');
  const updates = { ...payload, updatedAt: new Date() };
  await collection().updateOne({ _id: new ObjectId(id) }, { $set: updates });
  const doc = await collection().findOne({ _id: new ObjectId(id) });
  return toPublicUser(doc);
}

export async function updateUserSaldo(userId, nextSaldo) {
  const session = startSession();
  const { ObjectId } = await import('mongodb');
  try {
    session.startTransaction();
    const users = collection();
    const res = await users.findOneAndUpdate({ _id: new ObjectId(userId) }, { $set: { saldo_utama: Number(nextSaldo), saldo: Number(nextSaldo), updatedAt: new Date() } }, { returnDocument: 'after', session });
    await session.commitTransaction();
    return toPublicUser(res.value);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    await session.endSession();
  }
}

export default {
  findUserByUsername,
  findUserByEmail,
  findUserByPhone,
  findUserByApiKey,
  getUserById,
  createUser,
  updateUser,
  updateUserSaldo,
};
