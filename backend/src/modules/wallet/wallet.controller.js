import { query } from '../../config/db.js';
import { listSaldoLogsByUser } from '../../repositories/wallet.repo.js';
import { updateUser } from '../../repositories/user.repo.js';
import { getCache, setCache } from '../../services/cache.service.js';
import { getSaldoUtama } from '../../services/wallet.service.js';

const ORDER_HISTORY_FILTER = `
  COALESCE(transaction_type, 'order') = 'order'
  AND product_id IS NOT NULL
  AND LOWER(COALESCE(product_name, '')) NOT IN ('qris payment', 'deposit saldo', 'topup saldo', 'top up saldo')
  AND LOWER(COALESCE(channel, '')) NOT IN ('deposit', 'qris', 'payment')
`;

export function me(req, res) {
  const saldoUtama = getSaldoUtama(req.user);
  res.json({
    status: true,
    data: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email || '',
      saldo_utama: saldoUtama,
      saldo: saldoUtama,
      locked_balance: Number(req.user.locked_balance || 0),
      usable_balance: saldoUtama,
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
  res.json({
    status: true,
    saldo_utama: saldoUtama,
    saldo: saldoUtama,
    locked_balance: Number(req.user.locked_balance || 0),
    usable_balance: saldoUtama,
  });
}

export async function saldoLogs(req, res) {
  res.json({
    status: true,
    data: await listSaldoLogsByUser(req.user.id),
  });
}

export async function dashboardSummary(req, res) {
  const userId = Number(req.user.id);
  const saldoUtama = getSaldoUtama(req.user);
  const cacheKey = `dashboard-summary:${userId}:${saldoUtama}:${req.user.locked_balance}`;
  const cached = getCache(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const [transactionRows] = await query(
    `SELECT
      COUNT(*) AS total_transactions,
      COALESCE(SUM(total_price), 0) AS total_spent
     FROM transactions
     WHERE user_id = ?
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
      COALESCE(SUM(t.total_price), 0) AS total_sales
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
      locked_balance: Number(req.user.locked_balance || 0),
      usable_balance: saldoUtama,
      total_transactions: Number(transactionRows?.total_transactions || 0),
      total_spent: Number(transactionRows?.total_spent || 0),
      total_deposits: Number(depositRows?.total_deposits || 0),
      total_deposit_amount: Number(depositRows?.total_deposit_amount || 0),
      saldo_masuk: Number(saldoInRows?.saldo_masuk || 0),
      saldo_keluar: Number(saldoOutRows?.saldo_keluar || 0),
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
  setCache(cacheKey, response, 15 * 1000);
  return res.json(response);
}
