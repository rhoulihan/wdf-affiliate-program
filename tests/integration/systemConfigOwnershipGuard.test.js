// SystemConfig ownership, INVERTED at B8.
//
// Before B8 this app carried its own inline SystemConfig model whose last line
// registered the name 'SystemConfig', and @crhs/web-core registers the same
// name — so requiring web-core's SystemConfig anywhere threw
//   OverwriteModelError: Cannot overwrite `SystemConfig` model once compiled.
// at boot. This guard therefore banned that import outright, and its own header
// said to retire it in PR B8 "which deletes the inline model … and calls
// SystemConfig.registerDefaults(APP_DEFAULTS)". B8 has now done exactly that.
//
// Retiring the guard by deletion would throw away a constraint that still
// matters, so it is inverted instead. web-core's SystemConfig is now the ONE
// model, and server/models/SystemConfig.js is the ONE module allowed to reach
// for it directly — because requiring that module is what registers the app's
// 23 owned defaults (server/config/systemConfigDefaults.js). A controller or
// service that grabs `wc.SystemConfig` straight from web-core would get a model
// whose app defaults may never have been registered, and `getValue()` would
// then fall through to its caller-supplied default with NOTHING raised
// anywhere — a silent wrong business value, which is the failure mode the
// project rule "always go through SystemConfig.getValue" exists to prevent.
//
// Source-level ON PURPOSE (the first test loads no model), so it stays valid
// whatever the require order happens to be.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.join(__dirname, '../..');
const SELF = 'tests/integration/systemConfigOwnershipGuard.test.js';

// The single module permitted to import web-core's SystemConfig: it is the
// registration module, and requiring it is what contributes the app's defaults.
const OWNER = 'server/models/SystemConfig.js';

// Scans server/, scripts/ AND every root-level .js. The root level matters:
// init-defaults.js is a boot-time module (server.js calls it right after the DB
// connects) that already requires models, so it is exactly where a stray direct
// import would be most damaging.
//
// tests/ is deliberately NOT scanned: a test asserting the app model IS
// web-core's (which is the B8 invariant) must name both sides, so the ban is
// meaningless there and the pre-B8 scope only worked because no such assertion
// was legal yet.
const trackedJs = () => {
  const inDirs = execFileSync('git', ['ls-files', 'server', 'scripts'], { cwd: repoRoot })
    .toString().split('\n');
  // ':(exclude)' keeps this to the repo ROOT only, not every .js in every subtree.
  const atRoot = execFileSync('git', ['ls-files', '*.js', ':(exclude)*/*'], { cwd: repoRoot })
    .toString().split('\n');
  return [...new Set([...inDirs, ...atRoot])].filter((f) => f.endsWith('.js') && f !== SELF);
};

// Every shape a real regression could take. Kept as separate named patterns so a
// failure says which import shape crept in.
const MEMBER_OFF_REQUIRE = /require\(\s*(['"])@crhs\/web-core\1\s*\)\s*\.\s*SystemConfig/;
const MEMBER_OFF_NAMESPACE = /\b(webCore|webcore|wc|core)\s*\.\s*SystemConfig/;
const DEEP_REQUIRE = /require\(\s*(['"])@crhs\/web-core\/[^'"]*SystemConfig[^'"]*\1\s*\)/;
// `const { a, SystemConfig } = require('@crhs/web-core')`, newlines included.
const DESTRUCTURED_REQUIRE = /\{([^}]*)\}\s*=\s*require\(\s*(['"])@crhs\/web-core\2\s*\)/g;
// `const webCore = require('@crhs/web-core'); const { SystemConfig } = webCore;`
// -- destructure off a NAMESPACE VARIABLE rather than off the require() itself.
// server.js already holds web-core that way (`const webCore = require(...)`), so
// this is the likeliest shape a real regression in this repo would take.
const DESTRUCTURED_OFF_NAMESPACE = /\{([^}]*)\}\s*=\s*(webCore|webcore|wc|core)\b/g;

const importsCoreSystemConfig = (src) => {
  if (MEMBER_OFF_REQUIRE.test(src)) return true;
  if (MEMBER_OFF_NAMESPACE.test(src)) return true;
  if (DEEP_REQUIRE.test(src)) return true;
  for (const re of [DESTRUCTURED_REQUIRE, DESTRUCTURED_OFF_NAMESPACE]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(src)) !== null) {
      if (/\bSystemConfig\b/.test(match[1])) return true;
    }
  }
  return false;
};

describe('SystemConfig ownership (exactly one importer of web-core\'s model)', () => {
  it('only the registration module imports web-core SystemConfig', () => {
    const offenders = trackedJs().filter((file) =>
      file !== OWNER && importsCoreSystemConfig(fs.readFileSync(path.join(repoRoot, file), 'utf8'))
    );

    expect(offenders).toEqual([]);
  });

  it('the registration module does import it, and registers the app defaults', () => {
    const src = fs.readFileSync(path.join(repoRoot, OWNER), 'utf8');
    expect(importsCoreSystemConfig(src)).toBe(true);
    expect(src).toMatch(/registerDefaults\(/);
    expect(src).toMatch(/systemConfigDefaults/);
  });

  it('the inline model this guard used to protect is gone', () => {
    const src = fs.readFileSync(path.join(repoRoot, OWNER), 'utf8');
    expect(src).not.toMatch(/mongoose\.model\('SystemConfig'/);
  });

  it('is non-vacuous: each offending import shape is actually detected', () => {
    expect(importsCoreSystemConfig('const S = require(\'@crhs/web-core\').SystemConfig;')).toBe(true);
    expect(importsCoreSystemConfig('const x = webCore.SystemConfig;')).toBe(true);
    expect(importsCoreSystemConfig('const x = wc.SystemConfig.getValue;')).toBe(true);
    expect(
      importsCoreSystemConfig('const { logger, SystemConfig } = require(\'@crhs/web-core\');')
    ).toBe(true);
    expect(
      importsCoreSystemConfig('const S = require(\'@crhs/web-core/src/models/SystemConfig\');')
    ).toBe(true);
    // The two shapes added 2026-09-12 after a reviewer found them missing:
    // destructure off a namespace VARIABLE (the likeliest real regression here,
    // because server.js already holds web-core as `const webCore = require(...)`).
    expect(importsCoreSystemConfig('const webCore = require(\'@crhs/web-core\');\nconst { SystemConfig } = webCore;')).toBe(true);
    expect(importsCoreSystemConfig('const { a, SystemConfig } = wc;')).toBe(true);
    // ...but a destructure off something unrelated must NOT fire.
    expect(importsCoreSystemConfig('const { SystemConfig } = require(\'./models\');')).toBe(false);
    // ...and does not fire on the imports this app legitimately makes today.
    expect(importsCoreSystemConfig('module.exports = require(\'@crhs/web-core\').logger;')).toBe(
      false
    );
    expect(importsCoreSystemConfig('const SystemConfig = require(\'./SystemConfig\');')).toBe(false);
  });
});
