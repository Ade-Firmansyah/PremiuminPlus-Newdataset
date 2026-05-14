const apiKeyStorageKey = 'premiuminplus:api-key';
const tokenStorageKey = 'premiuminplus:token';
const sessionStorageKey = 'premiuminplus:session';

function readSessionAuth() {
  const raw = localStorage.getItem(sessionStorageKey) || sessionStorage.getItem(sessionStorageKey);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as { apiKey?: string; token?: string };
    return session;
  } catch {
    return null;
  }
}

export function saveApiKey(apiKey: string, remember = true) {
  localStorage.removeItem(apiKeyStorageKey);
  sessionStorage.removeItem(apiKeyStorageKey);
  (remember ? localStorage : sessionStorage).setItem(apiKeyStorageKey, apiKey);
}

export function getApiKey() {
  return readSessionAuth()?.apiKey || localStorage.getItem(apiKeyStorageKey) || sessionStorage.getItem(apiKeyStorageKey) || '';
}

export function saveToken(token: string, remember = true) {
  localStorage.removeItem(tokenStorageKey);
  sessionStorage.removeItem(tokenStorageKey);
  (remember ? localStorage : sessionStorage).setItem(tokenStorageKey, token);
}

export function getToken() {
  return readSessionAuth()?.token || localStorage.getItem(tokenStorageKey) || sessionStorage.getItem(tokenStorageKey) || '';
}

export function clearApiKey() {
  localStorage.removeItem(apiKeyStorageKey);
  sessionStorage.removeItem(apiKeyStorageKey);
  localStorage.removeItem(tokenStorageKey);
  sessionStorage.removeItem(tokenStorageKey);
}
