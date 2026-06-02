const express = require('express');
const depositController = require('../controllers/deposit.controller');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

router.post('/deposit', requireAuth(), depositController.createDeposit);
router.get('/deposits', requireAuth(), depositController.listDeposits);
router.get('/deposits/:invoice/status', requireAuth(), depositController.checkDepositStatus);
router.get('/deposit/:invoice/status', requireAuth(), depositController.checkDepositStatus);

module.exports = router;
