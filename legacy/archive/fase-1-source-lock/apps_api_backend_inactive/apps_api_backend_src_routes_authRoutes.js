const express = require('express');
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

router.post('/auth/login', authController.login);
router.get('/auth/me', requireAuth(), authController.me);
router.get('/me', requireAuth(), authController.me);

module.exports = router;
