export class MessageQueue {
  constructor() {
    this.items = [];
    this.running = false;
    this.recent = new Map();
  }

  add(id, task) {
    if (this.recent.has(id)) return;
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
    const cutoff = Date.now() - 60000;
    for (const [id, time] of this.recent.entries()) {
      if (time < cutoff) this.recent.delete(id);
    }
  }

  clear() {
    this.items = [];
    this.running = false;
    this.recent.clear();
  }
}
