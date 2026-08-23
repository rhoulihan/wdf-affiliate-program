/**
 * CSRF Configuration and Middleware
 * Implements defense-in-depth with JWT + CSRF tokens.
 *
 * SEC M-5 (closed): migrated from the deprecated `csurf` package to
 * `csrf-csrf` (double-submit-cookie pattern, actively maintained).
 * The conditional-enforcement logic, allowlists, and error/audit
 * handling are unchanged — only the token generation/validation
 * primitives were swapped.
 */

const { doubleCsrf } = require('csrf-csrf');
const auditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');

const CSRF_COOKIE_NAME = process.env.NODE_ENV === 'production'
  ? '__Host-x-csrf'   // host-only secure cookie name in prod
  : 'x-csrf';         // dev (no HTTPS, __Host- requires Secure)

const {
  generateCsrfToken,
  doubleCsrfProtection,
  invalidCsrfTokenError
} = doubleCsrf({
  // Server secret for HMAC. Falls back to SESSION_SECRET (then JWT_SECRET)
  // so existing deployments don't need a new env var to function — but a
  // dedicated CSRF_SECRET is recommended for independent rotation.
  getSecret: () => process.env.CSRF_SECRET
                || process.env.SESSION_SECRET
                || process.env.JWT_SECRET
                || '',
  // Stable per-user identifier used to bind the cookie token to the
  // request origin. Express-session ID when available, else IP. The
  // identifier is hashed into the token, never echoed back.
  getSessionIdentifier: (req) => req.sessionID || req.ip || 'no-session',
  cookieName: CSRF_COOKIE_NAME,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  // Accept the token in any of the headers/body fields we historically
  // supported, so existing clients keep working.
  getCsrfTokenFromRequest: (req) =>
    req.body?._csrf ||
    req.query?._csrf ||
    req.headers['csrf-token'] ||
    req.headers['xsrf-token'] ||
    req.headers['x-csrf-token'] ||
    req.headers['x-xsrf-token']
});

// Define endpoint categories for CSRF protection
const CSRF_CONFIG = {
  // Truly public endpoints that should NEVER require CSRF
  PUBLIC_ENDPOINTS: [
    // Public information endpoints (GET only)
    '/api/v1/affiliates/:affiliateId/public',
    '/api/affiliates/:affiliateId/public',

    // Health check endpoints
    '/api/health',
    '/api/v1/health',

    // Public concierge — credential-free, no ambient cookie/session, so it is
    // not a CSRF target (an attacker's forged POST gains nothing). Same-origin
    // from the design-explorer pages; abuse is bounded by conciergeLimiter.
    '/api/concierge',

    // Scan-session engine (PR 4) — public/credential-light: /session is gated
    // by a one-time role code + lockout; resolve/apply/undo are gated by
    // scanAuth (operator JWT or scan-session token). None carries an ambient
    // cookie credential, so CSRF gains an attacker nothing — same rationale as
    // the retired bag-URL flow (the phone's camera opens the page with no
    // session/cookie).
    '/api/v1/scan/session',
    '/api/v1/scan/resolve',
    '/api/v1/scan/apply',
    '/api/v1/scan/undo',

    // Customer self-service edit (Edit my info) — authorized by the same
    // scan-session token (x-scan-session header), no ambient cookie, same
    // CSRF rationale as the scan engine above.
    '/api/v1/customers/me',

    // Partner-program inquiry form — public marketing landing on the
    // per-location domains. Credential-free, no ambient cookie/session, so a
    // forged POST gains an attacker nothing (same rationale as /api/concierge
    // above). Abuse is bounded by contactFormBurstLimiter + contactFormLimiter
    // on the route. Lets the static cached page submit with a plain fetch.
    '/api/v1/partner-inquiry',
    '/api/partner-inquiry',

    // Affiliate application form — same rationale as partner-inquiry above
    // (credential-free public form, rate-limited on the route).
    '/api/v1/affiliate-application',
    '/api/affiliate-application'
  ],

  // Authentication endpoints - will add rate limiting instead of CSRF
  AUTH_ENDPOINTS: [
    '/api/auth/affiliate/login',
    '/api/auth/administrator/login',
    '/api/auth/operator/login',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/refresh-token',
    '/api/v1/auth/affiliate/login',
    '/api/v1/auth/administrator/login',
    '/api/v1/auth/operator/login',
    '/api/v1/auth/forgot-password',
    '/api/v1/auth/reset-password',
    '/api/v1/auth/refresh-token',
    // Password change endpoints (part of auth flow)
    '/api/v1/administrators/change-password',
    '/api/v1/affiliates/change-password',
    '/api/v1/operators/change-password'
  ],

  // Registration endpoints - will add CAPTCHA instead of CSRF
  REGISTRATION_ENDPOINTS: [
    '/api/affiliates/register',
    '/api/v1/affiliates/register',
    '/api/v1/customers/claim/:bagToken/register'
  ],

  // CRITICAL endpoints that MUST have CSRF protection (Phase 1)
  CRITICAL_ENDPOINTS: [
    // Logout (prevents logout CSRF)
    '/api/v1/auth/logout',

    // Order management
    '/api/v1/orders',
    '/api/v1/orders/:orderId',
    '/api/v1/orders/:orderId/status',
    '/api/v1/orders/:orderId/cancel',
    '/api/v1/orders/:orderId/payment-status',

    // Data deletion
    '/api/v1/affiliates/:affiliateId/delete-all-data',

    // Admin operations
    '/api/v1/administrators/affiliates',
    '/api/v1/administrators/operators',
    '/api/v1/administrators/operators/:operatorId',
    '/api/v1/operators/:operatorId/scan-code/reset',
    '/api/v1/administrators/config',

    // Operator critical actions
    '/api/v1/operators/orders/:orderId/claim',
    '/api/v1/operators/orders/:orderId/status',
    '/api/v1/operators/orders/:orderId/quality-check',
    '/api/v1/operators/shift/status',

    // Bag admin mutations (mint/issue/print-run — spec §5)
    '/api/v1/bags/mint',
    '/api/v1/bags/batch/:batchId/issue',
    '/api/v1/bags/print-run'
  ],

  // HIGH priority endpoints (Phase 2)
  HIGH_PRIORITY_ENDPOINTS: [
    // Profile updates
    '/api/v1/affiliates/:affiliateId'
  ],

  // READ-ONLY endpoints that can remain without CSRF
  READ_ONLY_ENDPOINTS: [
    // Dashboard data (GET only)
    '/api/v1/affiliates/:affiliateId/dashboard',
    '/api/v1/operators/dashboard',
    '/api/v1/administrators/dashboard',

    // List/search endpoints (GET only)
    '/api/v1/affiliates/:affiliateId/customers',
    '/api/v1/affiliates/:affiliateId/orders',
    '/api/v1/orders/search',
    '/api/v1/orders/statistics',
    '/api/v1/orders/export'
  ]
};

// Determine if endpoint should have CSRF protection
function shouldEnforceCsrf(req) {
  const path = req.path;
  const method = req.method;

  // Never enforce CSRF on GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return false;
  }

  // Check if path matches any pattern
  const matchesPattern = (patterns) => {
    return patterns.some(pattern => {
      if (pattern.includes(':')) {
        // Convert Express route pattern to regex
        const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, '[^/]+') + '$');
        return regex.test(path);
      }
      return path === pattern;
    });
  };

  // Public endpoints - never enforce
  if (matchesPattern(CSRF_CONFIG.PUBLIC_ENDPOINTS)) {
    return false;
  }

  // For now, still exclude auth and registration endpoints
  // These will be protected with rate limiting and CAPTCHA instead
  if (matchesPattern(CSRF_CONFIG.AUTH_ENDPOINTS) ||
      matchesPattern(CSRF_CONFIG.REGISTRATION_ENDPOINTS)) {
    return false;
  }

  // CRITICAL endpoints - always enforce
  if (matchesPattern(CSRF_CONFIG.CRITICAL_ENDPOINTS)) {
    return true;
  }

  // HIGH priority endpoints - enforce based on rollout phase
  if (matchesPattern(CSRF_CONFIG.HIGH_PRIORITY_ENDPOINTS)) {
    // Can be controlled by environment variable for gradual rollout
    return process.env.CSRF_PHASE >= 2;
  }

  // Read-only endpoints - don't enforce
  if (matchesPattern(CSRF_CONFIG.READ_ONLY_ENDPOINTS)) {
    return false;
  }

  // Default: enforce CSRF for all other state-changing requests
  return true;
}

// Enhanced CSRF middleware with better error handling
const conditionalCsrf = (req, res, next) => {
  // Determine if CSRF should be enforced
  if (!shouldEnforceCsrf(req)) {
    return next();
  }

  // SEC H-1 (closed): the previous "bearer-only" bypass — skipping CSRF
  // whenever an Authorization header was present and the portal.sid
  // cookie was absent — was removed because (a) the bypass keyed on a
  // single cookie name, so any future cookie-based session would silently
  // re-introduce the CSRF hole, and (b) the comment justifying it
  // assumed Bearer tokens are the only auth path, which is no longer
  // strictly true (httpOnly-cookie deployments and password-change /
  // logout flows can be cookie-driven). Defense in depth: every
  // state-changing request that isn't on the public/auth/registration
  // allowlist must present a CSRF token, regardless of how it
  // authenticates.

  // Debug session state
  logger.info('CSRF check for:', req.path, {
    sessionID: req.sessionID,
    hasSession: !!req.session,
    hasAuth: !!req.headers.authorization,
    origin: req.headers.origin,
    referer: req.headers.referer,
    userAgent: req.headers['user-agent']?.substring(0, 50)
  });

  // Apply CSRF protection (csrf-csrf double-submit-cookie validation)
  doubleCsrfProtection(req, res, (err) => {
    if (!err) return next();

    // csrf-csrf throws invalidCsrfTokenError instances rather than
    // EBADCSRFTOKEN strings, so identify by reference + by message.
    const isCsrfError = err === invalidCsrfTokenError
      || err?.code === 'EBADCSRFTOKEN'
      || /csrf/i.test(err?.message || '');

    if (isCsrfError) {
      logger.error('CSRF validation failed:', {
        error: err.message,
        sessionID: req.sessionID,
        receivedToken: req.headers['x-csrf-token'] || 'none',
        path: req.path,
        method: req.method
      });

      auditLogger.logSuspiciousActivity(
        'CSRF_VALIDATION_FAILED',
        {
          userId: req.user?.id || 'anonymous',
          userType: req.user?.role || 'unknown',
          path: req.path,
          method: req.method,
          ip: req.ip,
          userAgent: req.get('user-agent')
        },
        req
      );

      return res.status(403).json({
        success: false,
        error: 'Invalid or missing CSRF token',
        code: 'CSRF_VALIDATION_FAILED',
        message: 'Your request was rejected due to security validation. Please refresh and try again.'
      });
    }

    logger.error('CSRF middleware error:', err);
    return res.status(500).json({
      success: false,
      error: 'Security validation error',
      message: 'An error occurred during security validation.'
    });
  });
};

// CSRF token generation endpoint. csrf-csrf's generateCsrfToken sets the
// double-submit cookie on the response and returns the matching header
// token. Clients send that header back on mutations; the cookie is
// validated by doubleCsrfProtection.
const csrfTokenEndpoint = (req, res, next) => {
  try {
    if (!req.session) {
      return res.status(500).json({
        success: false,
        error: 'Session not initialized'
      });
    }
    const token = generateCsrfToken(req, res, { overwrite: true });
    logger.info('CSRF token issued:', {
      sessionID: req.sessionID,
      tokenPrefix: token.substring(0, 10) + '...'
    });
    res.json({ success: true, csrfToken: token });
  } catch (err) {
    logger.error('CSRF token generation error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to generate CSRF token'
    });
  }
};

// Export configuration and middleware
module.exports = {
  CSRF_CONFIG,
  // Backwards-compat alias: callers that imported `csrfProtection` get
  // the doubleCsrfProtection middleware. Same call signature, same
  // request semantics.
  csrfProtection: doubleCsrfProtection,
  conditionalCsrf,
  csrfTokenEndpoint,
  shouldEnforceCsrf
};