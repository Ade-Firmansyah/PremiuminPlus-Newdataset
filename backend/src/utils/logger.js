import env from '../config/env.js';

const allowedScopes = new Set(['AUTH', 'ORDER', 'PAYMENT', 'BOT', 'ERROR']);

const scopeAliases = new Map([
  ['LOGIN', 'AUTH'],
  ['REGISTER', 'AUTH'],
  ['ADMIN', 'AUTH'],
  ['APIKEYUSAGE', 'AUTH'],
  ['DEPOSIT', 'PAYMENT'],
  ['CANCEL', 'PAYMENT'],
  ['SALDO', 'PAYMENT'],
  ['WD', 'PAYMENT'],
  ['RESELLER', 'PAYMENT'],
  ['STOCK', 'ORDER'],
  ['DELIVERY', 'ORDER'],
  ['PREMKU', env.VERBOSE_PREMKU_LOGS ? 'PAYMENT' : ''],
  ['SYSTEM', env.VERBOSE_SYSTEM_LOGS ? 'BOT' : ''],
  ['REALTIME', env.VERBOSE_SYSTEM_LOGS ? 'BOT' : ''],
  ['NOTIFICATION', env.VERBOSE_SYSTEM_LOGS ? 'BOT' : ''],
]);

function normalizeScope(scope) {
  const value = String(scope || 'SYSTEM').toUpperCase().replace(/[^A-Z]/g, '');
  const normalized = scopeAliases.get(value) ?? value;
  return allowedScopes.has(normalized) ? normalized : '';
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
  if (!normalized) return;
  console.log(`[${normalized}]`, scrub(data));
}
