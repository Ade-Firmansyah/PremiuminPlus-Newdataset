import { execute, query } from '../config/db.js';

function normalizeSource(value, fallback = 'provider') {
  const raw = String(value || fallback || 'provider').toLowerCase();
  if (raw === 'api' || raw === 'premku' || raw === 'provider') return 'provider';
  if (raw === 'manual') return 'manual';
  if (raw === 'hybrid') return 'hybrid';
  return fallback;
}

function normalizeStockMode(value, source = 'provider') {
  if (source === 'manual') return 'manual';
  if (source === 'hybrid') return 'combined';
  if (source === 'provider') return 'combined';
  const raw = String(value || '').toLowerCase();
  if (['provider', 'manual', 'combined'].includes(raw)) return raw;
  return 'combined';
}

function productTypeOf(rowOrPayload = {}) {
  const source = normalizeSource(rowOrPayload.product_source || rowOrPayload.product_type || rowOrPayload.tipe_produk);
  return source === 'manual' ? 'manual' : 'api';
}

function effectiveStock({ stockMode, providerStock, manualStock }) {
  if (stockMode === 'manual') return manualStock;
  if (stockMode === 'combined') return providerStock + manualStock;
  return providerStock + manualStock;
}

function parseManualStockEntries(payload = {}) {
  const entries = [];
  const pushEntry = (email, password) => {
    const normalizedEmail = String(email || '').trim();
    const normalizedPassword = String(password || '').trim();
    if (normalizedEmail && normalizedPassword) entries.push({ email: normalizedEmail, password: normalizedPassword });
  };

  if (Array.isArray(payload.accounts)) {
    payload.accounts.forEach((item) => {
      if (typeof item === 'string') {
        const [email, ...passwordParts] = item.split(':');
        pushEntry(email, passwordParts.join(':'));
        return;
      }
      pushEntry(item?.email || item?.username, item?.password || item?.pass);
    });
  }

  const bulk = String(payload.bulk || payload.text || '').trim();
  if (bulk) {
    bulk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        if (line.includes(':')) {
          const [email, ...passwordParts] = line.split(':');
          pushEntry(email, passwordParts.join(':'));
          return;
        }
        const parts = line.split(/\s+/);
        pushEntry(parts[0], parts.slice(1).join(' '));
      });
  }

  pushEntry(payload.email, payload.password);
  return entries;
}

function toProduct(row) {
  if (!row) return null;
  const source = normalizeSource(row.product_source || row.product_type);
  const productType = productTypeOf({ ...row, product_source: source });
  const stockMode = normalizeStockMode(row.stock_mode, source);
  const providerStock = Number(row.provider_stock ?? (source === 'provider' ? row.stock : 0) ?? 0);
  const manualStock = Number(row.manual_stock ?? (source === 'manual' ? row.stock : 0) ?? 0);
  const stock = effectiveStock({ stockMode, providerStock, manualStock });

  return {
    id: row.id,
    premku_id: row.premku_id,
    name: row.name,
    code: row.code,
    slug: row.slug || row.code,
    note: row.note || row.description || '',
    description: row.description || row.note || '',
    tag: row.tag || '',
    category: row.tag || '',
    image: row.image || row.image_url || '',
    thumbnail: row.image || row.image_url || '',
    image_url: row.image_url || row.image || '',
    product_source: source,
    product_type: productType,
    tipe_produk: productType,
    stock_mode: stockMode,
    provider: row.provider || (source === 'manual' ? 'manual' : 'premku'),
    provider_status: row.provider_status || 'unknown',
    price_base: Number(row.price_base || row.base_price || 0),
    base_price: Number(row.base_price || row.price_base || 0),
    price_sell: Number(row.price_sell || row.member_price || row.price_base || 0),
    member_price: Number(row.member_price || row.price_sell || 0),
    reseller_price: Number(row.reseller_price || row.price_sell || 0),
    harga_jual: Number(row.price_sell || row.member_price || row.price_base || 0),
    admin_margin: Number(row.admin_margin || 0),
    member_markup: Number(row.member_markup || 0),
    reseller_markup: Number(row.reseller_markup || 0),
    provider_stock: providerStock,
    manual_stock: manualStock,
    effective_stock: stock,
    stock,
    is_bot_enabled: row.is_bot_enabled !== undefined ? Boolean(row.is_bot_enabled) : true,
    is_visible: row.is_visible !== undefined ? Boolean(row.is_visible) : true,
    status: row.status,
    availability_status: stock > 0 ? 'tersedia' : 'belum_tersedia',
  };
}

function normalizeProductPayload(payload = {}, current = {}) {
  const requestedSource = payload.product_source ?? payload.source ?? payload.product_type ?? payload.tipe_produk;
  const currentSource = current.product_source ?? current.product_type ?? 'provider';
  const source = normalizeSource(requestedSource, normalizeSource(currentSource));
  const stockMode = normalizeStockMode(payload.stock_mode ?? current.stock_mode, source);
  const basePrice = Number(payload.price_base ?? payload.harga_base ?? payload.base_price ?? current.price_base ?? current.base_price ?? 0);
  const memberPrice = Number(payload.member_price ?? payload.harga_member ?? payload.price_sell ?? current.member_price ?? current.price_sell ?? basePrice);
  const resellerPrice = Number(payload.reseller_price ?? payload.harga_reseller ?? current.reseller_price ?? basePrice);
  const providerStock = Number(payload.provider_stock ?? (source === 'provider' ? payload.stock : undefined) ?? current.provider_stock ?? 0);
  const manualStock = Number(payload.manual_stock ?? (source === 'manual' ? payload.stock : undefined) ?? current.manual_stock ?? 0);
  const code = String(payload.code ?? payload.kode_produk ?? current.code ?? '').trim();
  const name = String(payload.name ?? payload.nama_produk ?? current.name ?? '').trim();

  return {
    premku_id: source !== 'manual' ? payload.premku_id ?? payload.sku_api ?? current.premku_id ?? null : null,
    name,
    code,
    slug: String(payload.slug ?? payload.kode_produk ?? payload.code ?? current.slug ?? code).trim(),
    note: String(payload.note ?? payload.deskripsi ?? payload.description ?? current.note ?? ''),
    description: String(payload.description ?? payload.deskripsi ?? payload.note ?? current.description ?? ''),
    tag: String(payload.tag ?? payload.category ?? payload.kategori ?? current.tag ?? ''),
    image: String(payload.image ?? payload.thumbnail ?? current.image ?? ''),
    image_url: String(payload.image_url ?? payload.thumbnail ?? payload.image ?? current.image_url ?? ''),
    product_source: source,
    product_type: source === 'manual' ? 'manual' : 'api',
    stock_mode: stockMode,
    provider: String(payload.provider ?? payload.provider_api ?? current.provider ?? (source === 'manual' ? 'manual' : 'premku')),
    provider_status: String(payload.provider_status ?? current.provider_status ?? 'unknown'),
    price_base: basePrice,
    base_price: basePrice,
    price_sell: memberPrice,
    member_price: memberPrice,
    reseller_price: resellerPrice,
    admin_margin: Number(payload.admin_margin ?? current.admin_margin ?? 0),
    member_markup: Number(payload.member_markup ?? current.member_markup ?? 0),
    reseller_markup: Number(payload.reseller_markup ?? current.reseller_markup ?? 0),
    provider_stock: providerStock,
    manual_stock: manualStock,
    stock: effectiveStock({ stockMode, providerStock, manualStock }),
    is_bot_enabled: payload.is_bot_enabled !== undefined ? (payload.is_bot_enabled ? 1 : 0) : current.is_bot_enabled !== undefined ? (current.is_bot_enabled ? 1 : 0) : 1,
    is_visible: payload.is_visible !== undefined ? (payload.is_visible ? 1 : 0) : current.is_visible !== undefined ? (current.is_visible ? 1 : 0) : 1,
    status: payload.status === 'inactive' || payload.status === 'nonactive' ? 'inactive' : 'active',
  };
}

export async function listProducts({ visibleOnly = false } = {}) {
  const rows = await query(`SELECT * FROM products ${visibleOnly ? 'WHERE is_visible = 1' : ''} ORDER BY id ASC`);
  return rows.map(toProduct);
}

export async function findProductById(id) {
  const rows = await query('SELECT * FROM products WHERE id = ? LIMIT 1', [Number(id)]);
  return toProduct(rows[0] || null);
}

export async function replaceProducts(nextProducts) {
  for (const product of nextProducts) {
    const normalized = normalizeProductPayload({
      ...product,
      product_source: 'provider',
      product_type: 'api',
      stock_mode: 'provider',
      provider: product.provider || 'premku',
      provider_stock: product.stock || product.provider_stock || 0,
      provider_status: product.status || 'active',
    });

    await execute(
      `INSERT INTO products
        (premku_id, name, code, slug, note, description, tag, image, image_url, product_type, product_source, stock_mode, provider, provider_status, price_base, base_price, price_sell, member_price, reseller_price, admin_margin, member_markup, reseller_markup, stock, provider_stock, manual_stock, is_bot_enabled, is_visible, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         premku_id = VALUES(premku_id),
         name = VALUES(name),
         slug = COALESCE(products.slug, VALUES(slug)),
         note = COALESCE(NULLIF(products.note, ''), VALUES(note)),
         description = COALESCE(NULLIF(products.description, ''), VALUES(description)),
         tag = COALESCE(NULLIF(products.tag, ''), VALUES(tag)),
         image = VALUES(image),
         image_url = VALUES(image_url),
         provider = VALUES(provider),
         provider_status = VALUES(provider_status),
         provider_stock = VALUES(provider_stock),
         stock = CASE
           WHEN products.stock_mode = 'manual' THEN products.manual_stock
           WHEN products.stock_mode = 'combined' THEN VALUES(provider_stock) + products.manual_stock
           ELSE VALUES(provider_stock) + products.manual_stock
         END,
         status = CASE
           WHEN products.product_source = 'manual' THEN products.status
           ELSE VALUES(status)
         END`,
      [
        normalized.premku_id,
        normalized.name,
        normalized.code,
        normalized.slug,
        normalized.note,
        normalized.description,
        normalized.tag,
        normalized.image,
        normalized.image_url,
        normalized.product_type,
        normalized.product_source,
        normalized.stock_mode,
        normalized.provider,
        normalized.provider_status,
        normalized.price_base,
        normalized.base_price,
        normalized.price_sell,
        normalized.member_price,
        normalized.reseller_price,
        normalized.admin_margin,
        normalized.member_markup,
        normalized.reseller_markup,
        normalized.stock,
        normalized.provider_stock,
        normalized.manual_stock,
        normalized.is_bot_enabled,
        normalized.is_visible,
        normalized.status,
      ],
    );
  }

  return listProducts();
}

export async function createProduct(payload) {
  const normalized = normalizeProductPayload(payload);
  const result = await execute(
    `INSERT INTO products
      (premku_id, name, code, slug, note, description, tag, image, image_url, product_type, product_source, stock_mode, provider, provider_status, price_base, base_price, price_sell, member_price, reseller_price, admin_margin, member_markup, reseller_markup, stock, provider_stock, manual_stock, is_bot_enabled, is_visible, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      normalized.premku_id,
      normalized.name,
      normalized.code,
      normalized.slug,
      normalized.note,
      normalized.description,
      normalized.tag,
      normalized.image,
      normalized.image_url,
      normalized.product_type,
      normalized.product_source,
      normalized.stock_mode,
      normalized.provider,
      normalized.provider_status,
      normalized.price_base,
      normalized.base_price,
      normalized.price_sell,
      normalized.member_price,
      normalized.reseller_price,
      normalized.admin_margin,
      normalized.member_markup,
      normalized.reseller_markup,
      normalized.stock,
      normalized.provider_stock,
      normalized.manual_stock,
      normalized.is_bot_enabled,
      normalized.is_visible,
      normalized.status,
    ],
  );
  return findProductById(result.insertId);
}

export async function updateProduct(id, payload) {
  const current = await findProductById(id);
  if (!current) return null;
  const normalized = normalizeProductPayload(payload, current);

  await execute(
    `UPDATE products
     SET premku_id = ?, name = ?, code = ?, slug = ?, note = ?, description = ?, tag = ?, image = ?, image_url = ?, product_type = ?, product_source = ?, stock_mode = ?, provider = ?, provider_status = ?, price_base = ?, base_price = ?, price_sell = ?, member_price = ?, reseller_price = ?, admin_margin = ?, member_markup = ?, reseller_markup = ?, stock = ?, provider_stock = ?, manual_stock = ?, is_bot_enabled = ?, is_visible = ?, status = ?
     WHERE id = ?`,
    [
      normalized.premku_id,
      normalized.name,
      normalized.code,
      normalized.slug,
      normalized.note,
      normalized.description,
      normalized.tag,
      normalized.image,
      normalized.image_url,
      normalized.product_type,
      normalized.product_source,
      normalized.stock_mode,
      normalized.provider,
      normalized.provider_status,
      normalized.price_base,
      normalized.base_price,
      normalized.price_sell,
      normalized.member_price,
      normalized.reseller_price,
      normalized.admin_margin,
      normalized.member_markup,
      normalized.reseller_markup,
      normalized.stock,
      normalized.provider_stock,
      normalized.manual_stock,
      normalized.is_bot_enabled,
      normalized.is_visible,
      normalized.status,
      Number(id),
    ],
  );
  await syncManualProductStock(id);
  return findProductById(id);
}

export async function deleteProduct(id) {
  const current = await findProductById(id);
  if (!current) return null;

  try {
    await execute('DELETE FROM products WHERE id = ?', [Number(id)]);
  } catch (error) {
    if (error?.code === 'ER_ROW_IS_REFERENCED_2') {
      await execute('UPDATE products SET status = "inactive", is_visible = 0, is_bot_enabled = 0, stock = 0 WHERE id = ?', [Number(id)]);
      return { ...current, status: 'inactive', is_visible: false, is_bot_enabled: false, stock: 0 };
    }
    throw error;
  }

  return current;
}

export async function addManualStock(productId, payload) {
  const product = await findProductById(productId);
  if (!product) return null;

  const entries = parseManualStockEntries(payload);
  if (!entries.length) {
    const error = new Error('Email dan password stock wajib diisi');
    error.statusCode = 400;
    throw error;
  }

  for (const entry of entries) {
    await execute('INSERT INTO manual_product_accounts (product_id, email, password, status) VALUES (?, ?, ?, "available")', [Number(productId), entry.email, entry.password]);
    try {
      await execute('INSERT INTO product_credentials (product_id, email, password, status) VALUES (?, ?, ?, "available")', [Number(productId), entry.email, entry.password]);
      await execute('INSERT INTO produk_stock_manual (product_id, email, password, status) VALUES (?, ?, ?, "available")', [Number(productId), entry.email, entry.password]);
    } catch {
      // Legacy mirrors are best-effort only; manual_product_accounts is canonical.
    }
  }
  await syncManualProductStock(productId);
  return findProductById(productId);
}

export async function syncManualProductStock(productId) {
  await execute(
    `UPDATE products p
     SET manual_stock = (
       SELECT COUNT(*) FROM manual_product_accounts c
       WHERE c.product_id = p.id AND c.status = 'available'
     ),
     stock = CASE
       WHEN p.stock_mode = 'manual' THEN (
        SELECT COUNT(*) FROM manual_product_accounts c
        WHERE c.product_id = p.id AND c.status = 'available'
       )
       WHEN p.stock_mode = 'combined' THEN p.provider_stock + (
        SELECT COUNT(*) FROM manual_product_accounts c
        WHERE c.product_id = p.id AND c.status = 'available'
       )
       ELSE p.provider_stock + (
        SELECT COUNT(*) FROM manual_product_accounts c
        WHERE c.product_id = p.id AND c.status = 'available'
       )
     END
     WHERE p.id = ?`,
    [Number(productId)],
  );
}
