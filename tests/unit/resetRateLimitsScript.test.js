// Plan 3 task 25 (PR B7). scripts/admin/reset-rate-limits.js used to call
// resetRateLimits() at module scope — so `require`ing it CONNECTED TO THE
// PRODUCTION DATABASE and deleted from the collection nobody writes. It now
// exports { parseArgs, run } with the CLI behind require.main === module, and
// --dry-run writes nothing. The dry-run assertion is behavioural, not a grep:
// this is the `ensure-indexes.js --dry-run` class of defect (C-5) and it is not
// allowed to recur.

const script = require('../../scripts/admin/reset-rate-limits');

const NAMES = ['api', 'auth', 'bag_codes', 'pwreset', 'register', 'sensitive'];

describe('reset-rate-limits is requirable without touching a database', () => {
  it('exports parseArgs and run and nothing else side-effecting', () => {
    expect(typeof script.parseArgs).toBe('function');
    expect(typeof script.run).toBe('function');
  });

  it('the CLI entry point is gated behind require.main === module', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', '..',
      'scripts/admin/reset-rate-limits.js'), 'utf8');
    expect(src).toMatch(/require\.main === module/);
    expect(src).not.toMatch(/'rate_limits'/);
  });
});

describe('parseArgs', () => {
  const parse = (argv) => script.parseArgs(argv, NAMES);

  it('defaults to every bucket, no filters, writes enabled', () => {
    expect(parse([])).toMatchObject({
      type: null, ip: null, expired: false, dryRun: false, yes: false, help: false
    });
  });

  it('reads --type', () => {
    expect(parse(['--type', 'auth']).type).toBe('auth');
  });

  it('reads --ip', () => {
    expect(parse(['--ip', '203.0.113.7']).ip).toBe('203.0.113.7');
  });

  it('reads --expired, --dry-run, --yes and --help', () => {
    const o = parse(['--expired', '--dry-run', '--yes', '--help']);
    expect(o.expired).toBe(true);
    expect(o.dryRun).toBe(true);
    expect(o.yes).toBe(true);
    expect(o.help).toBe(true);
  });

  it('throws Unknown rate limiter on a name that is not a registered bucket', () => {
    expect(() => parse(['--type', 'no-such-limiter']))
      .toThrow(/Unknown rate limiter: no-such-limiter/);
  });

  it('a --type with no value is an error, not a silent all-buckets wipe', () => {
    expect(() => parse(['--type'])).toThrow(/Unknown rate limiter/);
  });
});

describe('run dispatches to the right web-core primitive', () => {
  let deps;
  beforeEach(() => {
    deps = {
      resetBuckets: jest.fn().mockResolvedValue([{ collection: 'ratelimit_auth', deletedCount: 3 }]),
      sweepExpired: jest.fn().mockResolvedValue([{ collection: 'ratelimit_auth', deletedCount: 2 }]),
      countBuckets: jest.fn().mockResolvedValue([{ collection: 'ratelimit_auth', count: 4 }]),
      log: jest.fn()
    };
  });

  const opts = (over) => script.parseArgs([], NAMES) && Object.assign(
    script.parseArgs([], NAMES), { names: NAMES }, over);

  it('the default run calls resetBuckets, not sweepExpired', async () => {
    const res = await script.run(opts({ yes: true }), deps);
    expect(deps.resetBuckets).toHaveBeenCalledTimes(1);
    expect(deps.sweepExpired).not.toHaveBeenCalled();
    expect(res.deletedCount).toBe(3);
  });

  it('--ip becomes an ESCAPED idPattern, not an interpreted regex', async () => {
    await script.run(opts({ yes: true, ip: '203.0.113.7' }), deps);
    const { idPattern } = deps.resetBuckets.mock.calls[0][0];
    expect(idPattern).toBeInstanceOf(RegExp);
    expect(idPattern.source).toBe('203\\.0\\.113\\.7');
  });

  it('--type narrows the names handed to resetBuckets', async () => {
    await script.run(opts({ yes: true, type: 'auth' }), deps);
    expect(deps.resetBuckets.mock.calls[0][0].names).toEqual(['auth']);
  });

  it('--expired calls sweepExpired, not resetBuckets', async () => {
    const res = await script.run(opts({ yes: true, expired: true }), deps);
    expect(deps.sweepExpired).toHaveBeenCalledTimes(1);
    expect(deps.resetBuckets).not.toHaveBeenCalled();
    expect(res.deletedCount).toBe(2);
  });

  it('dry-run writes NOTHING — neither resetBuckets nor sweepExpired', async () => {
    const res = await script.run(opts({ yes: true, dryRun: true }), deps);
    expect(deps.resetBuckets).not.toHaveBeenCalled();
    expect(deps.sweepExpired).not.toHaveBeenCalled();
    expect(deps.countBuckets).toHaveBeenCalledTimes(1);
    expect(res.dryRun).toBe(true);
    expect(res.deletedCount).toBe(0);
  });

  it('dry-run writes nothing even with --expired', async () => {
    await script.run(opts({ yes: true, dryRun: true, expired: true }), deps);
    expect(deps.resetBuckets).not.toHaveBeenCalled();
    expect(deps.sweepExpired).not.toHaveBeenCalled();
  });
});
