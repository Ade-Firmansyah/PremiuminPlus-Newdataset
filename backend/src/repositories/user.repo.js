import { execute, query, transaction } from '../config/db.js';
import { setSaldo } from '../services/wallet.service.js';
import { hashPassword, isHashedPassword } from '../utils/password.js';
import crypto from 'node:crypto';

function normalizeRole(role = 'member') {
  const value = String(role).toLowerCase();
  if (value === 'admin' || value === 'reseller') return value;
  return 'member';
}

function uiStatus(status = 'active') {
  const value = String(status).toLowerCase();
  if (value === 'inactive') return 'Nonaktif';
  if (value === 'suspended') return 'Suspended';
  return 'Aktif';
}

function dbStatus(status = 'active') {
  const value = String(status).toLowerCase();
  if (value === 'nonaktif' || value === 'inactive') return 'inactive';
  if (value === 'suspended') return 'suspended';
  return 'active';
}

function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    api_key: row.api_key,
    role: row.role,
    fullName: row.fullName || row.username,
    email: row.email || '',
    phone: row.phone || '',
    saldo: Number(row.saldo || 0),
    markup_percent: Number(row.reseller_margin_percent ?? row.markup_percent ?? row.markup_custom ?? 0),
    reseller_margin_percent: Number(row.reseller_margin_percent ?? row.markup_percent ?? row.markup_custom ?? 0),
    theme: row.theme || 'dark',
    status: uiStatus(row.status),
    orders: Number(row.orders || 0),
    deposits: Number(row.deposits || 0),
    lastLogin: row.last_login_at ? new Date(row.last_login_at).toISOString().replace('T', ' ').slice(0, 16) : '',
    notes: row.notes || '',
  };
}

function toAuthUser(row) {
  return row
    ? {
        ...row,
        saldo: Number(row.saldo || 0),
        markup_percent: Number(row.reseller_margin_percent ?? row.markup_percent ?? row.markup_custom ?? 0),
        reseller_margin_percent: Number(row.reseller_margin_percent ?? row.markup_percent ?? row.markup_custom ?? 0),
        theme: row.theme || 'dark',
      }
    : null;
}

async function seedUserCounters(userId) {
  const [orderRows] = await query('SELECT COUNT(*) AS total FROM transactions WHERE user_id = ?', [userId]);
  const [depositRows] = await query('SELECT COUNT(*) AS total FROM deposits WHERE user_id = ?', [userId]);
  return {
    orders: Number(orderRows?.total || 0),
    deposits: Number(depositRows?.total || 0),
  };
}

export async function findUserByUsername(username) {
  const rows = await query('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);
  return toAuthUser(rows[0] || null);
}

export async function findUserByEmail(email) {
  const rows = await query('SELECT * FROM users WHERE email = ? LIMIT 1', [String(email || '').trim()]);
  return toAuthUser(rows[0] || null);
}

export async function findUserByPhone(phone) {
  const rows = await query('SELECT * FROM users WHERE phone = ? LIMIT 1', [String(phone || '').trim()]);
  return toAuthUser(rows[0] || null);
}

export async function findUserForPasswordReset({ username, email, phone }) {
  const rows = await query(
    `SELECT * FROM users
     WHERE username = ? AND email = ? AND phone = ?
     LIMIT 1`,
    [String(username || '').trim(), String(email || '').trim(), String(phone || '').trim()],
  );
  return toAuthUser(rows[0] || null);
}

export async function findUserByApiKey(apiKey) {
  const rows = await query('SELECT * FROM users WHERE api_key = ? LIMIT 1', [apiKey]);
  return toAuthUser(rows[0] || null);
}

export async function listUsers() {
  const rows = await query(
    `SELECT
       u.*,
       COALESCE(order_stats.total, 0) AS orders,
       COALESCE(deposit_stats.total, 0) AS deposits
     FROM users u
     LEFT JOIN (
       SELECT user_id, COUNT(*) AS total
       FROM transactions
       WHERE transaction_type = 'order'
       GROUP BY user_id
     ) order_stats ON order_stats.user_id = u.id
     LEFT JOIN (
       SELECT user_id, COUNT(*) AS total
       FROM deposits
       GROUP BY user_id
     ) deposit_stats ON deposit_stats.user_id = u.id
     ORDER BY u.id DESC`,
  );
  return rows.map(toPublicUser);
}

export async function getUserById(id) {
  const rows = await query('SELECT * FROM users WHERE id = ? LIMIT 1', [Number(id)]);
  return toAuthUser(rows[0] || null);
}

export async function updateUserSaldo(userId, nextSaldo) {
  await setSaldo(userId, nextSaldo, `user-repo-${Number(userId)}-saldo-update`);
  return getUserById(userId);
}

function generateApiKey(username) {
  return `api_${String(username).toLowerCase()}_${crypto.randomBytes(18).toString('hex')}`;
}

export async function createUser(payload) {
  const passwordValue = String(payload.password || '');
  const password_hash = isHashedPassword(passwordValue) ? passwordValue : hashPassword(passwordValue);
  const api_key = payload.api_key || generateApiKey(payload.username);
  const result = await execute(
    `INSERT INTO users
      (username, email, phone, password_hash, password, api_key, saldo, markup_custom, markup_percent, reseller_margin_percent, theme, fullName, orders, deposits, notes, role, status, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.username,
      payload.email || null,
      payload.phone || null,
      password_hash,
      password_hash,
      api_key,
      0,
      Number(payload.markup_custom || 0),
      Number(payload.markup_percent ?? payload.markup_custom ?? 0),
      Number(payload.reseller_margin_percent ?? payload.markup_percent ?? payload.markup_custom ?? 0),
      payload.theme === 'light' ? 'light' : 'dark',
      payload.fullName || payload.username,
      Number(payload.orders || 0),
      Number(payload.deposits || 0),
      payload.notes || '',
      normalizeRole(payload.role),
      dbStatus(payload.status),
      payload.lastLogin ? new Date(payload.lastLogin) : null,
    ],
  );

  const created = await getUserById(result.insertId);
  return toPublicUser({ ...(created || {}), api_key });
}

export async function updateUser(id, payload) {
  const currentRows = await query('SELECT * FROM users WHERE id = ? LIMIT 1', [Number(id)]);
  const current = currentRows[0];
  if (!current) return null;

  const nextPassword = payload.password !== undefined && payload.password !== ''
    ? isHashedPassword(payload.password)
      ? payload.password
      : hashPassword(payload.password)
    : current.password_hash;

  const nextData = {
    username: payload.username !== undefined ? payload.username : current.username,
    email: payload.email !== undefined ? payload.email || null : current.email,
    phone: payload.phone !== undefined ? payload.phone || null : current.phone,
    password_hash: nextPassword,
    password: nextPassword,
    api_key: payload.api_key !== undefined ? payload.api_key : current.api_key,
    role: payload.role !== undefined ? normalizeRole(payload.role) : current.role,
    status: payload.status !== undefined ? dbStatus(payload.status) : current.status,
    fullName: payload.fullName !== undefined ? payload.fullName : current.fullName,
    notes: payload.notes !== undefined ? payload.notes : current.notes,
    last_login_at: payload.lastLogin !== undefined ? new Date(payload.lastLogin) : current.last_login_at,
    markup_custom: payload.markup_custom !== undefined ? Number(payload.markup_custom) : current.markup_custom,
    markup_percent: payload.markup_percent !== undefined ? Number(payload.markup_percent) : current.markup_percent,
    reseller_margin_percent: payload.reseller_margin_percent !== undefined
      ? Number(payload.reseller_margin_percent)
      : payload.markup_percent !== undefined
        ? Number(payload.markup_percent)
        : current.reseller_margin_percent,
    theme: payload.theme !== undefined ? (payload.theme === 'light' ? 'light' : 'dark') : current.theme,
    orders: payload.orders !== undefined ? Number(payload.orders) : current.orders,
    deposits: payload.deposits !== undefined ? Number(payload.deposits) : current.deposits,
  };

  await execute(
    `UPDATE users
     SET username = ?, email = ?, phone = ?, password_hash = ?, password = ?, api_key = ?, role = ?, status = ?, fullName = ?, notes = ?, last_login_at = ?, markup_custom = ?, markup_percent = ?, reseller_margin_percent = ?, theme = ?, orders = ?, deposits = ?
     WHERE id = ?`,
    [
      nextData.username,
      nextData.email,
      nextData.phone,
      nextData.password_hash,
      nextData.password,
      nextData.api_key,
      nextData.role,
      nextData.status,
      nextData.fullName,
      nextData.notes,
      nextData.last_login_at,
      nextData.markup_custom,
      nextData.markup_percent,
      nextData.reseller_margin_percent,
      nextData.theme,
      nextData.orders,
      nextData.deposits,
      Number(id),
    ],
  );

  const updated = await getUserById(id);
  const counters = await seedUserCounters(id);
  return toPublicUser({ ...(updated || current), ...counters });
}

export async function deleteUser(id) {
  const currentRows = await query('SELECT * FROM users WHERE id = ? LIMIT 1', [Number(id)]);
  const current = currentRows[0];
  if (!current) return null;

  try {
    await execute('DELETE FROM users WHERE id = ?', [Number(id)]);
  } catch (error) {
    if (error?.code === 'ER_ROW_IS_REFERENCED_2') {
      const conflict = new Error('User tidak bisa dihapus karena masih memiliki riwayat saldo/transaksi');
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }
  return toPublicUser(current);
}

export async function deleteUserWithCleanup(id, usernameConfirmation) {
  const userId = Number(id);

  return transaction(async (connection) => {
    const [currentRows] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
    const current = currentRows[0];
    if (!current) return null;

    if (String(usernameConfirmation || '') !== String(current.username)) {
      const error = new Error('Username salah, masukkan kode penghapusan dengan benar.');
      error.statusCode = 400;
      throw error;
    }

    await connection.query('DELETE FROM activity_logs WHERE actor_id = ? OR user_id = ?', [userId, userId]);
    await connection.query('DELETE FROM saldo_mutations WHERE user_id = ?', [userId]);
    await connection.query('DELETE FROM saldo_logs WHERE user_id = ?', [userId]);
    await connection.query('DELETE FROM withdraws WHERE user_id = ?', [userId]);
    await connection.query('DELETE FROM orders WHERE user_id = ?', [userId]);
    await connection.query('DELETE FROM payments WHERE user_id = ?', [userId]);
    await connection.query('DELETE FROM deposits WHERE user_id = ?', [userId]);
    await connection.query('DELETE FROM transactions WHERE user_id = ?', [userId]);
    await connection.query('DELETE FROM notifications WHERE created_by = ?', [userId]);
    await connection.query('DELETE FROM users WHERE id = ?', [userId]);

    return toPublicUser(current);
  });
}
