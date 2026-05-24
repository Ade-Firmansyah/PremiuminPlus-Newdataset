import {
  formatCurrency,
  renderAdmin as renderTemplateAdmin,
  renderBotLocked as renderTemplateBotLocked,
  renderGenericError as renderTemplateGenericError,
  renderGreeting as renderTemplateGreeting,
  renderInsufficientBalance as renderTemplateInsufficientBalance,
  renderOrderSuccess,
  renderPayment as renderTemplatePayment,
  renderPaymentFailed as renderTemplatePaymentFailed,
  renderPaymentPending as renderTemplatePaymentPending,
  renderPaymentSuccess,
  renderStock,
  renderStockEmpty as renderTemplateStockEmpty,
  renderTransactionClosed as renderTemplateTransactionClosed,
} from '../../shared/bot-template-renderer.js';

export { formatCurrency };

function templateFromSettings(template = {}, fallback = {}) {
  const next = {
    ...fallback,
    ...(template?.bot_template || {}),
  };
  for (const [key, value] of Object.entries(template || {})) {
    if (value !== undefined && value !== null && value !== '') {
      next[key] = value;
    }
  }
  return next;
}

export function renderGreeting({ name, storeName, openHour } = {}, template = {}) {
  return renderTemplateGreeting(templateFromSettings(template, { store_name: storeName, open_hour: openHour }), { username: name });
}

export function renderCatalog(products = [], storeName = 'Premiumin Pluus', template = {}) {
  return renderStock(templateFromSettings(template, { store_name: storeName }), { products });
}

export function renderPayment(payment = {}, productName = 'Produk', template = {}) {
  return renderTemplatePayment(templateFromSettings(template), { payment, product_name: productName });
}

export function renderSuccess(order = {}, payment = {}, template = {}) {
  return renderOrderSuccess(templateFromSettings(template), { order, payment });
}

export function renderPaymentSuccessProcessing(payment = {}, template = {}) {
  return renderPaymentSuccess(templateFromSettings(template), { payment });
}

export function renderPaymentPending(payment = {}, template = {}) {
  return renderTemplatePaymentPending(templateFromSettings(template), { payment, product_name: payment.product_name || payment.product || 'Produk' });
}

export function renderPaymentFailed(payment = {}, template = {}) {
  return renderTemplatePaymentFailed(templateFromSettings(template), { payment });
}

export function renderInsufficientBalance(options = {}, template = {}) {
  return renderTemplateInsufficientBalance(templateFromSettings(template, { store_name: options.storeName }), options);
}

export function renderBotLocked(options = {}, template = {}) {
  return renderTemplateBotLocked(templateFromSettings(template), options);
}

export function renderAdmin({ adminWhatsapp, openHour } = {}, template = {}) {
  return renderTemplateAdmin(templateFromSettings(template, { admin_whatsapp: adminWhatsapp, open_hour: openHour }), {
    admin_number: adminWhatsapp,
  });
}

export function renderTransactionClosed(settings = {}, template = {}) {
  return renderTemplateTransactionClosed(templateFromSettings(template, settings));
}

export function renderStockEmpty(template = {}) {
  return renderTemplateStockEmpty(templateFromSettings(template));
}

export function renderGenericError(message = 'Transaksi belum bisa diproses.', template = {}) {
  return renderTemplateGenericError(templateFromSettings(template), { message });
}

