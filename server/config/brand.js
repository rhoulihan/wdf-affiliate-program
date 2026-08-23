'use strict';
// Brand source of truth. Env-sourced with generic defaults so the committed
// repo carries no franchisor mark; production .env sets BRAND_DISPLAY_NAME.
// legalName is the real owner (not the franchisor) and is always literal.
// Domain/email/DB identifiers are intentionally NOT here — Phase 4 owns them.

const displayName = process.env.BRAND_DISPLAY_NAME || 'Laundromat';
const shortName = process.env.BRAND_SHORT_NAME || 'Laundromat';
const legalName = process.env.BRAND_LEGAL_NAME || 'CRHS Enterprises, LLC';
const instanceName = process.env.BRAND_INSTANCE_NAME || 'laundromat';

module.exports = { displayName, shortName, legalName, instanceName };
