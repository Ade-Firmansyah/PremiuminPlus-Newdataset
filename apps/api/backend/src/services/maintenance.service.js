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
     WHERE status IN ('pending', 'pending_payment')
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
     WHERE status IN ('pending', 'pending_payment')
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
       (summary_date, total_order, total_profit, metadata)
     SELECT
       DATE(created_at) AS summary_date,
       COALESCE(SUM(total_price), 0) AS total_order,
       COALESCE(SUM(profit), 0) AS total_profit,
       JSON_OBJECT('total_transactions', COUNT(*), 'reseller_profit', COALESCE(SUM(reseller_profit), 0)) AS metadata
     FROM transactions
     WHERE created_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY)
       AND transaction_type = 'order'
       AND status = 'success'
     GROUP BY DATE(created_at)
     ON DUPLICATE KEY UPDATE
       total_order = VALUES(total_order),
       total_profit = VALUES(total_profit),
       metadata = VALUES(metadata)`,
  );
  await execute(
    `INSERT INTO finance_daily_summaries
       (summary_date, total_deposit)
     SELECT
       DATE(created_at) AS summary_date,
       COALESCE(SUM(amount), 0) AS total_deposit
     FROM deposits
     WHERE created_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY)
       AND status = 'success'
     GROUP BY DATE(created_at)
     ON DUPLICATE KEY UPDATE
       total_deposit = VALUES(total_deposit)`,
  );
  await execute(
    `INSERT INTO finance_daily_summaries
       (summary_date, total_withdraw)
     SELECT
       DATE(updated_at) AS summary_date,
       COALESCE(SUM(amount), 0) AS total_withdraw
     FROM withdraws
     WHERE updated_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY)
       AND status = 'approved'
     GROUP BY DATE(updated_at)
     ON DUPLICATE KEY UPDATE
       total_withdraw = VALUES(total_withdraw)`,
  );

  const deletionTargets = [
    [
      'payments',
      `created_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY)
       AND status = 'expired'
       AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.payment_invoice = payments.invoice)`,
    ],
    ['deposits', `created_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY) AND status = 'expired'`],
    ['websocket_events', `created_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY)`],
    ['temp_notifications', `created_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY)`],
    ['realtime_cache', `(expires_at IS NOT NULL AND expires_at < NOW()) OR created_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY)`],
    ['polling_logs', `created_at < DATE_SUB(NOW(), INTERVAL ${interval} DAY)`],
  ];
  const deleted = {};

  for (const [table, condition] of deletionTargets) {
    let total = 0;
    for (let pass = 0; pass < 20; pass += 1) {
      const result = await execute(
        `DELETE FROM \`${table}\`
         WHERE ${condition}
         LIMIT 1000`,
      );
      const affected = Number(result.affectedRows || 0);
      total += affected;
      if (affected < 1000) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    deleted[table] = total;
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

  const scheduleNext = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(3, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const delay = Math.max(60_000, next.getTime() - now.getTime());
    timer = setTimeout(() => {
      timer = null;
      void runMaintenanceNow()
        .catch((error) => {
          logger('ERROR', { scope: 'cleanup-scheduled', message: error?.message || error });
        })
        .finally(scheduleNext);
    }, delay);
    timer.unref?.();
    return timer;
  };

  void runMaintenanceNow().catch((error) => {
    logger('ERROR', { scope: 'cleanup-initial', message: error?.message || error });
  });

  return scheduleNext();
}
