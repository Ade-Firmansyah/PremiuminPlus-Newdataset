interface AdaptivePollingOptions<T> {
  task: () => Promise<T>;
  shouldContinue: (result: T | null) => boolean;
  onError?: (error: unknown) => void;
  activeMs?: number;
  idleMs?: number;
  idleAfterMs?: number;
  maxMs?: number;
}

export function startAdaptivePolling<T>({
  task,
  shouldContinue,
  onError,
  activeMs = 5000,
  idleMs = 15000,
  idleAfterMs = 60000,
  maxMs = 30 * 60 * 1000,
}: AdaptivePollingOptions<T>) {
  let stopped = false;
  let timer = 0;
  let running = false;
  const startedAt = Date.now();

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    let result: T | null = null;

    try {
      result = await task();
    } catch (error) {
      onError?.(error);
    } finally {
      running = false;
    }

    if (stopped || Date.now() - startedAt >= maxMs || !shouldContinue(result)) return;

    const delay = Date.now() - startedAt < idleAfterMs ? activeMs : idleMs;
    timer = window.setTimeout(tick, delay);
  };

  timer = window.setTimeout(tick, activeMs);

  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}
