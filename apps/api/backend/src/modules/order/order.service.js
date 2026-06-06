import { query, transaction as dbTransaction } from '../../config/db.js';
import { findProductById, markManualStockItemsUsed, refreshManualStockCount, reserveManualStockItems } from '../../repositories/product.repo.js';
import { getUserById } from '../../repositories/user.repo.js';
import { createTransaction, findTransactionByInvoice, refundTransaction, updateTransactionStatus } from '../../repositories/transaction.repo.js';
import { updateOrderDelivery, updateOrderProviderStatus, upsertOrderRecord, findOrderByInvoice, updateOrderStatusByInvoice, listOrdersByUser } from '../../repositories/order.repo.js';
import { premkuOrder, premkuStatus } from '../../services/premku.service.js';
import { addSaldo, applyWalletMutationInTransaction, deductSaldo, getUsableBalance } from '../../services/wallet.service.js';
import { sendOrderDelivery, validateWhatsapp } from '../../services/delivery.service.js';
import { notifyAdmin } from '../../services/notification.service.js';
import { createNotification } from '../../repositories/notification.repo.js';
import { createInvoice } from '../../utils/invoice.js';
import { getCache, setCache } from '../../services/cache.service.js';
import { getMarkupSetting } from '../../repositories/settings.repo.js';
import { calculateProductPrices } from '../../services/product-pricing.service.js';

function toMysqlDate(value = new Date()) {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeStatus(payload) {
  return String(payload?.status ?? payload?.data?.status ?? payload?.pay_status ?? payload?.transaction_status ?? '').toLowerCase();
}

function mapPremkuStatus(payload) {
  const status = normalizeStatus(payload);
  if (['pending', 'queue', 'queued', 'waiting'].includes(status)) return 'pending';
  if (['process', 'processing'].includes(status)) return 'processing';
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

function requiresManualHandling(nextStatus, accounts) {
  const noAccountData = !accounts.length;
  if (nextStatus === 'success') return noAccountData;
  if (nextStatus === 'failed') return noAccountData;
  return false;
}

function isProviderActiveStatus(status) {
  return ['pending', 'waiting_provider', 'provider_processing', 'processing'].includes(String(status || '').toLowerCase());
}

async function notifyOrderSuccessOnce(userId, invoice, productName, type = 'order_success') {
  try {
    const rows = await query(
      `SELECT id FROM notifications
       WHERE user_id = ? AND type = ? AND message LIKE ?
       LIMIT 1`,
      [Number(userId), type, `%${invoice}%`],
    );
    if (rows.length) return;
    await createNotification({
      user_id: Number(userId),
      title: type === 'refund' ? 'Refund order berhasil' : 'Order berhasil',
      message: type === 'refund'
        ? `Refund order ${invoice} berhasil diproses.`
        : `Order ${productName || 'produk digital'} (${invoice}) berhasil. Credential sudah tersedia di riwayat pesanan.`,
      type,
      is_active: true,
    });
  } catch {
    // Notification must never block order processing.
  }
}

/**
 * Get the role-based price from pre-calculated product prices
 * RULE: Backend calculates ONCE (in product-pricing.service), Frontend renders ONLY
 */
export async function getSellPrice(product, user = { role: 'member' }) {
  const role = String(user?.role || 'member').toLowerCase();
  const price = role === 'reseller' ? product.reseller_price : product.member_price;
  if (Number(price || 0) > 0) {
    return {
      sellPrice: price,
    };
  }
  const markupSetting = await getMarkupSetting();
  const calculated = calculateProductPrices(product, markupSetting);
  return {
    sellPrice: role === 'reseller' ? calculated.reseller_price : calculated.member_price,
  };
}

export async function refreshOrderStatus(invoice) {
  const transaction = await findTransactionByInvoice(invoice);
  const existingOrder = await findOrderByInvoice(invoice);
  if (!transaction && !existingOrder) {
    return null;
  }

  const orderStatus = String(existingOrder?.order_status || '').toLowerCase();
  if (['success', 'provider_success', 'credential_delivery', 'failed', 'canceled', 'cancelled'].includes(orderStatus)) {
    if (['success', 'provider_success', 'credential_delivery'].includes(orderStatus) && transaction && transaction.status !== 'success') {
      const accountData = existingOrder?.raw_response?.accounts?.length
        ? existingOrder.raw_response.accounts
        : existingOrder?.email_account || existingOrder?.password_account
          ? [{ username: existingOrder.email_account, password: existingOrder.password_account }]
          : transaction.account_data || null;
      await updateTransactionStatus(invoice, 'success', {
        external_status_response: existingOrder.raw_response || transaction.external_status_response || null,
        account_data: accountData,
        processed_at: existingOrder.success_at || toMysqlDate(),
      });
    }
    return existingOrder || transaction;
  }

  if (!transaction) {
    return existingOrder;
  }

  const externalInvoice =
    existingOrder?.provider_invoice ||
    transaction.external_order_response?.invoice ||
    transaction.external_order_response?.data?.invoice ||
    invoice;
  const statusCacheKey = `sync:order-status:${externalInvoice}`;
  if (getCache(statusCacheKey)) {
    return existingOrder || transaction;
  }
  const statusResponse = await premkuStatus(externalInvoice);
  setCache(statusCacheKey, true, 15);
  const nextStatus = mapPremkuStatus(statusResponse);
  const accounts = extractAccountData(statusResponse);

  const extra = {
    external_status_response: statusResponse,
    accounts,
    account_data: accounts.length ? accounts : null,
  };

  if (nextStatus === 'success' && accounts.length) {
    extra.account_data = accounts.length ? accounts : transaction.account_data || null;
    const user = await getUserById(transaction.user_id);
    const orderRecord = await upsertOrderRecord({
      user_id: transaction.user_id,
      role: user?.role || 'member',
      invoice,
      product_id: transaction.product_id,
      product_name: transaction.product_name,
      payment_status: 'success',
      provider_invoice: externalInvoice,
      provider_status: 'success',
      order_status: 'provider_success',
      fulfillment_type: 'provider_auto',
      target_whatsapp: transaction.target_whatsapp || user?.phone || null,
      delivery_status: accounts.length ? 'pending' : 'manual_pending',
      total_price: transaction.total_price,
      accounts: accounts.length ? accounts : transaction.accounts || [],
      raw_response: statusResponse,
      success_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });
    if (orderRecord?.delivery_status !== 'sent' && accounts.length) {
      const delivery = await sendOrderDelivery(orderRecord);
      await updateOrderDelivery(invoice, {
        delivery_status: delivery.status,
        delivery_time: new Date().toISOString().slice(0, 19).replace('T', ' '),
        target_whatsapp: orderRecord.target_whatsapp,
      });
    }

    void notifyOrderSuccessOnce(transaction.user_id, invoice, transaction.product_name);
    await updateTransactionStatus(invoice, 'success', {
      ...extra,
      processed_at: toMysqlDate(),
    });
    return findOrderByInvoice(invoice);
  }

  if (requiresManualHandling(nextStatus, accounts)) {
    await updateOrderProviderStatus(invoice, {
      provider_status: 'pending_manual',
      order_status: 'pending_manual',
      raw_response: statusResponse,
    });
    return updateTransactionStatus(invoice, 'pending', extra);
  }

  if (['processing', 'pending'].includes(nextStatus)) {
    await updateOrderProviderStatus(invoice, {
      provider_status: 'provider_processing',
      order_status: 'provider_processing',
      raw_response: statusResponse,
    });
    await updateTransactionStatus(invoice, 'pending', extra);
    return findOrderByInvoice(invoice);
  }

  if (nextStatus === 'failed' && transaction.status !== 'failed') {
    if (['qris-direct', 'bot-qris'].includes(transaction.channel)) {
      await updateOrderProviderStatus(invoice, {
        provider_status: 'failed',
        order_status: 'failed',
        raw_response: statusResponse,
      });
      await updateTransactionStatus(invoice, 'failed', {
        external_status_response: statusResponse,
        refund_at: toMysqlDate(),
      });
      return findOrderByInvoice(invoice);
    }
    return refundTransaction(invoice, statusResponse, 'premku-status-failed');
  }

  return updateTransactionStatus(invoice, nextStatus, extra);
}

export async function syncActiveOrdersForUser(userId, limit = 5) {
  const rows = await listOrdersByUser(userId);
  const activeOrders = rows
    .filter((order) => isProviderActiveStatus(order.order_status) && order.provider_invoice)
    .slice(0, Math.max(1, Number(limit || 5)));

  for (const order of activeOrders) {
    try {
      await refreshOrderStatus(order.invoice);
    } catch {
      // Lazy sync must not block the order history page.
    }
  }

  return listOrdersByUser(userId);
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

  if (Number(product.stock || 0) <= 0) {
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
  if (qty > Number(product.max_order_qty || product.stock || 0)) {
    const error = new Error('Qty melebihi stok yang dapat dipenuhi dalam satu order');
    error.statusCode = 409;
    error.code = 'PRODUCT_QTY_UNAVAILABLE';
    throw error;
  }

  const pricing = await getSellPrice(product, user);
  const total = pricing.sellPrice * qty;
  const invoice = createInvoice('ORD');
  const targetWhatsapp = validateWhatsapp(user.phone || '');

  if (getUsableBalance(user) < total) {
    const available = getUsableBalance(user);
    const error = new Error('Saldo tidak cukup. Silakan deposit saldo terlebih dahulu.');
    error.statusCode = 402;
    error.code = 'INSUFFICIENT_BALANCE';
    error.data = {
      required: total,
      available,
    };
    throw error;
  }

  const shouldTryManualStock = product.product_source === 'manual' || product.product_source === 'hybrid';
  let manualFulfilled = false;
  if (shouldTryManualStock) {
    await dbTransaction(async (connection) => {
      const stockItems = await reserveManualStockItems(connection, product.id, invoice, qty);
      if (stockItems.length < qty) {
        await refreshManualStockCount(connection, product.id);
        if (product.product_source === 'hybrid') return;
        const error = new Error('Stok manual kosong');
        error.statusCode = 400;
        throw error;
      }
      const accounts = stockItems.map((stockItem) => ({
        email: stockItem.email_account,
        password: stockItem.password_account,
        description: stockItem.description,
      }));

      const wallet = await applyWalletMutationInTransaction(connection, user.id, {
        mutation_type: 'order_payment',
        direction: 'out',
        amount: total,
        source_type: 'order',
        source_ref: invoice,
        notes: `manual-stock-order:${product.name}`,
      });

      await connection.query(
        `INSERT INTO transactions
          (invoice, ref_id, user_id, product_id, product_name, qty, price_base, price_sell, total_price, profit, reseller_profit, status, account_data, channel, product_image, description, transaction_type, amount, processed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'success', CAST(? AS JSON), ?, ?, ?, 'order', ?, NOW())`,
        [
          invoice,
          invoice,
          user.id,
          product.id,
          product.name,
          qty,
          product.price_base || product.base_price || 0,
          pricing.sellPrice,
          total,
          (pricing.sellPrice - (product.price_base || product.base_price || 0)) * qty,
          JSON.stringify(accounts),
          payload.channel || 'api',
          product.image || null,
          product.note || '',
          total,
        ],
      );
      await markManualStockItemsUsed(connection, stockItems.map((stockItem) => stockItem.id), invoice);
      await refreshManualStockCount(connection, product.id);
      await connection.query(
        `INSERT INTO orders
          (user_id, role, invoice, product_id, product_name, email_account, password_account, payment_status, provider_invoice, provider_status, order_status, fulfillment_type, target_whatsapp, delivery_status, total_price, raw_response, processing_started_at, success_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'success', ?, 'success', 'success', ?, ?, 'pending', ?, CAST(? AS JSON), NOW(), NOW())
         ON DUPLICATE KEY UPDATE
          payment_status = 'success',
          provider_status = 'success',
          order_status = 'success',
          fulfillment_type = VALUES(fulfillment_type),
          email_account = VALUES(email_account),
          password_account = VALUES(password_account),
          target_whatsapp = COALESCE(VALUES(target_whatsapp), target_whatsapp),
          delivery_status = 'pending',
          total_price = VALUES(total_price),
          raw_response = VALUES(raw_response),
          success_at = COALESCE(success_at, VALUES(success_at)),
          updated_at = CURRENT_TIMESTAMP`,
        [
          user.id,
          user.role,
          invoice,
          product.id,
          product.name,
          stockItems[0]?.email_account || null,
          stockItems[0]?.password_account || null,
          invoice,
          product.product_source === 'hybrid' ? 'hybrid_manual_stock' : 'manual_stock',
          targetWhatsapp || null,
          total,
          JSON.stringify({ source: product.product_source === 'hybrid' ? 'hybrid_manual_stock' : 'manual_stock', stock_item_ids: stockItems.map((stockItem) => stockItem.id), accounts, balance_before: wallet.before, balance_after: wallet.after }),
        ],
      );

      void notifyAdmin('order success', {
        user: user.username,
        product: product.name,
        status: 'MANUAL_STOCK_SUCCESS',
        invoice,
      });
      manualFulfilled = true;
    });
    if (manualFulfilled) {
      const orderRecord = await findOrderByInvoice(invoice);
      if (orderRecord?.delivery_status !== 'sent') {
        const delivery = await sendOrderDelivery(orderRecord);
        await updateOrderDelivery(invoice, {
          delivery_status: delivery.status,
          delivery_time: ['sent', 'manual_pending', 'failed'].includes(delivery.status) ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
          target_whatsapp: targetWhatsapp || null,
        });
      }
      void notifyOrderSuccessOnce(user.id, invoice, product.name);
      return findTransactionByInvoice(invoice);
    }
  }

  await deductSaldo(user, total, invoice);
  let transaction = null;

  try {
    transaction = await createTransaction({
      invoice,
      ref_id: invoice,
      user_id: user.id,
      product_id: product.id,
      product_name: product.name,
      qty,
      price_base: product.price_base,
      price_sell: pricing.sellPrice,
      total_price: total,
      profit: (pricing.sellPrice - product.price_base) * qty,
      status: 'pending',
      account_data: null,
      accounts: [],
      product_image: product.image || null,
      description: product.note || '',
      channel: payload.channel || 'api',
    });

    let external;
    try {
      external = await premkuOrder({
        product_id: product.premku_id || product.id,
        qty,
        ref_id: invoice,
      });
    } catch (error) {
      const fallbackResponse = {
        message: error instanceof Error ? error.message : 'Premku order request failed',
      };
      await updateTransactionStatus(invoice, 'pending', {
        external_order_response: fallbackResponse,
        external_status_response: fallbackResponse,
      });
      await upsertOrderRecord({
        user_id: user.id,
        role: user.role,
        invoice,
        product_id: product.id,
        product_name: product.name,
        payment_status: 'success',
        provider_invoice: invoice,
        provider_status: 'pending_manual',
        order_status: 'pending_manual',
        fulfillment_type: 'provider_auto',
        target_whatsapp: targetWhatsapp || null,
        delivery_status: 'pending',
        total_price: total,
        raw_response: fallbackResponse,
        processing_started_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      });
      void notifyAdmin('order pending', {
        user: user.username,
        product: product.name,
        status: 'pending_manual',
        invoice,
      });
      return (await findTransactionByInvoice(invoice)) || transaction;
    }

    const nextStatus = mapPremkuStatus(external);
    const accounts = extractAccountData(external);
    void notifyAdmin('order pending', {
      user: user.username,
      product: product.name,
      status: nextStatus,
      invoice,
    });

    if (nextStatus === 'success' && accounts.length) {
      await updateTransactionStatus(invoice, nextStatus, {
        external_order_response: external,
        account_data: accounts.length ? accounts : null,
        processed_at: toMysqlDate(),
      });
      const orderRecord = await upsertOrderRecord({
        user_id: user.id,
        role: user.role,
        invoice,
        product_id: product.id,
        product_name: product.name,
        payment_status: 'success',
        provider_invoice: external?.invoice || external?.data?.invoice || invoice,
        provider_status: nextStatus,
        order_status: 'success',
        fulfillment_type: 'provider_auto',
        target_whatsapp: targetWhatsapp || null,
        delivery_status: accounts.length ? 'pending' : 'manual_pending',
        total_price: total,
        accounts,
        raw_response: external,
        processing_started_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        success_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      });
      if (orderRecord?.delivery_status !== 'sent') {
        const delivery = await sendOrderDelivery(orderRecord);
        await updateOrderDelivery(invoice, {
          delivery_status: delivery.status,
          delivery_time: ['sent', 'manual_pending', 'failed'].includes(delivery.status) ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
          target_whatsapp: targetWhatsapp || null,
        });
      }
      void notifyAdmin('order success', {
        user: user.username,
        product: product.name,
        status: 'SUCCESS',
        invoice,
      });
      void notifyOrderSuccessOnce(user.id, invoice, product.name);
    } else if (requiresManualHandling(nextStatus, accounts)) {
      await updateTransactionStatus(invoice, 'pending', {
        external_order_response: external,
        external_status_response: external,
      });
      await upsertOrderRecord({
        user_id: user.id,
        role: user.role,
        invoice,
        product_id: product.id,
        product_name: product.name,
        payment_status: 'success',
        provider_invoice: external?.invoice || external?.data?.invoice || invoice,
        provider_status: 'pending_manual',
        order_status: 'pending_manual',
        fulfillment_type: 'provider_auto',
        target_whatsapp: targetWhatsapp || null,
        delivery_status: 'pending',
        total_price: total,
        raw_response: external,
        processing_started_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      });
    } else if (['processing', 'pending'].includes(nextStatus)) {
      await updateTransactionStatus(invoice, 'pending', {
        external_order_response: external,
        external_status_response: external,
      });
      await upsertOrderRecord({
        user_id: user.id,
        role: user.role,
        invoice,
        product_id: product.id,
        product_name: product.name,
        payment_status: 'success',
        provider_invoice: external?.invoice || external?.data?.invoice || invoice,
        provider_status: nextStatus,
        order_status: 'waiting_provider',
        fulfillment_type: 'provider_auto',
        target_whatsapp: targetWhatsapp || null,
        delivery_status: 'pending',
        total_price: total,
        raw_response: external,
        processing_started_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      });
    } else {
      await updateTransactionStatus(invoice, 'pending', {
        external_order_response: external,
        external_status_response: external,
      });
      await upsertOrderRecord({
        user_id: user.id,
        role: user.role,
        invoice,
        product_id: product.id,
        product_name: product.name,
        payment_status: 'success',
        provider_invoice: external?.invoice || external?.data?.invoice || invoice,
        provider_status: nextStatus,
        order_status: nextStatus,
        fulfillment_type: 'provider_auto',
        target_whatsapp: targetWhatsapp || null,
        delivery_status: 'pending',
        total_price: total,
        raw_response: external,
        processing_started_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      });
    }
  } catch (error) {
    await addSaldo(user, total, `${invoice}-refund`);
    if (transaction) {
      await updateTransactionStatus(invoice, 'failed', {
        external_order_response: { message: error instanceof Error ? error.message : 'Premku order call failed' },
        refund_at: toMysqlDate(),
      });
    }
  }

  return (await findTransactionByInvoice(invoice)) || transaction;
}

export async function retryOrderByAdmin(invoice) {
  const transaction = await findTransactionByInvoice(invoice);
  if (!transaction) {
    const error = new Error('Invoice tidak ditemukan');
    error.statusCode = 404;
    throw error;
  }

  const order = await findOrderByInvoice(invoice);
  if (!order) {
    const error = new Error('Order tidak ditemukan');
    error.statusCode = 404;
    throw error;
  }

  if (order.retry_count >= 3) {
    const error = new Error('Order sudah mencapai batas retry maksimum');
    error.statusCode = 400;
    throw error;
  }

  if (order.order_status === 'success' || order.order_status === 'cancelled') {
    const error = new Error('Order tidak dapat diretry karena sudah selesai atau dibatalkan');
    error.statusCode = 400;
    throw error;
  }

  const external = await premkuOrder({
    product_id: transaction.product_id || null,
    qty: Number(transaction.qty || 1),
    ref_id: invoice,
  });

  const nextStatus = mapPremkuStatus(external);
  const accounts = extractAccountData(external);
  const isManual = requiresManualHandling(nextStatus, accounts);
  const fallbackStatus = ['processing', 'pending'].includes(nextStatus) ? 'waiting_provider' : 'pending_manual';

  await updateOrderStatusByInvoice(invoice, {
    provider_status: isManual ? 'pending_manual' : nextStatus === 'success' ? 'success' : fallbackStatus,
    order_status: nextStatus === 'success' && accounts.length ? 'success' : fallbackStatus,
    fulfillment_type: 'retry',
    retry_count: order.retry_count + 1,
    raw_response: external,
  });

  if (nextStatus === 'success' && accounts.length) {
    await updateTransactionStatus(invoice, 'success', {
      external_order_response: external,
      account_data: accounts,
      processed_at: toMysqlDate(),
    });

    const orderRecord = await upsertOrderRecord({
      user_id: transaction.user_id,
      role: transaction.role || 'member',
      invoice,
      product_id: transaction.product_id,
      product_name: transaction.product_name,
      payment_status: 'success',
      provider_invoice: external?.invoice || external?.data?.invoice || invoice,
      provider_status: 'success',
      order_status: 'success',
      fulfillment_type: 'retry',
      target_whatsapp: transaction.target_whatsapp || null,
      delivery_status: accounts.length ? 'pending' : 'manual_pending',
      total_price: transaction.total_price,
      accounts,
      raw_response: external,
      success_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });

    if (orderRecord?.delivery_status !== 'sent') {
      const delivery = await sendOrderDelivery(orderRecord);
      await updateOrderDelivery(invoice, {
        delivery_status: delivery.status,
        delivery_time: ['sent', 'manual_pending', 'failed'].includes(delivery.status) ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
        target_whatsapp: orderRecord.target_whatsapp,
      });
    }

    void notifyOrderSuccessOnce(transaction.user_id, invoice, transaction.product_name);
    return orderRecord;
  }

  await updateTransactionStatus(invoice, 'pending', {
    external_order_response: external,
    external_status_response: external,
  });

  return findOrderByInvoice(invoice);
}

export function getOrderStatus(invoice) {
  return refreshOrderStatus(invoice);
}
