# 03-wallet-finance

> Source of truth aktif Premiumin Plus. PRD lama dari `legacy/archive/fase-1-docs-cleanup/docs` sudah digabung, divalidasi, lalu duplicate archive dihapus agar tidak ada dua sumber kontrak.

---

## Merged from `04-wallet.md`

# Wallet Contract

Semua perubahan saldo wajib lewat `wallet.service`.

Mutasi yang valid:

- deposit success: masuk
- order saldo: keluar
- refund: masuk
- withdraw approve: keluar
- profit reseller: masuk
- admin adjustment: masuk/keluar

Setiap perubahan saldo harus tercatat di:

- `transactions`
- `saldo_logs`
- `saldo_mutations`

Withdraw memakai model aman: request user berstatus `pending` tanpa debit. Saat admin approve, backend lock withdraw dan user, lalu debit saldo atomic. Reject tidak mengubah saldo.



---

## Merged from `06-wallet-system.md`

# Premiumin Plus V3.2 Wallet System Contract

Source of truth:

```text
users.saldo
users.locked_balance
```

Computed value:

```text
usable_balance = saldo - locked_balance
```

`usable_balance` is never stored as source of truth.

## Saldo Safety

- Saldo must never be negative.
- Order debit must be atomic.
- Withdraw approval must be atomic.
- Refund must be atomic.
- Row lock required for finance mutation.

## Member

Member can:

- deposit
- withdraw
- order using saldo
- use direct QRIS order payment if saldo insufficient
- view saldo logs and mutations

Member has no managed bot locked balance behavior.

## Wallet Read Endpoints

```text
GET /api/saldo
GET /api/saldo/logs
GET /api/saldo/mutations
```

Member/reseller see only their own wallet data.

Admin may use `?all=true` for logs/mutations through protected admin auth.

## Reseller

Reseller order uses usable balance.

Managed bot access requires:

```text
locked_balance >= 50000
saldo >= locked_balance
bot_access_unlocked = true
```

If saldo becomes lower than locked balance:

```text
bot_access_unlocked = false
bot_disabled_reason set
mutation_type = bot_disable
```

## Withdraw Approval

Withdraw request creates a pending row first.

Admin approval:

```text
lock withdraw FOR UPDATE
lock user FOR UPDATE
validate saldo is enough
debit saldo
mark withdraw approved
write transactions
write saldo_mutations
write saldo_logs
```

Admin rejection:

```text
lock withdraw FOR UPDATE
mark withdraw rejected
do not mutate saldo
```

## Mutation Types

```text
saldo_masuk
saldo_keluar
profit
deposit
withdraw
order
refund
payment
bot_activation
locked_balance
bot_unlock
bot_disable
```

