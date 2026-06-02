import { createBotHttpServer } from './services/http-server.js';
import { BotSessionManager } from './sockets/session-manager.js';
import { createLogger } from './utils/logger.js';

const port = Number(process.env.PORT || process.env.BOT_ENGINE_PORT || 4100);
const webCoreBaseUrl = process.env.BOT_API_BASE_URL;
const logger = createLogger('BOT');

if (!webCoreBaseUrl) {
  throw new Error('BOT_API_BASE_URL is required for the bot engine.');
}

const manager = new BotSessionManager({ logger, webCoreBaseUrl });
const app = createBotHttpServer({ manager, logger });

const server = app.listen(port, () => {
  logger.info('Bot engine started', { port, webCoreBaseUrl });
});

function shutdown(signal) {
  logger.info('Bot engine shutdown requested', { signal });
  manager.shutdown().finally(() => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
