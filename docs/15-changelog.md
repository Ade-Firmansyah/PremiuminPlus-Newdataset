# 15-changelog

> Source of truth aktif Premiumin Plus. PRD lama dari `legacy/archive/fase-1-docs-cleanup/docs` sudah digabung, divalidasi, lalu duplicate archive dihapus agar tidak ada dua sumber kontrak.

## FASE 2 - Auth Audit

- Hardened API auth middleware to reject empty `x-api-key` before database lookup.
- Login now updates `users.last_login_at` after successful authentication.
- Bootstrap admin seed normalizes valid admin email/phone env values before writing to database.
- Archived unused legacy `apps/api/backend/src/middlewares/auth.js` to keep one active RBAC middleware path.
- Synced `database/schema.mysql.sql` auth/activity columns with runtime schema validator.
- Maintenance guard now falls back to maintenance-off only when database pool is not initialized, allowing route smoke tests without masking real DB errors.

---

## Merged from `11-phase-status.md`

# Premiumin Plus V3.2 Phase Status

## Completed In Current Rebuild

Phase A:

- Created final monorepo folders.
- Moved legacy source folders to `legacy/`.

Phase B:

- Created canonical MySQL schema.
- Created idempotent schema validator.

Phase B.1:

- Added API key and managed bot access rules.
- Added bot session columns.
- Added RBAC middleware.
- Added withdraw request and admin approve/reject flow during V3.2.1 audit cleanup.

Phase C:

- Added backend Express core.
- Added Premku provider key switching.
- Added provider product sync.
- Added cache service.
- Added login-only auth endpoints and frontend login gate.

Phase C.1:

- Added saldo order validation.
- Added provider order normalizer.
- Added order history.
- Added wallet debit/refund.
- Added credential safety masking.

Phase C.2:

- Added provider/manual product contract.
- Added manual stock item schema.
- Added admin product management endpoints.
- Added manual product fulfillment with row lock.
- Added frontend Admin Product Management page for provider/manual tabs, edit, disable, add stock, pricing preview, and Premku key confirmation.
- Added frontend API wrapper methods for admin products, stock items, and Premku key update.
- Fixed manual order validation to rely on locked stock item allocation instead of cached products.stock only.
- Fixed provider stock safety so manual stock count does not overwrite provider stock.
- Fixed stock item disable flow to resync cached manual stock count.
- Synced frontend source so `apps/web` has the active Vite entry (`index.html`, `src/main.tsx`, `src/App.tsx`) and can render Admin Product Management directly.
- Enforced single frontend source in V3.2.1: active Vite entry is now `apps/web/src/main.tsx` and `apps/web/src/App.tsx`, with `apps/web/vite.config.ts` on port 3000 strict mode.

## Remaining Phases

Phase D:

- Pricing System Validation: audited and cleaned in V3.2.1.
- Wallet read endpoints added: `/api/saldo`, `/api/saldo/logs`, `/api/saldo/mutations`.
- Frontend API wrapper for wallet added.
- Deposit endpoints added: `/api/deposit`, `/api/deposits`, `/api/deposits/:invoice/status`.
- Deposit status guard uses 3 second TTL and credits saldo atomically after provider payment success.

Phase E:

- Wallet System Validation.
- Withdraw approval/reject.

Phase F:

- Payment Lifecycle Validation.
- Direct QRIS order payment.

Phase G:

- Bot Engine Validation.

Phase H:

- Frontend Refactor.

Phase I:

- Performance Optimization.

Phase J:

- Deployment Preparation.


---

## Merged from `fase-3-architecture-api.md`

# Fase 3 - Arsitektur dan API

## Prinsip Arsitektur

```text
Route -> Controller -> Service -> Repository -> Database / Premku API
```

Rules:

- Controller hanya validasi request dan response.
- Service memegang business logic, transaksi finansial, dan integrasi Premku.
- Repository hanya akses database.
- Premku service adalah satu-satunya pintu keluar menuju Premku.
- User/member/reseller tidak pernah diambil dari Premku.
- UI menyebut role `member` sebagai `anggota`; kontrak API tetap memakai enum `member`.

## Backend Module

- `auth`: login, register member, forgot password.
- `product`: katalog dan sinkron produk Premku.
- `order`: order saldo untuk member/reseller.
- `payment`: QRIS langsung member untuk order produk.
- `deposit`: QRIS top up saldo.
- `withdraw`: withdraw reseller.
- `wallet`: saldo dan mutasi.
- `admin`: dashboard admin, user, produk, markup, withdraw, notifikasi.
- `notification`: notification center user.
- `bot`: reseller bot-safe endpoints. Bot tetap memanggil service backend utama.
- `webhook`: callback Premku.

## API Contract

Auth:

- `POST /api/login`
- `POST /api/register`
- `POST /api/forgot-password`
- `GET /api/me`

Products:

- `GET /api/products`

Order saldo:

- `POST /api/order`
- `GET /api/order/:invoice`
- `GET /api/orders`

Member QRIS direct order:

- `POST /api/payments/direct-order`
- `GET /api/payments/:invoice/status`
- `POST /api/payments/cancel`

Deposit saldo:

- `POST /api/deposit`
- `GET /api/deposit/:invoice`
- `POST /api/deposit/cancel`
- `GET /api/deposits`

Wallet:

- `GET /api/saldo`
- `GET /api/saldo/logs`
- `POST /api/withdraw`

Notifications:

- `GET /api/notifications`
- `GET /api/admin/notifications`
- `POST /api/admin/notifications`
- `PATCH /api/admin/notifications/:id`
- `DELETE /api/admin/notifications/:id`

Bot engine:

- `POST /api/bot/activation/deposit`
- `GET /api/bot/profile`
- `GET /api/bot/catalog`
- `POST /api/bot/order`
- `POST /api/bot/payments`
- `GET /api/bot/payments/:invoice/status`
- `POST /api/bot/payments/:invoice/cancel`
- `POST /api/bot/session/connect`
- `GET /api/bot/session/status`
- `POST /api/bot/session/logout`

Admin:

- `GET /api/admin/summary`
- `GET /api/admin/users`
- `POST /api/admin/create-user`
- `PATCH /api/admin/update-user/:id`
- `DELETE /api/admin/delete-user/:id`
- `GET /api/admin/transactions`
- `GET /api/admin/deposits`
- `GET /api/admin/withdraws`
- `PATCH /api/admin/withdraws/:id/approve`
- `PATCH /api/admin/withdraws/:id/reject`
- `GET/PATCH /api/admin/markup`
- `GET/PATCH /api/admin/premku-key`
- `GET/PATCH /api/admin/bot-settings`

## Performance Contract

- Product API may return local data while Premku sync cache is fresh.
- Dashboard/admin summary endpoints are cached for 30 seconds.
- Payment and deposit status endpoints are idempotent and protected from repeated provider calls with a short per-invoice guard.
- Frontend should prefer event refresh after order/balance changes and avoid aggressive global polling.

## Wallet Access Contract

Saldo usable untuk order selalu `saldo - locked_balance`. Backend RBAC dan wallet service wajib menolak order jika usable balance tidak cukup. Withdraw boleh mengambil locked balance; jika locked balance berkurang di bawah Rp50.000, bot access dikunci ulang.

## Frontend Bridge

- `src/services/api.ts`: API wrapper.
- `src/store/useAuth.ts`: local/session storage helper.
- `src/pages/order.tsx`: checkout, direct QRIS member, delivery ke WhatsApp akun terdaftar.
- `src/pages/DashboardPage.tsx`: dashboard anggota/reseller, polling ringan, hanya memakai data dari endpoint backend.
- `src/pages/AdminPanelPage.tsx`: admin shell.
- `src/pages/admin/pages/AdminDashboardHome.tsx`: realtime monitoring.
- `src/pages/admin/pages/ProductManagementPage.tsx`: produk, stock, harga anggota/reseller.
- Admin `Product & Margin` adalah satu halaman produksi untuk `products` dan `settings` pricing. Simpan markup dari UI ini mengirim `member_markup`, `reseller_markup`, `member_markup_ranges`, `reseller_markup_ranges`, dan `markup_type` ke `GET/PATCH /api/admin/markup`, lalu Product API memakai `pricing.service` untuk sinkron harga member/reseller.
- `src/pages/admin/pages/NotificationBroadcastPage.tsx`: CRUD notifikasi.


---

## Merged from `fase-4-backend-implementation.md`

# Fase 4 - Implementasi Backend Saat Ini

## Status

Backend sudah berjalan sebagai Express API dengan MySQL, auto schema validation, dan modul bisnis Premiumin Plus.

Implemented:

- Auth lokal: login, register member, forgot password.
- Role: admin, reseller, member.
- Product: sync Premku products, stock status, base price, admin margin.
- Pricing: markup anggota dan markup reseller terpisah.
- Product & Margin admin UI: satu halaman untuk edit produk, margin admin, fallback markup anggota/reseller, range markup role, discount label, dan Premku key. Perubahan markup disimpan ke `settings` dan langsung dipakai `pricing.service` untuk user member/reseller.
- Deposit saldo: QRIS Premku, polling status, atomic saldo update.
- Bot activation deposit: QRIS Premku fixed Rp50.000, `payment_type=bot_activation`, locked balance, dan unlock realtime.
- Direct member payment: QRIS Premku untuk order saat saldo kurang.
- Order: saldo order untuk member/reseller, order request ke Premku, credential tersimpan.
- WhatsApp delivery architecture: webhook gateway optional, fallback `manual_pending`.
- Withdraw: request member/reseller, approve/reject admin, raw saldo bisa ditarik termasuk locked bot balance.
- Notification management: create, edit, delete, pin, active/inactive.
- Admin realtime monitoring via lightweight polling.
- Lightweight memory cache: produk, dashboard, admin summary, leaderboard, bot catalog, dan guard status payment.
- Daily maintenance scheduler: QR expiry, finance daily summary archive, dan cleanup cache/realtime/expired QR rows 7 hari.

## Startup

```bash
npm run backend
```

Startup flow:

1. Load `.env`.
2. Create database if allowed.
3. Run schema validator.
4. Auto-add missing columns.
5. Seed admin if `ADMIN_USERNAME` and password env are configured.
6. Start maintenance scheduler.
7. Start server on port `4000`.

## Finance Safety

- `deposit.service` locks deposit and user rows with `FOR UPDATE`.
- `payment.service` locks payment rows and checks `processed_at`.
- `wallet.service` rejects negative saldo.
- `wallet.service` exposes `usable_balance = saldo - locked_balance` and all saldo-funded order debit uses usable balance.
- `wallet.service` processes withdraw approval atomically with locked balance reduction and bot disable when minimum bot balance is no longer met.
- Duplicate QRIS success polling returns existing processed data.
- Failed Premku order after saldo debit triggers refund.
- Payment/deposit status check memakai per-invoice guard agar frontend dan bot tidak men-spam Premku.
- Bot activation deposit reuses an existing pending activation QR for the same user to prevent duplicate activation invoices.

## Bot Monetization Safety

- Required locked balance: Rp50.000.
- Activation creates transaction types `bot_activation`, `locked_balance`, and `bot_unlock` through deposit, mutation, transaction, and activity logs.
- If withdraw or saldo state makes `saldo < locked_balance`, backend disables bot with transaction type `bot_disable`.
- Bot API controllers reject locked users before rendering/using real bot session operations.
- Bot engine must remain isolated per user session and must not mutate finance state directly.

## Delivery Safety

- `delivery.service` validates WhatsApp target.
- If `WHATSAPP_DELIVERY_WEBHOOK` is empty, order delivery is not faked and becomes `manual_pending`.
- `updateOrderDelivery` will not overwrite an already `sent` delivery.

## Production Notes

- Use MySQL/MariaDB with InnoDB.
- Set `API_KEY`/`PREMKU_API_KEY` for Premku.
- Set `ADMIN_WHATSAPP` for support links.
- Set `WHATSAPP_DELIVERY_WEBHOOK` only when a real WhatsApp gateway exists.
- Keep `VITE_API_BASE_URL` aligned with deployed backend URL.
- Set `DATA_RETENTION_DAYS=7`, `MAINTENANCE_INTERVAL_MINUTES=1440`, and `PAYMENT_QR_TTL_MINUTES=5` unless production policy changes.
- Logs should use standard scopes: `[FRONTEND]`, `[BACKEND]`, `[AUTH]`, `[PAYMENT]`, `[ORDER]`, `[PREMKU]`, `[BOT]`, `[SESSION]`, `[SYNC]`, `[WEBSOCKET]`, `[QUEUE]`, `[CACHE]`, `[CLEANUP]`, and `[ERROR]`.

## UI Naming

Frontend menampilkan `member` sebagai `anggota`. Backend, database, middleware, dan API tetap memakai role enum `member`, `reseller`, dan `admin` agar migrasi lama dan auth tidak berubah.

Dashboard frontend tidak memakai demo data; seluruh angka berasal dari `dashboard/summary`, `products`, dan `orders`.

## Cache And Retention

- Product local read cache: 15 seconds.
- Premku product sync cache: 60 seconds.
- Dashboard/admin analytics cache: 30 seconds.
- Bot catalog cache: 15 seconds per user.
- Payment/deposit provider status guard: 5 seconds per invoice.
- Cleanup removes expired QR rows and temporary realtime/cache tables after retention.
- Cleanup does not delete user saldo, products, admin settings, `transactions`, `saldo_logs`, `saldo_mutations`, `orders`, success deposits/payments, withdraw success, or saved account credentials.


---

## Merged from `legacy-php-audit.md`

# Legacy PHP Audit

Audit singkat untuk file warisan PHP yang masih ada di root project:

- `admin.php`
- `cek.php`
- `config.php`
- `DB_APPSPREMHYTAM.sql`
- `error_log`
- `index.php`

## Temuan Utama

### `config.php`

- Kredensial database masih hardcoded.
- `session_start()` dipanggil tanpa pengecekan, memicu notice saat session sudah aktif.
- Pemanggilan Premku masih langsung dan `json_decode()` dilakukan tanpa validasi HTML/response invalid.
- Tidak ada fallback env yang aman untuk production.

### `admin.php`

- Login admin masih hardcoded `admin/admin123`.
- Tidak ada hashing password.
- Tidak ada RBAC.
- Update setting dilakukan langsung ke tabel `settings` tanpa service layer.
- Data Premku diambil langsung dari file ini, bukan dari backend service terpusat.

### `index.php`

- Produk diambil langsung dari API Premku dari view.
- Markup dihitung di halaman, bukan di service/backend.
- Proses order langsung menyentuh API pusat tanpa validasi saldo lokal yang aman.
- Tidak ada pemisahan controller, service, repository.

### `cek.php`

- Status order dan deposit disinkronkan manual dari UI.
- Alur order lama masih bercampur dengan logika cek status.
- Query SQL masih berbentuk string langsung.
- Tidak ada idempotency guard untuk webhook/status refresh.

### `DB_APPSPREMHYTAM.sql`

- Schema masih sangat minimal.
- Hanya ada `orders` dan `settings`.
- Belum ada `users`, `roles`, `products`, `transactions`, `deposits`, `saldo_logs`, `withdraw`.
- Struktur ini belum memenuhi kebutuhan production wallet/order/deposit/RBAC.

### `error_log`

- Ada notice berulang dari `session_start()` dobel.
- Ada fatal error `Access denied for user ...` yang menunjukkan credential DB production salah.
- Root cause paling mungkin: env lama masih menunjuk user database yang tidak valid.

## Standar Target

Project aktif harus mengikuti backend modern sebagai source of truth:

- React + TypeScript + Tailwind untuk frontend
- Node.js + Express untuk backend
- MySQL untuk state utama
- Premku hanya lewat `premku.service`
- Wallet hanya lewat `wallet.service`
- Semua saldo perubahan wajib masuk `saldo_logs`
- Bot WhatsApp premium hanya lewat backend modern: `users.locked_balance`, `users.bot_access_unlocked`, `deposits.payment_type = bot_activation`, dan usable balance `saldo - locked_balance`
- Semua API response wajib JSON
- UI hanya fetch data dari backend API

## Pemetaan Migrasi

- `config.php` -> `backend/src/config/env.js` + `backend/src/config/db.js`
- `admin.php` -> `src/pages/admin/*` + backend admin controller
- `index.php` -> `src/pages/*` React pages
- `cek.php` -> `GET /api/order/:invoice` + riwayat pesanan
- `DB_APPSPREMHYTAM.sql` -> `database/schema.mysql.sql`
- `error_log` -> perbaiki env DB, session guard, dan error middleware

## Keputusan

File PHP lama diperlakukan sebagai referensi historis, bukan source of truth production.
Yang harus dipakai untuk deploy adalah stack modern yang sudah disinkronkan ke MySQL, wallet service, dan Premku service.

## Audit Update 2026-05-11

- UI modern diputuskan dark-only; toggle light theme dihapus karena tidak menjadi target produksi.
- Sidebar member, reseller, dan admin memakai aksen neon berbeda per menu agar hierarki lebih jelas tanpa mengubah route bisnis.
- Admin menu `Product Management` dan `Margin Rules` digabung menjadi `Product & Margin` karena produk, modal, margin admin, markup role, discount label, dan Premku key adalah satu domain pricing.
- Route lama `/admin/setting-markup` tetap diarahkan ke halaman gabungan supaya link lama tidak langsung rusak.
- Database canonical `database/schema.mysql.sql` diaudit ulang dan disinkronkan dengan kebutuhan backend modern: kolom bot monetization pada `users`, `deposits.payment_type`, index `idx_deposits_payment_type`, dan `saldo_mutations.mutation_type` berbasis `VARCHAR`.
- Istilah UI disederhanakan menjadi `anggota`, `reseller`, dan `admin`. Nilai database/API tetap memakai enum `member`, `reseller`, `admin` agar tidak memecah kompatibilitas backend.
- Dashboard tidak boleh memakai data dummy. Data utama harus datang dari `GET /api/dashboard/summary`, `GET /api/products`, dan `GET /api/orders`; jika kosong, UI menampilkan empty state dari database.



---

## Merged from `04-backend-implementation.md`

# Premiumin Plus V3.2 Backend Implementation Notes

## Implemented Foundation

Phase B:

- Canonical MySQL schema.
- Idempotent schema validator.
- Safe migration rules.

Phase B.1:

- API key and managed bot access contract.
- Managed bot session columns.
- RBAC middleware.

Phase C:

- Express backend core.
- Admin Premku key endpoint.
- Settings service.
- Premku service.
- Product sync service.
- Cache service.
- Product repository.

Phase C.1:

- Saldo order endpoint.
- Order history endpoint.
- Wallet debit/refund service.
- Provider order normalization.
- Credential safety.
- Saldo mutation/log/transaction recording.

## Current Backend Entry

```text
apps/api/backend/server.js
apps/api/backend/app.js
```

## Runtime Environment

Required backend env:

```env
NODE_ENV=production
PORT=4000

DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=
DB_CREATE_IF_MISSING=false

BASE_URL=
FRONTEND_URL=

PREMKU_API_KEY=
API_KEY=

WHATSAPP_DELIVERY_WEBHOOK=
WHATSAPP_DELIVERY_TOKEN=
BOT_LOCKED_BALANCE_MIN=50000
```

`PREMKU_API_KEY` is fallback only. Runtime source is `settings.premku_api_key`.

## Remaining Backend Phases

Next backend validations:

- Pricing system validation.
- Wallet withdraw approval flow.
- Payment lifecycle worker.
- Bot engine API contract.
- Performance cache and polling cleanup.
- Railway deployment validation.
