import { listProducts } from '../../repositories/product.repo.js';
import { query } from '../../config/db.js';
import env from '../../config/env.js';
import { getBotSettings, getMarkupSetting, getSetting, setSetting } from '../../repositories/settings.repo.js';
import { updateUser } from '../../repositories/user.repo.js';
import { calculateFinalBotPrice } from '../../services/pricing.service.js';
import { getBotLockRequired, getLockedBalance, getSaldoUtama, getUsableBalance, setBotBalanceLock } from '../../services/wallet.service.js';
import { createBotOrderPayment, refreshDirectPaymentStatus } from '../payment/payment.service.js';
import { getCache, setCache } from '../../services/cache.service.js';
import { publishUserRefresh } from '../../services/realtime.service.js';
import { composeOpenHour, getBotTemplateSettings, saveBotTemplateSettings } from '../../services/bot-template.service.js';

const DEFAULT_USER_BOT_SETTINGS = {
  enabled: false,
  allow_group_reply: false,
  allowed_group_lids: [],
  margin_setting: 0,
  greeting_template: '',
  store_name: 'Premiumin Pluus',
  admin_whatsapp: '',
  open_hour: '08.00 - 22.00 WIB',
};

export function getBotBalanceState(user) {
  const lockRequired = getBotLockRequired(user);
  const saldo = getSaldoUtama(user);
  const lockedBalance = getLockedBalance(user);
  const usableBalance = getUsableBalance(user);
  return {
    lock_required: lockRequired,
    locked_balance: lockedBalance,
    usable_balance: usableBalance,
    lock_satisfied: lockedBalance >= lockRequired && saldo >= lockedBalance,
    saldo_sufficient: saldo >= lockRequired && saldo >= lockedBalance,
  };
}

export async function getUserBotSettings(user) {
  const global = await getBotSettings();
  const savedRaw = await getSetting(`bot_settings:user:${user.id}`, {});
  const {
    lock_required: _savedLockRequired,
    locked_balance: _savedLockedBalance,
    usable_balance: _savedUsableBalance,
    bot_locked: _savedBotLocked,
    lock_satisfied: _savedLockSatisfied,
    saldo_sufficient: _savedSaldoSufficient,
    ...saved
  } = savedRaw && typeof savedRaw === 'object' ? savedRaw : {};
  const state = getBotBalanceState(user);
  const template = await getBotTemplateSettings(user, saved);
  const enabled = Boolean((saved.enabled ?? user.bot_enabled) && state.lock_satisfied && state.saldo_sufficient);
  const botLocked = !state.saldo_sufficient;

  return {
    user_id: user.id,
    account_role: user.role || 'member',
    ...global,
    ...DEFAULT_USER_BOT_SETTINGS,
    ...saved,
    enabled,
    desired_enabled: Boolean(saved.enabled ?? user.bot_enabled),
    bot_locked: botLocked,
    bot_session_status: user.bot_session_status || 'disconnected',
    bot_role: user.bot_role || 'personal',
    active_theme: template.active_theme,
    store_name: template.store_name,
    opening_hour: template.opening_hour,
    closing_hour: template.closing_hour,
    admin_whatsapp: template.admin_whatsapp,
    footer_text: template.footer_text,
    open_hour: composeOpenHour(template),
    bot_template: template,
    ...state,
  };
}

export async function updateUserBotSettings(user, payload = {}) {
  const wantsEnabled = Boolean(payload.enabled);

  const current = await getUserBotSettings(user);
  const template = await saveBotTemplateSettings(user, payload, current);
  const next = {
    enabled: wantsEnabled,
    allow_group_reply: Boolean(payload.allow_group_reply ?? current.allow_group_reply ?? false),
    allowed_group_lids: Array.isArray(payload.allowed_group_lids)
      ? payload.allowed_group_lids.map((item) => String(item).trim()).filter(Boolean).slice(0, 50)
      : String(payload.allowed_group_lids ?? current.allowed_group_lids?.join('\n') ?? '')
          .split(/[\n,]+/)
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 50),
    margin_setting: Math.max(0, Number(payload.margin_setting ?? current.margin_setting ?? 0)),
    greeting_template: String(payload.greeting_template ?? current.greeting_template ?? '').slice(0, 1200),
    store_name: template.store_name,
    admin_whatsapp: template.admin_whatsapp,
    open_hour: composeOpenHour(template),
    active_theme: template.active_theme,
    opening_hour: template.opening_hour,
    closing_hour: template.closing_hour,
    footer_text: template.footer_text,
  };

  const updated = await setBotBalanceLock(user, wantsEnabled);
  await setSetting(`bot_settings:user:${user.id}`, next);
  publishUserRefresh(user.id, 'bot_settings_updated', { scope: 'bot', entity: 'settings' });
  return getUserBotSettings({ ...user, ...updated });
}

export async function updateBotSession(user, status) {
  const allowed = ['disconnected', 'connecting', 'qr', 'connected', 'logged_out', 'error'];
  const nextStatus = allowed.includes(String(status)) ? String(status) : 'disconnected';
  if ((user.bot_session_status || 'disconnected') === nextStatus) {
    return { ...(await getUserBotSettings(user)), bot_session_status: nextStatus };
  }

  await updateUser(user.id, { bot_session_status: nextStatus });
  publishUserRefresh(user.id, 'bot_status_updated', { scope: 'bot', entity: 'session', id: nextStatus });
  return { ...(await getUserBotSettings({ ...user, bot_session_status: nextStatus })), bot_session_status: nextStatus };
}

export async function getBotCatalog(user) {
  const userSettings = await getUserBotSettings(user);
  const extraMargin = Math.max(0, Number(userSettings.margin_setting || 0));
  const cacheKey = `bot-catalog:${user.id}:${user.role}:${user.markup_percent || 0}:${extraMargin}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const products = await listProducts();
  const markup = await getMarkupSetting();

  const catalog = products
    .filter((product) => product.status === 'active' && product.is_bot_enabled !== false && product.is_visible !== false)
    .map((product, index) => {
      const pricing = calculateFinalBotPrice(product, markup, user, extraMargin);
      const stock = Number(product.effective_stock ?? product.stock ?? 0);
      return {
        id: product.id,
        bot_code: index + 1,
        name: product.name,
        stock,
        provider_price: pricing.provider_price,
        role_price: pricing.role_price,
        bot_markup: pricing.bot_markup,
        bot_markup_profit: pricing.bot_markup_profit,
        final_bot_price: pricing.final_bot_price,
        price_sell: pricing.final_bot_price,
        code: `buy ${index + 1}`,
        available: stock > 0,
      };
    });
  setCache(cacheKey, catalog, env.BOT_CATALOG_CACHE_MS);
  return catalog;
}

export async function createBotPayment(user, payload = {}) {
  const settings = await getUserBotSettings(user);
  if (!settings.enabled || settings.bot_locked) {
    const error = new Error('Saldo bot tidak mencukupi. Silahkan isi saldo Premiumin Pluus terlebih dahulu.');
    error.statusCode = 403;
    throw error;
  }

  const cacheKey = `bot-order-lock:${user.id}:${payload.customer_whatsapp || 'unknown'}`;
  if (getCache(cacheKey)) {
    const error = new Error('Order sedang diproses. Tunggu beberapa detik sebelum membuat QR baru.');
    error.statusCode = 429;
    throw error;
  }
  setCache(cacheKey, true, 5000);

  const targetWhatsapp = String(payload.customer_whatsapp || '').replace(/\D/g, '').slice(0, 30);
  const catalog = await getBotCatalog(user);
  const requestedCode = Number(payload.product_id || payload.code || payload.bot_code || 0);
  const product = catalog.find((item) => item.id === requestedCode || item.bot_code === requestedCode);
  if (!product) {
    const error = new Error('Produk tidak ditemukan');
    error.statusCode = 404;
    throw error;
  }
  if (!product.available) {
    const error = new Error('Stok produk habis');
    error.statusCode = 400;
    throw error;
  }

  const finalBotPrice = Number(product.price_sell || 0);
  const existingPayments = await query(
    `SELECT p.*, pr.name AS product_name
     FROM payments p
     LEFT JOIN products pr ON pr.id = p.product_id
     WHERE p.user_id = ?
       AND p.payment_type = 'bot_order'
       AND p.status = 'pending'
       AND p.product_id = ?
       AND p.amount = ?
       AND (p.expired_at IS NULL OR p.expired_at > NOW())
       AND (? = '' OR p.target_whatsapp = ?)
     ORDER BY p.id DESC
     LIMIT 1`,
    [user.id, product.id, finalBotPrice, targetWhatsapp, targetWhatsapp],
  );
  if (existingPayments[0]) {
    return {
      ...existingPayments[0],
      amount: Number(existingPayments[0].amount || 0),
      total_bayar: Number(existingPayments[0].total_bayar || existingPayments[0].amount || 0),
      qty: Number(existingPayments[0].qty || 1),
    };
  }

  return createBotOrderPayment(user, {
    product_id: product.id,
    qty: 1,
    target_whatsapp: payload.customer_whatsapp,
    final_amount: finalBotPrice,
    role_price: Number(product.role_price || 0),
    bot_markup: Number(product.bot_markup || 0),
    extra_margin: Math.max(0, Number(settings.margin_setting || 0)),
  });
}

export async function getBotPaymentStatus(user, invoice) {
  return refreshDirectPaymentStatus(invoice, user);
}

