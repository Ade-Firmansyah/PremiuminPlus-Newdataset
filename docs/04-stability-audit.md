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
- withdraw request

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
