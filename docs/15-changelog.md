# Changelog

## V4 - Reseller Only Remake
- Removed active member role from auth, RBAC, UI navigation, admin user management, generated API docs, and route guards.
- Registration now creates reseller accounts.
- Existing role member rows are migrated to reseller before enum narrowing.
- Removed upgrade reseller menu, user page, admin approval tab, API client methods, and backend routes.
- Product API and order/payment flows use reseller price as the active price source.
- Legacy member pricing columns are retained only as deprecated compatibility storage.
- B2B ledger behavior is unchanged.

## Legacy Notes
Older V3.x notes referenced member/anggota flows. Those flows are no longer active in V4.
