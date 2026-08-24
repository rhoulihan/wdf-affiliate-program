/**
 * Location quarantine middleware.
 *
 * Locks the deployment down to Austin-only: only Austin location pages
 * (/austin-tx/*), the affiliate-program app (API, embed pages, assets,
 * legal), and a few helper endpoints serve from this origin. Everything
 * else 302-redirects to the corporate site (www.wavemaxlaundry.com),
 * preserving the original path so the corporate side can route it.
 *
 * Activated by env var QUARANTINE_NON_AUSTIN=true. When unset/false the
 * middleware is a no-op — existing behavior is preserved (useful for
 * tests and for local dev where the corporate site isn't relevant).
 *
 * Mounted early in server.js — before embed routes, static, and any of
 * the corporate page handlers — so it gets first crack at every request.
 *
 * Reads the env var at request time, not at module-load, so tests can
 * flip QUARANTINE_NON_AUSTIN per-describe without re-requiring the app.
 */

const path = require('path');
const {
  isAllowed,
  buildCorporateRedirect,
  isQuarantineEnabled,
} = require('../config/quarantineConfig');
const { readHTMLWithNonce } = require('../utils/cspHelper');
const storeIPs = require('../config/storeIPs');
const logger = require('../utils/logger');
const { clientIp } = require('../utils/clientIp');

// The store location (STORE_IP_ADDRESS + ADDITIONAL_STORE_IPS + STORE_IP_RANGES,
// IPv4 and the store's IPv6 /64) is a trusted origin — never quarantine it.
function isStoreReq(req) {
  const ip = clientIp(req);
  return !!ip && storeIPs.isWhitelisted(ip);
}

// Branded 404 served from crhsent.com (see below). Lives under the crhsent
// content root alongside the rest of that domain's pages.
const CRHSENT_404 = path.join(__dirname, '..', '..', 'crhsent', '404.html');

/**
 * crhsent.com is CRHS Enterprises' own property — its traffic must NEVER be
 * 302'd to the franchisor's corporate site. (Doing so is wrong on brand, SEO,
 * and just looks broken.) Match the host the same way the crhsent content
 * handler does (server.js), stripping a leading `www.`.
 */
function isCrhsentHost(req) {
  const host = String(req.hostname || '').toLowerCase().replace(/^www\./, '');
  return host === 'crhsent.com';
}

/**
 * The atxwashdryfold portal/app domain is CRHS's own property (Phase 4a
 * migration target). Like crhsent.com it must NEVER be 302'd to the
 * franchisor's corporate site — the app serves its own content and its own
 * 404 here. Without this, SPA content fragments that aren't in the allowlist
 * (e.g. /embed-landing.html) get redirected off-origin and CSP blocks the
 * cross-origin fetch, breaking the portal login.
 */
function isOwnPortalHost(req) {
  const host = String(req.hostname || '').toLowerCase().replace(/^www\./, '');
  return host === 'portal.atxwashdryfold.com' || host === 'atxwashdryfold.com';
}

async function serveCrhsent404(req, res) {
  // Everything is inside the try so a throw (e.g. headers already sent) can't
  // escape this async function and surface as an unhandled rejection — Express
  // 4 does not await middleware, so it would not catch it.
  try {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const html = await readHTMLWithNonce(CRHSENT_404, res.locals.cspNonce);
    return res.status(404).type('html').send(html);
  } catch (err) {
    logger.error('crhsent 404 page unavailable, sending plain 404', { error: err.message });
    if (!res.headersSent) return res.status(404).type('text/plain').send('Not Found');
  }
}

function locationQuarantine(req, res, next) {
  if (!isQuarantineEnabled()) return next();
  if (isAllowed(req.path)) return next();
  if (isStoreReq(req)) return next(); // store location is never quarantined
  // A gated/unknown path on crhsent.com 404s from its own domain rather than
  // redirecting to the corporate site.
  if (isCrhsentHost(req)) return serveCrhsent404(req, res);
  // Our own atxwashdryfold portal — the app serves it (content or its own
  // 404); never funnel it to the franchisor's corporate site.
  if (isOwnPortalHost(req)) return next();
  res.redirect(302, buildCorporateRedirect(req.originalUrl));
}

module.exports = locationQuarantine;
