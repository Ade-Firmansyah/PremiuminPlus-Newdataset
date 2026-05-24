import {
  renderAdmin,
  renderBotLocked,
  renderCatalog,
  renderGenericError,
  renderGreeting,
  renderInsufficientBalance,
  renderPayment,
  renderPaymentFailed,
  renderPaymentPending,
  renderPaymentSuccessProcessing,
  renderStockEmpty,
  renderSuccess,
  renderTransactionClosed,
} from '../services/render.js';
import { notifyAdmin } from '../notifications/admin.js';
import { config } from '../config.js';

const GREETING = new Set(['p', 'ping', 'kak', 'ka', 'bang', 'bro', 'mba', 'bray']);
const STOCK = new Set(['stok', 'list']);

function textFromMessage(message) {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    ''
  ).trim();
}

function normalizePhone(jid) {
  return String(jid || '').split('@')[0].replace(/\D/g, '');
}

function qrImageFromPayment(payment = {}) {
  const source = payment.qr_image || payment.qr_raw || '';
  if (typeof source !== 'string' || !source) return null;
  if (/^https?:\/\//i.test(source)) return { url: source };
  const base64 = source.startsWith('data:image') ? source.split(',')[1] : '';
  if (!base64) return null;
  return Buffer.from(base64, 'base64');
}

function isGroupJid(jid) {
  return String(jid || '').endsWith('@g.us');
}

function isPrivateJid(jid) {
  const value = String(jid || '');
  return value.endsWith('@s.whatsapp.net') || value.endsWith('@lid');
}

function isGroupOrCommunityMessage(message) {
  const jid = String(message?.key?.remoteJid || '');
  if (isGroupJid(jid)) return true;
  if (message?.key?.participant) return true;
  if (jid === 'status@broadcast' || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return true;
  return !isPrivateJid(jid);
}

function normalizeGroupKey(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.includes('@') ? raw : raw.replace(/\D/g, '');
}

function canReplyInChat(message, settings = {}) {
  const jid = message?.key?.remoteJid;
  if (!isGroupOrCommunityMessage(message)) return true;
  if (!settings.allow_group_reply) return false;

  const allowed = Array.isArray(settings.allowed_group_lids) ? settings.allowed_group_lids : [];
  const jidKey = normalizeGroupKey(jid);
  const jidNumber = normalizePhone(jid);
  const participantKey = normalizeGroupKey(message?.key?.participant);
  return allowed.some((item) => {
    const key = normalizeGroupKey(item);
    return key && (key === jidKey || key === jidNumber || key === participantKey);
  });
}

function jakartaMinutesNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

function parseOperatingHours(value) {
  const matches = String(value || '').match(/\d{1,2}[\.:]\d{2}/g);
  if (!matches || matches.length < 2) return null;

  const toMinutes = (input) => {
    const [hour, minute] = input.split(/[\.:]/).map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return Math.min(Math.max(hour, 0), 23) * 60 + Math.min(Math.max(minute, 0), 59);
  };

  const start = toMinutes(matches[0]);
  const end = toMinutes(matches[1]);
  if (start === null || end === null || start === end) return null;
  return { start, end };
}

function isTransactionOpen(settings = {}) {
  const window = parseOperatingHours(settings.open_hour);
  const now = jakartaMinutesNow();
  if (!window) return now >= 8 * 60 && now < 24 * 60;
  if (window.start < window.end) return now >= window.start && now < window.end;
  return now >= window.start || now < window.end;
}

function hasDeliveredAccount(order = {}) {
  return Boolean(order?.email_account || order?.password_account || (Array.isArray(order?.accounts) && order.accounts.length));
}

function botTemplateFromSettings(settings = {}) {
  const template = { ...(settings.bot_template || {}) };
  for (const key of ['active_theme', 'store_name', 'opening_hour', 'closing_hour', 'open_hour', 'admin_whatsapp', 'footer_text']) {
    if (settings[key] !== undefined && settings[key] !== null && settings[key] !== '') {
      template[key] = settings[key];
    }
  }
  return template;
}

export class MessageHandler {
  constructor({ sessionId, sock, api, paymentLocks }) {
    this.sessionId = sessionId;
    this.sock = sock;
    this.api = api;
    this.paymentLocks = paymentLocks;
    this.profileCache = null;
    this.profileCacheAt = 0;
  }

  async getProfile() {
    const now = Date.now();
    if (this.profileCache && now - this.profileCacheAt < 5000) {
      return this.profileCache;
    }

    this.profileCache = await this.api.profile();
    this.profileCacheAt = now;
    return this.profileCache;
  }

  async handle(message) {
    const raw = message.message;
    const text = textFromMessage(raw);
    const command = text.toLowerCase().replace(/\s+/g, ' ').trim();
    const jid = message.key.remoteJid;
    if (!jid || message.key.fromMe || !command) return;

    const isKnownCommand = GREETING.has(command) || STOCK.has(command) || command === 'admin' || command.startsWith('buy ');
    if (!isKnownCommand) return;

    const profile = await this.getProfile();
    const settings = profile.settings || {};
    const botTemplate = botTemplateFromSettings(settings);
    if (!canReplyInChat(message, settings)) return;

    if (settings.bot_locked || !settings.enabled) {
      await this.sock.sendMessage(jid, {
        text: renderBotLocked({
            memberMinimum: settings.lock_required && profile.user?.role === 'member' ? settings.lock_required : 5000,
            resellerMinimum: settings.lock_required && profile.user?.role === 'reseller' ? settings.lock_required : 25000,
        }, botTemplate),
      });
      return;
    }

    if (GREETING.has(command)) {
      await this.sock.sendMessage(jid, {
        text: renderGreeting({
          name: message.pushName || normalizePhone(jid),
          storeName: settings.store_name || 'Premiumin Plus',
          openHour: settings.open_hour || '07.30 WIB - 21.45 WIB',
        }, botTemplate),
      });
      return;
    }

    if (command === 'admin') {
      await this.sock.sendMessage(jid, {
        text: renderAdmin({
          adminWhatsapp: settings.admin_whatsapp,
          openHour: settings.open_hour || '07.30 WIB - 21.45 WIB',
        }, botTemplate),
      });
      return;
    }

    if (STOCK.has(command)) {
      const products = await this.api.catalog();
      await this.sock.sendMessage(jid, { text: renderCatalog(products, settings.store_name || 'Premiumin Plus', botTemplate) });
      return;
    }

    if (command.startsWith('buy ')) {
      if (!isTransactionOpen(settings)) {
        await this.sock.sendMessage(jid, { text: renderTransactionClosed(settings, botTemplate) });
        return;
      }

      const code = Number(command.split(' ')[1]);
      if (!Number.isInteger(code) || code < 1) return;
      try {
        const order = await this.api.createOrder({ code, customerWhatsapp: normalizePhone(jid) });
        if (order?.status === 'pending' || order?.payment_status === 'pending') {
          if (this.paymentLocks.has(order.invoice)) {
            await this.sock.sendMessage(jid, { text: renderPaymentPending(order, botTemplate) });
            return;
          }
          const paymentText = renderPayment(order, order.product_name || order.product || 'Produk', botTemplate);
          const qrImage = qrImageFromPayment(order);
          let sentMessage = null;
          if (qrImage) {
            sentMessage = await this.sock.sendMessage(jid, { image: qrImage, caption: paymentText });
          } else {
            sentMessage = await this.sock.sendMessage(jid, { text: paymentText });
          }
          this.pollPayment(jid, order.invoice, sentMessage?.key || null, botTemplate);
        } else if (order?.status === 'failed' || order?.payment_status === 'failed') {
          await this.sock.sendMessage(jid, { text: renderPaymentFailed(order, botTemplate) });
        } else {
          await this.sock.sendMessage(jid, { text: renderSuccess(order, {}, botTemplate) });
        }
        await notifyAdmin(this.sock, [
          'BOT ORDER',
          `user: ${profile.user?.username}`,
          `role: ${profile.user?.role}`,
          `nominal: ${order.total_price || order.amount}`,
          `invoice: ${order.invoice}`,
          `status: ${order.status || order.order_status || 'processing'}`,
        ]);
      } catch (error) {
        const messageText = String(error?.message || '').toLowerCase();
        if (error?.statusCode === 402 || messageText.includes('saldo') || messageText.includes('insufficient')) {
          await this.sock.sendMessage(jid, {
            text: renderInsufficientBalance({
              storeName: settings.store_name || 'Premiumin Plus',
            }, botTemplate),
          });
          return;
        }
        if (messageText.includes('stok') || messageText.includes('stock')) {
          await this.sock.sendMessage(jid, { text: renderStockEmpty(botTemplate) });
          return;
        }
        await this.sock.sendMessage(jid, { text: renderGenericError(error?.message || 'Order belum bisa diproses.', botTemplate) });
      }
    }
  }

  async deleteQrMessage(jid, qrMessageKey) {
    if (!qrMessageKey) return;
    await this.sock.sendMessage(jid, { delete: qrMessageKey }).catch(() => {});
  }

  pollPayment(jid, invoice, qrMessageKey = null, template = {}) {
    if (this.paymentLocks.has(invoice)) return;
    const startedAt = Date.now();
    const state = {
      timer: null,
      firstTimer: null,
      qrMessageKey,
      qrDeleted: false,
      paymentSuccessNotified: false,
      checking: false,
      closed: false,
    };
    const close = () => {
      if (state.closed) return;
      state.closed = true;
      if (state.timer) clearInterval(state.timer);
      if (state.firstTimer) clearTimeout(state.firstTimer);
      this.paymentLocks.delete(invoice);
    };
    const checkPayment = async () => {
      if (state.closed || state.checking) return;
      state.checking = true;
      if (Date.now() - startedAt > config.paymentPolling.timeoutMs) {
        if (!state.qrDeleted) {
          await this.deleteQrMessage(jid, state.qrMessageKey);
          state.qrDeleted = true;
        }
        await this.sock.sendMessage(jid, { text: renderPaymentFailed({ invoice, status: 'expired' }, template) });
        close();
        state.checking = false;
        return;
      }
      try {
        const payment = await this.api.paymentStatus(invoice);
        if (state.closed) return;
        if (payment?.status === 'success') {
          if (!state.qrDeleted) {
            await this.deleteQrMessage(jid, state.qrMessageKey);
            state.qrDeleted = true;
          }
          if (!state.paymentSuccessNotified) {
            await this.sock.sendMessage(jid, { text: renderPaymentSuccessProcessing(payment, template) });
            state.paymentSuccessNotified = true;
            await notifyAdmin(this.sock, ['BOT PAYMENT SUCCESS', `invoice: ${invoice}`, `status: processing_delivery`]);
          }
          if (payment?.order?.order_status === 'success' && hasDeliveredAccount(payment.order)) {
            close();
            await this.deleteQrMessage(jid, state.qrMessageKey);
            await this.sock.sendMessage(jid, { text: renderSuccess(payment.order, payment, template) });
            await notifyAdmin(this.sock, ['BOT ORDER SUCCESS', `invoice: ${invoice}`, `status: completed`]);
          }
        } else if (['failed', 'expired', 'canceled'].includes(String(payment?.status || '').toLowerCase())) {
          close();
          if (!state.qrDeleted) {
            await this.deleteQrMessage(jid, state.qrMessageKey);
            state.qrDeleted = true;
          }
          await this.sock.sendMessage(jid, { text: renderPaymentFailed(payment, template) });
        }
      } catch {
        // Payment polling is guarded by Web-Core and intentionally quiet.
      } finally {
        state.checking = false;
      }
    };

    state.firstTimer = setTimeout(checkPayment, config.paymentPolling.firstCheckDelayMs);
    state.timer = setInterval(checkPayment, config.paymentPolling.intervalMs);
    this.paymentLocks.set(invoice, state);
  }
}
