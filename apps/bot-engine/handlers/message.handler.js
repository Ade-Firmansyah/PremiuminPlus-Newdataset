const DEFAULT_GREETING_KEYWORDS = new Set(['p', 'ping', 'halo', 'haloo', 'bro']);
const MAINTENANCE_REPLY = 'Web sedang maintenance. Transaksi sementara tidak tersedia.';

function normalizeText(message = '') {
  return String(message).trim().toLowerCase();
}

function normalizeWhatsappNumber(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw.includes('@lid')) return '';

  const localPart = raw.split('@')[0].split(':')[0];
  const digits = localPart.replace(/\D/g, '');
  if (!digits) return '';

  const normalized = digits.startsWith('0')
    ? `62${digits.slice(1)}`
    : digits.startsWith('8')
      ? `62${digits}`
      : digits;

  return /^62\d{8,15}$/.test(normalized) ? normalized : '';
}

function formatRupiah(value) {
  return Number(value || 0).toLocaleString('id-ID');
}

function normalizeHooks(settings = {}) {
  const hooks = String(settings.greeting_hooks || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return hooks.length ? new Set(hooks) : DEFAULT_GREETING_KEYWORDS;
}

function productCode(product) {
  return String(product.product_code || product.buy_code || product.code || '').replace(/^buy/i, '').trim();
}

function paymentInvoice(payment = {}) {
  return String(payment.payment_invoice || payment.invoice || payment.provider_invoice || '').trim();
}

function isLikelyPaymentInvoice(value = '') {
  const invoice = String(value || '').trim();
  return Boolean(invoice) && !/^\d+$/.test(invoice);
}

function splitProducts(products) {
  return {
    ready: products.filter((product) => Number(product.stock || 0) > 0),
    empty: products.filter((product) => Number(product.stock || 0) <= 0),
  };
}

function renderOutOfStock(empty) {
  return empty.length ? empty.map((product) => `• ${product.name}`).join('\n') : '• -';
}

function renderCatalogTemplate1(products, settings = {}) {
  const { ready, empty } = splitProducts(products);
  const brand = settings.brand_name || settings.panel_name || 'PREMIUMIN PLUS BOT';
  const readyLines = ready.map((product) => [
    `📦 ${product.name}`,
    `┣ 💰 Harga : Rp${formatRupiah(product.sell_price || product.price)}`,
    `┣ 📊 Stok  : ${Number(product.stock || 0)} Akun`,
    `┗ 🔑 Order : buy ${productCode(product)}`,
  ].join('\n')).join('\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n');

  return [
    `╭─────────────〔 ${brand} 〕─────────────╮`,
    '',
    readyLines || 'Belum ada produk tersedia.',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '❌ STOK HABIS',
    '',
    renderOutOfStock(empty),
    '',
    '━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '📖 Cara Order',
    '➊ Pilih produk',
    '➋ Ketik buy kode',
    '➌ Bayar invoice',
    '➍ Produk dikirim otomatis',
    '',
    '💳 Pembayaran : QRIS',
    '⚡ Pengiriman : Instant',
    '🛡️ Garansi : Sesuai Produk',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `🤖 ${brand}`,
    '━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}

function renderCatalogTemplate2(products, settings = {}) {
  const { ready, empty } = splitProducts(products);
  const brand = settings.brand_name || settings.panel_name || 'PREMIUMIN PLUS BOT';
  const first = ready[0] ? productCode(ready[0]) : '1';
  return [
    '╭─────────────────────────────╮',
    brand,
    'Premium Account Marketplace',
    '╰─────────────────────────────╯',
    '',
    'INFORMASI',
    '━━━━━━━━━━━━━━━━━━━━━━',
    '',
    'Status      : Online',
    'Pembayaran  : QRIS Otomatis',
    'Pengiriman  : Instan Setelah Bayar',
    'Garansi     : Sesuai Ketentuan Produk',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━',
    'KATALOG PRODUK',
    '━━━━━━━━━━━━━━━━━━━━━━',
    '',
    ready.map((product) => [
      `[${productCode(product)}] ${product.name}`,
      `Harga : Rp${formatRupiah(product.sell_price || product.price)}`,
      `Stok  : ${Number(product.stock || 0)} Akun`,
      `Order : buy ${productCode(product)}`,
    ].join('\n')).join('\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n') || 'Belum ada produk tersedia.',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━',
    'PRODUK TIDAK TERSEDIA',
    '━━━━━━━━━━━━━━━━━━━━━━',
    '',
    renderOutOfStock(empty),
    '',
    '━━━━━━━━━━━━━━━━━━━━━━',
    'CARA PEMBELIAN',
    '━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '1. Pilih produk',
    '2. Ketik perintah sesuai kode',
    '3. Lakukan pembayaran',
    '4. Produk dikirim otomatis',
    '',
    'Contoh:',
    `buy ${first}`,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `${brand} © 2026`,
    'Fast • Secure • Automatic',
    '━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}

function renderCatalogTemplate3(products, settings = {}) {
  const { ready, empty } = splitProducts(products);
  const brand = settings.brand_name || settings.panel_name || 'PREMIUMIN PLUS BOT';
  return [
    `╭━━━〔 🛒 ${brand} 〕━━━⬣`,
    '┃ 📅 Update Stok : Real Time',
    '┃ 🛡️ Transaksi Aman & Otomatis',
    '┃ 💳 Pembayaran QRIS 24 Jam',
    '╰━━━━━━━━━━━━━━━━━━━━⬣',
    '',
    '📦 *DAFTAR PRODUK TERSEDIA*',
    '',
    ready.map((product) => [
      `┌─〔 ${productCode(product)} 〕${product.name}`,
      `├ 💰 Rp${formatRupiah(product.sell_price || product.price)}`,
      `├ 📦 Stok : ${Number(product.stock || 0)} Akun`,
      `└ 🔑 Ketik : *buy ${productCode(product)}*`,
    ].join('\n')).join('\n\n') || 'Belum ada produk tersedia.',
    '',
    '━━━━━━━━━━━━━━━━━━',
    '❌ *STOK HABIS*',
    '━━━━━━━━━━━━━━━━━━',
    renderOutOfStock(empty),
    '',
    '━━━━━━━━━━━━━━━━━━',
    '📌 *CARA ORDER*',
    '━━━━━━━━━━━━━━━━━━',
    '1️⃣ Pilih produk',
    '2️⃣ Ketik *buy kode*',
    '3️⃣ Lakukan pembayaran',
    '4️⃣ Akun dikirim otomatis',
    '',
    '💎 Reseller? Ketik *.reseller*',
    '📞 Bantuan? Ketik *.owner*',
    '🛒 Topup Saldo? Ketik *.deposit*',
    '',
    '╭━━━━━━━━━━━━━━━━━━⬣',
    '┃ Terima kasih telah berbelanja 🙏',
    '╰━━━━━━━━━━━━━━━━━━⬣',
  ].join('\n');
}

function renderCatalog(products, settings = {}) {
  if (!products.length) {
    return 'Belum ada produk yang tersedia di catalog.';
  }
  if (settings.catalog_template === 'template_2') return renderCatalogTemplate2(products, settings);
  if (settings.catalog_template === 'template_3') return renderCatalogTemplate3(products, settings);
  return renderCatalogTemplate1(products, settings);
}

function formatPaymentCaption(payment, productName = 'Produk digital') {
  const amount = Number(payment.amount || 0);
  const total = Number(payment.total_bayar || amount);
  const unique = Math.max(total - amount, 0);
  return [
    '━━━━━━━━━━━━━━━━━━',
    '🛒 *PEMBELIAN PRODUK*',
    '━━━━━━━━━━━━━━━━━━',
    `📦 Produk: ${productName}`,
    `💰 Harga: Rp${formatRupiah(amount)}`,
    `🔢 Kode Unik: Rp${formatRupiah(unique)}`,
    '',
    `💵 Total Bayar: Rp${formatRupiah(total)}`,
    `📄 Invoice: ${payment.invoice}`,
    '━━━━━━━━━━━━━━━━━━',
    '📱 Scan QR di atas untuk bayar',
    '⏳ Berlaku: 5 menit',
    '━━━━━━━━━━━━━━━━━━',
    '',
    '📌 Cara bayar:',
    '',
    '1. Scan QRIS',
    '2. Bayar sesuai nominal',
    '3. Tunggu otomatis diproses',
    '',
    '⚠️ Harus sesuai nominal',
    '',
    '❌ Batal:',
    `cancel ${payment.invoice}`,
    '',
    '━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}

export function formatSuccess(order, settings = {}) {
  const lines = [
    `*Produk:* ${order.product_name || '-'}`,
    '',
  ];
  if (order.email_account) lines.push(`*📧 Email:* ${order.email_account}`);
  if (order.password_account) lines.push(`*🔐 Password:* ${order.password_account}`);
  const raw = order.raw_response || {};
  const accessUrl = raw.email_access_url || raw.access_url || raw.tutorial_url || '';
  if (accessUrl) lines.push(`*📩 Akses Email:* ${accessUrl}`);
  if (raw.tutorial_url) lines.push(`*📖 Tutorial:* ${raw.tutorial_url}`);
  lines.push('', '*─「 📜 SYARAT & KETENTUAN 」─*', '', settings.terms_text || 'Simpan data akun baik-baik. Garansi mengikuti ketentuan produk.');
  return lines.join('\n');
}

export function createMessageHandler({ client, queue, logger }) {
  return async function handleMessage(context) {
    const text = normalizeText(context.text);
    if (!text) return null;

    return queue.add(`message:${context.messageId || Date.now()}`, async () => {
      try {
      const profile = await client.profile();
      const settings = profile.data.settings || {};
      const hooks = normalizeHooks(settings);

      if (hooks.has(text)) {
        const buyerName = context.pushName || 'Kak';
        return [
          `✨ *${settings.brand_name || settings.panel_name || 'PREMIUMIN PLUS BOT'}*`,
          '📩 Dari: Private',
          '',
          `Halo Kak ${buyerName} 👋`,
          '',
          settings.welcome_message || settings.greeting_message || 'Selamat datang, silakan berbelanja.',
          '',
          '🚀 Jasa layanan aplikasi premium cepat, murah, dan terpercaya.',
          '',
          '📦 Ketik *stok* atau *list* untuk melihat katalog',
          '☎️ Ketik *admin* untuk hubungi admin',
          '',
          '🕘 Jam Operasional:',
          settings.operational_hours || '08.00 - 21.00 WIB',
          '',
          settings.closing_message || settings.footer_message || '',
        ].join('\n').trim();
      }

      if (['stok', 'list', '.menu', 'produk'].includes(text)) {
        const catalog = await client.catalog();
        return renderCatalog(catalog.data || [], settings);
      }

      const buyMatch = text.match(/^buy\s*(\d+)$/i);
      if (buyMatch) {
        const code = buyMatch[1];
        const catalog = await client.catalog();
        const product = (catalog.data || []).find((item) => productCode(item) === code);
        const buyerWhatsapp = normalizeWhatsappNumber(context.sender || context.participant || context.jid);
        const payload = { product_code: code, qty: 1, buyer_name: context.pushName || '' };
        if (buyerWhatsapp) payload.buyer_whatsapp = buyerWhatsapp;
        const payment = await client.payment(payload);
        const invoice = paymentInvoice(payment.data);
        if (!isLikelyPaymentInvoice(invoice)) {
          logger.error('Invalid payment invoice from web-core', { product_code: code, invoice });
          throw new Error('Invoice pembayaran tidak valid dari backend');
        }
        logger.info(`Payment created ${invoice}`);
        return {
          image: payment.data.qr_image || payment.data.qr_raw,
          text: formatPaymentCaption({ ...payment.data, invoice }, product?.name),
          invoice,
          payment_invoice: invoice,
        };
      }

      if (text.startsWith('cancel ')) {
        const invoice = text.replace('cancel ', '').trim();
        if (!isLikelyPaymentInvoice(invoice)) {
          return 'Invoice tidak valid. Gunakan invoice pembayaran, bukan kode produk.';
        }
        await client.paymentCancel(invoice);
        return 'TRANSAKSI DIBATALKAN\n\nTenang kak 🙏\nPesanan bisa dibuat kembali kapan saja.\n\n━━━━━━━━━━━━━━━━━━';
      }

      if (text.startsWith('cek ')) {
        const invoice = text.replace('cek ', '').trim();
        if (!isLikelyPaymentInvoice(invoice)) {
          return 'Invoice tidak valid. Contoh benar: cek PAY-20260603-ABC12345';
        }
        const status = await client.paymentStatus(invoice);
        if (['success', 'payment_success'].includes(String(status.data?.status || '').toLowerCase()) && status.data.order) {
          return formatSuccess(status.data.order, settings);
        }
        return `Status invoice ${invoice}: ${status.data?.status || 'pending'}`;
      }

      if (['admin', '.owner', 'owner'].includes(text)) {
        return `Admin/Owner: ${settings.admin_whatsapp || profile.data?.account?.phone || '-'}`;
      }

      return null;
      } catch (error) {
        if (error?.maintenance || error?.statusCode === 503) {
          logger.info('Maintenance response sent to bot user');
          return MAINTENANCE_REPLY;
        }
        logger.error('Bot message failed', {
          message: error?.message || String(error),
          statusCode: error?.statusCode,
        });
        if (error?.statusCode === 400) {
          return `Order belum bisa diproses: ${error.message || 'data pesanan tidak valid'}.\n\nSilakan cek format order dan coba lagi.`;
        }
        return 'Bot sedang gagal memproses request ini. Silakan coba lagi beberapa saat.';
      }
    });
  };
}
