import { query, parseDbJson } from '../config/db.js';

const ALLOWED_TYPES = new Set([
  'credit',
  'debit',
  'deposit',
  'withdraw',
  'refund',
  'order_payment',
  'order',
  'admin_adjustment',
  'adjustment',
  'bonus',
  'reseller_commission',
  'commission',
  'locked_balance',
]);

function toRecord(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    username: row.username || '',
    email: row.email || '',
    mutation_type: row.mutation_type,
    direction: row.direction,
    saldo_masuk: row.direction === 'in' ? Number(row.amount || 0) : 0,
    nominal: Number(row.amount || 0),
    saldo_keluar: row.direction === 'out' ? Number(row.amount || 0) : 0,
    balance_before: Number(row.balance_before || 0),
    balance_after: Number(row.balance_after || 0),
    source_type: row.source_type || '',
    source_ref: row.source_ref || '',
    admin_executor_id: row.admin_executor_id || null,
    admin_executor: row.admin_executor || '',
    notes: row.notes || '',
    metadata: parseDbJson(row.metadata, null),
    created_at: row.created_at,
  };
}

function normalizeDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

function normalizeType(value) {
  const type = String(value || '').trim().toLowerCase();
  return ALLOWED_TYPES.has(type) ? type : '';
}

export async function listBalanceMutations(filters = {}) {
  const page = Math.max(1, Number(filters.page || 1));
  const limitCap = filters.export_mode ? 5000 : 100;
  const limit = Math.min(limitCap, Math.max(10, Number(filters.limit || 25)));
  const offset = (page - 1) * limit;
  const where = [];
  const params = [];

  const dateFrom = normalizeDate(filters.date_from);
  const dateTo = normalizeDate(filters.date_to);
  const type = normalizeType(filters.type);
  const search = String(filters.search || '').trim();
  const userId = Number(filters.user_id || 0);

  if (dateFrom) {
    where.push('bm.created_at >= ?');
    params.push(`${dateFrom} 00:00:00`);
  }
  if (dateTo) {
    where.push('bm.created_at <= ?');
    params.push(`${dateTo} 23:59:59`);
  }
  if (type) {
    where.push('bm.mutation_type = ?');
    params.push(type);
  }
  if (Number.isInteger(userId) && userId > 0) {
    where.push('bm.user_id = ?');
    params.push(userId);
  }
  if (search) {
    where.push('(u.username LIKE ? OR u.email LIKE ? OR bm.source_ref LIKE ? OR bm.notes LIKE ?)');
    const like = `%${search.slice(0, 80)}%`;
    params.push(like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [totalRow] = await query(
    `SELECT COUNT(*) AS total
     FROM balance_mutations bm
     INNER JOIN users u ON u.id = bm.user_id
     ${whereSql}`,
    params,
  );
  const rows = await query(
    `SELECT bm.*, u.username, u.email, admin.username AS admin_executor
     FROM balance_mutations bm
     INNER JOIN users u ON u.id = bm.user_id
     LEFT JOIN users admin ON admin.id = bm.admin_executor_id
     ${whereSql}
     ORDER BY bm.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const total = Number(totalRow?.total || 0);
  return {
    data: rows.map(toRecord),
    meta: {
      page,
      limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function exportBalanceMutations(filters = {}) {
  const result = await listBalanceMutations({ ...filters, page: 1, limit: 5000, export_mode: true });
  return result.data;
}
