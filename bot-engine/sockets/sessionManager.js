import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from '@whiskeysockets/baileys';
import Pino from 'pino';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { WebCoreClient, withRetry } from '../api-client/webCore.js';
import { MessageQueue } from '../queues/messageQueue.js';
import { ReconnectBackoff } from '../reconnect/backoff.js';
import { MessageHandler } from '../handlers/messageHandler.js';
import { notifyAdmin } from '../notifications/admin.js';

export class SessionManager {
  constructor({ broadcast }) {
    this.broadcast = broadcast;
    this.sessions = new Map();
    this.cleanupTimer = null;
    this.cleanupRunning = false;
  }

  get(sessionId) {
    return this.sessions.get(String(sessionId));
  }

  async connect({ userId, apiKey, resetRetries = 0 }) {
    const sessionId = String(userId);
    const existing = this.sessions.get(sessionId);
    if (existing?.sock) return this.snapshot(sessionId);
    await this.pruneSessionFiles(sessionId).catch(() => {});

    const api = new WebCoreClient(apiKey);
    await withRetry(() => api.sessionStatus('connecting'));
    const sessionPath = fileURLToPath(new URL(`./${sessionId}/`, config.sessionsDir));
    await fs.mkdir(sessionPath, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const latest = await fetchLatestBaileysVersion().catch(() => null);
    const backoff = new ReconnectBackoff();
    const queue = new MessageQueue();
    const paymentLocks = new Map();

    const sock = makeWASocket({
      ...(latest?.version ? { version: latest.version } : {}),
      auth: state,
      printQRInTerminal: false,
      logger: Pino({ level: process.env.BOT_LOG_LEVEL || 'silent' }),
      browser: ['Premiumin Plus', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    const handler = new MessageHandler({ sessionId, sock, api, paymentLocks });
    const session = { sessionId, apiKey, api, sock, queue, backoff, paymentLocks, handler, status: 'connecting', qr: '', resetRetries };
    this.sessions.set(sessionId, session);

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => this.onConnectionUpdate(sessionId, update));
    sock.ev.on('messages.upsert', ({ messages }) => {
      for (const message of messages || []) {
        const messageId = message.key?.id || `${Date.now()}:${Math.random()}`;
        queue.add(messageId, () => handler.handle(message));
      }
    });

    return this.snapshot(sessionId);
  }

  async onConnectionUpdate(sessionId, update) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (update.qr) {
      session.qr = update.qr;
      session.status = 'qr';
      await session.api.sessionStatus('qr').catch(() => {});
      const qr_image = await QRCode.toDataURL(update.qr).catch(() => '');
      this.broadcast(sessionId, { type: 'qr', qr: update.qr, qr_image });
    }
    if (update.connection === 'open') {
      session.status = 'connected';
      session.qr = '';
      session.backoff.reset();
      await session.api.sessionStatus('connected').catch(() => {});
      this.broadcast(sessionId, { type: 'status', status: 'connected' });
      await notifyAdmin(session.sock, ['BOT LOGIN', `session: ${sessionId}`, 'status: connected']);
    }
    if (update.connection === 'close') {
      const statusCode = update.lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const retryFreshSession = loggedOut && session.status === 'connecting' && session.resetRetries < 1;
      const apiKey = session.apiKey;
      await this.cleanup(sessionId, loggedOut ? 'logged_out' : 'disconnected');
      if (retryFreshSession) {
        setTimeout(() => this.connect({ userId: sessionId, apiKey, resetRetries: session.resetRetries + 1 }).catch(() => {}), 750).unref();
        return;
      }
      if (!loggedOut) {
        const delay = session.backoff.nextDelay();
        if (delay !== null) {
          setTimeout(() => this.connect({ userId: sessionId, apiKey: session.apiKey }).catch(() => {}), delay).unref();
        } else {
          await session.api.sessionStatus('error').catch(() => {});
        }
      }
    }
  }

  async disconnect(sessionId) {
    await this.cleanup(String(sessionId), 'logged_out');
    await this.deleteSessionFiles(String(sessionId)).catch(() => {});
    return this.snapshot(String(sessionId));
  }

  async cleanup(sessionId, status = 'disconnected') {
    const session = this.sessions.get(String(sessionId));
    if (!session) return;
    for (const lock of session.paymentLocks.values()) clearInterval(lock?.timer || lock);
    session.paymentLocks.clear();
    session.queue.clear();
    session.sock.ev.removeAllListeners('connection.update');
    session.sock.ev.removeAllListeners('messages.upsert');
    session.sock.ev.removeAllListeners('creds.update');
    if (status === 'logged_out') {
      await session.sock.logout().catch(() => {});
    } else {
      session.sock.end?.(new Error(`session ${status}`));
    }
    await session.api.sessionStatus(status).catch(() => {});
    this.sessions.delete(String(sessionId));
    if (status === 'logged_out') {
      await this.deleteSessionFiles(sessionId).catch(() => {});
    }
    this.broadcast(String(sessionId), { type: 'status', status });
  }

  startSessionPruner() {
    if (!config.sessionCleanup.enabled || this.cleanupTimer) return;
    this.pruneAllSessions().catch(() => {});
    this.cleanupTimer = setInterval(() => {
      this.pruneAllSessions().catch(() => {});
    }, config.sessionCleanup.intervalMs);
    this.cleanupTimer.unref?.();
  }

  stopSessionPruner() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  async shutdownAll(status = 'disconnected') {
    this.stopSessionPruner();
    const ids = Array.from(this.sessions.keys());
    await Promise.allSettled(ids.map((sessionId) => this.cleanup(sessionId, status)));
  }

  async pruneAllSessions() {
    if (this.cleanupRunning) return { removed: 0 };
    this.cleanupRunning = true;
    try {
      const root = fileURLToPath(config.sessionsDir);
      await fs.mkdir(root, { recursive: true });
      const entries = await fs.readdir(root, { withFileTypes: true });
      let removed = 0;
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        removed += (await this.pruneSessionFiles(entry.name).catch(() => ({ removed: 0 }))).removed || 0;
      }
      return { removed };
    } finally {
      this.cleanupRunning = false;
    }
  }

  async pruneSessionFiles(sessionId) {
    const key = String(sessionId);
    const sessionPath = fileURLToPath(new URL(`./${key}/`, config.sessionsDir));
    const root = path.resolve(fileURLToPath(config.sessionsDir));
    const resolvedSessionPath = path.resolve(sessionPath);
    if (!resolvedSessionPath.startsWith(root + path.sep)) return { removed: 0 };

    await fs.mkdir(resolvedSessionPath, { recursive: true });
    const files = await fs.readdir(resolvedSessionPath, { withFileTypes: true });
    const now = Date.now();
    let removed = 0;
    const keepNames = new Set(['creds.json']);
    const keepPrefixes = ['app-state-sync-key-', 'app-state-sync-version-', 'identity-key-'];
    const prunePrefixes = ['device-list-', 'lid-mapping-', 'pre-key-', 'sender-key-', 'tctoken-'];

    for (const file of files) {
      if (!file.isFile()) continue;
      const name = file.name;
      if (!name.endsWith('.json')) continue;
      if (keepNames.has(name) || keepPrefixes.some((prefix) => name.startsWith(prefix))) continue;
      if (!prunePrefixes.some((prefix) => name.startsWith(prefix))) continue;

      const fullPath = path.resolve(resolvedSessionPath, name);
      if (!fullPath.startsWith(resolvedSessionPath + path.sep)) continue;
      const stat = await fs.stat(fullPath).catch(() => null);
      if (!stat || now - stat.mtimeMs < config.sessionCleanup.ttlMs) continue;
      await fs.rm(fullPath, { force: true }).catch(() => {});
      removed += 1;
    }

    return { removed };
  }

  async deleteSessionFiles(sessionId) {
    const key = String(sessionId);
    const sessionPath = fileURLToPath(new URL(`./${key}/`, config.sessionsDir));
    const root = path.resolve(fileURLToPath(config.sessionsDir));
    const resolvedSessionPath = path.resolve(sessionPath);
    if (!resolvedSessionPath.startsWith(root + path.sep)) return { removed: false };

    await fs.rm(resolvedSessionPath, { recursive: true, force: true });
    return { removed: true };
  }

  snapshot(sessionId) {
    const session = this.sessions.get(String(sessionId));
    return {
      sessionId: String(sessionId),
      status: session?.status || 'disconnected',
      hasSocket: Boolean(session?.sock),
      qr: session?.qr || '',
    };
  }
}
