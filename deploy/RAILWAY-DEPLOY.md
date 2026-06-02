# Premiumin Plus Production Deploy

Gunakan file ini sebagai panduan final Vercel, Railway, MySQL, Bot Engine, dan Hostinger. Jangan commit API key, password admin, atau password database asli ke GitHub.

## DNS Hostinger

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | `216.198.79.1` | `300` |
| CNAME | `www` | `cname.vercel-dns.com` | `300` |
| CNAME | `api` | `l9rfv462.up.railway.app` | `300` |
| TXT | `_railway-verify.api` | `railway-verify=145ef4a549e5f536f9a0f01d89f6ab936cbbe57091f918b98d3f9e3e91b76fe3` | `300` |

Jangan hapus TXT verify Railway selama custom domain masih proses verifikasi.

## Vercel Frontend

- Framework: `Vite`
- Root Directory: `apps/web`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`
- Variables: copy dari `deploy/vercel.env.example`

Jika Vercel project memakai repo root, gunakan Build Command `npm run build` dan Output Directory `apps/web/dist`. `vercel.json` di root menjaga refresh route React tidak 404 untuk konfigurasi repo-root.

## Backend

- Root Directory: `apps/api/backend`
- Build Command: `npm install`
- Start Command: `npm run backend`
- Variables: copy dari `deploy/railway-backend.env.example`

Cara paling aman adalah memakai variable MySQL bawaan Railway dari service database, bukan domain aplikasi `*.up.railway.app`.

Pastikan MySQL service di Railway bernama `MySQL`. Jika namanya beda, ubah semua reference:

```txt
${{MySQL.MYSQLHOST}}
${{MySQL.MYSQLPORT}}
${{MySQL.MYSQLUSER}}
${{MySQL.MYSQLPASSWORD}}
${{MySQL.MYSQLDATABASE}}
```

Backend juga mendukung variable native berikut. Isi juga set ini untuk menghindari reference yang tidak resolve:

```txt
MYSQLHOST
MYSQLPORT
MYSQLUSER
MYSQLPASSWORD
MYSQLDATABASE
```

Contoh jika service database bernama `premiumin-db`:

```txt
${{premiumin-db.MYSQLHOST}}
```

Jangan memakai domain aplikasi Railway `*.up.railway.app` sebagai `DB_HOST` database. Domain itu hanya untuk HTTP service, bukan koneksi MySQL TCP.

## Bot Engine

- Root Directory: `apps/bot-engine`
- Build Command: `npm install`
- Start Command: `npm run bot`
- Variables: copy dari `deploy/railway-bot.env.example`

Bot engine package project memakai `apps/bot-engine/index.js`, jadi jangan mengganti start script menjadi `node server.js` kecuali file `server.js` memang dibuat.

## Nilai Yang Tidak Boleh Dipakai Di Production

```env
DB_HOST=127.0.0.1
DB_HOST=xxxx.up.railway.app
DB_PORT=3306
BOT_API_BASE_URL=http://localhost:4000/api
VITE_API_BASE_URL=https://premiuminplus.store
DB_PASSWORD=${{MySQL.MYSQLDATABASE}}
```

Gunakan:

```env
DB_HOST=${{MySQL.MYSQLHOST}}
DB_USER=${{MySQL.MYSQLUSER}}
BOT_API_BASE_URL=https://api.premiuminplus.store/api
VITE_API_BASE_URL=https://api.premiuminplus.store/api
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
```

## Package Notes

`apps/api/backend/package.json` harus tetap `type: module` dan menyertakan `bcryptjs`, karena backend memakai ES module import dan `apps/api/backend/src/utils/password.js`.

`apps/bot-engine/package.json` harus tetap memakai `index.js`, karena entrypoint bot saat ini adalah `apps/bot-engine/index.js`.

## Final Targets

- Frontend: `https://premiuminplus.store`
- Backend: `https://api.premiuminplus.store`
- Bot: `https://bot.premiuminplus.store`
