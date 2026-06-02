const GREETING_KEYWORDS = new Set(['p', 'ping', 'kak', 'gan', 'bro', 'bang', 'assalamualaikum']);
const MAINTENANCE_REPLY = 'Web sedang maintenance. Transaksi sementara tidak tersedia.';

function normalizeText(message = '') {
  return String(message).trim().toLowerCase();
}

function formatCatalog(products) {
  if (!products.length) {
    return 'Belum ada produk yang tersedia di catalog.';
  }

  const ready = products.filter((product) => product.stock > 0);
  const empty = products.filter((product) => product.stock <= 0);
  const lines = [
    '━━━━━━━━━━━━━━━━━━',
    '📦 KATALOG PRODUK',
    '━━━━━━━━━━━━━━━━━━',
    '',
    ...ready.map((product) => [
      `📦 ${product.name} || STOK : ${product.stock} AKUN`,
      `💰 PRICE : Rp ${Number(product.price || 0).toLocaleString('id-ID')} || 🔑 CODE : ${String(product.buy_code || '').replace('buy', 'buy ')}`,
    ].join('\n')),
  ];

  if (empty.length) {
    lines.push('', '━━━━━━━━━━━━━━━━━━', '❌ STOK HABIS', '', ...empty.map((product) => `* ${product.name}`), '━━━━━━━━━━━━━━━━━━');
  } else {
    lines.push('', '━━━━━━━━━━━━━━━━━━');
  }

  return lines.join('\n');
}

function formatPaymentCaption(payment, productName = 'Produk digital') {
  return [
    '━━━━━━━━━━━━━━━━━━',
    '🛒 PEMBELIAN PRODUK',
    '',
    productName,
    '',
    `💵 Total Bayar : Rp ${Number(payment.total_bayar || payment.amount || 0).toLocaleString('id-ID')}`,
    '📄 Invoice:',
    payment.invoice,
    '',
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

export function formatSuccess(order) {
  return [
    "╭·· ─ ׄ᯽. *𝗆𝗂𝗇𝗂 note's* ⚘ ⁺ִ 𖹭",
    '',
    '✅ *PEMBAYARAN BERHASIL*',
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    '📦 Produk:',
    order.product_name || '-',
    '',
    '💰 Total:',
    `Rp ${Number(order.total_price || 0).toLocaleString('id-ID')}`,
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    '🔐 *DATA AKUN*',
    '',
    `email : ${order.email_account || '-'}`,
    `pass : ${order.password_account || '-'}`,
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    '📄 Invoice:',
    order.invoice,
    '',
    '🙏 Terima kasih sudah order!',
    '',
    '╰╍ ⁺ִ 🎀 𝗍𝗁𝖺𝗇𝗄 𝗎 𝗎𝗋 𝗉𝗎𝗋𝖼𝗁𝖺𝗌𝖾 ┄ ⊹',
    '',
    '⚠️ Simpan pesan transaksi ini, jika hilang tidak dapat klaim garansi.',
    '⚠️ 1 akun hanya digunakan untuk 1 device.',
    '⚠️ Dilarang mengganti password/PIN.',
    '⚠️ Jangan sering login-logout agar akun stabil.',
    '⚠️ Masa garansi mengikuti masa aktif pembelian.',
  ].join('\n');
}

export function createMessageHandler({ client, queue, logger }) {
  return async function handleMessage(context) {
    const text = normalizeText(context.text);
    if (!text) return null;

    return queue.add(`message:${context.messageId || Date.now()}`, async () => {
      try {
      if (GREETING_KEYWORDS.has(text)) {
        const profile = await client.profile();
        const settings = profile.data.settings || {};
        return `${settings.panel_name || 'Premiumin Plus'}\n\n${settings.greeting_message || 'Selamat datang di Premiumin Plus'}\n\n${settings.keyword_response || 'Untuk melihat stok ketik:\nstok / list'}\n\n${settings.footer_message || ''}`.trim();
      }

      if (['stok', 'list'].includes(text)) {
        const catalog = await client.catalog();
        return formatCatalog(catalog.data || []);
      }

      if (/^buy\d+$/.test(text)) {
        const catalog = await client.catalog();
        const product = (catalog.data || []).find((item) => String(item.buy_code || '').replace(/\s+/g, '') === text);
        const payment = await client.payment({ buy_code: text, qty: 1, buyer_whatsapp: context.jid?.split('@')[0] });
        logger.info(`Payment created ${payment.data.invoice}`);
        return {
          image: payment.data.qr_image || payment.data.qr_raw,
          text: formatPaymentCaption(payment.data, product?.name),
          invoice: payment.data.invoice,
        };
      }

      if (text.startsWith('cancel ')) {
        const invoice = text.replace('cancel ', '').trim();
        await client.paymentCancel(invoice);
        return 'TRANSAKSI DIBATALKAN\n\nTenang kak 🙏\nPesanan bisa dibuat kembali kapan saja.\n\n━━━━━━━━━━━━━━━━━━';
      }

      if (text.startsWith('cek ')) {
        const invoice = text.replace('cek ', '').trim();
        const status = await client.paymentStatus(invoice);
        if (status.data?.status === 'success' && status.data.order) {
          return formatSuccess(status.data.order);
        }
        return `Status invoice ${invoice}: ${status.data?.status || 'pending'}`;
      }

      return null;
      } catch (error) {
        if (error?.maintenance || error?.statusCode === 503) {
          logger.info('Maintenance response sent to bot user');
          return MAINTENANCE_REPLY;
        }
        throw error;
      }
    });
  };
}
