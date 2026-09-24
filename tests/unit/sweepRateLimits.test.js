// scripts/ops/sweep-rate-limits.js (Plan 3 task 45 / PR B13) — the reclamation
// path for three collections that grew without bound:
//
//   * ratelimit_<bucket> — the store's TTL index is opt-in and INERT on the
//     Oracle ADB Mongo API (TTL needs CREATE JOB), so expired counters stayed.
//   * TokenBlacklist — cleanupExpired() existed with ZERO callers repo-wide.
//   * RefreshToken — same shape: a declared TTL index that ADB never runs.
//
// Two things this suite pins that the script must never acquire:
//   1. no code path that drops or empties a collection. Oracle ADB: never
//      drop() (the sessions incident, memory lighthouse_psi_quality_bar). The
//      orphan finding is a REPORT.
//   2. no require-time snapshot of the bucket names. APP_LIMITER_NAMES is a live
//      getter over a registry that grows as stores are CONSTRUCTED, so the
//      script must read it at call time or it silently skips the route-local and
//      lockout buckets.

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const sweep = require('../../scripts/ops/sweep-rate-limits');
const rateLimiting = require('../../server/middleware/rateLimiting');
const MongoRateLimitStore = require('../../server/middleware/rateLimitMongoStore');
const TokenBlacklist = require('../../server/models/TokenBlacklist');
const RefreshToken = require('../../server/models/RefreshToken');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'ops', 'sweep-rate-limits.js');
const src = fs.readFileSync(SCRIPT, 'utf8');
// The dangerous-call assertions below are about CODE, not prose: this script's
// header comment AND its --help text both have to name the by-hand
// `deleteMany({})` an operator may run and say "never drop()", and a matcher that
// cannot tell prose from a call would either fail on its own documentation or
// drive the documentation out. So comments are stripped, and the matchers require
// the leading `.` of a real method call — which the help text does not have.
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const PROBE = 't45_sweep_probe';
const PROBE_COLL = `ratelimit_${PROBE}`;
const ORPHAN_COLL = 'ratelimit_t45_orphan_probe';
const PAST = () => new Date(Date.now() - 60 * 1000);
const FUTURE = () => new Date(Date.now() + 15 * 60 * 1000);
const silent = () => {};

describe('scripts/ops/sweep-rate-limits', () => {
  beforeEach(async () => {
    for (const c of [PROBE_COLL, ORPHAN_COLL]) {
      await mongoose.connection.collection(c).deleteMany({});
    }
    await TokenBlacklist.deleteMany({});
    await RefreshToken.deleteMany({});
  });

  describe('the bucket list is read LIVE, never snapshotted at require time', () => {
    it('a bucket registered after this module loaded reaches sweepExpired', async () => {
      const before = [...rateLimiting.APP_LIMITER_NAMES];
      expect(before).not.toContain(PROBE);

      // Constructing a store is what registers its bucket name — the same way
      // codeAttemptLockout registers bag_codes lazily, long after require time.
      new MongoRateLimitStore({ windowMs: 60000, name: PROBE });
      expect(rateLimiting.APP_LIMITER_NAMES).toContain(PROBE);

      const seen = [];
      await sweep.run({}, {
        sweepExpired: async ({ names }) => { seen.push(...names); return []; },
        pruneTokens: async () => ({ tokenBlacklist: 0, refreshTokens: 0 }),
        reportOrphans: async () => [],
        log: silent
      });
      expect(seen).toContain(PROBE);           // a snapshot taken at require time fails here
      for (const n of before) expect(seen).toContain(n);
    });
  });

  describe('it deletes expired rows and only expired rows', () => {
    it('sweeps expired rate-limit counters and keeps the live ones', async () => {
      new MongoRateLimitStore({ windowMs: 60000, name: PROBE });
      const coll = mongoose.connection.collection(PROBE_COLL);
      await coll.insertOne({ _id: 'expired-key', hits: 5, _expiresAt: PAST() });
      await coll.insertOne({ _id: 'live-key', hits: 2, _expiresAt: FUTURE() });

      const res = await sweep.run({}, { log: silent });

      expect(await coll.countDocuments({ _id: 'expired-key' })).toBe(0);
      expect(await coll.countDocuments({ _id: 'live-key' })).toBe(1);
      expect(res.rateLimitDeleted).toBeGreaterThanOrEqual(1);
    });

    it('prunes expired TokenBlacklist rows — the gap that had zero callers', async () => {
      await TokenBlacklist.create({
        token: 'old-token', userId: 'u1', userType: 'affiliate', expiresAt: PAST()
      });
      await TokenBlacklist.create({
        token: 'fresh-token', userId: 'u2', userType: 'operator', expiresAt: FUTURE()
      });

      const res = await sweep.run({}, { log: silent });

      expect(res.tokenBlacklistDeleted).toBe(1);
      expect(await TokenBlacklist.countDocuments({ token: 'old-token' })).toBe(0);
      expect(await TokenBlacklist.countDocuments({ token: 'fresh-token' })).toBe(1);
    });

    it('prunes expired RefreshToken rows and keeps unexpired ones', async () => {
      const userId = new mongoose.Types.ObjectId();
      await RefreshToken.create({
        token: 'rt-old', userId, userType: 'customer', expiryDate: PAST()
      });
      await RefreshToken.create({
        token: 'rt-live', userId, userType: 'customer', expiryDate: FUTURE()
      });

      const res = await sweep.run({}, { log: silent });

      expect(res.refreshTokenDeleted).toBe(1);
      expect(await RefreshToken.countDocuments({ token: 'rt-old' })).toBe(0);
      expect(await RefreshToken.countDocuments({ token: 'rt-live' })).toBe(1);
    });
  });

  describe('the orphan finding is a REPORT — it deletes nothing', () => {
    it('names a ratelimit_ collection that no registered bucket claims', async () => {
      await mongoose.connection.collection(ORPHAN_COLL).insertOne({ _id: 'k', hits: 1 });

      const res = await sweep.run({}, { log: silent });

      expect(res.orphans.map((o) => o.collection)).toContain(ORPHAN_COLL);
      // still there, with its row: reporting is not reclaiming
      expect(await mongoose.connection.collection(ORPHAN_COLL).countDocuments({})).toBe(1);
      const names = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
      expect(names).toContain(ORPHAN_COLL);
    });

    it('does not report a collection a registered bucket owns', async () => {
      new MongoRateLimitStore({ windowMs: 60000, name: PROBE });
      await mongoose.connection.collection(PROBE_COLL).insertOne({ _id: 'k', hits: 1, _expiresAt: FUTURE() });

      const res = await sweep.run({}, { log: silent });

      expect(res.orphans.map((o) => o.collection)).not.toContain(PROBE_COLL);
    });

    it('--report writes NOTHING: no sweep, no prune, rows intact', async () => {
      new MongoRateLimitStore({ windowMs: 60000, name: PROBE });
      await mongoose.connection.collection(PROBE_COLL)
        .insertOne({ _id: 'expired-key', hits: 5, _expiresAt: PAST() });
      await TokenBlacklist.create({
        token: 'old-token', userId: 'u1', userType: 'affiliate', expiresAt: PAST()
      });
      const reached = [];

      const res = await sweep.run(sweep.parseArgs(['--report']), {
        sweepExpired: async () => { reached.push('sweepExpired'); return []; },
        pruneTokens: async () => { reached.push('pruneTokens'); return {}; },
        log: silent
      });

      expect(reached).toEqual([]);                                     // not a grep-only flag
      expect(res.reportOnly).toBe(true);
      expect(await mongoose.connection.collection(PROBE_COLL)
        .countDocuments({ _id: 'expired-key' })).toBe(1);
      expect(await TokenBlacklist.countDocuments({ token: 'old-token' })).toBe(1);
    });
  });

  describe('it cannot drop or empty a collection — Oracle ADB rule', () => {
    it('has no drop() or dropCollection call anywhere in its code', () => {
      expect(code).not.toMatch(/\.drop\(/);
      expect(code).not.toMatch(/dropCollection/);
    });

    it('has no unfiltered deleteMany — every delete is bounded by an expiry', () => {
      expect(code).not.toMatch(/\.deleteMany\(\s*\{\s*\}\s*\)/);
      expect(code).not.toMatch(/\.deleteMany\(\s*\)/);
      // and the one deleteMany call it does have is filtered on an expiry field
      for (const m of code.match(/\.deleteMany\([^)]*\)/g) || []) {
        expect(m).toMatch(/expir/i);
      }
    });

    it('offers no orphan-deleting flag', () => {
      expect(src).not.toMatch(/drop-orphans|deleteOrphans|--purge/);
    });
  });

  describe('CLI shape', () => {
    it('honours --report and reads process.argv', () => {
      expect(src).toContain('--report');
      expect(src).toMatch(/process\.argv/);
      expect(sweep.parseArgs(['--report']).report).toBe(true);
      expect(sweep.parseArgs([]).report).toBe(false);
    });

    it('connects only inside main(), behind require.main === module', () => {
      expect(src).toMatch(/require\.main === module/);
      // `mongoose.connection` is a PREFIX of `mongoose.connect`, so match the call
      const idx = src.search(/mongoose\.connect\(/);
      expect(idx).toBeGreaterThan(-1);
      expect(src.slice(0, idx)).toMatch(/async function main/);
      expect(mongoose.connection.readyState).toBe(1);   // the suite's own connection, not the script's
    });
  });

  describe('the growth gap is closed, provably', () => {
    it('TokenBlacklist.cleanupExpired now has exactly one caller outside its model', () => {
      const { execSync } = require('child_process');
      const REPO = path.join(__dirname, '..', '..');
      const callers = execSync(
        // --untracked so this passes identically before and after the file is staged
        'git grep -l --untracked cleanupExpired -- server server.js scripts '
        + '| grep -v server/models/TokenBlacklist.js || true',
        { cwd: REPO }).toString().trim().split('\n').filter(Boolean);
      expect(callers).toEqual(['scripts/ops/sweep-rate-limits.js']);
    });

    it('an hourly cron ships with it, pointing at this script', () => {
      const cron = fs.readFileSync(
        path.join(__dirname, '..', '..', 'deploy', 'cron', 'wavemax-sweep-rate-limits'), 'utf8');
      expect(cron).toContain('scripts/ops/sweep-rate-limits.js');
      expect(cron).toMatch(/^\S+ \* \* \* \* \w+ /m);           // hourly, at a fixed minute
      expect(cron).not.toMatch(/--report/);                     // the cron does the real work
    });
  });
});
