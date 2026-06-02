import { logger } from '../utils/logger.js';

export function errorMiddleware(error, _req, res, _next) {
  const statusCode = error.statusCode || 500;
  logger('ERROR', {
    message: error.message,
    stack: error.stack,
    statusCode,
  });

  res.status(statusCode).json({
    status: false,
    success: false,
    code: error.code || undefined,
    message: error.message || 'Internal server error',
    data: error.data || undefined,
  });
}
