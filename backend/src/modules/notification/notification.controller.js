import { listNotificationsForRole } from '../../repositories/notification.repo.js';

export async function myNotifications(req, res) {
  res.json({
    status: true,
    data: await listNotificationsForRole(req.user.role),
  });
}
