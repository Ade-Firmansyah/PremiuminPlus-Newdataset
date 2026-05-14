import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

function normalizePassword(value) {
  return String(value ?? '');
}

export function hashPassword(password) {
  return bcrypt.hashSync(normalizePassword(password), 12);
}

export function verifyPassword(password, stored) {
  const value = normalizePassword(stored);

  if (value.startsWith('$2a$') || value.startsWith('$2b$') || value.startsWith('$2y$')) {
    return bcrypt.compareSync(normalizePassword(password), value);
  }

  if (!value.includes(':')) {
    return normalizePassword(password) === value;
  }

  const [salt, hash] = value.split(':');
  const nextHash = crypto.scryptSync(normalizePassword(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(nextHash, 'hex'));
}

export function isHashedPassword(value) {
  const normalized = String(value || '');
  return normalized.includes(':') || normalized.startsWith('$2a$') || normalized.startsWith('$2b$') || normalized.startsWith('$2y$');
}
