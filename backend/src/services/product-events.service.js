import { clearCache } from './cache.service.js';
import { publishRealtimeEvent } from './realtime.service.js';

export function publishStockChanged(productId = null) {
  clearCache('products:');
  clearCache('bot-catalog:');
  clearCache('provider-sync:products');

  const id = productId || null;
  publishRealtimeEvent({ type: 'stock.updated', scope: 'stock', entity: 'product', id });
  publishRealtimeEvent({ type: 'product.updated', scope: 'product', entity: 'product', id });
  publishRealtimeEvent({ type: 'dashboard.updated', scope: 'dashboard', entity: 'stock', id });
  publishRealtimeEvent({ type: 'bot.updated', scope: 'bot', entity: 'catalog', id });
}
