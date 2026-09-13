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
- [ ] ⛔ **TASK 55 DEPLOY-B BLOCKER — READ BEFORE ANY DEPLOY (added 2026-09-12).**
      **The affiliate and web-core are now a BIDIRECTIONAL boot-breaker pair. Either one alone kills
      the portal.** Verified, not inferred: `wc.csrf` now exports only `{ createCsrf, CSRF_COOKIE_NAME }`
      — `conditionalCsrf` and `csrfTokenEndpoint` are GONE from core.
        * New web-core + OLD affiliate → affiliate destructures two names that are `undefined`,
          `app.use(undefined)` throws → portal does not start.
        * New affiliate + OLD web-core → `wc.csrf.createCsrf` is undefined → throws at REQUIRE time
          → portal does not start.
      Both PR bodies only document the FIRST direction. The second is equally fatal.
      ⚠️ **THIS COMBINES LETHALLY WITH THE npm RE-COPY BUG.** `git pull` in the affiliate followed by
      an `npm install --install-links` that reports "up to date" (which it does while the version
      string is unchanged) yields new affiliate code against old core = DEAD PORTAL. That is the exact
      sequence a normal deploy performs.
      **MITIGATIONS — CORRECTED 2026-09-12 AFTER TESTING. My earlier note said the version bump is
      what makes npm re-copy. THAT IS FALSE — I tested it and it is not true.**
      Measured, on a real checkout, with web-core already bumped to 0.2.0 on disk:
        * plain `npm install --install-links`  → "up to date in 2s", installed copy STILL 0.1.3
        * `npm install --install-links --force` → "up to date", installed copy STILL 0.1.3
        * `--package-lock-only`                 → lock still records 0.1.3
        * `rm -rf node_modules/@crhs/web-core` + install → **0.2.0 installed** ✅ (but the lock
          STILL recorded 0.1.3, which is what re-arms the trap next time)
      Root cause: the lockfile entry `{"version":"0.1.3","resolved":"file:../crhs-web-core"}` makes
      npm consider the tree satisfied. Both repo lockfiles are now corrected to 0.2.0 (affiliate
      `157b75e6`, corporate `5766f41`), but the BOXES have their own lockfiles.
      **THE ONLY RELIABLE SEQUENCE, per consumer, per box:**
        1. `rm -rf node_modules/@crhs/web-core` — **mandatory, not optional.** No npm flag substitutes.
        2. `npm install --install-links`
        3. **VERIFY IT TOOK, before `pm2 reload`:**
           `node -p "require('@crhs/web-core/package.json').version"` → must print `0.2.0`
           `node -p "Object.keys(require('@crhs/web-core').csrf)"`    → must include `createCsrf`
           `node -p "Object.keys(require('@crhs/web-core')).length"`  → must be `26`
        4. Boot-probe the affiliate (`require('./server.js')` must not throw) before declaring done.
      A box-local lockfile still recording 0.1.3 is expected and harmless ONCE step 1 is done — but
      it means step 1 can never be skipped.
- [~] Task 55 Deploy B (HUMAN-CONFIRM) — **PARTIALLY DONE.** B3a+B3b+B3c reached both boxes on
      2026-09-11 at owner instruction, ahead of the planned single-shot Deploy B. The boxes now run
      v0.2.0 *behaviour* under a `0.1.3` version string. The remaining tranches (B3d-B3i) still need
      their own deploy, so this task is no longer "the single point v0.2.0 reaches the boxes".
- [ ] Tasks 56-57 post-deploy slice verification   - [ ] Task 58 Plan 1 exit gate

### HA (Tasks 59-61) — gate G1 SATISFIED 2026-09-12/13
- [x] Task 59 `/health/origin` box-level aggregate liveness (affiliate `cb8c955b`). 200 only when
      this app AND the content app on :3001 both serve; 503 otherwise. Mounted BEFORE the session
      middleware (asserted: route at server.js:445, session mount at :468) so the probe mints no
      session. 6/6 tests.
- [x] Task 60 deployed to both boxes and PROVEN to bite: with `crhs-corporate` stopped on oci1,
      `/health/origin` returned **503 DEGRADED `content:"DOWN(fetch failed)"`**; after restart,
      **200 UP**. crhsent.com served 200 throughout — oci2 absorbed it. oci2 was never degraded.
- [x] Task 61 CF monitor `be6953d2e0cfd7b40c4f414b5ddf20d9` repointed:
      `path=/health/origin`, `Host=portal.atxwashdryfold.com`, `expected_codes=200`,
      `expected_body` empty; type/method/timeout 5/interval 60/retries 2 all preserved.
      Pool `wavemax-oci` healthy with BOTH origins healthy across >2 probe intervals.
      Probes verified landing on the portal vhost (Cloudflare-Traffic-Manager UA, 200) and
      verified STOPPED on the old target — last rundberglaundry `/health` probe 00:16:35,
      first portal `/health/origin` probe 00:19:08.
      **ROLLBACK:** PATCH the monitor back to `path=/health`, `Host=rundberglaundry.com`.
      ⚠️ The CF API token expires **2026-09-16** — a rollback after that needs a fresh token
      (Account → Load Balancing: Monitors and Pools → Edit).

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

## Plan 2 — IN PROGRESS (plan drafting, 2026-09-13)

**Scope:** `crhs-corporate` becomes the multi-host content app, shipped DARK on `:3001` and verified on-box;
web-core `v0.2.1` (B3g/B3j/B3k + the repo-wide `brandNeutral` guard); B4a; spec §9.1 Phase 0 and §9.2 Phase 0a.
No nginx flips (Plan 3). Final plan will be `docs/superpowers/plans/2026-09-13-separation-plan2-content-app.md`.

**Status:** four slices drafted in parallel (P0 19 tasks, A1–A5 23, A6–A9 17, Phase-0a gate 15 = 74) and each
adversarially reviewed against the spec — all four CHANGES_REQUESTED (the gate slice worst: 23 spec gaps,
18 interface mismatches, 20 factual errors). Controller rulings R-1…R-15 issued; revision round + cross-slice
consistency pass running. Working files (gitignored): `.superpowers/sdd/plan2-sources/_plan2-header.md`
(Global Constraints 1–20, findings F-1…F-9), `_rulings.md`, `_drafts/`.

**Controller rulings that shape the plan:**
- [x] **One owner per concern** — every production `.env` write, web-core rsync/install, corporate deploy and
      `pm2 reload` belongs to the single Phase-0a deploy (R-24 needs the SMTP login switch and `GATE_FROM` code in
      one reload; `v0.2.1`'s logger default needs `LOG_SERVICE_NAME` written first). Duplicate implementations of
      the session rename, gate mail and `.env.example` removed from the other slices.
- [x] **S-1 CORS closes in Phase 0a** — corporate line deleted; portal set non-empty (never deleted/emptied).
- [x] **S-2 host derivation is BLOCKING** — one `requestHost()` everywhere, migrated in one commit, guard +
      behavioural bypass test + on-box probe (Plan 2 as drafted would have opened a mediator-gate bypass).
- [x] **Logger default `'app'` ratified**; corporate writes `LOG_SERVICE_NAME=crhs-corporate` before reload.
- [x] **Lighthouse:** A11y/BP/SEO gate at 100 on the dark origin; Performance through the tunnel is informational —
      the authoritative Performance comparison moves to Plan 3, before/after each flip (declared deviation).
- [x] **The corporate session rename logs nobody out** — corporate has 0 `req.session` references; gates unlock by
      IP and the separate `wm_med_unlock` cookie. No user notice needed.
- [x] **Log evidence comes from `$LOG_DIR/combined.log`** — Plan 1's "stale corporate log" finding was wrong.

**Owner decisions still open (surfaced by the drafts):**
- [ ] Q-12 — external uptime service for `:3001`; default is an on-box cron with a node SMTP alert (`mail` is not installed on either box).
- [ ] D5 — `/wavemax-affiliate` → `/affiliate` 301 is counsel-gated; its gate row stays PENDING COUNSEL.
- [ ] F-8 — do backlog B-2 (interest-form i18n) in corporate right after A3/A4, since A3 copies that page in?
- [ ] Corporate clickjacking-demo `DEMO_FRAME_SRC` still lists `https://rundberglaundry.com` (Plan 1 shipped it).
- [ ] ⚠️ CF API token expires **2026-09-16** — needed for any monitor rollback and for Plan 3's purges.

## Security findings

### S-1. Credentialed CORS misconfiguration on BOTH production apps — severity LOW (found 2026-09-13)

`CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000,https://wavemax.promo` is line 47 of BOTH apps'
`.env` on BOTH boxes, and both apps return `access-control-allow-origin: <origin>` +
`access-control-allow-credentials: true` for those three origins (verified through Cloudflare and on-box).
**Assessed LOW** — nothing sensitive is reachable: `/wavemax` sits behind the mediator cookie
(`MEDIATOR_GATE_ENABLED=true`, cookie `sameSite: 'lax'` → not sent cross-site); the IP-based accessGate
protects only `/404.css`, `/404.html`, `/README.md`; the portal is `Bearer`-authenticated.
`wavemax.promo` is registered to us through 2028-05-17. Missed by Plan 1 Task 19, whose test deletes
`CORS_ORIGIN` before asserting — the boxes were never checked.

**Scheduled:** Plan 2 Phase 0a env change set (**HUMAN-CONFIRM** — production `.env`). May be applied
earlier on the owner's go-ahead.

⚠️ **The fix is NOT symmetric.** Corporate: delete the line (web-core `parseList('')` → admits nothing).
Portal: deleting OR emptying it falls back to `['http://localhost:3000']` (`server.js:293-295`), so it
must be set to a NON-EMPTY value.

Per box — **oci1 first, verify, then oci2**:
```bash
TS=$(date +%Y%m%d%H%M%S)
cp /var/www/crhs-corporate/.env                    /var/www/wavemax/env-backups/corporate.env.pre-cors-$TS
cp /var/www/wavemax/wavemax-affiliate-program/.env /var/www/wavemax/env-backups/portal.env.pre-cors-$TS
sed -i '/^CORS_ORIGIN=/d' /var/www/crhs-corporate/.env
sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://portal.atxwashdryfold.com|' /var/www/wavemax/wavemax-affiliate-program/.env
pm2 reload crhs-corporate --update-env && pm2 reload wavemax --update-env
```
Verify (each must print the stated value):
```bash
# 0 = grant gone
curl -s -o /dev/null -D - -H 'Host: crhsent.com' -H 'Origin: http://localhost:3000' http://127.0.0.1:3001/api/health | grep -ci '^access-control-allow-origin'
curl -s -o /dev/null -D - -H 'Host: crhsent.com' -H 'Origin: https://wavemax.promo'  http://127.0.0.1:3001/api/health | grep -ci '^access-control-allow-origin'
curl -s -o /dev/null -D - -H 'Host: portal.atxwashdryfold.com' -H 'X-Forwarded-Proto: https' -H 'Origin: http://localhost:3000' http://127.0.0.1:3000/api/v1/environment | grep -ci '^access-control-allow-origin'
# 1 = a legitimate inline origin is still admitted on the portal
curl -s -o /dev/null -D - -H 'Host: portal.atxwashdryfold.com' -H 'X-Forwarded-Proto: https' -H 'Origin: https://atxwashdryfold.com' http://127.0.0.1:3000/api/v1/environment | grep -ci '^access-control-allow-origin'
# 200 = both apps healthy
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: crhsent.com' http://127.0.0.1:3001/health
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: portal.atxwashdryfold.com' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/health/origin
```
If a "0" check prints 1 after the reload, pm2 is carrying `CORS_ORIGIN` in its saved process env
(dotenv never overrides an existing variable) — inspect with `pm2 env <id> | grep CORS` before retrying.

Rollback (per box):
```bash
cp /var/www/wavemax/env-backups/corporate.env.pre-cors-<TS> /var/www/crhs-corporate/.env
cp /var/www/wavemax/env-backups/portal.env.pre-cors-<TS>    /var/www/wavemax/wavemax-affiliate-program/.env
pm2 reload crhs-corporate --update-env && pm2 reload wavemax --update-env
```

### S-2. Corporate host checks trust a client-supplied `X-Forwarded-Host` — safe today, a bypass if they ever disagree (found 2026-09-13)

`crhs-corporate/server/middleware/accessGate.js:90` reads `x-forwarded-host || host`;
`mediatorGate.js:61` and `crhsentHandler.js:20` read `req.hostname`, which Express derives from
`X-Forwarded-Host` because `server.js:42` sets `trust proxy`. nginx sets no `X-Forwarded-Host` on either
box and Cloudflare passes a client-supplied one through. **Safe today** — all three checks agree, so a
forged header yields 404 (probed live through Cloudflare and on-box on `/README.md` and `/wavemax/`).

**The hazard:** Plan 2 slice A15 introduces a Host-header-only `requestHost()`. Had the content handler
adopted it while the mediator gate kept `req.hostname`, `Host: crhsent.com` +
`X-Forwarded-Host: rundberglaundry.com` would skip the gate and serve the documented record. The same
header builds accessGate's emailed magic link (`accessGate.js:343`) — host-header poisoning.

**Scheduled:** Plan 2 Global Constraint 20 / ruling R-3 — one `requestHost()` for every host-scoped
decision, migrated in a single commit, with a guard test (0 `req.hostname` / 0 `x-forwarded-host` in
corporate `server/`), a behavioural bypass test, and an on-box probe in the Phase-0a gate.
Plan 3 adds nginx `proxy_set_header X-Forwarded-Host $host;` as defence in depth.

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

**This section IS the Plan 1 Task 42 hand-off of record** (Task 42 ran 2026-09-12 and found D-2
already written, so it re-verified every anchor in place rather than appending a duplicate section).
All anchors below re-verified against working-tree content 2026-09-12; the three marked ⟳ had
drifted and are corrected.

Plan 1 shipped only the web-core MECHANISM half — `collectionPrefix`, the opt-in TTL index,
`sweepCollection`/`resetCollection`, `LIMITER_NAMES`, `collectionNameFor`, `sweepExpired`,
`resetBuckets`, plus the env contract now documented in `.env.example:128-138`
(`RATE_LIMIT_COLLECTION_PREFIX`, `RATE_LIMIT_TTL_INDEX` — both intentionally UNSET in production).
It also deleted the three dead limiters (`emailVerificationLimiter`, `fileUploadLimiter`,
`adminOperationLimiter`; web-core `6dd1c31`). The contact-form pair deliberately SURVIVES core
until B7 — see the copy-before-delete item below.

Three of these five are LIVE DEFECTS, not refactors.

- [ ] **The admin "reset rate limits" control is a DOUBLE no-op — verified against the production
      database 2026-09-11, not inferred.** The store writes **17 `ratelimit_*` collections** keyed on
      `_id`; the admin targets a collection named `rate_limits` **which does not exist at all**. So
      `deleteMany` runs against nothing, returns `deletedCount: 0`, and reports SUCCESS. An admin
      trying to unblock a locked-out user is told it worked and nothing happened. Wrong collection
      AND wrong key field, in three places: `server/services/systemHealthService.js:105`,
      `server/routes/administratorRoutes.js:208`, `scripts/admin/reset-rate-limits.js:36`.
      Fix per spec §7.6.3: fan out over `LIMITER_NAMES` via `resetBuckets({ names, idPattern })`,
      escape regex metacharacters in the ip filter, 400 on an unknown limiter name.
      ⟳ Note (2026-09-12): the ip-escaping half is ALREADY correct on the controller path —
      `systemHealthService.js:98` escapes the full metacharacter class. The unescaped-except-dots
      version lives only in the inline route handler that this work deletes, so carry the escaping
      forward rather than re-deriving it.
- [ ] **A dead controller shadowed by an inline handler.** `administratorController.resetRateLimits`
      (`:692`) is referenced by NO route; `administratorRoutes.js:197-237` (⟳ was `:197-238`)
      carries an inline copy that shadows it. Delete the inline handler, route to the controller.
      Response message becomes `Reset N rate limit entries`;
      `tests/integration/administratorRoutes.test.js` has **exactly two** occurrences to update
      (`:44`, `:57`) — verify `grep -c 'rate limit records'` → 0 after.
      `tests/unit/simpleRouteHandlers.test.js:49-87` (⟳ was `:49-84`) copies the deleted handler
      into a throwaway router and stays green untouched — leave it for the Plan-4 test cull.
- [ ] **`server/services/codeAttemptLockout.js:49`** hand-builds `'ratelimit_' + STORE_NAME`, a second
      source of the collection name that ignores `RATE_LIMIT_COLLECTION_PREFIX`. Read
      `getStore().collectionName` instead; register `STORE_NAME = 'bag_codes'` at module load.
- [ ] Replace `server/middleware/rateLimitMongoStore.js` + `rateLimiting.js` with shims over
      `@crhs/web-core`, plus a local policy module. ⚠️ **COPY-BEFORE-DELETE (Global Constraint 13):**
      copy `windowMs`/`max`/keyGenerator verbatim from core's `contactFormBurstLimiter`
      (`src/middleware/rateLimiting.js:214-230`) and `contactFormLimiter` (`:237-254`) BEFORE core
      deletes them. Core deletes its copies in the SAME B7 release — earlier and the affiliate gets
      `router.post(path, undefined, …)` → `Route.post() requires a callback function`
      **at require time**, i.e. the app does not boot.
      ⟳ Both ranges were `:190-206` / `:213-230` until Plan 1 Task 41 inserted the copy-before-delete
      comment block above them; re-verified at web-core `6dd1c31` on 2026-09-12.
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
