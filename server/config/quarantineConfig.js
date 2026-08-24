/**
 * Quarantine configuration — what passes through, what redirects.
 *
 * When `QUARANTINE_NON_AUSTIN=true` the middleware (locationQuarantine.js)
 * lets only these path patterns through; everything else 302-redirects to
 * the corporate site at CORPORATE_SITE_URL with the original path preserved.
 *
 * The intent is: this server hosts the Austin location pages + the
 * affiliate-program app. Marketing/corporate content and other franchise
 * locations live on www.wavemaxlaundry.com.
 */

const CORPORATE_SITE_URL =
  (process.env.CORPORATE_SITE_URL || 'https://www.wavemaxlaundry.com').replace(/\/+$/, '');

// Patterns matched against req.path (no query string, no method). Order does
// not matter — any match passes the request through. Use anchored regexes so
// a substring like "austin" elsewhere in the URL doesn't accidentally allow.
const ALLOWLIST = [
  // ── Austin location (iframe-bridge architecture) ─────────────────
  /^\/austin-tx(\/.*)?$/,           // /austin-tx, /austin-tx/, /austin-tx/wash-dry-fold/, etc.
  /^\/api\/austin-tx\//,            // Austin Places config endpoint

  // ── Affiliate-program app — API surface ──────────────────────────
  /^\/api\//,                       // covers /api/v1, /api/v2, /api/csrf-token, /api/health, /api/docs
  /^\/health$/,                     // non-API health (some monitors hit this)

  // ── Affiliate-program app — static assets and SPA entry ──────────
  /^\/assets\//,                    // CSS, JS, images
  /^\/locales\//,                   // i18n translation files
  /^\/franchise-default\//,         // internal iframe content for default franchise pages
  /^\/data\/franchises\.json$/,     // franchise index (used by clients/sitemap; not per-franchise data)
  /^\/embed-app(-v2)?\.html$/,      // SPA shell
  /^\/embed-landing\.html$/,        // SPA default landing/login fragment (fetched by the router; not a *-embed.html)
  /^\/admin\/?$/,                   // clean admin URL (IP-gated by adminIpGate; must reach its handler, not redirect to corporate)
  /^\/operator\/?$/,                // clean operator URL (IP-gated by operatorIpGate; must reach its handler)
  /^\/affiliate\/?$/,               // public UT-student affiliate recruitment landing page
  /^\/wavemax-affiliate\/?$/,       // public generic affiliate interest page (ad funnel)
  /^\/scanbag\/?$/,                 // mobile bag-scanner PWA (public; hands off to /claim)
  /^\/scanbag-sw\.js$/,             // its service worker
  /^\/scanbag-manifest\.json$/,     // its web app manifest
  /^\/[a-z0-9-]+-embed\.html$/,     // any *-embed.html (affiliate-login, customer-register, etc.)
  /^\/design-explorer(\/.*)?$/,     // token-gated franchisor design review tool (explorerGuard enforces EXPLORER_TOKEN)

  // ── Legal/policy (required for payment processor + compliance) ───
  /^\/privacy-policy$/,
  /^\/terms-of-service$/,
  /^\/terms-and-conditions$/,
  /^\/refund-policy$/,

  // ── SEO crawl resources ──────────────────────────────────────────
  // Per-host robots.txt and sitemap.xml emitted by server.js so each of
  // the four per-location domains points search engines at its own URL
  // set. Search crawlers (Googlebot, Bingbot) don't carry session cookies
  // or whitelisted IPs, so these must be public.
  /^\/robots\.txt$/,
  /^\/sitemap\.xml$/,
];

/**
 * Does this path pass the allowlist?
 * @param {string} pathname  req.path (no query string)
 */
function isAllowed(pathname) {
  return ALLOWLIST.some((re) => re.test(pathname));
}

// Suspicious-path patterns. When a quarantined request matches one of
// these, the redirect strips the path and lands on the corporate root
// (not the original URL). Without the strip, anyone could construct
// `https://rundberglaundry.com/<phishy-path>` and have it 302 to
// `https://www.wavemaxlaundry.com/<phishy-path>` — a credible phishing
// vector even though the destination host is legitimate. Filter is also
// a cleanup signal: scanners hitting wp-admin/.env/.git get one harmless
// hop to the corporate front door instead of an annoying log trail on the
// corporate side. M-13 / prod-lockdown-2026-05-20.
const SUSPICIOUS_PATTERNS = [
  // Secret-file probes
  /^\/\.env(\.|$)/,                       // .env, .env.local, .env.production
  /^\/\.git(\/|$)/,                       // .git, .git/HEAD, .git/config
  /^\/\.svn(\/|$)/,
  /^\/\.aws(\/|$)/,
  /^\/\.ssh(\/|$)/,
  /^\/\.DS_Store$/,

  // WordPress / common-CMS probes
  /^\/wp-admin(\/|$)/,
  /^\/wp-login\.php/,
  /^\/wp-content(\/|$)/,
  /^\/wp-includes(\/|$)/,
  /^\/xmlrpc\.php/,
  /^\/phpmyadmin(\/|$)/i,
  /^\/pma(\/|$)/i,

  // PHP / classic-app fingerprinting
  /\.php(\?|$)/,
  /\.asp(x)?(\?|$)/,
  /\.jsp(\?|$)/,
  /\.cgi(\?|$)/,
  /^\/cgi-bin(\/|$)/,
  /^\/phpinfo(\.|$)/,

  // Server status / info endpoints
  /^\/server-status(\/|$)/,
  /^\/server-info(\/|$)/,

  // OS / shell paths
  /^\/cmd\.exe$/i,
  /^\/etc\/passwd$/,
  /^\/proc\/self(\/|$)/,

  // Build-system / dependency manifests
  /^\/Dockerfile$/,
  /^\/docker-compose\.ya?ml$/,
  /^\/package(-lock)?\.json$/,
  /^\/composer(-lock)?\.json$/,
  /^\/yarn\.lock$/,
];

/**
 * Is this path a known scanner / phishing-friendly pattern?
 * @param {string} pathname  req.path (no query string)
 */
function isSuspicious(pathname) {
  return SUSPICIOUS_PATTERNS.some((re) => re.test(pathname));
}

/**
 * Build the corporate URL that a quarantined path redirects to.
 * Legitimate paths are preserved verbatim — the corporate site is
 * responsible for its own URL structure / 404s. Suspicious paths
 * (see SUSPICIOUS_PATTERNS) are stripped to the corporate root, so the
 * domain can't be used to build phishing-friendly link chains. M-13
 * / prod-lockdown-2026-05-20.
 *
 * @param {string} originalUrl  req.originalUrl (path + query)
 */
function buildCorporateRedirect(originalUrl) {
  // originalUrl always starts with '/'; ensure no double slash.
  const tail = originalUrl.startsWith('/') ? originalUrl : '/' + originalUrl;
  // Strip query string for the suspicion check (patterns target the path).
  const pathOnly = tail.split('?')[0];
  if (isSuspicious(pathOnly)) {
    return `${CORPORATE_SITE_URL}/`;
  }
  return `${CORPORATE_SITE_URL}${tail}`;
}

/**
 * Is the quarantine currently active? Read at request time so tests can
 * flip the env var per-describe.
 */
function isQuarantineEnabled() {
  return process.env.QUARANTINE_NON_AUSTIN === 'true';
}

module.exports = {
  ALLOWLIST,
  SUSPICIOUS_PATTERNS,
  CORPORATE_SITE_URL,
  isAllowed,
  isSuspicious,
  buildCorporateRedirect,
  isQuarantineEnabled,
};
