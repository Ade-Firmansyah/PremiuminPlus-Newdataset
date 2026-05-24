# Premiumin Pluus v3.2 Architecture & API

## Architecture

```text
frontend/src
  components/
  pages/
  services/
  store/
  styles/
backend/src
  config/
  middlewares/
  modules/
  repositories/
  routes/
  services/
  utils/
  workers/
database/
docs/
bot-engine/
```

## Layer Rules

- Controller: parse request, validate basic payload, return response.
- Service: business rules, finance transaction, provider orchestration.
- Repository: SQL only, no provider call.
- Premku Service: only outbound provider module.
- Workers: scheduled cleanup/provider sync.

## Auth

- UI session: `Authorization: Bearer <jwt>`.
- Reseller API: `x-api-key`.
- JWT includes user id, web session id, role, username, token version, iat, exp.
- Web dashboard sessions expire after 30 minutes of idle time by default. This does not affect WhatsApp bot sessions or API-key worker traffic.
- Password reset validates username, email, and WhatsApp against database, allows max 1 reset per user per 24 hours, stores `last_password_reset_at` and `password_reset_count`, increments `token_version`, and invalidates old web JWT sessions.

## API Contract

Auth:

- `POST /api/login`
- `POST /api/logout`
- `POST /api/register`
- `POST /api/forgot-password`
- `GET /api/me`
- `PATCH /api/me/preferences`

Register validation:

- `username`, `password`, `email`, and `phone` are required for self-register member flow.
- `email` must use a valid address format such as `user@gmail.com`.
- `phone` stores the WhatsApp number only as digits and accepts only `08xxxxxxxxxx` or `628xxxxxxxxxx`.
- Backend revalidates and rejects invalid email/WhatsApp values even if the frontend is bypassed.

Products/orders:

- `GET /api/products`
- `POST /api/order`
- `GET /api/order/:invoice`
- `GET /api/orders/:invoice`
- `GET /api/orders`
- `GET /api/transactions`

Deposits/payments:

- `POST /api/deposit`
- `GET /api/deposit/:invoice`
- `POST /api/deposit/cancel`
- `POST /api/deposit/:invoice/cancel`
- `GET /api/deposits`
- `POST /api/payments/direct-order`
- `GET /api/payments/:invoice/status`
- `POST /api/payments/cancel`
- `POST /api/payments/:invoice/cancel`

Wallet:

- `GET /api/saldo`
- `GET /api/saldo/logs`
- `POST /api/withdraw`

Notifications:

- `GET /api/notifications`

Admin:

- `GET /api/admin/summary`
- `GET /api/admin/users`
- `POST /api/admin/create-user`
- `PATCH /api/admin/update-user/:id`
- `DELETE /api/admin/delete-user/:id`
- `GET /api/admin/transactions`
- `GET /api/admin/activity-logs`
- `GET /api/admin/deposits`
- `GET /api/admin/withdraws`
- `PATCH /api/admin/withdraws/:id/approve`
- `PATCH /api/admin/withdraws/:id/reject`
- `POST/PATCH/DELETE /api/admin/products`
- `GET/PATCH /api/admin/markup`
- `GET/PATCH /api/admin/discount`
- `GET/PATCH /api/admin/premku-key`
- `GET/PATCH /api/admin/bot-settings`
- `GET/POST/PATCH/DELETE /api/admin/notifications`

Provider:

- `POST /api/callback/premku`

System:

- `GET /health`
- `GET /api/docs`

