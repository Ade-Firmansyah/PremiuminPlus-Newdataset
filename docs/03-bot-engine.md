# Bot Engine Design

## Goal

Bot engine dibuat untuk multi akun WhatsApp bot tanpa memindahkan logic bisnis dari web-core.

Satu anggota/reseller = satu API key = satu bot session.

## Directory

```text
bot-engine/
  sessions/
  sockets/
  qr/
  handlers/
  queue/
  queues/
  reconnect/
  api-client/
  websocket/
  services/
  notifications/
  utils/
  index.js
```

## Message Flow

Greeting:

```text
p / ping / kak / gan / bro / bang / assalamualaikum
```

Bot:

1. calls `GET /api/bot/profile`
2. reads account bot settings
3. replies greeting message

Stock:

```text
stok / list
```

Bot:

1. calls `GET /api/bot/catalog`
2. shows available and unavailable products
3. marks stock 0 as `Belum tersedia`

Buy:

```text
buy1
```

Bot QRIS:

1. buyer sends `buy1`.
2. bot calls `POST /api/bot/payments`.
3. web-core validates member/reseller API key, stock, and buy code.
4. web-core creates Premku QRIS with `payment_type = bot_order`.
5. bot sends QR image and professional caption to buyer.
6. buyer can send `cek INVOICE` or `cancel INVOICE`.
7. status check calls `GET /api/bot/payments/:invoice/status`.
8. success processing is locked in web-core and creates order, transaction, order history, and account profit mutation.

Saldo order:

- `POST /api/bot/order` still exists for member/reseller saldo-based order.
- Buyer QRIS should use `/api/bot/payments`.

## QR Login Flow

1. Member/reseller opens Bot Wa Setting.
2. Frontend calls `POST /api/bot/session/connect`.
3. Web-core proxies to bot-engine `POST /sessions/:sessionId/connect`.
4. Bot-engine starts one Baileys socket for that session.
5. `connection.update.qr` is converted to base64 data URL.
6. Frontend polls `GET /api/bot/session/status`.
7. After scan, `connected_number`, `last_active`, and `connected` are updated.

Session rules:

- Auth files use `useMultiFileAuthState`.
- `creds.update` calls `saveCreds`.
- Listeners are removed before reconnect/logout.
- Reconnect uses capped backoff.
- `loggedOut` does not reconnect blindly; QR must be generated again.

## Anti Duplicate

Bot-engine has short-lived message queue keys:

```text
message:{messageId}
```

Backend still remains the real protection layer:

- payment row lock
- order row lock
- unique invoices
- `processed_at`
- idempotent status checks
- profit mutation only happens inside first success processing

## QRIS Bot Payment

Bot QRIS uses dedicated backend metadata:

- `payments.payment_type = bot_order`
- `payments.source = bot`
- `payments.buyer_whatsapp`
- `payments.modal_price`
- `payments.sell_price`
- `payments.reseller_profit`

Rule:

- Bot sends QR image only after web-core creates a payment.
- Bot polls only through web-core.
- Bot never processes success locally.

## Bot Margin And Profit

Personal bot margin is stored in:

```text
users.reseller_margin_percent
```

Pricing:

```text
modal = base_price + admin_margin + role_markup_from_admin
sell_price = modal + personal_margin_percent
profit = sell_price - modal
```

When a bot QRIS order succeeds:

- `transactions.reseller_profit` stores bot margin profit.
- `saldo_logs` gets a credit entry with `-profit` reference.
- `saldo_mutations` gets an adjustment entry for profit.
- dashboard Mutasi Saldo can show bot margin profit for member/reseller.

## Baileys Adapter

`bot-engine/sockets/session-manager.js` uses `@whiskeysockets/baileys` only inside the bot service.

This keeps web-core lightweight and prevents dashboard/backend crashes when WhatsApp sessions fail.
