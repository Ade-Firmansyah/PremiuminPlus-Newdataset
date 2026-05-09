# Fase 3 - Arsitektur dan API

## Prinsip Arsitektur

```text
Route -> Controller -> Service -> Repository -> Database / Premku API
```

Rules:

- Controller hanya validasi request dan response.
- Service memegang business logic, transaksi finansial, dan integrasi Premku.
- Repository hanya akses database.
- Premku service adalah satu-satunya pintu keluar menuju Premku.
- User/member/reseller tidak pernah diambil dari Premku.

## Backend Module

- `auth`: login, register member, forgot password.
- `product`: katalog dan sinkron produk Premku.
- `order`: order saldo untuk member/reseller.
- `payment`: QRIS langsung member untuk order produk.
- `deposit`: QRIS top up saldo.
- `withdraw`: withdraw reseller.
- `wallet`: saldo dan mutasi.
- `admin`: dashboard admin, user, produk, markup, withdraw, notifikasi.
- `notification`: notification center user.
- `bot`: reseller bot-safe endpoints. Bot tetap memanggil service backend utama.
- `webhook`: callback Premku.

## API Contract

Auth:

- `POST /api/login`
- `POST /api/register`
- `POST /api/forgot-password`
- `GET /api/me`

Products:

- `GET /api/products`

Order saldo:

- `POST /api/order`
- `GET /api/order/:invoice`
- `GET /api/orders`

Member QRIS direct order:

- `POST /api/payments/direct-order`
- `GET /api/payments/:invoice/status`
- `POST /api/payments/cancel`

Deposit saldo:

- `POST /api/deposit`
- `GET /api/deposit/:invoice`
- `POST /api/deposit/cancel`
- `GET /api/deposits`

Wallet:

- `GET /api/saldo`
- `GET /api/saldo/logs`
- `POST /api/withdraw`

Notifications:

- `GET /api/notifications`
- `GET /api/admin/notifications`
- `POST /api/admin/notifications`
- `PATCH /api/admin/notifications/:id`
- `DELETE /api/admin/notifications/:id`

Bot engine:

- `GET /api/bot/profile`
- `GET /api/bot/catalog`
- `POST /api/bot/order`
- `POST /api/bot/payments`
- `GET /api/bot/payments/:invoice/status`
- `POST /api/bot/payments/:invoice/cancel`
- `POST /api/bot/session/connect`
- `GET /api/bot/session/status`
- `POST /api/bot/session/logout`

Admin:

- `GET /api/admin/summary`
- `GET /api/admin/users`
- `POST /api/admin/create-user`
- `PATCH /api/admin/update-user/:id`
- `DELETE /api/admin/delete-user/:id`
- `GET /api/admin/transactions`
- `GET /api/admin/deposits`
- `GET /api/admin/withdraws`
- `PATCH /api/admin/withdraws/:id/approve`
- `PATCH /api/admin/withdraws/:id/reject`
- `GET/PATCH /api/admin/markup`
- `GET/PATCH /api/admin/premku-key`
- `GET/PATCH /api/admin/bot-settings`

## Performance Contract

- Product API may return local data while Premku sync cache is fresh.
- Dashboard/admin summary endpoints are cached for 30 seconds.
- Payment and deposit status endpoints are idempotent and protected from repeated provider calls with a short per-invoice guard.
- Frontend should prefer event refresh after order/balance changes and avoid aggressive global polling.

## Frontend Bridge

- `src/services/api.ts`: API wrapper.
- `src/store/useAuth.ts`: local/session storage helper.
- `src/pages/order.tsx`: checkout, direct QRIS member, delivery ke WhatsApp akun terdaftar.
- `src/pages/DashboardPage.tsx`: dashboard member/reseller, polling ringan.
- `src/pages/AdminPanelPage.tsx`: admin shell.
- `src/pages/admin/pages/AdminDashboardHome.tsx`: realtime monitoring.
- `src/pages/admin/pages/ProductManagementPage.tsx`: produk, stock, harga anggota/reseller.
- `src/pages/admin/pages/NotificationBroadcastPage.tsx`: CRUD notifikasi.
