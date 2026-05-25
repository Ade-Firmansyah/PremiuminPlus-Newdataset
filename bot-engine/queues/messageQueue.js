export class MessageQueue {
  constructor({ maxSize = 100, recentTtlMs = 60000 } = {}) {
    this.items = [];
    this.running = false;
    this.recent = new Map();
    this.maxSize = maxSize;
    this.recentTtlMs = recentTtlMs;
  }

  add(id, task) {
    if (this.recent.has(id)) return;
    if (this.items.length >= this.maxSize) this.items.shift();
    this.recent.set(id, Date.now());
    this.items.push(task);
    this.cleanup();
    void this.run();
  }

  async run() {
    if (this.running) return;
    this.running = true;
    while (this.items.length) {
      const task = this.items.shift();
      await task().catch(() => {});
    }
    this.running = false;
  }

  cleanup() {
    const cutoff = Date.now() - this.recentTtlMs;
    for (const [id, time] of this.recent.entries()) {
      if (time < cutoff) this.recent.delete(id);
    }
    while (this.recent.size > this.maxSize * 2) {
      const oldest = this.recent.keys().next().value;
      if (!oldest) break;
      this.recent.delete(oldest);
    }
  }

  clear() {
    this.items = [];
    this.running = false;
    this.recent.clear();
  }
}
