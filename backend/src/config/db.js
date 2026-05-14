import mysql from 'mysql2/promise';
import env from './env.js';
import { hashPassword } from '../utils/password.js';
import crypto from 'node:crypto';

const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: 10,
  waitForConnections: true,
  multipleStatements: false,
  namedPlaceholders: true,
});

let initPromise = null;

async function ensureDatabaseExists() {
  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } catch (error) {
    const canContinueWithExistingDatabase = ['ER_DBACCESS_DENIED_ERROR', 'ER_ACCESS_DENIED_ERROR'].includes(error?.code);
    if (!canContinueWithExistingDatabase) {
      throw error;
    }
    console.warn('[SYSTEM] Database create skipped; using configured Railway/MySQL database');
  } finally {
    await connection.end();
  }
}

function reviveJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function parseDbJson(value, fallback = null) {
  return reviveJson(value, fallback);
}

export async function query(sql, params = []) {
  await ensureInitialized();
  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function execute(sql, params = []) {
  await ensureInitialized();
  const [result] = await pool.execute(sql, params);
  return result;
}

export async function transaction(handler) {
  await ensureInitialized();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await handler(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function ensureTableStatements() {
  return [
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(80) NOT NULL UNIQUE,
      email VARCHAR(120) NULL UNIQUE,
      phone VARCHAR(30) NULL,
      password_hash VARCHAR(255) NOT NULL,
      api_key VARCHAR(120) NOT NULL UNIQUE,
      saldo_utama BIGINT NOT NULL DEFAULT 0,
      saldo BIGINT NOT NULL DEFAULT 0,
      locked_balance BIGINT NOT NULL DEFAULT 0,
      bot_enabled TINYINT(1) NOT NULL DEFAULT 0,
      bot_role VARCHAR(40) NOT NULL DEFAULT 'personal',
      bot_session_status ENUM('disconnected', 'connecting', 'qr', 'connected', 'logged_out', 'error') NOT NULL DEFAULT 'disconnected',
      markup_custom INT NOT NULL DEFAULT 0,
      markup_percent INT NOT NULL DEFAULT 0,
      theme ENUM('dark', 'light') NOT NULL DEFAULT 'dark',
      fullName VARCHAR(150) NOT NULL DEFAULT '',
      orders INT NOT NULL DEFAULT 0,
      deposits INT NOT NULL DEFAULT 0,
      notes TEXT NULL,
      role ENUM('admin', 'reseller', 'member') NOT NULL DEFAULT 'member',
      status ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
      token_version INT NOT NULL DEFAULT 1,
      last_login_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT chk_users_saldo_utama_non_negative CHECK (saldo_utama >= 0)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      premku_id INT NULL,
      name VARCHAR(150) NOT NULL,
      code VARCHAR(80) NOT NULL UNIQUE,
      slug VARCHAR(120) NULL,
      note TEXT NULL,
      tag VARCHAR(80) NULL,
      image TEXT NULL,
      product_type ENUM('api', 'manual') NOT NULL DEFAULT 'api',
      product_source ENUM('provider', 'manual', 'hybrid') NOT NULL DEFAULT 'provider',
      provider VARCHAR(40) NOT NULL DEFAULT 'premku',
      provider_status VARCHAR(40) NOT NULL DEFAULT 'unknown',
      price_base BIGINT NOT NULL DEFAULT 0,
      base_price BIGINT NOT NULL DEFAULT 0,
      price_sell BIGINT NOT NULL DEFAULT 0,
      member_price BIGINT NOT NULL DEFAULT 0,
      reseller_price BIGINT NOT NULL DEFAULT 0,
      admin_margin BIGINT NOT NULL DEFAULT 0,
      member_markup BIGINT NOT NULL DEFAULT 0,
      reseller_markup BIGINT NOT NULL DEFAULT 0,
      stock INT NOT NULL DEFAULT 0,
      stock_mode ENUM('provider', 'manual', 'combined') NOT NULL DEFAULT 'provider',
      manual_stock INT NOT NULL DEFAULT 0,
      provider_stock INT NOT NULL DEFAULT 0,
      is_bot_enabled TINYINT(1) NOT NULL DEFAULT 1,
      is_visible TINYINT(1) NOT NULL DEFAULT 1,
      status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_products_status (status),
      INDEX idx_products_type_status (product_type, status),
      INDEX idx_products_source_visible (product_source, is_visible, status),
      INDEX idx_products_premku_id (premku_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS produk_stock_manual (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      email VARCHAR(180) NOT NULL,
      password VARCHAR(255) NOT NULL,
      status ENUM('available', 'sold') NOT NULL DEFAULT 'available',
      sold_to INT NULL,
      sold_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (sold_to) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_manual_stock_product_status (product_id, status),
      INDEX idx_manual_stock_sold_to (sold_to)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS product_credentials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      email VARCHAR(180) NOT NULL,
      password VARCHAR(255) NOT NULL,
      status ENUM('available', 'sold') NOT NULL DEFAULT 'available',
      sold_at DATETIME NULL,
      buyer_id INT NULL,
      invoice VARCHAR(120) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_product_credentials_product_status (product_id, status),
      INDEX idx_product_credentials_invoice (invoice),
      INDEX idx_product_credentials_buyer (buyer_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS manual_product_accounts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      email VARCHAR(180) NOT NULL,
      password VARCHAR(255) NOT NULL,
      status ENUM('available', 'reserved', 'sold') NOT NULL DEFAULT 'available',
      reserved_by INT NULL,
      reserved_at DATETIME NULL,
      sold_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (reserved_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_manual_product_accounts_product_status (product_id, status),
      INDEX idx_manual_product_accounts_reserved_by (reserved_by),
      INDEX idx_manual_product_accounts_sold_at (sold_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice VARCHAR(80) NOT NULL UNIQUE,
      ref_id VARCHAR(100) NULL UNIQUE,
      user_id INT NOT NULL,
      product_id INT NULL,
      product_name VARCHAR(150) NULL,
      transaction_type VARCHAR(40) NOT NULL DEFAULT 'order',
      idempotency_key VARCHAR(120) NULL UNIQUE,
      amount BIGINT NOT NULL DEFAULT 0,
      qty INT NOT NULL DEFAULT 1,
      price_base BIGINT NOT NULL DEFAULT 0,
      price_sell BIGINT NOT NULL DEFAULT 0,
      total_price BIGINT NOT NULL DEFAULT 0,
      profit BIGINT NOT NULL DEFAULT 0,
      status ENUM('pending', 'processing', 'success', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
      account_data JSON NULL,
      external_order_response JSON NULL,
      external_status_response JSON NULL,
      refund_at DATETIME NULL,
      processed_at DATETIME NULL,
      product_image TEXT NULL,
      description TEXT NULL,
      channel VARCHAR(40) NOT NULL DEFAULT 'website',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      INDEX idx_transactions_user_id (user_id),
      INDEX idx_transactions_product_id (product_id),
      INDEX idx_transactions_status (status),
      INDEX idx_transactions_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS saldo_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      type ENUM('credit', 'debit', 'refund', 'adjustment') NOT NULL,
      amount BIGINT NOT NULL,
      balance_before BIGINT NOT NULL,
      balance_after BIGINT NOT NULL,
      reference VARCHAR(120) NULL,
      notes TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      INDEX idx_saldo_logs_user_id (user_id),
      INDEX idx_saldo_logs_reference (reference)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS saldo_mutations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      mutation_type ENUM('deposit', 'order', 'withdraw', 'adjustment', 'refund') NOT NULL,
      amount BIGINT NOT NULL,
      balance_before BIGINT NOT NULL,
      balance_after BIGINT NOT NULL,
      reference VARCHAR(120) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      INDEX idx_saldo_mutations_user_id (user_id),
      INDEX idx_saldo_mutations_type (mutation_type),
      INDEX idx_saldo_mutations_reference (reference)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS deposits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      invoice VARCHAR(80) NOT NULL UNIQUE,
      amount BIGINT NOT NULL,
      total_bayar BIGINT NOT NULL,
      status ENUM('pending', 'success', 'failed', 'expired', 'canceled') NOT NULL DEFAULT 'pending',
      qr_data TEXT NULL,
      qr_image LONGTEXT NULL,
      external_response JSON NULL,
      external_status_response JSON NULL,
      processed_at DATETIME NULL,
      expired_at DATETIME NULL,
      canceled_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      INDEX idx_deposits_user_id (user_id),
      INDEX idx_deposits_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      invoice VARCHAR(80) NOT NULL UNIQUE,
      amount BIGINT NOT NULL DEFAULT 0,
      total_bayar BIGINT NOT NULL DEFAULT 0,
      payment_type VARCHAR(40) NOT NULL DEFAULT 'direct_order',
      status ENUM('pending', 'success', 'failed', 'expired', 'canceled') NOT NULL DEFAULT 'pending',
      qr_image LONGTEXT NULL,
      qr_raw LONGTEXT NULL,
      product_id INT NULL,
      qty INT NOT NULL DEFAULT 1,
      target_whatsapp VARCHAR(30) NULL,
      order_invoice VARCHAR(80) NULL,
      reserved_manual_account_id INT NULL,
      raw_response JSON NULL,
      status_response JSON NULL,
      processed_at DATETIME NULL,
      expired_at DATETIME NULL,
      canceled_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (reserved_manual_account_id) REFERENCES manual_product_accounts(id) ON DELETE SET NULL,
      INDEX idx_payments_user_id (user_id),
      INDEX idx_payments_status (status),
      INDEX idx_payments_reserved_manual_account (reserved_manual_account_id),
      INDEX idx_payments_order_invoice (order_invoice)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      role ENUM('admin', 'reseller', 'member') NOT NULL DEFAULT 'member',
      invoice VARCHAR(80) NOT NULL UNIQUE,
      payment_invoice VARCHAR(80) NULL,
      product_id INT NULL,
      product_name VARCHAR(150) NULL,
      email_account VARCHAR(180) NULL,
      password_account VARCHAR(255) NULL,
      payment_status ENUM('pending', 'success', 'failed', 'refunded', 'canceled') NOT NULL DEFAULT 'pending',
      order_status ENUM('pending', 'processing', 'success', 'failed') NOT NULL DEFAULT 'pending',
      target_whatsapp VARCHAR(30) NULL,
      delivery_status ENUM('pending', 'sent', 'failed', 'manual_pending') NOT NULL DEFAULT 'pending',
      delivery_time DATETIME NULL,
      total_price BIGINT NOT NULL DEFAULT 0,
      raw_response JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      INDEX idx_orders_user_id (user_id),
      INDEX idx_orders_payment_invoice (payment_invoice),
      INDEX idx_orders_order_status (order_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS withdraws (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      amount BIGINT NOT NULL,
      status ENUM('pending', 'approved', 'rejected', 'paid') NOT NULL DEFAULT 'pending',
      bank_account VARCHAR(120) NULL,
      notes TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      INDEX idx_withdraws_user_id (user_id),
      INDEX idx_withdraws_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS webhook_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      source VARCHAR(80) NOT NULL DEFAULT 'premku',
      payload JSON NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'received',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_webhook_logs_source (source),
      INDEX idx_webhook_logs_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(150) NOT NULL,
      message TEXT NOT NULL,
      type VARCHAR(40) NOT NULL DEFAULT 'broadcast',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      is_pinned TINYINT(1) NOT NULL DEFAULT 0,
      target_role ENUM('all', 'admin', 'reseller', 'member') NOT NULL DEFAULT 'all',
      created_by INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_notifications_target_role (target_role),
      INDEX idx_notifications_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      setting_key VARCHAR(80) NOT NULL UNIQUE,
      ` + '`key`' + ` VARCHAR(80) NULL,
      setting_value JSON NOT NULL,
      value JSON NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS activity_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      actor_id INT NULL,
      user_id INT NULL,
      scope VARCHAR(40) NOT NULL,
      message VARCHAR(255) NOT NULL,
      activity VARCHAR(255) NULL,
      ip_address VARCHAR(64) NULL,
      metadata JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_activity_logs_scope (scope),
      INDEX idx_activity_logs_actor_id (actor_id),
      INDEX idx_activity_logs_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ];
}

async function ensureSchema(connection) {
  for (const statement of ensureTableStatements()) {
    await connection.query(statement);
  }

  await ensureCanonicalSchema(connection);
  await ensurePerformanceIndexes(connection);

  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS fullName VARCHAR(150) NOT NULL DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS orders INT NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS deposits INT NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS notes TEXT NULL`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS markup_percent INT NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_balance BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS saldo_utama BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_enabled TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_role VARCHAR(40) NOT NULL DEFAULT 'personal'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_session_status ENUM('disconnected', 'connecting', 'qr', 'connected', 'logged_out', 'error') NOT NULL DEFAULT 'disconnected'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 1`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS theme ENUM('dark', 'light') NOT NULL DEFAULT 'dark'`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS note TEXT NULL`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS slug VARCHAR(120) NULL`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS tag VARCHAR(80) NULL`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS image TEXT NULL`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type ENUM('api', 'manual') NOT NULL DEFAULT 'api'`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS product_source ENUM('provider', 'manual', 'hybrid') NOT NULL DEFAULT 'provider'`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS provider VARCHAR(40) NOT NULL DEFAULT 'premku'`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS provider_status VARCHAR(40) NOT NULL DEFAULT 'unknown'`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS admin_margin BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS base_price BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS member_price BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS reseller_price BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS member_markup BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS reseller_markup BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_mode ENUM('provider', 'manual', 'combined') NOT NULL DEFAULT 'provider'`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS manual_stock INT NOT NULL DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS provider_stock INT NOT NULL DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS is_bot_enabled TINYINT(1) NOT NULL DEFAULT 1`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS is_visible TINYINT(1) NOT NULL DEFAULT 1`,
    `ALTER TABLE produk_stock_manual ADD COLUMN IF NOT EXISTS product_id INT NULL`,
    `ALTER TABLE produk_stock_manual MODIFY COLUMN produk_id INT NULL`,
    `ALTER TABLE produk_stock_manual ADD COLUMN IF NOT EXISTS sold_to INT NULL`,
    `ALTER TABLE produk_stock_manual ADD COLUMN IF NOT EXISTS sold_at DATETIME NULL`,
    `UPDATE produk_stock_manual SET product_id = produk_id WHERE product_id IS NULL AND produk_id IS NOT NULL`,
    `ALTER TABLE produk_stock_manual MODIFY COLUMN status ENUM('ready', 'available', 'sold') NOT NULL DEFAULT 'available'`,
    `UPDATE produk_stock_manual SET status = 'available' WHERE status = 'ready'`,
    `ALTER TABLE produk_stock_manual MODIFY COLUMN status ENUM('available', 'sold') NOT NULL DEFAULT 'available'`,
    `CREATE TABLE IF NOT EXISTS manual_product_accounts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      email VARCHAR(180) NOT NULL,
      password VARCHAR(255) NOT NULL,
      status ENUM('available', 'reserved', 'sold') NOT NULL DEFAULT 'available',
      reserved_by INT NULL,
      reserved_at DATETIME NULL,
      sold_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (reserved_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_manual_product_accounts_product_status (product_id, status),
      INDEX idx_manual_product_accounts_reserved_by (reserved_by),
      INDEX idx_manual_product_accounts_sold_at (sold_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `ALTER TABLE manual_product_accounts MODIFY COLUMN status ENUM('available', 'reserved', 'sold') NOT NULL DEFAULT 'available'`,
    `ALTER TABLE manual_product_accounts ADD COLUMN IF NOT EXISTS reserved_by INT NULL`,
    `ALTER TABLE manual_product_accounts ADD COLUMN IF NOT EXISTS reserved_at DATETIME NULL`,
    `ALTER TABLE manual_product_accounts ADD COLUMN IF NOT EXISTS sold_at DATETIME NULL`,
    `ALTER TABLE manual_product_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    `INSERT INTO product_credentials (product_id, email, password, status, sold_at, buyer_id, invoice, created_at)
     SELECT COALESCE(product_id, produk_id), email, password, status, sold_at, sold_to, NULL, created_at
     FROM produk_stock_manual legacy
     WHERE COALESCE(product_id, produk_id) IS NOT NULL
       AND NOT EXISTS (
        SELECT 1 FROM product_credentials pc
        WHERE pc.product_id = COALESCE(legacy.product_id, legacy.produk_id)
          AND pc.email = legacy.email
          AND pc.password = legacy.password
          AND pc.created_at = legacy.created_at
       )`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_data JSON NULL`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(40) NOT NULL DEFAULT 'order'`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120) NULL UNIQUE`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS amount BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_order_response JSON NULL`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_status_response JSON NULL`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS refund_at DATETIME NULL`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS processed_at DATETIME NULL`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS product_image TEXT NULL`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS description TEXT NULL`,
    `ALTER TABLE deposits ADD COLUMN IF NOT EXISTS external_response JSON NULL`,
    `ALTER TABLE deposits ADD COLUMN IF NOT EXISTS external_status_response JSON NULL`,
    `ALTER TABLE deposits ADD COLUMN IF NOT EXISTS processed_at DATETIME NULL`,
    `ALTER TABLE deposits ADD COLUMN IF NOT EXISTS qr_image LONGTEXT NULL`,
    `ALTER TABLE deposits ADD COLUMN IF NOT EXISTS expired_at DATETIME NULL`,
    `ALTER TABLE deposits ADD COLUMN IF NOT EXISTS canceled_at DATETIME NULL`,
    `ALTER TABLE deposits MODIFY COLUMN status ENUM('pending', 'success', 'failed', 'expired', 'canceled') NOT NULL DEFAULT 'pending'`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS product_id INT NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS total_bayar BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS target_whatsapp VARCHAR(30) NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS qty INT NOT NULL DEFAULT 1`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS qr_raw LONGTEXT NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS order_invoice VARCHAR(80) NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS raw_response JSON NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS status_response JSON NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS processed_at DATETIME NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS expired_at DATETIME NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS canceled_at DATETIME NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS reserved_manual_account_id INT NULL`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_invoice VARCHAR(80) NULL`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_id INT NULL`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS target_whatsapp VARCHAR(30) NULL`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_status ENUM('pending', 'sent', 'failed', 'manual_pending') NOT NULL DEFAULT 'pending'`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_time DATETIME NULL`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_price BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_role ENUM('all', 'admin', 'reseller', 'member') NOT NULL DEFAULT 'all'`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_by INT NULL`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type VARCHAR(40) NOT NULL DEFAULT 'broadcast'`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_pinned TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS setting_key VARCHAR(80) NULL`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS setting_value JSON NULL`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS \`key\` VARCHAR(80) NULL`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS value JSON NULL`,
    `ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS activity VARCHAR(255) NULL`,
    `ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64) NULL`,
    `UPDATE users SET markup_percent = markup_custom WHERE markup_percent = 0 AND markup_custom > 0`,
    `UPDATE products SET base_price = price_base WHERE base_price = 0 AND price_base > 0`,
    `UPDATE settings SET \`key\` = setting_key WHERE \`key\` IS NULL AND setting_key IS NOT NULL`,
    `UPDATE settings SET value = setting_value WHERE value IS NULL AND setting_value IS NOT NULL`,
  ];

  for (const statement of migrations) {
    try {
      await connection.query(statement);
    } catch {
      // Ignore migration differences on older MySQL variants.
    }
  }
}

async function ensurePerformanceIndexes(connection) {
  const indexes = [
    ['deposits', 'idx_deposits_invoice_status', 'CREATE INDEX idx_deposits_invoice_status ON deposits (invoice, status)'],
    ['deposits', 'idx_deposits_expired_at', 'CREATE INDEX idx_deposits_expired_at ON deposits (status, expired_at)'],
    ['payments', 'idx_payments_invoice_status', 'CREATE INDEX idx_payments_invoice_status ON payments (invoice, status)'],
    ['payments', 'idx_payments_expired_at', 'CREATE INDEX idx_payments_expired_at ON payments (status, expired_at)'],
    ['transactions', 'idx_transactions_type_status_id', 'CREATE INDEX idx_transactions_type_status_id ON transactions (transaction_type, status, id)'],
    ['transactions', 'idx_transactions_invoice_status', 'CREATE INDEX idx_transactions_invoice_status ON transactions (invoice, status)'],
    ['orders', 'idx_orders_invoice_status', 'CREATE INDEX idx_orders_invoice_status ON orders (invoice, order_status)'],
    ['produk_stock_manual', 'idx_manual_stock_product_status', 'CREATE INDEX idx_manual_stock_product_status ON produk_stock_manual (product_id, status)'],
    ['produk_stock_manual', 'idx_manual_stock_product_id_status', 'CREATE INDEX idx_manual_stock_product_id_status ON produk_stock_manual (product_id, status)'],
    ['product_credentials', 'idx_product_credentials_product_status', 'CREATE INDEX idx_product_credentials_product_status ON product_credentials (product_id, status)'],
    ['products', 'idx_products_source_visible', 'CREATE INDEX idx_products_source_visible ON products (product_source, is_visible, status)'],
    ['activity_logs', 'idx_activity_logs_retention', 'CREATE INDEX idx_activity_logs_retention ON activity_logs (scope, created_at)'],
    ['webhook_logs', 'idx_webhook_logs_retention', 'CREATE INDEX idx_webhook_logs_retention ON webhook_logs (created_at)'],
  ];

  for (const [, , statement] of indexes) {
    try {
      await connection.query(statement);
    } catch (error) {
      if (error?.code !== 'ER_DUP_KEYNAME') {
        throw error;
      }
    }
  }
}

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [env.DB_NAME, table, column],
  );
  return rows.length > 0;
}

async function ensureColumn(connection, table, column, definition) {
  if (await columnExists(connection, table, column)) {
    return;
  }
  await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
}

async function ensureCanonicalSchema(connection) {
  const requiredColumns = [
    ['users', 'email', '`email` VARCHAR(120) NULL UNIQUE'],
    ['users', 'phone', '`phone` VARCHAR(30) NULL'],
    ['users', 'password_hash', '`password_hash` VARCHAR(255) NOT NULL DEFAULT ""'],
    ['users', 'password', '`password` VARCHAR(255) NULL'],
    ['users', 'role', "`role` ENUM('admin', 'reseller', 'member') NOT NULL DEFAULT 'member'"],
    ['users', 'saldo_utama', '`saldo_utama` BIGINT NOT NULL DEFAULT 0'],
    ['users', 'saldo', '`saldo` BIGINT NOT NULL DEFAULT 0'],
    ['users', 'locked_balance', '`locked_balance` BIGINT NOT NULL DEFAULT 0'],
    ['users', 'bot_enabled', '`bot_enabled` TINYINT(1) NOT NULL DEFAULT 0'],
    ['users', 'bot_role', '`bot_role` VARCHAR(40) NOT NULL DEFAULT "personal"'],
    ['users', 'bot_session_status', "`bot_session_status` ENUM('disconnected', 'connecting', 'qr', 'connected', 'logged_out', 'error') NOT NULL DEFAULT 'disconnected'"],
    ['users', 'markup_custom', '`markup_custom` INT NOT NULL DEFAULT 0'],
    ['users', 'markup_percent', '`markup_percent` INT NOT NULL DEFAULT 0'],
    ['users', 'theme', "`theme` ENUM('dark', 'light') NOT NULL DEFAULT 'dark'"],
    ['users', 'created_at', '`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],
    ['users', 'token_version', '`token_version` INT NOT NULL DEFAULT 1'],

    ['products', 'name', '`name` VARCHAR(150) NOT NULL DEFAULT ""'],
    ['products', 'slug', '`slug` VARCHAR(120) NULL'],
    ['products', 'description', '`description` TEXT NULL'],
    ['products', 'base_price', '`base_price` BIGINT NOT NULL DEFAULT 0'],
    ['products', 'price_base', '`price_base` BIGINT NOT NULL DEFAULT 0'],
    ['products', 'admin_margin', '`admin_margin` BIGINT NOT NULL DEFAULT 0'],
    ['products', 'member_price', '`member_price` BIGINT NOT NULL DEFAULT 0'],
    ['products', 'reseller_price', '`reseller_price` BIGINT NOT NULL DEFAULT 0'],
    ['products', 'member_markup', '`member_markup` BIGINT NOT NULL DEFAULT 0'],
    ['products', 'reseller_markup', '`reseller_markup` BIGINT NOT NULL DEFAULT 0'],
    ['products', 'stock', '`stock` INT NOT NULL DEFAULT 0'],
    ['products', 'stock_mode', "`stock_mode` ENUM('provider', 'manual', 'combined') NOT NULL DEFAULT 'provider'"],
    ['products', 'manual_stock', '`manual_stock` INT NOT NULL DEFAULT 0'],
    ['products', 'provider_stock', '`provider_stock` INT NOT NULL DEFAULT 0'],
    ['products', 'image_url', '`image_url` TEXT NULL'],
    ['products', 'image', '`image` TEXT NULL'],
    ['products', 'product_type', "`product_type` ENUM('api', 'manual') NOT NULL DEFAULT 'api'"],
    ['products', 'product_source', "`product_source` ENUM('provider', 'manual', 'hybrid') NOT NULL DEFAULT 'provider'"],
    ['products', 'provider', '`provider` VARCHAR(40) NOT NULL DEFAULT "premku"'],
    ['products', 'provider_status', '`provider_status` VARCHAR(40) NOT NULL DEFAULT "unknown"'],
    ['products', 'is_bot_enabled', '`is_bot_enabled` TINYINT(1) NOT NULL DEFAULT 1'],
    ['products', 'is_visible', '`is_visible` TINYINT(1) NOT NULL DEFAULT 1'],
    ['products', 'status', "`status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active'"],

    ['produk_stock_manual', 'product_id', '`product_id` INT NULL'],
    ['produk_stock_manual', 'email', '`email` VARCHAR(180) NOT NULL DEFAULT ""'],
    ['produk_stock_manual', 'password', '`password` VARCHAR(255) NOT NULL DEFAULT ""'],
    ['produk_stock_manual', 'status', "`status` ENUM('available', 'sold') NOT NULL DEFAULT 'available'"],
    ['produk_stock_manual', 'sold_to', '`sold_to` INT NULL'],
    ['produk_stock_manual', 'sold_at', '`sold_at` DATETIME NULL'],
    ['produk_stock_manual', 'created_at', '`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],

    ['product_credentials', 'product_id', '`product_id` INT NOT NULL'],
    ['product_credentials', 'email', '`email` VARCHAR(180) NOT NULL DEFAULT ""'],
    ['product_credentials', 'password', '`password` VARCHAR(255) NOT NULL DEFAULT ""'],
    ['product_credentials', 'status', "`status` ENUM('available', 'sold') NOT NULL DEFAULT 'available'"],
    ['product_credentials', 'sold_at', '`sold_at` DATETIME NULL'],
    ['product_credentials', 'buyer_id', '`buyer_id` INT NULL'],
    ['product_credentials', 'invoice', '`invoice` VARCHAR(120) NULL'],
    ['product_credentials', 'created_at', '`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],

    ['manual_product_accounts', 'product_id', '`product_id` INT NOT NULL'],
    ['manual_product_accounts', 'email', '`email` VARCHAR(180) NOT NULL DEFAULT ""'],
    ['manual_product_accounts', 'password', '`password` VARCHAR(255) NOT NULL DEFAULT ""'],
    ['manual_product_accounts', 'status', "`status` ENUM('available', 'reserved', 'sold') NOT NULL DEFAULT 'available'"],
    ['manual_product_accounts', 'reserved_by', '`reserved_by` INT NULL'],
    ['manual_product_accounts', 'reserved_at', '`reserved_at` DATETIME NULL'],
    ['manual_product_accounts', 'sold_at', '`sold_at` DATETIME NULL'],
    ['manual_product_accounts', 'created_at', '`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],
    ['manual_product_accounts', 'updated_at', '`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'],

    ['transactions', 'user_id', '`user_id` INT NOT NULL'],
    ['transactions', 'transaction_type', '`transaction_type` VARCHAR(40) NOT NULL DEFAULT "order"'],
    ['transactions', 'idempotency_key', '`idempotency_key` VARCHAR(120) NULL UNIQUE'],
    ['transactions', 'amount', '`amount` BIGINT NOT NULL DEFAULT 0'],
    ['transactions', 'total_price', '`total_price` BIGINT NOT NULL DEFAULT 0'],
    ['transactions', 'profit', '`profit` BIGINT NOT NULL DEFAULT 0'],
    ['transactions', 'invoice', '`invoice` VARCHAR(80) NOT NULL UNIQUE'],
    ['transactions', 'status', "`status` ENUM('pending', 'processing', 'success', 'failed', 'refunded') NOT NULL DEFAULT 'pending'"],
    ['transactions', 'created_at', '`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],

    ['deposits', 'user_id', '`user_id` INT NOT NULL'],
    ['deposits', 'invoice', '`invoice` VARCHAR(80) NOT NULL UNIQUE'],
    ['deposits', 'amount', '`amount` BIGINT NOT NULL DEFAULT 0'],
    ['deposits', 'total_bayar', '`total_bayar` BIGINT NOT NULL DEFAULT 0'],
    ['deposits', 'qr_image', '`qr_image` LONGTEXT NULL'],
    ['deposits', 'qr_raw', '`qr_raw` LONGTEXT NULL'],
    ['deposits', 'qr_data', '`qr_data` LONGTEXT NULL'],
    ['deposits', 'status', "`status` ENUM('pending', 'success', 'failed', 'expired', 'canceled') NOT NULL DEFAULT 'pending'"],
    ['deposits', 'expired_at', '`expired_at` DATETIME NULL'],
    ['deposits', 'created_at', '`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],

    ['payments', 'user_id', '`user_id` INT NOT NULL'],
    ['payments', 'invoice', '`invoice` VARCHAR(80) NOT NULL UNIQUE'],
    ['payments', 'amount', '`amount` BIGINT NOT NULL DEFAULT 0'],
    ['payments', 'total_bayar', '`total_bayar` BIGINT NOT NULL DEFAULT 0'],
    ['payments', 'payment_type', '`payment_type` VARCHAR(40) NOT NULL DEFAULT "direct_order"'],
    ['payments', 'status', "`status` ENUM('pending', 'success', 'failed', 'expired', 'canceled') NOT NULL DEFAULT 'pending'"],
    ['payments', 'qr_image', '`qr_image` LONGTEXT NULL'],
    ['payments', 'qr_raw', '`qr_raw` LONGTEXT NULL'],
    ['payments', 'created_at', '`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],
    ['payments', 'product_id', '`product_id` INT NULL'],
    ['payments', 'qty', '`qty` INT NOT NULL DEFAULT 1'],
    ['payments', 'target_whatsapp', '`target_whatsapp` VARCHAR(30) NULL'],
    ['payments', 'order_invoice', '`order_invoice` VARCHAR(80) NULL'],
    ['payments', 'reserved_manual_account_id', '`reserved_manual_account_id` INT NULL'],
    ['payments', 'raw_response', '`raw_response` JSON NULL'],
    ['payments', 'status_response', '`status_response` JSON NULL'],
    ['payments', 'processed_at', '`processed_at` DATETIME NULL'],

    ['orders', 'user_id', '`user_id` INT NOT NULL'],
    ['orders', 'role', "`role` ENUM('admin', 'reseller', 'member') NOT NULL DEFAULT 'member'"],
    ['orders', 'invoice', '`invoice` VARCHAR(80) NOT NULL UNIQUE'],
    ['orders', 'product_name', '`product_name` VARCHAR(150) NULL'],
    ['orders', 'email_account', '`email_account` VARCHAR(180) NULL'],
    ['orders', 'password_account', '`password_account` VARCHAR(255) NULL'],
    ['orders', 'payment_status', "`payment_status` ENUM('pending', 'success', 'failed', 'refunded', 'canceled') NOT NULL DEFAULT 'pending'"],
    ['orders', 'order_status', "`order_status` ENUM('pending', 'processing', 'success', 'failed') NOT NULL DEFAULT 'pending'"],
    ['orders', 'target_whatsapp', '`target_whatsapp` VARCHAR(30) NULL'],
    ['orders', 'delivery_status', "`delivery_status` ENUM('pending', 'sent', 'failed', 'manual_pending') NOT NULL DEFAULT 'pending'"],
    ['orders', 'delivery_time', '`delivery_time` DATETIME NULL'],
    ['orders', 'raw_response', '`raw_response` JSON NULL'],
    ['orders', 'created_at', '`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],
    ['orders', 'payment_invoice', '`payment_invoice` VARCHAR(80) NULL'],
    ['orders', 'product_id', '`product_id` INT NULL'],
    ['orders', 'total_price', '`total_price` BIGINT NOT NULL DEFAULT 0'],

    ['saldo_mutations', 'user_id', '`user_id` INT NOT NULL'],
    ['saldo_mutations', 'mutation_type', "`mutation_type` ENUM('deposit', 'order', 'withdraw', 'adjustment', 'refund') NOT NULL"],
    ['saldo_mutations', 'balance_before', '`balance_before` BIGINT NOT NULL DEFAULT 0'],
    ['saldo_mutations', 'balance_after', '`balance_after` BIGINT NOT NULL DEFAULT 0'],
    ['saldo_mutations', 'amount', '`amount` BIGINT NOT NULL DEFAULT 0'],
    ['saldo_mutations', 'created_at', '`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],

    ['settings', 'setting_key', '`setting_key` VARCHAR(80) NULL'],
    ['settings', 'key', '`key` VARCHAR(80) NULL'],
    ['settings', 'setting_value', '`setting_value` JSON NULL'],
    ['settings', 'value', '`value` JSON NULL'],

    ['activity_logs', 'actor_id', '`actor_id` INT NULL'],
    ['activity_logs', 'user_id', '`user_id` INT NULL'],
    ['activity_logs', 'scope', '`scope` VARCHAR(40) NOT NULL DEFAULT "SYSTEM"'],
    ['activity_logs', 'message', '`message` VARCHAR(255) NOT NULL DEFAULT ""'],
    ['activity_logs', 'activity', '`activity` VARCHAR(255) NULL'],
    ['activity_logs', 'ip_address', '`ip_address` VARCHAR(64) NULL'],
    ['activity_logs', 'metadata', '`metadata` JSON NULL'],
    ['activity_logs', 'created_at', '`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],

    ['notifications', 'type', '`type` VARCHAR(40) NOT NULL DEFAULT "broadcast"'],
    ['notifications', 'is_active', '`is_active` TINYINT(1) NOT NULL DEFAULT 1'],
    ['notifications', 'is_pinned', '`is_pinned` TINYINT(1) NOT NULL DEFAULT 0'],
    ['notifications', 'created_by', '`created_by` INT NULL'],
    ['notifications', 'created_at', '`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],
  ];

  console.log('[SYSTEM] Checking database schema...');
  let repaired = false;
  for (const [table, column, definition] of requiredColumns) {
    const exists = await columnExists(connection, table, column);
    if (!exists) {
      console.log(`[SYSTEM] Missing column detected: ${column}`);
      await ensureColumn(connection, table, column, definition);
      repaired = true;
    }
  }

  await connection.query('UPDATE users SET password = password_hash WHERE password IS NULL AND password_hash IS NOT NULL');
  await connection.query('UPDATE users SET saldo_utama = saldo WHERE saldo_utama = 0 AND saldo > 0');
  await connection.query('UPDATE users SET saldo = saldo_utama WHERE saldo <> saldo_utama');
  await connection.query('UPDATE users SET markup_percent = markup_custom WHERE markup_percent = 0 AND markup_custom > 0');
  await connection.query('UPDATE products SET base_price = price_base WHERE base_price = 0 AND price_base > 0');
  await connection.query('UPDATE products SET slug = code WHERE (slug IS NULL OR slug = "") AND code IS NOT NULL');
  await connection.query(
    `UPDATE products
     SET product_source = CASE WHEN product_type = 'manual' THEN 'manual' ELSE 'provider' END
     WHERE product_source IS NULL OR product_source = ''`,
  );
  await connection.query(
    `UPDATE products
     SET stock_mode = CASE
       WHEN product_source = 'manual' THEN 'manual'
       WHEN product_source = 'hybrid' THEN 'combined'
       ELSE 'provider'
     END
     WHERE stock_mode IS NULL OR stock_mode = ''`,
  );
  await connection.query(`UPDATE products SET provider_stock = stock WHERE provider_stock = 0 AND product_source IN ('provider', 'hybrid') AND stock > 0`);
  try {
    await connection.query('UPDATE produk_stock_manual SET product_id = produk_id WHERE product_id IS NULL AND produk_id IS NOT NULL');
  } catch {
    // Older installs may already be on product_id-only schema.
  }
  try {
    await connection.query(
      `INSERT INTO product_credentials (product_id, email, password, status, sold_at, buyer_id, invoice, created_at)
       SELECT COALESCE(product_id, produk_id), email, password, status, sold_at, sold_to, NULL, created_at
       FROM produk_stock_manual legacy
       WHERE COALESCE(product_id, produk_id) IS NOT NULL
         AND NOT EXISTS (
          SELECT 1 FROM product_credentials pc
          WHERE pc.product_id = COALESCE(legacy.product_id, legacy.produk_id)
            AND pc.email = legacy.email
            AND pc.password = legacy.password
            AND pc.created_at = legacy.created_at
         )`,
    );
  } catch {
    // Legacy installs may not have both credential tables during first bootstrap.
  }
  try {
    await connection.query(
      `INSERT INTO manual_product_accounts (product_id, email, password, status, sold_at, created_at)
       SELECT product_id, email, password,
        CASE WHEN status = 'sold' THEN 'sold' WHEN status = 'reserved' THEN 'reserved' ELSE 'available' END,
        sold_at,
        created_at
       FROM product_credentials source
       WHERE NOT EXISTS (
        SELECT 1 FROM manual_product_accounts target
        WHERE target.product_id = source.product_id
          AND target.email = source.email
          AND target.password = source.password
          AND target.created_at = source.created_at
       )`,
    );
  } catch {
    // Compatibility mirror is best-effort; product_credentials remains authoritative.
  }
  await connection.query(
    `UPDATE products p
     SET manual_stock = (
       SELECT COUNT(*) FROM manual_product_accounts c
       WHERE c.product_id = p.id AND c.status = 'available'
     )
     WHERE p.product_source IN ('provider', 'manual', 'hybrid')`,
  );
  await connection.query(
    `UPDATE products
     SET stock = CASE
       WHEN stock_mode = 'manual' THEN manual_stock
       WHEN stock_mode = 'combined' THEN provider_stock + manual_stock
       ELSE provider_stock + manual_stock
     END`,
  );
  await connection.query('UPDATE deposits SET qr_raw = qr_data WHERE qr_raw IS NULL AND qr_data IS NOT NULL');
  await connection.query('UPDATE settings SET `key` = setting_key WHERE `key` IS NULL AND setting_key IS NOT NULL');
  await connection.query('UPDATE settings SET value = setting_value WHERE value IS NULL AND setting_value IS NOT NULL');
  await connection.query('UPDATE activity_logs SET user_id = actor_id WHERE user_id IS NULL AND actor_id IS NOT NULL');
  await connection.query('UPDATE activity_logs SET activity = message WHERE activity IS NULL AND message IS NOT NULL');
  await connection.query(
    `UPDATE transactions
     SET transaction_type = 'payment'
     WHERE LOWER(COALESCE(product_name, '')) = 'qris payment'
        OR LOWER(COALESCE(channel, '')) IN ('qris', 'payment')`,
  );
  await connection.query(
    `UPDATE transactions
     SET transaction_type = 'deposit'
     WHERE LOWER(COALESCE(product_name, '')) IN ('deposit saldo', 'topup saldo', 'top up saldo')
        OR LOWER(COALESCE(channel, '')) = 'deposit'`,
  );
  await connection.query(
    `INSERT INTO saldo_logs
      (user_id, type, amount, balance_before, balance_after, reference, notes, created_at)
     SELECT
      t.user_id,
      'credit',
      COALESCE(NULLIF(t.amount, 0), NULLIF(t.total_price, 0), 0),
      GREATEST(COALESCE(u.saldo_utama, 0) - COALESCE(NULLIF(t.amount, 0), NULLIF(t.total_price, 0), 0), 0),
      COALESCE(u.saldo_utama, 0),
      t.invoice,
      'Legacy QRIS/deposit migrated to mutasi saldo',
      t.created_at
     FROM transactions t
     JOIN users u ON u.id = t.user_id
     WHERE t.status = 'success'
       AND (
        LOWER(COALESCE(t.product_name, '')) IN ('qris payment', 'deposit saldo', 'topup saldo', 'top up saldo')
        OR LOWER(COALESCE(t.channel, '')) IN ('qris', 'payment', 'deposit')
        OR COALESCE(t.transaction_type, '') IN ('payment', 'deposit')
       )
       AND COALESCE(NULLIF(t.amount, 0), NULLIF(t.total_price, 0), 0) > 0
       AND NOT EXISTS (
        SELECT 1 FROM saldo_logs s
        WHERE s.user_id = t.user_id
          AND s.reference = t.invoice
          AND s.type = 'credit'
       )`,
  );
  await connection.query(
    `UPDATE saldo_logs s
     JOIN transactions t ON t.invoice = s.reference
     JOIN users u ON u.id = s.user_id
     SET
      s.balance_before = COALESCE(u.saldo_utama, 0),
      s.balance_after = COALESCE(u.saldo_utama, 0) + COALESCE(NULLIF(t.amount, 0), NULLIF(t.total_price, 0), 0)
     WHERE s.type = 'credit'
       AND s.notes = 'Legacy QRIS/deposit migrated to mutasi saldo'
       AND (
        LOWER(COALESCE(t.product_name, '')) = 'qris payment'
        OR LOWER(COALESCE(t.channel, '')) IN ('qris', 'payment')
       OR COALESCE(t.transaction_type, '') = 'payment'
       )`,
  );
  await connection.query(
    `UPDATE saldo_mutations s
     JOIN transactions t ON t.invoice = s.reference
     JOIN users u ON u.id = s.user_id
     SET
      s.balance_before = COALESCE(u.saldo_utama, 0),
      s.balance_after = COALESCE(u.saldo_utama, 0) + COALESCE(NULLIF(t.amount, 0), NULLIF(t.total_price, 0), 0)
     WHERE s.mutation_type = 'deposit'
       AND (
        LOWER(COALESCE(t.product_name, '')) = 'qris payment'
        OR LOWER(COALESCE(t.channel, '')) IN ('qris', 'payment')
        OR COALESCE(t.transaction_type, '') = 'payment'
       )`,
  );
  await connection.query(
    `INSERT INTO saldo_logs
      (user_id, type, amount, balance_before, balance_after, reference, notes, created_at)
     SELECT
      t.user_id,
      'debit',
      COALESCE(NULLIF(t.amount, 0), NULLIF(t.total_price, 0), 0),
      COALESCE(u.saldo_utama, 0) + COALESCE(NULLIF(t.amount, 0), NULLIF(t.total_price, 0), 0),
      COALESCE(u.saldo_utama, 0),
      t.invoice,
      'Legacy order migrated to mutasi saldo',
      t.created_at
     FROM transactions t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN payments p ON p.order_invoice = t.invoice
     WHERE t.status IN ('processing', 'success')
       AND COALESCE(t.transaction_type, 'order') = 'order'
       AND t.product_id IS NOT NULL
       AND p.invoice IS NOT NULL
       AND COALESCE(NULLIF(t.amount, 0), NULLIF(t.total_price, 0), 0) > 0
       AND NOT EXISTS (
        SELECT 1 FROM saldo_logs s
        WHERE s.user_id = t.user_id
          AND s.reference = t.invoice
          AND s.type = 'debit'
       )`,
  );
  await connection.query(
    `INSERT INTO saldo_mutations
      (user_id, mutation_type, amount, balance_before, balance_after, reference, created_at)
     SELECT
      t.user_id,
      'order',
      COALESCE(NULLIF(t.amount, 0), NULLIF(t.total_price, 0), 0),
      COALESCE(u.saldo_utama, 0) + COALESCE(NULLIF(t.amount, 0), NULLIF(t.total_price, 0), 0),
      COALESCE(u.saldo_utama, 0),
      t.invoice,
      t.created_at
     FROM transactions t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN payments p ON p.order_invoice = t.invoice
     WHERE t.status IN ('processing', 'success')
       AND COALESCE(t.transaction_type, 'order') = 'order'
       AND t.product_id IS NOT NULL
       AND p.invoice IS NOT NULL
       AND COALESCE(NULLIF(t.amount, 0), NULLIF(t.total_price, 0), 0) > 0
       AND NOT EXISTS (
        SELECT 1 FROM saldo_mutations s
        WHERE s.user_id = t.user_id
          AND s.reference = t.invoice
          AND s.mutation_type = 'order'
       )`,
  );
  await connection.query(
    `INSERT INTO saldo_mutations
      (user_id, mutation_type, amount, balance_before, balance_after, reference, created_at)
     SELECT
      t.user_id,
      CASE
        WHEN COALESCE(t.transaction_type, '') = 'deposit' OR LOWER(COALESCE(t.channel, '')) = 'deposit' THEN 'deposit'
        ELSE 'deposit'
      END,
      COALESCE(NULLIF(t.amount, 0), NULLIF(t.total_price, 0), 0),
      GREATEST(COALESCE(u.saldo_utama, 0) - COALESCE(NULLIF(t.amount, 0), NULLIF(t.total_price, 0), 0), 0),
      COALESCE(u.saldo_utama, 0),
      t.invoice,
      t.created_at
     FROM transactions t
     JOIN users u ON u.id = t.user_id
     WHERE t.status = 'success'
       AND (
        LOWER(COALESCE(t.product_name, '')) IN ('qris payment', 'deposit saldo', 'topup saldo', 'top up saldo')
        OR LOWER(COALESCE(t.channel, '')) IN ('qris', 'payment', 'deposit')
        OR COALESCE(t.transaction_type, '') IN ('payment', 'deposit')
       )
       AND COALESCE(NULLIF(t.amount, 0), NULLIF(t.total_price, 0), 0) > 0
       AND NOT EXISTS (
        SELECT 1 FROM saldo_mutations s
        WHERE s.user_id = t.user_id
          AND s.reference = t.invoice
          AND s.mutation_type = 'deposit'
       )`,
  );

  if (repaired) {
    console.log('[SYSTEM] Auto repaired schema');
  }
  console.log('[SYSTEM] Database synchronized');
}

async function seedDefaults(connection) {
  if (!env.ADMIN_USERNAME || (!env.ADMIN_PASSWORD_HASH && !env.ADMIN_PASSWORD)) {
    return;
  }

  const passwordHash = env.ADMIN_PASSWORD_HASH || hashPassword(env.ADMIN_PASSWORD);
  const [adminRows] = await connection.query('SELECT id FROM users WHERE username = ? LIMIT 1', [env.ADMIN_USERNAME]);
  const existingAdmin = adminRows[0];

  if (existingAdmin) {
    await connection.query(
      `UPDATE users
       SET password_hash = ?, role = 'admin', status = 'active', fullName = ?, notes = ?
       WHERE id = ?`,
      [passwordHash, env.ADMIN_USERNAME, 'primary-admin-bootstrap', existingAdmin.id],
    );
    return;
  }

  await connection.query(
    `INSERT INTO users
      (username, email, password_hash, api_key, role, status, fullName, notes)
     VALUES (?, ?, ?, ?, 'admin', 'active', ?, ?)`,
    [
      env.ADMIN_USERNAME,
      null,
      passwordHash,
      `api_${env.ADMIN_USERNAME}_${crypto.randomBytes(18).toString('hex')}`,
      env.ADMIN_USERNAME,
      'primary-admin-bootstrap',
    ],
  );
}

export async function ensureInitialized() {
  if (!initPromise) {
    initPromise = (async () => {
      await ensureDatabaseExists();
      const connection = await pool.getConnection();
      try {
        await ensureSchema(connection);
        await seedDefaults(connection);
      } finally {
        connection.release();
      }
    })();
  }

  return initPromise;
}

export { pool };
