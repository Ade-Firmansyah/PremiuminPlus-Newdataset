# 07 Pricing Engine

Backend is the only pricing source of truth.

## Formula

```text
PREMKU PRICE
-> ADMIN MARKUP
-> ROLE MARKUP
-> PERSONAL MARGIN
```

Runtime formula:

```text
member_price = base_price + admin_margin + member_markup
reseller_price = base_price + admin_margin + reseller_markup
reseller_sell_price = reseller_price + personal_reseller_markup
```

## Rules

- Reseller markup must be lower than member markup.
- Frontend only renders backend response prices.
- Admin markup changes invalidate product cache.
- Product API returns `member_price`, `reseller_price`, and role-specific `price_sell`.

## Validation

- Negative markup is rejected.
- Invalid markup type is rejected.
- Stock `0` means unavailable.
