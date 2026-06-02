# 05-order-payment-flow

> Source of truth aktif Premiumin Plus. PRD lama dari `legacy/archive/fase-1-docs-cleanup/docs` sudah digabung, divalidasi, lalu duplicate archive dihapus agar tidak ada dua sumber kontrak.

---

## Merged from `01-business-flow.md`

# Premiumin Plus V3.2 Business Flow

## Business Ownership

Premku owns:

- provider products
- provider stock
- provider QRIS
- provider credentials
- provider order processing

Premiumin Plus owns:

- users
- roles
- pricing
- wallet
- saldo
- withdraws
- transactions
- mutations
- notifications
- analytics
- bot access
- dashboard

## Member Flow

Member can:

- login dashboard
- view products
- deposit
- withdraw
- order using saldo
- use direct QRIS payment if saldo is insufficient
- view order history
- view saldo mutations
- use API key for personal integrations
- build their own external bot using API key
- upgrade reseller

Member cannot:

- use managed Bot Engine.
- connect QR through web managed bot.
- access `/api/bot/*`.

## Reseller Flow

Reseller can:

- login dashboard
- view products
- deposit
- withdraw
- order using usable balance
- view order history
- view saldo mutations
- use API key
- use managed Bot Engine if unlocked
- connect QR from dashboard
- see margin/profit analytics

Usable balance:

```text
usable_balance = saldo - locked_balance
```

## Admin Flow

Admin can:

- manage users
- manage products
- manage pricing
- manage provider API key
- sync Premku products
- approve/reject withdraws
- monitor transactions
- monitor bot sessions
- view logs

## Provider API Key Change Flow

```text
Admin clicks save key
-> Frontend confirmation popup
-> If confirmed, call PATCH /api/admin/premku-key
-> Backend validates admin
-> Backend tests key to Premku
-> Backend stores settings.premku_api_key
-> Backend clears cache
-> Backend syncs products
-> Backend logs activity
```



---

## Merged from `05-order-flow.md`

# Order Flow Contract

Order hanya boleh berjalan jika saldo cukup atau QRIS payment sudah success.

Flow saldo:

1. User memilih produk.
2. Backend cek harga final dari database.
3. Backend cek usable balance.
4. Backend debit saldo via wallet service.
5. Backend order ke provider/manual/hybrid.
6. Credential hanya tampil saat success.

Credential rule:

- Success: `success`, `provider_success`, `credential_delivery`, atau delivery `sent`.
- Pending/processing/manual required/canceled/failed: credential disembunyikan.



---

## Merged from `07-order-system.md`

# Premiumin Plus V3.2 Order System Contract

## Saldo Order

Flow:

```text
POST /api/order
-> auth
-> validate role
-> validate product local
-> get final price from products.member_price/reseller_price
-> debit saldo atomically
-> insert transaction
-> insert saldo_logs
-> insert saldo_mutations
-> call Premku
-> normalize provider result
-> update orders
-> prepare delivery
```

If Premku fails:

```text
refund atomically
order_status = failed
delivery_status = manual_pending
```

## Manual Product Order

Manual product uses local stock credentials.

Flow:

```text
validate product
debit saldo atomically
lock one product_stock_items row FOR UPDATE
set stock item status = used
save credential to orders
order_status = provider_success
delivery_status = manual_pending/sent/failed
sync products.stock cached count
```

If manual stock is empty after debit:

```text
refund atomically
order_status = failed
delivery_status = manual_pending
```

## Direct Payment Order

Direct payment order is allowed when saldo is insufficient.

Lifecycle:

```text
pending_payment
payment_success
provider_processing
provider_success
credential_delivery
```

Payment worker must be idempotent and use row locks.

## Credential Safety

Credentials may be stored after provider success, but must not be returned or delivered before:

```text
provider_success
```

Before provider success:

```text
email_account = null in response
password_account = null in response
```

## History

Endpoints:

```text
GET /api/orders
GET /api/order/:invoice
```

Member/reseller see own orders only.

Admin may see all orders through protected admin access.

