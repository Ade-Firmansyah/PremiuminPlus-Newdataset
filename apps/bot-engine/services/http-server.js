import express from 'express';

function requireEngineToken(req, res, next) {
  const expected = process.env.BOT_ENGINE_TOKEN || '';
  if (!expected && process.env.NODE_ENV === 'production') {
    return res.status(503).json({ status: false, message: 'BOT_ENGINE_TOKEN belum dikonfigurasi' });
  }
  if (!expected) return next();
  if (req.headers['x-bot-engine-token'] !== expected) {
    return res.status(401).json({ status: false, message: 'Unauthorized bot engine request' });
  }
  return next();
}

export function createBotHttpServer({ manager, logger }) {
  const app = express();
  app.use(express.json({ limit: '512kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: true, service: 'premiumin-plus-bot-engine' });
  });

  app.use(requireEngineToken);

  app.post('/sessions/:sessionId/connect', async (req, res, next) => {
    try {
      const data = await manager.connect({
        sessionId: req.params.sessionId,
        apiKey: req.body?.api_key,
      });
      res.json({ status: true, data });
    } catch (error) {
      next(error);
    }
  });

  app.get('/sessions/:sessionId/status', (req, res) => {
    res.json({ status: true, data: manager.getStatus(req.params.sessionId) });
  });

  app.post('/sessions/:sessionId/logout', async (req, res, next) => {
    try {
      const data = await manager.logout(req.params.sessionId);
      res.json({ status: true, data });
    } catch (error) {
      next(error);
    }
  });

  app.post('/admin/notify', async (req, res, next) => {
    try {
      const data = await manager.notifyAdmin({
        title: req.body?.title,
        lines: Array.isArray(req.body?.lines) ? req.body.lines : [],
        lid: req.body?.lid,
      });
      res.json({ status: true, data });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    logger.error('Bot engine request failed', { message: error.message });
    res.status(error.statusCode || 500).json({
      status: false,
      message: error.message || 'Bot engine error',
    });
  });

  return app;
}
