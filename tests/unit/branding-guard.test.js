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
  // Austin marketing client JS — defers to Phase 4 with its embeds (Q3
  // consistency). Excludes austin-landing-init.js, austin-about-init.js,
  // austin-commercial-init.js, austin-contact-init.js, austin-fb-pixel.js,
  // austin-hibu-phone-swap.js, austin-host-mock*.js, austin-*-init.js, etc.
  'public/assets/js/austin-',
  // Franchise-subsystem client JS — franchisor marketing (Phase-4 defer, peers
  // of the excluded franchise-page-helpers.js). Excludes franchise-hero-rotator.js,
  // franchise-reviews-slider.js, franchise-page-helpers.js.
  'public/assets/js/franchise-',
  // ---- Phase-3 Task-10 deferred public subsystems ----
  // Franchise multi-tenant data (per-location franchisor records) — the Phase-4
  // franchise subsystem's data layer, not the affiliate app.
  'public/data/',
  // Stylesheets — CSS carries only class-name identifiers and franchisor CDN
  // URLs (Q1 code identifiers, deferred to Phase 4 with the asset rename); no
  // user-facing display TEXT lives in CSS.
  'public/assets/css/',
  // Franchisor content mirror (site-pages copy for the franchise subsystem).
  'public/content/',
];
const EXCLUDED_FILES = new Set([
  'server/middleware/accessGate.js', 'server/middleware/mediatorGate.js',
  'server/models/AccessGate.js', 'server/models/AccessWhitelist.js',
  'server/models/AccessClick.js', 'server/models/AccessRequest.js',
  'server/models/MediatorAccess.js',
  'server/controllers/franchiseController.js', 'server/routes/franchiseRoutes.js',
  'server/controllers/conciergeController.js', 'server/services/conciergeFaq.js',
  'server/config/domainSeoOverrides.js', 'server/config/franchisePreviewCopy.js',
  // Marketing/franchise + Austin-marketing client JS — referenced only by the
  // excluded franchisor/Austin pages; de-brand deferred to Phase 4 (controller-
  // verified). (franchise-hero-rotator.js / franchise-reviews-slider.js /
  // franchise-page-helpers.js are covered by the 'public/assets/js/franchise-' prefix.)
  'public/assets/js/corporate-chrome.js', 'public/assets/js/network-reviews-init.js',
  'public/assets/js/self-serve-laundry-modern.js', 'public/assets/js/self-serve-translations.js',
  'public/assets/js/seo-config-self-serve.js', 'public/assets/js/seo-config-wash-dry-fold.js',
  'public/assets/js/wash-dry-fold-translations.js',
  'public/franchise.html', 'public/franchise-host.html',
  'public/why-invest-in-wavemax.html', 'public/wavemax-vs-zombiemat.html',
  'public/wavemax-affiliate.html', 'public/about.html', 'public/testimonials.html',
  'public/faq.html', 'public/contact.html', 'public/virtual-tour.html',
  'public/become-a-franchisee.html', 'public/laundromat-investment-guide.html',
  'public/wavemaxlaundry-embed-code.html', 'public/wavemaxlaundry-embed-code-complete.html',
  'public/iframe-parent-example.html', 'public/iframe-parent-example-complete.html',
  'public/products-placeholder.html',
  // Austin marketing embeds — raw/SPA-served SEO surfaces (hardcoded title/meta/
  // og cannot be server-substituted on the static path). De-brand deferred with
  // the rest of the Austin reference build (Phase 4 / marketing-content pass).
  'public/about-us-embed.html', 'public/austin-landing-v3-embed.html',
  'public/commercial-embed.html', 'public/contact-embed.html',
  'public/self-serve-laundry-embed.html', 'public/wash-dry-fold-embed.html',
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
  // Franchisor / franchise-preview / GBP / network-reviews / corporate-inquiry
  // marketing subsystems — not the affiliate app; they name the real WaveMAX
  // franchisor mark in marketing/legal copy. De-brand deferred to Phase 4
  // (peers of the already-excluded franchiseController/franchisePreviewCopy).
  'server/middleware/partnerLanding.js', 'server/models/FranchisePreviewRequest.js',
  'server/services/corporateInquiryService.js', 'server/services/franchisePreviewEmail.js',
  'server/services/franchisePreviewPages.js', 'server/services/franchisePreviewRender.js',
  'server/services/gbpService.js', 'server/services/gbpToLocationData.js',
  'server/services/networkReviewsService.js', 'scripts/create-franchise-preview.js',
  'scripts/ops/refresh-hibu.sh', 'tools/flyers/build-flyers.js',
  // Build script whose only marks are the wavemax-*.css asset filenames (Phase-4
  // asset rename). Excluded rather than allowlisting the filename globally, which
  // would also mask the same filename in tests/integration/assetCaching.test.js.
  'scripts/build-assets.js',
  // Proprietary LICENSE names the CRHS/WaveMAX marks verbatim (legal text) +
  // dev-persona doc — both kept literal.
  'LICENSE', 'init.prompt',
  // ---- Phase-3 Task-9 test-fixture reconciliation ----
  // Tests bound to already-excluded, Phase-4-deferred subsystems — they assert on
  // the real WaveMAX mark that their (excluded) source still emits. De-brand these
  // together with their subsystems in Phase 4.
  //   Franchise-preview + GBP (peers of franchiseController/franchisePreview*/gbp*):
  'tests/integration/franchisePreview.e2e.test.js', 'tests/unit/franchisePreview.test.js',
  'tests/unit/franchisePreviewEmail.test.js', 'tests/unit/franchisePreviewRender.test.js',
  'tests/unit/gbpService.test.js', 'tests/unit/gbpToLocationData.test.js',
  //   Partner-landing middleware (excluded partnerLanding.js) + its no-brand guard:
  'tests/unit/partnerLanding.test.js',
  //   crhsent sales page served at /wavemax/ (excluded crhsent/ tree + mediatorGate):
  'tests/integration/crhsentCsp.test.js',
  //   Austin marketing reference build (peers of the excluded wash-dry-fold-embed.html
  //   + wavemax-theme.css / wavemax-components.css asset rename, all Phase-4):
  'tests/e2e/austin-reference/wash-dry-fold.spec.js',
  // Guard-style tests whose /wavemax/i absence-matcher is load-bearing (asserts the
  // page carries NO brand) — allowlisted like i18n-brand-token.test.js above.
  'tests/unit/affiliateApplicationForm.test.js', 'tests/unit/partnerInquiryForm.test.js',
  // Security-control test: asserts 'wavemax' stays in the weak-password blocklist
  // (source passwordValidator.js is excluded for the same reason — a control, not copy).
  'tests/unit/passwordValidator.test.js',
  // ---- Phase-3 Task-10 corporate-content locales ----
  // crhsent/corporate-chrome translations — the corporate subsystem's copy
  // (peers of the excluded corporate-chrome.js + crhsent/ tree). The affiliate
  // app's common.json locales stay guarded and are already clean.
  'public/locales/en/corporate.json', 'public/locales/es/corporate.json',
  'public/locales/pt/corporate.json', 'public/locales/de/corporate.json',
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
  // Thermal bag-label logo asset filename (Phase-4 asset rename).
  /logo-wavemax-thermal\.png/gi,
  // .gitignore audit-doc path prefixes (match real filenames on disk).
  /wavemaxlaundry-site-audit/gi, /wavemax-promo-prelaunch-audit/gi,
  // Mediator gate URL + its clickjacking-demo content path (functional routes).
  /crhsent\.com\/wavemax/gi, /\/wavemax\/clickjacking-demo\.html/gi,
  // Ad-funnel affiliate route slug + page filename, and the two franchise
  // marketing page slugs (functional route/filename literals; pages themselves
  // are excluded). Slug form only — display copy uses spaced "WaveMAX …".
  /\/wavemax-affiliate/gi, /wavemax-affiliate\.html/gi,
  /why-invest-in-wavemax/gi, /wavemax-vs-zombiemat/gi,
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
