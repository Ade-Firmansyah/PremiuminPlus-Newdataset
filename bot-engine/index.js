import express from 'express';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { config } from './config.js';
import { SessionManager } from './sockets/sessionManager.js';

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.BOT_ENGINE_CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});
app.use(express.json({ limit: '256kb' }));

const server = app.listen(config.port, () => {
  console.log(`[bot-engine] listening on ${config.port}`);
});

const wsServer = new WebSocketServer({ server, path: '/realtime' });
const clients = new Map();

function broadcast(sessionId, payload) {
  const bucket = clients.get(String(sessionId));
  if (!bucket) return;
  const message = JSON.stringify({ sessionId: String(sessionId), ...payload });
  for (const client of bucket) {
    if (client.readyState === 1) client.send(message);
  }
}

const sessions = new SessionManager({ broadcast });
sessions.startSessionPruner();

wsServer.on('connection', async (socket, request) => {
  const url = new URL(request.url || '/realtime', `http://${request.headers.host}`);
  const sessionId = url.searchParams.get('sessionId');
  if (!sessionId) {
    socket.close(1008, 'sessionId required');
    return;
  }
  const key = String(sessionId);
  const bucket = clients.get(key) || new Set();
  bucket.add(socket);
  clients.set(key, bucket);
  socket.on('message', (raw) => {
    try {
      const payload = JSON.parse(String(raw));
      if (payload?.type === 'ping' && socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      }
    } catch {
      // Ignore non-JSON heartbeat noise.
    }
  });
  socket.on('close', () => {
    bucket.delete(socket);
    if (!bucket.size) clients.delete(key);
  });

  const snapshot = sessions.snapshot(key);
  const qr_image = snapshot.qr ? await QRCode.toDataURL(snapshot.qr).catch(() => '') : '';
  if (socket.readyState === 1) {
    socket.send(JSON.stringify({ sessionId: key, type: 'snapshot', ...snapshot, qr_image }));
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: true, service: 'premiumin-plus-bot-engine' });
});

app.post('/sessions/:userId/connect', async (req, res) => {
  try {
    if (!req.body?.apiKey) return res.status(400).json({ status: false, message: 'apiKey wajib diisi' });
    const data = await sessions.connect({ userId: req.params.userId, apiKey: req.body.apiKey });
    res.json({ status: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ status: false, message: error.message || 'Gagal connect session' });
  }
});

app.get('/sessions/:userId/status', async (req, res) => {
  const snapshot = sessions.snapshot(req.params.userId);
  const qr_image = snapshot.qr ? await QRCode.toDataURL(snapshot.qr).catch(() => '') : '';
  res.json({ status: true, data: { ...snapshot, qr_image } });
});

app.post('/sessions/:userId/disconnect', async (req, res) => {
  const data = await sessions.disconnect(req.params.userId);
  res.json({ status: true, data });
});

function shutdown() {
  sessions.stopSessionPruner();
  wsServer.close();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
