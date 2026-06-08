# Database Contract V4

## users
`users.role` active enum is `admin`, `reseller`.

Migration preflight:
`UPDATE users SET role = 'reseller' WHERE role = 'member';`

## products
Active price source is `products.reseller_price`.

Deprecated compatibility columns may remain:
- `member_price`
- `member_markup`
- `member_markup_ranges`

They are not active role semantics and must not be exposed as a customer role.

## finance
Do not drop historical transactions, orders, payments, deposits, withdrawals, saldo logs, balance mutations, or bot ledger data during V4 migration.

## upgrade request columns
Request/status columns can remain deprecated until a later destructive migration window.
