const allowedScopes = new Set([
  'LOGIN',
  'REGISTER',
  'ADMIN',
  'ORDER',
  'WD',
  'SYSTEM',
  'ERROR',
  'PREMKU',
  'DEPOSIT',
  'PAYMENT',
  'CANCEL',
  'SALDO',
  'RESELLER',
  'NOTIFICATION',
  'STOCK',
  'DELIVERY',
  'REALTIME',
]);

function normalizeScope(scope) {
  const value = String(scope || 'SYSTEM').toUpperCase().replace(/[^A-Z]/g, '');
  return allowedScopes.has(value) ? value : 'SYSTEM';
}

function scrub(value) {
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (/key|token|password|secret/i.test(key)) return [key, '[redacted]'];
      if (typeof item === 'string' && item.length > 500) return [key, `${item.slice(0, 500)}...`];
      return [key, item];
    }),
  );
}

export function logger(scope, data = {}) {
  const normalized = normalizeScope(scope);
  console.log(`[${normalized}]`, scrub(data));
}
