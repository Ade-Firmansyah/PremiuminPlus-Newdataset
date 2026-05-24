export function requireFields(payload, fields) {
  const missing = fields.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === '');

  if (missing.length) {
    const error = new Error(`Missing fields: ${missing.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
}

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
const WHATSAPP_PATTERN = /^(08\d{8,12}|628\d{8,12})$/;

export function sanitizePlainText(value, maxLength = 180) {
  return String(value ?? '')
    .trim()
    .replace(/[<>"'`\\]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

export function normalizeEmail(value) {
  return sanitizePlainText(value, 120).toLowerCase();
}

export function normalizeWhatsapp(value) {
  return String(value ?? '').trim().slice(0, 30);
}

export function normalizeWhatsappToIndonesia(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 16);
  if (digits.startsWith('08')) return `62${digits.slice(1)}`;
  return digits;
}

export function isValidEmail(value) {
  return EMAIL_PATTERN.test(normalizeEmail(value));
}

export function isValidWhatsapp(value) {
  const normalized = normalizeWhatsapp(value);
  return /^\d+$/.test(normalized) && WHATSAPP_PATTERN.test(normalized);
}
