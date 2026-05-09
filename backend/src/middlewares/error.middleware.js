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
    message: error.message || 'Internal server error',
  });
}
