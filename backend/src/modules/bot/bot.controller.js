import { listProducts } from '../../repositories/product.repo.js';
import { getMarkupSetting, getSetting } from '../../repositories/settings.repo.js';
import { createOrder } from '../order/order.service.js';
import { calculateRoleSellPrice } from '../../services/pricing.service.js';
import env from '../../config/env.js';
import { cancelDirectPayment, createBotOrderPayment, refreshDirectPaymentStatus } from '../payment/payment.service.js';

function assertBotUser(user) {
  if (!user || !['admin', 'reseller', 'member'].includes(user.role)) {
    const error = new Error('Bot API tersedia untuk anggota dan reseller aktif');
    error.statusCode = 403;
    throw error;
  }
}

function toBuyCode(product, index) {
  const current = String(product.code || '').trim().toLowerCase();
  if (/^buy\d+$/.test(current)) return current;
  return `buy${index + 1}`;
}

function getSessionId(user) {
  return `${user.role}-${user.id}`;
}

async function botEngineRequest(path, options = {}) {
  if (!env.BOT_ENGINE_URL) {
    const error = new Error('BOT_ENGINE_URL belum dikonfigurasi');
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

  const response = await fetch(`${env.BOT_ENGINE_URL.replace(/\/$/, '')}${path}`, {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status === false) {
    const error = new Error(payload.message || 'Bot engine request gagal');
    error.statusCode = response.status || 502;
    throw error;
  }
  return payload.data;
}

async function getBotCatalog(user) {
  const products = await listProducts();
  const markup = await getMarkupSetting();

  return products.map((product, index) => {
    const pricing = calculateRoleSellPrice(product, markup, { ...user, include_personal_markup: true });
    const stock = Number(product.stock || 0);
    return {
      id: product.id,
      premku_id: product.premku_id,
      buy_code: toBuyCode(product, index),
      code: product.code,
      name: product.name,
      note: product.note || product.description || '',
      price: pricing.sellPrice,
      stock,
      availability_status: stock > 0 ? 'tersedia' : 'belum_tersedia',
      order_enabled: product.status === 'active' && stock > 0,
    };
  });
}

export async function botProfile(req, res, next) {
  try {
    assertBotUser(req.user);
    const settings = await getSetting(`bot_settings:user:${req.user.id}`, await getSetting('bot_settings', {}));

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
    assertBotUser(req.user);
    res.json({ status: true, data: await getBotCatalog(req.user) });
  } catch (error) {
    next(error);
  }
}

export async function botCreateOrder(req, res, next) {
  try {
    assertBotUser(req.user);
    const catalog = await getBotCatalog(req.user);
    const buyCode = String(req.body?.buy_code || req.body?.code || '').trim().toLowerCase();
    const product = catalog.find((item) => item.buy_code === buyCode || String(item.code || '').toLowerCase() === buyCode);

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
    assertBotUser(req.user);
    const catalog = await getBotCatalog(req.user);
    const buyCode = String(req.body?.buy_code || req.body?.code || '').trim().toLowerCase().replace(/\s+/g, '');
    const product = catalog.find((item) => item.buy_code.replace(/\s+/g, '') === buyCode || String(item.code || '').toLowerCase() === buyCode);

    if (!product) {
      return res.status(404).json({ status: false, message: 'Kode produk tidak ditemukan' });
    }
    if (!product.order_enabled) {
      return res.status(400).json({ status: false, message: 'Produk belum tersedia' });
    }

    const data = await createBotOrderPayment(req.user, {
      product_id: product.id,
      qty: Number(req.body?.qty || 1),
      buyer_whatsapp: req.body?.buyer_whatsapp,
    });
    return res.status(201).json({ status: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function botPaymentStatus(req, res, next) {
  try {
    assertBotUser(req.user);
    const data = await refreshDirectPaymentStatus(req.params.invoice, req.user);
    if (!data) return res.status(404).json({ status: false, message: 'Payment tidak ditemukan' });
    return res.json({ status: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function botPaymentCancel(req, res, next) {
  try {
    assertBotUser(req.user);
    const data = await cancelDirectPayment(req.body?.invoice || req.params.invoice, req.user);
    return res.json({ status: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function botSessionConnect(req, res, next) {
  try {
    assertBotUser(req.user);
    const data = await botEngineRequest(`/sessions/${getSessionId(req.user)}/connect`, {
      method: 'POST',
      body: JSON.stringify({ api_key: req.user.api_key }),
    });
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}

export async function botSessionStatus(req, res, next) {
  try {
    assertBotUser(req.user);
    const data = await botEngineRequest(`/sessions/${getSessionId(req.user)}/status`);
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}

export async function botSessionLogout(req, res, next) {
  try {
    assertBotUser(req.user);
    const data = await botEngineRequest(`/sessions/${getSessionId(req.user)}/logout`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}
