# Premiumin Plus V3.2.2 Production Audit

Audit date: `2026-06-06`

## Scope

- `apps/web`
- `apps/api/backend`
- `apps/bot-engine`
- `database/schema.mysql.sql`
- Railway and Vercel deployment configuration

## Implemented

- Public API v1 for profile, products, stock, payments, orders, and status.
- API key authentication with header, Bearer, and body conflict detection.
- Per-IP and per-user Public API rate limits with `429` and `Retry-After`.
- Provider/manual/hybrid products and row-locked manual stock allocation.
- Idempotent wallet, deposit, payment, provider order, and profit ledger flow.
- Managed WhatsApp Bot session access separated from member Public API access.
- Exact-state backup/restore with SHA-256 manifest and mandatory maintenance mode.
- Package and documentation version synchronized to `3.2.2`.
- Existing database compatibility for JSON and text-backed setting values.

## Verification Result

Passed:

- isolated MySQL production gate with backup, upload, preview, exact-state restore, and checksum validation
- maintenance lock during restore and transaction recovery after maintenance is disabled
- five concurrent payment success attempts with one order, one credential, and one set of ledger mutations
- member/reseller ownership, saldo, dashboard finance, bot role, and Public API checks
- Public API rate-limit response
- provider profile and product list read-only checks; `21` products returned
- backend and bot JavaScript syntax checks
- frontend lint and production build
- `git diff --check`

Not performed:

- real QRIS payment or provider order that spends production balance
- destructive restore against the live Railway database

## Residual Risks

1. Public API rate limits are in-memory. A future multi-instance deployment should move buckets to Redis or another shared store.
2. Provider write idempotency is protected by a deterministic `ref_id`, but still depends on the provider honoring that identifier.
3. The first production deployment should be monitored for database migration warnings and managed WhatsApp reconnection state.

## Decision

`GO` for deployment after the final automated gate passes. Production smoke tests must remain non-destructive and must not create a paid QRIS transaction.
