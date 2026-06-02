const settingsRepository = require('../repositories/settings.repository');
const activityLogRepository = require('../repositories/activityLog.repository');
const premkuService = require('./premku.service');
const productSyncService = require('./productSync.service');
const cacheService = require('./cache.service');
const { maskApiKey } = require('../utils/apiKey');

async function getPremkuKeyStatus(pool) {
  const setting = await settingsRepository.get(pool, 'premku_api_key');
  const envKey = process.env.PREMKU_API_KEY || process.env.API_KEY || '';
  const apiKey = setting?.setting_value || envKey;

  return {
    has_key: Boolean(apiKey),
    masked_key: maskApiKey(apiKey),
    source: setting?.setting_value ? 'settings' : (envKey ? 'env' : 'none')
  };
}

async function logActivity(pool, req, action, metadata = {}) {
  await activityLogRepository.create(pool, {
    user_id: req.user?.id,
    actor_role: req.user?.role,
    action,
    entity_type: 'settings',
    entity_id: 'premku_api_key',
    ip_address: req.ip,
    user_agent: req.get('user-agent'),
    metadata
  });
}

async function updatePremkuKey(pool, apiKey, options = {}) {
  const nextKey = String(apiKey || '').trim();
  if (!nextKey) {
    const error = new Error('API key provider wajib diisi.');
    error.statusCode = 400;
    error.publicMessage = 'API key provider wajib diisi.';
    throw error;
  }

  const maskedKey = maskApiKey(nextKey);
  const testResult = await premkuService.testKey(nextKey);

  if (!testResult.success) {
    if (options.req) {
      await logActivity(pool, options.req, 'provider_sync_failed', {
        masked_key: maskedKey,
        reason: testResult.reason
      });
    }

    const error = new Error(testResult.message);
    error.statusCode = 400;
    error.publicMessage = 'API key Premku tidak valid atau provider tidak merespons.';
    throw error;
  }

  await settingsRepository.upsert(pool, 'premku_api_key', nextKey, {
    valueType: 'string',
    isSecret: true,
    description: 'Runtime Premku API key. Env is only fallback/bootstrap.'
  });

  cacheService.clearProviderCaches();

  let syncResult;
  try {
    syncResult = options.sync === false
      ? { synced_products: 0, updated_products: 0, created_products: 0, failed_products: 0 }
      : await productSyncService.syncFromPremku(pool, testResult.products);
    cacheService.clearProviderCaches();
  } catch (error) {
    if (options.req) {
      await logActivity(pool, options.req, 'provider_sync_failed', {
        masked_key: maskedKey,
        reason: error.message
      });
    }

    error.publicMessage = 'API key tersimpan, tetapi sinkronisasi produk Premku gagal.';
    throw error;
  }

  if (options.req) {
    await logActivity(pool, options.req, 'admin_update_premku_key', { masked_key: maskedKey });
    await logActivity(pool, options.req, 'provider_sync_success', {
      masked_key: maskedKey,
      ...syncResult
    });
  }

  return syncResult;
}

module.exports = {
  getPremkuKeyStatus,
  updatePremkuKey
};
