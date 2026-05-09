import env from '../config/env.js';
import { execute } from '../config/db.js';
import { cacheStats } from './cache.service.js';
import { logger } from '../utils/logger.js';

let timer = null;
let running = false;

function clampPositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return fallback;
  return Math.floor(numeric);
}

async function expireStaleQrPayments() {
  const paymentResult = await execute(
    `UPDATE payments
     SET status = 'expired',
         qr_image = NULL,
         qr_raw = NULL,
         status_response = JSON_OBJECT('message', 'Expired by Premiumin Plus timer'),
         canceled_at = COALESCE(canceled_at, NOW()),
         updated_at = CURRENT_TIMESTAMP
     WHERE status = 'pending'
       AND expired_at IS NOT NULL
       AND expired_at <= NOW()`,
  );

  const depositResult = await execute(
    `UPDATE deposits
     SET status = 'expired',
         qr_data = NULL,
         qr_image = NULL,
         external_status_response = JSON_OBJECT('message', 'Expired by Premiumin Plus timer'),
         canceled_at = COALESCE(canceled_at, NOW()),
         updated_at = CURRENT_TIMESTAMP
     WHERE status = 'pending'
       AND expired_at IS NOT NULL
       AND expired_at <= NOW()`,
  );

  return {
    expired_payments: Number(paymentResult.affectedRows || 0),
    expired_deposits: Number(depositResult.affectedRows || 0),
  };
}

async function deleteOldOperationalHistory(retentionDays) {
  const interval = clampPositiveInteger(retentionDays, 7);
  await execute(
    `INSERT INTO finance_daily_summaries
       (summary_date, total_transactions, total_revenue, system_profit, reseller_profit)
     SELECT
       DATE(created_at) AS summary_date,
       COUNT(*) AS total_transactions,
       COALESCE(SUM(total_price), 0) AS total_revenue,
       COALESCE(SUM(profit), 0) AS system_profit,
       COALESCE(SUM(reseller_profit), 0) AS reseller_profit
     FROM transactions
     WHERE created_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY)
       AND transaction_type = 'order'
       AND status IN ('processing', 'success')
     GROUP BY DATE(created_at)
     ON DUPLICATE KEY UPDATE
       total_transactions = VALUES(total_transactions),
       total_revenue = VALUES(total_revenue),
       system_profit = VALUES(system_profit),
       reseller_profit = VALUES(reseller_profit)`,
  );
  await execute(
    `INSERT INTO finance_daily_summaries
       (summary_date, total_deposit_amount)
     SELECT
       DATE(created_at) AS summary_date,
       COALESCE(SUM(amount), 0) AS total_deposit_amount
     FROM deposits
     WHERE created_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY)
       AND status = 'success'
     GROUP BY DATE(created_at)
     ON DUPLICATE KEY UPDATE
       total_deposit_amount = VALUES(total_deposit_amount)`,
  );

  const deletionTargets = [
    ['transactions', `created_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY)`],
    ['saldo_mutations', `created_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY)`],
    ['payments', `created_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY) AND status IN ('success', 'failed', 'expired', 'canceled')`],
    ['deposits', `created_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY) AND status IN ('success', 'failed', 'expired', 'canceled')`],
    ['activity_logs', `created_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY)`],
    ['webhook_logs', `created_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY)`],
    ['websocket_events', `created_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY)`],
    ['temp_notifications', `created_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY)`],
    ['realtime_cache', `(expires_at IS NOT NULL AND expires_at < NOW()) OR created_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY)`],
    ['polling_logs', `created_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY)`],
  ];
  const deleted = {};

  for (const [table, condition] of deletionTargets) {
    const result = await execute(
      `DELETE FROM \`${table}\`
       WHERE ${condition}`,
    );
    deleted[table] = Number(result.affectedRows || 0);
  }

  return deleted;
}

export async function runMaintenanceNow() {
  if (running) return { skipped: true };
  running = true;
  try {
    const retentionDays = clampPositiveInteger(env.DATA_RETENTION_DAYS, 7);
    const expired = await expireStaleQrPayments();
    const deleted = await deleteOldOperationalHistory(retentionDays);
    const summary = { retention_days: retentionDays, ...expired, deleted, cache: cacheStats() };
    logger('CLEANUP', summary);
    return summary;
  } finally {
    running = false;
  }
}

export function startMaintenanceScheduler() {
  if (timer) return timer;

  const intervalMinutes = clampPositiveInteger(env.MAINTENANCE_INTERVAL_MINUTES, 1440);
  void runMaintenanceNow().catch((error) => {
    logger('ERROR', { scope: 'cleanup-initial', message: error?.message || error });
  });

  timer = setInterval(() => {
    void runMaintenanceNow().catch((error) => {
      logger('ERROR', { scope: 'cleanup-scheduled', message: error?.message || error });
    });
  }, intervalMinutes * 60 * 1000);
  timer.unref?.();
  return timer;
}
