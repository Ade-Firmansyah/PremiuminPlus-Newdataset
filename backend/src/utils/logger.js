const allowedScopes = new Set([
  'FRONTEND',
  'BACKEND',
  'AUTH',
  'PAYMENT',
  'ORDER',
  'PREMKU',
  'BOT',
  'SESSION',
  'SYNC',
  'WEBSOCKET',
  'QUEUE',
  'CACHE',
  'CLEANUP',
  'ERROR',
]);

const scopeAliases = new Map([
  ['LOGIN', 'AUTH'],
  ['REGISTER', 'AUTH'],
  ['ADMIN', 'BACKEND'],
  ['WD', 'BACKEND'],
  ['SYSTEM', 'BACKEND'],
  ['DEPOSIT', 'PAYMENT'],
  ['CANCEL', 'PAYMENT'],
  ['SALDO', 'PAYMENT'],
  ['RESELLER', 'BACKEND'],
  ['NOTIFICATION', 'SYNC'],
  ['STOCK', 'SYNC'],
  ['DELIVERY', 'SYNC'],
  ['REALTIME', 'WEBSOCKET'],
  ['BOTSESSION', 'SESSION'],
  ['QR', 'SESSION'],
  ['ORDERWORKER', 'QUEUE'],
]);

function normalizeScope(scope) {
  const value = String(scope || 'SYSTEM').toUpperCase().replace(/[^A-Z]/g, '');
  const normalized = scopeAliases.get(value) || value;
  return allowedScopes.has(normalized) ? normalized : 'BACKEND';
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
