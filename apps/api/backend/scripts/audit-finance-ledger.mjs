import mysql from 'mysql2/promise';
import { getDbConfig } from '../src/config/db.js';

const connection = await mysql.createConnection(getDbConfig());

try {
  const [[summary]] = await connection.query(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE status = 'active' AND role IN ('member', 'reseller')) AS active_wallet_accounts,
       (SELECT COALESCE(SUM(saldo), 0) FROM users WHERE status = 'active' AND role IN ('member', 'reseller')) AS wallet_liability,
       (SELECT COUNT(*) FROM balance_mutations) AS balance_mutations,
       (SELECT COUNT(*) FROM saldo_mutations) AS saldo_mutations,
       (SELECT COUNT(*) FROM saldo_logs) AS saldo_logs,
       (SELECT COUNT(*) FROM transactions
         WHERE transaction_type = 'order'
           AND status IN ('processing', 'success')
           AND (product_id IS NOT NULL OR invoice LIKE 'ORD%')) AS active_orders,
       (SELECT COALESCE(SUM(total_price), 0) FROM transactions
         WHERE transaction_type = 'order'
           AND status IN ('processing', 'success')
           AND (product_id IS NOT NULL OR invoice LIKE 'ORD%')) AS order_revenue,
       (SELECT COALESCE(SUM(profit), 0) FROM transactions
         WHERE transaction_type = 'order'
           AND status IN ('processing', 'success')
           AND (product_id IS NOT NULL OR invoice LIKE 'ORD%')) AS order_profit,
       (SELECT COUNT(*) FROM deposits WHERE status = 'success') AS successful_deposits,
       (SELECT COALESCE(SUM(amount), 0) FROM deposits WHERE status = 'success') AS deposit_amount,
       (SELECT COUNT(*) FROM withdraws WHERE status = 'approved') AS approved_withdraws,
       (SELECT COALESCE(SUM(amount), 0) FROM withdraws WHERE status = 'approved') AS withdraw_amount`,
  );

  const [[reconciliation]] = await connection.query(
    `SELECT
       (SELECT COUNT(*)
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
        )) AS missing_from_saldo_mutations,
       (SELECT COUNT(*)
        FROM saldo_logs sl
        WHERE NOT EXISTS (
          SELECT 1
          FROM balance_mutations bm
          WHERE bm.user_id = sl.user_id
            AND bm.amount = sl.amount
            AND bm.balance_before = COALESCE(NULLIF(sl.balance_before, 0), sl.before_saldo, 0)
            AND bm.balance_after = COALESCE(NULLIF(sl.balance_after, 0), sl.after_saldo, 0)
            AND COALESCE(bm.source_ref, '') = COALESCE(sl.reference_id, sl.reference, '')
        )) AS missing_from_saldo_logs`,
  );

  console.log(JSON.stringify({
    summary: Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, Number(value || 0)])),
    reconciliation: Object.fromEntries(Object.entries(reconciliation).map(([key, value]) => [key, Number(value || 0)])),
  }, null, 2));
} finally {
  await connection.end();
}
