import { findProductById } from '../../repositories/product.repo.js';
import { findOrderByInvoice } from '../../repositories/order.repo.js';
import { findTransactionByInvoice } from '../../repositories/transaction.repo.js';
import { cancelDirectPayment, createBotOrderPayment, refreshDirectPaymentStatus } from '../payment/payment.service.js';
import { createOrder, getOrderStatus } from '../order/order.service.js';
import { getBotCatalog } from '../bot/bot.controller.js';
import { getUsableBalance } from '../../services/wallet.service.js';
import { getUserById } from '../../repositories/user.repo.js';

function requireValue(value, message) {
  if (value === undefined || value === null || value === '') {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function publicPayment(payment = {}) {
  return {
    invoice: payment.invoice,
    ref_id: payment.client_ref_id || null,
    product_id: payment.product_id,
    amount: Number(payment.sell_price || payment.amount || 0),
    total_bayar: Number(payment.total_bayar || payment.amount || 0),
    qr_image: payment.qr_image || null,
    qr_raw: payment.qr_raw || null,
    status: payment.status,
    expired_at: payment.expired_at || null,
  };
}

export async function profile(req, res) {
  const user = req.user;
  return res.json({
    success: true,
    data: {
      username: user.username,
      role: user.role,
      saldo: Number(user.saldo || 0),
      usable_balance: getUsableBalance(user),
      locked_balance: Number(user.locked_balance || 0),
      whatsapp: user.phone || '',
      registered_at: user.created_at,
    },
  });
}

export async function products(req, res, next) {
  try {
    const rows = await getBotCatalog(req.user);
    return res.json({
      success: true,
      products: rows.map((item) => ({
        id: item.product_id,
        code: item.product_code,
        name: item.product_name,
        description: item.note,
        price: item.base_admin_price,
        sell_price: item.sell_price,
        status: item.status,
        stock: item.stock,
        image: item.image || '',
        product_source: item.product_source,
      })),
    });
  } catch (error) {
    return next(error);
  }
}

export async function stock(req, res, next) {
  try {
    const productId = Number(requireValue(req.body?.product_id, 'product_id wajib diisi.'));
    const rows = await getBotCatalog(req.user);
    const item = rows.find((product) => Number(product.product_id) === productId);
    if (!item) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
    return res.json({
      success: true,
      product: item.product_name,
      stock: item.stock,
      manual_stock: item.manual_stock,
      provider_stock: item.provider_stock,
      status: item.status,
    });
  } catch (error) {
    return next(error);
  }
}

export async function pay(req, res, next) {
  try {
    const productId = Number(requireValue(req.body?.product_id, 'product_id wajib diisi.'));
    const payment = await createBotOrderPayment(req.user, {
      product_id: productId,
      qty: Number(req.body?.qty || 1),
      amount: Number(requireValue(req.body?.amount, 'amount wajib diisi.')),
      ref_id: req.body?.ref_id,
      buyer_name: req.body?.buyer_name,
      buyer_whatsapp: req.body?.buyer_whatsapp,
    });
    const product = await findProductById(payment.product_id);
    return res.status(201).json({
      success: true,
      message: 'Payment created successfully.',
      data: {
        ...publicPayment(payment),
        product: product?.name || '',
      },
    });
  } catch (error) {
    return next(error);
  }
}

export async function payStatus(req, res, next) {
  try {
    const invoice = requireValue(req.body?.invoice, 'invoice wajib diisi.');
    const payment = await refreshDirectPaymentStatus(invoice, req.user);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment tidak ditemukan.' });
    const product = await findProductById(payment.product_id);
    return res.json({
      success: true,
      data: {
        ...publicPayment(payment),
        product: product?.name || payment.order?.product_name || '',
        order_status: payment.order?.order_status || null,
        base_price: Number(payment.modal_price || 0),
        user_profit: Number(payment.reseller_profit || 0),
      },
    });
  } catch (error) {
    return next(error);
  }
}

export async function cancelPay(req, res, next) {
  try {
    const invoice = requireValue(req.body?.invoice, 'invoice wajib diisi.');
    const before = await refreshDirectPaymentStatus(invoice, req.user);
    const payment = await cancelDirectPayment(invoice, req.user);
    return res.json({
      success: true,
      message: 'Payment berhasil dibatalkan.',
      data: {
        invoice: payment.invoice,
        status_old: before?.status || 'pending_payment',
        status_new: payment.status,
      },
    });
  } catch (error) {
    return next(error);
  }
}

export async function order(req, res, next) {
  try {
    const before = getUsableBalance(req.user);
    const data = await createOrder(req.user, {
      product_id: Number(requireValue(req.body?.product_id, 'product_id wajib diisi.')),
      qty: Number(req.body?.qty || 1),
      ref_id: req.body?.ref_id,
      channel: 'public-api-v1',
    });
    const currentUser = await getUserById(req.user.id);
    return res.json({
      success: true,
      message: 'Order diterima dan masuk antrian proses.',
      invoice: data.invoice,
      ref_id: data.ref_id || req.body?.ref_id || null,
      product: data.product_name,
      qty: Number(data.qty || 1),
      price: Number(data.price_sell || 0),
      total: Number(data.total_price || 0),
      balance_before: before,
      balance_after: currentUser ? getUsableBalance(currentUser) : before,
      status: data.status,
    });
  } catch (error) {
    return next(error);
  }
}

export async function status(req, res, next) {
  try {
    const invoice = String(requireValue(req.body?.invoice, 'invoice wajib diisi.'));
    const existingOrder = await findOrderByInvoice(invoice);
    const transaction = existingOrder ? null : await findTransactionByInvoice(invoice);
    const ownerId = existingOrder?.user_id ?? transaction?.user_id;
    if (!ownerId) return res.status(404).json({ success: false, message: 'Invoice tidak ditemukan.' });
    if (req.user.role !== 'admin' && Number(ownerId) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Invoice bukan milik akun ini.' });
    }
    const data = await getOrderStatus(invoice);
    const accounts = data?.accounts?.length
      ? data.accounts
      : data?.account_data ? [data.account_data] : [];
    return res.json({
      success: true,
      invoice,
      status: data?.order_status || data?.status || 'pending',
      product: data?.product_name || '',
      accounts,
    });
  } catch (error) {
    return next(error);
  }
}
