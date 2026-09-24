// System health service
//
// Admin-only introspection: environment variables (sanitized + optionally
// desanitized for super-admins), and rate-limit collection reset. Both are
// audit-logged. The env-var allowlist is the source of truth for what the
// UI renders — add new vars here, not in the controller.

const mongoose = require('mongoose');
const { logAuditEvent, AuditEvents } = require('../utils/auditLogger');
const logger = require('../utils/logger');
// Held as modules, never destructured: APP_LIMITER_NAMES is a live getter over
// the bucket registry, which grows after this module loads.
const rateLimiting = require('../middleware/rateLimiting');
const wcRateLimiting = require('@crhs/web-core').rateLimiting;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ALLOWED_ENV_VARS = [
  // Application
  'NODE_ENV', 'PORT', 'BASE_URL', 'BACKEND_URL',
  // CORS_EXTRA_ORIGINS became live on this app in Plan 3 task 44 (B11): the
  // shared web-core config reads it alongside CORS_ORIGIN, so the two together
  // ARE the credentialed allowlist. Showing only one of them told an admin
  // debugging a refused origin that they were looking at the whole rule.
  'CORS_ORIGIN', 'CORS_EXTRA_ORIGINS', 'TRUST_PROXY', 'COOKIE_SECURE',
  // Database
  'MONGODB_URI',
  // Security & Authentication
  'JWT_SECRET', 'SESSION_SECRET', 'ENCRYPTION_KEY',
  // Email
  'EMAIL_PROVIDER', 'EMAIL_FROM', 'EMAIL_HOST', 'EMAIL_PORT',
  'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_SECURE',
  // Feature flags
  'SHOW_DOCS', 'ENABLE_DELETE_DATA_FEATURE',
  'CSRF_PHASE', 'RELAX_RATE_LIMITING',
  // Rate limiting — RATE_LIMIT_MAX_REQUESTS is live (the apiLimiter max).
  // RATE_LIMIT_WINDOW_MS and AUTH_RATE_LIMIT_MAX were removed in Plan 3
  // task 25 (X31): no limiter reads either, so the env viewer rendered them
  // to admins as if they were live knobs.
  'RATE_LIMIT_MAX_REQUESTS',
  // Logging
  'LOG_LEVEL', 'LOG_DIR',
  // Business configuration
  'BAG_FEE',
  // Default accounts
  'DEFAULT_ADMIN_EMAIL'
];

class SystemHealthError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
    this.isSystemHealthError = true;
  }
}

function isSuperAdmin(user) {
  return user.permissions?.includes('*')
    || user.isSuperAdmin
    || user.email === process.env.DEFAULT_ADMIN_EMAIL;
}

function isSensitiveVarName(varName) {
  return varName.includes('SECRET')
    || varName.includes('PASSWORD')
    || varName.includes('KEY')
    || varName.includes('TOKEN');
}

async function getEnvironmentVariables({ user, req }) {
  const superAdmin = isSuperAdmin(user);

  const variables = {};
  const sensitiveValues = {};

  for (const varName of ALLOWED_ENV_VARS) {
    const value = process.env[varName] || '';
    if (isSensitiveVarName(varName) && superAdmin && value) {
      sensitiveValues[varName] = value;
      variables[varName] = '••••••••';
    } else {
      variables[varName] = value;
    }
  }

  await logAuditEvent(AuditEvents.ADMIN_VIEW_ENV_VARS, user, {
    action: 'view_environment_variables',
    viewedSensitive: superAdmin && Object.keys(sensitiveValues).length > 0
  }, req);

  return {
    variables,
    sensitiveValues: superAdmin ? sensitiveValues : {},
    isSuperAdmin: superAdmin
  };
}

/**
 * Clear rate-limit counters across every registered bucket.
 *
 * Until Plan 3 task 25 this deleted from a differently-named collection that
 * nothing writes, filtering a `key` field the store has never had. The store
 * writes one collection per limiter (`ratelimit_<name>`) keyed on `_id`, so the
 * endpoint returned `success: true` with `deletedCount: 0` and an admin could
 * not clear a jammed bucket. It now fans out over the live bucket registry.
 *
 * @param {object}  args
 * @param {string} [args.type] Limiter name (or a substring of one) to narrow to.
 * @param {string} [args.ip]   Bucket key substring — regex metacharacters escaped.
 * @param {object}  args.user  Acting administrator (audit).
 * @param {object}  args.req   Express request (audit).
 * @returns {Promise<{deletedCount: number, collections: Array<{collection: string, deletedCount: number}>}>}
 * @throws {SystemHealthError} 400 on an unknown limiter name; 500 with no database.
 */
async function resetRateLimits({ type, ip, user, req }) {
  const db = mongoose.connection.db;
  if (!db) {
    logger.error('Database connection not available');
    throw new SystemHealthError('db_unavailable', 'Database connection not available');
  }

  // Read INSIDE the function: APP_LIMITER_NAMES is a getter over a registry
  // that codeAttemptLockout and the route-local limiters add to after load.
  const all = rateLimiting.APP_LIMITER_NAMES;
  const names = type ? all.filter((n) => n === type || n.includes(type)) : all;
  if (type && names.length === 0) {
    throw new SystemHealthError('unknown_limiter', `Unknown rate limiter: ${type}`, 400);
  }

  const collections = await wcRateLimiting.resetBuckets({
    names, idPattern: ip ? new RegExp(escapeRegExp(ip)) : undefined
  });
  const deletedCount = collections.reduce((sum, c) => sum + c.deletedCount, 0);

  await logAuditEvent(AuditEvents.ADMIN_RESET_RATE_LIMITS, user, {
    type, ip, deletedCount
  }, req);

  return { deletedCount, collections };
}

module.exports = {
  getEnvironmentVariables,
  resetRateLimits,
  SystemHealthError,
  ALLOWED_ENV_VARS
};
