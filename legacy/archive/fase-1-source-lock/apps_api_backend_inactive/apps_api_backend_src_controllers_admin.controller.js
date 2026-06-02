const settingsService = require('../services/settings.service');
const markupService = require('../services/markup.service');

async function getPremkuKey(req, res, next) {
  try {
    const data = await settingsService.getPremkuKeyStatus(req.app.locals.db);
    res.json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
}

async function updatePremkuKey(req, res, next) {
  try {
    const result = await settingsService.updatePremkuKey(
      req.app.locals.db,
      req.body?.api_key,
      {
        sync: req.body?.sync !== false,
        req
      }
    );

    res.json({
      success: true,
      message: 'API key provider berhasil disimpan dan produk berhasil disinkronkan.',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

async function getMarkup(req, res, next) {
  try {
    const data = await markupService.getMarkupConfig(req.app.locals.db);
    res.json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
}

async function updateMarkup(req, res, next) {
  try {
    const result = await markupService.updateMarkup(req.app.locals.db, req.body || {});
    res.json({
      success: true,
      message: 'Markup berhasil disimpan dan harga produk disinkronkan.',
      data: {
        config: result.config,
        updated_products: result.updated_products,
        sample_before: result.sample_before,
        sample_after: result.sample_after
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getPremkuKey,
  updatePremkuKey,
  getMarkup,
  updateMarkup
};
