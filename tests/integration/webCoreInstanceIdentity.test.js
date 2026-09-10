// Topology guard: this app and @crhs/web-core MUST resolve exactly ONE copy of
// every stateful dependency they share. A dual-package install throws nothing —
// it just forks mongoose's model registry, its connection pool and its driver,
// so a document written through one instance is invisible to the other.
//
// PROOF TECHNIQUE — resolution paths ONLY for the CROSS-PACKAGE comparison.
// We must not require web-core's SystemConfig to compare `.base`: this app
// registers its own mongoose.model('SystemConfig') at
// server/models/SystemConfig.js:449, and tests/setup.js:160 does it on every
// run, so loading web-core's byte-identical twin throws OverwriteModelError.
// Comparing require.resolve() strings loads no module at all. Requiring THIS
// APP's own model (assertion c) is safe — tests/setup.js:157-164 already does.
const fs = require('fs');
const path = require('path');

const APP_ROOT = path.join(__dirname, '..', '..');
const CORE_ENTRY = require.resolve('@crhs/web-core');

/** Resolve `name` the way a module at `from` would, without loading it. */
function resolveFrom(name, from) {
  return require.resolve(name, { paths: [from] });
}

/** Same, but returns null instead of throwing when nothing resolves. */
function tryResolveFrom(name, from) {
  try { return resolveFrom(name, from); } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') return null;
    throw e;
  }
}

const SHARED_STATEFUL_DEPS = ['mongoose', 'express-session', 'connect-mongo', 'express-rate-limit'];

describe('@crhs/web-core instance identity (dependency topology)', () => {
  test('web-core is installed as a real copy inside this app, not a symlink to the source tree', () => {
    const installed = path.join(APP_ROOT, 'node_modules', '@crhs', 'web-core');
    expect(fs.lstatSync(installed).isSymbolicLink()).toBe(false);
    expect(CORE_ENTRY.startsWith(path.join(APP_ROOT, 'node_modules') + path.sep)).toBe(true);
  });

  test.each(SHARED_STATEFUL_DEPS)(
    '%s resolves to ONE module for both this app and web-core',
    (name) => {
      expect(resolveFrom(name, CORE_ENTRY)).toBe(resolveFrom(name, APP_ROOT));
    }
  );

  test('no second copy of any shared dep is nested under the installed web-core', () => {
    const coreDir = path.dirname(path.dirname(CORE_ENTRY)); // .../@crhs/web-core
    for (const name of SHARED_STATEFUL_DEPS) {
      expect({ name, nested: fs.existsSync(path.join(coreDir, 'node_modules', name)) })
        .toEqual({ name, nested: false });
    }
  });

  test('web-core never sees a mongodb driver other than the one mongoose loads', () => {
    const viaMongoose = resolveFrom('mongodb', resolveFrom('mongoose', APP_ROOT));
    expect(typeof viaMongoose).toBe('string');
    const viaCore = tryResolveFrom('mongodb', CORE_ENTRY);
    // Either web-core resolves no mongodb at all (it no longer declares one and
    // nothing hoisted a stray copy — fine, it goes through mongoose), or it
    // resolves the very same file. A DIFFERENT copy is the failure mode.
    if (viaCore !== null) expect(viaCore).toBe(viaMongoose);
  });

  // Assertion (c) from spec §7.1.2. This requires THIS APP's own model, which
  // tests/setup.js:157-164 already loads on every run — it is NOT web-core's
  // twin, so it cannot raise OverwriteModelError. Before the topology fix,
  // seeding through a forked mongoose instance wrote into a connection the
  // suite never reads, and tests/setup.js swallowed the error.
  test('initializeDefaults() resolves through THIS APP\'s model and seeds the collection', async () => {
    const SystemConfig = require('../../server/models/SystemConfig');
    await expect(SystemConfig.initializeDefaults()).resolves.not.toThrow();
    expect(await SystemConfig.countDocuments({})).toBeGreaterThanOrEqual(3);
  });
});
