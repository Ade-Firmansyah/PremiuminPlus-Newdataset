import env from '../config/env.js';
import { getSetting } from '../repositories/settings.repo.js';
import { logger } from '../utils/logger.js';

const inflight = new Map();
const failureBackoff = new Map();

function buildUrl(endpoint) {
  return new URL(endpoint.replace(/^\/+/, ''), env.PREMKU_BASE_URL);
}

async function getApiKey() {
  return (await getSetting('premku_api_key', env.PREMKU_API_KEY)) || env.PREMKU_API_KEY;
}

async function parseResponse(response, url) {
  const raw = await response.text();
  logger('PREMKU', {
    endpoint: url.pathname.replace(/\/+$/, '').split('/').pop(),
    status: response.status,
    bytes: raw.length,
    preview: raw.slice(0, 240),
  });

  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Invalid API response (empty body)');
  }

  if (trimmed.includes('<!DOCTYPE') || trimmed.startsWith('<')) {
    throw new Error('Invalid API response (HTML returned)');
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`Invalid JSON response from Premku: ${error instanceof Error ? error.message : 'parse error'}`);
  }

  if (!response.ok) {
    throw new Error(parsed?.message || parsed?.error || `Premku API error (${response.status})`);
  }

  if (parsed?.success === false || parsed?.status === false) {
    throw new Error(parsed?.message || parsed?.error || 'Premku API returned failed status');
  }

  return parsed;
}

async function premkuRequest(endpoint, { method = 'POST', body = {}, query = {} } = {}) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return {
      success: false,
      status: false,
      message: 'PREMKU API key is not configured',
    };
  }

  const url = buildUrl(endpoint);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const endpointName = url.pathname.replace(/\/+$/, '').split('/').pop();
  const requestKey = `${method}:${endpointName}:${JSON.stringify(body)}:${url.search}`;
  const backoff = failureBackoff.get(requestKey);
  if (backoff && backoff > Date.now()) {
    throw new Error('Premku sementara tidak tersedia, request ditahan sebentar');
  }
  if (inflight.has(requestKey)) {
    return inflight.get(requestKey);
  }

  const run = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
        },
        body: method === 'GET' ? undefined : JSON.stringify({ api_key: apiKey, ...body }),
        signal: controller.signal,
      });

      return await parseResponse(response, url);
    } catch (error) {
      if (/products|profile|status|pay_status/i.test(endpointName || '')) {
        failureBackoff.set(requestKey, Date.now() + 2500);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      inflight.delete(requestKey);
    }
  };

  const promise = run();
  inflight.set(requestKey, promise);
  return promise;
}

export async function getPremkuApiKey() {
  return getApiKey();
}

export function premkuOrder(data = {}) {
  return premkuRequest('order', {
    method: 'POST',
    body: data,
  });
}

export function premkuStatus(invoice) {
  return premkuRequest('status', {
    method: 'POST',
    body: { invoice },
  });
}

export function premkuPay(data = {}) {
  return premkuRequest('pay', {
    method: 'POST',
    body: data,
  });
}

export function premkuPayStatus(invoice) {
  return premkuRequest('pay_status', {
    method: 'POST',
    body: { invoice },
  });
}

export function premkuCancelPay(invoice) {
  return premkuRequest('cancel_pay', {
    method: 'POST',
    body: { invoice },
  });
}

export function premkuProfile() {
  return premkuRequest('profile', {
    method: 'POST',
    body: {},
  });
}

export async function premku(endpoint, data = {}, options = {}) {
  return premkuRequest(endpoint, {
    method: options.method || 'POST',
    body: data,
    query: options.query || {},
  });
}
