import express from 'express';
import { forgotPassword, login, registerMember } from '../modules/auth/auth.controller.js';
import {
  adminAddProductStockItem,
  adminCreateHybridProduct,
  adminCreateManualProduct,
  adminCreateProduct,
  adminDeleteProduct,
  adminDeleteProductStockItemById,
  adminDeleteProductStockItem,
  adminDisableProductStockItem,
  adminListProducts,
  adminListProductStockItems,
  adminSyncProviderProducts,
  adminUpdateProduct,
  adminUpdateProductStockItemById,
  adminUpdateProductStockItem,
  getProducts,
} from '../modules/product/product.controller.js';
import { myOrders, order, orderStatus } from '../modules/order/order.controller.js';
import { botActivationDeposit, deposit, depositCancel, depositStatus, myDeposits } from '../modules/deposit/deposit.controller.js';
import { cancelDirectPaymentController, createDirectOrderPaymentController, directPaymentStatusController } from '../modules/payment/payment.controller.js';
import { myWithdraws, withdraw } from '../modules/withdraw/withdraw.controller.js';
import { adminResellerRequests, approveResellerRequest, rejectResellerRequest, requestResellerUpgrade, resellerRequestStatus } from '../modules/reseller/reseller.controller.js';
import { dashboardSummary, me, myApiKey, regenerateMyApiKey, saldo, saldoLogs, topAccounts, updateMyPreferences } from '../modules/wallet/wallet.controller.js';
import {
  createAdminUser,
  deleteAdminUser,
  approveWithdraw,
  balanceMutations,
  balanceMutationsCsv,
  deposits,
  createAdminNotification,
  deleteAdminNotification,
  getDiscount,
  getMarkup,
  getPremkuKey,
  notifications,
  pendingOrders,
  rejectWithdraw,
  regenerateAdminUserApiKey,
  retryOrder,
  sendManualOrder,
  completeOrder,
  cancelRefundOrder,
  withdraws,
  transactions,
  adminSummary,
  premkuFinanceProfile,
  updateDiscount,
  updateAdminUser,
  updateAdminUserPassword,
  updateAdminUserRole,
  updateAdminUserStatus,
  updateAdminNotification,
  updateMarkup,
  updatePremkuKey,
  botSettings,
  communitySettings,
  myBotSettings,
  updateBotSettings,
  updateCommunitySettings,
  updateMyBotSettings,
  users,
} from '../modules/admin/admin.controller.js';
import { premkuWebhook } from '../modules/webhook/webhook.controller.js';
import {
  confirmRestoreJob,
  downloadSystemBackup,
  getAdminMaintenance,
  getRestoreJobStatus,
  getSystemStatus,
  patchAdminMaintenance,
  restoreSystemBackup,
  uploadRestoreBackup,
} from '../modules/system/system.controller.js';
import { myNotifications } from '../modules/notification/notification.controller.js';
import {
  botCatalog,
  botCreateOrder,
  botCreatePayment,
  botPaymentCancel,
  botPaymentStatus,
  botProfile,
  botSessionConnect,
  botSessionLogout,
  botSessionStatus,
} from '../modules/bot/bot.controller.js';
import { auth, resellerOnly } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/admin.middleware.js';
import { blockPublicMutationDuringMaintenance, maintenanceGuard } from '../middlewares/maintenance.middleware.js';
import { getSetting } from '../repositories/settings.repo.js';
import { query } from '../config/db.js';
import { remember } from '../services/cache.service.js';

const router = express.Router();
const PUBLIC_USER_BASE = 1368;
const PUBLIC_USER_GROWTH_PER_REGISTER = 3;

async function getPublicStats() {
  return remember('public:stats', 60, async () => {
    const [userRows] = await query('SELECT COUNT(*) AS total_users FROM users');
    const [transactionRows] = await query('SELECT COUNT(*) AS total_transactions FROM transactions');
    const [productRows] = await query(
      `SELECT COUNT(*) AS active_products
       FROM products
       WHERE status IN ('active', 'Aktif', 'ready')`,
    );
    const registeredUsers = Number(userRows?.total_users || 0);

    return {
      registered_users: registeredUsers,
      displayed_users: PUBLIC_USER_BASE + registeredUsers * PUBLIC_USER_GROWTH_PER_REGISTER,
      user_base: PUBLIC_USER_BASE,
      user_growth_per_register: PUBLIC_USER_GROWTH_PER_REGISTER,
      total_transactions: Number(transactionRows?.total_transactions || 0),
      active_products: Number(productRows?.active_products || 0),
      uptime_percent: 99.9,
    };
  });
}

router.post('/login', login);
router.post('/register', blockPublicMutationDuringMaintenance, registerMember);
router.post('/forgot-password', blockPublicMutationDuringMaintenance, forgotPassword);
router.get('/system/status', getSystemStatus);
router.get('/config/public', async (_req, res) => {
  const supportWhatsapp = await getSetting('support_whatsapp', process.env.SUPPORT_WHATSAPP || process.env.ADMIN_PHONE || process.env.ADMIN_WHATSAPP || '+6285888009931');
  const publicStats = await getPublicStats();
  res.json({
    status: true,
    data: {
      admin_whatsapp: supportWhatsapp,
      support_whatsapp: supportWhatsapp,
      stats: publicStats,
    },
  });
});
router.post('/callback/premku', blockPublicMutationDuringMaintenance, premkuWebhook);

router.use(maintenanceGuard);

router.get('/me', auth, me);
router.patch('/me/preferences', auth, updateMyPreferences);
router.get('/me/apikey', auth, myApiKey);
router.post('/me/apikey/regenerate', auth, regenerateMyApiKey);
router.get('/dashboard/summary', auth, dashboardSummary);
router.get('/leaderboard/accounts', auth, topAccounts);
router.get('/products', auth, getProducts);
router.post('/order', auth, order);
router.get('/order/:invoice', auth, orderStatus);
router.get('/transactions', auth, myOrders);
router.get('/orders', auth, myOrders);
router.post('/payments/direct-order', auth, createDirectOrderPaymentController);
router.get('/payments/:invoice/status', auth, directPaymentStatusController);
router.post('/payments/cancel', auth, cancelDirectPaymentController);
router.post('/deposit', auth, deposit);
router.post('/bot/activation/deposit', auth, resellerOnly, botActivationDeposit);
router.post('/deposit/cancel', auth, depositCancel);
router.get('/deposits', auth, myDeposits);
router.get('/deposit/:invoice', auth, depositStatus);
router.post('/withdraw', auth, withdraw);
router.get('/withdraws', auth, myWithdraws);
router.get('/saldo', auth, saldo);
router.get('/saldo-logs', auth, saldoLogs);
router.get('/saldo/logs', auth, saldoLogs);
router.get('/notifications', auth, myNotifications);
router.get('/reseller/request/status', auth, resellerRequestStatus);
router.post('/reseller/request', auth, requestResellerUpgrade);
router.get('/community/settings', auth, communitySettings);
router.get('/bot-settings', auth, resellerOnly, myBotSettings);
router.patch('/bot-settings', auth, resellerOnly, updateMyBotSettings);
router.get('/bot/profile', auth, resellerOnly, botProfile);
router.get('/bot/catalog', auth, resellerOnly, botCatalog);
router.post('/bot/order', auth, resellerOnly, botCreateOrder);
router.post('/bot/payments', auth, resellerOnly, botCreatePayment);
router.get('/bot/payments/:invoice/status', auth, resellerOnly, botPaymentStatus);
router.post('/bot/payments/:invoice/cancel', auth, resellerOnly, botPaymentCancel);
router.post('/bot/session/connect', auth, resellerOnly, botSessionConnect);
router.get('/bot/session/status', auth, resellerOnly, botSessionStatus);
router.post('/bot/session/logout', auth, resellerOnly, botSessionLogout);

router.get('/admin/users', auth, adminOnly, users);
router.get('/admin/summary', auth, adminOnly, adminSummary);
router.get('/admin/pending-orders', auth, adminOnly, pendingOrders);
router.post('/admin/orders/:invoice/manual-complete', auth, adminOnly, completeOrder);
router.post('/admin/orders/:invoice/manual-send', auth, adminOnly, sendManualOrder);
router.post('/admin/orders/:invoice/manual-fulfill', auth, adminOnly, sendManualOrder);
router.post('/admin/orders/:invoice/cancel-refund', auth, adminOnly, cancelRefundOrder);
router.post('/admin/orders/:invoice/cancel', auth, adminOnly, cancelRefundOrder);
router.post('/admin/orders/:invoice/retry', auth, adminOnly, retryOrder);
router.get('/admin/premku-profile', auth, adminOnly, premkuFinanceProfile);
router.post('/admin/create-user', auth, adminOnly, createAdminUser);
router.patch('/admin/update-user/:id', auth, adminOnly, updateAdminUser);
router.patch('/admin/users/:id', auth, adminOnly, updateAdminUser);
router.post('/admin/users/:id/regenerate-api-key', auth, adminOnly, regenerateAdminUserApiKey);
router.patch('/admin/users/:id/status', auth, adminOnly, updateAdminUserStatus);
router.patch('/admin/users/:id/role', auth, adminOnly, updateAdminUserRole);
router.patch('/admin/users/:id/password', auth, adminOnly, updateAdminUserPassword);
router.delete('/admin/delete-user/:id', auth, adminOnly, deleteAdminUser);
router.get('/admin/transactions', auth, adminOnly, transactions);
router.post('/admin/products/sync-provider', auth, adminOnly, adminSyncProviderProducts);
router.get('/admin/products', auth, adminOnly, adminListProducts);
router.post('/admin/products/manual', auth, adminOnly, adminCreateManualProduct);
router.post('/admin/products/hybrid', auth, adminOnly, adminCreateHybridProduct);
router.post('/admin/products', auth, adminOnly, adminCreateProduct);
router.patch('/admin/product-stock-items/:itemId/disable', auth, adminOnly, adminDisableProductStockItem);
router.patch('/admin/product-stock-items/:itemId', auth, adminOnly, adminUpdateProductStockItemById);
router.delete('/admin/product-stock-items/:itemId', auth, adminOnly, adminDeleteProductStockItemById);
router.get('/admin/products/:id/stock-items', auth, adminOnly, adminListProductStockItems);
router.post('/admin/products/:id/stock-items', auth, adminOnly, adminAddProductStockItem);
router.patch('/admin/products/:id/stock-items/:itemId', auth, adminOnly, adminUpdateProductStockItem);
router.delete('/admin/products/:id/stock-items/:itemId', auth, adminOnly, adminDeleteProductStockItem);
router.patch('/admin/products/:id', auth, adminOnly, adminUpdateProduct);
router.delete('/admin/products/:id', auth, adminOnly, adminDeleteProduct);
router.get('/users', auth, adminOnly, users);
router.get('/transactions/all', auth, adminOnly, transactions);
router.get('/admin/deposits', auth, adminOnly, deposits);
router.get('/admin/withdraws', auth, adminOnly, withdraws);
router.get('/admin/reseller-requests', auth, adminOnly, adminResellerRequests);
router.post('/admin/reseller-requests/:id/approve', auth, adminOnly, approveResellerRequest);
router.post('/admin/reseller-requests/:id/reject', auth, adminOnly, rejectResellerRequest);
router.get('/admin/finance/balance-mutations', auth, adminOnly, balanceMutations);
router.get('/admin/finance/balance-mutations.csv', auth, adminOnly, balanceMutationsCsv);
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
router.get('/admin/community-settings', auth, adminOnly, communitySettings);
router.patch('/admin/community-settings', auth, adminOnly, updateCommunitySettings);
router.get('/admin/premku-key', auth, adminOnly, getPremkuKey);
router.patch('/admin/premku-key', auth, adminOnly, updatePremkuKey);
router.get('/admin/settings', auth, adminOnly, getPremkuKey);
router.patch('/admin/settings', auth, adminOnly, updatePremkuKey);
router.get('/admin/bot-settings', auth, adminOnly, botSettings);
router.patch('/admin/bot-settings', auth, adminOnly, updateBotSettings);
router.get('/admin/maintenance', auth, adminOnly, getAdminMaintenance);
router.patch('/admin/maintenance', auth, adminOnly, patchAdminMaintenance);
router.get('/admin/system/backup', auth, adminOnly, downloadSystemBackup);
router.post('/admin/system/restore', auth, adminOnly, restoreSystemBackup);
router.post('/admin/system/restore/upload', auth, adminOnly, uploadRestoreBackup);
router.get('/admin/system/restore/:jobId/status', auth, adminOnly, getRestoreJobStatus);
router.post('/admin/system/restore/:jobId/confirm', auth, adminOnly, confirmRestoreJob);

router.get('/docs', (_req, res) => {
  res.json({
    status: true,
    docs: [
      'POST /api/login',
      'POST /api/register',
      'POST /api/forgot-password',
      'GET /api/me',
      'GET /api/system/status',
      'GET /api/me/apikey',
      'POST /api/me/apikey/regenerate',
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
      'POST /api/bot/activation/deposit',
      'POST /api/deposit/cancel',
      'GET /api/deposits',
      'GET /api/deposit/:invoice',
      'POST /api/withdraw',
      'GET /api/withdraws',
      'GET /api/saldo',
      'GET /api/saldo-logs',
      'GET /api/saldo/logs',
      'GET /api/notifications',
      'GET /api/reseller/request/status',
      'POST /api/reseller/request',
      'GET /api/community/settings',
      'GET /api/bot/profile',
      'GET /api/bot/catalog',
      'POST /api/bot/order',
      'POST /api/bot/payments',
      'GET /api/bot/payments/:invoice/status',
      'POST /api/bot/payments/:invoice/cancel',
      'POST /api/bot/session/connect',
      'GET /api/bot/session/status',
      'POST /api/bot/session/logout',
      'GET /api/admin/summary',
      'GET /api/admin/users',
      'GET /api/admin/transactions',
      'GET /api/admin/products',
      'POST /api/admin/products/sync-provider',
      'POST /api/admin/products/manual',
      'POST /api/admin/products/hybrid',
      'POST /api/admin/products',
      'GET /api/admin/products/:id/stock-items',
      'POST /api/admin/products/:id/stock-items',
      'PATCH /api/admin/product-stock-items/:itemId',
      'PATCH /api/admin/product-stock-items/:itemId/disable',
      'DELETE /api/admin/product-stock-items/:itemId',
      'GET /api/admin/deposits',
      'GET /api/admin/withdraws',
      'GET /api/admin/reseller-requests',
      'POST /api/admin/reseller-requests/:id/approve',
      'POST /api/admin/reseller-requests/:id/reject',
      'PATCH /api/admin/withdraws/:id/approve',
      'PATCH /api/admin/withdraws/:id/reject',
      'GET /api/admin/markup',
      'PATCH /api/admin/markup',
      'GET /api/admin/notifications',
      'GET /api/admin/community-settings',
      'PATCH /api/admin/community-settings',
      'POST /api/admin/notifications',
      'PATCH /api/admin/notifications/:id',
      'DELETE /api/admin/notifications/:id',
      'GET /api/admin/premku-key',
      'PATCH /api/admin/premku-key',
      'GET /api/admin/bot-settings',
      'PATCH /api/admin/bot-settings',
      'GET /api/admin/maintenance',
      'PATCH /api/admin/maintenance',
      'GET /api/admin/system/backup',
      'POST /api/admin/system/restore',
      'POST /api/admin/system/restore/upload',
      'GET /api/admin/system/restore/:jobId/status',
      'POST /api/admin/system/restore/:jobId/confirm',
      'POST /api/callback/premku',
    ],
  });
});

export default router;
