import { findProductById } from '../../repositories/product.repo.js';
import { getUserById } from '../../repositories/user.repo.js';
import { getMarkupSetting } from '../../repositories/settings.repo.js';
import { createTransaction, findTransactionByInvoice, refundTransaction, updateTransactionStatus } from '../../repositories/transaction.repo.js';
import { updateOrderDelivery, upsertOrderRecord } from '../../repositories/order.repo.js';
import { execute, transaction as dbTransaction } from '../../config/db.js';
import { calculateRoleSellPrice } from '../../services/pricing.service.js';
import { premkuOrder, premkuStatus } from '../../services/premku.service.js';
import { addSaldo, deductSaldo, getSaldoUtama, getUsableBalance } from '../../services/wallet.service.js';
import { sendOrderDelivery, validateWhatsapp } from '../../services/delivery.service.js';
import { publishUserRefresh } from '../../services/realtime.service.js';
import { publishStockChanged } from '../../services/product-events.service.js';
import { deleteCache, getCache, setCache } from '../../services/cache.service.js';
import { createInvoice } from '../../utils/invoice.js';
import { toMysqlDate } from '../../utils/date.js';
import env from '../../config/env.js';

const ORDER_STATUS_CACHE_MS = env.PREMKU_ORDER_STATUS_CACHE_MS;

async function roleSellPrice(product, user = {}) {
  const setting = await getMarkupSetting();
  return calculateRoleSellPrice(product, setting, user).sellPrice;
}

function normalizeStatus(payload) {
  return String(payload?.status ?? payload?.data?.status ?? payload?.pay_status ?? payload?.transaction_status ?? '').toLowerCase();
}

function mapPremkuStatus(payload) {
  const status = normalizeStatus(payload);
  if (['pending', 'process', 'processing'].includes(status)) return 'processing';
  if (['success', 'sukses', 'paid'].includes(status)) return 'success';
  if (['failed', 'fail', 'gagal', 'error', 'cancel', 'expired'].includes(status)) return 'failed';
  return 'pending';
}

function extractAccountData(payload) {
  const source = payload?.accounts || payload?.data?.accounts || payload?.status?.accounts || payload?.data?.status?.accounts || [];
  if (Array.isArray(source) && source.length) {
    return source;
  }

  const single = payload?.account_data || payload?.data?.account_data || payload?.data?.akun || payload?.akun || null;
  if (single) return [single];
  return [];
}

function resolvePremkuOrderInvoice(payload, fallback) {
  const invoice =
    payload?.data?.order_id ??
    payload?.order_id ??
    payload?.data?.invoice_id ??
    payload?.invoice_id ??
    payload?.data?.invoice ??
    payload?.invoice ??
    payload?.data?.ref_id ??
    payload?.ref_id;
  return invoice ? String(invoice) : fallback;
}

function canUseProvider(product = {}) {
  return ['provider', 'hybrid'].includes(product.product_source) && Number(product.provider_stock ?? product.stock ?? 0) > 0;
}

function canUseManual(product = {}) {
  return Number(product.manual_stock ?? 0) > 0;
}

export async function getSellPrice(product) {
  const setting = await getMarkupSetting();
  return calculateRoleSellPrice(product, setting, { role: 'member' });
}

export async function refreshOrderStatus(invoice) {
  const transaction = await findTransactionByInvoice(invoice);
  if (!transaction) {
    return null;
  }

  if (['success', 'failed'].includes(transaction.status)) {
    return transaction;
  }

  const cacheKey = `order-status:${invoice}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const externalInvoice = transaction.external_order_response?.invoice || transaction.external_order_response?.data?.invoice || invoice;
  const statusResponse = await premkuStatus(externalInvoice);
  const nextStatus = mapPremkuStatus(statusResponse);
  const accounts = extractAccountData(statusResponse);

  const extra = {
    external_status_response: statusResponse,
    accounts,
    account_data: accounts.length ? accounts : null,
  };

  if (nextStatus === 'failed' && transaction.status !== 'failed') {
    const refunded = await refundTransaction(invoice, statusResponse, 'premku-status-failed');
    publishUserRefresh(transaction.user_id, 'order_updated', { scope: 'order', entity: 'order', id: invoice });
    publishUserRefresh(transaction.user_id, 'wallet_updated', { scope: 'wallet', entity: 'saldo', id: invoice });
    deleteCache(cacheKey);
    return refunded;
  }

  if (nextStatus === 'success') {
    extra.account_data = accounts.length ? accounts : transaction.account_data || null;
    const user = await getUserById(transaction.user_id);
    const orderRecord = await upsertOrderRecord({
      user_id: transaction.user_id,
      role: user?.role || 'member',
      invoice,
      product_id: transaction.product_id,
      product_name: transaction.product_name,
      payment_status: 'success',
      order_status: 'success',
      target_whatsapp: transaction.target_whatsapp || user?.phone || null,
      delivery_status: accounts.length ? 'pending' : 'manual_pending',
      total_price: transaction.total_price,
      accounts: accounts.length ? accounts : transaction.accounts || [],
      raw_response: statusResponse,
    });
    if (orderRecord?.delivery_status !== 'sent' && accounts.length) {
      const delivery = await sendOrderDelivery(orderRecord);
      await updateOrderDelivery(invoice, {
        delivery_status: delivery.status,
        delivery_time: toMysqlDate(),
        target_whatsapp: orderRecord.target_whatsapp,
      });
    }
  }

  const updated = await updateTransactionStatus(invoice, nextStatus, extra);
  publishUserRefresh(transaction.user_id, 'order_updated', { scope: 'order', entity: 'order', id: invoice });
  setCache(cacheKey, updated, nextStatus === 'success' || nextStatus === 'failed' ? 5000 : ORDER_STATUS_CACHE_MS);
  return updated;
}

export async function createOrder(user, payload) {
  const product = await findProductById(payload.product_id);

  if (!product) {
    const error = new Error('Produk tidak ditemukan');
    error.statusCode = 404;
    throw error;
  }

  if (product.status && product.status !== 'active') {
    const error = new Error('Produk tidak aktif');
    error.statusCode = 400;
    throw error;
  }

  if (Number(product.effective_stock ?? product.stock ?? 0) <= 0) {
    const error = new Error('Stok produk habis');
    error.statusCode = 400;
    throw error;
  }

  const qty = Number(payload.qty || 1);
  if (!Number.isInteger(qty) || qty < 1) {
    const error = new Error('Qty tidak valid');
    error.statusCode = 400;
    throw error;
  }

  const sellPrice = await roleSellPrice(product, user);
  const total = sellPrice * qty;
  let invoice = createInvoice('ORD');
  const localInvoice = invoice;
  const targetWhatsapp = validateWhatsapp(payload.target_whatsapp || user.phone || '');

  if (product.product_source === 'manual' && qty !== 1) {
    const error = new Error('Produk Manual Admin hanya bisa dibeli qty 1 per order.');
    error.statusCode = 400;
    throw error;
  }

  if (qty > 1 && !canUseProvider(product)) {
    const error = new Error('Stock provider tidak cukup untuk order qty lebih dari 1.');
    error.statusCode = 400;
    throw error;
  }

  if (qty === 1 && canUseManual(product)) {
    try {
      return await createManualOrder({ user, product, total, sellPrice, invoice, targetWhatsapp, channel: payload.channel || 'api' });
    } catch (error) {
      const stockEmpty = String(error?.message || '').toLowerCase().includes('stock') || String(error?.message || '').toLowerCase().includes('stok');
      if (product.product_source === 'manual' || !stockEmpty || !canUseProvider(product)) throw error;
      invoice = createInvoice('ORD');
    }
  }

  if (getUsableBalance(user) < total) {
    const error = new Error(user.role === 'reseller' ? 'Saldo reseller tidak cukup.' : 'Saldo tidak cukup. QRIS langsung tersedia untuk member.');
    error.statusCode = 402;
    error.code = user.role === 'member' ? 'MEMBER_DIRECT_QRIS_AVAILABLE' : 'INSUFFICIENT_RESELLER_BALANCE';
    throw error;
  }

  let transaction = null;
  let debited = false;

  try {
    await deductSaldo(user, total, invoice, 'Pemotongan saldo untuk order');
    debited = true;

    transaction = await createTransaction({
      invoice,
      ref_id: invoice,
      idempotency_key: `order:${user.id}:${invoice}`,
      user_id: user.id,
      product_id: product.id,
      product_name: product.name,
      qty,
      price_base: product.price_base,
      price_sell: sellPrice,
      total_price: total,
      profit: (sellPrice - product.price_base) * qty,
      status: 'pending',
      account_data: null,
      accounts: [],
      product_image: product.image || null,
      description: product.note || '',
      channel: payload.channel || 'api',
    });

    let external = null;
    try {
      external = await premkuOrder({
        product_id: product.premku_id || product.id,
        qty,
        ref_id: invoice,
      });
    } catch (error) {
      if (product.product_source === 'hybrid' && canUseManual(product) && qty === 1) {
        await refundTransaction(invoice, { message: error instanceof Error ? error.message : 'Premku order call failed before manual fallback' }, 'premku-call-failed-before-manual-fallback');
        return createManualOrder({ user, product, total, sellPrice, invoice: `${invoice}-M`, targetWhatsapp, channel: payload.channel || 'api', allowHybridFallback: true });
      }
      throw error;
    }
    const providerInvoice = resolvePremkuOrderInvoice(external, invoice);
    if (providerInvoice !== invoice) {
      await execute('UPDATE transactions SET invoice = ?, ref_id = ? WHERE invoice = ?', [providerInvoice, providerInvoice, invoice]);
      await execute('UPDATE saldo_logs SET reference = ? WHERE reference = ?', [providerInvoice, invoice]);
      await execute('UPDATE saldo_mutations SET reference = ? WHERE reference = ?', [providerInvoice, invoice]);
      invoice = providerInvoice;
    }

    const nextStatus = mapPremkuStatus(external);
    if (nextStatus === 'failed') {
      if (product.product_source === 'hybrid' && canUseManual(product) && qty === 1) {
        await refundTransaction(invoice, external, 'premku-order-failed-before-manual-fallback');
        return createManualOrder({ user, product, total, sellPrice, invoice: `${invoice}-M`, targetWhatsapp, channel: payload.channel || 'api', allowHybridFallback: true });
      }
      await refundTransaction(invoice, external, 'premku-order-failed');
    } else {
      const accounts = extractAccountData(external);
      await updateTransactionStatus(invoice, nextStatus === 'success' ? 'success' : 'processing', {
        external_order_response: external,
        account_data: accounts.length ? accounts : null,
        processed_at: nextStatus === 'success' ? new Date().toISOString() : null,
      });
      const orderRecord = await upsertOrderRecord({
        user_id: user.id,
        role: user.role,
        invoice,
        product_id: product.id,
        product_name: product.name,
        payment_status: 'success',
        order_status: nextStatus === 'success' ? 'success' : 'processing',
        target_whatsapp: targetWhatsapp || null,
        delivery_status: nextStatus === 'success' && accounts.length ? 'pending' : 'manual_pending',
        total_price: total,
        accounts,
        raw_response: external,
      });
      if (nextStatus === 'success' && accounts.length && orderRecord?.delivery_status !== 'sent') {
        const delivery = await sendOrderDelivery(orderRecord);
        await updateOrderDelivery(invoice, {
          delivery_status: delivery.status,
          delivery_time: ['sent', 'manual_pending', 'failed'].includes(delivery.status) ? toMysqlDate() : null,
          target_whatsapp: targetWhatsapp || null,
        });
      }
    }
  } catch (error) {
    if (transaction) {
      await refundTransaction(
        invoice,
        { message: error instanceof Error ? error.message : 'Premku order call failed' },
        'order-provider-failed-auto-refund',
      );
    } else if (debited) {
      await addSaldo(user, total, `${invoice || localInvoice}-refund`, 'Refund order gagal sebelum transaksi tercatat', 'refund');
    }
    throw error;
  }

  const result = (await findTransactionByInvoice(invoice)) || transaction;
  publishUserRefresh(user.id, 'order_updated', { scope: 'order', entity: 'order', id: invoice });
  return result;
}

async function createManualOrder({ user, product, total, sellPrice, invoice, targetWhatsapp, channel }) {
  const processedAt = toMysqlDate();
  const refreshed = await dbTransaction(async (connection) => {
    const [userRows] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [user.id]);
    const currentUser = userRows[0];
    if (!currentUser) {
      const error = new Error('User tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    const [productRows] = await connection.query('SELECT * FROM products WHERE id = ? FOR UPDATE', [product.id]);
    const currentProduct = productRows[0];
    if (!currentProduct || currentProduct.status !== 'active') {
      const error = new Error('Produk tidak aktif');
      error.statusCode = 400;
      throw error;
    }

    const [stockRows] = await connection.query(
      `SELECT * FROM manual_product_accounts
       WHERE product_id = ? AND status = 'available'
       ORDER BY id ASC
       LIMIT 1
       FOR UPDATE`,
      [product.id],
    );
    const stock = stockRows[0];
    if (!stock) {
      const error = new Error('Stock produk sedang habis');
      error.statusCode = 400;
      throw error;
    }

    const before = getSaldoUtama(currentUser);
    if (getUsableBalance(currentUser) < total) {
      const error = new Error(user.role === 'reseller' ? 'Saldo reseller tidak cukup.' : 'Saldo tidak cukup. QRIS langsung tersedia untuk member.');
      error.statusCode = 402;
      error.code = user.role === 'member' ? 'MEMBER_DIRECT_QRIS_AVAILABLE' : 'INSUFFICIENT_RESELLER_BALANCE';
      throw error;
    }
    const after = before - total;
    const account = { email: stock.email, username: stock.email, password: stock.password };

    await connection.query('UPDATE users SET saldo_utama = ?, saldo = ? WHERE id = ?', [after, after, user.id]);
    await connection.query('UPDATE manual_product_accounts SET status = "sold", reserved_by = ?, reserved_at = ?, sold_at = ? WHERE id = ?', [user.id, processedAt, processedAt, stock.id]);
    await connection.query('UPDATE product_credentials SET status = "sold", buyer_id = ?, invoice = ?, sold_at = ? WHERE product_id = ? AND email = ? AND password = ? AND status = "available" LIMIT 1', [user.id, invoice, processedAt, product.id, stock.email, stock.password]);
    await connection.query('UPDATE produk_stock_manual SET status = "sold", sold_to = ?, sold_at = ? WHERE product_id = ? AND email = ? AND password = ? AND status = "available" LIMIT 1', [user.id, processedAt, product.id, stock.email, stock.password]);
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
      [product.id, product.id, product.id, product.id, product.id],
    );
    await connection.query(
      `INSERT INTO saldo_logs (user_id, type, amount, balance_before, balance_after, reference, notes)
       VALUES (?, 'debit', ?, ?, ?, ?, ?)`,
      [user.id, total, before, after, invoice, 'Pemotongan saldo untuk order manual admin'],
    );
    await connection.query(
      `INSERT INTO saldo_mutations (user_id, mutation_type, amount, balance_before, balance_after, reference)
       VALUES (?, 'order', ?, ?, ?, ?)`,
      [user.id, total, before, after, invoice],
    );
    await connection.query(
      `INSERT INTO transactions
        (invoice, ref_id, idempotency_key, user_id, product_id, product_name, qty, price_base, price_sell, total_price, profit, status, account_data, external_order_response, channel, product_image, description, transaction_type, amount, processed_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'success', CAST(? AS JSON), CAST(? AS JSON), ?, ?, ?, 'order', ?, ?)`,
      [
        invoice,
        invoice,
        `manual-order:${user.id}:${invoice}`,
        user.id,
        product.id,
        product.name,
        Number(product.price_base || 0),
        sellPrice,
        total,
        Math.max(total - Number(product.price_base || 0), 0),
        JSON.stringify([account]),
        JSON.stringify({ status: true, type: 'manual', product: product.name, email: stock.email, password: stock.password, order_id: invoice, stock_id: stock.id }),
        channel,
        product.image || null,
        product.note || 'Produk Manual Admin',
        total,
        processedAt,
      ],
    );
    await connection.query(
      `INSERT INTO orders
        (user_id, role, invoice, product_id, product_name, email_account, password_account, payment_status, order_status, target_whatsapp, delivery_status, total_price, raw_response)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'success', 'success', ?, 'pending', ?, CAST(? AS JSON))`,
      [
        user.id,
        user.role || 'member',
        invoice,
        product.id,
        product.name,
        stock.email,
        stock.password,
        targetWhatsapp || null,
        total,
        JSON.stringify({ status: true, type: 'manual', product: product.name, email: stock.email, password: stock.password, order_id: invoice }),
      ],
    );

    const [transactionRows] = await connection.query('SELECT * FROM transactions WHERE invoice = ? LIMIT 1', [invoice]);
    return transactionRows[0];
  });

  user.saldo_utama = getSaldoUtama(user) - total;
  user.saldo = user.saldo_utama;
  publishUserRefresh(user.id, 'order_updated', { scope: 'order', entity: 'order', id: invoice });
  publishUserRefresh(user.id, 'wallet_updated', { scope: 'wallet', entity: 'saldo', id: invoice });
  publishStockChanged(product.id);

  const result = await findTransactionByInvoice(invoice);
  const orderRecord = await upsertOrderRecord({
    user_id: user.id,
    role: user.role,
    invoice,
    product_id: product.id,
    product_name: product.name,
    payment_status: 'success',
    order_status: 'success',
    target_whatsapp: targetWhatsapp || null,
    delivery_status: 'pending',
    total_price: total,
    accounts: result?.accounts || [],
    raw_response: { status: true, type: 'manual', product: product.name, order_id: invoice },
  });
  if (orderRecord?.delivery_status !== 'sent') {
    const delivery = await sendOrderDelivery(orderRecord);
    await updateOrderDelivery(invoice, {
      delivery_status: delivery.status,
      delivery_time: ['sent', 'manual_pending', 'failed'].includes(delivery.status) ? toMysqlDate() : null,
      target_whatsapp: targetWhatsapp || null,
    });
  }

  return result || refreshed;
}

export function getOrderStatus(invoice) {
  return refreshOrderStatus(invoice);
}

/**
 * Get active/pending cart from database
 * Combines pending transactions, deposits, dan payments
 */
export async function getActiveCart(userId) {
  const { query } = await import('../../config/db.js');

  // Get pending transactions (orders)
  const orders = await query(
    `SELECT 
      id, invoice, product_name, qty, total_price, status, created_at, updated_at
     FROM transactions 
     WHERE user_id = ? AND status IN ('pending', 'processing')
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId],
  );

  // Get pending deposits
  const deposits = await query(
    `SELECT 
      id, invoice, amount, total_bayar, status, created_at, expired_at
     FROM deposits 
     WHERE user_id = ? AND status IN ('pending')
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId],
  );

  // Get pending payments (direct order payments)
  const payments = await query(
    `SELECT 
      id, invoice, amount, payment_type, status, created_at, expired_at
     FROM payments 
     WHERE user_id = ? AND status IN ('pending')
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId],
  );

  return {
    pending_orders: orders || [],
    pending_deposits: deposits || [],
    pending_payments: payments || [],
    cart_total: {
      pending_order_count: orders?.length || 0,
      pending_deposit_count: deposits?.length || 0,
      pending_payment_count: payments?.length || 0,
      total_pending_items: (orders?.length || 0) + (deposits?.length || 0) + (payments?.length || 0),
    },
  };
}
