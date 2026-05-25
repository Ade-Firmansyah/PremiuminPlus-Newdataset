import { getDb } from '../config/mongo.js';
import { logger } from '../utils/logger.js';

const DAY_MS = 24 * 60 * 60 * 1000;
let handle = null;

export const TEMP_COLLECTIONS = [
  'webhook_logs',
  'provider_logs',
  'temporary_socket_logs',
  'realtime_cache',
  'expired_qr',
  'temporary_notifications',
  'temporary_bot_logs',
  'unused_sessions',
  'expired_payment_cache',
  'failed_temp_orders',
  'stale_activity_logs',
];

function tempDocumentDefaults(doc = {}, days = 7) {
  const createdAt = doc.created_at || doc.createdAt || new Date();
  const createdDate = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const safeCreatedAt = Number.isNaN(createdDate.getTime()) ? new Date() : createdDate;
  return {
    ...doc,
    created_at: doc.created_at || safeCreatedAt,
    expires_at: doc.expires_at || new Date(safeCreatedAt.getTime() + days * DAY_MS),
  };
}

async function ensureTtlIndexes(days = 7) {
  try {
    const db = getDb();
    for (const name of TEMP_COLLECTIONS) {
      const col = db.collection(name);
      await col.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'ttl_expires_at' });
      await col.createIndex({ created_at: 1 }, { name: 'idx_created_at' });
    }
    await db.collection('users').createIndex({ username: 1 }, { unique: true, sparse: true, name: 'idx_users_username' });
    await db.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true, name: 'idx_users_email' });
    await db.collection('orders').createIndex({ invoice: 1 }, { unique: true, sparse: true, name: 'idx_orders_invoice' });
    await db.collection('payments').createIndex({ invoice: 1 }, { unique: true, sparse: true, name: 'idx_payments_invoice' });
    await db.collection('products').createIndex({ slug: 1 }, { unique: true, sparse: true, name: 'idx_products_slug' });
    await db.collection('products').createIndex({ code: 1 }, { unique: true, sparse: true, name: 'idx_products_code' });
    logger('SYSTEM', { task: 'cleanup', status: 'ttl_indexes_ensured', collections: TEMP_COLLECTIONS.length });
  } catch (err) {
    logger('ERROR', { task: 'cleanup', message: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

async function runCleanupOnce(days = 7) {
  try {
    const db = getDb();
    const expiryCutoff = new Date(Date.now() - (days * DAY_MS));
    const results = {};
    for (const name of TEMP_COLLECTIONS) {
      const col = db.collection(name);
      // remove docs with explicit expires_at older than now
      const res1 = await col.deleteMany({ expires_at: { $lt: new Date() } });
      // remove docs without expires_at but createdAt older than cutoff
      const res2 = await col.updateMany(
        { expires_at: { $exists: false }, created_at: { $exists: true } },
        [{ $set: { expires_at: { $dateAdd: { startDate: '$created_at', unit: 'day', amount: days } } } }],
      );
      const res3 = await col.deleteMany({ expires_at: { $exists: false }, created_at: { $lt: expiryCutoff } });
      results[name] = {
        deleted: (res1?.deletedCount || 0) + (res3?.deletedCount || 0),
        backfilled_expiry: res2?.modifiedCount || 0,
      };
    }
    logger('SYSTEM', { task: 'cleanup', status: 'completed', deleted: results });
    return results;
  } catch (err) {
    logger('ERROR', { task: 'cleanup', message: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

export function startCleanupScheduler({ intervalMs = DAY_MS, retentionDays = 7 } = {}) {
  if (handle) return handle;
  // ensure TTL indexes immediately
  ensureTtlIndexes(retentionDays).catch(() => {});
  // run once on start
  runCleanupOnce(retentionDays).catch(() => {});
  const timer = setInterval(() => runCleanupOnce(retentionDays).catch(() => {}), intervalMs);
  timer.unref?.();
  handle = {
    stop() {
      clearInterval(timer);
      handle = null;
    },
  };
  return handle;
}

export function stopCleanupScheduler() {
  handle?.stop();
}

export function dailyCleanupScheduler(options = {}) {
  return startCleanupScheduler({ intervalMs: DAY_MS, retentionDays: options.retentionDays || 7 });
}

export function withTemporaryExpiry(doc = {}, days = 7) {
  return tempDocumentDefaults(doc, days);
}

export default { startCleanupScheduler, stopCleanupScheduler, dailyCleanupScheduler, ensureTtlIndexes, runCleanupOnce, withTemporaryExpiry };
