import app from './app.js';
import env from './src/config/env.js';
import { initializeDatabase } from './src/config/db.js';
import { startMaintenanceScheduler } from './src/services/maintenance.service.js';
import { logger } from './src/utils/logger.js';

const skipDbInit = process.env.SKIP_DB_INIT === 'true';

if (!skipDbInit) {
  await initializeDatabase();
  startMaintenanceScheduler();
} else {
  logger('BACKEND', { event: 'database-init-skipped', reason: 'SKIP_DB_INIT=true' });
}

const server = app.listen(env.PORT, () => {
  logger('BACKEND', { event: 'server-started', port: env.PORT, dbInitialized: !skipDbInit });
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
