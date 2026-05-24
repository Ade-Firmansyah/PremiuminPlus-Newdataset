import { WebSocketServer } from 'ws';
import { query } from '../config/db.js';
import env from '../config/env.js';
import { verifyJwt } from '../utils/jwt.js';
import { touchWebSession } from './web-session.service.js';

const clientsByUser = new Map();
const adminClients = new Set();
const pendingEmits = new Map();
let wsServer = null;

function send(socket, payload) {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify({ ...payload, ts: Date.now() }));
    return true;
  }
  return false;
}

function addToBucket(bucket, socket) {
  bucket.add(socket);
  socket.on('close', () => bucket.delete(socket));
}

async function findRealtimeUser({ token, apiKey }) {
  const tokenPayload = token ? verifyJwt(token) : null;
  const userId = tokenPayload?.sub ? Number(tokenPayload.sub) : 0;
  const rows = userId
    ? await query('SELECT id, username, role, status, token_version FROM users WHERE id = ? LIMIT 1', [userId])
    : await query('SELECT id, username, role, status, token_version FROM users WHERE api_key = ? LIMIT 1', [apiKey || '']);
  const user = rows[0] || null;
  if (!user || user.status !== 'active') return null;
  if (tokenPayload?.sub && Number(tokenPayload.token_version || 1) !== Number(user.token_version || 1)) return null;
  if (tokenPayload?.sub && !touchWebSession(tokenPayload)) return null;
  return {
    id: Number(user.id),
    username: user.username,
    role: user.role,
  };
}

export function initRealtime(server) {
  if (wsServer) return wsServer;

  wsServer = new WebSocketServer({ server, path: '/realtime' });
  wsServer.on('error', (error) => {
    console.error('[ERROR]', error?.code === 'EADDRINUSE' ? `Realtime port already in use: ${error.port || ''}` : error);
  });
  wsServer.on('connection', async (socket, request) => {
    try {
      const url = new URL(request.url || '/realtime', `http://${request.headers.host}`);
      const token = url.searchParams.get('token') || '';
      const apiKey = url.searchParams.get('apiKey') || '';
      const user = await findRealtimeUser({ token, apiKey });

      if (!user) {
        socket.close(1008, 'unauthorized');
        return;
      }

      const userKey = String(user.id);
      const userBucket = clientsByUser.get(userKey) || new Set();
      clientsByUser.set(userKey, userBucket);
      addToBucket(userBucket, socket);
      if (user.role === 'admin') addToBucket(adminClients, socket);

      socket.on('message', (raw) => {
        try {
          const payload = JSON.parse(String(raw));
          if (payload?.type === 'ping') send(socket, { type: 'pong' });
        } catch {
          // Ignore malformed heartbeat payloads.
        }
      });

      send(socket, {
        type: 'connected',
        user_id: user.id,
        role: user.role,
      });
    } catch {
      socket.close(1011, 'realtime_error');
    }
  });

  return wsServer;
}

function cleanBucket(bucket) {
  for (const socket of bucket) {
    if (socket.readyState !== 1) bucket.delete(socket);
  }
}

function emitToBucket(bucket, payload) {
  if (!bucket) return;
  cleanBucket(bucket);
  for (const socket of bucket) send(socket, payload);
}

function scheduleEmit(key, fn) {
  const existing = pendingEmits.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingEmits.delete(key);
    fn();
  }, env.REALTIME_EMIT_DEBOUNCE_MS);
  timer.unref?.();
  pendingEmits.set(key, timer);
}

export function publishRealtimeEvent(event = {}) {
  const payload = {
    type: event.type || 'refresh',
    scope: event.scope || 'system',
    entity: event.entity || null,
    id: event.id || null,
    user_id: event.userId || null,
  };
  const eventKey = `${payload.type}:${payload.scope}:${payload.entity || ''}:${payload.id || ''}`;

  if (event.userId) {
    const userKey = String(event.userId);
    scheduleEmit(`user:${userKey}:${eventKey}`, () => emitToBucket(clientsByUser.get(userKey), payload));
  }

  if (event.admin !== false) {
    scheduleEmit(`admin:${eventKey}`, () => emitToBucket(adminClients, payload));
  }
}

export function publishUserRefresh(userId, type, extra = {}) {
  publishRealtimeEvent({ ...extra, userId, type, admin: true });
}

export function closeRealtime() {
  for (const timer of pendingEmits.values()) clearTimeout(timer);
  pendingEmits.clear();
  for (const bucket of clientsByUser.values()) {
    for (const socket of bucket) socket.close(1001, 'server_shutdown');
  }
  for (const socket of adminClients) socket.close(1001, 'server_shutdown');
  clientsByUser.clear();
  adminClients.clear();
  if (wsServer) {
    wsServer.close();
    wsServer = null;
  }
}
