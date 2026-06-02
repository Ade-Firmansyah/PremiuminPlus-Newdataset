/**
 * Product Pricing Service
 * 
 * Pre-calculates and stores member_price and reseller_price
 * to eliminate double-markup bugs and frontend recalculations.
 * 
 * RULE: Backend calculates ONCE, Frontend renders ONLY.
 */

import { listProducts, updateProduct } from '../repositories/product.repo.js';
import { getMarkupSetting } from '../repositories/settings.repo.js';

export function calculateProductMarkup(basePrice, adminMargin, markupPercent, markupType = 'percent') {
  const subtotal = basePrice + adminMargin;
  if (markupType === 'fixed') {
    return subtotal + markupPercent;
  }
  const markup = Math.round((subtotal * markupPercent) / 100);
  return subtotal + markup;
}

export function calculateRangeMarkup(price, ranges) {
  if (!Array.isArray(ranges) || !ranges.length) return null;
  const range = ranges.find(
    (item) => price >= Number(item.min || 0) && (item.max === null || item.max === undefined || price <= Number(item.max))
  );
  return range ? Number(range.percent ?? range.value ?? 0) : Number(ranges[ranges.length - 1]?.percent ?? ranges[ranges.length - 1]?.value ?? 0);
}

/**
 * Calculate member and reseller prices for a product
 * Returns pre-calculated prices that should be stored in database
 */
export function calculateProductPrices(product, markupSetting) {
  const basePrice = Number(product.base_price || product.price_base || 0);
  const adminMargin = Number(product.admin_margin || 0);

  if (!markupSetting) {
    // No markup setting, use base + admin margin
    return {
      member_price: basePrice + adminMargin,
      reseller_price: basePrice + adminMargin,
    };
  }

  const markupType = markupSetting.markup_type === 'fixed' ? 'fixed' : 'percent';
  const subtotal = basePrice + adminMargin;

  // Calculate member price
  const memberRangeMarkup = calculateRangeMarkup(subtotal, markupSetting.member_markup_ranges);
  const memberMarkupValue = memberRangeMarkup ?? markupSetting.member_markup ?? markupSetting.markup ?? 0;
  const memberPrice = calculateProductMarkup(basePrice, adminMargin, memberMarkupValue, markupType);

  // Calculate reseller price
  const resellerRangeMarkup = calculateRangeMarkup(subtotal, markupSetting.reseller_markup_ranges);
  const resellerMarkupValue = resellerRangeMarkup ?? markupSetting.reseller_markup ?? markupSetting.markup ?? 0;
  const resellerPrice = calculateProductMarkup(basePrice, adminMargin, resellerMarkupValue, markupType);

  return {
    member_price: Math.max(0, memberPrice),
    reseller_price: Math.max(0, resellerPrice),
  };
}

export async function recalculateAllProductPrices() {
  const products = await listProducts();
  const markupSetting = await getMarkupSetting();
  let updated = 0;

  for (const product of products) {
    const prices = calculateProductPrices(product, markupSetting);
    await updateProduct(product.id, {
      member_price: prices.member_price,
      reseller_price: prices.reseller_price,
    });
    updated += 1;
  }

  return { updated };
}
