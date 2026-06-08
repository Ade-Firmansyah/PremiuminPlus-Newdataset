import { findUserByApiKey } from '../repositories/user.repo.js';
import { execute } from '../config/db.js';

function readApiKey(req) {
  const rawApiKey = req.headers['x-api-key'];
  const apiKey = Array.isArray(rawApiKey) ? String(rawApiKey[0] || '').trim() : String(rawApiKey || '').trim();
  if (apiKey) return apiKey;

  const rawAuthorization = req.headers.authorization;
  const authorization = Array.isArray(rawAuthorization) ? String(rawAuthorization[0] || '') : String(rawAuthorization || '');
  const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  return bearer ? bearer[1].trim() : '';
}

export async function auth(req, res, next) {
  try {
    const apiKey = readApiKey(req);
    if (!apiKey) {
      return res.status(401).json({
        status: false,
        message: 'Unauthorized',
      });
    }

    const user = await findUserByApiKey(apiKey);

    if (!user) {
      return res.status(401).json({
        status: false,
        message: 'Unauthorized',
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        status: false,
        message: 'Akun tidak aktif',
      });
    }

    if (user.bot_access_unlocked && Number(user.locked_balance || 0) > 0 && Number(user.saldo || 0) < Number(user.locked_balance || 0)) {
      await execute(
        `UPDATE users
         SET bot_access_unlocked = 0,
             locked_balance = 0,
             bot_disabled_reason = 'Saldo minimum akses bot tidak terpenuhi'
         WHERE id = ?`,
        [user.id],
      );
      const invoice = `BOTDIS-${user.id}-${Date.now()}`;
      await execute(
        `INSERT INTO transactions
          (invoice, ref_id, user_id, product_name, transaction_type, amount, total_price, status, description, channel, processed_at)
         VALUES (?, ?, ?, 'Bot WhatsApp Disabled', 'bot_disable', 0, 0, 'success', 'Saldo minimum akses bot tidak terpenuhi', 'system', NOW())`,
        [invoice, invoice, user.id],
      );
      await execute(
        `INSERT INTO activity_logs (actor_id, user_id, scope, message, activity, metadata)
         VALUES (?, ?, 'BOT', 'Bot disabled', 'Bot disabled', CAST(? AS JSON))`,
        [user.id, user.id, JSON.stringify({ reason: 'Saldo minimum akses bot tidak terpenuhi' })],
      );
      user.bot_access_unlocked = false;
      user.locked_balance = 0;
      user.bot_disabled_reason = 'Saldo minimum akses bot tidak terpenuhi';
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function resellerOnly(req, res, next) {
  if (!req.user || !['admin', 'reseller'].includes(req.user.role)) {
    return res.status(403).json({
      status: false,
      message: 'Akses API hanya untuk reseller',
    });
  }

  next();
}

export function requireApiUser(req, res, next) {
  if (!req.user || !['reseller', 'admin'].includes(String(req.user.role || '').toLowerCase())) {
    return res.status(403).json({
      status: false,
      message: 'Akses API key tidak tersedia untuk role ini',
    });
  }

  req.apiUser = req.user;
  return next();
}

export function requireManagedBotAccess(req, res, next) {
  const user = req.user;
  if (!user || !['admin', 'reseller'].includes(String(user.role || '').toLowerCase())) {
    return res.status(403).json({
      status: false,
      message: 'Managed Bot Hosting hanya tersedia untuk reseller dan admin',
    });
  }

  if (user.role === 'admin') return next();

  const lockedBalance = Number(user.locked_balance || 0);
  const saldo = Number(user.saldo || 0);
  if (!user.bot_access_unlocked || lockedBalance < 50000 || saldo < lockedBalance) {
    return res.status(402).json({
      status: false,
      code: 'BOT_ACCESS_LOCKED',
      message: user.bot_disabled_reason || 'Managed Bot Hosting terkunci. Aktivasi membutuhkan locked balance Rp50.000.',
    });
  }

  return next();
}
