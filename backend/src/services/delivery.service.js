import env from '../config/env.js';
import { logger } from '../utils/logger.js';

function normalizeWhatsapp(value) {
  const raw = String(value || '').replace(/[^\d]/g, '');
  if (!raw) return '';
  if (raw.startsWith('0')) return `62${raw.slice(1)}`;
  if (raw.startsWith('8')) return `62${raw}`;
  return raw;
}

export function validateWhatsapp(value) {
  const normalized = normalizeWhatsapp(value);
  return /^62\d{8,15}$/.test(normalized) ? normalized : '';
}

export function buildDeliveryMessage(order) {
  return [
    'Pesanan Premiumin Plus berhasil.',
    `Invoice: ${order.invoice}`,
    `Produk: ${order.product_name || '-'}`,
    `Email: ${order.email_account || '-'}`,
    `Password: ${order.password_account || '-'}`,
  ].join('\n');
}

export async function sendOrderDelivery(order) {
  const target = validateWhatsapp(order.target_whatsapp);
  if (!target) {
    return { status: 'failed', message: 'Nomor WhatsApp tujuan tidak valid' };
  }

  if (!env.WHATSAPP_DELIVERY_WEBHOOK) {
    logger('DELIVERY', { invoice: order.invoice, target, status: 'manual_pending' });
    return {
      status: 'manual_pending',
      message: 'WhatsApp delivery webhook belum dikonfigurasi',
      target_whatsapp: target,
      text: buildDeliveryMessage(order),
    };
  }

  const response = await fetch(env.WHATSAPP_DELIVERY_WEBHOOK, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(env.WHATSAPP_DELIVERY_TOKEN ? { authorization: `Bearer ${env.WHATSAPP_DELIVERY_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      to: target,
      message: buildDeliveryMessage(order),
      invoice: order.invoice,
      product_name: order.product_name,
      email: order.email_account,
      password: order.password_account,
    }),
  });

  if (!response.ok) {
    logger('DELIVERY', { invoice: order.invoice, target, status: 'failed', http_status: response.status });
    return { status: 'failed', message: `Webhook failed (${response.status})` };
  }

  logger('DELIVERY', { invoice: order.invoice, target, status: 'sent' });
  return { status: 'sent', target_whatsapp: target };
}

