import {
  addManualStockItem,
  createProduct,
  deleteManualStockItemById,
  deleteManualStockItem,
  deleteProduct,
  disableManualStockItem,
  findProductById,
  listProductStockItems,
  listProducts,
  replaceProducts,
  updateManualStockItemById,
  updateManualStockItem,
  updateProduct,
} from '../../repositories/product.repo.js';
import { getDiscountSetting, getMarkupSetting } from '../../repositories/settings.repo.js';
import { calculateProductPrices } from '../../services/product-pricing.service.js';
import { premku } from '../../services/premku.service.js';
import { requireFields } from '../../utils/validator.js';
import { deleteCachePrefix, remember } from '../../services/cache.service.js';

async function normalizeExternalProduct(item, index) {
  const basePrice = Number(item.price_base ?? item.price ?? item.harga ?? item.price_sell ?? item.nominal ?? 0);
  const name = String(item.name ?? item.product_name ?? item.nama ?? item.product ?? `Produk ${index + 1}`);
  const externalStatus = String(item.status ?? item.stock_status ?? '').toLowerCase();
  const stock = Number(item.stock ?? item.stok ?? 99);
  const status = ['active', 'available', 'ready', 'tersedia', 'success'].includes(externalStatus)
    ? 'active'
    : ['inactive', 'unavailable', 'empty', 'habis', 'soldout', 'sold_out'].includes(externalStatus) || stock <= 0
      ? 'inactive'
      : 'active';

  const product = {
    id: Number(item.id ?? item.product_id ?? index + 1),
    premku_id: Number(item.premku_id ?? item.id ?? item.product_id ?? index + 1),
    name,
    code: String(item.code ?? item.kode ?? name.toLowerCase().replace(/\s+/g, '-')),
    note: String(item.note ?? item.description ?? 'Produk dari API Premku.'),
    tag: String(item.tag ?? item.category ?? 'API'),
    image: String(item.image ?? item.img ?? item.thumbnail ?? item.logo ?? ''),
    tutorial_url: String(item.tutorial_url ?? item.tutorial ?? item.youtube_url ?? ''),
    base_price: basePrice,
    stock,
    status,
    availability_status: stock > 0 ? 'tersedia' : 'belum_tersedia',
  };

  // Pre-calculate prices using markup settings
  try {
    const markupSetting = await getMarkupSetting();
    const prices = calculateProductPrices(product, markupSetting);
    product.member_price = prices.member_price;
    product.reseller_price = prices.reseller_price;
  } catch {
    // Fallback to base price if markup setting fails
    product.member_price = basePrice;
    product.reseller_price = basePrice;
  }

  return product;
}

function extractProducts(payload) {
  const candidates = [payload?.data?.products, payload?.products, payload?.data, payload?.result, payload];
  const list = candidates.find((item) => Array.isArray(item));
  return Array.isArray(list) ? list : [];
}

function normalizeProductPayload(payload = {}) {
  const productSource = String(payload.product_source || 'provider').toLowerCase();
  const status = String(payload.status || 'active').toLowerCase();
  if (!['provider', 'manual', 'hybrid'].includes(productSource)) {
    const error = new Error('Tipe produk tidak valid');
    error.statusCode = 400;
    throw error;
  }
  if (!['active', 'inactive'].includes(status)) {
    const error = new Error('Status produk tidak valid');
    error.statusCode = 400;
    throw error;
  }
  return {
    ...payload,
    product_source: productSource,
    status,
  };
}

function validateFinalPrices(payload = {}) {
  const resellerPrice = Number(payload.reseller_price || 0);
  if (resellerPrice <= 0) {
    const error = new Error('Harga reseller harus lebih dari 0.');
    error.statusCode = 400;
    throw error;
  }
}

async function applyRoleBasedPricing(products, user = {}, displayDiscount = {}) {
  void user;
  const discountLabelPercent = Math.max(0, Math.min(100, Number(displayDiscount.discount_percent || 0)));

  return products.map((product) => {
    const finalPrice = product.reseller_price;
    const {
      member_price: _memberPrice,
      member_markup: _memberMarkup,
      ...publicProduct
    } = product;
    return {
      ...publicProduct,
      price: finalPrice,
      final_price: finalPrice,
      discount_label_percent: discountLabelPercent,
      availability_status: Number(product.stock || 0) > 0 ? 'tersedia' : 'belum_tersedia',
    };
  });
}

export async function getProducts(_req, res) {
  const [products, discountSetting] = await Promise.all([
    remember('products:local', 5, () => listProducts()),
    getDiscountSetting(),
  ]);

  res.json({
    status: true,
    source: 'database',
    data: await applyRoleBasedPricing(products, _req.user, discountSetting),
  });
}

export async function adminSyncProviderProducts(_req, res, next) {
  try {
    const products = await remember('premku:products:synced', 120, async () => {
      const payload = await premku('products');
      const externalProducts = extractProducts(payload);
      if (!externalProducts.length) return [];
      const normalized = await Promise.all(externalProducts.map((item, index) => normalizeExternalProduct({ ...item, raw_response: item }, index)));
      await replaceProducts(normalized);
      deleteCachePrefix('products:');
      deleteCachePrefix('bot:catalog:');
      return listProducts();
    });

    res.json({
      status: true,
      source: 'premku',
      data: products,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminCreateProduct(req, res, next) {
  try {
    requireFields({ ...req.body, base_price: req.body?.base_price ?? req.body?.price_base }, ['name', 'code', 'base_price']);
    const normalized = normalizeProductPayload(req.body);
    const markupSetting = await getMarkupSetting();
    const calculated = calculateProductPrices(normalized, markupSetting);
    const resellerPrice = Number(req.body?.reseller_price || 0) > 0 ? Number(req.body.reseller_price) : calculated.reseller_price;
    const payload = {
      ...normalized,
      member_price: resellerPrice,
      reseller_price: resellerPrice,
    };
    validateFinalPrices(payload);
    const data = await createProduct(payload);
    deleteCachePrefix('products:');
    deleteCachePrefix('dashboard:');
    deleteCachePrefix('admin:');
    deleteCachePrefix('bot:catalog:');
    res.status(201).json({ status: true, data });
  } catch (error) {
    next(error);
  }
}

export async function adminCreateManualProduct(req, res, next) {
  req.body = { ...req.body, product_source: 'manual' };
  return adminCreateProduct(req, res, next);
}

export async function adminCreateHybridProduct(req, res, next) {
  req.body = { ...req.body, product_source: 'hybrid' };
  return adminCreateProduct(req, res, next);
}

export async function adminListProducts(_req, res, next) {
  try {
    const data = await listProducts();
    return res.json({ status: true, source: 'database', data });
  } catch (error) {
    return next(error);
  }
}

export async function adminUpdateProduct(req, res, next) {
  try {
    const current = await findProductById(req.params.id);
    if (!current) {
      return res.status(404).json({ status: false, message: 'Produk tidak ditemukan' });
    }
    const normalized = normalizeProductPayload({ ...current, ...req.body });
    const resellerPriceInvalid = Number(normalized.reseller_price || 0) <= 0;
    let payload = normalized;
    if (resellerPriceInvalid) {
      const markupSetting = await getMarkupSetting();
      const calculated = calculateProductPrices(normalized, markupSetting);
      payload = {
        ...normalized,
        reseller_price: Number(normalized.reseller_price || 0) > 0 ? normalized.reseller_price : calculated.reseller_price,
      };
    }
    payload = { ...payload, member_price: Number(payload.reseller_price || 0) };
    validateFinalPrices(payload);
    const data = await updateProduct(req.params.id, payload);
    deleteCachePrefix('products:');
    deleteCachePrefix('dashboard:');
    deleteCachePrefix('admin:');
    deleteCachePrefix('bot:catalog:');
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
    deleteCachePrefix('products:');
    deleteCachePrefix('dashboard:');
    return res.json({ status: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function adminListProductStockItems(req, res, next) {
  try {
    const data = await listProductStockItems(req.params.id);
    res.json({ status: true, data });
  } catch (error) {
    next(error);
  }
}

export async function adminAddProductStockItem(req, res, next) {
  try {
    requireFields(req.body, ['email_account', 'password_account']);
    const data = await addManualStockItem(req.params.id, req.body);
    if (!data) return res.status(404).json({ status: false, message: 'Produk tidak ditemukan' });
    deleteCachePrefix('products:');
    deleteCachePrefix('dashboard:');
    deleteCachePrefix('admin:');
    deleteCachePrefix('bot:catalog:');
    return res.status(201).json({ status: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function adminUpdateProductStockItem(req, res, next) {
  try {
    requireFields(req.body, ['email_account']);
    const data = await updateManualStockItem(req.params.id, req.params.itemId, req.body);
    if (!data) return res.status(404).json({ status: false, message: 'Stock item tidak ditemukan' });
    deleteCachePrefix('products:');
    deleteCachePrefix('dashboard:');
    deleteCachePrefix('admin:');
    deleteCachePrefix('bot:catalog:');
    return res.json({ status: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function adminDeleteProductStockItem(req, res, next) {
  try {
    const data = await deleteManualStockItem(req.params.id, req.params.itemId);
    if (!data) return res.status(404).json({ status: false, message: 'Stock item tidak ditemukan' });
    deleteCachePrefix('products:');
    deleteCachePrefix('dashboard:');
    deleteCachePrefix('admin:');
    deleteCachePrefix('bot:catalog:');
    return res.json({ status: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function adminUpdateProductStockItemById(req, res, next) {
  try {
    requireFields(req.body, ['email_account']);
    const data = await updateManualStockItemById(req.params.itemId || req.params.id, req.body);
    if (!data) return res.status(404).json({ status: false, message: 'Stock item tidak ditemukan' });
    deleteCachePrefix('products:');
    deleteCachePrefix('dashboard:');
    deleteCachePrefix('admin:');
    deleteCachePrefix('bot:catalog:');
    return res.json({ status: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function adminDeleteProductStockItemById(req, res, next) {
  try {
    const data = await deleteManualStockItemById(req.params.itemId || req.params.id);
    if (!data) return res.status(404).json({ status: false, message: 'Stock item tidak ditemukan' });
    deleteCachePrefix('products:');
    deleteCachePrefix('dashboard:');
    deleteCachePrefix('admin:');
    deleteCachePrefix('bot:catalog:');
    return res.json({ status: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function adminDisableProductStockItem(req, res, next) {
  try {
    const data = await disableManualStockItem(req.params.itemId || req.params.id);
    if (!data) return res.status(404).json({ status: false, message: 'Stock item tidak ditemukan' });
    deleteCachePrefix('products:');
    deleteCachePrefix('dashboard:');
    deleteCachePrefix('admin:');
    deleteCachePrefix('bot:catalog:');
    return res.json({ status: true, data });
  } catch (error) {
    return next(error);
  }
}
