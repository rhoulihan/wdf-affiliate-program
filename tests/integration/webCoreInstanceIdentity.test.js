// Topology guard: this app and @crhs/web-core MUST resolve exactly ONE copy of
// every stateful dependency they share. A dual-package install throws nothing —
// it just forks mongoose's model registry, its connection pool and its driver,
// so a document written through one instance is invisible to the other.
//
// PROOF TECHNIQUE — resolution paths for the CROSS-PACKAGE comparison, PLUS a
// live `.base` identity check.
//
// Before B8 the `.base` comparison was ILLEGAL: this app registered its own
// model under the name 'SystemConfig' at server/models/SystemConfig.js:449, so
// requiring web-core's byte-identical twin to read its `.base` threw
// OverwriteModelError before the assertion could run. B8 collapsed the two into
// one registration owned by web-core (spec §7.1.3), and the `.base` assertions
// below — the strongest form of the topology proof, since it compares live
// objects rather than resolved paths — became legal for the first time.
// The resolution-path tests are kept: they catch a dual install that has not
// been loaded yet, which `.base` cannot see.
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
  // tests/setup.js already loads on every run — post-B8 it IS web-core's model,
  // so it cannot raise OverwriteModelError. Before the topology fix, seeding
  // through a forked mongoose instance wrote into a connection the suite never
  // reads, and tests/setup.js swallowed the error.
  test('initializeDefaults() resolves through THIS APP\'s model and seeds the collection', async () => {
    const SystemConfig = require('../../server/models/SystemConfig');
    await expect(SystemConfig.initializeDefaults()).resolves.not.toThrow();
    expect(await SystemConfig.countDocuments({})).toBeGreaterThanOrEqual(3);
  });

  // ---- The `.base` identity assertions, legal only since B8 --------------
  //
  // `Model.base` is the mongoose instance a model was compiled against. Two
  // copies of mongoose produce two registries, two connection pools and two
  // drivers, and nothing throws — a document written through one is invisible
  // to the other. Comparing the live `.base` of the app's model, web-core's
  // model and the app's own `require('mongoose')` is the only assertion that
  // rules that out for objects that are actually in use.
  describe('live model identity (legal only since B8 — spec §10.3 P3)', () => {
    const mongoose = require('mongoose');
    const wc = require('@crhs/web-core');
    const appModel = require('../../server/models/SystemConfig');

    test('the app\'s SystemConfig IS web-core\'s SystemConfig, not a twin', () => {
      expect(appModel).toBe(wc.SystemConfig);
    });

    test('both models were compiled against the mongoose instance this app loads', () => {
      expect(appModel.base).toBe(mongoose);
      expect(wc.SystemConfig.base).toBe(mongoose);
    });

    test('web-core and this app share one mongodb driver object', () => {
      expect(mongoose.mongo.Collection).toBe(require('mongodb').Collection);
    });

    test('SystemConfig is registered exactly once in the shared registry', () => {
      expect(mongoose.modelNames().filter((n) => n === 'SystemConfig')).toHaveLength(1);
    });

    // A ref: resolves LAZILY — a model that stops being registered fails at
    // QUERY time, not require time, and possibly on only one code path. So
    // asserting the string is not enough, and asserting ambient registration is
    // wrong (this suite's process only has what it required). What matters is
    // that the lookup mongoose itself performs at populate time — on the
    // connection THIS model is bound to — finds the app's Administrator model.
    test('the updatedBy ref resolves through the connection this model is bound to', () => {
      expect(appModel.schema.path('updatedBy').options.ref).toBe('Administrator');
      const Administrator = require('../../server/models/Administrator');
      // `model.db.model(name)` is exactly the resolution populate does.
      expect(appModel.db.model('Administrator')).toBe(Administrator);
      expect(Administrator.base).toBe(mongoose);
    });

    // And end-to-end: a real populate across the ref. This is the assertion that
    // would go red if SystemConfig and Administrator ever ended up on different
    // mongoose instances or connections — the failure mode that raises nothing
    // at require time.
    test('populate() across updatedBy actually returns the referenced document', async () => {
      const Administrator = require('../../server/models/Administrator');
      const admin = await Administrator.create({
        adminId: 'ADM-REFPROBE',
        firstName: 'Ref',
        lastName: 'Probe',
        email: 'ref.probe@laundromat.example',
        passwordSalt: 'salt',
        passwordHash: 'hash'
      });
      await appModel.initializeDefaults();
      await appModel.updateOne({ key: 'maintenance_mode' }, { updatedBy: admin._id });
      const doc = await appModel.findOne({ key: 'maintenance_mode' }).populate('updatedBy');
      expect(doc.updatedBy).toBeTruthy();
      expect(doc.updatedBy.adminId).toBe('ADM-REFPROBE');
    });
  });
});
