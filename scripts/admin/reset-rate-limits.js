#!/usr/bin/env node

/**
 * Reset / sweep rate-limit counters (Plan 3 task 25, PR B7).
 *
 * The previous version deleted from a differently-named collection that nothing
 * writes, filtering a `key` field the store has never had. The store writes one
 * collection per limiter (`<prefix><name>`, default `ratelimit_<name>`) keyed on
 * `_id`, so this script reported "Deleted 0 rate limit records" and cleared
 * nothing. It also called its main function at MODULE SCOPE, so merely
 * `require`ing it connected to the production database.
 *
 * Now: `{ parseArgs, run }` are exported and the CLI is gated behind
 * `require.main === module`. `run()` never opens a connection itself — main()
 * owns that — and `--dry-run` counts without writing.
 *
 * Usage:
 *   node scripts/admin/reset-rate-limits.js                        # clear every bucket
 *   node scripts/admin/reset-rate-limits.js --type auth            # one limiter
 *   node scripts/admin/reset-rate-limits.js --ip 203.0.113.7       # one visitor key
 *   node scripts/admin/reset-rate-limits.js --expired              # reclaim expired rows only
 *   node scripts/admin/reset-rate-limits.js --dry-run              # count, write nothing
 *   node scripts/admin/reset-rate-limits.js --type auth --yes      # skip the 5s pause
 */

const rateLimiting = require('../../server/middleware/rateLimiting');
const wcRateLimiting = require('@crhs/web-core').rateLimiting;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const flag = (argv, name) => argv.includes(name);
const value = (argv, name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);

/**
 * @param {string[]} [argv]  Raw args (process.argv.slice(2) by default).
 * @param {string[]} [names] Registered bucket names to validate --type against.
 * @returns {{type: ?string, ip: ?string, names: string[], expired: boolean,
 *            dryRun: boolean, yes: boolean, help: boolean}}
 * @throws {Error} `Unknown rate limiter: <x>` when --type names no bucket, so a
 *   typo can never silently widen to "every bucket".
 */
function parseArgs(argv = process.argv.slice(2), names = rateLimiting.APP_LIMITER_NAMES) {
  const all = [...names];
  const type = value(argv, '--type');
  const opts = {
    type: type || null,
    ip: value(argv, '--ip') || null,
    names: all,
    expired: flag(argv, '--expired'),
    dryRun: flag(argv, '--dry-run'),
    yes: flag(argv, '--yes') || flag(argv, '-y'),
    help: flag(argv, '--help') || flag(argv, '-h')
  };
  if (flag(argv, '--type') && !all.includes(type)) {
    throw new Error(`Unknown rate limiter: ${type}\nKnown buckets: ${all.join(', ')}`);
  }
  return opts;
}

/** Default dry-run counter: reads, never writes. */
async function countBuckets({ names, idPattern, prefix }) {
  const mongoose = require('mongoose');
  const p = prefix || wcRateLimiting.collectionPrefix();
  const filter = idPattern ? { _id: idPattern } : {};
  const out = [];
  for (const name of names) {
    const collection = `${p}${name}`;
    out.push({
      collection,
      count: await mongoose.connection.collection(collection).countDocuments(filter)
    });
  }
  return out;
}

/**
 * @param {object} opts    A parseArgs result (optionally with `names` narrowed).
 * @param {object} [deps]  Injection seam: { resetBuckets, sweepExpired, countBuckets, log, wait }.
 * @returns {Promise<{deletedCount: number, collections: Array, dryRun: boolean}>}
 */
async function run(opts, deps = {}) {
  const resetBuckets = deps.resetBuckets || wcRateLimiting.resetBuckets;
  const sweepExpired = deps.sweepExpired || wcRateLimiting.sweepExpired;
  const count = deps.countBuckets || countBuckets;
  const log = deps.log || ((...a) => process.stdout.write(`${a.join(' ')}\n`));
  const wait = deps.wait || ((ms) => new Promise((r) => setTimeout(r, ms)));

  const all = opts.names || rateLimiting.APP_LIMITER_NAMES;
  const names = opts.type ? all.filter((n) => n === opts.type || n.includes(opts.type)) : [...all];
  const idPattern = opts.ip ? new RegExp(escapeRegExp(opts.ip)) : undefined;

  log(`Buckets: ${names.join(', ')}`);
  if (opts.ip) log(`Key filter: /${idPattern.source}/`);

  // --dry-run writes NOTHING. Not a grep-only flag: the unit suite asserts that
  // neither resetBuckets nor sweepExpired is reached (C-5).
  if (opts.dryRun) {
    const collections = await count({ names, idPattern });
    for (const c of collections) log(`  ${c.collection}: ${c.count} matching`);
    log(`DRY RUN — nothing written (${collections.reduce((s, c) => s + c.count, 0)} would match)`);
    return { deletedCount: 0, collections, dryRun: true };
  }

  if (!opts.yes) {
    log('Press Ctrl+C to cancel, or wait 5 seconds to continue...');
    await wait(5000);
  }

  const collections = opts.expired
    ? await sweepExpired({ names })
    : await resetBuckets({ names, idPattern });
  const deletedCount = collections.reduce((s, c) => s + c.deletedCount, 0);
  for (const c of collections) log(`  ${c.collection}: ${c.deletedCount} deleted`);
  log(`${opts.expired ? 'Swept' : 'Reset'} ${deletedCount} rate limit entries`);
  return { deletedCount, collections, dryRun: false };
}

const HELP = `
Rate Limit Reset Script

Usage:
  node scripts/admin/reset-rate-limits.js [options]

Options:
  --type <name>   One bucket (or a substring of one). See the list below.
  --ip <address>  Only keys containing this address (metacharacters escaped).
  --expired       Sweep expired counters only — the reclamation path, since the
                  TTL index is inert on Oracle ADB.
  --dry-run       Count what would be affected and write nothing.
  --yes, -y       Skip the 5-second confirmation pause.
  --help, -h      Show this message.

Examples:
  node scripts/admin/reset-rate-limits.js
  node scripts/admin/reset-rate-limits.js --type auth
  node scripts/admin/reset-rate-limits.js --ip 203.0.113.7 --dry-run
  node scripts/admin/reset-rate-limits.js --expired --yes
`;

/* istanbul ignore next — CLI wiring, exercised by hand not by the suite. */
async function main() {
  require('dotenv').config();
  const mongoose = require('mongoose');

  // The bucket registry is populated as stores are CONSTRUCTED, so every module
  // that builds one has to load before APP_LIMITER_NAMES is read — otherwise
  // `--type bag_codes` throws "Unknown rate limiter" and a full reset silently
  // skips the route-local and lockout buckets.
  require('../../server/routes/authRoutes');
  require('../../server/routes/bagRoutes');
  require('../../server/routes/customerRoutes');
  require('../../server/routes/scanRoutes');
  require('../../server/services/codeAttemptLockout').storeCollectionName();

  let opts;
  try {
    opts = parseArgs();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(2);
  }
  if (opts.help) {
    process.stdout.write(`${HELP}\nKnown buckets: ${opts.names.join(', ')}\n`);
    process.exit(0);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      tls: true,
      tlsAllowInvalidCertificates: process.env.NODE_ENV !== 'production'
    });
    await run(opts);
  } catch (err) {
    process.stderr.write(`Error resetting rate limits: ${err.message}\n`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => { /* already closed */ });
  }
}

module.exports = { parseArgs, run, countBuckets, HELP };

if (require.main === module) {
  main();
}
