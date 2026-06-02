const express = require('express');
const { requireManagedBotAccess } = require('../middlewares/auth');
const productRepository = require('../repositories/product.repository');
const cacheService = require('../services/cache.service');

const router = express.Router();

router.use(requireManagedBotAccess());

router.get('/catalog', async (req, res, next) => {
  try {
    const role = req.user?.role === 'admin' ? 'admin' : 'reseller';
    const cacheKey = `bot-catalog:${role}`;
    const cached = cacheService.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached });
    }

    const products = await productRepository.listActiveForRole(req.app.locals.db, role === 'admin' ? 'admin' : 'reseller');
    cacheService.set(cacheKey, products, cacheService.TTL.botCatalog);
    return res.json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
});

router.use((req, res) => {
  res.status(501).json({
    success: false,
    message: 'Endpoint Bot Engine akan diaktifkan pada fase Bot Engine.'
  });
});

module.exports = router;
