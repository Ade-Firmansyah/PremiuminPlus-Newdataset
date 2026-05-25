# PRD Tutorial Deployment Production

## Premiumin Plus V4

Dokumen ini adalah PRD sekaligus tutorial deployment end-to-end untuk membuat Premiumin Plus V4 online public, production-ready, ringan untuk free-tier, dan stabil untuk operasional digital product.

Target deployment:

```text
Frontend  -> Vercel
Backend   -> Railway
BotEngine -> Railway
Database  -> MongoDB Atlas
Domain    -> Hostinger DNS
```

Domain final:

```text
premiuminplus.store      -> frontend
api.premiuminplus.store  -> backend
bot.premiuminplus.store  -> bot engine
```

## Tujuan Produk

Premiumin Plus V4 harus bisa berjalan public dengan:

- Dashboard web online.
- API backend stabil.
- Bot WhatsApp tetap berjalan walau user logout dari web.
- Realtime dashboard via WebSocket.
- QRIS payment aman dan duplicate-safe.
- Hybrid stock realtime.
- Cleanup otomatis untuk data sementara.
- Backup dan restore database.
- Failover Railway tanpa kehilangan data.

## Ruang Lingkup

Dokumen ini mencakup:

- Setup MongoDB Atlas.
- Setup Vercel frontend.
- Setup Railway backend.
- Setup Railway bot engine.
- Setup custom domain Hostinger.
- DNS configuration.
- Environment variables production.
- Security rules.
- Free-tier optimization.
- Cleanup scheduler.
- Backup dan restore MongoDB.
- Final testing production.
- Failover jika Railway limit habis.

## Arsitektur Production

```text
User Browser
  |
  | https://premiuminplus.store
  v
Vercel Frontend
  |
  | HTTPS API
  v
Railway Backend
  |\
  | \ WebSocket /realtime
  |  \
  |   v
  |  Browser realtime dashboard
  |
  | MongoDB connection
  v
MongoDB Atlas

Railway Bot Engine
  |
  | API_BASE_URL=https://api.premiuminplus.store
  v
Railway Backend
```

Bot engine dipisah dari backend karena WhatsApp session dan WebSocket butuh long-running process. Vercel hanya untuk static frontend.

## Prasyarat

Sebelum deploy, siapkan:

- Akun Vercel.
- Akun Railway.
- Akun MongoDB Atlas.
- Domain Hostinger `premiuminplus.store`.
- Premku API key.
- JWT secret panjang dan random.
- Repository project sudah push ke Git provider.
- MongoDB Database Tools untuk backup/restore lokal jika diperlukan.

## Step 1 - MongoDB Atlas

1. Login ke MongoDB Atlas.
2. Buat project baru, misalnya `Premiumin Plus`.
3. Buat cluster free-tier.
4. Buat database user khusus production.
5. Simpan username dan password.
6. Atur Network Access:
   - Untuk cepat deploy Railway, bisa gunakan `0.0.0.0/0`.
   - Untuk production lebih ketat, gunakan allowlist IP jika platform sudah menyediakan static outbound IP.
7. Copy connection string.
8. Pastikan format env:

```env
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER/premiuminpluus?retryWrites=true&w=majority
MONGODB_DBNAME=premiuminpluus
```

Catatan implementasi saat ini: MongoDB Atlas connection, TTL indexes, wallet Mongo session path, backup, restore, cleanup, dan QR cleanup sudah disiapkan. Core repository aktif untuk beberapa data bisnis masih memakai adapter SQL legacy, sehingga backend production saat ini masih membutuhkan env SQL sampai migrasi repository penuh ke MongoDB selesai.

## Step 2 - Vercel Frontend

Deploy frontend ke Vercel.

Build command:

```bash
npm run build
```

Output directory:

```text
dist
```

Environment variables Vercel:

```env
VITE_API_BASE_URL=https://api.premiuminplus.store
VITE_BOT_ENGINE_URL=
```

`VITE_API_BASE_URL` boleh tanpa `/api` karena frontend otomatis menambahkan `/api`.

Set custom domain di Vercel:

```text
premiuminplus.store
www.premiuminplus.store
```

## Step 3 - Railway Backend

Buat service Railway pertama untuk backend.

Start command:

```bash
npm run backend
```

Required env:

```env
NODE_ENV=production
PORT=4000

MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER/premiuminpluus?retryWrites=true&w=majority
MONGODB_DBNAME=premiuminpluus
JWT_SECRET=CHANGE_THIS_TO_LONG_RANDOM_SECRET
API_KEY=YOUR_PREMKU_API_KEY

FRONTEND_ORIGIN=https://premiuminplus.store
CORS_ORIGIN=https://premiuminplus.store,https://www.premiuminplus.store
BOT_ENGINE_URL=https://bot.premiuminplus.store

BASE_URL=https://premku.com/api/
PREMKU_WEBHOOK_SECRET=

WEB_SESSION_TIMEOUT_MS=1800000
REALTIME_EMIT_DEBOUNCE_MS=1200
DASHBOARD_CACHE_MS=30000
PRODUCTS_CACHE_MS=15000
BOT_CATALOG_CACHE_MS=15000
CLEANUP_RETENTION_DAYS=7
PROVIDER_SYNC_INTERVAL_MS=60000
PROVIDER_PRODUCT_SYNC_INTERVAL_MS=60000
VERBOSE_PREMKU_LOGS=false
VERBOSE_SYSTEM_LOGS=false
```

Jika core SQL legacy masih aktif, tambahkan juga:

```env
DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=
```

Set custom domain Railway backend:

```text
api.premiuminplus.store
```

Health check:

```text
https://api.premiuminplus.store/health
```

Expected response:

```json
{
  "status": true,
  "service": "premiumin-pluus-backend"
}
```

## Step 4 - Railway Bot Engine

Buat service Railway kedua untuk bot engine.

Start command:

```bash
npm run bot
```

Required env:

```env
NODE_ENV=production
BOT_ENGINE_PORT=4010

API_BASE_URL=https://api.premiuminplus.store
WEB_CORE_URL=https://api.premiuminplus.store
BOT_ENGINE_CORS_ORIGIN=https://premiuminplus.store,https://www.premiuminplus.store

BOT_SESSIONS_DIR=/data/bot-sessions
BOT_SESSION_CLEANUP_ENABLED=true
BOT_SESSION_FILE_TTL_HOURS=24
BOT_SESSION_CLEANUP_INTERVAL_MINUTES=60
BOT_PAYMENT_FIRST_CHECK_MS=5000
BOT_PAYMENT_POLL_MS=20000
BOT_PAYMENT_TIMEOUT_MS=1800000
BOT_MESSAGE_QUEUE_MAX=100
BOT_MESSAGE_DEDUPE_TTL_MS=60000
```

Set custom domain Railway bot:

```text
bot.premiuminplus.store
```

Health check:

```text
https://bot.premiuminplus.store/health
```

Bot session harus memakai persistent volume jika session WhatsApp wajib bertahan setelah restart Railway.

## Step 5 - Hostinger DNS

Atur DNS domain di Hostinger.

Root domain:

```text
Type: A
Name: @
Value: 76.76.21.21
```

WWW:

```text
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

API:

```text
Type: CNAME
Name: api
Value: railway-domain-backend
```

BOT:

```text
Type: CNAME
Name: bot
Value: railway-domain-bot
```

Tunggu propagasi DNS. Biasanya beberapa menit sampai beberapa jam.

## Security Rules

Backend wajib aktif:

- Security headers.
- CORS origin whitelist.
- JWT validation.
- API key validation.
- Rate limit.
- Request JSON size limit.
- Payment duplicate guard.
- WebSocket heartbeat cleanup.
- Production env validation.

Bot engine wajib aktif:

- CORS origin whitelist.
- Request JSON size limit.
- Rate limit ringan.
- WebSocket heartbeat cleanup.
- Session pruning.
- Message dedupe.

Rahasia yang tidak boleh masuk frontend:

- `JWT_SECRET`
- `API_KEY`
- `PREMKU_WEBHOOK_SECRET`
- `MONGODB_URI`
- Database password
- Delivery webhook token

## Free-Tier Optimization

Jangan simpan:

- QR base64 permanen.
- Huge logs.
- Duplicate cache.
- Unnecessary session data.
- Temporary websocket payload.

Wajib aktif:

- Cleanup scheduler.
- TTL index MongoDB untuk temporary collections.
- Pagination untuk list data.
- Indexed query untuk invoice, user, product, payment.
- Compact bot session.
- Cache pendek untuk catalog/dashboard.
- Verbose logs dimatikan di production.

Recommended env:

```env
DASHBOARD_CACHE_MS=30000
PRODUCTS_CACHE_MS=15000
BOT_CATALOG_CACHE_MS=15000
CLEANUP_RETENTION_DAYS=7
VERBOSE_PREMKU_LOGS=false
VERBOSE_SYSTEM_LOGS=false
```

## Backup Database

Backup MongoDB:

```bash
npm run backup:db
```

Script memakai:

```text
mongodump
```

Output default:

```text
backups/mongo-premiuminpluus-<timestamp>
```

Restore MongoDB:

```bash
npm run restore:db -- ./backups/<backup-folder>
```

Script memakai:

```text
mongorestore
```

Pastikan MongoDB Database Tools sudah terinstall di mesin yang menjalankan backup/restore.

## Failover Railway

Jika Railway limit habis:

1. Buat Railway project atau service baru.
2. Deploy repo yang sama.
3. Gunakan env lama yang sama.
4. Gunakan `MONGODB_URI` lama.
5. Jangan buat database baru jika database lama masih sehat.
6. Pindahkan custom domain dari service lama ke service baru.
7. Jalankan health check backend dan bot.
8. Test login, QRIS, bot, dan realtime.

Data tetap aman karena database persistent berada di MongoDB Atlas, bukan di Railway service.

## Final Production Testing

Checklist web:

- Register berhasil.
- Login berhasil.
- Auto logout web setelah idle 30 menit.
- Dashboard realtime tersambung.
- Produk tampil.
- Manual stock tampil.
- Hybrid stock manual-first.
- Provider fallback berjalan.
- Wallet sinkron.
- Profit sinkron.
- Deposit berhasil.
- Withdraw berhasil.

Checklist QRIS:

- Member saldo kurang memunculkan QRIS.
- Reseller wajib saldo cukup.
- QRIS amount sesuai final bot price.
- Payment success menghapus QR.
- Invoice close setelah success.
- Duplicate payment tidak memproses ulang.
- Provider gagal membuat rollback lokal.

Checklist bot:

- Bot login QR muncul.
- Satu user satu session satu bot.
- Bot tetap berjalan saat user offline.
- Command `stok` mengikuti theme user.
- Command `buy 1` membuat invoice.
- QRIS dikirim visible.
- Payment success menghapus QR.
- Bot kirim processing message.
- Bot kirim account.
- Transaction close.

Checklist realtime:

- `wallet.updated`
- `stock.updated`
- `order.updated`
- `dashboard.updated`
- `notification.updated`
- `bot.updated`

Event hanya boleh emit saat data berubah atau lifecycle penting berjalan.

## Acceptance Criteria

Deployment dianggap selesai jika:

- `https://premiuminplus.store` terbuka.
- `https://api.premiuminplus.store/health` sukses.
- `https://bot.premiuminplus.store/health` sukses.
- Vercel build menggunakan output `dist`.
- Railway backend start dengan `npm run backend`.
- Railway bot start dengan `npm run bot`.
- MongoDB Atlas reachable.
- Dashboard tidak CORS error.
- Realtime websocket aktif.
- QRIS berhasil dibuat dan ditutup saat success.
- Bot WhatsApp bisa login dan order.
- Backup database bisa dijalankan.
- Failover service baru bisa memakai database lama.

## Referensi File Project

- Deployment guide: `docs/10-deployment-guide.md`
- Checklist deploy: `deploy/DEPLOY-CHECKLIST.md`
- Vercel env: `deploy/vercel.env.example`
- Railway backend env: `deploy/railway-backend.env.example`
- Railway bot env: `deploy/railway-bot.env.example`
- Backup script: `scripts/backup-database.js`
- Restore script: `scripts/restore-database.js`
