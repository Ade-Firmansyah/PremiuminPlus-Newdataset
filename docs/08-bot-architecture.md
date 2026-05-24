# 08 Bot Architecture

Updated: 2026-05-17

Bot transport berjalan terisolasi di `bot-engine/`. Backend tetap menjadi source of truth untuk saldo, order, pricing, QRIS, dan riwayat.

## Ownership Model

- One user owns one WhatsApp bot session.
- Web dashboard auto logout does not disconnect WhatsApp bot sessions. Bot-engine authenticates to backend with the user's API key and persistent Baileys auth state, so it can keep selling when the browser is closed or logged out.
- One bot uses one user API key.
- One bot uses the same `saldo_utama` as the user.
- Bot has no independent balance.

## Runtime Components

- `bot-engine/index.js`: HTTP and websocket entrypoint.
- `bot-engine/sockets/sessionManager.js`: Baileys session lifecycle, QR, reconnect, cleanup.
- `bot-engine/handlers/messageHandler.js`: command parser, group guard, operating-hours guard, order call.
- `bot-engine/api-client/webCore.js`: backend API client using the user's API key.
- `backend/src/modules/bot`: bot profile, settings, catalog, order, session status.
- `shared/bot-template-renderer.js`: single renderer for WhatsApp message themes.

## Session Lifecycle

1. User clicks connect from Bot WA page.
2. Frontend calls backend `/api/bot/session/connect`.
3. Backend marks session `connecting`.
4. Backend calls bot-engine `/sessions/:userId/connect` through `BOT_ENGINE_URL`.
5. Bot-engine creates or loads session.
6. If no valid auth exists, Baileys emits QR.
7. Bot-engine sends QR via websocket and backend status polling can also return `qr_image`.
8. After scan, status becomes `connected`.
9. If user disconnects or WhatsApp unlinks device, session becomes `logged_out`.
10. On `logged_out`, bot-engine deletes the user session folder so the next connect can generate a fresh QR.

Frontend does not need direct bot-engine access for connect/disconnect. This keeps Android/iPhone/tablet and domain deployments stable even when bot-engine is private behind the backend.

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

## Port Contract

Local defaults:

- Frontend: `3000`
- Backend core: `4000`
- Bot-engine: `4010`
- MySQL: `3306`

Environment mapping:

- `WEB_CORE_URL`: bot-engine -> backend core, usually `http://localhost:4000`.
- `BOT_ENGINE_URL`: backend core -> bot-engine, usually `http://localhost:4010` locally or `http://127.0.0.1:4010` on a single VPS.
- `VITE_BOT_ENGINE_URL`: optional. Leave empty unless intentionally exposing bot-engine directly.

## Cleanup

- Volatile files like device lists, prekeys, sender keys, and temporary tokens are pruned by TTL.
- WhatsApp `session-*` signal files are preserved during normal cleanup to keep persistent auth more stable.
- Critical files like `creds.json`, app-state sync keys, app-state versions, and identity keys are preserved during normal cleanup.
- Full session folder is deleted only on logout/unlink/disconnect.

## Commands

- Greeting: `p`, `ping`, `kak`, `ka`, `bang`, `bro`, `mba`, `bray`.
- Catalog: `stok`, `list`.
- Admin info: `admin`.
- Order: `buy <code>`.

## Dynamic WhatsApp Bot Theme Engine V3

Each member/reseller can choose one active WhatsApp template from the Bot WA settings page.

Supported themes:

- `theme_1`: default classic Premiumin box style.
- `theme_2`: bold boxed live-stock style.
- `theme_3`: clean minimal line style.
- `theme_4`: luxury diamond separator style.
- `theme_5`: compact console style.

Authoritative storage:

```text
bot_template_settings
```

Fields:

```text
id
user_id
active_theme
store_name
opening_hour
closing_hour
admin_whatsapp
footer_text
created_at
updated_at
```

Rendering rule:

- Backend saves template settings through `/api/bot/settings`.
- Backend preview uses `/api/bot/template/preview`.
- Bot-engine loads the active template from `/api/bot/profile`.
- Before sending a WhatsApp message, bot-engine calls the shared renderer.
- Greeting, stock, payment, payment success, order success, admin, and error states follow the active user theme.
- There is no separate frontend message renderer for live bot output.

Template updates emit `bot.template.updated`; bot-engine refreshes profile cache within 5 seconds, so a saved theme does not require backend or bot-engine restart.

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
