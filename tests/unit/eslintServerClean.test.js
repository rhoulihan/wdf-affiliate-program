/**
 * Guard: `server/` and `server.js` stay at ZERO ESLint errors.
 *
 * Owner decision (Plan 3 tasks 26/27): server-side code is fixed to zero, not
 * merely held at "no increase". Everything outside server/ is a documented
 * accepted baseline guarded separately by tests/unit/eslintRepoBaseline.test.js.
 *
 * Cost: ~10-20 s. ESLint is run through its Node API over ~190 files; on a
 * /mnt/c mount the file traversal, not the linting, dominates.
 */

const path = require('path');
const { ESLint } = require('eslint');

const REPO_ROOT = path.resolve(__dirname, '../..');
const TARGETS = ['server/', 'server.js'];

describe('ESLint: server/ + server.js', () => {
  it('reports zero errors', async () => {
    const eslint = new ESLint({ cwd: REPO_ROOT });
    const results = await eslint.lintFiles(TARGETS);

    const errors = [];
    for (const result of results) {
      const rel = path.relative(REPO_ROOT, result.filePath);
      for (const m of result.messages) {
        if (m.severity !== 2) continue;
        errors.push(`${rel}:${m.line}:${m.column} ${m.ruleId || '(fatal)'} — ${m.message}`);
      }
    }

    // toEqual([]) rather than a count so a failure prints every survivor.
    expect(errors).toEqual([]);
  });
});
