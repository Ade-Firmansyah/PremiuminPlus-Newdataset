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
