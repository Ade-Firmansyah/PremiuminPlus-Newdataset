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

## Deposit QRIS Lifecycle

Deposit saldo memakai QRIS Premku melalui backend.

Rules:

- `POST /api/deposit` membuat invoice lokal `DEP-*` dan menyimpan `provider_invoice` Premku.
- QRIS deposit berlaku 60 menit mengikuti `PAYMENT_QR_TTL_MINUTES`.
- Frontend menormalkan `pending_payment` menjadi `pending` untuk countdown dan polling.
- Polling status hanya berjalan saat deposit masih pending, interval ringan 15 detik dan pause saat tab hidden.
- `GET /api/deposit/:invoice` wajib cek status Premku sebelum mengubah saldo.
- Saldo hanya bertambah setelah Premku status valid `success`, invoice cocok, dan total bayar cocok.
- Success bersifat idempotent memakai row lock, `processed_at`, wallet service, dan `source_ref = invoice`.
- Setelah success, expired, canceled, failed, mismatch, atau manual required, backend menghapus `qr_data`, `qr_image`, dan `qr_raw` agar QR tidak bisa dipakai ulang dari UI.
- Cancel deposit pending melakukan best-effort cancel ke Premku lalu menutup invoice lokal.
- Riwayat QRIS deposit boleh disimpan lokal di browser untuk membuka ulang invoice pending tanpa membuat QR baru.

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

## Bot WhatsApp Sales Ledger

Semua order yang datang dari Bot WhatsApp tetap diproses oleh backend, bukan oleh bot-engine.

Saat QRIS buyer sukses:

```text
bot_payment_in  = saldo + sell_price
bot_order_cost  = saldo - modal_price
reseller_profit = sell_price - modal_price
```

`reseller_profit` dicatat untuk analytics dan riwayat, tetapi tidak menambah saldo kedua kali.

Contoh:

```text
saldo_awal   = Rp 50.000
buyer bayar  = Rp 1.000
modal produk = Rp 800
saldo_akhir  = Rp 50.200
profit       = Rp 200
```

Status checker bot wajib memakai `payment_invoice` lokal/provider yang tersimpan di `payments`, bukan `product_code`.

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

