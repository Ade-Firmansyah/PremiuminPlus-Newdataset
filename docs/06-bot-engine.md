# Bot Engine V4

One reseller/admin API key maps to bot catalog, bot payment/order, history, analytics, and optional managed bot hosting.

## Public Bot API
- catalog
- order init/payment
- payment status
- history
- analytics

## Managed Bot Hosting
Requires reseller/admin plus valid locked balance and bot access. Session connect/status/logout, settings, and profile are managed-only surfaces.

## Ledger
Bot order keeps B2B ledger intact:
provider cost -> reseller price -> bot sell price.
Admin profit is reseller price minus provider cost. Reseller profit is bot sell price minus reseller price.
