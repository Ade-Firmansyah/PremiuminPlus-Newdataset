import app from './src/app.js';
import env from './src/config/env.js';
import { ensureInitialized } from './src/config/db.js';
import { startMaintenanceScheduler } from './src/services/maintenance.service.js';
import { logger } from './src/utils/logger.js';

await ensureInitialized();
startMaintenanceScheduler();

const server = app.listen(env.PORT, '0.0.0.0', () => {
  logger('BACKEND', { event: 'server-started', host: '0.0.0.0', port: env.PORT });
});

function shutdown(signal) {
  logger('BACKEND', { event: 'shutdown-requested', signal });
  server.close(() => {
    logger('BACKEND', { event: 'server-stopped', signal });
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    logger('ERROR', { event: 'port-in-use', port: env.PORT, hint: `Get-NetTCPConnection -LocalPort ${env.PORT} -State Listen` });
    process.exit(1);
  }

  throw error;
});
