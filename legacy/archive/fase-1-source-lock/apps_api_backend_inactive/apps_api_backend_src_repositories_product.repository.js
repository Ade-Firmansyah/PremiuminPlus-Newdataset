async function findByPremkuIdsOrCodes(pool, products) {
  const premkuIds = products.map((item) => item.premku_id).filter(Boolean);
  const codes = products.map((item) => item.code).filter(Boolean);

  if (!premkuIds.length && !codes.length) return [];

  const conditions = [];
  const params = [];

  if (premkuIds.length) {
    conditions.push(`premku_id IN (${premkuIds.map(() => '?').join(',')})`);
    params.push(...premkuIds);
  }

  if (codes.length) {
    conditions.push(`code IN (${codes.map(() => '?').join(',')})`);
    params.push(...codes);
  }

  const [rows] = await pool.query(
    `SELECT id, premku_id, code, member_price, reseller_price
     FROM products
     WHERE ${conditions.join(' OR ')}`,
    params
  );

  return rows;
}

async function listActiveForRole(pool, role) {
  const priceColumn = role === 'reseller' ? 'reseller_price' : 'member_price';
  const [rows] = await pool.query(
    `SELECT
       id,
       premku_id,
       code,
       name,
       description,
       category,
       stock,
       status,
       product_source,
       is_manual,
       manual_stock_count,
       base_price,
       base_price AS price_base,
       admin_margin,
       member_markup,
       reseller_markup,
       ${priceColumn} AS final_price,
       ${priceColumn} AS visible_price,
       member_price,
       reseller_price,
       updated_at
     FROM products
     WHERE status = 'active'
     ORDER BY name ASC`
  );

  return rows;
}

async function findOrderableById(poolOrConnection, productId, role) {
  const priceColumn = role === 'reseller' ? 'reseller_price' : 'member_price';
  const [rows] = await poolOrConnection.query(
    `SELECT
       id,
       premku_id,
       code,
       name,
       stock,
       status,
       product_source,
       is_manual,
       manual_stock_count,
       base_price,
       admin_margin,
       member_price,
       reseller_price,
       ${priceColumn} AS final_price,
       ${priceColumn} AS visible_price
     FROM products
     WHERE id = ?
     LIMIT 1`,
    [productId]
  );

  return rows[0] || null;
}

async function upsertProducts(pool, products) {
  if (!products.length) {
    return { created_products: 0, updated_products: 0, failed_products: 0 };
  }

  const existingRows = await findByPremkuIdsOrCodes(pool, products);
  const existingByPremkuId = new Map(existingRows.filter((row) => row.premku_id).map((row) => [String(row.premku_id), row]));
  const existingByCode = new Map(existingRows.filter((row) => row.code).map((row) => [String(row.code), row]));

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const product of products) {
    try {
      const existing = existingByPremkuId.get(String(product.premku_id)) || existingByCode.get(String(product.code));
      if (existing) {
        const memberPrice = Number(existing.member_price || 0) > 0 ? existing.member_price : product.member_price;
        const resellerPrice = Number(existing.reseller_price || 0) > 0 ? existing.reseller_price : product.reseller_price;

        await pool.query(
          `UPDATE products
           SET premku_id = ?,
               code = ?,
               name = ?,
               description = ?,
               category = ?,
               stock = ?,
               status = ?,
               product_source = 'provider',
               is_manual = 0,
               base_price = ?,
               member_price = ?,
               reseller_price = ?,
               raw_response = ?,
               synced_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            product.premku_id,
            product.code,
            product.name,
            product.description,
            product.category,
            product.stock,
            product.status,
            product.base_price,
            memberPrice,
            resellerPrice,
            JSON.stringify(product.raw_response || product),
            existing.id
          ]
        );
        updated += 1;
      } else {
        await pool.query(
          `INSERT INTO products
             (premku_id, code, name, description, category, stock, status, product_source, is_manual, base_price, member_price, reseller_price, raw_response, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'provider', 0, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [
            product.premku_id,
            product.code,
            product.name,
            product.description,
            product.category,
            product.stock,
            product.status,
            product.base_price,
            product.member_price,
            product.reseller_price,
            JSON.stringify(product.raw_response || product)
          ]
        );
        created += 1;
      }
    } catch (error) {
      failed += 1;
    }
  }

  return {
    created_products: created,
    updated_products: updated,
    failed_products: failed
  };
}

async function markMissingProviderProductsUnavailable(pool, activePremkuIds) {
  if (!activePremkuIds.length) return 0;

  const [result] = await pool.query(
    `UPDATE products
     SET status = 'unavailable', stock = 0, updated_at = CURRENT_TIMESTAMP
     WHERE premku_id IS NOT NULL
       AND product_source = 'provider'
       AND premku_id NOT IN (${activePremkuIds.map(() => '?').join(',')})`,
    activePremkuIds
  );

  return result.affectedRows || 0;
}

async function listAdmin(pool, filters = {}) {
  const params = [];
  const where = [];

  if (filters.product_source) {
    where.push('product_source = ?');
    params.push(filters.product_source);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT
       id, premku_id, code, name, description, category, stock, status,
       product_source, is_manual, manual_stock_count,
       base_price,
       base_price AS price_base,
       admin_margin, member_markup, reseller_markup,
       member_price, reseller_price, synced_at, created_at, updated_at
     FROM products
     ${whereSql}
     ORDER BY updated_at DESC, id DESC`,
    params
  );

  return rows;
}

async function createProduct(pool, payload) {
  const [result] = await pool.query(
    `INSERT INTO products
       (premku_id, code, name, description, category, stock, status, product_source, is_manual, manual_stock_count, base_price, admin_margin, member_markup, reseller_markup, member_price, reseller_price)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
    [
      payload.premku_id || null,
      payload.code,
      payload.name,
      payload.description || null,
      payload.category || null,
      payload.stock || 0,
      payload.status,
      payload.product_source,
      payload.is_manual,
      payload.base_price,
      payload.admin_margin || 0,
      payload.member_markup || null,
      payload.reseller_markup || null,
      payload.member_price,
      payload.reseller_price
    ]
  );

  return result.insertId;
}

async function updateProduct(pool, productId, payload) {
  await pool.query(
    `UPDATE products
     SET premku_id = COALESCE(?, premku_id),
         code = ?,
         name = ?,
         description = ?,
         category = ?,
         status = ?,
         stock = CASE
           WHEN product_source = 'manual' OR is_manual = 1 THEN stock
           ELSE ?
         END,
         base_price = COALESCE(?, base_price),
         admin_margin = COALESCE(?, admin_margin),
         member_markup = COALESCE(?, member_markup),
         reseller_markup = COALESCE(?, reseller_markup),
         member_price = ?,
         reseller_price = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      payload.premku_id || null,
      payload.code,
      payload.name,
      payload.description || null,
      payload.category || null,
      payload.status,
      payload.stock || 0,
      payload.base_price,
      payload.admin_margin,
      payload.member_markup,
      payload.reseller_markup,
      payload.member_price,
      payload.reseller_price,
      productId
    ]
  );
}

async function listPricingRows(pool) {
  const [rows] = await pool.query(
    `SELECT
       id,
       base_price,
       base_price AS price_base,
       admin_margin,
       member_markup,
       reseller_markup,
       member_price,
       reseller_price
     FROM products
     ORDER BY id ASC`
  );

  return rows;
}

async function bulkUpdateMemberResellerPrices(pool, updates) {
  if (!updates.length) return 0;

  let updated = 0;
  for (const item of updates) {
    const [result] = await pool.query(
      `UPDATE products
       SET admin_margin = COALESCE(?, admin_margin),
           member_price = ?,
           reseller_price = ?,
           member_markup = ?,
           reseller_markup = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        item.admin_margin,
        item.member_price,
        item.reseller_price,
        item.member_markup,
        item.reseller_markup,
        item.id
      ]
    );
    updated += result.affectedRows || 0;
  }

  return updated;
}

async function disableProduct(pool, productId) {
  await pool.query(
    `UPDATE products
     SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [productId]
  );
}

async function syncManualStockCount(poolOrConnection, productId) {
  await poolOrConnection.query(
    `UPDATE products
     SET manual_stock_count = (
       SELECT COUNT(*)
       FROM product_stock_items
       WHERE product_id = ? AND status = 'available'
     ),
     stock = CASE
       WHEN product_source = 'manual' OR is_manual = 1 THEN (
         SELECT COUNT(*)
         FROM product_stock_items
         WHERE product_id = ? AND status = 'available'
       )
       ELSE stock
     END,
     updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [productId, productId, productId]
  );
}

module.exports = {
  listActiveForRole,
  findOrderableById,
  upsertProducts,
  markMissingProviderProductsUnavailable,
  listAdmin,
  createProduct,
  updateProduct,
  listPricingRows,
  bulkUpdateMemberResellerPrices,
  disableProduct,
  syncManualStockCount
};
