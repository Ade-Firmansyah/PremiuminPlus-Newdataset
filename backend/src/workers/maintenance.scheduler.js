import { execute, query } from '../config/db.js';
import { logger } from '../utils/logger.js';
import { publishStockChanged } from '../services/product-events.service.js';
import { premkuCancelPay, premkuPayStatus } from '../services/premku.service.js';
import { toMysqlDate } from '../utils/date.js';
import { updateDepositStatus } from '../modules/deposit/deposit.service.js';
import { syncPaymentStatusFromWebhook } from '../modules/payment/payment.service.js';

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 7;
const QR_EXPIRY_MS = 30 * 60 * 1000;
let schedulerHandle = null;

function normalizePayStatus(payload) {
  const status = String(
    payload?.pay_status ??
      payload?.data?.pay_status ??
      payload?.payment_status ??
      payload?.data?.payment_status ??
      payload?.transaction_status ??
      payload?.data?.transaction_status ??
      payload?.status_pembayaran ??
      payload?.data?.status_pembayaran ??
      payload?.status_bayar ??
      payload?.data?.status_bayar ??
      payload?.data?.status ??
      (typeof payload?.status === 'string' ? payload.status : payload) ??
      '',
  ).toLowerCase();
  if (['success', 'sukses', 'paid'].includes(status)) return 'success';
  if (['canceled', 'cancelled', 'cancel'].includes(status)) return 'canceled';
  if (['expired', 'expire'].includes(status)) return 'expired';
  if (['failed', 'fail', 'gagal', 'error'].includes(status)) return 'failed';
  return 'pending';
}

function nextExpiryFromNow() {
  return toMysqlDate(new Date(Date.now() + QR_EXPIRY_MS));
}

async function markExpiredInvoices() {
  let expiredPaymentCount = 0;
  const expiredDeposits = await query(
    `SELECT invoice
     FROM deposits
     WHERE status = 'pending' AND expired_at IS NOT NULL AND expired_at < NOW()`,
  );
  const expiredPaymentRows = await query(
    `SELECT invoice
     FROM payments
     WHERE status = 'pending' AND expired_at IS NOT NULL AND expired_at < NOW()`,
  );

  for (const item of expiredDeposits) {
    let statusResponse = null;
    let nextStatus = 'pending';
    try {
      statusResponse = await premkuPayStatus(item.invoice);
      nextStatus = normalizePayStatus(statusResponse);
    } catch (error) {
      logger('ERROR', {
        task: 'maintenance',
        type: 'premku_pay_status_failed',
        invoice: item.invoice,
        message: error instanceof Error ? error.message : 'Premku pay_status failed',
      });
      continue;
    }

    if (nextStatus === 'success') {
      await updateDepositStatus(item.invoice, 'success', statusResponse);
      continue;
    }

    if (nextStatus === 'pending') {
      await execute(
        `UPDATE deposits
         SET status = 'pending', expired_at = ?, external_status_response = CAST(? AS JSON), updated_at = CURRENT_TIMESTAMP
         WHERE invoice = ? AND status = 'pending'`,
        [nextExpiryFromNow(), JSON.stringify({ ...statusResponse, message: 'Premku masih menunggu pembayaran; expiry lokal diperpanjang' }), item.invoice],
      );
      continue;
    }

    try {
      await premkuCancelPay(item.invoice);
    } catch (error) {
      logger('ERROR', {
        task: 'maintenance',
        type: 'premku_cancel_pay_failed',
        invoice: item.invoice,
        message: error instanceof Error ? error.message : 'Premku cancel_pay failed',
      });
    }

    await execute(
      `UPDATE deposits
       SET status = ?, external_status_response = CAST(? AS JSON), updated_at = CURRENT_TIMESTAMP
       WHERE invoice = ? AND status = 'pending'`,
      [nextStatus, JSON.stringify(statusResponse ?? null), item.invoice],
    );
  }

  for (const item of expiredPaymentRows) {
    let statusResponse = null;
    let nextStatus = 'pending';
    try {
      statusResponse = await premkuPayStatus(item.invoice);
      nextStatus = normalizePayStatus(statusResponse);
    } catch (error) {
      logger('ERROR', {
        task: 'maintenance',
        type: 'premku_pay_status_failed',
        invoice: item.invoice,
        message: error instanceof Error ? error.message : 'Premku pay_status failed',
      });
      continue;
    }

    if (nextStatus === 'success') {
      await syncPaymentStatusFromWebhook(item.invoice, statusResponse);
      continue;
    }

    if (nextStatus === 'pending') {
      await execute(
        `UPDATE payments
         SET status = 'pending', expired_at = ?, status_response = CAST(? AS JSON), updated_at = CURRENT_TIMESTAMP
         WHERE invoice = ? AND status = 'pending'`,
        [nextExpiryFromNow(), JSON.stringify({ ...statusResponse, message: 'Premku masih menunggu pembayaran; expiry lokal diperpanjang' }), item.invoice],
      );
      continue;
    }

    try {
      await premkuCancelPay(item.invoice);
    } catch (error) {
      logger('ERROR', {
        task: 'maintenance',
        type: 'premku_cancel_pay_failed',
        invoice: item.invoice,
        message: error instanceof Error ? error.message : 'Premku cancel_pay failed',
      });
    }

    await execute(
      `UPDATE payments
       SET status = ?, status_response = CAST(? AS JSON), updated_at = CURRENT_TIMESTAMP
       WHERE invoice = ? AND status = 'pending'`,
      [nextStatus, JSON.stringify(statusResponse ?? null), item.invoice],
    );
    expiredPaymentCount += 1;
  }

  const expiredPayments = { affectedRows: expiredPaymentCount };

  if (expiredPayments?.affectedRows) {
    await execute(
      `UPDATE manual_product_accounts a
       JOIN payments p ON p.reserved_manual_account_id = a.id
       SET a.status = 'available', a.reserved_by = NULL, a.reserved_at = NULL
       WHERE p.status = 'expired' AND a.status = 'reserved'`,
    );
    await execute(
      `UPDATE products p
       SET manual_stock = (
         SELECT COUNT(*) FROM manual_product_accounts a
         WHERE a.product_id = p.id AND a.status = 'available'
       ),
       stock = CASE
         WHEN stock_mode = 'manual' THEN (
          SELECT COUNT(*) FROM manual_product_accounts a
          WHERE a.product_id = p.id AND a.status = 'available'
         )
         WHEN stock_mode = 'combined' THEN provider_stock + (
          SELECT COUNT(*) FROM manual_product_accounts a
          WHERE a.product_id = p.id AND a.status = 'available'
         )
         ELSE provider_stock + (
          SELECT COUNT(*) FROM manual_product_accounts a
          WHERE a.product_id = p.id AND a.status = 'available'
         )
       END`,
    );
    publishStockChanged();
  }
}

/**
 * Cleanup hanya untuk data sementara/non-critical.
 * Ledger dan riwayat transaksi permanen tidak boleh dihapus otomatis.
 */
async function cleanupTemporaryLogs(retentionDays) {
  try {
    const webhookDeleted = await execute(
      'DELETE FROM webhook_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
      [retentionDays],
    );
    logger('SYSTEM', {
      task: 'maintenance',
      type: 'webhook_logs_cleanup',
      rows_deleted: webhookDeleted?.affectedRows || 0,
      retention_days: retentionDays,
    });

    const activityDeleted = await execute(
      `DELETE FROM activity_logs
       WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
         AND scope IN ('SYSTEM', 'PREMKU', 'PAYMENT_STATUS', 'WEBHOOK', 'SCHEDULER')`,
      [retentionDays],
    );
    logger('SYSTEM', {
      task: 'maintenance',
      type: 'activity_logs_cleanup',
      rows_deleted: activityDeleted?.affectedRows || 0,
      retention_days: retentionDays,
    });

    await execute(
      `UPDATE deposits
       SET qr_data = NULL, qr_image = NULL
       WHERE status IN ('success', 'expired', 'failed', 'canceled')
         AND (qr_data IS NOT NULL OR qr_image IS NOT NULL)`,
    );
    await execute(
      `UPDATE payments
       SET qr_image = NULL, qr_raw = NULL
       WHERE status IN ('success', 'expired', 'failed', 'canceled')
         AND (qr_image IS NOT NULL OR qr_raw IS NOT NULL)`,
    );

    const optimizedTables = ['webhook_logs', 'activity_logs'];
    for (const table of optimizedTables) {
      await execute(`OPTIMIZE TABLE ${table}`);
    }

    return {
      success: true,
      webhook_logs_deleted: webhookDeleted?.affectedRows || 0,
      activity_logs_deleted: activityDeleted?.affectedRows || 0,
      permanent_tables_deleted: 0,
      optimized_tables: optimizedTables,
    };
  } catch (error) {
    logger('ERROR', {
      task: 'maintenance',
      type: 'cleanup_failed',
      message: error instanceof Error ? error.message : 'cleanup failed',
    });
    throw error;
  }
}

/**
 * Get database stats untuk monitoring
 * Dapat digunakan untuk alert jika database size > threshold
 */
async function getDatabaseStats() {
  try {
    const stats = await execute(`
      SELECT 
        (SELECT COUNT(*) FROM webhook_logs) as webhook_logs,
        (SELECT COUNT(*) FROM activity_logs) as activity_logs,
        (SELECT COUNT(*) FROM saldo_logs) as saldo_logs,
        (SELECT COUNT(*) FROM transactions) as transactions,
        (SELECT COUNT(*) FROM orders) as orders,
        (SELECT COUNT(*) FROM deposits) as deposits,
        (SELECT COUNT(*) FROM users) as users
    `);
    return stats[0] || {};
  } catch (error) {
    logger('ERROR', {
      task: 'database_stats',
      message: error instanceof Error ? error.message : 'stats query failed',
    });
    return {};
  }
}

export async function runMaintenanceOnce(retentionDays = DEFAULT_RETENTION_DAYS) {
  try {
    await markExpiredInvoices();
    const cleanupResult = await cleanupTemporaryLogs(retentionDays);
    const stats = await getDatabaseStats();

    logger('SYSTEM', {
      task: 'maintenance',
      status: 'completed',
      retention_days: retentionDays,
      cleanup: cleanupResult,
      database_stats: stats,
    });

    return cleanupResult;
  } catch (error) {
    logger('ERROR', {
      task: 'maintenance',
      message: error instanceof Error ? error.message : 'maintenance failed',
    });
    throw error;
  }
}

export function startMaintenanceScheduler({ intervalMs = HOUR_MS, retentionDays = DEFAULT_RETENTION_DAYS } = {}) {
  if (schedulerHandle) return schedulerHandle;

  runMaintenanceOnce(retentionDays).catch((error) => {
    logger('ERROR', { task: 'maintenance', message: error instanceof Error ? error.message : 'maintenance failed' });
  });

  const timer = setInterval(() => {
    runMaintenanceOnce(retentionDays).catch((error) => {
      logger('ERROR', { task: 'maintenance', message: error instanceof Error ? error.message : 'maintenance failed' });
    });
  }, intervalMs);

  timer.unref?.();
  schedulerHandle = {
    stop() {
      clearInterval(timer);
      schedulerHandle = null;
    },
  };
  return schedulerHandle;
}

export function stopMaintenanceScheduler() {
  schedulerHandle?.stop();
}
