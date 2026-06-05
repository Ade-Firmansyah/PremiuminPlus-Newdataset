#!/usr/bin/env node

const requiredConfirm = 'STAGING_ONLY';
const terminalStatuses = new Set(['payment_success', 'success', 'completed', 'failed', 'expired', 'canceled', 'cancelled']);

function env(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === null || value === '' ? fallback : value;
}

function fail(message) {
  console.error(`[b2b-ledger-smoke] ${message}`);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(value) {
  return String(value || 'http://localhost:4000/api').replace(/\/+$/, '');
}

function asNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function pickLedger(summary) {
  const ledger = summary?.bot_ledger || {};
  return {
    saldo: asNumber(summary?.saldo),
    total_masuk: asNumber(ledger.total_masuk),
    total_keluar: asNumber(ledger.total_keluar),
    profit: asNumber(ledger.profit),
  };
}

function pickAdminLedger(summary) {
  const ledger = summary?.b2b_ledger || {};
  return {
    total_bot_orders: asNumber(ledger.total_bot_orders),
    revenue_reseller: asNumber(ledger.revenue_reseller),
    provider_cost: asNumber(ledger.provider_cost),
    profit_admin: asNumber(ledger.profit_admin),
    profit_reseller: asNumber(ledger.profit_reseller),
  };
}

function diffLedger(after, before) {
  return Object.fromEntries(
    Object.keys(after).map((key) => [key, asNumber(after[key]) - asNumber(before[key])]),
  );
}

function isSuccessStatus(status) {
  return String(status || '').toLowerCase().includes('success');
}

function isTerminalStatus(status) {
  return terminalStatuses.has(String(status || '').toLowerCase());
}

function findByInvoice(rows, invoices) {
  const expected = new Set(invoices.filter(Boolean).map((value) => String(value)));
  return Array.isArray(rows)
    ? rows.find((row) => expected.has(String(row.invoice)) || expected.has(String(row.order_invoice)) || expected.has(String(row.payment_invoice)))
    : null;
}

async function api(baseUrl, path, { apiKey, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    fail(`Response bukan JSON untuk ${method} ${path}: ${text.slice(0, 180)}`);
  }
  if (!response.ok || payload.status === false) {
    fail(`${method} ${path} gagal (${response.status}): ${payload.message || text}`);
  }
  return payload.data ?? payload;
}

function assertExpected(name, actual, expected) {
  if (expected === '') return;
  const expectedNumber = Number(expected);
  if (!Number.isFinite(expectedNumber)) fail(`${name} expected bukan angka: ${expected}`);
  if (actual !== expectedNumber) {
    fail(`${name} tidak sesuai. expected=${expectedNumber}, actual=${actual}`);
  }
}

function assertLedgerUnchanged(name, actual, expected) {
  for (const key of Object.keys(expected)) {
    if (asNumber(actual[key]) !== asNumber(expected[key])) {
      fail(`${name}.${key} berubah setelah recheck. before=${expected[key]}, after=${actual[key]}`);
    }
  }
}

async function main() {
  if (env('B2B_LEDGER_SMOKE_CONFIRM') !== requiredConfirm) {
    fail(`Set B2B_LEDGER_SMOKE_CONFIRM=${requiredConfirm} untuk menjalankan smoke test staging.`);
  }

  const baseUrl = normalizeBaseUrl(env('SMOKE_API_BASE_URL'));
  if (/premiuminplus\.store/i.test(baseUrl) && env('B2B_LEDGER_SMOKE_ALLOW_PRODUCTION_DOMAIN') !== 'I_ACCEPT_RISK') {
    fail('Base URL terlihat seperti domain production. Gunakan DB clone/staging, atau set override risiko secara eksplisit.');
  }

  const resellerApiKey = env('SMOKE_RESELLER_API_KEY');
  const adminApiKey = env('SMOKE_ADMIN_API_KEY');
  const productId = env('SMOKE_PRODUCT_ID');
  const productCode = env('SMOKE_PRODUCT_CODE');
  const qty = Math.max(1, Number(env('SMOKE_QTY', '1')));
  const buyerWhatsapp = env('SMOKE_BUYER_WHATSAPP', '6280000000000');
  const pollSeconds = Math.max(10, Number(env('SMOKE_POLL_SECONDS', '180')));
  const pollIntervalMs = Math.max(3000, Number(env('SMOKE_POLL_INTERVAL_MS', '10000')));
  const idempotencyRechecks = Math.max(0, Number(env('SMOKE_IDEMPOTENCY_RECHECKS', '2')));

  if (!resellerApiKey) fail('Set SMOKE_RESELLER_API_KEY untuk user reseller/API key Candri staging.');
  if (!productId && !productCode) fail('Set SMOKE_PRODUCT_ID atau SMOKE_PRODUCT_CODE untuk produk staging yang akan dites.');

  console.log(`[b2b-ledger-smoke] base=${baseUrl}`);
  const beforeUser = pickLedger(await api(baseUrl, '/dashboard/summary', { apiKey: resellerApiKey }));
  const beforeAdmin = adminApiKey ? pickAdminLedger(await api(baseUrl, '/admin/summary', { apiKey: adminApiKey })) : null;

  const payload = {
    qty,
    buyer_whatsapp: buyerWhatsapp,
    ...(productId ? { product_id: Number(productId) } : { product_code: productCode, buy_code: productCode }),
  };
  const payment = await api(baseUrl, '/bot/order/init', {
    apiKey: resellerApiKey,
    method: 'POST',
    body: payload,
  });
  const invoice = payment.invoice;
  if (!invoice) fail('Response /bot/order/init tidak memiliki invoice.');
  if (!payment.qr_image && !payment.qr_raw) fail(`Payment ${invoice} tidak memiliki QRIS.`);

  console.log(`[b2b-ledger-smoke] QRIS dibuat invoice=${invoice} total_bayar=${payment.total_bayar || payment.amount}`);
  console.log('[b2b-ledger-smoke] Bayar QRIS ini di staging, script akan polling sampai success atau timeout.');

  let statusPayload = payment;
  const startedAt = Date.now();
  while (Date.now() - startedAt < pollSeconds * 1000) {
    await sleep(pollIntervalMs);
    statusPayload = await api(baseUrl, `/bot/payments/${encodeURIComponent(invoice)}/status`, { apiKey: resellerApiKey });
    const status = statusPayload.status || statusPayload.payment_status;
    const orderStatus = statusPayload.order?.order_status;
    console.log(`[b2b-ledger-smoke] status=${status} order=${orderStatus || '-'} order_invoice=${statusPayload.order_invoice || '-'}`);
    if (isTerminalStatus(status) || isSuccessStatus(status)) break;
  }

  const finalStatus = statusPayload.status || statusPayload.payment_status;
  if (!isSuccessStatus(finalStatus)) {
    fail(`Payment belum success. status=${finalStatus || 'unknown'} invoice=${invoice}`);
  }

  const orderInvoice = statusPayload.order_invoice || statusPayload.order?.invoice || null;
  const botHistoryRows = await api(baseUrl, '/bot/history', { apiKey: resellerApiKey });
  const botHistoryOrder = findByInvoice(botHistoryRows, [invoice, orderInvoice]);
  if (!botHistoryOrder) fail(`GET /bot/history belum menampilkan payment/order ${invoice}.`);

  const userOrderRows = await api(baseUrl, '/orders', { apiKey: resellerApiKey });
  const userOrder = findByInvoice(userOrderRows, [orderInvoice, invoice]);
  if (!userOrder) fail(`GET /orders belum menampilkan order ${orderInvoice || invoice}.`);

  const afterUser = pickLedger(await api(baseUrl, '/dashboard/summary', { apiKey: resellerApiKey }));
  const userDelta = diffLedger(afterUser, beforeUser);
  const order = statusPayload.order || {};
  const hasCredential = Boolean(
    order.email_account ||
    order.password_account ||
    order.account_data ||
    order.accounts?.length ||
    userOrder.email_account ||
    userOrder.password_account ||
    userOrder.account_data ||
    userOrder.accounts?.length ||
    botHistoryOrder.email_account ||
    botHistoryOrder.password_account
  );

  assertExpected('delta bot_payment_in', userDelta.total_masuk, env('SMOKE_EXPECT_SELL_PRICE'));
  assertExpected('delta bot_order_cost', userDelta.total_keluar, env('SMOKE_EXPECT_RESELLER_COST'));
  assertExpected('delta reseller_profit', userDelta.profit, env('SMOKE_EXPECT_RESELLER_PROFIT'));
  assertExpected('delta user saldo', userDelta.saldo, env('SMOKE_EXPECT_USER_SALDO_DELTA'));

  let adminDelta = null;
  if (adminApiKey) {
    const afterAdmin = pickAdminLedger(await api(baseUrl, '/admin/summary', { apiKey: adminApiKey }));
    adminDelta = diffLedger(afterAdmin, beforeAdmin);
    assertExpected('delta admin bot orders', adminDelta.total_bot_orders, env('SMOKE_EXPECT_BOT_ORDER_DELTA'));
    assertExpected('delta admin reseller revenue', adminDelta.revenue_reseller, env('SMOKE_EXPECT_RESELLER_COST'));
    assertExpected('delta admin provider cost', adminDelta.provider_cost, env('SMOKE_EXPECT_PROVIDER_COST'));
    assertExpected('delta admin profit', adminDelta.profit_admin, env('SMOKE_EXPECT_ADMIN_PROFIT'));
  }

  for (let index = 0; index < idempotencyRechecks; index += 1) {
    await sleep(1000);
    await api(baseUrl, `/bot/payments/${encodeURIComponent(invoice)}/status`, { apiKey: resellerApiKey });
  }
  const recheckUserDelta = diffLedger(pickLedger(await api(baseUrl, '/dashboard/summary', { apiKey: resellerApiKey })), beforeUser);
  assertLedgerUnchanged('user ledger delta', recheckUserDelta, userDelta);
  if (adminApiKey) {
    const recheckAdminDelta = diffLedger(pickAdminLedger(await api(baseUrl, '/admin/summary', { apiKey: adminApiKey })), beforeAdmin);
    assertLedgerUnchanged('admin ledger delta', recheckAdminDelta, adminDelta);
  }

  const result = {
    invoice,
    payment_status: finalStatus,
    order_invoice: orderInvoice,
    order_status: order.order_status || null,
    credential_saved: hasCredential,
    bot_history_found: Boolean(botHistoryOrder),
    user_order_found: Boolean(userOrder),
    user_ledger_delta: userDelta,
    admin_ledger_delta: adminDelta,
    idempotency_rechecks: idempotencyRechecks,
  };
  console.log(JSON.stringify(result, null, 2));

  if (env('SMOKE_REQUIRE_CREDENTIAL', 'true') === 'true' && !hasCredential) {
    fail('Order success tetapi credential belum terlihat di response status.');
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
