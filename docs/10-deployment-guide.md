# 10 Deployment Guide

Premiumin Plus production deploy uses a hybrid model:

```text
Frontend  -> Vercel
Backend   -> VPS
BotEngine -> VPS
Database  -> VPS/MySQL
```

Do not deploy backend websocket or WhatsApp bot-engine to Vercel. Vercel is serverless; WhatsApp sessions, websocket connections, QR status, provider sync, and background workers need a long-running VPS process.

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
VITE_API_BASE_URL=https://api.domain.com/api
VITE_BOT_ENGINE_URL=
```

Leave `VITE_BOT_ENGINE_URL` empty for the backend-proxied Bot WA flow. Set it to `https://bot.domain.com` only if bot-engine is intentionally public with TLS and CORS. Do not set it to `https://api.domain.com`; backend core and bot-engine use different websocket protocols.

`vercel.json` rewrites all routes to `index.html`, so dashboard/admin refresh works.

Template file: `deploy/vercel.env.example`.

## VPS: Backend + Bot + MySQL

Install Node.js, MySQL, Nginx, PM2, and clone the repo on the VPS.

```bash
npm ci
npm run build
```

Backend and bot-engine stay on the VPS:

```bash
pm2 start backend/server.js --name premiumin-api
pm2 start bot-engine/server.js --name premiumin-bot
pm2 save
pm2 startup
```

Alternatively use the included PM2 ecosystem file:

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

## VPS Env

Backend `.env`:

```env
NODE_ENV=production
PORT=4000
API_KEY=YOUR_PREMKU_API_KEY
BASE_URL=https://premku.com/api/
JWT_SECRET=CHANGE_THIS_LONG_RANDOM_SECRET
PREMKU_WEBHOOK_SECRET=

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=premiumin
DB_PASSWORD=CHANGE_THIS_DB_PASSWORD
DB_NAME=apps_premhytam

FRONTEND_ORIGIN=https://domain.com
CORS_ORIGIN=https://domain.com
WEB_CORE_URL=https://api.domain.com
BOT_ENGINE_URL=http://127.0.0.1:4010
BOT_ENGINE_PORT=4010
BOT_ENGINE_CORS_ORIGIN=https://domain.com
BOT_SESSIONS_DIR=./bot-engine/sessions

DASHBOARD_CACHE_MS=30000
PRODUCTS_CACHE_MS=20000
BOT_CATALOG_CACHE_MS=20000
PROVIDER_SYNC_INTERVAL_MS=60000
PROVIDER_PRODUCT_SYNC_INTERVAL_MS=60000
VERBOSE_SYSTEM_LOGS=false
VERBOSE_PREMKU_LOGS=false
```

Keep Premku key, JWT secret, webhook secret, DB password, and delivery tokens only in environment variables. Never put provider keys in frontend env.

Template file: `deploy/vps.backend.env.example`.

## Nginx Reverse Proxy

Recommended DNS:

```text
domain.com     -> Vercel frontend
api.domain.com -> VPS backend
bot.domain.com -> VPS bot-engine, optional public access
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

Default local/VPS path is also valid:

```text
BOT_SESSIONS_DIR=./bot-engine/sessions
```

Do not store `bot-engine/sessions/` in git. Do not use Vercel or ephemeral filesystem for bot sessions. Browser logout or dashboard close does not disconnect the WhatsApp session.

## Public Access Checklist

Detailed checklist: `deploy/DEPLOY-CHECKLIST.md`.

## Final Checklist

- Vercel frontend opens `https://domain.com`.
- `https://api.domain.com/health` returns backend health.
- `https://api.domain.com/realtime` upgrades websocket through Nginx.
- `http://127.0.0.1:4010/health` works from VPS.
- Optional `https://bot.domain.com/health` works if bot-engine is exposed.
- MySQL is reachable from backend.
- QRIS deposit and direct order status work.
- Member, reseller, and admin dashboard load without CORS errors.
- Bot QR login works and session survives frontend close.
- `pm2 status` shows `premiumin-api` and `premiumin-bot` online.
- `pm2 save` has been run after processes are online.
