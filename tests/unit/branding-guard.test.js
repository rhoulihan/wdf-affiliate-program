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
  'public/design-explorer/',
  // Stylesheets — CSS carries only class-name identifiers and franchisor CDN
  // URLs (Q1 code identifiers, deferred to Phase 4 with the asset rename); no
  // user-facing display TEXT lives in CSS. Includes the kept wavemax-*.css
  // component/theme sheets used by the affiliate + marketing surfaces.
  'public/assets/css/',
];
const EXCLUDED_FILES = new Set([
  'server/middleware/accessGate.js', 'server/middleware/mediatorGate.js',
  'server/models/AccessGate.js', 'server/models/AccessWhitelist.js',
  'server/models/AccessClick.js', 'server/models/AccessRequest.js',
  'server/models/MediatorAccess.js',
  'server/controllers/conciergeController.js', 'server/services/conciergeFaq.js',
  // KEEP affiliate-recruitment marketing page — legitimately names the WaveMAX
  // affiliate program in its recruitment copy (retained through Phase 4b).
  'public/wavemax-affiliate.html',
  // Kept host-page sample that names the franchisor mark (products placeholder).
  'public/products-placeholder.html',
  'tests/unit/wavemaxAffiliatePage.test.js', 'tests/unit/accessGate.test.js',
  'tests/unit/mediatorGate.test.js', 'tests/unit/branding-guard.test.js',
  // Phase-4a domain-migration tooling — legitimately references wavemax.
  'tests/unit/domain-guard.test.js', 'tests/fixtures/domain-guard-baseline.json',
  'tests/integration/domainMigration.test.js',
  // Guard-style test that asserts the ABSENCE of the mark in locales — its
  // /wavemax/i matcher is load-bearing, so it is allowlisted like this file.
  'tests/unit/i18n-brand-token.test.js',
  // DB-name-only dev/admin scripts (infra: connect string names the ADB database).
  'scripts/seed-claim-bag.js', 'scripts/admin/delete-admin-operators.js',
  'scripts/diagnostics/check-data-distribution.js',
  // ---- Phase-3 Task-8 completion ----
  // Security blocklist: 'wavemax' must stay in the weak-password list to reject
  // the WaveMAX!2024 default credential — it is a control, not display copy.
  'server/utils/passwordValidator.js',
  // Partner-landing middleware — names the real WaveMAX franchisor mark in
  // marketing/legal copy; de-brand deferred to Phase 4 (marketing-content pass).
  'server/middleware/partnerLanding.js',
  'scripts/ops/refresh-hibu.sh', 'tools/flyers/build-flyers.js',
  // Build script whose only marks are the wavemax-*.css asset filenames (Phase-4
  // asset rename). Excluded rather than allowlisting the filename globally, which
  // would also mask the same filename in tests/integration/assetCaching.test.js.
  'scripts/build-assets.js',
  // Proprietary LICENSE names the CRHS/WaveMAX marks verbatim (legal text) +
  // dev-persona doc — both kept literal.
  'LICENSE', 'init.prompt',
  //   Partner-landing middleware (excluded partnerLanding.js) + its no-brand guard:
  'tests/unit/partnerLanding.test.js',
  //   crhsent sales page served at /wavemax/ (excluded crhsent/ tree + mediatorGate):
  'tests/integration/crhsentCsp.test.js',
  // Guard-style tests whose /wavemax/i absence-matcher is load-bearing (asserts the
  // page carries NO brand) — allowlisted like i18n-brand-token.test.js above.
  'tests/unit/affiliateApplicationForm.test.js', 'tests/unit/partnerInquiryForm.test.js',
  // Security-control test: asserts 'wavemax' stays in the weak-password blocklist
  // (source passwordValidator.js is excluded for the same reason — a control, not copy).
  'tests/unit/passwordValidator.test.js',
]);
const EXCLUDED_SUFFIXES = ['.min.js', '.min.css', '.md'];

// Infra identifiers — a line is OK if removing all of these leaves no bare "wavemax".
const INFRA_ALLOW = [
  /wavemax\.promo/gi, /mail\.wavemax/gi, /@wavemax\.promo/gi,
  /wavemaxlaundry\.com/gi, /wavemax-bag-registration/gi,
  /wavemax\.firebaseapp\.com/gi, /wavemax\.appspot\.com/gi,
  /wavemax_affiliate/gi, /wavemax-affiliate-program/gi,
  // Phase-4 deferred code identifiers — asset filenames, CSS class names, and
  // API/contact domains. These exact tokens never appear in display copy, so a
  // line carrying only them is not user-facing brand (the rename is Phase 4).
  /logo-wavemax\.png/gi, /wavemax-embed\.css/gi,
  /wavemax-blue/gi, /wavemax-affiliate-container/gi, /wavemax-affiliate-header/gi,
  /api\.wavemax\.com/gi, /support@wavemax\.com/gi, /legal@wavemax\.com/gi,
  // Trademark / proprietary legal notices kept VERBATIM (they name the real
  // franchisor mark + entity; mechanically tokenizing them is legally wrong).
  /WaveMAX is a trademark/gi, /WaveMAX™/gi, /the WaveMAX logo/gi,
  /WaveMAX Franchise, LLC/gi, /WaveMAX WDF Affiliate Portal/gi,
  // Client-JS infra identifiers (Task 6) — wire-protocol/postMessage source
  // tag, localStorage key, host-page DOM id, global bridge API name, and the
  // WordPress embed-page URL slug. These have functional bindings across the
  // iframe/host boundary (never display copy); renaming is a Phase-4 concern.
  /wavemax-embed/gi, /wavemax-language/gi, /wavemax-iframe/gi,
  /WaveMaxBridgeV3/gi, /wavemax-austin-affiliate-program/gi,
  // Franchisor CDN asset path (external image URLs on wavemaxlaundry.com's
  // upload host); appears only in src="…/UploadedImages/WaveMAX/…", never display.
  /UploadedImages\/WaveMAX\//gi,
  // ---- Phase-3 Task-8 completion — anchored infra/operational identifiers ----
  // MongoDB database name in local/docker connection strings + init.
  /localhost:27017\/wavemax/gi, /mongo:27017\/wavemax/gi,
  /MONGO_INITDB_DATABASE=wavemax/gi, /getSiblingDB\('wavemax'\)/gi,
  // Default seeded admin credential (kept literal; passwordValidator blocks it).
  /WaveMAX!2024/g,
  // PM2 live process name — in commands and in the ecosystem.config.js comment.
  /pm2 (?:start|restart|reload|stop|delete|logs) wavemax/gi, /'wavemax' name/gi,
  // Production deploy path on the app servers.
  /\/var\/www\/wavemax\//gi,
  // Session-cookie name + server.js corporate-origins code identifier.
  /wavemax\.sid/gi, /wavemaxDomains/g,
  // JWT issuer/audience claims (token validation depends on these values).
  /wavemax-api/gi, /wavemax-client/gi,
  // Winston log service tag (log-aggregation key).
  /service: 'wavemax-affiliate'/gi,
  // .gitignore audit-doc path prefixes (match real filenames on disk).
  /wavemaxlaundry-site-audit/gi, /wavemax-promo-prelaunch-audit/gi,
  // Mediator gate URL + its clickjacking-demo content path (functional routes).
  /crhsent\.com\/wavemax/gi, /\/wavemax\/clickjacking-demo\.html/gi,
  // Ad-funnel affiliate route slug + page filename, and the franchisor
  // "why-invest-in-wavemax" slug that survives as evidence text in
  // crhsent/wavemax/security-audit.html (the franchise marketing pages
  // themselves are deleted). Slug form only — display copy uses spaced "WaveMAX …".
  /\/wavemax-affiliate/gi, /wavemax-affiliate\.html/gi,
  /why-invest-in-wavemax/gi,
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

  test('the migration baseline is fully drained', () => {
    expect([...baseline]).toEqual([]);
  });
});
