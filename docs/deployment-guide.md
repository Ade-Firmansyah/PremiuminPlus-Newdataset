# Deployment Guide

## Backend on Railway

Build command:

```bash
npm install
```

Start command:

```bash
npm run backend
```

Required services:

- MySQL database
- Environment variables from `.env.example`

Recommended Railway variables:

```env
NODE_ENV=production
PORT=4000
PREMKU_API_KEY=
BASE_URL=https://premku.com/api/
JWT_SECRET=
DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=
FRONTEND_ORIGIN=https://your-frontend.vercel.app
CORS_ORIGIN=https://your-frontend.vercel.app
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
ADMIN_WHATSAPP=
WHATSAPP_DELIVERY_WEBHOOK=
WHATSAPP_DELIVERY_TOKEN=
```

## Frontend on Vercel

Build command:

```bash
npm run build
```

Output directory:

```text
dist
```

Frontend variable:

```env
VITE_API_BASE_URL=https://your-backend.railway.app/api
```

## MySQL

- Use managed MySQL with InnoDB.
- Ensure backend IP/network can access DB.
- Backend performs additive schema validation on startup.
- Do not run destructive migrations against production data.

## Predeploy Checklist

- `npm run lint`
- `npm run build`
- Backend `/health` returns ok.
- Admin bootstrap env configured.
- `JWT_SECRET` is long and random.
- `CORS_ORIGIN` points to deployed frontend.
