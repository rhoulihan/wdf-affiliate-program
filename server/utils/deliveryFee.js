// Effective delivery fee resolution (display + Cents-selection), shared by the
// claim flow, operator scan, and order emails.
//
// A partner who sets their own delivery fee uses it (and earns it as commission).
// A partner with NO fee uses Laundromat Associates for pickup/delivery at the
// configurable `default_delivery_fee` (default $10). That default DISPLAYS the
// same way to the customer, but it is house revenue — it is NOT recorded as
// partner commission (see orderTransitionService: deliveryFeeCharged uses the
// partner's OWN fee, 0 for the default case).

const SystemConfig = require('../models/SystemConfig');

const DEFAULT_DELIVERY_FEE_KEY = 'default_delivery_fee';
const DEFAULT_DELIVERY_FEE = 10;

/**
 * The fee shown to the customer + used by the operator to pick the right fee in
 * Cents: the partner's own fee when > 0, otherwise the Laundromat Associates default.
 * @param {{deliveryFee?: number}|null} affiliate
 * @returns {Promise<number>}
 */
async function effectiveDeliveryFee(affiliate) {
  const own = affiliate && Number(affiliate.deliveryFee) > 0 ? Number(affiliate.deliveryFee) : 0;
  if (own > 0) return own;
  const def = await SystemConfig.getValue(DEFAULT_DELIVERY_FEE_KEY, DEFAULT_DELIVERY_FEE);
  const n = Number(def);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DELIVERY_FEE;
}

module.exports = { effectiveDeliveryFee, DEFAULT_DELIVERY_FEE_KEY, DEFAULT_DELIVERY_FEE };
