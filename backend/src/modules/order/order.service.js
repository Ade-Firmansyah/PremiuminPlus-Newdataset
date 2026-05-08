import { findProductById } from '../../repositories/product.repo.js';
import { getUserById } from '../../repositories/user.repo.js';
import { getMarkupSetting } from '../../repositories/settings.repo.js';
import { createTransaction, findTransactionByInvoice, refundTransaction, updateTransactionStatus } from '../../repositories/transaction.repo.js';
import { updateOrderDelivery, updateOrderProviderStatus, upsertOrderRecord } from '../../repositories/order.repo.js';
import { calculateRoleSellPrice } from '../../services/pricing.service.js';
import { premkuOrder, premkuStatus } from '../../services/premku.service.js';
import { addSaldo, deductSaldo } from '../../services/wallet.service.js';
import { sendOrderDelivery, validateWhatsapp } from '../../services/delivery.service.js';
import { notifyAdmin } from '../../services/notification.service.js';
import { createInvoice } from '../../utils/invoice.js';

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
    if (['qris-direct', 'bot-qris'].includes(transaction.channel)) {
      await updateOrderProviderStatus(invoice, {
        provider_status: 'failed',
        order_status: 'failed',
        raw_response: statusResponse,
      });
      return updateTransactionStatus(invoice, 'failed', {
        external_status_response: statusResponse,
        refund_at: new Date().toISOString(),
      });
    }
    return refundTransaction(invoice, statusResponse, 'premku-status-failed');
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
      provider_invoice: externalInvoice,
      provider_status: 'success',
      order_status: 'success',
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
  } else if (['processing', 'pending'].includes(nextStatus)) {
    await updateOrderProviderStatus(invoice, {
      provider_status: nextStatus,
      order_status: nextStatus,
      raw_response: statusResponse,
    });
  }

  return updateTransactionStatus(invoice, nextStatus, extra);
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

  const setting = await getMarkupSetting();
  const pricing = calculateRoleSellPrice(product, setting, user);
  const total = pricing.sellPrice * qty;
  const invoice = createInvoice('ORD');
  const targetWhatsapp = validateWhatsapp(user.phone || '');

  if (Number(user.saldo || 0) < total) {
    const error = new Error(user.role === 'reseller' ? 'Saldo reseller tidak cukup.' : 'Saldo tidak cukup. QRIS langsung tersedia untuk member.');
    error.statusCode = 402;
    error.code = user.role === 'member' ? 'MEMBER_DIRECT_QRIS_AVAILABLE' : 'INSUFFICIENT_RESELLER_BALANCE';
    throw error;
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

    const external = await premkuOrder({
      product_id: product.premku_id || product.id,
      qty,
      ref_id: invoice,
    });

    const nextStatus = mapPremkuStatus(external);
    void notifyAdmin('order pending', {
      user: user.username,
      product: product.name,
      status: nextStatus,
      invoice,
    });
    if (nextStatus === 'failed') {
      await refundTransaction(invoice, external, 'premku-order-failed');
    } else {
      const accounts = extractAccountData(external);
      await updateTransactionStatus(invoice, nextStatus, {
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
        provider_invoice: external?.invoice || external?.data?.invoice || invoice,
        provider_status: nextStatus,
        order_status: nextStatus,
        target_whatsapp: targetWhatsapp || null,
        delivery_status: nextStatus === 'success' ? (accounts.length ? 'pending' : 'manual_pending') : 'pending',
        total_price: total,
        accounts,
        raw_response: external,
        processing_started_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        success_at: nextStatus === 'success' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
      });
      if (nextStatus === 'success' && accounts.length && orderRecord?.delivery_status !== 'sent') {
        const delivery = await sendOrderDelivery(orderRecord);
        await updateOrderDelivery(invoice, {
          delivery_status: delivery.status,
          delivery_time: ['sent', 'manual_pending', 'failed'].includes(delivery.status) ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
          target_whatsapp: targetWhatsapp || null,
        });
      }
      if (nextStatus === 'success') {
        void notifyAdmin('order success', {
          user: user.username,
          product: product.name,
          status: 'SUCCESS',
          invoice,
        });
      }
    }
  } catch (error) {
    await addSaldo(user, total, `${invoice}-refund`);
    if (transaction) {
      await updateTransactionStatus(invoice, 'failed', {
        external_order_response: { message: error instanceof Error ? error.message : 'Premku order call failed' },
        refund_at: new Date().toISOString(),
      });
    }
  }

  return (await findTransactionByInvoice(invoice)) || transaction;
}

export function getOrderStatus(invoice) {
  return refreshOrderStatus(invoice);
}
