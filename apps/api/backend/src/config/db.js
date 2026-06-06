import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { hashPassword, isHashedPassword } from '../utils/password.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../../../');
const SCHEMA_FILE = path.join(ROOT_DIR, 'database', 'schema.mysql.sql');

const PAYMENT_STATUSES = [
  'pending_payment',
  'payment_success',
  'payment_mismatch',
  'manual_required',
  'expired',
  'canceled',
  'failed',
  'provider_processing',
  'provider_success',
  'credential_delivery'
];

const TABLES = {
  users: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      username: "VARCHAR(80) NOT NULL DEFAULT ''",
      email: 'VARCHAR(180) NULL',
      phone: 'VARCHAR(32) NULL',
      password_hash: 'VARCHAR(255) NULL',
      password: 'VARCHAR(255) NULL',
      role: "ENUM('admin','reseller','member') NOT NULL DEFAULT 'member'",
      status: "VARCHAR(32) NOT NULL DEFAULT 'active'",
      saldo: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      locked_balance: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      bot_access_unlocked: 'TINYINT(1) NOT NULL DEFAULT 0',
      bot_disabled_reason: 'VARCHAR(255) NULL',
      bot_session_id: 'VARCHAR(120) NULL',
      bot_connected_number: 'VARCHAR(40) NULL',
      bot_last_active_at: 'TIMESTAMP NULL',
      bot_session_status: "ENUM('not_connected','connecting','connected','disconnected','logged_out') NOT NULL DEFAULT 'not_connected'",
      api_key: 'VARCHAR(128) NULL',
      reseller_request_status: "VARCHAR(32) NOT NULL DEFAULT 'none'",
      reseller_request_reason: 'TEXT NULL',
      reseller_request_whatsapp: 'VARCHAR(40) NULL',
      reseller_request_experience: 'TEXT NULL',
      reseller_request_rejected_reason: 'TEXT NULL',
      reseller_requested_at: 'TIMESTAMP NULL',
      reseller_reviewed_at: 'TIMESTAMP NULL',
      markup_custom: 'DECIMAL(8,2) NOT NULL DEFAULT 0.00',
      markup_percent: 'DECIMAL(8,2) NOT NULL DEFAULT 0.00',
      reseller_margin_percent: 'DECIMAL(8,2) NOT NULL DEFAULT 0.00',
      theme: "VARCHAR(16) NOT NULL DEFAULT 'dark'",
      fullName: 'VARCHAR(180) NULL',
      orders: 'INT UNSIGNED NOT NULL DEFAULT 0',
      deposits: 'INT UNSIGNED NOT NULL DEFAULT 0',
      notes: 'TEXT NULL',
      last_login_at: 'TIMESTAMP NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'uq_users_username', unique: true, columns: ['username'] },
      { name: 'uq_users_email', unique: true, columns: ['email'] },
      { name: 'uq_users_phone', unique: true, columns: ['phone'] },
      { name: 'uq_users_api_key', unique: true, columns: ['api_key'] },
      { name: 'uq_users_bot_session_id', unique: true, columns: ['bot_session_id'] },
      { name: 'idx_users_role', columns: ['role'] },
      { name: 'idx_users_bot_session_status', columns: ['bot_session_status'] }
    ]
  },
  products: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      premku_id: 'VARCHAR(80) NULL',
      provider_product_id: 'VARCHAR(80) NULL',
      code: "VARCHAR(80) NOT NULL DEFAULT ''",
      name: "VARCHAR(180) NOT NULL DEFAULT ''",
      description: 'TEXT NULL',
      note: 'TEXT NULL',
      category: 'VARCHAR(120) NULL',
      tag: 'VARCHAR(120) NULL',
      image: 'TEXT NULL',
      image_url: 'TEXT NULL',
      tutorial_url: 'TEXT NULL',
      stock: 'INT UNSIGNED NOT NULL DEFAULT 0',
      provider_stock_count: 'INT UNSIGNED NOT NULL DEFAULT 0',
      status: "VARCHAR(32) NOT NULL DEFAULT 'active'",
      product_source: "VARCHAR(32) NOT NULL DEFAULT 'provider'",
      is_manual: 'TINYINT(1) NOT NULL DEFAULT 0',
      manual_stock_count: 'INT UNSIGNED NOT NULL DEFAULT 0',
      base_price: 'DECIMAL(15,2) UNSIGNED NULL',
      admin_margin: 'DECIMAL(15,2) UNSIGNED NULL',
      member_markup: 'DECIMAL(15,2) UNSIGNED NULL',
      reseller_markup: 'DECIMAL(15,2) UNSIGNED NULL',
      member_price: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      reseller_price: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      discount_label_percent: 'DECIMAL(5,2) UNSIGNED NULL',
      raw_response: 'JSON NULL',
      synced_at: 'TIMESTAMP NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'uq_products_code', unique: true, columns: ['code'] },
      { name: 'idx_products_premku_id', columns: ['premku_id'] },
      { name: 'idx_products_provider_product_id', columns: ['provider_product_id'] },
      { name: 'idx_products_status', columns: ['status'] },
      { name: 'idx_products_product_source', columns: ['product_source'] }
    ]
  },
  product_stock_items: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      product_id: 'BIGINT UNSIGNED NOT NULL',
      email_account: 'VARCHAR(255) NULL',
      password_account: 'TEXT NULL',
      description: 'TEXT NULL',
      status: "ENUM('available','reserved','used','disabled') NOT NULL DEFAULT 'available'",
      reserved_by_order_invoice: 'VARCHAR(80) NULL',
      used_by_order_invoice: 'VARCHAR(80) NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      reserved_at: 'TIMESTAMP NULL',
      used_at: 'TIMESTAMP NULL'
    },
    indexes: [
      { name: 'idx_product_stock_items_product_id', columns: ['product_id'] },
      { name: 'idx_product_stock_items_status', columns: ['status'] },
      { name: 'idx_product_stock_items_reserved_by_order_invoice', columns: ['reserved_by_order_invoice'] },
      { name: 'idx_product_stock_items_used_by_order_invoice', columns: ['used_by_order_invoice'] }
    ],
    constraints: [
      'CONSTRAINT fk_product_stock_items_product_id FOREIGN KEY (product_id) REFERENCES products(id)'
    ]
  },
  reseller_bot_settings: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      user_id: 'BIGINT UNSIGNED NOT NULL',
      brand_name: "VARCHAR(120) NOT NULL DEFAULT 'PREMIUMIN PLUS BOT'",
      greeting_hooks: "VARCHAR(255) NOT NULL DEFAULT 'p,ping,halo,haloo,bro'",
      welcome_message: "TEXT NULL",
      admin_whatsapp: 'VARCHAR(40) NULL',
      operational_hours: "VARCHAR(120) NOT NULL DEFAULT '08.00 - 21.00 WIB'",
      closing_message: "TEXT NULL",
      catalog_template: "VARCHAR(32) NOT NULL DEFAULT 'template_1'",
      order_template: "VARCHAR(32) NOT NULL DEFAULT 'template_1'",
      terms_text: 'TEXT NULL',
      reseller_margin_type: "VARCHAR(16) NOT NULL DEFAULT 'percent'",
      reseller_margin_value: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 10.00',
      is_active: 'TINYINT(1) NOT NULL DEFAULT 1',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'uq_reseller_bot_settings_user_id', unique: true, columns: ['user_id'] },
      { name: 'idx_reseller_bot_settings_is_active', columns: ['is_active'] }
    ],
    constraints: [
      'CONSTRAINT fk_reseller_bot_settings_user_id FOREIGN KEY (user_id) REFERENCES users(id)'
    ]
  },
  transactions: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      invoice: "VARCHAR(80) NOT NULL DEFAULT ''",
      provider_invoice: 'VARCHAR(80) NULL',
      user_id: 'BIGINT UNSIGNED NOT NULL',
      transaction_type: "VARCHAR(40) NOT NULL DEFAULT 'unknown'",
      amount: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      direction: "VARCHAR(16) NOT NULL DEFAULT 'out'",
      ref_id: 'VARCHAR(120) NULL',
      product_id: 'BIGINT UNSIGNED NULL',
      product_name: 'VARCHAR(180) NULL',
      qty: 'INT UNSIGNED NOT NULL DEFAULT 1',
      price_base: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      price_sell: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      total_price: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      profit: 'DECIMAL(15,2) NOT NULL DEFAULT 0.00',
      reseller_profit: 'DECIMAL(15,2) NOT NULL DEFAULT 0.00',
      status: "VARCHAR(40) NOT NULL DEFAULT 'pending'",
      account_data: 'JSON NULL',
      accounts: 'JSON NULL',
      external_order_response: 'JSON NULL',
      external_status_response: 'JSON NULL',
      refund_at: 'TIMESTAMP NULL',
      processed_at: 'TIMESTAMP NULL',
      product_image: 'TEXT NULL',
      channel: "VARCHAR(40) NOT NULL DEFAULT 'website'",
      reference_table: 'VARCHAR(80) NULL',
      reference_id: 'VARCHAR(120) NULL',
      description: 'TEXT NULL',
      metadata: 'JSON NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'uq_transactions_invoice', unique: true, columns: ['invoice'] },
      { name: 'idx_transactions_user_id', columns: ['user_id'] },
      { name: 'idx_transactions_transaction_type', columns: ['transaction_type'] },
      { name: 'idx_transactions_created_at', columns: ['created_at'] }
    ],
    constraints: [
      'CONSTRAINT fk_transactions_user_id FOREIGN KEY (user_id) REFERENCES users(id)'
    ]
  },
  payments: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      invoice: "VARCHAR(80) NOT NULL DEFAULT ''",
      user_id: 'BIGINT UNSIGNED NOT NULL',
      product_id: 'BIGINT UNSIGNED NULL',
      amount: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      total_bayar: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      payment_type: "VARCHAR(40) NOT NULL DEFAULT 'order'",
      source: "VARCHAR(40) NOT NULL DEFAULT 'web'",
      status: "VARCHAR(40) NOT NULL DEFAULT 'pending'",
      qr_image: 'TEXT NULL',
      qr_raw: 'TEXT NULL',
      qty: 'INT UNSIGNED NOT NULL DEFAULT 1',
      buyer_whatsapp: 'VARCHAR(40) NULL',
      buyer_name: 'VARCHAR(120) NULL',
      modal_price: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      sell_price: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      reseller_profit: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      order_invoice: 'VARCHAR(80) NULL',
      raw_response: 'JSON NULL',
      status_response: 'JSON NULL',
      target_whatsapp: 'VARCHAR(40) NULL',
      processed_at: 'TIMESTAMP NULL',
      expired_at: 'TIMESTAMP NULL',
      canceled_at: 'TIMESTAMP NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'uq_payments_invoice', unique: true, columns: ['invoice'] },
      { name: 'idx_payments_provider_invoice', columns: ['provider_invoice'] },
      { name: 'idx_payments_user_id', columns: ['user_id'] },
      { name: 'idx_payments_status', columns: ['status'] },
      { name: 'idx_payments_expired_at', columns: ['expired_at'] },
      { name: 'idx_payments_product_id', columns: ['product_id'] }
    ],
    constraints: [
      'CONSTRAINT fk_payments_user_id FOREIGN KEY (user_id) REFERENCES users(id)',
      'CONSTRAINT fk_payments_product_id FOREIGN KEY (product_id) REFERENCES products(id)'
    ]
  },
  deposits: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      invoice: "VARCHAR(80) NOT NULL DEFAULT ''",
      provider_invoice: 'VARCHAR(80) NULL',
      user_id: 'BIGINT UNSIGNED NOT NULL',
      amount: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      total_bayar: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      payment_type: "VARCHAR(40) NOT NULL DEFAULT 'deposit'",
      status: "VARCHAR(40) NOT NULL DEFAULT 'pending'",
      qr_data: 'TEXT NULL',
      qr_image: 'TEXT NULL',
      qr_raw: 'TEXT NULL',
      external_response: 'JSON NULL',
      external_status_response: 'JSON NULL',
      processed_at: 'TIMESTAMP NULL',
      expired_at: 'TIMESTAMP NULL',
      canceled_at: 'TIMESTAMP NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'uq_deposits_invoice', unique: true, columns: ['invoice'] },
      { name: 'idx_deposits_provider_invoice', columns: ['provider_invoice'] },
      { name: 'idx_deposits_user_id', columns: ['user_id'] },
      { name: 'idx_deposits_status', columns: ['status'] },
      { name: 'idx_deposits_payment_type', columns: ['payment_type'] },
      { name: 'idx_deposits_expired_at', columns: ['expired_at'] }
    ],
    constraints: [
      'CONSTRAINT fk_deposits_user_id FOREIGN KEY (user_id) REFERENCES users(id)'
    ]
  },
  orders: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      invoice: "VARCHAR(80) NOT NULL DEFAULT ''",
      user_id: 'BIGINT UNSIGNED NOT NULL',
      product_id: 'BIGINT UNSIGNED NOT NULL',
      payment_invoice: 'VARCHAR(80) NULL',
      product_name: "VARCHAR(180) NOT NULL DEFAULT ''",
      email_account: 'VARCHAR(255) NULL',
      password_account: 'TEXT NULL',
      manual_email: 'TEXT NULL',
      manual_password: 'TEXT NULL',
      manual_note: 'TEXT NULL',
      fulfilled_by_admin_id: 'BIGINT UNSIGNED NULL',
      fulfilled_at: 'TIMESTAMP NULL',
      fulfillment_type: "VARCHAR(40) NOT NULL DEFAULT 'provider_auto'",
      retry_count: 'INT UNSIGNED NOT NULL DEFAULT 0',
      role: "VARCHAR(32) NOT NULL DEFAULT 'member'",
      payment_status: "VARCHAR(40) NOT NULL DEFAULT 'pending'",
      provider_invoice: 'VARCHAR(80) NULL',
      provider_status: "VARCHAR(40) NOT NULL DEFAULT 'pending'",
      order_status: "VARCHAR(40) NOT NULL DEFAULT 'pending'",
      target_whatsapp: 'VARCHAR(40) NULL',
      delivery_status: "ENUM('pending','sent','failed','manual_pending') NOT NULL DEFAULT 'pending'",
      delivery_time: 'TIMESTAMP NULL',
      raw_response: 'JSON NULL',
      total_price: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      processing_started_at: 'TIMESTAMP NULL',
      success_at: 'TIMESTAMP NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'uq_orders_invoice', unique: true, columns: ['invoice'] },
      { name: 'uq_orders_payment_invoice', unique: true, columns: ['payment_invoice'] },
      { name: 'idx_orders_user_id', columns: ['user_id'] },
      { name: 'idx_orders_payment_invoice', columns: ['payment_invoice'] },
      { name: 'idx_orders_product_id', columns: ['product_id'] }
    ],
    constraints: [
      'CONSTRAINT fk_orders_user_id FOREIGN KEY (user_id) REFERENCES users(id)',
      'CONSTRAINT fk_orders_product_id FOREIGN KEY (product_id) REFERENCES products(id)',
      'CONSTRAINT fk_orders_payment_invoice FOREIGN KEY (payment_invoice) REFERENCES payments(invoice)'
    ]
  },
  withdraws: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      invoice: "VARCHAR(80) NOT NULL DEFAULT ''",
      user_id: 'BIGINT UNSIGNED NOT NULL',
      amount: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      bank_account: 'VARCHAR(255) NULL',
      notes: 'TEXT NULL',
      fee: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      status: "VARCHAR(40) NOT NULL DEFAULT 'pending'",
      bank_name: 'VARCHAR(120) NULL',
      account_number: 'VARCHAR(120) NULL',
      account_name: 'VARCHAR(180) NULL',
      admin_note: 'TEXT NULL',
      approved_at: 'TIMESTAMP NULL',
      rejected_at: 'TIMESTAMP NULL',
      processed_at: 'TIMESTAMP NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'uq_withdraws_invoice', unique: true, columns: ['invoice'] },
      { name: 'idx_withdraws_user_id', columns: ['user_id'] },
      { name: 'idx_withdraws_status', columns: ['status'] }
    ],
    constraints: [
      'CONSTRAINT fk_withdraws_user_id FOREIGN KEY (user_id) REFERENCES users(id)'
    ]
  },
  saldo_logs: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      user_id: 'BIGINT UNSIGNED NOT NULL',
      type: "VARCHAR(40) NOT NULL DEFAULT 'adjustment'",
      balance_before: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      balance_after: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      reference: 'VARCHAR(120) NULL',
      notes: 'TEXT NULL',
      before_saldo: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      after_saldo: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      amount: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      log_type: "VARCHAR(40) NOT NULL DEFAULT 'unknown'",
      reference_table: 'VARCHAR(80) NULL',
      reference_id: 'VARCHAR(120) NULL',
      description: 'TEXT NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'idx_saldo_logs_user_id', columns: ['user_id'] },
      { name: 'idx_saldo_logs_created_at', columns: ['created_at'] }
    ],
    constraints: [
      'CONSTRAINT fk_saldo_logs_user_id FOREIGN KEY (user_id) REFERENCES users(id)'
    ]
  },
  saldo_mutations: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      user_id: 'BIGINT UNSIGNED NOT NULL',
      mutation_type: "VARCHAR(60) NOT NULL DEFAULT 'unknown'",
      direction: "VARCHAR(16) NOT NULL DEFAULT 'neutral'",
      amount: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      balance_before: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      balance_after: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      locked_before: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      locked_after: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      reference_table: 'VARCHAR(80) NULL',
      reference_id: 'VARCHAR(120) NULL',
      description: 'TEXT NULL',
      metadata: 'JSON NULL',
      reference: 'VARCHAR(120) NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'idx_saldo_mutations_user_id', columns: ['user_id'] },
      { name: 'idx_saldo_mutations_mutation_type', columns: ['mutation_type'] },
      { name: 'idx_saldo_mutations_created_at', columns: ['created_at'] }
    ],
    constraints: [
      'CONSTRAINT fk_saldo_mutations_user_id FOREIGN KEY (user_id) REFERENCES users(id)'
    ]
  },
  notifications: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      user_id: 'BIGINT UNSIGNED NULL',
      target_role: "ENUM('admin','reseller','member') NULL",
      title: "VARCHAR(180) NOT NULL DEFAULT ''",
      message: 'TEXT NOT NULL',
      type: "VARCHAR(40) NOT NULL DEFAULT 'broadcast'",
      is_pinned: 'TINYINT(1) NOT NULL DEFAULT 0',
      created_by: 'BIGINT UNSIGNED NULL',
      channel: "VARCHAR(40) NOT NULL DEFAULT 'in_app'",
      is_active: 'TINYINT(1) NOT NULL DEFAULT 1',
      read_at: 'TIMESTAMP NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'idx_notifications_user_id', columns: ['user_id'] },
      { name: 'idx_notifications_target_role', columns: ['target_role'] },
      { name: 'idx_notifications_is_active', columns: ['is_active'] }
    ],
    constraints: [
      'CONSTRAINT fk_notifications_user_id FOREIGN KEY (user_id) REFERENCES users(id)'
    ]
  },
  settings: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      setting_key: "VARCHAR(120) NOT NULL DEFAULT ''",
      setting_value: 'JSON NULL',
      key: "VARCHAR(120) NULL",
      value: 'JSON NULL',
      value_type: "VARCHAR(32) NOT NULL DEFAULT 'string'",
      is_secret: 'TINYINT(1) NOT NULL DEFAULT 0',
      description: 'TEXT NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'uq_settings_setting_key', unique: true, columns: ['setting_key'] }
    ]
  },
  activity_logs: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      user_id: 'BIGINT UNSIGNED NULL',
      actor_id: 'BIGINT UNSIGNED NULL',
      scope: "VARCHAR(40) NOT NULL DEFAULT 'SYSTEM'",
      message: 'TEXT NULL',
      activity: 'TEXT NULL',
      actor_role: "ENUM('admin','reseller','member') NULL",
      action: "VARCHAR(120) NOT NULL DEFAULT ''",
      entity_type: 'VARCHAR(80) NULL',
      entity_id: 'VARCHAR(120) NULL',
      ip_address: 'VARCHAR(64) NULL',
      user_agent: 'TEXT NULL',
      metadata: 'JSON NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'idx_activity_logs_user_id', columns: ['user_id'] },
      { name: 'idx_activity_logs_created_at', columns: ['created_at'] }
    ],
    constraints: [
      'CONSTRAINT fk_activity_logs_user_id FOREIGN KEY (user_id) REFERENCES users(id)'
    ]
  },
  finance_daily_summaries: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      summary_date: 'DATE NOT NULL',
      total_deposit: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      total_withdraw: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      total_order: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      total_profit: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      total_mutation: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      metadata: 'JSON NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'uq_finance_daily_summaries_summary_date', unique: true, columns: ['summary_date'] }
    ]
  },
  balance_mutations: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      user_id: 'BIGINT UNSIGNED NOT NULL',
      mutation_type: "VARCHAR(40) NOT NULL DEFAULT 'unknown'",
      direction: "VARCHAR(16) NOT NULL DEFAULT 'neutral'",
      amount: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      balance_before: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      balance_after: 'DECIMAL(15,2) UNSIGNED NOT NULL DEFAULT 0.00',
      source_type: 'VARCHAR(80) NULL',
      source_ref: 'VARCHAR(120) NULL',
      admin_executor_id: 'BIGINT UNSIGNED NULL',
      notes: 'TEXT NULL',
      metadata: 'JSON NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'idx_balance_mutations_user_id', columns: ['user_id'] },
      { name: 'idx_balance_mutations_type_created', columns: ['mutation_type', 'created_at'] },
      { name: 'idx_balance_mutations_source_ref', columns: ['source_ref'] }
    ],
    constraints: [
      'CONSTRAINT fk_balance_mutations_user_id FOREIGN KEY (user_id) REFERENCES users(id)'
    ]
  },
  admin_logs: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      admin_id: 'BIGINT UNSIGNED NULL',
      action: "VARCHAR(80) NOT NULL DEFAULT ''",
      target_type: 'VARCHAR(80) NULL',
      target_id: 'VARCHAR(120) NULL',
      ip_address: 'VARCHAR(64) NULL',
      metadata: 'JSON NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'idx_admin_logs_admin_id', columns: ['admin_id'] },
      { name: 'idx_admin_logs_created_at', columns: ['created_at'] }
    ]
  },
  webhook_logs: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      provider: "VARCHAR(40) NOT NULL DEFAULT 'premku'",
      payload: 'JSON NULL',
      status: "VARCHAR(40) NOT NULL DEFAULT 'received'",
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'idx_webhook_logs_created_at', columns: ['created_at'] }
    ]
  },
  provider_logs: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      provider: "VARCHAR(40) NOT NULL DEFAULT 'premku'",
      action: "VARCHAR(80) NOT NULL DEFAULT ''",
      status: "VARCHAR(40) NOT NULL DEFAULT 'unknown'",
      metadata: 'JSON NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'idx_provider_logs_created_at', columns: ['created_at'] }
    ]
  },
  websocket_events: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      event_name: "VARCHAR(120) NOT NULL DEFAULT ''",
      target_user_id: 'BIGINT UNSIGNED NULL',
      target_role: "ENUM('admin','reseller','member') NULL",
      payload: 'JSON NULL',
      status: "VARCHAR(40) NOT NULL DEFAULT 'pending'",
      delivered_at: 'TIMESTAMP NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'idx_websocket_events_target_user_id', columns: ['target_user_id'] },
      { name: 'idx_websocket_events_target_role', columns: ['target_role'] },
      { name: 'idx_websocket_events_status', columns: ['status'] },
      { name: 'idx_websocket_events_created_at', columns: ['created_at'] }
    ],
    constraints: [
      'CONSTRAINT fk_websocket_events_target_user_id FOREIGN KEY (target_user_id) REFERENCES users(id)'
    ]
  },
  temp_notifications: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      user_id: 'BIGINT UNSIGNED NULL',
      target_role: "ENUM('admin','reseller','member') NULL",
      message: 'TEXT NOT NULL',
      payload: 'JSON NULL',
      expires_at: 'TIMESTAMP NOT NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'idx_temp_notifications_user_id', columns: ['user_id'] },
      { name: 'idx_temp_notifications_target_role', columns: ['target_role'] },
      { name: 'idx_temp_notifications_expires_at', columns: ['expires_at'] }
    ],
    constraints: [
      'CONSTRAINT fk_temp_notifications_user_id FOREIGN KEY (user_id) REFERENCES users(id)'
    ]
  },
  realtime_cache: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      cache_key: "VARCHAR(180) NOT NULL DEFAULT ''",
      cache_value: 'JSON NULL',
      expires_at: 'TIMESTAMP NOT NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'uq_realtime_cache_cache_key', unique: true, columns: ['cache_key'] },
      { name: 'idx_realtime_cache_expires_at', columns: ['expires_at'] }
    ]
  },
  polling_logs: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      poll_type: "VARCHAR(60) NOT NULL DEFAULT ''",
      reference_id: 'VARCHAR(120) NULL',
      status: "VARCHAR(60) NOT NULL DEFAULT 'unknown'",
      attempts: 'INT UNSIGNED NOT NULL DEFAULT 0',
      response_time_ms: 'INT UNSIGNED NULL',
      error_message: 'TEXT NULL',
      created_at: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      { name: 'idx_polling_logs_poll_type', columns: ['poll_type'] },
      { name: 'idx_polling_logs_reference_id', columns: ['reference_id'] },
      { name: 'idx_polling_logs_created_at', columns: ['created_at'] }
    ]
  }
};

const BOOTSTRAP_SETTINGS = [
  ['premku_api_key', null, 'string', 1, 'Runtime Premku API key. Env is only fallback/bootstrap.'],
  ['admin_whatsapp', null, 'string', 0, 'Admin WhatsApp contact.'],
  ['support_whatsapp', '+6285888009931', 'string', 0, 'Central support WhatsApp used by frontend buttons.'],
  ['maintenance_mode', '"disabled"', 'string', 0, 'Global maintenance switch.'],
  ['maintenance_message', '"Web sedang maintenance. Mohon tidak melakukan transaksi terlebih dahulu."', 'string', 0, 'Public maintenance message.'],
  ['maintenance_started_at', null, 'string', 0, 'Maintenance start timestamp.'],
  ['maintenance_started_by', null, 'string', 0, 'Admin user id that enabled maintenance.'],
  ['pricing_markup_config', '{"markup_type":"flat","admin_margin":null,"member_markup":0,"reseller_markup":0,"member_ranges":[{"min":0,"max":4999,"value":85},{"min":5000,"max":9999,"value":40},{"min":10000,"max":14999,"value":20},{"min":15000,"max":19999,"value":8},{"min":20000,"max":null,"value":3}],"reseller_ranges":[{"min":0,"max":4999,"value":40},{"min":5000,"max":9999,"value":15},{"min":10000,"max":14999,"value":11},{"min":15000,"max":19999,"value":7},{"min":20000,"max":null,"value":6}]}', 'json', 0, 'Global role markup config used to sync final product prices.'],
  ['member_pricing_settings', null, 'json', 0, 'Legacy/admin member pricing settings if still needed.'],
  ['reseller_pricing_settings', null, 'json', 0, 'Legacy/admin reseller pricing settings if still needed.'],
  ['bot_settings', null, 'json', 0, 'Bot access and delivery settings.'],
  ['retention_settings', '{"operational_days":7}', 'json', 0, 'Operational data retention settings.']
];

function getDbConfig() {
  if (process.env.DATABASE_URL) {
    const databaseUrl = new URL(process.env.DATABASE_URL);
    return {
      host: databaseUrl.hostname,
      port: Number(databaseUrl.port || 3306),
      user: decodeURIComponent(databaseUrl.username || ''),
      password: decodeURIComponent(databaseUrl.password || ''),
      database: databaseUrl.pathname.replace(/^\//, ''),
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_POOL_LIMIT || 10),
      charset: 'utf8mb4'
    };
  }

  const missing = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
    .filter((key) => !process.env[key] || String(process.env[key]).trim() === '');

  if (missing.length > 0) {
    throw new Error(`Database environment variables not configured: ${missing.join(', ')}`);
  }

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_LIMIT || 10),
    charset: 'utf8mb4'
  };
}

function shouldCreateDatabase() {
  return String(process.env.DB_CREATE_IF_MISSING || '').toLowerCase() === 'true';
}

function quoteId(value) {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error(`Invalid identifier: ${value}`);
  }
  return `\`${value}\``;
}

function splitSqlStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function createDatabaseIfAllowed(config) {
  if (!shouldCreateDatabase()) return;

  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    charset: config.charset
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${quoteId(config.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await connection.end();
  }
}

async function runCanonicalSchema(pool) {
  const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf8');
  const statements = splitSqlStatements(schemaSql);

  for (const statement of statements) {
    await pool.query(statement);
  }
}

async function columnExists(pool, database, table, column) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [database, table, column]
  );
  return rows.length > 0;
}

async function indexExists(pool, database, table, indexName) {
  const [rows] = await pool.query(
    `SELECT INDEX_NAME
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    [database, table, indexName]
  );
  return rows.length > 0;
}

async function constraintExists(pool, database, constraintName) {
  const [rows] = await pool.query(
    `SELECT CONSTRAINT_NAME
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND CONSTRAINT_NAME = ?
     LIMIT 1`,
    [database, constraintName]
  );
  return rows.length > 0;
}

async function tableExists(pool, database, table) {
  const [rows] = await pool.query(
    `SELECT TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     LIMIT 1`,
    [database, table]
  );
  return rows.length > 0;
}

function parseConstraintName(definition) {
  const match = definition.match(/CONSTRAINT\s+([a-zA-Z0-9_]+)/i);
  return match ? match[1] : null;
}

async function ensureColumns(pool, database, report) {
  for (const [table, definition] of Object.entries(TABLES)) {
    for (const [column, columnSql] of Object.entries(definition.columns)) {
      const exists = await columnExists(pool, database, table, column);
      if (!exists) {
        await pool.query(`ALTER TABLE ${quoteId(table)} ADD COLUMN ${quoteId(column)} ${columnSql}`);
        report.columns.push(`${table}.${column}`);
      }
    }
  }
}

async function ensureTables(pool, database, report) {
  for (const [table, definition] of Object.entries(TABLES)) {
    const exists = await tableExists(pool, database, table);
    if (exists) continue;

    const columns = Object.entries(definition.columns)
      .map(([column, columnSql]) => `${quoteId(column)} ${columnSql}`)
      .join(', ');
    const primaryKey = definition.columns.id ? ', PRIMARY KEY (`id`)' : '';
    await pool.query(
      `CREATE TABLE ${quoteId(table)} (${columns}${primaryKey}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
    report.tables.push(table);
  }
}

async function ensureRuntimeColumnTypes(pool, database, report) {
  const expected = [
    ['payments', 'status', "VARCHAR(40) NOT NULL DEFAULT 'pending'"],
    ['deposits', 'status', "VARCHAR(40) NOT NULL DEFAULT 'pending'"],
    ['orders', 'payment_status', "VARCHAR(40) NOT NULL DEFAULT 'pending'"],
    ['orders', 'provider_status', "VARCHAR(40) NOT NULL DEFAULT 'pending'"],
    ['orders', 'order_status', "VARCHAR(40) NOT NULL DEFAULT 'pending'"],
    ['transactions', 'direction', "VARCHAR(16) NOT NULL DEFAULT 'out'"],
    ['notifications', 'target_role', 'VARCHAR(40) NULL'],
    ['products', 'product_source', "VARCHAR(32) NOT NULL DEFAULT 'provider'"],
    ['saldo_logs', 'type', "VARCHAR(40) NOT NULL DEFAULT 'adjustment'"],
    ['saldo_logs', 'log_type', "VARCHAR(40) NOT NULL DEFAULT 'unknown'"],
    ['saldo_mutations', 'mutation_type', "VARCHAR(60) NOT NULL DEFAULT 'unknown'"],
    ['saldo_mutations', 'direction', "VARCHAR(16) NOT NULL DEFAULT 'neutral'"],
  ];

  for (const [table, column, definition] of expected) {
    const [rows] = await pool.query(
      `SELECT COLUMN_TYPE, COLUMN_DEFAULT
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
       LIMIT 1`,
      [database, table, column]
    );
    const columnType = String(rows[0]?.COLUMN_TYPE || '').toLowerCase();
    const wantsVarchar = String(definition).toLowerCase().includes('varchar');
    const defaultMatch = String(definition).match(/DEFAULT\s+'([^']*)'/i);
    const defaultMismatch = defaultMatch && String(rows[0]?.COLUMN_DEFAULT ?? '') !== defaultMatch[1];
    if (rows[0] && wantsVarchar && (!columnType.includes('varchar') || defaultMismatch)) {
      await pool.query(`ALTER TABLE ${quoteId(table)} MODIFY COLUMN ${quoteId(column)} ${definition}`);
      report.columns.push(`${table}.${column}(varchar-runtime)`);
    }
  }
}

async function ensureIndexes(pool, database, report) {
  for (const [table, definition] of Object.entries(TABLES)) {
    for (const index of definition.indexes || []) {
      const exists = await indexExists(pool, database, table, index.name);
      if (!exists) {
        const unique = index.unique ? 'UNIQUE ' : '';
        const columns = index.columns.map(quoteId).join(', ');
        try {
          await pool.query(`ALTER TABLE ${quoteId(table)} ADD ${unique}KEY ${quoteId(index.name)} (${columns})`);
          report.indexes.push(`${table}.${index.name}`);
        } catch (error) {
          report.constraintWarnings.push({
            constraint: `${table}.${index.name}`,
            reason: error.message
          });
        }
      }
    }
  }
}

async function ensureConstraints(pool, database, report) {
  for (const [table, definition] of Object.entries(TABLES)) {
    for (const constraint of definition.constraints || []) {
      const constraintName = parseConstraintName(constraint);
      if (!constraintName) continue;

      const exists = await constraintExists(pool, database, constraintName);
      if (!exists) {
        try {
          await pool.query(`ALTER TABLE ${quoteId(table)} ADD ${constraint}`);
          report.constraints.push(`${table}.${constraintName}`);
        } catch (error) {
          report.constraintWarnings.push({
            constraint: `${table}.${constraintName}`,
            reason: error.message
          });
        }
      }
    }
  }
}

async function seedBootstrapSettings(pool, report) {
  for (const row of BOOTSTRAP_SETTINGS) {
    const [settingKey, settingValue, valueType, isSecret, description] = row;
    const [result] = await pool.query(
      `INSERT IGNORE INTO settings
       (setting_key, setting_value, value_type, is_secret, description)
       VALUES (?, ?, ?, ?, ?)`,
      [settingKey, settingValue, valueType, isSecret, description]
    );

    if (result.affectedRows > 0) {
      report.settings.push(settingKey);
    }
  }
}

function generateBootstrapApiKey(username) {
  return `api_${String(username).toLowerCase()}_${crypto.randomBytes(18).toString('hex')}`;
}

function getBootstrapPasswordHash() {
  if (process.env.ADMIN_PASSWORD_HASH) return process.env.ADMIN_PASSWORD_HASH;
  if (process.env.ADMIN_PASSWORD) {
    return isHashedPassword(process.env.ADMIN_PASSWORD)
      ? process.env.ADMIN_PASSWORD
      : hashPassword(process.env.ADMIN_PASSWORD);
  }
  return '';
}

function normalizeBootstrapEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizeBootstrapPhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const compact = raw.replace(/[\s\-()+.]/g, '');
  if (!/^\d+$/.test(compact)) return null;
  if (compact.startsWith('0')) return `62${compact.slice(1)}`;
  if (compact.startsWith('62')) return compact;
  return null;
}

function envFlag(name) {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').toLowerCase());
}

async function writeAuthActivity(pool, message, metadata = {}) {
  try {
    await pool.query(
      `INSERT INTO activity_logs (scope, message, activity, action, metadata)
       VALUES ('AUTH', ?, ?, ?, CAST(? AS JSON))`,
      [message, message, message, JSON.stringify(metadata)]
    );
  } catch {
    // Activity logging must never block database startup.
  }
}

async function seedBootstrapAdmin(pool, report) {
  const username = String(process.env.ADMIN_USERNAME || '').trim();
  const email = normalizeBootstrapEmail(process.env.ADMIN_EMAIL);
  const phone = normalizeBootstrapPhone(process.env.ADMIN_PHONE);
  const forceReset = envFlag('ADMIN_FORCE_RESET');
  const passwordHash = getBootstrapPasswordHash();
  if (!username) return;

  const [adminRows] = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  const [rows] = await pool.query('SELECT id, api_key, role FROM users WHERE username = ? LIMIT 1', [username]);
  const existing = rows[0] || null;

  if (forceReset) {
    if (!passwordHash) return;
    if (existing) {
      await pool.query(
        `UPDATE users
         SET password_hash = ?, password = ?, role = 'admin', status = 'active',
             email = COALESCE(NULLIF(email, ''), ?),
             phone = COALESCE(NULLIF(phone, ''), ?),
             api_key = COALESCE(NULLIF(api_key, ''), ?)
         WHERE id = ?`,
        [passwordHash, passwordHash, email, phone, generateBootstrapApiKey(username), existing.id]
      );
      console.log('[AUTH] Admin password reset from env');
      await writeAuthActivity(pool, 'admin_force_reset', { username });
      report.admins.push(`${username}(force-reset)`);
      return;
    }
  }

  if (adminRows.length > 0 && !forceReset) {
    return;
  }

  if (!passwordHash) return;

  if (existing) {
    await pool.query(
      `UPDATE users
       SET password_hash = ?, password = ?, role = 'admin', status = 'active',
           email = COALESCE(NULLIF(email, ''), ?),
           phone = COALESCE(NULLIF(phone, ''), ?),
           api_key = COALESCE(NULLIF(api_key, ''), ?)
       WHERE id = ?`,
      [passwordHash, passwordHash, email, phone, generateBootstrapApiKey(username), existing.id]
    );
    await writeAuthActivity(pool, 'admin_seed_created', { username, mode: 'promoted_existing_user' });
    report.admins.push(`${username}(promoted)`);
    return;
  }

  await pool.query(
    `INSERT INTO users
      (username, email, phone, password_hash, password, api_key, role, status, saldo, locked_balance, bot_access_unlocked, reseller_request_status, theme, fullName)
     VALUES (?, ?, ?, ?, ?, ?, 'admin', 'active', 0, 0, 0, 'none', 'dark', ?)`,
    [username, email, phone, passwordHash, passwordHash, generateBootstrapApiKey(username), username]
  );
  await writeAuthActivity(pool, 'admin_seed_created', { username });
  report.admins.push(`${username}(created)`);
}

async function reconcileFinanceMutations(pool, report) {
  const [saldoMutationResult] = await pool.query(
    `INSERT INTO balance_mutations
      (user_id, mutation_type, direction, amount, balance_before, balance_after, source_type, source_ref, notes, metadata, created_at)
     SELECT
       sm.user_id,
       LEFT(sm.mutation_type, 40),
       sm.direction,
       sm.amount,
       sm.balance_before,
       sm.balance_after,
       sm.reference_table,
       COALESCE(sm.reference_id, sm.reference),
       sm.description,
       sm.metadata,
       sm.created_at
     FROM saldo_mutations sm
     WHERE NOT EXISTS (
       SELECT 1
       FROM balance_mutations bm
       WHERE bm.user_id = sm.user_id
         AND bm.mutation_type = LEFT(sm.mutation_type, 40)
         AND bm.direction = sm.direction
         AND bm.amount = sm.amount
         AND bm.balance_before = sm.balance_before
         AND bm.balance_after = sm.balance_after
         AND COALESCE(bm.source_ref, '') = COALESCE(sm.reference_id, sm.reference, '')
     )`,
  );

  const [saldoLogResult] = await pool.query(
    `INSERT INTO balance_mutations
      (user_id, mutation_type, direction, amount, balance_before, balance_after, source_type, source_ref, notes, metadata, created_at)
     SELECT
       sl.user_id,
       LEFT(
         CASE
           WHEN sl.reference_table IN ('deposit', 'bot_activation') THEN sl.reference_table
           WHEN sl.reference_table = 'withdraw' THEN 'withdraw'
           WHEN sl.reference_table = 'order' THEN 'order_payment'
           WHEN sl.log_type IN ('credit', 'debit', 'refund', 'adjustment') THEN sl.log_type
           ELSE COALESCE(NULLIF(sl.log_type, ''), NULLIF(sl.type, ''), 'unknown')
         END,
         40
       ),
       CASE
         WHEN COALESCE(NULLIF(sl.balance_after, 0), sl.after_saldo, 0) > COALESCE(NULLIF(sl.balance_before, 0), sl.before_saldo, 0) THEN 'in'
         WHEN COALESCE(NULLIF(sl.balance_after, 0), sl.after_saldo, 0) < COALESCE(NULLIF(sl.balance_before, 0), sl.before_saldo, 0) THEN 'out'
         ELSE 'neutral'
       END,
       sl.amount,
       COALESCE(NULLIF(sl.balance_before, 0), sl.before_saldo, 0),
       COALESCE(NULLIF(sl.balance_after, 0), sl.after_saldo, 0),
       sl.reference_table,
       COALESCE(sl.reference_id, sl.reference),
       COALESCE(sl.description, sl.notes),
       JSON_OBJECT('reconciled_from', 'saldo_logs', 'saldo_log_id', sl.id),
       sl.created_at
     FROM saldo_logs sl
     WHERE NOT EXISTS (
       SELECT 1
       FROM balance_mutations bm
       WHERE bm.user_id = sl.user_id
         AND bm.amount = sl.amount
         AND bm.balance_before = COALESCE(NULLIF(sl.balance_before, 0), sl.before_saldo, 0)
         AND bm.balance_after = COALESCE(NULLIF(sl.balance_after, 0), sl.after_saldo, 0)
         AND COALESCE(bm.source_ref, '') = COALESCE(sl.reference_id, sl.reference, '')
     )`,
  );

  const total = Number(saldoMutationResult.affectedRows || 0) + Number(saldoLogResult.affectedRows || 0);
  if (total > 0) {
    report.reconciliations.push(`balance_mutations:${total}`);
  }
}

async function validateSchema(pool, database) {
  const report = {
    tables: [],
    columns: [],
    indexes: [],
    constraints: [],
    constraintWarnings: [],
    settings: [],
    admins: [],
    reconciliations: []
  };

  await ensureTables(pool, database, report);
  await ensureColumns(pool, database, report);
  await ensureRuntimeColumnTypes(pool, database, report);
  await ensureIndexes(pool, database, report);
  await ensureConstraints(pool, database, report);
  await seedBootstrapSettings(pool, report);
  await seedBootstrapAdmin(pool, report);
  await reconcileFinanceMutations(pool, report);

  return report;
}

let pool = null;

async function createPool() {
  const config = getDbConfig();
  await createDatabaseIfAllowed(config);

  pool = mysql.createPool(config);
  return pool;
}

async function initializeDatabase() {
  const config = getDbConfig();
  console.log(`[DB] Config host=${config.host} port=${config.port} database=${config.database}`);
  const p = await createPool();

  try {
    await p.query('SELECT 1');
    console.log('[DB] Connected');
    await runCanonicalSchema(p);
    const report = await validateSchema(p, config.database);
    return { pool: p, report };
  } catch (error) {
    await p.end();
    console.error('[DB] Connection failed', {
      host: config.host,
      port: config.port,
      database: config.database
    });
    throw error;
  }
}

function parseDbJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

async function query(sql, params = []) {
  if (!pool) throw new Error('Database pool not initialized');
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function execute(sql, params = []) {
  if (!pool) throw new Error('Database pool not initialized');
  const [result] = await pool.execute(sql, params);
  return result;
}

async function transaction(callback) {
  if (!pool) throw new Error('Database pool not initialized');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (err) {
    try { await connection.rollback(); } catch (e) {}
    throw err;
  } finally {
    connection.release();
  }
}

export {
  TABLES,
  PAYMENT_STATUSES,
  BOOTSTRAP_SETTINGS,
  getDbConfig,
  createPool,
  initializeDatabase,
  validateSchema,
  parseDbJson,
  query,
  execute,
  transaction
};
