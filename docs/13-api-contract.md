# API Contract V4

## Roles
Only admin and reseller are active API roles.

## Auth
- `POST /api/register`: creates reseller.
- `POST /api/login`: returns role and API key.
- `POST /api/forgot-password`: unchanged.

## Reseller API
- `/api/me`
- `/api/products`
- `/api/order`
- `/api/payments/direct-order`
- `/api/deposit`
- `/api/withdraw`
- `/api/orders`
- `/api/deposits`
- `/api/withdraws`
- `/api/saldo/logs`
- `/api/bot/*` public bot endpoints

## Managed Bot API
Managed bot settings/profile/session require reseller/admin and valid locked balance for reseller.

## Removed
Upgrade request endpoints are not active in V4.
