# Payment Flow

## Direct QRIS Member Order

1. Member selects product.
2. Backend calculates member price.
3. If saldo is insufficient, frontend may create direct QRIS payment.
4. Backend creates `payments` row and calls Premku `/pay`.
5. Frontend displays QR and polls backend.
6. Backend guards repeated Premku status checks with `PREMKU_PAY_STATUS_CACHE_MS` default 25 seconds per invoice.
7. On payment success, backend writes payment transaction.
8. Backend sends order to Premku.
9. Provider success saves account credentials.

Payment success is not the same as order success.

## Deposit QRIS

1. User creates deposit.
2. Backend calls Premku `/pay`.
3. Backend stores QR, amount, total bayar, and expiration.
4. Frontend polls backend.
5. Backend guards repeated Premku status checks with `PREMKU_PAY_STATUS_CACHE_MS` default 25 seconds per invoice.
6. Success credits saldo exactly once.

## QR Expiration

Maintenance scheduler marks pending deposits/payments as `expired` when `expired_at < NOW()`.
