import { cancelDirectPayment, createDirectOrderPayment, refreshDirectPaymentStatus } from './payment.service.js';
import { requireFields } from '../../utils/validator.js';

export async function createDirectOrderPaymentController(req, res, next) {
  try {
    requireFields(req.body, ['product_id']);
    const data = await createDirectOrderPayment(req.user, req.body);
    res.status(201).json({ status: true, data });
  } catch (error) {
    next(error);
  }
}

export async function directPaymentStatusController(req, res, next) {
  try {
    const data = await refreshDirectPaymentStatus(req.params.invoice, req.user);
    if (!data) {
      return res.status(404).json({ status: false, message: 'Payment tidak ditemukan' });
    }
    return res.json({ status: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function cancelDirectPaymentController(req, res, next) {
  try {
    requireFields(req.body, ['invoice']);
    const data = await cancelDirectPayment(req.body.invoice, req.user);
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}
