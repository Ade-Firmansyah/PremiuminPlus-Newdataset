# Premiumin Plus Bot Engine

Isolated WhatsApp transport for Premiumin Plus.

- Uses Baileys Multi Device with `useMultiFileAuthState`.
- Stores one session folder per user in `bot-engine/sessions/{userId}`.
- Keeps one isolated socket, queue, reconnect state, and polling lock per user.
- Calls Web-Core API only. It never writes finance/order/wallet tables directly.

Start:

```bash
node bot-engine/index.js
```

Environment:

```env
WEB_CORE_URL=http://localhost:3000
BOT_ENGINE_PORT=4010
ADMIN_MONITOR_JID=64957102211197@lid
```
