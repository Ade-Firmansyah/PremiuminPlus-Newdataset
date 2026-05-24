import env from './env.js';

const REQUIRED_IN_PRODUCTION = [
  ['JWT_SECRET', env.JWT_SECRET],
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
}
