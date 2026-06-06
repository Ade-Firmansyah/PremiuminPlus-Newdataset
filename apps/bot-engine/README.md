# Premiumin Plus Bot Engine

Bot engine ini adalah worker ringan untuk WhatsApp anggota/reseller.

Prinsip utama:

- Web API adalah main brain.
- Bot tidak menyimpan business logic finance.
- Bot hanya membaca catalog/settings dari web API, mengirim command order ke web API, lalu mengirim response ke WhatsApp.
- Satu anggota/reseller memakai satu session folder dan satu API key.

Status implementasi saat ini:

- Struktur session, reconnect, queue, handler, HTTP control API, dan API client sudah disiapkan.
- Baileys socket nyata memakai `useMultiFileAuthState`, `saveCreds`, QR base64, listener cleanup, dan reconnect backoff.
- Endpoint web-core tersedia:
  - `GET /api/bot/profile`
  - `GET /api/bot/catalog`
  - `POST /api/bot/order`
  - `POST /api/bot/payments`
  - `GET /api/bot/payments/:invoice/status`
  - `POST /api/bot/payments/:invoice/cancel`
- Bot-engine control API tersedia:
  - `POST /sessions/:sessionId/connect`
  - `GET /sessions/:sessionId/status`
  - `POST /sessions/:sessionId/logout`

Environment:

```env
BOT_API_BASE_URL=https://premiuminplus.store/api
BOT_ENGINE_PORT=4100
BOT_ENGINE_TOKEN=
BOT_RESELLER_API_KEY=
ADMIN_MONITORING_LID=64957102211197@lid
BOT_SESSION_ID=default
```

Run:

```bash
node bot-engine/index.js
```

Web-core should set:

```env
BOT_ENGINE_URL=https://bot.premiuminplus.store
BOT_ENGINE_TOKEN=
```

Jika bot-engine mati, web-core tetap aman berjalan; hanya QR/status bot yang mengembalikan error konfigurasi/koneksi.
