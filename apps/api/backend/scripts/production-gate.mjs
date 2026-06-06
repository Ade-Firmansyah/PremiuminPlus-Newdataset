import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../..');
const REQUIRED_FILES = ['database.sql', 'backup.json', 'settings.json', 'metadata.json', 'backup_info.json', 'checksums.json'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function readJson(response) {
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function api(baseUrl, pathname, apiKey, options = {}) {
  return readJson(await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      ...(options.headers || {}),
    },
  }));
}

async function startApp() {
  const [{ default: app }] = await Promise.all([
    import('../src/app.js'),
  ]);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

function inspectBackup(buffer) {
  assert(buffer.subarray(0, 2).toString('ascii') === 'PK', 'Backup tidak memiliki signature ZIP PK.');
  const zip = new AdmZip(buffer);
  const entries = new Map(zip.getEntries().map((entry) => [entry.entryName, entry]));
  const missing = REQUIRED_FILES.filter((name) => !entries.has(name));
  assert(!missing.length, `Backup ZIP kurang file: ${missing.join(', ')}`);

  const backup = JSON.parse(entries.get('backup.json').getData().toString('utf8'));
  const checksums = JSON.parse(entries.get('checksums.json').getData().toString('utf8'));
  assert(backup?.tables && typeof backup.tables === 'object', 'backup.json tidak memiliki tables.');
  assert(checksums?.algorithm === 'sha256', 'checksums.json tidak memakai SHA-256.');

  for (const name of REQUIRED_FILES.filter((item) => item !== 'checksums.json')) {
    assert(checksums.files?.[name] === sha256(entries.get(name).getData()), `Hash ${name} tidak cocok.`);
  }

  const admin = (backup.tables.users || []).find((user) => user.role === 'admin' && user.api_key);
  assert(admin?.api_key, 'Backup tidak memiliki API key admin untuk validasi restore.');
  return { backup, checksums, restoredAdminApiKey: admin.api_key };
}

async function waitForRestore(baseUrl, jobId, apiKeys) {
  const keys = Array.isArray(apiKeys) ? apiKeys : [apiKeys];
  for (let attempt = 0; attempt < 120; attempt += 1) {
    let authenticated = null;
    for (const apiKey of keys) {
      const result = await api(baseUrl, `/api/admin/system/restore/${jobId}/status`, apiKey);
      if (result.response.ok) {
        authenticated = result;
        break;
      }
      if (![401, 403].includes(result.response.status)) {
        throw new Error(`Poll restore gagal HTTP ${result.response.status}: ${result.payload.message || 'unknown'}`);
      }
    }
    if (authenticated) {
      const job = authenticated.payload.data;
      if (['completed', 'completed_with_warning', 'failed'].includes(job.status)) return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Restore timeout.');
}

async function verifyUniqueConstraints(db, backup) {
  const user = (backup.tables.users || []).find((row) => row.id);
  const product = (backup.tables.products || []).find((row) => row.id);
  assert(user, 'Tidak ada user untuk test unique constraint.');

  const connection = await mysql.createConnection(db.getDbConfig());
  try {
    await connection.beginTransaction();
    const suffix = crypto.randomBytes(6).toString('hex');
    const idempotencyKey = `gate:${suffix}`;
    await connection.query(
      `INSERT INTO transactions
        (invoice, ref_id, idempotency_key, user_id, transaction_type, amount, status)
       VALUES (?, ?, ?, ?, 'order', 1, 'pending')`,
      [`GATE-ORD-${suffix}-1`, `GATE-${suffix}`, idempotencyKey, user.id],
    );
    let transactionDuplicateRejected = false;
    try {
      await connection.query(
        `INSERT INTO transactions
          (invoice, ref_id, idempotency_key, user_id, transaction_type, amount, status)
         VALUES (?, ?, ?, ?, 'order', 1, 'pending')`,
        [`GATE-ORD-${suffix}-2`, `GATE-${suffix}`, idempotencyKey, user.id],
      );
    } catch (error) {
      transactionDuplicateRejected = error?.code === 'ER_DUP_ENTRY';
    }
    assert(transactionDuplicateRejected, 'Unique transactions.idempotency_key tidak aktif.');

    if (product) {
      const clientRef = `GATE-PAY-${suffix}`;
      await connection.query(
        `INSERT INTO payments
          (invoice, user_id, product_id, amount, total_bayar, payment_type, status, client_ref_id)
         VALUES (?, ?, ?, 1, 1, 'bot_order', 'pending_payment', ?)`,
        [`GATE-PAY-${suffix}-1`, user.id, product.id, clientRef],
      );
      let paymentDuplicateRejected = false;
      try {
        await connection.query(
          `INSERT INTO payments
            (invoice, user_id, product_id, amount, total_bayar, payment_type, status, client_ref_id)
           VALUES (?, ?, ?, 1, 1, 'bot_order', 'pending_payment', ?)`,
          [`GATE-PAY-${suffix}-2`, user.id, product.id, clientRef],
        );
      } catch (error) {
        paymentDuplicateRejected = error?.code === 'ER_DUP_ENTRY';
      }
      assert(paymentDuplicateRejected, 'Unique payments(user_id, client_ref_id) tidak aktif.');
    }
  } finally {
    await connection.rollback().catch(() => {});
    await connection.end();
  }
}

async function verifyB2BLedgerIdempotency(db) {
  const suffix = crypto.randomBytes(6).toString('hex');
  const userApiKey = `gate_ledger_${crypto.randomBytes(18).toString('hex')}`;
  const invoice = `GATE-PAY-${suffix}`;
  const providerInvoice = `GATE-PROVIDER-${suffix}`;
  const orderInvoicePrefix = 'ORD';
  const connection = await mysql.createConnection(db.getDbConfig());
  let userId;
  let productId;
  try {
    const [userResult] = await connection.query(
      `INSERT INTO users (username, role, status, saldo, locked_balance, api_key)
       VALUES (?, 'reseller', 'active', 0, 0, ?)`,
      [`gate_ledger_${suffix}`, userApiKey],
    );
    userId = Number(userResult.insertId);
    const [productResult] = await connection.query(
      `INSERT INTO products
        (code, name, stock, manual_stock_count, status, product_source, base_price, member_price, reseller_price)
       VALUES (?, 'Gate Manual Product', 1, 1, 'active', 'manual', 500, 600, 600)`,
      [`GATE-${suffix}`],
    );
    productId = Number(productResult.insertId);
    await connection.query(
      `INSERT INTO product_stock_items
        (product_id, email_account, password_account, description, status)
       VALUES (?, 'gate@example.test', 'gate-password', 'production gate credential', 'available')`,
      [productId],
    );
    await connection.query(
      `INSERT INTO payments
        (invoice, provider_invoice, user_id, product_id, amount, total_bayar, payment_type, source, status, qty, modal_price, sell_price, reseller_profit)
       VALUES (?, ?, ?, ?, 670, 670, 'bot_order', 'production_gate', 'pending_payment', 1, 600, 670, 70)`,
      [invoice, providerInvoice, userId, productId],
    );
  } finally {
    await connection.end();
  }

  const { processSuccessfulPayment } = await import('../src/modules/payment/payment.service.js');
  const statusResponse = {
    success: true,
    status: 'success',
    invoice: providerInvoice,
    total_bayar: 670,
  };
  const results = await Promise.all(
    Array.from({ length: 5 }, () => processSuccessfulPayment(invoice, statusResponse)),
  );
  assert(results.every((result) => result.payment?.processed_at), 'Concurrent payment result tidak seluruhnya processed.');

  const [user] = await db.query('SELECT saldo FROM users WHERE id = ?', [userId]);
  const [payment] = await db.query('SELECT status, processed_at, order_invoice FROM payments WHERE invoice = ?', [invoice]);
  const [orderCount] = await db.query('SELECT COUNT(*) AS total FROM orders WHERE payment_invoice = ?', [invoice]);
  const [stockCount] = await db.query(
    "SELECT COUNT(*) AS total FROM product_stock_items WHERE product_id = ? AND status = 'used'",
    [productId],
  );
  const mutations = await db.query(
    `SELECT mutation_type, COUNT(*) AS total
     FROM balance_mutations
     WHERE user_id = ? AND source_ref IN (?, ?)
     GROUP BY mutation_type`,
    [userId, `${invoice}-in`, `${payment.order_invoice}-cost`],
  );
  const transactionRows = await db.query(
    `SELECT transaction_type, COUNT(*) AS total
     FROM transactions
     WHERE user_id = ? AND (
       invoice = ? OR invoice = ? OR invoice = ? OR invoice = ?
     )
     GROUP BY transaction_type`,
    [
      userId,
      `${invoice}-in`,
      `${payment.order_invoice}-cost`,
      `${payment.order_invoice}-profit`,
      payment.order_invoice,
    ],
  );

  const mutationCounts = Object.fromEntries(mutations.map((row) => [row.mutation_type, Number(row.total)]));
  const transactionCounts = Object.fromEntries(transactionRows.map((row) => [row.transaction_type, Number(row.total)]));
  assert(Number(user.saldo) === 70, `Saldo ledger expected 70, actual ${user.saldo}.`);
  assert(payment.status === 'payment_success' && payment.processed_at, 'Payment tidak terminal processed.');
  assert(Number(orderCount.total) === 1, `Order dibuat ${orderCount.total} kali.`);
  assert(Number(stockCount.total) === 1, `Credential digunakan ${stockCount.total} kali.`);
  assert(mutationCounts.bot_payment_in === 1, `bot_payment_in tercatat ${mutationCounts.bot_payment_in || 0} kali.`);
  assert(mutationCounts.bot_order_cost === 1, `bot_order_cost tercatat ${mutationCounts.bot_order_cost || 0} kali.`);
  assert(transactionCounts.bot_payment_in === 1, 'Transaction payment-in tidak tunggal.');
  assert(transactionCounts.bot_order_cost === 1, 'Transaction modal-out tidak tunggal.');
  assert(transactionCounts.reseller_profit === 1, 'Transaction profit analytics tidak tunggal.');
  assert(transactionCounts.order === 1, 'Transaction order tidak tunggal.');

  return {
    concurrent_rechecks: 5,
    saldo_delta: Number(user.saldo),
    payment_status: payment.status,
    order_count: Number(orderCount.total),
    credential_count: Number(stockCount.total),
    mutation_counts: mutationCounts,
    transaction_counts: transactionCounts,
    order_invoice_prefix_ok: String(payment.order_invoice || '').startsWith(orderInvoicePrefix),
    test_context: {
      apiKey: userApiKey,
      userId,
      productId,
      paymentInvoice: invoice,
      orderInvoice: payment.order_invoice,
    },
  };
}

async function verifyMaintenanceBlocks(baseUrl, memberApiKey, adminApiKey) {
  const mutationRequests = [
    ['/api/order', { product_id: 1, qty: 1 }],
    ['/api/deposit', { amount: 1000 }],
    ['/api/withdraw', { amount: 50000, bank_name: 'DANA', account_number: '6280000000000', account_name: 'Gate' }],
    ['/api/bot/order/init', { product_id: 1, qty: 1 }],
    ['/api/public/v1/order', { product_id: 1, qty: 1, ref_id: 'MAINTENANCE-GATE-ORDER' }],
    ['/api/public/v1/pay', { product_id: 1, qty: 1, amount: 1000, ref_id: 'MAINTENANCE-GATE-PAY' }],
  ];
  for (const [pathname, body] of mutationRequests) {
    const result = await api(baseUrl, pathname, memberApiKey, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    assert(result.response.status === 503, `${pathname} tidak diblokir maintenance; HTTP ${result.response.status}.`);
  }
  const backup = await fetch(`${baseUrl}/api/admin/system/backup`, {
    headers: { 'x-api-key': adminApiKey },
  });
  assert(backup.ok, 'Backup admin tidak tersedia saat maintenance.');
}

async function verifyApiAndDashboard(baseUrl, db, adminApiKey, ledger) {
  const context = ledger.test_context;
  const profile = await api(baseUrl, '/api/public/v1/profile', context.apiKey, {
    method: 'POST',
    body: '{}',
  });
  assert(profile.response.ok && Number(profile.payload.data?.saldo) === 70, 'Public profile tidak merekonsiliasi saldo ledger.');

  const products = await api(baseUrl, '/api/public/v1/products', context.apiKey, {
    method: 'POST',
    body: '{}',
  });
  assert(
    products.response.ok && products.payload.products?.some((product) => Number(product.id) === context.productId),
    'Public products tidak memuat produk ledger.',
  );

  const stock = await api(baseUrl, '/api/public/v1/stock', context.apiKey, {
    method: 'POST',
    body: JSON.stringify({ product_id: context.productId }),
  });
  assert(stock.response.ok && Number(stock.payload.stock) === 0, 'Public stock tidak merefleksikan credential terpakai.');

  const paymentStatus = await api(baseUrl, '/api/public/v1/pay_status', context.apiKey, {
    method: 'POST',
    body: JSON.stringify({ invoice: context.paymentInvoice }),
  });
  assert(paymentStatus.response.ok && paymentStatus.payload.data?.status === 'payment_success', 'Public pay_status gagal.');

  const orderStatus = await api(baseUrl, '/api/public/v1/status', context.apiKey, {
    method: 'POST',
    body: JSON.stringify({ invoice: context.orderInvoice }),
  });
  assert(orderStatus.response.ok && orderStatus.payload.accounts?.length === 1, 'Public status tidak mengembalikan credential sukses.');

  const secondKey = `gate_owner_${crypto.randomBytes(18).toString('hex')}`;
  await db.execute(
    `INSERT INTO users (username, role, status, saldo, api_key)
     VALUES (?, 'member', 'active', 0, ?)`,
    [`gate_owner_${crypto.randomBytes(8).toString('hex')}`, secondKey],
  );
  const forbidden = await api(baseUrl, '/api/public/v1/status', secondKey, {
    method: 'POST',
    body: JSON.stringify({ invoice: context.orderInvoice }),
  });
  assert(forbidden.response.status === 403, 'Ownership invoice user lain tidak mengembalikan 403.');

  const dashboard = await api(baseUrl, '/api/dashboard/summary', context.apiKey);
  assert(dashboard.response.ok, 'Dashboard reseller gagal.');
  assert(Number(dashboard.payload.data?.saldo) === 70, 'Dashboard saldo reseller tidak 70.');
  assert(Number(dashboard.payload.data?.bot_ledger?.total_masuk) === 670, 'Dashboard uang masuk tidak 670.');
  assert(Number(dashboard.payload.data?.bot_ledger?.total_keluar) === 600, 'Dashboard uang keluar tidak 600.');
  assert(Number(dashboard.payload.data?.bot_ledger?.profit) === 70, 'Dashboard profit tidak 70.');

  const adminSummary = await api(baseUrl, '/api/admin/summary', adminApiKey);
  assert(adminSummary.response.ok, 'Admin summary gagal.');
  const adminLedger = adminSummary.payload.data?.b2b_ledger || {};
  assert(Number(adminLedger.total_bot_orders) === 1, 'Admin bot order tidak 1.');
  assert(Number(adminLedger.revenue_reseller) === 600, 'Admin revenue tidak 600.');
  assert(Number(adminLedger.provider_cost) === 500, 'Admin provider cost tidak 500.');
  assert(Number(adminLedger.profit_admin) === 100, 'Admin profit tidak 100.');
  assert(Number(adminLedger.profit_reseller) === 70, 'Admin reseller profit tidak 70.');

  const botHistory = await api(baseUrl, '/api/bot/history', context.apiKey);
  assert(botHistory.response.ok && botHistory.payload.data?.length === 1, 'Bot history tidak memiliki satu payment.');
  const orderHistory = await api(baseUrl, '/api/orders', context.apiKey);
  assert(orderHistory.response.ok && orderHistory.payload.data?.length === 1, 'Order history tidak memiliki satu order.');

  return {
    public_profile: true,
    public_products: true,
    public_stock: true,
    public_payment_status: true,
    public_order_status: true,
    ownership_403: true,
    reseller_dashboard: {
      saldo: Number(dashboard.payload.data.saldo),
      masuk: Number(dashboard.payload.data.bot_ledger.total_masuk),
      keluar: Number(dashboard.payload.data.bot_ledger.total_keluar),
      profit: Number(dashboard.payload.data.bot_ledger.profit),
    },
    admin_dashboard: {
      bot_orders: Number(adminLedger.total_bot_orders),
      revenue: Number(adminLedger.revenue_reseller),
      provider_cost: Number(adminLedger.provider_cost),
      profit: Number(adminLedger.profit_admin),
    },
    secondMemberApiKey: secondKey,
  };
}

async function verifyRateLimit(baseUrl, apiKey) {
  let limited = null;
  for (let attempt = 0; attempt < 190; attempt += 1) {
    const result = await api(baseUrl, '/api/public/v1/profile', apiKey, {
      method: 'POST',
      body: '{}',
    });
    if (result.response.status === 429) {
      limited = result;
      break;
    }
    assert(result.response.ok, `Rate-limit probe gagal HTTP ${result.response.status}.`);
  }
  assert(limited?.payload?.code === 'RATE_LIMITED', 'Public API tidak mengaktifkan rate limit 429.');
  assert(Number(limited.response.headers.get('retry-after')) >= 1, 'Rate limit tidak mengirim Retry-After.');
  return true;
}

async function worker() {
  const backupPath = process.env.TEST_BACKUP_PATH;
  assert(backupPath, 'TEST_BACKUP_PATH wajib ada.');

  await import('../src/config/env.js');
  const dbModule = await import('../src/config/db.js');
  await dbModule.initializeDatabase();
  const [seedAdmin] = await dbModule.query("SELECT api_key FROM users WHERE role = 'admin' AND api_key IS NOT NULL ORDER BY id LIMIT 1");
  assert(seedAdmin?.api_key, 'Admin seed database test tidak tersedia.');
  const memberApiKey = `gate_member_${crypto.randomBytes(18).toString('hex')}`;
  const memberUsername = `gate_member_${crypto.randomBytes(8).toString('hex')}`;
  await dbModule.execute(
    `INSERT INTO users (username, role, status, saldo, api_key)
     VALUES (?, 'member', 'active', 0, ?)`,
    [memberUsername, memberApiKey],
  );

  const backupBuffer = await fs.readFile(backupPath);
  const { backup, restoredAdminApiKey } = inspectBackup(backupBuffer);
  const app = await startApp();
  try {
    const invalidAuth = await api(app.baseUrl, '/api/public/v1/profile', 'invalid-production-gate', {
      method: 'POST',
      body: '{}',
    });
    assert(invalidAuth.response.status === 401, 'Public API invalid key tidak mengembalikan 401.');

    const maintenanceOn = await api(app.baseUrl, '/api/admin/maintenance', seedAdmin.api_key, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: true, message: 'Production restore gate' }),
    });
    assert(maintenanceOn.response.ok && maintenanceOn.payload.data?.enabled === true, 'Gagal mengaktifkan maintenance test.');

    const blockedOrder = await api(app.baseUrl, '/api/public/v1/order', memberApiKey, {
      method: 'POST',
      body: JSON.stringify({ product_id: 1, qty: 1, ref_id: 'MAINTENANCE-GATE' }),
    });
    assert(blockedOrder.response.status === 503, 'Public API order tidak diblokir saat maintenance.');
    await verifyMaintenanceBlocks(app.baseUrl, memberApiKey, seedAdmin.api_key);

    const upload = await api(app.baseUrl, '/api/admin/system/restore/upload', seedAdmin.api_key, {
      method: 'POST',
      body: JSON.stringify({ zip_base64: backupBuffer.toString('base64') }),
    });
    assert(upload.response.status === 201, `Upload restore gagal: ${upload.payload.message || upload.response.status}`);
    const jobId = upload.payload.data?.id;
    assert(jobId, 'Restore job id tidak tersedia.');

    const confirm = await api(app.baseUrl, `/api/admin/system/restore/${jobId}/confirm`, seedAdmin.api_key, {
      method: 'POST',
      body: '{}',
    });
    assert(confirm.response.ok, `Confirm restore gagal: ${confirm.payload.message || confirm.response.status}`);

    const job = await waitForRestore(app.baseUrl, jobId, [seedAdmin.api_key, restoredAdminApiKey]);
    assert(job.status === 'completed', `Restore selesai dengan status ${job.status}: ${(job.result?.warnings || []).join('; ')}`);
    assert(Object.values(job.result?.checklist || {}).every(Boolean), 'Checklist restore tidak seluruhnya lulus.');

    const status = await fetch(`${app.baseUrl}/api/system/status`).then((response) => response.json());
    assert(status.data?.maintenance === true, 'Maintenance tidak tetap aktif setelah restore.');
    await verifyUniqueConstraints(dbModule, backup);
    const ledger = await verifyB2BLedgerIdempotency(dbModule);
    const apiDashboard = await verifyApiAndDashboard(app.baseUrl, dbModule, restoredAdminApiKey, ledger);

    const maintenanceOff = await api(app.baseUrl, '/api/admin/maintenance', restoredAdminApiKey, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: false }),
    });
    assert(maintenanceOff.response.ok && maintenanceOff.payload.data?.enabled === false, 'Gagal menonaktifkan maintenance test.');
    const transactionAllowed = await api(app.baseUrl, '/api/public/v1/order', apiDashboard.secondMemberApiKey, {
      method: 'POST',
      body: JSON.stringify({ product_id: 999999999, qty: 1, ref_id: 'MAINTENANCE-OFF-GATE' }),
    });
    assert(transactionAllowed.response.status === 404, 'Transaksi tetap diblokir setelah maintenance OFF.');
    const memberCatalog = await api(app.baseUrl, '/api/bot/catalog', apiDashboard.secondMemberApiKey);
    assert(memberCatalog.response.ok, 'Member tidak dapat memakai bot catalog non-session.');
    const memberManagedSession = await api(app.baseUrl, '/api/bot/session/status', apiDashboard.secondMemberApiKey);
    assert(memberManagedSession.response.status === 403, 'Member managed bot session tidak ditolak 403.');
    const resellerManagedSession = await api(app.baseUrl, '/api/bot/session/status', ledger.test_context.apiKey);
    assert(resellerManagedSession.response.status === 402, 'Reseller tanpa locked balance tidak ditolak 402.');
    await verifyRateLimit(app.baseUrl, ledger.test_context.apiKey);

    process.stdout.write(JSON.stringify({
      restore_status: job.status,
      progress: job.progress,
      files: job.files,
      checklist: job.result.checklist,
      maintenance_after_restore: status.data.maintenance,
      maintenance_off_allows_transactions: true,
      counts: job.preview_counts,
      ledger: {
        concurrent_rechecks: ledger.concurrent_rechecks,
        saldo_delta: ledger.saldo_delta,
        payment_status: ledger.payment_status,
        order_count: ledger.order_count,
        credential_count: ledger.credential_count,
        mutation_counts: ledger.mutation_counts,
        transaction_counts: ledger.transaction_counts,
        order_invoice_prefix_ok: ledger.order_invoice_prefix_ok,
      },
      api_dashboard: {
        public_profile: apiDashboard.public_profile,
        public_products: apiDashboard.public_products,
        public_stock: apiDashboard.public_stock,
        public_payment_status: apiDashboard.public_payment_status,
        public_order_status: apiDashboard.public_order_status,
        ownership_403: apiDashboard.ownership_403,
        reseller_dashboard: apiDashboard.reseller_dashboard,
        admin_dashboard: apiDashboard.admin_dashboard,
      },
      bot_access: {
        member_public_bot_api: true,
        member_managed_session_403: true,
        reseller_without_lock_402: true,
      },
      rate_limit_429: true,
    }));
  } finally {
    await app.close();
  }
}

function runWorker(testDatabase, backupPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [__filename, '--worker'], {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        DB_NAME: testDatabase,
        DB_CREATE_IF_MISSING: 'false',
        TEST_BACKUP_PATH: backupPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Restore worker gagal (${code}): ${stderr || stdout}`));
        return;
      }
      const jsonStart = stdout.lastIndexOf('{"restore_status"');
      assert(jsonStart >= 0, `Output worker tidak valid: ${stdout}`);
      resolve(JSON.parse(stdout.slice(jsonStart)));
    });
  });
}

async function main() {
  await import('../src/config/env.js');
  const dbModule = await import('../src/config/db.js');
  const config = dbModule.getDbConfig();
  await dbModule.initializeDatabase();
  const [admin] = await dbModule.query("SELECT api_key FROM users WHERE role = 'admin' AND api_key IS NOT NULL ORDER BY id LIMIT 1");
  assert(admin?.api_key, 'Admin API key lokal tidak tersedia.');

  const app = await startApp();
  let backupBuffer;
  try {
    const backupResponse = await fetch(`${app.baseUrl}/api/admin/system/backup`, {
      headers: { 'x-api-key': admin.api_key },
    });
    assert(backupResponse.ok, `Download backup gagal HTTP ${backupResponse.status}.`);
    backupBuffer = Buffer.from(await backupResponse.arrayBuffer());
    inspectBackup(backupBuffer);

    const upload = await api(app.baseUrl, '/api/admin/system/restore/upload', admin.api_key, {
      method: 'POST',
      body: JSON.stringify({ zip_base64: backupBuffer.toString('base64') }),
    });
    assert(upload.response.status === 201, 'Preview upload backup source gagal.');
    const noMaintenanceConfirm = await api(
      app.baseUrl,
      `/api/admin/system/restore/${upload.payload.data.id}/confirm`,
      admin.api_key,
      { method: 'POST', body: '{}' },
    );
    assert(
      noMaintenanceConfirm.response.status === 409 && noMaintenanceConfirm.payload.code === 'MAINTENANCE_REQUIRED',
      'Restore source tidak ditolak saat maintenance OFF.',
    );
  } finally {
    await app.close();
  }

  const testDatabase = `${config.database}_restore_gate_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, '_');
  const backupPath = path.join(os.tmpdir(), `premiuminplus-production-gate-${process.pid}.zip`);
  const adminConnection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
  });

  try {
    await adminConnection.query(`CREATE DATABASE \`${testDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await fs.writeFile(backupPath, backupBuffer);
    const result = await runWorker(testDatabase, backupPath);
    console.log(JSON.stringify({
      status: 'passed',
      source_database: config.database,
      isolated_restore_database: testDatabase,
      ...result,
    }, null, 2));
  } finally {
    const [rows] = await adminConnection.query(
      'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
      [testDatabase],
    );
    if (rows.length) {
      await adminConnection.query(`DROP DATABASE \`${testDatabase}\``);
    }
    await adminConnection.end();
    await fs.rm(backupPath, { force: true });
  }
}

try {
  if (process.argv.includes('--worker')) {
    await worker();
  } else {
    await main();
  }
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
