import { API_BASE_URL } from './api';
import { getApiKey, getToken } from '../store/useAuth';
import { subscribeSocket } from './socketManager';

type RealtimePayload = Record<string, unknown> & {
  type?: string;
  scope?: string;
  user_id?: number;
};

function coreRealtimeUrl() {
  const url = new URL(API_BASE_URL);
  const apiPath = url.pathname.replace(/\/api\/?$/, '');
  url.pathname = `${apiPath}/realtime`.replace(/\/{2,}/g, '/');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = getToken();
  const apiKey = getApiKey();
  if (token) url.searchParams.set('token', token);
  else if (apiKey) url.searchParams.set('apiKey', apiKey);
  return url.toString();
}

export function subscribeCoreRealtime(listener: (payload: RealtimePayload) => void) {
  return subscribeSocket(coreRealtimeUrl(), listener);
}
