# Premiumin Plus Ecosystem Architecture

## Purpose

Premiumin Plus adalah SaaS digital product ecosystem:

- web dashboard
- backend API
- finance and wallet system
- QRIS payment flow
- reseller ecosystem
- bot engine
- realtime monitoring
- digital product delivery

Web-core adalah pusat kebenaran. Bot tidak boleh punya finance logic sendiri.

## Runtime Boundary

```text
/web-core
  frontend React
  backend Express API
  MySQL schema validator
  finance services
  order services
  notification services

/bot-engine
  WhatsApp sessions
  QR login control API
  message handlers
  in-memory duplicate guard
  web-core API client
  admin monitoring sender
```

## Data Ownership

Local MySQL owns:

- users
- API keys
- products cache
- deposits
- payments
- orders
- transactions
- saldo logs
- saldo mutations
- withdraws
- bot settings
- notifications

Premku owns:

- QRIS generation
- payment status source
- product provider source
- order provider source
- order result source

Bot engine owns only:

- WhatsApp auth session files
- socket connection state
- short-lived duplicate message guards

## Finance Rule

All money movement must pass through backend services:

- `deposit.service`
- `payment.service`
- `order.service`
- `wallet.service`

Bot engine must call API endpoints and must not update saldo, transactions, deposits, payments, or orders directly.

## Performance Layer

Web-core memakai cache memory ringan tanpa dependency tambahan:

- `products:local` TTL 15 detik.
- `premku:products:synced` TTL 60 detik.
- `dashboard:user:{id}` TTL 30 detik.
- `admin:summary` TTL 30 detik.
- `bot:catalog:user:{id}` TTL 15 detik.
- `sync:payment:{invoice}` dan `sync:deposit:{invoice}` TTL 5 detik.

Cache dihapus saat user, produk, saldo, markup, discount, payment, atau deposit berubah. Jika Redis diperlukan nanti, key dan TTL ini menjadi kontrak migrasi.

## Retention Layer

Scheduler cleanup berjalan di web-core setelah database siap:

- expire QR pending yang sudah lewat `expired_at`.
- archive total lama ke `finance_daily_summaries`.
- hapus detail operasional lebih dari 7 hari.
- tidak menghapus saldo, order credential, produk, user, atau settings admin.

## Bot API Contract

Current bot-safe endpoints:

- `GET /api/bot/profile`
- `GET /api/bot/catalog`
- `POST /api/bot/order`
- `POST /api/bot/payments`
- `GET /api/bot/payments/:invoice/status`
- `POST /api/bot/payments/:invoice/cancel`
- `POST /api/bot/session/connect`
- `GET /api/bot/session/status`
- `POST /api/bot/session/logout`

Authentication:

- `x-api-key` must be a local member/reseller/admin API key.
- Reseller data is isolated by `users.api_key`.
- Business logic uses the same backend services as dashboard.

## Admin Monitoring

Admin monitoring destination:

```text
64957102211197@lid
```

Events emitted best-effort:

- new member registered
- reseller registered
- deposit pending
- deposit success
- reseller order
- member order
- withdraw request
- failed payment
- bot disconnected

## QRIS Nominal Rule

Premku may return `total_bayar` that differs from requested `amount`.

UI must display:

- `total_bayar` as the scan/payment nominal.
- `amount` as saldo masuk or product price.

This prevents confusion like product/topup Rp 880 but scanned QRIS Rp 904.

## Reseller Profit Synchronization

Member/reseller bot sales use `users.reseller_margin_percent`.

When buyer QRIS succeeds:

1. web-core locks the payment row.
2. web-core creates the order through Premku.
3. returned credentials are saved permanently.
4. `transactions.reseller_profit` records bot margin profit.
5. reseller saldo is credited with profit once.
6. `saldo_logs` and `saldo_mutations` receive the profit entry.

No bot process may credit profit directly.

## Railway Deployment

Railway can run web-core and bot-engine as separate services:

Web-core:

```bash
npm run build
npm run backend
```

Bot-engine:

```bash
npm run bot
```

Bot service must set:

```env
BOT_API_BASE_URL=https://your-web-core-domain/api
BOT_RESELLER_API_KEY=
BOT_SESSION_ID=
ADMIN_MONITORING_LID=64957102211197@lid
```
