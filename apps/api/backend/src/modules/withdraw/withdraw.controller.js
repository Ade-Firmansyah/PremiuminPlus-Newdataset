import { requestWithdraw } from './withdraw.service.js';
import { listWithdrawsByUser } from '../../repositories/withdraw.repo.js';
import { requireFields } from '../../utils/validator.js';

export async function withdraw(req, res, next) {
  try {
    requireFields(req.body, ['amount', 'bank_account', 'account_number', 'account_name']);
    const data = await requestWithdraw(req.user, req.body);
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}

export async function myWithdraws(req, res, next) {
  try {
    const data = await listWithdrawsByUser(req.user.id);
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}
