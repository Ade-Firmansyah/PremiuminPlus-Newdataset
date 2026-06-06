# 08-deployment

> Source of truth aktif Premiumin Plus. PRD lama dari `legacy/archive/fase-1-docs-cleanup/docs` sudah digabung, divalidasi, lalu duplicate archive dihapus agar tidak ada dua sumber kontrak.

---

## Merged from `10-deployment.md`

# Deployment Contract

Frontend:

- Folder: `apps/web`
- Build: `npm run build`
- Env: `VITE_API_BASE_URL=/api`

Backend:

- Folder: `apps/api/backend`
- Start: `npm run backend`
- Health: `https://premiuminplus.store/health`

Bot Engine:

- Folder: `apps/bot-engine`
- Start: `npm run bot`
- Env: `BOT_API_BASE_URL=https://premiuminplus.store/api`

Railway MySQL/MariaDB menjadi database production.



---

## Merged from `10-deployment-guide.md`

# Premiumin Plus V3.2 Deployment Guide

## Vercel Frontend

Root:

```text
apps/web
```

Local dev:

```bash
npm run dev:web
```

Vite source:

```text
apps/web/src/main.tsx
apps/web/src/App.tsx
```

Local URL:

```text
http://localhost:3000
```

Build:

```bash
npm install
npm run build
```

Output:

```text
dist
```

Env:

```env
VITE_API_BASE_URL=https://api.premiuminplus.com/api
```

Do not store Premku API key in frontend.

## Railway Backend

Root:

```text
apps/api/backend
```

Start:

```bash
npm run backend
```

Env:

```env
NODE_ENV=production
PORT=4000

DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=
DB_CREATE_IF_MISSING=false

BASE_URL=
FRONTEND_URL=

PREMKU_API_KEY=
API_KEY=

ADMIN_USERNAME=
ADMIN_PASSWORD=
ADMIN_WHATSAPP=

DATA_RETENTION_DAYS=7
MAINTENANCE_INTERVAL_MINUTES=1440
PAYMENT_QR_TTL_MINUTES=5

WHATSAPP_DELIVERY_WEBHOOK=
WHATSAPP_DELIVERY_TOKEN=

ADMIN_MONITORING_LID=64957102211197@lid
BOT_LOCKED_BALANCE_MIN=50000
```

`PREMKU_API_KEY` is bootstrap only. Runtime source is database settings.

## Railway Bot Engine

Root:

```text
apps/bot-engine
```

Start:

```bash
npm run bot
```

Env:

```env
NODE_ENV=production
PORT=4001

BOT_API_BASE_URL=https://premiumin-backend.up.railway.app/api
BOT_RESELLER_API_KEY=
BOT_SESSION_ID=

ADMIN_MONITORING_LID=64957102211197@lid
```

Bot Engine must not access database directly.

## Vercel Observability

Frontend production includes Vercel Speed Insights:

```tsx
import { injectSpeedInsights } from '@vercel/speed-insights';
```

The injector is called in `apps/web/src/main.tsx`. It must stay frontend-only and must not add backend polling or expose provider keys.

## Final Deploy Rule

- Push to `main` triggers Vercel/Railway auto deploy when the GitHub integrations are connected.
- Run `npm run build` before push.
- Backend and bot services must keep separate Railway roots:
  - `apps/api/backend`
  - `apps/bot-engine`
- Admin maintenance backup/restore must remain preview-and-confirm based; uploaded backup files are not restored until confirm is clicked.

