# Product Pricing Provider V4

## Source Of Truth
- `base_price` or provider cost is provider modal.
- `admin_margin` is platform margin input.
- `reseller_price` is the final reseller price used by products, orders, payment, and public API.

## Deprecated Compatibility
Legacy columns such as `member_price`, `member_markup`, and `member_markup_ranges` may remain in schema/settings only to avoid destructive migration risk. They are mirrored/ignored and must not be shown as active UI/API pricing.

## Frontend Rule
Frontend never recalculates price. It renders backend `final_price`, `price`, or `reseller_price` depending on endpoint contract.
