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
import { getCache, setCache } from '../../services/cache.service.js';
import { publishUserRefresh } from '../../services/realtime.service.js';
import { getSaldoUtama } from '../../services/wallet.service.js';
import { publishStockChanged } from '../../services/product-events.service.js';

const QR_EXPIRY_MS = 5 * 60 * 1000;

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
  if (['process', 'processing', 'pending'].includes(value)) return 'processing';
  return 'processing';
}

function extractAccounts(payload) {
  const source = payload?.accounts || payload?.data?.accounts || payload?.status?.accounts || payload?.data?.status?.accounts || [];
  if (Array.isArray(source) && source.length) return source;
  const single = payload?.account_data || payload?.data?.account_data || payload?.data?.akun || payload?.akun || null;
  return single ? [single] : [];
}

function resolvePremkuInvoice(payment) {
  const invoice =
    payment?.data?.invoice_id ??
    payment?.invoice_id ??
    payment?.data?.invoice ??
    payment?.invoice ??
    payment?.data?.ref_id ??
    payment?.ref_id ??
    payment?.data?.id ??
    payment?.id;
  return invoice ? String(invoice) : '';
}

function resolvePremkuOrderInvoice(order, fallback) {
  const invoice =
    order?.data?.invoice_id ??
    order?.invoice_id ??
    order?.data?.invoice ??
    order?.invoice ??
    order?.data?.order_id ??
    order?.order_id ??
    order?.data?.ref_id ??
    order?.ref_id;
  return invoice ? String(invoice) : fallback;
}

function canUseProvider(product = {}) {
  return ['provider', 'hybrid'].includes(product.product_source) && Number(product.provider_stock ?? product.stock ?? 0) > 0;
}

function canUseManual(product = {}) {
  return Number(product.manual_stock ?? 0) > 0;
}

function resolveExpiredAt(payment) {
  return toMysqlDate(new Date(Date.now() + QR_EXPIRY_MS));
}

async function roleSellPrice(product, user = { role: 'member' }) {
  const setting = await getMarkupSetting();
  return calculateRoleSellPrice(product, setting, user).sellPrice;
}

async function rebuildProductStock(connection, productId) {
  await connection.query(
    `UPDATE products
     SET manual_stock = (
       SELECT COUNT(*) FROM manual_product_accounts
       WHERE product_id = ? AND status = 'available'
     ),
     stock = CASE
       WHEN stock_mode = 'manual' THEN (
        SELECT COUNT(*) FROM manual_product_accounts
        WHERE product_id = ? AND status = 'available'
       )
       WHEN stock_mode = 'combined' THEN provider_stock + (
        SELECT COUNT(*) FROM manual_product_accounts
        WHERE product_id = ? AND status = 'available'
       )
       ELSE provider_stock + (
        SELECT COUNT(*) FROM manual_product_accounts
        WHERE product_id = ? AND status = 'available'
       )
     END
     WHERE id = ?`,
    [productId, productId, productId, productId, productId],
  );
}

async function reserveManualAccount(productId, userId) {
  const reserved = await transaction(async (connection) => {
    const [productRows] = await connection.query('SELECT id, status FROM products WHERE id = ? FOR UPDATE', [productId]);
    if (!productRows[0] || productRows[0].status !== 'active') return null;

    const [accountRows] = await connection.query(
      `SELECT * FROM manual_product_accounts
       WHERE product_id = ? AND status = 'available'
       ORDER BY id ASC
       LIMIT 1
       FOR UPDATE`,
      [productId],
    );
    const account = accountRows[0] || null;
    if (!account) return null;

    const reservedAt = toMysqlDate();
    await connection.query('UPDATE manual_product_accounts SET status = "reserved", reserved_by = ?, reserved_at = ? WHERE id = ?', [userId, reservedAt, account.id]);
    await rebuildProductStock(connection, productId);
    return { ...account, status: 'reserved', reserved_by: userId, reserved_at: reservedAt };
  });

  if (reserved) publishStockChanged(productId);
  return reserved;
}

async function releaseReservedManualAccount(accountId) {
  if (!accountId) return;
  const released = await transaction(async (connection) => {
    const [accountRows] = await connection.query('SELECT * FROM manual_product_accounts WHERE id = ? FOR UPDATE', [accountId]);
    const account = accountRows[0] || null;
    if (!account || account.status !== 'reserved') return null;
    await connection.query('UPDATE manual_product_accounts SET status = "available", reserved_by = NULL, reserved_at = NULL WHERE id = ?', [account.id]);
    await rebuildProductStock(connection, account.product_id);
    return account;
  });
  if (released) publishStockChanged(released.product_id);
}

async function getMemberProductPricing(productId, qty = 1) {
  const product = await findProductById(productId);
  if (!product || product.status !== 'active') {
    const error = new Error('Produk tidak ditemukan atau tidak aktif');
    error.statusCode = 404;
    throw error;
  }
  if (Number(product.effective_stock ?? product.stock ?? 0) <= 0) {
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
  if (product.product_source === 'manual' && numericQty !== 1) {
    const error = new Error('Produk Manual Admin hanya bisa dibeli qty 1 per order.');
    error.statusCode = 400;
    throw error;
  }
  if (numericQty > 1 && !canUseProvider(product)) {
    const error = new Error('Stock provider tidak cukup untuk order qty lebih dari 1.');
    error.statusCode = 400;
    throw error;
  }

  const sellPrice = await roleSellPrice(product, { role: 'member' });
  return { product, qty: numericQty, total: sellPrice * numericQty };
}

export async function createDirectOrderPayment(user, payload) {
  if (user.role !== 'member') {
    const error = new Error('QRIS langsung hanya tersedia untuk member');
    error.statusCode = 403;
    throw error;
  }

  const { product, qty, total } = await getMemberProductPricing(payload.product_id, payload.qty);
  const targetWhatsapp = validateWhatsapp(user.phone || '');
  let reservedManualAccount = null;
  if (qty === 1 && canUseManual(product)) {
    reservedManualAccount = await reserveManualAccount(product.id, user.id);
  }

  let payment;
  try {
    payment = await premkuPay({ amount: total });
  } catch (error) {
    if (reservedManualAccount) await releaseReservedManualAccount(reservedManualAccount.id);
    throw error;
  }
  const invoice = resolvePremkuInvoice(payment);
  if (!invoice) {
    if (reservedManualAccount) await releaseReservedManualAccount(reservedManualAccount.id);
    const error = new Error('Premku tidak mengirim invoice payment yang valid');
    error.statusCode = 502;
    throw error;
  }
  const totalBayar = Number(payment?.total_bayar ?? payment?.data?.total_bayar ?? payment?.amount_total ?? payment?.data?.amount_total ?? total);
  const qrImage = payment?.qr_image ?? payment?.data?.qr_image ?? null;
  const qrRaw = payment?.qr_raw ?? payment?.qr_data ?? payment?.data?.qr_raw ?? payment?.data?.qr_data ?? payment?.data?.qr ?? qrImage ?? null;

  if (!qrImage && !qrRaw) {
    if (reservedManualAccount) await releaseReservedManualAccount(reservedManualAccount.id);
    const error = new Error(payment?.message || payment?.error || 'Gagal membuat QR pembayaran');
    error.statusCode = 502;
    throw error;
  }

  logger('PAYMENT', { invoice, user_id: user.id, amount: total, total_bayar: totalBayar, payment_type: 'direct_order' });
  const created = await createPayment({
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
    reserved_manual_account_id: reservedManualAccount?.id || null,
    raw_response: payment,
    target_whatsapp: targetWhatsapp || null,
    expired_at: resolveExpiredAt(payment),
  });
  publishUserRefresh(user.id, 'payment_updated', { scope: 'payment', entity: 'payment', id: created.invoice });
  return { ...created, product_name: product.name };
}

async function getUserProductPricing(user, productId, qty = 1) {
  const product = await findProductById(productId);
  if (!product || product.status !== 'active') {
    const error = new Error('Produk tidak ditemukan atau tidak aktif');
    error.statusCode = 404;
    throw error;
  }
  if (Number(product.effective_stock ?? product.stock ?? 0) <= 0) {
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
  if (product.product_source === 'manual' && numericQty !== 1) {
    const error = new Error('Produk Manual Admin hanya bisa dibeli qty 1 per order.');
    error.statusCode = 400;
    throw error;
  }
  if (numericQty > 1 && !canUseProvider(product)) {
    const error = new Error('Stock provider tidak cukup untuk order qty lebih dari 1.');
    error.statusCode = 400;
    throw error;
  }

  const sellPrice = await roleSellPrice(product, user);
  return { product, qty: numericQty, total: sellPrice * numericQty };
}

export async function createBotOrderPayment(user, payload) {
  const { product, qty, total } = await getUserProductPricing(user, payload.product_id, payload.qty);
  const totalWithMargin = total + Math.max(0, Number(payload.extra_margin || 0)) * qty;
  const targetWhatsapp = validateWhatsapp(payload.target_whatsapp || user.phone || '');
  let reservedManualAccount = null;
  if (qty === 1 && canUseManual(product)) {
    reservedManualAccount = await reserveManualAccount(product.id, user.id);
  }

  let payment;
  try {
    payment = await premkuPay({ amount: totalWithMargin });
  } catch (error) {
    if (reservedManualAccount) await releaseReservedManualAccount(reservedManualAccount.id);
    throw error;
  }
  const invoice = resolvePremkuInvoice(payment);
  if (!invoice) {
    if (reservedManualAccount) await releaseReservedManualAccount(reservedManualAccount.id);
    const error = new Error('Premku tidak mengirim invoice payment yang valid');
    error.statusCode = 502;
    throw error;
  }
  const totalBayar = Number(payment?.total_bayar ?? payment?.data?.total_bayar ?? payment?.amount_total ?? payment?.data?.amount_total ?? totalWithMargin);
  const qrImage = payment?.qr_image ?? payment?.data?.qr_image ?? null;
  const qrRaw = payment?.qr_raw ?? payment?.qr_data ?? payment?.data?.qr_raw ?? payment?.data?.qr_data ?? payment?.data?.qr ?? qrImage ?? null;

  if (!qrImage && !qrRaw) {
    if (reservedManualAccount) await releaseReservedManualAccount(reservedManualAccount.id);
    const error = new Error(payment?.message || payment?.error || 'Gagal membuat QR pembayaran');
    error.statusCode = 502;
    throw error;
  }

  logger('PAYMENT', { invoice, user_id: user.id, amount: totalWithMargin, total_bayar: totalBayar, payment_type: 'bot_order' });
  const created = await createPayment({
    user_id: user.id,
    invoice,
    amount: totalWithMargin,
    total_bayar: totalBayar,
    payment_type: 'bot_order',
    status: 'pending',
    qr_image: typeof qrImage === 'string' ? qrImage : null,
    qr_raw: typeof qrRaw === 'string' ? qrRaw : JSON.stringify(qrRaw),
    product_id: product.id,
    qty,
    reserved_manual_account_id: reservedManualAccount?.id || null,
    raw_response: payment,
    target_whatsapp: targetWhatsapp || null,
    expired_at: resolveExpiredAt(payment),
  });
  publishUserRefresh(user.id, 'payment_updated', { scope: 'payment', entity: 'payment', id: created.invoice });
  return { ...created, product_name: product.name };
}

async function processSuccessfulPayment(invoice, statusResponse) {
  const result = await transaction(async (connection) => {
    const [paymentRows] = await connection.query('SELECT * FROM payments WHERE invoice = ? FOR UPDATE', [invoice]);
    const payment = paymentRows[0];
    if (!payment) {
      const error = new Error('Payment tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    if (payment.status === 'success' && payment.processed_at && payment.order_invoice) {
      const [orderRows] = await connection.query('SELECT * FROM orders WHERE invoice = ? LIMIT 1', [payment.order_invoice]);
      return { payment, order: orderRows[0] || null, changed: false, userId: payment.user_id, orderInvoice: payment.order_invoice };
    }

    const [productRows] = await connection.query('SELECT * FROM products WHERE id = ? LIMIT 1', [payment.product_id]);
    const product = productRows[0];
    if (!product) {
      const error = new Error('Produk tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    let orderInvoice = payment.order_invoice || createInvoice('ORD');
    const qty = Number(payment.qty || 1);
    let manualStock = null;
    let external = null;
    let orderStatus = 'success';
    let accounts = [];
    if (payment.reserved_manual_account_id) {
      const [reservedRows] = await connection.query(
        `SELECT * FROM manual_product_accounts
         WHERE id = ? AND product_id = ? AND status = 'reserved'
         FOR UPDATE`,
        [payment.reserved_manual_account_id, product.id],
      );
      manualStock = reservedRows[0] || null;
      if (!manualStock) {
        const error = new Error('Stock manual reserved tidak ditemukan');
        error.statusCode = 409;
        throw error;
      }
      accounts = [{ email: manualStock.email, username: manualStock.email, password: manualStock.password }];
      external = { status: true, type: product.product_source === 'provider' ? 'provider_manual_reserved' : product.product_source === 'hybrid' ? 'hybrid_manual_reserved' : 'manual_reserved', product: product.name, email: manualStock.email, password: manualStock.password, order_id: orderInvoice };
    } else if (product.product_source === 'manual' || (qty === 1 && canUseManual(product))) {
      const [stockRows] = await connection.query(
        `SELECT * FROM manual_product_accounts
         WHERE product_id = ? AND status = 'available'
         ORDER BY id ASC
         LIMIT 1
         FOR UPDATE`,
        [product.id],
      );
      manualStock = stockRows[0] || null;
      if (!manualStock && product.product_source === 'manual') {
        const error = new Error('Stock produk sedang habis');
        error.statusCode = 400;
        throw error;
      }
      if (manualStock) {
        accounts = [{ email: manualStock.email, username: manualStock.email, password: manualStock.password }];
        external = { status: true, type: product.product_source === 'provider' ? 'provider_manual_first' : product.product_source === 'hybrid' ? 'hybrid_manual_first' : 'manual', product: product.name, email: manualStock.email, password: manualStock.password, order_id: orderInvoice };
      }
    }

    if (!manualStock) {
      if (!canUseProvider(product)) {
        const error = new Error('Stock produk sedang habis');
        error.statusCode = 400;
        throw error;
      }
      try {
        external = await premkuOrder({
          product_id: product.premku_id || product.id,
          qty,
          ref_id: orderInvoice,
        });
      } catch (error) {
        if (product.product_source === 'hybrid' && canUseManual(product)) {
          const [stockRows] = await connection.query(
            `SELECT * FROM manual_product_accounts
             WHERE product_id = ? AND status = 'available'
             ORDER BY id ASC
             LIMIT 1
             FOR UPDATE`,
            [product.id],
          );
          manualStock = stockRows[0] || null;
          if (manualStock) {
            orderInvoice = `${orderInvoice}-M`;
            orderStatus = 'success';
            accounts = [{ email: manualStock.email, username: manualStock.email, password: manualStock.password }];
            external = { status: true, type: 'hybrid_manual_fallback', reason: error instanceof Error ? error.message : 'provider failed', product: product.name, email: manualStock.email, password: manualStock.password, order_id: orderInvoice };
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
      orderInvoice = resolvePremkuOrderInvoice(external, orderInvoice);
      orderStatus = normalizeOrderStatus(external);
      if (orderStatus === 'failed' && product.product_source === 'hybrid' && canUseManual(product)) {
        const [stockRows] = await connection.query(
          `SELECT * FROM manual_product_accounts
           WHERE product_id = ? AND status = 'available'
           ORDER BY id ASC
           LIMIT 1
           FOR UPDATE`,
          [product.id],
        );
        manualStock = stockRows[0] || null;
        if (manualStock) {
          orderInvoice = `${orderInvoice}-M`;
          orderStatus = 'success';
          accounts = [{ email: manualStock.email, username: manualStock.email, password: manualStock.password }];
          external = { status: true, type: 'hybrid_manual_fallback', product: product.name, email: manualStock.email, password: manualStock.password, order_id: orderInvoice };
        }
      }
      if (!manualStock) {
        accounts = extractAccounts(external);
      }
    }
    const firstAccount = accounts[0] || {};
    const processedAt = toMysqlDate();
    const total = Number(payment.amount || 0);
    const priceBase = Number(product.price_base || product.base_price || 0);
    const [userRows] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [payment.user_id]);
    const user = userRows[0] || {};
    const paymentType = payment.payment_type || 'direct_order';
    const orderChannel = paymentType === 'bot_order' ? 'bot-qris' : 'qris-direct';
    const orderDescription = product.note || product.description || (paymentType === 'bot_order' ? 'Order via Bot WhatsApp' : 'Order member via QRIS langsung');

    await connection.query(
      `UPDATE payments
       SET status = 'success', status_response = CAST(? AS JSON), order_invoice = ?, processed_at = ?, qr_image = NULL, qr_raw = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE invoice = ?`,
      [JSON.stringify(statusResponse ?? null), orderInvoice, processedAt, invoice],
    );
    const balanceBefore = getSaldoUtama(user);
    const balanceAfterCredit = balanceBefore + total;
    await connection.query('UPDATE users SET saldo_utama = ?, saldo = ? WHERE id = ?', [balanceAfterCredit, balanceAfterCredit, payment.user_id]);
    await connection.query(
      `INSERT INTO saldo_logs
        (user_id, type, amount, balance_before, balance_after, reference, notes)
       VALUES (?, 'credit', ?, ?, ?, ?, ?)`,
      [payment.user_id, total, balanceBefore, balanceAfterCredit, invoice, 'Pembayaran QRIS langsung member'],
    );
    await connection.query(
      `INSERT INTO saldo_mutations
        (user_id, mutation_type, amount, balance_before, balance_after, reference)
       VALUES (?, 'deposit', ?, ?, ?, ?)`,
      [payment.user_id, total, balanceBefore, balanceAfterCredit, invoice],
    );
    await connection.query('UPDATE users SET saldo_utama = ?, saldo = ? WHERE id = ?', [balanceBefore, balanceBefore, payment.user_id]);
    await connection.query(
      `INSERT INTO saldo_logs
        (user_id, type, amount, balance_before, balance_after, reference, notes)
       VALUES (?, 'debit', ?, ?, ?, ?, ?)`,
      [payment.user_id, total, balanceAfterCredit, balanceBefore, orderInvoice, 'Pemotongan saldo untuk order'],
    );
    await connection.query(
      `INSERT INTO saldo_mutations
        (user_id, mutation_type, amount, balance_before, balance_after, reference)
       VALUES (?, 'order', ?, ?, ?, ?)`,
      [payment.user_id, total, balanceAfterCredit, balanceBefore, orderInvoice],
    );
    if (manualStock) {
      await connection.query('UPDATE manual_product_accounts SET status = "sold", sold_at = ?, reserved_by = COALESCE(reserved_by, ?), reserved_at = COALESCE(reserved_at, ?) WHERE id = ?', [processedAt, payment.user_id, processedAt, manualStock.id]);
      await connection.query('UPDATE product_credentials SET status = "sold", buyer_id = ?, invoice = ?, sold_at = ? WHERE product_id = ? AND email = ? AND password = ? AND status = "available" LIMIT 1', [payment.user_id, orderInvoice, processedAt, product.id, manualStock.email, manualStock.password]);
      await connection.query('UPDATE produk_stock_manual SET status = "sold", sold_to = ?, sold_at = ? WHERE product_id = ? AND email = ? AND password = ? AND status = "available" LIMIT 1', [payment.user_id, processedAt, product.id, manualStock.email, manualStock.password]);
      await rebuildProductStock(connection, product.id);
    }
    await connection.query(
      `INSERT INTO transactions
        (invoice, ref_id, user_id, product_id, product_name, qty, price_base, price_sell, total_price, profit, status, account_data, external_order_response, channel, product_image, description, transaction_type, amount, processed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, ?, ?, 'order', ?, ?)
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
        priceBase,
        Math.round(total / Number(payment.qty || 1)),
        total,
        Math.max(total - priceBase * Number(payment.qty || 1), 0),
        orderStatus,
        JSON.stringify(accounts.length ? accounts : null),
        JSON.stringify(external ?? null),
        orderChannel,
        product.image || product.image_url || null,
        orderDescription,
        total,
        orderStatus === 'success' ? processedAt : null,
      ],
    );
    const targetWhatsapp = validateWhatsapp(payment.target_whatsapp || '');
    await connection.query(
      `INSERT INTO orders
        (user_id, role, invoice, payment_invoice, product_id, product_name, email_account, password_account, payment_status, order_status, target_whatsapp, delivery_status, total_price, raw_response)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'success', ?, ?, ?, ?, CAST(? AS JSON))
       ON DUPLICATE KEY UPDATE
        payment_status = 'success',
        order_status = VALUES(order_status),
        email_account = COALESCE(VALUES(email_account), email_account),
        password_account = COALESCE(VALUES(password_account), password_account),
        target_whatsapp = COALESCE(VALUES(target_whatsapp), target_whatsapp),
        raw_response = VALUES(raw_response),
        updated_at = CURRENT_TIMESTAMP`,
      [
        payment.user_id,
        user.role || 'member',
        orderInvoice,
        invoice,
        product.id,
        product.name,
        firstAccount.email || firstAccount.username || null,
        firstAccount.password || firstAccount.pass || null,
        orderStatus,
        targetWhatsapp || null,
        orderStatus === 'success' && accounts.length ? 'pending' : 'manual_pending',
        total,
        JSON.stringify(external ?? null),
      ],
    );
    await connection.query(
      `INSERT INTO activity_logs (actor_id, user_id, scope, message, activity, metadata)
       VALUES (?, ?, 'ORDER', ?, ?, CAST(? AS JSON))`,
      [
        payment.user_id,
        payment.user_id,
        paymentType === 'bot_order' ? 'Bot QRIS order processed' : 'Direct QRIS order processed',
        paymentType === 'bot_order' ? 'Bot QRIS order processed' : 'Direct QRIS order processed',
        JSON.stringify({ payment_invoice: invoice, order_invoice: orderInvoice, order_status: orderStatus, payment_type: paymentType }),
      ],
    );

    const [updatedPaymentRows] = await connection.query('SELECT * FROM payments WHERE invoice = ? LIMIT 1', [invoice]);
    const [orderRows] = await connection.query('SELECT * FROM orders WHERE invoice = ? LIMIT 1', [orderInvoice]);
    logger('ORDER', { invoice: orderInvoice, payment_invoice: invoice, user_id: payment.user_id, order_status: orderStatus });
    const order = orderRows[0] || null;
    return { payment: updatedPaymentRows[0], order, changed: true, userId: payment.user_id, orderInvoice };
  });

  if (result.changed) {
    publishUserRefresh(result.userId, 'payment_updated', { scope: 'payment', entity: 'payment', id: invoice });
    publishUserRefresh(result.userId, 'order_updated', { scope: 'order', entity: 'order', id: result.orderInvoice });
    publishUserRefresh(result.userId, 'wallet_updated', { scope: 'wallet', entity: 'saldo', id: result.orderInvoice });
    if (result.order?.product_id) publishStockChanged(result.order.product_id);
  }
  return { payment: result.payment, order: result.order };
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
    const existing = await transaction(async (connection) => {
      const [orderRows] = await connection.query('SELECT * FROM orders WHERE payment_invoice = ? ORDER BY id DESC LIMIT 1', [invoice]);
      return orderRows[0] || null;
    });
    return {
      ...payment,
      order: existing
        ? {
            invoice: existing.invoice,
            product_name: existing.product_name,
            email_account: existing.email_account,
            password_account: existing.password_account,
            payment_status: existing.payment_status,
            order_status: existing.order_status,
            target_whatsapp: existing.target_whatsapp,
            delivery_status: existing.delivery_status,
            delivery_time: existing.delivery_time,
            total_price: Number(existing.total_price || 0),
            raw_response: parseDbJson(existing.raw_response, null),
            created_at: existing.created_at,
          }
        : null,
    };
  }

  const cached = getCache(`payment-status:${invoice}`);
  if (cached) return cached;

  const statusResponse = await premkuPayStatus(invoice);
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
    const response = {
      ...payment,
      status: 'success',
      qr_image: null,
      qr_raw: null,
      processed_at: result.payment.processed_at,
      order_invoice: result.payment.order_invoice,
      order: result.order
        ? {
            invoice: result.order.invoice,
            product_name: result.order.product_name,
            email_account: result.order.email_account,
            password_account: result.order.password_account,
            payment_status: result.order.payment_status,
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
    setCache(`payment-status:${invoice}`, response, 5000);
    return response;
  }

  if (['failed', 'expired', 'canceled'].includes(nextStatus) && payment.reserved_manual_account_id) {
    await releaseReservedManualAccount(payment.reserved_manual_account_id);
  }
  const updated = await updatePayment(invoice, { status: nextStatus, status_response: statusResponse });
  if (updated?.user_id) publishUserRefresh(updated.user_id, 'payment_updated', { scope: 'payment', entity: 'payment', id: invoice });
  setCache(`payment-status:${invoice}`, updated, 5000);
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
  if (payment.reserved_manual_account_id) await releaseReservedManualAccount(payment.reserved_manual_account_id);
  const updated = await updatePayment(invoice, { status: 'canceled', status_response: response, canceled_at: toMysqlDate() });
  if (updated?.user_id) publishUserRefresh(updated.user_id, 'payment_updated', { scope: 'payment', entity: 'payment', id: invoice });
  return updated;
}
