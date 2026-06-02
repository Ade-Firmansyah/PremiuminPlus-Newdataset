export function requireFields(payload, fields) {
  const missing = fields.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === '');

  if (missing.length) {
    const error = new Error(`Missing fields: ${missing.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
}

export function toSafeInteger(value, fieldName = 'ID') {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    const error = new Error(`${fieldName} tidak valid.`);
    error.statusCode = 400;
    throw error;
  }
  return number;
}

export function normalizePhoneNumber(value, { required = false } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    if (required) {
      const error = new Error('Nomor WhatsApp wajib diisi.');
      error.statusCode = 400;
      throw error;
    }
    return '';
  }

  const compact = raw.replace(/[\s\-()+.]/g, '');
  if (!/^\d+$/.test(compact)) {
    const error = new Error('Nomor WhatsApp hanya boleh angka.');
    error.statusCode = 400;
    throw error;
  }
  if (compact.startsWith('0')) return `62${compact.slice(1)}`;
  if (compact.startsWith('62')) return compact;

  const error = new Error('Nomor WhatsApp harus diawali 08 atau 62.');
  error.statusCode = 400;
  throw error;
}

export function validateEmail(value, { required = false } = {}) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email) {
    if (required) {
      const error = new Error('Email wajib diisi.');
      error.statusCode = 400;
      throw error;
    }
    return '';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error('Email tidak valid.');
    error.statusCode = 400;
    throw error;
  }
  return email;
}
