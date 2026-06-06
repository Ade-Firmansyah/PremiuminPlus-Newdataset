# Premiumin Plus Public API v1

Version: `3.2.2`

Base URL:

```text
https://premiuminplus.store/api/public/v1
```

## Authentication

Pilih tepat satu sumber API key:

```text
x-api-key: YOUR_API_KEY
Authorization: Bearer YOUR_API_KEY
```

Public API juga menerima `api_key` di JSON body. Jika beberapa sumber mengirim key berbeda, backend mengembalikan HTTP `400`.

Jangan simpan API key di frontend publik, repository, screenshot, atau log.

## Endpoints

```text
POST /profile
POST /products
POST /stock
POST /pay
POST /pay_status
POST /cancel_pay
POST /order
POST /status
```

### Cek Profile

```bash
curl -X POST https://premiuminplus.store/api/public/v1/profile \
  -H "content-type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d "{}"
```

### List Produk

```bash
curl -X POST https://premiuminplus.store/api/public/v1/products \
  -H "content-type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d "{}"
```

Data berasal dari database/cache Premiumin Plus dan mencakup produk `provider`, `manual`, serta `hybrid`.

### Cek Stok

```json
{
  "product_id": 123
}
```

### Buat QRIS

```json
{
  "product_id": 123,
  "qty": 1,
  "amount": 670,
  "ref_id": "PAY-CLIENT-001",
  "buyer_name": "Pembeli",
  "buyer_whatsapp": "6281234567890"
}
```

`amount` tidak boleh lebih kecil dari harga dasar owner. Provider order belum dibuat saat QRIS dibuat.

### Status QRIS

```json
{
  "invoice": "PAY-XXXX"
}
```

Saat payment sukses, backend menjalankan ledger B2B dan fulfillment sekali. QR dan raw QR dibersihkan setelah terminal state.

### Cancel QRIS

```json
{
  "invoice": "PAY-XXXX"
}
```

Payment sukses atau terminal tidak dapat dibatalkan.

### Create Order Saldo

```json
{
  "product_id": 123,
  "qty": 1,
  "ref_id": "ORDER-CLIENT-001"
}
```

Order memakai `usable_balance = saldo - locked_balance`. `ref_id` dipetakan ke idempotency key unik di database.

### Cek Status Order

```json
{
  "invoice": "ORD-XXXX"
}
```

Invoice hanya dapat dibaca owner API key. Credential hanya dikembalikan setelah order sukses.

## Deposit Saldo Internal

Deposit saldo dashboard tetap menggunakan Internal API:

```text
POST /api/deposit
GET  /api/deposit/:invoice
POST /api/deposit/:invoice/cancel
```

Saldo dikredit sebesar `amount`, bukan `total_bayar`. `processed_at` dan row lock mencegah double credit.

## Ledger B2B

Contoh:

```text
provider_cost = 500
admin_price  = 600
sell_price   = 670
```

Hasil:

```text
owner payment in = +670
owner order cost = -600
owner profit     = 70
admin revenue    = 600
provider cost    = 500
admin profit     = 100
```

Profit owner adalah analytics dan tidak dikredit lagi ke saldo.

## Error Codes

```text
400 payload/key source tidak valid
401 API key kosong atau salah
402 saldo usable tidak cukup atau managed bot terkunci
403 akun nonaktif, role salah, atau ownership gagal
404 produk/payment/order tidak ditemukan
409 stok, qty, atau status transaksi bentrok
502 provider gagal
503 maintenance/service tidak tersedia
504 timeout service
```

Rate limit Public API:

```text
mutation: 60 request/menit per user
read: 180 request/menit per user
pre-auth: 300 request/menit per IP
```

Response `429` menyertakan header `Retry-After`. Integrator tetap wajib polling dengan backoff. Backend juga memiliki cache, provider concurrency limit, minimum request interval, dan per-invoice status guard.

## PHP

```php
<?php
$payload = json_encode([
    'product_id' => 123,
    'qty' => 1,
    'ref_id' => 'ORDER-CLIENT-001'
]);

$context = stream_context_create(['http' => [
    'method' => 'POST',
    'header' => "content-type: application/json\r\nx-api-key: YOUR_API_KEY\r\n",
    'content' => $payload,
    'timeout' => 20
]]);

$result = file_get_contents(
    'https://premiuminplus.store/api/public/v1/order',
    false,
    $context
);
```

## Python Ringan

Tidak ada service Python tambahan di production. Contoh ini memakai standard library agar tidak menambah dependency:

```python
import json
from urllib.request import Request, urlopen

payload = json.dumps({
    "product_id": 123,
    "qty": 1,
    "ref_id": "ORDER-CLIENT-001",
}).encode()

request = Request(
    "https://premiuminplus.store/api/public/v1/order",
    data=payload,
    headers={
        "content-type": "application/json",
        "x-api-key": "YOUR_API_KEY",
    },
    method="POST",
)

with urlopen(request, timeout=20) as response:
    result = json.load(response)
```
