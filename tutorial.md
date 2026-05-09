# Tutorial Menjalankan Project Premiumin Plus

Panduan ini untuk menjalankan project di Windows dari folder:

```powershell
D:\CODING\PremiuminPlus-Web - Copy - Copy
```

Project ini terdiri dari:

- Frontend React/Vite di port `3000`
- Backend Node/Express di port `4000`
- Database MySQL dengan nama `apps_premhytam`

## 1. Masuk ke Folder Project

Buka CMD atau PowerShell, lalu jalankan:

```powershell
cd "D:\CODING\PremiuminPlus-Web - Copy - Copy"
```

## 2. Aktifkan MySQL

Di komputer ini service MySQL bernama `MySQL97`.

Jalankan CMD atau PowerShell sebagai Administrator, lalu:

```powershell
net start MySQL97
```

Jika MySQL sudah aktif, biasanya muncul pesan bahwa service sudah berjalan.

Untuk mengecek status MySQL:

```powershell
Get-Service MySQL97
```

Status yang benar:

```text
Running
```

## 3. Cek Konfigurasi Database

File konfigurasi ada di `.env`.

Bagian pentingnya:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_NAME=apps_premhytam
VITE_API_BASE_URL=http://localhost:4000/api
```

Jika password MySQL lokal berbeda, ubah bagian:

```env
DB_PASSWORD=root
```

sesuai password MySQL yang benar.

## 4. Jalankan Backend

Masih di folder project, jalankan:

```powershell
npm run backend
```

Jika berhasil, akan muncul:

```text
Premiumin Plus backend running on port 4000
```

Biarkan terminal backend tetap terbuka. Jika terminal ditutup, backend ikut mati.

Backend akan otomatis membuat database dan tabel jika belum ada.

## 5. Cek Backend Aktif

Buka browser:

```text
http://localhost:4000/health
```

Jika aktif, hasilnya:

```json
{"status":true,"service":"premiumin-plus-backend"}
```

Jika muncul error atau tidak bisa dibuka, berarti backend belum aktif atau crash.

## 6. Jalankan Frontend

Buka terminal CMD atau PowerShell baru.

Masuk lagi ke folder project:

```powershell
cd "D:\CODING\PremiuminPlus-Web - Copy - Copy"
```

Lalu jalankan:

```powershell
npm run dev
```

Jika berhasil, frontend aktif di:

```text
http://localhost:3000
```

## 7. Urutan Menjalankan Project

Urutan yang disarankan:

1. Aktifkan MySQL:

```powershell
net start MySQL97
```

2. Jalankan backend:

```powershell
npm run backend
```

3. Jalankan frontend di terminal lain:

```powershell
npm run dev
```

4. Buka aplikasi:

```text
http://localhost:3000
```

## 8. Flow Bisnis Utama

Role di sistem hanya:

- `admin`
- `reseller`
- `member`

Member bisa order produk. Jika saldo member tidak cukup, halaman order akan menawarkan pembayaran langsung QRIS untuk nominal produk tersebut.

Reseller berbeda: reseller wajib punya saldo. Jika saldo reseller tidak cukup, order ditolak dan reseller harus top up saldo dulu.

Admin mengatur:

- user/member/reseller
- produk
- markup anggota
- markup reseller
- deposit dan transaksi
- withdraw
- bot settings
- notifikasi aktif/pin/nonaktif

Stok produk:

- Jika stok lebih dari `0`, produk tampil sebagai `Tersedia`.
- Jika stok `0`, produk tetap muncul di katalog tetapi tombol order dinonaktifkan dan badge menjadi `Belum tersedia`.

Realtime dashboard:

- Admin dan dashboard member/reseller refresh otomatis setiap 30 detik.
- Backend memakai cache ringan agar refresh tidak membebani Premku atau database.
- Produk lokal/cache stok disimpan 15 detik, sinkron Premku 60 detik, analytics dashboard 30 detik, dan cek status pembayaran diberi guard 5 detik per invoice.
- Data yang ikut dipantau: order terbaru, payment pending, user terbaru, saldo, dan produk.

Pemeliharaan data:

- Backend menjalankan scheduler otomatis setiap hari.
- Riwayat operasional detail seperti transaksi, mutasi, QR terminal, log realtime, dan cache polling yang lebih dari 7 hari akan dibersihkan.
- Saldo user, data user, produk, setting admin, order credential, dan ringkasan finance admin tidak dihapus.

Pengiriman WhatsApp:

- Default pengiriman hasil order memakai nomor WhatsApp yang terdaftar di akun.
- Input nomor tujuan tambahan sudah dihapus agar checkout lebih ringan dan konsisten.
- Jika gateway `WHATSAPP_DELIVERY_WEBHOOK` belum disetting, status delivery menjadi `manual_pending`, bukan dianggap terkirim.

Theme aplikasi sekarang hanya memakai dark neon Premiumin Plus. Toggle dark/light sudah tidak dipakai.

## 9. Jika Muncul Pesan Backend Belum Aktif atau CORS Belum Terbuka

Pesan ini biasanya muncul karena backend belum jalan atau backend crash.

Cek backend:

```text
http://localhost:4000/health
```

Jika tidak bisa dibuka, jalankan ulang backend:

```powershell
cd "D:\CODING\PremiuminPlus-Web - Copy - Copy"
npm run backend
```

CORS di backend project ini sudah terbuka melalui file:

```text
backend/src/app.js
```

Jadi jika pesan CORS muncul, penyebab paling sering adalah backend mati.

## 10. Jika Backend Crash Saat Hapus User

Jika muncul error seperti:

```text
Cannot delete or update a parent row: a foreign key constraint fails
```

Artinya user yang ingin dihapus masih memiliki data terkait, misalnya riwayat saldo di tabel `saldo_logs`.

Solusi aman:

- Jangan hapus user tersebut secara permanen.
- Ubah status user menjadi `inactive` atau `Nonaktif`.

Project ini sudah diperbaiki agar backend tidak crash saat kasus tersebut terjadi. Backend akan mengembalikan pesan error yang lebih jelas.

## 11. Command Cepat

Aktifkan MySQL:

```powershell
net start MySQL97
```

Jalankan backend:

```powershell
cd "D:\CODING\PremiuminPlus-Web - Copy - Copy"
npm run backend
```

Jalankan frontend:

```powershell
cd "D:\CODING\PremiuminPlus-Web - Copy - Copy"
npm run dev
```

Cek backend:

```text
http://localhost:4000/health
```

Cek frontend:

```text
http://localhost:3000
```
