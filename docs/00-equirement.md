# Premiumin Plus v3.2 Requirement

Note: this is a historical v3.2 requirement snapshot. For the current project rules, use `docs/11-current-project-prd.md` and `docs/01-prd.md`.

Premiumin Plus v3.2 adalah snapshot historis. Premiumin Plus V4 menargetkan React/Vercel, Express/Railway, MongoDB Atlas foundation, JWT, dan integrasi Premku melalui backend-only provider service.

## Requirement Utama

- Admin, reseller, dan member berjalan dalam satu aplikasi web.
- Backend menjadi source of truth untuk auth, saldo, pricing, order, QRIS, delivery, dan monitoring.
- Frontend tidak boleh memanggil Premku langsung.
- Semua data frontend berasal dari backend API.
- Finance mutation wajib atomic dan tercatat.
- Sistem wajib ringan untuk Railway/Vercel deployment.
- Bot ecosystem disiapkan terisolasi di `bot-engine/`, belum menjadi transport aktif di v3.2.

## Realtime Strategy

v3.2+ menggunakan backend WebSocket event, guarded fallback polling, cache TTL, dan provider sync scheduler.

- Admin/user dashboard: WebSocket event-driven refresh dengan debounce.
- Notifications: polling 30 detik.
- Product cache: 15 detik.
- Provider product sync guard: 60 detik.
- Payment/deposit status guard: default 25 detik per invoice.
- Provider order status guard: default 30 detik per invoice.
- Provider order scheduler: 60 detik.

WebSocket push dan Redis adalah opsi scaling masa depan, bukan dependency runtime aktif v3.2.

## Finance Requirement

- `saldo` adalah total saldo.
- `locked_balance` adalah saldo terkunci.
- `usable_balance = saldo - locked_balance`.
- Debit saldo hanya boleh memakai usable balance.
- Deposit success tidak boleh double credit.
- Payment success tidak sama dengan provider order success.
- Provider failure pada saldo order harus refund.
- Semua mutation harus masuk audit log.

## Deployment Requirement

- Backend deployable ke Railway.
- Frontend deployable ke Vercel/static hosting.
- MongoDB Atlas untuk cloud foundation; schema SQL lama masih menjadi compatibility layer selama transisi.
- `NODE_ENV=production` wajib memiliki env valid.
- `JWT_SECRET` wajib panjang dan random.
- `CORS_ORIGIN` wajib mengarah ke frontend production.

## Production Quality Requirement

- No blank page: frontend memakai ErrorBoundary.
- No infinite polling: semua interval memiliki cleanup.
- No duplicate provider sync: provider scheduler bounded dan product sync guarded.
- No fake sent delivery: WhatsApp delivery tanpa webhook menjadi `manual_pending`.
- No provider key leak: Premku key hanya di backend.
- No destructive migration: schema repair bersifat additive.

