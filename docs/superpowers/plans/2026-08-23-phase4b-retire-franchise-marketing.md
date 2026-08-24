# Phase 4b — Retire Franchise/Austin-Marketing Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Delete the franchise multi-tenant / Austin-marketing subsystem, keeping the affiliate app + affiliate-recruitment marketing working. Resolve the 5 kept-code→deleted-code conflicts first, then remove wiring + files, verify.

**Architecture:** Move-then-delete. Fix kept code that references the delete set → remove server.js wiring *together with* the files it requires (no dangling `require`) → prune assets/build → delete orphaned tests → verify. Code-only; deploy = git pull + pm2 reload.

**Tech Stack:** Node/Express, Jest+Supertest, terser/csso build.

**Spec:** [`docs/superpowers/specs/2026-08-23-phase4b-retire-franchise-marketing-design.md`](../specs/2026-08-23-phase4b-retire-franchise-marketing-design.md) — the delete/keep manifest lives in spec §2–§3; this plan gives the conflict-fix details + task order and references the spec for the bulk file lists.

## Global Constraints

- **KEEP working:** the app (embed-app-v2 + affiliate/customer/operator/admin/claim/scan + APIs), `affiliate.html` (`/affiliate`), `wavemax-affiliate.html` (`/wavemax-affiliate`), `partner-program.html`, `affiliate-register-embed.html` + register API, `/api/v1/affiliate-application`, `/api/v1/partner-inquiry`, `partnerLanding.js`, `design-explorer/**`, concierge, the `wavemax-*` CSS class names.
- **Hibu is gone** — delete `austin-hibu-phone-swap.js` + `assets/vendor/ybDynamicPhoneInsertion.js` and strip their `<script>` tags from the ~11 app pages.
- **`atxwashdryfold.com/` un-gated** — serves `partner-program.html` publicly; `rundberglaundry.com/` keeps its Coming-soon gate.
- **No dangling requires** — remove a `require()`/mount in the same task as (or before) deleting its target; `madge --circular server/` stays clean and no surviving file requires a deleted basename.
- **Move-then-verify:** after each task, the full-or-scoped suite the task touches stays green (deleted-subsystem tests are removed, not left failing). Rebuild `.min` whenever a built source changes.
- **Keep `public/assets/images/locations/austin-tx/**`** (partner-program hero).

---

## Task 1: Conflict A — remove Hibu phone-tracking

**Files:** the ~11 KEEP app HTML pages; delete `public/assets/js/austin-hibu-phone-swap.js`, `public/assets/vendor/ybDynamicPhoneInsertion.js`; `server.js:384-388` comment.

- [ ] **Step 1:** In each of `affiliate-register-embed.html`, `affiliate-login-embed.html`, `affiliate-dashboard-embed.html`, `affiliate-success-embed.html`, `affiliate-landing-embed.html`, `operator-login-embed.html`, `administrator-login-embed.html`, `administrator-dashboard-embed.html`, `forgot-password-embed.html`, `reset-password-embed.html`, `terms-and-conditions-embed.html` — remove the `<script ... src=".../austin-hibu-phone-swap.js"...></script>` and `<script ... src=".../vendor/ybDynamicPhoneInsertion.js"...></script>` tags (grep each file for `hibu`/`ybDynamic` to find them). Leave all other scripts.
- [ ] **Step 2:** `git rm public/assets/js/austin-hibu-phone-swap.js public/assets/vendor/ybDynamicPhoneInsertion.js`. Remove the now-dead `ybDynamicPhoneInsertion` `script-src` reference/comment at `server.js:384-388`.
- [ ] **Step 3:** `git grep -nE "hibu|ybDynamic" -- public/ server.js` → returns nothing (except maybe docs). Run any HTML-serving test that covers those pages (`npm test -- tests/integration/... ` for embed pages) → green.
- [ ] **Step 4:** Commit.

---

## Task 2: Conflict B — prune franchise/Austin SPA routes from `embed-app-v2.js`

**Files:** `public/assets/js/embed-app-v2.js` (+ rebuilt `.min.js`).

- [ ] **Step 1:** In `embed-app-v2.js` `EMBED_PAGES`, delete lines mapping `/home,/self-serve-laundry,/wash-dry-fold,/commercial,/about-us,/testimonials,/locations,/contact,/employment,/blog` (they point at `site-page-content-only.html`/`self-serve-laundry-embed.html`/`wash-dry-fold-embed.html`). In the script-load map (~lines 600-635) delete the same route keys (they load `site-page-loader.js`/austin JS). Keep ALL affiliate/customer/operator/admin/legal/claim/scan routes.
- [ ] **Step 2:** `npm run build:assets`; stage `embed-app-v2.min.js`.
- [ ] **Step 3:** `git grep -nE "site-page-content-only|site-page-loader|self-serve-laundry-embed|wash-dry-fold-embed" -- public/assets/js/embed-app-v2.js` → nothing. Run `npm test -- tests/**/embedApp* tests/**/embed-app*` (adjust to real paths) → green.
- [ ] **Step 4:** Commit.

---

## Task 3: Conflict C — rework `sitemap.xml` off `domainSeoOverrides`

**Files:** `server.js` (the `/sitemap.xml` route ~1218-1260).

- [ ] **Step 1:** Read the current sitemap route. Remove `require('./server/config/domainSeoOverrides')` and its `isManagedHost` branch + the `/austin-tx/…` URL entries (1236-1240). Replace with a simple sitemap that lists the surviving app/affiliate-marketing URLs for the request host (at minimum the root `/`; keep `robots.txt` pointing at it). Preserve the route contract (200, `application/xml`).
- [ ] **Step 2:** Add/adjust a test in the existing sitemap/seo test (`seoCrawlability` or similar): `GET /sitemap.xml` → 200 xml, contains the host root, contains NO `/austin-tx/`. Run it → green.
- [ ] **Step 3:** Commit.

---

## Task 4: Conflict E (root redirect) + partnerLanding un-gate for atxwashdryfold

**Files:** `server.js:1042` root route; `server/middleware/partnerLanding.js`.

- [ ] **Step 1:** `server.js:1042` — change `app.get('/')` `redirect(302,'/franchise/')` → `redirect(302,'/embed-app-v2.html')` (the app shell). (On the marketing hosts partnerLanding pre-empts; this fires for portal + other hosts.)
- [ ] **Step 2:** `partnerLanding.js` — un-gate `atxwashdryfold.com`. Define a public set (e.g. `PARTNER_PUBLIC_HOSTS = ['atxwashdryfold.com','www.atxwashdryfold.com']`); in the handler (after the `PARTNER_LANDING_HOSTS.includes` check at line 113, before the `isPreview` branch at 118): if the host is in `PARTNER_PUBLIC_HOSTS`, serve `PAGE_PATH` (partner-program.html) directly to everyone; otherwise keep the existing `isPreview` → page / else → `COMING_SOON_PAGE` logic (so `rundberglaundry.com` stays gated).
- [ ] **Step 3:** Tests in `partnerLanding.test.js`: host `atxwashdryfold.com` (non-preview IP) → 200 serving partner-program (not COMING_SOON); host `rundberglaundry.com` (non-preview) → still COMING_SOON; app surfaces still exempt. Run → green.
- [ ] **Step 4:** Commit.

---

## Task 5: Remove server.js franchise/location/corporate wiring + delete the server files

**Files:** `server.js` (wiring lines per spec §3.2); delete the server files per spec §3.1.

- [ ] **Step 1:** In `server.js` remove: `629` (`app.use(franchisePreview)`), `858-877` (`/api/austin-tx/places-config`), `883-894` (`/dev/austin-host-mock`→`/austin-tx/` redirect), `983` (`/franchises`), `1007` (`/location`), `1008` (`/contact`), `1009` (`corporateInquiryRoutes`), `1045-1074` (the corporate page routes `/franchise`,`/become-a-franchisee`,`/about`,`/testimonials`,`/why-invest-in-wavemax`,`/wavemax-vs-zombiemat`,`/virtual-tour`,`/faq`,`/contact`,`/laundromat-investment-guide`), `1090` (slug router). Also remove the franchise-host CSP branch (`344-361`) + the Austin embed entries in `strictCSPPages` (`328-337`) + dead atxwash CSP origins if now unused (`414-415`). (Do NOT remove the `/api/concierge` route at 942-943 — KEEP.)
- [ ] **Step 2:** `git rm` the spec §3.1 server files: controllers `franchiseController.js`, `locationController.js`, `corporateInquiryController.js`; routes `franchiseRoutes.js`, `locationRoutes.js`, `corporateInquiryRoutes.js`, `contactRoutes.js`; services `franchiseRegistryService.js`, `gbpService.js`, `gbpToLocationData.js`, `networkReviewsService.js`, `franchisePreviewEmail.js`, `franchisePreviewPages.js`, `franchisePreviewRender.js`, `corporateInquiryService.js`; `middleware/franchisePreview.js`; `models/FranchisePreviewRequest.js`; `config/domainSeoOverrides.js`, `config/franchisePreviewCopy.js`; `scripts/franchise-build/**`, `scripts/create-franchise-preview.js`, `scripts/revoke-franchise-preview.js`.
- [ ] **Step 3:** `node --check server.js` + `node -e "require('./server')"` boot-parse clean; `git grep -nE "franchiseController|franchiseRoutes|locationRoutes|corporateInquiry|franchisePreview|domainSeoOverrides|gbpService|gbpToLocationData|networkReviewsService|franchiseRegistryService|FranchisePreviewRequest|franchisePreviewCopy" -- server.js server/ ':!*test*'` → nothing in surviving code. `madge --circular server/` clean.
- [ ] **Step 4:** Run the app-surface integration tests (auth/affiliate/customer/operator smoke) → green. Commit.

---

## Task 6: Delete franchise/Austin public HTML + data + locales

**Files:** spec §3.3 (HTML) + §3.4 (data/locales). Keep `images/locations/austin-tx/`.

- [ ] **Step 1:** `git rm` the spec §3.3 HTML: `franchise-host.html`, `franchise.html`, `become-a-franchisee.html`, `about.html`, `faq.html`, `testimonials.html`, `contact.html`, `virtual-tour.html`, `why-invest-in-wavemax.html`, `wavemax-vs-zombiemat.html`, `laundromat-investment-guide.html`, `about-us-embed.html`, `austin-landing-v3-embed.html`, `commercial-embed.html`, `contact-embed.html`, `self-serve-laundry-embed.html`, `wash-dry-fold-embed.html`, `site-page-content-only.html`, `public/franchise-default/**`.
- [ ] **Step 2:** `git rm` spec §3.4: `public/data/franchises/*.json` (all 75), `public/content/site-pages.json`, `public/locales/{de,en,es,pt}/corporate.json`. Do NOT remove `public/data/` if other data lives there; do NOT touch `public/assets/images/locations/austin-tx/`.
- [ ] **Step 3:** `git grep -nE "franchise-host|franchise-default|site-page-content-only|/data/franchises/|corporate\.json|content/site-pages" -- server/ public/ ':!*test*' ':!public/data/franchises'` → nothing referencing the deleted files from surviving code. Confirm `partner-program.html` still references its austin-tx hero image (kept).
- [ ] **Step 4:** Commit.

---

## Task 7: Delete franchise/Austin JS + CSS assets + prune build

**Files:** spec §3.5 (JS/CSS) + `scripts/build-assets.js`.

- [ ] **Step 1:** `git rm` the spec §3.5 JS (austin-*, self-serve-*, wash-dry-fold-*, seo-config-*, corporate-chrome, corporate-locations-modal, franchise-hero-rotator, franchise-map-lazy, franchise-page-helpers{,.min}, franchise-reviews-slider, franchise-tabs, network-reviews-init, site-page-loader, contact-form, lead-capture-form) and CSS (austin-*, corporate-chrome, self-serve-laundry-modern, site-page-content, wash-dry-fold-modern, wavemax-mhr-chrome{,.min}, wavemax-mhr-modal).
- [ ] **Step 2:** In `scripts/build-assets.js` `ASSETS`, remove rows for any deleted source (austin-landing-v3.css, austin-host-mock.js, austin-landing-init.js, franchise-page-helpers.js, wavemax-mhr-chrome.css, etc.). `npm run build:assets` → clean; stage changes.
- [ ] **Step 3:** `git grep -nE "corporate-chrome|site-page-loader|franchise-page-helpers|austin-host-mock|austin-landing-init|network-reviews-init|self-serve-laundry-modern|wash-dry-fold-modern|austin-.*\.css|wavemax-mhr-(chrome|modal)" -- public/ server/ scripts/ ':!*test*'` → nothing in surviving refs. No HTML references a deleted asset.
- [ ] **Step 4:** Commit.

---

## Task 8: Delete orphaned tests + clean guard exclusions

**Files:** tests exercising only the deleted subsystem; branding-guard + domain-guard `EXCLUDED_*` entries for deleted paths.

- [ ] **Step 1:** Identify tests that reference the deleted subsystem (`git grep -lE "franchiseController|/franchises/|franchisePreview|gbpService|networkReviews|corporate-chrome|austin-landing|self-serve-laundry-embed|wash-dry-fold-embed|domainSeoOverrides|corporateInquiry|locationController|site-page" -- tests/`). Delete the ones that test ONLY deleted code (e.g. franchise*/location*/gbp*/franchisePreview*/austin-marketing/site-page tests). Keep `partnerLanding.test.js`, `wavemaxAffiliatePage.test.js`, `accessGate.test.js`, and any shared test — update those if they reference a deleted path.
- [ ] **Step 2:** In `tests/unit/branding-guard.test.js` and `tests/unit/domain-guard.test.js`, remove `EXCLUDED_PREFIXES`/`EXCLUDED_FILES` entries that pointed at now-deleted paths (franchise-default, franchiseController, domainSeoOverrides, the deleted marketing pages, austin/self-serve/wash-dry-fold JS, corporate.json, etc.). Keep exclusions for surviving excluded trees (design-explorer, dc_private, docs, the kept wavemax-* CSS class allowlist).
- [ ] **Step 3:** `npm test -- tests/unit/branding-guard.test.js tests/unit/domain-guard.test.js` → both green (no stale exclusion pointing at a missing file; no new offenders from surviving code).
- [ ] **Step 4:** Commit.

---

## Task 9: Finalize — require-graph, full suite, keep-set live-serve

- [ ] **Step 1:** `madge --circular server/` clean; `git grep -inI wavemax -- . ':!docs' ':!*.md' ':!design-explorer' ':!public/design-explorer' ':!tests/unit/branding-guard.test.js' ':!tests/unit/domain-guard.test.js'` — report the count (should be a fraction of the pre-4b 5,168; remaining = kept CSS classes + infra + the kept affiliate-marketing "WaveMAX Austin"/config + design-explorer if not excluded).
- [ ] **Step 2:** `npm run build:assets` final; stage any `.min` changes.
- [ ] **Step 3:** Full suite (`npm test`) — the controller runs it (WSL2 timeout); confirm green with no `--forceExit` regression and no leftover franchise-test failures. Report totals.
- [ ] **Step 4:** Keep-set integration smoke (add to an existing integration test or verify in the suite): `GET /embed-app-v2.html` 200; `/affiliate` 200; `/wavemax-affiliate` 200; `partner-program` served for the marketing hosts (200); `POST /api/v1/affiliate-application` + `/api/v1/partner-inquiry` validate; a deleted route (`/franchise`, `/about`, `/api/v1/franchises`) → 404 not 500.
- [ ] **Step 5:** Commit. Then the whole-branch final review.

---

## Notes for the executor

- **Deploy (post-merge, not in this plan):** `git pull` both OCI boxes + `pm2 reload wavemax`. No nginx/CF change. Verify `atxwashdryfold.com/` serves the partner form publicly, `rundberglaundry.com/` still Coming-soon, `portal` root → app. Rollback = revert the merge.
- **Bulk file lists are in the spec §3** — treat those as the authoritative delete manifest; if a listed file is already gone or an unlisted sibling clearly belongs to the deleted subsystem, use judgment and note it.
- This is large but mechanical; the risk is a dangling reference — hence the per-task grep checks.
