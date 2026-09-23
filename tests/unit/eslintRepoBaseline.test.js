/**
 * Guard: the repo-wide ESLint error count may not RISE (Plan 3 task 27).
 *
 * Owner decision, verbatim: "the errors outside server/ become a documented
 * accepted baseline with a no-increase guard — NOT fixed". The committed number
 * lives in .eslint-baseline.json; `server/` + `server.js` are held at zero
 * separately by tests/unit/eslintServerClean.test.js.
 *
 * Cost: ~55-90 s wall. `eslint --cache` does not help — the cost is file
 * traversal on the /mnt/c mount, not linting.
 *
 * Escape hatch for `jest --watch`: LINT_BASELINE_SKIP=1. It is deliberately NOT
 * available to any `npm test` script — the assertion below fails if one ever
 * ships with the guard switched off.
 */

const { measure, readBaseline, formatDelta } = require('../../scripts/ops/lint-baseline');
const pkg = require('../../package.json');

const SKIP = !!process.env.LINT_BASELINE_SKIP;
const maybeIt = SKIP ? it.skip : it;

describe('ESLint repo-wide accepted baseline', () => {
  it('is not disabled by any npm test script', () => {
    const testScripts = Object.entries(pkg.scripts)
      .filter(([name]) => name === 'test' || name.startsWith('test:'));
    expect(testScripts.length).toBeGreaterThan(0);
    for (const [name, cmd] of testScripts) {
      expect(`${name}: ${cmd}`).not.toMatch(/LINT_BASELINE_SKIP/);
    }
  });

  maybeIt('does not exceed the committed baseline', async () => {
    const baseline = readBaseline();
    const current = await measure();

    if (current.errors > baseline.errors) {
      throw new Error(
        `Repo-wide ESLint errors rose from ${baseline.errors} to ${current.errors} `
        + `(+${current.errors - baseline.errors}).\nPer-directory change:\n`
        + `${formatDelta(baseline, current)}\n\n${baseline.policy}`
      );
    }
    expect(current.errors).toBeLessThanOrEqual(baseline.errors);
  });
});
