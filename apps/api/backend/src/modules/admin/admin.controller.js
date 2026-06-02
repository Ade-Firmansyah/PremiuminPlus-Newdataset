import { createUser, deleteUserWithCleanup, listUsers, regenerateUserApiKey, updateUser } from '../../repositories/user.repo.js';
import { listTransactions } from '../../repositories/transaction.repo.js';
import { listDeposits } from '../../repositories/deposit.repo.js';
import { findWithdrawById, listWithdraws, updateWithdraw } from '../../repositories/withdraw.repo.js';
import { listProducts, updateProduct } from '../../repositories/product.repo.js';
import { listPendingOrders, findOrderByInvoice, updateOrderStatusByInvoice, incrementOrderRetryCount } from '../../repositories/order.repo.js';
import { refundTransaction, findTransactionByInvoice, updateTransactionStatus } from '../../repositories/transaction.repo.js';
import { retryOrderByAdmin } from '../order/order.service.js';
import { getBotSettings, getDiscountSetting, getMarkupSetting, getSetting, setBotSettings, setDiscountSetting, setMarkupSetting, setSetting } from '../../repositories/settings.repo.js';
import { createNotification, deleteNotification, listNotifications, updateNotification } from '../../repositories/notification.repo.js';
import { exportBalanceMutations, listBalanceMutations } from '../../repositories/balance-mutation.repo.js';
import { safeCreateAdminLog } from '../../repositories/admin-log.repo.js';
import { recalculateAllProductPrices } from '../../services/product-pricing.service.js';
import env from '../../config/env.js';
import { query } from '../../config/db.js';
import { approveWithdrawRequest, setSaldo } from '../../services/wallet.service.js';
import { premkuProfile } from '../../services/premku.service.js';
import { requireFields } from '../../utils/validator.js';
import { deleteCachePrefix, remember } from '../../services/cache.service.js';

const DEFAULT_COMMUNITY_SETTINGS = {
  group_link: 'https://chat.whatsapp.com/Igg1KjY54I3A2ERIgofm4b',
  pinned_message: 'Rame boleh, saling jaga wajib. Hindari spam, transaksi liar, dan konten di luar aturan grup.',
  announcement: 'Bergabung bersama reseller, anggota, admin, dan developer untuk diskusi, update stok, dan strategi jualan digital.',
  support_text: 'Jalur cepat untuk hubungi admin, tanya stok, dan koordinasi reseller harian.',
};

export async function users(_req, res) {
  res.json({ status: true, data: await remember('admin:users', 5, () => listUsers()) });
}

export async function adminSummary(_req, res) {
  const data = await remember('admin:summary', 5, async () => {
  const [userRows] = await query(
    `SELECT
      COUNT(*) AS total_users,
      SUM(role = 'reseller') AS active_resellers,
      COALESCE(SUM(saldo), 0) AS total_reseller_balance
     FROM users
     WHERE status = 'active'`,
  );
  const [transactionRows] = await query(
    `SELECT
      COUNT(*) AS total_transactions,
      COALESCE(SUM(total_price), 0) + (SELECT COALESCE(SUM(total_order), 0) FROM finance_daily_summaries) AS total_revenue,
      COALESCE(SUM(profit), 0) + (SELECT COALESCE(SUM(total_profit), 0) FROM finance_daily_summaries) AS system_profit
     FROM transactions
     WHERE status IN ('processing', 'success')
       AND transaction_type = 'order'
       AND (product_id IS NOT NULL OR invoice LIKE 'ORD%')`,
  );
  const [withdrawRows] = await query(
    `SELECT
      COUNT(*) AS pending_withdraw_count,
      COALESCE(SUM(amount), 0) AS pending_withdraw
     FROM withdraws
     WHERE status = 'pending'`,
  );
  const recentOrders = await query(
    `SELECT id, invoice, product_name, total_price, status, created_at
     FROM transactions
     WHERE transaction_type = 'order'
       AND status = 'success'
       AND (product_id IS NOT NULL OR invoice LIKE 'ORD%')
       AND LOWER(COALESCE(product_name, '')) NOT LIKE '%deposit%'
       AND LOWER(COALESCE(product_name, '')) NOT LIKE '%qris payment%'
     ORDER BY id DESC
     LIMIT 5`,
  );
  const pendingPayments = await query(
    `SELECT id, invoice, amount, total_bayar, status, created_at
     FROM payments
     WHERE status IN ('pending', 'pending_payment', 'payment_success', 'provider_processing', 'manual_required', 'payment_mismatch')
     ORDER BY id DESC
     LIMIT 5`,
  );
  const recentUsers = await query(
    `SELECT id, username, role, status, created_at
     FROM users
     ORDER BY id DESC
     LIMIT 5`,
  );
  const [operationalRows] = await query(
    `SELECT
       (SELECT COUNT(*) FROM orders WHERE fulfillment_type <> 'manual_admin') AS web_orders,
       (SELECT COUNT(*) FROM transactions WHERE channel = 'bot' AND transaction_type = 'order') AS bot_orders,
       (SELECT COUNT(*) FROM orders WHERE fulfillment_type = 'manual_admin') AS manual_orders,
       (SELECT COUNT(*) FROM deposits WHERE status = 'success') AS successful_deposits,
       (SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS new_users_7d,
       (SELECT COUNT(*) FROM saldo_mutations WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS balance_mutations_7d,
       (SELECT COUNT(*) FROM orders WHERE order_status IN ('waiting_provider', 'provider_processing')) AS pending_provider,
       (SELECT COUNT(*) FROM orders WHERE order_status IN ('pending_manual', 'manual_required') OR delivery_status = 'manual_pending') AS manual_required`,
  );

    return {
      total_users: Number(userRows?.total_users || 0),
      active_resellers: Number(userRows?.active_resellers || 0),
      total_reseller_balance: Number(userRows?.total_reseller_balance || 0),
      total_transactions: Number(transactionRows?.total_transactions || 0),
      total_revenue: Number(transactionRows?.total_revenue || 0),
      system_profit: Number(transactionRows?.system_profit || 0),
      pending_withdraw_count: Number(withdrawRows?.pending_withdraw_count || 0),
      pending_withdraw: Number(withdrawRows?.pending_withdraw || 0),
      recent_orders: recentOrders,
      pending_payments: pendingPayments,
      recent_users: recentUsers,
      operational: {
        web_orders: Number(operationalRows?.web_orders || 0),
        bot_orders: Number(operationalRows?.bot_orders || 0),
        manual_orders: Number(operationalRows?.manual_orders || 0),
        successful_deposits: Number(operationalRows?.successful_deposits || 0),
        new_users_7d: Number(operationalRows?.new_users_7d || 0),
        balance_mutations_7d: Number(operationalRows?.balance_mutations_7d || 0),
        pending_provider: Number(operationalRows?.pending_provider || 0),
        manual_required: Number(operationalRows?.manual_required || 0),
      },
    };
  });

  res.json({ status: true, data });
}

export async function pendingOrders(_req, res) {
  const data = await listPendingOrders();
  res.json({ status: true, data });
}

export async function sendManualOrder(req, res) {
  try {
    requireFields(req.body, ['email', 'password']);
    const order = await findOrderByInvoice(req.params.invoice);
    if (!order) {
      return res.status(404).json({ status: false, message: 'Order tidak ditemukan' });
    }

    if (order.order_status === 'success' || order.order_status === 'cancelled') {
      return res.status(400).json({ status: false, message: 'Order sudah selesai atau dibatalkan' });
    }

    const updated = await updateOrderStatusByInvoice(req.params.invoice, {
      order_status: 'success',
      provider_status: 'success',
      fulfillment_type: 'manual_admin',
      manual_email: req.body.email,
      manual_password: req.body.password,
      manual_note: req.body.note || null,
      fulfilled_by_admin_id: req.user?.id || null,
      fulfilled_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      payment_status: 'success',
    });

    await safeCreateAdminLog({
      admin_id: req.user?.id,
      action: 'send_manual_order',
      target_type: 'order',
      target_id: order.invoice,
      ip_address: req.ip,
      metadata: {
        user_id: order.user_id,
        product_id: order.product_id,
        manual_email: req.body.email,
      },
    });
    await createNotification({
      user_id: order.user_id,
      title: 'Order manual berhasil',
      message: `Order ${order.invoice} sudah dikirim manual oleh admin. Credential tersedia di riwayat pesanan.`,
      type: 'order_manual_fulfilled',
      is_active: true,
    });

    res.json({ status: true, data: updated });
  } catch (error) {
    res.status(error.statusCode || 500).json({ status: false, message: error.message || 'Gagal mengirim data manual' });
  }
}

export async function completeOrder(req, res) {
  try {
    const order = await findOrderByInvoice(req.params.invoice);
    if (!order) {
      return res.status(404).json({ status: false, message: 'Order tidak ditemukan' });
    }

    if (order.order_status === 'success' || order.order_status === 'cancelled') {
      return res.status(400).json({ status: false, message: 'Order sudah selesai atau dibatalkan' });
    }

    const updated = await updateOrderStatusByInvoice(req.params.invoice, {
      order_status: 'success',
      provider_status: 'success',
      fulfillment_type: 'manual_admin',
      fulfilled_by_admin_id: req.user?.id || null,
      fulfilled_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      payment_status: 'success',
    });

    await safeCreateAdminLog({
      admin_id: req.user?.id,
      action: 'complete_order',
      target_type: 'order',
      target_id: order.invoice,
      ip_address: req.ip,
      metadata: { user_id: order.user_id, product_id: order.product_id },
    });
    await createNotification({
      user_id: order.user_id,
      title: 'Order manual selesai',
      message: `Order ${order.invoice} sudah diselesaikan admin.`,
      type: 'order_manual_fulfilled',
      is_active: true,
    });

    res.json({ status: true, data: updated });
  } catch (error) {
    res.status(error.statusCode || 500).json({ status: false, message: error.message || 'Gagal menyelesaikan order' });
  }
}

export async function cancelRefundOrder(req, res) {
  try {
    const order = await findOrderByInvoice(req.params.invoice);
    if (!order) {
      return res.status(404).json({ status: false, message: 'Order tidak ditemukan' });
    }

    if (order.order_status === 'cancelled') {
      return res.status(400).json({ status: false, message: 'Order sudah dibatalkan' });
    }

    if (['success', 'credential_delivery'].includes(String(order.order_status || '').toLowerCase()) || order.delivery_status === 'sent') {
      return res.status(400).json({ status: false, message: 'Order sudah selesai dan tidak bisa direfund otomatis' });
    }

    const refunded = await refundTransaction(req.params.invoice, { order_invoice: req.params.invoice }, 'admin-cancel-refund');
    await updateOrderStatusByInvoice(req.params.invoice, {
      order_status: 'cancelled',
      provider_status: 'cancelled',
      fulfillment_type: 'refund',
      payment_status: 'refunded',
    });

    await safeCreateAdminLog({
      admin_id: req.user?.id,
      action: 'cancel_refund_order',
      target_type: 'order',
      target_id: order.invoice,
      ip_address: req.ip,
      metadata: { user_id: order.user_id, product_id: order.product_id },
    });
    await createNotification({
      user_id: order.user_id,
      title: 'Refund order berhasil',
      message: `Order ${order.invoice} dibatalkan dan refund sudah diproses.`,
      type: 'refund',
      is_active: true,
    });

    res.json({ status: true, data: refunded });
  } catch (error) {
    res.status(error.statusCode || 500).json({ status: false, message: error.message || 'Gagal cancel dan refund order' });
  }
}

export async function retryOrder(req, res) {
  try {
    const data = await retryOrderByAdmin(req.params.invoice);

    await safeCreateAdminLog({
      admin_id: req.user?.id,
      action: 'retry_order',
      target_type: 'order',
      target_id: req.params.invoice,
      ip_address: req.ip,
      metadata: { retry_count: data?.retry_count || 0 },
    });

    res.json({ status: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ status: false, message: error.message || 'Gagal retry provider order' });
  }
}

export async function premkuFinanceProfile(_req, res) {
  try {
    const payload = await remember('premku:profile', 5, () => premkuProfile());
    const source = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
    const saldo = source?.saldo ?? source?.balance ?? source?.api_balance ?? null;
    const username = source?.username ?? source?.name ?? null;
    const whatsapp = source?.whatsapp ?? source?.wa ?? source?.phone ?? null;

    if (saldo === null && !username && !whatsapp) {
      return res.json({
        status: true,
        data: {
          available: false,
          message: 'Saldo API realtime unavailable.',
        },
      });
    }

    return res.json({
      status: true,
      data: {
        available: true,
        saldo: saldo !== null ? Number(saldo) : null,
        username: username || '',
        whatsapp: whatsapp || '',
      },
    });
  } catch {
    return res.json({
      status: true,
      data: {
        available: false,
        message: 'Saldo API realtime unavailable.',
      },
    });
  }
}

export async function createAdminUser(req, res) {
  try {
    requireFields(req.body, ['username', 'password']);
    const initialSaldo = Number(req.body.saldo || 0);
    if (!Number.isFinite(initialSaldo) || initialSaldo < 0) {
      return res.status(400).json({ status: false, message: 'Saldo awal tidak valid' });
    }

    const data = await createUser(req.body);
    deleteCachePrefix('admin:');
    deleteCachePrefix('leaderboard:');
    if (Number.isFinite(initialSaldo) && initialSaldo > 0) {
      await setSaldo(data, initialSaldo, `admin-user-${data.id}-initial-saldo`, { admin_executor_id: req.user?.id });
      data.saldo = initialSaldo;
    }
    await safeCreateAdminLog({
      admin_id: req.user?.id,
      action: 'create_user',
      target_type: 'user',
      target_id: data.id,
      ip_address: req.ip,
      metadata: { username: data.username, role: data.role, initial_saldo: initialSaldo },
    });
    res.status(201).json({ status: true, data: { ...data, password: undefined } });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: false,
      message: error.message || 'Gagal membuat user',
    });
  }
}

export async function updateAdminUser(req, res) {
  try {
    const payload = { ...req.body };
    const hasSaldoChange = payload.saldo !== undefined;
    if (hasSaldoChange) {
      const nextSaldo = Number(payload.saldo);
      if (!Number.isFinite(nextSaldo) || nextSaldo < 0) {
        return res.status(400).json({ status: false, message: 'Saldo tidak valid' });
      }
    }
    delete payload.saldo;

    const data = await updateUser(req.params.id, payload);
    if (!data) {
      return res.status(404).json({ status: false, message: 'User tidak ditemukan' });
    }

    if (hasSaldoChange) {
      await setSaldo(data, req.body.saldo, `admin-user-${data.id}-saldo-adjustment`, { admin_executor_id: req.user?.id });
      data.saldo = Number(req.body.saldo);
    }
    await safeCreateAdminLog({
      admin_id: req.user?.id,
      action: hasSaldoChange ? 'edit_user_saldo' : 'edit_user',
      target_type: 'user',
      target_id: data.id,
      ip_address: req.ip,
      metadata: { fields: Object.keys(payload), saldo_changed: hasSaldoChange },
    });
    deleteCachePrefix('admin:');
    deleteCachePrefix('leaderboard:');
    deleteCachePrefix(`dashboard:user:${data.id}`);

    res.json({ status: true, data: { ...data, password: undefined } });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: false,
      message: error.message || 'Gagal memperbarui user',
    });
  }
}

export async function updateAdminUserStatus(req, res) {
  req.body = { status: req.body?.status };
  return updateAdminUser(req, res);
}

export async function updateAdminUserRole(req, res) {
  req.body = { role: req.body?.role };
  return updateAdminUser(req, res);
}

export async function regenerateAdminUserApiKey(req, res) {
  try {
    const data = await regenerateUserApiKey(req.params.id);
    if (!data) {
      return res.status(404).json({ status: false, message: 'User tidak ditemukan' });
    }

    await safeCreateAdminLog({
      admin_id: req.user?.id,
      action: 'regenerate_user_api_key',
      target_type: 'user',
      target_id: data.id,
      ip_address: req.ip,
      metadata: { username: data.username },
    });
    deleteCachePrefix('admin:');
    deleteCachePrefix(`dashboard:user:${data.id}`);

    return res.json({
      status: true,
      data: { id: data.id, username: data.username, api_key: data.api_key },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      status: false,
      message: error.message || 'Gagal regenerate API key user',
    });
  }
}

export async function updateAdminUserPassword(req, res) {
  try {
    requireFields(req.body, ['new_password']);
    const nextPassword = String(req.body.new_password || '');
    if (nextPassword.length < 8) {
      return res.status(400).json({ status: false, message: 'Password minimal 8 karakter' });
    }

    const data = await updateUser(req.params.id, { password: nextPassword });
    if (!data) {
      return res.status(404).json({ status: false, message: 'User tidak ditemukan' });
    }

    await safeCreateAdminLog({
      admin_id: req.user?.id,
      action: 'update_user_password',
      target_type: 'user',
      target_id: data.id,
      ip_address: req.ip,
      metadata: { username: data.username },
    });
    deleteCachePrefix('admin:users');
    deleteCachePrefix(`dashboard:user:${data.id}`);
    res.json({ status: true, data: { id: data.id, username: data.username } });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: false,
      message: error.message || 'Gagal memperbarui password user',
    });
  }
}

export async function deleteAdminUser(req, res) {
  try {
    const data = await deleteUserWithCleanup(req.params.id, req.body?.username_confirmation);
    if (!data) {
      return res.status(404).json({ status: false, message: 'User tidak ditemukan' });
    }
    await safeCreateAdminLog({
      admin_id: req.user?.id,
      action: 'delete_user',
      target_type: 'user',
      target_id: data.id,
      ip_address: req.ip,
      metadata: { username: data.username },
    });
    res.json({ status: true, data: { ...data, password: undefined } });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: false,
      message: error.message || 'Gagal menghapus user',
    });
  }
}

export async function transactions(_req, res) {
  res.json({ status: true, data: await listTransactions() });
}

export async function deposits(_req, res) {
  res.json({ status: true, data: await listDeposits() });
}

export async function withdraws(_req, res) {
  res.json({ status: true, data: await listWithdraws() });
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function balanceMutations(req, res) {
  const cacheKey = `admin:balance-mutations:${JSON.stringify(req.query || {})}`;
  const payload = await remember(cacheKey, 5, () => listBalanceMutations(req.query || {}));
  res.json({ status: true, ...payload });
}

export async function balanceMutationsCsv(req, res) {
  const rows = await exportBalanceMutations(req.query || {});
  const headers = [
    'waktu',
    'user',
    'tipe_mutasi',
    'saldo_masuk',
    'nominal',
    'saldo_keluar',
    'saldo_sebelum',
    'saldo_sesudah',
    'sumber_transaksi',
    'admin_executor',
    'keterangan',
  ];
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      [
        row.created_at,
        row.username || `User #${row.user_id}`,
        row.mutation_type,
        row.saldo_masuk,
        row.nominal,
        row.saldo_keluar,
        row.balance_before,
        row.balance_after,
        [row.source_type, row.source_ref].filter(Boolean).join(':'),
        row.admin_executor || '',
        row.notes || '',
      ]
        .map(csvEscape)
        .join(','),
    ),
  ];

  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', 'attachment; filename="mutasi-saldo.csv"');
  res.send(lines.join('\n'));
}

export async function approveWithdraw(req, res) {
  try {
    const data = await approveWithdrawRequest(req.params.id);
    await safeCreateAdminLog({
      admin_id: req.user?.id,
      action: 'approve_withdraw',
      target_type: 'withdraw',
      target_id: req.params.id,
      ip_address: req.ip,
      metadata: { user_id: data.user_id, amount: data.amount },
    });
    deleteCachePrefix('admin:');
    deleteCachePrefix('leaderboard:');
    deleteCachePrefix(`dashboard:user:${data.user_id}`);
    await createNotification({
      user_id: data.user_id,
      title: 'Withdraw berhasil diproses',
      message: `Withdraw ${data.invoice || `#${data.id}`} sebesar Rp${Number(data.amount || 0).toLocaleString('id-ID')} berhasil diproses admin.`,
      type: 'withdraw',
      target_role: null,
      is_active: true,
    });
    return res.json({ status: true, data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      status: false,
      message: error.message || 'Gagal memproses withdraw',
    });
  }
}

export async function rejectWithdraw(req, res) {
  try {
    const data = await findWithdrawById(req.params.id);
    if (!data) {
      return res.status(404).json({ status: false, message: 'Withdraw tidak ditemukan' });
    }

    if (data.status !== 'pending') {
      return res.status(400).json({ status: false, message: 'Withdraw sudah diproses' });
    }

    const notifyUser = req.body?.notify_user !== false;
    const reason = String(req.body?.notes || req.body?.reason || '').trim() || 'Withdraw dibatalkan admin.';
    const reasonCode = String(req.body?.reason_code || '').trim();
    const notificationMessage = String(req.body?.notification_message || '').trim()
      || `Withdraw ${data.invoice || `#${data.id}`} dibatalkan. Alasan: ${reason}`;

    const updated = await updateWithdraw(data.id, {
      status: 'rejected',
      notes: data.notes || '',
      admin_note: reasonCode ? `${reasonCode}: ${reason}` : reason,
    });

    if (!updated) {
      return res.status(500).json({ status: false, message: 'Withdraw gagal diproses' });
    }
    await safeCreateAdminLog({
      admin_id: req.user?.id,
      action: 'reject_withdraw',
      target_type: 'withdraw',
      target_id: data.id,
      ip_address: req.ip,
      metadata: { user_id: data.user_id, amount: data.amount, reason_code: reasonCode, reason },
    });
    deleteCachePrefix('admin:');
    deleteCachePrefix(`dashboard:user:${data.user_id}`);
    if (notifyUser) {
      await createNotification({
        user_id: data.user_id,
        title: 'Withdraw dibatalkan',
        message: notificationMessage,
        type: 'withdraw',
        target_role: null,
        is_active: true,
      });
    }

    res.json({ status: true, data: updated });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: false,
      message: error.message || 'Gagal menolak withdraw',
    });
  }
}

export async function getMarkup(_req, res) {
  res.json({ status: true, data: await getMarkupSetting() });
}

export async function updateMarkup(req, res) {
  try {
    const payload = {
      markup: req.body?.markup,
      markup_type: req.body?.markup_type,
      member_markup: req.body?.member_markup,
      reseller_markup: req.body?.reseller_markup,
      member_markup_ranges: req.body?.member_markup_ranges,
      reseller_markup_ranges: req.body?.reseller_markup_ranges,
    };

    if (
      payload.markup === undefined &&
      payload.markup_type === undefined &&
      payload.member_markup === undefined &&
      payload.reseller_markup === undefined &&
      payload.member_markup_ranges === undefined &&
      payload.reseller_markup_ranges === undefined
    ) {
      return res.status(400).json({ status: false, message: 'markup anggota atau reseller wajib diisi' });
    }

    const data = await setMarkupSetting(payload);
    
    const pricingSync = await recalculateAllProductPrices();
    
    deleteCachePrefix('products:');
    deleteCachePrefix('bot:catalog:');
    deleteCachePrefix('dashboard:');
    res.json({ status: true, data, pricing_sync: pricingSync, updated_products: pricingSync?.updated_products || pricingSync?.updated || 0 });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: false,
      message: error.message || 'Gagal memperbarui markup',
    });
  }
}

export async function getDiscount(_req, res) {
  res.json({ status: true, data: await getDiscountSetting() });
}

export async function updateDiscount(req, res) {
  try {
    const data = await setDiscountSetting({ discount_percent: req.body?.discount_percent });
    deleteCachePrefix('products:');
    res.json({ status: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: false,
      message: error.message || 'Gagal memperbarui discount',
    });
  }
}

export async function notifications(_req, res) {
  res.json({ status: true, data: await listNotifications() });
}

export async function createAdminNotification(req, res) {
  try {
    requireFields(req.body, ['title', 'message']);
    const targetRole = String(req.body.target_role || 'all').toLowerCase();
    if (!['all', 'admin', 'reseller', 'member'].includes(targetRole)) {
      return res.status(400).json({ status: false, message: 'Target notifikasi tidak valid' });
    }

    const data = await createNotification({
      title: String(req.body.title).trim(),
      message: String(req.body.message).trim(),
      type: String(req.body.type || 'broadcast').trim(),
      is_active: req.body.is_active === undefined ? true : Boolean(req.body.is_active),
      is_pinned: Boolean(req.body.is_pinned),
      target_role: targetRole,
      created_by: req.user?.id || null,
    });
    res.status(201).json({ status: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: false,
      message: error.message || 'Gagal membuat notifikasi',
    });
  }
}

export async function updateAdminNotification(req, res) {
  try {
    const payload = { ...req.body };
    if (payload.target_role !== undefined) {
      const targetRole = String(payload.target_role || 'all').toLowerCase();
      if (!['all', 'admin', 'reseller', 'member'].includes(targetRole)) {
        return res.status(400).json({ status: false, message: 'Target notifikasi tidak valid' });
      }
      payload.target_role = targetRole;
    }
    const data = await updateNotification(req.params.id, payload);
    if (!data) return res.status(404).json({ status: false, message: 'Notifikasi tidak ditemukan' });
    return res.json({ status: true, data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      status: false,
      message: error.message || 'Gagal memperbarui notifikasi',
    });
  }
}

export async function deleteAdminNotification(req, res) {
  try {
    const data = await deleteNotification(req.params.id);
    if (!data) return res.status(404).json({ status: false, message: 'Notifikasi tidak ditemukan' });
    return res.json({ status: true, data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      status: false,
      message: error.message || 'Gagal menghapus notifikasi',
    });
  }
}

function normalizeCommunitySettings(payload = {}) {
  return {
    group_link: String(payload.group_link ?? DEFAULT_COMMUNITY_SETTINGS.group_link).trim().slice(0, 500),
    pinned_message: String(payload.pinned_message ?? DEFAULT_COMMUNITY_SETTINGS.pinned_message).trim().slice(0, 1000),
    announcement: String(payload.announcement ?? DEFAULT_COMMUNITY_SETTINGS.announcement).trim().slice(0, 1000),
    support_text: String(payload.support_text ?? DEFAULT_COMMUNITY_SETTINGS.support_text).trim().slice(0, 500),
  };
}

export async function communitySettings(_req, res) {
  const data = normalizeCommunitySettings(await getSetting('community_settings', DEFAULT_COMMUNITY_SETTINGS));
  res.json({ status: true, data });
}

export async function updateCommunitySettings(req, res, next) {
  try {
    const data = normalizeCommunitySettings(req.body || {});
    await setSetting('community_settings', data);
    deleteCachePrefix('dashboard:');
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getPremkuKey(_req, res) {
  const key = await getSetting('premku_api_key', env.PREMKU_API_KEY || '');
  res.json({
    status: true,
    data: {
      configured: Boolean(key),
      masked: key ? `${key.slice(0, 4)}${'*'.repeat(Math.max(key.length - 8, 4))}${key.slice(-4)}` : '',
    },
  });
}

export async function updatePremkuKey(req, res) {
  try {
    requireFields(req.body, ['api_key']);
    const key = String(req.body.api_key || '').trim();
    if (key.length < 8) {
      return res.status(400).json({ status: false, message: 'API key terlalu pendek' });
    }

    await setSetting('premku_api_key', key);
    deleteCachePrefix('premku:');
    deleteCachePrefix('products:');
    res.json({
      status: true,
      data: {
        configured: true,
        masked: `${key.slice(0, 4)}${'*'.repeat(Math.max(key.length - 8, 4))}${key.slice(-4)}`,
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: false,
      message: error.message || 'Gagal memperbarui API key Premku',
    });
  }
}

export async function botSettings(_req, res) {
  res.json({ status: true, data: await getBotSettings() });
}

export async function updateBotSettings(req, res, next) {
  try {
    res.json({ status: true, data: await setBotSettings(req.body || {}) });
  } catch (error) {
    next(error);
  }
}

export async function myBotSettings(req, res) {
  const fallback = await getBotSettings();
  const data = await getSetting(`bot_settings:user:${req.user.id}`, fallback);
  res.json({ status: true, data });
}

export async function updateMyBotSettings(req, res, next) {
  try {
    const current = await getSetting(`bot_settings:user:${req.user.id}`, await getBotSettings());
    const data = {
      ...current,
      enabled: Boolean(req.body?.enabled),
      auto_reply_enabled: Boolean(req.body?.auto_reply_enabled),
      panel_name: String(req.body?.panel_name ?? current.panel_name ?? 'Premiumin Plus').slice(0, 120),
      greeting_message: String(req.body?.greeting_message ?? current.greeting_message).slice(0, 500),
      footer_message: String(req.body?.footer_message ?? current.footer_message ?? 'Premiumin Plus').slice(0, 200),
      keyword_response: String(req.body?.keyword_response ?? current.keyword_response ?? 'Untuk melihat stok ketik stok / list.').slice(0, 500),
      auto_reply_prompt: String(req.body?.auto_reply_prompt ?? current.auto_reply_prompt).slice(0, 2000),
      order_format: String(req.body?.order_format ?? current.order_format).slice(0, 300),
      features: {
        ...current.features,
        ...(req.body?.features && typeof req.body.features === 'object' ? req.body.features : {}),
      },
    };
    await setSetting(`bot_settings:user:${req.user.id}`, data);
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}
