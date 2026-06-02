import { useCallback, useEffect, useRef } from 'react';

type PollingDelay = number | (() => number);

interface StablePollingOptions {
  enabled?: boolean;
  immediate?: boolean;
  slowWhenHidden?: boolean;
  pauseWhenHidden?: boolean;
  refetchOnFocus?: boolean;
  focusThrottleMs?: number;
  minDelayMs?: number;
}

function resolveDelay(delay: PollingDelay) {
  return typeof delay === 'function' ? delay() : delay;
}

export function useStablePolling(
  task: () => Promise<void> | void,
  delay: PollingDelay,
  {
    enabled = true,
    immediate = true,
    slowWhenHidden = true,
    pauseWhenHidden = true,
    refetchOnFocus = true,
    focusThrottleMs = 15000,
    minDelayMs = 10000,
  }: StablePollingOptions = {},
) {
  const taskRef = useRef(task);
  const runningRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);
  const lastRunAtRef = useRef(0);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      clearTimer();
      return;
    }

    stoppedRef.current = false;

    const schedule = (nextDelay = resolveDelay(delay)) => {
      clearTimer();
      if (pauseWhenHidden && document.visibilityState === 'hidden') return;
      const hiddenMultiplier = slowWhenHidden && document.visibilityState === 'hidden' ? 4 : 1;
      timerRef.current = window.setTimeout(run, Math.max(minDelayMs, nextDelay * hiddenMultiplier));
    };

    const run = async () => {
      if (stoppedRef.current || runningRef.current) {
        schedule();
        return;
      }

      runningRef.current = true;
      lastRunAtRef.current = Date.now();
      try {
        await taskRef.current();
      } finally {
        runningRef.current = false;
        if (!stoppedRef.current) schedule();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && refetchOnFocus && Date.now() - lastRunAtRef.current >= focusThrottleMs) {
        void run();
      } else if (document.visibilityState === 'visible') {
        schedule();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    if (immediate) void run();
    else schedule();

    return () => {
      stoppedRef.current = true;
      clearTimer();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [clearTimer, delay, enabled, focusThrottleMs, immediate, minDelayMs, pauseWhenHidden, refetchOnFocus, slowWhenHidden]);
}
