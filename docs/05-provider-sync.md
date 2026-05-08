# Provider Synchronization Flow

## Core Rule

Payment success is not order success.

Correct lifecycle:

```text
pending_payment
payment_success
provider_processing
provider_success
```

Frontend must not show credentials until `order_status = success`.

## Member Direct QRIS

1. Member creates QRIS payment.
2. Backend creates `payments` row with `status = pending`.
3. Frontend polls `/api/payments/:invoice/status`.
4. If Premku pay status is success:
   - backend sets `payments.status = success`
   - backend creates provider order with unique `ref_id`
   - backend creates/updates `orders.payment_status = success`
   - backend sets `orders.order_status = processing` unless provider already returned success
5. Frontend shows:
   - payment success
   - provider processing
   - no credentials yet
6. Polling continues.
7. Backend checks Premku `/status`.
8. Only after provider success:
   - email/password saved
   - transaction order status becomes success
   - order history displays credentials
   - delivery can run
   - admin notification can be sent

## Database Fields

`orders` synchronization fields:

- `payment_status`
- `provider_invoice`
- `provider_status`
- `order_status`
- `processing_started_at`
- `success_at`

`payments` synchronization fields:

- `status`
- `processed_at`
- `order_invoice`
- `status_response`

## Duplicate Protection

- `payments.invoice` is unique.
- `payments.processed_at` prevents duplicate payment processing.
- provider order uses unique `ref_id`.
- `transactions.invoice` is unique.
- frontend QR polling uses a ref lock.
- history/dashboard updates are event-driven plus lightweight polling fallback.

## Failure Rule

Saldo refund only applies to saldo-funded orders.

For QRIS direct member/bot orders:

- if provider fails, mark order failed
- do not add saldo because no local saldo was deducted

## Frontend States

Bad:

```text
payment success -> show credentials
```

Correct:

```text
payment success -> processing provider -> provider success -> show credentials
```
