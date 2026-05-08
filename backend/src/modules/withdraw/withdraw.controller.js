import { requestWithdraw } from './withdraw.service.js';
import { requireFields } from '../../utils/validator.js';

export async function withdraw(req, res, next) {
  try {
    requireFields(req.body, ['amount', 'bank_account', 'account_number']);
    const data = await requestWithdraw(req.user, req.body);
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}
