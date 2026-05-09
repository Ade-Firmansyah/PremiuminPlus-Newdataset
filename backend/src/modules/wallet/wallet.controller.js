import { query } from '../../config/db.js';
import { listSaldoLogsByUser } from '../../repositories/wallet.repo.js';
import { listUsers, updateUser } from '../../repositories/user.repo.js';
import { deleteCachePrefix, remember } from '../../services/cache.service.js';

export function me(req, res) {
  res.json({
    status: true,
    data: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email || '',
      saldo: Number(req.user.saldo || 0),
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
      if (!['admin', 'reseller', 'member'].includes(req.user.role)) {
        return res.status(403).json({ status: false, message: 'Markup pribadi hanya untuk anggota dan reseller' });
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
  });
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
    .filter((user) => ['member', 'reseller'].includes(String(user.role || '').toLowerCase()))
    .filter((user) => !['suspended', 'blocked', 'deleted'].includes(String(user.status || '').toLowerCase()))
    .sort((left, right) => Number(right.saldo || 0) - Number(left.saldo || 0) || Number(left.id || 0) - Number(right.id || 0))
    .slice(0, Number(limit) || 10);

  return rows.map((row, index) => ({
    rank: index + 1,
    id: Number(row.id),
    username: row.username,
    role: row.role === 'reseller' ? 'reseller' : 'member',
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
  const data = await remember(`dashboard:user:${userId}`, 30, async () => {
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

    const activeProducts = Number(productRows?.active_products || 0);
    const productStockSeries = productStockRows.map((row) => Number(row.stock || 0)).reverse();

    return {
      total_transactions: Number(transactionRows?.total_transactions || 0),
      total_spent: Number(transactionRows?.total_spent || 0),
      total_deposits: Number(depositRows?.total_deposits || 0),
      total_deposit_amount: Number(depositRows?.total_deposit_amount || 0),
      saldo_masuk: Number(saldoInRows?.saldo_masuk || 0),
      saldo_keluar: Number(saldoOutRows?.saldo_keluar || 0),
      last_deposit: lastDepositRows || null,
      active_products: activeProducts,
      charts: {
        deposits: buildDailySeries(depositChartRows, 'total'),
        spending: buildDailySeries(spendingChartRows, 'total'),
        orders: buildDailySeries(orderChartRows, 'total'),
        products: productStockSeries.length ? productStockSeries : [activeProducts],
      },
      top_accounts: topAccountRows,
    };
  });

  res.json({
    status: true,
    data: {
      ...data,
      saldo: Number(req.user.saldo || 0),
    },
  });
}
