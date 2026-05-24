export function withExpiry(doc = {}, days = 7) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return { ...doc, createdAt: now, expires_at: expiresAt };
}

export function expiresDateFromDays(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
