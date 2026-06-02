const express = require('express');
const walletController = require('../controllers/wallet.controller');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

router.get('/saldo', requireAuth(), walletController.getSaldo);
router.get('/saldo/logs', requireAuth(), walletController.listSaldoLogs);
router.get('/saldo/mutations', requireAuth(), walletController.listSaldoMutations);

module.exports = router;
