import { execute, query, transaction } from '../../config/db.js';
import { createNotification } from '../../repositories/notification.repo.js';
import { deleteCachePrefix } from '../../services/cache.service.js';

function cleanText(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function toRequest(row) {
  if (!row) return null;
  return {
    user_id: Number(row.id),
    username: row.username || '',
    email: row.email || '',
    phone: row.phone || '',
    role: row.role || 'member',
    status: row.reseller_request_status || 'none',
    reason: row.reseller_request_reason || '',
    whatsapp: row.reseller_request_whatsapp || '',
    experience: row.reseller_request_experience || '',
    rejected_reason: row.reseller_request_rejected_reason || '',
    requested_at: row.reseller_requested_at || null,
    reviewed_at: row.reseller_reviewed_at || null,
  };
}

export async function resellerRequestStatus(req, res, next) {
  try {
    const rows = await query(
      `SELECT id, username, email, phone, role, reseller_request_status,
              reseller_request_reason, reseller_request_whatsapp, reseller_request_experience,
              reseller_request_rejected_reason, reseller_requested_at, reseller_reviewed_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [req.user.id],
    );
    res.json({ status: true, data: toRequest(rows[0] || req.user) });
  } catch (error) {
    next(error);
  }
}

export async function requestResellerUpgrade(req, res, next) {
  try {
    if (req.user.role === 'reseller' || req.user.role === 'admin') {
      return res.json({
        status: true,
        data: {
          status: 'approved',
          role: req.user.role,
          message: 'Akun Anda sudah reseller.',
        },
      });
    }

    const reason = cleanText(req.body?.reason, 1000);
    const whatsapp = cleanText(req.body?.whatsapp, 40).replace(/[^\d+]/g, '');
    const experience = cleanText(req.body?.experience, 1000);

    if (reason.length < 10) {
      return res.status(400).json({ status: false, message: 'Alasan upgrade minimal 10 karakter' });
    }
    if (whatsapp.replace(/\D/g, '').length < 8) {
      return res.status(400).json({ status: false, message: 'Nomor WhatsApp tidak valid' });
    }

    await execute(
      `UPDATE users
       SET reseller_request_status = 'pending',
           reseller_request_reason = ?,
           reseller_request_whatsapp = ?,
           reseller_request_experience = ?,
           reseller_request_rejected_reason = NULL,
           reseller_requested_at = CURRENT_TIMESTAMP,
           reseller_reviewed_at = NULL
       WHERE id = ?`,
      [reason, whatsapp, experience || null, req.user.id],
    );
    await execute(
      `INSERT INTO activity_logs (actor_id, user_id, scope, message, activity, action, metadata)
       VALUES (?, ?, 'USER', 'reseller_request_submitted', 'reseller_request_submitted', 'reseller_request_submitted', CAST(? AS JSON))`,
      [req.user.id, req.user.id, JSON.stringify({ whatsapp, reason })],
    );
    deleteCachePrefix('admin:');
    deleteCachePrefix(`dashboard:user:${req.user.id}`);
    res.json({
      status: true,
      data: {
        status: 'pending',
        reason,
        whatsapp,
        experience,
        requested_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function adminResellerRequests(_req, res, next) {
  try {
    const rows = await query(
      `SELECT id, username, email, phone, role, reseller_request_status,
              reseller_request_reason, reseller_request_whatsapp, reseller_request_experience,
              reseller_request_rejected_reason, reseller_requested_at, reseller_reviewed_at
       FROM users
       WHERE reseller_request_status IN ('pending', 'approved', 'rejected')
       ORDER BY FIELD(reseller_request_status, 'pending', 'rejected', 'approved'), reseller_requested_at DESC, id DESC
       LIMIT 200`,
    );
    res.json({ status: true, data: rows.map(toRequest) });
  } catch (error) {
    next(error);
  }
}

export async function approveResellerRequest(req, res, next) {
  try {
    const data = await transaction(async (connection) => {
      const [rows] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [Number(req.params.id)]);
      const user = rows[0];
      if (!user) {
        const error = new Error('User tidak ditemukan');
        error.statusCode = 404;
        throw error;
      }
      if (user.role === 'reseller') {
        return { user_id: Number(user.id), username: user.username, status: 'approved', role: 'reseller' };
      }
      if (user.reseller_request_status !== 'pending') {
        const error = new Error('Request upgrade tidak berstatus pending');
        error.statusCode = 400;
        throw error;
      }
      await connection.query(
        `UPDATE users
         SET role = 'reseller',
             reseller_request_status = 'approved',
             reseller_request_rejected_reason = NULL,
             reseller_reviewed_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [Number(req.params.id)],
      );
      return { user_id: Number(user.id), username: user.username, status: 'approved', role: 'reseller' };
    });
    await createNotification({
      user_id: data.user_id,
      title: 'Upgrade reseller disetujui',
      message: 'Akun Anda sekarang reseller. Menu margin, analytics, dan Bot WhatsApp sudah aktif sesuai akses akun.',
      type: 'reseller_upgrade',
      is_active: true,
    });
    deleteCachePrefix('admin:');
    deleteCachePrefix(`dashboard:user:${data.user_id}`);
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}

export async function rejectResellerRequest(req, res, next) {
  try {
    const reason = cleanText(req.body?.reason || req.body?.notes || 'Request upgrade reseller belum dapat disetujui.', 1000);
    const data = await transaction(async (connection) => {
      const [rows] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [Number(req.params.id)]);
      const user = rows[0];
      if (!user) {
        const error = new Error('User tidak ditemukan');
        error.statusCode = 404;
        throw error;
      }
      if (user.reseller_request_status !== 'pending') {
        const error = new Error('Request upgrade tidak berstatus pending');
        error.statusCode = 400;
        throw error;
      }
      await connection.query(
        `UPDATE users
         SET reseller_request_status = 'rejected',
             reseller_request_rejected_reason = ?,
             reseller_reviewed_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [reason, Number(req.params.id)],
      );
      return { user_id: Number(user.id), username: user.username, status: 'rejected', reason };
    });
    await createNotification({
      user_id: data.user_id,
      title: 'Upgrade reseller ditolak',
      message: reason,
      type: 'reseller_upgrade',
      is_active: true,
    });
    deleteCachePrefix('admin:');
    deleteCachePrefix(`dashboard:user:${data.user_id}`);
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}
