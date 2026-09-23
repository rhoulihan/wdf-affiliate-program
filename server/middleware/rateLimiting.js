/**
 * Rate-limit POLICY module for the affiliate portal (Plan 3 task 25 / PR B7).
 *
 * The limiter MECHANISM — the Mongo-backed store, the canonical key
 * generators, the RELAX_RATE_LIMITING production guard, createCustomLimiter,
 * the bucket-name registry and the sweep/reset primitives — lives in
 * @crhs/web-core. This module is the app's POLICY: which limiters this app
 * actually mounts, and nothing else. The portal's nine live limiters were
 * measured parameter-identical to core's before the bind, so they are BOUND
 * here (same objects), never re-derived — a parameter change lands in one
 * place instead of drifting between two copies.
 *
 * Configuration (unchanged, enforced in web-core):
 * - NODE_ENV=test : Rate limiting is disabled
 * - RELAX_RATE_LIMITING=true : Higher limits for development/staging
 *   (and a loud SECURITY: warning if it is set with NODE_ENV=production —
 *   APP-007 / prod-lockdown-2026-05-20)
 * - Production: Strict limits enforced
 *
 * NOT re-exported, deliberately:
 * - emailVerificationLimiter / fileUploadLimiter / adminOperationLimiter —
 *   zero consumers in this app; core deleted its copies in v0.2.0.
 * - contactFormBurstLimiter / contactFormLimiter — the public contact/intake
 *   routes moved to the corporate app (Plan 3 task 18), so this app has zero
 *   importers. Core still exports them for the corporate app; the
 *   copy-before-delete obligation (Global Constraint 13) is therefore
 *   discharged by NOT deleting core's copies, not by duplicating them here.
 *   Their `ratelimit_contact_burst` / `ratelimit_contact_hourly` collections
 *   are orphans on this database — listed, never dropped (Oracle ADB rule).
 * - conciergeLimiter — /api/concierge and the design explorer were deleted in
 *   Plan 3 task 17.
 */

const wc = require('@crhs/web-core');

const core = wc.rateLimiting;

// The live limiters, bound to core's objects (identity, not a copy).
exports.authLimiter = core.authLimiter;
exports.passwordResetLimiter = core.passwordResetLimiter;
exports.registrationLimiter = core.registrationLimiter;
exports.apiLimiter = core.apiLimiter;
exports.sensitiveOperationLimiter = core.sensitiveOperationLimiter;
exports.adminLoginLimiter = core.adminLoginLimiter;

// Route-local limiters (bag-resolve, claim-resolve, email-verify, scan_actions)
// are built from this factory, which registers their bucket names as it goes.
exports.createCustomLimiter = core.createCustomLimiter;

// Canonical key generators — exported for tests and for any app-local limiter
// that needs to pick a bucketing strategy explicitly.
exports._keyGenerators = core._keyGenerators;

/**
 * Every rate-limit bucket name registered in this process.
 *
 * A GETTER over a getter, never a snapshot. Bucket names are registered when a
 * store is CONSTRUCTED, so the set grows after this module loads — the route
 * modules build their createCustomLimiter buckets at their own require time,
 * and server/services/codeAttemptLockout.js constructs `bag_codes` lazily on
 * first use. Destructuring this at require time freezes the value too early:
 * the admin reset would silently skip the lockout counters and
 * `--type bag_codes` would always throw "Unknown rate limiter". Consumers MUST
 * hold the module and read `rateLimiting.APP_LIMITER_NAMES` inside the call.
 */
Object.defineProperty(module.exports, 'APP_LIMITER_NAMES', {
  enumerable: true,
  get: () => core.LIMITER_NAMES
});
