# Environment Guide

Use `.env.example` as the canonical template.

## Required Backend Variables

- `NODE_ENV`
- `PORT`
- `PREMKU_API_KEY` or `API_KEY`
- `BASE_URL`
- `JWT_SECRET`
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `CORS_ORIGIN` or `FRONTEND_ORIGIN`

## Required Frontend Variables

- `VITE_API_BASE_URL`

## Optional Variables

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_WHATSAPP`
- `PREMKU_WEBHOOK_SECRET`
- `WHATSAPP_DELIVERY_WEBHOOK`
- `WHATSAPP_DELIVERY_TOKEN`

## Production Validation

When `NODE_ENV=production`, backend validates critical env values and refuses startup if:

- DB config is missing.
- Premku API key is missing.
- JWT secret is missing, too short, or still uses local default.
