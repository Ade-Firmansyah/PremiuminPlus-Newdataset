# 09-retention-monitoring

> Source of truth aktif Premiumin Plus. PRD lama dari `legacy/archive/fase-1-docs-cleanup/docs` sudah digabung, divalidasi, lalu duplicate archive dihapus agar tidak ada dua sumber kontrak.

---

## Merged from `04-stability-audit.md`

# Stability Audit

## Blank Page Prevention

Frontend now has a global React Error Boundary:

- file: `src/components/ErrorBoundary.tsx`
- mounted in `src/main.tsx`

If a render crash happens, user sees a recoverable fallback instead of a blank white page.

## Member QR Lifecycle

Member direct QR payment page was hardened:

- polling uses a ref lock to prevent duplicate checks
- polling interval is cleared on modal close/unmount
- async state updates check mounted state
- balance refresh after success is best-effort
- QR countdown is derived from `expired_at`
- QR modal remains open on pending/success
- QR image is visible only while payment is pending and timer still has time left
- when timer reaches zero, frontend asks backend for final status; backend either processes success or locks the payment as expired

## Maintenance Retention

Backend starts `maintenance.service` after database initialization:

- expires stale pending QR payments/deposits
- clears QR payload for terminal QR states
- deletes expired QR rows and temporary realtime/cache rows older than `DATA_RETENTION_DAYS`, default 7 days
- keeps user saldo, users, products, admin settings, saldo logs, saldo mutations, transactions, orders, and credentials intact

Current production rule:

- `orders`, credentials, `transactions`, `saldo_logs`, and `saldo_mutations` are retained because they are finance/audit evidence. Cleanup only removes expired QR rows and temporary realtime/cache rows.
- `transactions` and `saldo_mutations` are retained as finance detail history.
- old finance totals are preserved in `finance_daily_summaries`.
- old temporary realtime data is cleaned from `websocket_events`, `temp_notifications`, `realtime_cache`, and `polling_logs`.

## Cache Audit

- Product sync to Premku is capped at 60 seconds.
- Local product reads are cached for 15 seconds.
- Dashboard analytics are cached for 30 seconds and invalidated after balance/order/payment changes.
- Premku payment/deposit status checks use a 5 second per-invoice guard.
- Admin profile/summary reads are cached to reduce Railway CPU and external API calls.
- Frontend API client uses lightweight in-memory stale cache for GET requests:
  - products: 5 minutes.
  - profile/settings/community: 60 seconds.
  - notifications: 30 seconds.
  - dashboard/admin summary: 30 seconds.
  - admin list reads: 10 seconds.
  - active status endpoints: no cache.
- Any non-GET mutation clears the frontend cache so post-action data can refresh cleanly.

## Frontend Request Cadence

Website request policy:

- fetch on page open.
- fetch on manual refresh.
- fetch after successful user action.
- fetch when business events fire, such as balance/order updates.
- fetch on browser focus with throttle.

Frontend polling policy:

- dashboard: 60 seconds while tab is visible.
- admin dashboard: 60 seconds while tab is visible.
- notifications: 30 seconds while tab is visible.
- active QR/order/payment: 15 seconds only while pending/processing.
- bot session UI: 10 seconds while QR is active, 30 seconds after connected/idle.
- admin tables and finance ledger: manual refresh plus server pagination, no automatic table polling.

Hidden browser tabs pause frontend polling. This keeps CPU, RAM, database queries, and provider/API calls suitable for a small VPS.

## Maintenance Mode

Frontend Vercel runs a lightweight backend health check:

- ping `/health` every 45 seconds.
- ping again when the browser window regains focus.
- after 3 failed checks, maintenance mode becomes active.
- when health returns, maintenance mode clears automatically.

During maintenance mode:

- cached/read-only pages may remain visible.
- non-GET actions are blocked client-side.
- order, withdraw, payment, user edits, and other mutations show the maintenance message instead of hitting the API.

This protects free-tier Railway/Vercel deployments from request storms while the backend, database, migration, or bot service is unstable.

## Unified Navigation

Menu is generated from one centralized navigation config.

Member:

- Dashboard
- Products
- Transactions
- Withdraw
- Community WhatsApp
- API Key
- Upgrade Reseller
- Profile

Reseller:

- Dashboard
- Products
- Transactions
- Withdraw
- Community WhatsApp
- API Key
- Margin Settings
- Profit Analytics
- Bot Settings
- Profile

Routes outside each role permission set redirect back to dashboard.

## Premium Bot Access

Bot Settings must render the locked page when `bot_access_unlocked = false`.

Server-side bot engine access is restricted to `reseller` and `admin` roles. Members can use normal website/API purchase flows, but cannot call `/api/bot/*`, `/api/bot-settings`, or bot activation endpoints.

Activation uses one pending QRIS invoice per user:

- amount: Rp50.000
- payment type: `bot_activation`
- locked balance: `users.locked_balance`
- usable balance: `saldo - locked_balance`

Order validation must never spend locked bot balance. Withdraw may reduce locked balance, and that disables bot access.

## Admin Bot

Admin Bot Settings now supports:

- connect/reconnect
- QR base64 display
- logout
- session status
- connected number
- last active
- notification LID display

Admin notifications are sent to:

```text
64957102211197@lid
```

## Notification Events

Web-core attempts admin notification bot delivery for:

- member registration
- deposit pending
- deposit success
- order pending
- order success
- failed payment
- withdraw request
- bot disconnected from bot-engine

Notification delivery is best-effort and must never break the main finance/auth/order flow.

## Production Rule

Bot, realtime, and notifications must not own finance state.

Bot unlock/disable realtime signals may update UI state, but web-core remains the only writer for saldo and locked balance.

Only web-core services may mutate:

- saldo
- deposits
- payments
- orders
- transactions
- saldo logs
- saldo mutations

## API JSON Safety

- Unknown `/api/*` routes return JSON 404 instead of Express HTML.
- Frontend API wrapper logs invalid response parsing under `[FRONTEND]`.
- Backend error middleware logs under `[ERROR]` and always returns JSON.


---

## Merged from `11-retention.md`

# Retention Contract

Cleanup default 7 hari.

Boleh dihapus otomatis:

- expired `payments`
- expired `deposits`
- `temp_notifications`
- `polling_logs`
- `websocket_events`
- expired/stale `realtime_cache`

Tidak boleh dihapus otomatis:

- `users`
- success `orders`
- credential order
- `transactions`
- `saldo_logs`
- `saldo_mutations`
- `products`
- `settings`
- deposit success
- withdraw success

Finance total lama boleh diarsipkan ke `finance_daily_summaries`, tetapi detail finance tetap dipertahankan.


