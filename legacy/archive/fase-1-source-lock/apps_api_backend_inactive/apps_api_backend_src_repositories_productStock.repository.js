async function addStockItem(pool, payload) {
  const [result] = await pool.query(
    `INSERT INTO product_stock_items
       (product_id, email_account, password_account, description, status)
     VALUES (?, ?, ?, ?, 'available')`,
    [payload.product_id, payload.email_account, payload.password_account, payload.description || null]
  );

  return result.insertId;
}

async function listByProduct(pool, productId) {
  const [rows] = await pool.query(
    `SELECT
       id, product_id, email_account, description, status,
       reserved_by_order_invoice, used_by_order_invoice,
       created_at, updated_at, reserved_at, used_at
     FROM product_stock_items
     WHERE product_id = ?
     ORDER BY id DESC`,
    [productId]
  );

  return rows;
}

async function findById(pool, stockItemId) {
  const [rows] = await pool.query(
    `SELECT id, product_id, status
     FROM product_stock_items
     WHERE id = ?
     LIMIT 1`,
    [stockItemId]
  );

  return rows[0] || null;
}

async function reserveAvailableForUpdate(connection, productId) {
  const [rows] = await connection.query(
    `SELECT *
     FROM product_stock_items
     WHERE product_id = ?
       AND status = 'available'
     ORDER BY id ASC
     LIMIT 1
     FOR UPDATE`,
    [productId]
  );

  return rows[0] || null;
}

async function markUsed(connection, stockItemId, invoice) {
  await connection.query(
    `UPDATE product_stock_items
     SET status = 'used',
         reserved_by_order_invoice = ?,
         used_by_order_invoice = ?,
         reserved_at = COALESCE(reserved_at, CURRENT_TIMESTAMP),
         used_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [invoice, invoice, stockItemId]
  );
}

async function disable(pool, stockItemId) {
  await pool.query(
    `UPDATE product_stock_items
     SET status = 'disabled', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status <> 'used'`,
    [stockItemId]
  );
}

module.exports = {
  addStockItem,
  listByProduct,
  findById,
  reserveAvailableForUpdate,
  markUsed,
  disable
};
