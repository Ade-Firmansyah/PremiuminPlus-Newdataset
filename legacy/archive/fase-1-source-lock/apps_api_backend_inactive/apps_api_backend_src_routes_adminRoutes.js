const express = require('express');
const adminController = require('../controllers/admin.controller');
const adminProductController = require('../controllers/adminProduct.controller');
const withdrawController = require('../controllers/withdraw.controller');
const { requireAuth, requireAdmin } = require('../middlewares/auth');

const router = express.Router();

router.get('/premku-key', requireAuth(), requireAdmin(), adminController.getPremkuKey);
router.patch('/premku-key', requireAuth(), requireAdmin(), adminController.updatePremkuKey);
router.get('/markup', requireAuth(), requireAdmin(), adminController.getMarkup);
router.patch('/markup', requireAuth(), requireAdmin(), adminController.updateMarkup);
router.get('/products', requireAuth(), requireAdmin(), adminProductController.listProducts);
router.post('/products', requireAuth(), requireAdmin(), adminProductController.create);
router.post('/products/manual', requireAuth(), requireAdmin(), adminProductController.createManual);
router.patch('/products/:id', requireAuth(), requireAdmin(), adminProductController.update);
router.patch('/products/:id/disable', requireAuth(), requireAdmin(), adminProductController.disable);
router.post('/products/:id/stock-items', requireAuth(), requireAdmin(), adminProductController.addStockItem);
router.get('/products/:id/stock-items', requireAuth(), requireAdmin(), adminProductController.listStockItems);
router.patch('/stock-items/:id/disable', requireAuth(), requireAdmin(), adminProductController.disableStockItem);
router.patch('/withdraws/:id/approve', requireAuth(), requireAdmin(), withdrawController.approveWithdraw);
router.patch('/withdraws/:id/reject', requireAuth(), requireAdmin(), withdrawController.rejectWithdraw);

module.exports = router;
