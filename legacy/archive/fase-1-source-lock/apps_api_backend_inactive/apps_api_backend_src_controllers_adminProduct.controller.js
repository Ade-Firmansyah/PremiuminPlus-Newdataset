const adminProductService = require('../services/adminProduct.service');

async function listProducts(req, res, next) {
  try {
    const data = await adminProductService.listProducts(req.app.locals.db, req.query || {});
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    const data = await adminProductService.create(req.app.locals.db, req.body || {});
    res.status(201).json({ success: true, message: 'Produk berhasil dibuat.', data });
  } catch (error) {
    next(error);
  }
}

async function createManual(req, res, next) {
  try {
    const data = await adminProductService.createManual(req.app.locals.db, req.body || {});
    res.status(201).json({ success: true, message: 'Produk manual berhasil dibuat.', data });
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    await adminProductService.update(req.app.locals.db, req.params.id, req.body || {});
    res.json({ success: true, message: 'Produk berhasil diperbarui.' });
  } catch (error) {
    next(error);
  }
}

async function disable(req, res, next) {
  try {
    await adminProductService.disable(req.app.locals.db, req.params.id);
    res.json({ success: true, message: 'Produk berhasil dinonaktifkan.' });
  } catch (error) {
    next(error);
  }
}

async function addStockItem(req, res, next) {
  try {
    const data = await adminProductService.addStockItem(req.app.locals.db, req.params.id, req.body || {});
    res.status(201).json({ success: true, message: 'Stock akun berhasil ditambahkan.', data });
  } catch (error) {
    next(error);
  }
}

async function listStockItems(req, res, next) {
  try {
    const data = await adminProductService.listStockItems(req.app.locals.db, req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function disableStockItem(req, res, next) {
  try {
    await adminProductService.disableStockItem(req.app.locals.db, req.params.id);
    res.json({ success: true, message: 'Stock akun berhasil dinonaktifkan.' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listProducts,
  create,
  createManual,
  update,
  disable,
  addStockItem,
  listStockItems,
  disableStockItem
};
