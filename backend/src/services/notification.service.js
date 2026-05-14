import env from '../config/env.js';
import { logger } from '../utils/logger.js';

export async function notifyAdmin(event, payload) {
  logger('NOTIFICATION', {
    admin: env.ADMIN_CONTACT ? 'configured' : 'not-configured',
    event,
    payload,
  });
}
