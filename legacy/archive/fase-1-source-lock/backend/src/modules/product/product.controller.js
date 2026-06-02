import { createProduct, deleteProduct, listProducts, replaceProducts, updateProduct } from '../../repositories/product.repo.js';
import { getDiscountSetting, getMarkupSetting } from '../../repositories/settings.repo.js';
import { calculateRoleSellPrice } from '../../services/pricing.service.js';
import { premku } from '../../services/premku.service.js';
import { requireFields } from '../../utils/validator.js';
import { deleteCachePrefix, remember } from '../../services/cache.service.js';

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
    id: Number(item.id ?? item.product_id ?? index + 1),
    premku_id: Number(item.premku_id ?? item.id ?? item.product_id ?? index + 1),
    name,
    code: String(item.code ?? item.kode ?? name.toLowerCase().replace(/\s+/g, '-')),
    note: String(item.note ?? item.description ?? 'Produk dari API Premku.'),
    tag: String(item.tag ?? item.category ?? 'API'),
    image: String(item.image ?? item.img ?? item.thumbnail ?? item.logo ?? ''),
    price_base: basePrice,
    stock,
    status,
    availability_status: stock > 0 ? 'tersedia' : 'belum_tersedia',
  };
}

function extractProducts(payload) {
  const candidates = [payload?.data?.products, payload?.products, payload?.data, payload?.result, payload];
  const list = candidates.find((item) => Array.isArray(item));
  return Array.isArray(list) ? list : [];
}

async function applyMarkup(products, user = {}) {
  const markupSetting = await getMarkupSetting();
  const discountSetting = await getDiscountSetting();

  return products.map((product) => {
    const pricing = calculateRoleSellPrice(product, markupSetting, user);
    return {
      ...product,
      price_sell: pricing.sellPrice,
      admin_margin: pricing.adminMargin,
      markup: pricing.roleMarkup,
      reseller_markup: pricing.resellerMarkup,
      reseller_markup_percent: pricing.reseller_markup_percent,
      discount_percent: discountSetting.discount_percent,
      availability_status: Number(product.stock || 0) > 0 ? 'tersedia' : 'belum_tersedia',
    };
  });
}

export async function getProducts(_req, res) {
  let products = await remember('products:local', 15, () => listProducts());
  let source = 'local';

  try {
    const syncedProducts = await remember('premku:products:synced', 60, async () => {
      const payload = await premku('products');
      const externalProducts = extractProducts(payload);
      if (!externalProducts.length) return null;
      await replaceProducts(externalProducts.map(normalizeExternalProduct));
      deleteCachePrefix('products:');
      return listProducts();
    });
    if (syncedProducts?.length) {
      products = syncedProducts;
      source = 'premku';
    }
  } catch {
    source = 'local';
  }

  res.json({
    status: true,
    source,
    data: await applyMarkup(products, _req.user),
  });
}

export async function adminCreateProduct(req, res, next) {
  try {
    requireFields(req.body, ['name', 'code', 'price_base']);
    const data = await createProduct(req.body);
    deleteCachePrefix('products:');
    deleteCachePrefix('dashboard:');
    res.status(201).json({ status: true, data });
  } catch (error) {
    next(error);
  }
}

export async function adminUpdateProduct(req, res, next) {
  try {
    const data = await updateProduct(req.params.id, req.body);
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
