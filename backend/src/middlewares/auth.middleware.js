import { findUserByApiKey, getUserById } from '../repositories/user.repo.js';
import { verifyJwt } from '../utils/jwt.js';
import { safeCreateActivityLog } from '../repositories/activity.repo.js';
import { logger } from '../utils/logger.js';

export async function auth(req, res, next) {
  try {
    const authorization = String(req.headers.authorization || '');
    const bearer = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
    const apiKey = req.headers['x-api-key'];
    const tokenPayload = bearer ? verifyJwt(bearer) : null;
    const user = tokenPayload?.sub ? await getUserById(tokenPayload.sub) : await findUserByApiKey(apiKey);

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

    if (tokenPayload?.sub && Number(tokenPayload.token_version || 1) !== Number(user.token_version || 1)) {
      return res.status(401).json({
        status: false,
        message: 'Session expired',
      });
    }

    req.user = user;
    req.authType = tokenPayload?.sub ? 'jwt' : 'api_key';

    // Audit API key usage
    if (req.authType === 'api_key') {
      logger('API_KEY_USAGE', { user_id: user.id, username: user.username, endpoint: req.originalUrl, method: req.method, ip: req.ip });
      await safeCreateActivityLog({
        actor_id: user.id,
        scope: 'API_KEY_USAGE',
        message: `API key used for ${req.method} ${req.originalUrl}`,
        metadata: { endpoint: req.originalUrl, method: req.method },
        ip_address: req.ip,
      });
    }

    next();
  } catch (error) {
    next(error);
  }
}


