import { logger } from '../utils/logger.js';

const store = new Map();
const inflight = new Map();

function now() {
  return Date.now();
}

export function getCache(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expires_at <= now()) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function setCache(key, value, ttlSeconds = 30) {
  const ttl = Math.max(1, Number(ttlSeconds || 30));
  store.set(key, {
    value,
    expires_at: now() + ttl * 1000,
  });
  return value;
}

export function deleteCache(key) {
  store.delete(key);
}

export function deleteCachePrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export async function remember(key, ttlSeconds, resolver) {
  const cached = getCache(key);
  if (cached !== null) return cached;

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const promise = Promise.resolve()
    .then(resolver)
    .then((value) => {
      setCache(key, value, ttlSeconds);
      logger('CACHE', { key, ttl_seconds: ttlSeconds, status: 'miss-fill' });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

export function cacheStats() {
  return {
    keys: store.size,
    inflight: inflight.size,
  };
}
