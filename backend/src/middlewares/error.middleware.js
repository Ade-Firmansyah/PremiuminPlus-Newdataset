export function errorMiddleware(error, _req, res, _next) {
  const statusCode = error.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  console.error('[ERROR]', {
    message: error.message,
    stack: isProduction ? undefined : error.stack,
    statusCode,
  });

  res.status(statusCode).json({
    status: false,
    message: statusCode >= 500 && isProduction ? 'Internal server error' : error.message || 'Internal server error',
  });
}
