import crypto from 'node:crypto';

const WEB_SESSION_TIMEOUT_MS = Math.max(5 * 60 * 1000, Number(process.env.WEB_SESSION_TIMEOUT_MS || 30 * 60 * 1000));
const sessions = new Map();

function cleanupExpiredSessions(now = Date.now()) {
  for (const [sid, session] of sessions.entries()) {
    if (now - Number(session.lastActivityAt || 0) > WEB_SESSION_TIMEOUT_MS) {
      sessions.delete(sid);
    }
  }
}

export function createWebSession(userId) {
  cleanupExpiredSessions();
  const sid = crypto.randomUUID();
  const now = Date.now();
  sessions.set(sid, {
    userId: Number(userId),
    createdAt: now,
    lastActivityAt: now,
  });
  return sid;
}

export function touchWebSession(payload = {}) {
  const sid = String(payload.sid || '');
  const userId = Number(payload.sub || 0);
  const session = sid ? sessions.get(sid) : null;
  if (!session || Number(session.userId) !== userId) return false;

  const now = Date.now();
  if (now - Number(session.lastActivityAt || 0) > WEB_SESSION_TIMEOUT_MS) {
    sessions.delete(sid);
    return false;
  }

  session.lastActivityAt = now;
  return true;
}

export function invalidateWebSession(payload = {}) {
  const sid = String(payload.sid || '');
  if (sid) sessions.delete(sid);
}

export { WEB_SESSION_TIMEOUT_MS };
