# Premiumin Plus V3.2.2

Premiumin Plus adalah monorepo untuk jual produk digital dengan frontend Vercel, backend Railway, MySQL Railway, dan managed WhatsApp Bot Engine Railway.

Production domain:

- Frontend: `https://premiuminplus.store`
- Backend API: `https://premiuminplus.store/api`

## Struktur Monorepo

- `apps/web`: React + Vite frontend. Entry aktif: `src/main.tsx`, `src/App.tsx`.
- `apps/api/backend`: Express backend. Entry aktif: `server.js`, `app.js`.
- `apps/bot-engine`: managed WhatsApp Bot Engine. Entry aktif: `index.js`.
- `database`: canonical MySQL schema.
- `docs`: PRD, architecture, database, deployment notes.
- `packages`: shared packages.
- `scripts`: helper scripts.
- `logs`: local audit/smoke logs.
- `legacy/archive`: source lama yang tidak aktif.

## Cara Install

```bash
npm install
npm --prefix apps/web install
npm --prefix apps/api/backend install
npm --prefix apps/bot-engine install
```

## Local Development

Frontend + Backend:

```bash
npm run dev
```

Perintah ini menjalankan backend lokal di `http://localhost:4000` dan frontend Vite di `http://localhost:3000`.

Frontend saja:

```bash
npm run dev:web
```

Backend saja:

```bash
npm run dev:backend
```

Bot Engine:

```bash
npm run dev:bot
```

Frontend dev wajib berjalan di `http://localhost:3000`. Vite dikunci ke port `3000` dengan `strictPort: true`.

## Railway Backend

Deploy service dari folder `apps/api/backend`.

Start command:

```bash
npm run backend
```

Environment:

```env
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://premiuminplus.store
BASE_URL=https://premku.com/api/
DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=
DATABASE_URL=
DB_CREATE_IF_MISSING=false
PREMKU_API_KEY=
API_KEY=
ADMIN_USERNAME=
ADMIN_PASSWORD=
ADMIN_EMAIL=admin@premiuminplus.store
ADMIN_PHONE=6285888009931
ADMIN_FORCE_RESET=false
ADMIN_WHATSAPP=6285888009931
SUPPORT_WHATSAPP=+6285888009931
BOT_ENGINE_URL=https://BOT-ENGINE-RAILWAY-URL
BOT_ENGINE_TOKEN=
DATA_RETENTION_DAYS=7
MAINTENANCE_INTERVAL_MINUTES=1440
PAYMENT_QR_TTL_MINUTES=5
WHATSAPP_DELIVERY_WEBHOOK=
WHATSAPP_DELIVERY_TOKEN=
ORDER_CREDENTIAL_SECRET=
ADMIN_MONITORING_LID=64957102211197@lid
```

`settings.premku_api_key` adalah source of truth provider key. `.env` hanya fallback/bootstrap.

### Admin Login Seed

Backend dapat membuat admin awal dari env saat startup.

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-strong-password
ADMIN_EMAIL=admin@premiuminplus.store
ADMIN_PHONE=6285888009931
ADMIN_FORCE_RESET=true
```

Kontrak:

- Jika belum ada user `role = admin`, backend membuat admin dari env.
- Jika admin sudah ada, password tidak dioverwrite otomatis.
- Jika `ADMIN_FORCE_RESET=true`, backend reset password username admin dari env dan log aman tanpa password.
- Setelah login production berhasil, ubah `ADMIN_FORCE_RESET=false`.
- Jangan commit `.env` production.

## Vercel Frontend

Deploy dari folder `apps/web`.

Build command:

```bash
npm run build
```

Environment:

```env
VITE_API_BASE_URL=/api
```

Jangan simpan provider key di frontend. Frontend hanya memanggil backend.

## MySQL Setup

Gunakan Railway MySQL/MariaDB, lalu set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, dan `DB_NAME` di backend service.

Backend menjalankan schema validator saat startup:

- membuat table yang belum ada
- menambah kolom penting yang belum ada
- menambah index penting
- seed setting bootstrap

Manual migrate:

```bash
mysql -h <host> -u <user> -p <database> < database/schema.mysql.sql
```

## Bot Engine

Deploy service dari folder `apps/bot-engine`.

Start command:

```bash
npm run bot
```

Environment:

```env
NODE_ENV=production
PORT=4001
BOT_API_BASE_URL=https://premiuminplus.store/api
BOT_ENGINE_TOKEN=
ADMIN_MONITORING_LID=64957102211197@lid
```

Bot Engine tidak boleh call Premku atau database langsung. Bot hanya call backend API memakai API key user reseller.

## Provider Key

Admin mengisi Premku key dari halaman `Product & Margin`.

Backend menyimpan key di `settings.premku_api_key`, menampilkan masked value, dan tidak log full key. Fallback `.env` hanya untuk bootstrap awal.

## Deploy Flow

1. Deploy MySQL Railway.
2. Deploy backend Railway dari `apps/api/backend`.
3. Set backend env.
4. Cek `https://premiuminplus.store/health`.
5. Deploy bot Railway dari `apps/bot-engine`.
6. Set `BOT_ENGINE_URL` dan `BOT_ENGINE_TOKEN` di backend.
7. Deploy frontend Vercel dari `apps/web`.
8. Set `VITE_API_BASE_URL=/api`.

## Maintenance & Backup

Admin panel menyediakan `Maintenance & Backup` di `/admin/maintenance`.

Maintenance mode menyimpan status di tabel `settings`:

- `maintenance_mode`: `enabled` atau `disabled`
- `maintenance_message`
- `maintenance_started_at`
- `maintenance_started_by`

Saat ON, admin tetap bisa login, backup, restore, lihat data, dan toggle OFF. Member/reseller tetap bisa login read-only, tetapi deposit, order, withdraw, payment, bot order/payment, regenerate API key, dan endpoint status yang bisa memproses transaksi akan ditolak `503`.

Endpoint:

```text
GET /api/system/status
GET /api/admin/maintenance
PATCH /api/admin/maintenance
GET /api/admin/system/backup
POST /api/admin/system/restore
POST /api/admin/system/restore/upload
GET /api/admin/system/restore/:jobId/status
POST /api/admin/system/restore/:jobId/confirm
```

Download menghasilkan ZIP berisi:

- `database.sql`
- `backup.json`
- `settings.json`
- `metadata.json`
- `backup_info.json`
- `checksums.json`

Backup mencakup tabel penting:

- `settings`
- `users`
- `products`
- `product_stock_items`
- `deposits`
- `payments`
- `orders`
- `withdraws`
- `transactions`
- `saldo_logs`
- `saldo_mutations`
- `notifications`
- `finance_daily_summaries`
- `activity_logs`
- `admin_logs`

Restore flow:

1. Aktifkan maintenance mode.
2. Download backup dari admin panel.
3. Deploy database/backend baru.
4. Upload ZIP backup di admin panel baru.
5. Backend extract dan validate file wajib.
6. Preview jumlah tabel, metadata, dan checksum.
7. Confirm restore hanya setelah jumlah data benar.
8. Backend restore state database tanpa replay transaksi/provider/delivery.
9. Poll progress sampai `completed`.
10. Clear cache otomatis.
11. Start backend agar schema validator menambah kolom/index yang kurang.
12. Cek `/health`, login admin, produk, saldo, orders, deposits, withdraws.

Bot session tidak dianggap data finansial. Jika session hilang saat migrasi, reseller cukup login dashboard dan scan QR ulang.

## Migration Akun Baru

Jika limit Railway/Vercel hampir habis:

1. Aktifkan maintenance mode.
2. Pastikan transaksi member/reseller freeze.
3. Download backup ZIP.
4. Simpan env production.
5. Deploy backend baru di Railway akun baru.
6. Buat Railway MySQL/MariaDB baru.
7. Deploy bot engine baru.
8. Deploy frontend baru di Vercel jika perlu.
9. Login admin bootstrap di deployment baru.
10. Upload backup ZIP.
11. Preview dan confirm restore.
12. Test health, admin login, sample member/reseller, product, order, saldo.
13. Disable maintenance mode di project baru.
14. Update DNS `premiuminplus.store` dan `api.premiuminplus.store`.
15. Hapus project lama hanya setelah backup restore terbukti aman.

## Maintenance Scheduler

Backend menjalankan cleanup harian sekitar pukul `03:00` server time.

Retention default `7` hari untuk data operasional ringan:

- `websocket_events`
- `realtime_cache`
- `polling_logs`
- `temp_notifications`
- expired QR payment/deposit rows

Ledger finance tidak dihapus otomatis:

- `transactions`
- `saldo_logs`
- `saldo_mutations`
- `orders`
- `deposits success`
- `withdraw success`
- `users`
- `products`
- `settings`

Ringkasan harian disimpan di `finance_daily_summaries`.

## Production Contract Docs

Kontrak final V3.2.2 dikunci di:

- `docs/00-master-production-contract.md`
- `docs/01-auth.md`
- `docs/02-wallet.md`
- `docs/03-order-flow.md`
- `docs/04-provider-flow.md`
- `docs/05-bot-flow.md`
- `docs/06-maintenance.md`
- `docs/07-backup-restore.md`
- `docs/08-deployment.md`
- `docs/09-retention.md`
- `docs/10-admin-flow.md`
- `docs/11-member-flow.md`
- `docs/12-reseller-flow.md`

## Provider Product Sync

`GET /api/products` hanya membaca database/cache. Endpoint ini tidak call Premku langsung.

Admin sync provider lewat:

```text
POST /api/admin/products/sync-provider
```

Provider sync dilindungi cache 120 detik agar tidak spam Premku.

## Bot Activation Reseller

Locked balance minimum: `50000`.

Flow:

1. Reseller membuat deposit aktivasi bot.
2. Deposit sukses menambah saldo.
3. Backend mengunci `users.locked_balance = 50000`.
4. `bot_access_unlocked = true`.
5. Order memakai `usable_balance = saldo - locked_balance`.

Member punya API key pribadi tetapi tidak boleh memakai managed Bot Engine `/api/bot/*`.

## Finance Safety

Saldo hanya boleh berubah lewat `wallet.service`.

Setiap perubahan saldo wajib mencatat:

- `transactions`
- `saldo_logs`
- `saldo_mutations`

Refund admin bersifat atomic dan idempotent. Bot dan frontend tidak boleh menulis saldo.

## Troubleshooting

- Vite pindah ke 3001/5173: pastikan hanya menjalankan `apps/web/vite.config.js`; port sudah dikunci ke 3000.
- Backend gagal startup DB: cek `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
- Admin gagal login: set `ADMIN_FORCE_RESET=true`, deploy/start backend sekali, login, lalu set kembali `ADMIN_FORCE_RESET=false`.
- Produk kosong: jalankan admin provider sync, lalu cek Premku key.
- QR expired terlalu cepat/lama: cek `PAYMENT_QR_TTL_MINUTES`.
- Bot tidak connect: cek `BOT_ENGINE_URL`, `BOT_ENGINE_TOKEN`, dan status Railway bot service.
- Saldo mismatch: cek `balance_mutations`, `saldo_logs`, dan transaksi referensi invoice.
- Provider lambat: pending order akan masuk `waiting_provider` atau `pending_manual` untuk aksi admin.

## Final Smoke Test

Backend:

- `GET /health`
- `POST /api/login` admin username
- `POST /api/login` admin email
- `GET /api/me`
- `GET /api/admin/system/backup`

Frontend:

- Login page tampil di `https://premiuminplus.store`
- Logo tidak terpotong
- Metadata SEO sesuai Premiumin Plus
- Tidak ada hardcoded localhost production

Admin:

- Set provider key
- Sync provider
- Edit markup
- Tambah manual/hybrid product
- Tambah stock manual
- Manual fulfill
- Cancel/refund

Member:

- Register/login
- Deposit
- Order
- Withdraw
- Riwayat
- Mutasi saldo
- API key

Reseller:

- Deposit/order/withdraw
- Bot activation
- QR login ulang jika session hilang
- Margin Setting
- Profit Analytics
