import { query } from '../../config/db.js';
import { getSaldoMutationSummaryByUser, listSaldoLogsByUser } from '../../repositories/wallet.repo.js';
import { updateUser } from '../../repositories/user.repo.js';
import { getCache, setCache } from '../../services/cache.service.js';
import { getLockedBalance, getSaldoUtama, getUsableBalance } from '../../services/wallet.service.js';
import env from '../../config/env.js';

const ORDER_HISTORY_FILTER = `
  COALESCE(transaction_type, 'order') = 'order'
  AND product_id IS NOT NULL
  AND LOWER(COALESCE(product_name, '')) NOT IN ('qris payment', 'deposit saldo', 'topup saldo', 'top up saldo')
  AND LOWER(COALESCE(channel, '')) NOT IN ('deposit', 'qris', 'payment')
`;

const USER_ORDER_AMOUNT = `
  COALESCE(
    NULLIF(total_price, 0),
    NULLIF(price_sell * qty, 0),
    NULLIF(final_amount, 0),
    NULLIF(payment_amount, 0),
    NULLIF(amount, 0),
    0
  )
`;

const TOP_USER_ORDER_AMOUNT = `
  COALESCE(
    NULLIF(t.total_price, 0),
    NULLIF(t.price_sell * t.qty, 0),
    NULLIF(t.final_amount, 0),
    NULLIF(t.payment_amount, 0),
    NULLIF(t.amount, 0),
    0
  )
`;

export function me(req, res) {
  const saldoUtama = getSaldoUtama(req.user);
  const lockedBalance = getLockedBalance(req.user);
  const usableBalance = getUsableBalance(req.user);
  res.json({
    status: true,
    data: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email || '',
      saldo_utama: saldoUtama,
      saldo: saldoUtama,
      locked_balance: lockedBalance,
      usable_balance: usableBalance,
      role: req.user.role,
      api_key: req.user.api_key,
      markup_percent: Number(req.user.markup_percent ?? req.user.markup_custom ?? 0),
      theme: req.user.theme || 'dark',
    },
  });
}

export async function updateMyPreferences(req, res, next) {
  try {
    const payload = {};
    if (req.body?.theme !== undefined) {
      payload.theme = req.body.theme === 'light' ? 'light' : 'dark';
    }
    if (req.body?.markup_percent !== undefined) {
      if (!['admin', 'reseller'].includes(req.user.role)) {
        return res.status(403).json({ status: false, message: 'Markup pribadi hanya untuk reseller' });
      }
      const markup = Number(req.body.markup_percent);
      if (!Number.isFinite(markup) || markup < 0 || markup > 100) {
        return res.status(400).json({ status: false, message: 'Markup pribadi tidak valid' });
      }
      payload.markup_percent = markup;
      payload.markup_custom = markup;
    }

    const data = await updateUser(req.user.id, payload);
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}

export function saldo(req, res) {
  const saldoUtama = getSaldoUtama(req.user);
  const lockedBalance = getLockedBalance(req.user);
  const usableBalance = getUsableBalance(req.user);
  res.json({
    status: true,
    saldo_utama: saldoUtama,
    saldo: saldoUtama,
    locked_balance: lockedBalance,
    usable_balance: usableBalance,
  });
}

export async function saldoLogs(req, res) {
  const [data, summary] = await Promise.all([
    listSaldoLogsByUser(req.user.id),
    getSaldoMutationSummaryByUser(req.user.id),
  ]);
  res.json({
    status: true,
    data,
    summary,
  });
}

export async function dashboardSummary(req, res) {
  const userId = Number(req.user.id);
  const saldoUtama = getSaldoUtama(req.user);
  const lockedBalance = getLockedBalance(req.user);
  const usableBalance = getUsableBalance(req.user);
  const cacheKey = `dashboard-summary:${userId}:${saldoUtama}:${req.user.locked_balance}`;
  const cached = getCache(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const [transactionRows] = await query(
    `SELECT
      COUNT(*) AS total_transactions,
      COALESCE(SUM(${USER_ORDER_AMOUNT}), 0) AS total_spent,
      COALESCE(SUM(${USER_ORDER_AMOUNT}), 0) AS total_revenue,
      COALESCE(SUM(user_profit), 0) AS total_income,
      COALESCE(SUM(admin_profit), 0) AS platform_profit
     FROM transactions
     WHERE user_id = ?
       AND status IN ('processing', 'success')
       AND ${ORDER_HISTORY_FILTER}`,
    [userId],
  );
  const [profitTodayRows] = await query(
    `SELECT COALESCE(SUM(user_profit), 0) AS profit_today
     FROM transactions
     WHERE user_id = ?
       AND status IN ('processing', 'success')
       AND DATE(created_at) = CURRENT_DATE()
       AND ${ORDER_HISTORY_FILTER}`,
    [userId],
  );
  const [profitMonthRows] = await query(
    `SELECT COALESCE(SUM(user_profit), 0) AS profit_month
     FROM transactions
     WHERE user_id = ?
       AND status IN ('processing', 'success')
       AND YEAR(created_at) = YEAR(CURRENT_DATE())
       AND MONTH(created_at) = MONTH(CURRENT_DATE())
       AND ${ORDER_HISTORY_FILTER}`,
    [userId],
  );
  const [depositRows] = await query(
    `SELECT
      COUNT(*) AS total_deposits,
      COALESCE(SUM(amount), 0) AS total_deposit_amount
     FROM deposits
     WHERE user_id = ? AND status = 'success'`,
    [userId],
  );
  const [saldoInRows] = await query(
    `SELECT COALESCE(SUM(amount), 0) AS saldo_masuk
     FROM saldo_mutations
     WHERE user_id = ? AND mutation_type IN ('deposit', 'payment_in', 'refund', 'adjustment')`,
    [userId],
  );
  const [saldoOutRows] = await query(
    `SELECT COALESCE(SUM(amount), 0) AS saldo_keluar
     FROM saldo_mutations
     WHERE user_id = ? AND mutation_type IN ('provider_purchase', 'order', 'withdraw')`,
    [userId],
  );
  const [incomeRows] = await query(
    `SELECT COALESCE(SUM(amount), 0) AS profit_income
     FROM saldo_mutations
     WHERE user_id = ? AND mutation_type IN ('profit_income', 'bot_profit')`,
    [userId],
  );
  const [lastDepositRows] = await query(
    `SELECT invoice, amount, total_bayar, status, created_at, processed_at
     FROM deposits
     WHERE user_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [userId],
  );
  const [productRows] = await query(
    `SELECT COUNT(*) AS active_products
     FROM products
     WHERE status IN ('active', 'Aktif', 'ready')`,
  );
  const topUsers = await query(
    `SELECT
      u.id AS user_id,
      u.username,
      COUNT(t.id) AS total_orders,
      COALESCE(SUM(${TOP_USER_ORDER_AMOUNT}), 0) AS total_sales
     FROM transactions t
     JOIN users u ON u.id = t.user_id
     WHERE t.status IN ('processing', 'success')
       AND COALESCE(t.transaction_type, 'order') = 'order'
       AND t.product_id IS NOT NULL
       AND LOWER(COALESCE(t.product_name, '')) NOT IN ('qris payment', 'deposit saldo', 'topup saldo', 'top up saldo')
       AND LOWER(COALESCE(t.channel, '')) NOT IN ('deposit', 'qris', 'payment')
     GROUP BY u.id, u.username
     ORDER BY total_sales DESC, total_orders DESC, u.id ASC
     LIMIT 10`,
  );

  const response = {
    status: true,
    data: {
      saldo_utama: saldoUtama,
      saldo: saldoUtama,
      locked_balance: lockedBalance,
      usable_balance: usableBalance,
      total_transactions: Number(transactionRows?.total_transactions || 0),
      total_spent: Number(transactionRows?.total_spent || 0),
      total_revenue: Number(transactionRows?.total_revenue || 0),
      total_income: Number(transactionRows?.total_income || 0),
      platform_profit: Number(transactionRows?.platform_profit || 0),
      profit_today: Number(profitTodayRows?.profit_today || 0),
      profit_month: Number(profitMonthRows?.profit_month || 0),
      total_deposits: Number(depositRows?.total_deposits || 0),
      total_deposit_amount: Number(depositRows?.total_deposit_amount || 0),
      saldo_masuk: Number(saldoInRows?.saldo_masuk || 0),
      saldo_keluar: Number(saldoOutRows?.saldo_keluar || 0),
      profit_income: Number(incomeRows?.profit_income || 0),
      last_deposit: lastDepositRows || null,
      active_products: Number(productRows?.active_products || 0),
      top_users: topUsers.map((row) => ({
        user_id: Number(row.user_id || 0),
        username: row.username || 'User',
        total_orders: Number(row.total_orders || 0),
        total_sales: Number(row.total_sales || 0),
      })),
    },
  };
  setCache(cacheKey, response, env.DASHBOARD_CACHE_MS);
  return res.json(response);
}
