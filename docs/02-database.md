# Premiumin Pluus v3.2 Database

Runtime source of truth: `backend/src/config/db.js`.
SQL reference: `database/schema.mysql.sql`.

Backend melakukan schema validation dan additive repair saat startup. Semua tabel memakai InnoDB dan foreign key untuk data inti.

## Canonical Tables

- `users`: auth, role, saldo, `locked_balance`, `api_key`, status, `token_version`, `last_password_reset_at`, `password_reset_count`.
- `products`: catalog lokal, Premku id, base price, admin margin, `member_price`, `reseller_price`, stock, status.
- `deposits`: QRIS top up, invoice, amount, total bayar, QR payload, status, `processed_at`.
- `payments`: direct QRIS order member, invoice, product, status, order invoice, guard fields.
- `orders`: provider order result, credential, payment status, order status, delivery status.
- `transactions`: canonical history, type, amount, profit, invoice, `idempotency_key`.
- `saldo_logs`: legacy-compatible saldo log.
- `saldo_mutations`: canonical finance mutation audit.
- `withdraws`: reseller/admin withdraw requests.
- `notifications`: broadcast/pinned notifications.
- `settings`: key/value JSON settings.
- `activity_logs`: operational/user activity log.
- Password reset audit scopes: `PASSWORD_RESET_SUCCESS`, `PASSWORD_RESET_FAILED`, `PASSWORD_RESET_RATE_LIMIT`.
- `webhook_logs`: temporary provider callback log.

## Finance Safety

- Saldo debit/credit memakai DB transaction.
- User rows dikunci dengan `SELECT ... FOR UPDATE`.
- Deposit success dikunci dengan `deposits.processed_at`.
- Direct payment success dikunci dengan `payments.processed_at`.
- Order refund memakai transaction dan refund marker.
- `users.saldo >= 0` dijaga oleh check constraint.

## Performance Indexes

Runtime menambahkan index untuk:

- deposit invoice/status dan expired cleanup.
- payment invoice/status dan expired cleanup.
- transaction type/status/provider sync.
- order invoice/status.
- activity/webhook retention cleanup.

## Retention

Data permanen:

- users
- saldo
- saldo_mutations
- transactions
- deposits
- payments
- orders
- product catalog

Data sementara yang boleh dibersihkan:

- old `webhook_logs`
- temporary activity scopes untuk system/provider polling
- pending QR yang sudah expired di-mark `expired`, bukan dihapus.

