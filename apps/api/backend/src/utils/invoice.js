import crypto from 'crypto';

export function createInvoice(prefix = 'ORD') {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${stamp}-${random}`;
}

export const generateInvoice = createInvoice;
