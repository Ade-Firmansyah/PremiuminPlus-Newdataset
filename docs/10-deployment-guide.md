# 10 Deployment Guide

Premiumin Plus V4 production deploy target:

```text
Frontend  -> Vercel
Backend   -> Railway
BotEngine -> Railway
Database  -> MongoDB Atlas
Domain    -> Hostinger DNS
```

Do not deploy backend websocket or WhatsApp bot-engine to Vercel. Vercel is serverless; WhatsApp sessions, websocket connections, QR status, provider sync, and background workers need long-running Railway services.

## Frontend: Vercel

Use Vercel only for the React/Vite static frontend.

Build command:

```bash
npm run build
```

Output directory:

```text
dist
```

Required Vercel env:

```env
VITE_API_BASE_URL=https://api.premiuminplus.store
VITE_BOT_ENGINE_URL=
```

The frontend automatically appends `/api` when `VITE_API_BASE_URL` is a root API domain. Leave `VITE_BOT_ENGINE_URL` empty for the backend-proxied Bot WA flow. Set it to `https://bot.premiuminplus.store` only if bot-engine is intentionally public with TLS and CORS. Do not set it to the API domain; backend core and bot-engine use different websocket protocols.

`vercel.json` rewrites all routes to `index.html`, so dashboard/admin refresh works.

Template file: `deploy/vercel.env.example`.

## Railway: Backend + Bot

Use two Railway services from the same repo.

Backend start command:

```bash
npm run backend
```

Bot engine start command:

```bash
npm run bot
```

## Railway Env

Backend `.env`:

```env
NODE_ENV=production
PORT=4000
API_KEY=YOUR_PREMKU_API_KEY
BASE_URL=https://premku.com/api/
JWT_SECRET=CHANGE_THIS_LONG_RANDOM_SECRET
PREMKU_WEBHOOK_SECRET=
MONGODB_URI=mongodb+srv://...
MONGODB_DBNAME=premiuminpluus

FRONTEND_ORIGIN=https://premiuminplus.store
CORS_ORIGIN=https://premiuminplus.store,https://www.premiuminplus.store
BOT_ENGINE_URL=https://bot.premiuminplus.store
BOT_ENGINE_PORT=4010

DASHBOARD_CACHE_MS=30000
PRODUCTS_CACHE_MS=15000
BOT_CATALOG_CACHE_MS=15000
CLEANUP_RETENTION_DAYS=7
PROVIDER_SYNC_INTERVAL_MS=60000
PROVIDER_PRODUCT_SYNC_INTERVAL_MS=60000
VERBOSE_SYSTEM_LOGS=false
VERBOSE_PREMKU_LOGS=false
```

Keep Premku key, JWT secret, webhook secret, DB password, and delivery tokens only in environment variables. Never put provider keys in frontend env.

Template file: `.env.example`.
Railway backend template: `deploy/railway-backend.env.example`.
Railway bot template: `deploy/railway-bot.env.example`.

Important current-state note: the MongoDB Atlas connection, TTL indexes, backup scripts, QR cleanup, and wallet Mongo session path are ready. The active core repositories for users/products/orders/payments still use the legacy SQL adapter in this codebase, so production backend still needs the SQL env variables until those repositories are fully migrated to MongoDB.

Run the production mismatch audit before claiming MongoDB-only production:

```bash
npm run audit:production
```

Detailed gate: `docs/13-final-production-readiness-audit.md`.

## Hostinger DNS

Set these records after Vercel and Railway custom domains are attached:

```text
Type  Name  Value
A     @     76.76.21.21
CNAME www   cname.vercel-dns.com
CNAME api   <your Railway backend custom-domain target>
CNAME bot   <your Railway bot custom-domain target>
```

Final public URLs:

```text
https://premiuminplus.store      -> Vercel frontend
https://api.premiuminplus.store  -> Railway backend
https://bot.premiuminplus.store  -> Railway bot engine
```

## Optional VPS Reverse Proxy

This section is only for self-hosted/VPS deployments. For the V4 target, prefer Railway custom domains and Hostinger DNS records instead of Nginx.

Legacy DNS:

```text
domain.com     -> Vercel frontend
api.domain.com -> Railway backend custom domain
bot.domain.com -> Railway bot-engine custom domain, optional public access
```

Backend proxy:

```nginx
server {
  server_name api.domain.com;

  location /realtime {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Optional bot-engine proxy:

```nginx
server {
  server_name bot.domain.com;

  location /realtime {
    proxy_pass http://127.0.0.1:4010;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    proxy_pass http://127.0.0.1:4010;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Use Certbot or another ACME client for SSL on `api.domain.com` and `bot.domain.com`.

Ready-to-copy Nginx template: `deploy/nginx-premiumin-plus.conf`.

Certbot command:

```bash
sudo certbot --nginx -d api.domain.com -d bot.domain.com
```

Check auto-renew:

```bash
sudo systemctl status certbot.timer
```

## WhatsApp Session Persistence

WhatsApp auth state must live on persistent disk:

```text
BOT_SESSIONS_DIR=/var/lib/premiumin-plus/bot-sessions
```

Default local path is also valid:

```text
BOT_SESSIONS_DIR=./bot-engine/sessions
```

Do not store `bot-engine/sessions/` in git. Do not use Vercel or ephemeral filesystem for bot sessions. Browser logout or dashboard close does not disconnect the WhatsApp session.

## MongoDB Atlas Free-Tier Retention

- Target storage: Atlas free tier 512MB.
- Store the Atlas URI only in Railway/backend environment variables as `MONGODB_URI`.
- Do not hard-code or commit database username, password, IP allowlist, or full URI.
- Backend uses `backend/src/config/database.js` with Mongoose, pings MongoDB before listening, then ensures collections and indexes.
- Temporary Mongo collections use `created_at` and `expires_at`.
- `dailyCleanupScheduler()` runs every 24 hours and ensures TTL indexes on `webhook_logs`, `provider_logs`, `temporary_socket_logs`, `realtime_cache`, `expired_qr`, `temporary_notifications`, `temporary_bot_logs`, `unused_sessions`, `expired_payment_cache`, `failed_temp_orders`, and `stale_activity_logs`.
- Permanent data is not auto-deleted: users, wallets, wallet mutations, orders, successful payments, products, manual stock, settings, withdrawals, deposits, and completed transactions.
- QR payloads are temporary in memory. Base64 QR/image blobs are not persisted; successful, expired, failed, and canceled invoices clear QR fields.
- Backup before migration: `npm run backup:db`
- Restore to a new cluster: `npm run restore:db -- ./backups/<backup-folder>`
- If Atlas free-tier storage fills up: run backup, create a new cluster, restore into it, then update `MONGODB_URI`.

## Cloud Deployment Target

- Frontend: Vercel, build command `npm run build`.
- Backend: Railway, start command `npm run backend`.
- Bot engine: Railway, start command `npm run bot`.
- Database: MongoDB Atlas free tier.
- Domain/DNS: Hostinger, point frontend and API subdomain to the deployed services.

Minimum Railway backend env:

```text
MONGODB_URI=...
JWT_SECRET=...
API_KEY=...
FRONTEND_ORIGIN=https://premiuminplus.store
CORS_ORIGIN=https://premiuminplus.store,https://www.premiuminplus.store
BOT_ENGINE_URL=https://bot.premiuminplus.store
```

## Railway Failover

If a Railway free-tier project hits limits:

1. Create a new Railway project/service from the same Git repo.
2. Reuse the same `MONGODB_URI`, `MONGODB_DBNAME`, JWT secret, Premku key, webhook secret, and bot session volume strategy.
3. Attach the same custom domains after removing them from the old service.
4. Do not create a new database unless Atlas itself is full or unhealthy.
5. Run `npm run backup:db` before switching database clusters.

## Public Access Checklist

Detailed checklist: `deploy/DEPLOY-CHECKLIST.md`.

## Final Checklist

- Vercel frontend opens `https://domain.com`.
- `https://api.domain.com/health` returns backend health.
- `https://api.domain.com/realtime` upgrades websocket through Railway.
- Bot Railway service `/health` works.
- Optional `https://bot.domain.com/health` works if bot-engine is exposed.
- MongoDB Atlas is reachable from backend.
- QRIS deposit and direct order status work.
- Member, reseller, and admin dashboard load without CORS errors.
- Bot QR login works and session survives frontend close.
