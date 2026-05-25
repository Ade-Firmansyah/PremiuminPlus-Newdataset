# Finance Flow

Updated: 2026-05-13

Premiumin Plus treats backend as the only finance authority.

## Balance Concepts

- `saldo_utama`: active account balance.
- `saldo`: compatibility alias synced to `saldo_utama`.
- `locked_balance`: balance reserved for bot/security requirements.
- `usable_balance`: spendable balance, calculated as `saldo_utama - locked_balance`.

All crediting updates `saldo_utama`. Spending must respect `usable_balance` so bot lock balance is not consumed by normal purchases or withdraws.

## Mutation Rules

- Every money movement writes `saldo_logs`.
- Canonical finance audit writes `saldo_mutations`.
- Every mutation records before and after balance.
- Product order history writes `transactions` with `transaction_type = 'order'`.
- QRIS/deposit/payment records stay out of product order history.
- Balance rows are locked with `SELECT ... FOR UPDATE`.

## Deposit QRIS

1. User creates QRIS deposit.
2. Backend calls Premku `/pay`.
3. Backend stores the original Premku invoice.
4. Frontend shows QRIS and Premku `total_bayar`.
5. Polling/webhook checks status through backend only.
6. Success locks the deposit row and user row.
7. Backend credits `saldo_utama`.
8. Backend writes mutation `credit`.
9. Deposit is visible in deposit/mutation history, not order history.

## Saldo Order

1. User chooses product.
2. Backend validates product, stock, and role pricing.
3. Backend reads realtime `saldo_utama`.
4. Backend debits `saldo_utama`.
5. Backend writes mutation `debit`.
6. Backend sends order to Premku.
7. Backend stores product order history.
8. Provider failure triggers refund mutation.

## Bot Order

1. Each user owns one WhatsApp bot session.
2. Bot command `buy <code>` calls backend `/api/bot/order`.
3. Backend uses the owner's user/API key.
4. Backend debits the owner's `saldo_utama`.
5. Backend writes saldo keluar mutation.
6. Product result is written to product order history.

## Direct QRIS Product Payment

1. Member chooses product with insufficient saldo.
2. Backend creates `payments` row and calls Premku `/pay`.
3. User pays QRIS.
4. Backend confirms payment success.
5. Backend dispatches product order.
6. Payment record is not displayed as product order history.
7. Product result is displayed as product order history.

## Withdraw

1. User requests withdraw.
2. Backend validates minimum Rp50.000 and `usable_balance`.
3. Admin approves/rejects.
4. Approved withdraw debits `saldo_utama` while still respecting locked balance.
5. Backend writes mutation `debit`.

## Audit View

Menu mutasi saldo must show:

- QRIS Payment/deposit masuk.
- Refund masuk.
- Order produk keluar.
- Pembelian bot/auto order/API order keluar.

Menu riwayat pesanan must show:

- Product order result.
- Product credentials/account data.
- Product order status.

Menu riwayat pesanan must not show:

- QRIS Payment.
- Deposit.
- Topup saldo.

