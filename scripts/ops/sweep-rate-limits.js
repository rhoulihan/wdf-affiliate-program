#!/usr/bin/env node

/**
 * Hourly reclamation sweep for three collections that grew without bound
 * (Plan 3 task 45 / PR B13).
 *
 * The Oracle ADB Mongo API runs no TTL jobs (TTL needs CREATE JOB), and
 * production runs mongoose with autoIndex: false, so every "expireAfterSeconds"
 * index in this app is declared and inert:
 *
 *   - ratelimit_<bucket>  one collection per limiter, rows keyed on `_id` with
 *                         an `_expiresAt`. web-core's sweepExpired deletes the
 *                         expired ones, bucket by bucket.
 *   - TokenBlacklist      cleanupExpired() existed with ZERO callers repo-wide —
 *                         logout wrote rows that nothing ever removed.
 *   - RefreshToken        same shape: an expired refresh token is unusable and
 *                         only takes space.
 *
 * It also REPORTS `ratelimit_*` collections that no registered bucket claims
 * (e.g. ratelimit_contact_burst, left behind when the contact routes moved to
 * the corporate app). It does not delete them and has no flag that could:
 * never drop() a collection on Oracle ADB — that is the sessions incident
 * (memory lighthouse_psi_quality_bar). The by-hand reclamation an operator may
 * run empties the collection with deleteMany({}) and never drops it.
 * (Phrased without a dotted method call on purpose: the guard proving this file
 * contains no drop call greps its text, so a comment quoting the call verbatim
 * would trip it — see tests/unit/sweepRateLimits.test.js.)
 *
 * Every delete here is bounded by an expiry predicate. There is no code path
 * that empties or drops a collection, and tests/unit/sweepRateLimits.test.js
 * asserts that on this file's source.
 *
 * Usage:
 *   node scripts/ops/sweep-rate-limits.js            # sweep + prune + report
 *   node scripts/ops/sweep-rate-limits.js --report   # report only, write nothing
 *   node scripts/ops/sweep-rate-limits.js --help
 *
 * Installed as an hourly cron (deploy/cron/crhs-portal-sweep-rate-limits).
 */

const rateLimiting = require('../../server/middleware/rateLimiting');
const wcRateLimiting = require('@crhs/web-core').rateLimiting;

const flag = (argv, name) => argv.includes(name);

/**
 * @param {string[]} [argv] raw args (process.argv.slice(2) by default)
 * @returns {{report: boolean, help: boolean}}
 */
function parseArgs(argv = process.argv.slice(2)) {
  return {
    report: flag(argv, '--report'),
    help: flag(argv, '--help') || flag(argv, '-h')
  };
}

/**
 * Delete expired rows from the two token collections whose TTL indexes never
 * run on ADB. Both filters are bounded by an expiry date — an unexpired token
 * is never touched.
 *
 * @returns {Promise<{tokenBlacklist: number, refreshTokens: number}>}
 */
async function pruneTokens() {
  const TokenBlacklist = require('../../server/models/TokenBlacklist');
  const RefreshToken = require('../../server/models/RefreshToken');
  const now = new Date();
  const tokenBlacklist = await TokenBlacklist.cleanupExpired();
  const refreshTokens = (await RefreshToken.deleteMany({ expiryDate: { $lt: now } })).deletedCount || 0;
  return { tokenBlacklist: tokenBlacklist || 0, refreshTokens };
}

/**
 * READ-ONLY: list `<prefix>*` collections that no registered bucket claims, with
 * their document counts. Nothing is deleted here, by design.
 *
 * @param {{names: string[]}} opts registered bucket names
 * @returns {Promise<Array<{collection: string, documents: number}>>}
 */
async function reportOrphans({ names }) {
  const mongoose = require('mongoose');
  const prefix = wcRateLimiting.collectionPrefix();
  const owned = new Set(names.map((n) => `${prefix}${n}`));
  const all = await mongoose.connection.db.listCollections().toArray();
  const orphans = [];
  for (const c of all) {
    if (!c.name.startsWith(prefix) || owned.has(c.name)) continue;
    orphans.push({
      collection: c.name,
      documents: await mongoose.connection.collection(c.name).countDocuments({})
    });
  }
  return orphans;
}

/**
 * Sweep, prune and report on the connection the caller already opened.
 *
 * @param {{report?: boolean}} [opts] a parseArgs result.
 * @param {object} [deps] injection seam: { sweepExpired, pruneTokens, reportOrphans, log }.
 * @returns {Promise<{reportOnly: boolean, rateLimitDeleted: number,
 *   tokenBlacklistDeleted: number, refreshTokenDeleted: number,
 *   collections: Array, orphans: Array}>}
 */
async function run(opts = {}, deps = {}) {
  const sweepExpired = deps.sweepExpired || wcRateLimiting.sweepExpired;
  const prune = deps.pruneTokens || pruneTokens;
  const orphanReport = deps.reportOrphans || reportOrphans;
  const log = deps.log || ((...a) => process.stdout.write(`${a.join(' ')}\n`));

  // Read INSIDE the call: APP_LIMITER_NAMES is a getter over a registry that
  // grows as stores are CONSTRUCTED (route-local limiters at their require time,
  // codeAttemptLockout's bag_codes on first use). A require-time snapshot would
  // silently skip those buckets — and then report their collections as orphans.
  const names = [...rateLimiting.APP_LIMITER_NAMES];
  log(`Buckets: ${names.join(', ') || '(none registered)'}`);

  const orphans = await orphanReport({ names });
  for (const o of orphans) {
    log(`  ORPHAN ${o.collection}: ${o.documents} documents — REPORTED, not deleted`);
  }
  if (!orphans.length) log('  no orphan rate-limit collections');

  if (opts.report) {
    log('REPORT ONLY — nothing written');
    return {
      reportOnly: true,
      rateLimitDeleted: 0,
      tokenBlacklistDeleted: 0,
      refreshTokenDeleted: 0,
      collections: [],
      orphans
    };
  }

  const collections = await sweepExpired({ names });
  const rateLimitDeleted = collections.reduce((s, c) => s + c.deletedCount, 0);
  for (const c of collections) {
    if (c.deletedCount) log(`  ${c.collection}: ${c.deletedCount} expired rows deleted`);
  }

  const { tokenBlacklist, refreshTokens } = await prune();
  log(`Swept ${rateLimitDeleted} expired rate-limit rows; `
    + `pruned ${tokenBlacklist} blacklisted tokens and ${refreshTokens} refresh tokens`);

  return {
    reportOnly: false,
    rateLimitDeleted,
    tokenBlacklistDeleted: tokenBlacklist,
    refreshTokenDeleted: refreshTokens,
    collections,
    orphans
  };
}

const HELP = `
Rate-limit / token sweep

Usage:
  node scripts/ops/sweep-rate-limits.js [--report]

Options:
  --report     List orphan rate-limit collections and write NOTHING.
  --help, -h   Show this message.

Deletes only EXPIRED rows (ratelimit_* counters, TokenBlacklist, RefreshToken).
It never drops or empties a collection — orphan collections are reported so an
operator can clear them by hand with deleteMany({}), never drop() (Oracle ADB).
`;

/* istanbul ignore next — CLI wiring, exercised by hand and by the cron. */
async function main() {
  require('dotenv').config();
  const mongoose = require('mongoose');

  const opts = parseArgs();
  if (opts.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  // The bucket registry fills as stores are CONSTRUCTED, so every module that
  // builds one must load before APP_LIMITER_NAMES is read — otherwise the sweep
  // skips the route-local and lockout buckets and reports them as orphans.
  require('../../server/routes/authRoutes');
  require('../../server/routes/bagRoutes');
  require('../../server/routes/customerRoutes');
  require('../../server/routes/scanRoutes');
  require('../../server/services/codeAttemptLockout').storeCollectionName();

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      tls: process.env.MONGODB_TLS !== 'false',
      tlsAllowInvalidCertificates: process.env.NODE_ENV !== 'production'
    });
    await run(opts);
  } catch (err) {
    process.stderr.write(`Error sweeping rate limits: ${err.message}\n`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => { /* already closed */ });
  }
}

module.exports = { parseArgs, run, pruneTokens, reportOrphans, HELP };

if (require.main === module) {
  main();
}
