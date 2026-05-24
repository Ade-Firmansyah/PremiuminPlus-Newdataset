import { execute, query } from '../config/db.js';

export const BOT_TEMPLATE_THEMES = ['theme_1', 'theme_2', 'theme_3', 'theme_4', 'theme_5'];

export const DEFAULT_BOT_TEMPLATE = {
  active_theme: 'theme_1',
  store_name: 'Premiumin Pluus',
  opening_hour: '08.00',
  closing_hour: '22.00',
  admin_whatsapp: '',
  footer_text: 'Premiumin Pluus',
};

function normalizeRow(row, fallback = {}) {
  return {
    id: row?.id || null,
    user_id: Number(row?.user_id || fallback.user_id || 0),
    active_theme: BOT_TEMPLATE_THEMES.includes(row?.active_theme) ? row.active_theme : DEFAULT_BOT_TEMPLATE.active_theme,
    store_name: row?.store_name || fallback.store_name || DEFAULT_BOT_TEMPLATE.store_name,
    opening_hour: row?.opening_hour || fallback.opening_hour || DEFAULT_BOT_TEMPLATE.opening_hour,
    closing_hour: row?.closing_hour || fallback.closing_hour || DEFAULT_BOT_TEMPLATE.closing_hour,
    admin_whatsapp: row?.admin_whatsapp || fallback.admin_whatsapp || DEFAULT_BOT_TEMPLATE.admin_whatsapp,
    footer_text: row?.footer_text || fallback.footer_text || DEFAULT_BOT_TEMPLATE.footer_text,
    created_at: row?.created_at || null,
    updated_at: row?.updated_at || null,
  };
}

export async function findBotTemplateByUserId(userId, fallback = {}) {
  const rows = await query('SELECT * FROM bot_template_settings WHERE user_id = ? LIMIT 1', [Number(userId)]);
  return normalizeRow(rows[0] || null, { ...fallback, user_id: Number(userId) });
}

export async function upsertBotTemplate(userId, payload = {}) {
  const data = normalizeRow({ ...payload, user_id: Number(userId) });
  const result = await execute(
    `INSERT INTO bot_template_settings
      (user_id, active_theme, store_name, opening_hour, closing_hour, admin_whatsapp, footer_text)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      active_theme = VALUES(active_theme),
      store_name = VALUES(store_name),
      opening_hour = VALUES(opening_hour),
      closing_hour = VALUES(closing_hour),
      admin_whatsapp = VALUES(admin_whatsapp),
      footer_text = VALUES(footer_text),
      updated_at = CURRENT_TIMESTAMP`,
    [
      Number(userId),
      data.active_theme,
      data.store_name,
      data.opening_hour,
      data.closing_hour,
      data.admin_whatsapp,
      data.footer_text,
    ],
  );

  const id = result.insertId || userId;
  const rows = await query('SELECT * FROM bot_template_settings WHERE user_id = ? OR id = ? LIMIT 1', [Number(userId), Number(id)]);
  return normalizeRow(rows[0] || null, { ...data, user_id: Number(userId) });
}

