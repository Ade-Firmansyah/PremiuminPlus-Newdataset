import { logger } from '../utils/logger.js';

export function errorMiddleware(error, req, res, _next) {
  const statusCode = error.statusCode || 500;
  logger('ERROR', {
    message: error.message,
    stack: error.stack,
    statusCode,
    code: error.code,
    provider: error.provider,
    providerEndpoint: error.endpoint,
    retryAfterSeconds: error.data?.retry_after_seconds,
    method: req.method,
    path: req.originalUrl,
  });

  res.status(statusCode).json({
    status: false,
    success: false,
    code: error.code || undefined,
    message: error.message || 'Internal server error',
    data: error.data || undefined,
  });
}
