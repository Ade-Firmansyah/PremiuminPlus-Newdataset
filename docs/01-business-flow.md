# Premiumin Plus - Flow Bisnis Canonical

Dokumen ini adalah ringkasan alur final project.

## Tujuan Sistem

Premiumin Plus menjual produk digital dari provider Premku melalui dashboard lokal. Sistem menjaga akun lokal, saldo lokal, transaksi, notifikasi, dan riwayat order. Premku hanya dipakai sebagai provider produk, pembayaran QRIS, order, dan status.

## Role

`member`:

- Register sendiri dari halaman login.
- Membeli produk.
- Bisa memakai saldo jika cukup.
- Jika saldo kurang, bisa bayar langsung QRIS untuk produk tersebut.
- Bisa memakai Bot Wa Setting pribadi.
- Bisa set margin up pribadi untuk harga jual bot.
- Bisa melihat Daftar Harga anggota yang mengikuti markup admin member.
- Tidak punya fitur withdraw.

`reseller`:

- Dibuat/diubah oleh admin.
- Wajib memakai saldo untuk order.
- Top up saldo lewat deposit QRIS.
- Bisa withdraw saldo.
- Bisa memakai Bot Wa Setting pribadi.
- Bisa set margin up pribadi untuk harga jual bot.

`admin`:

- Mengelola user, produk, harga, notifikasi, withdraw, transaksi, settings.
- Memantau recent orders, pending payments, recent users.
- Melihat status saldo API Premku jika endpoint profile mendukung.

## Flow Order Member

1. Member pilih produk.
2. Backend/frontend cek stok.
3. Jika stok `0`, order disabled.
4. Jika saldo cukup, order memakai `/api/order`.
5. Jika saldo kurang, UI menampilkan pilihan QRIS langsung.
6. Backend membuat row `payments`, memanggil Premku `/pay`, lalu UI menampilkan `total_bayar`.
7. Polling `/api/payments/:invoice/status`.
8. Jika sukses, backend mengunci payment, membuat transaction `payment`, mengirim order ke Premku, membuat transaction `order`, menyimpan row `orders`.
9. Credential akun disimpan di `orders.email_account` dan `orders.password_account`.
10. Delivery WhatsApp diproses atau menjadi `manual_pending`.

## Flow Order Reseller

1. Reseller pilih produk.
2. Jika stok `0`, order disabled.
3. Jika saldo kurang, backend menolak dengan `Saldo reseller tidak cukup.`
4. Jika saldo cukup, backend debit saldo secara atomic.
5. Backend kirim order ke Premku.
6. Jika Premku gagal, saldo direfund.
7. Jika sukses, credential disimpan dan delivery disiapkan.

## Flow Deposit Saldo

1. User input nominal.
2. Backend memanggil Premku `/pay`.
3. Backend menyimpan `deposits.amount` dan `deposits.total_bayar`.
4. UI menampilkan QRIS dan nominal `total_bayar`.
5. Polling `/api/deposit/:invoice`.
6. Jika sukses, backend lock deposit dan user, update saldo, insert `transactions`, `saldo_logs`, `saldo_mutations`.
7. `processed_at` mencegah saldo dobel.

## Flow Dashboard Statistik

- `Total Deposit` memakai total nominal deposit sukses dari tabel `deposits` milik akun yang sedang login.
- `Total Belanja` memakai total harga order akun dari tabel `transactions`, hanya `transaction_type = order`, bukan deposit/payment, dan tidak menghitung order `failed` atau `refunded`.
- `Total Pesanan` menghitung jumlah transaksi order akun, termasuk status order yang tercatat di riwayat, dan tetap memisahkan deposit dari pesanan.
- Line chart dashboard berasal dari data harian `/api/dashboard/summary.charts`, bukan angka statis di frontend.
- Panel `Best Penjualan` menampilkan maksimal 10 akun `member`/`reseller` tidak-suspended dengan saldo efektif tertinggi. Jika akun baru ada 4 atau 7, yang tampil 4 atau 7. Saldo efektif memakai nilai tertinggi antara `users.saldo` dan saldo terakhir `saldo_logs.balance_after`, jadi data saldo lama tetap ikut terbaca.

## Flow Stok Produk

- Produk selalu muncul di order menu, product manager, dan dashboard product list.
- `stock > 0`: badge `Tersedia`, order aktif.
- `stock = 0`: badge `Belum tersedia`, tombol order nonaktif.
- Admin mengatur base price dan admin margin di Product Management.
- User tidak melihat base price.

## Flow Harga

Harga final:

```text
base_price + admin_margin + markup_role_admin + margin_pribadi_user
```

- `member_markup`: untuk harga anggota/member.
- `reseller_markup`: untuk harga reseller.
- `markup_percent` / `reseller_margin_percent` user: margin pribadi anggota/reseller untuk Bot Wa Setting dan harga jual akun.
- Daftar Harga dashboard menampilkan harga role dari markup admin. Margin bot pribadi tidak ditambahkan ke Daftar Harga dashboard agar harga anggota/reseller tidak mismatch.
- QRIS direct member memakai harga produk sebagai `amount`, lalu UI membayar `total_bayar` dari Premku.

## Flow Bot Wa Setting

- Bot Wa Setting tersedia untuk `member` dan `reseller`.
- Setiap akun memiliki setting bot sendiri di `settings` key `bot_settings:user:{id}`.
- Setiap akun dapat menyimpan margin pribadi dalam persen lewat menu Bot Wa Setting.
- Harga katalog bot mengikuti harga admin + markup role admin + margin pribadi akun.
- Order bot memakai API backend sebagai pusat logic; bot engine tidak boleh update saldo, payment, order, atau stok langsung.
- Profit margin bot masuk ke saldo akun dan tampil di Mutasi Saldo.

## Flow Notifikasi

Admin dapat:

- create
- edit
- delete
- pin/unpin
- aktif/nonaktif

User dashboard dan topbar hanya menampilkan notifikasi aktif sesuai role atau `all`.

## Flow WhatsApp Delivery

- Default target adalah `users.phone`.
- Checkout tidak menyediakan input nomor tujuan lain.
- Backend menyimpan nomor akun terdaftar ke `target_whatsapp`.
- Jika webhook WhatsApp tersedia, backend mengirim payload.
- Jika belum tersedia, status `manual_pending`.
- Status `sent` tidak dioverwrite untuk mencegah duplicate delivery.
