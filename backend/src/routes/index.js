import express from 'express';
import { forgotPassword, login, logout, registerMember } from '../modules/auth/auth.controller.js';
import { adminAddManualStock, adminCreateProduct, adminDeleteProduct, adminUpdateProduct, getProducts } from '../modules/product/product.controller.js';
import { myOrders, order, orderStatus, myActiveCart } from '../modules/order/order.controller.js';
import { deposit, depositCancel, depositStatus, myDeposits } from '../modules/deposit/deposit.controller.js';
import { cancelDirectPaymentController, createDirectOrderPaymentController, directPaymentStatusController } from '../modules/payment/payment.controller.js';
import { myWithdraws, withdraw } from '../modules/withdraw/withdraw.controller.js';
import { dashboardSummary, me, saldo, saldoLogs, updateMyPreferences } from '../modules/wallet/wallet.controller.js';
import {
  createAdminUser,
  deleteAdminUser,
  approveWithdraw,
  deposits,
  createAdminNotification,
  deleteAdminNotification,
  getDiscount,
  getMarkup,
  getPremkuKey,
  notifications,
  rejectWithdraw,
  withdraws,
  transactions,
  activityLogs,
  adminSummary,
  premkuFinanceProfile,
  updateDiscount,
  updateAdminUser,
  updateAdminNotification,
  updateMarkup,
  updatePremkuKey,
  botSettings,
  myBotSettings,
  updateBotSettings,
  updateMyBotSettings,
  users,
} from '../modules/admin/admin.controller.js';
import { premkuWebhook } from '../modules/webhook/webhook.controller.js';
import { myNotifications } from '../modules/notification/notification.controller.js';
import {
  botCatalog,
  botOrder,
  botPaymentStatus,
  botProfile,
  botSessionConnect,
  botSessionLogout,
  botSessionStatus,
  botSessionUpdate,
  botSettingsGet,
  botSettingsUpdate,
  botTemplatePreview,
} from '../modules/bot/bot.controller.js';
import { auth } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/admin.middleware.js';

const router = express.Router();

router.post('/login', login);
router.post('/logout', auth, logout);
router.post('/register', registerMember);
router.post('/forgot-password', forgotPassword);
router.get('/config/public', (_req, res) => {
  res.json({
    status: true,
    data: {
      admin_whatsapp: process.env.ADMIN_WHATSAPP || process.env.ADMIN || '',
    },
  });
});
router.post('/callback/premku', premkuWebhook);

router.get('/me', auth, me);
router.patch('/me/preferences', auth, updateMyPreferences);
router.get('/dashboard/summary', auth, dashboardSummary);
router.get('/products', auth, getProducts);
router.post('/order', auth, order);
router.get('/order/:invoice', auth, orderStatus);
router.get('/orders/:invoice', auth, orderStatus);
router.get('/transactions', auth, myOrders);
router.get('/orders', auth, myOrders);
router.get('/cart/active', auth, myActiveCart);
router.post('/payments/direct-order', auth, createDirectOrderPaymentController);
router.get('/payments/:invoice/status', auth, directPaymentStatusController);
router.post('/payments/cancel', auth, cancelDirectPaymentController);
router.post('/payments/:invoice/cancel', auth, cancelDirectPaymentController);
router.post('/deposit', auth, deposit);
router.post('/deposit/cancel', auth, depositCancel);
router.post('/deposit/:invoice/cancel', auth, depositCancel);
router.get('/deposits', auth, myDeposits);
router.get('/deposit/:invoice', auth, depositStatus);
router.post('/withdraw', auth, withdraw);
router.get('/withdraws', auth, myWithdraws);
router.get('/saldo', auth, saldo);
router.get('/saldo-logs', auth, saldoLogs);
router.get('/saldo/logs', auth, saldoLogs);
router.get('/notifications', auth, myNotifications);
router.get('/bot-settings', auth, myBotSettings);
router.patch('/bot-settings', auth, updateMyBotSettings);
router.get('/bot/profile', auth, botProfile);
router.get('/bot/catalog', auth, botCatalog);
router.post('/bot/order', auth, botOrder);
router.get('/bot/payments/:invoice/status', auth, botPaymentStatus);
router.get('/bot/session/status', auth, botSessionStatus);
router.post('/bot/session/connect', auth, botSessionConnect);
router.post('/bot/session/status', auth, botSessionUpdate);
router.post('/bot/session/logout', auth, botSessionLogout);
router.get('/bot/settings', auth, botSettingsGet);
router.patch('/bot/settings', auth, botSettingsUpdate);
router.post('/bot/template/preview', auth, botTemplatePreview);

router.get('/admin/users', auth, adminOnly, users);
router.get('/admin/summary', auth, adminOnly, adminSummary);
router.get('/admin/premku-profile', auth, adminOnly, premkuFinanceProfile);
router.post('/admin/create-user', auth, adminOnly, createAdminUser);
router.patch('/admin/update-user/:id', auth, adminOnly, updateAdminUser);
router.delete('/admin/delete-user/:id', auth, adminOnly, deleteAdminUser);
router.get('/admin/transactions', auth, adminOnly, transactions);
router.get('/admin/activity-logs', auth, adminOnly, activityLogs);
router.post('/admin/products', auth, adminOnly, adminCreateProduct);
router.patch('/admin/products/:id', auth, adminOnly, adminUpdateProduct);
router.post('/admin/products/:id/stock', auth, adminOnly, adminAddManualStock);
router.delete('/admin/products/:id', auth, adminOnly, adminDeleteProduct);
router.get('/users', auth, adminOnly, users);
router.get('/transactions/all', auth, adminOnly, transactions);
router.get('/admin/deposits', auth, adminOnly, deposits);
router.get('/admin/withdraws', auth, adminOnly, withdraws);
router.patch('/admin/withdraws/:id/approve', auth, adminOnly, approveWithdraw);
router.patch('/admin/withdraws/:id/reject', auth, adminOnly, rejectWithdraw);
router.get('/admin/markup', auth, adminOnly, getMarkup);
router.patch('/admin/markup', auth, adminOnly, updateMarkup);
router.get('/admin/discount', auth, adminOnly, getDiscount);
router.patch('/admin/discount', auth, adminOnly, updateDiscount);
router.get('/admin/notifications', auth, adminOnly, notifications);
router.post('/admin/notifications', auth, adminOnly, createAdminNotification);
router.patch('/admin/notifications/:id', auth, adminOnly, updateAdminNotification);
router.delete('/admin/notifications/:id', auth, adminOnly, deleteAdminNotification);
router.get('/admin/premku-key', auth, adminOnly, getPremkuKey);
router.patch('/admin/premku-key', auth, adminOnly, updatePremkuKey);
router.get('/admin/settings', auth, adminOnly, getPremkuKey);
router.patch('/admin/settings', auth, adminOnly, updatePremkuKey);
router.get('/admin/bot-settings', auth, adminOnly, botSettings);
router.patch('/admin/bot-settings', auth, adminOnly, updateBotSettings);

router.get('/docs', (_req, res) => {
  res.json({
    status: true,
    docs: [
      'POST /api/login',
      'POST /api/register',
      'POST /api/forgot-password',
      'GET /api/me',
      'GET /api/dashboard/summary',
      'GET /api/products',
      'POST /api/order',
      'GET /api/order/:invoice',
      'GET /api/transactions',
      'GET /api/orders',
      'POST /api/payments/direct-order',
      'GET /api/payments/:invoice/status',
      'POST /api/payments/cancel',
      'POST /api/deposit',
      'POST /api/deposit/cancel',
      'GET /api/deposits',
      'GET /api/deposit/:invoice',
      'POST /api/withdraw',
      'GET /api/withdraws',
      'GET /api/saldo',
      'GET /api/saldo-logs',
      'GET /api/saldo/logs',
      'GET /api/notifications',
      'GET /api/bot/profile',
      'GET /api/bot/catalog',
      'POST /api/bot/order',
      'GET /api/bot/payments/:invoice/status',
      'POST /api/bot/template/preview',
      'POST /api/bot/session/connect',
      'GET /api/bot/session/status',
      'POST /api/bot/session/logout',
      'GET /api/admin/summary',
      'GET /api/admin/users',
      'GET /api/admin/transactions',
      'GET /api/admin/activity-logs',
      'GET /api/admin/deposits',
      'GET /api/admin/withdraws',
      'PATCH /api/admin/withdraws/:id/approve',
      'PATCH /api/admin/withdraws/:id/reject',
      'GET /api/admin/markup',
      'PATCH /api/admin/markup',
      'GET /api/admin/notifications',
      'POST /api/admin/notifications',
      'PATCH /api/admin/notifications/:id',
      'DELETE /api/admin/notifications/:id',
      'GET /api/admin/premku-key',
      'PATCH /api/admin/premku-key',
      'GET /api/admin/bot-settings',
      'PATCH /api/admin/bot-settings',
      'POST /api/callback/premku',
    ],
  });
});

export default router;
