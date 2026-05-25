import { addManualStock, createProduct, deleteProduct, listProducts, updateProduct } from '../../repositories/product.repo.js';
import { getDiscountSetting, getMarkupSetting } from '../../repositories/settings.repo.js';
import { calculateCanonicalPrices, calculateRoleSellPrice } from '../../services/pricing.service.js';
import { clearCache, getCache, setCache } from '../../services/cache.service.js';
import { publishStockChanged } from '../../services/product-events.service.js';
import env from '../../config/env.js';
import { requireFields } from '../../utils/validator.js';

async function applyMarkup(products, user = {}) {
  const markupSetting = await getMarkupSetting();
  const discountSetting = await getDiscountSetting();

  return products.map((product) => {
    const pricing = calculateRoleSellPrice(product, markupSetting, user);
    const canonical = calculateCanonicalPrices(product, markupSetting);
    return {
      ...product,
      price_sell: pricing.sellPrice,
      member_price: canonical.member_price,
      reseller_price: canonical.reseller_price,
      admin_margin: pricing.adminMargin,
      markup: pricing.roleMarkup,
      reseller_markup: pricing.resellerMarkup,
      reseller_markup_percent: pricing.reseller_markup_percent,
      discount_percent: discountSetting.discount_percent,
      stock: Number(product.effective_stock ?? product.stock ?? 0),
      availability_status: Number(product.effective_stock ?? product.stock ?? 0) > 0 ? 'tersedia' : 'belum_tersedia',
    };
  });
}

function invalidateProductCaches() {
  clearCache('products:');
  clearCache('provider-sync:products');
  clearCache('bot-catalog:');
}

export async function getProducts(_req, res) {
  const cached = getCache(`products:${_req.user.role}:${_req.user.id}:${_req.user.markup_percent || 0}`);
  if (cached) {
    return res.json(cached);
  }

  const products = await listProducts({
    visibleOnly: true,
    limit: Math.min(Math.max(Number(_req.query.limit || 50), 1), 100),
    page: Math.max(Number(_req.query.page || 1), 1),
  });

  const response = {
    status: true,
    source: 'local-db',
    data: await applyMarkup(products, _req.user),
  };
  setCache(`products:${_req.user.role}:${_req.user.id}:${_req.user.markup_percent || 0}`, response, env.PRODUCTS_CACHE_MS);
  return res.json(response);
}

export async function adminCreateProduct(req, res, next) {
  try {
    requireFields(req.body, ['name', 'code', 'price_base']);
    const data = await createProduct(req.body);
    invalidateProductCaches();
    publishStockChanged(data?.id);
    res.status(201).json({ status: true, data });
  } catch (error) {
    next(error);
  }
}

export async function adminAddManualStock(req, res, next) {
  try {
    const hasSingle = req.body?.email && req.body?.password;
    const hasBulk = req.body?.bulk || req.body?.text || (Array.isArray(req.body?.accounts) && req.body.accounts.length);
    if (!hasSingle && !hasBulk) requireFields(req.body, ['email', 'password']);
    const data = await addManualStock(req.params.id, req.body);
    if (!data) {
      return res.status(404).json({ status: false, message: 'Produk tidak ditemukan' });
    }
    invalidateProductCaches();
    publishStockChanged(data?.id || req.params.id);
    return res.status(201).json({ status: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function adminUpdateProduct(req, res, next) {
  try {
    const data = await updateProduct(req.params.id, req.body);
    if (!data) {
      return res.status(404).json({ status: false, message: 'Produk tidak ditemukan' });
    }
    invalidateProductCaches();
    publishStockChanged(data?.id || req.params.id);
    return res.json({ status: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function adminDeleteProduct(req, res, next) {
  try {
    const data = await deleteProduct(req.params.id);
    if (!data) {
      return res.status(404).json({ status: false, message: 'Produk tidak ditemukan' });
    }
    invalidateProductCaches();
    publishStockChanged(data?.id || req.params.id);
    return res.json({ status: true, data });
  } catch (error) {
    return next(error);
  }
}
