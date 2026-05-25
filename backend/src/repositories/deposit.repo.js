import { execute, query, parseDbJson } from '../config/db.js';

function toDeposit(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    invoice: row.invoice,
    amount: Number(row.amount || 0),
    total_bayar: Number(row.total_bayar || 0),
    status: row.status,
    qr_data: null,
    qr_image: null,
    external_response: parseDbJson(row.external_response, null),
    external_status_response: parseDbJson(row.external_status_response, null),
    processed_at: row.processed_at || null,
    expired_at: row.expired_at || null,
    canceled_at: row.canceled_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getDepositRow(invoice) {
  const rows = await query(
    `SELECT id, user_id, invoice, amount, total_bayar, status, qr_data, qr_image, external_response,
            external_status_response, processed_at, expired_at, canceled_at, created_at, updated_at
     FROM deposits WHERE invoice = ? LIMIT 1`,
    [invoice],
  );
  return rows[0] || null;
}

export async function createDeposit(payload) {
  await execute(
    `INSERT INTO deposits
      (user_id, invoice, amount, total_bayar, status, qr_data, qr_image, external_response, expired_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.user_id,
      payload.invoice,
      Number(payload.amount || 0),
      Number(payload.total_bayar || payload.amount || 0),
      payload.status || 'pending',
      null,
      null,
      JSON.stringify(payload.external_response ?? null),
      payload.expired_at || null,
    ],
  );

  return findDepositByInvoice(payload.invoice);
}

function normalizePagination({ limit = 50, page = 1 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit || 50), 1), 100);
  const safePage = Math.max(Number(page || 1), 1);
  return { limit: safeLimit, offset: (safePage - 1) * safeLimit };
}

export async function listDeposits(options = {}) {
  const { limit, offset } = normalizePagination(options);
  const rows = await query(
    `SELECT id, user_id, invoice, amount, total_bayar, status, NULL AS qr_data, NULL AS qr_image,
            NULL AS external_response, NULL AS external_status_response, processed_at, expired_at,
            canceled_at, created_at, updated_at
     FROM deposits ORDER BY id DESC LIMIT ? OFFSET ?`,
    [limit, offset],
  );
  return rows.map(toDeposit);
}

export async function listDepositsByUser(userId, options = {}) {
  const { limit, offset } = normalizePagination(options);
  const rows = await query(
    `SELECT id, user_id, invoice, amount, total_bayar, status, NULL AS qr_data, NULL AS qr_image,
            NULL AS external_response, NULL AS external_status_response, processed_at, expired_at,
            canceled_at, created_at, updated_at
     FROM deposits WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`,
    [Number(userId), limit, offset],
  );
  return rows.map(toDeposit);
}

export async function findDepositByInvoice(invoice) {
  const row = await getDepositRow(invoice);
  return toDeposit(row);
}

export async function updateDeposit(invoice, payload) {
  const current = await getDepositRow(invoice);
  if (!current) return null;

  await execute(
    `UPDATE deposits
     SET status = ?, qr_data = NULL, qr_image = NULL, external_response = ?, external_status_response = ?, processed_at = ?, expired_at = ?, canceled_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE invoice = ? AND processed_at IS NULL AND status <> 'success'`,
    [
      payload.status || current.status,
      JSON.stringify(payload.external_response ?? parseDbJson(current.external_response, null)),
      JSON.stringify(payload.external_status_response ?? parseDbJson(current.external_status_response, null)),
      payload.processed_at || current.processed_at || null,
      payload.expired_at || current.expired_at || null,
      payload.canceled_at || current.canceled_at || null,
      invoice,
    ],
  );

  return findDepositByInvoice(invoice);
}
