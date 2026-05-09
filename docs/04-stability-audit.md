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
- deletes operational history older than `DATA_RETENTION_DAYS`, default 7 days
- keeps user saldo, users, products, admin settings, saldo logs, orders, and credentials intact

Current production rule:

- `orders` are kept because they contain admin-needed completed order data and account credentials.
- `transactions` and `saldo_mutations` are retained for 7 days as detail history.
- old finance totals are preserved in `finance_daily_summaries`.
- old temporary realtime data is cleaned from `websocket_events`, `temp_notifications`, `realtime_cache`, and `polling_logs`.

## Cache Audit

- Product sync to Premku is capped at 60 seconds.
- Local product reads are cached for 15 seconds.
- Dashboard analytics are cached for 30 seconds and invalidated after balance/order/payment changes.
- Premku payment/deposit status checks use a 5 second per-invoice guard.
- Admin profile/summary reads are cached to reduce Railway CPU and external API calls.

## Member Navigation

Member menu is simplified:

- Dashboard
- Buy Products
- Deposit
- Transaction History
- Profile

Routes outside this list redirect back to dashboard for members.

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
