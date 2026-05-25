# 09 Security Hardening

## Implemented

- JWT HMAC validation with expiry.
- Token version validation.
- API key fallback for reseller integrations.
- Admin/reseller RBAC middleware.
- CORS controlled by `CORS_ORIGIN` or `FRONTEND_ORIGIN`.
- Security headers.
- JSON body limit.
- Rate limit per IP/path.
- Parameterized SQL compatibility queries and indexed MongoDB access through Mongoose/native driver.
- Webhook secret validation.
- Finance row locking.
- Duplicate protection through invoice, `processed_at`, and idempotency keys.
- Production error responses hide stack trace.

## Required Production Env

- `NODE_ENV=production`
- long random `JWT_SECRET`
- `MONGODB_URI` stored only in deployment environment variables
- Premku API key
- frontend origin

## Provider Safety

- Premku key never reaches frontend.
- Provider status polling is guarded.
- Product sync is guarded.

## Register Input Validation

- Member self-register requires `username`, `password`, `email`, and WhatsApp `phone`.
- Email is trimmed, lowercased, sanitized from HTML-sensitive characters, and validated server-side.
- WhatsApp number is trimmed and must be digit-only with `08...` or `628...` format.
- Payloads containing letters, symbols, spaces, or HTML injection in WhatsApp/email are rejected before database insert.
- Frontend mirrors the same validation with realtime field feedback, but backend remains authoritative.
- Admin create/update user uses the same email and WhatsApp guards so member and reseller records stay clean.

## Forgot Password Security

- Forgot password requires lowercase `username`, valid `email`, and digit-only WhatsApp number.
- WhatsApp reset input accepts Indonesian format and normalizes `08...` to `628...` before database matching.
- Reset only succeeds when username, email, and WhatsApp all match the same database user.
- Each user can reset password at most once per 24 hours through `last_password_reset_at`.
- Successful reset writes bcrypt password hash, increments `token_version`, and updates `password_reset_count`.
- Old dashboard JWT sessions become invalid after reset because token version changes.
- Audit trail uses `PASSWORD_RESET_SUCCESS`, `PASSWORD_RESET_FAILED`, and `PASSWORD_RESET_RATE_LIMIT` scopes in `activity_logs` with IP metadata.
- Admin monitoring can read reset history from `GET /api/admin/activity-logs`.
