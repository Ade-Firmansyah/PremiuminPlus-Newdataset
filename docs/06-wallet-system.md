# 06 Wallet System

Updated: 2026-05-13

Wallet adalah otoritas saldo. Semua order dashboard, bot, auto order, dan API wajib memakai wallet service backend.

## Balance

- `saldo_utama`: saldo aktif dan satu-satunya saldo yang dipakai untuk transaksi.
- `saldo`: compatibility alias yang harus selalu disinkronkan dengan `saldo_utama`.
- `locked_balance`: nilai lock bot/security legacy. Nilai ini tidak menjadi sumber saldo aktif.
- `usable_balance`: respons kompatibilitas yang mengikuti `saldo_utama`.

Sistem tidak boleh memakai `saldo_real` atau `saldo_tersedia` sebagai saldo aktif.

## Algorithms

Deposit:

```text
saldo_utama = saldo_utama + nominal
saldo = saldo_utama
mutation = credit
```

Order:

```text
saldo_utama = saldo_utama - harga
saldo = saldo_utama
mutation = debit
```

Refund:

```text
saldo_utama = saldo_utama + nominal
saldo = saldo_utama
mutation = refund/credit
```

## Audit Fields

Every balance mutation must store:

- `user_id`
- `mutation_type`
- `direction`
- `amount`
- `saldo_sebelum`
- `saldo_sesudah`
- `reference`
- `description`
- `idempotency_key`
- `created_at`

## Mutation Rules

- QRIS/deposit success writes credit mutation.
- Order success writes debit mutation.
- Provider failure writes refund mutation.
- Product details are stored in product order history, not as money movement.
- QRIS/deposit/payment rows must not be shown as product order history.

## Atomicity

- Balance changes use MySQL transaction.
- User rows are locked with `SELECT ... FOR UPDATE`.
- Mutations are idempotent by reference/idempotency key.
- Backend is the only writer for balance changes.

## Bot Balance

One bot belongs to one user. Bot order uses the owner's `saldo_utama`.

- Deposit user: saldo bot effectively increases because it reads the same `saldo_utama`.
- Bot order: saldo user decreases because the bot calls backend order with the user API key.
- Bot must not keep a separate wallet table.
