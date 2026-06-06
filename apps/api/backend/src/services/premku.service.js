import env from '../config/env.js';
import { execute } from '../config/db.js';
import { getSetting } from '../repositories/settings.repo.js';
import { logger } from '../utils/logger.js';

const inflight = new Map();
const failureBackoff = new Map();
const responseCache = new Map();
const requestQueue = [];
let activeRequests = 0;
let lastRequestStartedAt = 0;
let drainTimer = null;
let consecutiveFailures = 0;
let circuitOpenUntil = 0;
let lastProviderStatus = 'unknown';

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 30000;

const READ_ENDPOINTS = new Set(['products', 'profile', 'status', 'pay_status']);
const CACHE_TTL_MS = {
  products: 120000,
  profile: 60000,
  status: 10000,
  pay_status: 10000,
};

function maxConcurrency() {
  return Math.max(1, Math.min(5, Number(env.PREMKU_MAX_CONCURRENCY || 2)));
}

function minRequestInterval() {
  return Math.max(100, Number(env.PREMKU_MIN_REQUEST_INTERVAL_MS || 400));
}

function enqueueProviderRequest(run) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ run, resolve, reject });
    drainProviderQueue();
  });
}

function drainProviderQueue() {
  if (activeRequests >= maxConcurrency() || requestQueue.length === 0) return;

  const waitMs = Math.max(0, lastRequestStartedAt + minRequestInterval() - Date.now());
  if (waitMs > 0) {
    if (!drainTimer) {
      drainTimer = setTimeout(() => {
        drainTimer = null;
        drainProviderQueue();
      }, waitMs);
      drainTimer.unref?.();
    }
    return;
  }

  const job = requestQueue.shift();
  activeRequests += 1;
  lastRequestStartedAt = Date.now();
  Promise.resolve()
    .then(job.run)
    .then(job.resolve, job.reject)
    .finally(() => {
      activeRequests -= 1;
      drainProviderQueue();
    });

  drainProviderQueue();
}

function buildUrl(endpoint) {
  return new URL(endpoint.replace(/^\/+/, ''), env.PREMKU_BASE_URL);
}

function providerError(message, {
  code = 'PROVIDER_DOWN',
  statusCode = 503,
  endpoint = '',
  retryAfterMs = 15000,
  cause,
} = {}) {
  const safeRetryAfterMs = Number.isFinite(Number(retryAfterMs))
    ? Math.max(1000, Number(retryAfterMs))
    : 15000;
  const error = new Error(message);
  error.name = 'ProviderError';
  error.code = code;
  error.statusCode = statusCode;
  error.retryable = true;
  error.provider = 'premku';
  error.endpoint = endpoint;
  error.retryAfterMs = safeRetryAfterMs;
  error.data = {
    provider: 'premku',
    provider_status: code === 'PROVIDER_RATE_LIMITED' ? 'rate_limited' : 'down',
    retry_after_seconds: Math.max(1, Math.ceil(safeRetryAfterMs / 1000)),
  };
  if (cause) error.cause = cause;
  return error;
}

async function writeProviderLog(action, status, metadata = {}) {
  try {
    await execute(
      `INSERT INTO provider_logs (provider, action, status, metadata)
       VALUES ('premku', ?, ?, CAST(? AS JSON))`,
      [String(action || '').slice(0, 80), String(status || 'unknown').slice(0, 40), JSON.stringify(metadata)],
    );
  } catch {
    // Provider audit logging must never block customer requests.
  }
}

function markProviderSuccess(endpoint, durationMs) {
  const recovered = consecutiveFailures > 0 || lastProviderStatus === 'down';
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
  lastProviderStatus = 'online';
  if (recovered) {
    void writeProviderLog(endpoint, 'recovered', { duration_ms: durationMs });
    logger('PREMKU', { event: 'provider-recovered', endpoint, duration_ms: durationMs });
  }
}

function markProviderFailure(endpoint, error, durationMs) {
  consecutiveFailures += 1;
  lastProviderStatus = 'down';
  if (consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
  }
  const status = error?.code === 'PROVIDER_RATE_LIMITED' ? 'rate_limited' : 'down';
  void writeProviderLog(endpoint, status, {
    code: error?.code || 'PROVIDER_DOWN',
    message: error?.message || 'Provider request failed',
    duration_ms: durationMs,
    consecutive_failures: consecutiveFailures,
    circuit_open_until: circuitOpenUntil || null,
  });
  logger('PREMKU', {
    event: 'provider-down',
    endpoint,
    code: error?.code || 'PROVIDER_DOWN',
    duration_ms: durationMs,
    consecutive_failures: consecutiveFailures,
    circuit_open: circuitOpenUntil > Date.now(),
  });
}

async function getApiKey() {
  return (await getSetting('premku_api_key', env.PREMKU_API_KEY)) || env.PREMKU_API_KEY;
}

async function parseResponse(response, url, endpointName) {
  const raw = await response.text();
  logger('PREMKU', {
    endpoint: url.pathname.replace(/\/+$/, '').split('/').pop(),
    status: response.status,
    bytes: raw.length,
  });

  const trimmed = raw.trim();
  if (!trimmed) {
    throw providerError('Provider Premku mengembalikan respons kosong', {
      code: 'PROVIDER_INVALID_RESPONSE',
      statusCode: 502,
      endpoint: endpointName,
    });
  }

  if (trimmed.includes('<!DOCTYPE') || trimmed.startsWith('<')) {
    throw providerError('Provider Premku mengembalikan respons tidak valid', {
      code: 'PROVIDER_INVALID_RESPONSE',
      statusCode: 502,
      endpoint: endpointName,
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw providerError('Provider Premku mengembalikan JSON tidak valid', {
      code: 'PROVIDER_INVALID_RESPONSE',
      statusCode: 502,
      endpoint: endpointName,
    });
  }

  if (!response.ok) {
    const message = parsed?.message || parsed?.error || `Premku API error (${response.status})`;
    if (response.status === 429) {
      const retryAfterHeader = Number(response.headers.get('retry-after'));
      const retryAfterSeconds = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader
        : 30;
      throw providerError(message, {
        code: 'PROVIDER_RATE_LIMITED',
        statusCode: 503,
        endpoint: endpointName,
        retryAfterMs: Math.max(10000, retryAfterSeconds * 1000),
      });
    }
    if (response.status >= 500) {
      throw providerError(message, { endpoint: endpointName });
    }
    const error = new Error(message);
    error.code = 'PROVIDER_REJECTED';
    error.statusCode = 502;
    error.retryable = false;
    error.data = { provider: 'premku', provider_status: 'rejected' };
    throw error;
  }

  if (parsed?.success === false || parsed?.status === false) {
    const error = new Error(parsed?.message || parsed?.error || 'Premku API returned failed status');
    error.code = 'PROVIDER_REJECTED';
    error.statusCode = 502;
    error.retryable = false;
    error.data = { provider: 'premku', provider_status: 'rejected' };
    throw error;
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
  const isReadRequest = READ_ENDPOINTS.has(endpointName);
  if (circuitOpenUntil > Date.now()) {
    throw providerError('Provider Premku sedang tidak tersedia. Sistem menahan request sementara.', {
      code: 'PROVIDER_CIRCUIT_OPEN',
      endpoint: endpointName,
      retryAfterMs: circuitOpenUntil - Date.now(),
    });
  }
  const cached = responseCache.get(requestKey);
  if (isReadRequest && cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  if (cached) responseCache.delete(requestKey);

  const backoff = failureBackoff.get(requestKey);
  if (backoff && backoff > Date.now()) {
    throw providerError('Provider Premku sementara tidak tersedia. Request ditahan sebentar.', {
      code: 'PROVIDER_BACKOFF',
      endpoint: endpointName,
      retryAfterMs: backoff - Date.now(),
    });
  }
  if (backoff) failureBackoff.delete(requestKey);
  if (inflight.has(requestKey)) {
    return inflight.get(requestKey);
  }

  const run = async () => {
    const timeoutMs = isReadRequest
      ? Math.max(5000, Number(env.PREMKU_READ_TIMEOUT_MS || 15000))
      : Math.max(10000, Number(env.PREMKU_WRITE_TIMEOUT_MS || 30000));
    const startedAt = Date.now();

    try {
      const value = await enqueueProviderRequest(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(url, {
            method,
            headers: {
              'content-type': 'application/json',
            },
            body: method === 'GET' ? undefined : JSON.stringify({ api_key: apiKey, ...body }),
            signal: controller.signal,
          });
          return parseResponse(response, url, endpointName);
        } finally {
          clearTimeout(timeout);
        }
      });

      markProviderSuccess(endpointName, Date.now() - startedAt);
      if (isReadRequest) {
        responseCache.set(requestKey, {
          value,
          expiresAt: Date.now() + Number(CACHE_TTL_MS[endpointName] || 10000),
        });
      }
      failureBackoff.delete(requestKey);
      return value;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      if (error?.name === 'AbortError') {
        const timeoutError = providerError(`Provider Premku timeout pada endpoint ${endpointName}`, {
          code: 'PROVIDER_TIMEOUT',
          statusCode: 504,
          endpoint: endpointName,
          retryAfterMs: 15000,
          cause: error,
        });
        if (isReadRequest) failureBackoff.set(requestKey, Date.now() + 8000);
        markProviderFailure(endpointName, timeoutError, durationMs);
        throw timeoutError;
      }
      if (error?.code?.startsWith('PROVIDER_') && error.code !== 'PROVIDER_REJECTED') {
        if (isReadRequest) {
          const backoffMs = Math.min(30000, Math.max(8000, Number(error.retryAfterMs || 0)));
          failureBackoff.set(requestKey, Date.now() + backoffMs);
        }
        markProviderFailure(endpointName, error, durationMs);
        throw error;
      }
      if (error instanceof TypeError || ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(error?.cause?.code || error?.code)) {
        const unavailableError = providerError('Provider Premku tidak dapat dihubungi', {
          endpoint: endpointName,
          cause: error,
        });
        if (isReadRequest) failureBackoff.set(requestKey, Date.now() + 8000);
        markProviderFailure(endpointName, unavailableError, durationMs);
        throw unavailableError;
      }
      throw error;
    } finally {
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

export function getPremkuProviderState() {
  const now = Date.now();
  return {
    provider: 'premku',
    status: circuitOpenUntil > now ? 'down' : lastProviderStatus,
    consecutive_failures: consecutiveFailures,
    circuit_open: circuitOpenUntil > now,
    retry_after_seconds: circuitOpenUntil > now
      ? Math.max(1, Math.ceil((circuitOpenUntil - now) / 1000))
      : 0,
  };
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
