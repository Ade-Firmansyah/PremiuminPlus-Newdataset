# Maintenance Backup Restore V4

## Maintenance
Admin remains active. Reseller mutations such as order, deposit, withdraw, payment, bot mutation, and public API mutation are blocked when maintenance is enabled.

## Backup
Before role/schema migration, export database and keep a ZIP/diff snapshot.

## Restore
Restore must not drop historical transactions. Validate users, products, orders, payments, deposits, withdrawals, and ledger rows after restore.
