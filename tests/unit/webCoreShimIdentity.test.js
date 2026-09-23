// PR B5 (Plan 3 Task 39, spec §7.3): four modules become 1-statement re-exports
// of @crhs/web-core. This is the seam -- it fails while a local implementation
// still shadows core's, and it fails again if a STALE core is installed.
const fs = require('fs');
const path = require('path');
const wc = require('@crhs/web-core');
const REPO = path.join(__dirname, '..', '..');
const SHIMS = [
  ['../../server/middleware/sanitization', 'sanitization', 'server/middleware/sanitization.js'],
  ['../../server/middleware/errorHandler', 'errorHandler', 'server/middleware/errorHandler.js'],
  ['../../server/utils/mongoCursorRetry', 'mongoCursorRetry', 'server/utils/mongoCursorRetry.js'],
  ['../../server/utils/mongoOracleDiagnostics', 'mongoOracleDiagnostics', 'server/utils/mongoOracleDiagnostics.js']
];

describe('B5 shims re-export @crhs/web-core, not a local copy', () => {
  it.each(SHIMS)('%s is core.%s by identity', (appPath, coreKey) => {
    expect(require(appPath)).toBe(wc[coreKey]);
  });

  it.each(SHIMS)('%s is a re-export, not an implementation', (appPath, coreKey, file) => {
    const src = fs.readFileSync(path.join(REPO, file), 'utf8');
    expect(src).toMatch(/require\('@crhs\/web-core'\)/);
    const statements = src.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
    expect(statements).toHaveLength(1);
  });

  it('the four mount points in server.js still resolve through the shim paths', () => {
    const src = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
    for (const [, , file] of SHIMS) {
      const mod = file.replace(/^server\//, './server/').replace(/\.js$/, '');
      expect(src).toContain(mod);
    }
  });
});

// The four modules were near-copies, not copies. Equivalence was proved with a
// 31-case app-vs-core probe before the bodies were replaced, and ONE case
// diverged: web-core's sanitizeInput called the own-property test through the
// object under inspection (`input.hasOwnProperty(key)`), so a request body
// carrying a key named `hasOwnProperty` -- or any null-prototype object -- threw
// `TypeError: input.hasOwnProperty is not a function` where the portal's own copy
// returned a sanitized body. Fixed in web-core v0.3.1 (crhs-web-core e132e99).
//
// These cases are the DEPLOY GUARD for that fix. npm does NOT re-copy a `file:`
// dependency on a version bump alone (memory: deploy_b_bidirectional_bootbreaker),
// and package-lock.json still records 0.3.0 because the dep spec did not change --
// so a box can silently keep web-core 0.3.0 and, from this commit onward, that
// stale copy IS the portal's request sanitiser. These tests fail loudly in that
// state instead of waiting for a 500 in production.
describe('B5: the installed @crhs/web-core carries the prototype-safety fix', () => {
  const { sanitizeRequest, sanitizeInput } = require('../../server/middleware/sanitization');

  it('is web-core 0.3.1 or newer', () => {
    const [maj, min, pat] = require('@crhs/web-core/package.json').version.split('.').map(Number);
    expect(maj > 0 || min > 3 || (min === 3 && pat >= 1)).toBe(true);
  });

  it('sanitizes a body carrying a key named "hasOwnProperty" instead of throwing', () => {
    const req = { body: { hasOwnProperty: 'x', keep: 'y' }, query: {}, params: {}, headers: {} };
    const next = jest.fn();
    expect(() => sanitizeRequest(req, {}, next)).not.toThrow();
    expect(req.body).toEqual({ hasOwnProperty: 'x', keep: 'y' });
    expect(next).toHaveBeenCalled();
  });

  it('sanitizes a null-prototype object instead of throwing', () => {
    const body = Object.create(null);
    body.a = '<b>1</b>';
    expect(() => sanitizeInput(body)).not.toThrow();
    expect(sanitizeInput(body)).toEqual({ a: '1' });
  });

  it('still excludes inherited enumerable properties', () => {
    const child = Object.create({ inherited: 'nope' });
    child.own = 'yes';
    expect(sanitizeInput(child)).toEqual({ own: 'yes' });
  });
});

// errorHandler is the one shim whose body pulled a second repo file in with it
// (server/utils/logger.js). Core's copy requires its OWN ../utils/logger, so the
// shim only stays log-destination-neutral because server/utils/logger.js is
// itself already a web-core shim -- i.e. both paths reach the same logger
// instance. Asserted, not assumed: if a later task un-shims the logger, this
// fails rather than silently splitting the portal's error log in two.
describe('B5: the errorHandler shim does not move where errors are logged', () => {
  it('the repo logger and the logger core logs through are the same instance', () => {
    expect(require('../../server/utils/logger')).toBe(wc.logger);
  });
});

// PR B6 (Plan 3 Task 40): auditLogger joins the shim set. WHERE its events land is
// pinned by tests/integration/auditLogDestination.test.js in both directions; this is
// the identity half, plus the deploy guard for the release the destination depends on.
describe('B6: auditLogger re-exports @crhs/web-core', () => {
  it('server/utils/auditLogger is core.auditLogger by identity', () => {
    expect(require('../../server/utils/auditLogger')).toBe(wc.auditLogger);
  });

  it('is a re-export, not an implementation', () => {
    const src = fs.readFileSync(path.join(REPO, 'server/utils/auditLogger.js'), 'utf8');
    expect(src).toMatch(/require\('@crhs\/web-core'\)/);
    const statements = src.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
    expect(statements).toHaveLength(1);
  });

  // web-core <= 0.3.1 resolved its LOG_DIR-unset fallback to <package>/logs, which
  // installed is node_modules/@crhs/web-core/logs -- wiped by every npm install and
  // deleted outright by the boot-breaker remedy (`rm -rf node_modules/@crhs/web-core`).
  // From this commit the portal's audit trail rides that resolution, so a box left on
  // a stale copy must fail here rather than lose security evidence quietly. npm does
  // NOT re-copy a `file:` dependency on a version bump alone.
  it('requires web-core 0.3.2 or newer, the release that moved that fallback out of node_modules', () => {
    const [maj, min, pat] = require('@crhs/web-core/package.json').version.split('.').map(Number);
    expect(maj > 0 || min > 3 || (min === 3 && pat >= 2)).toBe(true);
  });

  it('resolves its log directory outside the installed package when LOG_DIR is unset', () => {
    const saved = process.env.LOG_DIR;
    delete process.env.LOG_DIR;
    try {
      let mod;
      jest.isolateModules(() => { mod = require('../../server/utils/auditLogger'); });
      const dirs = mod.auditLogger.transports.filter((t) => t.dirname).map((t) => t.dirname);
      expect(dirs.length).toBeGreaterThan(0);
      for (const d of dirs) expect(d.split(path.sep)).not.toContain('node_modules');
    } finally {
      if (saved === undefined) delete process.env.LOG_DIR;
      else process.env.LOG_DIR = saved;
    }
  });
});
