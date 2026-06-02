import { getSetting, setSetting } from '../repositories/settings.repo.js';
import { deleteCache, getCache, setCache } from './cache.service.js';

const CACHE_KEY = 'system:maintenance';
const DEFAULT_MESSAGE = 'Web sedang maintenance. Mohon tidak melakukan transaksi terlebih dahulu.';

function normalizeEnabled(value) {
  if (typeof value === 'boolean') return value;
  return ['enabled', 'true', '1', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

export function clearMaintenanceCache() {
  deleteCache(CACHE_KEY);
}

export async function getMaintenanceStatus({ fresh = false } = {}) {
  if (!fresh) {
    const cached = getCache(CACHE_KEY);
    if (cached) return cached;
  }

  let mode = 'disabled';
  let message = DEFAULT_MESSAGE;
  let startedAt = null;
  let startedBy = null;
  try {
    mode = await getSetting('maintenance_mode', 'disabled');
    message = await getSetting('maintenance_message', DEFAULT_MESSAGE);
    startedAt = await getSetting('maintenance_started_at', null);
    startedBy = await getSetting('maintenance_started_by', null);
  } catch (error) {
    if (!String(error?.message || '').includes('Database pool not initialized')) {
      throw error;
    }
  }
  const enabled = normalizeEnabled(mode);
  const data = {
    enabled,
    maintenance: enabled,
    mode: enabled ? 'enabled' : 'disabled',
    message,
    started_at: startedAt,
    started_by: startedBy,
  };

  setCache(CACHE_KEY, data, 5);
  return data;
}

export async function setMaintenanceStatus({ enabled, message, adminId = null }) {
  const active = Boolean(enabled);
  const cleanMessage = String(message || DEFAULT_MESSAGE).slice(0, 500);

  await setSetting('maintenance_mode', active ? 'enabled' : 'disabled');
  await setSetting('maintenance_message', cleanMessage);
  await setSetting('maintenance_started_at', active ? new Date().toISOString() : null);
  await setSetting('maintenance_started_by', active ? adminId : null);
  clearMaintenanceCache();

  return getMaintenanceStatus({ fresh: true });
}

export function maintenanceResponse(status) {
  return {
    status: false,
    success: false,
    maintenance: true,
    message: status?.message || DEFAULT_MESSAGE,
  };
}
