import { getDb } from '../config/mongo.js';

const collection = () => getDb().collection('settings');

export async function getSetting(key) {
  const doc = await collection().findOne({ key });
  return doc || null;
}

export async function upsertSetting(key, value) {
  const now = new Date();
  const res = await collection().findOneAndUpdate(
    { key },
    { $set: { key, value, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true, returnDocument: 'after' },
  );
  return res.value;
}

export default { getSetting, upsertSetting };
