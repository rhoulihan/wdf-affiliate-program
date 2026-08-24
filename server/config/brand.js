'use strict';
// Brand source of truth. Env-sourced with generic defaults so the committed
// repo carries no franchisor mark; production .env sets BRAND_DISPLAY_NAME.
// legalName is the real owner (not the franchisor) and is always literal.
// Domain/email/DB identifiers are intentionally NOT here — Phase 4 owns them.
//
// Recognised environment overrides (all optional — the generic defaults suffice
// for the committed repo, so they are NOT added to .env.example):
//   BRAND_DISPLAY_NAME   — user-facing brand name          (default 'Laundromat')
//   BRAND_SHORT_NAME     — short/compact brand name        (default 'Laundromat')
//   BRAND_LEGAL_NAME     — legal entity (real owner)        (default 'CRHS Enterprises, LLC')
//   BRAND_INSTANCE_NAME  — lowercase instance slug          (default 'laundromat')
//   BRAND_LOGO_PATH      — site-relative logo image path    (default '/assets/images/brand/logo.png')
//   BRAND_OG_IMAGE_PATH  — site-relative OG/Twitter image   (default '/assets/images/affiliate-ad-og.png')
// logoPath is resolved into HTML via the {{BRAND_LOGO}} placeholder (cspHelper)
// and into emails via the [BRAND_LOGO] placeholder (email/template-manager,
// where it is prefixed with BASE_URL to yield an absolute URL).

// Resolved on ACCESS rather than at import. Anything that requires this module
// before dotenv.config() has run would otherwise freeze the generic fallbacks
// for the life of the process — which is exactly how script-sent mail went out
// as "Laundromat" while the running app (dotenv first) branded correctly.
// Every consumer reads brand.<prop>, never destructures, so getters are safe.
module.exports = {
  get displayName() { return process.env.BRAND_DISPLAY_NAME || 'Laundromat'; },
  get shortName() { return process.env.BRAND_SHORT_NAME || 'Laundromat'; },
  get legalName() { return process.env.BRAND_LEGAL_NAME || 'CRHS Enterprises, LLC'; },
  get instanceName() { return process.env.BRAND_INSTANCE_NAME || 'laundromat'; },
  get logoPath() { return process.env.BRAND_LOGO_PATH || '/assets/images/brand/logo.png'; },
  get ogImagePath() { return process.env.BRAND_OG_IMAGE_PATH || '/assets/images/affiliate-ad-og.png'; }
};
