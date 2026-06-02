import { logger } from '../utils/logger.js';

export async function processOrder(job) {
  logger('order-worker', job);
  return true;
}
