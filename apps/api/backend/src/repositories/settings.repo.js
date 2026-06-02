import { query, execute } from '../config/db.js';

const markupTiers = [
  { id: 'tier-1', label: 'Di bawah 5.000', min: 0, max: 4999, percent: 18 },
  { id: 'tier-2', label: 'Di bawah 10.000', min: 5000, max: 9999, percent: 14 },
  { id: 'tier-3', label: '10.000 - 14.999', min: 10000, max: 14999, percent: 12 },
  { id: 'tier-4', label: '15.000 - 19.999', min: 15000, max: 19999, percent: 11 },
  { id: 'tier-5', label: '20.000 ke atas', min: 20000, max: null, percent: 10 },
];

function parseSettingValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function getSettingRow(key) {
  const rows = await query('SELECT * FROM settings WHERE setting_key = ? OR `key` = ? ORDER BY id DESC LIMIT 1', [key, key]);
  return rows[0] || null;
}

export function getMarkupTiers() {
  return markupTiers;
}

export async function setMarkupTiers(nextTiers) {
  return nextTiers;
}

export async function getSetting(key, fallback = null) {
  const row = await getSettingRow(key);
  if (!row) return fallback;
  const value = parseSettingValue(row.setting_value ?? row.value);
  return value ?? fallback;
}

export async function setSetting(key, value) {
  const serialized = JSON.stringify(value);
  const current = await getSettingRow(key);
  if (current) {
    await execute('UPDATE settings SET setting_key = ?, `key` = ?, setting_value = CAST(? AS JSON), value = CAST(? AS JSON) WHERE id = ?', [key, key, serialized, serialized, current.id]);
  } else {
    await execute('INSERT INTO settings (setting_key, `key`, setting_value, value) VALUES (?, ?, CAST(? AS JSON), CAST(? AS JSON))', [key, key, serialized, serialized]);
  }
  return value;
}

export async function getMarkupSetting() {
  const rawMarkup = Number((await getSetting('markup', 0)) || 0);
  const markup = Number.isFinite(rawMarkup) && rawMarkup >= 0 ? rawMarkup : 0;
  const markup_type = String((await getSetting('markup_type', 'percent')) || 'percent');
  const member_markup = await getRoleMarkup('member');
  const reseller_markup = await getRoleMarkup('reseller');
  const member_markup_ranges = normalizeMarkupRanges(await getSetting('member_markup_ranges', markupTiers));
  const reseller_markup_ranges = normalizeMarkupRanges(await getSetting('reseller_markup_ranges', markupTiers.map((tier) => ({ ...tier, percent: Math.max(0, tier.percent - 4) }))));
  return {
    markup,
    markup_type: markup_type === 'fixed' ? 'fixed' : 'percent',
    member_markup,
    reseller_markup,
    member_markup_ranges,
    reseller_markup_ranges,
  };
}

function normalizeMarkupRanges(ranges) {
  const source = Array.isArray(ranges) && ranges.length ? ranges : markupTiers;
  return source.map((item, index) => ({
    id: String(item.id || `tier-${index + 1}`),
    label: String(item.label || `Tier ${index + 1}`),
    min: Math.max(0, Number(item.min || 0)),
    max: item.max === null || item.max === undefined || item.max === '' ? null : Math.max(0, Number(item.max)),
    percent: Math.max(0, Number(item.percent || 0)),
  }));
}

async function getRoleMarkup(role) {
  const legacyFallback = role === 'member' ? await getSetting('markup', 0) : 0;
  const value = Number((await getSetting(`${role}_markup`, legacyFallback)) || 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export async function getPricingSettings() {
  const setting = await getMarkupSetting();
  return {
    member_markup: setting.member_markup,
    reseller_markup: setting.reseller_markup,
    markup_type: setting.markup_type,
  };
}

export async function getDiscountSetting() {
  const rawDiscount = Number((await getSetting('discount_percent', 10)) || 0);
  const discount_percent = Number.isFinite(rawDiscount) && rawDiscount >= 0 ? Math.min(rawDiscount, 100) : 10;
  return { discount_percent };
}

export async function setDiscountSetting(payload) {
  const value = Number(payload.discount_percent);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    const error = new Error('Discount tidak valid');
    error.statusCode = 400;
    throw error;
  }

  await setSetting('discount_percent', value);
  return getDiscountSetting();
}

export async function setMarkupSetting(payload) {
  if (payload.markup !== undefined) {
    const value = Number(payload.markup);
    if (!Number.isFinite(value) || value < 0) {
      const error = new Error('Markup tidak valid');
      error.statusCode = 400;
      throw error;
    }
    await setSetting('markup', value);
  }
  if (payload.markup_type !== undefined) {
    if (!['fixed', 'percent'].includes(payload.markup_type)) {
      const error = new Error('Tipe markup tidak valid');
      error.statusCode = 400;
      throw error;
    }
    await setSetting('markup_type', payload.markup_type === 'fixed' ? 'fixed' : 'percent');
  }
  if (payload.member_markup !== undefined) {
    const value = Number(payload.member_markup);
    if (!Number.isFinite(value) || value < 0) {
      const error = new Error('Markup anggota tidak valid');
      error.statusCode = 400;
      throw error;
    }
    await setSetting('member_markup', value);
    await setSetting('markup', value);
  }
  if (payload.reseller_markup !== undefined) {
    const value = Number(payload.reseller_markup);
    if (!Number.isFinite(value) || value < 0) {
      const error = new Error('Markup reseller tidak valid');
      error.statusCode = 400;
      throw error;
    }
    await setSetting('reseller_markup', value);
  }
  if (payload.member_markup_ranges !== undefined) {
    await setSetting('member_markup_ranges', normalizeMarkupRanges(payload.member_markup_ranges));
  }
  if (payload.reseller_markup_ranges !== undefined) {
    await setSetting('reseller_markup_ranges', normalizeMarkupRanges(payload.reseller_markup_ranges));
  }
  return getMarkupSetting();
}

export async function getBotSettings() {
  return getSetting('bot_settings', {
    enabled: false,
    auto_reply_enabled: false,
    panel_name: 'Premiumin Plus',
    greeting_message: 'Halo, selamat datang di Premiumin Plus.',
    footer_message: 'Premiumin Plus',
    keyword_response: 'Untuk melihat stok ketik stok / list.',
    auto_reply_prompt: 'Balas pelanggan dengan ramah, singkat, dan arahkan ke format order resmi.',
    order_format: 'ORDER#KODE_PRODUK#QTY#NOMOR_WA',
    features: {
      order_status: false,
      balance_check: false,
      product_catalog: false,
    },
  });
}

export async function setBotSettings(payload = {}) {
  const current = await getBotSettings();
  const next = {
    ...current,
    enabled: Boolean(payload.enabled),
    auto_reply_enabled: Boolean(payload.auto_reply_enabled),
    panel_name: String(payload.panel_name ?? current.panel_name ?? 'Premiumin Plus').slice(0, 120),
    greeting_message: String(payload.greeting_message ?? current.greeting_message).slice(0, 500),
    footer_message: String(payload.footer_message ?? current.footer_message ?? 'Premiumin Plus').slice(0, 200),
    keyword_response: String(payload.keyword_response ?? current.keyword_response ?? 'Untuk melihat stok ketik stok / list.').slice(0, 500),
    auto_reply_prompt: String(payload.auto_reply_prompt ?? current.auto_reply_prompt).slice(0, 2000),
    order_format: String(payload.order_format ?? current.order_format).slice(0, 300),
    features: {
      ...current.features,
      ...(payload.features && typeof payload.features === 'object' ? payload.features : {}),
    },
  };

  await setSetting('bot_settings', next);
  return next;
}
