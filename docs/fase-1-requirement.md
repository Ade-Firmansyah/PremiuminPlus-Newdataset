# Fase 1 - Tujuan Produk dan Scope

## Visi Produk

Premiumin Plus adalah platform produk digital untuk tiga role utama:

- `admin`: mengontrol ekosistem, user, produk, harga, finance, notifikasi, dan monitoring.
- `reseller`: menjual produk digital memakai saldo reseller, Bot Wa Setting, dan margin pribadi.
- `member`: membeli produk digital langsung dari dashboard, memakai saldo jika tersedia atau QRIS langsung jika saldo kurang, serta bisa memakai Bot Wa Setting dan margin pribadi.

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
5. Member dan reseller dapat mengatur markup/margin pribadi selama tetap dalam batas backend.
6. Withdraw hanya tersedia untuk reseller/admin.

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
