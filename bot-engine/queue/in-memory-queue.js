export function createMemoryQueue() {
  const running = new Set();

  return {
    async add(key, task) {
      if (running.has(key)) {
        return null;
      }
      running.add(key);
      try {
        return await task();
      } finally {
        running.delete(key);
      }
    },
  };
}
