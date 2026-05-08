# Fase 4 - Implementasi Backend Saat Ini

## Status

Backend sudah berjalan sebagai Express API dengan MySQL, auto schema validation, dan modul bisnis Premiumin Plus.

Implemented:

- Auth lokal: login, register member, forgot password.
- Role: admin, reseller, member.
- Product: sync Premku products, stock status, base price, admin margin.
- Pricing: markup anggota dan markup reseller terpisah.
- Deposit saldo: QRIS Premku, polling status, atomic saldo update.
- Direct member payment: QRIS Premku untuk order saat saldo kurang.
- Order: saldo order untuk member/reseller, order request ke Premku, credential tersimpan.
- WhatsApp delivery architecture: webhook gateway optional, fallback `manual_pending`.
- Withdraw: request reseller, approve/reject admin.
- Notification management: create, edit, delete, pin, active/inactive.
- Admin realtime monitoring via lightweight polling.

## Startup

```bash
npm run backend
```

Startup flow:

1. Load `.env`.
2. Create database if allowed.
3. Run schema validator.
4. Auto-add missing columns.
5. Seed admin if `ADMIN_USERNAME` and password env are configured.
6. Start server on port `4000`.

## Finance Safety

- `deposit.service` locks deposit and user rows with `FOR UPDATE`.
- `payment.service` locks payment rows and checks `processed_at`.
- `wallet.service` rejects negative saldo.
- Duplicate QRIS success polling returns existing processed data.
- Failed Premku order after saldo debit triggers refund.

## Delivery Safety

- `delivery.service` validates WhatsApp target.
- If `WHATSAPP_DELIVERY_WEBHOOK` is empty, order delivery is not faked and becomes `manual_pending`.
- `updateOrderDelivery` will not overwrite an already `sent` delivery.

## Production Notes

- Use MySQL/MariaDB with InnoDB.
- Set `API_KEY`/`PREMKU_API_KEY` for Premku.
- Set `ADMIN_WHATSAPP` for support links.
- Set `WHATSAPP_DELIVERY_WEBHOOK` only when a real WhatsApp gateway exists.
- Keep `VITE_API_BASE_URL` aligned with deployed backend URL.
