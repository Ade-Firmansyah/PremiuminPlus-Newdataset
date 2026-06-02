const express = require('express');
const productController = require('../controllers/product.controller');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

router.get('/', requireAuth(), productController.listProducts);
router.get('/:id', requireAuth(), productController.getProduct);

module.exports = router;
