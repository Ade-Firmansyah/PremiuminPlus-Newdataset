# Premiumin Plus Bot Engine

Isolated WhatsApp transport for Premiumin Plus.

- Uses Baileys Multi Device with `useMultiFileAuthState`.
- Stores one session folder per user in `bot-engine/sessions/{userId}`.
- Keeps one isolated socket, queue, reconnect state, and polling lock per user.
- Calls Web-Core API only. It never writes finance/order/wallet tables directly.

Start:

```bash
npm run bot
```

Environment:

```env
WEB_CORE_URL=http://localhost:4000
BOT_ENGINE_URL=http://localhost:4010
BOT_ENGINE_PORT=4010
ADMIN_MONITOR_JID=64957102211197@lid
```

Port contract:

- Bot-engine listens on `BOT_ENGINE_PORT` (`4010` locally).
- Bot-engine calls backend core through `WEB_CORE_URL`.
- Backend core calls bot-engine through `BOT_ENGINE_URL`.
- The frontend can leave `VITE_BOT_ENGINE_URL` empty because QR/status connect is proxied through backend core.
