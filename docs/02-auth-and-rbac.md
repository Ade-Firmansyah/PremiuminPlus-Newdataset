# Auth And RBAC V4

## Register
Public registration creates a reseller account with validated username, email, phone, and password.

## Login
- admin -> Admin Panel
- reseller -> Reseller Dashboard

## API Key
All active reseller/admin accounts can own an API key. API key middleware accepts only admin/reseller.

## Managed Bot
Managed bot endpoints require admin/reseller. Reseller must also have valid bot access and locked balance.

## Deprecated
Old upgrade request columns can remain for compatibility, but no active endpoint or UI uses them.
