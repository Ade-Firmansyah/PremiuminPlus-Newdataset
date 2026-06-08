# Deployment V4

## Build
Run frontend lint/build and backend syntax checks before shipping.

## Runtime
- Backend DB validator narrows active role enum to admin/reseller after converting old rows to reseller.
- Do not deploy enum narrowing before old role rows are converted.
- Provider/API keys stay server-side.

## Smoke
Smoke login admin, login reseller, register reseller, products, order, direct QRIS, dashboard, bot catalog, and admin finance.
