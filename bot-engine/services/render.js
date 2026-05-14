export function formatCurrency(value) {
  return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
}

function upperProductName(value) {
  return String(value || 'PRODUK').toUpperCase();
}

function normalizeOpenHour(value) {
  return String(value || '07.30 WIB - 21.45 WIB').replace(/\s*-\s*/, ' - ');
}

function brandName(value) {
  return String(value || 'Premiumin Plus').trim();
}

function adminLink(value) {
  const number = String(value || '').replace(/\D/g, '');
  return number ? `wa.me/${number}` : 'Admin WhatsApp belum disetel';
}

function firstAccountFrom(order = {}) {
  const firstAccount = Array.isArray(order?.accounts) ? order.accounts[0] : null;
  const accountData = order?.account_data && !Array.isArray(order.account_data) ? order.account_data : null;
  return {
    email: order?.email_account || firstAccount?.email || firstAccount?.username || accountData?.email || accountData?.username || '-',
    password: order?.password_account || firstAccount?.password || firstAccount?.pass || accountData?.password || accountData?.pass || '-',
  };
}

export function renderGreeting({ name, storeName, openHour }) {
  const store = brandName(storeName);
  return [
    `╭━━━〔 🤖 ${store} 〕━━━⬣`,
    '┃',
    `┃ 👋 Halo Kak ${name || '-'}`,
    '┃',
    '┃ Selamat datang di',
    `┃ ✨ *${store}*`,
    '┃',
    '┃ 🚀 Jasa Aplikasi Premium',
    '┃ ⚡ Cepat • Murah • Terpercaya',
    '┃',
    '┣━━━〔 MENU BOT 〕━━━⬣',
    '┃',
    '┃ 📦 ketik *stok*',
    '┃    untuk melihat katalog',
    '┃',
    '┃ 👨‍💻 ketik *admin*',
    '┃    untuk hubungi admin',
    '┃',
    '┃ ⏰ Jam Operasional:',
    `┃ ${normalizeOpenHour(openHour)}`,
    '┃',
    '┣━━━〔 INFO 〕━━━⬣',
    '┃',
    '┃ 💎 Harga termurah',
    '┃ 🔒 Aman & terpercaya',
    '┃ ⚡ Proses otomatis realtime',
    '┃',
    '┃ 🙏 Kepuasan pelanggan',
    '┃ adalah prioritas kami',
    '┃',
    '╰━━━━━━━━━━━━━━━━⬣',
  ].join('\n');
}

export function renderCatalog(products = [], storeName = 'Premiumin Plus') {
  const store = brandName(storeName);
  const available = products.filter((item) => item.available);
  const empty = products.filter((item) => !item.available);
  const lines = [
    '╭━━━〔 📦 STOK TERSEDIA 〕━━━⬣',
    `┃ 🏪 ${store}`,
    '╰━━━━━━━━━━━━━━━━⬣',
    '',
    '╭━━〔 ✅ READY STOCK 〕━━⬣',
    '',
  ];

  if (available.length) {
    lines.push(
      ...available.flatMap((item) => [
        `📦 *${upperProductName(item.name)}*`,
        `┣ 💰 Harga : ${formatCurrency(item.price_sell)}`,
        `┣ 📊 Stock : ${Number(item.stock || 0)} AKUN`,
        `╰ 🔑 BUY : buy ${item.bot_code}`,
        '',
      ]),
    );
  } else {
    lines.push('Belum ada produk ready saat ini.', '');
  }

  if (empty.length) {
    lines.push('╭━━〔 ❌ STOCK KOSONG 〕━━⬣', '', ...empty.map((item) => `• ${upperProductName(item.name)}`), '');
  }

  lines.push('╰━━━━━━━━━━━━━━━━⬣', '', '🛒 Cara order:', 'ketik *buy id*', '', 'Contoh:', 'buy 2');
  return lines.join('\n');
}

export function renderPayment(payment = {}, productName = 'Produk') {
  const uniqueCode = Math.max(Number(payment.total_bayar || 0) - Number(payment.amount || 0), 0);
  return [
    '━━━━━━━━━━━━━━━━━━',
    '🛒 PEMBELIAN PRODUK',
    '━━━━━━━━━━━━━━━━━━',
    '',
    '📦 Produk:',
    `*${upperProductName(productName)}*`,
    '',
    '💰 Harga :',
    formatCurrency(payment.amount),
    '',
    '🔢 Kode Unik :',
    uniqueCode.toLocaleString('id-ID'),
    '',
    '💵 Total Bayar :',
    formatCurrency(payment.total_bayar || payment.amount),
    '',
    '📄 Invoice :',
    payment.invoice || '-',
    '',
    '━━━━━━━━━━━━━━━━━━',
    '📱 Scan QRIS di atas',
    'untuk menyelesaikan pembayaran',
    '⏳ Berlaku 5 menit',
    '━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}

export function renderSuccess(order = {}, payment = {}) {
  const account = firstAccountFrom(order);
  return [
    '✅ PEMBAYARAN BERHASIL',
    '━━━━━━━━━━━━━━━━━━',
    '',
    `📦 Produk : ${upperProductName(order?.product_name || payment?.product_name || 'Produk')}`,
    '',
    '💰 Total :',
    formatCurrency(order?.total_price || payment?.amount),
    '',
    '━━━━━━━━━━━━━━━━━━',
    '🔐 DATA AKUN',
    '',
    '📧 Email :',
    account.email,
    '',
    '🔑 Password :',
    account.password,
    '',
    '━━━━━━━━━━━━━━━━━━',
    '',
    '📄 Invoice :',
    order?.invoice || payment?.order_invoice || payment?.invoice || '-',
    '',
    '🙏 Terima kasih sudah order!',
  ].join('\n');
}

export function renderPaymentPending(payment = {}) {
  return [
    '╭━━━〔 ⏳ MENUNGGU PEMBAYARAN 〕━━━⬣',
    '',
    '📄 Invoice:',
    payment.invoice || '-',
    '',
    '💰 Total Bayar:',
    formatCurrency(payment.total_bayar || payment.amount),
    '',
    '📦 Produk:',
    upperProductName(payment.product_name || payment.product || 'Produk'),
    '',
    '╰━━━━━━━━━━━━━━━━━━⬣',
    '',
    '📱 Silakan scan QRIS',
    'untuk melanjutkan pembayaran',
    '',
    '⏳ Status:',
    'MENUNGGU PEMBAYARAN',
  ].join('\n');
}

export function renderPaymentFailed(payment = {}) {
  return [
    '╭━━━〔 ❌ PEMBAYARAN GAGAL 〕━━━⬣',
    '',
    '📄 Invoice:',
    payment.invoice || '-',
    '',
    '📦 Produk:',
    upperProductName(payment.product_name || payment.product || 'Produk'),
    '',
    '╰━━━━━━━━━━━━━━━━━━⬣',
    '',
    '⚠️ QRIS telah expired',
    'atau pembayaran dibatalkan',
    '',
    '🛒 Silakan order ulang',
    'untuk mendapatkan QR baru',
  ].join('\n');
}

export function renderInsufficientBalance({ memberMinimum = 5000, resellerMinimum = 25000, storeName = 'PREMIUMIN PLUS' } = {}) {
  return [
    '╭━━━〔 ⚠️ SALDO TIDAK CUKUP 〕━━━⬣',
    '',
    '💰 Saldo kamu tidak cukup',
    'untuk melakukan transaksi ini',
    '',
    '┣ Minimal saldo:',
    `┃ ${formatCurrency(memberMinimum)} (Member)`,
    `┃ ${formatCurrency(resellerMinimum)} (Reseller)`,
    '╰━━━━━━━━━━━━━━━━━━⬣',
    '',
    '💳 Silakan isi saldo terlebih dahulu',
    `melalui dashboard ${brandName(storeName).toUpperCase()}`,
  ].join('\n');
}

export function renderBotLocked({ memberMinimum = 5000, resellerMinimum = 25000 } = {}) {
  return [
    '╭━━━〔 🔒 BOT BELUM AKTIF 〕━━━⬣',
    '',
    '⚠️ Fitur Bot WhatsApp',
    'masih terkunci',
    '',
    '┣ Minimal saldo aktivasi:',
    `┃ 👤 Member : ${formatCurrency(memberMinimum)}`,
    `┃ 👑 Reseller : ${formatCurrency(resellerMinimum)}`,
    '╰━━━━━━━━━━━━━━━━━━⬣',
    '',
    '💎 Saldo aktivasi digunakan',
    'untuk menjaga bot tetap aktif',
    'dan stabil 24 jam',
    '',
    '📌 Jika saldo kurang dari minimum',
    'maka bot otomatis dinonaktifkan',
  ].join('\n');
}

export function renderAdmin({ adminWhatsapp, openHour }) {
  return [
    '╭━━━〔 👨‍💻 HUBUNGI ADMIN 〕━━━⬣',
    '',
    '📱 WhatsApp Admin:',
    adminLink(adminWhatsapp),
    '',
    '⏰ Jam Operasional:',
    normalizeOpenHour(openHour),
    '',
    '🙏 Admin siap membantu',
    'kendala transaksi & deposit',
    '',
    '╰━━━━━━━━━━━━━━━━━━⬣',
  ].join('\n');
}

export function renderTransactionClosed(settings = {}) {
  return [
    '╭━━━〔 ⏰ TRANSAKSI OFF 〕━━━⬣',
    '',
    'Transaksi otomatis sedang off',
    'di luar jam operasional Jakarta.',
    '',
    '⏰ Jam Operasional:',
    normalizeOpenHour(settings.open_hour),
    '',
    '👨‍💻 Admin:',
    adminLink(settings.admin_whatsapp),
    '',
    'Kalau admin masih melek,',
    'nanti dibantu manual ya.',
    '',
    '╰━━━━━━━━━━━━━━━━━━⬣',
  ].join('\n');
}

export function renderStockEmpty() {
  return [
    '╭━━━〔 ❌ STOCK HABIS 〕━━━⬣',
    '',
    'Produk yang kamu pilih',
    'sedang kosong saat ini.',
    '',
    '📦 Ketik *stok*',
    'untuk melihat produk lain.',
    '',
    '╰━━━━━━━━━━━━━━━━━━⬣',
  ].join('\n');
}

export function renderGenericError(message = 'Transaksi belum bisa diproses.') {
  return [
    '╭━━━〔 ⚠️ SISTEM INFO 〕━━━⬣',
    '',
    message,
    '',
    'Silakan coba beberapa saat lagi',
    'atau ketik *admin* untuk bantuan.',
    '',
    '╰━━━━━━━━━━━━━━━━━━⬣',
  ].join('\n');
}
