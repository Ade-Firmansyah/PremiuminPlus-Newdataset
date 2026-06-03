import { findUserByApiKey } from '../repositories/user.repo.js';
import { getMaintenanceStatus, maintenanceResponse } from '../services/system-maintenance.service.js';

const ALWAYS_ALLOWED = [
  { method: 'GET', pattern: /^\/system\/status$/ },
  { method: 'GET', pattern: /^\/docs$/ },
];

const READ_ONLY_ALLOWED = [
  { method: 'GET', pattern: /^\/me$/ },
  { method: 'GET', pattern: /^\/products$/ },
  { method: 'GET', pattern: /^\/orders$/ },
  { method: 'GET', pattern: /^\/transactions$/ },
  { method: 'GET', pattern: /^\/saldo$/ },
  { method: 'GET', pattern: /^\/saldo-logs$/ },
  { method: 'GET', pattern: /^\/saldo\/logs$/ },
  { method: 'GET', pattern: /^\/notifications$/ },
  { method: 'GET', pattern: /^\/community\/settings$/ },
  { method: 'GET', pattern: /^\/dashboard\/summary$/ },
  { method: 'GET', pattern: /^\/leaderboard\/accounts$/ },
  { method: 'GET', pattern: /^\/order\/[^/]+$/ },
  { method: 'GET', pattern: /^\/deposits$/ },
];

function matches(list, method, path) {
  return list.some((item) => item.method === method && item.pattern.test(path));
}

function readApiKey(req) {
  const rawApiKey = req.headers['x-api-key'];
  const apiKey = Array.isArray(rawApiKey) ? String(rawApiKey[0] || '').trim() : String(rawApiKey || '').trim();
  if (apiKey) return apiKey;

  const rawAuthorization = req.headers.authorization;
  const authorization = Array.isArray(rawAuthorization) ? String(rawAuthorization[0] || '') : String(rawAuthorization || '');
  const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  return bearer ? bearer[1].trim() : '';
}

async function resolveRequestUser(req) {
  if (req.user) return req.user;
  const apiKey = readApiKey(req);
  if (!apiKey) return null;
  try {
    return await findUserByApiKey(apiKey);
  } catch {
    return null;
  }
}

export async function maintenanceGuard(req, res, next) {
  try {
    const method = String(req.method || 'GET').toUpperCase();
    const path = req.path || '';
    if (matches(ALWAYS_ALLOWED, method, path)) return next();

    const status = await getMaintenanceStatus();
    if (!status.enabled) return next();

    const user = await resolveRequestUser(req);
    if (user?.role === 'admin') return next();
    if (path.startsWith('/admin/')) return next();
    if (matches(READ_ONLY_ALLOWED, method, path)) return next();

    return res.status(503).json(maintenanceResponse(status));
  } catch (error) {
    return next(error);
  }
}

export async function blockPublicMutationDuringMaintenance(req, res, next) {
  try {
    const status = await getMaintenanceStatus();
    if (!status.enabled) return next();
    return res.status(503).json(maintenanceResponse(status));
  } catch (error) {
    return next(error);
  }
}
