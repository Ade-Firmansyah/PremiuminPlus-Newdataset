# Premiumin Plus

Premiumin Plus adalah platform SaaS reseller/member untuk produk digital dengan React, Express, MySQL, dan integrasi Premku API.

## Fitur Utama

- Admin dashboard: analytics, user management, product management, finance monitoring, withdraw approval, markup rules, bot monitoring, notifications.
- Reseller dashboard: analytics, product order, personal markup, QRIS deposit, withdraw request, bot settings, mutasi saldo, transaction history.
- Member dashboard: buy product, direct QRIS payment when saldo is not enough, transaction history, account settings.
- Finance safety: MySQL transaction, row locking, idempotent deposit success, saldo mutation audit.
- Premku integration: `/pay`, `/pay_status`, `/cancel_pay`, `/products`, `/order`, `/status`, `/profile`.
- UI theme: fixed Premiumin Plus dark neon theme. Light-mode toggle and theme persistence are intentionally removed for stability.
- Notification management: admin can create, edit, delete, pin, and activate/deactivate notifications.
- Realtime monitoring: backend WebSocket events plus guarded fallback polling keep dashboard updates lightweight.

## Local Installation

```powershell
cd "D:\CODING\PremiuminPlus-Web - Copy 2"
npm install
```

Create `.env` from `.env.example`, then configure:

```env
API_KEY=YOUR_PREMKU_API_KEY
BASE_URL=https://premku.com/api/
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_NAME=apps_premhytam
WEB_CORE_URL=http://localhost:4000
BOT_ENGINE_URL=http://localhost:4010
BOT_ENGINE_PORT=4010
VITE_API_BASE_URL=
VITE_BOT_ENGINE_URL=
ADMIN_WHATSAPP=6285888009931
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this
WHATSAPP_DELIVERY_WEBHOOK=
WHATSAPP_DELIVERY_TOKEN=
REALTIME_EMIT_DEBOUNCE_MS=1200
VERBOSE_PREMKU_LOGS=false
PREMIUMIN_AUTO_KILL_PORTS=true
```

Start MySQL on this machine:

```powershell
net start MySQL97
```

Run all local services in one terminal:

```powershell
npm run all
```

`npm run all` akan mengecek port frontend, backend, dan bot-engine lebih dulu. Jika port dipakai oleh proses dev lama yang aman dikenali sebagai Node/npm/Vite/PremiuminPlus, proses lama dihentikan agar tidak muncul `EADDRINUSE :::4000`; set `PREMIUMIN_AUTO_KILL_PORTS=false` jika ingin mode konservatif.

This starts:

```text
Frontend:   http://localhost:3000
Backend:    http://localhost:4000
Bot Engine: http://localhost:4010
MySQL:      127.0.0.1:3306
```

Or run services separately:

```powershell
npm run backend
npm run bot
npm run dev
```

Semua script di atas memakai preflight port yang sama. Jika `4000`, `4010`, atau `3000` masih dipakai proses dev lama, launcher akan menghentikan proses lama yang aman dikenali dulu sebelum start ulang.

Validate ports, health endpoints, and database:

```powershell
npm run doctor
```

Clean local runtime logs before packaging or moving to a VPS:

```powershell
npm run clean:runtime
```

This only removes known local log/error files. WhatsApp auth sessions in `bot-engine/sessions/` are kept on disk and ignored from source control so connected bots are not logged out during cleanup.

Open:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:4000
Health:   http://localhost:4000/health
Bot:      http://localhost:4010/health
```

For Android/iPhone/tablet testing on the same Wi-Fi, open the frontend with the PC/server IP, for example `http://192.168.1.10:3000`. Leave `VITE_API_BASE_URL` and `VITE_BOT_ENGINE_URL` empty, or keep localhost values; the frontend auto-rewrites localhost to the current host for LAN testing.

## Database And Migrations

The backend validates schema on startup and auto-creates or patches missing columns. It keeps compatibility with legacy names while exposing canonical production concepts.

Canonical concepts:

- `users`: `role`, `saldo`, `markup_percent`
- `transactions`: `transaction_type`, `amount`, `total_price`, `profit`, `invoice`, `status`
- `deposits`: `invoice`, `amount`, `qr_image`, `qr_data`, `status`, `expired_at`
- `payments`: direct QRIS payment invoices for member checkout
- `orders`: saved order history with returned account email/password, `target_whatsapp`, `delivery_status`, `delivery_time`
- `notifications`: `title`, `message`, `type`, `is_active`, `is_pinned`, `target_role`
- `withdraws`: `amount`, `status`, `notes`
- `saldo_mutations`: `mutation_type`, `balance_before`, `balance_after`, `amount`
- `products`: `base_price`, `admin_margin`, `stock`, `image`
- `settings`: canonical `key/value` plus legacy `setting_key/setting_value`
- `activity_logs`: standardized activity trail

Legacy compatibility:

- `saldo_logs` is retained and mirrored into `saldo_mutations`.
- `markup_custom` is retained and synchronized with `markup_percent`.
- `price_base` is retained and synchronized with `base_price`.

## Finance Flow

Business rules:

- `member`: may order using saldo. If saldo is insufficient, the UI offers direct QRIS payment for the product amount. The QR popup displays Premku `total_bayar` so the visible nominal matches the scanned QR amount.
- `reseller`: must use saldo. If saldo is insufficient, order is rejected with `Saldo reseller tidak cukup.`
- Premku is never used for local users, local members, or reseller accounts.
- Admin markup is separated into `member_markup` and `reseller_markup` in `settings`.
- Product availability is based on stock: `stock > 0` means `Tersedia`; `stock = 0` means `Belum tersedia` and checkout is disabled.

Deposit QRIS:

1. User inputs amount.
2. Backend calls Premku `/pay`.
3. Backend stores deposit with QR image, invoice, total amount, status, expiration.
4. Frontend shows QRIS popup and checks backend with a guarded interval.
5. Backend checks Premku `/pay_status` through `PREMKU_PAY_STATUS_CACHE_MS` throttling, default 25 seconds per invoice.
6. On success, backend locks deposit and user rows with `FOR UPDATE`.
7. Backend updates `users.saldo`, inserts `transactions`, `saldo_logs`, `saldo_mutations`, and `activity_logs`.
8. Duplicate success checks are ignored by `processed_at` and transaction locks.
9. Cancel calls Premku `/cancel_pay` and marks the deposit `canceled`.

Member direct QRIS order:

1. Member selects product and qty.
2. If local saldo is insufficient, frontend asks whether to continue with QRIS.
3. Backend creates a `payments` row and calls Premku `/pay`.
4. Frontend shows QR base64, invoice, Premku `total_bayar`, pending badge, manual check, and cancel.
5. Payment status checks call backend with a guarded interval; backend throttles repeated Premku checks per invoice.
6. On successful payment, backend locks the `payments` row and checks `processed_at`.
7. If not processed yet, backend records a `payment` transaction, sends the order to Premku, saves an `order` transaction, and stores credentials in `orders`.
8. If polling repeats after success, backend returns the existing order and does not duplicate payment/order.

WhatsApp delivery:

- By default, order results are addressed to the registered WhatsApp number on the local user account.
- Checkout no longer accepts manual WhatsApp overrides to keep delivery consistent and lightweight.
- Backend validates the registered account WhatsApp number and stores it in `orders.target_whatsapp`.
- If `WHATSAPP_DELIVERY_WEBHOOK` is configured, backend posts the order credential payload to that gateway.
- If no gateway is configured, delivery is marked `manual_pending`; the system never fakes a sent status.

Realtime admin monitoring:

- Admin/user dashboards use backend WebSocket events with debounce and scoped refresh.
- Payment/deposit fallback checks use guarded 20-30 second intervals.
- Admin cards include recent orders, pending payments, and recent users.
- This keeps deployment lightweight without excessive frontend keep-alive traffic.

Withdraw:

- Reseller/admin only.
- Statuses: `pending`, `approved`, `rejected`.
- Admin approval uses locked saldo adjustment to avoid negative balance.

Transaction types:

```text
deposit
payment
order
withdraw
adjustment
refund
```

## Roles

- `admin`: full system access.
- `reseller`: reseller features, markup, withdraw, bot settings, API key access with full audit logging.
- `member`: order, direct QRIS payment, transaction history, account settings, withdraw, bot settings, API key access with audit logging.

Member self-registration is available on the login page. Reseller registration is manual through WhatsApp Admin.

## Password Reset

The login page includes `Lupa Password?`.

Flow:

1. User enters username, email, and phone number.
2. Backend validates all three fields against the local `users` table.
3. If matched, backend generates a random password.
4. New password is hashed with bcrypt and saved locally.
5. UI shows the temporary password and warns the user to change it after login.
6. WhatsApp Admin button uses `ADMIN_WHATSAPP` from the backend public config endpoint.

Premku is never used for user registration or password reset.

## Theme System

The app uses only the default Premiumin Plus dark neon theme. There is no dark/light toggle and no theme persistence logic.

## REST API

Auth:

- `POST /api/login`
- `POST /api/register`
- `GET /api/me`
- `PATCH /api/me/preferences`

Finance:

- `POST /api/deposit`
- `GET /api/deposit/:invoice`
- `POST /api/deposit/cancel`
- `GET /api/deposits`
- `GET /api/saldo/logs`
- `POST /api/withdraw`

Orders/products:

- `GET /api/products`
- `POST /api/order`
- `GET /api/order/:invoice`
- `GET /api/orders`
- `POST /api/payments/direct-order`
- `GET /api/payments/:invoice/status`
- `POST /api/payments/cancel`

Admin:

- `GET /api/admin/summary`
- `GET /api/admin/premku-profile`
- `GET /api/admin/users`
- `POST /api/admin/create-user`
- `PATCH /api/admin/update-user/:id`
- `DELETE /api/admin/delete-user/:id`
- `POST /api/admin/products`
- `PATCH /api/admin/products/:id`
- `DELETE /api/admin/products/:id`
- `GET /api/admin/deposits`
- `GET /api/admin/withdraws`
- `PATCH /api/admin/withdraws/:id/approve`
- `PATCH /api/admin/withdraws/:id/reject`
- `GET/PATCH /api/admin/markup`
- `GET/PATCH /api/admin/bot-settings`
- `GET/POST /api/admin/notifications`
- `PATCH /api/admin/notifications/:id`
- `DELETE /api/admin/notifications/:id`

## Railway Deployment

Use a MySQL plugin or external MySQL provider, then set variables:

```env
API_KEY=
BASE_URL=https://premku.com/api/
DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=
VITE_API_BASE_URL=https://your-domain/api
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
WHATSAPP_DELIVERY_WEBHOOK=
WHATSAPP_DELIVERY_TOKEN=
```

Build command:

```bash
npm run build
```

Start command:

```bash
npm run backend
```

The backend is restart-safe because schema validation runs before queries.

## Production Docs

- `docs/11-current-project-prd.md`
- `docs/01-prd.md`
- `docs/02-database.md`
- `docs/03-architecture-api.md`
- `docs/04-backend-implementation.md`
- `docs/05-provider-sync.md`
- `docs/06-wallet-system.md`
- `docs/07-pricing-engine.md`
- `docs/08-bot-architecture.md`
- `docs/09-security-hardening.md`
- `docs/10-deployment-guide.md`

## Logging

Standard scopes:

```text
[LOGIN]
[REGISTER]
[DEPOSIT]
[PAYMENT]
[DELIVERY]
[NOTIFICATION]
[STOCK]
[REALTIME]
[WITHDRAW]
[ORDER]
[ADMIN]
[SYSTEM]
[ERROR]
```

Sensitive fields such as password, token, secret, and API key are redacted by the logger.

