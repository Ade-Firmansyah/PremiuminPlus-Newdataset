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
  const resellerMarkupPercent = Number(user?.markup_percent ?? user?.markup_custom ?? 0);

  if (!Number.isFinite(resellerMarkupPercent) || resellerMarkupPercent < 0) {
    const error = new Error('Markup reseller tidak valid');
    error.statusCode = 400;
    throw error;
  }

  const adminMargin = Number(product?.admin_margin || 0);
  const role = String(user?.role || 'member').toLowerCase();
  const roleMarkupValue = role === 'reseller' ? markupSetting?.reseller_markup : markupSetting?.member_markup;
  const roleMarkup = calculateMarkupAmount(basePrice + adminMargin, roleMarkupValue ?? markupSetting?.markup ?? 0, type);
  const personalMarkup = role === 'reseller' ? Math.round(((basePrice + adminMargin + roleMarkup) * resellerMarkupPercent) / 100) : 0;

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

export function calculateFinalBotPrice(product, markupSetting, user = {}, botMarkupValue = 0) {
  const rolePricing = calculateRoleSellPrice(product, markupSetting, user);
  const qty = Math.max(1, Number(user?.qty || 1));
  const botMarkup = calculateMarkupAmount(rolePricing.sellPrice, botMarkupValue, 'fixed') * qty;
  const rolePrice = rolePricing.sellPrice * qty;
  const providerPrice = rolePricing.basePrice * qty;
  const adminProfit = Math.max(rolePrice - providerPrice, 0);
  const finalBotPrice = rolePrice + botMarkup;

  return {
    ...rolePricing,
    qty,
    provider_price: providerPrice,
    role_price: rolePrice,
    bot_markup: botMarkup,
    bot_markup_profit: botMarkup,
    admin_profit: adminProfit,
    final_bot_price: finalBotPrice,
    final_price: finalBotPrice,
  };
}

export function calculateCanonicalPrices(product, markupSetting) {
  const member = calculateRoleSellPrice(product, markupSetting, { role: 'member' });
  const reseller = calculateRoleSellPrice(product, markupSetting, { role: 'reseller', markup_percent: 0 });

  if (reseller.sellPrice >= member.sellPrice) {
    const error = new Error('Harga reseller wajib lebih murah daripada harga member');
    error.statusCode = 400;
    throw error;
  }

  return {
    member_price: member.sellPrice,
    reseller_price: reseller.sellPrice,
  };
}
