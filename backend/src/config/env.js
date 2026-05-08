import dotenv from 'dotenv';

dotenv.config();

const env = {
  PORT: Number(process.env.PORT || 4000),
  PREMKU_API_KEY: process.env.API_KEY || process.env.PREMKU_API_KEY || '',
  PREMKU_BASE_URL: process.env.BASE_URL || 'https://premku.com/api/',
  PREMKU_ORDER_ENDPOINT: process.env.PREMKU_ORDER_ENDPOINT || 'order',
  PREMKU_STATUS_ENDPOINT: process.env.PREMKU_STATUS_ENDPOINT || 'status',
  PREMKU_PAY_ENDPOINT: process.env.PREMKU_PAY_ENDPOINT || 'pay',
  PREMKU_WEBHOOK_SECRET: process.env.PREMKU_WEBHOOK_SECRET || '',
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
  BOT_ENGINE_URL: process.env.BOT_ENGINE_URL || 'http://localhost:4100',
  BOT_ENGINE_TOKEN: process.env.BOT_ENGINE_TOKEN || '',
  ADMIN_MONITORING_LID: process.env.ADMIN_MONITORING_LID || '64957102211197@lid',
};

export default env;
