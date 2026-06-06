import crypto from 'node:crypto';
import { findUserByApiKey } from '../repositories/user.repo.js';

const rateBuckets = new Map();
const RATE_WINDOW_MS = 60_000;
const MUTATION_PATHS = new Set(['/pay', '/cancel_pay', '/order']);

function pruneRateBuckets(now = Date.now()) {
  if (rateBuckets.size < 5000) return;
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}

function consumeRateLimit(key, limit, res) {
  const now = Date.now();
  pruneRateBuckets(now);
  const current = rateBuckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + RATE_WINDOW_MS }
    : current;

  if (bucket.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('retry-after', String(retryAfter));
    res.status(429).json({
      status: false,
      success: false,
      code: 'RATE_LIMITED',
      message: 'Terlalu banyak request. Coba lagi setelah beberapa saat.',
      data: { retry_after_seconds: retryAfter },
    });
    return false;
  }

  bucket.count += 1;
  rateBuckets.set(key, bucket);
  return true;
}

export function publicApiIpRateLimit(req, res, next) {
  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
  if (!consumeRateLimit(`ip:${ip}`, 300, res)) return;
  next();
}

export function publicApiUserRateLimit(req, res, next) {
  const userId = Number(req.user?.id || 0);
  const path = String(req.path || '').toLowerCase();
  const mutation = MUTATION_PATHS.has(path);
  const limit = mutation ? 60 : 180;
  const group = mutation ? 'mutation' : 'read';
  if (!consumeRateLimit(`user:${userId}:${group}`, limit, res)) return;
  next();
}

function uniqueKeys(req) {
  const headerKey = Array.isArray(req.headers['x-api-key'])
    ? req.headers['x-api-key'][0]
    : req.headers['x-api-key'];
  const authorization = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  const bearer = String(authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  return [...new Set([
    String(headerKey || '').trim(),
    String(bearer || '').trim(),
    String(req.body?.api_key || '').trim(),
  ].filter(Boolean))];
}

export async function publicApiAuth(req, res, next) {
  try {
    const keys = uniqueKeys(req);
    if (!keys.length) {
      return res.status(401).json({ success: false, message: 'API key wajib diisi.' });
    }
    if (keys.length > 1) {
      return res.status(400).json({ success: false, message: 'API key berbeda dikirim dari beberapa sumber.' });
    }

    const user = await findUserByApiKey(keys[0]);
    if (!user) return res.status(401).json({ success: false, message: 'API key tidak valid.' });
    if (user.status !== 'active') return res.status(403).json({ success: false, message: 'Akun tidak aktif.' });

    req.user = user;
    req.apiUser = user;
    return next();
  } catch (error) {
    return next(error);
  }
}
