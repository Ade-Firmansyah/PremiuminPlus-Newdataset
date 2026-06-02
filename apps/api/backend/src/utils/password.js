import crypto from 'crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let bcrypt = null;

try {
  bcrypt = require('bcryptjs');
} catch {
  try {
    bcrypt = require('bcrypt');
  } catch {
    bcrypt = null;
  }
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function verifyPbkdf2(password, storedHash) {
  const parts = String(storedHash || '').split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;

  const iterations = Number(parts[2]);
  const salt = parts[3];
  const expected = parts[4];
  if (!Number.isInteger(iterations) || iterations <= 0 || !salt || !expected) return false;

  const derived = crypto.pbkdf2Sync(String(password || ''), salt, iterations, 32, 'sha256').toString('hex');
  return safeEqual(derived, expected);
}

export function verifyPassword(password, storedHash) {
  const hash = String(storedHash || '');
  if (!password || !hash) return false;

  if (/^\$2[aby]\$\d{2}\$/.test(hash)) {
    return Boolean(bcrypt?.compareSync?.(String(password || ''), hash));
  }

  if (hash.startsWith('pbkdf2$sha256$')) {
    return verifyPbkdf2(password, hash);
  }

  if (hash.startsWith('sha256$')) {
    return safeEqual(sha256Hex(password), hash.slice('sha256$'.length));
  }

  if (hash.startsWith('sha256:')) {
    return safeEqual(sha256Hex(password), hash.slice('sha256:'.length));
  }

  if (/^[a-f0-9]{64}$/i.test(hash)) {
    return safeEqual(sha256Hex(password), hash.toLowerCase());
  }

  if (hash.startsWith('plain:')) {
    return safeEqual(password, hash.slice('plain:'.length));
  }

  return safeEqual(password, hash);
}

export function hashPassword(password, { iterations = 120000 } = {}) {
  if (bcrypt?.hashSync) {
    return bcrypt.hashSync(String(password || ''), 12);
  }

  const salt = crypto.randomBytes(8).toString('hex');
  const derived = crypto.pbkdf2Sync(String(password || ''), salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2$sha256$${iterations}$${salt}$${derived}`;
}

export function isHashedPassword(value) {
  const s = String(value || '');
  return /^\$2[aby]\$\d{2}\$/.test(s) || s.startsWith('pbkdf2$sha256$') || s.startsWith('sha256$') || /^[a-f0-9]{64}$/i.test(s) || s.startsWith('plain:');
}

export function encryptString(value) {
  if (value === null || value === undefined) return null;
  try {
    return Buffer.from(String(value)).toString('base64');
  } catch {
    return null;
  }
}

export function decryptString(value) {
  if (!value) return null;
  try {
    return Buffer.from(String(value), 'base64').toString('utf8');
  } catch {
    return null;
  }
}
