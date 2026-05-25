import env from './env.js';

const REQUIRED_IN_PRODUCTION = [
  ['JWT_SECRET', env.JWT_SECRET],
  ['MONGODB_URI', env.MONGODB_URI],
  ['FRONTEND_ORIGIN or CORS_ORIGIN', env.FRONTEND_ORIGIN],
  ['BOT_ENGINE_URL', env.BOT_ENGINE_URL],
  ['DB_HOST', env.DB_HOST],
  ['DB_USER', env.DB_USER],
  ['DB_NAME', env.DB_NAME],
  ['PREMKU_API_KEY or API_KEY', env.PREMKU_API_KEY],
];

export function validateProductionEnv() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const missing = REQUIRED_IN_PRODUCTION.filter(([, value]) => !String(value || '').trim()).map(([key]) => key);
  if (missing.length) {
    throw new Error(`Missing production environment variables: ${missing.join(', ')}`);
  }

  if (env.JWT_SECRET === 'premiumin-pluus-local-dev-secret' || env.JWT_SECRET.length < 24) {
    throw new Error('JWT_SECRET must be a long random value in production');
  }

  if (env.MONGODB_URI.includes('<') || env.MONGODB_URI.includes('YOUR_')) {
    throw new Error('MONGODB_URI must be a real Atlas connection string in production');
  }

  if (env.MONGO_SINGLE_SOURCE_OF_TRUTH && env.ALLOW_LEGACY_SQL_IN_PRODUCTION) {
    throw new Error('MONGO_SINGLE_SOURCE_OF_TRUTH cannot be combined with ALLOW_LEGACY_SQL_IN_PRODUCTION');
  }

  if (env.MONGO_SINGLE_SOURCE_OF_TRUTH) {
    throw new Error(
      'MongoDB single-source-of-truth mode is not safe yet: core repositories still import config/db.js. Run npm run audit:production and finish repository migration before enabling MONGO_SINGLE_SOURCE_OF_TRUTH=true.',
    );
  }
}
