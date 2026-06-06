import express from 'express';
import { publicApiAuth, publicApiIpRateLimit, publicApiUserRateLimit } from '../../middlewares/public-api.middleware.js';
import { cancelPay, order, pay, payStatus, products, profile, status, stock } from './public-api.controller.js';

const router = express.Router();

router.use(publicApiIpRateLimit);
router.use(publicApiAuth);
router.use(publicApiUserRateLimit);
router.post('/profile', profile);
router.post('/products', products);
router.post('/stock', stock);
router.post('/pay', pay);
router.post('/pay_status', payStatus);
router.post('/cancel_pay', cancelPay);
router.post('/order', order);
router.post('/status', status);

export default router;
