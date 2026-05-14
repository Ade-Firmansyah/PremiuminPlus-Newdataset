import { config } from '../config.js';

export class ReconnectBackoff {
  constructor() {
    this.attempts = 0;
  }

  reset() {
    this.attempts = 0;
  }

  nextDelay() {
    this.attempts += 1;
    if (this.attempts > config.reconnect.maxAttempts) return null;
    const base = Math.min(config.reconnect.minMs * 2 ** (this.attempts - 1), config.reconnect.maxMs);
    return base + Math.floor(Math.random() * 750);
  }
}
