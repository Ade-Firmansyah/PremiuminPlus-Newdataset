import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { query, transaction } from '../../config/db.js';
import { safeCreateActivityLog } from '../../repositories/activity.repo.js';
import { deleteCachePrefix } from '../../services/cache.service.js';
import { getMaintenanceStatus, setMaintenanceStatus } from '../../services/system-maintenance.service.js';

const BACKUP_TABLES = [
  'settings',
  'users',
  'products',
  'product_stock_items',
  'deposits',
  'payments',
  'orders',
  'withdraws',
  'transactions',
  'saldo_logs',
  'saldo_mutations',
  'balance_mutations',
  'notifications',
  'finance_daily_summaries',
  'reseller_bot_settings',
  'activity_logs',
  'admin_logs',
  'webhook_logs',
  'provider_logs',
];

const CORE_RESTORE_TABLES = [
  'settings',
  'users',
  'products',
  'product_stock_items',
  'deposits',
  'payments',
  'orders',
  'withdraws',
  'transactions',
  'saldo_logs',
  'saldo_mutations',
  'notifications',
  'finance_daily_summaries',
  'reseller_bot_settings',
];

const JSON_COLUMNS = new Set([
  'products.raw_response',
  'transactions.account_data',
  'transactions.accounts',
  'transactions.external_order_response',
  'transactions.external_status_response',
  'transactions.metadata',
  'payments.raw_response',
  'payments.status_response',
  'deposits.external_response',
  'deposits.external_status_response',
  'orders.raw_response',
  'saldo_mutations.metadata',
  'settings.setting_value',
  'settings.value',
  'activity_logs.metadata',
  'finance_daily_summaries.metadata',
  'balance_mutations.metadata',
  'admin_logs.metadata',
  'webhook_logs.payload',
  'provider_logs.metadata',
]);

const REQUIRED_ZIP_FILES = ['database.sql', 'backup.json', 'settings.json', 'metadata.json', 'backup_info.json', 'checksums.json'];
const restoreJobs = new Map();

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function quoteId(value) {
  if (!BACKUP_TABLES.includes(value)) throw new Error(`Table tidak diizinkan: ${value}`);
  return `\`${value}\``;
}

function backupName(extension = 'zip') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  return `premiuminplus-backup-${stamp}.${extension}`;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimeDate(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = Math.max(date.getFullYear() - 1980, 0);
  const dosDate = (year << 9) | (month << 5) | day;
  return { time, date: dosDate };
}

function writeUInt16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function writeUInt32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const now = dosTimeDate();

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data || ''), 'utf8');
    const crc = crc32(data);
    const localHeader = Buffer.concat([
      writeUInt32(0x04034b50),
      writeUInt16(20),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(now.time),
      writeUInt16(now.date),
      writeUInt32(crc),
      writeUInt32(data.length),
      writeUInt32(data.length),
      writeUInt16(name.length),
      writeUInt16(0),
      name,
    ]);
    localParts.push(localHeader, data);

    const centralHeader = Buffer.concat([
      writeUInt32(0x02014b50),
      writeUInt16(20),
      writeUInt16(20),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(now.time),
      writeUInt16(now.date),
      writeUInt32(crc),
      writeUInt32(data.length),
      writeUInt32(data.length),
      writeUInt16(name.length),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(0),
      writeUInt32(offset),
      name,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.concat([
    writeUInt32(0x06054b50),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(files.length),
    writeUInt16(files.length),
    writeUInt32(centralDirectory.length),
    writeUInt32(offset),
    writeUInt16(0),
  ]);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (value instanceof Date) return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function isValidJsonText(value) {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function normalizeRestoreValue(value, table, column) {
  if (value === null || value === undefined) return value;
  if (JSON_COLUMNS.has(`${table}.${column}`)) {
    if (typeof value === 'string') return isValidJsonText(value) ? value : JSON.stringify(value);
    return JSON.stringify(value);
  }
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    return value.slice(0, 19).replace('T', ' ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function buildDatabaseSql(tables) {
  const lines = [
    '-- Premiumin Plus backup SQL',
    `-- Created at ${new Date().toISOString()}`,
    '-- Safe import mode: direct upsert only.',
    'SET FOREIGN_KEY_CHECKS=0;',
  ];

  for (const table of BACKUP_TABLES) {
    const rows = Array.isArray(tables[table]) ? tables[table] : [];
    for (const row of rows) {
      const columns = Object.keys(row);
      if (!columns.length) continue;
      const columnSql = columns.map((column) => `\`${column.replace(/`/g, '')}\``).join(', ');
      const valueSql = columns.map((column) => sqlLiteral(row[column])).join(', ');
      const updateSql = columns
        .filter((column) => column !== 'id')
        .map((column) => `\`${column.replace(/`/g, '')}\` = VALUES(\`${column.replace(/`/g, '')}\`)`)
        .join(', ');
      lines.push(`INSERT INTO \`${table}\` (${columnSql}) VALUES (${valueSql})${updateSql ? ` ON DUPLICATE KEY UPDATE ${updateSql}` : ''};`);
    }
  }

  lines.push('SET FOREIGN_KEY_CHECKS=1;');
  return `${lines.join('\n')}\n`;
}

async function buildChecksums(tables) {
  const saldoSum = (tables.users || []).reduce((total, user) => total + Number(user.saldo || 0), 0);
  return {
    users_count: tables.users?.length || 0,
    products_count: tables.products?.length || 0,
    orders_count: tables.orders?.length || 0,
    transactions_count: tables.transactions?.length || 0,
    saldo_mutations_count: tables.saldo_mutations?.length || 0,
    balance_mutations_count: tables.balance_mutations?.length || 0,
    reseller_bot_settings_count: tables.reseller_bot_settings?.length || 0,
    settings_count: tables.settings?.length || 0,
    saldo_total: saldoSum,
    saldo_sum: saldoSum,
    created_at: new Date().toISOString(),
  };
}

function summarizeObject(backup = {}) {
  const tables = backup.tables && typeof backup.tables === 'object' ? backup.tables : {};
  return BACKUP_TABLES.reduce((summary, table) => {
    summary[table] = Array.isArray(tables[table]) ? tables[table].length : 0;
    return summary;
  }, {});
}

function summarize(backup = {}) {
  const summary = summarizeObject(backup);
  return BACKUP_TABLES.map((table) => ({ table, rows: summary[table] || 0 }));
}

function sanitizeErrorMessage(error) {
  return String(error?.message || error || 'Restore gagal')
    .replace(/api_[a-z0-9_]+/gi, 'api_***')
    .replace(/[a-f0-9]{32,}/gi, '***');
}

function validateBackupPayload(backup) {
  if (!backup || typeof backup !== 'object') {
    const error = new Error('Backup JSON tidak valid.');
    error.statusCode = 400;
    throw error;
  }
  if (!backup.tables || typeof backup.tables !== 'object') {
    const error = new Error('backup.json wajib memiliki object tables.');
    error.statusCode = 400;
    throw error;
  }

  const missingTables = CORE_RESTORE_TABLES.filter((table) => !Array.isArray(backup.tables[table]));
  if (missingTables.length) {
    const error = new Error(`Backup table tidak lengkap: ${missingTables.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  for (const table of BACKUP_TABLES) {
    if (!Array.isArray(backup.tables[table])) backup.tables[table] = [];
  }

  const summary = summarizeObject(backup);
  const checksums = backup.checksums || {};
  const expected = {
    users: Number(checksums.users_count ?? summary.users),
    products: Number(checksums.products_count ?? summary.products),
    orders: Number(checksums.orders_count ?? summary.orders),
    transactions: Number(checksums.transactions_count ?? summary.transactions),
    settings: Number(checksums.settings_count ?? summary.settings),
  };
  const mismatch = [];
  if (expected.users !== summary.users) mismatch.push(`users ${summary.users}/${expected.users}`);
  if (expected.products !== summary.products) mismatch.push(`products ${summary.products}/${expected.products}`);
  if (expected.orders !== summary.orders) mismatch.push(`orders ${summary.orders}/${expected.orders}`);
  if (expected.transactions !== summary.transactions) mismatch.push(`transactions ${summary.transactions}/${expected.transactions}`);
  if (expected.settings !== summary.settings) mismatch.push(`settings ${summary.settings}/${expected.settings}`);
  if (mismatch.length) {
    const error = new Error(`Checksum count mismatch: ${mismatch.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  return summary;
}

function extractZipBackup(buffer) {
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch (_error) {
    const error = new Error('Backup ZIP tidak valid atau rusak.');
    error.statusCode = 400;
    throw error;
  }
  const entries = new Map(zip.getEntries().map((entry) => [entry.entryName.replace(/\\/g, '/'), entry]));
  const missing = REQUIRED_ZIP_FILES.filter((name) => !entries.has(name));
  if (missing.length) {
    const error = new Error(`Backup ZIP tidak lengkap: ${missing.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  let backup;
  let metadata;
  let backupInfo;
  let checksums;
  try {
    const backupJson = entries.get('backup.json').getData().toString('utf8');
    backup = JSON.parse(backupJson);
    metadata = entries.has('metadata.json') ? JSON.parse(entries.get('metadata.json').getData().toString('utf8')) : backup.metadata;
    backupInfo = entries.has('backup_info.json') ? JSON.parse(entries.get('backup_info.json').getData().toString('utf8')) : backup.backup_info;
    checksums = entries.has('checksums.json') ? JSON.parse(entries.get('checksums.json').getData().toString('utf8')) : null;
  } catch (_error) {
    const error = new Error('Backup ZIP memiliki JSON yang tidak valid.');
    error.statusCode = 400;
    throw error;
  }

  return {
    backup: {
      ...backup,
      metadata: backup.metadata || metadata,
      backup_info: backup.backup_info || backupInfo,
      checksums: backup.checksums || checksums,
    },
    files: Array.from(entries.keys()),
  };
}

function readUploadBuffer(body = {}) {
  const raw = body.zip_base64 || body.file_base64 || body.backup_zip_base64 || body.data;
  if (!raw || typeof raw !== 'string') {
    const error = new Error('File ZIP backup wajib dikirim sebagai base64.');
    error.statusCode = 400;
    throw error;
  }
  const base64 = raw.includes(',') ? raw.split(',').pop() : raw;
  return Buffer.from(base64, 'base64');
}

function makeJob({ type = 'restore', createdBy = null, backup = null, files = [] }) {
  const now = new Date().toISOString();
  const id = `${type}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
  const job = {
    id,
    type,
    status: 'pending',
    progress: 0,
    message: 'Upload tervalidasi. Menunggu konfirmasi restore.',
    logs: [
      `[${now}] Upload diterima`,
      `[${now}] Extract ZIP`,
      `[${now}] Validasi struktur`,
      `[${now}] Membaca backup.json`,
      `[${now}] Membaca checksums`,
      `[${now}] Preview data`,
      `[${now}] Menunggu konfirmasi`,
    ],
    created_by: createdBy,
    created_at: now,
    updated_at: now,
    completed_at: null,
    failed_at: null,
    backup,
    files,
    preview: summarize(backup),
    preview_counts: summarizeObject(backup),
    result: null,
  };
  restoreJobs.set(id, job);
  return job;
}

function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    message: job.message,
    logs: job.logs,
    created_by: job.created_by,
    created_at: job.created_at,
    updated_at: job.updated_at,
    completed_at: job.completed_at,
    failed_at: job.failed_at,
    files: job.files,
    preview: job.preview,
    preview_counts: job.preview_counts,
    metadata: job.backup?.metadata || null,
    backup_info: job.backup?.backup_info || null,
    checksums: job.backup?.checksums || null,
    result: job.result || null,
  };
}

function updateJob(job, progress, message) {
  const now = new Date().toISOString();
  job.progress = Math.max(0, Math.min(100, Number(progress || 0)));
  job.message = message;
  job.updated_at = now;
  job.logs.push(`[${now}] ${message}`);
}

async function countRestoredState(backup) {
  const summary = summarizeObject(backup);
  const result = {};
  for (const table of BACKUP_TABLES) {
    const backupRows = summary[table] || 0;
    const [row] = await query(`SELECT COUNT(*) AS total FROM ${quoteId(table)}`);
    result[table] = {
      backup: backupRows,
      database: Number(row?.total || 0),
      ok: Number(row?.total || 0) === backupRows,
    };
  }

  const [saldoRow] = await query('SELECT COALESCE(SUM(saldo), 0) AS saldo_total FROM users');
  const backupSaldo = Number(backup.checksums?.saldo_total ?? backup.checksums?.saldo_sum ?? 0);
  result.saldo_total = {
    backup: backupSaldo,
    database: Number(saldoRow?.saldo_total || 0),
    ok: Math.abs(Number(saldoRow?.saldo_total || 0) - backupSaldo) < 0.01,
  };
  const [apiKeyMissingRow] = await query("SELECT COUNT(*) AS total FROM users WHERE api_key IS NULL OR api_key = ''");
  const [adminRow] = await query("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'");
  const [settingsRow] = await query('SELECT COUNT(*) AS total FROM settings');
  const [activeProductRow] = await query("SELECT COUNT(*) AS total FROM products WHERE status IN ('active', 'Aktif', 'ready')");
  const [invalidProductSourceRow] = await query("SELECT COUNT(*) AS total FROM products WHERE product_source NOT IN ('provider', 'manual', 'hybrid') OR product_source IS NULL");
  const [fatalNullUserRow] = await query("SELECT COUNT(*) AS total FROM users WHERE username IS NULL OR username = '' OR role IS NULL OR saldo IS NULL");
  const [fatalNullProductRow] = await query("SELECT COUNT(*) AS total FROM products WHERE code IS NULL OR code = '' OR name IS NULL OR name = ''");
  const backupActiveProducts = (backup.tables.products || []).filter((product) => ['active', 'Aktif', 'ready'].includes(String(product.status || ''))).length;

  result.api_keys = { backup: 0, database: Number(apiKeyMissingRow?.total || 0), ok: Number(apiKeyMissingRow?.total || 0) === 0 };
  result.admin_user = { backup: 1, database: Number(adminRow?.total || 0), ok: Number(adminRow?.total || 0) >= 1 };
  result.settings_present = { backup: summary.settings || 0, database: Number(settingsRow?.total || 0), ok: Number(settingsRow?.total || 0) >= 1 };
  result.active_products = { backup: backupActiveProducts, database: Number(activeProductRow?.total || 0), ok: backupActiveProducts === 0 || Number(activeProductRow?.total || 0) >= 1 };
  result.product_source = { backup: 0, database: Number(invalidProductSourceRow?.total || 0), ok: Number(invalidProductSourceRow?.total || 0) === 0 };
  result.null_fatal = {
    backup: 0,
    database: Number(fatalNullUserRow?.total || 0) + Number(fatalNullProductRow?.total || 0),
    ok: Number(fatalNullUserRow?.total || 0) + Number(fatalNullProductRow?.total || 0) === 0,
  };
  return result;
}

async function restoreBackupData(backup, onProgress = () => {}) {
  validateBackupPayload(backup);
  await transaction(async (connection) => {
    await connection.query('SET FOREIGN_KEY_CHECKS=0');
    try {
      let index = 0;
      for (const table of BACKUP_TABLES) {
        index += 1;
        const rows = Array.isArray(backup.tables?.[table]) ? backup.tables[table] : [];
        onProgress(8 + Math.round((index / BACKUP_TABLES.length) * 82), `Restore ${table}`);
        for (const row of rows) {
          const columns = Object.keys(row);
          if (!columns.length) continue;
          const columnSql = columns.map((column) => `\`${column.replace(/`/g, '')}\``).join(', ');
          const placeholders = columns.map(() => '?').join(', ');
          const updateSql = columns
            .filter((column) => column !== 'id')
            .map((column) => `\`${column.replace(/`/g, '')}\` = VALUES(\`${column.replace(/`/g, '')}\`)`)
            .join(', ');
          await connection.query(
            `INSERT INTO ${quoteId(table)} (${columnSql}) VALUES (${placeholders})${updateSql ? ` ON DUPLICATE KEY UPDATE ${updateSql}` : ''}`,
            columns.map((column) => normalizeRestoreValue(row[column], table, column)),
          );
        }
      }
    } finally {
      await connection.query('SET FOREIGN_KEY_CHECKS=1');
    }
  });
}

export async function downloadSystemBackup(_req, res, next) {
  try {
    const tables = {};
    const missingTables = [];
    for (const table of BACKUP_TABLES) {
      try {
        tables[table] = await query(`SELECT * FROM ${quoteId(table)}`);
      } catch (error) {
        if (['ER_NO_SUCH_TABLE', 'ER_BAD_TABLE_ERROR'].includes(error?.code)) {
          missingTables.push(table);
          tables[table] = [];
          continue;
        }
        throw error;
      }
    }

    const metadata = {
      app: 'premiumin-plus',
      version: '3.2.2',
      created_at: new Date().toISOString(),
      format: 'zip-json-sql-v1',
      source_backend: process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_URL || null,
    };
    const backupInfo = {
      app: 'Premiumin Plus',
      version: '3.2.2',
      created_at: metadata.created_at,
      source_backend: metadata.source_backend,
      tables: BACKUP_TABLES,
      required_tables: BACKUP_TABLES,
      missing_tables: missingTables,
      optional_runtime_tables: ['realtime_cache', 'websocket_events', 'polling_logs', 'temp_notifications'],
      excluded_runtime_paths: ['node_modules', 'dist', '.vite', 'cache', 'logs', 'apps/bot-engine/sessions'],
    };
    const checksums = await buildChecksums(tables);
    const backup = {
      metadata,
      backup_info: backupInfo,
      checksums,
      tables,
    };

    const zip = createZip([
      { name: 'database.sql', data: buildDatabaseSql(tables) },
      { name: 'backup.json', data: JSON.stringify(backup, null, 2) },
      { name: 'settings.json', data: JSON.stringify({ settings: tables.settings || [] }, null, 2) },
      { name: 'metadata.json', data: JSON.stringify(metadata, null, 2) },
      { name: 'backup_info.json', data: JSON.stringify(backupInfo, null, 2) },
      { name: 'checksums.json', data: JSON.stringify(checksums, null, 2) },
    ]);

    res.setHeader('content-type', 'application/zip');
    res.setHeader('content-disposition', `attachment; filename="${backupName('zip')}"`);
    res.send(zip);
  } catch (error) {
    next(error);
  }
}

export async function getSystemStatus(_req, res, next) {
  try {
    const status = await getMaintenanceStatus();
    res.json({
      status: true,
      success: true,
      data: {
        maintenance: status.enabled,
        message: status.enabled ? status.message : undefined,
        started_at: status.started_at,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminMaintenance(_req, res, next) {
  try {
    const data = await getMaintenanceStatus({ fresh: true });
    res.json({ status: true, success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function patchAdminMaintenance(req, res, next) {
  try {
    const data = await setMaintenanceStatus({
      enabled: Boolean(req.body?.enabled),
      message: req.body?.message,
      adminId: req.user?.id || null,
    });
    await safeCreateActivityLog({
      actor_id: req.user?.id || null,
      scope: 'SYSTEM',
      message: data.enabled ? 'maintenance_enabled' : 'maintenance_disabled',
      metadata: { message: data.message },
      ip_address: req.ip,
    });
    res.json({
      status: true,
      success: true,
      message: data.enabled ? 'Maintenance mode berhasil diaktifkan.' : 'Maintenance mode berhasil dinonaktifkan.',
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadRestoreBackup(req, res, next) {
  try {
    const buffer = readUploadBuffer(req.body);
    const { backup, files } = extractZipBackup(buffer);
    validateBackupPayload(backup);
    const job = makeJob({
      type: 'restore',
      createdBy: req.user?.id || null,
      backup,
      files,
    });
    res.status(201).json({
      status: true,
      success: true,
      mode: 'preview',
      message: 'Backup berhasil divalidasi. Menunggu konfirmasi restore.',
      data: publicJob(job),
    });
  } catch (error) {
    next(error);
  }
}

export async function getRestoreJobStatus(req, res, next) {
  try {
    const job = restoreJobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ status: false, success: false, message: 'Restore job tidak ditemukan' });
    return res.json({ status: true, success: true, data: publicJob(job) });
  } catch (error) {
    return next(error);
  }
}

export async function confirmRestoreJob(req, res, next) {
  try {
    const job = restoreJobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ status: false, success: false, message: 'Restore job tidak ditemukan' });
    if (job.status === 'running') return res.status(409).json({ status: false, success: false, message: 'Restore job sedang berjalan' });
    if (['completed', 'completed_with_warning'].includes(job.status)) return res.json({ status: true, success: true, data: publicJob(job) });

    job.status = 'running';
    updateJob(job, 3, 'Restore dikonfirmasi');
    void (async () => {
      try {
        await restoreBackupData(job.backup, (progress, message) => updateJob(job, progress, message));
        updateJob(job, 94, 'Clear cache');
        deleteCachePrefix('');
        updateJob(job, 98, 'Validasi hasil');
        const validation = await countRestoredState(job.backup);
        const warnings = Object.entries(validation)
          .filter(([, item]) => item && item.ok === false)
          .map(([table, item]) => `${table}: database ${item.database}, backup ${item.backup}`);
        job.result = {
          validation,
          warnings,
          checklist: {
            users: validation.users?.ok === true,
            products: validation.products?.ok === true,
            settings: validation.settings?.ok === true,
            finance: validation.transactions?.ok === true && validation.saldo_mutations?.ok === true,
            orders: validation.orders?.ok === true,
            bot_settings: validation.reseller_bot_settings?.ok === true,
            maintenance: validation.settings_present?.ok === true,
            api_keys: validation.api_keys?.ok === true,
            product_source: validation.product_source?.ok === true,
            manual_stock: validation.product_stock_items?.ok === true,
            no_null_fatal: validation.null_fatal?.ok === true,
          },
        };
        job.status = warnings.length ? 'completed_with_warning' : 'completed';
        job.completed_at = new Date().toISOString();
        updateJob(job, 100, warnings.length ? `FAILED - validasi warning: ${warnings.join('; ')}` : 'SUCCESS - Restore berhasil. Semua data sudah diterapkan.');
        await safeCreateActivityLog({
          actor_id: req.user?.id || null,
          scope: 'SYSTEM',
          message: 'restore_completed',
          metadata: { job_id: job.id, tables: summarize(job.backup) },
          ip_address: req.ip,
        });
      } catch (error) {
        job.status = 'failed';
        job.failed_at = new Date().toISOString();
        updateJob(job, job.progress || 1, sanitizeErrorMessage(error));
      }
    })();

    return res.json({
      status: true,
      success: true,
      message: 'Restore dimulai. Pantau progress job.',
      data: publicJob(job),
    });
  } catch (error) {
    return next(error);
  }
}

export async function restoreSystemBackup(req, res, next) {
  try {
    const backup = req.body?.backup && typeof req.body.backup === 'object' ? req.body.backup : req.body;
    validateBackupPayload(backup);
    const summary = summarize(backup);

    if (!req.body?.confirm) {
      return res.json({
        status: true,
        mode: 'preview',
        data: summary,
        message: 'Preview selesai. Untuk apply data, gunakan upload ZIP lalu confirm restore job.',
      });
    }

    return res.status(409).json({
      status: false,
      success: false,
      mode: 'upload_required',
      data: summary,
      message: 'Restore langsung dinonaktifkan untuk keamanan. Gunakan upload ZIP, preview, lalu confirm restore job.',
    });
  } catch (error) {
    next(error);
  }
}
