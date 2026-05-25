# Premiumin Pluus PRD

Updated: 2026-05-13

Premiumin Pluus adalah platform SaaS produk digital untuk admin, reseller, dan member. Sistem V4 memakai React, Express, MongoDB Atlas foundation, dan integrasi Premku. Backend adalah source of truth untuk user, saldo, pricing, QRIS, order, mutasi saldo, riwayat produk, dan bot WhatsApp.

## Goals

- Menjaga saldo user, bot, mutasi saldo, dan riwayat produk tetap balance.
- Memisahkan mutasi uang dari riwayat pembelian produk.
- Menjamin semua akses Premku hanya lewat backend.
- Mendukung model `1 user = 1 bot WhatsApp = 1 saldo_utama`.
- Menghindari mismatch antara dashboard member, reseller, admin, API, dan bot.
- Menjaga bot ringan, aman, dan tidak membalas grup/komunitas tanpa izin.

## Roles

- `admin`: mengelola user, produk, markup, notifikasi, withdraw, transaksi, Premku key, bot settings, dan monitoring.
- `reseller`: order memakai saldo, deposit QRIS, withdraw, API key, markup pribadi, bot WhatsApp pribadi, mutasi saldo, dan riwayat pesanan.
- `member`: register mandiri, order produk, deposit/QRIS, riwayat pesanan, mutasi saldo, profil, dan bot pribadi jika diaktifkan.

## Stack

- Frontend: React, TypeScript, Tailwind, Vite.
- Backend: Express.js, MongoDB Atlas via Mongoose foundation, JWT/API key auth, repository layer, service layer.
- Bot Engine: Node.js, Baileys, isolated session manager, WebSocket realtime QR/status.
- Provider: Premku via backend-only service.
- Realtime: core backend websocket untuk finance/order events, bot-engine websocket untuk QR/session status.
- Database: MongoDB Atlas sebagai cloud target; SQL compatibility schema tetap tersedia selama fase transisi.

## Core Rules

- Frontend tidak boleh memanggil Premku langsung.
- Premku access hanya dari backend service.
- Saldo aktif hanya `saldo_utama`.
- `saldo` disimpan sebagai compatibility alias dan harus sinkron dengan `saldo_utama`.
- `saldo_real` dan `saldo_tersedia` tidak menjadi sumber saldo aktif.
- QRIS/deposit hanya masuk mutasi saldo, bukan riwayat pesanan.
- Produk berhasil hanya masuk riwayat transaksi produk.
- Order produk menghasilkan dua catatan: mutasi saldo keluar dan riwayat transaksi produk.
- Semua mutasi saldo wajib menyimpan `saldo_sebelum`, `nominal`, dan `saldo_sesudah`.
- Invoice deposit memakai invoice asli Premku.
- Order id memakai order id asli Premku jika provider mengembalikan id tersebut.
- Bot tidak boleh menulis saldo langsung; bot selalu order lewat backend.

## Finance Model

### Deposit

1. User membuat QRIS deposit.
2. Backend memanggil Premku `/pay`.
3. Backend menyimpan invoice asli Premku.
4. User membayar QRIS.
5. Backend mengecek status melalui Premku `/pay_status`.
6. Jika sukses, backend menambah `saldo_utama`.
7. Backend menulis mutasi saldo `credit`.
8. Deposit tidak masuk riwayat pesanan.

### Order

1. User, bot, auto order, atau API membuat order.
2. Backend mengambil saldo realtime dari database.
3. Backend validasi saldo_utama cukup.
4. Backend mengurangi `saldo_utama`.
5. Backend menulis mutasi saldo `debit`.
6. Backend mengirim order ke Premku.
7. Jika sukses, backend menyimpan riwayat produk.
8. Jika provider gagal, backend melakukan refund ke `saldo_utama` dan menulis mutasi `refund`.

### Mutation vs Order History

| Activity | Mutasi Saldo | Riwayat Pesanan |
| --- | --- | --- |
| QRIS deposit success | credit | no |
| Deposit/topup manual | credit | no |
| Refund | credit | no |
| Product order debit | debit | no |
| Product delivery/result | no | yes |

## Bot WhatsApp

- Setiap user memiliki satu session bot WhatsApp pribadi.
- Bot memakai API key user untuk membaca profile, catalog, setting, dan membuat order.
- Bot order memotong saldo user yang sama.
- Bot balance harus sama dengan `saldo_utama` user.
- Bot session disimpan di `bot-engine/sessions` atau folder eksternal melalui `BOT_SESSIONS_DIR`.
- Session cleanup menghapus file session volatil agar ringan.
- Saat logout/unlink, folder session user dihapus agar connect berikutnya memunculkan QR baru.
- Vite mengabaikan folder session agar pesan WA tidak membuat web refresh/HMR.

## Bot Group Policy

- Default bot hanya membalas chat pribadi.
- Grup WhatsApp, komunitas, broadcast, newsletter, dan status tidak dibalas.
- Bot boleh membalas grup hanya jika:
  - `allow_group_reply = true`
  - JID/LID grup terdaftar pada `allowed_group_lids`
- Pesan yang memiliki `participant` dianggap sebagai grup/komunitas dan diblok kecuali allowlist cocok.

## Bot Operating Hours

- Transaksi bot memakai jam operasional Jakarta dari `open_hour`.
- Jika command `buy` datang di luar jam operasional, bot tidak membuat order.
- Bot membalas dengan informasi transaksi off dan nomor admin dari `admin_whatsapp`.

## Realtime Rules

- Dashboard hanya refresh untuk event finance/order: `wallet_updated`, `deposit_updated`, `payment_updated`, `order_updated`.
- Event bot session/status tidak boleh membuat dashboard utama refresh.
- Panel Bot WA hanya memperbarui state jika status berubah atau QR baru tersedia.
- Pesan masuk seperti `p`, `ping`, `stok` tidak boleh memicu refresh web.

## Current Production Target

Premiumin Pluus harus stabil, finance-safe, anti mismatch, bot-safe, deploy-ready, dan mudah diaudit. Semua flow transaksi harus bisa ditelusuri dari saldo sebelum, nominal, saldo sesudah, invoice/ref id, user id, dan sumber transaksi.

