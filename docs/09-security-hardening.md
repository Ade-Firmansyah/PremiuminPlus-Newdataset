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
- Parameterized MySQL queries.
- Webhook secret validation.
- Finance row locking.
- Duplicate protection through invoice, `processed_at`, and idempotency keys.
- Production error responses hide stack trace.

## Required Production Env

- `NODE_ENV=production`
- long random `JWT_SECRET`
- database credentials
- Premku API key
- frontend origin

## Provider Safety

- Premku key never reaches frontend.
- Provider status polling is guarded.
- Product sync is guarded.
