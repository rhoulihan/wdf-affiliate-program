// Email template manager — a WRAPPER over @crhs/web-core's shared template manager
// (PR B10).
//
// web-core owns the loader (language directory, then the root-level English copy, then
// FALLBACK_TEMPLATE), the `[PLACEHOLDER]` fill and the display formatters, but it ships
// NO templates: each app supplies its own base directory (spec §7.2.4). This module
// binds THIS app's TEMPLATE_ROOT and THIS app's brand, so the 17 two-arg
// `loadTemplate(name, language)` call sites across the six dispatchers are untouched.
//
// TEMPLATE_ROOT is resolved from __dirname, never from the environment: pointing it at
// web-core's (empty) tree would render FALLBACK_TEMPLATE for every email and throw
// nothing. `brand` is read through its getters and never destructured
// (memory brand_config_lazy_resolve_2026-08-24), and no env var is read at module
// scope — the server/utils/cspHelper.js pattern.

const path = require('path');
const core = require('@crhs/web-core').email.templateManager;
const brand = require('../../config/brand');

const TEMPLATE_ROOT = path.join(__dirname, '..', '..', 'templates', 'emails');

/**
 * This app's brand, shaped for web-core's fillTemplate. Resolved per call so a late
 * dotenv (scripts) and a per-request BASE_URL change are both picked up.
 */
function appBrand() {
  return {
    displayName: brand.displayName,
    legalName: brand.legalName,
    logoPath: brand.logoPath,
    baseUrl: process.env.BASE_URL || 'https://portal.atxwashdryfold.com'
  };
}

/**
 * Load a template by name from this app's own template tree, preferring the
 * language-specific copy and falling back to the root-level English one.
 * @param {string} templateName
 * @param {string} [language='en']
 * @param {string} [templateRoot=TEMPLATE_ROOT] overridable for tests only.
 */
function loadTemplate(templateName, language = 'en', templateRoot = TEMPLATE_ROOT) {
  return core.loadTemplate(templateName, language, templateRoot);
}

/**
 * Replace `[KEY]` placeholders in `template` with values from `data`, auto-injecting
 * this app's `[BASE_URL]`, `[BRAND_NAME]`, `[BRAND_LEGAL]` and `[BRAND_LOGO]`
 * (absolute — emails cannot use relative paths). Caller values always win.
 */
function fillTemplate(template, data) {
  return core.fillTemplate(template, data, appBrand());
}

module.exports = {
  loadTemplate,
  fillTemplate,
  formatTimeSlot: core.formatTimeSlot,
  formatSize: core.formatSize,
  TEMPLATE_ROOT
};
