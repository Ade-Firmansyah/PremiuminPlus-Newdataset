# 13-api-contract

> Source of truth aktif Premiumin Plus. PRD lama dari `legacy/archive/fase-1-docs-cleanup/docs` sudah digabung, divalidasi, lalu duplicate archive dihapus agar tidak ada dua sumber kontrak.

---

## Merged from `03-architecture-api.md`

# Premiumin Plus V3.2 Backend API Architecture

Backend root:

```text
apps/api/backend
```

Architecture:

```text
Route
-> Controller
-> Service
-> Repository
-> Database/Premku
```

## Rules

- Controller handles request validation shape and response.
- Service handles business logic.
- Repository handles database access.
- Premku provider access only through `premku.service`.
- Wallet mutation only through `wallet.service`.
- No controller to database direct access.
- All errors must be JSON-only.

## Core Middleware

Required:

```text
requireAuth
requireAdmin
requireResellerOrAdmin
requireManagedBotAccess
```

Managed bot middleware must reject member with 403:

```json
{
  "success": false,
  "message": "Bot Engine hanya tersedia untuk reseller."
}
```

## Provider Key Endpoints

```text
GET   /api/admin/premku-key
PATCH /api/admin/premku-key
```

Admin only.

## Auth Endpoints

```text
POST /api/login
POST /api/register
POST /api/forgot-password
GET  /api/me
```

Login validates local users and returns the user's API key for backend API access. Register member is public unless maintenance blocks public mutation.

## User API Key Contract

User API key is a local Premiumin Plus credential, not a Premku provider key.

Accepted auth headers:

```text
x-api-key: USER_API_KEY
Authorization: Bearer USER_API_KEY
```

Frontend UI must show complete API usage docs on `/dashboard/api-key`, including base URL, header, examples, role limits, response format, and safe endpoint list.

User-safe endpoints for `member`, `reseller`, and `admin`:

```text
GET  /api/me
GET  /api/products
POST /api/order
GET  /api/order/:invoice
GET  /api/orders
POST /api/payments/direct-order
GET  /api/payments/:invoice/status
POST /api/deposit
GET  /api/deposit/:invoice
GET  /api/saldo/logs
POST /api/withdraw
GET  /api/withdraws
```

Rules:

- `POST /api/order` uses wallet saldo and must validate usable balance before provider/manual/hybrid fulfillment.
- Usable balance is `users.saldo - users.locked_balance`.
- Direct QRIS order uses `POST /api/payments/direct-order`; provider order starts only after payment success.
- Member can use API key for a private bot/integration, but cannot access managed Bot Engine endpoints.
- Reseller can access managed Bot Engine endpoints after bot access is unlocked.
- API key must never be stored in public frontend code, GitHub, docs screenshots, or customer-side localStorage.

Endpoint bot/API non-session untuk member, reseller, dan admin:

```text
GET  /api/bot/catalog
POST /api/bot/order/init
GET  /api/bot/payments/:invoice/status
GET  /api/bot/order/:invoice/status
GET  /api/bot/history
GET  /api/bot/analytics
```

Endpoint managed bot khusus reseller/admin dengan akses bot aktif:

```text
GET  /api/bot/profile
GET  /api/bot/settings
PATCH /api/bot/settings
POST /api/bot/session/connect
GET  /api/bot/session/status
POST /api/bot/session/logout
```

Bot payment status `:invoice` must be the `payment_invoice` returned by `/api/bot/order/init`. Product code/id is not a valid invoice.

Docs endpoint:

```text
GET /api/docs
```

`GET /api/docs` returns structured JSON with `base_url`, auth header rules, role descriptions, response format, limits, endpoint list, and examples.

## Product Endpoint

```text
GET /api/products
```

Response must include backend-selected final price for current role.

## Order Endpoints

```text
POST /api/order
GET  /api/orders
GET  /api/order/:invoice
```

Member/reseller only see their own orders.

Admin can view all orders through protected admin access.

## Deposit Endpoints

```text
POST /api/deposit
GET  /api/deposits
GET  /api/deposits/:invoice/status
GET  /api/deposit/:invoice/status
```

Deposit creation asks Premku for QRIS through `premku.service`. Deposit status checks are guarded by the 3 second deposit status TTL and saldo is credited atomically only once after payment success.


---

## Merged from `09-frontend-contract.md`

# Premiumin Plus V3.2 Frontend Contract

Frontend root:

```text
apps/web
```

Deployment:

```text
Vercel
```

## UI Rules

- Dark mode only.
- No light theme.
- No theme toggle.
- Responsive dashboard.
- No dummy dashboard data.
- No hardcoded statistics.

## API Rules

- Frontend only calls backend API.
- Frontend never calls Premku directly.
- Frontend never accesses database directly.
- Frontend never recalculates price.
- Product price is rendered from backend response.
- Frontend uses `apps/web/src/services/api.js` as the single API wrapper.

## Auth UI

- No register page.
- Login uses username/email and password for admin-created accounts.
- "Ingat saya" may persist only the normal user API session, never the Premku provider API key.

## Member vs Reseller UI

Member does not see:

- Bot WhatsApp
- managed QR login
- managed bot session
- Margin/Profit bot

Reseller sees:

- Bot WhatsApp
- QR login
- Margin Setting
- Profit Analytics

## Provider Key UI

Admin API Settings must:

- show confirmation before saving provider key.
- not request backend if admin cancels.
- show loading during save/sync.
- show success or error.
- never store provider key in localStorage.
- disable the save button when the provider key input is empty.

Confirmation text:

```text
Title:
Ganti API key provider Premku?

Body:
Mengganti API key akan menyimpan key baru dan melakukan sinkronisasi ulang produk provider. Data order, transaksi, saldo, dan credential lama tidak akan dihapus.

Buttons:
Batal
Ya, Ganti & Sinkronkan
```

## Admin Product Management

The admin product page must have two tabs:

- Produk Provider
- Produk Manual

Required actions:

- Edit
- Nonaktifkan
- Tambah Stock

Provider products keep provider stock from Premku sync and expose manual local stock count separately. Manual products use `product_stock_items` as the real stock source.

Pricing preview:

- maximum 5 simulation rows.
- never render `RpNaN`.
- empty state: `Belum ada produk untuk simulasi`.
- simulation is admin-only and is not the source of truth for user order price.

