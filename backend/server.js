import app from './src/app.js';
import env from './src/config/env.js';
import { validateProductionEnv } from './src/config/validate-env.js';
import { ensureInitialized } from './src/config/db.js';
import { startMaintenanceScheduler } from './src/workers/maintenance.scheduler.js';
import { startProviderSyncScheduler } from './src/workers/provider-sync.scheduler.js';
import { initRealtime } from './src/services/realtime.service.js';

validateProductionEnv();
await ensureInitialized();
startMaintenanceScheduler();
startProviderSyncScheduler();

const server = app.listen(env.PORT, () => {
  console.log(`Premiumin Plus backend running on port ${env.PORT}`);
});
initRealtime(server);

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`[SYSTEM] Port ${env.PORT} is already in use. Stop the other backend process or set PORT to another value.`);
    process.exit(1);
  }
  throw error;
});
