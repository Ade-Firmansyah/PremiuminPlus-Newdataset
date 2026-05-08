import { createOrder, getOrderStatus } from './order.service.js';
import { requireFields } from '../../utils/validator.js';
import { listOrderTransactionsByUser } from '../../repositories/transaction.repo.js';
import { findTransactionByInvoice } from '../../repositories/transaction.repo.js';

export async function order(req, res, next) {
  try {
    requireFields(req.body, ['product_id']);
    const data = await createOrder(req.user, req.body);
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}

export async function orderStatus(req, res) {
  try {
    const existing = await findTransactionByInvoice(req.params.invoice);
    if (!existing) {
      return res.status(404).json({
        status: false,
        message: 'Invoice tidak ditemukan',
      });
    }

    if (req.user.role !== 'admin' && existing.user_id !== req.user.id) {
      return res.status(403).json({
        status: false,
        message: 'Invoice bukan milik akun ini',
      });
    }

    const data = await getOrderStatus(req.params.invoice);
    if (!data) {
      return res.status(404).json({
        status: false,
        message: 'Invoice tidak ditemukan',
      });
    }

    return res.json({ status: true, data });
  } catch (error) {
    return res.status(error.statusCode || 502).json({
      status: false,
      message: error.message || 'Gagal sinkron status order',
    });
  }
}

export async function myOrders(req, res) {
  const data = await listOrderTransactionsByUser(req.user.id);
  res.json({ status: true, data });
}
