# 07-maintenance-backup-restore

> Source of truth aktif Premiumin Plus. PRD lama dari `legacy/archive/fase-1-docs-cleanup/docs` sudah digabung, divalidasi, lalu duplicate archive dihapus agar tidak ada dua sumber kontrak.

---

## Merged from `08-maintenance.md`

# Maintenance Contract

Admin bisa ON/OFF maintenance dari admin panel.

Saat maintenance ON:

- mutasi user/reseller ditolak
- order, deposit, withdraw, direct payment, bot order/payment ditolak
- admin tetap bisa login, membaca data, backup, restore, dan mematikan maintenance

Status maintenance disimpan di `settings`:

- `maintenance_mode`
- `maintenance_message`
- `maintenance_started_at`
- `maintenance_started_by`



---

## Merged from `09-backup-restore.md`

# Backup Restore Contract

Admin backup menghasilkan ZIP berisi:

- `database.sql`
- `backup.json`
- `settings.json`
- `metadata.json`
- `backup_info.json`

Restore flow:

1. Aktifkan maintenance.
2. Upload ZIP.
3. Backend extract.
4. Backend validate file wajib dan checksum.
5. Admin preview jumlah data.
6. Admin confirm restore.
7. Backend restore data tanpa replay provider/payment/delivery.
8. Cache dibersihkan.

Bot session bukan data finance; reseller bisa scan QR ulang setelah migrasi.


