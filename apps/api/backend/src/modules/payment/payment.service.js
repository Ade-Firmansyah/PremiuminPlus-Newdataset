import crypto from 'node:crypto';
import { transaction, parseDbJson } from '../../config/db.js';
import { findProductById, markManualStockItemsUsed, refreshManualStockCount, reserveManualStockItems } from '../../repositories/product.repo.js';
import { createPayment, findPaymentByInvoice, findPaymentByUserRef, updatePayment } from '../../repositories/payment.repo.js';
import { updateOrderDelivery } from '../../repositories/order.repo.js';
import { premkuCancelPay, premkuOrder, premkuPay, premkuPayStatus } from '../../services/premku.service.js';
import { createInvoice } from '../../utils/invoice.js';
import { logger } from '../../utils/logger.js';
import { sendOrderDelivery, validateWhatsapp } from '../../services/delivery.service.js';
import { notifyAdmin } from '../../services/notification.service.js';
import { refreshOrderStatus } from '../order/order.service.js';
import env from '../../config/env.js';
import { getCache, setCache } from '../../services/cache.service.js';
import { applyBotPaymentSuccess, buildB2BLedgerSnapshot, clearB2BLedgerCaches } from '../../services/b2bLedger.service.js';
import { getMarkupSetting } from '../../repositories/settings.repo.js';
import { calculateProductPrices } from '../../services/product-pricing.service.js';
import { calculateRoleSellPrice } from '../../services/pricing.service.js';
import { findResellerBotSettings } from '../../repositories/reseller-bot-settings.repo.js';

function toMysqlDate(value = new Date()) {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function normalizePaymentStatus(payload) {
  const raw = payload?.data?.status ?? payload?.pay_status ?? payload?.payment_status ?? payload?.transaction_status ?? payload?.status ?? payload;
  const value = typeof raw === 'boolean' ? '' : String(raw ?? '').toLowerCase();
  if (['success', 'sukses', 'paid', 'settlement', 'capture'].includes(value)) return 'success';
  if (['canceled', 'cancelled'].includes(value)) return 'canceled';
  if (['expired', 'expire'].includes(value)) return 'expired';
  if (['failed', 'fail', 'gagal', 'error'].includes(value)) return 'failed';
  return 'pending';
}

function isPendingPaymentStatus(status) {
  return ['pending', 'pending_payment'].includes(String(status || '').toLowerCase());
}

function isPaymentSuccessStatus(status) {
  return ['success', 'payment_success'].includes(String(status || '').toLowerCase());
}

function isTerminalPaymentStatus(status) {
  return ['success', 'payment_success', 'failed', 'expired', 'canceled', 'payment_mismatch', 'manual_required'].includes(String(status || '').toLowerCase());
}

function isCredentialOrderStatus(status) {
  return ['success', 'provider_success', 'credential_delivery'].includes(String(status || '').toLowerCase());
}

function resolvePaymentProviderInvoice(payment) {
  return payment?.provider_invoice || payment?.invoice;
}

function extractPaymentStatusInvoice(payload) {
  return String(payload?.data?.invoice ?? payload?.invoice ?? payload?.data?.ref_id ?? payload?.ref_id ?? '').trim();
}

function extractPaymentTotalBayar(payload) {
  const value = payload?.data?.total_bayar ?? payload?.total_bayar ?? payload?.data?.amount_total ?? payload?.amount_total ?? payload?.data?.amount_req ?? payload?.amount_req;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function validatePaymentSuccess(payment, statusResponse) {
  if (statusResponse?.success === false || statusResponse?.status === false) {
    return { ok: false, status: 'manual_required', reason: statusResponse?.message || 'Premku pay_status failed' };
  }

  const nextStatus = normalizePaymentStatus(statusResponse);
  if (nextStatus !== 'success') {
    return { ok: false, status: nextStatus, reason: `pay_status_not_success:${nextStatus}` };
  }

  const providerInvoice = resolvePaymentProviderInvoice(payment);
  const responseInvoice = extractPaymentStatusInvoice(statusResponse);
  if (responseInvoice && providerInvoice && responseInvoice !== providerInvoice) {
    return { ok: false, status: 'payment_mismatch', reason: `invoice_mismatch:${responseInvoice}` };
  }

  const responseTotal = extractPaymentTotalBayar(statusResponse);
  const expectedTotal = Number(payment?.total_bayar || payment?.amount || 0);
  if (responseTotal !== null && expectedTotal > 0 && responseTotal !== expectedTotal) {
    return { ok: false, status: 'payment_mismatch', reason: `total_bayar_mismatch:${responseTotal}` };
  }

  return { ok: true, status: 'payment_success', reason: '' };
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

function createPaymentOrderInvoice(paymentInvoice) {
  const digest = crypto.createHash('sha256').update(String(paymentInvoice || '')).digest('hex').slice(0, 20).toUpperCase();
  return `ORD-PAY-${digest}`;
}

function asPlainObject(payload) {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : { value: payload ?? null };
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

async function resolveRoleSellPrice(product, role = 'member') {
  const normalizedRole = String(role || 'member').toLowerCase();
  const storedPrice = normalizedRole === 'reseller' ? product.reseller_price : product.member_price;
  if (Number(storedPrice || 0) > 0) return Number(storedPrice);
  const markupSetting = await getMarkupSetting();
  const calculated = calculateProductPrices(product, markupSetting);
  return normalizedRole === 'reseller' ? calculated.reseller_price : calculated.member_price;
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
  if (numericQty > Number(product.max_order_qty || product.stock || 0)) {
    const error = new Error('Qty melebihi stok yang dapat dipenuhi dalam satu order');
    error.statusCode = 409;
    error.code = 'PRODUCT_QTY_UNAVAILABLE';
    throw error;
  }

  /**
   * Use pre-calculated member_price from database
   * RULE: Backend calculates ONCE (in product-pricing.service), Frontend renders ONLY
   */
  const sellPrice = await resolveRoleSellPrice(product, 'member');
  const pricing = { sellPrice };
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
  if (numericQty > Number(product.max_order_qty || product.stock || 0)) {
    const error = new Error('Qty melebihi stok yang dapat dipenuhi dalam satu order');
    error.statusCode = 409;
    error.code = 'PRODUCT_QTY_UNAVAILABLE';
    throw error;
  }

  /**
   * Use pre-calculated member_price or reseller_price from database
   * RULE: Backend calculates ONCE (in product-pricing.service), Frontend renders ONLY
   */
  const role = String(user?.role || 'member').toLowerCase();
  const sellPrice = await resolveRoleSellPrice(product, role);
  const pricing = { sellPrice };
  return { product, pricing, qty: numericQty, total: pricing.sellPrice * numericQty };
}

async function getBotProductPricing(productId, qty = 1, user = { role: 'member' }) {
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
  if (numericQty > Number(product.max_order_qty || product.stock || 0)) {
    const error = new Error('Qty melebihi stok yang dapat dipenuhi dalam satu order');
    error.statusCode = 409;
    error.code = 'PRODUCT_QTY_UNAVAILABLE';
    throw error;
  }

  const markupSetting = await getMarkupSetting();
  const settings = await findResellerBotSettings(user);
  const role = String(user?.role || 'member').toLowerCase();
  const pricingRole = role === 'member' ? 'member' : 'reseller';
  const modalPricing = calculateRoleSellPrice(product, markupSetting, { ...user, role: pricingRole });
  const storedPrice = pricingRole === 'member' ? product.member_price : product.reseller_price;
  const modalPrice = Number(storedPrice || modalPricing.modalPrice || modalPricing.sellPrice || 0);
  const marginType = settings?.reseller_margin_type === 'fixed' ? 'fixed' : 'percent';
  const marginValue = Number(settings?.reseller_margin_value || 0);
  const marginAmount = marginType === 'fixed'
    ? Math.round(marginValue)
    : Math.round((modalPrice * marginValue) / 100);
  const pricing = {
    ...modalPricing,
    modalPrice,
    resellerMarkup: marginAmount,
    reseller_markup_percent: marginType === 'percent' ? marginValue : 0,
    reseller_margin_type: marginType,
    reseller_margin_value: marginValue,
    sellPrice: modalPrice + marginAmount,
  };
  return {
    product,
    pricing,
    qty: numericQty,
    total: pricing.sellPrice * numericQty,
    modalTotal: Number(pricing.modalPrice || pricing.sellPrice) * numericQty,
  };
}

export async function createDirectOrderPayment(user, payload) {
  if (!['member', 'reseller'].includes(user.role)) {
    const error = new Error('QRIS langsung hanya tersedia untuk member dan reseller');
    error.statusCode = 403;
    throw error;
  }

  const { product, qty, total } = await getRoleProductPricing(payload.product_id, payload.qty, user);
  const targetWhatsapp = validateWhatsapp(payload.target_whatsapp || user.phone || '');
  const payment = await premkuPay({ amount: total });
  const invoice = createInvoice('PAY');
  const providerInvoice = resolvePremkuInvoice(payment, invoice);
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
    provider_invoice: providerInvoice,
    amount: total,
    total_bayar: totalBayar,
    payment_type: 'direct_order',
    status: 'pending_payment',
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
  if (!['admin', 'member', 'reseller'].includes(user.role)) {
    const error = new Error('Bot/API payment tidak tersedia untuk role ini');
    error.statusCode = 403;
    throw error;
  }

  const clientRefId = String(payload.ref_id || payload.client_ref_id || '').trim().slice(0, 120);
  if (clientRefId) {
    const existing = await findPaymentByUserRef(user.id, clientRefId);
    if (existing) return existing;
  }

  const calculated = await getBotProductPricing(payload.product_id, payload.qty, user);
  const { product, pricing, qty, modalTotal } = calculated;
  const requestedTotal = Number(payload.sell_price ?? payload.amount ?? 0);
  const total = requestedTotal > 0 ? requestedTotal : calculated.total;
  if (!Number.isFinite(total) || total < modalTotal) {
    const error = new Error(`Nominal pembayaran minimal Rp ${Math.round(modalTotal)}`);
    error.statusCode = 400;
    error.code = 'SELL_PRICE_BELOW_BASE_PRICE';
    throw error;
  }
  const buyerWhatsapp = validateWhatsapp(payload.buyer_whatsapp || '');
  if (payload.buyer_whatsapp && !buyerWhatsapp) {
    const error = new Error('Nomor WhatsApp pembeli tidak valid');
    error.statusCode = 400;
    throw error;
  }

  const modal = modalTotal;
  const resellerProfit = Math.max(total - modal, 0);
  const payment = await premkuPay({ amount: total });
  const invoice = createInvoice('PAY');
  const providerInvoice = resolvePremkuInvoice(payment, invoice);
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
  const record = await createPayment({
    user_id: user.id,
    invoice,
    provider_invoice: providerInvoice,
    amount: total,
    total_bayar: totalBayar,
    payment_type: 'bot_order',
    source: 'bot_api',
    status: 'pending_payment',
    qr_image: typeof qrImage === 'string' ? qrImage : null,
    qr_raw: typeof qrRaw === 'string' ? qrRaw : JSON.stringify(qrRaw),
    product_id: product.id,
    qty,
    raw_response: payment,
    target_whatsapp: buyerWhatsapp || user.phone || null,
    buyer_whatsapp: buyerWhatsapp || null,
    buyer_name: payload.buyer_name || null,
    client_ref_id: clientRefId || null,
    modal_price: modal,
    sell_price: total,
    reseller_profit: resellerProfit,
    expired_at: resolveExpiredAt(payment),
  });

  return {
    ...record,
    payment_invoice: record.invoice,
    invoice: record.invoice,
    provider_invoice: record.provider_invoice,
    product_code: String(payload.product_code || payload.buy_code || product.code || product.id || ''),
    product_id: product.id,
    product_name: product.name,
    base_price: Number(product.price_base || product.base_price || 0),
    reseller_price: modal,
    modal_price: modal,
    sell_price: total,
    profit: resellerProfit,
    reseller_profit: resellerProfit,
    qty,
    total_bayar: Number(record.total_bayar || totalBayar),
  };
}

export async function processSuccessfulPayment(invoice, statusResponse) {
  return transaction(async (connection) => {
    const [paymentRows] = await connection.query('SELECT * FROM payments WHERE invoice = ? FOR UPDATE', [invoice]);
    const payment = paymentRows[0];
    if (!payment) {
      const error = new Error('Payment tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    if (isPaymentSuccessStatus(payment.status) && payment.processed_at && payment.order_invoice) {
      const [orderRows] = await connection.query('SELECT * FROM orders WHERE invoice = ? LIMIT 1', [payment.order_invoice]);
      return { payment, order: orderRows[0] || null };
    }

    if (!isPendingPaymentStatus(payment.status)) {
      return { payment, order: null, blocked: true };
    }

    const paymentValidation = validatePaymentSuccess(payment, statusResponse);
    if (!paymentValidation.ok) {
      await connection.query(
        `UPDATE payments
         SET status = ?, status_response = CAST(? AS JSON), qr_image = NULL, qr_raw = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE invoice = ?`,
        [
          paymentValidation.status || 'manual_required',
          JSON.stringify({ ...(statusResponse ?? {}), validation_error: paymentValidation.reason }),
          invoice,
        ],
      );
      const [updatedPaymentRows] = await connection.query('SELECT * FROM payments WHERE invoice = ? LIMIT 1', [invoice]);
      void notifyAdmin('failed payment', {
        user_id: payment.user_id,
        invoice,
        status: paymentValidation.status,
        reason: paymentValidation.reason,
        payment_type: payment.payment_type,
      });
      return { payment: updatedPaymentRows[0] || payment, order: null, blocked: true };
    }

    const [productRows] = await connection.query('SELECT * FROM products WHERE id = ? LIMIT 1', [payment.product_id]);
    const product = productRows[0];
    if (!product) {
      const error = new Error('Produk tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    const orderInvoice = payment.order_invoice || createPaymentOrderInvoice(payment.invoice);
    const isBotOrder = payment.payment_type === 'bot_order';
    const qty = Number(payment.qty || 1);
    const total = Number(payment.amount || 0);
    const providerCostTotal = Number(product.price_base || product.base_price || 0) * qty;
    const modalTotal = Number(payment.modal_price || providerCostTotal);
    const platformRevenueTotal = isBotOrder ? modalTotal : total;
    const unitProviderCost = Math.round(providerCostTotal / qty);
    const platformUnitSellPrice = Math.round(platformRevenueTotal / qty);
    const adminProfit = Math.max(platformRevenueTotal - providerCostTotal, 0);
    const resellerProfit = Number(payment.reseller_profit || 0);
    const b2bLedger = buildB2BLedgerSnapshot({
      providerCost: providerCostTotal,
      adminPrice: platformRevenueTotal,
      sellPrice: total,
      userProfit: resellerProfit,
      adminProfit,
    });
    const [paymentUserRows] = await connection.query('SELECT id, role, saldo FROM users WHERE id = ? LIMIT 1', [payment.user_id]);
    const paymentUser = paymentUserRows[0] || {};
    const role = String(paymentUser.role || 'member').toLowerCase();
    const targetWhatsapp = validateWhatsapp(payment.target_whatsapp || '');

    if (product.product_source === 'manual' || product.product_source === 'hybrid') {
      const stockItems = await reserveManualStockItems(connection, product.id, orderInvoice, qty);
      if (stockItems.length < qty) {
        await refreshManualStockCount(connection, product.id);
        if (product.product_source === 'hybrid') {
        } else {
          const error = new Error('Stok manual tidak cukup');
          error.statusCode = 409;
          throw error;
        }
      }
      if (stockItems.length >= qty) {
        const manualSource = product.product_source === 'hybrid' ? 'hybrid_manual_stock' : 'manual_stock';
        const processedAt = toMysqlDate();
        const accounts = stockItems.map((stockItem) => ({
          email: stockItem.email_account,
          password: stockItem.password_account,
          description: stockItem.description,
        }));
        const botLedger = await applyBotPaymentSuccess(connection, {
          payment,
          product,
          orderInvoice,
          qty,
          sellPrice: total,
          adminPrice: modalTotal,
          providerCost: providerCostTotal,
          processedAt,
        });

      await connection.query(
        `UPDATE payments
         SET status = 'payment_success', status_response = CAST(? AS JSON), order_invoice = ?, processed_at = ?, qr_image = NULL, qr_raw = NULL, updated_at = CURRENT_TIMESTAMP
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success', CAST(? AS JSON), CAST(? AS JSON), ?, ?, ?, 'order', ?, ?)
         ON DUPLICATE KEY UPDATE status = 'success', account_data = VALUES(account_data), processed_at = COALESCE(processed_at, VALUES(processed_at))`,
        [
          orderInvoice,
          orderInvoice,
          payment.user_id,
          product.id,
          product.name,
          qty,
          unitProviderCost,
          platformUnitSellPrice,
          platformRevenueTotal,
          adminProfit,
          resellerProfit,
          JSON.stringify(accounts),
          JSON.stringify({ source: manualSource, stock_item_ids: stockItems.map((stockItem) => stockItem.id), b2b_ledger: b2bLedger }),
          isBotOrder ? 'bot-qris' : 'qris-direct',
          product.image || product.image_url || null,
          product.note || product.description || (isBotOrder ? 'Order buyer via reseller bot' : 'Order member via QRIS langsung'),
          total,
          processedAt,
        ],
      );
      await markManualStockItemsUsed(connection, stockItems.map((stockItem) => stockItem.id), orderInvoice);
      await refreshManualStockCount(connection, product.id);
      await connection.query(
        `INSERT INTO orders
          (user_id, role, invoice, payment_invoice, product_id, product_name, email_account, password_account, payment_status, provider_invoice, provider_status, order_status, fulfillment_type, target_whatsapp, delivery_status, total_price, raw_response, processing_started_at, success_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'success', ?, 'success', 'success', ?, ?, 'pending', ?, CAST(? AS JSON), ?, ?)
         ON DUPLICATE KEY UPDATE payment_status = 'success', provider_status = 'success', order_status = 'success', fulfillment_type = VALUES(fulfillment_type), email_account = VALUES(email_account), password_account = VALUES(password_account), raw_response = VALUES(raw_response), updated_at = CURRENT_TIMESTAMP`,
        [
          payment.user_id,
          role,
          orderInvoice,
          invoice,
          product.id,
          product.name,
          stockItems[0]?.email_account || null,
          stockItems[0]?.password_account || null,
          orderInvoice,
          manualSource,
          targetWhatsapp || null,
          total,
          JSON.stringify({ source: manualSource, stock_item_ids: stockItems.map((stockItem) => stockItem.id), accounts, bot_ledger: botLedger, b2b_ledger: b2bLedger }),
          processedAt,
          processedAt,
        ],
      );

      const [updatedPaymentRows] = await connection.query('SELECT * FROM payments WHERE invoice = ? LIMIT 1', [invoice]);
      const [orderRows] = await connection.query('SELECT * FROM orders WHERE invoice = ? LIMIT 1', [orderInvoice]);
      clearB2BLedgerCaches(payment.user_id);
      return { payment: updatedPaymentRows[0], order: orderRows[0] || null };
      }
    }

    let external;
    const providerProcessedAt = toMysqlDate();
    const botLedger = await applyBotPaymentSuccess(connection, {
      payment,
      product,
      orderInvoice,
      qty,
      sellPrice: total,
      adminPrice: modalTotal,
      providerCost: providerCostTotal,
      processedAt: providerProcessedAt,
    });
    try {
      external = await premkuOrder({
        product_id: product.premku_id || product.id,
        qty: Number(payment.qty || 1),
        ref_id: orderInvoice,
      });
    } catch (error) {
      const processedAt = providerProcessedAt;
      const fallbackResponse = { message: error instanceof Error ? error.message : 'Premku order request failed after paid QRIS' };
      await connection.query(
        `UPDATE payments
         SET status = 'payment_success', status_response = CAST(? AS JSON), order_invoice = ?, processed_at = ?, qr_image = NULL, qr_raw = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE invoice = ?`,
        [JSON.stringify({ ...(statusResponse ?? {}), provider_order_error: fallbackResponse.message }), orderInvoice, processedAt, invoice],
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', CAST(? AS JSON), CAST(? AS JSON), ?, ?, ?, 'order', ?, NULL)
         ON DUPLICATE KEY UPDATE status = 'pending', external_order_response = VALUES(external_order_response), updated_at = CURRENT_TIMESTAMP`,
        [
          orderInvoice,
          orderInvoice,
          payment.user_id,
          product.id,
          product.name,
          qty,
          unitProviderCost,
          platformUnitSellPrice,
          platformRevenueTotal,
          adminProfit,
          resellerProfit,
          JSON.stringify(null),
          JSON.stringify({ ...fallbackResponse, bot_ledger: botLedger, b2b_ledger: b2bLedger }),
          isBotOrder ? 'bot-qris' : 'qris-direct',
          product.image || product.image_url || null,
          product.note || product.description || (isBotOrder ? 'Order buyer via reseller bot' : 'Order member via QRIS langsung'),
          platformRevenueTotal,
        ],
      );
      await connection.query(
        `INSERT INTO orders
          (user_id, role, invoice, payment_invoice, product_id, product_name, payment_status, provider_invoice, provider_status, order_status, target_whatsapp, delivery_status, total_price, raw_response, processing_started_at)
         VALUES (?, ?, ?, ?, ?, ?, 'success', ?, 'pending_manual', 'pending_manual', ?, 'pending', ?, CAST(? AS JSON), ?)
         ON DUPLICATE KEY UPDATE payment_status = 'success', provider_status = 'pending_manual', order_status = 'pending_manual', raw_response = VALUES(raw_response), updated_at = CURRENT_TIMESTAMP`,
        [
          payment.user_id,
          role,
          orderInvoice,
          invoice,
          product.id,
          product.name,
          orderInvoice,
          targetWhatsapp || null,
          total,
          JSON.stringify({ ...fallbackResponse, bot_ledger: botLedger, b2b_ledger: b2bLedger }),
          processedAt,
        ],
      );
      const [updatedPaymentRows] = await connection.query('SELECT * FROM payments WHERE invoice = ? LIMIT 1', [invoice]);
      const [orderRows] = await connection.query('SELECT * FROM orders WHERE invoice = ? LIMIT 1', [orderInvoice]);
      void notifyAdmin('order pending', {
        user_id: payment.user_id,
        product: product.name,
        status: 'pending_manual',
        invoice: orderInvoice,
      });
      return { payment: updatedPaymentRows[0], order: orderRows[0] || null };
    }
    const orderStatus = normalizeOrderStatus(external);
    const accounts = orderStatus === 'success' ? extractAccounts(external) : [];
    const firstAccount = accounts[0] || {};
    const processedAt = providerProcessedAt;
    const providerInvoice = resolvePremkuInvoice(external, orderInvoice);

    await connection.query(
      `UPDATE payments
       SET status = 'payment_success', status_response = CAST(? AS JSON), order_invoice = ?, processed_at = ?, qr_image = NULL, qr_raw = NULL, updated_at = CURRENT_TIMESTAMP
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
        qty,
        unitProviderCost,
        platformUnitSellPrice,
        platformRevenueTotal,
        adminProfit,
        resellerProfit,
        orderStatus,
        JSON.stringify(accounts.length ? accounts : null),
        JSON.stringify({ ...asPlainObject(external), bot_ledger: botLedger, b2b_ledger: b2bLedger }),
        isBotOrder ? 'bot-qris' : 'qris-direct',
        product.image || product.image_url || null,
        product.note || product.description || (isBotOrder ? 'Order buyer via reseller bot' : 'Order member via QRIS langsung'),
        platformRevenueTotal,
        orderStatus === 'success' ? processedAt : null,
      ],
    );
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
        JSON.stringify({ ...asPlainObject(external), bot_ledger: botLedger, b2b_ledger: b2bLedger }),
        processedAt,
        orderStatus === 'success' ? processedAt : null,
      ],
    );
    await connection.query(
      `INSERT INTO activity_logs (actor_id, user_id, scope, message, activity, metadata)
       VALUES (?, ?, 'ORDER', 'Direct QRIS order processed', 'Direct QRIS order processed', CAST(? AS JSON))`,
      [payment.user_id, payment.user_id, JSON.stringify({ payment_invoice: invoice, order_invoice: orderInvoice, order_status: orderStatus })],
    );

    const [updatedPaymentRows] = await connection.query('SELECT * FROM payments WHERE invoice = ? LIMIT 1', [invoice]);
    const [orderRows] = await connection.query('SELECT * FROM orders WHERE invoice = ? LIMIT 1', [orderInvoice]);
    clearB2BLedgerCaches(payment.user_id);
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
  const paymentInvoice = payment.invoice;
  if (user.role !== 'admin' && payment.user_id !== user.id) {
    const error = new Error('Invoice bukan milik akun ini');
    error.statusCode = 403;
    throw error;
  }

  if (isPaymentSuccessStatus(payment.status) && payment.processed_at) {
    let existing = await transaction(async (connection) => {
      const [orderRows] = await connection.query('SELECT * FROM orders WHERE payment_invoice = ? ORDER BY id DESC LIMIT 1', [paymentInvoice]);
      return orderRows[0] || null;
    });
    if (existing && !isCredentialOrderStatus(existing.order_status) && !['failed', 'canceled', 'cancelled'].includes(String(existing.order_status || '').toLowerCase())) {
      await refreshOrderStatus(existing.invoice);
      existing = await transaction(async (connection) => {
        const [orderRows] = await connection.query('SELECT * FROM orders WHERE payment_invoice = ? ORDER BY id DESC LIMIT 1', [paymentInvoice]);
        return orderRows[0] || existing;
      });
    }
    return {
      ...payment,
      order: existing
        ? {
            invoice: existing.invoice,
            product_name: existing.product_name,
            email_account: isCredentialOrderStatus(existing.order_status) ? existing.email_account : null,
            password_account: isCredentialOrderStatus(existing.order_status) ? existing.password_account : null,
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

  if (isPendingPaymentStatus(payment.status) && isExpiredAt(payment.expired_at)) {
    let statusResponse = {};
    try {
      statusResponse = await premkuPayStatus(resolvePaymentProviderInvoice(payment));
    } catch (error) {
      statusResponse = { message: error instanceof Error ? error.message : 'Premku pay status failed before expiry lock' };
    }

    const providerStatus = normalizePaymentStatus(statusResponse);
    if (providerStatus === 'success') {
      const result = await processSuccessfulPayment(paymentInvoice, statusResponse);
      if (result.blocked) return result.payment;
      return {
        ...payment,
        status: result.payment.status || 'payment_success',
        qr_image: null,
        qr_raw: null,
        processed_at: result.payment.processed_at,
        order_invoice: result.payment.order_invoice,
        order: result.order,
      };
    }

    try {
      await premkuCancelPay(resolvePaymentProviderInvoice(payment));
    } catch {
      // Provider cancel is best-effort; local expiry remains authoritative.
    }

    const updated = await updatePayment(paymentInvoice, {
      status: providerStatus === 'pending' ? 'expired' : providerStatus,
      status_response: statusResponse,
      clear_qr: true,
      canceled_at: toMysqlDate(),
    });
    void notifyAdmin('failed payment', {
      user_id: payment.user_id,
      invoice: paymentInvoice,
      status: providerStatus === 'pending' ? 'expired' : providerStatus,
      payment_type: payment.payment_type,
    });
    return updated;
  }

  const syncCacheKey = `sync:payment:${paymentInvoice}`;
  if (isPendingPaymentStatus(payment.status) && getCache(syncCacheKey)) {
    return payment;
  }
  if (isTerminalPaymentStatus(payment.status)) {
    return payment;
  }
  const statusResponse = await premkuPayStatus(resolvePaymentProviderInvoice(payment));
  setCache(syncCacheKey, true, 10);
  const nextStatus = normalizePaymentStatus(statusResponse);
  if (nextStatus === 'success') {
    const result = await processSuccessfulPayment(paymentInvoice, statusResponse);
    if (result.blocked) return result.payment;
    if (result.order && isCredentialOrderStatus(result.order.order_status) && result.order.delivery_status !== 'sent') {
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
      status: result.payment.status || 'payment_success',
      processed_at: result.payment.processed_at,
      order_invoice: result.payment.order_invoice,
      order: result.order
        ? {
            invoice: result.order.invoice,
            product_name: result.order.product_name,
            email_account: isCredentialOrderStatus(result.order.order_status) ? result.order.email_account : null,
            password_account: isCredentialOrderStatus(result.order.order_status) ? result.order.password_account : null,
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

  const updated = await updatePayment(paymentInvoice, { status: nextStatus === 'pending' ? 'pending_payment' : nextStatus, status_response: statusResponse, clear_qr: nextStatus !== 'pending' });
  if (['failed', 'expired', 'canceled'].includes(nextStatus)) {
    void notifyAdmin('failed payment', {
      user_id: payment.user_id,
      invoice: paymentInvoice,
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
  const paymentInvoice = payment.invoice;
  if (user.role !== 'admin' && payment.user_id !== user.id) {
    const error = new Error('Invoice bukan milik akun ini');
    error.statusCode = 403;
    throw error;
  }
  if (isPaymentSuccessStatus(payment.status) || payment.processed_at) {
    const error = new Error('Payment sukses tidak bisa dibatalkan');
    error.statusCode = 409;
    throw error;
  }
  if (payment.status === 'canceled') {
    return payment;
  }
  if (!isPendingPaymentStatus(payment.status) || ['expired', 'failed'].includes(payment.status)) {
    const error = new Error('Payment sudah terminal dan tidak bisa dibatalkan');
    error.statusCode = 409;
    throw error;
  }

  let response = {};
  try {
    response = await premkuCancelPay(resolvePaymentProviderInvoice(payment));
  } catch (error) {
    response = { message: error instanceof Error ? error.message : 'Premku cancel_pay failed' };
  }
  logger('PAYMENT', { invoice: paymentInvoice, user_id: user.id, status: 'canceled' });
  void notifyAdmin('failed payment', {
    user: user.username,
    invoice: paymentInvoice,
    status: 'canceled',
    payment_type: payment.payment_type,
  });
  return updatePayment(paymentInvoice, { status: 'canceled', status_response: response, canceled_at: toMysqlDate(), clear_qr: true });
}
