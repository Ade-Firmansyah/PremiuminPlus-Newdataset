# Premiumin Pluus Public Deploy Checklist

## DNS

- `domainkamu.com` points to Vercel.
- `api.domainkamu.com` points to the VPS public IP.
- `bot.domainkamu.com` points to the VPS public IP if direct bot websocket is enabled.

## Vercel

- Build command: `npm run build`
- Output directory: `dist`
- Env:

```env
VITE_API_BASE_URL=https://api.domainkamu.com/api
VITE_BOT_ENGINE_URL=
```

Use `VITE_BOT_ENGINE_URL=https://bot.domainkamu.com` only when bot-engine is intentionally exposed through Nginx + SSL.

## VPS

```bash
npm ci
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Manual equivalent:

```bash
pm2 start backend/server.js --name premiumin-api
pm2 start bot-engine/server.js --name premiumin-bot
pm2 save
pm2 startup
```

## Nginx + SSL

```bash
sudo cp deploy/nginx-premiumin-plus.conf /etc/nginx/sites-available/premiumin-plus
sudo ln -s /etc/nginx/sites-available/premiumin-plus /etc/nginx/sites-enabled/premiumin-plus
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d api.domainkamu.com -d bot.domainkamu.com
sudo systemctl status certbot.timer
```

## Runtime Checks

- `https://domainkamu.com` opens the Vercel frontend.
- `https://api.domainkamu.com/health` returns backend health.
- `https://bot.domainkamu.com/health` returns bot-engine health if exposed.
- `pm2 status` shows `premiumin-api` and `premiumin-bot` online.
- Login/register works.
- Admin dashboard loads without CORS error.
- QRIS create/check works.
- Bot connect shows QR and stays connected after frontend tab closes.
- Realtime saldo/order updates work.
- No mixed-content errors in browser console.

