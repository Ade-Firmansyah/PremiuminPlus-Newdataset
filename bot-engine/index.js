import { createBotHttpServer } from './services/http-server.js';
import { BotSessionManager } from './sockets/session-manager.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('BOT');
const port = Number(process.env.BOT_ENGINE_PORT || process.env.PORT || 4100);
const webCoreBaseUrl = process.env.BOT_API_BASE_URL || 'http://localhost:4000/api';

const manager = new BotSessionManager({ logger, webCoreBaseUrl });
const app = createBotHttpServer({ manager, logger });

app.listen(port, () => {
  logger.info(`Bot engine running on port ${port}`);
  logger.info(`Web-core API: ${webCoreBaseUrl}`);
});

if (process.env.BOT_RESELLER_API_KEY) {
  const sessionId = process.env.BOT_SESSION_ID || 'default';
  manager
    .connect({
      sessionId,
      apiKey: process.env.BOT_RESELLER_API_KEY,
    })
    .then((status) => {
      logger.info(`[BOT-SESSION] auto connect requested ${status.session_id}`);
    })
    .catch((error) => {
      logger.error('[BOT-SESSION] auto connect failed', { message: error.message });
    });
}
