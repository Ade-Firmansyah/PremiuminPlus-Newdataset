import { findUserByApiKey } from '../repositories/user.repo.js';

export async function auth(req, res, next) {
  try {
    const apiKey = req.headers['x-api-key'];
    const user = await findUserByApiKey(apiKey);

    if (!user) {
      return res.status(401).json({
        status: false,
        message: 'Unauthorized',
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        status: false,
        message: 'Akun tidak aktif',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function resellerOnly(req, res, next) {
  if (!req.user || !['admin', 'reseller'].includes(req.user.role)) {
    return res.status(403).json({
      status: false,
      message: 'Akses API hanya untuk reseller',
    });
  }

  next();
}
