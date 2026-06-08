# Order And Payment Flow V4

## Reseller Order
1. Reseller selects product.
2. Backend validates stock and reseller price.
3. If saldo usable is enough, order is paid from wallet.
4. Provider/manual/hybrid fulfillment runs.
5. Order status and credential delivery are written with audit trail.

## Direct QRIS
Direct QRIS order is available for reseller when saldo is insufficient or the reseller chooses direct payment.

## Public API V1
Public API order/pay uses reseller price as modal/base price for the API key owner.

## Ownership
Admin can inspect all orders. Reseller can inspect only own orders/payments.
