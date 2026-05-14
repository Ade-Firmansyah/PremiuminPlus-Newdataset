# 11 Current Project PRD

Updated: 2026-05-13

This document is the end-to-end description of Premiumin Plus as it stands now. It should be treated as the current implementation target after the finance, bot, and realtime stabilization work.

## 1. Product Summary

Premiumin Plus is a digital product marketplace and reseller/member dashboard. Users can deposit balance through QRIS, buy digital products, receive account credentials, monitor mutations, and optionally run a personal WhatsApp bot connected to the same account balance.

The project has three major surfaces:

- Web dashboard for admin, reseller, and member.
- Backend API as source of truth.
- WhatsApp bot engine as personal transport per user.

## 2. Primary Principle

One user has one active balance:

```text
1 user = 1 saldo_utama = 1 bot balance
```

The bot does not own a separate wallet. If a user deposits, bot balance increases because the bot reads the same user account. If a bot orders, the user's `saldo_utama` is debited.

## 3. Role Model

Admin:

- Manage users, products, markup, provider settings, finance monitoring, withdraw, notifications, and bot settings.

Reseller:

- Deposit QRIS.
- Order with saldo.
- Withdraw.
- Use API key.
- Set personal bot store name, margin, admin WhatsApp, operating hours, and optional allowed groups.

Member:

- Register and login.
- Deposit or order products.
- Use direct QRIS product payment when saldo is insufficient.
- View mutation and order history.
- Use a personal bot when enabled.

## 4. Finance Model

The finance model is intentionally split into two histories.

Mutasi saldo is for money movement:

- Deposit/QRIS success: credit.
- Refund: credit.
- Product order: debit.
- Bot/API/auto order: debit.
- Withdraw: debit.

Riwayat pesanan is for product result:

- Product name.
- Order id.
- Price.
- Status.
- Account credentials.
- Provider response/result.

Never mix the two:

- QRIS Payment must not appear in riwayat pesanan.
- Deposit/topup must not appear in riwayat pesanan.
- Product result must not become a saldo mutation except for the debit that paid for it.

## 5. Database Rules

Active balance:

- `users.saldo_utama`: canonical active balance.
- `users.saldo`: compatibility alias kept in sync.
- `locked_balance`: compatibility/security lock data, not active spending source.

Every balance mutation must write:

- user id.
- direction.
- mutation type.
- nominal.
- saldo before.
- saldo after.
- reference id.
- idempotency key.
- description.

Important tables:

- `users`: identity, role, saldo_utama, saldo, bot status.
- `saldo_logs`: readable finance log.
- `saldo_mutations`: canonical audit mutation.
- `transactions`: product order transaction records.
- `orders`: delivered product account/result details.
- `deposits`: QRIS deposit records.
- `payments`: direct product QRIS payment records.
- `settings`: global and per-user bot settings.

## 6. Premku Rules

Frontend never calls Premku directly.

Backend uses Premku for:

- Product sync.
- QRIS payment creation.
- QRIS/payment status.
- Payment cancel.
- Product order.
- Order status.
- Provider profile where needed.

Invoice/order ids:

- Deposit invoice must use the original Premku invoice field.
- Product order should use provider order id when returned.
- Local generated order ids are fallback only when provider does not return an id.

## 7. Deposit Flow

1. User enters deposit amount.
2. Backend calls Premku `/pay`.
3. Backend stores deposit row.
4. Frontend displays QR and total payable.
5. Backend checks status by polling/webhook/manual check.
6. On success, backend credits `saldo_utama`.
7. Backend writes mutation credit.
8. Frontend updates dashboard and mutation page.
9. No order history row is shown for this QRIS payment.

## 8. Order Flow

1. User/bot/API requests product order.
2. Backend validates product, stock, role, price, and `saldo_utama`.
3. Backend debits `saldo_utama`.
4. Backend writes mutation debit.
5. Backend calls Premku order.
6. Backend stores `transactions` and `orders`.
7. Frontend shows product result in riwayat pesanan.
8. Provider failure triggers refund and mutation credit/refund.

## 9. Direct QRIS Product Payment

Direct QRIS product payment exists for member checkout when saldo is insufficient.

Rules:

- Payment row belongs to QRIS payment state.
- Product result belongs to order history.
- QRIS payment itself must not be shown as product order history.

## 10. Bot WhatsApp Flow

1. User opens Bot WA page.
2. User enables bot and clicks connect.
3. Backend marks bot session `connecting`.
4. Frontend calls bot-engine.
5. Bot-engine opens Baileys session and emits QR.
6. User scans QR.
7. Bot status becomes connected.
8. Bot can answer private chat commands.
9. Bot order uses backend `/api/bot/order`.
10. Backend debits the same user `saldo_utama`.

## 11. Bot Settings

Per-user bot settings include:

- `enabled`.
- `store_name`.
- `margin_setting`.
- `admin_whatsapp`.
- `open_hour`.
- `greeting_template`.
- `allow_group_reply`.
- `allowed_group_lids`.

`margin_setting` means:

```text
bot catalog price = backend role price + margin_setting
```

## 12. Bot Group Safety

Default: bot replies only in private chat.

Blocked by default:

- WhatsApp group.
- WhatsApp community.
- Broadcast.
- Newsletter.
- Status.
- Any message with participant metadata.
- Any non-private JID.

Allowed exception:

- Enable group reply setting.
- Add exact group JID/LID in the panel.

If not allowed, bot silently ignores the message.

## 13. Bot Operating Hours

Bot transaction command `buy` follows Jakarta time.

Example:

```text
open_hour = 08.00 - 00.00 WIB
```

If a user sends `buy` outside the configured window:

- Bot does not create an order.
- Bot replies that automatic transaction is off.
- Bot shows `admin_whatsapp`.

## 14. Bot Session Stability

Session storage:

- Default: `bot-engine/sessions/<userId>/`.
- Production option: `BOT_SESSIONS_DIR`.

Rules:

- Session cleanup prunes volatile files.
- Logout/unlink deletes the full user session folder.
- Next connect should generate a new QR.
- Vite ignores session files so incoming messages do not refresh the web page.
- Status events with the same value should not re-render Bot WA modal repeatedly.

## 15. Realtime Rules

Backend core realtime events:

- `wallet_updated`.
- `deposit_updated`.
- `payment_updated`.
- `order_updated`.

These may refresh dashboard data quietly.

Bot status/settings events:

- Must not refresh the main dashboard.
- Only Bot WA page should consume bot-engine QR/status websocket.

Incoming bot messages like `p`, `ping`, and `stok` must not trigger dashboard refresh.

## 16. Acceptance Criteria

Finance:

- Deposit success increases `saldo_utama`.
- Order success decreases `saldo_utama`.
- Refund increases `saldo_utama`.
- Each mutation has before and after balance.
- Mutasi saldo and riwayat pesanan are separate.

Bot:

- One user can connect one WA bot.
- Disconnect/unlink allows fresh QR on next connect.
- Bot does not reply to groups/communities unless allowlisted.
- Bot order debits the owner balance.
- Bot command messages do not refresh the web page.

Admin/member/reseller:

- All roles read the same balance source.
- Admin monitoring does not display deposit as product order.
- Riwayat pesanan shows only product results.
- Mutasi saldo shows both money in and money out.

## 17. Known Operational Notes

- Restart frontend/backend/bot-engine after config or bot session changes.
- Prefer moving `BOT_SESSIONS_DIR` outside the project folder in development and production.
- Existing legacy session folders can be deleted after logout if QR generation is stuck.
- Existing historical records may need one-time migration to backfill saldo mutations.
