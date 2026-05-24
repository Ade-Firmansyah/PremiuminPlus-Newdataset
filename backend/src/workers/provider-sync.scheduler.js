import { query } from '../config/db.js';
import env from '../config/env.js';
import { refreshOrderStatus } from '../modules/order/order.service.js';
import { replaceProducts } from '../repositories/product.repo.js';
import { premku } from '../services/premku.service.js';
import { logger } from '../utils/logger.js';

const DEFAULT_INTERVAL_MS = env.PROVIDER_SYNC_INTERVAL_MS;
const PRODUCT_SYNC_INTERVAL_MS = env.PROVIDER_PRODUCT_SYNC_INTERVAL_MS;
let schedulerHandle = null;

function normalizeExternalProduct(item, index) {
  const basePrice = Number(item.price_base ?? item.price ?? item.harga ?? item.price_sell ?? item.nominal ?? 0);
  const name = String(item.name ?? item.product_name ?? item.nama ?? item.product ?? `Produk ${index + 1}`);
  const externalStatus = String(item.status ?? item.stock_status ?? '').toLowerCase();
  const stock = Number(item.stock ?? item.stok ?? 99);
  const status = ['active', 'available', 'ready', 'tersedia', 'success'].includes(externalStatus)
    ? 'active'
    : ['inactive', 'unavailable', 'empty', 'habis', 'soldout', 'sold_out'].includes(externalStatus) || stock <= 0
      ? 'inactive'
      : 'active';

  return {
    premku_id: Number(item.premku_id ?? item.id ?? item.product_id ?? index + 1),
    name,
    code: String(item.code ?? item.kode ?? name.toLowerCase().replace(/\s+/g, '-')),
    note: String(item.note ?? item.description ?? 'Produk dari API Premku.'),
    tag: String(item.tag ?? item.category ?? 'API'),
    image: String(item.image ?? item.img ?? item.thumbnail ?? item.logo ?? ''),
    product_source: 'provider',
    product_type: 'api',
    stock_mode: 'provider',
    provider: 'premku',
    provider_status: status,
    price_base: basePrice,
    price_sell: Number(item.price_sell ?? item.member_price ?? basePrice),
    member_price: Number(item.member_price ?? item.price_sell ?? basePrice),
    reseller_price: Number(item.reseller_price ?? item.price_sell ?? basePrice),
    stock,
    provider_stock: stock,
    manual_stock: 0,
    status,
  };
}

function extractProducts(payload) {
  const candidates = [payload?.data?.products, payload?.products, payload?.data, payload?.result, payload];
  const list = candidates.find((item) => Array.isArray(item));
  return Array.isArray(list) ? list : [];
}

export async function syncProviderProductsOnce() {
  try {
    const payload = await premku('products');
    const externalProducts = extractProducts(payload);
    if (!externalProducts.length) return 0;
    await replaceProducts(externalProducts.map(normalizeExternalProduct));
    logger('SYSTEM', { task: 'provider-product-sync', checked: externalProducts.length });
    return externalProducts.length;
  } catch (error) {
    logger('ERROR', {
      task: 'provider-product-sync',
      message: error instanceof Error ? error.message : 'provider product sync failed',
    });
    return 0;
  }
}

export async function runProviderSyncOnce() {
  const rows = await query(
    `SELECT invoice
     FROM transactions
     WHERE COALESCE(transaction_type, 'order') = 'order'
       AND status IN ('pending', 'processing')
     ORDER BY id ASC
     LIMIT 25`,
  );

  for (const row of rows) {
    try {
      await refreshOrderStatus(row.invoice);
    } catch (error) {
      logger('ERROR', {
        task: 'provider-sync',
        invoice: row.invoice,
        message: error instanceof Error ? error.message : 'provider sync failed',
      });
    }
  }

  if (rows.length) {
    logger('SYSTEM', { task: 'provider-sync', checked: rows.length });
  }
}

export function startProviderSyncScheduler({ intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  if (schedulerHandle) return schedulerHandle;

  syncProviderProductsOnce().catch((error) => {
    logger('ERROR', { task: 'provider-product-sync', message: error instanceof Error ? error.message : 'provider product sync failed' });
  });

  const timer = setInterval(() => {
    runProviderSyncOnce().catch((error) => {
      logger('ERROR', { task: 'provider-sync', message: error instanceof Error ? error.message : 'provider sync failed' });
    });
  }, intervalMs);

  const productTimer = setInterval(() => {
    syncProviderProductsOnce().catch((error) => {
      logger('ERROR', { task: 'provider-product-sync', message: error instanceof Error ? error.message : 'provider product sync failed' });
    });
  }, PRODUCT_SYNC_INTERVAL_MS);

  timer.unref?.();
  productTimer.unref?.();
  schedulerHandle = {
    stop() {
      clearInterval(timer);
      clearInterval(productTimer);
      schedulerHandle = null;
    },
  };
  return schedulerHandle;
}

export function stopProviderSyncScheduler() {
  schedulerHandle?.stop();
}
