export const WEB_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const sessionKey = 'premiuminplus:session';
const apiKeyStorageKey = 'premiuminplus:api-key';
const tokenStorageKey = 'premiuminplus:token';
const activityKey = 'premiuminplus:last-activity';
const pendingDepositKey = 'premiuminplus:pending-deposit-invoice';

export function getLastWebActivityAt() {
  const raw = localStorage.getItem(activityKey) || sessionStorage.getItem(activityKey);
  const value = Number(raw || 0);
  return Number.isFinite(value) ? value : 0;
}

export function touchWebActivity(storage: Storage = localStorage) {
  storage.setItem(activityKey, String(Date.now()));
}

export function isWebSessionExpired() {
  const lastActivityAt = getLastWebActivityAt();
  return Boolean(lastActivityAt && Date.now() - lastActivityAt > WEB_SESSION_TIMEOUT_MS);
}

export function clearWebSessionStorage() {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(sessionKey);
    storage.removeItem(apiKeyStorageKey);
    storage.removeItem(tokenStorageKey);
    storage.removeItem(activityKey);
    storage.removeItem(pendingDepositKey);
  }
}
