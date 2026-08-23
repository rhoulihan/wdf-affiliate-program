'use strict';
// Phase-4a domain-migration guard. Fails on un-allowlisted app-scope refs to
// the retired host / renamed identifiers. See docs/superpowers/plans/2026-08-23-phase4a-domain-migration.md
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const REPO = path.resolve(__dirname, '../..');
const baseline = new Set(
  JSON.parse(fs.readFileSync(path.join(REPO, 'tests/fixtures/domain-guard-baseline.json'), 'utf8'))
);
// Deferred/excluded trees (4b + non-runtime) — their refs are not this plan's job.
const EXCLUDED_PREFIXES = [
  'public/data/', 'public/franchise-default/', 'public/dev/', 'design-explorer/',
  'public/design-explorer/', 'docs/', 'node_modules/', '.git/', 'crhsent/',
  'scripts/franchise-build/',
];
const EXCLUDED_FILES = new Set([
  // excluded/marketing parent pages that host the iframe or name the franchisor
  'public/franchise-host.html', 'public/franchise.html',
  'public/iframe-parent-example.html', 'public/iframe-parent-example-complete.html',
  'public/wavemaxlaundry-embed-code.html', 'public/wavemaxlaundry-embed-code-complete.html',
  'public/why-invest-in-wavemax.html', 'public/wavemax-vs-zombiemat.html', 'public/wavemax-affiliate.html',
  'public/about.html', 'public/testimonials.html', 'public/faq.html', 'public/contact.html', 'public/virtual-tour.html',
  'server/controllers/franchiseController.js', 'server/routes/franchiseRoutes.js',
  'server/config/domainSeoOverrides.js', 'server/config/franchisePreviewCopy.js',
  // this guard + its baseline
  'tests/unit/domain-guard.test.js',
]);
const EXCLUDED_SUFFIXES = ['.md', '.min.js', '.min.css'];
// Allowlisted tokens: the deliberate 301-source host entries + kept functional
// protocol/storage/id tokens + the mail-server/default fallback domains.
const ALLOW = [
  /wavemax-embed['"]/gi,        // postMessage source tag (kept)
  /wavemax-language/gi,         // localStorage key (kept)
  /wavemax-iframe/gi,           // iframe DOM id (kept)
  /['"](?:www\.|affiliate\.)?wavemax\.promo['"]/gi, // retired-host 301-source literals (allowedHosts/RETIRED_HOSTS) — quoted only; an unquoted https://wavemax.promo URL still trips
];
// Only these migration-target patterns are policed (not every "wavemax"):
const TARGET = /wavemax\.promo|wavemax\.sid|wavemax-api|wavemax-client|wavemax-affiliate'|logo-wavemax|wavemax-(affiliate|components|embed|mhr-chrome|mhr-modal|theme)\.css/i;

function excluded(p) {
  if (EXCLUDED_FILES.has(p)) return true;
  if (EXCLUDED_PREFIXES.some((x) => p.startsWith(x))) return true;
  if (EXCLUDED_SUFFIXES.some((x) => p.endsWith(x))) return true;
  return false;
}
function allowedOnly(line) {
  let s = line;
  for (const re of ALLOW) s = s.replace(re, '');
  return !TARGET.test(s);
}

describe('phase-4a domain guard', () => {
  const raw = execSync('git grep -inI -E "wavemax\\\\.promo|wavemax\\\\.sid|wavemax-api|wavemax-client|logo-wavemax|wavemax-(affiliate|components|embed|mhr-chrome|mhr-modal|theme)\\\\.css|service: .wavemax-affiliate" -- . ":!tests/fixtures/domain-guard-baseline.json"',
    { cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
  const lines = raw ? raw.split('\n') : [];
  const offenders = [];
  const seen = new Set();
  for (const l of lines) {
    const m = l.match(/^([^:]+):(\d+):(.*)$/);
    if (!m) continue;
    const [, file, , content] = m;
    if (excluded(file)) continue;
    if (allowedOnly(content)) continue;
    if (baseline.has(file)) { seen.add(file); continue; }
    offenders.push(`${file}:${m[2]}`);
  }
  test('no un-allowlisted migration target outside the baseline', () => {
    expect(offenders).toEqual([]);
  });
  test('baseline has no stale entries', () => {
    const stale = [...baseline].filter((f) => !seen.has(f) && !excluded(f));
    expect(stale).toEqual([]);
  });
});
