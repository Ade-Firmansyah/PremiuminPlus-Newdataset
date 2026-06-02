import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import pino from 'pino';
import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  makeWASocket,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { nextReconnectDelay } from '../reconnect/reconnect-policy.js';
import { createMemoryQueue } from '../queue/in-memory-queue.js';
import { createMessageHandler, formatSuccess } from '../handlers/message.handler.js';
import { createWebCoreClient } from '../api-client/web-core.client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionsRoot = path.resolve(__dirname, '..', 'sessions');
const silentLogger = pino({ level: process.env.BOT_LOG_LEVEL || 'silent' });

function toSessionId(value) {
  return String(value || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function normalizeJid(jid = '') {
  return jid ? String(jid).split(':')[0] : '';
}

export class BotSessionManager {
  constructor({ logger, webCoreBaseUrl }) {
    this.logger = logger;
    this.webCoreBaseUrl = webCoreBaseUrl;
    this.sessions = new Map();
  }

  getStatus(sessionId) {
    const session = this.sessions.get(toSessionId(sessionId));
    if (!session) {
      return {
        session_id: toSessionId(sessionId),
        status: 'idle',
        connected: false,
        qr: null,
        connected_number: null,
        last_active: null,
        reconnect_attempt: 0,
      };
    }

    return {
      session_id: session.id,
      status: session.status,
      connected: session.status === 'connected',
      qr: session.qr,
      connected_number: session.connectedNumber,
      last_active: session.lastActive,
      reconnect_attempt: session.reconnectAttempt,
    };
  }

  async connect({ sessionId, apiKey }) {
    const id = toSessionId(sessionId);
    const existing = this.sessions.get(id);
    if (existing?.starting || existing?.status === 'connected' || existing?.status === 'qr') {
      return this.getStatus(id);
    }

    const session = existing || this.createSession(id, apiKey);
    session.apiKey = apiKey;
    session.starting = true;
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }
    this.sessions.set(id, session);

    try {
      await this.startSocket(session);
    } finally {
      session.starting = false;
    }

    return this.getStatus(id);
  }

  async logout(sessionId) {
    const id = toSessionId(sessionId);
    const session = this.sessions.get(id);
    if (!session) return this.getStatus(id);

    await this.cleanup(session);
    try {
      await fs.rm(session.path, { recursive: true, force: true });
    } catch {
      // Session deletion is best-effort; status is still reset.
    }
    this.sessions.delete(id);
    return this.getStatus(id);
  }

  async notifyAdmin({ title = 'TRANSACTION NOTIFICATION', lines = [], lid = process.env.ADMIN_MONITORING_LID || '64957102211197@lid' }) {
    const adminSession = [...this.sessions.values()].find((session) => session.id.startsWith('admin-') && session.status === 'connected' && session.socket);
    if (!adminSession) {
      return { status: 'manual_pending', message: 'Admin bot belum connect', lid };
    }

    const body = [`[${title}]`, '', ...lines].join('\n');
    await adminSession.socket.sendMessage(lid, { text: body });
    adminSession.lastActive = new Date().toISOString();
    return { status: 'sent', lid, session_id: adminSession.id };
  }

  async shutdown() {
    const sessions = [...this.sessions.values()];
    await Promise.allSettled(sessions.map((session) => this.cleanup(session)));
    this.sessions.clear();
  }

  createSession(id, apiKey) {
    return {
      id,
      apiKey,
      path: path.join(sessionsRoot, id),
      socket: null,
      queue: createMemoryQueue(),
      status: 'starting',
      qr: null,
      connectedNumber: null,
      lastActive: null,
      reconnectAttempt: 0,
      reconnectTimer: null,
      starting: false,
      intentionallyClosed: false,
      bound: null,
      paymentTimers: new Map(),
    };
  }

  async startSocket(session) {
    await fs.mkdir(session.path, { recursive: true });
    await this.cleanupSocketOnly(session);

    const { state, saveCreds } = await useMultiFileAuthState(session.path);
    const { version } = await fetchLatestBaileysVersion();
    const client = createWebCoreClient({
      apiBaseUrl: this.webCoreBaseUrl,
      apiKey: session.apiKey,
    });
    const handler = createMessageHandler({ client, queue: session.queue, logger: this.logger });

    const socket = makeWASocket({
      version,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      keepAliveIntervalMs: 30000,
      browser: ['Premiumin Plus', 'Chrome', '1.0.0'],
      logger: silentLogger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
      },
    });

    session.socket = socket;
    session.status = 'connecting';
    session.intentionallyClosed = false;

    const onCredsUpdate = saveCreds;
    const onConnectionUpdate = async (update) => this.handleConnectionUpdate(session, update);
    const onMessagesUpsert = async (event) => this.handleMessages(session, event, handler);

    socket.ev.on('creds.update', onCredsUpdate);
    socket.ev.on('connection.update', onConnectionUpdate);
    socket.ev.on('messages.upsert', onMessagesUpsert);
    session.bound = { onCredsUpdate, onConnectionUpdate, onMessagesUpsert };
  }

  async handleConnectionUpdate(session, update) {
    if (update.qr) {
      session.qr = await QRCode.toDataURL(update.qr, { margin: 1, width: 320 });
      session.status = 'qr';
      session.lastActive = new Date().toISOString();
      this.logger.info(`QR generated for ${session.id}`);
    }

    if (update.connection === 'open') {
      session.status = 'connected';
      session.qr = null;
      session.connectedNumber = normalizeJid(session.socket?.user?.id || '');
      session.reconnectAttempt = 0;
      session.lastActive = new Date().toISOString();
      this.logger.info(`Session connected ${session.id}`);
    }

    if (update.connection === 'close') {
      const code = update.lastDisconnect?.error?.output?.statusCode;
      session.status = code === DisconnectReason.loggedOut ? 'logged_out' : 'disconnected';
      session.connectedNumber = null;
      session.lastActive = new Date().toISOString();
      this.logger.error(`Session disconnected ${session.id}`, { code });
      void this.notifyAdmin({
        title: 'BOT DISCONNECTED',
        lines: [`session_id: ${session.id}`, `status_code: ${code || 'unknown'}`],
      }).catch(() => {
        // Monitoring notification is best-effort and must not affect reconnect.
      });

      await this.cleanupSocketOnly(session);

      if (session.intentionallyClosed) return;
      if (code === DisconnectReason.loggedOut) {
        session.qr = null;
        return;
      }

      this.scheduleReconnect(session);
    }
  }

  async handleMessages(session, event, handler) {
    if (event.type !== 'notify') return;
    for (const message of event.messages || []) {
      if (!message.message || message.key?.fromMe) continue;
      const remoteJid = message.key?.remoteJid || '';
      if (remoteJid.endsWith('@g.us')) continue;

      const text =
        message.message.conversation ||
        message.message.extendedTextMessage?.text ||
        message.message.imageMessage?.caption ||
        '';
      const response = await handler({
        text,
        jid: remoteJid,
        messageId: message.key?.id,
        pushName: message.pushName || '',
      });

      if (response && session.socket) {
        if (typeof response === 'object' && response.image) {
          const source = String(response.image).startsWith('data:')
            ? String(response.image)
            : `data:image/png;base64,${response.image}`;
          const buffer = Buffer.from(source.split(',').pop() || '', 'base64');
          await session.socket.sendMessage(remoteJid, { image: buffer, caption: response.text || '' });
          if (response.invoice) {
            this.schedulePaymentWatch(session, remoteJid, response.invoice);
          }
        } else {
          await session.socket.sendMessage(remoteJid, { text: String(response) });
        }
      }
    }
  }

  schedulePaymentWatch(session, remoteJid, invoice) {
    if (session.paymentTimers.has(invoice)) return;
    let statusRunning = false;
    const client = createWebCoreClient({
      apiBaseUrl: this.webCoreBaseUrl,
      apiKey: session.apiKey,
    });

    const finish = () => {
      const timers = session.paymentTimers.get(invoice);
      if (!timers) return;
      for (const timer of Object.values(timers)) {
        clearTimeout(timer);
        clearInterval(timer);
      }
      session.paymentTimers.delete(invoice);
    };

    const statusTimer = setInterval(async () => {
      if (statusRunning) return;
      statusRunning = true;
      try {
        const status = await client.paymentStatus(invoice);
        const paymentStatus = String(status.data?.status || '').toLowerCase();
        const orderStatus = String(status.data?.order?.order_status || '').toLowerCase();

        if (['success', 'payment_success'].includes(paymentStatus) && orderStatus === 'success' && status.data.order && session.socket) {
          await session.socket.sendMessage(remoteJid, { text: formatSuccess(status.data.order) });
          finish();
        } else if (['failed', 'expired', 'canceled'].includes(orderStatus || paymentStatus)) {
          if (session.socket) {
            await session.socket.sendMessage(remoteJid, {
              text: `TRANSAKSI ${invoice}\n\nStatus: ${orderStatus || paymentStatus}\nSilakan order ulang jika masih membutuhkan produk ini.\n\n━━━━━━━━━━━━━━━━━━`,
            });
          }
          finish();
        }
      } catch (error) {
        if (error?.maintenance || error?.statusCode === 503) {
          if (session.socket) {
            await session.socket.sendMessage(remoteJid, { text: 'Web sedang maintenance. Transaksi sementara tidak tersedia.' });
          }
          finish();
        }
      } finally {
        statusRunning = false;
      }
    }, 10 * 1000);

    const reminderTimer = setTimeout(async () => {
      try {
        const status = await client.paymentStatus(invoice);
        if (['pending', 'pending_payment'].includes(String(status.data?.status || '').toLowerCase()) && session.socket) {
          await session.socket.sendMessage(remoteJid, {
            text: [
              '⚠️ PENGINGAT PEMBAYARAN',
              '',
              'Invoice Anda belum dibayar:',
              invoice,
              '',
              '⏳ Sisa waktu: 2 menit',
              '',
              'Segera selesaikan ya 🙏',
              '',
              '━━━━━━━━━━━━━━━━━━',
            ].join('\n'),
          });
        }
      } catch (error) {
        if (error?.maintenance || error?.statusCode === 503) finish();
      }
    }, 3 * 60 * 1000);

    const cancelTimer = setTimeout(async () => {
      try {
        const status = await client.paymentStatus(invoice);
        if (['pending', 'pending_payment'].includes(String(status.data?.status || '').toLowerCase())) {
          await client.paymentCancel(invoice);
          if (session.socket) {
            await session.socket.sendMessage(remoteJid, {
              text: 'TRANSAKSI DIBATALKAN\n\nYah transaksi dibatalkan 😢\nKami tunggu order selanjutnya ya.\n\n━━━━━━━━━━━━━━━━━━',
            });
          }
          finish();
        }
      } catch (error) {
        if (error?.maintenance || error?.statusCode === 503) finish();
      }
    }, 5 * 60 * 1000);

    const maxTimer = setTimeout(() => {
      finish();
    }, 15 * 60 * 1000);

    session.paymentTimers.set(invoice, { statusTimer, reminderTimer, cancelTimer, maxTimer });
  }

  scheduleReconnect(session) {
    if (session.reconnectTimer) return;
    session.reconnectAttempt += 1;
    const delay = nextReconnectDelay(session.reconnectAttempt);
    session.reconnectTimer = setTimeout(async () => {
      session.reconnectTimer = null;
      if (session.intentionallyClosed) return;
      try {
        await this.startSocket(session);
      } catch (error) {
        this.logger.error(`Session reconnect failed ${session.id}`, { message: error.message });
        this.scheduleReconnect(session);
      }
    }, delay);
  }

  async cleanup(session) {
    session.intentionallyClosed = true;
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }
    for (const timers of session.paymentTimers.values()) {
      for (const timer of Object.values(timers)) {
        clearTimeout(timer);
        clearInterval(timer);
      }
    }
    session.paymentTimers.clear();
    await this.cleanupSocketOnly(session);
    session.status = 'idle';
    session.qr = null;
    session.connectedNumber = null;
  }

  async cleanupSocketOnly(session) {
    if (!session.socket) return;
    const { onCredsUpdate, onConnectionUpdate, onMessagesUpsert } = session.bound || {};
    if (onCredsUpdate) session.socket.ev.off('creds.update', onCredsUpdate);
    if (onConnectionUpdate) session.socket.ev.off('connection.update', onConnectionUpdate);
    if (onMessagesUpsert) session.socket.ev.off('messages.upsert', onMessagesUpsert);
    try {
      session.socket.ws?.close();
    } catch {
      // Ignore socket close errors during cleanup.
    }
    session.socket = null;
    session.bound = null;
  }
}
