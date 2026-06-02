# 00-master-production-contract

> Source of truth aktif Premiumin Plus. PRD lama dari `legacy/archive/fase-1-docs-cleanup/docs` sudah digabung, divalidasi, lalu duplicate archive dihapus agar tidak ada dua sumber kontrak.

---

## Merged from `00-master-production-contract.md`

# Premiumin Plus V3.2.2 - Master Production Contract

Source of truth aktif:

- Frontend: `apps/web`
- Backend: `apps/api/backend`
- Bot Engine: `apps/bot-engine`
- Database: `database/schema.mysql.sql`
- Docs: `docs`

Deployment final:

- Frontend: `https://premiuminplus.store`
- Backend API: `https://api.premiuminplus.store/api`
- Database: Railway MySQL/MariaDB
- Bot Engine: Railway

Role valid hanya `admin`, `reseller`, dan `member`. UI boleh menyebut `member` sebagai `anggota`, tetapi database/API tetap memakai enum `member`.

Frontend tidak boleh memanggil Premku langsung, tidak boleh menghitung harga final, dan tidak boleh mengubah saldo. Bot Engine tidak boleh memanggil Premku langsung atau menulis finance/database. Semua order, payment, wallet, pricing, dan provider action wajib lewat backend.

Data penting yang tidak boleh dihapus otomatis: `users`, `orders` success, credential, `transactions`, `saldo_logs`, `saldo_mutations`, `products`, `settings`, deposit success, dan withdraw success.



---

## Merged from `v3.2-production-contract.md`

# Premiumin Plus V3.2 Production Contract

Dokumen ini adalah kontrak produksi final Premiumin Plus V3.2. Jika ada konflik antar dokumen, PRD terbaru dan dokumen ini menjadi prioritas tertinggi.

## Deployment Topology

```text
Frontend        : Vercel, apps/web
Backend Web Core: Railway, apps/api/backend
Database        : Railway MySQL/MariaDB, database/schema.mysql.sql
Bot Engine      : Railway service terpisah, apps/bot-engine
Provider        : Premku
```

## Source of Truth

- Backend Web Core adalah pusat logic bisnis.
- MySQL adalah pusat data lokal.
- Premku memiliki produk provider, stok provider, QRIS provider, credential, dan provider order processing.
- Bot Engine hanya channel WhatsApp dan managed session untuk reseller/admin.
- Frontend hanya memanggil backend API.

## Role Contract

Role valid di database dan API hanya:

```text
admin
reseller
member
```

UI boleh menampilkan `member` sebagai `anggota`, tetapi database/API tetap memakai `member`.

## Menu Contract

Member menu:

- Dashboard
- Products
- Deposit
- Withdraw
- Riwayat
- Mutasi Saldo
- API Key
- Komunitas WA
- Upgrade Reseller
- Profile

Reseller menu:

- Dashboard
- Products
- Deposit
- Withdraw
- Riwayat
- Mutasi Saldo
- API Key
- Margin Setting
- Profit Analytics
- Bot WhatsApp
- Profile

Admin menu:

- Dashboard
- User Management
- Product Management
- Pricing Management
- Transactions
- Deposits
- Withdrawals
- Notifications
- API Settings
- Bot Monitoring
- Logs

## API Key Contract

Semua user dapat memiliki `users.api_key`.

Member:

- Memiliki API key.
- Boleh memakai API key untuk integrasi pribadi.
- Boleh membuat bot sendiri di luar sistem.
- Tidak boleh memakai Bot Engine bawaan web.
- Tidak boleh login QR melalui managed Bot Engine web.
- Tidak boleh mengakses managed bot session endpoint.

Reseller:

- Memiliki API key.
- Boleh memakai endpoint normal.
- Boleh memakai managed Bot Engine bawaan web jika akses bot aktif.
- Boleh login QR dari dashboard.
- Memiliki 1 managed bot session dari sistem.

Admin:

- Full access.
- Dapat monitoring bot reseller.
- Dapat mengganti API key provider Premku.

## Managed Bot Access Contract

Managed Bot Engine hanya untuk:

```text
reseller
admin
```

Endpoint berikut wajib menolak member dengan HTTP 403 JSON:

```text
/api/bot/*
/api/bot-settings
/api/bot/session/connect
/api/bot/session/status
/api/bot/session/logout
/api/bot/activation/deposit
```

Response:

```json
{
  "success": false,
  "message": "Bot Engine hanya tersedia untuk reseller."
}
```

Managed bot access wajib mengecek:

```text
role in reseller/admin
bot_access_unlocked = true
saldo >= locked_balance
locked_balance >= 50000
```

Jika `saldo < locked_balance`, maka:

```text
bot_access_unlocked = false
bot_disabled_reason diisi
saldo_mutations.mutation_type = bot_disable
```

## Provider API Key Contract

Premku API key runtime source:

```text
settings.premku_api_key
```

Fallback/bootstrap:

```text
process.env.PREMKU_API_KEY
process.env.API_KEY
```

API key provider tidak boleh:

- hardcoded di source.
- disimpan di frontend.
- ditulis ke `.env.example`.
- muncul penuh di log.

Admin endpoint:

```text
GET   /api/admin/premku-key
PATCH /api/admin/premku-key
```

Saat admin mengganti key:

1. Validasi admin.
2. Validasi key tidak kosong.
3. Test API key ke Premku.
4. Jika valid, simpan ke `settings.premku_api_key`.
5. Clear provider/product/dashboard/admin/bot catalog cache.
6. Sync ulang produk dari Premku.
7. Upsert produk lokal.
8. Jangan hapus transaksi/order/payment lama.

## Pricing Contract

Final price disimpan di:

```text
products.member_price
products.reseller_price
```

Frontend tidak boleh menghitung harga. Frontend hanya merender harga final yang dikirim backend.

## Product Management Contract

Product type:

```text
provider
manual
```

Provider product:

- berasal dari Premku.
- stock/status mengikuti provider sync.
- order fulfillment dikirim ke Premku.
- credential dari Premku disimpan ke `orders`.

Manual product:

- dibuat admin.
- stock akun disimpan di `product_stock_items`.
- stock available dihitung dari item dengan `status = available`.
- order fulfillment mengambil satu credential manual dengan row lock.
- credential manual disimpan ke `orders`.

Manual stock statuses:

```text
available
reserved
used
disabled
```

Admin product actions:

- Edit.
- Nonaktifkan.
- Tambah Stock.

Hard delete produk tidak boleh dilakukan jika ada histori order. Default action adalah nonaktifkan.

Kolom audit/admin lama boleh tetap ada:

```text
base_price
admin_margin
member_markup
reseller_markup
```

`price_base` boleh diterima sebagai alias API/form lama. Kolom database canonical tetap `products.base_price`.

Saat sync Premku:

- Produk baru memakai default price dari provider.
- Produk existing tidak boleh sembarang overwrite final price admin.
- Produk lama yang tidak ada di provider baru tidak dihapus; set `status = unavailable` atau `stock = 0`.

## Wallet Contract

Saldo tidak boleh minus.

Source of truth:

```text
users.saldo
users.locked_balance
```

`usable_balance` dihitung backend:

```text
usable_balance = saldo - locked_balance
```

Jangan simpan `usable_balance` sebagai source of truth.

Member dan reseller sama-sama boleh:

- deposit
- withdraw
- melihat riwayat
- melihat mutasi saldo

Order reseller wajib memakai `usable_balance`.

Withdraw:

- Member boleh withdraw dari saldo biasa.
- Reseller boleh withdraw, termasuk mengurangi locked balance sesuai rule service.
- Jika setelah withdraw `saldo < locked_balance`, managed bot harus dinonaktifkan.

## Mutation Contract

Mutation type wajib jelas dan berbasis VARCHAR:

```text
saldo_masuk
saldo_keluar
profit
deposit
withdraw
order
refund
payment
bot_activation
locked_balance
bot_unlock
bot_disable
```

Wajib tercatat sesuai konteks di:

```text
saldo_logs
saldo_mutations
transactions
```

## Payment Lifecycle

State resmi:

```text
pending_payment
payment_success
provider_processing
provider_success
credential_delivery
```

Credential tidak boleh tampil atau dikirim sebelum:

```text
provider_success
```

## Order Contract

Sebelum order ke Premku:

1. User authenticated.
2. Role valid.
3. Product ada di local DB.
4. Product aktif/tersedia.
5. Product stock > 0.
6. Harga final dari backend.
7. Frontend tidak mengirim harga sebagai source of truth.
8. Saldo order memakai usable balance.
9. Saldo tidak boleh minus.

Saldo order flow:

```text
order.controller
-> order.service.createSaldoOrder()
-> wallet.service.debitForOrder()
-> premku.service.createOrder()
-> premku.service.normalizeOrderResult()
-> order.repository.createOrUpdate()
-> delivery.service.prepareDelivery()
```

Jika Premku gagal setelah saldo didebit:

```text
refund atomic
saldo_mutations.mutation_type = refund
transactions.transaction_type = refund
```

Manual product fulfillment:

```text
lock product_stock_items available FOR UPDATE
set stock item used
save email_account/password_account to orders
order_status = provider_success
payment_status = payment_success
sync products.stock cached count
```

Credential disimpan di `orders`, tetapi response harus menyembunyikan credential sampai `provider_success`.

## Order History Contract

Endpoint:

```text
POST /api/order
GET  /api/orders
GET  /api/order/:invoice
```

Member/reseller hanya melihat order miliknya.

Admin boleh melihat semua order melalui admin route atau query admin yang dilindungi.

Response history minimal:

```text
invoice
product_name
payment_status
order_status
delivery_status
created_at
credential hanya jika provider_success
```

## Cache TTL

```text
products        5 seconds
dashboard       10 seconds
admin summary   5 seconds
payment status  3 seconds
deposit status  3 seconds
provider sync   120 seconds
bot catalog     10 seconds
```

## Frontend Contract

- Dark mode only.
- No light theme toggle.
- No dummy dashboard data.
- No hardcoded statistics.
- No direct Premku access.
- No direct database access.
- No frontend price calculation.
- Polling pause saat tab hidden.
- Throttle refetch saat window focus.
- API key input provider tidak boleh disimpan di localStorage.

## Backend Contract

Architecture:

```text
Route
-> Controller
-> Service
-> Repository
-> Database/Premku
```

Controller tidak boleh query database langsung.

Premku hanya melalui:

```text
premku.service
```

Wallet hanya melalui:

```text
wallet.service
```

Semua error response JSON-only.

## Database Canonical

Canonical tables:

```text
users
products
transactions
payments
deposits
orders
withdraws
saldo_logs
saldo_mutations
notifications
settings
activity_logs
finance_daily_summaries
websocket_events
temp_notifications
realtime_cache
polling_logs
```

Migration safety:

- No DROP TABLE.
- No DROP COLUMN.
- No TRUNCATE.
- No DELETE data in migration.
- Migration boleh create table, add missing column, add missing index, add missing FK.

## Bot Session Contract

Reseller managed bot session:

```text
1 reseller = 1 session
```

Rules:

- Gunakan persistent auth state.
- Jangan logout otomatis.
- Jangan reconnect infinite loop.
- Jika connected, simpan `connected_number` dan `last_active`.
- Jika benar-benar logged out, status menjadi `disconnected` atau `logged_out`.
- User harus connect ulang QR.
- Logout manual hanya dari tombol dashboard reseller/admin.

## Legacy Contract

Legacy folders are historical references only:

```text
legacy/
root src/
root backend/
root dist/
.vite/
legacy PHP files
```

Production source only:

```text
apps/web
apps/api/backend
apps/bot-engine
database/schema.mysql.sql
docs
packages
scripts
```


---

## Merged from `fase-1-requirement.md`

# Fase 1 - Tujuan Produk dan Scope

## Visi Produk

Premiumin Plus adalah platform produk digital untuk tiga role utama:

- `admin`: mengontrol ekosistem, user, produk, harga, finance, notifikasi, dan monitoring.
- `reseller`: menjual produk digital memakai saldo reseller, margin pribadi, dan Bot Wa Setting premium setelah aktivasi locked balance.
- `member`: membeli produk digital langsung dari dashboard, memakai saldo jika tersedia atau QRIS langsung jika saldo kurang, serta bisa memakai API key. Member dapat mengajukan upgrade reseller.

Project ini bukan marketplace umum. Semua user lokal disimpan di database Premiumin Plus. Premku hanya dipakai sebagai provider produk, QRIS, status pembayaran, order, dan status order.

## Flow Bisnis Utama

Member:

1. Login atau register member.
2. Melihat katalog produk.
3. Jika stok produk `> 0`, member bisa checkout.
4. Jika saldo cukup, order memakai saldo lokal.
5. Jika saldo kurang, sistem menawarkan pembayaran langsung QRIS.
6. Setelah QRIS sukses, backend membuat transaksi payment, mengirim order ke Premku, menyimpan credential akun, lalu menyiapkan delivery WhatsApp.

Reseller:

1. Login sebagai reseller.
2. Top up saldo via QRIS deposit.
3. Order produk hanya boleh memakai saldo.
4. Jika saldo kurang, order ditolak dengan pesan `Saldo reseller tidak cukup.`
5. Reseller dapat mengatur markup/margin pribadi selama tetap dalam batas backend.
6. Withdraw tersedia untuk member dan reseller. Locked bot balance tetap milik user dan dapat ditarik, tetapi penarikan yang mengurangi locked balance akan menonaktifkan bot.
7. Bot Wa Setting hanya terbuka jika `bot_access_unlocked = true` dan `locked_balance >= 50000`.

Admin:

1. Mengelola user admin/reseller/member.
2. Mengelola produk, stok, base price, admin margin, markup anggota, dan markup reseller.
3. Memantau transaksi, deposit, payment pending, withdraw, dan user baru.
4. Mengelola notifikasi broadcast: create, edit, delete, pin, aktif/nonaktif.
5. Mengatur API Premku dan bot settings.

## Rule Sistem

- Saldo tidak boleh minus.
- Semua transaksi saldo harus atomic dan tercatat di `saldo_logs`/`saldo_mutations`.
- Produk stok `0` tetap tampil, tetapi tidak bisa diorder dan wajib berbadge `Belum tersedia`.
- QRIS Premku bisa mengembalikan `total_bayar` berbeda dari harga produk karena kode unik/fee. UI harus menampilkan `total_bayar` saat menampilkan QR.
- Order tidak boleh dikirim ke Premku sebelum pembayaran/saldo valid.
- Polling sukses tidak boleh menggandakan saldo, payment, order, atau delivery.
- WhatsApp delivery tidak boleh dianggap terkirim jika gateway belum dikonfigurasi. Statusnya harus `manual_pending`.
- Slider margin Bot Wa Setting adalah state bisnis nyata, bukan dekorasi UI. Nilai slider, teks persen, payload API, dan database `users.markup_percent`/`users.reseller_margin_percent` wajib sinkron. Preview modal/harga/profit tidak ditampilkan di UI agar halaman tetap ringan.
- Data operasional detail hanya disimpan 7 hari secara default untuk menjaga dashboard tetap ringan. Saldo user, data user, produk, order credential, dan ringkasan finance admin tidak ikut dihapus.
- Premku API tidak boleh dipanggil berlebihan. Produk, stok, dashboard, bot catalog, dan status pembayaran wajib lewat cache/guard ringan.
- Website tidak boleh spam API. Fetch dilakukan saat halaman dibuka, user klik refresh, data penting berubah, window kembali fokus, atau aksi user berhasil.
- Frontend hanya boleh polling untuk data yang memang aktif berubah:
  - dashboard umum maksimal 30-60 detik saat halaman aktif.
  - order/payment pending maksimal 10-20 detik dan berhenti setelah terminal state.
  - notifikasi/badge maksimal 20-30 detik.
  - profile, produk, role, dan data statis wajib memakai cache ringan/stale time.
  - tabel admin besar wajib pagination server-side dan refresh manual, bukan auto refresh penuh.
- Saat tab browser hidden, polling frontend wajib pause atau dilambatkan. Saat tab fokus kembali, refetch boleh dilakukan dengan throttle.
- Bot engine boleh polling lebih aktif karena proses background, tetapi tetap wajib punya retry limit, timeout, duplicate guard, dan reconnect backoff.
- Bot WhatsApp adalah fitur premium. Aktivasi memakai fixed QRIS Rp50.000 dengan `payment_type = bot_activation`, lalu saldo bertambah dan Rp50.000 dicatat sebagai `users.locked_balance`.
- Validasi order wajib memakai `usable_balance = saldo - locked_balance`, bukan raw `saldo`.
- Jika saldo turun di bawah locked balance, bot harus otomatis disable, `bot_access_unlocked = false`, dan activity/transaction/mutation harus tercatat.
- Akses bot engine hanya untuk reseller/admin. Member tetap bisa memakai API key untuk flow web-core biasa, tetapi tidak boleh mengakses endpoint `/api/bot/*`, `/api/bot-settings`, atau aktivasi bot.
- Frontend wajib menjalankan health check backend dan masuk maintenance mode otomatis setelah 3 kegagalan. Saat maintenance, semua aksi mutasi seperti order, withdraw, payment, edit user, dan edit setting harus diblokir.
- Migrasi Railway/Vercel gratisan wajib melalui backup SQL, restore, schema migration, dan checksum saldo/transaksi sebelum maintenance mode dimatikan.

## Latest Production Lock V3.2.2

- Project sudah masuk tahap matang sekitar 96% dan tidak boleh banyak diubah tanpa alasan bug/stability.
- Frontend aktif tetap `apps/web` dengan Vite React dan deploy Vercel.
- Backend aktif tetap `apps/api/backend` dengan Railway MySQL/MariaDB.
- Bot engine aktif tetap `apps/bot-engine` sebagai client web-core, bukan finance/database/provider writer.
- Frontend memakai Vercel Speed Insights melalui package resmi `@vercel/speed-insights` dengan `injectSpeedInsights()` agar kompatibel dengan Vite React workspace.
- Bot WhatsApp reseller memakai `reseller_bot_settings` sebagai source of truth brand, greeting hooks, template katalog/order, terms, dan margin bot.
- Harga bot reseller wajib memakai `products.reseller_price` sebagai modal lalu ditambah margin bot. Margin mendukung `percent` dan `fixed`.
- Untuk contoh modal Rp12.000 dan profit Rp500, reseller wajib memilih margin `fixed = 500`; jika memilih `percent = 10`, profit adalah Rp1.200.
- QRIS buyer bot memakai harga jual bot. Saat sukses, backend mencatat `bot_payment_in`, `bot_order_cost`, dan `reseller_profit` secara idempotent.
- Provider/manual/hybrid baru diproses setelah QRIS buyer sukses dan ledger saldo reseller berhasil.
- Bot session mirror wajib disimpan di `users.bot_session_id`, `users.bot_session_status`, `users.bot_connected_number`, dan `users.bot_last_active_at`.
- Admin maintenance backup/restore tetap harus preview/confirm dahulu; restore tidak boleh berjalan hanya karena file diupload.

