import { requestWithdraw } from './withdraw.service.js';
import { listWithdrawsByUser } from '../../repositories/withdraw.repo.js';
import { createNotification } from '../../repositories/notification.repo.js';
import { clearCache } from '../../services/cache.service.js';
import { publishRealtimeEvent, publishUserRefresh } from '../../services/realtime.service.js';
import { requireFields } from '../../utils/validator.js';

export async function withdraw(req, res, next) {
  try {
    requireFields(req.body, ['amount', 'account_number', 'account_name']);
    const data = await requestWithdraw(req.user, req.body);
    clearCache();
    publishUserRefresh(req.user.id, 'withdraw.updated', { scope: 'withdraw', entity: 'withdraw', id: data.id });
    publishRealtimeEvent({ type: 'dashboard.updated', scope: 'admin', entity: 'withdraw', id: data.id, admin: true });
    try {
      await createNotification({
        title: 'Penarikan saldo baru',
        message: `${req.user.username || `User #${req.user.id}`} mengajukan tarik saldo Rp${Number(data.amount || 0).toLocaleString('id-ID')} ke ${data.withdraw_method || data.bank_account}.`,
        type: 'withdraw',
        target_role: 'admin',
        is_active: true,
      });
    } catch {
      // Notification is best-effort; the withdraw ticket must remain created.
    }
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}

export async function myWithdraws(req, res, next) {
  try {
    res.json({ status: true, data: await listWithdrawsByUser(req.user.id) });
  } catch (error) {
    next(error);
  }
}
