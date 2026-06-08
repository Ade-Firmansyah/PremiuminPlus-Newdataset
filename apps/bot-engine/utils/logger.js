const allowedScopes = new Set(['BOT', 'SESSION', 'QUEUE', 'WEBSOCKET', 'SYNC', 'ERROR']);

function scrub(value, key = '') {
  if (/key|token|password|secret|credential/i.test(key)) return '[redacted]';
  if (Array.isArray(value)) return value.map((item) => scrub(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, scrub(item, childKey)]));
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}...`;
  return value;
}

function normalizeScope(scope, message = '') {
  const text = String(message || '').toUpperCase();
  if (text.includes('SESSION') || text.includes('QR')) return 'SESSION';
  if (text.includes('QUEUE')) return 'QUEUE';
  if (text.includes('WEBSOCKET')) return 'WEBSOCKET';
  if (text.includes('SYNC')) return 'SYNC';
  if (text.includes('ERROR') || text.includes('FAILED')) return 'ERROR';

  const value = String(scope || 'BOT').toUpperCase().replace(/[^A-Z]/g, '');
  if (value.includes('SESSION') || value === 'QR') return 'SESSION';
  if (value.includes('QUEUE')) return 'QUEUE';
  if (value.includes('WEBSOCKET')) return 'WEBSOCKET';
  return allowedScopes.has(value) ? value : 'BOT';
}

export function createLogger(scope) {
  return {
    info(message, meta = {}) {
      console.log(`[${normalizeScope(scope, message)}]`, message, scrub(meta));
    },
    error(message, meta = {}) {
      console.error(`[${normalizeScope('ERROR', message)}]`, message, scrub(meta));
    },
  };
}
