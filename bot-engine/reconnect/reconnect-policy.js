export function nextReconnectDelay(attempt) {
  const safeAttempt = Math.max(1, Number(attempt || 1));
  return Math.min(30000, safeAttempt * 2500);
}
