// Global Constraint 9 (Plan 1): this app owns an INLINE SystemConfig model
// (server/models/SystemConfig.js:449 -> mongoose.model('SystemConfig', ...)),
// and @crhs/web-core registers a model of the SAME name. Requiring web-core's
// SystemConfig anywhere in this repo therefore throws
//   OverwriteModelError: Cannot overwrite `SystemConfig` model once compiled.
// at boot (server.js:138-141) and in every test run (tests/setup.js:160).
//
// This guard is source-level ON PURPOSE: it must not load either model.
// Retire it in PLAN 4 (PR B8), which deletes the inline model, shims
// server/models/SystemConfig.js over web-core's, and calls
// SystemConfig.registerDefaults(APP_DEFAULTS) at boot.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.join(__dirname, '../..');
const SELF = 'tests/integration/systemConfigOwnershipGuard.test.js';

const trackedJs = () =>
  execFileSync('git', ['ls-files', 'server', 'tests', 'scripts', 'server.js'], { cwd: repoRoot })
    .toString()
    .split('\n')
    .filter((f) => f.endsWith('.js') && f !== SELF);

// Every shape a real regression could take. Kept as separate named patterns so a
// failure says which import shape crept in.
const MEMBER_OFF_REQUIRE = /require\(\s*(['"])@crhs\/web-core\1\s*\)\s*\.\s*SystemConfig/;
const MEMBER_OFF_NAMESPACE = /\b(webCore|webcore|wc|core)\s*\.\s*SystemConfig/;
const DEEP_REQUIRE = /require\(\s*(['"])@crhs\/web-core\/[^'"]*SystemConfig[^'"]*\1\s*\)/;
// `const { a, SystemConfig } = require('@crhs/web-core')`, newlines included.
const DESTRUCTURED_REQUIRE = /\{([^}]*)\}\s*=\s*require\(\s*(['"])@crhs\/web-core\2\s*\)/g;

const importsCoreSystemConfig = (src) => {
  if (MEMBER_OFF_REQUIRE.test(src)) return true;
  if (MEMBER_OFF_NAMESPACE.test(src)) return true;
  if (DEEP_REQUIRE.test(src)) return true;
  DESTRUCTURED_REQUIRE.lastIndex = 0;
  let match;
  while ((match = DESTRUCTURED_REQUIRE.exec(src)) !== null) {
    if (/\bSystemConfig\b/.test(match[1])) return true;
  }
  return false;
};

describe('SystemConfig ownership (model double-registration)', () => {
  it('no file imports web-core SystemConfig while the inline model exists', () => {
    const offenders = trackedJs().filter((file) =>
      importsCoreSystemConfig(fs.readFileSync(path.join(repoRoot, file), 'utf8'))
    );

    expect(offenders).toEqual([]);
  });

  it('still owns the inline model that makes the rule necessary', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'server/models/SystemConfig.js'), 'utf8');
    expect(src).toMatch(/mongoose\.model\('SystemConfig'/);
  });

  it('is non-vacuous: each offending import shape is actually detected', () => {
    expect(importsCoreSystemConfig("const S = require('@crhs/web-core').SystemConfig;")).toBe(true);
    expect(importsCoreSystemConfig('const x = webCore.SystemConfig;')).toBe(true);
    expect(importsCoreSystemConfig('const x = wc.SystemConfig.getValue;')).toBe(true);
    expect(
      importsCoreSystemConfig("const { logger, SystemConfig } = require('@crhs/web-core');")
    ).toBe(true);
    expect(
      importsCoreSystemConfig("const S = require('@crhs/web-core/src/models/SystemConfig');")
    ).toBe(true);
    // ...and does not fire on the imports this app legitimately makes today.
    expect(importsCoreSystemConfig("module.exports = require('@crhs/web-core').logger;")).toBe(
      false
    );
    expect(importsCoreSystemConfig("const SystemConfig = require('./SystemConfig');")).toBe(false);
  });
});
