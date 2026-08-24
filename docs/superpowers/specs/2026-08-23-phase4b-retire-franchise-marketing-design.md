# Phase 4b — Retire the Franchise / Austin-Marketing Layer

**Date:** 2026-08-23
**Status:** Design — approved, proceeding to plan
**Author:** CRHS (Rick Houlihan) + Claude
**Follows:** Phase 3 de-brand + Phase 4a domain migration (both live). This is the final "de-brand" phase, but by **deletion** rather than tokenization: the remaining WaveMAX-heavy code is the **franchise multi-tenant / Austin-marketing subsystem**, which is being **retired**.

---

## 1. Goal & non-goals

**Goal.** Delete the franchise multi-tenant SEO subsystem and the Austin-marketing site (the app will no longer host the Austin marketing content), while **keeping** the affiliate/customer/operator application (already de-branded, canonical on `portal.atxwashdryfold.com`) and the **affiliate-recruitment marketing** (generic affiliate registration, the UT-student recruitment page, and the affiliate partner interest form). Remove the subsystem's code, data, assets, routes, and wiring cleanly, resolving the few places where kept code references it.

**Non-goals.**
- No tokenization/de-brand of kept code — the app is already de-branded; the deleted code doesn't need de-branding, it needs removing.
- **Keep as-is (untouched):** the `design-explorer/**` + concierge subsystem (token-gated, out of scope) and the ~26 `wavemax-*` CSS **class names** (internal identifiers — Rick's call to leave them).
- No new marketing features. `partner-program.html` and the affiliate pages stay exactly as they are (only their gating/wiring changes where noted).
- No DB-name / Firebase changes.

---

## 2. Keep set (must still work after deletion)

- **The app:** `embed-app-v2.html` + the affiliate/customer/operator/admin/claim/scan SPA routes and their APIs. Already de-branded (Phase 3).
- **Affiliate-recruitment marketing:**
  - `public/affiliate.html` — the UT-student recruitment page (`server.js:1077`, `/affiliate`).
  - `public/wavemax-affiliate.html` — the generic affiliate-interest ad page (`server.js:1081`, `/wavemax-affiliate`).
  - `public/partner-program.html` — the affiliate **partner interest form** (served by `partnerLanding`).
  - `public/affiliate-register-embed.html` + the register API (`affiliateRoutes`, `/api/v1/affiliates`).
  - Form endpoints (clean, no franchise deps): `POST /api/v1/affiliate-application` (`affiliateApplicationRoutes`/`Service`), `POST /api/v1/partner-inquiry` (`partnerInquiryRoutes`/`Service`). Their client JS `affiliate-inquiry.js`, `partner-inquiry.js` stay.
- **`server/middleware/partnerLanding.js`** — KEEP. Host-scoped (acts only on the marketing hosts, exempts all app surfaces), no franchise deps. It is the root handler for `rundberglaundry.com` (Coming-soon placeholder) and `atxwashdryfold.com` (partner form). See §5.
- **`server/config/franchisePreviewCopy.js`?** — DELETE (only `franchisePreview*` use it). **`server/config/storeIPs.js`, `utils/clientIp`, `middleware/ipGate`** — KEEP (partnerLanding deps, general infra).

---

## 3. Delete set

### 3.1 Server code
Controllers: `franchiseController.js`, `locationController.js`, `corporateInquiryController.js`.
Routes: `franchiseRoutes.js`, `locationRoutes.js`, `corporateInquiryRoutes.js`, `contactRoutes.js` (per-location Austin contact).
Services: `franchiseRegistryService.js`, `gbpService.js`, `gbpToLocationData.js`, `networkReviewsService.js`, `franchisePreviewEmail.js`, `franchisePreviewPages.js`, `franchisePreviewRender.js`, `corporateInquiryService.js`.
Middleware: `franchisePreview.js`. Models: `FranchisePreviewRequest.js`. Config: `domainSeoOverrides.js`, `franchisePreviewCopy.js`.
Scripts: `scripts/franchise-build/**` (10 files), `scripts/create-franchise-preview.js`, `scripts/revoke-franchise-preview.js`.
(The internal require-graph is already isolated to this set — confirmed by mapping.)

### 3.2 server.js wiring to remove
`629` (`app.use(franchisePreview)`), `858-877` (`/api/austin-tx/places-config`), `883-894` (`/dev/austin-host-mock` → `/austin-tx/` 301), `983` (`/franchises`), `1007` (`/location`), `1008` (`/contact` per-location), `1009` (`corporateInquiryRoutes`), `1045-1074` (corporate page routes: `/franchise`, `/become-a-franchisee`, `/about`, `/testimonials`, `/why-invest-in-wavemax`, `/wavemax-vs-zombiemat`, `/virtual-tour`, `/faq`, `/contact`, `/laundromat-investment-guide`), `1090` (the Phase-5a slug router). Also the CSP franchise-host branch (`344-361`) + the Austin embed list in `strictCSPPages` (`328-337`) + dead atxwash CSP origins (`414-415`) — rework as needed. The `ybDynamicPhoneInsertion` `script-src` comment (`384-388`) becomes dead (Hibu removed).

### 3.3 Public HTML
`franchise-host.html`, `franchise.html`, `become-a-franchisee.html`, `about.html`, `faq.html`, `testimonials.html`, `contact.html`, `virtual-tour.html`, `why-invest-in-wavemax.html`, `wavemax-vs-zombiemat.html`, `laundromat-investment-guide.html`, `about-us-embed.html`, `austin-landing-v3-embed.html`, `commercial-embed.html`, `contact-embed.html`, `self-serve-laundry-embed.html`, `wash-dry-fold-embed.html`, `site-page-content-only.html`, `public/franchise-default/**` (7).

### 3.4 Data / content / locales
`public/data/franchises/*.json` (all 75, **incl. `austin-tx.json`**), `public/content/site-pages.json`, `public/locales/{de,en,es,pt}/corporate.json`. **KEEP** `public/assets/images/locations/austin-tx/**` (used by `partner-program.html` hero — §4.4).

### 3.5 Assets
JS: `austin-*` (about/commercial/contact/host-mock{,-data}{,.min}/landing-init{,.min}/self-serve/stub/wdf init), `austin-hibu-phone-swap.js`, `austin-fb-pixel.js`, `corporate-chrome.js`, `corporate-locations-modal.js`, `franchise-hero-rotator.js`, `franchise-map-lazy.js`, `franchise-page-helpers.js{,.min}`, `franchise-reviews-slider.js`, `franchise-tabs.js`, `network-reviews-init.js`, `self-serve-laundry-modern.js`, `self-serve-translations.js`, `seo-config-self-serve.js`, `seo-config-wash-dry-fold.js`, `site-page-loader.js`, `wash-dry-fold-modern.js`, `wash-dry-fold-translations.js`, `contact-form.js`, `lead-capture-form.js`, and the Hibu vendor snapshot `public/assets/vendor/ybDynamicPhoneInsertion.js`.
CSS: `austin-about.css`, `austin-commercial.css`, `austin-contact.css`, `austin-host-mock.css`, `austin-landing-v3.css{,.min}`, `austin-self-serve.css`, `austin-wdf.css`, `corporate-chrome.css`, `self-serve-laundry-modern.css`, `site-page-content.css`, `wash-dry-fold-modern.css`, `wavemax-mhr-chrome.css{,.min}`, `wavemax-mhr-modal.css`.
Build: remove deleted entries from `scripts/build-assets.js` `ASSETS`.

### 3.6 Tests
Delete tests that exercise only the deleted subsystem (franchise/location/corporate/gbp/networkReviews/franchisePreview/austin-marketing/site-page). Update/keep any shared test. The `wavemaxAffiliatePage.test.js`, `partnerLanding.test.js`, `accessGate.test.js` stay (KEEP set). Remove now-obsolete guard exclusions that reference deleted paths (branding-guard + domain-guard `EXCLUDED_*`).

---

## 4. Conflict resolutions (kept code that references the delete set — fix BEFORE deleting)

**A. Hibu phone-tracking (now unused — delete).** `austin-hibu-phone-swap.js` + `/assets/vendor/ybDynamicPhoneInsertion.js` are `<script>`-included by ~11 KEEP app pages (`affiliate-register-embed`, `affiliate-login-embed`, `affiliate-dashboard-embed`, `affiliate-success-embed`, `affiliate-landing-embed`, `operator-login-embed`, `administrator-login-embed`, `administrator-dashboard-embed`, `forgot-password-embed`, `reset-password-embed`, `terms-and-conditions-embed`). **Strip both `<script>` tags from every one** (Hibu is no longer used), then delete the JS + vendor file + the dead `script-src` comment.

**B. SPA route map (`embed-app-v2.js` + `.min.js`).** `EMBED_PAGES` maps `/home,/about-us,/testimonials,/locations,/contact,/employment,/blog` → `site-page-content-only.html`, `/self-serve-laundry` → `self-serve-laundry-embed.html`, `/wash-dry-fold` → `wash-dry-fold-embed.html`; the script-load map points those routes at `site-page-loader.js`. **Remove those entries** from both the source and the minified bundle (`npm run build:assets`). All affiliate/customer/operator/admin/legal SPA routes are KEEP.

**C. `sitemap.xml` handler.** `server.js:1224` requires `domainSeoOverrides.isManagedHost` and lists `/austin-tx/…` URLs (`1236-1240`) + managed-host branches. **Rework the sitemap** to drop the `domainSeoOverrides` dependency and the Austin URLs — emit the app/affiliate-marketing URLs for the current host. Keep the route working (it's core).

**D. `partner-program.html` hero image.** Uses `public/assets/images/locations/austin-tx/hero-1.webp`. **Keep the `images/locations/austin-tx/` directory** (images aren't the engine); prune only if the hero is swapped.

**E. Root redirect.** `server.js:1042` `app.get('/')` → `redirect(302,'/franchise/')`. On the marketing hosts `partnerLanding` pre-empts, so this only fires for `portal.atxwashdryfold.com` + other hosts. **Repoint** it to the app shell (e.g. `/embed-app-v2.html` or the affiliate landing).

---

## 5. Root / host behavior (final)

- **`rundberglaundry.com/`** → unchanged: `partnerLanding` serves the Coming-soon placeholder (public) / `partner-program.html` (preview allowlist).
- **`atxwashdryfold.com/`** → **un-gate**: `partnerLanding` should serve `partner-program.html` **publicly** (not the Coming-soon hold, not preview-only). Small change in `partnerLanding.js` — treat `atxwashdryfold.com` as "serve the partner form to everyone." `rundberglaundry.com` keeps its Coming-soon gate.
- **`portal.atxwashdryfold.com/`** → the app (fixed by conflict E).
- No nginx change required (partnerLanding fronts the marketing hosts before the deleted franchise engine; the deployment's `/ → /austin-tx/` rewrite becomes moot and can be left or simplified later).

---

## 6. Testing & acceptance

- **Require-graph integrity:** `madge --circular server/` clean; no `require()` in the surviving tree resolves to a deleted file (grep the delete-list basenames across `server/`, `public/`, `scripts/`, `server.js`).
- **Keep-set serves (integration):** `GET /embed-app-v2.html` 200; `/affiliate`, `/wavemax-affiliate` 200; `partner-program` served for the marketing hosts; `POST /api/v1/affiliate-application` + `/api/v1/partner-inquiry` still 200/validate; the app SPA routes resolve.
- **Delete-set gone:** `GET /franchise`, `/about`, `/faq`, `/api/v1/franchises`, a franchise slug (`/austin-tx/`) → 404 (or partnerLanding on the marketing hosts), not a 500.
- **Root behavior:** `atxwashdryfold.com/` serves the partner form publicly; `rundberglaundry.com/` still Coming-soon; `portal` root → app.
- **Guards + full suite green** (no `--forceExit` regressions); deleted-subsystem tests removed, not skipped.
- **`git grep -iI wavemax`** over the surviving tree drops massively (the 5,168 → mostly the design-explorer exclusion + the kept CSS classes + infra).

---

## 7. Deploy

Code-only (no infra): `git pull` both OCI boxes + `pm2 reload wavemax`. No nginx/CF change. Verify the keep-set + the `atxwashdryfold.com` public partner form live. Rollback = revert the merge (pure deletion, so revert restores everything).

---

## 8. Execution note

Order: resolve conflicts A–E (fix kept code) → remove server.js wiring → delete server files → delete public/data/asset files → prune build-assets + rebuild `.min` → delete orphaned tests + guard exclusions → verify. Move-then-verify at each step so nothing dangles. Large but mechanical; plan via writing-plans, build subagent-driven with adversarial reviews.
