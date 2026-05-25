import { createBotHttpServer } from './services/http-server.js';
import { BotSessionManager } from './sockets/session-manager.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('BOT');
const port = Number(process.env.BOT_ENGINE_PORT || process.env.PORT || 4100);
const webCoreBaseUrl = process.env.BOT_API_BASE_URL || 'https://api.premiuminplus.store/api';

const manager = new BotSessionManager({ logger, webCoreBaseUrl });
const app = createBotHttpServer({ manager, logger });

const server = app.listen(port, () => {
  logger.info(`Bot engine running on port ${port}`);
  logger.info(`Web-core API: ${webCoreBaseUrl}`);
});

async function shutdown(signal) {
  logger.info(`Shutdown requested ${signal}`);
  await manager.shutdown();
  server.close(() => {
    logger.info(`Bot engine stopped ${signal}`);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

if (process.env.BOT_RESELLER_API_KEY) {
  const sessionId = process.env.BOT_SESSION_ID || 'default';
  manager
    .connect({
      sessionId,
      apiKey: process.env.BOT_RESELLER_API_KEY,
    })
    .then((status) => {
      logger.info(`Session auto connect requested ${status.session_id}`);
    })
    .catch((error) => {
      logger.error('Session auto connect failed', { message: error.message });
    });
}
