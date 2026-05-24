import app from './src/app.js';
import env from './src/config/env.js';
import http from 'node:http';
import { validateProductionEnv } from './src/config/validate-env.js';
import { closePool, ensureInitialized } from './src/config/db.js';
import { startMaintenanceScheduler, stopMaintenanceScheduler } from './src/workers/maintenance.scheduler.js';
import { startProviderSyncScheduler, stopProviderSyncScheduler } from './src/workers/provider-sync.scheduler.js';
import { closeRealtime, initRealtime } from './src/services/realtime.service.js';

validateProductionEnv();
await ensureInitialized();

const globalKey = Symbol.for('premiumin-plus.backend.server');
if (globalThis[globalKey]) {
  if (env.VERBOSE_SYSTEM_LOGS) console.warn('[BOT] Backend server already started in this process; skipping duplicate listen.');
} else {
  const server = http.createServer(app);
  globalThis[globalKey] = server;

  let shuttingDown = false;
  const shutdown = async (signal = 'SIGTERM') => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (env.VERBOSE_SYSTEM_LOGS) console.log(`[BOT] ${signal} received. Shutting down backend gracefully...`);
    stopMaintenanceScheduler();
    stopProviderSyncScheduler();
    closeRealtime();
    server.close(async () => {
      try {
        await closePool();
      } finally {
        delete globalThis[globalKey];
        process.exit(0);
      }
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  server.once('error', (error) => {
    if (error?.code === 'EADDRINUSE') {
      console.error(`[ERROR] Port ${env.PORT} is already in use. Run "npm run all" to reuse/clean local services, or stop the old backend process.`);
      process.exit(1);
    }
    throw error;
  });

  initRealtime(server);
  server.listen(env.PORT, () => {
    startMaintenanceScheduler();
    startProviderSyncScheduler();
    console.log(`Premiumin Plus backend running on port ${env.PORT}`);
  });

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}
