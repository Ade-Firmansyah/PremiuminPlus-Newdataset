# 06-bot-engine

> Source of truth aktif Premiumin Plus. PRD lama dari `legacy/archive/fase-1-docs-cleanup/docs` sudah digabung, divalidasi, lalu duplicate archive dihapus agar tidak ada dua sumber kontrak.

---

## Merged from `03-bot-engine.md`

# Bot Engine Design

## Goal

Bot engine dibuat untuk multi akun WhatsApp bot tanpa memindahkan logic bisnis dari web-core.

Satu anggota/reseller = satu API key = satu bot session.

Bot WhatsApp adalah fitur premium. Web-core hanya mengizinkan endpoint bot jika `bot_access_unlocked = true`, `locked_balance >= 50000`, dan `saldo >= locked_balance`. Jika akses terkunci, frontend hanya boleh menampilkan locked activation page dan bot-engine menerima error dari web-core.

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
9. QRIS buyer berlaku 5 menit. Jika lewat waktu dan belum sukses, web-core menandai `payments.status = expired` dan bot memberi pesan gagal/order ulang.

Saldo order:

- `POST /api/bot/order` still exists for member/reseller saldo-based order.
- Buyer QRIS should use `/api/bot/payments`.

## QR Login Flow

1. Member/reseller opens Bot Wa Setting.
2. Jika bot access belum unlock, frontend membuat QRIS aktivasi Rp50.000 dan tidak memanggil session connect.
3. Frontend calls `POST /api/bot/session/connect`.
4. Web-core proxies to bot-engine `POST /sessions/:sessionId/connect`.
5. Bot-engine starts one Baileys socket for that session.
6. `connection.update.qr` is converted to base64 data URL.
7. Frontend polls `GET /api/bot/session/status`.
8. After scan, `connected_number`, `last_active`, and `connected` are updated.

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
- After payment success/expired/canceled, web-core clears QR payload so dashboard/API no longer exposes QR lama.

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

Implementation lock:

- `GET /api/bot/catalog` and `POST /api/bot/payments` must use the same pricing function.
- If `products.reseller_price` already exists, it becomes `modalPrice` for Bot WhatsApp.
- `users.reseller_margin_percent` is applied only when `include_personal_markup = true`.
- `payments.amount` and `payments.sell_price` store the buyer QRIS amount.
- `payments.modal_price` stores the reseller modal before personal margin.
- Wallet credit on success is limited to `reseller_profit` so reseller saldo is not credited twice.

Phase 1 reseller settings lock:

- `reseller_bot_settings` is the per-reseller source of truth for brand, greeting hooks, templates, terms, and bot margin.
- `GET /api/bot/settings` and `PATCH /api/bot/settings` read/write that table.
- `GET /api/bot/catalog` and `POST /api/bot/order/init` use `products.reseller_price` as bot modal, then add `reseller_bot_settings.reseller_margin_value`.
- Margin type supports `percent` and `fixed`; fixed is the correct mode for examples like modal Rp12.000 with profit Rp500.
- Bot session state is mirrored to `users.bot_session_id`, `users.bot_session_status`, `users.bot_connected_number`, and `users.bot_last_active_at`.
- Bot engine supports greeting hooks, `stok`, `list`, `.menu`, `produk`, `buy22`, `buy 22`, `cancel INVOICE`, `cek INVOICE`, `admin`, and `.owner`.

## Margin Slider Sync

Bot Wa Setting uses realtime slider text and debounced persistence:

```text
slider -> marginDraft -> percentage text -> debounce PATCH /me/preferences -> users.reseller_margin_percent -> bot catalog cache invalidation
```

The visible percentage, payload, database value, and bot catalog price must always come from the same margin value. No separate decorative percentage state is allowed.

## Polling Strategy

- Bot payment watch polls web-core every 10 seconds.
- Web-core guards Premku payment status checks with a 5 second per-invoice cache.
- Bot catalog is cached per user for 15 seconds.
- QR payments expire after 5 minutes unless provider already confirms success.

## Baileys Adapter

`bot-engine/sockets/session-manager.js` uses `@whiskeysockets/baileys` only inside the bot service.

This keeps web-core lightweight and prevents dashboard/backend crashes when WhatsApp sessions fail.


---

## Merged from `08-bot-engine.md`

# Premiumin Plus V3.2 Bot Engine Contract

Bot Engine root:

```text
apps/bot-engine
```

Deployment:

```text
Railway service terpisah
```

## Ownership

Bot Engine is not finance writer.

Bot Engine must not update directly:

- saldo
- payments
- deposits
- withdraws
- orders
- transactions
- saldo mutations

Bot Engine only calls backend API.

## Access

Managed Bot Engine only for:

```text
reseller
admin
```

Member can use API key to build their own external bot, but cannot use managed Bot Engine.

## Session

Rules:

- 1 reseller = 1 session.
- Use persistent auth state.
- Do not logout automatically.
- Reconnect with bounded retry.
- If connected, save connected number and last active time.
- If truly logged out, set disconnected/logged_out status.
- User must connect QR again.
- Manual logout only from reseller/admin dashboard.



---

## Merged from `06-bot-monetization-access.md`

# Bot Monetization And Access Control

## Premium Bot Rule

Bot WhatsApp adalah fitur premium. Member dan reseller hanya boleh memakai Bot Settings, bot catalog, bot payment, dan QR session jika akun memiliki:

- `users.bot_access_unlocked = true`
- `users.locked_balance >= 50000`
- `users.saldo >= users.locked_balance`

Saldo Rp50.000 adalah locked bot balance. Saldo ini tetap milik user dan boleh ditarik lewat Withdraw, tetapi tidak boleh dipakai untuk order produk.

## Usable Balance

Semua order saldo memakai:

```text
usable_balance = users.saldo - users.locked_balance
```

Order harus ditolak jika `usable_balance` tidak cukup, meskipun raw `saldo` masih terlihat cukup.

## Activation Flow

1. User membuka Bot Settings.
2. Jika bot belum unlock, frontend hanya menampilkan locked premium page.
3. Tombol `Buka Bot Sekarang` membuat QRIS deposit fixed Rp50.000.
4. Deposit disimpan dengan `payment_type = bot_activation`.
5. Polling status tetap memakai `/api/deposit/:invoice`.
6. Saat Premku sukses, backend:
   - menambah `users.saldo`
   - membuat transaksi `bot_activation`
   - membuat mutasi deposit
   - membuat mutasi `locked_balance`
   - set `bot_access_unlocked = true`
   - set `locked_balance = 50000`
   - menghapus `bot_disabled_reason`

## Disable Flow

Jika `saldo < locked_balance`, backend menonaktifkan bot:

```text
bot_access_unlocked = false
locked_balance = 0
bot_disabled_reason = Saldo minimum akses bot tidak terpenuhi
```

Event ini wajib masuk `transactions` sebagai `bot_disable` dan `activity_logs`.

## Withdraw Impact

Locked balance boleh ditarik. Saat admin approve withdraw dan nominal mengambil sebagian locked balance:

- raw saldo berkurang
- locked balance berkurang
- jika locked balance tidak lagi memenuhi Rp50.000, bot dikunci ulang
- bot session harus dianggap tidak valid sampai user aktivasi lagi

## Transaction Types

Tambahan tipe transaksi:

```text
bot_activation
locked_balance
bot_unlock
bot_disable
```

`transactions.transaction_type` memakai varchar sehingga aman untuk tipe baru. `saldo_mutations.mutation_type` juga varchar agar lifecycle finance dapat berkembang tanpa migration enum berulang.

## Dashboard Rule

Dashboard member/reseller tetap satu arsitektur. Perbedaan hanya dari backend RBAC, pricing role, markup role, dan permission bot.


---

## Merged from `07-bot-flow.md`

# Bot Flow Contract

Managed Bot Premiumin Plus hanya untuk reseller/admin.

Member:

- punya API key pribadi
- boleh membuat bot pribadi sendiri memakai API key
- tidak boleh memakai endpoint managed bot `/api/bot/*`

Bot Engine:

- call backend API saja
- tidak call Premku langsung
- tidak update saldo
- tidak update transaksi/deposit/payment/order langsung

Satu reseller hanya boleh memiliki satu managed bot session aktif.


