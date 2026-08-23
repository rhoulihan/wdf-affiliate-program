# Phase 4a — Domain Migration (`wavemax.promo` → `portal.atxwashdryfold.com`) + Identifier Renames

**Date:** 2026-08-23
**Status:** Design — awaiting review
**Author:** CRHS (Rick Houlihan) + Claude
**Follows:** Phase 3 de-brand ([`2026-08-22-debrand-brand-config-design.md`](2026-08-22-debrand-brand-config-design.md), shipped + live 2026-08-23). This is **sub-project 4a** of the Phase-4 program (the deferred domain migration + subsystems); the deferred-subsystem de-brand (4b: Austin marketing, franchise/corporate multi-tenant, design-explorer) is a **separate** spec.

---

## 1. Goal & non-goals

**Goal.** Retire `wavemax.promo` as the affiliate/customer/operator application's canonical host and move the app to **`portal.atxwashdryfold.com`** (a new subdomain, app served from root — no path prefix), keeping `wavemax.promo` as an **indefinite path-preserving 301 alias**. In the same cutover, rename the residual non-display WaveMAX **identifiers** the Phase-3 guard allowlisted (session cookie, JWT issuer/audience, log service tag) and — as an independent companion workstream — the WaveMAX-named **asset files and CSS class names**.

**Decisions locked (brainstorming 2026-08-23).**
- App URL: **`portal.atxwashdryfold.com`** (subdomain, chosen over a `/portal/` path after the path option was sized at ~664 absolute-reference rewires; the subdomain keeps the app root-relative).
- Access model: **direct** (users hit the app's own host; there is no external WordPress parent iframe to update).
- Email FROM: **`no-reply@crhsent.com`** (aligns with the `mail.crhsent.com` transport where SPF/DKIM already validate); email links / `BASE_URL` move to the new domain.
- `wavemax.promo` → **indefinite 301** (not sunset).

**Non-goals.**
- **DB name `wavemax`** and the **Firebase project id `wavemax-bag-registration`** stay as-is — renaming the DB is a data migration (internal identifier, not user-visible); the Firebase project id is immutable.
- **Deferred to 4b** (the franchise/marketing de-brand): `wavemax.promo` (and any WaveMAX) references inside `public/data/franchises/**` (76 franchise multi-tenant files), the franchise/corporate subsystems, and the Austin marketing embeds. This spec touches **app-scope** references only.
- **Docs / `*.md`** references — not runtime; out of scope.
- No display-brand change (Phase 3 already resolves the display brand from `server/config/brand.js`; production stays `BRAND_DISPLAY_NAME="WaveMAX Austin"`). This migration is about the **host** and **identifiers**, not the visible brand name.

---

## 2. Current state (measured)

The app is already a **multi-domain** Express app: `server.js` self-canonicalizes by `req.hostname` across `rundberglaundry.com` (default fallback), `atxwashdryfold.com`, `atxwashateria.com`; `wavemax.promo` is already annotated *"transition: still 301s during retirement"* in the `allowedHosts` list. `atxwashdryfold.com` already has nginx `server_name` blocks on both OCI boxes and appears in the app's CSP origins, SEO overrides, and iframe bridges. **So 4a finishes an in-progress cutover; it does not build multi-domain support from scratch.**

App-scope `wavemax.promo` and identifier sites (exact):
- `server.js:177` `allowedHosts` (`wavemax.promo`, `www.wavemax.promo`, `affiliate.wavemax.promo`).
- `server.js:398` `img-src`, `:399` `connect-src`, `:483` `frame-src` self-origin lists.
- `server.js:660-661` session cookie name (`__Host-wavemax.sid` prod / `wavemax.sid` dev).
- `server.js:1170` default-host fallback (`'rundberglaundry.com'` — leave; it is the marketing-host SEO default).
- `server/services/authTokenService.js:42-43` JWT `issuer:'wavemax-api'`, `audience:'wavemax-client'`.
- `server/utils/logger.js:27` `service:'wavemax-affiliate'`.
- `server/services/email/transport.js:69` FROM = `process.env.EMAIL_FROM || … || 'noreply@rundberglaundry.com'`; `BASE_URL` used across email templates + `server/services/email/**`, `inviteService.js`, `labelSheetService.js`, `systemHealthService.js`.
- `public/.well-known/security.txt` (contact on `wavemax.promo`).
- `package.json` `name:'wavemax-affiliate-program'` + a stale `repository.url` (`yourusername`).

Asset files (WaveMAX-named, to rename): `public/assets/css/wavemax-{affiliate,components,embed,mhr-chrome,mhr-modal,theme}.css` (+ `.min` for components/mhr-chrome), `public/assets/images/brand/logo-wavemax.png`, `logo-wavemax-thermal.png`, `public/assets/images/wavemax-affiliate-og.png`, `public/assets/flyers/wavemax-affiliate-flyer-*.pdf`.

CSS class names (~20 distinct, WaveMAX-named): `wavemax-blue`, `wavemax-light-blue`, `wavemax-primary`, `wavemax-accent`, `wavemax-affiliate{,-container,-header,-iframe,-ad,-og}`, `wavemax-embed{,-container}`, `wavemax-iframe`, `wavemax-language`, `wavemax-mhr-chrome`, `wavemax-mhr-modal`, `wavemax-modal-chrome`, `wavemax-hibu-refresh`, `wavemax-austin-affiliate-program`. **Some double as functional identifiers** (DOM ids / postMessage tags / storage keys — e.g. `wavemax-iframe`, `wavemax-language`, `wavemax-embed`); those must be renamed on **both** sides (producer + consumer) or left as an allowlisted functional token — see §5.

---

## 3. Two workstreams

The work splits by **cutover-coupling**:

- **W1 — Domain cutover (atomic).** Everything that defines the app's host identity: `BASE_URL`, `allowedHosts` + the canonical 301, CSP self-origins, the session cookie name, the JWT issuer/audience, the log service tag, the email FROM, robots/sitemap/security.txt canonical URLs, `package.json` name, plus the nginx/CF/DNS provisioning. **These land together in one deploy** because the cookie + JWT rename (and the host change itself, since cookies are host-bound) force a **one-time re-login/re-auth** for every user; doing them in one window means one reset, not several.
- **W2 — Asset + CSS-class renames (independent).** Renaming the WaveMAX-named asset files and CSS class names is pure find-replace + cache-bust; it does **not** require the cutover and can ship before, with, or after W1. Keeping it a separate workstream keeps the risky cutover diff small.

The implementation plan may sequence **W2 first** (safe, no re-login) then **W1** (the cutover), or ship both together — the plan decides. This spec defines both.

---

## 4. W1 — Domain cutover

### 4.1 Canonical host + `BASE_URL`
- Production `.env`: `BASE_URL=https://portal.atxwashdryfold.com`. `BASE_URL` already drives email links + canonical/absolute URLs; no new plumbing.
- `.env.example`: document `BASE_URL` with the new-domain shape + a generic example.

### 4.2 Host allowlist + canonical 301
- `server.js:177` `allowedHosts`: **add** `portal.atxwashdryfold.com` (and `www` if used). Keep the `wavemax.promo` hosts.
- Add a **canonical-host redirect**: any request whose host is one of the retired `wavemax.promo` hosts → `301 https://portal.atxwashdryfold.com${req.originalUrl}` (path + query preserved). This sits alongside the existing HTTPS-redirect logic (`server.js:174-192`). `atxwashdryfold.com` (apex, marketing) and the other marketing hosts are unaffected — only the `wavemax.promo` set 301s to the portal host.

### 4.3 CSP self-origins
- Add `https://portal.atxwashdryfold.com` to the self-origin entries in `img-src` (`server.js:398`), `connect-src` (`:399`), and `frame-src`/`frame-ancestors` (`:483` and the frame-ancestors directive). `atxwashdryfold.com` is already present. `wavemax.promo` entries may remain during the transition (harmless) or be dropped once the 301 is live — the plan picks one and is consistent.

### 4.4 Session cookie
- `server.js:660-661`: rename `__Host-wavemax.sid` / `wavemax.sid` → **`__Host-portal.sid` / `portal.sid`** (neutral). The `__Host-` prefix mandates `Secure`, `Path=/`, and **no `Domain`** → the cookie is automatically host-scoped to `portal.atxwashdryfold.com`. Because cookies are host-bound, the move off `wavemax.promo` already drops the old cookie; the rename is therefore free.
- **Consequence:** every active session ends at cutover; users re-login once. Inherent to the domain change — communicate, don't mitigate.

### 4.5 JWT issuer/audience
- `authTokenService.js:42-43`: `issuer:'wavemax-api'` → `'crhs-portal-api'`; `audience:'wavemax-client'` → `'crhs-portal-client'` (both verified on decode). **Existing access tokens (1h TTL) and stored `RefreshToken`s fail issuer/audience validation → users re-auth.** This is the same one-time reset as §4.4, in the same cutover window. No token-table migration; invalid refresh tokens are simply re-issued on next login. (Confirm the decode path enforces issuer/audience so old tokens are rejected cleanly, not silently accepted.)

### 4.6 Log service tag
- `logger.js:27`: `service:'wavemax-affiliate'` → `'crhs-portal'`. Cosmetic (log metadata); no behavior change.

### 4.7 Email
- Production `.env`: `EMAIL_FROM=no-reply@crhsent.com`. `transport.js:69` already reads `EMAIL_FROM`; the display name comes from `brand.displayName` ("WaveMAX Austin"), so the From renders `"WaveMAX Austin" <no-reply@crhsent.com>`.
- `EMAIL_HOST` / transport servername unchanged (`mail.crhsent.com`). Email **links** follow `BASE_URL` (§4.1) → new domain automatically.
- `.env.example`: update the `EMAIL_FROM` example to the `crhsent.com` shape.

### 4.8 robots / sitemap / security.txt / package.json
- `public/.well-known/security.txt`: contact/canonical URLs → `portal.atxwashdryfold.com` (or `crhsent.com` for the security contact — plan confirms which is intended).
- robots.txt / sitemap (served from the origin route): app canonical URLs → new host.
- `package.json`: `name` → `wdf-affiliate-program` (aligns with the renamed repo); fix the stale `repository.url` placeholder to the real `github.com/rhoulihan/wdf-affiliate-program`.

### 4.9 Ops (cutover runbook — executed at deploy, not in the code PR)
1. **CF DNS:** add a proxied `portal.atxwashdryfold.com` record pointing at the app origin/LB (mirror the existing `atxwashdryfold.com` setup). Confirm the CF origin cert covers `*.atxwashdryfold.com` (or add a cert/hostname).
2. **nginx (both OCI boxes):** add a `server_name portal.atxwashdryfold.com;` server block → `proxy_pass http://localhost:3000;` with the standard proxy headers (mirror the `wavemax.promo` block). `nginx -t` + reload.
3. **Deploy code** (W1 branch) to both boxes; set the new `.env` values (`BASE_URL`, `EMAIL_FROM`); `pm2 reload wavemax --update-env`.
4. **Flip `wavemax.promo`** to the 301 (app-level §4.2 handles it once deployed; the nginx `wavemax.promo` block keeps proxying so the app can emit the redirect).
5. **Verify** (see §7): portal host serves the app, `wavemax.promo/*` 301s path-preserved, login works (fresh cookie/JWT), an email renders the new From + links.
6. **CF cache purge** for any changed static assets.

---

## 5. W2 — Asset files + CSS class renames

### 5.1 Asset files
Rename to neutral names and update every reference + the build config:
- `logo-wavemax.png` → `logo.png`; `logo-wavemax-thermal.png` → `logo-thermal.png`; `wavemax-affiliate-og.png` → `affiliate-og.png`.
- `wavemax-{affiliate,components,embed,mhr-chrome,mhr-modal,theme}.css` → drop the `wavemax-` prefix (`affiliate.css`, `components.css`, `embed.css`, `mhr-chrome.css`, `mhr-modal.css`, `theme.css`). Update the `ASSETS` array in `scripts/build-assets.js` (which lists `wavemax-components.css` + `wavemax-mhr-chrome.css`) and regenerate the `.min` outputs.
- `wavemax-affiliate-flyer-*.pdf` → neutral (referenced by the flyers tool, currently guard-excluded — confirm scope; low priority).
- Bump `?v=` cache-busters on every changed asset ref; CF purge at deploy.

### 5.2 CSS class names
Rename the ~20 `wavemax-*` classes to a neutral prefix (proposed: `brand-*` for palette classes — `brand-blue`, `brand-light-blue`, `brand-primary`, `brand-accent` — and `portal-*` / semantic names for structural ones). Update every occurrence across `public/*.html`, `public/assets/css/*.css`, and `public/assets/js/*.js` (+ rebuild `.min`).

**Functional-identifier caution:** several `wavemax-*` tokens are not styling — they are DOM ids, postMessage tags, or storage keys (`wavemax-iframe`, `wavemax-language`, `wavemax-embed`, and the `wavemax-embed` postMessage tag / `wavemax-language` storage key the Phase-3 guard allowlisted). Each must be renamed on **both** the producer and consumer side atomically, or deliberately left as an allowlisted functional token. The plan inventories each and picks rename-vs-keep per token; a rename that touches only one side is a defect.

---

## 6. Left as-is / deferred (explicit)

- **DB name `wavemax`**, **Firebase project `wavemax-bag-registration`** — internal/immutable, not migrated.
- **Franchise data** (`public/data/franchises/**`, 76 files) + franchise/corporate subsystems + Austin marketing + design-explorer — their `wavemax.promo`/WaveMAX refs are **4b**.
- **`docs/**`, `*.md`** — not runtime.
- **Trademark/proprietary legal notices** — kept literal (Phase-3 decision).
- **PM2 process name** — already parameterized (`PM2_APP_NAME || 'laundromat'`, set to `wavemax` in prod env); the live process name is an ops choice, unchanged here.

---

## 7. Testing (TDD) & acceptance

**Integration/unit tests (red-first where a seam changes):**
1. **Host canonicalization** — a request with host `wavemax.promo` (and `www.`/`affiliate.`) returns `301` to `https://portal.atxwashdryfold.com` with path + query preserved; a request with host `portal.atxwashdryfold.com` is served (not redirected); `atxwashdryfold.com` apex + other marketing hosts are unaffected.
2. **Cookie name** — the session cookie is issued as `portal.sid` / `__Host-portal.sid` (per env), never `wavemax.sid`.
3. **JWT issuer/audience** — tokens are signed and **verified** with `crhs-portal-api` / `crhs-portal-client`; a token bearing the old `wavemax-api`/`wavemax-client` is **rejected** on decode.
4. **Email** — `transport` renders From `"WaveMAX Austin" <no-reply@crhsent.com>` when `EMAIL_FROM` is set; a rendered template's links use `BASE_URL` (assert the new host).
5. **Asset integrity (W2)** — no HTML/JS/CSS references a renamed-away `wavemax-*.css` / `logo-wavemax.png`; `build-assets.js` produces the neutral `.min` files; every functional-token rename has both sides updated (a targeted test per functional token).
6. **Domain guard** — extend the Phase-3 branding guard (or add a companion `domain-guard`) so a **new** un-allowlisted `wavemax.promo` in **app scope** fails CI (franchise-data/docs stay excluded, mirroring the branding guard's exclusion set). This is the regression net that keeps the migration from silently un-migrating.

**Acceptance criteria:**
- `git grep -n 'wavemax\.promo'` over app scope (excluding franchise-data, docs, and the retained `allowedHosts` 301-source entries) returns only the deliberate 301-alias references.
- No committed `wavemax.sid` / `wavemax-api` / `wavemax-client` / `wavemax-affiliate` (log tag) / `wavemax-*.css` / `logo-wavemax.png` outside allowlisted functional tokens.
- Full suite green (no `--forceExit` regressions beyond the pre-existing baseline).
- Post-deploy: `portal.atxwashdryfold.com` serves the app; `wavemax.promo/<path>` 301s to it; a fresh login issues the new cookie/JWT; a test email renders the new From + links; browser render shows no console/CSP errors on the new origin.

---

## 8. Risks & rollback

- **One-time session/token reset** (cookie + JWT + host change). Inherent; communicate to users/operators; schedule the cutover off-peak.
- **CF/DNS/TLS for the subdomain must be live before the code cutover** — otherwise the portal host 502s. Provision + verify `portal.atxwashdryfold.com` (proxied, cert valid) first.
- **CSP misses** — a missed self-origin entry blocks resources on the new host; the browser-render acceptance check catches it.
- **Asset cache-bust** — stale CF/browser cache serving old asset names; bump `?v=` + CF purge.
- **Rollback:** the code is backward-compatible while both host sets are allowed. To roll back, revert the `.env` (`BASE_URL`/`EMAIL_FROM`) and hold the `wavemax.promo` 301 (keep it serving the app instead of redirecting); the cookie/JWT rename means a second re-login on rollback, but no data loss. Keep `wavemax.promo` DNS/nginx alive throughout (it's the alias anyway).

---

## 9. Execution note

W2 (asset/CSS-class renames) is large and mechanical; W1 (domain cutover) is small but high-stakes and ops-coupled. The implementation plan (via writing-plans) will likely: land W2 first behind the domain guard, then W1 as a tight cutover PR + the ops runbook (§4.9) executed at deploy. The domain guard (§7.6) is written first as the regression net.
