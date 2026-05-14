# Pricing Engine

Pricing is backend-only.

Formula:

```text
member_price = base_price + admin_margin + member_markup
reseller_price = base_price + admin_margin + reseller_markup
reseller_sell_price = reseller_price + personal_reseller_markup
```

Markup type:

- `percent`
- `fixed`

Rules:

- Reseller markup must be lower than member markup.
- Product stock `0` means unavailable.
- Frontend renders backend-calculated prices only.
- Admin markup changes invalidate product cache.
