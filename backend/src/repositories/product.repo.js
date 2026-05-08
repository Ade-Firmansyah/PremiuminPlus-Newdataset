import { execute, query } from '../config/db.js';

function toProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    premku_id: row.premku_id,
    name: row.name,
    code: row.code,
    note: row.note || row.description || '',
    description: row.description || row.note || '',
    tag: row.tag || '',
    image: row.image || row.image_url || '',
    image_url: row.image_url || row.image || '',
    price_base: Number(row.price_base || row.base_price || 0),
    base_price: Number(row.base_price || row.price_base || 0),
    price_sell: Number(row.price_sell || 0),
    admin_margin: Number(row.admin_margin || 0),
    stock: Number(row.stock || 0),
    status: row.status,
    availability_status: Number(row.stock || 0) > 0 ? 'tersedia' : 'belum_tersedia',
  };
}

export async function listProducts() {
  const rows = await query('SELECT * FROM products ORDER BY id ASC');
  return rows.map(toProduct);
}

export async function findProductById(id) {
  const rows = await query('SELECT * FROM products WHERE id = ? LIMIT 1', [Number(id)]);
  return toProduct(rows[0] || null);
}

export async function replaceProducts(nextProducts) {
  for (const product of nextProducts) {
    await execute(
      `INSERT INTO products
        (premku_id, name, code, note, description, tag, image, image_url, price_base, base_price, price_sell, admin_margin, stock, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         premku_id = VALUES(premku_id),
         name = VALUES(name),
         note = VALUES(note),
         description = VALUES(description),
         tag = VALUES(tag),
         image = VALUES(image),
         image_url = VALUES(image_url),
         price_base = VALUES(price_base),
         base_price = VALUES(base_price),
         price_sell = VALUES(price_sell),
         stock = VALUES(stock),
         status = VALUES(status)`,
      [
        product.premku_id ?? null,
        product.name,
        product.code,
        product.note || '',
        product.description || product.note || '',
        product.tag || '',
        product.image || '',
        product.image_url || product.image || '',
        Number(product.price_base || 0),
        Number(product.base_price || product.price_base || 0),
        Number(product.price_sell || product.price_base || 0),
        Number(product.admin_margin || 0),
        Number(product.stock || 0),
        product.status || 'active',
      ],
    );
  }

  return listProducts();
}

export async function createProduct(payload) {
  const result = await execute(
    `INSERT INTO products
      (premku_id, name, code, note, description, tag, image, image_url, price_base, base_price, price_sell, admin_margin, stock, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.premku_id || null,
      String(payload.name || '').trim(),
      String(payload.code || '').trim(),
      payload.note || '',
      payload.description || payload.note || '',
      payload.tag || '',
      payload.image || '',
      payload.image_url || payload.image || '',
      Number(payload.price_base || 0),
      Number(payload.base_price || payload.price_base || 0),
      Number(payload.price_sell || payload.price_base || 0),
      Number(payload.admin_margin || 0),
      Number(payload.stock || 0),
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
     SET premku_id = ?, name = ?, code = ?, note = ?, description = ?, tag = ?, image = ?, image_url = ?, price_base = ?, base_price = ?, price_sell = ?, admin_margin = ?, stock = ?, status = ?
     WHERE id = ?`,
    [
      payload.premku_id !== undefined ? payload.premku_id || null : current.premku_id,
      payload.name !== undefined ? String(payload.name).trim() : current.name,
      payload.code !== undefined ? String(payload.code).trim() : current.code,
      payload.note !== undefined ? payload.note || '' : current.note,
      payload.description !== undefined ? payload.description || '' : current.description,
      payload.tag !== undefined ? payload.tag || '' : current.tag,
      payload.image !== undefined ? payload.image || '' : current.image,
      payload.image_url !== undefined ? payload.image_url || '' : current.image_url,
      payload.price_base !== undefined ? Number(payload.price_base || 0) : current.price_base,
      payload.base_price !== undefined ? Number(payload.base_price || 0) : current.base_price,
      payload.price_sell !== undefined ? Number(payload.price_sell || 0) : current.price_sell,
      payload.admin_margin !== undefined ? Number(payload.admin_margin || 0) : current.admin_margin,
      payload.stock !== undefined ? Number(payload.stock || 0) : current.stock,
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
