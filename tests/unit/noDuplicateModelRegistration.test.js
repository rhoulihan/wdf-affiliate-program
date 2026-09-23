// §7.1.3 guard. The app carried its own 450-line SystemConfig whose last line was
// `mongoose.model('SystemConfig', systemConfigSchema)`, and @crhs/web-core
// registers the same name. On ONE mongoose instance — which
// tests/integration/webCoreInstanceIdentity.test.js proves is what we have —
// both reachable is OverwriteModelError AT BOOT, not at query time.
//
// These three cases pin the post-B8 shape: web-core owns the registration, the
// app's model file only composes on top of it, and requiring it twice is inert.
const { execSync } = require('child_process');
const path = require('path');
const REPO = path.join(__dirname, '..', '..');

it('server/ registers SystemConfig nowhere — web-core owns the registration', () => {
  const out = execSync('grep -rn "mongoose.model(\'SystemConfig\'" server/ || true', { cwd: REPO })
    .toString().trim();
  expect(out).toBe('');
});

it('the model is registered exactly once at runtime', () => {
  require('../../server/models/SystemConfig');
  const names = require('mongoose').modelNames().filter((n) => n === 'SystemConfig');
  expect(names).toHaveLength(1);
});

it('requiring the model twice does not throw OverwriteModelError (the §7.1.3 hazard)', () => {
  expect(() => {
    jest.resetModules();
    require('../../server/models/SystemConfig');
    require('../../server/models/SystemConfig');
  }).not.toThrow();
});

it('the app model IS web-core\'s model object, not a byte-identical twin', () => {
  const SystemConfig = require('../../server/models/SystemConfig');
  expect(SystemConfig).toBe(require('@crhs/web-core').SystemConfig);
});

// The registration guard in core (`registerDefaults` throws on a same-key
// different-definition re-register) only compares app-owned entries with each
// other — it does NOT compare them with CORE_DEFAULTS. A key present in both
// lists is silently shadowed by core at seed time (`$setOnInsert` + upsert: the
// first writer wins), so an app-side edit to such a key would be a no-op with no
// error anywhere. This turns that silent shadow into a red test.
it('no app-owned default collides with a web-core CORE_DEFAULTS key', () => {
  const appDefaults = require('../../server/config/systemConfigDefaults');
  const coreKeys = require('@crhs/web-core').SystemConfig.CORE_DEFAULTS.map((c) => c.key);
  const collisions = appDefaults.map((c) => c.key).filter((k) => coreKeys.includes(k));
  expect(collisions).toEqual([]);
});
