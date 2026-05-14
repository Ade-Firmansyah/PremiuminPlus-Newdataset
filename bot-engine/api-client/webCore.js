import { setTimeout as delay } from 'node:timers/promises';
import { config } from '../config.js';

export class WebCoreClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async request(path, options = {}) {
    const response = await fetch(`${config.webCoreUrl}/api${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.status === false) {
      const error = new Error(payload.message || `Web-Core API error ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }
    return payload.data ?? payload;
  }

  profile() {
    return this.request('/bot/profile');
  }

  catalog() {
    return this.request('/bot/catalog');
  }

  createOrder({ code, customerWhatsapp }) {
    return this.request('/bot/order', {
      method: 'POST',
      body: JSON.stringify({ code, customer_whatsapp: customerWhatsapp }),
    });
  }

  paymentStatus(invoice) {
    return this.request(`/bot/payments/${encodeURIComponent(invoice)}/status`);
  }

  sessionStatus(status) {
    return this.request('/bot/session/status', {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  }
}

export async function withRetry(task, attempts = 2) {
  let lastError;
  for (let index = 0; index <= attempts; index += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (index < attempts) await delay(500 * (index + 1));
    }
  }
  throw lastError;
}
