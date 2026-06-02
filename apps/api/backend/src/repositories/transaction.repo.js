import { execute, query, transaction } from '../config/db.js';
import { parseDbJson } from '../config/db.js';
import { deleteCachePrefix } from '../services/cache.service.js';
import { applyWalletMutationInTransaction } from '../services/wallet.service.js';

function toMysqlDate(value = new Date()) {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

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
    reseller_profit: Number(row.reseller_profit || 0),
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
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getTransactionRow(invoice) {
  const rows = await query('SELECT * FROM transactions WHERE invoice = ? LIMIT 1', [invoice]);
  return rows[0] || null;
}

export async function createTransaction(payload) {
  const result = await execute(
    `INSERT INTO transactions
      (invoice, ref_id, user_id, product_id, product_name, qty, price_base, price_sell, total_price, profit, reseller_profit, status, account_data, channel, product_image, description, transaction_type, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.invoice,
      payload.ref_id || null,
      payload.user_id,
      payload.product_id || null,
      payload.product_name || null,
      Number(payload.qty || 1),
      Number(payload.price_base || 0),
      Number(payload.price_sell || 0),
      Number(payload.total_price || 0),
      Number(payload.profit || 0),
      Number(payload.reseller_profit || 0),
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
  const rows = await query('SELECT * FROM transactions ORDER BY id DESC');
  return rows.map(toTransaction);
}

export async function listTransactionsByUser(userId) {
  const rows = await query('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC', [Number(userId)]);
  return rows.map(toTransaction);
}

export async function listOrderTransactionsByUser(userId) {
  const rows = await query(
    `SELECT *
     FROM transactions
     WHERE user_id = ?
       AND transaction_type = 'order'
       AND (product_id IS NOT NULL OR invoice LIKE 'ORD%')
       AND LOWER(COALESCE(product_name, '')) NOT LIKE '%deposit%'
       AND LOWER(COALESCE(product_name, '')) NOT LIKE '%qris payment%'
     ORDER BY id DESC`,
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

    const [refundRows] = await connection.query('SELECT id FROM transactions WHERE invoice = ? LIMIT 1', [`${invoice}-refund`]);
    if (refundRows[0]) {
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
    const refundedAt = toMysqlDate();

    const wallet = await applyWalletMutationInTransaction(connection, current.user_id, {
      mutation_type: 'refund',
      direction: 'in',
      amount,
      source_type: 'refund',
      source_ref: `${invoice}-refund`,
      notes,
    });
    await connection.query(
      `INSERT INTO transactions
        (invoice, ref_id, user_id, product_id, product_name, qty, price_base, price_sell, total_price, profit, reseller_profit, status, account_data, channel, product_image, description, transaction_type, amount, processed_at)
       VALUES (?, ?, ?, ?, ?, 1, 0, 0, ?, 0, 0, 'success', CAST(? AS JSON), 'refund', NULL, ?, 'refund', ?, ?)
       ON DUPLICATE KEY UPDATE status = 'success', processed_at = COALESCE(processed_at, VALUES(processed_at))`,
      [
        `${invoice}-refund`,
        invoice,
        current.user_id,
        current.product_id || null,
        current.product_name || 'Order Refund',
        amount,
        JSON.stringify({ refunded_invoice: invoice, balance_before: wallet.before, balance_after: wallet.after }),
        notes,
        amount,
        refundedAt,
      ],
    );
    await connection.query(
      `UPDATE transactions
       SET status = 'failed', external_status_response = ?, refund_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE invoice = ?`,
      [JSON.stringify(externalResponse ?? null), refundedAt, invoice],
    );

    const [updatedRows] = await connection.query('SELECT * FROM transactions WHERE invoice = ? LIMIT 1', [invoice]);
    const updated = toTransaction(updatedRows[0] || current);
    deleteCachePrefix(`dashboard:user:${current.user_id}`);
    deleteCachePrefix('leaderboard:');
    deleteCachePrefix('admin:summary');
    return updated;
  });
}
