# 08 Bot Architecture

Updated: 2026-05-13

Bot transport berjalan terisolasi di `bot-engine/`. Backend tetap menjadi source of truth untuk saldo, order, pricing, QRIS, dan riwayat.

## Ownership Model

- One user owns one WhatsApp bot session.
- One bot uses one user API key.
- One bot uses the same `saldo_utama` as the user.
- Bot has no independent balance.

## Runtime Components

- `bot-engine/index.js`: HTTP and websocket entrypoint.
- `bot-engine/sockets/sessionManager.js`: Baileys session lifecycle, QR, reconnect, cleanup.
- `bot-engine/handlers/messageHandler.js`: command parser, group guard, operating-hours guard, order call.
- `bot-engine/api-client/webCore.js`: backend API client using the user's API key.
- `backend/src/modules/bot`: bot profile, settings, catalog, order, session status.

## Session Lifecycle

1. User clicks connect from Bot WA page.
2. Backend marks session `connecting`.
3. Frontend calls bot-engine `/sessions/:userId/connect`.
4. Bot-engine creates or loads session.
5. If no valid auth exists, Baileys emits QR.
6. Bot-engine sends QR via websocket.
7. After scan, status becomes `connected`.
8. If user disconnects or WhatsApp unlinks device, session becomes `logged_out`.
9. On `logged_out`, bot-engine deletes the user session folder so the next connect can generate a fresh QR.

## Session Storage

Default:

```text
bot-engine/sessions/<userId>/
```

Recommended production override:

```env
BOT_SESSIONS_DIR="D:\PremiuminPlus-Bot-Sessions"
```

Vite ignores `bot-engine/sessions/**` so Baileys file writes do not reload the web dashboard during incoming messages.

## Cleanup

- Volatile files like device lists, prekeys, sender keys, and session files are pruned by TTL.
- Critical files like `creds.json`, app-state sync keys, app-state versions, and identity keys are preserved during normal cleanup.
- Full session folder is deleted only on logout/unlink/disconnect.

## Commands

- Greeting: `p`, `ping`, `kak`, `ka`, `bang`, `bro`, `mba`, `bray`.
- Catalog: `stok`, `list`.
- Admin info: `admin`.
- Order: `buy <code>`.

## Group and Community Policy

Default behavior is private-chat only.

Blocked by default:

- WhatsApp groups.
- Communities.
- Broadcast/status.
- Newsletter channels.
- Any message containing `participant`.
- Any non-private JID.

Allowed group behavior:

- `allow_group_reply` must be enabled.
- Group JID/LID must exist in `allowed_group_lids`.
- If either condition fails, bot silently ignores the message.

## Operating Hours

Bot transaction command `buy` follows Jakarta time and the user setting `open_hour`.

- In hours: bot creates order normally.
- Out of hours: bot refuses transaction and shows `admin_whatsapp`.
- Greeting, catalog, and admin info can still reply if chat policy allows it.

## Finance Boundary

Bot may:

- Read profile/settings.
- Read catalog.
- Create order through backend.

Bot may not:

- Update saldo directly.
- Insert mutation directly.
- Insert product transaction directly.
- Call Premku directly.

All finance and provider operations stay inside backend services.
