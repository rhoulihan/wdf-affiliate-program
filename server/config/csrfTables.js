/**
 * CSRF route policy for the affiliate portal.
 *
 * Moved out of @crhs/web-core in PR B4c (spec §7.2.8 / D20): these paths are
 * this application's routes, so a new route must not require a shared-library
 * release. web-core now supplies only the double-submit-cookie primitive, and
 * server/config/csrf-config.js passes these tables to createCsrf({ tables }).
 *
 * Match semantics (implemented in web-core): a `:param` segment matches exactly
 * one path segment; everything else is an exact string match.
 */
module.exports = {
  // Truly public endpoints that should NEVER require CSRF
  PUBLIC_ENDPOINTS: [
    // Public information endpoints (GET only)
    '/api/v1/affiliates/:affiliateId/public',
    '/api/affiliates/:affiliateId/public',

    // Health check endpoints
    '/api/health',
    '/api/v1/health',

    // ---- PLAN 3: the next five rows retire WITH their routes, not before ----
    // server.js:680 (/api/concierge), :736 (partnerInquiryRoutes), :737
    // (affiliateApplicationRoutes) are still mounted, and the public pages POST
    // with a plain fetch (no token). Pruning these rows while the routes live
    // returns 403 on two live marketing forms and reds
    // tests/integration/partnerInquiry.test.js + affiliateApplication.test.js.
    // Delete them in the Plan 3 PR that deletes the routes. Pinned by
    // tests/unit/csrfTables.test.js.

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

  // Authentication endpoints - rate limited instead of CSRF
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

  // Registration endpoints - CAPTCHA instead of CSRF
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

  // HIGH priority endpoints (Phase 2 — gated by CSRF_PHASE >= 2)
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
