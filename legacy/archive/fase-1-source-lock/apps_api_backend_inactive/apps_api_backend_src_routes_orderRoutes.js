const express = require('express');
const orderController = require('../controllers/order.controller');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

router.post('/order', requireAuth(), orderController.createOrder);
router.get('/orders', requireAuth(), orderController.listOrders);
router.get('/order/:invoice', requireAuth(), orderController.getOrder);

module.exports = router;
