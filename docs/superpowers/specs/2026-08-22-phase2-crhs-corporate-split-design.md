# Phase 2 — `crhs-corporate` split (crhsent.com) Design

**Date:** 2026-08-22
**Status:** Design — awaiting review
**Type:** Phase 2 of the program in [`2026-08-22-service-corporate-split-program-design.md`](2026-08-22-service-corporate-split-program-design.md). Builds on Phase 1 (`@crhs/web-core` v0.1.0, published private at `github.com/rhoulihan/crhs-web-core`).

> Scope was narrowed from the program spec's §3.B during Phase-2 brainstorming: only `crhsent.com` is cleanly host-separable. The Austin domains (`rundberglaundry.com`/`runberglaundry.com`/`atxwashateria.com`/`atxwashdryfold.com`) are **path-mixed** — the service app (`/api`, `/admin`, `/operator`, `/scanbag`, `/claim`, embed) is mounted at the app level and served on every host. So franchise marketing + design-explorer stay in the monorepo for now and move later (folded into Phase 4, which restructures those domains).

---

## 1. Goal & scope

Extract the **`crhsent.com`-hosted corporate content** — the CRHS corporate site + the `/wavemax` mediator & sales pages + demos + the crhsent access gates — into a **new, independently-deployed app** (`crhs-corporate`) that consumes `@crhs/web-core`, and cut `crhsent.com` over to it via nginx. Everything else (the monorepo, the Austin domains, the service app) is untouched.

**Decisions (locked, Phase-2 brainstorm 2026-08-22):**
- **Scope = `crhsent.com` content only** (clean `server_name` split). Franchise marketing + design-explorer deferred.
- **web-core consumption:** keep web-core **private**; add a **read-only SSH deploy key** for `crhs-web-core` to both OCI boxes; `crhs-corporate` depends on `git+ssh://git@github.com/rhoulihan/crhs-web-core.git#v0.1.0`.
- **Service app:** the monorepo is **left as-is**; only `crhs-corporate` is built. It consumes web-core; the monorepo does not (yet — Phase 3).
- **Ops cutover:** Claude drafts + applies nginx + the 2nd PM2 app, deploys DARK, verifies, and flips `crhsent.com → :3001` with Rick's confirmation.
- **Build model:** greenfield-copy (like Phase 1) — copy content out of the monorepo, never modify it; clean rollback = don't flip nginx.

---

## 2. Target architecture

New repo **`crhs-corporate`** (`/mnt/c/Users/rickh/GitHub/crhs-corporate`) → PM2 app `crhs-corporate` on **:3001**, serving **only** `crhsent.com`. Depends on `@crhs/web-core`. Talks to the **shared** MongoDB. nginx routes `crhsent.com → :3001`; the monorepo keeps serving every other host on :3000 (its now-dormant crhsent handler is simply never reached).

```
Cloudflare ─ nginx ─┬─ server_name crhsent.com          → :3001  crhs-corporate  (NEW)
                    └─ (all other server_names)          → :3000  wavemax (monorepo, unchanged)
```

---

## 3. `crhs-corporate` inventory (what moves — copied from the monorepo)

- **Content:** the entire `crhsent/` tree (48 files) → `crhs-corporate/content/` — corporate site (`index/about/work/capabilities/contact/owners/404`), `crhsent/wavemax/*` (mediator + `$500/mo` sales landing + `clickjacking-demo` + `load-order-demo` + `security-audit` + app.js/back-to-offer/styles/favicon), `crhsent/assets/*` (css/js/fonts/img), `crhsent/robots.txt`, `crhsent/sitemap.xml`.
- **The crhsent host handler** (monorepo `server.js:583-606`) → `crhs-corporate/server/crhsentHandler.js`: clean-URL + path-traversal-guarded static serve of `content/`, HTML nonce-injected via `webCore.cspHelper.readHTMLWithNonce`, `no-cache`. (The `host !== 'crhsent.com'` guard is kept defensively even though nginx only routes crhsent.com here.)
- **Gates:**
  - `accessGate.js` → `crhs-corporate/server/middleware/accessGate.js` + models `AccessGate`, `AccessWhitelist`, `AccessClick`, `AccessRequest` → `crhs-corporate/server/models/`. Rewire its requires to web-core: `verifyPassword`←`webCore.encryption`, `logger`←web-core, `clientIp`←web-core, `sendEmail`←`webCore.email.transport`, `SystemConfig`←`webCore.SystemConfig`. Runs `loadCache`/`startCacheRefresh` on DB connect. DARK unless `ACCESS_GATE_*`.
  - `mediatorGate.js` → `crhs-corporate/server/middleware/mediatorGate.js` + model `MediatorAccess`. **Rewire the `require('./adminIpGate')` cross-import** to build its admin-IP check from `webCore.ipGate` (the factory) — no service-repo dependency. DARK unless `MEDIATOR_GATE_ENABLED=true`.
- **Deferred (NOT in crhs-corporate):** `franchisePreview` (DARK; coupled to the franchise renderer that stays in the monorepo — its crhsent `/__preview/*` paths hit :3001 and no-op, which is fine while dark); `partnerLanding`, `locationQuarantine`, `franchiseController`, design-explorer, franchise marketing (all Austin-domain / path-mixed).

## 4. `crhs-corporate/server.js` (composed from web-core)

Middleware order mirrors the monorepo's crhsent path:
1. `trust proxy`, `webCore.cspNonce`
2. `webCore.securityHeadersMiddleware()` + the CSP header built via `webCore.buildCspDirectives({path, nonce, useStrictCSP: webCore.isStrictCspPath(path,…), isClickjackingDemo})` + `webCore.serializeCspDirectives` (the `/wavemax/*` path resolves strict; the clickjacking-demo path widens frame-src — same logic web-core golden-mastered)
3. `webCore.corsConfig`, cookie/body parsing, `webCore.buildSessionMiddleware({mongoUrl, secret, ttlSeconds})`
4. `webCore.sanitization`, `webCore.rateLimiting` (API-scoped; corporate has few endpoints)
5. `accessGate` → `mediatorGate` → **crhsentHandler**
6. `webCore.errorHandler`

`GET /health` (a tiny route before the crhsent handler) for the PM2/nginx check. crhsent.com's `robots.txt` + `sitemap.xml` are **static files in the `crhsent/` tree** served by the crhsentHandler — no generator needed (in the monorepo the crhsent handler already runs before the per-host robots/sitemap generator, so crhsent.com serves the static files). No `/api/v1` service surface. No franchise/marketing routes.

## 5. web-core consumption (private dep)

- `crhs-corporate/package.json`: `"dependencies": { "@crhs/web-core": "git+ssh://git@github.com/rhoulihan/crhs-web-core.git#v0.1.0", … }`. (Pin the tag; bump deliberately.)
- **Boxes:** generate a **read-only SSH deploy key** on the `crhs-web-core` GitHub repo; install the private key on **both** OCI boxes (`~/.ssh/crhs_web_core_deploy` + a `~/.ssh/config` `Host github.com-crhs-web-core` entry, or an `IdentitiesOnly` entry), so `npm install` fetches web-core over SSH. Document the exact key path + config in the deploy runbook. Local dev (Rick's machine) already has repo access.
- web-core's own runtime deps (helmet, cors, express-*, mongoose, nodemailer, mongodb, winston, …) install transitively.

## 6. Deployment

- **PM2:** `crhs-corporate/ecosystem.config.js` → `{ name: 'crhs-corporate', script: 'server.js', instances: 2, exec_mode: 'cluster', env: { NODE_ENV: 'production', PORT: 3001 } }` (corporate is near-static → 2 instances, not `max`). Separate checkout `/var/www/crhs-corporate/`.
- **Shared MongoDB:** same `MONGODB_URI`. `crhs-corporate/scripts/ensure-indexes.js` provisions **only** its models (`AccessGate/Whitelist/Click/Request`, `MediatorAccess`) — idempotent, coexists with the monorepo's ensure-indexes. `SystemConfig.initializeDefaults()` stays owned by the monorepo (service); crhs-corporate only READS SystemConfig (`access_gate_enabled`, etc.).
- **Secrets** (`crhs-corporate/.env` on the boxes): `MONGODB_URI`, `SESSION_SECRET`, `JWT_SECRET`, `ENCRYPTION_KEY`, `EMAIL_*` (accessGate access-request mail), `ACCESS_GATE_*`, `MEDIATOR_GATE_ENABLED`, `ADMIN_ALLOWLIST`+`STORE_IP_ADDRESS` (mediatorGate admin-IP), `CORPORATE_SITE_URL`, `PORT=3001`. Use the **same** secret values as the monorepo (the gate unlock cookies were set there pre-cutover; matching avoids invalidating them — though both gates are DARK today so it's low-stakes).
- **nginx:** add a `server { server_name crhsent.com; … proxy_pass http://127.0.0.1:3001; }` block (mirroring the existing proxy headers) on both boxes; the existing block stops matching crhsent.com. Cloudflare already fronts crhsent.com.

## 7. Phasing (each step reversible; the flip is the only outward-facing one)

1. **Build** `crhs-corporate` greenfield (copy §3, wire §4, strict TDD). Monorepo untouched (verified 0 diff).
2. **Test locally:** crhsent pages render identically to the monorepo (parity test); accessGate + mediatorGate allow/deny (ported tests); server boots + serves `Host: crhsent.com`.
3. **Deploy key:** create the read-only deploy key, install on both boxes; verify `npm install` pulls web-core on a box.
4. **Deploy DARK:** checkout + `npm install` + `pm2 start` crhs-corporate:3001 on both boxes. nginx still routes crhsent.com → :3000. Verify on-box: `curl -H 'Host: crhsent.com' http://localhost:3001/` serves the crhsent home.
5. **Cutover (Rick confirms):** point nginx `crhsent.com → :3001` on both boxes, reload nginx. Verify `crhsent.com` live (home, `/wavemax` gated correctly, CSP headers match, `/work` clean URL).
6. **Rollback:** revert nginx to `crhsent.com → :3000` (the monorepo's crhsent handler is still there) + reload. Instant.

## 8. Testing (strict TDD)

- **crhsent parity:** for each `crhsent/**/*.html`, `crhs-corporate`'s handler serves byte-identical HTML (modulo the per-request nonce) to `readHTMLWithNonce` on the monorepo source — a golden-style test over the tree.
- **Gate integration (per program spec §3.E — allow AND deny):**
  - `accessGate`: gated host → 401 landing; correct password → unlock cookie; whitelist IP bypass; admin bypass; DARK when disabled.
  - `mediatorGate`: port the 10 mediatorGate tests (prompt/bind/deny/home-bypass/admin-reset, IPv6 cookie parse); verify the admin-IP check now builds from `webCore.ipGate`.
- **Boot/serve:** app boots, connects mongodb-memory-server, serves `Host: crhsent.com` home + a `/wavemax` page (gated), returns 403 on path traversal, 404-ish on non-crhsent host.
- **web-core integration:** a test that `require('@crhs/web-core')` resolves and the composed CSP header for a `/wavemax/*` path is strict.
- Suite green, no `--forceExit`.

## 9. Acceptance criteria

- `crhs-corporate` boots standalone consuming `@crhs/web-core`; serves all `crhsent.com` content identically to the monorepo (parity test green).
- `accessGate` + `mediatorGate` work from crhs-corporate with allow+deny proven; mediatorGate has no service-repo import.
- Monorepo unchanged (`git status` clean but for the 2 pre-existing PNGs).
- Deploy key lets both boxes `npm install` web-core; crhs-corporate runs on :3001.
- After the nginx flip, `crhsent.com` serves from :3001 with byte-identical pages + CSP; rollback (nginx → :3000) verified to restore instantly.

## 10. Risks & mitigations

1. **Private web-core install on the boxes** (deploy key). → Verify `npm install` on one box before any cutover (phase step 3).
2. **crhsent CSP parity** (the `/wavemax` strict CSP + inline styles). → web-core's golden-mastered `buildCspDirectives`/`serializeCspDirectives` + a parity test asserting the emitted CSP for `/wavemax/*`.
3. **mediatorGate adminIpGate cross-import.** → rebuilt on `webCore.ipGate`; covered by the ported gate tests.
4. **Shared-Mongo gate-model index ownership.** → per-app idempotent ensure-indexes; SystemConfig init stays monorepo-owned.
5. **Cutover regression** (a crhsent path 404s on :3001). → DARK deploy + on-box `Host: crhsent.com` verification before the flip; nginx rollback is instant.
6. **Secret drift** invalidating gate cookies. → reuse the monorepo's secret values; gates are DARK today anyway.

## 11. Deferred to later phases (recorded so nothing is lost)

Franchise marketing (`franchise.html`, `franchiseController`, austin pages, `partnerLanding`, `domainSeoOverrides`, `scripts/franchise-build`), design-explorer, `franchisePreview` (+ its gbp/preview services + `FranchisePreviewRequest`), corporate inquiry (`corporateInquiryRoutes`, `affiliateApplication*`) — all path-mixed on the Austin domains. These move when those domains are restructured (**Phase 4**), or in a dedicated Phase-2b with path-based nginx if pulled forward.

## 12. Next step

On approval → `superpowers:writing-plans` for the Phase-2 implementation plan (greenfield build of `crhs-corporate`, strict TDD, subagent-driven). Deploy-key setup + the nginx cutover are ops steps executed with Rick's confirmation, not code tasks.
