# Environment Guide

Use `.env.example` as the canonical template.

## Required Backend Variables

- `NODE_ENV`
- `PORT` default `4000` for backend core.
- `PREMKU_API_KEY` or `API_KEY`
- `BASE_URL`
- `JWT_SECRET`
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `CORS_ORIGIN` or `FRONTEND_ORIGIN`
- `WEB_CORE_URL` for bot-engine calling backend core, default `http://localhost:4000`
- `BOT_ENGINE_URL` for backend core calling bot-engine, default `http://localhost:4010`
- `BOT_ENGINE_PORT` default `4010`
- `PREMKU_PAY_STATUS_CACHE_MS` default `25000`. This throttles repeated deposit/payment status checks per invoice so Premku is not hit too often.
- `PREMKU_ORDER_STATUS_CACHE_MS` default `30000`. This throttles repeated provider order status checks per invoice.
- `WEB_SESSION_TIMEOUT_MS` default `1800000` or 30 minutes. This applies only to web dashboard JWT sessions, not WhatsApp bot sessions or API-key worker traffic.
- `BOT_PAYMENT_FIRST_CHECK_MS` default `5000`. Bot WA does the first backend status check after this delay so payment feels natural.
- `BOT_PAYMENT_POLL_MS` default `20000`. Bot WA checks backend payment status at this interval; backend still protects Premku with the cache above.
- `BOT_PAYMENT_TIMEOUT_MS` default `1800000` or 30 minutes. Bot WA closes the QR flow after this local timeout.

## Required Frontend Variables

- `VITE_API_BASE_URL` optional. Leave empty for auto host detection. Set only when backend is on a different domain.
- `VITE_BOT_ENGINE_URL` optional. Leave empty for backend-proxied QR/status flow. Set only if exposing bot-engine directly or through a reverse proxy.

## Optional Variables

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_WHATSAPP`
- `PREMKU_WEBHOOK_SECRET`
- `WHATSAPP_DELIVERY_WEBHOOK`
- `WHATSAPP_DELIVERY_TOKEN`

## Canonical Local Ports

- Frontend Vite: `3000`
- Backend core/API/WebSocket: `4000`
- Bot-engine WA transport: `4010`
- MySQL: `3306`

Use:

```bash
npm run all
npm run doctor
```

`npm run all` starts frontend, backend, and bot-engine together. `npm run doctor` validates TCP ports, backend `/health`, bot-engine `/health`, and MySQL login.

## Domain Deployment

Recommended reverse proxy mapping:

- `https://your-domain.com/` -> frontend `3000` or built `dist`
- `https://api.your-domain.com` or `/api` -> backend `4000`
- bot-engine should usually stay private and reachable by backend via `BOT_ENGINE_URL=http://127.0.0.1:4010`

If frontend and backend are on the same domain behind a proxy, leave `VITE_API_BASE_URL` empty so the app uses `/api`. If they are separate domains, set `VITE_API_BASE_URL=https://api.your-domain.com/api`.

## Production Validation

When `NODE_ENV=production`, backend validates critical env values and refuses startup if:

- DB config is missing.
- Premku API key is missing.
- JWT secret is missing, too short, or still uses local default.
