const MANAGED_BOT_MEMBER_MESSAGE = 'Bot Engine hanya tersedia untuk reseller.';
const DEFAULT_MIN_LOCKED_BALANCE = 50000;
const MANAGED_BOT_ROUTE_PREFIXES = [
  '/api/bot',
  '/api/bot-settings'
];

function getManagedBotMinimumLockedBalance() {
  const configured = Number(process.env.BOT_LOCKED_BALANCE_MIN || DEFAULT_MIN_LOCKED_BALANCE);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MIN_LOCKED_BALANCE;
}

function jsonError(res, status, message) {
  return res.status(status).json({
    success: false,
    message
  });
}

function getApiKeyFromRequest(req) {
  const headerApiKey = req.get('x-api-key');
  if (headerApiKey) return headerApiKey.trim();

  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function resolvePool(req, options = {}) {
  return options.pool || req.app?.locals?.db || req.app?.locals?.pool || null;
}

async function findUserByApiKey(pool, apiKey) {
  const [rows] = await pool.query(
    `SELECT
       id,
       username,
       email,
       phone,
       role,
       saldo,
       locked_balance,
       bot_access_unlocked,
       bot_disabled_reason,
       bot_session_id,
       bot_connected_number,
       bot_last_active_at,
       bot_session_status,
       api_key
     FROM users
     WHERE api_key = ?
     LIMIT 1`,
    [apiKey]
  );

  return rows[0] || null;
}

async function ensureAuthenticated(req, res, options = {}) {
  if (req.user) return req.user;

  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) {
    jsonError(res, 401, 'Unauthorized.');
    return null;
  }

  const pool = resolvePool(req, options);
  if (!pool) {
    jsonError(res, 500, 'Database connection is not available.');
    return null;
  }

  const user = await findUserByApiKey(pool, apiKey);
  if (!user) {
    jsonError(res, 401, 'Invalid API key.');
    return null;
  }

  req.user = user;
  return user;
}

function requireAuth(options = {}) {
  return async (req, res, next) => {
    try {
      const user = await ensureAuthenticated(req, res, options);
      if (!user) return;
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireAdmin(options = {}) {
  return async (req, res, next) => {
    try {
      const user = await ensureAuthenticated(req, res, options);
      if (!user) return;

      if (user.role !== 'admin') {
        return jsonError(res, 403, 'Admin access required.');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireResellerOrAdmin(options = {}) {
  return async (req, res, next) => {
    try {
      const user = await ensureAuthenticated(req, res, options);
      if (!user) return;

      if (!['reseller', 'admin'].includes(user.role)) {
        return jsonError(res, 403, MANAGED_BOT_MEMBER_MESSAGE);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireManagedBotAccess(options = {}) {
  return async (req, res, next) => {
    try {
      const user = await ensureAuthenticated(req, res, options);
      if (!user) return;

      if (!['reseller', 'admin'].includes(user.role)) {
        return jsonError(res, 403, MANAGED_BOT_MEMBER_MESSAGE);
      }

      const saldo = Number(user.saldo || 0);
      const lockedBalance = Number(user.locked_balance || 0);
      const minLockedBalance = options.minLockedBalance || getManagedBotMinimumLockedBalance();
      const unlocked = Number(user.bot_access_unlocked) === 1 || user.bot_access_unlocked === true;

      if (!unlocked || saldo < lockedBalance || lockedBalance < minLockedBalance) {
        return jsonError(res, 403, user.bot_disabled_reason || 'Bot Engine belum aktif untuk akun ini.');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

function isManagedBotRoute(pathname) {
  return MANAGED_BOT_ROUTE_PREFIXES.some((prefix) => {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

function guardManagedBotRoutes(options = {}) {
  const managedBotAccess = requireManagedBotAccess(options);

  return (req, res, next) => {
    const pathname = req.path || req.originalUrl || '';
    if (!isManagedBotRoute(pathname)) {
      return next();
    }

    return managedBotAccess(req, res, next);
  };
}

function createAuthMiddlewares(options = {}) {
  return {
    requireAuth: requireAuth(options),
    requireAdmin: requireAdmin(options),
    requireResellerOrAdmin: requireResellerOrAdmin(options),
    requireManagedBotAccess: requireManagedBotAccess(options),
    guardManagedBotRoutes: guardManagedBotRoutes(options)
  };
}

module.exports = {
  MANAGED_BOT_MEMBER_MESSAGE,
  DEFAULT_MIN_LOCKED_BALANCE,
  MANAGED_BOT_ROUTE_PREFIXES,
  getManagedBotMinimumLockedBalance,
  getApiKeyFromRequest,
  isManagedBotRoute,
  requireAuth,
  requireAdmin,
  requireResellerOrAdmin,
  requireManagedBotAccess,
  guardManagedBotRoutes,
  createAuthMiddlewares
};
