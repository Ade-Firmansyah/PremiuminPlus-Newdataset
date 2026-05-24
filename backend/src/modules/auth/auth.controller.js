import { createUser, findUserByEmail, findUserByPhone, findUserByUsername } from '../../repositories/user.repo.js';
import { isValidEmail, isValidWhatsapp, normalizeEmail, normalizeWhatsapp, normalizeWhatsappToIndonesia, requireFields, sanitizePlainText } from '../../utils/validator.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { safeCreateActivityLog } from '../../repositories/activity.repo.js';
import { logger } from '../../utils/logger.js';
import { createJwt } from '../../utils/jwt.js';
import { createWebSession, invalidateWebSession } from '../../services/web-session.service.js';
import { transaction } from '../../config/db.js';
import crypto from 'node:crypto';

const RESET_LIMIT_MS = 24 * 60 * 60 * 1000;
const RESET_USERNAME_PATTERN = /^[a-z0-9_]{4,}$/;
const PASSWORD_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PASSWORD_LOWER = 'abcdefghijkmnopqrstuvwxyz';
const PASSWORD_DIGIT = '23456789';
const PASSWORD_SYMBOL = '@#$%';

function pickRandom(chars) {
  return chars[crypto.randomInt(0, chars.length)];
}

function shuffleSecure(value) {
  const chars = value.split('');
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }
  return chars.join('');
}

function generateSecurePassword() {
  const all = `${PASSWORD_UPPER}${PASSWORD_LOWER}${PASSWORD_DIGIT}${PASSWORD_SYMBOL}`;
  const base = [
    pickRandom(PASSWORD_UPPER),
    pickRandom(PASSWORD_LOWER),
    pickRandom(PASSWORD_DIGIT),
    pickRandom(PASSWORD_SYMBOL),
  ];
  while (base.length < 10) base.push(pickRandom(all));
  return shuffleSecure(base.join(''));
}

function maskEmail(value) {
  const [name = '', domain = ''] = String(value || '').split('@');
  if (!domain) return '';
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskPhone(value) {
  const digits = String(value || '');
  if (digits.length <= 4) return '****';
  return `${digits.slice(0, 4)}****${digits.slice(-3)}`;
}

async function logPasswordReset({ user = null, scope, message, req, metadata = {} }) {
  await safeCreateActivityLog({
    actor_id: user?.id || null,
    scope,
    message,
    metadata,
    ip_address: req.ip,
  });
}

export async function login(req, res, next) {
  try {
    requireFields(req.body, ['username', 'password']);

    const user = await findUserByUsername(req.body.username);
    if (!user || !verifyPassword(req.body.password, user.password_hash)) {
      return res.status(401).json({
        status: false,
        message: 'Username atau password salah',
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        status: false,
        message: 'Akun tidak aktif',
      });
    }

    const sid = createWebSession(user.id);
    const token = createJwt({
      sub: user.id,
      sid,
      role: user.role,
      username: user.username,
      token_version: user.token_version || 1,
    });

    res.json({
      status: true,
      role: user.role,
      token,
      api_key: user.api_key,
      user: {
        username: user.username,
        saldo_utama: user.saldo_utama,
        saldo: user.saldo_utama,
        status: user.status,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    if (req.authType === 'jwt') {
      invalidateWebSession(req.tokenPayload);
      await safeCreateActivityLog({
        actor_id: req.user.id,
        scope: 'AUTH',
        message: 'Web dashboard session logged out',
        metadata: { reason: req.body?.reason || 'manual' },
        ip_address: req.ip,
      });
    }

    res.json({
      status: true,
      message: 'Session web dashboard ditutup',
    });
  } catch (error) {
    next(error);
  }
}

export async function registerMember(req, res, next) {
  try {
    requireFields(req.body, ['username', 'password', 'email', 'phone']);
    const rejectRegister = (statusCode, message) => res.status(statusCode).json({ status: false, success: false, message });

    const username = sanitizePlainText(req.body.username, 40);
    const password = String(req.body.password || '');
    const email = normalizeEmail(req.body.email);
    const phone = normalizeWhatsapp(req.body.phone);

    if (username.length < 3) {
      return rejectRegister(400, 'Username minimal 3 karakter');
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      return rejectRegister(400, 'Username hanya boleh berisi huruf, angka, titik, garis bawah, atau strip');
    }
    if (password.length < 6) {
      return rejectRegister(400, 'Password minimal 6 karakter');
    }
    if (!isValidEmail(email)) {
      return rejectRegister(400, 'Invalid email format');
    }
    if (!isValidWhatsapp(phone)) {
      return rejectRegister(400, 'Invalid WhatsApp number');
    }

    const existing = await findUserByUsername(username);
    if (existing) {
      return rejectRegister(409, 'Username sudah terdaftar');
    }
    if (await findUserByEmail(email)) {
      return rejectRegister(409, 'Email sudah terdaftar');
    }
    if (await findUserByPhone(phone)) {
      return rejectRegister(409, 'Nomor HP sudah terdaftar');
    }

    const data = await createUser({
      username,
      password,
      email,
      phone,
      fullName: sanitizePlainText(req.body.fullName || username, 120) || username,
      role: 'member',
      status: 'active',
      theme: 'dark',
    });

    logger('REGISTER', { user_id: data.id, username });
    await safeCreateActivityLog({
      actor_id: data.id,
      scope: 'REGISTER',
      message: 'Member registered',
      metadata: { username },
      ip_address: req.ip,
    });

    res.status(201).json({ status: true, data: { ...data, password: undefined } });
  } catch (error) {
    next(error);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    requireFields(req.body, ['username', 'email', 'phone']);

    const username = String(req.body.username || '').trim().toLowerCase();
    const email = normalizeEmail(req.body.email);
    const rawPhone = String(req.body.phone || '').trim();
    const phone = normalizeWhatsappToIndonesia(rawPhone);
    const fail = async (statusCode, message, scope, metadata = {}) => {
      await logPasswordReset({ scope, message, req, metadata: { username, ...metadata } });
      return res.status(statusCode).json({ status: false, success: false, message });
    };

    if (!RESET_USERNAME_PATTERN.test(username)) {
      return fail(400, 'Username tidak valid', 'PASSWORD_RESET_FAILED', { reason: 'invalid_username' });
    }
    if (!isValidEmail(email)) {
      return fail(400, 'Invalid email format', 'PASSWORD_RESET_FAILED', { reason: 'invalid_email', email: maskEmail(email) });
    }
    if (!/^\d+$/.test(rawPhone) || !isValidWhatsapp(phone)) {
      return fail(400, 'Invalid WhatsApp number', 'PASSWORD_RESET_FAILED', { reason: 'invalid_whatsapp', phone: maskPhone(phone) });
    }

    const result = await transaction(async (connection) => {
      const [rows] = await connection.query('SELECT * FROM users WHERE LOWER(username) = ? LIMIT 1 FOR UPDATE', [username]);
      const user = rows[0] || null;
      if (!user) {
        return { error: 'User tidak ditemukan', statusCode: 404, scope: 'PASSWORD_RESET_FAILED', metadata: { reason: 'user_not_found' } };
      }

      const storedEmail = normalizeEmail(user.email);
      const storedPhone = normalizeWhatsappToIndonesia(user.phone);
      if (storedEmail !== email || storedPhone !== phone) {
        return {
          error: 'Data tidak ditemukan',
          statusCode: 404,
          scope: 'PASSWORD_RESET_FAILED',
          user,
          metadata: {
            reason: 'identity_mismatch',
            email: maskEmail(email),
            phone: maskPhone(phone),
          },
        };
      }

      const lastResetAt = user.last_password_reset_at ? new Date(user.last_password_reset_at).getTime() : 0;
      if (lastResetAt && Date.now() - lastResetAt < RESET_LIMIT_MS) {
        return {
          error: 'Anda sudah reset password hari ini. Silakan coba kembali besok.',
          statusCode: 429,
          scope: 'PASSWORD_RESET_RATE_LIMIT',
          user,
          metadata: { reason: 'daily_limit', last_password_reset_at: user.last_password_reset_at },
        };
      }

      const nextPassword = generateSecurePassword();
      const passwordHash = hashPassword(nextPassword);
      await connection.query(
        `UPDATE users
         SET password_hash = ?,
             password = ?,
             token_version = token_version + 1,
             last_password_reset_at = NOW(),
             password_reset_count = COALESCE(password_reset_count, 0) + 1
         WHERE id = ?`,
        [passwordHash, passwordHash, user.id],
      );

      return {
        user,
        nextPassword,
        metadata: {
          email: maskEmail(email),
          phone: maskPhone(phone),
          password_reset_count: Number(user.password_reset_count || 0) + 1,
        },
      };
    });

    if (result.error) {
      await logPasswordReset({
        user: result.user,
        scope: result.scope,
        message: result.scope,
        req,
        metadata: result.metadata,
      });
      return res.status(result.statusCode).json({ status: false, success: false, message: result.error });
    }

    logger('SYSTEM', { event: 'password-reset', user_id: result.user.id });
    await safeCreateActivityLog({
      actor_id: result.user.id,
      scope: 'PASSWORD_RESET_SUCCESS',
      message: 'PASSWORD_RESET_SUCCESS',
      metadata: { username, ...result.metadata },
      ip_address: req.ip,
    });

    res.json({
      status: true,
      success: true,
      password: result.nextPassword,
      message: 'Password baru berhasil dibuat',
    });
  } catch (error) {
    next(error);
  }
}
