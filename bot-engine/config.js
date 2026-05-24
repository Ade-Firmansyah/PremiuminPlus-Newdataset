import dotenv from 'dotenv';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

dotenv.config();

const defaultSessionsDir = new URL('./sessions/', import.meta.url);
const customSessionsDir = process.env.BOT_SESSIONS_DIR ? pathToFileURL(path.resolve(process.env.BOT_SESSIONS_DIR) + path.sep) : null;

function envMs(name, fallback, min) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, value);
}

export const config = {
  port: Number(process.env.BOT_ENGINE_PORT || 4010),
  webCoreUrl: String(
    process.env.WEB_CORE_URL ||
      process.env.API_BASE_URL ||
      process.env.VITE_API_BASE_URL?.replace(/\/api\/?$/, '') ||
      'http://localhost:4000',
  ).replace(/\/+$/, ''),
  adminMonitorJid: process.env.ADMIN_MONITOR_JID || '64957102211197@lid',
  sessionsDir: customSessionsDir || defaultSessionsDir,
  sessionCleanup: {
    enabled: process.env.BOT_SESSION_CLEANUP_ENABLED !== 'false',
    ttlMs: Number(process.env.BOT_SESSION_FILE_TTL_HOURS || 24) * 60 * 60 * 1000,
    intervalMs: Number(process.env.BOT_SESSION_CLEANUP_INTERVAL_MINUTES || 60) * 60 * 1000,
  },
  paymentPolling: {
    firstCheckDelayMs: envMs('BOT_PAYMENT_FIRST_CHECK_MS', 5000, 3000),
    intervalMs: envMs('BOT_PAYMENT_POLL_MS', 20000, 10000),
    timeoutMs: envMs('BOT_PAYMENT_TIMEOUT_MS', 30 * 60 * 1000, 5 * 60 * 1000),
  },
  reconnect: {
    minMs: 1500,
    maxMs: 60000,
    maxAttempts: 12,
  },
};
