import { listProducts } from '../../repositories/product.repo.js';
import { getMarkupSetting } from '../../repositories/settings.repo.js';
import { createOrder } from '../order/order.service.js';
import { calculateRoleSellPrice } from '../../services/pricing.service.js';
import env from '../../config/env.js';
import { cancelDirectPayment, createBotOrderPayment, refreshDirectPaymentStatus } from '../payment/payment.service.js';
import { deleteCachePrefix, remember } from '../../services/cache.service.js';
import { execute, query } from '../../config/db.js';
import { findResellerBotSettings, getResellerBotSettings, updateResellerBotSettings } from '../../repositories/reseller-bot-settings.repo.js';

function assertManagedBotAccess(user) {
  if (!user || !['admin', 'reseller'].includes(user.role)) {
    const error = new Error('Managed Bot Engine hanya tersedia untuk admin dan reseller aktif');
    error.statusCode = 403;
    throw error;
  }
  const lockedBalance = Number(user.locked_balance || 0);
  const hasAccess = user.role === 'admin' || (Boolean(user.bot_access_unlocked) && Number(user.saldo || 0) >= lockedBalance && lockedBalance >= 50000);
  if (!hasAccess) {
    const error = new Error(user.bot_disabled_reason || 'Fitur Bot WhatsApp terkunci. Aktivasi membutuhkan locked balance Rp50.000.');
    error.statusCode = 402;
    error.code = 'BOT_ACCESS_LOCKED';
    throw error;
  }
}

function toBuyCode(product, index) {
  return String(index + 1);
}

function getSessionId(user) {
  return `${user.role}-${user.id}`;
}

function normalizeSessionStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'connected') return 'connected';
  if (value === 'connecting' || value === 'starting' || value === 'qr') return 'connecting';
  if (value === 'logged_out') return 'logged_out';
  if (value === 'disconnected') return 'disconnected';
  return 'not_connected';
}

async function syncBotSessionUser(user, status = {}) {
  const sessionId = getSessionId(user);
  const mappedStatus = normalizeSessionStatus(status.status);
  await execute(
    `UPDATE users
     SET bot_session_id = ?,
         bot_session_status = ?,
         bot_connected_number = ?,
         bot_last_active_at = ?
     WHERE id = ?`,
    [
      sessionId,
      mappedStatus,
      status.connected_number || null,
      status.last_active ? new Date(status.last_active) : null,
      Number(user.id),
    ],
  );
  return {
    ...status,
    session_id: status.session_id || sessionId,
    db_status: mappedStatus,
  };
}

function calculateBotSellPrice(product, markup, user, settings) {
  const role = String(user?.role || 'member').toLowerCase();
  const pricingRole = role === 'member' ? 'member' : 'reseller';
  const modalPricing = calculateRoleSellPrice(product, markup, { ...user, role: pricingRole });
  const storedPrice = pricingRole === 'member' ? product.member_price : product.reseller_price;
  const modalPrice = Number(storedPrice || modalPricing.modalPrice || modalPricing.sellPrice || 0);
  const marginValue = Number(settings?.reseller_margin_value || 0);
  const marginType = settings?.reseller_margin_type === 'fixed' ? 'fixed' : 'percent';
  const marginAmount = marginType === 'fixed' ? Math.round(marginValue) : Math.round((modalPrice * marginValue) / 100);
  return {
    modalPrice,
    marginType,
    marginValue,
    marginAmount,
    sellPrice: modalPrice + marginAmount,
  };
}

let botEngineCircuitUntil = 0;

async function botEngineRequest(path, options = {}) {
  if (!env.BOT_ENGINE_URL) {
    const error = new Error('BOT_ENGINE_URL belum dikonfigurasi');
    error.statusCode = 503;
    throw error;
  }

  if (botEngineCircuitUntil > Date.now()) {
    const error = new Error('Bot engine sementara tidak tersedia');
    error.statusCode = 503;
    throw error;
  }

  const headers = {
    'content-type': 'application/json',
    ...(options.headers || {}),
  };
  if (env.BOT_ENGINE_TOKEN) {
    headers['x-bot-engine-token'] = env.BOT_ENGINE_TOKEN;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(`${env.BOT_ENGINE_URL.replace(/\/$/, '')}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.status === false) {
      const error = new Error(payload.message || 'Bot engine request gagal');
      error.statusCode = response.status || 502;
      throw error;
    }
    return payload.data;
  } catch (error) {
    botEngineCircuitUntil = Date.now() + 15_000;
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Bot engine timeout');
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getBotCatalog(user) {
  const products = await listProducts();
  const markup = await getMarkupSetting();
  const settings = await findResellerBotSettings(user);

  return products.map((product, index) => {
    const pricing = calculateBotSellPrice(product, markup, user, settings);
    const stock = Number(product.stock || 0);
    const productCode = toBuyCode(product, index);
    return {
      id: product.id,
      product_id: product.id,
      premku_id: product.premku_id,
      product_code: productCode,
      buy_code: productCode,
      command: `buy${productCode}`,
      code: product.code,
      name: product.name,
      product_name: product.name,
      note: product.note || product.description || '',
      product_source: product.product_source,
      fulfillment_priority: product.fulfillment_priority,
      price: pricing.sellPrice,
      sell_price: pricing.sellPrice,
      base_admin_price: pricing.modalPrice,
      base_price: pricing.modalPrice,
      modal_price: pricing.modalPrice,
      reseller_profit: pricing.marginAmount,
      stock,
      total_stock: stock,
      manual_stock: Number(product.manual_stock || product.manual_stock_count || 0),
      provider_stock: Number(product.provider_stock || product.provider_stock_count || 0),
      max_order_qty: Number(product.max_order_qty || stock),
      availability_status: stock > 0 ? 'tersedia' : 'belum_tersedia',
      status: product.status === 'active' && stock > 0 ? 'available' : 'unavailable',
      order_enabled: product.status === 'active' && stock > 0,
    };
  });
}

export async function botProfile(req, res, next) {
  try {
    assertManagedBotAccess(req.user);
    const settings = await getResellerBotSettings(req.user);

    res.json({
      status: true,
      data: {
        account: {
          id: req.user.id,
          username: req.user.username,
          role: req.user.role,
          saldo: req.user.saldo,
        },
        settings,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function botCatalog(req, res, next) {
  try {
    const data = await remember(`bot:catalog:user:${req.user.id}`, 10, () => getBotCatalog(req.user));
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}

export async function botSettings(req, res, next) {
  try {
    assertManagedBotAccess(req.user);
    const data = await getResellerBotSettings(req.user);
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateBotSettings(req, res, next) {
  try {
    assertManagedBotAccess(req.user);
    const data = await updateResellerBotSettings(req.user, req.body || {});
    deleteCachePrefix(`bot:catalog:user:${req.user.id}`);
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}

function normalizeBuyCode(value = '') {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '').replace(/^buy/, '');
}

function findCatalogProduct(catalog, value) {
  const buyCode = normalizeBuyCode(value);
  return catalog.find((item) => {
    const productCode = normalizeBuyCode(item.product_code || item.buy_code || item.command);
    const legacyCode = String(item.code || '').trim().toLowerCase();
    return productCode === buyCode || legacyCode === buyCode || normalizeBuyCode(legacyCode) === buyCode;
  });
}

export async function botCreateOrder(req, res, next) {
  try {
    const catalog = await getBotCatalog(req.user);
    const product = findCatalogProduct(catalog, req.body?.buy_code || req.body?.product_code || req.body?.code);

    if (!product) {
      return res.status(404).json({ status: false, message: 'Kode produk tidak ditemukan' });
    }

    if (!product.order_enabled) {
      return res.status(400).json({ status: false, message: 'Produk belum tersedia' });
    }

    const data = await createOrder(req.user, {
      product_id: product.id,
      qty: Number(req.body?.qty || 1),
      channel: 'bot',
    });

    return res.status(201).json({ status: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function botCreatePayment(req, res, next) {
  try {
    const catalog = await getBotCatalog(req.user);
    const product = findCatalogProduct(catalog, req.body?.buy_code || req.body?.product_code || req.body?.code);

    if (!product) {
      return res.status(404).json({ status: false, message: 'Kode produk tidak ditemukan' });
    }
    if (!product.order_enabled) {
      return res.status(400).json({ status: false, message: 'Produk belum tersedia' });
    }

    const data = await createBotOrderPayment(req.user, {
      product_id: product.id,
      product_code: product.product_code || product.buy_code || product.command || req.body?.product_code || req.body?.buy_code,
      qty: Number(req.body?.qty || 1),
      buyer_whatsapp: req.body?.buyer_whatsapp,
      buyer_name: req.body?.buyer_name,
    });
    return res.status(201).json({ status: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function botPaymentStatus(req, res, next) {
  try {
    const data = await refreshDirectPaymentStatus(req.params.invoice, req.user);
    if (!data) return res.status(404).json({ status: false, message: 'Payment tidak ditemukan' });
    return res.json({ status: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function botPaymentCancel(req, res, next) {
  try {
    const data = await cancelDirectPayment(req.body?.invoice || req.params.invoice, req.user);
    return res.json({ status: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function botSessionConnect(req, res, next) {
  try {
    assertManagedBotAccess(req.user);
    await execute(
      `UPDATE users
       SET bot_session_id = ?, bot_session_status = 'connecting'
       WHERE id = ?`,
      [getSessionId(req.user), Number(req.user.id)],
    );
    const data = await botEngineRequest(`/sessions/${getSessionId(req.user)}/connect`, {
      method: 'POST',
      body: JSON.stringify({ api_key: req.user.api_key }),
    });
    res.json({ status: true, data: await syncBotSessionUser(req.user, data) });
  } catch (error) {
    next(error);
  }
}

export async function botSessionStatus(req, res, next) {
  try {
    assertManagedBotAccess(req.user);
    const data = await botEngineRequest(`/sessions/${getSessionId(req.user)}/status`);
    res.json({ status: true, data: await syncBotSessionUser(req.user, data) });
  } catch (error) {
    next(error);
  }
}

export async function botSessionLogout(req, res, next) {
  try {
    assertManagedBotAccess(req.user);
    const data = await botEngineRequest(`/sessions/${getSessionId(req.user)}/logout`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    res.json({ status: true, data: await syncBotSessionUser(req.user, { ...data, status: 'logged_out', connected: false, qr: null }) });
  } catch (error) {
    next(error);
  }
}

export async function botHistory(req, res, next) {
  try {
    const rows = await query(
      `SELECT p.invoice, p.amount, p.total_bayar, p.modal_price, p.sell_price, p.reseller_profit, p.status, p.product_id, p.buyer_whatsapp, p.buyer_name, pr.name AS product_name, p.order_invoice, p.created_at, p.processed_at,
              o.order_status, o.provider_status, o.delivery_status, o.email_account, o.password_account
       FROM payments p
       LEFT JOIN products pr ON pr.id = p.product_id
       LEFT JOIN orders o ON o.payment_invoice = p.invoice
       WHERE p.user_id = ? AND p.payment_type = 'bot_order'
       ORDER BY p.id DESC
       LIMIT 50`,
      [Number(req.user.id)],
    );
    res.json({ status: true, data: rows });
  } catch (error) {
    next(error);
  }
}

export async function botAnalytics(req, res, next) {
  try {
    const [row] = await query(
      `SELECT
         COUNT(*) AS total_order_bot,
         COALESCE(SUM(CASE WHEN status IN ('payment_success', 'success') THEN sell_price ELSE 0 END), 0) AS total_pembayaran_masuk,
         COALESCE(SUM(CASE WHEN status IN ('payment_success', 'success') THEN modal_price ELSE 0 END), 0) AS total_modal_keluar,
         COALESCE(SUM(CASE WHEN status IN ('payment_success', 'success') THEN reseller_profit ELSE 0 END), 0) AS total_profit,
         SUM(status IN ('payment_success', 'success')) AS total_transaksi_sukses,
         SUM(status IN ('pending', 'pending_payment')) AS pending_payment
       FROM payments
       WHERE user_id = ? AND payment_type = 'bot_order'`,
      [Number(req.user.id)],
    );
    res.json({
      status: true,
      data: {
        total_order_bot: Number(row?.total_order_bot || 0),
        total_pembayaran_masuk: Number(row?.total_pembayaran_masuk || 0),
        total_modal_keluar: Number(row?.total_modal_keluar || 0),
        total_profit: Number(row?.total_profit || 0),
        total_transaksi_sukses: Number(row?.total_transaksi_sukses || 0),
        pending_payment: Number(row?.pending_payment || 0),
      },
    });
  } catch (error) {
    next(error);
  }
}
