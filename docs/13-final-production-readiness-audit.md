# Final Production Readiness Audit

Premiumin Plus V4 target production:

```text
Frontend  -> Vercel
Backend   -> Railway
BotEngine -> Railway
Database  -> MongoDB Atlas
Domain    -> Hostinger DNS
```

## Executive Status

Deployment infrastructure is prepared, but full `MongoDB Atlas = single source of truth` is not yet safe to claim while core backend modules still import `backend/src/config/db.js`.

Current safe production mode:

```env
MONGO_SINGLE_SOURCE_OF_TRUTH=false
ALLOW_LEGACY_SQL_IN_PRODUCTION=true
```

Final Mongo-only production mode must stay disabled until all core repositories are migrated:

```env
MONGO_SINGLE_SOURCE_OF_TRUTH=true
ALLOW_LEGACY_SQL_IN_PRODUCTION=false
```

The backend intentionally rejects `MONGO_SINGLE_SOURCE_OF_TRUTH=true` for now so deployment cannot silently run with duplicate state.

## Ready

- Vercel build target: `npm run build`, output `dist`.
- Railway backend command: `npm run backend`.
- Railway bot command: `npm run bot`.
- Domain plan:
  - `premiuminplus.store`
  - `api.premiuminplus.store`
  - `bot.premiuminplus.store`
- MongoDB connection and required indexes in `backend/src/config/database.js`.
- MongoDB temp cleanup scheduler and TTL collections.
- QR base64 cleanup after success/expired/failed/canceled.
- Realtime websocket heartbeat and cleanup.
- Bot engine calls backend API and does not mutate finance directly.
- Backup and restore scripts using `mongodump` and `mongorestore`.
- Production env templates for Vercel and Railway.

## Blocker For MongoDB SSOT

The following data paths still use SQL adapter `backend/src/config/db.js`:

- Auth/register/login user flow.
- Product repository and manual stock writes.
- Order repository and order service.
- Payment repository and payment settlement service.
- Deposit repository and deposit success service.
- Transaction repository and refund logic.
- Withdraw repository and admin approval flow.
- Notification/activity repositories.
- Dashboard/admin summary queries.
- Maintenance scheduler for invoice expiry and QR cleanup.

Because these modules mutate finance and stock, partial Mongo migration would create a higher risk than keeping the compatibility mode explicit.

## Required Migration To Unlock MongoDB SSOT

Migrate in this order:

1. `users`
   - auth lookup
   - api key lookup
   - token version
   - bot status
2. `wallets` and `wallet_mutations`
   - deposit credit
   - order debit
   - refund credit
   - withdraw debit
   - bot lock
3. `products` and `manual_product_accounts`
   - product catalog
   - manual stock reserve/sold/release
   - provider stock sync
4. `payments`, `deposits`, `transactions`, `orders`
   - QRIS status lock
   - duplicate payment guard
   - provider failure rollback
   - account delivery status
5. `settings`, `notifications`, `activity_logs`
   - bot templates
   - markup settings
   - compact logs
6. `maintenance.scheduler`
   - move invoice expiry and QR cleanup from SQL to MongoDB.
7. `provider-sync.scheduler`
   - move product sync writes from SQL to MongoDB.

After migration, run:

```bash
npm run audit:production
```

Only enable MongoDB SSOT when the audit has no blocker.

## Production Audit Command

```bash
npm run audit:production
```

This command scans for:

- SQL legacy imports.
- QR persistence references.
- Potential aggressive timers/polling.

Expected result before full Mongo migration:

```text
[BLOCKER] SQL legacy imports
Production readiness audit failed.
```

Expected result after full Mongo migration:

```text
Production readiness audit passed.
```

## Finance Validation Gate

Before public launch, test these in staging:

- Deposit success credits wallet once.
- QRIS direct product payment credits incoming payment once.
- Provider debit happens once.
- Provider failure rolls back local settlement.
- Bot payment uses final bot price.
- Manual stock sold once.
- Hybrid stock manual-first then provider fallback.
- Duplicate webhook/status check does not duplicate mutation.
- Balance never goes negative.
- Profit equals payment in minus owner/provider debit.

## Deployment Gate

Public launch is allowed only when:

- `npm run lint` passes.
- `npm run build` passes.
- Backend health works.
- Bot health works.
- Websocket connects.
- QRIS opens and closes after success.
- Bot QR login works.
- Bot order completes.
- Realtime dashboard updates from backend events.

Mongo-only launch additionally requires:

- `npm run audit:production` passes.
- `MONGO_SINGLE_SOURCE_OF_TRUTH=true`.
- `ALLOW_LEGACY_SQL_IN_PRODUCTION=false`.
- No production env contains SQL credentials for active runtime.
