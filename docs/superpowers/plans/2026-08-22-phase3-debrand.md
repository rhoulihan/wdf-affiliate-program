# Phase 3 De-branding (Brand Config) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every user-facing/generic literal "WaveMAX" from the monorepo's committed code, resolving the brand name at runtime from a single config source (`server/config/brand.js`); production sets it to "WaveMAX Austin" via env, and the repo itself contains no "WaveMAX" outside the explicitly-retained infra identifiers and the §7 excluded paths.

**Architecture:** A single env-sourced config module is the source of truth. Server-rendered pages and emails substitute placeholders (`{{BRAND_NAME}}`, `[BRAND_NAME]`) from that module; client pages read `window.BRAND` (set by a new `brand.js` from a `<meta name="brand-name">` tag with a `GET /api/v1/brand` fallback); i18n locale strings use a global `{{brandName}}` interpolation token. A red-first grep **guard test** with a shrinking baseline enforces zero un-allowlisted "WaveMAX" and keeps the suite green at every commit.

**Tech Stack:** Node.js/Express, Mongoose, Jest + Supertest, vanilla-JS i18n, terser/csso asset build.

**Spec:** [`docs/superpowers/specs/2026-08-22-debrand-brand-config-design.md`](../specs/2026-08-22-debrand-brand-config-design.md)

## Global Constraints

- **No behavior changes.** This is a branding-source refactor only.
- **Display value never in the repo.** The literal `"WaveMAX Austin"` must appear in **zero** committed files. It lives only in the production `.env` (`BRAND_DISPLAY_NAME`). `server/config/brand.js` defaults to the generic `"Laundromat"`.
- **Bucket rules (spec §2):**
  - **Display** brand text → resolves from config (`{{BRAND_NAME}}` / `window.BRAND.name` / `{{brandName}}`).
  - **Generic non-display** (comments, labels, logs, test fixtures) → the literal `"Laundromat"` (or `@laundromat.example` for fixture emails).
  - **Infra identifiers** → NOT changed (see the guard's `INFRA_ALLOW` list); the only exception is the PM2 app **name in code**, which becomes `process.env.PM2_APP_NAME || 'laundromat'`.
- **Exclusions (spec §7 + Phase-4 deferrals)** — never de-branded, guard-allowlisted by path: the `crhsent/**` tree; `accessGate`/`mediatorGate` + their 5 models; the franchise multi-tenant SEO subsystem (`public/franchise*.html`, `public/franchise-host.html`, `public/franchise-default/**`, `server/controllers/franchiseController.js`, `server/routes/franchiseRoutes.js`, `public/assets/js/franchise-page-helpers.js`, `scripts/franchise-build/**`, `server/config/domainSeoOverrides.js`, `server/config/franchisePreviewCopy.js`); the raw-served corporate/marketing pages (`about.html`, `testimonials.html`, `faq.html`, `contact.html`, `virtual-tour.html`, `become-a-franchisee.html`, `laundromat-investment-guide.html`, and the three named about-franchisor pages); `public/design-explorer/**`; `public/dev/**`; dev/integration demo pages (`wavemaxlaundry-embed-code*.html`, `iframe-parent-example*.html`, `products-placeholder.html`); `docs/**`; `**/*.md`; and the three franchisor/gate test files.
- **i18n parity.** All four locale files (`en`/`es`/`pt`/`de`) stay structurally parallel (1355 keys each); every brand change lands in all four in the same task.
- **TDD.** Red → green → refactor. Tests run clean without `--forceExit`.
- **Asset build.** After editing any source that has a `.min` output (only `public/assets/js/embed-app-v2.js` in this plan), run `npm run build:assets` and commit both. `i18n.js` and `brand.js` are served **unminified** — no build step.
- **Copyright literal** stays `© <year> CRHS Enterprises, LLC` — resolved via `{{brandLegal}}`/`brand.legalName` (= `"CRHS Enterprises, LLC"`), never the display brand.
- `logger` only in `server/` (`console.*` is ESLint-blocked). GET endpoints are CSRF-exempt automatically (`csrf-config.js:191`); no wiring needed for the public brand route.

---

## File Structure

**New files:**
- `server/config/brand.js` — the brand source of truth (env-sourced, generic defaults).
- `server/routes/brandRoute.js` — `GET /api/v1/brand` → `{ displayName, shortName }`.
- `public/assets/js/brand.js` — client bootstrap: sets `window.BRAND` from `<meta name="brand-name">` or `/api/v1/brand`.
- `tests/unit/branding-guard.test.js` — the grep guard.
- `tests/fixtures/branding-guard-baseline.json` — the shrinking allowlist of not-yet-converted files.
- `tests/unit/brand-config.test.js` — brand.js unit test.
- `tests/integration/brand-endpoint.test.js` — the endpoint + injection integration test.

**Modified (infra/wiring):**
- `server/utils/cspHelper.js` — add brand placeholder substitution + `<meta name="brand-name">` fill to `injectNonce`.
- `public/assets/js/i18n.js` — merge `globalParams` in `t()`; seed `brandName` in `init()`.
- `public/embed-app-v2.html` — load `brand.js`; add `<meta name="brand-name" content="">`.
- `public/assets/js/embed-app-v2.js` (+ rebuilt `.min.js`) — only if a brand literal is found there.
- `server/services/email/template-manager.js` — `fillTemplate` auto-injects `BRAND_NAME`/`BRAND_LEGAL`.
- `server.js` — mount `brandRoute`; convert the three raw legal routes to `serveHTMLWithNonce`.
- `ecosystem.config.js` — `name: process.env.PM2_APP_NAME || 'laundromat'`.

**Modified (content batches):** the four locale JSONs, ~28 in-scope HTML files, the in-scope `public/assets/js/*.js`, the email templates + dispatchers, `.env.example`, `package.json`, `server/models/SystemConfig.js`, and the fixture-email test files.

---

## Task 1: Branding guard test + baseline (the red-first net)

**Files:**
- Create: `tests/unit/branding-guard.test.js`
- Create: `tests/fixtures/branding-guard-baseline.json`

**Interfaces:**
- Produces: the guard test that every later task keeps green by shrinking the baseline. No code imports from it.

The guard greps tracked files for `wavemax` (case-insensitive), then for each hit LINE decides: allowed if the path matches an excluded-path prefix, OR the line contains only infra identifiers, OR the file is listed in the baseline. Anything else is an offender. The baseline starts listing every in-scope file that currently has a convertible hit; each later task removes files it has cleaned. Over-removal ⇒ offenders ⇒ immediate red. Task 10 asserts the baseline is empty.

- [ ] **Step 1: Write the baseline generator inline in the test and the test itself.**

Create `tests/unit/branding-guard.test.js`:

```js
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
  'public/design-explorer/', 'public/franchise-default/', 'public/dev/',
  'scripts/franchise-build/',
];
const EXCLUDED_FILES = new Set([
  'server/middleware/accessGate.js', 'server/middleware/mediatorGate.js',
  'server/models/AccessGate.js', 'server/models/AccessWhitelist.js',
  'server/models/AccessClick.js', 'server/models/AccessRequest.js',
  'server/models/MediatorAccess.js',
  'server/controllers/franchiseController.js', 'server/routes/franchiseRoutes.js',
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
  'tests/unit/mediatorGate.test.js',
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
```

- [ ] **Step 2: Generate the initial baseline from today's tree.**

Run this one-off to produce the baseline (it applies the SAME exclusion + infra logic, so the baseline lists exactly the files the guard would otherwise flag):

```bash
node -e '
const {execSync}=require("child_process");
const EXPRE=["crhsent/","dc_private/","docs/","node_modules/",".git/","public/design-explorer/","public/franchise-default/","public/dev/","scripts/franchise-build/"];
const EXF=new Set(["server/middleware/accessGate.js","server/middleware/mediatorGate.js","server/models/AccessGate.js","server/models/AccessWhitelist.js","server/models/AccessClick.js","server/models/AccessRequest.js","server/models/MediatorAccess.js","server/controllers/franchiseController.js","server/routes/franchiseRoutes.js","server/config/domainSeoOverrides.js","server/config/franchisePreviewCopy.js","public/assets/js/franchise-page-helpers.js","public/franchise.html","public/franchise-host.html","public/why-invest-in-wavemax.html","public/wavemax-vs-zombiemat.html","public/wavemax-affiliate.html","public/about.html","public/testimonials.html","public/faq.html","public/contact.html","public/virtual-tour.html","public/become-a-franchisee.html","public/laundromat-investment-guide.html","public/wavemaxlaundry-embed-code.html","public/wavemaxlaundry-embed-code-complete.html","public/iframe-parent-example.html","public/iframe-parent-example-complete.html","public/products-placeholder.html","tests/unit/wavemaxAffiliatePage.test.js","tests/unit/accessGate.test.js","tests/unit/mediatorGate.test.js","scripts/seed-claim-bag.js","scripts/admin/delete-admin-operators.js","scripts/diagnostics/check-data-distribution.js"]);
const EXS=[".min.js",".min.css",".md"];
const INFRA=[/wavemax\.promo/gi,/mail\.wavemax/gi,/@wavemax\.promo/gi,/wavemaxlaundry\.com/gi,/wavemax-bag-registration/gi,/wavemax\.firebaseapp\.com/gi,/wavemax\.appspot\.com/gi,/wavemax_affiliate/gi,/wavemax-affiliate-program/gi];
const exP=p=>EXF.has(p)||EXPRE.some(x=>p.startsWith(x))||EXS.some(x=>p.endsWith(x));
const infra=l=>{let s=l;for(const r of INFRA)s=s.replace(r,"");return !/wavemax/i.test(s);};
const raw=execSync("git grep -inI wavemax -- . \":!tests/fixtures/branding-guard-baseline.json\"",{encoding:"utf8",maxBuffer:32*1024*1024}).trim().split("\n");
const files=new Set();
for(const l of raw){const m=l.match(/^([^:]+):(\d+):(.*)$/);if(!m)continue;const[,f,,c]=m;if(exP(f))continue;if(infra(c))continue;files.add(f);}
require("fs").writeFileSync("tests/fixtures/branding-guard-baseline.json",JSON.stringify([...files].sort(),null,2)+"\n");
console.log("baseline files:",files.size);
'
```

- [ ] **Step 3: Prove the net is real (temporarily empty the baseline → red).**

Run: `node -e 'require("fs").writeFileSync("tests/fixtures/branding-guard-baseline.json","[]\n")'` then `npm test -- tests/unit/branding-guard.test.js`
Expected: FAIL — the first test reports a long `offenders` list (this is the net catching today's tree). Then restore the generated baseline: re-run Step 2.

- [ ] **Step 4: Run the guard green with the full baseline.**

Run: `npm test -- tests/unit/branding-guard.test.js`
Expected: PASS (both tests). Every current hit is either excluded, infra-only, or baselined.

- [ ] **Step 5: Commit.**

```bash
git add tests/unit/branding-guard.test.js tests/fixtures/branding-guard-baseline.json
git commit -m "test(phase3): add branding guard + baseline (red-first de-brand net)"
```

---

## Task 2: Brand config module + public endpoint

**Files:**
- Create: `server/config/brand.js`
- Create: `server/routes/brandRoute.js`
- Modify: `server.js` (mount near line 996, beside the other config routes)
- Create: `tests/unit/brand-config.test.js`
- Create: `tests/integration/brand-endpoint.test.js`

**Interfaces:**
- Produces: `require('../config/brand')` → `{ displayName, shortName, legalName, instanceName }` (all strings). Used by Tasks 3, 7, 8.
- Produces: `GET /api/v1/brand` → `200 { displayName, shortName }`. Consumed by `public/assets/js/brand.js` (Task 3).

- [ ] **Step 1: Write the failing unit test.**

Create `tests/unit/brand-config.test.js`:

```js
'use strict';
describe('brand config', () => {
  const KEYS = ['BRAND_DISPLAY_NAME', 'BRAND_SHORT_NAME', 'BRAND_LEGAL_NAME', 'BRAND_INSTANCE_NAME'];
  let saved;
  beforeEach(() => { saved = {}; KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; }); jest.resetModules(); });
  afterEach(() => { KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); });

  test('defaults are generic (no "WaveMAX" in code)', () => {
    const brand = require('../../server/config/brand');
    expect(brand.displayName).toBe('Laundromat');
    expect(brand.shortName).toBe('Laundromat');
    expect(brand.legalName).toBe('CRHS Enterprises, LLC');
    expect(brand.instanceName).toBe('laundromat');
  });

  test('env overrides the display value', () => {
    process.env.BRAND_DISPLAY_NAME = 'Acme Wash'; // neutral non-default; the real prod value never lands in a committed file
    jest.resetModules();
    const brand = require('../../server/config/brand');
    expect(brand.displayName).toBe('Acme Wash');
  });
});
```

- [ ] **Step 2: Run it → fail (module not found).**

Run: `npm test -- tests/unit/brand-config.test.js` — Expected: FAIL, "Cannot find module '../../server/config/brand'".

- [ ] **Step 3: Create `server/config/brand.js`.**

```js
'use strict';
// Brand source of truth. Env-sourced with generic defaults so the committed
// repo carries no franchisor mark; production .env sets BRAND_DISPLAY_NAME.
// legalName is the real owner (not the franchisor) and is always literal.
// Domain/email/DB identifiers are intentionally NOT here — Phase 4 owns them.

const displayName = process.env.BRAND_DISPLAY_NAME || 'Laundromat';
const shortName = process.env.BRAND_SHORT_NAME || 'Laundromat';
const legalName = process.env.BRAND_LEGAL_NAME || 'CRHS Enterprises, LLC';
const instanceName = process.env.BRAND_INSTANCE_NAME || 'laundromat';

module.exports = { displayName, shortName, legalName, instanceName };
```

- [ ] **Step 4: Run unit test → pass.** Run: `npm test -- tests/unit/brand-config.test.js` — Expected: PASS.

- [ ] **Step 5: Write the failing endpoint integration test.**

Create `tests/integration/brand-endpoint.test.js`:

```js
'use strict';
const request = require('supertest');
const app = require('../../server');

describe('GET /api/v1/brand', () => {
  test('returns displayName and shortName as public JSON', async () => {
    const res = await request(app).get('/api/v1/brand');
    expect(res.status).toBe(200);
    expect(typeof res.body.displayName).toBe('string');
    expect(typeof res.body.shortName).toBe('string');
    expect(res.body).not.toHaveProperty('legalName'); // endpoint exposes only display fields
  });
  test('is reachable under the legacy /api prefix too', async () => {
    const res = await request(app).get('/api/brand');
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 6: Run it → fail (404).** Run: `npm test -- tests/integration/brand-endpoint.test.js` — Expected: FAIL (status 404).

- [ ] **Step 7: Create `server/routes/brandRoute.js`** (mirror `firebaseConfigRoute.js`):

```js
'use strict';
// Public, unauthenticated brand endpoint. GET only, so CSRF is skipped
// automatically (csrf-config.js). Exposes ONLY display-safe fields.
const express = require('express');
const brand = require('../config/brand');

const router = express.Router();

router.get('/brand', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ displayName: brand.displayName, shortName: brand.shortName });
});

module.exports = router;
```

- [ ] **Step 8: Mount it in `server.js`** — add beside `firebaseConfigRoute` (server.js:996):

```js
apiV1Router.use('/', require('./server/routes/brandRoute'));
```

- [ ] **Step 9: Run endpoint test → pass.** Run: `npm test -- tests/integration/brand-endpoint.test.js` — Expected: PASS.

- [ ] **Step 10: Guard still green, then commit.**

Run: `npm test -- tests/unit/branding-guard.test.js` — Expected: PASS (new files carry no "wavemax").
```bash
git add server/config/brand.js server/routes/brandRoute.js server.js tests/unit/brand-config.test.js tests/integration/brand-endpoint.test.js
git commit -m "feat(phase3): brand config module + public GET /api/v1/brand"
```

---

## Task 3: Runtime injection wiring (server + client + i18n)

**Files:**
- Modify: `server/utils/cspHelper.js:12-44` (`injectNonce`)
- Create: `public/assets/js/brand.js`
- Modify: `public/assets/js/i18n.js:32-41` (`init`) and `:143` (`t`)
- Modify: `public/embed-app-v2.html` (head: add brand meta + brand.js)
- Test: `tests/unit/cspHelper.brand.test.js` (new), extend `tests/integration/brand-endpoint.test.js`

**Interfaces:**
- Consumes: `require('../config/brand')` (Task 2).
- Produces: `injectNonce(html, nonce)` also replaces `{{BRAND_NAME}}`, `{{BRAND_SHORT}}`, `{{BRAND_LEGAL}}` and fills `<meta name="brand-name" content="">`.
- Produces: `window.BRAND = { name, short }` set by `brand.js`; i18n global `brandName` token. Consumed by Tasks 4–6.

- [ ] **Step 1: Write the failing cspHelper test.**

Create `tests/unit/cspHelper.brand.test.js`:

```js
'use strict';
const { injectNonce } = require('../../server/utils/cspHelper');
const brand = require('../../server/config/brand');

describe('injectNonce brand substitution', () => {
  test('replaces brand placeholders and fills the brand-name meta', () => {
    const html = '<meta name="brand-name" content=""><title>{{BRAND_NAME}}</title><p>{{BRAND_SHORT}}/{{BRAND_LEGAL}}</p>';
    const out = injectNonce(html, 'abc123');
    expect(out).toContain(`<title>${brand.displayName}</title>`);
    expect(out).toContain(`${brand.shortName}/${brand.legalName}`);
    expect(out).toContain(`<meta name="brand-name" content="${brand.displayName}">`);
    expect(out).not.toContain('{{BRAND_NAME}}');
  });
});
```

- [ ] **Step 2: Run it → fail.** Run: `npm test -- tests/unit/cspHelper.brand.test.js` — Expected: FAIL (placeholders unreplaced).

- [ ] **Step 3: Extend `injectNonce`.** In `server/utils/cspHelper.js`, add `const brand = require('../config/brand');` at the top of the file (the path from `server/utils/` to `server/config/brand.js`). Brand substitution does not depend on the nonce, so insert this block at the very start of `injectNonce`, **above** the `if (!nonce) return html;` early-return:

```js
// Brand placeholders (resolve from server/config/brand.js).
html = html
  .replace(/\{\{BRAND_NAME\}\}/g, brand.displayName)
  .replace(/\{\{BRAND_SHORT\}\}/g, brand.shortName)
  .replace(/\{\{BRAND_LEGAL\}\}/g, brand.legalName);
// Fill the empty brand-name meta (mirror the csp-nonce meta fill).
html = html.replace(
  /<meta([^>]*name=["']brand-name["'][^>]*content=["'])["']([^>]*)>/gi,
  `<meta$1${brand.displayName}"$2>`
);
```

(The `<meta name="brand-name">` regex intentionally matches the empty-content form `content=""` and rewrites only the content, mirroring the existing csp-nonce meta fill at `cspHelper.js:38-41`.)

- [ ] **Step 4: Run cspHelper test → pass.** Run: `npm test -- tests/unit/cspHelper.brand.test.js` — Expected: PASS.

- [ ] **Step 5: Create `public/assets/js/brand.js`** (served unminified; no build row):

```js
/* Brand bootstrap — sets window.BRAND from the <meta name="brand-name"> tag
   (filled server-side on nonce-served pages) or GET /api/v1/brand (fallback
   for raw-served pages). Re-seeds i18n and re-translates if the value arrives
   after i18n has already initialized. */
(function () {
  'use strict';
  function apply(name, short) {
    window.BRAND = { name: name, short: short || name };
    if (window.i18n) {
      window.i18n.globalParams = Object.assign({}, window.i18n.globalParams, { brandName: name });
      if (typeof window.i18n.translatePage === 'function') {
        try { window.i18n.translatePage(); } catch (e) { /* i18n not ready */ }
      }
    }
  }
  var meta = document.querySelector('meta[name="brand-name"]');
  var fromMeta = meta && meta.getAttribute('content');
  if (fromMeta) { apply(fromMeta); return; }
  // No server-filled meta (raw page): fetch the value.
  try {
    fetch('/api/v1/brand', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.displayName) apply(d.displayName, d.shortName); })
      .catch(function () { /* leave i18n on its generic default */ });
  } catch (e) { /* fetch unavailable */ }
})();
```

- [ ] **Step 6: Seed the global token in `i18n.js`.**

At `public/assets/js/i18n.js:143`, change `return this.interpolate(value, params);` to:
```js
return this.interpolate(value, Object.assign({}, this.globalParams, params));
```
Inside `init(options)` (around line 32, after `Object.assign(this.config, options);` and before `loadLanguage`/`translatePage`), add:
```js
this.globalParams = Object.assign({}, this.globalParams, {
  brandName: (window.BRAND && window.BRAND.name) || 'Laundromat'
});
```

- [ ] **Step 7: Wire the SPA shell.** In `public/embed-app-v2.html` `<head>`: add `<meta name="brand-name" content="">` next to the csp-nonce meta (line ~37), and add `<script src="/assets/js/brand.js" defer></script>` right after the `mobile-utils.js` script (line ~28). (The `<title>` and body copy in this file are converted in Task 5.)

- [ ] **Step 8: Verify.** Run: `npm test -- tests/unit/cspHelper.brand.test.js tests/integration/brand-endpoint.test.js tests/unit/branding-guard.test.js` — Expected: all PASS (brand.js/i18n.js additions contain no "wavemax"; embed-app-v2.html still has its title literal → it stays in the baseline until Task 5).

- [ ] **Step 9: Commit.**
```bash
git add server/utils/cspHelper.js public/assets/js/brand.js public/assets/js/i18n.js public/embed-app-v2.html tests/unit/cspHelper.brand.test.js
git commit -m "feat(phase3): brand injection wiring (cspHelper + brand.js + i18n global token)"
```

---

## Task 4: Locale files → brand tokens (en/es/pt/de)

**Files:** Modify `public/locales/{en,es,pt,de}/common.json` (35 values each, identical line numbers). Modify `tests/fixtures/branding-guard-baseline.json` (remove the four locale files). Test: `tests/unit/i18n-brand-token.test.js` (new).

**Transform rules** (apply per value; the four files change in lockstep — same key in all four):
- Standalone brand → `{{brandName}}`. E.g. `landing.hero.badge` "Your Local WaveMAX Partner" → "Your Local {{brandName}} Partner".
- Compound with a common noun → keep the noun, tokenize the mark: `WaveMAX Laundry` → `{{brandName}} Laundry`; `WaveMAX Affiliate Program` → `{{brandName}} Affiliate Program`; `WaveMAX Associates` → `{{brandName}} Associates`; `WaveMAX-operated` → `{{brandName}}-operated`.
- **Copyright / legal ownership** phrasing → `{{brandLegal}}` (NOT brandName): `© 2024 WaveMAX Laundry. All rights reserved.` → `© 2024 {{brandLegal}}. All rights reserved.` (Affects `en/common.json:264` and the same line in es/pt/de.) Register `brandLegal` as a second global token.
- Preserve existing tokens in mixed strings (e.g. `en:287` already has `{{affiliateName}}` — keep it, tokenize only the brand).

- [ ] **Step 1: Add `brandLegal` to the i18n global seed.** In `i18n.js:init` (Task 3 Step 6 block), extend to also set `brandLegal: (window.BRAND && window.BRAND.legal) || 'CRHS Enterprises, LLC'`, and in `brand.js` `apply()` set `window.BRAND.legal` — but the endpoint does not expose legalName, so hardcode the legal default in `brand.js` (`window.BRAND.legal = 'CRHS Enterprises, LLC'`). Copyright is a fixed legal string, safe to keep client-side literal.

- [ ] **Step 2: Write the failing token-presence test.**

Create `tests/unit/i18n-brand-token.test.js`:
```js
'use strict';
const fs = require('fs');
const path = require('path');
const LANGS = ['en', 'es', 'pt', 'de'];
describe('locale brand tokens', () => {
  const load = (l) => fs.readFileSync(path.join(__dirname, `../../public/locales/${l}/common.json`), 'utf8');
  test('no locale value contains a bare "WaveMAX"', () => {
    for (const l of LANGS) expect(/wavemax/i.test(load(l))).toBe(false);
  });
  test('the brand token is present in every language', () => {
    for (const l of LANGS) expect(load(l)).toContain('{{brandName}}');
  });
  test('all four files stay structurally parallel', () => {
    const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]);
    const en = keys(JSON.parse(load('en'))).sort();
    for (const l of ['es', 'pt', 'de']) expect(keys(JSON.parse(load(l))).sort()).toEqual(en);
  });
});
```

- [ ] **Step 3: Run it → fail.** Run: `npm test -- tests/unit/i18n-brand-token.test.js` — Expected: FAIL (bare WaveMAX present).

- [ ] **Step 4: Apply the transform to all 35 values in each of the four files.** Use the rules above. The 35 line numbers are identical across languages (152, 159, 264, 268, 274, 284, 287, 289, 320, 353, 358, 377, 395, 396, 451, 468, 470, 473, 475, 484, 495, 563, 592, 701, 726, 1197, 1207, 1209, 1210, 1212, 1213, 1214, 1215, 1317, 1405). Keep JSON valid (no key/structure changes).

- [ ] **Step 5: Run token test → pass.** Run: `npm test -- tests/unit/i18n-brand-token.test.js` — Expected: PASS.

- [ ] **Step 6: Remove the four locale files from the baseline; run guard.**

Edit `tests/fixtures/branding-guard-baseline.json` to drop `public/locales/{en,es,pt,de}/common.json`. Run: `npm test -- tests/unit/branding-guard.test.js tests/unit/i18n-brand-token.test.js` — Expected: PASS.

- [ ] **Step 7: Commit.**
```bash
git add public/locales public/assets/js/brand.js public/assets/js/i18n.js tests/unit/i18n-brand-token.test.js tests/fixtures/branding-guard-baseline.json
git commit -m "i18n(phase3): tokenize brand in all four locales ({{brandName}}/{{brandLegal}})"
```

---

## Task 5: In-scope HTML display → placeholders / generic fallbacks

**Files:** Modify the ~28 in-scope HTML files (list below). Modify `server.js` (three legal routes → `serveHTMLWithNonce`). Modify `tests/fixtures/branding-guard-baseline.json`. If `public/assets/js/embed-app-v2.js` holds a brand literal, edit it and rebuild.

**In-scope files** (from `git grep`, minus excluded): `embed-app-v2.html`, `embed-landing.html`, `affiliate-landing-embed.html`, `affiliate-login-embed.html`, `affiliate-register-embed.html`, `affiliate-success-embed.html`, `affiliate-dashboard-embed.html`, `administrator-login-embed.html`, `administrator-dashboard-embed.html`, `operator-login-embed.html`, `operator-scan-embed.html`, `claim-embed.html`, `order-expediter-embed.html`, `forgot-password-embed.html`, `reset-password-embed.html`, `scanbag.html`, `monitoring-dashboard.html`, `email-verified.html`, `about-us-embed.html`, `austin-landing-v3-embed.html`, `commercial-embed.html`, `contact-embed.html`, `self-serve-laundry-embed.html`, `wash-dry-fold-embed.html`, `site-page-content-only.html`, `terms-and-conditions.html`, `terms-and-conditions-embed.html`, `privacy-policy.html`, `refund-policy.html`.

**Transform rules per file:**
1. `<title>WaveMAX …</title>` → `<title>{{BRAND_NAME}} …</title>` (e.g. `Operator Scanner - WaveMAX` → `Operator Scanner - {{BRAND_NAME}}`; `WaveMAX Affiliate Program` → `{{BRAND_NAME}} Affiliate Program`).
2. `<meta name="description" content="…WaveMAX…">` → `{{BRAND_NAME}}`.
3. Add `<meta name="brand-name" content="">` to the `<head>` of every file that doesn't yet have one, so `injectNonce` fills it (nonce-served pages) and `brand.js` reads it.
4. **`data-i18n` fallback text** (the visible text between tags that i18n overwrites): replace the literal "WaveMAX" with the generic word **"Laundromat"** (it only flashes pre-translation; runtime i18n replaces it with the real brand). Do NOT put `{{brandName}}` in raw HTML text (it is not interpolated outside i18n values).
5. **Hardcoded visible brand not under `data-i18n`** (e.g. `data-i18n-exclude` testimonials, static headers): on **nonce-served** pages use `{{BRAND_NAME}}`; on any page also add `brand.js` so `window.BRAND` is available. For the standalone legal pages, see Step 2.
6. Ensure `brand.js` loads on each page: pages that pull the SPA shell already get it (Task 3); standalone pages (`scanbag.html`, `monitoring-dashboard.html`, `email-verified.html`, legal pages) need `<script src="/assets/js/brand.js" defer></script>` added to `<head>`.

- [ ] **Step 1: Convert the app/embed pages** per the rules. Representative examples: `embed-app-v2.html:8` `<title>WaveMAX Affiliate Program</title>` → `{{BRAND_NAME}} Affiliate Program`; `operator-scan-embed.html:11` `Operator Scanner - WaveMAX` → `Operator Scanner - {{BRAND_NAME}}`; `claim-embed.html:6` `WaveMAX Laundry - Claim Your Bag` → `{{BRAND_NAME}} - Claim Your Bag`; `email-verified.html:6` `[TITLE] — WaveMAX Laundry` → `[TITLE] — {{BRAND_NAME}}`.

- [ ] **Step 2: Convert the three raw legal routes to nonce-serve** so `{{BRAND_NAME}}` resolves. In `server.js` (the `res.sendFile(... 'terms-and-conditions.html')` at ~1254, `privacy-policy.html` ~1262, `refund-policy.html` ~1266), replace each `res.sendFile(...)` handler with `serveHTMLWithNonce('<file>.html')(req, res)` (the helper is already imported as it's used elsewhere; if not, add `const { serveHTMLWithNonce } = require('./server/utils/cspHelper');`). Keep the same routes/paths.

- [ ] **Step 3: Check `embed-app-v2.js` for a brand literal.** Run: `git grep -inI wavemax -- public/assets/js/embed-app-v2.js`. If any hit is a display string, convert to `window.BRAND && window.BRAND.name`; if a comment, → "Laundromat". If changed, run `npm run build:assets` and stage the rebuilt `public/assets/js/embed-app-v2.min.js`.

- [ ] **Step 4: Remove all converted files from the baseline; run the guard.** Run: `npm test -- tests/unit/branding-guard.test.js` — Expected: PASS. If any converted file still shows a hit, it retained a literal → fix before proceeding (over-removal makes the guard red immediately).

- [ ] **Step 5: Smoke-test a served page renders the brand.** Add to `tests/integration/brand-endpoint.test.js`:
```js
test('a nonce-served page resolves {{BRAND_NAME}} in its title', async () => {
  const res = await request(require('../../server')).get('/embed-app-v2.html');
  expect(res.status).toBe(200);
  expect(res.text).not.toContain('{{BRAND_NAME}}');
  expect(res.text).toContain('<meta name="brand-name" content="');
});
```
Run: `npm test -- tests/integration/brand-endpoint.test.js` — Expected: PASS.

- [ ] **Step 6: Commit.**
```bash
git add public/*.html server.js public/assets/js/embed-app-v2.js public/assets/js/embed-app-v2.min.js tests/integration/brand-endpoint.test.js tests/fixtures/branding-guard-baseline.json
git commit -m "feat(phase3): resolve brand in app/embed HTML titles + legal pages"
```

---

## Task 6: Client JS → window.BRAND / generic comments

**Files:** Modify in-scope `public/assets/js/*.js` (the 45 files with hits, minus `franchise-page-helpers.js`, `austin-host-mock*.js`, and any excluded). Modify `tests/fixtures/branding-guard-baseline.json`.

**Transform rules:**
- **Header/inline comments** (`// … WaveMAX …`) → replace "WaveMAX" with "Laundromat". These are the majority.
- **Display string literals** rendered to the DOM → `(window.BRAND && window.BRAND.name) || 'Laundromat'`. Ensure the page that loads the script also loads `brand.js` (Task 5 Step 6 / Task 3).
- **Log messages** (`console`/logger) and internal labels → "Laundromat".
- Leave any infra identifier (a `wavemax.promo` URL, etc.) untouched — the guard allowlists those.

- [ ] **Step 1: Enumerate and convert.** Run `git grep -inI wavemax -- 'public/assets/js/*.js' ':!*.min.js' ':!public/assets/js/franchise-page-helpers.js' ':!public/assets/js/austin-host-mock*.js'` and apply the rules file-by-file. Representative: a `austin-fb-pixel.js` comment "// WaveMAX Facebook pixel" → "// Laundromat Facebook pixel"; a dashboard label literal `'WaveMAX'` shown in the DOM → `(window.BRAND && window.BRAND.name) || 'Laundromat'`.

- [ ] **Step 2: Rebuild any minified source touched.** Only `embed-app-v2.js` (already handled in Task 5), `austin-landing-init.js`, `iframe-bridge-v2.js`, `parent-iframe-bridge-v3.js`, `austin-host-mock.js` (excluded), `franchise-page-helpers.js` (excluded) have `.min` outputs. If you edited `austin-landing-init.js`, `iframe-bridge-v2.js`, or `parent-iframe-bridge-v3.js`, run `npm run build:assets` and stage the rebuilt `.min.js`.

- [ ] **Step 3: Remove converted files from the baseline; run the guard.** Run: `npm test -- tests/unit/branding-guard.test.js` — Expected: PASS.

- [ ] **Step 4: Commit.**
```bash
git add public/assets/js tests/fixtures/branding-guard-baseline.json
git commit -m "refactor(phase3): resolve brand in client JS (window.BRAND / generic comments)"
```

---

## Task 7: Email templates + dispatcher strings

**Files:** Modify `server/services/email/template-manager.js` (`fillTemplate` auto-inject + `FALLBACK_TEMPLATE`), the email templates under `server/templates/emails/**`, and `server/services/email/dispatcher/*.js` (subject/title/body literals). Modify `tests/fixtures/branding-guard-baseline.json`. Test: `tests/unit/email-brand.test.js` (new).

**Interfaces:**
- Consumes: `require('../../config/brand')` (path from `server/services/email/`).
- Produces: every rendered template receives `data.BRAND_NAME` / `data.BRAND_LEGAL` automatically.

- [ ] **Step 1: Write the failing test.**

Create `tests/unit/email-brand.test.js`:
```js
'use strict';
const brand = require('../../server/config/brand');
const { fillTemplate } = require('../../server/services/email/template-manager');
describe('email brand injection', () => {
  test('fillTemplate auto-injects [BRAND_NAME] and [BRAND_LEGAL]', () => {
    const out = fillTemplate('<h1>[BRAND_NAME]</h1><footer>[BRAND_LEGAL]</footer>', {});
    expect(out).toContain(`<h1>${brand.displayName}</h1>`);
    expect(out).toContain(`<footer>${brand.legalName}</footer>`);
  });
});
```
(If `fillTemplate` isn't exported, export it alongside the existing exports.)

- [ ] **Step 2: Run it → fail.** Run: `npm test -- tests/unit/email-brand.test.js` — Expected: FAIL.

- [ ] **Step 3: Auto-inject in `fillTemplate`.** In `server/services/email/template-manager.js`, add `const brand = require('../../config/brand');` at top, and where it injects `data.BASE_URL` (~line 45), also default-inject the brand keys (only if the caller didn't set them):
```js
if (data.BRAND_NAME === undefined) data.BRAND_NAME = brand.displayName;
if (data.BRAND_LEGAL === undefined) data.BRAND_LEGAL = brand.legalName;
```
Replace the `FALLBACK_TEMPLATE` literal `<h1>WaveMAX Laundry</h1>` (~line 108) with `<h1>[BRAND_NAME]</h1>`.

- [ ] **Step 4: Run test → pass.** Run: `npm test -- tests/unit/email-brand.test.js` — Expected: PASS.

- [ ] **Step 5: Convert templates.** In `server/templates/emails/**` replace visible "WaveMAX Laundry"/"WaveMAX" display copy with `[BRAND_NAME]` (e.g. `base-template.html:6,21,22`: `<title>[BRAND_NAME]</title>`, logo `alt="[BRAND_NAME]"`, `<h1>[BRAND_NAME]</h1>`). Do this across all root templates and the `en/es/de/pt/` subdir variants.

- [ ] **Step 6: Convert dispatcher literals.** In `server/services/email/dispatcher/*.js`, add `const brand = require('../../../config/brand');` where needed and replace WaveMAX display literals with `brand.displayName` (subjects/titles/headers) — e.g. `onboarding.js:12` `` `Your ${brand.displayName} Affiliate Invitation` ``; `ops.js:11` `` `"${brand.displayName} Monitoring" <...>` ``; the localized `EMAIL_TITLE`/`WELCOME_MESSAGE` strings in `customer.js`/`affiliate.js`. Keep translations intact — only the brand token changes. Also update `server/services/email/transport.js:68` From-name display.

- [ ] **Step 7: Run the email test suites** to confirm nothing broke: `npm test -- tests/unit/email tests/integration/email* tests/unit/email-brand.test.js` (adjust to actual paths) — Expected: PASS. Fix any assertion that hardcoded "WaveMAX" by pointing it at `brand.displayName`.

- [ ] **Step 8: Remove converted files from baseline; guard green; commit.**
```bash
git add server/services/email server/templates/emails tests/unit/email-brand.test.js tests/fixtures/branding-guard-baseline.json
git commit -m "feat(phase3): resolve brand in email templates + dispatchers"
```

---

## Task 8: Server/config non-display strings

**Files:** Modify the boilerplate header comments across `server/**/*.js` (26), `.env.example`, `package.json` (description only), `server/models/SystemConfig.js` (the `default_delivery_fee` description label + comments), `ecosystem.config.js` (PM2 name → env var), and any remaining server log/label strings. Modify baseline.

**Transform rules:**
- Header comment `// … for WaveMAX Laundry Affiliate Program` → `// … for Laundromat Affiliate Program`.
- `.env.example`: banner comment (line 1) and the address comment (line 112) → "Laundromat"; **ADD** a documented `BRAND_DISPLAY_NAME` block with a generic example and a comment that production sets it, e.g.:
  ```
  # Display brand name (production sets this to the real business name).
  BRAND_DISPLAY_NAME=Laundromat
  # BRAND_SHORT_NAME / BRAND_LEGAL_NAME / BRAND_INSTANCE_NAME optional overrides.
  # PM2_APP_NAME=laundromat   # process name for `pm2` (kept as the live name in prod)
  ```
  Leave the infra vars (`EMAIL_HOST=mail.wavemax.promo`, `CORPORATE_SITE_URL=…wavemaxlaundry.com`, DB name, `FIREBASE_*`) untouched — guard-allowlisted.
- `package.json:4` description "WaveMAX Laundry Affiliate Program …" → "Laundromat Affiliate Program …". Leave `name`, `repository.url`, `keywords` (infra identifiers).
- `SystemConfig.js:175` description "…(WaveMAX Associates pickup/delivery)" → "…(house Associates pickup/delivery)" (a plain admin label; not brand-configurable copy). Header/inline comments → "Laundromat".
- `ecosystem.config.js:3` `name: 'wavemax'` → `name: process.env.PM2_APP_NAME || 'laundromat'`, with a comment: `// live process keeps its 'wavemax' name via PM2_APP_NAME until re-created (Phase 4 ops)`. **This is a production config file — confirm with the user before editing per the project rule**, then apply.
- Any residual `"WaveMAX Associates"` display literal in `server/**` → `` `${brand.displayName} Associates` `` (require brand where used).

- [ ] **Step 1: Apply the comment/label/description conversions** across the listed files.
- [ ] **Step 2: Confirm the `ecosystem.config.js` edit with the user** (production config gate), then apply.
- [ ] **Step 3: Run the fast server suites** to confirm no assertion depended on these labels: `npm test -- tests/unit/systemConfig* tests/integration/systemConfig*` — Expected: PASS.
- [ ] **Step 4: Remove converted files from baseline; guard green; commit.**
```bash
git add server .env.example package.json ecosystem.config.js tests/fixtures/branding-guard-baseline.json
git commit -m "chore(phase3): genericize non-display brand strings + document BRAND_DISPLAY_NAME"
```

---

## Task 9: Test-fixture emails (@wavemax.com)

**Files:** Modify the 8 `tests/**` files + 1 `scripts/` file containing `@wavemax.com` fixture emails (176 hits). Modify baseline.

**Transform rule:** `@wavemax.com` → `@laundromat.example` (RFC-2606 reserved example TLD). Because some tests **assert** on these literal addresses, update the fixture AND every assertion/expected value in lockstep within each file so the tests still pass. Do NOT touch `@wavemax.promo` (the real mail domain — infra).

- [ ] **Step 1: Enumerate.** Run: `git grep -inI '@wavemax\.com' -- tests scripts`.
- [ ] **Step 2: Convert each file**, replacing `@wavemax.com` → `@laundromat.example` everywhere in that file (fixtures + assertions together).
- [ ] **Step 3: Run the affected suites** to confirm green: `npm test -- <each touched test file>` — Expected: PASS.
- [ ] **Step 4: Remove converted files from baseline; guard green; commit.**
```bash
git add tests scripts tests/fixtures/branding-guard-baseline.json
git commit -m "test(phase3): genericize fixture emails (@wavemax.com -> @laundromat.example)"
```

---

## Task 10: Finalize — build, baseline empty, full green

**Files:** `tests/fixtures/branding-guard-baseline.json` (→ `[]`), rebuilt `.min` assets, `tests/unit/branding-guard.test.js` (add the empty-baseline assertion).

- [ ] **Step 1: Regenerate all minified assets.** Run: `npm run build:assets`. Stage any changed `.min.js`/`.min.css`.

- [ ] **Step 2: Sweep for stragglers.** Run: `npm test -- tests/unit/branding-guard.test.js`. If `offenders` is non-empty, convert those lines per the matching bucket rule and remove the file from the baseline. Repeat until green with the baseline as small as possible.

- [ ] **Step 3: Assert the baseline is empty.** Set `tests/fixtures/branding-guard-baseline.json` to `[]`. Add a third assertion to `branding-guard.test.js`:
```js
test('the migration baseline is fully drained', () => {
  expect([...baseline]).toEqual([]);
});
```
Run: `npm test -- tests/unit/branding-guard.test.js` — Expected: PASS (all three tests; zero offenders, empty baseline).

- [ ] **Step 4: Acceptance grep.** Run:
```bash
git grep -inI wavemax -- . ':!docs' ':!crhsent' ':!*.md' | \
  grep -viE 'wavemax\.promo|mail\.wavemax|@wavemax\.promo|wavemaxlaundry\.com|wavemax-bag-registration|wavemax\.firebaseapp|wavemax\.appspot|wavemax_affiliate|wavemax-affiliate-program' | \
  grep -viE 'accessGate|mediatorGate|franchise|design-explorer|public/dev/|about\.html|testimonials\.html|faq\.html|contact\.html|virtual-tour|become-a-franchisee|laundromat-investment|why-invest|vs-zombiemat|wavemax-affiliate\.html|embed-code|iframe-parent-example|products-placeholder'
```
Expected: **no output** (every remaining hit is infra or an excluded path). Also confirm the display value is not committed: `git grep -i "wavemax austin" -- . ':!docs' ':!*.md'` → no output.

- [ ] **Step 5: Full suite green.** Run: `npm test` — Expected: PASS with no `--forceExit`.

- [ ] **Step 6: Commit.**
```bash
git add tests/fixtures/branding-guard-baseline.json tests/unit/branding-guard.test.js public/assets
git commit -m "test(phase3): drain de-brand baseline; guard enforces zero WaveMAX"
```

- [ ] **Step 7: Whole-branch review** (per subagent-driven-development final review): dispatch the code reviewer over the full branch diff, focusing on (a) no infra identifier was broken, (b) no `data-i18n` value lost a token, (c) all four locales stayed parallel, (d) email rendering still passes brand into `data`, (e) no `.min` asset is stale.

---

## Notes for the executor

- **Production deploy (post-merge, not part of this plan):** add `BRAND_DISPLAY_NAME=WaveMAX Austin` (+ optional `PM2_APP_NAME=wavemax`) to `.env` on both OCI boxes and `pm2 reload wavemax --update-env`. The PM2 process keeps its `wavemax` name.
- **Baseline discipline:** a task removes a file from the baseline ONLY after that file has zero non-infra hits. Files that span two batches (e.g. an HTML page with both a title and an inline JS comment) stay baselined until the last batch clears them — the guard's `offenders` check catches premature removal immediately.
- **Excluded ≠ forgotten:** the franchise SEO subsystem, corporate marketing pages, and design-explorer carry their own brand literals; they are Phase-4 work, not in scope here.
