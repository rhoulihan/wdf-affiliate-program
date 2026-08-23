# Phase 4a — Domain Migration + Identifier Renames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire `wavemax.promo` as the app's canonical host in favor of `portal.atxwashdryfold.com` (subdomain, root-relative) with an indefinite 301 alias, and rename the residual non-display WaveMAX identifiers (cookie, JWT iss/aud, log tag) + WaveMAX-named asset files and styling CSS classes.

**Architecture:** Two workstreams by cutover-coupling — **W1 (atomic cutover):** host/identity code (`BASE_URL`, `allowedHosts`+301, CSP self-origins, session cookie, JWT iss/aud, log tag, email FROM, robots/sitemap/security.txt, `package.json`). **W2 (independent):** asset-file + styling-CSS-class renames. A **domain guard** test is the regression net. The nginx/CF/DNS provisioning + the production cutover are an **ops runbook** executed at deploy (with user confirmation), NOT SDD tasks.

**Tech Stack:** Node/Express, Mongoose, Jest+Supertest, terser/csso asset build.

**Spec:** [`docs/superpowers/specs/2026-08-23-phase4a-domain-migration-design.md`](../specs/2026-08-23-phase4a-domain-migration-design.md)

## Global Constraints

- **App-scope only.** Do NOT touch `public/data/franchises/**`, the franchise/corporate subsystems, Austin marketing, design-explorer, or `docs/**`/`*.md` — those `wavemax.promo`/WaveMAX refs are deferred to 4b. The domain guard's exclusion set enforces this.
- **Left as-is:** Mongo DB name `wavemax`, Firebase project id `wavemax-bag-registration`, the PM2 process name.
- **New host:** `portal.atxwashdryfold.com`. **Email FROM:** `no-reply@crhsent.com`. **Cookie:** `portal.sid`/`__Host-portal.sid`. **JWT iss/aud:** `crhs-portal-api`/`crhs-portal-client`. **Log service tag:** `crhs-portal`.
- **JWT rename is COSMETIC** — `jwt.verify` (auth.js:50, scanAuth.js:43, bagController.js:84) checks only `algorithms:['HS256']`; it does NOT enforce iss/aud. Do NOT add enforcement (out of scope). No "old token rejected" behavior.
- **Keep as allowlisted functional tokens (do NOT rename in W2):** the postMessage `source:'wavemax-embed'`, the `localStorage` key `'wavemax-language'`, and the iframe DOM id `wavemax-iframe` — these are cross-frame/storage/parent-page protocol contracts (parents that host the iframe live in excluded files). Renaming is a coordinated protocol change for a later pass.
- **TDD.** Red → green. Tests run clean (no new `--forceExit` regressions beyond the pre-existing baseline). The pre-existing `crhsentCsp` test is already fixed (main `c00c49bd`).
- **No display-brand change** — production stays `BRAND_DISPLAY_NAME="WaveMAX Austin"`; this migration is host + identifiers only.
- **Backward-compatible during transition** — keep the `wavemax.promo` hosts in `allowedHosts` (as 301 sources); the code must serve correctly on BOTH the old and new host until the ops cutover flips the 301.

---

## File Structure

**New:**
- `tests/integration/domainMigration.test.js` — host-canonicalization + cookie/JWT/email assertions.
- `tests/unit/domain-guard.test.js` + `tests/fixtures/domain-guard-baseline.json` — the shrinking regression net for app-scope `wavemax.promo` + renamed identifiers.
- `docs/development/PHASE4A-CUTOVER-RUNBOOK.md` — the ops runbook (§4.9 of the spec), for the deploy step.

**Modified (W1):** `server.js` (allowedHosts+301, CSP, cookie), `server/services/authTokenService.js` (JWT iss/aud), `server/utils/logger.js` (service tag), `.env.example` (BASE_URL/EMAIL_FROM docs), `public/.well-known/security.txt`, the robots/sitemap origin route, `package.json`.

**Modified (W2):** the 8 `wavemax-*.css` files + 3 images (renamed) + their ~130 refs across `public/*.html` + `public/assets/**`, `scripts/build-assets.js`, and the styling `wavemax-*` CSS class occurrences.

---

## Task 1: Domain guard + baseline (red-first net)

**Files:** Create `tests/unit/domain-guard.test.js`, `tests/fixtures/domain-guard-baseline.json`.

**Interfaces:** Produces the guard every W1/W2 task keeps green by shrinking the baseline. No code imports it.

The guard greps tracked files (case-insensitive) for the migration targets — `wavemax\.promo`, `wavemax\.sid`, `wavemax-api`, `wavemax-client`, `service: 'wavemax-affiliate'`, `logo-wavemax`, `wavemax-*.css` — and fails on any hit that is NOT (a) under an excluded path, (b) an allowlisted functional/deliberate token, or (c) in the baseline. The baseline starts listing every currently-flagged app-scope file; W1/W2 tasks remove files as they clean them; Task 10 asserts it is empty.

- [ ] **Step 1: Write the guard test.**

```js
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
```

- [ ] **Step 2: Generate the initial baseline** (same exclusion/allow logic) — a one-off node script mirroring the test's `excluded`/`allowedOnly`/`TARGET`; write the flagged app-scope file list to `tests/fixtures/domain-guard-baseline.json`. Report the count.

- [ ] **Step 3: Prove red** — empty the baseline → `npm test -- tests/unit/domain-guard.test.js` fails with the offender list. Restore the generated baseline.

- [ ] **Step 4: Green** — `npm test -- tests/unit/domain-guard.test.js` passes (2/2).

- [ ] **Step 5: Commit.** `git add tests/unit/domain-guard.test.js tests/fixtures/domain-guard-baseline.json && git commit -m "test(4a): domain-migration guard + baseline"`

---

## Task 2: Host allowlist + canonical 301

**Files:** Modify `server.js:177-199` (allowedHosts + redirect). Test: `tests/integration/domainMigration.test.js` (new).

**Interfaces:** Produces the canonical-host redirect consumed by acceptance.

- [ ] **Step 1: Write the failing test.**

```js
'use strict';
const request = require('supertest');
const app = require('../../server');
describe('4a host canonicalization', () => {
  const asHost = (h, url = '/embed-app-v2.html') =>
    request(app).get(url).set('Host', h).set('X-Forwarded-Proto', 'https');
  test('wavemax.promo 301s to portal.atxwashdryfold.com, path+query preserved', async () => {
    const res = await asHost('wavemax.promo', '/claim-embed.html?bag=abc');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('https://portal.atxwashdryfold.com/claim-embed.html?bag=abc');
  });
  test('www./affiliate. wavemax.promo also 301', async () => {
    for (const h of ['www.wavemax.promo', 'affiliate.wavemax.promo']) {
      const r = await asHost(h);
      expect(r.status).toBe(301);
      expect(r.headers.location).toBe('https://portal.atxwashdryfold.com/embed-app-v2.html');
    }
  });
  test('portal.atxwashdryfold.com is served, not redirected', async () => {
    const r = await asHost('portal.atxwashdryfold.com');
    expect(r.status).toBe(200);
  });
});
```
(Set `NODE_ENV=production` context as the suite requires; if the app only wires the redirect under production, gate the test with the same env the existing host tests use — check `tests/` for the established pattern.)

- [ ] **Step 2: Run → fail.** `npm test -- tests/integration/domainMigration.test.js`

- [ ] **Step 3: Implement.** In `server.js`, add `'portal.atxwashdryfold.com'` to `allowedHosts` (line ~180). Add a **canonical-host redirect** middleware immediately after the existing HTTPS-redirect block (~line 199), running in production:

```js
// Retire wavemax.promo → 301 to the portal host (path + query preserved).
const RETIRED_HOSTS = new Set(['wavemax.promo', 'www.wavemax.promo', 'affiliate.wavemax.promo']);
app.use((req, res, next) => {
  const host = (req.header('host') || '').toLowerCase();
  if (RETIRED_HOSTS.has(host)) {
    return res.redirect(301, `https://portal.atxwashdryfold.com${req.originalUrl}`);
  }
  next();
});
```
Keep the retired hosts in `allowedHosts` so the HTTPS-upgrade step still accepts them before this redirect runs.

- [ ] **Step 4: Green.** Run the test → pass. Write the retired-host literals as **quoted** strings (`'wavemax.promo'`, `'www.wavemax.promo'`, `'affiliate.wavemax.promo'`) so the guard's retired-host `ALLOW` pattern clears them. `server.js` stays baselined through Task 4 (it still has the cookie/CSP hits); run the guard (still green via baseline).

- [ ] **Step 5: Commit.**

---

## Task 3: CSP self-origins

**Files:** `server.js:398,399,483` (+ frame-ancestors directive).

- [ ] **Step 1:** Add `'https://portal.atxwashdryfold.com'` to the self-origin arrays in `img-src`, `connect-src`, and `frame-src`/`frame-ancestors`. Leave the existing `atxwashdryfold.com` + (transitional) `wavemax.promo` entries.
- [ ] **Step 2:** Add an assertion to `domainMigration.test.js`: a served response's `Content-Security-Policy` header includes `https://portal.atxwashdryfold.com` in `connect-src` and `frame-ancestors`. Run → green.
- [ ] **Step 3:** Guard green; commit.

---

## Task 4: Session cookie rename

**Files:** `server.js:660-661`.

- [ ] **Step 1: Failing test** in `domainMigration.test.js`: hitting a session-issuing route sets a cookie named `portal.sid` (or `__Host-portal.sid` under production), never `wavemax.sid`. (Use the established session-cookie test pattern; assert on `set-cookie`.)
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement.** Change the `sessionCookieName` ternary at `server.js:660-661`: `'__Host-wavemax.sid'` → `'__Host-portal.sid'`, `'wavemax.sid'` → `'portal.sid'`. Nothing else in the cookie config changes (`domain: undefined`, `path: '/'`, `secure`, `sameSite` stay).
- [ ] **Step 4: Green.** After this task, `server.js`'s only remaining migration-target hits are the quoted retired-host literals (cleared by the retired-host `ALLOW`) and the new `portal.atxwashdryfold.com` strings (not a target). Remove `server.js` from the baseline; run the guard (offenders empty). If it trips, a residual non-quoted `wavemax.promo` remains — fix it.
- [ ] **Step 5: Commit.**

---

## Task 5: JWT iss/aud + log service tag

**Files:** `server/services/authTokenService.js:42-43`, `server/utils/logger.js:27`.

- [ ] **Step 1: Failing test** in `domainMigration.test.js`: `require('../../server/services/authTokenService').generateToken({id:'x',role:'affiliate'})` → `jwt.decode` shows `iss:'crhs-portal-api'`, `aud:'crhs-portal-client'`.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement.** `authTokenService.js:42-43`: `issuer:'crhs-portal-api'`, `audience:'crhs-portal-client'`. `logger.js:27`: `service:'crhs-portal'`. (Do NOT touch the `jwt.verify` sites — they don't check iss/aud, and adding enforcement is out of scope per Global Constraints.)
- [ ] **Step 4: Green.** Confirm the existing auth/token tests still pass (`npm test -- tests/unit/auth* tests/integration/auth*` — adjust to real paths). Drain both files from the baseline. Guard green.
- [ ] **Step 5: Commit.**

---

## Task 6: Email FROM + env docs + robots/sitemap/security.txt + package.json

**Files:** `.env.example`, `public/.well-known/security.txt`, the robots/sitemap origin route, `package.json`. (`transport.js` already reads `EMAIL_FROM` — no code change; prod `.env` is set at deploy.)

- [ ] **Step 1:** `.env.example`: set `BASE_URL` to the `https://portal.atxwashdryfold.com` shape (with a generic example + comment noting prod), and `EMAIL_FROM` to the `no-reply@crhsent.com` shape.
- [ ] **Step 2:** `security.txt`: update the contact/canonical URLs off `wavemax.promo` (security contact → `crhsent.com`; app canonical → the new host). robots/sitemap origin route: app canonical URLs → `portal.atxwashdryfold.com`.
- [ ] **Step 3:** `package.json`: `name` → `wdf-affiliate-program`; fix `repository.url` to `git+https://github.com/rhoulihan/wdf-affiliate-program.git`.
- [ ] **Step 4:** Add a test to `domainMigration.test.js`: `transport` renders From `"WaveMAX Austin" <no-reply@crhsent.com>` when `EMAIL_FROM=no-reply@crhsent.com` (set the env in the test); and a rendered email template's links use `BASE_URL` (assert the host). Run → green.
- [ ] **Step 5:** Drain the touched files from the baseline; guard green; commit.

---

## Task 7: Asset-file renames (W2a)

**Files:** rename the 8 `wavemax-*.css` + `logo-wavemax.png`/`logo-wavemax-thermal.png`/`wavemax-affiliate-og.png`; update ~130 refs across `public/*.html` + `public/assets/**`; `scripts/build-assets.js` ASSETS array; rebuild `.min`.

**Rename map:** `wavemax-affiliate.css`→`affiliate.css`, `wavemax-components.css`→`components.css`, `wavemax-embed.css`→`embed.css`, `wavemax-mhr-chrome.css`→`mhr-chrome.css`, `wavemax-mhr-modal.css`→`mhr-modal.css`, `wavemax-theme.css`→`theme.css`, `logo-wavemax.png`→`logo.png`, `logo-wavemax-thermal.png`→`logo-thermal.png`, `wavemax-affiliate-og.png`→`affiliate-og.png`. (Flyer PDFs are guard-excluded; skip.)

- [ ] **Step 1:** `git mv` each file to its new name.
- [ ] **Step 2:** Update every reference (`href=`/`src=`/`url(...)`/`@import`/`content=` for og image) across `public/*.html` and `public/assets/**` (non-min). Bump the `?v=` cache-buster on each changed ref.
- [ ] **Step 3:** Update `scripts/build-assets.js` ASSETS array (the `wavemax-components.css`/`wavemax-mhr-chrome.css` rows → new names) and run `npm run build:assets`; stage the regenerated `.min` files.
- [ ] **Step 4:** Verify no dangling ref: `git grep -nE "logo-wavemax|wavemax-(affiliate|components|embed|mhr-chrome|mhr-modal|theme)\.css" -- public/ ':!*.min.*' ':!public/data/**'` returns only excluded-tree hits. Drain the touched files from the baseline; guard green.
- [ ] **Step 5:** Run the asset/caching integration tests (`npm test -- tests/integration/assetCaching*`); fix any that pin an old asset name. Commit.

---

## Task 8: Styling CSS-class renames (W2b)

**Files:** the styling `wavemax-*` classes across `public/*.html`, `public/assets/css/*.css`, `public/assets/js/*.js` (non-min); rebuild `.min` if a built source changes.

**Rename map (styling only; palette→`brand-*`, structural→semantic):** `wavemax-blue`→`brand-blue`, `wavemax-light-blue`→`brand-light-blue`, `wavemax-primary`→`brand-primary`, `wavemax-accent`→`brand-accent`, `wavemax-affiliate-container`→`portal-embed-container`, `wavemax-affiliate-header`→`portal-embed-header`, `wavemax-affiliate-ad`→`portal-ad`, `wavemax-affiliate-og`→`portal-og`, `wavemax-embed-container`→`portal-embed-shell`, `wavemax-mhr-chrome`→`mhr-chrome`, `wavemax-mhr-modal`→`mhr-modal`, `wavemax-modal-chrome`→`modal-chrome`, `wavemax-hibu-refresh`→`hibu-refresh`, `wavemax-accent`→`brand-accent`. Bare `wavemax-affiliate` (class) → `portal-embed`.

**KEEP (do NOT rename — allowlisted functional tokens):** the postMessage `source:'wavemax-embed'`, `localStorage` key `'wavemax-language'`, iframe DOM id `wavemax-iframe`, and the `wavemax-austin-affiliate-program` URL slug (nginx path — infra).

- [ ] **Step 1:** For each styling class in the rename map, replace every occurrence (definition + usage) across HTML/CSS/JS (non-min). Do a class at a time; after each, grep to confirm the old class name is gone from styling contexts and the new one is consistent.
- [ ] **Step 2:** Rebuild `.min` for any built source touched (`austin-landing-init.js`, the CSS bundles) via `npm run build:assets`.
- [ ] **Step 3:** Confirm the kept functional tokens are untouched (`git grep -nE "source: ?['\"]wavemax-embed|'wavemax-language'|wavemax-iframe"` still present). Drain the touched files from the baseline; guard green.
- [ ] **Step 4:** Commit.

---

## Task 9: Cutover runbook doc

**Files:** Create `docs/development/PHASE4A-CUTOVER-RUNBOOK.md`.

- [ ] **Step 1:** Write the ops runbook from spec §4.9: CF DNS for `portal.atxwashdryfold.com` (proxied, cert covers `*.atxwashdryfold.com`); nginx `server_name portal.atxwashdryfold.com` block on both OCI boxes (mirror the `wavemax.promo` block, `proxy_pass http://localhost:3000`); deploy code + set prod `.env` (`BASE_URL=https://portal.atxwashdryfold.com`, `EMAIL_FROM=no-reply@crhsent.com`); `pm2 reload wavemax --update-env`; verify (portal serves, `wavemax.promo/*` 301s, fresh login issues `portal.sid`, test email From/links); CF cache purge. Include the rollback (revert env, hold `wavemax.promo` serving) and the "one-time re-login" note.
- [ ] **Step 2:** Commit. (This doc is not test-gated; it's the deploy record.)

---

## Task 10: Finalize — guard drained, suite green

**Files:** `tests/fixtures/domain-guard-baseline.json` (→ `[]`), `tests/unit/domain-guard.test.js` (add empty-baseline assertion), rebuilt `.min`.

- [ ] **Step 1:** Ensure the baseline is `[]`. Add a third guard test: `expect([...baseline]).toEqual([])`.
- [ ] **Step 2:** `npm run build:assets` (final); stage any `.min` changes.
- [ ] **Step 3:** Acceptance greps: `git grep -nE "wavemax\.sid|wavemax-api|wavemax-client|service: 'wavemax-affiliate'|logo-wavemax|wavemax-(affiliate|components|embed|mhr-chrome|mhr-modal|theme)\.css"` over app scope → 0. `git grep -n 'wavemax\.promo'` over app scope → only the deliberate retired-host allowlist entries in `server.js`.
- [ ] **Step 4:** `npm test` (full, foreground/background per env) → green except the known pre-existing baseline (none expected now). Report totals.
- [ ] **Step 5:** Commit. **Then** the whole-branch final review.

---

## Notes for the executor

- **The production cutover is NOT in this plan's commits** — it's the runbook (Task 9) executed at deploy with user confirmation (CF/nginx/DNS + env + `pm2 reload`), after the branch merges. The code is backward-compatible on both hosts until the 301 flips.
- **Baseline discipline:** drain a file only when it has zero non-allowlisted migration-target hits; files spanning tasks stay baselined until the last one clears them (the guard's offender check catches premature removal).
- **`server.js` special case:** it legitimately retains the `wavemax.promo` retired-host literals (301 sources). These are written **quoted** so the guard's retired-host `ALLOW` pattern (`/['"]…wavemax\.promo['"]/`) clears them — `server.js` drains normally in Task 4. Task 10's acceptance grep for `wavemax.promo` in app scope therefore expects **only** those quoted retired-host literals.
