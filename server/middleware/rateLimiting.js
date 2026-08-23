/**
 * Rate Limiting Middleware for Laundromat
 * Implements different rate limits for various endpoint types
 *
 * Configuration:
 * - NODE_ENV=test : Rate limiting is disabled
 * - RELAX_RATE_LIMITING=true : Higher limits for development/staging
 * - Production: Strict limits enforced
 */

const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');
const { ipBucketKey } = require('../utils/clientIp');

// Check if rate limiting should be relaxed
const isRelaxed = process.env.RELAX_RATE_LIMITING === 'true';
const isTest = process.env.NODE_ENV === 'test';

// Startup safety: refuse to silently run with relaxed rate limits in
// production. If the process was started with RELAX_RATE_LIMITING=true
// (e.g. leftover from a dev shell) AND NODE_ENV=production, emit a loud
// warning to logs and stderr so it's caught immediately rather than
// quietly leaving the auth/registration/payment surfaces 10× more
// permissive than designed. APP-007 / prod-lockdown-2026-05-20.
if (isRelaxed && process.env.NODE_ENV === 'production') {
  const msg = 'SECURITY: RELAX_RATE_LIMITING=true with NODE_ENV=production. ' +
              'Rate limits are 10x higher than designed. ' +
              'Unset RELAX_RATE_LIMITING and restart immediately.';
  logger.error(msg);
  // eslint-disable-next-line no-console
  process.stderr.write(`\n*** ${msg} ***\n\n`);
}

// Rate-limit store factory.
//
// Uses an in-house MongoDB-backed store (server/middleware/rateLimitMongoStore.js)
// so all PM2 cluster workers share a single counter — without the
// `rate-limit-mongo` package's vulnerable `underscore@1.12.1` chain.
// Closes H-6 from prod-lockdown-2026-05-20.
//
// In test mode (`NODE_ENV=test`), Mongoose may not be connected when this
// module loads. Returning `undefined` falls back to the package's default
// in-memory store, which is fine for tests since `skipInTest` short-
// circuits the limiter entirely.
const MongoRateLimitStore = require('./rateLimitMongoStore');
const createMongoStore = (windowMs, name) => {
  if (isTest) return undefined;
  return new MongoRateLimitStore({ windowMs, name });
};

// Helper to skip rate limiting in test environment
const skipInTest = () => isTest;

// Canonical key generators. Every IP-based limiter MUST bucket by the real
// visitor IP (cf-connecting-ip via ipBucketKey), never Express's req.ip — which,
// behind Cloudflare → nginx (trust proxy = 1), is the CF EDGE IP. Keying on the
// edge collapses many distinct visitors into one shared counter (a throttle a
// few users, or one abuser, can exhaust for everyone behind that edge).
// Exported as `_keyGenerators` for unit tests; the limiters are skipped in
// NODE_ENV=test so the generators are otherwise un-exercised by the suite.
const keyGenerators = {
  // Anonymous surfaces — pure visitor IP (IPv6 collapsed to /64).
  ip: (req) => ipBucketKey(req),
  // Authenticated-or-not: prefer the stable user id, else the visitor IP.
  userOrIp: (req) => (req.user && req.user.id ? `user_${req.user.id}` : ipBucketKey(req)),
  // Email-verification: the email is the abuse unit; fall back to user, then IP.
  emailOrUserOrIp: (req) =>
    (req.body && req.body.email) || (req.user && req.user.id) || ipBucketKey(req),
  // Admin login: IP + username so one IP can't lock out every admin, and one
  // username can't be brute-forced across rotating addresses unbounded.
  adminLogin: (req) => {
    const username = (req.body && (req.body.username || req.body.email)) || '';
    return `admin_login_${ipBucketKey(req)}_${username}`;
  }
};
exports._keyGenerators = keyGenerators;

// Authentication endpoints - strict limits
exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isRelaxed ? 50 : 5, // Relaxed: 50, Production: 5 requests per window
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again in 15 minutes',
    retryAfter: 15 * 60 // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Don't throw ERR_ERL_DOUBLE_COUNT into the request (it surfaced on the
  // Oracle-backed store and was escalating to unhandledRejection → worker
  // crash-loop). The count may be off by one in rare cases; that's acceptable.
  validate: { singleCount: false },
  skipSuccessfulRequests: true,
  skip: skipInTest,
  keyGenerator: keyGenerators.ip,
  store: createMongoStore(15 * 60 * 1000, 'auth')
});

// Password reset - very strict limits
exports.passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isRelaxed ? 10 : 3, // Relaxed: 10, Production: 3 requests per hour
  message: {
    success: false,
    message: 'Too many password reset attempts, please try again in 1 hour',
    retryAfter: 60 * 60 // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Don't throw ERR_ERL_DOUBLE_COUNT into the request (it surfaced on the
  // Oracle-backed store and was escalating to unhandledRejection → worker
  // crash-loop). The count may be off by one in rare cases; that's acceptable.
  validate: { singleCount: false },
  skipSuccessfulRequests: true,
  skip: skipInTest,
  keyGenerator: keyGenerators.ip,
  store: createMongoStore(60 * 60 * 1000, 'pwreset')
});

// Registration - moderate limits
exports.registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isRelaxed ? 50 : 10, // Relaxed: 50, Production: 10 registrations per hour per IP
  message: {
    success: false,
    message: 'Too many registration attempts from this IP, please try again later',
    retryAfter: 60 * 60 // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Don't throw ERR_ERL_DOUBLE_COUNT into the request (it surfaced on the
  // Oracle-backed store and was escalating to unhandledRejection → worker
  // crash-loop). The count may be off by one in rare cases; that's acceptable.
  validate: { singleCount: false },
  skip: skipInTest,
  keyGenerator: keyGenerators.ip,
  store: createMongoStore(60 * 60 * 1000, 'register')
});

// API endpoints - general limits
exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isRelaxed ? 500 : (process.env.RATE_LIMIT_MAX_REQUESTS || 100),
  message: {
    success: false,
    message: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Don't throw ERR_ERL_DOUBLE_COUNT into the request (it surfaced on the
  // Oracle-backed store and was escalating to unhandledRejection → worker
  // crash-loop). The count may be off by one in rare cases; that's acceptable.
  validate: { singleCount: false },
  skip: () => {
    // Skip in test environment only. The previous code also skipped for
    // `req.user.role === 'admin'`, but the legitimate role string is
    // 'administrator' (per server/models/Administrator.js + the token
    // signing in authTokenService.js). The 'admin' branch was unreachable
    // dead code that would have served as a bypass only for a forged token.
    // APP-006 / prod-lockdown-2026-05-20.
    return skipInTest();
  },
  keyGenerator: keyGenerators.ip,
  store: createMongoStore(15 * 60 * 1000, 'api')
});

// Sensitive operations - strict limits
exports.sensitiveOperationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 operations per hour
  message: {
    success: false,
    message: 'Too many sensitive operations, please try again later',
    retryAfter: 60 * 60 // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Don't throw ERR_ERL_DOUBLE_COUNT into the request (it surfaced on the
  // Oracle-backed store and was escalating to unhandledRejection → worker
  // crash-loop). The count may be off by one in rare cases; that's acceptable.
  validate: { singleCount: false },
  skip: skipInTest,
  keyGenerator: keyGenerators.userOrIp,
  store: createMongoStore(60 * 60 * 1000, 'sensitive')
});

// Public contact form — burst guard. Catches double-clicks and basic
// flood attempts: 1 submission per 30 seconds per IP. Stacked under
// contactFormLimiter for hourly volume control.
exports.contactFormBurstLimiter = rateLimit({
  windowMs: 30 * 1000, // 30 seconds
  max: isRelaxed ? 30 : 1,
  message: {
    success: false,
    message: 'Please wait a moment before sending another message.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Don't throw ERR_ERL_DOUBLE_COUNT into the request (it surfaced on the
  // Oracle-backed store and was escalating to unhandledRejection → worker
  // crash-loop). The count may be off by one in rare cases; that's acceptable.
  validate: { singleCount: false },
  skip: skipInTest,
  keyGenerator: keyGenerators.ip,
  store: createMongoStore(30 * 1000, 'contact_burst')
});

// Public contact form — hourly cap. 5 submissions per IP per hour
// is enough for legitimate use (a customer + a follow-up question +
// edge cases) while making spam runs visibly painful. Tightened from
// the shared sensitiveOperationLimiter (10/hr) because contact is
// unauthenticated and the most-abused surface on the site.
exports.contactFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isRelaxed ? 50 : 5,
  message: {
    success: false,
    message: 'You\'ve sent the maximum number of messages for now — please try again later, or call us directly.',
    retryAfter: 60 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Don't throw ERR_ERL_DOUBLE_COUNT into the request (it surfaced on the
  // Oracle-backed store and was escalating to unhandledRejection → worker
  // crash-loop). The count may be off by one in rare cases; that's acceptable.
  validate: { singleCount: false },
  skip: skipInTest,
  keyGenerator: keyGenerators.ip,
  store: createMongoStore(60 * 60 * 1000, 'contact_hourly')
});

// Email verification - prevent abuse
exports.emailVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 verification emails per hour
  message: {
    success: false,
    message: 'Too many email verification requests, please try again later',
    retryAfter: 60 * 60 // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Don't throw ERR_ERL_DOUBLE_COUNT into the request (it surfaced on the
  // Oracle-backed store and was escalating to unhandledRejection → worker
  // crash-loop). The count may be off by one in rare cases; that's acceptable.
  validate: { singleCount: false },
  keyGenerator: keyGenerators.emailOrUserOrIp,
  store: createMongoStore(60 * 60 * 1000, 'email_verify')
});

// File upload - strict limits
exports.fileUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 uploads per hour
  message: {
    success: false,
    message: 'Too many file uploads, please try again later',
    retryAfter: 60 * 60 // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Don't throw ERR_ERL_DOUBLE_COUNT into the request (it surfaced on the
  // Oracle-backed store and was escalating to unhandledRejection → worker
  // crash-loop). The count may be off by one in rare cases; that's acceptable.
  validate: { singleCount: false },
  keyGenerator: keyGenerators.userOrIp,
  store: createMongoStore(60 * 60 * 1000, 'upload')
});

// Admin operations - looser limits for authenticated admins
exports.adminOperationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 operations per 15 minutes
  message: {
    success: false,
    message: 'Rate limit exceeded for admin operations'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Don't throw ERR_ERL_DOUBLE_COUNT into the request (it surfaced on the
  // Oracle-backed store and was escalating to unhandledRejection → worker
  // crash-loop). The count may be off by one in rare cases; that's acceptable.
  validate: { singleCount: false },
  skip: (req) => {
    // Only apply to authenticated administrators. The role string is
    // 'administrator' per the Administrator model + token signer — using
    // 'admin' here would skip for everyone (no user has that role string),
    // making the limiter a no-op. Same twin-of-APP-006 pattern caught in
    // the 2026-05-20 prod-lockdown re-audit as finding N-3.
    return !req.user || req.user.role !== 'administrator';
  },
  keyGenerator: keyGenerators.ip,
  store: createMongoStore(15 * 60 * 1000, 'admin_op')
});

// Administrator login - more lenient limits to prevent lockout
exports.adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isRelaxed ? 100 : 20, // Relaxed: 100, Production: 20 login attempts
  message: {
    success: false,
    message: 'Too many login attempts, please try again in 15 minutes',
    retryAfter: 15 * 60 // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Don't throw ERR_ERL_DOUBLE_COUNT into the request (it surfaced on the
  // Oracle-backed store and was escalating to unhandledRejection → worker
  // crash-loop). The count may be off by one in rare cases; that's acceptable.
  validate: { singleCount: false },
  skipSuccessfulRequests: true,
  skip: skipInTest,
  keyGenerator: keyGenerators.adminLogin,
  store: createMongoStore(15 * 60 * 1000, 'admin_login')
});

// Concierge — public Claude-backed FAQ endpoint (/api/concierge). Strict-ish:
// the endpoint hits a paid LLM API, so cap usage per IP. Production: 20 / 15min,
// relaxed (dev/staging): 200 / 15min. Disabled in test (skipInTest), same as
// the other limiters. Keyed by IP since the concierge is unauthenticated.
exports.conciergeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isRelaxed ? 200 : 20, // Relaxed: 200, Production: 20 questions per window
  message: {
    success: false,
    message: 'Too many questions right now — please call us at (512) 553-1674, or try again shortly.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Don't throw ERR_ERL_DOUBLE_COUNT into the request (it surfaced on the
  // Oracle-backed store and was escalating to unhandledRejection → worker
  // crash-loop). The count may be off by one in rare cases; that's acceptable.
  validate: { singleCount: false },
  skip: skipInTest,
  keyGenerator: keyGenerators.ip,
  store: createMongoStore(15 * 60 * 1000, 'concierge')
});

// Create a custom rate limiter with specific settings
exports.createCustomLimiter = (options) => {
  const defaults = {
    standardHeaders: true,
    legacyHeaders: false,
    // Don't throw ERR_ERL_DOUBLE_COUNT into the request (it surfaced on the
    // Oracle-backed store and was escalating to unhandledRejection → worker
    // crash-loop). The count may be off by one in rare cases; that's acceptable.
    validate: { singleCount: false },
    keyGenerator: keyGenerators.ip,
    store: createMongoStore(options.windowMs || 15 * 60 * 1000, options.name || 'custom'),
    message: {
      success: false,
      message: 'Too many requests, please try again later'
    }
  };

  return rateLimit({ ...defaults, ...options });
};