const productRepository = require('../repositories/product.repository');
const cacheService = require('../services/cache.service');

async function listProducts(req, res, next) {
  try {
    const role = req.user?.role === 'admin'
      ? 'admin'
      : (req.user?.role === 'reseller' ? 'reseller' : 'member');
    const cacheKey = `products:${role}`;
    const cached = cacheService.get(cacheKey);

    if (cached) {
      return res.json({
        success: true,
        data: cached
      });
    }

    const products = await productRepository.listActiveForRole(req.app.locals.db, role);
    cacheService.set(cacheKey, products, cacheService.TTL.products);

    return res.json({
      success: true,
      data: products
    });
  } catch (error) {
    next(error);
  }
}

async function getProduct(req, res, next) {
  try {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID produk tidak valid.'
      });
    }

    const role = req.user?.role === 'admin'
      ? 'admin'
      : (req.user?.role === 'reseller' ? 'reseller' : 'member');
    const product = await productRepository.findOrderableById(req.app.locals.db, productId, role);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produk tidak ditemukan.'
      });
    }

    return res.json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { listProducts, getProduct };
