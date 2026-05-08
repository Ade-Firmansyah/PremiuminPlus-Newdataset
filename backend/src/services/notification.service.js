import env from '../config/env.js';
import { logger } from '../utils/logger.js';

export async function notifyAdmin(event, payload) {
  logger('NOTIFICATION', {
    admin: env.ADMIN_CONTACT ? 'configured' : 'not-configured',
    event,
    payload,
  });

  if (!env.BOT_ENGINE_URL) {
    return { status: 'manual_pending', message: 'BOT_ENGINE_URL not configured' };
  }

  try {
    const headers = { 'content-type': 'application/json' };
    if (env.BOT_ENGINE_TOKEN) headers['x-bot-engine-token'] = env.BOT_ENGINE_TOKEN;
    const response = await fetch(`${env.BOT_ENGINE_URL.replace(/\/$/, '')}/admin/notify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: `${String(event || 'SYSTEM').toUpperCase()} NOTIFICATION`,
        lid: env.ADMIN_MONITORING_LID,
        lines: Object.entries(payload || {}).map(([key, value]) => `${key}:\n${value}`),
      }),
    });
    return response.json();
  } catch (error) {
    logger('ERROR', { scope: 'admin-notification-bot', message: error instanceof Error ? error.message : 'notify failed' });
    return { status: 'failed' };
  }
}
