import { execute, query } from '../config/db.js';
import { decryptString, encryptString } from '../utils/password.js';

function normalizeProductSource(value, isManual = false) {
  const source = String(value || '').toLowerCase();
  if (source === 'manual' || source === 'hybrid' || source === 'provider') return source;
  return isManual ? 'manual' : 'provider';
}

async function refreshManualStockCountByProductId(productId) {
  await execute(
    `UPDATE products p
     SET manual_stock_count = (
       SELECT COUNT(*)
       FROM product_stock_items psi
       WHERE psi.product_id = p.id AND psi.status = 'available'
     ),
     stock = CASE
       WHEN p.product_source = 'manual' THEN (
         SELECT COUNT(*)
         FROM product_stock_items psi
         WHERE psi.product_id = p.id AND psi.status = 'available'
       )
       ELSE p.stock
     END
     WHERE p.id = ?`,
    [Number(productId)],
  );
}

function toProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    premku_id: row.premku_id,
    provider_product_id: row.provider_product_id || row.premku_id || null,
    name: row.name,
    code: row.code,
    note: row.note || row.description || '',
    description: row.description || row.note || '',
    tag: row.tag || '',
    image: row.image || row.image_url || '',
    image_url: row.image_url || row.image || '',
    tutorial_url: row.tutorial_url || '',
    product_source: normalizeProductSource(row.product_source, row.is_manual),
    is_manual: Boolean(row.is_manual || ['manual', 'hybrid'].includes(row.product_source)),
    base_price: Number(row.base_price || 0),
    price_base: Number(row.base_price || 0),
    admin_margin: Number(row.admin_margin || 0),
    member_price: Number(row.member_price || 0),
    reseller_price: Number(row.reseller_price || 0),
    manual_stock_count: Number(row.manual_stock_count || 0),
    provider_stock_count: Number(row.provider_stock_count || 0),
    discount_label_percent: Number(row.discount_label_percent || 0),
    stock: row.product_source === 'manual'
      ? Number(row.available_stock ?? row.manual_stock_count ?? row.stock ?? 0)
      : row.product_source === 'hybrid' && Number(row.available_stock ?? row.manual_stock_count ?? 0) > 0
        ? Number(row.available_stock ?? row.manual_stock_count ?? 0)
        : Number(row.stock || 0),
    status: row.status,
    availability_status: Number(row.stock || 0) > 0 ? 'tersedia' : 'belum_tersedia',
  };
}

export async function listProducts() {
  const rows = await query(
    `SELECT p.*,
      COALESCE(stock.available_stock, 0) AS available_stock
     FROM products p
     LEFT JOIN (
       SELECT product_id, COUNT(*) AS available_stock
       FROM product_stock_items
       WHERE status = 'available'
       GROUP BY product_id
     ) stock ON stock.product_id = p.id
     ORDER BY p.id ASC`,
  );
  return rows.map(toProduct);
}

export async function findProductById(id) {
  const rows = await query(
    `SELECT p.*,
      COALESCE(stock.available_stock, 0) AS available_stock
     FROM products p
     LEFT JOIN (
       SELECT product_id, COUNT(*) AS available_stock
       FROM product_stock_items
       WHERE status = 'available'
       GROUP BY product_id
     ) stock ON stock.product_id = p.id
     WHERE p.id = ?
     LIMIT 1`,
    [Number(id)],
  );
  return toProduct(rows[0] || null);
}

export async function replaceProducts(nextProducts) {
  for (const product of nextProducts) {
    await execute(
      `INSERT INTO products
        (premku_id, provider_product_id, name, code, note, description, tag, image, image_url, tutorial_url, product_source, is_manual, base_price, member_price, reseller_price, stock, provider_stock_count, status, raw_response, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'provider', 0, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), NOW())
       ON DUPLICATE KEY UPDATE
         premku_id = VALUES(premku_id),
         provider_product_id = VALUES(provider_product_id),
         name = VALUES(name),
         note = VALUES(note),
         description = VALUES(description),
         tag = VALUES(tag),
         image = VALUES(image),
         image_url = VALUES(image_url),
         tutorial_url = VALUES(tutorial_url),
         product_source = CASE WHEN products.product_source IN ('manual','hybrid') THEN products.product_source ELSE VALUES(product_source) END,
         is_manual = CASE WHEN products.product_source IN ('manual','hybrid') THEN products.is_manual ELSE VALUES(is_manual) END,
         base_price = VALUES(base_price),
         member_price = VALUES(member_price),
         reseller_price = VALUES(reseller_price),
         stock = VALUES(stock),
         provider_stock_count = VALUES(provider_stock_count),
         status = VALUES(status),
         raw_response = VALUES(raw_response),
         synced_at = VALUES(synced_at)`,
      [
        product.premku_id ?? null,
        product.provider_product_id ?? product.premku_id ?? null,
        product.name,
        product.code,
        product.note || '',
        product.description || product.note || '',
        product.tag || '',
        product.image || '',
        product.image_url || product.image || '',
        product.tutorial_url || '',
        Number(product.base_price || 0),
        Number(product.member_price || product.base_price || 0),
        Number(product.reseller_price || product.base_price || 0),
        Number(product.stock || 0),
        Number(product.provider_stock_count ?? product.stock ?? 0),
        product.status || 'active',
        JSON.stringify(product.raw_response ?? null),
      ],
    );
  }

  return listProducts();
}

export async function createProduct(payload) {
  const result = await execute(
    `INSERT INTO products
      (premku_id, provider_product_id, name, code, note, description, tag, image, image_url, tutorial_url, product_source, is_manual, base_price, admin_margin, member_price, reseller_price, stock, provider_stock_count, discount_label_percent, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.premku_id || payload.provider_product_id || null,
      payload.provider_product_id || payload.premku_id || null,
      String(payload.name || '').trim(),
      String(payload.code || '').trim(),
      payload.note || '',
      payload.description || payload.note || '',
      payload.tag || '',
      payload.image || '',
      payload.image_url || payload.image || '',
      payload.tutorial_url || '',
      normalizeProductSource(payload.product_source, payload.is_manual),
      ['manual', 'hybrid'].includes(normalizeProductSource(payload.product_source, payload.is_manual)) ? 1 : 0,
      Number(payload.base_price ?? payload.price_base ?? 0),
      Number(payload.admin_margin || 0),
      Number(payload.member_price ?? payload.base_price ?? payload.price_base ?? 0),
      Number(payload.reseller_price ?? payload.base_price ?? payload.price_base ?? 0),
      Number(payload.stock || 0),
      Number(payload.provider_stock_count ?? payload.stock ?? 0),
      payload.discount_label_percent === undefined ? null : Number(payload.discount_label_percent || 0),
      payload.status === 'inactive' ? 'inactive' : 'active',
    ],
  );
  return findProductById(result.insertId);
}

export async function updateProduct(id, payload) {
  const current = await findProductById(id);
  if (!current) return null;

  await execute(
    `UPDATE products
     SET premku_id = ?, provider_product_id = ?, name = ?, code = ?, note = ?, description = ?, tag = ?, image = ?, image_url = ?, tutorial_url = ?, product_source = ?, is_manual = ?, base_price = ?, admin_margin = ?, member_price = ?, reseller_price = ?, stock = ?, provider_stock_count = ?, discount_label_percent = ?, status = ?
     WHERE id = ?`,
    [
      payload.premku_id !== undefined || payload.provider_product_id !== undefined ? payload.premku_id || payload.provider_product_id || null : current.premku_id,
      payload.provider_product_id !== undefined || payload.premku_id !== undefined ? payload.provider_product_id || payload.premku_id || null : current.provider_product_id,
      payload.name !== undefined ? String(payload.name).trim() : current.name,
      payload.code !== undefined ? String(payload.code).trim() : current.code,
      payload.note !== undefined ? payload.note || '' : current.note,
      payload.description !== undefined ? payload.description || '' : current.description,
      payload.tag !== undefined ? payload.tag || '' : current.tag,
      payload.image !== undefined ? payload.image || '' : current.image,
      payload.image_url !== undefined ? payload.image_url || '' : current.image_url,
      payload.tutorial_url !== undefined ? payload.tutorial_url || '' : current.tutorial_url,
      payload.product_source !== undefined ? normalizeProductSource(payload.product_source, payload.is_manual) : current.product_source,
      payload.product_source !== undefined ? (['manual', 'hybrid'].includes(normalizeProductSource(payload.product_source, payload.is_manual)) ? 1 : 0) : current.is_manual ? 1 : 0,
      payload.base_price !== undefined || payload.price_base !== undefined ? Number(payload.base_price ?? payload.price_base ?? 0) : current.base_price,
      payload.admin_margin !== undefined ? Number(payload.admin_margin || 0) : current.admin_margin,
      payload.member_price !== undefined ? Number(payload.member_price || 0) : current.member_price,
      payload.reseller_price !== undefined ? Number(payload.reseller_price || 0) : current.reseller_price,
      payload.stock !== undefined ? Number(payload.stock || 0) : current.stock,
      payload.provider_stock_count !== undefined ? Number(payload.provider_stock_count || 0) : current.provider_stock_count,
      payload.discount_label_percent !== undefined ? Number(payload.discount_label_percent || 0) : current.discount_label_percent,
      payload.status !== undefined ? (payload.status === 'inactive' ? 'inactive' : 'active') : current.status,
      Number(id),
    ],
  );
  return findProductById(id);
}

export async function deleteProduct(id) {
  const current = await findProductById(id);
  if (!current) return null;

  try {
    await execute('DELETE FROM products WHERE id = ?', [Number(id)]);
  } catch (error) {
    if (error?.code === 'ER_ROW_IS_REFERENCED_2') {
      await execute('UPDATE products SET status = "inactive", stock = 0 WHERE id = ?', [Number(id)]);
      return { ...current, status: 'inactive', stock: 0 };
    }
    throw error;
  }

  return current;
}

export async function reserveManualStockItem(connection, productId, invoice) {
  const [rows] = await connection.query(
    `SELECT *
     FROM product_stock_items
     WHERE product_id = ?
       AND status = 'available'
     ORDER BY id ASC
     LIMIT 1
     FOR UPDATE`,
    [Number(productId)],
  );
  const item = rows[0];
  if (!item) return null;

  await connection.query(
    `UPDATE product_stock_items
     SET status = 'reserved',
         reserved_by_order_invoice = ?,
         reserved_at = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'available'`,
    [invoice, item.id],
  );

  return {
    id: item.id,
    product_id: item.product_id,
    email_account: item.email_account || null,
    password_account: item.password_account ? decryptString(item.password_account) : null,
    description: item.description || null,
  };
}

export async function reserveManualStockItems(connection, productId, invoice, qty = 1) {
  const limit = Math.max(1, Number(qty || 1));
  const [rows] = await connection.query(
    `SELECT *
     FROM product_stock_items
     WHERE product_id = ?
       AND status = 'available'
     ORDER BY id ASC
     LIMIT ?
     FOR UPDATE`,
    [Number(productId), limit],
  );
  if (rows.length < limit) return [];

  const ids = rows.map((item) => Number(item.id));
  await connection.query(
    `UPDATE product_stock_items
     SET status = 'reserved',
         reserved_by_order_invoice = ?,
         reserved_at = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE id IN (${ids.map(() => '?').join(',')}) AND status = 'available'`,
    [invoice, ...ids],
  );

  return rows.map((item) => ({
    id: item.id,
    product_id: item.product_id,
    email_account: item.email_account || null,
    password_account: item.password_account ? decryptString(item.password_account) : null,
    description: item.description || null,
  }));
}

export async function markManualStockUsed(connection, itemId, invoice) {
  await connection.query(
    `UPDATE product_stock_items
     SET status = 'used',
         used_by_order_invoice = ?,
         used_at = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status IN ('available','reserved')`,
    [invoice, Number(itemId)],
  );
}

export async function markManualStockItemsUsed(connection, itemIds, invoice) {
  const ids = (Array.isArray(itemIds) ? itemIds : [itemIds]).map(Number).filter(Boolean);
  if (!ids.length) return;
  await connection.query(
    `UPDATE product_stock_items
     SET status = 'used',
         used_by_order_invoice = ?,
         used_at = NOW(),
         updated_at = CURRENT_TIMESTAMP
     WHERE id IN (${ids.map(() => '?').join(',')}) AND status IN ('available','reserved')`,
    [invoice, ...ids],
  );
}

export async function refreshManualStockCount(connection, productId) {
  await connection.query(
    `UPDATE products p
     SET manual_stock_count = (
       SELECT COUNT(*)
       FROM product_stock_items psi
       WHERE psi.product_id = p.id AND psi.status = 'available'
     ),
     stock = CASE
       WHEN p.product_source = 'manual' THEN (
         SELECT COUNT(*)
         FROM product_stock_items psi
         WHERE psi.product_id = p.id AND psi.status = 'available'
       )
       ELSE p.stock
     END
     WHERE p.id = ?`,
    [Number(productId)],
  );
}

export async function listProductStockItems(productId) {
  const rows = await query(
    `SELECT id, product_id, email_account, password_account, description, status, reserved_by_order_invoice, used_by_order_invoice, created_at, reserved_at, used_at
     FROM product_stock_items
     WHERE product_id = ?
     ORDER BY id DESC`,
    [Number(productId)],
  );

  return rows.map((row) => ({
    ...row,
    password_account: null,
    password_masked: row.password_account ? '********' : null,
  }));
}

export async function addManualStockItem(productId, payload) {
  await execute(
    `INSERT INTO product_stock_items
      (product_id, email_account, password_account, description, status)
     VALUES (?, ?, ?, ?, 'available')`,
    [
      Number(productId),
      String(payload.email_account || payload.email || '').trim(),
      encryptString(payload.password_account || payload.password || ''),
      payload.description || payload.note || '',
    ],
  );

  await refreshManualStockCountByProductId(productId);

  return findProductById(productId);
}

export async function updateManualStockItem(productId, itemId, payload) {
  const rows = await query(
    `SELECT id, product_id, password_account, status
     FROM product_stock_items
     WHERE id = ? AND product_id = ?
     LIMIT 1`,
    [Number(itemId), Number(productId)],
  );
  const current = rows[0];
  if (!current) return null;
  if (!['available', 'disabled'].includes(current.status)) {
    const error = new Error('Stock yang sudah reserved/used tidak bisa diedit.');
    error.statusCode = 400;
    throw error;
  }

  const nextStatus = ['available', 'disabled'].includes(String(payload.status || current.status))
    ? String(payload.status || current.status)
    : current.status;
  const nextPassword = String(payload.password_account || payload.password || '').trim()
    ? encryptString(payload.password_account || payload.password || '')
    : current.password_account;
  await execute(
    `UPDATE product_stock_items
     SET email_account = ?,
         password_account = ?,
         description = ?,
         status = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND product_id = ?`,
    [
      String(payload.email_account || payload.email || '').trim(),
      nextPassword,
      payload.description || payload.note || '',
      nextStatus,
      Number(itemId),
      Number(productId),
    ],
  );
  await refreshManualStockCountByProductId(productId);
  return findProductById(productId);
}

export async function updateManualStockItemById(itemId, payload) {
  const rows = await query(
    `SELECT id, product_id
     FROM product_stock_items
     WHERE id = ?
     LIMIT 1`,
    [Number(itemId)],
  );
  const current = rows[0];
  if (!current) return null;
  return updateManualStockItem(current.product_id, itemId, payload);
}

export async function deleteManualStockItem(productId, itemId) {
  const rows = await query(
    `SELECT id, product_id, status
     FROM product_stock_items
     WHERE id = ? AND product_id = ?
     LIMIT 1`,
    [Number(itemId), Number(productId)],
  );
  const current = rows[0];
  if (!current) return null;
  if (!['available', 'disabled'].includes(current.status)) {
    const error = new Error('Stock yang sudah reserved/used tidak bisa dihapus.');
    error.statusCode = 400;
    throw error;
  }

  await execute('DELETE FROM product_stock_items WHERE id = ? AND product_id = ?', [Number(itemId), Number(productId)]);
  await refreshManualStockCountByProductId(productId);
  return findProductById(productId);
}

export async function deleteManualStockItemById(itemId) {
  const rows = await query(
    `SELECT id, product_id
     FROM product_stock_items
     WHERE id = ?
     LIMIT 1`,
    [Number(itemId)],
  );
  const current = rows[0];
  if (!current) return null;
  return deleteManualStockItem(current.product_id, itemId);
}

export async function disableManualStockItem(itemId) {
  const rows = await query(
    `SELECT id, product_id, status
     FROM product_stock_items
     WHERE id = ?
     LIMIT 1`,
    [Number(itemId)],
  );
  const current = rows[0];
  if (!current) return null;
  if (current.status !== 'available') {
    const error = new Error('Hanya stock available yang bisa dinonaktifkan.');
    error.statusCode = 400;
    throw error;
  }

  await execute(
    `UPDATE product_stock_items
     SET status = 'disabled',
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'available'`,
    [Number(itemId)],
  );
  await refreshManualStockCountByProductId(current.product_id);
  return findProductById(current.product_id);
}
