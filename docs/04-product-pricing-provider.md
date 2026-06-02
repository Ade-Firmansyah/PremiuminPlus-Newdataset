# 04-product-pricing-provider

> Source of truth aktif Premiumin Plus. PRD lama dari `legacy/archive/fase-1-docs-cleanup/docs` sudah digabung, divalidasi, lalu duplicate archive dihapus agar tidak ada dua sumber kontrak.

---

## Merged from `05-provider-sync.md`

# Premiumin Plus V3.2 Provider Sync Contract

Provider:

```text
Premku
```

Runtime API key source:

```text
settings.premku_api_key
```

Fallback:

```text
PREMKU_API_KEY
API_KEY
```

## Key Update Flow

```text
PATCH /api/admin/premku-key
```

Backend must:

1. Validate admin.
2. Validate key not empty.
3. Test key to Premku.
4. Store key in settings.
5. Clear caches.
6. Sync products.
7. Log activity.

## Product Sync Rule

Provider product data saved locally:

```text
premku_id
code
name
stock
status
raw_response
```

Price:

```text
member_price
reseller_price
```

Existing admin final price must not be overwritten carelessly.

If a product does not exist in the new provider list:

```text
status = unavailable
stock = 0
```

Do not delete products.

Do not delete old orders, success payments, transactions, credentials, or saldo. Only expired QR payment/deposit rows may be cleaned by retention.


---

## Merged from `06-provider-flow.md`

# Provider Flow Contract

Provider Premku hanya dipanggil dari backend.

Endpoint provider:

- QRIS create: Premku `/api/pay`
- QRIS status: Premku `/api/pay_status`
- Order provider: Premku `/api/order`
- Order status: Premku `/api/status`

Guard polling:

- Payment status: minimal 3 detik.
- Order status: 10-30 detik.
- Provider sync: 120 detik.

Frontend `GET /api/products` hanya membaca database/cache lokal.


