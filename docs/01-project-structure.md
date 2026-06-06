# 01-project-structure

> Source of truth aktif Premiumin Plus. PRD lama dari `legacy/archive/fase-1-docs-cleanup/docs` sudah digabung, divalidasi, lalu duplicate archive dihapus agar tidak ada dua sumber kontrak.

---

## Merged from `01-project-structure.md`

# Premiumin Plus V3.2 Project Structure

Struktur final produksi:

```text
premiumin-plus/
├── apps/
│   ├── web/
│   ├── api/
│   │   └── backend/
│   └── bot-engine/
├── database/
│   └── schema.mysql.sql
├── docs/
├── packages/
│   ├── shared/
│   ├── types/
│   └── ui/
├── scripts/
├── logs/
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── turbo.json
└── README.md
```

Production source:

- Frontend: `apps/web`
- Backend: `apps/api/backend`
- Bot Engine: `apps/bot-engine`
- Database: `database/schema.mysql.sql`
- Docs: `docs`

Legacy source:

- `legacy/`
- root legacy files that have not been migrated yet
- old SQLite/JSON database files in `database/`

Legacy is reference only. Do not use legacy folders as production entrypoints.



---

## Merged from `02-ecosystem-architecture.md`

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
- bot access state: `bot_access_unlocked`, `locked_balance`, `bot_disabled_reason`
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

Role boundary:

- member: dashboard, direct order/payment, deposit, withdraw, Public API v1, dan endpoint bot/API non-session untuk bot pribadi.
- reseller: semua kemampuan member plus margin dan managed bot session.
- admin: admin panel plus operational bot monitoring.

Endpoint katalog/order/payment/history/analytics `/api/bot/*` menerima member, reseller, dan admin sebagai API backend untuk bot pribadi. Endpoint managed session/settings/profile, `/api/bot-settings`, dan bot activation hanya menerima `reseller` atau `admin`. Frontend menu hiding tidak dipercaya sebagai security; backend RBAC tetap menjadi guard.

## Finance Rule

All money movement must pass through backend services:

- `deposit.service`
- `payment.service`
- `order.service`
- `wallet.service`

Bot engine must call API endpoints and must not update saldo, transactions, deposits, payments, or orders directly.

Bot WhatsApp access is monetized through locked balance. Web-core owns activation, unlock, disable, and withdraw impact. Bot engine only receives API success/failure and must not decide access locally.

## Performance Layer

Web-core memakai cache memory ringan tanpa dependency tambahan:

- `products:local` TTL 15 detik.
- `premku:products:synced` TTL 60 detik.
- `dashboard:user:{id}` TTL 30 detik.
- `admin:summary` TTL 30 detik.
- `bot:catalog:user:{id}` TTL 15 detik.
- `sync:payment:{invoice}` dan `sync:deposit:{invoice}` TTL 5 detik.

Cache dihapus saat user, produk, saldo, markup, discount, payment, atau deposit berubah. Jika Redis diperlukan nanti, key dan TTL ini menjadi kontrak migrasi.

Frontend memakai pola request hemat resource:

- GET request dideduplikasi saat request identik masih berjalan.
- GET request memakai stale cache ringan di API client.
- Polling berhenti saat browser tab hidden.
- Refetch saat window focus kembali memakai throttle.
- Search/filter memakai debounce.
- Admin tabel besar memakai pagination server-side dan refresh manual.
- Health check pings `/health` every 45 seconds and enters maintenance mode after 3 failed checks.

Target cadence frontend:

- dashboard umum: 30-60 detik saat visible.
- active order/payment pending: 10-20 detik saja.
- notification badge: 20-30 detik.
- profile, products, role, settings: cache/stale time.
- finance/admin ledger: manual refresh, pagination, export async.

Tanstack Query dapat dipakai sebagai adapter cache frontend saat dependency sudah tersedia. Kontrak stale time mengikuti daftar TTL di atas agar perilaku tetap hemat request.

Bot engine boleh lebih aktif karena background worker:

- cek job/message queue: 2-5 detik jika memakai queue eksternal.
- retry provider/bot job: 10-30 detik dengan limit.
- health/session check: 30-60 detik.
- QR/payment watch: 10-30 detik dan berhenti pada terminal state.
- reconnect memakai backoff, bukan loop cepat.

## Free Tier Migration And Backup Contract

Railway/Vercel free-tier migration flow:

1. enable maintenance mode.
2. export MySQL as `sql.gz`.
3. verify export includes users, saldo, transactions, balance mutations, deposits, withdraws, orders, and settings.
4. import into the new Railway MySQL instance.
5. run schema migration.
6. verify checksum totals:
   - total users.
   - sum users.saldo.
   - count transactions.
   - count balance mutations.
   - pending orders/payments.
7. switch backend environment to the new database.
8. health check passes.
9. disable maintenance mode.

Rules:

- no saldo mutation may be replayed during restore.
- unique invoice/API keys prevent duplicate order/payment rows.
- backup/restore must not write finance state through bot-engine.
- restore is owned by web-core/database tooling only.

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

## B2B Bot Ledger Synchronization

Member/reseller bot sales use `users.reseller_margin_percent`.

When buyer QRIS succeeds:

1. web-core locks the payment row.
2. `bot_payment_in` credits reseller saldo by buyer sell price.
3. `bot_order_cost` debits reseller saldo by reseller modal price.
4. web-core creates the order through manual stock or Premku.
5. returned credentials are saved permanently.
6. `transactions.profit` records admin/platform profit.
7. `transactions.reseller_profit` records bot margin profit for analytics only.
8. `saldo_logs` and `saldo_mutations` receive only the real saldo movements.

No bot process may credit profit directly, and reseller profit is not credited twice.

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

