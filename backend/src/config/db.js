import mysql from 'mysql2/promise';
import env from './env.js';
import { hashPassword } from '../utils/password.js';
import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';

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
    logger('BACKEND', { event: 'database-create-skipped', reason: 'using configured Railway/MySQL database' });
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
      saldo BIGINT NOT NULL DEFAULT 0,
      markup_custom INT NOT NULL DEFAULT 0,
      markup_percent INT NOT NULL DEFAULT 0,
      reseller_margin_percent INT NOT NULL DEFAULT 0,
      theme ENUM('dark', 'light') NOT NULL DEFAULT 'dark',
      fullName VARCHAR(150) NOT NULL DEFAULT '',
      orders INT NOT NULL DEFAULT 0,
      deposits INT NOT NULL DEFAULT 0,
      notes TEXT NULL,
      role ENUM('admin', 'reseller', 'member') NOT NULL DEFAULT 'member',
      status ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
      last_login_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT chk_users_saldo_non_negative CHECK (saldo >= 0)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      premku_id INT NULL,
      name VARCHAR(150) NOT NULL,
      code VARCHAR(80) NOT NULL UNIQUE,
      note TEXT NULL,
      tag VARCHAR(80) NULL,
      image TEXT NULL,
      price_base BIGINT NOT NULL DEFAULT 0,
      base_price BIGINT NOT NULL DEFAULT 0,
      price_sell BIGINT NOT NULL DEFAULT 0,
      admin_margin BIGINT NOT NULL DEFAULT 0,
      stock INT NOT NULL DEFAULT 0,
      status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_products_status (status),
      INDEX idx_products_premku_id (premku_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice VARCHAR(80) NOT NULL UNIQUE,
      ref_id VARCHAR(100) NULL UNIQUE,
      user_id INT NOT NULL,
      product_id INT NULL,
      product_name VARCHAR(150) NULL,
      transaction_type VARCHAR(40) NOT NULL DEFAULT 'order',
      amount BIGINT NOT NULL DEFAULT 0,
      qty INT NOT NULL DEFAULT 1,
      price_base BIGINT NOT NULL DEFAULT 0,
      price_sell BIGINT NOT NULL DEFAULT 0,
      total_price BIGINT NOT NULL DEFAULT 0,
      profit BIGINT NOT NULL DEFAULT 0,
      reseller_profit BIGINT NOT NULL DEFAULT 0,
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
      source VARCHAR(40) NOT NULL DEFAULT 'dashboard',
      status ENUM('pending', 'success', 'failed', 'expired', 'canceled') NOT NULL DEFAULT 'pending',
      qr_image LONGTEXT NULL,
      qr_raw LONGTEXT NULL,
      product_id INT NULL,
      qty INT NOT NULL DEFAULT 1,
      target_whatsapp VARCHAR(30) NULL,
      buyer_whatsapp VARCHAR(30) NULL,
      modal_price BIGINT NOT NULL DEFAULT 0,
      sell_price BIGINT NOT NULL DEFAULT 0,
      reseller_profit BIGINT NOT NULL DEFAULT 0,
      order_invoice VARCHAR(80) NULL,
      raw_response JSON NULL,
      status_response JSON NULL,
      processed_at DATETIME NULL,
      expired_at DATETIME NULL,
      canceled_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      INDEX idx_payments_user_id (user_id),
      INDEX idx_payments_status (status),
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
      provider_invoice VARCHAR(100) NULL,
      provider_status VARCHAR(40) NOT NULL DEFAULT 'pending',
      order_status ENUM('pending', 'processing', 'success', 'failed') NOT NULL DEFAULT 'pending',
      processing_started_at DATETIME NULL,
      success_at DATETIME NULL,
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
    `CREATE TABLE IF NOT EXISTS finance_daily_summaries (
      summary_date DATE PRIMARY KEY,
      total_transactions BIGINT NOT NULL DEFAULT 0,
      total_revenue BIGINT NOT NULL DEFAULT 0,
      system_profit BIGINT NOT NULL DEFAULT 0,
      reseller_profit BIGINT NOT NULL DEFAULT 0,
      total_deposit_amount BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS websocket_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      channel VARCHAR(80) NOT NULL DEFAULT 'system',
      event_type VARCHAR(80) NOT NULL DEFAULT 'message',
      payload JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_websocket_events_created_at (created_at),
      INDEX idx_websocket_events_channel (channel)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS temp_notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      type VARCHAR(80) NOT NULL DEFAULT 'temp',
      payload JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_temp_notifications_created_at (created_at),
      INDEX idx_temp_notifications_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS realtime_cache (
      cache_key VARCHAR(160) PRIMARY KEY,
      payload JSON NULL,
      expires_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_realtime_cache_expires_at (expires_at),
      INDEX idx_realtime_cache_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS polling_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      scope VARCHAR(80) NOT NULL DEFAULT 'payment',
      reference VARCHAR(120) NULL,
      status VARCHAR(40) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_polling_logs_created_at (created_at),
      INDEX idx_polling_logs_reference (reference)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ];
}

async function ensureSchema(connection) {
  for (const statement of ensureTableStatements()) {
    await connection.query(statement);
  }

  await ensureCanonicalSchema(connection);

  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS fullName VARCHAR(150) NOT NULL DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS orders INT NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS deposits INT NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS notes TEXT NULL`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS markup_percent INT NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_margin_percent INT NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS theme ENUM('dark', 'light') NOT NULL DEFAULT 'dark'`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS note TEXT NULL`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS tag VARCHAR(80) NULL`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS image TEXT NULL`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS admin_margin BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS base_price BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_data JSON NULL`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(40) NOT NULL DEFAULT 'order'`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS amount BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reseller_profit BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_order_response JSON NULL`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_status_response JSON NULL`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS refund_at DATETIME NULL`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS processed_at DATETIME NULL`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS product_image TEXT NULL`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS description TEXT NULL`,
    `ALTER TABLE transactions ADD INDEX idx_transactions_user_type_created (user_id, transaction_type, created_at)`,
    `ALTER TABLE transactions ADD INDEX idx_transactions_type_status_created (transaction_type, status, created_at)`,
    `ALTER TABLE deposits ADD COLUMN IF NOT EXISTS external_response JSON NULL`,
    `ALTER TABLE deposits ADD COLUMN IF NOT EXISTS external_status_response JSON NULL`,
    `ALTER TABLE deposits ADD COLUMN IF NOT EXISTS processed_at DATETIME NULL`,
    `ALTER TABLE deposits ADD COLUMN IF NOT EXISTS qr_image LONGTEXT NULL`,
    `ALTER TABLE deposits ADD COLUMN IF NOT EXISTS expired_at DATETIME NULL`,
    `ALTER TABLE deposits ADD COLUMN IF NOT EXISTS canceled_at DATETIME NULL`,
    `ALTER TABLE deposits MODIFY COLUMN status ENUM('pending', 'success', 'failed', 'expired', 'canceled') NOT NULL DEFAULT 'pending'`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS product_id INT NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS total_bayar BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS source VARCHAR(40) NOT NULL DEFAULT 'dashboard'`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS target_whatsapp VARCHAR(30) NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS buyer_whatsapp VARCHAR(30) NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS modal_price BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS sell_price BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS reseller_profit BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS qty INT NOT NULL DEFAULT 1`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS qr_raw LONGTEXT NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS order_invoice VARCHAR(80) NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS raw_response JSON NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS status_response JSON NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS processed_at DATETIME NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS expired_at DATETIME NULL`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS canceled_at DATETIME NULL`,
    `ALTER TABLE payments ADD INDEX idx_payments_created_at (created_at)`,
    `ALTER TABLE payments ADD INDEX idx_payments_expired_at (expired_at)`,
    `ALTER TABLE payments ADD INDEX idx_payments_status_expired (status, expired_at)`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_invoice VARCHAR(80) NULL`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_id INT NULL`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_invoice VARCHAR(100) NULL`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_status VARCHAR(40) NOT NULL DEFAULT 'pending'`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS processing_started_at DATETIME NULL`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS success_at DATETIME NULL`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS target_whatsapp VARCHAR(30) NULL`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_status ENUM('pending', 'sent', 'failed', 'manual_pending') NOT NULL DEFAULT 'pending'`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_time DATETIME NULL`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_price BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE orders ADD INDEX idx_orders_created_at (created_at)`,
    `ALTER TABLE deposits ADD INDEX idx_deposits_created_at (created_at)`,
    `ALTER TABLE deposits ADD INDEX idx_deposits_expired_at (expired_at)`,
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
    `ALTER TABLE finance_daily_summaries ADD COLUMN IF NOT EXISTS reseller_profit BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE finance_daily_summaries ADD COLUMN IF NOT EXISTS total_deposit_amount BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE websocket_events ADD COLUMN IF NOT EXISTS event_type VARCHAR(80) NOT NULL DEFAULT 'message'`,
    `ALTER TABLE temp_notifications ADD COLUMN IF NOT EXISTS type VARCHAR(80) NOT NULL DEFAULT 'temp'`,
    `ALTER TABLE realtime_cache ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    `UPDATE users SET markup_percent = markup_custom WHERE markup_percent = 0 AND markup_custom > 0`,
    `UPDATE users SET reseller_margin_percent = markup_percent WHERE reseller_margin_percent = 0 AND markup_percent > 0`,
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
    ['users', 'saldo', '`saldo` BIGINT NOT NULL DEFAULT 0'],
    ['users', 'markup_custom', '`markup_custom` INT NOT NULL DEFAULT 0'],
    ['users', 'markup_percent', '`markup_percent` INT NOT NULL DEFAULT 0'],
    ['users', 'reseller_margin_percent', '`reseller_margin_percent` INT NOT NULL DEFAULT 0'],
    ['users', 'theme', "`theme` ENUM('dark', 'light') NOT NULL DEFAULT 'dark'"],
    ['users', 'created_at', '`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],

    ['products', 'name', '`name` VARCHAR(150) NOT NULL DEFAULT ""'],
    ['products', 'description', '`description` TEXT NULL'],
    ['products', 'base_price', '`base_price` BIGINT NOT NULL DEFAULT 0'],
    ['products', 'price_base', '`price_base` BIGINT NOT NULL DEFAULT 0'],
    ['products', 'admin_margin', '`admin_margin` BIGINT NOT NULL DEFAULT 0'],
    ['products', 'stock', '`stock` INT NOT NULL DEFAULT 0'],
    ['products', 'image_url', '`image_url` TEXT NULL'],
    ['products', 'image', '`image` TEXT NULL'],
    ['products', 'status', "`status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active'"],

    ['transactions', 'user_id', '`user_id` INT NOT NULL'],
    ['transactions', 'transaction_type', '`transaction_type` VARCHAR(40) NOT NULL DEFAULT "order"'],
    ['transactions', 'amount', '`amount` BIGINT NOT NULL DEFAULT 0'],
    ['transactions', 'total_price', '`total_price` BIGINT NOT NULL DEFAULT 0'],
    ['transactions', 'profit', '`profit` BIGINT NOT NULL DEFAULT 0'],
    ['transactions', 'reseller_profit', '`reseller_profit` BIGINT NOT NULL DEFAULT 0'],
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
    ['deposits', 'canceled_at', '`canceled_at` DATETIME NULL'],
    ['deposits', 'created_at', '`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],

    ['payments', 'user_id', '`user_id` INT NOT NULL'],
    ['payments', 'invoice', '`invoice` VARCHAR(80) NOT NULL UNIQUE'],
    ['payments', 'amount', '`amount` BIGINT NOT NULL DEFAULT 0'],
    ['payments', 'total_bayar', '`total_bayar` BIGINT NOT NULL DEFAULT 0'],
    ['payments', 'payment_type', '`payment_type` VARCHAR(40) NOT NULL DEFAULT "direct_order"'],
    ['payments', 'source', '`source` VARCHAR(40) NOT NULL DEFAULT "dashboard"'],
    ['payments', 'status', "`status` ENUM('pending', 'success', 'failed', 'expired', 'canceled') NOT NULL DEFAULT 'pending'"],
    ['payments', 'qr_image', '`qr_image` LONGTEXT NULL'],
    ['payments', 'qr_raw', '`qr_raw` LONGTEXT NULL'],
    ['payments', 'created_at', '`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],
    ['payments', 'product_id', '`product_id` INT NULL'],
    ['payments', 'qty', '`qty` INT NOT NULL DEFAULT 1'],
    ['payments', 'target_whatsapp', '`target_whatsapp` VARCHAR(30) NULL'],
    ['payments', 'buyer_whatsapp', '`buyer_whatsapp` VARCHAR(30) NULL'],
    ['payments', 'modal_price', '`modal_price` BIGINT NOT NULL DEFAULT 0'],
    ['payments', 'sell_price', '`sell_price` BIGINT NOT NULL DEFAULT 0'],
    ['payments', 'reseller_profit', '`reseller_profit` BIGINT NOT NULL DEFAULT 0'],
    ['payments', 'order_invoice', '`order_invoice` VARCHAR(80) NULL'],
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
    ['orders', 'provider_invoice', '`provider_invoice` VARCHAR(100) NULL'],
    ['orders', 'provider_status', '`provider_status` VARCHAR(40) NOT NULL DEFAULT "pending"'],
    ['orders', 'order_status', "`order_status` ENUM('pending', 'processing', 'success', 'failed') NOT NULL DEFAULT 'pending'"],
    ['orders', 'processing_started_at', '`processing_started_at` DATETIME NULL'],
    ['orders', 'success_at', '`success_at` DATETIME NULL'],
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

  logger('BACKEND', { event: 'schema-check' });
  let repaired = false;
  for (const [table, column, definition] of requiredColumns) {
    const exists = await columnExists(connection, table, column);
    if (!exists) {
      logger('BACKEND', { event: 'schema-column-missing', table, column });
      await ensureColumn(connection, table, column, definition);
      repaired = true;
    }
  }

  await connection.query('UPDATE users SET password = password_hash WHERE password IS NULL AND password_hash IS NOT NULL');
  await connection.query('UPDATE users SET markup_percent = markup_custom WHERE markup_percent = 0 AND markup_custom > 0');
  await connection.query('UPDATE users SET reseller_margin_percent = markup_percent WHERE reseller_margin_percent = 0 AND markup_percent > 0');
  await connection.query('UPDATE products SET base_price = price_base WHERE base_price = 0 AND price_base > 0');
  await connection.query('UPDATE deposits SET qr_raw = qr_data WHERE qr_raw IS NULL AND qr_data IS NOT NULL');
  await connection.query('UPDATE settings SET `key` = setting_key WHERE `key` IS NULL AND setting_key IS NOT NULL');
  await connection.query('UPDATE settings SET value = setting_value WHERE value IS NULL AND setting_value IS NOT NULL');
  await connection.query('UPDATE activity_logs SET user_id = actor_id WHERE user_id IS NULL AND actor_id IS NOT NULL');
  await connection.query('UPDATE activity_logs SET activity = message WHERE activity IS NULL AND message IS NOT NULL');

  if (repaired) {
    logger('BACKEND', { event: 'schema-auto-repaired' });
  }
  logger('BACKEND', { event: 'database-synchronized' });
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
