# Deployment Guide

Canonical production deployment is documented in `docs/10-deployment-guide.md`.

Summary:

```text
Frontend  -> Vercel
Backend   -> VPS
BotEngine -> VPS
Database  -> VPS/MySQL
```

Vercel is for the React/Vite frontend only. Keep Express, websocket, provider sync, QRIS status, wallet transactions, and WhatsApp bot-engine on the VPS with PM2.

Quick commands:

```bash
npm ci
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

Ready-to-copy files:

- `vercel.json`
- `ecosystem.config.cjs`
- `deploy/vercel.env.example`
- `deploy/vps.backend.env.example`
- `deploy/nginx-premiumin-plus.conf`
- `deploy/DEPLOY-CHECKLIST.md`

Required public routes:

```text
domain.com     -> Vercel
api.domain.com -> VPS backend
bot.domain.com -> VPS bot-engine, optional
```

For Bot WA realtime, use `VITE_BOT_ENGINE_URL=https://bot.domainkamu.com` only if `bot.domainkamu.com` is public. Otherwise keep it empty and let the backend proxied status flow handle QR updates.
