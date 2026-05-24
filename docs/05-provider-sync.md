# 05 Provider Sync

Premku is the core provider, but only backend may call it.

## Boundaries

- Frontend never calls Premku.
- `backend/src/services/premku.service.js` is the only outbound provider module.
- Product sync, QRIS, payment status, order, and order status pass through backend guards.

## Lifecycle

```text
pending_payment
-> payment_success
-> provider_processing
-> provider_success
-> account_delivery
```

Payment success is not provider success. Account credentials are shown only after provider/order status is `success`.

## Guards

- Product sync guard: 60 seconds.
- Product response cache: 15 seconds.
- Payment/deposit status guard: `PREMKU_PAY_STATUS_CACHE_MS`, default 25 seconds per invoice.
- Provider order status guard: `PREMKU_ORDER_STATUS_CACHE_MS`, default 30 seconds per invoice.
- Provider order scheduler: every 60 seconds, maximum 25 invoices per tick.

## Failure Rules

- Premku product sync failure falls back to local catalog.
- Premku order failure on saldo order triggers refund.
- Delivery without WhatsApp webhook becomes `manual_pending`, never fake `sent`.
