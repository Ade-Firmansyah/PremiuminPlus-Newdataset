# Production Audit V4

This audit supersedes the V3.2.2 role model for V4.

## Completed Scope
- Role model narrowed to admin/reseller in active schema and runtime validator.
- Registration returns reseller role.
- User management role selector supports only admin/reseller.
- Upgrade workflow removed from active UI/API/routes.
- Public product response hides deprecated member pricing fields.
- Production-gate fixtures and finance audit use reseller-only role expectations.
- Frontend enters transaction-blocking maintenance mode after three consecutive backend/network failures.
- Restore confirmation requires maintenance mode in both UI and backend.
- Static SQL includes runtime transaction/order fulfillment columns used by V4 services.
- Backend and bot metadata loggers redact key, token, password, secret, and credential fields.
- Production bot session-control endpoints fail closed when `BOT_ENGINE_TOKEN` is missing.

## Required Smoke Before Release
- register reseller
- login reseller
- login admin
- forgot password
- reseller dashboard
- admin dashboard
- products reseller price
- saldo order
- direct QRIS
- public API profile/products/pay/order/status
- bot catalog/order/history/analytics
- managed bot locked balance
- admin finance, products, maintenance, backup/restore
