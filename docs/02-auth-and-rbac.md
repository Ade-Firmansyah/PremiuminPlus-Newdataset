# 02-auth-and-rbac

> Source of truth aktif Premiumin Plus. PRD lama dari `legacy/archive/fase-1-docs-cleanup/docs` sudah digabung, divalidasi, lalu duplicate archive dihapus agar tidak ada dua sumber kontrak.

## FASE 2 Audit Lock

- Login menerima username, email, atau phone; password diverifikasi dengan hash backend.
- Register member wajib username, email valid, phone angka yang dinormalisasi `08` ke `62`, password minimal 6, dan insert user berjalan atomic.
- Forgot password memakai response aman dan tidak membocorkan apakah akun ada.
- Admin seed memakai `ADMIN_USERNAME` dan `ADMIN_PASSWORD`/`ADMIN_PASSWORD_HASH`; `ADMIN_FORCE_RESET=true` hanya untuk reset sementara akun admin env.
- API auth aktif hanya `auth.middleware.js`; middleware auth lama diarsipkan agar tidak ada RBAC ganda.
- `x-api-key` kosong ditolak sebelum query database.
- Login sukses mencatat `last_login_at`.
- Member tidak boleh mengakses managed Bot Engine; reseller/admin memakai guard `resellerOnly`.

---

## Merged from `02-auth.md`

# Auth Contract

Login memakai username/email/phone dan password. Backend mengembalikan API key user yang dipakai frontend untuk header `x-api-key`.

Admin bootstrap hanya dari env saat startup dan harus dimatikan lagi setelah produksi:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_FORCE_RESET=false` setelah login berhasil

Session frontend disimpan sesuai pilihan remember me. Provider key tidak pernah disimpan di frontend atau localStorage.


