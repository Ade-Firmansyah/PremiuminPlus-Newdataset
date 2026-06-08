# Project Structure V4

Premiumin Plus V4 uses one user dashboard for resellers and one admin panel.

## Apps
- `apps/web`: reseller dashboard and admin panel.
- `apps/api/backend`: auth, RBAC, products, wallet, order, payment, bot, admin, backup/restore.
- `apps/bot-engine`: managed WhatsApp bot runtime.

## Roles
- `admin`: full operational access.
- `reseller`: dashboard, products, order, deposit, withdraw, API key, public API v1, bot API, managed bot when locked balance is valid.

## Removed Active Surfaces
- account upgrade page/menu
- upgrade request admin tab
- upgrade request routes
- separate customer role navigation

## Route Ownership
Frontend menu hiding is never trusted as security. Backend RBAC remains the source of truth.
