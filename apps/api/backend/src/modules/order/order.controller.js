import { createOrder, getOrderStatus } from './order.service.js';
import { requireFields } from '../../utils/validator.js';
import { listOrdersByUser, findOrderByInvoice } from '../../repositories/order.repo.js';
import { listOrderTransactionsByUser, findTransactionByInvoice } from '../../repositories/transaction.repo.js';

function canExposeCredential(order = {}) {
  const orderStatus = String(order.order_status || order.status || '').toLowerCase();
  const deliveryStatus = String(order.delivery_status || '').toLowerCase();
  return ['success', 'provider_success', 'credential_delivery'].includes(orderStatus) || deliveryStatus === 'sent';
}

function maskPendingCredential(order) {
  if (!order || canExposeCredential(order)) return order;
  return {
    ...order,
    email_account: null,
    password_account: null,
    manual_email: null,
    manual_password: null,
    account_data: null,
    accounts: null,
  };
}

export async function order(req, res, next) {
  try {
    requireFields(req.body, ['product_id']);
    const data = await createOrder(req.user, req.body);
    res.json({ status: true, success: true, data: maskPendingCredential(data) });
  } catch (error) {
    next(error);
  }
}

export async function orderStatus(req, res) {
  try {
    const existingOrder = await findOrderByInvoice(req.params.invoice);
    if (!existingOrder) {
      const existingTransaction = await findTransactionByInvoice(req.params.invoice);
      if (!existingTransaction) {
        return res.status(404).json({ status: false, message: 'Invoice tidak ditemukan' });
      }
      if (req.user.role !== 'admin' && existingTransaction.user_id !== req.user.id) {
        return res.status(403).json({ status: false, message: 'Invoice bukan milik akun ini' });
      }
      const data = await getOrderStatus(req.params.invoice);
      return res.json({ status: true, success: true, data: req.user.role === 'admin' ? data : maskPendingCredential(data) });
    }

    if (req.user.role !== 'admin' && existingOrder.user_id !== req.user.id) {
      return res.status(403).json({ status: false, message: 'Invoice bukan milik akun ini' });
    }

    const data = await getOrderStatus(req.params.invoice);
    if (!data) {
      return res.status(404).json({ status: false, message: 'Invoice tidak ditemukan' });
    }

    return res.json({ status: true, success: true, data: req.user.role === 'admin' ? data : maskPendingCredential(data) });
  } catch (error) {
    return res.status(error.statusCode || 502).json({
      status: false,
      message: error.message || 'Gagal sinkron status order',
    });
  }
}

export async function myOrders(req, res) {
  const data = await listOrdersByUser(req.user.id);
  res.json({ status: true, success: true, data: data.map(maskPendingCredential) });
}
