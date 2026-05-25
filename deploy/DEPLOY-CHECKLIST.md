# Premiumin Plus Public Deploy Checklist

## DNS

- `premiuminplus.store` points to Vercel with `A @ 76.76.21.21`.
- `www.premiuminplus.store` points to `cname.vercel-dns.com`.
- `api.premiuminplus.store` points to the Railway backend custom domain target.
- `bot.premiuminplus.store` points to the Railway bot custom domain target.

## Vercel Frontend

- Build command: `npm run build`
- Output directory: `dist`
- Env:

```env
VITE_API_BASE_URL=https://api.premiuminplus.store
VITE_BOT_ENGINE_URL=
```

Use `VITE_BOT_ENGINE_URL=https://bot.premiuminplus.store` only when direct bot realtime access is intentionally public.

## Railway Backend

- Start command: `npm run backend`
- Env template: `deploy/railway-backend.env.example`
- Health check: `https://api.premiuminplus.store/health`
- WebSocket check: `wss://api.premiuminplus.store/realtime`

## Railway Bot Engine

- Start command: `npm run bot`
- Env template: `deploy/railway-bot.env.example`
- Health check: `https://bot.premiuminplus.store/health`
- Session storage must use a persistent volume if the bot must survive service restarts.

## MongoDB Atlas

- `MONGODB_URI` is set only in Railway backend.
- TTL indexes are created by backend startup and cleanup scheduler.
- QR base64 is not persisted after payment close.
- Backup command: `npm run backup:db`
- Restore command: `npm run restore:db -- ./backups/<backup-folder>`

## Runtime Checks

- Register and login work.
- Dashboard opens without CORS errors.
- Backend realtime emits wallet/order/stock/dashboard updates.
- QRIS payment opens, closes on success, and cannot be processed twice.
- Hybrid stock uses manual stock first and provider fallback second.
- Manual stock sale decrements stock realtime.
- Provider failure rolls back the local DB transaction.
- Bot login QR appears.
- Bot `stok` follows selected template theme.
- Bot `buy 1` sends QRIS, removes QR after success, sends processing, then account.
- Deposits, withdraws, wallet sync, and profit sync work.

## Failover

- New Railway service can reuse the same MongoDB Atlas URI and env values.
- Move custom domains from old Railway services to the new services.
- Keep database persistent; do not create a new database for app runtime failover.
