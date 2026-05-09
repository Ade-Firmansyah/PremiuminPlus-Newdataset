# Struktur Project Premiumin Plus

Dokumen ini merapikan isi project saat ini dan memetakan implementasi Premiumin Plus sebagai platform produk digital admin/reseller/member.

## Environment

File `.env` lokal berisi variabel:

- `API_KEY`
- `BASE_URL`
- `ADMIN_WHATSAPP`
- `WHATSAPP_DELIVERY_WEBHOOK` optional
- `WHATSAPP_DELIVERY_TOKEN` optional
- `BOT_API_BASE_URL` optional untuk bot-engine
- `BOT_RESELLER_API_KEY` optional untuk bot-engine
- `BOT_SESSION_ID` optional untuk bot-engine
- `ADMIN_MONITORING_LID` optional, default `64957102211197@lid`
- `DATA_RETENTION_DAYS` optional, default `7`
- `MAINTENANCE_INTERVAL_MINUTES` optional, default `1440`
- `PAYMENT_QR_TTL_MINUTES` optional, default `5`

Nilai rahasia tidak ditulis ulang di dokumentasi. Untuk contoh publik gunakan `.env.example`.

## Frontend Saat Ini

- `src/App.tsx`: routing utama dan proteksi login sederhana.
- `src/pages/LoginPage.tsx`: halaman login.
- `src/pages/DashboardPage.tsx`: dashboard member/reseller.
- `src/pages/AdminPanelPage.tsx`: admin shell dan routing halaman admin.
- `src/pages/admin/data`: tipe data admin UI.
- `src/pages/admin/pages`: admin dashboard, user management, monitoring transaksi, product management, setting markup, notification management, bot settings.
- `src/components/layout`: shell, sidebar, topbar.

## Backend Scaffold

Struktur backend fase sudah disiapkan di:

```text
backend/
  server.js
  src/
    app.js
    config/
    modules/
    routes/
    services/
    repositories/
    middlewares/
    utils/
    workers/
```

`backend/src/services/cache.service.js` adalah cache memory ringan untuk produk, dashboard, bot catalog, leaderboard, admin summary, dan guard status payment.

`backend/src/services/maintenance.service.js` berjalan otomatis saat backend start. Service ini meng-expire QR pending yang melewati timer, mengarsipkan summary finance harian, dan menghapus histori operasional lama sesuai retensi.

## Bot Engine Scaffold

Struktur bot dipisah dari web-core:

```text
bot-engine/
  sessions/
  sockets/
  handlers/
  queue/
  reconnect/
  api-client/
  notifications/
  utils/
  index.js
```

Bot engine memakai web API sebagai pusat logic. Jangan menaruh update saldo, payment success, atau order Premku langsung di bot.

## Database

Schema fase ada di:

- `database/schema.mysql.sql`

Schema runtime paling aman tetap berasal dari `backend/src/config/db.js` karena backend melakukan auto validation dan migration saat startup. File `database/schema.mysql.sql` hanya referensi manual.

Tabel runtime tambahan untuk performa:

- `finance_daily_summaries`
- `websocket_events`
- `temp_notifications`
- `realtime_cache`
- `polling_logs`

## Dokumen Fase Canonical

- `docs/fase-1-requirement.md`
- `docs/01-business-flow.md`
- `docs/fase-2-database.md`
- `docs/fase-3-architecture-api.md`
- `docs/fase-4-backend-implementation.md`
- `docs/02-ecosystem-architecture.md`
- `docs/03-bot-engine.md`
- `docs/04-stability-audit.md`
- `docs/05-provider-sync.md`
