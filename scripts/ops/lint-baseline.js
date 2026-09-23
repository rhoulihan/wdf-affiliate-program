#!/usr/bin/env node
/**
 * Repo-wide ESLint no-increase guard (Plan 3 task 27).
 *
 * Owner decision: `server/` + `server.js` are ZERO (`npm run lint:server`,
 * guarded by tests/unit/eslintServerClean.test.js). Everything else — public/,
 * tests/, docs/, scripts/, tools/ — is an ACCEPTED BASELINE that may not grow.
 * Lowering it is always welcome: re-measure and commit the new, lower number
 * with the change that lowered it.
 *
 * Cost: ~55-90 s wall. `eslint --cache` does not help — the cost is file
 * traversal on the /mnt/c mount, not linting (verified: a warm second pass
 * measured 55 s against 63 s cold).
 *
 * Usage:
 *   node scripts/ops/lint-baseline.js            # check against .eslint-baseline.json
 *   node scripts/ops/lint-baseline.js --write    # re-measure and rewrite the baseline
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ESLint } = require('eslint');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_PATH = path.join(REPO_ROOT, '.eslint-baseline.json');

/**
 * Lint the whole repo and total the errors, grouped by top-level path segment.
 * @returns {Promise<{errors: number, warnings: number, byDirectory: Object<string, number>}>}
 */
async function measure() {
  const eslint = new ESLint({ cwd: REPO_ROOT });
  const results = await eslint.lintFiles(['.']);

  let errors = 0;
  let warnings = 0;
  const byDirectory = {};

  for (const result of results) {
    errors += result.errorCount;
    warnings += result.warningCount;
    if (!result.errorCount) continue;
    const rel = path.relative(REPO_ROOT, result.filePath);
    const top = rel.split(path.sep)[0];
    byDirectory[top] = (byDirectory[top] || 0) + result.errorCount;
  }

  const sorted = Object.fromEntries(
    Object.entries(byDirectory).sort((a, b) => b[1] - a[1])
  );
  return { errors, warnings, byDirectory: sorted };
}

/** @returns {Object} the committed baseline */
function readBaseline() {
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

/**
 * Human-readable per-directory delta, so a failure names the directory that grew.
 * @returns {string}
 */
function formatDelta(baseline, current) {
  const keys = [...new Set([...Object.keys(baseline.byDirectory || {}), ...Object.keys(current.byDirectory)])].sort();
  const rows = [];
  for (const k of keys) {
    const was = (baseline.byDirectory || {})[k] || 0;
    const now = current.byDirectory[k] || 0;
    if (was === now) continue;
    rows.push(`  ${k}: ${was} -> ${now} (${now > was ? '+' : ''}${now - was})`);
  }
  return rows.length ? rows.join('\n') : '  (no per-directory change)';
}

const POLICY = 'server/ and server.js are ZERO (npm run lint:server, guarded by '
  + 'tests/unit/eslintServerClean.test.js). Everything else is an ACCEPTED BASELINE that '
  + 'may not grow (owner decision, Plan 3 task 27). Lowering it is always welcome — '
  + 're-measure with `node scripts/ops/lint-baseline.js --write` and commit the new, '
  + 'lower number with the change.';

async function write() {
  const current = await measure();
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT }).toString().trim();
  const baseline = {
    measuredAt: new Date().toISOString(),
    measuredAtSha: sha,
    policy: POLICY,
    errors: current.errors,
    warnings: current.warnings,
    byDirectory: current.byDirectory
  };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`wrote ${path.relative(REPO_ROOT, BASELINE_PATH)}: ${current.errors} errors / ${current.warnings} warnings`);
  console.log(Object.entries(current.byDirectory).map(([k, v]) => `${k} ${v}`).join(' · '));
  return baseline;
}

async function check() {
  const baseline = readBaseline();
  const current = await measure();
  const ok = current.errors <= baseline.errors;
  console.log(`baseline ${baseline.errors} · current ${current.errors} · ${ok ? 'OK' : 'INCREASED'}`);
  if (!ok) {
    console.error(`\nESLint errors rose from ${baseline.errors} to ${current.errors} (+${current.errors - baseline.errors}).`);
    console.error('Per-directory change:');
    console.error(formatDelta(baseline, current));
    console.error(`\n${baseline.policy}`);
  }
  return ok;
}

module.exports = { measure, readBaseline, formatDelta, BASELINE_PATH };

if (require.main === module) {
  const run = process.argv.includes('--write') ? write().then(() => true) : check();
  run.then((ok) => process.exit(ok ? 0 : 1)).catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
