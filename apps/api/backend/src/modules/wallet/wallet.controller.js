import { query } from '../../config/db.js';
import { listSaldoLogsByUser } from '../../repositories/wallet.repo.js';
import { listUsers, regenerateUserApiKey, updateUser } from '../../repositories/user.repo.js';
import { deleteCachePrefix, remember } from '../../services/cache.service.js';

export function me(req, res) {
  res.json({
    status: true,
    data: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email || '',
      phone: req.user.phone || '',
      saldo: Number(req.user.saldo || 0),
      locked_balance: Number(req.user.locked_balance || 0),
      usable_balance: Math.max(Number(req.user.saldo || 0) - Number(req.user.locked_balance || 0), 0),
      bot_access_unlocked: Boolean(req.user.bot_access_unlocked),
      bot_disabled_reason: req.user.bot_disabled_reason || '',
      reseller_request_status: req.user.reseller_request_status || 'none',
      role: req.user.role,
      api_key: req.user.api_key,
      markup_percent: Number(req.user.reseller_margin_percent ?? req.user.markup_percent ?? req.user.markup_custom ?? 0),
      reseller_margin_percent: Number(req.user.reseller_margin_percent ?? req.user.markup_percent ?? req.user.markup_custom ?? 0),
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
    const requestedMarkup = req.body?.reseller_margin_percent ?? req.body?.markup_percent;
    if (requestedMarkup !== undefined) {
      if (!['admin', 'reseller'].includes(req.user.role)) {
        return res.status(403).json({ status: false, message: 'Markup pribadi hanya untuk reseller' });
      }
      const markup = Number(requestedMarkup);
      if (!Number.isFinite(markup) || markup < 0 || markup > 100) {
        return res.status(400).json({ status: false, message: 'Markup pribadi tidak valid' });
      }
      payload.markup_percent = markup;
      payload.markup_custom = markup;
      payload.reseller_margin_percent = markup;
    }

    const data = await updateUser(req.user.id, payload);
    deleteCachePrefix(`dashboard:user:${req.user.id}`);
    deleteCachePrefix(`bot:catalog:user:${req.user.id}`);
    deleteCachePrefix('leaderboard:');
    deleteCachePrefix('admin:users');
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}

export function saldo(req, res) {
  res.json({
    status: true,
    saldo: Number(req.user.saldo || 0),
    locked_balance: Number(req.user.locked_balance || 0),
    usable_balance: Math.max(Number(req.user.saldo || 0) - Number(req.user.locked_balance || 0), 0),
  });
}

export function myApiKey(req, res) {
  res.json({
    status: true,
    data: {
      api_key: req.user.api_key,
    },
  });
}

export async function regenerateMyApiKey(req, res, next) {
  try {
    const data = await regenerateUserApiKey(req.user.id);
    if (!data) return res.status(404).json({ status: false, message: 'User tidak ditemukan' });
    deleteCachePrefix(`dashboard:user:${req.user.id}`);
    deleteCachePrefix(`bot:catalog:user:${req.user.id}`);
    deleteCachePrefix('admin:users');
    return res.json({ status: true, data: { api_key: data.api_key } });
  } catch (error) {
    return next(error);
  }
}

const ORDER_TRANSACTION_FILTER = `
  transaction_type = 'order'
  AND (product_id IS NOT NULL OR invoice LIKE 'ORD%')
  AND LOWER(COALESCE(product_name, '')) NOT LIKE '%deposit%'
  AND LOWER(COALESCE(product_name, '')) NOT LIKE '%qris payment%'
`;

function formatLocalDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDay(value) {
  if (value instanceof Date) {
    return formatLocalDate(value);
  }
  return String(value || '').slice(0, 10);
}

function recentDayLabels(length = 10) {
  return Array.from({ length }, (_, index) => {
    const day = new Date();
    day.setDate(day.getDate() - (length - 1 - index));
    return formatLocalDate(day);
  });
}

function buildDailySeries(rows, valueKey, length = 10) {
  const byDay = new Map(rows.map((row) => [normalizeDay(row.day), Number(row[valueKey] || 0)]));
  return recentDayLabels(length).map((day) => byDay.get(day) || 0);
}

async function listTopAccounts(limit = 10) {
  const users = await remember('leaderboard:accounts', 30, () => listUsers());
  const rows = users
    .filter((user) => ['reseller'].includes(String(user.role || '').toLowerCase()))
    .filter((user) => !['suspended', 'blocked', 'deleted'].includes(String(user.status || '').toLowerCase()))
    .sort((left, right) => Number(right.saldo || 0) - Number(left.saldo || 0) || Number(left.id || 0) - Number(right.id || 0))
    .slice(0, Number(limit) || 10);

  return rows.map((row, index) => ({
    rank: index + 1,
    id: Number(row.id),
    username: row.username,
    role: row.role === 'admin' ? 'admin' : 'reseller',
    saldo: Number(row.saldo || 0),
  }));
}

export async function saldoLogs(req, res) {
  res.json({
    status: true,
    data: await listSaldoLogsByUser(req.user.id),
  });
}

export async function topAccounts(_req, res) {
  res.json({
    status: true,
    data: await remember('leaderboard:top10', 30, () => listTopAccounts(10)),
  });
}

export async function dashboardSummary(req, res) {
  const userId = Number(req.user.id);
  const data = await remember(`dashboard:user:${userId}`, 10, async () => {
    const [transactionRows] = await query(
      `SELECT
        COUNT(*) AS total_transactions,
        COALESCE(SUM(CASE WHEN status NOT IN ('failed', 'refunded') THEN total_price ELSE 0 END), 0) AS total_spent
       FROM transactions
       WHERE user_id = ?
         AND ${ORDER_TRANSACTION_FILTER}`,
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
       FROM saldo_logs
       WHERE user_id = ? AND type IN ('credit', 'refund', 'adjustment')`,
      [userId],
    );
    const [saldoOutRows] = await query(
      `SELECT COALESCE(SUM(amount), 0) AS saldo_keluar
       FROM saldo_logs
       WHERE user_id = ? AND type = 'debit'`,
      [userId],
    );
    const [botLedgerRows] = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN mutation_type = 'bot_payment_in' THEN amount ELSE 0 END), 0) AS bot_payment_in,
         COALESCE(SUM(CASE WHEN mutation_type = 'bot_order_cost' THEN amount ELSE 0 END), 0) AS bot_order_cost,
         COALESCE(SUM(CASE WHEN mutation_type = 'bot_payment_in' THEN amount ELSE 0 END), 0)
           - COALESCE(SUM(CASE WHEN mutation_type = 'bot_order_cost' THEN amount ELSE 0 END), 0) AS bot_profit
       FROM saldo_mutations
       WHERE user_id = ?`,
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
    const depositChartRows = await query(
      `SELECT DATE(created_at) AS day, COALESCE(SUM(amount), 0) AS total
       FROM deposits
       WHERE user_id = ?
         AND status = 'success'
         AND created_at >= DATE_SUB(CURDATE(), INTERVAL 9 DAY)
       GROUP BY DATE(created_at)
       ORDER BY day ASC`,
      [userId],
    );
    const spendingChartRows = await query(
      `SELECT DATE(created_at) AS day, COALESCE(SUM(total_price), 0) AS total
       FROM transactions
       WHERE user_id = ?
         AND ${ORDER_TRANSACTION_FILTER}
         AND status NOT IN ('failed', 'refunded')
         AND created_at >= DATE_SUB(CURDATE(), INTERVAL 9 DAY)
       GROUP BY DATE(created_at)
       ORDER BY day ASC`,
      [userId],
    );
    const orderChartRows = await query(
      `SELECT DATE(created_at) AS day, COUNT(*) AS total
       FROM transactions
       WHERE user_id = ?
         AND ${ORDER_TRANSACTION_FILTER}
         AND created_at >= DATE_SUB(CURDATE(), INTERVAL 9 DAY)
       GROUP BY DATE(created_at)
       ORDER BY day ASC`,
      [userId],
    );
    const [productRows] = await query(
      `SELECT COUNT(*) AS active_products
       FROM products
       WHERE status IN ('active', 'Aktif', 'ready')`,
    );
    const productStockRows = await query(
      `SELECT stock
       FROM products
       WHERE status IN ('active', 'Aktif', 'ready')
       ORDER BY id DESC
       LIMIT 10`,
    );
    const topAccountRows = await remember('leaderboard:top10', 30, () => listTopAccounts(10));
    const recentTransactions = await query(
      `SELECT invoice, transaction_type, amount, total_price, status, description, created_at
       FROM transactions
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT 8`,
      [userId],
    );
    const bestProducts = await query(
      `SELECT product_name, COUNT(*) AS sold, COALESCE(SUM(total_price), 0) AS total
       FROM transactions
       WHERE user_id = ?
         AND ${ORDER_TRANSACTION_FILTER}
         AND status = 'success'
       GROUP BY product_name
       ORDER BY sold DESC, total DESC
       LIMIT 6`,
      [userId],
    );

    const activeProducts = Number(productRows?.active_products || 0);
    const productStockSeries = productStockRows.map((row) => Number(row.stock || 0)).reverse();

    return {
      total_transactions: Number(transactionRows?.total_transactions || 0),
      total_spent: Number(transactionRows?.total_spent || 0),
      total_deposits: Number(depositRows?.total_deposits || 0),
      total_deposit_amount: Number(depositRows?.total_deposit_amount || 0),
      saldo_masuk: Number(saldoInRows?.saldo_masuk || 0),
      saldo_keluar: Number(saldoOutRows?.saldo_keluar || 0),
      bot_ledger: {
        total_masuk: Number(botLedgerRows?.bot_payment_in || 0),
        total_keluar: Number(botLedgerRows?.bot_order_cost || 0),
        profit: Number(botLedgerRows?.bot_profit || 0),
      },
      last_deposit: lastDepositRows || null,
      active_products: activeProducts,
      charts: {
        deposits: buildDailySeries(depositChartRows, 'total'),
        spending: buildDailySeries(spendingChartRows, 'total'),
        orders: buildDailySeries(orderChartRows, 'total'),
        products: productStockSeries.length ? productStockSeries : [activeProducts],
      },
      chart: recentDayLabels(10).map((date, index) => ({
        date,
        total: Number(buildDailySeries(spendingChartRows, 'total')[index] || 0),
      })),
      recent_transactions: recentTransactions.map((row) => ({
        invoice: row.invoice,
        type: row.transaction_type,
        amount: Number(row.amount || row.total_price || 0),
        status: row.status,
        description: row.description || '',
        created_at: row.created_at,
      })),
      best_products: bestProducts.map((row) => ({
        product: row.product_name || 'Produk digital',
        sold: Number(row.sold || 0),
        total: Number(row.total || 0),
      })),
      top_accounts: topAccountRows,
    };
  });
  const saldoValue = Number(req.user.saldo || 0);
  const lockedBalance = Number(req.user.locked_balance || 0);
  const usableBalance = Math.max(saldoValue - lockedBalance, 0);

  res.json({
    status: true,
    success: true,
    data: {
      ...data,
      saldo: saldoValue,
      locked_balance: lockedBalance,
      usable_balance: usableBalance,
      total_deposit: Number(data.total_deposit_amount || 0),
      total_belanja: Number(data.total_spent || 0),
      total_transaksi: Number(data.total_transactions || 0),
    },
  });
}
