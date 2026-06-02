const inflight = new Map();
const recentFailures = new Map();

async function request({ apiBaseUrl, apiKey }, path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const key = `${method}:${path}:${options.body || ''}`;
  const failure = recentFailures.get(key);
  if (failure && failure.until > Date.now()) {
    throw failure.error;
  }
  if (method === 'GET' && inflight.has(key)) return inflight.get(key);

  const run = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 10000));
    try {
      const response = await fetch(`${apiBaseUrl}${path}`, {
        ...options,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          ...(options.headers || {}),
        },
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status === false) {
        const error = new Error(data.message || `Web-core request failed: ${path}`);
        error.statusCode = response.status;
        error.maintenance = Boolean(data.maintenance);
        throw error;
      }
      return data;
    } catch (error) {
      const normalized = error?.name === 'AbortError' ? new Error(`Web-core timeout: ${path}`) : error;
      if (method === 'GET' && !normalized?.maintenance) {
        recentFailures.set(key, { until: Date.now() + 2500, error: normalized });
      }
      throw normalized;
    } finally {
      clearTimeout(timeout);
      inflight.delete(key);
    }
  };

  const promise = run();
  if (method === 'GET') inflight.set(key, promise);
  return promise;
}

export function createWebCoreClient(config) {
  return {
    profile: () => request(config, '/bot/profile'),
    catalog: () => request(config, '/bot/catalog'),
    order: (payload) =>
      request(config, '/bot/order', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    payment: (payload) =>
      request(config, '/bot/order/init', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    paymentStatus: (invoice) => request(config, `/bot/payments/${invoice}/status`),
    paymentCancel: (invoice) =>
      request(config, `/bot/payments/${invoice}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ invoice }),
      }),
  };
}
