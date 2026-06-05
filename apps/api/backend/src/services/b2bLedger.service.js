import { applyWalletMutationInTransaction } from './wallet.service.js';
import { deleteCachePrefix } from './cache.service.js';

function asAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function buildB2BLedgerSnapshot({ providerCost, adminPrice, sellPrice, userProfit, adminProfit }) {
  const providerCostTotal = asAmount(providerCost);
  const adminPriceTotal = asAmount(adminPrice);
  const sellPriceTotal = asAmount(sellPrice);
  const userProfitTotal = asAmount(userProfit);
  const adminProfitTotal = adminProfit === undefined
    ? Math.max(adminPriceTotal - providerCostTotal, 0)
    : asAmount(adminProfit);

  return {
    provider_cost: providerCostTotal,
    admin_price: adminPriceTotal,
    reseller_price: adminPriceTotal,
    platform_revenue: adminPriceTotal,
    sell_price: sellPriceTotal,
    user_profit: userProfitTotal,
    reseller_profit: userProfitTotal,
    admin_profit: adminProfitTotal,
  };
}

export function clearB2BLedgerCaches(userId) {
  deleteCachePrefix(`dashboard:user:${userId}`);
  deleteCachePrefix('leaderboard:');
  deleteCachePrefix('admin:summary');
}

export async function applyBotPaymentSuccess(connection, {
  payment,
  product,
  orderInvoice,
  qty = 1,
  sellPrice,
  adminPrice,
  providerCost,
  processedAt,
}) {
  if (payment?.payment_type !== 'bot_order') return null;

  const numericQty = Math.max(1, Number(qty || payment.qty || 1));
  const sellPriceTotal = asAmount(sellPrice ?? payment.sell_price ?? payment.amount);
  const adminPriceTotal = asAmount(adminPrice ?? payment.modal_price);
  const providerCostTotal = asAmount(providerCost);
  const userProfit = Math.max(sellPriceTotal - adminPriceTotal, 0);
  const adminProfit = Math.max(adminPriceTotal - providerCostTotal, 0);
  const unitProviderCost = numericQty > 0 ? Math.round(providerCostTotal / numericQty) : providerCostTotal;

  const ledger = buildB2BLedgerSnapshot({
    providerCost: providerCostTotal,
    adminPrice: adminPriceTotal,
    sellPrice: sellPriceTotal,
    userProfit,
    adminProfit,
  });
  const metadata = {
    payment_invoice: payment.invoice,
    order_invoice: orderInvoice,
    user_id: payment.user_id,
    source: 'bot',
    product_id: product.id,
    product_name: product.name,
    provider_cost: providerCostTotal,
    admin_price: adminPriceTotal,
    sell_price: sellPriceTotal,
    user_profit: userProfit,
    admin_profit: adminProfit,
  };

  const paymentInWallet = await applyWalletMutationInTransaction(connection, payment.user_id, {
    mutation_type: 'bot_payment_in',
    direction: 'in',
    amount: sellPriceTotal,
    source_type: 'bot_payment',
    source_ref: `${payment.invoice}-in`,
    notes: `bot payment buyer ${product.name}`,
    metadata,
  });

  let orderCostWallet = null;
  if (adminPriceTotal > 0) {
    orderCostWallet = await applyWalletMutationInTransaction(connection, payment.user_id, {
      mutation_type: 'bot_order_cost',
      direction: 'out',
      amount: adminPriceTotal,
      source_type: 'bot_order',
      source_ref: `${orderInvoice}-cost`,
      notes: `modal bot ${product.name}`,
      metadata,
    });
  }

  await connection.query(
    `INSERT INTO transactions
      (invoice, ref_id, user_id, product_id, product_name, qty, price_base, price_sell, total_price, profit, reseller_profit, status, channel, description, transaction_type, amount, processed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'success', 'bot-qris', 'Pembayaran buyer via Bot WhatsApp', 'bot_payment_in', ?, ?)
     ON DUPLICATE KEY UPDATE status = 'success', processed_at = COALESCE(processed_at, VALUES(processed_at))`,
    [
      `${payment.invoice}-in`,
      payment.invoice,
      payment.user_id,
      product.id,
      product.name,
      numericQty,
      adminPriceTotal,
      sellPriceTotal,
      sellPriceTotal,
      sellPriceTotal,
      processedAt,
    ],
  );

  if (adminPriceTotal > 0) {
    await connection.query(
      `INSERT INTO transactions
        (invoice, ref_id, user_id, product_id, product_name, qty, price_base, price_sell, total_price, profit, reseller_profit, status, channel, description, transaction_type, amount, processed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'success', 'bot-qris', 'Modal reseller untuk order bot', 'bot_order_cost', ?, ?)
       ON DUPLICATE KEY UPDATE status = 'success', processed_at = COALESCE(processed_at, VALUES(processed_at))`,
      [
        `${orderInvoice}-cost`,
        orderInvoice,
        payment.user_id,
        product.id,
        product.name,
        numericQty,
        adminPriceTotal,
        sellPriceTotal,
        adminPriceTotal,
        adminPriceTotal,
        processedAt,
      ],
    );
  }

  if (userProfit > 0) {
    await connection.query(
      `INSERT INTO transactions
        (invoice, ref_id, user_id, product_id, product_name, qty, price_base, price_sell, total_price, profit, reseller_profit, status, channel, description, transaction_type, amount, processed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'success', 'bot-qris', 'Profit reseller Bot WhatsApp', 'reseller_profit', ?, ?)
       ON DUPLICATE KEY UPDATE status = 'success', processed_at = COALESCE(processed_at, VALUES(processed_at))`,
      [
        `${orderInvoice}-profit`,
        orderInvoice,
        payment.user_id,
        product.id,
        product.name,
        numericQty,
        unitProviderCost,
        sellPriceTotal,
        userProfit,
        userProfit,
        userProfit,
        processedAt,
      ],
    );
  }

  return {
    credited: sellPriceTotal,
    debited: adminPriceTotal,
    profit: userProfit,
    admin_revenue: adminPriceTotal,
    provider_cost: providerCostTotal,
    admin_profit: adminProfit,
    saldo_before: paymentInWallet.before,
    saldo_after_payment: paymentInWallet.after,
    saldo_after_cost: orderCostWallet ? orderCostWallet.after : paymentInWallet.after,
    b2b_ledger: ledger,
  };
}
