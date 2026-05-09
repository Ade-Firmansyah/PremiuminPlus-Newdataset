-- Premiumin Plus canonical MySQL schema reference.
-- Runtime source of truth remains backend/src/config/db.js because it auto-validates and repairs schema on startup.

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(120) NULL UNIQUE,
  phone VARCHAR(30) NULL,
  password_hash VARCHAR(255) NOT NULL,
  password VARCHAR(255) NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  premku_id INT NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(80) NOT NULL UNIQUE,
  note TEXT NULL,
  description TEXT NULL,
  tag VARCHAR(80) NULL,
  image TEXT NULL,
  image_url TEXT NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS transactions (
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
  INDEX idx_transactions_created_at (created_at),
  INDEX idx_transactions_user_type_created (user_id, transaction_type, created_at),
  INDEX idx_transactions_type_status_created (transaction_type, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS deposits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  invoice VARCHAR(80) NOT NULL UNIQUE,
  amount BIGINT NOT NULL,
  total_bayar BIGINT NOT NULL,
  status ENUM('pending', 'success', 'failed', 'expired', 'canceled') NOT NULL DEFAULT 'pending',
  qr_data TEXT NULL,
  qr_image LONGTEXT NULL,
  qr_raw LONGTEXT NULL,
  external_response JSON NULL,
  external_status_response JSON NULL,
  processed_at DATETIME NULL,
  expired_at DATETIME NULL,
  canceled_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_deposits_user_id (user_id),
  INDEX idx_deposits_status (status),
  INDEX idx_deposits_created_at (created_at),
  INDEX idx_deposits_expired_at (expired_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payments (
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
  INDEX idx_payments_order_invoice (order_invoice),
  INDEX idx_payments_created_at (created_at),
  INDEX idx_payments_expired_at (expired_at),
  INDEX idx_payments_status_expired (status, expired_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
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
  INDEX idx_orders_order_status (order_status),
  INDEX idx_orders_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS saldo_logs (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS saldo_mutations (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS withdraws (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(80) NOT NULL UNIQUE,
  `key` VARCHAR(80) NULL,
  setting_value JSON NOT NULL,
  value JSON NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS activity_logs (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS webhook_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source VARCHAR(80) NOT NULL DEFAULT 'premku',
  payload JSON NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'received',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_webhook_logs_source (source),
  INDEX idx_webhook_logs_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_daily_summaries (
  summary_date DATE PRIMARY KEY,
  total_transactions BIGINT NOT NULL DEFAULT 0,
  total_revenue BIGINT NOT NULL DEFAULT 0,
  system_profit BIGINT NOT NULL DEFAULT 0,
  reseller_profit BIGINT NOT NULL DEFAULT 0,
  total_deposit_amount BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS websocket_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  channel VARCHAR(80) NOT NULL DEFAULT 'system',
  event_type VARCHAR(80) NOT NULL DEFAULT 'message',
  payload JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_websocket_events_created_at (created_at),
  INDEX idx_websocket_events_channel (channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS temp_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  type VARCHAR(80) NOT NULL DEFAULT 'temp',
  payload JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_temp_notifications_created_at (created_at),
  INDEX idx_temp_notifications_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS realtime_cache (
  cache_key VARCHAR(160) PRIMARY KEY,
  payload JSON NULL,
  expires_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_realtime_cache_expires_at (expires_at),
  INDEX idx_realtime_cache_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS polling_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scope VARCHAR(80) NOT NULL DEFAULT 'payment',
  reference VARCHAR(120) NULL,
  status VARCHAR(40) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_polling_logs_created_at (created_at),
  INDEX idx_polling_logs_reference (reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
