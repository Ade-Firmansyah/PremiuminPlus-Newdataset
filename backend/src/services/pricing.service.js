export function getMarkupTier(price, tiers) {
  const tier = tiers.find((item) => price >= item.min && (item.max === null || price <= item.max));
  return tier || tiers[tiers.length - 1];
}

export function calculateSellPrice(basePrice, tiers) {
  const tier = getMarkupTier(basePrice, tiers);
  const markup = Math.round((basePrice * tier.percent) / 100);
  return {
    tier,
    basePrice,
    markup,
    sellPrice: basePrice + markup,
  };
}

export function calculateSellPriceBySetting(basePrice, markupSetting) {
  const numericBasePrice = Number(basePrice);
  if (!Number.isFinite(numericBasePrice) || numericBasePrice < 0) {
    const error = new Error('Harga dasar tidak valid');
    error.statusCode = 400;
    throw error;
  }

  const markup = Number(markupSetting?.markup || 0);
  if (!Number.isFinite(markup) || markup < 0) {
    const error = new Error('Markup tidak valid');
    error.statusCode = 400;
    throw error;
  }

  const type = markupSetting?.markup_type === 'fixed' ? 'fixed' : 'percent';
  const sellPrice = type === 'fixed' ? numericBasePrice + markup : numericBasePrice + Math.round((numericBasePrice * markup) / 100);
  return {
    basePrice: numericBasePrice,
    markup,
    markup_type: type,
    sellPrice,
  };
}

export function calculateResellerSellPrice(product, markupSetting, user = {}) {
  return calculateRoleSellPrice(product, markupSetting, { ...user, role: user?.role || 'reseller' });
}

function calculateMarkupAmount(price, value, type = 'percent') {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    const error = new Error('Markup tidak valid');
    error.statusCode = 400;
    throw error;
  }
  return type === 'fixed' ? numericValue : Math.round((price * numericValue) / 100);
}

export function calculateRoleSellPrice(product, markupSetting, user = {}) {
  const basePrice = Number(product?.price_base || product?.base_price || 0);
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    const error = new Error('Harga dasar tidak valid');
    error.statusCode = 400;
    throw error;
  }

  const type = markupSetting?.markup_type === 'fixed' ? 'fixed' : 'percent';
  const resellerMarkupPercent = Number(user?.reseller_margin_percent ?? user?.markup_percent ?? user?.markup_custom ?? 0);

  if (!Number.isFinite(resellerMarkupPercent) || resellerMarkupPercent < 0) {
    const error = new Error('Markup reseller tidak valid');
    error.statusCode = 400;
    throw error;
  }

  const adminMargin = Number(product?.admin_margin || 0);
  const role = String(user?.role || 'member').toLowerCase();
  const roleMarkupValue = role === 'reseller' ? markupSetting?.reseller_markup : markupSetting?.member_markup;
  const roleMarkup = calculateMarkupAmount(basePrice + adminMargin, roleMarkupValue ?? markupSetting?.markup ?? 0, type);
  const includePersonalMarkup = role === 'reseller' || Boolean(user?.include_personal_markup);
  const personalMarkup = includePersonalMarkup ? Math.round(((basePrice + adminMargin + roleMarkup) * resellerMarkupPercent) / 100) : 0;

  return {
    basePrice,
    adminMargin,
    role,
    roleMarkup,
    resellerMarkup: personalMarkup,
    reseller_markup_percent: resellerMarkupPercent,
    sellPrice: basePrice + adminMargin + roleMarkup + personalMarkup,
  };
}
