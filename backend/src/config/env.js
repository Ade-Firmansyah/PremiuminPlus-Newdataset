import dotenv from 'dotenv';

dotenv.config();

function envMs(name, fallback, min) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, value);
}

const env = {
  PORT: Number(process.env.PORT || 4000),
  PREMKU_API_KEY: process.env.API_KEY || process.env.PREMKU_API_KEY || '',
  PREMKU_BASE_URL: process.env.BASE_URL || 'https://premku.com/api/',
  PREMKU_ORDER_ENDPOINT: process.env.PREMKU_ORDER_ENDPOINT || 'order',
  PREMKU_STATUS_ENDPOINT: process.env.PREMKU_STATUS_ENDPOINT || 'status',
  PREMKU_PAY_ENDPOINT: process.env.PREMKU_PAY_ENDPOINT || 'pay',
  PREMKU_PAY_STATUS_CACHE_MS: envMs('PREMKU_PAY_STATUS_CACHE_MS', 25000, 5000),
  PREMKU_ORDER_STATUS_CACHE_MS: envMs('PREMKU_ORDER_STATUS_CACHE_MS', 30000, 10000),
  PREMKU_WEBHOOK_SECRET: process.env.PREMKU_WEBHOOK_SECRET || '',
  JWT_SECRET: process.env.JWT_SECRET || process.env.SESSION_SECRET || 'premiumin-plus-local-dev-secret',
  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_PORT: Number(process.env.DB_PORT || 3306),
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD || 'root',
  DB_NAME: process.env.DB_NAME || 'apps_premhytam',
  ADMIN_CONTACT: process.env.ADMIN_WHATSAPP || process.env.ADMIN || '',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || '',
  WHATSAPP_DELIVERY_WEBHOOK: process.env.WHATSAPP_DELIVERY_WEBHOOK || '',
  WHATSAPP_DELIVERY_TOKEN: process.env.WHATSAPP_DELIVERY_TOKEN || '',
  BOT_ENGINE_URL: (process.env.BOT_ENGINE_URL || 'http://localhost:4010').replace(/\/+$/, ''),
  REALTIME_EMIT_DEBOUNCE_MS: envMs('REALTIME_EMIT_DEBOUNCE_MS', 1200, 250),
  DASHBOARD_CACHE_MS: envMs('DASHBOARD_CACHE_MS', 30000, 5000),
  PRODUCTS_CACHE_MS: envMs('PRODUCTS_CACHE_MS', 20000, 5000),
  BOT_CATALOG_CACHE_MS: envMs('BOT_CATALOG_CACHE_MS', 20000, 5000),
  PROVIDER_SYNC_INTERVAL_MS: envMs('PROVIDER_SYNC_INTERVAL_MS', 60000, 30000),
  PROVIDER_PRODUCT_SYNC_INTERVAL_MS: envMs('PROVIDER_PRODUCT_SYNC_INTERVAL_MS', 60000, 30000),
  VERBOSE_PREMKU_LOGS: String(process.env.VERBOSE_PREMKU_LOGS || '').toLowerCase() === 'true',
  VERBOSE_SYSTEM_LOGS: String(process.env.VERBOSE_SYSTEM_LOGS || '').toLowerCase() === 'true',
};

export default env;
