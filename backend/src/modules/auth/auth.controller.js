import { createUser, findUserByEmail, findUserByPhone, findUserByUsername, findUserForPasswordReset, updateUser } from '../../repositories/user.repo.js';
import { requireFields } from '../../utils/validator.js';
import { verifyPassword } from '../../utils/password.js';
import { safeCreateActivityLog } from '../../repositories/activity.repo.js';
import { logger } from '../../utils/logger.js';
import { createJwt } from '../../utils/jwt.js';
import crypto from 'node:crypto';

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

    const token = createJwt({
      sub: user.id,
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

export async function registerMember(req, res, next) {
  try {
    requireFields(req.body, ['username', 'password']);

    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    if (username.length < 3) {
      return res.status(400).json({ status: false, message: 'Username minimal 3 karakter' });
    }
    if (password.length < 6) {
      return res.status(400).json({ status: false, message: 'Password minimal 6 karakter' });
    }

    const existing = await findUserByUsername(username);
    if (existing) {
      return res.status(409).json({ status: false, message: 'Username sudah terdaftar' });
    }
    if (req.body.email && (await findUserByEmail(req.body.email))) {
      return res.status(409).json({ status: false, message: 'Email sudah terdaftar' });
    }
    if (req.body.phone && (await findUserByPhone(req.body.phone))) {
      return res.status(409).json({ status: false, message: 'Nomor HP sudah terdaftar' });
    }

    const data = await createUser({
      username,
      password,
      email: req.body.email || null,
      phone: req.body.phone || null,
      fullName: req.body.fullName || username,
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

    const user = await findUserForPasswordReset(req.body);
    if (!user) {
      return res.status(404).json({
        status: false,
        message: 'Data akun tidak cocok dengan database lokal',
      });
    }

    const nextPassword = crypto.randomBytes(4).toString('hex').toUpperCase();
    await updateUser(user.id, { password: nextPassword });

    logger('SYSTEM', { event: 'password-reset', user_id: user.id });
    await safeCreateActivityLog({
      actor_id: user.id,
      scope: 'SYSTEM',
      message: 'Password reset requested',
      metadata: { username: user.username },
      ip_address: req.ip,
    });

    res.json({
      status: true,
      password: nextPassword,
      message: 'Segera ubah password setelah login.',
    });
  } catch (error) {
    next(error);
  }
}
