async function request({ apiBaseUrl, apiKey }, path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok || data.status === false) {
    throw new Error(data.message || `Web-core request failed: ${path}`);
  }
  return data;
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
      request(config, '/bot/payments', {
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
