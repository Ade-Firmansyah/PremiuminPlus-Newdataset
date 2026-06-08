# Premiumin Plus V4 Production Contract

V4 is a reseller-only platform. Active roles are `admin` and `reseller`.

## Business Model
- Every registered non-admin user is a reseller.
- There is no upgrade flow, conversion queue, or separate customer dashboard.
- Admin owns provider configuration, product pricing, finance monitoring, backup/restore, and system operations.
- Reseller owns dashboard usage, balance, product order, direct QRIS order, API key, bot catalog/order, managed bot access, profile, and community access.

## Auth
- `POST /api/register` creates a reseller account.
- `POST /api/login` sends admin to Admin Panel and reseller to Reseller Dashboard.
- Forgot password remains public and maintenance-safe.
- Seed admin remains environment driven.

## Pricing
- Product price source of truth is `products.reseller_price`.
- Provider cost/base price and admin margin feed reseller price.
- Frontend renders backend price only.
- Deprecated legacy columns may remain in the database for compatibility, but they are not an active role model.

## Dashboard
Reseller dashboard includes saldo aktif, deposit, spending, transaction count, money in/out, reseller profit, API key, recent history, charts, and bot summary.

## Bot
- Public bot/API endpoints accept reseller/admin API keys.
- Managed bot session/settings/profile require reseller/admin plus valid locked balance.
- Locked balance threshold remains Rp50.000.

## Ledger
B2B ledger remains unchanged: provider cost, reseller price, bot sell price, admin profit, and reseller profit must not be double credited.

## Migration
1. Backup database.
2. Convert old role rows to reseller.
3. Narrow role enum to admin/reseller.
4. Keep risky legacy columns deprecated.
5. Remove active UI/API/routes for upgrade flow.
