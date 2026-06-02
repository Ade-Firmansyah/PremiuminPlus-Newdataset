const express = require('express');
const withdrawController = require('../controllers/withdraw.controller');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

router.post('/withdraw', requireAuth(), withdrawController.createWithdraw);
router.get('/withdraws', requireAuth(), withdrawController.listWithdraws);

module.exports = router;
