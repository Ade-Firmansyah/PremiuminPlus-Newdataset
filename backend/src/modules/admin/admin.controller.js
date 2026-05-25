import { createUser, deleteUserWithCleanup, getUserById, listUsers, updateUser } from '../../repositories/user.repo.js';
import { listTransactions } from '../../repositories/transaction.repo.js';
import { listDeposits } from '../../repositories/deposit.repo.js';
import { findWithdrawById, listWithdraws, updateWithdraw } from '../../repositories/withdraw.repo.js';
import { getBotSettings, getDiscountSetting, getMarkupSetting, getSetting, setBotSettings, setDiscountSetting, setMarkupSetting, setSetting } from '../../repositories/settings.repo.js';
import { createNotification, deleteNotification, listNotifications, updateNotification } from '../../repositories/notification.repo.js';
import { listActivityLogs } from '../../repositories/activity.repo.js';
import env from '../../config/env.js';
import { query, transaction } from '../../config/db.js';
import { getSaldoUtama, getUsableBalance, setSaldo } from '../../services/wallet.service.js';
import { premkuProfile } from '../../services/premku.service.js';
import { clearCache, getCache, setCache } from '../../services/cache.service.js';
import { publishUserRefresh } from '../../services/realtime.service.js';
import { isValidEmail, isValidWhatsapp, normalizeEmail, normalizeWhatsapp, requireFields, sanitizePlainText } from '../../utils/validator.js';
import { getUserBotSettings, updateUserBotSettings } from '../bot/bot.service.js';

const ORDER_HISTORY_FILTER = `
  COALESCE(transaction_type, 'order') = 'order'
  AND product_id IS NOT NULL
  AND LOWER(COALESCE(product_name, '')) NOT IN ('qris payment', 'deposit saldo', 'topup saldo', 'top up saldo')
  AND LOWER(COALESCE(channel, '')) NOT IN ('deposit', 'qris', 'payment')
`;

function failValidation(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function sanitizeAdminUserPayload(source = {}) {
  const payload = { ...source };

  if (payload.username !== undefined) {
    payload.username = sanitizePlainText(payload.username, 40);
    if (payload.username && !/^[a-zA-Z0-9_.-]+$/.test(payload.username)) {
      failValidation('Username hanya boleh berisi huruf, angka, titik, garis bawah, atau strip');
    }
  }

  if (payload.email !== undefined) {
    const email = normalizeEmail(payload.email);
    if (email && !isValidEmail(email)) {
      failValidation('Invalid email format');
    }
    payload.email = email || null;
  }

  if (payload.phone !== undefined) {
    const phone = normalizeWhatsapp(payload.phone);
    if (phone && !isValidWhatsapp(phone)) {
      failValidation('Invalid WhatsApp number');
    }
    payload.phone = phone || null;
  }

  if (payload.fullName !== undefined) {
    payload.fullName = sanitizePlainText(payload.fullName, 120);
  }

  if (payload.notes !== undefined) {
    payload.notes = sanitizePlainText(payload.notes, 500);
  }

  return payload;
}

function pageOptions(req, fallbackLimit = 50) {
  return {
    limit: Math.min(Math.max(Number(req.query.limit || fallbackLimit), 1), 100),
    page: Math.max(Number(req.query.page || 1), 1),
  };
}

export async function users(req, res) {
  res.json({ status: true, data: await listUsers(pageOptions(req)) });
}

export async function adminSummary(_req, res) {
  const cached = getCache('admin-summary');
  if (cached) {
    return res.json(cached);
  }

  const [userRows] = await query(
    `SELECT
      COUNT(*) AS total_users,
      SUM(role = 'reseller') AS active_resellers,
      COALESCE(SUM(saldo_utama), 0) AS total_reseller_balance
     FROM users
     WHERE status = 'active'`,
  );
  const [transactionRows] = await query(
    `SELECT
      COUNT(*) AS total_transactions,
      COALESCE(SUM(NULLIF(final_amount, 0)), SUM(total_price), 0) AS total_revenue,
      COALESCE(SUM(NULLIF(provider_cost, 0)), SUM(price_base * qty), 0) AS total_provider_cost,
      COALESCE(SUM(admin_profit), 0) AS system_profit,
      COALESCE(SUM(user_profit), 0) AS total_user_profit
     FROM transactions
     WHERE status IN ('processing', 'success')
       AND ${ORDER_HISTORY_FILTER}`,
  );
  const [roleProfitRows] = await query(
    `SELECT
      COALESCE(SUM(CASE WHEN u.role = 'reseller' THEN t.user_profit ELSE 0 END), 0) AS reseller_profit,
      COALESCE(SUM(CASE WHEN u.role = 'member' THEN t.user_profit ELSE 0 END), 0) AS member_profit
     FROM transactions t
     JOIN users u ON u.id = t.user_id
     WHERE t.status IN ('processing', 'success')
       AND ${ORDER_HISTORY_FILTER.replaceAll('transaction_type', 't.transaction_type').replaceAll('product_id', 't.product_id').replaceAll('product_name', 't.product_name').replaceAll('channel', 't.channel')}`,
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
     WHERE ${ORDER_HISTORY_FILTER}
     ORDER BY id DESC
     LIMIT 5`,
  );
  const pendingPayments = await query(
    `SELECT id, invoice, amount, total_bayar, status, created_at
     FROM payments
     WHERE status = 'pending'
     ORDER BY id DESC
     LIMIT 5`,
  );
  const recentUsers = await query(
    `SELECT id, username, role, status, created_at
     FROM users
     ORDER BY id DESC
     LIMIT 5`,
  );

  const response = {
    status: true,
    data: {
      total_users: Number(userRows?.total_users || 0),
      active_resellers: Number(userRows?.active_resellers || 0),
      total_reseller_balance: Number(userRows?.total_reseller_balance || 0),
      total_transactions: Number(transactionRows?.total_transactions || 0),
      total_revenue: Number(transactionRows?.total_revenue || 0),
      total_provider_cost: Number(transactionRows?.total_provider_cost || 0),
      system_profit: Number(transactionRows?.system_profit || 0),
      total_user_profit: Number(transactionRows?.total_user_profit || 0),
      reseller_profit: Number(roleProfitRows?.reseller_profit || 0),
      member_profit: Number(roleProfitRows?.member_profit || 0),
      pending_withdraw_count: Number(withdrawRows?.pending_withdraw_count || 0),
      pending_withdraw: Number(withdrawRows?.pending_withdraw || 0),
      recent_orders: recentOrders,
      pending_payments: pendingPayments,
      recent_users: recentUsers,
    },
  };
  setCache('admin-summary', response, env.DASHBOARD_CACHE_MS);
  return res.json(response);
}

export async function premkuFinanceProfile(_req, res) {
  try {
    const payload = await premkuProfile();
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
    const payload = sanitizeAdminUserPayload(req.body);
    const initialSaldo = Number(req.body.saldo || 0);
    if (!Number.isFinite(initialSaldo) || initialSaldo < 0) {
      return res.status(400).json({ status: false, message: 'Saldo awal tidak valid' });
    }

    const data = await createUser(payload);
    if (Number.isFinite(initialSaldo) && initialSaldo > 0) {
      await setSaldo(data, initialSaldo, `admin-user-${data.id}-initial-saldo`);
      data.saldo = initialSaldo;
    }
    res.status(201).json({ status: true, data: { ...data, password: undefined } });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: false,
      success: false,
      message: error.message || 'Gagal membuat user',
    });
  }
}

export async function updateAdminUser(req, res) {
  try {
    const payload = sanitizeAdminUserPayload(req.body);
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
      await setSaldo(data, req.body.saldo, `admin-user-${data.id}-saldo-adjustment`);
      data.saldo = Number(req.body.saldo);
    }

    res.json({ status: true, data: { ...data, password: undefined } });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: false,
      success: false,
      message: error.message || 'Gagal memperbarui user',
    });
  }
}

export async function deleteAdminUser(req, res) {
  try {
    const data = await deleteUserWithCleanup(req.params.id, req.body?.username_confirmation);
    if (!data) {
      return res.status(404).json({ status: false, message: 'User tidak ditemukan' });
    }
    res.json({ status: true, data: { ...data, password: undefined } });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: false,
      message: error.message || 'Gagal menghapus user',
    });
  }
}

export async function transactions(req, res) {
  res.json({ status: true, data: await listTransactions(pageOptions(req)) });
}

export async function activityLogs(req, res) {
  const limit = Math.min(Math.max(Number(req.query.limit || 80), 1), 200);
  const rows = await listActivityLogs(limit);
  const resetOnly = String(req.query.scope || '').toLowerCase() === 'password_reset';
  const data = resetOnly ? rows.filter((item) => String(item.scope || '').startsWith('PASSWORD_RESET_')) : rows;
  res.json({ status: true, data });
}

export async function deposits(req, res) {
  res.json({ status: true, data: await listDeposits(pageOptions(req)) });
}

export async function withdraws(_req, res) {
  res.json({ status: true, data: await listWithdraws() });
}

export async function approveWithdraw(req, res) {
  try {
    const data = await findWithdrawById(req.params.id);
    if (!data) {
      return res.status(404).json({ status: false, message: 'Withdraw tidak ditemukan' });
    }

    if (data.status !== 'pending') {
      return res.status(400).json({ status: false, message: 'Withdraw sudah diproses' });
    }

    await transaction(async (connection) => {
      const [withdrawRows] = await connection.query('SELECT * FROM withdraws WHERE id = ? FOR UPDATE', [data.id]);
      const withdraw = withdrawRows[0];
      if (!withdraw) {
        const error = new Error('Withdraw tidak ditemukan');
        error.statusCode = 404;
        throw error;
      }
      if (withdraw.status !== 'pending') {
        const error = new Error('Withdraw sudah diproses');
        error.statusCode = 400;
        throw error;
      }

      const [userRows] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [withdraw.user_id]);
      const lockedUser = userRows[0];
      if (!lockedUser) {
        const error = new Error('User tidak ditemukan');
        error.statusCode = 404;
        throw error;
      }

      const amount = Number(withdraw.amount || 0);
      const before = getSaldoUtama(lockedUser);
      const usableBefore = getUsableBalance(lockedUser);
      if (usableBefore < amount) {
        const error = new Error('Saldo user tidak cukup untuk menyelesaikan penarikan');
        error.statusCode = 400;
        throw error;
      }

      const after = before - amount;
      const reference = `withdraw-${withdraw.id}`;
      await connection.query('UPDATE users SET saldo_utama = ?, saldo = ? WHERE id = ?', [after, after, withdraw.user_id]);
      await connection.query(
        `INSERT INTO saldo_logs
          (user_id, type, amount, balance_before, balance_after, reference, notes)
         VALUES (?, 'debit', ?, ?, ?, ?, ?)`,
        [withdraw.user_id, amount, before, after, reference, 'Withdraw paid by admin'],
      );
      await connection.query(
        `INSERT INTO saldo_mutations
          (user_id, mutation_type, amount, balance_before, balance_after, reference)
         VALUES (?, 'withdraw', ?, ?, ?, ?)`,
        [withdraw.user_id, amount, before, after, reference],
      );
      await connection.query(
        `UPDATE withdraws
         SET status = 'paid', processed_at = NOW(), notes = COALESCE(NULLIF(?, ''), notes), updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [req.body?.notes || 'Paid by admin', withdraw.id],
      );
      await connection.query(
        `INSERT INTO activity_logs (actor_id, user_id, scope, message, activity, metadata)
         VALUES (?, ?, 'WITHDRAW', 'Withdraw paid', 'Withdraw paid', CAST(? AS JSON))`,
        [req.user.id, withdraw.user_id, JSON.stringify({ withdraw_id: withdraw.id, amount, balance_before: before, balance_after: after })],
      );

      return true;
    });
    const updated = await findWithdrawById(data.id);
    if (!updated) {
      return res.status(500).json({ status: false, message: 'Withdraw gagal diproses' });
    }
    clearCache();
    publishUserRefresh(updated.user_id, 'wallet_updated', { scope: 'wallet', entity: 'saldo', id: `withdraw-${updated.id}` });
    publishUserRefresh(updated.user_id, 'withdraw_updated', { scope: 'withdraw', entity: 'withdraw', id: updated.id });
    publishUserRefresh(updated.user_id, 'dashboard.updated', { scope: 'dashboard', entity: 'summary', id: `withdraw-${updated.id}` });
    return res.json({ status: true, data: updated });
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

    const updated = await updateWithdraw(data.id, {
      status: 'rejected',
      notes: req.body?.notes || data.notes || 'Rejected by admin',
    });

    if (!updated) {
      return res.status(500).json({ status: false, message: 'Withdraw gagal diproses' });
    }

    clearCache();
    publishUserRefresh(updated.user_id, 'withdraw_updated', { scope: 'withdraw', entity: 'withdraw', id: updated.id });
    publishUserRefresh(updated.user_id, 'dashboard.updated', { scope: 'dashboard', entity: 'summary', id: `withdraw-${updated.id}` });
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
    };

    if (
      payload.markup === undefined &&
      payload.markup_type === undefined &&
      payload.member_markup === undefined &&
      payload.reseller_markup === undefined
    ) {
      return res.status(400).json({ status: false, message: 'markup anggota atau reseller wajib diisi' });
    }

    const data = await setMarkupSetting(payload);
    clearCache('products:');
    res.json({ status: true, data });
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
    clearCache('products:');
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
  res.json({ status: true, data: await getUserBotSettings(req.user) });
}

export async function updateMyBotSettings(req, res, next) {
  try {
    res.json({ status: true, data: await updateUserBotSettings(req.user, req.body || {}) });
  } catch (error) {
    next(error);
  }
}
