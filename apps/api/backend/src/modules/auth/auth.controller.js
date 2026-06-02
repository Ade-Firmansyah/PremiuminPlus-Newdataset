import { createUserAtomic, findUserByEmail, findUserByLogin, findUserByPhone, findUserByUsername, findUserForPasswordReset, touchUserLastLogin, updateUser } from '../../repositories/user.repo.js';
import { normalizePhoneNumber, requireFields, validateEmail } from '../../utils/validator.js';
import { verifyPassword } from '../../utils/password.js';
import { safeCreateActivityLog } from '../../repositories/activity.repo.js';
import { logger } from '../../utils/logger.js';
import { notifyAdmin } from '../../services/notification.service.js';

function maskLogin(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.includes('@')) {
    const [name, domain] = text.split('@');
    return `${name.slice(0, 2)}***@${domain || '***'}`;
  }
  return `${text.slice(0, 2)}***${text.slice(-1)}`;
}

function authError(message, statusCode = 400) {
  return {
    status: statusCode,
    body: { status: false, success: false, message },
  };
}

function validateUsername(value) {
  const username = String(value || '').trim();
  if (!username) throw authError('Username wajib diisi.');
  if (username.length < 3) throw authError('Username minimal 3 karakter.');
  if (!/^[a-zA-Z0-9_.]+$/.test(username)) throw authError('Username hanya boleh huruf, angka, underscore, dan titik.');
  return username;
}

function mapDuplicateError(error) {
  const message = String(error?.message || '');
  if (error?.code !== 'ER_DUP_ENTRY') return null;
  if (message.includes('uq_users_username') || message.includes('username')) return 'Username sudah terdaftar.';
  if (message.includes('uq_users_email') || message.includes('email')) return 'Email sudah terdaftar.';
  if (message.includes('uq_users_phone') || message.includes('phone')) return 'Nomor WhatsApp sudah terdaftar.';
  return 'Akun sudah terdaftar.';
}

export async function login(req, res, next) {
  try {
    requireFields(req.body, ['username', 'password']);

    const loginValue = String(req.body.username || '').trim();
    const user = await findUserByLogin(loginValue);
    let passwordValid = Boolean(user && verifyPassword(req.body.password, user.password_hash));

    if (!passwordValid && user && !user.password_hash && user.password && verifyPassword(req.body.password, `plain:${user.password}`)) {
      await updateUser(user.id, { password: req.body.password });
      passwordValid = true;
    }

    if (!user || !passwordValid) {
      await safeCreateActivityLog({
        actor_id: null,
        scope: 'AUTH',
        message: 'login_failed',
        metadata: { login: maskLogin(loginValue) },
        ip_address: req.ip,
      });
      return res.status(401).json({
        status: false,
        success: false,
        message: 'Username atau password salah',
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        status: false,
        message: 'Akun tidak aktif',
      });
    }

    await safeCreateActivityLog({
      actor_id: user.id,
      scope: 'AUTH',
      message: 'login_success',
      metadata: { username: user.username, role: user.role },
      ip_address: req.ip,
    });
    await touchUserLastLogin(user.id);

    res.json({
      status: true,
      success: true,
      role: user.role,
      api_key: user.api_key,
      user: {
        username: user.username,
        saldo: user.saldo,
        status: user.status,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function registerMember(req, res, next) {
  try {
    requireFields(req.body, ['username', 'email', 'phone', 'password']);

    const username = validateUsername(req.body.username);
    const email = validateEmail(req.body.email, { required: true });
    const phone = normalizePhoneNumber(req.body.phone, { required: true });
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirm_password ?? req.body.confirmPassword ?? '');
    if (username.length < 3) {
      return res.status(400).json({ status: false, success: false, message: 'Username minimal 3 karakter.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ status: false, success: false, message: 'Password minimal 6 karakter.' });
    }
    if (confirmPassword && confirmPassword !== password) {
      return res.status(400).json({ status: false, success: false, message: 'Password dan konfirmasi password harus sama.' });
    }

    const existing = await findUserByUsername(username);
    if (existing) {
      return res.status(409).json({ status: false, success: false, message: 'Username sudah terdaftar.' });
    }
    if (await findUserByEmail(email)) {
      return res.status(409).json({ status: false, success: false, message: 'Email sudah terdaftar.' });
    }
    if (await findUserByPhone(phone)) {
      return res.status(409).json({ status: false, success: false, message: 'Nomor WhatsApp sudah terdaftar.' });
    }

    const data = await createUserAtomic({
      username,
      password,
      email,
      phone,
      fullName: req.body.fullName || username,
      role: 'member',
      status: 'active',
      theme: 'dark',
    }, {
      activity: {
        scope: 'REGISTER',
        message: 'Member registered',
        metadata: { username },
        ip_address: req.ip,
      },
    });

    logger('REGISTER', { user_id: data.id, username });
    void notifyAdmin('register', {
      user: username,
      role: 'member',
      status: 'REGISTERED',
    });

    res.status(201).json({
      status: true,
      success: true,
      message: 'Registrasi berhasil. Silakan login.',
      data: {
        user: { ...data, password: undefined, password_hash: undefined, api_key: undefined },
      },
    });
  } catch (error) {
    if (error?.body) return res.status(error.status).json(error.body);
    const duplicateMessage = mapDuplicateError(error);
    if (duplicateMessage) return res.status(409).json({ status: false, success: false, message: duplicateMessage });
    return next(error);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    const identifier = String(req.body?.identifier ?? req.body?.username ?? '').trim();
    if (!identifier) {
      return res.status(400).json({ status: false, success: false, message: 'Username, email, atau nomor WhatsApp wajib diisi.' });
    }

    const user = await findUserForPasswordReset({ identifier });
    const safeMessage = 'Jika akun ditemukan, instruksi reset akan dikirim.';

    if (user) {
      logger('SYSTEM', { event: 'password-reset-requested', user_id: user.id });
      await safeCreateActivityLog({
        actor_id: user.id,
        scope: 'SYSTEM',
        message: 'Password reset requested',
        metadata: { username: user.username },
        ip_address: req.ip,
      });
    }

    res.json({
      status: true,
      success: true,
      message: safeMessage,
    });
  } catch (error) {
    next(error);
  }
}
