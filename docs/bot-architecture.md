# Bot Architecture

`bot-engine/` is the active WhatsApp transport for personal user bots. The canonical detailed document is `docs/08-bot-architecture.md`.

## Boundary

- Bot engine authenticates through backend API using the owning user's API key.
- Bot engine may read profile, catalog, order status, and bot settings.
- Bot engine may create an order only through backend `/api/bot/order`.
- Bot engine must not write saldo, deposits, payments, orders, pricing, or settings directly in MySQL.
- Finance and provider mutations stay in `backend/src`.

## API Shape

- `GET /api/bot/profile`
- `GET /api/bot/catalog`
- `POST /api/bot/order`
- `POST /api/bot/session/connect`
- `GET /api/bot/session/status`
- `POST /api/bot/session/logout`

## Runtime Ports

- Frontend runs on `3000` in local dev.
- Backend core runs on `4000` and remains the public API source of truth.
- Bot-engine runs on `4010` and should normally stay private.
- MySQL runs on `3306`.

Bot connect/disconnect is proxied through backend core. The frontend should not depend on direct bot-engine access unless `VITE_BOT_ENGINE_URL` is intentionally configured.

## Safety

- One user owns one WhatsApp bot session.
- Bot balance is the same `saldo_utama` as the owning user.
- Bot orders must validate and debit `saldo_utama` through backend wallet service.
- Bot ignores groups, communities, broadcasts, newsletters, and status messages unless the group JID/LID is allowlisted.
- Bot session can be disabled without touching finance state.
