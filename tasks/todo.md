# Clean Stack by Friday (mediation 2026-08-28) — todo

Goal: the cleanest possible production stack by Friday. Full-send scope approved by Rick 2026-08-27.
Split is already live (both boxes: `wavemax` :3000 service + `crhs-corporate` :3001; `crhsent.com → :3001`).

## Tier 1 — nginx hygiene (SAFE, independent) [DONE 2026-08-27]
- [x] Inspected sites-enabled (real files, not symlinks; typo = 503 placeholder)
- [x] Moved stale/dup blocks off-tree to `/root/nginx-stale-backups-20260827/` (both boxes)
- [x] Both boxes reconciled to identical 5-file set (atxwashateria, atxwashdryfold, crhsent.com, portal.atxwashdryfold, rundberglaundry)
- [x] `nginx -t` ZERO conflict warnings (was 18+) → reloaded both boxes
- [x] Verified: crhsent.com/wavemax→200 (corporate), www→301, portal→200 on both boxes

## Tier 4 + Phase B — web-core parity (web-core-internal, strict TDD) [DONE 2026-08-27]
- [x] brand.js + 8 modules env-parameterized in web-core (commit `7abc699`, v0.1.1, pushed)
- [x] web-core suite green (30 suites / 539 tests); madge clean
- [x] Golden CSP verified BOTH directions (no-arg==corporate live; monorepo-args==monorepo inline)
- [x] Corporate suite green (8 suites/68 tests) with ZERO corporate change — guardrail held
- [ ] FALLOUT: corporate `crhsent-parity.test.js` ENOENT (hardcoded `SRC_CRHSENT` → monorepo's deleted crhsent/). Repoint to corporate's own `content/` or retire. Test-only, not deploy-blocking.

### Tier-3 cutover config (from Phase B)
- Monorepo env: `SESSION_COOKIE_NAME=portal.sid` (⚠ CRITICAL — else sessions drop), `LOG_SERVICE_NAME=crhs-portal`, `CORS_EXTRA_ORIGINS=https://portal.atxwashdryfold.com`, `BRAND_*` (its values)
- `buildCspDirectives` args: `{imgSrcSelfOrigins:[], connectSrcSelfOrigins:[], imgSrcExtra/connectSrcExtra/frameSrcExtra:['https://portal.atxwashdryfold.com'], frameAncestors:["'self'"]}`
- Pass truthy `brand` (3rd arg) to readHTMLWithNonce/injectNonce
- Box: git pull crhs-web-core (v0.1.1) + symlink `/var/www/wavemax/crhs-web-core → /var/www/crhs-web-core` + monorepo `npm install` + set env + pm2 reload

## Tier 2 — service-only DEPLOYED [DONE 2026-08-27]
- [x] committed e2107288, full suite: 2758 pass (2 fails BOTH pre-existing: i18n-brand-token + expediter early-AM date-boundary — neither Tier-2-caused)
- [x] deployed oci1 + oci2 (git pull --ff-only + pm2 reload); /health UP, portal+app+rundberg+crhsent all 200

## Tier 3 — service app consumes @crhs/web-core [COMMITTED 4447fec3, DEPLOY HELD 2026-08-27]
- [x] Consumes web-core for CSP builder + security headers + 10 shimmed modules (encryption, cspHelper, logger, csrf, ipGate, cspNonce, clientIp, controllerHelpers, validateSecrets, geocodingService)
- [x] Kept inline (deliberate): session (Oracle-diag store handle), CORS (excludes franchisor domains), storeIPs+template-manager+SystemConfig+utility mods (test-coupling)
- [x] Golden-master byte-identical (CSP strict+non-strict, portal.sid cookie, encryption); full suite 2764 pass (only pre-existing i18n fails)
- [x] Committed 4447fec3 + pushed
- [ ] ⛔ DEPLOY HELD — oci1 crash-looped on reload: **ORA-04036 (Oracle ADB PGA memory limit)**. `require('@crhs/web-core')` eagerly loads web-core's full index incl. DB-touching modules (SystemConfig/mongo diagnostics → likely 2nd mongoose/connection footprint), tipping the memory-constrained ADB. Rolled back oci1 to e2107288, both boxes healthy on Tier 2.
- [ ] FIX (post-Friday): make web-core index lazy-load DB modules (or monorepo requires web-core submodules directly) so no extra DB footprint; re-test; re-deploy. Box already staged: /var/www/crhs-web-core=v0.1.1, symlink /var/www/wavemax/crhs-web-core exists.

## STACK STATE (2026-08-27, live both boxes)
- Tier 1 (nginx clean) ✅ live · Tier 2 (service-only) ✅ live · corporate serves crhsent ✅ · web-core v0.1.1 ✅ committed · Tier 3 ✅ committed, ⛔ deploy held (ADB)
- Visible "independent components" separation is LIVE + the refactoring is in git; only the invisible web-core-consumption plumbing is undeployed.

## Tier 2 — service-only (strip dead crhsent/corporate code) [live app]
- [ ] Scope what crhsent/corporate code remains in the monorepo (server.js host chain, crhsent/ tree, accessGate, mediatorGate)
- [ ] Remove it (move-then-delete); service app boots; all service routes/tests green
- [ ] Deploy oci1 → verify → oci2 → verify

## KEY FINDINGS (2026-08-27 scoping)
- Full-send scope CONFIRMED by Rick (twice, incl. after I surfaced the session-drop/parity risk).
- Split already LIVE both boxes: `wavemax`:3000 + `crhs-corporate`:3001; crhsent.com→:3001 (verified 200).
- **Tier 2 DEAD set** (crhsent-only, unreachable on :3000): accessGate, mediatorGate, crhsent host-handler, crhsent/ tree (1.2M dupe of corporate). KEEP: partnerLanding (marketing domains), explorerGuard + design-explorer (LIVE on rundberg), locationQuarantine app-domain branch.
- **Tier 3 dep mechanism (proven by corporate):** `"@crhs/web-core":"file:../crhs-web-core"` + `require('@crhs/web-core')`. Box paths: web-core `/var/www/crhs-web-core`, monorepo `/var/www/wavemax/wavemax-affiliate-program` (nested) → add box symlink `/var/www/wavemax/crhs-web-core → /var/www/crhs-web-core` so `file:../crhs-web-core` resolves.
- **web-core is SHARED with live corporate** → Phase-B parity must be ENV-PARAMETERIZED (brand/cookie/CSP), not hardcoded; RE-VERIFY corporate (tests + crhsent.com live) after any web-core change.

## Post-Friday / deferred
- Repo archival/private (litigation-hold: preserve, don't delete; commit history is cited evidence)

## Plan 1 — web-core topology + v0.2.0 + gates G1/G2 (spec 2026-09-09-crhs-content-separation-design.md §7.1, §7.2, §5.2, §8.3.2)

Baseline recorded 2026-09-09: affiliate mongoose split `same: false` (app 8.24.1 / core 8.24.4);
corporate `same: true` but `driver same: false`; web-core 0.1.2; corporate installed copy 0.1.1, lock 0.1.0;
corporate suite baseline 4 failed (all tests/crhsent-parity.test.js ENOENT) / 68 passed.

### Release R1 — topology (@crhs/web-core v0.1.3)
- [ ] Task 3 web-core: cursor-retry + diagnostics resolve the driver through mongoose
- [x] Task 4 web-core: 4 deps → peerDependencies + devDependencies, drop `mongodb`, v0.1.3, `tests/packageTopology.test.js`
- [x] Task 5 affiliate: `.npmrc install-links=true`, lock regen, `tests/integration/webCoreInstanceIdentity.test.js`
- [x] Task 6 affiliate: `tests/setup.js` split guard + `tests/helpers/assertSingleMongoose.js`
- [x] Task 7 corporate: declare the 4 deps, rewrite `server.js:20-22`, README, lock regen, `tests/models.test.js` identity
- [x] Task 8 cross-repo verification sweep; Task 9 hand-off (no box change)
- [x] Task 11 Deploy A (HUMAN-CONFIRM): rsync web-core → `npm install --install-links` in both consumers → identity probe → `pm2 reload` — oci1, verify, oci2

### Gates
- [x] Task 10 — G2 corporate `/health` above `buildSessionMiddleware` (200 / no-store / NO set-cookie)
- [~] ~~Task 12 — G1 CF monitor `header.Host` → portal~~ **SUPERSEDED, DO NOT EXECUTE.** The plan says so
      explicitly: repointing the monitor only MOVES the blind spot. One monitor health-checks one
      service, but both apps run on every box — pointing it at the portal would leave a crash-looping
      `crhs-corporate` undetected and crhsent.com serving 502s from a "healthy" origin. Six load
      balancers share ONE pool and ONE monitor on Basic LB ($5/mo), so a second pool was rejected on
      cost. Gate G1 is satisfied by Tasks 59–61 (`/health/origin` aggregate probe, Rick's Option A).

### Release R2 — @crhs/web-core v0.2.0
- [x] B3a auditLogger LOG_DIR (13-16)   - [x] B3b CORS env-only (17-20)   - [x] B3c CSP profiles + goldens (21-26)
      ^ all three are DONE **and already on the boxes** — deployed early 2026-09-11 (see note under Task 55).
- [ ] B3d session `{middleware,store}` + maxAge fixer + collectionName + 'app.sid' (27-31)
- [ ] B3e SystemConfig registerDefaults + 3 core keys (32-36)
- [ ] B3f rateLimiting mechanism-only + store prefix/TTL/sweep + 3 dead limiters deleted (37-42)
- [ ] B3h csrf `createCsrf({tables})` (43-46)   - [ ] B3i-1 move `isInRange` into ipGate.js (47-52)
- [ ] B3i-2 delete storeIPs + previewUnlockCookie, index 26, corporate smoke 26 (53)
- [ ] Task 54 cut v0.2.0 — **NOW URGENT, was not merely bookkeeping.** The 2026-09-11 deploy proved
      `npm install --install-links` will NOT re-copy web-core while the version string is unchanged:
      it reported "up to date" and left the OLD core installed in both consumers. Every R2 deploy
      needs `rm -rf node_modules/@crhs/web-core` first until this bump lands.
- [~] Task 55 Deploy B (HUMAN-CONFIRM) — **PARTIALLY DONE.** B3a+B3b+B3c reached both boxes on
      2026-09-11 at owner instruction, ahead of the planned single-shot Deploy B. The boxes now run
      v0.2.0 *behaviour* under a `0.1.3` version string. The remaining tranches (B3d-B3i) still need
      their own deploy, so this task is no longer "the single point v0.2.0 reaches the boxes".
- [ ] Tasks 56-57 post-deploy slice verification   - [ ] Task 58 Plan 1 exit gate

### HA (Tasks 59-61) — this is what actually satisfies gate G1
- [ ] Task 59 add `/health/origin` box-level aggregate liveness (both apps, one signal)
- [ ] Task 60 (HUMAN-CONFIRM) deploy `/health/origin` to both boxes; verify it reflects real content-app state
- [ ] Task 61 (HUMAN-CONFIRM) point the CF LB monitor at `/health/origin` — supersedes Task 12

Carve-outs recorded (Global Constraint 16): web-core `securityHeaders.js:83-88`, `assets/js/*bridge*`, `assets/legal/*`
are NOT deleted in Plan 1 (the portal still serves `public/assets/js/parent-iframe-bridge-v3.js` cross-origin).
Spec PRs B3g / B3j / B3k (email brand params + `validateMailConfig()` + `assets/js/i18n.js`) and the repo-wide
`tests/brandNeutral.test.js` are DEFERRED to @crhs/web-core v0.2.1, shipping with Plan 2's Phase 0a.
Affiliate PR B7 (rateLimiting/store adoption, codeAttemptLockout, the `rate_limits` reset fix, the ops script)
is Plan 4. Corporate `collectionName: 'sessions_corporate'` + `SESSION_COOKIE_NAME=crhsent.sid` move to Plan 2 0a.
No prod `.env` key is written in Plan 1 (`RATE_LIMIT_COLLECTION_PREFIX` stays unset so live collection names are unchanged).

## Shipped 2026-09-11 outside the Plan 1 sequence

- [x] **Portal page-load fix** (`9b3e20b3`, `aa4177f4`, deployed). SPA appended `?v=Date.now()` to every
      page script/style + the 73 KB locale bundle, defeating the year-long `immutable` cache on every
      visit; loader is serial, so ~8 sequential origin RTTs. Now one deploy-stable `ASSET_VERSION`.
      LCP 381→321 ms, TTFB 156→96 ms, the 161 ms load-delay phase gone.
      Also fixed a pre-existing bug found on the way: `express.static(public)` was mounted TWICE and
      the bare first mount shadowed the configured one, so the locale CORS headers had never applied.
- [x] **B-1 signup link** → public interest form, config-driven via `INTEREST_FORM_URL` so the Plan 3
      move is a config change, not a 404. Four locales. (`6acbf550`)
- [x] **Admin IP gate removed** (owner decision after the exposure was flagged). Ran in FOUR layers;
      all removed. Admin now internet-reachable, auth + rate-limit only. (`6acbf550`)
- [x] **Interest form**: mandatory customer-acquisition question, enforced server-side (80 char min),
      plus messaging that customer acquisition belongs to the partner. (`6acbf550`)

## Open questions for Rick

- [x] **Operator IP gate — DECIDED 2026-09-11: KEEP IT ON.** (Rick.) `/operator` and the operator embed
      pages stay store-IP gated; verified 404 from an outside IP post-deploy. This is now a deliberate
      asymmetry with the admin surface, which was opened the same day — do NOT "tidy" it up later by
      matching the two. `operatorIpGate` must stay mounted.
- [ ] **Portal CLS is 0.21** (poor). Layout shift, independent of the caching fix. Worth a pass?
- [ ] Two scope cuts still awaiting agreement: web-core B3g/B3j/B3k deferred to v0.2.1, and affiliate
      PR B7 moved to Plan 4 (admin "reset rate limits" stays a silent no-op meanwhile).

## DEFERRED WORK — accepted as deferred, NOT removed (Rick, 2026-09-11)

Rick approved both Plan 1 scope cuts **on the explicit condition that the work is deferred, not
dropped.** This section is the durable record of that promise. It is written here rather than left
to Plan 1's Task 42 (B7 hand-off) and Task 58 (exit-gate deviations) because neither has run yet —
until they do, the only record was prose inside a 61-task plan document.
**Nothing below may be closed without shipping it or getting Rick's explicit agreement to drop it.**

### D-1. web-core PRs B3g / B3j / B3k → `@crhs/web-core` v0.2.1 (with Plan 2 Phase 0a)

- [ ] **B3g** — parameterise `src/email/transport.js` + `src/email/template-manager.js` by brand;
      add `replyTo`; delete `src/config/brand.js`; drop the `cspHelper` `brand === true` shorthand.
      Live anchors (re-verified 2026-09-11): `transport.js:73` and `template-manager.js:67` still
      hard-code `rundberglaundry.com` fallbacks.
- [ ] **B3j** — export `validateMailConfig()`.
- [ ] **B3k** — `assets/js/i18n.js`: `translationsPath: '/locales'` + `data-i18n-aria-label`.
      Live anchor: `assets/js/i18n.js:15` still branches on `window.location.hostname`.
- [ ] **The guard that goes with them** — spec §7.2.2's repo-wide `tests/brandNeutral.test.js`
      (grep `src/` for `wavemax|rundberglaundry|runberglaundry|atxwash|wavemaxlaundry` → 0).
      ⚠️ This is the real cost of the deferral: through v0.2.0 web-core carries brand literals with
      **no repo-wide net**, only two file-scoped substitutes (Task 30 `sessionStore.js`, Task 33
      `SystemConfig.js`). Do not mistake those two for the guard.

### D-2. Affiliate PR B7 (rate-limit adoption) → Plan 4

Plan 1 ships only the web-core MECHANISM half. Three of these five are LIVE DEFECTS, not refactors.

- [ ] **The admin "reset rate limits" control is a DOUBLE no-op — verified against the production
      database 2026-09-11, not inferred.** The store writes **17 `ratelimit_*` collections** keyed on
      `_id`; the admin targets a collection named `rate_limits` **which does not exist at all**. So
      `deleteMany` runs against nothing, returns `deletedCount: 0`, and reports SUCCESS. An admin
      trying to unblock a locked-out user is told it worked and nothing happened. Wrong collection
      AND wrong key field, in three places: `server/services/systemHealthService.js:105`,
      `server/routes/administratorRoutes.js:208`, `scripts/admin/reset-rate-limits.js:36`.
      Fix per spec §7.6.3: fan out over `LIMITER_NAMES` via `resetBuckets({ names, idPattern })`,
      escape regex metacharacters in the ip filter, 400 on an unknown limiter name.
- [ ] **A dead controller shadowed by an inline handler.** `administratorController.resetRateLimits`
      (`:692`) is referenced by NO route; `administratorRoutes.js:197-238` carries an inline copy that
      shadows it. Delete the inline handler, route to the controller. Response message becomes
      `Reset N rate limit entries`; `tests/integration/administratorRoutes.test.js` has **exactly two**
      occurrences to update (`:44`, `:57`) — verify `grep -c 'rate limit records'` → 0 after.
      `tests/unit/simpleRouteHandlers.test.js:49-84` copies the deleted handler into a throwaway
      router and stays green untouched — leave it for the Plan-4 test cull.
- [ ] **`server/services/codeAttemptLockout.js:49`** hand-builds `'ratelimit_' + STORE_NAME`, a second
      source of the collection name that ignores `RATE_LIMIT_COLLECTION_PREFIX`. Read
      `getStore().collectionName` instead; register `STORE_NAME = 'bag_codes'` at module load.
- [ ] Replace `server/middleware/rateLimitMongoStore.js` + `rateLimiting.js` with shims over
      `@crhs/web-core`, plus a local policy module. ⚠️ **COPY-BEFORE-DELETE (Global Constraint 13):**
      copy `windowMs`/`max`/keyGenerator verbatim from core's `contactFormBurstLimiter` (`:190-206`)
      and `contactFormLimiter` (`:213-230`) BEFORE core deletes them. Core deletes its copies in the
      SAME B7 release — earlier and the affiliate gets `router.post(path, undefined, …)` →
      `Route.post() requires a callback function` **at require time**, i.e. the app does not boot.
- [ ] Rewrite `scripts/admin/reset-rate-limits.js` onto the real buckets, add an `--expired` sweep
      mode, export `{ parseArgs, run }` so the behaviour is testable.
- [ ] ⚠️ **`LIMITER_NAMES` IS A LIVE GETTER, NOT A SNAPSHOT.** Destructuring it at require time freezes
      the value before `codeAttemptLockout` registers `bag_codes`, so the admin reset silently skips
      the lockout counters and `--type bag_codes` always throws "Unknown rate limiter". Hold the
      module and read `rateLimiting.LIMITER_NAMES` inside the function.

### D-3. Franchisor origins in the web-core iframe bridge — NOW ACTIONABLE

- [x] **DONE 2026-09-11** (web-core `d2725e7`, affiliate `a37dc497`). Removed from BOTH repos' copies
      (each carries its own `iframe-bridge-v2.js`; the affiliate's `.min.js` was rebuilt). Zero `wavemaxlaundry`
      refs remain in source or built bundles — the removed origins are described, not spelled. Also added the
      missing canonical host `portal.atxwashdryfold.com` and removed a duplicated `rundberglaundry.com`.
      Guard test: `crhs-web-core/tests/assets/bridgeOriginAllowlist.test.js`. Original item:
- [x] ~~Remove the franchisor origins from `crhs-web-core/assets/js/iframe-bridge-v2.js:19-21`~~
      (`https://www.wavemaxlaundry.com`, `https://wavemaxlaundry.com` — 6 `wavemaxlaundry` refs total
      across the bridge assets). These sat behind a deliberate carve-out (Global Constraint 16:
      `assets/js/*bridge*`) whose entire premise was that the app might be embedded in the
      franchisor's WordPress site. **Rick, 2026-09-11: "we will never embed in the franchisor site."**
      The premise is gone, so the carve-out no longer protects anything — these are dead franchisor
      references sitting in our shared library during an active franchise dispute, with a DMCA history.
      Blocked only on web-core being free of a running tranche workflow.

## Backlog — deferred, not scheduled

### B-1. ✅ DONE 2026-09-11 (`6acbf550`) — "Register now" on the affiliate login page must go to the interest form (invite-only)
Raised by Rick 2026-09-11. **Not scheduled — do not action inside Plan 1.**

**Why:** affiliate onboarding is invite-only, so offering a self-serve "Register now"
is a dead end for anyone without an invite token. It should express interest instead.

**Exact target:** `public/affiliate-login-embed.html:57` —
`<a href="#" class="text-blue-600 hover:underline" id="registerLink" data-i18n="common.buttons.registerNow">Register now</a>`
The click is JS-driven: `public/assets/js/affiliate-login.js:162-165` attaches a
handler that routes to the SPA route `/affiliate-register`
(`public/assets/js/embed-app-v2.js:51` → `affiliate-register-embed.html`), which is
the invite-gated flow (`affiliate-register-invite.js`).
This is the page users now land on at the portal root, since `/` serves the
affiliate-login shell.

**Destination:** the affiliate interest form, today `public/affiliate.html`
(route `server.js:753`, `/affiliate`), which POSTs to `/api/v1/affiliate-application`.

**⚠ TIMING TRAP — read before implementing.** `public/affiliate.html` and the
`/affiliate` route MOVE OUT of this app to the content app in Plan 3 (spec §Item A
"Move out of the affiliate app"). So:
- Implement BEFORE the Plan 3 cutover → a same-origin `/affiliate` link works now
  but SILENTLY 404s the moment `/affiliate` leaves the portal.
- Implement AFTER (or write it forward-compatible) → it must be an ABSOLUTE link to
  the content app, i.e. `https://atxwashdryfold.com/affiliate` (canonical per D8).
Cheapest correct fix: make the destination config-driven now, or simply do this as
part of the Plan 3 cross-link pass, where every app→content link is repointed
together and tested. Doing it standalone risks creating exactly the kind of
cross-link the separation work exists to eliminate.

**Also:** keep the `data-i18n` key and update the copy in ALL FOUR locales
(en/es/pt/de) in the same commit — `common.buttons.registerNow` currently reads
"Register now" (`public/locales/en/common.json:187`) and would misdescribe an
interest form. Project rule: locales ship together.

### B-2. Internationalise the partner interest form (`public/affiliate.html`)

⏸ **BACKLOGGED (Rick, 2026-09-11) — deferred, not scheduled.**

`public/affiliate.html` has **zero** `data-i18n` attributes — it is the only significant
user-facing page in the repo that was never internationalised. Everything on it is
hardcoded English, including the copy added on 2026-09-11 (the mandatory
customer-acquisition question and the "customer acquisition is yours" caveat).

This is a standing exception to [[feedback_corporate_i18n]] ("every new corporate string
ships with data-i18n + en/es/pt/de in the same commit"). The rule was not followed for this
page because the page has no i18n layer at all to hang the keys on — adding one is the work,
not the copy.

Scope when picked up:
- Add `data-i18n` / `data-i18n-placeholder` attributes across the page: hero, the caveat
  paragraph, "how it works", the stats, every form label, placeholder, helper text, the
  eligibility checkbox, the submit button and the status messages.
- New keys in all four locales (`public/locales/{en,es,pt,de}/common.json`).
- The page currently loads no `i18n.js` / language switcher — both need wiring in, and the
  switcher needs somewhere sensible to sit in this page's layout.
- ⚠️ **Same Plan 3 timing trap as B-1:** this page MOVES to the content app (crhs-corporate)
  in Plan 3. Doing the i18n work here means redoing or migrating it at cutover. Strongly
  prefer doing it **as part of** the Plan 3 move, or immediately after, rather than now.
- The SEO/meta block (description, og:, twitter:, JSON-LD) is also English-only; decide
  whether localised variants are wanted or whether English canonical is fine.

Related: [[feedback_corporate_i18n]], [[feedback_extreme_seo]], B-1 above.
