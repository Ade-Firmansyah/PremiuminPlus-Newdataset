# Public API V1 V4

Public API v1 accepts reseller/admin API keys.

Production base URL: `https://premiuminplus.store/api/public/v1`

## profile
Returns username, role, saldo, usable_balance, locked_balance, whatsapp, and registered_at.

## products
Returns reseller product price. Frontend or API consumers must not calculate price.

## stock
Returns product stock and availability.

## pay
Creates reseller API QRIS payment/order. Base/modal price is reseller price. Optional bot sell price may include reseller margin when used by bot flow.

## order
Creates saldo-based reseller order with reseller price.

## status
Returns order/payment status for the owner API key or admin.
