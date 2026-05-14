# 10 Deployment Guide

## Backend: Railway

Start command:

```bash
npm run backend
```

Required env:

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
CORS_ORIGIN=https://your-frontend.vercel.app
FRONTEND_ORIGIN=https://your-frontend.vercel.app
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
ADMIN_WHATSAPP=
```

## Frontend: Vercel

Build command:

```bash
npm run build
```

Output directory:

```text
dist
```

Frontend env:

```env
VITE_API_BASE_URL=https://your-backend.railway.app/api
```

## Preflight

- `npm run lint`
- `npm run build`
- Backend smoke test `/health`
- MySQL reachable
- `.env.example` copied and completed
- `JWT_SECRET` not default
