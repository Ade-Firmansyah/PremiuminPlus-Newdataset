import { getDb } from '../config/mongo.js';
import { logger } from '../utils/logger.js';

const DAY_MS = 24 * 60 * 60 * 1000;
let handle = null;

const TEMP_COLLECTIONS = [
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

async function ensureTtlIndexes(days = 7) {
  try {
    const db = getDb();
    for (const name of TEMP_COLLECTIONS) {
      const col = db.collection(name);
      // create TTL index on expires_at (expireAfterSeconds 0)
      await col.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
      // fallback: ensure createdAt TTL too (in case older documents use createdAt)
      await col.createIndex({ createdAt: 1 }, { expireAfterSeconds: days * 24 * 60 * 60 });
    }
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
      const res2 = await col.deleteMany({ expires_at: { $exists: false }, createdAt: { $lt: expiryCutoff } });
      results[name] = (res1?.deletedCount || 0) + (res2?.deletedCount || 0);
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

export default { startCleanupScheduler, stopCleanupScheduler, ensureTtlIndexes, runCleanupOnce };
