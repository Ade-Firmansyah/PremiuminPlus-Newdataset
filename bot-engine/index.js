import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import QRCode from 'qrcode';
import { config } from './config.js';
import { SessionManager } from './sockets/sessionManager.js';

const app = express();
app.use((req, res, next) => {
  const allowedOrigins = String(process.env.BOT_ENGINE_CORS_ORIGIN || '*')
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const origin = String(req.headers.origin || '').replace(/\/+$/, '');
  if (allowedOrigins.includes('*') || !origin || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});
app.use(express.json({ limit: '256kb' }));

const globalKey = Symbol.for('premiumin-plus.bot-engine.server');
if (globalThis[globalKey]) {
  console.warn('[bot-engine] server already started in this process; skipping duplicate listen.');
}

const server = globalThis[globalKey] || http.createServer(app);
globalThis[globalKey] = server;

const wsKey = Symbol.for('premiumin-plus.bot-engine.ws');
const wsAlreadyStarted = Boolean(globalThis[wsKey]);
const wsServer = globalThis[wsKey] || new WebSocketServer({ server, path: '/realtime' });
globalThis[wsKey] = wsServer;
if (!wsAlreadyStarted) {
  wsServer.on('error', (error) => {
    console.error('[bot-engine:ws]', error?.code === 'EADDRINUSE' ? `port already in use: ${error.port || ''}` : error);
  });
}
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

if (!wsAlreadyStarted) wsServer.on('connection', async (socket, request) => {
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

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await sessions.shutdownAll('disconnected').catch(() => {});
  for (const bucket of clients.values()) {
    for (const client of bucket) client.close(1001, 'server_shutdown');
  }
  clients.clear();
  wsServer.close();
  server.close(() => {
    delete globalThis[globalKey];
    delete globalThis[wsKey];
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

server.once('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`[bot-engine] port ${config.port} is already in use. Run "npm run all" to reuse/clean local services, or stop the old bot-engine process.`);
    process.exit(1);
  }
  throw error;
});

if (!server.listening) {
  server.listen(config.port, () => {
    console.log(`[bot-engine] listening on ${config.port}`);
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
