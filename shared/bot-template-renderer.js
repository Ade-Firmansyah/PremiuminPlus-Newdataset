const THEMES = new Set(['theme_1', 'theme_2', 'theme_3', 'theme_4', 'theme_5']);

export const DEFAULT_BOT_TEMPLATE_RENDERER_SETTINGS = {
  active_theme: 'theme_1',
  store_name: 'Premiumin Pluus',
  opening_hour: '08.00',
  closing_hour: '22.00',
  admin_whatsapp: '',
  footer_text: 'Premiumin Pluus',
};

export function formatCurrency(value) {
  return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
}

function clean(value, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function upper(value, fallback = 'PRODUK') {
  return clean(value, fallback).toUpperCase();
}

function normalizeTheme(value) {
  return THEMES.has(value) ? value : DEFAULT_BOT_TEMPLATE_RENDERER_SETTINGS.active_theme;
}

function parseOpenHour(value = '') {
  const matches = String(value || '').match(/\d{1,2}[\.:]\d{2}/g);
  if (!matches || matches.length < 2) return {};
  return { opening_hour: matches[0].replace(':', '.'), closing_hour: matches[1].replace(':', '.') };
}

export function normalizeTemplate(template = {}) {
  const openHour = parseOpenHour(template.open_hour);
  const next = {
    ...DEFAULT_BOT_TEMPLATE_RENDERER_SETTINGS,
    ...template,
    ...openHour,
  };
  return {
    ...next,
    active_theme: normalizeTheme(next.active_theme),
    store_name: clean(next.store_name, DEFAULT_BOT_TEMPLATE_RENDERER_SETTINGS.store_name),
    opening_hour: clean(next.opening_hour, DEFAULT_BOT_TEMPLATE_RENDERER_SETTINGS.opening_hour),
    closing_hour: clean(next.closing_hour, DEFAULT_BOT_TEMPLATE_RENDERER_SETTINGS.closing_hour),
    admin_whatsapp: String(next.admin_whatsapp || '').replace(/\D/g, ''),
    footer_text: clean(next.footer_text, next.store_name || DEFAULT_BOT_TEMPLATE_RENDERER_SETTINGS.footer_text),
  };
}

function openHourText(template = {}) {
  const settings = normalizeTemplate(template);
  return `${settings.opening_hour} - ${settings.closing_hour} WIB`;
}

function adminLink(value) {
  const number = String(value || '').replace(/\D/g, '');
  return number ? `wa.me/${number}` : 'Admin WhatsApp belum disetel';
}

function productsSplit(products = []) {
  const list = Array.isArray(products) ? products : [];
  return {
    available: list.filter((item) => Boolean(item.available ?? Number(item.stock || 0) > 0)),
    empty: list.filter((item) => !Boolean(item.available ?? Number(item.stock || 0) > 0)),
  };
}

function productPrice(item = {}) {
  return item.final_bot_price ?? item.final_price ?? item.price_sell ?? item.price ?? item.amount ?? 0;
}

function productCode(item = {}) {
  return item.bot_code ?? item.code ?? item.id ?? '-';
}

function paymentAmount(payment = {}) {
  return Number(payment.amount ?? payment.final_price ?? payment.price ?? payment.total_price ?? 0);
}

function paymentTotal(payment = {}) {
  return Number(payment.total_bayar ?? payment.payment_amount ?? payment.total_payment ?? payment.total_price ?? paymentAmount(payment));
}

function paymentUniqueCode(payment = {}) {
  return Math.max(paymentTotal(payment) - paymentAmount(payment), 0);
}

function invoiceOf(value = {}) {
  return clean(value.order_invoice || value.invoice || value.payment_invoice, '-');
}

function accountFrom(order = {}) {
  const firstAccount = Array.isArray(order?.accounts) ? order.accounts[0] : null;
  const accountData = order?.account_data && !Array.isArray(order.account_data) ? order.account_data : null;
  return {
    email: clean(order?.email_account || firstAccount?.email || firstAccount?.username || accountData?.email || accountData?.username, '-'),
    password: clean(order?.password_account || firstAccount?.password || firstAccount?.pass || accountData?.password || accountData?.pass, '-'),
  };
}

function stockRowsTheme1(products = []) {
  const { available, empty } = productsSplit(products);
  const lines = ['╭━━〔 ✅ READY STOCK 〕━━⬣', ''];
  if (available.length) {
    lines.push(
      ...available.flatMap((item) => [
        `📦 ${upper(item.name)}`,
        `┣ 💰 Harga : ${formatCurrency(productPrice(item))}`,
        `┣ 📊 Stock : ${Number(item.stock || 0)} AKUN`,
        `╰ 🔑 BUY : buy ${productCode(item)}`,
        '',
      ]),
    );
  } else {
    lines.push('Belum ada produk ready saat ini.', '');
  }
  if (empty.length) {
    lines.push('╭━━〔 ❌ STOCK KOSONG 〕━━⬣', '', ...empty.map((item) => `• ${upper(item.name)}`), '');
  }
  return lines;
}

function stockRowsBox(products = [], availableTitle = '✅ AVAILABLE STOCK', emptyTitle = '❌ OUT OF STOCK') {
  const { available, empty } = productsSplit(products);
  const lines = ['════════════════════', availableTitle, '════════════════════', ''];
  if (available.length) {
    lines.push(
      ...available.flatMap((item) => [
        `📦 ${upper(item.name)}`,
        `┣ 💰 Harga : ${formatCurrency(productPrice(item))}`,
        `┣ 📊 Stock : ${Number(item.stock || 0)} AKUN`,
        `╰ 🔑 BUY : buy ${productCode(item)}`,
        '',
        '════════════════════',
        '',
      ]),
    );
  } else {
    lines.push('Belum ada produk ready saat ini.', '', '════════════════════', '');
  }
  if (empty.length) {
    lines.push(emptyTitle, '════════════════════', '', ...empty.map((item) => `✘ ${upper(item.name)}`), '', '════════════════════', '');
  }
  return lines;
}

const renderers = {
  theme_1: {
    greeting(template, variables) {
      const settings = normalizeTemplate(template);
      return [
        `╭━━━〔 🤖 ${settings.store_name} 〕━━━⬣`,
        '┃',
        `┃ 👋 Halo Kak ${clean(variables.username || variables.name)}`,
        '┃',
        '┃ Selamat datang di',
        `┃ ✨ ${settings.store_name}`,
        '┃',
        '┃ 🚀 Jasa Aplikasi Premium',
        '┃ ⚡ Cepat • Murah • Terpercaya',
        '┃',
        '┣━━━〔 MENU BOT 〕━━━⬣',
        '┃',
        '┃ 📦 ketik stok',
        '┃    untuk melihat katalog',
        '┃',
        '┃ 👨‍💻 ketik admin',
        '┃    untuk hubungi admin',
        '┃',
        '┃ 💰 ketik saldo',
        '┃    untuk cek saldo akun',
        '┃',
        '┃ 📜 ketik transaksi',
        '┃    untuk lihat riwayat',
        '┃',
        '┃ ⏰ Jam Operasional:',
        `┃ ${openHourText(settings)}`,
        '┃',
        '┣━━━〔 INFO 〕━━━⬣',
        '┃',
        '┃ 💎 Harga termurah',
        '┃ 🔒 Aman & terpercaya',
        '┃ ⚡ Proses otomatis realtime',
        '┃ 🚀 Ribuan transaksi sukses',
        '┃',
        '┃ 🙏 Kepuasan pelanggan',
        '┃ adalah prioritas kami',
        '┃',
        '╰━━━━━━━━━━━━━━━━⬣',
      ].join('\n');
    },
    stock(template, variables) {
      const settings = normalizeTemplate(template);
      return [
        '╭━━━〔 📦 STOK TERSEDIA 〕━━━⬣',
        `┃ 🏪 ${settings.store_name}`,
        '╰━━━━━━━━━━━━━━━━⬣',
        '',
        ...stockRowsTheme1(variables.products),
        '╰━━━━━━━━━━━━━━━━⬣',
        '',
        '🛒 Cara order:',
        'ketik buy id',
        '',
        'Contoh:',
        'buy 2',
        '',
        settings.footer_text,
      ].join('\n');
    },
    payment(template, variables) {
      const settings = normalizeTemplate(template);
      const payment = variables.payment || variables;
      return [
        '━━━━━━━━━━━━━━━━━━',
        '🛒 PEMBELIAN PRODUK',
        '━━━━━━━━━━━━━━━━━━',
        '',
        '📦 Produk:',
        upper(variables.product_name || payment.product_name || payment.product),
        '',
        '💰 Harga :',
        formatCurrency(paymentAmount(payment)),
        '',
        '🔢 Kode Unik :',
        paymentUniqueCode(payment).toLocaleString('id-ID'),
        '',
        '💵 Total Bayar :',
        formatCurrency(paymentTotal(payment)),
        '',
        '📄 Invoice :',
        invoiceOf(payment),
        '',
        '━━━━━━━━━━━━━━━━━━',
        '📱 Scan QRIS di atas',
        'untuk menyelesaikan pembayaran',
        '⏳ Berlaku 30 menit',
        '━━━━━━━━━━━━━━━━━━',
        settings.footer_text,
      ].join('\n');
    },
  },
  theme_2: {
    greeting(template, variables) {
      const settings = normalizeTemplate(template);
      return [
        '╔════════════════════╗',
        `║ 🤖 ${upper(settings.store_name).slice(0, 18).padEnd(18, ' ')} ║`,
        '╚════════════════════╝',
        '',
        `➤ Halo Kak ${clean(variables.username || variables.name)} 👋`,
        '',
        '⚡ AUTO PREMIUM SERVICE',
        '⚡ FAST RESPONSE SYSTEM',
        '⚡ REALTIME DELIVERY',
        '⚡ SECURE TRANSACTION',
        '',
        '════════════════════',
        '',
        '📌 COMMAND MENU',
        '',
        '➤ 📦 stok',
        'Lihat katalog premium',
        '',
        '➤ 👨‍💻 admin',
        'Hubungi admin store',
        '',
        '➤ 💰 saldo',
        'Cek saldo akun',
        '',
        '➤ 📜 transaksi',
        'Riwayat transaksi',
        '',
        '════════════════════',
        '',
        '⏰ ONLINE:',
        openHourText(settings),
        '',
        '🏪 STORE:',
        settings.store_name,
        '',
        '════════════════════',
        '',
        '💎 Benefit Premiumin Pluus',
        '',
        '✔ Harga termurah',
        '✔ Auto proses realtime',
        '✔ Aman & terpercaya',
        '✔ Fast delivery system',
        '✔ Support setiap hari',
        '',
        '════════════════════',
        '',
        '🙏 Thanks for using',
        settings.footer_text,
        '════════════════════',
      ].join('\n');
    },
    stock(template, variables) {
      const settings = normalizeTemplate(template);
      return [
        '╔════════════════════╗',
        '║ 📦 LIVE STOCK LIST ║',
        '╚════════════════════╝',
        '',
        `🏪 ${settings.store_name}`,
        '',
        ...stockRowsBox(variables.products),
        '🛒 ORDER FORMAT',
        '',
        'buy <id>',
        '',
        'Example:',
        'buy 2',
        '',
        '════════════════════',
        '⚡ STOCK AUTO UPDATE',
        '════════════════════',
      ].join('\n');
    },
    payment(template, variables) {
      const payment = variables.payment || variables;
      return [
        '╔════════════════════╗',
        '║ 🛒 ORDER PAYMENT  ║',
        '╚════════════════════╝',
        '',
        '📦 PRODUCT',
        upper(variables.product_name || payment.product_name || payment.product),
        '',
        '════════════════════',
        '',
        '💰 PRICE',
        formatCurrency(paymentAmount(payment)),
        '',
        '🔢 UNIQUE CODE',
        paymentUniqueCode(payment).toLocaleString('id-ID'),
        '',
        '💵 TOTAL PAYMENT',
        formatCurrency(paymentTotal(payment)),
        '',
        '📄 INVOICE',
        invoiceOf(payment),
        '',
        '════════════════════',
        '',
        '📱 Scan QRIS di atas',
        'untuk menyelesaikan pembayaran',
        '',
        '⏳ Expired 30 menit',
        '',
        '════════════════════',
      ].join('\n');
    },
  },
  theme_3: {
    greeting(template, variables) {
      const settings = normalizeTemplate(template);
      return [
        `┌─ ${settings.store_name}`,
        `│ Halo Kak ${clean(variables.username || variables.name)}`,
        '│',
        '│ Menu',
        '│ stok        lihat katalog',
        '│ admin       hubungi admin',
        '│ saldo       cek saldo',
        '│ transaksi   riwayat order',
        '│',
        `│ Online ${openHourText(settings)}`,
        `└─ ${settings.footer_text}`,
      ].join('\n');
    },
    stock(template, variables) {
      const settings = normalizeTemplate(template);
      const { available, empty } = productsSplit(variables.products);
      const lines = [`┌─ Katalog ${settings.store_name}`, '│'];
      if (available.length) {
        available.forEach((item) => {
          lines.push(
            `📦 ${upper(item.name)}`,
            `┣ 💰 Harga : ${formatCurrency(productPrice(item))}`,
            `┣ 📊 Stock : ${Number(item.stock || 0)} AKUN`,
            `╰ 🔑 BUY : buy ${productCode(item)}`,
            '│',
          );
        });
      } else {
        lines.push('│ Belum ada stock ready.', '│');
      }
      if (empty.length) {
        lines.push('│ Kosong', ...empty.map((item) => `│ - ${upper(item.name)}`), '│');
      }
      lines.push('└─ Ketik buy <id>');
      return lines.join('\n');
    },
    payment(template, variables) {
      const payment = variables.payment || variables;
      return [
        '┌─ Payment QRIS',
        `│ Produk  ${upper(variables.product_name || payment.product_name || payment.product)}`,
        `│ Harga   ${formatCurrency(paymentAmount(payment))}`,
        `│ Kode    ${paymentUniqueCode(payment).toLocaleString('id-ID')}`,
        `│ Total   ${formatCurrency(paymentTotal(payment))}`,
        `│ Invoice ${invoiceOf(payment)}`,
        '│',
        '│ Scan QRIS di atas.',
        '│ Berlaku 30 menit.',
        '└─ Payment otomatis dicek sistem',
      ].join('\n');
    },
  },
  theme_4: {
    greeting(template, variables) {
      const settings = normalizeTemplate(template);
      return [
        '◇━━━━━━━━━━━━━━━━◇',
        `   ${upper(settings.store_name)}`,
        '◇━━━━━━━━━━━━━━━━◇',
        '',
        `Selamat datang, Kak ${clean(variables.username || variables.name)}.`,
        '',
        '◆ stok',
        '  katalog premium ready',
        '◆ admin',
        '  bantuan transaksi',
        '◆ saldo',
        '  cek saldo akun',
        '◆ transaksi',
        '  riwayat pembelian',
        '',
        `Jam layanan: ${openHourText(settings)}`,
        '',
        'Premium cepat, aman, realtime.',
        `◇ ${settings.footer_text} ◇`,
      ].join('\n');
    },
    stock(template, variables) {
      const settings = normalizeTemplate(template);
      const { available, empty } = productsSplit(variables.products);
      const lines = ['◇━━━━━━━━━━━━━━━━◇', '   PREMIUM CATALOG', '◇━━━━━━━━━━━━━━━━◇', '', `Store: ${settings.store_name}`, ''];
      if (available.length) {
        available.forEach((item) => {
          lines.push(`◆ ${upper(item.name)}`, `  Harga : ${formatCurrency(productPrice(item))}`, `  Ready : ${Number(item.stock || 0)} akun`, `  Order : buy ${productCode(item)}`, '');
        });
      } else {
        lines.push('Stock ready belum tersedia.', '');
      }
      if (empty.length) {
        lines.push('◇ Sold Out', ...empty.map((item) => `  ${upper(item.name)}`), '');
      }
      lines.push('◇━━━━━━━━━━━━━━━━◇', 'Ketik buy <id> untuk order');
      return lines.join('\n');
    },
    payment(template, variables) {
      const payment = variables.payment || variables;
      return [
        '◇━━━━━━━━━━━━━━━━◇',
        '   QRIS PAYMENT',
        '◇━━━━━━━━━━━━━━━━◇',
        '',
        `Produk : ${upper(variables.product_name || payment.product_name || payment.product)}`,
        `Harga  : ${formatCurrency(paymentAmount(payment))}`,
        `Kode   : ${paymentUniqueCode(payment).toLocaleString('id-ID')}`,
        `Total  : ${formatCurrency(paymentTotal(payment))}`,
        '',
        `Invoice: ${invoiceOf(payment)}`,
        '',
        'Scan QRIS di atas untuk bayar.',
        'Akun dikirim setelah pembayaran sukses.',
        '◇━━━━━━━━━━━━━━━━◇',
      ].join('\n');
    },
  },
  theme_5: {
    greeting(template, variables) {
      const settings = normalizeTemplate(template);
      return [
        `[${upper(settings.store_name)}]`,
        `LOGIN: ${clean(variables.username || variables.name)}`,
        '',
        '> premium service online',
        `> schedule ${openHourText(settings)}`,
        '',
        'COMMANDS',
        '- stok       product list',
        '- admin      contact support',
        '- saldo      wallet status',
        '- transaksi  order history',
        '',
        `FOOTER: ${settings.footer_text}`,
      ].join('\n');
    },
    stock(_template, variables) {
      const { available, empty } = productsSplit(variables.products);
      const lines = ['[STOCK.RUNTIME]', ''];
      if (available.length) {
        available.forEach((item) => {
          lines.push(`> ${upper(item.name)}`, `  price=${formatCurrency(productPrice(item))}`, `  stock=${Number(item.stock || 0)}`, `  command=buy ${productCode(item)}`, '');
        });
      } else {
        lines.push('> no ready stock', '');
      }
      if (empty.length) {
        lines.push('[OUT_OF_STOCK]', ...empty.map((item) => `- ${upper(item.name)}`), '');
      }
      lines.push('[ORDER]', 'buy <id>');
      return lines.join('\n');
    },
    payment(_template, variables) {
      const payment = variables.payment || variables;
      return [
        '[PAYMENT.QRIS]',
        `product=${upper(variables.product_name || payment.product_name || payment.product)}`,
        `price=${formatCurrency(paymentAmount(payment))}`,
        `unique_code=${paymentUniqueCode(payment).toLocaleString('id-ID')}`,
        `total=${formatCurrency(paymentTotal(payment))}`,
        `invoice=${invoiceOf(payment)}`,
        '',
        'scan_qris=true',
        'expired=30_minutes',
      ].join('\n');
    },
  },
};

function renderer(template = {}) {
  return renderers[normalizeTemplate(template).active_theme] || renderers.theme_1;
}

export function renderGreeting(template = {}, variables = {}) {
  return renderer(template).greeting(template, variables);
}

export function renderStock(template = {}, variables = {}) {
  return renderer(template).stock(template, variables);
}

export function renderPayment(template = {}, variables = {}) {
  return renderer(template).payment(template, variables);
}

export function renderPaymentSuccess(template = {}, variables = {}) {
  const settings = normalizeTemplate(template);
  const payment = variables.payment || variables;
  if (settings.active_theme === 'theme_2') {
    return [
      '════════════════════',
      '',
      '✅ PAYMENT SUCCESS',
      '',
      '💰 Pembayaran diterima',
      '📦 Pesanan diproses',
      '⏳ Akun segera dikirim',
      '',
      '📄 INVOICE',
      invoiceOf(payment),
      '',
      '════════════════════',
    ].join('\n');
  }
  if (settings.active_theme === 'theme_3') {
    return ['┌─ Payment Success', '│ Pembayaran diterima.', '│ Pesanan sedang diproses.', `│ Invoice ${invoiceOf(payment)}`, '└─ Mohon tunggu sebentar'].join('\n');
  }
  if (settings.active_theme === 'theme_4') {
    return ['◇━━━━━━━━━━━━━━━━◇', '   PAYMENT SUCCESS', '◇━━━━━━━━━━━━━━━━◇', '', 'Pembayaran diterima.', 'Pesanan sedang diproses.', `Invoice: ${invoiceOf(payment)}`, '', 'Mohon tunggu sebentar.'].join('\n');
  }
  if (settings.active_theme === 'theme_5') {
    return ['[PAYMENT.SUCCESS]', 'status=received', 'delivery=processing', `invoice=${invoiceOf(payment)}`].join('\n');
  }
  return [
    '━━━━━━━━━━━━━━━━━━',
    '✅ PEMBAYARAN BERHASIL',
    '━━━━━━━━━━━━━━━━━━',
    '💰 Pembayaran diterima',
    '📦 Pesanan sedang diproses',
    '⏳ Tunggu akun segera dikirimkan...',
    '',
    '📄 Invoice:',
    invoiceOf(payment),
    '━━━━━━━━━━━━━━━━━━',
    '🙏 Mohon tunggu sebentar',
    '━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}

export function renderOrderSuccess(template = {}, variables = {}) {
  const settings = normalizeTemplate(template);
  const order = variables.order || variables;
  const payment = variables.payment || {};
  const account = accountFrom(order);
  const product = upper(order.product_name || payment.product_name || payment.product || variables.product_name);
  const total = formatCurrency(order.total_price || paymentTotal(payment) || paymentAmount(payment));
  const invoice = invoiceOf(order.invoice ? order : payment);
  if (settings.active_theme === 'theme_2') {
    return [
      '════════════════════',
      '',
      '🔐 ACCOUNT DATA',
      '',
      `📦 PRODUCT\n${product}`,
      '',
      '📧 EMAIL',
      account.email,
      '',
      '🔑 PASSWORD',
      account.password,
      '',
      '════════════════════',
      '',
      '📄 Invoice',
      invoice,
      '',
      '🙏 Thanks for order',
      settings.footer_text,
      '════════════════════',
    ].join('\n');
  }
  if (settings.active_theme === 'theme_3') {
    return ['┌─ Akun Terkirim', `│ Produk  ${product}`, `│ Total   ${total}`, `│ Email   ${account.email}`, `│ Pass    ${account.password}`, `│ Invoice ${invoice}`, '└─ Terima kasih'].join('\n');
  }
  if (settings.active_theme === 'theme_4') {
    return ['◇━━━━━━━━━━━━━━━━◇', '   ACCOUNT READY', '◇━━━━━━━━━━━━━━━━◇', '', `Produk : ${product}`, `Total  : ${total}`, '', `Email  : ${account.email}`, `Pass   : ${account.password}`, '', `Invoice: ${invoice}`, '', `◇ ${settings.footer_text} ◇`].join('\n');
  }
  if (settings.active_theme === 'theme_5') {
    return ['[ORDER.COMPLETED]', `product=${product}`, `total=${total}`, `email=${account.email}`, `password=${account.password}`, `invoice=${invoice}`].join('\n');
  }
  return [
    '✅ PEMBAYARAN BERHASIL',
    '━━━━━━━━━━━━━━━━━━',
    '',
    `📦 Produk : ${product}`,
    '',
    '💰 Total :',
    total,
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
    invoice,
    '',
    '🙏 Terima kasih sudah order!',
  ].join('\n');
}

export function renderAdmin(template = {}, variables = {}) {
  const settings = normalizeTemplate(template);
  const admin = variables.admin_number || variables.adminWhatsapp || settings.admin_whatsapp;
  if (settings.active_theme === 'theme_3') {
    return ['┌─ Admin Support', `│ WhatsApp ${adminLink(admin)}`, `│ Online ${openHourText(settings)}`, '└─ Admin siap membantu'].join('\n');
  }
  if (settings.active_theme === 'theme_4') {
    return ['◇━━━━━━━━━━━━━━━━◇', '   ADMIN SUPPORT', '◇━━━━━━━━━━━━━━━━◇', '', `WhatsApp: ${adminLink(admin)}`, `Jam: ${openHourText(settings)}`, '', 'Kirim detail kendala agar dibantu cepat.'].join('\n');
  }
  if (settings.active_theme === 'theme_5') {
    return ['[ADMIN.CONTACT]', `whatsapp=${adminLink(admin)}`, `online=${openHourText(settings)}`].join('\n');
  }
  if (settings.active_theme === 'theme_2') {
    return ['╔════════════════════╗', '║ 👨‍💻 ADMIN SUPPORT ║', '╚════════════════════╝', '', `📱 ${adminLink(admin)}`, '', `⏰ ${openHourText(settings)}`, '', 'Support transaksi dan deposit.', '════════════════════'].join('\n');
  }
  return ['╭━━━〔 👨‍💻 HUBUNGI ADMIN 〕━━━⬣', '', '📱 WhatsApp Admin:', adminLink(admin), '', '⏰ Jam Operasional:', openHourText(settings), '', '🙏 Admin siap membantu', 'kendala transaksi & deposit', '', '╰━━━━━━━━━━━━━━━━━━⬣'].join('\n');
}

export function renderPaymentPending(template = {}, variables = {}) {
  const payment = variables.payment || variables;
  return renderPayment(template, { ...variables, payment });
}

export function renderPaymentFailed(template = {}, variables = {}) {
  const settings = normalizeTemplate(template);
  const payment = variables.payment || variables;
  const title = String(payment.status || '').toLowerCase() === 'expired' ? 'QRIS EXPIRED' : 'PEMBAYARAN GAGAL';
  if (settings.active_theme === 'theme_5') {
    return ['[PAYMENT.FAILED]', `status=${title}`, `invoice=${invoiceOf(payment)}`, 'action=order_again'].join('\n');
  }
  return [
    settings.active_theme === 'theme_2' ? '╔════════════════════╗' : '╭━━━〔 ❌ PEMBAYARAN GAGAL 〕━━━⬣',
    settings.active_theme === 'theme_2' ? `║ ❌ ${title.padEnd(14, ' ')} ║` : '',
    settings.active_theme === 'theme_2' ? '╚════════════════════╝' : '',
    '',
    '📄 Invoice:',
    invoiceOf(payment),
    '',
    '📦 Produk:',
    upper(payment.product_name || payment.product),
    '',
    '⚠️ QRIS telah expired atau pembayaran dibatalkan.',
    '🛒 Silakan order ulang untuk mendapatkan QR baru.',
  ].filter((line) => line !== '').join('\n');
}

export function renderInsufficientBalance(template = {}, variables = {}) {
  const memberMinimum = variables.memberMinimum || 5000;
  const resellerMinimum = variables.resellerMinimum || 25000;
  const settings = normalizeTemplate(template);
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
    `melalui dashboard ${upper(settings.store_name)}`,
  ].join('\n');
}

export function renderBotLocked(_template = {}, variables = {}) {
  return [
    '╭━━━〔 🔒 BOT BELUM AKTIF 〕━━━⬣',
    '',
    '⚠️ Fitur Bot WhatsApp masih terkunci',
    '',
    '┣ Minimal saldo aktivasi:',
    `┃ 👤 Member : ${formatCurrency(variables.memberMinimum || 5000)}`,
    `┃ 👑 Reseller : ${formatCurrency(variables.resellerMinimum || 25000)}`,
    '╰━━━━━━━━━━━━━━━━━━⬣',
    '',
    '💎 Saldo aktivasi digunakan',
    'untuk menjaga bot tetap aktif dan stabil.',
  ].join('\n');
}

export function renderTransactionClosed(template = {}) {
  const settings = normalizeTemplate(template);
  return [
    '╭━━━〔 ⏰ TRANSAKSI OFF 〕━━━⬣',
    '',
    'Transaksi otomatis sedang off',
    'di luar jam operasional Jakarta.',
    '',
    '⏰ Jam Operasional:',
    openHourText(settings),
    '',
    '👨‍💻 Admin:',
    adminLink(settings.admin_whatsapp),
    '',
    'Silakan order lagi saat toko online.',
    '',
    '╰━━━━━━━━━━━━━━━━━━⬣',
  ].join('\n');
}

export function renderStockEmpty(template = {}) {
  const settings = normalizeTemplate(template);
  return ['╭━━━〔 ❌ STOCK HABIS 〕━━━⬣', '', 'Produk yang kamu pilih sedang kosong saat ini.', '', '📦 Ketik stok untuk melihat produk lain.', '', `╰━━ ${settings.footer_text} ━━⬣`].join('\n');
}

export function renderGenericError(template = {}, variables = {}) {
  const message = variables.message || 'Transaksi belum bisa diproses.';
  return ['╭━━━〔 ⚠️ SISTEM INFO 〕━━━⬣', '', message, '', 'Silakan coba beberapa saat lagi atau ketik admin untuk bantuan.', '', '╰━━━━━━━━━━━━━━━━━━⬣'].join('\n');
}

