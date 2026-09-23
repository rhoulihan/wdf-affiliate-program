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
  'dc_private/', 'docs/', 'node_modules/', '.git/',
  // Stylesheets — CSS carries only class-name identifiers, franchisor CDN
  // URLs, and brand-name mentions inside header comments; no user-facing
  // display TEXT lives in CSS.
  'public/assets/css/',
];
const EXCLUDED_FILES = new Set([
  'server/models/AccessGate.js', 'server/models/AccessWhitelist.js',
  'server/models/AccessClick.js', 'server/models/AccessRequest.js',
  'server/models/MediatorAccess.js',
  // (public/wavemax-affiliate.html was deleted on 2026-09-14 — page retired.)
  // Kept host-page sample that names the franchisor mark (products placeholder).
  'public/products-placeholder.html',
  // Asserts the ABSENCE of the franchisor host in the affiliate email dispatcher,
  // so it must name it. See affiliate-email-franchisor-urls-2026-08-24.
  'tests/unit/affiliateEmailUrls.test.js',
  'tests/unit/wavemaxAffiliatePage.test.js', 'tests/unit/branding-guard.test.js',
  // Phase-4a domain-migration tooling — legitimately references wavemax.
  'tests/unit/domain-guard.test.js', 'tests/fixtures/domain-guard-baseline.json',
  'tests/integration/domainMigration.test.js',
  // Guard-style test that asserts the ABSENCE of the mark in locales — its
  // /wavemax/i matcher is load-bearing, so it is allowlisted like this file.
  'tests/unit/i18n-brand-token.test.js',
  // Guard-style test asserting the bridges are GONE — it spells the retired bridge's
  // global API identifier in order to assert the allowlist row above is removed, so it is
  // excluded like the file above. Without it, the guard would red on its own guard.
  'tests/unit/bridgeRetired.test.js',
  // DB-name-only dev/admin scripts (infra: connect string names the ADB database).
  'scripts/seed-claim-bag.js', 'scripts/admin/delete-admin-operators.js',
  'scripts/diagnostics/check-data-distribution.js',
  // ---- Phase-3 Task-8 completion ----
  // Security blocklist: 'wavemax' must stay in the weak-password list to reject
  // the WaveMAX!2024 default credential — it is a control, not display copy.
  'server/utils/passwordValidator.js',
  'scripts/ops/refresh-hibu.sh', 'tools/flyers/build-flyers.js',
  // Build script whose only marks are the wavemax-*.css asset filenames (Phase-4
  // asset rename). Excluded rather than allowlisting the filename globally, which
  // would also mask the same filename in tests/integration/assetCaching.test.js.
  'scripts/build-assets.js',
  // Proprietary LICENSE names the CRHS/WaveMAX marks verbatim (legal text) +
  // dev-persona doc — both kept literal.
  'LICENSE', 'init.prompt',
  // Security-control test: asserts 'wavemax' stays in the weak-password blocklist
  // (source passwordValidator.js is excluded for the same reason — a control, not copy).
  'tests/unit/passwordValidator.test.js',
  // ---- Plan-2 cutover tooling (Plan 3 Task 38) ----
  // Operational gate that curls the REAL hosts to assert the content app's output:
  // the mediator /wavemax/ path, the logo-wavemax.png 410, the retired
  // /wavemax-affiliate 301, and its own bare-mark count that greps for "wavemax"
  // while excluding "WaveMAX Austin". It must name the hosts and the mark to assert
  // them, and it ships to no browser — it is ops tooling, not application code.
  // Its unit test drives the same script against a fake origin, so both go together.
  'scripts/ops/cutover-gate.sh', 'tests/unit/ops/cutoverGateS1.test.js',
]);
const EXCLUDED_SUFFIXES = ['.min.js', '.min.css', '.md'];

// Infra identifiers — a line is OK if removing all of these leaves no bare "wavemax".
// Re-audited 2026-08-24: 13 dead patterns pruned and the franchisor recruitment-link
// slug removed after its client-JS + email defects were fixed, so this list now
// shields only genuine infra / legal / functional identifiers. Adding an entry here
// hides a real "wavemax" from the guard — only do it for a true, verified keep.
const INFRA_ALLOW = [
  // "WaveMAX Austin" is CRHS's business name — the fulfillment partner for the
  // atxwashdryfold program, and the ONE permitted use of the mark. Bare "WaveMAX"
  // / "WaveMAX Laundry" (the franchisor's marks) are NOT allowed and still fail.
  /WaveMAX Austin/gi,
  /wavemax\.promo/gi, /@wavemax\.promo/gi,
  // The franchisor's domain ONLY in its regex-ESCAPED form (`wavemaxlaundry\.com`,
  // at least one backslash). The PLAIN form is deliberately NOT allowlisted: it is
  // the leak this guard exists to catch. The escaped spelling only ever
  // occurs inside a matcher, and every matcher in this repo asserts the domain is
  // ABSENT — see quarantineRetired.test.js and embedNavigationOrigin.test.js. Bare
  // "WaveMAX Laundry" and any other franchisor host still fail (falsified in the
  // Plan 3 Task 38 PR body).
  /wavemaxlaundry\\+\.com/gi, /wavemax-bag-registration/gi,
  /wavemax_affiliate/gi, /wavemax-affiliate-program/gi,
  // Trademark / proprietary legal notices kept VERBATIM (they name the real
  // franchisor mark + entity; mechanically tokenizing them is legally wrong).
  /WaveMAX is a trademark/gi, /WaveMAX™/gi, /the WaveMAX logo/gi,
  /WaveMAX Franchise, LLC/gi, /WaveMAX WDF Affiliate Portal/gi,
  // Client-JS infra identifiers — postMessage source tag, localStorage key and
  // host-page DOM id. Functional bindings, never display copy. (The bridge API
  // name row was removed with the bridges themselves; see bridgeRetired.test.js.)
  /wavemax-embed/gi, /wavemax-language/gi, /wavemax-iframe/gi,
  // The RETIRED session-cookie name (the live cookie is portal.sid). Named only to
  // assert its absence — webCoreConsumptionGolden.test.js pins that the response sets
  // no wavemax.sid. Allowlisting the identifier keeps that golden file, which also
  // pins the CSP, under the guard instead of excluding it wholesale.
  /wavemax\.sid/gi,
  // ---- anchored infra/operational identifiers ----
  // MongoDB database name in local/docker connection strings + init.
  /localhost:27017\/wavemax/gi, /mongo:27017\/wavemax/gi,
  /MONGO_INITDB_DATABASE=wavemax/gi, /getSiblingDB\('wavemax'\)/gi,
  // Default seeded admin credential (kept literal; passwordValidator blocks it).
  /WaveMAX!2024/g,
  // PM2 live process name — in commands and in the ecosystem.config.js comment.
  /pm2 (?:start|restart|reload|stop|delete|logs) wavemax/gi, /'wavemax' name/gi,
  // Production deploy path on the app servers.
  /\/var\/www\/wavemax\//gi,
  // server.js corporate-origins code identifier.
  /wavemaxDomains/g,
  // .gitignore audit-doc path prefixes (match real filenames on disk).
  /wavemaxlaundry-site-audit/gi, /wavemax-promo-prelaunch-audit/gi,
  // Mediator gate URL + its clickjacking-demo content path (functional routes).
  /crhsent\.com\/wavemax/gi, /\/wavemax\/clickjacking-demo\.html/gi,
  // Retired route slug — the page is gone (2026-09-14) but server.js still names
  // the slug to answer 410, and the tests/docs that lock the retirement name it too.
  /\/wavemax-affiliate/gi, /wavemax-affiliate\.html/gi,
];

function isExcludedPath(p) {
  if (EXCLUDED_FILES.has(p)) return true;
  if (EXCLUDED_PREFIXES.some((pre) => p.startsWith(pre))) return true;
  if (EXCLUDED_SUFFIXES.some((suf) => p.endsWith(suf))) return true;
  return false;
}
// Naming the franchisor's domain in a COMMENT or a test name is documentation,
// not a leak — several guards in this repo have to state what they assert is
// absent, and a guard that forbids saying the word cannot be documented. In CODE
// the same string IS a leak. That distinction is exactly why the plain form is
// NOT in INFRA_ALLOW; it is allowed here and nowhere else.
const COMMENT_ONLY_ALLOW = [/wavemaxlaundry\.com/gi];
function isCommentOrTestName(line) {
  return /^\s*(\/\/|\*|#|<!--)/.test(line) || /^\s*(it|test|describe)\(/.test(line);
}
function isInfraOnly(line) {
  let stripped = line;
  for (const re of INFRA_ALLOW) stripped = stripped.replace(re, '');
  if (isCommentOrTestName(line)) {
    for (const re of COMMENT_ONLY_ALLOW) stripped = stripped.replace(re, '');
  }
  return !/wavemax/i.test(stripped);
}

// The guard exists to catch a franchisor brand/domain leak. Before trusting any
// INFRA_ALLOW row, prove the guard still FAILS on the leaks that matter — an
// allowlist entry that strips the plain domain form silently disarms it.
// (It did, from d00763f3 until Plan 3 task 38's follow-up: the row was
// /wavemaxlaundry\.com/gi, which strips the real thing as readily as a matcher.)
describe('branding guard can still fail', () => {
  const MUST_BE_CAUGHT = [
    ['a plain franchisor URL in source', 'const x = "https://www.wavemaxlaundry.com/austin-tx";'],
    ['a franchisor link in a template', '<a href="https://wavemaxlaundry.com">Home</a>'],
    ['a franchisor redirect', 'res.redirect("https://www.wavemaxlaundry.com" + p);'],
    ['the bare franchisor mark', 'Powered by WaveMAX'],
    ['the full franchisor mark', 'WaveMAX Laundry'],
    ['another franchisor TLD', 'https://wavemaxlaundry.net'],
    ['the retired cookie, hyphen form', 'wavemax-sid']
  ];
  test.each(MUST_BE_CAUGHT)('flags %s', (_name, sample) => {
    expect(isInfraOnly(sample)).toBe(false);
  });

  const MUST_BE_ALLOWED = [
    ['the permitted business name', 'WaveMAX Austin is the fulfillment partner'],
    ['an ESCAPED domain inside an absence matcher', 'expect(SRC).not.toMatch(/wavemaxlaundry\\.com/i);'],
    ['the domain named in a // comment', '  // no file under server/ contains wavemaxlaundry.com'],
    ['the domain named in a test name', "  it('server/ contains no wavemaxlaundry.com', () => {"],
    ['the domain in a # comment', '#   https://wavemaxlaundry.com/*']
  ];

  // The comment allowance must NOT leak into code: the same text, as code, fails.
  it('the comment allowance does not cover the same string in code', () => {
    expect(isInfraOnly('  // see wavemaxlaundry.com')).toBe(true);
    expect(isInfraOnly('  const u = "wavemaxlaundry.com";')).toBe(false);
  });
  test.each(MUST_BE_ALLOWED)('permits %s', (_name, sample) => {
    expect(isInfraOnly(sample)).toBe(true);
  });
});

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

  test('the migration baseline is fully drained', () => {
    expect([...baseline]).toEqual([]);
  });

  test('EXCLUDED_FILES has no entry naming a path that no longer exists', () => {
    // An exclusion row that outlives the file it excused is a hole with no reason
    // behind it: the next file to take that path is silently unguarded. Deleting a
    // file must delete its row in the same commit.
    const missing = [...EXCLUDED_FILES].filter((f) => !fs.existsSync(path.join(REPO, f)));
    expect(missing).toEqual([]);
  });
});
