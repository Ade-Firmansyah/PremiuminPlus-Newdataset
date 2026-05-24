import { execute, query, transaction } from '../config/db.js';
import { parseDbJson } from '../config/db.js';
import { getSaldoUtama } from '../services/wallet.service.js';
import { toMysqlDate } from '../utils/date.js';

function toTransaction(row) {
  if (!row) return null;
  const accountData = parseDbJson(row.account_data, null);
  const accounts = Array.isArray(accountData)
    ? accountData
    : Array.isArray(parseDbJson(row.accounts, []))
      ? parseDbJson(row.accounts, [])
      : [];

  return {
    id: row.id,
    invoice: row.invoice,
    ref_id: row.ref_id,
    user_id: row.user_id,
    product_id: row.product_id,
    transaction_type: row.transaction_type || 'order',
    amount: Number(row.amount || row.total_price || 0),
    product_name: row.product_name,
    qty: Number(row.qty || 0),
    price_base: Number(row.price_base || 0),
    price_sell: Number(row.price_sell || 0),
    total_price: Number(row.total_price || 0),
    profit: Number(row.profit || 0),
    provider_price: Number(row.provider_price || row.price_base || 0),
    user_markup: Number(row.user_markup || 0),
    admin_markup: Number(row.admin_markup || 0),
    final_price: Number(row.final_price || row.total_price || 0),
    reseller_profit: Number(row.reseller_profit || 0),
    platform_profit: Number(row.platform_profit || 0),
    gross_amount: Number(row.gross_amount || row.total_price || 0),
    provider_cost: Number(row.provider_cost || row.provider_price || row.price_base || 0),
    user_profit: Number(row.user_profit || row.user_markup || row.reseller_profit || 0),
    admin_profit: Number(row.admin_profit || row.platform_profit || 0),
    final_amount: Number(row.final_amount || row.final_price || row.total_price || 0),
    payment_amount: Number(row.payment_amount || row.amount || row.total_price || 0),
    net_amount: Number(row.net_amount || 0),
    role_price: Number(row.role_price || row.provider_cost || row.price_sell || 0),
    bot_markup: Number(row.bot_markup || row.user_markup || 0),
    bot_markup_profit: Number(row.bot_markup_profit || row.bot_markup || row.user_profit || row.user_markup || 0),
    gross_income: Number(row.gross_income || row.gross_amount || row.total_price || 0),
    net_profit: Number(row.net_profit || row.user_profit || row.user_markup || 0),
    status: row.status,
    account_data: Array.isArray(accountData) ? null : accountData,
    accounts,
    external_order_response: parseDbJson(row.external_order_response, null),
    external_status_response: parseDbJson(row.external_status_response, null),
    refund_at: row.refund_at || null,
    processed_at: row.processed_at || null,
    product_image: row.product_image || null,
    description: row.description || '',
    channel: row.channel || 'website',
    idempotency_key: row.idempotency_key || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const ORDER_HISTORY_WHERE = `
  COALESCE(transaction_type, 'order') = 'order'
  AND product_id IS NOT NULL
  AND LOWER(COALESCE(product_name, '')) NOT IN ('qris payment', 'deposit saldo', 'topup saldo', 'top up saldo')
  AND LOWER(COALESCE(channel, '')) NOT IN ('deposit', 'qris', 'payment')
`;

async function getTransactionRow(invoice) {
  const rows = await query('SELECT * FROM transactions WHERE invoice = ? LIMIT 1', [invoice]);
  return rows[0] || null;
}

export async function createTransaction(payload) {
  const result = await execute(
    `INSERT INTO transactions
      (invoice, ref_id, idempotency_key, user_id, product_id, product_name, qty, price_base, price_sell, total_price, profit, provider_price, user_markup, admin_markup, final_price, reseller_profit, platform_profit, gross_amount, provider_cost, user_profit, admin_profit, final_amount, payment_amount, net_amount, role_price, bot_markup, bot_markup_profit, gross_income, net_profit, status, account_data, channel, product_image, description, transaction_type, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
    [
      payload.invoice,
      payload.ref_id || null,
      payload.idempotency_key || payload.invoice,
      payload.user_id,
      payload.product_id || null,
      payload.product_name || null,
      Number(payload.qty || 1),
      Number(payload.price_base || 0),
      Number(payload.price_sell || 0),
      Number(payload.total_price || 0),
      Number(payload.profit || 0),
      Number(payload.provider_price ?? payload.price_base ?? 0),
      Number(payload.user_markup || 0),
      Number(payload.admin_markup || 0),
      Number(payload.final_price ?? payload.total_price ?? 0),
      Number(payload.reseller_profit || 0),
      Number(payload.platform_profit || 0),
      Number(payload.gross_amount ?? payload.total_price ?? 0),
      Number(payload.provider_cost ?? payload.provider_price ?? payload.price_base ?? 0),
      Number(payload.user_profit ?? payload.user_markup ?? payload.reseller_profit ?? 0),
      Number(payload.admin_profit ?? payload.platform_profit ?? 0),
      Number(payload.final_amount ?? payload.final_price ?? payload.total_price ?? 0),
      Number(payload.payment_amount ?? payload.amount ?? payload.total_price ?? 0),
      Number(payload.net_amount ?? 0),
      Number(payload.role_price ?? payload.provider_cost ?? payload.price_sell ?? 0),
      Number(payload.bot_markup ?? payload.user_markup ?? 0),
      Number(payload.bot_markup_profit ?? payload.bot_markup ?? payload.user_profit ?? payload.user_markup ?? 0),
      Number(payload.gross_income ?? payload.gross_amount ?? payload.total_price ?? 0),
      Number(payload.net_profit ?? payload.user_profit ?? payload.user_markup ?? 0),
      payload.status || 'pending',
      JSON.stringify(payload.account_data ?? null),
      payload.channel || 'website',
      payload.product_image || null,
      payload.description || '',
      payload.transaction_type || 'order',
      Number(payload.amount ?? payload.total_price ?? 0),
    ],
  );

  return findTransactionByInvoice(payload.invoice);
}

export async function listTransactions() {
  const rows = await query(
    `SELECT * FROM transactions WHERE ${ORDER_HISTORY_WHERE} ORDER BY id DESC`,
  );
  return rows.map(toTransaction);
}

export async function listTransactionsByUser(userId) {
  const rows = await query(
    `SELECT * FROM transactions WHERE user_id = ? AND ${ORDER_HISTORY_WHERE} ORDER BY id DESC`,
    [Number(userId)],
  );
  return rows.map(toTransaction);
}

export async function findTransactionByInvoice(invoice) {
  const row = await getTransactionRow(invoice);
  return toTransaction(row);
}

export async function updateTransactionStatus(invoice, status, extra = {}) {
  const current = await getTransactionRow(invoice);
  if (!current) return null;

  const accountData = extra.account_data !== undefined ? extra.account_data : parseDbJson(current.account_data, null);
  const externalOrderResponse = extra.external_order_response !== undefined ? extra.external_order_response : parseDbJson(current.external_order_response, null);
  const externalStatusResponse =
    extra.external_status_response !== undefined
      ? extra.external_status_response
      : extra.external_response !== undefined
        ? extra.external_response
        : parseDbJson(current.external_status_response, null);

  await execute(
    `UPDATE transactions
     SET status = ?, account_data = ?, external_order_response = ?, external_status_response = ?, refund_at = ?, processed_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE invoice = ?`,
    [
      status,
      JSON.stringify(accountData ?? null),
      JSON.stringify(externalOrderResponse ?? null),
      JSON.stringify(externalStatusResponse ?? null),
      extra.refund_at || current.refund_at || null,
      extra.processed_at || current.processed_at || null,
      invoice,
    ],
  );

  return findTransactionByInvoice(invoice);
}

export async function refundTransaction(invoice, externalResponse = {}, notes = 'order-refund') {
  return transaction(async (connection) => {
    const [transactionRows] = await connection.query('SELECT * FROM transactions WHERE invoice = ? FOR UPDATE', [invoice]);
    const current = transactionRows[0];
    if (!current) return null;

    if (current.refund_at) {
      return toTransaction(current);
    }

    const [userRows] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [current.user_id]);
    const user = userRows[0];
    if (!user) {
      const error = new Error('User tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    const amount = Number(current.total_price || 0);
    const before = getSaldoUtama(user);
    const after = before + amount;
    const refundedAt = toMysqlDate();

    await connection.query('UPDATE users SET saldo_utama = ?, saldo = ? WHERE id = ?', [after, after, current.user_id]);
    await connection.query(
      `INSERT INTO saldo_logs
        (user_id, type, amount, balance_before, balance_after, reference, notes)
       VALUES (?, 'refund', ?, ?, ?, ?, ?)`,
      [current.user_id, amount, before, after, `${invoice}-refund`, notes],
    );
    await connection.query(
      `INSERT INTO saldo_mutations
        (user_id, mutation_type, amount, balance_before, balance_after, reference)
       VALUES (?, 'refund', ?, ?, ?, ?)`,
      [current.user_id, amount, before, after, `${invoice}-refund`],
    );
    await connection.query(
      `UPDATE transactions
       SET status = 'failed', external_status_response = ?, refund_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE invoice = ?`,
      [JSON.stringify(externalResponse ?? null), refundedAt, invoice],
    );

    const [updatedRows] = await connection.query('SELECT * FROM transactions WHERE invoice = ? LIMIT 1', [invoice]);
    return toTransaction(updatedRows[0] || current);
  });
}
