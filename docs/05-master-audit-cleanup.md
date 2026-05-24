# Master Audit & Cleanup

Note: this is a historical audit snapshot. For the current project rules, use `docs/11-current-project-prd.md` and `docs/01-prd.md`.

Tanggal audit: 2026-05-12

## Scope Dibaca

- Frontend React/Vite: routing, dashboard member/reseller, admin pages, layout, store, API wrapper, polling UI.
- Backend Express: routes, controllers, modules, services, repositories, middleware, workers, config.
- Database: `database/schema.mysql.sql` dan runtime schema repair di `backend/src/config/db.js`.
- Flow bisnis: order saldo, direct QRIS member, deposit QRIS, withdraw, pricing, wallet, delivery WhatsApp, Premku integration.
- Docs fase dan canonical docs: requirement, PRD, database, architecture/API, backend implementation, business flow, legacy PHP audit.

## Cleanup Yang Dilakukan

- Frontend dipindahkan dari root `src/` ke `frontend/src/`.
- Entry Vite/TypeScript diselaraskan ke `frontend/src`.
- Folder kosong/duplikat dihapus:
  - `frontend/src/context`
  - `frontend/src/data`
  - `frontend/src/core`
  - `frontend/src/components/modules`
  - `frontend/src/components/ui`
  - `backend/src/middleware`
  - `backend/src/modules/user`
- Hook/helper frontend unused dihapus:
  - `frontend/src/hooks/useApi.ts`
  - `frontend/src/core/authGuard.ts`
- Artifact build/log root dibersihkan:
  - `dist`
  - `backend-migration-check.err`
  - `backend-migration-check.log`
- `bot-engine/` ditambahkan sebagai boundary transport WhatsApp terisolasi.
- Maintenance scheduler ditambahkan di `backend/src/workers/maintenance.scheduler.js` dan dijalankan saat backend start.
- Metadata package dinormalisasi menjadi `premiumin-pluus`.

## Struktur Produksi Setelah Cleanup

```text
frontend/
  src/
    asset/
    components/
    hooks/
    layouts/
    pages/
    services/
    store/
    styles/
    types/
    utils/
backend/
  src/
    config/
    middlewares/
    modules/
    repositories/
    routes/
    services/
    utils/
    workers/
database/
docs/
bot-engine/
```

## Temuan Audit

- Premku outbound sudah terpusat di `backend/src/services/premku.service.js`.
- Pricing utama sudah terpusat di `backend/src/services/pricing.service.js`; frontend memakai harga dari API dan tidak menjadi source of truth.
- Wallet mutation memakai transaction dan `SELECT ... FOR UPDATE` di service/repository kritikal.
- Deposit QRIS dan direct QRIS sudah memakai `processed_at` guard untuk mengurangi risiko double process.
- Delivery WhatsApp tidak memalsukan status sent ketika webhook belum dikonfigurasi; status jatuh ke `manual_pending`.
- Runtime schema repair di `backend/src/config/db.js` adalah source of truth operasional, sedangkan `database/schema.mysql.sql` adalah referensi canonical.
- Docs legacy sudah disinkronkan ke implementasi aktual: Vite React + Express + MySQL + lightweight polling.
- Tidak ditemukan duplicate service aktif untuk Premku/pricing/wallet setelah cleanup.
- Bot transport belum diimplementasikan penuh; boundary sudah dipisahkan agar tidak mencampur finance logic.

## Risiko Tersisa

- `backend/src/modules/order/order.service.js` menangkap error Premku lalu melakukan refund, tetapi tidak melempar ulang error ke caller. Ini membuat UI bisa menerima transaksi berstatus failed tanpa pesan kegagalan yang kuat.
- `locked_balance` bot rule masih bersifat dokumen/target; schema runtime saat ini belum punya kolom dan enforcement usable balance.
- Cache layer masih lightweight dan belum ada Redis-backed cache aktif meskipun `backend/src/config/redis.js` tersedia.
- Bundle frontend masih besar di satu chunk; build lolos, tetapi Vite memberi warning chunk di atas 500 kB.

## Verifikasi

- `npm run lint` berhasil.
- `npm run build` berhasil.
- Artifact `dist` hasil build verifikasi dibersihkan ulang setelah test.
