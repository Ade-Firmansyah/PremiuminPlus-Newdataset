const settingsRepository = require('../repositories/settings.repository');
const productRepository = require('../repositories/product.repository');
const cacheService = require('./cache.service');
const pricingService = require('./pricing.service');

const MARKUP_SETTING_KEY = 'pricing_markup_config';

async function getMarkupConfig(pool) {
  const setting = await settingsRepository.get(pool, MARKUP_SETTING_KEY);
  return pricingService.parseMarkupConfig(setting?.setting_value);
}

async function updateMarkup(pool, payload) {
  const config = pricingService.normalizeMarkupConfig(payload || {});
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const beforeRows = await productRepository.listPricingRows(connection);
    await settingsRepository.upsert(connection, MARKUP_SETTING_KEY, JSON.stringify(config), {
      valueType: 'json',
      isSecret: false,
      description: 'Global role markup config used to sync products.member_price and products.reseller_price.'
    });

    const updatedProducts = await pricingService.recalculateAllProductPrices(connection, config);
    const afterRows = await productRepository.listPricingRows(connection);
    await connection.commit();
    cacheService.clearProviderCaches();

    const sampleBefore = beforeRows.slice(0, 3).map(toPricingLogRow);
    const sampleAfter = afterRows.slice(0, 3).map(toPricingLogRow);
    console.info('[MARKUP] Pricing sync completed', {
      updated_products: updatedProducts,
      config,
      before: sampleBefore,
      after: sampleAfter
    });

    return {
      config,
      updated_products: updatedProducts,
      sample_before: sampleBefore,
      sample_after: sampleAfter
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {
      // Keep the original error.
    }
    throw error;
  } finally {
    connection.release();
  }
}

function toPricingLogRow(row) {
  return {
    id: row.id,
    base_price: Number(row.base_price || 0),
    admin_margin: Number(row.admin_margin || 0),
    member_markup: Number(row.member_markup || 0),
    reseller_markup: Number(row.reseller_markup || 0),
    member_price: Number(row.member_price || 0),
    reseller_price: Number(row.reseller_price || 0)
  };
}

module.exports = {
  MARKUP_SETTING_KEY,
  getMarkupConfig,
  updateMarkup
};
