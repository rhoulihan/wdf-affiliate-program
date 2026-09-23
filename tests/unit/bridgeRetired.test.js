'use strict';
// Owner decision 4 (Plan 1, restated in the Plan 3 scope brief): "we will never embed
// in the franchisor site." The iframe bridges and their CORS carve-out are retired, not
// migrated. This guard keeps them from coming back — including the allowlist row that
// existed only to permit the bridge's global API name.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const REPO = path.resolve(__dirname, '../..');

describe('iframe bridges are retired', () => {
  test.each([
    'public/assets/js/iframe-bridge-v2.js', 'public/assets/js/iframe-bridge-v2.min.js',
    'public/assets/js/parent-iframe-bridge-v3.js', 'public/assets/js/parent-iframe-bridge-v3.min.js',
    '.claude/commands/embed.md'
  ])('%s does not exist', (p) => {
    expect(fs.existsSync(path.join(REPO, p))).toBe(false);
  });

  test('no tracked runtime file names a bridge', () => {
    const out = execSync(
      'git grep -lI -E "iframe-bridge-v2|parent-iframe-bridge-v3|WaveMaxBridgeV3" -- public server server.js tests scripts || true',
      { cwd: REPO, encoding: 'utf8' }
    ).trim();
    expect(out.split('\n').filter(Boolean).filter((f) => f !== 'tests/unit/bridgeRetired.test.js'))
      .toEqual([]);
  });

  test('the asset build no longer has a bridge row', () => {
    expect(fs.readFileSync(path.join(REPO, 'scripts/build-assets.js'), 'utf8')).not.toMatch(/bridge/i);
  });

  test('the branding guard no longer allowlists the bridge API name', () => {
    expect(fs.readFileSync(path.join(REPO, 'tests/unit/branding-guard.test.js'), 'utf8'))
      .not.toMatch(/WaveMaxBridgeV3/);
  });
});
