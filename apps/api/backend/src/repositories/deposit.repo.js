import { execute, query, parseDbJson } from '../config/db.js';

function toDeposit(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    invoice: row.invoice,
    provider_invoice: row.provider_invoice || null,
    amount: Number(row.amount || 0),
    total_bayar: Number(row.total_bayar || 0),
    payment_type: row.payment_type || 'deposit',
    status: row.status,
    qr_data: row.qr_data || null,
    qr_image: row.qr_image || null,
    qr_raw: row.qr_raw || null,
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
  const rows = await query('SELECT * FROM deposits WHERE invoice = ? LIMIT 1', [invoice]);
  return rows[0] || null;
}

export async function createDeposit(payload) {
  await execute(
    `INSERT INTO deposits
      (user_id, invoice, provider_invoice, amount, total_bayar, payment_type, status, qr_data, qr_image, qr_raw, external_response, expired_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.user_id,
      payload.invoice,
      payload.provider_invoice || payload.invoice,
      Number(payload.amount || 0),
      Number(payload.total_bayar || payload.amount || 0),
      payload.payment_type || 'deposit',
      payload.status || 'pending',
      payload.qr_data || null,
      payload.qr_image || null,
      payload.qr_raw || null,
      JSON.stringify(payload.external_response ?? null),
      payload.expired_at || null,
    ],
  );

  return findDepositByInvoice(payload.invoice);
}

export async function listDeposits() {
  const rows = await query('SELECT * FROM deposits ORDER BY id DESC');
  return rows.map(toDeposit);
}

export async function listDepositsByUser(userId) {
  const rows = await query('SELECT * FROM deposits WHERE user_id = ? ORDER BY id DESC', [Number(userId)]);
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
     SET status = ?, provider_invoice = ?, qr_data = ?, qr_image = ?, qr_raw = ?, external_response = ?, external_status_response = ?, processed_at = ?, expired_at = ?, canceled_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE invoice = ? AND processed_at IS NULL AND status <> 'success'`,
    [
      payload.status || current.status,
      payload.provider_invoice ?? current.provider_invoice ?? null,
      payload.clear_qr ? null : payload.qr_data !== undefined ? payload.qr_data : current.qr_data,
      payload.clear_qr ? null : payload.qr_image !== undefined ? payload.qr_image : current.qr_image,
      payload.clear_qr ? null : payload.qr_raw !== undefined ? payload.qr_raw : current.qr_raw,
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
