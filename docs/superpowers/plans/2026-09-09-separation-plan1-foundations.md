# Plan 1 — Dependency topology, `@crhs/web-core` v0.2.0, and cutover gates G1 / G2

> **Agentic-worker note (mandatory, applies to every task in this plan).** Each task below is executed by a fresh agentic worker with **no memory of this conversation and no knowledge of the sibling tasks**. Everything a worker needs is inside its own task block: absolute paths, exact line numbers, real code, real commands, and the exact expected output. Before writing any production code invoke `superpowers:test-driven-development`; before claiming a task complete invoke `superpowers:verification-before-completion`. Never mark a step done on an unrun command. If a file does not match the line numbers quoted in a task, STOP and re-read the file — do not guess; the line numbers in this plan were read from the working tree on 2026-09-09 (affiliate `main` @ `43f6dfc8`, web-core `main` @ `c4db167` v0.1.2, corporate `main` @ `bc86055`).

## Goal

Put both live apps on a single `mongoose` instance and on `@crhs/web-core` **v0.2.0**, with every consumer call site migrated in the same release, all three test suites green, and **zero user-visible behaviour change** on `portal.atxwashdryfold.com` (:3000) or `crhsent.com` (:3001). Close the two Phase-0 cutover gates: **G1** (Cloudflare LB monitor health follows the portal) and **G2** (corporate `/health` mints no session). Plan 1 ends with both apps booting on v0.2.0 on both OCI boxes.

**Not in Plan 1:** the corporate multi-host content app (Plan 2), the affiliate content removal and the nginx host flips (Plan 3), and the module-by-module inline-copy adoption — affiliate PRs B5–B14 (Plan 4).

## Architecture

Three repos, one shared library, two live pm2 processes on two OCI boxes (oci1 `161.153.71.201`, oci2 `144.24.4.202`):

- **Affiliate portal** `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program` — pm2 `wavemax`, `:3000`, cluster ×2. Consumes web-core through **10 five-line shims + 5 `webCore.*` call sites in `server.js` (`:14,227,264,265,277`)**. Keeps full local copies of `storeIPs`, `rateLimiting`, `mongoCursorRetry`, `SystemConfig` — which is exactly why it is immune to most v0.2.0 deletions.
- **Content app** `/mnt/c/Users/rickh/GitHub/crhs-corporate` — pm2 `crhs-corporate`, `:3001`, serves `crhsent.com` today. Consumes 14 `wc.*` keys, including `wc.SystemConfig` (`server/middleware/accessGate.js:44`), `wc.buildSessionMiddleware` (`server.js:65-69`) and `wc.rateLimiting.apiLimiter` (`server.js:77`).
- **Shared library** `/mnt/c/Users/rickh/GitHub/crhs-web-core` — `@crhs/web-core` v0.1.2, `src/index.js` = 28 lazy memoized getters (lazy since the 2026-08-27 `ORA-04036` incident — **that laziness is load-bearing and must survive Plan 1 unchanged**). Consumed by both apps as `"file:../crhs-web-core"`.

Plan 1 changes the *dependency topology* (peer deps + `install-links` copy semantics → one `mongoose`, one `mongodb`), then the *library API* (v0.2.0: mechanism-only primitives, brand/host literals removed), each breaking change shipped **with** its consumer PR in the same release.

## Tech Stack

Node 20+ · Express 4.x · Mongoose 8.24.x (single instance after Tasks 3–7) · MongoDB driver 6.20.x (mongoose-supplied) · Oracle Autonomous Database (shared `MONGODB_URI`) · connect-mongo 5.x · express-session 1.18.x · express-rate-limit 7.1.4 · csrf-csrf 4.x · Helmet 7.1.0 · Winston 3.x · Jest 29.7.0 + Supertest + mongodb-memory-server · PM2 cluster · nginx → Cloudflare LB (pool `1e3795c02e98b9506cfab578c9cb7c97` "wavemax-oci").

## Spec

`/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/docs/superpowers/specs/2026-09-09-crhs-content-separation-design.md` — Plan 1 implements **§7.0** (tranche B-core), **§7.1** (topology, PRs B0/B1/B2 + §7.1.4 on-box reinstall), **§7.2.1–7.2.9** (v0.2.0, PRs B3a–B3f, B3h, B3i-1, B3i-2), **§7.5** rows B0…B4c, **§5.2 / D27** (gate G2) and **§8.3.2 / D26** (gate G1). Do **not** read the whole 2,601-line spec; each task names the sections it needs.

---

## Global Constraints

1. **Strict TDD, no exceptions.** Failing test first → run it → state the exact failure text → minimal implementation → run → state PASS → commit. No production code lands in Plan 1 without a test that would have caught the regression.
2. **Commit trailer on every commit, all three repos:** `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
3. **Never `--no-verify`**, never skip hooks, in any repo.
4. **One concern per PR, ≤ 500-line diffs.** Plan 1 has no verbatim-copy PR (that is Plan 2's A3).
5. **Move-then-delete, never rewrite-in-place.** The canonical Plan 1 instance: `isInRange` moves into `src/middleware/ipGate.js` in **Task 48**; `src/config/storeIPs.js` is deleted only in **Task 53**, a separate PR.
6. **THE RULE — no consumer may be left importing a removed or reshaped export when a new web-core version reaches a box.** Every breaking core change ships in the same release as its consumer PR(s). The five boot-breakers this plan must never reintroduce are listed under *Execution Order → Hard ordering constraints*.
7. **`logger` only in `server/`** (`server/utils/logger.js` in the affiliate, `wc.logger` in corporate). `console.*` is ESLint-blocked in `server/`. `tests/setup.js` in each repo is exempt (the affiliate's already uses bare `console.log` at `:50,67,75,88,111,128,145`), and `scripts/` is exempt (the `console.*` ban is scoped to `server/`).
8. **Runtime business values via `SystemConfig`** (`await SystemConfig.getValue(key, default)`) — never hardcode a rate, fee, limit or timeout. Plan 1 adds no new config key; it only moves *where* defaults are registered (and the affiliate half of that move, PR B8, is Plan 4).
9. **Model double-registration rule.** No affiliate process, test, setup file or verification one-liner may load `wc.SystemConfig` while `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/server/models/SystemConfig.js:449` still calls `mongoose.model('SystemConfig', …)` — web-core `src/models/SystemConfig.js:449` registers the same name and a single instance throws `OverwriteModelError`. **Every cross-package identity proof in Plan 1 uses the resolution-path form** `require.resolve('mongoose', { paths: [require.resolve('@crhs/web-core')] }) === require.resolve('mongoose')`, which loads no model. `.base` comparisons are legal in **corporate** (no local `SystemConfig`) and illegal in the affiliate until PR B8 (Plan 4). **This bans `wc.SystemConfig`, not the affiliate's own model** — `tests/setup.js:157-164` already requires `../server/models/SystemConfig` on every test run, so requiring that same module inside an affiliate test is safe and is used deliberately in Task 5.
10. **Topology = spec option (c), binding.** affiliate gains `.npmrc` with `install-links=true`; web-core moves `connect-mongo ^5.1.0`, `express-rate-limit 7.1.4`, `express-session ^1.18.1`, `mongoose ^8.15.0` from `dependencies` to `peerDependencies` **and adds the same four to `devDependencies`** (its own suite requires them at `tests/setup.js:11-12`); web-core **deletes** its direct `mongodb ^6.21.0`; corporate declares the same four in `dependencies`; **both consumer `package-lock.json` files are regenerated and committed**.
11. **Measured baseline that must flip (do not re-derive; verify with the command in Task 1):** in the affiliate today `require.resolve('mongoose')` → `…/wavemax-affiliate-program/node_modules/mongoose/index.js` (8.24.1) but through web-core → `…/crhs-web-core/node_modules/mongoose/index.js` (8.24.4) — **`same: false`**. Corporate is already `same: true`, but its driver identity is **already broken** (`mongoose.mongo.Collection === require('mongodb').Collection` → **`false`**: hoisted `mongodb` 6.21.0 vs mongoose's nested 6.20.0). The corporate driver assertion may only be written into `tests/models.test.js` **after** the Task 4 + Task 7 lock regen is empirically shown to collapse that nesting.
12. **`installCursorRetry` patches the wrong driver today** (`crhs-web-core/src/utils/mongoCursorRetry.js:89` → `require('mongodb').Collection`). Task 3 repoints it to `require('mongoose').mongo.Collection`. The affiliate runs its **own** copy at `server.js:59-60`, so this is a web-core-internal fix in Plan 1.
13. **Limiter deletions in v0.2.0 — exactly three, and NOT the contact-form pair.**
    - **`contactFormBurstLimiter` (`src/middleware/rateLimiting.js:190-206`) and `contactFormLimiter` (`:213-230`) SURVIVE v0.2.0.** Grep-verified: corporate's only `wc.rateLimiting` reference is `crhs-corporate/server.js:77` (`apiLimiter`), and the affiliate mounts its contact limiters from its **own** `server/middleware/rateLimiting.js:190,213` (`server/routes/partnerInquiryRoutes.js:5,52-53`, `server/routes/affiliateApplicationRoutes.js:5,57-58`). So the deletion is **not** a boot hazard today — the real constraint is **copy-before-delete**: the reviewed `windowMs`/`max`/keyGenerator values must be copied into corporate's `server/middleware/rateLimitPolicy.js` (Plan 2 / D2a) and the affiliate's policy module (Plan 4 / PR B7) before core loses them, and Plan 4's PR B7 replaces the affiliate's byte-parity copy with a shim — at which point a core deletion would land in the affiliate as `router.post(path, undefined, …)` → `Route.post() requires a callback function but got a [object Undefined]` at require time. Core deletes them in the **Plan 4 PR B7 release**. Task 41 pins this with a guard test.
    - **`emailVerificationLimiter` (`:233-249`), `fileUploadLimiter` (`:252-268`) and `adminOperationLimiter` (`:271-294`) ARE deleted in v0.2.0** (spec §7.2.3 "Deleted from core"). Grep-verified mounted nowhere: `grep -rn 'emailVerificationLimiter\|fileUploadLimiter\|adminOperationLimiter' <affiliate>/server/routes <affiliate>/server/controllers <affiliate>/server.js <corporate>/server` returns **nothing** — the affiliate's only occurrences are its own inert local copies at the same line numbers.
    - Any reviewer who re-adds "corporate must declare the contact limiters first", or who extends the deletion to the app-policy limiters, is wrong on both counts.
14. **No user-visible behaviour change in Plan 1.** Three consequences that bind the corporate consumer PR: (a) corporate keeps its **live session cookie base** — pass `cookieName: process.env.SESSION_COOKIE_NAME || 'wavemax.sid'` explicitly (web-core's `DEFAULT_COOKIE_BASE` becomes `'app.sid'` in Task 30, and letting it default would silently log out every gate-unlocked mediator); (b) corporate does **not** pass `collectionName` in Plan 1 (stays `sessions`) — this is a **recorded deviation from spec §7.5 B4a / §7.6.1**, which schedules `sessions_corporate`; the switch to `crhsent.sid` + `sessions_corporate`, with its one-time session drop, moves to the Plan 2 Phase-0a deploy per D14b/Q-18 and must appear in Plan 2's 0a entry criteria; (c) `RATE_LIMIT_COLLECTION_PREFIX` is **not set** in any prod `.env` in Plan 1 — the new default `process.env.RATE_LIMIT_COLLECTION_PREFIX || 'ratelimit_'` reproduces today's live collection names byte-for-byte, so nothing migrates.
15. **The Firebase frame-src origin must survive.** Task 22 removes `https://wavemax-bag-registration.firebaseapp.com` from web-core's CSP defaults (`cspDirectives.js:208,215`). **Task 25 must re-supply it** in the affiliate's `frameSrcExtra` at `server.js:265-276`, or the portal claim page's Firebase phone-auth iframe is blocked. This is a user-visible regression if missed, and it is exactly what the re-captured golden pins.
16. **Plan 1 carve-outs from the spec's v0.2.0 scope — recorded so Plan 2/3/4 inherit them.**
    - Task 53 deletes `src/config/storeIPs.js`, `src/utils/previewUnlockCookie.js` and their two index keys (28 → 26). It does **not** delete `src/security/securityHeaders.js:83-88` and does **not** delete `assets/js/{iframe-bridge-v2,parent-iframe-bridge-v3}.js` or `assets/legal/*` — the affiliate still serves `public/assets/js/parent-iframe-bridge-v3.js` to the WordPress parent cross-origin, and `securityHeaders.js:83-88` is the `Access-Control-Allow-Origin: *` / `Cross-Origin-Resource-Policy: cross-origin` block for exactly that path. Those deletions are D9a/D3a and belong with the Item-A bridge retirement (Plan 3).
    - **Spec PRs B3g, B3j and B3k are DEFERRED out of Plan 1** and out of the `v0.2.0` release gate: B3g (email transport/template-manager parameterised by brand + `replyTo` + delete `src/config/brand.js` + the `cspHelper` `brand === true` shorthand), B3j (`validateMailConfig()` export), B3k (`assets/js/i18n.js` → `translationsPath: '/locales'` + `data-i18n-aria-label`). None of them has a consumer-breaking edge in Plan 1 — verified live: `src/email/transport.js:73` and `src/email/template-manager.js:67` still hold the `rundberglaundry.com` fallbacks, `assets/js/i18n.js:15` still has the hostname branch, and neither consumer imports `src/config/brand.js`. They ship as `@crhs/web-core` v0.2.1 alongside Plan 2's Phase-0a corporate work, where the email From-chain and `/locales` path actually matter. **Consequence:** spec §7.2.2's repo-wide `tests/brandNeutral.test.js` (`grep -rEi 'wavemax|rundberglaundry|runberglaundry|atxwash|wavemaxlaundry' src/` → 0) **cannot pass in Plan 1** and is deferred with them; Plan 1 ships the two file-scoped substitutes instead (Task 30's `sessionStore.js` guard and Task 33's `SystemConfig.js` guard). Do not add the repo-wide guard to a Plan 1 task — it would be red on merge.
    - **Affiliate PR B7 is Plan 4, not Plan 1.** Tasks 37–42 ship only the *web-core mechanism half* of D17b. The affiliate consumers — mirroring the store/rateLimiting copies, `server/services/codeAttemptLockout.js:49`, the §7.6.3 `rate_limits` reset fix in `systemHealthService`/`administratorController`/`administratorRoutes`, and `scripts/admin/reset-rate-limits.js` — are handed to Plan 4 by Task 42's hand-off note, which also carries two defects found during review (see that note).
17. **Confirm-first, human-gated, never automated:** any production `.env` edit on either box, any nginx edit or `systemctl reload nginx`, the Cloudflare monitor PATCH (Task 12), every box deploy, and any `.env.example` edit in a repo. Tasks that touch these are marked **HUMAN-CONFIRM** and carry both the exact command and the exact rollback. **No production `.env` key is written in Plan 1** — Task 16 gathers `LOG_DIR` evidence read-only and hands the write to Plan 2's 0a.
18. **CORS becomes env-only in Task 18.** Corporate mounts `cors(wc.corsConfig)` at `server.js:61`; after Task 18, with no `CORS_ORIGIN` set, every cross-origin request to `crhsent.com` is rejected (today the hardcoded list at `corsConfig.js:14-24` admits the franchisor domains). Spec §7.2.6/D21b calls this a fix and corporate has no cross-origin API callers — but the Deploy-B checklist **must** read `CORS_ORIGIN` from both boxes' corporate `.env` first (confirm-first) and record the value.
19. **Box deploy mechanics (both boxes, oci1 → verify → oci2, never in parallel).** web-core reaches a box by `rsync -a --delete --exclude node_modules --exclude .git --exclude logs ~/GitHub/crhs-web-core/ ubuntu@<ip>:/var/www/crhs-web-core/`, then **`npm install --install-links` inside EACH consumer** (`/var/www/wavemax/wavemax-affiliate-program`, `/var/www/crhs-corporate`) because both consume it as a copy; apps update by `git pull --ff-only` then `pm2 reload wavemax` / `pm2 reload crhs-corporate`. The old `e2107288` pin is **lifted**. `npm config get legacy-peer-deps` must print `false` or `undefined` on each box before the first peer-dependency install. **The corporate repo is private and the boxes hold no GitHub credentials** — every corporate box update must first probe `git fetch --dry-run origin` and fall back to `rsync … --exclude .env --exclude node_modules --exclude .git --exclude logs` when that fails; never wrap both consumers' pulls in one `set -e` loop.
20. **"Repeat on the other box" is never a single checkbox.** Every deploy task expands its oci2 pass into named sub-steps with their own expected output. A worker must never be asked to tick one box for a snapshot + rsync + two installs + two reloads + six verifications.
21. **Ship the topology deploy (R1, v0.1.3) and the API deploy (R2, v0.2.0) as SEPARATE deploys** so a boot failure is attributable to one release.
22. **Tests run without `--forceExit` where they already do.** The affiliate suite still runs `jest --runInBand --forceExit` (`package.json`, `jest.config.js`); Plan 1 does not change that, and no Plan 1 PR may add a new open handle.
23. **`madge --circular server/` must stay at zero** in the affiliate for any PR that touches `server/` (Tasks 25, 45).
24. **Test totals are DELTAS, never absolutes.** Plan 1's task groups are order-free with respect to each other and each adds or removes cases and whole suite files (Task 4 +1 suite, Task 44 −1 suite +1 suite, Tasks 13/21 +2 suites …). **Measure `npm test 2>&1 | tail -6` immediately before the first step of a task, record `<BASE>`, and expect `<BASE> + <N>` after**, where `<N>` is the case count that task states. Never compare against an absolute total written in another task. The only absolute measurements in this plan are the three baselines captured in Task 2 on a clean tree.
25. **The affiliate consumes `@crhs/web-core` as a real COPY from Task 5 onward.** Before Task 5, `node_modules/@crhs/web-core` is a symlink into the source tree (verified 2026-09-09: `lrwxrwxrwx … -> ../../../crhs-web-core`, no `.npmrc`) and a web-core edit is visible immediately. After Task 5 (`.npmrc install-links=true`), **every affiliate task must run `rm -rf node_modules/@crhs/web-core && npm install --install-links` before it can see a web-core edit**, and must `git checkout -- package-lock.json` afterwards unless the task owns the lock. Corporate has always been a copy (`.npmrc install-links=true` already present) and has always needed the refresh.
26. **Gate G1 token facts.** `~/.cf_api_token` is **account-owned** (`cfat_`): verify with `GET /accounts/b69ef162d008b11492296d3b35cad2fe/tokens/verify`; `GET /user/tokens/verify` returns a **false** `1000 Invalid API Token`. The token has Account → Load Balancing Monitors & Pools; it **lacks** Zone → Load Balancers Read, and nothing in Plan 1 needs it.
27. **Gate G1 object identity.** Monitor `be6953d2e0cfd7b40c4f414b5ddf20d9`, account `b69ef162d008b11492296d3b35cad2fe`, pool `1e3795c02e98b9506cfab578c9cb7c97` (oci1 `161.153.71.201` + oci2 `144.24.4.202`). PATCH changes **only** `description` and `header.Host` (`["rundberglaundry.com"]` → `["portal.atxwashdryfold.com"]`); `path:/health`, `expected_codes:"200"`, `expected_body:""` (EMPTY), `follow_redirects:false`, `allow_insecure:true`, `interval:60`, `retries:2`, `timeout:5` are preserved and re-verified after the PATCH.
28. **Gate G2 shape.** In `/mnt/c/Users/rickh/GitHub/crhs-corporate/server.js`, `app.get('/health', …)` (`:80`) moves **above** `app.use(wc.buildSessionMiddleware(...))` (`:65-69`) — mirroring the affiliate's own fix at `server.js:413-424` — because `crhs-web-core/src/config/sessionStore.js:98` is `saveUninitialized: true` and the CF monitor probes from every PoP. The pinned assertions are: 200, `{"status":"ok"}`, `cache-control: no-store`, and **no `set-cookie`**.
29. **Corporate suite baseline is 4 pre-existing failures.** `crhs-corporate/tests/crhsent-parity.test.js` reads `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/crhsent` (verified: the directory does not exist — deleted by the de-brand), so 4 cases fail with ENOENT. That suite is deleted in **Plan 2 task A1**. Every "corporate green" in Plan 1 means: **those 4 failures in `tests/crhsent-parity.test.js` and no others**, with a passing count of the Task 1 baseline plus every case Plan 1 adds.

---

## File Structure

### `@crhs/web-core` — `/mnt/c/Users/rickh/GitHub/crhs-web-core`

| File | Plan 1 change |
|---|---|
| `package.json` | **MODIFY (Task 4, Task 54)** — 4 packages `dependencies` → `peerDependencies` + added to `devDependencies`; delete `mongodb ^6.21.0`; version `0.1.2 → 0.1.3` (Task 4) → `0.2.0` (Task 54). Locate keys **by name**, never by the spec's line numbers (`files`/`engines` are one-liners here). |
| `package-lock.json` | **MODIFY (Task 4)** — regenerate after the dependency block moves. |
| `tests/packageTopology.test.js` | **CREATE (Task 4)**, **MODIFY (Task 54)** — the four names are in `peerDependencies` **and** `devDependencies`, in neither `dependencies`; `mongodb` absent from all three blocks; version. This is the ONLY packaging test file in the repo — there is no `tests/packaging.test.js`. |
| `src/utils/mongoCursorRetry.js:89` | **MODIFY (Task 3)** — `require('mongoose').mongo.Collection` instead of `require('mongodb').Collection`. |
| `src/utils/mongoOracleDiagnostics.js:106` | **MODIFY (Task 3)** — driver-version label resolved through mongoose. |
| `src/utils/auditLogger.js:17,23` | **MODIFY (Task 14)** — honour `process.env.LOG_DIR` exactly as `src/utils/logger.js:11` does (closes the live "audit log inside `node_modules`" defect). |
| `src/security/corsConfig.js:10-34` | **MODIFY (Task 18)** — env-only allowlist; delete the 7 hardcoded `wavemax*`/CRHS origins and the `localhost:3000` default. |
| `src/security/cspDirectives.js` | **MODIFY (Task 22)** — `profile` parameter (`full` \| `marketing`), `frameAncestors` default `["'self'"]`, delete `strictCSPPages`, `imgSrcSelfOrigins`/`connectSrcSelfOrigins`, the franchisor `frameAncestors` default, the CRHS hosts in img/connect, the clickjacking-demo branch and the Firebase origin; rename `isFranchiseHostPage` → `isCleanUrlSlugPage`. |
| `src/security/securityHeaders.js` | **UNCHANGED in Plan 1** — `:83-88` deletion is deferred (Global Constraint 16). |
| `src/config/sessionStore.js` | **MODIFY (Tasks 27, 28, 30)** — return `{ middleware, store, cookieName, sessionMaxAge }`; `collectionName` + `autoRemoveInterval` options; `DEFAULT_COOKIE_BASE` `'wavemax.sid'` → `'app.sid'` (**all five `wavemax` references**, not just the constant); compose the affiliate's post-session maxAge fixer in as `_maxAgeFixer(sessionMaxAge)`. |
| `src/models/SystemConfig.js` | **MODIFY (Tasks 32, 33)** — hoist the seed array to a frozen `CORE_DEFAULTS`; add `registerDefaults(list)` / `getRegisteredDefaults()` / `clearRegisteredDefaults()`; trim `CORE_DEFAULTS` to `maintenance_mode`, `access_gate_enabled`, `system_timezone`; the `"WaveMAX Associates"` brand leak goes with the deleted block. |
| `src/middleware/rateLimiting.js` | **MODIFY (Tasks 40, 41)** — add `keyGenerators`/`isRelaxed`/`isTest` aliases, `LIMITER_NAMES`, `collectionPrefix()`, `collectionNameFor()`, `sweepExpired({…})`, `resetBuckets({…})`; register bucket names before the `isTest` short-circuit; **delete exactly three** limiters (`emailVerificationLimiter`, `fileUploadLimiter`, `adminOperationLimiter`) and **keep** every app-policy limiter incl. the contact-form pair (Global Constraint 13). |
| `src/middleware/rateLimitMongoStore.js` | **MODIFY (Tasks 37, 38, 39)** — `collectionPrefix` (default `RATE_LIMIT_COLLECTION_PREFIX \|\| 'ratelimit_'`), opt-in `ensureTtlIndex`, name registry, `sweepCollection()` / `resetCollection()` statics; the constructor stays the single source of the collection name. |
| `src/config/csrf-config.js` | **MODIFY (Task 44)** — keep the `doubleCsrf` block (`:12-54`); delete the route tables (`:57`–**`:184`**, not `:190`); export `createCsrf({ tables, phase })` → `{ CSRF_CONFIG, csrfProtection, conditionalCsrf, csrfTokenEndpoint, shouldEnforceCsrf, generateCsrfToken }`. |
| `src/middleware/ipGate.js` | **MODIFY (Task 48)** — move `ipv6ToBigInt` and `isInRange` in verbatim from `src/config/storeIPs.js`, delete `:13`, repoint `:23`, extend the export. `logger` is already imported at `:12`. |
| `src/config/storeIPs.js` | **DELETE (Task 53)** — strictly after Task 48. |
| `src/utils/previewUnlockCookie.js` | **DELETE (Task 53)** — zero consumers. |
| `src/index.js` | **MODIFY (Task 53)** — delete `:40` (`storeIPs`) and `:44` (`previewUnlockCookie`); rewrite the `:15-18` "28 keys" comment to 26. The `def()` lazy-getter mechanism and the ORA-04036 note are untouched. |
| `src/email/*`, `src/config/brand.js`, `src/utils/cspHelper.js`, `assets/js/i18n.js` | **UNCHANGED in Plan 1** — spec PRs B3g/B3j/B3k are deferred to v0.2.1 (Global Constraint 16). |
| `tests/utils/{mongoCursorRetry,mongoOracleDiagnostics,auditLogger}.test.js`, `tests/security/corsConfig.test.js`, `tests/config/sessionStore.test.js`, `tests/models/systemConfig.test.js`, `tests/middleware/{rateLimiting,rateLimitMongoStore,ipGate}.test.js`, `tests/index.smoke.test.js` | **MODIFY** — re-pinned by their owning task; `index.smoke.test.js` goes 28 → 26 in Task 53. |
| `tests/security/{cspGolden,cspMonorepoParity}.test.js` | **MODIFY (Task 23)** — the one authorised web-core re-capture (D16a). |
| `tests/utils/auditLoggerLogDir.test.js`, `tests/security/cspProfiles.test.js`, `tests/config/csrfPrimitive.test.js` | **CREATE** — Tasks 13, 21, 44. |
| `tests/config/{storeIPs,csrfConfig}.test.js`, `tests/utils/previewUnlockCookie.test.js` | **DELETE** — Task 53 / Task 44 (csrf cases are ported into the affiliate suite by Task 43 first). |
| `tests/brandNeutral.test.js` | **NOT CREATED in Plan 1** — deferred with B3g/B3k (Global Constraint 16). |
| `scripts/deploy/verify-topology.sh` | **CREATE (Task 11)** — on-box resolution-path identity proof; loads no model. |

### Corporate content app — `/mnt/c/Users/rickh/GitHub/crhs-corporate`

| File | Plan 1 change |
|---|---|
| `package.json:15-21` | **MODIFY (Task 7)** — declare `connect-mongo ^5.1.0`, `express-rate-limit 7.1.4`, `express-session ^1.18.1`, `mongoose ^8.15.0` in `dependencies`. |
| `package-lock.json` | **MODIFY (Task 7)** — regenerate; today it records web-core `0.1.0` at `:534-536` against an installed `0.1.1` and a source `0.1.2` (three-way drift). |
| `.npmrc` | **UNCHANGED** — already `install-links=true`. |
| `server.js:20-22` | **MODIFY (Task 7)** — replace the "mongoose is intentionally NOT declared" comment with the peer/install-links explanation naming `tests/models.test.js` as the guard. |
| `README.md:18-23, :107-115` | **MODIFY (Task 7)** — document the explicit declarations and that a web-core bump still requires `npm install` in this dir (copy semantics). |
| `server.js:80 → above :65` | **MODIFY (Task 10)** — hoist `app.get('/health', …)` above the session middleware; add `Cache-Control: no-store`. |
| `server.js:65-69` | **MODIFY (Task 29)** — `const { middleware: sessionMiddleware } = wc.buildSessionMiddleware({ mongoUrl: process.env.MONGODB_URI, secret: process.env.SESSION_SECRET, ttlSeconds: 600, cookieName: process.env.SESSION_COOKIE_NAME \|\| 'wavemax.sid' }); app.use(sessionMiddleware);` — `store` is deliberately **not** destructured (unused here; only the affiliate needs `store.clientP`, and an unused binding fails `npx eslint server.js`), and **no `collectionName`** in Plan 1 (Global Constraint 14b). |
| `server.js:49-58` | **MODIFY (Task 24)** — CSP call site to the v0.2.0 signature: `profile: 'full'`, `frameSrcExtra` for `/wavemax/clickjacking-demo.html`, no `path`/`isClickjackingDemo`. |
| `server.js:25-28` + `:96-98` | **MODIFY (Tasks 34, 35)** — `const { seedSystemConfig } = require('./server/bootstrap');` and boot order `await db.connect(); await seedSystemConfig(); await accessGate.loadCache();`. `seedSystemConfig()` wraps `wc.SystemConfig.initializeDefaults()` and returns the current `access_gate_enabled`; it is guarded by `tests/bootstrap.test.js`. **Do NOT also call `wc.SystemConfig.initializeDefaults()` directly from `server.js`** — `seedSystemConfig()` *is* that call. |
| `server/bootstrap.js` | **CREATE (Task 34)** — idempotent boot seeding. |
| `.env.example:63-64` | **MODIFY (Task 19, HUMAN-CONFIRM)** — document `CORS_ORIGIN` / `CORS_EXTRA_ORIGINS` as env-only, both intentionally unset in prod. |
| `tests/models.test.js:88-96` | **MODIFY (Task 7)** — append `expect(wc.SystemConfig.base).toBe(require('mongoose'))`, and the driver-identity assertion **only if** the post-Task-4 lock regen empirically collapses the nested `mongodb`. |
| `tests/packageTopology.test.js` | **CREATE (Task 7)** — 11 cases. |
| `tests/health.test.js` assertions | **ADDED to `tests/server.integration.test.js` (Task 10)** — 200, `{"status":"ok"}`, `cache-control: no-store`, **no** `set-cookie`, for `Host: crhsent.com` and for no Host. |
| `tests/bootstrap.test.js` | **CREATE (Tasks 34, 35)** — 5 cases. |
| `tests/cors.integration.test.js`, `tests/csp.integration.test.js` | **CREATE (Tasks 19, 24)**. |
| `tests/webcore.smoke.test.js:9-10` | **MODIFY (Task 53)** — `toHaveLength(28)` → `26`; the `arrayContaining` at `:13-16` still names `ipGate`, which Task 48 keeps intact. |
| `tests/server.integration.test.js:29-45` | **UNCHANGED** — asserts CSP by shape, not bytes; Task 22 forces no corporate re-capture (verified). |
| `tests/crhsent-parity.test.js` | **UNCHANGED and RED** — 4 pre-existing ENOENT failures; deleted in Plan 2 A1 (Global Constraint 29). |
| `server/middleware/rateLimitPolicy.js` | **NOT CREATED in Plan 1** — corporate hosts no intake endpoints yet; it ships with Plan 2 §5.5/A7 (Global Constraint 13). |

### Affiliate portal — `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program`

| File | Plan 1 change |
|---|---|
| `.npmrc` | **CREATE (Task 5)** — single line `install-links=true`; turns `node_modules/@crhs/web-core` from a symlink into a copy. |
| `package-lock.json:700-703` | **MODIFY (Task 5)** — regenerate; the `"link": true` entry becomes the copy form. All four peer candidates are already declared at web-core's exact ranges, so the hoisted copy is the app's pin. |
| `tests/integration/webCoreInstanceIdentity.test.js` | **CREATE (Task 5)** — assertions (a) not a symlink + installed inside this app, (b) resolution-path equality for the four shared deps, (c) `initializeDefaults()` resolves through **this app's own** model with `countDocuments() >= 3`, (d) driver identity, (e) no nested copy. |
| `tests/helpers/assertSingleMongoose.js`, `tests/unit/assertSingleMongoose.test.js` | **CREATE (Task 6)**. |
| `tests/setup.js` (top of file) | **MODIFY (Task 6)** — insert the split guard: resolution-path comparison that throws `Dual-package install detected…`. It loads no web-core model, so it respects Global Constraint 9. |
| `server.js:244-279` | **MODIFY (Task 25)** — v0.2.0 CSP arguments: keep `isStrictCspPath(req.path, { strictCSPPages: APP_STRICT_CSP_PAGES })`, drop `path`/`isClickjackingDemo`/`imgSrcSelfOrigins`/`connectSrcSelfOrigins`, keep `frameAncestors: ["'self'"]`, and **add `https://wavemax-bag-registration.firebaseapp.com` to `frameSrcExtra`** (Global Constraint 15). |
| `tests/integration/webCoreConsumptionGolden.test.js` | **MODIFY (Task 26)** — the repo's single authorised golden re-capture; commit message contains exactly `golden(csp): deliberate re-capture (D16a)`. |
| `server/config/csrfTables.js` | **CREATE (Task 45)** — web-core `csrf-config.js:57-184` as it stood at the pinned pre-Task-44 SHA (60 rows), **including** the five public-intake rows (recorded deviation — see Task 45). |
| `server/config/csrf-config.js:5` | **MODIFY (Task 45)** — `module.exports = createCsrf({ tables: require('./csrfTables') });` keeping the exact export shape `server.js:20` destructures and mounts at `:629`/`:632`. |
| `tests/unit/csrfConfig.test.js` | **MODIFY (Task 43)** — port the 4 web-core cases with no affiliate equivalent; **no existing case may be dropped**; PR body records `before=43 ported=4 after=47`. |
| `tests/unit/csrfTables.test.js`, `tests/integration/csrfTokenEndpoint.test.js` | **CREATE (Task 45)**. |
| `tests/integration/auditLogDir.test.js`, `tests/integration/cspClaimFrameSrc.test.js`, `tests/unit/corsOriginPolicy.test.js`, `tests/integration/systemConfigOwnershipGuard.test.js` | **CREATE (Tasks 15, 25, 20, 36)**. |
| `.env.example` | **MODIFY (Task 20, HUMAN-CONFIRM)** — record all four production CORS origins so the later B11 adoption cannot drop one. |
| `tasks/todo.md` | **MODIFY (Task 1)** — append the Plan 1 checklist with the R1/R2 release boundaries. |
| `docs/refactor/plan1-exit-gate.md` | **CREATE (Tasks 11, 12, 55, 58)** — the deploy/gate evidence file. |
| `server/middleware/{ipGate,adminIpGate,operatorIpGate,rateLimiting,rateLimitMongoStore}.js`, `server/config/storeIPs.js`, `server/models/SystemConfig.js`, `server/utils/mongoCursorRetry.js`, `server/services/codeAttemptLockout.js`, `server/services/systemHealthService.js`, `server/controllers/administratorController.js`, `server/routes/administratorRoutes.js`, `scripts/admin/reset-rate-limits.js` | **UNCHANGED in Plan 1** — the local copies are exactly what make the affiliate immune to Tasks 33/41/53; they are removed or rewired in Plan 4 (PRs B5–B14, incl. B7 per Task 42's hand-off). |

---

## Execution Order

Plan 1 is **two releases and two gates**. Nothing is deployed between the PRs of a release.

**Phase 0 — baseline (Tasks 1–2).** Record the RED topology baseline, the three suite baselines and the corporate 4-failure baseline on clean trees, write the release checklist, cut the working branches.

**Release R1 — dependency topology, `@crhs/web-core` v0.1.3 (Tasks 3–9).**

| Order | Task | Repo | Blocks |
|---|---|---|---|
| 3 | driver resolved through mongoose (prerequisite for dropping `mongodb`) | web-core | Task 4 |
| 4 | peers + devDeps, drop `mongodb`, version `0.1.3` | web-core | everything |
| 5–6 | `.npmrc` + lock regen + identity test + `tests/setup.js` guard | affiliate | Task 11 |
| 7 | declare the four deps, `server.js:20-22`, README, lock regen, identity assertions | corporate | Task 11 |
| 8 | cross-repo verification sweep + push three branches | all | Task 11 |
| 9 | hand-off (this group performs **no** box change) | — | Task 11 |

Tasks 5–6 and Task 7 are independent of each other and may run in parallel; **both** require Task 4 merged (npm cannot resolve peers that do not exist yet). Task 3 must precede Task 4 — reversing them leaves `mongoCursorRetry.js:89` requiring a package that is no longer installed.

**Gates and Deploy A (Tasks 10–12).**

- **Task 10 — gate G2** (corporate `/health` above the session mount). Repo-only; its production effect lands with Deploy A. May land any time before Task 11; it must be on the boxes before any monitored or marketing traffic reaches `:3001` (Plan 2). Touches the same region of `crhs-corporate/server.js` as Task 29 — whichever lands second rebases on the first, and Task 29's diff may never reintroduce a `/health` below the session mount.
- **Task 11 — Deploy A (HUMAN-CONFIRM).** The single R1 box deploy: `legacy-peer-deps` pre-flight, rsync web-core, `npm install --install-links` in each consumer, identity probe, `pm2 reload`, oci1 → verify 5 minutes → oci2. Ships **alone** as a topology-only deploy so a boot failure is unambiguously attributable to the dependency change.
- **Task 12 — gate G1 (HUMAN-CONFIRM, API only).** Runs **after** Deploy A is verified, so the portal `/health` is known good before the pool's health signal moves onto it, and **before** Deploy B, so the LB already follows the portal when the riskier API release lands.

**Release R2 — `@crhs/web-core` v0.2.0 + its co-requisite consumer PRs (Tasks 13–53).**

Core PRs in dependency order, each with its own failing-test-first cycle, none bumping the version:

`B3a` auditLogger `LOG_DIR` (13–16) → `B3b` CORS env-only (17–20) → `B3c` CSP profiles + literal removal + goldens re-capture (21–26) → `B3d` session `{ middleware, store }` + fixer + `collectionName` + `'app.sid'` (27–31) → `B3e` SystemConfig `registerDefaults` + 3 core keys (32–36) → `B3f` rateLimiting mechanism-only + store prefix/TTL/sweep + 3 dead limiters deleted (37–42) → `B3h` `createCsrf({ tables })` (43–46) → **`B3i-1`** move `isInRange` into `ipGate.js` (47–52) → **`B3i-2`** delete `storeIPs` + `previewUnlockCookie`, index 28 → 26, corporate smoke 28 → 26 (53).

Consumer PRs are interleaved with their core change, not deferred: Task 19 (corporate CORS), Task 24 (corporate CSP), Tasks 25–26 (affiliate CSP + golden), Task 29 (corporate session), Tasks 34–35 (corporate boot seeding), Task 43 + Task 45 (affiliate csrf), Task 53 (corporate smoke flip).

**Release cut and Deploy B (Tasks 54–58).** Task 54 cuts `v0.2.0`; **Task 55 is the single point at which v0.2.0 reaches the boxes**; Tasks 56–57 are the post-deploy slice verifications; Task 58 is the Plan 1 exit gate.

### Hard ordering constraints (the five boot-breakers)

1. **Task 48 strictly before Task 53.** `ipGate.js:13` requires `../config/storeIPs` and `:23` calls `storeIPs.isInRange`; deleting the file first is `MODULE_NOT_FOUND` in **both** apps — affiliate `server/middleware/ipGate.js:5` re-exports `wc.ipGate` whole and `adminIpGate.js:22` / `operatorIpGate.js:20` destructure it; corporate `server/middleware/mediatorGate.js:24` destructures it.
2. **Task 44 and Task 45 ship in the same release.** `server/config/csrf-config.js:5` is `module.exports = require('@crhs/web-core').csrf;` and `server.js:20` destructures `{ conditionalCsrf, csrfTokenEndpoint }`, mounting them at `:629` and `:632` — `app.use(undefined)` throws and the portal does not start.
3. **Task 27 and Task 29 ship in the same release.** `crhs-corporate/server.js:65-69` passes the builder's return value straight to `app.use(...)`; once it returns `{ middleware, store }`, `app.use(object)` throws `app.use() requires a middleware function` and `:3001` does not start.
4. **Task 22 and Tasks 25–26 ship in the same release.** Not boot-breaking, but the removed `imgSrcSelfOrigins`/`connectSrcSelfOrigins`/`frameAncestors` defaults and the removed Firebase `frame-src` origin change the live portal CSP header; Task 25 re-supplies the extras and Task 26 re-captures the golden. A stale CSP call site fails **silently** — no health check catches a dropped origin.
5. **No `.base` identity proof against `wc.SystemConfig` in the affiliate, anywhere in Plan 1.** Its own `server/models/SystemConfig.js:449` is registered at boot (`server.js:138-141`) and on every test run (`tests/setup.js:160`); loading web-core's twin in the same process is `OverwriteModelError`. Use only the resolution-path proof (Global Constraint 9), including in the on-box verification one-liner — Plan 1 deliberately deviates from spec §7.1.4's `wc.SystemConfig.base===m` form on the **affiliate** box and keeps it on the **corporate** box.

Plus: **Task 41 deletes three limiters with no consumer PR at all** (Global Constraint 13) — the only deletion in Plan 1 that needs no co-requisite, because all three are mounted nowhere in either app.

---

## Release boundaries

**R1 — `@crhs/web-core` v0.1.3 (topology).**
Must merge together, in all three repos, before anything is deployed: **Tasks 3, 4** (web-core), **Tasks 5, 6** (affiliate), **Task 7** (corporate). Task 10 (gate G2, corporate) merges into the same window so Deploy A carries it. **v0.1.3 reaches the boxes at exactly one task: Task 11.** Task 9 is an explicit no-deploy hand-off so no second topology deploy exists.

**R2 — `@crhs/web-core` v0.2.0 (API).**
Must merge together, in all three repos, before anything is deployed: **Tasks 13–14, 17–18, 21–23, 27–28, 30, 32–33, 37–41, 44, 47–49, 53** (web-core) **and every consumer task interleaved with them: 15, 19, 20, 24, 25, 26, 29, 34, 35, 36, 43, 45, 53** (the corporate smoke flip in Task 53 is part of that task's own commit pair).

Co-requisite pairs that must be in the same merge, restated so a reviewer can check them mechanically:

| Core task(s) | Consumer task(s) that MUST merge with them | Failure if split |
|---|---|---|
| 17–18 (CORS env-only) | 19 (corporate) | crhsent silently keeps/loses cross-origin grants with no test |
| 21–23 (CSP profiles + web-core goldens) | 24 (corporate), 25–26 (affiliate) | portal silently loses the Firebase `frame-src` origin → phone auth blocked |
| 27–28, 30 (session shape + `app.sid`) | 29 (corporate) | `app.use(object)` throws → `:3001` does not start |
| 44 (`createCsrf`) | 43 (test port) + 45 (affiliate rewire) | `app.use(undefined)` throws → `:3000` does not start |
| 47–49 (ipGate owns `isInRange`) | — (additive) | — |
| 53 (delete `storeIPs`/`previewUnlockCookie`, index 26) | 53's own corporate smoke flip 28 → 26 | corporate smoke test red on the box's next `npm test` |

**Tasks 22–23 are one commit** (Task 22 deliberately leaves the two web-core goldens red and forbids committing; Task 23 restores green and commits both). **Tasks 25–26 are one commit** on the affiliate side, for the same reason. Nothing is pushed from either repo between the halves of those pairs.

**v0.2.0 is tagged at Task 54 and reaches oci1/oci2 at exactly one task: Task 55.** No other task in this plan may rsync `crhs-web-core` to a box or run `pm2 reload` for the v0.2.0 release. Deploy A (Task 11) and Deploy B (Task 55) are separate deploys, in that order, never merged.

---

### Task 1: Pin the Plan 1 baseline and write the release checklist

**Files:**
- Create: none
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tasks/todo.md` (append a `## Plan 1 …` section at the end of the file)
- Test: none — this task changes no production code. Its verification is that every recorded value is the literal output of a command run in this task.

**Interfaces:**
- Consumes: the three working trees; `~/.cf_api_token`; spec §7.1, §7.5, §8.3.1.
- Produces: `tasks/todo.md` §"Plan 1" — the R1/R2 checklist every later task ticks; the recorded pre-change baseline (`same: false` in the affiliate, corporate driver identity `false`, web-core `0.1.2`, corporate installed copy `0.1.1`, corporate lock `0.1.0`); and `<CORP_BASE_PASS>` / `<CORP_BASE_FAIL>`, the corporate suite baseline every later corporate expectation in this plan is measured against (Global Constraint 29).

- [ ] **Step 1: Confirm all three trees are clean and record their HEADs.**
```bash
for d in /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program /mnt/c/Users/rickh/GitHub/crhs-web-core /mnt/c/Users/rickh/GitHub/crhs-corporate; do
  echo "== $d"; git -C "$d" status --porcelain | head -5; git -C "$d" log --oneline -1
done
```
Expected: no output from `status --porcelain` for any repo, and HEADs at or after `43f6dfc8` (affiliate), `c4db167` (web-core), `bc86055` (corporate). **If any tree is dirty, STOP** — commit or stash before continuing; Plan 1 regenerates two lockfiles and a dirty tree makes that unreviewable.

- [ ] **Step 2: Record the affiliate's mongoose split (the condition Task 5 must flip).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && node -e "
const p=require.resolve('mongoose');
const w=require.resolve('mongoose',{paths:[require.resolve('@crhs/web-core')]});
console.log('app :',p);console.log('core:',w);console.log('same:',p===w);
console.log('appv:',require('mongoose/package.json').version);"
```
Expected, verbatim (this is the RED state):
```
app : /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/node_modules/mongoose/index.js
core: /mnt/c/Users/rickh/GitHub/crhs-web-core/node_modules/mongoose/index.js
same: false
appv: 8.24.1
```
Also confirm the symlink: `ls -la node_modules/@crhs/` prints `web-core -> ../../../crhs-web-core`, and `ls -la .npmrc` prints `No such file or directory`.

- [ ] **Step 3: Record corporate's single-instance-but-split-driver state.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && node -e "
const p=require.resolve('mongoose'),w=require.resolve('mongoose',{paths:[require.resolve('@crhs/web-core')]});
console.log('same:',p===w,'wc:',require('@crhs/web-core/package.json').version);
console.log('driver same:', require('mongoose').mongo.Collection===require('mongodb').Collection);"
```
Expected: `same: true wc: 0.1.1` then `driver same: false`. The `false` is why the driver assertion may not be written into `tests/models.test.js` until after the Task 4 + Task 7 lock regen (Global Constraint 11).

- [ ] **Step 4: Record the corporate version three-way drift.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && node -p "'source '+require('./package.json').version" \
 && node -p "'installed '+require('@crhs/web-core/package.json').version" \
 && grep -n '"version": "0.1' package-lock.json | sed -n '1,6p'
```
Expected: `source 0.1.2`, `installed 0.1.1`, and a lock entry recording web-core `0.1.0` near `:534-536`. Task 7 collapses all three to one number.

- [ ] **Step 5: Record the corporate suite baseline — every later "corporate green" in Plan 1 is measured against this, never against an absolute total.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest --runInBand 2>&1 | tail -6
```
Expected: a `Tests:` line whose only failures are the 4 cases in `tests/crhsent-parity.test.js` — it reads `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/crhsent/index.html` (`tests/crhsent-parity.test.js:29`), a directory the affiliate de-brand already deleted, so they fail with `ENOENT`. That suite is deleted in **Plan 2 task A1**, not in Plan 1. Record the two numbers as `<CORP_BASE_FAIL>` (expected `4`) and `<CORP_BASE_PASS>` (expected `68` on `bc86055`). **Do not compare them to any number written elsewhere in this plan** — Tasks 7, 10, 19, 24, 29, 34 and 35 each add corporate cases.

- [ ] **Step 6: Inventory every consumer import of web-core, so "no consumer left on a removed export" is checkable.**
```bash
grep -rn "@crhs/web-core" /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/server /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/server.js | grep -v '^.*://' | wc -l
grep -rn "wc\.\|webCore\." /mnt/c/Users/rickh/GitHub/crhs-corporate/server.js /mnt/c/Users/rickh/GitHub/crhs-corporate/server | grep -o "wc\.[a-zA-Z]*\|webCore\.[a-zA-Z]*" | sort -u
grep -rn "wc.rateLimiting" /mnt/c/Users/rickh/GitHub/crhs-corporate/server.js /mnt/c/Users/rickh/GitHub/crhs-corporate/server /mnt/c/Users/rickh/GitHub/crhs-corporate/tests
```
Expected: the affiliate count is **23** reference LINES (10 shims + `server.js:14,227,264,265,277` + the shims' own doc comments — measured 2026-09-09; record it and re-check it, not a remembered number); the corporate list contains `wc.SystemConfig`, `wc.buildSessionMiddleware`, `wc.corsConfig`, `wc.rateLimiting`, `wc.sanitization`, `wc.errorHandler`, `wc.cspNonce`, `wc.securityHeadersMiddleware`, `wc.buildCspDirectives`, `wc.isStrictCspPath`, `wc.serializeCspDirectives`, `wc.logger`, `wc.cspHelper`, `wc.assetsDir`, `webCore.clientIp`, `webCore.ipGate`; and the last grep returns **exactly one line**, `server.js:77: app.use('/api/', wc.rateLimiting.apiLimiter);` — the proof for Global Constraint 13.

- [ ] **Step 7: Verify the Cloudflare token is account-owned and can read the G1 monitor (read-only, no change).**
```bash
CF=https://api.cloudflare.com/client/v4; ACCT=b69ef162d008b11492296d3b35cad2fe; MON=be6953d2e0cfd7b40c4f414b5ddf20d9
AUTH="Authorization: Bearer $(tr -d '\n\r ' < ~/.cf_api_token)"
curl -s "$CF/accounts/$ACCT/tokens/verify" -H "$AUTH" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("token",d["result"]["status"])'
curl -s "$CF/accounts/$ACCT/load_balancers/monitors/$MON" -H "$AUTH" | python3 -c 'import sys,json;m=json.load(sys.stdin)["result"];print(m["header"],m["path"],repr(m["expected_body"]),m["expected_codes"],m["follow_redirects"])'
```
Expected: `token active`, then `{'Host': ['rundberglaundry.com']} /health '' 200 False`. Do **not** run `GET /user/tokens/verify` — it returns a false `1000 Invalid API Token` for account tokens.

- [ ] **Step 8: Append the Plan 1 checklist to `tasks/todo.md`.** Add exactly this block at the end of `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tasks/todo.md`:
```markdown
## Plan 1 — web-core topology + v0.2.0 + gates G1/G2 (spec 2026-09-09-crhs-content-separation-design.md §7.1, §7.2, §5.2, §8.3.2)

Baseline recorded 2026-09-09: affiliate mongoose split `same: false` (app 8.24.1 / core 8.24.4);
corporate `same: true` but `driver same: false`; web-core 0.1.2; corporate installed copy 0.1.1, lock 0.1.0;
corporate suite baseline 4 failed (all tests/crhsent-parity.test.js ENOENT) / 68 passed.

### Release R1 — topology (@crhs/web-core v0.1.3)
- [ ] Task 3 web-core: cursor-retry + diagnostics resolve the driver through mongoose
- [ ] Task 4 web-core: 4 deps → peerDependencies + devDependencies, drop `mongodb`, v0.1.3, `tests/packageTopology.test.js`
- [ ] Task 5 affiliate: `.npmrc install-links=true`, lock regen, `tests/integration/webCoreInstanceIdentity.test.js`
- [ ] Task 6 affiliate: `tests/setup.js` split guard + `tests/helpers/assertSingleMongoose.js`
- [ ] Task 7 corporate: declare the 4 deps, rewrite `server.js:20-22`, README, lock regen, `tests/models.test.js` identity
- [ ] Task 8 cross-repo verification sweep; Task 9 hand-off (no box change)
- [ ] Task 11 Deploy A (HUMAN-CONFIRM): rsync web-core → `npm install --install-links` in both consumers → identity probe → `pm2 reload` — oci1, verify, oci2

### Gates
- [ ] Task 10 — G2 corporate `/health` above `buildSessionMiddleware` (200 / no-store / NO set-cookie)
- [ ] Task 12 — G1 (HUMAN-CONFIRM) CF monitor be6953d2… `header.Host` → `["portal.atxwashdryfold.com"]`, +180s pool healthy, probes land in the portal access log

### Release R2 — @crhs/web-core v0.2.0
- [ ] B3a auditLogger LOG_DIR (13-16)   - [ ] B3b CORS env-only (17-20)   - [ ] B3c CSP profiles + goldens (21-26)
- [ ] B3d session `{middleware,store}` + maxAge fixer + collectionName + 'app.sid' (27-31)
- [ ] B3e SystemConfig registerDefaults + 3 core keys (32-36)
- [ ] B3f rateLimiting mechanism-only + store prefix/TTL/sweep + 3 dead limiters deleted (37-42)
- [ ] B3h csrf `createCsrf({tables})` (43-46)   - [ ] B3i-1 move `isInRange` into ipGate.js (47-52)
- [ ] B3i-2 delete storeIPs + previewUnlockCookie, index 26, corporate smoke 26 (53)
- [ ] Task 54 cut v0.2.0   - [ ] Task 55 Deploy B (HUMAN-CONFIRM) — the single point v0.2.0 reaches the boxes
- [ ] Tasks 56-57 post-deploy slice verification   - [ ] Task 58 Plan 1 exit gate

Carve-outs recorded (Global Constraint 16): web-core `securityHeaders.js:83-88`, `assets/js/*bridge*`, `assets/legal/*`
are NOT deleted in Plan 1 (the portal still serves `public/assets/js/parent-iframe-bridge-v3.js` cross-origin).
Spec PRs B3g / B3j / B3k (email brand params + `validateMailConfig()` + `assets/js/i18n.js`) and the repo-wide
`tests/brandNeutral.test.js` are DEFERRED to @crhs/web-core v0.2.1, shipping with Plan 2's Phase 0a.
Affiliate PR B7 (rateLimiting/store adoption, codeAttemptLockout, the `rate_limits` reset fix, the ops script)
is Plan 4. Corporate `collectionName: 'sessions_corporate'` + `SESSION_COOKIE_NAME=crhsent.sid` move to Plan 2 0a.
No prod `.env` key is written in Plan 1 (`RATE_LIMIT_COLLECTION_PREFIX` stays unset so live collection names are unchanged).
```

- [ ] **Step 9: Commit the checklist.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git add tasks/todo.md
git commit -m "$(cat <<'EOF'
plan(1): record the web-core topology/v0.2.0 baseline and the R1/R2 release checklist

Baseline measured 2026-09-09: affiliate mongoose resolution split (app 8.24.1 vs
core 8.24.4), corporate single-instance but split mongodb driver, web-core 0.1.2
against a 0.1.1 installed copy and a 0.1.0 lock entry, corporate suite 4 failed
(pre-existing crhsent-parity ENOENT) / 68 passed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git log --oneline -1
```
Expected: one new commit touching exactly `tasks/todo.md` (`git show --stat HEAD` lists one file).

---

### Task 2: Baseline — clean the working trees, record the suite totals, cut the branches

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/package.json` (revert uncommitted key-reordering from a prior investigation)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/package-lock.json` (revert)
- Delete: `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/zz-probe.test.js` (investigation artifact)
- Test: no new test — this task records the pre-change state that every later RED assertion is measured against

**Interfaces:**
- Consumes: the baseline values recorded in Task 1
- Produces: the three suite totals `<WC_BASE>` / `<CORP_BASE_PASS>` / `<AFF_BASE>` and the three rollback SHAs, pasted into the Task 4 / Task 5 commit bodies; three working branches

- [ ] **Step 1: Revert the uncommitted investigation artifacts in crhs-corporate.**
```bash
git -C /mnt/c/Users/rickh/GitHub/crhs-corporate checkout -- package.json package-lock.json
rm -f /mnt/c/Users/rickh/GitHub/crhs-corporate/tests/zz-probe.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-corporate status --porcelain
```
Expected output: **empty** (clean tree). If `package-lock.json` still shows as modified, an `npm install` ran since; repeat the `checkout --`.

- [ ] **Step 2: Confirm all three repos are clean and record the starting SHAs.**
```bash
for d in /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program \
         /mnt/c/Users/rickh/GitHub/crhs-web-core \
         /mnt/c/Users/rickh/GitHub/crhs-corporate; do
  printf '%s  ' "$(basename "$d")"
  git -C "$d" log --oneline -1
  git -C "$d" status --porcelain | sed 's/^/    DIRTY: /'
done
```
Expected: three one-line SHAs, **no `DIRTY:` lines**. Record the three SHAs — they are the rollback targets in Task 11.

- [ ] **Step 3: Capture the topology BEFORE state (this is the evidence the RED tests will reproduce).**
```bash
node -e "
const A='/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program';
const C='/mnt/c/Users/rickh/GitHub/crhs-corporate';
for (const [name, root] of [['affiliate',A],['corporate',C]]) {
  const wc = require.resolve('@crhs/web-core', { paths: [root] });
  const mg = require.resolve('mongoose', { paths: [root] });
  console.log('--- ' + name);
  console.log('  web-core entry     :', wc);
  console.log('  mongoose (app)     :', mg);
  console.log('  mongoose (via core):', require.resolve('mongoose', { paths: [wc] }));
  console.log('  SAME MONGOOSE      :', mg === require.resolve('mongoose', { paths: [wc] }));
  console.log('  driver via mongoose:', require.resolve('mongodb', { paths: [mg] }));
  console.log('  driver via web-core:', require.resolve('mongodb', { paths: [wc] }));
}
"
```
Expected output (verified 2026-09-09):
```
--- affiliate
  web-core entry     : /mnt/c/Users/rickh/GitHub/crhs-web-core/src/index.js     <-- OUTSIDE the app (symlink)
  SAME MONGOOSE      : false                                                    <-- the split
  driver via mongoose: /mnt/c/.../wavemax-affiliate-program/node_modules/mongodb/lib/index.js
  driver via web-core: /mnt/c/.../crhs-web-core/node_modules/mongodb/lib/index.js
--- corporate
  SAME MONGOOSE      : true
  driver via mongoose: /mnt/c/.../crhs-corporate/node_modules/mongoose/node_modules/mongodb/lib/index.js
  driver via web-core: /mnt/c/.../crhs-corporate/node_modules/mongodb/lib/index.js   <-- the driver split
```

- [ ] **Step 4: Record the three baseline suite results.** Run each and write down the summary line. These are the ONLY absolute totals in Plan 1; every later expectation is a delta from a measurement the task takes itself (Global Constraint 24).
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -5
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npm test 2>&1 | tail -5
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npm test 2>&1 | tail -5
```
Expected: web-core `Tests: 541 passed` across `Test Suites: 31 passed, 31 total`; corporate `4 failed, 68 passed` (the pre-existing `crhsent-parity` ENOENT cases from Task 1 Step 5 — this is the corporate baseline, not a regression); affiliate all green. Record the three numbers as `<WC_BASE>`, `<CORP_BASE_PASS>`, `<AFF_BASE>`. **If web-core or the affiliate is red before you start, stop and fix or record it — a pre-existing failure will be misattributed to this plan.** Per the 2026-06-20 lesson, re-run any failing affiliate suite *alone* before treating it as real.

- [ ] **Step 5: Create the working branch in each repo.**
```bash
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core  checkout -b topology/install-links-peers
git -C /mnt/c/Users/rickh/GitHub/crhs-corporate checkout -b topology/install-links-peers
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program checkout -b topology/install-links-peers
```
Expected: `Switched to a new branch 'topology/install-links-peers'` three times.

---

### Task 3: web-core — resolve the mongodb driver THROUGH mongoose (prerequisite for dropping the direct dep)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/utils/mongoCursorRetry.js:89` (the `require('mongodb').Collection` default)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/utils/mongoOracleDiagnostics.js:106` (the `require('mongodb/package.json').version` fallback)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/utils/mongoCursorRetry.test.js` (append one test to the existing `installCursorRetry (findOne)` describe, currently ends `:99`)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/utils/mongoOracleDiagnostics.test.js` (append one test)

**Interfaces:**
- Consumes: nothing
- Produces: `installCursorRetry(opts)` — when `opts.Collection` is omitted it now patches `require('mongoose').mongo.Collection`; `installOracleDiagnostics(opts)` — when `opts.driverVersion` is omitted it now reports the driver version resolved through mongoose. Both signatures are unchanged; only the defaults move. Consumed by Task 4, which drops the direct `mongodb` dependency these two lines currently require.

- [ ] **Step 0: Record this task's web-core suite baseline (Global Constraint 24).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -5
```
Expected: `0 failed`. Record the `Tests: <N> passed` number as `<BASE>` for Step 8.

- [ ] **Step 1: Write the failing behavioural test for the cursor-retry default.** Append inside the existing `describe('installCursorRetry (findOne)', …)` block in `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/utils/mongoCursorRetry.test.js`, immediately before its closing `});` (currently line 99):
```js
    // REGRESSION (dependency topology, 2026-09-09): web-core declared its own
    // `mongodb ^6.21.0` while mongoose 8.24.x pins ~6.20.0, so the default
    // `require('mongodb').Collection` patched a driver class NOTHING used — a
    // silent no-op of the Oracle cursor retry the portal relies on at
    // server.js:59. The default must be the class mongoose actually loads.
    test('with no Collection injected, patches the driver class mongoose uses', () => {
      const mongoose = require('mongoose');
      const Collection = mongoose.mongo.Collection;
      const originalFindOne = Collection.prototype.findOne;
      try {
        expect(installCursorRetry({ retries: 1, backoffMs: 0 })).toBe(true);
        expect(Collection.prototype.__cursorRetryInstalled).toBe(true);
        expect(Collection.prototype.findOne).not.toBe(originalFindOne);
      } finally {
        // Never leak a prototype patch across test files (--runInBand).
        Collection.prototype.findOne = originalFindOne;
        delete Collection.prototype.__cursorRetryInstalled;
      }
    });
```

- [ ] **Step 2: Run it and confirm it fails for the right reason.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/utils/mongoCursorRetry.test.js --runInBand 2>&1 | tail -25
```
Expected failure — the patch landed on the *other* driver, so mongoose's class is untouched:
```
● mongoCursorRetry › installCursorRetry (findOne) › with no Collection injected, patches the driver class mongoose uses
    expect(received).toBe(expected)
    Expected: true
    Received: undefined
      > expect(Collection.prototype.__cursorRetryInstalled).toBe(true);
Tests: 1 failed, 6 passed
```
(`installCursorRetry` itself returned `true` — it patched `crhs-web-core/node_modules/mongodb` 6.21.0. That is the bug.)

- [ ] **Step 3: Write the failing test for the diagnostics driver-version fallback.** Append at the end of `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/utils/mongoOracleDiagnostics.test.js`, inside the outermost `describe`:
```js
  test('with no driverVersion injected, reports the version mongoose actually loads', () => {
    const expected = require(
      require.resolve('mongodb/package.json', { paths: [require.resolve('mongoose')] })
    ).version;
    const infos = [];
    installOracleDiagnostics({
      client: { on: () => {} },
      write: () => {},
      label: 'probe',
      logger: { info: (m) => infos.push(m), warn: () => {}, error: () => {} }
    });
    expect(infos).toHaveLength(1);
    expect(infos[0]).toContain(`driver ${expected}`);
  });
```
Ensure `installOracleDiagnostics` is in that file's destructured require; if it is not, extend the existing require line to `const { isCursorAnomaly, buildAnomalyRecord, installOracleDiagnostics } = require('../../src/utils/mongoOracleDiagnostics');`.

- [ ] **Step 4: Run it and confirm the expected failure.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/utils/mongoOracleDiagnostics.test.js --runInBand 2>&1 | tail -20
```
Expected: `Expected substring: "driver 6.20.0"` / `Received string: "Oracle cursor diagnostics attached (probe, driver 6.21.0)"` — the two drivers, named.

- [ ] **Step 5: Fix the cursor-retry default.** In `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/utils/mongoCursorRetry.js`, replace line 89:
```js
  const Collection = opts.Collection || require('mongodb').Collection;
```
with:
```js
  // Take the driver class FROM MONGOOSE, never from a separately-resolved
  // `mongodb`. web-core does not declare mongodb; mongoose owns the driver, and
  // patching any other copy is a silent no-op (topology fix, 2026-09-09).
  // eslint-disable-next-line global-require
  const Collection = opts.Collection || require('mongoose').mongo.Collection;
```
(The `// eslint-disable-next-line global-require` already on line 88 stays with the new line.)

- [ ] **Step 6: Fix the diagnostics version fallback.** In `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/utils/mongoOracleDiagnostics.js`, replace line 106:
```js
    || (() => { try { return require('mongodb/package.json').version; } catch (_) { return null; } })();
```
with:
```js
    || (() => {
      try {
        // Resolve the driver THROUGH mongoose so the reported version is the
        // one in use; web-core no longer declares mongodb itself.
        return require(
          require.resolve('mongodb/package.json', { paths: [require.resolve('mongoose')] })
        ).version;
      } catch (_) { return null; }
    })();
```

- [ ] **Step 7: Run both test files and confirm PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/utils/mongoCursorRetry.test.js tests/utils/mongoOracleDiagnostics.test.js --runInBand 2>&1 | tail -8
```
Expected: `Test Suites: 2 passed, 2 total` and `Tests: 0 failed`.

- [ ] **Step 8: Run the whole web-core suite — nothing else may move.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -6
```
Expected: `Tests: <BASE>+2 passed`, `0 failed`, where `<BASE>` is the number recorded in Step 0. Any other delta means the prototype restore in Step 1 leaked — fix it before continuing.

- [ ] **Step 9: Commit.**
```bash
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core add \
  src/utils/mongoCursorRetry.js src/utils/mongoOracleDiagnostics.js \
  tests/utils/mongoCursorRetry.test.js tests/utils/mongoOracleDiagnostics.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core commit -m "$(cat <<'EOF'
fix(mongo): take the driver class from mongoose, not a separate mongodb copy

web-core declared `mongodb ^6.21.0` directly while mongoose 8.24.x pins
~6.20.0, so `installCursorRetry()` patched a Collection class no connection
ever used — a silent no-op of the Oracle cursor retry the portal installs at
server.js:59, and a wrong driver version in every diagnostics record.

Both defaults now resolve through mongoose. Signatures unchanged; injected
`opts.Collection` / `opts.driverVersion` still win. This is the prerequisite
for dropping the direct mongodb dependency in the next commit.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: web-core — peerDependencies for the four stateful deps, drop `mongodb`, bump to 0.1.3

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/package.json` (`version`; move 4 keys out of `dependencies`; delete `mongodb` from `dependencies`; new `peerDependencies` block; 4 keys added to `devDependencies`)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/package-lock.json` (regenerated by `npm install`)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/packageTopology.test.js` (**new** — this is the repo's only packaging test file; there is no `tests/packaging.test.js`, and Task 54 appends its release cases to *this* file)

**Interfaces:**
- Consumes: `installCursorRetry` / `installOracleDiagnostics` no longer require `mongodb` (Task 3)
- Produces: `@crhs/web-core@0.1.3` with `peerDependencies: { connect-mongo ^5.1.0, express-rate-limit 7.1.4, express-session ^1.18.1, mongoose ^8.15.0 }`, the same four mirrored in `devDependencies`, and **no** `mongodb` in any dependency block. Consumed by Task 5 (affiliate lock), Task 7 (corporate lock) and Task 54 (release bump).

> ⚠ `package.json` as committed keeps `"files"` and `"engines"` each on ONE line. Locate keys **by name**; the spec's §7.1.1 line numbers (L16/L21/L22/L25/L26) assume a reformat that has not happened.

- [ ] **Step 1: Write the failing contract test.** Create `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/packageTopology.test.js`:
```js
// Contract test for the v0.1.3 dependency topology (option c).
//
// web-core is a shared library with TWO live consumers. If it carries the
// stateful deps as ordinary `dependencies`, npm is free to SILENTLY nest a
// second copy in a consumer whose pin falls outside web-core's range — forking
// mongoose's model registry and connection pool with no error at install time.
// As peerDependencies the same case becomes a loud ERESOLVE. They stay in
// devDependencies so this suite still has something to install.
const { execFileSync } = require('child_process');
const path = require('path');
const pkg = require('../package.json');

const ROOT = path.join(__dirname, '..');
const SHARED_STATEFUL_DEPS = ['connect-mongo', 'express-rate-limit', 'express-session', 'mongoose'];

describe('package topology (v0.1.3 peer contract)', () => {
  test('version is the topology release', () => {
    expect(pkg.version).toBe('0.1.3');
  });

  test.each(SHARED_STATEFUL_DEPS)('%s is a peerDependency, not a dependency', (name) => {
    expect(pkg.dependencies[name]).toBeUndefined();
    expect(pkg.peerDependencies).toBeDefined();
    expect(pkg.peerDependencies[name]).toBeDefined();
  });

  test.each(SHARED_STATEFUL_DEPS)('%s stays in devDependencies so this suite can run', (name) => {
    expect(pkg.devDependencies[name]).toBeDefined();
  });

  test.each(SHARED_STATEFUL_DEPS)('%s peer range equals its dev range (no silent drift)', (name) => {
    expect(pkg.peerDependencies[name]).toBe(pkg.devDependencies[name]);
  });

  test('mongodb is not declared anywhere — the driver comes from mongoose', () => {
    expect(pkg.dependencies.mongodb).toBeUndefined();
    expect((pkg.peerDependencies || {}).mongodb).toBeUndefined();
    expect(pkg.devDependencies.mongodb).toBeUndefined();
  });

  test('no source file requires mongodb directly', () => {
    // grep exits 1 with no output when there is no match; -r over src only.
    let out = '';
    try {
      out = execFileSync('grep', ['-rn', "require('mongodb", 'src'], { cwd: ROOT, encoding: 'utf8' });
    } catch (e) {
      if (e.status !== 1) throw e;   // 1 = no matches, which is what we want
      out = '';
    }
    expect(out.trim()).toBe('');
  });
});
```
This file defines **15 Jest cases**: 1 version + three `test.each` blocks over 4 deps (12) + 1 mongodb + 1 grep.

- [ ] **Step 2: Run it and confirm every expected failure.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/packageTopology.test.js --runInBand 2>&1 | tail -30
```
Expected: **`Tests: 14 failed, 1 passed, 15 total`.** Version fails (`Expected: "0.1.3"` / `Received: "0.1.2"`); the 4 peer tests fail on `expect(pkg.dependencies[name]).toBeUndefined()` (each is still a real dependency); the 4 devDependency tests fail (`Received: undefined`); the 4 range tests fail on `pkg.peerDependencies` being `undefined`; the mongodb test fails (`Received: "^6.21.0"`). The **grep test passes** — that is the proof Task 3 already removed both direct requires.

- [ ] **Step 3: Edit `/mnt/c/Users/rickh/GitHub/crhs-web-core/package.json`.** Set `"version": "0.1.3"`, remove `connect-mongo`, `express-rate-limit`, `express-session`, `mongodb`, `mongoose` from `dependencies`, and add the two blocks. The resulting file:
```json
{
  "name": "@crhs/web-core",
  "version": "0.1.3",
  "description": "Shared security & infrastructure core for CRHS web apps",
  "main": "src/index.js",
  "scripts": {
    "test": "TZ=America/Chicago jest --runInBand",
    "test:watch": "TZ=America/Chicago jest --watch",
    "lint": "eslint src tests"
  },
  "author": "CRHS Enterprises, LLC",
  "license": "UNLICENSED",
  "private": true,
  "files": ["src", "assets"],
  "dependencies": {
    "cookie-parser": "^1.4.7",
    "cors": "2.8.5",
    "csrf-csrf": "^4.0.3",
    "express-mongo-sanitize": "^2.2.0",
    "helmet": "7.1.0",
    "ipaddr.js": "1.9.1",
    "nodemailer": "^8.0.7",
    "winston": "^3.10.0",
    "xss": "^1.0.15"
  },
  "peerDependencies": {
    "connect-mongo": "^5.1.0",
    "express-rate-limit": "7.1.4",
    "express-session": "^1.18.1",
    "mongoose": "^8.15.0"
  },
  "devDependencies": {
    "connect-mongo": "^5.1.0",
    "eslint": "^8.54.0",
    "express": "^4.21.2",
    "express-rate-limit": "7.1.4",
    "express-session": "^1.18.1",
    "jest": "^29.7.0",
    "jsdom": "^26.1.0",
    "mongodb-memory-server": "^10.1.4",
    "mongoose": "^8.15.0",
    "node-mocks-http": "^1.17.2",
    "supertest": "^6.3.3"
  },
  "engines": { "node": ">=18.0.0" }
}
```

- [ ] **Step 4: Reinstall web-core so its own node_modules matches the new manifest.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm install 2>&1 | tail -5
node -p "require('/mnt/c/Users/rickh/GitHub/crhs-web-core/node_modules/mongoose/package.json').version"
ls /mnt/c/Users/rickh/GitHub/crhs-web-core/node_modules/mongodb/package.json 2>&1 || echo 'direct mongodb GONE (expected)'
```
Expected: install succeeds (devDeps supply all four peers), mongoose prints `8.24.4`, and the direct `mongodb` is either gone or has become mongoose's own 6.20.0 hoisted up — either is fine, since no source file requires it any more.

- [ ] **Step 5: Run the contract test and confirm PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/packageTopology.test.js --runInBand 2>&1 | tail -8
```
Expected: `Tests: 15 passed, 15 total`.

- [ ] **Step 6: Run the full web-core suite — the peer move must not touch behaviour.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -6
```
Expected: `Tests: <the count printed at the end of Task 3 Step 8> + 15 passed`, `0 failed`, and one more suite file than Task 3 reported. Note the `installCursorRetry` default now resolves mongoose's 6.20.0 driver, so the Task 3 test that was red at baseline stays green.

- [ ] **Step 7: Commit.**
```bash
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core add package.json package-lock.json tests/packageTopology.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core commit -m "$(cat <<'EOF'
deps: peer the four stateful deps, drop mongodb, bump to 0.1.3

mongoose, express-session, connect-mongo and express-rate-limit move from
dependencies to peerDependencies (mirrored in devDependencies so this suite
still installs them). As ordinary dependencies npm SILENTLY nests a second
copy in a consumer whose pin sits outside our range; as peers the same case is
a loud ERESOLVE at install time.

mongodb is dropped entirely — the driver belongs to mongoose, and carrying
^6.21.0 against mongoose's ~6.20.0 is what made installCursorRetry patch a
class nothing used (fixed in the previous commit).

tests/packageTopology.test.js locks the contract, including a grep guard that
fails if any src file reintroduces require('mongodb').

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: affiliate — `.npmrc install-links=true`, regenerated lock, and the instance-identity test

**Files:**
- Create: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/.npmrc`
- Create: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/integration/webCoreInstanceIdentity.test.js`
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/package-lock.json` (currently records `"node_modules/@crhs/web-core": { "resolved": "../crhs-web-core", "link": true }` at `:700-703`)
- Test: the new file above

**Interfaces:**
- Consumes: `@crhs/web-core@0.1.3` with peerDependencies (Task 4)
- Produces: a single hoisted copy of mongoose / express-session / connect-mongo / express-rate-limit shared by the app and the installed web-core copy; `tests/integration/webCoreInstanceIdentity.test.js` as the permanent regression guard; and **the copy semantics that bind every later affiliate task** (Global Constraint 25) — from this task onward `node_modules/@crhs/web-core` is a real directory, so an affiliate task cannot see a web-core edit until it runs `npm install --install-links`.

> **Hazard: model double-registration (Global Constraint 9).** This test must not `require('@crhs/web-core').SystemConfig` to compare `.base` — the affiliate registers `SystemConfig` on every test run (`tests/setup.js:160`), so loading web-core's byte-identical twin throws `OverwriteModelError`. Cross-package identity is proved with `require.resolve()` strings, which load nothing. Requiring **this app's own** `server/models/SystemConfig` is a different thing entirely and is safe — `tests/setup.js:157-164` already does it on every run — which is why assertion (c) below is legitimate.

- [ ] **Step 1: Write the failing identity test.** Create `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/integration/webCoreInstanceIdentity.test.js`:
```js
// Topology guard: this app and @crhs/web-core MUST resolve exactly ONE copy of
// every stateful dependency they share. A dual-package install throws nothing —
// it just forks mongoose's model registry, its connection pool and its driver,
// so a document written through one instance is invisible to the other.
//
// PROOF TECHNIQUE — resolution paths ONLY for the CROSS-PACKAGE comparison.
// We must not require web-core's SystemConfig to compare `.base`: this app
// registers its own mongoose.model('SystemConfig') at
// server/models/SystemConfig.js:449, and tests/setup.js:160 does it on every
// run, so loading web-core's byte-identical twin throws OverwriteModelError.
// Comparing require.resolve() strings loads no module at all. Requiring THIS
// APP's own model (assertion c) is safe — tests/setup.js:157-164 already does.
const fs = require('fs');
const path = require('path');

const APP_ROOT = path.join(__dirname, '..', '..');
const CORE_ENTRY = require.resolve('@crhs/web-core');

/** Resolve `name` the way a module at `from` would, without loading it. */
function resolveFrom(name, from) {
  return require.resolve(name, { paths: [from] });
}

/** Same, but returns null instead of throwing when nothing resolves. */
function tryResolveFrom(name, from) {
  try { return resolveFrom(name, from); } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') return null;
    throw e;
  }
}

const SHARED_STATEFUL_DEPS = ['mongoose', 'express-session', 'connect-mongo', 'express-rate-limit'];

describe('@crhs/web-core instance identity (dependency topology)', () => {
  test('web-core is installed as a real copy inside this app, not a symlink to the source tree', () => {
    const installed = path.join(APP_ROOT, 'node_modules', '@crhs', 'web-core');
    expect(fs.lstatSync(installed).isSymbolicLink()).toBe(false);
    expect(CORE_ENTRY.startsWith(path.join(APP_ROOT, 'node_modules') + path.sep)).toBe(true);
  });

  test.each(SHARED_STATEFUL_DEPS)(
    '%s resolves to ONE module for both this app and web-core',
    (name) => {
      expect(resolveFrom(name, CORE_ENTRY)).toBe(resolveFrom(name, APP_ROOT));
    }
  );

  test('no second copy of any shared dep is nested under the installed web-core', () => {
    const coreDir = path.dirname(path.dirname(CORE_ENTRY)); // .../@crhs/web-core
    for (const name of SHARED_STATEFUL_DEPS) {
      expect({ name, nested: fs.existsSync(path.join(coreDir, 'node_modules', name)) })
        .toEqual({ name, nested: false });
    }
  });

  test('web-core never sees a mongodb driver other than the one mongoose loads', () => {
    const viaMongoose = resolveFrom('mongodb', resolveFrom('mongoose', APP_ROOT));
    expect(typeof viaMongoose).toBe('string');
    const viaCore = tryResolveFrom('mongodb', CORE_ENTRY);
    // Either web-core resolves no mongodb at all (it no longer declares one and
    // nothing hoisted a stray copy — fine, it goes through mongoose), or it
    // resolves the very same file. A DIFFERENT copy is the failure mode.
    if (viaCore !== null) expect(viaCore).toBe(viaMongoose);
  });

  // Assertion (c) from spec §7.1.2. This requires THIS APP's own model, which
  // tests/setup.js:157-164 already loads on every run — it is NOT web-core's
  // twin, so it cannot raise OverwriteModelError. Before the topology fix,
  // seeding through a forked mongoose instance wrote into a connection the
  // suite never reads, and tests/setup.js swallowed the error.
  test('initializeDefaults() resolves through THIS APP\'s model and seeds the collection', async () => {
    const SystemConfig = require('../../server/models/SystemConfig');
    await expect(SystemConfig.initializeDefaults()).resolves.not.toThrow();
    expect(await SystemConfig.countDocuments({})).toBeGreaterThanOrEqual(3);
  });
});
```
This file defines **8 cases**: 1 copy/symlink + 4 resolution-path + 1 nested-copy + 1 driver + 1 seed.

- [ ] **Step 2: Run it and confirm it fails for the right reason.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program \
  && npx jest tests/integration/webCoreInstanceIdentity.test.js --runInBand --forceExit 2>&1 | tail -40
```
Expected: **7 failed, 1 passed** (the seed case passes — it never depended on the split). Named failures:
```
● … › web-core is installed as a real copy inside this app, not a symlink …
    Expected: false   Received: true      (fs.lstatSync(...).isSymbolicLink())
● … › mongoose resolves to ONE module for both this app and web-core
    Expected: "/mnt/c/.../wavemax-affiliate-program/node_modules/mongoose/index.js"
    Received: "/mnt/c/.../crhs-web-core/node_modules/mongoose/index.js"
   (and the same for express-session, connect-mongo, express-rate-limit)
● … › no second copy of any shared dep is nested under the installed web-core
    - "nested": false  + "nested": true
● … › web-core never sees a mongodb driver other than the one mongoose loads
    Expected: ".../wavemax-affiliate-program/node_modules/mongodb/lib/index.js"
    Received: ".../crhs-web-core/node_modules/mongodb/lib/index.js"
```

- [ ] **Step 3: Create the `.npmrc`.** Write `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/.npmrc` (the file does not exist today — `ls: cannot access '.npmrc'`):
```
# Install `file:` dependencies as real COPIES, not symlinks.
#
# Without this, node_modules/@crhs/web-core is a symlink into
# ../crhs-web-core, so web-core resolves ITS node_modules (mongoose 8.24.4)
# while this app resolves its own (8.24.1) — two mongoose instances, two model
# registries, two connection pools. The boxes already install with
# `npm install --install-links`; this makes local dev match production.
#
# CONSEQUENCE for every later task in this repo: a @crhs/web-core edit is NOT
# visible here until you run `npm install --install-links`.
#
# Guarded by tests/integration/webCoreInstanceIdentity.test.js and by the
# fail-fast check in tests/setup.js.
install-links=true
```

- [ ] **Step 4: Reinstall so the symlink becomes a copy and the lock is regenerated.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program \
  && rm -rf node_modules/@crhs \
  && npm install --install-links 2>&1 | tail -8
ls -ld /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/node_modules/@crhs/web-core
```
Expected: install succeeds with **no ERESOLVE** (the app already declares all four peers at web-core's exact ranges), and the `ls` now shows `drwx…` (a directory), **not** `lrwx… -> ../../../crhs-web-core`. If npm reports `ERESOLVE`, a range diverged — that is the peer block doing its job; reconcile the range rather than forcing.

- [ ] **Step 5: Confirm the lock no longer records a link, and records the new web-core version.**
```bash
node -e "
const l=require('/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/package-lock.json');
const e=l.packages['node_modules/@crhs/web-core'];
console.log(JSON.stringify(e,null,2));
console.log('mongoose:', l.packages['node_modules/mongoose'].version);
"
```
Expected: the entry has **no `"link": true`**, carries `"version": "0.1.3"`, and mongoose prints a single version (`8.24.4` — npm dedupes to the newest satisfying `^8.15.0`; the move from 8.24.1 is expected and is exactly why Step 7 runs the whole suite).

- [ ] **Step 6: Run the identity test and confirm PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program \
  && npx jest tests/integration/webCoreInstanceIdentity.test.js --runInBand --forceExit 2>&1 | tail -8
```
Expected: `Tests: 8 passed, 8 total`.

- [ ] **Step 7: Run the FULL affiliate suite — mongoose moved 8.24.1 → 8.24.4, so nothing may regress.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npm test 2>&1 | tail -8
```
Expected: `<AFF_BASE>` (Task 2 Step 4) **+8**, zero failures. Per the 2026-06-20 lesson, re-run any failing suite **alone** before debugging it — several affiliate suites fail in a full run and pass in isolation.

- [ ] **Step 8: Commit.**
```bash
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program add \
  .npmrc package-lock.json tests/integration/webCoreInstanceIdentity.test.js
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program commit -m "$(cat <<'EOF'
deps: install-links=true so web-core shares this app's mongoose

Local dev was the odd one out: no .npmrc meant node_modules/@crhs/web-core was
a SYMLINK, so web-core resolved its own mongoose 8.24.4 while the app resolved
8.24.1 — two model registries and two connection pools. Dormant only because
the app currently touches no DB-bearing web-core module. The boxes already
install with --install-links; this makes local match production.

tests/integration/webCoreInstanceIdentity.test.js locks it. The cross-package
proof is require.resolve() strings ONLY: this app registers its own
mongoose.model('SystemConfig') at server/models/SystemConfig.js:449 and in
tests/setup.js, so loading web-core's twin to compare `.base` would throw
OverwriteModelError until that inline model is retired. Requiring this app's
OWN model to prove initializeDefaults() seeds is safe and is asserted.

mongoose dedupes 8.24.1 -> 8.24.4; full suite re-run green.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: affiliate — fail-fast guard in `tests/setup.js` when the resolution paths diverge

**Files:**
- Create: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/helpers/assertSingleMongoose.js`
- Create: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/unit/assertSingleMongoose.test.js`
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/setup.js:1` (insert the guard block above the existing `// Basic test setup` on line 1)

**Interfaces:**
- Consumes: the single-instance topology from Task 5
- Produces: `assertSingleInstance({ resolveFromApp, resolveFromCore, names? }) => true` (throws a named-and-pathed `Error` on any divergence) and `SHARED_STATEFUL_DEPS: string[]`, exported from `tests/helpers/assertSingleMongoose.js`

> Why a helper rather than an inline block: an inline guard in `setup.js` is production-shaped code with no test. The pure function takes injected resolvers, so its failure message is unit-testable without corrupting the real install.

- [ ] **Step 1: Write the failing unit test.** Create `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/unit/assertSingleMongoose.test.js`:
```js
const {
  assertSingleInstance,
  SHARED_STATEFUL_DEPS
} = require('../helpers/assertSingleMongoose');

const APP = '/app/node_modules';
const CORE = '/app/node_modules';

function resolver(prefix, overrides = {}) {
  return (name) => overrides[name] || `${prefix}/${name}/index.js`;
}

describe('assertSingleInstance', () => {
  test('exports the four stateful deps the two apps share', () => {
    expect(SHARED_STATEFUL_DEPS).toEqual(
      ['mongoose', 'express-session', 'connect-mongo', 'express-rate-limit']
    );
  });

  test('returns true when every dep resolves to the same file', () => {
    expect(assertSingleInstance({
      resolveFromApp: resolver(APP),
      resolveFromCore: resolver(CORE)
    })).toBe(true);
  });

  test('throws naming the split dep and BOTH paths', () => {
    const call = () => assertSingleInstance({
      resolveFromApp: resolver(APP),
      resolveFromCore: resolver('/app/node_modules/@crhs/web-core/node_modules')
    });
    expect(call).toThrow(/Dual-package install detected/);
    expect(call).toThrow(/mongoose/);
    expect(call).toThrow(/\/app\/node_modules\/mongoose\/index\.js/);
    expect(call).toThrow(/@crhs\/web-core\/node_modules\/mongoose\/index\.js/);
  });

  test('lists EVERY split dep, not just the first', () => {
    let message = '';
    try {
      assertSingleInstance({
        resolveFromApp: resolver(APP),
        resolveFromCore: resolver('/elsewhere')
      });
    } catch (e) { message = e.message; }
    for (const name of SHARED_STATEFUL_DEPS) expect(message).toContain(name);
  });

  test('names only the deps that actually diverged', () => {
    let message = '';
    try {
      assertSingleInstance({
        resolveFromApp: resolver(APP),
        resolveFromCore: resolver(APP, { 'connect-mongo': '/elsewhere/connect-mongo/index.js' })
      });
    } catch (e) { message = e.message; }
    expect(message).toContain('connect-mongo');
    expect(message).not.toContain('express-session');
  });

  test('tells the operator exactly how to fix it', () => {
    expect(() => assertSingleInstance({
      resolveFromApp: resolver(APP),
      resolveFromCore: resolver('/elsewhere')
    })).toThrow(/install-links=true/);
  });

  test('honours a caller-supplied names list', () => {
    expect(assertSingleInstance({
      resolveFromApp: resolver(APP),
      resolveFromCore: resolver('/elsewhere'),
      names: []
    })).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm the expected failure.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program \
  && npx jest tests/unit/assertSingleMongoose.test.js --runInBand --forceExit 2>&1 | tail -15
```
Expected: the suite fails to even load — `Cannot find module '../helpers/assertSingleMongoose' from 'tests/unit/assertSingleMongoose.test.js'`. That is the correct red for a not-yet-written module.

- [ ] **Step 3: Implement the helper.** Create `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/helpers/assertSingleMongoose.js`:
```js
'use strict';

/**
 * Fail-fast topology guard for the test bootstrap.
 *
 * A dual-package install of @crhs/web-core is silent: nothing throws, and the
 * suite goes green while the app and the library write through two different
 * mongoose instances. This turns that into a loud, actionable error on the
 * first test file that loads.
 *
 * Resolvers are injected so this stays a pure function (unit-testable without
 * corrupting a real node_modules tree) and so the caller keeps control over
 * whether anything is actually LOADED — this module loads nothing.
 */

/** Deps that carry process-wide state and MUST be one instance. */
const SHARED_STATEFUL_DEPS = ['mongoose', 'express-session', 'connect-mongo', 'express-rate-limit'];

/**
 * @param {object} deps
 * @param {(name: string) => string} deps.resolveFromApp   resolve as the app would
 * @param {(name: string) => string} deps.resolveFromCore  resolve as web-core would
 * @param {string[]} [deps.names=SHARED_STATEFUL_DEPS]
 * @returns {true}
 * @throws {Error} listing every dep that resolves to two different files
 */
function assertSingleInstance({ resolveFromApp, resolveFromCore, names = SHARED_STATEFUL_DEPS }) {
  const split = [];
  for (const name of names) {
    const app = resolveFromApp(name);
    const core = resolveFromCore(name);
    if (app !== core) split.push(`  ${name}\n    app      -> ${app}\n    web-core -> ${core}`);
  }
  if (split.length) {
    throw new Error(
      'Dual-package install detected: this app and @crhs/web-core resolve '
      + 'DIFFERENT copies of:\n'
      + split.join('\n')
      + '\n\nEach copy carries its own model registry and connection pool, so '
      + 'documents written through one are invisible to the other.\n'
      + 'Fix: confirm .npmrc contains `install-links=true`, then\n'
      + '  rm -rf node_modules/@crhs && npm install --install-links'
    );
  }
  return true;
}

module.exports = { assertSingleInstance, SHARED_STATEFUL_DEPS };
```

- [ ] **Step 4: Run the unit test and confirm PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program \
  && npx jest tests/unit/assertSingleMongoose.test.js --runInBand --forceExit 2>&1 | tail -8
```
Expected: `Tests: 7 passed, 7 total`.

- [ ] **Step 5: Wire the guard into the test bootstrap.** In `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/setup.js`, insert **above** the current line 1 (`// Basic test setup`) so it runs before mongoose is required:
```js
// TOPOLOGY GUARD — runs before anything requires mongoose.
// A dual-package install of @crhs/web-core is silent: the suite goes green
// while the app and the library write through two different mongoose
// instances. Fail here instead, with the offending paths named.
// Resolution paths ONLY — loading web-core's SystemConfig to compare `.base`
// would throw OverwriteModelError against this app's own model
// (server/models/SystemConfig.js:449, re-registered at :160 below).
{
  const nodePath = require('path');
  const { assertSingleInstance } = require('./helpers/assertSingleMongoose');
  const APP_ROOT = nodePath.join(__dirname, '..');
  const CORE_ENTRY = require.resolve('@crhs/web-core');
  assertSingleInstance({
    resolveFromApp: (n) => require.resolve(n, { paths: [APP_ROOT] }),
    resolveFromCore: (n) => require.resolve(n, { paths: [CORE_ENTRY] })
  });
}

// Basic test setup
```

- [ ] **Step 6: Prove the guard actually fires** by temporarily disabling `install-links` and watching a test file refuse to run.
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program \
  && mv .npmrc .npmrc.off && rm -rf node_modules/@crhs && npm install 2>&1 | tail -3 \
  && npx jest tests/unit/assertSingleMongoose.test.js --runInBand --forceExit 2>&1 | tail -20
```
Expected: the suite fails **during setup**, printing `Dual-package install detected: this app and @crhs/web-core resolve DIFFERENT copies of:` followed by `mongoose`, both paths, and the `rm -rf node_modules/@crhs && npm install --install-links` fix line.

- [ ] **Step 7: Restore the correct install and confirm green.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program \
  && mv .npmrc.off .npmrc && rm -rf node_modules/@crhs && npm install --install-links 2>&1 | tail -3 \
  && git checkout -- package-lock.json \
  && npx jest tests/unit/assertSingleMongoose.test.js tests/integration/webCoreInstanceIdentity.test.js --runInBand --forceExit 2>&1 | tail -8
```
Expected: `Test Suites: 2 passed`, `Tests: 15 passed` (7 + 8). The `git checkout -- package-lock.json` undoes any churn the Step-6 detour wrote into the lock — verify with `git status --porcelain` that only the three intended files are modified.

- [ ] **Step 8: Run the full affiliate suite (the guard now runs before EVERY test file).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npm test 2>&1 | tail -8
```
Expected: Task 5's count **+7**, zero failures.

- [ ] **Step 9: Commit.**
```bash
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program add \
  tests/helpers/assertSingleMongoose.js tests/unit/assertSingleMongoose.test.js tests/setup.js
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program commit -m "$(cat <<'EOF'
test(setup): fail fast on a dual-package @crhs/web-core install

The identity test proves the topology once; this guard proves it before EVERY
test file, so a stray `npm install` (without --install-links) or a future
range divergence surfaces as a named error instead of a green suite running
against two mongoose instances.

The check is a pure injected-resolver function so its message is unit-tested
without corrupting a real node_modules tree, and it loads nothing — comparing
require.resolve() strings avoids the OverwriteModelError this app's inline
SystemConfig model would otherwise raise.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: corporate — declare the four explicitly, correct the `server.js:20-22` comment, update the README, regenerate the lock

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/package.json` (`dependencies` gains 4 keys)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/server.js:20-22` (the "mongoose is intentionally NOT a declared dependency" comment — now false)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/README.md:18-23` and `:107-115` (spec §7.1.1 requires this)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/package-lock.json` (records web-core `0.1.0` at `:534-536` against an installed `0.1.1` and a source `0.1.3` — a three-way drift)
- Create: `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/packageTopology.test.js`
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/models.test.js:88-96` (extend the existing shared-instance guard)

**Interfaces:**
- Consumes: `@crhs/web-core@0.1.3` peerDependencies (Task 4)
- Produces: corporate `dependencies` declaring `connect-mongo ^5.1.0`, `express-rate-limit 7.1.4`, `express-session ^1.18.1`, `mongoose ^8.15.0`; corporate lock recording web-core `0.1.3`

> Unlike the affiliate, corporate already has ONE mongoose (its `.npmrc` has `install-links=true`). What is broken here is (a) requiring four packages it never declares — relying on hoisting, which the peer move makes explicit anyway but which must be written down — and (b) the **driver** split: `node_modules/mongodb` 6.21.0 (hoisted from web-core's now-dropped direct dep) vs `node_modules/mongoose/node_modules/mongodb` 6.20.0.

- [ ] **Step 1: Write the failing topology test.** Create `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/packageTopology.test.js`:
```js
// Corporate side of the option-(c) topology contract.
//
// This app requires mongoose (server/db.js:7, scripts/ensure-indexes.js:31,
// tests/setup.js:13 and all five models) without declaring it — it works only
// because npm hoists web-core's copy. Hoisting is not a contract: the day a
// range diverges npm nests a second copy and forks model registration with no
// error. Declaring the four explicitly, against @crhs/web-core's peer ranges,
// makes that case a loud ERESOLVE instead.
const path = require('path');
const pkg = require('../package.json');

const APP_ROOT = path.join(__dirname, '..');
const CORE_ENTRY = require.resolve('@crhs/web-core');
const SHARED_STATEFUL_DEPS = ['connect-mongo', 'express-rate-limit', 'express-session', 'mongoose'];

function tryResolveFrom(name, from) {
  try { return require.resolve(name, { paths: [from] }); } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') return null;
    throw e;
  }
}

describe('dependency topology', () => {
  test.each(SHARED_STATEFUL_DEPS)('%s is declared explicitly, not hoisted by luck', (name) => {
    expect(pkg.dependencies[name]).toBeDefined();
  });

  test.each(SHARED_STATEFUL_DEPS)('%s resolves to ONE module for this app and web-core', (name) => {
    expect(require.resolve(name, { paths: [CORE_ENTRY] }))
      .toBe(require.resolve(name, { paths: [APP_ROOT] }));
  });

  test('the installed web-core is the version this repo expects', () => {
    expect(require('@crhs/web-core/package.json').version).toBe('0.1.3');
  });

  test('web-core never sees a mongodb driver other than the one mongoose loads', () => {
    const viaMongoose = require.resolve('mongodb', {
      paths: [require.resolve('mongoose', { paths: [APP_ROOT] })]
    });
    expect(typeof viaMongoose).toBe('string');
    const viaCore = tryResolveFrom('mongodb', CORE_ENTRY);
    // Either web-core resolves no mongodb at all (correct — it goes through
    // mongoose now), or it resolves the identical file. A different copy is
    // what made installCursorRetry patch a class nothing used.
    if (viaCore !== null) expect(viaCore).toBe(viaMongoose);
  });

  test('this app does not declare mongodb — the driver belongs to mongoose', () => {
    expect(pkg.dependencies.mongodb).toBeUndefined();
    expect(pkg.devDependencies.mongodb).toBeUndefined();
  });
});
```
This file defines **11 cases**: two `test.each` blocks over 4 deps (8) + version + driver + no-mongodb.

- [ ] **Step 2: Run it and confirm the expected mixed red.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/packageTopology.test.js --runInBand 2>&1 | tail -30
```
Expected: **`Tests: 6 failed, 5 passed, 11 total`.** The four "declared explicitly" tests fail (`Received: undefined`); the version test fails (`Expected: "0.1.3"  Received: "0.1.1"`); the driver test fails with
```
Expected: ".../crhs-corporate/node_modules/mongoose/node_modules/mongodb/lib/index.js"
Received: ".../crhs-corporate/node_modules/mongodb/lib/index.js"
```
The four "resolves to ONE module" tests and the "does not declare mongodb" test **pass** — corporate's mongoose was already single, exactly as measured in Task 2.

- [ ] **Step 3: Declare the four in `/mnt/c/Users/rickh/GitHub/crhs-corporate/package.json`.** Replace the `dependencies` block (lines 15-21) with:
```json
  "dependencies": {
    "@crhs/web-core": "file:../crhs-web-core",
    "connect-mongo": "^5.1.0",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.21.2",
    "express-rate-limit": "7.1.4",
    "express-session": "^1.18.1",
    "mongoose": "^8.15.0"
  },
```
The four added ranges are **character-identical** to `@crhs/web-core`'s `peerDependencies` — that identity is what keeps npm from nesting a second copy.

- [ ] **Step 4: Rewrite the now-false comment at `server.js:20-22`.** Replace those three lines:
```js
// NOTE: `mongoose` is intentionally NOT a declared dependency of this app. The
// models register on web-core's single shared mongoose instance; declaring a
// second copy here would fork model registration and break shared state.
```
with:
```js
// `mongoose`, `express-session`, `connect-mongo` and `express-rate-limit` are
// declared in this app's package.json at exactly the ranges @crhs/web-core
// lists as peerDependencies. That pairing — plus `install-links=true` in
// .npmrc — is what makes npm install ONE top-level copy of each, shared by
// this app's models and by web-core's (guarded by tests/models.test.js and
// tests/packageTopology.test.js). Do not drop the declarations (relying on
// hoisting is silent and breaks the moment a range diverges), and do not add
// `mongodb`: the driver must come from mongoose, or web-core's cursor-retry
// shim patches a Collection class nothing uses.
```

- [ ] **Step 5: Update the README (spec §7.1.1).** In `/mnt/c/Users/rickh/GitHub/crhs-corporate/README.md`, rewrite the dependency note at `:18-23` and the local-development note at `:107-115` so both state: (a) this app **declares** `mongoose`, `express-session`, `connect-mongo` and `express-rate-limit` at exactly `@crhs/web-core`'s `peerDependencies` ranges, and that dropping a declaration reintroduces a silent dual-package install; (b) `.npmrc` sets `install-links=true`, so `node_modules/@crhs/web-core` is a real **copy** — **a web-core change is not visible here until `npm install --install-links` is re-run in this directory**, on a dev box and on oci1/oci2 alike. Verify with:
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && grep -c "install-links" README.md
```
Expected: at least `2`.

- [ ] **Step 6: Regenerate the lock (this also clears the recorded-0.1.0 / installed-0.1.1 / source-0.1.3 drift).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate \
  && rm -rf node_modules/@crhs \
  && npm install --install-links 2>&1 | tail -8
node -e "
const l=require('/mnt/c/Users/rickh/GitHub/crhs-corporate/package-lock.json');
console.log('web-core in lock:', l.packages['node_modules/@crhs/web-core'].version);
console.log('web-core installed:', require('/mnt/c/Users/rickh/GitHub/crhs-corporate/node_modules/@crhs/web-core/package.json').version);
console.log('mongoose in lock:', l.packages['node_modules/mongoose'].version);
console.log('top-level mongodb in lock:', (l.packages['node_modules/mongodb']||{}).version || '(none)');
"
```
Expected: `web-core in lock: 0.1.3`, `web-core installed: 0.1.3`, one mongoose version, and the top-level `mongodb` either gone or collapsed onto mongoose's `6.20.0`. **If npm still nests a distinct top-level mongodb, do not force the test to pass** — report it: the `if (viaCore !== null)` branch is deliberately written to tolerate "web-core resolves none" but never "web-core resolves a different one".

- [ ] **Step 7: Run the topology test and confirm PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/packageTopology.test.js --runInBand 2>&1 | tail -8
```
Expected: `Tests: 11 passed, 11 total`.

- [ ] **Step 8: Extend the existing shared-instance guard in `tests/models.test.js`.** Add these lines inside the `test('shared-instance guard: …')` block, after line 95 (`expect(MediatorAccess.base).toBe(wc.SystemConfig.base);`):
```js
    // …and that shared base is the mongoose THIS app requires directly
    // (server/db.js:7, scripts/ensure-indexes.js:31) — not a copy nested
    // under web-core.
    expect(wc.SystemConfig.base).toBe(require('mongoose'));
```
Then update the block comment at `:89-90` to read:
```js
    // If install-links hoisting regressed to a dual-package install, each side
    // would carry its own mongoose and these bases would differ. Since this app
    // now DECLARES mongoose at web-core's peer range, requiring it here is
    // legitimate and must return the very same instance. (`.base` is legal in
    // THIS repo — it has no local SystemConfig model; the affiliate must use a
    // resolution-path proof instead.)
```
**Only if Step 6 showed the nested `mongodb` collapsed**, also add:
```js
    expect(require('mongoose').mongo.Collection).toBe(require('mongodb').Collection);
```
If Step 6 still shows two driver copies, do **not** add that line — report it instead (Global Constraint 11).

- [ ] **Step 9: Run the full corporate suite.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npm test 2>&1 | tail -8
```
Expected: `<CORP_BASE_PASS>` (Task 1 Step 5) **+11 or +12** passed, and exactly `<CORP_BASE_FAIL>` = **4** failures, all in `tests/crhsent-parity.test.js`. Note `tests/webcore.smoke.test.js:10` still asserts `toHaveLength(28)` — that is correct at v0.1.3 because **this task deletes no index keys**; the `28 → 26` edit belongs to Task 53.

- [ ] **Step 10: Commit.**
```bash
git -C /mnt/c/Users/rickh/GitHub/crhs-corporate add \
  package.json package-lock.json server.js README.md tests/packageTopology.test.js tests/models.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-corporate commit -m "$(cat <<'EOF'
deps: declare mongoose + the three other shared stateful deps explicitly

This app required mongoose in server/db.js, scripts/ensure-indexes.js,
tests/setup.js and all five models without declaring it, relying on npm
hoisting web-core's copy. Hoisting is not a contract. The four are now
declared at exactly the ranges @crhs/web-core lists as peerDependencies, so a
future divergence is an ERESOLVE at install time instead of a silently nested
second copy.

Also corrects the server.js comment that asserted the opposite, documents the
install-links copy semantics in the README (a web-core bump needs npm install
HERE), and clears the package-lock drift (recorded 0.1.0 / installed 0.1.1 /
source 0.1.3).

tests/packageTopology.test.js locks the contract, including the mongodb driver
identity that was split 6.21.0 (hoisted from web-core) vs 6.20.0 (mongoose's).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: cross-repo verification sweep — one instance everywhere, three suites green together

**Files:**
- Modify: none
- Test: re-runs all three suites plus a cross-repo resolution probe

**Interfaces:**
- Consumes: Tasks 3 … 7
- Produces: the green-light record required before Task 11 touches a box

- [ ] **Step 1: Prove both consumers now resolve one copy of every shared dep.**
```bash
node -e "
const path=require('path');
const roots={affiliate:'/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program',
             corporate:'/mnt/c/Users/rickh/GitHub/crhs-corporate'};
const deps=['mongoose','express-session','connect-mongo','express-rate-limit'];
let bad=0;
for (const [name,root] of Object.entries(roots)) {
  const wc=require.resolve('@crhs/web-core',{paths:[root]});
  const inside = wc.startsWith(path.join(root,'node_modules')+path.sep);
  console.log(name+': web-core installed as a copy =', inside, '(v'+require(path.join(path.dirname(path.dirname(wc)),'package.json')).version+')');
  if(!inside) bad++;
  for(const d of deps){
    const a=require.resolve(d,{paths:[root]}), c=require.resolve(d,{paths:[wc]});
    if(a!==c){ console.log('  SPLIT',d,'\n    app :',a,'\n    core:',c); bad++; }
  }
}
console.log(bad===0 ? 'TOPOLOGY OK' : 'TOPOLOGY BROKEN ('+bad+' problems)');
"
```
Expected: `affiliate: web-core installed as a copy = true (v0.1.3)`, the same for corporate, no `SPLIT` lines, and `TOPOLOGY OK`.

- [ ] **Step 2: Confirm no lock still records a symlink or a stale web-core version.**
```bash
node -e "
for (const p of ['/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/package-lock.json',
                 '/mnt/c/Users/rickh/GitHub/crhs-corporate/package-lock.json']) {
  const e = require(p).packages['node_modules/@crhs/web-core'];
  console.log(p.split('/').slice(-2)[0], '->', JSON.stringify({version:e.version, link:e.link||false}));
}
"
```
Expected: both print `{"version":"0.1.3","link":false}`.

- [ ] **Step 3: Run all three suites back to back.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core  && npm test 2>&1 | tail -5
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npm test 2>&1 | tail -5
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npm test 2>&1 | tail -5
```
Expected: web-core `<WC_BASE>+17` passed, `0 failed`; corporate `<CORP_BASE_PASS>+11 or +12` passed with exactly the 4 `crhsent-parity` ENOENT failures; affiliate `<AFF_BASE>+15` passed, `0 failed` (8 identity + 7 helper). Re-run any single failing affiliate suite alone before treating it as a regression (2026-06-20 lesson).

- [ ] **Step 4: Confirm both apps still boot — the real acceptance criterion for this release.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program \
  && NODE_ENV=test node -e "require('./server'); console.log('AFFILIATE APP LOADED OK'); process.exit(0);"
cd /mnt/c/Users/rickh/GitHub/crhs-corporate \
  && NODE_ENV=test node -e "require('./server'); console.log('CORPORATE APP LOADED OK'); process.exit(0);"
```
Expected: both print their `… LOADED OK` line with no `MODULE_NOT_FOUND`, no `OverwriteModelError`, and no `app.use() requires a middleware function`. (`NODE_ENV=test` suppresses the mongoose connect at affiliate `server.js:112-113` and the corporate `require.main` boot block at `:93-106`.)

- [ ] **Step 5: Push the three branches.**
```bash
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core  push -u origin topology/install-links-peers
git -C /mnt/c/Users/rickh/GitHub/crhs-corporate push -u origin topology/install-links-peers
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program push -u origin topology/install-links-peers
```
Expected: three `* [new branch]` lines. Merge each to `main` only after Step 4 is green — the boxes pull `main`.

---

### Task 9: Hand-off — the R1 topology deploy is owned by Task 11 (NO box change here)

**Files:**
- Modify: none. **This task touches no production host.**
- Test: none

**Interfaces:**
- Consumes: Task 8 (three branches pushed, both apps loading clean locally)
- Produces: the hand-off record the Deploy-A task consumes

> The on-box topology reinstall is **Task 11 (Deploy A)**, which also carries the gate-G2 corporate `/health` hoist, the `legacy-peer-deps` pre-flight, the `verify-topology.sh` proof and the exit-gate evidence file. Running a second topology deploy from this group would make Task 11's `/var/www/crhs-web-core.bak` snapshot capture the **already-updated** tree, so Task 11's documented rollback would restore the new topology while claiming to restore the old — the rollback would be a no-op exactly when it is needed. There is one R1 deploy and it is Task 11.

- [ ] **Step 1: Merge the three branches to `main` and confirm.**
```bash
for d in /mnt/c/Users/rickh/GitHub/crhs-web-core /mnt/c/Users/rickh/GitHub/crhs-corporate /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; do
  echo "== $d"; git -C "$d" checkout main && git -C "$d" merge --ff-only topology/install-links-peers && git -C "$d" push origin main && git -C "$d" log --oneline -1
done
```
Expected: three fast-forward merges and three pushes. If a merge is not a fast-forward, rebase the branch — do not create a merge commit that reorders the R1 PRs.

- [ ] **Step 2: Record the hand-off line (no commit).**
```
R1 topology (web-core 0.1.3 + affiliate .npmrc + both regenerated locks + corporate
explicit declarations) merged to main in all three repos; both apps load clean locally
under NODE_ENV=test; three suites green (corporate green = the 4 pre-existing
crhsent-parity ENOENT failures only). Ready for Deploy A (Task 11), which is the ONLY
task permitted to install v0.1.3 on oci1/oci2.
```

---
### Task 10: Gate G2 — hoist corporate `/health` above the session middleware (no probe-minted sessions)

Not human-gated: this is a repo change only. Its production effect lands with Deploy A (Task 11).

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/server.js:6-7` (header middleware-order comment), `:58-60` (insert the hoisted route after the CSP block), `:79-80` (delete the old route)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/server.integration.test.js:77-83` (extend the existing `describe('/health')`)

**Interfaces:**
- Consumes: `wc.buildSessionMiddleware({ mongoUrl, secret, ttlSeconds })` — `crhs-web-core/src/config/sessionStore.js:50-122`, `saveUninitialized: true` at `:98`, cookie base `wavemax.sid` at `:22`; the corporate baseline `<CORP_BASE_PASS>` / `<CORP_BASE_FAIL>` from Task 1
- Consumes: `wc.cspNonce` (`server.js:38`), `wc.securityHeadersMiddleware()` (`:42`), `wc.buildCspDirectives`/`wc.serializeCspDirectives` (`:49-58`) — all stay ABOVE `/health`
- Produces: `GET /health` on `crhs-corporate` (`:3001`) → `200` `{"status":"ok"}`, `Cache-Control: no-store`, **no `Set-Cookie`**, host-agnostic (answers for `crhsent.com`, any marketing host, and a bare on-box `curl http://127.0.0.1:3001/health`). Consumed by Task 11 (Deploy A verification) and Task 55.

> **Ordering with Task 29.** Task 29 rewrites `crhs-corporate/server.js:65-69` (the `buildSessionMiddleware` mount) — the same ten lines. Either order is safe; whoever lands second rebases on the first, and **Task 29's diff may never reintroduce a `/health` below the session mount**.

- [ ] **Step 1: Re-read the corporate baseline recorded in Task 1 Step 5.** You need `<CORP_BASE_FAIL>` (expected `4`, all in `tests/crhsent-parity.test.js` — an ENOENT on the deleted `wavemax-affiliate-program/crhsent/` tree, removed in Plan 2 A1) and `<CORP_BASE_PASS>`. If you do not have them, re-measure now:
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest --runInBand 2>&1 | tail -6
```
Expected: a `Tests:` line whose only failures are those 4. **Do not compare it to any absolute number written elsewhere in this plan** — Task 7 has already added ~11 corporate cases by the time this task runs.

- [ ] **Step 2: Write the failing test FIRST.** In `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/server.integration.test.js`, replace the whole `describe('/health', …)` block at `:77-83` with:
```js
  describe('/health', () => {
    it('GET /health → 200 {status:"ok"}', async () => {
      const res = await request(app).get('/health').set('Host', HOST);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    // Gate G2. web-core's session builder sets `saveUninitialized: true`
    // (crhs-web-core/src/config/sessionStore.js:98), so any route mounted AFTER it
    // mints one session document per request. The Cloudflare LB monitor
    // be6953d2e0cfd7b40c4f414b5ddf20d9 probes /health every 60s from every PoP;
    // leaving /health below the session middleware re-runs the 2026-05-25 ADB
    // session-bloat incident on the SHARED database. Mirrors the affiliate's own
    // fix at wavemax-affiliate-program/server.js:413-424.
    it('mints no session — no Set-Cookie on /health', async () => {
      const res = await request(app).get('/health').set('Host', HOST);
      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('is host-agnostic and session-free for an on-box probe (no Host header)', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('still carries the security headers mounted above it (CSP present)', async () => {
      const res = await request(app).get('/health').set('Host', HOST);
      expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/);
    });
  });
```

- [ ] **Step 3: Run it and confirm it fails for the RIGHT reason — the session cookie, not a 404.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/server.integration.test.js --runInBand 2>&1 | tail -30
```
Expected (empirically confirmed on the current tree; the cookie name is `wavemax.sid` from `sessionStore.js:22`):
```
● crhs-corporate — composed app (server.js) › /health › mints no session — no Set-Cookie on /health

    expect(received).toBeUndefined()

    Received: ["wavemax.sid=s%3Ad586e4c5…; Path=/; Expires=…; HttpOnly; SameSite=Lax"]

● crhs-corporate — composed app (server.js) › /health › is host-agnostic and session-free for an on-box probe (no Host header)

    expect(received).toBeUndefined()

    Received: ["wavemax.sid=s%3A…; Path=/; Expires=…; HttpOnly; SameSite=Lax"]

Tests:       2 failed, 8 passed, 10 total
```
If the FIRST reported failure is the `cache-control` assertion instead, stop — the assertion order in Step 2 was changed; `Set-Cookie` must go red first, because that is the defect.

- [ ] **Step 4: Implement — insert the hoisted route.** In `/mnt/c/Users/rickh/GitHub/crhs-corporate/server.js`, immediately after the `});` that closes the CSP middleware at `:58` and BEFORE the `// CORS, cookies, body parsing, session …` comment at `:60`, insert:
```js

// Liveness probe — mounted BEFORE cors/cookies/body/session so the Cloudflare
// Load Balancer health monitor (be6953d2e0cfd7b40c4f414b5ddf20d9, GET /health,
// interval 60s, from every PoP) mints NO session. web-core's builder sets
// `saveUninitialized: true` (crhs-web-core/src/config/sessionStore.js:98) with a
// 2-minute sweeper (:83-84), so a probe below it writes one session document per
// hit into the SHARED Oracle ADB — the 2026-05-25 incident class. Mirrors the
// affiliate app's fix at wavemax-affiliate-program/server.js:413-424. The
// monitor's expected_body is empty, so the body stays {status:'ok'}.
app.get('/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ status: 'ok' });
});
```

- [ ] **Step 5: Implement — delete the old post-session route and prove only one remains.** Remove these two lines (originally `:79-80`, shifted down by Step 4):
```js
// Health check — before the gates/handler so it is always reachable.
app.get('/health', (req, res) => res.json({ status: 'ok' }));
```
Then:
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && grep -n "app.get('/health'" server.js && grep -n "buildSessionMiddleware" server.js
```
Expected: exactly one `app.get('/health'` line, and its line number is strictly LESS than the `buildSessionMiddleware` line number.

- [ ] **Step 6: Fix the stale middleware-order comment in the file header.** In `/mnt/c/Users/rickh/GitHub/crhs-corporate/server.js:6-7` replace:
```js
// crhsent path exactly: nonce → security headers → manual nonce-based CSP →
// cors/cookies/body/session → sanitize → health → gates → content handler →
```
with:
```js
// crhsent path exactly: nonce → security headers → manual nonce-based CSP →
// health (session-free — gate G2) → cors/cookies/body/session → sanitize →
// rate limit → gates → content handler →
```

- [ ] **Step 7: Run the test again — PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/server.integration.test.js --runInBand 2>&1 | tail -8
```
Expected:
```
Tests:       10 passed, 10 total
Test Suites: 1 passed, 1 total
```

- [ ] **Step 8: Full corporate suite — no NEW failures vs. the Step-1 measurement.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest --runInBand 2>&1 | tail -6
```
Expected: exactly `<CORP_BASE_FAIL>` = **4** failures, all in `tests/crhsent-parity.test.js`, and 3 more passing than the Step-1 measurement.

- [ ] **Step 9: Lint and commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx eslint server tests && git add server.js tests/server.integration.test.js && git commit -m "$(cat <<'EOF'
fix(health): mount /health above the session middleware (gate G2)

web-core's buildSessionMiddleware sets saveUninitialized:true
(src/config/sessionStore.js:98), so the Cloudflare LB monitor
be6953d2e0cfd7b40c4f414b5ddf20d9 would mint one session document per probe into
the shared Oracle ADB once a monitored host reaches :3001 — the 2026-05-25
incident class. Hoisted the route above cors/cookies/body/session (security
headers + nonce CSP still apply) and added Cache-Control: no-store. Mirrors
wavemax-affiliate-program/server.js:413-424.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)" && git push origin main
```

---

### Task 11: **HUMAN-CONFIRM** — Deploy A: the topology-only release (web-core v0.1.3 + both consumers' locks + gate G2) to oci1 then oci2

**HUMAN-CONFIRM.** This touches production on both OCI boxes. Run it with Rick present; every command below is exact, and the rollback is in Step 12. Nothing here edits a prod `.env` or nginx.

**Prerequisite:** Tasks 3–9 merged to `main` in all three repos, plus Task 10.

**Files:**
- Create: `/mnt/c/Users/rickh/GitHub/crhs-web-core/scripts/deploy/verify-topology.sh` (run ON a box, inside a consumer dir)
- Create: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/docs/refactor/plan1-exit-gate.md`
- Modify: none on the boxes' repos beyond `git pull` / rsync
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/packageTopology.test.js` (created by Task 4 — **this is the repo's only packaging test file; there is no `tests/packaging.test.js`**) must be green before this task starts

**Interfaces:**
- Consumes: `require.resolve('mongoose', { paths: [require.resolve('@crhs/web-core')] })` — the resolution-path identity proof that loads NO model (mandatory in the affiliate, whose `server/models/SystemConfig.js:449` already owns the `SystemConfig` model name)
- Consumes: `Model.base === wc.SystemConfig.base` — legal in **corporate only** (it has no local SystemConfig); already asserted at `crhs-corporate/tests/models.test.js:88-96`
- Produces: `/var/www/crhs-web-core` at v0.1.3 on both boxes; `pm2 wavemax` and `pm2 crhs-corporate` reloaded and online; `verify-topology.sh` printing `true true 0.1.3`; the `docs/refactor/plan1-exit-gate.md` evidence file consumed by Tasks 12, 55 and 58

- [ ] **Step 1: Write the on-box verification script** at `/mnt/c/Users/rickh/GitHub/crhs-web-core/scripts/deploy/verify-topology.sh`:
```bash
#!/usr/bin/env bash
# Run from INSIDE a consumer directory on a box:
#   cd /var/www/crhs-corporate && bash /var/www/crhs-web-core/scripts/deploy/verify-topology.sh
#   cd /var/www/wavemax/wavemax-affiliate-program && bash /var/www/crhs-web-core/scripts/deploy/verify-topology.sh
# Prints: <sharedMongoose> <sharedMongodbDriver> <installedCoreVersion>
# Loads NO mongoose model and opens NO DB connection (safe against ORA-04036 and
# against the affiliate's OverwriteModelError on the 'SystemConfig' model name).
set -euo pipefail
node -e '
const wcEntry = require.resolve("@crhs/web-core");
const sharedMongoose =
  require.resolve("mongoose") === require.resolve("mongoose", { paths: [wcEntry] });
let sharedDriver;
try {
  sharedDriver =
    require.resolve("mongodb", { paths: [require.resolve("mongoose")] }) ===
    require.resolve("mongodb", { paths: [wcEntry] });
} catch (e) { sharedDriver = "n/a"; }
const version = require("@crhs/web-core/package.json").version;
console.log(sharedMongoose, sharedDriver, version);
'
```
Then:
```bash
chmod +x /mnt/c/Users/rickh/GitHub/crhs-web-core/scripts/deploy/verify-topology.sh
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && bash /mnt/c/Users/rickh/GitHub/crhs-web-core/scripts/deploy/verify-topology.sh
```
Expected locally in corporate **after** R1: `true true 0.1.3`. (Before R1 it prints `true false 0.1.2` — the `mongodb` split.) Commit the script:
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git add scripts/deploy/verify-topology.sh && git commit -m "$(cat <<'EOF'
chore(deploy): add verify-topology.sh (resolution-path identity proof, loads no model)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)" && git push origin main
```

- [ ] **Step 2: Capture the BEFORE state on both boxes** (this is the rollback reference and the exit-gate baseline). One ssh invocation per box:
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'echo "== oci1 =="; pm2 jlist | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>JSON.parse(s).forEach(a=>console.log(a.name,a.pm2_env.status,\"restarts=\"+a.pm2_env.restart_time)))"; echo "-- versions --"; node -p "require(\"/var/www/crhs-web-core/package.json\").version"; git -C /var/www/wavemax/wavemax-affiliate-program rev-parse --short HEAD; echo "-- smoke --"; curl -s -o /dev/null -w "portal-health %{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health; curl -s -o /dev/null -w "corp-health %{http_code}\n" -H "Host: crhsent.com" http://127.0.0.1:3001/health; curl -s -o /dev/null -w "corp-home %{http_code}\n" -H "Host: crhsent.com" http://127.0.0.1:3001/'
```
Repeat verbatim for `ubuntu@144.24.4.202` (label `== oci2 ==`). Expected on both: `wavemax online`, `crhs-corporate online`, core version `0.1.2`, `portal-health 200`, `corp-health 200`, `corp-home 200`. Record the restart counts — they are the "no restart-count climb" reference. Paste into `docs/refactor/plan1-exit-gate.md` under `## Deploy A — before`.

- [ ] **Step 3: Snapshot the current web-core on oci1 for rollback.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'sudo rm -rf /var/www/crhs-web-core.bak && sudo cp -a /var/www/crhs-web-core /var/www/crhs-web-core.bak && node -p "require(\"/var/www/crhs-web-core.bak/package.json\").version"'
```
Expected output: `0.1.2`.

- [ ] **Step 4: rsync web-core v0.1.3 to oci1.** Note the trailing slashes (source contents → destination) and `--exclude logs` so the box's own log files are not deleted by `--delete`:
```bash
rsync -az --delete --exclude node_modules --exclude .git --exclude logs \
  -e "ssh -i ~/.ssh/oci_wavemax" \
  /mnt/c/Users/rickh/GitHub/crhs-web-core/ ubuntu@161.153.71.201:/var/www/crhs-web-core/
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'node -p "require(\"/var/www/crhs-web-core/package.json\").version"'
```
Expected: `0.1.3`. If rsync reports `Permission denied`, re-run with `--rsync-path="sudo rsync"` appended and re-check the version.

- [ ] **Step 5: Update the affiliate checkout on oci1 and reinstall.** The affiliate repo is public, so `git pull` works on the box; the `e2107288` pin is LIFTED. Verify the `file:` dep symlink exists first — oci2 was missing it once:
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'npm config get legacy-peer-deps; ls -ld /var/www/wavemax/crhs-web-core && cd /var/www/wavemax/wavemax-affiliate-program && git pull --ff-only && git rev-parse --short HEAD && cat .npmrc && npm install --install-links 2>&1 | tail -5'
```
Expected: `false` or `undefined` for `legacy-peer-deps`; the symlink line `… /var/www/wavemax/crhs-web-core -> /var/www/crhs-web-core`; the new HEAD short sha; `install-links=true`; and an npm summary with no `ERESOLVE` and no `npm ERR!`. If `.npmrc` is absent the affiliate's Task-5 commit did not reach the box — stop and re-pull.

- [ ] **Step 6: Prove the affiliate now has ONE mongoose on oci1 — before reloading anything.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'cd /var/www/wavemax/wavemax-affiliate-program && bash /var/www/crhs-web-core/scripts/deploy/verify-topology.sh && node -p "require(\"mongoose/package.json\").version"'
```
Expected:
```
true true 0.1.3
8.24.4
```
If the first field is `false`, **do not reload** — the split is still live; jump to Step 12 (rollback) and re-do the lock regeneration.

- [ ] **Step 7: Update corporate on oci1 and reinstall.** The corporate repo is **private** and the boxes hold no GitHub credentials, so probe first (Global Constraint 19) and never wrap both consumers in one `set -e` loop:
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'cd /var/www/crhs-corporate && (git fetch --dry-run origin 2>&1 | head -3) ; git rev-parse --short HEAD'
```
**Record the printed SHA — Step 12 resets to it.** If the fetch succeeds, update by git:
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'set -e; cd /var/www/crhs-corporate && git pull --ff-only && git rev-parse --short HEAD && npm install --install-links 2>&1 | tail -5'
```
If the fetch fails with an auth/permission error, deliver by rsync instead (never delete `.env`, `node_modules`, `logs`):
```bash
rsync -az --delete --exclude node_modules --exclude .git --exclude logs --exclude .env \
  -e "ssh -i ~/.ssh/oci_wavemax" \
  /mnt/c/Users/rickh/GitHub/crhs-corporate/ ubuntu@161.153.71.201:/var/www/crhs-corporate/
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'set -e; cd /var/www/crhs-corporate && npm install --install-links 2>&1 | tail -5'
```
Expected either way: npm summary with no `ERESOLVE`, no `npm ERR!`.

- [ ] **Step 8: Prove corporate's topology on oci1 — the resolution-path proof AND the `Model.base` proof (legal here; corporate has no local SystemConfig).**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'cd /var/www/crhs-corporate && bash /var/www/crhs-web-core/scripts/deploy/verify-topology.sh && node -e "const wc=require(\"@crhs/web-core\");const m=require(\"mongoose\");const AG=require(\"./server/models/AccessGate\");console.log(\"modelBase\", AG.base===wc.SystemConfig.base, \"coreOnAppMongoose\", wc.SystemConfig.base===m)"'
```
Expected:
```
true true 0.1.3
modelBase true coreOnAppMongoose true
```
This is the silent-failure check that matters: a split instance here does **not** crash `:3001` — `server/middleware/accessGate.js:76` swallows the error — it just leaves the access gate permanently un-cached.

- [ ] **Step 9: Reload both apps on oci1 and verify.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'pm2 reload wavemax && pm2 reload crhs-corporate && sleep 8 && pm2 jlist | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>JSON.parse(s).forEach(a=>console.log(a.name,a.pm2_env.status,\"restarts=\"+a.pm2_env.restart_time)))"'
```
Expected: both `online`; `restart_time` at most **+1** per app vs. Step 2 (a reload increments once). A climbing count over successive checks = crash loop → Step 12.

- [ ] **Step 10: Run the full post-deploy verification on oci1, including the corporate silent-failure checks and gate G2.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'echo "-- health --"; curl -s -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health; echo; curl -s -i -H "Host: crhsent.com" http://127.0.0.1:3001/health | grep -Ei "^HTTP|^set-cookie|^cache-control"; echo "-- corp home --"; curl -s -o /dev/null -w "%{http_code}\n" -H "Host: crhsent.com" http://127.0.0.1:3001/; echo "-- access gate --"; pm2 logs crhs-corporate --lines 80 --nostream 2>/dev/null | grep -E "Access gate cache (loaded|load failed)" | tail -3; echo "-- ORA --"; pm2 logs wavemax --lines 300 --nostream 2>/dev/null | grep -c "ORA-04036"'
```
Expected, line by line:
```
{"status":"UP","timestamp":"…","environment":"production"}
HTTP/1.1 200 OK
Cache-Control: no-store
200
info: Access gate cache loaded: disabled; N whitelisted IP(s); password set
0
```
Three things are non-negotiable: **no `set-cookie` line** on `/health` (gate G2 landed), the `Access gate cache loaded:` line present with **no** `Access gate cache load failed`, and the ORA-04036 count `0`. If `Access gate cache load failed` appears, the topology is bad on `:3001` even though the process is "online" — go to Step 12.

- [ ] **Step 11a: Confirm oci1 has been healthy for 5 minutes before touching oci2** (one healthy origin must remain in the CF pool at all times).
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'pm2 jlist | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>JSON.parse(s).forEach(a=>console.log(a.name,a.pm2_env.status,\"restarts=\"+a.pm2_env.restart_time)))"; curl -s -o /dev/null -w "portal %{http_code}\n" http://127.0.0.1:3000/health'
```
Expected: both apps `online`, restart counts unchanged from Step 9, `portal 200`.

- [ ] **Step 11b: oci2 — check the `file:` dep symlink, creating it if missing.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@144.24.4.202 'ls -ld /var/www/wavemax/crhs-web-core || (sudo ln -sfn /var/www/crhs-web-core /var/www/wavemax/crhs-web-core && ls -ld /var/www/wavemax/crhs-web-core)'
```
Expected: `… /var/www/wavemax/crhs-web-core -> /var/www/crhs-web-core`.

- [ ] **Step 11c: oci2 — capture BEFORE state and snapshot.** Run Step 2's command and Step 3's command with `144.24.4.202`. Expected: same outputs as oci1's, and the snapshot printing `0.1.2`.

- [ ] **Step 11d: oci2 — rsync web-core v0.1.3.** Run Step 4's two commands with `144.24.4.202`. Expected: `0.1.3`.

- [ ] **Step 11e: oci2 — update + reinstall the affiliate, then prove one mongoose.** Run Step 5's and Step 6's commands with `144.24.4.202`. Expected: `legacy-peer-deps` `false`/`undefined`, no `ERESOLVE`, then `true true 0.1.3` and `8.24.4`.

- [ ] **Step 11f: oci2 — update + reinstall corporate (probe first), then prove its topology.** Run Step 7's probe and the matching branch, then Step 8's command, with `144.24.4.202`. **Record the pre-update corporate SHA.** Expected: `true true 0.1.3` and `modelBase true coreOnAppMongoose true`.

- [ ] **Step 11g: oci2 — reload and run the full verification.** Run Step 9's and Step 10's commands with `144.24.4.202`. Expected: both apps `online` with restart counts +1 at most, and the same six-line verification block, including **no `set-cookie`** on `:3001/health`.

- [ ] **Step 12: Rollback procedure (run only if a check above fails; per box, oci-N).**
```bash
# 1) restore the previous web-core bytes
ssh -i ~/.ssh/oci_wavemax ubuntu@<BOX_IP> 'sudo rm -rf /var/www/crhs-web-core && sudo mv /var/www/crhs-web-core.bak /var/www/crhs-web-core && node -p "require(\"/var/www/crhs-web-core/package.json\").version"'
# expect: 0.1.2
# 2) roll both consumers back to the SHAs recorded in Step 2 and Step 7 and reinstall
ssh -i ~/.ssh/oci_wavemax ubuntu@<BOX_IP> 'cd /var/www/wavemax/wavemax-affiliate-program && git reset --hard <AFFILIATE_SHA_FROM_STEP_2> && npm install --install-links 2>&1 | tail -3'
ssh -i ~/.ssh/oci_wavemax ubuntu@<BOX_IP> 'cd /var/www/crhs-corporate && git reset --hard <CORPORATE_SHA_FROM_STEP_7> && npm install --install-links 2>&1 | tail -3'
# 3) reload and re-verify
ssh -i ~/.ssh/oci_wavemax ubuntu@<BOX_IP> 'pm2 reload wavemax && pm2 reload crhs-corporate && sleep 8 && curl -s -o /dev/null -w "portal %{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health && curl -s -o /dev/null -w "corp %{http_code}\n" -H "Host: crhsent.com" http://127.0.0.1:3001/health'
```
`git reset --hard` on a box is a destructive git op — confirm with Rick before running it, per the project rules. If the corporate checkout was delivered by rsync rather than git, roll it back by re-rsyncing from a local `git worktree add ../crhs-corporate-prev <CORPORATE_SHA_FROM_STEP_7>`.

- [ ] **Step 13: Record the Deploy A result.** Create/append `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/docs/refactor/plan1-exit-gate.md`:
```markdown
## Corporate baseline (pre-Plan-1)
Tests: 4 failed, 68 passed, 72 total — the 4 failures are all in
tests/crhsent-parity.test.js (ENOENT on the deleted wavemax-affiliate-program/crhsent
tree; the suite is deleted in Plan 2 task A1). Every "corporate green" in Plan 1 means
these 4 and no others.

## Deploy A — topology (web-core v0.1.3), <DATE>
| box | core version | verify-topology (affiliate) | verify-topology (corporate) | Access gate cache | /health corp Set-Cookie | wavemax restarts | crhs-corporate restarts |
|---|---|---|---|---|---|---|---|
| oci1 161.153.71.201 | 0.1.3 | true true 0.1.3 | true true 0.1.3 | loaded | none | <before>→<after> | <before>→<after> |
| oci2 144.24.4.202 | 0.1.3 | true true 0.1.3 | true true 0.1.3 | loaded | none | <before>→<after> | <before>→<after> |
```
Commit it in the affiliate repo:
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git add docs/refactor/plan1-exit-gate.md && git commit -m "$(cat <<'EOF'
docs(plan1): record Deploy A (topology, web-core v0.1.3) verification on both boxes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)" && git push origin main
```

---

### Task 12: **HUMAN-CONFIRM** — Gate G1: repoint the Cloudflare LB monitor `Host` to `portal.atxwashdryfold.com`

**HUMAN-CONFIRM.** This is production edge infrastructure: it changes which app decides whether an origin stays in the load-balancer pool. Run with Rick present. Rollback is a single PATCH (Step 8).

Why: today the monitor sends `Host: rundberglaundry.com`, which terminates on `:3000` and is answered by `partnerLanding` (`server.js:363`) *before* `/health` (`server.js:418`) — so the monitor validates "Express answers on :3000" and nothing more. After Plan 3 flips `rundberglaundry.com` to `:3001`, pool health would reflect corporate liveness only and a crash-looping `wavemax` would stay in rotation serving 502s. Repointing to `portal.atxwashdryfold.com` makes the pool follow the portal and finally exercises the real JSON `/health` at `server.js:413-424`.

**Files:**
- Modify: Cloudflare monitor `be6953d2e0cfd7b40c4f414b5ddf20d9` (account `b69ef162d008b11492296d3b35cad2fe`), fields `description` and `header.Host` only
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/docs/ops/HA-FAILOVER-PLAN.md:29,51` (which describes a `/api/health` + `database: connected` monitor that never existed)
- Modify: `~/.claude/projects/-mnt-c-Users-rickh-GitHub-wavemax-affiliate-program/memory/production_systems_access.md` §1 (record the new monitor Host)
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/docs/refactor/plan1-exit-gate.md` (append the G1 record)
- Test: the origin-probe simulation in Step 3 and the post-change pool-health + nginx access-log checks in Steps 6–7 (no jest test exists for third-party infrastructure)

**Interfaces:**
- Consumes: affiliate `GET /health` — `wavemax-affiliate-program/server.js:413-424`, returns `200` `{"status":"UP","timestamp":…,"environment":…}`. Monitor config is `expected_codes "200"` with `expected_body ""` (empty), so any 200 body passes. Requires Task 11 verified.
- Consumes: account token at `~/.cf_api_token` (`cfat_`-prefixed, **account**-owned). Verified live 2026-09-09: `id fde3fa05e974ff59f41c1f1f043f1a0f`, `status active`, `expires_on 2026-09-16T23:59:59Z`. Verify it at `/accounts/{acct}/tokens/verify` — the `/user/tokens/verify` endpoint returns a **false 401** for account tokens
- Produces: monitor `header.Host === ["portal.atxwashdryfold.com"]` and `description === "portal web /health"`, every other field byte-unchanged (`type https`, `method GET`, `path /health`, `interval 60`, `retries 2`, `timeout 5`, `expected_codes "200"`, `expected_body ""`, `follow_redirects false`, `allow_insecure true`, `probe_zone ""`)

- [ ] **Step 1: Load the token and verify it against the ACCOUNT endpoint.**
```bash
export CF_TOKEN=$(cat ~/.cf_api_token)
export CF_ACCT=b69ef162d008b11492296d3b35cad2fe
export CF_MON=be6953d2e0cfd7b40c4f414b5ddf20d9
export CF_POOL=1e3795c02e98b9506cfab578c9cb7c97
curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCT/tokens/verify" -H "Authorization: Bearer $CF_TOKEN"
```
Expected (verified 2026-09-09):
```json
{"result":{"id":"fde3fa05e974ff59f41c1f1f043f1a0f","status":"active","expires_on":"2026-09-16T23:59:59Z"},"success":true,"errors":[],"messages":[{"code":10000,"message":"This API Token is valid and active","type":null}]}
```
If `expires_on` has passed, stop — Rick must mint a fresh account token with *Account → Load Balancing: Monitors and Pools → Edit* before this task can proceed. Do **not** call `/user/tokens/verify`; it 401s for account tokens even when they are valid.

- [ ] **Step 2: Read and save the current monitor definition (this IS the rollback record).**
```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCT/load_balancers/monitors/$CF_MON" \
  -H "Authorization: Bearer $CF_TOKEN" | tee /tmp/cf-monitor-before.json
```
Expected (verified live 2026-09-09):
```json
{
  "result": {
    "description": "wavemax web /health",
    "id": "be6953d2e0cfd7b40c4f414b5ddf20d9",
    "type": "https", "interval": 60, "retries": 2, "timeout": 5,
    "expected_body": "", "expected_codes": "200",
    "follow_redirects": false, "allow_insecure": true, "probe_zone": "",
    "path": "/health",
    "header": { "Host": [ "rundberglaundry.com" ] },
    "method": "GET"
  },
  "success": true, "errors": [], "messages": []
}
```
If `header.Host` already reads `portal.atxwashdryfold.com`, G1 is done — skip to Step 6 and record it.

- [ ] **Step 3: Pre-flight — simulate the exact probe the monitor will send, against BOTH origins.** The monitor speaks HTTPS directly to the origin IP with `allow_insecure: true` and does not follow redirects, so reproduce that precisely:
```bash
for ip in 161.153.71.201 144.24.4.202; do
  printf '%s -> ' "$ip"
  curl -s -o /dev/null -w '%{http_code}\n' -k --max-time 5 \
    -H 'Host: portal.atxwashdryfold.com' "https://$ip/health"
done
```
Expected:
```
161.153.71.201 -> 200
144.24.4.202 -> 200
```
Anything other than `200` on either origin (a `301`, a `404`, a timeout) is a **stop**: with `follow_redirects false` the monitor would mark that origin unhealthy the moment you PATCH. Also confirm the body is the portal JSON, not the Coming-soon HTML:
```bash
curl -s -k --max-time 5 -H 'Host: portal.atxwashdryfold.com' https://161.153.71.201/health
```
Expected: `{"status":"UP","timestamp":"…","environment":"production"}`.

- [ ] **Step 4: Confirm the pool is fully healthy BEFORE the change** (so any post-change red is attributable to the change).
```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCT/load_balancers/pools/$CF_POOL/health" \
  -H "Authorization: Bearer $CF_TOKEN" \
| node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).result.pop_health;const bad=[];let n=0;for(const [pop,v] of Object.entries(r)){for(const o of v.origins){for(const [ip,st] of Object.entries(o)){n++;if(!st.healthy)bad.push(pop+" "+ip+" "+st.failure_reason);}}}console.log("origin-checks:",n,"unhealthy:",bad.length);bad.slice(0,10).forEach(x=>console.log("  ",x));});'
```
Expected: `unhealthy: 0` (as measured 2026-09-09 — both `161.153.71.201` and `144.24.4.202` healthy, `response_code 200`, in every PoP).

- [ ] **Step 5: PATCH the monitor — the single production write. HUMAN-CONFIRM before pressing enter.**
```bash
curl -s -X PATCH "https://api.cloudflare.com/client/v4/accounts/$CF_ACCT/load_balancers/monitors/$CF_MON" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"description":"portal web /health","header":{"Host":["portal.atxwashdryfold.com"]}}'
```
Expected: `"success": true` and a `result` whose `header.Host` is `["portal.atxwashdryfold.com"]` and `description` is `"portal web /health"`, while `path`, `expected_codes`, `expected_body`, `follow_redirects`, `allow_insecure`, `interval`, `retries`, `timeout` are unchanged from `/tmp/cf-monitor-before.json`. A PATCH body carrying only these two keys replaces the header map and the description and touches nothing else — do not send the full object.

- [ ] **Step 6: Read it back and diff against the saved before-state.**
```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCT/load_balancers/monitors/$CF_MON" \
  -H "Authorization: Bearer $CF_TOKEN" > /tmp/cf-monitor-after.json
node -e 'const a=require("/tmp/cf-monitor-before.json").result,b=require("/tmp/cf-monitor-after.json").result;
const keys=["type","method","path","interval","retries","timeout","expected_codes","expected_body","follow_redirects","allow_insecure","probe_zone"];
console.log("Host:",JSON.stringify(a.header.Host),"->",JSON.stringify(b.header.Host));
console.log("description:",JSON.stringify(a.description),"->",JSON.stringify(b.description));
console.log("unchanged:",keys.every(k=>JSON.stringify(a[k])===JSON.stringify(b[k])));'
```
Expected:
```
Host: ["rundberglaundry.com"] -> ["portal.atxwashdryfold.com"]
description: "wavemax web /health" -> "portal web /health"
unchanged: true
```

- [ ] **Step 7: Wait one monitor interval, then confirm health and that the probes moved hosts.** The interval is 60s; give it 3 minutes for PoPs to converge.
```bash
sleep 180
# a) pool still healthy on both origins (same one-liner as Step 4)
curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCT/load_balancers/pools/$CF_POOL/health" \
  -H "Authorization: Bearer $CF_TOKEN" \
| node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).result.pop_health;const bad=[];let n=0;for(const [pop,v] of Object.entries(r)){for(const o of v.origins){for(const [ip,st] of Object.entries(o)){n++;if(!st.healthy)bad.push(pop+" "+ip+" "+st.failure_reason);}}}console.log("origin-checks:",n,"unhealthy:",bad.length);bad.slice(0,10).forEach(x=>console.log("  ",x));});'
# b) the probes now land on the portal vhost, and stop landing on rundberglaundry
for ip in 161.153.71.201 144.24.4.202; do
  echo "== $ip =="
  ssh -i ~/.ssh/oci_wavemax ubuntu@$ip 'ls /var/log/nginx/ | grep -E "portal.atxwashdryfold.com|rundberglaundry.com"; echo "portal probes (last 200 lines):"; sudo tail -n 200 /var/log/nginx/portal.atxwashdryfold.com.access.log | grep -c "Cloudflare-Traffic-Manager"; echo "rundberglaundry probes (last 200 lines):"; sudo tail -n 200 /var/log/nginx/rundberglaundry.com.access.log | grep -c "Cloudflare-Traffic-Manager"'
done
```
Expected: `unhealthy: 0`; the portal count is **> 0** and climbing between runs; the rundberglaundry count trends to `0` for lines newer than the PATCH timestamp. If the log filenames differ, the `ls` in the same command shows the real names — re-run `tail` against those. If `unhealthy` is non-zero on either origin, execute Step 8 immediately.

- [ ] **Step 8: Rollback PATCH (exact, one command).**
```bash
curl -s -X PATCH "https://api.cloudflare.com/client/v4/accounts/$CF_ACCT/load_balancers/monitors/$CF_MON" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"description":"wavemax web /health","header":{"Host":["rundberglaundry.com"]}}'
```
Expected: `"success": true` with `header.Host` back to `["rundberglaundry.com"]`. Then re-run Step 7(a) and confirm `unhealthy: 0` within 3 minutes. Rolling back costs nothing — the pre-flip Host still terminates on `:3000`.

- [ ] **Step 9: Correct the two documents that describe a monitor which never existed.** In `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/docs/ops/HA-FAILOVER-PLAN.md`, rewrite `:29` and `:51` so both describe the **real** monitor: `GET /health` (not `/api/health`), `expected_codes "200"`, **empty** `expected_body` (there is no `database: connected` body check), `follow_redirects false`, `allow_insecure true`, `interval 60`, `retries 2`, `timeout 5`, `Host: portal.atxwashdryfold.com`, monitor id `be6953d2e0cfd7b40c4f414b5ddf20d9`, pool `1e3795c02e98b9506cfab578c9cb7c97`. Then add the same Host to §1 of `~/.claude/projects/-mnt-c-Users-rickh-GitHub-wavemax-affiliate-program/memory/production_systems_access.md`. Verify:
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && grep -n "api/health\|database: connected" docs/ops/HA-FAILOVER-PLAN.md || echo "stale monitor description GONE (expected)"
```
Expected: `stale monitor description GONE (expected)`.

- [ ] **Step 10: Record G1 in the exit-gate file and commit.** Append to `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/docs/refactor/plan1-exit-gate.md`:
```markdown
## G1 — CF monitor repointed, <DATE>
- monitor `be6953d2e0cfd7b40c4f414b5ddf20d9` (account `b69ef162d008b11492296d3b35cad2fe`)
- `header.Host`: `["rundberglaundry.com"]` → `["portal.atxwashdryfold.com"]`; `description` → `"portal web /health"`; every other field unchanged (verified by diff)
- pre-flight: `https://161.153.71.201/health` and `https://144.24.4.202/health` with `Host: portal.atxwashdryfold.com`, `-k`, no redirect → 200 `{"status":"UP",…}`
- post-change: pool `1e3795c02e98b9506cfab578c9cb7c97` unhealthy origin-checks = 0; `Cloudflare-Traffic-Manager` hits now in `portal.atxwashdryfold.com.access.log` on both boxes, none new in `rundberglaundry.com.access.log`
- docs/ops/HA-FAILOVER-PLAN.md:29,51 corrected (it described a `/api/health` + `database: connected` monitor that never existed); memory `production_systems_access.md` §1 updated
- rollback: `PATCH … --data '{"description":"wavemax web /health","header":{"Host":["rundberglaundry.com"]}}'`
```
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git add docs/refactor/plan1-exit-gate.md docs/ops/HA-FAILOVER-PLAN.md && git commit -m "$(cat <<'EOF'
docs(plan1): record gate G1 — CF LB monitor Host repointed to the portal

Also corrects HA-FAILOVER-PLAN.md, which described a /api/health monitor with a
`database: connected` body check that never existed; the real monitor is
GET /health, expected_codes "200", empty expected_body, no redirects.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)" && git push origin main
```

---
### Task 13: web-core — failing test: `auditLogger` must honour `LOG_DIR` (B3a)

**Files:**
- Create: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/utils/auditLoggerLogDir.test.js`
- Test: the new file (3 cases)

**Interfaces:**
- Consumes: `require('../../src/utils/auditLogger')` → `{ auditLogger, AuditEvents, logAuditEvent, auditMiddleware, logLoginAttempt, logSensitiveDataAccess, logPaymentActivity, logSuspiciousActivity }` (current export block, `src/utils/auditLogger.js:258-267`)
- Produces: the RED that Task 14 turns green — pins `logDir = process.env.LOG_DIR || path.join(__dirname, '../../logs')`

- [ ] **Step 1: Confirm the live defect and the winston transport property shape.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && node -e "
const m = require('./src/utils/auditLogger');
for (const t of m.auditLogger.transports) console.log(t.constructor.name, JSON.stringify({dirname:t.dirname, filename:t.filename}));
"
```
Expected output (this IS the bug — both files sit inside the package, i.e. inside `node_modules/@crhs/web-core/logs/` on a box):
```
File {"dirname":"/mnt/c/Users/rickh/GitHub/crhs-web-core/logs","filename":"audit.log"}
File {"dirname":"/mnt/c/Users/rickh/GitHub/crhs-web-core/logs","filename":"security-critical.log"}
Console {}
```

- [ ] **Step 2: Write the failing test file.** (A NEW file, not `tests/utils/auditLogger.test.js` — that file mocks winston wholesale at module scope, so a real-file-landing assertion is impossible there.)
```bash
cat > /mnt/c/Users/rickh/GitHub/crhs-web-core/tests/utils/auditLoggerLogDir.test.js <<'EOF'
// LIVE DEFECT (spec §7.2.7). auditLogger's two File transports were
// __dirname-relative (src/utils/auditLogger.js:17,23) while src/utils/logger.js:11
// already honours LOG_DIR. On a box installed with --install-links the package is
// a COPY inside the consumer, so every audit event — including the portal's
// CSRF_VALIDATION_FAILED events, which are written by WEB-CORE's auditLogger via
// src/config/csrf-config.js:13 — landed in
// <consumer>/node_modules/@crhs/web-core/logs/ and was wiped by the next
// `npm install`. This suite pins the LOG_DIR contract.
//
// Deliberately NOT added to tests/utils/auditLogger.test.js: that file mocks
// winston at module scope, so it can never prove a real file was written.

const fs = require('fs');
const os = require('os');
const path = require('path');

const waitForNeedle = async (file, needle, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(needle)) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
};

const fileTransportPaths = (mod) => mod.auditLogger.transports
  .filter((t) => t.dirname)
  .map((t) => path.join(t.dirname, t.filename));

describe('utils/auditLogger — LOG_DIR', () => {
  const SAVED = process.env.LOG_DIR;
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-audit-'));
  });

  afterEach(() => {
    if (SAVED === undefined) delete process.env.LOG_DIR;
    else process.env.LOG_DIR = SAVED;
  });

  it('points both file transports at LOG_DIR', () => {
    process.env.LOG_DIR = dir;
    let mod;
    jest.isolateModules(() => { mod = require('../../src/utils/auditLogger'); });
    expect(fileTransportPaths(mod)).toEqual(expect.arrayContaining([
      path.join(dir, 'audit.log'),
      path.join(dir, 'security-critical.log')
    ]));
  });

  it('a CSRF_VALIDATION_FAILED event LANDS in $LOG_DIR/audit.log', async () => {
    process.env.LOG_DIR = dir;
    let mod;
    jest.isolateModules(() => { mod = require('../../src/utils/auditLogger'); });

    // Exactly the call csrf-config.js:288-299 makes on a rejected mutation.
    mod.logSuspiciousActivity('CSRF_VALIDATION_FAILED', {
      userId: 'anonymous', userType: 'unknown', path: '/api/v1/probe', method: 'POST'
    });

    await expect(waitForNeedle(path.join(dir, 'audit.log'), 'CSRF_VALIDATION_FAILED'))
      .resolves.toBe(true);
    // logSuspiciousActivity logs at error level, so it must reach the critical log too.
    await expect(waitForNeedle(path.join(dir, 'security-critical.log'), 'CSRF_VALIDATION_FAILED'))
      .resolves.toBe(true);
  });

  it('falls back to <package>/logs when LOG_DIR is unset', () => {
    delete process.env.LOG_DIR;
    let mod;
    jest.isolateModules(() => { mod = require('../../src/utils/auditLogger'); });
    expect(fileTransportPaths(mod)).toEqual(expect.arrayContaining([
      path.join(__dirname, '..', '..', 'logs', 'audit.log'),
      path.join(__dirname, '..', '..', 'logs', 'security-critical.log')
    ]));
  });
});
EOF
```

- [ ] **Step 3: Run it and confirm it fails for the right reason.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test -- tests/utils/auditLoggerLogDir.test.js
```
Expected: **2 failed, 1 passed**. Case 1 fails with an array containing `/mnt/c/Users/rickh/GitHub/crhs-web-core/logs/audit.log` instead of the `/tmp/wc-audit-*/audit.log` entries; case 2 fails `Received: false` (nothing was written under `$LOG_DIR`); case 3 ("falls back") passes, because the fallback is what the code does unconditionally today. If case 3 fails, stop — the package `logs/` path assumption is wrong.

---

### Task 14: web-core — implement `LOG_DIR` in `auditLogger` (B3a)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/utils/auditLogger.js:4-27` (insert `logDir`, repoint `:17` and `:23`)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/utils/auditLoggerLogDir.test.js` (from Task 13)

**Interfaces:**
- Consumes: `process.env.LOG_DIR` (same variable `src/utils/logger.js:11` already reads); the RED from Task 13
- Produces: `src/utils/auditLogger.js` module exports unchanged — `{ auditLogger, AuditEvents, logAuditEvent, auditMiddleware, logLoginAttempt, logSensitiveDataAccess, logPaymentActivity, logSuspiciousActivity }`. Consumed by Task 15 (affiliate proof) and Task 16 (box evidence).

- [ ] **Step 1: Add the `logDir` constant.** Replace the header block (`src/utils/auditLogger.js:1-6`) exactly:
```js
// Audit Logger for Security Events
// Logs important security events for compliance and monitoring

const winston = require('winston');
const path = require('path');

// Log destination — resolved EXACTLY as src/utils/logger.js:11 does. Without
// this, the __dirname-relative paths resolve inside the installed package
// (node_modules/@crhs/web-core/logs on a --install-links box), so a consumer's
// audit trail is invisible in its own logs/ and is deleted by every npm install.
const logDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');

// Create audit logger with separate file
```

- [ ] **Step 2: Repoint the audit transport (`:17` pre-edit).**
```js
    new winston.transports.File({
      filename: path.join(logDir, 'audit.log'),
```
(replacing `filename: path.join(__dirname, '../../logs/audit.log'),`)

- [ ] **Step 3: Repoint the critical transport (`:23` pre-edit).**
```js
    new winston.transports.File({
      filename: path.join(logDir, 'security-critical.log'),
```
(replacing `filename: path.join(__dirname, '../../logs/security-critical.log'),`)

- [ ] **Step 4: Run the new suite — expect PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test -- tests/utils/auditLoggerLogDir.test.js
```
Expected: `Tests: 3 passed, 3 total`.

- [ ] **Step 5: Run the pre-existing auditLogger suite — no regression.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test -- tests/utils/auditLogger.test.js
```
Expected: `Tests: 26 passed, 26 total` (that file mocks winston, so the filename change is invisible to it).

- [ ] **Step 6: Lint and commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx eslint src/utils/auditLogger.js tests/utils/auditLoggerLogDir.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core add src/utils/auditLogger.js tests/utils/auditLoggerLogDir.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core commit -m "$(cat <<'EOF'
fix(auditLogger): honour LOG_DIR (B3a)

The two File transports were __dirname-relative, so on an --install-links box
every consumer's audit events — including the portal's CSRF_VALIDATION_FAILED
events, written by web-core's auditLogger via src/config/csrf-config.js:13 —
landed in <consumer>/node_modules/@crhs/web-core/logs/ and were wiped by the
next npm install. Same resolution as src/utils/logger.js:11.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core push
```
Expected: one commit, `2 files changed`.

---

### Task 15: affiliate — consumer proof that CSRF audit events land in `$LOG_DIR`

**Files:**
- Create: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/integration/auditLogDir.test.js`
- Test: the new file (1 case, two assertions: the event lands in `$LOG_DIR`, and nothing new is written inside `node_modules/@crhs/web-core/logs`)

**Interfaces:**
- Consumes: Task 14's `LOG_DIR` fix; `server.js:20` → `require('./server/config/csrf-config')` → `require('@crhs/web-core').csrf` → web-core `src/config/csrf-config.js:288` `auditLogger.logSuspiciousActivity('CSRF_VALIDATION_FAILED', …)`; 403 body `{ success:false, error:'Invalid or missing CSRF token', code:'CSRF_VALIDATION_FAILED', message }` (csrf-config `:301-306`)
- Produces: no source interface — a permanent regression guard on the portal's audit trail

- [ ] **Step 1: Confirm the affiliate is on a COPY of web-core (Task 5 landed).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && test -L node_modules/@crhs/web-core && echo SYMLINK || echo COPY
```
Expected: `COPY`. If it prints `SYMLINK`, Task 5 (`.npmrc install-links=true` + lock regen) has not merged — **stop and run Task 5 first**; with a symlink this task cannot produce an honest red.

- [ ] **Step 2: Write the failing test.**
```bash
cat > /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/integration/auditLogDir.test.js <<'EOF'
// Consumer proof for web-core §7.2.7 (B3a). The portal's CSRF audit trail is
// written by WEB-CORE's auditLogger — server/config/csrf-config.js is a 5-line
// re-export of wc.csrf, and web-core's src/config/csrf-config.js:13 requires its
// OWN auditLogger. Before the LOG_DIR fix every CSRF_VALIDATION_FAILED event
// landed in node_modules/@crhs/web-core/logs/audit.log, invisible in this app's
// logs/ and deleted by the next npm install.
//
// LOG_DIR must be set BEFORE require('../../server') — the transports are built
// at require time.

const fs = require('fs');
const os = require('os');
const path = require('path');

const LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-audit-'));
const SAVED_LOG_DIR = process.env.LOG_DIR;
process.env.LOG_DIR = LOG_DIR;

const request = require('supertest');
const app = require('../../server');

const STRAY = path.join(__dirname, '..', '..', 'node_modules', '@crhs', 'web-core', 'logs', 'audit.log');
const sizeOf = (f) => (fs.existsSync(f) ? fs.statSync(f).size : 0);

const waitForNeedle = async (file, needle, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(needle)) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
};

describe('portal audit trail honours LOG_DIR', () => {
  afterAll(() => {
    if (SAVED_LOG_DIR === undefined) delete process.env.LOG_DIR;
    else process.env.LOG_DIR = SAVED_LOG_DIR;
  });

  it('a rejected CSRF mutation writes CSRF_VALIDATION_FAILED to $LOG_DIR/audit.log, not into node_modules', async () => {
    const strayBefore = sizeOf(STRAY);

    // Any POST that is not on the public/auth/registration allowlist is CSRF
    // enforced by default (shouldEnforceCsrf ends in `return true`), so this
    // probe does not depend on the route tables.
    const res = await request(app).post('/api/v1/__csrf-probe').send({ probe: true });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_VALIDATION_FAILED');

    await expect(waitForNeedle(path.join(LOG_DIR, 'audit.log'), 'CSRF_VALIDATION_FAILED'))
      .resolves.toBe(true);
    expect(sizeOf(STRAY)).toBe(strayBefore);
  });
});
EOF
```

- [ ] **Step 3: Run it against the INSTALLED (pre-fix) copy of web-core — expect RED.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npm test -- tests/integration/auditLogDir.test.js
```
Expected failure: the 403 assertions pass, then
```
  ● portal audit trail honours LOG_DIR › a rejected CSRF mutation writes ...
    received value must be true
    Received: false
```
because the event went to `node_modules/@crhs/web-core/logs/audit.log` (and `sizeOf(STRAY)` grew). That is the live defect, reproduced.

- [ ] **Step 4: Install the fixed core copy.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && rm -rf node_modules/@crhs/web-core && npm install --install-links
grep -n "logDir" node_modules/@crhs/web-core/src/utils/auditLogger.js
git checkout -- package-lock.json && git status --porcelain
```
Expected: the grep shows `const logDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');`, and the only modified/untracked file is the new test.

- [ ] **Step 5: Re-run — expect PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npm test -- tests/integration/auditLogDir.test.js
```
Expected: `Tests: 1 passed, 1 total`.

- [ ] **Step 6: Commit (test only — no production code changed in this repo).**
```bash
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program add tests/integration/auditLogDir.test.js
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program commit -m "$(cat <<'EOF'
test(audit): pin that CSRF audit events land in $LOG_DIR (web-core B3a)

The portal's CSRF audit trail is written by web-core's auditLogger through the
wc.csrf re-export; before B3a it landed inside node_modules/@crhs/web-core/logs.
This guard fails again if the resolution ever regresses.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program push
```

---

### Task 16: **HUMAN-CONFIRM** — gather the production `LOG_DIR` evidence (read-only; the write is Plan 2 Phase 0a)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/docs/refactor/plan1-exit-gate.md` (append the findings)
- **No `.env` is written on any box in this task.** Spec §7.2.7 and §7.6.6 schedule `LOG_DIR=/var/www/crhs-corporate/logs` for **Phase 0a (Plan 2)**, and Global Constraints 14 and 17 forbid a prod `.env` write in Plan 1 — the checklist committed in Task 1 says so in writing.
- Test: none in-repo; the behaviour is covered by Tasks 13–15

**Interfaces:**
- Consumes: `LOG_DIR` in `src/utils/logger.js:11` and (after Task 14) `src/utils/auditLogger.js`
- Produces: the recorded current `LOG_DIR` value per app per box, and a Plan-2 0a checklist item

- [ ] **Step 1: Read the current value on both boxes (read-only).**
```bash
for H in 161.153.71.201 144.24.4.202; do
  echo "== $H =="
  ssh -i ~/.ssh/oci_wavemax ubuntu@$H "grep -n '^LOG_DIR' /var/www/wavemax/wavemax-affiliate-program/.env || echo 'affiliate: LOG_DIR UNSET'; grep -n '^LOG_DIR' /var/www/crhs-corporate/.env || echo 'corporate: LOG_DIR UNSET'"
done
```
Expected: either a `LOG_DIR=...` line per app, or the `UNSET` marker. Record which, per app, per box.

- [ ] **Step 2: Show where the logs are actually being written today (the evidence Plan 2 acts on).**
```bash
for H in 161.153.71.201 144.24.4.202; do
  echo "== $H =="
  ssh -i ~/.ssh/oci_wavemax ubuntu@$H "ls -la /var/www/wavemax/wavemax-affiliate-program/node_modules/@crhs/web-core/logs/ 2>/dev/null; ls -la /var/www/crhs-corporate/node_modules/@crhs/web-core/logs/ 2>/dev/null"
done
```
Expected on at least one app: `audit.log` / `combined.log` / `error.log` inside `node_modules/@crhs/web-core/logs/` — the defect, live. Note that Task 14 only makes `LOG_DIR` *effective*; with `LOG_DIR` unset the files still land inside the package, which is why Plan 2 must set it.

- [ ] **Step 3: Record the finding and open the Plan-2 item (no box change).** Append to `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/docs/refactor/plan1-exit-gate.md`:
```markdown
## LOG_DIR evidence (read-only, <DATE>) — the WRITE is Plan 2 Phase 0a
| box | affiliate LOG_DIR | corporate LOG_DIR | stray logs inside node_modules/@crhs/web-core/logs |
|---|---|---|---|
| oci1 161.153.71.201 | <value or UNSET> | <value or UNSET> | <ls output summary> |
| oci2 144.24.4.202 | <value or UNSET> | <value or UNSET> | <ls output summary> |

web-core v0.2.0 makes LOG_DIR effective for auditLogger (B3a, Task 14). Plan 1 writes
NO prod .env key (Global Constraints 14/17). Plan 2 Phase 0a must add, confirm-first,
per box: `LOG_DIR=/var/www/crhs-corporate/logs` to the corporate .env (spec §7.2.7,
§7.6.6) and, if the affiliate's is UNSET,
`LOG_DIR=/var/www/wavemax/wavemax-affiliate-program/logs` — backing up each .env to
/var/www/wavemax/env-backups/ (NEVER inside a repo checkout — 2026-08-24 .env.bak
exposure lesson) and reloading with `pm2 reload <app> --update-env`.
```
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git add docs/refactor/plan1-exit-gate.md && git commit -m "$(cat <<'EOF'
docs(plan1): record the production LOG_DIR state; the .env write is Plan 2 0a

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)" && git push origin main
```

---

### Task 17: web-core — failing test: `corsConfig` must be env-only (B3b)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/security/corsConfig.test.js` (rewrite; 5 → 13 cases)
- Test: that file

**Interfaces:**
- Consumes: `require('../../src/security/corsConfig')` → plain object `{ origin(fn), credentials, methods, allowedHeaders, maxAge }`
- Produces: the RED that Task 18 turns green — pins "no env ⇒ no origin admitted"; `CORS_ORIGIN` ∪ `CORS_EXTRA_ORIGINS` is the ONLY source

- [ ] **Step 1: Record what the current file pins (it is the thing being deliberately inverted).** `tests/security/corsConfig.test.js:34-49` asserts the seven hardcoded origins ARE admitted with no env set — including `https://www.wavemaxlaundry.com`, i.e. today **both apps grant credentialed CORS to the franchisor**. That describe block is what this task inverts.

- [ ] **Step 2: Rewrite the test file.**
```bash
cat > /mnt/c/Users/rickh/GitHub/crhs-web-core/tests/security/corsConfig.test.js <<'EOF'
// CORS is ENV-ONLY (spec §7.2.6).
//
// The former fixed allowlist (src/security/corsConfig.js:15-24) granted
// credentialed CORS to the franchisor's wavemaxlaundry.com origins, to
// wavemax.promo and to the four CRHS location hosts — from BOTH consumers,
// whether or not they wanted it. Every admitted origin now comes from
// CORS_ORIGIN / CORS_EXTRA_ORIGINS, read at request time so the plain-object
// export shape (consumed as cors(wc.corsConfig)) is unchanged.

const corsConfig = require('../../src/security/corsConfig');

function decide(origin) {
  return new Promise((resolve) => {
    corsConfig.origin(origin, (err, allow) => resolve({ err, allow }));
  });
}

describe('security/corsConfig (env-only)', () => {
  const SAVED_ORIGIN = process.env.CORS_ORIGIN;
  const SAVED_EXTRA = process.env.CORS_EXTRA_ORIGINS;

  beforeEach(() => {
    delete process.env.CORS_ORIGIN;
    delete process.env.CORS_EXTRA_ORIGINS;
  });

  afterAll(() => {
    if (SAVED_ORIGIN === undefined) delete process.env.CORS_ORIGIN; else process.env.CORS_ORIGIN = SAVED_ORIGIN;
    if (SAVED_EXTRA === undefined) delete process.env.CORS_EXTRA_ORIGINS; else process.env.CORS_EXTRA_ORIGINS = SAVED_EXTRA;
  });

  it('keeps the object export shape (credentials/methods/headers/maxAge)', () => {
    expect(typeof corsConfig).toBe('object');
    expect(typeof corsConfig.origin).toBe('function');
    expect(corsConfig.credentials).toBe(true);
    expect(corsConfig.methods).toEqual(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']);
    expect(corsConfig.allowedHeaders).toEqual(['Content-Type', 'Authorization', 'x-csrf-token', 'csrf-token', 'xsrf-token', 'x-xsrf-token']);
    expect(corsConfig.maxAge).toBe(86400);
  });

  describe('with NO env set, nothing is admitted', () => {
    it.each([
      'https://www.wavemaxlaundry.com',
      'https://wavemaxlaundry.com',
      'https://wavemax.promo',
      'https://atxwashateria.com',
      'https://atxwashdryfold.com',
      'https://runberglaundry.com',
      'https://rundberglaundry.com',
      'http://localhost:3000'
    ])('rejects %s', async (origin) => {
      const { err, allow } = await decide(origin);
      expect(err).toBeNull();
      expect(allow).toBe(false);
    });
  });

  it('admits exactly the origins CORS_ORIGIN names', async () => {
    process.env.CORS_ORIGIN = 'https://portal.atxwashdryfold.com, https://atxwashdryfold.com';
    expect((await decide('https://portal.atxwashdryfold.com')).allow).toBe(true);
    expect((await decide('https://atxwashdryfold.com')).allow).toBe(true);
    expect((await decide('https://rundberglaundry.com')).allow).toBe(false);
  });

  it('CORS_EXTRA_ORIGINS remains additive on top of CORS_ORIGIN', async () => {
    process.env.CORS_ORIGIN = 'https://a.example.com';
    process.env.CORS_EXTRA_ORIGINS = ' https://b.example.com , https://c.example.com ';
    expect((await decide('https://a.example.com')).allow).toBe(true);
    expect((await decide('https://b.example.com')).allow).toBe(true);
    expect((await decide('https://c.example.com')).allow).toBe(true);
    expect((await decide('https://d.example.com')).allow).toBe(false);
  });

  it('CORS_EXTRA_ORIGINS alone still works (CORS_ORIGIN unset)', async () => {
    process.env.CORS_EXTRA_ORIGINS = 'https://only.example.com';
    expect((await decide('https://only.example.com')).allow).toBe(true);
  });

  it('rejects a null/absent origin cleanly (no throw, callback false)', async () => {
    process.env.CORS_ORIGIN = 'https://portal.atxwashdryfold.com';
    const { err, allow } = await decide(undefined);
    expect(err).toBeNull();
    expect(allow).toBe(false);
  });

  it('rejects an unknown origin cleanly rather than throwing', async () => {
    process.env.CORS_ORIGIN = 'https://portal.atxwashdryfold.com';
    const { err, allow } = await decide('https://evil.example.com');
    expect(err).toBeNull();
    expect(allow).toBe(false);
  });
});
EOF
```

- [ ] **Step 3: Run it — expect RED on the whole "NO env" block.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test -- tests/security/corsConfig.test.js
```
Expected: `Tests: 7 failed, 6 passed, 13 total` — the seven `rejects <origin>` cases for the hardcoded list fail with `expect(received).toBe(false) / Received: true` (`http://localhost:3000` also fails, from the `:12` default). The shape/extra-origins cases pass.

---

### Task 18: web-core — implement env-only `corsConfig` (B3b)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/security/corsConfig.js:1-34` (header comment + delete `wavemaxDomains` `:15-24` + default `:12`)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/security/corsConfig.test.js` (Task 17)

**Interfaces:**
- Consumes: `process.env.CORS_ORIGIN`, `process.env.CORS_EXTRA_ORIGINS`; the RED from Task 17
- Produces: `module.exports = corsConfig` — shape unchanged: `{ origin: (origin, cb) => void, credentials: true, methods: [...5], allowedHeaders: [...6], maxAge: 86400 }`. Consumed by Task 19 (corporate) and Task 20 (affiliate documentation).

- [ ] **Step 1: Replace lines 1-34 of `src/security/corsConfig.js`** (everything from the header through the `allAllowedOrigins` line) with:
```js
// @crhs/web-core — CORS options. ENV-ONLY (spec §7.2.6).
//
// The former fixed allowlist granted credentialed CORS to the franchisor's
// wavemaxlaundry.com origins, to wavemax.promo and to the four CRHS location
// hosts — from BOTH consumers, unconditionally. Every admitted origin now comes
// from CORS_ORIGIN / CORS_EXTRA_ORIGINS, read at request time so the plain
// object export shape (consumed as `cors(wc.corsConfig)`) is unchanged.
// No env ⇒ no cross-origin request is admitted. Same-origin traffic is
// unaffected: the browser sends no Origin worth allowlisting for it.

const parseList = (value) => (value || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsConfig = {
  origin: function (origin, callback) {
    const allAllowedOrigins = [
      ...parseList(process.env.CORS_ORIGIN),
      ...parseList(process.env.CORS_EXTRA_ORIGINS)
    ];
```
Everything from the `// H-7 / prod-lockdown-2026-05-20:` comment (old `:36`) to the end of file stays **byte-identical** — the null-origin rejection, the clean-rejection comment, `credentials`, `methods`, `allowedHeaders`, `maxAge`, `module.exports`.

- [ ] **Step 2: Verify nothing else in the file still references the deleted list.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && grep -n "wavemaxDomains\|extraOrigins\|allowedOrigins\|wavemaxlaundry" src/security/corsConfig.js
```
Expected: **no output**.

- [ ] **Step 3: Run the suite — expect PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test -- tests/security/corsConfig.test.js
```
Expected: `Tests: 13 passed, 13 total`.

- [ ] **Step 4: Prove no other core module depends on the deleted origins.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && grep -rn "corsConfig" src/ tests/ | grep -v "src/security/corsConfig.js" | grep -v "tests/security/corsConfig.test.js"
```
Expected: only `src/index.js:51:def('corsConfig', () => require('./security/corsConfig'));`.

- [ ] **Step 5: Lint and commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx eslint src/security/corsConfig.js tests/security/corsConfig.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core add src/security/corsConfig.js tests/security/corsConfig.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core commit -m "$(cat <<'EOF'
feat(cors)!: env-only origin allowlist (B3b)

BREAKING: the hardcoded allowlist (two wavemaxlaundry.com origins,
wavemax.promo, four CRHS location hosts) is deleted, as is the
http://localhost:3000 default. Origins come only from CORS_ORIGIN /
CORS_EXTRA_ORIGINS. Consumer impact: crhs-corporate (server.js:61) stops
granting credentialed CORS to the franchisor; the affiliate does not consume
wc.corsConfig (it has its own inline block) and is unaffected.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core push
```

---

### Task 19: corporate — CORS consumer PR (proof test + `.env.example`)

**Files:**
- Create: `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/cors.integration.test.js`
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/.env.example:63-64` (**HUMAN-CONFIRM** — production config reference)
- Test: the new file (3 cases)

**Interfaces:**
- Consumes: Task 18's env-only `corsConfig`; `crhs-corporate/server.js:61` `app.use(cors(wc.corsConfig))` — unchanged code; behaviour now driven by env
- Produces: no source interface. Establishes: corporate ships with **no** `CORS_ORIGIN`, i.e. no cross-origin request is admitted. Consumed by Task 55 Step 2 (the confirm-first `CORS_ORIGIN` read).

- [ ] **Step 1: Evidence that corporate needs no origin (paste into the PR body).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && grep -rnE '(fetch\(|XMLHttpRequest|axios)' content/ | head
```
Expected: **no output** — crhsent content makes no cross-origin requests. The only remote embed is the clickjacking demo's `<iframe>` (`content/wavemax/clickjacking-demo.html:478`), which is `frame-src`, not CORS.

- [ ] **Step 2: Write the failing test.**
```bash
cat > /mnt/c/Users/rickh/GitHub/crhs-corporate/tests/cors.integration.test.js <<'EOF'
// web-core v0.2.0 made corsConfig env-only (§7.2.6). Corporate declares no
// CORS_ORIGIN, so nothing is admitted — and in particular crhsent.com no longer
// hands the franchisor's origins a credentialed CORS grant it never needed.
const request = require('supertest');
const app = require('../server');

const HOST = 'crhsent.com';

describe('crhs-corporate CORS', () => {
  const SAVED = process.env.CORS_ORIGIN;
  afterEach(() => {
    if (SAVED === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = SAVED;
  });

  it('does NOT grant credentialed CORS to the franchisor', async () => {
    delete process.env.CORS_ORIGIN;
    const res = await request(app).get('/').set('Host', HOST).set('Origin', 'https://www.wavemaxlaundry.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('admits an origin only when CORS_ORIGIN names it', async () => {
    process.env.CORS_ORIGIN = 'https://example.test';
    const res = await request(app).get('/').set('Host', HOST).set('Origin', 'https://example.test');
    expect(res.headers['access-control-allow-origin']).toBe('https://example.test');
  });

  it('same-origin traffic is unaffected (no Origin header, page still served)', async () => {
    delete process.env.CORS_ORIGIN;
    const res = await request(app).get('/').set('Host', HOST);
    expect(res.status).toBe(200);
  });
});
EOF
```

- [ ] **Step 3: Run against the currently installed (pre-B3b) core copy — expect RED on case 1.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npm test -- tests/cors.integration.test.js
```
Expected:
```
  ● crhs-corporate CORS › does NOT grant credentialed CORS to the franchisor
    Received: "https://www.wavemaxlaundry.com"
```
cases 2 and 3 pass. This is the franchisor grant, live on crhsent.com today.

- [ ] **Step 4: Install the new core copy and re-run — expect PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && rm -rf node_modules/@crhs/web-core && npm install --install-links && npm test -- tests/cors.integration.test.js
```
Expected: `Tests: 3 passed, 3 total`. If `npm install` rewrote `package-lock.json`, `git checkout -- package-lock.json` — Task 7 owns the lock.

- [ ] **Step 5: HUMAN-CONFIRM — `.env.example` edit (production config reference).** Show Rick this exact replacement for `/mnt/c/Users/rickh/GitHub/crhs-corporate/.env.example:63-64` and get approval before applying:
```
# --- Optional web-core knobs (sane defaults if unset) -----------------
# CORS_ORIGIN=                  # comma-separated cross-origin allowlist. As of
#                               # web-core v0.2.0 CORS is ENV-ONLY: unset means
#                               # NO cross-origin request is admitted, which is
#                               # correct for crhsent.com (its content makes no
#                               # cross-origin fetch/XHR; the clickjacking demo
#                               # uses frame-src, not CORS). Leave unset.
# CORS_EXTRA_ORIGINS=           # additive extension of the same allowlist
```
No production `.env` change is required for this app — `CORS_ORIGIN` stays unset on both boxes, which is the new, correct default.

- [ ] **Step 6: Run corporate's full suite and commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npm test 2>&1 | tail -6
git -C /mnt/c/Users/rickh/GitHub/crhs-corporate add tests/cors.integration.test.js .env.example
git -C /mnt/c/Users/rickh/GitHub/crhs-corporate commit -m "$(cat <<'EOF'
test(cors): pin env-only CORS; crhsent no longer grants the franchisor (B3b)

web-core v0.2.0 deleted corsConfig's hardcoded allowlist. Corporate declares no
CORS_ORIGIN, so nothing cross-origin is admitted; crhsent content makes no
cross-origin fetch/XHR (grep evidence in the PR body).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git -C /mnt/c/Users/rickh/GitHub/crhs-corporate push
```
Expected before committing: exactly the 4 pre-existing `tests/crhsent-parity.test.js` ENOENT failures and 3 more passing than the previous corporate run.

---

### Task 20: affiliate — document the production CORS origins so the later B11 adoption cannot lose one

**Files:**
- Create: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/unit/corsOriginPolicy.test.js`
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/.env.example:72-79` (**HUMAN-CONFIRM** — production config reference)
- Test: the new file (2 cases)

**Interfaces:**
- Consumes: Task 18 (inert here — the affiliate does not consume `wc.corsConfig`); `server.js:282-328` inline `corsOptions` (`wavemaxDomains` at `:289-294`)
- Produces: an executable contract — `.env.example` must document every origin the inline list carries, so PR B11 (Plan 4, `app.use(cors(wc.corsConfig))`) cannot silently drop one

- [ ] **Step 1: Write the failing test.**
```bash
cat > /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/unit/corsOriginPolicy.test.js <<'EOF'
// web-core v0.2.0 made wc.corsConfig env-only. This app does NOT consume it yet
// (server.js:282-328 is an inline allowlist), so v0.2.0 is inert here — but when
// the adoption PR (B11) swaps the inline block for cors(wc.corsConfig), every
// origin must already be named in the env. This test makes .env.example the
// executable record of that set, so the swap cannot silently lose one.

const fs = require('fs');
const path = require('path');

const REQUIRED_ORIGINS = [
  'https://portal.atxwashdryfold.com',
  'https://atxwashateria.com',
  'https://atxwashdryfold.com',
  'https://rundberglaundry.com'
];

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('CORS origin policy', () => {
  it('server.js still uses its own inline allowlist, not wc.corsConfig', () => {
    const src = read('server.js');
    expect(src).toContain('app.use(cors(corsOptions));');
    expect(src).not.toContain('webCore.corsConfig');
  });

  it('.env.example documents every inline origin for the B11 swap', () => {
    const env = read('.env.example');
    for (const origin of REQUIRED_ORIGINS) {
      expect(env).toContain(origin);
    }
  });
});
EOF
```

- [ ] **Step 2: Run it — expect RED on case 2.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npm test -- tests/unit/corsOriginPolicy.test.js
```
Expected: case 1 passes; case 2 fails on the first missing origin —
```
  ● CORS origin policy › .env.example documents every inline origin for the B11 swap
    expect(received).toContain("https://atxwashateria.com")
```
(today `.env.example` names only `https://portal.atxwashdryfold.com`, in the `CORS_EXTRA_ORIGINS` note.)

- [ ] **Step 3: HUMAN-CONFIRM — `.env.example` edit.** Show Rick this exact replacement for the `# CORS Configuration` block (`.env.example:72-79`) and get approval before applying:
```
# CORS Configuration
# Local dev default. NOTE: as of @crhs/web-core v0.2.0 the shared corsConfig is
# ENV-ONLY (no built-in origins). This app still uses its own inline allowlist in
# server.js:282-328; when the CORS adoption PR (B11) replaces that block with
# cors(wc.corsConfig), PRODUCTION must set CORS_ORIGIN to exactly the origins the
# inline list carries today, or the app loses them:
#   CORS_ORIGIN=https://portal.atxwashdryfold.com,https://atxwashateria.com,https://atxwashdryfold.com,https://rundberglaundry.com
CORS_ORIGIN=http://localhost:3000
# CORS_EXTRA_ORIGINS — additive extension read by the same web-core config.
#CORS_EXTRA_ORIGINS=
```

- [ ] **Step 4: Re-run — expect PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npm test -- tests/unit/corsOriginPolicy.test.js
```
Expected: `Tests: 2 passed, 2 total`.

- [ ] **Step 5: Commit.**
```bash
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program add tests/unit/corsOriginPolicy.test.js .env.example
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program commit -m "$(cat <<'EOF'
docs(cors): record the production origin set for the B11 swap (web-core B3b)

web-core v0.2.0 made wc.corsConfig env-only. This app still uses its inline
allowlist, so the change is inert here; .env.example now names all four origins
and a test enforces that, so the later adoption PR cannot drop one.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program push
```

---
### Task 21: web-core — failing test: `buildCspDirectives` profile parameter (B3c)

**Files:**
- Create: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/security/cspProfiles.test.js`
- Test: the new file (13 cases)

**Interfaces:**
- Consumes: `require('../../src/security/cspDirectives')` → `{ buildCspDirectives, serializeCspDirectives, isStrictCspPath, … }`
- Produces (target of Task 22):
  - `buildCspDirectives({ nonce, useStrictCSP, profile = 'full', scriptSrcExtra = [], imgSrcExtra = [], connectSrcExtra = [], frameSrcExtra = [], frameAncestors = ["'self'"] }) → directives`
  - `CSP_PROFILES` — frozen table, **module export only, NOT an index key** (the index surface stays at 28 keys until Task 53 takes it to 26)
  - `isStrictCspPath(path, { strictCSPPages = [], isDocumentationPage, isCleanUrlSlugPage })`

- [ ] **Step 1: Write the failing test file.**
```bash
cat > /mnt/c/Users/rickh/GitHub/crhs-web-core/tests/security/cspProfiles.test.js <<'EOF'
// CSP profiles (spec §7.2.5). The builder carries NO app/host literals: the
// per-app origins arrive as *Extra arrays, and the third-party host sets live in
// two named profiles. `full` = today's third-party allowlist (the portal +
// crhsent surfaces); `marketing` = self-hosted only.

const {
  buildCspDirectives,
  serializeCspDirectives,
  isStrictCspPath,
  CSP_PROFILES
} = require('../../src/security/cspDirectives');

const NONCE = 'profile-test-nonce';

describe('CSP_PROFILES', () => {
  it('exports a frozen table with exactly the two profiles', () => {
    expect(Object.keys(CSP_PROFILES).sort()).toEqual(['full', 'marketing']);
    expect(Object.isFrozen(CSP_PROFILES)).toBe(true);
  });
});

describe('buildCspDirectives — marketing profile', () => {
  it('emits the exact self-hosted-only header (strict)', () => {
    const csp = serializeCspDirectives(buildCspDirectives({
      nonce: NONCE, useStrictCSP: true, profile: 'marketing'
    }));
    expect(csp).toBe(
      `default-src 'self'; ` +
      `script-src 'self' 'nonce-${NONCE}'; ` +
      `style-src 'self' 'unsafe-inline'; ` +
      `img-src 'self' data:; ` +
      `connect-src 'self'; ` +
      `font-src 'self'; ` +
      `object-src 'none'; ` +
      `media-src 'self'; ` +
      `frame-src 'none'; ` +
      `form-action 'self'; ` +
      `frame-ancestors 'self'; ` +
      `base-uri 'self'; ` +
      `child-src 'none'; ` +
      `worker-src 'self'; ` +
      `manifest-src 'self'`
    );
  });

  it('carries none of the full profile third-party hosts', () => {
    const d = buildCspDirectives({ nonce: NONCE, useStrictCSP: true, profile: 'marketing' });
    for (const host of ['https://cdnjs.cloudflare.com', 'https://maps.googleapis.com', 'https://connect.facebook.net', 'https://www.google.com']) {
      expect(d['script-src']).not.toContain(host);
      expect(d['connect-src']).not.toContain(host);
      expect(d['img-src']).not.toContain(host);
    }
  });
});

describe('buildCspDirectives — full profile', () => {
  it('is the default profile and keeps the 11 script hosts', () => {
    const d = buildCspDirectives({ nonce: NONCE, useStrictCSP: true });
    expect(d['script-src']).toEqual([
      "'self'",
      'https://cdnjs.cloudflare.com',
      'https://cdn.jsdelivr.net',
      'https://code.jquery.com',
      'https://www.local-marketing-reports.com',
      'https://static.cloudflareinsights.com',
      'https://maps.googleapis.com',
      'https://connect.facebook.net',
      'https://challenges.cloudflare.com',
      'https://www.gstatic.com',
      'https://www.google.com',
      'https://apis.google.com',
      `'nonce-${NONCE}'`
    ]);
  });

  it('carries NO app/host literals: no wavemax.promo, no CRHS hosts, no Firebase project origin', () => {
    const d = buildCspDirectives({ nonce: NONCE, useStrictCSP: true });
    const all = JSON.stringify(d);
    for (const literal of [
      'wavemax.promo',
      'atxwashateria.com',
      'atxwashdryfold.com',
      'rundberglaundry.com',
      'runberglaundry.com',
      'wavemax-bag-registration.firebaseapp.com',
      'wavemaxlaundry.com'
    ]) {
      expect(all).not.toContain(literal);
    }
  });

  it('places extras before the profile hosts, after self/data:', () => {
    const d = buildCspDirectives({
      nonce: NONCE,
      useStrictCSP: true,
      imgSrcExtra: ['https://img.example.com'],
      connectSrcExtra: ['https://api.example.com'],
      frameSrcExtra: ['https://frame.example.com'],
      scriptSrcExtra: ['https://js.example.com']
    });
    expect(d['img-src'].slice(0, 3)).toEqual(["'self'", 'data:', 'https://img.example.com']);
    expect(d['connect-src'].slice(0, 2)).toEqual(["'self'", 'https://api.example.com']);
    expect(d['frame-src'].slice(0, 2)).toEqual(["'self'", 'https://frame.example.com']);
    expect(d['script-src'].slice(0, 2)).toEqual(["'self'", 'https://js.example.com']);
  });
});

describe('buildCspDirectives — frameAncestors + unknown profile', () => {
  it("defaults frame-ancestors to 'self' only (the franchisor default is gone)", () => {
    expect(buildCspDirectives({ nonce: NONCE, useStrictCSP: true })['frame-ancestors']).toEqual(["'self'"]);
  });

  it('honours an explicit frameAncestors override', () => {
    const d = buildCspDirectives({ nonce: NONCE, useStrictCSP: true, frameAncestors: ["'self'", 'https://parent.example.com'] });
    expect(d['frame-ancestors']).toEqual(["'self'", 'https://parent.example.com']);
  });

  it('throws on an unknown profile', () => {
    expect(() => buildCspDirectives({ nonce: NONCE, useStrictCSP: true, profile: 'nope' }))
      .toThrow('buildCspDirectives: unknown profile "nope"');
  });
});

describe('isStrictCspPath — empty default page list', () => {
  it('no longer carries a built-in strict-page allowlist', () => {
    expect(isStrictCspPath('/affiliate-landing-embed.html')).toBe(false);
  });

  it('honours a caller-supplied allowlist', () => {
    expect(isStrictCspPath('/affiliate-landing-embed.html', { strictCSPPages: ['/affiliate-landing-embed.html'] })).toBe(true);
  });

  it('still resolves clean-URL slug pages and documentation pages strict', () => {
    expect(isStrictCspPath('/austin')).toBe(true);
    expect(isStrictCspPath('/wavemax/')).toBe(true);
    expect(isStrictCspPath('/docs/guide.html')).toBe(true);
    expect(isStrictCspPath('/wavemax/styles.css')).toBe(false);
  });
});
EOF
```

- [ ] **Step 2: Run it — expect RED.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test -- tests/security/cspProfiles.test.js
```
Expected: roughly `Tests: 9 failed, 4 passed` — `CSP_PROFILES` is `undefined` (`Cannot convert undefined or null to object` on `Object.keys`), the marketing header case fails because `profile` is ignored, the "no app/host literals" case fails on `wavemax.promo`, `frame-ancestors` comes back as the three-origin franchisor default, the unknown-profile case does not throw, and `isStrictCspPath('/affiliate-landing-embed.html')` returns `true` from the built-in 25-page list.

---

### Task 22: web-core — implement the CSP profile parameter (B3c) — **DO NOT COMMIT; pairs with Task 23**

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/security/cspDirectives.js` (full rewrite of `:1-141`, `:156-222`, `:272-279`; the `:224-254` nonce/style/`upgrade-insecure-requests` tail and `serializeCspDirectives` `:263-270` are preserved verbatim)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/security/cspProfiles.test.js` (Task 21)

**Interfaces:**
- Consumes: `process.env.NODE_ENV` (production ⇒ `upgrade-insecure-requests`) — unchanged; the RED from Task 21
- Produces:
  - `buildCspDirectives({ nonce, useStrictCSP, profile='full', scriptSrcExtra=[], imgSrcExtra=[], connectSrcExtra=[], frameSrcExtra=[], frameAncestors=["'self'"] })`
  - `isStrictCspPath(path, { strictCSPPages=[], isDocumentationPage, isCleanUrlSlugPage })`
  - `serializeCspDirectives(directives)` (unchanged)
  - module exports: `{ CSP_PROFILES, isDocumentationPage, isCleanUrlSlugPage, isStrictCspPath, buildCspDirectives, serializeCspDirectives }` — `strictCSPPages` and `isFranchiseHostPage` are gone
  - Consumed by Task 23 (goldens), Task 24 (corporate), Task 25 (affiliate)

- [ ] **Step 1: Replace `src/security/cspDirectives.js:1-98`** (header through `isStrictCspPath`) with:
```js
// @crhs/web-core — CSP directive builder.
//
// The builder carries NO app-specific or host-specific literals. Two axes:
//   * `profile` selects the THIRD-PARTY host sets:
//       full      — the vendor origins the portal + crhsent surfaces need
//       marketing — none; every asset is self-hosted
//   * the *Extra arrays carry the caller's OWN origins (its domains, its
//     embedded iframes). Token order in every directive:
//       'self' → fixed tokens (data: for img-src) → extras → profile hosts →
//       nonce / 'unsafe-inline' tail
// frame-ancestors defaults to 'self' — a caller that is framed elsewhere passes
// its own list. Callers own their strict-page allowlist too (isStrictCspPath's
// strictCSPPages defaults to []).
//
// CSP_PROFILES is exported from THIS module only, never added to src/index.js:
// the public index surface is a fixed key count pinned by tests/index.smoke.test.js.

const CSP_PROFILES = Object.freeze({
  full: Object.freeze({
    scriptSrc: Object.freeze([
      'https://cdnjs.cloudflare.com',
      'https://cdn.jsdelivr.net',
      'https://code.jquery.com',
      'https://www.local-marketing-reports.com',
      // reports.hibu.com is absent by design: the Hibu phone-insertion script is
      // self-hosted at /assets/vendor/ybDynamicPhoneInsertion.js.
      'https://static.cloudflareinsights.com',
      // Google Maps JS API loader + bootstrap (locations modal)
      'https://maps.googleapis.com',
      // Meta Pixel loader (connect.facebook.net/en_US/fbevents.js)
      'https://connect.facebook.net',
      // Cloudflare Turnstile widget
      'https://challenges.cloudflare.com',
      // Firebase Phone Auth — reCAPTCHA widget + Google helpers load at runtime
      // even though the Firebase SDK itself is vendored.
      'https://www.gstatic.com',
      'https://www.google.com',
      'https://apis.google.com'
    ]),
    styleSrc: Object.freeze([
      'https://cdnjs.cloudflare.com',
      'https://cdn.jsdelivr.net',
      'https://fonts.googleapis.com',
      'https://stackpath.bootstrapcdn.com'
    ]),
    imgSrc: Object.freeze([
      'https://*.tile.openstreetmap.org',
      'https://tile.openstreetmap.org',
      'https://cdnjs.cloudflare.com',
      'https://flagcdn.com',
      'https://secure.walibu.com',
      'https://upload.wikimedia.org',
      'https://*.googleusercontent.com',
      'https://maps.googleapis.com',
      'https://maps.gstatic.com',
      'https://*.googleapis.com',
      'https://*.gstatic.com',
      'https://www.facebook.com'
    ]),
    connectSrc: Object.freeze([
      'https://cdn.jsdelivr.net',
      'https://cdnjs.cloudflare.com',
      'https://stackpath.bootstrapcdn.com',
      'https://router.project-osrm.org',
      'https://graphhopper.com',
      'https://api.openrouteservice.org',
      'https://valhalla1.openstreetmap.de',
      'https://nominatim.openstreetmap.org',
      'https://www.local-marketing-reports.com',
      'https://places.googleapis.com',
      'https://maps.googleapis.com',
      'https://maps.gstatic.com',
      'https://connect.facebook.net',
      'https://www.facebook.com',
      // Firebase Phone Auth — Identity Toolkit + secure-token endpoints, plus the
      // reCAPTCHA origins the v2 fallback fetches from. Without www.google.com
      // here the verification XHRs are CSP-blocked and signInWithPhoneNumber hangs.
      'https://identitytoolkit.googleapis.com',
      'https://securetoken.googleapis.com',
      'https://www.googleapis.com',
      'https://www.google.com',
      'https://www.gstatic.com',
      'https://www.recaptcha.net'
    ]),
    fontSrc: Object.freeze([
      'https://cdnjs.cloudflare.com',
      'https://cdn.jsdelivr.net',
      'https://fonts.gstatic.com'
    ]),
    frameSrc: Object.freeze([
      'https://www.google.com',
      'https://maps.google.com',
      'https://my.matterport.com',
      'https://challenges.cloudflare.com',
      // reCAPTCHA v2 challenge iframe (fallback when Enterprise can't init).
      'https://www.recaptcha.net'
    ])
  }),
  marketing: Object.freeze({
    scriptSrc: Object.freeze([]),
    styleSrc: Object.freeze([]),
    imgSrc: Object.freeze([]),
    connectSrc: Object.freeze([]),
    fontSrc: Object.freeze([]),
    frameSrc: Object.freeze([])
  })
});

/**
 * Strict CSP applies to documentation pages as well (but not examples).
 * @param {string} path - req.path
 * @returns {boolean}
 */
function isDocumentationPage(path) {
  return path.startsWith('/docs/') &&
         path.endsWith('.html') &&
         !path.includes('/examples/');
}

/**
 * Strict CSP applies to clean-URL slug renders (/<slug>/ and /<slug>/<page>) —
 * single-segment slug or slug + page, lowercase + digits + hyphens, no dots
 * (i.e. not a static-file request like .html or .js).
 * @param {string} path - req.path
 * @returns {boolean}
 */
function isCleanUrlSlugPage(path) {
  return /^\/[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)?\/?$/.test(path)
    && !path.startsWith('/api/')
    && !path.startsWith('/assets/')
    && !path.startsWith('/locales/')
    && !path.startsWith('/docs/')
    && !path.startsWith('/dev/');
}

/**
 * Compute whether a request path should use strict (nonce-based) CSP.
 * The strict-page allowlist is the CALLER's (default []); the predicate options
 * accept either a boolean or a (path) => boolean function.
 *
 * @param {string} path - req.path
 * @param {object} [opts]
 * @param {string[]} [opts.strictCSPPages] - caller's strict-page allowlist (default [])
 * @param {boolean|function} [opts.isDocumentationPage]
 * @param {boolean|function} [opts.isCleanUrlSlugPage]
 * @returns {boolean}
 */
function isStrictCspPath(path, opts = {}) {
  const pages = opts.strictCSPPages || [];

  const docOpt = opts.isDocumentationPage !== undefined ? opts.isDocumentationPage : isDocumentationPage;
  const slugOpt = opts.isCleanUrlSlugPage !== undefined ? opts.isCleanUrlSlugPage : isCleanUrlSlugPage;

  const isDoc = typeof docOpt === 'function' ? docOpt(path) : docOpt;
  const isSlug = typeof slugOpt === 'function' ? slugOpt(path) : slugOpt;

  return pages.includes(path) || isDoc || isSlug;
}
```

- [ ] **Step 2: Replace the builder (old `:100-222`, i.e. the JSDoc through the closing brace of the `directives` object) with:**
```js
/**
 * Build the CSP directives object for one request.
 *
 * @param {object} args
 * @param {string} args.nonce - per-request CSP nonce (res.locals.cspNonce)
 * @param {boolean} args.useStrictCSP - whether strict CSP applies to this path
 * @param {string} [args.profile='full'] - key of CSP_PROFILES
 * @param {string[]} [args.scriptSrcExtra] - caller's own script origins
 * @param {string[]} [args.imgSrcExtra] - caller's own img origins
 * @param {string[]} [args.connectSrcExtra] - caller's own connect origins
 * @param {string[]} [args.frameSrcExtra] - caller's own frame origins
 * @param {string[]} [args.frameAncestors] - the frame-ancestors list (default ["'self'"])
 * @returns {object} directives object (arrays of source values)
 */
function buildCspDirectives({
  nonce,
  useStrictCSP,
  profile = 'full',
  scriptSrcExtra = [],
  imgSrcExtra = [],
  connectSrcExtra = [],
  frameSrcExtra = [],
  frameAncestors = ['\'self\'']
} = {}) {
  const p = CSP_PROFILES[profile];
  if (!p) throw new Error(`buildCspDirectives: unknown profile "${profile}"`);

  // All embed pages use nonces since embed-app.html became a CSP-compliant redirect.
  const skipNonce = false;

  const frameSources = [...frameSrcExtra, ...p.frameSrc];

  const directives = {
    'default-src': ['\'self\''],
    'script-src': ['\'self\'', ...scriptSrcExtra, ...p.scriptSrc],
    'style-src': ['\'self\'', ...p.styleSrc],
    'img-src': ['\'self\'', 'data:', ...imgSrcExtra, ...p.imgSrc],
    'connect-src': ['\'self\'', ...connectSrcExtra, ...p.connectSrc],
    'font-src': ['\'self\'', ...p.fontSrc],
    'object-src': ['\'none\''],
    'media-src': ['\'self\''],
    // A profile with no frame origins and no caller extras frames nothing.
    'frame-src': frameSources.length ? ['\'self\'', ...frameSources] : ['\'none\''],
    'form-action': ['\'self\''],
    'frame-ancestors': frameAncestors,
    'base-uri': ['\'self\''],
    'child-src': ['\'none\''],
    'worker-src': ['\'self\''],
    'manifest-src': ['\'self\'']
  };
```
Everything after this point — the CSP3-quirk comment block, the `if (!skipNonce && nonce)` push, the unconditional `style-src` `'unsafe-inline'`, the `if (!useStrictCSP)` push, the production `upgrade-insecure-requests`, `return directives;`, and `serializeCspDirectives` — stays **byte-identical** to the current `:224-270`.

- [ ] **Step 3: Replace the export block (old `:272-279`).**
```js
module.exports = {
  CSP_PROFILES,
  isDocumentationPage,
  isCleanUrlSlugPage,
  isStrictCspPath,
  buildCspDirectives,
  serializeCspDirectives,
};
```

- [ ] **Step 4: Verify the index surface is untouched (no 29th key).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && grep -n "cspDirectives" src/index.js && npm test -- tests/index.smoke.test.js
```
Expected: the same three `def(...)` lines (`:47,48,49`) and the smoke suite green at **28** keys — this task must not change the surface; the 28 → 26 edit is Task 53.

- [ ] **Step 5: Run the new profile suite — expect PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test -- tests/security/cspProfiles.test.js
```
Expected: `Tests: 13 passed, 13 total`.

- [ ] **Step 6: Run the full web-core suite and record the EXACT expected breakage.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -30
```
Expected: exactly **two** suites red — `tests/security/cspGolden.test.js` (the byte-for-byte pins, the `strictCSPPages` import at `:20`, the `frame-ancestors` expectation `:202-205`, the demo `frame-src` pin `:77-78`) and `tests/security/cspMonorepoParity.test.js` (all 4 cases; `MONOREPO_CSP_ARGS` passes retired argument names). Every other suite green. **If any THIRD suite is red, stop and fix it — that is real drift, not the authorized re-capture.**

- [ ] **Step 7: DO NOT COMMIT YET.** The working tree is deliberately red on those two golden files; Task 23 re-captures them and both changes land as **one** commit. Do not push, do not open a PR, and never use `--no-verify`.

---

### Task 23: web-core — **AUTHORIZED ONE-TIME GOLDEN RE-CAPTURE (D16a)** — commits Task 22 with it

> **REVIEWER INSTRUCTION — read before approving.** This is one of only two commits in the whole plan permitted to change a golden-master expectation. The goldens exist to prevent silent CSP drift; here the drift is the *intent*, ruled D16a. Approve **only** if every change below is one of these five, and nothing else:
> 1. `img-src` / `connect-src` lose `https://wavemax.promo`, `https://www.wavemax.promo`, `https://atxwashateria.com`, `https://atxwashdryfold.com`, `https://runberglaundry.com`, `https://rundberglaundry.com` (host literals moved to the caller).
> 2. `frame-src` loses `https://wavemax-bag-registration.firebaseapp.com` (the portal's Firebase project origin; the affiliate now supplies it — see Task 25).
> 3. `frame-ancestors` becomes `'self'` (the franchisor default is deleted).
> 4. The clickjacking-demo `frame-src` is now composed by the CALLER (`frameSrcExtra`) and therefore also carries `https://www.recaptcha.net`, which the old hardcoded demo branch dropped. This is a one-origin widening on one crhsent page — accepted, recorded here.
> 5. The strict-page allowlist moves into the test fixture (`strictCSPPages` is no longer exported).
>
> Any *other* delta — a vendor host added or removed, a directive reordered, `object-src`, `base-uri`, `worker-src` or `form-action` changing — means the implementation drifted. Fix the implementation, never the expectation.

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/security/cspGolden.test.js:1-40` (header + imports + `buildApp`), `:50-78` (`EXPECTED_STRICT_CSP`, `EXPECTED_DEMO_FRAME_SRC`), `:160-163`, `:202-205`
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/security/cspMonorepoParity.test.js:20-50`
- Test: both files

**Interfaces:**
- Consumes: `buildCspDirectives` / `isStrictCspPath` / `serializeCspDirectives` from Task 22
- Produces: the new byte-for-byte pin of (i) corporate's live crhsent header and (ii) the affiliate's header under its post-Task-25 args. Consumed by Tasks 24 and 25 as the reference output.

- [ ] **Step 1: Re-point `cspGolden.test.js` imports + `buildApp` (replace `:16-40`).**
```js
const {
  buildCspDirectives,
  isStrictCspPath,
  serializeCspDirectives,
} = require('../../src/security/cspDirectives');

// The strict-page allowlist is the CALLER's now (core's built-in list is gone),
// so the golden supplies the one page it probes. The demo's franchisor frame
// origins are likewise caller-supplied — this mirrors crhs-corporate/server.js.
const STRICT_PAGES = ['/affiliate-landing-embed.html'];
const DEMO_PATH = '/wavemax/clickjacking-demo.html';
const DEMO_FRAME_SRC = ['https://www.wavemaxlaundry.com', 'https://wavemaxlaundry.com', 'https://rundberglaundry.com'];

function buildApp() {
  const app = express();
  app.use(cspNonceMiddleware);
  app.use(securityHeadersMiddleware());
  app.use((req, res, next) => {
    const directives = buildCspDirectives({
      nonce: res.locals.cspNonce,
      useStrictCSP: isStrictCspPath(req.path, { strictCSPPages: STRICT_PAGES }),
      profile: 'full',
      frameSrcExtra: req.path === DEMO_PATH ? DEMO_FRAME_SRC : []
    });
    res.setHeader('Content-Security-Policy', serializeCspDirectives(directives));
    next();
  });
  app.use((req, res) => res.status(200).send('ok'));
  return app;
}
```

- [ ] **Step 2: Re-capture `EXPECTED_STRICT_CSP` (replace `:50-65`).**
```js
const EXPECTED_STRICT_CSP = (nonce) =>
  `default-src 'self'; ` +
  `script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://code.jquery.com https://www.local-marketing-reports.com https://static.cloudflareinsights.com https://maps.googleapis.com https://connect.facebook.net https://challenges.cloudflare.com https://www.gstatic.com https://www.google.com https://apis.google.com 'nonce-${nonce}'; ` +
  `style-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://fonts.googleapis.com https://stackpath.bootstrapcdn.com 'unsafe-inline'; ` +
  `img-src 'self' data: https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://cdnjs.cloudflare.com https://flagcdn.com https://secure.walibu.com https://upload.wikimedia.org https://*.googleusercontent.com https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://*.gstatic.com https://www.facebook.com; ` +
  `connect-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://stackpath.bootstrapcdn.com https://router.project-osrm.org https://graphhopper.com https://api.openrouteservice.org https://valhalla1.openstreetmap.de https://nominatim.openstreetmap.org https://www.local-marketing-reports.com https://places.googleapis.com https://maps.googleapis.com https://maps.gstatic.com https://connect.facebook.net https://www.facebook.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net; ` +
  `font-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://fonts.gstatic.com; ` +
  `object-src 'none'; ` +
  `media-src 'self'; ` +
  `frame-src 'self' https://www.google.com https://maps.google.com https://my.matterport.com https://challenges.cloudflare.com https://www.recaptcha.net; ` +
  `form-action 'self'; ` +
  `frame-ancestors 'self'; ` +
  `base-uri 'self'; ` +
  `child-src 'none'; ` +
  `worker-src 'self'; ` +
  `manifest-src 'self'`;
```

- [ ] **Step 3: Re-capture the demo pin (replace `:77-78`) — note the added `www.recaptcha.net` (delta 4).**
```js
const EXPECTED_DEMO_FRAME_SRC =
  `frame-src 'self' https://www.wavemaxlaundry.com https://wavemaxlaundry.com https://rundberglaundry.com https://www.google.com https://maps.google.com https://my.matterport.com https://challenges.cloudflare.com https://www.recaptcha.net`;
```

- [ ] **Step 4: Fix the two assertions that named deleted exports/values.** Replace `:160-163`:
```js
  it('the path resolves strict only via the CALLER-supplied allowlist', () => {
    expect(isStrictCspPath('/affiliate-landing-embed.html')).toBe(false);
    expect(isStrictCspPath('/affiliate-landing-embed.html', { strictCSPPages: STRICT_PAGES })).toBe(true);
  });
```
and replace `:202-205`:
```js
  it("frame-ancestors 'self' (the franchisor ancestors are gone)", async () => {
    const csp = (await probe()).headers['content-security-policy'];
    expect(dir(csp, 'frame-ancestors')).toBe("frame-ancestors 'self'");
  });
```

- [ ] **Step 5: Re-capture `cspMonorepoParity.test.js` args + expectation (replace `:20-50`).**
```js
// The exact override the portal passes (wavemax-affiliate-program/server.js).
// Its own five location origins go in img/connect; frame-src carries the portal
// origin plus the Firebase auth-helper iframe the claim page needs.
const PORTAL_ORIGINS = [
  'https://atxwashateria.com',
  'https://atxwashdryfold.com',
  'https://portal.atxwashdryfold.com',
  'https://runberglaundry.com',
  'https://rundberglaundry.com'
];
const MONOREPO_CSP_ARGS = {
  profile: 'full',
  imgSrcExtra: PORTAL_ORIGINS,
  connectSrcExtra: PORTAL_ORIGINS,
  frameSrcExtra: ['https://portal.atxwashdryfold.com', 'https://wavemax-bag-registration.firebaseapp.com'],
  frameAncestors: ['\'self\''],
};

const EXPECTED_MONOREPO_STRICT_CSP = (nonce) =>
  `default-src 'self'; ` +
  `script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://code.jquery.com https://www.local-marketing-reports.com https://static.cloudflareinsights.com https://maps.googleapis.com https://connect.facebook.net https://challenges.cloudflare.com https://www.gstatic.com https://www.google.com https://apis.google.com 'nonce-${nonce}'; ` +
  `style-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://fonts.googleapis.com https://stackpath.bootstrapcdn.com 'unsafe-inline'; ` +
  `img-src 'self' data: https://atxwashateria.com https://atxwashdryfold.com https://portal.atxwashdryfold.com https://runberglaundry.com https://rundberglaundry.com https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://cdnjs.cloudflare.com https://flagcdn.com https://secure.walibu.com https://upload.wikimedia.org https://*.googleusercontent.com https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://*.gstatic.com https://www.facebook.com; ` +
  `connect-src 'self' https://atxwashateria.com https://atxwashdryfold.com https://portal.atxwashdryfold.com https://runberglaundry.com https://rundberglaundry.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://stackpath.bootstrapcdn.com https://router.project-osrm.org https://graphhopper.com https://api.openrouteservice.org https://valhalla1.openstreetmap.de https://nominatim.openstreetmap.org https://www.local-marketing-reports.com https://places.googleapis.com https://maps.googleapis.com https://maps.gstatic.com https://connect.facebook.net https://www.facebook.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net; ` +
  `font-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://fonts.gstatic.com; ` +
  `object-src 'none'; ` +
  `media-src 'self'; ` +
  `frame-src 'self' https://portal.atxwashdryfold.com https://wavemax-bag-registration.firebaseapp.com https://www.google.com https://maps.google.com https://my.matterport.com https://challenges.cloudflare.com https://www.recaptcha.net; ` +
  `form-action 'self'; ` +
  `frame-ancestors 'self'; ` +
  `base-uri 'self'; ` +
  `child-src 'none'; ` +
  `worker-src 'self'; ` +
  `manifest-src 'self'`;
```
Then delete the now-invalid `path:` / `isClickjackingDemo:` keys from the four `buildCspDirectives({...})` calls at `:64-70`, `:75-81`, `:86-88`, `:93-95` (keep `nonce`, `useStrictCSP`, `...MONOREPO_CSP_ARGS`).

- [ ] **Step 6: Run both goldens — expect PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test -- tests/security/cspGolden.test.js tests/security/cspMonorepoParity.test.js
```
Expected: `Tests: 36 passed, 36 total` (32 + 4).

- [ ] **Step 7: Prove the affiliate's token SET is unchanged (the deltas above are order-only for the portal).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && node -e "
const { buildCspDirectives } = require('./src/security/cspDirectives');
const P=['https://atxwashateria.com','https://atxwashdryfold.com','https://portal.atxwashdryfold.com','https://runberglaundry.com','https://rundberglaundry.com'];
const d = buildCspDirectives({ nonce:'N', useStrictCSP:true, profile:'full', imgSrcExtra:P, connectSrcExtra:P, frameSrcExtra:['https://portal.atxwashdryfold.com','https://wavemax-bag-registration.firebaseapp.com'], frameAncestors:[\"'self'\"] });
const old = \"'self' https://portal.atxwashdryfold.com https://www.google.com https://maps.google.com https://my.matterport.com https://challenges.cloudflare.com https://www.recaptcha.net https://wavemax-bag-registration.firebaseapp.com\".split(' ').sort();
console.log('frame-src set equal:', JSON.stringify(d['frame-src'].slice().sort()) === JSON.stringify(old));
"
```
Expected: `frame-src set equal: true` — the portal gains and loses **no** origin; only the position of the Firebase origin moves.

- [ ] **Step 8: Full suite, lint, single commit (implementation from Task 22 + this re-capture).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -8
npx eslint src/security/cspDirectives.js tests/security/cspProfiles.test.js tests/security/cspGolden.test.js tests/security/cspMonorepoParity.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core add src/security/cspDirectives.js tests/security/cspProfiles.test.js tests/security/cspGolden.test.js tests/security/cspMonorepoParity.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core commit -m "$(cat <<'EOF'
feat(csp)!: profile parameter, frameAncestors 'self', host literals out (B3c)

golden(csp): deliberate re-capture (D16a)

BREAKING: buildCspDirectives drops path/isClickjackingDemo/imgSrcSelfOrigins/
connectSrcSelfOrigins and takes { profile, scriptSrcExtra, imgSrcExtra,
connectSrcExtra, frameSrcExtra, frameAncestors }. The builder now carries no app
or host literals: wavemax.promo, the four CRHS location hosts, the Firebase
project origin, the franchisor frame-ancestors default and the demo frame-src
branch all move to the callers. isStrictCspPath's page list defaults to [] and
isFranchiseHostPage is isCleanUrlSlugPage. CSP_PROFILES is a module export only
(the index key count is untouched).

The two golden masters are re-captured under D16a. Authorised deltas ONLY:
(1) img/connect lose the six own-domain host literals; (2) frame-src loses the
Firebase project origin; (3) frame-ancestors is 'self'; (4) the caller-composed
demo frame-src also carries www.recaptcha.net; (5) the strict-page allowlist
moves into the test fixture. Consumer PRs ship in the same release.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core push
```
Expected: full suite green before the commit; `4 files changed`.

---

### Task 24: corporate — CSP call-site consumer PR (co-requisite of Task 22/23)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/server.js:44-58`
- Create: `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/csp.integration.test.js`
- Test: the new file (4 cases) + existing `tests/server.integration.test.js:29-45` (shape assertions — must stay green untouched)

**Interfaces:**
- Consumes: `wc.buildCspDirectives({ nonce, useStrictCSP, profile, frameSrcExtra })`, `wc.isStrictCspPath(path)`, `wc.serializeCspDirectives(directives)` (Tasks 22–23)
- Produces: crhsent.com's live CSP — `profile: 'full'`, caller-supplied demo frame origins, `frame-ancestors 'self'`

- [ ] **Step 1: Write the failing test.**
```bash
cat > /mnt/c/Users/rickh/GitHub/crhs-corporate/tests/csp.integration.test.js <<'EOF'
// web-core v0.2.0 carries no host literals and no clickjacking-demo branch: the
// APP supplies the origins its own pages frame. The educational demo
// (content/wavemax/clickjacking-demo.html:478) iframes the franchisor's site —
// that is the entire point of the page — so it must keep those frame origins.
const request = require('supertest');
const app = require('../server');

const HOST = 'crhsent.com';
const dir = (csp, name) => (csp.split(';').find((d) => d.trim().startsWith(name)) || '').trim();
const cspOf = async (p) => (await request(app).get(p).set('Host', HOST)).headers['content-security-policy'];

describe('crhs-corporate CSP (web-core profiles)', () => {
  it('the clickjacking demo still frames the franchisor origins (app-supplied)', async () => {
    const frameSrc = dir(await cspOf('/wavemax/clickjacking-demo.html'), 'frame-src');
    expect(frameSrc).toContain('https://www.wavemaxlaundry.com');
    expect(frameSrc).toContain('https://wavemaxlaundry.com');
    expect(frameSrc).toContain('https://rundberglaundry.com');
  });

  it('no other page frames the franchisor', async () => {
    expect(dir(await cspOf('/wavemax/'), 'frame-src')).not.toContain('wavemaxlaundry.com');
  });

  it('the retired own-domain host literals are gone from img/connect', async () => {
    const csp = await cspOf('/');
    expect(dir(csp, 'img-src')).not.toContain('https://wavemax.promo');
    expect(dir(csp, 'connect-src')).not.toContain('https://atxwashdryfold.com');
  });

  it("frame-ancestors is 'self' (crhsent is not framed by the franchisor)", async () => {
    expect(dir(await cspOf('/'), 'frame-ancestors')).toBe("frame-ancestors 'self'");
  });
});
EOF
```

- [ ] **Step 2: Install the new core copy, then run — expect RED on case 1 only.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && rm -rf node_modules/@crhs/web-core && npm install --install-links && git checkout -- package-lock.json && npm test -- tests/csp.integration.test.js
```
Expected:
```
  ● crhs-corporate CSP (web-core profiles) › the clickjacking demo still frames the franchisor origins (app-supplied)
    expect(received).toContain("https://www.wavemaxlaundry.com")
```
Cases 2-4 already pass (core deleted the literals in Task 22). Case 1 is the real consumer regression: the stale call site passes `isClickjackingDemo`, which the new builder ignores.

- [ ] **Step 3: Replace `crhs-corporate/server.js:44-58` with the new call site.**
```js
// Manual, nonce-based CSP. isStrictCspPath uses web-core's default predicates
// (documentation pages + clean-URL slug pages), so `/wavemax/` resolves STRICT
// while `/wavemax/styles.css` (has a dot) and `/` stay non-strict.
//
// web-core v0.2.0 carries no host literals: this app supplies the frame origins
// its own pages need. /wavemax/clickjacking-demo.html is the ONLY page that
// frames the franchisor — its whole purpose is demonstrating that the
// franchisor's pages set no X-Frame-Options / frame-ancestors. Keeping those
// origins on that one route leaves every other page's frame-src strict.
const DEMO_PATH = '/wavemax/clickjacking-demo.html';
const DEMO_FRAME_SRC = ['https://www.wavemaxlaundry.com', 'https://wavemaxlaundry.com', 'https://rundberglaundry.com'];
app.use((req, res, next) => {
  const directives = wc.buildCspDirectives({
    nonce: res.locals.cspNonce,
    useStrictCSP: wc.isStrictCspPath(req.path),
    profile: 'full',
    frameSrcExtra: req.path === DEMO_PATH ? DEMO_FRAME_SRC : []
  });
  res.setHeader('Content-Security-Policy', wc.serializeCspDirectives(directives));
  next();
});
```

- [ ] **Step 4: Re-run the new suite — expect PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npm test -- tests/csp.integration.test.js
```
Expected: `Tests: 4 passed, 4 total`.

- [ ] **Step 5: Confirm the pre-existing shape-based CSP assertions still pass untouched.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npm test -- tests/server.integration.test.js
```
Expected: all green — `tests/server.integration.test.js:29-45` asserts nonce present / no `unsafe-inline` in `script-src` / `default-src 'self'` / `style-src` has `unsafe-inline`, none of which the profile change touches. **Do not edit this file.**

- [ ] **Step 6: Full suite, lint, commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npm test 2>&1 | tail -6 && npx eslint server.js tests/csp.integration.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-corporate add server.js tests/csp.integration.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-corporate commit -m "$(cat <<'EOF'
feat(csp): adopt web-core profiles; app supplies the demo frame origins (B3c)

Co-requisite of web-core B3c: the builder no longer carries a clickjacking-demo
branch or host literals, so the demo's franchisor frame-src origins are supplied
here and every other page keeps a strict frame-src. profile: 'full' preserves the
vendor allowlist; frame-ancestors is now 'self'.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git -C /mnt/c/Users/rickh/GitHub/crhs-corporate push
```
Expected before committing: exactly the 4 pre-existing `crhsent-parity` ENOENT failures.

---

### Task 25: affiliate — CSP call-site consumer PR, keeping the Firebase frame origin (B4b) — **DO NOT COMMIT; pairs with Task 26**

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/server.js:240-279`
- Create: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/integration/cspClaimFrameSrc.test.js`
- Test: the new file (3 cases)

**Interfaces:**
- Consumes: `webCore.buildCspDirectives({ nonce, useStrictCSP, profile, imgSrcExtra, connectSrcExtra, frameSrcExtra, frameAncestors })`, `webCore.isStrictCspPath(path, { strictCSPPages })`, `webCore.serializeCspDirectives(directives)` (Tasks 22–23)
- Produces: the portal's live CSP — same origin SET as today; `APP_STRICT_CSP_PAGES` (`server.js:244-262`) is unchanged and still the caller's allowlist

- [ ] **Step 1: Write the failing guard test — this is the regression that would CSP-block `signInWithPhoneNumber`.**
```bash
cat > /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/integration/cspClaimFrameSrc.test.js <<'EOF'
// web-core v0.2.0 carries no project-specific origins, so THIS APP must supply
// the Firebase auth-helper frame origin. Dropping it CSP-blocks the auth helper
// iframe and signInWithPhoneNumber hangs on the claim page (public/assets/js/
// claim.js:888 boots Firebase with the server-provided authDomain).
const request = require('supertest');
const app = require('../../server');

const FIREBASE_AUTH_HELPER = 'https://wavemax-bag-registration.firebaseapp.com';
const PORTAL = 'https://portal.atxwashdryfold.com';
const LOCATION_ORIGINS = [
  'https://atxwashateria.com',
  'https://atxwashdryfold.com',
  PORTAL,
  'https://runberglaundry.com',
  'https://rundberglaundry.com'
];
const dir = (csp, name) => (csp.split(';').find((d) => d.trim().startsWith(name)) || '').trim();
const cspOf = async (p) => (await request(app).get(p)).headers['content-security-policy'];

describe('portal CSP — app-supplied origins survive the web-core profile swap', () => {
  it('frame-src allows the Firebase auth-helper iframe (claim page phone auth)', async () => {
    expect(dir(await cspOf('/embed-app-v2.html'), 'frame-src')).toContain(FIREBASE_AUTH_HELPER);
  });

  it('frame-src allows the portal origin', async () => {
    expect(dir(await cspOf('/embed-app-v2.html'), 'frame-src')).toContain(PORTAL);
  });

  it('img-src and connect-src keep all five location origins', async () => {
    const csp = await cspOf('/embed-app-v2.html');
    for (const origin of LOCATION_ORIGINS) {
      expect(dir(csp, 'img-src')).toContain(origin);
      expect(dir(csp, 'connect-src')).toContain(origin);
    }
  });
});
EOF
```

- [ ] **Step 2: Install the new core copy, then run — expect RED on all three cases.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && rm -rf node_modules/@crhs/web-core && npm install --install-links && git checkout -- package-lock.json && npm test -- tests/integration/cspClaimFrameSrc.test.js
```
Expected: all 3 fail, e.g.
```
  ● portal CSP … › frame-src allows the Firebase auth-helper iframe (claim page phone auth)
    expect(received).toContain("https://wavemax-bag-registration.firebaseapp.com")
    Received: "frame-src 'self' https://www.google.com https://maps.google.com https://my.matterport.com https://challenges.cloudflare.com https://www.recaptcha.net"
```
The stale call site's `imgSrcSelfOrigins` / `connectSrcSelfOrigins` / `imgSrcExtra` values are now ignored or insufficient, so the portal silently lost origins — exactly the failure mode this PR exists to prevent.

- [ ] **Step 3: Replace `server.js:240-243` (the comment) and `:263-279` (the middleware); `APP_STRICT_CSP_PAGES` at `:244-262` stays untouched.**
```js
// web-core v0.2.0 carries no app or host literals: this app supplies its own
// origins. profile 'full' = the shared vendor allowlist. The five location
// origins go in img/connect; frame-src carries the portal origin plus the
// Firebase auth-helper iframe (dropping it CSP-blocks signInWithPhoneNumber on
// the claim page). frame-ancestors is tightened to 'self' — this app is only
// framed by its own pages.
const APP_LOCATION_ORIGINS = [
  'https://atxwashateria.com',
  'https://atxwashdryfold.com',
  'https://portal.atxwashdryfold.com',
  'https://runberglaundry.com',
  'https://rundberglaundry.com'
];
const APP_FRAME_SRC_ORIGINS = [
  'https://portal.atxwashdryfold.com',
  'https://wavemax-bag-registration.firebaseapp.com'
];
```
(placed immediately above `const APP_STRICT_CSP_PAGES = [`), and the middleware becomes:
```js
app.use((req, res, next) => {
  const useStrictCSP = webCore.isStrictCspPath(req.path, { strictCSPPages: APP_STRICT_CSP_PAGES });
  const directives = webCore.buildCspDirectives({
    nonce: res.locals.cspNonce,
    useStrictCSP,
    profile: 'full',
    imgSrcExtra: APP_LOCATION_ORIGINS,
    connectSrcExtra: APP_LOCATION_ORIGINS,
    frameSrcExtra: APP_FRAME_SRC_ORIGINS,
    frameAncestors: ['\'self\'']
  });
  res.setHeader('Content-Security-Policy', webCore.serializeCspDirectives(directives));
  next();
});
```

- [ ] **Step 4: Re-run the guard — expect PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npm test -- tests/integration/cspClaimFrameSrc.test.js
```
Expected: `Tests: 3 passed, 3 total`.

- [ ] **Step 5: Run the golden and record the expected single-directive failure.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npm test -- tests/integration/webCoreConsumptionGolden.test.js
```
Expected: 2 of the 5 cases fail (`strict page (/embed-app-v2.html)` and `non-strict path (/api/health)`), and the diff must show a difference in the `frame-src` directive **only** — `https://wavemax-bag-registration.firebaseapp.com` moved from last position to second. If ANY other directive differs, stop: the call site is wrong, not the golden.

- [ ] **Step 6: Confirm the source-reading tests that mention the strict-page list still pass, and that no cycle appeared.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npm test -- tests/unit/adminIpAuthz.test.js tests/integration/v1PaymentRemoval.test.js && npx madge --circular server/ | tail -3
```
Expected: both suites green (they read `server.js` for `APP_STRICT_CSP_PAGES` entries, which this PR does not touch), and madge reports **no circular dependency** (Global Constraint 23).

- [ ] **Step 7: Do NOT commit yet.** The golden is red by design; Task 26 re-captures it and both land as one commit.

---

### Task 26: affiliate — **AUTHORIZED ONE-TIME GOLDEN RE-CAPTURE (D16a)** — commits Task 25 with it

> **REVIEWER INSTRUCTION — read before approving.** `tests/integration/webCoreConsumptionGolden.test.js` is the byte-for-byte pin on the portal's served security output; it exists precisely so a web-core swap cannot drift it. This commit is the one authorized exception in this repo (D16a). The **only** permitted change is the position of `https://wavemax-bag-registration.firebaseapp.com` inside `frame-src`. No origin may be added or removed in any directive, in either the strict or non-strict string. Step 3 below adds a permanent set-equality assertion that makes this self-policing — if that assertion is missing from the diff, reject the PR. Verify the diff with `git diff -- tests/integration/webCoreConsumptionGolden.test.js` and confirm exactly one `+`/`-` pair on the `frame-src` line plus the new guard block.

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/integration/webCoreConsumptionGolden.test.js:1-14` (header note), `:32` (`frame-src`), `:47-65` (add the set-equality guard)
- Test: that file

**Interfaces:**
- Consumes: the served CSP from `server.js` after Task 25
- Produces: the re-captured golden + a permanent "order-only" guard

- [ ] **Step 1: Re-capture the `frame-src` line — replace `:32`.**
```js
  "frame-src 'self' https://portal.atxwashdryfold.com https://wavemax-bag-registration.firebaseapp.com https://www.google.com https://maps.google.com https://my.matterport.com https://challenges.cloudflare.com https://www.recaptcha.net; " +
```

- [ ] **Step 2: Append the re-capture note to the file header (after `:14`).**
```js
// RE-CAPTURED ONCE, 2026-09-09, under ruling D16a (web-core v0.2.0 / PR B3c):
// the shared builder stopped carrying project-specific origins, so this app now
// supplies the Firebase auth-helper origin itself via frameSrcExtra. The ONLY
// change to the golden was the POSITION of
// https://wavemax-bag-registration.firebaseapp.com within frame-src — no origin
// was gained or lost in any directive. The set-equality guard below enforces
// that permanently. This exception does not repeat: any future diff here is
// drift, and the fix is the parameterisation, never the expectation.
```

- [ ] **Step 3: Add the set-equality guard inside the `describe('CSP header', …)` block (after the existing `:59-64` delta test).**
```js
    // D16a guard: the 2026-09-09 re-capture changed frame-src ORDER ONLY. This
    // is the pre-change token multiset, transcribed from the golden as it stood
    // at commit 43f6dfc8. If a future change adds or removes a frame origin,
    // this fails even though the byte pin above was updated in the same commit.
    const FRAME_SRC_TOKENS_BEFORE = [
      "'self'",
      'https://portal.atxwashdryfold.com',
      'https://www.google.com',
      'https://maps.google.com',
      'https://my.matterport.com',
      'https://challenges.cloudflare.com',
      'https://www.recaptcha.net',
      'https://wavemax-bag-registration.firebaseapp.com'
    ].sort();

    it('frame-src gained and lost NO origin in the D16a re-capture (order only)', async () => {
      const res = await request(app).get('/embed-app-v2.html');
      const frameSrc = (res.headers['content-security-policy'] || '')
        .split(';')
        .find((d) => d.trim().startsWith('frame-src'))
        .trim();
      expect(frameSrc.split(' ').slice(1).sort()).toEqual(FRAME_SRC_TOKENS_BEFORE);
    });
```

- [ ] **Step 4: Run the golden — expect PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npm test -- tests/integration/webCoreConsumptionGolden.test.js
```
Expected: `Tests: 6 passed, 6 total` (5 existing + the new guard).

- [ ] **Step 5: Confirm the diff is exactly what the reviewer instruction allows.**
```bash
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program diff -- tests/integration/webCoreConsumptionGolden.test.js | grep -E '^[+-]' | grep -v '^[+-][+-]' | grep -c 'frame-src'
```
Expected: `2` (one removed line, one added line). Any other changed expectation line means the implementation drifted — go back to Task 25 Step 3.

- [ ] **Step 6: Run the full affiliate suite.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npm test 2>&1 | tail -12
```
Expected: green. Per the 2026-06-20 lesson, if a suite fails, **re-run that suite alone** before debugging — several suites are order-flaky and pass in isolation.

- [ ] **Step 7: Commit (Task 25's implementation + this re-capture as one commit).**
```bash
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program add server.js tests/integration/cspClaimFrameSrc.test.js tests/integration/webCoreConsumptionGolden.test.js
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program commit -m "$(cat <<'EOF'
golden(csp): deliberate re-capture (D16a)

Co-requisite of web-core B3c. The shared builder no longer carries app or host
literals, so this app supplies its five location origins (img/connect), the
portal origin and the Firebase auth-helper frame origin, and tightens
frame-ancestors to 'self'. Dropping the Firebase origin would CSP-block the auth
helper iframe and hang signInWithPhoneNumber on the claim page — a new
integration guard pins it.

The golden's ONLY change is the position of the Firebase origin within
frame-src; a set-equality assertion now proves no origin was gained or lost.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program push
```
Expected: `3 files changed`.

---
> **Group preamble for Tasks 27–31 and 56 (B3d, session).** Three decisions bind every one of them.
>
> **Decision 1 — no callable-object back-compat shim. Corporate is updated in the SAME release.** `buildSessionMiddleware` today returns the express-session middleware itself (`crhs-web-core/src/config/sessionStore.js:94-121`) and has exactly **one** call site in the whole world: `crhs-corporate/server.js:65-69`. The affiliate never calls it (`git grep buildSessionMiddleware` in the affiliate → 0 hits; its session block is still inline at `server.js:374-481`). A "callable object" (a function with `.store` bolted on) was rejected because: (a) it would freeze two supported shapes into the API forever; (b) `app.use(builderResult)` would mount **only** express-session and silently drop the composed maxAge fixer — a silent behaviour regression, worse than a loud boot failure; (c) the co-requisite consumer change is 4 lines in one file. So Tasks 27–28 make the breaking change and **Task 29 must be merged in the same release**. Between Task 27 and Task 29 the corporate suite is red by construction — that is the co-requisite proof, not a defect.
>
> **Decision 2 — Plan 1 changes NO live cookie and NO live collection.** D14b (core default base `wavemax.sid` → `app.sid`) ships in Task 30, but corporate pins `cookieName: process.env.SESSION_COOKIE_NAME || 'wavemax.sid'` in Task 29 *first*, so the live `__Host-wavemax.sid` cookie on crhsent.com is byte-identical after the deploy and **zero gated sessions drop**. Corporate also keeps the default `collectionName: 'sessions'`; the switch to `SESSION_COOKIE_NAME=crhsent.sid` + `collectionName: 'sessions_corporate'` is a **recorded deviation from spec §7.5 B4a / §7.6.1** and is scheduled with the Plan 2 Phase-0a deploy (D14b/Q-18), where a one-time session drop is already accepted. The `collectionName` **option** ships and is tested now because Plan 2 depends on it existing.
>
> **Decision 3 — the affiliate does NOT adopt the session builder in Plan 1.** Affiliate `server.js:374-481` (inline `MongoStore.create`, `app.use(session({…}))`, and the post-session maxAge fixer at `:457-481`) stays exactly as it is. Adoption — `const { middleware, store } = wc.buildSessionMiddleware({ cookieName: 'portal.sid' })`, deleting `:374-481`, and re-attaching `installOracleDiagnostics` to `store.clientP` in place of `server.js:129-132`'s `sessionStore.clientP` — is **Plan 4**. Tasks 27–31 only *build and prove* the store handle Plan 4 needs; Task 31 asserts the affiliate still has zero references so nobody adopts early.

### Task 27: web-core — `buildSessionMiddleware` returns `{ middleware, store, cookieName, sessionMaxAge }` + `collectionName` / `autoRemoveInterval` (B3d)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/config/sessionStore.js:40-56` (JSDoc + destructure), `:64-85` (`MongoStore.create` options), `:94-124` (return shape + exports)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/config/sessionStore.test.js` (rewrite the 5 call sites at `:27`, `:39`, `:50`, `:59`, `:116`; add a `store handle (D18a)` describe — 6 new cases)

**Interfaces:**
- Consumes: `connect-mongo@5.1.0` `MongoStore.create({ collectionName, autoRemoveInterval, … })`, `store.options.collectionName`, `store.clientP: Promise<MongoClient>`, `store.close(): Promise<void>` (verified in `node_modules/connect-mongo/build/main/lib/MongoStore.js:79,126-127,139,409-411`; the `autoRemove:'interval'` timer is `unref()`-ed at `:163`, so no jest open handle).
- Produces: `buildSessionMiddleware(opts) => { middleware: RequestHandler, store: MongoStore|undefined, cookieName: string, sessionMaxAge: number }`; new opts `collectionName='sessions'`, `autoRemoveInterval=2`. Unchanged: `DEFAULT_TTL_SECONDS = 600`, `resolveSessionCookieName(opts)`. Consumed by Tasks 28, 29, 30.
- Note: `src/index.js:62` (`def('buildSessionMiddleware', …)`) is **not** touched — the key count stays 28 in this task, so `tests/index.smoke.test.js` needs no edit here.

- [ ] **Step 0: Record this task's web-core suite baseline (Global Constraint 24).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -5
```
Expected: `0 failed`. Record `Tests: <N> passed` as `<BASE>`.

- [ ] **Step 1: Rewrite the 5 existing call sites in the test to destructure `{ middleware }` (RED).**
Apply these exact edits to `tests/config/sessionStore.test.js`:
```js
// :26-30  →
  it('returns { middleware } as an Express middleware function (arity 3)', () => {
    const { middleware } = buildSessionMiddleware({ mongoUrl, secret: 'test-secret' });
    expect(typeof middleware).toBe('function');
    expect(middleware.length).toBe(3);
  });

// :39   app.use(buildSessionMiddleware({ mongoUrl, secret: 'test-secret' }));                      →
    app.use(buildSessionMiddleware({ mongoUrl, secret: 'test-secret' }).middleware);
// :50   app.use(buildSessionMiddleware({ mongoUrl, secret: 'test-secret', ttlSeconds: 120 }));     →
    app.use(buildSessionMiddleware({ mongoUrl, secret: 'test-secret', ttlSeconds: 120 }).middleware);
// :59   app.use(buildSessionMiddleware({ mongoUrl, secret: 'test-secret' }));                      →
    app.use(buildSessionMiddleware({ mongoUrl, secret: 'test-secret' }).middleware);
// :116  app.use(buildSessionMiddleware({ mongoUrl, secret: 'test-secret', cookieName: 'portal.sid' })); →
    app.use(buildSessionMiddleware({ mongoUrl, secret: 'test-secret', cookieName: 'portal.sid' }).middleware);
```

- [ ] **Step 2: Add the `store handle (D18a)` describe block to the test file (still RED).**
Add `const MongoStore = require('connect-mongo');` immediately after the `supertest` require (`:7`), then append this describe inside the outer `describe('buildSessionMiddleware', …)`, after the `:114-123` test:
```js
  // D18a — the store handle is the documented reason the affiliate's session block
  // stayed inline (tasks/todo.md:32): installOracleDiagnostics must attach to
  // connect-mongo's own MongoClient (affiliate server.js:129-132 → sessionStore.clientP).
  describe('store handle (D18a)', () => {
    const SAVED_NODE_ENV = process.env.NODE_ENV;
    let openStores = [];
    afterEach(async () => {
      process.env.NODE_ENV = SAVED_NODE_ENV;
      for (const s of openStores) await s.close();
      openStores = [];
    });

    it('returns store === undefined under NODE_ENV=test (MemoryStore path)', () => {
      const { store } = buildSessionMiddleware({ mongoUrl, secret: 'test-secret' });
      expect(store).toBeUndefined();
    });

    it('returns the connect-mongo store outside test, exposing clientP', async () => {
      process.env.NODE_ENV = 'development';
      const { store } = buildSessionMiddleware({ mongoUrl, secret: 'test-secret' });
      openStores.push(store);
      expect(store).toBeInstanceOf(MongoStore);
      expect(typeof store.clientP.then).toBe('function');
      await store.clientP; // the diagnostics seam resolves to a live MongoClient
    });

    it('defaults the connect-mongo collection to "sessions"', async () => {
      process.env.NODE_ENV = 'development';
      const { store } = buildSessionMiddleware({ mongoUrl, secret: 'test-secret' });
      openStores.push(store);
      expect(store.options.collectionName).toBe('sessions');
    });

    it('honors an explicit collectionName (corporate ships "sessions_corporate" in Plan 2)', async () => {
      process.env.NODE_ENV = 'development';
      const { store } = buildSessionMiddleware({
        mongoUrl, secret: 'test-secret', collectionName: 'sessions_corporate'
      });
      openStores.push(store);
      expect(store.options.collectionName).toBe('sessions_corporate');
    });

    it('keeps autoRemove:"interval" with a 2-minute default sweep (ADB runs no TTL sweep)', async () => {
      process.env.NODE_ENV = 'development';
      const { store } = buildSessionMiddleware({ mongoUrl, secret: 'test-secret' });
      openStores.push(store);
      expect(store.options.autoRemove).toBe('interval');
      expect(store.options.autoRemoveInterval).toBe(2);
    });

    it('returns the resolved cookieName and sessionMaxAge alongside', () => {
      const r = buildSessionMiddleware({
        mongoUrl, secret: 'test-secret', ttlSeconds: 120, cookieName: 'portal.sid'
      });
      expect(r.cookieName).toBe('portal.sid');
      expect(r.sessionMaxAge).toBe(120000);
    });
  });
```

- [ ] **Step 3: Run the test and confirm it fails for the right reason.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/config/sessionStore.test.js 2>&1 | tail -40
```
Expected RED: `returns { middleware } as an Express middleware function (arity 3)` → `Expected: "function" / Received: "undefined"` (destructuring `.middleware` off a function yields `undefined`); the three `app.use(… .middleware)` tests → `TypeError: app.use() requires a middleware function`; every `store handle (D18a)` test → `Cannot destructure property 'store' of ... as it is undefined` / `expect(received).toBeUndefined()` receiving the middleware function. Do **not** proceed until all of those are the failures shown.

- [ ] **Step 4: Implement — parameterise the store options in `src/config/sessionStore.js`.**
Replace the destructure at `:51-56`:
```js
  const {
    mongoUrl = process.env.MONGODB_URI,
    secret,
    ttlSeconds = DEFAULT_TTL_SECONDS,
    cookieName,
    collectionName = 'sessions',
    autoRemoveInterval = 2
  } = opts;
```
and inside `MongoStore.create({ … })` add `collectionName,` immediately after `mongoUrl,` (`:65`), and replace the literal at `:84`:
```js
      mongoUrl,
      collectionName, // per-app collection (Plan 2 gives corporate 'sessions_corporate')
```
```js
      autoRemove: 'interval',
      autoRemoveInterval // minutes — purge expired sessions fast (ADB runs no TTL sweep, so this deleteMany is the only cleanup)
```

- [ ] **Step 5: Implement — return the object instead of the bare middleware.**
Change `:94` `return session({` to `const sessionMiddleware = session({`, leave `:95-120` untouched (verbatim express-session config), and replace the closing `});` at `:121` + `}` at `:122` with:
```js
  });

  return {
    middleware: sessionMiddleware,
    store: sessionStore,
    cookieName: sessionCookieName,
    sessionMaxAge
  };
}
```

- [ ] **Step 6: Update the JSDoc at `:40-49` to the new contract.**
```js
/**
 * Build the configured express-session middleware plus its store handle.
 * @param {object} [opts]
 * @param {string} [opts.mongoUrl=process.env.MONGODB_URI] connect-mongo store URL.
 * @param {string} [opts.secret] session secret (defaults to the SESSION_SECRET/JWT_SECRET chain).
 * @param {number} [opts.ttlSeconds=600] inactivity TTL in seconds → cookie maxAge (ms).
 * @param {string} [opts.cookieName] base session cookie name (__Host- prefixed in
 *   production). Falls back to SESSION_COOKIE_NAME env, then DEFAULT_COOKIE_BASE.
 * @param {string} [opts.collectionName='sessions'] connect-mongo collection.
 * @param {number} [opts.autoRemoveInterval=2] minutes between expired-session sweeps.
 * @returns {{middleware: import('express').RequestHandler, store: (object|undefined),
 *   cookieName: string, sessionMaxAge: number}} `store` is the connect-mongo store
 *   (undefined under NODE_ENV=test); consumers reach `store.clientP` to attach
 *   installOracleDiagnostics to connect-mongo's own MongoClient.
 */
```

- [ ] **Step 7: Run the suite and confirm GREEN.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/config/sessionStore.test.js 2>&1 | tail -20
```
Expected: `Tests: 18 passed, 18 total` (12 existing + 6 new), `Test Suites: 1 passed`.

- [ ] **Step 8: Run the full web-core suite (nothing else may regress).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -15
```
Expected: `Tests: <BASE>+6 passed`, `0 failed`. If `tests/index.smoke.test.js` fails, stop — this task must not change the export surface.

- [ ] **Step 9: Commit.**
```bash
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core add src/config/sessionStore.js tests/config/sessionStore.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core commit -m "$(cat <<'EOF'
feat(session): return { middleware, store, cookieName, sessionMaxAge } + collectionName (B3d, D18a)

buildSessionMiddleware returned only the middleware, so a consumer could not reach
connect-mongo's own MongoClient (store.clientP) to attach installOracleDiagnostics —
the documented reason the affiliate's session block is still inline (server.js:374-481).
Adds collectionName (default 'sessions') and autoRemoveInterval (default 2) options.

BREAKING: the return value is now an object. Co-requisite consumer PR (crhs-corporate
server.js:65-69) ships in the same v0.2.0 release; the affiliate does not consume this
API at all in Plan 1.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 28: web-core — compose the post-session maxAge fixer into `middleware`, exported as `_maxAgeFixer` (B3d)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/config/sessionStore.js` (new `_maxAgeFixer` + `composeMiddleware` above `buildSessionMiddleware`; compose at the return site; extend `module.exports`)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/config/sessionStore.test.js` (new `_maxAgeFixer` describe — 6 cases + 1 composition case)

**Interfaces:**
- Consumes: Task 27's return object. Source of truth for the moved code is affiliate `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/server.js:456-481` (the `app.use((req,res,next) => { … })` block immediately after `app.use(session({…}))`).
- Produces: `_maxAgeFixer(sessionMaxAge: number) => (req, res, next) => void`; `buildSessionMiddleware(...).middleware` is now express-session **followed by** the fixer, still arity 3. Consumed by Plan 4's affiliate adoption.
- Deliberate delta from the affiliate original: the unused local `const originalExpires = req.session.cookie._expires;` (affiliate `server.js:461`) is dropped — it is never read and would fail web-core's ESLint `no-unused-vars`. Everything else is verbatim.

- [ ] **Step 1: Write the failing unit tests for `_maxAgeFixer` (RED).**
Add `_maxAgeFixer` to the destructured require at `tests/config/sessionStore.test.js:9-13`, then append this describe inside the outer describe:
```js
  // Moved verbatim from the affiliate's post-session middleware (server.js:457-481):
  // express-session can hand back a cookie whose maxAge deserialized to NaN/negative
  // (observed with the ADB session store); an invalid maxAge makes res.cookie throw
  // and 500s the request. The fixer normalises it back to the configured TTL.
  describe('_maxAgeFixer (moved from affiliate server.js:457-481)', () => {
    const run = (session) => {
      const req = { session };
      let called = false;
      _maxAgeFixer(600000)(req, {}, () => { called = true; });
      return { req, called };
    };

    it('is a 3-arity middleware factory', () => {
      expect(typeof _maxAgeFixer(600000)).toBe('function');
      expect(_maxAgeFixer(600000).length).toBe(3);
    });

    it('repairs a NaN maxAge to the configured value with a Date expires', () => {
      const { req, called } = run({ cookie: { maxAge: NaN, path: '/' } });
      expect(req.session.cookie.maxAge).toBe(600000);
      expect(req.session.cookie.originalMaxAge).toBe(600000);
      expect(req.session.cookie.expires instanceof Date).toBe(true);
      expect(req.session.cookie._expires instanceof Date).toBe(true);
      expect(req.session.cookie.path).toBe('/'); // other cookie props preserved
      expect(called).toBe(true);
    });

    it('repairs a negative maxAge', () => {
      const { req } = run({ cookie: { maxAge: -1 } });
      expect(req.session.cookie.maxAge).toBe(600000);
    });

    it('repairs a non-numeric maxAge', () => {
      const { req } = run({ cookie: { maxAge: 'nope' } });
      expect(req.session.cookie.maxAge).toBe(600000);
    });

    it('leaves a valid maxAge untouched', () => {
      const { req } = run({ cookie: { maxAge: 12345, originalMaxAge: 12345 } });
      expect(req.session.cookie.maxAge).toBe(12345);
      expect(req.session.cookie.originalMaxAge).toBe(12345);
    });

    it('is a no-op (and still calls next) when there is no session', () => {
      const { req, called } = run(undefined);
      expect(req.session).toBeUndefined();
      expect(called).toBe(true);
    });
  });

  it('composes the fixer after express-session without clobbering a valid cookie', async () => {
    const app = express();
    app.use(buildSessionMiddleware({ mongoUrl, secret: 'test-secret', ttlSeconds: 300 }).middleware);
    app.get('/', (req, res) => res.json({
      originalMaxAge: req.session.cookie.originalMaxAge,
      maxAgeType: typeof req.session.cookie.maxAge
    }));

    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.originalMaxAge).toBe(300000);
    expect(res.body.maxAgeType).toBe('number');
  });
```

- [ ] **Step 2: Run and confirm the expected failure.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/config/sessionStore.test.js -t "_maxAgeFixer" 2>&1 | tail -25
```
Expected RED: `TypeError: _maxAgeFixer is not a function` on every test in the new describe (the symbol is not exported yet).

- [ ] **Step 3: Implement `_maxAgeFixer` + `composeMiddleware` in `src/config/sessionStore.js`.**
Insert immediately above `function buildSessionMiddleware` (after the `resolveSessionCookieName` block ending at `:38`):
```js
/**
 * Post-session middleware that guarantees a valid numeric cookie maxAge.
 * Moved verbatim from the affiliate's server.js:457-481 — express-session can
 * hand back a cookie whose maxAge deserialized to NaN/negative from the store,
 * and an invalid maxAge makes res.cookie() throw (500s the request).
 * @param {number} sessionMaxAge ms to restore when the cookie's maxAge is invalid.
 * @returns {import('express').RequestHandler}
 */
function _maxAgeFixer(sessionMaxAge) {
  return function maxAgeFixer(req, res, next) {
    if (req.session && req.session.cookie) {
      const originalMaxAge = req.session.cookie.maxAge;

      // Always ensure maxAge is a valid number
      if (typeof originalMaxAge !== 'number' || isNaN(originalMaxAge) || originalMaxAge < 0) {
        // Create a new cookie object to avoid prototype issues
        req.session.cookie = {
          ...req.session.cookie,
          maxAge: sessionMaxAge,
          originalMaxAge: sessionMaxAge,
          expires: new Date(Date.now() + sessionMaxAge),
          _expires: new Date(Date.now() + sessionMaxAge)
        };
      }

      // Double-check the maxAge is still valid
      if (typeof req.session.cookie.maxAge !== 'number') {
        req.session.cookie.maxAge = sessionMaxAge;
      }
    }
    next();
  };
}

/**
 * Run `first` then `second` as a single 3-arity middleware (no express.Router —
 * express is a devDependency here, never a runtime one).
 */
function composeMiddleware(first, second) {
  return function sessionWithMaxAgeFixer(req, res, next) {
    first(req, res, (err) => {
      if (err) return next(err);
      second(req, res, next);
    });
  };
}
```

- [ ] **Step 4: Compose it into the returned `middleware` and export it.**
In `buildSessionMiddleware`, change the return block written in Task 27 Step 5 to:
```js
  return {
    middleware: composeMiddleware(sessionMiddleware, _maxAgeFixer(sessionMaxAge)),
    store: sessionStore,
    cookieName: sessionCookieName,
    sessionMaxAge
  };
```
and replace the export line (`:124` pre-change):
```js
module.exports = { buildSessionMiddleware, DEFAULT_TTL_SECONDS, resolveSessionCookieName, _maxAgeFixer };
```

- [ ] **Step 5: Run the suite and confirm GREEN.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/config/sessionStore.test.js 2>&1 | tail -20
```
Expected: `Tests: 25 passed, 25 total` (18 from Task 27 + 6 `_maxAgeFixer` + 1 composition test). Confirm the `arity 3` test still passes — `composeMiddleware` returns a `(req, res, next)` function, so `middleware.length === 3`.

- [ ] **Step 6: Lint (the dropped `originalExpires` would have failed here).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx eslint src/config/sessionStore.js tests/config/sessionStore.test.js
```
Expected: no output (exit 0).

- [ ] **Step 7: Full suite, then commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -8
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core add src/config/sessionStore.js tests/config/sessionStore.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core commit -m "$(cat <<'EOF'
feat(session): carry the post-session maxAge fixer inside middleware (B3d, D18a)

Moves the affiliate's server.js:457-481 guard into core, parameterised by
sessionMaxAge and composed after express-session, so Plan 4's affiliate adoption
loses nothing when that block is deleted. Exported as _maxAgeFixer for unit test.
The unused `originalExpires` local from the original is dropped (never read).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected before committing: `Tests: <the Task 27 total>+7 passed`, `0 failed`.

---

### Task 29: corporate — CO-REQUISITE: adopt `{ middleware }`, pin the live cookie base, keep the live collection

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/server.js:60-69` (the `wc.buildSessionMiddleware` mount)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/server.integration.test.js` (new `session middleware (web-core v0.2.0)` describe — 2 cases)

**Interfaces:**
- Consumes: `buildSessionMiddleware(opts) => { middleware, store, cookieName, sessionMaxAge }` (Tasks 27–28).
- Produces: no new export. Behaviour contract for Plan 1: corporate's emitted session cookie base stays **`wavemax.sid`** (`__Host-wavemax.sid` in prod) and its store collection stays **`sessions`** — byte-identical to today.
- **Ordering:** must be merged in the same release as Task 27, before Task 30 (which changes the core default base). Task 10 (gate G2) touches the same region of the same file — whichever lands second rebases on the first, and **the session mount must stay BELOW `/health`** either way.

- [ ] **Step 1: Refresh corporate's copy of web-core so it sees the v0.2.0 API (RED trigger).**
`.npmrc` has `install-links=true`, so `node_modules/@crhs/web-core` is a real copy, not a symlink — it must be re-installed to pick up Tasks 27–28.
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && rm -rf node_modules/@crhs/web-core && npm install --install-links && git checkout -- package-lock.json
grep -c "composeMiddleware" node_modules/@crhs/web-core/src/config/sessionStore.js
```
Expected: `2` (the function and its call site). If the grep prints `0`, the copy did not refresh — repeat before continuing.

- [ ] **Step 2: Run the corporate suite and record the co-requisite failure.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npm test 2>&1 | tail -25
```
Expected RED: every suite that `require('../server')` (`server.integration.test.js`, `crhsent-parity.test.js`, `crhsentHandler.test.js`, `content-manifest.test.js`) fails at import with `TypeError: app.use() requires a middleware function` thrown from `server.js:65`. This is exactly boot-breaker #3 from the Execution Order, caught locally instead of on a box.

- [ ] **Step 3: Write the failing behaviour test (still RED).**
Append to `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/server.integration.test.js`, inside the outer `describe('crhs-corporate — composed app (server.js)', …)`:
```js
  // web-core v0.2.0: buildSessionMiddleware returns { middleware, store, … } (D18a).
  // Plan 1 is a NO-behaviour-change release for corporate: the cookie base stays
  // 'wavemax.sid' and the collection stays 'sessions'. Both flip in Plan 2 (Phase 0a,
  // SESSION_COOKIE_NAME=crhsent.sid + collectionName 'sessions_corporate', D14b/P5).
  describe('session middleware (web-core v0.2.0 { middleware, store })', () => {
    const wc = require('@crhs/web-core');

    it('the builder returns an object with a 3-arity middleware (not a bare function)', () => {
      const built = wc.buildSessionMiddleware({ secret: 'test-secret', ttlSeconds: 600 });
      expect(typeof built).toBe('object');
      expect(typeof built.middleware).toBe('function');
      expect(built.middleware.length).toBe(3);
      expect(built.store).toBeUndefined();      // MemoryStore under NODE_ENV=test
      expect(built.sessionMaxAge).toBe(600000);
    });

    it('still emits the live cookie base "wavemax.sid" (no session drop in Plan 1)', async () => {
      const res = await request(app).get('/').set('Host', HOST);
      const setCookie = (res.headers['set-cookie'] || []).join(';');
      expect(setCookie).toContain('wavemax.sid');
      expect(setCookie).not.toContain('app.sid');
    });
  });
```

- [ ] **Step 4: Run just that file and confirm it fails at import, not at the assertion.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/server.integration.test.js 2>&1 | head -25
```
Expected RED: `TypeError: app.use() requires a middleware function` at `server.js:65`, reported as a suite-level failure (`Test suite failed to run`).

- [ ] **Step 5: Implement the consumer change at `server.js:65-69`.**
Replace:
```js
app.use(wc.buildSessionMiddleware({
  mongoUrl: process.env.MONGODB_URI,
  secret: process.env.SESSION_SECRET,
  ttlSeconds: 600
}));
```
with:
```js
// web-core v0.2.0 returns { middleware, store, cookieName, sessionMaxAge } (D18a).
// `store` is deliberately NOT destructured — it is unused here (only the affiliate
// attaches Oracle cursor diagnostics to store.clientP) and an unused binding fails
// `npx eslint server.js`. cookieName is pinned to the LIVE base so the v0.2.0 deploy
// drops no gated crhsent.com session — web-core's own default becomes the
// brand-neutral 'app.sid' in this same release. Phase 0a (Plan 2) sets
// SESSION_COOKIE_NAME=crhsent.sid, which this expression already honours, and adds
// collectionName:'sessions_corporate'.
const { middleware: sessionMiddleware } = wc.buildSessionMiddleware({
  mongoUrl: process.env.MONGODB_URI,
  secret: process.env.SESSION_SECRET,
  ttlSeconds: 600,
  cookieName: process.env.SESSION_COOKIE_NAME || 'wavemax.sid'
});
app.use(sessionMiddleware);
```

- [ ] **Step 6: Run the corporate suite and confirm GREEN, and that `/health` is still above the session mount.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && grep -n "app.get('/health'" server.js && grep -n "app.use(sessionMiddleware)" server.js && npm test 2>&1 | tail -12
```
Expected: the `/health` line number is strictly less than the `app.use(sessionMiddleware)` line number (gate G2 preserved), and the suite shows exactly the 4 pre-existing `crhsent-parity` ENOENT failures plus 2 more passing than before.

- [ ] **Step 7: Lint and commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx eslint server.js tests/server.integration.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-corporate add server.js tests/server.integration.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-corporate commit -m "$(cat <<'EOF'
fix(session): consume web-core v0.2.0 { middleware, store } and pin the live cookie base

Co-requisite of the web-core B3d session PR: app.use(builderResult) would throw
"app.use() requires a middleware function" at boot on :3001. Pins cookieName to
SESSION_COOKIE_NAME || 'wavemax.sid' so the v0.2.0 deploy drops no live
__Host-wavemax.sid session when core's default base becomes 'app.sid';
collectionName stays at the default 'sessions'. Both flip in Phase 0a (D14b/P5).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 30: web-core — brand-neutral `DEFAULT_COOKIE_BASE = 'app.sid'` (B3d / D14b, core half)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/config/sessionStore.js` — **all five `wavemax` references**: `:17` (comment), `:22` (constant), `:28` (doc comment), `:46` (JSDoc `@param`, as rewritten by Task 27 Step 6), `:91` (inline comment) — plus the export list
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/config/sessionStore.test.js:64,82-85,102-106,122` + one new brand-literal test

**Interfaces:**
- Consumes: Task 29's corporate pin (`cookieName: process.env.SESSION_COOKIE_NAME || 'wavemax.sid'`) — this task is only safe **after** it is merged.
- Produces: `DEFAULT_COOKIE_BASE = 'app.sid'` (newly exported); `resolveSessionCookieName()` with no override → `'app.sid'` (dev) / `'__Host-app.sid'` (prod).
- Note: the repo-wide `tests/brandNeutral.test.js` grep from spec §7.2.2 is **deferred with B3g/B3k** (Global Constraint 16) — this task ships the file-scoped substitute instead.

- [ ] **Step 1: Update the four cookie-name expectations + add the brand-literal test (RED).**
In `tests/config/sessionStore.test.js`:
```js
// :9-13 require list — add DEFAULT_COOKIE_BASE:
const {
  buildSessionMiddleware,
  DEFAULT_TTL_SECONDS,
  DEFAULT_COOKIE_BASE,
  resolveSessionCookieName,
  _maxAgeFixer
} = require('../../src/config/sessionStore');

// :64   expect(setCookie).toContain('wavemax.sid'); // dev cookie name (non-prod)   →
    expect(setCookie).toContain('app.sid');  // brand-neutral dev default (D14b)

// :82-85 →
    it('defaults to the brand-neutral base "app.sid" (dev/test, no override)', () => {
      delete process.env.SESSION_COOKIE_NAME;
      expect(resolveSessionCookieName()).toBe('app.sid');
      expect(DEFAULT_COOKIE_BASE).toBe('app.sid');
    });

// :102-106 →
    it('production default is __Host-app.sid', () => {
      delete process.env.SESSION_COOKIE_NAME;
      process.env.NODE_ENV = 'production';
      expect(resolveSessionCookieName()).toBe('__Host-app.sid');
    });

// :122   expect(setCookie).not.toContain('wavemax.sid');   →
    expect(setCookie).not.toContain('app.sid');
```
and append, inside the outer describe:
```js
  it('carries no brand literal (D14b — web-core is white-label)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../../src/config/sessionStore'), 'utf8');
    expect(src).not.toMatch(/wavemax/i);
    expect(src).not.toMatch(/rundberglaundry|runberglaundry|atxwash/i);
  });
```

- [ ] **Step 2: Run and confirm the expected failure.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/config/sessionStore.test.js 2>&1 | tail -30
```
Expected RED: `defaults to the brand-neutral base "app.sid"` → `Expected: "app.sid" / Received: "wavemax.sid"`; `production default is __Host-app.sid` → received `"__Host-wavemax.sid"`; the Set-Cookie test → `Expected substring: "app.sid"`; the brand-literal test → matched `/wavemax/i`.

- [ ] **Step 3: Implement — replace the constant and its comment at `:17-22`.**
```js
// Brand-neutral default session cookie base (D14b). Per-app overrides come via
// opts.cookieName or SESSION_COOKIE_NAME: the portal uses 'portal.sid', the
// content app 'crhsent.sid'. Changing an app's base drops its live sessions once,
// so a consumer that must preserve them pins its current base explicitly.
const DEFAULT_COOKIE_BASE = 'app.sid';
```

- [ ] **Step 4: De-brand the three remaining doc references — the grep in Step 5 covers the whole file, not just the constant.** Edit:
- `:28` → ` * DEFAULT_COOKIE_BASE. In production the __Host- prefix is applied (enforces Secure +`
- `:46` (the `@param {string} [opts.cookieName]` line rewritten by Task 27 Step 6) → ` * @param {string} [opts.cookieName] base session cookie name (__Host- prefixed in`
- `:91` → `  // (opts.cookieName / SESSION_COOKIE_NAME), defaulting to DEFAULT_COOKIE_BASE.`

Then export the constant — replace the `module.exports` line:
```js
module.exports = { buildSessionMiddleware, DEFAULT_TTL_SECONDS, DEFAULT_COOKIE_BASE, resolveSessionCookieName, _maxAgeFixer };
```

- [ ] **Step 5: Confirm no `wavemax` literal survives anywhere in the file.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && grep -ni "wavemax" src/config/sessionStore.js; echo "exit=$?"
```
Expected: no matches, `exit=1`. (There were **five** matches before this task — `:17`, `:22`, `:28`, `:46`, `:91` — so a single-line edit is not enough.)

- [ ] **Step 6: Run the file, then the full suite — GREEN.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/config/sessionStore.test.js 2>&1 | tail -8
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -8
```
Expected: `Tests: 26 passed` for the file (25 + the brand-literal test), and the full suite at `<the Task 28 total>+1 passed`, `0 failed`.

- [ ] **Step 7: Prove no consumer is exposed to the default change.**
```bash
git -C /mnt/c/Users/rickh/GitHub/crhs-corporate grep -n "buildSessionMiddleware" -- server.js server tests
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program grep -n "buildSessionMiddleware" -- server.js server tests | wc -l
```
Expected: corporate shows exactly the pinned call in `server.js` (plus Task 29's test shape assertion, which passes `secret`/`ttlSeconds` only and asserts nothing about the cookie name); affiliate prints `0`.

- [ ] **Step 8: Commit.**
```bash
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core add src/config/sessionStore.js tests/config/sessionStore.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core commit -m "$(cat <<'EOF'
refactor(session): brand-neutral DEFAULT_COOKIE_BASE 'app.sid' (B3d, D14b)

web-core is white-label; 'wavemax.sid' was the last brand literal in sessionStore
(five references: the constant, its comment, two doc comments and one inline note).
The only consumer of the default (crhs-corporate) pins its live base explicitly in
the same release, so no live session is dropped. DEFAULT_COOKIE_BASE is now exported.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core push
```

---

### Task 31: cross-repo release verification for the session slice (local, no deploy)

**Files:**
- Create: none. Modify: none.
- Test: runs the web-core suite (full), the corporate suite (full), and the affiliate's web-core golden + domain-migration suites.

**Interfaces:**
- Consumes: Tasks 27–30 merged.
- Produces: the evidence line Task 55 needs before the single v0.2.0 deploy: "web-core + corporate green on a copy install; affiliate untouched by the session slice."

- [ ] **Step 1: Web-core full suite.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -8
```
Expected: `0 failed`.

- [ ] **Step 2: Re-copy web-core into corporate exactly the way a box does, then run corporate.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && rm -rf node_modules/@crhs/web-core && npm install --install-links && git checkout -- package-lock.json && npm test 2>&1 | tail -12
```
Expected: exactly the 4 pre-existing `tests/crhsent-parity.test.js` ENOENT failures and no others. If `npm install` rewrote `package-lock.json`, the `git checkout --` reverts it — Task 7 owns the lock.

- [ ] **Step 3: Prove the corporate copy is a real directory (not a symlink) and carries the new API.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && ls -ld node_modules/@crhs/web-core && grep -n "DEFAULT_COOKIE_BASE = " node_modules/@crhs/web-core/src/config/sessionStore.js
```
Expected: a `drwx…` directory (no `->`), and `const DEFAULT_COOKIE_BASE = 'app.sid';`.

- [ ] **Step 4: Prove the affiliate is untouched by the session slice (Decision 3).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git grep -n "buildSessionMiddleware" -- server.js server tests | wc -l
git status --short server.js
sed -n '374,381p;456,459p' server.js
```
Expected: `0`; empty `git status` for `server.js`; the inline `const session = require('express-session');` / `const sessionMaxAge = 10 * 60 * 1000;` and the `// Add middleware to ensure session cookie maxAge is always valid` block still present verbatim. Plan 4 removes them.

- [ ] **Step 5: Refresh the affiliate's installed copy, then run its two web-core-facing suites.**
Since Task 5 the affiliate consumes web-core as a **COPY** (Global Constraint 25), so it must be reinstalled before it sees v0.2.0 — otherwise these suites run against the old library and prove nothing.
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
rm -rf node_modules/@crhs/web-core && npm install --install-links 2>&1 | tail -3
grep -c "composeMiddleware" node_modules/@crhs/web-core/src/config/sessionStore.js
git checkout -- package-lock.json
npx jest tests/integration/webCoreConsumptionGolden.test.js tests/integration/domainMigration.test.js --runInBand --forceExit 2>&1 | tail -12
```
Expected: the grep prints `2` (the v0.2.0 library is really installed here), then `Test Suites: 2 passed`, `0 failed` — in particular `domainMigration.test.js:46-55` still asserts the portal cookie is `portal.sid` and never `wavemax.sid`. This is now a real proof that the portal is immune: the app is running the new library and still does not call `buildSessionMiddleware`.

- [ ] **Step 6: Record the release note line (no commit; hand to Task 55).**
```
B3d (session, D18a/D14b) ready for v0.2.0: web-core green; corporate green on an
--install-links copy (4 pre-existing crhsent-parity ENOENT failures only); corporate
pins cookieName=SESSION_COOKIE_NAME||'wavemax.sid' + collectionName default 'sessions'
→ no live cookie/collection change; affiliate has 0 references (Plan 4 adopts).
```

---

### Task 32: web-core — add `SystemConfig.registerDefaults()` registry (B3e, behaviour-preserving)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/models/SystemConfig.js:165-431` (hoist the seed array out of `initializeDefaults` into a frozen module-scope `CORE_DEFAULTS`, add the registry statics)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/models/systemConfig.test.js` (new `describe('registerDefaults')` block appended inside `describe('Static Methods')`, after the existing `describe('initializeDefaults')` which ends at `:788`)

**Interfaces:**
- Consumes: `require('@crhs/web-core').SystemConfig` (lazy getter, `src/index.js:56` — unchanged by this task); mongoose model `SystemConfig` registered at `src/models/SystemConfig.js:449`; the `category` enum at `:20` (`['operator','operations','processing','notification','payment','system','affiliate','customer','quality','performance']`) and the `dataType` enum at `:25` (`['string','number','boolean','array','object']`).
- Produces (spec §7.2.2 contract, in full):
  - `SystemConfig.CORE_DEFAULTS` — frozen array of web-core's own seed descriptors.
  - `SystemConfig.registerDefaults(configs: Array<Object>): number` — validates each entry (`key` a non-empty string; `category` ∈ the schema enum; `dataType` ∈ the schema enum) and merges it into a module-scope registry keyed by `key`. **An identical re-registration is a no-op; a re-registration with a different definition throws** ``registerDefaults: key "<key>" already registered with a different definition``. Returns the registry size.
  - `SystemConfig.getRegisteredDefaults(): ReadonlyArray<Object>` — frozen copy of `[...CORE_DEFAULTS, ...registered]`, in registration order.
  - `SystemConfig.clearRegisteredDefaults(): void` — empties the app registry (test/bootstrap helper; core defaults are untouched).
  - `SystemConfig.initializeDefaults(): Promise<void>` — unchanged signature; now seeds `[...CORE_DEFAULTS, ...registered]`, core first, each via the existing `$setOnInsert` upsert.
  - Consumed by Task 33 (the trim) and Task 34 (corporate `seedSystemConfig`).

- [ ] **Step 1: Write the failing registry test.** Append this block to `tests/models/systemConfig.test.js` immediately after the closing `});` of `describe('initializeDefaults', …)` at `:788` (i.e. still inside `describe('Static Methods')`, which closes at `:789`):

```javascript
    describe('registerDefaults', () => {
      // web-core owns only generic keys; a consuming app contributes its own
      // domain keys here so the shared library carries no app vocabulary.
      afterEach(() => SystemConfig.clearRegisteredDefaults());

      const appKey = () => ({
        key: 'test_app_owned_ttl_hours',
        value: 72,
        defaultValue: 72,
        description: 'App-owned key contributed by the consumer',
        category: 'system',
        dataType: 'number',
        validation: { min: 1, max: 336 }
      });

      it('seeds a registered app-owned key through initializeDefaults', async () => {
        SystemConfig.registerDefaults([appKey()]);
        await SystemConfig.initializeDefaults();

        const doc = await SystemConfig.findOne({ key: 'test_app_owned_ttl_hours' });
        expect(doc).not.toBeNull();
        expect(doc.value).toBe(72);
        expect(doc.validation.min).toBe(1);
        expect(doc.validation.max).toBe(336);
      });

      it('does not seed a key that was never registered in this process', async () => {
        await SystemConfig.initializeDefaults();
        expect(await SystemConfig.findOne({ key: 'test_app_owned_ttl_hours' })).toBeNull();
      });

      it('is a no-op when the same definition is registered twice', () => {
        expect(SystemConfig.registerDefaults([appKey()])).toBe(1);
        expect(SystemConfig.registerDefaults([appKey()])).toBe(1);
        expect(SystemConfig.getRegisteredDefaults().filter((c) => c.key === 'test_app_owned_ttl_hours'))
          .toHaveLength(1);
      });

      it('throws when the SAME key is re-registered with a DIFFERENT definition', () => {
        SystemConfig.registerDefaults([appKey()]);
        expect(() => SystemConfig.registerDefaults([{ ...appKey(), value: 24 }]))
          .toThrow('registerDefaults: key "test_app_owned_ttl_hours" already registered with a different definition');
      });

      it('rejects a non-array argument', () => {
        expect(() => SystemConfig.registerDefaults({ key: 'x' }))
          .toThrow('registerDefaults(configs): configs must be an array');
      });

      it('rejects an entry without a non-empty string key', () => {
        expect(() => SystemConfig.registerDefaults([{ value: 1 }]))
          .toThrow('registerDefaults(configs): every entry needs a non-empty string key');
        expect(() => SystemConfig.registerDefaults([{ key: '   ' }]))
          .toThrow('registerDefaults(configs): every entry needs a non-empty string key');
      });

      it('rejects an entry whose category is not in the schema enum', () => {
        expect(() => SystemConfig.registerDefaults([{ ...appKey(), category: 'nope' }]))
          .toThrow('registerDefaults: key "test_app_owned_ttl_hours" has invalid category "nope"');
      });

      it('rejects an entry whose dataType is not in the schema enum', () => {
        expect(() => SystemConfig.registerDefaults([{ ...appKey(), dataType: 'nope' }]))
          .toThrow('registerDefaults: key "test_app_owned_ttl_hours" has invalid dataType "nope"');
      });

      it('getRegisteredDefaults() returns a FROZEN list beginning with the core keys', () => {
        SystemConfig.registerDefaults([appKey()]);
        const all = SystemConfig.getRegisteredDefaults();
        expect(Object.isFrozen(all)).toBe(true);
        expect(all.slice(0, SystemConfig.CORE_DEFAULTS.length).map((c) => c.key))
          .toEqual(SystemConfig.CORE_DEFAULTS.map((c) => c.key));
        expect(all[all.length - 1].key).toBe('test_app_owned_ttl_hours');
      });

      it('CORE_DEFAULTS is frozen', () => {
        expect(Object.isFrozen(SystemConfig.CORE_DEFAULTS)).toBe(true);
      });

      it('clearRegisteredDefaults empties the app registry but keeps the core keys', () => {
        SystemConfig.registerDefaults([appKey()]);
        SystemConfig.clearRegisteredDefaults();
        expect(SystemConfig.getRegisteredDefaults().map((c) => c.key))
          .toEqual(SystemConfig.CORE_DEFAULTS.map((c) => c.key));
      });
    });
```

- [ ] **Step 2: Run the new tests and confirm they fail for the right reason.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/models/systemConfig.test.js -t 'registerDefaults' 2>&1 | tail -30
```
Expected: 11 failed. The first failure is `TypeError: SystemConfig.clearRegisteredDefaults is not a function` raised from the `afterEach`, and the bodies fail with `TypeError: SystemConfig.registerDefaults is not a function` / `SystemConfig.CORE_DEFAULTS` being `undefined`. That is the correct red — the statics do not exist yet.

- [ ] **Step 3: Hoist the seed array to module scope.** In `src/models/SystemConfig.js`, replace the two lines at `:165-167`:
```javascript
// Static method to initialize default configurations
systemConfigSchema.statics.initializeDefaults = async function() {
  const defaultConfigs = [
```
with:
```javascript
// ---------------------------------------------------------------------------
// Default seeding
//
// web-core owns ONLY generic, app-agnostic keys. Domain keys are contributed by
// the consuming app at boot via SystemConfig.registerDefaults(), so the shared
// library carries no app vocabulary. Core entries are upserted first, so a core
// key always wins over an app key of the same name.
// ---------------------------------------------------------------------------
const CORE_DEFAULTS = [
```
Do not touch the array body in this step.

- [ ] **Step 4: Close the hoisted array and add the registry + rewritten `initializeDefaults`.** The array currently closes at `:423` with `  ];` followed by the seed loop at `:425-431`. Replace that whole tail — from `  ];` through the loop's closing `};` — with:

```javascript
];
Object.freeze(CORE_DEFAULTS);

// Enum values duplicated from the schema definitions above (category :20,
// dataType :25) so a bad registration is rejected at REGISTRATION time with a
// named key, not at seed time with a mongoose ValidationError.
const CATEGORIES = systemConfigSchema.path('category').enumValues;
const DATA_TYPES = systemConfigSchema.path('dataType').enumValues;

// App-owned defaults contributed via registerDefaults(). Keyed by `key` so a
// clustered app calling register-then-seed once per worker, or a test module
// re-requiring this file, never duplicates an entry.
const registeredDefaults = new Map();

/**
 * Register app-owned default configurations to be seeded alongside web-core's
 * generic keys on the next initializeDefaults() call.
 *
 * Idempotent per key: registering an IDENTICAL definition again is a no-op;
 * registering a DIFFERENT definition for the same key throws, so two modules
 * cannot silently disagree about a config's shape.
 *
 * @param {Array<Object>} configs seed descriptors; each needs a string `key`,
 *   a `category` in the schema enum and a `dataType` in the schema enum.
 * @returns {number} the number of distinct registered app keys.
 * @throws {Error} on a non-array, a bad entry, or a conflicting re-registration.
 */
systemConfigSchema.statics.registerDefaults = function(configs) {
  if (!Array.isArray(configs)) {
    throw new Error('registerDefaults(configs): configs must be an array');
  }
  for (const config of configs) {
    if (!config || typeof config.key !== 'string' || config.key.trim() === '') {
      throw new Error('registerDefaults(configs): every entry needs a non-empty string key');
    }
    if (!CATEGORIES.includes(config.category)) {
      throw new Error(`registerDefaults: key "${config.key}" has invalid category "${config.category}"`);
    }
    if (!DATA_TYPES.includes(config.dataType)) {
      throw new Error(`registerDefaults: key "${config.key}" has invalid dataType "${config.dataType}"`);
    }
    const existing = registeredDefaults.get(config.key);
    if (existing && JSON.stringify(existing) !== JSON.stringify(config)) {
      throw new Error(`registerDefaults: key "${config.key}" already registered with a different definition`);
    }
    registeredDefaults.set(config.key, config);
  }
  return registeredDefaults.size;
};

/**
 * @returns {ReadonlyArray<Object>} frozen [...CORE_DEFAULTS, ...registered], in
 *   registration order.
 */
systemConfigSchema.statics.getRegisteredDefaults = function() {
  return Object.freeze([...CORE_DEFAULTS, ...registeredDefaults.values()]);
};

/**
 * Empty the app-owned default registry (core defaults are unaffected).
 * @returns {void}
 */
systemConfigSchema.statics.clearRegisteredDefaults = function() {
  registeredDefaults.clear();
};

systemConfigSchema.statics.CORE_DEFAULTS = CORE_DEFAULTS;

// Static method to initialize default configurations (core first, then app-owned)
systemConfigSchema.statics.initializeDefaults = async function() {
  const defaultConfigs = this.getRegisteredDefaults();

  // Insert defaults if they don't exist
  for (const config of defaultConfigs) {
    await this.findOneAndUpdate(
      { key: config.key },
      { $setOnInsert: config },
      { upsert: true, new: true }
    );
  }
};
```

- [ ] **Step 5: Fix the array-body indentation left over from the hoist.** The entries were indented 4 spaces inside the old function body; at module scope they take 2.
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx eslint --fix src/models/SystemConfig.js && npx eslint src/models/SystemConfig.js && echo "LINT CLEAN"
```
Expected: `LINT CLEAN` with no ESLint diagnostics.

- [ ] **Step 6: Run the file and confirm green.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/models/systemConfig.test.js 2>&1 | tail -12
```
Expected: `0 failed` — the 11 new `registerDefaults` tests pass and every pre-existing `initializeDefaults` test still passes, because `CORE_DEFAULTS` is still the full 26-entry list. **This task changes no seeding behaviour.**

- [ ] **Step 7: Run the full web-core suite.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -8
```
Expected: `0 failed`, `<BASE>+11 passed`.

- [ ] **Step 8: Commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git add src/models/SystemConfig.js tests/models/systemConfig.test.js && git commit -m "$(cat <<'EOF'
feat(config): SystemConfig.registerDefaults() so apps contribute their own seed keys

Hoists the seed list to a frozen module-scope CORE_DEFAULTS and adds a keyed,
validating registry for app-owned defaults: category/dataType are checked against
the schema enums at registration time, an identical re-registration is a no-op and
a conflicting one throws. getRegisteredDefaults() returns a frozen
[...CORE_DEFAULTS, ...registered].

Seeding behaviour is unchanged in this commit (CORE_DEFAULTS is still the full
list); the trim to the three generic keys is the next commit (D15b).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 33: web-core — trim `CORE_DEFAULTS` to the three generic keys + de-brand (B3e / D15b)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/models/SystemConfig.js` — replace the `CORE_DEFAULTS` array body (26 entries) with the 3 generic entries; this deletes the two `WaveMAX Associates` strings (pre-refactor `:169` comment and `:175` description).
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/models/systemConfig.test.js:653-788` (`describe('initializeDefaults')`) — surgical assertion updates for the intentional behaviour change.
- Test: same file (new exhaustive 3-key assertion + a de-brand source guard).

**Interfaces:**
- Consumes: `SystemConfig.registerDefaults` / `getRegisteredDefaults` / `clearRegisteredDefaults` / `CORE_DEFAULTS` from Task 32.
- Produces: `SystemConfig.initializeDefaults()` seeds **exactly** `maintenance_mode`, `access_gate_enabled`, `system_timezone` (plus anything the app registered). Every affiliate-domain key (`default_delivery_fee`, `wdf_base_rate_per_pound`, `store_pickup_address`, the operator/bag/invite/delivery-code keys — 23 in total) leaves web-core. Consumed by Task 34 (corporate seeds `access_gate_enabled` itself) and Task 36 (the affiliate guard proving the trim is invisible there).
- **No affiliate change ships here.** The affiliate keeps its own inline `server/models/SystemConfig.js` (a byte-identical copy of all 26 keys except three comment lines) and keeps calling it at `server.js:138-141` and `tests/setup.js:160`, so nothing it seeds changes. **Global Constraint 9:** nothing in the affiliate repo may `require('@crhs/web-core').SystemConfig` in Plan 1. The affiliate model merge (delete the inline copy, shim to `wc.SystemConfig`, call `registerDefaults(APP_DEFAULTS)` with these 23 keys at boot) is **Plan 4 PR B8** — the 23 removed entries need no separate handoff artifact: the affiliate already holds a byte-identical copy of all of them, and they remain in web-core git history at `src/models/SystemConfig.js:167-392` of the pre-trim commit.

- [ ] **Step 1: Write the failing exhaustive-core test.** In `tests/models/systemConfig.test.js`, insert this as the FIRST test inside `describe('initializeDefaults', …)` (immediately after `describe('initializeDefaults', () => {` at `:653`):

```javascript
      it('seeds exactly the three generic keys web-core owns (D15b)', async () => {
        SystemConfig.clearRegisteredDefaults();
        await SystemConfig.initializeDefaults();

        const keys = (await SystemConfig.find({}, { key: 1 }).lean()).map((d) => d.key).sort();
        expect(keys).toEqual(['access_gate_enabled', 'maintenance_mode', 'system_timezone']);
      });

      it('seeds no affiliate-domain key (they belong to the consuming app)', async () => {
        await SystemConfig.initializeDefaults();

        for (const key of ['default_delivery_fee', 'wdf_base_rate_per_pound', 'store_pickup_address',
          'max_operators_per_shift', 'invite_token_ttl_hours', 'affiliate_delivery_code_length']) {
          expect(await SystemConfig.findOne({ key })).toBeNull();
        }
      });
```

- [ ] **Step 2: Write the failing de-brand guard.** Append this `describe` at the very end of `tests/models/systemConfig.test.js`, after the final `});` closing `describe('SystemConfig Model')`:

```javascript
// D15b de-brand guard: the shared library must carry no franchisor brand string.
// Source-level, so it also catches a brand name reintroduced in a comment.
// (The repo-wide grep guard from spec §7.2.2 ships with B3g/B3k in v0.2.1 —
// src/email/*.js and assets/js/i18n.js still carry rundberglaundry.com fallbacks
// in Plan 1, so a repo-wide version would be red on merge.)
describe('SystemConfig source is brand-neutral', () => {
  const fs = require('fs');
  const path = require('path');

  it('contains no WaveMAX reference', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../src/models/SystemConfig.js'), 'utf8');
    expect(src).not.toMatch(/wavemax/i);
  });
});
```

- [ ] **Step 3: Run both new tests and confirm they fail for the right reason.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/models/systemConfig.test.js -t 'D15b' 2>&1 | tail -25 ; npx jest tests/models/systemConfig.test.js -t 'brand-neutral' 2>&1 | tail -15
```
Expected red:
1. `seeds exactly the three generic keys web-core owns (D15b)` — `expect(received).toEqual(expected)` with a 26-element received array beginning `["access_gate_enabled", "affiliate_delivery_code_length", "bag_label_columns", …]`.
2. `contains no WaveMAX reference` — `expect(received).not.toMatch(/wavemax/i)` failing on the `default_delivery_fee` description string.

- [ ] **Step 4: Replace the `CORE_DEFAULTS` body with the three generic entries.** In `src/models/SystemConfig.js`, delete everything between `const CORE_DEFAULTS = [` and its closing `];` and write exactly:

```javascript
const CORE_DEFAULTS = [
  {
    key: 'maintenance_mode',
    value: false,
    defaultValue: false,
    description: 'Enable maintenance mode',
    category: 'system',
    dataType: 'boolean',
    isPublic: true
  },
  {
    key: 'access_gate_enabled',
    value: false,
    defaultValue: false,
    description: 'Master switch for the site access gate (password/email preview gate + non-whitelisted -> corporate redirect). When false, all traffic is routed locally on every domain.',
    category: 'system',
    dataType: 'boolean',
    isPublic: false
  },
  {
    key: 'system_timezone',
    value: 'America/Chicago',
    defaultValue: 'America/Chicago',
    description: 'System timezone',
    category: 'system',
    dataType: 'string',
    validation: {
      allowedValues: ['America/Chicago', 'America/New_York', 'America/Los_Angeles', 'UTC']
    }
  }
];
```

The three entries are copied verbatim from the pre-trim file (`:394-422`), so no seeded value, category or validation changes for a key that survives.

- [ ] **Step 5: Verify the deletion mechanically.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && grep -c "    key: '" src/models/SystemConfig.js ; grep -in "wavemax\|austin\|rundberg" src/models/SystemConfig.js ; wc -l src/models/SystemConfig.js
```
Expected: `3` seed keys; the brand grep prints nothing and exits 1; the file is ~225 lines plus the registry block added in Task 32 (was 451).

- [ ] **Step 6: Update the four pre-existing `initializeDefaults` tests that assert deleted keys.** Apply these four surgical edits (each change is intentional — the key moved to the consuming app, not a regression):

```javascript
// (a) 'should create default configurations' — swap the operator key for a core key.
      it('should create default configurations', async () => {
        await SystemConfig.initializeDefaults();

        const configs = await SystemConfig.find({});
        expect(configs.length).toBeGreaterThan(0);

        const timezone = await SystemConfig.findOne({ key: 'system_timezone' });
        expect(timezone).toBeDefined();
        expect(timezone.value).toBe('America/Chicago');
        expect(timezone.category).toBe('system');
        expect(timezone.dataType).toBe('string');

        const maintenanceMode = await SystemConfig.findOne({ key: 'maintenance_mode' });
        expect(maintenanceMode).toBeDefined();
        expect(maintenanceMode.value).toBe(false);
        expect(maintenanceMode.isPublic).toBe(true);
      });

// (b) 'should not overwrite existing configurations' — same guarantee, on a core key.
      it('should not overwrite existing configurations', async () => {
        await SystemConfig.create({
          key: 'maintenance_mode',
          value: true,
          category: 'system',
          dataType: 'boolean'
        });

        await SystemConfig.initializeDefaults();

        const config = await SystemConfig.findOne({ key: 'maintenance_mode' });
        expect(config.value).toBe(true); // Should keep existing value
      });

// (c) 'should add missing configurations' — pre-create one core key, expect the others.
      it('should add missing configurations', async () => {
        await SystemConfig.create({
          key: 'maintenance_mode',
          value: true,
          category: 'system',
          dataType: 'boolean'
        });

        await SystemConfig.initializeDefaults();

        const timezone = await SystemConfig.findOne({ key: 'system_timezone' });
        expect(timezone).toBeDefined();
        expect(timezone.value).toBe('America/Chicago');
      });

// (d) 'should enforce spec §8 ranges on the new keys via setValue' — REPLACE wholesale:
//     the ranges now belong to whichever app registers the key, so assert that a
//     REGISTERED key's validation survives the seed round-trip.
      it('enforces validation ranges on a registered app-owned key via setValue', async () => {
        SystemConfig.registerDefaults([{
          key: 'test_registered_ttl_hours',
          value: 72,
          defaultValue: 72,
          description: 'App-owned key contributed by the consumer',
          category: 'system',
          dataType: 'number',
          validation: { min: 1, max: 336 }
        }]);
        await SystemConfig.initializeDefaults();

        await expect(SystemConfig.setValue('test_registered_ttl_hours', 0))
          .rejects.toThrow('Value must be at least 1');
        await expect(SystemConfig.setValue('test_registered_ttl_hours', 337))
          .rejects.toThrow('Value must be at most 336');

        const updated = await SystemConfig.setValue('test_registered_ttl_hours', 24);
        expect(updated.value).toBe(24);

        SystemConfig.clearRegisteredDefaults();
      });
```

- [ ] **Step 7: Delete the two app-domain seed tests that no longer describe web-core.** Delete `it('should seed wdf_base_rate_per_pound at 1.40 (split catch-up 2026-08-27)', …)` (`:673-679`) and `it('should seed every redesign key per spec §8 (PR 3)', …)` (`:713-753`) in full. Both assert affiliate-domain keys; the affiliate keeps its inline model and its own coverage for them in Plan 1, and Plan 4 moves these assertions to the affiliate's `registerDefaults(APP_DEFAULTS)` list. **Keep** the two retired-key guards (`:767-787`, W-9 and `laundry_bag_fee`/`payment_check_*`) — they still assert core seeds none of those keys and cost nothing. Add above the first of them:

```javascript
      // Still meaningful post-D15b: core seeds no domain key at all, retired or not.
```

- [ ] **Step 8: Run the file and confirm green.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/models/systemConfig.test.js 2>&1 | tail -10
```
Expected: `0 failed`, and the suite no longer lists `should seed wdf_base_rate_per_pound` or `should seed every redesign key`.

- [ ] **Step 9: Run the full web-core suite (proves nothing else in core read a deleted key).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -8
```
Expected: `0 failed`. `tests/index.lazy.test.js` (which proves `mongoose.models.SystemConfig` is undefined until the getter is touched) and `tests/index.smoke.test.js` are unaffected — this task changes no index key.

- [ ] **Step 10: Lint and commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx eslint src tests && git add src/models/SystemConfig.js tests/models/systemConfig.test.js && git commit -m "$(cat <<'EOF'
feat(config)!: core seeds only maintenance_mode/access_gate_enabled/system_timezone (D15b)

Removes 23 affiliate-domain seed keys from web-core; consuming apps contribute
them via SystemConfig.registerDefaults(). De-brands the seeded copy — the two
'WaveMAX Associates' strings left with default_delivery_fee — and adds a
source-level guard so no brand string returns.

Affiliate impact: none in this release. It keeps its own inline
server/models/SystemConfig.js (byte-identical seed list) and never requires
web-core's SystemConfig; the model merge is Plan 4 PR B8.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 34: corporate — seed `access_gate_enabled` itself (`server/bootstrap.js`)

**Files:**
- Create: `/mnt/c/Users/rickh/GitHub/crhs-corporate/server/bootstrap.js`
- Create: `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/bootstrap.test.js`
- Modify: none yet (wiring is Task 35)

**Interfaces:**
- Consumes: Task 33's trimmed core defaults; `require('@crhs/web-core').SystemConfig` (already consumed at `server/middleware/accessGate.js:44`, read at `:67` as `await SystemConfig.getValue('access_gate_enabled', false)`); `require('@crhs/web-core').logger`; the single hoisted mongoose instance (Task 7, asserted by `tests/models.test.js:88-95`); `tests/setup.js:12-13` mongodb-memory-server connection.
- Produces: `require('./server/bootstrap').seedSystemConfig(): Promise<boolean>` — upserts web-core's core defaults and returns the resolved `access_gate_enabled` value. Consumed by Task 35 (boot wiring).
- Why corporate must own this: today corporate never calls `initializeDefaults()` (grep over `server/ server.js scripts/ tests/` returns zero hits) and free-rides on the affiliate portal seeding the shared collection at its `server.js:138-141`. That is not boot-breaking — `getValue(…, false)` fails open — but it is an undeclared cross-app dependency, and Plan 3 moves content off the affiliate host.

- [ ] **Step 1: Refresh the installed core copy so it carries Task 33's trim, then write the failing test.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && rm -rf node_modules/@crhs/web-core && npm install --install-links && git checkout -- package-lock.json && grep -c "    key: '" node_modules/@crhs/web-core/src/models/SystemConfig.js
```
Expected: `3`. Then create `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/bootstrap.test.js`:

```javascript
// Boot seeding for crhs-corporate. The access gate reads the SystemConfig key
// `access_gate_enabled` (server/middleware/accessGate.js:67); web-core v0.2.0
// seeds only its three generic keys, so this app must make sure the key exists
// rather than free-riding on the affiliate portal's boot.
// Runs against the in-memory mongoose connection owned by tests/setup.js, on the
// same hoisted mongoose instance web-core's model uses (install-links=true).
const wc = require('@crhs/web-core');
const { seedSystemConfig } = require('../server/bootstrap');

describe('seedSystemConfig', () => {
  it('seeds access_gate_enabled fail-open (false) into an empty collection', async () => {
    expect(await wc.SystemConfig.findOne({ key: 'access_gate_enabled' })).toBeNull();

    const enabled = await seedSystemConfig();

    const doc = await wc.SystemConfig.findOne({ key: 'access_gate_enabled' });
    expect(doc).not.toBeNull();
    expect(doc.value).toBe(false);
    expect(doc.category).toBe('system');
    expect(doc.dataType).toBe('boolean');
    expect(enabled).toBe(false);
  });

  it('never overwrites an operator-set value on a later boot', async () => {
    await seedSystemConfig();
    await wc.SystemConfig.setValue('access_gate_enabled', true);

    const enabled = await seedSystemConfig();

    expect(enabled).toBe(true);
    expect((await wc.SystemConfig.findOne({ key: 'access_gate_enabled' })).value).toBe(true);
  });

  it('seeds no affiliate-domain key into the shared collection (D15b)', async () => {
    await seedSystemConfig();

    const keys = (await wc.SystemConfig.find({}, { key: 1 }).lean()).map((d) => d.key).sort();
    expect(keys).toEqual(['access_gate_enabled', 'maintenance_mode', 'system_timezone']);
  });
});
```

- [ ] **Step 2: Run it and confirm the right red.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/bootstrap.test.js 2>&1 | tail -20
```
Expected: the suite fails to run with `Cannot find module '../server/bootstrap' from 'tests/bootstrap.test.js'`. That is the correct red — the module does not exist.

- [ ] **Step 3: Create the module.** Write `/mnt/c/Users/rickh/GitHub/crhs-corporate/server/bootstrap.js`:

```javascript
// One-time, idempotent boot seeding for crhs-corporate.
//
// The access gate's master switch lives in the shared SystemConfig collection
// under `access_gate_enabled` (read in server/middleware/accessGate.js:67).
// web-core v0.2.0 seeds only its three generic keys and carries no app
// vocabulary, so THIS app is responsible for the key existing before
// accessGate.loadCache() reads it — corporate must not depend on the affiliate
// portal's boot to seed a key corporate consumes.
//
// Seeding is an $setOnInsert upsert per key, so it is safe on every worker of a
// PM2 cluster and never clobbers an operator-set value.
const SystemConfig = require('@crhs/web-core').SystemConfig;
const logger = require('@crhs/web-core').logger;

/**
 * Seed web-core's generic SystemConfig defaults and report the gate switch.
 *
 * @returns {Promise<boolean>} the current value of `access_gate_enabled`.
 */
async function seedSystemConfig() {
  await SystemConfig.initializeDefaults();
  const enabled = (await SystemConfig.getValue('access_gate_enabled', false)) === true;
  logger.info(`SystemConfig seeded; access_gate_enabled=${enabled}`);
  return enabled;
}

module.exports = { seedSystemConfig };
```

- [ ] **Step 4: Run the test and confirm PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/bootstrap.test.js 2>&1 | tail -12
```
Expected: `Tests: 3 passed, 3 total`. The third test passing is the corporate-side proof of Task 33's trim — if web-core still seeded the 23 affiliate keys the `toEqual` would list them.

- [ ] **Step 5: Run the full corporate suite.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npm test 2>&1 | tail -8
```
Expected: exactly the 4 pre-existing `tests/crhsent-parity.test.js` ENOENT failures and 3 more passing than the previous corporate run. `tests/accessGate.test.js` mocks `@crhs/web-core`'s `SystemConfig` with `{ getValue: jest.fn() }` (`:18`) and is untouched by this task; `tests/models.test.js:88-95` still proves one shared mongoose.

- [ ] **Step 6: Lint and commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx eslint server tests && git add server/bootstrap.js tests/bootstrap.test.js && git commit -m "$(cat <<'EOF'
feat(boot): seed SystemConfig here instead of free-riding on the portal

web-core v0.2.0 seeds only its three generic keys (D15b). crhs-corporate reads
access_gate_enabled at accessGate.loadCache(), so it now seeds the key itself.
Idempotent upsert; never clobbers an operator-set value.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 35: corporate — wire `seedSystemConfig()` into the boot sequence

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/server.js:25-28` (add the require) and `:96-98` (the `require.main === module` boot block)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/bootstrap.test.js` (append a boot-order guard — 2 cases)

**Interfaces:**
- Consumes: `seedSystemConfig()` from Task 34; `db.connect()` (`server/db.js:16-28`); `accessGate.loadCache()` (`server/middleware/accessGate.js:65-78`).
- Produces: boot order `db.connect() → seedSystemConfig() → accessGate.loadCache() → startCacheRefresh() → app.listen()`. Seeding must precede `loadCache()` so the first cache read sees a persisted key rather than the fail-open default. **This is the canonical corporate boot wiring — do NOT also call `wc.SystemConfig.initializeDefaults()` directly from `server.js`; `seedSystemConfig()` is that call.**
- No behaviour change for users: the seeded value is `false`, which is what `getValue('access_gate_enabled', false)` already returned when the key was absent.

- [ ] **Step 1: Write the failing boot-order guard.** Append to `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/bootstrap.test.js`:

```javascript
// The boot block runs only under `require.main === module`, so it cannot be
// exercised in-process without listening on :3001. Assert its ORDER at the
// source level instead — seeding must land between the DB connect and the
// access-gate cache load, or loadCache() reads a key that does not exist yet.
describe('server.js boot order', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

  it('seeds SystemConfig after connecting and before the gate cache loads', () => {
    const connect = src.indexOf('await db.connect()');
    const seed = src.indexOf('await seedSystemConfig()');
    const load = src.indexOf('await accessGate.loadCache()');

    expect(connect).toBeGreaterThan(-1);
    expect(seed).toBeGreaterThan(connect);
    expect(load).toBeGreaterThan(seed);
  });

  it('requires the bootstrap module', () => {
    expect(src).toMatch(/require\('\.\/server\/bootstrap'\)/);
  });
});
```

- [ ] **Step 2: Run it and confirm the right red.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/bootstrap.test.js -t 'boot order' 2>&1 | tail -20
```
Expected: 2 failed. The first fails at `expect(seed).toBeGreaterThan(connect)` with `Received: -1` (the string is absent from `server.js`); the second fails on the `toMatch`.

- [ ] **Step 3: Add the require.** In `/mnt/c/Users/rickh/GitHub/crhs-corporate/server.js`, after the `crhsentHandler` require at `:28`, add:
```javascript
const { seedSystemConfig } = require('./server/bootstrap');
```

- [ ] **Step 4: Insert the seed call in the boot block.** In the same file, replace lines `:96-97`:
```javascript
      await db.connect();
      await accessGate.loadCache();
```
with:
```javascript
      await db.connect();
      // Seed before loadCache(): the gate's master switch must exist in the
      // shared collection when the first cache read happens (D15b — web-core
      // no longer seeds app keys, and this app no longer free-rides on the
      // affiliate portal's boot to seed a key it reads).
      await seedSystemConfig();
      await accessGate.loadCache();
```

- [ ] **Step 5: Run the guard and confirm PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/bootstrap.test.js 2>&1 | tail -10
```
Expected: `Tests: 5 passed, 5 total`.

- [ ] **Step 6: Prove the app still boots against a real MongoDB, and that `/health` is unchanged.** With a local mongod or the staging URI in `.env`:
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && PORT=3099 node server.js & sleep 4 ; curl -s -i http://127.0.0.1:3099/health | head -12 ; kill %1
```
Expected: the log stream shows `SystemConfig seeded; access_gate_enabled=false` then `Access gate cache loaded: disabled; …` then `crhs-corporate listening on 3099`; `curl` returns `HTTP/1.1 200 OK` with `Cache-Control: no-store`, body `{"status":"ok"}`, and — because Task 10 has landed — **no `Set-Cookie` header**. If a `Set-Cookie` appears, Task 10 was reverted; fix that, do not patch it here.

- [ ] **Step 7: Full corporate suite + lint, then commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npm test 2>&1 | tail -8 && npx eslint server tests server.js && git add server.js tests/bootstrap.test.js && git commit -m "$(cat <<'EOF'
feat(boot): call seedSystemConfig() between db.connect() and loadCache()

Ordering is load-bearing: the access gate's master switch must be persisted
before the first cache read. Guarded by a source-order test because the boot
block only runs under require.main === module.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected before committing: exactly the 4 pre-existing `crhsent-parity` ENOENT failures.

---

### Task 36: affiliate — model-ownership guard (no `wc.SystemConfig` import) + three-suite verification

**Files:**
- Create: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/integration/systemConfigOwnershipGuard.test.js`
- Test: that file (static source scan — it loads no model, so it cannot trigger `OverwriteModelError`)
- Modify: nothing in `server/`. **The affiliate ships zero production changes in this task.**

**Interfaces:**
- Consumes: Task 33 (the trim), at runtime through the installed copy only — the guard itself greps source text and must never `require('@crhs/web-core').SystemConfig`.
- Produces: a standing regression guard for Global Constraint 9 — the affiliate registers `SystemConfig` from its own `server/models/SystemConfig.js:449`, and web-core's `src/models/SystemConfig.js:449` registers the same model name, so any affiliate module touching `wc.SystemConfig` throws `OverwriteModelError: Cannot overwrite \`SystemConfig\` model once compiled.` at boot (`server.js:138-141`) and in every test run (`tests/setup.js:160`).
- Retired by: **Plan 4 PR B8**, which deletes the inline model, makes `server/models/SystemConfig.js` a shim over `wc.SystemConfig`, and calls `SystemConfig.registerDefaults(APP_DEFAULTS)` with the 23 domain keys removed in Task 33. The guard's own comment names Plan 4 so nobody deletes it early.

- [ ] **Step 1: Write the guard.** Create `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/integration/systemConfigOwnershipGuard.test.js`:

```javascript
// Global Constraint 9 (Plan 1): this app owns an INLINE SystemConfig model
// (server/models/SystemConfig.js:449 -> mongoose.model('SystemConfig', ...)),
// and @crhs/web-core registers a model of the SAME name. Requiring web-core's
// SystemConfig anywhere in this repo therefore throws
//   OverwriteModelError: Cannot overwrite `SystemConfig` model once compiled.
// at boot (server.js:138-141) and in every test run (tests/setup.js:160).
//
// This guard is source-level ON PURPOSE: it must not load either model.
// Retire it in PLAN 4 (PR B8), which deletes the inline model, shims
// server/models/SystemConfig.js over web-core's, and calls
// SystemConfig.registerDefaults(APP_DEFAULTS) at boot.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.join(__dirname, '../..');

const trackedJs = () =>
  execFileSync('git', ['ls-files', 'server', 'tests', 'scripts', 'server.js'], { cwd: repoRoot })
    .toString()
    .split('\n')
    .filter((f) => f.endsWith('.js') && f !== 'tests/integration/systemConfigOwnershipGuard.test.js');

describe('SystemConfig ownership (model double-registration)', () => {
  it('no file imports web-core SystemConfig while the inline model exists', () => {
    const offenders = trackedJs().filter((file) => {
      const src = fs.readFileSync(path.join(repoRoot, file), 'utf8');
      return /(require\((['"])@crhs\/web-core\2\)|webCore|wc)\s*\.\s*SystemConfig/.test(src);
    });

    expect(offenders).toEqual([]);
  });

  it('still owns the inline model that makes the rule necessary', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'server/models/SystemConfig.js'), 'utf8');
    expect(src).toMatch(/mongoose\.model\('SystemConfig'/);
  });
});
```

- [ ] **Step 2: Prove the guard is red against the regression it exists to catch.** Create a throwaway probe, run the guard, then delete the probe:
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && printf "// temporary probe\nconst SystemConfig = require('@crhs/web-core').SystemConfig;\nmodule.exports = SystemConfig;\n" > server/utils/ownershipProbe.js && git add -N server/utils/ownershipProbe.js && npx jest tests/integration/systemConfigOwnershipGuard.test.js 2>&1 | tail -20
```
Expected red: `no file imports web-core SystemConfig while the inline model exists` fails with `Expected: []` / `Received: ["server/utils/ownershipProbe.js"]`.

- [ ] **Step 3: Delete the probe and confirm the guard goes green.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git rm -q --cached server/utils/ownershipProbe.js && rm server/utils/ownershipProbe.js && npx jest tests/integration/systemConfigOwnershipGuard.test.js 2>&1 | tail -10
```
Expected: `Tests: 2 passed, 2 total`, and `git status --short` shows only the new guard test file.

- [ ] **Step 4: Refresh the installed core copy, then run the full affiliate suite against the trimmed web-core.** (This is the real proof the D15b trim is invisible to the affiliate: its inline model still seeds all 26 keys and it never reaches `wc.SystemConfig`.)
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && rm -rf node_modules/@crhs/web-core && npm install --install-links && git checkout -- package-lock.json && grep -c "    key: '" node_modules/@crhs/web-core/src/models/SystemConfig.js && npm test 2>&1 | tail -12
```
Expected: the grep prints `3` (the trimmed library really is installed), then the same suite/test totals as the previous affiliate run plus the 2 new guard cases, 0 failures, and **no** `OverwriteModelError` anywhere in the output. Per the project's flaky-suite note, re-run any single failing suite alone (`npx jest <path>`) before treating it as a real failure.

- [ ] **Step 5: Re-confirm the affiliate's web-core surface did not grow.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && grep -rn "@crhs/web-core" --include=*.js server/ server.js | wc -l ; grep -rn "SystemConfig" --include=*.js server/ server.js | grep -c "web-core"
```
Expected: `23` and `0`. The first number is the count of `@crhs/web-core` reference **lines** (not files) under `server/` plus `server.js`, measured on 2026-09-09 — it must be unchanged from the value Task 1 Step 6 recorded, not a remembered constant. The second must be `0`. Note `grep -c` exits 1 when it prints `0`, so the `;`-separated form above is required — an `&&` chain would stop there.

- [ ] **Step 6: Commit the guard.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git add tests/integration/systemConfigOwnershipGuard.test.js && git commit -m "$(cat <<'EOF'
test(guard): no web-core SystemConfig import while the inline model exists

Both models register mongoose.model('SystemConfig', ...), so any import of
web-core's would throw OverwriteModelError at boot and in every test run.
Source-level guard (loads neither model). Retire in Plan 4 PR B8 with the model
merge + registerDefaults(APP_DEFAULTS).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
> **Group preamble for Tasks 37–42 (B3f, rate limiting).** These tasks ship the *mechanism* half of D17b (spec §7.2.3) — everything additive and default-preserving, so `@crhs/web-core` v0.2.0 reaches both boxes with zero consumer breakage and zero collection renames — **plus exactly three limiter deletions** (`emailVerificationLimiter`, `fileUploadLimiter`, `adminOperationLimiter`), which spec §7.2.3 lists as "Deleted from core" and which are grep-verified mounted nowhere in either app.
>
> **The contact-form limiters are NOT among them.** The claim that deleting `contactFormBurstLimiter` / `contactFormLimiter` would take crhsent.com down *at require time* is false: corporate's only `wc.rateLimiting` reference is `crhs-corporate/server.js:77` (`apiLimiter`), and the affiliate mounts them from its **own** 357-line `server/middleware/rateLimiting.js:190,213`. But the deletion is still wrong for v0.2.0, for a different and real reason — **copy-before-delete** (Global Constraint 13): the reviewed numbers must be copied into corporate's `server/middleware/rateLimitPolicy.js` (Plan 2 / D2a) and the affiliate's policy module (Plan 4 / PR B7) first, and once Plan 4 turns the affiliate's copy into a shim, a missing export lands as `router.post(path, undefined, …)` → `Route.post() requires a callback function but got a [object Undefined]` at require time. Task 41 encodes that as a guard test **and** an in-file comment so no reviewer re-derives either the phantom hazard or the premature deletion.
>
> **Out of scope here, handed to Plan 4 by Task 42:** the affiliate's PR B7 — mirroring core's `rateLimiting.js` / `rateLimitMongoStore.js`, `server/services/codeAttemptLockout.js:49`, the §7.6.3 `rate_limits` reset fix across `systemHealthService` / `administratorController` / `administratorRoutes`, and `scripts/admin/reset-rate-limits.js`. Spec §7.5 places row B7 in the B-adopt tranche after Phase 2, and Plan 1 explicitly excludes the module-by-module inline-copy adoption.

### Task 37: web-core — `collectionPrefix` + a process-wide bucket-name registry on `MongoRateLimitStore` (B3f)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/middleware/rateLimitMongoStore.js:17-22` (header comment), `:33-38` (constructor), `:134` (export tail — statics appended)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/middleware/rateLimitMongoStore.test.js` (new describe block appended; literals at `:27` and `:77` replaced)

**Interfaces:**
- Consumes: `mongoose` (already required at `rateLimitMongoStore.js:25`); `process.env.RATE_LIMIT_COLLECTION_PREFIX`
- Produces:
  - `new MongoRateLimitStore({ windowMs, name, collectionPrefix })` → instance with `.collectionPrefix: string`, ``.collectionName === `${collectionPrefix}${name}` ``
  - `MongoRateLimitStore.DEFAULT_COLLECTION_PREFIX: 'ratelimit_'`
  - `MongoRateLimitStore.collectionPrefix(): string` — `process.env.RATE_LIMIT_COLLECTION_PREFIX || 'ratelimit_'`, read at call time
  - `MongoRateLimitStore.registerName(name: string): void`
  - `MongoRateLimitStore.registeredNames(): ReadonlyArray<string>` — frozen, sorted
  - Consumed by Tasks 38, 39, 40 and by Plan 4 PR B7.

- [ ] **Step 1: Read the constructor you are about to change.**
```bash
sed -n '17,22p;33,38p;130,134p' /mnt/c/Users/rickh/GitHub/crhs-web-core/src/middleware/rateLimitMongoStore.js
```
Expected: `:36` reads ``this.collectionName = `ratelimit_${this.name}`;`` and `:134` reads `module.exports = MongoRateLimitStore;`.

- [ ] **Step 2: Write the failing tests.** Append to `tests/middleware/rateLimitMongoStore.test.js`:
```js
describe('MongoRateLimitStore collection naming + name registry (D17b)', () => {
  let MongoStore;
  beforeAll(() => { MongoStore = require('../../src/middleware/rateLimitMongoStore'); });

  it('defaults to ratelimit_<name> — the portal keeps its LIVE collection names', () => {
    const s = new MongoStore({ windowMs: 1000, name: 'auth' });
    expect(s.collectionName).toBe('ratelimit_auth');
    expect(MongoStore.DEFAULT_COLLECTION_PREFIX).toBe('ratelimit_');
  });

  it('honours an explicit collectionPrefix', () => {
    const s = new MongoStore({ windowMs: 1000, name: 'api', collectionPrefix: 'ratelimit_corp_' });
    expect(s.collectionPrefix).toBe('ratelimit_corp_');
    expect(s.collectionName).toBe('ratelimit_corp_api');
  });

  it('honours RATE_LIMIT_COLLECTION_PREFIX from the environment', () => {
    process.env.RATE_LIMIT_COLLECTION_PREFIX = 'ratelimit_corp_';
    try {
      expect(MongoStore.collectionPrefix()).toBe('ratelimit_corp_');
      expect(new MongoStore({ windowMs: 1000, name: 'api' }).collectionName).toBe('ratelimit_corp_api');
    } finally {
      delete process.env.RATE_LIMIT_COLLECTION_PREFIX;
    }
  });

  it('registers every constructed bucket name, frozen and sorted', () => {
    new MongoStore({ windowMs: 1000, name: 'bag_codes' });
    new MongoStore({ windowMs: 1000, name: 'auth' });
    const names = MongoStore.registeredNames();
    expect(names).toContain('bag_codes');
    expect(names).toContain('auth');
    expect(Object.isFrozen(names)).toBe(true);
    expect([...names]).toEqual([...names].sort());
  });
});
```

- [ ] **Step 3: Run it red.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/middleware/rateLimitMongoStore.test.js --runInBand
```
Expected failure — **all 4** new tests fail, summary `Tests: 4 failed, 7 passed, 11 total`: test 1 on `expect(MongoStore.DEFAULT_COLLECTION_PREFIX).toBe('ratelimit_')` → `Received: undefined` (its first assertion, `collectionName === 'ratelimit_auth'`, already passes — that is the point: the default is unchanged); test 2 on `expect(s.collectionPrefix).toBe('ratelimit_corp_')` → `Received: undefined`; test 3 with `TypeError: MongoStore.collectionPrefix is not a function`; test 4 with `TypeError: MongoStore.registeredNames is not a function`.

- [ ] **Step 4: Implement the constructor + statics.** In `src/middleware/rateLimitMongoStore.js`, replace the constructor block (`:28-38`) with:
```js
  /**
   * @param {object} options
   * @param {number} options.windowMs          Sliding-window length in ms.
   * @param {string} options.name              Limiter name (collection suffix).
   * @param {string} [options.collectionPrefix] Collection-name prefix. Defaults to
   *   RATE_LIMIT_COLLECTION_PREFIX, else 'ratelimit_' — the portal's LIVE names.
   *   A rename would silently orphan every live counter bucket, so the default
   *   must never change; a second app on the same database sets the env var.
   */
  constructor({ windowMs, name, collectionPrefix } = {}) {
    this.windowMs = windowMs;
    this.name = name || 'default';
    this.collectionPrefix = collectionPrefix || MongoRateLimitStore.collectionPrefix();
    this.collectionName = `${this.collectionPrefix}${this.name}`;
    this._initialized = false;
    MongoRateLimitStore.registerName(this.name);
  }
```
and replace the export tail (`:134`) with:
```js
// Process-wide registry of every bucket name a store was constructed for. Feeds
// rateLimiting.LIMITER_NAMES, which is what sweep/reset tooling fans out over —
// nothing else in the process knows the full list (an app's lockout service may
// build its own store directly, outside createMongoStore).
const REGISTERED_NAMES = new Set();

MongoRateLimitStore.DEFAULT_COLLECTION_PREFIX = 'ratelimit_';
MongoRateLimitStore.collectionPrefix = () =>
  process.env.RATE_LIMIT_COLLECTION_PREFIX || MongoRateLimitStore.DEFAULT_COLLECTION_PREFIX;
MongoRateLimitStore.registerName = (name) => {
  if (name) REGISTERED_NAMES.add(String(name));
};
MongoRateLimitStore.registeredNames = () => Object.freeze([...REGISTERED_NAMES].sort());

module.exports = MongoRateLimitStore;
```
Then update the header comment at `:19` — replace `dedicated collection per limiter (\`ratelimit_<name>\`)` with:
```
 * dedicated collection per limiter (`<collectionPrefix><name>`, default prefix
 * `ratelimit_` — see RATE_LIMIT_COLLECTION_PREFIX) so different
```

- [ ] **Step 5: Run it green.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/middleware/rateLimitMongoStore.test.js --runInBand
```
Expected: `Tests: 11 passed, 11 total` (7 pre-existing + 4 new).

- [ ] **Step 6: Kill the two hardcoded collection literals in the existing tests.** In the same test file replace `:27` and `:77` (the `beforeEach` cleanup and the expired-window test):
```js
    const coll = mongoose.connection.collection(store.collectionName);
```
Re-run:
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/middleware/rateLimitMongoStore.test.js --runInBand
```
Expected: `Tests: 11 passed`.

- [ ] **Step 7: Commit.**
```bash
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core add src/middleware/rateLimitMongoStore.js tests/middleware/rateLimitMongoStore.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core commit -m "$(cat <<'EOF'
core(rate-limit): collectionPrefix + bucket-name registry on MongoRateLimitStore (D17b)

Default prefix stays 'ratelimit_' so the portal's live counter collections
are untouched; a second app on the same database sets
RATE_LIMIT_COLLECTION_PREFIX. registeredNames() feeds LIMITER_NAMES.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 38: web-core — make the per-boot TTL `createIndex` opt-in (`ensureTtlIndex` / `RATE_LIMIT_TTL_INDEX`)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/middleware/rateLimitMongoStore.js:28-38` (constructor JSDoc + one field), `:45-64` (`init`)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/middleware/rateLimitMongoStore.test.js` (new describe block — 4 cases)

**Interfaces:**
- Consumes: the `MongoRateLimitStore` constructor from Task 37; `process.env.RATE_LIMIT_TTL_INDEX`
- Produces: `new MongoRateLimitStore({ …, ensureTtlIndex?: boolean })` → `.ensureTtlIndex: boolean`; `init()` calls `collection.createIndex({ _expiresAt: 1 }, { expireAfterSeconds: 0 })` **only** when it is true. Consumed by Task 39 (sweep is the replacement reclamation path) and Task 42 (env documentation).

- [ ] **Step 1: Write the failing tests.** Append to `tests/middleware/rateLimitMongoStore.test.js`:
```js
describe('MongoRateLimitStore TTL index is opt-in (D17b — ADB rejects it every boot)', () => {
  let MongoStore;
  beforeAll(() => { MongoStore = require('../../src/middleware/rateLimitMongoStore'); });

  const stubCollection = () => {
    const createIndex = jest.fn().mockResolvedValue('ok');
    const spy = jest.spyOn(mongoose.connection, 'collection').mockReturnValue({ createIndex });
    return { createIndex, restore: () => spy.mockRestore() };
  };

  it('init() does NOT call createIndex by default', async () => {
    const { createIndex, restore } = stubCollection();
    try {
      const s = new MongoStore({ windowMs: 1000, name: 'ttl-off' });
      expect(s.ensureTtlIndex).toBe(false);
      await s.init({ windowMs: 1000 });
      expect(createIndex).not.toHaveBeenCalled();
    } finally { restore(); }
  });

  it('init() calls createIndex when ensureTtlIndex is passed', async () => {
    const { createIndex, restore } = stubCollection();
    try {
      const s = new MongoStore({ windowMs: 1000, name: 'ttl-on', ensureTtlIndex: true });
      await s.init({ windowMs: 1000 });
      expect(createIndex).toHaveBeenCalledWith({ _expiresAt: 1 }, { expireAfterSeconds: 0 });
    } finally { restore(); }
  });

  it('init() calls createIndex when RATE_LIMIT_TTL_INDEX=true', async () => {
    process.env.RATE_LIMIT_TTL_INDEX = 'true';
    const { createIndex, restore } = stubCollection();
    try {
      const s = new MongoStore({ windowMs: 1000, name: 'ttl-env' });
      expect(s.ensureTtlIndex).toBe(true);
      await s.init({ windowMs: 1000 });
      expect(createIndex).toHaveBeenCalledTimes(1);
    } finally { restore(); delete process.env.RATE_LIMIT_TTL_INDEX; }
  });

  it('a createIndex rejection still never crashes init()', async () => {
    const spy = jest.spyOn(mongoose.connection, 'collection')
      .mockReturnValue({ createIndex: jest.fn().mockRejectedValue(new Error('ORA-01031')) });
    try {
      const s = new MongoStore({ windowMs: 1000, name: 'ttl-boom', ensureTtlIndex: true });
      await expect(s.init({ windowMs: 1000 })).resolves.toBeUndefined();
      expect(s._initialized).toBe(true);
    } finally { spy.mockRestore(); }
  });
});
```

- [ ] **Step 2: Run it red.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/middleware/rateLimitMongoStore.test.js --runInBand -t 'TTL index is opt-in'
```
Expected failure: test 1 fails on `expect(s.ensureTtlIndex).toBe(false)` → received `undefined`, and (with that line removed) on `expect(createIndex).not.toHaveBeenCalled()` → called once, because `init()` at `:58-62` calls `createIndex` unconditionally today.

- [ ] **Step 3: Add the field to the constructor.** Extend the destructure and add one line (keeping Task 37's body):
```js
  constructor({ windowMs, name, collectionPrefix, ensureTtlIndex } = {}) {
    this.windowMs = windowMs;
    this.name = name || 'default';
    this.collectionPrefix = collectionPrefix || MongoRateLimitStore.collectionPrefix();
    this.collectionName = `${this.collectionPrefix}${this.name}`;
    this.ensureTtlIndex = ensureTtlIndex === undefined
      ? process.env.RATE_LIMIT_TTL_INDEX === 'true'
      : Boolean(ensureTtlIndex);
    this._initialized = false;
    MongoRateLimitStore.registerName(this.name);
  }
```

- [ ] **Step 4: Gate `init()`.** Replace `init()`'s body (`:45-64`) with:
```js
  async init(options) {
    if (options && typeof options.windowMs === 'number') {
      this.windowMs = options.windowMs;
    }

    // TTL index — OPT-IN ONLY (RATE_LIMIT_TTL_INDEX=true, or ensureTtlIndex).
    // On Oracle ADB (our production database) this createIndex is refused and
    // the error is swallowed below: one guaranteed-failing round trip per
    // limiter, per PM2 worker, per boot, buying nothing — the index never
    // exists, so nothing purges these collections. Correctness does not depend
    // on it (increment() compares _expiresAt directly, see the two-phase
    // upsert), and reclamation is the job of rateLimiting.sweepExpired().
    if (this.ensureTtlIndex) {
      const coll = mongoose.connection.collection(this.collectionName);
      try {
        await coll.createIndex({ _expiresAt: 1 }, { expireAfterSeconds: 0 });
      } catch (_e) {
        // Already-exists is fine; other errors must not crash startup.
      }
    }
    this._initialized = true;
  }
```

- [ ] **Step 5: Run it green.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/middleware/rateLimitMongoStore.test.js --runInBand
```
Expected: `Tests: 15 passed, 15 total`.

- [ ] **Step 6: Commit.**
```bash
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core add src/middleware/rateLimitMongoStore.js tests/middleware/rateLimitMongoStore.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core commit -m "$(cat <<'EOF'
core(rate-limit): TTL createIndex is opt-in via RATE_LIMIT_TTL_INDEX (D17b)

On Oracle ADB the per-boot createIndex is a guaranteed swallowed failure —
every limiter, every worker, every boot — and the index never exists.
Default off; sweepExpired() reclaims instead.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 39: web-core — `sweepCollection` / `resetCollection` statics (the per-collection primitives)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/middleware/rateLimitMongoStore.js` (statics block added in Task 37, before `module.exports`)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/middleware/rateLimitMongoStore.test.js` (new describe block — 4 cases)

**Interfaces:**
- Consumes: `mongoose.connection.collection(name)`; Task 38's opt-in TTL (this is the replacement reclamation path)
- Produces:
  - `MongoRateLimitStore.sweepCollection(collectionName: string, now?: Date): Promise<number>` — `deleteMany({ _expiresAt: { $lt: now } })`, returns `deletedCount`
  - `MongoRateLimitStore.resetCollection(collectionName: string, idPattern?: RegExp|string): Promise<number>` — `deleteMany(idPattern ? { _id: idPattern } : {})`, returns `deletedCount`
  - Consumed by Task 40 (`sweepExpired` / `resetBuckets`).

- [ ] **Step 1: Write the failing tests.** Append to `tests/middleware/rateLimitMongoStore.test.js`:
```js
describe('MongoRateLimitStore sweep/reset primitives (D17b)', () => {
  let MongoStore;
  const NAME = 'ratelimit_sweep-test';
  beforeAll(() => { MongoStore = require('../../src/middleware/rateLimitMongoStore'); });
  beforeEach(async () => { await mongoose.connection.collection(NAME).deleteMany({}); });

  it('sweepCollection deletes ONLY expired documents', async () => {
    const coll = mongoose.connection.collection(NAME);
    await coll.insertMany([
      { _id: 'gone-1', hits: 4, _expiresAt: new Date(Date.now() - 60000) },
      { _id: 'gone-2', hits: 1, _expiresAt: new Date(Date.now() - 1) },
      { _id: 'kept-1', hits: 2, _expiresAt: new Date(Date.now() + 60000) }
    ]);
    expect(await MongoStore.sweepCollection(NAME)).toBe(2);
    expect(await coll.countDocuments({})).toBe(1);
    expect((await coll.findOne({}))._id).toBe('kept-1');
  });

  it('sweepCollection honours an explicit `now`', async () => {
    const coll = mongoose.connection.collection(NAME);
    await coll.insertOne({ _id: 'future', hits: 1, _expiresAt: new Date(Date.now() + 60000) });
    expect(await MongoStore.sweepCollection(NAME, new Date(Date.now() + 120000))).toBe(1);
    expect(await coll.countDocuments({})).toBe(0);
  });

  it('resetCollection with no pattern wipes the bucket; with a pattern deletes only matches', async () => {
    const coll = mongoose.connection.collection(NAME);
    await coll.insertMany([
      { _id: '203.0.113.7', hits: 9, _expiresAt: new Date(Date.now() + 60000) },
      { _id: '198.51.100.4', hits: 2, _expiresAt: new Date(Date.now() + 60000) }
    ]);
    expect(await MongoStore.resetCollection(NAME, /^203\.0\.113\.7$/)).toBe(1);
    expect(await coll.countDocuments({})).toBe(1);
    expect(await MongoStore.resetCollection(NAME)).toBe(1);
    expect(await coll.countDocuments({})).toBe(0);
  });

  it('sweepCollection on an empty/absent collection returns 0', async () => {
    expect(await MongoStore.sweepCollection('ratelimit_does-not-exist')).toBe(0);
  });
});
```

- [ ] **Step 2: Run it red.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/middleware/rateLimitMongoStore.test.js --runInBand -t 'sweep/reset primitives'
```
Expected failure: `TypeError: MongoStore.sweepCollection is not a function` on all four.

- [ ] **Step 3: Implement the statics.** In `src/middleware/rateLimitMongoStore.js`, insert immediately above `module.exports = MongoRateLimitStore;`:
```js
/**
 * Delete every expired counter in one bucket. This is the reclamation path —
 * the TTL index is opt-in (and inert on Oracle ADB), so without a sweep these
 * collections grow forever.
 * @param {string} collectionName
 * @param {Date} [now]
 * @returns {Promise<number>} documents deleted
 */
MongoRateLimitStore.sweepCollection = async (collectionName, now = new Date()) => {
  const res = await mongoose.connection.collection(collectionName)
    .deleteMany({ _expiresAt: { $lt: now } });
  return (res && res.deletedCount) || 0;
};

/**
 * Delete counters in one bucket — all of them, or only the `_id`s matching
 * `idPattern` (the store keys on `_id`, so the visitor IP/user key IS the _id).
 * @param {string} collectionName
 * @param {RegExp|string} [idPattern]
 * @returns {Promise<number>} documents deleted
 */
MongoRateLimitStore.resetCollection = async (collectionName, idPattern) => {
  const filter = idPattern ? { _id: idPattern } : {};
  const res = await mongoose.connection.collection(collectionName).deleteMany(filter);
  return (res && res.deletedCount) || 0;
};
```

- [ ] **Step 4: Run it green.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/middleware/rateLimitMongoStore.test.js --runInBand
```
Expected: `Tests: 19 passed, 19 total`.

- [ ] **Step 5: Commit.**
```bash
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core add src/middleware/rateLimitMongoStore.js tests/middleware/rateLimitMongoStore.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core commit -m "$(cat <<'EOF'
core(rate-limit): sweepCollection/resetCollection per-bucket primitives (D17b)

Reclamation and admin reset need a real handle on the counter collections;
the store's _id IS the limiter key, so reset takes an _id pattern.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 40: web-core — `rateLimiting` mechanism surface + the ported affiliate test blocks (B3f)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/middleware/rateLimiting.js:45-49` (`createMongoStore`), `:76` (key-generator export), end of file (`:357` — new exports appended)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/middleware/rateLimiting.test.js` (new mechanism describe — 7 cases — plus the ported affiliate blocks and the two RELAX cases required by spec §7.2.3)

**Interfaces:**
- Consumes: `MongoRateLimitStore.{collectionPrefix,registerName,registeredNames,sweepCollection,resetCollection}` (Tasks 37, 39)
- Produces (all on `require('@crhs/web-core').rateLimiting`):
  - `keyGenerators` (alias of `_keyGenerators`), `isRelaxed: boolean`, `isTest: boolean`
  - `collectionPrefix(): string`, `collectionNameFor(name: string): string`
  - `LIMITER_NAMES: ReadonlyArray<string>` — an **enumerable getter over the live registry**, not a snapshot
  - `sweepExpired({ prefix?, names?, now? }?): Promise<Array<{collection: string, deletedCount: number}>>`
  - `resetBuckets({ prefix?, names?, idPattern? }?): Promise<Array<{collection: string, deletedCount: number}>>`
  - `createMongoStore(windowMs, name)` — unchanged return semantics, now **registers `name` before** the `isTest` early return
  - Consumed by Task 41 (guard) and by Plan 4 PR B7.

> **Consumer note carried to Plan 4 (do not lose it):** `LIMITER_NAMES` is a **getter over a live registry**. A consumer that writes `const { LIMITER_NAMES } = require('…/rateLimiting')` snapshots it at require time and misses every bucket registered later — e.g. `bag_codes`, which the affiliate's `codeAttemptLockout` registers when *that* module loads. Consumers must hold the module (`const rateLimiting = require('…')`) and read `rateLimiting.LIMITER_NAMES` at call time, and must `require` any service that owns its own store before fanning out. Task 42 repeats this in the hand-off.

- [ ] **Step 1: Write the failing mechanism tests.** Append to `tests/middleware/rateLimiting.test.js`:
```js
const mongoose = require('mongoose');
const rl = require('../../src/middleware/rateLimiting');

describe('rateLimiting mechanism surface (D17b)', () => {
  it('exposes what an app policy module needs', () => {
    expect(rl.keyGenerators).toBe(rl._keyGenerators);
    expect(rl.isTest).toBe(true);
    expect(typeof rl.isRelaxed).toBe('boolean');
    expect(rl.collectionPrefix()).toBe('ratelimit_');
    expect(rl.collectionNameFor('auth')).toBe('ratelimit_auth');
  });

  it('collectionNameFor reads RATE_LIMIT_COLLECTION_PREFIX at CALL time', () => {
    process.env.RATE_LIMIT_COLLECTION_PREFIX = 'ratelimit_corp_';
    try {
      expect(rl.collectionNameFor('api')).toBe('ratelimit_corp_api');
    } finally { delete process.env.RATE_LIMIT_COLLECTION_PREFIX; }
  });

  it('LIMITER_NAMES lists every registered bucket, frozen and sorted', () => {
    expect(rl.LIMITER_NAMES).toEqual(expect.arrayContaining([
      'admin_login', 'api', 'auth', 'concierge', 'contact_burst',
      'contact_hourly', 'pwreset', 'register', 'sensitive'
    ]));
    expect(Object.isFrozen(rl.LIMITER_NAMES)).toBe(true);
    expect([...rl.LIMITER_NAMES]).toEqual([...rl.LIMITER_NAMES].sort());
  });

  it('LIMITER_NAMES is a LIVE getter, not a require-time snapshot', () => {
    const before = [...rl.LIMITER_NAMES];
    require('../../src/middleware/rateLimitMongoStore').registerName('late_bucket');
    expect(before).not.toContain('late_bucket');
    expect(rl.LIMITER_NAMES).toContain('late_bucket');
  });

  it('createCustomLimiter registers its bucket name too', () => {
    rl.createCustomLimiter({ windowMs: 1000, max: 1, name: 'unit-custom' });
    expect(rl.LIMITER_NAMES).toContain('unit-custom');
  });

  it('sweepExpired fans out over names and deletes only expired docs', async () => {
    const coll = mongoose.connection.collection('ratelimit_auth');
    await coll.deleteMany({});
    await coll.insertMany([
      { _id: 'stale', hits: 5, _expiresAt: new Date(Date.now() - 60000) },
      { _id: 'live', hits: 1, _expiresAt: new Date(Date.now() + 60000) }
    ]);
    expect(await rl.sweepExpired({ names: ['auth'] }))
      .toEqual([{ collection: 'ratelimit_auth', deletedCount: 1 }]);
    expect(await coll.countDocuments({})).toBe(1);
  });

  it('resetBuckets({ idPattern }) deletes only matching _ids, and with no pattern wipes the bucket', async () => {
    const coll = mongoose.connection.collection('ratelimit_api');
    await coll.deleteMany({});
    await coll.insertMany([
      { _id: '203.0.113.7', hits: 9, _expiresAt: new Date(Date.now() + 60000) },
      { _id: '198.51.100.4', hits: 2, _expiresAt: new Date(Date.now() + 60000) }
    ]);
    expect(await rl.resetBuckets({ names: ['api'], idPattern: /^203\.0\.113\.7$/ }))
      .toEqual([{ collection: 'ratelimit_api', deletedCount: 1 }]);
    expect(await coll.countDocuments({})).toBe(1);
    expect(await rl.resetBuckets({ names: ['api'] }))
      .toEqual([{ collection: 'ratelimit_api', deletedCount: 1 }]);
  });
});
```

- [ ] **Step 2: Run it red.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/middleware/rateLimiting.test.js --runInBand -t 'mechanism surface'
```
Expected failure: `expect(rl.keyGenerators).toBe(rl._keyGenerators)` → received `undefined`, and `TypeError: rl.collectionPrefix is not a function`.

- [ ] **Step 3: Register bucket names in `createMongoStore` and alias the key generators.** In `src/middleware/rateLimiting.js` replace `:46-49`:
```js
const createMongoStore = (windowMs, name) => {
  // Register BEFORE the test short-circuit: LIMITER_NAMES must be complete in
  // every environment, including the suite (where the store itself is skipped).
  MongoRateLimitStore.registerName(name || 'default');
  if (isTest) return undefined;
  return new MongoRateLimitStore({ windowMs, name });
};
```
and add, immediately after `:76` (`exports._keyGenerators = keyGenerators;`):
```js
// Public alias — app policy modules (affiliate/corporate) build their own
// limiters with these; `_keyGenerators` stays for the existing tests.
exports.keyGenerators = keyGenerators;
exports.isRelaxed = isRelaxed;
exports.isTest = isTest;
```

- [ ] **Step 4: Append the collection helpers.** At the end of `src/middleware/rateLimiting.js` (after `createCustomLimiter`, `:357`):
```js
// ---------------------------------------------------------------------------
// Collection helpers (D17b). The prefix is read at CALL time so a process can
// set RATE_LIMIT_COLLECTION_PREFIX after this module loads; the default is
// 'ratelimit_', which is what the portal's live buckets are named — changing
// it renames nothing, it just orphans the old collections.
// ---------------------------------------------------------------------------
const collectionPrefix = () => MongoRateLimitStore.collectionPrefix();
const collectionNameFor = (name) => `${collectionPrefix()}${name}`;

exports.collectionPrefix = collectionPrefix;
exports.collectionNameFor = collectionNameFor;

// A GETTER over the live registry, never a snapshot: a bucket registered after
// this module loads (an app's lockout service building its own store) must show
// up. Consumers MUST read `rateLimiting.LIMITER_NAMES` at call time rather than
// destructuring it at require time.
Object.defineProperty(module.exports, 'LIMITER_NAMES', {
  enumerable: true,
  get: () => MongoRateLimitStore.registeredNames()
});

/**
 * Delete expired counters across every named bucket. The TTL index is opt-in
 * and inert on Oracle ADB, so this is the ONLY thing that reclaims the space.
 * @param {{prefix?: string, names?: string[], now?: Date}} [opts]
 * @returns {Promise<Array<{collection: string, deletedCount: number}>>}
 */
exports.sweepExpired = async ({
  prefix = collectionPrefix(),
  names = MongoRateLimitStore.registeredNames(),
  now = new Date()
} = {}) => {
  const results = [];
  for (const name of names) {
    const collection = `${prefix}${name}`;
    results.push({ collection, deletedCount: await MongoRateLimitStore.sweepCollection(collection, now) });
  }
  return results;
};

/**
 * Admin reset: drop counters across every named bucket, optionally only the
 * `_id`s matching `idPattern` (the store keys on `_id`).
 * @param {{prefix?: string, names?: string[], idPattern?: RegExp|string}} [opts]
 * @returns {Promise<Array<{collection: string, deletedCount: number}>>}
 */
exports.resetBuckets = async ({
  prefix = collectionPrefix(),
  names = MongoRateLimitStore.registeredNames(),
  idPattern
} = {}) => {
  const results = [];
  for (const name of names) {
    const collection = `${prefix}${name}`;
    results.push({ collection, deletedCount: await MongoRateLimitStore.resetCollection(collection, idPattern) });
  }
  return results;
};
```

- [ ] **Step 5: Port the affiliate test blocks spec §7.2.3 requires, plus the two RELAX cases.** Copy into `tests/middleware/rateLimiting.test.js`, from `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/unit/rateLimitingMiddleware.test.js`: the `createMongoStore` block (`L61-108`, 2 tests), the `createCustomLimiter` block (`L339-409`, 3 tests) and the `keyGenerator wiring` block reduced to the two cases that survive core's surface (`apiLimiter → ip`, `createCustomLimiter → ip`, from `L415-451`). Re-point their mocks to `jest.mock('express-rate-limit')` by name and `jest.mock('../../src/middleware/rateLimitMongoStore')` by core path. Then add:
```js
describe('RELAX_RATE_LIMITING guard (spec §7.2.3)', () => {
  it('logs the SECURITY: message at load when relaxed in production', () => {
    const prevRelax = process.env.RELAX_RATE_LIMITING;
    const prevEnv = process.env.NODE_ENV;
    process.env.RELAX_RATE_LIMITING = 'true';
    process.env.NODE_ENV = 'production';
    const logger = require('../../src/utils/logger');
    const spy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    try {
      jest.isolateModules(() => { require('../../src/middleware/rateLimiting'); });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('SECURITY:'));
    } finally {
      spy.mockRestore();
      if (prevRelax === undefined) delete process.env.RELAX_RATE_LIMITING; else process.env.RELAX_RATE_LIMITING = prevRelax;
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('RELAX_RATE_LIMITING=true raises the apiLimiter max to 500', () => {
    const prevRelax = process.env.RELAX_RATE_LIMITING;
    process.env.RELAX_RATE_LIMITING = 'true';
    try {
      let mod;
      jest.isolateModules(() => { mod = require('../../src/middleware/rateLimiting'); });
      expect(mod.isRelaxed).toBe(true);
    } finally {
      if (prevRelax === undefined) delete process.env.RELAX_RATE_LIMITING; else process.env.RELAX_RATE_LIMITING = prevRelax;
    }
  });
});
```
Record `before=<n> ported=<m> after=<n+m>` for `tests/middleware/rateLimiting.test.js` in the commit body (`grep -c "it(" tests/middleware/rateLimiting.test.js` before and after), the same review discipline the plan applies to the CSRF port in Task 43.

- [ ] **Step 6: Run it green, then the whole core suite.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/middleware/rateLimiting.test.js --runInBand
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -8
```
Expected: the rateLimiting file passes (pre-existing key-gen tests + 7 mechanism + the ported blocks + 2 RELAX); `npm test` reports `0 failed`. The export surface is unchanged — this task adds no top-level index key, so `tests/index.smoke.test.js` still passes at 28.

- [ ] **Step 7: Commit.**
```bash
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core add src/middleware/rateLimiting.js tests/middleware/rateLimiting.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core commit -m "$(cat <<'EOF'
core(rate-limit): LIMITER_NAMES + collectionNameFor + sweepExpired/resetBuckets (D17b)

Mechanism only in this commit — no collection renamed. sweepExpired is the
reclamation path now that the TTL index is opt-in; resetBuckets is what an
admin 'reset rate limits' must call to touch real counters. LIMITER_NAMES is a
LIVE getter: consumers must not destructure it at require time.

Also ports the affiliate's createMongoStore / createCustomLimiter / keyGenerator
blocks and adds the two RELAX_RATE_LIMITING cases (spec 7.2.3).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 41: web-core — delete the three dead limiters, and guard the app-policy limiters against early deletion

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/middleware/rateLimiting.js` — delete `exports.emailVerificationLimiter` (`:233-249`), `exports.fileUploadLimiter` (`:252-268`) and `exports.adminOperationLimiter` (`:271-294`) with their preceding comments; rewrite the comment above `contactFormBurstLimiter` (`:187-189`)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/middleware/rateLimiting.test.js` (new `v0.2.0 limiter surface` describe — 3 cases) + delete any case referencing the three removed limiters

**Interfaces:**
- Consumes: `rateLimiting.LIMITER_NAMES` (Task 40)
- Produces: `wc.rateLimiting` **without** `emailVerificationLimiter` / `fileUploadLimiter` / `adminOperationLimiter`, and **with** every app-policy limiter incl. `contactFormBurstLimiter` / `contactFormLimiter`. Consumed by Task 54's release gate.

- [ ] **Step 1: Prove the three are mounted nowhere before deleting them.**
```bash
grep -rn "emailVerificationLimiter\|fileUploadLimiter\|adminOperationLimiter" \
  /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/server/routes \
  /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/server/controllers \
  /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/server.js \
  /mnt/c/Users/rickh/GitHub/crhs-corporate/server.js \
  /mnt/c/Users/rickh/GitHub/crhs-corporate/server 2>/dev/null || echo "MOUNTED NOWHERE (expected)"
```
Expected: `MOUNTED NOWHERE (expected)`. (The affiliate's own inert copies at `server/middleware/rateLimiting.js:233,252,271` are deliberately excluded from this grep — they are deleted with the affiliate's policy module in Plan 4 PR B7.) **If anything is mounted, STOP** — the deletion is not safe and must move to Plan 4.

- [ ] **Step 2: Write the surface test.** Append to `tests/middleware/rateLimiting.test.js`:
```js
describe('v0.2.0 limiter surface (D17b)', () => {
  // Spec §7.2.3 "Deleted from core": these three are mounted nowhere in either
  // app (grep-verified) and go in v0.2.0.
  it('no longer exports the three dead limiters', () => {
    for (const k of ['emailVerificationLimiter', 'fileUploadLimiter', 'adminOperationLimiter']) {
      expect(rl[k]).toBeUndefined();
    }
  });

  // COPY-BEFORE-DELETE. The contact-form limiters are copied into corporate's own
  // server/middleware/rateLimitPolicy.js when the intake routes move (Plan 2 /
  // D2a) and into the affiliate's policy module in Plan 4 PR B7; core deletes its
  // copies in that same B7 release. Deleting them earlier loses the reviewed
  // numbers, and after B7 turns the affiliate copy into a shim it lands as
  // `Route.post() requires a callback function but got a [object Undefined]`.
  it('still exports the contact-form limiters and registers their buckets', () => {
    expect(typeof rl.contactFormBurstLimiter).toBe('function');
    expect(typeof rl.contactFormLimiter).toBe('function');
    expect(rl.LIMITER_NAMES).toEqual(expect.arrayContaining(['contact_burst', 'contact_hourly']));
  });

  it('still exports every other limiter an app or its policy copy depends on', () => {
    ['authLimiter', 'passwordResetLimiter', 'registrationLimiter', 'apiLimiter',
      'sensitiveOperationLimiter', 'adminLoginLimiter', 'conciergeLimiter',
      'createCustomLimiter'].forEach((k) => {
      expect(typeof rl[k]).toBe('function');
    });
  });
});
```

- [ ] **Step 3: Run it and confirm the expected mixed red.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/middleware/rateLimiting.test.js --runInBand -t 'v0.2.0 limiter surface'
```
Expected: `Tests: 1 failed, 2 passed` — only `no longer exports the three dead limiters` fails, with `expect(received).toBeUndefined() / Received: [Function]` on `emailVerificationLimiter`. The two survival cases pass, which is the point: they are green by construction and exist to go red if someone deletes a limiter early.

- [ ] **Step 4: Delete the three dead limiters.** In `src/middleware/rateLimiting.js`, remove each `exports.<name> = rateLimit({ … });` block in full together with the comment block immediately above it: `emailVerificationLimiter` (starting `:233`), `fileUploadLimiter` (starting `:252`), `adminOperationLimiter` (starting `:271`). Then remove any case in `tests/middleware/rateLimiting.test.js` that references them:
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && grep -n "emailVerificationLimiter\|fileUploadLimiter\|adminOperationLimiter" src/middleware/rateLimiting.js tests/middleware/rateLimiting.test.js
```
Expected after the edit: the only remaining hits are inside the new guard test's `for` list — nothing in `src/`.

- [ ] **Step 5: Record the copy-before-delete rule where the next deletion would happen.** Replace the comment at `:187-189` (above `contactFormBurstLimiter`) with:
```js
// Public contact form — burst guard. Catches double-clicks and basic
// flood attempts: 1 submission per 30 seconds per IP. Stacked under
// contactFormLimiter for hourly volume control.
//
// DO NOT DELETE IN v0.2.0 (D17b ships in two halves).
// Correction to a recurring review claim: deleting these does NOT break
// crhsent.com at require time — corporate's only wc.rateLimiting reference is
// `app.use('/api/', wc.rateLimiting.apiLimiter)` (crhs-corporate/server.js:77),
// and the affiliate mounts its contact limiters from its OWN
// server/middleware/rateLimiting.js copy. The real constraint is
// COPY-BEFORE-DELETE: corporate re-declares 'contact_burst'/'contact_hourly'
// via createCustomLimiter in its new server/middleware/rateLimitPolicy.js when
// the intake routes move (Plan 2 / D2a), copying windowMs/max/keyGenerator
// verbatim from here, and the affiliate does the same in Plan 4 PR B7 — which
// also turns its local copy into a shim, at which point a missing export here
// becomes `Route.post() requires a callback function but got a
// [object Undefined]` at require time. Core deletes these two — and the other
// app-policy limiters — in that Plan 4 PR B7 release, not before.
```

- [ ] **Step 6: Run the file, lint, and confirm GREEN.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/middleware/rateLimiting.test.js --runInBand && npx eslint src/middleware/rateLimiting.js
```
Expected: jest passes, all three guard cases green; eslint prints nothing.

- [ ] **Step 7: Prove the guard bites (manufactured RED), then revert.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && sed -i 's/^exports.contactFormLimiter =/exports.xcontactFormLimiter =/' src/middleware/rateLimiting.js && npx jest tests/middleware/rateLimiting.test.js --runInBand -t 'v0.2.0 limiter surface' 2>&1 | tail -15
```
Expected: `● … still exports the contact-form limiters and registers their buckets` with `expect(received).toBe(expected) / Expected: "function" / Received: "undefined"`, and `Tests: 1 failed, 2 passed`. **If it does NOT fail, the guard is inert — fix it before continuing.** Then revert:
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git checkout -- src/middleware/rateLimiting.js
```
⚠ That `git checkout --` discards the Step 4/5 edits too. Re-apply Steps 4 and 5 after the proof, or (preferred) run Step 7 **before** Step 4 on a clean file and re-run Step 6 afterwards. Confirm with `git diff --stat src/middleware/rateLimiting.js` that the intended deletions and the new comment are present before committing.

- [ ] **Step 8: Full suite and commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -8
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core add src/middleware/rateLimiting.js tests/middleware/rateLimiting.test.js
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core commit -m "$(cat <<'EOF'
core(rate-limit)!: delete the three dead limiters; guard the app-policy ones (D17b)

emailVerificationLimiter, fileUploadLimiter and adminOperationLimiter are mounted
nowhere in either app (grep evidence in the PR body) and go in v0.2.0, per spec
7.2.3's "Deleted from core".

The contact-form pair STAYS. Not because deleting it breaks boot — neither
consumer imports it from core — but copy-before-delete: corporate's
rateLimitPolicy.js lands in Plan 2, the affiliate's in Plan 4 PR B7, and core's
deletion goes with that B7 release. A guard test now fails if any of them is
removed early.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core push
```
Expected: `0 failed` before committing.

---

### Task 42: **HUMAN-CONFIRM** — document the rate-limit env keys, and hand the affiliate half to Plan 4

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/.env.example` (documentation only — **production-config reference, confirm before editing**)
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tasks/todo.md` (append the Plan-4 PR B7 hand-off)
- Test: none (documentation); the behaviour is covered by Tasks 37–39

**Interfaces:**
- Consumes: `MongoRateLimitStore.collectionPrefix()`, `.ensureTtlIndex` (Tasks 37, 38)
- Produces: the documented env contract — `RATE_LIMIT_COLLECTION_PREFIX` (default `ratelimit_`) and `RATE_LIMIT_TTL_INDEX` (default unset = off) — and the Plan-4 PR B7 work item, with the two defects review found in it

- [ ] **Step 1: Confirm with Rick before touching `.env.example`** (Global Constraint 17). Ask exactly: *"Add two documented-but-unset vars to .env.example — RATE_LIMIT_COLLECTION_PREFIX and RATE_LIMIT_TTL_INDEX? No prod .env change, no behaviour change: the portal keeps prefix `ratelimit_` and keeps the TTL index off."* Proceed only on an explicit yes.

- [ ] **Step 2: Add the documentation block.** Append under the existing rate-limiting section of `.env.example`:
```bash
# Rate-limit counter collections. Leave UNSET on the portal: the default prefix
# 'ratelimit_' is what the live buckets are already named, and setting a
# different value orphans every existing counter (it renames nothing).
# A second app sharing this database sets its own, e.g. ratelimit_corp_
# RATE_LIMIT_COLLECTION_PREFIX=ratelimit_
#
# Per-boot TTL index on the counter collections. Leave UNSET (off) on Oracle
# ADB: the createIndex is refused and swallowed for every limiter, in every PM2
# worker, at every boot, and the index never exists. Reclaim with a sweep
# instead (rateLimiting.sweepExpired(); the ops script lands in Plan 4 PR B7).
# RATE_LIMIT_TTL_INDEX=false
```

- [ ] **Step 3: Verify nothing in the prod environment changes.** The boxes' `.env` files are NOT edited by this task.
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git diff --stat
```
Expected: `.env.example` only, ~12 insertions.

- [ ] **Step 4: Write the Plan-4 PR B7 hand-off into `tasks/todo.md`.** Append:
```markdown
### Plan 4 — PR B7 (affiliate rate-limit adoption), handed off from Plan 1 Task 42

Plan 1 shipped the web-core MECHANISM only (collectionPrefix, opt-in TTL index,
sweepCollection/resetCollection, LIMITER_NAMES, collectionNameFor, sweepExpired,
resetBuckets) and deleted the three dead limiters. The affiliate half is B7:

- [ ] Replace `server/middleware/rateLimitMongoStore.js` and `server/middleware/rateLimiting.js`
      with shims over `@crhs/web-core`, plus a local policy module declaring the app's own
      limiters (copy `windowMs`/`max`/keyGenerator verbatim from core's current
      contactFormBurstLimiter `:190-206` and contactFormLimiter `:213-230` BEFORE core deletes them).
- [ ] `server/services/codeAttemptLockout.js:49` hand-builds `'ratelimit_' + STORE_NAME`, a second
      source of the collection name that ignores RATE_LIMIT_COLLECTION_PREFIX — read
      `getStore().collectionName` instead, and register `STORE_NAME = 'bag_codes'` at module load.
- [ ] Spec §7.6.3: `systemHealthService.resetRateLimits` deletes from a `rate_limits` collection
      keyed on `key`. The store writes `<prefix><name>` keyed on `_id` — so the admin control is a
      DOUBLE no-op today. Fan out over `LIMITER_NAMES` via `resetBuckets({ names, idPattern })`,
      escape regex metacharacters in the ip filter, and 400 on an unknown limiter name.
- [ ] `server/routes/administratorRoutes.js:197-238` carries an inline handler that shadows
      `administratorController.resetRateLimits` (mounted nowhere). Delete it; route to the controller.
      The response message becomes `Reset N rate limit entries`; update
      `tests/integration/administratorRoutes.test.js` — **there are exactly TWO occurrences**
      (`:44` and `:57`), verify with `grep -c 'rate limit records'` → `0` after the edit.
      `tests/unit/simpleRouteHandlers.test.js:49-84` builds its own throwaway router containing a
      copy of the deleted handler and stays green untouched — leave it to the Plan-4 test cull.
- [ ] Rewrite `scripts/admin/reset-rate-limits.js` onto the real buckets, add an `--expired` sweep
      mode, and export `{ parseArgs, run }` so the behaviour is under test.
- [ ] **`LIMITER_NAMES` IS A LIVE GETTER, NOT A SNAPSHOT.** Destructuring it at require time
      (`const { LIMITER_NAMES } = require('../middleware/rateLimiting')`) freezes the value before
      `codeAttemptLockout` registers `bag_codes`, so the admin reset silently skips the lockout
      counters and `--type bag_codes` always throws "Unknown rate limiter". Hold the module
      (`const rateLimiting = require(...)`), read `rateLimiting.LIMITER_NAMES` inside the function,
      and `require('./codeAttemptLockout')` (or the script's equivalent) before fanning out.
```

- [ ] **Step 5: Commit.**
```bash
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program add .env.example tasks/todo.md
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program commit -m "$(cat <<'EOF'
docs(env): document RATE_LIMIT_COLLECTION_PREFIX and RATE_LIMIT_TTL_INDEX (D17b)

Both intentionally unset in production: the portal keeps its live bucket names
and keeps the ADB-inert TTL index off. Also records the Plan 4 PR B7 hand-off,
including the LIMITER_NAMES live-getter trap and the two-not-three assertion
count in tests/integration/administratorRoutes.test.js.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Rollback (if the doc block is wrong or unwanted).**
```bash
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program revert --no-edit HEAD
```
No runtime impact either way — no code reads `.env.example`.

---
> **Group preamble for Tasks 43–46 (B3h, CSRF) — read before starting any of them.**
>
> **This is the co-requisite pair for boot-breaker #2.** `wavemax-affiliate-program/server/config/csrf-config.js` is a 5-line re-export (`:5` `module.exports = require('@crhs/web-core').csrf;`) and `server.js:20` destructures `{ conditionalCsrf, csrfTokenEndpoint }` from it, mounting them at `server.js:629` (`app.use(conditionalCsrf)`) and `server.js:632` (`app.get('/api/csrf-token', csrfTokenEndpoint)`). The moment web-core's `csrf` export shape becomes `{ createCsrf }`, both destructured names are `undefined`, `app.use(undefined)` throws, and **the portal does not start.** State in both PR bodies: **Task 44 and Task 45 ship in ONE release; `@crhs/web-core` v0.2.0 MUST NOT reach oci1 or oci2 before Task 45 is merged on `main`.**
>
> Corporate consumes `csrf` **nowhere** — verified: `grep -rn "csrf" crhs-corporate/server.js crhs-corporate/server/` returns zero hits. Corporate still needs `npm install --install-links` when v0.2.0 lands (it shares `/var/www/crhs-web-core`), but no corporate code change is required.
>
> **Two verified deviations, both evidence-backed, both carried into the PR bodies:**
>
> 1. **`createCsrf(...)` MUST return `CSRF_CONFIG` as well as the five keys spec §7.2.8 lists.** `tests/integration/v1PaymentRemoval.test.js:122-123` does `const { CSRF_CONFIG } = require('../../server/config/csrf-config'); expect(CSRF_CONFIG.REGISTRATION_ENDPOINTS).not.toContain(...)`, and `tests/unit/csrfConfig.test.js:2` imports `CSRF_CONFIG` from the same module. Dropping it turns two affiliate suites red. The factory therefore returns the resolved tables as `CSRF_CONFIG`.
> 2. **The five "retired" public-intake rows STAY in `csrfTables.js` for Plan 1** (`/api/concierge`, `/api/v1/partner-inquiry`, `/api/partner-inquiry`, `/api/v1/affiliate-application`, `/api/affiliate-application`). Spec §7.2.8 / §7.5 B4c prune them, but that row silently assumes the D6a (concierge) and D2a (intake) route removals have already happened — they have not. The routes are still mounted (`server.js:644` `/api/concierge`, `:703` `partnerInquiryRoutes`, `:704` `affiliateApplicationRoutes`) and `tests/integration/partnerInquiry.test.js:23-28` / `affiliateApplication.test.js:24-29` both POST with a **plain fetch, no CSRF token**, each carrying an explicit comment that dropping the exemption would 403 them. Pruning now 403s two live public marketing forms — a user-visible regression Plan 1 forbids. **They are deleted in Plan 3, in the same PR that deletes the routes**, and Task 45 pins them until then. Record this deviation in the Plan 1 exit gate (Task 58).
>
> **Measured baseline (do not re-derive):** `crhs-web-core/tests/config/csrfConfig.test.js` (382 lines, 47 `it(`) is byte-identical to `wavemax-affiliate-program/tests/unit/csrfConfig.test.js` (333 lines, 43 `it(`) except (a) the import path, (b) a 3-line header + `node-mocks-http` require, and (c) a trailing `describe('module exports')` block of **exactly 4 cases**. So `before=43 ported=4 after=47`, and the port is a pure copy of one block.

### Task 43: affiliate — port web-core's 4 uncovered CSRF cases into the affiliate suite (test-only, ships first)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/unit/csrfConfig.test.js` — head (`:1-4`, the import block) and tail (`:333-334`, append a `describe` before the closing `});`)
- Test: this task *is* the test change; the module under test is `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/server/config/csrf-config.js`

**Interfaces:**
- Consumes: `server/config/csrf-config.js` → `{ CSRF_CONFIG, shouldEnforceCsrf, conditionalCsrf, csrfProtection, csrfTokenEndpoint }` (today via the `wc.csrf` re-export; after Task 45 via `createCsrf`) — the four ported cases are the characterization tests that make Task 45's rewire safe.
- Produces: `tests/unit/csrfConfig.test.js` with 47 cases; `before=43 ported=4 after=47` recorded in the PR body. Consumed by Task 44 (which deletes the web-core original only after this commit exists).

- [ ] **Step 1: Record the `before` count that review gates on.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && grep -c "it(" tests/unit/csrfConfig.test.js
```
Expected output: `43`. The PR body line is `before=43 ported=4 after=47`, and review fails if `after < before`.

- [ ] **Step 2: Confirm the port set is exactly one block (no case is invented or dropped).**
```bash
diff /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/unit/csrfConfig.test.js \
     /mnt/c/Users/rickh/GitHub/crhs-web-core/tests/config/csrfConfig.test.js
```
Expected: three hunks only — `0a1,3` (header + `node-mocks-http` require), `3,4c6,10` (import path + three extra names), `334c340,382` (the `describe('module exports')` block, 4 `it(`). Nothing else. If a fourth hunk appears, STOP and re-diff before editing.

- [ ] **Step 3: Widen the affiliate suite's import block to the full export shape.**
Replace `tests/unit/csrfConfig.test.js:1-4`:
```js
const httpMocks = require('node-mocks-http');
const {
  CSRF_CONFIG,
  shouldEnforceCsrf,
  conditionalCsrf,
  csrfProtection,
  csrfTokenEndpoint
} = require('../../server/config/csrf-config');
```
(`node-mocks-http ^1.17.2` is already in the affiliate's `package.json:88` devDependencies — no install needed.)

- [ ] **Step 4: Append the 4 ported cases immediately before the file's final `});`.**
At the end of `tests/unit/csrfConfig.test.js` (currently `:334` `});`), insert this block *inside* the outer `describe('CSRF Configuration', …)`:
```js

  // Ported from crhs-web-core/tests/config/csrfConfig.test.js:343-381 (B4c,
  // spec §7.2.8): the export-shape cases web-core carried and this suite did
  // not. They are the characterization tests for the createCsrf({ tables })
  // rewire — conditionalCsrf and csrfTokenEndpoint must stay callable
  // middleware after server/config/csrf-config.js stops being a re-export,
  // because server.js:20 destructures both and mounts them at :629 and :632.
  describe('module exports', () => {
    it('exposes conditionalCsrf, csrfProtection, csrfTokenEndpoint as functions', () => {
      expect(typeof conditionalCsrf).toBe('function');
      expect(typeof csrfProtection).toBe('function');
      expect(typeof csrfTokenEndpoint).toBe('function');
    });

    it('conditionalCsrf calls next() for a request that does not require CSRF (GET)', () => {
      const mreq = httpMocks.createRequest({ method: 'GET', path: '/api/v1/orders' });
      const mres = httpMocks.createResponse();
      const next = jest.fn();
      conditionalCsrf(mreq, mres, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('csrfTokenEndpoint returns a token when a session is present', () => {
      const mreq = httpMocks.createRequest({
        method: 'GET',
        path: '/api/csrf-token',
        session: {},
        sessionID: 'sess-test-123'
      });
      mreq.ip = '127.0.0.1';
      const mres = httpMocks.createResponse();
      csrfTokenEndpoint(mreq, mres);
      const data = mres._getJSONData();
      expect(data.success).toBe(true);
      expect(typeof data.csrfToken).toBe('string');
      expect(data.csrfToken.length).toBeGreaterThan(0);
    });

    it('csrfTokenEndpoint returns 500 when no session is initialized', () => {
      const mreq = httpMocks.createRequest({ method: 'GET', path: '/api/csrf-token' });
      const mres = httpMocks.createResponse();
      csrfTokenEndpoint(mreq, mres);
      expect(mres.statusCode).toBe(500);
      expect(mres._getJSONData().success).toBe(false);
    });
  });
});
```

- [ ] **Step 5: Prove the new cases can fail (the red proof for a coverage port).**
Temporarily gut the shim, run the suite, and confirm the 4 new cases fail for the right reason:
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
cp server/config/csrf-config.js /tmp/csrf-config.bak
printf "module.exports = {};\n" > server/config/csrf-config.js
npx jest tests/unit/csrfConfig.test.js --runInBand 2>&1 | tail -25
```
Expected failure: the `module exports` block fails with `expect(typeof conditionalCsrf).toBe('function')` → `Received: "undefined"`, and `conditionalCsrf is not a function` / `csrfTokenEndpoint is not a function` `TypeError`s on the other three. This is exactly the `app.use(undefined)` boot failure the pair prevents. Restore:
```bash
cp /tmp/csrf-config.bak server/config/csrf-config.js && rm /tmp/csrf-config.bak
git diff --stat server/config/csrf-config.js
```
Expected: empty output (file restored byte-for-byte).

- [ ] **Step 6: Run the suite green against the unchanged shim.**
```bash
npx jest tests/unit/csrfConfig.test.js --runInBand 2>&1 | tail -8
grep -c "it(" tests/unit/csrfConfig.test.js
```
Expected: `Tests: 47 passed, 47 total`, `Test Suites: 1 passed`; the grep prints `47`.

- [ ] **Step 7: Commit the port.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git add tests/unit/csrfConfig.test.js
git commit -m "$(cat <<'EOF'
test(csrf): port web-core's 4 export-shape cases into the affiliate suite (B4c prep)

Characterization tests for the createCsrf({ tables }) rewire. Copied verbatim
from crhs-web-core/tests/config/csrfConfig.test.js:343-381, the only cases the
affiliate suite did not already carry (the two files are otherwise identical
except the import path).

before=43 ported=4 after=47

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 44: web-core — `csrf-config.js` becomes `createCsrf({ tables })`, route tables deleted (B3h)

**Files:**
- Create: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/config/csrfPrimitive.test.js`
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/config/csrf-config.js` — `:1-10` header, delete `:56-184` (the `CSRF_CONFIG` literal; the object closes at **`:184`**, not `:190` as the spec text says), wrap `:186-346` in the factory, replace `:348-358` export block. `:12-54` (`doubleCsrf` wiring) is untouched.
- Delete: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/config/csrfConfig.test.js` (47 cases; they live in the affiliate suite as of Task 43)
- Test: `tests/config/csrfPrimitive.test.js` (11 cases)

**Interfaces:**
- Consumes: `csrf-csrf@^4.0.3` `doubleCsrf`, `../utils/auditLogger`, `../utils/logger` (all unchanged); Task 43's committed port.
- Produces: `module.exports = { createCsrf, CSRF_COOKIE_NAME }` from `src/config/csrf-config.js`, i.e. `wc.csrf.createCsrf`.
  `createCsrf({ tables = {}, phase = () => process.env.CSRF_PHASE } = {}) → { CSRF_CONFIG, csrfProtection, conditionalCsrf, csrfTokenEndpoint, shouldEnforceCsrf, generateCsrfToken }`
  `tables: { PUBLIC_ENDPOINTS, AUTH_ENDPOINTS, REGISTRATION_ENDPOINTS, CRITICAL_ENDPOINTS, HIGH_PRIORITY_ENDPOINTS, READ_ONLY_ENDPOINTS }`, each optional, default `[]`.
  `shouldEnforceCsrf(req)` keeps today's order: GET/HEAD/OPTIONS never → PUBLIC → AUTH/REGISTRATION → CRITICAL → HIGH_PRIORITY gated by `phase() >= 2` → READ_ONLY → default **enforce**.
  Consumed by Task 45.
- Unchanged: `src/index.js:61` `def('csrf', () => require('./config/csrf-config'));` — the key stays, so the export surface is unaffected here. **Do not bump `package.json` version** — the `v0.2.0` tag is Task 54.

- [ ] **Step 0: Record the pre-B3h SHA of `crhs-web-core` — Task 45 reads the tables out of it.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git rev-parse HEAD
```
Write it down as `<PRE_B3H_SHA>` and paste it into this task's and Task 45's PR bodies. **Do not rely on `HEAD~1`** — Tasks 13–41 and 47–49 also commit to this repo, so `HEAD~1` will not be the pre-B3h state when Task 45 runs.

- [ ] **Step 1: Write the failing primitive test.**
Create `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/config/csrfPrimitive.test.js`:
```js
// Primitive-level tests for createCsrf({ tables }) (spec §7.2.8, PR B3h).
// The route policy left this repo: the 47 table-driven cases now live in
// wavemax-affiliate-program/tests/unit/csrfConfig.test.js. What core owes its
// consumers is the *machinery* — table defaulting, match order, the phase gate,
// and the token endpoint / audit behaviour.
const httpMocks = require('node-mocks-http');

jest.mock('../../src/utils/auditLogger', () => ({
  logSuspiciousActivity: jest.fn()
}));
const auditLogger = require('../../src/utils/auditLogger');
const { createCsrf } = require('../../src/config/csrf-config');

const TABLES = {
  PUBLIC_ENDPOINTS: ['/api/health', '/api/v1/affiliates/:affiliateId/public'],
  AUTH_ENDPOINTS: ['/api/v1/auth/affiliate/login'],
  REGISTRATION_ENDPOINTS: ['/api/v1/customers/claim/:bagToken/register'],
  CRITICAL_ENDPOINTS: ['/api/v1/orders/:orderId/cancel'],
  HIGH_PRIORITY_ENDPOINTS: ['/api/v1/affiliates/:affiliateId'],
  READ_ONLY_ENDPOINTS: ['/api/v1/operators/dashboard']
};

describe('createCsrf', () => {
  beforeEach(() => {
    delete process.env.CSRF_PHASE;
  });

  it('is a function and returns the documented export shape', () => {
    expect(typeof createCsrf).toBe('function');
    const csrf = createCsrf({ tables: TABLES });
    expect(typeof csrf.shouldEnforceCsrf).toBe('function');
    expect(typeof csrf.conditionalCsrf).toBe('function');
    expect(typeof csrf.csrfTokenEndpoint).toBe('function');
    expect(typeof csrf.csrfProtection).toBe('function');
    expect(typeof csrf.generateCsrfToken).toBe('function');
    expect(csrf.CSRF_CONFIG).toEqual(TABLES);
  });

  it('defaults every table to [] when called with no arguments', () => {
    const { CSRF_CONFIG } = createCsrf();
    expect(CSRF_CONFIG).toEqual({
      PUBLIC_ENDPOINTS: [],
      AUTH_ENDPOINTS: [],
      REGISTRATION_ENDPOINTS: [],
      CRITICAL_ENDPOINTS: [],
      HIGH_PRIORITY_ENDPOINTS: [],
      READ_ONLY_ENDPOINTS: []
    });
  });

  it('with empty tables enforces every state-changing request and no GET', () => {
    const { shouldEnforceCsrf } = createCsrf();
    expect(shouldEnforceCsrf({ method: 'POST', path: '/api/v1/anything' })).toBe(true);
    expect(shouldEnforceCsrf({ method: 'PUT', path: '/api/v1/anything' })).toBe(true);
    expect(shouldEnforceCsrf({ method: 'DELETE', path: '/api/v1/anything' })).toBe(true);
    expect(shouldEnforceCsrf({ method: 'GET', path: '/api/v1/anything' })).toBe(false);
    expect(shouldEnforceCsrf({ method: 'HEAD', path: '/api/v1/anything' })).toBe(false);
    expect(shouldEnforceCsrf({ method: 'OPTIONS', path: '/api/v1/anything' })).toBe(false);
  });

  it('bypasses PUBLIC, AUTH and REGISTRATION tables', () => {
    const { shouldEnforceCsrf } = createCsrf({ tables: TABLES });
    expect(shouldEnforceCsrf({ method: 'POST', path: '/api/health' })).toBe(false);
    expect(shouldEnforceCsrf({ method: 'POST', path: '/api/v1/auth/affiliate/login' })).toBe(false);
    expect(shouldEnforceCsrf({ method: 'POST', path: '/api/v1/customers/claim/abc123/register' })).toBe(false);
  });

  it('matches :param patterns in both directions', () => {
    const { shouldEnforceCsrf } = createCsrf({ tables: TABLES });
    expect(shouldEnforceCsrf({ method: 'POST', path: '/api/v1/orders/ORD-123-xyz/cancel' })).toBe(true);
    expect(shouldEnforceCsrf({ method: 'POST', path: '/api/v1/affiliates/AFF-9/public' })).toBe(false);
    // a :param segment never spans a slash
    expect(shouldEnforceCsrf({ method: 'POST', path: '/api/v1/orders/a/b/cancel' })).toBe(true);
  });

  it('does not enforce on READ_ONLY table entries', () => {
    const { shouldEnforceCsrf } = createCsrf({ tables: TABLES });
    expect(shouldEnforceCsrf({ method: 'POST', path: '/api/v1/operators/dashboard' })).toBe(false);
  });

  it('gates HIGH_PRIORITY on the injected phase()', () => {
    const req = { method: 'PUT', path: '/api/v1/affiliates/AFF-1' };
    expect(createCsrf({ tables: TABLES, phase: () => 1 }).shouldEnforceCsrf(req)).toBe(false);
    expect(createCsrf({ tables: TABLES, phase: () => 2 }).shouldEnforceCsrf(req)).toBe(true);
    expect(createCsrf({ tables: TABLES, phase: () => undefined }).shouldEnforceCsrf(req)).toBe(false);
    expect(createCsrf({ tables: TABLES, phase: () => 'invalid' }).shouldEnforceCsrf(req)).toBe(false);
  });

  it('defaults phase() to process.env.CSRF_PHASE', () => {
    const { shouldEnforceCsrf } = createCsrf({ tables: TABLES });
    const req = { method: 'PUT', path: '/api/v1/affiliates/AFF-1' };
    expect(shouldEnforceCsrf(req)).toBe(false);
    process.env.CSRF_PHASE = '2';
    expect(shouldEnforceCsrf(req)).toBe(true);
  });

  it('conditionalCsrf calls next() for a non-enforced request', () => {
    const { conditionalCsrf } = createCsrf({ tables: TABLES });
    const req = httpMocks.createRequest({ method: 'GET', path: '/api/v1/orders' });
    const res = httpMocks.createResponse();
    const next = jest.fn();
    conditionalCsrf(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('conditionalCsrf 403s a missing token and records a suspicious-activity audit event', () => {
    const { conditionalCsrf } = createCsrf({ tables: TABLES });
    const req = httpMocks.createRequest({
      method: 'POST',
      path: '/api/v1/orders/ORD-1/cancel',
      sessionID: 'sess-1'
    });
    req.ip = '127.0.0.1';
    const res = httpMocks.createResponse();
    const next = jest.fn();
    conditionalCsrf(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res._getJSONData().code).toBe('CSRF_VALIDATION_FAILED');
    expect(auditLogger.logSuspiciousActivity).toHaveBeenCalledWith(
      'CSRF_VALIDATION_FAILED',
      expect.objectContaining({ path: '/api/v1/orders/ORD-1/cancel', method: 'POST' }),
      req
    );
  });

  it('csrfTokenEndpoint issues a token with a session and 500s without one', () => {
    const { csrfTokenEndpoint } = createCsrf({ tables: TABLES });

    const ok = httpMocks.createRequest({
      method: 'GET', path: '/api/csrf-token', session: {}, sessionID: 'sess-2'
    });
    ok.ip = '127.0.0.1';
    const okRes = httpMocks.createResponse();
    csrfTokenEndpoint(ok, okRes);
    expect(okRes._getJSONData().success).toBe(true);
    expect(typeof okRes._getJSONData().csrfToken).toBe('string');

    const bad = httpMocks.createRequest({ method: 'GET', path: '/api/csrf-token' });
    const badRes = httpMocks.createResponse();
    csrfTokenEndpoint(bad, badRes);
    expect(badRes.statusCode).toBe(500);
    expect(badRes._getJSONData().success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails for the right reason.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
npx jest tests/config/csrfPrimitive.test.js --runInBand 2>&1 | tail -20
```
Expected failure: every case fails at `const { createCsrf } = require('../../src/config/csrf-config');` usage — `TypeError: createCsrf is not a function`, and the first case's `expect(typeof createCsrf).toBe('function')` shows `Received: "undefined"`. The module today exports `{ CSRF_CONFIG, csrfProtection, conditionalCsrf, csrfTokenEndpoint, shouldEnforceCsrf }` (`src/config/csrf-config.js:349-358`).

- [ ] **Step 3: Rewrite the header comment (`src/config/csrf-config.js:1-10`) to describe the primitive.**
```js
/**
 * CSRF primitive — double-submit-cookie machinery, no route policy.
 *
 * SEC M-5 (closed): migrated from the deprecated `csurf` package to
 * `csrf-csrf` (double-submit-cookie pattern, actively maintained).
 *
 * The route tables used to live here (PUBLIC/AUTH/REGISTRATION/CRITICAL/
 * HIGH_PRIORITY/READ_ONLY). They are application policy, not shared
 * infrastructure, so they now live in the consuming app — the affiliate keeps
 * them in server/config/csrfTables.js and passes them to createCsrf({ tables }).
 * Adding an app route no longer needs a @crhs/web-core release (spec §7.2.8,
 * D20). Enforcement order, error handling and audit behaviour are unchanged.
 */
```

- [ ] **Step 4: Delete the table literal (`:56-184`) and open the factory over the logic block.**
Delete the whole `// Define endpoint categories for CSRF protection` comment plus the `const CSRF_CONFIG = { … };` literal (`:56` through `:184` inclusive — the object's closing `};` is on `:184`; do **not** delete into `:186`'s `shouldEnforceCsrf` comment). In its place, and wrapping `shouldEnforceCsrf` / `conditionalCsrf` / `csrfTokenEndpoint`, insert the factory opening:
```js
const EMPTY_TABLES = {
  PUBLIC_ENDPOINTS: [],
  AUTH_ENDPOINTS: [],
  REGISTRATION_ENDPOINTS: [],
  CRITICAL_ENDPOINTS: [],
  HIGH_PRIORITY_ENDPOINTS: [],
  READ_ONLY_ENDPOINTS: []
};

/**
 * Build a CSRF enforcement bundle over an application's own route tables.
 *
 * @param {Object}   [opts]
 * @param {Object}   [opts.tables]  Any subset of the six endpoint arrays; each
 *                                  missing key defaults to []. Entries may use
 *                                  Express `:param` segments (one path segment).
 * @param {Function} [opts.phase]   Returns the CSRF rollout phase; HIGH_PRIORITY
 *                                  endpoints are enforced when phase() >= 2.
 *                                  Defaults to () => process.env.CSRF_PHASE.
 * @returns {{CSRF_CONFIG:Object, csrfProtection:Function, conditionalCsrf:Function,
 *            csrfTokenEndpoint:Function, shouldEnforceCsrf:Function,
 *            generateCsrfToken:Function}}
 */
function createCsrf({ tables = {}, phase = () => process.env.CSRF_PHASE } = {}) {
  const CSRF_CONFIG = { ...EMPTY_TABLES, ...tables };
```
Indent the existing `shouldEnforceCsrf` (`:187-238`), `conditionalCsrf` (`:241-316`) and `csrfTokenEndpoint` (`:325-346`) bodies one level into the factory **without changing a statement**, except the one phase line: `:228` `return process.env.CSRF_PHASE >= 2;` becomes:
```js
      return phase() >= 2;
```
(`undefined >= 2` and `'invalid' >= 2` are both `false`, so the two edge cases the affiliate suite pins keep their answers.)

- [ ] **Step 5: Close the factory and replace the export block (`:348-358`).**
```js
  return {
    CSRF_CONFIG,
    // Backwards-compat alias: callers that imported `csrfProtection` get
    // the doubleCsrfProtection middleware. Same call signature, same
    // request semantics.
    csrfProtection: doubleCsrfProtection,
    conditionalCsrf,
    csrfTokenEndpoint,
    shouldEnforceCsrf,
    generateCsrfToken
  };
}

// The cookie/secret wiring above is module-level and shared by every bundle:
// one cookie name and one HMAC secret per process, as today.
module.exports = { createCsrf, CSRF_COOKIE_NAME };
```

- [ ] **Step 6: Run the primitive test and confirm PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
npx jest tests/config/csrfPrimitive.test.js --runInBand 2>&1 | tail -8
```
Expected: `Tests: 11 passed, 11 total`, `Test Suites: 1 passed, 1 total`.

- [ ] **Step 7: Delete the superseded table-driven suite.**
The 47 cases in `tests/config/csrfConfig.test.js` assert route policy that no longer lives in this repo; they were ported into the affiliate suite in Task 43 (verify that commit exists before deleting).
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git log --oneline -1 -- tests/unit/csrfConfig.test.js
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git rm tests/config/csrfConfig.test.js
```
Expected: the affiliate `git log` line is the Task 43 port commit; `git rm` prints `rm 'tests/config/csrfConfig.test.js'`.

- [ ] **Step 8: Run the whole web-core suite.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -12
```
Expected: `0 failed`, and the total is the count measured immediately before this task **−47 +11**, with one fewer suite file. `tests/index.smoke.test.js` is unaffected — `src/index.js:61` still reads `def('csrf', () => require('./config/csrf-config'));`.

- [ ] **Step 9: Prove no `/api/v1/` literal survives in the primitive (spec D20 acceptance).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && grep -c "/api/v1/" src/config/csrf-config.js
```
Expected: `0` (grep exits 1 with `0` printed). If non-zero, a table row was left behind — delete it before committing.

- [ ] **Step 10: Lint and commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
npx eslint src/config/csrf-config.js tests/config/csrfPrimitive.test.js
git add src/config/csrf-config.js tests/config/csrfPrimitive.test.js tests/config/csrfConfig.test.js
git commit -m "$(cat <<'EOF'
feat(csrf)!: csrf-config becomes createCsrf({ tables }) — route policy leaves core (B3h)

BREAKING: wc.csrf now exports { createCsrf, CSRF_COOKIE_NAME } instead of
{ CSRF_CONFIG, csrfProtection, conditionalCsrf, csrfTokenEndpoint,
shouldEnforceCsrf }. The doubleCsrf wiring (secret chain, __Host-x-csrf cookie,
six accepted headers) is unchanged; the six route tables are deleted and are now
supplied by the consumer.

createCsrf also returns CSRF_CONFIG (the resolved tables) — required by the
affiliate, whose tests/integration/v1PaymentRemoval.test.js:122 and
tests/unit/csrfConfig.test.js:2 import it from server/config/csrf-config.

CO-REQUISITE: affiliate PR B4c (server/config/csrfTables.js + createCsrf call).
v0.2.0 must NOT reach a box before B4c is merged — server.js:20 destructures
{ conditionalCsrf, csrfTokenEndpoint } and mounts them at :629/:632, so the old
consumer against this core would app.use(undefined) and fail to boot.

tests/config/csrfConfig.test.js (47 table cases) deleted; they live in
wavemax-affiliate-program/tests/unit/csrfConfig.test.js as of the B4c prep
commit. New tests/config/csrfPrimitive.test.js (11) covers the machinery.

Pre-B3h SHA for the table move: <PRE_B3H_SHA>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 45: affiliate — `server/config/csrfTables.js` + `createCsrf({ tables })` rewire (B4c)

**Files:**
- Create: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/server/config/csrfTables.js`
- Create: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/unit/csrfTables.test.js`
- Create: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/integration/csrfTokenEndpoint.test.js`
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/server/config/csrf-config.js` — all 5 lines replaced
- Unchanged (must stay unchanged — that is the point): `server.js:20`, `server.js:629`, `server.js:632`
- Test: `tests/unit/csrfTables.test.js`, `tests/unit/csrfConfig.test.js` (47, from Task 43), `tests/integration/csrfTokenEndpoint.test.js`, `tests/integration/partnerInquiry.test.js`, `tests/integration/affiliateApplication.test.js`, `tests/integration/v1PaymentRemoval.test.js`

**Interfaces:**
- Consumes: `require('@crhs/web-core').csrf.createCsrf({ tables, phase? })` (Task 44), and `<PRE_B3H_SHA>` from Task 44 Step 0.
- Produces:
  - `server/config/csrfTables.js` → `{ PUBLIC_ENDPOINTS, AUTH_ENDPOINTS, REGISTRATION_ENDPOINTS, CRITICAL_ENDPOINTS, HIGH_PRIORITY_ENDPOINTS, READ_ONLY_ENDPOINTS }` (six `string[]`, 60 rows total).
  - `server/config/csrf-config.js` → `{ CSRF_CONFIG, csrfProtection, conditionalCsrf, csrfTokenEndpoint, shouldEnforceCsrf, generateCsrfToken }` — a **superset** of today's five keys, so `server.js:20`'s destructure and `tests/integration/v1PaymentRemoval.test.js:122` keep working with no edit.

- [ ] **Step 1: Write the failing tables test.**
Create `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/unit/csrfTables.test.js`:
```js
// B4c (spec §7.2.8 / D20): the CSRF route policy is this app's, not web-core's.
// server/config/csrfTables.js owns the six tables; server/config/csrf-config.js
// is a thin call to wc.csrf.createCsrf({ tables }) and must keep exporting the
// exact names server.js:20 destructures and mounts at :629 / :632.
const tables = require('../../server/config/csrfTables');
const csrf = require('../../server/config/csrf-config');
const webCore = require('@crhs/web-core');

const CATEGORIES = [
  'PUBLIC_ENDPOINTS',
  'AUTH_ENDPOINTS',
  'REGISTRATION_ENDPOINTS',
  'CRITICAL_ENDPOINTS',
  'HIGH_PRIORITY_ENDPOINTS',
  'READ_ONLY_ENDPOINTS'
];

describe('server/config/csrfTables', () => {
  it('exports all six categories as non-empty arrays of /api paths', () => {
    CATEGORIES.forEach((key) => {
      expect(Array.isArray(tables[key])).toBe(true);
      expect(tables[key].length).toBeGreaterThan(0);
      tables[key].forEach((endpoint) => expect(endpoint).toMatch(/^\/api/));
    });
  });

  it('has no duplicate endpoint across categories', () => {
    const all = CATEGORIES.flatMap((key) => tables[key]);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('server/config/csrf-config wiring', () => {
  it('is built from csrfTables, not from a web-core table', () => {
    expect(csrf.CSRF_CONFIG).toEqual(tables);
  });

  it('still exports the names server.js:20 destructures', () => {
    expect(typeof csrf.conditionalCsrf).toBe('function');
    expect(typeof csrf.csrfTokenEndpoint).toBe('function');
    expect(typeof csrf.shouldEnforceCsrf).toBe('function');
    expect(typeof csrf.csrfProtection).toBe('function');
  });

  it('web-core exposes only the primitive — the policy has left the library', () => {
    expect(typeof webCore.csrf.createCsrf).toBe('function');
    expect(webCore.csrf.CSRF_CONFIG).toBeUndefined();
  });

  it('enforces and exempts exactly as before the move', () => {
    expect(csrf.shouldEnforceCsrf({ method: 'POST', path: '/api/v1/orders/ORD-1/cancel' })).toBe(true);
    expect(csrf.shouldEnforceCsrf({ method: 'GET', path: '/api/v1/orders' })).toBe(false);
    expect(csrf.shouldEnforceCsrf({ method: 'POST', path: '/api/v1/auth/affiliate/login' })).toBe(false);
  });

  // PLAN 3 GUARD — do NOT prune these five rows here.
  // The routes are still mounted (server.js:644 /api/concierge, :703
  // partnerInquiryRoutes, :704 affiliateApplicationRoutes) and their public
  // pages POST with a plain fetch, no CSRF token. Dropping the exemption now
  // 403s two live marketing forms and reds tests/integration/partnerInquiry.js
  // and affiliateApplication.js. They are deleted in Plan 3, in the same PR
  // that deletes the routes.
  it('keeps the credential-free public intake routes exempt while they are mounted', () => {
    ['/api/concierge',
      '/api/v1/partner-inquiry',
      '/api/partner-inquiry',
      '/api/v1/affiliate-application',
      '/api/affiliate-application'].forEach((endpoint) => {
      expect(tables.PUBLIC_ENDPOINTS).toContain(endpoint);
      expect(csrf.shouldEnforceCsrf({ method: 'POST', path: endpoint })).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Refresh the affiliate's installed copy of web-core, then run the tables test RED.**
Since Task 5 this app's `node_modules/@crhs/web-core` is a real **COPY** (`.npmrc install-links=true`), not the pre-Plan-1 symlink, so a web-core edit is invisible here until it is reinstalled. Skip this and Step 5's rewire evaluates `require('@crhs/web-core').csrf.createCsrf` against the STALE module: `createCsrf` is `undefined`, `module.exports = createCsrf({ tables })` throws `TypeError: createCsrf is not a function` at require time, and `server.js:20` (mounted at `:629`/`:632`) takes the whole app down.
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
test -L node_modules/@crhs/web-core && echo "SYMLINK — Task 5 has not landed, STOP" || echo COPY
rm -rf node_modules/@crhs/web-core && npm install --install-links 2>&1 | tail -3
node -p "typeof require('@crhs/web-core').csrf.createCsrf"
git checkout -- package-lock.json
npx jest tests/unit/csrfTables.test.js --runInBand 2>&1 | tail -15
```
Expected: `COPY`, then `function`, then `Test suite failed to run — Cannot find module '../../server/config/csrfTables' from 'tests/unit/csrfTables.test.js'`. **If `node -p` prints `undefined`, the refresh did not take — do NOT continue to Step 5.**

- [ ] **Step 3: Create `server/config/csrfTables.js` with the tables moved verbatim.**
Body = `crhs-web-core` `src/config/csrf-config.js:57-184` as it stood at `<PRE_B3H_SHA>` (recoverable with `git -C /mnt/c/Users/rickh/GitHub/crhs-web-core show <PRE_B3H_SHA>:src/config/csrf-config.js | sed -n '57,184p'`), renamed to a plain module export, with the header and the Plan 3 marker added:
```js
/**
 * CSRF route policy for the affiliate portal.
 *
 * Moved out of @crhs/web-core in PR B4c (spec §7.2.8 / D20): these paths are
 * this application's routes, so a new route must not require a shared-library
 * release. web-core now supplies only the double-submit-cookie primitive, and
 * server/config/csrf-config.js passes these tables to createCsrf({ tables }).
 *
 * Match semantics (implemented in web-core): a `:param` segment matches exactly
 * one path segment; everything else is an exact string match.
 */
module.exports = {
  // Truly public endpoints that should NEVER require CSRF
  PUBLIC_ENDPOINTS: [
    // Public information endpoints (GET only)
    '/api/v1/affiliates/:affiliateId/public',
    '/api/affiliates/:affiliateId/public',

    // Health check endpoints
    '/api/health',
    '/api/v1/health',

    // ---- PLAN 3: the next five rows retire WITH their routes, not before ----
    // server.js:644 (/api/concierge), :703 (partnerInquiryRoutes), :704
    // (affiliateApplicationRoutes) are still mounted, and the public pages POST
    // with a plain fetch (no token). Pruning these rows while the routes live
    // returns 403 on two live marketing forms and reds
    // tests/integration/partnerInquiry.test.js + affiliateApplication.test.js.
    // Delete them in the Plan 3 PR that deletes the routes. Pinned by
    // tests/unit/csrfTables.test.js.

    // Public concierge — credential-free, no ambient cookie/session, so it is
    // not a CSRF target (an attacker's forged POST gains nothing). Same-origin
    // from the design-explorer pages; abuse is bounded by conciergeLimiter.
    '/api/concierge',

    // Scan-session engine (PR 4) — public/credential-light: /session is gated
    // by a one-time role code + lockout; resolve/apply/undo are gated by
    // scanAuth (operator JWT or scan-session token). None carries an ambient
    // cookie credential, so CSRF gains an attacker nothing — same rationale as
    // the retired bag-URL flow (the phone's camera opens the page with no
    // session/cookie).
    '/api/v1/scan/session',
    '/api/v1/scan/resolve',
    '/api/v1/scan/apply',
    '/api/v1/scan/undo',

    // Customer self-service edit (Edit my info) — authorized by the same
    // scan-session token (x-scan-session header), no ambient cookie, same
    // CSRF rationale as the scan engine above.
    '/api/v1/customers/me',

    // Partner-program inquiry form — public marketing landing on the
    // per-location domains. Credential-free, no ambient cookie/session, so a
    // forged POST gains an attacker nothing (same rationale as /api/concierge
    // above). Abuse is bounded by contactFormBurstLimiter + contactFormLimiter
    // on the route. Lets the static cached page submit with a plain fetch.
    '/api/v1/partner-inquiry',
    '/api/partner-inquiry',

    // Affiliate application form — same rationale as partner-inquiry above
    // (credential-free public form, rate-limited on the route).
    '/api/v1/affiliate-application',
    '/api/affiliate-application'
  ],

  // Authentication endpoints - rate limited instead of CSRF
  AUTH_ENDPOINTS: [
    '/api/auth/affiliate/login',
    '/api/auth/administrator/login',
    '/api/auth/operator/login',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/refresh-token',
    '/api/v1/auth/affiliate/login',
    '/api/v1/auth/administrator/login',
    '/api/v1/auth/operator/login',
    '/api/v1/auth/forgot-password',
    '/api/v1/auth/reset-password',
    '/api/v1/auth/refresh-token',
    // Password change endpoints (part of auth flow)
    '/api/v1/administrators/change-password',
    '/api/v1/affiliates/change-password',
    '/api/v1/operators/change-password'
  ],

  // Registration endpoints - CAPTCHA instead of CSRF
  REGISTRATION_ENDPOINTS: [
    '/api/affiliates/register',
    '/api/v1/affiliates/register',
    '/api/v1/customers/claim/:bagToken/register'
  ],

  // CRITICAL endpoints that MUST have CSRF protection (Phase 1)
  CRITICAL_ENDPOINTS: [
    // Logout (prevents logout CSRF)
    '/api/v1/auth/logout',

    // Order management
    '/api/v1/orders',
    '/api/v1/orders/:orderId',
    '/api/v1/orders/:orderId/status',
    '/api/v1/orders/:orderId/cancel',
    '/api/v1/orders/:orderId/payment-status',

    // Data deletion
    '/api/v1/affiliates/:affiliateId/delete-all-data',

    // Admin operations
    '/api/v1/administrators/affiliates',
    '/api/v1/administrators/operators',
    '/api/v1/administrators/operators/:operatorId',
    '/api/v1/operators/:operatorId/scan-code/reset',
    '/api/v1/administrators/config',

    // Operator critical actions
    '/api/v1/operators/orders/:orderId/claim',
    '/api/v1/operators/orders/:orderId/status',
    '/api/v1/operators/orders/:orderId/quality-check',
    '/api/v1/operators/shift/status',

    // Bag admin mutations (mint/issue/print-run — spec §5)
    '/api/v1/bags/mint',
    '/api/v1/bags/batch/:batchId/issue',
    '/api/v1/bags/print-run'
  ],

  // HIGH priority endpoints (Phase 2 — gated by CSRF_PHASE >= 2)
  HIGH_PRIORITY_ENDPOINTS: [
    // Profile updates
    '/api/v1/affiliates/:affiliateId'
  ],

  // READ-ONLY endpoints that can remain without CSRF
  READ_ONLY_ENDPOINTS: [
    // Dashboard data (GET only)
    '/api/v1/affiliates/:affiliateId/dashboard',
    '/api/v1/operators/dashboard',
    '/api/v1/administrators/dashboard',

    // List/search endpoints (GET only)
    '/api/v1/affiliates/:affiliateId/customers',
    '/api/v1/affiliates/:affiliateId/orders',
    '/api/v1/orders/search',
    '/api/v1/orders/statistics',
    '/api/v1/orders/export'
  ]
};
```

- [ ] **Step 4: Prove the tables are a faithful move (no row silently gained or lost).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
node -e "
const t = require('./server/config/csrfTables');
const rows = Object.values(t).flat().sort();
console.log('rows=', rows.length);
"
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core show <PRE_B3H_SHA>:src/config/csrf-config.js \
  | sed -n "57,184p" | grep -cE "^\s+'/api"
```
Expected: both print the same number (`rows= 60` and `60`). If they differ, a row was dropped or duplicated in the copy — fix before continuing. **Use `<PRE_B3H_SHA>`, not `HEAD~1`** — several other tasks commit to web-core between Task 44 and this one.

- [ ] **Step 5: Rewire `server/config/csrf-config.js` to the factory.**
Replace all 5 lines with:
```js
// CSRF enforcement for the portal. web-core supplies the double-submit-cookie
// primitive (secret chain, __Host-x-csrf cookie, accepted header list); the
// route policy is ours and lives in ./csrfTables.js, so adding a route no
// longer needs a @crhs/web-core release (spec §7.2.8 / D20, PR B4c).
//
// The returned object is a superset of the previous re-export shape, so
// server.js:20's `const { conditionalCsrf, csrfTokenEndpoint } = require(...)`
// and its mounts at server.js:629 / :632 are unchanged.
const { createCsrf } = require('@crhs/web-core').csrf;

module.exports = createCsrf({ tables: require('./csrfTables') });
```

- [ ] **Step 6: Run the tables test and the ported 47-case suite together — expect PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npx jest tests/unit/csrfTables.test.js tests/unit/csrfConfig.test.js --runInBand 2>&1 | tail -10
```
Expected: `Test Suites: 2 passed, 2 total`, `Tests: 53 passed, 53 total` (47 ported + 6 new).

- [ ] **Step 7: Add the boot smoke assertion (the exact check that would have caught boot-breaker #2).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
node -e "const c=require('./server/config/csrf-config');if(typeof c.conditionalCsrf!=='function'||typeof c.csrfTokenEndpoint!=='function')process.exit(1);console.log('csrf export shape OK');" ; echo "exit=$?"
```
Expected: prints `csrf export shape OK`, `exit=0`. This is the command Task 55 re-runs on each box after `npm install --install-links` and **before** `pm2 reload`.

- [ ] **Step 8: Write the `/api/csrf-token` integration test.**
Create `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/integration/csrfTokenEndpoint.test.js`:
```js
// End-to-end guard for the B4c rewire: server.js:632 mounts
// csrfTokenEndpoint from server/config/csrf-config, which is now built by
// wc.csrf.createCsrf({ tables }). If the factory ever stops returning a
// callable, server.js throws at boot — this test fails first.
const request = require('supertest');

describe('GET /api/csrf-token', () => {
  let app;

  beforeAll(() => {
    app = require('../../server');
  });

  it('issues a token to an agent with a session', async () => {
    const agent = request.agent(app);
    const res = await agent.get('/api/csrf-token');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.csrfToken).toBe('string');
    expect(res.body.csrfToken.length).toBeGreaterThan(0);
  });

  it('sets the double-submit cookie alongside the header token', async () => {
    const agent = request.agent(app);
    const res = await agent.get('/api/csrf-token');
    const cookies = res.headers['set-cookie'] || [];
    expect(cookies.join(';')).toMatch(/x-csrf/);
  });
});
```

- [ ] **Step 9: Run it and confirm PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npx jest tests/integration/csrfTokenEndpoint.test.js --runInBand 2>&1 | tail -8
```
Expected: `Tests: 2 passed, 2 total`. (Under `NODE_ENV=test` the session store is an in-memory store — `crhs-web-core/src/config/sessionStore.js:62-63` — so no DB is needed for the session; `tests/setup.js` still connects for the rest of the app.)

- [ ] **Step 10: Run every suite that touches CSRF policy, including the two intake guards, and check for cycles.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npx jest tests/unit/csrfConfig.test.js tests/unit/csrfTables.test.js \
        tests/integration/csrfTokenEndpoint.test.js \
        tests/integration/partnerInquiry.test.js \
        tests/integration/affiliateApplication.test.js \
        tests/integration/v1PaymentRemoval.test.js --runInBand 2>&1 | tail -12
npx madge --circular server/ | tail -3
```
Expected: `Test Suites: 6 passed, 6 total`, `0 failed`, and no circular dependency. `v1PaymentRemoval.test.js:122` proves `CSRF_CONFIG` survived the move; `partnerInquiry` / `affiliateApplication` prove the five retained rows still exempt the live forms.

- [ ] **Step 11: Run the full affiliate suite.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npm test 2>&1 | tail -15
```
Expected: `0 failed`. Per the 2026-08-24 amendment in project memory, if 1-3 suites fail, **re-run each failing suite alone** (`npx jest <path> --runInBand`) before debugging — several suites fail only under full-run interleaving and pass in isolation. Record any such suite in the PR body.

- [ ] **Step 12: Lint and commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npx eslint server/config/csrfTables.js server/config/csrf-config.js
git add server/config/csrfTables.js server/config/csrf-config.js \
        tests/unit/csrfTables.test.js tests/integration/csrfTokenEndpoint.test.js
git commit -m "$(cat <<'EOF'
feat(csrf): own the route tables — csrfTables.js + wc.csrf.createCsrf({ tables }) (B4c)

CO-REQUISITE of web-core B3h: they ship in ONE release. server/config/csrf-config.js
was a 5-line re-export of wc.csrf, and server.js:20 destructures
{ conditionalCsrf, csrfTokenEndpoint } to mount at :629 / :632 — so
@crhs/web-core v0.2.0 must not reach a box until this commit is on main.

server/config/csrfTables.js is the six tables moved verbatim out of web-core
(60 rows, count-checked against the pinned pre-B3h SHA). csrf-config.js is now
one createCsrf({ tables }) call and returns a SUPERSET of the old shape, so
server.js and tests/integration/v1PaymentRemoval.test.js:122 need no edit.

DEVIATION from spec §7.5 B4c, deliberate: the five "retired" rows
(/api/concierge, the two partner-inquiry and the two affiliate-application
paths) are KEPT. Their routes are still mounted (server.js:644, :703, :704) and
their public pages POST with a plain fetch; pruning now 403s two live marketing
forms and reds tests/integration/partnerInquiry.test.js and
affiliateApplication.test.js. They retire in Plan 3 with the routes; pinned by
tests/unit/csrfTables.test.js.

before=43 ported=4 after=47 (tests/unit/csrfConfig.test.js)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 46: CSRF merge gate — hand the pair to the release (NO deploy)

**Files:** none. **This task does not touch a box.** `@crhs/web-core` reaches oci1/oci2 exactly once, in Task 55, because one rsync of the library carries every group's breaking change at once — shipping the CSRF pair on its own rsync would also carry, un-gated, whatever other v0.2.0 core commits exist at that moment (e.g. the session `{ middleware, store }` change, which would throw `app.use() requires a middleware function` on `:3001`, or the CSP change, which would silently drop the portal's Firebase frame origin).

**Interfaces:**
- Consumes: Tasks 43, 44, 45 merged on their repos' `main`.
- Produces: the boot-smoke line Task 55 re-runs on each box.

- [ ] **Step 1: Gate the release — verify both halves are on `main`.**
```bash
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core log --oneline -3 main
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program log --oneline -3 main
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program status --porcelain
```
Expected: the web-core `createCsrf` commit is on `main`; the affiliate `csrfTables` commit **and** the Task 43 test-port commit are on `main`; the affiliate working tree is clean. **If the affiliate commit is missing, the release is not shippable** — a box that gets this core without it will `app.use(undefined)` and the portal will not start.

- [ ] **Step 2: Verify the consumer resolves the new primitive locally, one last time, on a fresh copy install.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
rm -rf node_modules/@crhs/web-core && npm install --install-links 2>&1 | tail -3 && git checkout -- package-lock.json
node -e "
const wc = require('@crhs/web-core');
console.log('createCsrf:', typeof wc.csrf.createCsrf);
const c = require('./server/config/csrf-config');
console.log('conditionalCsrf:', typeof c.conditionalCsrf, 'csrfTokenEndpoint:', typeof c.csrfTokenEndpoint);
"
```
Expected: `createCsrf: function` then `conditionalCsrf: function csrfTokenEndpoint: function`.

- [ ] **Step 3: Record the handoff line for Task 55 (no commit).**
```
B3h+B4c ready for the v0.2.0 deploy. Boot smoke to re-run on EACH box after
`npm install --install-links`, BEFORE `pm2 reload wavemax`:
  node -e "const c=require('./server/config/csrf-config');if(typeof c.conditionalCsrf!=='function'||typeof c.csrfTokenEndpoint!=='function')process.exit(1);console.log('csrf export shape OK')"
Rollback for this pair is Task 55's rollback — web-core and the affiliate roll back
TOGETHER; restoring only one recreates exactly the mismatch this pair exists to prevent.
```

---
### Task 47: web-core — failing ipGate CIDR-independence tests (B3i-1, RED)

**Scope note that binds Tasks 47–52 — who owns the `storeIPs` deletion.**
Spec §7.2.9a defines **PR B3i-1** (Tasks 47–52) as *only* the helper move: "Move the pure `isInRange(ip, cidr)` helper from `src/config/storeIPs.js` into `src/middleware/ipGate.js` verbatim … delete `const storeIPs = require('../config/storeIPs')` at `ipGate.js:13`, and point `entryMatches` (`:23`) at the local helper."
The **deletion of `crhs-web-core/src/config/storeIPs.js` + `tests/config/storeIPs.test.js` + `src/index.js:40` is PR B3i-2 = Task 53** of this plan. *Tasks 47–52 must leave `src/config/storeIPs.js` present and `tests/config/storeIPs.test.js` green.* Deleting it here would break that 34-case suite and pre-empt the 28→26 key-surface change that Task 53 must ship together with corporate's smoke flip.
The **affiliate's own** `server/config/storeIPs.js` is deleted later still — Plan 3, PR A-2.1 / B13. Nothing in Tasks 47–52 touches the affiliate's copy.
Consequence of move-then-delete: between Task 48 and Task 53, `isInRange` exists **twice** in web-core (in `storeIPs.js` for `isWhitelisted`, and in `ipGate.js`). That duplication is intentional and time-boxed; the implementation comment in Task 48 says so.

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/middleware/ipGate.test.js` — edit the require at `:23`; append a new `describe` block after the existing `describe('helpers', …)` block (`:199-212`), inside the outer `describe('createIpGate factory')` which closes at `:213`
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/middleware/ipGate.test.js` (this is the test)
- Untouched (deliberately): `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/config/storeIPs.js`, `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/config/storeIPs.test.js`

**Interfaces:**
- Consumes: `require('../../src/middleware/ipGate')` → today `{ createIpGate, parseList, entryMatches }` (`src/middleware/ipGate.js:73`); `require('../../src/utils/logger')` → a Winston logger with `.error`
- Produces (asserted by these tests, implemented in Task 48): `require('../../src/middleware/ipGate')` → `{ createIpGate, parseList, entryMatches, isInRange }` where `isInRange(ip: string, cidr: string): boolean`, and `src/middleware/ipGate.js` source containing **zero** occurrences of `config/storeIPs`

- [ ] **Step 1: Confirm the starting state of the two files this PR reasons about.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git status --porcelain && git log --oneline -1 && \
grep -n "config/storeIPs" src/middleware/ipGate.js && \
grep -n "^  isInRange(ip, cidr) {" src/config/storeIPs.js && \
grep -c "it(" tests/middleware/ipGate.test.js
```
Expected output (exactly this shape — a clean tree, the two live references, and the current case count):
```
<sha> <subject of HEAD>
13:const storeIPs = require('../config/storeIPs'); // pure isInRange() CIDR helper
23:  if (entry.includes('/')) return storeIPs.isInRange(ip, entry);
92:  isInRange(ip, cidr) {
14
```
If `git status --porcelain` prints anything, stop and clean the tree before continuing — this PR must be a 2-file diff.

- [ ] **Step 2: Extend the test file's requires (line 23) with the new symbols the move introduces.**
Replace line 23 of `tests/middleware/ipGate.test.js`:
```js
const { createIpGate, parseList, entryMatches } = require('../../src/middleware/ipGate');
```
with:
```js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const logger = require('../../src/utils/logger');
const { createIpGate, parseList, entryMatches, isInRange } = require('../../src/middleware/ipGate');
```

- [ ] **Step 3: Append the RED describe block just before the outer describe's closing `});`.**
Insert into `tests/middleware/ipGate.test.js`, immediately after the `describe('helpers', () => { … });` block and before the final `});`:
```js
  // PR B3i-1 — ipGate owns its CIDR matching. `src/config/storeIPs.js` is deleted
  // in B3i-2, and corporate's store-IP 302 (spec D7/§5.8) matches CIDRs through
  // this module, so nothing here may reach back into ../config/storeIPs.
  describe('CIDR matching is self-contained (no src/config/storeIPs dependency)', () => {
    const CORE_ROOT = path.join(__dirname, '..', '..');
    const IP_GATE_SRC = path.join(CORE_ROOT, 'src', 'middleware', 'ipGate.js');
    const STORE_IPS_SRC = path.join(CORE_ROOT, 'src', 'config', 'storeIPs.js');
    const PARKED = `${STORE_IPS_SRC}.b3i1-parked`;

    afterAll(() => {
      // Safety net: if the absence test died mid-flight, put the file back.
      if (fs.existsSync(PARKED) && !fs.existsSync(STORE_IPS_SRC)) fs.renameSync(PARKED, STORE_IPS_SRC);
    });

    it('exports a pure isInRange(ip, cidr) helper', () => {
      expect(typeof isInRange).toBe('function');
    });

    it('matches the store IPv4 host inside its /24 (72.190.1.227 in 72.190.1.0/24)', () => {
      expect(entryMatches('72.190.1.227', '72.190.1.0/24')).toBe(true);
      expect(isInRange('72.190.1.227', '72.190.1.0/24')).toBe(true);
      expect(entryMatches('72.190.2.227', '72.190.1.0/24')).toBe(false);
      expect(entryMatches('72.190.1.227', '72.190.1.227')).toBe(true);
      expect(isInRange('72.190.1.227', '72.190.1.227/32')).toBe(true);
      expect(isInRange('72.190.1.228', '72.190.1.227/32')).toBe(false);
    });

    it('matches an IPv6 address inside a /64 (store kiosk over IPv6)', () => {
      expect(entryMatches('2603:8080:db00:21b9:1d5b:e02c:7105:97f6', '2603:8080:db00:21b9::/64')).toBe(true);
      expect(entryMatches('2603:8080:db00:21b9::1', '2603:8080:db00:21b9::/64')).toBe(true);
      expect(entryMatches('2603:8080:db00:21ba::1', '2603:8080:db00:21b9::/64')).toBe(false);
      expect(isInRange('2603:8080:db00:ffff::5', '2603:8080:db00::/48')).toBe(true);
      expect(isInRange('::1', '::1/128')).toBe(true);
      expect(isInRange('::2', '::1/128')).toBe(false);
      expect(isInRange('2001:db8::1', '::/0')).toBe(true);
    });

    it('never cross-matches the IPv4 and IPv6 families', () => {
      expect(entryMatches('192.168.1.1', '2603:8080:db00:21b9::/64')).toBe(false);
      expect(entryMatches('2603:8080:db00:21b9::1', '10.0.0.0/8')).toBe(false);
      expect(isInRange('2603:8080:db00:21b9::1', '2603:8080:db00:21b9::/129')).toBe(false);
      expect(isInRange('gggg::1', '2603:8080:db00:21b9::/64')).toBe(false);
      expect(isInRange('2603:::1', '2603:8080:db00:21b9::/64')).toBe(false);
    });

    it('returns false (and logs) for null/garbage input instead of throwing', () => {
      const spy = jest.spyOn(logger, 'error').mockImplementation(() => {});
      expect(isInRange(null, '192.168.1.0/24')).toBe(false);
      expect(isInRange('192.168.1.1', null)).toBe(false);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
      expect(isInRange('192.168.1.1', 'invalid')).toBe(false);
      expect(isInRange('999.999.999.999', '192.168.1.0/24')).toBe(false);
      expect(isInRange('192.168.1.1', '192.168.1.0/33')).toBe(false);
    });

    it('does not require ../config/storeIPs (source proof)', () => {
      expect(fs.readFileSync(IP_GATE_SRC, 'utf8')).not.toContain('config/storeIPs');
    });

    it('loads with src/config/storeIPs.js absent (runtime proof)', () => {
      fs.renameSync(STORE_IPS_SRC, PARKED);
      try {
        const r = spawnSync(process.execPath, ['-e', "require('./src/middleware/ipGate')"], {
          cwd: CORE_ROOT,
          encoding: 'utf8'
        });
        expect(r.stderr).not.toMatch(/MODULE_NOT_FOUND/);
        expect(r.status).toBe(0);
      } finally {
        fs.renameSync(PARKED, STORE_IPS_SRC);
      }
    });
  });
```

- [ ] **Step 4: Run the suite and confirm it is RED for the right reasons.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/middleware/ipGate.test.js 2>&1 | tail -40
```
Expected: **`Tests: 7 failed, 14 passed, 21 total`** — every one of the 7 new cases is red (each either reads the missing `isInRange` export or reads the source/runtime state PR B3i-1 changes), while all 14 pre-existing cases stay green. The named reasons are:
1. `exports a pure isInRange(ip, cidr) helper` → `expect(received).toBe(expected) … Expected: "function" … Received: "undefined"` (nothing named `isInRange` is exported by `ipGate.js:73` yet).
2. `matches the store IPv4 host inside its /24`, `matches an IPv6 address inside a /64`, `never cross-matches …` and `returns false (and logs) for null/garbage input` → `TypeError: isInRange is not a function` on the first `isInRange(...)` line of each (the `entryMatches(...)` assertions above them already pass — the move must be behaviour-preserving, so those are regression pins, not new behaviour).
3. `does not require ../config/storeIPs (source proof)` → `expect(received).not.toContain(expected) … Expected substring: not "config/storeIPs"` (it is at `src/middleware/ipGate.js:13`).
4. `loads with src/config/storeIPs.js absent (runtime proof)` → `expect(received).not.toMatch(expected)` with `Cannot find module '../config/storeIPs'` / `MODULE_NOT_FOUND` in `r.stderr`, and `expect(r.status).toBe(0)` receiving `1`.

If failure #4 does **not** mention `MODULE_NOT_FOUND`, stop: the absence test is not proving what it claims. If `src/config/storeIPs.js` is missing after the run, restore it with `git checkout -- src/config/storeIPs.js` before continuing.

---

### Task 48: web-core — move `ipv6ToBigInt` + `isInRange` into `ipGate.js` verbatim (B3i-1, GREEN)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/middleware/ipGate.js` — delete `:13`; insert the two helpers after `parseList` (`:17-19`); repoint `entryMatches` `:23`; extend the export at `:73`
- Source of the verbatim move: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/config/storeIPs.js:6-33` (`ipv6ToBigInt` + its comment) and `:89-144` (`isInRange` + its comment) — **read, not deleted**
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/middleware/ipGate.test.js` (from Task 47)

**Interfaces:**
- Consumes: `require('../utils/logger')` (already imported at `ipGate.js:12`, and `isInRange`'s catch block at `storeIPs.js:141` calls `logger.error` — so the move needs no new import); `require('../utils/clientIp')` `{ clientIp(req) }` unchanged
- Produces: `module.exports = { createIpGate, parseList, entryMatches, isInRange }` from `src/middleware/ipGate.js`; `isInRange(ip: string, cidr: string): boolean` — pure, env-free, IPv4+IPv6, no cross-family match, `false` on any throw. Consumed by Task 53 (which can then delete `storeIPs.js`) and by Plan 2's corporate store-IP 302.

- [ ] **Step 1: Delete the `storeIPs` require at `src/middleware/ipGate.js:13`.**
Remove exactly this line:
```js
const storeIPs = require('../config/storeIPs'); // pure isInRange() CIDR helper
```
Lines `:12` (`const logger = require('../utils/logger');`) and `:14` (`const { clientIp } = require('../utils/clientIp');`) stay.

- [ ] **Step 2: Insert the two moved helpers between `parseList` and `entryMatches`.**
In `src/middleware/ipGate.js`, after the `parseList` function (originally `:17-19`) and before `/** Match an IP against one allowlist entry … */`, insert:
```js
// --- CIDR matching, moved verbatim from src/config/storeIPs.js (PR B3i-1) ------
// Pure: no env, no app state, no further requires. `storeIPs` keeps its own copy
// (its isWhitelisted() still calls it) until PR B3i-2 deletes that module — this
// is move-then-delete, and this copy is the only one any consumer of
// @crhs/web-core reaches. Corporate's store-IP 302 (spec D7/§5.8) matches CIDRs
// through entryMatches/isInRange here, never through ../config/storeIPs.

// Parse a textual IPv6 address into a 128-bit BigInt (handles `::` compression).
// Returns null for anything malformed. Pure IPv6 only — embedded IPv4
// (e.g. ::ffff:1.2.3.4) is not accepted here; callers strip the ::ffff: prefix
// before matching, so a store device's global IPv6 is what reaches this.
function ipv6ToBigInt(addr) {
  if (typeof addr !== 'string') return null;
  const s = addr.split('%')[0].trim(); // drop any zone id
  if (s === '' || s.indexOf('.') !== -1) return null;
  let groups;
  const dbl = s.indexOf('::');
  if (dbl !== -1) {
    if (s.indexOf('::', dbl + 1) !== -1) return null; // only one '::' allowed
    const headParts = s.slice(0, dbl) ? s.slice(0, dbl).split(':') : [];
    const tailParts = s.slice(dbl + 2) ? s.slice(dbl + 2).split(':') : [];
    const missing = 8 - headParts.length - tailParts.length;
    if (missing < 1) return null; // '::' must stand for >= 1 zero group
    groups = [...headParts, ...Array(missing).fill('0'), ...tailParts];
  } else {
    groups = s.split(':');
  }
  if (groups.length !== 8) return null;
  let result = 0n;
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    result = (result << 16n) | BigInt(parseInt(g, 16));
  }
  return result;
}

// IP range checker — supports both IPv4 and IPv6 CIDRs. The address family of
// `ip` and `cidr` must match (no cross-family matches). (Throws on null inputs
// are caught and logged below — intentional.)
function isInRange(ip, cidr) {
  try {
    // Basic CIDR validation and parsing
    const [network, bits] = cidr.split('/');
    if (!bits || !network) return false;

    const maskBits = parseInt(bits);
    if (isNaN(maskBits) || maskBits < 0) return false;

    const cidrIsV6 = network.includes(':');
    const ipIsV6 = ip.includes(':');
    if (cidrIsV6 !== ipIsV6) return false; // never cross IPv4/IPv6 families

    if (cidrIsV6) {
      if (maskBits > 128) return false;
      const ipInt = ipv6ToBigInt(ip);
      const netInt = ipv6ToBigInt(network);
      if (ipInt === null || netInt === null) return false;
      const full = (1n << 128n) - 1n;
      const mask = maskBits === 0 ? 0n : (full << BigInt(128 - maskBits)) & full;
      return (ipInt & mask) === (netInt & mask);
    }

    // IPv4
    if (maskBits > 32) return false;
    const ipToInt = (addr) => {
      const parts = addr.split('.');
      if (parts.length !== 4) return null;

      let result = 0;
      for (let i = 0; i < 4; i++) {
        const num = parseInt(parts[i]);
        if (isNaN(num) || num < 0 || num > 255) return null;
        result = (result * 256) + num; // Use multiplication to avoid sign issues
      }
      return result >>> 0; // Force unsigned
    };

    const ipInt = ipToInt(ip);
    const netInt = ipToInt(network);

    if (ipInt === null || netInt === null) return false;

    // Create mask - need to handle JavaScript's signed 32-bit integers
    const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;

    // Check if IP is in range
    return (ipInt & mask) === (netInt & mask);
  } catch (error) {
    logger.error('Error checking IP range:', error);
    return false;
  }
}
// --- end moved block ----------------------------------------------------------
```

- [ ] **Step 3: Repoint `entryMatches` at the local helper (originally `:23`).**
```js
/** Match an IP against one allowlist entry — a CIDR range, or an exact IP. */
function entryMatches(ip, entry) {
  if (entry.includes('/')) return isInRange(ip, entry);
  return ip === entry;
}
```

- [ ] **Step 4: Extend the export (originally `:73`).**
```js
module.exports = { createIpGate, parseList, entryMatches, isInRange };
```

- [ ] **Step 5: Run the suite and confirm GREEN.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/middleware/ipGate.test.js 2>&1 | tail -20
```
Expected: `Tests: 21 passed, 21 total` and `Test Suites: 1 passed, 1 total` — the 14 pre-existing cases plus the 7 added in Task 47, with zero failures.

- [ ] **Step 6: Prove the PR's own acceptance criterion (spec §7.5, row B3i-1) and that `storeIPs.js` is untouched.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && \
echo "storeIPs refs in ipGate.js: $(grep -c 'config/storeIPs' src/middleware/ipGate.js || true)" && \
git status --porcelain && \
node -e "const g=require('./src/middleware/ipGate');console.log(Object.keys(g).sort().join(','), g.isInRange('72.190.1.227','72.190.1.0/24'), g.entryMatches('2603:8080:db00:21b9::1','2603:8080:db00:21b9::/64'));"
```
Expected output:
```
storeIPs refs in ipGate.js: 0
 M src/middleware/ipGate.js
 M tests/middleware/ipGate.test.js
createIpGate,entryMatches,isInRange,parseList true true
```
Exactly two modified files. If `src/config/storeIPs.js` or `tests/config/storeIPs.test.js` appears, revert them — their deletion belongs to Task 53.

---

### Task 49: web-core — full suite + lint, then commit B3i-1

**Files:**
- Modify: none (verification + commit only)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/**/*.test.js` (whole suite, incl. `tests/config/storeIPs.test.js` which must stay green)

**Interfaces:**
- Consumes: Task 48's implementation; `npm test` = `TZ=America/Chicago jest --runInBand` (`crhs-web-core/package.json:7`)
- Produces: one commit on `crhs-web-core` implementing PR B3i-1; no version bump (spec §7.2.9: "PRs B3a–B3i-2 each bump nothing"). Consumed by Tasks 50, 51, 52 and 53.

- [ ] **Step 1: Run the whole web-core suite serially.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -15
```
Expected: `0 failed`, and a `Tests:` total of the count measured immediately before Task 47 **+7**. `tests/config/storeIPs.test.js` must be among the passing suites — this PR does not delete it. Any failure in `tests/middleware/ipGate.test.js` or `tests/config/storeIPs.test.js` blocks the commit.

- [ ] **Step 2: Lint the changed file.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx eslint src/middleware/ipGate.js tests/middleware/ipGate.test.js
```
Expected: no output (exit 0). If ESLint reports `no-bitwise` or BigInt-literal parse errors, do **not** rewrite the moved body — it is verbatim from a file that already lints; instead confirm `.eslintrc` `parserOptions.ecmaVersion` is ≥ 2020 and re-run.

- [ ] **Step 3: Review the diff before committing — it must be a pure move plus a require/export edit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git diff --stat && git diff src/middleware/ipGate.js | head -30
```
Expected `--stat`: `src/middleware/ipGate.js` and `tests/middleware/ipGate.test.js` only, roughly `+180 / -2` on the source file (`-1` require line, `-1`/`+1` on `entryMatches`, `-1`/`+1` on the export, the rest inserted). No line of `createIpGate` (`:36-71` pre-edit) may appear in the diff.

- [ ] **Step 4: Commit with the mandated trailer.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && \
git add src/middleware/ipGate.js tests/middleware/ipGate.test.js && \
git commit -m "$(cat <<'EOF'
core(ipGate): own the CIDR helper, drop the storeIPs require (B3i-1)

Moves ipv6ToBigInt + isInRange verbatim from src/config/storeIPs.js into
src/middleware/ipGate.js and points entryMatches at the local copy, so
ipGate no longer requires ../config/storeIPs.

Unblocks (a) the storeIPs deletion in B3i-2 and (b) corporate's store-IP
302 (spec D7 / 5.8), which matches CIDRs through this module. Behaviour
is unchanged: the helper bodies are byte-identical to the originals and
the pre-existing ipGate cases still pass. storeIPs.js keeps its own copy
for isWhitelisted() until B3i-2 removes the file (move-then-delete).

Tests: tests/middleware/ipGate.test.js gains 7 cases - IPv4 /24 and /32,
IPv6 /64 /48 /128 /0, strict family separation, null/garbage input, a
source proof that "config/storeIPs" no longer appears, and a runtime
proof that requiring ipGate succeeds with src/config/storeIPs.js absent.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected: `2 files changed, …`. Then confirm the tree is clean: `git status --porcelain` prints nothing.

- [ ] **Step 5: Push web-core (this reaches no production box).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git push && git log --oneline -1
```
Expected: the push succeeds and HEAD is the B3i-1 commit. Web-core reaches oci1/oci2 only in Task 55 — **no box changes as a result of this task**.

---

### Task 50: consumer-safety verification A — the affiliate app

**Files:**
- Modify: none
- Test: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/unit/adminIpGate.test.js`, `tests/unit/operatorIpGate.test.js`, `tests/unit/storeIPs.test.js`

**Interfaces:**
- Consumes: Task 49's commit, via `require('@crhs/web-core').ipGate` → `server/middleware/ipGate.js:5` (whole re-export), destructured as `{ createIpGate, parseList }` by `server/middleware/adminIpGate.js:22` and `server/middleware/operatorIpGate.js:20`
- Produces: proof that boot-breaker #1 (MODULE_NOT_FOUND in a consumer) does not exist after B3i-1

- [ ] **Step 1: Refresh the affiliate's installed copy so this task tests the NEW code.** Since Task 5 the affiliate consumes web-core as a real **COPY**, so a web-core edit is invisible here until it is reinstalled (Global Constraint 25).
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
ls -ld node_modules/@crhs/web-core
rm -rf node_modules/@crhs/web-core && npm install --install-links 2>&1 | tail -3
git checkout -- package-lock.json
grep -c "config/storeIPs" node_modules/@crhs/web-core/src/middleware/ipGate.js || echo "0 (expected)"
grep -c "function isInRange" node_modules/@crhs/web-core/src/middleware/ipGate.js
```
Expected: the `ls` shows a real directory (`drwx…`), **not** `lrwx…` — if it shows a symlink, Task 5 has not merged; stop and run it first. Then `0 (expected)` (grep -c prints `0` and exits 1, so the `||` branch fires) and `1`.

- [ ] **Step 2: Load the core key and both gate consumers in one process (the Task 53 acceptance command, run early).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && node -e "
const g = require('@crhs/web-core').ipGate;
console.log('wc.ipGate keys:', Object.keys(g).sort().join(','));
const admin = require('./server/middleware/adminIpGate');
const operator = require('./server/middleware/operatorIpGate');
const shim = require('./server/middleware/ipGate');
console.log('shim keys:', Object.keys(shim).sort().join(','));
console.log('admin/operator are middleware:', typeof admin === 'function', typeof operator === 'function');
console.log('admin.isConfigured:', typeof admin.isConfigured);
console.log('cidr:', shim.entryMatches('72.190.1.227','72.190.1.0/24'));
" ; echo "exit=$?"
```
Expected output:
```
wc.ipGate keys: createIpGate,entryMatches,isInRange,parseList
shim keys: createIpGate,entryMatches,isInRange,parseList
admin/operator are middleware: true true
admin.isConfigured: function
cidr: true
exit=0
```
Any `Cannot find module '../config/storeIPs'` here is the exact boot-breaker-#1 failure and means Task 48 Step 1 removed the require but the helpers were not inserted — go back to Task 48.

- [ ] **Step 3: Run the affiliate's own gate suites against the edited core.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && \
npx jest tests/unit/adminIpGate.test.js tests/unit/operatorIpGate.test.js tests/unit/storeIPs.test.js 2>&1 | tail -12
```
Expected: `Test Suites: 3 passed, 3 total` with 0 failures. These exercise the *new* core `entryMatches`/`isInRange` through the shim, and `tests/unit/storeIPs.test.js` proves the affiliate's own untouched `server/config/storeIPs.js` still behaves — its deletion is Plan 3 (PR A-2.1 / B13), not this task.

- [ ] **Step 4: Confirm no affiliate file changed.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git status --porcelain && echo "clean=$?"
```
Expected: no file lines, `clean=0`. B3i-1 is a web-core-only PR; the affiliate needs **no** co-requisite change (unlike Tasks 44/45 for csrf), because `server/middleware/ipGate.js:5` re-exports the whole object and the only new key is additive.

---

### Task 51: consumer-safety verification B — the corporate app

**Files:**
- Modify: none in git (the refresh only rewrites `node_modules/`)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/mediatorGate.test.js`, `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/webcore.smoke.test.js`

**Interfaces:**
- Consumes: Task 49's commit, via `webCore.ipGate` destructured as `{ createIpGate, parseList }` at `crhs-corporate/server/middleware/mediatorGate.js:24`; `tests/webcore.smoke.test.js:13-16` asserts `ipGate` is present in the export surface
- Produces: proof that the third boot-breaker-#1 casualty loads; and an explicit record that `tests/webcore.smoke.test.js:10` (`toHaveLength(28)`) is **still 28** after B3i-1 — the 26 flip is Task 53

- [ ] **Step 1: Show that corporate's copy is stale.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && ls -ld node_modules/@crhs/web-core && \
grep -n "config/storeIPs" node_modules/@crhs/web-core/src/middleware/ipGate.js
```
Expected: a real directory (`drwx…`, not `lrwx…`) and the stale line `13:const storeIPs = require('../config/storeIPs'); // pure isInRange() CIDR helper`. That is the `.npmrc install-links=true` copy semantics — corporate does not see a web-core edit until it reinstalls.

- [ ] **Step 2: Refresh the copy.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && rm -rf node_modules/@crhs/web-core && \
npm install --install-links --no-audit --no-fund 2>&1 | tail -5 && \
grep -c "config/storeIPs" node_modules/@crhs/web-core/src/middleware/ipGate.js || echo "0 refs (expected)"
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && grep -c "function isInRange" node_modules/@crhs/web-core/src/middleware/ipGate.js
```
Expected: npm prints an `added/changed … packages` line, then `0 refs (expected)`, then `1`.

- [ ] **Step 3: Keep `package-lock.json` out of this task — lock regeneration is owned by Task 7.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && git status --porcelain
# if package-lock.json shows as modified:
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && git checkout -- package-lock.json && git status --porcelain
```
Expected: an empty `git status --porcelain` at the end. Reverting the lock does not undo the `node_modules/` refresh Step 2 performed.

- [ ] **Step 4: Load `wc.ipGate` and `mediatorGate` in corporate (the second-consumer acceptance command).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && node -e "
const wc = require('@crhs/web-core');
const g = wc.ipGate;
console.log('wc.ipGate keys:', Object.keys(g).sort().join(','));
console.log('surface keys:', Object.keys(wc).length);
const mediatorGate = require('./server/middleware/mediatorGate');
console.log('mediatorGate is middleware:', typeof mediatorGate === 'function');
console.log('cidr v4:', g.entryMatches('72.190.1.227','72.190.1.0/24'), 'cidr v6:', g.entryMatches('2603:8080:db00:21b9::1','2603:8080:db00:21b9::/64'));
" ; echo "exit=$?"
```
Expected output:
```
wc.ipGate keys: createIpGate,entryMatches,isInRange,parseList
surface keys: 28
mediatorGate is middleware: true
cidr v4: true cidr v6: true
exit=0
```
`surface keys: 28` is correct **for this task** — `src/index.js:40` (`storeIPs`) and `:44` (`previewUnlockCookie`) are still exported; they go in Task 53, which flips corporate's `tests/webcore.smoke.test.js:10` to `26` in the same commit.

- [ ] **Step 5: Run the two corporate suites that touch this seam.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/mediatorGate.test.js tests/webcore.smoke.test.js 2>&1 | tail -12
```
Expected: `Test Suites: 2 passed, 2 total`, 0 failures — `webcore.smoke.test.js:10`'s `toHaveLength(28)` still holds and `:13-16`'s `arrayContaining([… 'ipGate' …])` still holds.

- [ ] **Step 6: Run corporate's whole suite as the final consumer proof.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npm test 2>&1 | tail -12
```
Expected: exactly the 4 pre-existing `tests/crhsent-parity.test.js` ENOENT failures and no others. If `tests/models.test.js` fails on the `.base` identity assertions (`:88-96`), that is a topology regression owned by Task 7, **not** a B3i-1 regression — confirm by re-running it against a `git checkout <pre-B3i-1-sha>` in web-core plus a reinstall before attributing it here.

---

### Task 52: scope guard — record what Tasks 47–51 did NOT do

**Files:**
- Modify: none
- Test: `git`-level assertions only

**Interfaces:**
- Consumes: the B3i-1 commit produced in Task 49
- Produces: a recorded, checkable statement of the deletion ownership for the reviewer of Task 53 and Task 54

- [ ] **Step 1: Assert the B3i-1 commit is exactly two files and touches neither `storeIPs.js` nor `src/index.js`.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git show --stat --oneline HEAD | tail -6 && \
git show --name-only --format= HEAD | sort
```
Expected:
```
 src/middleware/ipGate.js       | ...
 tests/middleware/ipGate.test.js | ...
 2 files changed, ...
src/middleware/ipGate.js
tests/middleware/ipGate.test.js
```
If `src/config/storeIPs.js`, `tests/config/storeIPs.test.js` or `src/index.js` appears, Tasks 47–49 have absorbed Task 53's work — split the commit before Task 53 runs.

- [ ] **Step 2: Assert the files Task 53 owns are still present and their suite still green.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && \
git ls-files src/config/storeIPs.js tests/config/storeIPs.test.js src/utils/previewUnlockCookie.js && \
grep -n "def('storeIPs'" src/index.js && \
npx jest tests/config/storeIPs.test.js 2>&1 | tail -6
```
Expected: all three paths listed, `40:def('storeIPs', () => require('./config/storeIPs'));` printed, and `Test Suites: 1 passed, 1 total`.

- [ ] **Step 3: Write the two ownership sentences into the B3i-1 PR body / release notes (paste verbatim).**
```text
B3i-1 scope: web-core only, 2 files. ipGate.js now owns ipv6ToBigInt + isInRange
(moved verbatim from src/config/storeIPs.js) and no longer requires that module.
Neither consumer needed a co-requisite change: the affiliate re-exports wc.ipGate
whole (server/middleware/ipGate.js:5) and corporate destructures only
{ createIpGate, parseList } (server/middleware/mediatorGate.js:24) - the added
isInRange export is purely additive.

NOT in this PR: deleting crhs-web-core/src/config/storeIPs.js,
tests/config/storeIPs.test.js, src/utils/previewUnlockCookie.js and src/index.js
:40/:44. That is PR B3i-2 = Task 53 of this plan, which takes the export surface
28 -> 26 and flips crhs-corporate/tests/webcore.smoke.test.js:10 to 26 in the same
commit pair. The affiliate's own server/config/storeIPs.js is deleted later still,
in Plan 3 (PR A-2.1 / B13).
```

- [ ] **Step 4: Confirm all three working trees are clean before handing off to Task 53.**
```bash
for d in /mnt/c/Users/rickh/GitHub/crhs-web-core /mnt/c/Users/rickh/GitHub/crhs-corporate /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; do echo "== $d"; git -C "$d" status --porcelain; done
```
Expected: three `==` header lines and no file lines under any of them.

---

### Task 53: web-core + corporate — delete `storeIPs` and `previewUnlockCookie`, export surface 28 → 26 (B3i-2)

**Files:**
- Delete: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/config/storeIPs.js`, `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/config/storeIPs.test.js`, `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/utils/previewUnlockCookie.js`, `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/utils/previewUnlockCookie.test.js`
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/index.js:40` and `:44` (delete both `def(...)` lines) and the `:15-18` "28 keys" comment
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/index.smoke.test.js:4` (header comment), the `expected` array (`:11-40` — remove `'storeIPs'` and `'previewUnlockCookie'`) and `:47-49` (both `28` literals → `26`)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/webcore.smoke.test.js:9-10` (`28` → `26`, in the same release)
- Test: `crhs-web-core/tests/index.smoke.test.js`, `crhs-corporate/tests/webcore.smoke.test.js`

**Interfaces:**
- Consumes: **Task 48 must already be merged** — `src/middleware/ipGate.js` no longer requires `../config/storeIPs`. Deleting the file before that is `MODULE_NOT_FOUND` in **both** apps (affiliate `server/middleware/ipGate.js:5` re-export, `adminIpGate.js:22`, `operatorIpGate.js:20`; corporate `mediatorGate.js:24`) — boot-breaker #1.
- Produces: `Object.keys(require('@crhs/web-core')).length === 26`, with `storeIPs` and `previewUnlockCookie` gone. Consumed by Task 54's release gate (`keys: 26`) and Task 55 Step 7.
- **Plan 1 carve-out (Global Constraint 16):** this task deletes **only** those two modules and their index keys. It does **not** delete `src/security/securityHeaders.js:83-88`, `assets/js/{iframe-bridge-v2,parent-iframe-bridge-v3}.js` or `assets/legal/*` — the affiliate still serves `public/assets/js/parent-iframe-bridge-v3.js` cross-origin to the WordPress parent, and `securityHeaders.js:83-88` is the `Access-Control-Allow-Origin: *` / `Cross-Origin-Resource-Policy: cross-origin` block for exactly that path. Those are D9a/D3a, with the Item-A bridge retirement in Plan 3. **Record this carve-out in the PR body.**

- [ ] **Step 1: Prove the prerequisite and prove nothing consumes either key.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && grep -c "config/storeIPs" src/middleware/ipGate.js || echo "0 (Task 48 merged — required)"
grep -rn "storeIPs\|previewUnlockCookie" src/ --include=*.js | grep -v "src/config/storeIPs.js" | grep -v "src/utils/previewUnlockCookie.js"
grep -rn "\.storeIPs\|previewUnlockCookie" \
  /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/server /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/server.js \
  /mnt/c/Users/rickh/GitHub/crhs-corporate/server /mnt/c/Users/rickh/GitHub/crhs-corporate/server.js 2>/dev/null || echo "NO CONSUMER (expected)"
```
Expected: `0 (Task 48 merged — required)`; the second grep prints only the two `def(...)` lines in `src/index.js`; the third prints `NO CONSUMER (expected)`. **Note:** the affiliate has its own `server/config/storeIPs.js` and `tests/unit/storeIPs.test.js` — those are local files, not `wc.storeIPs`, and must NOT appear in the third grep (it searches for the property access `.storeIPs`). If any real consumer appears, STOP.

- [ ] **Step 2: Write the failing smoke tests FIRST, in both repos.**
In `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/index.smoke.test.js`: remove `'storeIPs',` and `'previewUnlockCookie',` from the `expected` array; change `:4`'s `The surface is FINAL at 28 keys` to `26 keys`; and change `:47-49` to:
```js
  test('surface is exactly 26 keys — no unexpected extra or missing key', () => {
    expect(Object.keys(core).sort()).toEqual([...expected].sort());
    expect(Object.keys(core)).toHaveLength(26);
  });
```
In `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/webcore.smoke.test.js:9-10`:
```js
  test('resolves through the file: dep with its full 26-key surface', () => {
    expect(Object.keys(wc)).toHaveLength(26);
```
(the `arrayContaining` at `:13-16` still names `ipGate`, which Task 48 keeps intact — leave it alone).

- [ ] **Step 3: Run both and confirm the expected red.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/index.smoke.test.js 2>&1 | tail -20
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/webcore.smoke.test.js 2>&1 | tail -20
```
Expected in web-core: the `surface is exactly 26 keys` case fails with `expect(received).toHaveLength(expected) / Expected length: 26 / Received length: 28`, and the `toEqual` shows `storeIPs` and `previewUnlockCookie` as extra received keys. Expected in corporate: the same length mismatch (its installed copy is still 28). **The `exports %s` `test.each` cases for the two removed names are gone from the web-core file, so they must not appear in the run at all** — if they do, the `expected` array edit was missed.

- [ ] **Step 4: Delete the two modules and their suites.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git rm src/config/storeIPs.js tests/config/storeIPs.test.js src/utils/previewUnlockCookie.js tests/utils/previewUnlockCookie.test.js
```
Expected: four `rm '…'` lines.

- [ ] **Step 5: Delete the two index keys and correct the header comment.**
In `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/index.js`, delete line `40` (`def('storeIPs', () => require('./config/storeIPs'));`) and line `44` (`def('previewUnlockCookie', () => require('./utils/previewUnlockCookie'));`), and change the `:15-18` comment's `(28 keys)` to `(26 keys)`. The `def()` lazy-getter mechanism and the `:11-13` ORA-04036 note are untouched — that laziness is load-bearing (2026-08-27 incident).

- [ ] **Step 6: Verify the surface and the ipGate load, then run both suites green.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && node -e "
const c = require('./src');
console.log('keys:', Object.keys(c).length);
console.log('storeIPs:', Object.prototype.hasOwnProperty.call(c,'storeIPs'));
console.log('previewUnlockCookie:', Object.prototype.hasOwnProperty.call(c,'previewUnlockCookie'));
const { createIpGate, parseList, entryMatches, isInRange } = c.ipGate;
console.log('ipGate:', typeof createIpGate, typeof parseList, typeof entryMatches, typeof isInRange);
console.log('cidr match:', entryMatches('70.114.167.145','70.114.167.0/24'));
"
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -8
```
Expected:
```
keys: 26
storeIPs: false
previewUnlockCookie: false
ipGate: function function function function
cidr match: true
```
then `0 failed`. `ipGate` loading with `storeIPs` gone is the direct proof that Task 48 landed before this deletion.

- [ ] **Step 7: Refresh corporate's copy and run its suites green (the co-requisite half).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && rm -rf node_modules/@crhs/web-core && npm install --install-links && git checkout -- package-lock.json
node -e "console.log('keys:', Object.keys(require('@crhs/web-core')).length)"
npx jest tests/webcore.smoke.test.js tests/mediatorGate.test.js 2>&1 | tail -8
npm test 2>&1 | tail -8
```
Expected: `keys: 26`; both named suites pass; the full suite shows exactly the 4 pre-existing `crhsent-parity` ENOENT failures.

- [ ] **Step 8: Prove the affiliate is unaffected.** It re-exports `wc.ipGate` whole and holds its own `server/config/storeIPs.js`, and it never consumed `previewUnlockCookie`.
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && rm -rf node_modules/@crhs/web-core && npm install --install-links && git checkout -- package-lock.json
node -e "
const g = require('@crhs/web-core').ipGate;
console.log('wc keys:', Object.keys(require('@crhs/web-core')).length);
require('./server/middleware/adminIpGate'); require('./server/middleware/operatorIpGate');
console.log('gates loaded OK, cidr:', g.entryMatches('72.190.1.227','72.190.1.0/24'));
"
npx jest tests/unit/adminIpGate.test.js tests/unit/operatorIpGate.test.js tests/unit/storeIPs.test.js --runInBand --forceExit 2>&1 | tail -8
```
Expected: `wc keys: 26`, `gates loaded OK, cidr: true`, and `Test Suites: 3 passed`. No affiliate file changes in this task.

- [ ] **Step 9: Lint and commit — BOTH repos, as one release pair.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx eslint src tests && git add src/index.js tests/index.smoke.test.js src/config/storeIPs.js tests/config/storeIPs.test.js src/utils/previewUnlockCookie.js tests/utils/previewUnlockCookie.test.js && git commit -m "$(cat <<'EOF'
core!: delete storeIPs + previewUnlockCookie, export surface 28 -> 26 (B3i-2)

storeIPs.js is unreferenced now that ipGate.js owns ipv6ToBigInt/isInRange
(B3i-1, which MUST be merged first — deleting it earlier is MODULE_NOT_FOUND in
both apps). previewUnlockCookie.js has zero consumers in either app.

CO-REQUISITE: crhs-corporate/tests/webcore.smoke.test.js:10 flips 28 -> 26 in the
same release; the affiliate keeps its OWN server/config/storeIPs.js (deleted in
Plan 3, PR A-2.1/B13) and re-exports wc.ipGate whole, so it needs no change.

PLAN 1 CARVE-OUT from spec 7.2.9's deletion table: securityHeaders.js:83-88 and
assets/js/{iframe-bridge-v2,parent-iframe-bridge-v3}.js + assets/legal/* are NOT
deleted here. The portal still serves parent-iframe-bridge-v3.js cross-origin to
the WordPress parent, and :83-88 is the CORP/ACAO block for exactly that path.
Those are D9a/D3a, with the Item-A bridge retirement in Plan 3.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)" && git push origin main

cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx eslint tests && git add tests/webcore.smoke.test.js && git commit -m "$(cat <<'EOF'
test(smoke): web-core export surface is 26 keys (B4a, co-requisite of B3i-2)

storeIPs and previewUnlockCookie are deleted from @crhs/web-core in the same
release. This app consumed neither.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)" && git push origin main
```
Expected: both commits land. **Neither may be merged without the other** — a box with the new core and the old corporate smoke test goes red on its next `npm test`, and a box with the old core and the new smoke test likewise.

---
### Task 54: cut the `@crhs/web-core` v0.2.0 release (packaging gate, version bump, tag)

Not human-gated — repo + tag only. Nothing reaches a box until Task 55.

**Prerequisite:** every R2 web-core task is committed on `main` — Task 14 (B3a auditLogger `LOG_DIR`), Task 18 (B3b CORS env-only), Tasks 22–23 (B3c CSP profiles + goldens), Tasks 27/28/30 (B3d session), Tasks 32–33 (B3e SystemConfig), Tasks 37–41 (B3f rate-limit mechanism + the three dead-limiter deletions), Task 44 (B3h csrf), Tasks 47–49 (B3i-1 ipGate), Task 53 (B3i-2 deletions + surface 26) — **and** the consumer co-requisites: Tasks 19, 24, 25–26, 29, 34–35, 43, 45 and Task 53's corporate half. **Spec PRs B3g / B3j / B3k are deliberately NOT in this release** (Global Constraint 16) — they ship as v0.2.1 with Plan 2 Phase 0a; do not add them to this gate.

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/package.json` (`version` → `0.2.0`)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/packageTopology.test.js` (created by Task 4 — **append** the release-gate cases and update the version pin; there is no `tests/packaging.test.js` in this repo)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/packageTopology.test.js`

**Interfaces:**
- Consumes: `require('../package.json')` — `version`, `dependencies`, `devDependencies`, `peerDependencies`, `files`; the merged R2 tasks above
- Produces: `@crhs/web-core@0.2.0` on `main` + annotated tag `v0.2.0`. Consumed by Task 55.

- [ ] **Step 1: Write the failing release-gate cases.** Append this `describe` to `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/packageTopology.test.js` (the file Task 4 created; it already asserts the peer/dev/no-mongodb invariants — do **not** restate them):
```js
describe('release gate — v0.2.0', () => {
  const cmp = (a, b) => {
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
    return 0;
  };

  // The v0.2.0 API release removes exports two live consumers can reach
  // (storeIPs, previewUnlockCookie, the csrf export shape). Consumers pin
  // "file:../crhs-web-core" and only see whatever bytes are on the box, so the
  // version is the ONLY signal that a box is running the new API — it must never
  // regress below 0.2.0 once the API changes have landed.
  it('package version is at least 0.2.0', () => {
    expect(cmp(pkg.version, '0.2.0')).toBeGreaterThanOrEqual(0);
  });

  it('ships src and assets', () => {
    expect(pkg.files).toEqual(expect.arrayContaining(['src', 'assets']));
  });
});
```
Then **replace Task 4's exact-version pin** so the bump does not break it — change
```js
  test('version is the topology release', () => {
    expect(pkg.version).toBe('0.1.3');
  });
```
to
```js
  test('version never regresses below the topology release', () => {
    expect(pkg.version.startsWith('0.1.3') || pkg.version >= '0.2.0').toBe(true);
  });
```

- [ ] **Step 2: Run it and confirm it fails on the version only.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/packageTopology.test.js --runInBand 2>&1 | tail -20
```
Expected — the structural cases pass (Task 4 already moved the peers and dropped `mongodb`), and only the release-gate version case is red:
```
● release gate — v0.2.0 › package version is at least 0.2.0

    expect(received).toBeGreaterThanOrEqual(expected)

    Expected: >= 0
    Received:    -1
```
If any structural case is also red, Tasks 3–7 are incomplete — stop and finish them; do not "fix" it here.

- [ ] **Step 3: Bump the version.** In `/mnt/c/Users/rickh/GitHub/crhs-web-core/package.json` change:
```json
  "version": "0.1.3",
```
to:
```json
  "version": "0.2.0",
```
(Locate the key **by name** — `"files"` and `"engines"` are each on one line in this file, so any line number is unreliable.)

- [ ] **Step 4: Re-run the packaging gate — PASS.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/packageTopology.test.js --runInBand 2>&1 | tail -6
```
Expected: `0 failed`, `Tests: 17 passed, 17 total` (Task 4's 15 + the 2 release-gate cases).

- [ ] **Step 5: Run the FULL web-core suite — the whole surface must be green before a tag exists.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -8
```
Expected: `0 failed`. If any suite fails, stop — an untagged, broken core must never be rsynced.

- [ ] **Step 6: Confirm the surface really is 26 keys (boot-breaker #1 sequencing landed correctly).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && node -e 'const c=require("./src");console.log("keys:",Object.keys(c).length);console.log("storeIPs:",Object.prototype.hasOwnProperty.call(c,"storeIPs"));console.log("previewUnlockCookie:",Object.prototype.hasOwnProperty.call(c,"previewUnlockCookie"));const {createIpGate,parseList,entryMatches}=c.ipGate;console.log("ipGate:",typeof createIpGate,typeof parseList,typeof entryMatches);console.log("cidr match:",entryMatches("70.114.167.145","70.114.167.0/24"));console.log("createCsrf:",typeof c.csrf.createCsrf);'
```
Expected:
```
keys: 26
storeIPs: false
previewUnlockCookie: false
ipGate: function function function
cidr match: true
createCsrf: function
```

- [ ] **Step 7: Commit the bump and cut the annotated tag.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git add package.json tests/packageTopology.test.js && git commit -m "$(cat <<'EOF'
release: v0.2.0 — API release (auditLogger LOG_DIR, env-only CORS, CSP profiles,
session { middleware, store } + app.sid, SystemConfig registerDefaults, rate-limit
collection prefix + 3 dead limiters removed, csrf createCsrf, ipGate CIDR
self-contained, storeIPs + previewUnlockCookie removed)

Surface 28 -> 26 keys. Consumer co-requisites shipping in the SAME release:
corporate (CORS proof, CSP call site, session destructure with the pinned live
cookie base, boot seeding, smoke 26) and the affiliate (CSP call site + golden
re-capture, createCsrf adoption via server/config/csrfTables.js).

Deliberately NOT in this release (Plan 1 Global Constraint 16): spec PRs B3g
(email brand params), B3j (validateMailConfig) and B3k (assets/js/i18n.js), plus
the repo-wide tests/brandNeutral.test.js that depends on them — they ship as
v0.2.1 with Plan 2 Phase 0a.

Packaging gate: version >= 0.2.0, the four singletons peer+dev only, no direct
mongodb dependency, files ships src + assets.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)" && git tag -a v0.2.0 -m "web-core v0.2.0 — API release; consumers updated in the same release" && git push origin main && git push origin v0.2.0
```
Verify:
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git describe --tags --exact-match HEAD && node -p "require('./package.json').version"
```
Expected:
```
v0.2.0
0.2.0
```

- [ ] **Step 8: Confirm the consumer co-requisites are on their `main` branches BEFORE Task 55 starts.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git log --oneline -8 && grep -n "createCsrf\|csrfTables" server/config/csrf-config.js && grep -n "conditionalCsrf\|csrfTokenEndpoint" server.js | head -4 && grep -n "wavemax-bag-registration.firebaseapp.com" server.js
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && git log --oneline -8 && grep -n "buildSessionMiddleware\|app.get('/health'\|seedSystemConfig" server.js && grep -n "toHaveLength(26)" tests/webcore.smoke.test.js
```
Expected: the affiliate's `csrf-config.js` builds its own instance via `createCsrf({ tables: require('./csrfTables') })` (no bare `module.exports = require('@crhs/web-core').csrf;`), `server.js` still successfully destructures `{ conditionalCsrf, csrfTokenEndpoint }` and mounts them, and `APP_FRAME_SRC_ORIGINS` carries the Firebase origin; corporate destructures `{ middleware: sessionMiddleware }`, has `app.get('/health'` at a **lower** line number than the session mount, calls `seedSystemConfig()`, and its smoke test asserts 26. **If any of that is missing, STOP** — deploying v0.2.0 without them means `app.use(undefined)` (portal will not start), a dropped Firebase frame origin (silent), or a red smoke test on the box.

---

### Task 55: **HUMAN-CONFIRM** — Deploy B: web-core v0.2.0 + the co-requisite consumer PRs to oci1 then oci2

**HUMAN-CONFIRM.** Production, both boxes. This is the release that can break boot on `:3000` (csrf export shape), refuse to start `:3001` (session shape), and silently disable the access gate (mongoose identity) or the portal's phone auth (CSP frame origin). Run with Rick present; rollback is Step 12. **This is the single point at which v0.2.0 reaches the boxes** — no other task in this plan may rsync `crhs-web-core` to a box for this release.

**Prerequisite:** Task 11 (Deploy A) verified on both boxes; Task 12 (gate G1) done, so the LB health signal already follows the portal and will surface a portal boot failure within ~60s; Task 54 tagged `v0.2.0`; every consumer co-requisite merged and green locally.

**Files:**
- Modify (boxes only): `/var/www/crhs-web-core` (rsync), `/var/www/wavemax/wavemax-affiliate-program` (git pull), `/var/www/crhs-corporate` (git pull or rsync)
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/docs/refactor/plan1-exit-gate.md` (append the Deploy B record)
- Test: `/mnt/c/Users/rickh/GitHub/crhs-web-core/scripts/deploy/verify-topology.sh` (from Task 11) plus the live smoke matrix below

**Interfaces:**
- Consumes: `verify-topology.sh` → `<sharedMongoose> <sharedDriver> <coreVersion>`, must print `true true 0.2.0`; the boot-smoke line handed over by Task 46 Step 3
- Consumes: affiliate `GET /api/csrf-token` (`server.js:632`) → proof the `createCsrf` adoption and its mount survived
- Consumes: corporate `accessGate.loadCache()` boot log — success `server/middleware/accessGate.js:74` `Access gate cache loaded: …`, failure `:76` `Access gate cache load failed:` inside a swallowing catch
- Produces: both apps running `@crhs/web-core@0.2.0`, one mongoose per process, zero user-visible change

- [ ] **Step 1: Run all three suites locally one last time against the tagged core.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -6
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && rm -rf node_modules/@crhs/web-core && npm install --install-links >/dev/null 2>&1 && git checkout -- package-lock.json && npm test 2>&1 | tail -6
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && rm -rf node_modules/@crhs/web-core && npm install --install-links >/dev/null 2>&1 && git checkout -- package-lock.json && npx jest --runInBand 2>&1 | tail -6
```
Expected: web-core `0 failed`; the affiliate matches its baseline plus every Plan 1 addition, `0 failed` (including the deliberately re-captured `tests/integration/webCoreConsumptionGolden.test.js`); corporate shows exactly `<CORP_BASE_FAIL>` = **4** failures, all in `tests/crhsent-parity.test.js`, and nothing else.

- [ ] **Step 2: Ask Rick two questions before touching a box (confirm-first).**
  1. **CORS.** "Task 18 made web-core CORS env-only. What is `CORS_ORIGIN` in `/var/www/crhs-corporate/.env` on each box? If unset, crhsent.com will reject all cross-origin API requests after this deploy — spec §7.2.6/D21b says that is intended (crhsent has no cross-origin callers, grep-verified in Task 19 Step 1). Confirm?" Read the value first:
```bash
for H in 161.153.71.201 144.24.4.202; do ssh -i ~/.ssh/oci_wavemax ubuntu@$H "echo -n \"$H CORS_ORIGIN=\"; grep '^CORS_ORIGIN' /var/www/crhs-corporate/.env || echo '(unset)'"; done
```
  2. **Session cookie.** "Task 29 pins `cookieName: process.env.SESSION_COOKIE_NAME || 'wavemax.sid'`. Is `SESSION_COOKIE_NAME` set on either box? If it IS set, the live cookie base follows that value, not `wavemax.sid`."
```bash
for H in 161.153.71.201 144.24.4.202; do ssh -i ~/.ssh/oci_wavemax ubuntu@$H "echo -n \"$H SESSION_COOKIE_NAME=\"; grep '^SESSION_COOKIE_NAME' /var/www/crhs-corporate/.env || echo '(unset — expected)'"; done
```
  3. **Go/no-go:** "Deploy web-core v0.2.0 + the consumer PRs: rsync, `npm install --install-links` in both consumers, boot smokes, `pm2 reload wavemax` then `pm2 reload crhs-corporate`, oci1 first, verify, then oci2." Record all three answers. Do not proceed on silence.

- [ ] **Step 3: Capture the BEFORE state and a nonce-normalized CSP fingerprint on both boxes** (the "no user-visible change" evidence for Task 58). One ssh per box:
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'echo "== oci1 =="; pm2 jlist | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>JSON.parse(s).forEach(a=>console.log(a.name,a.pm2_env.status,\"restarts=\"+a.pm2_env.restart_time)))"; node -p "require(\"/var/www/crhs-web-core/package.json\").version"; git -C /var/www/wavemax/wavemax-affiliate-program rev-parse --short HEAD; git -C /var/www/crhs-corporate rev-parse --short HEAD; echo "-- csp portal --"; curl -s -D- -o /dev/null -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/embed-app-v2.html | grep -i "^content-security-policy" | sed -E "s/nonce-[A-Za-z0-9+\/=]+/nonce-X/g" | sha256sum; echo "-- csp crhsent --"; curl -s -D- -o /dev/null -H "Host: crhsent.com" http://127.0.0.1:3001/wavemax/ | grep -i "^content-security-policy" | sed -E "s/nonce-[A-Za-z0-9+\/=]+/nonce-X/g" | sha256sum; echo "-- crhsent cookie --"; curl -s -D- -o /dev/null -H "Host: crhsent.com" http://127.0.0.1:3001/ | grep -i "^set-cookie"; echo "-- smoke codes --"; for u in "3000 portal.atxwashdryfold.com /health" "3000 portal.atxwashdryfold.com /api/csrf-token" "3000 portal.atxwashdryfold.com /embed-app-v2.html" "3001 crhsent.com /health" "3001 crhsent.com /" "3001 crhsent.com /wavemax/"; do set -- $u; printf "%s %s -> " "$1" "$3"; curl -s -o /dev/null -w "%{http_code}\n" -H "Host: $2" "http://127.0.0.1:$1$3"; done'
```
Repeat verbatim for `ubuntu@144.24.4.202`. Save the two CSP sha256 values, the `set-cookie` line, the two SHAs and the six status codes per box into `docs/refactor/plan1-exit-gate.md` under `## Deploy B — before`. **The consumer SHAs are the rollback targets in Step 12.**

- [ ] **Step 4: Snapshot web-core on oci1 for rollback.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'sudo rm -rf /var/www/crhs-web-core.bak && sudo cp -a /var/www/crhs-web-core /var/www/crhs-web-core.bak && node -p "require(\"/var/www/crhs-web-core.bak/package.json\").version"'
```
Expected: `0.1.3`.

- [ ] **Step 5: rsync web-core v0.2.0 to oci1.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git checkout v0.2.0
rsync -az --delete --exclude node_modules --exclude .git --exclude logs \
  -e "ssh -i ~/.ssh/oci_wavemax" \
  /mnt/c/Users/rickh/GitHub/crhs-web-core/ ubuntu@161.153.71.201:/var/www/crhs-web-core/
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'node -p "require(\"/var/www/crhs-web-core/package.json\").version" && test ! -e /var/www/crhs-web-core/src/config/storeIPs.js && echo "storeIPs.js absent (expected)"'
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git checkout main
```
Expected:
```
0.2.0
storeIPs.js absent (expected)
```
Add `--rsync-path="sudo rsync"` if permission is denied.

- [ ] **Step 6: Update BOTH consumers on oci1 in the same window, then reinstall each.** The consumer PRs and the core must arrive together — the affiliate's `csrf-config.js`/`server.js:20` pair and corporate's session mount are the boot-breaking ones. The corporate repo is **private**: probe first (Global Constraint 19).
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'set -e; cd /var/www/wavemax/wavemax-affiliate-program && git pull --ff-only && git rev-parse --short HEAD && npm install --install-links 2>&1 | tail -3'
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'cd /var/www/crhs-corporate && (git fetch --dry-run origin 2>&1 | head -3); git rev-parse --short HEAD'
# if the fetch SUCCEEDED:
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'set -e; cd /var/www/crhs-corporate && git pull --ff-only && git rev-parse --short HEAD && npm install --install-links 2>&1 | tail -3'
# if the fetch FAILED on auth (never delete .env / node_modules / logs):
rsync -az --delete --exclude node_modules --exclude .git --exclude logs --exclude .env \
  -e "ssh -i ~/.ssh/oci_wavemax" \
  /mnt/c/Users/rickh/GitHub/crhs-corporate/ ubuntu@161.153.71.201:/var/www/crhs-corporate/
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'set -e; cd /var/www/crhs-corporate && npm install --install-links 2>&1 | tail -3'
```
Expected: both print new short SHAs and an npm summary with **no `ERESOLVE`** and no `npm ERR!`.

- [ ] **Step 7: Prove the topology and the new API on oci1 BEFORE reloading** (a require-time failure must be caught out-of-process, not by a crash loop).
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'cd /var/www/wavemax/wavemax-affiliate-program && bash /var/www/crhs-web-core/scripts/deploy/verify-topology.sh && node -e "
  const {conditionalCsrf,csrfTokenEndpoint}=require(\"./server/config/csrf-config\");
  if(typeof conditionalCsrf!==\"function\"||typeof csrfTokenEndpoint!==\"function\"){console.error(\"CSRF SHAPE BROKEN\");process.exit(1)}
  console.log(\"csrf export shape OK\");
  require(\"@crhs/web-core\").ipGate; console.log(\"ipGate ok\");
  console.log(\"adminIpGate\", typeof require(\"./server/middleware/adminIpGate\"));
  console.log(\"operatorIpGate\", typeof require(\"./server/middleware/operatorIpGate\"));"'
```
Expected:
```
true true 0.2.0
csrf export shape OK
ipGate ok
adminIpGate function
operatorIpGate function
```
`typeof conditionalCsrf === "undefined"` here means `app.use(undefined)` at `server.js:629` and the portal will not start — **do not reload**; go to Step 12.

- [ ] **Step 8: Prove corporate's topology, gate wiring and session shape on oci1 (still before reload).**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'cd /var/www/crhs-corporate && bash /var/www/crhs-web-core/scripts/deploy/verify-topology.sh && node -e "
  const wc=require(\"@crhs/web-core\");const m=require(\"mongoose\");const AG=require(\"./server/models/AccessGate\");
  console.log(\"keys\",Object.keys(wc).length);
  console.log(\"modelBase\",AG.base===wc.SystemConfig.base,\"coreOnAppMongoose\",wc.SystemConfig.base===m);
  const s=wc.buildSessionMiddleware({mongoUrl:\"mongodb://127.0.0.1:1/x\",secret:\"x\",ttlSeconds:600,cookieName:\"wavemax.sid\"});
  if(typeof s.middleware!==\"function\"){console.error(\"SESSION SHAPE BROKEN\");process.exit(1)}
  console.log(\"session shape ok\");
  console.log(\"mediatorGate\",typeof require(\"./server/middleware/mediatorGate\"));
  console.log(\"apiLimiter\",typeof wc.rateLimiting.apiLimiter);
  require(\"@crhs/web-core\").ipGate; console.log(\"ipGate ok\");"'
```
Expected:
```
true true 0.2.0
keys 26
modelBase true coreOnAppMongoose true
session shape ok
mediatorGate function
apiLimiter function
ipGate ok
```
`wc.rateLimiting.apiLimiter` is corporate's **only** `wc.rateLimiting` reference (`server.js:77`) — the three deleted dead limiters were mounted nowhere, so their removal cannot break `:3001`.

- [ ] **Step 9: Reload oci1 — affiliate first, then corporate — and watch the restart counter.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'pm2 reload wavemax && sleep 8 && pm2 reload crhs-corporate && sleep 8 && pm2 jlist | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>JSON.parse(s).forEach(a=>console.log(a.name,a.pm2_env.status,\"restarts=\"+a.pm2_env.restart_time)))" && sleep 20 && pm2 jlist | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>JSON.parse(s).forEach(a=>console.log(a.name,a.pm2_env.status,\"restarts=\"+a.pm2_env.restart_time)))"'
```
Expected: both `online` in both samples, with the SAME `restarts=` value 20 seconds apart (at most +1 vs. Step 3). A number that grows between the two samples is a crash loop → Step 12.

- [ ] **Step 10: Full post-deploy verification on oci1 — every silent-failure check.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'echo "-- portal --"; curl -s -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health; echo; curl -s -o /dev/null -w "csrf-token %{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/api/csrf-token; curl -s -o /dev/null -w "spa %{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/embed-app-v2.html; echo "-- portal frame-src --"; curl -s -D- -o /dev/null -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/embed-app-v2.html | grep -io "frame-src[^;]*" ; echo "-- corporate --"; curl -s -i -H "Host: crhsent.com" http://127.0.0.1:3001/health | grep -Ei "^HTTP|^set-cookie|^cache-control"; curl -s -o /dev/null -w "corp-home %{http_code}\n" -H "Host: crhsent.com" http://127.0.0.1:3001/; curl -s -D- -o /dev/null -H "Host: crhsent.com" http://127.0.0.1:3001/ | grep -i "^set-cookie"; echo "-- access gate (SILENT FAILURE CHECK) --"; pm2 logs crhs-corporate --lines 120 --nostream 2>/dev/null | grep -E "SystemConfig seeded|Access gate cache (loaded|load failed)" | tail -4; echo "-- errors --"; pm2 logs wavemax --lines 300 --nostream 2>/dev/null | grep -cE "ORA-04036|MODULE_NOT_FOUND|OverwriteModelError"; pm2 logs crhs-corporate --lines 300 --nostream 2>/dev/null | grep -cE "ORA-04036|MODULE_NOT_FOUND|OverwriteModelError"'
```
Expected:
```
{"status":"UP","timestamp":"…","environment":"production"}
csrf-token 200
spa 200
frame-src 'self' https://portal.atxwashdryfold.com https://wavemax-bag-registration.firebaseapp.com https://www.google.com https://maps.google.com https://my.matterport.com https://challenges.cloudflare.com https://www.recaptcha.net
HTTP/1.1 200 OK
Cache-Control: no-store
corp-home 200
Set-Cookie: __Host-wavemax.sid=…; Path=/; HttpOnly; Secure; SameSite=None
info: SystemConfig seeded; access_gate_enabled=false
info: Access gate cache loaded: disabled; N whitelisted IP(s); password set
0
0
```
Six hard requirements in one screen: `csrf-token 200` (Task 45 adoption intact); the portal `frame-src` **contains `wavemax-bag-registration.firebaseapp.com`** (Global Constraint 15 — its absence silently breaks claim-page phone auth and no health check catches it); `/health` on `:3001` has **no `set-cookie`** (gate G2 live); crhsent still sets **`__Host-wavemax.sid`**, not `__Host-app.sid` (no session drop); `Access gate cache loaded:` present with **no** `load failed`; and zero `ORA-04036` / `MODULE_NOT_FOUND` / `OverwriteModelError`.

- [ ] **Step 11a: Confirm the CF pool still sees oci1 healthy before starting oci2.**
```bash
export CF_TOKEN=$(cat ~/.cf_api_token); export CF_ACCT=b69ef162d008b11492296d3b35cad2fe; export CF_POOL=1e3795c02e98b9506cfab578c9cb7c97
curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCT/load_balancers/pools/$CF_POOL/health" -H "Authorization: Bearer $CF_TOKEN" \
| node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).result.pop_health;const bad=[];for(const [pop,v] of Object.entries(r)){for(const o of v.origins){for(const [ip,st] of Object.entries(o)){if(!st.healthy)bad.push(pop+" "+ip+" "+st.failure_reason);}}}console.log("unhealthy:",bad.length);bad.slice(0,5).forEach(x=>console.log("  ",x));});'
```
Expected `unhealthy: 0` (after Task 12 this is the portal's own `/health` answering).

- [ ] **Step 11b: oci2 — capture BEFORE state and snapshot.** Run Step 3's command and Step 4's command with `144.24.4.202`. **Record both consumer SHAs.** Expected: same shape as oci1; snapshot prints `0.1.3`.
- [ ] **Step 11c: oci2 — rsync web-core v0.2.0.** Run Step 5's commands with `144.24.4.202`. Expected: `0.2.0` and `storeIPs.js absent (expected)`.
- [ ] **Step 11d: oci2 — update + reinstall both consumers.** Run Step 6's commands (with the private-repo probe) with `144.24.4.202`. Expected: no `ERESOLVE`.
- [ ] **Step 11e: oci2 — pre-reload proofs.** Run Step 7's and Step 8's commands with `144.24.4.202`. Expected: `true true 0.2.0`, `csrf export shape OK`, `keys 26`, `session shape ok`.
- [ ] **Step 11f: oci2 — reload and verify.** Run Step 9's and Step 10's commands with `144.24.4.202`. Expected: both `online` with stable restart counts, and the full verification block including the Firebase `frame-src` origin, the absent `/health` `set-cookie`, and `__Host-wavemax.sid` on crhsent.

- [ ] **Step 12: Rollback (per box) — restore v0.1.3 and the previous consumer commits, TOGETHER.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@<BOX_IP> 'sudo rm -rf /var/www/crhs-web-core && sudo mv /var/www/crhs-web-core.bak /var/www/crhs-web-core && node -p "require(\"/var/www/crhs-web-core/package.json\").version"'
# expect: 0.1.3
ssh -i ~/.ssh/oci_wavemax ubuntu@<BOX_IP> 'cd /var/www/wavemax/wavemax-affiliate-program && git reset --hard <AFFILIATE_SHA_FROM_STEP_3> && npm install --install-links 2>&1 | tail -3'
ssh -i ~/.ssh/oci_wavemax ubuntu@<BOX_IP> 'cd /var/www/crhs-corporate && git reset --hard <CORPORATE_SHA_FROM_STEP_3> && npm install --install-links 2>&1 | tail -3'
ssh -i ~/.ssh/oci_wavemax ubuntu@<BOX_IP> 'pm2 reload wavemax && pm2 reload crhs-corporate && sleep 10 && curl -s -o /dev/null -w "portal %{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health && curl -s -o /dev/null -w "csrf %{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/api/csrf-token && curl -s -o /dev/null -w "corp %{http_code}\n" -H "Host: crhsent.com" http://127.0.0.1:3001/health'
```
Expected after rollback: `portal 200`, `csrf 200`, `corp 200`, and the Step 7/8 one-liners printing `true true 0.1.3`. Core and consumers must roll back **together** — a v0.1.3 core under the `createCsrf` call is just as broken as the reverse. `git reset --hard` on a box is destructive: confirm with Rick first. If the corporate checkout was delivered by rsync, roll it back by re-rsyncing from a local `git worktree add ../crhs-corporate-prev <CORPORATE_SHA_FROM_STEP_3>`.

- [ ] **Step 13: Record Deploy B and commit the evidence.** Append to `docs/refactor/plan1-exit-gate.md`:
```markdown
## Deploy B — web-core v0.2.0 + consumer co-requisites, <DATE>
| box | core | verify aff | verify corp | wc keys | csrf-token | portal frame-src has Firebase | corp /health Set-Cookie | crhsent cookie | Access gate | ORA/MODULE/Overwrite | restarts wavemax | restarts crhs-corporate |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| oci1 | 0.2.0 | true true 0.2.0 | true true 0.2.0 | 26 | 200 | yes | none | __Host-wavemax.sid | loaded | 0 | <b>→<a> | <b>→<a> |
| oci2 | 0.2.0 | true true 0.2.0 | true true 0.2.0 | 26 | 200 | yes | none | __Host-wavemax.sid | loaded | 0 | <b>→<a> | <b>→<a> |

CORS_ORIGIN on both boxes (corporate): <value or unset> — recorded confirm-first per
Global Constraint 18. SESSION_COOKIE_NAME on both boxes: <value or unset>.
```
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git add docs/refactor/plan1-exit-gate.md && git commit -m "$(cat <<'EOF'
docs(plan1): record Deploy B (web-core v0.2.0 + consumer co-requisites) on both boxes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)" && git push origin main
```

---

### Task 56: **HUMAN-CONFIRM** — post-deploy verification of the session slice (and its rollback)

**Files:** none (production verification only). The deploy itself is Task 55; this task runs immediately after it, per box.

**Interfaces:**
- Consumes: Task 55's deploy on the box being checked; the corporate rollback SHA recorded in Task 55 Step 3 / Step 11b and the `/var/www/crhs-web-core.bak` snapshot taken in Task 55 Step 4 / Step 11b.
- Produces: proof that crhsent.com still sets `__Host-wavemax.sid` and that no `.env` edit is required by the session slice.
- **No production `.env` change belongs to Plan 1.** `SESSION_COOKIE_NAME=crhsent.sid` and `collectionName: 'sessions_corporate'` are Plan 2 Phase 0a. If a box already has `SESSION_COOKIE_NAME` set, Task 29's expression honours it and the cookie base is whatever that value is — Task 55 Step 2 already read it; re-confirm below.

- [ ] **Step 1: Confirm the rollback references exist before verifying** (they were captured in Task 55; re-print them so this task can act alone in an incident).
```bash
for H in 161.153.71.201 144.24.4.202; do
  ssh -i ~/.ssh/oci_wavemax ubuntu@$H "echo -n \"$H core.bak=\"; (node -p \"require('/var/www/crhs-web-core.bak/package.json').version\" 2>/dev/null || echo MISSING); echo -n \"$H corporate HEAD=\"; git -C /var/www/crhs-corporate rev-parse --short HEAD"
done
```
Expected: `core.bak=0.1.3` on both boxes and a corporate SHA. **If `core.bak` prints `MISSING`, there is no rollback source** — stop and take one (`sudo cp -a /var/www/crhs-web-core /var/www/crhs-web-core.bak` is not useful now that it is already v0.2.0; instead prepare a local `git worktree add ../crhs-web-core-prev v0.1.3` to re-rsync from).

- [ ] **Step 2: Confirm `SESSION_COOKIE_NAME` for the corporate app on each box.**
```bash
for H in 161.153.71.201 144.24.4.202; do ssh -i ~/.ssh/oci_wavemax ubuntu@$H "grep -n '^SESSION_COOKIE_NAME' /var/www/crhs-corporate/.env || echo 'UNSET (expected)'"; done
```
Expected: `UNSET (expected)` on both. If it IS set, the live cookie base follows that value — record it and adjust Step 4's expectation accordingly rather than "fixing" the env.

- [ ] **Step 3: Confirm corporate booted on :3001 on each box.**
```bash
for H in 161.153.71.201 144.24.4.202; do
  echo "== $H =="
  ssh -i ~/.ssh/oci_wavemax ubuntu@$H 'pm2 describe crhs-corporate | grep -E "status|restarts"; curl -s -o /dev/null -w "%{http_code}\n" -H "Host: crhsent.com" http://127.0.0.1:3001/health'
done
```
Expected per box: `status │ online`, a restart count that did not climb after the reload, and `200`. A crash loop here means `app.use()` got a non-function — i.e. Task 29 did not reach the box; go to Step 5.

- [ ] **Step 4: Confirm the live cookie base is unchanged (no session drop).**
```bash
curl -sI https://crhsent.com/ | grep -i '^set-cookie'
```
Expected: a `Set-Cookie: __Host-wavemax.sid=…; Path=/; HttpOnly; Secure; SameSite=None` line. `__Host-app.sid` here means Task 29 was not deployed with the core change — roll back (Step 5) rather than leaving mixed versions.

- [ ] **Step 5: ROLLBACK (only if Step 3 or Step 4 fails), per box.**
```bash
BOX=<161.153.71.201 or 144.24.4.202>
ssh -i ~/.ssh/oci_wavemax ubuntu@$BOX "sudo rsync -a --delete /var/www/crhs-web-core.bak/ /var/www/crhs-web-core/ && \
  cd /var/www/crhs-corporate && git reset --hard <CORPORATE_SHA from Task 55 Step 3/11b> && \
  npm install --install-links 2>&1 | tail -2 && \
  pm2 reload crhs-corporate --update-env && sleep 5 && \
  curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: crhsent.com' http://127.0.0.1:3001/health"
curl -sI https://crhsent.com/ | grep -i '^set-cookie'
```
Expected: `200`, then `__Host-wavemax.sid`. `git reset --hard` is destructive — confirm with Rick before running it, even in an incident. If `/var/www/crhs-web-core` is not a git checkout on the box (it is delivered by rsync), the `.bak` restore above is the only rollback path; if that is missing, re-rsync from a local `git worktree add ../crhs-web-core-prev v0.1.3`.

- [ ] **Step 6: Confirm the portal was not disturbed (it consumes none of the session slice).**
```bash
curl -sI https://portal.atxwashdryfold.com/health | head -3
curl -sI https://portal.atxwashdryfold.com/ | grep -i '^set-cookie'
```
Expected: `HTTP/2 200` on `/health` with **no** `Set-Cookie` (affiliate `server.js:413-424` mounts it above session), and `__Host-portal.sid` on `/`.

---

### Task 57: **HUMAN-CONFIRM** — post-deploy verification of the SystemConfig / D15b slice

**Files:** none (production verification only). Runs immediately after Task 55, per box. **This task performs no rsync, no `git pull` and no `pm2 reload` for the release** — Task 55 owns those.

**Interfaces:**
- Consumes: Task 55's deploy; Tasks 33 (core trim), 34–35 (corporate boot seeding), 36 (affiliate guard)
- Produces: evidence that `crhs-corporate` seeds `access_gate_enabled` on boot, that the gate stays disabled (no user-visible change), and that the affiliate portal still seeds its own 26 keys from its inline model

- [ ] **Step 1: Prepare the rollback source BEFORE verifying** (so it exists if Step 4 fails).
```bash
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core worktree add /mnt/c/Users/rickh/GitHub/crhs-web-core-prev v0.1.3
ls -d /mnt/c/Users/rickh/GitHub/crhs-web-core-prev && node -p "require('/mnt/c/Users/rickh/GitHub/crhs-web-core-prev/package.json').version"
for H in 161.153.71.201 144.24.4.202; do ssh -i ~/.ssh/oci_wavemax ubuntu@$H "echo -n \"$H corporate HEAD=\"; git -C /var/www/crhs-corporate rev-parse --short HEAD"; done
```
Expected: the worktree path exists and prints `0.1.3`; one `corporate HEAD=` line per box. Record both SHAs.

- [ ] **Step 2: Verify the shared collection and the live surface on oci1.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'pm2 logs crhs-corporate --lines 60 --nostream 2>/dev/null | grep -E "SystemConfig seeded|Access gate cache" | tail -3; curl -s -o /dev/null -w "corp /health %{http_code}\n" -H "Host: crhsent.com" http://127.0.0.1:3001/health; curl -s -o /dev/null -w "portal /health %{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health; curl -s -o /dev/null -w "crhsent / %{http_code}\n" -H "Host: crhsent.com" http://127.0.0.1:3001/'
```
Expected, in this order:
```
info: SystemConfig seeded; access_gate_enabled=false
info: Access gate cache loaded: disabled; N whitelisted IP(s); password set
corp /health 200
portal /health 200
crhsent / 200
```
Any `Access gate cache load failed:` line is a **stop** — roll back at Step 4. `crhsent / 200` is the "gate still disabled, no user-visible behaviour change" proof.

- [ ] **Step 3: Repeat Step 2 verbatim for oci2** (`ubuntu@144.24.4.202`), only after oci1 is green. Expected: identical output.

- [ ] **Step 4: Rollback (only if an expectation above missed), per box.** Seeded documents need no rollback: the three core keys are the same documents v0.1.3 seeded, and the 23 affiliate keys are still seeded by the portal's inline model.
```bash
BOX=<161.153.71.201 or 144.24.4.202>
rsync -az --delete --exclude node_modules --exclude .git --exclude logs \
  -e "ssh -i ~/.ssh/oci_wavemax" \
  /mnt/c/Users/rickh/GitHub/crhs-web-core-prev/ ubuntu@$BOX:/var/www/crhs-web-core/
ssh -i ~/.ssh/oci_wavemax ubuntu@$BOX "cd /var/www/crhs-corporate && git reset --hard <CORPORATE_SHA from Step 1> && npm install --install-links && pm2 reload crhs-corporate --update-env && sleep 5 && curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: crhsent.com' http://127.0.0.1:3001/health"
```
Expected: `200`, and re-running Step 2 shows the pre-v0.2.0 log lines. Confirm with Rick before the `git reset --hard`.

- [ ] **Step 5: Clean up the rollback worktree once both boxes are verified green.**
```bash
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core worktree remove /mnt/c/Users/rickh/GitHub/crhs-web-core-prev
git -C /mnt/c/Users/rickh/GitHub/crhs-web-core worktree list
```
Expected: the `-prev` path is gone from the listing.

---

### Task 58: Plan 1 exit gate — both apps on v0.2.0, one mongoose, suites green, zero user-visible change

Not human-gated (read-only checks), but it is the sign-off that authorises Plan 2 to start.

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/docs/refactor/plan1-exit-gate.md` (final section)
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tasks/todo.md` (tick the Plan 1 items)
- Test: re-runs of the three suites; no new test code

**Interfaces:**
- Consumes: the before/after values recorded in Task 1 Step 5, Task 11 Step 2, Task 12 Step 10, Task 55 Steps 3 and 13
- Produces: a signed-off `docs/refactor/plan1-exit-gate.md` with the five exit conditions each backed by a pasted command output, plus the list of spec deviations Plans 2–4 inherit

- [ ] **Step 1: Re-run all three suites and paste the totals.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -5
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest --runInBand 2>&1 | tail -5
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npm test 2>&1 | tail -5
```
Expected: web-core `0 failed`; corporate exactly **4** failed, all in `tests/crhsent-parity.test.js` (the pre-existing ENOENT baseline from Task 1 Step 5; deleted in Plan 2 A1) with a passing count of `<CORP_BASE_PASS>` plus every case Plan 1 added (Tasks 7, 10, 19, 24, 29, 34, 35); affiliate `0 failed`, matching its Task 2 baseline plus every Plan 1 addition.

- [ ] **Step 2: Prove "one mongoose" on both boxes for both apps, in one pass.**
```bash
for ip in 161.153.71.201 144.24.4.202; do
  echo "== $ip =="
  ssh -i ~/.ssh/oci_wavemax ubuntu@$ip 'cd /var/www/wavemax/wavemax-affiliate-program && printf "affiliate: " && bash /var/www/crhs-web-core/scripts/deploy/verify-topology.sh; cd /var/www/crhs-corporate && printf "corporate: " && bash /var/www/crhs-web-core/scripts/deploy/verify-topology.sh'
done
```
Expected on both boxes:
```
affiliate: true true 0.2.0
corporate: true true 0.2.0
```

- [ ] **Step 3: Prove "no user-visible change" — compare the nonce-normalized CSP fingerprints and the smoke-code matrix against the Deploy-B before-values.** Re-run the exact command from Task 55 Step 3 on both boxes and diff by eye against what you recorded there.
Expected: the six status codes and the crhsent `Set-Cookie` line are identical to the before-values, and the **crhsent CSP hash is unchanged** (corporate asserts its CSP by shape, `tests/server.integration.test.js:29-45`, and Task 24's profile work leaves the `/wavemax/` output alone). The **portal CSP hash changes**, and only because of the deliberate D16a re-capture in Task 26 — the change must be exactly the position of `https://wavemax-bag-registration.firebaseapp.com` inside `frame-src`, with no origin gained or lost in any directive. Confirm with:
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'curl -s -D- -o /dev/null -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/embed-app-v2.html | grep -io "frame-src[^;]*" | tr " " "\n" | sort | tr "\n" " "'
```
Expected (sorted token multiset, order-independent): `'self' frame-src https://challenges.cloudflare.com https://maps.google.com https://my.matterport.com https://portal.atxwashdryfold.com https://wavemax-bag-registration.firebaseapp.com https://www.google.com https://www.recaptcha.net`.

- [ ] **Step 4: Confirm G1 is still in place and the pool is healthy.**
```bash
export CF_TOKEN=$(cat ~/.cf_api_token); export CF_ACCT=b69ef162d008b11492296d3b35cad2fe
curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCT/load_balancers/monitors/be6953d2e0cfd7b40c4f414b5ddf20d9" -H "Authorization: Bearer $CF_TOKEN" \
| node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).result;console.log("Host",JSON.stringify(r.header.Host),"path",r.path,"codes",r.expected_codes,"body",JSON.stringify(r.expected_body),"follow",r.follow_redirects,"desc",JSON.stringify(r.description));});'
```
Expected:
```
Host ["portal.atxwashdryfold.com"] path /health codes 200 body "" follow false desc "portal web /health"
```

- [ ] **Step 5: Write the exit-gate sign-off and commit.** Append to `docs/refactor/plan1-exit-gate.md`:
```markdown
## Plan 1 exit gate — SIGNED OFF <DATE>
1. Both apps boot on `@crhs/web-core@0.2.0` on oci1 and oci2 — `verify-topology.sh` prints `true true 0.2.0` for both consumer dirs on both boxes.
2. One mongoose per process; the `mongodb` driver split is closed (second field `true`), so `installCursorRetry` (affiliate `server.js:59-60`) patches the driver mongoose actually uses.
3. Suites: web-core 0 failed; corporate exactly 4 failed — the pre-existing `crhsent-parity` ENOENT cases only (deleted in Plan 2 A1); affiliate 0 failed.
4. Zero user-visible change: the 6-endpoint smoke matrix, the crhsent CSP fingerprint and the crhsent `__Host-wavemax.sid` cookie are unchanged on both boxes. The single allowed exception is the deliberate D16a golden re-capture (Task 26) — a frame-src ORDER change on the portal, with the token multiset proved equal.
5. Gates: **G1** monitor `header.Host = ["portal.atxwashdryfold.com"]`, description `portal web /health`, pool unhealthy-checks 0; **G2** corporate `/health` returns 200 with `Cache-Control: no-store` and **no `Set-Cookie`**, mounted above `buildSessionMiddleware`.

### Out of scope, deliberately NOT done in Plan 1
The corporate multi-host content app (Plan 2), the affiliate content removal and the nginx flip (Plan 3), and the module-by-module inline-copy adoption (Plan 4). The affiliate still runs its own copies of `SystemConfig.js`, `rateLimiting.js`, `rateLimitMongoStore.js`, `storeIPs.js` and `mongoCursorRetry.js` — which is exactly why v0.2.0's deletions in those modules could not break it.

### Spec deviations carried out of Plan 1 — Plans 2/3/4 inherit these
- **B3g / B3j / B3k deferred to `@crhs/web-core` v0.2.1** (email brand parameterisation + `replyTo` + delete `src/config/brand.js` + the cspHelper `brand === true` shorthand; `validateMailConfig()`; `assets/js/i18n.js` `translationsPath: '/locales'` + `data-i18n-aria-label`), and with them spec §7.2.2's repo-wide `tests/brandNeutral.test.js` — `src/email/transport.js:73`, `src/email/template-manager.js:67` and `assets/js/i18n.js:15` still carry `rundberglaundry.com` fallbacks, so a repo-wide brand grep would be red. Ship with Plan 2 Phase 0a.
- **Corporate keeps `collectionName: 'sessions'` and the `wavemax.sid` cookie base** (spec §7.5 B4a / §7.6.1 schedule `sessions_corporate` + `crhsent.sid`). Both flip with Plan 2 Phase 0a, where a one-time session drop is already accepted (D14b/Q-18). **Add both to Plan 2's 0a entry criteria.**
- **Five CSRF `PUBLIC_ENDPOINTS` rows retained** in `server/config/csrfTables.js` (`/api/concierge`, the two partner-inquiry and the two affiliate-application paths). Spec §7.2.8 / §7.5 B4c prune them, but that assumes D6a/D2a route removal, which is Plan 3. **Plan 3 deletes the rows in the same PR that deletes the routes** (`server.js:644`, `:703`, `:704`) and removes `tests/integration/partnerInquiry.test.js` + `affiliateApplication.test.js`; `tests/unit/csrfTables.test.js` pins them until then.
- **Spec §7.2.9's remaining deletions carved out**: `src/security/securityHeaders.js:83-88`, `assets/js/{iframe-bridge-v2,parent-iframe-bridge-v3}.js`, `assets/legal/*`. The portal still serves `public/assets/js/parent-iframe-bridge-v3.js` cross-origin. D9a/D3a, with the Item-A bridge retirement in Plan 3.
- **Affiliate PR B7 handed to Plan 4** with two defects recorded in `tasks/todo.md` (the `LIMITER_NAMES` live-getter trap; the two-not-three assertion count in `tests/integration/administratorRoutes.test.js`).
- **No prod `.env` key written.** Plan 2 Phase 0a must set corporate `LOG_DIR` (evidence gathered in Task 16) and, if unset, the affiliate's.

### Note for future reviewers
The "deleting `contactFormBurstLimiter`/`contactFormLimiter` from core takes crhsent.com down at require time" hazard **does not exist**. Corporate's only `wc.rateLimiting` reference is `server.js:77` `app.use('/api/', wc.rateLimiting.apiLimiter)`; the affiliate mounts the two contact limiters from its own `server/middleware/rateLimiting.js:190,213`. They were nonetheless kept in v0.2.0 for a different, real reason — copy-before-delete (Global Constraint 13). Do not re-add the phantom constraint, and do not delete them before Plan 4 PR B7.
```
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git add docs/refactor/plan1-exit-gate.md tasks/todo.md && git commit -m "$(cat <<'EOF'
docs(plan1): exit gate signed off — both apps on web-core v0.2.0, one mongoose,
gates G1+G2 verified, no user-visible change

Records the spec deviations Plans 2/3/4 inherit: B3g/B3j/B3k + brandNeutral
deferred to v0.2.1, corporate collectionName/cookie base to Plan 2 0a, the five
CSRF intake rows to Plan 3, the securityHeaders/bridge deletions to Plan 3, and
affiliate PR B7 to Plan 4.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)" && git push origin main
```

---

## Definition of done

Plan 1 is complete when **every** line below is checked, each backed by a pasted command output in `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/docs/refactor/plan1-exit-gate.md`:

**Topology**
- [ ] `@crhs/web-core` declares `connect-mongo`, `express-rate-limit`, `express-session` and `mongoose` in `peerDependencies` **and** `devDependencies`, in neither `dependencies`, and declares no `mongodb` anywhere (`tests/packageTopology.test.js` green).
- [ ] `wavemax-affiliate-program/.npmrc` contains `install-links=true`; `node_modules/@crhs/web-core` is a real directory, not a symlink; both consumers' `package-lock.json` are regenerated and committed, neither recording `"link": true`.
- [ ] `crhs-corporate/package.json` declares the same four at web-core's exact peer ranges; `server.js:20-22` and the README describe the copy semantics.
- [ ] `scripts/deploy/verify-topology.sh` prints `true true 0.2.0` in **both** consumer directories on **both** boxes.
- [ ] `installCursorRetry` patches `require('mongoose').mongo.Collection` — the driver split is closed.

**Library**
- [ ] `@crhs/web-core` is version `0.2.0`, tagged `v0.2.0`, with `Object.keys(require('@crhs/web-core')).length === 26` and neither `storeIPs` nor `previewUnlockCookie` present.
- [ ] `src/middleware/ipGate.js` exports `{ createIpGate, parseList, entryMatches, isInRange }` and contains zero occurrences of `config/storeIPs`; `require('@crhs/web-core').ipGate` loads on both boxes.
- [ ] `wc.csrf` exports `{ createCsrf, CSRF_COOKIE_NAME }`; `src/config/csrf-config.js` contains zero `/api/v1/` literals.
- [ ] `buildSessionMiddleware` returns `{ middleware, store, cookieName, sessionMaxAge }`, accepts `collectionName`, composes `_maxAgeFixer`, and defaults `DEFAULT_COOKIE_BASE` to `'app.sid'`; `grep -ni wavemax src/config/sessionStore.js` is empty.
- [ ] `SystemConfig` exposes frozen `CORE_DEFAULTS` (3 keys), validating `registerDefaults()`, `getRegisteredDefaults()` and `clearRegisteredDefaults()`; `grep -ni wavemax src/models/SystemConfig.js` is empty.
- [ ] `rateLimiting` exposes `LIMITER_NAMES` (live getter), `collectionPrefix()`, `collectionNameFor()`, `sweepExpired()`, `resetBuckets()`, `keyGenerators`, `isRelaxed`, `isTest`; `emailVerificationLimiter` / `fileUploadLimiter` / `adminOperationLimiter` are gone; `contactFormBurstLimiter` / `contactFormLimiter` remain.
- [ ] `auditLogger` honours `LOG_DIR`; `corsConfig` admits only `CORS_ORIGIN` ∪ `CORS_EXTRA_ORIGINS`; `buildCspDirectives` takes `profile` + the four `*Extra` arrays + `frameAncestors`, carrying no app or host literal.

**Consumers, in the same releases**
- [ ] Affiliate: `server/config/csrfTables.js` (60 rows) + `csrf-config.js` = `createCsrf({ tables })`; `server.js:20/:629/:632` unchanged and the boot smoke prints `csrf export shape OK`.
- [ ] Affiliate: `server.js` CSP call site passes `profile: 'full'`, the five location origins in `imgSrcExtra`/`connectSrcExtra`, `frameSrcExtra` **including** `https://wavemax-bag-registration.firebaseapp.com`, and `frameAncestors: ["'self'"]`; `madge --circular server/` is zero.
- [ ] Corporate: `{ middleware: sessionMiddleware }` destructure with `cookieName: process.env.SESSION_COOKIE_NAME || 'wavemax.sid'` and no `collectionName`; CSP call site with the demo `frameSrcExtra`; `seedSystemConfig()` between `db.connect()` and `accessGate.loadCache()`; smoke test at 26 keys.
- [ ] Corporate `/health` is mounted **above** the session middleware and returns 200 / `{"status":"ok"}` / `Cache-Control: no-store` / **no `Set-Cookie`** — verified live on both boxes.

**Gates**
- [ ] **G1**: CF monitor `be6953d2e0cfd7b40c4f414b5ddf20d9` has `header.Host = ["portal.atxwashdryfold.com"]` and `description = "portal web /health"`, every other field byte-unchanged; pool `1e3795c02e98b9506cfab578c9cb7c97` reports 0 unhealthy origin-checks; `Cloudflare-Traffic-Manager` probes appear in `portal.atxwashdryfold.com.access.log` on both boxes; `docs/ops/HA-FAILOVER-PLAN.md:29,51` and the `production_systems_access.md` memory are corrected.
- [ ] **G2**: proven by the corporate `/health` bullet above and by `tests/server.integration.test.js`.

**Releases and safety**
- [ ] Exactly **two** deploys happened: Task 11 (v0.1.3, topology only) and Task 55 (v0.2.0, API + consumers) — oci1, verified, then oci2, never in parallel.
- [ ] No production `.env`, nginx or Cloudflare change beyond the single G1 monitor PATCH.
- [ ] Every commit in all three repos carries `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`; no commit used `--no-verify`.
- [ ] Three suites green: web-core `0 failed`; affiliate `0 failed`; corporate exactly the 4 pre-existing `tests/crhsent-parity.test.js` ENOENT failures and no others.
- [ ] `pm2` shows `wavemax` and `crhs-corporate` `online` on both boxes with no restart-count climb, and zero `ORA-04036` / `MODULE_NOT_FOUND` / `OverwriteModelError` in either log.
- [ ] The exit-gate document records every spec deviation Plans 2/3/4 inherit (B3g/B3j/B3k + `brandNeutral` → v0.2.1; corporate `collectionName`/cookie base → Plan 2 0a; the five CSRF intake rows → Plan 3; `securityHeaders.js:83-88` + the bridges → Plan 3; affiliate PR B7 → Plan 4; the `LOG_DIR` prod write → Plan 2 0a).

