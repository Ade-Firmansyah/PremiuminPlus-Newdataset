# FASE TEST DB - B2B Ledger Staging

Tujuan fase ini adalah membuktikan flow:

```text
QRIS bot -> payment success -> ledger user -> order provider -> credential -> dashboard admin
```

Test ini wajib dijalankan di database clone/staging, bukan production.

## Prasyarat

- Backend staging berjalan.
- Staging memakai DB clone/test.
- API key reseller tersedia.
- API key admin tersedia jika ingin validasi dashboard admin.
- Produk test tersedia dan aman untuk dibeli.
- Provider/payment staging dapat mengubah QRIS menjadi success.

## Jalankan

Contoh skenario:

```text
Provider Cost     = 500
Admin Price       = 600
Reseller Sell     = 670
Reseller Profit   = 70
Admin Profit      = 100
```

PowerShell:

```powershell
$env:B2B_LEDGER_SMOKE_CONFIRM="STAGING_ONLY"
$env:SMOKE_API_BASE_URL="http://localhost:4000/api"
$env:SMOKE_RESELLER_API_KEY="API_KEY_RESELLER_STAGING"
$env:SMOKE_ADMIN_API_KEY="API_KEY_ADMIN_STAGING"
$env:SMOKE_PRODUCT_ID="123"
$env:SMOKE_BUYER_WHATSAPP="6280000000000"
$env:SMOKE_EXPECT_SELL_PRICE="670"
$env:SMOKE_EXPECT_RESELLER_COST="600"
$env:SMOKE_EXPECT_RESELLER_PROFIT="70"
$env:SMOKE_EXPECT_USER_SALDO_DELTA="70"
$env:SMOKE_EXPECT_BOT_ORDER_DELTA="1"
$env:SMOKE_EXPECT_PROVIDER_COST="500"
$env:SMOKE_EXPECT_ADMIN_PROFIT="100"
$env:SMOKE_IDEMPOTENCY_RECHECKS="2"
node scripts/smoke-b2b-ledger-staging.mjs
```

Saat script mencetak invoice QRIS, bayar QRIS tersebut di staging. Script akan polling:

```text
GET /api/bot/payments/:invoice/status
```

Jika provider mengembalikan success, script mengecek:

- `GET /api/dashboard/summary`
  - `bot_ledger.total_masuk` bertambah 670.
  - `bot_ledger.total_keluar` bertambah 600.
  - `bot_ledger.profit` bertambah 70.
- `GET /api/admin/summary`
  - `b2b_ledger.revenue_reseller` bertambah 600.
  - `b2b_ledger.provider_cost` bertambah 500.
  - `b2b_ledger.profit_admin` bertambah 100.
- Response status payment memiliki `order_invoice`.
- Response order memiliki credential jika fulfillment sukses.
- `GET /api/bot/history` menampilkan payment/order yang sama.
- `GET /api/orders` menampilkan order milik API key reseller yang sama.
- Polling ulang status setelah success tidak mengubah delta ledger.

## Safety Guard

Script tidak akan jalan tanpa:

```text
B2B_LEDGER_SMOKE_CONFIRM=STAGING_ONLY
```

Jika base URL terlihat seperti domain production Premiumin Plus, script akan berhenti kecuali override risiko di-set eksplisit. Untuk fase ini, jangan gunakan override di production.

## Hasil Yang Diharapkan

Output akhir berbentuk JSON:

```json
{
  "invoice": "PAY...",
  "payment_status": "payment_success",
  "order_invoice": "ORD...",
  "order_status": "success",
  "credential_saved": true,
  "bot_history_found": true,
  "user_order_found": true,
  "user_ledger_delta": {
    "saldo": 70,
    "total_masuk": 670,
    "total_keluar": 600,
    "profit": 70
  },
  "admin_ledger_delta": {
    "total_bot_orders": 1,
    "revenue_reseller": 600,
    "provider_cost": 500,
    "profit_admin": 100,
    "profit_reseller": 70
  },
  "idempotency_rechecks": 2
}
```

Jika QRIS belum dibayar, script akan berhenti sebagai pending/timeout. Itu bukan bukti gagal ledger; itu berarti test success belum terjadi.
