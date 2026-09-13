# Plan 2 — `crhs-corporate` becomes the multi-host content app (dark launch on `:3001`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Agentic-worker note (mandatory, applies to every task in this plan).** Each task is executed by a fresh worker with **no memory of this conversation and no knowledge of sibling tasks**. Everything a worker needs is inside its own task block. Before writing production code invoke `superpowers:test-driven-development`; before claiming a task complete invoke `superpowers:verification-before-completion`. Never mark a step done on an unrun command. If a file does not match the line numbers quoted in a task, STOP, re-read the file and locate the target BY CONTENT — Plan 1 shifted line numbers repeatedly. Line numbers here were read from the working trees on **2026-09-13**: affiliate `main` @ `70a60bc4`, web-core `main` @ `2dcd6ff` (tag `v0.2.0`), corporate `main` @ `8133667`.

**Goal:** `crhs-corporate` stops being a single-host crhsent.com server and becomes the content app for five hosts — `crhsent.com` (behaviour byte-unchanged) plus `atxwashdryfold.com`, `rundberglaundry.com`, `runberglaundry.com`, `atxwashateria.com`, which serve ONE content tree (the atxwashdryfold theme) with `rel=canonical` → `https://atxwashdryfold.com` — shipped **DARK** on `:3001` on both boxes and verified on-box, with web-core `v0.2.1` and the Phase-0 prerequisites closed.

**Not in Plan 2:** the nginx host flips (Plan 3), the affiliate content removal and the five retired CSRF intake rows (Plan 3), the Item-A bridge retirement and `securityHeaders.js:83-88` (Plan 3), and the affiliate inline-copy adoption PRs B5–B14 including B7 (Plan 4).

**Architecture:** Three repos, one shared library, two pm2 processes per OCI box (oci1 `161.153.71.201`, oci2 `144.24.4.202`). Plan 2 adds host resolution and a multi-root content handler to corporate, moves the marketing tree, intake endpoints and their rate-limit policy into it, and cuts `@crhs/web-core` `v0.2.1` for the email/i18n/brand-neutral work Plan 1 deferred. Everything lands behind nginx that still routes the marketing hosts to `:3000`, so `proxy_pass` back to the affiliate remains a valid rollback until Plan 3.

**Tech Stack:** Node 20+ · Express 4.x · Mongoose 8.x (ONE instance per app since Plan 1) · Oracle Autonomous Database (shared `MONGODB_URI`) · connect-mongo 5.x · express-session 1.18.x · express-rate-limit 7.1.4 · csrf-csrf 4.x · Winston 3.x · Jest 29.7.0 + Supertest + mongodb-memory-server · PM2 cluster ×2 · nginx → Cloudflare LB pool `1e3795c02e98b9506cfab578c9cb7c97` "wavemax-oci".

**Spec:** `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/docs/superpowers/specs/2026-09-09-crhs-content-separation-design.md` — Plan 2 implements **§5** (Item A, PRs A0–A9 per §5.13), **§7.2** rows **B3g / B3j / B3k** and **B4a**, the **§7.2.2 repo-wide `brandNeutral` guard**, **§9.1 Phase 0** (the P-items that are Plan 2 work) and **§9.2 Phase 0a**. Inherited deviations: `docs/refactor/plan1-exit-gate.md` §"Spec deviations Plans 2/3/4 inherit".

---

## Global Constraints

Derived from spec §15. **Where Plan 1 shipped something the spec did not anticipate, PLAN 1 WINS** and the line is marked ⚑. Every task's requirements implicitly include this section.

1. **Repos (local → on-box → process):** affiliate `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program` → `/var/www/wavemax/wavemax-affiliate-program` → pm2 `wavemax` `:3000`; corporate `/mnt/c/Users/rickh/GitHub/crhs-corporate` → `/var/www/crhs-corporate` (**rsync target, NOT a git checkout on the boxes**) → pm2 `crhs-corporate` `:3001`; web-core `/mnt/c/Users/rickh/GitHub/crhs-web-core` → rsync to `/var/www/crhs-web-core` → consumed as `file:../crhs-web-core` copied by `install-links`. ⚑ web-core is **`v0.2.0`, 26-key surface, 572 tests** (spec's `v0.1.2` / `c70d4712` / "541 tests" are stale).
2. **Boxes + edge:** `ssh -i ~/.ssh/oci_wavemax ubuntu@<ip>`. ⚑ CF LB monitor `be6953d2e0cfd7b40c4f414b5ddf20d9` = HTTPS `GET /health/origin`, `header.Host` `portal.atxwashdryfold.com`, `expected_codes 200`, `expected_body` EMPTY, `timeout 5`, `interval 60`, `retries 2` (Plan 1 Task 61 — supersedes the spec's `/health`). `/health/origin` returns 200 only when BOTH apps on the box serve. ⚑ **The CF API token (`~/.cf_api_token`, account-owned `cfat_`) expires 2026-09-16** — any Cloudflare action after that needs a fresh token (Account → Load Balancing: Monitors and Pools → Edit; verify at `/accounts/{id}/tokens/verify`, never `/user/tokens/verify`).
3. **Scope boundary:** Plan 2 ends with every marketing host serving correctly on `:3001` when addressed on-box as `curl -H 'Host: <host>' http://127.0.0.1:3001/…`. **No nginx vhost is retargeted in Plan 2.** The marketing hosts keep reaching `:3000` in production throughout.
4. **Canonical + brand on marketing hosts:** `<link rel="canonical" href="https://atxwashdryfold.com/…">` on every marketing page on every marketing host; atxwashdryfold theme everywhere; the only permitted mark is the literal `WaveMAX Austin` as the exclusive fulfillment partner; no hold page, no preview allowlist, no `PARTNER_PREVIEW_ALLOWLIST`.
5. **B7 legacy-path 301s (content app, mounted BEFORE accessGate/mediatorGate/crhsentHandler; GET/HEAD only; Host ∈ the 4 apex + 4 www marketing names; `res.redirect(301, 'https://portal.atxwashdryfold.com' + req.originalUrl)`):** `/embed-app-v2.html` (any query), `/admin`, `/admin/`, `/operator`, `/operator/`, `/operator-scan-embed.html`, `/scanbag`, `/scanbag/`, `/scanbag-manifest.json`, `/scanbag-sw.js`, `/monitoring-dashboard.html`, `GET /api/v1/customers/verify-email/*`. NEVER blanket-301 `/api/*` or `/assets/*`. `/wavemax-affiliate` → 301 `/affiliate` same host (D5, pending counsel). Store-IP (`STORE_IP_ADDRESS`, `ADDITIONAL_STORE_IPS`, `STORE_IP_RANGES`; store IP `72.190.1.227`) → 302 `https://portal.atxwashdryfold.com` + `req.originalUrl` on any marketing host, **mounted after B7** so a legacy app path always wins with a 301 (D7).
6. **Corporate env — TARGET (spec §15, exact keys):** `BRAND_DISPLAY_NAME=WaveMAX Austin`; `BASE_URL=https://atxwashdryfold.com`; `EMAIL_TEMPLATE_ROOT=/var/www/crhs-corporate/server/templates/emails`; `EMAIL_PROVIDER=smtp`; `EMAIL_HOST=158.62.198.7`; `EMAIL_PORT=587`; `EMAIL_USER=no-reply@crhsent.com`; `EMAIL_FROM=no-reply@crhsent.com` (**EMAIL_USER must own EMAIL_FROM** — the 2026-08-24 `553 5.7.1` outage); `EMAIL_TLS_SERVERNAME=mail.crhsent.com`; `PARTNER_INQUIRY_RECIPIENT=pickups@atxwashdryfold.com`; `AFFILIATE_APPLICATION_RECIPIENT=admin@crhsent.com`; `STORE_IP_ADDRESS`/`ADDITIONAL_STORE_IPS`/`STORE_IP_RANGES` = the portal's values; `LOG_SERVICE_NAME=crhs-corporate`; `LOG_DIR=/var/www/crhs-corporate/logs`; `SESSION_COOKIE_NAME=crhsent.sid`; `RATE_LIMIT_COLLECTION_PREFIX=ratelimit_corp_`; session `collectionName` `sessions_corporate`; `GATE_FROM` → `"CRHS Enterprises" <no-reply@crhsent.com>`; `MONGODB_URI` shared; `SESSION_SECRET`/`JWT_SECRET`/`ENCRYPTION_KEY` identical to the portal until Q-8 decides otherwise.
7. ⚑ **Corporate env — LIVE today (read-only, both boxes identical, 2026-09-13).** Present: `BASE_URL=https://rundberglaundry.com`; `EMAIL_PROVIDER=smtp`; `EMAIL_HOST=158.62.198.7`; `EMAIL_PORT=587`; `EMAIL_USER=no-reply@wavemax.promo`; `EMAIL_FROM=no-reply@wavemax.promo`; `LOG_DIR=logs`; `NODE_ENV=production`; `PORT=3001`; `STORE_IP_ADDRESS=72.190.1.227`; `STORE_IP_RANGES=2603:8080:db00:21b9::/64`; **`CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000,https://wavemax.promo`**; **`CORPORATE_SITE_URL=https://www.wavemaxlaundry.com`**. Absent: `BRAND_DISPLAY_NAME`, `EMAIL_TEMPLATE_ROOT`, `EMAIL_TLS_SERVERNAME`, `PARTNER_INQUIRY_RECIPIENT`, `AFFILIATE_APPLICATION_RECIPIENT`, `LOG_SERVICE_NAME`, `SESSION_COOKIE_NAME`, `RATE_LIMIT_COLLECTION_PREFIX`, `GATE_FROM`, `ADDITIONAL_STORE_IPS`. Consequences: `LOG_DIR` is set **RELATIVE**, so the change is a **REPLACE**, never "add if unset" (that wording would skip both boxes); `CORS_ORIGIN` must be **REMOVED** (finding F-1); `CORPORATE_SITE_URL` is inert (0 code references in corporate or web-core) and is **DELETED** as litigation residue.
8. **Affiliate env (Plan 3/4 owns the sweep; recorded so Plan 2 does not contradict it):** `BASE_URL=https://portal.atxwashdryfold.com`; `LOG_SERVICE_NAME=crhs-portal`; `SESSION_COOKIE_NAME=portal.sid`; `RATE_LIMIT_COLLECTION_PREFIX` unset; `ALERT_EMAIL=admin@crhsent.com`. ⚑ **`ADMIN_ALLOWLIST` is now UNREAD** — the admin IP gate was removed in all four layers by owner decision 2026-09-11 (`6acbf550`); the variable remains in the file but gates nothing. ⚑ **`operatorIpGate` stays MOUNTED** (owner decision 2026-09-11) — do not "make consistent" with admin. ⚑ At the Plan 3 cutover set `INTEREST_FORM_URL=https://atxwashdryfold.com/affiliate` (config-driven signup link, `server/config/links.js`, B-1). ⚑ **The portal's `CORS_ORIGIN` can never be deleted or emptied** — `server.js:293-295` falls back to `['http://localhost:3000']` when it is falsy; trimming it means setting a non-empty value (finding F-1).
9. **Shared-DB ownership:** `systemconfigs` shared. ⚑ web-core seeds exactly three keys via `registerDefaults` (`maintenance_mode`, `access_gate_enabled`, `system_timezone`); corporate seeds `access_gate_enabled` itself in `server/bootstrap.js`, and **a seeding failure must NOT abort boot** (`9c3c5f8` — fail-open is the documented posture). `ratelimit_*` per-app prefix; sessions per-app collection; `accessgates`/`accesswhitelists`/`accessclicks`/`accessrequests`/`mediatoraccess` corporate-only. ⚑ The admin "reset rate limits" control targets a `rate_limits` collection that **does not exist** (production has 17 `ratelimit_*`) — a verified double no-op, fixed in Plan 4 PR B7, not here.
10. **Cookies:** portal `__Host-portal.sid`; ⚑ corporate is **`__Host-wavemax.sid` today** and becomes `__Host-crhsent.sid` + `collectionName: 'sessions_corporate'` in the Phase-0a deploy — **a one-time corporate session drop is ACCEPTED** (D14b / Q-18; Plan 1 Decision 2 deferred it here). web-core default base `app.sid`. `/health` and `/health/origin` never set a cookie. ⚑ The session maxAge fixer must MUTATE `req.session.cookie` in place — replacing it with a plain object strips Path/Secure/SameSite and a `__Host-` cookie is then rejected by the browser (fixed in both repos `732a21f`/`f0b0fc67`).
11. **CSP:** ⚑ web-core exports `CSP_PROFILES = { full, marketing }`. Marketing hosts: `script-src 'self' 'nonce-<n>'` (no `'unsafe-inline'`); `style-src 'self' 'unsafe-inline'` (no nonce); `img-src 'self' data:`; `connect-src 'self'`; `font-src 'self'`; `frame-src 'none'` (a future embed goes through `frameSrcExtra`, never by widening the profile); `frame-ancestors 'self'`; `form-action 'self'`; `upgrade-insecure-requests` in production. ⚑ Plan 1 B3c changed `isStrictCspPath`'s default page list from 24 entries to `[]` — **any caller that omits `strictCSPPages` silently gets a weaker CSP**; every new call site passes it explicitly. ⚑ The franchisor origins were removed from `iframe-bridge-v2.js` in both repos (`d2725e7`/`a37dc497`, owner: "we will never embed in the franchisor site") — never re-add them.
12. **Item-B status:** ⚑ B0–B3f, B3h, B3i-1, B3i-2, B4b, B4c are DONE and deployed (Plan 1). **B3g, B3j, B3k and the repo-wide `tests/brandNeutral.test.js` ship in THIS plan as web-core `v0.2.1`**; Plan 1 shipped only two file-scoped substitutes (`sessionStore.js`, `SystemConfig.js` guards), which are **not** the guard. **B4a ships in this plan.** B5–B14 are Plan 4.
13. **Cutover order:** Phase 0 (G1 ⚑ DONE via `/health/origin`; G2 ⚑ DONE via Plan 1 Task 10) → **0a corporate multi-host DARK deploy on `:3001`, both boxes, verified per host on-box** → 0b affiliate portal-only hygiene (Plan 3) → Phase 1 nginx flip one host at a time (Plan 3) → Phase 2 app-side deletion (Plan 3) → Item-B adoption (Plan 4).
14. **PR rules:** one concern per PR; ≤ 500-line diff (A3 alone may exceed it — verbatim copies); move-then-delete; strict TDD with the failing test shown failing for the right reason FIRST; every user-facing string in en/es/pt/de in the same commit; `logger` only in `server/` (no `console.*`); runtime business values via `SystemConfig.getValue`; never `--no-verify`; `madge --circular server/` = 0. Commit trailer: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
15. **Lighthouse gate:** `atxwashdryfold.com/`, each marketing host `/`, and `/affiliate` measured mobile AND desktop, all four categories, against C14 (A11y 100, BP 100, SEO 100, Performance ≥ 95 desktop and mobile). In Phase 0a this is measured on the DARK origin with `--host-resolver-rules="MAP <host> <box-ip>" --ignore-certificate-errors`, and that run IS the recorded "Content origin baseline (2026-09)". Measure repeat visits in a real browser — `curl` has no cache and misstates cache wins.
16. ⚑ **Deploy mechanics — PLAN 1 WINS; the spec's version is proven insufficient.** Per box, per consumer: (a) tarball snapshot `~/deploy-snapshots/<name>-<ts>.tgz` excluding `node_modules`/`.git`/`logs`, and record rollback points; (b) rsync web-core (`--exclude node_modules --exclude .git --exclude logs --exclude coverage`) and corporate (**also `--exclude .env`**, then confirm `.env` survived); (c) **`rm -rf node_modules/@crhs/web-core` — MANDATORY.** `npm install --install-links` does NOT re-copy a `file:` dependency when the version is unchanged, nor on a version bump — plain install, `--force` and `--package-lock-only` all leave the old copy, and the lockfile stays stale; (d) `npm install --install-links`; (e) **GATE before any `pm2 reload`:** installed `require('@crhs/web-core/package.json').version` equals the intended version, `Object.keys(require('@crhs/web-core')).length` equals the intended surface, `Object.keys(require('@crhs/web-core').csrf)` includes `createCsrf`, and `require.resolve('mongoose',{paths:[require.resolve('@crhs/web-core')]}) === require.resolve('mongoose')` is `true` — **NEVER `wc.SystemConfig.base` in the affiliate** (its own `SystemConfig` model makes that throw `OverwriteModelError`); (f) boot probe `node -e "try{require('./server.js');process.exit(0)}catch(e){console.log(e.message);process.exit(1)}"` — **the explicit `process.exit(0)` is required**: the affiliate calls `listen()` on require, so on a box where pm2 already holds the port a probe without it measures `EADDRINUSE` instead of boot health; corporate listens only when `require.main === module`, but its open database handles would keep a probe without the exit from ever returning; (g) `pm2 reload <app> --update-env`; (h) oci1 → full verify → oci2; never both at once. ⚑ The affiliate and web-core are a **bidirectional boot-breaker pair** since `v0.2.0`: either half deployed alone stops the portal booting.
17. ⚑ **Log evidence lives in `$LOG_DIR/combined.log`, never `pm2 logs`.** web-core's production logger has no Console transport (`crhs-web-core/src/utils/logger.js:45`), so pm2 stdout is empty BY DESIGN for both apps. Read `/var/www/crhs-corporate/logs/combined.log` and `/var/www/wavemax/wavemax-affiliate-program/logs/combined.log` (JSON lines with `timestamp`, `message`, `service`), always filtered to timestamps after the reload. **`Access gate cache loaded` is NOT a boot marker** — accessGate's 60-second cache refresh (`crhs-corporate/server.js` `startCacheRefresh()`) logs it every minute per worker (~61,000 lines on each box as of 2026-09-13). Count a boot-only line instead.
18. **Confirm-first (always):** production `.env` edits on either app, nginx edits, Cloudflare monitor/LB/DNS/cache-purge changes, Mailcow alias/goto changes, `EXPEDITER_TOKEN` rotation, cron changes, deleting production data, and all destructive git operations. Every such task is **HUMAN-CONFIRM** and carries the exact command AND the exact rollback. `scripts/admin/clear-customer-data.js` is never part of this plan.
19. **Test baselines at plan start (measured 2026-09-12/13):** web-core **572 passed / 572**, 33 suites; corporate **99 passed + exactly 4 failed** (all `tests/crhsent-parity.test.js` ENOENT — **deleted by task A1 in this plan**, after which corporate is fully green); affiliate exactly **2 known failures** (`tests/unit/i18n-brand-token.test.js`, `tests/unit/branding-guard.test.js`) — the affiliate full suite (~67 min) is NEVER run inside an implementer or subagent task; it runs exactly once in Plan 2, controller-run in the background, at GATE Task 72 Step 7b (R-16). **Affiliate lint:** `eslint server/` has 208 pre-existing errors (10,888 repo-wide), so §9.1 "ESLint clean in all three repos" means **no increase over that baseline** for the affiliate; the cleanup is deferred work D-4 (Plan 4), not dropped.

20. ⚑ **ONE host derivation for every host-scoped decision in corporate (BLOCKING, finding F-9).** Every host check uses `requestHost(req)` from `server/config/hosts.js`, which reads `req.headers.host` only: `resolveHost`, `rejectUnknownHost`, accessGate classification AND its emailed magic-link/logo host, `mediatorGate.isCrhsentWavemax`, `crhsentHandler`/`contentHandler`, `legacyPortalRedirects`, `storeIpPortalRedirect`, `hostAwareCsp`, `seoRoutes`. **No `req.hostname` and no `x-forwarded-host` may remain in corporate `server/`**, and the commit that introduces `requestHost` migrates `mediatorGate` and `crhsentHandler` in the SAME commit. `trust proxy` stays. A guard test, a behavioural bypass test and an on-box probe are mandatory.
---

## Findings carried into Plan 2 from live production (2026-09-13)

- **F-1 — Credentialed CORS misconfiguration on both apps (severity LOW).** `CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000,https://wavemax.promo` (`.env` line 47, both boxes, both apps) makes crhsent.com AND the portal return `access-control-allow-origin: <origin>` + `access-control-allow-credentials: true` for those origins (verified through Cloudflare and on-box). Assessed LOW because nothing sensitive is reachable: `MEDIATOR_GATE_ENABLED=true` on both boxes puts `/wavemax` behind the mediator cookie, which is `sameSite: 'lax'` (`mediatorGate.js:181-182`) and so not sent cross-site; the IP-based accessGate protects only `/404.css`, `/404.html`, `/README.md` of 49 content paths; the portal authenticates with a `Bearer` header only. `wavemax.promo` is registered to us through 2028-05-17. Plan 1 Task 19 missed it because its test deletes `CORS_ORIGIN` before asserting and the boxes were never checked. **The fix is not symmetric:** corporate — delete the line (web-core `parseList('')` → `[]`, admits nothing); portal — deleting or emptying it falls back to `['http://localhost:3000']` (`server.js:293-295`), so set a NON-EMPTY value such as `CORS_ORIGIN=https://portal.atxwashdryfold.com`. Plan 2's corporate env target has NO `CORS_ORIGIN`, and the Phase-0a acceptance gate includes a live CORS probe against the production env. Exact commands and rollback: `tasks/todo.md`.
- **F-2 — `CORPORATE_SITE_URL=https://www.wavemaxlaundry.com`** in corporate production `.env`. Inert (0 code references) but franchisor litigation residue; deleted in the Phase-0a env change.
- **F-3 — the interest form changed after the spec was written.** Owner commit `6acbf550` (2026-09-11) made `message` MANDATORY: server validator `.exists({ checkFalsy: true })` + `.isLength({ min: 80, max: 2000 })` with messages "Please describe how you would market the service and build your customer base" / "Please give us at least a couple of sentences (80–2000 characters) on how you would find and keep customers"; label "How will you market this and build your customer base?"; `<textarea … minlength="80" maxlength="2000" required>`; the caveat paragraph "There is a catch, and it is the whole deal: customer acquisition is yours."; and `affiliate.css?v=20260911a`. **A3 (page copy) and A7 (intake endpoint) must port THIS version**, not the pre-2026-09-11 page the spec describes.
- **F-4 — corporate logs are mis-tagged, and one log line is noise (Plan 1's "stale log" finding was wrong).** The pm2 out-log is empty by design (Global Constraint 17); the real `combined.log` is live. It shows corporate lines tagged `service: "wavemax-affiliate"` because `LOG_SERVICE_NAME` is unset and web-core's default is the branded `'wavemax-affiliate'` — fixed by the P0 logger-default change plus `LOG_SERVICE_NAME=crhs-corporate` in the Phase-0a env write (which must land BEFORE v0.2.1 is reloaded, or corporate logs flip to `'app'`). The accessGate refresh writes `Access gate cache loaded` every 60 s per worker (~61k lines, 10 MB file); worth demoting to `debug` in a later hygiene PR.
- **F-5 — CF API token expires 2026-09-16** (Global Constraint 2).
- **F-6 — a test email, not a test record.** Deploy B verification (2026-09-12) POSTed a valid affiliate application on oci1. `server/services/affiliateApplicationService.js` persists NOTHING — it sends (1) a notification with the application details to `AFFILIATE_APPLICATION_RECIPIENT` (`admin@crhsent.com`) and (2) a thank-you to the applicant. So one test notification (name "T A", `t@example.com`) sits in the `admin@crhsent.com` inbox, and the thank-you went to the reserved `example.com` domain, which accepts no mail. No production data to delete. Lesson carried into every Plan 2 verification step: prove a CSRF exemption or validator with a payload that FAILS validation (expect 400), which proves the request reached the handler without triggering side effects.
- **F-7 — `pickups@rundberglaundry.com` unread since 2026-07-31** with two Aug-29 leads; spec P-13 (Mailcow `pickups@atxwashdryfold.com` goto re-point) must close before Plan 3's public form host flip.
- **F-8 — backlog B-2 (interest-form i18n) should ride A3/A4.** `public/affiliate.html` has zero `data-i18n`. Because A3 copies that page INTO corporate, internationalising it in corporate immediately after A3/A4 avoids doing the work twice. Owner decision; recorded in `tasks/todo.md` B-2.
- **F-9 — Plan 2 as drafted would have opened a bypass of the mediator gate on the litigation record.** Today corporate's `accessGate.js:90` reads `x-forwarded-host || host`, and `mediatorGate.js:61` and `crhsentHandler.js:20` read `req.hostname`, which Express derives from `X-Forwarded-Host` under `app.set('trust proxy', 1)` (`server.js:42`). nginx sets no `X-Forwarded-Host` and Cloudflare passes a client-supplied one through. Because all three checks agree today, a forged header only yields 404 (probed live 2026-09-13, `/README.md` and `/wavemax/`, through CF and on-box). But slice A15 introduces `requestHost()` reading `Host` only: had the content handler adopted it while the mediator gate kept `req.hostname`, `Host: crhsent.com` + `X-Forwarded-Host: rundberglaundry.com` would skip the gate and serve the record. Global Constraint 20 prevents it. The same header also builds accessGate's emailed magic link (`accessGate.js:343`) — a host-header poisoning path, closed by the same constraint. Plan 3 adds nginx `proxy_set_header X-Forwarded-Host $host;` as defence in depth.

---

> **Task numbering is non-contiguous by design.** The four parts were drafted in parallel with reserved ranges (1–19, 20–42, 45–61, 70–84) and tasks removed during review leave gaps; Task 62 (backlog B-3) was added by the controller after review (R-16). A cross-reference such as "Plan 1 Task 10" always names Plan 1 explicitly; an unqualified "Task N" means this plan.
>
> **Execute in document order, not numeric order.** Part 2 runs 20, 21, 26, 22–25, 27–42: Task 26 is the single host-derivation commit (Global Constraint 20) and must land before any task that consumes `requestHost`.

## Part 1 — Phase 0 prerequisites and `@crhs/web-core` v0.2.1

> **Slice P0 ground rules (read once).**
> - **Scope after ruling R-1.** This slice ships the web-core `v0.2.1` release (Tasks 1-8), local adoption in corporate and the affiliate (Tasks 9, 13), and the Phase-0 prerequisites that are NOT the Phase-0a deploy: P-10 (Task 15), P-13/P-15 (Task 16), the P-16 alert script plus P-17 (Task 17), and a read-only exit verification (Task 19). **This slice writes no production `.env`, installs web-core on no box, deploys no corporate code and runs no `pm2 reload`.** The GATE slice (Tasks 70-84; production writes in Tasks 74-75, the P-16 cron install and drill in Task 81 Step 7) owns all of that. The corporate session cookie belongs to A15 Task 30, gate mail identity to A69 Task 57, and corporate `.env.example` to A69 Task 59.
> - **Where Plan 1 and the spec conflict, PLAN 1 WINS.** This slice records five places where they conflict:
>   1. The spec ships B3g/B3j/B3k "in the same `v0.2.0` release" (spec §7.5 B3k row). Plan 1 deferred them, so they ship as **`v0.2.1`**.
>   2. Spec §9.2 step 1 says "`0.2.0` from Phase 0a onward". The version from Phase 0a on is **`0.2.1`**.
>   3. Spec §8.6/§15 install with `npm install --install-links` alone. Plan 1 measured that this never re-copies a `file:` dependency, so every local install here is preceded by `rm -rf node_modules/@crhs/web-core`.
>   4. Spec §9.1 P-12 repoints the CF monitor to `GET /health`. Plan 1 Tasks 59-61 superseded that with monitor `path=/health/origin`, `Host=portal.atxwashdryfold.com` (affiliate `server.js:445`; `tasks/todo.md:79,133`). **Do not re-execute P-12.**
>   5. Log evidence reads `$LOG_DIR/combined.log` filtered to timestamps after the relevant moment (ruling R-4, Global Constraint 17), never `pm2 logs`.
> - **Declared deviations from the spec or the Global Constraints:**
>   - (D-a) P-10 pre-creates `sessions_corporate` from oci1 through corporate's own `server/db.js`, not with `mongosh` from `70.114.167.145` (Task 15).
>   - (D-b) The §9.1 Phase-0 exit criterion "`npm test` clean in all three repos" would require the affiliate full suite. Global Constraint 19 (Plan 1 wins) forbids running it (~67 min), so no implementer or subagent task in Plan 2 runs it; the single exception is GATE Task 72 Step 7b, which runs it once, controller-run in the background, before the deploy (R-16). Task 19 Step 3 runs the three web-core seam suites, a boot probe and `madge` instead, and carries Global Constraint 19's 2 known full-suite failures as the baseline.
>   - (D-c) §9.1 "ESLint clean" cannot hold in the affiliate as measured on 2026-09-13 (`565a923e`): `npm run lint` (`eslint .`) reports `10888 errors`, and `npx eslint server/` reports `208 problems (208 errors, 0 warnings)`. This slice changes only the affiliate `package-lock.json`, so the exit check is **"no change from 208 errors in `server/`"**, recorded as a finding for Plan 4. web-core (`eslint src tests`) and corporate (`eslint server tests`) are clean today and must stay clean.
> - **Baselines measured 2026-09-13:**
>   - web-core `npm test`: `Test Suites: 33 passed, 33 total` / `Tests: 572 passed, 572 total`.
>   - corporate `npm test`: `Test Suites: 1 failed, 13 passed, 14 total` / `Tests: 4 failed, 1 skipped, 99 passed, 104 total`. The only FAIL is `tests/crhsent-parity.test.js`.
>   - `madge --circular` is clean in all three repos: web-core `src/`, corporate `server/`, affiliate `server/`.
> - **Out of this slice:**
>   - P-2/P-4/P-5/P-6 go to corporate A1-A9, and P-7/P-8 to A69 plus GATE.
>   - P-9 goes to affiliate Phase 0b; P-11 to the device checklist before Phase 1 step 3 (Plan 3).
>   - P-12 was done by Plan 1 Tasks 59-61, P-3/G2 by Plan 1 Task 10, and P-14 on 2026-09-09.

---

### Task 1: web-core B3g-1 — `sendEmail` gains `{ replyTo, fromName, displayName }` and loses the brand module and the `rundberglaundry.com` literal

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/email/transport.js` (`:8` brand require; `:54-74` JSDoc + `sendEmail` head through `mailOptions`)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/email/transport.test.js` (tests at `:131-136` and `:138-144` replaced; `:148` deleted)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/README.md:11`

**Interfaces:**
- Consumes: env `EMAIL_FROM`, `EMAIL_USER`, `EMAIL_FROM_NAME`.
- Produces: `sendEmail(to: string, subject: string, html: string, fromOverride?: string, options?: { replyTo?: string, fromName?: string, displayName?: string }) => Promise<info>`.
  - **From display-name precedence (ruling R-6, ratified): `options.fromName` > `EMAIL_FROM_NAME` > `options.displayName`.** This is stricter than spec §5.5 (`EMAIL_FROM_NAME || brand.displayName`); corporate intake mail (A69) and gate mail (A69 Task 57) pass **`displayName`, never `fromName`**, so an operator-set `EMAIL_FROM_NAME` still wins. With none of the three set, the From header is the bare address.
  - Address chain: `EMAIL_FROM` → `EMAIL_USER`. If neither is set and there is no `fromOverride`, it rejects with `No sender address configured: set EMAIL_FROM or EMAIL_USER`.
  - `mailOptions.replyTo` is set only when `options.replyTo` is given.
  - A full `fromOverride` still bypasses name/address resolution. The corporate accessGate 4-arg call (`crhs-corporate/server/middleware/accessGate.js:345`) is unchanged.

- [ ] **Step 1: Write the failing tests.** In `tests/email/transport.test.js`, inside `describe('sendEmail')`, replace the two tests `'default From display name is brand.displayName (generic "Laundromat")'` (`:131-136`) and `'default From display name follows BRAND_DISPLAY_NAME when set'` (`:138-144`) with:
```js
    it('with no display name configured the From header is the bare address (no brand module, no default mark)', async () => {
      process.env.EMAIL_FROM = 'sender@example.com';
      process.env.BRAND_DISPLAY_NAME = 'Should Be Ignored';
      await transport.sendEmail('to@example.com', 'Hi', '<p>b</p>');
      expect(sendMail.mock.calls[0][0].from).toBe('sender@example.com');
    });

    it('options.displayName names the sender when EMAIL_FROM_NAME is unset', async () => {
      process.env.EMAIL_FROM = 'no-reply@crhsent.com';
      await transport.sendEmail('to@example.com', 'Hi', '<p>b</p>', undefined, { displayName: 'WaveMAX Austin' });
      expect(sendMail.mock.calls[0][0].from).toBe('"WaveMAX Austin" <no-reply@crhsent.com>');
    });

    it('options.fromName beats EMAIL_FROM_NAME, which beats options.displayName', async () => {
      process.env.EMAIL_FROM = 'no-reply@crhsent.com';
      process.env.EMAIL_FROM_NAME = 'Env Name';
      await transport.sendEmail('to@example.com', 'Hi', '<p>b</p>', undefined, { displayName: 'Brand' });
      expect(sendMail.mock.calls[0][0].from).toBe('"Env Name" <no-reply@crhsent.com>');
      await transport.sendEmail('to@example.com', 'Hi', '<p>b</p>', undefined, { displayName: 'Brand', fromName: 'Explicit' });
      expect(sendMail.mock.calls[1][0].from).toBe('"Explicit" <no-reply@crhsent.com>');
    });

    it('falls back to EMAIL_USER for the address and never to a hard-coded domain', async () => {
      process.env.EMAIL_USER = 'login@crhsent.com';
      await transport.sendEmail('to@example.com', 'Hi', '<p>b</p>');
      expect(sendMail.mock.calls[0][0].from).toBe('login@crhsent.com');
    });

    it('throws when no sender address is configured and no override is passed', async () => {
      await expect(transport.sendEmail('to@example.com', 'Hi', '<p>b</p>'))
        .rejects.toThrow('No sender address configured: set EMAIL_FROM or EMAIL_USER');
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('sets replyTo only when options.replyTo is given', async () => {
      process.env.EMAIL_FROM = 'no-reply@crhsent.com';
      await transport.sendEmail('pickups@atxwashdryfold.com', 'Lead', '<p>b</p>', undefined, { replyTo: 'lead@example.com' });
      expect(sendMail.mock.calls[0][0].replyTo).toBe('lead@example.com');
      await transport.sendEmail('pickups@atxwashdryfold.com', 'Lead', '<p>b</p>');
      expect(sendMail.mock.calls[1][0]).not.toHaveProperty('replyTo');
    });
```
  In the test `'EMAIL_FROM_NAME overrides the brand display name'`, delete the line `process.env.BRAND_DISPLAY_NAME = 'Rundberg Laundry';` (`:148`).

- [ ] **Step 2: Run the tests and confirm they fail.** Command: `cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/email/transport.test.js`.
  Expected `Tests: 6 failed, 13 passed, 19 total` (the file has 15 tests today: 7 `createTransport` + 8 `sendEmail`; 15 − 2 + 6 = 19). The file's `beforeEach` deletes `EMAIL_FROM_NAME`/`BRAND_DISPLAY_NAME`, and today's code names the sender `brand.displayName` = `Laundromat`. The six failures:
  - bare address → `Expected: "sender@example.com"` / `Received: "\"Should Be Ignored\" <sender@example.com>"`
  - displayName → `Expected: "\"WaveMAX Austin\" <no-reply@crhsent.com>"` / `Received: "\"Laundromat\" <no-reply@crhsent.com>"`
  - fromName beats → the first assertion passes; the second fails with `Expected: "\"Explicit\" <no-reply@crhsent.com>"` / `Received: "\"Env Name\" <no-reply@crhsent.com>"`
  - EMAIL_USER fallback → `Expected: "login@crhsent.com"` / `Received: "\"Laundromat\" <login@crhsent.com>"`
  - no sender → `Received promise resolved instead of rejected` (today it sends from `noreply@rundberglaundry.com`)
  - replyTo → `Expected: "lead@example.com"` / `Received: undefined`

- [ ] **Step 3: Implement.** In `src/email/transport.js`, delete line 8 (`const brand = require('../config/brand');`). Replace everything from the `/**` that opens the `Send an HTML email` JSDoc (`:54`) through `  const mailOptions = { from, to, subject, html };` (`:74`) with:
```js
/**
 * Send an HTML email to `to`.
 * Attachments are not supported — upstream mail policy blocks them; images
 * must be referenced by URL.
 * @param {string} [fromOverride] - full From header (e.g. '"CRHS Enterprises" <no-reply@crhsent.com>').
 *   Requires the SMTP login to be permitted to send as that address.
 * @param {object} [options]
 * @param {string} [options.replyTo] - Reply-To address (e.g. the lead on an intake notification).
 * @param {string} [options.fromName] - explicit From display name; wins over everything.
 * @param {string} [options.displayName] - the calling app's brand name; used when
 *   neither options.fromName nor EMAIL_FROM_NAME is set. Brand is app-owned (D13b):
 *   web-core carries no brand module and no default display name.
 */
async function sendEmail(to, subject, html, fromOverride, options = {}) {
  if (!to) {
    throw new Error('No recipient email address provided');
  }

  logger.info('[sendEmail] Sending email to:', to);

  let from = fromOverride;
  if (!from) {
    const address = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    if (!address) {
      throw new Error('No sender address configured: set EMAIL_FROM or EMAIL_USER');
    }
    const name = options.fromName || process.env.EMAIL_FROM_NAME || options.displayName;
    from = name ? `"${name}" <${address}>` : address;
  }

  const transporter = createTransport();
  const mailOptions = { from, to, subject, html };
  if (options.replyTo) mailOptions.replyTo = options.replyTo;
```
  In `README.md:11`, replace ``only ever builds `{ from, to, subject, html }` `` with ``only ever builds `{ from, to, subject, html }` plus an optional `replyTo` string ``.

- [ ] **Step 4: Run the tests and confirm they pass.** Command: `npx jest tests/email/transport.test.js`. Expected: `Tests: 19 passed, 19 total`.
- [ ] **Step 5: Commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git add src/email/transport.js tests/email/transport.test.js README.md && git commit -m "feat(email): sendEmail options { replyTo, fromName, displayName }; drop brand module + rundberglaundry fallback (B3g)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: web-core B3g-2 — `fillTemplate` takes brand by parameter and loses the `rundberglaundry.com` BASE_URL default

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/email/template-manager.js` (`:18` brand require; `:62-74` JSDoc + `fillTemplate` head through the `BRAND_LOGO` line)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/email/template-manager.test.js` (`:90-94` `injects BASE_URL`; `:96-127` `describe('brand auto-injection')`; `:130-149` `describe('FALLBACK_TEMPLATE brand tokens')`)

**Interfaces:**
- Consumes: env `BASE_URL`.
- Produces: `fillTemplate(template: string, data: object, brand?: { displayName?: string, legalName?: string, logoPath?: string, baseUrl?: string }) => string`.
  - `BASE_URL` = `brand.baseUrl` → `process.env.BASE_URL` → `''`.
  - `BRAND_NAME` / `BRAND_LEGAL` are injected only from `brand.displayName` / `brand.legalName`.
  - `BRAND_LOGO` = `${BASE_URL}${brand.logoPath}`, set only when `brand.logoPath` is given.
  - Caller `data` still wins.
  - Consumed by corporate A69 (`logoPath: '/assets/images/brand/logo.png'`, `BASE_URL=https://atxwashdryfold.com` → `https://atxwashdryfold.com/assets/images/brand/logo.png`, matching spec §5.5).
  - The affiliate is unaffected: it uses its own `server/services/email/template-manager.js:45`.

- [ ] **Step 1: Write the failing tests.** Replace the test `'injects BASE_URL into the data set'` (`:90-94`) with:
```js
    it('injects BASE_URL from the env and never from a hard-coded domain', () => {
      const saved = process.env.BASE_URL;
      process.env.BASE_URL = 'https://atxwashdryfold.com';
      expect(tm.fillTemplate('<a href="[BASE_URL]/x">l</a>', {})).toBe('<a href="https://atxwashdryfold.com/x">l</a>');
      delete process.env.BASE_URL;
      expect(tm.fillTemplate('<a href="[BASE_URL]/x">l</a>', {})).toBe('<a href="/x">l</a>');
      if (saved !== undefined) process.env.BASE_URL = saved;
    });
```
  Replace the whole `describe('brand auto-injection', …)` block (`:96-127`) with:
```js
    describe('brand by parameter (D13b)', () => {
      const SAVED = { ...process.env };
      afterEach(() => { process.env = { ...SAVED }; });

      it('injects BRAND_NAME / BRAND_LEGAL from the brand argument', () => {
        const out = tm.fillTemplate('<h1>[BRAND_NAME]</h1><footer>[BRAND_LEGAL]</footer>', {},
          { displayName: 'WaveMAX Austin', legalName: 'CRHS Enterprises, LLC' });
        expect(out).toBe('<h1>WaveMAX Austin</h1><footer>CRHS Enterprises, LLC</footer>');
      });

      it('ignores BRAND_* env — brand is app-owned, core reads no brand env', () => {
        process.env.BRAND_DISPLAY_NAME = 'Env Brand';
        expect(tm.fillTemplate('<h1>[BRAND_NAME]</h1>', {})).toBe('<h1></h1>');
      });

      it('BRAND_LOGO is ABSOLUTE: brand.baseUrl (or BASE_URL) + brand.logoPath', () => {
        const out = tm.fillTemplate('<img src="[BRAND_LOGO]">', {},
          { baseUrl: 'https://atxwashdryfold.com', logoPath: '/assets/images/brand/logo.png' });
        expect(out).toBe('<img src="https://atxwashdryfold.com/assets/images/brand/logo.png">');
      });

      it('caller-supplied data still wins over the brand argument', () => {
        expect(tm.fillTemplate('<h1>[BRAND_NAME]</h1>', { BRAND_NAME: 'Explicit' }, { displayName: 'Brand' }))
          .toBe('<h1>Explicit</h1>');
      });
    });
```
  Replace the whole `describe('FALLBACK_TEMPLATE brand tokens', …)` block (`:130-149`) with:
```js
  describe('FALLBACK_TEMPLATE brand tokens', () => {
    it('the fallback carries [BRAND_*] tokens that resolve from the brand argument', async () => {
      const saved = process.env.EMAIL_TEMPLATE_ROOT;
      delete process.env.EMAIL_TEMPLATE_ROOT;
      const raw = await tm.loadTemplate('does-not-exist', 'en');
      if (saved !== undefined) process.env.EMAIL_TEMPLATE_ROOT = saved;
      expect(raw).toContain('[BRAND_NAME]');
      expect(raw).toContain('[BRAND_LEGAL]');
      expect(raw).not.toMatch(/wavemax|laundromat/i);
      const filled = tm.fillTemplate(raw, { EMAIL_CONTENT: 'body' },
        { displayName: 'WaveMAX Austin', legalName: 'CRHS Enterprises, LLC' });
      expect(filled).toContain('<h1>WaveMAX Austin</h1>');
      expect(filled).toContain('CRHS Enterprises, LLC');
    });
  });
```

- [ ] **Step 2: Run the tests and confirm they fail.** Command: `npx jest tests/email/template-manager.test.js`.
  Expected `Tests: 5 failed, 12 passed, 17 total` (17 tests before and after: 5 loadTemplate + 3 fillTemplate + 1 BASE_URL + 4 brand + 1 fallback + 3 formatters). Today's code injects `brand.js` defaults (`Laundromat`) and falls back to `https://rundberglaundry.com`, and `tests/setup.js` sets no `BASE_URL`. The five failures:
  - BASE_URL → second assertion `Expected: "<a href=\"/x\">l</a>"` / `Received: "<a href=\"https://rundberglaundry.com/x\">l</a>"`
  - brand argument → `Expected: "<h1>WaveMAX Austin</h1><footer>CRHS Enterprises, LLC</footer>"` / `Received: "<h1>Laundromat</h1><footer>CRHS Enterprises, LLC</footer>"`
  - ignores env → `Expected: "<h1></h1>"` / `Received: "<h1>Env Brand</h1>"`
  - BRAND_LOGO → `Expected: "<img src=\"https://atxwashdryfold.com/assets/images/brand/logo.png\">"` / `Received: "<img src=\"https://rundberglaundry.com/assets/images/brand/logo.png\">"`
  - FALLBACK → `Expected substring: "<h1>WaveMAX Austin</h1>"`, with a `Received string` containing `<h1>Laundromat</h1>`
  - `caller-supplied data still wins` passes.

- [ ] **Step 3: Implement.** Delete `const brand = require('../config/brand');` (`:18`). Replace everything from the `/**` above `fillTemplate` (`:62`) through the `BRAND_LOGO` line (`:74`) with:
```js
/**
 * Replace `[KEY]` placeholders in `template` with values from `data`.
 * Tolerates lower/UPPER/exact casing mismatches.
 * @param {string} template
 * @param {object} data - caller values; always win over injected tokens.
 * @param {{displayName?: string, legalName?: string, logoPath?: string, baseUrl?: string}} [brand]
 *   the calling app's brand (D13b — web-core owns no brand and no default domain).
 */
function fillTemplate(template, data, brand = {}) {
  const baseUrl = brand.baseUrl || process.env.BASE_URL || '';
  data.BASE_URL = baseUrl;
  if (data.BRAND_NAME === undefined && brand.displayName !== undefined) data.BRAND_NAME = brand.displayName;
  if (data.BRAND_LEGAL === undefined && brand.legalName !== undefined) data.BRAND_LEGAL = brand.legalName;
  // [BRAND_LOGO] resolves to an ABSOLUTE URL (emails can't use relative paths).
  if (data.BRAND_LOGO === undefined && brand.logoPath !== undefined) data.BRAND_LOGO = `${baseUrl}${brand.logoPath}`;
```
- [ ] **Step 4: Run the tests and confirm they pass.** Command: `npx jest tests/email/template-manager.test.js`. Expected: `Tests: 17 passed, 17 total`.
- [ ] **Step 5: Commit.** `git add src/email/template-manager.js tests/email/template-manager.test.js && git commit -m "feat(email): fillTemplate(template, data, brand) — brand by parameter, no rundberglaundry BASE_URL default (B3g)" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"`

---

### Task 3: web-core B3g-3 — drop the cspHelper `brand === true` shorthand

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/utils/cspHelper.js` (`:13`, `:16-17`, `:24-25`, `:76-77`)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/utils/cspHelper.test.js` (the `brand === true` test at **`:180-186`**. Verified with `grep -n "brand === true" tests/utils/cspHelper.test.js` → `180:`, and its closing `});` is `:186`.)

**Interfaces:**
- Produces: `injectNonce(html, nonce, brand?: object)` and `readHTMLWithNonce(filePath, nonce, brand?: object)`. A truthy non-object `brand` throws `TypeError('cspHelper brand must be an object ({displayName, shortName, legalName, logoPath, ogImagePath}); the \`true\` shorthand was removed in @crhs/web-core 0.2.1')`.
- Consumers verified safe:
  - Affiliate `server/utils/cspHelper.js:32-34` passes its brand OBJECT.
  - Corporate `server/crhsentHandler.js:34` passes no third argument.

- [ ] **Step 1: Write the failing test.** Replace the test `'brand === true uses the web-core default brand module (generic "Laundromat")'` (`:180-186`) with:
```js
      it('rejects the removed `true` shorthand — brand is app-owned (D13b)', () => {
        expect(() => injectNonce('<h1>{{BRAND_NAME}}</h1>', testNonce, true))
          .toThrow(/the `true` shorthand was removed/);
      });
```
- [ ] **Step 2: Run the test and confirm it fails.** Command: `npx jest tests/utils/cspHelper.test.js -t 'shorthand'`. Expected: `expect(received).toThrow(expected)` / ``Expected pattern: /the `true` shorthand was removed/`` / `Received function did not throw`. Today `true` loads `config/brand` and returns `<h1>Laundromat</h1>`.
- [ ] **Step 3: Implement.** In `src/utils/cspHelper.js`, replace `:24-25`:
```js
  if (brand) {
    const b = brand === true ? require('../config/brand') : brand;
```
  with:
```js
  if (brand) {
    if (typeof brand !== 'object') {
      throw new TypeError('cspHelper brand must be an object ({displayName, shortName, legalName, logoPath, ogImagePath}); the `true` shorthand was removed in @crhs/web-core 0.2.1');
    }
    const b = brand;
```
  Then make these JSDoc edits:
  - `:13`: delete the sentence `` `brand === true` uses web-core's default brand module.``
  - `:16-17`: replace `@param {object|true} [brand] - brand source (object with displayName/shortName/` / `legalName/logoPath/ogImagePath, or \`true\` for the default brand module).` with `@param {object} [brand] - brand source (object with displayName/shortName/` / `legalName/logoPath/ogImagePath).`
  - `:76`: change `@param {object|true} [brand]` to `@param {object} [brand]`.
- [ ] **Step 4: Run the test file and confirm it passes.** Command: `npx jest tests/utils/cspHelper.test.js && grep -c "brand === true\|object|true" src/utils/cspHelper.js`. Expected: every test passes; grep prints `0`.
- [ ] **Step 5: Commit.** `git add src/utils/cspHelper.js tests/utils/cspHelper.test.js && git commit -m "core(cspHelper)!: remove the brand === true shorthand (B3g)" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"`

---

### Task 4: web-core B3g-4 — delete `src/config/brand.js`

**Files:**
- Create: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/config/brandModuleRemoved.test.js`
- Delete: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/config/brand.js`, `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/config/brand.test.js` (8 tests)

**Interfaces:**
- Produces: no `src/config/brand.js`. The export surface stays **26** keys, because `brand` was never a top-level key (`tests/index.smoke.test.js`).
- Consumes: Tasks 1-3, which removed the three `require('../config/brand')` sites (`transport.js:8`, `template-manager.js:18`, `cspHelper.js:25`). `grep -rn "config/brand" --include=*.js src tests` before this task lists only `tests/config/brand.test.js:8`.

- [ ] **Step 1: Write the failing test.** Create `tests/config/brandModuleRemoved.test.js`:
```js
// D13b: brand is app-owned. The shared library ships no brand module and no
// src file may require one (spec §12 item 11: `test ! -f crhs-web-core/src/config/brand.js`).
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', '..', 'src');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

describe('brand module removed (D13b)', () => {
  it('src/config/brand.js does not exist', () => {
    expect(fs.existsSync(path.join(SRC, 'config', 'brand.js'))).toBe(false);
  });
  it('no src file requires a brand module', () => {
    const offenders = walk(SRC).filter((f) => f.endsWith('.js'))
      .filter((f) => /require\(['"][./]*config\/brand['"]\)/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
```
- [ ] **Step 2: Run the test and confirm it fails.** Command: `npx jest tests/config/brandModuleRemoved.test.js`. Expected: `Tests: 1 failed, 1 passed, 2 total`. The existence test fails with `Expected: false` / `Received: true`; the require test passes because Tasks 1-3 removed every require.
- [ ] **Step 3: Delete the module and its suite.** Command: `git rm src/config/brand.js tests/config/brand.test.js`.
- [ ] **Step 4: Run the new test and the full suite.** Command: `npx jest tests/config/brandModuleRemoved.test.js && npm test 2>&1 | grep -E "^(Tests:|Test Suites:)"`. Expected: `Tests: 2 passed, 2 total` for the new file, then `Test Suites: 33 passed, 33 total` and `Tests: 570 passed, 570 total`. Arithmetic: tests 572 − 8 (`brand.test.js`) + 4 (Task 1: 2 replaced by 6) + 0 (Task 2) + 0 (Task 3) + 2 (this file) = 570; suites 33 − 1 + 1 = 33.
- [ ] **Step 5: Commit.** `git add -A tests/config src/config && git commit -m "core!: delete src/config/brand.js — brand is app-owned (B3g / D13b)" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"`

---

### Task 5: web-core B3j — export `validateMailConfig()`

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/email/transport.js` (requires block; `module.exports` line)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/email/index.js` (`:12-15` export object)
- Create: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/email/validateMailConfig.test.js`

**Interfaces:**
- Produces: `validateMailConfig({ templateRoot?: string } = {}) => { from: string, user: string, templateRoot: string }`.
  - Exposed as `wc.email.transport.validateMailConfig` AND `wc.email.validateMailConfig` (ruling R-12; spec §5.5 calls the latter).
  - Before each throw it logs via `logger.error`.
  - It throws an `Error` whose message is exactly one of:
    - (b) `validateMailConfig: neither EMAIL_FROM nor EMAIL_USER is set`
    - (a) `validateMailConfig: EMAIL_FROM domain "<d1>" does not match EMAIL_USER domain "<d2>" (the SMTP login must own the From address)`
    - (c1) `validateMailConfig: email template root is not configured (pass templateRoot or set EMAIL_TEMPLATE_ROOT)`
    - (c2) `validateMailConfig: base-template.html not found in <root>`
- The top-level export surface stays 26: `email` is one key, and `tests/index.smoke.test.js:50-52` asserts only `email.transport` / `email.templateManager` are defined.
- Consumed by: corporate A69 Task 58 (`wc.email.validateMailConfig({ templateRoot })`) and affiliate A-0b.4. **Neither call is made in this slice.**

- [ ] **Step 1: Write the failing tests.** Create `tests/email/validateMailConfig.test.js`:
```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const email = require('../../src/email');
const { validateMailConfig } = require('../../src/email/transport');

describe('email/validateMailConfig (B3j — R-24 + R-25 boot check)', () => {
  const SAVED = { ...process.env };
  let root;
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'crhs-mailcfg-'));
    fs.writeFileSync(path.join(root, 'base-template.html'), '<html>[EMAIL_CONTENT]</html>');
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
  beforeEach(() => {
    process.env = { ...SAVED };
    delete process.env.EMAIL_FROM; delete process.env.EMAIL_USER; delete process.env.EMAIL_TEMPLATE_ROOT;
  });
  afterAll(() => { process.env = SAVED; });

  it('is a function exported on wc.email as well as on the transport', () => {
    expect(typeof validateMailConfig).toBe('function');
    expect(email.validateMailConfig).toBe(validateMailConfig);
  });
  it('(b) throws when neither EMAIL_FROM nor EMAIL_USER is set', () => {
    expect(() => validateMailConfig({ templateRoot: root }))
      .toThrow('validateMailConfig: neither EMAIL_FROM nor EMAIL_USER is set');
  });
  it('(a) throws on the 2026-08-24 553 class: From domain not owned by the login', () => {
    process.env.EMAIL_FROM = 'no-reply@crhsent.com';
    process.env.EMAIL_USER = 'no-reply@wavemax.promo';
    expect(() => validateMailConfig({ templateRoot: root }))
      .toThrow('validateMailConfig: EMAIL_FROM domain "crhsent.com" does not match EMAIL_USER domain "wavemax.promo" (the SMTP login must own the From address)');
  });
  it('(c1) throws when no template root is configured', () => {
    process.env.EMAIL_FROM = process.env.EMAIL_USER = 'no-reply@crhsent.com';
    expect(() => validateMailConfig())
      .toThrow('validateMailConfig: email template root is not configured (pass templateRoot or set EMAIL_TEMPLATE_ROOT)');
  });
  it('(c2) throws when the root lacks base-template.html', () => {
    process.env.EMAIL_FROM = process.env.EMAIL_USER = 'no-reply@crhsent.com';
    process.env.EMAIL_TEMPLATE_ROOT = '/nonexistent';
    expect(() => validateMailConfig()).toThrow('validateMailConfig: base-template.html not found in /nonexistent');
  });
  it('passes for a matching pair and a real root (env or argument), case-insensitively', () => {
    process.env.EMAIL_FROM = 'No-Reply@CRHSent.com';
    process.env.EMAIL_USER = 'no-reply@crhsent.com';
    process.env.EMAIL_TEMPLATE_ROOT = root;
    expect(validateMailConfig()).toEqual({ from: 'No-Reply@CRHSent.com', user: 'no-reply@crhsent.com', templateRoot: root });
    delete process.env.EMAIL_FROM;
    expect(validateMailConfig({ templateRoot: root }).from).toBe('no-reply@crhsent.com');
  });
});
```
- [ ] **Step 2: Run the tests and confirm they fail.** Command: `npx jest tests/email/validateMailConfig.test.js`. Expected: `Tests: 6 failed, 6 total`.
  - The export test fails with `Expected: "function"` / `Received: "undefined"`.
  - The four throw tests fail with `Expected substring: "validateMailConfig: …"` / `Received message: "validateMailConfig is not a function"`.
  - The pass test fails with `TypeError: validateMailConfig is not a function`.
- [ ] **Step 3: Implement.** In `src/email/transport.js`, add `const fs = require('fs');` and `const path = require('path');` directly below `const nodemailer = require('nodemailer');`. Insert above `module.exports`:
```js
const domainOf = (addr) => String(addr).split('@').pop().trim().toLowerCase();

/**
 * Boot-time mail configuration check (R-24 + R-25). Call once after dotenv; a
 * throw must stop the process. Throws when (b) neither EMAIL_FROM nor EMAIL_USER
 * is set, (a) EMAIL_FROM's domain differs from EMAIL_USER's (the 553 "not owned
 * by user" outage of 2026-08-24), or (c) the template root is unset or lacks
 * base-template.html (every mail would silently render FALLBACK_TEMPLATE).
 * @param {{templateRoot?: string}} [opts]
 * @returns {{from: string, user: string, templateRoot: string}}
 */
function validateMailConfig(opts = {}) {
  const fail = (msg) => { logger.error(msg); throw new Error(msg); };
  const from = process.env.EMAIL_FROM;
  const user = process.env.EMAIL_USER;
  if (!from && !user) fail('validateMailConfig: neither EMAIL_FROM nor EMAIL_USER is set');
  if (from && domainOf(from) !== domainOf(user || '')) {
    fail(`validateMailConfig: EMAIL_FROM domain "${domainOf(from)}" does not match EMAIL_USER domain "${user ? domainOf(user) : ''}" (the SMTP login must own the From address)`);
  }
  const templateRoot = opts.templateRoot || process.env.EMAIL_TEMPLATE_ROOT;
  if (!templateRoot) fail('validateMailConfig: email template root is not configured (pass templateRoot or set EMAIL_TEMPLATE_ROOT)');
  if (!fs.existsSync(path.join(templateRoot, 'base-template.html'))) {
    fail(`validateMailConfig: base-template.html not found in ${templateRoot}`);
  }
  return { from: from || user, user, templateRoot };
}
```
  Change the last line to `module.exports = { createTransport, sendEmail, validateMailConfig };`. In `src/email/index.js`, replace `:12-15`:
```js
module.exports = {
  transport: require('./transport'),
  templateManager: require('./template-manager')
};
```
  with:
```js
const transport = require('./transport');

module.exports = {
  transport,
  templateManager: require('./template-manager'),
  validateMailConfig: transport.validateMailConfig
};
```
- [ ] **Step 4: Run the tests and confirm they pass.** Command: `npx jest tests/email tests/index.smoke.test.js`. Expected: 0 failed; `validateMailConfig.test.js` shows 6 passed; the smoke suite's surface test (26 keys) still passes.
- [ ] **Step 5: Commit.** `git add src/email tests/email/validateMailConfig.test.js && git commit -m "feat(email): validateMailConfig() boot check — From/login domain + template root (B3j, R-24/R-25)" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"`

---

### Task 6: web-core B3k — `assets/js/i18n.js` uses a fixed `translationsPath` and applies `data-i18n-aria-label`

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/assets/js/i18n.js` (`:15-17` translationsPath; insert after `:252`, the `});` closing the `data-i18n-title` loop inside `translatePage()` at `:212`)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/assets/i18n.test.js` (insert before `:144`, the `});` closing the top-level `describe('shared i18n loader (assets/js/i18n.js)')` opened at `:54`)

**Interfaces:**
- Produces:
  - `i18n.config.translationsPath === '/locales'` on every host.
  - `translatePage()` sets `aria-label` from `data-i18n-aria-label` via `this.t(key)`. `t()` (`assets/js/i18n.js:126-140`) splits the key on `.` and walks `translations[currentLanguage]`.
  - Consumed by corporate A15 (served from `wc.assetsDir/js`) and the §5.3 `partner.plant.reliefAria` edit.
- **Behaviour-neutral:** both old branches already resolved same-origin (spec §7.5 B3k row). The affiliate serves its own `public/assets/js/i18n.js` (edited by A-0b.6, not here).
- `storageKey: 'wavemax-language'` (`:18`) is **NOT** changed. Renaming it resets every visitor's saved language, and the Task 7 guard scopes `src/` only.

- [ ] **Step 1: Write the failing tests.** Insert before the final `});` of the file (`:144`):
```js

  test('translationsPath is the fixed same-origin /locales with no hostname branch (B3k)', () => {
    const window = loadI18n({});
    expect(window.i18n.config.translationsPath).toBe('/locales');
    expect(I18N_SRC).not.toMatch(/rundberglaundry/);
    expect(I18N_SRC).not.toMatch(/translationsPath:\s*window\.location/);
  });

  test('translatePage() applies data-i18n-aria-label (screen-reader copy is copy, §5.3)', () => {
    const window = loadI18n({});
    const i18n = window.i18n;
    const a = window.document.createElement('a');
    a.setAttribute('data-i18n-aria-label', 'partner.plant.reliefAria');
    a.setAttribute('aria-label', 'untranslated');
    window.document.body.appendChild(a);
    i18n.currentLanguage = 'de';
    i18n.translations = { de: { partner: { plant: { reliefAria: 'Entlastung ansehen' } } } };
    i18n.loadedLanguages = new Set(['de']);
    i18n.translatePage();
    expect(a.getAttribute('aria-label')).toBe('Entlastung ansehen');
  });
```
- [ ] **Step 2: Run the tests and confirm they fail.** Command: `npx jest tests/assets/i18n.test.js`. Expected: 2 failed.
  - translationsPath: `Expected: "/locales"` / `Received: "https://example.test/locales"` (jsdom url `https://example.test/`, `tests/assets/i18n.test.js:32`).
  - aria-label: `Expected: "Entlastung ansehen"` / `Received: "untranslated"` (no handler exists yet).
- [ ] **Step 3: Implement.** Replace `:15-17`:
```js
      translationsPath: window.location.hostname === 'localhost' || window.location.hostname.includes('rundberglaundry.com')
        ? '/locales'
        : window.location.origin + '/locales',
```
  with:
```js
      translationsPath: '/locales',
```
  Then, directly after the `data-i18n-title` loop's closing `});` and before the `},` that closes `translatePage` (originally `:252`/`:253`, now `:250`/`:251` after the 3→1 line change), insert:
```js

      // Translate aria-label attributes (screen-reader copy ships in all four locales)
      const ariaLabels = document.querySelectorAll('[data-i18n-aria-label]');
      ariaLabels.forEach(element => {
        const key = element.getAttribute('data-i18n-aria-label');
        element.setAttribute('aria-label', this.t(key));
      });
```
- [ ] **Step 4: Run the tests and confirm they pass.** Command: `npx jest tests/assets/i18n.test.js && grep -c 'rundberglaundry' assets/js/i18n.js`. Expected: all pass; grep prints `0`.
- [ ] **Step 5: Commit.** `git add assets/js/i18n.js tests/assets/i18n.test.js && git commit -m "assets(i18n): translationsPath '/locales' + data-i18n-aria-label handler (B3k)" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"`

---

### Task 7: web-core — repo-wide `tests/brandNeutral.test.js` (spec §7.2.2), now in scope and required to pass

Plan 1 shipped only two file-scoped substitutes: `tests/config/sessionStore.test.js:309-310` and `tests/models/systemConfig.test.js:977-990`. **Neither is this guard.** This task adds the repo-wide net over `src/` that D-1 promised (`tasks/todo.md:305-309`) and removes every remaining literal it finds.

The parent-bridge override in web-core `securityHeaders.js` (the `if (req.path === '/assets/js/parent-iframe-bridge-v3.js')` block, `:85-89`) is a **Plan 3 carve-out**. Only the comment above it changes here; the block stays byte-identical.

**Files:**
- Create: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/brandNeutral.test.js`
- Modify (comments only): `src/security/securityHeaders.js:64-67,82-84,91-94`, `src/security/corsConfig.js:3-5`, `src/config/csrf-config.js:147-148`
- Modify (behaviour): `src/utils/logger.js:27-30`, `tests/utils/logger.test.js` (`:4-6` header, `:19-24` first test)
- Modify: `tests/models/systemConfig.test.js:979-981` (stale "ships with B3g/B3k" note)

**Interfaces:**
- Produces:
  - Guard: every line of every file under `src/` fails `/wavemax|rundberglaundry|runberglaundry|atxwash|wavemaxlaundry/i`.
  - **Logger default `defaultMeta.service` becomes `'app'` (ruling R-5, ratified)**, mirroring the D14b `'app.sid'` precedent. Deploy consequence:
    - The portal already sets `LOG_SERVICE_NAME=crhs-portal` on both boxes (`.env.example:113`, `tests/setup.js:43`, verified live).
    - Corporate does not. The GATE slice (Task 74) writes `LOG_SERVICE_NAME=crhs-corporate` in the same env edit, **before** the reload that loads `v0.2.1`.

- [ ] **Step 1: Write the failing test.** Create `tests/brandNeutral.test.js`:
```js
// Spec §7.2.2 repo-wide brand-neutrality guard (deferred from Plan 1 with
// B3g/B3j/B3k). Every line of every file under src/ — code AND comments — must
// be free of the franchisor mark and the retired/marketing domains. The removed
// origins are described, never spelled.
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const PATTERN = /wavemax|rundberglaundry|runberglaundry|atxwash|wavemaxlaundry/i;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

describe('web-core src/ is brand-neutral (§7.2.2)', () => {
  it('no src file mentions the franchisor mark or a marketing/retired domain', () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (PATTERN.test(line)) offenders.push(`${path.relative(SRC, file)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
```
- [ ] **Step 2: Run the test and confirm it fails.** Command: `npx jest tests/brandNeutral.test.js`. Expected: `expect(received).toEqual(expected) // deep equality`, where the received array is exactly `["config/csrf-config.js:147", "security/corsConfig.js:4", "security/securityHeaders.js:66", "security/securityHeaders.js:83", "security/securityHeaders.js:84", "security/securityHeaders.js:93", "security/securityHeaders.js:94", "utils/logger.js:28", "utils/logger.js:30"]`. Tasks 1-2 already removed `email/transport.js:58,73` and `email/template-manager.js:67`. Any extra entry means an earlier task missed a literal: fix it there, not in the guard.
- [ ] **Step 3: Rewrite the `securityHeaders.js` comments, bottom-up so the quoted line numbers stay valid.**
  - `:91-94`. Replace the four lines from `// Allow public static assets (images, CSS, JS, fonts, locales) to be` through `// location domains (atxwashateria.com, etc.) fail with` with the three lines below. Line `:95` (`// ERR_BLOCKED_BY_RESPONSE.NotSameOrigin even when the request itself`) stays.
```js
    // Allow public static assets (images, CSS, JS, fonts, locales) to be
    // embedded by pages on other origins. A page on one host may reference
    // absolute asset URLs on a sibling host; without this it fails with
```
  - `:82-84`. Replace the three lines from `// Override CORS and resource policy for parent bridge script. Franchise` through `// the bridge from rundberglaundry.com and need cross-origin permission.` with:
```js
    // Override CORS and resource policy for the parent bridge script: a page
    // on another origin that loads the bridge needs cross-origin permission.
    // Plan 3 deletes this block together with the bridge assets (carve-out).
```
  - `:64-67`. Replace the four lines from `// SAMEORIGIN matches the CSP frame-ancestors allowlist semantics for` through `// frame-ancestors directive, which a browser will prefer over XFO).` with:
```js
    // SAMEORIGIN matches the CSP frame-ancestors allowlist semantics; any
    // parent origin an app admits through its own CSP frame-ancestors
    // directive is honoured by modern browsers, which prefer it over XFO.
```
- [ ] **Step 4: Rewrite the `corsConfig.js` and `csrf-config.js` comments.**
  - `corsConfig.js:3-5`. Replace `// The former fixed allowlist granted credentialed CORS to the franchisor's` / `// wavemaxlaundry.com origins, to wavemax.promo and to the four CRHS location` / `// hosts — from BOTH consumers, unconditionally. Every admitted origin now comes` with:
```js
// The former fixed allowlist granted credentialed CORS to the franchisor's
// origins, to a retired app domain and to the four CRHS location
// hosts — from BOTH consumers, unconditionally. Every admitted origin now comes
```
  - `csrf-config.js:147-148`. Replace `    // whenever an Authorization header was present and the wavemax.sid` / `    // cookie was absent — was removed because (a) the bypass keyed on a` with `    // whenever an Authorization header was present and the session` / `    // cookie was absent — was removed because (a) the bypass keyed on a`. Only the first line changes.
- [ ] **Step 5: Change the logger default, test first.**
  - In `tests/utils/logger.test.js`, replace header lines `:4-6` (`// logger. It must default to web-core's historical 'wavemax-affiliate' (so no` / `// consuming app's log stream silently changes) and be overridable via` / `// LOG_SERVICE_NAME (monorepo sets 'crhs-portal', corporate may set`) with:
```js
// logger. It defaults to the generic 'app' (mirroring the 'app.sid' cookie
// default) and is overridable via LOG_SERVICE_NAME (the portal sets
// 'crhs-portal', corporate sets
```
  - Replace the first test (`:19-24`, `'defaults to "wavemax-affiliate" when LOG_SERVICE_NAME is unset'`) with:
```js
  it('defaults to the generic "app" when LOG_SERVICE_NAME is unset', () => {
    delete process.env.LOG_SERVICE_NAME;
    jest.resetModules();
    const logger = require('../../src/utils/logger');
    expect(logger.defaultMeta.service).toBe('app');
  });
```
  - Run `npx jest tests/utils/logger.test.js`. Expected: 1 failed, 1 passed, with `Expected: "app"` / `Received: "wavemax-affiliate"`.
  - Replace `src/utils/logger.js:27-30` (`// Per-app-varying log tag. Defaults to web-core's historical` … `defaultMeta: { service: process.env.LOG_SERVICE_NAME || 'wavemax-affiliate' },`) with:
```js
  // Per-app-varying log tag. Each consuming app sets LOG_SERVICE_NAME (the
  // portal 'crhs-portal', corporate 'crhs-corporate'); the generic 'app' applies
  // only when it is unset.
  defaultMeta: { service: process.env.LOG_SERVICE_NAME || 'app' },
```
- [ ] **Step 6: Fix the stale note.** In `tests/models/systemConfig.test.js`, replace `:979-981` (`// (The repo-wide grep guard from spec §7.2.2 ships with B3g/B3k in v0.2.1 —` / `// src/email/*.js and assets/js/i18n.js still carry rundberglaundry.com fallbacks` / `// in Plan 1, so a repo-wide version would be red on merge.)`) with the single line `// The repo-wide guard is tests/brandNeutral.test.js (v0.2.1); this file-scoped one stays.`
- [ ] **Step 7: Run the tests and confirm they pass.** Command: `npx jest tests/brandNeutral.test.js tests/utils/logger.test.js tests/security && grep -rEil 'wavemax|rundberglaundry|runberglaundry|atxwash|wavemaxlaundry' src/ | wc -l`. Expected: 0 failed; the count prints `0`.
- [ ] **Step 8: Commit.** `git add src tests && git commit -m "test(guard): repo-wide brandNeutral over src/ (§7.2.2); de-brand residual comments; logger default 'app'" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"`

---

### Task 8: web-core — cut and tag `v0.2.1`

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/package.json` (`:3` `"version": "0.2.0"` → `"0.2.1"`), `/mnt/c/Users/rickh/GitHub/crhs-web-core/package-lock.json`

**Interfaces:**
- Produces:
  - Tag `v0.2.1`, with `require('@crhs/web-core/package.json').version === '0.2.1'`.
  - Surface **26**. `wc.csrf` is still `{ createCsrf, CSRF_COOKIE_NAME }`, so no new boot-breaker edge with the affiliate.
  - **Logger default service tag `'app'` (R-5, ratified). The tag `v0.2.1` MUST NOT be installed on any box before the GATE slice (Task 74) writes `LOG_SERVICE_NAME=crhs-corporate` to the corporate `.env`.** An earlier install silently retags corporate log lines `"service":"app"`.

- [ ] **Step 1: Prove the tree is clean before releasing.** Command: `cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git status --porcelain | wc -l && git log --oneline -8`. Expected: `0`, then the seven commits of Tasks 1-7 on top of `2dcd6ff release: v0.2.0 — API release`.
- [ ] **Step 2: Run the full gate before bumping.** Command: `npm test 2>&1 | grep -E "^(Tests:|Test Suites:)" && npm run lint && npx madge --circular src/`. Expected:
  - `Test Suites: 35 passed, 35 total`
  - `Tests:       579 passed, 579 total`
  - `eslint src tests` prints no problems
  - `✔ No circular dependency found!`
  - Arithmetic, from the measured 572 / 33: tests 572 − 8 (`brand.test.js`) + 4 (transport: 2 replaced by 6) + 0 (template-manager: 6 replaced by 6) + 0 (cspHelper: 1 replaced by 1) + 2 (`brandModuleRemoved`) + 6 (`validateMailConfig`) + 2 (i18n) + 1 (`brandNeutral`) + 0 (logger: 1 replaced by 1) = **579**. Suites 33 − 1 + 3 = **35**. Any other number → STOP and find the missing or extra test.
- [ ] **Step 3: Bump the version.** Command: `npm version 0.2.1 --no-git-tag-version && node -p "require('./package.json').version" && grep -m1 '"version"' package-lock.json`. Expected: `v0.2.1` (npm's echo), `0.2.1`, `  "version": "0.2.1",`.
- [ ] **Step 4: Commit and tag, then prove the tag is exact and the tree clean BEFORE pushing.**
```bash
git add package.json package-lock.json && git commit -m "release: v0.2.1 — B3g email brand params + replyTo, brand.js deleted, B3j validateMailConfig, B3k i18n /locales + aria-label, repo-wide brandNeutral guard

Surface unchanged at 26 keys. sendEmail display-name precedence is
fromName > EMAIL_FROM_NAME > displayName (R-6). Logger default service tag is
now 'app' (R-5): do not install this tag on any box before the GATE slice writes
LOG_SERVICE_NAME=crhs-corporate to the corporate .env.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git tag v0.2.1
git describe --exact-match --tags && git status --porcelain | wc -l
```
  Expected: `v0.2.1`, then `0`. Anything else → STOP (do not push); fix the tree or re-point the tag with `git tag -f v0.2.1` only after re-running Step 2.
- [ ] **Step 5: Push.** Command: `git push origin main v0.2.1 && git ls-remote --tags origin v0.2.1 | wc -l`. Expected: `1`.

---

### Task 9: corporate — adopt v0.2.1 locally (topology floor + lockfile)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/packageTopology.test.js` (`:39` comment phrase; `:48` floor `'0.2.0'` → `'0.2.1'`)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/package-lock.json` (`:538-540`, the `node_modules/@crhs/web-core` entry)

**Interfaces:**
- Consumes: web-core tag `v0.2.1` (Task 8). Corporate uses none of the removed APIs:
  - `server/middleware/accessGate.js:39,345` calls `sendEmail` with 4 args.
  - `server/crhsentHandler.js:34` calls `readHTMLWithNonce` with 2 args.
  - Corporate never calls `fillTemplate`.
- Produces: a local corporate checkout whose suite fails loudly on a stale core copy (R-18 skew). **Local only. Nothing is installed on a box** (the GATE slice owns that).

- [ ] **Step 1: Write the failing test.** In `tests/packageTopology.test.js`:
  - Change `expect(cmp(require('@crhs/web-core/package.json').version, '0.2.0')).toBeGreaterThanOrEqual(0);` to use `'0.2.1'`.
  - In the comment above it, change `a box running core OLDER than 0.2.0 against this code is` to `a box running core OLDER than 0.2.1 against this code is`.
- [ ] **Step 2: Run the test against the stale copy and confirm it fails.** Command: `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && node -p "require('@crhs/web-core/package.json').version" && npx jest tests/packageTopology.test.js -t 'never regresses'`. Expected: `0.2.0`, then `expect(received).toBeGreaterThanOrEqual(expected)` / `Expected: >= 0` / `Received:    -1`. This proves the stale-copy trap: web-core is at 0.2.1 but corporate's copy is not.
- [ ] **Step 3: Re-copy the dependency.** Command: `rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund && node -p "require('@crhs/web-core/package.json').version" && node -p "Object.keys(require('@crhs/web-core')).length" && node -p "typeof require('@crhs/web-core').email.validateMailConfig"`. Expected: `0.2.1`, `26`, `function`.
- [ ] **Step 4: Rewrite the lockfile.** The `rm -rf` leaves the lock stale. Command: `sed -i '/"node_modules\/@crhs\/web-core"/,/}/ s/"version": "0.2.0"/"version": "0.2.1"/' package-lock.json && grep -A1 '"node_modules/@crhs/web-core"' package-lock.json`. Expected: `"node_modules/@crhs/web-core": {` then `      "version": "0.2.1",`.
- [ ] **Step 5: Run the corporate suite, lint and cycle check.** Command: `npm test 2>&1 | grep -E "^(FAIL|Tests:|Test Suites:)"; npm run lint && npx madge --circular server/`. Expected:
  - `FAIL tests/crhsent-parity.test.js`
  - `Test Suites: 1 failed, 13 passed, 14 total`
  - `Tests:       4 failed, 1 skipped, 99 passed, 104 total` (the 4 accepted ENOENT failures; A15 Task 23 deletes that suite)
  - `eslint server tests` prints no problems
  - `✔ No circular dependency found!`
- [ ] **Step 6: Commit and push.** `git add tests/packageTopology.test.js package-lock.json && git commit -m "deps: web-core 0.2.1 floor + lockfile" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git push origin main`

---

### Task 13: affiliate — record web-core 0.2.1 and prove the portal still boots against it (local)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/package-lock.json` (`:667-669`, the `node_modules/@crhs/web-core` entry)

**Interfaces:**
- Consumes: v0.2.1. The affiliate touches none of the removed APIs:
  - It has its own `server/services/email/template-manager.js:45` `fillTemplate`.
  - It passes a brand OBJECT to cspHelper (`server/utils/cspHelper.js:32-34`).
  - It serves its own `public/assets/js/i18n.js`.
  - It sets `LOG_SERVICE_NAME=crhs-portal` (`.env.example:113`, `tests/setup.js:43`), so the `'app'` logger default does not reach it.
- Produces: an affiliate lock recording `0.2.1`. **Local only.** GATE Task 72 Step 7 re-proves compatibility at the box HEAD; GATE Task 75 installs on the boxes, after GATE Task 74 writes the `.env`.
- **Global Constraint 19:** the affiliate full suite is NOT run here (~67 min). Task 19 Step 3 and GATE Task 72 Step 7 run the three web-core seam suites, a boot probe and `madge` instead (declared deviation D-b); the full suite runs exactly once, controller-run, in GATE Task 72 Step 7b (R-16).

- [ ] **Step 1: Prove the stale-copy trap locally first.** Command: `cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npm install --install-links --no-audit --no-fund && node -p "require('@crhs/web-core/package.json').version"`. Expected: `0.2.0`.
- [ ] **Step 2: Re-copy.** Command: `rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund && node -p "require('@crhs/web-core/package.json').version" && node -p "Object.keys(require('@crhs/web-core').csrf)" && node -p "Object.keys(require('@crhs/web-core')).length" && node -p "require.resolve('mongoose',{paths:[require.resolve('@crhs/web-core')]})===require.resolve('mongoose')"`. Expected: `0.2.1`, `[ 'createCsrf', 'CSRF_COOKIE_NAME' ]`, `26`, `true`. The last check uses the resolution-path form only: `wc.SystemConfig.base` throws `OverwriteModelError` in the affiliate (Global Constraint 16e).
- [ ] **Step 3: Rewrite the lockfile.** Command: `sed -i '/"node_modules\/@crhs\/web-core"/,/}/ s/"version": "0.2.0"/"version": "0.2.1"/' package-lock.json && grep -A1 '"node_modules/@crhs/web-core"' package-lock.json`. Expected: `"node_modules/@crhs/web-core": {` then `      "version": "0.2.1",`.
- [ ] **Step 4: Run the seam tests and a boot probe.** Command: `npx jest tests/integration/webCoreInstanceIdentity.test.js tests/integration/webCoreConsumptionGolden.test.js tests/integration/securityHeaders.test.js && NODE_ENV=test node -e "require('./server.js'); console.log('BOOT_OK'); process.exit(0)"`. Expected: 0 failed across the three suites; `BOOT_OK`. If a suite fails, re-run it alone before debugging (memory `test_suite_fully_green_2026-06-20`).
- [ ] **Step 5: Cycle check and lint baseline (declared deviation D-c).** Command: `npx madge --circular server/ && npx eslint server/ 2>&1 | tail -2`. Expected: `✔ No circular dependency found!`, then `✖ 208 problems (208 errors, 0 warnings)`. That count matches the 2026-09-13 measurement; this task touches no `.js` file, so any other count means an unrelated change landed and must be explained before continuing.
- [ ] **Step 6: Commit and push.** `git add package-lock.json && git commit -m "deps: record web-core 0.2.1 in the lockfile" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git push origin main`

---

### Task 15: **HUMAN-CONFIRM** — P-10: pre-create `sessions_corporate` on Oracle ADB

ADB cannot upsert-create the sessions collection the way connect-mongo expects, so the collection must exist before the first corporate boot with `collectionName: 'sessions_corporate'`. That literal is added by A15 Task 30 and first booted in production by GATE Task 75. **Never `drop()` a sessions collection on ADB** (memory `lighthouse_psi_quality_bar`).

**Declared deviation (D-a) from spec §9.1 P-10.** The spec creates the collection with `mongosh` from the admin IP `70.114.167.145` and verifies it with `mongosh --eval "db.getCollectionNames().filter(n=>/^sessions/.test(n))"`. This task instead creates it from **oci1**, whose egress is already on the ADB ACL because both apps connect from it, through corporate's own `server/db.js` `connect()` (verified present on oci1: `/var/www/crhs-corporate/server/db.js`, 1212 bytes, and `/var/www/crhs-corporate/node_modules/dotenv`). `listCollections()` stands in for `db.getCollectionNames()` and shows the same `["sessions","sessions_corporate"]` outcome. The spec's `grep -n collectionName /var/www/crhs-corporate/server.js` source check runs in GATE Task 75, after the corporate code carrying the literal is on the box.

**Files:** none.

**Interfaces:**
- Consumes: corporate `server/db.js` `connect()` (a no-op only under `NODE_ENV=test`, hence the explicit `production`), box `.env` `MONGODB_URI`.
- Produces: an empty collection `sessions_corporate` in the shared database. Consumed by GATE Task 72 Step 8 (pre-flight) and the first corporate boot in GATE Task 75.

- [ ] **Step 1: Confirm with Rick.** Ask: "Create the empty `sessions_corporate` collection on the shared ADB from oci1 now? It is inert until the Phase-0a corporate deploy."
- [ ] **Step 2: Create the collection (oci1 only — it is one shared database).** The remote command is single-quoted and uses no local variables. Command:
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'cd /var/www/crhs-corporate && node -e "require(\"dotenv\").config();process.env.NODE_ENV=\"production\";const db=require(\"./server/db\");const m=require(\"mongoose\");db.connect().then(async()=>{const names=(await m.connection.db.listCollections().toArray()).map(c=>c.name);if(!names.includes(\"sessions_corporate\"))await m.connection.db.createCollection(\"sessions_corporate\");const after=(await m.connection.db.listCollections().toArray()).map(c=>c.name).filter(n=>/^sessions/.test(n)).sort();console.log(JSON.stringify(after));process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"'
```
  Expected: `["sessions","sessions_corporate"]`, exactly those two. Any other list, or a non-zero exit, → STOP and report the output to Rick.
- [ ] **Step 3: Prove it from oci2 (read-only), so both boxes see the same database.** Command:
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@144.24.4.202 'cd /var/www/crhs-corporate && node -e "require(\"dotenv\").config();process.env.NODE_ENV=\"production\";const db=require(\"./server/db\");const m=require(\"mongoose\");db.connect().then(async()=>{console.log(JSON.stringify((await m.connection.db.listCollections().toArray()).map(c=>c.name).filter(n=>/^sessions/.test(n)).sort()));process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"'
```
  Expected: `["sessions","sessions_corporate"]`.
- **Rollback:** none is performed. An empty `sessions_corporate` with no writer is inert. Do NOT drop it: a drop on ADB is the forbidden operation, and a later re-create would race the first boot.

---

### Task 16: **HUMAN-CONFIRM** — Mailcow prerequisites: sending identity, P-13 `pickups@` goto (+ §8.4 self-row), P-15 `security@` + `cutover-gate@`

> **DONE 2026-09-13 — owner-directed variant (supersedes Steps 2–3 and the Step 5 expectations below).** Rick chose to make `admin@crhsent.com` the single real mailbox. Executed by the controller via the Mailcow API: the `admin@crhsent.com` alias (→ `administrator@wavemax.promo`) was replaced by a mailbox (2 GB); all 48 messages of `administrator@wavemax.promo` and the 10 of `pickups@rundberglaundry.com` were copied in (per-folder counts verified; the latter under `Pickups-rundberglaundry/`); both old mailboxes were deleted (owner-confirmed) and recreated as aliases. Final routing — every one → `admin@crhsent.com`: `administrator@wavemax.promo`, `affiliates@wavemax.promo`, `support@wavemax.promo`, `pickups@atxwashdryfold.com`, `pickups@rundberglaundry.com`, `security@crhsent.com`, `cutover-gate@crhsent.com`, `affiliates@`/`legal@`/`privacy@`/`support@rundberglaundry.com`. Five internal delivery probes landed in `admin@crhsent.com` INBOX. P-13 and P-15 are therefore satisfied by the alias state; external probes remain optional.

**Files:** none in the repos. Record the goto values and alias ids in `/home/rickh/.claude/projects/-mnt-c-Users-rickh-GitHub-wavemax-affiliate-program/memory/production_systems_access.md`. Task 19 copies them into `tasks/todo.md`.

**Interfaces:**
- Produces:
  - Proof that `no-reply@crhsent.com` is an active mailbox (the SMTP login GATE Task 74 writes).
  - `pickups@atxwashdryfold.com` goto includes an actively read mailbox.
  - The `pickups@rundberglaundry.com` self-row gets the same treatment, because a code path still defaults there: `wavemax-affiliate-program/server/services/partnerInquiryService.js:6` `process.env.PARTNER_INQUIRY_RECIPIENT || 'pickups@rundberglaundry.com'` (§8.4 P-13 row).
  - Aliases `security@crhsent.com` → `admin@crhsent.com` and `cutover-gate@crhsent.com` → `admin@crhsent.com` (the C6 lead address).
- Access: the mail host is reached as `sudo ssh wavemax-promo` (158.62.198.7), which is correct for this workstation (ruling R-13).

- [ ] **Step 1: Read the current state (read-only).** Command:
```bash
sudo ssh wavemax-promo 'cd /opt/mailcow-dockerized && set -a && . ./mailcow.conf && set +a && docker compose exec -T mysql-mailcow mysql -u"$DBUSER" -p"$DBPASS" "$DBNAME" -N -e "select username,active from mailbox where username in (\"no-reply@crhsent.com\",\"pickups@rundberglaundry.com\",\"administrator@wavemax.promo\"); select address,goto from alias where address in (\"pickups@atxwashdryfold.com\",\"pickups@rundberglaundry.com\",\"admin@crhsent.com\",\"security@crhsent.com\",\"cutover-gate@crhsent.com\")" 2>/dev/null'
```
  - Credentials: `$DBUSER`, `$DBPASS` and `$DBNAME` sit inside the single quotes on purpose — they are read from `mailcow.conf` on the mail host (the same form as GATE Task 72 Step 10); the password never reaches the workstation.
  Expected (spec §8.4 row + memory `cf_api_token_and_lb_monitor_2026-09-09`):
  - Mailbox rows `no-reply@crhsent.com 1`, `pickups@rundberglaundry.com 1`, `administrator@wavemax.promo 1`.
  - Alias rows `pickups@atxwashdryfold.com pickups@rundberglaundry.com` and `admin@crhsent.com administrator@wavemax.promo`.
  - No `security@` or `cutover-gate@` rows.
  - A `pickups@rundberglaundry.com` alias row (the mailbox self-row) is either present with goto `pickups@rundberglaundry.com` or absent.
  - **Write down every returned `goto` string verbatim.** They are the rollback values. If `no-reply@crhsent.com` is missing or `active` ≠ `1` → STOP: GATE Task 74 cannot switch corporate to that login.
- [ ] **Step 2: P-13, after confirming with Rick.** Mailcow admin `https://mail.crhsent.com/` → Mail Setup → Aliases → `pickups@atxwashdryfold.com`: set goto to `pickups@rundberglaundry.com,administrator@wavemax.promo` (`goto` is comma-separated, so the pickups mailbox stays a recipient). If Rick instead accepts "leads land in `pickups@rundberglaundry.com` and someone now reads it", record that sentence verbatim and skip Steps 2-3.
- [ ] **Step 3: §8.4 self-row, same confirmation.** If Step 1 returned an alias row for `pickups@rundberglaundry.com`, set its goto to `pickups@rundberglaundry.com,administrator@wavemax.promo`. If Step 1 returned no such row, add nothing and record `pickups@rundberglaundry.com: mailbox only, no alias self-row — portal default (partnerInquiryService.js:6) still delivers to the unread mailbox until PARTNER_INQUIRY_RECIPIENT is set on the portal`, so Plan 3's form flip carries it.
- [ ] **Step 4: P-15, after confirming with Rick.** Aliases → Add: `security@crhsent.com` goto `admin@crhsent.com`; `cutover-gate@crhsent.com` goto `admin@crhsent.com`. If Rick declines `security@`, record it: corporate A15 Task 41 and the portal `public/.well-known/security.txt:4` then change to `Contact: mailto:admin@crhsent.com` in one commit.
- [ ] **Step 5: Prove delivery.** Send one probe mail from any external mailbox to `security@crhsent.com` and one to `cutover-gate@crhsent.com`, and (if Step 2 edited it) one to `pickups@atxwashdryfold.com`. Within 10 minutes, run:
```bash
sudo ssh wavemax-promo 'docker compose -f /opt/mailcow-dockerized/docker-compose.yml logs --since 10m postfix-mailcow | grep -E "orig_to=<(security@crhsent.com|cutover-gate@crhsent.com|pickups@atxwashdryfold.com)>" | grep -E "status=(sent|bounced)"'
```
  Expected: for each probe, a `to=<administrator@wavemax.promo>` line with that `orig_to=` and `status=sent`. The pickups probe also shows `to=<pickups@rundberglaundry.com>` with `status=sent`. Any `status=bounced` → run the rollback for that alias and report.
- **Rollback (exact):** Mailcow admin → Aliases:
  - Delete `security@crhsent.com` and `cutover-gate@crhsent.com`.
  - Set `pickups@atxwashdryfold.com` goto back to the exact Step 1 string (`pickups@rundberglaundry.com` as measured by the spec).
  - If Step 3 edited the self-row, set it back to its Step 1 goto (`pickups@rundberglaundry.com`).

---

### Task 17: P-16 fallback alert script (corporate, TDD) + Q-12 owner decision + **read-only** P-17 origin exposure check

**Ruling R-7:**
- `mail`/`mailx` is NOT installed on either box (re-verified 2026-09-13 on oci1: `command -v mail mailx` prints nothing). Installing packages on production is out of scope.
- The fallback alert is a committed corporate node script that sends through the app's own SMTP identity via web-core `sendEmail` to `admin@crhsent.com`.
- `pm2` is `/usr/bin/pm2` and `node` is `/usr/bin/node` (v20.20.2), both on cron's `PATH=/usr/bin:/bin`.
- The external-service choice (Q-12) stays the owner's; the on-box cron is the default.

**Ruling R-1:** the script and the cron file reach a box only with the Phase-0a corporate deploy. **Installing `/etc/cron.d/crhs-corporate-health` and the drill that proves an alert is delivered belong to the GATE slice** and run in GATE Task 81 Step 7, after the corporate deploy is verified on both boxes. This task ships and tests the code.

**Plan 1 note:** the LB monitor already covers `:3001` per box through `/health/origin`, which returns 503 when the content app is down (`tasks/todo.md:134`). P-16 is the external second signal.

**Files:**
- Create: `/mnt/c/Users/rickh/GitHub/crhs-corporate/scripts/ops/alert.js`
- Create: `/mnt/c/Users/rickh/GitHub/crhs-corporate/deploy/cron/crhs-corporate-health`
- Create: `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/opsAlert.test.js`

**Interfaces:**
- Produces:
  - `scripts/ops/alert.js` exports `ALERT_TO = 'admin@crhsent.com'`, `sendAlert({ message: string, host?: string, sendEmail: Function }) => Promise<void>` and `main(argv?: string[]) => Promise<0|1>`.
  - `sendAlert` calls `sendEmail('admin@crhsent.com', 'crhs-corporate alert on <host>', html, undefined, { displayName: 'CRHS Enterprises' })`. Per R-6 it passes `displayName`, never `fromName`.
  - `main` loads `/var/www/crhs-corporate/.env` (the repo root's `.env`) via dotenv, then calls `sendAlert` with web-core's `email.transport.sendEmail`. It resolves `0` after a delivered send and `1` after any failure, logged via web-core `logger`.
  - CLI: `node scripts/ops/alert.js <message words…>` exits with `main`'s code.
  - `deploy/cron/crhs-corporate-health` is the exact `/etc/cron.d` file content GATE installs.
- Consumes: web-core `email.transport.sendEmail` with the 5-arg signature (Task 1) and `logger`.

- [ ] **Step 1: Q-12 — Rick names the external service or declines.** Ask: "P-16: which external uptime service should poll `https://atxwashdryfold.com/health` and `https://crhsent.com/health` every ≤ 60 s and alert `admin@crhsent.com`? Or should we rely on the on-box cron fallback alone?"
  - If Rick names one, he creates the two checks (expect 200 `{"status":"ok"}`). Record service, check ids and alert route in `production_systems_access.md`.
  - Record Rick's answer verbatim either way. The cron fallback below ships regardless, as the minimum spec §9.1 P-16 accepts.
- [ ] **Step 2: Write the failing tests.** Create `tests/opsAlert.test.js`:
```js
// §9.1 P-16 fallback uptime alert (ruling R-7): no mail(1) on the boxes, so the
// cron fallback alerts through the app's own SMTP identity via web-core sendEmail.
const fs = require('fs');
const path = require('path');
const { ALERT_TO, sendAlert } = require('../scripts/ops/alert');

describe('scripts/ops/alert.js — P-16 fallback alert (R-7)', () => {
  it('mails admin@crhsent.com through sendEmail with the app display name (R-6)', async () => {
    const sendEmail = jest.fn().mockResolvedValue({ messageId: 't' });
    await sendAlert({ message: 'crhs-corporate /health failed, reloaded', host: 'oci2', sendEmail });
    expect(ALERT_TO).toBe('admin@crhsent.com');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html, fromOverride, options] = sendEmail.mock.calls[0];
    expect(to).toBe('admin@crhsent.com');
    expect(subject).toBe('crhs-corporate alert on oci2');
    expect(html).toContain('crhs-corporate /health failed, reloaded');
    expect(fromOverride).toBeUndefined();
    expect(options).toEqual({ displayName: 'CRHS Enterprises' });
  });

  it('escapes the message so a crafted argument cannot inject markup', async () => {
    const sendEmail = jest.fn().mockResolvedValue({});
    await sendAlert({ message: '<script>x</script>', host: 'oci1', sendEmail });
    expect(sendEmail.mock.calls[0][2]).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(sendEmail.mock.calls[0][2]).not.toContain('<script>');
  });

  it('rejects an empty message and sends nothing', async () => {
    const sendEmail = jest.fn();
    await expect(sendAlert({ message: '', host: 'oci1', sendEmail })).rejects.toThrow('alert: message is required');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('propagates a transport failure', async () => {
    const sendEmail = jest.fn().mockRejectedValue(new Error('553 5.7.1'));
    await expect(sendAlert({ message: 'm', host: 'oci1', sendEmail })).rejects.toThrow('553 5.7.1');
  });

  it('main() resolves 0 after a delivered alert and 1 after a failed one', async () => {
    const sendEmail = jest.fn().mockResolvedValueOnce({ messageId: 'ok' }).mockRejectedValueOnce(new Error('down'));
    jest.resetModules();
    jest.doMock('@crhs/web-core', () => ({
      email: { transport: { sendEmail } },
      logger: { info: jest.fn(), error: jest.fn() }
    }));
    const { main } = require('../scripts/ops/alert');
    await expect(main(['health', 'failed'])).resolves.toBe(0);
    await expect(main(['health', 'failed'])).resolves.toBe(1);
    expect(sendEmail.mock.calls[0][0]).toBe('admin@crhsent.com');
    expect(sendEmail.mock.calls[0][2]).toContain('health failed');
    jest.dontMock('@crhs/web-core');
  });
});

describe('deploy/cron/crhs-corporate-health (P-16 fallback, R-7)', () => {
  const cron = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'cron', 'crhs-corporate-health'), 'utf8');

  it('polls :3001/health every 2 minutes as ubuntu, reloads with absolute pm2, alerts via the committed script', () => {
    expect(cron).toMatch(/^\*\/2 \* \* \* \* ubuntu curl -fsS --max-time 5 http:\/\/127\.0\.0\.1:3001\/health /m);
    expect(cron).toContain('/usr/bin/pm2 reload crhs-corporate');
    expect(cron).toContain('cd /var/www/crhs-corporate && /usr/bin/node scripts/ops/alert.js');
    expect(cron).not.toMatch(/\bmailx?\b/);
    expect(cron).not.toContain('%');
    expect(cron.endsWith('\n')).toBe(true);
  });
});
```
- [ ] **Step 3: Run the tests and confirm they fail.** Command: `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/opsAlert.test.js`. Expected: `FAIL tests/opsAlert.test.js` / `● Test suite failed to run` / `Cannot find module '../scripts/ops/alert' from 'tests/opsAlert.test.js'`.
- [ ] **Step 4: Implement the script.** Create `scripts/ops/alert.js`:
```js
// Ops alert for the §9.1 P-16 fallback uptime cron (ruling R-7).
//
//   node scripts/ops/alert.js <message words…>
//
// The boxes have no mail(1)/mailx, so the alert goes through this app's own
// SMTP identity (EMAIL_USER/EMAIL_FROM in .env) via @crhs/web-core sendEmail.
// Loads the repo-root .env via dotenv (same as server.js); env already present
// in the process is not overridden. Exits 0 after a delivered send, 1 otherwise.
// Logs via @crhs/web-core's Winston logger (no console in server/ or scripts/).

'use strict';

const os = require('os');
const path = require('path');

const ALERT_TO = 'admin@crhsent.com';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

/**
 * Send one ops alert to ALERT_TO.
 * @param {{message: string, host?: string, sendEmail: Function}} opts
 * @returns {Promise<void>} rejects when the message is empty or the send fails.
 */
async function sendAlert({ message, host = os.hostname(), sendEmail }) {
  if (!message) throw new Error('alert: message is required');
  const html = `<p>${escapeHtml(message)}</p><p>Host: ${escapeHtml(host)}</p>`;
  await sendEmail(ALERT_TO, `crhs-corporate alert on ${host}`, html, undefined, { displayName: 'CRHS Enterprises' });
}

/**
 * CLI entry: load .env, send argv as the alert message.
 * @param {string[]} [argv]
 * @returns {Promise<0|1>}
 */
async function main(argv = process.argv.slice(2)) {
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
  const { email, logger } = require('@crhs/web-core');
  try {
    await sendAlert({ message: argv.join(' '), sendEmail: email.transport.sendEmail });
    logger.info(`ops alert sent to ${ALERT_TO}`);
    return 0;
  } catch (err) {
    logger.error('ops alert failed:', err.message);
    return 1;
  }
}

if (require.main === module) {
  main().then((code) => process.exit(code));
}

module.exports = { ALERT_TO, sendAlert, main };
```
- [ ] **Step 5: Create the cron file.** Create `deploy/cron/crhs-corporate-health` with exactly this content, ending in a newline:
```
# /etc/cron.d/crhs-corporate-health - fallback :3001 uptime check (spec 9.1 P-16, ruling R-7).
# Installed on each box by the GATE slice after the Phase-0a corporate deploy.
SHELL=/bin/sh
PATH=/usr/bin:/bin
*/2 * * * * ubuntu curl -fsS --max-time 5 http://127.0.0.1:3001/health >/dev/null 2>&1 || { /usr/bin/pm2 reload crhs-corporate >/dev/null 2>&1; cd /var/www/crhs-corporate && /usr/bin/node scripts/ops/alert.js "crhs-corporate /health failed on $(hostname); pm2 reload issued"; }
```
- [ ] **Step 6: Run the tests, lint and the full suite.** Command: `npx jest tests/opsAlert.test.js && npx eslint scripts/ops/alert.js tests/opsAlert.test.js && npm test 2>&1 | grep -E "^(FAIL|Tests:|Test Suites:)"`. Expected:
  - `Tests: 6 passed, 6 total`
  - eslint prints nothing
  - `FAIL tests/crhsent-parity.test.js`, `Test Suites: 1 failed, 14 passed, 15 total`, `Tests:       4 failed, 1 skipped, 105 passed, 110 total` (Task 9's 99 passed + 6 new = 105; 104 + 6 = 110 total)
- [ ] **Step 7: Commit and push.** `git add scripts/ops/alert.js deploy/cron/crhs-corporate-health tests/opsAlert.test.js && git commit -m "ops(P-16): fallback uptime alert via web-core sendEmail + cron file (R-7; no mail(1) on boxes)" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git push origin main`
- [ ] **Step 8: P-17 (read-only).** Run from the workstation:
```bash
for IP in 161.153.71.201 144.24.4.202; do echo "== $IP"; ssh -i ~/.ssh/oci_wavemax "ubuntu@$IP" 'sudo ufw status numbered'; done
```
  - Paste both outputs into `production_systems_access.md` under a `P-17 (2026-09)` heading.
  - If `:443`/`:80` are not restricted to the Cloudflare ranges plus `70.114.167.145`, write that down verbatim: C8b then stands as the proof that a forged `CF-Connecting-IP` is inert.
  - **No firewall change is made in Plan 2.**

---

### Task 19: Phase-0 (slice P0) exit verification — read-only — and the exit record

This task only reads, plus one local `tasks/todo.md` commit. It changes no box, `.env`, Mailcow row or Cloudflare object. It is the §9.1 exit-criteria check for the items this slice owns. GATE Task 72 consumes the result.

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tasks/todo.md` (`:296-309`, section `### D-1`; plus a new section after it)

**Interfaces:**
- Consumes: Tasks 1-9, 13, 15, 16, 17.
- Produces:
  - A `tasks/todo.md` record that Phase-0 prerequisites P-10, P-13, P-15, P-16 (code + Q-12 answer) and P-17 are closed.
  - The same record states that web-core `v0.2.1` is tagged but **not yet installed on any box** (GATE Task 75 installs it after GATE Task 74's `LOG_SERVICE_NAME` write, R-5).

- [ ] **Step 1: web-core release is exact and green.** Command: `cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git fetch --tags --quiet && git describe --exact-match --tags && git status --porcelain | wc -l && git ls-remote --tags origin v0.2.1 | wc -l && npm test 2>&1 | grep -E "^(Tests:|Test Suites:)" && npm run lint && npx madge --circular src/`. Expected:
  - `v0.2.1`, `0`, `1`
  - `Test Suites: 35 passed, 35 total`, `Tests:       579 passed, 579 total`
  - `eslint src tests` prints no problems
  - `✔ No circular dependency found!`
- [ ] **Step 2: Corporate green (apart from the 4 accepted failures).** Command: `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && node -p "require('@crhs/web-core/package.json').version" && npm test 2>&1 | grep -E "^(FAIL|Tests:|Test Suites:)"; npm run lint && npx eslint scripts && npx madge --circular server/`. Expected:
  - `0.2.1`
  - `FAIL tests/crhsent-parity.test.js`, `Test Suites: 1 failed, 14 passed, 15 total`, `Tests:       4 failed, 1 skipped, 105 passed, 110 total`
  - both eslint runs print nothing
  - `✔ No circular dependency found!`
- [ ] **Step 3: Affiliate — seam suites, boot probe, cycles and lint baseline (declared deviation D-b; the full suite is never run, Global Constraint 19).** Command: `cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && node -p "require('@crhs/web-core/package.json').version" && npx jest tests/integration/webCoreInstanceIdentity.test.js tests/integration/webCoreConsumptionGolden.test.js tests/integration/securityHeaders.test.js 2>&1 | grep -E "^(Tests:|Test Suites:)" && NODE_ENV=test node -e "try{require('./server.js');console.log('BOOT_OK');process.exit(0)}catch(e){console.log(e.message);process.exit(1)}" && npx madge --circular server/ && npx eslint server/ 2>&1 | tail -2`. Expected:
  - `0.2.1`
  - `Test Suites: 3 passed, 3 total`, then a `Tests:` line with no `failed` segment
  - `BOOT_OK`
  - `✔ No circular dependency found!`
  - `✖ 208 problems (208 errors, 0 warnings)` (D-c baseline)
  - A failing seam suite → re-run it alone (`npx jest <path>`) before debugging; it counts only if it fails in isolation.
- [ ] **Step 4: P-10 still holds (read-only).** Command:
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'cd /var/www/crhs-corporate && node -e "require(\"dotenv\").config();process.env.NODE_ENV=\"production\";const db=require(\"./server/db\");const m=require(\"mongoose\");db.connect().then(async()=>{console.log(JSON.stringify((await m.connection.db.listCollections().toArray()).map(c=>c.name).filter(n=>/^sessions/.test(n)).sort()));process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"'
```
  Expected: `["sessions","sessions_corporate"]`.
- [ ] **Step 5: P-13 / P-15 state (read-only).** Command:
```bash
sudo ssh wavemax-promo 'cd /opt/mailcow-dockerized && set -a && . ./mailcow.conf && set +a && docker compose exec -T mysql-mailcow mysql -u"$DBUSER" -p"$DBPASS" "$DBNAME" -N -e "select address,goto from alias where address in (\"pickups@atxwashdryfold.com\",\"pickups@rundberglaundry.com\",\"security@crhsent.com\",\"cutover-gate@crhsent.com\")" 2>/dev/null'
```
  Expected: the values Task 16 set (owner-directed variant): `pickups@atxwashdryfold.com admin@crhsent.com`, `pickups@rundberglaundry.com admin@crhsent.com`, `security@crhsent.com admin@crhsent.com`, `cutover-gate@crhsent.com admin@crhsent.com`. Where Rick accepted the "someone reads it" sentence in Task 16, the original goto is expected instead.
- [ ] **Step 6: LB pool healthy (read-only).** The CF API token expires **2026-09-16** (Global Constraint 2). On or after that date this call fails; read the pool in the Cloudflare dashboard (Traffic → Load Balancing → Pools → `wavemax-oci`) instead, or use a fresh token. Command:
```bash
ACCT=b69ef162d008b11492296d3b35cad2fe
curl -s -H "Authorization: Bearer $(cat ~/.cf_api_token)" "https://api.cloudflare.com/client/v4/accounts/$ACCT/load_balancers/pools/1e3795c02e98b9506cfab578c9cb7c97" | python3 -c "import sys,json;p=json.load(sys.stdin)['result'];print(p['name'],[(o['address'],o.get('healthy')) for o in p['origins']])"
```
  Expected: `wavemax-oci [('161.153.71.201', True), ('144.24.4.202', True)]`.
- [ ] **Step 7: P-16 / P-17 records exist.** Command: `grep -n "P-16\|P-17" /home/rickh/.claude/projects/-mnt-c-Users-rickh-GitHub-wavemax-affiliate-program/memory/production_systems_access.md`. Expected: at least one `P-16` line (Q-12 answer or service/check ids) and one `P-17` line (both ufw outputs).
- [ ] **Step 8: Write the exit record.** In `tasks/todo.md` under `### D-1` (`:296`):
  - Tick the four boxes at `:298`, `:302`, `:303`, `:305` (B3g, B3j, B3k, "The guard that goes with them"). Suffix each with `— tagged @crhs/web-core v0.2.1 (<git rev-parse v0.2.1>) <date>; box install owned by the Plan 2 GATE slice (Phase 0a)`.
  - Directly after the D-1 section, add:
```markdown
### Plan 2 slice P0 — Phase 0 record (<date>)
- web-core v0.2.1 tagged + pushed: 579 tests / 35 suites, lint + madge clean. NOT installed on any box — the GATE slice installs it after writing LOG_SERVICE_NAME=crhs-corporate (R-5).
- sendEmail display-name precedence fromName > EMAIL_FROM_NAME > displayName (R-6).
- Corporate local adoption: floor 0.2.1, lockfile 0.2.1; suite 4 accepted parity failures only (105 passed).
- Affiliate local adoption: lockfile 0.2.1; web-core seam suites green + BOOT_OK (full suite not run here, Global Constraint 19 — its 2 known failures stand as the baseline; it runs once, controller-run, in GATE Task 72 Step 7b); madge clean; eslint server/ 208 errors (pre-existing, unchanged — Plan 4 finding).
- P-10: ["sessions","sessions_corporate"] from oci1 and oci2 (created via corporate server/db.js on oci1 — declared deviation from the spec's mongosh form).
- P-13: pickups@atxwashdryfold.com goto = <value or Rick's accepted sentence>; pickups@rundberglaundry.com self-row = <value or "mailbox only">.
- P-15: security@crhsent.com + cutover-gate@crhsent.com → admin@crhsent.com, probes status=sent <date>.
- P-16: Q-12 answer <verbatim>; fallback scripts/ops/alert.js + deploy/cron/crhs-corporate-health committed (<corporate sha>). Cron install + alert drill: GATE Task 81 Step 7.
- P-17: ufw outputs recorded in production_systems_access.md <date>.
- P-12 not executed — superseded by Plan 1 Tasks 59-61 (/health/origin).
- OUT of P0: P-2/P-4/P-5/P-6 → corporate A1-A9; P-7/P-8 env + gate identity → A69 Task 57/59 + GATE Tasks 74-75; P-9 → Phase 0b; P-11 → Plan 3.
```
  Replace every `<…>` with the value recorded in the corresponding step before committing. A `<` left in the new section is a failed step.
- [ ] **Step 9: Commit and push.** Command: `cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && ! grep -n "<date>\|<value\|<verbatim>\|<corporate sha>\|<git rev-parse" tasks/todo.md && git add tasks/todo.md && git commit -m "docs(todo): Plan 2 slice P0 — web-core v0.2.1 tagged; Phase-0 prerequisites P-10/13/15/16/17 recorded" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git push origin main`. Expected: the grep prints nothing, then the push succeeds.

---

## Part 2 — Corporate A1–A5: host map, content roots, marketing tree, i18n, SEO files

> **Slice scope.** Spec §5.13 PRs **A1-A5** in `crhs-corporate` (`/mnt/c/Users/rickh/GitHub/crhs-corporate`). Everything here stays DARK. No nginx, Cloudflare, `.env` or pm2 change happens in this slice. The only production contact is read-only (Task 20 Step 3, Task 41 Step 0). The Phase 0a deploy, every `.env` write, every `pm2 reload` and the on-box per-host matrix (§9.2) belong to the GATE slice.
>
> **Document order is execution order.** Task 26 is placed directly after Task 21 on purpose (ruling R-3): it is the first task in which production code consumes `requestHost`, and it migrates all four client-steerable host readers in ONE commit, so no commit exists in which two host checks disagree.
>
> **Slice-entry precondition.** Task 20 Step 0 checks that web-core `v0.2.1` (A0, with B3k `data-i18n-aria-label`) is released and adopted by corporate. If it is not, Tasks 21-38 may proceed and Tasks 39-42 must not start.
>
> **Where Plan 1 and the spec disagree, Plan 1 wins.** Each case is stated here and repeated in the task it affects:
> - **P1-1:** G2 is already shipped (Plan 1 Task 10, corporate `735d672`). `/health` is at `server.js:82-85`, not `:80`, and the session is at `:100-106`, not `:65-69`. A2 **asserts** G2 and does not move `/health` again.
> - **P1-2:** web-core is `0.2.0` (26 keys) on disk today. Its stealth-404 body is at `crhs-web-core/src/middleware/ipGate.js:158`, not `:64`, because B3i-1 moved `isInRange` in above it.
> - **P1-3:** Plan 1 deferred B3k (the `data-i18n-aria-label` handler) to **v0.2.1** (deferred-work D-1). The web-core `0.2.0` `assets/js/i18n.js` contains 0 occurrences of `data-i18n-aria-label`, so Task 39 cannot pass until v0.2.1 is installed.
> - **P1-4:** Plan 1 already accepts `collectionName` (`sessionStore.js:107,123`) and pinned the cookie base to the Plan 1 value (`server.js:104`). A2 (Task 30, sole owner per R-1) sets the default to `crhsent.sid` and the collection to `sessions_corporate`, per the Plan 1 deviation "→ Plan 2 Phase 0a".
> - **P1-5:** Line numbers have drifted since the spec:
>   - `affiliate.html` changed in `6acbf550` on 2026-09-11. Its script tag is at `:334` (spec `:331`) and its mailto at `:329` (spec `:326`).
>   - The JSON-LD provider url in `partner-program.html` is at `:52` (spec `:48`).
>   - The nine AI-bot blocks in affiliate `server.js` are at `:914-922` (spec §5.6 `:848-856`).
> - **P1-6:** Spec §5.1 says web-core `i18n.js` is "byte-identical to the affiliate copy, md5 `7b24262d…`". That is no longer true: the affiliate copy is `bf590347…`. Corporate serves the web-core copy, so nothing changes.
> - **P1-7:** Plan 1 kept the iframe bridges in web-core `assets/js/` (carve-out → Plan 3). So step 18b does **not** mount `express.static(wc.assetsDir/js)` wholesale. It serves only `i18n.js` and `language-switcher.js`, so no bridge is exposed on a marketing host.
> - **P1-8:** the marketing brand guard (Task 36) scans every text file in the marketing root, which is wider than §11.3's "visible text". The one resulting byte change (`partner-program.css:3`) is re-stamped `?v=20260909a` under the immutable-asset rule.
> - **P1-9 (R-3, Global Constraint 20):** spec §5.10 puts the gate magic-link host in A9. R-3 moves it into A1 (Task 26) together with `accessGate` classification, `mediatorGate` and `crhsentHandler`, because Plan 2's Host-only `requestHost` would otherwise disagree with `req.hostname` (derived from `X-Forwarded-Host` under `trust proxy`).
> - **P1-10 (R-11):** `/.well-known/security.txt` joins accessGate `isExempt` (Task 41) so crhsent.com answers it with 200 while the gate is enforcing; the `affiliate.html` JSON-LD `sameAs` becomes `https://atxwashdryfold.com/` (Task 34), after the verbatim `cmp` in Task 32.
>
> **Not covered by this slice (owner named):**
> - A0 (web-core `v0.2.1`) and corporate's `packageTopology` floor + lockfile adoption of it: the P0 slice. This slice only checks them (Task 20 Step 0, Task 39 Step 1).
> - A6-A9: the A69 slice.
> - `tests/e2e/partner-i18n.spec.js` (§10.1 C13 browser step: click `.ap-lang[data-lang="es"]`): the GATE slice's S1 matrix, attested MANUAL when Playwright is unavailable. This slice covers C13's key-set and count half (Tasks 37-38).
> - §5.12 security.txt "`Policy:` byte-equal to the portal file's `Policy:` line" and "that URL returns 200": the Phase 0a on-box matrix after §6.9 lands (the portal file `public/.well-known/security.txt:8` reads `…/privacy-policy.html` today).
> - The on-box probe of the two R-3 spoof requests on both boxes: GATE Task 77.
>
> **Rules for any later deploy of this code** (Global Constraints 16-17):
> - (a) `rm -rf node_modules/@crhs/web-core` before `npm install --install-links`, then verify the installed version.
> - (b) Verify the installed version, `createCsrf` and the 26-key surface before any `pm2 reload`.
> - (c) Any boot probe on a running box ends with `process.exit(0)`.
> - (d) Log evidence is read from `$LOG_DIR/combined.log` (`/var/www/crhs-corporate/logs/combined.log`), filtered to timestamps after the reload — never `pm2 logs`, whose stdout is empty by design. Boot marker: `crhs-corporate listening on 3001`. Never count `Access gate cache loaded`.
>
> **Suite-result wording used below.** "Suite green" means the Jest summary line reads `Tests:       N passed, N total` with no `failed` segment: `npm test 2>&1 | grep -E '^Tests:' | grep -vc failed` prints `1`.

---

### Task 20: Capture the crhsent.com byte baseline (on-box read-only + local) before A1 — **HUMAN-CONFIRM**

**Files:**
- Create (outside every repo): `~/crhs-cutover-baselines/crhsent-baseline.js`
- Create: `~/crhs-cutover-baselines/a1/{local,oci1,oci2}/`, `~/crhs-cutover-baselines/a1/precondition.txt`

**Interfaces:**
- Consumes: the corporate app as `require('<repo>/server')`; prod `http://127.0.0.1:3001` on both boxes; the web-core repo (tag `v0.2.1`, cut by P0 Task 8 and carrying P0 Task 6's B3k `data-i18n-aria-label` handler) and corporate `package-lock.json` (`0.2.1`, recorded by P0 Task 9) for the precondition.
- Produces:
  - `~/crhs-cutover-baselines/a1/precondition.txt` — the Step 0 output; gates Tasks 39-42.
  - `~/crhs-cutover-baselines/a1/local/before.json` (15 routes), used by Tasks 25, 29, 35 and 42.
  - `~/crhs-cutover-baselines/a1/{oci1,oci2}/raw.txt`: 20 lines per box, alternating `"<http_code> <path>"` and a base64 body with the nonce normalized to `__NONCE__`. The GATE slice uses these for the A1 acceptance "byte-identical (modulo nonce) before and after the rename on both boxes": it re-runs the identical loop into `raw-after.txt` and runs `diff raw.txt raw-after.txt` (GATE Task 77 Step 3b; the one expected difference is the `/owners/` body, `alt="WaveMAX Laundry"` → `alt="WaveMAX Austin"`, from A69 Task 57).

- [ ] **Step 0: Check the A0 web-core prerequisite (local, read-only).** Spec §5.13 says A0 lands first; deferred-work D-1 puts B3k in `v0.2.1`; the P0 slice adopts it in corporate (topology floor + lockfile). `;` separators make every line print even when one check fails.

```bash
mkdir -p ~/crhs-cutover-baselines/a1 && { cd /mnt/c/Users/rickh/GitHub/crhs-web-core; echo "tag=$(git tag --list 'v0.2.1')"; echo "core=$(node -p "require('./package.json').version")"; echo "aria=$(grep -c 'data-i18n-aria-label' assets/js/i18n.js)"; cd /mnt/c/Users/rickh/GitHub/crhs-corporate; echo "lock=$(grep -A1 '"node_modules/@crhs/web-core"' package-lock.json | grep -o '"version": "[0-9.]*"')"; echo "floor=$(grep -c "'0.2.1'" tests/packageTopology.test.js)"; } | tee ~/crhs-cutover-baselines/a1/precondition.txt
```

Expected when the prerequisite has landed: `tag=v0.2.1`, `core=0.2.1`, `aria=` followed by a number ≥ `1`, `lock="version": "0.2.1"`, `floor=1`. On 2026-09-13 the working trees print `tag=`, `core=0.2.0`, `aria=0`, `lock="version": "0.2.0"`, `floor=0`. If any line differs from the expected-when-landed value, write `A0/B3k not released or not adopted by corporate` as the last line of `precondition.txt`, continue with Tasks 20-38, and do not start Task 39.

- [ ] **Step 1: Write the local baseline script.** It records status, content-type, cache-control and CSP, plus the body with the nonce normalized. Set-Cookie is deliberately excluded because Task 30 renames it on purpose. `/.well-known/security.txt` is also excluded because Task 41 adds it on purpose.

```js
// ~/crhs-cutover-baselines/crhsent-baseline.js — usage: node crhsent-baseline.js <corporateRepo> > out.json
process.env.NODE_ENV = 'test'; process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'baseline';
const repo = process.argv[2];
const request = require(`${repo}/node_modules/supertest`);
const app = require(`${repo}/server`);
const ROUTES = ['/', '/work', '/about/', '/capabilities', '/contact', '/owners/', '/wavemax/',
  '/wavemax/security-audit.html', '/wavemax/clickjacking-demo.html', '/robots.txt', '/sitemap.xml',
  '/assets/css/site.css', '/assets/js/site.js', '/404.html', '/nope-missing'];
(async () => {
  const out = {};
  for (const r of ROUTES) {
    const res = await request(app).get(r).set('Host', 'crhsent.com').buffer(true).parse((s, cb) => { let d = ''; s.setEncoding('utf8'); s.on('data', (c) => { d += c; }); s.on('end', () => cb(null, d)); });
    const csp = res.headers['content-security-policy'] || '';
    const nonce = (csp.match(/'nonce-([^']+)'/) || [])[1];
    const norm = (s) => (nonce ? String(s).split(nonce).join('__NONCE__') : String(s));
    out[r] = { status: res.status, type: res.headers['content-type'], cache: res.headers['cache-control'], csp: norm(csp), body: norm(res.body) };
  }
  process.stdout.write(JSON.stringify(out, null, 2)); process.exit(0);
})();
```

- [ ] **Step 2: Run it against corporate HEAD (`8133667`).**

```bash
mkdir -p ~/crhs-cutover-baselines/a1/local && cd /mnt/c/Users/rickh/GitHub/crhs-corporate && node ~/crhs-cutover-baselines/crhsent-baseline.js "$PWD" > ~/crhs-cutover-baselines/a1/local/before.json && node -e "console.log(Object.keys(require(process.env.HOME+'/crhs-cutover-baselines/a1/local/before.json')).length)"
```

Expected output: `15`.

- [ ] **Step 3 (HUMAN-CONFIRM, read-only ssh to production):** capture the on-box baseline on both boxes. The gate is enforcing on crhsent.com (Plan 1: `/services` 401), so some routes return 401 gate pages. That is expected and is part of the baseline. Quoting: `$N` and `$IP` sit OUTSIDE the single quotes and expand locally; `$p`, `$f`, `$code` and `$n` sit INSIDE the single quotes because they are defined by the loop that runs on the box.

```bash
for B in oci1:161.153.71.201 oci2:144.24.4.202; do N=${B%%:*}; IP=${B#*:}; mkdir -p ~/crhs-cutover-baselines/a1/$N
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'for p in / /work /about/ /capabilities /contact /owners/ /wavemax/ /robots.txt /sitemap.xml /assets/css/site.css; do f=$(echo "$p" | tr "/" "_"); code=$(curl -s -o /tmp/bl$f -w "%{http_code}" -H "Host: crhsent.com" "http://127.0.0.1:3001$p"); n=$(grep -o "nonce-[A-Za-z0-9+/=]*\|nonce=\"[^\"]*\"" /tmp/bl$f | head -1 | sed -E "s/^nonce-//;s/^nonce=\"//;s/\"$//"); [ -n "$n" ] && sed -i "s|$n|__NONCE__|g" /tmp/bl$f; echo "$code $p"; base64 -w0 /tmp/bl$f; echo; rm -f /tmp/bl$f; done' > ~/crhs-cutover-baselines/a1/$N/raw.txt; done
wc -l ~/crhs-cutover-baselines/a1/oci1/raw.txt ~/crhs-cutover-baselines/a1/oci2/raw.txt
```

Expected: `20` lines per box (10 status lines plus 10 base64 bodies).

**Rollback:** none needed; nothing on the boxes changes (the temp files are removed inside the loop). To discard the capture locally: `rm -rf ~/crhs-cutover-baselines/a1`.

- [ ] **Step 4: No commit — prove the capture touched no repo.** Command: `git -C /mnt/c/Users/rickh/GitHub/crhs-corporate status --porcelain | wc -l; ls ~/crhs-cutover-baselines/a1`. Expected: `0`, then the four entries `local`, `oci1`, `oci2` and `precondition.txt`. These files live outside every repo, so nothing is committed.

---

### Task 21: `server/config/hosts.js` — requestHost / hostKind / resolveHost / rejectUnknownHost (A1)

**Files:**
- Create: `server/config/hosts.js`
- Test: `tests/hosts.test.js`

**Interfaces:**
- Produces:
  - `CORPORATE_HOST: 'crhsent.com'`
  - `MARKETING_HOSTS: string[4]`
  - `MARKETING_CANONICAL_ORIGIN: 'https://atxwashdryfold.com'`
  - `PORTAL_ORIGIN: 'https://portal.atxwashdryfold.com'`
  - `CORPORATE_ROOT: string`, `MARKETING_ROOT: string`
  - `CONTENT_ROOTS: Readonly<Record<apexHost, absPath>>`
  - `NOT_FOUND_HTML: string`
  - `requestHost(req) → string` — reads `req.headers.host` ONLY (Global Constraint 20). It is the single host derivation for every host-scoped decision in corporate.
  - `hostKind(req) → 'corporate'|'marketing'|'unknown'`
  - `resolveHost(req,res,next)`, which sets `req.crhsHost = { name, kind, contentRoot|null }`
  - `rejectUnknownHost(req,res,next)`
- Consumes: nothing.
- Deliberate design (recorded so reviewers do not "fix" it): `req.crhsHost` is a per-request cache read by `rejectUnknownHost` and the Task 28 scoping wrappers. `contentHandler`, `webCoreAssets` and `seoRoutes` call `requestHost` / `hostKind` directly. Both paths derive from the same `requestHost` function, so they cannot disagree, and the direct calls let those handlers be unit-tested without mounting `resolveHost`.
- No production module consumes `requestHost` in this commit. The next task in document order (Task 26) migrates every existing host reader onto it in one commit.

- [ ] **Step 1: Write the failing test** `tests/hosts.test.js`:

```js
'use strict';
const path = require('path');
const { requestHost, hostKind, resolveHost, rejectUnknownHost, CONTENT_ROOTS, CORPORATE_ROOT, MARKETING_ROOT, NOT_FOUND_HTML } = require('../server/config/hosts');
const r = (headers) => ({ headers });
const MARKETING = ['atxwashdryfold.com', 'rundberglaundry.com', 'runberglaundry.com', 'atxwashateria.com'];

describe('requestHost — Host header only', () => {
  test('X-Forwarded-Host is ignored in both directions', () => {
    expect(requestHost(r({ host: 'atxwashdryfold.com', 'x-forwarded-host': 'crhsent.com' }))).toBe('atxwashdryfold.com');
    expect(requestHost(r({ host: 'crhsent.com', 'x-forwarded-host': 'atxwashdryfold.com' }))).toBe('crhsent.com');
  });
  test('req.hostname is ignored', () => {
    expect(requestHost({ headers: { host: 'atxwashdryfold.com' }, hostname: 'crhsent.com' })).toBe('atxwashdryfold.com');
  });
  test('strips :port and leading www., lowercases', () => {
    expect(requestHost(r({ host: 'WWW.RundbergLaundry.com:3001' }))).toBe('rundberglaundry.com');
  });
  test('missing Host → empty string', () => { expect(requestHost(r({}))).toBe(''); });
});

describe('hostKind', () => {
  test('crhsent.com and www.crhsent.com are corporate', () => {
    expect(hostKind(r({ host: 'crhsent.com' }))).toBe('corporate');
    expect(hostKind(r({ host: 'www.crhsent.com' }))).toBe('corporate');
  });
  test.each(MARKETING)('%s is marketing', (h) => { expect(hostKind(r({ host: h }))).toBe('marketing'); });
  test.each(['portal.atxwashdryfold.com', 'localhost', '127.0.0.1:3001', 'other.com', '__proto__', 'constructor', ''])('%s is unknown', (h) => {
    expect(hostKind(r({ host: h }))).toBe('unknown');
  });
});

describe('CONTENT_ROOTS', () => {
  test('crhsent → content/crhsent; the four marketing hosts share content/atxwashdryfold', () => {
    expect(CORPORATE_ROOT).toBe(path.join(__dirname, '..', 'content', 'crhsent'));
    expect(MARKETING_ROOT).toBe(path.join(__dirname, '..', 'content', 'atxwashdryfold'));
    expect(CONTENT_ROOTS['crhsent.com']).toBe(CORPORATE_ROOT);
    for (const h of MARKETING) expect(CONTENT_ROOTS[h]).toBe(MARKETING_ROOT);
    expect(Object.keys(CONTENT_ROOTS).sort()).toEqual(['crhsent.com', ...MARKETING].sort());
  });
});

describe('resolveHost', () => {
  test('annotates req.crhsHost and always calls next', () => {
    const req = r({ host: 'www.atxwashateria.com' }); const next = jest.fn();
    resolveHost(req, {}, next);
    expect(req.crhsHost).toEqual({ name: 'atxwashateria.com', kind: 'marketing', contentRoot: MARKETING_ROOT });
    expect(next).toHaveBeenCalledTimes(1);
    const u = r({ host: '__proto__' }); resolveHost(u, {}, jest.fn());
    expect(u.crhsHost).toEqual({ name: '__proto__', kind: 'unknown', contentRoot: null });
  });
});

describe('rejectUnknownHost', () => {
  const mkRes = () => { const res = {}; res.status = jest.fn(() => res); res.set = jest.fn(() => res); res.type = jest.fn(() => res); res.send = jest.fn(() => res); return res; };
  test('unknown host → stealth 404 html, no-store, next not called', () => {
    const res = mkRes(); const next = jest.fn();
    rejectUnknownHost(r({ host: 'portal.atxwashdryfold.com' }), res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-store, must-revalidate');
    expect(res.type).toHaveBeenCalledWith('html');
    expect(res.send).toHaveBeenCalledWith(NOT_FOUND_HTML);
    expect(NOT_FOUND_HTML).toBe('<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>404 Not Found</h1></body></html>');
    expect(next).not.toHaveBeenCalled();
  });
  test.each(['crhsent.com', ...MARKETING])('%s passes through', (h) => {
    const next = jest.fn(); rejectUnknownHost(r({ host: h }), mkRes(), next); expect(next).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it.** `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/hosts.test.js`. Expected failure: `Cannot find module '../server/config/hosts' from 'tests/hosts.test.js'`.

- [ ] **Step 3: Implement** `server/config/hosts.js`. The 404 body is the one at `ipGate.js:158` in v0.2.0 (P1-2).

```js
// Host resolution for the multi-host content app (spec §5.1). The Host header is the ONLY
// input. Forwarding headers are never consulted, and neither is Express's derived hostname
// (which follows the forwarding header under `trust proxy`), because host classification
// selects security middleware (session, accessGate, mediatorGate) and must not be
// client-settable (nginx sets `Host $host`). The map is apex-only: nginx owns www → apex
// 301s; the www strip here is defence in depth for direct-to-origin requests and tests.
'use strict';
const path = require('path');

const CORPORATE_HOST = 'crhsent.com';
const MARKETING_HOSTS = Object.freeze(['atxwashdryfold.com', 'rundberglaundry.com', 'runberglaundry.com', 'atxwashateria.com']);
const MARKETING_CANONICAL_ORIGIN = 'https://atxwashdryfold.com';
const PORTAL_ORIGIN = 'https://portal.atxwashdryfold.com';

const CONTENT_BASE = path.join(__dirname, '..', '..', 'content');
const CORPORATE_ROOT = path.join(CONTENT_BASE, 'crhsent');
const MARKETING_ROOT = path.join(CONTENT_BASE, 'atxwashdryfold');
const CONTENT_ROOTS = Object.freeze({
  [CORPORATE_HOST]: CORPORATE_ROOT,
  ...Object.fromEntries(MARKETING_HOSTS.map((h) => [h, MARKETING_ROOT]))
});

// Same minimal body as web-core's stealth 404 (crhs-web-core/src/middleware/ipGate.js:158, v0.2.0).
const NOT_FOUND_HTML = '<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>404 Not Found</h1></body></html>';

const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/** @returns {string} lowercase apex host from req.headers.host (port and leading www. stripped). */
function requestHost(req) {
  return String((req && req.headers && req.headers.host) || '').trim().toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '');
}

/** @returns {'corporate'|'marketing'|'unknown'} */
function hostKind(req) {
  const host = requestHost(req);
  if (host === CORPORATE_HOST) return 'corporate';
  if (MARKETING_HOSTS.includes(host)) return 'marketing';
  return 'unknown';
}

/** Sets req.crhsHost = { name, kind, contentRoot|null }; always calls next(). */
function resolveHost(req, res, next) {
  const name = requestHost(req);
  req.crhsHost = { name, kind: hostKind(req), contentRoot: own(CONTENT_ROOTS, name) ? CONTENT_ROOTS[name] : null };
  next();
}

/** Stealth 404 for any Host not in CONTENT_ROOTS (portal host, bare IP, localhost). Mount AFTER /health. */
function rejectUnknownHost(req, res, next) {
  const kind = req.crhsHost ? req.crhsHost.kind : hostKind(req);
  if (kind !== 'unknown') return next();
  res.status(404);
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.type('html').send(NOT_FOUND_HTML);
}

module.exports = {
  CORPORATE_HOST, MARKETING_HOSTS, MARKETING_CANONICAL_ORIGIN, PORTAL_ORIGIN,
  CORPORATE_ROOT, MARKETING_ROOT, CONTENT_ROOTS, NOT_FOUND_HTML,
  requestHost, hostKind, resolveHost, rejectUnknownHost
};
```

- [ ] **Step 4: Run it.** `npx jest tests/hosts.test.js`. Expected: `PASS tests/hosts.test.js`.

- [ ] **Step 5: Lint.** `npx eslint server/config/hosts.js tests/hosts.test.js`. Expected: no output.

- [ ] **Step 6: Commit.**

```bash
git add server/config/hosts.js tests/hosts.test.js && git commit -m "feat(hosts): host → content-root map + Host-only requestHost + unknown-host 404 (A1)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 26: ONE host derivation — accessGate (classification + magic link), mediatorGate and crhsentHandler move to `requestHost` in one commit (A1, R-3, BLOCKING)

> Runs immediately after Task 21 (see the slice note). Before this commit, `accessGate.js:90` reads `x-forwarded-host || host`, `accessGate.js:343` builds the emailed link from `x-forwarded-host || host`, and `mediatorGate.js:61` and `crhsentHandler.js:20` read `req.hostname`, which Express derives from `X-Forwarded-Host` under `app.set('trust proxy', 1)` (`server.js:42`). Today all agree, so a forged header only yields 404 (verified locally 2026-09-13: `GET /wavemax/` with `Host: crhsent.com` + `X-Forwarded-Host: rundberglaundry.com` → 404). Once `contentHandler` (Task 24) reads Host only, the same request would skip the mediator gate and serve the litigation record unless every reader moves together — which is this task.

**Files:**
- Modify: `server/middleware/accessGate.js` — add a require under `:44` (`const SystemConfig = require('@crhs/web-core').SystemConfig;`); delete `:89-91` (`function reqHost(req) { … }`); replace `:343-344` (the `host` / `link` lines); change `:370`.
- Modify: `server/middleware/mediatorGate.js` — add a require under `:25` (`const MediatorAccess = require('../models/MediatorAccess');`); replace `:60-63` (`isCrhsentWavemax`).
- Modify: `server/crhsentHandler.js` — add a require under `:8` (`const { cspHelper } = require('@crhs/web-core');`); replace `:20`.
- Test (create): `tests/hostDerivation.test.js`
- Test (modify): `tests/accessGate.test.js` (insert after the test that ends at `:155`, and after the test that ends at `:208`), `tests/mediatorGate.test.js` (`:58`, `:59-63`, `:109`), `tests/crhsentHandler.test.js` (append after the last line)

**Interfaces:**
- Consumes: `requestHost(req) → string` and `CORPORATE_HOST` from `server/config/hosts.js` (Task 21).
- Produces:
  - No `req.hostname` and no `x-forwarded-host` in corporate `server.js` or `server/**/*.js` (comments excluded), enforced by `tests/hostDerivation.test.js`, which every later task keeps green.
  - accessGate emails magic links on `https://crhsent.com` only.
  - `app.set('trust proxy', 1)` at `server.js:42` is kept (client-IP resolution depends on it).
- Required of later work (state these in the consuming tasks):
  - Every host-scoped handler created in this slice (`resolveHost`, `rejectUnknownHost`, `contentHandler`, `seoRoutes`, `webCoreAssets`, the Task 28 wrappers) uses `requestHost` / `hostKind`.
  - **A69 Task 57** (gate mail identity: `GATE_FROM`, subject, title, absolute logo) must NOT re-derive the link host: it consumes this task's `linkHost` (Step 5 — `requestHost` validated against `CORPORATE_HOST`) for both the emailed link and its absolute logo URL, and must not reintroduce `x-forwarded-host`; A69's `legacyPortalRedirects`, `storeIpPortalRedirect` and `hostAwareCsp` must use `requestHost`. The guard test fails on any regression.
  - GATE Task 77 probes the same two spoof requests on both boxes.
  - Plan 3 (record only): nginx `proxy_set_header X-Forwarded-Host $host;` as defence in depth.

- [ ] **Step 1: Write the guard and behavioural tests** `tests/hostDerivation.test.js`.

```js
'use strict';
// R-3 / Global Constraint 20: ONE host derivation. Every host-scoped decision reads
// req.headers.host through server/config/hosts.js requestHost(). Express derives its
// hostname from the forwarding header under app.set('trust proxy', 1), and Cloudflare
// passes a client-supplied forwarding header through, so both are client-steerable.
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../server');
const accessGate = require('../server/middleware/accessGate');
const mediatorGate = require('../server/middleware/mediatorGate');

const ROOT = path.join(__dirname, '..');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
// Blank out comments but keep line numbers; `//` after ':' or a quote is a URL, not a comment.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

describe('guard: no client-steerable host input in corporate server code', () => {
  test('server.js + server/**/*.js (comments excluded): 0 req.hostname, 0 x-forwarded-host', () => {
    const files = [path.join(ROOT, 'server.js'), ...walk(path.join(ROOT, 'server')).filter((f) => f.endsWith('.js'))];
    const hits = [];
    for (const f of files) {
      stripComments(fs.readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
        if (/req\.hostname/.test(line)) hits.push(`${path.relative(ROOT, f)}:${i + 1} req.hostname`);
        if (/x-forwarded-host/i.test(line)) hits.push(`${path.relative(ROOT, f)}:${i + 1} x-forwarded-host`);
      });
    }
    expect(hits).toEqual([]);
  });
});

describe('behaviour: a forwarding header cannot lift a gate off crhsent.com', () => {
  const SAVED = { en: process.env.MEDIATOR_GATE_ENABLED, pw: process.env.MEDIATOR_GATE_PASSWORDS };
  const spoof = (p) => request(app).get(p)
    .set('Host', 'crhsent.com')
    .set('X-Forwarded-Host', 'rundberglaundry.com')
    .set('CF-Connecting-IP', '198.51.100.23');
  beforeEach(() => {
    process.env.MEDIATOR_GATE_ENABLED = 'true';
    process.env.MEDIATOR_GATE_PASSWORDS = 'code-a';
    accessGate._cache.enabled = true;
    accessGate._cache.ips = new Map();
    // Under NODE_ENV=test the admin IP gate is transparent (isAllowed → true). Force the
    // production answer for a visitor who is not on the allowlist.
    jest.spyOn(mediatorGate.adminIpGate, 'isAllowed').mockReturnValue(false);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    accessGate._cache.enabled = false;
    accessGate._cache.ips = new Map();
    if (SAVED.en === undefined) delete process.env.MEDIATOR_GATE_ENABLED; else process.env.MEDIATOR_GATE_ENABLED = SAVED.en;
    if (SAVED.pw === undefined) delete process.env.MEDIATOR_GATE_PASSWORDS; else process.env.MEDIATOR_GATE_PASSWORDS = SAVED.pw;
  });

  test('GET /wavemax/ (Host crhsent.com, XFH rundberglaundry.com, non-whitelisted IP) → mediator prompt, never the record', async () => {
    const res = await spoof('/wavemax/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Documented record &mdash; access');
    expect(res.text).not.toContain('16 months');
  });

  test('GET /README.md with the same headers → 401 access-gate page', async () => {
    const res = await spoof('/README.md');
    expect(res.status).toBe(401);
    expect(res.text).toContain('This content is private.');
  });
});
```

- [ ] **Step 2: Add the accessGate cases** to `tests/accessGate.test.js`.
  - Directly after the test `it('does NOT gate any other host — wavemax.promo and the per-location domains pass through', …)` (ends at `:155`), insert:

```js
  it('X-Forwarded-Host cannot pull a non-crhsent Host into the gate', async () => {
    const req = mkReq({ ip: '8.8.8.8', path: '/services', originalUrl: '/services', headers: { host: 'atxwashdryfold.com', 'x-forwarded-host': 'crhsent.com' } });
    const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalledWith(401);
  });
  it('X-Forwarded-Host cannot lift the gate off crhsent.com', async () => {
    const req = mkReq({ ip: '8.8.8.8', path: '/services', originalUrl: '/services', headers: { host: 'crhsent.com', 'x-forwarded-host': 'atxwashdryfold.com' } });
    const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
```

  - Directly after the test `it('emails a single-use link on valid email+password and redirects to /__gate/sent (no immediate whitelist)', …)` (ends at `:208`, before the inserts above shifted it by 14 lines), insert:

```js
  it('builds the emailed link on https://crhsent.com — a client X-Forwarded-Host cannot poison it', async () => {
    const req = mkReq({
      method: 'POST', path: '/__gate', ip: '7.7.7.6',
      headers: { host: 'crhsent.com', 'x-forwarded-host': 'attacker.example' },
      body: { email: 'user@example.com', password: 'correct-horse', next: '/wavemax/' }
    });
    const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const html = sendEmail.mock.calls[0][2];
    expect(html).toContain('https://crhsent.com/__gate/confirm?token=');
    expect(html).not.toContain('attacker.example');
  });
```

- [ ] **Step 3: Change the mediatorGate and crhsentHandler tests.**
  - `tests/mediatorGate.test.js:58`: replace `const mk = (host, p) => ({ hostname: host, path: p });` with `const mk = (host, p) => ({ headers: { host }, path: p });`.
  - In that same test, after the line `expect(gate.isCrhsentWavemax(mk('wavemax.promo', '/wavemax/'))).toBe(false);` (`:62`), add:

```js
    expect(gate.isCrhsentWavemax({ headers: { host: 'atxwashdryfold.com', 'x-forwarded-host': 'crhsent.com' }, hostname: 'crhsent.com', path: '/wavemax/' })).toBe(false);
    expect(gate.isCrhsentWavemax({ headers: { host: 'crhsent.com', 'x-forwarded-host': 'atxwashdryfold.com' }, hostname: 'atxwashdryfold.com', path: '/wavemax/' })).toBe(true);
```

  - `tests/mediatorGate.test.js:109`: replace `const mkReq = () => ({ hostname: 'crhsent.com', path: '/wavemax/', method: 'GET', headers: {}, ip: '203.0.113.9', cookies: {} });` with `const mkReq = () => ({ path: '/wavemax/', method: 'GET', headers: { host: 'crhsent.com' }, ip: '203.0.113.9', cookies: {} });`.
  - Append to the end of `tests/crhsentHandler.test.js`:

```js
describe('crhsentHandler host input (R-3)', () => {
  test('under trust proxy, X-Forwarded-Host cannot select crhsent.com', async () => {
    const proxied = express();
    proxied.set('trust proxy', 1);
    proxied.use(wc.cspNonce);
    proxied.use(crhsentHandler(CONTENT));
    proxied.use((req, res) => res.status(404).send('fell-through'));
    const res = await request(proxied).get('/').set('Host', 'other.com').set('X-Forwarded-Host', 'crhsent.com');
    expect(res.text).toBe('fell-through');
  });
});
```

- [ ] **Step 4: Run them and confirm they fail for the right reason.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/hostDerivation.test.js tests/accessGate.test.js tests/mediatorGate.test.js tests/crhsentHandler.test.js 2>&1 | grep -E '^(PASS|FAIL)|✕'
```

Expected: all four files `FAIL`, with exactly these failing tests:
  - `hostDerivation`, the guard test: `Expected: []` and a received array holding exactly `server/crhsentHandler.js:20 req.hostname`, `server/middleware/accessGate.js:90 x-forwarded-host`, `server/middleware/accessGate.js:343 x-forwarded-host`, `server/middleware/mediatorGate.js:61 req.hostname`.
  - `hostDerivation`, `/wavemax/` spoof: `Expected: 200 Received: 404`.
  - `hostDerivation`, `/README.md` spoof: `Expected: 401 Received: 404`.
  - `accessGate`, `X-Forwarded-Host cannot pull a non-crhsent Host into the gate`: `Expected number of calls: 1 Received number of calls: 0`.
  - `accessGate`, `X-Forwarded-Host cannot lift the gate off crhsent.com`: `Expected number of calls: 0 Received number of calls: 1`.
  - `accessGate`, `builds the emailed link on https://crhsent.com …`: `Expected substring: "https://crhsent.com/__gate/confirm?token="`.
  - `mediatorGate`, `only fronts crhsent.com /wavemax paths`: `Expected: true Received: false` (the fixture no longer sets `hostname`).
  - `mediatorGate`, `prompts (no next) from a non-whitelisted IP with no unlock cookie`: `Expected number of calls: 0 Received number of calls: 1`.
  - `crhsentHandler`, `under trust proxy, X-Forwarded-Host cannot select crhsent.com`: `Expected: "fell-through"`.

- [ ] **Step 5: Implement all four migrations.**
  - `server/middleware/accessGate.js`:
    1. Under line 44 (`const SystemConfig = require('@crhs/web-core').SystemConfig;`) add `const { requestHost, CORPORATE_HOST } = require('../config/hosts');`.
    2. Delete lines 89-91 (`function reqHost(req) {`, its `return String(req.headers['x-forwarded-host'] || …` body, and `}`).
    3. Replace the two lines `const host = req.headers['x-forwarded-host'] || req.headers.host;` and `` const link = `https://${host}/__gate/confirm?token=${token}`; `` with:

```js
      // Link host: requestHost (Host header only) validated against the one gated host — never
      // a client-supplied forwarding header, which would poison the emailed link (R-3).
      const linkHost = requestHost(req) === CORPORATE_HOST ? requestHost(req) : CORPORATE_HOST;
      const link = `https://${linkHost}/__gate/confirm?token=${token}`;
```

    4. Replace `if (!GATED_HOSTS.includes(reqHost(req))) return next();` with `if (!GATED_HOSTS.includes(requestHost(req))) return next();` (`requestHost` strips `www.`, so `www.crhsent.com` still matches).
  - `server/middleware/mediatorGate.js`: under line 25 (`const MediatorAccess = require('../models/MediatorAccess');`) add `const { requestHost, CORPORATE_HOST } = require('../config/hosts');`, and replace lines 60-63 with:

```js
function isCrhsentWavemax(req) {
  return requestHost(req) === CORPORATE_HOST && (req.path === '/wavemax' || req.path.startsWith('/wavemax/'));
}
```

  - `server/crhsentHandler.js`: under line 8 (`const { cspHelper } = require('@crhs/web-core');`) add `const { requestHost } = require('./config/hosts');`, and replace the line `const host = (req.hostname || '').toLowerCase().replace(/^www\./, '');` with `const host = requestHost(req);`.

- [ ] **Step 6: Run the four files.** `npx jest tests/hostDerivation.test.js tests/accessGate.test.js tests/mediatorGate.test.js tests/crhsentHandler.test.js 2>&1 | grep -E '^(PASS|FAIL)'`. Expected: four `PASS` lines, no `FAIL`.

- [ ] **Step 7: Run the suite and lint.**

```bash
npm test 2>&1 | grep -E '^(FAIL|Tests:)' ; npm run lint
```

Expected: exactly one `FAIL tests/crhsent-parity.test.js` line (the 4 accepted Plan 1 ENOENT failures, deleted by Task 23), a `Tests:` line containing `4 failed`, and lint printing no problems.

- [ ] **Step 8: Commit.**

```bash
git add server/middleware/accessGate.js server/middleware/mediatorGate.js server/crhsentHandler.js tests/hostDerivation.test.js tests/accessGate.test.js tests/mediatorGate.test.js tests/crhsentHandler.test.js && git commit -m "fix(hosts): every host decision reads Host only — accessGate + magic link, mediatorGate, crhsentHandler (A1, R-3)

X-Forwarded-Host (and req.hostname, derived from it under trust proxy) could steer
host classification and poison the emailed gate link. One derivation, one commit.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 22: Rename `content/` → `content/crhsent/` (pure move) and re-point the manifest (A1)

**Files:**
- Move: all 49 tracked `content/**` files → `content/crhsent/**` (including `content/README.md`, which A9 later rewrites at `content/README.md`)
- Modify: `server.js:121`, `tests/crhsentHandler.test.js:11`
- Rewrite: `tests/content-manifest.test.js`

**Interfaces:**
- Consumes: `CORPORATE_ROOT` and `CONTENT_ROOTS` from `server/config/hosts.js` (Task 21).
- Produces: the on-disk root `content/crhsent/` (49 files).

- [ ] **Step 1: Replace `tests/content-manifest.test.js` with the per-root manifest.**

```js
// Content manifest — one pinned manifest per content root in server/config/hosts.js.
// crhsent: 48 verbatim crhsent files + 1 app logo asset (assets/images/brand/logo.png),
// moved byte-unchanged from content/ to content/crhsent/ by PR A1.
'use strict';
const fs = require('fs');
const path = require('path');
const { CONTENT_ROOTS, CORPORATE_ROOT } = require('../server/config/hosts');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full)); else if (e.name !== '.gitkeep') out.push(full);
  }
  return out;
}

const MANIFESTS = {
  [CORPORATE_ROOT]: {
    count: 49,
    keyFiles: ['index.html', 'wavemax/index.html', 'wavemax/security-audit.html', 'assets/css/site.css', 'assets/images/brand/logo.png', 'robots.txt', 'sitemap.xml']
  }
};

describe('content roots', () => {
  describe.each(Object.entries(MANIFESTS))('%s', (root, m) => {
    test.each(m.keyFiles)('key file exists: %s', (rel) => { expect(fs.existsSync(path.join(root, rel))).toBe(true); });
    test('holds exactly the pinned file count', () => { expect(walk(root)).toHaveLength(m.count); });
  });
  test('no existing root contains the DMCA-retired logo-wavemax.png', () => {
    for (const root of new Set(Object.values(CONTENT_ROOTS))) {
      if (!fs.existsSync(root)) continue;
      expect(walk(root).filter((f) => path.basename(f) === 'logo-wavemax.png')).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run it.** `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/content-manifest.test.js`. Expected failures: `key file exists: index.html` with `Expected: true Received: false`, and `ENOENT: no such file or directory, scandir '…/content/crhsent'`.

- [ ] **Step 3: Move the tree** with `git mv` only.

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && mkdir -p content/crhsent && for e in $(git ls-files content | cut -d/ -f2 | sort -u); do git mv "content/$e" "content/crhsent/$e"; done && git ls-files content/crhsent | wc -l && git ls-files content | grep -vc '^content/crhsent/'
```

Expected output: `49`, then `0`.

- [ ] **Step 4: Re-point the two root literals.**

```bash
sed -i "121s|app.use(crhsentHandler(path.join(__dirname, 'content')));|app.use(crhsentHandler(path.join(__dirname, 'content', 'crhsent')));|" server.js
sed -i "11s|const CONTENT = path.join(__dirname, '../content');|const CONTENT = path.join(__dirname, '../content/crhsent');|" tests/crhsentHandler.test.js
grep -n "content', 'crhsent'" server.js; grep -n "content/crhsent'" tests/crhsentHandler.test.js
```

Expected: `121:app.use(crhsentHandler(path.join(__dirname, 'content', 'crhsent')));` and `11:const CONTENT = path.join(__dirname, '../content/crhsent');`.

- [ ] **Step 5: Run the suite.** `npm test 2>&1 | grep -E '^(FAIL|Tests:)'`. Expected: exactly one `FAIL tests/crhsent-parity.test.js` line and a `Tests:` line containing `4 failed`. `crhsent-parity` reads the deleted monorepo path at `:29`, so the rename neither fixes nor worsens it.

- [ ] **Step 6: Commit and prove the rename is a pure move.**

```bash
git add -A content tests/content-manifest.test.js tests/crhsentHandler.test.js server.js && git commit -m "refactor(content): content/ → content/crhsent/ (pure rename) + per-root manifest (A1)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git show --stat -M HEAD | grep -c '=>' && git log --follow --oneline content/crhsent/index.html | head -3
```

Expected: `49` rename lines, and `--follow` lists pre-rename history (for example `bc86055`).

---

### Task 23: Delete `tests/crhsent-parity.test.js` — the 4 accepted Plan 1 failures (A1)

**Files:**
- Delete: `tests/crhsent-parity.test.js`

**Interfaces:**
- Consumes: none.
- Produces: a corporate suite with **zero** failures.

- [ ] **Step 1: Confirm the failures are the accepted ones.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/crhsent-parity.test.js 2>&1 | grep -E '^Tests:'
npx jest tests/crhsent-parity.test.js 2>&1 | grep -m1 "ENOENT: no such file or directory, open '/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/crhsent/"
```

Expected: a `Tests:` line containing `4 failed`, then one printed ENOENT line. These are the 4 failures the Plan 1 exit gate recorded ("99 passed, exactly the 4 accepted `crhsent-parity` ENOENT failures"). The monorepo `crhsent/` no longer exists (`:29`), so the test has no source to compare against. `tests/server.integration.test.js` and the Task 22 manifest keep the guarantee that served bytes come from the content root (spec §11.3).

- [ ] **Step 2: Delete it.** `git rm tests/crhsent-parity.test.js`

- [ ] **Step 3: Run the suite.** `npm test 2>&1 | grep -E '^Tests:' | grep -vc failed`. Expected: `1` (suite green).

- [ ] **Step 4: Commit.**

```bash
git commit -m "test: delete crhsent-parity (4 accepted ENOENT failures carried by Plan 1; monorepo crhsent/ is gone) (A1)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 24: `server/contentHandler.js` multi-root, with `crhsentHandler.js` as a shim (A1)

**Files:**
- Create: `server/contentHandler.js`
- Modify (to a shim): `server/crhsentHandler.js`
- Test: `tests/contentHandler.test.js`

**Interfaces:**
- Consumes: `CONTENT_ROOTS` and `requestHost` from `./config/hosts` (Task 21); `cspHelper.readHTMLWithNonce` from `@crhs/web-core`.
- Produces: `contentHandler(roots = CONTENT_ROOTS) → RequestHandler`. It calls `next()` for an unmapped host or a missing file.
- Host input: `requestHost(req)` only (R-3; the Task 26 guard test keeps it that way). The root is looked up as `roots[requestHost(req)]`, not read from `req.crhsHost.contentRoot`: `resolveHost` uses the same map and function, and the direct lookup lets the move-then-delete shim pass a one-host map.

- [ ] **Step 1: Write the failing test** `tests/contentHandler.test.js`. The helper app sets `trust proxy` exactly as `server.js:42` does, so the forwarding-header case exercises the production configuration and survives Task 27's deletion of `tests/crhsentHandler.test.js`.

```js
'use strict';
const express = require('express');
const request = require('supertest');
const wc = require('@crhs/web-core');
const contentHandler = require('../server/contentHandler');
const crhsentShim = require('../server/crhsentHandler');
const { CORPORATE_ROOT } = require('../server/config/hosts');

const appWith = (h) => { const a = express(); a.set('trust proxy', 1); a.use(wc.cspNonce); a.use(h); a.use((req, res) => res.status(404).send('fell-through')); return a; };

describe('contentHandler (multi-root)', () => {
  const app = appWith(contentHandler());
  test('crhsent.com / served from content/crhsent with nonce + no-cache', async () => {
    const res = await request(app).get('/').set('Host', 'crhsent.com');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
    expect(res.text).toMatch(/<meta name="csp-nonce" content="[^"]{10,}">/);
    expect(res.text).toContain('WE BUILD THE');
  });
  test('www.crhsent.com resolves to the same root', async () => {
    expect((await request(app).get('/work').set('Host', 'www.crhsent.com')).status).toBe(200);
  });
  test('X-Forwarded-Host cannot select a root, even under trust proxy', async () => {
    const res = await request(app).get('/').set('Host', 'other.com').set('X-Forwarded-Host', 'crhsent.com');
    expect(res.text).toBe('fell-through');
  });
  test('encoded traversal → 403', async () => {
    expect((await request(app).get('/%2e%2e%2f%2e%2e%2fserver.js').set('Host', 'crhsent.com')).status).toBe(403);
  });
  test.each(['other.com', '__proto__'])('unmapped Host %s falls through', async (h) => {
    expect((await request(app).get('/').set('Host', h)).text).toBe('fell-through');
  });
  test('a custom roots map is honoured', async () => {
    const res = await request(appWith(contentHandler({ 'example.test': CORPORATE_ROOT }))).get('/work').set('Host', 'example.test');
    expect(res.status).toBe(200);
  });
});

describe('crhsentHandler shim (deleted in A2)', () => {
  test('serves crhsent.com from the given root and passes other hosts through', async () => {
    const app = appWith(crhsentShim(CORPORATE_ROOT));
    expect((await request(app).get('/').set('Host', 'crhsent.com')).status).toBe(200);
    expect((await request(app).get('/').set('Host', 'atxwashdryfold.com')).text).toBe('fell-through');
  });
});
```

- [ ] **Step 2: Run it.** `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/contentHandler.test.js`. Expected failure: `Cannot find module '../server/contentHandler' from 'tests/contentHandler.test.js'`.

- [ ] **Step 3: Implement** `server/contentHandler.js`. The traversal guard, extension-less → `index.html`, HTML nonce injection with no-cache, and `sendFile` are carried verbatim from the request body of `server/crhsentHandler.js`.

```js
// Multi-host content handler (spec §5.1): serves the content root mapped to the request's
// Host. Traversal guard, clean URLs, nonce-injected HTML and sendFile are carried verbatim
// from server/crhsentHandler.js; only the root selection changed. Host input is
// requestHost() only (R-3).
'use strict';
const path = require('path');
const { cspHelper } = require('@crhs/web-core');
const { CONTENT_ROOTS, requestHost } = require('./config/hosts');

/**
 * @param {Object<string,string>} [roots=CONTENT_ROOTS] apex host → absolute content root.
 * @returns {import('express').RequestHandler} serves the mapped root; next() for an unmapped host or missing file.
 */
module.exports = function contentHandler(roots = CONTENT_ROOTS) {
  return async (req, res, next) => {
    const host = requestHost(req);
    if (!Object.prototype.hasOwnProperty.call(roots, host)) return next();
    const contentRoot = roots[host];
    try {
      const rel = decodeURIComponent(req.path);
      let full = path.normalize(path.join(contentRoot, rel));
      if (full !== contentRoot && !full.startsWith(contentRoot + path.sep)) {
        return res.status(403).end();
      }
      if (!path.extname(full)) {
        full = path.join(full, 'index.html');
      }
      if (full.endsWith('.html')) {
        const html = await cspHelper.readHTMLWithNonce(full, res.locals.cspNonce);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.type('html').send(html);
      }
      return res.sendFile(full, (err) => { if (err) next(); });
    } catch (e) {
      return next();
    }
  };
};
```

Replace the whole of `server/crhsentHandler.js` with:

```js
// SHIM (move-then-delete): superseded by server/contentHandler.js; deleted in PR A2.
'use strict';
const contentHandler = require('./contentHandler');
module.exports = (root) => contentHandler({ 'crhsent.com': root });
```

- [ ] **Step 4: Run the tests.** `npx jest tests/contentHandler.test.js tests/crhsentHandler.test.js tests/hostDerivation.test.js 2>&1 | grep -E '^(PASS|FAIL)'`. Expected: three `PASS` lines.

- [ ] **Step 5: Commit.**

```bash
git add server/contentHandler.js server/crhsentHandler.js tests/contentHandler.test.js && git commit -m "feat(content): multi-root contentHandler; crhsentHandler becomes a one-PR shim (A1)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 25: Wire `resolveHost`, the unknown-host 404 and `contentHandler()` into `server.js` (A1)

**Files:**
- Modify: `server.js` (`:17`, `:35`, after `:50`, after `:85`, `:121`)
- Test: `tests/server.integration.test.js` (the `describe('host guard')` block at `:118-123`)

**Interfaces:**
- Consumes: `resolveHost` and `rejectUnknownHost` (Task 21), `contentHandler` (Task 24).
- Produces: the composed app, where any unmapped Host gets the stealth 404 after `/health`.

- [ ] **Step 1: Replace the `describe('host guard', …)` block in `tests/server.integration.test.js`** with:

```js
  describe('host guard', () => {
    it('Host: other.com GET / → 404', async () => {
      const res = await request(app).get('/').set('Host', 'other.com');
      expect(res.status).toBe(404);
    });
    it('an unmapped Host gets the stealth 404 body, no-store, no cookie', async () => {
      const res = await request(app).get('/').set('Host', 'other.com');
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
      expect(res.text).toBe('<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>404 Not Found</h1></body></html>');
      expect(res.headers['set-cookie']).toBeUndefined();
    });
    it('portal.atxwashdryfold.com is not a content host, but /health still answers for it', async () => {
      expect((await request(app).get('/').set('Host', 'portal.atxwashdryfold.com')).status).toBe(404);
      expect((await request(app).get('/health').set('Host', 'portal.atxwashdryfold.com')).status).toBe(200);
    });
  });
```

- [ ] **Step 2: Run it.** `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/server.integration.test.js -t 'host guard'`. Expected failure, in `an unmapped Host gets the stealth 404 body…`: `Expected: "no-cache, no-store, must-revalidate"` against the Express default 404 (whose body is `<pre>Cannot GET /</pre>`).

- [ ] **Step 3: Edit `server.js` (all three changes in this step).**
  1. Delete line 17 `const path = require('path');` (its only use is line 121, removed below) and replace line 35 `const crhsentHandler = require('./server/crhsentHandler');` with:
     ```js
     const { resolveHost, rejectUnknownHost } = require('./server/config/hosts');
     const contentHandler = require('./server/contentHandler');
     ```
  2. Directly after `app.use(wc.securityHeadersMiddleware());`, insert:
     ```js
     // Classify the Host once (req.headers.host only — never a forwarding header). spec §5.1, R-3.
     app.use(resolveHost);
     ```
  3. Directly after the closing `});` of `app.get('/health', …)`, insert the block below, and replace `app.use(crhsentHandler(path.join(__dirname, 'content', 'crhsent')));` with `app.use(contentHandler());`.
     ```js
     // Unknown Host (portal.atxwashdryfold.com, bare IP, localhost) → stealth 404. Mounted
     // AFTER /health so on-box probes and the affiliate's /health/origin aggregate still get 200.
     app.use(rejectUnknownHost);
     ```

- [ ] **Step 4: Run the suite and lint.** `npm test 2>&1 | grep -E '^Tests:' | grep -vc failed; npm run lint`. Expected: `1` (suite green), lint prints no problems.

- [ ] **Step 5: Prove crhsent.com is byte-unchanged locally.**

```bash
node ~/crhs-cutover-baselines/crhsent-baseline.js "$PWD" > ~/crhs-cutover-baselines/a1/local/after-A1.json && diff ~/crhs-cutover-baselines/a1/local/before.json ~/crhs-cutover-baselines/a1/local/after-A1.json && echo IDENTICAL
```

Expected: `IDENTICAL`.

- [ ] **Step 6: Commit.**

```bash
git add server.js tests/server.integration.test.js && git commit -m "feat(server): resolveHost + unknown-host 404 after /health + contentHandler() (A1)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 27: Delete the `crhsentHandler` shim and its test (A2)

**Files:**
- Delete: `server/crhsentHandler.js`, `tests/crhsentHandler.test.js`
- Modify: `tests/contentHandler.test.js` (remove the shim `describe` and the `crhsentShim` require)
- Modify: `server.js:4`, `server.js:45` (comments), `tests/server.integration.test.js:3` (comment)

**Interfaces:**
- Consumes: none.
- Produces: `contentHandler` is the only content handler. The R-3 forwarding-header case that lived in `tests/crhsentHandler.test.js` is kept by `tests/contentHandler.test.js` (`X-Forwarded-Host cannot select a root, even under trust proxy`) and `tests/hostDerivation.test.js`.

- [ ] **Step 1: Delete the files.** `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && git rm server/crhsentHandler.js tests/crhsentHandler.test.js`

- [ ] **Step 2: Clean up `tests/contentHandler.test.js`.** Delete the line `const crhsentShim = require('../server/crhsentHandler');` and the whole `describe('crhsentHandler shim (deleted in A2)', …)` block.

- [ ] **Step 3: Rename the three stale comment references.**

```bash
sed -i '4s|and the crhsentHandler that|and the contentHandler that|' server.js
sed -i '45s|by crhsentHandler via cspHelper|by contentHandler via cspHelper|' server.js
sed -i '3s|gates + crhsentHandler compose|gates + contentHandler compose|' tests/server.integration.test.js
grep -rn "crhsentHandler" server server.js tests
```

Expected grep output: exactly one line, the provenance comment `server/contentHandler.js:3:// from server/crhsentHandler.js; only the root selection changed. Host input is`.

- [ ] **Step 4: Verify.** `npm test 2>&1 | grep -E '^Tests:' | grep -vc failed; npm run lint`. Expected: `1`, lint clean.

- [ ] **Step 5: Commit.**

```bash
git add -A server server.js tests && git commit -m "refactor: delete crhsentHandler shim + its test (A2, move-then-delete)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 27b (controller-inserted 2026-09-13, owner-directed): fold the production mediator-gate path hotfix into `main` (A1/A2, S-3)

> Runs immediately after Task 27. A pre-existing bypass (mediatorGate matched the raw `req.path`; the handler serves the decoded + normalised path) was hotfixed in production as `01a354b` on branch `hotfix/mediator-path-bypass` (base `5766f41`) and deployed to both boxes on 2026-09-13 with Rick's confirmation per reload. `main` has diverged (Tasks 24–27), so the same protection is re-applied here rather than cherry-picked: `server/utils/canonicalPath.js` (same path as production), `mediatorGate` canonical match composed with `requestHost`, the non-canonical refusal in `contentHandler` AFTER the unchanged 403 traversal guard, the `safeNext` fix, and the bypass integration test (plus exempt-prefix traversal cases and a positive unlock-cookie control). Full brief: the SDD workspace `task-27b-brief.md`. **This task must land before GATE Task 72 records `CORP_SHA`**, or the Phase-0a rsync would remove the live protection.

---

### Task 28: `corporateOnly` / `marketingOnly` wrappers (A2)

**Files:**
- Modify: `server/config/hosts.js`
- Test: `tests/hosts.test.js`

**Interfaces:**
- Consumes: `hostKind` (Task 21), which reads `requestHost` only.
- Produces: `corporateOnly(mw) → (req,res,next)` and `marketingOnly(mw) → (req,res,next)`. Both keep 3-arity and read `req.crhsHost.kind`, falling back to `hostKind(req)`.

- [ ] **Step 1: Append the failing test** to `tests/hosts.test.js`.

```js
describe('corporateOnly / marketingOnly', () => {
  const { corporateOnly, marketingOnly } = require('../server/config/hosts');
  const run = (wrap, host) => { const mw = jest.fn((q, s, n) => n()); const next = jest.fn(); const req = { headers: { host } }; resolveHost(req, {}, () => {}); wrap(mw)(req, {}, next); return { mw, next }; };
  test('3-arity (never mistaken for error middleware)', () => {
    expect(corporateOnly(() => {}).length).toBe(3); expect(marketingOnly(() => {}).length).toBe(3);
  });
  test('corporateOnly runs mw only for crhsent.com', () => {
    expect(run(corporateOnly, 'crhsent.com').mw).toHaveBeenCalledTimes(1);
    for (const h of ['atxwashdryfold.com', 'portal.atxwashdryfold.com']) { const { mw, next } = run(corporateOnly, h); expect(mw).not.toHaveBeenCalled(); expect(next).toHaveBeenCalledTimes(1); }
  });
  test('marketingOnly runs mw only for the four marketing hosts', () => {
    for (const h of MARKETING) expect(run(marketingOnly, h).mw).toHaveBeenCalledTimes(1);
    for (const h of ['crhsent.com', 'other.com']) expect(run(marketingOnly, h).mw).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it.** `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/hosts.test.js`. Expected failure: `TypeError: corporateOnly is not a function`.

- [ ] **Step 3: Implement.** Add above `module.exports` in `server/config/hosts.js`:

```js
/** Wraps mw so it runs only when the request's host kind matches; otherwise next(). */
function scopedTo(kind) {
  return (mw) => function hostScoped(req, res, next) {
    const k = req.crhsHost ? req.crhsHost.kind : hostKind(req);
    return k === kind ? mw(req, res, next) : next();
  };
}
const corporateOnly = scopedTo('corporate');
const marketingOnly = scopedTo('marketing');
```

Then add `corporateOnly, marketingOnly` to the `module.exports` object.

- [ ] **Step 4: Run it.** `npx jest tests/hosts.test.js`. Expected: `PASS tests/hosts.test.js`.

- [ ] **Step 5: Commit.**

```bash
git add server/config/hosts.js tests/hosts.test.js && git commit -m "feat(hosts): corporateOnly/marketingOnly scoping wrappers (A2)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 29: Host-scope CORS, session, apiLimiter, accessGate and mediatorGate (A2)

**Files:**
- Modify: `server.js` (from the comment `// CORS, cookies, body parsing, session` through `app.use(contentHandler());`, and the hosts require)
- Test (create): `tests/hostScoping.test.js`

**Interfaces:**
- Consumes: `corporateOnly` (Task 28).
- Produces: marketing responses with no `Set-Cookie`, no CORS, no gate, and no apiLimiter. crhsent.com keeps all of them.
- Evidence that accessGate is not invoked on a marketing host: `/__gate` returns 404 there. accessGate handles `/__gate` BEFORE its host check (`accessGate.js` `handleGate` branch above the `GATED_HOSTS` line), so a 404 can only mean the wrapper skipped accessGate entirely. No spy is needed.

- [ ] **Step 1: Write the failing test** `tests/hostScoping.test.js`.

```js
'use strict';
const request = require('supertest');
const app = require('../server');
const accessGate = require('../server/middleware/accessGate');
const MARKETING = ['atxwashdryfold.com', 'rundberglaundry.com', 'runberglaundry.com', 'atxwashateria.com'];

describe('host scoping of corporate-only middleware', () => {
  test.each(MARKETING)('%s: no session cookie', async (h) => {
    expect((await request(app).get('/').set('Host', h)).headers['set-cookie']).toBeUndefined();
  });
  test('crhsent.com still gets a session cookie', async () => {
    expect(((await request(app).get('/').set('Host', 'crhsent.com')).headers['set-cookie'] || []).join(';')).toMatch(/\.sid=/);
  });
  describe('CORS', () => {
    const SAVED = process.env.CORS_ORIGIN;
    afterEach(() => { if (SAVED === undefined) delete process.env.CORS_ORIGIN; else process.env.CORS_ORIGIN = SAVED; });
    test('marketing host emits no ACAO even when CORS_ORIGIN names the Origin', async () => {
      process.env.CORS_ORIGIN = 'https://example.test';
      const res = await request(app).get('/').set('Host', 'atxwashdryfold.com').set('Origin', 'https://example.test');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
  describe('accessGate (enabled)', () => {
    beforeEach(() => { accessGate._cache.enabled = true; accessGate._cache.ips = new Map(); });
    afterEach(() => { accessGate._cache.enabled = false; accessGate._cache.ips = new Map(); });
    test('/__gate on a marketing host → 404 (gate never invoked); on crhsent.com → gate form', async () => {
      expect((await request(app).get('/__gate').set('Host', 'atxwashdryfold.com')).status).toBe(404);
      const c = await request(app).get('/__gate').set('Host', 'crhsent.com');
      expect(c.status).toBe(200); expect(c.text).toContain('This content is private.');
    });
    test('/wavemax on a marketing host → 404', async () => {
      expect((await request(app).get('/wavemax/').set('Host', 'rundberglaundry.com')).status).toBe(404);
    });
    test('spoof: Host marketing + XFH crhsent.com → not gated, no cookie', async () => {
      const res = await request(app).get('/services').set('Host', 'atxwashdryfold.com').set('X-Forwarded-Host', 'crhsent.com');
      expect(res.status).toBe(404); expect(res.text).not.toContain('This content is private.'); expect(res.headers['set-cookie']).toBeUndefined();
    });
    test('spoof: Host crhsent.com + XFH marketing → gate still enforced', async () => {
      const res = await request(app).get('/services').set('Host', 'crhsent.com').set('X-Forwarded-Host', 'atxwashdryfold.com');
      expect(res.status).toBe(401); expect(res.text).toContain('This content is private.');
    });
  });
});
```

- [ ] **Step 2: Run it.** `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/hostScoping.test.js`. Expected failures (the two spoof tests and the `/wavemax` test already pass, because Task 26 unified host derivation):
  - each `<host>: no session cookie`: `Expected: undefined Received: ["wavemax.sid=…"]`
  - `marketing host emits no ACAO…`: `Expected: undefined Received: "https://example.test"`
  - `/__gate on a marketing host…`: `Expected: 404 Received: 200`

- [ ] **Step 3: Replace the `server.js` middleware section.** Replace everything from `// CORS, cookies, body parsing, session` through `app.use(contentHandler());` with the block below. Also change the hosts require to `const { resolveHost, rejectUnknownHost, corporateOnly } = require('./server/config/hosts');`. The cookie default is left at the Plan 1 value here; Task 30 (sole owner, R-1) changes it.

```js
// Body/cookie parsing for every host (marketing intake POSTs need the body) — spec §5.2 step 9.
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// CORS is crhsent-only (§5.2 step 10): marketing hosts emit no CORS headers.
app.use(corporateOnly(cors(wc.corsConfig)));
// Session is crhsent-only (§5.2 step 11): marketing responses carry NO Set-Cookie and mint no
// session document. `store` is deliberately not destructured (unused; eslint no-unused-vars).
const { middleware: sessionMiddleware } = wc.buildSessionMiddleware({
  mongoUrl: process.env.MONGODB_URI,
  secret: process.env.SESSION_SECRET,
  ttlSeconds: 600,
  cookieName: process.env.SESSION_COOKIE_NAME || 'wavemax.sid'
});
app.use(corporateOnly(sessionMiddleware));
app.use(wc.sanitization.mongoSanitize());
app.use(wc.sanitization.sanitizeRequest);
// apiLimiter is crhsent-only (§5.2 step 13); marketing intake routes bring their own limiters (A7).
app.use('/api/', corporateOnly(wc.rateLimiting.apiLimiter));
// Gates are crhsent-only (§5.2 steps 15-16): a marketing host never renders /__gate.
app.use(corporateOnly(accessGate));
app.use(corporateOnly(mediatorGate));
app.use(contentHandler());
```

- [ ] **Step 4: Run the suite, lint, and re-check the crhsent baseline.**

```bash
npm test 2>&1 | grep -E '^Tests:' | grep -vc failed; npm run lint && node ~/crhs-cutover-baselines/crhsent-baseline.js "$PWD" > ~/crhs-cutover-baselines/a1/local/after-A2a.json && diff ~/crhs-cutover-baselines/a1/local/before.json ~/crhs-cutover-baselines/a1/local/after-A2a.json && echo IDENTICAL
```

Expected: `1`, lint clean, `IDENTICAL`.

- [ ] **Step 5: Commit.**

```bash
git add server.js tests/hostScoping.test.js && git commit -m "feat(server): scope cors/session/apiLimiter/accessGate/mediatorGate to crhsent.com (A2)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 30: Corporate session cookie `crhsent.sid` + collection `sessions_corporate` (A2; Plan 1 deviation → Plan 2 0a; SOLE owner per R-1)

**Files:**
- Modify: `server.js` (the session block written by Task 29: from `// Session is crhsent-only` through the closing `});` of `wc.buildSessionMiddleware`)
- Test: `tests/server.integration.test.js` (the comment above `describe('session middleware …')`, currently `:125-128`, and the test `it('still emits the live cookie base "wavemax.sid" (no session drop in Plan 1)', …)`, currently `:141-146`)

**Interfaces:**
- Consumes: `wc.buildSessionMiddleware({ mongoUrl, secret, ttlSeconds, cookieName, collectionName })` from web-core (`sessionStore.js:107,123` accept `collectionName`, default `'sessions'`).
- Produces:
  - Code default cookie base `crhsent.sid` (`__Host-crhsent.sid` in production, per `sessionStore.js:36-37`).
  - Collection `sessions_corporate` — the literal `collectionName: 'sessions_corporate'` that §9.1 P-10 (P0 slice, pre-create on ADB) greps before the Phase 0a reload.
  - `server.js` contains no `wavemax.sid` literal anywhere (code or comment); the test enforces it.
- For the GATE slice (the Phase 0a `.env` write):
  - `SESSION_COOKIE_NAME=crhsent.sid` in the corporate `.env` is now redundant and harmless (it equals the code default). Any OTHER value in that key overrides the default — the env audit must confirm the key is either absent or exactly `crhsent.sid`.
  - The rename logs nobody out (R-10): corporate code has **0** `req.session` references (verified 2026-09-13, `grep -rn "req.session" server server.js` → 0). accessGate unlocks by IP (`AccessWhitelist`); mediatorGate unlocks via its own `wm_med_unlock` cookie. No user notice is needed.
  - Old corporate documents in the shared `sessions` collection expire under the existing TTL sweep; never `drop()` `sessions` (the portal lives there). The `sessions_corporate` document count is informational only (R-9); the deterministic isolation gate is zero `Set-Cookie` on every marketing-host response (Task 29).

- [ ] **Step 1: Replace the comment and the test.** In `tests/server.integration.test.js`, replace the four comment lines above `describe('session middleware (web-core v0.2.0 { middleware, store })', …)` (they start `// web-core v0.2.0: buildSessionMiddleware returns`) with:

```js
  // Plan 2 (D14b / Q-18): corporate owns the cookie base 'crhsent.sid' and the corporate-only
  // 'sessions_corporate' collection. The collection is not observable under NODE_ENV=test
  // (MemoryStore), so the literal is pinned at source level — the same literal §9.1 P-10 greps
  // on the box before the Phase 0a reload.
```

Then replace the whole test `it('still emits the live cookie base "wavemax.sid" (no session drop in Plan 1)', …)` with:

```js
    it('emits the corporate cookie base "crhsent.sid" when SESSION_COOKIE_NAME is unset', async () => {
      expect(process.env.SESSION_COOKIE_NAME).toBeUndefined();
      const res = await request(app).get('/').set('Host', HOST);
      const setCookie = (res.headers['set-cookie'] || []).join(';');
      expect(setCookie).toContain('crhsent.sid=');
      expect(setCookie).not.toMatch(/wavemax\.sid|app\.sid/);
    });

    it('server.js pins the crhsent.sid default and the sessions_corporate collection, and names no old base', () => {
      const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
      expect(src).toMatch(/cookieName:\s*process\.env\.SESSION_COOKIE_NAME \|\| 'crhsent\.sid'/);
      expect(src).toMatch(/collectionName:\s*'sessions_corporate'/);
      expect(src).not.toMatch(/wavemax\.sid/);
    });
```

- [ ] **Step 2: Run it.** `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/server.integration.test.js -t 'session middleware'`. Expected failures:
  - `emits the corporate cookie base…`: `Expected substring: "crhsent.sid="` with a received string beginning `wavemax.sid=`.
  - `server.js pins the crhsent.sid default…`: `Expected pattern: /cookieName:\s*process\.env\.SESSION_COOKIE_NAME \|\| 'crhsent\.sid'/`.

- [ ] **Step 3: Implement.** In `server.js`, replace the block from `// Session is crhsent-only (§5.2 step 11)` through the closing `});` of `wc.buildSessionMiddleware({ … })` with the block below. The comment deliberately never spells the Plan 1 cookie base, so the source test in Step 1 and the comment agree.

```js
// Session is crhsent-only (§5.2 step 11): marketing responses carry NO Set-Cookie and mint no
// session document. `store` is deliberately not destructured (unused; eslint no-unused-vars).
// D14b / Q-18: corporate owns its cookie base and its own collection, so it never shares the
// portal's cookie or `sessions` collection. The one rename to this base happens at the Plan 2
// Phase 0a deploy; corporate code reads no req.session (accessGate unlocks by IP, mediatorGate
// by its own wm_med_unlock cookie), so nobody is logged out. Do not rename either value again.
// `sessions_corporate` is pre-created on ADB before the Phase 0a reload (§9.1 P-10).
const { middleware: sessionMiddleware } = wc.buildSessionMiddleware({
  mongoUrl: process.env.MONGODB_URI,
  secret: process.env.SESSION_SECRET,
  ttlSeconds: 600,
  cookieName: process.env.SESSION_COOKIE_NAME || 'crhsent.sid',
  collectionName: 'sessions_corporate'
});
```

- [ ] **Step 4: Run the suite and lint.** `npm test 2>&1 | grep -E '^Tests:' | grep -vc failed; npm run lint; grep -c 'wavemax.sid' server.js`. Expected: `1`, lint clean, `0`.

- [ ] **Step 5: Commit.**

```bash
git add server.js tests/server.integration.test.js && git commit -m "feat(session): crhsent.sid cookie base + sessions_corporate collection (A2, D14b, Q-18)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 31: Assert gate G2 across every host — `tests/health.test.js` (A2; G2 already shipped, not re-done)

**Files:**
- Test (create): `tests/health.test.js`

**Interfaces:**
- Consumes: `GET /health`, shipped by Plan 1 Task 10 (`735d672`).
- Produces: a regression tripwire for the ordering `/health` < CORS < `rejectUnknownHost` < `buildSessionMiddleware` (§5.2 step 6), on every content host, the portal host, an on-box `Host`, and an empty `Host`.

- [ ] **Step 1: Write the characterization test.** It is expected to **PASS on first run**, because G2 is already deployed (P1-1). Its static-order assertion is what fails if a later edit moves `/health` below CORS, the unknown-host 404 or the session. The affiliate `/health/origin` aggregate (affiliate `cb8c955b`) depends on `:3001/health` answering 200. The `''` case sends an empty `Host` header (verified locally 2026-09-13: `/health` → 200 while `/` → 404 for an empty Host).

```js
'use strict';
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../server');
const HOSTS = ['crhsent.com', 'atxwashdryfold.com', 'rundberglaundry.com', 'runberglaundry.com', 'atxwashateria.com', 'portal.atxwashdryfold.com', '127.0.0.1:3001', ''];

describe('GET /health — gate G2 (shipped by Plan 1 Task 10; asserted here)', () => {
  test.each(HOSTS)('Host "%s" → 200 {status:"ok"}, no-store, no Set-Cookie', async (h) => {
    const res = await request(app).get('/health').set('Host', h);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['set-cookie']).toBeUndefined();
  });
  test('server.js registers /health before CORS, rejectUnknownHost and the session builder', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const health = src.indexOf("app.get('/health'");
    expect(health).toBeGreaterThan(-1);
    expect(health).toBeLessThan(src.indexOf('cors(wc.corsConfig)'));
    expect(health).toBeLessThan(src.indexOf('app.use(rejectUnknownHost)'));
    expect(health).toBeLessThan(src.indexOf('wc.buildSessionMiddleware('));
  });
});
```

- [ ] **Step 2: Run it.** `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/health.test.js`. Expected: `PASS tests/health.test.js` and `Tests:       9 passed, 9 total` (8 hosts + 1 order test).

- [ ] **Step 3: Commit.**

```bash
git add tests/health.test.js && git commit -m "test(health): assert G2 on all five content hosts + portal + on-box + empty Host, before CORS (A2)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 32: Copy the atxwashdryfold marketing tree verbatim + its manifest (A3 — the one PR allowed past 500 lines)

**Files:**
- Create `content/atxwashdryfold/` (20 files):
  - `index.html` ← affiliate `public/partner-program.html`
  - `affiliate/index.html` ← `public/affiliate.html`
  - `assets/css/{partner-program,affiliate}.css`
  - `assets/fonts/{anton,big-shoulders-display,hanken-grotesk,plus-jakarta-sans,space-grotesk}-latin{,-ext}.woff2` (10 files)
  - `assets/images/locations/austin-tx/hero-1.webp`
  - `assets/images/affiliate-og.png`
  - `assets/images/brand/{logo.png,favicon-32x32.png}`
  - `assets/js/{partner-inquiry,affiliate-inquiry}.js`
- Modify: `tests/content-manifest.test.js`

**Interfaces:**
- Consumes: `MARKETING_ROOT` (Task 21).
- Produces: the on-disk marketing root. `logo.png` has md5 `7f5332b870fe36482e4b8d27f5c9334f` and is 5137 B. The `cmp … && echo VERBATIM` in Step 3 is the pre-edit proof R-11 requires before Task 34's declared canonical edits (including `sameAs`).
- Ports the post-`6acbf550` (2026-09-11) interest form (finding F-3: mandatory 80-2000-character `message`, `affiliate.css?v=20260911a`), because it copies the affiliate working tree at `70a60bc4`.
- Not copied (D5): `affiliate-ad.css`, `affiliate-ad-og.png`, `wavemax-affiliate.html`, the flyers.
- Not copied (§5.1 / §5.6): `i18n.js`, which is served from web-core (Task 39), and `security.txt`, which is generated (Task 41). Spec §11.3 lists both as marketing-root key files; §5.1, §5.6 and §5.12 (the authority, R-11 "§5.12 over §11.3") say otherwise, so they are not files in this tree.

- [ ] **Step 1: Write the failing manifest.** Replace the `MANIFESTS` constant and the "no existing root" test in `tests/content-manifest.test.js` with the code below, and change the hosts require to `const { CONTENT_ROOTS, CORPORATE_ROOT, MARKETING_ROOT } = require('../server/config/hosts');`.

```js
const MANIFESTS = {
  [CORPORATE_ROOT]: {
    count: 49,
    keyFiles: ['index.html', 'wavemax/index.html', 'wavemax/security-audit.html', 'assets/css/site.css', 'assets/images/brand/logo.png', 'robots.txt', 'sitemap.xml']
  },
  [MARKETING_ROOT]: {
    count: 20,
    keyFiles: ['index.html', 'affiliate/index.html', 'assets/css/partner-program.css', 'assets/css/affiliate.css',
      'assets/js/partner-inquiry.js', 'assets/js/affiliate-inquiry.js', 'assets/fonts/anton-latin.woff2',
      'assets/fonts/space-grotesk-latin-ext.woff2', 'assets/images/locations/austin-tx/hero-1.webp',
      'assets/images/affiliate-og.png', 'assets/images/brand/logo.png', 'assets/images/brand/favicon-32x32.png']
  }
};
```

```js
  test('every unique content root has a manifest', () => {
    expect([...new Set(Object.values(CONTENT_ROOTS))].sort()).toEqual(Object.keys(MANIFESTS).sort());
  });
  test('no root contains the DMCA-retired logo-wavemax.png', () => {
    for (const root of Object.keys(MANIFESTS)) expect(walk(root).filter((f) => path.basename(f) === 'logo-wavemax.png')).toEqual([]);
  });
```

- [ ] **Step 2: Run it.** `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/content-manifest.test.js`. Expected failure: `ENOENT: no such file or directory, scandir '…/content/atxwashdryfold'`.

- [ ] **Step 3: Copy the files and prove the two pages are verbatim.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && SRC=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/public D=content/atxwashdryfold
mkdir -p $D/affiliate $D/assets/css $D/assets/fonts $D/assets/images/locations/austin-tx $D/assets/images/brand $D/assets/js
cp $SRC/partner-program.html $D/index.html && cp $SRC/affiliate.html $D/affiliate/index.html
cp $SRC/assets/css/partner-program.css $SRC/assets/css/affiliate.css $D/assets/css/
cp $SRC/assets/fonts/{anton,big-shoulders-display,hanken-grotesk,plus-jakarta-sans,space-grotesk}-latin{,-ext}.woff2 $D/assets/fonts/
cp $SRC/assets/images/locations/austin-tx/hero-1.webp $D/assets/images/locations/austin-tx/
cp $SRC/assets/images/affiliate-og.png $D/assets/images/
cp $SRC/assets/images/brand/logo.png $SRC/assets/images/brand/favicon-32x32.png $D/assets/images/brand/
cp $SRC/assets/js/partner-inquiry.js $SRC/assets/js/affiliate-inquiry.js $D/assets/js/
find $D -type f | wc -l; md5sum $D/assets/images/brand/logo.png; stat -c %s $D/assets/images/brand/logo.png
cmp $SRC/partner-program.html $D/index.html && cmp $SRC/affiliate.html $D/affiliate/index.html && echo VERBATIM
```

Expected: `20`, then `7f5332b870fe36482e4b8d27f5c9334f  content/atxwashdryfold/assets/images/brand/logo.png`, then `5137`, then `VERBATIM`.

- [ ] **Step 4: Run the suite.** `npm test 2>&1 | grep -E '^Tests:' | grep -vc failed`. Expected: `1`.

- [ ] **Step 5: Commit.**

```bash
git add content/atxwashdryfold tests/content-manifest.test.js && git commit -m "feat(content): copy the atxwashdryfold marketing tree verbatim from the affiliate (A3)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 33: Marketing home page edits — canonical, OG, JSON-LD, aria, script stamps (A3, §5.3)

**Files:**
- Modify: `content/atxwashdryfold/index.html` (`:10`, `:18`, `:19`, `:23`, `:34`, `:36`, `:52`, `:109`, `:327`, `:328`)
- Test: `tests/contentHandler.test.js` (append)

**Interfaces:**
- Consumes: the Task 32 tree.
- Produces: the page served at `/` on all four marketing hosts, with canonical `https://atxwashdryfold.com/`, `data-i18n-aria-label="partner.plant.reliefAria"` (resolved by Task 37's locales and web-core `v0.2.1` `i18n.js`), and `?v=20260909a` on `i18n.js` and `partner-inquiry.js`.

- [ ] **Step 1: Append the failing test** to `tests/contentHandler.test.js`.

```js
describe('marketing home page (served app)', () => {
  const appFull = require('../server');
  const MARKETING = ['atxwashdryfold.com', 'rundberglaundry.com', 'runberglaundry.com', 'atxwashateria.com'];
  test.each(MARKETING)('%s / → atxwashdryfold page, canonical, nonce, one mention, no cookie', async (h) => {
    const res = await request(appFull).get('/').set('Host', h);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.text).toMatch(/<meta name="csp-nonce" content="[^"]{10,}">/);
    expect(res.text).toContain('<link rel="canonical" href="https://atxwashdryfold.com/">');
    expect(res.text).toContain('<meta property="og:url" content="https://atxwashdryfold.com/">');
    expect(res.text.split('https://atxwashdryfold.com/assets/images/locations/austin-tx/hero-1.webp').length - 1).toBe(3);
    expect(res.text).not.toContain('https://rundberglaundry.com');
    expect(res.text.split('WaveMAX Austin').length - 1).toBe(1);
    expect(res.text).toContain('data-i18n-aria-label="partner.plant.reliefAria" aria-label="Fulfillment partner plant"');
    expect(res.text).toContain('/assets/js/i18n.js?v=20260909a');
    expect(res.text).toContain('/assets/js/partner-inquiry.js?v=20260909a');
    expect(res.text.split('href="https://www.wavemaxlaundry.com/austin-tx"').length - 1).toBe(5);
  });
});
```

- [ ] **Step 2: Run it.** `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/contentHandler.test.js -t 'marketing home'`. Expected failure: `Expected substring: "<link rel=\"canonical\" href=\"https://atxwashdryfold.com/\">"`.

- [ ] **Step 3: Apply the edits.** Line numbers are verified against the copied file. Spec §5.3 cites the JSON-LD provider url at `:48`; it is actually at `:52` (P1-5).

```bash
F=content/atxwashdryfold/index.html
sed -i \
 -e '10s|href="https://rundberglaundry.com/"|href="https://atxwashdryfold.com/"|' \
 -e '18s|content="https://rundberglaundry.com/"|content="https://atxwashdryfold.com/"|' \
 -e '19s|https://rundberglaundry.com/assets/|https://atxwashdryfold.com/assets/|' \
 -e '23s|https://rundberglaundry.com/assets/|https://atxwashdryfold.com/assets/|' \
 -e '34s|"https://rundberglaundry.com/"|"https://atxwashdryfold.com/"|' \
 -e '36s|https://rundberglaundry.com/assets/|https://atxwashdryfold.com/assets/|' \
 -e '52s|"url": "https://rundberglaundry.com/"|"url": "https://atxwashdryfold.com/"|' \
 -e '109s|aria-label="WaveMAX Austin store"|data-i18n-aria-label="partner.plant.reliefAria" aria-label="Fulfillment partner plant"|' \
 -e '327s|<script src="/assets/js/i18n.js"></script>|<script src="/assets/js/i18n.js?v=20260909a"></script>|' \
 -e '328s|<script src="/assets/js/partner-inquiry.js" defer></script>|<script src="/assets/js/partner-inquiry.js?v=20260909a" defer></script>|' "$F"
grep -c 'rundberglaundry.com' $F; grep -c 'mailto:pickups@atxwashdryfold.com' $F
```

Expected: `0`, then `2` (the mailtos at `:260` and `:321` stay).

- [ ] **Step 4: Run it.** `npx jest tests/contentHandler.test.js`. Expected: `PASS tests/contentHandler.test.js`.

- [ ] **Step 5: Commit.**

```bash
git add content/atxwashdryfold/index.html tests/contentHandler.test.js && git commit -m "feat(marketing): canonical/OG/JSON-LD → atxwashdryfold.com; aria i18n; version-stamped scripts (A3, D8)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 34: `/affiliate` page (canonical, OG, `sameAs`) + both inquiry scripts (A3, §5.3, R-11)

**Files:**
- Modify: `content/atxwashdryfold/affiliate/index.html` (`:10`, `:17`, `:18`, `:22`, `:36`, `:334`)
- Modify: `content/atxwashdryfold/assets/js/partner-inquiry.js` (`:2`, `:85`, `:101`, `:106`)
- Modify: `content/atxwashdryfold/assets/js/affiliate-inquiry.js` (`:2`, `:51`)
- Test: `tests/contentHandler.test.js` (append)

**Interfaces:**
- Consumes: the Task 32 tree, whose verbatim `cmp` ran before any edit here (R-11).
- Produces:
  - `/affiliate` and `/affiliate/` with canonical `https://atxwashdryfold.com/affiliate` and JSON-LD `hiringOrganization.sameAs` `https://atxwashdryfold.com/` (R-11 / D8: a declared canonical edit, not in the §5.3 table). The page then contains 0 occurrences of `rundberglaundry.com` (it had exactly 5: `:10`, `:17`, `:18`, `:22`, `:36`).
  - Scripts that POST `/api/partner-inquiry` and `/api/affiliate-application`. Those endpoints and their `/api/v1/*` compatibility aliases arrive in PR A7 (A69 slice); until then everything is dark.

- [ ] **Step 1: Append the failing test** to `tests/contentHandler.test.js`.

```js
describe('marketing /affiliate + inquiry scripts (served app)', () => {
  const appFull = require('../server');
  test.each(['/affiliate', '/affiliate/'])('%s → 200 with canonical /affiliate and sameAs atxwashdryfold.com', async (p) => {
    const res = await request(appFull).get(p).set('Host', 'rundberglaundry.com');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<link rel="canonical" href="https://atxwashdryfold.com/affiliate">');
    expect(res.text).toContain('<meta property="og:url" content="https://atxwashdryfold.com/affiliate">');
    expect(res.text.split('https://atxwashdryfold.com/assets/images/affiliate-og.png').length - 1).toBe(2);
    expect(res.text).toContain('"sameAs": "https://atxwashdryfold.com/"');
    expect(res.text).not.toContain('rundberglaundry.com');
    expect(res.text).toContain('/assets/js/affiliate-inquiry.js?v=20260909a');
    expect(res.text).toContain('mailto:admin@crhsent.com');
  });
  test('partner-inquiry.js posts /api/partner-inquiry and names pickups@atxwashdryfold.com', async () => {
    const res = await request(appFull).get('/assets/js/partner-inquiry.js').set('Host', 'atxwashateria.com');
    expect(res.status).toBe(200);
    expect(res.text).toContain("fetch('/api/partner-inquiry'");
    expect(res.text).not.toContain('/api/v1/');
    expect(res.text).not.toContain('rundberglaundry.com');
    expect(res.text.split('pickups@atxwashdryfold.com').length - 1).toBe(2);
  });
  test('affiliate-inquiry.js posts /api/affiliate-application', async () => {
    const res = await request(appFull).get('/assets/js/affiliate-inquiry.js').set('Host', 'atxwashateria.com');
    expect(res.text).toContain("fetch('/api/affiliate-application'");
    expect(res.text).not.toContain('/api/v1/');
  });
});
```

- [ ] **Step 2: Run it.** `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/contentHandler.test.js -t 'affiliate'`. Expected failure: `Expected substring: "<link rel=\"canonical\" href=\"https://atxwashdryfold.com/affiliate\">"`.

- [ ] **Step 3: Apply the edits.** The script tag is at `:334`, not `:331` (P1-5). The `sameAs` edit at `:36` is the R-11 canonical edit.

```bash
D=content/atxwashdryfold
sed -i \
 -e '10s|https://rundberglaundry.com/affiliate|https://atxwashdryfold.com/affiliate|' \
 -e '17s|https://rundberglaundry.com/affiliate|https://atxwashdryfold.com/affiliate|' \
 -e '18s|https://rundberglaundry.com/assets/images/affiliate-og.png|https://atxwashdryfold.com/assets/images/affiliate-og.png|' \
 -e '22s|https://rundberglaundry.com/assets/images/affiliate-og.png|https://atxwashdryfold.com/assets/images/affiliate-og.png|' \
 -e '36s|"sameAs": "https://rundberglaundry.com/"|"sameAs": "https://atxwashdryfold.com/"|' \
 -e '334s|<script src="/assets/js/affiliate-inquiry.js" defer></script>|<script src="/assets/js/affiliate-inquiry.js?v=20260909a" defer></script>|' $D/affiliate/index.html
sed -i -e 's|/api/v1/partner-inquiry|/api/partner-inquiry|g' -e 's|pickups@rundberglaundry.com|pickups@atxwashdryfold.com|g' $D/assets/js/partner-inquiry.js
sed -i -e 's|/api/v1/affiliate-application|/api/affiliate-application|g' $D/assets/js/affiliate-inquiry.js
grep -c 'rundberglaundry.com' $D/affiliate/index.html; grep -n "fetch(" $D/assets/js/*.js
```

Expected: `0`, then `content/atxwashdryfold/assets/js/affiliate-inquiry.js:51:      fetch('/api/affiliate-application', {` and `content/atxwashdryfold/assets/js/partner-inquiry.js:85:      fetch('/api/partner-inquiry', {`.

- [ ] **Step 4: Run it.** `npx jest tests/contentHandler.test.js`. Expected: `PASS tests/contentHandler.test.js`.

- [ ] **Step 5: Commit.**

```bash
git add content/atxwashdryfold tests/contentHandler.test.js && git commit -m "feat(marketing): /affiliate canonical + sameAs + inquiry scripts post to content-app /api paths (A3, R-11)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 35: Immutable `/assets` caching on marketing hosts + `logo-wavemax.png` → 410 on every content host (A3)

**Files:**
- Modify: `server/contentHandler.js` (whole file)
- Test (create): `tests/assetCaching.test.js`

**Interfaces:**
- Consumes: `CONTENT_ROOTS`, `requestHost`, `hostKind` (Task 21).
- Produces:
  - Marketing `/assets/*` non-HTML responses carry `Cache-Control: public, max-age=31536000, immutable`.
  - `GET /assets/images/brand/logo-wavemax.png` returns `410`, `public, max-age=86400`, with an empty body, on all 5 hosts.
  - `/assets/images/brand/logo.png` → 200 `image/png` 5137 B on all four marketing hosts AND on crhsent.com (§5.12).
- Scoping choice (R-11: accepted): immutable caching is scoped to **marketing** hosts only. crhsent.com's fonts and images are not `?v=`-stamped (`content/crhsent/*.html` stamps only `site.css`/`site.js`), so immutable there would pin stale assets for a year. crhsent keeps send's default `public, max-age=0`. `send@0.19.2` only writes Cache-Control when none is set (`send/index.js:861`), so passing `{ maxAge, immutable }` produces the exact header.

- [ ] **Step 1: Write the failing test** `tests/assetCaching.test.js`.

```js
'use strict';
const request = require('supertest');
const app = require('../server');
const MARKETING = ['atxwashdryfold.com', 'rundberglaundry.com', 'runberglaundry.com', 'atxwashateria.com'];
const ASSETS = ['/assets/css/partner-program.css', '/assets/css/affiliate.css', '/assets/js/partner-inquiry.js', '/assets/fonts/anton-latin.woff2', '/assets/images/locations/austin-tx/hero-1.webp', '/assets/images/brand/logo.png'];

describe.each(MARKETING)('asset caching on %s', (h) => {
  test.each(ASSETS)('%s → public, 1y, immutable + CORP cross-origin, no cookie', async (p) => {
    const res = await request(app).get(`${p}?v=20260909a`).set('Host', h);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.headers['set-cookie']).toBeUndefined();
  });
  test('HTML is never immutable', async () => {
    for (const p of ['/', '/affiliate']) expect((await request(app).get(p).set('Host', h)).headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
  });
  test('logo.png is the 5137-byte wordmark', async () => {
    const res = await request(app).get('/assets/images/brand/logo.png').set('Host', h);
    expect(res.headers['content-type']).toBe('image/png'); expect(res.body.length).toBe(5137);
  });
});

test('crhsent.com logo.png is the same 5137-byte wordmark', async () => {
  const res = await request(app).get('/assets/images/brand/logo.png').set('Host', 'crhsent.com');
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toBe('image/png');
  expect(res.body.length).toBe(5137);
});

describe('DMCA-retired logo-wavemax.png (spec §5.1c)', () => {
  test.each([...MARKETING, 'crhsent.com'])('%s → 410, max-age=86400, empty body, no Location', async (h) => {
    const res = await request(app).get('/assets/images/brand/logo-wavemax.png').set('Host', h);
    expect(res.status).toBe(410);
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    expect(res.headers.location).toBeUndefined();
    expect(res.text || '').toBe('');
  });
});

test('crhsent.com assets keep send default caching (not immutable)', async () => {
  expect((await request(app).get('/assets/css/site.css').set('Host', 'crhsent.com')).headers['cache-control']).toBe('public, max-age=0');
});
```

- [ ] **Step 2: Run it.** `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/assetCaching.test.js`. Expected failures:
  - each marketing asset: `Expected: "public, max-age=31536000, immutable" Received: "public, max-age=0"`
  - each `logo-wavemax.png` host: `Expected: 410 Received: 404`

  (The logo.png and crhsent default-caching tests already pass.)

- [ ] **Step 3: Implement.** Replace the whole of `server/contentHandler.js` with:

```js
// Multi-host content handler (spec §5.1): serves the content root mapped to the request's
// Host. Traversal guard, clean URLs, nonce-injected HTML and sendFile are carried verbatim
// from the former server/crhsentHandler.js; only the root selection changed. Host input is
// requestHost() / hostKind() only (R-3).
'use strict';
const path = require('path');
const { cspHelper } = require('@crhs/web-core');
const { CONTENT_ROOTS, requestHost, hostKind } = require('./config/hosts');

// DMCA (c48785ca): the franchisor swirl. Historical emails (2026-06-17→08-24) embed this path.
// It must answer 410 on every content host and must never redirect to logo.png.
const DMCA_GONE_PATH = '/assets/images/brand/logo-wavemax.png';
const IMMUTABLE = { maxAge: '1y', immutable: true };

/**
 * @param {Object<string,string>} [roots=CONTENT_ROOTS] apex host → absolute content root.
 * @returns {import('express').RequestHandler} serves the mapped root; next() for an unmapped host or missing file.
 */
module.exports = function contentHandler(roots = CONTENT_ROOTS) {
  return async (req, res, next) => {
    const host = requestHost(req);
    if (!Object.prototype.hasOwnProperty.call(roots, host)) return next();
    const contentRoot = roots[host];
    if (req.path === DMCA_GONE_PATH) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(410).end();
    }
    try {
      const rel = decodeURIComponent(req.path);
      let full = path.normalize(path.join(contentRoot, rel));
      if (full !== contentRoot && !full.startsWith(contentRoot + path.sep)) {
        return res.status(403).end();
      }
      if (!path.extname(full)) {
        full = path.join(full, 'index.html');
      }
      if (full.endsWith('.html')) {
        const html = await cspHelper.readHTMLWithNonce(full, res.locals.cspNonce);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.type('html').send(html);
      }
      // Marketing assets are ?v=-stamped → immutable (mirrors affiliate server.js:588-594).
      // crhsent's fonts/images are not stamped, so they keep send's default caching.
      const opts = hostKind(req) === 'marketing' && req.path.startsWith('/assets/') ? IMMUTABLE : {};
      return res.sendFile(full, opts, (err) => { if (err) next(); });
    } catch (e) {
      return next();
    }
  };
};
```

- [ ] **Step 4: Run the suite and re-check the crhsent baseline.**

```bash
npm test 2>&1 | grep -E '^Tests:' | grep -vc failed; node ~/crhs-cutover-baselines/crhsent-baseline.js "$PWD" > ~/crhs-cutover-baselines/a1/local/after-A3.json && diff ~/crhs-cutover-baselines/a1/local/before.json ~/crhs-cutover-baselines/a1/local/after-A3.json && echo IDENTICAL
```

Expected: `1`, then `IDENTICAL`.

- [ ] **Step 5: Commit.**

```bash
git add server/contentHandler.js tests/assetCaching.test.js && git commit -m "feat(content): immutable marketing /assets; logo-wavemax.png → 410 on every content host (A3, DMCA)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 36: `tests/marketingBrandGuard.test.js` + strip the `WaveMAX` CSS comment and re-stamp the stylesheet (A3)

**Files:**
- Test (create): `tests/marketingBrandGuard.test.js`
- Modify: `content/atxwashdryfold/assets/css/partner-program.css:3`
- Modify: `content/atxwashdryfold/index.html:26` (the stylesheet `?v=` stamp)

**Interfaces:**
- Produces: the P11 corporate guard (§10.3), which `cutover-gate.sh` runs as `npm test -- tests/marketingBrandGuard.test.js`.
- Deliberate change to a verbatim copy (P1-8; R-11: accepted): `partner-program.css:3` contains the comment `De-WaveMAX'd`, a bare mark in the shipped bytes. The guard scans every text file (not only §11.3's visible text), so the comment is reworded. The CSS bytes then change, and `/assets/css/partner-program.css?v=20260827a` is already cached `immutable, max-age=1y` from the `:3000` origin, so the reference is re-stamped `?v=20260909a` — the same rule Task 33 applies to the scripts.

- [ ] **Step 1: Write the failing test.**

```js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'content', 'atxwashdryfold');
const TEXT = new Set(['.html', '.css', '.js', '.json', '.txt', '.xml']);
const AUDITED_HREF = 'href="https://www.wavemaxlaundry.com/austin-tx"';
const AUDITED_FILES = { 'index.html': 5 }; // five hrefs on four lines (§5.3)
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = () => walk(ROOT).filter((f) => TEXT.has(path.extname(f)));
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');

describe('marketing content root brand guard (crhsent root exempt by design)', () => {
  test('audited-exception entries exist (no stale exclusions)', () => {
    for (const f of Object.keys(AUDITED_FILES)) expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
  });
  test('visible text names the mark only as "WaveMAX Austin"', () => {
    for (const f of ['index.html', 'affiliate/index.html']) {
      const visible = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]*>/g, '');
      expect({ f, hit: /wavemax/i.test(visible.replace(/WaveMAX Austin/g, '')) }).toEqual({ f, hit: false });
    }
  });
  test('every text file: no /wavemax/i beyond "WaveMAX Austin" and the audited hrefs', () => {
    for (const f of files()) {
      const s = fs.readFileSync(f, 'utf8').split(AUDITED_HREF).join('').replace(/WaveMAX Austin/g, '');
      expect({ f: rel(f), hit: /wavemax/i.test(s) }).toEqual({ f: rel(f), hit: false });
    }
  });
  test('audited fulfillment-partner href count is pinned (5 in index.html, 0 elsewhere)', () => {
    for (const f of files()) {
      const n = fs.readFileSync(f, 'utf8').split('wavemaxlaundry.com').length - 1;
      expect({ f: rel(f), n }).toEqual({ f: rel(f), n: AUDITED_FILES[rel(f)] || 0 });
    }
  });
  test('logo-wavemax never appears', () => {
    for (const f of walk(ROOT)) expect(path.basename(f)).not.toBe('logo-wavemax.png');
    for (const f of files()) expect(fs.readFileSync(f, 'utf8')).not.toMatch(/logo-wavemax/i);
  });
  test('the changed stylesheet is re-stamped', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(html).toContain('/assets/css/partner-program.css?v=20260909a');
    expect(html).not.toContain('partner-program.css?v=20260827a');
  });
});
```

- [ ] **Step 2: Run it.** `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/marketingBrandGuard.test.js`. Expected failures:
  - `every text file…`: `Expected: {"f": "assets/css/partner-program.css", "hit": false} Received: {"f": "assets/css/partner-program.css", "hit": true}`
  - `the changed stylesheet is re-stamped`: `Expected substring: "/assets/css/partner-program.css?v=20260909a"`

- [ ] **Step 3: Reword the comment and re-stamp the reference.**

```bash
sed -i "3s|skin. De-WaveMAX'd:|skin. De-branded:|" content/atxwashdryfold/assets/css/partner-program.css && sed -i '26s|/assets/css/partner-program.css?v=20260827a|/assets/css/partner-program.css?v=20260909a|' content/atxwashdryfold/index.html && sed -n 3p content/atxwashdryfold/assets/css/partner-program.css && grep -c 'partner-program.css?v=20260909a' content/atxwashdryfold/index.html
```

Expected: `   Adapted from the "Austin Bold (light)" franchise-review skin. De-branded:`, then `1`.

- [ ] **Step 4: Run it.** `npx jest tests/marketingBrandGuard.test.js tests/assetCaching.test.js 2>&1 | grep -E '^(PASS|FAIL)'`. Expected: two `PASS` lines.

- [ ] **Step 5: Commit.**

```bash
git add tests/marketingBrandGuard.test.js content/atxwashdryfold/assets/css/partner-program.css content/atxwashdryfold/index.html && git commit -m "test(brand): marketing-root brand guard (P11); drop bare mark from partner-program.css + re-stamp ?v= (A3)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 37: Marketing locales — `partner.*` 110 leaves × 4 in ONE commit + `tests/i18nParity.test.js` (A4, §5.4)

**Files:**
- Create: `content/atxwashdryfold/locales/{en,es,pt,de}/common.json`
- Test (create): `tests/i18nParity.test.js`
- Modify: `tests/content-manifest.test.js` (marketing `count: 20` → `24`; add the 4 locale key files)

**Interfaces:**
- Consumes: affiliate `public/locales/<lang>/common.json:1577` (`"partner": {`), which has 109 leaves in 10 groups (`meta, nav, hero, stats, steps, plant, why, who, form, footer`).
- Produces: corporate locale files whose only top-level key is `partner`, with **110** leaves: 109 plus `partner.plant.reliefAria`. PR A7 (A69 slice) adds the nine `partner.form.err*` codes to reach 119 (§10.1 C13).
- §11.3 row "`{{brandName}}` token present where the affiliate copy has it": vacuous for this tree and deliberately not asserted — the affiliate `partner` subtree contains 0 `{{brandName}}` tokens in all four locales (verified by the reviewer on 2026-09-13), and Step 3 copies it verbatim, so there is nothing to preserve.
- Cross-repo note: the affiliate removes `partner.*` in its own independent commit in Plan 3. Nothing in this slice touches the affiliate.

- [ ] **Step 1: Write the failing test** `tests/i18nParity.test.js`.

```js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'content', 'atxwashdryfold');
const LANGS = ['en', 'es', 'pt', 'de'];
const EXPECTED_PARTNER_LEAVES = 110; // 109 moved + partner.plant.reliefAria; A7 adds 9 err codes → 119
const load = (l) => JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', l, 'common.json'), 'utf8'));
const leaves = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v, `${p}${k}.`) : [`${p}${k}`]));
const get = (o, key) => key.split('.').reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), o);

describe('marketing locale parity', () => {
  test('(1) the four key sets are identical', () => {
    const en = leaves(load('en')).sort();
    for (const l of ['es', 'pt', 'de']) expect(leaves(load(l)).sort()).toEqual(en);
  });
  test('(2) top level is exactly ["partner"] with 110 leaves', () => {
    for (const l of LANGS) { const j = load(l); expect(Object.keys(j)).toEqual(['partner']); expect(leaves(j)).toHaveLength(EXPECTED_PARTNER_LEAVES); }
  });
  test('(3) no wavemax except the literal "WaveMAX Austin"', () => {
    for (const l of LANGS) expect(/wavemax/i.test(JSON.stringify(load(l)).replace(/WaveMAX Austin/g, ''))).toBe(false);
  });
  test('(4) every data-i18n / -placeholder / -aria-label key in index.html resolves non-empty in all four', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const keys = [...new Set([...html.matchAll(/data-i18n(?:-placeholder|-aria-label)?="([^"]+)"/g)].map((m) => m[1]))];
    expect(keys).toHaveLength(104);
    expect(keys).toContain('partner.plant.reliefAria');
    for (const l of LANGS) { const j = load(l); for (const k of keys) expect({ l, k, ok: typeof get(j, k) === 'string' && get(j, k).length > 0 }).toEqual({ l, k, ok: true }); }
  });
  test('(5) errGeneric/errNetwork carry pickups@atxwashdryfold.com, never rundberglaundry.com', () => {
    for (const l of LANGS) for (const k of ['errGeneric', 'errNetwork']) {
      const v = load(l).partner.form[k]; expect(v).toContain('pickups@atxwashdryfold.com'); expect(v).not.toContain('rundberglaundry.com');
    }
  });
});
```

  The `104` is the 103 distinct `data-i18n*` keys already in `partner-program.html` plus `partner.plant.reliefAria` added by Task 33 (103 + 1 = 104).

- [ ] **Step 2: Run it.** `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/i18nParity.test.js`. Expected failure: `ENOENT: no such file or directory, open '…/content/atxwashdryfold/locales/en/common.json'`.

- [ ] **Step 3: Generate the four files in one run.** It copies `partner` verbatim, adds `plant.reliefAria` in each language using the terminology each locale already uses for "fulfillment partner", and changes only the address in `form.errGeneric` and `form.errNetwork`. `partner.footer.fulfillmentPartner` is carried verbatim, which keeps the count at 110.

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && node -e '
const fs=require("fs"),path=require("path");
const SRC="/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/public/locales";
const ARIA={en:"Fulfillment partner plant",es:"Planta del socio de cumplimiento",pt:"Unidade da parceira de execução",de:"Betrieb des Erfüllungspartners"};
for (const l of ["en","es","pt","de"]) {
  const p=JSON.parse(fs.readFileSync(path.join(SRC,l,"common.json"),"utf8")).partner;
  p.plant.reliefAria=ARIA[l];
  for (const k of ["errGeneric","errNetwork"]) p.form[k]=p.form[k].split("pickups@rundberglaundry.com").join("pickups@atxwashdryfold.com");
  const out=path.join("content/atxwashdryfold/locales",l,"common.json");
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out, JSON.stringify({partner:p},null,2)+"\n");
}' && grep -c rundberglaundry content/atxwashdryfold/locales/*/common.json
```

Expected: four lines ending in `:0`.

- [ ] **Step 4: Update the manifest.** In `tests/content-manifest.test.js`, change the marketing entry's `count: 20` to `count: 24` and append `'locales/en/common.json', 'locales/es/common.json', 'locales/pt/common.json', 'locales/de/common.json'` to its `keyFiles`.

- [ ] **Step 5: Run the suite.** `npm test 2>&1 | grep -E '^Tests:' | grep -vc failed`. Expected: `1`.

- [ ] **Step 6: Commit** (all four locales in one commit).

```bash
git add content/atxwashdryfold/locales tests/i18nParity.test.js tests/content-manifest.test.js && git commit -m "i18n(marketing): partner.* (110 leaves) in en/es/pt/de + parity test (A4)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 38: Corporate `scripts/check-i18n-parity.js` + `npm run check:i18n` (A4, §5.4 / §11.5)

**Files:**
- Create: `scripts/check-i18n-parity.js`
- Modify: `package.json` (`scripts`)
- Test: `tests/i18nParity.test.js` (append)

**Interfaces:**
- Produces: `flattenKeys(obj) → string[]`, `diffLocales({ localesDir, requiredKeys, requiredPrefixes }) → { errors: string[], enKeyCount: number }`, and `npm run check:i18n`, which exits non-zero on drift. The GATE slice's C13 key-set check runs `npm run check:i18n`.

- [ ] **Step 1: Append the failing test** to `tests/i18nParity.test.js`.

```js
describe('check-i18n-parity script', () => {
  const os = require('os');
  const { execFileSync } = require('child_process');
  test('diffLocales reports zero errors for the shipped locales', () => {
    expect(require('../scripts/check-i18n-parity').diffLocales().errors).toEqual([]);
  });
  test('diffLocales detects a key missing from one locale', () => {
    const { diffLocales } = require('../scripts/check-i18n-parity');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-'));
    for (const [l, o] of Object.entries({ en: { partner: { a: 1, b: 2 } }, es: { partner: { a: 1 } }, pt: { partner: { a: 1, b: 2 } }, de: { partner: { a: 1, b: 2 } } })) {
      fs.mkdirSync(path.join(dir, l)); fs.writeFileSync(path.join(dir, l, 'common.json'), JSON.stringify(o));
    }
    expect(diffLocales({ localesDir: dir }).errors).toEqual(['es: missing key (in en, not in es): partner.b']);
  });
  test('npm run check:i18n exits 0', () => {
    const out = execFileSync('npm', ['run', '--silent', 'check:i18n'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
    expect(out).toContain('i18n parity OK: 110 keys × 4 locales');
  });
});
```

- [ ] **Step 2: Run it.** `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/i18nParity.test.js -t script`. Expected failure: `Cannot find module '../scripts/check-i18n-parity' from 'tests/i18nParity.test.js'`.

- [ ] **Step 3: Implement** `scripts/check-i18n-parity.js`. `flattenKeys` and `diffLocales` are verbatim from affiliate `scripts/check-i18n-parity.js:102-137`.

```js
#!/usr/bin/env node
// Corporate i18n parity gate (spec §5.4/§11.5). flattenKeys/diffLocales are verbatim from the
// affiliate's scripts/check-i18n-parity.js:102-137 with REQUIRED_PREFIXES = ['partner'],
// no REQUIRED_KEYS (the affiliate's are portal claim.* keys) and no email-template section.
'use strict';
const fs = require('fs');
const path = require('path');

const LANGS = ['en', 'es', 'pt', 'de'];
const DEFAULT_LOCALES_DIR = path.join(__dirname, '..', 'content', 'atxwashdryfold', 'locales');
const REQUIRED_KEYS = [];
const REQUIRED_PREFIXES = ['partner'];

function flattenKeys(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flattenKeys(v, key, out);
    else out.push(key);
  }
  return out;
}

function loadLocale(localesDir, lang) {
  return JSON.parse(fs.readFileSync(path.join(localesDir, lang, 'common.json'), 'utf8'));
}

function diffLocales({
  localesDir = DEFAULT_LOCALES_DIR,
  requiredKeys = REQUIRED_KEYS,
  requiredPrefixes = REQUIRED_PREFIXES
} = {}) {
  const errors = [];
  const en = new Set(flattenKeys(loadLocale(localesDir, 'en')));

  for (const key of requiredKeys) {
    if (!en.has(key)) errors.push(`required key missing from en: ${key}`);
  }
  for (const prefix of requiredPrefixes) {
    if (![...en].some(k => k.startsWith(prefix + '.'))) {
      errors.push(`required namespace empty in en: ${prefix}.*`);
    }
  }
  for (const lang of LANGS.filter(l => l !== 'en')) {
    const keys = new Set(flattenKeys(loadLocale(localesDir, lang)));
    for (const k of en) if (!keys.has(k)) errors.push(`${lang}: missing key (in en, not in ${lang}): ${k}`);
    for (const k of keys) if (!en.has(k)) errors.push(`${lang}: extra key (not in en): ${k}`);
  }
  return { errors, enKeyCount: en.size };
}

function main() {
  const { errors, enKeyCount } = diffLocales();
  if (errors.length) {
    for (const e of errors) process.stderr.write(`${e}\n`);
    process.stderr.write(`i18n parity FAILED: ${errors.length} problem(s)\n`);
    process.exit(1);
  }
  process.stdout.write(`i18n parity OK: ${enKeyCount} keys × ${LANGS.length} locales\n`);
}

if (require.main === module) main();
module.exports = { flattenKeys, diffLocales, LANGS, REQUIRED_PREFIXES };
```

  Then add `"check:i18n": "node scripts/check-i18n-parity.js"` to `package.json` `scripts`. Before this change that block is exactly `{start, test, lint, ensure-indexes}`.

- [ ] **Step 4: Run the tests and the script.** `npx jest tests/i18nParity.test.js && npm run check:i18n`. Expected: `PASS tests/i18nParity.test.js`, then `i18n parity OK: 110 keys × 4 locales`.

- [ ] **Step 5: Commit.**

```bash
git add scripts/check-i18n-parity.js package.json tests/i18nParity.test.js && git commit -m "i18n: corporate check-i18n-parity script + npm run check:i18n (A4)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 39: `/locales` headers + serve web-core `i18n.js` / `language-switcher.js` on marketing hosts (A4)

> **Blocked unless Task 20 Step 0 printed the expected-when-landed values** (`~/crhs-cutover-baselines/a1/precondition.txt` has no `A0/B3k not released or not adopted by corporate` line). Tasks 40-42 are blocked by the same condition.

**Files:**
- Modify: `server/contentHandler.js` (the `sendFile` options)
- Create: `server/webCoreAssets.js`
- Modify: `server.js`
- Test: `tests/contentHandler.test.js` (append)

**Interfaces:**
- Consumes:
  - `wc.assetsDir` (a plain value from web-core `src/index.js:66`) and `marketingOnly` (Task 28), which reads `requestHost` only.
  - **`@crhs/web-core@0.2.1`**, installed locally and recorded in corporate `package-lock.json` by the P0 slice — P0 Task 6 (the B3k `data-i18n-aria-label` handler in `assets/js/i18n.js`), P0 Task 8 (tag `v0.2.1`) and P0 Task 9 (corporate topology floor + lockfile `0.2.1`) — providing the B3k handler (deferred-work D-1; P1-3). This task verifies it and does not modify `package-lock.json`.
- Produces:
  - `/locales/*.json` responses with `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET`, `Cache-Control: public, max-age=3600`.
  - Marketing `/assets/js/i18n.js` and `/assets/js/language-switcher.js`, served immutable.
  - No other web-core file is served (P1-7: the bridges stay unexposed).

- [ ] **Step 1: Refresh and verify the local web-core copy (touches no box).** The `rm -rf` is mandatory: `npm install --install-links` does not re-copy a `file:` dependency otherwise (Global Constraint 16).

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && rm -rf node_modules/@crhs/web-core && npm install --install-links && node -p "require('@crhs/web-core/package.json').version" && node -p "Object.keys(require('@crhs/web-core')).length" && node -p "Object.keys(require('@crhs/web-core').csrf).includes('createCsrf')" && grep -c 'data-i18n-aria-label' node_modules/@crhs/web-core/assets/js/i18n.js && grep -A1 '"node_modules/@crhs/web-core"' package-lock.json | grep -o '"version": "[0-9.]*"' && git status --porcelain package-lock.json | wc -l
```

Expected, in order: `0.2.1`, `26`, `true`, a count ≥ `1`, `"version": "0.2.1"`, `0` (the install left the committed lockfile unchanged). If any value differs, stop: the P0 slice's web-core adoption has not landed.

- [ ] **Step 2: Append the failing test** to `tests/contentHandler.test.js`.

```js
describe('marketing locales + web-core client JS (served app)', () => {
  const fsx = require('fs');
  const pathx = require('path');
  const appFull = require('../server');
  test.each(['en', 'es', 'pt', 'de'])('/locales/%s/common.json → json, ACAO *, GET, 1h', async (l) => {
    const res = await request(appFull).get(`/locales/${l}/common.json`).set('Host', 'runberglaundry.com');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toBe('GET');
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });
  test('/assets/js/i18n.js is web-core’s copy, immutable', async () => {
    const res = await request(appFull).get('/assets/js/i18n.js?v=20260909a').set('Host', 'atxwashdryfold.com');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.text).toBe(fsx.readFileSync(pathx.join(wc.assetsDir, 'js', 'i18n.js'), 'utf8'));
  });
  test('the served i18n.js applies data-i18n-aria-label (web-core B3k, v0.2.1)', async () => {
    expect((await request(appFull).get('/assets/js/i18n.js').set('Host', 'atxwashdryfold.com')).text).toContain('data-i18n-aria-label');
  });
  test('language-switcher.js served; bridges are not', async () => {
    expect((await request(appFull).get('/assets/js/language-switcher.js').set('Host', 'atxwashdryfold.com')).status).toBe(200);
    expect((await request(appFull).get('/assets/js/iframe-bridge-v2.js').set('Host', 'atxwashdryfold.com')).status).toBe(404);
  });
  test('crhsent.com does not get web-core i18n.js', async () => {
    expect((await request(appFull).get('/assets/js/i18n.js').set('Host', 'crhsent.com')).status).toBe(404);
  });
});
```

- [ ] **Step 3: Run it.** `npx jest tests/contentHandler.test.js -t 'web-core client JS'`. Expected failures:
  - each locale: `Expected: "*" Received: undefined`
  - `i18n.js is web-core’s copy`: `Expected: 200 Received: 404`
  - `applies data-i18n-aria-label`: `Expected substring: "data-i18n-aria-label"` (the marketing host returns the 404 page, not the script)
  - `language-switcher.js served`: `Expected: 200 Received: 404`

  (`crhsent.com does not get web-core i18n.js` already passes.)

- [ ] **Step 4: Implement.**
  - In `server/contentHandler.js`, replace the line `const opts = hostKind(req) === 'marketing' && req.path.startsWith('/assets/') ? IMMUTABLE : {};` with:

```js
      let opts = {};
      if (hostKind(req) === 'marketing' && req.path.startsWith('/assets/')) opts = IMMUTABLE;
      // Locale bundles: ACAO * + 1h, parity with the affiliate origin (server.js:668-676).
      if (req.path.startsWith('/locales/')) opts = { maxAge: '1h', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' } };
```

  - Create `server/webCoreAssets.js`:

```js
// The single served copy of web-core's client i18n loader + language switcher on the marketing
// hosts (spec §5.2 step 18b). An explicit two-file allowlist, NOT express.static(assetsDir/js):
// web-core still ships the iframe bridges until Plan 3, and they must not be exposed here.
// Host scoping goes through marketingOnly → hostKind → requestHost (R-3).
'use strict';
const path = require('path');
const { assetsDir } = require('@crhs/web-core');
const { marketingOnly } = require('./config/hosts');

const SERVED = new Set(['i18n.js', 'language-switcher.js']);

function serveWebCoreJs(req, res, next) {
  const m = /^\/assets\/js\/([^/]+)$/.exec(req.path);
  if (!m || !SERVED.has(m[1]) || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
  return res.sendFile(path.join(assetsDir, 'js', m[1]), { maxAge: '1y', immutable: true }, (err) => { if (err) next(); });
}

module.exports = marketingOnly(serveWebCoreJs);
```

  - In `server.js`, add `const webCoreAssets = require('./server/webCoreAssets');` under the `contentHandler` require, and directly after `app.use(contentHandler());` add:

```js
// After contentHandler (which next()s on a sendFile miss) so content-owned JS wins. §5.2 step 18b.
app.use(webCoreAssets);
```

- [ ] **Step 5: Run the suite and lint.** `npm test 2>&1 | grep -E '^Tests:' | grep -vc failed; npm run lint`. Expected: `1`, lint clean.

- [ ] **Step 6: Commit.**

```bash
git add server/contentHandler.js server/webCoreAssets.js server.js tests/contentHandler.test.js && git commit -m "feat(i18n): /locales ACAO + 1h; serve web-core i18n.js/language-switcher.js on marketing hosts only (A4)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 40: Marketing `robots.txt` + `sitemap.xml` (A5, §5.6)

**Files:**
- Create: `server/seoRoutes.js`
- Modify: `server/config/hosts.js` (add `MARKETING_LASTMOD`)
- Modify: `server.js`
- Test (create): `tests/seoFiles.test.js`

**Interfaces:**
- Consumes: `marketingOnly` (reads `requestHost` only, R-3), `MARKETING_CANONICAL_ORIGIN`.
- Produces:
  - `MARKETING_LASTMOD = '2026-09-12'` (update it in any PR that changes `/` or `/affiliate`).
  - `seoRoutes`: an Express router, mounted after the gates and before `contentHandler`.
- crhsent.com keeps its static `content/crhsent/robots.txt` and `sitemap.xml`.
- The AI-bot list is verbatim from affiliate `server.js:914-922` (P1-5: spec §5.6 cites `:848-856`).
- Supertest note (verified 2026-09-13 against corporate's installed superagent): an `application/xml` response is buffered into `res.text` as a string — both the static crhsent `sitemap.xml` (sent via `sendFile`) and a `res.type('application/xml').send(…)` body — so the assertions below compare `res.text` directly.

- [ ] **Step 1: Write the failing test.**

```js
'use strict';
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../server');
const { CORPORATE_ROOT } = require('../server/config/hosts');
const MARKETING = ['atxwashdryfold.com', 'rundberglaundry.com', 'runberglaundry.com', 'atxwashateria.com'];
const EXPECTED_ROBOTS = ['Amazonbot', 'Applebot-Extended', 'Bytespider', 'CCBot', 'ClaudeBot', 'CloudflareBrowserRenderingCrawler', 'Google-Extended', 'GPTBot', 'meta-externalagent']
  .map((b) => `User-agent: ${b}\nDisallow: /\n\n`).join('') + 'User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://atxwashdryfold.com/sitemap.xml\n';
const EXPECTED_SITEMAP = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  '  <url><loc>https://atxwashdryfold.com/</loc><lastmod>2026-09-12</lastmod><priority>1.0</priority></url>\n' +
  '  <url><loc>https://atxwashdryfold.com/affiliate</loc><lastmod>2026-09-12</lastmod><priority>0.8</priority></url>\n</urlset>\n';

describe.each(MARKETING)('SEO files on %s', (h) => {
  test('robots.txt: exact body, text/plain, 1h, no Content-Signal, no cookie', async () => {
    const res = await request(app).get('/robots.txt').set('Host', h);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(res.text).toBe(EXPECTED_ROBOTS);
    expect(res.text).not.toMatch(/Content-Signal/i);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
  test('sitemap.xml: exactly the two canonical locs', async () => {
    const res = await request(app).get('/sitemap.xml').set('Host', h);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/xml/);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(res.text).toBe(EXPECTED_SITEMAP);
  });
});

test('crhsent.com robots.txt and sitemap.xml stay byte-equal to the static files', async () => {
  expect((await request(app).get('/robots.txt').set('Host', 'crhsent.com')).text).toBe(fs.readFileSync(path.join(CORPORATE_ROOT, 'robots.txt'), 'utf8'));
  expect((await request(app).get('/sitemap.xml').set('Host', 'crhsent.com')).text).toBe(fs.readFileSync(path.join(CORPORATE_ROOT, 'sitemap.xml'), 'utf8'));
});
```

- [ ] **Step 2: Run it.** `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/seoFiles.test.js`. Expected failures: every marketing `robots.txt` and `sitemap.xml` test with `Expected: 200 Received: 404`. The crhsent test already passes.

- [ ] **Step 3: Implement.**
  - In `server/config/hosts.js`, add `const MARKETING_LASTMOD = '2026-09-12'; // update in any PR that changes / or /affiliate` below `PORTAL_ORIGIN`, and add `MARKETING_LASTMOD` to `module.exports`.
  - Create `server/seoRoutes.js`:

```js
// Generated SEO files for the marketing hosts (spec §5.6). Identical on all four; every URL is
// the canonical https://atxwashdryfold.com. crhsent.com falls through to its static files.
// Host scoping goes through marketingOnly → hostKind → requestHost (R-3).
'use strict';
const express = require('express');
const { MARKETING_CANONICAL_ORIGIN, MARKETING_LASTMOD, marketingOnly } = require('./config/hosts');

// The nine AI-crawler blocks, verbatim from affiliate server.js:914-922. NO `Content-Signal:`
// line (Lighthouse "robots.txt is not valid" caps SEO at 92).
const AI_BOTS = ['Amazonbot', 'Applebot-Extended', 'Bytespider', 'CCBot', 'ClaudeBot', 'CloudflareBrowserRenderingCrawler', 'Google-Extended', 'GPTBot', 'meta-externalagent'];
const ROBOTS = AI_BOTS.map((b) => `User-agent: ${b}\nDisallow: /\n\n`).join('') +
  `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${MARKETING_CANONICAL_ORIGIN}/sitemap.xml\n`;
const SITEMAP = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  `  <url><loc>${MARKETING_CANONICAL_ORIGIN}/</loc><lastmod>${MARKETING_LASTMOD}</lastmod><priority>1.0</priority></url>\n` +
  `  <url><loc>${MARKETING_CANONICAL_ORIGIN}/affiliate</loc><lastmod>${MARKETING_LASTMOD}</lastmod><priority>0.8</priority></url>\n</urlset>\n`;

const router = express.Router();
router.get('/robots.txt', marketingOnly((req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.type('text/plain').send(ROBOTS);
}));
router.get('/sitemap.xml', marketingOnly((req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.type('application/xml').send(SITEMAP);
}));

module.exports = router;
```

  - In `server.js`, add `const seoRoutes = require('./server/seoRoutes');` under the `webCoreAssets` require, and insert directly before `app.use(contentHandler());`:

```js
// Per-host SEO files (§5.2 step 17): marketing generated; crhsent keeps its static files.
app.use(seoRoutes);
```

- [ ] **Step 4: Run the suite and lint.** `npm test 2>&1 | grep -E '^Tests:' | grep -vc failed; npm run lint`. Expected: `1`, lint clean.

- [ ] **Step 5: Commit.**

```bash
git add server/seoRoutes.js server/config/hosts.js server.js tests/seoFiles.test.js && git commit -m "feat(seo): canonical robots.txt + sitemap.xml on the marketing hosts (A5)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 41: `/.well-known/security.txt` (all content hosts, exempt from the crhsent gate) + marketing `/favicon.ico` (A5)

**Files:**
- Modify: `server/seoRoutes.js`
- Modify: `server/middleware/accessGate.js` (`isExempt`: the line `p === '/robots.txt' || p === '/sitemap.xml' ||`)
- Test: `tests/seoFiles.test.js` (append), `tests/accessGate.test.js` (insert)

**Interfaces:**
- Consumes: `requestHost`, `hostKind`, `MARKETING_ROOT`, `marketingOnly` (all Host-only, R-3); P-15 proof (Step 0).
- Produces:
  - Per-host `security.txt` (`text/plain`, `public, max-age=3600`). Marketing hosts get the `Policy: https://portal.atxwashdryfold.com/privacy-policy` line (D3a); crhsent.com gets no Policy line (it has none today).
  - accessGate `isExempt('/.well-known/security.txt') === true` (R-11), so crhsent.com answers 200 while the gate is enforcing.
  - Marketing `/favicon.ico` → `favicon-32x32.png` as `image/png`, `public, max-age=86400`, 715 B. crhsent is unchanged (`content/crhsent/index.html:11` links `/assets/img/favicon.svg`).
- Not asserted here (moved to the Phase 0a on-box matrix): §5.12 "`Policy:` byte-equal to the portal file's `Policy:` line" and "that URL returns 200". The value above is the §5.6 / §6.9 target; the portal's own file (`public/.well-known/security.txt:8`) still reads `Policy: https://portal.atxwashdryfold.com/privacy-policy.html` until §6.9 lands.

- [ ] **Step 0 (HUMAN-CONFIRM, read-only): prove P-15 before A5 is written.** Run from the operator workstation (the Mailcow host `158.62.198.7` is reached as `sudo ssh wavemax-promo`, R-13). `$DBUSER`, `$DBPASS` and `$DBNAME` sit inside the single quotes on purpose: they are read from `mailcow.conf` on the mail host (the same form as GATE Task 72 Step 10), so the password never reaches the workstation.

```bash
sudo ssh wavemax-promo 'cd /opt/mailcow-dockerized && set -a && . ./mailcow.conf && set +a && docker compose exec -T mysql-mailcow mysql -u"$DBUSER" -p"$DBPASS" "$DBNAME" -N -e "select address,goto from alias where address=\"security@crhsent.com\"" 2>/dev/null'
```

Expected: exactly one row, `security@crhsent.com	admin@crhsent.com`. If there is no row, the owner has declined or not yet created the alias; per spec §9 P-15, every `Contact: mailto:security@crhsent.com` in Steps 1 and 3 of this task becomes `Contact: mailto:admin@crhsent.com` (two occurrences: the test helper and the implementation), in the same commit. **Rollback:** none (read-only).

- [ ] **Step 1: Append the failing tests.**
  - Append to `tests/seoFiles.test.js`:

```js
const accessGate = require('../server/middleware/accessGate');
const securityTxt = (host, policy) => `# RFC 9116 — Security Disclosure Policy for ${host}\n# Operated by CRHS Enterprises, LLC.\n\n` +
  `Contact: mailto:security@crhsent.com\nExpires: 2027-05-20T00:00:00.000Z\nPreferred-Languages: en\nCanonical: https://${host}/.well-known/security.txt\n` +
  (policy ? 'Policy: https://portal.atxwashdryfold.com/privacy-policy\n' : '') +
  '\n# Please report security vulnerabilities responsibly via email above.\n# Acknowledgement within 5 business days. No bug-bounty program at this\n# time; we will document credit in the disclosure response if requested.\n';

describe('security.txt + favicon', () => {
  test.each(MARKETING)('%s security.txt: exact body, Canonical = request host, no franchise/wavemax', async (h) => {
    const res = await request(app).get('/.well-known/security.txt').set('Host', `www.${h}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.text).toBe(securityTxt(h, true));
    expect(res.text).not.toMatch(/franchis|wavemax/i);
  });
  test('crhsent.com security.txt has no Policy line', async () => {
    const res = await request(app).get('/.well-known/security.txt').set('Host', 'crhsent.com');
    expect(res.status).toBe(200); expect(res.text).toBe(securityTxt('crhsent.com', false));
  });
  test('crhsent.com security.txt answers 200 while the access gate is enforcing (R-11)', async () => {
    accessGate._cache.enabled = true; accessGate._cache.ips = new Map();
    try {
      const res = await request(app).get('/.well-known/security.txt').set('Host', 'crhsent.com').set('CF-Connecting-IP', '198.51.100.24');
      expect(res.status).toBe(200); expect(res.text).toBe(securityTxt('crhsent.com', false));
    } finally { accessGate._cache.enabled = false; accessGate._cache.ips = new Map(); }
  });
  test.each(MARKETING)('%s /favicon.ico → image/png 715 B, 1 day', async (h) => {
    const res = await request(app).get('/favicon.ico').set('Host', h);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    expect(res.body.length).toBe(715);
  });
});
```

  - In `tests/accessGate.test.js`, directly after the test `it('lets the public CRHS corporate routes + assets + SEO files through even when gated', …)`, insert:

```js
  it('lets /.well-known/security.txt through when gated (RFC 9116 must answer 200, spec §5.6, R-11)', async () => {
    const req = mkReq({ ip: '8.8.8.8', path: '/.well-known/security.txt', originalUrl: '/.well-known/security.txt', headers: { host: 'crhsent.com' } });
    const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalledWith(401);
  });
```

- [ ] **Step 2: Run them.** `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/seoFiles.test.js tests/accessGate.test.js -t 'security.txt|favicon'`. Expected failures:
  - each marketing `security.txt` and `crhsent.com security.txt has no Policy line`: `Expected: 200 Received: 404`
  - `crhsent.com security.txt answers 200 while the access gate is enforcing`: `Expected: 200 Received: 401`
  - each `/favicon.ico`: `Expected: 200 Received: 404`
  - accessGate `lets /.well-known/security.txt through when gated`: `Expected number of calls: 1 Received number of calls: 0`

- [ ] **Step 3: Implement.**
  - In `server/middleware/accessGate.js` `isExempt`, replace the line `p === '/robots.txt' || p === '/sitemap.xml' ||` with `p === '/robots.txt' || p === '/sitemap.xml' || p === '/.well-known/security.txt' ||`.
  - In `server/seoRoutes.js`, change the hosts require to `const { MARKETING_CANONICAL_ORIGIN, MARKETING_LASTMOD, MARKETING_ROOT, marketingOnly, requestHost, hostKind } = require('./config/hosts');` and add `const path = require('path');` above it.
  - Insert before `module.exports`:

```js
// RFC 9116. The franchise-licence line in the portal's public/.well-known/security.txt:2 is NOT
// carried. Body host = requestHost (apex, Host header only); unknown hosts never reach here
// (rejectUnknownHost), and the kind check below is defence in depth.
function securityTxt(host, withPolicy) {
  return `# RFC 9116 — Security Disclosure Policy for ${host}\n# Operated by CRHS Enterprises, LLC.\n\n` +
    `Contact: mailto:security@crhsent.com\nExpires: 2027-05-20T00:00:00.000Z\nPreferred-Languages: en\nCanonical: https://${host}/.well-known/security.txt\n` +
    (withPolicy ? 'Policy: https://portal.atxwashdryfold.com/privacy-policy\n' : '') +
    '\n# Please report security vulnerabilities responsibly via email above.\n# Acknowledgement within 5 business days. No bug-bounty program at this\n# time; we will document credit in the disclosure response if requested.\n';
}
router.get('/.well-known/security.txt', (req, res, next) => {
  const kind = hostKind(req);
  if (kind === 'unknown') return next();
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.type('text/plain').send(securityTxt(requestHost(req), kind === 'marketing'));
});
router.get('/favicon.ico', marketingOnly((req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.type('image/png').sendFile(path.join(MARKETING_ROOT, 'assets', 'images', 'brand', 'favicon-32x32.png'), (err) => { if (err) next(err); });
}));
```

- [ ] **Step 4: Run the suite and lint.** `npm test 2>&1 | grep -E '^Tests:' | grep -vc failed; npm run lint`. Expected: `1`, lint clean.

- [ ] **Step 5: Commit.**

```bash
git add server/seoRoutes.js server/middleware/accessGate.js tests/seoFiles.test.js tests/accessGate.test.js && git commit -m "feat(seo): per-host security.txt (no franchise line, gate-exempt on crhsent.com) + marketing favicon.ico (A5, R-11)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 42: Slice exit — full suite, lint, cycles, host-derivation guard, crhsent byte check, local dark smoke, push

**Files:**
- None created or modified.

**Interfaces:**
- Consumes: Tasks 20-41.
- Produces: pushed corporate `main` at the A5 SHA, which the GATE slice's Phase 0a deploy consumes.

- [ ] **Step 1: Full gate.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npm test 2>&1 | grep -E '^Tests:' | grep -vc failed; npm run lint && npm run check:i18n && npx madge --circular server/ && npx jest tests/hostDerivation.test.js 2>&1 | grep -E '^(PASS|FAIL)'
```

Expected: `1` (suite green; Plan 1's 4 `crhsent-parity` failures are gone), lint clean, `i18n parity OK: 110 keys × 4 locales`, `No circular dependency found!`, `PASS tests/hostDerivation.test.js`.

- [ ] **Step 2: crhsent.com is still byte-unchanged** apart from the intentional changes, none of which the baseline records: the `crhsent.sid` cookie (Set-Cookie is excluded), the new `/.well-known/security.txt` (not requested), and its accessGate exemption (affects only that path).

```bash
node ~/crhs-cutover-baselines/crhsent-baseline.js "$PWD" > ~/crhs-cutover-baselines/a1/local/after-A5.json && diff ~/crhs-cutover-baselines/a1/local/before.json ~/crhs-cutover-baselines/a1/local/after-A5.json && echo IDENTICAL
```

Expected: `IDENTICAL`.

- [ ] **Step 3: Local dark smoke of the four marketing hosts, crhsent.com's spoof cases, and the portal host** through the composed app.

```bash
NODE_ENV=test SESSION_SECRET=x node -e "
const request=require('supertest');const app=require('./server');
(async()=>{for(const h of ['rundberglaundry.com','runberglaundry.com','atxwashateria.com','atxwashdryfold.com']){
 const rows=[];for(const p of ['/','/affiliate','/robots.txt','/sitemap.xml','/.well-known/security.txt','/favicon.ico','/assets/images/brand/logo.png','/assets/images/brand/logo-wavemax.png','/locales/de/common.json','/assets/js/i18n.js','/health']){const r=await request(app).get(p).set('Host',h);rows.push(p+'='+r.status+(r.headers['set-cookie']?'+COOKIE':''));}
 console.log(h, rows.join(' '));}
 console.log('portal', (await request(app).get('/').set('Host','portal.atxwashdryfold.com')).status);
 console.log('crhsent-security', (await request(app).get('/.well-known/security.txt').set('Host','crhsent.com')).status);
 console.log('xfh-marketing-into-crhsent', (await request(app).get('/').set('Host','other.com').set('X-Forwarded-Host','crhsent.com')).status);
 process.exit(0);})();"
```

Expected, per marketing host: `/=200 /affiliate=200 /robots.txt=200 /sitemap.xml=200 /.well-known/security.txt=200 /favicon.ico=200 /assets/images/brand/logo.png=200 /assets/images/brand/logo-wavemax.png=410 /locales/de/common.json=200 /assets/js/i18n.js=200 /health=200`, with no `+COOKIE` anywhere; then `portal 404`, `crhsent-security 200`, `xfh-marketing-into-crhsent 404`.

- [ ] **Step 4: Push** (no production effect; boxes change only at the Phase 0a deploy).

```bash
git push origin main && git rev-parse HEAD
```

Record the SHA for the GATE slice. The Phase 0a deploy must use the Plan 1 sequence (Global Constraints 16-17):
  - `rm -rf node_modules/@crhs/web-core`, then `npm install --install-links`, then verify `0.2.1`, `26` keys, `Object.keys(require('@crhs/web-core').csrf)` includes `createCsrf`, and the mongoose resolution-path identity.
  - Any boot probe ends with `process.exit(0)`.
  - Log evidence reads `/var/www/crhs-corporate/logs/combined.log` filtered to timestamps after the reload (boot marker `crhs-corporate listening on 3001`, ≥ 2 lines; new lines carry `"service":"crhs-corporate"`), never `pm2 logs crhs-corporate` and never a count of `Access gate cache loaded`.
  - Session isolation is proven by zero `Set-Cookie` on every marketing-host response (R-9); the `sessions_corporate` count is informational.
  - The two R-3 spoof requests (`GET /wavemax/` and `GET /README.md` with `Host: crhsent.com` + `X-Forwarded-Host: rundberglaundry.com` from a non-whitelisted IP) are probed on both boxes by GATE Task 77: expected mediator prompt / 401, never 200 content.

---

## Part 3 — Corporate A6–A9 + B-3: legacy redirects, store-IP redirect, intake endpoints, host-aware CSP, gate mail, marquee rail

> **Slice A69: corporate PRs A6–A9 (spec §5.7–§5.11, §5.13).** All work is in `/mnt/c/Users/rickh/GitHub/crhs-corporate` unless a path says otherwise. Run tests with `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npm test -- <file>`. Branches: `plan2/a6-legacy-redirects` (Tasks 45, 46, 48), `plan2/a6-d5-wavemax-affiliate` (Task 47 only), `plan2/a7-intake` (Tasks 49–55), `plan2/a8-csp` (Task 56), `plan2/a9-mail-hygiene` (Tasks 57–59).
>
> **This slice touches no box (ruling R-1).** The GATE slice owns the whole Phase-0a deploy for these PRs: the production corporate `.env` key list, delivering the code, `pm2 reload`, the per-box on-box verification of B7, the store-IP 302, CSP, intake mail and `ratelimit_corp_*`, and the R-24 gate-link mail check. Earlier drafts of this slice had Tasks 60 and 61 for that work; both are deleted, and their corrected full text was handed to the GATE slice.
>
> **Line numbers and anchors.** Line numbers were read on 2026-09-13 at corporate `8133667`, before A1–A5. Slice A15 (Tasks 20–42) rewrites `server.js` and moves `content/` → `content/crhsent/`. Every edit below is therefore anchored BY CONTENT to a line that A15 creates. After A15, the expected `server.js` order is:
> 1. `app.use(wc.cspNonce);`
> 2. `app.use(wc.securityHeadersMiddleware());`
> 3. `app.use(resolveHost);`
> 4. the inline CSP block (`// Manual, nonce-based CSP.` … `DEMO_FRAME_SRC` …)
> 5. `app.get('/health', …)`
> 6. `app.use(rejectUnknownHost);`
> 7. `cookieParser` / `express.json` / `express.urlencoded`
> 8. `app.use(corporateOnly(cors(wc.corsConfig)));`
> 9. `app.use(corporateOnly(sessionMiddleware));`
> 10. sanitize
> 11. `app.use('/api/', corporateOnly(wc.rateLimiting.apiLimiter));`
> 12. `app.use(corporateOnly(accessGate));`
> 13. `app.use(corporateOnly(mediatorGate));`
> 14. `app.use(seoRoutes);`
> 15. `app.use(contentHandler());`
> 16. `app.use(webCoreAssets);`
> 17. the error handler
>
> If an anchor line quoted in a step is not in the file, STOP, re-read `server.js`, and locate it by content.
>
> **Host derivation (R-3, Global Constraint 20).** Every middleware this slice creates decides the host through A15's `server/config/hosts.js`. It uses either `hostKind(req)`, which calls `requestHost(req)` and so reads the `Host` header only with `www.` and `:port` stripped, or the `marketingOnly`/`corporateOnly` wrappers built on it. The middlewares are `marketingApiNotFound`, `legacyPortalRedirects`, `retiredRecruitmentRedirect`, `storeIpPortalRedirect`, `hostAwareCsp` and the intake routes' scoping. None of them reads `req.hostname` or `x-forwarded-host`. Every new suite carries an `X-Forwarded-Host` spoof case. Task 57 builds the gate mail's link and logo host from `requestHost` validated against `CORPORATE_HOST`.
>
> **Plan 1 wins (this slice follows Plan 1):**
> - **P1-a. Limiter line numbers.** Core's contact limiters sit at `crhs-web-core/src/middleware/rateLimiting.js:214-230` (`contactFormBurstLimiter`) and `:237-254` (`contactFormLimiter`), at v0.2.0 commit `2dcd6ff`. Spec §5.5 says `:190-206`/`:213-230`. Plan 1 Task 41 inserted the comment block `:203-213` above them, which moved them.
> - **P1-b. Core still ships the contact limiters.** Spec §5.13 (A7) says the policy unit test "asserts `wc.rateLimiting.contactFormBurstLimiter === undefined`". Against the installed core that assertion stays red until Plan 4 PR B7, because core keeps both limiters until then (see the comment at `rateLimiting.js:203-213`; §5.5 itself says "before D17b deletes them"). Per R-12, Task 49 asserts against corporate's own policy module and against a simulated post-B7 core, and adds a source scan showing nothing in corporate `server/` names core's limiters.
> - **P1-c. Demo frame origins.** Plan 1 shipped corporate `DEMO_FRAME_SRC` with **three** origins (`https://www.wavemaxlaundry.com`, `https://wavemaxlaundry.com`, `https://rundberglaundry.com`), pinned by `tests/csp.integration.test.js`. Spec §5.9 lists two. Task 56 keeps three (R-12).
> - **P1-d. `CORS_ORIGIN`.** Spec §5.11 writes `CORS_ORIGIN=https://crhsent.com`. Ruling R-2 overrides it: corporate has NO `CORS_ORIGIN`. web-core `src/security/corsConfig.js:11` defines `parseList = (value) => (value || '')…`, so an empty or unset value yields `[]`, which admits nothing. Task 59 documents the key as intentionally absent and explains why. Deleting the production line is GATE work.
> - **P1-e. Spec §9.2 affiliate-application smoke body.** The spec body has no `message` field. The validator ported verbatim in Task 53 (affiliate `server/routes/affiliateApplicationRoutes.js:53-58`, required since `6acbf550` on 2026-09-11, finding F-3) requires `message` with at least 80 characters, so the spec body would return 400. Any valid on-box POST must add an 80+ character `message`. That POST is GATE work.
> - **P1-f. No `pm2 logs` evidence.** Spec §5.12's acceptance line "`pm2 logs crhs-corporate` shows exactly one `Access gate cache loaded` line per worker" is not used anywhere. See R-4 and Global Constraint 17.
> - **P1-g. `CORPORATE_SITE_URL`.** Spec §5.11 lists it as "unchanged". Finding F-2 wins: it has 0 code references and is franchisor litigation residue, so it is deleted from production in Phase 0a. Task 59 drops it from `.env.example`.
>
> **Declared deviations from the spec:**
> - **D5.** Spec §5.7 and §5.12 put `/wavemax-affiliate` inside `legacyPortalRedirects`. D5 requires a PR that is built but not merged, so this slice puts the rule in its own `server/middleware/retiredRecruitmentRedirect.js` and `tests/wavemaxAffiliateRedirect.test.js` (Task 47). PR A6 can then merge without counsel's go, and the gate row stays PENDING COUNSEL (R-12).
> - **Mail From (R-6).** Spec §5.10 makes `GATE_FROM` a full From override, and §5.12 asserts `tests/accessGate.test.js:204` against that literal. R-6 rules instead that gate and intake mail pass `{ displayName }`. web-core v0.2.1 then composes `"<name>" <EMAIL_FROM || EMAIL_USER>`, with the name resolved as `fromName` > `EMAIL_FROM_NAME` > `displayName`. The literals `"CRHS Enterprises" <no-reply@crhsent.com>` and `"WaveMAX Austin" <no-reply@crhsent.com>` are asserted through the REAL web-core transport with nodemailer mocked (Tasks 53 and 57), not against a mocked `sendEmail`'s arguments.
> - **`content/README.md`.** A1 (A15 Task 22) moved the tracked `content/README.md` to `content/crhsent/README.md`. Task 59 edits that file, so the crhsent manifest stays at 49 files.
> - **`/owners/` bytes change.** Task 57's `alt` edit modifies `content/crhsent/owners/index.html`. `/owners/` is one of the ten crhsent paths in A15 Task 20's byte baseline. After A9 that path differs from the baseline by exactly `alt="WaveMAX Laundry"` → `alt="WaveMAX Austin"`, which spec §5.10 requires. Every other baseline path is unchanged.
>
> **Web-core v0.2.1 prerequisite.** These exist only in v0.2.1:
> - `sendEmail(to, subject, html, fromOverride, { replyTo, fromName, displayName })` (B3g-1)
> - `fillTemplate(template, data, brand)` (B3g-2)
> - `validateMailConfig({ templateRoot })` (B3j)
>
> A15 Task 20 Step 0 refuses to start without the `v0.2.1` tag. P0 Task 9 installs it locally and records `"version": "0.2.1"` in `package-lock.json`; A15 Task 39 Step 1 verifies it. Task 51 re-verifies that and pins the seam this slice relies on.

---

### Task 45: Marketing-host `/api/*` catch-all → 404 JSON (§5.2 step 14)

**Files:**
- Create `server/middleware/marketingApiNotFound.js`
- Create `tests/marketingApiNotFound.test.js`
- Modify `server.js`: the hosts `require` line, and one new line after `app.use('/api/', corporateOnly(wc.rateLimiting.apiLimiter));`

**Interfaces:**
- Consumes `marketingOnly(mw) → (req,res,next)` from `server/config/hosts.js` (A15 Task 28). It reads `req.crhsHost.kind` and falls back to `hostKind(req)`, which in turn uses `requestHost(req)`.
- Produces `marketingApiNotFound(req, res)`, which answers `404` with the JSON `{ success: false, message: 'Not found' }`. It is mounted as `app.use('/api', marketingOnly(marketingApiNotFound));`. Task 53 mounts the intake router on the line directly ABOVE this one.

- [ ] 1. `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && git switch main && git pull --ff-only && git switch -c plan2/a6-legacy-redirects`
- [ ] 2. Write the failing test `tests/marketingApiNotFound.test.js`:
```js
const request = require('supertest');
const app = require('../server');
const MARKETING = ['atxwashdryfold.com', 'rundberglaundry.com', 'runberglaundry.com', 'atxwashateria.com'];

describe('marketing hosts: unclaimed /api/* → 404 JSON (§5.2 step 14)', () => {
  test.each(MARKETING)('%s GET /api/anything → 404 JSON, no cookie', async (host) => {
    const res = await request(app).get('/api/anything').set('Host', host);
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ success: false, message: 'Not found' });
    expect(res.headers['set-cookie']).toBeUndefined();
  });
  test.each(MARKETING)('%s POST /api/v1/customers/register → 404 JSON, never a redirect', async (host) => {
    const res = await request(app).post('/api/v1/customers/register').set('Host', host).send({});
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Not found' });
    expect(res.headers.location).toBeUndefined();
  });
});

test('spoof (R-3): Host crhsent.com + X-Forwarded-Host atxwashdryfold.com never gets the marketing JSON', async () => {
  const res = await request(app).get('/api/anything').set('Host', 'crhsent.com').set('X-Forwarded-Host', 'atxwashdryfold.com');
  expect(res.body).not.toEqual({ success: false, message: 'Not found' });
});
```
- [ ] 3. Run `npm test -- tests/marketingApiNotFound.test.js`. Expected: `Tests:       8 failed, 1 passed, 9 total`. Each failure is `expect(received).toMatch(expected)`, `Expected pattern: /application\/json/`, `Received string:  "text/html; charset=utf-8"`, because an unclaimed path falls through `contentHandler` to Express's HTML 404. The spoof case passes already; it is a guard.
- [ ] 4. Create `server/middleware/marketingApiNotFound.js`:
```js
'use strict';
// §5.2 step 14: any /api/* on a marketing host that no intake route claimed.
// Always 404 JSON — never a 301 (a POST 301 changes semantics), never proxied.
// Host scoping is done by the marketingOnly() wrapper in server.js, which
// derives the host from requestHost() (Host header only — R-3).
module.exports = function marketingApiNotFound(req, res) {
  return res.status(404).json({ success: false, message: 'Not found' });
};
```
- [ ] 5. Edit `server.js`:
  - Add `marketingOnly` to the hosts import:
```bash
sed -i "s|^const { resolveHost, rejectUnknownHost, corporateOnly } = require('./server/config/hosts');$|const { resolveHost, rejectUnknownHost, corporateOnly, marketingOnly } = require('./server/config/hosts');|" server.js
grep -c "marketingOnly } = require('./server/config/hosts');" server.js
```
  Expected: `1`. If it prints `0`, the A15 import line names other identifiers; add `marketingOnly` to that line by hand.
  - Add the require and the mount:
```bash
sed -i "/^const contentHandler = require('.\/server\/contentHandler');$/a const marketingApiNotFound = require('./server/middleware/marketingApiNotFound');" server.js
sed -i "/^app.use('\/api\/', corporateOnly(wc.rateLimiting.apiLimiter));$/a // §5.2 step 14 — marketing /api/* that no intake route claimed → 404 JSON.\napp.use('/api', marketingOnly(marketingApiNotFound));" server.js
grep -n "marketingApiNotFound\|corporateOnly(wc.rateLimiting.apiLimiter)\|corporateOnly(accessGate)" server.js
```
  Expected, in this order: the require line; then `app.use('/api/', corporateOnly(wc.rateLimiting.apiLimiter));`; then `app.use('/api', marketingOnly(marketingApiNotFound));`; then `app.use(corporateOnly(accessGate));`.
- [ ] 6. Run `npm test -- tests/marketingApiNotFound.test.js`. Expected PASS: `Tests:       9 passed, 9 total`. Then run `npm test 2>&1 | grep -E '^Tests:'`. The line must show no `failed` segment.
- [ ] 7. Commit:
```bash
git add server/middleware/marketingApiNotFound.js server.js tests/marketingApiNotFound.test.js
git commit -m "feat(api): marketing hosts answer unclaimed /api/* with 404 JSON (§5.2 step 14)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 46: B7 legacy app-path 301s → portal (§5.7, spec PR A6)

**Files:**
- Create `server/middleware/legacyPortalRedirects.js`
- Create `tests/legacyPortalRedirects.test.js`
- Modify `server.js`: one require and one mount line directly after `app.use(rejectUnknownHost);`

**Interfaces:**
- Consumes `PORTAL_ORIGIN = 'https://portal.atxwashdryfold.com'` and `hostKind(req) → 'corporate'|'marketing'|'unknown'` from `server/config/hosts.js` (A15 Task 21). `hostKind` uses `requestHost(req)`.
- Produces `legacyPortalRedirects(req, res, next)`, plus `.EXACT_PATHS: Set<string>`, `.PREFIXES: string[]` and `.isLegacyPortalPath(p): boolean`.

- [ ] 1. Write the failing test `tests/legacyPortalRedirects.test.js`:
```js
const request = require('supertest');
const app = require('../server');
const PORTAL = 'https://portal.atxwashdryfold.com';
const MARKETING = ['atxwashdryfold.com', 'rundberglaundry.com', 'runberglaundry.com', 'atxwashateria.com'];
const EXACT = ['/embed-app-v2.html', '/admin', '/admin/', '/operator', '/operator/', '/operator-scan-embed.html',
  '/scanbag', '/scanbag/', '/scanbag-manifest.json', '/scanbag-sw.js', '/monitoring-dashboard.html'];
const BAG = '0123456789abcdef0123456789abcdef';

describe.each(MARKETING)('B7 legacy portal 301s on Host %s (§5.7)', (host) => {
  test.each(EXACT)('GET %s → 301 portal + originalUrl', async (p) => {
    const res = await request(app).get(p).set('Host', host);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(PORTAL + p);
  });
  test.each(EXACT)('HEAD %s → 301 portal + originalUrl', async (p) => {
    const res = await request(app).head(p).set('Host', host);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(PORTAL + p);
  });
  test('bag-label QR query is byte-preserved', async () => {
    const url = `/embed-app-v2.html?route=/claim&bag=${BAG}`;
    const res = await request(app).get(url).set('Host', host);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(`${PORTAL}/embed-app-v2.html?route=/claim&bag=${BAG}`);
  });
  test('expediter k= query is byte-preserved', async () => {
    const res = await request(app).get('/embed-app-v2.html?route=/order-expediter&k=abc').set('Host', host);
    expect(res.headers.location).toBe(`${PORTAL}/embed-app-v2.html?route=/order-expediter&k=abc`);
  });
  test('verify-email prefix → 301 (GET and HEAD)', async () => {
    for (const verb of ['get', 'head']) {
      const res = await request(app)[verb]('/api/v1/customers/verify-email/tok').set('Host', host);
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe(`${PORTAL}/api/v1/customers/verify-email/tok`);
    }
  });
  test('/api/v1/customers/other → 404 JSON, not 301', async () => {
    const res = await request(app).get('/api/v1/customers/other').set('Host', host);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Not found' });
  });
  test('POST /embed-app-v2.html is not redirected', async () => {
    const res = await request(app).post('/embed-app-v2.html').set('Host', host);
    expect(res.status).not.toBe(301);
    expect(res.headers.location).toBeUndefined();
  });
  test.each(['/assets/x.css', '/locales/en/common.json'])('%s is never redirected', async (p) => {
    const res = await request(app).get(p).set('Host', host);
    expect(res.status).not.toBe(301);
  });
  test('www. variant of the host is also redirected (Global Constraint 5: 4 apex + 4 www)', async () => {
    const res = await request(app).get('/admin').set('Host', `www.${host}`);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(`${PORTAL}/admin`);
  });
});

describe('B7 never fires off the marketing hosts', () => {
  test.each(EXACT)('Host crhsent.com GET %s is not 301', async (p) => {
    const res = await request(app).get(p).set('Host', 'crhsent.com');
    expect(res.status).not.toBe(301);
  });
  test('Host portal.atxwashdryfold.com (unknown to this app) → 404, not 301', async () => {
    const res = await request(app).get('/admin').set('Host', 'portal.atxwashdryfold.com');
    expect(res.status).toBe(404);
  });
});

describe('B7 host is the Host header only (R-3)', () => {
  test('Host crhsent.com + X-Forwarded-Host atxwashdryfold.com → not 301', async () => {
    const res = await request(app).get('/admin').set('Host', 'crhsent.com').set('X-Forwarded-Host', 'atxwashdryfold.com');
    expect(res.status).not.toBe(301);
  });
  test('Host atxwashdryfold.com + X-Forwarded-Host crhsent.com → 301', async () => {
    const res = await request(app).get('/admin').set('Host', 'atxwashdryfold.com').set('X-Forwarded-Host', 'crhsent.com');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(`${PORTAL}/admin`);
  });
});
```
  The test count is 134:
  - Per marketing host: 11 GET + 11 HEAD + bag + k + verify-email + customers/other + POST + 2 asset paths + www = 30.
  - Four marketing hosts: 4 × 30 = 120.
  - Off-marketing: 11 crhsent + 1 portal = 12.
  - Spoof: 2.
  - Total: 120 + 12 + 2 = 134.
- [ ] 2. Run `npm test -- tests/legacyPortalRedirects.test.js`. Expected: `Tests:       105 failed, 29 passed, 134 total`. The typical failure is `expect(received).toBe(expected)` with `Expected: 301` and `Received: 404`.
  - The 105 failures are 4 × (11 GET + 11 HEAD + bag + k + verify-email + www) = 104, plus the marketing spoof case.
  - The 29 that pass already are 11 crhsent + 1 portal + 4 customers/other (Task 45) + 4 POST + 8 asset + 1 crhsent spoof.
- [ ] 3. Create `server/middleware/legacyPortalRedirects.js`:
```js
'use strict';
// §5.7 (B7): old portal app paths requested on a marketing host 301 to the
// portal with req.originalUrl byte-preserved (printed bag labels carry
// ?route=/claim&bag=<32hex>; the expediter display carries ?k=<token>).
// GET/HEAD only, marketing hosts only (apex and www.). Never a blanket /api,
// /assets or /locales redirect. Mirrors the affiliate precedent
// res.redirect(301, 'https://portal.atxwashdryfold.com' + req.originalUrl).
// Host comes from hostKind() → requestHost(): the Host header only (R-3).
// This app has no request logger; if one is added it must redact [?&](t|k|bag)=.
const { PORTAL_ORIGIN, hostKind } = require('../config/hosts');

const EXACT_PATHS = new Set([
  '/embed-app-v2.html', '/admin', '/admin/', '/operator', '/operator/', '/operator-scan-embed.html',
  '/scanbag', '/scanbag/', '/scanbag-manifest.json', '/scanbag-sw.js', '/monitoring-dashboard.html'
]);
const PREFIXES = ['/api/v1/customers/verify-email/'];

function isLegacyPortalPath(p) {
  return EXACT_PATHS.has(p) || PREFIXES.some((prefix) => p.startsWith(prefix));
}

function legacyPortalRedirects(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (hostKind(req) !== 'marketing') return next();
  if (!isLegacyPortalPath(req.path)) return next();
  return res.redirect(301, PORTAL_ORIGIN + req.originalUrl);
}

module.exports = legacyPortalRedirects;
module.exports.EXACT_PATHS = EXACT_PATHS;
module.exports.PREFIXES = PREFIXES;
module.exports.isLegacyPortalPath = isLegacyPortalPath;
```
- [ ] 4. Edit `server.js`. §5.2 step 7 places B7 after `/health`; A1 put `app.use(rejectUnknownHost);` on the line directly after the `/health` block, so B7 goes directly after that line. This does not anchor on `cookieParser`, whose position A2 changed.
```bash
sed -i "/^const contentHandler = require('.\/server\/contentHandler');$/a const legacyPortalRedirects = require('./server/middleware/legacyPortalRedirects');" server.js
sed -i "/^app.use(rejectUnknownHost);$/a // §5.2 step 7 — B7 legacy portal paths (marketing hosts, GET/HEAD) → 301 portal.\napp.use(legacyPortalRedirects);" server.js
grep -n "app.get('/health'\|app.use(rejectUnknownHost);\|app.use(legacyPortalRedirects);\|app.use(cookieParser());" server.js
```
  Expected, in this order: `app.get('/health'`, then `app.use(rejectUnknownHost);`, then `app.use(legacyPortalRedirects);`, then `app.use(cookieParser());`.
- [ ] 5. Run `npm test -- tests/legacyPortalRedirects.test.js`. Expected PASS: `Tests:       134 passed, 134 total`. Then run `npm test 2>&1 | grep -E '^Tests:'`, which must show no `failed` segment.
- [ ] 6. Commit:
```bash
git add server/middleware/legacyPortalRedirects.js server.js tests/legacyPortalRedirects.test.js
git commit -m "feat(redirects): B7 legacy portal paths 301 to the portal on marketing hosts (§5.7)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 47: `/wavemax-affiliate` → 301 `/affiliate` (D5, PENDING COUNSEL, separate PR)

**Files:**
- Create `server/middleware/retiredRecruitmentRedirect.js`
- Create `tests/wavemaxAffiliateRedirect.test.js`
- Modify `server.js`: one require and one mount line directly after `app.use(legacyPortalRedirects);`

**Interfaces:**
- Consumes `hostKind(req)` from `server/config/hosts.js`.
- Produces `retiredRecruitmentRedirect(req, res, next)`, mounted directly after `legacyPortalRedirects` and before `storeIpPortalRedirect`.

D5 is binding. This PR is built and reviewed, but **it merges only on counsel's (Miguel) go**. Until then the Phase-0a gate row "D5 redirect" is recorded as `PENDING COUNSEL` (non-blocking, R-12), not FAIL. This is a declared deviation from §5.7/§5.12, which put the rule inside `legacyPortalRedirects`; see the slice preamble.

- [ ] 1. Start this task after PR A6 (Tasks 45, 46, 48) is merged, so that `app.use(legacyPortalRedirects);` and `app.use(storeIpPortalRedirect);` both exist on `main`: `git switch main && git pull --ff-only && git switch -c plan2/a6-d5-wavemax-affiliate`
- [ ] 2. Write the failing test `tests/wavemaxAffiliateRedirect.test.js`:
```js
const request = require('supertest');
const app = require('../server');
const MARKETING = ['atxwashdryfold.com', 'rundberglaundry.com', 'runberglaundry.com', 'atxwashateria.com'];

describe.each(MARKETING)('D5 /wavemax-affiliate on %s', (host) => {
  test('GET with query → 301 /affiliate + original query', async () => {
    const res = await request(app).get('/wavemax-affiliate?utm=1').set('Host', host);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/affiliate?utm=1');
  });
  test('trailing slash + HEAD → 301 /affiliate', async () => {
    const res = await request(app).head('/wavemax-affiliate/').set('Host', host);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/affiliate');
  });
  test('POST is not redirected', async () => {
    const res = await request(app).post('/wavemax-affiliate').set('Host', host);
    expect(res.status).not.toBe(301);
  });
});
test('crhsent.com is never redirected, even with X-Forwarded-Host set to a marketing host (R-3)', async () => {
  const res = await request(app).get('/wavemax-affiliate').set('Host', 'crhsent.com').set('X-Forwarded-Host', 'rundberglaundry.com');
  expect(res.status).not.toBe(301);
});
```
- [ ] 3. Run `npm test -- tests/wavemaxAffiliateRedirect.test.js`. Expected: `Tests:       8 failed, 5 passed, 13 total`. The failures are `Expected: 301` / `Received: 404`. The four POST cases and the crhsent case pass already.
- [ ] 4. Create `server/middleware/retiredRecruitmentRedirect.js`:
```js
'use strict';
// D5 (PENDING COUNSEL): the retired /wavemax-affiliate recruitment page 301s to
// /affiliate on the SAME marketing host, query preserved. Permanent — printed
// flyers/QRs may encode the URL. Host from hostKind() → requestHost() (R-3).
const { hostKind } = require('../config/hosts');

const RETIRED_PATHS = new Set(['/wavemax-affiliate', '/wavemax-affiliate/']);

module.exports = function retiredRecruitmentRedirect(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (hostKind(req) !== 'marketing') return next();
  if (!RETIRED_PATHS.has(req.path)) return next();
  const q = req.originalUrl.indexOf('?');
  return res.redirect(301, `/affiliate${q === -1 ? '' : req.originalUrl.slice(q)}`);
};
```
- [ ] 5. Edit `server.js`:
```bash
sed -i "/^const legacyPortalRedirects = require('.\/server\/middleware\/legacyPortalRedirects');$/a const retiredRecruitmentRedirect = require('./server/middleware/retiredRecruitmentRedirect');" server.js
sed -i "/^app.use(legacyPortalRedirects);$/a // D5 (PENDING COUNSEL) — retired recruitment page → /affiliate on the same host.\napp.use(retiredRecruitmentRedirect);" server.js
grep -n "app.use(legacyPortalRedirects);\|app.use(retiredRecruitmentRedirect);\|app.use(storeIpPortalRedirect);" server.js
```
  Expected, in this order: `legacyPortalRedirects`, `retiredRecruitmentRedirect`, `storeIpPortalRedirect`.
- [ ] 6. Run `npm test -- tests/wavemaxAffiliateRedirect.test.js`. Expected PASS: `Tests:       13 passed, 13 total`. Then run `npm test 2>&1 | grep -E '^Tests:'`, which must show no `failed` segment.
- [ ] 7. Commit, push, and open the PR:
```bash
git add server/middleware/retiredRecruitmentRedirect.js server.js tests/wavemaxAffiliateRedirect.test.js
git commit -m "feat(redirects): /wavemax-affiliate 301s to /affiliate (D5 — merge on counsel's go only)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin plan2/a6-d5-wavemax-affiliate
gh pr create --base main --head plan2/a6-d5-wavemax-affiliate --title "A6-D5: /wavemax-affiliate → /affiliate (PENDING COUNSEL)" --body "PENDING COUNSEL (Miguel) — do not merge.

Spec D5 / §5.7. Separate file (retiredRecruitmentRedirect.js) so PR A6 merges independently.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

### Task 48: Store-IP → portal 302 (§5.8, D7)

**Files:**
- Create `server/middleware/storeIpPortalRedirect.js`
- Create `tests/storeIpRedirect.test.js`
- Modify `server.js`: one require and one mount line directly after `app.use(legacyPortalRedirects);`

**Interfaces:**
- Consumes:
  - `wc.ipGate.parseList(value): string[]` and `wc.ipGate.entryMatches(ip, entry): boolean` (`crhs-web-core/src/middleware/ipGate.js:16`, `:116`, exported at `:167`).
  - `wc.clientIp.clientIp(req): string` (`crhs-web-core/src/utils/clientIp.js:39`; `cf-connecting-ip` first).
  - `PORTAL_ORIGIN` and `hostKind(req)` from `server/config/hosts.js`.
  - Env `STORE_IP_ADDRESS`, `ADDITIONAL_STORE_IPS`, `STORE_IP_RANGES`, resolved per request.
- Produces `storeIpPortalRedirect(req, res, next)` and `.storeEntries(): string[]`.

D7 reconciliation: this does NOT resurrect `storeIPs.js`, which web-core deleted in B3i-2. It parses the three keys itself.

- [ ] 1. On `plan2/a6-legacy-redirects`, write the failing test `tests/storeIpRedirect.test.js`:
```js
const request = require('supertest');
const app = require('../server');
const PORTAL = 'https://portal.atxwashdryfold.com';
const MARKETING = ['atxwashdryfold.com', 'rundberglaundry.com', 'runberglaundry.com', 'atxwashateria.com'];
const KEYS = ['STORE_IP_ADDRESS', 'ADDITIONAL_STORE_IPS', 'STORE_IP_RANGES'];
let saved;
beforeEach(() => { saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])); KEYS.forEach((k) => delete process.env[k]); });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
const get = (host, p, ip) => request(app).get(p).set('Host', host).set('cf-connecting-ip', ip);

describe.each(MARKETING)('D7 store-IP 302 on %s', (host) => {
  test('STORE_IP_ADDRESS match → 302 portal + originalUrl, no-store', async () => {
    process.env.STORE_IP_ADDRESS = '72.190.1.227';
    const res = await get(host, '/', '72.190.1.227');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${PORTAL}/`);
    expect(res.headers['cache-control']).toBe('no-store');
    const deep = await get(host, '/affiliate?x=1', '72.190.1.227');
    expect(deep.headers.location).toBe(`${PORTAL}/affiliate?x=1`);
  });
  test('ADDITIONAL_STORE_IPS list match → 302', async () => {
    process.env.ADDITIONAL_STORE_IPS = '198.51.100.7, 198.51.100.8';
    expect((await get(host, '/anything?x=1', '198.51.100.8')).headers.location).toBe(`${PORTAL}/anything?x=1`);
  });
  test('STORE_IP_RANGES CIDR match → 302', async () => {
    process.env.STORE_IP_RANGES = '2603:8080:db00:21b9::/64';
    expect((await get(host, '/', '2603:8080:db00:21b9:1:2:3:4')).status).toBe(302);
  });
  test('non-store IP → 200 page', async () => {
    process.env.STORE_IP_ADDRESS = '72.190.1.227';
    expect((await get(host, '/', '203.0.113.10')).status).toBe(200);
  });
  test('empty allowlist → 200 (a convenience, not a gate)', async () => {
    expect((await get(host, '/', '72.190.1.227')).status).toBe(200);
  });
  test('POST from the store IP is untouched', async () => {
    process.env.STORE_IP_ADDRESS = '72.190.1.227';
    const res = await request(app).post('/api/partner-inquiry').set('Host', host).set('cf-connecting-ip', '72.190.1.227').send({});
    expect(res.status).not.toBe(302);
  });
  test('a legacy path from the store IP → 301 (B7 wins), not 302', async () => {
    process.env.STORE_IP_ADDRESS = '72.190.1.227';
    const res = await get(host, '/admin', '72.190.1.227');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(`${PORTAL}/admin`);
  });
  test('/health from the store IP → 200 (the LB monitor path is never redirected)', async () => {
    process.env.STORE_IP_ADDRESS = '72.190.1.227';
    expect((await get(host, '/health', '72.190.1.227')).status).toBe(200);
  });
  test('spoof (R-3): X-Forwarded-Host crhsent.com does not exempt a marketing Host', async () => {
    process.env.STORE_IP_ADDRESS = '72.190.1.227';
    const res = await get(host, '/', '72.190.1.227').set('X-Forwarded-Host', 'crhsent.com');
    expect(res.status).toBe(302);
  });
});
test('crhsent.com from the store IP is untouched', async () => {
  process.env.STORE_IP_ADDRESS = '72.190.1.227';
  expect((await get('crhsent.com', '/', '72.190.1.227')).status).toBe(200);
});
test('spoof (R-3): Host crhsent.com + X-Forwarded-Host atxwashdryfold.com from the store IP → 200', async () => {
  process.env.STORE_IP_ADDRESS = '72.190.1.227';
  expect((await get('crhsent.com', '/', '72.190.1.227').set('X-Forwarded-Host', 'atxwashdryfold.com')).status).toBe(200);
});
```
  The count is 4 × 9 + 2 = 38.
- [ ] 2. Run `npm test -- tests/storeIpRedirect.test.js`. Expected: `Tests:       16 failed, 22 passed, 38 total`.
  - The failures are 4 × (STORE_IP_ADDRESS, list, CIDR, marketing spoof). They read `Expected: 302` / `Received: 200`, except the list case: it has no status assertion, so it reads `Expected: "https://portal.atxwashdryfold.com/anything?x=1"` / `Received: undefined`.
  - The 22 that pass already are 4 × (non-store, empty, POST, legacy 301, health) + 2 crhsent cases.
- [ ] 3. Create `server/middleware/storeIpPortalRedirect.js`:
```js
'use strict';
// §5.8 / D7: a request from the store network on a marketing host lands on the
// portal (a device missed by the re-point checklist still reaches the app).
// Marketing hosts, GET/HEAD, no path exemptions. An empty allowlist means no
// redirect — a convenience, not a gate. Mounted AFTER the B7 301s (and after
// /health) so a legacy path always wins with a 301 and the LB monitor is never
// redirected. Parses the three env keys itself (D7↔D21: the storeIPs module is
// deleted and stays deleted). Host from hostKind() → requestHost() (R-3).
const wc = require('@crhs/web-core');
const { PORTAL_ORIGIN, hostKind } = require('../config/hosts');

function storeEntries() {
  const { parseList } = wc.ipGate;
  return [
    ...parseList(process.env.STORE_IP_ADDRESS),
    ...parseList(process.env.ADDITIONAL_STORE_IPS),
    ...parseList(process.env.STORE_IP_RANGES)
  ];
}

function storeIpPortalRedirect(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (hostKind(req) !== 'marketing') return next();
  const entries = storeEntries();
  if (!entries.length) return next();
  const ip = wc.clientIp.clientIp(req);
  if (!ip || !entries.some((e) => wc.ipGate.entryMatches(ip, e))) return next();
  res.set('Cache-Control', 'no-store');
  return res.redirect(302, PORTAL_ORIGIN + req.originalUrl);
}

module.exports = storeIpPortalRedirect;
module.exports.storeEntries = storeEntries;
```
- [ ] 4. Edit `server.js` (§5.2 step 8):
```bash
sed -i "/^const legacyPortalRedirects = require('.\/server\/middleware\/legacyPortalRedirects');$/a const storeIpPortalRedirect = require('./server/middleware/storeIpPortalRedirect');" server.js
sed -i "/^app.use(legacyPortalRedirects);$/a // §5.2 step 8 — store network on a marketing host → 302 portal (D7).\napp.use(storeIpPortalRedirect);" server.js
grep -n "app.use(legacyPortalRedirects);\|app.use(storeIpPortalRedirect);\|app.use(cookieParser());" server.js
```
  Expected, in this order: `legacyPortalRedirects`, `storeIpPortalRedirect`, `cookieParser`.
- [ ] 5. Run `npm test -- tests/storeIpRedirect.test.js`. Expected PASS: `Tests:       38 passed, 38 total`. Then run `npm test 2>&1 | grep -E '^Tests:'`, which must show no `failed` segment, and `npm run lint`, which must be clean.
- [ ] 6. Commit, push, and open PR A6:
```bash
git add server/middleware/storeIpPortalRedirect.js server.js tests/storeIpRedirect.test.js
git commit -m "feat(redirects): store-IP requests on marketing hosts 302 to the portal (D7, §5.8)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin plan2/a6-legacy-redirects
gh pr create --base main --head plan2/a6-legacy-redirects --title "A6: marketing /api 404 JSON, B7 legacy 301s, store-IP 302" --body "Spec §5.2 step 14, §5.7 (B7), §5.8 (D7). /wavemax-affiliate (D5) is a separate PR pending counsel.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---
### Task 49: `server/middleware/rateLimitPolicy.js`, the corporate contact limiters (COPY-BEFORE-DELETE)

**Files:**
- Create `server/middleware/rateLimitPolicy.js`
- Create `tests/rateLimitPolicy.test.js`

**Interfaces:**
- Consumes `wc.rateLimiting`: `createCustomLimiter(options)`, `keyGenerators.ip`, `isRelaxed`, `isTest`, `collectionNameFor(name)` and `LIMITER_NAMES` (a live getter). All are exported by `crhs-web-core/src/middleware/rateLimiting.js`.
- Produces:
  - `CORPORATE_LIMITER_NAMES = ['contact_burst','contact_hourly']`
  - `contactBurstOptions(): object` and `contactHourlyOptions(): object`
  - `contactBurstLimiter` and `contactHourlyLimiter` (Express middleware)

The values are copied verbatim from `crhs-web-core/src/middleware/rateLimiting.js:214-230` (`contactFormBurstLimiter`) and `:237-254` (`contactFormLimiter`) at `2dcd6ff`:
- **Burst:** `windowMs: 30 * 1000`; `max: isRelaxed ? 30 : 1`; `keyGenerator: keyGenerators.ip`; skip in test; store name `'contact_burst'`; message `'Please wait a moment before sending another message.'`
- **Hourly:** `windowMs: 60 * 60 * 1000`; `max: isRelaxed ? 50 : 5`; `keyGenerator: keyGenerators.ip`; skip in test; store name `'contact_hourly'`; message `'You\'ve sent the maximum number of messages for now — please try again later, or call us directly.'`; `retryAfter: 60 * 60`

The core definitions also set `standardHeaders: true`, `legacyHeaders: false` and `validate: { singleCount: false }`. The policy deliberately does NOT restate them, because `createCustomLimiter`'s defaults (`rateLimiting.js:300-316`) supply all three. `validate: { singleCount: false }` is the Oracle-store crash-loop guard: without it, `ERR_ERL_DOUBLE_COUNT` escalates to `unhandledRejection` and the worker crash-loops. A test pins that the policy never overrides these defaults.

- [ ] 1. `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && git switch main && git pull --ff-only && git switch -c plan2/a7-intake`
- [ ] 2. Write the failing test `tests/rateLimitPolicy.test.js`:
```js
const fs = require('fs');
const path = require('path');

function loadIsolated(env = {}) {
  let out;
  jest.isolateModules(() => {
    Object.assign(process.env, env);
    const core = require('@crhs/web-core');
    const spy = jest.spyOn(core.rateLimiting, 'createCustomLimiter');
    const policy = require('../server/middleware/rateLimitPolicy');
    out = { core, spy, policy };
  });
  return out;
}

describe('rateLimitPolicy — corporate contact limiters (D2a, copy-before-delete)', () => {
  afterEach(() => { delete process.env.RELAX_RATE_LIMITING; delete process.env.RATE_LIMIT_COLLECTION_PREFIX; });

  test('contact_burst: name / windowMs / max / keyGenerator / message pinned', () => {
    const { core, policy } = loadIsolated();
    const o = policy.contactBurstOptions();
    expect(o.name).toBe('contact_burst');
    expect(o.windowMs).toBe(30000);
    expect(o.max).toBe(1);
    expect(o.keyGenerator).toBe(core.rateLimiting.keyGenerators.ip);
    expect(o.message).toEqual({ success: false, message: 'Please wait a moment before sending another message.' });
  });

  test('contact_hourly: name / windowMs / max / keyGenerator / message pinned', () => {
    const { core, policy } = loadIsolated();
    const o = policy.contactHourlyOptions();
    expect(o.name).toBe('contact_hourly');
    expect(o.windowMs).toBe(3600000);
    expect(o.max).toBe(5);
    expect(o.keyGenerator).toBe(core.rateLimiting.keyGenerators.ip);
    expect(o.message).toEqual({
      success: false,
      message: 'You\'ve sent the maximum number of messages for now — please try again later, or call us directly.',
      retryAfter: 3600
    });
  });

  test('RELAX_RATE_LIMITING=true → 30 / 50 (the relaxed values core uses)', () => {
    const { policy } = loadIsolated({ RELAX_RATE_LIMITING: 'true' });
    expect(policy.contactBurstOptions().max).toBe(30);
    expect(policy.contactHourlyOptions().max).toBe(50);
  });

  test('both limiters are built through createCustomLimiter and are middleware', () => {
    const { spy, policy } = loadIsolated();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][0]).toEqual(expect.objectContaining({ name: 'contact_burst', windowMs: 30000 }));
    expect(spy.mock.calls[1][0]).toEqual(expect.objectContaining({ name: 'contact_hourly', windowMs: 3600000 }));
    expect(typeof policy.contactBurstLimiter).toBe('function');
    expect(typeof policy.contactHourlyLimiter).toBe('function');
    expect(policy.CORPORATE_LIMITER_NAMES).toEqual(['contact_burst', 'contact_hourly']);
  });

  test('built limiters inherit core createCustomLimiter defaults (singleCount:false — the Oracle crash-loop guard)', () => {
    const { spy } = loadIsolated();
    const built = spy.mock.results.map((r) => r.value);
    expect(built).toHaveLength(2);
    // defaults are merged inside core; pin that we do NOT override them
    for (const call of spy.mock.calls) {
      expect(call[0].validate).toBeUndefined();
      expect(call[0].standardHeaders).toBeUndefined();
      expect(call[0].legacyHeaders).toBeUndefined();
    }
  });

  test('collections resolve under RATE_LIMIT_COLLECTION_PREFIX=ratelimit_corp_', () => {
    const { core } = loadIsolated({ RATE_LIMIT_COLLECTION_PREFIX: 'ratelimit_corp_' });
    expect(core.rateLimiting.collectionNameFor('contact_burst')).toBe('ratelimit_corp_contact_burst');
    expect(core.rateLimiting.collectionNameFor('contact_hourly')).toBe('ratelimit_corp_contact_hourly');
    expect(core.rateLimiting.LIMITER_NAMES).toEqual(expect.arrayContaining(['contact_burst', 'contact_hourly']));
  });

  // Plan 1 wins (P1-b, R-12): installed core still exports its contact-form
  // limiters until Plan 4 PR B7. This proves corporate survives that deletion.
  test('with core stripped of its contact limiters, wc.rateLimiting.contactFormBurstLimiter === undefined and the policy still builds', () => {
    jest.isolateModules(() => {
      jest.doMock('@crhs/web-core', () => {
        const actual = jest.requireActual('@crhs/web-core');
        const stripped = new Proxy(actual.rateLimiting, {
          get: (t, k) => ((k === 'contactFormBurstLimiter' || k === 'contactFormLimiter') ? undefined : t[k])
        });
        return new Proxy(actual, { get: (t, k) => (k === 'rateLimiting' ? stripped : t[k]) });
      });
      const wc = require('@crhs/web-core');
      expect(wc.rateLimiting.contactFormBurstLimiter === undefined).toBe(true);
      expect(wc.rateLimiting.contactFormLimiter === undefined).toBe(true);
      const policy = require('../server/middleware/rateLimitPolicy');
      expect(typeof policy.contactBurstLimiter).toBe('function');
      expect(typeof policy.contactHourlyLimiter).toBe('function');
    });
  });

  test('no file under server/ names core\'s contact-form limiters', () => {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    const hits = walk(path.join(__dirname, '..', 'server')).filter((f) => f.endsWith('.js'))
      .filter((f) => /contactFormBurstLimiter|contactFormLimiter/.test(fs.readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
```
- [ ] 3. Run `npm test -- tests/rateLimitPolicy.test.js`. Expected: `Tests:       7 failed, 1 passed, 8 total`. Each of the 7 failures is `Cannot find module '../server/middleware/rateLimitPolicy' from 'tests/rateLimitPolicy.test.js'`. The source-scan test passes, because no `server/` file names the limiters yet.
- [ ] 4. Create `server/middleware/rateLimitPolicy.js`. Its comments must not spell core's identifiers, or the source scan fails:
```js
'use strict';
// Corporate rate-limit POLICY (spec §5.5, D2a). Mechanism comes from
// @crhs/web-core (createCustomLimiter + the Mongo store); the numbers are app
// policy. Values copied VERBATIM from @crhs/web-core v0.2.0 (commit 2dcd6ff)
// src/middleware/rateLimiting.js:214-230 (contact burst) and :237-254 (contact
// hourly) — COPY-BEFORE-DELETE: core deletes its copies in Plan 4 PR B7, and
// nothing in this app may reference them. Collections resolve to
// <RATE_LIMIT_COLLECTION_PREFIX>contact_burst / contact_hourly
// (production prefix ratelimit_corp_).
// standardHeaders/legacyHeaders/validate:{singleCount:false} come from createCustomLimiter's defaults (rateLimiting.js:300-316) — never override them.
const wc = require('@crhs/web-core');

const CORPORATE_LIMITER_NAMES = Object.freeze(['contact_burst', 'contact_hourly']);

/** Burst guard: 1 submission per 30 s per visitor IP (30 when relaxed). */
function contactBurstOptions() {
  const rl = wc.rateLimiting;
  return {
    name: 'contact_burst',
    windowMs: 30 * 1000,
    max: rl.isRelaxed ? 30 : 1,
    message: { success: false, message: 'Please wait a moment before sending another message.' },
    skip: () => rl.isTest,
    keyGenerator: rl.keyGenerators.ip
  };
}

/** Hourly cap: 5 submissions per hour per visitor IP (50 when relaxed). */
function contactHourlyOptions() {
  const rl = wc.rateLimiting;
  return {
    name: 'contact_hourly',
    windowMs: 60 * 60 * 1000,
    max: rl.isRelaxed ? 50 : 5,
    message: {
      success: false,
      message: 'You\'ve sent the maximum number of messages for now — please try again later, or call us directly.',
      retryAfter: 60 * 60
    },
    skip: () => rl.isTest,
    keyGenerator: rl.keyGenerators.ip
  };
}

const contactBurstLimiter = wc.rateLimiting.createCustomLimiter(contactBurstOptions());
const contactHourlyLimiter = wc.rateLimiting.createCustomLimiter(contactHourlyOptions());

module.exports = {
  CORPORATE_LIMITER_NAMES,
  contactBurstOptions,
  contactHourlyOptions,
  contactBurstLimiter,
  contactHourlyLimiter
};
```
- [ ] 5. Run `npm test -- tests/rateLimitPolicy.test.js`. Expected PASS: `Tests:       8 passed, 8 total`. Then run `npm run lint`, which must be clean.
- [ ] 6. Commit:
```bash
git add server/middleware/rateLimitPolicy.js tests/rateLimitPolicy.test.js
git commit -m "feat(rate-limit): corporate contact limiters copied verbatim from core before B7 deletes them (D2a)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 50: Corporate brand, email template root and base template (§5.5)

**Files:**
- Create `server/config/brand.js`
- Create `server/config/email.js`
- Create `server/services/intakeMail.js`
- Create `server/templates/emails/base-template.html` (byte copy of affiliate `server/templates/emails/base-template.html`, 1387 bytes)
- Create `tests/intakeMailConfig.test.js`

**Interfaces:**
- Consumes, from web-core v0.2.1:
  - `wc.email.templateManager.loadTemplate(name, lang, templateRoot)`
  - `wc.email.templateManager.fillTemplate(template, data, brand)` with `brand = { displayName, legalName, logoPath, baseUrl }` (B3g-2): `BRAND_LOGO = baseUrl + logoPath`, and caller `data` wins.
- Produces:
  - `brand.{displayName, legalName, logoPath}`: lazy getters; never destructure.
  - `DEFAULT_TEMPLATE_ROOT` and `templateRoot(): string` (`EMAIL_TEMPLATE_ROOT`, else `server/templates/emails`).
  - `escapeHtml(v)`, `nl2br(v)` and `brandWrap(content): Promise<string>`.
- No From header is built here (R-6). Callers pass `{ displayName: brand.displayName }` to `sendEmail` and web-core composes the From.

- [ ] 1. Copy the template and prove the copy is exact:
```bash
mkdir -p /mnt/c/Users/rickh/GitHub/crhs-corporate/server/templates/emails
cp /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/server/templates/emails/base-template.html /mnt/c/Users/rickh/GitHub/crhs-corporate/server/templates/emails/base-template.html
cmp /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/server/templates/emails/base-template.html /mnt/c/Users/rickh/GitHub/crhs-corporate/server/templates/emails/base-template.html && wc -c /mnt/c/Users/rickh/GitHub/crhs-corporate/server/templates/emails/base-template.html
```
  Expected: no `cmp` output, then `1387 /mnt/c/Users/rickh/GitHub/crhs-corporate/server/templates/emails/base-template.html`.
- [ ] 2. Write the failing test `tests/intakeMailConfig.test.js`:
```js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'server', 'templates', 'emails');
const KEYS = ['EMAIL_FROM_NAME', 'BRAND_DISPLAY_NAME', 'BRAND_LEGAL_NAME', 'BRAND_LOGO_PATH', 'BASE_URL', 'EMAIL_TEMPLATE_ROOT'];
let saved;
beforeEach(() => { saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])); KEYS.forEach((k) => delete process.env[k]); });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const email = require('../server/config/email');
const brand = require('../server/config/brand');
const { brandWrap, escapeHtml, nl2br } = require('../server/services/intakeMail');

test('template root: code default is server/templates/emails; EMAIL_TEMPLATE_ROOT overrides; no From builder here (R-6)', () => {
  expect(email.DEFAULT_TEMPLATE_ROOT).toBe(ROOT);
  expect(email.templateRoot()).toBe(ROOT);
  process.env.EMAIL_TEMPLATE_ROOT = '/x/y';
  expect(email.templateRoot()).toBe('/x/y');
  expect(email.fromHeader).toBeUndefined();
});
test('base-template.html is the 1387-byte copy carrying the five tokens', () => {
  const html = fs.readFileSync(path.join(ROOT, 'base-template.html'), 'utf8');
  expect(Buffer.byteLength(html)).toBe(1387);
  for (const t of ['[BRAND_LEGAL]', '[BRAND_LOGO]', '[BRAND_NAME]', '[CURRENT_YEAR]', '[EMAIL_CONTENT]']) expect(html).toContain(t);
});
test('brand getters resolve lazily', () => {
  expect(brand.displayName).toBe('Laundromat');
  process.env.BRAND_DISPLAY_NAME = 'WaveMAX Austin';
  expect(brand.displayName).toBe('WaveMAX Austin');
  expect(brand.legalName).toBe('CRHS Enterprises, LLC');
  expect(brand.logoPath).toBe('/assets/images/brand/logo.png');
});
test('brandWrap renders the REAL template (not FALLBACK_TEMPLATE) with an absolute logo', async () => {
  process.env.BRAND_DISPLAY_NAME = 'WaveMAX Austin';
  process.env.BASE_URL = 'https://atxwashdryfold.com';
  const html = await brandWrap('<p>hello</p>');
  expect(html).toContain('<title>WaveMAX Austin</title>');
  expect(html).toContain('<img src="https://atxwashdryfold.com/assets/images/brand/logo.png" alt="WaveMAX Austin" class="logo">');
  expect(html).toContain('<p>hello</p>');
  expect(html).toContain(`&copy; ${new Date().getFullYear()} CRHS Enterprises, LLC.`);
  expect(html).not.toMatch(/\[(BRAND_NAME|BRAND_LOGO|BRAND_LEGAL|CURRENT_YEAR|EMAIL_CONTENT|BASE_URL)\]/);
});
test('escapeHtml / nl2br', () => {
  expect(escapeHtml('<a href="x">\'&')).toBe('&lt;a href=&quot;x&quot;&gt;&#x27;&amp;');
  expect(nl2br('a\nb')).toBe('a<br>b');
});
```
- [ ] 3. Run `npm test -- tests/intakeMailConfig.test.js`. Expected: `Test suite failed to run` with `Cannot find module '../server/config/email' from 'tests/intakeMailConfig.test.js'`.
- [ ] 4. Create `server/config/brand.js`:
```js
'use strict';
// Corporate brand source for intake mail (spec §5.5, D13b: brand is app-owned —
// web-core v0.2.1 ships no brand module). Resolved on ACCESS; never destructure.
module.exports = {
  get displayName() { return process.env.BRAND_DISPLAY_NAME || 'Laundromat'; },
  get legalName() { return process.env.BRAND_LEGAL_NAME || 'CRHS Enterprises, LLC'; },
  get logoPath() { return process.env.BRAND_LOGO_PATH || '/assets/images/brand/logo.png'; }
};
```
- [ ] 5. Create `server/config/email.js`:
```js
'use strict';
// Mail wiring owned by this app. The template-root default equals the
// production EMAIL_TEMPLATE_ROOT (/var/www/crhs-corporate/server/templates/emails)
// so a missing env var cannot silently render FALLBACK_TEMPLATE (R-25).
// The From header is NOT built here: callers pass { displayName } and web-core
// composes "<name>" <EMAIL_FROM || EMAIL_USER> with the precedence
// fromName > EMAIL_FROM_NAME > displayName (R-6).
const path = require('path');

const DEFAULT_TEMPLATE_ROOT = path.join(__dirname, '..', 'templates', 'emails');

function templateRoot() {
  return process.env.EMAIL_TEMPLATE_ROOT || DEFAULT_TEMPLATE_ROOT;
}

module.exports = { DEFAULT_TEMPLATE_ROOT, templateRoot };
```
- [ ] 6. Create `server/services/intakeMail.js`:
```js
'use strict';
// Shared helpers for the two intake mailers (escapeHtml/nl2br ported verbatim
// from the affiliate partnerInquiryService.js:8-20).
const wc = require('@crhs/web-core');
const brand = require('../config/brand');
const { templateRoot } = require('../config/email');

const DEFAULT_BASE_URL = 'https://atxwashdryfold.com';

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function nl2br(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

/** Wrap a body in base-template.html, brand passed by parameter (web-core B3g-2). */
async function brandWrap(content) {
  const tm = wc.email.templateManager;
  const base = await tm.loadTemplate('base-template', 'en', templateRoot());
  return tm.fillTemplate(
    base,
    { EMAIL_CONTENT: content, CURRENT_YEAR: String(new Date().getFullYear()) },
    {
      displayName: brand.displayName,
      legalName: brand.legalName,
      logoPath: brand.logoPath,
      baseUrl: process.env.BASE_URL || DEFAULT_BASE_URL
    }
  );
}

module.exports = { escapeHtml, nl2br, brandWrap };
```
- [ ] 7. Run `npm test -- tests/intakeMailConfig.test.js`. Expected PASS: `Tests:       5 passed, 5 total`. If `brandWrap` fails with `Received string` containing `Laundromat` or `[BRAND_LOGO]`, the installed core is not v0.2.1: run `node -p "require('@crhs/web-core/package.json').version"` and stop unless it prints `0.2.1`.
- [ ] 8. Commit:
```bash
git add server/config/brand.js server/config/email.js server/services/intakeMail.js server/templates/emails/base-template.html tests/intakeMailConfig.test.js
git commit -m "feat(mail): corporate brand + template root + base-template copy for intake mail (§5.5, R-25)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 51: Pin the web-core v0.2.1 mail seam corporate relies on (`replyTo`, `displayName`, `validateMailConfig`)

**Files:**
- Create `tests/webcoreMailSeam.test.js`

**Interfaces:**
- Consumes the installed web-core v0.2.1, which P0 Task 9 installed locally and recorded in `package-lock.json` (A15 Task 39 Step 1 verifies it):
  - `wc.email.transport.sendEmail(to, subject, html, fromOverride, { replyTo, fromName, displayName })`. The From is `"<fromName || EMAIL_FROM_NAME || displayName>" <EMAIL_FROM || EMAIL_USER>`, and `mailOptions.replyTo` is set only when given.
  - `wc.email.validateMailConfig({ templateRoot })`, which is the same function as `wc.email.transport.validateMailConfig`.
- Produces a guard test that fails if a future core drops or changes this seam.

This task writes no production code. It pins an external contract, so its red step is a deliberate bite against a sabotaged copy of the installed module.

- [ ] 1. Confirm the prerequisite from A15:
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
node -p "require('@crhs/web-core/package.json').version"
grep -A2 '"node_modules/@crhs/web-core"' package-lock.json | grep '"version"'
node -p "Object.keys(require('@crhs/web-core')).length"
```
  Expected: `0.2.1`, then `"version": "0.2.1",`, then `26`.
  If the first line prints `0.2.0`, P0 Task 9 (Steps 3-4) has not landed on this checkout. Run `rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund`. The `rm -rf` is mandatory: `npm install --install-links` does not re-copy a `file:` dependency. Then run `npm install --package-lock-only --install-links` and re-run the three commands.
- [ ] 2. Write the test `tests/webcoreMailSeam.test.js`:
```js
const path = require('path');

function transportWithMockedNodemailer() {
  const coreDir = path.dirname(require.resolve('@crhs/web-core/package.json'));
  const nodemailerPath = require.resolve('nodemailer', { paths: [coreDir] });
  const sendMail = jest.fn().mockResolvedValue({ messageId: 'seam' });
  let transport;
  jest.isolateModules(() => {
    jest.doMock(nodemailerPath, () => ({ createTransport: jest.fn(() => ({ sendMail })) }));
    transport = require('@crhs/web-core').email.transport;
  });
  return { transport, sendMail };
}

const KEYS = ['EMAIL_PROVIDER', 'EMAIL_FROM', 'EMAIL_USER', 'EMAIL_FROM_NAME', 'BRAND_DISPLAY_NAME'];
let saved;
beforeEach(() => { saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])); KEYS.forEach((k) => delete process.env[k]); });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe('installed @crhs/web-core carries the v0.2.1 mail seam corporate consumes', () => {
  test('installed version is >= 0.2.1', () => {
    const [maj, min, pat] = require('@crhs/web-core/package.json').version.split('.').map(Number);
    expect(maj * 1e6 + min * 1e3 + pat).toBeGreaterThanOrEqual(2001);
  });

  test('intake shape: { replyTo, displayName } → Reply-To and "<displayName>" <EMAIL_FROM>', async () => {
    process.env.EMAIL_FROM = 'no-reply@crhsent.com';
    const { transport, sendMail } = transportWithMockedNodemailer();
    await transport.sendEmail('pickups@atxwashdryfold.com', 's', '<p>x</p>', undefined, { replyTo: 'lead@example.com', displayName: 'WaveMAX Austin' });
    expect(sendMail.mock.calls[0][0].from).toBe('"WaveMAX Austin" <no-reply@crhsent.com>');
    expect(sendMail.mock.calls[0][0].replyTo).toBe('lead@example.com');
  });

  test('gate shape: { displayName: "CRHS Enterprises" } falls back to EMAIL_USER; EMAIL_FROM_NAME beats displayName (R-6)', async () => {
    process.env.EMAIL_USER = 'no-reply@crhsent.com';
    const { transport, sendMail } = transportWithMockedNodemailer();
    await transport.sendEmail('user@example.com', 's', '<p>x</p>', undefined, { displayName: 'CRHS Enterprises' });
    expect(sendMail.mock.calls[0][0].from).toBe('"CRHS Enterprises" <no-reply@crhsent.com>');
    expect(sendMail.mock.calls[0][0]).not.toHaveProperty('replyTo');
    process.env.EMAIL_FROM_NAME = 'Operator Override';
    await transport.sendEmail('user@example.com', 's', '<p>x</p>', undefined, { displayName: 'CRHS Enterprises' });
    expect(sendMail.mock.calls[1][0].from).toBe('"Operator Override" <no-reply@crhsent.com>');
  });

  test('validateMailConfig is exported on wc.email and is the transport function', () => {
    const wc = require('@crhs/web-core');
    expect(typeof wc.email.validateMailConfig).toBe('function');
    expect(wc.email.validateMailConfig).toBe(wc.email.transport.validateMailConfig);
  });
});
```
- [ ] 3. Run `npm test -- tests/webcoreMailSeam.test.js`. Expected: `Tests:       4 passed, 4 total`.
- [ ] 4. Prove the guard bites. Temporarily remove the `replyTo` line from the installed copy (never from the web-core repo):
```bash
sed -i 's/^  if (options.replyTo) mailOptions.replyTo = options.replyTo;$//' node_modules/@crhs/web-core/src/email/transport.js
grep -c 'mailOptions.replyTo' node_modules/@crhs/web-core/src/email/transport.js
npm test -- tests/webcoreMailSeam.test.js
```
  Expected: `0` from `grep`, then `Tests:       1 failed, 3 passed, 4 total`. The failure is `Expected: "lead@example.com"` / `Received: undefined`.
- [ ] 5. Restore the installed copy and re-run:
```bash
rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund
node -p "require('@crhs/web-core/package.json').version"
git diff --stat package-lock.json
npm test -- tests/webcoreMailSeam.test.js
```
  Expected: `0.2.1`; no `git diff` output; `Tests:       4 passed, 4 total`.
- [ ] 6. Commit:
```bash
git add tests/webcoreMailSeam.test.js
git commit -m "test(mail): pin the web-core 0.2.1 seam — replyTo, displayName From composition, validateMailConfig

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 52: Intake mail services (`replyTo`, env recipients, `displayName`)

**Files:**
- Create `server/services/partnerInquiryService.js`
- Create `server/services/affiliateApplicationService.js`
- Create `tests/intakeServices.test.js`

**Interfaces:**
- Consumes `brandWrap`, `escapeHtml` and `nl2br` (Task 50), `brand.displayName` (Task 50), and `wc.email.transport.sendEmail` (web-core v0.2.1, pinned by Task 51).
- Produces:
  - `sendPartnerInquiry({firstName,lastName,email,phone,businessName,serviceArea,volume,message,source}): Promise<void>`
  - `sendAffiliateApplication({firstName,lastName,email,phone,affiliation,serviceArea,transport,availability,message,source}): Promise<void>`
  - Every send is `sendEmail(to, subject, html, undefined, { replyTo, displayName: brand.displayName })`. There is no From override (R-6).
  - Recipients: `PARTNER_INQUIRY_RECIPIENT` (default `pickups@atxwashdryfold.com`) and `AFFILIATE_APPLICATION_RECIPIENT` (default `admin@crhsent.com`), both read at call time.

- [ ] 1. Write the failing test `tests/intakeServices.test.js`:
```js
const mockSendEmail = jest.fn();
jest.mock('@crhs/web-core', () => {
  const actual = jest.requireActual('@crhs/web-core');
  const transport = { ...actual.email.transport, sendEmail: (...a) => mockSendEmail(...a) };
  const email = new Proxy(actual.email, { get: (t, k) => (k === 'transport' ? transport : t[k]) });
  return new Proxy(actual, { get: (t, k) => (k === 'email' ? email : t[k]) });
});
const partner = require('../server/services/partnerInquiryService');
const affiliate = require('../server/services/affiliateApplicationService');

const KEYS = ['EMAIL_FROM', 'EMAIL_USER', 'EMAIL_FROM_NAME', 'BRAND_DISPLAY_NAME', 'BASE_URL', 'PARTNER_INQUIRY_RECIPIENT', 'AFFILIATE_APPLICATION_RECIPIENT', 'EMAIL_TEMPLATE_ROOT'];
let saved;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  KEYS.forEach((k) => delete process.env[k]);
  Object.assign(process.env, { BRAND_DISPLAY_NAME: 'WaveMAX Austin', BASE_URL: 'https://atxwashdryfold.com' });
  mockSendEmail.mockReset().mockResolvedValue({ messageId: 't' });
});
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const P = { firstName: 'Jane', lastName: 'Doe', email: 'jane.doe@example.com', phone: '(512) 555-1212', businessName: 'Doe Cleaners', serviceArea: 'North Austin', volume: '50-200', message: 'We would love to partner.', source: '/' };
const A = { firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com', phone: '512-555-0100', affiliation: 'ut-student', serviceArea: 'North Austin', transport: 'car', availability: 'weekends', message: 'x'.repeat(90), source: '/affiliate' };
const NAME = 'WaveMAX Austin';

describe.each([
  ['partner inquiry', () => partner.sendPartnerInquiry(P), P.email, 'pickups@atxwashdryfold.com', 'PARTNER_INQUIRY_RECIPIENT', 'Partner inquiry · Doe Cleaners'],
  ['affiliate application', () => affiliate.sendAffiliateApplication(A), A.email, 'admin@crhsent.com', 'AFFILIATE_APPLICATION_RECIPIENT', 'Affiliate application · Sam Lee']
])('%s mail', (_n, send, lead, defaultRecipient, envKey, subject) => {
  test('notification → recipient with Reply-To lead; thank-you → lead with Reply-To recipient; displayName, no From override', async () => {
    await send();
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    const [n, t] = mockSendEmail.mock.calls;
    expect(n[0]).toBe(defaultRecipient);
    expect(n[1]).toBe(subject);
    expect(n[3]).toBeUndefined();
    expect(n[4]).toEqual({ replyTo: lead, displayName: NAME });
    expect(t[0]).toBe(lead);
    expect(t[3]).toBeUndefined();
    expect(t[4]).toEqual({ replyTo: defaultRecipient, displayName: NAME });
  });
  test('recipient env override is read at call time', async () => {
    process.env[envKey] = 'ops@example.com';
    await send();
    expect(mockSendEmail.mock.calls[0][0]).toBe('ops@example.com');
    expect(mockSendEmail.mock.calls[1][4]).toEqual({ replyTo: 'ops@example.com', displayName: NAME });
  });
  test('html is branded, absolute logo, no retired brand strings', async () => {
    await send();
    for (const c of mockSendEmail.mock.calls) {
      expect(c[2]).toContain('https://atxwashdryfold.com/assets/images/brand/logo.png');
      expect(c[2]).toContain('WaveMAX Austin');
      expect(c[2]).not.toMatch(/Rundberg Laundry|rundberglaundry\.com|\[BRAND_LOGO\]/);
    }
  });
  test('a transport failure propagates', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('smtp down'));
    await expect(send()).rejects.toThrow('smtp down');
  });
});
test('lead input is HTML-escaped in the notification', async () => {
  await partner.sendPartnerInquiry({ ...P, firstName: '<script>x</script>' });
  expect(mockSendEmail.mock.calls[0][2]).toContain('&lt;script&gt;x&lt;/script&gt;');
  expect(mockSendEmail.mock.calls[0][2]).not.toContain('<script>x');
});
```
- [ ] 2. Run `npm test -- tests/intakeServices.test.js`. Expected: `Test suite failed to run` with `Cannot find module '../server/services/partnerInquiryService' from 'tests/intakeServices.test.js'`.
- [ ] 3. Create `server/services/partnerInquiryService.js`. The body copy (subject, notification table, thank-you) is verbatim from affiliate `server/services/partnerInquiryService.js:42-76`. Only the recipient default, the transport call and the options change:
```js
'use strict';
// Ported from the affiliate partnerInquiryService.js:42-76 (D2a). Changes:
// recipient default pickups@atxwashdryfold.com (read at call time); web-core
// transport; no From override — { displayName } lets web-core compose
// "<brand>" <EMAIL_FROM> (R-6); Reply-To = lead on the notification and =
// recipient on the thank-you ("just reply to this email").
const wc = require('@crhs/web-core');
const brand = require('../config/brand');
const { escapeHtml, nl2br, brandWrap } = require('./intakeMail');

const DEFAULT_RECIPIENT = 'pickups@atxwashdryfold.com';
const recipient = () => process.env.PARTNER_INQUIRY_RECIPIENT || DEFAULT_RECIPIENT;

async function sendPartnerInquiry({ firstName, lastName, email, phone, businessName, serviceArea, volume, message, source }) {
  const to = recipient();
  const fullName = `${firstName} ${lastName}`.trim();
  const subject = `Partner inquiry · ${businessName || fullName}`;
  const messageBlock = message
    ? `<h3>Message</h3>\n    <p style="white-space: pre-wrap;">${nl2br(message)}</p>`
    : '';
  const notificationContent = `
    <h2 style="margin-top:0; color:#143852;">New partner inquiry</h2>
    <table cellpadding="6" cellspacing="0" border="0">
      <tr><td><strong>Name:</strong></td><td>${escapeHtml(fullName)}</td></tr>
      <tr><td><strong>Business:</strong></td><td>${escapeHtml(businessName || '—')}</td></tr>
      <tr><td><strong>Email:</strong></td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
      <tr><td><strong>Phone:</strong></td><td>${escapeHtml(phone || '—')}</td></tr>
      <tr><td><strong>Service area:</strong></td><td>${escapeHtml(serviceArea || '—')}</td></tr>
      <tr><td><strong>Estimated volume:</strong></td><td>${escapeHtml(volume || '—')}</td></tr>
      <tr><td><strong>Source page:</strong></td><td>${escapeHtml(source || '—')}</td></tr>
    </table>
    ${messageBlock}
    <hr>
    <p style="font-size: 12px; color: #6c757d;">Reply to this email to reach ${escapeHtml(firstName)} at ${escapeHtml(email)}.</p>`;
  await wc.email.transport.sendEmail(to, subject, await brandWrap(notificationContent), undefined, { replyTo: email, displayName: brand.displayName });

  const thankYouSubject = `Thanks for your interest in the ${brand.displayName} partner program`;
  const thankYouContent = `
    <h2 style="margin-top:0; color:#143852;">Thanks, ${escapeHtml(firstName)}.</h2>
    <p>We've received your inquiry about the ${escapeHtml(brand.displayName)} partner program. A member of our team will be in touch with you shortly.</p>
    <p>If there's anything else you'd like us to know in the meantime, just reply to this email.</p>`;
  await wc.email.transport.sendEmail(email, thankYouSubject, await brandWrap(thankYouContent), undefined, { replyTo: to, displayName: brand.displayName });

  wc.logger.info('Partner inquiry received', { email, businessName: businessName || null });
}

module.exports = { sendPartnerInquiry };
```
- [ ] 4. Create `server/services/affiliateApplicationService.js`. The body copy is verbatim from affiliate `server/services/affiliateApplicationService.js:42-77`:
```js
'use strict';
// Ported from the affiliate affiliateApplicationService.js:42-77 (D2a).
// Recipient default admin@crhsent.com unchanged (read at call time); same
// substitutions as partnerInquiryService.js (no From override — R-6).
const wc = require('@crhs/web-core');
const brand = require('../config/brand');
const { escapeHtml, nl2br, brandWrap } = require('./intakeMail');

const DEFAULT_RECIPIENT = 'admin@crhsent.com';
const recipient = () => process.env.AFFILIATE_APPLICATION_RECIPIENT || DEFAULT_RECIPIENT;

async function sendAffiliateApplication({ firstName, lastName, email, phone, affiliation, serviceArea, transport, availability, message, source }) {
  const to = recipient();
  const fullName = `${firstName} ${lastName}`.trim();
  const subject = `Affiliate application · ${firstName} ${lastName}`;
  const messageBlock = message
    ? `<h3>Message</h3>\n    <p style="white-space: pre-wrap;">${nl2br(message)}</p>`
    : '';
  const notificationContent = `
    <h2 style="margin-top:0; color:#143852;">New affiliate application</h2>
    <table cellpadding="6" cellspacing="0" border="0">
      <tr><td><strong>Name:</strong></td><td>${escapeHtml(fullName)}</td></tr>
      <tr><td><strong>Email:</strong></td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
      <tr><td><strong>Phone:</strong></td><td>${escapeHtml(phone || '—')}</td></tr>
      <tr><td><strong>UT affiliation:</strong></td><td>${escapeHtml(affiliation || '—')}</td></tr>
      <tr><td><strong>Service area:</strong></td><td>${escapeHtml(serviceArea || '—')}</td></tr>
      <tr><td><strong>Transport:</strong></td><td>${escapeHtml(transport || '—')}</td></tr>
      <tr><td><strong>Availability:</strong></td><td>${escapeHtml(availability || '—')}</td></tr>
      <tr><td><strong>Source page:</strong></td><td>${escapeHtml(source || '—')}</td></tr>
    </table>
    ${messageBlock}
    <hr>
    <p style="font-size: 12px; color: #6c757d;">Reply to this email to reach ${escapeHtml(firstName)} at ${escapeHtml(email)}.</p>`;
  await wc.email.transport.sendEmail(to, subject, await brandWrap(notificationContent), undefined, { replyTo: email, displayName: brand.displayName });

  const thankYouSubject = `Thanks for your interest in the ${brand.displayName} affiliate program`;
  const thankYouContent = `
    <h2 style="margin-top:0; color:#143852;">Thanks, ${escapeHtml(firstName)}.</h2>
    <p>We've received your application for the ${escapeHtml(brand.displayName)} affiliate program. A member of our team will reach out to you shortly.</p>
    <p>If you have any questions in the meantime, just reply to this email.</p>`;
  await wc.email.transport.sendEmail(email, thankYouSubject, await brandWrap(thankYouContent), undefined, { replyTo: to, displayName: brand.displayName });

  wc.logger.info('Affiliate application received', { email, affiliation: affiliation || null });
}

module.exports = { sendAffiliateApplication };
```
- [ ] 5. Run `npm test -- tests/intakeServices.test.js`. Expected PASS: `Tests:       9 passed, 9 total` (2 × 4 + 1). Then run `npm run lint`, which must be clean.
- [ ] 6. Commit:
```bash
git add server/services/partnerInquiryService.js server/services/affiliateApplicationService.js tests/intakeServices.test.js
git commit -m "feat(intake): partner/affiliate mailers with env recipients, Reply-To and displayName (D2a, §5.5, R-6)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 53: Intake endpoints, validator codes, the nine locale keys and client error copy (ONE commit, per §5.5)

**Files:**
- Create:
  - `server/validation/intakeErrorCodes.js`
  - `server/routes/partnerInquiryRoutes.js`
  - `server/routes/affiliateApplicationRoutes.js`
  - `server/routes/intakeRoutes.js`
  - `server/controllers/partnerInquiryController.js`
  - `server/controllers/affiliateApplicationController.js`
  - `tests/intake.test.js`
  - `tests/intakeFrom.test.js`
  - `tests/partnerInquiryClient.test.js`
- Modify:
  - `server.js`: one require, and one mount line directly above Task 45's catch-all
  - `package.json` and `package-lock.json`: `express-validator`
  - `content/atxwashdryfold/locales/{en,es,pt,de}/common.json`: nine keys each
  - `content/atxwashdryfold/assets/js/partner-inquiry.js`: the `t()` helper at `:7-16` and the two `var msg` lines at `:100-101`, both from A15 Tasks 32/34
  - `tests/i18nParity.test.js` (A15 Tasks 37/38): three lines

**Interfaces:**
- Consumes:
  - `contactBurstLimiter` and `contactHourlyLimiter` (Task 49)
  - `sendPartnerInquiry` and `sendAffiliateApplication` (Task 52)
  - `marketingOnly` (A15 Task 28)
  - the `app.use('/api', marketingOnly(marketingApiNotFound));` line (Task 45)
  - `wc.controllerHelpers`: the `ControllerHelpers` class with static `asyncWrapper(fn)`, `sendSuccess(res, data, message)` and `sendError(res, message, statusCode)` (`crhs-web-core/src/utils/controllerHelpers.js:41`, `:55`, `:70`)
  - `npm run check:i18n` (A15 Task 38)
- Produces:
  - `PARTNER_FORM_CODES` (9 codes), `GENERIC_CODE = 'partner.form.errGeneric'`, `coded(code, msg)` and `formatValidationErrors(result) → [{ field, msg, code }]`.
  - Routes `POST /api/partner-inquiry` and `POST /api/affiliate-application`, plus the 12-month compatibility aliases `POST /api/v1/partner-inquiry` and `POST /api/v1/affiliate-application`. All are marketing-host-only via `marketingOnly` (Host header only, R-3).
  - Route exports `PARTNER_INQUIRY_FIELDS`, `ALLOWED_VOLUMES`, `AFFILIATE_APPLICATION_FIELDS`, `ALLOWED_AFFILIATIONS` and `ALLOWED_TRANSPORT`.
  - `window.PartnerInquiryForm.errorText(body): string`.
  - Marketing locale leaf count 110 → 119.

The nine codes are one per `withMessage()` in affiliate `server/routes/partnerInquiryRoutes.js:12-41` (firstName ×2, lastName ×2, email ×3, phone ×1, volume ×1):
- `errFirstNameRequired`, `errFirstNameLength`
- `errLastNameRequired`, `errLastNameLength`
- `errEmailRequired`, `errEmail`, `errEmailLength`
- `errPhoneRequired`
- `errVolume`

Rules without a `withMessage` emit `code: 'partner.form.errGeneric'`. `/affiliate` is English-only (§11.5): its shared contact fields reuse the same codes, and its own rules (including the F-3 `message` rule) fall back to `errGeneric`, so no keys are added for it.

- [ ] 1. Check the prerequisites:
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
node -p "require('./package.json').scripts['check:i18n']"
node -p "require('./package.json').dependencies['express-validator']"
grep -c "app.use('/api', marketingOnly(marketingApiNotFound));" server.js
```
  Expected: `node scripts/check-i18n-parity.js` (added by A15 Task 38), then `undefined`, then `1`. If the first line prints `undefined`, stop: A4 has not landed.
- [ ] 2. Write the failing test `tests/intake.test.js`:
```js
const fs = require('fs');
const path = require('path');
const mockSendEmail = jest.fn();
jest.mock('@crhs/web-core', () => {
  const actual = jest.requireActual('@crhs/web-core');
  const transport = { ...actual.email.transport, sendEmail: (...a) => mockSendEmail(...a) };
  const email = new Proxy(actual.email, { get: (t, k) => (k === 'transport' ? transport : t[k]) });
  return new Proxy(actual, { get: (t, k) => (k === 'email' ? email : t[k]) });
});
const request = require('supertest');
const app = require('../server');
const { PARTNER_FORM_CODES, GENERIC_CODE } = require('../server/validation/intakeErrorCodes');

const H = 'atxwashdryfold.com';
const P = { firstName: 'Jane', lastName: 'Doe', email: 'jane.doe@example.com', phone: '(512) 555-1212', businessName: 'Doe Cleaners', volume: '50-200', message: 'hi', source: '/' };
const A = { firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com', phone: '512-555-0100', affiliation: 'other', transport: 'car', message: 'I would recruit customers through campus groups, flyers in dorms and referrals from my existing network.', source: '/affiliate' };
const LOCALES = ['en', 'es', 'pt', 'de'];
const locale = (l) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'atxwashdryfold', 'locales', l, 'common.json'), 'utf8'));
const resolve = (obj, key) => key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
const post = (p, body, host = H) => request(app).post(p).set('Host', host).set('Accept', 'application/json').send(body);

beforeEach(() => {
  mockSendEmail.mockReset().mockResolvedValue({ messageId: 't' });
  delete process.env.PARTNER_INQUIRY_RECIPIENT;
  delete process.env.BRAND_DISPLAY_NAME;
});

describe.each(['/api/partner-inquiry', '/api/v1/partner-inquiry'])('POST %s', (p) => {
  test('200 + two sends, notification to pickups@atxwashdryfold.com with Reply-To lead, no cookie', async () => {
    const res = await post(p, P);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail.mock.calls[0][0]).toBe('pickups@atxwashdryfold.com');
    expect(mockSendEmail.mock.calls[0][4]).toEqual(expect.objectContaining({ replyTo: 'jane.doe@example.com' }));
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});
test('recipient env override', async () => {
  process.env.PARTNER_INQUIRY_RECIPIENT = 'ops@example.com';
  await post('/api/partner-inquiry', P);
  expect(mockSendEmail.mock.calls[0][0]).toBe('ops@example.com');
});
test('route seam: { replyTo: lead, displayName: BRAND_DISPLAY_NAME }, no From override, no cookie (§5.12, R-6)', async () => {
  process.env.BRAND_DISPLAY_NAME = 'WaveMAX Austin';
  const res = await post('/api/partner-inquiry', P);
  expect(res.headers['set-cookie']).toBeUndefined();
  expect(mockSendEmail.mock.calls[0][3]).toBeUndefined();
  expect(mockSendEmail.mock.calls[0][4]).toEqual({ replyTo: 'jane.doe@example.com', displayName: 'WaveMAX Austin' });
});
test('400 shape: errors[] carry field/msg/code, and every code resolves in all four locales', async () => {
  const res = await post('/api/partner-inquiry', { ...P, email: 'nope', volume: 'lots', firstName: '' });
  expect(res.status).toBe(400);
  expect(res.body).toEqual(expect.objectContaining({ success: false, message: 'Validation failed' }));
  const codes = res.body.errors.map((e) => e.code);
  expect(codes).toEqual(expect.arrayContaining([PARTNER_FORM_CODES.firstNameRequired, PARTNER_FORM_CODES.emailInvalid, PARTNER_FORM_CODES.volumeInvalid]));
  for (const e of res.body.errors) {
    expect(typeof e.field).toBe('string');
    expect(typeof e.msg).toBe('string');
    for (const l of LOCALES) expect(String(resolve(locale(l), e.code) || '').trim()).not.toBe('');
  }
  expect(mockSendEmail).not.toHaveBeenCalled();
});
test('every code the validators can emit resolves to a non-empty string in all four locales', () => {
  for (const l of LOCALES) {
    for (const c of [...Object.values(PARTNER_FORM_CODES), GENERIC_CODE]) expect(String(resolve(locale(l), c) || '').trim()).not.toBe('');
  }
  expect(Object.keys(PARTNER_FORM_CODES)).toHaveLength(9);
});
test('dispatch failure → 500', async () => {
  mockSendEmail.mockRejectedValueOnce(new Error('smtp down'));
  const res = await post('/api/partner-inquiry', P);
  expect(res.status).toBe(500);
  expect(res.body.success).toBe(false);
});
describe.each(['/api/affiliate-application', '/api/v1/affiliate-application'])('POST %s', (p) => {
  test('200 + notification to admin@crhsent.com with Reply-To lead', async () => {
    const res = await post(p, A);
    expect(res.status).toBe(200);
    expect(mockSendEmail.mock.calls[0][0]).toBe('admin@crhsent.com');
    expect(mockSendEmail.mock.calls[0][4]).toEqual(expect.objectContaining({ replyTo: 'sam@example.com' }));
  });
});
test('affiliate: short marketing plan → 400 with errGeneric code on message (F-3 validator)', async () => {
  const res = await post('/api/affiliate-application', { ...A, message: 'too short' });
  expect(res.status).toBe(400);
  const m = res.body.errors.find((e) => e.field === 'message');
  expect(m.code).toBe(GENERIC_CODE);
  expect(m.msg).toBe('Please give us at least a couple of sentences (80–2000 characters) on how you would find and keep customers');
});
test('Host crhsent.com → 404, nothing sent', async () => {
  const res = await post('/api/partner-inquiry', P, 'crhsent.com');
  expect(res.status).toBe(404);
  expect(mockSendEmail).not.toHaveBeenCalled();
});
test('spoof (R-3): Host crhsent.com + X-Forwarded-Host atxwashdryfold.com → 404, nothing sent', async () => {
  const res = await request(app).post('/api/partner-inquiry').set('Host', 'crhsent.com').set('X-Forwarded-Host', H).send(P);
  expect(res.status).toBe(404);
  expect(mockSendEmail).not.toHaveBeenCalled();
});
test('GET /api/partner-inquiry on a marketing host → 404 JSON', async () => {
  const res = await request(app).get('/api/partner-inquiry').set('Host', H);
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ success: false, message: 'Not found' });
});
test('any other /api/v1/… on a marketing host → 404 JSON', async () => {
  const res = await post('/api/v1/anything', P);
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ success: false, message: 'Not found' });
});
```
  The count is 14: 2 partner routes + env override + route seam + 400 shape + all codes + 500 + 2 affiliate routes + short plan + crhsent 404 + spoof + GET 404 + `/api/v1/anything`.
- [ ] 3. Write the failing test `tests/intakeFrom.test.js`. This is the route seam through the REAL web-core transport, with nodemailer mocked at the path web-core resolves:
```js
// Route seam through the REAL web-core transport (nodemailer mocked where
// web-core resolves it): proves the From / Reply-To headers a lead
// notification actually carries (spec §5.12 intake row; R-6 composition).
const path = require('path');
const coreDir = path.dirname(require.resolve('@crhs/web-core/package.json'));
const mockSendMail = jest.fn();
jest.doMock(require.resolve('nodemailer', { paths: [coreDir] }), () => ({ createTransport: () => ({ sendMail: mockSendMail }) }));
const request = require('supertest');
const app = require('../server');

const KEYS = ['EMAIL_PROVIDER', 'EMAIL_FROM', 'EMAIL_USER', 'EMAIL_FROM_NAME', 'BRAND_DISPLAY_NAME', 'BASE_URL', 'PARTNER_INQUIRY_RECIPIENT', 'EMAIL_TEMPLATE_ROOT'];
let saved;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  KEYS.forEach((k) => delete process.env[k]);
  Object.assign(process.env, { EMAIL_FROM: 'no-reply@crhsent.com', EMAIL_USER: 'no-reply@crhsent.com', BRAND_DISPLAY_NAME: 'WaveMAX Austin', BASE_URL: 'https://atxwashdryfold.com' });
  mockSendMail.mockReset().mockResolvedValue({ messageId: 'seam' });
});
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const P = { firstName: 'Jane', lastName: 'Doe', email: 'jane.doe@example.com', phone: '(512) 555-1212', businessName: 'Doe Cleaners', volume: '50-200', message: 'hi', source: '/' };

test('notification From "WaveMAX Austin" <no-reply@crhsent.com>, Reply-To the lead; thank-you Reply-To the recipient', async () => {
  const res = await request(app).post('/api/partner-inquiry').set('Host', 'atxwashdryfold.com').send(P);
  expect(res.status).toBe(200);
  const [n, t] = mockSendMail.mock.calls.map((c) => c[0]);
  expect(n.from).toBe('"WaveMAX Austin" <no-reply@crhsent.com>');
  expect(n.to).toBe('pickups@atxwashdryfold.com');
  expect(n.replyTo).toBe('jane.doe@example.com');
  expect(n.html).toContain('<img src="https://atxwashdryfold.com/assets/images/brand/logo.png" alt="WaveMAX Austin" class="logo">');
  expect(t.to).toBe('jane.doe@example.com');
  expect(t.from).toBe('"WaveMAX Austin" <no-reply@crhsent.com>');
  expect(t.replyTo).toBe('pickups@atxwashdryfold.com');
});
test('an operator-set EMAIL_FROM_NAME still wins (R-6 precedence)', async () => {
  process.env.EMAIL_FROM_NAME = 'Operator Override';
  await request(app).post('/api/partner-inquiry').set('Host', 'atxwashdryfold.com').send(P);
  expect(mockSendMail.mock.calls[0][0].from).toBe('"Operator Override" <no-reply@crhsent.com>');
});
```
- [ ] 4. Write the failing client test `tests/partnerInquiryClient.test.js`:
```js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'content', 'atxwashdryfold', 'assets', 'js', 'partner-inquiry.js'), 'utf8');

function load(table) {
  const window = {};
  if (table) window.i18n = { t: (k) => (Object.prototype.hasOwnProperty.call(table, k) ? table[k] : k) };
  const document = { readyState: 'complete', querySelectorAll: () => [], getElementById: () => null, documentElement: { lang: 'en' }, addEventListener: () => {} };
  vm.runInNewContext(SRC, { window, document });
  return window.PartnerInquiryForm;
}
const ERR = { errors: [{ field: 'email', msg: 'Valid email is required', code: 'partner.form.errEmail' }] };

test('a resolvable code renders the translation', () => {
  expect(load({ 'partner.form.errEmail': 'Se requiere un correo electrónico válido' }).errorText(ERR)).toBe('Se requiere un correo electrónico válido');
});
test('an unresolved code falls back to errGeneric', () => {
  expect(load({ 'partner.form.errGeneric': 'GENERIC' }).errorText(ERR)).toBe('GENERIC');
});
test('i18n not ready → the server msg', () => {
  expect(load(null).errorText(ERR)).toBe('Valid email is required');
});
test('a limiter body (no errors[]) → errGeneric, or body.message when i18n is absent', () => {
  const body = { success: false, message: 'Please wait a moment before sending another message.' };
  expect(load({ 'partner.form.errGeneric': 'GENERIC' }).errorText(body)).toBe('GENERIC');
  expect(load(null).errorText(body)).toBe('Please wait a moment before sending another message.');
});
```
- [ ] 5. Run `npm test -- tests/intake.test.js tests/intakeFrom.test.js tests/partnerInquiryClient.test.js`. Expected:
  - `tests/intake.test.js`: `Test suite failed to run`, `Cannot find module '../server/validation/intakeErrorCodes' from 'tests/intake.test.js'`.
  - `tests/intakeFrom.test.js`: `Tests:       2 failed, 2 total`. The first fails with `Expected: 200` / `Received: 404`. The second fails with `TypeError: Cannot read properties of undefined (reading '0')`, because no mail was sent.
  - `tests/partnerInquiryClient.test.js`: `Tests:       4 failed, 4 total`, each `TypeError: Cannot read properties of undefined (reading 'errorText')`.
- [ ] 6. Add the dependency:
```bash
node -e "const f='package.json';const j=require('./'+f);j.dependencies['express-validator']='^7.0.1';j.dependencies=Object.fromEntries(Object.entries(j.dependencies).sort());require('fs').writeFileSync(f,JSON.stringify(j,null,2)+'\n')"
npm install --no-audit --no-fund
node -p "require('express-validator/package.json').version.split('.')[0]"
node -p "require('@crhs/web-core/package.json').version"
```
  Expected: `7`, then `0.2.1`.
- [ ] 7. Create `server/validation/intakeErrorCodes.js`:
```js
'use strict';
// §5.5 "Validation copy": the partner page renders server errors, so each
// withMessage() carries a stable i18n code alongside the English msg. Keys live
// in content/atxwashdryfold/locales/{en,es,pt,de}/common.json. A rule with no
// code (length caps on optional fields, affiliate-only rules) emits errGeneric.
const PARTNER_FORM_CODES = Object.freeze({
  firstNameRequired: 'partner.form.errFirstNameRequired',
  firstNameLength: 'partner.form.errFirstNameLength',
  lastNameRequired: 'partner.form.errLastNameRequired',
  lastNameLength: 'partner.form.errLastNameLength',
  emailRequired: 'partner.form.errEmailRequired',
  emailInvalid: 'partner.form.errEmail',
  emailLength: 'partner.form.errEmailLength',
  phoneRequired: 'partner.form.errPhoneRequired',
  volumeInvalid: 'partner.form.errVolume'
});
const GENERIC_CODE = 'partner.form.errGeneric';

const coded = (code, msg) => ({ code, msg });

function formatValidationErrors(result) {
  return result.array().map((err) => {
    const field = err.path || err.param;
    if (err.msg && typeof err.msg === 'object') return { field, msg: err.msg.msg, code: err.msg.code };
    return { field, msg: err.msg, code: GENERIC_CODE };
  });
}

module.exports = { PARTNER_FORM_CODES, GENERIC_CODE, coded, formatValidationErrors };
```
- [ ] 8. Create `server/routes/partnerInquiryRoutes.js`. The rules and their order are verbatim from affiliate `server/routes/partnerInquiryRoutes.js:11-48`, with codes attached to each message:
```js
'use strict';
const express = require('express');
const { body } = require('express-validator');
const partnerInquiryController = require('../controllers/partnerInquiryController');
const { contactBurstLimiter, contactHourlyLimiter } = require('../middleware/rateLimitPolicy');
const { PARTNER_FORM_CODES: C, coded } = require('../validation/intakeErrorCodes');

const ALLOWED_VOLUMES = Object.freeze(['just-exploring', '<50', '50-200', '200+']);
const PARTNER_INQUIRY_FIELDS = Object.freeze(['firstName', 'lastName', 'email', 'phone', 'businessName', 'serviceArea', 'volume', 'message', 'source']);

const partnerInquiryValidators = [
  body('firstName')
    .exists({ checkFalsy: true }).withMessage(coded(C.firstNameRequired, 'First name is required'))
    .bail()
    .isString().trim()
    .isLength({ min: 1, max: 50 }).withMessage(coded(C.firstNameLength, 'First name must be 1–50 characters')),
  body('lastName')
    .exists({ checkFalsy: true }).withMessage(coded(C.lastNameRequired, 'Last name is required'))
    .bail()
    .isString().trim()
    .isLength({ min: 1, max: 50 }).withMessage(coded(C.lastNameLength, 'Last name must be 1–50 characters')),
  body('email')
    .exists({ checkFalsy: true }).withMessage(coded(C.emailRequired, 'Email is required'))
    .bail()
    .isEmail().withMessage(coded(C.emailInvalid, 'Valid email is required'))
    .bail()
    .isLength({ max: 100 }).withMessage(coded(C.emailLength, 'Email must be 100 characters or fewer')),
  body('phone')
    .exists({ checkFalsy: true }).withMessage(coded(C.phoneRequired, 'Phone is required'))
    .bail()
    .isString().isLength({ max: 30 }),
  body('businessName').optional({ checkFalsy: true }).isString().isLength({ max: 120 }),
  body('serviceArea').optional({ checkFalsy: true }).isString().isLength({ max: 200 }),
  body('volume')
    .optional({ checkFalsy: true })
    .isString()
    .isIn(ALLOWED_VOLUMES).withMessage(coded(C.volumeInvalid, 'Volume must be one of: ' + ALLOWED_VOLUMES.join(', '))),
  body('message').optional({ checkFalsy: true }).isString().isLength({ max: 2000 }),
  body('source').optional({ checkFalsy: true }).isString().isLength({ max: 200 })
];

const handlers = [contactBurstLimiter, contactHourlyLimiter, partnerInquiryValidators, partnerInquiryController.submitPartnerInquiry];
const router = express.Router();
router.post('/partner-inquiry', ...handlers);
// §5.5 compatibility alias for browser-cached scripts — a POST route, never a redirect. Keep 12 months after the flip.
router.post('/v1/partner-inquiry', ...handlers);

module.exports = router;
module.exports.ALLOWED_VOLUMES = ALLOWED_VOLUMES;
module.exports.PARTNER_INQUIRY_FIELDS = PARTNER_INQUIRY_FIELDS;
```
- [ ] 9. Create `server/routes/affiliateApplicationRoutes.js`. The rules are verbatim from affiliate `server/routes/affiliateApplicationRoutes.js:12-60`, with the shared codes on the four contact fields. The F-3 `message` rule (`:53-58`: `.exists({ checkFalsy: true })` + `.isLength({ min: 80, max: 2000 })` with the owner's two messages) is kept verbatim:
```js
'use strict';
const express = require('express');
const { body } = require('express-validator');
const affiliateApplicationController = require('../controllers/affiliateApplicationController');
const { contactBurstLimiter, contactHourlyLimiter } = require('../middleware/rateLimitPolicy');
const { PARTNER_FORM_CODES: C, coded } = require('../validation/intakeErrorCodes');

const ALLOWED_AFFILIATIONS = Object.freeze(['ut-student', 'ut-alum', 'other']);
const ALLOWED_TRANSPORT = Object.freeze(['car', 'bike', 'scooter', 'on-foot', 'other']);
const AFFILIATE_APPLICATION_FIELDS = Object.freeze(['firstName', 'lastName', 'email', 'phone', 'affiliation', 'serviceArea', 'transport', 'availability', 'message', 'source']);

const affiliateApplicationValidators = [
  body('firstName')
    .exists({ checkFalsy: true }).withMessage(coded(C.firstNameRequired, 'First name is required'))
    .bail()
    .isString().trim()
    .isLength({ min: 1, max: 50 }).withMessage(coded(C.firstNameLength, 'First name must be 1–50 characters')),
  body('lastName')
    .exists({ checkFalsy: true }).withMessage(coded(C.lastNameRequired, 'Last name is required'))
    .bail()
    .isString().trim()
    .isLength({ min: 1, max: 50 }).withMessage(coded(C.lastNameLength, 'Last name must be 1–50 characters')),
  body('email')
    .exists({ checkFalsy: true }).withMessage(coded(C.emailRequired, 'Email is required'))
    .bail()
    .isEmail().withMessage(coded(C.emailInvalid, 'Valid email is required'))
    .bail()
    .isLength({ max: 100 }).withMessage(coded(C.emailLength, 'Email must be 100 characters or fewer')),
  body('phone')
    .exists({ checkFalsy: true }).withMessage(coded(C.phoneRequired, 'Phone is required'))
    .bail()
    .isString().isLength({ max: 30 }),
  body('affiliation')
    .optional({ checkFalsy: true })
    .isString()
    .isIn(ALLOWED_AFFILIATIONS).withMessage('Affiliation must be one of: ' + ALLOWED_AFFILIATIONS.join(', ')),
  body('serviceArea').optional({ checkFalsy: true }).isString().isLength({ max: 200 }),
  body('transport')
    .optional({ checkFalsy: true })
    .isString()
    .isIn(ALLOWED_TRANSPORT).withMessage('Transport must be one of: ' + ALLOWED_TRANSPORT.join(', ')),
  body('availability').optional({ checkFalsy: true }).isString().isLength({ max: 200 }),
  // REQUIRED since 2026-09-11 (F-3): the customer-acquisition plan is what the program screens on.
  body('message')
    .exists({ checkFalsy: true }).withMessage('Please describe how you would market the service and build your customer base')
    .bail()
    .isString().trim()
    .isLength({ min: 80, max: 2000 })
    .withMessage('Please give us at least a couple of sentences (80–2000 characters) on how you would find and keep customers'),
  body('source').optional({ checkFalsy: true }).isString().isLength({ max: 200 })
];

const handlers = [contactBurstLimiter, contactHourlyLimiter, affiliateApplicationValidators, affiliateApplicationController.submitAffiliateApplication];
const router = express.Router();
router.post('/affiliate-application', ...handlers);
router.post('/v1/affiliate-application', ...handlers); // §5.5 compatibility alias, 12 months

module.exports = router;
module.exports.ALLOWED_AFFILIATIONS = ALLOWED_AFFILIATIONS;
module.exports.ALLOWED_TRANSPORT = ALLOWED_TRANSPORT;
module.exports.AFFILIATE_APPLICATION_FIELDS = AFFILIATE_APPLICATION_FIELDS;
```
- [ ] 10. Create `server/routes/intakeRoutes.js`:
```js
'use strict';
// §5.5 intake router, mounted at /api for marketing hosts only (§5.2 step 14).
const express = require('express');
const router = express.Router();
router.use(require('./partnerInquiryRoutes'));
router.use(require('./affiliateApplicationRoutes'));
module.exports = router;
```
- [ ] 11. Create `server/controllers/partnerInquiryController.js`:
```js
'use strict';
const { validationResult } = require('express-validator');
const wc = require('@crhs/web-core');
const partnerInquiryService = require('../services/partnerInquiryService');
const { formatValidationErrors } = require('../validation/intakeErrorCodes');

const ControllerHelpers = wc.controllerHelpers;

/* Public partner-program inquiry form. */
exports.submitPartnerInquiry = ControllerHelpers.asyncWrapper(async (req, res) => {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: formatValidationErrors(result) });
  }
  const { firstName, lastName, email, phone, businessName, serviceArea, volume, message, source } = req.body;
  try {
    await partnerInquiryService.sendPartnerInquiry({ firstName, lastName, email, phone, businessName, serviceArea, volume, message, source });
  } catch (err) {
    wc.logger.error('Partner-inquiry email dispatch failed', { error: err.message });
    return ControllerHelpers.sendError(res, 'Could not send your inquiry — please try again later.', 500);
  }
  return ControllerHelpers.sendSuccess(res, {}, "Thanks — your inquiry has been sent. We'll be in touch shortly.");
});
```
  Then create `server/controllers/affiliateApplicationController.js`:
```js
'use strict';
const { validationResult } = require('express-validator');
const wc = require('@crhs/web-core');
const affiliateApplicationService = require('../services/affiliateApplicationService');
const { formatValidationErrors } = require('../validation/intakeErrorCodes');

const ControllerHelpers = wc.controllerHelpers;

/* Public affiliate-recruitment application form. */
exports.submitAffiliateApplication = ControllerHelpers.asyncWrapper(async (req, res) => {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: formatValidationErrors(result) });
  }
  const { firstName, lastName, email, phone, affiliation, serviceArea, transport, availability, message, source } = req.body;
  try {
    await affiliateApplicationService.sendAffiliateApplication({ firstName, lastName, email, phone, affiliation, serviceArea, transport, availability, message, source });
  } catch (err) {
    wc.logger.error('Affiliate-application email dispatch failed', { error: err.message });
    return ControllerHelpers.sendError(res, 'Could not submit your application — please try again later.', 500);
  }
  return ControllerHelpers.sendSuccess(res, {}, "Thanks — your application is in. We'll be in touch shortly.");
});
```
- [ ] 12. Mount the router in `server.js`, directly above Task 45's catch-all:
```bash
sed -i "/^const contentHandler = require('.\/server\/contentHandler');$/a const intakeRouter = require('./server/routes/intakeRoutes');" server.js
sed -i "/^\/\/ §5.2 step 14 — marketing \/api\/\* that no intake route claimed → 404 JSON.$/i // §5.2 step 14 / §5.5 — marketing intake endpoints (+ the /api/v1 compatibility aliases).\napp.use('/api', marketingOnly(intakeRouter));" server.js
grep -n "marketingOnly(intakeRouter)\|marketingOnly(marketingApiNotFound)" server.js
```
  Expected: two lines, with `intakeRouter` on the lower line number.
- [ ] 13. Raise the parity count in `tests/i18nParity.test.js` from 110 to 119. The three lines come from A15 Tasks 37/38.
```bash
node -e '
const fs=require("fs");const f="tests/i18nParity.test.js";let s=fs.readFileSync(f,"utf8");
const R=[
 ["const EXPECTED_PARTNER_LEAVES = 110; // 109 moved + partner.plant.reliefAria; A7 adds 9 err codes → 119","const EXPECTED_PARTNER_LEAVES = 119; // 109 moved + partner.plant.reliefAria + the nine §5.5 validator codes (A7)"],
 ["test(\x27(2) top level is exactly [\"partner\"] with 110 leaves\x27","test(\x27(2) top level is exactly [\"partner\"] with 119 leaves\x27"],
 ["expect(out).toContain(\x27i18n parity OK: 110 keys × 4 locales\x27);","expect(out).toContain(\x27i18n parity OK: 119 keys × 4 locales\x27);"]
];
for (const [a,b] of R){const n=s.split(a).length-1;if(n!==1){console.error("expected 1 occurrence, found "+n+": "+a);process.exit(1);}s=s.replace(a,b);}
fs.writeFileSync(f,s);console.log("3 lines updated");'
npm test -- tests/i18nParity.test.js
```
  Expected: `3 lines updated`, then `2 failed`:
  - `(2) top level is exactly ["partner"] with 119 leaves` fails with `Expected length: 119` / `Received length: 110`.
  - `npm run check:i18n exits 0` fails with `Expected substring: "i18n parity OK: 119 keys × 4 locales"`.
- [ ] 14. Add the nine keys under `partner.form` in all four locales:
```bash
node -e '
const fs=require("fs");
const K={
 en:{errFirstNameRequired:"First name is required",errFirstNameLength:"First name must be 1–50 characters",errLastNameRequired:"Last name is required",errLastNameLength:"Last name must be 1–50 characters",errEmailRequired:"Email is required",errEmail:"Valid email is required",errEmailLength:"Email must be 100 characters or fewer",errPhoneRequired:"Phone is required",errVolume:"Please pick an estimated weekly volume from the list."},
 es:{errFirstNameRequired:"El nombre es obligatorio",errFirstNameLength:"El nombre debe tener entre 1 y 50 caracteres",errLastNameRequired:"El apellido es obligatorio",errLastNameLength:"El apellido debe tener entre 1 y 50 caracteres",errEmailRequired:"El correo electrónico es obligatorio",errEmail:"Se requiere un correo electrónico válido",errEmailLength:"El correo electrónico debe tener 100 caracteres o menos",errPhoneRequired:"El teléfono es obligatorio",errVolume:"Elige un volumen semanal estimado de la lista."},
 pt:{errFirstNameRequired:"O nome é obrigatório",errFirstNameLength:"O nome deve ter de 1 a 50 caracteres",errLastNameRequired:"O sobrenome é obrigatório",errLastNameLength:"O sobrenome deve ter de 1 a 50 caracteres",errEmailRequired:"O e-mail é obrigatório",errEmail:"Informe um e-mail válido",errEmailLength:"O e-mail deve ter no máximo 100 caracteres",errPhoneRequired:"O telefone é obrigatório",errVolume:"Escolha um volume semanal estimado da lista."},
 de:{errFirstNameRequired:"Vorname ist erforderlich",errFirstNameLength:"Der Vorname muss 1–50 Zeichen lang sein",errLastNameRequired:"Nachname ist erforderlich",errLastNameLength:"Der Nachname muss 1–50 Zeichen lang sein",errEmailRequired:"E-Mail ist erforderlich",errEmail:"Bitte geben Sie eine gültige E-Mail-Adresse an",errEmailLength:"Die E-Mail darf höchstens 100 Zeichen lang sein",errPhoneRequired:"Telefonnummer ist erforderlich",errVolume:"Bitte wählen Sie ein geschätztes Wochenvolumen aus der Liste."}};
for (const l of Object.keys(K)) { const f=`content/atxwashdryfold/locales/${l}/common.json`; const j=JSON.parse(fs.readFileSync(f,"utf8")); Object.assign(j.partner.form,K[l]); fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n"); }'
git diff --stat content/atxwashdryfold/locales
```
  Expected: `4 files changed, 40 insertions(+), 4 deletions(-)`.
  - Per file, that is the 9 new key lines, plus the previous last key of `partner.form` (`errNetwork` in all four locales, verified in the affiliate sources A15 copied verbatim) rewritten to gain a trailing comma: 1 deletion and 1 insertion.
  - Total: 4 × (9 + 1) = 40 insertions, 4 × 1 = 4 deletions.
  - If the stat shows anything other than 40/4, the A4 files were not `JSON.stringify(…, null, 2)` formatted. Run `git checkout content/atxwashdryfold/locales` and add the nine lines by hand after the last key of `partner.form`.
- [ ] 15. Edit `content/atxwashdryfold/assets/js/partner-inquiry.js`. It inserts `errorText` after the `t()` helper (`:7-16`) and replaces the two `var msg` lines at `:100-101`. A15 Task 34 already changed their address to `pickups@atxwashdryfold.com`. The script's `?v=20260909a` stamp stays: nothing has served that URL publicly yet, because the origin is dark and the `:3000` origin never referenced it.
```bash
cat > /tmp/a7-partner-inquiry-edit.js <<'EOF'
const fs = require('fs');
const f = 'content/atxwashdryfold/assets/js/partner-inquiry.js';
let s = fs.readFileSync(f, 'utf8');
const ANCHOR = '    return fallback;\n  }\n';
const OLD = "            var msg = (r.body && (r.body.message || (r.body.errors && r.body.errors[0] && r.body.errors[0].msg))) ||\n" +
  "              t('partner.form.errGeneric', 'Something went wrong sending your inquiry. Please try again, or email pickups@atxwashdryfold.com.');\n";
const NEW = '            var msg = errorText(r.body);\n';
const BLOCK = `
  // Server error → localized copy (§5.5). A validator error carries a stable
  // i18n code (errors[].code); a missing or unresolved code falls back to
  // partner.form.errGeneric, and only when i18n is not ready is the server's
  // English shown.
  var FALLBACK_ERR = 'Something went wrong sending your inquiry. Please try again, or email pickups@atxwashdryfold.com.';
  function errorText(body) {
    var first = body && body.errors && body.errors[0];
    var viaCode = first && first.code ? t(first.code, null) : null;
    if (viaCode) return viaCode;
    return t('partner.form.errGeneric', (first && first.msg) || (body && body.message) || FALLBACK_ERR);
  }
  window.PartnerInquiryForm = { errorText: errorText };
`;
for (const [name, needle] of [['t() helper end', ANCHOR], ['var msg lines', OLD]]) {
  const n = s.split(needle).length - 1;
  if (n !== 1) { console.error(`${name}: expected 1 occurrence, found ${n}`); process.exit(1); }
}
s = s.replace(ANCHOR, ANCHOR + BLOCK).replace(OLD, NEW);
fs.writeFileSync(f, s);
console.log('partner-inquiry.js edited');
EOF
node /tmp/a7-partner-inquiry-edit.js && grep -c 'pickups@atxwashdryfold.com' content/atxwashdryfold/assets/js/partner-inquiry.js
```
  Expected: `partner-inquiry.js edited`, then `2`. The count is 2 because the `FALLBACK_ERR` constant replaces the deleted `errGeneric` line, and the `errNetwork` line is unchanged. That keeps A15 Task 34's count assertion green.
- [ ] 16. Run the suites:
```bash
npm test -- tests/intake.test.js tests/intakeFrom.test.js tests/partnerInquiryClient.test.js tests/i18nParity.test.js tests/rateLimitPolicy.test.js tests/contentHandler.test.js
```
  Expected PASS, every suite green:
  - `tests/intake.test.js`: `Tests:       14 passed, 14 total`
  - `tests/intakeFrom.test.js`: `Tests:       2 passed, 2 total`
  - `tests/partnerInquiryClient.test.js`: `Tests:       4 passed, 4 total`
  - `tests/rateLimitPolicy.test.js`: `Tests:       8 passed, 8 total`

  Then run `npm test 2>&1 | grep -E '^Tests:'` (no `failed` segment), `npm run check:i18n` (prints `i18n parity OK: 119 keys × 4 locales`, exit 0) and `npm run lint` (clean).
- [ ] 17. Commit all Task 53 files in one commit, per the §5.5 same-commit rule:
```bash
git add server/validation server/routes server/controllers server.js package.json package-lock.json content/atxwashdryfold/locales content/atxwashdryfold/assets/js/partner-inquiry.js tests/intake.test.js tests/intakeFrom.test.js tests/partnerInquiryClient.test.js tests/i18nParity.test.js
git commit -m "feat(intake): POST /api/partner-inquiry + /api/affiliate-application on marketing hosts with coded validator errors in 4 locales (D2a, §5.5)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 54: Prove the intake routes survive core losing its contact limiters (extends Task 49's guard)

**Files:**
- Modify `tests/rateLimitPolicy.test.js`

**Interfaces:**
- Consumes `server/routes/intakeRoutes.js` (Task 53) and `server/middleware/rateLimitPolicy.js` (Task 49).

- [ ] 1. Add this case as the last test inside the `describe('rateLimitPolicy — …')` block in `tests/rateLimitPolicy.test.js`:
```js
  test('the intake router builds against a core without its contact limiters (no undefined route callback)', () => {
    jest.isolateModules(() => {
      jest.doMock('@crhs/web-core', () => {
        const actual = jest.requireActual('@crhs/web-core');
        const stripped = new Proxy(actual.rateLimiting, {
          get: (t, k) => ((k === 'contactFormBurstLimiter' || k === 'contactFormLimiter') ? undefined : t[k])
        });
        return new Proxy(actual, { get: (t, k) => (k === 'rateLimiting' ? stripped : t[k]) });
      });
      expect(require('@crhs/web-core').rateLimiting.contactFormBurstLimiter).toBeUndefined();
      expect(() => require('../server/routes/intakeRoutes')).not.toThrow();
    });
  });
```
- [ ] 2. Run `npm test -- tests/rateLimitPolicy.test.js`. Expected: `Tests:       9 passed, 9 total`.
- [ ] 3. Prove the guard bites. Temporarily point the partner routes at core's limiter:
```bash
sed -i "s|^const { contactBurstLimiter, contactHourlyLimiter } = require('../middleware/rateLimitPolicy');$|const { contactFormBurstLimiter: contactBurstLimiter, contactHourlyLimiter } = require('@crhs/web-core').rateLimiting;|" server/routes/partnerInquiryRoutes.js
npm test -- tests/rateLimitPolicy.test.js
```
  Expected: `Tests:       2 failed, 7 passed, 9 total`.
  - The new case fails with `Expected the function not to throw an error.` and `Error: Route.post() requires a callback function but got a [object Undefined]`.
  - The source scan fails with `Expected: []` / `Received: ["…/server/routes/partnerInquiryRoutes.js"]`.
- [ ] 4. Restore and re-run: `git checkout server/routes/partnerInquiryRoutes.js && npm test -- tests/rateLimitPolicy.test.js`. Expected PASS: `Tests:       9 passed, 9 total`.
- [ ] 5. Commit:
```bash
git add tests/rateLimitPolicy.test.js
git commit -m "test(rate-limit): intake routes survive core deleting its contact limiters (copy-before-delete)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 55: Form ↔ validator contract for the moved pages (`tests/intakeForms.test.js`)

**Files:**
- Create `tests/intakeForms.test.js`

**Interfaces:**
- Consumes:
  - the route exports from Task 53
  - the A3 files (A15 Tasks 32/34): `content/atxwashdryfold/index.html` (copied from affiliate `public/partner-program.html`), `content/atxwashdryfold/affiliate/index.html` (from `public/affiliate.html`), and `content/atxwashdryfold/assets/js/{partner-inquiry,affiliate-inquiry}.js`

- [ ] 1. Write `tests/intakeForms.test.js`, ported from affiliate `tests/unit/partnerInquiryForm.test.js` and `tests/unit/affiliateApplicationForm.test.js`:
```js
const fs = require('fs');
const path = require('path');
const C = (...p) => fs.readFileSync(path.join(__dirname, '..', 'content', 'atxwashdryfold', ...p), 'utf8');
const { PARTNER_INQUIRY_FIELDS, ALLOWED_VOLUMES } = require('../server/routes/partnerInquiryRoutes');
const { AFFILIATE_APPLICATION_FIELDS, ALLOWED_AFFILIATIONS, ALLOWED_TRANSPORT } = require('../server/routes/affiliateApplicationRoutes');

const formNames = (html) => {
  const names = new Set(); const re = /<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"/g; let m;
  while ((m = re.exec(html))) names.add(m[1]);
  return names;
};

describe.each([
  ['partner inquiry', C('index.html'), C('assets', 'js', 'partner-inquiry.js'), PARTNER_INQUIRY_FIELDS, '/api/partner-inquiry', [...ALLOWED_VOLUMES]],
  ['affiliate application', C('affiliate', 'index.html'), C('assets', 'js', 'affiliate-inquiry.js'), AFFILIATE_APPLICATION_FIELDS, '/api/affiliate-application', [...ALLOWED_AFFILIATIONS, ...ALLOWED_TRANSPORT]]
])('%s form ↔ server contract', (_n, html, js, fields, endpoint, enumValues) => {
  test('every validator field has a form control, and the form adds none', () => {
    const names = formNames(html);
    for (const f of fields) expect(names.has(f)).toBe(true);
    for (const n of names) expect(fields).toContain(n);
  });
  test('enum option values match the server', () => {
    for (const v of enumValues) expect(html).toContain(`value="${v.replace(/</g, '&lt;')}"`);
  });
  test('contact fields are required in the markup', () => {
    for (const f of ['firstName', 'lastName', 'email', 'phone']) expect(new RegExp(`name="${f}"[^>]*\\brequired`).test(html)).toBe(true);
  });
  test('the script posts to the unversioned endpoint and never /api/v1/', () => {
    expect(js).toContain(`fetch('${endpoint}'`);
    expect(js).not.toContain('/api/v1/');
  });
});
```
- [ ] 2. Run `npm test -- tests/intakeForms.test.js`. Expected: `Tests:       8 passed, 8 total` (2 forms × 4). The markup it checks already exists, so the test passes on first run; the next step proves it bites.
- [ ] 3. Prove it bites: `sed -i 's/name="phone"/name="telephone"/' content/atxwashdryfold/index.html && npm test -- tests/intakeForms.test.js`. Expected: `Tests:       2 failed, 6 passed, 8 total`. Both partner "every validator field" and "contact fields are required" fail with `Expected: true` / `Received: false`.
- [ ] 4. Restore: `git checkout content/atxwashdryfold/index.html && npm test -- tests/intakeForms.test.js`. Expected PASS: `Tests:       8 passed, 8 total`. Then run `npm test 2>&1 | grep -E '^Tests:'` (no `failed` segment) and `npm run lint` (clean).
- [ ] 5. Commit, push, and open PR A7:
```bash
git add tests/intakeForms.test.js
git commit -m "test(intake): form↔validator contract for the moved marketing pages

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin plan2/a7-intake
gh pr create --base main --head plan2/a7-intake --title "A7: marketing intake endpoints + corporate rate-limit policy + intake mail" --body "Spec §5.5 (D2a): POST /api/partner-inquiry + /api/affiliate-application (+ /api/v1 aliases) on marketing hosts only; contact limiters copied into server/middleware/rateLimitPolicy.js (copy-before-delete); env recipients + Reply-To + displayName (R-6); nine partner.form.err* codes in en/es/pt/de. Requires @crhs/web-core 0.2.1.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---
### Task 56: Host-aware CSP (§5.9, spec PR A8)

**Files:**
- Create `server/middleware/hostAwareCsp.js`
- Create `tests/csp.test.js`
- Modify `server.js`: delete the inline CSP block that starts `// Manual, nonce-based CSP.` (corporate `8133667` `:52-72`, which A15 left in place directly after `app.use(resolveHost);`), and add one require

**Interfaces:**
- Consumes:
  - `wc.buildCspDirectives({ profile, nonce, useStrictCSP, frameAncestors, frameSrcExtra })`, `wc.isStrictCspPath(path, { strictCSPPages })` and `wc.serializeCspDirectives(d)` (`crhs-web-core/src/security/cspDirectives.js:148`, `:174`, `:250`)
  - `hostKind(req)` from `server/config/hosts.js` (R-3)
  - `res.locals.cspNonce` from `wc.cspNonce`
- Produces:
  - `hostAwareCsp(req, res, next)`
  - `.DEMO_PATH = '/wavemax/clickjacking-demo.html'`
  - `.DEMO_FRAME_SRC`: three origins, per P1-c
  - `.STRICT_CSP_PAGES = []`: passed explicitly, per Global Constraint 11

- [ ] 1. Create the branch: `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && git switch main && git pull --ff-only && git switch -c plan2/a8-csp`. Then write the failing test `tests/csp.test.js`:
```js
const request = require('supertest');
const app = require('../server');
const MARKETING = ['atxwashdryfold.com', 'rundberglaundry.com', 'runberglaundry.com', 'atxwashateria.com'];
const FORBIDDEN = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'code.jquery.com', 'www.local-marketing-reports.com', 'static.cloudflareinsights.com',
  'maps.googleapis.com', 'connect.facebook.net', 'challenges.cloudflare.com', 'www.gstatic.com', 'www.google.com', 'apis.google.com'];
const dir = (csp, name) => (csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) || '');
// web-core 'marketing' profile serialized under NODE_ENV=test (no upgrade-insecure-requests; that is added only in production).
const EXPECTED = (n) => `default-src 'self'; script-src 'self' 'nonce-${n}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'self'; frame-src 'none'; form-action 'self'; frame-ancestors 'self'; base-uri 'self'; child-src 'none'; worker-src 'self'; manifest-src 'self'`;

describe.each(MARKETING)('marketing CSP profile on %s', (host) => {
  test.each(['/', '/affiliate', '/robots.txt'])('%s: strict marketing profile, byte-exact', async (p) => {
    const csp = (await request(app).get(p).set('Host', host)).headers['content-security-policy'];
    const nonce = (csp.match(/'nonce-([^']+)'/) || [])[1];
    expect(nonce).toBeTruthy();
    expect(csp).toBe(EXPECTED(nonce));
    expect(dir(csp, 'script-src')).not.toContain("'unsafe-inline'");
    for (const origin of FORBIDDEN) expect(csp).not.toContain(origin);
  });
});
describe('crhsent.com keeps the full profile with frame-ancestors self', () => {
  test.each(['/', '/wavemax/'])('%s: frame-ancestors self', async (p) => {
    const csp = (await request(app).get(p).set('Host', 'crhsent.com')).headers['content-security-policy'];
    expect(dir(csp, 'frame-ancestors')).toBe("frame-ancestors 'self'");
  });
  test('/wavemax/ stays strict (nonce, no unsafe-inline in script-src)', async () => {
    const csp = (await request(app).get('/wavemax/').set('Host', 'crhsent.com')).headers['content-security-policy'];
    expect(dir(csp, 'script-src')).toMatch(/'nonce-/);
    expect(dir(csp, 'script-src')).not.toContain("'unsafe-inline'");
  });
  test('the clickjacking demo keeps the app-supplied frame origins (Plan 1: three)', async () => {
    const csp = (await request(app).get('/wavemax/clickjacking-demo.html').set('Host', 'crhsent.com')).headers['content-security-policy'];
    for (const o of require('../server/middleware/hostAwareCsp').DEMO_FRAME_SRC) expect(dir(csp, 'frame-src')).toContain(o);
  });
  test('spoof (R-3): Host crhsent.com + X-Forwarded-Host atxwashdryfold.com keeps the full profile', async () => {
    const csp = (await request(app).get('/').set('Host', 'crhsent.com').set('X-Forwarded-Host', 'atxwashdryfold.com')).headers['content-security-policy'];
    expect(dir(csp, 'frame-src')).not.toBe("frame-src 'none'");
    expect(dir(csp, 'script-src')).toContain('https://cdnjs.cloudflare.com');
  });
});
```
  The count is 4 × 3 + 2 + 1 + 1 + 1 = 17.
- [ ] 2. Run `npm test -- tests/csp.test.js`. Expected: `Tests:       13 failed, 4 passed, 17 total`.
  - The 12 marketing cases fail with `expect(received).toBe(expected)`. The received header begins `default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net …`, because today every host gets the `full` profile, which on non-strict paths carries the third-party hosts and `'unsafe-inline'`.
  - The demo case fails with `Cannot find module '../server/middleware/hostAwareCsp' from 'tests/csp.test.js'`.
  - The two crhsent `frame-ancestors` cases, `/wavemax/` strict, and the spoof case pass already.
- [ ] 3. Create `server/middleware/hostAwareCsp.js`:
```js
'use strict';
// §5.2 step 5 / §5.9: host-aware CSP.
// - Marketing hosts: web-core 'marketing' profile, strict on EVERY path incl. '/'
//   (every asset self-hosted; frame-src 'none'; frame-ancestors 'self').
// - Everything else (crhsent.com, unknown hosts, /health without Host): the
//   'full' profile with the path predicate, frame-ancestors 'self', and the
//   clickjacking demo's app-owned frame origins (§7.2.5). Plan 1 shipped THREE
//   demo origins (spec §5.9 lists two) and tests/csp.integration.test.js pins
//   them — Plan 1 wins.
// Host from hostKind() → requestHost(): the Host header only (R-3).
// strictCSPPages is passed EXPLICITLY (Global Constraint 11: web-core's default
// became [] in Plan 1 B3c, so an omitted option silently weakens the CSP).
const wc = require('@crhs/web-core');
const { hostKind } = require('../config/hosts');

const DEMO_PATH = '/wavemax/clickjacking-demo.html';
const DEMO_FRAME_SRC = Object.freeze(['https://www.wavemaxlaundry.com', 'https://wavemaxlaundry.com', 'https://rundberglaundry.com']);
const STRICT_CSP_PAGES = Object.freeze([]);

function hostAwareCsp(req, res, next) {
  const nonce = res.locals.cspNonce;
  const directives = hostKind(req) === 'marketing'
    ? wc.buildCspDirectives({ profile: 'marketing', nonce, useStrictCSP: true, frameAncestors: ["'self'"] })
    : wc.buildCspDirectives({
      profile: 'full',
      nonce,
      useStrictCSP: wc.isStrictCspPath(req.path, { strictCSPPages: [...STRICT_CSP_PAGES] }),
      frameAncestors: ["'self'"],
      frameSrcExtra: req.path === DEMO_PATH ? [...DEMO_FRAME_SRC] : []
    });
  res.setHeader('Content-Security-Policy', wc.serializeCspDirectives(directives));
  next();
}

module.exports = hostAwareCsp;
module.exports.DEMO_PATH = DEMO_PATH;
module.exports.DEMO_FRAME_SRC = DEMO_FRAME_SRC;
module.exports.STRICT_CSP_PAGES = STRICT_CSP_PAGES;
```
- [ ] 4. Replace the inline CSP block in `server.js`:
```bash
cat > /tmp/a8-csp-edit.js <<'EOF'
const fs = require('fs');
const f = 'server.js';
let s = fs.readFileSync(f, 'utf8');
const start = s.indexOf('// Manual, nonce-based CSP.');
const endMarker = "  res.setHeader('Content-Security-Policy', wc.serializeCspDirectives(directives));\n  next();\n});\n";
const end = s.indexOf(endMarker, start);
if (start < 0 || end < 0) { console.error('inline CSP block not found'); process.exit(1); }
s = s.slice(0, start) +
  '// §5.2 step 5 — host-aware CSP (marketing profile vs full; contract in §5.9).\napp.use(hostAwareCsp);\n' +
  s.slice(end + endMarker.length);
s = s.replace("const contentHandler = require('./server/contentHandler');\n",
  "const contentHandler = require('./server/contentHandler');\nconst hostAwareCsp = require('./server/middleware/hostAwareCsp');\n");
fs.writeFileSync(f, s);
console.log('csp block replaced');
EOF
node /tmp/a8-csp-edit.js
grep -n "app.use(resolveHost);\|app.use(hostAwareCsp);\|app.get('/health'\|DEMO_FRAME_SRC\|buildCspDirectives" server.js
```
  Expected: `csp block replaced`. Then the lines `app.use(resolveHost);`, `app.use(hostAwareCsp);` and `app.get('/health'`, in that order, with no `DEMO_FRAME_SRC` or `buildCspDirectives` line left in `server.js`.
- [ ] 5. Run `npm test -- tests/csp.test.js tests/csp.integration.test.js tests/server.integration.test.js tests/health.test.js`. Expected PASS, every suite green, with `tests/csp.test.js` at `Tests:       17 passed, 17 total`. Then run `npm test 2>&1 | grep -E '^Tests:'` (no `failed` segment) and `npm run lint` (clean).
- [ ] 6. Commit, push, and open PR A8:
```bash
git add server/middleware/hostAwareCsp.js server.js tests/csp.test.js
git commit -m "golden(csp): deliberate re-capture (D16a)

feat(csp): host-aware CSP — marketing profile strict on every path; crhsent frame-ancestors 'self' (§5.9)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin plan2/a8-csp
gh pr create --base main --head plan2/a8-csp --title "A8: host-aware CSP (marketing profile)" --body "Spec §5.9. Marketing hosts get web-core's marketing profile on every path; crhsent keeps full + frame-ancestors 'self' and the three Plan-1 demo frame origins.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

### Task 57: accessGate mail identity, title, absolute logo and owners alt (§5.10, R-3, R-6, R-24)

This task is the SOLE owner of the accessGate mail identity (R-1).

**Files:**
- Modify `server/middleware/accessGate.js`. Lines at `8133667`:
  - `:13` header comment
  - `:54` `GATE_FROM`
  - `:161` `<title>`
  - `:179` spinner comment
  - `:246-250` `confirmEmailHtml`
  - `:345` the send. The link host lines `:343-344` are replaced by A15 Task 26, which defines `linkHost`; this task consumes `linkHost` and does not re-edit them
  - the `require('../config/hosts')` line that A15 Task 26 added
  - the `module.exports` block
- Modify `tests/accessGate.test.js`: `:93`, `:204`, plus a new `describe` at the end of the file
- Create `tests/gateMailFrom.test.js`
- Modify `content/crhsent/owners/index.html:30`

**Interfaces:**
- Consumes:
  - `requestHost(req)` and `CORPORATE_HOST = 'crhsent.com'` from `server/config/hosts.js` (A15 Task 21)
  - `linkHost` in the `/__gate` POST handler of `server/middleware/accessGate.js` — `requestHost(req) === CORPORATE_HOST ? requestHost(req) : CORPORATE_HOST`, built by A15 Task 26 Step 5 (R-3.3); the emailed link already uses it
  - `sendEmail(to, subject, html, fromOverride, { displayName })` (web-core v0.2.1, pinned by Task 51)
- Produces:
  - The gate link mail calls `sendEmail(email, 'Your CRHS Enterprises access link', html, undefined, { displayName: 'CRHS Enterprises' })`. With `EMAIL_FROM=no-reply@crhsent.com`, web-core composes the From `"CRHS Enterprises" <no-reply@crhsent.com>`, which is the `GATE_FROM` target of Global Constraint 6. That From is always the SMTP login's own address (R-24), and an operator-set `EMAIL_FROM_NAME` still wins (R-6).
  - `accessGate.GATE_DISPLAY_NAME = 'CRHS Enterprises'`.
  - `confirmEmailHtml(link, host)`. The logo is `https://${host}/assets/images/brand/logo.png` with `alt="CRHS Enterprises"`. `host` is A15 Task 26's `linkHost` (`requestHost(req)` when that equals `CORPORATE_HOST`, and `CORPORATE_HOST` otherwise), so no client header can choose the emailed link or logo host (R-3.3).
  - Gate pages are titled `<title>CRHS Enterprises</title>`.
  - `content/crhsent/owners/index.html` reads `alt="WaveMAX Austin"`. This changes the A15 Task 20 baseline path `/owners/`; see the slice preamble.

R-24 production note: this code and the `EMAIL_USER`/`EMAIL_FROM` switch to `no-reply@crhsent.com` must go live in ONE `pm2 reload`. That deploy is owned by the GATE slice. The code is safe against today's production env, where `EMAIL_USER` and `EMAIL_FROM` are both `no-reply@wavemax.promo`: web-core composes `"CRHS Enterprises" <no-reply@wavemax.promo>`, an address the login owns.

- [ ] 1. `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && git switch main && git pull --ff-only && git switch -c plan2/a9-mail-hygiene`
- [ ] 2. Record the accessGate suite baseline. A15 Task 26 added cases, so the count comes from this run, not a constant:
```bash
npx jest tests/accessGate.test.js 2>&1 | grep -E '^Tests:'
```
  Expected: a line `Tests:       BASE passed, BASE total` with no `failed` segment. Write down BASE; on the A15 draft it is `25` (23 at `8133667` + 2 from A15 Task 26).
- [ ] 3. Edit the two existing assertions in `tests/accessGate.test.js`:
```bash
cat > /tmp/a9-gate-test-edit.js <<'EOF'
const fs = require('fs');
const f = 'tests/accessGate.test.js';
let s = fs.readFileSync(f, 'utf8');
function once(from, to) {
  const n = s.split(from).length - 1;
  if (n !== 1) { console.error(`expected 1 occurrence, found ${n}: ${from}`); process.exit(1); }
  s = s.replace(from, to);
}
once("mkReq({ path: '/assets/images/brand/logo-wavemax.png' })", "mkReq({ path: '/assets/images/brand/logo.png' })");
once("    expect(sendEmail.mock.calls[0][3]).toContain('admin@rundberglaundry.com'); // From override\n",
  "    expect(sendEmail.mock.calls[0][3]).toBeUndefined(); // no From override: web-core composes \"CRHS Enterprises\" <EMAIL_FROM> (R-6, R-24)\n" +
  "    expect(sendEmail.mock.calls[0][4]).toEqual({ displayName: 'CRHS Enterprises' });\n");
fs.writeFileSync(f, s);
console.log('2 assertions updated');
EOF
node /tmp/a9-gate-test-edit.js
```
  Expected: `2 assertions updated`.
- [ ] 4. Append the new `describe` to the end of `tests/accessGate.test.js`. It has its own `beforeEach`, so it does not depend on the outer block's:
```bash
cat >> tests/accessGate.test.js <<'EOF'

describe('gate mail identity + branding (§5.10, R-3, R-6, R-24)', () => {
  const { salt, hash } = hashPassword('correct-horse');
  const post = (headers) => mkReq({ method: 'POST', path: '/__gate', ip: '7.7.8.1', headers, body: { email: 'user@example.com', password: 'correct-horse', next: '/wavemax/' } });
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(accessGate._cache, { enabled: true, salt, hash, ips: new Map() });
    AccessRequest.create.mockResolvedValue({});
    AccessRequest.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    sendEmail.mockResolvedValue({ messageId: 'x' });
  });

  it('passes displayName "CRHS Enterprises" (no From override), CRHS subject, absolute crhsent logo, zero WaveMAX', async () => {
    await accessGate(post({ host: 'crhsent.com' }), mkRes(), jest.fn());
    const [to, subject, html, fromOverride, options] = sendEmail.mock.calls[0];
    expect(to).toBe('user@example.com');
    expect(fromOverride).toBeUndefined();
    expect(options).toEqual({ displayName: 'CRHS Enterprises' });
    expect(subject).toBe('Your CRHS Enterprises access link');
    expect(html).toContain('<img src="https://crhsent.com/assets/images/brand/logo.png" alt="CRHS Enterprises"');
    expect(html).not.toMatch(/wavemax/i);
  });

  it('link and logo host never come from a client header (R-3)', async () => {
    await accessGate(post({ host: 'attacker.example', 'x-forwarded-host': 'attacker.example' }), mkRes(), jest.fn());
    const html = sendEmail.mock.calls[0][2];
    expect(html).toContain('<img src="https://crhsent.com/assets/images/brand/logo.png"');
    expect(html).toContain('href="https://crhsent.com/__gate/confirm?token=');
    expect(html).not.toContain('attacker.example');
  });

  it('gate pages are titled CRHS Enterprises', () => {
    const page = accessGate._landingPage(null, '/', '', 'n');
    expect(page).toContain('<title>CRHS Enterprises</title>');
    expect(page).not.toContain('<title>WaveMAX</title>');
  });
});
EOF
```
- [ ] 5. Create `tests/gateMailFrom.test.js`, which drives the gate through the REAL web-core transport:
```js
// The literal From the gate link mail carries, through the REAL web-core
// transport (nodemailer mocked where web-core resolves it). Spec §5.12's
// accessGate row asserts "CRHS Enterprises" <no-reply@crhsent.com>; under R-6
// that header is composed by web-core from { displayName } + EMAIL_FROM.
const path = require('path');
const coreDir = path.dirname(require.resolve('@crhs/web-core/package.json'));
const mockSendMail = jest.fn();
jest.doMock(require.resolve('nodemailer', { paths: [coreDir] }), () => ({ createTransport: () => ({ sendMail: mockSendMail }) }));
const { hashPassword } = require('@crhs/web-core').encryption;
const accessGate = require('../server/middleware/accessGate');

const KEYS = ['EMAIL_PROVIDER', 'EMAIL_FROM', 'EMAIL_USER', 'EMAIL_FROM_NAME'];
let saved;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  KEYS.forEach((k) => delete process.env[k]);
  Object.assign(process.env, { EMAIL_FROM: 'no-reply@crhsent.com', EMAIL_USER: 'no-reply@crhsent.com' });
  mockSendMail.mockReset().mockResolvedValue({ messageId: 'gate' });
  const { salt, hash } = hashPassword('correct-horse');
  Object.assign(accessGate._cache, { enabled: true, salt, hash, ips: new Map() });
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  accessGate._cache.enabled = false;
});

test('gate link mail: From "CRHS Enterprises" <no-reply@crhsent.com>, CRHS subject, absolute crhsent logo', async () => {
  const res = {};
  res.status = jest.fn(() => res); res.type = jest.fn(() => res); res.send = jest.fn(() => res); res.redirect = jest.fn(() => res);
  res.locals = { cspNonce: 'n' };
  const req = { method: 'POST', path: '/__gate', originalUrl: '/__gate', headers: { host: 'crhsent.com' }, query: {}, body: { email: 'user@example.com', password: 'correct-horse', next: '/' }, ip: '198.51.100.40' };
  await accessGate(req, res, jest.fn());
  expect(res.redirect).toHaveBeenCalledWith('/__gate/sent');
  const m = mockSendMail.mock.calls[0][0];
  expect(m.from).toBe('"CRHS Enterprises" <no-reply@crhsent.com>');
  expect(m.to).toBe('user@example.com');
  expect(m.subject).toBe('Your CRHS Enterprises access link');
  expect(m.html).toContain('<img src="https://crhsent.com/assets/images/brand/logo.png" alt="CRHS Enterprises"');
});
```
- [ ] 6. Run `npx jest tests/accessGate.test.js tests/gateMailFrom.test.js`. Expected:
  - `tests/accessGate.test.js`: `Tests:       4 failed, BASE-1 passed, BASE+3 total`.
    - The modified link test and new case 1 fail with `expect(received).toBeUndefined()` / `Received: "\"WaveMAX\" <admin@rundberglaundry.com>"`.
    - New case 2 fails with `Expected substring: "<img src=\"https://crhsent.com/assets/images/brand/logo.png\""`, because the logo is still relative.
    - New case 3 fails with `Expected substring: "<title>CRHS Enterprises</title>"`.
  - `tests/gateMailFrom.test.js`: `Tests:       1 failed, 1 total`, with `Expected: "\"CRHS Enterprises\" <no-reply@crhsent.com>"` / `Received: "\"WaveMAX\" <admin@rundberglaundry.com>"`.
- [ ] 7. Edit `server/middleware/accessGate.js`:
```bash
cat > /tmp/a9-gate-edit.js <<'EOF'
const fs = require('fs');
const f = 'server/middleware/accessGate.js';
let s = fs.readFileSync(f, 'utf8');
function once(from, to) {
  const n = s.split(from).length - 1;
  if (n !== 1) { console.error(`expected 1 occurrence, found ${n}: ${from.slice(0, 80)}`); process.exit(1); }
  s = s.replace(from, to);
}
once(`const GATE_FROM = '"WaveMAX" <admin@rundberglaundry.com>';`,
  '// Gate link mail display name (§5.10, R-6). No From override: web-core composes\n' +
  '// "CRHS Enterprises" <EMAIL_FROM || EMAIL_USER>, so the sending identity is always\n' +
  '// the SMTP login\'s own address (no Mailcow sender_acl dependency — R-24) and an\n' +
  '// operator-set EMAIL_FROM_NAME still wins.\n' +
  "const GATE_DISPLAY_NAME = 'CRHS Enterprises';");
once('<title>WaveMAX</title>', '<title>CRHS Enterprises</title>');
once('/* WaveMAX swirl spinner — revealed on form submit */', '/* swirl spinner — revealed on form submit */');
once('emailed (from admin@rundberglaundry.com)', 'emailed (From "CRHS Enterprises" <EMAIL_FROM>)');
once('function confirmEmailHtml(link) {', 'function confirmEmailHtml(link, host) {');
once('<img src="/assets/images/brand/logo.png" alt="WaveMAX" style="height:40px">',
  '<img src="https://${esc(host)}/assets/images/brand/logo.png" alt="CRHS Enterprises" style="height:40px">');
once("await sendEmail(email, 'Your WaveMAX access link', confirmEmailHtml(link), GATE_FROM);",
  "await sendEmail(email, 'Your CRHS Enterprises access link', confirmEmailHtml(link, linkHost), undefined, { displayName: GATE_DISPLAY_NAME });");
once('module.exports._landingPage = landingPage;', 'module.exports._landingPage = landingPage;\nmodule.exports.GATE_DISPLAY_NAME = GATE_DISPLAY_NAME;');
// hosts import (added by A15 Task 26): make sure it names requestHost AND CORPORATE_HOST
const imp = s.match(/^const \{([^}]*)\} = require\('\.\.\/config\/hosts'\);$/m);
if (!imp) { console.error("require('../config/hosts') line not found — A15 Task 26 has not landed"); process.exit(1); }
const names = new Set(imp[1].split(',').map((x) => x.trim()).filter(Boolean));
names.add('requestHost'); names.add('CORPORATE_HOST');
s = s.replace(imp[0], `const { ${[...names].join(', ')} } = require('../config/hosts');`);
// the emailed link + logo host (R-3.3) is A15 Task 26's linkHost: consume it, never re-derive it
const linkHostLines = s.match(/^ {6}const linkHost = requestHost\(req\) === CORPORATE_HOST \? requestHost\(req\) : CORPORATE_HOST;$/gm) || [];
if (linkHostLines.length !== 1 || !s.includes('      const link = `https://${linkHost}/__gate/confirm?token=${token}`;')) {
  console.error('A15 Task 26 linkHost lines not found — A15 Task 26 has not landed'); process.exit(1);
}
fs.writeFileSync(f, s);
console.log('accessGate edited');
EOF
node /tmp/a9-gate-edit.js
grep -cE "x-forwarded-host|req\.hostname|GATE_FROM" server/middleware/accessGate.js
```
  Expected: `accessGate edited`, then `0`.
- [ ] 8. Edit the owners page:
```bash
sed -i 's/alt="WaveMAX Laundry"/alt="WaveMAX Austin"/' content/crhsent/owners/index.html
grep -c 'alt="WaveMAX Austin"' content/crhsent/owners/index.html
grep -c 'alt="WaveMAX Laundry"' content/crhsent/owners/index.html
```
  Expected: `1`, then `0`.
- [ ] 9. Run `npx jest tests/accessGate.test.js tests/gateMailFrom.test.js tests/content-manifest.test.js tests/hostScoping.test.js`. Expected PASS:
  - `tests/accessGate.test.js`: `Tests:       BASE+3 passed, BASE+3 total`
  - `tests/gateMailFrom.test.js`: `Tests:       1 passed, 1 total`
  - the other two suites green

  Then run `npm test 2>&1 | grep -E '^Tests:'` (no `failed` segment) and `npm run lint` (clean).
- [ ] 10. Commit:
```bash
git add server/middleware/accessGate.js tests/accessGate.test.js tests/gateMailFrom.test.js content/crhsent/owners/index.html
git commit -m "fix(gate): gate mail as \"CRHS Enterprises\" via displayName, absolute crhsent logo, header-proof link host, owners alt (§5.10, R-3, R-6, R-24)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 58: Boot refuses to start on a bad mail config (`validateMailConfig`, R-24 + R-25)

**Files:**
- Create `server/bootMail.js`
- Create `tests/bootMail.test.js`
- Modify `server.js`: one require next to `const { seedSystemConfig } = require('./server/bootstrap');` (`8133667` `:36`), and one call directly above `      await db.connect();` (`:130`)

**Interfaces:**
- Consumes `wc.email.validateMailConfig({ templateRoot })` (web-core v0.2.1, pinned by Task 51) and `templateRoot()` (Task 50). `validateMailConfig` logs its own `logger.error` line before throwing one of:
  - `validateMailConfig: neither EMAIL_FROM nor EMAIL_USER is set`
  - `validateMailConfig: EMAIL_FROM domain "<d1>" does not match EMAIL_USER domain "<d2>" (the SMTP login must own the From address)`
  - `validateMailConfig: base-template.html not found in <root>`
- Produces `assertMailConfig(): { from, user, templateRoot }`. On failure it logs `Mail configuration invalid; refusing to start: <message>` and rethrows. The boot IIFE's existing catch then calls `process.exit(1)`.

- [ ] 1. Write the failing test `tests/bootMail.test.js`:
```js
const fs = require('fs');
const path = require('path');
const wc = require('@crhs/web-core');
const KEYS = ['EMAIL_FROM', 'EMAIL_USER', 'EMAIL_TEMPLATE_ROOT'];
let saved;
beforeEach(() => { saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])); KEYS.forEach((k) => delete process.env[k]); });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } jest.restoreAllMocks(); });
const { assertMailConfig } = require('../server/bootMail');
const pair = () => Object.assign(process.env, { EMAIL_FROM: 'no-reply@crhsent.com', EMAIL_USER: 'no-reply@crhsent.com' });

test('throws when the template root has no base-template.html', () => {
  pair(); process.env.EMAIL_TEMPLATE_ROOT = '/nonexistent';
  expect(() => assertMailConfig()).toThrow('validateMailConfig: base-template.html not found in /nonexistent');
});
test('throws when EMAIL_FROM domain ≠ EMAIL_USER domain (the 2026-08-24 553 class)', () => {
  Object.assign(process.env, { EMAIL_FROM: 'no-reply@crhsent.com', EMAIL_USER: 'no-reply@wavemax.promo' });
  expect(() => assertMailConfig()).toThrow('validateMailConfig: EMAIL_FROM domain "crhsent.com" does not match EMAIL_USER domain "wavemax.promo" (the SMTP login must own the From address)');
});
test('throws when neither EMAIL_FROM nor EMAIL_USER is set', () => {
  expect(() => assertMailConfig()).toThrow('validateMailConfig: neither EMAIL_FROM nor EMAIL_USER is set');
});
test('logs the refusal (after web-core\'s own line) before rethrowing', () => {
  const spy = jest.spyOn(wc.logger, 'error').mockImplementation(() => {});
  expect(() => assertMailConfig()).toThrow();
  expect(spy.mock.calls.map((c) => c[0])).toContain('Mail configuration invalid; refusing to start: validateMailConfig: neither EMAIL_FROM nor EMAIL_USER is set');
});
test('passes with the code-default root and a matching pair; that root renders the real template, not FALLBACK_TEMPLATE', async () => {
  pair();
  expect(assertMailConfig()).toEqual({ from: 'no-reply@crhsent.com', user: 'no-reply@crhsent.com', templateRoot: require('../server/config/email').DEFAULT_TEMPLATE_ROOT });
  const html = await wc.email.templateManager.loadTemplate('base-template', 'en', require('../server/config/email').templateRoot());
  expect(html).toContain('class="logo"');
});
test('server.js calls assertMailConfig() before db.connect(), unwrapped, inside the exiting boot try', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const check = code.indexOf('assertMailConfig();');
  expect(check).toBeGreaterThan(-1);
  expect(check).toBeLessThan(code.indexOf('await db.connect();'));
  expect(code).not.toMatch(/try\s*\{\s*assertMailConfig\(\);\s*\}\s*catch/);
});
```
- [ ] 2. Run `npm test -- tests/bootMail.test.js`. Expected: `Test suite failed to run` with `Cannot find module '../server/bootMail' from 'tests/bootMail.test.js'`.
- [ ] 3. Create `server/bootMail.js`:
```js
'use strict';
// R-24 + R-25 boot hard check (spec §5.13 A9, web-core B3j): refuse to start
// when EMAIL_FROM's domain differs from EMAIL_USER's, when neither is set, or
// when the template root lacks base-template.html. Deliberately fail-CLOSED,
// unlike the SystemConfig seed: a silent mail misconfig is the 2026-08-24
// outage class.
const wc = require('@crhs/web-core');
const { templateRoot } = require('./config/email');

function assertMailConfig() {
  try {
    return wc.email.validateMailConfig({ templateRoot: templateRoot() });
  } catch (err) {
    wc.logger.error(`Mail configuration invalid; refusing to start: ${err.message}`);
    throw err;
  }
}

module.exports = { assertMailConfig };
```
- [ ] 4. Edit `server.js`:
```bash
sed -i "/^const { seedSystemConfig } = require('.\/server\/bootstrap');$/a const { assertMailConfig } = require('./server/bootMail');" server.js
sed -i "s|^      await db.connect();$|      // R-24/R-25: a mail identity the SMTP login cannot send as, or a template\n      // root without base-template.html, refuses boot (catch below → exit 1).\n      assertMailConfig();\n      await db.connect();|" server.js
grep -n "assertMailConfig\|await db.connect();\|process.exit(1)" server.js
```
  Expected, in this order: the require line; `      assertMailConfig();`; `      await db.connect();`; `      process.exit(1);`.
- [ ] 5. Run `npm test -- tests/bootMail.test.js tests/bootResilience.test.js`. Expected PASS: `tests/bootMail.test.js` at `Tests:       6 passed, 6 total`, and `tests/bootResilience.test.js` still green (4 tests). Then run `npm test 2>&1 | grep -E '^Tests:'` (no `failed` segment) and `npm run lint` (clean).
- [ ] 6. Commit:
```bash
git add server/bootMail.js server.js tests/bootMail.test.js
git commit -m "feat(boot): refuse to start on a mismatched mail identity or missing template root (R-24, R-25)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 59: `.env.example`, README and `content/crhsent/README.md` hygiene (§5.11)

This task is the SOLE owner of corporate `.env.example` (R-1). It merges every key the deleted P0 Task 12 documented: `SESSION_COOKIE_NAME=crhsent.sid`, `LOG_SERVICE_NAME=crhs-corporate`, `LOG_DIR=/var/www/crhs-corporate/logs`, `EMAIL_HOST=158.62.198.7`, `EMAIL_USER`/`EMAIL_FROM=no-reply@crhsent.com`, `EMAIL_TLS_SERVERNAME=mail.crhsent.com`, both intake recipients, the dotenv header fix, and the `__Host-crhsent.sid` / `sessions_corporate` note.

**Files:**
- Modify `.env.example` (rewritten whole; every existing key kept except `CORPORATE_SITE_URL` (F-2) and the commented `CORS_ORIGIN`/`CORS_EXTRA_ORIGINS` knobs, which become the R-2 absence note)
- Modify `README.md` (the `## Deploy` section, from its heading through the line before the final `---`)
- Modify `content/crhsent/README.md` (the tracked file A1 moved; the crhsent manifest stays at 49 files)
- Create `tests/packageHygiene.test.js`

**Interfaces:**
- Consumes the `package.json` script `check:i18n` = `node scripts/check-i18n-parity.js` (A15 Task 38) and the `express-validator` `^7.0.1` dependency (Task 53).
- Produces the documented env contract that the GATE slice's production `.env` write follows. No task in this slice writes a production `.env` (R-2).

- [ ] 1. Write the failing test `tests/packageHygiene.test.js`:
```js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const pkg = require('../package.json');
const ENV = read('.env.example');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const REQUIRED = {
  SESSION_COOKIE_NAME: 'crhsent.sid', RATE_LIMIT_COLLECTION_PREFIX: 'ratelimit_corp_', LOG_SERVICE_NAME: 'crhs-corporate',
  LOG_DIR: '/var/www/crhs-corporate/logs', EMAIL_PROVIDER: 'smtp', EMAIL_HOST: '158.62.198.7', EMAIL_PORT: '587',
  EMAIL_USER: 'no-reply@crhsent.com', EMAIL_PASS: '', EMAIL_FROM: 'no-reply@crhsent.com', EMAIL_TLS_SERVERNAME: 'mail.crhsent.com',
  EMAIL_TEMPLATE_ROOT: '/var/www/crhs-corporate/server/templates/emails', BRAND_DISPLAY_NAME: 'WaveMAX Austin',
  BRAND_LEGAL_NAME: 'CRHS Enterprises, LLC', BASE_URL: 'https://atxwashdryfold.com',
  PARTNER_INQUIRY_RECIPIENT: 'pickups@atxwashdryfold.com', AFFILIATE_APPLICATION_RECIPIENT: 'admin@crhsent.com',
  STORE_IP_ADDRESS: '72.190.1.227', ADDITIONAL_STORE_IPS: '', STORE_IP_RANGES: ''
};

test('package.json: express-validator ^7.0.1 (A7) and check:i18n (A4)', () => {
  expect(pkg.dependencies['express-validator']).toBe('^7.0.1');
  expect(pkg.scripts['check:i18n']).toBe('node scripts/check-i18n-parity.js');
});
test.each(Object.entries(REQUIRED))('.env.example documents %s=%s', (k, v) => {
  expect(ENV).toMatch(new RegExp(`^${k}=("?)${esc(v)}\\1(\\s|$)`, 'm'));
});
test('.env.example: the stale "no dotenv" header is gone; the clean-shell reload rule is stated (pm2 holds no .env key)', () => {
  expect(ENV).not.toMatch(/uses NO dotenv/);
  expect(ENV).toContain('#   pm2 reload crhs-corporate --update-env');
  expect(ENV).not.toContain('. ./.env; set +a; pm2 reload');
});
test('.env.example: CORS_ORIGIN is intentionally absent, with the parseList reason (R-2)', () => {
  expect(ENV).not.toMatch(/^#?\s*CORS_ORIGIN=/m);
  expect(ENV).toContain("parseList('')");
});
test('.env.example: no EMAIL_FROM_NAME, CORPORATE_SITE_URL or FRONTEND_URL line (R-6, F-2)', () => {
  expect(ENV).not.toMatch(/^#?\s*(EMAIL_FROM_NAME|CORPORATE_SITE_URL|FRONTEND_URL)=/m);
});
test('.env.example sources cleanly in bash (values with spaces/commas are quoted)', () => {
  const r = spawnSync('bash', ['-c', 'set -a; . ./.env.example; set +a; printf "%s|%s" "$BRAND_DISPLAY_NAME" "$BRAND_LEGAL_NAME"'], { cwd: ROOT, encoding: 'utf8' });
  expect(r.stderr).toBe('');
  expect(r.stdout).toBe('WaveMAX Austin|CRHS Enterprises, LLC');
});
test('README: rsync deploy, mandatory web-core re-copy, exit(0) boot probe, combined.log evidence, truthful rollback', () => {
  const r = read('README.md');
  expect(r).not.toMatch(/monorepo still\s+ships the crhsent handler/);
  expect(r).not.toContain('git reset --hard');
  expect(r).not.toMatch(/check `pm2 logs crhs-corporate`/);
  for (const s of ['rsync -az', 'rm -rf node_modules/@crhs/web-core', 'process.exit(0)', 'combined.log', 'e2107288']) expect(r).toContain(s);
});
test('content/crhsent/README.md describes the per-host content roots served by Express', () => {
  const r = read('content', 'crhsent', 'README.md');
  expect(r).toContain('content/crhsent/');
  expect(r).toContain('content/atxwashdryfold/');
  expect(r).not.toMatch(/served\s+directly by the `crhsent\.com` nginx server block/);
  expect(r).not.toContain('git pull');
});
```
  The count is 1 + 20 + 1 + 1 + 1 + 1 + 1 + 1 = 27.
- [ ] 2. Run `npm test -- tests/packageHygiene.test.js`. Expected: `Tests:       18 failed, 9 passed, 27 total`.
  - Failing: twelve `REQUIRED` rows (`SESSION_COOKIE_NAME`, `RATE_LIMIT_COLLECTION_PREFIX`, `LOG_SERVICE_NAME`, `LOG_DIR`, `EMAIL_HOST`, `EMAIL_TEMPLATE_ROOT`, `BRAND_DISPLAY_NAME`, `BRAND_LEGAL_NAME`, `BASE_URL`, `PARTNER_INQUIRY_RECIPIENT`, `AFFILIATE_APPLICATION_RECIPIENT`, `STORE_IP_ADDRESS`), each `expect(received).toMatch(expected)`, e.g. `Expected pattern: /^RATE_LIMIT_COLLECTION_PREFIX=("?)ratelimit_corp_\1(\s|$)/m`. Also failing: the header, CORS, absence, bash-sourcing (`Expected: "WaveMAX Austin|CRHS Enterprises, LLC"` / `Received: "|"`), README and content README tests.
  - Passing: `package.json` and the `EMAIL_PROVIDER`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`, `EMAIL_TLS_SERVERNAME`, `ADDITIONAL_STORE_IPS`, `STORE_IP_RANGES` rows.
- [ ] 3. Rewrite `.env.example`:
```bash
cat > .env.example <<'EOF'
# crhs-corporate — environment reference
# =====================================================================
# Copy to `.env` on each box and fill real values. server.js and
# scripts/ensure-indexes.js load this file with dotenv at startup, so the file
# IS read by the running app. dotenv NEVER overrides a variable that is already
# in the process environment, and `pm2 reload --update-env` MERGES the calling
# shell's variables into pm2's saved environment and never removes one. So pm2
# must hold NO key from this file (the Plan 2 Phase 0a exit state): after
# editing .env on a box, reload from a clean ssh shell WITHOUT sourcing it:
#   pm2 reload crhs-corporate --update-env
# An exported key would outlive its later deletion from .env (finding F-1).
# Any value containing a space or a comma is double-quoted so a one-off script
# can still `set -a; . ./.env; set +a` in bash (unquoted, BRAND_DISPLAY_NAME
# would run a command named `Austin` and export nothing).
#
# IMPORTANT — shared secrets: crhs-corporate serves crhsent.com from the SAME
# MongoDB and behind the SAME gates as the monorepo (`wavemax`, :3000). Use the
# *identical secret VALUES as the monorepo* for SESSION_SECRET, JWT_SECRET and
# ENCRYPTION_KEY so gate cookies and gate state stay valid across :3001 and a
# :3000 rollback. Not new random values.
# =====================================================================

# --- Core -------------------------------------------------------------
NODE_ENV=production
PORT=3001                       # crhs-corporate port (monorepo `wavemax` = 3000)

# --- Database (REQUIRED) ---------------------------------------------
# Same MongoDB/Oracle-ADB instance as the monorepo (gate collections are shared).
MONGODB_URI=mongodb+srv://user:pass@host/dbname
# ensure-indexes only: default is TLS on (Oracle ADB requires it). Set to
# `false` for a plain, non-TLS local Mongo.
MONGODB_TLS=

# --- Shared secrets (REQUIRED — match the monorepo's values) ----------
SESSION_SECRET=                 # session cookies + mediatorGate cookie signing
JWT_SECRET=                     # mediatorGate cookie-signing fallback (web-core)
ENCRYPTION_KEY=                 # 64-char hex; web-core AES-256-GCM at rest

# --- Sessions / rate limits / logging ---------------------------------
# Cookie base: production sends __Host-crhsent.sid, on crhsent.com only (the
# marketing hosts set no cookie). The session collection is the literal
# sessions_corporate in server.js. Renaming either drops every live session.
SESSION_COOKIE_NAME=crhsent.sid
RATE_LIMIT_COLLECTION_PREFIX=ratelimit_corp_   # per-app collections: ratelimit_corp_api, _contact_burst, _contact_hourly
LOG_SERVICE_NAME=crhs-corporate                # Winston service tag (web-core 0.2.1 default is app)
LOG_DIR=/var/www/crhs-corporate/logs           # ABSOLUTE — a relative value lands under the process cwd

# --- Access gate (email magic-link flow on crhsent.com) ---------------
# NOTE: the access gate has NO env toggle. It is enabled at runtime via the
# SystemConfig key `access_gate_enabled` (seed it in the shared DB, no redeploy).
# The gate emails single-use links, so the EMAIL_* settings below are required
# for it to function.
# The link mail is sent as "CRHS Enterprises" <EMAIL_FROM>: accessGate passes the
# display name CRHS Enterprises and web-core composes the From from EMAIL_FROM
# (falling back to EMAIL_USER). EMAIL_FROM_NAME is intentionally ABSENT: web-core
# resolves the name as fromName > EMAIL_FROM_NAME > displayName, so setting it
# would rename BOTH the gate mail and the marketing intake mail.

# --- Email (REQUIRED: gate link mail + marketing intake mail) ----------
# Boot refuses to start (server/bootMail.js → web-core validateMailConfig) when
# EMAIL_FROM's domain differs from EMAIL_USER's, when neither is set, or when
# the template root has no base-template.html (the 2026-08-24 553 outage class).
EMAIL_PROVIDER=smtp                    # `smtp` (nodemailer) or `console` (dev: log only)
EMAIL_HOST=158.62.198.7                # Mailcow by IP; the transport pins EMAIL_TLS_SERVERNAME
EMAIL_PORT=587                         # 465 ⇒ implicit TLS; otherwise STARTTLS
EMAIL_USER=no-reply@crhsent.com        # the SMTP login; MUST own EMAIL_FROM
EMAIL_PASS=
EMAIL_FROM=no-reply@crhsent.com
EMAIL_TLS_SERVERNAME=mail.crhsent.com  # used only when EMAIL_HOST is a bare IP
EMAIL_TEMPLATE_ROOT=/var/www/crhs-corporate/server/templates/emails

# --- Brand + intake recipients (marketing hosts) ----------------------
BRAND_DISPLAY_NAME="WaveMAX Austin"          # intake From display name + [BRAND_NAME]
BRAND_LEGAL_NAME="CRHS Enterprises, LLC"     # [BRAND_LEGAL]
BASE_URL=https://atxwashdryfold.com          # [BRAND_LOGO] absolute URL (this app serves logo.png)
# Intake notification recipients (D2a). Each notification carries Reply-To: the
# lead; each thank-you carries Reply-To: the recipient.
PARTNER_INQUIRY_RECIPIENT=pickups@atxwashdryfold.com
AFFILIATE_APPLICATION_RECIPIENT=admin@crhsent.com

# --- Mediator gate (/wavemax IP-binding gate) -------------------------
MEDIATOR_GATE_ENABLED=false     # `true` turns the /wavemax gate on (else no-op)
MEDIATOR_GATE_PASSWORDS=        # comma-separated shared passwords (one per viewer)

# --- Admin / store IPs (mediatorGate bypass + marketing-host store 302) --
ADMIN_ALLOWLIST=                # comma-separated IPs that skip the mediator gate
ADMIN_IP=                       # single admin IP (folded into the allowlist)
STORE_IP_ADDRESS=72.190.1.227   # store public IP; also drives the marketing-host → portal 302 (§5.8)
ADDITIONAL_STORE_IPS=           # comma-separated extra store IPs (copy the portal's value)
STORE_IP_RANGES=                # comma-separated CIDR ranges (copy the portal's value)

# --- CORS: intentionally ABSENT (R-2) -----------------------------------
# Do not add a CORS origin list for this app, not even an empty one.
# web-core corsConfig reads parseList(process.env.CORS_ORIGIN); parseList('')
# and an unset variable both return [], so NO cross-origin request is admitted.
# That is correct: crhsent.com content makes no cross-origin fetch/XHR (the
# clickjacking demo uses frame-src, not CORS) and the marketing hosts run no
# CORS middleware at all (corporateOnly). Production carried the origins
# http://localhost:3000, http://127.0.0.1:3000 and https://wavemax.promo until
# Phase 0a: credentialed CORS for origins this app never serves (finding F-1).
# The PORTAL is different: its server.js falls back to localhost when the value
# is empty, so the portal keeps a non-empty list.

# --- Optional web-core knobs (sane defaults if unset) -----------------
# LOG_LEVEL=info                # debug | info | warn | error
# LOG_MAX_FILES=                # log rotation retention
# LOG_MAX_SIZE_MB=              # per-file rotation size
# RELAX_RATE_LIMITING=          # `true` multiplies limits 10× (non-prod)
# RATE_LIMIT_MAX_REQUESTS=      # override the api limiter ceiling
EOF
bash -c 'set -a; . ./.env.example; set +a; printf "%s|%s\n" "$BRAND_DISPLAY_NAME" "$BRAND_LEGAL_NAME"'
```
  Expected: `WaveMAX Austin|CRHS Enterprises, LLC`, with nothing on stderr.
- [ ] 4. Replace the `## Deploy` section of `README.md` (from the `## Deploy` heading through the line before the final `---`):
````bash
cat > /tmp/crhs-readme-deploy.md <<'EOF'
## Deploy

crhs-corporate runs as its own PM2 app (`crhs-corporate`, **2 cluster workers on
:3001**) beside the portal (`wavemax`, :3000) on both OCI boxes — oci1
`161.153.71.201` and oci2 `144.24.4.202`. nginx routes `crhsent.com` → :3001;
the marketing hosts move to :3001 only in the Plan 3 nginx flips. It shares the
portal's MongoDB and gate secrets (see `.env.example`).

### How the code reaches the boxes

`/var/www/crhs-corporate` and `/var/www/crhs-web-core` on the boxes are **rsync
targets, not git checkouts**: there is no `.git` directory and no GitHub auth on
either box. This app depends on `@crhs/web-core` via **`file:../crhs-web-core`**,
resolved with `.npmrc install-links=true`, so the two directories sit side by
side under `/var/www/`.

Two things follow from `install-links=true`, and both bite silently if ignored:

1. **This app declares the four shared stateful deps itself.** `mongoose`,
   `express-session`, `connect-mongo` and `express-rate-limit` are listed in
   this repo's `package.json` `dependencies` at *exactly* the ranges
   `@crhs/web-core` lists as `peerDependencies` (`^8.15.0`, `^1.18.1`,
   `^5.1.0`, `7.1.4`). That character-identical pairing is what makes npm
   install ONE top-level copy of each, shared by this app's models and by
   web-core's. **Dropping a declaration — or letting a range drift from
   web-core's peer range — reintroduces a silent dual-package install:** npm
   nests a second copy, model registration forks, and nothing errors. With the
   declarations in place a real divergence is a loud `ERESOLVE` at install
   time. `tests/packageTopology.test.js` and `tests/models.test.js` guard it.
   Do **not** add `mongodb`: the driver must come from mongoose.
2. **`node_modules/@crhs/web-core` is a real *copy*, not a symlink, and
   `npm install --install-links` does NOT re-copy it** — neither when the
   version is unchanged nor on a version bump (measured 2026-09-12: plain
   install, `--force` and `--package-lock-only` all keep the old copy). Always
   `rm -rf node_modules/@crhs/web-core` before installing, on a dev box and on
   oci1/oci2 alike.

The portal (`/var/www/wavemax/wavemax-affiliate-program`) consumes the same
`/var/www/crhs-web-core`. Since web-core `v0.2.0` the portal and web-core are a
bidirectional boot-breaker pair: a web-core rsync must be followed by the
portal's own `rm -rf node_modules/@crhs/web-core`, reinstall and reload in the
same window.

### Deploy one box (oci1 first, verify, then oci2 — never both at once)

From the dev machine (`IP` is the box; variables expand locally):

```bash
IP=161.153.71.201
TS=$(date -u +%Y%m%dT%H%M%SZ); echo "TS=$TS"   # keep it: the rollback needs it
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "mkdir -p ~/deploy-snapshots && tar -C /var/www --exclude=node_modules --exclude=.git --exclude=logs -czf ~/deploy-snapshots/crhs-corporate-$TS.tgz crhs-corporate crhs-web-core && ls -l ~/deploy-snapshots/crhs-corporate-$TS.tgz"
rsync -az --delete --exclude node_modules --exclude .git --exclude logs --exclude coverage -e 'ssh -i ~/.ssh/oci_wavemax' /mnt/c/Users/rickh/GitHub/crhs-web-core/ ubuntu@$IP:/var/www/crhs-web-core/
rsync -az --delete --exclude node_modules --exclude .git --exclude logs --exclude coverage --exclude .env -e 'ssh -i ~/.ssh/oci_wavemax' /mnt/c/Users/rickh/GitHub/crhs-corporate/ ubuntu@$IP:/var/www/crhs-corporate/
```

Then on the box (`ssh -i ~/.ssh/oci_wavemax ubuntu@$IP`):

```bash
cd /var/www/crhs-corporate
test -f .env && echo ENV_KEPT                                        # ENV_KEPT
rm -rf node_modules/@crhs/web-core                                   # MANDATORY
npm install --install-links --no-audit --no-fund
node -p "require('@crhs/web-core/package.json').version"             # the release just delivered
node -p "Object.keys(require('@crhs/web-core')).length"              # 26
node -p "Object.keys(require('@crhs/web-core').csrf).includes('createCsrf')"                                   # true
node -p "require.resolve('mongoose',{paths:[require.resolve('@crhs/web-core')]}) === require.resolve('mongoose')"  # true
node -e "try{require('./server.js');process.exit(0)}catch(e){console.log(e.message);process.exit(1)}"; echo "boot probe exit=$?"  # boot probe exit=0
pm2 reload crhs-corporate --update-env                              # from this clean ssh shell, never after sourcing .env
pm2 jlist | grep -c '"EMAIL_USER"'                                  # 0: pm2 holds no .env key (dotenv reads .env at boot)
curl -s -H 'Host: crhsent.com' http://127.0.0.1:3001/health         # {"status":"ok"}
```

The explicit `process.exit(0)` in the boot probe is required (Plan 1 deploy
finding c): without it the probe does not measure module-load health. The
reload never sources `.env`: `pm2 reload --update-env` merges the calling
shell's variables into pm2's saved environment and never removes one, and
dotenv never overrides a variable already present, so an exported key would
outlive its deletion from `.env` (finding F-1's mechanism).

### Boot and runtime evidence

Read `$LOG_DIR/combined.log` (production: `/var/www/crhs-corporate/logs/combined.log`,
JSON lines with `timestamp`, `message` and `service`), filtered to lines after
the reload. Expect at least two `crhs-corporate listening on 3001` lines (two
workers), and new lines tagged `"service":"crhs-corporate"`:

```bash
grep 'crhs-corporate listening on 3001' /var/www/crhs-corporate/logs/combined.log | tail -2
```

Never use `pm2 logs crhs-corporate` as evidence: web-core's production logger
has no Console transport, so pm2 stdout is empty by design. Never count
`Access gate cache loaded`: the 60-second cache refresh logs it every minute
per worker.

### Rollback

- **crhsent.com (this app).** Restore the snapshot taken before the deploy,
  reinstall and reload. From the dev machine, with the same `IP` and `TS`:

```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "cd /var/www && tar -xzf ~/deploy-snapshots/crhs-corporate-$TS.tgz && cd crhs-corporate && rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund && pm2 reload crhs-corporate --update-env && curl -s -H 'Host: crhsent.com' http://127.0.0.1:3001/health"
```

  The snapshot also restores `/var/www/crhs-web-core` and `.env`. When that
  changes the web-core version, reinstall and reload the portal in the same
  window (boot-breaker pair). `tar -x` does not delete files added since the
  snapshot; the restored `server.js` does not load them.
  Pointing nginx `crhsent.com` back at `:3000` is **not** a rollback: the portal
  no longer ships a crhsent handler (removed in affiliate commit `e2107288`).
- **A marketing host, after its Plan-3 nginx flip.** Set that vhost's
  `proxy_pass` back to `http://127.0.0.1:3000`, then
  `sudo nginx -t && sudo systemctl reload nginx` (confirm-first).

### Local development against web-core

After any edit in `../crhs-web-core`:

```bash
cd crhs-corporate && rm -rf node_modules/@crhs && npm install --install-links
npm test    # tests/packageTopology.test.js re-checks the topology
```

When a web-core bump changes a `peerDependencies` range, change this repo's
matching `dependencies` range in the **same commit**. The four shared stateful
deps (`mongoose`, `express-session`, `connect-mongo`, `express-rate-limit`) are
declared here at exactly web-core's peer ranges; dropping a declaration, or
letting one drift, reintroduces a silent dual-package install (see *How the
code reaches the boxes* above).

EOF
node -e '
const fs=require("fs");const s=fs.readFileSync("README.md","utf8");
const start=s.indexOf("\n## Deploy\n");const end=s.lastIndexOf("\n---\n");
if(start<0||end<0||end<start){console.error("README anchors not found");process.exit(1);}
fs.writeFileSync("README.md", s.slice(0,start+1)+fs.readFileSync("/tmp/crhs-readme-deploy.md","utf8")+s.slice(end+1));
console.log("README deploy section replaced");'
grep -c '^## Deploy$' README.md; tail -3 README.md
````
  Expected: `README deploy section replaced`, then `1`, then the unchanged last three lines: `---`, a blank line, and `© 2025–2026 CRHS Enterprises, LLC. All rights reserved. UNLICENSED / proprietary.`
- [ ] 5. Replace `content/crhsent/README.md` entirely:
```bash
cat > content/crhsent/README.md <<'EOF'
# content/ — per-host content roots served by crhs-corporate

This file lives in `content/crhsent/` because PR A1 moved the whole corporate
tree there. Express serves every root (`server/contentHandler.js`); nginx only
proxies to :3001. The Host → root map is `server/config/hosts.js` (Host header
only, `www.` stripped — never `X-Forwarded-Host`).

| Root | Hosts | Notes |
|:--|:--|:--|
| `content/crhsent/` | `crhsent.com`, `www.crhsent.com` | the CRHS corporate site and the `/wavemax/` package (49 tracked files, pinned by `tests/content-manifest.test.js`); behind `accessGate` and `mediatorGate` |
| `content/atxwashdryfold/` | `atxwashdryfold.com`, `rundberglaundry.com`, `runberglaundry.com`, `atxwashateria.com` (and their `www.` names) | one tree, `rel=canonical` → `https://atxwashdryfold.com`; locales under `locales/{en,es,pt,de}/common.json` |

- `.html` is nonce-injected and served `no-cache, no-store, must-revalidate`.
- On the marketing hosts `/assets/*` is `public, max-age=31536000, immutable`, so
  a changed asset needs a new `?v=` stamp in every page that references it.
- `/assets/images/brand/logo-wavemax.png` answers `410` on every content host.
- `/assets/js/i18n.js` and `/assets/js/language-switcher.js` are served from
  `@crhs/web-core` (`assetsDir/js`), on the marketing hosts only.

Deploy: the boxes are rsync targets, not git checkouts; follow "Deploy one box"
in the root `README.md`. A content-only change needs no reload; a `server/`
change needs `pm2 reload crhs-corporate --update-env` from a clean shell, never
after sourcing `.env`.
EOF
```
- [ ] 6. Run `npm test -- tests/packageHygiene.test.js tests/content-manifest.test.js`. Expected PASS: `tests/packageHygiene.test.js` at `Tests:       27 passed, 27 total`, and the manifest suite green (crhsent still 49 files). Then run `npm test 2>&1 | grep -E '^Tests:'` (no `failed` segment, run without `--forceExit`), `npm run lint` (clean), and `npx madge --circular server/` (`No circular dependency found!`).
- [ ] 7. Commit, push, and open PR A9:
```bash
git add .env.example README.md content/crhsent/README.md tests/packageHygiene.test.js
git commit -m "docs(env): multi-host content-app env (quoted brand values, CORS absent per R-2), rsync deploy + truthful rollback, content README (§5.11)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin plan2/a9-mail-hygiene
gh pr create --base main --head plan2/a9-mail-hygiene --title "A9: gate mail identity, boot mail check, env/README hygiene" --body "Spec §5.10, §5.11, §5.13 A9. Gate mail via displayName 'CRHS Enterprises' (R-6) with a header-proof link/logo host (R-3); boot refuses a mismatched EMAIL_FROM/EMAIL_USER or missing template root (R-24/R-25); .env.example is the documented contract (CORS_ORIGIN absent per R-2).

PRODUCTION: this code and the EMAIL_USER/EMAIL_FROM switch to no-reply@crhsent.com must go live in ONE pm2 reload (R-24). The production .env write and deploy are owned by the GATE slice (R-1); this PR writes no production env.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

### Task 62: Marquee rail on the marketing home page — the Austin Bold skin's fixed left ticker (backlog B-3)

Rick, 2026-09-13: add the scrolling marquee sidebar from the Austin store's corporate demo theme to atxwashdryfold.com. The source is the design-explorer render `wavemax-affiliate-program/public/design-explorer/render/austin-bold-light-home-en.html:639` (`aside.ap-ticker`) and its `.ap-ticker` / `.ap-tick-*` CSS. The live `partner-program.css` has none of it (its `ap-tick` grep hits are `.ap-ticket*`, a different component).

Deliberate differences from the demo, each for a stated reason:
- **Copy.** The demo's items are store facts, including a per-pound price. Rates never ship as literals (runtime business values live in `SystemConfig`), and new copy would need four translations plus a parity-count change. The rail instead reuses seven `partner.*` strings that are already live on this page and translated in all four locales: label `partner.why.kicker`, items `partner.why.p1t`, `partner.why.p2t`, `partner.hero.seal1`, `partner.why.p4t`, `partner.stats.s1`, `partner.plant.spec2t`. No locale key is added, so A15 Task 37 / A69 Task 53's `EXPECTED_PARTNER_LEAVES = 119` and GATE's `check:i18n 119x4` are unchanged.
- **Colour.** The demo's label (`--ap-plate-a`, `#C2306B`) and dots (`--ap-hot`) measure about 3.2:1 on the ink rail (`#241A12`), under the 4.5:1 that 12–13px text needs. Both use `--ap-plate-b` (`#E8A33D`, about 7.9:1), so C14 Accessibility 100 holds.
- **Layout.** Shown only above the stylesheet's existing 640px breakpoint. `body` reserves the rail with `padding-inline-start`, so no content sits under it. The skip link (`.ap-skip`, `z-index:60`) stays above the rail (`z-index:25`). Reduced motion stops the loop.
- **Scope.** The home page `/` on the four marketing hosts only. `/affiliate` is unchanged.

**Files:**
- Modify `content/atxwashdryfold/index.html` — insert the `<aside>` immediately before `<header class="ap-mast">`, and re-stamp the stylesheet `?v=20260909a` → `?v=20260913a`. The insertion is by anchor, not line number, because A15 Tasks 33 and 36 edited this file by line number.
- Modify `content/atxwashdryfold/assets/css/partner-program.css` — append the ticker block.
- Modify `tests/marketingBrandGuard.test.js` — A15 Task 36's stamp assertion.
- Create `tests/marqueeTicker.test.js`.

**Interfaces:**
- Consumes: A15 Task 32's tree `content/atxwashdryfold/`; Task 33's served `/`; Task 35's `public, max-age=31536000, immutable` on marketing `/assets` (which makes the re-stamp mandatory); Task 36's `tests/marketingBrandGuard.test.js` and its `the changed stylesheet is re-stamped` test; the locales `content/atxwashdryfold/locales/{en,es,pt,de}/common.json` (top level `partner`, A15 Task 37 + A69 Task 53); Task 39's web-core `i18n.js`, which translates every `[data-i18n]` element through `querySelectorAll`, so an item rendered twice is translated twice.
- Produces: `<aside class="ap-ticker" aria-hidden="true">` on `/` for the four marketing hosts, and the stylesheet stamp `20260913a`. GATE Task 72 Step 3 checks that `tests/marqueeTicker.test.js` exists on `main`; GATE Task 82 measures C14 on the page with the rail.

- [ ] 1. Start this task after PR A9 (Task 59) is merged: `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && git switch main && git pull --ff-only && git switch -c plan2/b3-marquee-ticker`. Then check the preconditions:
```bash
grep -c '<header class="ap-mast">' content/atxwashdryfold/index.html
grep -c 'partner-program.css?v=20260909a' content/atxwashdryfold/index.html
grep -cE '\.ap-tick(er|-)|@keyframes ap-tick\b' content/atxwashdryfold/assets/css/partner-program.css
```
  Expected: `1`, `1`, `0`. **STOP** on anything else: an earlier task changed the anchor or the stamp, and this task's edits would land in the wrong place.

- [ ] 2. Write the failing test `tests/marqueeTicker.test.js`:
```js
const fs = require('fs');
const path = require('path');
const request = require('supertest');

const ROOT = path.join(__dirname, '..', 'content', 'atxwashdryfold');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const LOCALES = ['en', 'es', 'pt', 'de'];
const LABEL_KEY = 'partner.why.kicker';
const ITEM_KEYS = ['partner.why.p1t', 'partner.why.p2t', 'partner.hero.seal1', 'partner.why.p4t', 'partner.stats.s1', 'partner.plant.spec2t'];
const MARKETING = ['atxwashdryfold.com', 'rundberglaundry.com', 'runberglaundry.com', 'atxwashateria.com'];
const lookup = (obj, key) => key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
const tickerOf = (html) => (html.match(/<aside class="ap-ticker" aria-hidden="true">[\s\S]*?<\/aside>/) || [''])[0];

describe('B-3 marquee rail — markup', () => {
  const html = read('index.html');
  const aside = tickerOf(html);

  test('exactly one decorative ticker, before the masthead', () => {
    expect(html.split('class="ap-ticker"').length - 1).toBe(1);
    expect(aside).not.toBe('');
    expect(html.indexOf('<aside class="ap-ticker"')).toBeLessThan(html.indexOf('<header class="ap-mast">'));
  });

  test('one label; every item rendered exactly twice (the seamless loop); no other keys', () => {
    expect(aside.split(`data-i18n="${LABEL_KEY}"`).length - 1).toBe(1);
    for (const k of ITEM_KEYS) expect({ k, n: aside.split(`data-i18n="${k}"`).length - 1 }).toEqual({ k, n: 2 });
    const used = [...new Set([...aside.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]))].sort();
    expect(used).toEqual([LABEL_KEY, ...ITEM_KEYS].sort());
  });

  test('fallback text equals the en value, and every key is translated in all four locales', () => {
    const loc = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read('locales', l, 'common.json'))]));
    const spans = [...aside.matchAll(/data-i18n="([^"]+)">([^<]*)</g)];
    expect(spans.length).toBe(1 + ITEM_KEYS.length * 2);
    for (const m of spans) expect({ key: m[1], text: m[2] }).toEqual({ key: m[1], text: lookup(loc.en, m[1]) });
    for (const l of LOCALES) {
      for (const k of [LABEL_KEY, ...ITEM_KEYS]) {
        const v = lookup(loc[l], k);
        expect({ l, k, ok: typeof v === 'string' && v.trim().length > 0 }).toEqual({ l, k, ok: true });
      }
    }
  });

  test('no price, rate or percentage literal in the ticker', () => {
    const text = aside.replace(/<[^>]+>/g, ' ');
    expect(text).not.toMatch(/\$\s*\d/);
    expect(text).not.toMatch(/\d\s*(\/|per)\s*(lb|pound)/i);
    expect(text).not.toMatch(/\d\s*%/);
  });

  test('the changed stylesheet is re-stamped', () => {
    expect(html).toContain('/assets/css/partner-program.css?v=20260913a');
    expect(html).not.toContain('partner-program.css?v=20260909a');
  });

  test('/affiliate does not carry the rail', () => {
    expect(read('affiliate', 'index.html')).not.toContain('ap-ticker');
  });
});

describe('B-3 marquee rail — stylesheet', () => {
  const css = read('assets', 'css', 'partner-program.css');

  test('hidden by default; above 640px the body reserves the rail before the rail is fixed', () => {
    expect(css).toContain('.ap-ticker{display:none}');
    expect(css).toMatch(/@media \(min-width:641px\)\{\s*:root\{--ap-rail:54px\}\s*body\{padding-inline-start:var\(--ap-rail\)\}\s*\.ap-ticker\{position:fixed;/);
  });

  test('reduced motion stops the loop', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion:reduce\)\{\s*\.ap-tick-run\{animation:none\}\s*\}/);
  });

  test('ticker text colours reach 4.5:1 on the ink rail', () => {
    const hex = (name) => css.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`))[1];
    const lum = (h) => {
      const c = [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a, b) => {
      const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (hi + 0.05) / (lo + 0.05);
    };
    const ink = hex('--ap-ink');
    for (const rule of ['ap-tick-label', 'ap-tick-dot']) {
      const token = css.match(new RegExp(`\\.${rule}\\{[^}]*color:var\\((--ap-[a-z-]+)\\)`))[1];
      expect({ rule, token, ok: ratio(hex(token), ink) >= 4.5 }).toEqual({ rule, token, ok: true });
    }
    expect(ratio(hex('--ap-paper'), ink)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('B-3 marquee rail — served', () => {
  const app = require('../server');

  test.each(MARKETING)('%s / carries the rail', async (h) => {
    const res = await request(app).get('/').set('Host', h);
    expect(res.status).toBe(200);
    expect(res.text).toContain('<aside class="ap-ticker" aria-hidden="true">');
  });

  test('crhsent.com / does not', async () => {
    const res = await request(app).get('/').set('Host', 'crhsent.com');
    expect(res.text).not.toContain('ap-ticker');
  });
});
```

- [ ] 3. Run `npx jest tests/marqueeTicker.test.js`. Expected: `Tests:       11 failed, 3 passed, 14 total`. The three that pass before the change are guards that must stay green: `no price, rate or percentage literal`, `/affiliate does not carry the rail` and `crhsent.com / does not`. The failures are for the right reason:
  - `exactly one decorative ticker` → `Expected: 1` / `Received: 0`;
  - `fallback text equals the en value` → `Expected: 13` / `Received: 0`;
  - `the changed stylesheet is re-stamped` → `Expected substring: "/assets/css/partner-program.css?v=20260913a"`;
  - `hidden by default` → `Expected substring: ".ap-ticker{display:none}"`;
  - `ticker text colours` → `TypeError: Cannot read properties of null (reading '1')` (the rule does not exist yet);
  - each served host → `Expected substring: "<aside class=\"ap-ticker\" aria-hidden=\"true\">"`.

- [ ] 4. Insert the rail, re-stamp the stylesheet and append the CSS. The script asserts each anchor once and writes nothing if one is missing:
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && python3 - <<'PY'
import pathlib
root = pathlib.Path('content/atxwashdryfold')
page, css = root / 'index.html', root / 'assets' / 'css' / 'partner-program.css'
html, sheet = page.read_text(encoding='utf-8'), css.read_text(encoding='utf-8')

items = [
    ('partner.why.p1t', 'Own your customers'),
    ('partner.why.p2t', 'Set your own prices'),
    ('partner.hero.seal1', 'No equipment to buy'),
    ('partner.why.p4t', 'We handle the money'),
    ('partner.stats.s1', 'Electrolux equipment'),
    ('partner.plant.spec2t', 'Omni UV water purification'),
]
run = ''.join('<span class="ap-tick-item" data-i18n="%s">%s</span><span class="ap-tick-dot">●</span>' % kv for kv in items)
aside = ('<aside class="ap-ticker" aria-hidden="true">\n'
         '  <span class="ap-tick-label" data-i18n="partner.why.kicker">No middle-man</span>\n'
         '  <span class="ap-tick-track"><span class="ap-tick-run">' + run + run + '</span></span>\n'
         '</aside>\n')

anchor = '<header class="ap-mast">'
old_stamp, new_stamp = '/assets/css/partner-program.css?v=20260909a', '/assets/css/partner-program.css?v=20260913a'
assert html.count(anchor) == 1 and 'ap-ticker' not in html, 'anchor'
assert html.count(old_stamp) == 1, 'stamp'
assert '.ap-ticker' not in sheet, 'css already present'

html = html.replace(anchor, aside + anchor, 1).replace(old_stamp, new_stamp, 1)
sheet = sheet.rstrip('\n') + '''

/* B-3 marquee rail, from the Austin Bold skin ticker. Decorative (aria-hidden), CSS-only.
   Shown above the 640px breakpoint only; body reserves the rail so nothing sits under it. */
.ap-ticker{display:none}
@media (min-width:641px){
  :root{--ap-rail:54px}
  body{padding-inline-start:var(--ap-rail)}
  .ap-ticker{position:fixed;left:0;top:0;bottom:0;width:var(--ap-rail);z-index:25;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-block:14px;overflow:hidden;background:var(--ap-ink);color:var(--ap-paper);border-right:3px solid var(--ap-hot)}
}
.ap-tick-label{writing-mode:vertical-rl;font:800 12px/1.6 var(--ap-stamp);letter-spacing:.2em;text-transform:uppercase;margin-bottom:14px;color:var(--ap-plate-b);text-align:center;padding-block:2px}
.ap-tick-track{flex:1;writing-mode:vertical-rl;overflow:hidden;position:relative}
.ap-tick-run{display:block;animation:ap-tick 26s linear infinite}
.ap-tick-item{font:800 13px/1 var(--ap-stamp);letter-spacing:.16em;text-transform:uppercase}
.ap-tick-dot{color:var(--ap-plate-b);padding-block:10px;font-size:9px}
@keyframes ap-tick{from{transform:translateY(0)}to{transform:translateY(-50%)}}
@media (prefers-reduced-motion:reduce){
  .ap-tick-run{animation:none}
}
'''
page.write_text(html, encoding='utf-8')
css.write_text(sheet, encoding='utf-8')
print('ticker inserted, stylesheet re-stamped')
PY
```
  Expected: `ticker inserted, stylesheet re-stamped`. If the `fallback text equals the en value` test later reports a different `text` for a key, copy the `en` value from `content/atxwashdryfold/locales/en/common.json` into the span exactly; never edit the locale to match the span.

- [ ] 5. Move A15 Task 36's stamp assertion to the new stamp, and keep the old stamp out:
```bash
sed -i "s|expect(html).toContain('/assets/css/partner-program.css?v=20260909a');|expect(html).toContain('/assets/css/partner-program.css?v=20260913a');|; s|expect(html).not.toContain('partner-program.css?v=20260827a');|expect(html).not.toContain('partner-program.css?v=20260827a');\n    expect(html).not.toContain('partner-program.css?v=20260909a');|" tests/marketingBrandGuard.test.js
grep -c "partner-program.css?v=20260913a" tests/marketingBrandGuard.test.js
grep -c "partner-program.css?v=20260909a" tests/marketingBrandGuard.test.js
git grep -n "partner-program.css?v=20260909a" -- content tests
```
  Expected: `1`, `1`, then exactly two `git grep` hits, both `not.toContain` lines: one in `tests/marketingBrandGuard.test.js` and one in `tests/marqueeTicker.test.js`. `content/` must have no hit.

- [ ] 6. Run `npx jest tests/marqueeTicker.test.js tests/marketingBrandGuard.test.js tests/contentHandler.test.js tests/content-manifest.test.js tests/i18nParity.test.js`. Expected PASS, with `tests/marqueeTicker.test.js` at `Tests:       14 passed, 14 total`; the marketing manifest is unchanged (no file added to the tree). Then run `npm test 2>&1 | grep -E '^Tests:'` (no `failed` segment, run without `--forceExit`), `npm run check:i18n` (`i18n parity OK: 119 keys × 4 locales`, unchanged), `npm run lint` (clean) and `npx madge --circular server/` (`No circular dependency found!`).

- [ ] 7. Look at it. Serve the tree statically and screenshot both widths:
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && (npx --yes http-server@14.1.1 content/atxwashdryfold -p 8765 -s &) && sleep 3
npx --yes playwright@1.47.2 screenshot --viewport-size "1280,800" --wait-for-timeout 1500 http://127.0.0.1:8765/ /tmp/b3-rail-1280.png
npx --yes playwright@1.47.2 screenshot --viewport-size "390,844" --wait-for-timeout 1500 http://127.0.0.1:8765/ /tmp/b3-rail-390.png
pkill -f "http-server@14.1.1 content/atxwashdryfold" || pkill -f "http-server content/atxwashdryfold"
```
  If Playwright reports a missing browser, run `npx --yes playwright@1.47.2 install chromium` once and repeat. Open both PNGs. Expected at 1280: a dark 54px rail on the left edge with the vertical label `NO MIDDLE-MAN` and the items reading downward; the masthead and every section start to the right of the rail with nothing clipped. Expected at 390: no rail, and the page is identical to before this task. The static server shows the English fallback (locales are served by the app, not this tree). **STOP** if anything sits under the rail at 1280.

- [ ] 8. Commit, push and open the PR:
```bash
git add content/atxwashdryfold/index.html content/atxwashdryfold/assets/css/partner-program.css tests/marqueeTicker.test.js tests/marketingBrandGuard.test.js
git commit -m "feat(marketing): marquee rail on the marketing home page, from the Austin Bold skin (B-3)

Decorative aria-hidden CSS-only ticker. Items reuse live partner.* strings in all four locales (no new keys, no rate literals). Shown above 640px only, still under reduced motion, text colours at 4.5:1 or better. Stylesheet re-stamped 20260913a.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin plan2/b3-marquee-ticker
gh pr create --base main --head plan2/b3-marquee-ticker --title "B-3: marquee rail on the marketing home page" --body "Backlog B-3 (Rick, 2026-09-13): the scrolling left rail from the Austin Bold demo skin, on / for the four marketing hosts.

- Items reuse seven live, translated partner.* strings; no new locale keys (parity stays 119 x 4); no rate literals.
- Label and dots use --ap-plate-b (about 7.9:1 on the ink rail) instead of the demo pink (about 3.2:1).
- Hidden at 640px and below; body reserves the rail; reduced motion stops the loop.
- partner-program.css re-stamped 20260913a (marketing /assets are immutable).

Screenshots at 1280 and 390 attached. C14 is measured on this page in GATE Task 82.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
  Attach `/tmp/b3-rail-1280.png` and `/tmp/b3-rail-390.png` to the PR.

---

## Part 4 — Phase 0a: dark-launch deploy, acceptance gate, Lighthouse baseline, rollback

## Slice GATE — conventions for Tasks 70–84

**Scope (ruling R-1).** This slice is the SOLE owner of every Phase-0a production write: both apps' `.env` edits, the web-core `v0.2.1` rsync, the corporate rsync, both reinstalls, both `pm2 reload`s, and the acceptance gate. It absorbs the production steps of P0 Tasks 14, 17 (cron install + drill), 18 and 19 and of A69 Tasks 60–61 — each deleted or reduced by R-1. Their `.env` key lists are folded into Task 74; their verify, rollback and exit-record steps are folded into Tasks 73, 75, 76, 77, 80, 81, 83 and 84; the P-16 cron install and alert drill are Task 81 Step 7.

**Plan 1 wins over the spec. Each case is applied below.**
1. **Install mechanics.** §8.6 and §9.2 step 1 use plain `npm install --install-links`. Global Constraint 16 applies instead:
   - `rm -rf node_modules/@crhs/web-core` first;
   - then the gate: installed version, 26-key surface, `createCsrf`, and mongoose resolution-path identity;
   - then a boot probe that ends in `process.exit(0)`;
   - only then `pm2 reload`.
2. **Versions.** §8.6 says "boxes run 0.1.1"; §9.2's rollback targets "the 0.1.2 tree". Both are stale. The boxes run `@crhs/web-core@0.2.0` (tag `v0.2.0`, commit `2dcd6ff`). Phase 0a delivers `v0.2.1`. Rollback restores the pre-deploy `0.2.0` tree from the per-box tarball.
3. **Corporate delivery.** §8.6/§9.2 run `git fetch && git reset --hard origin/main` in `/var/www/crhs-corporate`. Global Constraint 1 says corporate on the boxes is an rsync target: the repo is private and the boxes hold no GitHub credentials.
   - Delivery: `git archive $CORP_SHA` exported on the workstation, then `rsync --delete --exclude .env`.
   - Rollback: restore the tarball snapshot.
   - No `git` command ever runs in `/var/www/crhs-corporate`.
4. **Log evidence.** §5.12's acceptance, §9.2 step 2 and §10.3 P1/P2 read `pm2 logs`. Global Constraint 17 and R-4 apply instead:
   - Every log check reads `$LOG_DIR/combined.log` (JSON lines with `timestamp`, `message`, `service`), filtered to timestamps after the recorded reload. This holds for BOTH apps: the affiliate's `server/utils/logger.js` is `module.exports = require('@crhs/web-core').logger`.
   - Corporate boot marker: `crhs-corporate listening on 3001` (`crhs-corporate/server.js:153`).
   - Affiliate boot marker: `Server running on port 3000 in production mode` (`wavemax-affiliate-program/server.js:1054`).
   - `Access gate cache loaded` is never counted. It is re-logged every 60 s per worker (`crhs-corporate/server/middleware/accessGate.js:74`, timer `:84`).
5. **`LOG_DIR`.** P-7 says "if UNSET, add". In fact `LOG_DIR=logs` is set, RELATIVE, in all four `.env` files. Task 74 REPLACES it in both apps.
6. **Affiliate full suite (R-16).** §10.3 P13 says "npm test in all three repos". Global Constraint 19 forbids the affiliate full suite (~67 min) inside any implementer or subagent task. Plan 2 ships web-core code the affiliate consumes, and green seam suites do not prove the app, so Task 72 Step 7b runs the full suite exactly ONCE — controller-run, in the background, at `AFF_SHA` against `v0.2.1`. Step 7's seam suites, boot probe, `check:i18n` and `madge` stay as the fast pre-check.
7. **Gate G1.** §9.1 P-12 / §10.3 P6 name `path=/health`. The monitor probes `/health/origin` (Global Constraint 2); Task 72 checks that path.

**Declared deviations from the spec (controller rulings).**
- **R-8 — Lighthouse (§5.12, §10.1 C14, §11.6 step 0).**
  - In Phase 0a the literal `--host-resolver-rules="MAP <host> <box-ip>"` reaches nginx → `:3000`, i.e. the old app.
  - Tasks 77 and 82 use `MAP <host> 127.0.0.1:18443` instead: `scripts/ops/lh-dark-origin-proxy.js` (Task 71) → SSH tunnel → box `127.0.0.1:3001`.
  - Accessibility, Best Practices and SEO gate at 100.
  - Performance is recorded as **informational only**: the path adds WAN RTT and has no nginx gzip or HTTP/2. The authoritative Performance comparison moves to Plan 3: each host through Cloudflare, immediately before and immediately after its flip.
  - No unmeasured score row is ever committed.
- **R-9 — C9b.** The pass criterion is zero `Set-Cookie` headers on 100 spoofed requests per marketing host. The `sessions_corporate` count delta is informational, because live crhsent.com traffic writes to the same collection.
- **R-13 — intake mail (§9.2 "Intake POST" row; §10.1 C6 "alias → 200").**
  - Validators, the `/api/v1/*` aliases and host-scoping are proven with payloads that FAIL validation (400, no mail — finding F-6).
  - Exactly ONE valid intake POST per box, announced beforehand:
    - oci1: `POST /api/partner-inquiry` → `pickups@atxwashdryfold.com`;
    - oci2: `POST /api/affiliate-application` → `admin@crhsent.com`.
  - Task 81 proves the boxes run identical code and `.env`, so each mail path is proven once.
- **REMOTE and process cells (§10.0).** `cutover-gate.sh` runs on the box and cannot reach the mail host, pm2, or the workstation evidence.
  - These cells run as exact steps in Tasks 72, 76, 77, 78, 80 and 82: `C5-contact`, `C6-mail`, `C13-click`, `C14-baseline`, `P1`, `P2`, `P3`, `P8`, `P13`, `P14` and `R2-cors`.
  - Each is cleared in the per-box S1 log with `--attest`.
  - Until every one is attested, the script prints `MANUAL <id> PENDING` and exits 1.
- **P8 — corporate commit subject.**
  - §10.3 P8 requires the last commit touching corporate `tests/csp.test.js` to be titled `golden(csp): deliberate re-capture (D16a)`.
  - A69 Task 56 creates that file (corporate has no `tests/csp.test.js` before Plan 2) in ONE commit whose subject line is exactly that title; the descriptive `feat(csp): host-aware CSP …` line is the commit body (R-16).
  - Task 72 Step 5 asserts both halves: exactly one commit touches the file, and its subject is the required title. Either failing is a STOP.
- **D5** (`/wavemax-affiliate` → 301 `/affiliate`) merges only on counsel's go (R-12). Its cell prints `SKIP C2-wavemax-affiliate <host> D5 PENDING COUNSEL` and stays non-blocking until Task 72 records `D5_STATE=merged`.
- **`GATE_FROM` is code, not an env key.** Global Constraint 6's `GATE_FROM → "CRHS Enterprises" <no-reply@crhsent.com>` is composed by web-core from `EMAIL_FROM` and the display name `accessGate.GATE_DISPLAY_NAME` (`'CRHS Enterprises'`), which A69 Task 57 passes as `sendEmail(…, undefined, { displayName })` (R-6); there is no `gateFrom()` function and no `GATE_FROM` constant after A69 Task 57. Task 74 writes no `GATE_FROM` line and never `EMAIL_FROM_NAME` (it would override the display name); Task 75 Step 7 prints the composed value from the installed code and `.env`.

**R-10 — the session rename logs nobody out.**
- Corporate has 0 `req.session` references (`crhs-corporate/server/**` + `server.js`, verified 2026-09-13; Task 72 re-verifies at `CORP_SHA`).
- accessGate unlocks by IP (`AccessWhitelist`); mediatorGate unlocks via the separate `wm_med_unlock` cookie.
- So switching to `__Host-crhsent.sid` + `sessions_corporate` drops a cookie nothing reads. No user notice is needed.

**Box order.** Tasks 73–80 are per-box.
- **Pass 1:** `BOX=oci1`, `IP=161.153.71.201`, Tasks 73→80.
- **Pass 2:** `BOX=oci2`, `IP=144.24.4.202`, Tasks 73→80. Starts only after Task 80 has written `BOX_0A_DONE_oci1`.
- Tasks 81, 82 and 83 run once, after both passes.
- Task 84 runs only when a step says STOP.
- The two boxes are never mid-deploy at the same time.

**Record file and variables (R-13).**
- The workstation file is `/var/www/wavemax/cutover-logs/phase0a-record.env`.
- Every per-box value is written as `KEY_<box>=value` with `printf '%s=%q\n'`, so the file sources safely.
- Step 0 of every task sources the file locally and reads keyed values by indirection, e.g. `V=TS_$BOX; TS=${!V}`.
- Every remote command that needs a recorded value is DOUBLE-quoted, so the value expands on the workstation. Remote-only variables are written `\$NAME`.

**TEST-NET addresses.** Rate limits are real: `contact_burst` allows `max: 1` per 30 s and `contact_hourly` allows `max: 5` per hour. Both are keyed by client IP and both live in the SHARED store.

| Use | oci1 | oci2 |
|---|---|---|
| `POST /api/partner-inquiry`, failing payload | `203.0.113.11` | `203.0.113.21` |
| `POST /api/v1/partner-inquiry`, failing payload | `203.0.113.12` | `203.0.113.22` |
| `POST /api/affiliate-application`, failing payload | `203.0.113.13` | `203.0.113.23` |
| `POST /api/v1/affiliate-application`, failing payload | `203.0.113.14` | `203.0.113.24` |
| the one valid intake POST | `203.0.113.15` | `203.0.113.25` |
| crhsent.com `POST /api/partner-inquiry` negative | `203.0.113.16` | `203.0.113.26` |
| crhsent.com `GET /api/probe-*` (apiLimiter namespace) | `203.0.113.71` | `203.0.113.72` |
| non-store `GET /?x=1` inside `cutover-gate.sh` (no limiter) | `203.0.113.10` | `203.0.113.10` |

**Evidence.** All evidence lands under `/var/www/wavemax/cutover-logs/` on the workstation, outside every repo (§10.4). Only PASS/FAIL summary lines and Lighthouse category scores are ever committed.

**P-numbering.** `P-10 … P-17` (with a hyphen) are §9.1 Phase-0 items. `P1 … P18` (no hyphen) are §10.3 process checks. Every cross-reference below names its section.

---

### Task 70: `scripts/ops/cutover-gate.sh` — stage S1 `--on-box` cells, MANUAL PENDING, `--attest`

**Files:**
- Create: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/scripts/ops/cutover-gate.sh`. The directory exists and today holds `clean-logs.sh`, `refresh-hibu.sh` and `resend-welcome-email.js`.
- Create: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/unit/ops/cutoverGateS1.test.js`. `tests/unit/ops/` does not exist yet; `jest.config.js` `testMatch: ['**/tests/**/*.test.js']` picks it up.

**Interfaces:**
- Consumes: the §10.1 cell IDs; the §5.12, §9.2 and §10.2 expected values; the A15/A69 surfaces (Host-only `requestHost`, the multi-root contentHandler, SEO files, B7 301s, the store-IP 302, host-aware CSP, intake page JS).
- Produces — the S1 run:
  - Command: `bash scripts/ops/cutover-gate.sh --stage S1 --on-box [--base <url>] [--log <file>] [--attested-log <file>]`. The default base is `http://127.0.0.1:3001`.
  - Output lines: `PASS <id>`, `FAIL <id> want=[…] got=[…]`, `SKIP <id> <reason>`, `MANUAL <id> PENDING`, then `SUMMARY S1 fails=<n> pending=<n>`.
  - Exit `0` only when fails=0 and pending=0; `1` otherwise; `2` on bad arguments.
- Produces — attestation:
  - Command: `bash scripts/ops/cutover-gate.sh --attest <id> --by <operator> --evidence <text> --log <file>`.
  - Appends `MANUAL <id> PASS <operator> <YYYY-MM-DDTHH:MM:SSZ> <evidence>`.
- Redaction: stdout AND the log both pass through the §10.4 `sed` (the 32-hex bag token, `k=`/`t=` values, `x-expediter-token`).
- MANUAL ids scheduled at S1: `C5-contact C6-mail C13-click C14-baseline P1 P2 P3 P8 P13 P14 R2-cors`. Each is cleared by a `MANUAL <id> PASS ` line in `--attested-log`, or by listing it in the space-separated env `GATE_ATTESTED`.
- Env overrides, with defaults:
  - `GATE_LOGO_MD5` = `7f5332b870fe36482e4b8d27f5c9334f`
  - `GATE_LOGO_BYTES` = `5137`
  - `GATE_STORE_IP` = `72.190.1.227`
  - `GATE_EXPECT_UIR` = `1`
  - `GATE_FP_HREFS` = `5`
  - `GATE_PARTNER_KEYS` = `119`
  - `GATE_SECURITY_CONTACT` = `security@crhsent.com`
  - `GATE_D5` = `pending` (or `merged`)
- Result against a correct origin, D5 pending, every MANUAL id attested: 205 PASS lines (194 cells + 11 `PASS <id> attested`), 8 SKIP lines (4 D5 + 4 C8b), and `SUMMARY S1 fails=0 pending=0`. The cell arithmetic:
  - 44 cells per marketing host × 4 = 176;
  - plus 18 host-independent cells: 7 health + R6 + R8 + R7 + 2 C11 + 2 R-3 + 1 C9b-inverse + 2 crhsent.com logo + 1 crhsent.com store-IP;
  - 176 + 18 = 194.

- [ ] **Step 1: Write the failing test** at `tests/unit/ops/cutoverGateS1.test.js`:
```js
// tests/unit/ops/cutoverGateS1.test.js — drives scripts/ops/cutover-gate.sh stage S1 --on-box
// against an in-process stub origin. The script runs through the ASYNC execFile: a
// spawnSync would block this process's event loop, the stub could never answer, and
// every curl would hang.
const http = require('http');
const { execFile, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const SCRIPT = path.join(__dirname, '..', '..', '..', 'scripts', 'ops', 'cutover-gate.sh');
const MKT = ['rundberglaundry.com', 'runberglaundry.com', 'atxwashateria.com', 'atxwashdryfold.com'];
const PORTAL = 'https://portal.atxwashdryfold.com';
const LOGO = Buffer.from('fake-png-bytes');
const TOKEN = '0123456789abcdef0123456789abcdef';
const NONCE = 'abc123';
const MANUAL_IDS = ['C5-contact', 'C6-mail', 'C13-click', 'C14-baseline', 'P1', 'P2', 'P3', 'P8', 'P13', 'P14', 'R2-cors'];
const CSP_MKT = `default-src 'self'; script-src 'self' 'nonce-${NONCE}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-src 'none'; frame-ancestors 'self'; form-action 'self'; upgrade-insecure-requests`;
const CSP_CRHSENT = `default-src 'self'; script-src 'self' 'nonce-${NONCE}'; frame-ancestors 'self'`;
const FP = '<a href="https://www.wavemaxlaundry.com/austin-tx">WaveMAX Austin</a>';
const HOME = `<!doctype html><html><head><meta name="csp-nonce" content="${NONCE}"><link rel="canonical" href="https://atxwashdryfold.com/"><link rel="stylesheet" href="/assets/css/partner-program.css"></head><body><h1 data-i18n="partner.hero.title">Hero</h1><p>${Array(5).fill(FP).join(' | ')}</p><script src="/assets/js/i18n.js" nonce="${NONCE}"></script></body></html>`;
const AFF = `<!doctype html><html><head><meta name="csp-nonce" content="${NONCE}"><link rel="canonical" href="https://atxwashdryfold.com/affiliate"><link rel="stylesheet" href="/assets/css/affiliate.css"></head><body><h1>Affiliate</h1><script src="/assets/js/affiliate-inquiry.js" nonce="${NONCE}"></script></body></html>`;
const BOTS = ['GPTBot', 'ChatGPT-User', 'CCBot', 'Google-Extended', 'anthropic-ai', 'ClaudeBot', 'PerplexityBot', 'Bytespider', 'Amazonbot'];
const ROBOTS = BOTS.map((b) => `User-agent: ${b}\nDisallow: /\n\n`).join('') + 'User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://atxwashdryfold.com/sitemap.xml\n';
const SITEMAP = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://atxwashdryfold.com/</loc></url>\n  <url><loc>https://atxwashdryfold.com/affiliate</loc></url>\n</urlset>\n';
const SEC = (h) => `# RFC 9116\nContact: mailto:security@crhsent.com\nExpires: 2027-05-20T00:00:00.000Z\nPreferred-Languages: en\nCanonical: https://${h}/.well-known/security.txt\nPolicy: https://portal.atxwashdryfold.com/privacy-policy\n`;
const LEAVES = Object.fromEntries(Array.from({ length: 119 }, (_, i) => ['k' + i, 'v']));
const LEGACY = new Set(['/embed-app-v2.html', '/admin', '/admin/', '/operator', '/operator/', '/operator-scan-embed.html', '/scanbag', '/scanbag/', '/scanbag-manifest.json', '/scanbag-sw.js', '/monitoring-dashboard.html']);

function stub(breakage = {}) {
  return http.createServer((req, res) => {
    const host = (req.headers.host || '').toLowerCase();
    const u = new URL(req.url, 'http://stub');
    const send = (code, type, body, extra = {}) => { res.writeHead(code, { 'content-type': type, ...extra }); res.end(body); };
    const redirect = (code, location, extra = {}) => { res.writeHead(code, { location, ...extra }); res.end(); };
    const getLike = req.method === 'GET' || req.method === 'HEAD';
    if (u.pathname === '/health') return send(200, 'application/json; charset=utf-8', '{"status":"ok"}', { 'cache-control': 'no-store' });
    if (host === 'crhsent.com') {
      const h = { 'content-security-policy': CSP_CRHSENT };
      if (u.pathname === '/') return send(200, 'text/html; charset=utf-8', '<html>crhsent</html>', { ...h, 'set-cookie': '__Host-crhsent.sid=s%3Aabc.def; Path=/; HttpOnly; Secure; SameSite=Lax' });
      if (u.pathname === '/wavemax/') return send(200, 'text/html; charset=utf-8', '<h1>Documented record &mdash; access</h1>', h);
      if (u.pathname === '/assets/images/brand/logo.png') return send(200, 'image/png', LOGO);
      if (u.pathname === '/assets/images/brand/logo-wavemax.png') return send(410, 'text/plain; charset=utf-8', '');
      return send(401, 'text/html; charset=utf-8', '<p class="sub">This content is private.</p>', h);
    }
    if (!MKT.includes(host)) return send(404, 'text/html; charset=utf-8', 'Not Found');
    if (getLike && !breakage.b7 && (LEGACY.has(u.pathname) || u.pathname.startsWith('/api/v1/customers/verify-email/'))) return redirect(301, PORTAL + req.url);
    if (getLike && req.headers['cf-connecting-ip'] === '72.190.1.227') return redirect(302, PORTAL + req.url, { 'cache-control': 'no-store' });
    if (u.pathname.startsWith('/api/')) return send(404, 'application/json; charset=utf-8', '{"success":false,"message":"Not found"}');
    if (!getLike) return send(404, 'text/html; charset=utf-8', 'Not Found');
    const html = { 'content-security-policy': CSP_MKT, 'cache-control': 'no-cache, no-store, must-revalidate' };
    if (u.pathname === '/') return send(200, 'text/html; charset=utf-8', HOME, html);
    if (u.pathname === '/affiliate' || u.pathname === '/affiliate/') return send(200, 'text/html; charset=utf-8', AFF, html);
    if (u.pathname === '/robots.txt') return send(200, 'text/plain; charset=utf-8', ROBOTS, { 'cache-control': 'public, max-age=3600' });
    if (u.pathname === '/sitemap.xml') return send(200, 'application/xml; charset=utf-8', SITEMAP, { 'cache-control': 'public, max-age=3600' });
    if (u.pathname === '/.well-known/security.txt') return send(200, 'text/plain; charset=utf-8', SEC(host));
    if (u.pathname === '/favicon.ico') return send(200, 'image/png', LOGO);
    if (u.pathname === '/assets/images/brand/logo.png') return send(200, 'image/png', LOGO);
    if (u.pathname === '/assets/images/brand/logo-wavemax.png') {
      return breakage.logo410 ? redirect(301, '/assets/images/brand/logo.png') : send(410, 'text/plain; charset=utf-8', '');
    }
    if (u.pathname === '/assets/js/partner-inquiry.js') return send(200, 'application/javascript', "fetch('/api/partner-inquiry', {");
    if (u.pathname === '/assets/js/affiliate-inquiry.js') return send(200, 'application/javascript', "fetch('/api/affiliate-application', {");
    if (u.pathname.startsWith('/assets/css/')) return send(200, 'text/css', "@font-face{font-family:a;src:url('/assets/fonts/a.woff2')}");
    if (/^\/locales\/(en|es|pt|de)\/common\.json$/.test(u.pathname)) return send(200, 'application/json; charset=UTF-8', JSON.stringify({ partner: LEAVES }), { 'access-control-allow-origin': '*' });
    return send(404, 'text/html; charset=utf-8', 'Not Found');
  });
}

function tmpLog(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gate-')), name);
}

function run(server, extraArgs = [], extraEnv = {}) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    const log = tmpLog('s1.log');
    execFile('bash', [SCRIPT, '--stage', 'S1', '--on-box', '--base', `http://127.0.0.1:${port}`, '--log', log, ...extraArgs], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        GATE_LOGO_MD5: crypto.createHash('md5').update(LOGO).digest('hex'),
        GATE_LOGO_BYTES: String(LOGO.length),
        GATE_ATTESTED: '',
        GATE_D5: 'pending',
        ...extraEnv
      }
    }, (err, stdout, stderr) => {
      server.close();
      resolve({ status: err ? err.code : 0, stdout, stderr, log: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '' });
    });
  }));
}

function attestedLog() {
  const f = tmpLog('attested.log');
  fs.writeFileSync(f, MANUAL_IDS.map((id) => `MANUAL ${id} PASS rick 2026-09-13T00:00:00Z fixture`).join('\n') + '\n');
  return f;
}

describe('cutover-gate.sh S1 --on-box', () => {
  test('every cell PASSes against a correct origin with all MANUAL cells attested; exit 0; no token in the log', async () => {
    const r = await run(stub(), ['--attested-log', attestedLog()]);
    expect(r.stdout).not.toMatch(/^FAIL /m);
    for (const id of ['C9-health', 'R6-portal-404', 'R8-unknown-404', 'R7-crhsent', 'C11-frame-ancestors', 'R3-xfh-wavemax', 'R3-xfh-readme', 'C9b-inverse',
      'C7-logo', 'C7-logo-wavemax-410', 'C8-crhsent-not302', 'C1-home', 'C12-canonical', 'C10-csp', 'C10-static', 'C2-affiliate', 'C3-robots', 'C4-sitemap',
      'C5-securitytxt', 'C5-favicon', 'C6-pagejs', 'C6-v1-anything-else', 'C7-bagqr-301', 'C7-expediter-301', 'C7-legacy-301', 'C7-negative',
      'C8-storeip-302', 'C8-nonstore-200', 'C8-legacy-wins', 'C9b-spoof', 'C13-locales', 'C13-keysets']) {
      expect(r.stdout).toMatch(new RegExp(`^PASS ${id}`, 'm'));
    }
    expect(r.stdout).toMatch(/^SKIP C2-wavemax-affiliate atxwashdryfold\.com D5 PENDING COUNSEL$/m);
    expect(r.stdout).toMatch(/^SKIP C8b atxwashdryfold\.com on-box/m);
    expect(r.stdout).toMatch(/^PASS C6-mail attested$/m);
    expect(r.stdout).toMatch(/^SUMMARY S1 fails=0 pending=0$/m);
    expect(r.status).toBe(0);
    expect(r.log).not.toContain(TOKEN);
  });

  test('logo-wavemax answering 301 instead of 410 is a FAIL and exits 1', async () => {
    const r = await run(stub({ logo410: true }), ['--attested-log', attestedLog()]);
    expect(r.stdout).toMatch(/^FAIL C7-logo-wavemax-410 rundberglaundry\.com /m);
    expect(r.status).toBe(1);
  });

  test('a missing B7 redirect is a FAIL, and the FAIL evidence has the bag token redacted', async () => {
    const r = await run(stub({ b7: true }), ['--attested-log', attestedLog()]);
    expect(r.stdout).toMatch(/^FAIL C7-bagqr-301 rundberglaundry\.com GET .*bag=<redacted>/m);
    expect(r.log).toMatch(/^FAIL C7-bagqr-301 .*bag=<redacted>/m);
    expect(r.log).not.toContain(TOKEN);
    expect(r.log).not.toContain('k=abc');
    expect(r.status).toBe(1);
  });

  test('MANUAL cells print PENDING and hold the exit at 1 until attested', async () => {
    const r = await run(stub());
    expect(r.stdout).not.toMatch(/^FAIL /m);
    expect(r.stdout).toMatch(/^MANUAL C13-click PENDING$/m);
    expect(r.stdout).toMatch(/^MANUAL C6-mail PENDING$/m);
    expect(r.stdout).toMatch(/^SUMMARY S1 fails=0 pending=11$/m);
    expect(r.status).toBe(1);
  });

  test('GATE_ATTESTED clears MANUAL cells the same way as --attested-log', async () => {
    const r = await run(stub(), [], { GATE_ATTESTED: MANUAL_IDS.join(' ') });
    expect(r.stdout).toMatch(/^PASS C6-mail attested$/m);
    expect(r.stdout).not.toMatch(/^MANUAL .* PENDING$/m);
    expect(r.status).toBe(0);
  });

  test('--attest appends one MANUAL PASS line with an ISO-8601 UTC timestamp', () => {
    const log = tmpLog('a.log');
    const r = spawnSync('bash', [SCRIPT, '--attest', 'C13-click', '--by', 'rick', '--evidence', 'es toggle ok oci1', '--log', log], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '').toMatch(/^MANUAL C13-click PASS rick \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z es toggle ok oci1$/m);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails for the right reason.**
  - Command: `cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npx jest tests/unit/ops/cutoverGateS1.test.js`
  - Expected FAIL: `Tests: 6 failed, 6 total`. The script does not exist, so `bash` exits `127` with empty stdout:
    - The first test fails with `Expected pattern: /^PASS C9-health/m` / `Received string:  ""`.
    - The two broken-origin tests fail on `/^FAIL C7-logo-wavemax-410 rundberglaundry\.com /m` and on `/^FAIL C7-bagqr-301 rundberglaundry\.com GET .*bag=<redacted>/m`, each with `Received string:  ""`.
    - The PENDING test fails on `/^MANUAL C13-click PENDING$/m`.
    - The `GATE_ATTESTED` test fails on `/^PASS C6-mail attested$/m`.
    - The `--attest` test fails with `Expected: 0` / `Received: 127`.

- [ ] **Step 3: Write the implementation** at `scripts/ops/cutover-gate.sh`:
```bash
#!/usr/bin/env bash
# scripts/ops/cutover-gate.sh — cutover validation gate (spec §10).
# This file implements stage S1 (Phase 0a, --on-box against the DARK content origin
# http://127.0.0.1:3001) and --attest. Stages S2-S4 and the --via-box / --via-cf modes
# are added by Plan 3.
#
# On a box (the script travels on stdin; nothing is copied to the box):
#   ssh -i ~/.ssh/oci_wavemax ubuntu@<ip> "GATE_ATTESTED='<ids>' bash -s -- --stage S1 --on-box" < scripts/ops/cutover-gate.sh
# Every command below reads its input from a file or a pipe, never from inherited
# stdin, so it cannot swallow the rest of the script.
set -uo pipefail

STAGE=""; MODE=""; BASE="http://127.0.0.1:3001"; LOG="/dev/null"; ATTESTED_LOG=""
ATTEST=""; BY=""; EVIDENCE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --stage) STAGE="$2"; shift 2 ;;
    --on-box) MODE="on-box"; shift ;;
    --base) BASE="$2"; shift 2 ;;
    --log) LOG="$2"; shift 2 ;;
    --attested-log) ATTESTED_LOG="$2"; shift 2 ;;
    --attest) ATTEST="$2"; shift 2 ;;
    --by) BY="$2"; shift 2 ;;
    --evidence) EVIDENCE="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

# §10.4 redaction, applied to stdout AND the log.
redact() { sed -E 's/(bag=)[0-9a-f]{32}/\1<redacted>/g; s/([?&](k|t)=)[^& "]+/\1<redacted>/g; s/x-expediter-token: [^ ]+/x-expediter-token: <redacted>/g'; }
emit() { local line; line=$(printf '%s\n' "$1" | redact); printf '%s\n' "$line"; printf '%s\n' "$line" >> "$LOG"; }

if [ -n "$ATTEST" ]; then
  if [ -z "$BY" ] || [ -z "$EVIDENCE" ]; then echo "--attest needs --by and --evidence" >&2; exit 2; fi
  emit "MANUAL $ATTEST PASS $BY $(date -u +%Y-%m-%dT%H:%M:%SZ) $EVIDENCE"
  exit 0
fi
if [ "$STAGE" != "S1" ] || [ "$MODE" != "on-box" ]; then echo "only --stage S1 --on-box is implemented" >&2; exit 2; fi

FAILS=0; PENDING=0
pass() { emit "PASS $1"; }
fail() { emit "FAIL $1 $2"; FAILS=$((FAILS+1)); }
check() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "want=[$3] got=[$2]"; fi; }
lc() { tr -d '\r' | tr '[:upper:]' '[:lower:]'; }
hdr() { grep -i "^$1:" "$2" | head -1 | tr -d '\r' | cut -d' ' -f2-; }
field() { printf '%s\n' "$1" | cut -d'|' -f"$2"; }
ctype() { local v; v=$(field "$1" 2); printf '%s' "${v%%;*}"; }

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
LOGO_MD5="${GATE_LOGO_MD5:-7f5332b870fe36482e4b8d27f5c9334f}"
LOGO_BYTES="${GATE_LOGO_BYTES:-5137}"
STORE_IP="${GATE_STORE_IP:-72.190.1.227}"
EXPECT_UIR="${GATE_EXPECT_UIR:-1}"
FP_HREFS="${GATE_FP_HREFS:-5}"
PARTNER_KEYS="${GATE_PARTNER_KEYS:-119}"
SEC_CONTACT="${GATE_SECURITY_CONTACT:-security@crhsent.com}"
D5="${GATE_D5:-pending}"
PORTAL="https://portal.atxwashdryfold.com"
CANON="https://atxwashdryfold.com"
TOK=0123456789abcdef0123456789abcdef
MKT="rundberglaundry.com runberglaundry.com atxwashateria.com atxwashdryfold.com"
DROPPED='facebook|local-marketing-reports|cloudflareinsights|jsdelivr|cdnjs|jquery|googleapis|gstatic|recaptcha|matterport|walibu|openstreetmap|wikimedia|flagcdn|firebaseapp|challenges\.cloudflare|stackpath|wavemaxlaundry|wavemax\.promo|osrm|graphhopper|openrouteservice|valhalla|nominatim'
MANUAL_IDS="C5-contact C6-mail C13-click C14-baseline P1 P2 P3 P8 P13 P14 R2-cors"

# get <name> <host> <path> [extra curl args] -> headers $TMP/<name>.h, body $TMP/<name>.b;
# prints "code|content_type|redirect_url"
get() {
  local n="$1" h="$2" p="$3"; shift 3
  local H=(); [ -n "$h" ] && H=(-H "Host: $h")
  curl -s -D "$TMP/$n.h" -o "$TMP/$n.b" -w '%{http_code}|%{content_type}|%{redirect_url}' "${H[@]}" "$@" "$BASE$p" </dev/null
}
code_of() { curl -s -o /dev/null -w '%{http_code}' "$@" </dev/null; }
not301() { if [ "$1" = 301 ]; then echo 301; else echo not301; fi; }

csp_cells() {
  local id="$1" hf="$2" bf="$3" csp ss n meta st fs fa third uir nl re
  csp=$(hdr content-security-policy "$hf")
  ss=$(printf '%s\n' "$csp" | grep -oP "(?<![-\w])script-src [^;]*" | head -1)
  re="^script-src 'self' 'nonce-([A-Za-z0-9+/=_-]+)'$"
  if [[ "$ss" =~ $re ]]; then n="${BASH_REMATCH[1]}"; else n=""; fi
  meta=$(grep -oP '<meta name="csp-nonce" content="\K[^"]+' "$bf" | head -1)
  st=$(printf '%s\n' "$csp" | grep -oP "(?<![-\w])style-src [^;]*" | head -1)
  fs=$(printf '%s\n' "$csp" | grep -oP "(?<![-\w])frame-src [^;]*" | head -1)
  fa=$(printf '%s\n' "$csp" | grep -oP "frame-ancestors [^;]*" | head -1)
  third=$(printf '%s\n' "$csp" | grep -Eic "$DROPPED")
  uir=$(printf '%s\n' "$csp" | grep -c 'upgrade-insecure-requests')
  nl=$(grep -oE '<script[^>]*src=[^>]*>' "$bf" | grep -vc 'nonce=')
  local nonce_ok=nonce-bad; [ -n "$n" ] && [ "$n" = "$meta" ] && nonce_ok=nonce-ok
  check "C10-csp $id" "$nonce_ok|$st|$fs|$fa|$third|$uir|$nl" "nonce-ok|style-src 'self' 'unsafe-inline'|frame-src 'none'|frame-ancestors 'self'|0|$EXPECT_UIR|0"
}

# §9.2 step 5 static checks: no external origin on any resource tag, stylesheets and
# inline styles pull no remote url()/@import (fonts self-hosted).
static_cells() {
  local id="$1" host="$2" bf="$3" tags sheets css=0 inl s
  tags=$(python3 - "$bf" <<'PY'
import re, sys
h = open(sys.argv[1], encoding='utf-8', errors='replace').read()
bad = 0
for t in re.findall(r'<(?:script|link|img|source|iframe|video|audio)\b[^>]*>', h, re.I):
    for v in re.findall(r'\b(?:src|href|srcset)\s*=\s*"([^"]*)"', t, re.I):
        if re.match(r'(?i)^\s*(https?:)?//', v) and not v.startswith('https://atxwashdryfold.com/'):
            bad += 1
print(bad)
PY
)
  sheets=$(python3 - "$bf" <<'PY'
import re, sys
h = open(sys.argv[1], encoding='utf-8', errors='replace').read()
for t in re.findall(r'<link\b[^>]*>', h, re.I):
    if re.search(r'rel\s*=\s*"[^"]*stylesheet', t, re.I):
        m = re.search(r'href\s*=\s*"(/[^"]*)"', t, re.I)
        if m:
            print(m.group(1))
PY
)
  for s in $sheets; do
    curl -s -o "$TMP/css" -H "Host: $host" "$BASE$s" </dev/null
    css=$((css + $(grep -cE "(url\(\s*['\"]?(https?:)?//|@import\s+(url\()?['\"]?(https?:)?//)" "$TMP/css")))
  done
  inl=$(grep -cE "url\(\s*['\"]?(https?:)?//" "$bf")
  check "C10-static $id" "$tags|$css|$inl" "0|0|0"
}

# ---- C9: /health for every Host and for no Host — 200 JSON, no-store, never a cookie ----
for h in $MKT crhsent.com portal.atxwashdryfold.com ""; do
  r=$(get health "$h" /health)
  check "C9-health ${h:-nohost}" "$(field "$r" 1)|$(ctype "$r")|$(cat "$TMP/health.b")|$(grep -ci '^set-cookie:' "$TMP/health.h")|$(hdr cache-control "$TMP/health.h" | lc)" '200|application/json|{"status":"ok"}|0|no-store'
done

# ---- R6 / R8 / R7 ----
check "R6-portal-404" "$(field "$(get r6 portal.atxwashdryfold.com /)" 1)" "404"
check "R8-unknown-404" "$(field "$(get r8 example.invalid /)" 1)" "404"
r=$(get r7 crhsent.com / -H 'X-Forwarded-Proto: https')
check "R7-crhsent" "$(field "$r" 1)|$(grep -ci '^set-cookie: __Host-crhsent\.sid=' "$TMP/r7.h")" "200|1"

# ---- C11: crhsent.com frame-ancestors ----
for p in / /wavemax/; do
  get c11 crhsent.com "$p" >/dev/null
  check "C11-frame-ancestors crhsent.com $p" "$(hdr content-security-policy "$TMP/c11.h" | grep -oP "frame-ancestors [^;]*")" "frame-ancestors 'self'"
done

# ---- R-3: a forged X-Forwarded-Host never steers a gate (Global Constraint 20) ----
r=$(get r3w crhsent.com /wavemax/ -H 'X-Forwarded-Host: rundberglaundry.com')
check "R3-xfh-wavemax" "$(field "$r" 1)|$(grep -c 'Documented record &mdash; access' "$TMP/r3w.b")|$(grep -c 'WaveMAX 3.0 platform' "$TMP/r3w.b")" "200|1|0"
r=$(get r3r crhsent.com /README.md -H 'X-Forwarded-Host: rundberglaundry.com')
check "R3-xfh-readme" "$(field "$r" 1)|$(grep -c 'This content is private.' "$TMP/r3r.b")" "401|1"
r=$(get c9bi crhsent.com /README.md -H 'X-Forwarded-Host: atxwashdryfold.com')
check "C9b-inverse crhsent.com" "$(field "$r" 1)|$(grep -c 'This content is private.' "$TMP/c9bi.b")" "401|1"

# ---- C7 logo on crhsent.com; C8 negative on crhsent.com ----
r=$(get logoc crhsent.com /assets/images/brand/logo.png)
check "C7-logo crhsent.com" "$(field "$r" 1)|$(ctype "$r")|$(md5sum < "$TMP/logoc.b" | cut -d' ' -f1)|$(stat -c %s "$TMP/logoc.b")" "200|image/png|$LOGO_MD5|$LOGO_BYTES"
r=$(get lwc crhsent.com /assets/images/brand/logo-wavemax.png)
check "C7-logo-wavemax-410 crhsent.com" "$(field "$r" 1)|$(grep -ci '^location:' "$TMP/lwc.h")" "410|0"
c=$(code_of -H 'Host: crhsent.com' -H "CF-Connecting-IP: $STORE_IP" "$BASE/")
check "C8-crhsent-not302" "$([ "$c" = 302 ] && echo 302 || echo not302)" "not302"

for H in $MKT; do
  # ---- C1 / C12 / C10 on / ----
  r=$(get home "$H" /)
  i18n=$(grep -c 'data-i18n="partner.hero.title"' "$TMP/home.b")
  meta=$(grep -oP '<meta name="csp-nonce" content="\K[^"]+' "$TMP/home.b" | head -1)
  bare=$(sed -E 's/<[^>]*>//g' "$TMP/home.b" | grep -oiE 'wavemax[a-z ]*' | grep -vic 'WaveMAX Austin')
  fp=$(grep -o 'href="https://www.wavemaxlaundry.com/austin-tx"' "$TMP/home.b" | wc -l | tr -d ' ')
  imm=$(hdr cache-control "$TMP/home.h" | grep -ci immutable)
  check "C1-home $H" "$(field "$r" 1)|$(ctype "$r")|$i18n|$([ -n "$meta" ] && echo filled || echo empty)|$bare|$fp|$imm" "200|text/html|1|filled|0|$FP_HREFS|0"
  check "C12-canonical $H /" "$(grep -o '<link rel="canonical" href="[^"]*">' "$TMP/home.b" | tr '\n' '#')" "<link rel=\"canonical\" href=\"$CANON/\">#"
  csp_cells "$H /" "$TMP/home.h" "$TMP/home.b"
  static_cells "$H /" "$H" "$TMP/home.b"

  # ---- C2 / C12 / C10 on /affiliate ----
  for p in /affiliate /affiliate/; do
    r=$(get aff "$H" "$p")
    check "C2-affiliate $H $p" "$(field "$r" 1)|$(grep -o '<link rel="canonical" href="[^"]*">' "$TMP/aff.b" | tr '\n' '#')" "200|<link rel=\"canonical\" href=\"$CANON/affiliate\">#"
  done
  check "C12-canonical $H /affiliate" "$(grep -o '<link rel="canonical" href="[^"]*">' "$TMP/aff.b" | tr '\n' '#')" "<link rel=\"canonical\" href=\"$CANON/affiliate\">#"
  csp_cells "$H /affiliate" "$TMP/aff.h" "$TMP/aff.b"
  static_cells "$H /affiliate" "$H" "$TMP/aff.b"

  # ---- C2 D5 (/wavemax-affiliate, PENDING COUNSEL until merged) ----
  if [ "$D5" = merged ]; then
    r=$(get d5 "$H" '/wavemax-affiliate?utm=1'); loc=$(field "$r" 3)
    case "$(field "$r" 1)|$loc" in
      "301|https://$H/affiliate?utm=1"|"301|$BASE/affiliate?utm=1") pass "C2-wavemax-affiliate $H" ;;
      *) fail "C2-wavemax-affiliate $H" "got=[$(field "$r" 1) $loc]" ;;
    esac
  else
    emit "SKIP C2-wavemax-affiliate $H D5 PENDING COUNSEL"
  fi

  # ---- C3 robots ----
  r=$(get rob "$H" /robots.txt); f="$TMP/rob.b"
  check "C3-robots $H" "$(field "$r" 1)|$(ctype "$r")|$(grep -c '^Disallow: /$' "$f")|$(grep -A1 '^User-agent: \*$' "$f" | grep -c '^Disallow: /$')|$(grep -c 'Content-Signal' "$f")|$(grep -c '^Disallow: /api/$' "$f")|$(grep -c "^Sitemap: $CANON/sitemap.xml$" "$f")|$(hdr cache-control "$TMP/rob.h" | grep -c 'max-age=3600')" "200|text/plain|9|0|0|1|1|1"

  # ---- C4 sitemap: well-formed, exactly the two canonical locs, each loc 200 ----
  r=$(get sm "$H" /sitemap.xml)
  wf=$(python3 -c 'import sys, xml.dom.minidom as m; m.parseString(open(sys.argv[1], "rb").read()); print("ok")' "$TMP/sm.b" 2>/dev/null </dev/null)
  locs=$(grep -o '<loc>[^<]*</loc>' "$TMP/sm.b" | sed 's/<[^>]*>//g' | tr '\n' ' ')
  bad=0
  for u in $locs; do
    case "$u" in
      "$CANON"/*) [ "$(code_of -H 'Host: atxwashdryfold.com' "$BASE${u#"$CANON"}")" = 200 ] || bad=$((bad+1)) ;;
      *) bad=$((bad+1)) ;;
    esac
  done
  check "C4-sitemap $H" "$(field "$r" 1)|$(ctype "$r")|$wf|$locs|$bad|$(hdr cache-control "$TMP/sm.h" | grep -c 'max-age=3600')" "200|application/xml|ok|$CANON/ $CANON/affiliate |0|1"

  # ---- C5 security.txt + favicon (address deliverability is MANUAL C5-contact) ----
  r=$(get sec "$H" /.well-known/security.txt); f="$TMP/sec.b"
  exp=$(grep -oP '^Expires: \K.*' "$f" | head -1)
  fut=past; [ -n "$exp" ] && [ "$(date -d "$exp" +%s 2>/dev/null || echo 0)" -gt "$(date +%s)" ] && fut=future
  check "C5-securitytxt $H" "$(field "$r" 1)|$(ctype "$r")|$(grep -c "^Contact: mailto:$SEC_CONTACT$" "$f")|$fut|$(grep -Eic 'franchis|wavemax' "$f")|$(grep -c "^Canonical: https://$H/.well-known/security.txt$" "$f")|$(grep -c '^Policy: https://portal.atxwashdryfold.com/privacy-policy$' "$f")" "200|text/plain|1|future|0|1|1"
  r=$(get fav "$H" /favicon.ico)
  check "C5-favicon $H" "$(field "$r" 1)|$(ctype "$r")" "200|image/png"

  # ---- C6 page-JS path + limiter-free negative (the mail itself is MANUAL C6-mail) ----
  curl -s -o "$TMP/pi.js" -H "Host: $H" "$BASE/assets/js/partner-inquiry.js" </dev/null
  curl -s -o "$TMP/ai.js" -H "Host: $H" "$BASE/assets/js/affiliate-inquiry.js" </dev/null
  check "C6-pagejs $H" "$(grep -c "fetch('/api/partner-inquiry'" "$TMP/pi.js")|$(grep -c '/api/v1/' "$TMP/pi.js")|$(grep -c "fetch('/api/affiliate-application'" "$TMP/ai.js")|$(grep -c '/api/v1/' "$TMP/ai.js")" "1|0|1|0"
  check "C6-v1-anything-else $H" "$(code_of -X POST -H "Host: $H" -H 'Content-Type: application/json' --data '{}' "$BASE/api/v1/anything-else")" "404"

  # ---- C7 B7 301s (byte-exact Location, GET and HEAD), negatives, logo, DMCA 410 ----
  for m in GET HEAD; do
    for q in "/embed-app-v2.html?route=/claim&bag=$TOK" "/embed-app-v2.html?route=/order-expediter&k=abc"; do
      if [ "$m" = HEAD ]; then
        r=$(curl -s -I -o /dev/null -w '%{http_code} %{redirect_url}' -H "Host: $H" "$BASE$q" </dev/null)
      else
        r=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -H "Host: $H" "$BASE$q" </dev/null)
      fi
      case "$q" in *claim*) id=C7-bagqr-301 ;; *) id=C7-expediter-301 ;; esac
      check "$id $H $m" "$r" "301 $PORTAL$q"
    done
  done
  for p in /admin /admin/ /operator /operator/ /operator-scan-embed.html /scanbag /scanbag/ /scanbag-manifest.json /scanbag-sw.js /monitoring-dashboard.html /api/v1/customers/verify-email/abc; do
    check "C7-legacy-301 $H $p" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -H "Host: $H" "$BASE$p" </dev/null)" "301 $PORTAL$p"
  done
  neg="$(code_of -X POST -H "Host: $H" "$BASE/api/v1/customers/register")|$(code_of -H "Host: $H" "$BASE/api/v1/customers/other")"
  neg="$neg|$(not301 "$(code_of -X POST -H "Host: $H" "$BASE/embed-app-v2.html")")|$(not301 "$(code_of -H "Host: $H" "$BASE/assets/x.css")")|$(not301 "$(code_of -H "Host: $H" "$BASE/locales/en/common.json")")"
  check "C7-negative $H" "$neg" "404|404|not301|not301|not301"
  r=$(get logo "$H" /assets/images/brand/logo.png)
  check "C7-logo $H" "$(field "$r" 1)|$(ctype "$r")|$(md5sum < "$TMP/logo.b" | cut -d' ' -f1)|$(stat -c %s "$TMP/logo.b")" "200|image/png|$LOGO_MD5|$LOGO_BYTES"
  r=$(get lw "$H" /assets/images/brand/logo-wavemax.png)
  check "C7-logo-wavemax-410 $H" "$(field "$r" 1)|$(grep -ci '^location:' "$TMP/lw.h")" "410|0"

  # ---- C8 store-IP 302 (on-box only; C8b is S3) ----
  for q in "/" "/affiliate?x=1" "/anything?x=1"; do
    r=$(curl -s -D "$TMP/s.h" -o /dev/null -w '%{http_code} %{redirect_url}' -H "Host: $H" -H "CF-Connecting-IP: $STORE_IP" "$BASE$q" </dev/null)
    check "C8-storeip-302 $H $q" "$r|$(hdr cache-control "$TMP/s.h" | lc)" "302 $PORTAL$q|no-store"
  done
  check "C8-nonstore-200 $H" "$(code_of -H "Host: $H" -H 'CF-Connecting-IP: 203.0.113.10' "$BASE/?x=1")" "200"
  check "C8-legacy-wins $H" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -H "Host: $H" -H "CF-Connecting-IP: $STORE_IP" "$BASE/admin" </dev/null)" "301 $PORTAL/admin"
  emit "SKIP C8b $H on-box: header is edge-owned and re-stamped by nginx (S3 --via-box/--via-cf)"

  # ---- C9b spoof: 100 requests with X-Forwarded-Host: crhsent.com mint no cookie ----
  sc=0
  for i in $(seq 100); do
    curl -s -D "$TMP/sp.h" -o "$TMP/sp.b" -H "Host: $H" -H 'X-Forwarded-Host: crhsent.com' "$BASE/?sp=$i" </dev/null
    sc=$((sc + $(grep -ci '^set-cookie:' "$TMP/sp.h")))
  done
  check "C9b-spoof $H" "$sc|$(grep -c 'data-i18n="partner.hero.title"' "$TMP/sp.b")" "0|1"

  # ---- C13 locales: 200 JSON, ACAO *, 119 partner.* keys, no bare mark, identical key sets ----
  sets=""
  for l in en es pt de; do
    r=$(get loc "$H" "/locales/$l/common.json")
    out=$(node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const f=(o,p="")=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==="object"?f(v,p+k+"."):[p+k]);const k=f(j);console.log(k.filter((x)=>x.startsWith("partner.")).length+"|"+/wavemax/i.test(JSON.stringify(j).replace(/WaveMAX Austin/g,""))+"|"+require("crypto").createHash("md5").update(k.sort().join(",")).digest("hex"))' "$TMP/loc.b" 2>/dev/null </dev/null || echo "parse-error|x|none-$l")
    check "C13-locales $H $l" "$(field "$r" 1)|$(ctype "$r")|$(hdr access-control-allow-origin "$TMP/loc.h")|${out%|*}" "200|application/json|*|$PARTNER_KEYS|false"
    sets="$sets ${out##*|}"
  done
  check "C13-keysets $H" "$(printf '%s\n' $sets | sort -u | wc -l | tr -d ' ')" "1"
done

# ---- MANUAL / REMOTE cells scheduled at S1, cleared only by --attest ----
for m in $MANUAL_IDS; do
  if { [ -n "$ATTESTED_LOG" ] && grep -q "^MANUAL $m PASS " "$ATTESTED_LOG" 2>/dev/null; } || [[ " ${GATE_ATTESTED:-} " == *" $m "* ]]; then
    emit "PASS $m attested"
  else
    emit "MANUAL $m PENDING"; PENDING=$((PENDING+1))
  fi
done
emit "SUMMARY S1 fails=$FAILS pending=$PENDING"
if [ "$FAILS" -eq 0 ] && [ "$PENDING" -eq 0 ]; then exit 0; else exit 1; fi
```

- [ ] **Step 4: Run the test and confirm it passes.**
  - Command: `chmod +x scripts/ops/cutover-gate.sh && bash -n scripts/ops/cutover-gate.sh && npx jest tests/unit/ops/cutoverGateS1.test.js`
  - Expected: `bash -n` prints nothing, then `Tests: 6 passed, 6 total`. The suite takes about 25 s: five full S1 runs against the in-process stub.

- [ ] **Step 5: Prove the on-box delivery form (script on stdin) against the same stub.** Tasks 77, 80 and 82 run the script as `bash -s < scripts/ops/cutover-gate.sh`, so it must not consume its own stdin.
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
node -e "const fs=require('fs');let s=fs.readFileSync('tests/unit/ops/cutoverGateS1.test.js','utf8');s=s.slice(0,s.indexOf(\"describe('cutover-gate.sh\"));eval(s+';stub().listen(38123,\"127.0.0.1\")')" &
STUB=$!; sleep 2
GATE_LOGO_MD5=$(printf fake-png-bytes | md5sum | cut -d' ' -f1) GATE_LOGO_BYTES=14 GATE_ATTESTED='C5-contact C6-mail C13-click C14-baseline P1 P2 P3 P8 P13 P14 R2-cors' \
  bash -s -- --stage S1 --on-box --base http://127.0.0.1:38123 < scripts/ops/cutover-gate.sh | tail -1; echo "exit=${PIPESTATUS[0]}"
kill $STUB
```
  - Expected: `SUMMARY S1 fails=0 pending=0`, then `exit=0`.

- [ ] **Step 6: Commit.**
  - Command: `git add scripts/ops/cutover-gate.sh tests/unit/ops/cutoverGateS1.test.js && git commit -m "ops(gate): cutover-gate.sh stage S1 --on-box cells, MANUAL PENDING and --attest (spec §10.0-§10.2, §5.12)" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git push`

---

### Task 71: `scripts/ops/lh-dark-origin-proxy.js` — local TLS shim so Lighthouse reaches the dark `:3001`

**Files:**
- Create: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/scripts/ops/lh-dark-origin-proxy.js`
- Create: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/unit/ops/lhDarkOriginProxy.test.js`

**Interfaces:**
- Consumes: Node `https`/`http`; `openssl` on the workstation (test fixture only).
- Produces:
  - `module.exports = { createProxy({ cert, key, upstreamHost, upstreamPort }) → https.Server }`. The incoming `Host` header, method, path and query go upstream byte-identical; status, headers and body come back unchanged; an upstream error answers `502 text/plain`.
  - CLI: `node scripts/ops/lh-dark-origin-proxy.js --listen 18443 --upstream 127.0.0.1:13001 --cert <pem> --key <pem>`, which prints `lh shim on 127.0.0.1:18443`.

- [ ] **Step 1: Write the failing test** at `tests/unit/ops/lhDarkOriginProxy.test.js`:
```js
// tests/unit/ops/lhDarkOriginProxy.test.js
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createProxy } = require('../../../scripts/ops/lh-dark-origin-proxy');

test('forwards Host, path and query verbatim and relays status, headers and body', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhp-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${dir}/k.pem`, '-out', `${dir}/c.pem`, '-subj', '/CN=atxwashdryfold.com', '-days', '1'], { stdio: 'ignore' });
  const upstream = http.createServer((req, res) => {
    res.writeHead(418, { 'x-seen-host': req.headers.host, 'content-security-policy': "frame-ancestors 'self'" });
    res.end(req.url);
  });
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
  const proxy = createProxy({
    cert: fs.readFileSync(`${dir}/c.pem`),
    key: fs.readFileSync(`${dir}/k.pem`),
    upstreamHost: '127.0.0.1',
    upstreamPort: upstream.address().port
  });
  await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
  const res = await new Promise((resolve, reject) => https.get({
    host: '127.0.0.1',
    port: proxy.address().port,
    path: '/affiliate?lh=1&x=%2F',
    headers: { host: 'atxwashdryfold.com' },
    rejectUnauthorized: false
  }, (r) => {
    let b = '';
    r.on('data', (d) => { b += d; });
    r.on('end', () => resolve({ r, b }));
  }).on('error', reject));
  expect(res.r.statusCode).toBe(418);
  expect(res.r.headers['x-seen-host']).toBe('atxwashdryfold.com');
  expect(res.r.headers['content-security-policy']).toBe("frame-ancestors 'self'");
  expect(res.b).toBe('/affiliate?lh=1&x=%2F');
  await new Promise((r) => proxy.close(r));
  await new Promise((r) => upstream.close(r));
});
```

- [ ] **Step 2: Run the test and confirm it fails.**
  - Command: `cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npx jest tests/unit/ops/lhDarkOriginProxy.test.js`
  - Expected FAIL: `Test suite failed to run`, with `Cannot find module '../../../scripts/ops/lh-dark-origin-proxy' from 'tests/unit/ops/lhDarkOriginProxy.test.js'`.

- [ ] **Step 3: Write the implementation** at `scripts/ops/lh-dark-origin-proxy.js`:
```js
#!/usr/bin/env node
// scripts/ops/lh-dark-origin-proxy.js — Phase 0a Lighthouse shim (Plan 2 slice GATE, Task 82).
// In Phase 0a nginx on <box-ip>:443 still routes every marketing host to :3000, so a
// literal `--host-resolver-rules="MAP <host> <box-ip>"` would score the OLD app. Lighthouse
// reaches the DARK :3001 instead through:
//   Chrome --host-resolver-rules="MAP <host> 127.0.0.1:18443" -> this HTTPS shim
//   -> ssh -L 13001:127.0.0.1:3001 -> box :3001.
// The Host header, method, path and query go upstream unchanged; status, headers and body
// come back unchanged. There is no nginx gzip or HTTP/2 on this path, so Performance
// measured through it is informational only.
'use strict';
const https = require('https');
const http = require('http');
const fs = require('fs');

function createProxy({ cert, key, upstreamHost, upstreamPort }) {
  return https.createServer({ cert, key }, (req, res) => {
    const up = http.request(
      { host: upstreamHost, port: upstreamPort, method: req.method, path: req.url, headers: req.headers },
      (ur) => {
        res.writeHead(ur.statusCode, ur.headers);
        ur.pipe(res);
      }
    );
    up.on('error', (e) => {
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`upstream error: ${e.message}`);
    });
    req.pipe(up);
  });
}

if (require.main === module) {
  const arg = (n) => process.argv[process.argv.indexOf(n) + 1];
  const [uh, up] = arg('--upstream').split(':');
  createProxy({
    cert: fs.readFileSync(arg('--cert')),
    key: fs.readFileSync(arg('--key')),
    upstreamHost: uh,
    upstreamPort: Number(up)
  }).listen(Number(arg('--listen')), '127.0.0.1', () => process.stdout.write(`lh shim on 127.0.0.1:${arg('--listen')}\n`));
}

module.exports = { createProxy };
```

- [ ] **Step 4: Run the test and confirm it passes.**
  - Command: `npx jest tests/unit/ops/lhDarkOriginProxy.test.js`
  - Expected: `Tests: 1 passed, 1 total`.

- [ ] **Step 5: Commit.**
  - Command: `git add scripts/ops/lh-dark-origin-proxy.js tests/unit/ops/lhDarkOriginProxy.test.js && git commit -m "ops(lighthouse): TLS shim so the Phase 0a baseline measures the dark :3001, not nginx -> :3000" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git push`

---

### Task 72: Local pre-flight, Phase-0 exit check (§9.1) and the record file — nothing is written to a box

**Files:** none in any repo.
- Creates `/var/www/wavemax/cutover-logs/` and `/var/www/wavemax/cutover-logs/lighthouse/` on the workstation.
- Creates `/var/www/wavemax/cutover-logs/phase0a-record.env`.
- Creates `/mnt/c/Users/rickh/GitHub/aff-compat` (a detached git worktree; guarded, reused on re-run).

**Interfaces:**
- Consumes:
  - web-core tag `v0.2.1` (P0 slice Task 8);
  - corporate `main` carrying A1–A9 and B-3 (A15 + A69 slices, including A69 Task 62), with D5 optional;
  - the affiliate commit each box runs;
  - the Phase-0 prerequisite evidence produced by the P0 slice (P-10, P-13, P-15, P-16, P-17).
- Produces record lines (this task writes no per-box keys):
  - `WC_TAG=v0.2.1`, `WC_ROLLBACK_TAG=v0.2.0`, `WC_TAG_COMMIT`
  - `CORP_SHA`, `CORP_BASE_SHA=8133667`, `D5_STATE` (`pending`|`merged`)
  - `AFF_SHA` — the BOX HEAD, never local `origin/main`, which Tasks 70, 71 and 83 advance
  - `P8_SUBJECT`, `P1_REFUSE`, `SEC_CONTACT`, `CF_CODES_BEFORE`
  - `P10_RESULT`, `P12_RESULT`, `P13_RESULT`, `P14_RESULT`, `P15_RESULT`, `P16_RESULT`, `P17_RESULT`
- Precondition lines that the P0 slice evidence (or Rick) writes into the record before this task runs:
  - exactly one of `P11_DEVICES_SIGNED=` / `P11_DEFERRED_TO_PLAN3=`;
  - `P13_ACCEPTED=` only when the `pickups@` goto was deliberately left unchanged;
  - `P15_PROBE_DELIVERED=`;
  - exactly one of `P16_ONBOX_FALLBACK=` (Rick's Q-12 answer: rely on P0 Task 17's committed on-box cron fallback, whose install and drill run AFTER the deploy in Task 81 Step 7) / `P16_EXTERNAL_SERVICE=` (the external service and its check ids). `P16_DRILL_DELIVERED=` is written only by Task 81 Step 7.

- [ ] **Step 0: Evidence directory and record helper.** Every later step of this task runs in this shell.
```bash
sudo mkdir -p /var/www/wavemax/cutover-logs/lighthouse && sudo chown -R "$USER" /var/www/wavemax/cutover-logs && chmod 700 /var/www/wavemax/cutover-logs
EV=/var/www/wavemax/cutover-logs; REC=$EV/phase0a-record.env; touch "$REC"; chmod 600 "$REC"
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
ls -ld "$EV" "$REC"
```
  - Expected: `drwx------ … <your user> … /var/www/wavemax/cutover-logs`, then `-rw------- … phase0a-record.env`.

- [ ] **Step 1: web-core `v0.2.1` exists, is clean, and carries B3g/B3k.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git fetch --tags --quiet
test -z "$(git status --porcelain)" && echo CLEAN
git checkout --quiet v0.2.1 && git describe --exact-match --tags
node -p "require('./package.json').version"
node -p "Object.keys(require('./src/index.js')).length"
grep -c 'data-i18n-aria-label' assets/js/i18n.js
test ! -e src/config/brand.js && echo brand.js-absent
grep -oE 'tagged @crhs/web-core v0\.2\.1 \([0-9a-f]{40}\)' /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tasks/todo.md | head -1 | grep -oE '[0-9a-f]{40}'; git rev-parse 'v0.2.1^{commit}'
rec WC_TAG v0.2.1; rec WC_ROLLBACK_TAG v0.2.0; rec WC_TAG_COMMIT "$(git rev-parse 'v0.2.1^{commit}')"
```
  - Expected: `CLEAN`, `v0.2.1`, `0.2.1`, `26`, a count ≥ `1`, `brand.js-absent`, then two identical 40-hex SHAs: the D-1 record P0 Task 19 Step 8 wrote, then the tag's commit.
  - **STOP** if the two SHAs differ or the first is missing: the tag on disk is not the release the P0 slice verified and recorded.
  - **STOP** if `git checkout v0.2.1` fails: the P0 slice's release task has not run.

- [ ] **Step 2: web-core suite, lint, cycles, and the R-5 logger default.**
```bash
npm test 2>&1 | tail -5; npm run lint; echo "lint-exit=$?"; npx --yes madge --circular src/
node -e "delete process.env.LOG_SERVICE_NAME; console.log(require('./src/utils/logger').defaultMeta.service)"
```
  - Expected:
    - `Tests:       579 passed, 579 total`. This is the P0 release count: 572 − 8 (`brand.test.js`) + 4 (transport) + 2 (brandModuleRemoved) + 6 (validateMailConfig) + 2 (i18n) + 1 (brandNeutral).
    - `lint-exit=0`.
    - `✔ No circular dependency found!`.
    - `app`: the `v0.2.1` logger default (R-5). It is why Task 74 must write `LOG_SERVICE_NAME=crhs-corporate` before the first reload.

- [ ] **Step 3: corporate `main` has A1–A9, no `req.session`, and no client-steerable host derivation.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && git fetch --quiet && git checkout --quiet main && git pull --ff-only --quiet
test -z "$(git status --porcelain)" && echo CLEAN
for f in server/config/hosts.js server/contentHandler.js server/middleware/rateLimitPolicy.js server/middleware/hostAwareCsp.js server/bootMail.js server/templates/emails/base-template.html scripts/check-i18n-parity.js content/atxwashdryfold/index.html content/atxwashdryfold/affiliate/index.html tests/marqueeTicker.test.js; do test -e "$f" || echo "MISSING $f"; done
test ! -e tests/crhsent-parity.test.js && echo A1-A9_PRESENT
git grep -n 'req\.session' -- server server.js; echo "req.session-exit=$?"
git grep -niE 'req\.hostname|x-forwarded-host' -- server server.js | grep -vE '^[^:]+:[0-9]+:\s*(//|/\*|\*)'; echo "host-derivation-exit=$?"
npx jest tests/hostDerivation.test.js 2>&1 | grep -E '^Tests:' 
rec CORP_SHA "$(git rev-parse HEAD)"; rec CORP_BASE_SHA 8133667
rec D5_STATE "$([ "$(git grep -l "'/wavemax-affiliate'" -- server server.js | wc -l)" -gt 0 ] && echo merged || echo pending)"
tail -3 "$REC"
```
  - Expected: `CLEAN`; no `MISSING` line; `A1-A9_PRESENT`; `req.session-exit=1` (git grep found nothing — R-10); `host-derivation-exit=1` (no non-comment `req.hostname` / `x-forwarded-host`, matched case-insensitively with `//` and block-comment lines excluded — Global Constraint 20); a `Tests:` line with no `failed` from corporate's own guard `tests/hostDerivation.test.js` (A15 Task 26; authoritative — the grep is the coarse cross-check); then the three record lines.
  - `D5_STATE=pending` unless A69 Task 47's route literal is in `main`.
  - `CORP_BASE_SHA=8133667` is the corporate `main` at Plan 1 exit. Task 75 uses it to check which files the rsync may delete.

- [ ] **Step 4: corporate suite against `v0.2.1`.** web-core must still be checked out at the tag (Step 1).
```bash
rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund 2>&1 | tail -2
node -p "require('@crhs/web-core/package.json').version"
npm test 2>&1 | tail -5; npm run lint; echo "lint-exit=$?"; npm run check:i18n; npx --yes madge --circular server/
```
  - Expected: `0.2.1`; a `Tests:` line containing no `failed` (the script is `TZ=America/Chicago jest --runInBand` — no `--forceExit`); `lint-exit=0`; `i18n parity OK: 119 keys × 4 locales`; `✔ No circular dependency found!`.

- [ ] **Step 5: §10.3 P8, corporate half (S1).**
```bash
npm test -- tests/server.integration.test.js tests/csp.test.js 2>&1 | tail -4
git log --format=%s -- tests/csp.test.js | wc -l
git log --format=%s -1 -- tests/csp.test.js
rec P8_SUBJECT "$(git log --format=%s -1 -- tests/csp.test.js)"
test "$(git log --format=%s -1 -- tests/csp.test.js)" = "golden(csp): deliberate re-capture (D16a)" && echo P8_SUBJECT_OK
```
  - Expected: a `Tests:` line with no `failed`; `1`; `golden(csp): deliberate re-capture (D16a)`; `P8_SUBJECT_OK`.
  - **STOP** if the count is not `1`: a second commit re-captured the golden outside the single deliberate re-capture.
  - **STOP** if `P8_SUBJECT_OK` is missing: A69 Task 56 was committed under another subject (R-16).

- [ ] **Step 6: §10.3 P1, part two — a staging boot with a mismatched `EMAIL_FROM` refuses to start.** This is proved once, locally, at `CORP_SHA`, and later attested into both S1 logs.
```bash
L=$(mktemp -d)
NODE_ENV=development PORT=39001 LOG_DIR="$L" MONGODB_URI=mongodb://127.0.0.1:1/p1-refuse \
  EMAIL_USER=no-reply@wavemax.promo EMAIL_FROM=no-reply@crhsent.com \
  EMAIL_TEMPLATE_ROOT="$PWD/server/templates/emails" timeout 60 node server.js > "$L/boot.out" 2>&1; echo "exit=$?"
grep -c 'Mail configuration invalid; refusing to start:' "$L/boot.out" "$L/error.log"
rec P1_REFUSE "exit=1 staging boot EMAIL_USER=no-reply@wavemax.promo EMAIL_FROM=no-reply@crhsent.com refused $(date -u +%FT%TZ)"
```
  - Expected: `exit=1`, then `…/boot.out:1` and `…/error.log:1`.
  - Why these counts: A69 Task 58's `assertMailConfig()` runs before `await db.connect()`. It logs `Mail configuration invalid; refusing to start: <message>` once and rethrows, and the boot `catch` exits 1. `EMAIL_TEMPLATE_ROOT` is the real root, so the domain check is the only failing condition.

- [ ] **Step 7: Affiliate compatibility with `v0.2.1`, proven AT the box HEAD (R-13).**
```bash
for ip in 161.153.71.201 144.24.4.202; do ssh -i ~/.ssh/oci_wavemax ubuntu@$ip 'git -C /var/www/wavemax/wavemax-affiliate-program rev-parse HEAD'; done
```
  - Expected: two identical SHAs. **STOP** if they differ: Phase 0a does not pull affiliate code, and a skewed pair would have to be resolved first.
```bash
AFF_SHA=$(ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'git -C /var/www/wavemax/wavemax-affiliate-program rev-parse HEAD'); test "$AFF_SHA" = "$(ssh -i ~/.ssh/oci_wavemax ubuntu@144.24.4.202 'git -C /var/www/wavemax/wavemax-affiliate-program rev-parse HEAD')" && rec AFF_SHA "$AFF_SHA" && echo "AFF_SHA=$AFF_SHA"
W=/mnt/c/Users/rickh/GitHub/aff-compat
test -d "$W" || git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program worktree add --detach "$W" "$AFF_SHA"
git -C "$W" checkout --quiet --detach "$AFF_SHA" && git -C "$W" rev-parse HEAD
cd "$W" && npm install --install-links --no-audit --no-fund 2>&1 | tail -2
rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund 2>&1 | tail -2
node -p "require('@crhs/web-core/package.json').version"
node -p "Object.keys(require('@crhs/web-core').csrf).includes('createCsrf')"
node -p "Object.keys(require('@crhs/web-core')).length"
node -p "require.resolve('mongoose',{paths:[require.resolve('@crhs/web-core')]})===require.resolve('mongoose')"
NODE_ENV=test node -e "try{require('./server.js');console.log('BOOT_OK');process.exit(0)}catch(e){console.log(e.message);process.exit(1)}"
npx jest tests/integration/webCoreInstanceIdentity.test.js tests/integration/webCoreConsumptionGolden.test.js tests/integration/securityHeaders.test.js 2>&1 | tail -4
npm run check:i18n; echo "i18n-exit=$?"; npx --yes madge --circular server/
```
  - Expected, in order: `AFF_SHA=<the 40-hex box SHA>`; the same SHA again (the worktree HEAD); `0.2.1`; `true`; `26`; `true`; `BOOT_OK`; a `Tests:` line with no `failed`; `i18n-exit=0`; `✔ No circular dependency found!`.
  - The worktree sits beside `crhs-web-core`, so `file:../crhs-web-core` resolves to the tag checked out in Step 1.
  - Never `wc.SystemConfig.base` in the affiliate (R-15). The affiliate full suite runs once, in Step 7b, from the controller session — never inside a subagent (Global Constraint 19).

- [ ] **Step 7b: Affiliate full suite at `AFF_SHA` against `v0.2.1` — ONCE, controller-run, in the background (R-16).** Start it with the controller's background runner right after Step 7; Steps 8–12 proceed while it runs, and Step 13 waits for it. The command sets its own paths because a background shell does not inherit Step 0's variables.
```bash
cd /mnt/c/Users/rickh/GitHub/aff-compat && L=/var/www/wavemax/cutover-logs/affiliate-full-suite.log
git rev-parse HEAD > "$L"; npm test >> "$L" 2>&1; echo "suite-exit=$?" >> "$L"
head -1 "$L"; grep -E '^(FAIL|Tests:|Test Suites:)|^suite-exit=' "$L"
```
  - Expected: the `AFF_SHA` from Step 7; `FAIL` lines naming exactly `tests/unit/i18n-brand-token.test.js` and `tests/unit/branding-guard.test.js` (Global Constraint 19's two known failures) and no other suite; the `Test Suites:` and `Tests:` totals; `suite-exit=1`.
  - Any other `FAIL` suite: re-run it alone (`npx jest <file>`) before debugging — this suite has order-dependent failures that pass in isolation. Passes alone → note the file in the record and continue. Fails alone → **STOP**: the affiliate is not compatible with `v0.2.1`.
  - Then, in the Step 0 shell: `rec AFF_FULL_SUITE "$(grep -E '^Tests:' /var/www/wavemax/cutover-logs/affiliate-full-suite.log | tail -1)"`.

- [ ] **Step 8: §9.1 P-10 — `sessions_corporate` exists on ADB (read-only, oci1; shared database).**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'cd /var/www/crhs-corporate && node -e "require(\"dotenv\").config();const db=require(\"./server/db\");const m=require(\"mongoose\");db.connect().then(async()=>{console.log(JSON.stringify((await m.connection.db.listCollections().toArray()).map(c=>c.name).filter(n=>/^sessions/.test(n)).sort()));process.exit(0)}).catch(e=>{console.log(\"DB_ERR \"+e.message);process.exit(1)})"'
rec P10_RESULT PASS
```
  - Expected: `["sessions","sessions_corporate"]`.
  - **STOP** if `sessions_corporate` is missing: ADB cannot upsert-create it, and the first boot with `collectionName` set would fail session writes on crhsent.com.
  - Never `drop()` a sessions collection on ADB.

- [ ] **Step 9: §9.1 P-12 (gate G1, Plan 1 form) and §10.3 P14's token check.**
```bash
TOKEN=$(cat ~/.cf_api_token); ACCT=b69ef162d008b11492296d3b35cad2fe
curl -s -H "Authorization: Bearer $TOKEN" "https://api.cloudflare.com/client/v4/accounts/$ACCT/tokens/verify" | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"]["status"])'
curl -s -H "Authorization: Bearer $TOKEN" "https://api.cloudflare.com/client/v4/accounts/$ACCT/load_balancers/monitors/be6953d2e0cfd7b40c4f414b5ddf20d9" | python3 -c 'import sys,json;r=json.load(sys.stdin)["result"];print(r["header"].get("Host")==["portal.atxwashdryfold.com"], r["path"]=="/health/origin", str(r["expected_codes"])=="200", not r.get("expected_body"))'
curl -s -H "Authorization: Bearer $TOKEN" "https://api.cloudflare.com/client/v4/accounts/$ACCT/load_balancers/pools/1e3795c02e98b9506cfab578c9cb7c97/health" | python3 -c 'import sys,json;r=json.load(sys.stdin)["result"];print(all(v.get("healthy") for v in r["pop_health"].values()))'
rec P12_RESULT PASS
```
  - Expected: `active`; `True True True True`; `True`.
  - **STOP** if the token is not `active`. It expires 2026-09-16 (Global Constraint 2). To replace it: mint a new account-owned token (Account → Load Balancing: Monitors and Pools → Edit), install it at `~/.cf_api_token`, verify at `/accounts/{id}/tokens/verify` (never `/user/tokens/verify`), then re-run this step.

- [ ] **Step 10: §9.1 P-13, P-15 and §10.3 P14's aliases (read-only, on the mail host `158.62.198.7`).**
```bash
sudo ssh wavemax-promo 'cd /opt/mailcow-dockerized && set -a && . ./mailcow.conf && set +a && docker compose exec -T mysql-mailcow mysql -u"$DBUSER" -p"$DBPASS" "$DBNAME" -N -e "select address,goto,active from alias where address in (\"affiliates@rundberglaundry.com\",\"cutover-gate@crhsent.com\",\"legal@rundberglaundry.com\",\"pickups@atxwashdryfold.com\",\"privacy@rundberglaundry.com\",\"security@crhsent.com\",\"support@rundberglaundry.com\") order by address" 2>/dev/null' | tee "$EV/aliases-phase0.txt"
grep -cE '^P11_(DEVICES_SIGNED|DEFERRED_TO_PLAN3)=' "$REC"; grep -c '^P15_PROBE_DELIVERED=' "$REC"; grep -c '^P13_ACCEPTED=' "$REC"
```
  - Expected: seven tab-separated rows, each with `active` = `1`:
    - `affiliates@rundberglaundry.com`, `legal@rundberglaundry.com`, `privacy@rundberglaundry.com`, `support@rundberglaundry.com` → goto `admin@crhsent.com` (§10.3 P14);
    - `cutover-gate@crhsent.com` and `security@crhsent.com` → goto `admin@crhsent.com` (§9.1 P-15);
    - `pickups@atxwashdryfold.com` → a goto.
  - Then the three counts `1`, `1`, and `0` or `1`.
  - P-13 passes when the `pickups@atxwashdryfold.com` goto is `admin@crhsent.com` (the single real mailbox since 2026-09-13, Task 16 owner-directed variant), OR when the third count is `1` (Rick's recorded acceptance sentence).
  - The P-11 line: §9.1's exit list names P-11, while the P-11 item itself times the device checklist "BEFORE Phase 1 step 3". Rick writes exactly one of these two lines:
    - `printf 'P11_DEVICES_SIGNED=%q\n' "rick $(date -u +%FT%TZ) display+kiosk+admin+scanbag on portal" >> "$REC"`
    - `printf 'P11_DEFERRED_TO_PLAN3=%q\n' "rick $(date -u +%FT%TZ) checklist executes before the rundberglaundry.com flip" >> "$REC"`
  - Record the security.txt contact:
    - `rec SEC_CONTACT security@crhsent.com` when the `security@crhsent.com` row is present;
    - `rec SEC_CONTACT admin@crhsent.com` only when Rick declined P-15 and A5 therefore publishes `admin@crhsent.com`.
  - Then `rec P13_RESULT PASS; rec P14_RESULT PASS; rec P15_RESULT PASS`.
  - **STOP** on a missing row or a zero count.

- [ ] **Step 11: §9.1 P-16 (decision + code) and P-17 (read-only, both boxes).**
```bash
for ip in 161.153.71.201 144.24.4.202; do echo "== $ip"; ssh -i ~/.ssh/oci_wavemax ubuntu@$ip 'ls /etc/cron.d/crhs-corporate-health 2>/dev/null | wc -l; sudo ufw status numbered' | tee "$EV/p16-p17-$ip.txt"; done
grep -cE '^P16_(ONBOX_FALLBACK|EXTERNAL_SERVICE)=' "$REC"
git -C /mnt/c/Users/rickh/GitHub/crhs-corporate ls-tree --name-only HEAD scripts/ops/alert.js deploy/cron/crhs-corporate-health | wc -l
rec P16_RESULT "$(grep -q '^P16_EXTERNAL_SERVICE=' "$REC" && echo PASS-external || echo PENDING-drill-Task81-Step7)"; rec P17_RESULT "recorded $EV/p16-p17-161.153.71.201.txt $EV/p16-p17-144.24.4.202.txt"
```
  - Expected per box: `0` (the cron file is not installed yet), followed by the `ufw` table. Then `1` (exactly one Q-12 line), then `2` (both P-16 files, from P0 Task 17, are in corporate `HEAD` = `CORP_SHA` from Step 3).
  - **Declared ordering deviation (R-1 + R-7).** §9.1 lists "P-16's alert drill fired" as a Phase-0 exit clause, but `scripts/ops/alert.js` and `deploy/cron/crhs-corporate-health` reach a box only with the Phase-0a corporate deploy. The cron install and the drill therefore run in Task 81 Step 7, after both boxes are signed off, and `P16_RESULT` reads `PENDING-drill-Task81-Step7` until then (`PASS-external` when Q-12 named an external service). The LB monitor on `/health/origin` (503 when `:3001` is down) stays the first signal throughout.
  - P-17 is record-only: if `:443`/`:80` are not restricted to the Cloudflare ranges plus `70.114.167.145`, C8b at S3 stands as the proof that a forged `CF-Connecting-IP` is inert.

- [ ] **Step 12: The public surface before Phase 0a, through Cloudflare (Task 81 and the rollback compare against it).**
```bash
for h in portal.atxwashdryfold.com crhsent.com rundberglaundry.com runberglaundry.com atxwashdryfold.com atxwashateria.com; do printf '%s %s\n' "$h" "$(curl -s -o /dev/null -w '%{http_code}' "https://$h/?lh=$(date +%s)")"; done | tee "$EV/cf-codes-before.txt"
rec CF_CODES_BEFORE "$(tr '\n' ';' < "$EV/cf-codes-before.txt")"
```
  - Expected: six lines with five `200`s and one `301` — the Plan 1 exit evidence ("6 hostnames through Cloudflare: 5×200 + 1×301"). The per-host codes are recorded, not assumed.

- [ ] **Step 13: Return web-core to `main` and show the record.**
```bash
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core checkout --quiet main && git -C /mnt/c/Users/rickh/GitHub/crhs-web-core rev-parse --abbrev-ref HEAD
grep -cE '^(WC_TAG|WC_ROLLBACK_TAG|WC_TAG_COMMIT|CORP_SHA|CORP_BASE_SHA|D5_STATE|AFF_SHA|P8_SUBJECT|P1_REFUSE|SEC_CONTACT|CF_CODES_BEFORE|P10_RESULT|P12_RESULT|P13_RESULT|P14_RESULT|P15_RESULT|P16_RESULT|P17_RESULT|AFF_FULL_SUITE)=' "$REC"
```
  - Expected: `main`, then `19`. `AFF_FULL_SUITE` exists only once Step 7b has finished — wait for it.
  - Phase 0a may start: Phase 0 is closed (§9.1 exit criteria: P-10…P-17 ticked, P-12's pool check passed, P-15's probe delivered, P-16's Q-12 decision recorded with its code in `CORP_SHA` — the drill runs in Task 81 Step 7, see Step 11).

---

### Task 73: [per box] Read-only baseline — pm2, installed core, `.env` premises, SMTP login, HTTP, CORS, database, logs

**Files:** none in any repo.
- Workstation evidence: `/var/www/wavemax/cutover-logs/{pm2,pm2env,core,env,http,db,log}-before-<box>.txt`.
- Record lines in `/var/www/wavemax/cutover-logs/phase0a-record.env`.

**Interfaces:**
- Consumes: the Task 72 record (`AFF_SHA`, `CORP_SHA`, `WC_TAG`).
- Produces record lines:
  - `S1LOG_<box>`
  - `R0_<box>`, `N_CORP_<box>`, `N_AFF_<box>`
  - `PM2ENV_CORP_<box>`, `PM2ENV_AFF_<box>` (`NONE`, or a comma list of key NAMES)
  - `AFF_PORCELAIN_<box>`, `ENV_OWNER_<box>`
  - `CRHSENT_MD5_<box>`, `CRHSENT_WAVEMAX_CODE_<box>`, `XFH_BEFORE_<box>`, `CORS_BEFORE_<box>`, `RL_CORP_BEFORE_<box>`
- Nothing on the box changes. The Step 5 SMTP check authenticates and sends nothing.

- [ ] **Step 0: Set the box and load the record.** Every later step of this task runs in this shell; if the shell is lost, re-run this step.
```bash
BOX=oci1; IP=161.153.71.201        # Pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/phase0a-record.env
set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
rec "S1LOG_$BOX" "$EV/cutover-gate-S1-$BOX-$(date -u +%F).log"
echo "$BOX $IP AFF_SHA=$AFF_SHA CORP_SHA=$CORP_SHA"
```
  - Expected: the box line, with both SHAs non-empty.

- [ ] **Step 1: pm2 processes, working directories and restart counts.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 jlist' | python3 -c 'import sys,json
for p in json.load(sys.stdin):
    e = p["pm2_env"]
    print(p["name"], p["pm_id"], e["status"], e["restart_time"], e.get("pm_cwd"))' | tee "$EV/pm2-before-$BOX.txt"
rec "R0_$BOX" "$(tr '\n' ';' < "$EV/pm2-before-$BOX.txt")"
rec "N_CORP_$BOX" "$(grep -c '^crhs-corporate ' "$EV/pm2-before-$BOX.txt")"
rec "N_AFF_$BOX" "$(grep -c '^wavemax ' "$EV/pm2-before-$BOX.txt")"
```
  - Expected:
    - exactly 2 `crhs-corporate <id> online <n> /var/www/crhs-corporate` rows (`crhs-corporate/ecosystem.config.js` `instances: 2`);
    - ≥ 1 `wavemax <id> online <n> /var/www/wavemax/wavemax-affiliate-program` rows (affiliate `ecosystem.config.js` `instances: 'max'`).
  - **STOP** on any other `pm_cwd`. Task 74's absolute `LOG_DIR` values are `logs` resolved against these two directories — that is what makes the replacement behaviour-neutral.

- [ ] **Step 2: Keys that pm2 itself holds in each app's saved environment (names only, never values).**
  - Why this matters:
    - `pm2 reload --update-env` MERGES the invoking shell's variables into pm2's saved environment and never removes a key.
    - dotenv (`crhs-corporate/server.js:15`) never overrides a variable already present in `process.env`.
    - So a key listed here would survive Task 74's `.env` edit — `CORS_ORIGIN` above all (finding F-1).
    - The affiliate's pm2 name comes from `process.env.PM2_APP_NAME` (affiliate `ecosystem.config.js`), which means pm2 was started from a shell with exported variables. This step decides whether that shell also exported `.env`.
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 jlist' | python3 -c 'import sys,json
K = ["CORS_ORIGIN","CORPORATE_SITE_URL","FRONTEND_URL","BASE_URL","LOG_DIR","LOG_SERVICE_NAME","EMAIL_PROVIDER","EMAIL_HOST","EMAIL_PORT","EMAIL_USER","EMAIL_PASS","EMAIL_FROM","EMAIL_TLS_SERVERNAME","EMAIL_TEMPLATE_ROOT","BRAND_DISPLAY_NAME","BRAND_LEGAL_NAME","PARTNER_INQUIRY_RECIPIENT","AFFILIATE_APPLICATION_RECIPIENT","STORE_IP_ADDRESS","ADDITIONAL_STORE_IPS","STORE_IP_RANGES","SESSION_COOKIE_NAME","RATE_LIMIT_COLLECTION_PREFIX"]
seen = {}
for p in json.load(sys.stdin):
    e = p["pm2_env"]; env = e.get("env") or {}
    seen.setdefault(p["name"], set()).update(k for k in K if k in e or k in env)
for n in sorted(seen):
    print(n, ",".join(sorted(seen[n])) or "NONE")' | tee "$EV/pm2env-before-$BOX.txt"
rec "PM2ENV_CORP_$BOX" "$(awk '$1=="crhs-corporate"{print $2}' "$EV/pm2env-before-$BOX.txt")"
rec "PM2ENV_AFF_$BOX" "$(awk '$1=="wavemax"{print $2}' "$EV/pm2env-before-$BOX.txt")"
```
  - Expected: `crhs-corporate NONE` and `wavemax NONE`.
  - Any other value is NOT a stop. Task 75 (and the rollback) then uses the recorded restart path for THAT app — `pm2 delete` + `pm2 start ecosystem.config.js` from a clean ssh shell — which is the only way to drop a saved key.

- [ ] **Step 3: Installed core, the web-core tree, the affiliate HEAD and working tree.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'for d in /var/www/crhs-corporate /var/www/wavemax/wavemax-affiliate-program; do cd "$d" && echo "$d $(node -p "require(\"@crhs/web-core/package.json\").version") $(node -p "Object.keys(require(\"@crhs/web-core\")).length") $(ls -ld node_modules/@crhs/web-core | cut -c1)"; done
node -p "require(\"/var/www/crhs-web-core/package.json\").version"
git -C /var/www/wavemax/wavemax-affiliate-program rev-parse HEAD
git -C /var/www/wavemax/wavemax-affiliate-program status --porcelain | wc -l
npm config get legacy-peer-deps
df -h --output=avail "$HOME" | tail -1' | tee "$EV/core-before-$BOX.txt"
rec "AFF_PORCELAIN_$BOX" "$(sed -n 5p "$EV/core-before-$BOX.txt")"
```
  - Expected, line by line:
    1. `/var/www/crhs-corporate 0.2.0 26 d`
    2. `/var/www/wavemax/wavemax-affiliate-program 0.2.0 26 d`
    3. `0.2.0`
    4. a SHA equal to `$AFF_SHA`
    5. a line count (recorded)
    6. `false` or `undefined`
    7. an available size of at least `1.0G`
  - **STOP** if line 4 ≠ `$AFF_SHA`: Task 72 proved `v0.2.1` compatibility only at that SHA.
  - **STOP** if either consumer is not `0.2.0 26 d`: the box is not at the Plan 1 exit state.

- [ ] **Step 4: The `.env` premises that Task 74's edit relies on (non-secret values; secrets as presence counts only).**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'C=/var/www/crhs-corporate/.env; A=/var/www/wavemax/wavemax-affiliate-program/.env
echo "== corporate"; grep -E "^(BASE_URL|EMAIL_PROVIDER|EMAIL_HOST|EMAIL_PORT|EMAIL_USER|EMAIL_FROM|EMAIL_TLS_SERVERNAME|EMAIL_TEMPLATE_ROOT|LOG_DIR|LOG_SERVICE_NAME|NODE_ENV|PORT|STORE_IP_ADDRESS|ADDITIONAL_STORE_IPS|STORE_IP_RANGES|CORS_ORIGIN|CORPORATE_SITE_URL|FRONTEND_URL|SESSION_COOKIE_NAME|RATE_LIMIT_COLLECTION_PREFIX|BRAND_DISPLAY_NAME|BRAND_LEGAL_NAME|PARTNER_INQUIRY_RECIPIENT|AFFILIATE_APPLICATION_RECIPIENT|MEDIATOR_GATE_ENABLED)=" "$C" | sort
echo "corporate EMAIL_PASS lines: $(grep -c "^EMAIL_PASS=." "$C")"
echo "== portal"; grep -E "^(EMAIL_HOST|EMAIL_PORT|EMAIL_USER|EMAIL_FROM|EMAIL_TLS_SERVERNAME|LOG_DIR|LOG_SERVICE_NAME|STORE_IP_ADDRESS|ADDITIONAL_STORE_IPS|STORE_IP_RANGES|CORS_ORIGIN|BASE_URL)=" "$A" | sort
echo "portal EMAIL_PASS lines: $(grep -c "^EMAIL_PASS=." "$A")"
for k in MONGODB_URI SESSION_SECRET JWT_SECRET ENCRYPTION_KEY; do [ "$(grep "^$k=" "$C" | sha256sum)" = "$(grep "^$k=" "$A" | sha256sum)" ] && echo "$k same" || echo "$k DIFFERENT"; done
test -r "$A" && test -w "$C" && test -w "$A" && echo ENV_RW_OK
stat -c "%U %a %n" "$C" "$A"' | tee "$EV/env-before-$BOX.txt"
rec "ENV_OWNER_$BOX" "$(grep -m1 '/var/www/crhs-corporate/.env$' "$EV/env-before-$BOX.txt" | cut -d' ' -f1)"
```
  - Expected corporate block — Global Constraint 7's live values, sorted:
    - `BASE_URL=https://rundberglaundry.com`
    - `CORPORATE_SITE_URL=https://www.wavemaxlaundry.com`
    - `CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000,https://wavemax.promo`
    - `EMAIL_FROM=no-reply@wavemax.promo`
    - `EMAIL_HOST=158.62.198.7`
    - `EMAIL_PORT=587`
    - `EMAIL_PROVIDER=smtp`
    - `EMAIL_USER=no-reply@wavemax.promo`
    - `LOG_DIR=logs`
    - `MEDIATOR_GATE_ENABLED=true`
    - `NODE_ENV=production`
    - `PORT=3001`
    - `STORE_IP_ADDRESS=72.190.1.227`
    - `STORE_IP_RANGES=2603:8080:db00:21b9::/64`
    - then `corporate EMAIL_PASS lines: 1`
  - Expected portal block:
    - it contains `CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000,https://wavemax.promo`, `EMAIL_USER=no-reply@crhsent.com`, `LOG_DIR=logs`, `LOG_SERVICE_NAME=crhs-portal`, `STORE_IP_ADDRESS=72.190.1.227`;
    - then `portal EMAIL_PASS lines: 1`.
  - Then `MONGODB_URI same`, followed by the other three `same`/`DIFFERENT` lines (recorded; Q-8 decides them later).
  - Then `ENV_RW_OK`, and two `stat` lines.
  - **STOP** if: any corporate line differs from Global Constraint 7; the portal `EMAIL_USER`, `LOG_SERVICE_NAME`, `STORE_IP_ADDRESS` or `CORS_ORIGIN` line is missing or different; `MONGODB_URI DIFFERENT`; or `ENV_RW_OK` is absent (the edit would need `sudo` — re-plan with Rick).

- [ ] **Step 5: The portal's SMTP login authenticates as `no-reply@crhsent.com`.** This is read-only: AUTH succeeds, no message is sent. It is the precondition for copying the portal's `EMAIL_PASS` (R-1), and the password is never printed.
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/wavemax/wavemax-affiliate-program && node -e "const e=require(\"dotenv\").parse(require(\"fs\").readFileSync(\".env\"));const t=require(\"nodemailer\").createTransport({host:e.EMAIL_HOST,port:Number(e.EMAIL_PORT),secure:false,requireTLS:true,auth:{user:e.EMAIL_USER,pass:e.EMAIL_PASS},tls:{servername:e.EMAIL_TLS_SERVERNAME||\"mail.crhsent.com\"}});t.verify().then(()=>{console.log(\"SMTP_AUTH_OK\",e.EMAIL_USER);process.exit(0)},(err)=>{console.log(\"SMTP_AUTH_FAIL\",err.code||\"\",err.responseCode||\"\");process.exit(1)})"'
```
  - Expected: `SMTP_AUTH_OK no-reply@crhsent.com`. (`nodemailer` `^8.0.7` is an affiliate dependency; the servername must be `mail.crhsent.com` because the host is a bare IP.)
  - **STOP** on `SMTP_AUTH_FAIL`: copying that password would recreate the 2026-08-24 `553 5.7.1` outage.

- [ ] **Step 6: HTTP baseline — crhsent.com fingerprint, gate codes, the forged-header control (F-9), the CORS control (F-1), `/health/origin`.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'B=http://127.0.0.1:3001
curl -s -H "Host: crhsent.com" $B/ | sed -E "s/nonce-[A-Za-z0-9+\/=_-]+/nonce-N/g; s/nonce=\"[^\"]*\"/nonce=\"N\"/g; s/content=\"[A-Za-z0-9+\/=_-]{16,}\"/content=\"N\"/g" | md5sum | cut -d" " -f1
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: crhsent.com" $B/wavemax/
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: crhsent.com" $B/services
echo "$(curl -s -o /dev/null -w "%{http_code}" -H "Host: crhsent.com" -H "X-Forwarded-Host: rundberglaundry.com" $B/wavemax/) $(curl -s -o /dev/null -w "%{http_code}" -H "Host: crhsent.com" -H "X-Forwarded-Host: rundberglaundry.com" $B/README.md)"
echo "$(curl -s -D - -o /dev/null -H "Host: crhsent.com" -H "Origin: http://localhost:3000" $B/ | grep -ci "^access-control-allow-origin:") $(curl -s -D - -o /dev/null -H "Host: portal.atxwashdryfold.com" -H "Origin: http://localhost:3000" http://127.0.0.1:3000/api/csrf-token | grep -ci "^access-control-allow-origin:")"
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health/origin' | tee "$EV/http-before-$BOX.txt"
rec "CRHSENT_MD5_$BOX" "$(sed -n 1p "$EV/http-before-$BOX.txt")"
rec "CRHSENT_WAVEMAX_CODE_$BOX" "$(sed -n 2p "$EV/http-before-$BOX.txt")"
rec "XFH_BEFORE_$BOX" "$(sed -n 4p "$EV/http-before-$BOX.txt")"
rec "CORS_BEFORE_$BOX" "$(sed -n 5p "$EV/http-before-$BOX.txt")"
```
  - Expected:
    1. a 32-hex md5 (recorded).
    2. `200` — the mediator prompt: `MEDIATOR_GATE_ENABLED=true` makes `/wavemax` exempt from accessGate (`accessGate.js` `isExempt`), and this request carries no `wm_med_unlock` cookie.
    3. `401` — the access gate is enforcing (Plan 1 exit evidence).
    4. `404 404` — today all three host checks derive the host from the same forged header and agree (finding F-9).
    5. `1 1` — the F-1 positive control: this probe CAN see the misconfiguration, so the `0`s required later are meaningful.
    6. `200`.

- [ ] **Step 7: Database baseline (read-only).**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate && node -e "require(\"dotenv\").config();const db=require(\"./server/db\");const m=require(\"mongoose\");db.connect().then(async()=>{const d=m.connection.db;const n=(await d.listCollections().toArray()).map(c=>c.name);console.log(\"corp:\"+(n.filter(x=>x.startsWith(\"ratelimit_corp_\")).sort().join(\",\")||\"<none>\"));console.log(\"sessions:\"+n.filter(x=>/^sessions/.test(x)).sort().join(\",\"));console.log(\"sessions_corporate_count:\"+await d.collection(\"sessions_corporate\").countDocuments({}));process.exit(0)}).catch(e=>{console.log(\"DB_ERR \"+e.message);process.exit(1)})"' | tee "$EV/db-before-$BOX.txt"
rec "RL_CORP_BEFORE_$BOX" "$(sed -n 1p "$EV/db-before-$BOX.txt")"
```
  - Expected on the oci1 pass: `corp:<none>`, `sessions:sessions,sessions_corporate`, `sessions_corporate_count:0`.
  - On the oci2 pass, the first and third lines reflect oci1's traffic; record them as printed.

- [ ] **Step 8: Log baseline — the service tag each app writes today.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'for f in /var/www/crhs-corporate/logs/combined.log /var/www/wavemax/wavemax-affiliate-program/logs/combined.log; do tail -n 1 "$f" | python3 -c "import sys,json;print(json.loads(sys.stdin.read()).get(\"service\"))"; done' | tee "$EV/log-before-$BOX.txt"
```
  - Expected: `wavemax-affiliate` (corporate — `LOG_SERVICE_NAME` is unset; finding F-4), then `crhs-portal`.

---

### Task 74: [per box] **HUMAN-CONFIRM** — snapshot, `.env` backups, and both apps' `.env` edits

**Files:** box only.
- Creates `~/deploy-snapshots/crhs-corporate-<TS>.tgz` and `~/deploy-snapshots/crhs-web-core-<TS>.tgz`.
- Creates `/var/www/crhs-corporate-env-backups/.env.<TS>` and `/var/www/wavemax/env-backups/.env.<TS>`.
- Modifies `/var/www/crhs-corporate/.env` and `/var/www/wavemax/wavemax-affiliate-program/.env`.

**Interfaces:**
- Consumes:
  - Task 73's recorded premises for this box (they must be PASS);
  - Global Constraint 6 (target) against Global Constraint 7 (live);
  - R-2; R-5.
- Produces:
  - `TS_<box>`, `ENVKEYS_CORP_<box>` (a name→short-hash listing file, used by Task 81).
  - A corporate `.env` holding exactly the Global Constraint 6 keys: no `CORS_ORIGIN`, no `CORPORATE_SITE_URL`, no `FRONTEND_URL`; `EMAIL_PASS` copied box-locally from the portal `.env`.
  - A portal `.env` with `CORS_ORIGIN=https://portal.atxwashdryfold.com`, `PARTNER_INQUIRY_RECIPIENT=pickups@atxwashdryfold.com` and the absolute `LOG_DIR`.
- Keys and sources (the P0 Task 18 and A69 Task 60 lists merged, adjusted by R-2):

| Key | Corporate action | Value |
|---|---|---|
| `LOG_DIR` | REPLACE (live `logs`) | `/var/www/crhs-corporate/logs` |
| `LOG_SERVICE_NAME` | add — before any reload (R-5) | `crhs-corporate` |
| `CORS_ORIGIN` | DELETE (R-2, F-1) | — |
| `CORPORATE_SITE_URL` | DELETE (F-2) | — |
| `FRONTEND_URL` | delete if present (§5.11) | — |
| `BASE_URL` | REPLACE (live `https://rundberglaundry.com`) | `https://atxwashdryfold.com` |
| `EMAIL_PROVIDER` / `EMAIL_HOST` / `EMAIL_PORT` | re-written, same values | `smtp` / `158.62.198.7` / `587` |
| `EMAIL_USER`, `EMAIL_FROM` | REPLACE (live `no-reply@wavemax.promo`) | `no-reply@crhsent.com` |
| `EMAIL_PASS` | REPLACE, copied box-locally from the portal `.env` | (never printed) |
| `EMAIL_TLS_SERVERNAME` | add | `mail.crhsent.com` |
| `EMAIL_TEMPLATE_ROOT` | add | `/var/www/crhs-corporate/server/templates/emails` |
| `BRAND_DISPLAY_NAME` | add, quoted (contains a space) | `"WaveMAX Austin"` |
| `BRAND_LEGAL_NAME` | add, quoted | `"CRHS Enterprises, LLC"` |
| `PARTNER_INQUIRY_RECIPIENT` | add | `pickups@atxwashdryfold.com` |
| `AFFILIATE_APPLICATION_RECIPIENT` | add | `admin@crhsent.com` |
| `SESSION_COOKIE_NAME` | add (D14b) | `crhsent.sid` |
| `RATE_LIMIT_COLLECTION_PREFIX` | add | `ratelimit_corp_` |
| `STORE_IP_ADDRESS` / `ADDITIONAL_STORE_IPS` / `STORE_IP_RANGES` | copied byte-for-byte from the portal `.env` (`ADDITIONAL_STORE_IPS=` when the portal has none) | portal values |
| portal `CORS_ORIGIN` | REPLACE — never delete or empty (`server.js:293-295` falls back to `['http://localhost:3000']`) | `https://portal.atxwashdryfold.com` |
| portal `LOG_DIR` | REPLACE (live `logs`) | `/var/www/wavemax/wavemax-affiliate-program/logs` |
| portal `PARTNER_INQUIRY_RECIPIENT` | add (unset on both boxes, read 2026-09-13) | `pickups@atxwashdryfold.com` |

**Rollback (exact; values expand on the workstation).** Run this only while Task 75 has NOT yet started on this box. Once Task 75 has started, run Task 84 instead.
```bash
BOX=oci1; IP=161.153.71.201        # the box being rolled back
EV=/var/www/wavemax/cutover-logs; REC=$EV/phase0a-record.env; set -a; . "$REC"; set +a
V=TS_$BOX; TS=${!V}; test -n "$TS" && echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
cat /var/www/crhs-corporate-env-backups/.env.$TS > /var/www/crhs-corporate/.env
cat /var/www/wavemax/env-backups/.env.$TS > /var/www/wavemax/wavemax-affiliate-program/.env
grep -c '^CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000,https://wavemax.promo\$' /var/www/crhs-corporate/.env /var/www/wavemax/wavemax-affiliate-program/.env"
```
- Rollback expected: `TS=<value>`, then `/var/www/crhs-corporate/.env:1` and `/var/www/wavemax/wavemax-affiliate-program/.env:1`.
- No reload is needed: both apps read `.env` only at boot.

**Window rule.** Start Task 75 immediately after Step 5 of this task. A worker that crash-restarts in between would boot the OLD corporate code with the NEW `.env`. Its old `"WaveMAX" <admin@rundberglaundry.com>` gate From would then send under the `no-reply@crhsent.com` login and be rejected — the R-24 pairing.

- [ ] **Step 0: Set the box and load the record.**
```bash
BOX=oci1; IP=161.153.71.201        # Pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/phase0a-record.env
set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
V=PM2ENV_CORP_$BOX; echo "$BOX premises recorded: PM2ENV_CORP=${!V}"
```
  - Expected: the line printed with a non-empty value (`NONE` or a key list). An empty value means Task 73 did not complete on this box — STOP.

- [ ] **Step 1 (HUMAN-CONFIRM): Ask Rick.** Say exactly this:
  > Phase 0a on `<BOX>`: snapshot both trees, back up both `.env` files, then edit them. Corporate switches its SMTP identity to `no-reply@crhsent.com`, drops `CORS_ORIGIN` and `CORPORATE_SITE_URL`, and renames its session cookie to `__Host-crhsent.sid`. The rename logs nobody out: corporate has 0 `req.session` references, accessGate unlocks by IP and the mediator gate by `wm_med_unlock`. The portal's `CORS_ORIGIN` becomes `https://portal.atxwashdryfold.com`. Proceed?

  Continue only on an explicit yes.

- [ ] **Step 2 (HUMAN-CONFIRM): Snapshots and `.env` backups.** Nothing existing is modified.
```bash
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y%m%dT%H%M%SZ'); rec "TS_$BOX" "$TS"; echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
mkdir -p ~/deploy-snapshots && chmod 700 ~/deploy-snapshots
tar -C /var/www -czf ~/deploy-snapshots/crhs-corporate-$TS.tgz --exclude=crhs-corporate/node_modules --exclude=crhs-corporate/.git --exclude=crhs-corporate/logs crhs-corporate
tar -C /var/www -czf ~/deploy-snapshots/crhs-web-core-$TS.tgz --exclude=crhs-web-core/node_modules --exclude=crhs-web-core/.git --exclude=crhs-web-core/logs --exclude=crhs-web-core/coverage crhs-web-core
chmod 600 ~/deploy-snapshots/crhs-corporate-$TS.tgz ~/deploy-snapshots/crhs-web-core-$TS.tgz
test -d /var/www/crhs-corporate-env-backups || sudo install -d -o \$(id -un) -g \$(id -gn) -m 700 /var/www/crhs-corporate-env-backups
test -d /var/www/wavemax/env-backups || sudo install -d -o \$(id -un) -g \$(id -gn) -m 700 /var/www/wavemax/env-backups
cp -p /var/www/crhs-corporate/.env /var/www/crhs-corporate-env-backups/.env.$TS
cp -p /var/www/wavemax/wavemax-affiliate-program/.env /var/www/wavemax/env-backups/.env.$TS
tar -tzf ~/deploy-snapshots/crhs-corporate-$TS.tgz | grep -c '^crhs-corporate/server.js\$'
tar -tzf ~/deploy-snapshots/crhs-web-core-$TS.tgz | grep -c '^crhs-web-core/package.json\$'
cmp /var/www/crhs-corporate/.env /var/www/crhs-corporate-env-backups/.env.$TS && cmp /var/www/wavemax/wavemax-affiliate-program/.env /var/www/wavemax/env-backups/.env.$TS && echo BACKUPS_IDENTICAL"
```
  - Expected: `TS=<YYYYMMDDTHHMMSSZ>`, then `1`, `1`, `BACKUPS_IDENTICAL`.
  - Rollback for this step: none needed — it only adds files.

- [ ] **Step 3 (HUMAN-CONFIRM): The corporate `.env` edit.**
  - All preconditions are asserted first; `set -e` aborts before anything is written if one fails.
  - The file is rewritten through a temp file and `cat >`, which keeps its inode, owner and mode.
  - `EMAIL_PASS` moves portal → corporate on the box and never reaches the terminal or the workstation.
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'set -e
C=/var/www/crhs-corporate/.env; A=/var/www/wavemax/wavemax-affiliate-program/.env
test "$(grep -c "^EMAIL_USER=no-reply@crhsent.com$" "$A")" = 1
test "$(grep -c "^EMAIL_PASS=." "$A")" = 1
test "$(grep -c "^STORE_IP_ADDRESS=72.190.1.227$" "$A")" = 1
test "$(grep -c "^LOG_DIR=logs$" "$C")" = 1
T=$(mktemp); trap "rm -f $T" EXIT
grep -vE "^(LOG_DIR|LOG_SERVICE_NAME|CORS_ORIGIN|CORPORATE_SITE_URL|FRONTEND_URL|BASE_URL|EMAIL_PROVIDER|EMAIL_HOST|EMAIL_PORT|EMAIL_USER|EMAIL_PASS|EMAIL_FROM|EMAIL_TLS_SERVERNAME|EMAIL_TEMPLATE_ROOT|BRAND_DISPLAY_NAME|BRAND_LEGAL_NAME|PARTNER_INQUIRY_RECIPIENT|AFFILIATE_APPLICATION_RECIPIENT|STORE_IP_ADDRESS|ADDITIONAL_STORE_IPS|STORE_IP_RANGES|SESSION_COOKIE_NAME|RATE_LIMIT_COLLECTION_PREFIX)=" "$C" > "$T"
cat >> "$T" <<EOF
# --- Plan 2 Phase 0a: crhs-corporate as the multi-host content app ---
BASE_URL=https://atxwashdryfold.com
BRAND_DISPLAY_NAME="WaveMAX Austin"
BRAND_LEGAL_NAME="CRHS Enterprises, LLC"
EMAIL_PROVIDER=smtp
EMAIL_HOST=158.62.198.7
EMAIL_PORT=587
EMAIL_USER=no-reply@crhsent.com
EMAIL_FROM=no-reply@crhsent.com
EMAIL_TLS_SERVERNAME=mail.crhsent.com
EMAIL_TEMPLATE_ROOT=/var/www/crhs-corporate/server/templates/emails
PARTNER_INQUIRY_RECIPIENT=pickups@atxwashdryfold.com
AFFILIATE_APPLICATION_RECIPIENT=admin@crhsent.com
LOG_SERVICE_NAME=crhs-corporate
LOG_DIR=/var/www/crhs-corporate/logs
SESSION_COOKIE_NAME=crhsent.sid
RATE_LIMIT_COLLECTION_PREFIX=ratelimit_corp_
EOF
grep -E "^(STORE_IP_ADDRESS|ADDITIONAL_STORE_IPS|STORE_IP_RANGES)=" "$A" >> "$T"
grep -q "^ADDITIONAL_STORE_IPS=" "$T" || echo "ADDITIONAL_STORE_IPS=" >> "$T"
grep "^EMAIL_PASS=" "$A" >> "$T"
cat "$T" > "$C"
echo CORP_ENV_WRITTEN'
```
  - Expected: `CORP_ENV_WRITTEN`.
  - On any other output, nothing was written: the `set -e` preconditions run before `cat "$T" > "$C"`. The four `test` lines are the premises recorded in `/var/www/wavemax/cutover-logs/env-before-<box>.txt`. Compare them, then STOP and ask Rick.

- [ ] **Step 4: Verify the corporate `.env` (read-only).**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate; C=.env
grep -cxE "BASE_URL=https://atxwashdryfold.com|BRAND_DISPLAY_NAME=\"WaveMAX Austin\"|BRAND_LEGAL_NAME=\"CRHS Enterprises, LLC\"|EMAIL_PROVIDER=smtp|EMAIL_HOST=158\.62\.198\.7|EMAIL_PORT=587|EMAIL_USER=no-reply@crhsent\.com|EMAIL_FROM=no-reply@crhsent\.com|EMAIL_TLS_SERVERNAME=mail\.crhsent\.com|EMAIL_TEMPLATE_ROOT=/var/www/crhs-corporate/server/templates/emails|PARTNER_INQUIRY_RECIPIENT=pickups@atxwashdryfold\.com|AFFILIATE_APPLICATION_RECIPIENT=admin@crhsent\.com|LOG_SERVICE_NAME=crhs-corporate|LOG_DIR=/var/www/crhs-corporate/logs|SESSION_COOKIE_NAME=crhsent\.sid|RATE_LIMIT_COLLECTION_PREFIX=ratelimit_corp_|STORE_IP_ADDRESS=72\.190\.1\.227" $C
grep -cE "^(CORS_ORIGIN|CORPORATE_SITE_URL|FRONTEND_URL)=|^LOG_DIR=logs$|^EMAIL_(USER|FROM)=no-reply@wavemax\.promo$|^BASE_URL=https://rundberglaundry\.com$" $C
echo "$(grep -c "^EMAIL_PASS=." $C) $(grep -c "^ADDITIONAL_STORE_IPS=" $C) $(grep -c "^STORE_IP_RANGES=" $C)"
grep -vE "^\s*(#|$)" $C | cut -d= -f1 | sort | uniq -d | wc -l
node -e "const e=require(\"dotenv\").parse(require(\"fs\").readFileSync(\".env\"));console.log(JSON.stringify([e.BRAND_DISPLAY_NAME,e.BRAND_LEGAL_NAME,e.EMAIL_USER===e.EMAIL_FROM,e.CORS_ORIGIN===undefined]))"
grep -vE "^\s*(#|$)" $C | grep -v "^RUN_BACKGROUND_JOBS=" | while IFS= read -r l; do printf "%s %s\n" "${l%%=*}" "$(printf "%s" "$l" | sha256sum | cut -c1-12)"; done | sort' > "$EV/envcheck-corp-$BOX.txt"; head -5 "$EV/envcheck-corp-$BOX.txt"
tail -n +6 "$EV/envcheck-corp-$BOX.txt" > "$EV/envkeys-corp-$BOX.txt"; rec "ENVKEYS_CORP_$BOX" "$EV/envkeys-corp-$BOX.txt"
```
  - Expected, five lines: `17`, `0`, `1 1 1`, `0`, `["WaveMAX Austin","CRHS Enterprises, LLC",true,true]`.
  - The key-name/short-hash listing goes to `envkeys-corp-<box>.txt` (compared across boxes in Task 81). It contains no values.
  - On any other output: run this task's Rollback, then STOP.

- [ ] **Step 5 (HUMAN-CONFIRM): The portal `.env` edit (R-2) and its verification.**
```bash
grep -qx 'P13_RESULT=PASS' /var/www/wavemax/cutover-logs/phase0a-record.env && echo P13_OK
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'set -e
A=/var/www/wavemax/wavemax-affiliate-program/.env
test "$(grep -c "^CORS_ORIGIN=." "$A")" = 1
test "$(grep -c "^PARTNER_INQUIRY_RECIPIENT=" "$A")" = 0
test "$(grep -c "^LOG_DIR=logs$" "$A")" = 1
test "$(grep -c "^LOG_SERVICE_NAME=crhs-portal$" "$A")" = 1
T=$(mktemp); trap "rm -f $T" EXIT
sed -e "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://portal.atxwashdryfold.com|" -e "s|^LOG_DIR=logs$|LOG_DIR=/var/www/wavemax/wavemax-affiliate-program/logs|" "$A" > "$T"
echo "PARTNER_INQUIRY_RECIPIENT=pickups@atxwashdryfold.com" >> "$T"
cat "$T" > "$A"
grep -cxE "CORS_ORIGIN=https://portal\.atxwashdryfold\.com|LOG_DIR=/var/www/wavemax/wavemax-affiliate-program/logs|LOG_SERVICE_NAME=crhs-portal|PARTNER_INQUIRY_RECIPIENT=pickups@atxwashdryfold\.com" "$A"
grep -cE "^CORS_ORIGIN=$|wavemax\.promo" "$A" || true'
```
  - Expected: `P13_OK`, then `4`, then `0`. **STOP** before the ssh if `P13_OK` is missing: Task 72 Step 10 has not proven the `pickups@atxwashdryfold.com` alias delivers.
  - `LOG_SERVICE_NAME=crhs-portal` is already set on both boxes (R-5), so it is asserted, not written.
  - `PARTNER_INQUIRY_RECIPIENT` (R-16): unset in the portal `.env` on both boxes today, so portal partner inquiries go to the code default `pickups@rundberglaundry.com` (`server/services/partnerInquiryService.js:6`). Writing the corporate intake recipient here means a lead reaches the same mailbox whichever app serves the form between this deploy and the Plan 3 nginx flip. Task 75's `pm2 reload wavemax --update-env` picks it up.
  - On any other output: run this task's Rollback, then STOP.

---

### Task 75: [per box] **HUMAN-CONFIRM** — deliver `v0.2.1` + `CORP_SHA`, reinstall both consumers, gate, boot probes, reload both apps

**Files:** box only — `/var/www/crhs-web-core/`, `/var/www/crhs-corporate/` (code), `/var/www/crhs-corporate/node_modules/@crhs/web-core`, `/var/www/wavemax/wavemax-affiliate-program/node_modules/@crhs/web-core`. Workstation export dir: `/tmp/phase0a-export-<box>`.

**Interfaces:**
- Consumes:
  - `WC_TAG` (= `v0.2.1`, the tag P0 slice Task 8 cuts; Task 72 Step 1 proves it exact and clean), `CORP_SHA` (corporate `main` carrying A1–A9 — A15 Tasks 20–42 and A69 Tasks 45–59 — recorded by Task 72 Step 3; A69 Task 62 (B-3) included), `CORP_BASE_SHA`, `AFF_SHA`;
  - `PM2ENV_CORP_<box>`, `PM2ENV_AFF_<box>`, `N_CORP_<box>`, `N_AFF_<box>`, `AFF_PORCELAIN_<box>`;
  - Task 74 completed on this box in the same window.
- Produces:
  - `RELOAD_TS_AFF_<box>` and `RELOAD_TS_<box>` (box clock, UTC `YYYY-MM-DDTHH:MM:SS`);
  - `AFF_LOCK_DIRTY_<box>` (`yes`|`no`);
  - both apps running `@crhs/web-core@0.2.1`; corporate on `CORP_SHA` with the Task 74 `.env`.
- Order is R-1 exactly: web-core rsync → corporate rsync (then `.env` survived) → `rm -rf` + install in BOTH consumers → pre-reload gate (Global Constraint 16) → boot probes → `pm2 reload` affiliate, then corporate → verification.
- Blast radius while broken (§9.7): crhsent.com AND the portal on this box. The marketing hosts are still served by `:3000`. The CF LB monitor (`/health/origin`) fails this box over to the other.
- **Window rule.** Run Steps 3–5 back to back. Between Step 4 (corporate rsync) and Step 5 (corporate reinstall), a crash-restarted corporate worker would load the new code against the old core.

**Rollback (exact; values expand on the workstation; order: trees + `.env` → reinstall → gate → reload → verify).**
```bash
BOX=oci1; IP=161.153.71.201        # the box being rolled back
EV=/var/www/wavemax/cutover-logs; REC=$EV/phase0a-record.env; set -a; . "$REC"; set +a
V=TS_$BOX; TS=${!V}; V=PM2ENV_AFF_$BOX; PM2ENV_AFF=${!V}; V=PM2ENV_CORP_$BOX; PM2ENV_CORP=${!V}
test -n "$TS" && echo "TS=$TS PM2ENV_AFF=$PM2ENV_AFF PM2ENV_CORP=$PM2ENV_CORP"
# 1. restore the web-core and corporate trees and both .env files from the pre-deploy snapshot
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
R=\$(mktemp -d)
tar -C \"\$R\" -xzf ~/deploy-snapshots/crhs-web-core-$TS.tgz
tar -C \"\$R\" -xzf ~/deploy-snapshots/crhs-corporate-$TS.tgz
rsync -a --delete --exclude node_modules --exclude .git --exclude logs --exclude coverage \"\$R/crhs-web-core/\" /var/www/crhs-web-core/
rsync -a --delete --exclude node_modules --exclude .git --exclude logs --exclude .env \"\$R/crhs-corporate/\" /var/www/crhs-corporate/
rm -rf \"\$R\"
cat /var/www/crhs-corporate-env-backups/.env.$TS > /var/www/crhs-corporate/.env
cat /var/www/wavemax/env-backups/.env.$TS > /var/www/wavemax/wavemax-affiliate-program/.env
node -p 'require(\"/var/www/crhs-web-core/package.json\").version'"
# 2. reinstall both consumers against the restored tree — the rm -rf is mandatory
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/wavemax/wavemax-affiliate-program && rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund 2>&1 | tail -2'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate && rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund 2>&1 | tail -2'
# 3. gate + boot probes before any reload
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'for d in /var/www/wavemax/wavemax-affiliate-program /var/www/crhs-corporate; do cd "$d" && echo "$d $(node -p "require(\"@crhs/web-core/package.json\").version") $(node -p "Object.keys(require(\"@crhs/web-core\")).length") $(node -p "Object.keys(require(\"@crhs/web-core\").csrf).includes(\"createCsrf\")") $(node -p "require.resolve(\"mongoose\",{paths:[require.resolve(\"@crhs/web-core\")]})===require.resolve(\"mongoose\")")" && node -e "try{require(\"./server.js\");console.log(\"BOOT_OK\");process.exit(0)}catch(e){console.log(e.message);process.exit(1)}"; done'
# 4. reload in the recorded mode (NONE = merge-safe reload; a key list = clean restart)
if [ "$PM2ENV_AFF" = NONE ]; then ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 reload wavemax --update-env'; else ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/wavemax/wavemax-affiliate-program && pm2 delete wavemax && PM2_APP_NAME=wavemax pm2 start ecosystem.config.js && pm2 save'; fi
sleep 10
if [ "$PM2ENV_CORP" = NONE ]; then ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 reload crhs-corporate --update-env'; else ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate && pm2 delete crhs-corporate && pm2 start ecosystem.config.js && pm2 save'; fi
sleep 15
# 5. verify the Plan 1 exit state
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'curl -s -o /dev/null -w "portal-health %{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health; curl -s -o /dev/null -w "health-origin %{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health/origin; curl -s -o /dev/null -w "crhsent %{http_code}\n" -H "Host: crhsent.com" http://127.0.0.1:3001/; curl -s -o /dev/null -w "services %{http_code}\n" -H "Host: crhsent.com" http://127.0.0.1:3001/services; curl -s -D - -o /dev/null -H "Host: crhsent.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3001/ | grep -io "^set-cookie: __Host-[a-z.]*sid"'
for h in portal.atxwashdryfold.com crhsent.com rundberglaundry.com runberglaundry.com atxwashdryfold.com atxwashateria.com; do printf '%s %s\n' "$h" "$(curl -s -o /dev/null -w '%{http_code}' "https://$h/?lh=$(date +%s)")"; done | tr '\n' ';'; echo; echo "$CF_CODES_BEFORE"
```
- Rollback expected, in order:
  1. `TS=… PM2ENV_AFF=… PM2ENV_CORP=…`
  2. `0.2.0`
  3. two npm summaries with no `npm ERR!`
  4. `/var/www/wavemax/wavemax-affiliate-program 0.2.0 26 true true`, `BOOT_OK`, `/var/www/crhs-corporate 0.2.0 26 true true`, `BOOT_OK`
  5. `portal-health 200`, `health-origin 200`, `crhsent 200`, `services 401`, `Set-Cookie: __Host-wavemax.sid`
  6. two identical `…;` code lines
- Rollback notes:
  - The rollback is a second cookie-base change; like the first, it logs nobody out (R-10).
  - `sessions_corporate` and every `ratelimit_corp_*` collection stay in place — never `drop()` on ADB.
  - The `no-reply@wavemax.promo` login and the old gate From come back together; they only work as a pair.

- [ ] **Step 0: Set the box, load the record, and confirm Task 74 finished on this box.**
```bash
BOX=oci1; IP=161.153.71.201        # Pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/phase0a-record.env
set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
V=TS_$BOX; TS=${!V}; V=PM2ENV_AFF_$BOX; PM2ENV_AFF=${!V}; V=PM2ENV_CORP_$BOX; PM2ENV_CORP=${!V}; V=AFF_PORCELAIN_$BOX; AFF_PORCELAIN=${!V}
echo "TS=$TS PM2ENV_AFF=$PM2ENV_AFF PM2ENV_CORP=$PM2ENV_CORP AFF_PORCELAIN=$AFF_PORCELAIN WC_TAG=$WC_TAG CORP_SHA=$CORP_SHA"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'grep -c "^LOG_SERVICE_NAME=crhs-corporate$" /var/www/crhs-corporate/.env'
```
  - Expected: every value non-empty, then `1` (R-5: the service name is written before `v0.2.1` is reloaded).

- [ ] **Step 1: Export the exact tag and commit on the workstation (never a dirty tree).**
```bash
W=/tmp/phase0a-export-$BOX; rm -rf "$W" && mkdir -p "$W/crhs-web-core" "$W/crhs-corporate"
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core archive "$WC_TAG" | tar -x -C "$W/crhs-web-core"
git -C /mnt/c/Users/rickh/GitHub/crhs-corporate archive "$CORP_SHA" | tar -x -C "$W/crhs-corporate"
node -p "require('$W/crhs-web-core/package.json').version"
test -f "$W/crhs-corporate/server/config/hosts.js" && test -d "$W/crhs-corporate/content/atxwashdryfold" && test ! -e "$W/crhs-corporate/.env" && echo CORP_EXPORT_OK
```
  - Expected: `0.2.1`, then `CORP_EXPORT_OK`.

- [ ] **Step 2: Dry run — which files would the corporate rsync delete.**
  - ⚠️ **Amended 2026-09-13 (S-3 hotfix):** the boxes' corporate tree is no longer `CORP_BASE_SHA=8133667`; it is `5766f41` + hotfix `01a354b` (adds `server/utils/canonicalPath.js`, `tests/canonicalPath.test.js`, `tests/mediatorPathBypass.integration.test.js`). Compute the expected-deletes list against `01a354b`'s tree, and confirm `server/utils/canonicalPath.js` is NOT in the delete list (Task 27b ships it on `main`).
  - Every deletion must be a file that A1–A9 removed between the Plan 1 exit tree (`CORP_BASE_SHA=8133667`) and `CORP_SHA`.
  - Anything else is box-only content: STOP and show it to Rick (it is preserved in the Task 74 snapshot).
```bash
rsync -azn --delete --itemize-changes --exclude node_modules --exclude .git --exclude logs --exclude coverage --exclude .env -e 'ssh -i ~/.ssh/oci_wavemax' "$W/crhs-corporate/" ubuntu@$IP:/var/www/crhs-corporate/ | awk '$1=="*deleting"{print $2}' | grep -v '/$' | sort > "$EV/rsync-corp-deletes-$BOX.txt"
comm -23 <(git -C /mnt/c/Users/rickh/GitHub/crhs-corporate ls-tree -r --name-only "$CORP_BASE_SHA" | sort) <(git -C /mnt/c/Users/rickh/GitHub/crhs-corporate ls-tree -r --name-only "$CORP_SHA" | sort) > "$EV/expected-corp-deletes.txt"
wc -l < "$EV/rsync-corp-deletes-$BOX.txt"; comm -23 "$EV/rsync-corp-deletes-$BOX.txt" "$EV/expected-corp-deletes.txt"; echo "UNEXPECTED_DELETES_END"
```
  - Expected: a count, then immediately `UNEXPECTED_DELETES_END` with nothing printed between them.

- [ ] **Step 3 (HUMAN-CONFIRM): rsync web-core `v0.2.1` to the box.**
```bash
rsync -az --delete --exclude node_modules --exclude .git --exclude logs --exclude coverage -e 'ssh -i ~/.ssh/oci_wavemax' "$W/crhs-web-core/" ubuntu@$IP:/var/www/crhs-web-core/; echo "rsync-exit=$?"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'node -p "require(\"/var/www/crhs-web-core/package.json\").version"; test ! -e /var/www/crhs-web-core/src/config/brand.js && echo brand.js-absent'
```
  - Expected: `rsync-exit=0`, `0.2.1`, `brand.js-absent` (B3g deleted `src/config/brand.js`).
  - **STOP → Task 84** on `rsync-exit=23` (permission denied). A `sudo rsync` would leave root-owned files that the `ubuntu` npm install cannot replace.

- [ ] **Step 4 (HUMAN-CONFIRM): rsync the corporate `CORP_SHA` tree, then confirm `.env` survived.**
```bash
rsync -az --delete --exclude node_modules --exclude .git --exclude logs --exclude coverage --exclude .env -e 'ssh -i ~/.ssh/oci_wavemax' "$W/crhs-corporate/" ubuntu@$IP:/var/www/crhs-corporate/; echo "rsync-exit=$?"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate && echo "$(grep -c "^EMAIL_USER=no-reply@crhsent.com$" .env) $(grep -c "^LOG_SERVICE_NAME=crhs-corporate$" .env) $(grep -c "^EMAIL_PASS=." .env)" && test -f server/config/hosts.js && test -f server/templates/emails/base-template.html && test -d content/atxwashdryfold && test ! -e tests/crhsent-parity.test.js && echo CORP_TREE_OK && grep -n "sessions_corporate" server.js && mkdir -p logs && stat -c "%U %n" logs'
```
  - Expected: `rsync-exit=0`; `1 1 1`; `CORP_TREE_OK`; at least one `server.js:<n>:` line containing `sessions_corporate` (the §9.1 P-10 source check); then `<owner> logs`, where the owner equals `ENV_OWNER_<box>` from Task 73 Step 4.
  - **STOP → Task 84** otherwise.

- [ ] **Step 5 (HUMAN-CONFIRM): Reinstall both consumers — `rm -rf` first (Global Constraint 16 c/d).** Two ssh invocations, never one `set -e` loop over both consumers (Plan 1).
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate && rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund 2>&1 | tail -3'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/wavemax/wavemax-affiliate-program && rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund 2>&1 | tail -3; git status --porcelain | wc -l; git status --porcelain -- package-lock.json'
```
  - Expected: two npm summaries with no `ERESOLVE` and no `npm ERR!`.
  - Then the affiliate porcelain count. It equals `$AFF_PORCELAIN`, or is one higher with ` M package-lock.json`.
  - Record it: `rec "AFF_LOCK_DIRTY_$BOX" "$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'git -C /var/www/wavemax/wavemax-affiliate-program status --porcelain -- package-lock.json | grep -q . && echo yes || echo no')"`. If `yes`, Plan 3's first `git pull --ff-only` on this box must run `git -C /var/www/wavemax/wavemax-affiliate-program checkout -- package-lock.json` first.

- [ ] **Step 6: Pre-reload gate, both consumers (Global Constraint 16 e).**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate && echo "corp $(node -p "require(\"@crhs/web-core/package.json\").version") $(node -p "Object.keys(require(\"@crhs/web-core\")).length") $(node -p "Object.keys(require(\"@crhs/web-core\").csrf).includes(\"createCsrf\")") $(node -p "require.resolve(\"mongoose\",{paths:[require.resolve(\"@crhs/web-core\")]})===require.resolve(\"mongoose\")") $(node -p "typeof require(\"@crhs/web-core\").email.validateMailConfig") $(ls -ld node_modules/@crhs/web-core | cut -c1)"'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/wavemax/wavemax-affiliate-program && echo "aff $(node -p "require(\"@crhs/web-core/package.json\").version") $(node -p "Object.keys(require(\"@crhs/web-core\")).length") $(node -p "Object.keys(require(\"@crhs/web-core\").csrf).includes(\"createCsrf\")") $(node -p "require.resolve(\"mongoose\",{paths:[require.resolve(\"@crhs/web-core\")]})===require.resolve(\"mongoose\")") $(ls -ld node_modules/@crhs/web-core | cut -c1)"'
```
  - Expected: `corp 0.2.1 26 true true function d`, then `aff 0.2.1 26 true true d`.
  - The two versions must match; a difference is the R-18 skew. **STOP → Task 84** on any other output.
  - Never `wc.SystemConfig.base` in the affiliate: its own `SystemConfig` model makes that throw `OverwriteModelError`.

- [ ] **Step 7: Identity, mail-config preflight, gate From, and boot probes — each ends in `process.exit(0)` (Global Constraint 16 f).**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate && node -e "require(\"dotenv\").config();const wc=require(\"@crhs/web-core\");const m=require(\"mongoose\");const AG=require(\"./server/models/AccessGate\");const MA=require(\"./server/models/MediatorAccess\");console.log(AG.base===wc.SystemConfig.base, MA.base===wc.SystemConfig.base, wc.SystemConfig.base===m);process.exit(0)" && node -e "require(\"dotenv\").config();require(\"./server/bootMail\").assertMailConfig();console.log(\"MAIL_CONFIG_OK\");process.exit(0)" && node -e "require(\"dotenv\").config();const g=require(\"./server/middleware/accessGate\");console.log(process.env.EMAIL_FROM_NAME===undefined, JSON.stringify(g.GATE_DISPLAY_NAME)+\" <\"+process.env.EMAIL_FROM+\">\");process.exit(0)" && node -e "try{require(\"./server.js\");console.log(\"BOOT_OK\");process.exit(0)}catch(e){console.log(e.message);process.exit(1)}"'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/wavemax/wavemax-affiliate-program && node -e "require(\"dotenv\").config();const m=require(\"mongoose\");const SC=require(\"./server/models/SystemConfig\");console.log(SC.base===m, require.resolve(\"mongoose\",{paths:[require.resolve(\"@crhs/web-core\")]})===require.resolve(\"mongoose\"), m.mongo.Collection===require(\"mongodb\").Collection, require(\"@crhs/web-core/package.json\").version);process.exit(0)" && node -e "try{require(\"./server.js\");console.log(\"BOOT_OK\");process.exit(0)}catch(e){console.log(e.message);process.exit(1)}"'
```
  - Expected corporate: `true true true` (§10.3 P2 + P3), `MAIL_CONFIG_OK`, `true "CRHS Enterprises" <no-reply@crhsent.com>` (no `EMAIL_FROM_NAME`, R-6; the From web-core composes from A69 Task 57's `GATE_DISPLAY_NAME` + `EMAIL_FROM`), `BOOT_OK`.
  - The corporate driver comparison `m.mongo.Collection===require("mongodb").Collection` is deliberately NOT asserted: corporate carries two `mongodb` copies by construction (connect-mongo's peer range vs mongoose's pinned driver — `crhs-corporate/tests/packageTopology.test.js:55-76`, whose driver test is `test.skip`), so it prints `false` on a correct install (measured on the local corporate checkout, 2026-09-13). The affiliate resolves one hoisted copy, so its check stays.
  - Expected affiliate: `true true true 0.2.1` (§10.3 P3, resolution-path form), `BOOT_OK`.
  - An `EADDRINUSE` means a probe lost its `process.exit(0)`; it is not a boot result.
  - **STOP → Task 84** on any other output.

- [ ] **Step 8 (HUMAN-CONFIRM): Reload the affiliate, in the mode Task 73 Step 2 recorded.**
```bash
RELOAD_TS_AFF=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y-%m-%dT%H:%M:%S'); rec "RELOAD_TS_AFF_$BOX" "$RELOAD_TS_AFF"
if [ "$PM2ENV_AFF" = NONE ]; then ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 reload wavemax --update-env'; else ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/wavemax/wavemax-affiliate-program && pm2 delete wavemax && PM2_APP_NAME=wavemax pm2 start ecosystem.config.js && pm2 save'; fi
sleep 10
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'curl -s -o /dev/null -w "%{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health; curl -s -o /dev/null -w "%{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/api/csrf-token'
```
  - Expected: `200`, then `200`.
  - The `pm2 delete`/`start` branch runs only when `PM2ENV_AFF` is a key list; it costs this box's portal about 10 s while the other box serves.
  - **STOP → Task 84** otherwise.

- [ ] **Step 9 (HUMAN-CONFIRM): Reload corporate, in the recorded mode.**
```bash
RELOAD_TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y-%m-%dT%H:%M:%S'); rec "RELOAD_TS_$BOX" "$RELOAD_TS"
if [ "$PM2ENV_CORP" = NONE ]; then ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 reload crhs-corporate --update-env'; else ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate && pm2 delete crhs-corporate && pm2 start ecosystem.config.js && pm2 save'; fi
sleep 15
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'curl -s -H "Host: crhsent.com" http://127.0.0.1:3001/health; echo; curl -s -o /dev/null -w "%{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health/origin'
```
  - Expected: `{"status":"ok"}`, then `200` (`/health/origin` answers 200 only when both apps on the box serve).
  - **STOP → Task 84** otherwise.

- [ ] **Step 10: pm2 no longer holds any `.env` key, and both apps are online.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 jlist' | python3 -c 'import sys,json
K = ["CORS_ORIGIN","CORPORATE_SITE_URL","FRONTEND_URL","BASE_URL","LOG_DIR","LOG_SERVICE_NAME","EMAIL_PROVIDER","EMAIL_HOST","EMAIL_PORT","EMAIL_USER","EMAIL_PASS","EMAIL_FROM","EMAIL_TLS_SERVERNAME","EMAIL_TEMPLATE_ROOT","BRAND_DISPLAY_NAME","BRAND_LEGAL_NAME","PARTNER_INQUIRY_RECIPIENT","AFFILIATE_APPLICATION_RECIPIENT","STORE_IP_ADDRESS","ADDITIONAL_STORE_IPS","STORE_IP_RANGES","SESSION_COOKIE_NAME","RATE_LIMIT_COLLECTION_PREFIX"]
seen = {}; status = {}
for p in json.load(sys.stdin):
    e = p["pm2_env"]; env = e.get("env") or {}
    seen.setdefault(p["name"], set()).update(k for k in K if k in e or k in env)
    status.setdefault(p["name"], set()).add(e["status"])
for n in sorted(seen):
    print(n, ",".join(sorted(seen[n])) or "NONE", ",".join(sorted(status[n])))'
```
  - Expected: `crhs-corporate NONE online` and `wavemax NONE online`.
  - **STOP → Task 84** otherwise: dotenv is not governing that app, so the new `.env` may not be in effect.

---

### Task 76: [per box] Boot verification from `$LOG_DIR/combined.log` (R-4), model identity (§10.3 P2/P3), restart counts at T

**Files:** none in any repo. Appends to the per-box S1 log `S1LOG_<box>`.

**Interfaces:**
- Consumes: `RELOAD_TS_<box>`, `RELOAD_TS_AFF_<box>`, `N_CORP_<box>`, `N_AFF_<box>`, `S1LOG_<box>`; `scripts/ops/cutover-gate.sh --attest` (Task 70).
- Produces: `R1_<box>` (the pm2 table at T, just after the reload), plus `MANUAL P2 PASS …` and `MANUAL P3 PASS …` lines in the S1 log.
- Log rules (Global Constraint 17, R-4):
  - Read only winston JSON lines, filtered to `timestamp` later than the reload.
  - Include `combined1.log`: `tailable` rotation moves older lines out of `combined.log`.
  - Never read `pm2 logs`. Never count `Access gate cache loaded`.

- [ ] **Step 0: Set the box and load the record.** Every later step of this task runs in this shell.
```bash
BOX=oci1; IP=161.153.71.201        # Pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/phase0a-record.env
set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
GATE=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/scripts/ops/cutover-gate.sh
V=RELOAD_TS_$BOX; RELOAD_TS=${!V}; V=RELOAD_TS_AFF_$BOX; RELOAD_TS_AFF=${!V}
V=N_CORP_$BOX; N_CORP=${!V}; V=N_AFF_$BOX; N_AFF=${!V}; V=S1LOG_$BOX; S1LOG=${!V}
echo "RELOAD_TS=$RELOAD_TS RELOAD_TS_AFF=$RELOAD_TS_AFF N_CORP=$N_CORP N_AFF=$N_AFF S1LOG=$S1LOG"
```
  - Expected: all five values non-empty.

- [ ] **Step 1: Corporate boot evidence since `RELOAD_TS`.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "python3 - '$RELOAD_TS' /var/www/crhs-corporate/logs/combined.log /var/www/crhs-corporate/logs/combined1.log <<'PY'
import json, os, sys
t0, paths = sys.argv[1], sys.argv[2:]
rows = []
for path in paths:
    if not os.path.exists(path):
        continue
    for line in open(path, encoding='utf-8', errors='replace'):
        try:
            r = json.loads(line)
        except ValueError:
            continue
        if str(r.get('timestamp', ''))[:19] > t0:
            rows.append(r)
m = [str(r.get('message', '')) for r in rows]
print('listening', m.count('crhs-corporate listening on 3001'))
print('seeded', sum(x.startswith('SystemConfig seeded; access_gate_enabled=') for x in m))
print('gate_load_failed', sum(x.startswith('Access gate cache load failed') for x in m))
print('boot_failed', sum(x.startswith('crhs-corporate boot failed') for x in m))
print('refusing', sum('refusing to start' in x for x in m))
print('services', sorted({str(r.get('service')) for r in rows}))
PY"
```
  - Expected:
    - `listening 2` (equals `N_CORP` — one boot line per new cluster worker)
    - `seeded 2`
    - `gate_load_failed 0`
    - `boot_failed 0`
    - `refusing 0`
    - `services ['crhs-corporate']` — R-4 and finding F-4; before this reload these lines carried `wavemax-affiliate`.
  - **STOP → Task 84** otherwise.

- [ ] **Step 2: Affiliate boot evidence since `RELOAD_TS_AFF`.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "python3 - '$RELOAD_TS_AFF' /var/www/wavemax/wavemax-affiliate-program/logs/combined.log /var/www/wavemax/wavemax-affiliate-program/logs/combined1.log <<'PY'
import json, os, sys
t0, paths = sys.argv[1], sys.argv[2:]
rows = []
for path in paths:
    if not os.path.exists(path):
        continue
    for line in open(path, encoding='utf-8', errors='replace'):
        try:
            r = json.loads(line)
        except ValueError:
            continue
        if str(r.get('timestamp', ''))[:19] > t0:
            rows.append(r)
blob = [json.dumps(r) for r in rows]
print('running', sum(str(r.get('message', '')) == 'Server running on port 3000 in production mode' for r in rows))
print('ora04036', sum('ORA-04036' in b for b in blob))
print('buffering', sum('buffering timed out' in b for b in blob))
print('services', sorted({str(r.get('service')) for r in rows}))
PY"
```
  - Expected: `running <N_AFF>`, `ora04036 0`, `buffering 0`, `services ['crhs-portal']`.
  - **STOP → Task 84** otherwise.

- [ ] **Step 3: The gate enforces, and both apps answer through the box's own origin check.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'curl -s -o /dev/null -w "services %{http_code}\n" -H "Host: crhsent.com" http://127.0.0.1:3001/services; curl -s -o /dev/null -w "health-origin %{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health/origin'
```
  - Expected: `services 401` — `/services` answers 401 only when the gate cache loaded with the gate ENABLED. Then `health-origin 200`.

- [ ] **Step 4: §10.3 P2 and P3 after the reload (read-only), then attest both.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate && node -e "require(\"dotenv\").config();const wc=require(\"@crhs/web-core\");const m=require(\"mongoose\");const AG=require(\"./server/models/AccessGate\");console.log(\"P2\",AG.base===wc.SystemConfig.base, wc.SystemConfig.base===m, require(\"@crhs/web-core/package.json\").version);process.exit(0)"; cd /var/www/wavemax/wavemax-affiliate-program && node -e "require(\"dotenv\").config();const m=require(\"mongoose\");const SC=require(\"./server/models/SystemConfig\");console.log(\"P3\",SC.base===m, require.resolve(\"mongoose\",{paths:[require.resolve(\"@crhs/web-core\")]})===require.resolve(\"mongoose\"), m.mongo.Collection===require(\"mongodb\").Collection, require(\"@crhs/web-core/package.json\").version);process.exit(0)"; cat .npmrc | grep -c "^install-links=true$"'
bash "$GATE" --attest P2 --by rick --evidence "$BOX AccessGate.base===SystemConfig.base===mongoose true true 0.2.1; seeded 2, gate_load_failed 0, /services 401" --log "$S1LOG"
bash "$GATE" --attest P3 --by rick --evidence "$BOX affiliate true true true 0.2.1 (resolution-path form); corporate identity true; .npmrc install-links=true; both dirs 0.2.1" --log "$S1LOG"
```
  - Expected: `P2 true true 0.2.1`, `P3 true true true 0.2.1`, `1`, then two silent `--attest` runs.
  - Then `tail -2 "$S1LOG"` shows `MANUAL P2 PASS rick <ts> …` and `MANUAL P3 PASS rick <ts> …`.

- [ ] **Step 5: Restart counts at T (§10.3 P1, part one).**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 jlist' | python3 -c 'import sys,json
for p in json.load(sys.stdin):
    e = p["pm2_env"]
    print(p["name"], p["pm_id"], e["status"], e["restart_time"])' | tee "$EV/pm2-T-$BOX.txt"
rec "R1_$BOX" "$(tr '\n' ';' < "$EV/pm2-T-$BOX.txt")"
```
  - Expected: `N_CORP` `crhs-corporate … online <n>` rows and `N_AFF` `wavemax … online <n>` rows, recorded as `R1_<box>`.

---

### Task 77: [per box] On-box HTTP acceptance — the S1 script, forged-header probes (R-3), live CORS probe (R-2), crhsent.com unchanged, body parity, §5.12 asset values, C5 deliverability, C13 click

**Files:** none in any repo. Appends to `S1LOG_<box>`. Temporary workstation dir `/tmp/lh-shim` (removed in Step 8).

**Interfaces:**
- Consumes:
  - `scripts/ops/cutover-gate.sh` (Task 70) and `scripts/ops/lh-dark-origin-proxy.js` (Task 71);
  - record values `CRHSENT_MD5_<box>`, `CRHSENT_WAVEMAX_CODE_<box>`, `D5_STATE`, `SEC_CONTACT`, `P8_SUBJECT`, `P1_REFUSE`, `P13_RESULT`, `P14_RESULT`;
  - `~/crhs-cutover-baselines/a1/<box>/raw.txt`, the pre-A1 on-box byte baseline captured by A15 Task 20 Step 3.
- Produces: `MANUAL R2-cors|C5-contact|C13-click|P8|P13|P14 PASS …` lines, and an S1 run with `fails=0`.
- Every `:3001` request goes on-box to `http://127.0.0.1:3001`; nginx is untouched.

- [ ] **Step 0: Set the box and load the record.**
```bash
BOX=oci1; IP=161.153.71.201        # Pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/phase0a-record.env
set -a; . "$REC"; set +a
GATE=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/scripts/ops/cutover-gate.sh
V=S1LOG_$BOX; S1LOG=${!V}; V=CRHSENT_MD5_$BOX; CRHSENT_MD5=${!V}; V=CRHSENT_WAVEMAX_CODE_$BOX; CRHSENT_WAVEMAX_CODE=${!V}
echo "S1LOG=$S1LOG CRHSENT_MD5=$CRHSENT_MD5 CRHSENT_WAVEMAX_CODE=$CRHSENT_WAVEMAX_CODE D5_STATE=$D5_STATE SEC_CONTACT=$SEC_CONTACT"
```
  - Expected: every value non-empty.

- [ ] **Step 1: R-3 — a forged `X-Forwarded-Host` never steers a gate (from `127.0.0.1`, a non-whitelisted IP).**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'B=http://127.0.0.1:3001
curl -s -o /tmp/p0a-r3w.html -w "wavemax %{http_code} " -H "Host: crhsent.com" -H "X-Forwarded-Host: rundberglaundry.com" $B/wavemax/; echo "$(grep -c "Documented record &mdash; access" /tmp/p0a-r3w.html) $(grep -c "WaveMAX 3.0 platform" /tmp/p0a-r3w.html)"
curl -s -o /tmp/p0a-r3r.html -w "readme %{http_code} " -H "Host: crhsent.com" -H "X-Forwarded-Host: rundberglaundry.com" $B/README.md; grep -c "This content is private." /tmp/p0a-r3r.html
rm -f /tmp/p0a-r3w.html /tmp/p0a-r3r.html'
```
  - Expected: `wavemax 200 1 0` (the mediator password prompt, never the record), then `readme 401 1` (the access-gate page).
  - Before the deploy both requests answered `404` (`XFH_BEFORE_<box>`). The change is the intended one: the host now comes from `Host` alone, so the gates engage on `crhsent.com` instead of the request falling through.
  - A `200` body containing `WaveMAX 3.0 platform` is the F-9 bypass: **STOP → Task 84**.

- [ ] **Step 2: R-2 — live CORS probe against the production env, then attest `R2-cors`.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'for o in http://localhost:3000 https://wavemax.promo; do for h in crhsent.com rundberglaundry.com runberglaundry.com atxwashateria.com atxwashdryfold.com; do echo "$o $h $(curl -s -D - -o /dev/null -H "Host: $h" -H "Origin: $o" http://127.0.0.1:3001/ | grep -ci "^access-control-allow-origin:")"; done; echo "$o portal $(curl -s -D - -o /dev/null -H "Host: portal.atxwashdryfold.com" -H "Origin: $o" http://127.0.0.1:3000/api/csrf-token | grep -ci "^access-control-allow-origin:")"; done
echo "https://atxwashdryfold.com portal $(curl -s -D - -o /dev/null -H "Host: portal.atxwashdryfold.com" -H "Origin: https://atxwashdryfold.com" http://127.0.0.1:3000/api/csrf-token | grep -i "^access-control-allow-origin:" | tr -d "\r" | tr "[:upper:]" "[:lower:]")"' | tee "$EV/cors-after-$BOX.txt"
```
  - Expected: 12 lines ending ` 0`, then `https://atxwashdryfold.com portal access-control-allow-origin: https://atxwashdryfold.com` (the portal's inline `wavemaxDomains` list is preserved, `server.js:299-304`).
  - `CORS_BEFORE_<box>` was `1 1`, which proves this probe can see the misconfiguration.
  - Then: `bash "$GATE" --attest R2-cors --by rick --evidence "$BOX localhost:3000 + wavemax.promo -> 0 allow-origin on crhsent.com, 4 marketing hosts, portal; atxwashdryfold.com still admitted by portal" --log "$S1LOG"`

- [ ] **Step 3: crhsent.com is unchanged (A1 contract).**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'B=http://127.0.0.1:3001
curl -s -H "Host: crhsent.com" $B/ | sed -E "s/nonce-[A-Za-z0-9+\/=_-]+/nonce-N/g; s/nonce=\"[^\"]*\"/nonce=\"N\"/g; s/content=\"[A-Za-z0-9+\/=_-]{16,}\"/content=\"N\"/g" | md5sum | cut -d" " -f1
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: crhsent.com" $B/wavemax/
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: crhsent.com" $B/services
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" -H "Host: crhsent.com" $B/.well-known/security.txt
curl -s -H "Host: crhsent.com" $B/.well-known/security.txt | grep -c "^Policy:"'
```
  - Expected:
    1. an md5 equal to `$CRHSENT_MD5`
    2. `$CRHSENT_WAVEMAX_CODE` (the pre-deploy code, `200`)
    3. `401`
    4. `200 text/plain; charset=utf-8` (R-11: accessGate exempts `/.well-known/security.txt`)
    5. `0` (crhsent.com carries no `Policy:` line)
  - A different md5 is a **STOP → Task 84**: A1's contract is that crhsent.com is byte-unchanged, modulo nonce.

- [ ] **Step 3b: A1 acceptance against A15 Task 20's on-box byte baseline — re-run the identical capture loop for THIS box into `raw-after.txt` and diff.**
```bash
N=$BOX; test -s ~/crhs-cutover-baselines/a1/$N/raw.txt && echo BASELINE_PRESENT
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'for p in / /work /about/ /capabilities /contact /owners/ /wavemax/ /robots.txt /sitemap.xml /assets/css/site.css; do f=$(echo "$p" | tr "/" "_"); code=$(curl -s -o /tmp/bl$f -w "%{http_code}" -H "Host: crhsent.com" "http://127.0.0.1:3001$p"); n=$(grep -o "nonce-[A-Za-z0-9+/=]*\|nonce=\"[^\"]*\"" /tmp/bl$f | head -1 | sed -E "s/^nonce-//;s/^nonce=\"//;s/\"$//"); [ -n "$n" ] && sed -i "s|$n|__NONCE__|g" /tmp/bl$f; echo "$code $p"; base64 -w0 /tmp/bl$f; echo; rm -f /tmp/bl$f; done' > ~/crhs-cutover-baselines/a1/$N/raw-after.txt
wc -l < ~/crhs-cutover-baselines/a1/$N/raw-after.txt
diff ~/crhs-cutover-baselines/a1/$N/raw.txt ~/crhs-cutover-baselines/a1/$N/raw-after.txt | grep -E '^[0-9]'
sed -n 11p ~/crhs-cutover-baselines/a1/$N/raw-after.txt
diff <(sed -n 12p ~/crhs-cutover-baselines/a1/$N/raw.txt | base64 -d) <(sed -n 12p ~/crhs-cutover-baselines/a1/$N/raw-after.txt | base64 -d) | grep -E '^[<>]'
```
  - Expected: `BASELINE_PRESENT`; `20`; exactly one hunk header, `12c12`; `200 /owners/`; then exactly two lines — a `<` line containing `alt="WaveMAX Laundry"` and a `>` line containing `alt="WaveMAX Austin"` (A69 Task 57, spec §5.10).
  - Why only `/owners/`: `/`, `/work`, `/about/`, `/capabilities`, `/contact`, `/owners/`, `/robots.txt`, `/sitemap.xml` and `/assets/css/site.css` are accessGate-exempt public content (`crhs-corporate/server/middleware/accessGate.js` `isExempt`), and A1–A9 change only `/owners/` among them; `/wavemax/` is the mediator prompt (exempt from accessGate while `MEDIATOR_GATE_ENABLED=true`), which A1–A9 do not change. Set-Cookie is not captured (A15 Task 30 renames it on purpose).
  - Any other difference is a **STOP → Task 84**.

- [ ] **Step 4: Run the S1 script on the box (script on stdin; the log is redacted by the script itself).**
```bash
ATT=$(grep -oP '^MANUAL \K\S+(?= PASS )' "$S1LOG" 2>/dev/null | sort -u | tr '\n' ' ')
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "GATE_ATTESTED='$ATT' GATE_D5='$D5_STATE' GATE_SECURITY_CONTACT='$SEC_CONTACT' bash -s -- --stage S1 --on-box" < "$GATE" | tee -a "$S1LOG" | grep -E '^(FAIL|MANUAL|SUMMARY)'; echo "exit=${PIPESTATUS[0]}"
```
  - Expected: no `FAIL` line, then the pending cells:
    - `MANUAL C5-contact PENDING`
    - `MANUAL C6-mail PENDING`
    - `MANUAL C13-click PENDING`
    - `MANUAL C14-baseline PENDING`
    - `MANUAL P1 PENDING`
    - `MANUAL P8 PENDING`
    - `MANUAL P13 PENDING`
    - `MANUAL P14 PENDING`
  - Then `SUMMARY S1 fails=0 pending=8` and `exit=1`. R2-cors, P2 and P3 are already attested.
  - Any `FAIL` line is a **STOP → Task 84**. The evidence is in the log line.

- [ ] **Step 5: §9.2 step 3 body parity — the served page equals the content-root file rendered with the SAME nonce by web-core's own `cspHelper.readHTMLWithNonce`.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate && for pair in "/ content/atxwashdryfold/index.html" "/affiliate content/atxwashdryfold/affiliate/index.html"; do set -- $pair; curl -s -H "Host: atxwashdryfold.com" "http://127.0.0.1:3001$1" -o /tmp/p0a-parity.html; n=$(grep -oP "<meta name=\"csp-nonce\" content=\"\K[^\"]+" /tmp/p0a-parity.html | head -1); a=$(md5sum < /tmp/p0a-parity.html | cut -d" " -f1); b=$(node -e "require(\"dotenv\").config();require(\"@crhs/web-core\").cspHelper.readHTMLWithNonce(process.argv[1],process.argv[2]).then((h)=>{process.stdout.write(h);process.exit(0)})" "$2" "$n" | md5sum | cut -d" " -f1); echo "$1 $([ -n "$n" ] && [ "$a" = "$b" ] && echo SAME || echo DIFF)"; done; rm -f /tmp/p0a-parity.html'
```
  - Expected: `/ SAME`, then `/affiliate SAME`.

- [ ] **Step 6: §5.12 contentHandler / assetCaching values not covered by the script, plus three rows handed over by A69 (B7 on a `www.` name, the forged-header B7 negative, the store IP on `/health`).**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'B=http://127.0.0.1:3001
curl -s -D - -o /dev/null -H "Host: atxwashdryfold.com" $B/assets/css/partner-program.css | grep -iE "^(HTTP/|cache-control:|cross-origin-resource-policy:)" | tr -d "\r" | tr "[:upper:]" "[:lower:]"
curl -s -D - -o /dev/null -H "Host: atxwashdryfold.com" $B/assets/js/i18n.js | grep -iE "^(HTTP/|cache-control:)" | tr -d "\r" | tr "[:upper:]" "[:lower:]"
curl -s --path-as-is -o /dev/null -w "traversal %{http_code}\n" -H "Host: atxwashdryfold.com" "$B/%2e%2e/%2e%2e/server.js"
curl -s -o /dev/null -w "legal %{http_code}\n" -H "Host: atxwashdryfold.com" $B/assets/legal/terms.html
curl -s -o /dev/null -w "gate-on-marketing %{http_code}\n" -H "Host: atxwashdryfold.com" $B/__gate
curl -s -o /dev/null -w "wavemax-on-marketing %{http_code}\n" -H "Host: rundberglaundry.com" $B/wavemax/
curl -s -o /dev/null -w "b7-www %{http_code} %{redirect_url}\n" -H "Host: www.atxwashdryfold.com" $B/admin
curl -s -o /dev/null -w "b7-xfh-crhsent %{http_code}\n" -H "Host: crhsent.com" -H "X-Forwarded-Host: atxwashdryfold.com" $B/admin
curl -s -o /dev/null -w "storeip-health %{http_code}\n" -H "Host: atxwashdryfold.com" -H "CF-Connecting-IP: 72.190.1.227" $B/health'
```
  - Expected:
    - `http/1.1 200 ok`, `cache-control: public, max-age=31536000, immutable`, `cross-origin-resource-policy: cross-origin`
    - `http/1.1 200 ok`, `cache-control: public, max-age=31536000, immutable`
    - `traversal 403`
    - `legal 404`
    - `gate-on-marketing 404`
    - `wavemax-on-marketing 404`
    - `b7-www 301 https://portal.atxwashdryfold.com/admin` (B7 covers the `www.` names — Global Constraint 5)
    - `b7-xfh-crhsent 401` — never `301`: a forged `X-Forwarded-Host` cannot pull `crhsent.com` into B7 (R-3); `401` is the access-gate page, the same gate state Step 3 proved with `/services`
    - `storeip-health 200` — `/health` answers before the store-IP 302 (§5.2 order)

- [ ] **Step 7: §10.1 C5 deliverability (REMOTE, mail host) — the published `Contact:` resolves — then attest `C5-contact`.**
```bash
sudo ssh wavemax-promo "cd /opt/mailcow-dockerized && set -a && . ./mailcow.conf && set +a && docker compose exec -T mysql-mailcow mysql -u\"\$DBUSER\" -p\"\$DBPASS\" \"\$DBNAME\" -N -e \"select address,goto,active from alias where address='$SEC_CONTACT' union select username,username,active from mailbox where username='$SEC_CONTACT'\" 2>/dev/null"
```
  - Expected: exactly one row. With `SEC_CONTACT=security@crhsent.com`: `security@crhsent.com	admin@crhsent.com	1`.
  - Then: `bash "$GATE" --attest C5-contact --by rick --evidence "$BOX Contact: mailto:$SEC_CONTACT resolves in mailcow (alias/mailbox active=1); Expires future (script C5-securitytxt)" --log "$S1LOG"`
  - An unresolvable `Contact:` is a FAIL, not a warning: STOP and fix the alias (§9.1 P-15) before continuing.

- [ ] **Step 8: §10.1 C13 language click (MANUAL), through a tunnel to THIS box and the Task 71 shim, then attest `C13-click`.**
```bash
mkdir -p /tmp/lh-shim && openssl req -x509 -newkey rsa:2048 -nodes -keyout /tmp/lh-shim/k.pem -out /tmp/lh-shim/c.pem -subj /CN=atxwashdryfold.com -days 1 2>/dev/null
ssh -i ~/.ssh/oci_wavemax -f -N -o ExitOnForwardFailure=yes -L 13001:127.0.0.1:3001 ubuntu@$IP
node /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/scripts/ops/lh-dark-origin-proxy.js --listen 18443 --upstream 127.0.0.1:13001 --cert /tmp/lh-shim/c.pem --key /tmp/lh-shim/k.pem &
sleep 1; curl -sk --resolve atxwashdryfold.com:18443:127.0.0.1 https://atxwashdryfold.com:18443/health; echo
curl -s -H 'Host: atxwashdryfold.com' http://127.0.0.1:13001/locales/es/common.json | node -e 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).partner.hero.title)'
/opt/google/chrome/chrome --user-data-dir=/tmp/lh-shim/profile --host-resolver-rules="MAP atxwashdryfold.com 127.0.0.1:18443" --ignore-certificate-errors "https://atxwashdryfold.com/?lh=$(date +%s)"
```
  - Expected: `{"status":"ok"}` (the dark `:3001` — the affiliate answers `{"status":"UP",…}`), then the Spanish hero title, then a Chrome window.
  - In that window, click the `ES` button (`.ap-lang[data-lang="es"]`). Confirm two things: the hero heading (`[data-i18n="partner.hero.title"]`) now reads exactly the Spanish title printed above, and `aria-pressed="true"` moved to the ES button (DevTools → Elements).
  - Close Chrome, then run:
```bash
bash "$GATE" --attest C13-click --by rick --evidence "$BOX es toggle changed partner.hero.title to es value and moved aria-pressed (dark :3001 via shim)" --log "$S1LOG"
pkill -f 'lh-dark-origin-proxy.js --listen 18443'; pkill -f 'ssh -i .*oci_wavemax -f -N -o ExitOnForwardFailure=yes -L 13001'; rm -rf /tmp/lh-shim
```

- [ ] **Step 9: Attest the box-independent Task 72 results into this box's log: §10.3 P8, P13, P14.**
```bash
bash "$GATE" --attest P8 --by rick --evidence "corporate CORP_SHA=$CORP_SHA server.integration + csp.test green; exactly 1 commit touches tests/csp.test.js; subject: $P8_SUBJECT" --log "$S1LOG"
bash "$GATE" --attest P13 --by rick --evidence "web-core 579/579 lint madge 0; corporate suite green, check:i18n 119x4, madge 0; affiliate AFF_SHA=$AFF_SHA seam suites green, full suite only the 2 known failures (Task 72 Step 7b), check:i18n 0, madge 0" --log "$S1LOG"
bash "$GATE" --attest P14 --by rick --evidence "CF token active; 4 rundberglaundry aliases -> admin@crhsent.com; Firebase domain DONE 2026-09-09 (C7 SMS proof at S3)" --log "$S1LOG"
grep -cE '^MANUAL (R2-cors|C5-contact|C13-click|P2|P3|P8|P13|P14) PASS ' "$S1LOG"
```
  - Expected: `8`.

- [ ] **Step 10: Re-run the S1 script.**
```bash
ATT=$(grep -oP '^MANUAL \K\S+(?= PASS )' "$S1LOG" | sort -u | tr '\n' ' ')
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "GATE_ATTESTED='$ATT' GATE_D5='$D5_STATE' GATE_SECURITY_CONTACT='$SEC_CONTACT' bash -s -- --stage S1 --on-box" < "$GATE" | tee -a "$S1LOG" | grep -E '^(FAIL|MANUAL|SUMMARY)'; echo "exit=${PIPESTATUS[0]}"
```
  - Expected: no `FAIL`; `MANUAL C6-mail PENDING`, `MANUAL C14-baseline PENDING`, `MANUAL P1 PENDING`; `SUMMARY S1 fails=0 pending=3`; `exit=1`.

---

### Task 78: [per box] **HUMAN-CONFIRM** — intake: failing-payload proofs, the ONE announced valid POST, delivery with `Reply-To`, attest `C6-mail`

**Files:** none in any repo. Workstation evidence `/var/www/wavemax/cutover-logs/intake-*-<box>.txt` and `mail-*-<box>.eml`; appends to `S1LOG_<box>`.

**Interfaces:**
- Consumes:
  - Mailcow aliases `cutover-gate@crhsent.com` (§9.1 P-15), `pickups@atxwashdryfold.com` (§9.1 P-13), `admin@crhsent.com`;
  - the A69 intake routes and validator codes (`partner.form.err*`, `partner.form.errGeneric`).
- Produces: `MARK_<box>`; one `MANUAL C6-mail PASS …` line.
- This task sends exactly 2 real emails per box: one notification and one thank-you.
  - oci1: the partner-inquiry notification → `pickups@atxwashdryfold.com` (Reply-To `cutover-gate@crhsent.com`); the thank-you → `cutover-gate@crhsent.com` (Reply-To `pickups@atxwashdryfold.com`).
  - oci2: the affiliate-application notification → `admin@crhsent.com` (Reply-To `cutover-gate@crhsent.com`); the thank-you → `cutover-gate@crhsent.com` (Reply-To `admin@crhsent.com`).
- TEST-NET addresses (one per POST, per box — the burst limiter runs BEFORE validation):
  - oci1: `203.0.113.11`–`.16`
  - oci2: `203.0.113.21`–`.26`

**Rollback:** nothing to roll back. The mail is not recallable and goes only to our own aliases. The rate-limit counters expire by window.

- [ ] **Step 0: Set the box, load the record, derive the per-box values.**
```bash
BOX=oci1; IP=161.153.71.201        # Pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/phase0a-record.env
set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
GATE=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/scripts/ops/cutover-gate.sh
V=S1LOG_$BOX; S1LOG=${!V}
NET=$([ "$BOX" = oci1 ] && echo 1 || echo 2)
RCPT=$([ "$BOX" = oci1 ] && echo pickups@atxwashdryfold.com || echo admin@crhsent.com)
KIND=$([ "$BOX" = oci1 ] && echo partner || echo affiliate)
M=gate-$BOX-$(date +%s); rec "MARK_$BOX" "$M"
echo "NET=$NET RCPT=$RCPT KIND=$KIND M=$M"
```
  - Expected (oci1): `NET=1 RCPT=pickups@atxwashdryfold.com KIND=partner M=gate-oci1-<epoch>`.
  - Expected (oci2): `NET=2 RCPT=admin@crhsent.com KIND=affiliate M=gate-oci2-<epoch>`.

- [ ] **Step 1: Failing payloads — partner inquiry and its `/api/v1` alias reach the validator (400, no mail, no cookie).**
```bash
for pair in "1 /api/partner-inquiry" "2 /api/v1/partner-inquiry"; do set -- $pair
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "curl -s -D - -X POST -H 'Host: atxwashdryfold.com' -H 'Content-Type: application/json' -H 'CF-Connecting-IP: 203.0.113.$NET$1' http://127.0.0.1:3001$2 -d '{\"firstName\":\"Cutover\",\"lastName\":\"Test\",\"email\":\"nope\",\"phone\":\"5125550100\",\"volume\":\"lots\"}'" > "$EV/intake-fail-$BOX-$1.txt"
  python3 - "$EV/intake-fail-$BOX-$1.txt" "$2" <<'PY'
import json, sys
raw = open(sys.argv[1], encoding='utf-8').read().replace('\r', '')
head, _, body = raw.partition('\n\n')
status = head.split('\n', 1)[0].split(' ')[1]
cookies = sum(1 for l in head.split('\n') if l.lower().startswith('set-cookie:'))
b = json.loads(body)
codes = sorted({e.get('code', '') for e in b.get('errors', [])})
print(sys.argv[2], status, b.get('success'), b.get('message'), cookies, all(c.startswith('partner.form.err') for c in codes), ','.join(codes))
PY
done
```
  - Expected:
    - `/api/partner-inquiry 400 False Validation failed 0 True partner.form.errEmail,partner.form.errVolume`
    - `/api/v1/partner-inquiry 400 False Validation failed 0 True partner.form.errEmail,partner.form.errVolume`

- [ ] **Step 2: Failing payloads — affiliate application and its `/api/v1` alias (400; `message` is mandatory, ≥ 80 characters, finding F-3).**
```bash
for pair in "3 /api/affiliate-application" "4 /api/v1/affiliate-application"; do set -- $pair
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "curl -s -D - -X POST -H 'Host: atxwashdryfold.com' -H 'Content-Type: application/json' -H 'CF-Connecting-IP: 203.0.113.$NET$1' http://127.0.0.1:3001$2 -d '{\"firstName\":\"Cutover\",\"lastName\":\"Test\",\"email\":\"nope\",\"phone\":\"5125550100\"}'" > "$EV/intake-fail-$BOX-$1.txt"
  python3 - "$EV/intake-fail-$BOX-$1.txt" "$2" <<'PY'
import json, sys
raw = open(sys.argv[1], encoding='utf-8').read().replace('\r', '')
head, _, body = raw.partition('\n\n')
status = head.split('\n', 1)[0].split(' ')[1]
cookies = sum(1 for l in head.split('\n') if l.lower().startswith('set-cookie:'))
b = json.loads(body)
codes = sorted({e.get('code', '') for e in b.get('errors', [])})
print(sys.argv[2], status, b.get('success'), b.get('message'), cookies, all(c.startswith('partner.form.err') for c in codes), ','.join(codes))
PY
done
```
  - Expected:
    - `/api/affiliate-application 400 False Validation failed 0 True partner.form.errEmail,partner.form.errGeneric`
    - `/api/v1/affiliate-application 400 False Validation failed 0 True partner.form.errEmail,partner.form.errGeneric`

- [ ] **Step 3: Host-scoping negative — crhsent.com never reaches the intake handler.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Host: crhsent.com' -H 'Content-Type: application/json' -H 'CF-Connecting-IP: 203.0.113.${NET}6' http://127.0.0.1:3001/api/partner-inquiry -d '{}'"
```
  - Expected: `401`. The intake router is marketing-only, and on crhsent.com the enforcing access gate answers first for a non-whitelisted IP. No mail is sent.

- [ ] **Step 4 (HUMAN-CONFIRM): Announce, then send the ONE valid intake POST for this box.**
  - Tell Rick exactly:
    > One test `<KIND>` submission marked `<M>` is about to be sent from `<BOX>`. A notification lands at `<RCPT>` and a thank-you at `cutover-gate@crhsent.com` (→ `admin@crhsent.com`). It is a Phase 0a verification — ignore it.

  - On his yes, run the command for this box.
```bash
if [ "$BOX" = oci1 ]; then
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "curl -s -w ' %{http_code}\n' -X POST -H 'Host: atxwashdryfold.com' -H 'Content-Type: application/json' -H 'CF-Connecting-IP: 203.0.113.15' http://127.0.0.1:3001/api/partner-inquiry -d '{\"firstName\":\"Cutover\",\"lastName\":\"Gate\",\"email\":\"cutover-gate@crhsent.com\",\"phone\":\"5125550100\",\"businessName\":\"$M\",\"volume\":\"just-exploring\",\"message\":\"$M Phase 0a on-box verification, please ignore.\",\"source\":\"cutover-verify\"}'"
else
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "curl -s -w ' %{http_code}\n' -X POST -H 'Host: atxwashdryfold.com' -H 'Content-Type: application/json' -H 'CF-Connecting-IP: 203.0.113.25' http://127.0.0.1:3001/api/affiliate-application -d '{\"firstName\":\"Cutover\",\"lastName\":\"Gate\",\"email\":\"cutover-gate@crhsent.com\",\"phone\":\"5125550100\",\"affiliation\":\"other\",\"transport\":\"car\",\"message\":\"$M On-box Phase 0a verification of the affiliate application endpoint; please ignore this submission entirely.\",\"source\":\"cutover-verify\"}'"
fi
```
  - Expected: a body starting `{"success":true`, followed by ` 200`.
  - `just-exploring` is in `ALLOWED_VOLUMES` (`partnerInquiryRoutes.js:9`).
  - The affiliate `message` without the marker is 107 characters, which is ≥ 80.

- [ ] **Step 5: Delivery in the Postfix log (REMOTE, mail host) — `from=<no-reply@crhsent.com>`, both recipients `status=sent`, no `553`.**
```bash
sleep 30
sudo ssh wavemax-promo "cd /opt/mailcow-dockerized && docker compose logs --no-color --since 15m postfix-mailcow 2>&1 | grep -E 'orig_to=<($RCPT|cutover-gate@crhsent.com)>' | grep -oE 'orig_to=<[^>]+>.*status=[a-z]+' | sed -E 's/, relay=.*status=/ status=/'; echo 'no-reply-553:'; docker compose logs --no-color --since 15m postfix-mailcow 2>&1 | grep 'no-reply@crhsent.com' | grep -c ' 553 '"
```
  - Expected:
    - one or more lines `orig_to=<$RCPT> status=sent`;
    - one or more lines `orig_to=<cutover-gate@crhsent.com> status=sent`;
    - no line ending `status=bounced` or `status=deferred`;
    - then `no-reply-553:` and `0`.

- [ ] **Step 6: Fetch and parse both messages — From, Reply-To, subject, absolute logo, no unfilled placeholder.**
  - Resolve each terminal mailbox. Its username is the first `goto` entry that is a mailbox:
```bash
sudo ssh wavemax-promo "cd /opt/mailcow-dockerized && set -a && . ./mailcow.conf && set +a && docker compose exec -T mysql-mailcow mysql -u\"\$DBUSER\" -p\"\$DBPASS\" \"\$DBNAME\" -N -e \"select a.address, m.username from alias a join mailbox m on find_in_set(m.username, a.goto) where a.address in ('$RCPT','admin@crhsent.com') order by a.address, m.username\" 2>/dev/null" | tee "$EV/mailboxes-$BOX.txt"
MB_NOTIF=$(awk -v r="$RCPT" '$1==r{print $2; exit}' "$EV/mailboxes-$BOX.txt"); MB_THANKS=$(awk '$1=="admin@crhsent.com"{print $2; exit}' "$EV/mailboxes-$BOX.txt"); echo "MB_NOTIF=$MB_NOTIF MB_THANKS=$MB_THANKS"
```
  - Expected: at least one `$RCPT <mailbox>` row and the row `admin@crhsent.com admin@crhsent.com` (a real mailbox since 2026-09-13 — its own alias row), then `MB_NOTIF=admin@crhsent.com MB_THANKS=admin@crhsent.com`.
    - `MB_NOTIF` is the first terminal mailbox behind the recipient alias.
    - `MB_THANKS` is the mailbox behind `admin@crhsent.com`, because the thank-you goes to `cutover-gate@crhsent.com` → `admin@crhsent.com`.
    - **STOP** if either value is empty.
  - Fetch the raw messages and parse them locally:
```bash
SUBJ=$([ "$KIND" = partner ] && echo "Thanks for your interest in the WaveMAX Austin partner program" || echo "Thanks for your interest in the WaveMAX Austin affiliate program")
sudo ssh wavemax-promo "cd /opt/mailcow-dockerized && docker compose exec -T dovecot-mailcow sh -c 'set -- \$(doveadm search -u $MB_NOTIF mailbox INBOX body \"$M\" | tail -1); doveadm fetch -u $MB_NOTIF text mailbox-guid \$1 uid \$2'" | tail -n +2 > "$EV/mail-notification-$BOX.eml"
sudo ssh wavemax-promo "cd /opt/mailcow-dockerized && docker compose exec -T dovecot-mailcow sh -c 'set -- \$(doveadm search -u $MB_THANKS mailbox INBOX subject \"$SUBJ\" | tail -1); doveadm fetch -u $MB_THANKS text mailbox-guid \$1 uid \$2'" | tail -n +2 > "$EV/mail-thanks-$BOX.eml"
for f in notification thanks; do python3 - "$EV/mail-$f-$BOX.eml" "$f" <<'PY'
import email, sys
from email import policy
m = email.message_from_bytes(open(sys.argv[1], 'rb').read(), policy=policy.default)
html = ''.join(p.get_content() for p in m.walk() if p.get_content_type() == 'text/html')
fr = m['From'].addresses[0]; rt = m['Reply-To'].addresses[0]
print(sys.argv[2], '|', fr.display_name, '|', fr.addr_spec, '|', rt.addr_spec, '|', str(m['Subject']) if sys.argv[2] == 'thanks' else '-', '|',
      '<img src="https://atxwashdryfold.com/assets/images/brand/logo.png"' in html, '|',
      html.count('[BRAND_LOGO]') + html.count('[BRAND_NAME]'))
PY
done
```
  - Expected, oci1:
    - `notification | WaveMAX Austin | no-reply@crhsent.com | cutover-gate@crhsent.com | - | True | 0` (found by its body marker `$M`)
    - `thanks | WaveMAX Austin | no-reply@crhsent.com | pickups@atxwashdryfold.com | Thanks for your interest in the WaveMAX Austin partner program | True | 0`
  - Expected, oci2:
    - `notification | WaveMAX Austin | no-reply@crhsent.com | cutover-gate@crhsent.com | - | True | 0` (found by its body marker `$M`)
    - `thanks | WaveMAX Austin | no-reply@crhsent.com | admin@crhsent.com | Thanks for your interest in the WaveMAX Austin affiliate program | True | 0`
  - **STOP** on any other field. A `False` logo or a non-zero placeholder count means the template root or `BASE_URL` is wrong (R-25) → Task 84.

- [ ] **Step 7: Attest `C6-mail` into this box's S1 log.**
```bash
bash "$GATE" --attest C6-mail --by rick --evidence "$BOX one valid $KIND POST ($M): status=sent to $RCPT and cutover-gate@crhsent.com; From WaveMAX Austin <no-reply@crhsent.com>; Reply-To lead/recipient; absolute logo; 0 placeholders; failing payloads 400 x4 (codes resolve), crhsent.com 401" --log "$S1LOG"
tail -1 "$S1LOG"
```
  - Expected: `MANUAL C6-mail PASS rick <ts> <evidence>`.

---

### Task 79: [per box] Database acceptance — `ratelimit_corp_*` only from `:3001` traffic, no `ratelimit_*`/`sessions` writes from `:3001`, crhsent.com sessions in `sessions_corporate`

**Files:** none.

**Interfaces:**
- Consumes: `RL_CORP_BEFORE_<box>`; the Task 78 TEST-NET addresses; corporate `server/db.js` `connect()`.
- Produces: `S1_DB_<box>=PASS`.
- C9b's deterministic half (zero `Set-Cookie` on 100 spoofed requests per marketing host) already passed as the script's `C9b-spoof` cell (R-9). This task records the collection count as information only.

- [ ] **Step 0: Set the box and load the record.**
```bash
BOX=oci1; IP=161.153.71.201        # Pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/phase0a-record.env
set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
NET=$([ "$BOX" = oci1 ] && echo 1 || echo 2)
V=RL_CORP_BEFORE_$BOX; echo "NET=$NET RL_CORP_BEFORE=${!V}"
```

- [ ] **Step 1: Generate crhsent.com `/api/` traffic from a TEST-NET address no real visitor has.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "for i in 1 2 3; do curl -s -o /dev/null -w '%{http_code} ' -H 'Host: crhsent.com' -H 'CF-Connecting-IP: 203.0.113.7$NET' http://127.0.0.1:3001/api/probe-\$i; done; echo"
```
  - Expected: `401 401 401`. The corporate `apiLimiter` counts the request first; the enforcing access gate then answers.

- [ ] **Step 2: The keys landed in the `ratelimit_corp_` namespace, never the portal's.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "cd /var/www/crhs-corporate && node -e \"require('dotenv').config();const db=require('./server/db');const m=require('mongoose');db.connect().then(async()=>{const d=m.connection.db;const api=/203\\\\.0\\\\.113\\\\.7$NET/;const intake=/203\\\\.0\\\\.113\\\\.$NET[1-6]/;const c=(n,q)=>d.collection(n).countDocuments({_id:q});console.log('api',await c('ratelimit_corp_api',api),await c('ratelimit_api',api));console.log('hourly',await c('ratelimit_corp_contact_hourly',intake),await c('ratelimit_contact_hourly',intake));console.log('corp_collections',(await d.listCollections().toArray()).map((x)=>x.name).filter((x)=>x.startsWith('ratelimit_corp_')).sort().join(','));process.exit(0)}).catch((e)=>{console.log('DB_ERR '+e.message);process.exit(1)})\""
```
  - Expected:
    - `api 1 0`
    - `hourly 5 0` — Task 78's four failing POSTs plus the one valid POST, each from its own address; the crhsent.com negative never reached an intake limiter.
    - a `corp_collections` line containing `ratelimit_corp_api`, `ratelimit_corp_contact_burst` and `ratelimit_corp_contact_hourly`.
  - On the oci1 pass, `RL_CORP_BEFORE_oci1` was `corp:<none>`: the collections appear only after `:3001` traffic.

- [ ] **Step 3: A crhsent.com session is stored in `sessions_corporate`, never in `sessions`.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "SID=\$(curl -s -D - -o /dev/null -H 'Host: crhsent.com' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3001/ | grep -i '^set-cookie: __Host-crhsent.sid=' | sed -E 's/.*__Host-crhsent\.sid=s%3A([^.;]+).*/\1/'); echo \"sid-length \${#SID}\"; sleep 2; cd /var/www/crhs-corporate && node -e \"require('dotenv').config();const db=require('./server/db');const m=require('mongoose');db.connect().then(async()=>{const d=m.connection.db;console.log('stores',await d.collection('sessions_corporate').countDocuments({_id:process.argv[1]}),await d.collection('sessions').countDocuments({_id:process.argv[1]}));console.log('sessions_corporate_count',await d.collection('sessions_corporate').countDocuments({}));process.exit(0)})\" \"\$SID\""
```
  - Expected: `sid-length 32`, `stores 1 0`, then `sessions_corporate_count <n>`. The count is informational (R-9).

- [ ] **Step 4: Record.**
  - Command: `rec "S1_DB_$BOX" PASS`

---

### Task 80: [per box] §10.3 P1 at T+15, logs since the reload, public smoke, S1 re-run and box sign-off

**Files:** none in any repo. Appends to `S1LOG_<box>` and the record.

**Interfaces:**
- Consumes: `RELOAD_TS_<box>`, `RELOAD_TS_AFF_<box>`, `R1_<box>`, `P1_REFUSE`, `S1LOG_<box>`, `D5_STATE`, `SEC_CONTACT`.
- Produces: `MANUAL P1 PASS …`, then `BOX_0A_DONE_<box>`. On oci1 this gates Pass 2; on oci2 it gates Task 81.

- [ ] **Step 0: Set the box and load the record.**
```bash
BOX=oci1; IP=161.153.71.201        # Pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/phase0a-record.env
set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
GATE=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/scripts/ops/cutover-gate.sh
V=RELOAD_TS_$BOX; RELOAD_TS=${!V}; V=RELOAD_TS_AFF_$BOX; RELOAD_TS_AFF=${!V}; V=R1_$BOX; R1=${!V}; V=S1LOG_$BOX; S1LOG=${!V}
echo "RELOAD_TS=$RELOAD_TS R1=$R1"
```

- [ ] **Step 1: Wait until at least 15 minutes after `RELOAD_TS`, measured on the box clock.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "python3 -c 'import datetime as d,sys; t=d.datetime.strptime(sys.argv[1], \"%Y-%m-%dT%H:%M:%S\"); print(int((d.datetime.utcnow()-t).total_seconds()//60))' '$RELOAD_TS'"
```
  - Expected: a number ≥ `15`. If it is lower, wait that many minutes and re-run.

- [ ] **Step 2: Restart counts at T+15 equal those at T (§10.3 P1, part one).**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 jlist' | python3 -c 'import sys,json
for p in json.load(sys.stdin):
    e = p["pm2_env"]
    print(p["name"], p["pm_id"], e["status"], e["restart_time"])' | tr '\n' ';'; echo; echo "$R1"
```
  - Expected: two identical lines — every row `online`, every `restart_time` unchanged.
  - A climb is a crash loop: **STOP → Task 84**.

- [ ] **Step 3: No mail-config refusal, gate-cache failure, or database error since either reload.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "python3 - '$RELOAD_TS' '$RELOAD_TS_AFF' <<'PY'
import json, os, sys
def rows(t0, paths):
    out = []
    for path in paths:
        if not os.path.exists(path):
            continue
        for line in open(path, encoding='utf-8', errors='replace'):
            try:
                r = json.loads(line)
            except ValueError:
                continue
            if str(r.get('timestamp', ''))[:19] > t0:
                out.append(json.dumps(r))
    return out
c = rows(sys.argv[1], ['/var/www/crhs-corporate/logs/combined.log', '/var/www/crhs-corporate/logs/combined1.log'])
a = rows(sys.argv[2], ['/var/www/wavemax/wavemax-affiliate-program/logs/combined.log', '/var/www/wavemax/wavemax-affiliate-program/logs/combined1.log'])
print('corp refusing', sum('refusing to start' in x or 'validateMailConfig' in x for x in c))
print('corp gate_load_failed', sum('Access gate cache load failed' in x for x in c))
print('corp boot_failed', sum('crhs-corporate boot failed' in x for x in c))
print('aff refusing', sum('refusing to start' in x or 'validateMailConfig' in x for x in a))
print('aff ora04036', sum('ORA-04036' in x for x in a))
print('aff buffering', sum('buffering timed out' in x for x in a))
PY"
```
  - Expected: `corp refusing 0`, `corp gate_load_failed 0`, `corp boot_failed 0`, `aff refusing 0`, `aff ora04036 0`, `aff buffering 0`.
  - These are §10.3 P1's "no `validateMailConfig` throw" and "no ORA-04036 / buffering" clauses, read from the winston files (R-4).

- [ ] **Step 4: On-box health, and the public surface through Cloudflare.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'curl -s -H "Host: crhsent.com" http://127.0.0.1:3001/health; echo; curl -s -o /dev/null -w "portal %{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health; curl -s -o /dev/null -w "origin %{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health/origin'
for h in crhsent.com portal.atxwashdryfold.com; do curl -s -o /dev/null -w "$h %{http_code}\n" "https://$h/health?lh=$(date +%s)"; done
```
  - Expected: `{"status":"ok"}`, `portal 200`, `origin 200`, `crhsent.com 200`, `portal.atxwashdryfold.com 200`.

- [ ] **Step 5: Attest §10.3 P1.**
```bash
bash "$GATE" --attest P1 --by rick --evidence "$BOX restart_time identical at T and T+15 (both apps online); 0 refusing/validateMailConfig, 0 gate load failures, 0 ORA-04036, 0 buffering since reload; staging refusal: $P1_REFUSE" --log "$S1LOG"
```

- [ ] **Step 6: Re-run the S1 script.**
```bash
ATT=$(grep -oP '^MANUAL \K\S+(?= PASS )' "$S1LOG" | sort -u | tr '\n' ' ')
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "GATE_ATTESTED='$ATT' GATE_D5='$D5_STATE' GATE_SECURITY_CONTACT='$SEC_CONTACT' bash -s -- --stage S1 --on-box" < "$GATE" | tee -a "$S1LOG" | grep -E '^(FAIL|MANUAL|SUMMARY)'; echo "exit=${PIPESTATUS[0]}"
```
  - Expected: no `FAIL`; exactly `MANUAL C14-baseline PENDING`; `SUMMARY S1 fails=0 pending=1`; `exit=1`.
  - `C14-baseline` is attested in Task 82, after both boxes are done.

- [ ] **Step 7: Sign off this box.**
  - Tick every item:
    - Task 73: all premises PASS.
    - Task 74: Steps 4 and 5 exact.
    - Task 75: Steps 6, 7, 9 and 10 exact.
    - Task 76: Steps 1–4 exact.
    - Task 77: Steps 1–10.
    - Task 78: Steps 1–7.
    - Task 79: Steps 1–3.
    - Task 80: Steps 1–6.
  - Then run: `rec "BOX_0A_DONE_$BOX" "$(date -u +%FT%TZ)"; tail -1 "$REC"`
  - Expected: `BOX_0A_DONE_<box>=<timestamp>`.
  - On the oci1 pass: return to Task 73 with `BOX=oci2; IP=144.24.4.202`.
  - Any unticked item means Task 84 for this box. If that happens on the oci1 pass, oci2 is never touched.

---

### Task 81: Cross-box consistency (§9.2 step 4) — body parity, one tree, identical installs and `.env`, pool health, public surface, gate-mail identity

**Files:** none in any repo. Workstation evidence: `/var/www/wavemax/cutover-logs/parity.txt`, `envkeys-corp-*.txt`.

**Interfaces:**
- Consumes: `BOX_0A_DONE_oci1`, `BOX_0A_DONE_oci2`, `ENVKEYS_CORP_oci1`, `ENVKEYS_CORP_oci2`, `CF_CODES_BEFORE`, and exactly one of `P16_ONBOX_FALLBACK` / `P16_EXTERNAL_SERVICE` (Task 72 Step 11); P0 Task 17's `scripts/ops/alert.js` and `deploy/cron/crhs-corporate-health`, delivered with `CORP_SHA` in Task 75.
- Produces: `PARITY=PASS`, `GATE_MAIL_IDENTITY=PASS` and (on-box fallback only) `P16_DRILL_DELIVERED` in the record; `/etc/cron.d/crhs-corporate-health` on both boxes.

- [ ] **Step 0: Load the record; both boxes are signed off.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/phase0a-record.env
set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
echo "oci1=$BOX_0A_DONE_oci1 oci2=$BOX_0A_DONE_oci2"
```
  - Expected: both timestamps non-empty. **STOP** otherwise.

- [ ] **Step 1: Body parity across boxes — 4 marketing hosts × 5 paths, nonce-normalized.**
```bash
norm() { sed -E 's/nonce-[A-Za-z0-9+\/=_-]+/nonce-N/g; s/nonce="[^"]*"/nonce="N"/g; s/<meta name="csp-nonce" content="[^"]*">/<meta name="csp-nonce" content="N">/'; }
for H in rundberglaundry.com runberglaundry.com atxwashateria.com atxwashdryfold.com; do for p in / /affiliate /robots.txt /sitemap.xml /.well-known/security.txt; do
  a=$(ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "curl -s -H 'Host: $H' http://127.0.0.1:3001$p" | norm | md5sum | cut -d' ' -f1)
  b=$(ssh -i ~/.ssh/oci_wavemax ubuntu@144.24.4.202 "curl -s -H 'Host: $H' http://127.0.0.1:3001$p" | norm | md5sum | cut -d' ' -f1)
  [ "$a" = "$b" ] && echo "SAME $H $p" || echo "DIFF $H $p"
done; done | tee "$EV/parity.txt"; grep -c '^SAME ' "$EV/parity.txt"
```
  - Expected: 20 `SAME` lines, then `20`.
  - `security.txt` is compared per host across boxes. Its `Canonical:` line differs between hosts by design, but not between boxes.

- [ ] **Step 2: D1 — the four marketing hosts serve one tree.**
```bash
norm() { sed -E 's/nonce-[A-Za-z0-9+\/=_-]+/nonce-N/g; s/nonce="[^"]*"/nonce="N"/g; s/<meta name="csp-nonce" content="[^"]*">/<meta name="csp-nonce" content="N">/'; }
for p in / /affiliate; do for H in rundberglaundry.com runberglaundry.com atxwashateria.com atxwashdryfold.com; do ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "curl -s -H 'Host: $H' http://127.0.0.1:3001$p" | norm | md5sum; done | sort -u | wc -l; done
```
  - Expected: `1`, then `1`.

- [ ] **Step 3: Identical installs and identical corporate `.env` on both boxes (§8.6: byte-identical except `RUN_BACKGROUND_JOBS`).**
```bash
for ip in 161.153.71.201 144.24.4.202; do ssh -i ~/.ssh/oci_wavemax ubuntu@$ip 'echo "$(cd /var/www/crhs-corporate && node -p "require(\"@crhs/web-core/package.json\").version") $(cd /var/www/wavemax/wavemax-affiliate-program && node -p "require(\"@crhs/web-core/package.json\").version") $(node -p "require(\"/var/www/crhs-web-core/package.json\").version") $(grep -E "^(CORS_ORIGIN|LOG_DIR|LOG_SERVICE_NAME|EMAIL_USER)=" /var/www/wavemax/wavemax-affiliate-program/.env | sha256sum | cut -c1-12)"'; done
diff "$ENVKEYS_CORP_oci1" "$ENVKEYS_CORP_oci2"; echo "corp-env-diff-exit=$?"
```
  - Expected: two identical lines `0.2.1 0.2.1 0.2.1 <hash>`, then `corp-env-diff-exit=0`.
  - A non-zero diff lists key names with short hashes only. It is not fixed here — every `.env` edit is confirm-first. Show it to Rick:
    - a difference in a key Task 74 wrote is a **STOP → Task 84** on the box that differs from the table in Task 74;
    - a difference in any other key is recorded for Rick's decision.

- [ ] **Step 4: Cloudflare pool health (read-only).** The CF token expires 2026-09-16 (Global Constraint 2). After that, read the pool in the dashboard and paste the result.
```bash
TOKEN=$(cat ~/.cf_api_token); ACCT=b69ef162d008b11492296d3b35cad2fe
curl -s -H "Authorization: Bearer $TOKEN" "https://api.cloudflare.com/client/v4/accounts/$ACCT/load_balancers/pools/1e3795c02e98b9506cfab578c9cb7c97/health" | python3 -c 'import sys,json;r=json.load(sys.stdin)["result"];print(all(v.get("healthy") for v in r["pop_health"].values()))'
```
  - Expected: `True`.

- [ ] **Step 5: The public surface is unchanged through Cloudflare (nginx still routes every marketing host to `:3000`).**
```bash
for h in portal.atxwashdryfold.com crhsent.com rundberglaundry.com runberglaundry.com atxwashdryfold.com atxwashateria.com; do printf '%s %s\n' "$h" "$(curl -s -o /dev/null -w '%{http_code}' "https://$h/?lh=$(date +%s)")"; done | tr '\n' ';'; echo; echo "$CF_CODES_BEFORE"
```
  - Expected: two identical lines — the same six codes Task 72 recorded (Plan 1 exit evidence: 5×200 + 1×301).

- [ ] **Step 6 (HUMAN-CONFIRM — Rick performs): gate-mail identity through Cloudflare (R-24; §9.1 P-8).** Both boxes now run A69 Task 57's gate mail code (`displayName` `CRHS Enterprises`, no From override) and the `no-reply@crhsent.com` login, so the request can land on either box.
  - From a device NOT on a whitelisted IP (e.g. a phone on cellular), Rick opens `https://crhsent.com/__gate`, enters his own email and the access password, and requests a link.
  - He does NOT click the link. Clicking would whitelist that IP.
  - Then:
```bash
sudo ssh wavemax-promo "cd /opt/mailcow-dockerized && docker compose logs --no-color --since 10m postfix-mailcow 2>&1 | grep -E 'from=<no-reply@crhsent.com>' | tail -3; echo '553-count:'; docker compose logs --no-color --since 10m postfix-mailcow 2>&1 | grep 'no-reply@crhsent.com' | grep -c ' 553 '"
```
  - Expected: at least one `from=<no-reply@crhsent.com>` line, then `553-count:` and `0`.
  - Rick confirms the received message shows all four:
    - From `CRHS Enterprises <no-reply@crhsent.com>`;
    - subject `Your CRHS Enterprises access link`;
    - a link starting `https://crhsent.com/__gate/confirm?token=`;
    - a loading logo from `https://crhsent.com/assets/images/brand/logo.png`.
  - Then run: `rec PARITY PASS; rec GATE_MAIL_IDENTITY "PASS rick $(date -u +%FT%TZ) From CRHS Enterprises <no-reply@crhsent.com>, link host crhsent.com, 0 553"`

- [ ] **Step 7 (HUMAN-CONFIRM): §9.1 P-16 — install the fallback cron on both boxes and drill the alert path (R-7; moved here from P0 Task 17 by R-1).**
  - Skip test: `grep -c '^P16_EXTERNAL_SERVICE=' "$REC"`. `1` → Q-12 named an external service; skip this step. `0` → continue.
  - Confirm with Rick: "Install /etc/cron.d/crhs-corporate-health on oci1 and oci2, send one test alert to admin@crhsent.com, then stop crhs-corporate on oci2 for up to 6 minutes so the cron reloads it and alerts?"
  - 7a — install on each box:
```bash
for ip in 161.153.71.201 144.24.4.202; do ssh -i ~/.ssh/oci_wavemax ubuntu@$ip 'set -e; test -f /var/www/crhs-corporate/scripts/ops/alert.js; sudo install -m 644 -o root -g root /var/www/crhs-corporate/deploy/cron/crhs-corporate-health /etc/cron.d/crhs-corporate-health; tail -n 1 /etc/cron.d/crhs-corporate-health'; done
```
    - Expected on each box: the `*/2 * * * * ubuntu curl -fsS --max-time 5 http://127.0.0.1:3001/health …` line ending in `pm2 reload issued"; }`.
    - Rollback: `for ip in 161.153.71.201 144.24.4.202; do ssh -i ~/.ssh/oci_wavemax ubuntu@$ip 'sudo rm -f /etc/cron.d/crhs-corporate-health'; done`
  - 7b — prove the alert path without an outage (sends ONE real mail to `admin@crhsent.com`):
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'cd /var/www/crhs-corporate && /usr/bin/node scripts/ops/alert.js "P-16 alert path test from $(hostname)"; echo exit=$?'
sudo ssh wavemax-promo "cd /opt/mailcow-dockerized && docker compose logs --no-color --since 10m postfix-mailcow 2>&1 | grep -E 'orig_to=<admin@crhsent.com>|from=<no-reply@crhsent.com>| 553 ' | tail -5"
```
    - Expected: `exit=0`; a `from=<no-reply@crhsent.com>` line and an `orig_to=<admin@crhsent.com>` line with `status=sent`; no ` 553 ` line.
  - 7b2 — prove a FAILED alert is diagnosable (sends no mail; no network I/O; added by the controller after the Task 17 review):
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'cd /var/www/crhs-corporate && grep -c "^EMAIL_PROVIDER=smtp$" .env; L=$(grep -E "^LOG_DIR=" .env | cut -d= -f2-)/combined.log; B=$(grep -c "ops alert failed: No sender address configured" "$L" || true); EMAIL_FROM= EMAIL_USER= timeout 20 /usr/bin/node scripts/ops/alert.js "P-16 failed-send probe"; echo exit=$?; A=$(grep -c "ops alert failed: No sender address configured" "$L" || true); echo delta=$((A-B))'
```
    - Expected: `1` (the box sends through SMTP — `EMAIL_PROVIDER=console` would make 7b's `exit=0` meaningless), then `exit=1`, then `delta=1` (exactly one new failure line in `$LOG_DIR/combined.log`). `exit=124` means the process hung → STOP.
    - The empty `EMAIL_FROM=`/`EMAIL_USER=` are set in the process environment, so dotenv does not override them; `sendEmail` throws before any SMTP connection.
  - 7c — the drill on oci2, in an agreed window (oci1 keeps crhsent.com served; the LB monitor fails oci2 over):
```bash
DRILL_TS=$(date -u +%FT%TZ); echo "DRILL_TS=$DRILL_TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@144.24.4.202 'pm2 stop crhs-corporate'
```
    - Within 6 minutes (3 cron intervals) the cron runs `/usr/bin/pm2 reload crhs-corporate` and `scripts/ops/alert.js`. After 6 minutes, prove delivery and ALWAYS restore:
```bash
sudo ssh wavemax-promo "cd /opt/mailcow-dockerized && docker compose logs --no-color --since 30m postfix-mailcow 2>&1 | grep 'orig_to=<admin@crhsent.com>' | grep -c 'status=sent'"
ssh -i ~/.ssh/oci_wavemax ubuntu@144.24.4.202 'S=$(pm2 jlist | python3 -c "import sys,json;print([p[\"pm2_env\"][\"status\"] for p in json.load(sys.stdin) if p[\"name\"]==\"crhs-corporate\"][0])"); [ "$S" = online ] || pm2 start crhs-corporate; sleep 5; curl -s -H "Host: crhsent.com" http://127.0.0.1:3001/health'
```
    - Expected: a count ≥ `2` (the 7b test alert plus the drill alert `crhs-corporate alert on <oci2 hostname>`), then `{"status":"ok"}`. Run the second command even when the count is short.
    - Rollback if `pm2 start` fails: `ssh -i ~/.ssh/oci_wavemax ubuntu@144.24.4.202 'cd /var/www/crhs-corporate && pm2 start ecosystem.config.js'`
  - Record: `rec P16_DRILL_DELIVERED "rick $DRILL_TS cron installed oci1+oci2; test alert + oci2 drill alert status=sent to admin@crhsent.com"`, and add the drill time, the alert receipt and the cron install to `production_systems_access.md` under `P-16`.

---

### Task 82: Lighthouse baseline on the dark content origin (R-8) — A11y/BP/SEO gate at 100, Performance informational

**Files:**
- Creates 16 JSON reports `/var/www/wavemax/cutover-logs/lighthouse/<host>-<home|affiliate>-<mobile|desktop>-<YYYY-MM-DD>.json` (oci1).
- Creates 2 JSON reports `/var/www/wavemax/cutover-logs/lighthouse/atxwashdryfold.com-home-<mobile|desktop>-oci2-<YYYY-MM-DD>.json`.
- Creates temporary `/tmp/lh-shim/` (removed in Step 7).

**Interfaces:**
- Consumes: `scripts/ops/lh-dark-origin-proxy.js` (Task 71); `scripts/ops/cutover-gate.sh` (Task 70); `S1LOG_oci1`, `S1LOG_oci2`, `D5_STATE`, `SEC_CONTACT`.
- Produces:
  - `LH_DATE`, `LH_RTT` in the record;
  - `MANUAL C14-baseline PASS …` in both S1 logs;
  - both boxes' S1 runs at `SUMMARY S1 fails=0 pending=0`.
- Nothing on a box changes. The SSH tunnel is a read-only local port forward.
- Declared deviation (R-8), in full:
  - The literal §5.12/§11.6 form `MAP <host> <box-ip>` would score nginx → `:3000`.
  - This path — Chrome → local HTTPS shim → WAN SSH tunnel → box `:3001` — has no nginx gzip and no HTTP/2.
  - Accessibility, Best Practices and SEO are network-independent and gate at 100 here.
  - Performance is printed and recorded, never thresholded.
  - The authoritative Performance comparison (C14: ≥ 95 mobile and desktop; per-host spread > 3 points blocks a flip) is Plan 3's: each host through Cloudflare, immediately before and after its flip.

- [ ] **Step 0: Load the record and set the date.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/phase0a-record.env
set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
GATE=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/scripts/ops/cutover-gate.sh
SHIM=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/scripts/ops/lh-dark-origin-proxy.js
D=$(date -u +%F); rec LH_DATE "$D"; OUT=$EV/lighthouse; ls -ld "$OUT"
```

- [ ] **Step 1: Measure the tunnel RTT, open the tunnel to oci1, start the shim, and prove it reaches the NEW `:3001`.**
```bash
TIMEFORMAT=%R; RTT=$(for i in 1 2 3; do { time ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 true; } 2>&1; done | sort -n | sed -n 2p); rec LH_RTT "$RTT"; echo "rtt=$RTT"
mkdir -p /tmp/lh-shim && openssl req -x509 -newkey rsa:2048 -nodes -keyout /tmp/lh-shim/k.pem -out /tmp/lh-shim/c.pem -subj /CN=atxwashdryfold.com -days 1 2>/dev/null
ssh -i ~/.ssh/oci_wavemax -f -N -o ExitOnForwardFailure=yes -L 13001:127.0.0.1:3001 ubuntu@161.153.71.201
node "$SHIM" --listen 18443 --upstream 127.0.0.1:13001 --cert /tmp/lh-shim/c.pem --key /tmp/lh-shim/k.pem &
sleep 1
curl -sk --resolve atxwashdryfold.com:18443:127.0.0.1 "https://atxwashdryfold.com:18443/health"; echo
curl -sk --resolve atxwashdryfold.com:18443:127.0.0.1 "https://atxwashdryfold.com:18443/?lh=$(date +%s)" | grep -o '<link rel="canonical" href="https://atxwashdryfold.com/">'
```
  - Expected: `rtt=<seconds>`, then `lh shim on 127.0.0.1:18443`, `{"status":"ok"}` (the affiliate on `:3000` answers `{"status":"UP",…}`), and `<link rel="canonical" href="https://atxwashdryfold.com/">`.

- [ ] **Step 2: The 16 oci1 measurements (4 hosts × 2 pages × 2 form factors).**
```bash
for H in rundberglaundry.com runberglaundry.com atxwashateria.com atxwashdryfold.com; do
  for P in "" affiliate; do
    N=${P:-home}
    CHROME_PATH=/opt/google/chrome/chrome npx --yes lighthouse "https://$H/$P?lh=$(date +%s)" --preset=desktop --output=json --output-path="$OUT/$H-$N-desktop-$D.json" --chrome-flags="--headless=new --no-sandbox --disable-dev-shm-usage --host-resolver-rules=\"MAP $H 127.0.0.1:18443\" --ignore-certificate-errors" --quiet
    CHROME_PATH=/opt/google/chrome/chrome npx --yes lighthouse "https://$H/$P?lh=$(date +%s)" --form-factor=mobile --screenEmulation.mobile=true --output=json --output-path="$OUT/$H-$N-mobile-$D.json" --chrome-flags="--headless=new --no-sandbox --disable-dev-shm-usage --host-resolver-rules=\"MAP $H 127.0.0.1:18443\" --ignore-certificate-errors" --quiet
  done
done
ls "$OUT" | grep -cE "^[a-z.]+\.com-(home|affiliate)-(mobile|desktop)-$D\.json$"
```
  - Expected: `16`.

- [ ] **Step 3: Apply the gate — Accessibility, Best Practices and SEO exactly 100; Performance printed as informational; failing audit ids named.**
```bash
node -e '
const fs=require("fs"),dir=process.argv[1],d=process.argv[2],suffix=process.argv[3];
const re=new RegExp("^[a-z.]+\\.com-(home|affiliate)-(mobile|desktop)-"+suffix+d+"\\.json$");
const files=fs.readdirSync(dir).filter((f)=>re.test(f)).sort();
let fail=0;
for(const f of files){
  const j=JSON.parse(fs.readFileSync(dir+"/"+f,"utf8"));const c=j.categories;const s=(k)=>Math.round(c[k].score*100);
  const ok=s("accessibility")===100&&s("best-practices")===100&&s("seo")===100;
  const bad=ok?"":" failing="+["accessibility","best-practices","seo"].flatMap((k)=>c[k].auditRefs.filter((r)=>r.weight>0&&j.audits[r.id].score!==null&&j.audits[r.id].score<1).map((r)=>k+":"+r.id)).join(",");
  console.log((ok?"PASS ":"FAIL ")+f+" a11y="+s("accessibility")+" bp="+s("best-practices")+" seo="+s("seo")+" perf_informational="+s("performance")+bad);
  if(!ok)fail++;
}
console.log("files "+files.length);process.exit(fail?1:0)' "$OUT" "$D" "" | tee "$EV/lh-gate-oci1.txt"; echo "exit=${PIPESTATUS[0]}"
```
  - Expected: 16 lines starting `PASS `, then `files 16`, then `exit=0`.
  - Any `FAIL` line names its failing audit ids. That is a Phase 0a exit blocker: the fix lands as a corporate PR, followed by a redeploy through Tasks 73–80 on both boxes.
  - If the only failing audit on `rundberglaundry.com`, `runberglaundry.com` or `atxwashateria.com` is `seo:canonical`, STOP and escalate to the controller. That would be a conflict between D1 (one canonical host) and C14's absolute SEO 100 on all four hosts; it is not a content defect to patch here.

- [ ] **Step 4: oci2 spot-check — tunnel to oci2, `atxwashdryfold.com/` on both form factors.**
```bash
pkill -f 'lh-dark-origin-proxy.js --listen 18443'; pkill -f 'ssh -i .*oci_wavemax -f -N -o ExitOnForwardFailure=yes -L 13001'; sleep 1
ssh -i ~/.ssh/oci_wavemax -f -N -o ExitOnForwardFailure=yes -L 13001:127.0.0.1:3001 ubuntu@144.24.4.202
node "$SHIM" --listen 18443 --upstream 127.0.0.1:13001 --cert /tmp/lh-shim/c.pem --key /tmp/lh-shim/k.pem &
sleep 1; curl -sk --resolve atxwashdryfold.com:18443:127.0.0.1 "https://atxwashdryfold.com:18443/health"; echo
H=atxwashdryfold.com
CHROME_PATH=/opt/google/chrome/chrome npx --yes lighthouse "https://$H/?lh=$(date +%s)" --preset=desktop --output=json --output-path="$OUT/$H-home-desktop-oci2-$D.json" --chrome-flags="--headless=new --no-sandbox --disable-dev-shm-usage --host-resolver-rules=\"MAP $H 127.0.0.1:18443\" --ignore-certificate-errors" --quiet
CHROME_PATH=/opt/google/chrome/chrome npx --yes lighthouse "https://$H/?lh=$(date +%s)" --form-factor=mobile --screenEmulation.mobile=true --output=json --output-path="$OUT/$H-home-mobile-oci2-$D.json" --chrome-flags="--headless=new --no-sandbox --disable-dev-shm-usage --host-resolver-rules=\"MAP $H 127.0.0.1:18443\" --ignore-certificate-errors" --quiet
```
  - Expected: `lh shim on 127.0.0.1:18443`, `{"status":"ok"}`, and two report files written.

- [ ] **Step 5: Apply the same gate to the two oci2 files.**
```bash
node -e '
const fs=require("fs"),dir=process.argv[1],d=process.argv[2];
const files=fs.readdirSync(dir).filter((f)=>f==="atxwashdryfold.com-home-desktop-oci2-"+d+".json"||f==="atxwashdryfold.com-home-mobile-oci2-"+d+".json").sort();
let fail=0;
for(const f of files){const c=JSON.parse(fs.readFileSync(dir+"/"+f,"utf8")).categories;const s=(k)=>Math.round(c[k].score*100);const ok=s("accessibility")===100&&s("best-practices")===100&&s("seo")===100;console.log((ok?"PASS ":"FAIL ")+f+" a11y="+s("accessibility")+" bp="+s("best-practices")+" seo="+s("seo")+" perf_informational="+s("performance"));if(!ok)fail++;}
console.log("files "+files.length);process.exit(fail||files.length!==2?1:0)' "$OUT" "$D" | tee "$EV/lh-gate-oci2.txt"; echo "exit=${PIPESTATUS[0]}"
```
  - Expected: 2 `PASS` lines, `files 2`, `exit=0`.

- [ ] **Step 6: Attest `C14-baseline` into both S1 logs, then re-run the S1 script on both boxes.**
```bash
for B in oci1 oci2; do
  V=S1LOG_$B; L=${!V}
  bash "$GATE" --attest C14-baseline --by rick --evidence "dark-origin Lighthouse $D: oci1 16/16 A11y/BP/SEO=100, oci2 spot 2/2; Performance informational (R-8), tunnel rtt ${LH_RTT}s" --log "$L"
done
for pair in "oci1 161.153.71.201" "oci2 144.24.4.202"; do set -- $pair
  V=S1LOG_$1; L=${!V}
  ATT=$(grep -oP '^MANUAL \K\S+(?= PASS )' "$L" | sort -u | tr '\n' ' ')
  ssh -i ~/.ssh/oci_wavemax ubuntu@$2 "GATE_ATTESTED='$ATT' GATE_D5='$D5_STATE' GATE_SECURITY_CONTACT='$SEC_CONTACT' bash -s -- --stage S1 --on-box" < "$GATE" | tee -a "$L" | grep -E '^(FAIL|MANUAL|SUMMARY)'; echo "$1 exit=${PIPESTATUS[0]}"
done
```
  - Expected: `SUMMARY S1 fails=0 pending=0` then `oci1 exit=0`, and `SUMMARY S1 fails=0 pending=0` then `oci2 exit=0`. There are no `FAIL` or `MANUAL` lines.

- [ ] **Step 7: Teardown.**
```bash
pkill -f 'lh-dark-origin-proxy.js --listen 18443'; pkill -f 'ssh -i .*oci_wavemax -f -N -o ExitOnForwardFailure=yes -L 13001'; rm -rf /tmp/lh-shim
ss -ltn | grep -cE ':(13001|18443) '
```
  - Expected: `0`.

---

### Task 83: Record "Content origin baseline (2026-09)" in `LIGHTHOUSE-QUALITY-BAR.md` (§11.6 steps 0 and 5) and the Phase 0a record in `tasks/todo.md`

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/docs/development/LIGHTHOUSE-QUALITY-BAR.md`
  - `:20` and `:25` — the `https://rundberglaundry.com/?lh=` measure examples become per-host content-origin examples;
  - `:42-43` — the "prove the new code is live" example;
  - `:60-62` — the reload note gains `pm2 reload crhs-corporate`;
  - `:122-132` — the "Current baseline (rundberglaundry.com landing, 2026-05-24)" section is RETIRED and replaced.
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tasks/todo.md`
  - `:298`, `:302`, `:303`, `:305` — the D-1 checkboxes;
  - a "Plan 2 Phase 0a record" section inserted above `### D-2.` (`:311`).

**Interfaces:**
- Consumes: the Task 82 JSON reports; `LH_DATE`, `LH_RTT`, `WC_TAG_COMMIT`, `CORP_SHA`, `BOX_0A_DONE_oci1`, `BOX_0A_DONE_oci2`, `PARITY`, `S1LOG_oci1`, `S1LOG_oci2`.
- Produces: the committed table Plan 3's per-host flips compare against (A11y/BP/SEO), and the PASS/FAIL summary. No raw evidence, token or mail content is committed (§10.4).
- Line numbers were read on 2026-09-13. The script asserts the content at each line before editing and applies edits bottom-up, so earlier edits never shift later targets. If an assertion fails, STOP, re-read the file, and locate the target by content.

- [ ] **Step 1: Rewrite `LIGHTHOUSE-QUALITY-BAR.md` from the measured reports. Every row is generated from a JSON file; no row is typed by hand.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git pull --ff-only --quiet
EV=/var/www/wavemax/cutover-logs; REC=$EV/phase0a-record.env; set -a; . "$REC"; set +a
python3 - "$EV/lighthouse" "$LH_DATE" "$LH_RTT" docs/development/LIGHTHOUSE-QUALITY-BAR.md <<'PY'
import json, os, re, sys
lhdir, date, rtt, doc = sys.argv[1:5]
lines = open(doc, encoding='utf-8').read().split('\n')
order = {'rundberglaundry.com': 0, 'runberglaundry.com': 1, 'atxwashateria.com': 2, 'atxwashdryfold.com': 3}
pat = re.compile(r'^([a-z.]+\.com)-(home|affiliate)-(mobile|desktop)-' + re.escape(date) + r'\.json$')
found = sorted((order[m.group(1)], m.group(2) != 'home', m.group(3), m.group(1), m.group(2), f)
               for f in os.listdir(lhdir) for m in [pat.match(f)] if m)
assert len(found) == 16, len(found)
rows = []
for _, _, ff, host, page, f in found:
    c = json.load(open(os.path.join(lhdir, f), encoding='utf-8'))['categories']
    s = {k: round(c[k]['score'] * 100) for k in ('performance', 'accessibility', 'best-practices', 'seo')}
    assert s['accessibility'] == 100 and s['best-practices'] == 100 and s['seo'] == 100, (f, s)
    rows.append('| %s | %s | %s | %d | %d | %d | %d |' % (host, '/' if page == 'home' else '/affiliate', ff,
                s['accessibility'], s['best-practices'], s['seo'], s['performance']))
# :122-132 — retire the 2026-05-24 franchise-landing baseline
assert lines[121] == '## Current baseline (rundberglaundry.com landing, 2026-05-24)', lines[121]
assert lines[131] == 'disabled (see SEO section).', lines[131]
lines[121:132] = [
    '## Content origin baseline (2026-09)',
    '',
    'Measured on %s in Plan 2 Phase 0a on the DARK content origin (`crhs-corporate` :3001): oci1 all 16 runs,' % date,
    'oci2 `atxwashdryfold.com/` spot-checked. Path: `--host-resolver-rules="MAP <host> 127.0.0.1:18443"',
    '--ignore-certificate-errors` -> `scripts/ops/lh-dark-origin-proxy.js` -> ssh tunnel -> box :3001 (the literal',
    '`MAP <host> <box-ip>` would have measured nginx -> :3000 while the hosts were unflipped).',
    '',
    '- **Gating (C14): Accessibility 100, Best Practices 100, SEO 100** on `/` and `/affiliate`, mobile and desktop,',
    '  on all four marketing hosts. These categories do not depend on the network path.',
    '- **Performance below is informational** (declared deviation, controller ruling R-8): the tunnel adds WAN',
    '  latency (median `ssh ... true` %s s) and the shim has no nginx gzip or HTTP/2. The authoritative Performance' % rtt,
    '  gate (C14: >= 95 mobile and desktop; a per-host spread > 3 points blocks that host\'s flip) is measured in',
    '  Plan 3 through Cloudflare, immediately before and immediately after each host\'s flip, with the commands above.',
    '',
    '| Host | Page | Form factor | Accessibility | Best Practices | SEO | Performance (informational) |',
    '|---|---|---|---|---|---|---|',
] + rows + [
    '',
    'The 2026-05-24 "Current baseline (rundberglaundry.com landing)" table measured the Phase-4b-retired franchise',
    'landing (iframe- and third-party-bound, not `partner-program.html`) and is RETIRED: it is not a threshold for',
    'any page.',
]
# :60-62 — the reload note
assert lines[59].startswith('3. **`pm2 reload wavemax` on BOTH boxes if you touched a server-rendered template**'), lines[59]
assert lines[61].startswith('   Pure `express.static` assets don'), lines[61]
lines[59:62] = [
    '3. **`pm2 reload wavemax` on BOTH boxes if you touched a server-rendered portal template**, and',
    '   **`pm2 reload crhs-corporate --update-env` on BOTH boxes after any change under `crhs-corporate/server/`**',
    '   (the marketing hosts\' pages are served by the content app on :3001, delivered by rsync, not `git pull`).',
    '   Pure `express.static` assets don\'t need a reload. See `tasks/lessons.md`.',
]
# :42-43 — prove the new code is live
old42 = 'curl -s "https://rundberglaundry.com/?lh=$(date +%s)" -o /tmp/p.html'
assert lines[41] == old42, lines[41]
lines[41] = 'curl -s "https://$H/?lh=$(date +%s)" -o /tmp/p.html'
assert lines[42].startswith('grep -o "wavemax-mhr-chrome.css?v=[0-9a-z]*" /tmp/p.html'), lines[42]
lines[42] = lines[42].replace('wavemax-mhr-chrome.css', 'partner-program.css')
# :20, :25 — the measure commands, plus a two-line header above "# Desktop" (:19)
old = '"https://rundberglaundry.com/?lh=$(date +%s)"'
for i in (24, 19):
    assert old in lines[i], lines[i]
    lines[i] = lines[i].replace(old, '"https://$H/$PAGE?lh=$(date +%s)"')
assert lines[18] == '# Desktop', lines[18]
lines[18:18] = [
    '# H = rundberglaundry.com | runberglaundry.com | atxwashateria.com | atxwashdryfold.com; PAGE = "" (partner page) or "affiliate".',
    '# These pages are served by crhs-corporate :3001 (see "Content origin baseline (2026-09)" for the pre-flip dark-origin form).',
]
open(doc, 'w', encoding='utf-8').write('\n'.join(lines))
print('rows', len(rows))
PY
grep -c 'Content origin baseline (2026-09)' docs/development/LIGHTHOUSE-QUALITY-BAR.md
grep -cE '^\| (rundberglaundry|runberglaundry|atxwashateria|atxwashdryfold)\.com \| (/|/affiliate) \| (mobile|desktop) \| 100 \| 100 \| 100 \| [0-9]+ \|$' docs/development/LIGHTHOUSE-QUALITY-BAR.md
grep -c 'rundberglaundry.com/?lh=\|Current baseline (rundberglaundry.com landing' docs/development/LIGHTHOUSE-QUALITY-BAR.md
grep -c 'pm2 reload crhs-corporate --update-env' docs/development/LIGHTHOUSE-QUALITY-BAR.md
```
  - Expected: `rows 16`; then `2` (the section heading plus the reference in the new header comment); `16`; `1` (the retirement sentence still names the old table); `1`.

- [ ] **Step 2: Commit the doc (scores only, never the raw JSON — §10.4).**
  - Command: `git add docs/development/LIGHTHOUSE-QUALITY-BAR.md && git commit -m "docs(lighthouse): Content origin baseline (2026-09) from the Phase 0a dark origin; retire the 2026-05-24 franchise-landing table" -m "A11y/BP/SEO gate at 100; Performance informational per ruling R-8 (tunnel path); the authoritative Performance comparison is taken in Plan 3 through Cloudflare before/after each flip." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git push`

- [ ] **Step 3: Tick D-1 and insert the Phase 0a record into `tasks/todo.md`. Every value is read from the record file and the S1 logs.**
```bash
python3 - tasks/todo.md <<'PY'
import os, re, sys
p = sys.argv[1]; t = open(p, encoding='utf-8').read(); e = os.environ
for old in ['- [ ] **B3g** — parameterise', '- [ ] **B3j** — export `validateMailConfig()`.', '- [ ] **B3k** — `assets/js/i18n.js`:', '- [ ] **The guard that goes with them** —']:
    assert t.count(old) == 1, old
    t = t.replace(old, old.replace('- [ ]', '- [x]', 1))
summ = {}
for box in ('oci1', 'oci2'):
    last = [l for l in open(e['S1LOG_' + box], encoding='utf-8') if l.startswith('SUMMARY S1 ')][-1].strip()
    assert last == 'SUMMARY S1 fails=0 pending=0', (box, last)
    summ[box] = last
assert e['PARITY'] == 'PASS' and e['GATE_MAIL_IDENTITY'].startswith('PASS')
anchor = '### D-2. Affiliate PR B7 (rate-limit adoption) → Plan 4'
assert t.count(anchor) == 1
block = '\n'.join([
    '### Plan 2 Phase 0a record (%s)' % e['BOX_0A_DONE_oci2'][:10],
    '',
    '- D-1 B3g / B3j / B3k and the repo-wide `tests/brandNeutral.test.js` shipped in `@crhs/web-core` v0.2.1 (tag commit `%s`), deployed oci1 %s and oci2 %s.' % (e['WC_TAG_COMMIT'], e['BOX_0A_DONE_oci1'], e['BOX_0A_DONE_oci2']),
    '- crhs-corporate `%s` live DARK on :3001 on both boxes; nginx unchanged, the marketing hosts still reach :3000.' % e['CORP_SHA'],
    '- S1 gate: oci1 `%s`; oci2 `%s`.' % (summ['oci1'], summ['oci2']),
    '- Cross-box parity 20/20 SAME; one normalized body across the four marketing hosts; identical installs and corporate `.env`.',
    '- Lighthouse dark-origin baseline %s: 16/16 Accessibility/Best Practices/SEO = 100; Performance informational (ruling R-8) — `docs/development/LIGHTHOUSE-QUALITY-BAR.md`.' % e['LH_DATE'],
    '- F-1 closed: 0 `access-control-allow-origin` for `http://localhost:3000` / `https://wavemax.promo` on crhsent.com, the four marketing hosts and the portal. F-2 closed: `CORPORATE_SITE_URL` deleted.',
    '- `LOG_DIR` absolute in all four `.env` files; corporate log lines tagged `crhs-corporate`; gate mail sends as `"CRHS Enterprises" <no-reply@crhsent.com>`.',
    '- Corporate session cookie `__Host-crhsent.sid` + `sessions_corporate`; nobody logged out (0 `req.session` references, ruling R-10).',
    '- Still open: D-2 (Plan 4 PR B7). D-3 DONE 2026-09-11 (web-core `d2725e7`, affiliate `a37dc497`).',
    '', ''])
t = t.replace(anchor, block + anchor)
open(p, 'w', encoding='utf-8').write(t)
print('todo updated')
PY
grep -c '^- \[x\] \*\*B3[gjk]\*\*\|^- \[x\] \*\*The guard that goes with them\*\*' tasks/todo.md; grep -c '^### Plan 2 Phase 0a record (' tasks/todo.md
```
  - Expected: `todo updated`, `4`, `1`.

- [ ] **Step 4: Commit the record.**
  - Command: `git add tasks/todo.md && git commit -m "docs(todo): Plan 2 Phase 0a record — web-core v0.2.1 + crhs-corporate multi-host DARK on :3001, both boxes; D-1 closed" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git push`

---

### Task 84: [per box] **HUMAN-CONFIRM** — Phase 0a rollback runbook (run only when a step says STOP)

**Files:** box only — `/var/www/crhs-web-core/`, `/var/www/crhs-corporate/` (code and `.env`), `/var/www/wavemax/wavemax-affiliate-program/.env`, both `node_modules/@crhs/web-core`.

**Interfaces:**
- Consumes (record, for THIS box): `TS_<box>`, `PM2ENV_AFF_<box>`, `PM2ENV_CORP_<box>`, `CF_CODES_BEFORE`; plus the snapshots and backups from Task 74 Step 2.
- Produces: this box back at the Plan 1 exit state:
  - core `0.2.0` in both consumers;
  - corporate on its pre-deploy tree and `.env`;
  - portal `.env` restored;
  - crhsent.com on `__Host-wavemax.sid`.

**Scope and order.**
- Roll back only the failing box. The CF LB keeps the other box serving.
- If oci1 fails, oci2 is never touched.
- Order matters because the affiliate and web-core are a bidirectional boot-breaker pair: (1) restore trees and `.env`; (2) reinstall both consumers; (3) gate + boot probes; (4) reload affiliate, then corporate; (5) verify. No `pm2 reload` happens before the gate passes.
- If oci2 fails AFTER oci1 signed off, roll back oci2 with this runbook, then ask Rick whether to roll back oci1 too (same runbook with `BOX=oci1; IP=161.153.71.201`). A mixed pair is safe but inconsistent:
  - the crhsent.com cookie base and gate-mail identity differ per LB hop — harmless to users per R-10;
  - `ratelimit_corp_*` counters apply on only one box.
- `sessions_corporate` and every `ratelimit_corp_*` collection stay in place. Never `drop()` on ADB.
- The rollback restores the `no-reply@wavemax.promo` login together with the old gate From code; the two only work as a pair.

- [ ] **Step 0: Set the box and load its recorded values (expanded on the workstation).**
```bash
BOX=oci1; IP=161.153.71.201        # the box being rolled back (oci2: BOX=oci2; IP=144.24.4.202)
EV=/var/www/wavemax/cutover-logs; REC=$EV/phase0a-record.env; set -a; . "$REC"; set +a
V=TS_$BOX; TS=${!V}; V=PM2ENV_AFF_$BOX; PM2ENV_AFF=${!V}; V=PM2ENV_CORP_$BOX; PM2ENV_CORP=${!V}
test -n "$TS" && echo "TS=$TS PM2ENV_AFF=$PM2ENV_AFF PM2ENV_CORP=$PM2ENV_CORP"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "ls -l ~/deploy-snapshots/crhs-web-core-$TS.tgz ~/deploy-snapshots/crhs-corporate-$TS.tgz /var/www/crhs-corporate-env-backups/.env.$TS /var/www/wavemax/env-backups/.env.$TS | wc -l"
```
  - Expected: `TS=<value> PM2ENV_AFF=<…> PM2ENV_CORP=<…>`, then `4`.
  - If `TS` is empty, Task 74 Step 2 never ran: nothing on this box changed, so there is nothing to roll back.

- [ ] **Step 1 (HUMAN-CONFIRM): Restore the web-core and corporate trees and both `.env` files from the pre-deploy snapshot.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
R=\$(mktemp -d)
tar -C \"\$R\" -xzf ~/deploy-snapshots/crhs-web-core-$TS.tgz
tar -C \"\$R\" -xzf ~/deploy-snapshots/crhs-corporate-$TS.tgz
rsync -a --delete --exclude node_modules --exclude .git --exclude logs --exclude coverage \"\$R/crhs-web-core/\" /var/www/crhs-web-core/
rsync -a --delete --exclude node_modules --exclude .git --exclude logs --exclude .env \"\$R/crhs-corporate/\" /var/www/crhs-corporate/
rm -rf \"\$R\"
cat /var/www/crhs-corporate-env-backups/.env.$TS > /var/www/crhs-corporate/.env
cat /var/www/wavemax/env-backups/.env.$TS > /var/www/wavemax/wavemax-affiliate-program/.env
node -p 'require(\"/var/www/crhs-web-core/package.json\").version'
grep -c '^CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000,https://wavemax.promo\$' /var/www/crhs-corporate/.env /var/www/wavemax/wavemax-affiliate-program/.env"
```
  - Expected: `0.2.0`, `/var/www/crhs-corporate/.env:1`, `/var/www/wavemax/wavemax-affiliate-program/.env:1`.

- [ ] **Step 2 (HUMAN-CONFIRM): Reinstall both consumers against the restored tree — `rm -rf` is mandatory.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/wavemax/wavemax-affiliate-program && rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund 2>&1 | tail -2'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate && rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund 2>&1 | tail -2'
```
  - Expected: two npm summaries with no `npm ERR!`.

- [ ] **Step 3: Gate and boot probes before any reload.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'for d in /var/www/wavemax/wavemax-affiliate-program /var/www/crhs-corporate; do cd "$d" && echo "$d $(node -p "require(\"@crhs/web-core/package.json\").version") $(node -p "Object.keys(require(\"@crhs/web-core\")).length") $(node -p "Object.keys(require(\"@crhs/web-core\").csrf).includes(\"createCsrf\")") $(node -p "require.resolve(\"mongoose\",{paths:[require.resolve(\"@crhs/web-core\")]})===require.resolve(\"mongoose\")")" && node -e "try{require(\"./server.js\");console.log(\"BOOT_OK\");process.exit(0)}catch(e){console.log(e.message);process.exit(1)}"; done'
```
  - Expected: `/var/www/wavemax/wavemax-affiliate-program 0.2.0 26 true true`, `BOOT_OK`, `/var/www/crhs-corporate 0.2.0 26 true true`, `BOOT_OK`.
  - If this fails, do NOT reload. The running workers still hold the last good code in memory. Escalate to Rick with the output.

- [ ] **Step 4 (HUMAN-CONFIRM): Reload the affiliate, then corporate, in the mode the deploy used.**
```bash
if [ "$PM2ENV_AFF" = NONE ]; then ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 reload wavemax --update-env'; else ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/wavemax/wavemax-affiliate-program && pm2 delete wavemax && PM2_APP_NAME=wavemax pm2 start ecosystem.config.js && pm2 save'; fi
sleep 10
if [ "$PM2ENV_CORP" = NONE ]; then ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 reload crhs-corporate --update-env'; else ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate && pm2 delete crhs-corporate && pm2 start ecosystem.config.js && pm2 save'; fi
sleep 15
```
  - Expected: pm2's reload/start output for each app, with no error.

- [ ] **Step 5: Verify the Plan 1 exit state on the box and through Cloudflare.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'curl -s -o /dev/null -w "portal-health %{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health; curl -s -o /dev/null -w "health-origin %{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health/origin; curl -s -o /dev/null -w "crhsent %{http_code}\n" -H "Host: crhsent.com" http://127.0.0.1:3001/; curl -s -o /dev/null -w "services %{http_code}\n" -H "Host: crhsent.com" http://127.0.0.1:3001/services; curl -s -D - -o /dev/null -H "Host: crhsent.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3001/ | grep -io "^set-cookie: __Host-[a-z.]*sid"'
for h in portal.atxwashdryfold.com crhsent.com rundberglaundry.com runberglaundry.com atxwashdryfold.com atxwashateria.com; do printf '%s %s\n' "$h" "$(curl -s -o /dev/null -w '%{http_code}' "https://$h/?lh=$(date +%s)")"; done | tr '\n' ';'; echo; echo "$CF_CODES_BEFORE"
```
  - Expected: `portal-health 200`, `health-origin 200`, `crhsent 200`, `services 401`, `Set-Cookie: __Host-wavemax.sid`, then two identical `…;` lines.
  - Record the rollback: `printf 'ROLLED_BACK_%s=%q\n' "$BOX" "$(date -u +%FT%TZ)" >> "$REC"`.

---

### Phase 0a EXIT CRITERIA — Plan 3 depends on every line

Plan 3's first nginx flip (`runberglaundry.com`, oci1) may not start until every item below is recorded under `/var/www/wavemax/cutover-logs/` and the Task 83 commits are pushed. The commits carry only PASS/FAIL lines and scores: no raw evidence, tokens or mail output.

1. **Both boxes on the Phase 0a build.** On oci1 and oci2, in `/var/www/crhs-corporate` AND `/var/www/wavemax/wavemax-affiliate-program`:
   - installed `@crhs/web-core` = `0.2.1`, 26 export keys, `createCsrf` present, a real directory (not a symlink);
   - mongoose resolution-path identity `true`;
   - `/var/www/crhs-web-core` = `0.2.1`;
   - corporate tree = `CORP_SHA` (delivered by rsync);
   - affiliate HEAD = `AFF_SHA`, unchanged. If `AFF_LOCK_DIRTY_<box>=yes`, Plan 3's first `git pull --ff-only` on that box runs `git -C /var/www/wavemax/wavemax-affiliate-program checkout -- package-lock.json` first.
2. **Production env (Task 74, Task 81 Step 3).**
   - Corporate `.env` holds exactly the Global Constraint 6 keys, identical across boxes; no `CORS_ORIGIN`, no `CORPORATE_SITE_URL`, no `FRONTEND_URL`.
   - The portal `CORS_ORIGIN` is `https://portal.atxwashdryfold.com`. Plan 3 must never delete or empty it (`server.js:293-295`).
   - `LOG_DIR` is absolute in all four `.env` files.
   - pm2 holds no `.env` key for either app (Task 75 Step 10: `NONE`).
3. **Boot health (Tasks 76, 80), both boxes.**
   - Corporate `combined.log` since the reload: `crhs-corporate listening on 3001` × 2, `SystemConfig seeded` × 2, 0 `Access gate cache load failed`, 0 `refusing to start`, service `crhs-corporate`.
   - Affiliate `combined.log`: `Server running on port 3000 in production mode` × `N_AFF`, 0 `ORA-04036`, 0 `buffering timed out`, service `crhs-portal`.
   - §10.3 P2 and P3 identity `true`; crhsent `/services` → `401`; `/health/origin` → `200`.
   - pm2 `restart_time` identical at T and T+15 min for both apps.
4. **S1 gate (§10.0), both boxes.** The last line of each S1 log is `SUMMARY S1 fails=0 pending=0`, with these MANUAL cells attested: C5-contact, C6-mail, C13-click, C14-baseline, P1, P2, P3, P8, P13, P14, R2-cors. This covers:
   - C1–C13 `--on-box` for the four marketing hosts;
   - R6/R7/R8;
   - the C9b spoof (0 `Set-Cookie`, R-9);
   - R-3's forged-`X-Forwarded-Host` probes (`/wavemax/` → mediator prompt, `/README.md` → 401);
   - the §9.2 static checks.
5. **Security findings closed on the live env.**
   - F-1 (CORS: 12 × `0` + the portal's inline origin still admitted).
   - F-2 (`CORPORATE_SITE_URL` gone).
   - F-9 / Global Constraint 20 (a forged `X-Forwarded-Host` never steers a gate; 0 non-comment `req.hostname` / `x-forwarded-host` in corporate `server/`).
6. **Mail (Task 78, Task 81 Step 6).**
   - One valid intake POST per box delivered (`status=sent`, From `"WaveMAX Austin" <no-reply@crhsent.com>`, Reply-To = the lead on the notification and the recipient on the thank-you, absolute logo, 0 placeholders).
   - Four failing payloads per box → `400` with resolvable `partner.form.err*` codes.
   - Gate mail sends as `"CRHS Enterprises" <no-reply@crhsent.com>` with 0 `553`.
   - §10.3 P1's staging refusal (`P1_REFUSE`) recorded.
   - §9.1 P-16: `P16_DRILL_DELIVERED` recorded by Task 81 Step 7 (cron installed on both boxes; the test alert and the oci2 drill alert `status=sent` to `admin@crhsent.com`), or `P16_EXTERNAL_SERVICE` recorded (Q-12).
7. **Database (Task 79).** `ratelimit_corp_api` / `ratelimit_corp_contact_*` created only by `:3001` traffic; `ratelimit_api`, `ratelimit_contact_hourly` and `sessions` hold no key or session minted by `:3001`; crhsent.com sessions land in `sessions_corporate`.
8. **Consistency (Task 81).** 20/20 SAME across boxes; one tree across the four marketing hosts; the pool is healthy; the six hostnames through Cloudflare answer exactly `CF_CODES_BEFORE`. On each box the A15 Task 20 byte baseline differs only at `/owners/` (`12c12`, the A69 Task 57 alt text — Task 77 Step 3b).
9. **Lighthouse (Tasks 82–83).** 16/16 dark-origin runs at A11y/BP/SEO = 100 on oci1, 2/2 on oci2; "Content origin baseline (2026-09)" committed, with Performance marked informational.
10. **Carried into Plan 3 — NOT closed by Phase 0a:**
    - C8b (forged `CF-Connecting-IP` inert) and every `--via-box` / `--via-cf` cell (S3).
    - §10.3 P7 (nginx) and P11 (Cloudflare purge).
    - §10.3 P12 = §9.1 P-11: the device checklist before the `rundberglaundry.com` flip (unless `P11_DEVICES_SIGNED` is already recorded), then the `EXPEDITER_TOKEN` rotation in that step's window.
    - C7's SMS completion on a real 301'd label (and with it P14's Firebase proof).
    - **The authoritative Lighthouse Performance comparison (R-8):** each host through Cloudflare immediately before and immediately after its flip; C14 ≥ 95 mobile and desktop; per-host spread ≤ 3.
    - **nginx `proxy_set_header X-Forwarded-Host $host;`** as defence in depth (R-3 item 7).
    - §10.3 P6 / G1 and P16 re-checks at S3. The Cloudflare API token expires **2026-09-16**.
    - §9.1 P-13 (`pickups@atxwashdryfold.com` goto read by a human) must hold before the public form host flips (F-7).
    - D5 (`/wavemax-affiliate` → `/affiliate`) PENDING COUNSEL, non-blocking.
    - §5.12 security.txt, handed over by A15: the marketing `Policy:` line byte-equal to the portal file's `Policy:` line, and `https://portal.atxwashdryfold.com/privacy-policy` → `200` — both only after spec §6.9 lands on the portal (its `public/.well-known/security.txt` still reads `…/privacy-policy.html`, and Phase 0a pulls no affiliate code).
    - `INTEREST_FORM_URL=https://atxwashdryfold.com/affiliate` at cutover (Global Constraint 8).
11. **Deferred work, still open unless shipped:**
    - D-1 closes with this deploy (Task 83 ticks B3g/B3j/B3k and the repo-wide guard).
    - D-2 (affiliate PR B7 — the admin "reset rate limits" control still targets the non-existent `rate_limits` collection) stays in Plan 4.
    - D-3 is DONE (web-core `d2725e7`, affiliate `a37dc497`).
    - D-4 (affiliate ESLint cleanup — 208 pre-existing `server/` errors, held at no-increase in Plan 2, R-16) stays in Plan 4.
    - Backlog B-2 (i18n of `/affiliate`; C13 is N/A there) stays owner-scheduled.
    - F-4's `Access gate cache loaded` noise (demote to `debug`) is a later hygiene PR.
