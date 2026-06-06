import { execute, query } from '../config/db.js';

const TEMPLATE_IDS = new Set(['template_1', 'template_2', 'template_3']);
const MARGIN_TYPES = new Set(['percent', 'fixed']);

function normalizeTemplate(value) {
  const template = String(value || 'template_1').trim().toLowerCase();
  return TEMPLATE_IDS.has(template) ? template : 'template_1';
}

function normalizeMarginType(value) {
  const type = String(value || 'percent').trim().toLowerCase();
  return MARGIN_TYPES.has(type) ? type : 'percent';
}

function normalizeHooks(value) {
  const raw = Array.isArray(value) ? value.join(',') : String(value || 'p,ping,halo,haloo,bro');
  const hooks = raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
  return hooks.length ? [...new Set(hooks)].join(',') : 'p,ping,halo,haloo,bro';
}

function clampText(value, fallback, maxLength) {
  return String(value ?? fallback ?? '').trim().slice(0, maxLength);
}

function clampMargin(value, type) {
  const numeric = Number(value ?? (type === 'fixed' ? 500 : 10));
  if (!Number.isFinite(numeric) || numeric < 0) return type === 'fixed' ? 500 : 10;
  return type === 'percent' ? Math.min(numeric, 100) : Math.min(Math.round(numeric), 1_000_000);
}

function defaultSettings(user = {}) {
  return {
    user_id: Number(user.id || 0),
    brand_name: 'PREMIUMIN PLUS BOT',
    greeting_hooks: 'p,ping,halo,haloo,bro',
    welcome_message: 'Selamat datang, silakan berbelanja.',
    admin_whatsapp: user.phone || '',
    operational_hours: '08.00 - 21.00 WIB',
    closing_message: 'Kepuasan pelanggan adalah prioritas kami.',
    catalog_template: 'template_1',
    order_template: 'template_1',
    terms_text: 'Simpan data akun baik-baik. Garansi mengikuti ketentuan produk.',
    reseller_margin_type: 'percent',
    reseller_margin_value: 10,
    is_active: true,
  };
}

function normalizeSettings(payload = {}, current = defaultSettings()) {
  const marginType = normalizeMarginType(payload.reseller_margin_type ?? current.reseller_margin_type);
  return {
    brand_name: clampText(payload.brand_name, current.brand_name, 120),
    greeting_hooks: normalizeHooks(payload.greeting_hooks ?? current.greeting_hooks),
    welcome_message: clampText(payload.welcome_message, current.welcome_message, 1000),
    admin_whatsapp: clampText(payload.admin_whatsapp, current.admin_whatsapp, 40).replace(/[^\d+]/g, ''),
    operational_hours: clampText(payload.operational_hours, current.operational_hours, 120),
    closing_message: clampText(payload.closing_message, current.closing_message, 1000),
    catalog_template: normalizeTemplate(payload.catalog_template ?? current.catalog_template),
    order_template: normalizeTemplate(payload.order_template ?? current.order_template),
    terms_text: clampText(payload.terms_text, current.terms_text, 5000),
    reseller_margin_type: marginType,
    reseller_margin_value: clampMargin(payload.reseller_margin_value ?? current.reseller_margin_value, marginType),
    is_active: payload.is_active === undefined ? Boolean(current.is_active) : Boolean(payload.is_active),
  };
}

function toRecord(row, user = {}) {
  const fallback = defaultSettings(user);
  const record = row
    ? {
        id: Number(row.id),
        user_id: Number(row.user_id),
        brand_name: row.brand_name || fallback.brand_name,
        greeting_hooks: row.greeting_hooks || fallback.greeting_hooks,
        welcome_message: row.welcome_message || fallback.welcome_message,
        admin_whatsapp: row.admin_whatsapp || fallback.admin_whatsapp,
        operational_hours: row.operational_hours || fallback.operational_hours,
        closing_message: row.closing_message || fallback.closing_message,
        catalog_template: normalizeTemplate(row.catalog_template),
        order_template: normalizeTemplate(row.order_template),
        terms_text: row.terms_text || fallback.terms_text,
        reseller_margin_type: normalizeMarginType(row.reseller_margin_type),
        reseller_margin_value: Number(row.reseller_margin_value ?? fallback.reseller_margin_value),
        is_active: Boolean(row.is_active),
        created_at: row.created_at,
        updated_at: row.updated_at,
      }
    : fallback;

  return {
    ...record,
    enabled: Boolean(record.is_active),
    auto_reply_enabled: Boolean(record.is_active),
    panel_name: record.brand_name,
    greeting_message: record.welcome_message,
    footer_message: record.closing_message,
    keyword_response: 'Ketik stok atau list untuk melihat katalog produk.',
    auto_reply_prompt: 'Jawab pelanggan dengan ramah dan arahkan pembayaran melalui QRIS bot.',
    order_format: 'buy kode_produk',
    features: {
      order_status: true,
      balance_check: true,
      product_catalog: true,
    },
  };
}

export async function getResellerBotSettings(user) {
  const rows = await query('SELECT * FROM reseller_bot_settings WHERE user_id = ? LIMIT 1', [Number(user.id)]);
  if (rows[0]) return toRecord(rows[0], user);

  const defaults = defaultSettings(user);
  await execute(
    `INSERT IGNORE INTO reseller_bot_settings
      (user_id, brand_name, greeting_hooks, welcome_message, admin_whatsapp, operational_hours, closing_message, catalog_template, order_template, terms_text, reseller_margin_type, reseller_margin_value, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(user.id),
      defaults.brand_name,
      defaults.greeting_hooks,
      defaults.welcome_message,
      defaults.admin_whatsapp,
      defaults.operational_hours,
      defaults.closing_message,
      defaults.catalog_template,
      defaults.order_template,
      defaults.terms_text,
      defaults.reseller_margin_type,
      defaults.reseller_margin_value,
      defaults.is_active ? 1 : 0,
    ],
  );
  const nextRows = await query('SELECT * FROM reseller_bot_settings WHERE user_id = ? LIMIT 1', [Number(user.id)]);
  return toRecord(nextRows[0] || null, user);
}

export async function findResellerBotSettings(user) {
  const rows = await query('SELECT * FROM reseller_bot_settings WHERE user_id = ? LIMIT 1', [Number(user.id)]);
  return rows[0] ? toRecord(rows[0], user) : null;
}

export async function updateResellerBotSettings(user, payload = {}) {
  const current = await getResellerBotSettings(user);
  const next = normalizeSettings(payload, current);
  await execute(
    `INSERT INTO reseller_bot_settings
      (user_id, brand_name, greeting_hooks, welcome_message, admin_whatsapp, operational_hours, closing_message, catalog_template, order_template, terms_text, reseller_margin_type, reseller_margin_value, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      brand_name = VALUES(brand_name),
      greeting_hooks = VALUES(greeting_hooks),
      welcome_message = VALUES(welcome_message),
      admin_whatsapp = VALUES(admin_whatsapp),
      operational_hours = VALUES(operational_hours),
      closing_message = VALUES(closing_message),
      catalog_template = VALUES(catalog_template),
      order_template = VALUES(order_template),
      terms_text = VALUES(terms_text),
      reseller_margin_type = VALUES(reseller_margin_type),
      reseller_margin_value = VALUES(reseller_margin_value),
      is_active = VALUES(is_active),
      updated_at = CURRENT_TIMESTAMP`,
    [
      Number(user.id),
      next.brand_name,
      next.greeting_hooks,
      next.welcome_message,
      next.admin_whatsapp || user.phone || null,
      next.operational_hours,
      next.closing_message,
      next.catalog_template,
      next.order_template,
      next.terms_text,
      next.reseller_margin_type,
      next.reseller_margin_value,
      next.is_active ? 1 : 0,
    ],
  );
  return getResellerBotSettings(user);
}
