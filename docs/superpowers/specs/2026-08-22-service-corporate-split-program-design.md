# Service / Corporate Split → De-brand → Domain Migration — Program Design

**Date:** 2026-08-22
**Status:** In execution — Phases 1–2 built (`crhs-web-core`, `crhs-corporate`); §3.B/§3.E/§4 amended 2026-08-27 per the [split catch-up gap analysis](../plans/2026-08-27-split-catchup-gap-analysis.md) (franchise marketing retired in Phase-4b; corporate scope = crhsent.com; monorepo stays the service app).
**Author:** CRHS (Rick Houlihan) + Claude
**Type:** Program spec (decomposes into four phased sub-projects, each of which gets its own detailed spec + implementation plan).

> `dc_private` (the legal case-file repo) is **out of scope** for all of this. Everything here is within the affiliate codebase.

---

## 1. Goal & the four-phase program

Today one Express app (`server.js`, 1,336 lines), on one MongoDB, as one PM2 app (`wavemax`), serves **both** the WDF affiliate *service* and all *corporate/marketing* content (the `crhsent.com` site, the `/wavemax` mediator+sales pages, WaveMAX franchise-recruitment marketing, the 4 Austin per-location SEO domains, design-explorer). We are separating these into independently-developed, independently-deployed products, removing the "WaveMAX" literal from the service codebase, and migrating off the `wavemax.promo` domain.

Sequenced (locked):

| Phase | Name | Outcome |
|---|---|---|
| **1** | Extract `@crhs/web-core` | The shared security/infra core is lifted out of the inline `server.js` into a versioned package both apps consume. |
| **2** | Repo + deploy split | New `crhs-corporate` repo + a second production app; corporate content and gates move out of the service repo; nginx routes by host. |
| **3** | De-brand the service repo | "WaveMAX" removed from the (now service-only) `wdf-affiliate-program` behind `server/config/brand.js`. Covered by the companion spec `2026-08-22-debrand-brand-config-design.md`. |
| **4** | Domain migration | `wavemax.promo` → new primary domain (app leaning `atxwashdryfold.com/<path>`), keeping a 301 alias. Separate Phase-4 spec. |

**Copyright is not blocked** by any of this — the deposit PDF is already scrubbed; the code de-brand is repo hygiene.

---

## 2. Target architecture — three repos

1. **`crhs-web-core`** (package `@crhs/web-core`) — shared security + infrastructure core. Consumed by both apps as a versioned dependency (published from its own repo, or a workspace package). See §3.C.
2. **`wdf-affiliate-program`** (existing repo, becomes service-only) — the WDF affiliate SERVICE. Own service-only `server.js`; PM2 `wavemax`, port 3000; hosts = app/API/embed domains.
3. **`crhs-corporate`** (new repo) — corporate content (`crhsent.com`) + the corporate gates (`accessGate`/`mediatorGate`). Own `server.js`; PM2 `crhs-corporate`, port 3001; host = `crhsent.com`. *(Amended 2026-08-27: franchise-host rendering and the Austin marketing/per-location domains were retired in Phase-4b — see §3.B.)*

Both apps depend on `@crhs/web-core`; both talk to the **shared** MongoDB.

**Execution model (Rick, 2026-08-22): build the new repos greenfield; leave the existing `wdf-affiliate-program` repo untouched.** Phases 1–2 create `crhs-web-core` and `crhs-corporate` as **new** repos by *copying* (never moving/deleting) the relevant code out of the existing monorepo and building it up under **strict TDD** (red → green → refactor; a failing test first for every non-trivial unit). The existing repo/app keeps running unmodified as the reference + fallback; corporate hosts are re-pointed to the new corporate app via nginx only once it is proven in production. Trimming/​de-branding the service repo (Phase 3) and the domain migration (Phase 4) are revisited after the split is live and stable.

---

## 3. Split inventory

### A. SERVICE repo (`wdf-affiliate-program`)

- **routes:** auth, affiliate, affiliateInvite, customer, order, administrator, operator, bag, scan, expediter, addon, systemConfig, monitoring, embed, firebaseConfig.
- **controllers:** auth, affiliate, customer, order, administrator, operator, addon, expediter.
- **modules (all):** `bags/`, `onboarding/`, `orders/` (scan-gate state machine), `scan/`.
- **models:** Affiliate, Customer, Operator, Administrator, Order, Transaction, AddOn, RefreshToken, TokenBlacklist, Bag, AffiliateInvite. (`SystemConfig` → web-core.)
- **services:** authToken, passwordReset, codeAttemptLockout, firebasePhone, bagClaim, customerRegistration, adminDashboard, administratorAccount, operatorAdmin/ShiftStats/Support, orderExport, systemConfig, systemHealth, `email/dispatcher/*` (operational senders).
- **middleware:** auth, authorizationHelpers, rbac, scanAuth, expediterGuard, adminIpGate, operatorIpGate. (Rate limiting, sanitization, cspNonce, errorHandler → web-core.)
- **config:** csrf-config, storeIPs.
- **templates:** `server/templates/emails/**` (operational, all langs). **monitoring:** `server/monitoring/`.
- **public pages:** the `*-embed.html` app surfaces (affiliate/administrator/operator/order-expediter/claim/forgot/reset), `embed-app-v2.html`, `embed-landing.html`, `email-verified.html`, `scanbag.html`, `monitoring-dashboard.html`.
- **public JS:** SPA core (`embed-app-v2.js`, `embed-config`, `embed-navigation`, `api-client`, `csrf-utils`, `session-manager`, UI helpers) + affiliate/administrator/operator/scan/expediter/bag/claim/auth scripts + vendored `qrcode`/`jsqr`/firebase-compat.
- **locales:** `{en,es,pt,de}/common.json`.

### B. CORPORATE repo (`crhs-corporate`)

> **Amended 2026-08-27 (Decision A — see the [split catch-up gap analysis](../plans/2026-08-27-split-catchup-gap-analysis.md)).** Phase 2 built `crhs-corporate` **crhsent.com-only**, and Phase-4b (`0df8d96d`, ~−63k lines, deployed) then **retired** the entire WaveMAX franchise/Austin marketing system from the monorepo. None of it was ever copied into `crhs-corporate`; it is **permanently retired** and needs no migration. Corporate's scope is now **crhsent.com only**. The one kept recruitment piece (`affiliateApplication*` + `affiliate-inquiry.js` + `public/affiliate.html`, §3.D) **stays in the service app** for now (revisit if corporate expands).

**In `crhs-corporate` today (crhsent.com only):**
- **`crhsent/` (whole tree):** corporate site (`index/about/work/capabilities/contact/owners/404`) + `crhsent/wavemax/*` (mediator+sales, clickjacking-demo, load-order-demo, security-audit) + assets/fonts/robots/sitemap.
- **corporate gates + models:** `accessGate` (+ `AccessGate/AccessRequest/AccessWhitelist/AccessClick`), `mediatorGate` (+ `MediatorAccess`).
- **locales:** `{en,es,pt,de}/corporate.json`.

**Retired in Phase-4b (historical — pre-retirement design only; NOT in corporate, NOT to be migrated):** the marketing HTML in `public/` (franchise, become-a-franchisee, about, testimonials, why-invest-in-wavemax, wavemax-vs-zombiemat, virtual-tour, faq, contact, laundromat-investment-guide, wavemax-affiliate, franchise-host + `franchise-default/*`, the franchise `-embed.html` fragments, partner-program, integration examples); franchise host rendering (`franchiseRoutes/Controller`, `franchisePreviewRender`, `franchisePreview`, `franchiseRegistryService`, `equipmentProfileService`, `gbpService`, `gbpToLocationData`, `franchisePreviewPages/Email`, `locationData`, `domainSeoOverrides`, `franchisePreviewCopy`, `FranchisePreviewRequest`, `scripts/franchise-build/*`); the `explorerGuard` and `partnerLanding` gates; corporate intake/AI (`corporateInquiryRoutes/Controller/Service`, partner/contact routes+controllers, `conciergeController` + `conciergeFaq`, google/network review services); `design-explorer/` (whole tree) + generated `public/design-explorer/*`; the corporate/franchise marketing JS (`corporate-*`, `site-page-loader`, `austin-*`, `franchise-*`, self-serve/wash-dry-fold scripts, `lead-capture-form`, `partner-inquiry`, `network-reviews-init`, `faq-accordion`, `wm-image-config`); `public/data/franchises*`, `public/content/site-pages.json`, marketing SEO assets (`flyers/`, brand logos, location imagery); and the per-host `robots.txt`/`sitemap.xml` generation for the marketing domains.

### C. `@crhs/web-core` (shared package)

Lifted (and, where inline, **modularized**) from `server.js`/`server/`:
- CSP: the directive builder (currently inline ~L287-466 of `server.js`), `cspNonce` middleware, `cspHelper` (`injectNonce`/`readHTMLWithNonce`/`serveHTMLWithNonce`).
- Security headers: the Helmet + custom-header block (HSTS, Permissions-Policy, COOP, CORP overrides), CORS config.
- Request hygiene: `sanitization`, `errorHandler`, `rateLimiting` + `rateLimitMongoStore`, `ipGate` factory, `clientIp`, `storeIPs`, `validateSecrets`, `previewUnlockCookie`.
- Data/email/infra: `SystemConfig` model + `initializeDefaults`, `mongoCursorRetry`, `mongoOracleDiagnostics`, email framework (`emailService` shim → `email/transport` + `email/template-manager`), `logger`, `auditLogger`, `encryption`, `controllerHelpers`, session/`connect-mongo` + CSRF config, `geocodingService`.
- Client shared assets: `i18n.js` + `language-switcher.js`, embed bridge (`iframe-bridge-v2`, `parent-iframe-bridge-v3`, `css-async`), shared fonts/vendor.
- Shared legal pages (`terms-and-conditions`, `privacy-policy`, `refund-policy`) shipped from web-core as a single source, served by both apps.

### D. Gray-zone assignments (recommendations — confirm on review)

| Item | Recommendation |
|---|---|
| `affiliateApplication*` + `affiliate-inquiry.js` + `public/affiliate.html` (UT recruitment lead form) | **Corporate** (Rick, 2026-08-22) — grouped with marketing/recruitment intake. |
| Legal pages (terms/privacy/refund) | **web-core** shared static, served by both. |
| `geocodingService` | **web-core** (service onboarding + corporate location both use it). |
| `docsRoutes` (`/docs`, non-prod only) | **Service** (dev tooling). |
| `locationQuarantine` + `quarantineConfig` | Largely **retired** once nginx `server_name` routes hosts; any residual → web-core. |
| Integration example HTML (`wavemaxlaundry-embed-code*`, `iframe-parent-example*`) | **Corporate** (franchisor-facing docs). |

### E. Gate migration matrix (content gates — none may be lost)

Every access-control gate, its destination, and how it is verified. **No gate is "migrated" until an integration test in its destination repo proves both its allow AND deny paths.** The shared `ipGate` factory is Phase 1 (web-core); service gates travel with the service repo; corporate gates get one migration task each in the Phase-2 plan.

| Gate (file) | Guards | Dest | Key deps / models | Migration + verification |
|---|---|---|---|---|
| `ipGate.js` (factory) | reusable IP-allowlist middleware factory | **web-core** | clientIp, storeIPs | Phase 1 (T6). Unit test: allow / deny / `x-forwarded-for` parse. Both apps build their IP gates from it. |
| `adminIpGate.js` | `/admin`, `/api/v1/administrators` (`ADMIN_ALLOWLIST`) | **service** | ipGate factory | Consumes web-core factory; port `adminIpGate.test.js` (stealth 404, fail-closed in prod). |
| `operatorIpGate.js` | operator surfaces (`STORE_IP`) | **service** | ipGate factory | Port `operatorIpGate.test.js`. |
| `scanAuth.js` | scan-session endpoints | **service** | — | Port scan-session auth test. |
| `expediterGuard.js` | order-expediter display (`EXPEDITER_TOKEN`) | **service** | — | Token allow/deny test. |
| `accessGate.js` | `crhsent.com` password/email gate (`GATED_HOSTS`) | **corporate** | `AccessGate`/`AccessWhitelist`/`AccessClick`/`AccessRequest`, SystemConfig, email; `loadCache`/`startCacheRefresh` on DB connect | Move models + cache; corporate app must run `loadCache` on connect. Test: gated host → 401 landing, correct password sets unlock cookie, whitelist-IP bypass, admin bypass. |
| `mediatorGate.js` | `crhsent.com/wavemax` IP-binding | **corporate** | `MediatorAccess` model, ipGate factory (**was** service `adminIpGate`), HMAC via `SESSION`/`JWT` secret | **Rebuild its admin-IP check on the web-core factory** (drop the cross-import of service `adminIpGate`). Port `mediatorGate.test.js` (10 tests: prompt/bind/deny/home-bypass/admin-reset, IPv6 cookie parse). |
| `franchisePreview.js` | `crhsent.com/__preview/*` + gated `/<slug>?key=` | **corporate** | gbpService, turnstile, franchisePreview{Email,Pages,Render}, gbpToLocationData, previewUnlockCookie + encryption + auditLogger (web-core), `FranchisePreviewRequest` model | DARK unless `FRANCHISE_PREVIEW_ENABLED`. Move model + services. Test: preview-request flow, unlock cookie, disabled-by-default. |
| `explorerGuard.js` | `/design-explorer/*` (`EXPLORER_TOKEN`) | **corporate** | — | Port `explorerGuard.test.js`. |
| `partnerLanding.js` | Austin per-location domains coming-soon/partner (`PARTNER_PREVIEW_ALLOWLIST`) | **corporate** | — | Move; **drop the hardcoded service-path exemptions** (moot once nginx routes app hosts to :3000). Test: gated host → partner page, allowlist-IP sees full site. |
| `locationQuarantine.js` (+ `quarantineConfig.js`) | redirect non-Austin/non-app hosts → corporate site | **retired → corporate residual** | quarantineConfig, cspHelper (crhsent-404) | Largely superseded by nginx `server_name` (each host now lands on its own app). Keep only the crhsent-404 branch in corporate if still needed. **Verify with a per-host smoke test that nothing mis-routes** after removal. |

Non-gate authZ for completeness: `auth.js`/`rbac.js`/`authorizationHelpers.js` (JWT/role) → **service**; `locationValidation.js` → **web-core** (onboarding + corporate location both use it).

**Cross-surface coupling resolved:** today `mediatorGate` (corporate) imports `adminIpGate` (service). Post-split the **factory** lives in web-core and each app instantiates its own IP gates from it — no cross-repo import.

> **Amended 2026-08-27 (Decision A):** the `franchisePreview`, `explorerGuard`, and `partnerLanding` rows above are **retired** (Phase-4b) — those gates and their content no longer exist in the monorepo and were never migrated to corporate. Only `accessGate` and `mediatorGate` remain corporate-destined. `locationQuarantine` is likewise superseded by nginx `server_name` host routing.

---

## 4. Deployment topology

**Today:** Cloudflare → nginx → one PM2 app (`wavemax`, cluster/max) on :3000, per box (oci1/oci2), active-active; host selection is **in application code** (`req.hostname` chain: `accessGate → partnerLanding → mediatorGate → crhsent handler → franchisePreview → locationQuarantine → franchiseController`). One MongoDB (`MONGODB_URI`, db `wavemax`). Deploy = per-box `git pull` + `pm2 reload`. `npm run build:assets` regenerates committed `.min` bundles spanning both surfaces.

**Target:**
- **Two PM2 apps** per box: `wavemax` (service) :3000, `crhs-corporate` :3001. Service keeps `instances: max`; corporate is mostly static → fewer instances.
- **nginx `server_name` blocks** own host routing (moved out of app code): `crhsent.com` → :3001 (corporate); app/API/embed hosts (`affiliate.*`, the app domain, and the Austin per-location domains) → :3000 (service). *(Amended 2026-08-27: the WaveMAX/Austin marketing hosts formerly routed to :3001 were retired in Phase-4b — corporate serves only `crhsent.com`; the per-location domains now serve the service app's partner landing / portal. See §3.B.)*
- **Shared MongoDB** (one URI). Each app's `ensure-indexes` provisions **only its own** models; `SystemConfig.initializeDefaults()` is owned by one app (service) and read by both; corporate owns `Access*`/`MediatorAccess`/`FranchisePreviewRequest` indexes.
- **Shared secrets** (`SESSION_SECRET`/`JWT_SECRET` HMAC, `ENCRYPTION_KEY`, `MONGODB_URI`, email creds, `STORE_IP_ADDRESS`/`ADMIN_ALLOWLIST`, `CORPORATE_SITE_URL`) must match across both `.env` files; corporate adds `ACCESS_GATE_*`/`MEDIATOR_GATE_*`/`FRANCHISE_PREVIEW_ENABLED`/`PARTNER_PREVIEW_ALLOWLIST`/`GOOGLE_PLACES_*`/Turnstile; service adds Firebase/rate-limit/admin/operator.
- **Two checkouts** (`/var/www/wavemax/...`, `/var/www/crhs-corporate/...`), independent `git pull`s. `build:assets` list partitioned per repo; `/assets` + `/locales` cross-origin CORS behavior preserved on whichever origin owns each (embedded absolute `rundberglaundry.com/assets/...` URLs must be re-pointed or both apps serve an identical `/assets` tree — resolved in Phase 4).

---

## 5. Phases — scope, sequencing, acceptance

### Phase 1 — Build `crhs-web-core` (new repo)
Create the `crhs-web-core` repo and build the shared security/infra core (§3.C) there by **copying** the modules out of the existing monorepo and **modularizing** what is currently inline in `server.js` (the CSP builder, header block, CORS) into clean package modules. The existing repo is **not** modified. Strict TDD: each core module gets a failing unit test first (CSP directive output, nonce injection, encryption round-trip, rate-limit store, email transport, SystemConfig defaults, etc.).
**Acceptance:** `crhs-web-core` builds + publishes (git-installable package); its test suite is green and covers every exported module; a golden-master test asserts the CSP header + nonce-injection output is byte-identical to what the existing `server.js` produces today; `madge --circular` clean. The existing monorepo is unchanged (verified: no diff).

### Phase 2 — Repo + deploy split
**Detailed spec: [`2026-08-22-phase2-crhs-corporate-split-design.md`](2026-08-22-phase2-crhs-corporate-split-design.md).** Scope **narrowed** during Phase-2 brainstorming to **`crhsent.com` content only** (the clean host-separable cut: crhsent site + `/wavemax` mediator/sales + demos + `accessGate`/`mediatorGate`) — the Austin domains are path-mixed (service app served on every host), so franchise marketing + design-explorer + `franchisePreview` are **deferred to Phase 4** (which restructures those domains). web-core stays private, consumed via an SSH deploy key on the boxes; the monorepo is left as-is (only `crhs-corporate` is built); nginx `server_name crhsent.com → :3001`; shared Mongo with per-app ensure-indexes.
**Acceptance:** each app boots standalone and serves its hosts; corporate gates (accessGate/mediatorGate/franchisePreview) work from the corporate app; service app has zero corporate routes; both deploy independently; shared MongoDB reads/writes correct; no cross-repo `require`.

### Phase 3 — De-brand the service repo
Per `2026-08-22-debrand-brand-config-design.md`, now applied to the smaller service repo (most bucket-4 "about-WaveMAX" content has moved to corporate). `server/config/brand.js` (env-sourced, generic default), display→config, non-display→"Laundromat", guard test.
**Acceptance:** `git grep -i wavemax` in the service repo (minus deferred infra) = 0; page shows "Laundromat" default / "WaveMAX Austin" with env; 4-lang parity; build+tests green.

### Phase 4 — Domain migration
`wavemax.promo` → new primary domain; update refs + routing; 301 alias retained; re-point cross-origin `/assets` URLs; email/DB/Firebase disposition. Separate Phase-4 spec.

---

## 6. Decisions locked (2026-08-22)

- Shared core = **extract `@crhs/web-core` package** (not duplicate, not submodule).
- Database = **shared MongoDB**.
- Sequence = **modularize → split → de-brand → migrate**.
- Service repo stays `wdf-affiliate-program`; corporate repo proposed **`crhs-corporate`** (name to confirm); core repo **`crhs-web-core`**.
- Brand value (Phase 3) = env-only, production `BRAND_DISPLAY_NAME="WaveMAX Austin"`, committed default generic "Laundromat".
- App host (Phase 4) leaning `atxwashdryfold.com/<path>`; crhsent.com stays corporate.

---

## 7. Risks & mitigations

1. **Inline security core is the hardest lift** (risk #1). Mitigation: Phase 1 does it in-place with a byte-identical-headers integration test before any split.
2. **Host routing moves from app code to nginx** — a host can fall through to the wrong app. Mitigation: explicit `server_name` map + a per-host smoke test in Phase 2.
3. **Shared-DB init races / index ownership.** Mitigation: one owner for `SystemConfig.initializeDefaults`; per-app `ensure-indexes` scoped to owned models.
4. **Shared secrets drift** invalidates cookies/tokens on one side. Mitigation: single secret source synced to both `.env`; document the coupling.
5. **Cross-origin `/assets` + i18n** absolute URLs. Mitigation: keep an identical `/assets` origin during Phase 2; re-point in Phase 4.
6. **`@crhs/web-core` versioning drift** between apps. Mitigation: pin exact version; CI check both apps build against the same core version.

---

## 8. Open items (confirm on review)

- Corporate repo name (`crhs-corporate`?), core repo/package name.
- `@crhs/web-core` distribution: own git repo + npm-style install, or a monorepo workspace? (Leaning: own repo, install via git URL / private registry.)
- Gray-zone final calls (§3.D). **Resolved 2026-08-27 (Decision A):** the `affiliateApplication` recruitment form stays in the **service** app for now (revisit if/when corporate expands).
- Where `@crhs/web-core` is published (private registry vs git dependency).
- Phase-4 specifics (domain, email addresses, DB/Firebase renames) — deferred to the Phase-4 spec.

---

## 9. Next step

On approval → invoke `superpowers:writing-plans` for the **Phase 1** implementation plan (extract `@crhs/web-core`), the first executable sub-project. Phases 2–4 get their own specs/plans as we reach them.
