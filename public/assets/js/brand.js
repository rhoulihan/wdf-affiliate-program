/* Brand bootstrap — sets window.BRAND from the <meta name="brand-name"> tag
   (filled server-side on nonce-served pages) or GET /api/v1/brand (fallback
   for raw-served pages). Re-seeds i18n and re-translates if the value arrives
   after i18n has already initialized. */
(function () {
  'use strict';
  function apply(name, short) {
    // legalName is not exposed by /api/v1/brand — it is a fixed ownership
    // constant (the real owner, not a franchisor mark), so hardcode it here.
    window.BRAND = { name: name, short: short || name, legal: 'CRHS Enterprises, LLC' };
    if (window.i18n) {
      window.i18n.globalParams = Object.assign({}, window.i18n.globalParams, { brandName: name, brandLegal: window.BRAND.legal });
      if (typeof window.i18n.translatePage === 'function') {
        try { window.i18n.translatePage(); } catch (e) { /* i18n not ready */ }
      }
    }
  }
  var meta = document.querySelector('meta[name="brand-name"]');
  var fromMeta = meta && meta.getAttribute('content');
  if (fromMeta) { apply(fromMeta); return; }
  // No server-filled meta (raw page): fetch the value.
  try {
    fetch('/api/v1/brand', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.displayName) apply(d.displayName, d.shortName); })
      .catch(function () { /* leave i18n on its generic default */ });
  } catch (e) { /* fetch unavailable */ }
})();
