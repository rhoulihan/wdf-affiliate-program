'use strict';
// Branding guard — fails on any un-allowlisted literal "wavemax" in tracked source.
// See docs/superpowers/plans/2026-08-22-phase3-debrand.md (Phase 3 de-brand).
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO = path.resolve(__dirname, '../..');
const baseline = new Set(
  JSON.parse(fs.readFileSync(path.join(REPO, 'tests/fixtures/branding-guard-baseline.json'), 'utf8'))
);

// Whole-file/tree exclusions (spec §7 + Phase-4 deferrals + generated + docs).
const EXCLUDED_PREFIXES = [
  'crhsent/', 'dc_private/', 'docs/', 'node_modules/', '.git/',
  'design-explorer/', 'tests/unit/design-explorer/',
  'public/design-explorer/', 'public/franchise-default/', 'public/dev/',
  'scripts/franchise-build/',
];
const EXCLUDED_FILES = new Set([
  'server/middleware/accessGate.js', 'server/middleware/mediatorGate.js',
  'server/models/AccessGate.js', 'server/models/AccessWhitelist.js',
  'server/models/AccessClick.js', 'server/models/AccessRequest.js',
  'server/models/MediatorAccess.js',
  'server/controllers/franchiseController.js', 'server/routes/franchiseRoutes.js',
  'server/controllers/conciergeController.js', 'server/services/conciergeFaq.js',
  'server/config/domainSeoOverrides.js', 'server/config/franchisePreviewCopy.js',
  'public/assets/js/franchise-page-helpers.js',
  'public/franchise.html', 'public/franchise-host.html',
  'public/why-invest-in-wavemax.html', 'public/wavemax-vs-zombiemat.html',
  'public/wavemax-affiliate.html', 'public/about.html', 'public/testimonials.html',
  'public/faq.html', 'public/contact.html', 'public/virtual-tour.html',
  'public/become-a-franchisee.html', 'public/laundromat-investment-guide.html',
  'public/wavemaxlaundry-embed-code.html', 'public/wavemaxlaundry-embed-code-complete.html',
  'public/iframe-parent-example.html', 'public/iframe-parent-example-complete.html',
  'public/products-placeholder.html',
  'tests/unit/wavemaxAffiliatePage.test.js', 'tests/unit/accessGate.test.js',
  'tests/unit/mediatorGate.test.js', 'tests/unit/branding-guard.test.js',
  // Guard-style test that asserts the ABSENCE of the mark in locales — its
  // /wavemax/i matcher is load-bearing, so it is allowlisted like this file.
  'tests/unit/i18n-brand-token.test.js',
  // DB-name-only dev/admin scripts (infra: connect string names the ADB database).
  'scripts/seed-claim-bag.js', 'scripts/admin/delete-admin-operators.js',
  'scripts/diagnostics/check-data-distribution.js',
]);
const EXCLUDED_SUFFIXES = ['.min.js', '.min.css', '.md'];

// Infra identifiers — a line is OK if removing all of these leaves no bare "wavemax".
const INFRA_ALLOW = [
  /wavemax\.promo/gi, /mail\.wavemax/gi, /@wavemax\.promo/gi,
  /wavemaxlaundry\.com/gi, /wavemax-bag-registration/gi,
  /wavemax\.firebaseapp\.com/gi, /wavemax\.appspot\.com/gi,
  /wavemax_affiliate/gi, /wavemax-affiliate-program/gi,
];

function isExcludedPath(p) {
  if (EXCLUDED_FILES.has(p)) return true;
  if (EXCLUDED_PREFIXES.some((pre) => p.startsWith(pre))) return true;
  if (EXCLUDED_SUFFIXES.some((suf) => p.endsWith(suf))) return true;
  return false;
}
function isInfraOnly(line) {
  let stripped = line;
  for (const re of INFRA_ALLOW) stripped = stripped.replace(re, '');
  return !/wavemax/i.test(stripped);
}

describe('branding guard', () => {
  const raw = execSync('git grep -inI wavemax -- . ":!tests/fixtures/branding-guard-baseline.json"', {
    cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  }).trim();
  const lines = raw ? raw.split('\n') : [];

  const offenders = [];
  const baselineHitFiles = new Set();
  for (const l of lines) {
    const m = l.match(/^([^:]+):(\d+):(.*)$/);
    if (!m) continue;
    const [, file, , content] = m;
    if (isExcludedPath(file)) continue;
    if (isInfraOnly(content)) continue;
    if (baseline.has(file)) { baselineHitFiles.add(file); continue; }
    offenders.push(`${file}:${l.match(/^[^:]+:(\d+):/)[1]}`);
  }

  test('no un-allowlisted "WaveMAX" outside the shrinking baseline', () => {
    expect(offenders).toEqual([]);
  });

  test('baseline has no stale entries (every listed file still has a real hit)', () => {
    const stale = [...baseline].filter((f) => !baselineHitFiles.has(f) && !isExcludedPath(f));
    expect(stale).toEqual([]);
  });
});
