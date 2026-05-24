import { BOT_TEMPLATE_THEMES, DEFAULT_BOT_TEMPLATE, findBotTemplateByUserId, upsertBotTemplate } from '../repositories/bot-template.repo.js';
import { clearCache } from './cache.service.js';
import { publishUserRefresh } from './realtime.service.js';
import {
  renderAdmin,
  renderBotLocked,
  renderGenericError,
  renderGreeting,
  renderInsufficientBalance,
  renderOrderSuccess,
  renderPayment,
  renderPaymentFailed,
  renderPaymentPending,
  renderPaymentSuccess,
  renderStock,
  renderStockEmpty,
  renderTransactionClosed,
} from '../../../shared/bot-template-renderer.js';

function normalizeHour(value, fallback) {
  const text = String(value || fallback || '').trim().replace(/\s*WIB$/i, '');
  const match = text.match(/^(\d{1,2})[\.:](\d{2})$/);
  if (!match) return fallback;
  const hour = Math.min(Math.max(Number(match[1]), 0), 23);
  const minute = Math.min(Math.max(Number(match[2]), 0), 59);
  return `${String(hour).padStart(2, '0')}.${String(minute).padStart(2, '0')}`;
}

export function composeOpenHour(template = {}) {
  return `${template.opening_hour || DEFAULT_BOT_TEMPLATE.opening_hour} - ${template.closing_hour || DEFAULT_BOT_TEMPLATE.closing_hour} WIB`;
}

export function normalizeBotTemplatePayload(payload = {}, fallback = {}) {
  const activeTheme = BOT_TEMPLATE_THEMES.includes(payload.active_theme) ? payload.active_theme : fallback.active_theme || DEFAULT_BOT_TEMPLATE.active_theme;
  return {
    active_theme: activeTheme,
    store_name: String(payload.store_name ?? fallback.store_name ?? DEFAULT_BOT_TEMPLATE.store_name).trim().slice(0, 120) || DEFAULT_BOT_TEMPLATE.store_name,
    opening_hour: normalizeHour(payload.opening_hour ?? payload.openingHour, fallback.opening_hour || DEFAULT_BOT_TEMPLATE.opening_hour),
    closing_hour: normalizeHour(payload.closing_hour ?? payload.closingHour, fallback.closing_hour || DEFAULT_BOT_TEMPLATE.closing_hour),
    admin_whatsapp: String(payload.admin_whatsapp ?? fallback.admin_whatsapp ?? '').replace(/\D/g, '').slice(0, 30),
    footer_text: String(payload.footer_text ?? fallback.footer_text ?? DEFAULT_BOT_TEMPLATE.footer_text).trim().slice(0, 180) || DEFAULT_BOT_TEMPLATE.footer_text,
  };
}

export async function getBotTemplateSettings(user, fallbackSettings = {}) {
  const fallback = normalizeBotTemplatePayload({
    active_theme: fallbackSettings.active_theme,
    store_name: fallbackSettings.store_name || user?.username || DEFAULT_BOT_TEMPLATE.store_name,
    opening_hour: fallbackSettings.opening_hour,
    closing_hour: fallbackSettings.closing_hour,
    admin_whatsapp: fallbackSettings.admin_whatsapp,
    footer_text: fallbackSettings.footer_text,
  });
  return findBotTemplateByUserId(user.id, fallback);
}

export async function saveBotTemplateSettings(user, payload = {}, fallbackSettings = {}) {
  const current = await getBotTemplateSettings(user, fallbackSettings);
  const next = normalizeBotTemplatePayload(payload, current);
  const saved = await upsertBotTemplate(user.id, next);
  clearCache();
  publishUserRefresh(user.id, 'bot.template.updated', { scope: 'bot', entity: 'template', id: saved.active_theme });
  return saved;
}

export {
  renderAdmin,
  renderBotLocked,
  renderGenericError,
  renderGreeting,
  renderInsufficientBalance,
  renderOrderSuccess,
  renderPayment,
  renderPaymentFailed,
  renderPaymentPending,
  renderPaymentSuccess,
  renderStock,
  renderStockEmpty,
  renderTransactionClosed,
};

export function renderBotTemplatePreview(template = {}, user = {}) {
  const sampleProducts = [
    { name: 'CAPCUT PRO 1 BULAN', price_sell: 13400, stock: 16, bot_code: 1, available: true },
    { name: 'AM EXP APRIL 2027', price_sell: 1256, stock: 228, bot_code: 2, available: true },
    { name: 'VIU PREMIUM LIFETIME', price_sell: 926, stock: 100, bot_code: 4, available: true },
    { name: 'NETFLIX SHARING', price_sell: 18000, stock: 0, bot_code: 7, available: false },
  ];
  const samplePayment = {
    invoice: 'INV-20260517-00001',
    product_name: 'AM EXP JANUARI 2027',
    amount: 660,
    total_bayar: 860,
  };
  const sampleOrder = {
    invoice: 'API-20260517203000-b182',
    product_name: 'AM EXP JANUARI 2027',
    total_price: 860,
    email_account: 'example@gmail.com',
    password_account: 'masuk12345',
  };
  const username = user?.username || 'Customer';
  return {
    greeting: renderGreeting(template, { username, role: user?.role || 'member' }),
    stock: renderStock(template, { products: sampleProducts }),
    payment: renderPayment(template, { payment: samplePayment, product_name: samplePayment.product_name }),
    payment_success: renderPaymentSuccess(template, { payment: samplePayment }),
    order_success: renderOrderSuccess(template, { order: sampleOrder, payment: samplePayment }),
    admin: renderAdmin(template, { admin_number: template.admin_whatsapp }),
  };
}
