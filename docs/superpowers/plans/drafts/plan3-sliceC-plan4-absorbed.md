# Plan 3 — SLICE C draft: everything absorbed from the former Plan 4

**Scope:** group C of `docs/superpowers/specs/2026-09-20-separation-plan3-scope-brief.md` — items 13, 14, 15.
There is no Plan 4. Every item below must close here or be escalated with a recorded rationale.

**Sources:** scope brief §C; `tasks/todo.md` §D-2 (6 open items) and §D-4 (1 open item);
`docs/superpowers/specs/2026-09-09-crhs-content-separation-design.md` §7.3–7.7 (per-module disposition,
test migration, PR sequence B5–B14, shared-DB namespacing, acceptance);
`docs/superpowers/plans/2026-09-13-separation-plan2-content-app.md` task format (Tasks 74–82).

**Task numbering:** C1…C20. The controller renumbers.

**Measured at draft time (2026-09-20, working tree clean at `afd38de5`).** Every figure below was produced
by running the tooling, not copied from a document.

---

## Measurements — what I actually ran

| Measurement | Command | Result |
|:--|:--|:--|
| Affiliate `server/` ESLint errors | `npx eslint server/ -f json` | **208 errors, 0 warnings, 33 files** — the documented 208 is **exact** |
| Autofixable share | `npx eslint server/ --fix-dry-run -f json` | **155 autofixable / 53 manual**, remaining 53 across 22 files |
| Autofix type | `npx eslint server/ --fix-dry-run --fix-type layout` | remaining = 53 → **all 155 are `layout`-type**; no `problem`/`suggestion` fixer runs |
| Repo-wide ESLint | `npx eslint . -f json` | **10,900 errors / 669 warnings** (doc says 10,888 → **+12 drift**) |
| Repo-wide split | same | `public` 8953 · `tests` 1007 · `design-explorer` 315 · `docs` 263 · **`server` 208** · `scripts` 145 · `tools` 6 · `init-defaults.js` 2 · **`server.js` 1** |
| ESLint / Jest versions | `require('eslint/package.json').version` | eslint **8.57.1** (eslintrc mode, `.eslintrc.js`), jest **29.7.0** |
| Programmatic lint cost | `new ESLint().lintFiles(['server/'])` | 208 errors in **7.3 s** — cheap enough for a guard test |
| web-core version consumed | `require('@crhs/web-core/package.json').version` | **0.2.1** (`file:../crhs-web-core`) |

### The 208, by rule (count / of which autofixable)

```
   63 /  63  indent
   51 /  51  no-trailing-spaces
   42 /   0  no-unused-vars
   29 /  29  comma-dangle
   12 /  12  quotes
    6 /   0  no-useless-escape
    2 /   0  no-prototype-builtins
    1 /   0  no-useless-catch
    1 /   0  import/no-dynamic-require
    1 /   0  no-case-declarations
```

### The 208, by file (33 files; `fix` = autofixable, `man` = manual)

```
 49 fix= 48 man= 1  server/utils/formatters.js                        {no-trailing-spaces:12, indent:36, no-case-declarations:1}
 41 fix= 41 man= 0  server/monitoring/connectivity-monitor.js         {comma-dangle:24, indent:14, no-trailing-spaces:3}
 19 fix= 18 man= 1  server/middleware/authorizationHelpers.js         {no-unused-vars:1, no-trailing-spaces:5, indent:13}
 13 fix=  0 man=13  server/controllers/administratorController.js     {no-unused-vars:13}
  9 fix=  9 man= 0  server/config/storeIPs.js                         {no-trailing-spaces:8, comma-dangle:1}      ← DELETED by B13
  9 fix=  9 man= 0  server/middleware/explorerGuard.js                {quotes:9}
  7 fix=  6 man= 1  server/routes/docsRoutes.js                       {no-unused-vars:1, no-trailing-spaces:6}
  6 fix=  0 man= 6  server/middleware/auth.js                         {no-unused-vars:5, no-useless-catch:1}
  6 fix=  4 man= 2  server/models/Operator.js                         {no-unused-vars:2, no-trailing-spaces:4}
  5 fix=  0 man= 5  server/controllers/authController.js              {no-unused-vars:5}
  5 fix=  4 man= 1  server/models/Administrator.js                    {no-unused-vars:1, no-trailing-spaces:4}
  4 fix=  0 man= 4  server/services/email/dispatcher/operator.js      {no-useless-escape:2, no-unused-vars:2}
  4 fix=  4 man= 0  server/utils/validators.js                        {no-trailing-spaces:4}
  3 fix=  3 man= 0  server/config/quarantineConfig.js                 {comma-dangle:3}
  3 fix=  0 man= 3  server/utils/passwordValidator.js                 {no-useless-escape:2, no-unused-vars:1}
  3 fix=  3 man= 0  server/utils/securityUtils.js                     {no-trailing-spaces:3}
  2 fix=  1 man= 1  server/controllers/affiliateController.js         {no-trailing-spaces:1, no-unused-vars:1}
  2 fix=  0 man= 2  server/middleware/sanitization.js                 {no-prototype-builtins:1, no-useless-escape:1}  ← SHIMMED by B5
  2 fix=  0 man= 2  server/routes/operatorRoutes.js                   {no-unused-vars:2}
  2 fix=  0 man= 2  server/services/adminDashboardService.js          {no-unused-vars:2}
  2 fix=  0 man= 2  server/services/email/dispatcher/affiliate.js     {no-unused-vars:1, no-useless-escape:1}
  1 fix=  1 man= 0  server/controllers/affiliateApplicationController.js  {quotes:1}   ← DELETED by slice B
  1 fix=  1 man= 0  server/controllers/customerController.js          {quotes:1}
  1 fix=  1 man= 0  server/controllers/partnerInquiryController.js    {quotes:1}       ← DELETED by slice B
  1 fix=  1 man= 0  server/middleware/locationQuarantine.js           {comma-dangle:1}
  1 fix=  0 man= 1  server/models/Affiliate.js                        {no-unused-vars:1}
  1 fix=  1 man= 0  server/routes/affiliateRoutes.js                  {no-trailing-spaces:1}
  1 fix=  0 man= 1  server/routes/authRoutes.js                       {no-unused-vars:1}
  1 fix=  0 man= 1  server/routes/customerRoutes.js                   {no-unused-vars:1}
  1 fix=  0 man= 1  server/services/administratorAccountService.js    {no-unused-vars:1}
  1 fix=  0 man= 1  server/services/email/dispatcher/customer.js      {no-unused-vars:1}
  1 fix=  0 man= 1  server/services/firebasePhoneService.js           {import/no-dynamic-require:1}
  1 fix=  0 man= 1  server/utils/fieldFilter.js                       {no-prototype-builtins:1}
```

### The 53 manual errors, verbatim

```
server/controllers/administratorController.js  L4 Administrator · L5 Operator · L6 Order · L8 Customer ·
    L9 SystemConfig · L10 Transaction · L11 fieldFilter · L12 emailService · L13 logAuditEvent ·
    L13 AuditEvents · L14 validatePasswordStrength · L17 crypto · L19 encryptionUtil   (13 × no-unused-vars)
server/controllers/affiliateController.js      L895 customerObjectIds
server/controllers/authController.js           L3 RefreshToken · L4 TokenBlacklist · L9 jwt · L11 emailService · L14 sanitizeInput
server/middleware/auth.js                      L4 Affiliate · L5 Customer · L6 Administrator · L7 Operator ·
                                               L10 storeIPConfig · L49 no-useless-catch
server/middleware/authorizationHelpers.js      L7 Affiliate
server/middleware/sanitization.js              L23 no-prototype-builtins · L95 no-useless-escape (\/)
server/models/Administrator.js                 L8 validatePasswordStrength
server/models/Affiliate.js                     L4 crypto
server/models/Operator.js                      L6 encrypt · L6 decrypt
server/routes/authRoutes.js                    L7 registrationLimiter
server/routes/customerRoutes.js                L40 next (args must match /^_/u)
server/routes/docsRoutes.js                    L4 serveHTMLWithNonce
server/routes/operatorRoutes.js                L22 next · L34 next
server/services/adminDashboardService.js       L9 mongoose · L10 Administrator
server/services/administratorAccountService.js L13 crypto
server/services/email/dispatcher/affiliate.js  L5 formatTimeSlot · L34 no-useless-escape (\')
server/services/email/dispatcher/customer.js   L5 formatTimeSlot
server/services/email/dispatcher/operator.js   L27 no-useless-escape (\') ×2 · L371 operator · L371 resetUrl
server/services/firebasePhoneService.js        L38 import/no-dynamic-require
server/utils/fieldFilter.js                    L15 no-prototype-builtins
server/utils/formatters.js                     L165 no-case-declarations
server/utils/passwordValidator.js              L54 no-useless-escape (\[) · L138 options · L217 no-useless-escape (\[)
```

---

## Rulings — corrections to inherited claims. Do not inherit the originals.

### C-R1. The documented 208 is exact; the repo-wide 10,888 has drifted to 10,900

`server/` is **208 errors, 155 autofixable, 53 manual, 33 files** — confirmed. The `tasks/todo.md` §D-4
parenthetical "10,888 repo-wide" now measures **10,900**. Use 10,900 or drop the figure; do not re-assert 10,888.

### C-R2. The rate-limit double no-op is CONFIRMED — with one correction to how it is reachable

Confirmed by source inspection (production untouched):

- `server/middleware/rateLimitMongoStore.js:36` — `this.collectionName = \`ratelimit_${this.name}\``; writes are
  `updateOne({ _id: key }, …)` at `:85-97`, `deleteOne({ _id: key })` at `:121`. **Collection `ratelimit_<name>`, key `_id`.**
- `server/services/systemHealthService.js:105` — `db.collection('rate_limits').deleteMany(filter)` where
  `filter.key = new RegExp(...)`. **Wrong collection AND wrong field.**
- `server/routes/administratorRoutes.js:202-228` — an inline handler doing the same thing, shadowing
  `administratorController.resetRateLimits` (`:692`), which is **referenced by no route** (grep across
  `server/routes/` returns zero hits).
- `scripts/admin/reset-rate-limits.js:36` — same collection, same `key` filter.

**Correction to the §D-2 wording "the admin *control*":** there is **no admin-dashboard button.**
`grep -rn 'reset-rate-limits\|resetRateLimit' public/` returns **zero**. The two reachable surfaces are:

1. `POST /api/v1/administrators/reset-rate-limits` — returns `{ success: true, message: 'Reset 0 rate limit records', deletedCount: 0 }`. **This is the false success.**
2. `scripts/admin/reset-rate-limits.js` — prints `Found 0 rate limit records matching filter` then
   `No rate limit records to delete` and exits. Not a false *success*, but an operator reads it as
   "nothing to clear" while 17 live buckets hold counters. **Equally a no-op.**

**The 17 collections, corroborated without touching production.** The registered store names are exactly
17: `auth, pwreset, register, api, sensitive, contact_burst, contact_hourly, email_verify, upload,
admin_op, admin_login, concierge, bag-resolve, claim-resolve, email-verify, scan_actions, bag_codes`
(12 from `server/middleware/rateLimiting.js`, 4 `createCustomLimiter` names in
`bagRoutes.js:15`/`customerRoutes.js:22,31`/`scanRoutes.js:26`, plus `bag_codes` from
`codeAttemptLockout.js:23`). `17 × ratelimit_*` matches the §D-2 production observation exactly.

**Why the existing tests did not catch it — this is the regression-test gap to close.**
`tests/integration/administratorRoutes.test.js:44,57` assert `expect(response.body.message).toMatch(/Reset \d+ rate limit records/)`.
`\d+` matches `0`. The suite has been green over a total no-op since the handler was written.

### C-R3. B7 is far smaller than the spec implies — the affiliate's 9 live limiters are already parameter-identical to core's

Extracted mechanically from both files (`windowMs` / `max` / `keyGenerator` / store `name`):

| limiter | store name | windowMs | max | key | affiliate | core 0.2.1 |
|:--|:--|:--|:--|:--|:--:|:--:|
| `authLimiter` | `auth` | `15*60*1000` | `isRelaxed ? 50 : 5` | `ip` | ✔ | ✔ identical |
| `passwordResetLimiter` | `pwreset` | `60*60*1000` | `isRelaxed ? 10 : 3` | `ip` | ✔ | ✔ identical |
| `registrationLimiter` | `register` | `60*60*1000` | `isRelaxed ? 50 : 10` | `ip` | ✔ | ✔ identical |
| `apiLimiter` | `api` | `15*60*1000` | `isRelaxed ? 500 : (RATE_LIMIT_MAX_REQUESTS \|\| 100)` | `ip` | ✔ | ✔ identical |
| `sensitiveOperationLimiter` | `sensitive` | `60*60*1000` | `10` | `userOrIp` | ✔ | ✔ identical |
| `contactFormBurstLimiter` | `contact_burst` | `30*1000` | `isRelaxed ? 30 : 1` | `ip` | ✔ | ✔ identical |
| `contactFormLimiter` | `contact_hourly` | `60*60*1000` | `isRelaxed ? 50 : 5` | `ip` | ✔ | ✔ identical |
| `adminLoginLimiter` | `admin_login` | `15*60*1000` | `isRelaxed ? 100 : 20` | `adminLogin` | ✔ | ✔ identical |
| `conciergeLimiter` | `concierge` | `15*60*1000` | `isRelaxed ? 200 : 20` | `ip` | ✔ | ✔ identical |
| `emailVerificationLimiter` | `email_verify` | — | — | — | ✔ **dead** (0 consumers) | deleted (`6dd1c31`) |
| `fileUploadLimiter` | `upload` | — | — | — | ✔ **dead** (0 consumers) | deleted |
| `adminOperationLimiter` | `admin_op` | — | — | — | ✔ **dead** (0 consumers) | deleted |

So the "policy module" is a **thin binding over core's nine** plus `APP_LIMITER_NAMES`, not a
re-derivation. The three dead limiters are deleted (verified 0 consumers outside their own definition).

### C-R4. The copy-before-delete boot-breaker is already half-satisfied — and slice C must NOT delete core's contact limiters

`crhs-corporate/server/middleware/rateLimitPolicy.js:48-49` already builds its own
`contactBurstLimiter`/`contactHourlyLimiter` via `wc.rateLimiting.createCustomLimiter` and never imports
core's copies. Core still exports them (`src/middleware/rateLimiting.js:214`, `:237`) at v0.2.1, and the
**affiliate is their last consumer** (`partnerInquiryRoutes.js:5`, `affiliateApplicationRoutes.js:5`).

**Ruling:** slice C removes the affiliate's import and adds a guard; it does **not** delete core's copies.
Deleting them in the same release the affiliate still imports them produces
`Route.post() requires a callback function` **at require time** — the app does not boot. Core's deletion
is handed to the web-core release in slice D (or any later release), gated on the affiliate guard being green.

### C-R5. `LIMITER_NAMES` is a live getter — confirmed

`crhs-web-core/src/middleware/rateLimiting.js:335-339` defines it with `Object.defineProperty(module.exports,
'LIMITER_NAMES', { get: () => MongoRateLimitStore.registeredNames() })`. Destructuring it at require time
freezes the registry before `codeAttemptLockout` registers `bag_codes`. **Every consumer holds the module
and reads `rateLimiting.LIMITER_NAMES` inside the function.** The §D-2 warning is accurate.

### C-R6. The ESLint series must run LAST inside slice C, not first

13 of the 208 live in files the adoption series removes from `server/`:
`storeIPs.js` (9, deleted by B13) and `sanitization.js` (2, shimmed by B5) — and 2 more
(`partnerInquiryController.js`, `affiliateApplicationController.js`) go with slice B's route deletion.
Fixing them before those PRs is wasted work that also produces merge noise.

**Predicted residual when the ESLint series starts: ≈195** (208 − 9 − 2 − 2, ± whatever B5–B14 adds).
C13 re-measures and records; the exit criterion is **literally 0** regardless of the starting number.

### C-R7. `npx eslint server/` does not cover the whole affiliate — state the residual, don't imply it is gone

Outside `server/` the affiliate still carries 10,692 errors: `public` 8953, `tests` 1007,
`design-explorer` 315, `docs` 263, `scripts` 145, `tools` 6, `init-defaults.js` 2, **`server.js` 1**.

`server.js:503 no-unused-vars 'originalExpires'` is the app's own entry point and is **not** matched by
`eslint server/`. It sits inside the `maxAge` fixer block that **B9 deletes** when it adopts core's
`_maxAgeFixer`, so it closes for free — C12 asserts it.

Scope-brief exit criterion 4 says "ESLint clean in all three repos (affiliate at 0)"; owner decision 2
scopes the work to "all 208 affiliate `server/` ESLint errors". **Slice C delivers `server/` = 0 and
`server.js` = 0, and escalates the remaining 10,692 as a written line item (C20), not as silent debt.**

### C-R8. `no-console` is NOT blocked in the affiliate — CLAUDE.md overstates the config

`.eslintrc.js:16` is `'no-console': ['warn', { allow: ['warn', 'error'] }]` — a warning, and `console.warn`
/ `console.error` are permitted. The project rule ("`console.*` is blocked by ESLint in `server/`") is not
enforced by the config. **`server/` currently reports 0 warnings**, so tightening it to an error under a
`server/**` override is free. C19 does exactly that, gated on a measured 0.

### C-R9. Shimming moves 4 rule families into a repo where they are switched OFF — flagged, not hidden

`crhs-web-core/.eslintrc.js` sets `no-trailing-spaces`, `comma-dangle`, `no-useless-escape` and
`no-prototype-builtins` to **`off`**, deliberately, so byte-faithful ports stay diffable.
`diff server/middleware/sanitization.js ../crhs-web-core/src/middleware/sanitization.js` differs in
**2 lines only** (a comment and a trailing newline) — the `hasOwnProperty` access and the `\/` escape are
present in both. Shimming removes 2 errors from the affiliate's count without fixing the pattern.
**C18 fixes the pattern in web-core's copy in the same series** so the count and the code agree.

### C-R10. Two rate-limit env knobs are dead; two more are correctly unset

- `RATE_LIMIT_WINDOW_MS` and `AUTH_RATE_LIMIT_MAX` appear **only** in
  `server/services/systemHealthService.js:31`'s `ALLOWED_ENV_VARS` display list and in `.env.example`.
  **No limiter reads either.** Dead knobs rendered to an admin as if they were live. C5 removes them.
- `RATE_LIMIT_MAX_REQUESTS` **is** live (`apiLimiter` max).
- `RATE_LIMIT_COLLECTION_PREFIX` / `RATE_LIMIT_TTL_INDEX` are documented in `.env.example:128-138` with
  **0 affiliate code reads** — correct: they are web-core's contract and intentionally unset in production.
- Adjacent, out of slice-C scope, flagged in C20: `ALLOWED_ENV_VARS` also advertises
  `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY` and four `AWS_*` keys for subsystems this app no longer has.

### C-R11. ⚠️ Cross-slice hazard the brief does not resolve: `/api/concierge` + `conciergeLimiter` are live on a host slice A flips

`server.js:709-713` mounts `POST /api/concierge` behind `conciergeLimiter`, and the design explorer it
serves lives on **`rundberglaundry.com`** behind `EXPLORER_TOKEN` — a host slice A moves to `:3001`.
`server/config/csrfTables.js:35` lists `/api/concierge` as one of the "five rows that retire WITH their
routes". If slice A flips `rundberglaundry.com` and the explorer is not moved or re-pointed, the explorer
and its concierge become unreachable, and whether `conciergeLimiter` survives B7 becomes undecided.

**Slice C does not decide this.** Every place it matters, C5 detects the live route set with an exact
command and branches, so C5 is correct either way. **Escalate to the controller:** the concierge/explorer
disposition belongs to slice A or B and must be settled before C5 runs.

---

## Task order and why

```
slice A flips verified  ──►  slice B cleanup  ──►  C1 … C12 (adoption series B5–B14)
                                                       │
                                                       ▼
                                              C13 … C19 (ESLint → 0)
                                                       │
                                                       ▼
                                                   C20 closure
```

- **The ESLint series consumes the adoption series** (C-R6) and **the adoption series consumes slice A's
  verified flips** (owner decision 2: "own commit series, after the flips are verified, never mixed into a
  cutover commit"). Both dependencies are restated in each task's **Interfaces: Consumes**.
- Every task is one commit unless it says otherwise, and every task's rollback is a single `git revert` of
  that commit plus the stated redeploy step, so any batch is independently revertable.

**Global constraints for every task in this slice**

1. Strict TDD: the failing test is written and **observed failing for the stated reason** before implementation.
2. `logger` (Winston) only in `server/`; `console.*` stays confined to `scripts/` CLI output.
3. No file in `server/` over 800 lines; no controller over 500. Re-checked in C12.
4. The suite must run clean **without** `--forceExit` by the end of C12 (`npm test` still carries
   `--forceExit` today — C12 owns removing it).
5. Runtime business values via `await SystemConfig.getValue(key, default)`. No task in slice C introduces
   a hardcoded rate, fee, limit or window; limiter windows are code constants that already exist and are
   moved verbatim (C-R3), never re-derived.
6. **Never run the full suite inside a subagent.** Full-suite gates are run by the controller.
7. The repo is **public**. No secret, token, IP allowlist value or `.env` value enters a commit.

**Record file.** Slice C keeps its numbers outside the repo, Plan-2 style:

```bash
EV="$HOME/plan3-sliceC"; mkdir -p "$EV"; REC="$EV/sliceC-record.env"
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
set -a; [ -f "$REC" ] && . "$REC"; set +a
```

**The `lintcount` helper**, defined once and used by C13–C19 verbatim:

```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
lintcount() { ( cd "$AFF" && npx eslint "${1:-server/}" -f json 2>/dev/null | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);const by={};let e=0;
for(const f of r){e+=f.errorCount;for(const m of f.messages)if(m.severity===2)by[m.ruleId||'(fatal)']=(by[m.ruleId||'(fatal)']||0)+1;}
console.log('TOTAL '+e);Object.entries(by).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(v+' '+k));});" ); }
```

---

# GROUP C-1 — Items 13 + 15: the adoption series (PRs B5–B14)

Spec §7.5 dependency order. B12 already landed as B4c (`server/config/csrfTables.js` exists, 
verified present) so it has no task here.

---

### C1: Slice-C preflight — record the starting state, read-only

**Files:** none. Writes only to `$REC` outside the repo.

**Interfaces:**
- Consumes: slice A's flip verification (`ALL_HOSTS_FLIPPED=PASS` in slice A's record) and slice B's
  cleanup commits. Owner decision 2 forbids starting before the flips are verified.
- Produces: `C_BASE_SHA`, `C_LINT_SERVER_0`, `C_LINT_ALL_0`, `C_SUITES_0`, `C_SHIMS_0`, `C_INTAKE_LIVE`,
  `C_CONCIERGE_LIVE`.

- [ ] **Step 1: Confirm slice A is done and the tree is clean.**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
cd "$AFF" && git status --porcelain && git log -1 --format='%H %s'
```
  - Expected: no output from `git status --porcelain`, then one `<sha> <subject>` line. Any modified file
    here means an earlier slice is unfinished — STOP.

- [ ] **Step 2: Record the lint baseline.**
```bash
lintcount server/ | head -3; lintcount . | head -1
```
  - Expected: `TOTAL 208`, `63 indent`, `51 no-trailing-spaces`, then `TOTAL 10900`.
  - If `TOTAL` for `server/` is not 208, record the actual number and proceed — C13 re-measures anyway.

- [ ] **Step 3: Record which routes are still live, so C5 branches correctly (C-R11).**
```bash
cd "$AFF"
echo "intake=$(grep -c "partnerInquiryRoutes\|affiliateApplicationRoutes" server.js)"
echo "concierge=$(grep -c "conciergeLimiter" server.js)"
echo "contactimports=$(grep -rl 'contactFormBurstLimiter' server/routes/ | wc -l)"
```
  - Expected today: `intake=2`, `concierge=2`, `contactimports=2`.
  - Expected if slice B has already deleted the intake routes: `intake=0`, `contactimports=0`.
  - `concierge=0` means slice A/B resolved C-R11 by removing the explorer; C5 then drops `conciergeLimiter` too.

- [ ] **Step 4: Record the 13 duplicate suites and the current shim set.**
```bash
cd "$AFF"
for f in systemConfig rateLimitMongoStore rateLimitKeyGen rateLimitingMiddleware sanitization errorHandler \
         auditLogger storeIPs mongoCursorRetry mongoOracleDiagnostics logger emailTransport; do
  [ -f "tests/unit/$f.test.js" ] && echo "$(wc -l < tests/unit/$f.test.js) tests/unit/$f.test.js" || echo "GONE tests/unit/$f.test.js"
done
echo "--- shims ---"; grep -rl '@crhs/web-core' server/ | sort
```
  - Expected: 12 present suites with these line counts — `systemConfig 904`, `rateLimitMongoStore 95`,
    `rateLimitKeyGen 75`, `rateLimitingMiddleware 451`, `sanitization 449`, `errorHandler 330`,
    `auditLogger 500`, `storeIPs 356`, `mongoCursorRetry 100`, `mongoOracleDiagnostics 79`, `logger 39`,
    `emailTransport 63` — then exactly these 11 shim/composition files:
    `server/config/csrf-config.js`, `server/config/csrfTables.js`, `server/middleware/cspNonce.js`,
    `server/middleware/ipGate.js`, `server/services/geocodingService.js`, `server/utils/clientIp.js`,
    `server/utils/controllerHelpers.js`, `server/utils/cspHelper.js`, `server/utils/encryption.js`,
    `server/utils/logger.js`, `server/utils/validateSecrets.js`.
  - `tests/unit/brand-config.test.js` (53 lines) is **kept** — it is app-owned, not a duplicate.

- [ ] **Step 5: Record.**
```bash
rec C_BASE_SHA "$(cd "$AFF" && git rev-parse HEAD)"
rec C_LINT_SERVER_0 208; rec C_LINT_ALL_0 10900; rec C_SUITES_0 12; rec C_SHIMS_0 11
rec C_INTAKE_LIVE "$(cd "$AFF" && grep -c 'partnerInquiryRoutes\|affiliateApplicationRoutes' server.js)"
rec C_CONCIERGE_LIVE "$(cd "$AFF" && grep -c 'conciergeLimiter' server.js)"
```

**Rollback (exact):** none — read-only. To discard the record: `rm -f "$REC"`.

---

### C2: PR B5 — shim `sanitization`, `errorHandler`, `mongoCursorRetry`, `mongoOracleDiagnostics`; delete 4 duplicate suites

**Files:**
- Modify: `server/middleware/sanitization.js` (105 → 5 lines), `server/middleware/errorHandler.js` (149 → 5),
  `server/utils/mongoCursorRetry.js` (101 → 5), `server/utils/mongoOracleDiagnostics.js` (163 → 5)
- Delete: `tests/unit/sanitization.test.js` (449), `tests/unit/errorHandler.test.js` (330),
  `tests/unit/mongoCursorRetry.test.js` (100), `tests/unit/mongoOracleDiagnostics.test.js` (79)
- Create: `tests/unit/webCoreShimIdentity.test.js`

**Interfaces:**
- Consumes: `@crhs/web-core@0.2.1` already installed (`C1` Step 4 shim list proves the package resolves);
  `server.js:19,350` (sanitization mount), `server.js:5,983` (errorHandler), `server.js:59`
  (cursor-retry, must stay before any DB use), `server.js:123-132` (diagnostics).
- Produces: 4 more shims (`C_SHIMS` 11 → 15); `server/` ESLint −2 (`sanitization.js`'s
  `no-prototype-builtins` + `no-useless-escape` leave the affiliate tree, C-R9).

- [ ] **Step 1: Prove the bodies are equivalent before deleting them (move-then-delete, not rewrite).**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; WC=/mnt/c/Users/rickh/GitHub/crhs-web-core
for m in middleware/sanitization middleware/errorHandler utils/mongoCursorRetry utils/mongoOracleDiagnostics; do
  echo "== $m"; diff "$AFF/server/$m.js" "$WC/src/$m.js" | grep -c '^[<>]'
done
```
  - Expected: `== middleware/sanitization` then `4` (one comment line + the missing trailing newline — the
    exact diff measured at draft time), and for the other three a count that is **only** comment/header lines.
    Inspect each diff by eye; any difference in a statement means the shim is not a shim — STOP and report.

- [ ] **Step 2: Write the failing identity test.** Create `tests/unit/webCoreShimIdentity.test.js`:
```js
// PR B5 (spec §7.3): four modules become 5-line re-exports of @crhs/web-core.
// This test is the seam: it fails while a local implementation still shadows core's.
const wc = require('@crhs/web-core');

describe('B5 shims re-export @crhs/web-core, not a local copy', () => {
  it.each([
    ['../../server/middleware/sanitization', 'sanitization'],
    ['../../server/middleware/errorHandler', 'errorHandler'],
    ['../../server/utils/mongoCursorRetry', 'mongoCursorRetry'],
    ['../../server/utils/mongoOracleDiagnostics', 'mongoOracleDiagnostics']
  ])('%s === wc.%s', (appPath, coreKey) => {
    expect(require(appPath)).toBe(wc[coreKey]);
  });

  it('each shim file is a re-export, not an implementation', () => {
    const fs = require('fs'); const path = require('path');
    for (const f of ['server/middleware/sanitization.js', 'server/middleware/errorHandler.js',
      'server/utils/mongoCursorRetry.js', 'server/utils/mongoOracleDiagnostics.js']) {
      const src = fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8');
      expect(src).toMatch(/require\('@crhs\/web-core'\)/);
      expect(src.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'))).toHaveLength(1);
    }
  });
});
```
```bash
cd "$AFF" && npx jest tests/unit/webCoreShimIdentity.test.js 2>&1 | tail -20
```
  - Expected: `Tests: 5 failed, 5 total`. The four `.each` cases fail with
    `expect(received).toBe(expected) // Object.is equality` — the local module object is not core's.
    The fifth fails on `Expected length: 1` because the files still hold their implementations.
    **If any case passes, that module was already shimmed — remove it from this PR and say so.**

- [ ] **Step 3: Replace each body with the 5-line shim**, matching `server/utils/clientIp.js` verbatim in shape:
```js
// Shim — <what> now lives in @crhs/web-core (byte-identical extraction).
// Kept as a thin re-export so existing require() call sites transparently
// consume the shared package (move-then-delete convention; see
// docs/refactor). Do not add logic here — edit web-core instead.
module.exports = require('@crhs/web-core').<key>;
```
  - `sanitization` and `errorHandler` export objects with named members; keep the whole-module re-export
    form so `const { sanitizeRequest } = require('../middleware/sanitization')` keeps working. Verify:
```bash
cd "$AFF" && node -e "
const s=require('./server/middleware/sanitization');const e=require('./server/middleware/errorHandler');
console.log(Object.keys(s).sort().join(','));console.log(Object.keys(e).sort().join(','));"
```
  - Expected: the same key lists this command prints **before** the change. Capture both lines in Step 1
    and diff them — a missing key is a broken call site at boot.

- [ ] **Step 4: Delete the four duplicate suites and re-run the seam test.**
```bash
cd "$AFF" && git rm -q tests/unit/sanitization.test.js tests/unit/errorHandler.test.js \
  tests/unit/mongoCursorRetry.test.js tests/unit/mongoOracleDiagnostics.test.js
npx jest tests/unit/webCoreShimIdentity.test.js 2>&1 | tail -6
```
  - Expected: `Tests: 5 passed, 5 total`.

- [ ] **Step 5: Boot probe + cycles + lint delta.**
```bash
cd "$AFF" && node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK');" 2>&1 | tail -2
npx madge --circular server/ 2>&1 | tail -3
lintcount server/ | head -1
```
  - Expected: `BOOT_OK`; `✔ No circular dependency found!`; `TOTAL 206` (208 − 2).

- [ ] **Step 6: Controller runs the full suite, then commit.**
```bash
cd "$AFF" && npm test 2>&1 | tail -15
git add -A && git commit -m "refactor(webcore): B5 — shim sanitization, errorHandler, cursor-retry, oracle diagnostics

Four modules become 5-line re-exports of @crhs/web-core (spec §7.3); the four
duplicate unit suites they shadowed are deleted (928 lines). tests/unit/
webCoreShimIdentity.test.js is the new seam. server/ ESLint 208 -> 206.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: `Tests: … 0 failed` against the baseline recorded by slice A's exit gate. Any new failure is
    fixed in this commit, not deferred (project rule: fix everything before advancing).

**Rollback (exact):**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git revert --no-edit <B5 sha> && npm test
```
Nothing is deployed by this task, so no box action is needed. If the revert is taken after C3–C11 have
landed, revert those first in reverse order — the shims are a dependency chain.

---

### C3: PR B6 — shim `auditLogger`; delete the duplicate suite; prove `logs/audit.log` in the repo dir receives an event

**Files:**
- Modify: `server/utils/auditLogger.js` (267 → 5 lines)
- Delete: `tests/unit/auditLogger.test.js` (500)
- Create: `tests/integration/auditLogDestination.test.js`

**Interfaces:**
- Consumes: C2's shim set; web-core `auditLogger` with the `LOG_DIR` support shipped in B3a; the affiliate
  `.env`'s `LOG_DIR=logs` (`.env.example:97`).
- Produces: `C_SHIMS` 15 → 16. The 16 existing `jest.mock('../../server/utils/auditLogger')` sites and the
  2 `jest.requireActual` sites (`tests/integration/addons.test.js:12`,
  `tests/unit/bags/bagService.test.js:3`) resolve **through** the shim path unchanged — no test edits.
- Closes the live defect spec §7.5 B6 names: audit events landing under `node_modules/` instead of the repo's
  `logs/`.

- [ ] **Step 1: Write the failing destination test.** Create `tests/integration/auditLogDestination.test.js`:
```js
// PR B6 acceptance (spec §7.5): with LOG_DIR=logs, an audit event must land in
// <repo>/logs/audit.log — not under node_modules/@crhs/web-core/logs/.
const fs = require('fs'); const path = require('path');
const REPO = path.join(__dirname, '..', '..');

describe('B6 — audit events write to the repo LOG_DIR', () => {
  const target = path.join(REPO, 'logs', 'audit.log');
  const stray = path.join(REPO, 'node_modules', '@crhs', 'web-core', 'logs', 'audit.log');

  it('writes CSRF_VALIDATION_FAILED to <repo>/logs/audit.log and nowhere else', async () => {
    const before = fs.existsSync(target) ? fs.statSync(target).size : 0;
    const strayBefore = fs.existsSync(stray) ? fs.statSync(stray).size : 0;
    const { logAuditEvent, AuditEvents } = require('../../server/utils/auditLogger');
    await logAuditEvent(AuditEvents.CSRF_VALIDATION_FAILED, { probe: 'B6' },
      { ip: '203.0.113.9', originalUrl: '/b6-probe', method: 'POST', get: () => undefined });
    await new Promise((r) => setTimeout(r, 400));
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.statSync(target).size).toBeGreaterThan(before);
    expect(fs.readFileSync(target, 'utf8')).toContain('/b6-probe');
    const strayAfter = fs.existsSync(stray) ? fs.statSync(stray).size : 0;
    expect(strayAfter).toBe(strayBefore);
  });
});
```
```bash
cd "$AFF" && LOG_DIR=logs npx jest tests/integration/auditLogDestination.test.js 2>&1 | tail -20
```
  - Expected while the local implementation is still in place: **1 failed**. Record the exact reason —
    either `expect(received).toBeGreaterThan(expected)` on the repo file (nothing written there) or
    `expect(strayAfter).toBe(strayBefore)` (written under `node_modules/`). **If it passes before the shim,
    the defect is already closed: keep the test, say so in the commit body, and skip the defect claim.**

- [ ] **Step 2: Prove the body is equivalent, then shim.**
```bash
diff "$AFF/server/utils/auditLogger.js" "$WC/src/utils/auditLogger.js" | grep -c '^[<>]'
cd "$AFF" && node -e "console.log(Object.keys(require('./server/utils/auditLogger')).sort().join(','))"
```
  - Expected: a count that is comment/header-only (spec calls core's copy byte-identical plus the `LOG_DIR`
    change), then the export key list. Re-run the second command after the shim — the lists must match.

- [ ] **Step 3: Delete the duplicate suite and re-run.**
```bash
cd "$AFF" && git rm -q tests/unit/auditLogger.test.js
LOG_DIR=logs npx jest tests/integration/auditLogDestination.test.js tests/unit/webCoreShimIdentity.test.js 2>&1 | tail -6
```
  - Expected: `Tests: 6 passed, 6 total`.

- [ ] **Step 4: Prove the 18 mock/requireActual sites still resolve.**
```bash
cd "$AFF" && grep -rc "server/utils/auditLogger" tests/ | grep -v ':0' | wc -l
npx jest tests/integration/addons.test.js tests/unit/bags/bagService.test.js 2>&1 | tail -6
```
  - Expected: a non-zero site count, then `Tests: … 0 failed`. These two are the `requireActual` pair — if
    they pass, the shim is transparent to jest's module registry.

- [ ] **Step 5: Controller runs the full suite, then commit.**
```bash
cd "$AFF" && npm test 2>&1 | tail -15
git add -A && git commit -m "refactor(webcore): B6 — shim auditLogger; audit events land in the repo LOG_DIR

server/utils/auditLogger.js becomes a re-export of @crhs/web-core (spec §7.3);
tests/unit/auditLogger.test.js (500 lines, duplicate) deleted. New integration
test pins the destination: <repo>/logs/audit.log receives CSRF_VALIDATION_FAILED
and node_modules/@crhs/web-core/logs/ does not grow.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Rollback (exact):**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git revert --no-edit <B6 sha> && npm test
```

---

### C4: **Item 13, core** — PR B7a: the rate-limit reset double no-op, fixed, with the regression test that would have caught it

**This is the verified production defect.** Confirmed by source inspection per C-R2: `rate_limits` is
written by nobody, the store writes `ratelimit_<name>` keyed on `_id`, and three paths delete from the
wrong collection filtering a field that does not exist.

**Files:**
- Modify: `server/services/systemHealthService.js:90-112` (the reset function; **keep** the `:98` IP
  metacharacter escaping — carry it forward, do not re-derive it, per §D-2's ⟳ note)
- Modify: `server/routes/administratorRoutes.js` — delete the inline handler at `:197-237`, route to
  `administratorController.resetRateLimits`
- Modify: `tests/integration/administratorRoutes.test.js:44,57` — the two assertions that let the bug through
- Create: `tests/integration/resetRateLimits.test.js`

**Interfaces:**
- Consumes: **slice A's verified flips** (owner decision 2); C3's shim set; web-core
  `rateLimiting.resetBuckets({ prefix, names, idPattern })` (`src/middleware/rateLimiting.js:365-378`) and
  the live `LIMITER_NAMES` getter (`:335-339`, C-R5); `AuditEvents.ADMIN_RESET_RATE_LIMITS`
  (`server/utils/auditLogger.js:99`).
- Produces: `systemHealthService.resetRateLimits({ type, ip, user, req })` →
  `{ deletedCount: <sum>, collections: [{ collection, deletedCount }] }`; the HTTP response message becomes
  `Reset N rate limit entries` (the controller's existing wording at `administratorController.js:699`);
  a `400` on an unknown limiter name.
- **Deliberately split from C5.** C4 fixes the defect against the *existing* local limiter module so the fix
  is reviewable and revertable on its own; C5 then swaps the module underneath it. A reviewer can read C4
  without reading the adoption.

- [ ] **Step 1: Reproduce the no-op in a test that fails for the right reason.** Create
      `tests/integration/resetRateLimits.test.js`:
```js
// Plan 3 item 13 / spec §7.6.3. The admin reset targeted a collection named
// `rate_limits` that the store never writes; the store writes `ratelimit_<name>`
// keyed on `_id`. The pre-existing assertion /Reset \d+ rate limit records/
// matched "Reset 0", so a total no-op stayed green for the life of the handler.
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const Administrator = require('../../server/models/Administrator');
const { createTestToken } = require('../helpers/authHelper');
const { getCsrfToken } = require('../helpers/csrfHelper');

const FUTURE = () => new Date(Date.now() + 15 * 60 * 1000);

describe('POST /api/v1/administrators/reset-rate-limits — clears real buckets', () => {
  let adminToken; let agent; let csrfToken;

  beforeEach(async () => {
    await Administrator.deleteMany({});
    const admin = await Administrator.create({
      administratorId: 'ADM-RL1', firstName: 'Test', lastName: 'Admin',
      email: 'rl-admin@test.com', username: 'rladmin', passwordSalt: 'salt',
      passwordHash: 'hash', role: 'super_admin', permissions: ['all']
    });
    adminToken = createTestToken(admin._id, 'administrator', admin.administratorId);
    agent = request.agent(app);
    csrfToken = await getCsrfToken(app, agent);
    await mongoose.connection.collection('ratelimit_auth').deleteMany({});
    await mongoose.connection.collection('ratelimit_register').deleteMany({});
    await mongoose.connection.collection('ratelimit_auth')
      .insertOne({ _id: '203.0.113.7', hits: 9, _expiresAt: FUTURE() });
    await mongoose.connection.collection('ratelimit_register')
      .insertOne({ _id: '203.0.113.7', hits: 4, _expiresAt: FUTURE() });
  });

  const post = (body) => agent.post('/api/v1/administrators/reset-rate-limits')
    .set('Authorization', `Bearer ${adminToken}`).set('x-csrf-token', csrfToken).send(body);

  it('deletes the seeded bucket for one IP across every limiter', async () => {
    const res = await post({ ip: '203.0.113.7' });
    expect(res.status).toBe(200);
    expect(res.body.deletedCount).toBeGreaterThanOrEqual(2);
    expect(await mongoose.connection.collection('ratelimit_auth')
      .countDocuments({ _id: '203.0.113.7' })).toBe(0);
    expect(await mongoose.connection.collection('ratelimit_register')
      .countDocuments({ _id: '203.0.113.7' })).toBe(0);
  });

  it('a type filter clears only that limiter', async () => {
    const res = await post({ type: 'auth' });
    expect(res.status).toBe(200);
    expect(res.body.deletedCount).toBe(1);
    expect(await mongoose.connection.collection('ratelimit_auth').countDocuments({})).toBe(0);
    expect(await mongoose.connection.collection('ratelimit_register').countDocuments({})).toBe(1);
  });

  it('never touches a collection named rate_limits', async () => {
    await post({});
    const names = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
    expect(names).not.toContain('rate_limits');
  });

  it('an unknown limiter name is a 400, not a silent success', async () => {
    const res = await post({ type: 'no-such-limiter' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('a regex-metacharacter IP is escaped, not interpreted', async () => {
    await mongoose.connection.collection('ratelimit_auth')
      .insertOne({ _id: '203a0b113c7', hits: 3, _expiresAt: FUTURE() });
    const res = await post({ ip: '203.0.113.7' });
    expect(res.status).toBe(200);
    expect(await mongoose.connection.collection('ratelimit_auth')
      .countDocuments({ _id: '203a0b113c7' })).toBe(1);
  });

  it('reports which collections it touched', async () => {
    const res = await post({ ip: '203.0.113.7' });
    expect(Array.isArray(res.body.collections)).toBe(true);
    expect(res.body.collections.map((c) => c.collection)).toContain('ratelimit_auth');
  });
});
```
```bash
cd "$AFF" && npx jest tests/integration/resetRateLimits.test.js 2>&1 | tail -30
```
  - Expected: `Tests: 6 failed, 6 total`, with these reasons — and each reason is the defect, not a
    test-harness fault:
    - case 1: `expect(received).toBeGreaterThanOrEqual(expected) // Received: 0` and the seeded docs still present
    - case 2: `Expected: 1, Received: 0`, `ratelimit_auth` count still `1`
    - case 3: `expect(received).not.toContain('rate_limits')` — the `deleteMany` **creates** the collection
    - case 4: `Expected: 400, Received: 200` — unknown names silently succeed
    - case 5: passes or fails depending on the current regex; record which (the controller path already
      escapes at `systemHealthService.js:98`, so this one may be green from the start — say so)
    - case 6: `expect(received).toBe(true) // Received: undefined` — no `collections` in the response
  - **Do not proceed until these six reasons are observed.** Paste them into the PR body.

- [ ] **Step 2: Rewrite the service function onto the real buckets.** In
      `server/services/systemHealthService.js`, replace `:90-112`:
```js
const rateLimiting = require('../middleware/rateLimiting');   // module held, never destructured (C-R5)
const wcRateLimiting = require('@crhs/web-core').rateLimiting;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');   // carried forward from :98

async function resetRateLimits({ type, ip, user, req }) {
  const db = mongoose.connection.db;
  if (!db) {
    logger.error('Database connection not available');
    throw new SystemHealthError('db_unavailable', 'Database connection not available');
  }
  const all = rateLimiting.LIMITER_NAMES;                 // read INSIDE the function (C-R5)
  const names = type ? all.filter((n) => n === type || n.includes(type)) : all;
  if (type && names.length === 0) {
    throw new SystemHealthError('unknown_limiter', `Unknown rate limiter: ${type}`, 400);
  }
  const collections = await wcRateLimiting.resetBuckets({
    names, idPattern: ip ? new RegExp(escapeRegExp(ip)) : undefined
  });
  const deletedCount = collections.reduce((s, c) => s + c.deletedCount, 0);
  await logAuditEvent(AuditEvents.ADMIN_RESET_RATE_LIMITS, user, { type, ip, deletedCount }, req);
  return { deletedCount, collections };
}
```
  - The `ADMIN_RESET_RATE_LIMITS` audit payload keeps its existing shape (`{ type, ip, deletedCount }`) —
    spec §7.6.3 requires that.
  - `SystemHealthError` must carry a `400` status for `unknown_limiter`; check its constructor signature
    first (`grep -n 'class SystemHealthError' -A8 server/services/systemHealthService.js`) and extend it in
    this commit if it hardcodes a status.

- [ ] **Step 3: Delete the inline handler; route to the controller.** In
      `server/routes/administratorRoutes.js` replace lines `197-237` with exactly:
```js
/**
 * @route   POST /api/administrators/reset-rate-limits
 * @desc    Reset rate limiting counters across every registered bucket
 * @access  Private - Administrator only (system.manage)
 */
router.post('/reset-rate-limits', checkAdminPermission(['system.manage']),
  administratorController.resetRateLimits);
```
```bash
cd "$AFF" && grep -c "rate_limits" server/routes/administratorRoutes.js server/services/systemHealthService.js
grep -n "resetRateLimits" server/routes/administratorRoutes.js
```
  - Expected: `server/routes/administratorRoutes.js:0`, `server/services/systemHealthService.js:0`, then one
    line showing the route wired to `administratorController.resetRateLimits`.

- [ ] **Step 4: Update the two assertions that let the bug through.** In
      `tests/integration/administratorRoutes.test.js`, `:44` and `:57`:
```bash
cd "$AFF" && sed -i 's|/Reset \\d+ rate limit records/|/Reset \\d+ rate limit entries/|g' tests/integration/administratorRoutes.test.js
grep -c 'rate limit records' tests/integration/administratorRoutes.test.js
```
  - Expected: `0`. Per §D-2 there are **exactly two** occurrences in that file.
  - `tests/unit/simpleRouteHandlers.test.js:49-87` copies the deleted handler into a throwaway router and
    stays green untouched. **Leave it** — C5 culls it with the rest.

- [ ] **Step 5: Green.**
```bash
cd "$AFF" && npx jest tests/integration/resetRateLimits.test.js tests/integration/administratorRoutes.test.js \
  tests/unit/administratorControllerRateLimits.test.js tests/unit/simpleRouteHandlers.test.js 2>&1 | tail -12
```
  - Expected: `Tests: … 0 failed`, including all 6 new cases. `administratorControllerRateLimits.test.js`
    mocks the service, so it must be updated to the `{ deletedCount, collections }` contract in this commit
    if it asserts the old shape — check with
    `grep -n 'deletedCount\|collections' tests/unit/administratorControllerRateLimits.test.js`.

- [ ] **Step 6: Controller runs the full suite, then commit.**
```bash
cd "$AFF" && npm test 2>&1 | tail -15
git add -A && git commit -m "fix(admin): reset-rate-limits was a double no-op — wrong collection and wrong key

The store writes ratelimit_<name> keyed on _id (rateLimitMongoStore.js:36,85).
All three reset paths deleted from a collection named rate_limits that nobody
writes, filtering a 'key' field that does not exist, so the endpoint returned
success with deletedCount 0 and an admin could not clear a jammed bucket.

- systemHealthService.resetRateLimits now fans out over LIMITER_NAMES via
  web-core resetBuckets({ names, idPattern }); IP metacharacters stay escaped;
  an unknown limiter name is a 400.
- administratorRoutes.js:197-237 inline handler deleted; the route now reaches
  administratorController.resetRateLimits, which was defined and unwired.
- tests/integration/resetRateLimits.test.js is the regression net. The old
  assertion /Reset \\d+ rate limit records/ matched 'Reset 0' — that is why the
  suite was green over a total no-op. Both occurrences updated.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Rollback (exact):**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git revert --no-edit <B7a sha> && npm test
```
Reverting restores the no-op. If the revert is needed after deploy, an admin can clear a bucket manually:
`mongosh --eval "db.getCollection('ratelimit_auth').deleteMany({_id: /<ip>/})"` on the ADB — the workaround
this fix exists to remove.

---

### C5: PR B7b — rate-limiting policy module + store shim + `codeAttemptLockout` + script rewrite + suite cull

Closes the remaining five §D-2 items. Per C-R3 the nine live limiters are already parameter-identical to
core's, so the policy module **binds**, it does not re-derive.

**Files:**
- Modify: `server/middleware/rateLimiting.js` (356 → ~90 lines; becomes the **policy module**, permanent per
  spec §7.3, not a shim)
- Modify: `server/middleware/rateLimitMongoStore.js` (134 → 5 lines; shim)
- Modify: `server/services/codeAttemptLockout.js:19,49` (read `getStore().collectionName`)
- Modify: `server/services/systemHealthService.js:31` (drop the two dead env knobs, C-R10)
- Rewrite: `scripts/admin/reset-rate-limits.js` (exports `{ parseArgs, run }`, adds `--expired`)
- Create: `server/middleware/rateLimitPolicy.test`-facing `tests/unit/rateLimitPolicy.test.js`,
  `tests/unit/resetRateLimitsScript.test.js`, `tests/unit/codeAttemptLockoutPrefix.test.js`
- Delete: `tests/unit/rateLimitMongoStore.test.js` (95), `tests/unit/rateLimitKeyGen.test.js` (75),
  `tests/unit/rateLimitingMiddleware.test.js` (451) — **only after** confirming their unique blocks were
  ported into web-core by B3f, `tests/unit/simpleRouteHandlers.test.js:49-87` (the throwaway copy of the
  handler C4 deleted)
- Modify (HUMAN-CONFIRM): `.env.example` — remove `RATE_LIMIT_WINDOW_MS`, `AUTH_RATE_LIMIT_MAX`

**Interfaces:**
- Consumes: C4's service contract; web-core `rateLimiting` (9 limiters, `createCustomLimiter`,
  `collectionNameFor`, `collectionPrefix`, `sweepExpired`, `resetBuckets`, the `LIMITER_NAMES` getter);
  `MongoRateLimitStore.collectionPrefix()` default `'ratelimit_'`; `C_INTAKE_LIVE` and `C_CONCIERGE_LIVE`
  from C1 (branching per C-R4 / C-R11).
- Produces: `server/middleware/rateLimiting.js` exports the live limiters, `createCustomLimiter`,
  `_keyGenerators` and `APP_LIMITER_NAMES` (a **getter**, never a snapshot);
  `scripts/admin/reset-rate-limits.js` exports `{ parseArgs, run }`; npm script `sweep:rate-limits`
  is created in C10, not here.
- **Hands to slice D:** the affiliate is core's last consumer of `contactFormBurstLimiter` /
  `contactFormLimiter`. After this task the guard in `tests/unit/rateLimitPolicy.test.js` pins zero affiliate
  imports of them, which is the precondition for deleting them from web-core. **Slice C does not delete
  them (C-R4).**

- [ ] **Step 1: Branch on what is still mounted (C-R4 / C-R11).**
```bash
cd "$AFF"
echo "intake=$(grep -c 'partnerInquiryRoutes\|affiliateApplicationRoutes' server.js) concierge=$(grep -c 'conciergeLimiter' server.js)"
```
  - `intake=0` → the policy module omits `contactFormBurstLimiter`/`contactFormLimiter`, and
    `contact_burst`/`contact_hourly` drop out of `APP_LIMITER_NAMES` (their collections become orphans that
    C10's `--drop-orphans` removes).
  - `intake=2` → the policy module **must** still export both, bound to core's, with the copy-before-delete
    comment block preserved verbatim.
  - `concierge=0` → omit `conciergeLimiter` and `concierge` from `APP_LIMITER_NAMES`; `concierge=2` → keep.
  - Record the branch: `rec C_B7_BRANCH "intake=<n> concierge=<n>"`.

- [ ] **Step 2: Confirm B3f actually ported the unique blocks before deleting 621 lines of tests.**
```bash
WC=/mnt/c/Users/rickh/GitHub/crhs-web-core
grep -c "createMongoStore\|createCustomLimiter\|RELAX_RATE_LIMITING\|LIMITER_NAMES\|sweepExpired\|resetBuckets" "$WC/tests/middleware/rateLimiting.test.js" 2>/dev/null || ls "$WC/tests/middleware/"
```
  - Expected: a count ≥ 6 in web-core's own suite. Spec §7.4 names the blocks that had to move:
    `createMongoStore` (`rateLimitingMiddleware.test.js:61-108`), `createCustomLimiter` (`:339-409`),
    `keyGenerator wiring` (`:415-451`), plus the `RELAX_RATE_LIMITING` production guard and the 10× rule.
  - **If any block is missing from web-core, do not delete the affiliate suite.** Port it to web-core first
    in a separate commit, then return here. Deleting unported coverage is the one irreversible mistake in
    this task.

- [ ] **Step 3: Write the failing policy test.** Create `tests/unit/rateLimitPolicy.test.js`:
```js
// PR B7 (spec §7.3, §7.6.3/§7.6.4). The affiliate's nine live limiters are
// parameter-identical to web-core's (measured), so the policy module BINDS core's
// limiters and owns only the app's name registry. APP_LIMITER_NAMES is a getter:
// codeAttemptLockout registers 'bag_codes' after this module loads (§D-2 warning).
const wc = require('@crhs/web-core');
const policy = require('../../server/middleware/rateLimiting');

describe('B7 rate-limit policy module', () => {
  it('binds core’s limiters rather than defining its own', () => {
    for (const k of ['authLimiter', 'passwordResetLimiter', 'registrationLimiter', 'apiLimiter',
      'sensitiveOperationLimiter', 'adminLoginLimiter']) {
      expect(policy[k]).toBe(wc.rateLimiting[k]);
    }
    expect(policy.createCustomLimiter).toBe(wc.rateLimiting.createCustomLimiter);
  });

  it('drops the three dead limiters', () => {
    for (const k of ['emailVerificationLimiter', 'fileUploadLimiter', 'adminOperationLimiter']) {
      expect(policy[k]).toBeUndefined();
    }
  });

  it('APP_LIMITER_NAMES is a getter that sees a late registration', () => {
    const before = policy.APP_LIMITER_NAMES;
    expect(before).not.toContain('bag_codes');
    require('../../server/services/codeAttemptLockout');           // registers bag_codes
    expect(policy.APP_LIMITER_NAMES).toContain('bag_codes');
    expect(policy.APP_LIMITER_NAMES).not.toBe(before);
  });

  it('APP_LIMITER_NAMES ⊇ every name the loaded routes registered', () => {
    require('../../server/routes/bagRoutes'); require('../../server/routes/customerRoutes');
    require('../../server/routes/scanRoutes'); require('../../server/routes/authRoutes');
    for (const n of ['auth', 'pwreset', 'register', 'api', 'sensitive', 'admin_login',
      'bag-resolve', 'claim-resolve', 'email-verify', 'scan_actions', 'bag_codes']) {
      expect(policy.APP_LIMITER_NAMES).toContain(n);
    }
  });

  it('the app default prefix is unchanged, so live buckets keep their names', () => {
    expect(wc.rateLimiting.collectionNameFor('auth')).toBe('ratelimit_auth');
  });

  it('no route imports core’s contact limiters any more (precondition for their deletion)', () => {
    // If C5 Step 1 recorded intake=2 this case is skipped in that branch; see the task note.
    const { execSync } = require('child_process');
    const hits = execSync('grep -rl contactFormBurstLimiter server/ || true',
      { cwd: require('path').join(__dirname, '..', '..') }).toString().trim();
    expect(hits).toBe('');
  });
});
```
```bash
cd "$AFF" && npx jest tests/unit/rateLimitPolicy.test.js 2>&1 | tail -20
```
  - Expected while the local module stands: `Tests: 6 failed, 6 total` — case 1 fails on
    `Object.is equality` (local `rateLimit()` objects are not core's), case 2 on
    `Received: [Function]` for the dead limiters, case 3 on `APP_LIMITER_NAMES` being `undefined`,
    case 5 may pass already (the default prefix is `ratelimit_` in both), case 6 fails while the
    intake routes live. If Step 1 recorded `intake=2`, mark case 6 `it.skip` with the comment
    `unskipped when slice B deletes the intake routes` and say so in the commit body.

- [ ] **Step 4: Write the store-shim and lockout tests.** Create `tests/unit/codeAttemptLockoutPrefix.test.js`:
```js
// §7.6.4: codeAttemptLockout.js:49 hand-built `ratelimit_${STORE_NAME}`, a second
// source of the collection name that ignores RATE_LIMIT_COLLECTION_PREFIX.
describe('codeAttemptLockout reads the store’s own collection name', () => {
  const OLD = process.env.RATE_LIMIT_COLLECTION_PREFIX;
  afterEach(() => { process.env.RATE_LIMIT_COLLECTION_PREFIX = OLD; jest.resetModules(); });

  it('honours RATE_LIMIT_COLLECTION_PREFIX', () => {
    process.env.RATE_LIMIT_COLLECTION_PREFIX = 'rl_test_';
    jest.resetModules();
    const lockout = require('../../server/services/codeAttemptLockout');
    expect(lockout.storeCollectionName()).toBe('rl_test_bag_codes');
  });

  it('contains no hand-built collection literal', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'server/services/codeAttemptLockout.js'), 'utf8');
    expect(src).not.toMatch(/`ratelimit_\$\{/);
    expect(src).not.toMatch(/'ratelimit_'/);
  });
});
```
```bash
cd "$AFF" && npx jest tests/unit/codeAttemptLockoutPrefix.test.js 2>&1 | tail -12
```
  - Expected: `Tests: 2 failed, 2 total` — `lockout.storeCollectionName is not a function`, and the source
    still matches `` `ratelimit_${ `` at `codeAttemptLockout.js:49`.

- [ ] **Step 5: Write the failing script test.** Create `tests/unit/resetRateLimitsScript.test.js`:
```js
// §D-2: rewrite scripts/admin/reset-rate-limits.js onto the real buckets, add an
// --expired sweep mode, and export { parseArgs, run } so the behaviour is testable.
const { parseArgs } = require('../../scripts/admin/reset-rate-limits');

describe('reset-rate-limits CLI', () => {
  it('parses --type, --ip, --expired and --yes', () => {
    expect(parseArgs(['--type', 'auth', '--ip', '203.0.113.7']))
      .toEqual(expect.objectContaining({ type: 'auth', ip: '203.0.113.7', expired: false, yes: false }));
    expect(parseArgs(['--expired'])).toEqual(expect.objectContaining({ expired: true }));
    expect(parseArgs(['--yes'])).toEqual(expect.objectContaining({ yes: true }));
  });

  it('rejects an unknown limiter name instead of silently matching nothing', () => {
    expect(() => parseArgs(['--type', 'no-such'], ['auth', 'api'])).toThrow(/Unknown rate limiter/);
  });

  it('accepts every real limiter name', () => {
    for (const n of ['auth', 'pwreset', 'register', 'api', 'sensitive', 'admin_login',
      'bag-resolve', 'claim-resolve', 'email-verify', 'scan_actions', 'bag_codes']) {
      expect(parseArgs(['--type', n], [n]).type).toBe(n);
    }
  });

  it('run() routes --expired to sweepExpired and the default to resetBuckets', async () => {
    const sweepExpired = jest.fn().mockResolvedValue([{ collection: 'ratelimit_auth', deletedCount: 2 }]);
    const resetBuckets = jest.fn().mockResolvedValue([{ collection: 'ratelimit_auth', deletedCount: 1 }]);
    const { run } = require('../../scripts/admin/reset-rate-limits');
    await run({ expired: true, yes: true }, { sweepExpired, resetBuckets, names: ['auth'] });
    expect(sweepExpired).toHaveBeenCalledTimes(1); expect(resetBuckets).not.toHaveBeenCalled();
    await run({ ip: '203.0.113.7', yes: true }, { sweepExpired, resetBuckets, names: ['auth'] });
    expect(resetBuckets).toHaveBeenCalledTimes(1);
    expect(resetBuckets.mock.calls[0][0].idPattern).toBeInstanceOf(RegExp);
  });
});
```
```bash
cd "$AFF" && npx jest tests/unit/resetRateLimitsScript.test.js 2>&1 | tail -10
```
  - Expected: `Tests: 4 failed, 4 total`, all with
    `TypeError: parseArgs is not a function` / `Cannot destructure property 'run'` — the script exports
    nothing today (it calls `resetRateLimits()` at module scope, `:126`).
  - **Note the side effect this proves:** requiring the current script *connects to MongoDB*. The rewrite
    must not execute anything on require — gate the CLI entry behind
    `if (require.main === module) { … }`.

- [ ] **Step 6: Implement all five changes in one commit.**
  - `server/middleware/rateLimiting.js` — the policy module. Keep the file's existing header comment about
    `NODE_ENV=test` / `RELAX_RATE_LIMITING`, re-export core's live limiters by name, re-export
    `createCustomLimiter` and `_keyGenerators` (`tests/unit/rateLimitKeyGen.test.js` is deleted, but the
    export is cheap and web-core's own suite covers the generators), and define:
```js
Object.defineProperty(module.exports, 'APP_LIMITER_NAMES', {
  enumerable: true,
  get: () => wc.rateLimiting.LIMITER_NAMES      // live getter over the live getter (C-R5)
});
```
  - `server/middleware/rateLimitMongoStore.js` → the 5-line shim over `wc.rateLimitMongoStore`.
  - `server/services/codeAttemptLockout.js` — `:19` requires the shim; `:48-50` becomes
    `mongoose.connection.collection(getStore().collectionName).findOne({ _id: key })`; export
    `storeCollectionName = () => getStore().collectionName`.
  - `scripts/admin/reset-rate-limits.js` — `module.exports = { parseArgs, run }`, CLI behind
    `require.main === module`, `--expired` → `sweepExpired`, default → `resetBuckets`, `--yes` to skip the
    5-second pause, help text listing the real limiter names. Keep `console.*` for CLI output (this is
    `scripts/`, not `server/`) but land the file at **0 ESLint errors**:
    `npx eslint scripts/admin/reset-rate-limits.js` must print nothing but the `no-console` warnings.
  - `server/services/systemHealthService.js:31` — delete `'RATE_LIMIT_WINDOW_MS'` and
    `'AUTH_RATE_LIMIT_MAX'` from `ALLOWED_ENV_VARS`; keep `'RATE_LIMIT_MAX_REQUESTS'` (it is live).

- [ ] **Step 7: Green the new suites, then cull the old ones.**
```bash
cd "$AFF" && npx jest tests/unit/rateLimitPolicy.test.js tests/unit/codeAttemptLockoutPrefix.test.js \
  tests/unit/resetRateLimitsScript.test.js tests/integration/resetRateLimits.test.js 2>&1 | tail -10
git rm -q tests/unit/rateLimitMongoStore.test.js tests/unit/rateLimitKeyGen.test.js \
  tests/unit/rateLimitingMiddleware.test.js tests/unit/simpleRouteHandlers.test.js
```
  - Expected: `Tests: … 0 failed` across the four suites (12 new + 6 from C4 = 18 cases, minus any
    `it.skip` from Step 3).

- [ ] **Step 8: Prove the live collection names did not move — the highest-risk assertion in this task.**
```bash
cd "$AFF" && node -e "
process.env.NODE_ENV='test'; delete process.env.RATE_LIMIT_COLLECTION_PREFIX;
const p=require('./server/middleware/rateLimiting');
require('./server/routes/authRoutes'); require('./server/routes/bagRoutes');
require('./server/routes/customerRoutes'); require('./server/routes/scanRoutes');
require('./server/services/codeAttemptLockout');
const wc=require('@crhs/web-core');
console.log('prefix='+wc.rateLimiting.collectionPrefix());
console.log('names='+p.APP_LIMITER_NAMES.slice().sort().join(','));"
```
  - Expected: `prefix=ratelimit_` and a `names=` line whose entries are the live bucket suffixes.
    With `intake=0 concierge=2` that is
    `admin_login,api,auth,bag-resolve,bag_codes,claim-resolve,email-verify,pwreset,register,sensitive,scan_actions`.
  - **Any change to `prefix` orphans every live counter in production.** If it is not `ratelimit_`, STOP.

- [ ] **Step 9: `.env.example` — HUMAN-CONFIRM (project rule: production config edits confirm first).**
  - Ask: "`RATE_LIMIT_WINDOW_MS` and `AUTH_RATE_LIMIT_MAX` are read by no limiter — only by the admin
    env-viewer allowlist. Remove both from `.env.example`?" Record the answer verbatim.
  - On approval remove the two lines; leave `RATE_LIMIT_MAX_REQUESTS`,
    `RATE_LIMIT_COLLECTION_PREFIX` and `RATE_LIMIT_TTL_INDEX` exactly as they are (`.env.example:128-138`).

- [ ] **Step 10: Controller runs the full suite, then commit.**
```bash
cd "$AFF" && npx madge --circular server/ 2>&1 | tail -2 && lintcount server/ | head -1 && npm test 2>&1 | tail -15
git add -A && git commit -m "refactor(rate-limit): B7 — policy module over web-core, store shim, real buckets

- server/middleware/rateLimiting.js becomes the app policy module: it binds
  web-core's nine live limiters (measured parameter-identical) and owns
  APP_LIMITER_NAMES as a GETTER, never a snapshot — codeAttemptLockout registers
  bag_codes after this module loads.
- rateLimitMongoStore.js becomes a shim; the three dead limiters
  (email_verify, upload, admin_op) are deleted — zero consumers.
- codeAttemptLockout.js:49 stops hand-building \`ratelimit_\${STORE_NAME}\` and
  reads getStore().collectionName, so a prefix change can never diverge.
- scripts/admin/reset-rate-limits.js rewritten onto the real buckets, exports
  { parseArgs, run }, adds --expired, and no longer connects to Mongo on require.
- ALLOWED_ENV_VARS drops RATE_LIMIT_WINDOW_MS and AUTH_RATE_LIMIT_MAX: no
  limiter reads either; they were rendered to admins as if live.
- 621 lines of duplicate limiter tests culled after confirming B3f ported their
  unique blocks into web-core, plus the throwaway handler copy in
  simpleRouteHandlers.test.js that C4's deletion orphaned.

Collection prefix verified unchanged at 'ratelimit_' — no live counter moves.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: `✔ No circular dependency found!`, `TOTAL 206` (unchanged — B7 touches no error-carrying line),
    `Tests: … 0 failed`.

**Rollback (exact):**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git revert --no-edit <B7b sha> && npm test
```
The revert restores the local limiter module and the hand-built collection literal; the prefix is
`ratelimit_` in both states, so **no live counter changes name in either direction**. C4 can stay landed.

---

### C6: PR B8 — `SystemConfig` registration module + `systemConfigDefaults.js`, in ONE commit

**Files:**
- Create: `server/config/systemConfigDefaults.js` (24 entries moved verbatim from
  `server/models/SystemConfig.js:167-394`)
- Modify: `server/models/SystemConfig.js` (450 → registration module; **permanent**, not a shim — it is the
  single place registration happens, so the four relative-path mocks keep working)
- Delete: `tests/unit/systemConfig.test.js` (904, duplicate of core's)
- Create: `tests/unit/systemConfigDefaults.test.js`, `tests/unit/noDuplicateModelRegistration.test.js`
- Modify: `tests/integration/webCoreInstanceIdentity.test.js` (add assertions e–g)

**Interfaces:**
- Consumes: web-core `SystemConfig` + `registerDefaults` (shipped B3e); `server.js:138-141` boot seed;
  `tests/setup.js:157-164`.
- Produces: a single `mongoose.model('SystemConfig', …)` registration process-wide, which unlocks the
  `.base` identity assertions that were illegal before B8 (spec §7.1.3 / P3).
- ⛔ **Spec §7.1.3 hard rule:** no intermediate state may have both `mongoose.model('SystemConfig'` calls
  reachable — on one mongoose instance that is `OverwriteModelError` **at boot**. Therefore the model file's
  body is replaced in the **same commit** that creates the defaults file. Do not split this task.

- [ ] **Step 1: Write both guards, failing.** `tests/unit/noDuplicateModelRegistration.test.js` greps
      `server/**/*.js` for `mongoose.model('SystemConfig'` and expects 0 matches:
```js
const { execSync } = require('child_process'); const path = require('path');
it('server/ registers SystemConfig exactly nowhere (web-core owns it)', () => {
  const out = execSync("grep -rn \"mongoose.model('SystemConfig'\" server/ || true",
    { cwd: path.join(__dirname, '..', '..') }).toString().trim();
  expect(out).toBe('');
});
```
      and `tests/unit/systemConfigDefaults.test.js` pins 24 keys, no `wavemax` substring in any description,
      and `initializeDefaults()` seeding 27 (3 core + 24 app).
```bash
cd "$AFF" && npx jest tests/unit/noDuplicateModelRegistration.test.js tests/unit/systemConfigDefaults.test.js 2>&1 | tail -12
```
  - Expected: both fail — the grep returns `server/models/SystemConfig.js:449:  mongoose.model('SystemConfig', …`
    (the exact line the spec names), and the defaults suite fails with
    `Cannot find module '../../server/config/systemConfigDefaults'`.

- [ ] **Step 2: Move the 24 entries verbatim and make the model the registration module.**
```bash
cd "$AFF" && sed -n '167,394p' server/models/SystemConfig.js | wc -l
grep -c "key:" server/models/SystemConfig.js
```
  - Expected: `228` lines in the block, and a `key:` count from which the 24 app entries are identified.
    Record both figures in the PR body so a reviewer can verify nothing was dropped.
  - `L175` must already read `house Associates` (de-branded by B3e) — verify with
    `sed -n '175p' server/models/SystemConfig.js`; if it still says `WaveMAX`, that is a brand-neutrality
    regression to fix in this commit.

- [ ] **Step 3: Green, including the identity assertions that only become legal now.**
```bash
cd "$AFF" && npx jest tests/unit/noDuplicateModelRegistration.test.js tests/unit/systemConfigDefaults.test.js \
  tests/integration/webCoreInstanceIdentity.test.js tests/unit/systemConfigRoutes.test.js \
  tests/unit/adminDashboard.test.js tests/unit/administratorController.test.js \
  tests/unit/administratorControllerEnhanced.test.js 2>&1 | tail -12
```
  - Expected: `Tests: … 0 failed`. The last four are the relative-path mock sites
    (`adminDashboard.test.js:62`, `administratorController.test.js:169`,
    `administratorControllerEnhanced.test.js:10`, `systemConfigRoutes.test.js:19`) — they keep working only
    because the model file stays at its path as a registration module rather than becoming a shim.
```bash
cd "$AFF" && node -e "
const wc=require('@crhs/web-core');const m=require('mongoose');const SC=require('./server/models/SystemConfig');
console.log(SC.base===m, wc.SystemConfig.base===m, m.mongo.Collection===require('mongodb').Collection,
  m.modelNames().filter(n=>n==='SystemConfig').length, require('@crhs/web-core/package.json').version);"
```
  - Expected: `true true true 1 0.2.1` — spec §10.3 P3's post-B8 form.

- [ ] **Step 4: Controller runs the full suite, then commit** (one commit, message names §7.1.3).

**Rollback (exact):**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git revert --no-edit <B8 sha> && \
  node -e "require('./server/models/SystemConfig');console.log('MODEL_OK')" && npm test
```
The revert restores both files together, so no `OverwriteModelError` window opens. `MODEL_OK` must print —
if it throws `OverwriteModelError`, the revert was partial: `git checkout <B8 sha>~1 -- server/models/SystemConfig.js server/config/` and re-run.

---

### C7: PR B9 — session adoption (`server.js:374-481` → web-core), `/health` stays before it

**Files:** Modify `server.js` (the inline session block and the `maxAge` fixer at `:495-515`);
create `tests/integration/sessionMount.test.js`.

**Interfaces:**
- Consumes: web-core `buildSessionMiddleware({ mongoUrl, secret, ttlSeconds, cookieName })` returning
  `{ middleware, store }` (B3d) with `_maxAgeFixer`; the production cookie name `__Host-portal.sid`
  (`server.js:418-420`), dev/test `portal.sid`; `sessionStore.clientP` consumed at `server.js:129-132`.
- Produces: `server.js` ~107 lines shorter; **`server.js:503 no-unused-vars 'originalExpires'` disappears**
  (C-R7) — the only error outside `server/` that slice C closes as a side effect.

- [ ] **Step 1: Failing mount test.** `tests/integration/sessionMount.test.js`:
      `GET /health` emits **no** `Set-Cookie` (the CF monitor hits it ~11/sec — this is the 2026-05-25
      session-store incident guard); `GET /api/csrf-token` sets a cookie with
      `originalMaxAge === 600000`; the cookie name is `portal.sid` under `NODE_ENV=test`.
```bash
cd "$AFF" && npx jest tests/integration/sessionMount.test.js 2>&1 | tail -12
```
  - Expected: it may **pass** on the current inline block (the ordering is already correct at `:418-424`).
    That is fine and must be stated: this suite is a **regression net for the swap**, not a defect repro.
    Record which cases were green before the change.

- [ ] **Step 2: Swap the block**, keeping `/health` registered before the session middleware and
      `sessionStore.clientP` reaching `server.js:129-132` unchanged. Delete the hand-rolled `maxAge` fixer —
      core's `_maxAgeFixer` replaces it (the long comment at `:505-515` explaining why the cookie object is
      mutated in place must **move with it** into web-core if it is not already there; that comment records a
      real production outage).
```bash
cd "$AFF" && grep -n "_maxAgeFixer\|originalExpires\|buildSessionMiddleware" server.js
npx eslint server.js 2>&1 | tail -3
```
  - Expected: a `buildSessionMiddleware` line, **no** `originalExpires`, and eslint printing nothing for
    `server.js` (1 error → 0).

- [ ] **Step 3: Prove nobody is logged out.**
```bash
cd "$AFF" && npx jest tests/integration/sessionMount.test.js tests/integration/domainMigration.test.js \
  tests/integration/webCoreConsumptionGolden.test.js 2>&1 | tail -10
```
  - Expected: `Tests: … 0 failed`. `domainMigration.test.js:46-55` and
    `webCoreConsumptionGolden.test.js:67-76` pin the cookie name; if either reds, the cookie name changed and
    **every logged-in portal user would be signed out on deploy** — STOP.

- [ ] **Step 4: Controller runs the full suite, then commit.**

**Rollback (exact):**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git revert --no-edit <B9 sha> && \
  npx jest tests/integration/sessionMount.test.js && npm test
```
If this is reverted after deploy, `pm2 reload wavemax` on both boxes; sessions survive either direction
because the cookie name and the `sessions` collection are unchanged.

---

### C8: PR B10 — email wrapper modules (composition, permanent); 19 call sites untouched

**Files:** Modify `server/services/email/transport.js` (82 lines → wrapper) and
`server/services/email/template-manager.js` (129 → wrapper); delete `tests/unit/emailTransport.test.js` (63);
create/extend `tests/unit/email-brand.test.js`.

**Interfaces:**
- Consumes: web-core `email.transport.sendEmail` (5-arg, brand-parameterised, `replyTo`, B3g),
  `email.templateManager.loadTemplate/fillTemplate`; `server/config/brand.js` (app-owned, kept per D13b —
  **never destructure `brand`**, its getters resolve lazily);
  `TEMPLATE_ROOT = path.join(__dirname, '..', '..', 'templates', 'emails')`.
- Produces: the 19 two-arg `loadTemplate` call sites (`dispatcher/affiliate.js:25,188,349,488,559,663`,
  `admin.js:18,135`, `customer.js:98,256,420,518,613`, `operator.js:18,137,253`, `onboarding.js:39`)
  keep their signature. **Zero dispatcher edits in this task** — that is the acceptance.

- [ ] **Step 1: Failing seam test** — `fromName` passthrough, a string 4th argument passed through
      unchanged, `TEMPLATE_ROOT` resolving to the app's own `server/templates/emails`, and
      `EMAIL_USER`/`EMAIL_FROM` domain agreement still enforced by `validateMailConfig()` (B3j).
      The hard rule from the 2026-08-23 outage: **`EMAIL_USER` must own `EMAIL_FROM`.**
```bash
cd "$AFF" && npx jest tests/unit/email-brand.test.js 2>&1 | tail -12
```
  - Expected: failures naming the wrapper functions that do not exist yet.

- [ ] **Step 2: Write both wrappers** exactly as spec §7.2.4 gives them (the `server/utils/cspHelper.js:1-31`
      pattern — no env dependency at module scope).

- [ ] **Step 3: Prove the 19 call sites and the 7 `jest.doMock` logger sites still work.**
```bash
cd "$AFF" && grep -rc "loadTemplate(" server/services/email/dispatcher/*.js server/services/email/*.js | grep -v ':0'
npx jest tests/unit/email-brand.test.js tests/integration/emailService.integration.test.js \
  tests/unit/emailServiceUncovered.test.js tests/unit/emailServiceAdditional.test.js 2>&1 | tail -10
```
  - Expected: a per-file count summing to 19, then `Tests: … 0 failed`
    (`emailService.integration.test.js:161-193` is the named acceptance).

- [ ] **Step 4: Controller runs the full suite, then commit.**

**Rollback (exact):** `git revert --no-edit <B10 sha> && npm test`. No mail is sent by the revert. If
reverted after deploy, `pm2 reload wavemax` and send one probe:
`node -e "require('dotenv').config();require('./server/services/email/transport').sendEmail('admin@crhsent.com','B10 revert probe','<p>ok</p>')"`.

---

### C9: PR B11 — CORS adoption (`server.js:282-328` → `cors(wc.corsConfig)`) + `CORS_ORIGIN`

**Files:** Modify `server.js:282-328`; modify `.env.example:75-79` (**HUMAN-CONFIRM**); extend
`tests/integration/cors.test.js`.

**Interfaces:**
- Consumes: web-core `corsConfig` (env-only after B3b: `CORS_ORIGIN` ∪ `CORS_EXTRA_ORIGINS`, no default
  origins, null-origin rejected, `credentials: true`); Task-20's executable contract in `.env.example`
  documenting every inline origin so this swap cannot silently drop one.
- Produces: production `CORS_ORIGIN=https://portal.atxwashdryfold.com`.
- ⚠️ **The trap recorded in memory (`cors_localhost_wavemax_promo_exposure_2026-09-13`): an unset or empty
  `CORS_ORIGIN` falls back to `localhost:3000` at `server.js:293-295`.** After the swap, web-core has no
  default origins, so an empty value rejects everything instead — which is a *different* failure mode
  (credentialed API calls from the portal's own pages break). The value must be **non-empty** on both boxes
  before reload.

- [ ] **Step 1: Failing test** — portal origin admitted; `https://atxwashdryfold.com` rejected;
      `https://www.wavemaxlaundry.com` rejected; `http://localhost:3000` rejected with `CORS_ORIGIN` set to
      the portal only; null origin rejected.
```bash
cd "$AFF" && CORS_ORIGIN=https://portal.atxwashdryfold.com npx jest tests/integration/cors.test.js 2>&1 | tail -12
```
  - Expected: the franchisor and localhost cases fail while the inline list at `server.js:282-328` still runs.

- [ ] **Step 2: Swap to `app.use(cors(wc.corsConfig))`; delete the inline block and its
      `localhost` default.**

- [ ] **Step 3: `.env.example` — HUMAN-CONFIRM.** Ask: "set `CORS_ORIGIN=https://portal.atxwashdryfold.com`
      in `.env.example:75-79` and delete the 'reserved' note?" Record verbatim. **Do not edit any box `.env`
      in this task** — that is a deploy step the controller owns, and it must land before `pm2 reload`.

- [ ] **Step 4: Green + prove no origin was lost.**
```bash
cd "$AFF" && CORS_ORIGIN=https://portal.atxwashdryfold.com npx jest tests/integration/cors.test.js 2>&1 | tail -8
git show HEAD:server.js | sed -n '282,328p' | grep -o "https\?://[a-z0-9.:-]*" | sort -u
```
  - Expected: `Tests: … 0 failed`, then the origin list from the pre-change block. Every entry must either
    be in `.env.example`'s documented set or be one this plan deliberately drops (`localhost:3000`,
    `127.0.0.1:3000`, `wavemax.promo`, the franchisor hosts). List the dropped ones in the commit body —
    that list is the whole point of Plan 1 Task 20.

- [ ] **Step 5: Controller runs the full suite, then commit.**

**Rollback (exact):** `git revert --no-edit <B11 sha>`, then on each box restore the previous `CORS_ORIGIN`
line from `/var/www/wavemax/env-backups/` and `pm2 reload wavemax --update-env`. Verify with
`curl -sI -H 'Origin: https://portal.atxwashdryfold.com' https://portal.atxwashdryfold.com/api/health | grep -i access-control-allow-origin`.

---
### C10: PR B13 — shared-DB ownership: delete `storeIPs`, the four `Access*` models and `MediatorAccess`; move the two seed scripts to corporate; sweep script + cron

**Files:**
- Delete (affiliate): `server/config/storeIPs.js` (144), `tests/unit/storeIPs.test.js` (356),
  `server/models/Access{Click,Gate,Request,Whitelist}.js`, `server/models/MediatorAccess.js`,
  `scripts/seed-access-gate.js`, `scripts/whitelist-access-ip.js`
- Modify (affiliate): `server/middleware/auth.js:10` (the dead `storeIPConfig` import — this also removes
  1 of the 42 `no-unused-vars`), `tests/unit/authMiddleware.test.js:16` (the mock of it),
  `scripts/ensure-indexes.js` (MODELS: drop the 5 corporate models, add `SystemConfig`, `RefreshToken`,
  `TokenBlacklist`, `Affiliate`, `Administrator`, `Transaction`), `tests/unit/branding-guard.test.js`
  (allowlist), `package.json` (npm script `sweep:rate-limits`)
- Create (affiliate): `scripts/ops/sweep-rate-limits.js`, `deploy/cron/wavemax-sweep-rate-limits`,
  `tests/unit/sweepRateLimits.test.js`
- Create (corporate): `scripts/seed-access-gate.js`, `scripts/whitelist-access-ip.js` (retargeted to
  corporate models + `wc.logger`, npm scripts `seed:access-gate`, `whitelist:ip`)

**Interfaces:**
- Consumes: C5's `APP_LIMITER_NAMES` getter; web-core `sweepExpired({ names })`;
  `TokenBlacklist.cleanupExpired()` (`TokenBlacklist.js:66-68`, **no caller today**);
  `RefreshToken` expiry field.
- Produces: exactly one process registering the five gate models (corporate); the portal's unbounded-growth
  gap closed; `--drop-orphans` available to remove `ratelimit_{contact_*,concierge,email_verify,upload,admin_op}`
  after Phase 2.
- ⚠️ **Never `drop()` a collection on Oracle ADB** (memory: `lighthouse_psi_quality_bar`, the sessions
  incident). `--drop-orphans` must use `deleteMany({})` + a printed instruction, **or** be explicitly
  approved by the owner as a `drop`. Default: print only. This is an escalation, not a silent choice.

- [ ] **Step 1: Prove the affiliate never reads the five models at runtime before deleting them.**
```bash
cd "$AFF" && for m in AccessClick AccessGate AccessRequest AccessWhitelist MediatorAccess; do
  echo "$m: $(grep -rln "models/$m" server/ server.js scripts/ | grep -v 'server/models/' | tr '\n' ' ')"
done
grep -rn "config/storeIPs" server/ server.js | grep -v 'server/config/storeIPs.js'
```
  - Expected: each model names **only** `scripts/ensure-indexes.js` (and for `MediatorAccess`,
    `ensure-indexes.js:15,34-36`). Any controller, route or middleware hit means the model is live — STOP
    and report. `storeIPs` must show only `server/middleware/auth.js:10`.

- [ ] **Step 2: Failing sweep test.** `tests/unit/sweepRateLimits.test.js` — `sweepExpired` is called with
      the live `APP_LIMITER_NAMES`; the token purges run; `--drop-orphans` **prints and does nothing**
      without an explicit flag; with the flag it targets only `ratelimit_*` names absent from
      `APP_LIMITER_NAMES` and never a non-`ratelimit_` collection.
```bash
cd "$AFF" && npx jest tests/unit/sweepRateLimits.test.js 2>&1 | tail -10
```
  - Expected: `Cannot find module '../../scripts/ops/sweep-rate-limits'`.

- [ ] **Step 3: Implement the deletions, the moves and the sweep script.** Corporate's copies must pass its
      own suite:
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npm test 2>&1 | tail -8
node -e "require('./scripts/seed-access-gate.js')" 2>&1 | tail -2
```
  - Expected corporate: `Tests: … 0 failed` with `ensure-indexes.test.js` still asserting ≥ 5 models.

- [ ] **Step 4: Both `ensure-indexes` exit 0.**
```bash
cd "$AFF" && node scripts/ensure-indexes.js --dry-run 2>&1 | tail -5; echo "AFF_EXIT=$?"
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && node scripts/ensure-indexes.js --dry-run 2>&1 | tail -5; echo "CORP_EXIT=$?"
```
  - Expected: `AFF_EXIT=0` and `CORP_EXIT=0`. If `--dry-run` is not a supported flag, run against a local
    `mongodb-memory-server` URI instead — **never against the production ADB from this task.**

- [ ] **Step 5: Lint delta and the branding guard.**
```bash
cd "$AFF" && lintcount server/ | head -3 && npx jest tests/unit/branding-guard.test.js tests/unit/authMiddleware.test.js 2>&1 | tail -6
```
  - Expected: `TOTAL 196` (206 − 9 for `storeIPs.js` − 1 for the `auth.js:10` import), then
    `Tests: … 0 failed`.

- [ ] **Step 6: Controller runs both suites, then commit** (one affiliate commit + one corporate commit; the
      corporate commit lands **first** so the seed scripts exist before the affiliate deletes them).

- [ ] **Step 7: Cron install — HANDED TO THE CONTROLLER, not run here.**
      `deploy/cron/wavemax-sweep-rate-limits` is the exact `/etc/cron.d` content (`5 * * * *`, **oci1 only**;
      idempotent so oci2 may also run it). Installing it is a box action the controller performs with the
      slice-C deploy, exactly as Plan 2 handed P-16's cron to GATE Task 81 Step 7.
  - Rollback for the install: `ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'sudo rm -f /etc/cron.d/wavemax-sweep-rate-limits'`

**Rollback (exact):**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git revert --no-edit <B13-affiliate sha>
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && git revert --no-edit <B13-corporate sha>
```
Revert the **affiliate first**, then corporate — the reverse of the landing order — so no window exists in
which neither repo owns the seed scripts. No data is touched by either revert.

---

### C11: PR B14 — remove all shims; call sites import `@crhs/web-core` directly; the `mockWebCore` Proxy helper

**Files:**
- Delete: the 14 shim files — `server/middleware/{sanitization,errorHandler,cspNonce,ipGate,rateLimitMongoStore}.js`,
  `server/utils/{mongoCursorRetry,mongoOracleDiagnostics,auditLogger,clientIp,controllerHelpers,encryption,logger,validateSecrets}.js`,
  `server/services/geocodingService.js`
- Modify: every call site (`require('@crhs/web-core')` directly)
- Delete: `tests/unit/logger.test.js` (39, duplicate; note its env-reload at `:5`)
- Create: `tests/helpers/mockWebCore.js`
- Modify: the ~44 mock sites — auditLogger ×16, encryption ×7, controllerHelpers ×6, logger ×4 +
  `doMock` ×7, geocodingService ×2 + `requireActual`, cspHelper ×2

**Interfaces:**
- Consumes: C2–C10's shims (this task is their terminus).
- Produces: spec §7.7 criterion 1 — the only affiliate `server/` modules mentioning `@crhs/web-core` are the
  **six composition modules** (`models/SystemConfig.js`, `middleware/rateLimiting.js`, `config/csrf-config.js`,
  `services/email/{transport,template-manager}.js`, `utils/cspHelper.js`) plus `config/csrfTables.js` and
  direct call sites; **zero 5-line shims remain**.
- ⛔ **`src/index.js` forbids spreading** — mocking `@crhs/web-core` with
  `{ ...jest.requireActual('@crhs/web-core') }` eagerly loads every lazy getter, which is exactly the
  ORA-04036 crash-loop shape from 2026-08-27 (memory: `tier3_webcore_ora04036_2026-08-27`). The Proxy helper
  exists to prevent that and **must not** be replaced by a spread.

- [ ] **Step 1: Write `tests/helpers/mockWebCore.js` and its own test first.**
```js
// Preserves laziness: a spread would load every getter in src/index.js (the header
// forbids it) — the eager-load shape behind the 2026-08-27 ORA-04036 crash-loop.
module.exports.mockWebCoreKey = (key, impl) => jest.mock('@crhs/web-core', () =>
  new Proxy(jest.requireActual('@crhs/web-core'), { get: (t, k) => (k === key ? impl : t[k]) }));
```
```bash
cd "$AFF" && npx jest tests/unit/mockWebCoreHelper.test.js 2>&1 | tail -10
```
  - Expected: fails on the missing helper. The helper's own test must assert that reading one key does **not**
    touch the others — e.g. spy that `wc.SystemConfig` is never accessed when only `auditLogger` is mocked.

- [ ] **Step 2: Delete the shims in one commit and repoint every call site.**
```bash
cd "$AFF" && grep -rl "@crhs/web-core" server/ | sort
node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK')" 2>&1 | tail -2
```
  - Expected: exactly the seven composition/config files listed above, then `BOOT_OK`.

- [ ] **Step 3: The acceptance grep — no `server/**` file is a re-export.**
```bash
cd "$AFF" && for f in $(grep -rl "@crhs/web-core" server/); do
  n=$(grep -vc '^\s*\(//.*\)\?$' "$f"); echo "$n $f"; done | sort -n | head -10
```
  - Expected: every line's count is **> 1** — a count of exactly 1 is a surviving 5-line shim.

- [ ] **Step 4: Cycles, size rules, and the suite without `--forceExit`.**
```bash
cd "$AFF" && npx madge --circular server/ 2>&1 | tail -2
find server -name '*.js' -exec wc -l {} + | sort -rn | head -5
find server/controllers -name '*.js' -exec wc -l {} + | sort -rn | head -3
TZ=America/Chicago npx jest --runInBand 2>&1 | tail -12
```
  - Expected: `✔ No circular dependency found!`; **no `server/` file over 800 lines**; **no controller over
    500** (note `administratorController.js` is 716 today and is a controller — see C12); and the suite
    green **without** `--forceExit`. Any open handle reported here is fixed in this commit.

- [ ] **Step 5: Controller runs the full suite, then commit.**

**Rollback (exact):** `git revert --no-edit <B14 sha> && node -e "require('./server.js')" && npm test`.
This is the largest single revert in the slice (14 files plus ~44 mock sites); if the revert conflicts,
`git checkout <B14 sha>~1 -- server/ tests/` is the deterministic fallback.

---

### C12: Adoption-series exit gate — spec §7.7 acceptance, read-only, plus the `--forceExit` removal

**Files:** Modify `package.json` (drop `--forceExit` from the six test scripts) — the only write.

**Interfaces:**
- Consumes: C2–C11.
- Produces: `C_ADOPTION_DONE=PASS`, which **gates C13**.

- [ ] **Step 1: §7.7 criterion 1 — no duplicated implementation anywhere.**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; WC=/mnt/c/Users/rickh/GitHub/crhs-web-core
cd "$AFF" && for f in $(cd server && find . -name '*.js'); do
  c="$WC/src/${f#./}"; [ -f "$c" ] && { d=$(diff -q "server/$f" "$c" >/dev/null && echo IDENTICAL || echo differs); echo "$d server/$f"; }
done | grep IDENTICAL
```
  - Expected: **no output.** Any `IDENTICAL` line is a file that exists twice — the exact condition Item B
    exists to remove.

- [ ] **Step 2: §7.7 criterion 2 — the 12 duplicate suites are gone, `brand-config.test.js` is kept.**
```bash
cd "$AFF" && ls tests/unit/{systemConfig,rateLimitMongoStore,rateLimitKeyGen,rateLimitingMiddleware,sanitization,errorHandler,auditLogger,storeIPs,mongoCursorRetry,mongoOracleDiagnostics,logger,emailTransport}.test.js 2>&1 | tail -3
ls -l tests/unit/brand-config.test.js
```
  - Expected: `No such file or directory` for all twelve, and `brand-config.test.js` present at 53 lines.

- [ ] **Step 3: Remove `--forceExit` and prove the suite is clean without it.**
```bash
cd "$AFF" && sed -i 's/ --forceExit//g' package.json && grep -n '"test' package.json
TZ=America/Chicago npx jest --runInBand --detectOpenHandles 2>&1 | tail -20
```
  - Expected: no `--forceExit` in any script, and the run ends with `Tests: … 0 failed` and **no**
    `Jest has detected the following N open handles` block. If handles are reported, fix them here —
    the project rule is that the suite runs clean without `--forceExit` after Phase 1, and this is the
    last task that can honour it before the ESLint series begins.
  - ⚠️ Memory note (`test_suite_fully_green_2026-06-20`, amended 2026-08-24): the suite is no longer
    reliably 0-fail — **re-run a failing suite alone before debugging it.** Three suites have failed in a
    full run and passed in isolation.

- [ ] **Step 4: Size rules and boot.**
```bash
cd "$AFF" && find server -name '*.js' -exec wc -l {} + | sort -rn | sed -n '2,6p'
find server/controllers -name '*.js' -exec wc -l {} + | sort -rn | sed -n '2,4p'
node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK')" | tail -1
npx eslint server.js 2>&1 | tail -2
```
  - Expected: nothing in `server/` over 800; **`server/controllers/administratorController.js` is 716 lines
    today — over the 500-line controller rule.** It is not slice C's job to split it, and C5/C11 do not grow
    it. **Escalate it in C20 as a named, pre-existing violation** rather than silently accepting or
    opportunistically splitting it. `BOOT_OK`, and eslint prints nothing for `server.js` (C-R7, closed by C7).

- [ ] **Step 5: Record and commit.**
```bash
rec C_ADOPTION_DONE PASS
rec C_LINT_AFTER_ADOPTION "$(lintcount server/ | head -1)"
cd "$AFF" && git add package.json && git commit -m "test: drop --forceExit — the suite runs clean without it after B5-B14

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: `C_LINT_AFTER_ADOPTION` records `TOTAL 196` (predicted) — the number C13 starts from.

**Rollback (exact):** `git revert --no-edit <forceExit sha>` restores the flag. Steps 1, 2 and 4 are
read-only and have nothing to roll back.

---

# GROUP C-2 — Item 14: all affiliate `server/` ESLint errors → **0**

**Owner decision 2, verbatim:** "fix **all 208** affiliate `server/` ESLint errors. Own commit series,
**after** the flips are verified, never mixed into a cutover commit."

**Batching principle.** Six commits, each independently testable and revertable, ordered from lowest
semantic risk to highest:

| Task | Batch | Errors (measured at draft) | Risk | Gate |
|:--|:--|--:|:--|:--|
| C14 | `indent` autofix | 63 | none — whitespace only | `git diff -w` **empty** + suite |
| C15 | `no-trailing-spaces` autofix | 51 | none — whitespace only | `git diff -w` **empty** + suite |
| C16 | `comma-dangle` + `quotes` autofix | 41 | token-level | `node --check` per file + suite |
| C17 | `no-unused-vars` — deletions | 42 | low — proves nothing was load-bearing | boot probe + suite |
| C18 | the 11 semantic errors | 11 | **highest** — regex + control flow | a new test per fix, TDD |
| C19 | config alignment + zero gate + guard test | — | — | programmatic `0` |

Every task in this group runs **after** `C_ADOPTION_DONE=PASS`. Stated in each **Interfaces: Consumes**.

---

### C13: ESLint series preflight — re-measure, record, and freeze the arithmetic

**Files:** none.

**Interfaces:**
- Consumes: `C_ADOPTION_DONE=PASS` (C12) and, transitively, slice A's verified flips — **both** are hard
  preconditions from owner decision 2.
- Produces: `E_TOTAL_0`, `E_INDENT_0`, `E_TRAIL_0`, `E_COMMA_0`, `E_QUOTES_0`, `E_UNUSED_0`, `E_SEMANTIC_0`.

- [ ] **Step 1: Refuse to start early.**
```bash
set -a; . "$REC"; set +a; echo "adoption=$C_ADOPTION_DONE flips=$ALL_HOSTS_FLIPPED"
```
  - Expected: `adoption=PASS flips=PASS`. Anything else — STOP. Mixing lint churn into an unverified cutover
    is the specific thing the owner ruled out.

- [ ] **Step 2: Re-measure. The draft-time 208 has moved.**
```bash
lintcount server/
```
  - Expected shape (predicted, C-R6): `TOTAL 196`, then
    `63 indent`, `43 no-trailing-spaces`, `41 no-unused-vars`, `28 comma-dangle`, `11 quotes`,
    `5 no-useless-escape`, `1 no-prototype-builtins`, `1 no-useless-catch`,
    `1 import/no-dynamic-require`, `1 no-case-declarations`.
  - The deltas from 208 and why: `storeIPs.js` −9 (C10), `sanitization.js` −2 (C2), `auth.js:10` −1 (C10),
    the two intake controllers −2 (slice B). **Record the actual numbers; do not force them to match the
    prediction.** If `TOTAL` went *up*, find which task added errors and fix it there before continuing.

- [ ] **Step 3: Confirm the autofix split still holds.**
```bash
cd "$AFF" && npx eslint server/ --fix-dry-run --fix-type layout -f json 2>/dev/null | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);let e=0;for(const f of r)e+=f.errorCount;console.log('remaining after layout autofix: '+e);});"
```
  - Expected: `remaining after layout autofix: 51` (predicted; 53 at draft time minus the 2 in
    `sanitization.js`). Every autofixable error in this repo is `layout`-type — measured, not assumed.

- [ ] **Step 4: Record.**
```bash
for r in indent no-trailing-spaces comma-dangle quotes no-unused-vars; do
  rec "E_$(echo $r | tr 'a-z-' 'A-Z_')_0" "$(lintcount server/ | awk -v R=$r '$2==R{print $1}')"
done
rec E_TOTAL_0 "$(lintcount server/ | awk '/^TOTAL/{print $2}')"
```

**Rollback (exact):** none — read-only.

---

### C14: ESLint batch 1 — `indent` (63), whitespace only

**Files:** the `indent`-carrying files. At draft time: `server/utils/formatters.js` (36),
`server/monitoring/connectivity-monitor.js` (14), `server/middleware/authorizationHelpers.js` (13).

**Interfaces:**
- Consumes: `E_INDENT_0`.
- Produces: `indent` absent from `lintcount server/`.
- **This batch changes no token.** The gate is a proof of that, not a hope: `git diff -w` must be empty.

- [ ] **Step 1: Scope the autofix to `indent` alone** by turning the other three fixable layout rules off
      for this run (`--rule` merges into the config; it does not restrict, so the other rules must be
      explicitly disabled):
```bash
cd "$AFF" && npx eslint server/ --fix --rule '{"no-trailing-spaces":"off","comma-dangle":"off","quotes":"off"}'
echo "EXIT=$?"
```
  - Expected: `EXIT=1` (the 51 non-fixable errors remain, so eslint still exits non-zero) and a printed list
    containing **no `indent`** lines.

- [ ] **Step 2: The whitespace proof — this is the gate.**
```bash
cd "$AFF" && git diff -w --stat | tail -3; echo "WS_ONLY_EXIT=$(git diff -w --quiet && echo 0 || echo 1)"
git diff --stat | tail -3
```
  - Expected: `WS_ONLY_EXIT=0` and **no output** from `git diff -w --stat`, while `git diff --stat` shows the
    three files changed. Whitespace-insensitive diff empty ⇒ **nothing but indentation moved.**
  - If `WS_ONLY_EXIT=1`, the autofixer touched a token: `git checkout -- server/` and report. Do not proceed.

- [ ] **Step 3: Parse + count.**
```bash
cd "$AFF" && for f in $(git diff --name-only); do node --check "$f" || echo "SYNTAX_FAIL $f"; done; echo "PARSE_OK"
lintcount server/ | head -4
```
  - Expected: `PARSE_OK` with no `SYNTAX_FAIL`, then `TOTAL 133` (196 − 63) and **no `indent` line**.

- [ ] **Step 4: Controller runs the full suite, then commit.**
```bash
cd "$AFF" && npm test 2>&1 | tail -12
git add -A && git commit -m "style(server): eslint --fix indent (63 errors) — whitespace only

Plan 3 item 14, batch 1 of 6. Scoped autofix: the other three fixable layout
rules are disabled for the run so only indent changes. Proof that nothing but
indentation moved: \`git diff -w\` is empty while \`git diff\` shows 3 files.
server/ errors 196 -> 133.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Rollback (exact):**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git revert --no-edit <batch-1 sha> && \
  npx eslint server/ -f json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);let e=0;for(const f of r)e+=f.errorCount;console.log(e);});"
```
Expected after revert: the pre-batch total (196). Nothing is deployed; a revert needs no box action.

---

### C15: ESLint batch 2 — `no-trailing-spaces` (43 predicted), whitespace only

**Files:** the trailing-space carriers. At draft time: `formatters.js` 12, `docsRoutes.js` 6,
`authorizationHelpers.js` 5, `Operator.js` 4, `Administrator.js` 4, `validators.js` 4,
`connectivity-monitor.js` 3, `securityUtils.js` 3, `affiliateController.js` 1, `affiliateRoutes.js` 1
(`storeIPs.js`'s 8 are already gone with C10).

**Interfaces:**
- Consumes: `E_TRAIL_0`; `C_ADOPTION_DONE=PASS`.
- Produces: `no-trailing-spaces` absent from `lintcount server/`.
- **This batch changes no token.** Gate: `git diff -w` empty.

- [ ] **Step 1: Scoped autofix.**
```bash
cd "$AFF" && npx eslint server/ --fix --rule '{"indent":"off","comma-dangle":"off","quotes":"off"}'; echo "EXIT=$?"
```
  - Expected: `EXIT=1`, and no `no-trailing-spaces` lines in the output.

- [ ] **Step 2: The whitespace proof.**
```bash
cd "$AFF" && echo "WS_ONLY_EXIT=$(git diff -w --quiet && echo 0 || echo 1)"; git diff --stat | tail -3
```
  - Expected: `WS_ONLY_EXIT=0`, with ~10 files changed.

- [ ] **Step 3: Parse + count.**
```bash
cd "$AFF" && for f in $(git diff --name-only); do node --check "$f" || echo "SYNTAX_FAIL $f"; done; echo "PARSE_OK"
lintcount server/ | head -4
```
  - Expected: `PARSE_OK`, `TOTAL 90` (133 − 43), no `no-trailing-spaces` line.

- [ ] **Step 4: Controller runs the full suite, then commit** (message mirrors C14, batch 2 of 6, `133 -> 90`).

**Rollback (exact):** as C14, expecting `133` after the revert.

---

### C16: ESLint batch 3 — `comma-dangle` (28) + `quotes` (11), token-level

**Files:** `server/monitoring/connectivity-monitor.js` (24 `comma-dangle`),
`server/config/quarantineConfig.js` (3), `server/middleware/locationQuarantine.js` (1),
`server/middleware/explorerGuard.js` (9 `quotes`), `server/controllers/customerController.js` (1),
plus the two intake controllers if slice B has not yet deleted them.

**Interfaces:**
- Consumes: `E_COMMA_0`, `E_QUOTES_0`; `C_ADOPTION_DONE=PASS`.
- Produces: `comma-dangle` and `quotes` absent from `lintcount server/`.
- Unlike C14/C15 this batch **does** change tokens: trailing commas are removed and `"` becomes `'`.
  `git diff -w` will not be empty, so the gate is a parse check plus a **string-content** check — a naive
  quote flip can corrupt a string that itself contains an apostrophe.

- [ ] **Step 1: Scoped autofix.**
```bash
cd "$AFF" && npx eslint server/ --fix --rule '{"indent":"off","no-trailing-spaces":"off"}'; echo "EXIT=$?"
```
  - Expected: `EXIT=1`, no `comma-dangle` or `quotes` lines in the output.

- [ ] **Step 2: Parse, then prove no string literal changed meaning.**
```bash
cd "$AFF" && for f in $(git diff --name-only); do node --check "$f" || echo "SYNTAX_FAIL $f"; done; echo "PARSE_OK"
for f in $(git diff --name-only); do
  node -e "
const a=require('child_process').execSync('git show HEAD:'+process.argv[1]).toString();
const b=require('fs').readFileSync(process.argv[1],'utf8');
const strs=(s)=>(s.match(/(['\"])(?:\\\\.|(?!\\1)[^\\\\\\n])*\\1/g)||[]).map(x=>x.slice(1,-1));
const A=strs(a),B=strs(b);
console.log((A.length===B.length && A.every((x,i)=>x===B[i]) ? 'STRINGS_SAME ' : 'STRINGS_DIFFER ')+process.argv[1]);
" "$f"; done
```
  - Expected: `PARSE_OK`, then `STRINGS_SAME <file>` for every changed file. A `STRINGS_DIFFER` line means
    the quote fixer altered a literal's contents — `git checkout -- <file>`, fix that file by hand, and note
    it in the commit body.

- [ ] **Step 3: Count.**
```bash
lintcount server/ | head -4
```
  - Expected: `TOTAL 51` (90 − 39), with neither `comma-dangle` nor `quotes` present.

- [ ] **Step 4: Controller runs the full suite, then commit** (batch 3 of 6, `90 -> 51`).

**Rollback (exact):** as C14, expecting `90` after the revert.

---
### C17: ESLint batch 4 — `no-unused-vars` (41 predicted), manual deletions

The largest manual batch and the most boring. 38 of the 41 are **unused `require()` bindings at the top of a
file**; the rest are an unused local (`affiliateController.js:895 customerObjectIds`), an unused option
(`passwordValidator.js:138 options`) and four unused `next` / handler parameters.

**Files:** the `no-unused-vars` carriers (draft-time distribution, minus what C10 removed):
`administratorController.js` 13 · `authController.js` 5 · `auth.js` 4 (the 5th, `storeIPConfig`, went with
C10) · `Operator.js` 2 · `operatorRoutes.js` 2 · `adminDashboardService.js` 2 ·
`affiliateController.js` 1 · `authorizationHelpers.js` 1 · `Administrator.js` 1 · `Affiliate.js` 1 ·
`authRoutes.js` 1 · `customerRoutes.js` 1 · `docsRoutes.js` 1 · `administratorAccountService.js` 1 ·
`dispatcher/affiliate.js` 1 · `dispatcher/customer.js` 1 · `dispatcher/operator.js` 2 ·
`passwordValidator.js` 1

**Interfaces:**
- Consumes: `E_UNUSED_0`.
- Produces: `no-unused-vars` absent. **Also produces evidence that 38 requires were dead** — the boot probe
  and suite are what prove a deleted require was not load-bearing through a side effect.
- ⚠️ **A `require()` can be load-bearing for its side effects even when its binding is unused** — a model
  file that calls `mongoose.model(...)`, a module that registers a limiter name. `administratorController.js`
  requires `SystemConfig`, `Administrator`, `Operator`, `Order`, `Customer`, `Transaction` — **all model
  files**. Deleting those requires can silently un-register a model for any code path that relied on this
  controller loading it. **This is the one batch where "unused" is not obviously safe.**

- [ ] **Step 1: Separate the three classes before touching anything.**
```bash
cd "$AFF" && npx eslint server/ -f json 2>/dev/null | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);
for(const f of r) for(const m of f.messages) if(m.ruleId==='no-unused-vars'){
  const p=f.filePath.replace(process.cwd()+'/','');
  const src=require('fs').readFileSync(f.filePath,'utf8').split('\n')[m.line-1];
  const kind=/require\(/.test(src) ? (/models\//.test(src)?'MODEL_REQUIRE':'REQUIRE') : (/function|=>|\(/.test(src)&&m.message.includes('defined but never used')?'PARAM':'LOCAL');
  console.log(kind.padEnd(14)+p+':'+m.line+'  '+m.message);}});" | sort
```
  - Expected: a classified list. At draft time: **8 `MODEL_REQUIRE`** (`administratorController.js` L4,5,6,8,9,10;
    `auth.js` L4,5,6,7 — i.e. up to 10), the rest `REQUIRE`, `PARAM` (4 × `next`/handler args) and
    `LOCAL` (2).

- [ ] **Step 2: Handle the `PARAM` class with a rename, not a deletion.** The config is
      `'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]`, so `next` → `_next` satisfies it while
      keeping Express's 4-arity error-handler signature intact — **deleting a 4th parameter turns an error
      handler into ordinary middleware.** `customerRoutes.js:40`, `operatorRoutes.js:22,34`,
      `dispatcher/operator.js:371` (`operator`, `resetUrl`).
```bash
cd "$AFF" && grep -n "_next\|(req, res, next)" server/routes/customerRoutes.js server/routes/operatorRoutes.js | head
node -e "const f=require('./server/routes/operatorRoutes');console.log('ROUTER_OK');"
```
  - Expected: the renamed params present, then `ROUTER_OK`.

- [ ] **Step 3: For every `MODEL_REQUIRE`, prove the model is registered elsewhere before deleting.**
```bash
cd "$AFF" && for m in Administrator Operator Order Customer SystemConfig Transaction Affiliate; do
  echo "$m registered-by: $(grep -rln "models/$m'" server/ server.js | grep -v administratorController | grep -v 'middleware/auth.js' | wc -l) other file(s)"
done
node -e "
process.env.NODE_ENV='test'; require('./server.js');
const m=require('mongoose');
console.log('models='+m.modelNames().sort().join(','));"
```
  - Expected: each model registered by ≥ 1 other file, then a `models=` list. **Capture this list.** After the
    deletions, re-run the same probe — the two lists must be **identical**. A missing model name means a
    require was load-bearing: restore that one require with the comment
    `// eslint-disable-next-line no-unused-vars -- registers the <X> model; see C17`.

- [ ] **Step 4: Delete the dead requires and locals; re-probe.**
```bash
cd "$AFF" && node -e "
process.env.NODE_ENV='test'; require('./server.js');
console.log('models='+require('mongoose').modelNames().sort().join(','));" | tail -1
lintcount server/ | head -4
```
  - Expected: the **same** `models=` line as Step 3, then `TOTAL 10` (51 − 41) with no `no-unused-vars` line.

- [ ] **Step 5: Controller runs the full suite, then commit.**
```bash
cd "$AFF" && npm test 2>&1 | tail -12
git add -A && git commit -m "refactor(server): remove 41 unused bindings (eslint no-unused-vars)

Plan 3 item 14, batch 4 of 6. 38 were dead require() bindings; 4 unused handler
parameters were renamed to _-prefixed (argsIgnorePattern) rather than deleted,
because dropping a 4th parameter turns an Express error handler into ordinary
middleware. Every model require was checked first: mongoose.modelNames() is
byte-identical before and after, so no deleted require was load-bearing.
server/ errors 51 -> 10.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Rollback (exact):** `git revert --no-edit <batch-4 sha>`, then re-run the Step 3 model probe — it must
print the same `models=` line. Expected lint total after revert: `51`.

---

### C18: ESLint batch 5 — the 10 semantic errors, each with a test written first

The only batch where behaviour can change. **Strict TDD applies per fix**, because three of these rules sit
on regex semantics and one on control flow.

**Files:** the ten semantic-error carriers — one row each, with the fix and why it needs a test:

| Error | File:line | Fix | Why a test is required |
|:--|:--|:--|:--|
| `no-useless-escape` `\[` | `server/utils/passwordValidator.js:54` | drop the backslash | `\[` inside a character class — must prove the class still matches `[` and rejects nothing new |
| `no-useless-escape` `\[` | `server/utils/passwordValidator.js:217` | drop the backslash | same |
| `no-useless-escape` `\'` | `server/services/email/dispatcher/affiliate.js:34` | drop the backslash | string literal — prove the rendered HTML is byte-identical |
| `no-useless-escape` `\'` ×2 | `server/services/email/dispatcher/operator.js:27` | drop both | same |
| `no-prototype-builtins` | `server/utils/fieldFilter.js:15` | `Object.prototype.hasOwnProperty.call(o, k)` | must prove a key named `hasOwnProperty` and a null-prototype object both behave |
| `no-useless-catch` | `server/middleware/auth.js:49` | unwrap the `try`/`catch` that only rethrows | must prove the thrown error still reaches the error handler with the same shape |
| `no-case-declarations` | `server/utils/formatters.js:165` | wrap the case body in a block | must prove the switch still returns the same value for every branch |
| `import/no-dynamic-require` | `server/services/firebasePhoneService.js:38` | **config, not code** — see Step 5 | the rule is not installed; the disable comment is stale |
| `no-prototype-builtins` | web-core `src/middleware/sanitization.js:23` | same as `fieldFilter` | C-R9: the affiliate's copy left via C2's shim; fix the surviving copy |
| `no-useless-escape` | web-core `src/middleware/sanitization.js:95` | same | C-R9 |

**Interfaces:**
- Consumes: `E_SEMANTIC_0`; C2's shim (the sanitization pair now lives in web-core).
- Produces: `server/` errors → **0 except** the `import/no-dynamic-require` line, which C19 closes as config.
- Note the two web-core fixes are a **separate commit in a separate repo** and web-core's own eslintrc has
  both rules `off` (C-R9), so they will not be caught there — they need the test, not the linter.

- [ ] **Step 1: `no-useless-escape` in regexes — pin the current behaviour, then remove the escape.**
```bash
cd "$AFF" && sed -n '50,58p;213,220p' server/utils/passwordValidator.js
```
      Write `tests/unit/passwordValidatorRegex.test.js` **before** editing: for each regex, assert the exact
      accept/reject verdict on a table that includes `[`, `]`, `-`, `^`, `\`, and a normal password.
```bash
cd "$AFF" && npx jest tests/unit/passwordValidatorRegex.test.js 2>&1 | tail -6
```
  - Expected: `Tests: … 0 failed` **before** the edit — this is a characterisation test, so it must be green
    first. Then remove the two escapes and re-run: **still `0 failed`.** A single changed verdict means the
    escape was load-bearing — restore it and add `// eslint-disable-next-line no-useless-escape` with the
    reason.

- [ ] **Step 2: `no-useless-escape` in strings — prove the rendered output is byte-identical.**
```bash
cd "$AFF" && node -e "
const before=require('crypto').createHash('sha256')
  .update(require('fs').readFileSync('server/services/email/dispatcher/operator.js','utf8')).digest('hex');
console.log('file sha (informational) '+before.slice(0,12));"
sed -n '27p' server/services/email/dispatcher/operator.js
sed -n '34p' server/services/email/dispatcher/affiliate.js
```
      Then write the assertion into the existing email dispatcher suite: render the affected template and
      compare the output string to the literal expected text.
  - Expected: after removing the escapes, the rendered string is unchanged. `\'` inside a double-quoted or
    backtick string is always identical to `'` — this is the safest of the ten, but the assertion is cheap
    and makes the claim checkable.

- [ ] **Step 3: `no-prototype-builtins` — the dangerous-looking one.** Write
      `tests/unit/fieldFilterPrototype.test.js` first:
```js
const fieldFilter = require('../../server/utils/fieldFilter');
it('handles an own key literally named hasOwnProperty', () => { /* … */ });
it('handles a null-prototype object', () => { /* Object.create(null) */ });
it('does not treat an inherited key as own', () => { /* { __proto__: { secret: 1 } } */ });
```
```bash
cd "$AFF" && npx jest tests/unit/fieldFilterPrototype.test.js 2>&1 | tail -10
```
  - Expected: **the null-prototype case fails before the fix** with
    `TypeError: o.hasOwnProperty is not a function`. That is the real bug the rule flags — record it. The
    other two may pass. After switching to `Object.prototype.hasOwnProperty.call(o, k)`, all three pass.

- [ ] **Step 4: `no-useless-catch` and `no-case-declarations`.**
```bash
cd "$AFF" && sed -n '44,56p' server/middleware/auth.js; sed -n '160,172p' server/utils/formatters.js
```
      For `auth.js:49`: write a test asserting the middleware passes the original error object (identity, not
      just message) to `next`, run it green, unwrap the `try`/`catch`, re-run green.
      For `formatters.js:165`: write a table test over **every** `switch` branch, green before and after
      wrapping the case body in `{ }`.
```bash
cd "$AFF" && npx jest tests/unit/authMiddleware.test.js tests/unit/formatters.test.js 2>&1 | tail -8
```
  - Expected: `Tests: … 0 failed` both before and after each edit.

- [ ] **Step 5: `import/no-dynamic-require` is NOT a code defect — it is a stale disable comment.**
```bash
cd "$AFF" && sed -n '38p' server/services/firebasePhoneService.js
node -e "try{console.log(require('eslint-plugin-import/package.json').version)}catch(e){console.log('NOT INSTALLED')}"
```
  - Expected: a line reading `// eslint-disable-next-line global-require, import/no-dynamic-require`, then
    `NOT INSTALLED`. ESLint reports `Definition for rule 'import/no-dynamic-require' was not found` because
    the comment names a rule from a plugin this repo does not have — **and `global-require` is likewise not
    configured.**
  - **Decision (record it):** delete the two unknown rule names from the disable comment rather than
    installing `eslint-plugin-import` for one line. Installing a plugin would lint 8,953 more `public/`
    errors' worth of new rules into scope. Keep the explanatory comment above the `require(path)` so the
    intent survives:
```js
// Dynamic require: the service-account path comes from FIREBASE_SERVICE_ACCOUNT_PATH
// at runtime, so it cannot be a static import.
const serviceAccount = require(path);
```
```bash
cd "$AFF" && grep -rn "eslint-disable.*\(global-require\|import/no-dynamic-require\)" server/ | wc -l
lintcount server/ | head -3
```
  - Expected: `0`, then `TOTAL 0`.

- [ ] **Step 6: The web-core pair (separate repo, separate commit).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && sed -n '23p;95p' src/middleware/sanitization.js
```
      Add the same two tests to web-core's own suite (its eslintrc has both rules `off`, so only the tests
      catch a regression), apply both fixes, then:
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | tail -8 && npx eslint src/ && echo "WC_LINT_CLEAN"
```
  - Expected: `Tests: … 0 failed`, then `WC_LINT_CLEAN`. **Do not publish a new web-core version here** —
    slice D owns the release. This commit is staged for it; note that in the commit body.

- [ ] **Step 7: Controller runs both suites, then commit.**
```bash
cd "$AFF" && npm test 2>&1 | tail -12
git add -A && git commit -m "fix(server): the last 10 eslint errors — one was a real bug

Plan 3 item 14, batch 5 of 6. Each fix landed behind a test written first:
- fieldFilter.js:15 no-prototype-builtins was a REAL defect: a null-prototype
  object threw TypeError: o.hasOwnProperty is not a function.
- passwordValidator.js:54,217 \\[ inside a character class: characterisation test
  pins the accept/reject table across [ ] - ^ \\ before and after.
- auth.js:49 useless try/catch unwrapped; the original error object still
  reaches next() by identity.
- formatters.js:165 case body wrapped; table test over every switch branch.
- firebasePhoneService.js:38 was NOT a code defect — the disable comment named
  import/no-dynamic-require and global-require, neither of which is configured
  (eslint-plugin-import is not installed). Stale names removed, intent kept as a
  plain comment; installing the plugin would pull 8,953 public/ errors of new
  rules into scope.
server/ errors 10 -> 0.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Rollback (exact):** `git revert --no-edit <batch-5 sha>` in the affiliate and, separately,
`git revert --no-edit <wc sanitization sha>` in web-core. **Revert web-core only if it has not been
released** — once slice D tags a version containing it, roll forward with a new commit instead.

---

### C19: ESLint batch 6 — the zero gate, a guard test, and the `no-console` alignment

**Files:**
- Modify: `.eslintrc.js` (add a `server/**` override; **HUMAN-CONFIRM**, it is repo-wide config)
- Modify: `package.json` (add `lint:server`)
- Create: `tests/unit/eslintServerClean.test.js`

**Interfaces:**
- Consumes: C18's `TOTAL 0`.
- Produces: **the exit criterion for item 14** — a command whose exact output proves 0, plus a guard that
  fails the suite if anyone reintroduces an error.
- Closes C-R8: the project rule "`console.*` is blocked by ESLint in `server/`" becomes true.

- [ ] **Step 1: The exit criterion — state the exact output.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npx eslint server/; echo "ESLINT_EXIT=$?"
```
  - **Expected, exactly:** no output at all from `npx eslint server/`, followed by `ESLINT_EXIT=0`.
    That is the literal exit criterion for item 14. A non-empty stdout or a non-zero exit fails it.
  - Corroborating form, for the record:
```bash
lintcount server/
```
  - **Expected, exactly:** a single line `TOTAL 0`.

- [ ] **Step 2: Add the npm script so the gate is reproducible by name.**
```bash
cd "$AFF" && node -e "
const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));
p.scripts['lint:server']='eslint server/ server.js';
fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');"
npm run lint:server; echo "EXIT=$?"
```
  - Expected: no output, `EXIT=0`. The script covers `server.js` as well as `server/`, closing the C-R7 gap
    (`server.js:503` was already fixed by C7 — this makes it impossible to reintroduce unnoticed).

- [ ] **Step 3: The guard test.** Create `tests/unit/eslintServerClean.test.js`:
```js
// Plan 3 item 14 exit criterion (owner decision: "fix all 208", not "no increase").
// Runs ESLint programmatically so the gate lives in the suite, not only in CI.
// Measured cost: ~7.3 s for server/ at eslint 8.57.1.
const path = require('path');
const { ESLint } = require('eslint');

describe('affiliate server/ is ESLint-error-free', () => {
  jest.setTimeout(120000);

  it('reports zero errors across server/ and server.js', async () => {
    const cwd = path.join(__dirname, '..', '..');
    const eslint = new ESLint({ cwd });
    const results = await eslint.lintFiles(['server/', 'server.js']);
    const errors = results.flatMap((r) => r.messages
      .filter((m) => m.severity === 2)
      .map((m) => `${r.filePath.replace(cwd + '/', '')}:${m.line} ${m.ruleId || '(fatal)'} — ${m.message}`));
    expect(errors).toEqual([]);
  });
});
```
```bash
cd "$AFF" && npx jest tests/unit/eslintServerClean.test.js 2>&1 | tail -8
```
  - Expected: `Tests: 1 passed, 1 total`.
  - **Prove the guard actually guards**, or it is decoration:
```bash
cd "$AFF" && printf '\nconst _unused_probe = require("path")\n' >> server/utils/validators.js
npx jest tests/unit/eslintServerClean.test.js 2>&1 | tail -12
git checkout -- server/utils/validators.js && npx jest tests/unit/eslintServerClean.test.js 2>&1 | tail -4
```
  - Expected: the injected line makes the test **fail**, listing
    `server/utils/validators.js:<n> semi — Missing semicolon` (and a `no-unused-vars` line), then after the
    checkout it passes again. **Record both outputs** — an unfalsified guard is not a guard.

- [ ] **Step 4: `no-console` alignment — HUMAN-CONFIRM (repo-wide config edit).**
```bash
cd "$AFF" && npx eslint server/ --rule '{"no-console":["error",{"allow":[]}]}' 2>&1 | tail -5; echo "EXIT=$?"
```
  - Expected: no output, `EXIT=0` — `server/` has **0** console statements today, so tightening the rule
    changes no code. (The single existing `process.stderr.write` at `rateLimiting.js:30` is not `console.*`
    and carries its own `eslint-disable`; after C5 it lives in web-core.)
  - Ask: "`.eslintrc.js:16` is `'no-console': ['warn', { allow: ['warn','error'] }]`, but CLAUDE.md says
    `console.*` is blocked in `server/`. `server/` is already console-free — add a `server/**` override
    setting it to `['error', { allow: [] }]` so the rule matches the documented standard?" Record verbatim.
  - On approval add to `.eslintrc.js`:
```js
  overrides: [
    {
      // Project rule: server/ uses the Winston logger only. Measured console-free
      // at the time this override was added (Plan 3 item 14).
      files: ['server/**/*.js', 'server.js'],
      rules: { 'no-console': ['error', { allow: [] }] }
    }
  ]
```
  - On refusal: leave the config alone and record the refusal in C20's escalation list as a known
    divergence between CLAUDE.md and the enforced config.

- [ ] **Step 5: Re-run the gate after the config change and commit.**
```bash
cd "$AFF" && npm run lint:server; echo "EXIT=$?"; lintcount server/; npm test 2>&1 | tail -12
git add -A && git commit -m "chore(lint): server/ is at zero eslint errors, guarded

Plan 3 item 14, batch 6 of 6 — the exit criterion. \`npx eslint server/\` prints
nothing and exits 0 (208 -> 0, owner decision: fix all, not 'no increase').

- npm run lint:server covers server/ AND server.js, closing the gap that
  \`eslint server/\` never linted the app's own entry point.
- tests/unit/eslintServerClean.test.js runs ESLint programmatically (~7 s) so a
  reintroduced error fails the suite. The guard was falsified before being
  trusted: an injected unused require made it red, and reverting made it green.
- no-console tightened to error for server/**, matching the documented project
  rule. server/ was measured console-free first, so no code changed.

Residual, escalated not hidden: 10,692 errors remain outside server/ (public
8953, tests 1007, design-explorer 315, docs 263, scripts 145, tools 6,
init-defaults.js 2). See the Plan 3 closure record.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Rollback (exact):**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git revert --no-edit <batch-6 sha> && \
  npx eslint server/ >/dev/null; echo "EXIT=$?"
```
Expected after revert: `EXIT=0` still — the code is already clean; the revert only removes the guard, the
npm script and the config override. **Reverting this task does not reintroduce the 208.**

---

# GROUP C-3 — Closure

### C20: Close D-2 and D-4 in `tasks/todo.md`; write the single escalation list

The scope brief's exit criteria 3 and 7: **zero** open D-items, every `backlog_*` memory file deleted or
rewritten as a closed record, and **one written list** of everything escalated — "so the backlog is clear
because items were closed or escalated, never because they were forgotten."

**Files:**
- Modify: `tasks/todo.md` — §D-2's six items → `[x]` with the shipping commit shas; §D-4 → `[x]`;
  a "Slice C record" block
- Modify: `tasks/lessons.md` — the patterns below
- Modify: `docs/superpowers/plans/2026-09-13-separation-plan2-content-app.md:9,34` and
  `docs/superpowers/plans/2026-09-09-separation-plan1-foundations.md:9,40,41,147` — every "→ Plan 4" /
  "(Plan 4)" forward-reference now points at a plan that does not exist. Retarget to "Plan 3 slice C".
- Modify: the project memory index entry `deferred_work_scope_cuts_2026-09-11.md` (the admin
  reset-rate-limits double no-op is **fixed**, so the memory must stop describing it as live)

**Interfaces:**
- Consumes: every C-task's commit sha; `$REC`.
- Produces: `C_CLOSED=PASS`; the escalation list that satisfies exit criterion 7.

- [ ] **Step 1: Prove there is nothing left open before writing that there isn't.**
```bash
cd "$AFF" && grep -n '^\s*- \[ \]' tasks/todo.md | sed -n '1,40p'
grep -rn "Plan 4" tasks/todo.md docs/superpowers/plans/*.md docs/superpowers/specs/*.md | grep -v drafts/ | wc -l
```
  - Expected: no unchecked box under `### D-2.` or `### D-4.`, and a `Plan 4` reference count you then drive
    to **0 outside `docs/superpowers/specs/`** (the specs are historical records — retarget the *plans*, and
    add a one-line note to the spec rather than rewriting settled history).

- [ ] **Step 2: Write the D-2 / D-4 closure records** with, for each of the seven items, the commit sha and
      the test that proves it. The reset defect's record must name
      `tests/integration/resetRateLimits.test.js` and state plainly that the old assertion
      `/Reset \d+ rate limit records/` matched `Reset 0`, which is why the suite was green over a no-op.

- [ ] **Step 3: `tasks/lessons.md` — the four patterns worth a rule.**
  1. **An assertion with `\d+` in it can pass on `0`.** When a handler's whole job is to delete something,
     assert a **non-zero** count and assert the target row is gone — never a regex that matches the no-op.
  2. **Two sources for one name diverge.** `codeAttemptLockout` hand-built `ratelimit_${STORE_NAME}` while the
     store computed its own `collectionName`. Read the name from the thing that owns it.
  3. **A getter is not a snapshot.** Destructuring `LIMITER_NAMES` at require time froze a registry that is
     still being filled. Hold the module; read inside the function.
  4. **"Fix the lint" is not one task.** 208 errors were 4 whitespace/token batches (155, mechanically
     provable by `git diff -w`), one deletion batch (41, provable by `mongoose.modelNames()` being
     unchanged), one semantic batch of 10 — **which contained one real defect** (`fieldFilter.js`
     threw on a null-prototype object) and one that was not a code problem at all (a disable comment naming
     an uninstalled plugin's rule). Classify before fixing; the ratio tells you where the risk is.

- [ ] **Step 4: The single escalation list.** Write it into `tasks/todo.md` under a heading
      `## Plan 3 — escalated, not forgotten`, containing exactly:
  1. **10,692 ESLint errors outside affiliate `server/`** — `public` 8953, `tests` 1007,
     `design-explorer` 315, `docs` 263, `scripts` 145, `tools` 6, `init-defaults.js` 2. Owner decision 2
     scoped item 14 to `server/`; `server/` + `server.js` are at 0 and guarded. **Owner decision needed:**
     schedule, or accept as permanent debt with the guard confined to `server/`.
  2. **`server/controllers/administratorController.js` is 716 lines** — over the project's 500-line
     controller limit, pre-existing, untouched by slice C. Needs a split; not in this plan's scope.
  3. **web-core's `.eslintrc.js` switches off `no-trailing-spaces`, `comma-dangle`, `no-useless-escape`
     and `no-prototype-builtins`** so byte-faithful ports stay diffable (C-R9). The affiliate now runs those
     rules as errors; the shared library does not. **Decision needed:** align web-core, or record the
     asymmetry as intentional.
  4. **`ALLOWED_ENV_VARS` still advertises dead subsystems** — `STRIPE_PUBLISHABLE_KEY`,
     `STRIPE_SECRET_KEY` and four `AWS_*` keys for subsystems this app no longer has. C5 removed only the two
     rate-limit knobs. Adjacent to slice E item 21 (dead `.env` keys); fold in there.
  5. **`--drop-orphans` on Oracle ADB** — C10 defaults to print-only because `drop()` on ADB is the
     forbidden operation that caused the 2026-05-25 session incident. **Owner decision needed** before any
     orphaned `ratelimit_*` collection is actually removed.
  6. **The concierge / design-explorer disposition (C-R11)** — `/api/concierge` and the `EXPLORER_TOKEN`
     explorer are served by the affiliate on `rundberglaundry.com`, a host slice A flips to `:3001`.
     Belongs to slice A or B and must be settled before C5. **Carry it forward even if slice A already
     resolved it, with the resolution recorded.**
  7. **LICENSE text and the legal pages** — owner decision 1 flags these to Rick/counsel as a list, never
     edited unilaterally. Slice C adds nothing to that list; it must appear here so the single list is
     genuinely single.

- [ ] **Step 5: Rewrite or delete the memory backlog files this slice closed.**
```bash
ls ~/.claude/projects/-mnt-c-Users-rickh-GitHub-wavemax-affiliate-program/memory/backlog_*.md
```
  - `deferred_work_scope_cuts_2026-09-11.md` — rewrite: D-2 and D-4 are closed; the "VERIFIED double no-op
    in prod" line becomes "**was** a verified double no-op; fixed `<sha>`, regression test
    `tests/integration/resetRateLimits.test.js`". **Leaving it as a live finding is worse than deleting it** —
    a future session would re-investigate a closed bug.
  - `backlog_webcore_next_release_b5.md` — untouched by slice C (it is slice D's).
  - `backlog_webcore_brand_literals_b4.md`, `backlog_marquee_sidebar_b3.md`,
    `backlog_interest_form_i18n.md`, `backlog_register_now_interest_form.md` — untouched here; slices B and D own them.

- [ ] **Step 6: Final verification and commit.**
```bash
cd "$AFF" && grep -c '^\s*- \[ \]' tasks/todo.md
npm run lint:server; echo "EXIT=$?"
npm test 2>&1 | tail -12
rec C_CLOSED PASS
git add -A && git commit -m "docs(plan3): close D-2 and D-4; one escalation list

D-2 (six items) and D-4 (208 -> 0) are shipped, each with its commit and the
test that proves it. Every '-> Plan 4' forward-reference in the Plan 1 and
Plan 2 documents is retargeted to Plan 3 slice C; there is no Plan 4.
Seven items are escalated to the owner in a single list rather than left open.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: the unchecked-box count for §D-2/§D-4 is `0`, `EXIT=0`, `Tests: … 0 failed`.

**Rollback (exact):** `git revert --no-edit <closure sha>` — documentation only, no code effect. The memory
file rewrite is outside the repo; to restore it, `git -C ~/.claude checkout -- projects/.../memory/` if that
directory is versioned, otherwise re-edit by hand from this task's text.

---

## Slice C exit criteria

1. `npx eslint server/` prints **nothing** and exits **0**; `npm run lint:server` likewise (covers `server.js`).
2. `tests/unit/eslintServerClean.test.js` is green **and has been falsified once** (injected error → red).
3. `POST /api/v1/administrators/reset-rate-limits` with a seeded `ratelimit_auth` bucket returns
   `deletedCount ≥ 1` and the document is gone; a collection named `rate_limits` is never created.
4. `tests/integration/resetRateLimits.test.js` green; `grep -c 'rate limit records' tests/` = 0.
5. `scripts/admin/reset-rate-limits.js` exports `{ parseArgs, run }`, supports `--expired`, and connects to
   no database on `require`.
6. `server/middleware/rateLimiting.js` is the policy module; `APP_LIMITER_NAMES` is a getter that contains
   `bag_codes`; `collectionPrefix()` is still `ratelimit_` — **no live counter renamed**.
7. `codeAttemptLockout.js` contains no hand-built collection literal.
8. Zero 5-line shims in `server/`; only the six composition modules plus `csrfTables.js` mention
   `@crhs/web-core`; `diff` finds no affiliate `server/` file identical to a web-core `src/` file.
9. The 12 duplicate suites are deleted; `brand-config.test.js` kept; the suite is green **without**
   `--forceExit` and reports no open handles.
10. `madge --circular server/` returns zero cycles; no `server/` file over 800 lines.
11. `tasks/todo.md` has **zero** open items under §D-2 and §D-4, and exactly one
    `## Plan 3 — escalated, not forgotten` list with the seven entries.
12. No "Plan 4" forward-reference remains in any *plan* document.

## Open questions for the controller

1. **C-R11 — the concierge/explorer disposition.** Slice A flips `rundberglaundry.com`; the explorer and
   `/api/concierge` live there, served by the affiliate. Must be settled before C5. Slice C branches on the
   measured route set so it is correct either way, but the decision is not slice C's.
2. **Does slice B delete the intake routes before C5 runs?** C5 Step 1 detects and branches, but the answer
   determines whether the affiliate keeps two limiters and whether web-core can ever delete its contact
   limiter copies (C-R4).
3. **Is the `import/no-dynamic-require` resolution acceptable?** C18 Step 5 deletes the stale rule names
   rather than installing `eslint-plugin-import`, on the grounds that installing it pulls new rules across
   `public/`'s 8,953 errors. If the owner wants the plugin, C18 changes shape.
4. **`--drop-orphans` on ADB** — print-only by default (C10). Needs an owner decision before it ever drops.
5. **Web-core release coupling.** C18 Step 6 stages two web-core fixes but does not release. If slice D's
   release lands *before* C18, those two fixes slip to the next release — acceptable, but the controller
   should sequence deliberately.
