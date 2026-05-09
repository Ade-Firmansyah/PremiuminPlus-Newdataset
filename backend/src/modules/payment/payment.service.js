import { transaction, parseDbJson } from '../../config/db.js';
import { findProductById } from '../../repositories/product.repo.js';
import { createPayment, findPaymentByInvoice, updatePayment } from '../../repositories/payment.repo.js';
import { updateOrderDelivery } from '../../repositories/order.repo.js';
import { getMarkupSetting } from '../../repositories/settings.repo.js';
import { calculateRoleSellPrice } from '../../services/pricing.service.js';
import { premkuCancelPay, premkuOrder, premkuPay, premkuPayStatus } from '../../services/premku.service.js';
import { createInvoice } from '../../utils/invoice.js';
import { logger } from '../../utils/logger.js';
import { sendOrderDelivery, validateWhatsapp } from '../../services/delivery.service.js';
import { notifyAdmin } from '../../services/notification.service.js';
import { refreshOrderStatus } from '../order/order.service.js';
import env from '../../config/env.js';
import { deleteCachePrefix, getCache, setCache } from '../../services/cache.service.js';

function toMysqlDate(value = new Date()) {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function normalizePaymentStatus(payload) {
  const value = String(payload?.pay_status ?? payload?.status ?? payload?.data?.status ?? payload ?? '').toLowerCase();
  if (['success', 'sukses', 'paid'].includes(value)) return 'success';
  if (['canceled', 'cancelled'].includes(value)) return 'canceled';
  if (['expired', 'expire'].includes(value)) return 'expired';
  if (['failed', 'fail', 'gagal', 'error'].includes(value)) return 'failed';
  return 'pending';
}

function normalizeOrderStatus(payload) {
  const value = String(payload?.status ?? payload?.data?.status ?? payload?.order_status ?? '').toLowerCase();
  if (['success', 'sukses', 'paid'].includes(value)) return 'success';
  if (['failed', 'fail', 'gagal', 'error', 'cancel', 'expired'].includes(value)) return 'failed';
  if (['process', 'processing'].includes(value)) return 'processing';
  return 'pending';
}

function extractAccounts(payload) {
  const source = payload?.accounts || payload?.data?.accounts || payload?.status?.accounts || payload?.data?.status?.accounts || [];
  if (Array.isArray(source) && source.length) return source;
  const single = payload?.account_data || payload?.data?.account_data || payload?.data?.akun || payload?.akun || null;
  return single ? [single] : [];
}

function resolvePremkuInvoice(payment, fallback) {
  return String(payment?.invoice ?? payment?.data?.invoice ?? payment?.ref_id ?? payment?.data?.ref_id ?? fallback);
}

function resolveExpiredAt(payment, ttlMinutes = env.PAYMENT_QR_TTL_MINUTES) {
  const raw = payment?.expired_at ?? payment?.expires_at ?? payment?.data?.expired_at ?? payment?.data?.expires_at ?? null;
  const localExpiry = new Date(Date.now() + Math.max(1, Number(ttlMinutes || 5)) * 60 * 1000);
  if (raw) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return toMysqlDate(date.getTime() < localExpiry.getTime() ? date : localExpiry);
  }
  return toMysqlDate(localExpiry);
}

function isExpiredAt(value) {
  if (!value) return false;
  const expiry = new Date(value).getTime();
  return Number.isFinite(expiry) && expiry <= Date.now();
}

async function getMemberProductPricing(productId, qty = 1) {
  const product = await findProductById(productId);
  if (!product || product.status !== 'active') {
    const error = new Error('Produk tidak ditemukan atau tidak aktif');
    error.statusCode = 404;
    throw error;
  }
  if (Number(product.stock || 0) <= 0) {
    const error = new Error('Stok produk habis');
    error.statusCode = 400;
    throw error;
  }
  const numericQty = Number(qty || 1);
  if (!Number.isInteger(numericQty) || numericQty < 1) {
    const error = new Error('Qty tidak valid');
    error.statusCode = 400;
    throw error;
  }

  const setting = await getMarkupSetting();
  const pricing = calculateRoleSellPrice(product, setting, { role: 'member' });
  return { product, pricing, qty: numericQty, total: pricing.sellPrice * numericQty };
}

async function getRoleProductPricing(productId, qty = 1, user = { role: 'member' }) {
  const product = await findProductById(productId);
  if (!product || product.status !== 'active') {
    const error = new Error('Produk tidak ditemukan atau tidak aktif');
    error.statusCode = 404;
    throw error;
  }
  if (Number(product.stock || 0) <= 0) {
    const error = new Error('Stok produk habis');
    error.statusCode = 400;
    throw error;
  }
  const numericQty = Number(qty || 1);
  if (!Number.isInteger(numericQty) || numericQty < 1) {
    const error = new Error('Qty tidak valid');
    error.statusCode = 400;
    throw error;
  }
  const setting = await getMarkupSetting();
  const pricing = calculateRoleSellPrice(product, setting, user);
  return { product, pricing, qty: numericQty, total: pricing.sellPrice * numericQty };
}

export async function createDirectOrderPayment(user, payload) {
  if (user.role !== 'member') {
    const error = new Error('QRIS langsung hanya tersedia untuk member');
    error.statusCode = 403;
    throw error;
  }

  const { product, qty, total } = await getMemberProductPricing(payload.product_id, payload.qty);
  const targetWhatsapp = validateWhatsapp(user.phone || '');
  const payment = await premkuPay({ amount: total });
  const invoice = resolvePremkuInvoice(payment, createInvoice('PAY'));
  const totalBayar = Number(payment?.total_bayar ?? payment?.data?.total_bayar ?? payment?.amount_total ?? payment?.data?.amount_total ?? total);
  const qrImage = payment?.qr_image ?? payment?.data?.qr_image ?? null;
  const qrRaw = payment?.qr_raw ?? payment?.qr_data ?? payment?.data?.qr_raw ?? payment?.data?.qr_data ?? payment?.data?.qr ?? qrImage ?? null;

  if (!qrImage && !qrRaw) {
    const error = new Error(payment?.message || payment?.error || 'Gagal membuat QR pembayaran');
    error.statusCode = 502;
    throw error;
  }

  logger('PAYMENT', { invoice, user_id: user.id, amount: total, total_bayar: totalBayar, payment_type: 'direct_order' });
  void notifyAdmin('order pending', {
    user: user.username,
    product: product.name,
    status: 'PENDING PAYMENT',
    invoice,
  });
  return createPayment({
    user_id: user.id,
    invoice,
    amount: total,
    total_bayar: totalBayar,
    payment_type: 'direct_order',
    status: 'pending',
    qr_image: typeof qrImage === 'string' ? qrImage : null,
    qr_raw: typeof qrRaw === 'string' ? qrRaw : JSON.stringify(qrRaw),
    product_id: product.id,
    qty,
    raw_response: payment,
    target_whatsapp: targetWhatsapp || null,
    expired_at: resolveExpiredAt(payment),
  });
}

export async function createBotOrderPayment(user, payload) {
  if (!['admin', 'reseller', 'member'].includes(user.role)) {
    const error = new Error('Bot payment tersedia untuk anggota dan reseller');
    error.statusCode = 403;
    throw error;
  }

  const { product, pricing, qty, total } = await getRoleProductPricing(payload.product_id, payload.qty, { ...user, include_personal_markup: true });
  const buyerWhatsapp = validateWhatsapp(payload.buyer_whatsapp || '');
  if (payload.buyer_whatsapp && !buyerWhatsapp) {
    const error = new Error('Nomor WhatsApp pembeli tidak valid');
    error.statusCode = 400;
    throw error;
  }

  const modal = (pricing.basePrice + pricing.adminMargin + pricing.roleMarkup) * qty;
  const resellerProfit = Math.max(total - modal, 0);
  const payment = await premkuPay({ amount: total });
  const invoice = resolvePremkuInvoice(payment, createInvoice('PAY'));
  const totalBayar = Number(payment?.total_bayar ?? payment?.data?.total_bayar ?? payment?.amount_total ?? payment?.data?.amount_total ?? total);
  const qrImage = payment?.qr_image ?? payment?.data?.qr_image ?? null;
  const qrRaw = payment?.qr_raw ?? payment?.qr_data ?? payment?.data?.qr_raw ?? payment?.data?.qr_data ?? payment?.data?.qr ?? qrImage ?? null;

  if (!qrImage && !qrRaw) {
    const error = new Error(payment?.message || payment?.error || 'Gagal membuat QR pembayaran');
    error.statusCode = 502;
    throw error;
  }

  logger('PAYMENT', { invoice, user_id: user.id, amount: total, total_bayar: totalBayar, payment_type: 'bot_order' });
  void notifyAdmin('order pending', {
    user: user.username,
    product: product.name,
    status: 'PENDING PAYMENT',
    invoice,
  });
  return createPayment({
    user_id: user.id,
    invoice,
    amount: total,
    total_bayar: totalBayar,
    payment_type: 'bot_order',
    source: 'bot',
    status: 'pending',
    qr_image: typeof qrImage === 'string' ? qrImage : null,
    qr_raw: typeof qrRaw === 'string' ? qrRaw : JSON.stringify(qrRaw),
    product_id: product.id,
    qty,
    raw_response: payment,
    target_whatsapp: buyerWhatsapp || user.phone || null,
    buyer_whatsapp: buyerWhatsapp || null,
    modal_price: modal,
    sell_price: total,
    reseller_profit: resellerProfit,
    expired_at: resolveExpiredAt(payment),
  });
}

async function processSuccessfulPayment(invoice, statusResponse) {
  return transaction(async (connection) => {
    const [paymentRows] = await connection.query('SELECT * FROM payments WHERE invoice = ? FOR UPDATE', [invoice]);
    const payment = paymentRows[0];
    if (!payment) {
      const error = new Error('Payment tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    if (payment.status === 'success' && payment.processed_at && payment.order_invoice) {
      const [orderRows] = await connection.query('SELECT * FROM orders WHERE invoice = ? LIMIT 1', [payment.order_invoice]);
      return { payment, order: orderRows[0] || null };
    }

    const [productRows] = await connection.query('SELECT * FROM products WHERE id = ? LIMIT 1', [payment.product_id]);
    const product = productRows[0];
    if (!product) {
      const error = new Error('Produk tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    const orderInvoice = payment.order_invoice || createInvoice('ORD');
    const external = await premkuOrder({
      product_id: product.premku_id || product.id,
      qty: Number(payment.qty || 1),
      ref_id: orderInvoice,
    });
    const orderStatus = normalizeOrderStatus(external);
    const accounts = orderStatus === 'success' ? extractAccounts(external) : [];
    const firstAccount = accounts[0] || {};
    const processedAt = toMysqlDate();
    const providerInvoice = resolvePremkuInvoice(external, orderInvoice);
    const isBotOrder = payment.payment_type === 'bot_order';
    const total = Number(payment.amount || 0);
    const modalTotal = Number(payment.modal_price || (product.price_base || product.base_price || 0) * Number(payment.qty || 1));
    const unitModal = Math.round(modalTotal / Number(payment.qty || 1));
    const resellerProfit = Number(payment.reseller_profit || 0);
    const [paymentUserRows] = await connection.query('SELECT id, role, saldo FROM users WHERE id = ? LIMIT 1', [payment.user_id]);
    const paymentUser = paymentUserRows[0] || {};
    const role = isBotOrder ? String(paymentUser.role || 'member').toLowerCase() : 'member';

    await connection.query(
      `UPDATE payments
       SET status = 'success', status_response = CAST(? AS JSON), order_invoice = ?, processed_at = ?, qr_image = NULL, qr_raw = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE invoice = ?`,
      [JSON.stringify(statusResponse ?? null), orderInvoice, processedAt, invoice],
    );
    await connection.query(
      `INSERT INTO transactions
        (invoice, ref_id, user_id, product_id, product_name, qty, price_base, price_sell, total_price, profit, status, account_data, channel, product_image, description, transaction_type, amount, processed_at)
       VALUES (?, ?, ?, NULL, 'QRIS Payment', 1, 0, ?, ?, 0, 'success', CAST(? AS JSON), 'qris', NULL, 'Pembayaran langsung member', 'payment', ?, ?)
       ON DUPLICATE KEY UPDATE status = 'success', processed_at = COALESCE(processed_at, VALUES(processed_at))`,
      [invoice, invoice, payment.user_id, total, total, JSON.stringify({ payment_type: payment.payment_type || 'direct_order', order_invoice: orderInvoice }), total, processedAt],
    );
    await connection.query(
      `INSERT INTO transactions
        (invoice, ref_id, user_id, product_id, product_name, qty, price_base, price_sell, total_price, profit, reseller_profit, status, account_data, external_order_response, channel, product_image, description, transaction_type, amount, processed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, ?, ?, 'order', ?, ?)
       ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        account_data = VALUES(account_data),
        external_order_response = VALUES(external_order_response),
        processed_at = COALESCE(processed_at, VALUES(processed_at))`,
      [
        orderInvoice,
        orderInvoice,
        payment.user_id,
        product.id,
        product.name,
        Number(payment.qty || 1),
        unitModal,
        Math.round(total / Number(payment.qty || 1)),
        total,
        Math.max(total - modalTotal, 0),
        resellerProfit,
        orderStatus,
        JSON.stringify(accounts.length ? accounts : null),
        JSON.stringify(external ?? null),
        isBotOrder ? 'bot-qris' : 'qris-direct',
        product.image || product.image_url || null,
        product.note || product.description || (isBotOrder ? 'Order buyer via reseller bot' : 'Order member via QRIS langsung'),
        total,
        orderStatus === 'success' ? processedAt : null,
      ],
    );
    const targetWhatsapp = validateWhatsapp(payment.target_whatsapp || '');
    await connection.query(
      `INSERT INTO orders
        (user_id, role, invoice, payment_invoice, product_id, product_name, email_account, password_account, payment_status, provider_invoice, provider_status, order_status, target_whatsapp, delivery_status, total_price, raw_response, processing_started_at, success_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'success', ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?)
       ON DUPLICATE KEY UPDATE
        payment_status = 'success',
        provider_invoice = COALESCE(VALUES(provider_invoice), provider_invoice),
        provider_status = VALUES(provider_status),
        order_status = VALUES(order_status),
        email_account = COALESCE(VALUES(email_account), email_account),
        password_account = COALESCE(VALUES(password_account), password_account),
        target_whatsapp = COALESCE(VALUES(target_whatsapp), target_whatsapp),
        processing_started_at = COALESCE(processing_started_at, VALUES(processing_started_at)),
        success_at = COALESCE(success_at, VALUES(success_at)),
        raw_response = VALUES(raw_response),
        updated_at = CURRENT_TIMESTAMP`,
      [
        payment.user_id,
        role,
        orderInvoice,
        invoice,
        product.id,
        product.name,
        firstAccount.email || firstAccount.username || null,
        firstAccount.password || firstAccount.pass || null,
        providerInvoice,
        orderStatus,
        orderStatus,
        targetWhatsapp || null,
        orderStatus === 'success' ? (accounts.length ? 'pending' : 'manual_pending') : 'pending',
        total,
        JSON.stringify(external ?? null),
        processedAt,
        orderStatus === 'success' ? processedAt : null,
      ],
    );
    if (isBotOrder && orderStatus === 'success' && resellerProfit > 0) {
      const [userRows] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [payment.user_id]);
      const user = userRows[0];
      const before = Number(user?.saldo || 0);
      const after = before + resellerProfit;
      await connection.query('UPDATE users SET saldo = ? WHERE id = ?', [after, payment.user_id]);
      await connection.query(
        `INSERT INTO saldo_logs (user_id, type, amount, balance_before, balance_after, reference, notes)
         VALUES (?, 'credit', ?, ?, ?, ?, ?)`,
        [payment.user_id, resellerProfit, before, after, `${orderInvoice}-profit`, `profit bot ${product.name}`],
      );
      await connection.query(
        `INSERT INTO saldo_mutations (user_id, mutation_type, amount, balance_before, balance_after, reference)
         VALUES (?, 'adjustment', ?, ?, ?, ?)`,
        [payment.user_id, resellerProfit, before, after, `${orderInvoice}-profit`],
      );
    }
    await connection.query(
      `INSERT INTO activity_logs (actor_id, user_id, scope, message, activity, metadata)
       VALUES (?, ?, 'ORDER', 'Direct QRIS order processed', 'Direct QRIS order processed', CAST(? AS JSON))`,
      [payment.user_id, payment.user_id, JSON.stringify({ payment_invoice: invoice, order_invoice: orderInvoice, order_status: orderStatus })],
    );

    const [updatedPaymentRows] = await connection.query('SELECT * FROM payments WHERE invoice = ? LIMIT 1', [invoice]);
    const [orderRows] = await connection.query('SELECT * FROM orders WHERE invoice = ? LIMIT 1', [orderInvoice]);
    deleteCachePrefix(`dashboard:user:${payment.user_id}`);
    deleteCachePrefix('leaderboard:');
    deleteCachePrefix('admin:summary');
    logger('ORDER', { invoice: orderInvoice, payment_invoice: invoice, user_id: payment.user_id, order_status: orderStatus });
    void notifyAdmin(orderStatus === 'success' ? 'order success' : 'provider processing', {
      user_id: payment.user_id,
      product: product.name,
      status: orderStatus,
      invoice: orderInvoice,
    });
    const order = orderRows[0] || null;
    return { payment: updatedPaymentRows[0], order };
  });
}

export async function refreshDirectPaymentStatus(invoice, user) {
  const payment = await findPaymentByInvoice(invoice);
  if (!payment) return null;
  if (user.role !== 'admin' && payment.user_id !== user.id) {
    const error = new Error('Invoice bukan milik akun ini');
    error.statusCode = 403;
    throw error;
  }

  if (payment.status === 'success' && payment.processed_at) {
    let existing = await transaction(async (connection) => {
      const [orderRows] = await connection.query('SELECT * FROM orders WHERE payment_invoice = ? ORDER BY id DESC LIMIT 1', [invoice]);
      return orderRows[0] || null;
    });
    if (existing && !['success', 'failed'].includes(existing.order_status)) {
      await refreshOrderStatus(existing.invoice);
      existing = await transaction(async (connection) => {
        const [orderRows] = await connection.query('SELECT * FROM orders WHERE payment_invoice = ? ORDER BY id DESC LIMIT 1', [invoice]);
        return orderRows[0] || existing;
      });
    }
    return {
      ...payment,
      order: existing
        ? {
            invoice: existing.invoice,
            product_name: existing.product_name,
            email_account: existing.order_status === 'success' ? existing.email_account : null,
            password_account: existing.order_status === 'success' ? existing.password_account : null,
            payment_status: existing.payment_status,
            provider_status: existing.provider_status,
            order_status: existing.order_status,
            target_whatsapp: existing.target_whatsapp,
            delivery_status: existing.delivery_status,
            delivery_time: existing.delivery_time,
            total_price: Number(existing.total_price || 0),
            raw_response: parseDbJson(existing.raw_response, null),
            processing_started_at: existing.processing_started_at,
            success_at: existing.success_at,
            created_at: existing.created_at,
          }
        : null,
    };
  }

  if (payment.status === 'pending' && isExpiredAt(payment.expired_at)) {
    let statusResponse = {};
    try {
      statusResponse = await premkuPayStatus(invoice);
    } catch (error) {
      statusResponse = { message: error instanceof Error ? error.message : 'Premku pay status failed before expiry lock' };
    }

    const providerStatus = normalizePaymentStatus(statusResponse);
    if (providerStatus === 'success') {
      const result = await processSuccessfulPayment(invoice, statusResponse);
      return {
        ...payment,
        status: 'success',
        qr_image: null,
        qr_raw: null,
        processed_at: result.payment.processed_at,
        order_invoice: result.payment.order_invoice,
        order: result.order,
      };
    }

    try {
      await premkuCancelPay(invoice);
    } catch {
      // Provider cancel is best-effort; local expiry remains authoritative.
    }

    const updated = await updatePayment(invoice, {
      status: providerStatus === 'pending' ? 'expired' : providerStatus,
      status_response: statusResponse,
      clear_qr: true,
      canceled_at: toMysqlDate(),
    });
    void notifyAdmin('failed payment', {
      user_id: payment.user_id,
      invoice,
      status: providerStatus === 'pending' ? 'expired' : providerStatus,
      payment_type: payment.payment_type,
    });
    return updated;
  }

  const syncCacheKey = `sync:payment:${invoice}`;
  if (payment.status === 'pending' && getCache(syncCacheKey)) {
    return payment;
  }
  const statusResponse = await premkuPayStatus(invoice);
  setCache(syncCacheKey, true, 5);
  const nextStatus = normalizePaymentStatus(statusResponse);
  if (nextStatus === 'success') {
    const result = await processSuccessfulPayment(invoice, statusResponse);
    if (result.order && result.order.order_status === 'success' && result.order.delivery_status !== 'sent') {
      const delivery = await sendOrderDelivery(result.order);
      await updateOrderDelivery(result.order.invoice, {
        delivery_status: delivery.status,
        delivery_time: new Date().toISOString().slice(0, 19).replace('T', ' '),
        target_whatsapp: result.order.target_whatsapp,
      });
      result.order.delivery_status = delivery.status;
      result.order.delivery_time = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
    return {
      ...payment,
      status: 'success',
      processed_at: result.payment.processed_at,
      order_invoice: result.payment.order_invoice,
      order: result.order
        ? {
            invoice: result.order.invoice,
            product_name: result.order.product_name,
            email_account: result.order.order_status === 'success' ? result.order.email_account : null,
            password_account: result.order.order_status === 'success' ? result.order.password_account : null,
            payment_status: result.order.payment_status,
            provider_status: result.order.provider_status,
            order_status: result.order.order_status,
            target_whatsapp: result.order.target_whatsapp,
            delivery_status: result.order.delivery_status,
            delivery_time: result.order.delivery_time,
            total_price: Number(result.order.total_price || 0),
            raw_response: parseDbJson(result.order.raw_response, null),
            created_at: result.order.created_at,
          }
        : null,
    };
  }

  const updated = await updatePayment(invoice, { status: nextStatus, status_response: statusResponse, clear_qr: nextStatus !== 'pending' });
  if (['failed', 'expired', 'canceled'].includes(nextStatus)) {
    void notifyAdmin('failed payment', {
      user_id: payment.user_id,
      invoice,
      status: nextStatus,
      payment_type: payment.payment_type,
    });
  }
  return updated;
}

export async function cancelDirectPayment(invoice, user) {
  const payment = await findPaymentByInvoice(invoice);
  if (!payment) {
    const error = new Error('Payment tidak ditemukan');
    error.statusCode = 404;
    throw error;
  }
  if (user.role !== 'admin' && payment.user_id !== user.id) {
    const error = new Error('Invoice bukan milik akun ini');
    error.statusCode = 403;
    throw error;
  }
  if (payment.status === 'success' || payment.processed_at) {
    const error = new Error('Payment sukses tidak bisa dibatalkan');
    error.statusCode = 409;
    throw error;
  }

  let response = {};
  try {
    response = await premkuCancelPay(invoice);
  } catch (error) {
    response = { message: error instanceof Error ? error.message : 'Premku cancel_pay failed' };
  }
  logger('PAYMENT', { invoice, user_id: user.id, status: 'canceled' });
  void notifyAdmin('failed payment', {
    user: user.username,
    invoice,
    status: 'canceled',
    payment_type: payment.payment_type,
  });
  return updatePayment(invoice, { status: 'canceled', status_response: response, canceled_at: toMysqlDate(), clear_qr: true });
}
