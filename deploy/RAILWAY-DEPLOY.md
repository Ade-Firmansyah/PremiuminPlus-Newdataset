# Premiumin Plus Railway Deploy

Gunakan file ini sebagai panduan copy-paste variables ke Railway. Jangan commit API key, password admin, atau password database asli ke GitHub.

## Backend

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm run backend`
- Variables: copy dari `deploy/railway-backend.env.example`

Pastikan MySQL service di Railway bernama `MySQL`. Jika namanya beda, ubah semua reference:

```txt
${{MySQL.MYSQLHOST}}
${{MySQL.MYSQLPORT}}
${{MySQL.MYSQLUSER}}
${{MySQL.MYSQLPASSWORD}}
${{MySQL.MYSQLDATABASE}}
```

Contoh jika service database bernama `premiumin-db`:

```txt
${{premiumin-db.MYSQLHOST}}
```

## Bot Engine

- Root Directory: `bot-engine`
- Build Command: `npm install`
- Start Command: `npm run bot`
- Variables: copy dari `deploy/railway-bot.env.example`

## Vercel

- Framework: `Vite`
- Root Directory: `./`
- Build Command: `npm run build`
- Output Directory: `dist`
- Variables: copy dari `deploy/vercel.env.example`

## Nilai Yang Tidak Boleh Dipakai Di Production

```env
DB_HOST=127.0.0.1
BOT_API_BASE_URL=http://localhost:4000/api
VITE_API_BASE_URL=https://premiuminplus.store
DB_PASSWORD=${{MySQL.MYSQLDATABASE}}
```

Gunakan:

```env
DB_HOST=${{MySQL.MYSQLHOST}}
BOT_API_BASE_URL=https://api.premiuminplus.store/api
VITE_API_BASE_URL=https://api.premiuminplus.store/api
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
```
