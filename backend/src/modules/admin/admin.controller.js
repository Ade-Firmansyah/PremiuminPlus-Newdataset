import { createUser, deleteUserWithCleanup, getUserById, listUsers, updateUser } from '../../repositories/user.repo.js';
import { listTransactions } from '../../repositories/transaction.repo.js';
import { listDeposits } from '../../repositories/deposit.repo.js';
import { findWithdrawById, listWithdraws, updateWithdraw } from '../../repositories/withdraw.repo.js';
import { getBotSettings, getDiscountSetting, getMarkupSetting, getSetting, setBotSettings, setDiscountSetting, setMarkupSetting, setSetting } from '../../repositories/settings.repo.js';
import { createNotification, deleteNotification, listNotifications, updateNotification } from '../../repositories/notification.repo.js';
import env from '../../config/env.js';
import { query } from '../../config/db.js';
import { setSaldo } from '../../services/wallet.service.js';
import { getSaldoUtama } from '../../services/wallet.service.js';
import { premkuProfile } from '../../services/premku.service.js';
import { clearCache, getCache, setCache } from '../../services/cache.service.js';
import { requireFields } from '../../utils/validator.js';
import { getUserBotSettings, updateUserBotSettings } from '../bot/bot.service.js';

const ORDER_HISTORY_FILTER = `
  COALESCE(transaction_type, 'order') = 'order'
  AND product_id IS NOT NULL
  AND LOWER(COALESCE(product_name, '')) NOT IN ('qris payment', 'deposit saldo', 'topup saldo', 'top up saldo')
  AND LOWER(COALESCE(channel, '')) NOT IN ('deposit', 'qris', 'payment')
`;

export async function users(_req, res) {
  res.json({ status: true, data: await listUsers() });
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
      COALESCE(SUM(total_price), 0) AS total_revenue,
      COALESCE(SUM(profit), 0) AS system_profit
     FROM transactions
     WHERE status IN ('processing', 'success')
       AND ${ORDER_HISTORY_FILTER}`,
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
      system_profit: Number(transactionRows?.system_profit || 0),
      pending_withdraw_count: Number(withdrawRows?.pending_withdraw_count || 0),
      pending_withdraw: Number(withdrawRows?.pending_withdraw || 0),
      recent_orders: recentOrders,
      pending_payments: pendingPayments,
      recent_users: recentUsers,
    },
  };
  setCache('admin-summary', response, 10 * 1000);
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
    const initialSaldo = Number(req.body.saldo || 0);
    if (!Number.isFinite(initialSaldo) || initialSaldo < 0) {
      return res.status(400).json({ status: false, message: 'Saldo awal tidak valid' });
    }

    const data = await createUser(req.body);
    if (Number.isFinite(initialSaldo) && initialSaldo > 0) {
      await setSaldo(data, initialSaldo, `admin-user-${data.id}-initial-saldo`);
      data.saldo = initialSaldo;
    }
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
      await setSaldo(data, req.body.saldo, `admin-user-${data.id}-saldo-adjustment`);
      data.saldo = Number(req.body.saldo);
    }

    res.json({ status: true, data: { ...data, password: undefined } });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: false,
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

export async function transactions(_req, res) {
  res.json({ status: true, data: await listTransactions() });
}

export async function deposits(_req, res) {
  res.json({ status: true, data: await listDeposits() });
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

    const user = await getUserById(data.user_id);
    if (!user) {
      return res.status(404).json({ status: false, message: 'User tidak ditemukan' });
    }

    const previousSaldo = getSaldoUtama(user);
    const nextSaldo = previousSaldo - Number(data.amount || 0);

    await setSaldo(user, nextSaldo, `withdraw-${data.id}-approve`);
    const updated = await updateWithdraw(data.id, { status: 'approved' });
    if (!updated) {
      await setSaldo(user, previousSaldo, `withdraw-${data.id}-rollback`);
      return res.status(500).json({ status: false, message: 'Withdraw gagal diproses' });
    }

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
