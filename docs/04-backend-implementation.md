# Premiumin Pluus v3.2 Backend Implementation

## Startup

1. Load `.env`.
2. Validate production env when `NODE_ENV=production`.
3. Ensure database exists.
4. Create/repair schema.
5. Seed admin when configured.
6. Start maintenance scheduler.
7. Start provider sync scheduler.
8. Start Express API.

If the port is already used, backend exits with a clear `EADDRINUSE` message.

## Security

- CORS is controlled by `CORS_ORIGIN` or `FRONTEND_ORIGIN`.
- Security headers are set in `security.middleware.js`.
- JSON body limit is 1 MB.
- Global rate limit defaults to 240 requests/minute per IP/path.
- JWT validation checks HMAC signature, expiration, and token version.
- Admin/reseller role middleware protects privileged routes.
- SQL uses parameterized `mysql2` queries.
- Webhook secret supports `x-premku-signature` or `x-webhook-secret`.
- Production errors hide stack traces.

## Cache

In-memory TTL cache:

- Products: 15 seconds per user/role markup context.
- Premku product sync guard: 60 seconds.
- Deposit/payment status guard: `PREMKU_PAY_STATUS_CACHE_MS`, default 25 seconds per invoice.
- Provider order status guard: `PREMKU_ORDER_STATUS_CACHE_MS`, default 30 seconds per invoice.

For multi-instance deployment, move `cache.service.js` to Redis.

## Schedulers

- `maintenance.scheduler.js`: marks expired QR invoices and cleans temporary logs.
- `provider-sync.scheduler.js`: checks pending/processing order status every 60 seconds.

Schedulers call `.unref()` so they do not block process shutdown.

## Finance Flows

Deposit:

1. User creates QRIS deposit.
2. Backend stores `deposits` row.
3. Status polling is guarded.
4. On success, backend locks deposit and user.
5. Backend updates saldo and writes transaction/log/mutation.
6. `processed_at` prevents duplicate credit.

Direct QRIS order:

1. Member creates payment.
2. Payment success writes payment transaction.
3. Backend sends order to Premku.
4. Order row and transaction row are saved.
5. Credentials display only after provider success.

Saldo order:

1. Backend validates stock and usable balance.
2. Backend deducts saldo atomically.
3. Backend sends Premku order.
4. If provider fails, saldo is refunded.
5. Provider sync keeps processing orders updated.

Withdraw:

1. Reseller/admin requests withdraw.
2. Backend validates usable balance.
3. Admin approval adjusts saldo through wallet service.

## Deployment

- Backend start command: `npm run backend`.
- Frontend build command: `npm run build`.
- Typecheck command: `npm run lint`.
- MySQL must be reachable before backend starts.

