const apiKeyStorageKey = 'premiuminplus:api-key';

export function saveApiKey(apiKey: string, remember = true) {
  localStorage.removeItem(apiKeyStorageKey);
  sessionStorage.removeItem(apiKeyStorageKey);
  (remember ? localStorage : sessionStorage).setItem(apiKeyStorageKey, apiKey);
}

export function getApiKey() {
  return localStorage.getItem(apiKeyStorageKey) || sessionStorage.getItem(apiKeyStorageKey) || '';
}

export function clearApiKey() {
  localStorage.removeItem(apiKeyStorageKey);
  sessionStorage.removeItem(apiKeyStorageKey);
}
