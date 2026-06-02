import dotenv from 'dotenv';

dotenv.config();

function parseDatabaseUrl() {
  const raw =
    process.env.DATABASE_URL ||
    process.env.MYSQL_URL ||
    process.env.MYSQL_PUBLIC_URL ||
    process.env.MYSQL_PRIVATE_URL ||
    '';

  if (!raw) return {};

  try {
    const url = new URL(raw);
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username || ''),
      password: decodeURIComponent(url.password || ''),
      database: decodeURIComponent(url.pathname.replace(/^\//, '') || ''),
    };
  } catch {
    return {};
  }
}

const databaseUrl = parseDatabaseUrl();

const env = {
  HOST: process.env.HOST || '0.0.0.0',
  PORT: Number(process.env.PORT || 4000),
  PREMKU_API_KEY: process.env.API_KEY || process.env.PREMKU_API_KEY || '',
  PREMKU_BASE_URL: process.env.BASE_URL || 'https://premku.com/api/',
  PREMKU_ORDER_ENDPOINT: process.env.PREMKU_ORDER_ENDPOINT || 'order',
  PREMKU_STATUS_ENDPOINT: process.env.PREMKU_STATUS_ENDPOINT || 'status',
  PREMKU_PAY_ENDPOINT: process.env.PREMKU_PAY_ENDPOINT || 'pay',
  PREMKU_WEBHOOK_SECRET: process.env.PREMKU_WEBHOOK_SECRET || '',
  DB_HOST: process.env.DB_HOST || process.env.MYSQLHOST || databaseUrl.host || '',
  DB_PORT: Number(process.env.DB_PORT || process.env.MYSQLPORT || databaseUrl.port || 3306),
  DB_USER: process.env.DB_USER || process.env.MYSQLUSER || databaseUrl.user || '',
  DB_PASSWORD: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || databaseUrl.password || '',
  DB_NAME: process.env.DB_NAME || process.env.MYSQLDATABASE || databaseUrl.database || '',
  ADMIN_CONTACT: process.env.SUPPORT_WHATSAPP || process.env.ADMIN_WHATSAPP || process.env.ADMIN_PHONE || process.env.ADMIN || '',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || '',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',
  ADMIN_PHONE: process.env.ADMIN_PHONE || '',
  ADMIN_FORCE_RESET: String(process.env.ADMIN_FORCE_RESET || 'false').toLowerCase() === 'true',
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || '',
  WHATSAPP_DELIVERY_WEBHOOK: process.env.WHATSAPP_DELIVERY_WEBHOOK || '',
  WHATSAPP_DELIVERY_TOKEN: process.env.WHATSAPP_DELIVERY_TOKEN || '',
  BOT_ENGINE_URL: process.env.BOT_ENGINE_URL || '',
  BOT_ENGINE_TOKEN: process.env.BOT_ENGINE_TOKEN || '',
  ORDER_CREDENTIAL_SECRET: process.env.ORDER_CREDENTIAL_SECRET || process.env.DB_PASSWORD || process.env.PREMKU_API_KEY || 'premiuminplus-default-secret',
  ADMIN_MONITORING_LID: process.env.ADMIN_MONITORING_LID || '64957102211197@lid',
  DATA_RETENTION_DAYS: Number(process.env.DATA_RETENTION_DAYS || 7),
  MAINTENANCE_INTERVAL_MINUTES: Number(process.env.MAINTENANCE_INTERVAL_MINUTES || 1440),
  PAYMENT_QR_TTL_MINUTES: Number(process.env.PAYMENT_QR_TTL_MINUTES || 5),
};

export default env;
