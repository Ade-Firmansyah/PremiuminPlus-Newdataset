import { cancelDeposit, createDeposit, refreshDepositStatus } from './deposit.service.js';
import { requireFields } from '../../utils/validator.js';
import { findDepositByInvoice, listDepositsByUser } from '../../repositories/deposit.repo.js';

export async function deposit(req, res, next) {
  try {
    requireFields(req.body, ['amount']);
    const data = await createDeposit(req.user, req.body.amount);
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}

export async function myDeposits(req, res) {
  const data = await listDepositsByUser(req.user.id);
  res.json({ status: true, data });
}

export async function depositStatus(req, res, next) {
  try {
    const existing = await findDepositByInvoice(req.params.invoice);
    if (!existing) {
      return res.status(404).json({ status: false, message: 'Invoice tidak ditemukan' });
    }

    if (req.user.role !== 'admin' && existing.user_id !== req.user.id) {
      return res.status(403).json({ status: false, message: 'Invoice bukan milik akun ini' });
    }

    const data = await refreshDepositStatus(req.params.invoice);
    if (!data) {
      return res.status(404).json({ status: false, message: 'Invoice tidak ditemukan' });
    }

    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}

export async function depositCancel(req, res, next) {
  try {
    requireFields(req.body, ['invoice']);
    const data = await cancelDeposit(req.body.invoice, req.user);
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}
