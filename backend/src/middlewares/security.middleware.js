const windows = new Map();
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of windows.entries()) {
    if (value.resetAt <= now) {
      windows.delete(key);
    }
  }
}, 60_000);

cleanupTimer.unref?.();

function normalizeOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function isAllowedOrigin(origin) {
  const allowed = String(process.env.CORS_ORIGIN || process.env.FRONTEND_ORIGIN || '*')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);

  if (!origin || allowed.includes('*')) return true;
  return allowed.includes(normalizeOrigin(origin));
}

export function securityHeaders(req, res, next) {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (req.method === 'OPTIONS') {
    return res.status(403).json({ status: false, message: 'Origin tidak diizinkan' });
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization, x-premku-signature, x-webhook-secret');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
}

export function rateLimit({ windowMs = 60_000, max = 240 } = {}) {
  return (req, res, next) => {
    const key = `${req.ip || req.socket.remoteAddress || 'unknown'}:${req.path}`;
    const now = Date.now();
    const current = windows.get(key);
    const nextWindow = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    nextWindow.count += 1;
    windows.set(key, nextWindow);

    if (nextWindow.count > max) {
      return res.status(429).json({
        status: false,
        message: 'Terlalu banyak request. Coba lagi sebentar.',
      });
    }

    return next();
  };
}
