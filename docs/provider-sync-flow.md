# Provider Sync Flow

Premku calls are centralized in `backend/src/services/premku.service.js`.

## Product Sync

- `GET /api/products` reads local DB first.
- Premku product sync is guarded for 60 seconds.
- Response cache is 15 seconds.
- If Premku fails, backend returns local catalog.

## Order Sync

- New saldo orders call Premku immediately after finance debit.
- Direct QRIS orders call Premku after payment success.
- Provider scheduler checks pending/processing orders every 60 seconds.
- Provider failure triggers refund for saldo orders.
- Provider success saves credentials and triggers delivery.

## Status Guards

- Deposit status: 5 seconds.
- Direct payment status: 5 seconds.
- Provider order sync: scheduled and bounded to 25 invoices per tick.
