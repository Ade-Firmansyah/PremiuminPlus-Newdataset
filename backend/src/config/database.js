import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

const DEFAULT_DB_NAME = 'premiuminpluus';
const DAY_SECONDS = 24 * 60 * 60;

const TEMP_COLLECTIONS = [
  'webhook_logs',
  'provider_logs',
  'realtime_cache',
  'temporary_socket_logs',
  'expired_qr',
  'temporary_notifications',
  'stale_activity_logs',
  'failed_temp_orders',
  'expired_payment_cache',
  'temporary_bot_logs',
];

const REQUIRED_COLLECTIONS = [
  'users',
  'wallets',
  'wallet_mutations',
  'products',
  'manual_product_accounts',
  'orders',
  'payments',
  'deposits',
  'withdraws',
  'notifications',
  'bot_sessions',
  'settings',
  'activity_logs',
  'provider_logs',
  'webhook_logs',
];

let listenersAttached = false;

function mongoUri() {
  return String(process.env.MONGODB_URI || process.env.MONGO_URI || '').trim();
}

function mongoDbName() {
  return process.env.MONGODB_DBNAME || process.env.MONGO_DBNAME || DEFAULT_DB_NAME;
}

async function ensureCollection(db, name) {
  const exists = await db.listCollections({ name }).hasNext();
  if (!exists) await db.createCollection(name);
}

async function ensureMongoCollections(db) {
  await Promise.all(REQUIRED_COLLECTIONS.map((name) => ensureCollection(db, name)));
}

async function ensureMongoIndexes(db, retentionDays = 7) {
  await db.collection('users').createIndex({ username: 1 }, { unique: true, sparse: true, name: 'idx_users_username' });
  await db.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true, name: 'idx_users_email' });
  await db.collection('users').createIndex({ whatsapp: 1 }, { sparse: true, name: 'idx_users_whatsapp' });
  await db.collection('users').createIndex({ phone: 1 }, { sparse: true, name: 'idx_users_phone' });

  await db.collection('orders').createIndex({ invoice: 1 }, { unique: true, sparse: true, name: 'idx_orders_invoice' });
  await db.collection('payments').createIndex({ invoice: 1 }, { unique: true, sparse: true, name: 'idx_payments_invoice' });
  await db.collection('deposits').createIndex({ invoice: 1 }, { unique: true, sparse: true, name: 'idx_deposits_invoice' });

  await db.collection('products').createIndex({ code: 1 }, { unique: true, sparse: true, name: 'idx_products_code' });
  await db.collection('products').createIndex({ slug: 1 }, { unique: true, sparse: true, name: 'idx_products_slug' });

  await db.collection('wallets').createIndex({ user_id: 1 }, { unique: true, sparse: true, name: 'idx_wallets_user_id' });
  await db.collection('wallet_mutations').createIndex({ user_id: 1, created_at: -1 }, { name: 'idx_wallet_mutations_user_created' });
  await db.collection('manual_product_accounts').createIndex(
    { product_id: 1, status: 1 },
    { name: 'idx_manual_product_accounts_product_status' },
  );

  for (const name of TEMP_COLLECTIONS) {
    const collection = db.collection(name);
    await collection.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'ttl_expires_at' });
    await collection.createIndex({ created_at: 1 }, { name: 'idx_created_at' });
    await collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: retentionDays * DAY_SECONDS, name: 'ttl_legacy_createdAt' });
  }
}

export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return { client: mongoose.connection.getClient(), db: mongoose.connection.db };
  }

  const uri = mongoUri();
  const dbName = mongoDbName();
  const retentionDays = Number(process.env.CLEANUP_RETENTION_DAYS || 7);

  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Add your MongoDB Atlas URI to .env, or set MONGODB_URI=mongodb://127.0.0.1:27017/premiuminpluus after starting a local MongoDB server.',
    );
  }

  mongoose.set('strictQuery', true);
  if (!listenersAttached) {
    mongoose.connection.on('disconnected', () => {
      logger('SYSTEM', { task: 'mongodb', status: 'disconnected' });
    });
    mongoose.connection.on('reconnected', () => {
      logger('SYSTEM', { task: 'mongodb', status: 'reconnected' });
    });
    mongoose.connection.on('error', (error) => {
      logger('ERROR', { task: 'mongodb', message: error instanceof Error ? error.message : 'MongoDB connection error' });
    });
    listenersAttached = true;
  }

  await mongoose.connect(uri, {
    dbName,
    autoIndex: true,
    maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || 5),
    minPoolSize: Number(process.env.MONGODB_MIN_POOL_SIZE || 0),
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000),
    socketTimeoutMS: Number(process.env.MONGODB_SOCKET_TIMEOUT_MS || 45000),
  });

  const db = mongoose.connection.db;
  await db.command({ ping: 1 });
  await ensureMongoCollections(db);
  await ensureMongoIndexes(db, retentionDays);

  return { client: mongoose.connection.getClient(), db };
}

export function getDatabase() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new Error('MongoDB not connected. Call connectDatabase() first.');
  }
  return mongoose.connection.db;
}

export function getMongoClient() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB not connected. Call connectDatabase() first.');
  }
  return mongoose.connection.getClient();
}

export function startDatabaseSession() {
  return getMongoClient().startSession();
}

export async function closeDatabase() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
}

export default {
  connectDatabase,
  getDatabase,
  getMongoClient,
  startDatabaseSession,
  closeDatabase,
};
