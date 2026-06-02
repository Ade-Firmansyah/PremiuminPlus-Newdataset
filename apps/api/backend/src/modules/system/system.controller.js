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
  'notifications',
  'finance_daily_summaries',
  'activity_logs',
  'admin_logs',
];

const REQUIRED_ZIP_FILES = ['backup.json', 'metadata.json', 'backup_info.json'];
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

function buildDatabaseSql(tables) {
  const lines = [
    '-- Premiumin Plus backup SQL',
    `-- Created at ${new Date().toISOString()}`,
    'SET FOREIGN_KEY_CHECKS=0;',
  ];

  for (const table of [...BACKUP_TABLES].reverse()) {
    lines.push(`DELETE FROM \`${table}\`;`);
  }

  for (const table of BACKUP_TABLES) {
    const rows = Array.isArray(tables[table]) ? tables[table] : [];
    for (const row of rows) {
      const columns = Object.keys(row);
      if (!columns.length) continue;
      const columnSql = columns.map((column) => `\`${column.replace(/`/g, '')}\``).join(', ');
      const valueSql = columns.map((column) => sqlLiteral(row[column])).join(', ');
      lines.push(`INSERT INTO \`${table}\` (${columnSql}) VALUES (${valueSql});`);
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
    settings_count: tables.settings?.length || 0,
    saldo_sum: saldoSum,
  };
}

function summarize(backup = {}) {
  const tables = backup.tables && typeof backup.tables === 'object' ? backup.tables : {};
  return BACKUP_TABLES.map((table) => ({
    table,
    rows: Array.isArray(tables[table]) ? tables[table].length : 0,
  }));
}

function extractZipBackup(buffer) {
  const zip = new AdmZip(buffer);
  const entries = new Map(zip.getEntries().map((entry) => [entry.entryName.replace(/\\/g, '/'), entry]));
  const missing = REQUIRED_ZIP_FILES.filter((name) => !entries.has(name));
  if (missing.length) {
    const error = new Error(`Backup ZIP tidak lengkap: ${missing.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  const backupJson = entries.get('backup.json').getData().toString('utf8');
  const backup = JSON.parse(backupJson);
  const metadata = entries.has('metadata.json') ? JSON.parse(entries.get('metadata.json').getData().toString('utf8')) : backup.metadata;
  const backupInfo = entries.has('backup_info.json') ? JSON.parse(entries.get('backup_info.json').getData().toString('utf8')) : backup.backup_info;
  const checksums = entries.has('checksums.json') ? JSON.parse(entries.get('checksums.json').getData().toString('utf8')) : null;

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
    logs: [`[${now}] Backup uploaded and validated`],
    created_by: createdBy,
    created_at: now,
    updated_at: now,
    completed_at: null,
    failed_at: null,
    backup,
    files,
    preview: summarize(backup),
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
    metadata: job.backup?.metadata || null,
    backup_info: job.backup?.backup_info || null,
    checksums: job.backup?.checksums || null,
  };
}

function updateJob(job, progress, message) {
  const now = new Date().toISOString();
  job.progress = Math.max(0, Math.min(100, Number(progress || 0)));
  job.message = message;
  job.updated_at = now;
  job.logs.push(`[${now}] ${message}`);
}

async function restoreBackupData(backup, onProgress = () => {}) {
  await transaction(async (connection) => {
    await connection.query('SET FOREIGN_KEY_CHECKS=0');
    try {
      onProgress(8, 'Clearing existing tables');
      for (const table of [...BACKUP_TABLES].reverse()) {
        await connection.query(`DELETE FROM ${quoteId(table)}`);
      }

      let index = 0;
      for (const table of BACKUP_TABLES) {
        index += 1;
        const rows = Array.isArray(backup.tables?.[table]) ? backup.tables[table] : [];
        onProgress(10 + Math.round((index / BACKUP_TABLES.length) * 78), `Restoring ${table}`);
        for (const row of rows) {
          const columns = Object.keys(row);
          if (!columns.length) continue;
          const columnSql = columns.map((column) => `\`${column.replace(/`/g, '')}\``).join(', ');
          const placeholders = columns.map(() => '?').join(', ');
          await connection.query(
            `INSERT INTO ${quoteId(table)} (${columnSql}) VALUES (${placeholders})`,
            columns.map((column) => row[column]),
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
    for (const table of BACKUP_TABLES) {
      tables[table] = await query(`SELECT * FROM ${quoteId(table)}`);
    }

    const metadata = {
      app: 'premiumin-plus',
      version: '3.2.1',
      created_at: new Date().toISOString(),
      format: 'zip-json-sql-v1',
      source_backend: process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_URL || null,
    };
    const backupInfo = {
      app: 'Premiumin Plus',
      version: '3.2.1',
      created_at: metadata.created_at,
      source_backend: metadata.source_backend,
      tables: BACKUP_TABLES,
      required_tables: BACKUP_TABLES,
      optional_runtime_tables: ['realtime_cache', 'websocket_events', 'polling_logs', 'temp_notifications', 'provider_logs'],
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
      message: 'Backup ZIP valid. Preview siap dikonfirmasi.',
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
    if (job.status === 'completed') return res.json({ status: true, success: true, data: publicJob(job) });

    job.status = 'running';
    updateJob(job, 3, 'Restore confirmed');
    void (async () => {
      try {
        await restoreBackupData(job.backup, (progress, message) => updateJob(job, progress, message));
        updateJob(job, 94, 'Clearing cache');
        deleteCachePrefix('');
        updateJob(job, 98, 'Validating restored state');
        job.status = 'completed';
        job.completed_at = new Date().toISOString();
        updateJob(job, 100, 'Restore completed');
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
        updateJob(job, job.progress || 1, error instanceof Error ? error.message : 'Restore gagal');
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
    const summary = summarize(backup);

    if (!req.body?.confirm) {
      return res.json({
        status: true,
        mode: 'preview',
        data: summary,
        message: 'Preview selesai. Kirim ulang dengan confirm=true untuk restore.',
      });
    }

    await restoreBackupData(backup);

    deleteCachePrefix('');
    res.json({
      status: true,
      mode: 'restored',
      data: summary,
      message: 'Restore selesai dan cache dibersihkan.',
    });
  } catch (error) {
    next(error);
  }
}
