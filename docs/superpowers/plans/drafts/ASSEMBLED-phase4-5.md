# Plan 3 — ASSEMBLED phases 4 and 5 (tasks 25–35)

Assembled against `SKELETON.md` (ordering, binding) and `ADJUDICATION.md` (15 rulings, binding),
over `plan3-sliceC-plan4-absorbed.md` and `plan3-sliceE-findings.md`, with every
`REVIEW-1-cross-slice.md` / `REVIEW-2-production-safety.md` finding that touches slice C or E **fixed
in the task**, not noted. Task numbers are the skeleton's and are not re-ordered or renumbered.

- **Phase 4 — the absorbed Plan 4:** tasks 25, 26, 27.
- **Phase 5 — findings, closure, escalation:** tasks 28 … 35. **Task 35 is the point of the plan:**
  after it the backlog is empty because every item was closed or escalated, never forgotten.

Everything below marked **[MEASURED]** was re-measured read-only on **2026-09-21** against the working
trees, both boxes (oci1 `161.153.71.201`, oci2 `144.24.4.202`), the mail host and the GitHub API.
Nothing was changed anywhere.

---

## 0. What re-measurement changed in the source slices

| # | Slice said | **[MEASURED] 2026-09-21** | Consequence |
|:--|:--|:--|:--|
| 1 | E1: portal `.env` = 85 keys + 26 PEM body lines; `DOCUSIGN_PRIVATE_KEY` live | **70 keys, 152 lines, 0 non-key/non-comment lines, 0 `DOCUSIGN_*`, 0 `PRIVATE KEY`** on **both** boxes | the DocuSign purge has **already happened**. Task 29 starts from a post-purge baseline and its arithmetic is derived, never pinned (R-11) |
| 2 | E3/E4 rollback: restore `/var/www/wavemax/env-backups/.env.<TS>` | the only files in `env-backups/` on **both** boxes are `env.bak.mediator.20260824` and `env.bak.phase1.20260824`, and **each contains 2 `PRIVATE KEY` lines and 10 `DOCUSIGN_*` keys** (mode 600; dir mode 775) | a naive "restore the newest backup" **re-plants the 27-line RSA key**. Task 29's rollback refuses any backup containing `PRIVATE KEY`, and quarantines the two pre-purge files |
| 3 | E7: ofelia `RestartCount=6`, 3 `task=ofelia` kernel events | **`RestartCount=25`**, `OOMKilled=false`, `exit=0`, `mem=268435456`, `202.8MiB/256MiB` at 122 min uptime, **`dmesg \| grep -c task=ofelia` = 1** (ring buffer rotated), `free -m` available **2131 MiB** | the kill loop is live and accelerating in aggregate (6 → 25 restarts in ~25 h), but the **kernel log is volatile**. Task 31 gates on the monotone `RestartCount` delta, not on a dmesg count that rotates away |
| 4 | E2: `FRONTEND_URL` makes password reset a cutover blocker | `:3001` with `Host: rundberglaundry.com` on `/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate` → **`301` → `https://portal.atxwashdryfold.com/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate`**, token **byte-identical** | slice A was right, slice E wrong. **Task 28 is an improvement, not a gate.** No task in this plan gates on it |
| 5 | C4: "`SystemHealthError` may hardcode a status — extend it" | `server/services/systemHealthService.js:41` is already `constructor(code, message, status = 500)` and `administratorController.js:709` already returns `err.status` | the 400 needs **no** class change. One less edit |
| 6 | C: `server/` = 208 | `npx eslint server/ server.js` = **209** (`server/` 208 + `server.js` 1), 0 warnings, 34 files; repo-wide **10,900 / 669 warnings** (`public` 8953 · `tests` 1007 · `design-explorer` 315 · `docs` 263 · `server` 208 · `scripts` 145 · `tools` 6 · `init-defaults.js` 2 · `server.js` 1) | the owner's scope (`server/` + `server.js` = 0) is **209 errors**, not 208. Task 26 re-measures and derives every batch total |
| 7 | E1: 26 removable keys | post-purge the classifier returns **10 `DEAD` + 1 `NO-RUNTIME` = 11**, plus `FRONTEND_URL` (task 28 frees it), `EXPLORER_TOKEN`/`ANTHROPIC_API_KEY` (task 17 frees them) and the display-only knobs task 25 frees | task 29's removal set is **computed from the classifier at execution time**; no literal list is trusted |
| 8 | E10: `git ls-tree -r` → "7 tracked paths … the count is 6" | the GitHub tree API returns **7 entries (6 blobs + 1 tree)**; `git ls-tree -r --name-only HEAD` returns **6** | P31 fixed: one unambiguous number (**6**) |
| 9 | E9: nodemailer folds CR/LF | `crhs-corporate` has **nodemailer 8.0.11** installed; both subjects are interpolated at `server/services/partnerInquiryService.js:17` and `affiliateApplicationService.js:15`; `firstName`/`lastName` chains are `.isString().trim().isLength({min:1,max:50})` in **both** routers | confirmed LOW severity — defence-in-depth **plus a pin** |
| 10 | — | `crhs-transfer` still exists (private, `pushed_at 2026-09-17T13:44:51Z`, forks 0, issues 0, 67 KB); all six `dc_private` counterparts exist at the sizes slice E measured (letter **39404** vs 38839, PART1 **13115** vs 12460, four exact) | 2 differ + `README.md` unique = **3 unmatched**, exactly as ruled |

---

## 1. Conventions — they apply to every task below

**C-1. Assert the artefact, not the bookkeeping.** Every `Interfaces: Consumes` row is proved by a
command in the consuming task whose failure **halts the task** (R-1). Where the dependency has a
physical artefact (an installed package, a deleted file, a route, a `.env` key, a commit) the
assertion reads **that artefact**, never a record variable — this is immune to the `PASS` vs `yes`
vocabulary split (X5) and to a record written by a task that silently failed (P7). The record file is
used only for facts with no artefact: human sign-offs, snapshot timestamps, and measured baselines.

**C-2. One record, one vocabulary.** `/var/www/wavemax/cutover-logs/plan3-record.env`, booleans are
**`yes`** (slice A's vocabulary, already on disk). Helpers, defined once per shell:
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; touch "$REC"
set -a; . "$REC"; set +a
rec()     { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
req()     { local v="${!1-}"; [ -n "$v" ] || { echo "STOP: $1 unset in $REC"; return 1; }; echo "$1=$v"; }
req_yes() { local v="${!1-}"; [ "$v" = yes ] || { echo "STOP: $1='$v' (want 'yes')"; return 1; }; echo "$1=yes"; }
```
**Record keys are legal shell identifiers** (R-4): host segments are slugged (`atxwashdryfold_com`),
box segments are `oci1`/`oci2`. Every indirect expansion is followed by a `test -n` guard.

**C-3. Probes.** Every on-box probe to `:3000` carries `-H "X-Forwarded-Proto: https"` (without it
`/health` returns **302** and `embed-app-v2.html` returns an empty body). A `:3001` probe must **not**
carry it — `:3001` does not redirect (R-5).

**C-4. Never `$?` after a pipe** — it is `tail`'s status, always `0`. Use `${PIPESTATUS[0]}` or do not
pipe (R-6). This is the fix for slice C's `AFF_EXIT=$?` and its `EXIT=$?` after `eslint … | tail -5`.

**C-5. A flag is not honoured until grepped for** (R-6). `scripts/ensure-indexes.js` reads
`process.argv` **zero** times [MEASURED] and has no dry-run concept — it `dotenv.config()`s and calls
`createIndexes` on seven models against whatever `MONGODB_URI` the local `.env` names, i.e. the
production ADB. **No task in phases 4–5 invokes `scripts/ensure-indexes.js`**; task 35 asserts that
mechanically, and the defect ships as an ESCALATIONS row with its exact fix. Where a task in this
range introduces a flag (task 25's `--dry-run`), the flag is implemented, grepped for **and**
behaviourally falsified before it is trusted.

**C-6. Verify and act are different steps.** A verification that shares a block with the action it
guards is not a gate (P4, P6). Every box-touching task has a read-only verify step that must print its
expected value **before** a separate step reloads anything.

**C-7. One box degraded at a time.** Any step that stops or reloads an app writes `BOX_BUSY=<box>`
into the record before and clears it after, and asserts it empty first (X32). Box 2 never starts until
box 1 has printed every expected value.

**C-8. Restore under `trap … EXIT`.** Any task that stops a service arms
`trap 'pm2 start <app> >/dev/null 2>&1 || true' EXIT INT TERM` in the same remote shell (R-3).

**C-9. Mail host.** `docker compose logs --since` returns **nothing** on `wavemax-promo` — use
`docker logs --tail N`. Access is `sudo ssh wavemax-promo`.

**C-10. Production `.env` edits are HUMAN-CONFIRM** and require `pm2 reload <app> --update-env`: both
apps read `.env` only at boot. `restart_time` is asserted as **before+1**, never as a literal (P25).

**C-11. R-9 — every replaced assertion is falsified once.** Break it deliberately, see it fail,
restore, and record both outputs. An unfalsified guard is decoration.

**C-12. No foreground `sleep` over ~60 s** (harness rule). Long waits are a recorded timestamp plus a
separate step, or a `Monitor` until-loop.

**C-13. Repo paths.** `/mnt/c/Users/rickh/GitHub/{wavemax-affiliate-program,crhs-corporate,crhs-web-core,dc_private}`.
`AFF`, `CORP`, `WC`, `DCP` are used for these throughout. Never `~/GitHub/...` (P18).

---

# PHASE 4 — the absorbed Plan 4 (there is no Plan 4)

> ⚠️ **Scope note the controller must read.** The skeleton absorbs **PR B7** (task 25) and the ESLint
> work (tasks 26–27) from slice C. It does **not** absorb the rest of the adoption series — slice C's
> C2, C3, C6–C11 (**PRs B5, B6, B8, B9, B10, B11, B13, B14**: the module shims, `SystemConfig`
> registration, session adoption, email wrappers, CORS adoption, shared-DB ownership and the shim
> terminus). No other phase covers them. They are **not silently dropped**: task 35 carries them as a
> single owner-owned ESCALATIONS row with the spec reference, and the Plan 1 / Plan 2 "→ Plan 4"
> banners say exactly which parts landed and which did not.

---

### Task 25: PR B7 — rate-limit adoption, and the verified double no-op, with an assertion that fails on zero

**Files:**
- Modify: `server/services/systemHealthService.js` (the `resetRateLimits` body at `:90-112`; and
  `ALLOWED_ENV_VARS` at `:12-37` — drop `RATE_LIMIT_WINDOW_MS`, `AUTH_RATE_LIMIT_MAX`,
  `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`,
  `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` — closing X31; **leave `FRONTEND_URL`, it is task 28's**)
- Modify: `server/routes/administratorRoutes.js` — delete the inline handler at `:197-237`, route to
  `administratorController.resetRateLimits`
- Modify: `server/middleware/rateLimiting.js` (356 → ~95 lines; becomes the **policy module**, permanent)
- Modify: `server/middleware/rateLimitMongoStore.js` (134 → 5-line shim)
- Modify: `server/services/codeAttemptLockout.js` (`:19`, `:48-50`; export `storeCollectionName`)
- Rewrite: `scripts/admin/reset-rate-limits.js` (exports `{ parseArgs, run }`, adds `--expired` and
  `--dry-run`, CLI behind `require.main === module`)
- Modify: `tests/integration/administratorRoutes.test.js:44,57`
- Create: `tests/integration/resetRateLimits.test.js`, `tests/unit/rateLimitPolicy.test.js`,
  `tests/unit/codeAttemptLockoutPrefix.test.js`, `tests/unit/resetRateLimitsScript.test.js`
- Delete (**only after** Step 8's port check): `tests/unit/rateLimitMongoStore.test.js` (95),
  `tests/unit/rateLimitKeyGen.test.js` (75), `tests/unit/rateLimitingMiddleware.test.js` (451),
  `tests/unit/simpleRouteHandlers.test.js` (the throwaway copy of the handler this task deletes)
- Modify (**HUMAN-CONFIRM**): `.env.example` — remove `RATE_LIMIT_WINDOW_MS`, `AUTH_RATE_LIMIT_MAX`

**Interfaces:**
- Consumes — each row asserted in Step 0 by a command that halts the task:
  1. **Task 24** — `@crhs/web-core` v0.3.0 installed in the affiliate, exporting
     `resetBuckets`, `sweepExpired`, `collectionPrefix`, `collectionNameFor`, `createCustomLimiter`
     and a **live** `LIMITER_NAMES` getter, and `csrf.createCsrf` a function (the ⛔ bidirectional
     boot-breaker premise: new-core + old-app and new-app + old-core each kill the portal).
  2. **Phase 1** — all six flip tasks green (owner decision 2: this series runs only *after* the flips
     are verified, never mixed into a cutover commit).
  3. **Task 17** — whether the explorer and `/api/concierge` still exist decides whether
     `conciergeLimiter` survives; measured, branched, recorded (C-R11 is thereby settled by
     measurement, not carried forward as a question — X27).
  4. **Tasks 16/19** — whether the intake routes still import the contact limiters; measured and
     branched. **Boot-safety invariant:** if any `server/routes/*` still imports
     `contactFormBurstLimiter`, then `wc.rateLimiting.contactFormBurstLimiter` **must** be a function,
     or the app does not boot (`Route.post() requires a callback function`, at require time).
- Produces:
  - `systemHealthService.resetRateLimits({type, ip, user, req})` →
    `{ deletedCount: <sum>, collections: [{collection, deletedCount}] }`; `400` on an unknown limiter;
    response message `Reset N rate limit entries` (the controller's existing wording at `:705`).
  - `server/middleware/rateLimiting.js` exporting the live limiters, `createCustomLimiter`,
    `_keyGenerators` and `APP_LIMITER_NAMES` **as a getter, never a snapshot**.
  - `scripts/admin/reset-rate-limits.js` with `{ parseArgs, run }`, `--expired`, `--dry-run`, and **no
    database connection on `require`**.
  - Record: `RL_BASE_SHA`, `RL_CONCIERGE_LIVE`, `RL_INTAKE_LIVE`, `RL_DONE=yes`.
- Closes: `tasks/todo.md` §D-2, all six items (task 35 records the closure).

**Rollback (exact).**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
cd "$AFF" && git revert --no-edit <task-25 sha> && npm test 2>&1 | tail -6
node -e "const s=require('fs').readFileSync('server/services/systemHealthService.js','utf8');
console.log('reverted_to_no_op='+/collection\('rate_limits'\)/.test(s))"
```
- Rollback expected: the revert commit line, the suite at its recorded baseline, then
  `reverted_to_no_op=true`.
- The revert **restores the no-op**. Until it is re-applied, an admin clears a jammed bucket by hand:
  `db.getCollection('ratelimit_auth').deleteMany({_id: /<ip>/})`.
- If the revert is taken **after task 30 deployed** (task 30's `git pull` is what carries tasks 25–29
  to the boxes), also `git pull --ff-only && pm2 reload wavemax` on each box, one at a time, C-7.

- [ ] **Step 0: Assert every Consumes row. Any failure halts the task.**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; cd "$AFF"
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
req_yes() { local v="${!1-}"; [ "$v" = yes ] || { echo "STOP: $1='$v' (want 'yes')"; return 1; }; echo "$1=yes"; }

# 1. web-core v0.3.0 and its API surface (task 24)
node -e '
const v = require("@crhs/web-core/package.json").version;
const wc = require("@crhs/web-core");
const rl = wc.rateLimiting;
const need = ["resetBuckets","sweepExpired","collectionPrefix","collectionNameFor","createCustomLimiter"];
const missing = need.filter((k) => typeof rl[k] !== "function");
const d = Object.getOwnPropertyDescriptor(rl, "LIMITER_NAMES");
const isGetter = !!(d && typeof d.get === "function");
const csrfOk = typeof wc.csrf.createCsrf === "function";
console.log(`wc=${v} missing=${missing.join(",")||"none"} limiter_names_getter=${isGetter} createCsrf=${csrfOk}`);
const [maj, min] = v.split(".").map(Number);
const newEnough = maj > 0 || (maj === 0 && min >= 3);
process.exit(newEnough && !missing.length && isGetter && csrfOk ? 0 : 1)'
echo "WC_EXIT=$?"

# 2. phase 1 — all three hosts flipped on both boxes
req_yes ALL_HOSTS_FLIPPED
grep -c '^HOST_DONE_[a-z0-9_]*=yes$' "$REC"

# 3/4. what is still mounted (branches recorded, not assumed)
echo "concierge=$(grep -c 'conciergeLimiter' server.js) intake=$(grep -c 'partnerInquiryRoutes\|affiliateApplicationRoutes' server.js)"
echo "contact_importers=$(grep -rl 'contactFormBurstLimiter' server/routes/ 2>/dev/null | wc -l)"
node -e '
const fs=require("fs"), cp=require("child_process");
const importers = cp.execSync("grep -rl contactFormBurstLimiter server/routes/ || true").toString().trim();
const core = require("@crhs/web-core").rateLimiting;
const coreHas = typeof core.contactFormBurstLimiter === "function" && typeof core.contactFormLimiter === "function";
console.log(`importers=${importers ? importers.split("\n").length : 0} core_exports_contact=${coreHas}`);
if (importers && !coreHas) { console.log("BOOT_HAZARD: routes import contact limiters that core no longer exports — the policy module MUST re-create them (copy-before-delete)"); }
'
git status --porcelain | wc -l; git log -1 --format='%H %s'
```
  - Expected: `wc=0.3.x missing=none limiter_names_getter=true createCsrf=true`, `WC_EXIT=0`;
    `ALL_HOSTS_FLIPPED=yes` and `3`; then the branch line
    (today `concierge=2 intake=2`, `contact_importers=2`, `importers=2 core_exports_contact=true`);
    then `0` modified files and one `<sha> <subject>` line.
  - `WC_EXIT=1`, a `STOP:` line, a `HOST_DONE` count other than `3`, or a non-zero `git status` count —
    **STOP**. `BOOT_HAZARD` is not a stop: it selects the Step 6 branch, and it is recorded.
```bash
rec RL_BASE_SHA "$(git rev-parse HEAD)"
rec RL_CONCIERGE_LIVE "$(grep -c 'conciergeLimiter' server.js)"
rec RL_INTAKE_LIVE "$(grep -rl 'contactFormBurstLimiter' server/routes/ 2>/dev/null | wc -l)"
```

- [ ] **Step 1: Falsify the old assertion and its replacement, before writing either (R-9, C-11).**
```bash
node -e "const old=/Reset \d+ rate limit records/, neu=/^Reset [1-9][0-9]* rate limit entries\$/;
console.log('old_matches_zero='+old.test('Reset 0 rate limit records'));
console.log('new_matches_zero='+neu.test('Reset 0 rate limit entries'));
console.log('new_matches_one='+neu.test('Reset 1 rate limit entries'));
console.log('new_matches_ten='+neu.test('Reset 10 rate limit entries'));"
```
  - Expected, exactly four lines: `old_matches_zero=true`, `new_matches_zero=false`,
    `new_matches_one=true`, `new_matches_ten=true`. [MEASURED — this is the run, verbatim.]
  - **This is the defect in one line.** `\d+` matches `0`, so
    `tests/integration/administratorRoutes.test.js:44,57` stayed green over a total no-op for the life
    of the handler. The replacement cannot match a no-op. Paste this output into the PR body.

- [ ] **Step 2: RED — the regression suite, with a count assertion that fails on zero.**
      Create `tests/integration/resetRateLimits.test.js`:
```js
// Plan 3 task 25 (todo §D-2, spec §7.6.3). The admin reset targeted a collection
// named `rate_limits` that the store never writes; the store writes
// `ratelimit_<name>` keyed on `_id` (rateLimitMongoStore.js:36,85). The old
// assertion /Reset \d+ rate limit records/ matched "Reset 0", so the suite was
// green over a total no-op. Every assertion below fails on a no-op.
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const Administrator = require('../../server/models/Administrator');
const { createTestToken } = require('../helpers/authHelper');
const { getCsrfToken } = require('../helpers/csrfHelper');

const FUTURE = () => new Date(Date.now() + 15 * 60 * 1000);
const NONZERO = /^Reset [1-9][0-9]* rate limit entries$/;

describe('POST /api/v1/administrators/reset-rate-limits clears real buckets', () => {
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
    for (const c of ['ratelimit_auth', 'ratelimit_register']) {
      await mongoose.connection.collection(c).deleteMany({});
    }
    await mongoose.connection.collection('ratelimit_auth')
      .insertOne({ _id: '203.0.113.7', hits: 9, _expiresAt: FUTURE() });
    await mongoose.connection.collection('ratelimit_register')
      .insertOne({ _id: '203.0.113.7', hits: 4, _expiresAt: FUTURE() });
  });

  const post = (body) => agent.post('/api/v1/administrators/reset-rate-limits')
    .set('Authorization', `Bearer ${adminToken}`).set('x-csrf-token', csrfToken).send(body);

  it('deletes a seeded bucket across every limiter and says a NON-ZERO number', async () => {
    const res = await post({ ip: '203.0.113.7' });
    expect(res.status).toBe(200);
    expect(res.body.deletedCount).toBeGreaterThan(0);          // fails on the no-op
    expect(res.body.message).toMatch(NONZERO);                 // cannot match "Reset 0"
    expect(await mongoose.connection.collection('ratelimit_auth')
      .countDocuments({ _id: '203.0.113.7' })).toBe(0);        // state, not just the message
    expect(await mongoose.connection.collection('ratelimit_register')
      .countDocuments({ _id: '203.0.113.7' })).toBe(0);
  });

  it('a type filter clears that limiter and leaves the others alone', async () => {
    const res = await post({ type: 'auth' });
    expect(res.status).toBe(200);
    expect(res.body.deletedCount).toBe(1);
    expect(await mongoose.connection.collection('ratelimit_auth').countDocuments({})).toBe(0);
    expect(await mongoose.connection.collection('ratelimit_register').countDocuments({})).toBe(1);
  });

  it('never creates a collection named rate_limits', async () => {
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

  it('no test in this repo asserts the no-op regex any more', () => {
    const { execSync } = require('child_process');
    const hits = execSync("grep -rl 'rate limit records' tests/ || true",
      { cwd: require('path').join(__dirname, '..', '..') }).toString().trim();
    expect(hits).toBe('');
  });
});
```
```bash
cd "$AFF" && npx jest tests/integration/resetRateLimits.test.js 2>&1 | tail -40
```
  - Expected: `Tests: 7 failed, 7 total`, with these reasons — each is the defect, not a harness fault:
    1. `expect(received).toBeGreaterThan(expected) // Received: 0` and both seeded docs still present;
    2. `Expected: 1, Received: 0`, `ratelimit_auth` still `1`;
    3. `expect(received).not.toContain('rate_limits')` — `deleteMany` **creates** the collection;
    4. `Expected: 400, Received: 200`;
    5. may already pass (`systemHealthService.js:98` escapes the full class) — **record which**;
    6. `expect(received).toBe(true) // Received: undefined` — no `collections` in the response;
    7. names `tests/integration/administratorRoutes.test.js`.
  - **Do not proceed until those reasons are observed.** Anything passing that should not — STOP; the
    test is not reaching the real handler.

- [ ] **Step 3: Rewrite the service onto the real buckets.** Replace
      `server/services/systemHealthService.js:90-112`:
```js
const rateLimiting = require('../middleware/rateLimiting');   // module held, never destructured
const wcRateLimiting = require('@crhs/web-core').rateLimiting;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');   // carried forward from :98

async function resetRateLimits({ type, ip, user, req }) {
  const db = mongoose.connection.db;
  if (!db) {
    logger.error('Database connection not available');
    throw new SystemHealthError('db_unavailable', 'Database connection not available');
  }
  const all = rateLimiting.APP_LIMITER_NAMES;              // read INSIDE the function: it is a getter
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
  - `SystemHealthError` already takes a status: `constructor(code, message, status = 500)` at `:41`,
    and `administratorController.js:709` already returns `err.status`. **No class change is needed**
    (this corrects slice C's instruction to extend it). [MEASURED]
  - The audit payload keeps its existing shape `{ type, ip, deletedCount }` — spec §7.6.3 requires it.

- [ ] **Step 4: Delete the inline handler; route to the controller; fix the two stale assertions.**
      In `server/routes/administratorRoutes.js` replace `:197-237` with exactly:
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
cd "$AFF"
sed -i 's|/Reset \\d+ rate limit records/|/^Reset [1-9][0-9]* rate limit entries$/|g' tests/integration/administratorRoutes.test.js
grep -c 'rate limit records' tests/integration/administratorRoutes.test.js
grep -rc 'rate_limits' server/routes/administratorRoutes.js server/services/systemHealthService.js
grep -n 'resetRateLimits' server/routes/administratorRoutes.js
```
  - Expected: `0`; then `server/routes/administratorRoutes.js:0` and
    `server/services/systemHealthService.js:0`; then one line wiring the route to
    `administratorController.resetRateLimits`.
  - There are **exactly two** occurrences in that test file (`:44`, `:57`) [MEASURED].

- [ ] **Step 5: RED — the policy, lockout and script suites.**
  - `tests/unit/rateLimitPolicy.test.js` asserts: the live limiters **are** core's objects
    (`toBe`); the three dead limiters (`emailVerificationLimiter`, `fileUploadLimiter`,
    `adminOperationLimiter`) are `undefined`; `APP_LIMITER_NAMES` is a **getter** that sees
    `bag_codes` registered *after* the module loaded; `APP_LIMITER_NAMES` ⊇ every name the loaded
    routes register; `wc.rateLimiting.collectionNameFor('auth') === 'ratelimit_auth'`; and — only in
    the `intake=0` branch — no route imports the contact limiters.
  - `tests/unit/codeAttemptLockoutPrefix.test.js` asserts `lockout.storeCollectionName()` honours
    `RATE_LIMIT_COLLECTION_PREFIX` and that the source contains no hand-built `` `ratelimit_${ `` literal.
  - `tests/unit/resetRateLimitsScript.test.js` asserts `parseArgs` handles `--type/--ip/--expired/
    --dry-run/--yes`, throws `Unknown rate limiter` on a bad name, and that `run()` routes `--expired`
    to `sweepExpired`, the default to `resetBuckets`, and **`--dry-run` to neither**.
```bash
cd "$AFF" && npx jest tests/unit/rateLimitPolicy.test.js tests/unit/codeAttemptLockoutPrefix.test.js \
  tests/unit/resetRateLimitsScript.test.js 2>&1 | tail -25
```
  - Expected: all three suites red, with these reasons — policy: `Object.is equality` (the local
    `rateLimit()` objects are not core's) and `APP_LIMITER_NAMES` `undefined`; lockout:
    `lockout.storeCollectionName is not a function` and the source still matching `` `ratelimit_${ ``;
    script: `parseArgs is not a function` / `Cannot destructure property 'run'`.
  - ⚠️ Requiring the script **today connects to MongoDB** (it calls `resetRateLimits()` at module
    scope, `:126`). That is itself part of what this task fixes — note it in the PR body.

- [ ] **Step 6: Implement all five changes in one commit.**
  - `server/middleware/rateLimiting.js` → the policy module: keep the existing header comment about
    `NODE_ENV=test` / `RELAX_RATE_LIMITING`, re-export core's live limiters by name, re-export
    `createCustomLimiter` and `_keyGenerators`, and define
```js
Object.defineProperty(module.exports, 'APP_LIMITER_NAMES', {
  enumerable: true,
  get: () => wc.rateLimiting.LIMITER_NAMES      // live getter over a live getter, never a snapshot
});
```
  - **Branch A — `intake > 0` and core still exports the contact pair** (today's state): bind them,
    and keep the copy-before-delete comment block verbatim.
  - **Branch B — `intake > 0` and `core_exports_contact=false`** (task 24 deleted them): the policy
    module **re-creates** both with the parameters copied verbatim [MEASURED at web-core
    `src/middleware/rateLimiting.js:214-256`] — burst `windowMs: 30*1000`, `max: isRelaxed ? 30 : 1`,
    store name `contact_burst`; hourly `windowMs: 60*60*1000`, `max: isRelaxed ? 50 : 5`, store name
    `contact_hourly`; both `keyGenerator: keyGenerators.ip` — via `createCustomLimiter`. This is the
    copy-before-delete rule being honoured, not re-derivation.
  - **Branch C — `intake = 0`:** omit both; `contact_burst`/`contact_hourly` leave `APP_LIMITER_NAMES`
    and their collections become orphans (listed, never dropped — ADB rule).
  - `concierge = 0` → omit `conciergeLimiter` and `concierge`; `concierge > 0` → keep.
  - `server/middleware/rateLimitMongoStore.js` → the 5-line shim over `wc.rateLimitMongoStore`.
  - `server/services/codeAttemptLockout.js` — `:19` requires the shim; `:48-50` becomes
    `mongoose.connection.collection(getStore().collectionName).findOne({ _id: key })`; export
    `storeCollectionName = () => getStore().collectionName`.
  - `scripts/admin/reset-rate-limits.js` — `module.exports = { parseArgs, run }`, CLI behind
    `require.main === module`, `--expired` → `sweepExpired`, default → `resetBuckets`, **`--dry-run`
    → count only, write nothing**, `--yes` to skip the pause, help text listing the real limiter names.
  - `server/services/systemHealthService.js` `ALLOWED_ENV_VARS` — delete `RATE_LIMIT_WINDOW_MS`,
    `AUTH_RATE_LIMIT_MAX` (no limiter reads either; rendered to admins as if live) and the six dead
    third-party rows `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `AWS_S3_BUCKET`,
    `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (X31 — subsystems this app no longer
    has). **Keep `RATE_LIMIT_MAX_REQUESTS`** (live: `apiLimiter` max). **Keep `FRONTEND_URL`** — task
    28 owns it, and removing it here would make task 28's guard green before it is written (X30).

- [ ] **Step 7: Prove `--dry-run` is honoured — grep, then behaviour (C-5).**
```bash
cd "$AFF"
grep -c 'process.argv' scripts/admin/reset-rate-limits.js
grep -c -- "--dry-run" scripts/admin/reset-rate-limits.js
grep -c 'require.main === module' scripts/admin/reset-rate-limits.js
npx jest tests/unit/resetRateLimitsScript.test.js -t 'dry-run' 2>&1 | tail -6
```
  - Expected: a **non-zero** `process.argv` count, a non-zero `--dry-run` count, `1` for the
    `require.main` gate, then `Tests: 1 passed`.
  - A `0` on any of the first three — the flag is not honoured; **STOP**. This is the
    `ensure-indexes.js --dry-run` class of defect (C-5) and it is not allowed to recur here.
  - The behavioural half is the test, not the grep: `run({ dryRun: true, yes: true }, …)` must call
    **neither** `resetBuckets` nor `sweepExpired`, and the assertion must have been seen failing in
    Step 5.

- [ ] **Step 8: Confirm web-core carries the ported blocks BEFORE deleting 621 lines of tests.**
```bash
WC=/mnt/c/Users/rickh/GitHub/crhs-web-core
grep -c "createMongoStore\|createCustomLimiter\|RELAX_RATE_LIMITING\|LIMITER_NAMES\|sweepExpired\|resetBuckets" \
  "$WC/tests/middleware/rateLimiting.test.js" 2>/dev/null || ls "$WC/tests/middleware/"
```
  - Expected: a count **≥ 6** in web-core's own suite (spec §7.4 names the blocks that had to move:
    `createMongoStore`, `createCustomLimiter`, the keyGenerator wiring, the `RELAX_RATE_LIMITING`
    production guard and the 10× rule).
  - **If any block is missing, do not delete the affiliate suites.** Port it to web-core first in its
    own commit, then return. Deleting unported coverage is the one irreversible mistake in this task.

- [ ] **Step 9: Prove no live counter is renamed — the highest-risk assertion here.**
```bash
cd "$AFF" && node -e "
process.env.NODE_ENV='test'; delete process.env.RATE_LIMIT_COLLECTION_PREFIX;
const p=require('./server/middleware/rateLimiting');
require('./server/routes/authRoutes'); require('./server/routes/bagRoutes');
require('./server/routes/customerRoutes'); require('./server/routes/scanRoutes');
require('./server/services/codeAttemptLockout');
const wc=require('@crhs/web-core');
const prefix=wc.rateLimiting.collectionPrefix();
console.log('prefix='+prefix);
console.log('names='+p.APP_LIMITER_NAMES.slice().sort().join(','));
process.exit(prefix==='ratelimit_' ? 0 : 1)"
echo "PREFIX_EXIT=$?"
```
  - Expected: `prefix=ratelimit_`, a `names=` line containing at least
    `admin_login,api,auth,bag-resolve,bag_codes,claim-resolve,email-verify,pwreset,register,scan_actions,sensitive`,
    then `PREFIX_EXIT=0`.
  - **Any change to `prefix` orphans every live counter in production.** `PREFIX_EXIT=1` — STOP.

- [ ] **Step 10: Green, then cull.**
```bash
cd "$AFF" && npx jest tests/integration/resetRateLimits.test.js tests/integration/administratorRoutes.test.js \
  tests/unit/rateLimitPolicy.test.js tests/unit/codeAttemptLockoutPrefix.test.js \
  tests/unit/resetRateLimitsScript.test.js tests/unit/administratorControllerRateLimits.test.js 2>&1 | tail -12
git rm -q tests/unit/rateLimitMongoStore.test.js tests/unit/rateLimitKeyGen.test.js \
  tests/unit/rateLimitingMiddleware.test.js tests/unit/simpleRouteHandlers.test.js
npx madge --circular server/ 2>&1 | tail -2
```
  - Expected: `Tests: … 0 failed` across the six suites, then `✔ No circular dependency found!`.
  - `tests/unit/administratorControllerRateLimits.test.js` mocks the service — if it pins the old
    `{ deletedCount }`-only shape, update it to `{ deletedCount, collections }` **in this commit**
    (`grep -n 'deletedCount\|collections' tests/unit/administratorControllerRateLimits.test.js`).

- [ ] **Step 11 (HUMAN-CONFIRM): `.env.example`.** Project rule — production config edits confirm first.
  - Ask: "`RATE_LIMIT_WINDOW_MS` and `AUTH_RATE_LIMIT_MAX` are read by no limiter — only by the admin
    env-viewer allowlist, which this task trims. Remove both from `.env.example`?" Record verbatim.
  - On approval remove the two lines; leave `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_COLLECTION_PREFIX`
    and `RATE_LIMIT_TTL_INDEX` exactly as they are (`.env.example:128-138`).

- [ ] **Step 12: Full suite, then commit.**
```bash
cd "$AFF" && npm test 2>&1 | tail -15
git add -A && git commit -m "fix(admin): reset-rate-limits was a double no-op — wrong collection, wrong key

The store writes ratelimit_<name> keyed on _id (rateLimitMongoStore.js:36,85).
All three reset paths deleted from a collection named rate_limits that nobody
writes, filtering a 'key' field that does not exist, so the endpoint returned
success with deletedCount 0 and an admin could not clear a jammed bucket.

- systemHealthService.resetRateLimits fans out over APP_LIMITER_NAMES via
  web-core resetBuckets({ names, idPattern }); IP metacharacters stay escaped
  (carried forward from :98); an unknown limiter name is a 400.
- administratorRoutes.js:197-237 inline handler deleted; the route now reaches
  administratorController.resetRateLimits, which was defined and unwired.
- rateLimiting.js becomes the app policy module over web-core's limiters;
  APP_LIMITER_NAMES is a GETTER — codeAttemptLockout registers bag_codes after
  this module loads. rateLimitMongoStore.js becomes a shim. The three dead
  limiters (email_verify, upload, admin_op) are gone: zero consumers.
- codeAttemptLockout.js:49 stops hand-building \`ratelimit_\${STORE_NAME}\`.
- scripts/admin/reset-rate-limits.js rewritten onto the real buckets, exports
  { parseArgs, run }, adds --expired and --dry-run, and no longer connects to
  Mongo on require. --dry-run is grepped for AND behaviourally tested.
- ALLOWED_ENV_VARS drops two dead rate-limit knobs and six dead third-party
  rows (STRIPE_*, AWS_*) that were rendered to admins as if live.
- The assertion that let this through, /Reset \\d+ rate limit records/, matched
  'Reset 0'. Both occurrences are replaced with a regex that cannot match a
  no-op, plus state assertions and a guard that no test reintroduces it.

Collection prefix verified unchanged at 'ratelimit_' — no live counter moves.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
rec RL_DONE yes
```
  - Expected: `Tests: … 0 failed` against the recorded baseline; any new failure is fixed in this
    commit, not deferred.

---

### Task 26: affiliate `server/` + `server.js` ESLint → **0**, in six gated batches

Owner decision 2, verbatim: *"fix **all 208** affiliate `server/` ESLint errors. Own commit series,
**after** the flips are verified, never mixed into a cutover commit."* The owner also scoped the
remainder: `server/` + `server.js` = **0**; everything outside `server/` becomes a documented accepted
baseline with a no-increase guard (task 27). **That decision is implemented here, not re-asked** (R-14,
X18, X27): no step in this task asks the owner whether to fix, schedule or accept anything.

[MEASURED 2026-09-21] `npx eslint server/ server.js` = **209** errors (`server/` 208 + `server.js` 1),
0 warnings, 34 files: `indent` 63 · `no-trailing-spaces` 51 · `no-unused-vars` 43 · `comma-dangle` 29 ·
`quotes` 12 · `no-useless-escape` 6 · `no-prototype-builtins` 2 · `no-useless-catch` 1 ·
`import/no-dynamic-require` 1 · `no-case-declarations` 1.

⚠️ **No total in this task is a literal.** Slice C pinned `TOTAL 196 / 133 / 90 / 51 / 10` from
arithmetic that was internally inconsistent (X25: C-R6 said 195, C13 said 196, the deltas summed to
194) and that ignored files phases 2–4 delete (`explorerGuard.js` 9 `quotes`, `quarantineConfig.js` 3
`comma-dangle`, `locationQuarantine.js` 1, the two intake controllers, `storeIPs.js` 9). **Every batch
asserts `new_total == recorded_total − recorded_count(this batch's rules)`**, both sides read from the
record. The exit criterion is literally **0**, whatever the starting number.

**Files:** the error-carrying files, batch by batch, plus `.eslintrc.js` (Step 6, HUMAN-CONFIRM),
`package.json` (`lint:server`), and `tests/unit/eslintServerClean.test.js` (new).

**Interfaces:**
- Consumes — asserted in Step 0, halting:
  1. **Task 25 landed** — asserted on the artefact: `APP_LIMITER_NAMES` exported as a getter,
     `rate_limits` absent from `server/`, `tests/integration/resetRateLimits.test.js` present and green.
  2. **Phase 1 flips verified** — `ALL_HOSTS_FLIPPED=yes` + three `HOST_DONE_*=yes` rows (owner
     decision 2's explicit precondition).
  3. A clean working tree (a lint autofix over uncommitted work is unrecoverable by `git checkout --`).
- Produces: `npx eslint server/ server.js` printing nothing and exiting `0`; `npm run lint:server`;
  `tests/unit/eslintServerClean.test.js` (falsified once); record rows `LINT_TOTAL_0`,
  `LINT_<RULE>_0`, `LINT_SERVER_ZERO=yes`.
- Closes: `tasks/todo.md` §D-4 (task 35 records it).

**The helper, defined once and used verbatim by every step:**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
lintcount() { ( cd "$AFF" && npx eslint ${1:-server/ server.js} -f json 2>/dev/null | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);const by={};let e=0;
for(const f of r){e+=f.errorCount;for(const m of f.messages)if(m.severity===2)by[m.ruleId||'(fatal)']=(by[m.ruleId||'(fatal)']||0)+1;}
console.log('TOTAL '+e);Object.entries(by).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(v+' '+k));});" ); }
lintrule() { lintcount "$1" | awk -v R="$2" '$2==R{print $1}'; }   # prints nothing when the rule is absent
```

**Rollback (exact).** Each batch is its own commit and reverts independently, newest first:
```bash
cd "$AFF" && git revert --no-edit <batch-N sha>
EV=/var/www/wavemax/cutover-logs; set -a; . "$EV/plan3-record.env"; set +a
echo "expected=$(eval echo \$LINT_TOTAL_BEFORE_BATCH_N) actual=$(lintcount | awk '/^TOTAL/{print $2}')"
```
- Rollback expected: the two numbers equal. Nothing is deployed by this task, so no box action is
  needed. Reverting batch 6 does **not** reintroduce the errors — it only removes the guard, the npm
  script and the config override.

- [ ] **Step 0: Assert the Consumes rows, then re-measure and record the arithmetic.**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; cd "$AFF"
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
req_yes() { local v="${!1-}"; [ "$v" = yes ] || { echo "STOP: $1='$v' (want 'yes')"; return 1; }; echo "$1=yes"; }

req_yes ALL_HOSTS_FLIPPED; grep -c '^HOST_DONE_[a-z0-9_]*=yes$' "$REC"
node -e "const d=Object.getOwnPropertyDescriptor(require('./server/middleware/rateLimiting'),'APP_LIMITER_NAMES');
console.log('app_limiter_names_getter='+!!(d&&typeof d.get==='function'));process.exit(d&&d.get?0:1)"
echo "T25_EXIT=$?"
grep -rc 'rate_limits' server/ | grep -v ':0' | wc -l
test -f tests/integration/resetRateLimits.test.js && echo REGRESSION_SUITE_PRESENT
git status --porcelain | wc -l
lintcount
```
  - Expected: `ALL_HOSTS_FLIPPED=yes`, `3`, `app_limiter_names_getter=true`, `T25_EXIT=0`, `0`,
    `REGRESSION_SUITE_PRESENT`, `0` modified files, then a `TOTAL <n>` block.
  - Any `STOP:`, `T25_EXIT=1`, a non-zero `rate_limits` file count, a dirty tree — **STOP**.
  - `TOTAL 0` here means the work is already done — STOP and skip to Step 6's guard.
```bash
rec LINT_TOTAL_0 "$(lintcount | awk '/^TOTAL/{print $2}')"
for r in indent no-trailing-spaces comma-dangle quotes no-unused-vars no-useless-escape \
         no-prototype-builtins no-useless-catch no-case-declarations import/no-dynamic-require; do
  v=$(lintrule '' "$r"); rec "LINT_$(echo "$r" | tr 'a-z/-' 'A-Z__')_0" "${v:-0}"
done
grep -E '^LINT_' "$REC" | tail -12
```
  - Expected: one `LINT_TOTAL_0=<n>` row and ten per-rule rows. Every later expectation is computed
    from these, never from this document.

- [ ] **Step 1: Batch 1 — `indent`, whitespace only.**
```bash
cd "$AFF"
npx eslint server/ server.js --fix --rule '{"no-trailing-spaces":"off","comma-dangle":"off","quotes":"off"}'
echo "EXIT=${PIPESTATUS[0]}"
echo "WS_ONLY_EXIT=$(git diff -w --quiet && echo 0 || echo 1)"; git diff --stat | tail -3
for f in $(git diff --name-only); do node --check "$f" || echo "SYNTAX_FAIL $f"; done; echo PARSE_OK
lintcount | head -4
```
  - Expected: `EXIT=1` (non-fixable errors remain, so eslint still exits non-zero) with **no `indent`**
    lines in its output; `WS_ONLY_EXIT=0` and an empty `git diff -w --stat` while `git diff --stat`
    shows the changed files; `PARSE_OK` with no `SYNTAX_FAIL`; and a `TOTAL` equal to
    `$LINT_TOTAL_0 − $LINT_INDENT_0`, with no `indent` line.
  - `WS_ONLY_EXIT=1` means the autofixer touched a token: `git checkout -- server/ server.js`, report,
    do not proceed. **This gate is the proof, not a hope** — a whitespace-insensitive diff that is
    empty means nothing but indentation moved.
  - Then: `npm test 2>&1 | tail -12` (must be at the recorded baseline) and commit
    `style(server): eslint --fix indent (N errors) — whitespace only`, recording
    `LINT_TOTAL_BEFORE_BATCH_2`.

- [ ] **Step 2: Batch 2 — `no-trailing-spaces`, whitespace only.** Same shape:
```bash
cd "$AFF" && npx eslint server/ server.js --fix --rule '{"indent":"off","comma-dangle":"off","quotes":"off"}'
echo "EXIT=${PIPESTATUS[0]}"; echo "WS_ONLY_EXIT=$(git diff -w --quiet && echo 0 || echo 1)"
for f in $(git diff --name-only); do node --check "$f" || echo "SYNTAX_FAIL $f"; done; echo PARSE_OK
lintcount | head -4
```
  - Expected: `EXIT=1`, `WS_ONLY_EXIT=0`, `PARSE_OK`, `TOTAL` = previous − `$LINT_NO_TRAILING_SPACES_0`,
    no `no-trailing-spaces` line. Full suite, commit, record the new before-total.

- [ ] **Step 3: Batch 3 — `comma-dangle` + `quotes`, token-level.** This batch **does** change tokens,
      so `git diff -w` will not be empty; the gate is a parse check plus a string-content check.
```bash
cd "$AFF" && npx eslint server/ server.js --fix --rule '{"indent":"off","no-trailing-spaces":"off"}'
echo "EXIT=${PIPESTATUS[0]}"
for f in $(git diff --name-only); do node --check "$f" || echo "SYNTAX_FAIL $f"; done; echo PARSE_OK
for f in $(git diff --name-only); do node -e "
const cp=require('child_process');
const a=cp.execSync('git show HEAD:'+process.argv[1]).toString();
const b=require('fs').readFileSync(process.argv[1],'utf8');
const strs=(s)=>(s.match(/(['\"])(?:\\\\.|(?!\\1)[^\\\\\\n])*\\1/g)||[]).map(x=>x.slice(1,-1));
const A=strs(a),B=strs(b);
console.log((A.length===B.length && A.every((x,i)=>x===B[i]) ? 'STRINGS_SAME ' : 'STRINGS_DIFFER ')+process.argv[1]);
" "$f"; done
lintcount | head -4
```
  - Expected: `EXIT=1`, `PARSE_OK`, `STRINGS_SAME <file>` for **every** changed file, then `TOTAL` =
    previous − (`$LINT_COMMA_DANGLE_0` + `$LINT_QUOTES_0`).
  - A `STRINGS_DIFFER` line means the quote fixer altered a literal's contents (an apostrophe inside a
    double-quoted string): `git checkout -- <file>`, fix that file by hand, name it in the commit body.

- [ ] **Step 4: Batch 4 — `no-unused-vars`, manual deletions. The one batch where "unused" is not
      obviously safe.** A `require()` can be load-bearing for its side effects:
      `administratorController.js` requires six **model** files; deleting those requires can
      un-register a model for any path that relied on this controller loading it.
```bash
cd "$AFF" && npx eslint server/ server.js -f json 2>/dev/null | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);
for(const f of r) for(const m of f.messages) if(m.ruleId==='no-unused-vars'){
  const p=f.filePath.replace(process.cwd()+'/','');
  const src=require('fs').readFileSync(f.filePath,'utf8').split('\n')[m.line-1];
  const kind=/require\(/.test(src) ? (/models\//.test(src)?'MODEL_REQUIRE':'REQUIRE')
            : (/function|=>|\(/.test(src)&&m.message.includes('defined but never used')?'PARAM':'LOCAL');
  console.log(kind.padEnd(14)+p+':'+m.line+'  '+m.message);}});" | sort | tee /tmp/unused-classified.txt
awk '{print $1}' /tmp/unused-classified.txt | sort | uniq -c
node -e "process.env.NODE_ENV='test'; require('./server.js');
console.log('models='+require('mongoose').modelNames().sort().join(','));" | tail -1 | tee /tmp/models-before.txt
```
  - Expected: a classified list totalling `$LINT_NO_UNUSED_VARS_0`, a class histogram, and one
    `models=` line. **Capture `models=`.**
  - `PARAM` class is **renamed, not deleted**: the config is
    `'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]`, so `next` → `_next` satisfies it while
    keeping Express's 4-arity error-handler signature. **Deleting a 4th parameter turns an error
    handler into ordinary middleware.**
```bash
cd "$AFF"   # after the edits
node -e "process.env.NODE_ENV='test'; require('./server.js');
console.log('models='+require('mongoose').modelNames().sort().join(','));" | tail -1 > /tmp/models-after.txt
diff /tmp/models-before.txt /tmp/models-after.txt && echo MODELS_IDENTICAL
lintcount | head -4
```
  - Expected: `MODELS_IDENTICAL`, then `TOTAL` = previous − `$LINT_NO_UNUSED_VARS_0` with no
    `no-unused-vars` line.
  - A missing model name means a require **was** load-bearing: restore that one line with
    `// eslint-disable-next-line no-unused-vars -- registers the <X> model; see Plan 3 task 26`.
    `server.js:503 originalExpires` is in this batch (it is why the scope is `server/` **and**
    `server.js` — `eslint server/` never linted the app's own entry point).

- [ ] **Step 5: Batch 5 — the semantic errors, each behind a test written first.** Strict TDD per fix:
      three sit on regex semantics and one on control flow.

| Error | File:line | Fix | The test |
|:--|:--|:--|:--|
| `no-useless-escape` `\[` ×2 | `server/utils/passwordValidator.js:54,217` | drop the backslash | characterisation table over `[ ] - ^ \` + a normal password, **green before and after** |
| `no-useless-escape` `\'` | `server/services/email/dispatcher/affiliate.js:34` | drop it | render the template; output byte-identical |
| `no-useless-escape` `\'` ×2 | `server/services/email/dispatcher/operator.js:27` | drop both | same |
| `no-prototype-builtins` | `server/utils/fieldFilter.js:15` | `Object.prototype.hasOwnProperty.call(o,k)` | **a real defect** — a null-prototype object throws `TypeError: o.hasOwnProperty is not a function`; that case must be **red first** |
| `no-prototype-builtins` + `no-useless-escape` | `server/middleware/sanitization.js:23,95` | same shape | the affiliate still owns this file (the B5 shim is not in this plan), so both are fixed **here**; web-core's identical copy is an ESCALATIONS row — its `.eslintrc.js` switches these rules `off` |
| `no-useless-catch` | `server/middleware/auth.js:49` | unwrap the rethrow-only `try`/`catch` | the original error object reaches `next()` **by identity** |
| `no-case-declarations` | `server/utils/formatters.js:165` | wrap the case body in a block | table test over **every** switch branch |
| `import/no-dynamic-require` | `server/services/firebasePhoneService.js:38` | **not a code defect** — a stale disable comment naming rules from a plugin this repo does not install | `node -e "require('eslint-plugin-import/package.json')"` → `NOT INSTALLED` |

```bash
cd "$AFF"
npx jest tests/unit/fieldFilterPrototype.test.js 2>&1 | tail -10          # RED first: the null-prototype case
node -e "try{console.log(require('eslint-plugin-import/package.json').version)}catch(e){console.log('NOT INSTALLED')}"
sed -n '38p' server/services/firebasePhoneService.js
```
  - Expected: `TypeError: o.hasOwnProperty is not a function` on the null-prototype case (the other two
    cases may pass); `NOT INSTALLED`; and a line reading
    `// eslint-disable-next-line global-require, import/no-dynamic-require`.
  - **Decision, recorded, not re-asked:** delete the two unknown rule names from the disable comment
    rather than installing `eslint-plugin-import` — installing it would pull new rules across
    `public/`'s ~8,953 errors. Keep the explanatory comment above the `require(path)`.
```bash
cd "$AFF" && lintcount | head -3
```
  - Expected: `TOTAL 0`.

- [ ] **Step 6: Batch 6 — the zero gate, the guard, and the `no-console` alignment.**
```bash
cd "$AFF" && npx eslint server/ server.js; echo "ESLINT_EXIT=${PIPESTATUS[0]}"
```
  - **Expected, exactly:** no output at all, then `ESLINT_EXIT=0`. That is the literal exit criterion.
```bash
cd "$AFF" && node -e "
const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));
p.scripts['lint:server']='eslint server/ server.js';
p.scripts=Object.fromEntries(Object.entries(p.scripts).sort());
fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');"
npm run lint:server; echo "EXIT=${PIPESTATUS[0]}"
```
  - Expected: no output, `EXIT=0`.
  - Guard test `tests/unit/eslintServerClean.test.js` runs ESLint programmatically over
    `['server/','server.js']` (measured cost ~7 s) and asserts the error list `toEqual([])`, printing
    `file:line rule — message` for each survivor so a failure is actionable.
  - **Falsify it once (C-11), and record both outputs:**
```bash
cd "$AFF" && printf '\nconst _unused_probe = require("path")\n' >> server/utils/validators.js
npx jest tests/unit/eslintServerClean.test.js 2>&1 | tail -12
git checkout -- server/utils/validators.js && npx jest tests/unit/eslintServerClean.test.js 2>&1 | tail -4
```
  - Expected: the injected line makes the test **fail**, listing `server/utils/validators.js:<n> semi`
    (and a `no-unused-vars` line); after the checkout it passes. An unfalsified guard is decoration.
  - **`no-console` alignment — HUMAN-CONFIRM** (repo-wide config edit):
```bash
cd "$AFF" && npx eslint server/ server.js --rule '{"no-console":["error",{"allow":[]}]}'; echo "EXIT=${PIPESTATUS[0]}"
```
  - Expected: no output, `EXIT=0` — `server/` is already console-free, so tightening changes no code.
  - Ask: "`.eslintrc.js:16` is `'no-console': ['warn', { allow: ['warn','error'] }]`, but CLAUDE.md says
    `console.*` is blocked in `server/`. `server/` measures console-free — add a `server/**` override
    setting it to `['error', { allow: [] }]` so the config matches the documented rule?" Record verbatim.
  - On refusal: leave the config alone and carry the divergence as an ESCALATIONS row in task 35
    (CLAUDE.md vs the enforced config) — **not** as a silent inconsistency.
```bash
cd "$AFF" && npm run lint:server; echo "EXIT=${PIPESTATUS[0]}"; npm test 2>&1 | tail -12
rec LINT_SERVER_ZERO yes
git add -A && git commit -m "chore(lint): server/ and server.js are at zero eslint errors, guarded

Plan 3 task 26, batch 6 of 6 — the exit criterion. npx eslint server/ server.js
prints nothing and exits 0 (209 -> 0; owner decision: fix all, not 'no increase').

- npm run lint:server covers server.js as well as server/, closing the gap that
  'eslint server/' never linted the app's own entry point.
- tests/unit/eslintServerClean.test.js runs ESLint programmatically (~7 s) so a
  reintroduced error fails the suite. The guard was falsified before it was
  trusted: an injected unused require made it red; reverting made it green.
- One of the semantic fixes was a real defect: fieldFilter.js:15 threw
  TypeError on a null-prototype object. One was not a defect at all:
  firebasePhoneService.js:38 carried a disable comment naming rules from a
  plugin this repo does not install.

The ~10,700 errors outside server/ are a documented accepted baseline with a
no-increase guard — Plan 3 task 27, not silent debt.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 27: repo-wide ESLint **no-increase guard** + the documented accepted baseline

This implements the second half of owner decision 2 — *"the errors outside `server/` become a
documented accepted baseline **with a no-increase guard** — NOT fixed"*. Slice C instead wrote an
escalation row asking the owner to decide again (X18); that row does not exist here. The number is a
**record**, not a question.

**Files:**
- Create: `.eslint-baseline.json`, `tests/unit/eslintRepoBaseline.test.js`
- Modify: `package.json` (`lint:baseline`), `docs/development/OPERATING_BEST_PRACTICES.md` (the policy)

**Interfaces:**
- Consumes — asserted in Step 1, halting: **task 26** (`npm run lint:server` prints nothing, exits 0)
  and the phase-2 deletions (the measured baseline must be **strictly below 10,900**, because task 17
  alone removes `design-explorer`'s 315 — this is how a silently-skipped phase-2 task is caught here).
- Produces: `.eslint-baseline.json` (total + per-directory + `measuredAt` + the policy), an npm script,
  and an in-suite guard that fails when the total rises.

**[MEASURED 2026-09-21, before the phase-2 deletions]** `npx eslint .` = **10,900 errors / 669
warnings** in **63 s** wall (`public` 8953 · `tests` 1007 · `design-explorer` 315 · `docs` 263 ·
`server` 208 · `scripts` 145 · `tools` 6 · `init-defaults.js` 2 · `server.js` 1). ESLint's `--cache`
does **not** help here — a warm second pass measured **55 s** — because the cost is file traversal on
the `/mnt/c` mount, not linting. The guard therefore states its cost honestly in its own header and
sets `jest.setTimeout(240000)`.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git revert --no-edit <task-27 sha>
test -f .eslint-baseline.json && echo STILL_PRESENT || echo REMOVED
npm run lint:server; echo "EXIT=${PIPESTATUS[0]}"
```
- Rollback expected: the revert line, `REMOVED`, then no output and `EXIT=0` — reverting the guard
  does not change any linted code.

- [ ] **Step 1: Assert task 26, then measure the baseline (derive, never pin).**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; cd "$AFF"
npm run lint:server; echo "SERVER_EXIT=${PIPESTATUS[0]}"
npx eslint . -f json 2>/dev/null > /tmp/lint-all.json; echo "LINT_EXIT=${PIPESTATUS[0]}"
node -e "
const r=require('/tmp/lint-all.json'); const by={}; let e=0,w=0;
for(const f of r){e+=f.errorCount;w+=f.warningCount;
  const rel=f.filePath.replace(process.cwd()+'/','');const top=rel.split('/')[0];
  if(f.errorCount) by[top]=(by[top]||0)+f.errorCount;}
console.log('TOTAL_ERRORS '+e+' WARNINGS '+w);
console.log(Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+v).join(' · '));
process.exit(e < 10900 ? 0 : 1)"
echo "BASELINE_EXIT=$?"
```
  - Expected: `npm run lint:server` prints nothing with `SERVER_EXIT=0`; **`LINT_EXIT=1`** — eslint
    exits `1` whenever it reports any error, which is the normal state here and is not a failure
    (`LINT_EXIT=2` means eslint itself crashed and the JSON must **not** be read as data); a
    `TOTAL_ERRORS <n>` line with
    `n` **strictly less than 10,900** and **no `server` or `server.js` entry** in the per-directory
    line; `BASELINE_EXIT=0`.
  - `SERVER_EXIT=1` — task 26 is not done; STOP. `BASELINE_EXIT=1` — the phase-2 deletions did not
    land (the explorer's 315 are still counted); STOP and check tasks 16–19 before writing a baseline
    that blesses work that never happened.

- [ ] **Step 2: Write the baseline and the guard.**
  - `.eslint-baseline.json`:
```json
{
  "measuredAt": "<UTC timestamp>",
  "measuredAtSha": "<git rev-parse HEAD>",
  "policy": "server/ and server.js are ZERO (npm run lint:server, guarded by tests/unit/eslintServerClean.test.js). Everything else is an ACCEPTED BASELINE that may not grow (owner decision, Plan 3 task 27). Lowering it is always welcome — re-measure and commit the new, lower number with the change.",
  "errors": 0,
  "warnings": 0,
  "byDirectory": {}
}
```
  - `tests/unit/eslintRepoBaseline.test.js`: lints `['.']` programmatically, asserts
    `errors <= baseline.errors`, and on failure prints the **per-directory delta** so the offending
    directory is named. Its header states the measured ~55–60 s cost.
  - It also asserts that **no `npm test` script disables it** — the escape hatch may exist for
    `--watch`, but the suite must never ship with the guard switched off:
```js
const pkg = require('../../package.json');
const testScripts = Object.entries(pkg.scripts).filter(([k]) => k === 'test' || k.startsWith('test:'));
for (const [name, cmd] of testScripts) {
  expect(`${name}: ${cmd}`).not.toMatch(/LINT_BASELINE_SKIP/);
}
```

- [ ] **Step 3: Falsify the guard (C-11), then restore.**
```bash
cd "$AFF" && printf '\nvar _plan3_probe = 1\n' >> public/assets/js/i18n.js
npx jest tests/unit/eslintRepoBaseline.test.js 2>&1 | tail -12
git checkout -- public/assets/js/i18n.js && npx jest tests/unit/eslintRepoBaseline.test.js 2>&1 | tail -4
```
  - Expected: red with a message naming `public` and the delta (`+2` or similar), then green after the
    checkout. **Record both outputs.**

- [ ] **Step 4: Wire the script, document the policy, commit.**
```bash
cd "$AFF" && node -e "
const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));
p.scripts['lint:baseline']='node -e \"require(\\\"./scripts/ops/lint-baseline.js\\\")()\"';
p.scripts=Object.fromEntries(Object.entries(p.scripts).sort());
fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');"
npm run lint:baseline; echo "EXIT=${PIPESTATUS[0]}"
npm test 2>&1 | tail -12
git add -A && git commit -m "chore(lint): accepted baseline outside server/, with a no-increase guard

Owner decision 2, second half: server/ + server.js are zero (task 26); the
remainder is a documented accepted baseline that may not grow. The number is
measured at commit time into .eslint-baseline.json with a per-directory
breakdown, and tests/unit/eslintRepoBaseline.test.js fails the suite when the
total rises, naming the directory that grew.

Measured cost ~55-60 s (file traversal on /mnt/c dominates; eslint --cache does
not help — verified). The guard was falsified before being trusted, and it
asserts that no npm test script disables it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: `EXIT=0`, the full suite at its baseline, and the commit.
  - The `docs/development/OPERATING_BEST_PRACTICES.md` addition is four lines: the two commands, the
    number, and the rule that a change may lower the baseline but never raise it.

---

# PHASE 5 — findings, closure, escalation

---

### Task 28: password-reset links are built from `BASE_URL`, not the retired `FRONTEND_URL`

> **This is an improvement. It is NOT a flip gate, and nothing in this plan gates on it.**
> Slice E claimed the `rundberglaundry.com` flip would break password reset because
> `passwordResetService.js:86` builds every reset link from `FRONTEND_URL=https://rundberglaundry.com`.
> The controller measured the end-to-end behaviour instead of reasoning about it — **[MEASURED
> 2026-09-21, on oci1]**:
> ```
> GET :3001  Host: rundberglaundry.com  /embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate
> HTTP/1.1 301 Moved Permanently
> Location: https://portal.atxwashdryfold.com/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate
> ```
> The token survives **byte-identical** through the content app's legacy redirect. Slice A was right;
> slice E's blocker framing is dropped (ADJUDICATION §Not accepted). The fix still ships — two env keys
> for one origin is the defect, and `FRONTEND_URL` cannot be deleted (task 29) while code reads it.

**Files:** `tests/unit/passwordResetService.test.js` (new) · `server/services/passwordResetService.js:86`
· `server/services/systemHealthService.js:14` (drop `'FRONTEND_URL'` from `ALLOWED_ENV_VARS`) ·
`public/assets/js/administrator-dashboard-init.js:2665` (drop it from the `Application` grouping).

**Interfaces:**
- Consumes — asserted in Step 0, halting:
  1. `BASE_URL=https://portal.atxwashdryfold.com` set on **both** boxes (read-only) — without it this
     change swaps one broken origin for another.
  2. `server/services/passwordResetService.js:86` still in its measured shape (one `FRONTEND_URL`
     interpolation) — if it has already changed, this task is a no-op and must say so, not sed blindly.
- Produces: reset links from the canonical portal origin; `FRONTEND_URL` unreferenced anywhere in
  `server/` and `public/`, which is what makes it **deletable** in task 29.
- **Gates:** task 29's removal of `FRONTEND_URL` from the boxes, and task 34's round trip.

**Rollback (exact).**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; cd "$AFF"
EV=/var/www/wavemax/cutover-logs; set -a; . "$EV/plan3-record.env"; set +a
if grep -q '^TS_ENV29_oci1=' "$EV/plan3-record.env"; then
  echo "REFUSE: task 29 has already removed FRONTEND_URL from the boxes."
  echo "Reverting this alone puts 'undefined/embed-app-v2.html...' in every reset email."
  echo "Roll task 29 back first, or do not revert."; exit 1; fi
git revert --no-edit <task-28 sha> && npx jest tests/unit/passwordResetService.test.js 2>&1 | tail -4
```
- Rollback expected: either the `REFUSE` block (and no revert), or the revert line followed by the new
  suite failing — the reverted code no longer reads `BASE_URL`.

- [ ] **Step 0: Assert the Consumes rows.**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; cd "$AFF"
for IP in 161.153.71.201 144.24.4.202; do printf '%s ' "$IP"; ssh -i ~/.ssh/oci_wavemax ubuntu@$IP \
  'grep -c "^BASE_URL=https://portal.atxwashdryfold.com$" /var/www/wavemax/wavemax-affiliate-program/.env'; done
grep -c 'process.env.FRONTEND_URL}/embed-app-v2.html' server/services/passwordResetService.js
grep -rc 'FRONTEND_URL' server/ --include=*.js | grep -v ':0'
```
  - Expected: `161.153.71.201 1` and `144.24.4.202 1`; then `1`; then exactly two lines —
    `server/services/passwordResetService.js:1` and `server/services/systemHealthService.js:1`.
  - A `0` from either box — **STOP**: set `BASE_URL` there first. A `0` from the third command means
    the line has already changed — stop and re-read the file before editing it.

- [ ] **Step 1: RED — the failing test, written first.** Create `tests/unit/passwordResetService.test.js`:
```js
// Plan 3 task 28. The reset link was built from FRONTEND_URL — a second env key
// for the same origin, pointing at a marketing host. BASE_URL is already the
// canonical portal origin on both boxes, so the duplicate goes away with it.
// (The flip does NOT break the old form: :3001 301s /embed-app-v2.html to the
// portal with the token byte-identical, measured 2026-09-21. This is hygiene,
// not a cutover blocker.)
jest.mock('../../server/utils/emailService', () => ({
  sendAffiliatePasswordResetEmail: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../server/models/Affiliate', () => ({ findOne: jest.fn() }));

const crypto = require('crypto');
const emailService = require('../../server/utils/emailService');
const Affiliate = require('../../server/models/Affiliate');
const { forgotPassword } = require('../../server/services/passwordResetService');

const TOKEN = 'ab'.repeat(32);                                   // 64 hex chars
const cryptoWrapper = { randomBytes: () => Buffer.alloc(32, 0xab) };

describe('task 28: the reset link origin', () => {
  const OLD = { ...process.env };
  let user;

  beforeEach(() => {
    jest.clearAllMocks();
    user = { email: 'aff@example.com', save: jest.fn().mockResolvedValue(undefined) };
    Affiliate.findOne.mockResolvedValue(user);
  });
  afterEach(() => { process.env = { ...OLD }; });

  const capture = async () => {
    await forgotPassword({ email: user.email, userType: 'affiliate', cryptoWrapper });
    return emailService.sendAffiliatePasswordResetEmail.mock.calls[0][1];
  };

  it('builds the link from BASE_URL', async () => {
    process.env.BASE_URL = 'https://portal.atxwashdryfold.com';
    delete process.env.FRONTEND_URL;
    expect(await capture()).toBe(
      `https://portal.atxwashdryfold.com/embed-app-v2.html?route=/reset-password&token=${TOKEN}&type=affiliate`
    );
  });

  it('ignores FRONTEND_URL even when it is set', async () => {
    process.env.BASE_URL = 'https://portal.atxwashdryfold.com';
    process.env.FRONTEND_URL = 'https://rundberglaundry.com';
    expect(await capture()).not.toContain('rundberglaundry.com');
  });

  it('refuses to mail an "undefined" origin when BASE_URL is missing', async () => {
    delete process.env.BASE_URL; delete process.env.FRONTEND_URL;
    await expect(forgotPassword({ email: user.email, userType: 'affiliate', cryptoWrapper }))
      .rejects.toThrow(/BASE_URL/);
    expect(emailService.sendAffiliatePasswordResetEmail).not.toHaveBeenCalled();
  });

  it('emails the token that was stored, hashed', async () => {
    process.env.BASE_URL = 'https://portal.atxwashdryfold.com';
    const url = await capture();
    const emailed = decodeURIComponent(new URL(url).searchParams.get('token'));
    expect(crypto.createHash('sha256').update(emailed).digest('hex')).toBe(user.resetToken);
  });
});
```
```bash
cd "$AFF" && npx jest tests/unit/passwordResetService.test.js 2>&1 | tail -20
```
  - Expected: `Tests: 3 failed, 1 passed, 4 total`. Case 1 fails with `Received:
    "undefined/embed-app-v2.html?route=/reset-password&token=abab…&type=affiliate"`; case 2 fails
    naming `rundberglaundry.com`; case 3 fails because nothing throws and the mailer **was** called;
    case 4 passes already (the token round-trip is not what changes).
  - A case-1 pass here proves the test is not reaching line 86 — **STOP** and fix the harness.

- [ ] **Step 2: GREEN — the one-line change and its two display companions.**
```bash
cd "$AFF"
sed -i 's|${process.env.FRONTEND_URL}/embed-app-v2.html|${process.env.BASE_URL}/embed-app-v2.html|' server/services/passwordResetService.js
sed -i "s/'BASE_URL', 'FRONTEND_URL', 'BACKEND_URL',/'BASE_URL', 'BACKEND_URL',/" server/services/systemHealthService.js
sed -i "s/'BASE_URL', 'FRONTEND_URL', 'BACKEND_URL', 'CORS_ORIGIN'/'BASE_URL', 'BACKEND_URL', 'CORS_ORIGIN'/" public/assets/js/administrator-dashboard-init.js
grep -rc 'FRONTEND_URL' server/ public/ --include=*.js | grep -v ':0' | wc -l
npx jest tests/unit/passwordResetService.test.js 2>&1 | tail -6
```
  - The guard for case 3 is added in the same edit, immediately above line 86:
```js
  if (!process.env.BASE_URL) {
    throw new PasswordResetError('missing_base_url',
      'BASE_URL is not configured; refusing to email a reset link with an undefined origin', 500);
  }
```
  - Expected: `0` files still mentioning `FRONTEND_URL` in `server/` or `public/`, then
    `Tests: 4 passed, 4 total`.
  - Any remaining `FRONTEND_URL` under `server/` — **STOP**: task 29 must not delete a key the code
    still reads.

- [ ] **Step 3: Full suite, lint, commit.**
```bash
cd "$AFF" && npm test 2>&1 | tail -8
npx eslint server/services/passwordResetService.js server/services/systemHealthService.js
git add -A && git commit -m "fix(auth): build password-reset links from BASE_URL, not FRONTEND_URL

FRONTEND_URL=https://rundberglaundry.com was the only input to every reset link
(passwordResetService.js:86) — a second env key for an origin BASE_URL already
names. Not a cutover blocker: the flipped host 301s /embed-app-v2.html to the
portal with the token byte-identical (measured). This is hygiene, and it is what
makes FRONTEND_URL deletable from both boxes.

A missing BASE_URL now throws instead of mailing 'undefined/embed-app-v2.html'.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: the suite at its recorded baseline (no NEW failure), eslint silent, the commit.

---

### Task 29: [per box] **HUMAN-CONFIRM** — the remaining dead `.env` keys, from a POST-purge baseline

> ⛔ **R-11, and it is not hypothetical.** **[MEASURED 2026-09-21, both boxes]** the DocuSign purge has
> **already happened**: the portal `.env` is **70 keys / 152 lines / 0 non-key non-comment lines / 0
> `DOCUSIGN_*` / 0 `PRIVATE KEY`**. But `/var/www/wavemax/env-backups/` holds **only two files on each
> box** — `env.bak.mediator.20260824` and `env.bak.phase1.20260824` — and **each contains 2
> `PRIVATE KEY` lines and 10 `DOCUSIGN_*` keys**. A rollback that grabs "the newest backup" therefore
> **re-plants the 27-line plaintext RSA key on production**. Every restore in this task refuses a
> backup containing `PRIVATE KEY`, and Step 6 quarantines the two pre-purge files.
>
> Slice E's `grep -v '^DOCUSIGN_PRIVATE_KEY='` hazard generalises: a key-name filter leaves the
> continuation lines of **any** multi-line value. The general guard is the one already true today —
> **`grep -cvE "^[A-Za-z_][A-Za-z0-9_]*=|^\s*#|^\s*$" .env` must be `0` before and after** — and it
> catches orphans from any multi-line value, not just a PEM.

**Files:**
- Box (both): `/var/www/wavemax/wavemax-affiliate-program/.env`; creates
  `/var/www/wavemax/env-backups/.env.<TS>` (post-purge); moves the two pre-purge backups to
  `/var/www/wavemax/env-backups/quarantine/` (mode 600, dir 700).
- Repo (one commit): `public/assets/js/administrator-dashboard-init.js:2669` (delete the `'DocuSign'`
  grouping), `scripts/admin/rotate-credentials.sh` (the 3 `DOCUSIGN_WEBHOOK_SECRET` references
  [MEASURED: `:48`, `:56`, `:78`]), and a guard test pinning `ALLOWED_ENV_VARS`.

**Interfaces:**
- Consumes — every row asserted **on the box**, in Step 1, halting (X2: prose "E2 is deployed" is not
  a precondition, it is a hope):
  1. **Task 28 deployed on this box** — the box's own `passwordResetService.js` reads `BASE_URL` and
     contains **no** `FRONTEND_URL`.
  2. **Task 17 deployed on this box** — the explorer and `/api/concierge` are gone, which is what makes
     `EXPLORER_TOKEN` and `ANTHROPIC_API_KEY` dead. (`ANTHROPIC_API_KEY` is **not** an escalation:
     it was verified single-reader → single-route → explorer-only, so task 17 retires it — X10/R-13.)
  3. **Task 25 deployed on this box** — `ALLOWED_ENV_VARS` no longer advertises the dead rate-limit
     knobs or the `STRIPE_*`/`AWS_*` rows, which is what makes those keys dead.
  4. The post-purge shape: `0` `PRIVATE KEY`, `0` non-key lines.
- Produces: `TS_ENV29_<box>`, `ENV29_BEFORE_<box>`, `ENV29_AFTER_<box>`, `ENV29_REMOVED_<box>`,
  `ENV29_BACKEND_URL`, `ENV29_DEFAULT_ADMIN`; a portal `.env` with every dead key gone and
  `ALERT_EMAIL=admin@crhsent.com` added.

**[MEASURED 2026-09-21] the classifier's result today**, run over the live key list against
`server/ server.js ecosystem.config.js public/ scripts/ tests/ deploy/ node_modules/@crhs/web-core/src/`:
**10 `DEAD`** — `ACCESS_GATE_ENABLED`, `GOOGLE_PLACES_LOCATION_PLACE_ID`, `MEDIATOR_GATE_ENABLED`,
`MEDIATOR_GATE_PASSWORDS`, `OPERATOR_PIN_REENTRY`, `OPERATOR_TOKEN_EXPIRY`, `RUN_BACKGROUND_JOBS`,
`SERVICE_CITY`, `SERVICE_RADIUS_MILES`, `SERVICE_STATE` — plus **1 `NO-RUNTIME`**
(`ENABLE_TEST_PAYMENT_FORM`, tests only). `FRONTEND_URL`, `EXPLORER_TOKEN`, `ANTHROPIC_API_KEY`,
`RATE_LIMIT_WINDOW_MS`, `AUTH_RATE_LIMIT_MAX`, `STRIPE_*`, `AWS_S3_BUCKET` and `BACKEND_URL` classify
`LIVE` **today only because of the code tasks 17, 25 and 28 change** — which is precisely why this task
runs after them and re-runs the classifier rather than trusting a list.

**Rollback (exact) — per box, with two refusals.**
```bash
BOX=oci1; IP=161.153.71.201        # pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
V=TS_ENV29_$BOX; TS=${!V}; test -n "$TS" || { echo "STOP: no recorded TS for $BOX"; exit 1; }; echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
B=/var/www/wavemax/env-backups/.env.$TS
test -f \$B
test \"\$(grep -c 'PRIVATE KEY' \$B)\" = 0        # REFUSE a pre-purge backup (R-11)
cat \$B > /var/www/wavemax/wavemax-affiliate-program/.env
grep -c 'PRIVATE KEY' /var/www/wavemax/wavemax-affiliate-program/.env
grep -c '^FRONTEND_URL=' /var/www/wavemax/wavemax-affiliate-program/.env
BEFORE=\$(pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.parse(s).filter(p=>p.name===\"wavemax\").map(p=>p.pm2_env.restart_time).join(\",\")))')
pm2 reload wavemax --update-env >/dev/null; sleep 8
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/health"
```
- Rollback expected: `TS=<value>`, then `0` (no private key), `1` (the pre-task `.env` had
  `FRONTEND_URL`), then `200`.
- ⚠️ **Order:** if task 28 has been reverted, revert it **after** this, never before — task 28's own
  rollback refuses while `TS_ENV29_*` exists.
- The `test "$(grep -c 'PRIVATE KEY' $B)" = 0` line is the R-11 guard: it makes restoring either
  2026-08-24 backup impossible without a deliberate, owner-approved override.

- [ ] **Step 1: [read-only, both boxes] Assert every Consumes row and re-run the classifier.**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
for pair in oci1:161.153.71.201 oci2:144.24.4.202; do BOX=${pair%%:*}; IP=${pair##*:}
  echo "== $BOX =="
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'set -e
  R=/var/www/wavemax/wavemax-affiliate-program; A=$R/.env
  echo "t28_base_url=$(grep -c "process.env.BASE_URL}/embed-app-v2.html" $R/server/services/passwordResetService.js || true)"
  echo "t28_frontend_url=$(grep -c FRONTEND_URL $R/server/services/passwordResetService.js || true)"
  echo "t17_explorer=$(ls $R/server/middleware/explorerGuard.js 2>/dev/null | wc -l) t17_concierge=$(grep -c "api/concierge" $R/server.js || true)"
  echo "t25_env_allowlist=$(grep -cE "RATE_LIMIT_WINDOW_MS|AUTH_RATE_LIMIT_MAX|STRIPE_|AWS_" $R/server/services/systemHealthService.js || true)"
  echo "keys=$(grep -oE "^[A-Za-z_][A-Za-z0-9_]*=" $A | tr -d "=" | sort -u | wc -l) pem=$(grep -c "PRIVATE KEY" $A || true) nonkey=$(grep -cvE "^[A-Za-z_][A-Za-z0-9_]*=|^\s*#|^\s*$" $A || true)"
  grep -oE "^[A-Za-z_][A-Za-z0-9_]*=" $A | tr -d "=" | sort -u' > "$EV/plan3-env-keys-$BOX.txt"
  head -5 "$EV/plan3-env-keys-$BOX.txt"
  sed -i '1,5d' "$EV/plan3-env-keys-$BOX.txt"
done
cmp -s "$EV/plan3-env-keys-oci1.txt" "$EV/plan3-env-keys-oci2.txt" && echo KEYSETS_IDENTICAL || echo KEYSETS_DIFFER
```
  - Expected per box, five lines: `t28_base_url=1`, `t28_frontend_url=0`, `t17_explorer=0 t17_concierge=0`,
    `t25_env_allowlist=0`, `keys=<n> pem=0 nonkey=0`; then `KEYSETS_IDENTICAL`.
  - `t28_frontend_url=1` (or `t17_*`/`t25_*` non-zero) means those commits are merged but **not
    deployed on that box** — deleting the keys now would put `undefined/embed-app-v2.html…` in every
    reset email and delete keys the running code still reads. This is the single assertion slice E did
    not have (X2). It is **not** a dead end: go to **Step 1b**, deploy that box, and re-run this step.
  - `KEYSETS_DIFFER`, `pem` non-zero, or `nonkey` non-zero — **STOP**. The boxes have drifted, or the
    file is not in its measured post-purge shape.
```bash
cd "$AFF"
: > "$EV/plan3-env-refs.txt"
while read -r k; do
  rt=$(grep -rl -- "$k" server/ server.js ecosystem.config.js node_modules/@crhs/web-core/src/ 2>/dev/null | head -1)
  any=$(grep -rl -- "$k" server/ server.js ecosystem.config.js public/ scripts/ tests/ deploy/ node_modules/@crhs/web-core/src/ 2>/dev/null | head -2 | tr '\n' ' ')
  if   [ -n "$rt"  ]; then printf 'LIVE          %s\n' "$k"
  elif [ -z "$any" ]; then printf 'DEAD          %s\n' "$k"
  else                     printf 'NO-RUNTIME    %s   [%s]\n' "$k" "$any"
  fi
done < "$EV/plan3-env-keys-oci1.txt" | sort >> "$EV/plan3-env-refs.txt"
awk '{print $1}' "$EV/plan3-env-refs.txt" | sort | uniq -c
awk '$1=="DEAD"||$1=="NO-RUNTIME"{print $2}' "$EV/plan3-env-refs.txt" | tr '\n' ' '; echo
```
  - Expected: a `DEAD` + `NO-RUNTIME` + `LIVE` histogram summing to the box key count, and the removal
    list on one line. **This list is the input to Step 3; no literal list in this document is used.**
  - `PM2_APP_NAME` must classify `LIVE` — `ecosystem.config.js` is in the runtime set and pm2 reads it.
    If it appears in the removal list the classifier is broken — STOP.
  - The sweep is substring-based. Hand-check every key that moved bucket since the measurement above,
    and record the change before acting on it.

- [ ] **Step 1b: Deploy the pending affiliate commits to this box — one box at a time.**
      The skeleton orders task 29 **before** task 30, but task 30 Step 4 is the plan's only `git pull`.
      Task 29's own precondition ("task 28 deployed on the box") therefore cannot be satisfied without
      this step. Run it only for a box whose Step 1 showed `t28_frontend_url=1`, `t17_*` or `t25_*`
      non-zero; skip it for a box already current.
```bash
BOX=oci1; IP=161.153.71.201        # pass 2: BOX=oci2; IP=144.24.4.202 — only after this box is green
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
test -z "${BOX_BUSY:-}" || { echo "STOP: BOX_BUSY=$BOX_BUSY"; exit 1; }
printf 'BOX_BUSY=%s\n' "$BOX" >> "$REC"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'set -e -o pipefail
cd /var/www/wavemax/wavemax-affiliate-program
BEFORE=$(git rev-parse HEAD); git pull --ff-only | tail -2; AFTER=$(git rev-parse HEAD)
echo "before=$BEFORE after=$AFTER"; git log --oneline $BEFORE..$AFTER | cat
grep -c "process.env.BASE_URL}/embed-app-v2.html" server/services/passwordResetService.js
grep -rc FRONTEND_URL server/ --include=*.js | grep -v ":0" | wc -l
pm2 reload wavemax >/dev/null; sleep 8
curl -sf -o /dev/null -w "health=%{http_code}\n" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/health'
sed -i '/^BOX_BUSY=/d' "$REC"
```
  - Expected: a `before=… after=…` pair, the arriving commit list, `1`, `0`, `health=200`.
  - `set -e -o pipefail` means a failed pull cannot reach the reload (P6). Then re-run Step 1 for this
    box: it must now print `t28_frontend_url=0`. Task 30 Step 4 stays in the plan and is idempotent for
    a box already pulled here.

- [ ] **Step 2 (HUMAN-CONFIRM): Read the administrator collection, then ask Rick.** The
      `DEFAULT_ADMIN_EMAIL` question cannot be answered without the data (read-only):
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'cd /var/www/wavemax/wavemax-affiliate-program && node -e "
require(\"dotenv\").config(); const m=require(\"mongoose\");
(async()=>{ await m.connect(process.env.MONGODB_URI);
  const rows=await m.connection.collection(\"administrators\")
    .find({},{projection:{email:1,permissions:1,isSuperAdmin:1,_id:0}}).toArray();
  console.log(JSON.stringify(rows.map(r=>({email:r.email,
    star:Array.isArray(r.permissions)&&(r.permissions.includes(\"*\")||r.permissions.includes(\"all\")),
    sa:!!r.isSuperAdmin}))));
  await m.disconnect(); })().catch(e=>{console.log(\"ERR\",e.message);process.exit(1)})"'
```
  - Expected: a JSON array. Read it: any row with `"star":true` or `"sa":true` keeps super-admin
    **regardless** of the key → changing it is safe. A row whose email **is** `admin@wavemax.promo`
    with `star:false, sa:false` depends on the key alone → **STOP** and tell Rick before touching it.
  - `ERR …` — the probe failed; do not guess.
  - Then say exactly this:

  > Portal `.env` on both boxes — the last dead keys. The DocuSign block and its private key are
  > already gone (you did that on Friday); the file is 70 keys and clean. What is left are **<N>** keys
  > with no consumer anywhere — not the app, not web-core, not the scripts, not the tests. I re-ran the
  > sweep just now rather than trusting a list: `<the measured removal list>`.
  >
  > Three of those are only dead **because of this plan**: `FRONTEND_URL` (reset links now come from
  > `BASE_URL`), and `EXPLORER_TOKEN` + `ANTHROPIC_API_KEY` (the design explorer and `/api/concierge`
  > are retired — that also stops the Haiku billing).
  >
  > I am also adding `ALERT_EMAIL=admin@crhsent.com`. It is unset today, so outage alerts fall back to
  > `DEFAULT_ADMIN_EMAIL=admin@wavemax.promo`, which aliases to `admin@rundberglaundry.com` — a live
  > mailbox you don't read. Alerts are being delivered and ignored, which is the 2026-08-23 shape.
  >
  > **Two choices for you.** (1) `BACKEND_URL=https://wavemax.promo` has no consumer at all — it only
  > appears in the admin panel's environment view. Correct it to the portal, or delete it? (Default:
  > correct.) (2) `DEFAULT_ADMIN_EMAIL` is **not** dead — it grants super-admin by email equality
  > *and* is the alert fallback. I read the administrator collection: `<the result>`. Change it to
  > `admin@crhsent.com`, or keep it?
  >
  > Separately, and this one is a finding rather than a question: each box's `env-backups/` holds two
  > **2026-08-24** backups that still contain the plaintext RSA key and ten DocuSign keys. I will move
  > them to a `quarantine/` directory (mode 600) so no rollback can restore them by accident. Shredding
  > them is your call — say the word and I will, otherwise they stay quarantined.
  >
  > Backups first, then `pm2 reload wavemax --update-env` — a rolling reload, one box at a time, no
  > downtime. Proceed?

  Record `ENV29_BACKEND_URL=correct|delete`, `ENV29_DEFAULT_ADMIN=change|keep`,
  `ENV29_SHRED_PREPURGE=yes|no`, and the approval itself.

- [ ] **Step 3 (HUMAN-CONFIRM): Back up, then edit. One box. Nothing is reloaded in this step.**
```bash
BOX=oci1; IP=161.153.71.201        # pass 2: BOX=oci2; IP=144.24.4.202 — only after Step 5 is green
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
test -z "${BOX_BUSY:-}" || { echo "STOP: BOX_BUSY=$BOX_BUSY"; exit 1; }   # C-7
rec BOX_BUSY "$BOX"
REMOVE=$(awk '$1=="DEAD"||$1=="NO-RUNTIME"{printf "%s|", $2}' "$EV/plan3-env-refs.txt" | sed 's/|$//')
echo "REMOVE=$REMOVE"
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y%m%dT%H%M%SZ'); rec "TS_ENV29_$BOX" "$TS"; echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
A=/var/www/wavemax/wavemax-affiliate-program/.env
BEFORE=\$(grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' \$A | tr -d '=' | sort -u | wc -l)
test \"\$(grep -c 'PRIVATE KEY' \$A)\" = 0
test \"\$(grep -cvE '^[A-Za-z_][A-Za-z0-9_]*=|^\s*#|^\s*\$' \$A)\" = 0
test \"\$(grep -c '^ALERT_EMAIL=' \$A)\" = 0
test -d /var/www/wavemax/env-backups
cp -p \$A /var/www/wavemax/env-backups/.env.$TS
cmp \$A /var/www/wavemax/env-backups/.env.$TS && echo BACKUP_IDENTICAL
test \"\$(grep -c 'PRIVATE KEY' /var/www/wavemax/env-backups/.env.$TS)\" = 0 && echo BACKUP_IS_POST_PURGE
PRESENT=\$(grep -cE '^($REMOVE)=' \$A)
T=\$(mktemp); trap 'rm -f \$T' EXIT
grep -vE '^($REMOVE)=' \$A > \$T
if [ '${ENV29_BACKEND_URL}' = delete ]; then sed -i '/^BACKEND_URL=/d' \$T
else sed -i 's|^BACKEND_URL=.*|BACKEND_URL=https://portal.atxwashdryfold.com|' \$T; fi
if [ '${ENV29_DEFAULT_ADMIN}' = change ]; then sed -i 's|^DEFAULT_ADMIN_EMAIL=.*|DEFAULT_ADMIN_EMAIL=admin@crhsent.com|' \$T; fi
echo 'ALERT_EMAIL=admin@crhsent.com' >> \$T
cat \$T > \$A
AFTER=\$(grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' \$A | tr -d '=' | sort -u | wc -l)
EXPECT=\$(( BEFORE - PRESENT + 1 ))
[ '${ENV29_BACKEND_URL}' = delete ] && EXPECT=\$(( EXPECT - 1 ))
echo \"BEFORE=\$BEFORE PRESENT=\$PRESENT AFTER=\$AFTER EXPECT=\$EXPECT\"
test \"\$AFTER\" = \"\$EXPECT\" && echo ARITHMETIC_OK
echo ENV29_WRITTEN"
```
  - Expected: `REMOVE=<pipe-joined list>`, `TS=<…>`, `BACKUP_IDENTICAL`, `BACKUP_IS_POST_PURGE`,
    `BEFORE=<n> PRESENT=<m> AFTER=<n-m+1> EXPECT=<same>`, `ARITHMETIC_OK`, `ENV29_WRITTEN`.
  - **The arithmetic is derived, never pinned**: `AFTER == BEFORE − PRESENT + 1` (`−1` more if
    `BACKEND_URL` was deleted). A key-count literal would be stale the moment task 17 or 25 changed
    what is dead — which is exactly what happened to slice E's `85 → 83 → 59`.
  - Any other output: nothing was written — every `set -e` precondition runs before `cat $T > $A`.
    Compare the failing premise against Step 1, then **STOP**.
```bash
# substitute the three numbers the previous command printed on its BEFORE=/PRESENT=/AFTER= line
rec "ENV29_BEFORE_$BOX" "<BEFORE>"; rec "ENV29_AFTER_$BOX" "<AFTER>"; rec "ENV29_REMOVED_$BOX" "<PRESENT>"
```

- [ ] **Step 4: [read-only] Verify the file. No reload in this step (C-6).**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
A=/var/www/wavemax/wavemax-affiliate-program/.env
test \"\$(grep -cE '^($REMOVE)=' \$A)\" = 0                       && echo DEAD_KEYS_GONE
test \"\$(grep -c 'PRIVATE KEY' \$A)\" = 0                        && echo NO_KEY_MATERIAL
test \"\$(grep -cvE '^[A-Za-z_][A-Za-z0-9_]*=|^\s*#|^\s*\$' \$A)\" = 0 && echo NO_ORPHAN_LINES
test \"\$(grep -cx 'ALERT_EMAIL=admin@crhsent.com' \$A)\" = 1      && echo ALERT_EMAIL_SET
test \"\$(grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' \$A | sort | uniq -d | wc -l)\" = 0 && echo NO_DUPLICATE_KEYS
cd /var/www/wavemax/wavemax-affiliate-program && node -e '
require(\"dotenv\").config();
const need=[\"MONGODB_URI\",\"JWT_SECRET\",\"ENCRYPTION_KEY\",\"SESSION_SECRET\",\"CSRF_SECRET\",\"EMAIL_HOST\",\"EMAIL_PORT\",\"EMAIL_USER\",\"EMAIL_FROM\",\"EMAIL_PASS\",\"BASE_URL\",\"CORS_ORIGIN\",\"ALERT_EMAIL\",\"LOG_DIR\"];
const missing=need.filter(k=>!process.env[k]||!String(process.env[k]).length);
if(missing.length){console.log(\"MISSING \"+missing.join(\",\"));process.exit(1)}
console.log(\"ENV_OK\")'"
```
  - Expected, six lines: `DEAD_KEYS_GONE`, `NO_KEY_MATERIAL`, `NO_ORPHAN_LINES`, `ALERT_EMAIL_SET`,
    `NO_DUPLICATE_KEYS`, `ENV_OK`.
  - `MISSING <keys>` means the filter over-deleted: run this box's Rollback **immediately**, then STOP.
    (Slice E ran this check and the `pm2 reload` in one ungated block with no `set -e`, so a `false`
    printed *after* the portal had already been reloaded with a broken `.env` — P4.)

- [ ] **Step 5: Reload and prove the app is healthy. This box only.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'set -e
J() { pm2 jlist | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.parse(s).filter(p=>p.name===\"wavemax\").map(p=>p.pm2_env.status+\":\"+p.pm2_env.restart_time).join(\" \")))"; }
echo "before=$(J)"
pm2 reload wavemax --update-env >/dev/null; sleep 8
echo "after=$(J)"
curl -s -o /dev/null -w "health=%{http_code}\n" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/health
cd /var/www/wavemax/wavemax-affiliate-program && node -e "
require(\"dotenv\").config();
const b=process.env.BASE_URL, f=process.env.FRONTEND_URL;
const src=require(\"fs\").readFileSync(\"server/services/passwordResetService.js\",\"utf8\");
const usesBase=/process\.env\.BASE_URL\}\/embed-app-v2/.test(src);
console.log(\"BASE_URL=\"+b+\" FRONTEND_URL=\"+(f===undefined?\"unset\":f)+\" uses_base_url=\"+usesBase);
process.exit(b && f===undefined && usesBase ? 0 : 1)"'
```
  - Expected: `before=online:<n> online:<n>`, `after=online:<n+1> online:<n+1>` (**both workers'
    restart counts exactly one higher than before** — never a literal `1`, P25), `health=200`, and
    `BASE_URL=https://portal.atxwashdryfold.com FRONTEND_URL=unset uses_base_url=true`.
  - **This replaces slice E's `tail -n 200 logs/combined.log | grep -ci 'FRONTEND_URL|undefined/…'`,
    which printed `0` on a healthy box *and* on a box that had just been broken** — the app never logs
    that string and no reset email is minted in an 8-second window (P16, assertion-that-cannot-fail #1).
    The replacement reads the three facts that actually decide it, and exits non-zero on any of them.
  - A `status` other than `online`, a non-200, or a non-zero exit — run this box's Rollback and STOP.
    **Do not start box 2.**
```bash
EV=/var/www/wavemax/cutover-logs; sed -i '/^BOX_BUSY=/d' "$EV/plan3-record.env"    # clear the lock
```
  - Then repeat Steps 3–5 for `BOX=oci2; IP=144.24.4.202`.

- [ ] **Step 6: Quarantine the two pre-purge backups (both boxes). Never delete without the word.**
```bash
for IP in 161.153.71.201 144.24.4.202; do echo "== $IP =="; ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'set -e
D=/var/www/wavemax/env-backups; mkdir -p $D/quarantine; chmod 700 $D/quarantine
for f in $D/env.bak.*; do [ -e "$f" ] || continue
  if [ "$(grep -c "PRIVATE KEY" "$f")" -gt 0 ]; then mv "$f" $D/quarantine/ && chmod 600 $D/quarantine/$(basename "$f"); fi
done
echo "quarantined=$(ls -1 $D/quarantine 2>/dev/null | wc -l) remaining_with_key=$(grep -l "PRIVATE KEY" $D/*.env* $D/.env.* 2>/dev/null | wc -l)"'; done
```
  - Expected per box: `quarantined=2 remaining_with_key=0`. [MEASURED: both boxes hold exactly two such
    files today, each with 2 `PRIVATE KEY` lines and 10 `DOCUSIGN_*` keys.]
  - Shredding is **owner-gated** (`ENV29_SHRED_PREPURGE`). On `yes`, and only then:
    `shred -u <file>` per file, then re-run the counts. On `no`, they stay quarantined and the fact
    becomes an ESCALATIONS row in task 35.

- [ ] **Step 7: The repo companions (one commit).**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; cd "$AFF"
grep -n "'DocuSign':" public/assets/js/administrator-dashboard-init.js
grep -n "DOCUSIGN_WEBHOOK_SECRET" scripts/admin/rotate-credentials.sh
```
  - Expected [MEASURED]: one line at `administrator-dashboard-init.js:2669`, and **3** lines in
    `rotate-credentials.sh` (`:48`, `:56`, `:78`) — slice E said four; derive, do not pin.
  - Write the guard test **first** and be honest about what it is: `ALLOWED_ENV_VARS` already contains
    no `DOCUSIGN_` row and task 28 already removed `FRONTEND_URL`, so a guard over those two **cannot
    fail first** (X30). Make it red for a reason that is true: assert the **dashboard grouping** and
    the **rotate script** carry no `DOCUSIGN_`, which they do today.
```bash
cd "$AFF" && npx jest tests/unit/envAllowlistGuard.test.js 2>&1 | tail -8   # RED: 1 failed
# … delete the grouping and the three references …
npx jest tests/unit/envAllowlistGuard.test.js 2>&1 | tail -4                 # GREEN: 1 passed
grep -rc "DOCUSIGN" server/ public/ scripts/ --include=* 2>/dev/null | grep -v ':0' | wc -l
npm test 2>&1 | tail -8
git add -A && git commit -m "chore(env): delete the DocuSign remnants and guard the env allowlist

The keys themselves left production on 2026-09-21; these are the three places
the repo still named them: the admin panel's DocuSign env grouping and three
DOCUSIGN_WEBHOOK_SECRET references in the rotation script. A guard test fails if
any of the retired third-party groups grows back.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: the RED/GREEN pair, then `0` files mentioning `DOCUSIGN`, then the suite at its baseline.
  - `public/privacy-policy.html:88` still names **DocuSign** as a service provider that receives
    customer data. That is a **legal text** — it is **not** edited here; it is an ESCALATIONS row for
    Rick/counsel (task 35).

---

### Task 30: the submission-port churn is ours — `checkSMTP()` connects and destroys, in every worker

> **Self-inflicted and identified.** `server/monitoring/connectivity-monitor.js` `checkSMTP()` opens a
> raw `net.Socket` to `EMAIL_HOST:EMAIL_PORT` and calls `client.destroy()` on the `'connect'` event
> (`:104-113`) — it never speaks SMTP and never sends `QUIT`. That is exactly postfix's
> `lost connection after CONNECT … commands=0/0`. `startMonitoring()` is called from `server.js:1062`
> inside `app.listen`, so **every pm2 worker runs its own 60-second cycle** [MEASURED:
> `MONITORING_CONFIG.checkInterval = 60000` at `:10`, 2 `wavemax` workers per box, 2 boxes]. Slice E
> measured the result: **91.8 %** of the mail host's submission log (3,672 of 4,000 lines over 5 h 02 m)
> is this probe, at a fixed second offset per box (oci1 `:50`, oci2 `:24`) — the signature of a timer,
> not of traffic. The `Mailcow SMTP` service entry is `critical: false`, so it never alerts: the
> probe's only consumer is the `/monitoring/status` tile.

**Files:** `tests/unit/connectivityMonitor.test.js` (new) · `server/monitoring/connectivity-monitor.js`.

**Interfaces:**
- Consumes — asserted in Step 1, halting: the deployed `checkInterval`, worker count and
  `EMAIL_HOST`/`EMAIL_PORT` on **both** boxes, and the arithmetic
  `connections/min/box = workers × 60000 ms⁻¹ = 2` matching the measured rate. If the arithmetic does
  not match the log, the identification is wrong and the fix is premature — STOP.
- Produces: a probe that closes with `QUIT`, runs in **one** worker, every 5 minutes —
  4 connections/min across the estate → **0.2/min**; `MONITORING_CONFIG` exported;
  `startMonitoring()` returning a boolean and an `unref()`-able timer.
- **This task's deploy step is also what carries tasks 25–29's commits to the boxes** — the first and
  only `git pull` in phases 4–5. Step 4 asserts exactly which commits arrive.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git revert --no-edit <task-30 sha>
npx jest tests/unit/connectivityMonitor.test.js 2>&1 | tail -3
for IP in 161.153.71.201 144.24.4.202; do ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'set -e -o pipefail
cd /var/www/wavemax/wavemax-affiliate-program && git pull --ff-only | tail -2 && git log --oneline -1
pm2 reload wavemax >/dev/null && sleep 8
curl -sf -o /dev/null -w "%{http_code}\n" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/health'; done
```
- Rollback expected: the revert line, the new suite **failing** (the reverted code sends no `QUIT`),
  then per box the pull summary, the reverted SHA and `200`. One box at a time (C-7).
- Behaviour-only: no `.env` is involved, so `--update-env` is not needed.

- [ ] **Step 1: Re-prove the source on the boxes and the share on the mail host (read-only).**
```bash
for IP in 161.153.71.201 144.24.4.202; do echo "== $IP =="
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'R=/var/www/wavemax/wavemax-affiliate-program
grep -n "checkInterval\|startMonitoring()" $R/server/monitoring/connectivity-monitor.js | head -3
grep -nE "^EMAIL_(HOST|PORT)=" $R/.env
pm2 jlist | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(\"workers=\"+JSON.parse(s).filter(p=>p.name===\"wavemax\").length))"'; done
EV=/var/www/wavemax/cutover-logs
sudo ssh wavemax-promo 'L=$(docker logs --tail 4000 mailcowdockerized-postfix-mailcow-1 2>&1)
echo "WINDOW_START $(printf "%s" "$L" | head -1 | cut -c1-15)"
echo "WINDOW_END   $(printf "%s" "$L" | tail -1 | cut -c1-15)"
echo "OCI1_LINES   $(printf "%s" "$L" | grep -c 161.153.71.201)"
echo "OCI2_LINES   $(printf "%s" "$L" | grep -c 144.24.4.202)"
echo "TOTAL_LINES  $(printf "%s" "$L" | wc -l)"
echo "OURS_0_0     $(printf "%s" "$L" | grep -E "161.153.71.201|144.24.4.202" | grep -c "commands=0/0")"
printf "%s" "$L" | grep "144.24.4.202" | grep "connect from" | awk "{print substr(\$3,7,2)}" | sort | uniq -c | sort -rn | head -3' | tee "$EV/plan3-smtp-churn.txt"
```
  - Expected: per box `checkInterval: 60000`, `startMonitoring()`, `EMAIL_HOST=158.62.198.7`,
    `EMAIL_PORT=587`, `workers=2`; then a window of a few hours, `OCI1_LINES`+`OCI2_LINES` ≈ 90 % of
    `TOTAL_LINES`, `OURS_0_0` ≈ (OCI1+OCI2)/3, and a histogram with **one dominant second offset**.
  - ⚠️ `docker compose logs --since` returns **nothing** on this host — `--tail N` is the only form
    that works (C-9). Several second-offsets, or a rate far above 2/min/box, means something else is
    also probing — STOP and investigate before changing code.
  - Confirm real mail still completes in the same window (the churn must not be masking a failure):
    `sudo ssh wavemax-promo 'docker logs --tail 4000 mailcowdockerized-postfix-mailcow-1 2>&1 | grep -E "sasl_username|status=sent|status=bounced" | tail -10'`.
    Any `status=bounced` or `authentication failed` for `no-reply@crhsent.com` is a **higher-priority
    separate finding** (the 2026-08-23 shape) — surface it before continuing.

- [ ] **Step 2: RED — three failing tests.** `tests/unit/connectivityMonitor.test.js` stands up a
      local `net` server that speaks a 220 banner, and asserts: (1) `checkService({type:'smtp'})`
      sends `QUIT` and resolves `success:true`; (2) `MONITORING_CONFIG.checkInterval >= 300000`;
      (3) `startMonitoring()` returns `false` when `NODE_APP_INSTANCE !== '0'` and `true` when it is.
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npx jest tests/unit/connectivityMonitor.test.js 2>&1 | tail -20
```
  - Expected: `Tests: 3 failed, 3 total`. (1) the server never saw `/QUIT/i`; (2)
    `TypeError: Cannot read properties of undefined (reading 'checkInterval')` — **`MONITORING_CONFIG`
    is not exported today** [MEASURED: the export list is `startMonitoring, getMonitoringStatus,
    getMonitoringDashboard, checkService, checkMongoDB, runMonitoringCycle, SERVICES, monitoringData`];
    (3) `startMonitoring()` returns `undefined`.
  - Anything passing here — STOP, the test is not reaching the real module.
  - ⚠️ `startMonitoring()` currently leaks a live `setInterval`. The implementation must **return** the
    timer and the test must `unref()`/`clearInterval` it, or the suite cannot exit without
    `--forceExit`.

- [ ] **Step 3: GREEN — three defects, one fix each.**
  1. `client.destroy()` on connect → write `QUIT\r\n`, wait for the `221`, let the server close.
     Postfix then logs `commands=1/1` and a clean disconnect: **the log tells the truth**.
  2. every worker runs the cycle → gate `startMonitoring()` on
     `process.env.NODE_APP_INSTANCE === undefined || process.env.NODE_APP_INSTANCE === '0'`
     (pm2 sets it per worker; `undefined` outside pm2, so a bare `node server.js` still monitors).
     ⚠️ `RUN_BACKGROUND_JOBS` is **not** the hook — nothing reads it and task 29 deletes it.
  3. 60 s for a `critical:false` probe → **300 s**.
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npx jest tests/unit/connectivityMonitor.test.js 2>&1 | tail -6
npx eslint server/monitoring/connectivity-monitor.js
npm test 2>&1 | tail -8
git add -A && git commit -m "fix(monitoring): the SMTP probe speaks SMTP, in one worker, every 5 minutes

checkSMTP() opened a socket and destroyed it on connect without saying a word,
in every pm2 worker, every 60 s: 2 connections/min/box, 4 across the estate, and
91.8% of the mail host's submission log was this probe reporting commands=0/0.

- QUIT instead of destroy, so postfix logs commands=1/1 and a clean disconnect.
- startMonitoring() is a no-op outside pm2 worker 0 (returns a boolean; the
  interval timer is returned so tests can unref it).
- checkInterval 60s -> 300s for a probe that is critical:false and feeds only
  the /monitoring/status tile.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: `Tests: 3 passed`, eslint silent, the full suite at its baseline.

- [ ] **Step 4: Deploy oci1 — and record exactly which of this plan's commits land.**
```bash
IP=161.153.71.201; BOX=oci1        # pass 2: IP=144.24.4.202; BOX=oci2 — only after this box prints 200
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
test -z "${BOX_BUSY:-}" || { echo "STOP: BOX_BUSY=$BOX_BUSY"; exit 1; }
printf 'BOX_BUSY=%s\n' "$BOX" >> "$REC"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'set -e -o pipefail
cd /var/www/wavemax/wavemax-affiliate-program
BEFORE=$(git rev-parse HEAD)
git pull --ff-only | tail -2
AFTER=$(git rev-parse HEAD)
echo "before=$BEFORE after=$AFTER"
git log --oneline $BEFORE..$AFTER | cat
grep -c "process.env.BASE_URL}/embed-app-v2.html" server/services/passwordResetService.js
grep -c "rate_limits" server/services/systemHealthService.js server/routes/administratorRoutes.js || true
node -e "const m=require(\"./server/monitoring/connectivity-monitor\");console.log(\"interval=\"+m.MONITORING_CONFIG.checkInterval)"
pm2 reload wavemax >/dev/null; sleep 8
curl -sf -o /dev/null -w "health=%{http_code}\n" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/health'
sed -i '/^BOX_BUSY=/d' "$REC"
```
  - Expected: a `before=… after=…` pair that differ; a commit list containing **tasks 25, 26, 27, 28,
    29 and 30's commits** (this is the deploy that carries all of phases 4–5 — nothing earlier in
    these two phases touched a box's code); `1` for the `BASE_URL` reset link; `…:0` for both
    `rate_limits` greps; `interval=300000`; `health=200`.
  - Anything else — **STOP** before box 2. `git pull --ff-only` is inside `set -e -o pipefail`, so a
    failed pull cannot reach `pm2 reload` (P6: slice E's `git pull … | tail -2 && pm2 reload` tested
    `tail`'s status and would have reloaded the **old** code while reporting success).

- [ ] **Step 5: Deploy oci2, then mark the observation window.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env
MARK=$(sudo ssh wavemax-promo 'docker logs --tail 1 mailcowdockerized-postfix-mailcow-1 2>&1 | tail -1')
printf 'SMTP_MARK=%q\n' "$MARK" >> "$REC"; printf 'SMTP_MARK_AT=%s\n' "$(date -u +%Y%m%dT%H%M%SZ)" >> "$REC"
echo "MARK=$MARK"
```
  - Expected: a non-empty postfix log line and a timestamp. **No foreground `sleep` here** (C-12): the
    verification is Step 6, run at least **11 minutes** later (two probe cycles at the new interval)
    in a later turn or behind a `Monitor` until-loop.

- [ ] **Step 6: Prove the log went quiet — scoped to lines AFTER the marker.**
```bash
EV=/var/www/wavemax/cutover-logs; set -a; . "$EV/plan3-record.env"; set +a
test -n "$SMTP_MARK" || { echo "STOP: no SMTP_MARK recorded"; exit 1; }
sudo ssh wavemax-promo "docker logs --tail 6000 mailcowdockerized-postfix-mailcow-1 2>&1 | awk -v m='$SMTP_MARK' '
  \$0==m { found=1; next } found { print }
  END { if (!found) print \"MARKER_NOT_FOUND\" > \"/dev/stderr\" }'" > /tmp/postfix-after.txt
echo "lines_after_marker=$(wc -l < /tmp/postfix-after.txt)"
echo "ours_commands_0_0=$(grep -E '161.153.71.201|144.24.4.202' /tmp/postfix-after.txt | grep -c 'commands=0/0')"
echo "ours_commands_1_1=$(grep -E '161.153.71.201|144.24.4.202' /tmp/postfix-after.txt | grep -c 'commands=1/1')"
```
  - Expected: **no `MARKER_NOT_FOUND` on stderr**; `lines_after_marker` > 0;
    **`ours_commands_0_0` = 0**; `ours_commands_1_1` ≥ 1 (the polite probe, ~2 per 5 min estate-wide).
  - `MARKER_NOT_FOUND` means the marker scrolled out of a 6,000-line tail — **the count is then
    meaningless and must not be read as a pass**. Re-mark and wait again, or raise the tail. (Without
    this guard the awk prints nothing and every count is `0`, i.e. an assertion that passes on a
    broken system — the exact class R-9 exists to remove.)
  - `ours_commands_0_0` still climbing at the old cadence means a box did not pick up the new code:
    check `git log -1` there.

---

### Task 31: `ofelia` is **actively OOM-killed**, not "near its cap" — **HUMAN-CONFIRM** the cap decision

> **What hid it.** `docker inspect … .State.OOMKilled` reads **`false`** — that field describes only
> the container's **last exit**, and docker restarts it cleanly each time. The truth is `RestartCount`.
> **[MEASURED 2026-09-21 23:59 UTC]** `restarts=25 oomkilled=false exit=0 mem=268435456
> memswap=335544320 image=mcuadros/ofelia:latest`, memory `202.8MiB / 256MiB (79.21 %)` at 2 h 02 m of
> uptime. Slice E measured `RestartCount=6` on 2026-09-20 — **19 more restarts in ~25 hours**, i.e. a
> kill roughly every 80 minutes, continuous. `free -m` shows **2131 MiB available**; the two
> `mem_limit: 256m` entries in the override are ofelia and SoGo.
>
> ⚠️ **The kernel log is volatile.** Slice E's gate ("a `task=ofelia` count of 3 or more") reads **1**
> today — the ring buffer rotated. This task gates on the **monotone** `RestartCount` delta and the
> memory trend, and treats `dmesg` as corroboration when it happens to be there. A cap raise **doubles
> the interval between kills; it does not fix the leak** — say that to the owner, do not imply a fix.

**Files:** mail host only — `/opt/mailcow-dockerized/docker-compose.override.yml`, backed up to
`…override.yml.<TS>.bak`. Recreates exactly one container.

**Interfaces:**
- Consumes — asserted in Step 1, halting: mail-host access; `RestartCount` readable; the override is a
  **local** file (upstream mailcow ships none), so raising a cap is our decision, not a fork; and
  `free -m` available ≥ 1024 MiB before adding 256 MiB.
- Produces: `OFELIA_RESTARTS_BEFORE`, `OFELIA_GROWTH_MIB_PER_MIN`, `OFELIA_DECISION`,
  `OFELIA_RESTARTS_AT_RECREATE`, and (24 h later) `OFELIA_STABLE=yes|no`.

**Rollback (exact).**
```bash
sudo ssh wavemax-promo 'set -e
cd /opt/mailcow-dockerized
TS=$(ls -1t docker-compose.override.yml.*.bak | head -1 | sed "s/.*yml\.\(.*\)\.bak/\1/")
echo "restoring $TS"
cp -p docker-compose.override.yml.$TS.bak docker-compose.override.yml
grep -A2 "ofelia-mailcow:" docker-compose.override.yml
docker compose config --quiet && echo COMPOSE_VALID
docker compose up -d ofelia-mailcow
sleep 10
docker inspect mailcowdockerized-ofelia-mailcow-1 --format "mem={{.HostConfig.Memory}} status={{.State.Status}}"'
```
- Rollback expected: `restoring <TS>`, the `mem_limit: 256m` / `memswap_limit: 320m` pair,
  `COMPOSE_VALID`, then `mem=268435456 status=running`.

- [ ] **Step 1: Sample 1 — restarts, memory, cap, headroom (read-only).**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env
sudo ssh wavemax-promo 'date -u +%FT%TZ
docker inspect mailcowdockerized-ofelia-mailcow-1 --format "restarts={{.RestartCount}} oomkilled={{.State.OOMKilled}} exit={{.State.ExitCode}} mem={{.HostConfig.Memory}} memswap={{.HostConfig.MemorySwap}} image={{.Config.Image}} started={{.State.StartedAt}}"
docker stats --no-stream --format "{{.Name}} {{.MemUsage}} {{.MemPerc}}" mailcowdockerized-ofelia-mailcow-1
echo "dmesg_task_ofelia=$(sudo dmesg -T 2>/dev/null | grep -c "task=ofelia")"
grep -c "mem_limit: 256m" /opt/mailcow-dockerized/docker-compose.override.yml
free -m | sed -n 2p' | tee "$EV/plan3-ofelia.txt"
```
  - Expected: `restarts=` **≥ 25** and rising over time, `oomkilled=false` (expected, and **not**
    evidence of health), `mem=268435456 memswap=335544320 image=mcuadros/ofelia:latest`, a
    `MemUsage` line, `dmesg_task_ofelia=` any value (**0 or 1 is normal — the buffer rotates**), `2`
    (ofelia + SoGo share the 256m value), and an available column ≥ 1024.
  - Record `OFELIA_RESTARTS_BEFORE=<restarts>` and the sample time.

- [ ] **Step 2: Sample 2 — the growth rate, five minutes of remote samples.**
      *(Run this call with a 420 s tool timeout; the loop sleeps on the mail host, not in the harness.)*
```bash
sudo ssh wavemax-promo 'for i in 1 2 3 4 5 6; do
  printf "%s %s\n" "$(date -u +%H:%M:%S)" "$(docker stats --no-stream --format "{{.MemUsage}}" mailcowdockerized-ofelia-mailcow-1)"
  [ $i -lt 6 ] && sleep 60
done
docker inspect mailcowdockerized-ofelia-mailcow-1 --format "restarts_now={{.RestartCount}}"'
```
  - Expected: six samples climbing monotonically, and a `restarts_now=` value. Record
    `OFELIA_GROWTH_MIB_PER_MIN = (last − first) / 5`.
  - A **flat** series means the leak is not time-driven — record it and re-scope before changing a cap.
  - A `restarts_now` **higher** than Step 1's is the kill loop caught in the act: record it verbatim,
    it is the strongest evidence in this task and it does not depend on `dmesg`.

- [ ] **Step 3 (HUMAN-CONFIRM): Ask Rick.** Say exactly this:

  > The `ofelia` container on the mail box isn't "near" its limit — it is **being OOM-killed on a
  > loop**. Docker's own `OOMKilled` flag says `false`, which is what hid it: that flag describes only
  > the last exit, and docker restarts the container cleanly each time. The number that tells the truth
  > is the restart count: **6 yesterday, 25 today** — about one kill every 80 minutes, and it has been
  > doing this for as long as I can see back.
  >
  > `ofelia` is mailcow's cron scheduler — seven jobs a minute (imapsync, replication health, SoGo
  > session expiry, log trimming). They are idempotent and re-run within a minute, so the only cost is
  > an in-flight job lost at each kill. Nothing visible has broken; that is why nobody noticed.
  >
  > The 256 MiB cap is **ours**, in a local `docker-compose.override.yml` next to caps for rspamd, SoGo
  > and php-fpm — not something mailcow ships. The box has about 2 GiB free.
  >
  > I want to **raise `ofelia` to 512 MiB** (swap 640) and recreate that one container — about ten
  > seconds of no cron, nothing else touched, reversible by restoring one file. **That roughly doubles
  > the time between kills. It does not fix the leak.** If it still gets killed at 512 MiB, the real
  > answer is pinning and upgrading off `mcuadros/ofelia:latest`, which I would rather do as its own
  > change than bundle in here. Proceed with the cap raise?

  Record `OFELIA_DECISION=raise-512|pin-image|document-only`. On `document-only` this task stops here
  and the leak becomes an ESCALATIONS row with an owner — an honest outcome, not a silent one.

- [ ] **Step 4 (HUMAN-CONFIRM): Back up and edit — only on `raise-512`. Nothing is recreated yet.**
```bash
sudo ssh wavemax-promo 'set -e
cd /opt/mailcow-dockerized
TS=$(date -u +%Y%m%dT%H%M%SZ); echo "TS=$TS"
test "$(grep -c "mem_limit: 256m" docker-compose.override.yml)" = 2
cp -p docker-compose.override.yml docker-compose.override.yml.$TS.bak
docker ps -a --format "{{.Names}} {{.State}}" | sort > /tmp/mailcow-before.txt
wc -l < /tmp/mailcow-before.txt
python3 - <<'"'"'PY'"'"'
import re
p = "docker-compose.override.yml"
s = open(p).read()
s2, n = re.subn(r"(ofelia-mailcow:\s*\n\s*mem_limit: )256m(\s*\n\s*memswap_limit: )320m", r"\g<1>512m\g<2>640m", s)
assert n == 1, f"ofelia mem_limit substitution matched {n} times, expected 1"
open(p, "w").write(s2)
print("SUBSTITUTED", n)
PY
grep -A2 "ofelia-mailcow:" docker-compose.override.yml
grep -A2 "sogo-mailcow:" docker-compose.override.yml | grep mem_limit
docker compose config --quiet && echo COMPOSE_VALID'
```
  - Expected: `TS=<…>`, a container count (~18–20), `SUBSTITUTED 1`, then `ofelia-mailcow:` /
    `mem_limit: 512m` / `memswap_limit: 640m`, SoGo still `mem_limit: 256m`, `COMPOSE_VALID`.
  - The heredoc is **quoted** (`<<'PY'`) so the remote shell cannot expand the python body, and the
    substitution **asserts it matched exactly once** — `re.sub` silently writes the file back unchanged
    when the pattern misses (P27). The `assert` is what makes this step falsifiable.
  - `COMPOSE_VALID` missing → restore the `.bak` and STOP; the running container is untouched.

- [ ] **Step 5: Recreate only `ofelia`, and prove nothing else moved.**
```bash
sudo ssh wavemax-promo 'cd /opt/mailcow-dockerized
docker compose up -d ofelia-mailcow 2>&1 | tail -3
sleep 15
docker inspect mailcowdockerized-ofelia-mailcow-1 --format "mem={{.HostConfig.Memory}} memswap={{.HostConfig.MemorySwap}} status={{.State.Status}} restarts={{.RestartCount}}"
docker inspect mailcowdockerized-sogo-mailcow-1 --format "sogo_mem={{.HostConfig.Memory}} status={{.State.Status}}"
docker ps -a --format "{{.Names}} {{.State}}" | sort > /tmp/mailcow-after.txt
echo "--- diff (expect only the ofelia line, if any) ---"; diff /tmp/mailcow-before.txt /tmp/mailcow-after.txt || true
echo "not_running=$(grep -vc " running$" /tmp/mailcow-after.txt)"
docker logs --tail 15 mailcowdockerized-ofelia-mailcow-1 2>&1 | tail -5'
```
  - Expected: `mem=536870912 memswap=671088640 status=running restarts=0`;
    `sogo_mem=268435456 status=running`; a diff showing **only** the ofelia line (or nothing);
    `not_running=0`; and ofelia logging jobs `Started`/`Finished`.
  - **`docker ps` alone cannot show a container that died — it vanishes and every remaining line still
    says `Up`** (P17, assertion-that-cannot-fail #3). The before/after `docker ps -a` diff plus
    `not_running` is what actually discriminates.
  - Record `OFELIA_RESTARTS_AT_RECREATE=0`.

- [ ] **Step 6: Prove the kills stopped — 24 hours later, not the same minute.**
```bash
sudo ssh wavemax-promo 'date -u +%FT%TZ
docker inspect mailcowdockerized-ofelia-mailcow-1 --format "started={{.State.StartedAt}} restarts={{.RestartCount}}"
docker stats --no-stream --format "{{.Name}} {{.MemUsage}} {{.MemPerc}}" mailcowdockerized-ofelia-mailcow-1
sudo dmesg -T 2>/dev/null | grep "task=ofelia" | tail -3'
```
  - Expected after ≥ 24 h: **`restarts=0`** (unchanged from Step 5's recorded value), memory **below
    512 MiB**, and no `task=ofelia` line newer than Step 5's timestamp.
  - `restarts` above `OFELIA_RESTARTS_AT_RECREATE`, or a newer kernel kill: the leak outruns 512 MiB →
    record `OFELIA_STABLE=no` and escalate option **B** (pin and upgrade the image) as an
    ESCALATIONS row with an owner — **not** as a silent carry-over.

---

### Task 32: H-1's CR/LF residue — reject CR/LF in the fields that reach a mail Subject (`crhs-corporate`)

> **Severity LOW, and the task says so.** H-1b made the four intake paths opt out of web-core's XSS
> input-stripper (`server/config/sanitizeExemptions.js`), because it was truncating lead copy at the
> first `<`; the control moved to output escaping, which covers the body but **not the headers**.
> `firstName`, `lastName` and `businessName` are interpolated into the mail `Subject`
> [MEASURED: `server/services/partnerInquiryService.js:17` — `` `Partner inquiry · ${businessName || fullName}` ``;
> `server/services/affiliateApplicationService.js:15` — `` `Affiliate application · ${firstName} ${lastName}` ``]
> and are validated only by `.isString().trim().isLength({min:1,max:50})` in **both** routers, so an
> **interior** `"Jane\r\nBcc: x@y.z"` passes today. `email` is already safe (`isEmail()` rejects CR/LF).
> Installed **nodemailer 8.0.11** [MEASURED] folds CR/LF to a space in unstructured headers, so this is
> **defence-in-depth plus a pin** — not a live injection. The pin is the valuable half: it turns an
> undocumented library behaviour we rely on into a test that fails loudly if an upgrade changes it.

**Files:** `crhs-corporate` — `tests/intakeHardening.test.js` (extend), `server/routes/partnerInquiryRoutes.js`,
`server/routes/affiliateApplicationRoutes.js`. **No new error code, so no locale change** (see below).

**Interfaces:**
- Consumes — asserted in Step 1, halting: the H-1b exemption exists (`skipsInputSanitizer` returns
  `true` for the four intake paths); nodemailer is **8.0.11**; both subject interpolations are present.
- Produces: intake validators that reject CR/LF in every header-bound field, plus a regression test that
  fails if nodemailer ever stops folding CR/LF — at which point the validator is the only control left.
- **Design note, settled here, not asked:** a distinct coded error would be a tenth intake code and
  `9 → 10` leaves × 4 locales, moving the `EXPECTED_PARTNER_LEAVES` assertion. A CR/LF in a name is not
  a mistake a real lead makes. **Reuse** the existing `firstNameLength` / `lastNameLength` codes by
  putting `.matches(/^[^\r\n]*$/)` in the same chain, sharing its `withMessage`. Locale parity is
  unchanged, so no copy sign-off is needed.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && git revert --no-edit <task-32 sha>
npx jest tests/intakeHardening.test.js 2>&1 | tail -4
```
- Rollback expected: the revert line, then the CR/LF cases failing with `Expected: 400  Received: 200`.

- [ ] **Step 1: Assert the Consumes rows.**
```bash
CORP=/mnt/c/Users/rickh/GitHub/crhs-corporate; cd "$CORP"
node -e "console.log('nodemailer='+require('nodemailer/package.json').version)"
node -e "const {skipsInputSanitizer}=require('./server/config/sanitizeExemptions');
console.log('exempt='+['/api/partner-inquiry','/api/affiliate-application','/api/v1/partner-inquiry','/api/v1/affiliate-application'].every(skipsInputSanitizer));"
grep -c 'Partner inquiry · ${businessName || fullName}' server/services/partnerInquiryService.js
grep -c 'Affiliate application · ${firstName} ${lastName}' server/services/affiliateApplicationService.js
grep -c 'isString().trim()' server/routes/partnerInquiryRoutes.js server/routes/affiliateApplicationRoutes.js
npm test 2>&1 | tail -4 | tee /tmp/corp-baseline.txt
npm run check:i18n | tail -2 | tee /tmp/corp-i18n-before.txt
```
  - Expected: `nodemailer=8.0.11`; `exempt=true`; `1`; `1`; a non-zero count in **both** routers; the
    suite green; and a parity line recorded as the **before** value (never pinned in this document).
  - `exempt=false` means H-1b was reverted and the input stripper is back — the residue this task
    addresses no longer exists in the same form. STOP and re-scope.

- [ ] **Step 2: RED — the CR/LF cases, plus the nodemailer pin.** Append to `tests/intakeHardening.test.js`,
      matching the file's existing conventions (`request(app).post(p).set('Host','atxwashdryfold.com')`,
      the `mockSendEmail` proxy mock at the top of the file):
```js
// H-1 residue (Plan 3 task 32): the intake routes opt out of the input sanitizer
// (H-1b), and firstName/lastName/businessName land in the mail Subject. Reject
// CR/LF there, and pin the nodemailer behaviour we currently rely on.
describe('task 32: CR/LF cannot reach a mail header', () => {
  const post = (p, body) => request(app).post(p).set('Host', 'atxwashdryfold.com').send(body);
  const lead = { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '5125551212' };
  const inject = 'Jane\r\nBcc: victim@evil.com';

  test.each([
    ['/api/partner-inquiry', 'firstName'],
    ['/api/partner-inquiry', 'lastName'],
    ['/api/partner-inquiry', 'businessName'],
    ['/api/affiliate-application', 'firstName'],
    ['/api/affiliate-application', 'lastName']
  ])('%s rejects CR/LF in %s', async (path, field) => {
    const body = { ...lead, [field]: inject };
    if (path.includes('affiliate')) body.message = 'z'.repeat(90);
    if (path.includes('partner')) body.volume = 'under-50';
    const res = await post(path, body);
    expect(res.status).toBe(400);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test('a bare newline is rejected too, not only CRLF', async () => {
    const res = await post('/api/partner-inquiry', { ...lead, firstName: 'Jane\nX', volume: 'under-50' });
    expect(res.status).toBe(400);
  });

  test('legitimate names with spaces, hyphens and accents still pass', async () => {
    const res = await post('/api/partner-inquiry',
      { ...lead, firstName: 'José-María', lastName: 'de la Cruz', volume: 'under-50' });
    expect(res.status).toBe(200);
  });

  // The pin: nodemailer folds CR/LF in unstructured headers. If an upgrade drops
  // that, the validator above becomes the only control — fail loudly here.
  test('nodemailer still neutralises CR/LF in Subject', async () => {
    const nm = require('nodemailer');
    const t = nm.createTransport({ streamTransport: true, newline: 'unix', buffer: true });
    const info = await t.sendMail({ from: 'a@b.com', to: 'c@d.com', subject: `X ${inject}`, text: 'x' });
    const msg = info.message.toString();
    expect(msg).not.toMatch(/^Bcc:/mi);
    expect(msg.split('\n').filter((l) => /^Subject:/i.test(l))).toHaveLength(1);
  });
});
```
```bash
cd "$CORP" && npx jest tests/intakeHardening.test.js 2>&1 | tail -20
```
  - Expected: `Tests: 6 failed` — the five `test.each` cases and the bare-newline case, each with
    `Expected: 400  Received: 200`. The "legitimate names" case and the **nodemailer pin pass already**;
    say so in the commit body. A pin that passes first is a **fence, not a red-green** — that is the
    honest framing, and it is why it is written as a pin (X30's lesson applied here).
  - **If the nodemailer pin fails now, the severity assessment is wrong** — STOP, re-read
    `node_modules/nodemailer/lib/mime-node/index.js` `_encodeHeaderValue`, and re-rate before fixing.

- [ ] **Step 3: GREEN — one matcher, three fields, two routers.**
  - Insert `.matches(/^[^\r\n]*$/)` into the `firstName` and `lastName` chains in **both** routers
    (after `.isString().trim()`, before `.isLength(...)`, sharing the existing
    `withMessage(coded(...))`), and into `businessName` in the partner router.
```bash
cd "$CORP" && npx jest tests/intakeHardening.test.js 2>&1 | tail -6
npm test 2>&1 | tail -4; diff <(tail -4 /tmp/corp-baseline.txt) <(npm test 2>&1 | tail -4) && echo SUITE_UNCHANGED_SHAPE
npm run check:i18n | tail -2 | diff /tmp/corp-i18n-before.txt - && echo I18N_PARITY_UNCHANGED
npx eslint server/ tests/
git add -A && git commit -m "fix(intake): reject CR/LF in the fields that reach a mail Subject (H-1 residue)

H-1b made the four intake paths opt out of web-core's XSS input-stripper so lead
copy stops being truncated at the first '<'. The control moved to output
escaping, which covers the body but not the headers: firstName/lastName/
businessName are interpolated into the mail Subject, and isString().trim() lets
an interior CRLF through. email is already safe (isEmail rejects it).

Not a live injection — nodemailer 8.0.11 folds CR/LF to a space in unstructured
headers, verified end to end. This is defence in depth plus a regression test
that fails if an upgrade ever stops doing that, since the validator would then
be the only control. No new error codes, so locale parity is unchanged.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git push
```
  - Expected: `Tests: 8 passed` in that describe block, the full suite green, `SUITE_UNCHANGED_SHAPE`
    (no *other* test changed state), `I18N_PARITY_UNCHANGED`, eslint silent, `main -> main`.
  - A parity difference means a coded error crept in — revert the code-adding part; see the design note.

---

### Task 33: `crhs-transfer` — **HUMAN-CONFIRM, IRREVERSIBLE**. Mirror and reconcile FIRST; delete only at zero

> ⛔ **The brief's premise — "it holds nothing unique" — is false as measured, and the contents are
> attorney-client privileged settlement drafts in an active dispute.** [MEASURED 2026-09-21 via the
> GitHub API and the local `dc_private` tree]:
>
> | path | remote bytes | `dc_private` counterpart | status |
> |:--|--:|:--|:--|
> | `CRHS - Letter re Settlement Memorandum … DRAFT 2026-09-15.docx` | 38,839 | `docs/letters/…` **39,404** | ⚠️ **differs** |
> | `CRHS-WaveMAX Settlement Memorandum V4 (CRHS revisions) 2026-09-15.docx` | 12,962 | `artifacts/settlement-2026-08/…` 12,962 | size matches |
> | `email-to-miguel-2026-09-15.md` | 8,913 | `docs/memos/2026-09-15-email-to-miguel-FINAL-DRAFT.md` 8,913 | matches, **name differs** |
> | `termination-survival/2026-09-17-DRAFT-First-Amendment-to-Lease.md` | 10,255 | `docs/business-continuity/…` 10,255 | matches |
> | `termination-survival/…PART1-legal-framework.md` | 12,460 | `docs/business-continuity/…` **13,115** | ⚠️ **differs** |
> | `termination-survival/…PART2-the-model.md` | 11,726 | `docs/business-continuity/…` 11,726 | matches |
> | `README.md` | 1,680 | — | ⛔ **exists nowhere else** |
>
> The `README.md` is **not** boilerplate: it records the handling rule, the send checklist, and **three
> unresolved counsel questions** — the missing Meta Business Settings screenshot the letter says is
> enclosed, whether Miguel answered the **February 14, 2026 release** question, and **where the $50,000
> sits**. Those land in `dc_private`, with a sourced timeline entry in the same unit of work (standing
> rule), **before** anything is deleted. `dc_private` additionally holds `PART3-the-loan.md` and
> `PART4-the-law.md`, so it is otherwise the superset.

**Files:** creates `/var/www/wavemax/cutover-logs/crhs-transfer-mirror-<TS>.git` (a `--mirror` clone,
mode 700, outside every tree we push) and `…/plan3-crhs-transfer.txt`; may add files under
`/mnt/c/Users/rickh/GitHub/dc_private/` (a commit in **that** repo). Permanently deletes
`github.com/rhoulihan/crhs-transfer` at Step 6.

**Interfaces:**
- Consumes — asserted in Step 1 and re-asserted in Step 5, halting: `gh` auth with `delete_repo`; the
  `dc_private` working copy present and clean; the repo still existing with `forks_count=0`.
- Produces: `TRANSFER_MIRROR`, `TRANSFER_UNIQUE_N` (**recomputed** after reconciliation, never echoed),
  `TRANSFER_README_LANDED=<dc_private sha>`, `TRANSFER_DELETED=<timestamp>`.

**Rollback (exact). There is none for Step 6.** GitHub repository deletion is permanent; the name can
be re-created but the repo object, its history and its settings are gone. The only recovery is the
mirror:
```bash
EV=/var/www/wavemax/cutover-logs; set -a; . "$EV/plan3-record.env"; set +a
gh repo create rhoulihan/crhs-transfer --private --description "restored from mirror"
git -C "$TRANSFER_MIRROR" push --mirror https://github.com/rhoulihan/crhs-transfer.git
gh api repos/rhoulihan/crhs-transfer/git/trees/main?recursive=1 --jq '.tree[]|select(.type=="blob")|.path'
```
- Recovery expected: the **six** blob paths listed again. This restores **content, not the repo
  object** — creation date, collaborator grants and issue history do not come back.
- Steps 1–4 are non-destructive; to undo them:
  `rm -rf "$EV"/crhs-transfer-mirror-*.git "$EV/plan3-crhs-transfer.txt"` and review any `dc_private`
  commit deliberately — **never revert a `dc_private` commit that carries the only copy of something.**

- [ ] **Step 1: Mirror before touching anything else.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
TS=$(date -u +%Y%m%dT%H%M%SZ)
gh api repos/rhoulihan/crhs-transfer --jq '[.name,(.private|tostring),.pushed_at,(.forks_count|tostring),(.open_issues_count|tostring)]|join(" ")'
git clone --mirror https://github.com/rhoulihan/crhs-transfer.git "$EV/crhs-transfer-mirror-$TS.git" 2>&1 | tail -2
rec TRANSFER_MIRROR "$EV/crhs-transfer-mirror-$TS.git"
git -C "$EV/crhs-transfer-mirror-$TS.git" log --oneline | wc -l
git -C "$EV/crhs-transfer-mirror-$TS.git" ls-tree -r --name-only HEAD | wc -l
chmod -R go-rwx "$EV/crhs-transfer-mirror-$TS.git"; stat -c '%a %n' "$EV/crhs-transfer-mirror-$TS.git"
```
  - Expected: `crhs-transfer true 2026-09-17T13:44:51Z 0 0`; a clone summary; a non-zero commit count;
    **`6`** — `git ls-tree -r --name-only` lists blobs only. (The GitHub tree API returns **7** because
    it includes the `termination-survival` tree object. Slice E printed both numbers in one sentence
    and an operator could not tell a pass from a fail — P31. **Six.**)
  - A mode with any group/other bit, or a failed clone — **STOP.** Nothing else in this task may run
    without a mirror in hand. The mirror holds privileged material and is never added to a repo.

- [ ] **Step 2: Hash every file against `dc_private`.**
```bash
EV=/var/www/wavemax/cutover-logs; set -a; . "$EV/plan3-record.env"; set +a
M=$TRANSFER_MIRROR; D=/mnt/c/Users/rickh/GitHub/dc_private
unique_count() {
  { git -C "$M" ls-tree -r --name-only HEAD | while IFS= read -r p; do
      printf 'REMOTE %s  %s\n' "$(git -C "$M" show "HEAD:$p" | sha256sum | cut -d' ' -f1)" "$p"; done
    for f in "docs/letters/CRHS - Letter re Settlement Memorandum and Amicable Separation - DRAFT 2026-09-15.docx" \
             "artifacts/settlement-2026-08/CRHS-WaveMAX Settlement Memorandum V4 (CRHS revisions) 2026-09-15.docx" \
             "docs/memos/2026-09-15-email-to-miguel-FINAL-DRAFT.md" \
             "docs/business-continuity/2026-09-17-DRAFT-First-Amendment-to-Lease.md" \
             "docs/business-continuity/2026-09-17-termination-survival-PART1-legal-framework.md" \
             "docs/business-continuity/2026-09-17-termination-survival-PART2-the-model.md"; do
      [ -f "$D/$f" ] && printf 'LOCAL  %s  %s\n' "$(sha256sum "$D/$f" | cut -d' ' -f1)" "$f" || printf 'LOCAL  MISSING  %s\n' "$f"
    done; }
}
unique_count | tee "$EV/plan3-crhs-transfer.txt"
N=$(awk '{print $2}' "$EV/plan3-crhs-transfer.txt" | sort | uniq -c | awk '$1==1' | wc -l)
printf 'TRANSFER_UNIQUE_N=%q\n' "$N" >> "$EV/plan3-record.env"; echo "TRANSFER_UNIQUE_N=$N"
```
  - Expected: the listing, then **`TRANSFER_UNIQUE_N=3`** — the cover letter, `PART1`, and `README.md`
    (which has no local counterpart at all). Any `LOCAL  MISSING` line is a **fourth** unmatched item
    and must be reconciled like the rest.
  - Slice E computed this number and never wrote it to the record, and never recomputed it after
    reconciling — so the gate on an irreversible deletion could only be satisfied by hand-typing
    `TRANSFER_UNIQUE_N=0` (P15). Here the same function is **re-run** in Step 4.

- [ ] **Step 3: Reconcile each unmatched file. One recorded decision per file.**
```bash
EV=/var/www/wavemax/cutover-logs; set -a; . "$EV/plan3-record.env"; set +a
M=$TRANSFER_MIRROR; D=/mnt/c/Users/rickh/GitHub/dc_private
mkdir -p /tmp/crhs-transfer-cmp && chmod 700 /tmp/crhs-transfer-cmp
git -C "$M" show "HEAD:README.md" > /tmp/crhs-transfer-cmp/README.md
git -C "$M" show "HEAD:termination-survival/2026-09-17-termination-survival-PART1-legal-framework.md" > /tmp/crhs-transfer-cmp/PART1.md
diff -u "$D/docs/business-continuity/2026-09-17-termination-survival-PART1-legal-framework.md" /tmp/crhs-transfer-cmp/PART1.md | head -40
git -C "$M" show "HEAD:CRHS - Letter re Settlement Memorandum and Amicable Separation - DRAFT 2026-09-15.docx" > /tmp/crhs-transfer-cmp/letter.docx
for z in /tmp/crhs-transfer-cmp/letter.docx "$D/docs/letters/CRHS - Letter re Settlement Memorandum and Amicable Separation - DRAFT 2026-09-15.docx"; do
  printf '%s  ' "$(basename "$z")"; unzip -p "$z" word/document.xml | sha256sum | cut -d' ' -f1; done
```
  - Expected: a readable diff for `PART1` (655 bytes of difference — most likely the local copy is the
    later revision), and two `word/document.xml` hashes. **Equal `document.xml` hashes mean the prose
    is identical** and the 565-byte delta is zip metadata: record that and treat the file as matched.
    Unequal hashes mean a prose difference — reconcile with the `docx-template-editor` skill, never by
    hand-editing XML.
  - Per file, record the decision in `plan3-record.env`:
    - local is newer / a superset → the remote blob is superseded; record **why**; no copy;
    - remote holds content the local lacks → copy into `dc_private` under a **dated name that does not
      overwrite** the existing file, and commit **in `dc_private`**.
  - `README.md` is unique by construction. Fold its three open items (the Meta Business Settings
    screenshot, the February 14 2026 release question, where the $50,000 sits) into `dc_private` as a
    memo **and** a sourced timeline entry in the same commit, then:
    `rec TRANSFER_README_LANDED "<dc_private sha>"`.
  - Clean up: `rm -rf /tmp/crhs-transfer-cmp`.

- [ ] **Step 4: RECOMPUTE uniqueness — do not echo the old number.**
```bash
EV=/var/www/wavemax/cutover-logs; set -a; . "$EV/plan3-record.env"; set +a
M=$TRANSFER_MIRROR; D=/mnt/c/Users/rickh/GitHub/dc_private
# re-define Step 2's unique_count() in THIS shell (steps do not share one), adding any
# dc_private path Step 3 created, then re-run the SAME pipeline — never echo the old number
N=$(unique_count | awk '{print $2}' | sort | uniq -c | awk '$1==1' | wc -l)
printf 'TRANSFER_UNIQUE_N=%q\n' "$N" >> "$EV/plan3-record.env"; echo "recomputed TRANSFER_UNIQUE_N=$N"
cd "$D" && git log --oneline -3 && git status --porcelain | wc -l
```
  - Expected: `recomputed TRANSFER_UNIQUE_N=0`, the `dc_private` log showing the reconciliation commit,
    and `0` uncommitted files there.
  - Anything above `0`, or a dirty `dc_private` — **STOP.** Step 6 must not run.
  - `README.md` counts as reconciled only when `TRANSFER_README_LANDED` holds a real sha **and** the
    README's content (or its three questions) exists under `dc_private`.

- [ ] **Step 5: Assert every precondition mechanically, before speaking to the owner.**
```bash
EV=/var/www/wavemax/cutover-logs; set -a; . "$EV/plan3-record.env"; set +a
test -d "$TRANSFER_MIRROR" && echo MIRROR_OK || echo MIRROR_MISSING
test "${TRANSFER_UNIQUE_N:-1}" = 0 && echo UNIQUE_ZERO || echo UNIQUE_NONZERO
test -n "${TRANSFER_README_LANDED:-}" && echo README_LANDED || echo README_NOT_LANDED
for R in wavemax-affiliate-program crhs-corporate crhs-web-core dc_private; do
  printf '%s refs=' "$R"
  grep -rl "crhs-transfer" /mnt/c/Users/rickh/GitHub/$R/{server,public,scripts,tests,src} 2>/dev/null \
    | grep -vE '/(node_modules|\.git)/' | wc -l
done
gh api repos/rhoulihan/crhs-transfer --jq '[(.forks_count|tostring),(.open_issues_count|tostring)]|join(" ")'
```
  - Expected, **eight lines**: `MIRROR_OK`, `UNIQUE_ZERO`, `README_LANDED`, four `… refs=0` lines, and
    `0 0`.
  - The reference grep is scoped to **code directories only**. Slice E grepped whole trees and then
    excluded two filenames by name — but this plan's own `docs/superpowers/ESCALATIONS.md` and the
    assembled plan document both name `crhs-transfer`, so that check would return non-zero and STOP on
    a condition that is expected and fine (P15). Documentation naming the repo is not a consumer.
  - Any `MISSING` / `NONZERO` / `NOT_LANDED`, a non-zero `refs=`, or `forks_count > 0` — **STOP.** Do
    not ask the owner to approve a deletion whose preconditions are not met.

- [ ] **Step 6 (HUMAN-CONFIRM, IRREVERSIBLE): Ask Rick.** Say exactly this:

  > `crhs-transfer` — the private repo you used to hand the settlement memorandum and the cover letter
  > to Miguel. Its own README says to delete it once the documents were sent. Before I do, three things,
  > because **deleting a GitHub repo cannot be undone**:
  >
  > 1. It is **not** a clean duplicate of the case file. Two of the documents differ from the
  >    `dc_private` copies — the cover letter by 565 bytes and `termination-survival PART1` by 655 —
  >    and the README exists nowhere else. All three are reconciled into `dc_private` (commit `<sha>`),
  >    including the README's three open items: the Meta Business Settings screenshot the letter says
  >    is enclosed, the February 14 2026 release question for Miguel, and where the $50,000 sits.
  > 2. I have a **full mirror clone** — history included — at `<mirror path>`, outside every repo we
  >    push, mode 700. That is the only recovery path afterwards, and it restores the *content*, not
  >    the repo object.
  > 3. The contents are **attorney-client privileged settlement drafts in an active dispute**.
  >    Destroying a copy of privileged work product during live litigation is the kind of thing
  >    opposing counsel asks about. The mirror is why I am comfortable; you may still want to mention
  >    it to Miguel first.
  >
  > Nothing in any of the four working trees references the repo. Say **"delete crhs-transfer"** and I
  > will delete it permanently; anything else and I leave it alone.

  **Proceed only on that exact phrase.** "Yeah go ahead" is a **no** for an irreversible action on
  privileged material — ask again.

- [ ] **Step 7: Delete, then prove it is gone.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env
gh repo delete rhoulihan/crhs-transfer --yes
gh api repos/rhoulihan/crhs-transfer 2>&1 | head -2
printf 'TRANSFER_DELETED=%s\n' "$(date -u +%Y%m%dT%H%M%SZ)" >> "$REC"
gh repo list rhoulihan --limit 100 --json name --jq '.[].name' | grep -c '^crhs-transfer$' || true
set -a; . "$REC"; set +a; test -d "$TRANSFER_MIRROR" && echo MIRROR_STILL_PRESENT
```
  - Expected: the delete succeeding with no error; `gh api` returning **404 / `Not Found`**; `0` from
    the listing; `MIRROR_STILL_PRESENT`.
  - `gh repo delete` refusing on scope means the token lacks `delete_repo` — **do not work around it**.
    Tell the owner, let them delete it in the GitHub UI, then run the two verifications.
  - The mirror's long-term home is an ESCALATIONS row (task 35): `/var/www/wavemax/cutover-logs/` is a
    working directory, not an archive, and it holds privileged material.

---

### Task 34: the password-reset round trip — **HUMAN-CONFIRM, HUMAN-EXECUTED**

> **Why a human.** The flow crosses four systems no automated harness spans end to end: the app (token
> mint), Mailcow (delivery through the `no-reply@crhsent.com` login), a real mail client (the click),
> and the SPA (`?route=/reset-password&token=…&type=…`, parsed client-side in
> `reset-password-init.js:39`).
>
> **One pass, not two.** Slice E scheduled a pass before and after the `rundberglaundry.com` flip and
> called pass 1 a gate on that flip. In this plan the flips are **phase 1** and are long green by the
> time this runs, and the controller's measurement (task 28) showed the flipped host preserves the
> token byte-identical through a 301 — so there is nothing left for a pre-flip pass to protect. This is
> a **post-change acceptance**: it proves tasks 28 + 29 did not break a working flow.

**Files:** none. Produces signed rows in `/var/www/wavemax/cutover-logs/plan3-record.env`.

**Interfaces:**
- Consumes — asserted in Step 1, halting:
  1. **Task 24** — `@crhs/web-core` at the released version on both boxes (the reset flow runs through
     core's session/CSRF/mail surface).
  2. **Task 28 deployed on both boxes** — the box's `passwordResetService.js` reads `BASE_URL`.
  3. **Task 29 complete on both boxes** — `FRONTEND_URL` unset, so a stale value cannot mask a failure.
- Produces: `PWRESET_AFFILIATE=yes|no`, `PWRESET_ADMIN=yes|no`, `PWRESET_RUN_BY`, `PWRESET_AT`.

**Before starting, three facts:**
- **3 attempts per hour, per IP** (`passwordResetLimiter`). A fourth returns `429`. There is no admin
  reset for that bucket until task 25 is deployed — and even then, clearing your own bucket mid-test is
  a bad idea. If you fumble, wait the hour.
- **The token lives 1 hour and is single-use.** Requesting a second reset invalidates the first link.
- **Operators cannot be tested** — they authenticate by PIN and `resetPassword` rejects
  `userType=operator` by design. Coverage is **affiliate** and **administrator**.

**Rollback (exact).** A password *was* changed, so the rollback is a second reset back:
```
Run the same checklist again, setting the password back to the previous value.
If the 3/hour limiter locks you out, wait for the hour, or have the other
administrator reset it from the admin panel (Administrators -> Reset password).
```
- Rollback expected: login succeeds with the original password.
- ⚠️ Use a **test affiliate** if one exists, and do not use the only super-admin account unless the
  owner is comfortable: if the mail does not arrive, that account is locked out of the panel for an hour.

- [ ] **Step 1: Assert the Consumes rows (read-only, both boxes).**
```bash
for IP in 161.153.71.201 144.24.4.202; do printf '== %s ==\n' "$IP"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'R=/var/www/wavemax/wavemax-affiliate-program
echo "webcore=$(node -e "console.log(require(\"$R/node_modules/@crhs/web-core/package.json\").version)")"
echo "uses_base_url=$(grep -c "process.env.BASE_URL}/embed-app-v2.html" $R/server/services/passwordResetService.js)"
echo "frontend_url_in_code=$(grep -rc FRONTEND_URL $R/server/ --include=*.js | grep -v ":0" | wc -l)"
echo "frontend_url_in_env=$(grep -c "^FRONTEND_URL=" $R/.env || true)"
curl -s -o /dev/null -w "health=%{http_code}\n" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/health'; done
```
  - Expected per box: `webcore=0.3.x`, `uses_base_url=1`, `frontend_url_in_code=0`,
    `frontend_url_in_env=0`, `health=200`.
  - Any other value — **STOP** and fix that box before asking a human to spend one of three attempts.

- [ ] **Step 2 (HUMAN-CONFIRM): Agree the accounts.** Say exactly this:

  > I need you to run the password-reset round trip by hand — it can't be automated, because it crosses
  > the app, Mailcow, your mail client and the SPA. It's a one-pass acceptance now that the links are
  > built from `BASE_URL` and `FRONTEND_URL` is gone from both boxes.
  >
  > Three things before we start: you get **3 attempts per hour** (a fourth returns 429), the emailed
  > token is **good for one hour and single-use**, and **operators can't be tested** — they're
  > PIN-based, so it's affiliate plus administrator.
  >
  > Which accounts? A test affiliate would be ideal for the first. For the administrator pass I'd
  > rather not use your only super-admin account unless you're comfortable — if the mail doesn't
  > arrive, you're locked out of the panel for an hour. Ready?

  Record `PWRESET_ACCOUNTS` and `PWRESET_RUN_BY`.

- [ ] **Step 3 (human): Request the reset — affiliate.**
  1. Open `https://portal.atxwashdryfold.com/embed-app-v2.html?route=/affiliate-login`.
  2. Click **"Forgot password?"** (`affiliate-login-embed.html:57`).
  - Expected: the forgot-password form renders with a language switcher and an email field. A **blank
    panel** means the page script did not load — stop and record it.
  3. Enter the affiliate email and submit.
  - Expected: a success message that does **not** reveal whether the address exists (the endpoint is
    deliberately non-enumerating). An immediate `429` means the hour's three attempts are spent.

- [ ] **Step 4 (human): The email.**
  - Expected within about a minute:
    - **From** `no-reply@crhsent.com`, display name **WaveMAX Austin** — *not* `no-reply@wavemax.promo`
      and *not* "Rundberg Laundry". A wrong sender is the 2026-08-23 outage shape: stop and record it.
    - a link beginning **exactly**
      `https://portal.atxwashdryfold.com/embed-app-v2.html?route=/reset-password&token=` followed by
      **64 hex characters** and `&type=affiliate`.
  - ⛔ **The two failures this step exists to catch:**
    - the link starts `https://rundberglaundry.com/…` → **task 28 is not deployed on the box that
      served the request**. (It still *works* — that host 301s to the portal with the token intact —
      but it proves a box is behind. Record it and fix the deploy.)
    - the link starts `undefined/…` → a box has **no `BASE_URL`**. Stop, run task 29's rollback on that
      box, and record it.
  - Nothing within 5 minutes: check that box's `logs/combined.log` for a send failure and the mail
    host's postfix log for the recipient (`docker logs --tail 2000 … | grep <recipient>`). **A silent
    non-delivery is a finding**, not a retry.

- [ ] **Step 5 (human): Click through and set a new password.**
  1. Click the link (or paste it — note which; a mail client that rewrites links is itself a finding).
  - Expected: the reset form with both password fields and a visible requirements hint. *"Missing token
    or userType parameters"* in the console means the query string did not survive the click.
  2. Enter a new password twice and submit.
  - Expected: success and a prompt to log in. A validation error must name the rule it failed, not a
    generic "Validation failed".
  3. Click the same link again.
  - Expected: **rejected** — single-use. A second acceptance is a security finding: stop and record it.

- [ ] **Step 6 (human): Prove the new password works and the old one does not.**
  1. Log in at `?route=/affiliate-login` with the **new** password → the affiliate dashboard loads.
  2. Log out; try the **old** password → rejected.
  - Both must hold before recording `yes`.

- [ ] **Step 7 (human): Repeat Steps 3–6 for the administrator** at `?route=/administrator-login`
      ("Forgot your password?" at `administrator-login-embed.html:69`).
  - Expected: identical behaviour with `&type=administrator` in the link. Administrators hash through
    the model's own hook rather than PBKDF2 — a difference that has broken this path before, which is
    why both roles are tested.

- [ ] **Step 8: Record the run.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env
{ printf 'PWRESET_AFFILIATE=%s\n' "${PWRESET_AFFILIATE:?set yes or no}"
  printf 'PWRESET_ADMIN=%s\n'     "${PWRESET_ADMIN:?set yes or no}"
  printf 'PWRESET_RUN_BY=%q\n'    "${PWRESET_RUN_BY:?}"
  printf 'PWRESET_AT=%s\n'        "$(date -u +%Y%m%dT%H%M%SZ)"; } >> "$REC"
grep -E '^PWRESET_' "$REC"
```
  - Expected: four `PWRESET_*` lines with both results `yes`. `${VAR:?}` makes an unset result a hard
    error rather than an empty row — an empty `PASS` field is how a human gate quietly becomes a
    rubber stamp.

---

### Task 35: **BACKLOG CLOSURE** — one escalation register, zero open items, and a command that keeps it that way

> **This task is the point of the plan.** Exit criteria 3 and 7: **zero** open D-/B- items, every
> memory `backlog_*` file closed or rewritten, and **one** written list of everything handed to the
> owner or counsel — *"so the backlog is clear because items were closed or escalated, never because
> they were forgotten."*
>
> **Two contradictions this task settles, because the skeleton gave it sole ownership of both files:**
> - **Four competing "single escalation list" artefacts** (X13): slice B's
>   `docs/superpowers/plans/plan3-escalations.md`, slice C's heading inside `tasks/todo.md`, slice D's
>   `docs/refactor/OWNER-COUNSEL-ESCALATIONS.md`, slice E's `docs/superpowers/ESCALATIONS.md`. **One
>   file wins: `docs/superpowers/ESCALATIONS.md`** (R-14) — the only candidate with
>   owner/date/decision/blocks per row. None of the other three exists today [MEASURED], and no other
>   task in the assembled plan creates one, so there is nothing to merge from disk — only content.
> - **The memory `backlog_*` files** (X14): slice B said *"delete nothing, the reasons are the value"*
>   and kept the `backlog_` names; slice E said rename `backlog_* → closed_*` because *"a filename that
>   still says backlog is a false signal to the next session"*. **Both are right about different
>   things.** Ruling: **rename to `closed_*` AND keep every reason and trap in the rewritten body.**
>   Nothing is deleted; the filename stops lying. This task owns all five files and `MEMORY.md`
>   exclusively, so the ordering hazard (files outside git, no `git revert`) cannot arise.

**Files:**
- Create: `scripts/check-backlog-empty.sh`, `docs/superpowers/ESCALATIONS.md`
- Modify: `package.json` (`check:backlog`), `tasks/todo.md`, `tasks/lessons.md`,
  `docs/superpowers/plans/2026-09-09-separation-plan1-foundations.md` and
  `…/2026-09-13-separation-plan2-content-app.md` (one banner line each)
- Rename + rewrite (outside git, snapshot first): `~/.claude/projects/-mnt-c-Users-rickh-GitHub-wavemax-affiliate-program/memory/backlog_*.md`
  → `closed_*.md`, and `MEMORY.md`

**Interfaces:**
- Consumes — tasks 1–34. Asserted in Step 1 **on the artefacts**, not on prose or on a record row that
  a failed task might still have written (P7).
- Produces: `BACKLOG_OPEN_N=0`, `ESCALATIONS_ROWS=<n>`, `PLAN3_CLOSED=yes`, and the single register.

**Rollback (exact).**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; cd "$AFF"
git revert --no-edit <task-35 sha> && bash scripts/check-backlog-empty.sh; echo "exit=$?"
M=/home/rickh/.claude/projects/-mnt-c-Users-rickh-GitHub-wavemax-affiliate-program/memory
tar -C "$M" -xzf ~/memory-backlog-<TS>.tgz && ls -1 "$M"/backlog_*.md | wc -l
```
- Rollback expected: the revert line, the script reporting the pre-task counts with `exit=1`, then `5`
  restored memory files. The memory files are **not in git** — Step 4's tarball is their only rollback.

- [ ] **Step 1: Prove there is nothing left open, before writing that there isn't.**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; cd "$AFF"
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
req_yes() { local v="${!1-}"; [ "$v" = yes ] || { echo "STOP: $1='$v' (want 'yes')"; return 1; }; echo "$1=yes"; }
req()     { local v="${!1-}"; [ -n "$v" ]    || { echo "STOP: $1 unset in $REC";        return 1; }; echo "$1=$v"; }

echo "--- phase 1 ---";  req_yes ALL_HOSTS_FLIPPED; grep -c '^HOST_DONE_[a-z0-9_]*=yes$' "$REC"
echo "--- phase 2 ---";  echo "explorer_files=$(ls design-explorer 2>/dev/null | wc -l) explorer_guard=$(ls server/middleware/explorerGuard.js 2>/dev/null | wc -l) concierge=$(grep -c 'api/concierge' server.js || true)"
                         echo "bridges=$(ls public/assets/js/*iframe-bridge* 2>/dev/null | wc -l)"
echo "--- phase 3 ---";  node -e "console.log('webcore='+require('@crhs/web-core/package.json').version)"
echo "--- task 25 ---";  echo "rate_limits_refs=$(grep -rl 'rate_limits' server/ 2>/dev/null | wc -l)"
echo "--- task 26 ---";  npm run lint:server >/dev/null 2>&1; echo "lint_server_exit=$?"
echo "--- task 27 ---";  test -f .eslint-baseline.json && echo baseline_present
echo "--- task 28/29 ---"; for IP in 161.153.71.201 144.24.4.202; do printf '%s ' "$IP"; ssh -i ~/.ssh/oci_wavemax ubuntu@$IP \
  'A=/var/www/wavemax/wavemax-affiliate-program/.env; echo "frontend=$(grep -c "^FRONTEND_URL=" $A || true) alert=$(grep -c "^ALERT_EMAIL=" $A) pem=$(grep -c "PRIVATE KEY" $A)"'; done
echo "--- task 30 ---";  echo "smtp_interval=$(grep -c 'checkInterval: 300000' server/monitoring/connectivity-monitor.js)"
echo "--- task 31 ---";  req OFELIA_DECISION
echo "--- task 33 ---";  gh api repos/rhoulihan/crhs-transfer >/dev/null 2>&1 && echo "transfer=STILL_PRESENT" || echo "transfer=GONE"
echo "--- task 34 ---";  req_yes PWRESET_AFFILIATE; req_yes PWRESET_ADMIN
echo "--- deployed ---"; for IP in 161.153.71.201 144.24.4.202; do printf '%s ' "$IP"; ssh -i ~/.ssh/oci_wavemax ubuntu@$IP \
  'cd /var/www/wavemax/wavemax-affiliate-program && git fetch -q origin main && git rev-list --count HEAD..origin/main'; done
echo "--- no plan step runs ensure-indexes (C-5) ---"
grep -rn 'ensure-indexes.js' docs/superpowers/plans/2026-09-2*-separation-plan3*.md | grep -v 'ESCALATION' | wc -l
```
  - Expected: `ALL_HOSTS_FLIPPED=yes` and `3`; `explorer_files=0 explorer_guard=0 concierge=0`;
    `bridges=0`; `webcore=0.3.x`; `rate_limits_refs=0`; `lint_server_exit=0`; `baseline_present`;
    per box `frontend=0 alert=1 pem=0`; `smtp_interval=1`; an `OFELIA_DECISION=` row;
    `transfer=GONE`; `PWRESET_AFFILIATE=yes`, `PWRESET_ADMIN=yes`; per box `0` commits behind
    `origin/main`; and `0` plan references to `ensure-indexes.js` outside the escalation row.
  - **Any deviation is a real open item.** Record it and close *that*, or escalate it here with an
    owner — do not proceed to Step 3 and write a closure record that is not true.
  - A non-zero "commits behind" count means phase 4/5 code is committed but **not deployed**: the only
    deploy in these phases is task 30 Step 4. Deploy it (one box at a time), then re-run.

- [ ] **Step 2: Write the gate script, and watch it fail on today's file.**
```bash
cd "$AFF"
cat > scripts/check-backlog-empty.sh <<'EOF'
#!/usr/bin/env bash
# Plan 3 exit criterion 3: tasks/todo.md carries no open D- or B- item and no
# open owner decision. An item is open when its line matches "- [ ]" inside a
# "### D-<n>." / "### B-<n>." section or an "### Owner decision" section.
#
# The SECTIONS guard matters: if those headings are ever renamed, the awk below
# would match nothing and report a cheerful zero. A gate that cannot fail is not
# a gate, so a section count under the floor is exit 2, not exit 0.
set -uo pipefail
F=${1:-tasks/todo.md}
FLOOR=${BACKLOG_SECTION_FLOOR:-10}
test -f "$F" || { echo "MISSING $F"; exit 2; }
sections=$(awk '/^### (D|B)-[0-9]+\./ {n++} /^### Owner decision/ {n++} END {print n+0}' "$F")
printf 'SECTIONS %s\n' "$sections"
if [ "$sections" -lt "$FLOOR" ]; then
  echo "SCOPE BROKEN: expected at least $FLOOR D-/B-/Owner-decision sections, found $sections"
  echo "The headings were renamed or the file was restructured — fix this script before trusting it."
  exit 2
fi
open=$(awk '
  /^### (D|B)-[0-9]+\./ { in_scope=1; h=$0; next }
  /^### Owner decision/  { in_scope=1; h=$0; next }
  /^### /                { in_scope=0 }
  /^## /                 { in_scope=0 }
  in_scope && /^[[:space:]]*- \[ \]/ { print h "\t" $0 }
' "$F")
n=$(printf '%s' "$open" | grep -c . || true)
printf 'OPEN_DB_ITEMS %s\n' "$n"
[ "$n" -gt 0 ] && printf '%s\n' "$open"
[ "$n" -eq 0 ]
EOF
chmod +x scripts/check-backlog-empty.sh
bash scripts/check-backlog-empty.sh; echo "exit=$?"
```
  - **Expected today [MEASURED 2026-09-21]:** `SECTIONS 12`, `OPEN_DB_ITEMS 22`, the 22 lines
    (`B-4` 5 · `B-5` 6 · `D-2` 6 · `D-4` 1 · Owner-decision hero photo 1 · Owner-decisions 2026-09-14 3),
    then `exit=1`.
  - `OPEN_DB_ITEMS 0` **today** would mean the awk scoping is broken — STOP and fix the script, or the
    gate is worthless. `SECTIONS` under the floor is the same failure, caught explicitly.
  - **Falsify it once (C-11):** temporarily rename `### D-2.` to `### D2.` in a scratch copy and
    confirm the script exits `2` with `SCOPE BROKEN`; restore. Record both outputs.

- [ ] **Step 3: Close all 22, each with its closer named.** For every item:
  - shipped → `- [x]` plus `— Plan 3 task <n>, <commit sha>, <date>`;
  - consciously dropped → `- [x]` plus `— CLOSED, not doing: <reason>, owner agreed <date>`;
  - escalated → `- [x]` plus `— ESCALATED to <owner|counsel> <date>, see docs/superpowers/ESCALATIONS.md#<anchor>`.
  - **§D-2's six items** all close to **task 25**, each naming its proof: the reset defect names
    `tests/integration/resetRateLimits.test.js` and states plainly that the old assertion
    `/Reset \d+ rate limit records/` matched `Reset 0`, which is why the suite was green over a total
    no-op. **§D-4** closes to tasks 26 + 27 (`server/` + `server.js` = 0; the remainder a documented
    accepted baseline with a no-increase guard — a **record**, not a question).
  - ⚠️ The DEFERRED WORK section's own words are binding: *"Nothing below may be closed without
    shipping it or getting Rick's explicit agreement to drop it."* A `- [x]` with no commit and no
    recorded agreement **violates that promise**. The three `Owner decisions 2026-09-14` items are the
    ones to watch: **public git history still holds 451 franchisor photos** — that is a destructive
    rewrite of a public repo, so it is *escalated*, never marked done.

- [ ] **Step 4: The memory files — snapshot, rewrite, rename.**
```bash
M=/home/rickh/.claude/projects/-mnt-c-Users-rickh-GitHub-wavemax-affiliate-program/memory
TS=$(date -u +%Y%m%dT%H%M%SZ)
tar -C "$M" -czf ~/memory-backlog-$TS.tgz $(cd "$M" && ls backlog_*.md) MEMORY.md && echo "SNAPSHOT ~/memory-backlog-$TS.tgz"
ls -1 "$M"/backlog_*.md | wc -l; grep -c '⏸' "$M/MEMORY.md"
```
  - Expected: the snapshot line, **`5`** [MEASURED: `backlog_interest_form_i18n.md`,
    `backlog_marquee_sidebar_b3.md`, `backlog_register_now_interest_form.md`,
    `backlog_webcore_brand_literals_b4.md`, `backlog_webcore_next_release_b5.md`], and a non-zero `⏸`
    count.
  - Each rewritten file states **what it was**, **what closed it** (task id + commit/tag + date),
    **what was escalated and to whom**, and **any trap worth keeping**, then is renamed `closed_*`.
    Three traps must survive the rename (they outlive the item):
    1. **`injectNonce`** — a page moved into a nonce-injecting app must carry `content="{{CSP_NONCE}}"`,
       and you must check the **served** HTML, not the file on disk;
    2. **web-core's logger has no `splat()`** — put details inside the message string, and
       `process.exit()` immediately after `logger.error` loses the line;
    3. **renaming `wavemax-language` without a read-old-key-once shim resets every visitor's language.**
  - A file with nothing left worth keeping may be **deleted** — but only if its lesson already lives in
    `tasks/lessons.md`. Check before deleting.
```bash
ls -1 "$M"/backlog_*.md 2>/dev/null | wc -l; ls -1 "$M"/closed_*.md 2>/dev/null | wc -l
grep -c 'backlog_' "$M/MEMORY.md"; grep -n '⏸' "$M/MEMORY.md" | head
```
  - Expected: `0` backlog files, `5` closed files (fewer only if one was deleted — record which and
    why), `0` `backlog_` references in the index, and no `⏸` line left for B-1…B-5.

- [ ] **Step 5: Write the ONE escalation register.** `docs/superpowers/ESCALATIONS.md`, one table.
      **Rule: it is a register, not a parking lot.** Every row carries an **owner**, a **date raised**,
      what it **blocks** (usually nothing), and the **decision needed**, phrased so the owner can answer
      without re-reading a plan. A row with no named owner is not an escalation — it is a forgotten
      item wearing a label. Nothing is added here to avoid doing it.

| # | item | owner | raised | decision needed | blocks |
|:--|:--|:--|:--|:--|:--|
| 1 | **web-core `LICENSE`** — 2 brand literals (the marks clause, the notice address) | Rick / counsel | 2026-09-13 (B-4) | replacement wording | — |
| 2 | **web-core legal pages** — `assets/legal/privacy-policy.html` (17 literals), `refund-policy.html` (10), `terms-and-conditions.html` (11), plus a `rundberglaundry.com` canonical | Rick / counsel | 2026-09-13 (B-4) | approve revised text; never auto-edited | — |
| 3 | **Affiliate `public/privacy-policy.html:88`** still names **DocuSign** as a service provider receiving customer data [MEASURED]. DocuSign is gone from the code and its credentials are gone from both boxes — a live policy naming a processor we do not use is a factual misstatement | Rick / counsel | 2026-09-20 | approve the corrected service-provider list | — |
| 4 | **Marketing hero photo** `public/assets/images/locations/austin-tx/hero-1.webp` — storefront photo carrying the franchisor's swirl logo and sign; relevant to the 2026-08-26 DMCA + trademark complaints. Rick: "Keep it — hold for counsel". **Now public from the content app** (phase 1 flipped the host) | counsel (Miguel) | 2026-09-13 | keep / replace | — (already live) |
| 5 | **Public git history** still holds 451 franchisor location photos (~448 MiB) and the swirl OG card. Removing them means rewriting history on a **public** repo — destructive, breaks every clone | Rick | 2026-09-14 | rewrite, or accept and record | — |
| 6 | **`DEFAULT_ADMIN_EMAIL`** grants super-admin by email equality (`systemHealthService.js:52`) **and** is the alert fallback (`ops.js:13`). *Include this row only if task 29 recorded `ENV29_DEFAULT_ADMIN=keep`; on `change`, this is a closed decision, recorded, not a row* | Rick | 2026-09-20 | change to `admin@crhsent.com`, or keep | — |
| 7 | **Third-party credential revocation** — DocuSign, Google and Meta client secrets left production on 2026-09-21; the accounts may still exist. *(`ANTHROPIC_API_KEY` is **not** here: it was verified single-reader → single-route → explorer-only, so task 17 retires it with the concierge and stops the billing — R-13's "may have other consumers" caveat was resolved by measurement.)* | Rick | 2026-09-20 | revoke at the providers, or confirm the accounts are gone | — |
| 8 | **Pre-purge `.env` backups** — two per box (`env.bak.mediator.20260824`, `env.bak.phase1.20260824`), **each containing the plaintext RSA key and 10 DocuSign keys** [MEASURED]. Task 29 moved them to `env-backups/quarantine/` (mode 600) | Rick | **2026-09-21** | shred, or keep quarantined | — |
| 9 | **`ofelia` memory leak** — the cap raise doubles the interval between OOM kills; it does not fix the leak. The real fix is pinning and upgrading off `mcuadros/ofelia:latest`. *Include with `OFELIA_STABLE=no`, or as an accepted residual with `yes`* | Rick | 2026-09-20 | accept the cap raise, or schedule the image pin | — |
| 10 | **`crhs-transfer` mirror** — privileged settlement drafts live in a `--mirror` clone under `/var/www/wavemax/cutover-logs/`, a working directory, not an archive | Rick / counsel | 2026-09-20 | where the mirror lives; disclose to Miguel or not | — |
| 11 | **Legacy `/austin-tx/` inbound links and printed-flyer QR codes** pointing at retired paths (`/wavemax-affiliate` is a deliberate 410) | Rick | 2026-09-14 | accept the 410s, or add redirects | — |
| 12 | **The rest of the adoption series is NOT in Plan 3** — PRs **B5, B6, B8, B9, B10, B11, B13, B14** (module shims, `SystemConfig` registration, session adoption, email wrappers, CORS adoption, shared-DB ownership, the shim terminus). Plan 3 absorbed only **B7** (task 25) and the ESLint work. The affiliate keeps duplicate implementations of ~14 modules web-core already owns | Rick | **2026-09-21** | schedule as its own plan, or accept the duplication and close the spec's §7.3/§7.5 | — |
| 13 | **`jest.config.js:23` sets `forceExit: true`** [MEASURED], and six `package.json` scripts pass `--forceExit`. The project rule ("the suite runs clean without `--forceExit`") is therefore unverifiable: the gate cannot fail for the reason it exists. No Plan 3 task removes it — slice C's C12 was not absorbed | Rick | **2026-09-21** | schedule the open-handle work, or restate the rule | — |
| 14 | **`scripts/ensure-indexes.js` has no dry run** — it reads `process.argv` **zero** times [MEASURED] and calls `createIndexes` on seven models against whatever `MONGODB_URI` the local `.env` names, i.e. the production ADB. Two drafts and the spec refer to a `--dry-run` that does not exist. **Exact fix:** implement `--dry-run` (list `Model.schema.indexes()` and exit) plus a `require.main === module` gate, with a test; until then, run it only with `MONGODB_URI` pointed at a memory server, and check status with `${PIPESTATUS[0]}`, never `$?` after a pipe | Rick | **2026-09-21** | take the fix, or ban the script from every runbook | — |
| 15 | **web-core lint asymmetry** — its `.eslintrc.js` switches `no-trailing-spaces`, `comma-dangle`, `no-useless-escape` and `no-prototype-builtins` **off** so byte-faithful ports stay diffable, and `src/middleware/sanitization.js` still carries the two patterns task 26 fixed in the affiliate's copy. The affiliate now runs those rules as errors; the shared library does not | Rick | 2026-09-20 | align web-core, or record the asymmetry as intentional | — |
| 16 | **Two affiliate controllers break the size rules** [MEASURED]: `affiliateController.js` **1,059 lines** (over both the 800-line file rule and the 500-line controller rule) and `administratorController.js` **716**. Pre-existing; untouched by Plan 3 | Rick | 2026-09-20 | schedule the splits, or record the exception | — |
| 17 | **Orphaned `ratelimit_*` collections on Oracle ADB** — retired limiters leave their counter collections behind. **`drop()` on ADB is the forbidden operation** behind the 2026-05-25 sessions incident, so nothing is dropped: they are listed only | Rick | 2026-09-20 | `deleteMany({})` and leave the empty collections, drop them deliberately, or leave as is | — |
| 18 | **`no-console` config divergence** — CLAUDE.md says `console.*` is blocked in `server/`; `.eslintrc.js:16` makes it a warning that allows `warn`/`error`. *Include this row only if task 26 Step 6's HUMAN-CONFIRM was refused* | Rick | 2026-09-20 | tighten the config, or amend CLAUDE.md | — |

  - **Not escalations, recorded here so the register is genuinely the whole picture:**
    the ESLint baseline outside `server/` (a **record** with a guard — owner decision 2, task 27);
    the explorer retirement (**settled**, implemented by task 17);
    the `wavemax-language` rename **with** a migration shim (**settled**, implemented in phase 3);
    `INTEREST_FORM_URL` (**closed** by phase 0 task 2, asserted on the served page, not escalated).
```bash
cd "$AFF"
grep -c '^| [0-9]' docs/superpowers/ESCALATIONS.md
awk -F'|' '/^\| [0-9]+ \|/ && ($4 ~ /^[[:space:]]*$/) {print "NO OWNER: "$2}' docs/superpowers/ESCALATIONS.md | wc -l
grep -n 'ESCALATIONS.md' tasks/todo.md docs/superpowers/specs/2026-09-20-separation-plan3-scope-brief.md | wc -l
```
  - Expected: the row count (14–18 depending on the three conditional rows), `0` owner-less rows, and
    at least **2** cross-links so the file cannot be lost.

- [ ] **Step 6: Retarget the "Plan 4" forward-references — by banner, not by rewriting history.**
```bash
cd "$AFF" && grep -rlc 'Plan 4' docs/superpowers/plans/*.md tasks/todo.md
for f in $(grep -rl 'Plan 4' docs/superpowers/plans/*.md tasks/todo.md); do
  grep -q 'There is no Plan 4' "$f" || echo "MISSING BANNER $f"; done
grep -rn '→ Plan 4\|(Plan 4)\|to Plan 4' docs/superpowers/plans/*.md tasks/todo.md | grep -v 'There is no Plan 4' | wc -l
```
  - Expected: the file list, **no `MISSING BANNER` line**, and a forward-reference count of `0`.
  - The banner, one line at the top of each affected document:
    > **There is no Plan 4.** PR B7 and the affiliate ESLint cleanup were absorbed into Plan 3 (tasks
    > 25–27); PRs **B5, B6, B8–B14** were **not** — see `docs/superpowers/ESCALATIONS.md` row 12.
  - Slice C's instruction was to drive the count to zero everywhere outside the specs. That would mean
    **rewriting 61 lines of settled execution history** in Plan 1 and Plan 2 [MEASURED] — as wrong as
    rewriting the specs, and it would erase the record of what was deferred and why. The banner is
    mechanically checkable, tells the truth about the split, and leaves history intact.

- [ ] **Step 7: `tasks/lessons.md` — five patterns worth a rule.**
  1. **An assertion containing `\d+` can pass on `0`.** When a handler's whole job is to delete
     something, assert a **non-zero** count *and* assert the row is gone — never a regex that also
     matches the no-op. (`/Reset \d+ rate limit records/` was green over a total no-op for the life of
     the handler.)
  2. **Two sources for one name diverge.** `codeAttemptLockout` hand-built `ratelimit_${STORE_NAME}`
     while the store computed its own `collectionName`. Read the name from the thing that owns it.
  3. **A getter is not a snapshot.** Destructuring `LIMITER_NAMES` at require time freezes a registry
     that is still being filled. Hold the module; read inside the function.
  4. **A "state" field can describe only the last event.** `docker inspect .State.OOMKilled` said
     `false` while the container was being OOM-killed every ~80 minutes; `RestartCount` (6 → 25) told
     the truth. When a flag disagrees with a counter, trust the counter.
  5. **"Fix the lint" is not one task.** 209 errors were four whitespace/token batches (mechanically
     provable by `git diff -w`), one deletion batch (provable by `mongoose.modelNames()` being
     unchanged), and one semantic batch that contained **one real defect** (`fieldFilter.js` threw on a
     null-prototype object) and **one thing that was not a code problem at all** (a disable comment
     naming an uninstalled plugin's rule). Classify before fixing; the ratio tells you where the risk is.

- [ ] **Step 8: THE closure verification — one command, and the commit.**
```bash
cd "$AFF"
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));
p.scripts['check:backlog']='bash scripts/check-backlog-empty.sh';
p.scripts=Object.fromEntries(Object.entries(p.scripts).sort());
fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');"

M=/home/rickh/.claude/projects/-mnt-c-Users-rickh-GitHub-wavemax-affiliate-program/memory
npm run --silent check:backlog \
  && test "$(ls -1 "$M"/backlog_*.md 2>/dev/null | wc -l)" = 0 \
  && test "$(ls -1 "$M"/closed_*.md  2>/dev/null | wc -l)" -ge 4 \
  && test "$(grep -c '^| [0-9]' docs/superpowers/ESCALATIONS.md)" -ge 14 \
  && test "$(awk -F'|' '/^\| [0-9]+ \|/ && ($4 ~ /^[[:space:]]*$/)' docs/superpowers/ESCALATIONS.md | wc -l)" = 0 \
  && test "$(grep -rn '→ Plan 4\|(Plan 4)\|to Plan 4' docs/superpowers/plans/*.md tasks/todo.md | grep -vc 'There is no Plan 4')" = 0 \
  && test "$(grep -rl 'crhs-transfer' server/ public/ scripts/ tests/ 2>/dev/null | wc -l)" = 0 \
  && npm run --silent lint:server \
  && echo PLAN3_BACKLOG_CLOSED
```
  - **Expected, exactly:** `SECTIONS <n>`, `OPEN_DB_ITEMS 0`, then `PLAN3_BACKLOG_CLOSED`.
  - Every clause is `&&`-chained, so the first failure stops the chain and **no success token is
    printed**. The `SECTIONS` floor inside the script means a renamed heading fails loudly instead of
    reporting a cheerful zero.
```bash
cd "$AFF" && npm test 2>&1 | tail -12
printf 'BACKLOG_OPEN_N=0\nPLAN3_CLOSED=yes\n' >> /var/www/wavemax/cutover-logs/plan3-record.env
git add -A && git commit -m "docs(plan3): close the backlog — zero open items, one escalation register

Exit criteria 3 and 7. Every D- and B- item and every open owner decision is
closed with its closer named (task id + commit + date), dropped with recorded
agreement, or escalated to a named owner — nothing is closed by being forgotten.

- scripts/check-backlog-empty.sh + npm run check:backlog make 'the backlog is
  empty' a command, not a claim. It refuses to report zero when the todo
  headings it scopes to have been renamed.
- docs/superpowers/ESCALATIONS.md is the ONE register (four competing 'single
  lists' were proposed across the slices). Every row carries an owner, a date,
  the decision needed and what it blocks.
- The five memory backlog_* files become closed_* records: renamed so the
  filename stops lying, rewritten so every reason and trap survives.
- Plan 1 and Plan 2 carry a banner saying what 'Plan 4' became: B7 and the
  ESLint cleanup landed here; B5, B6 and B8-B14 did not, and are row 12.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git push
```
  - Expected: the suite at its baseline, and `main -> main`.
  - **Then hand the register to the owner as a message, not a file path**: the point of the register is
    that Rick can answer each question in one line without opening anything. A commit is not a hand-off.

---

## Phase 4 + 5 exit criteria

1. `POST /api/v1/administrators/reset-rate-limits` against a seeded `ratelimit_auth` bucket returns
   `deletedCount > 0` **and** the message matches `^Reset [1-9][0-9]* rate limit entries$`, and the
   seeded document is gone; a collection named `rate_limits` is never created.
2. `grep -rl 'rate limit records' tests/` is empty, and the guard test that pins that is green.
3. `server/middleware/rateLimiting.js` is the policy module; `APP_LIMITER_NAMES` is a getter that
   contains `bag_codes`; `collectionPrefix()` is still `ratelimit_` — **no live counter renamed**.
4. `scripts/admin/reset-rate-limits.js` exports `{ parseArgs, run }`, honours `--dry-run` (grepped for
   **and** behaviourally tested), and connects to no database on `require`.
5. `npx eslint server/ server.js` prints **nothing** and exits **0**; `npm run lint:server` likewise;
   `tests/unit/eslintServerClean.test.js` is green **and has been falsified once**.
6. `.eslint-baseline.json` records a measured total **below 10,900** with a per-directory breakdown,
   and `tests/unit/eslintRepoBaseline.test.js` fails when the total rises (**falsified once**).
7. Reset links are built from `BASE_URL`; no `FRONTEND_URL` remains in `server/`, `public/`, or either
   box's `.env`; a missing `BASE_URL` throws instead of mailing `undefined/…`.
8. Both boxes: every classifier-`DEAD` key gone, `ALERT_EMAIL=admin@crhsent.com` present,
   `grep -c 'PRIVATE KEY'` = **0** in the `.env` **and** in every non-quarantined backup, and
   `grep -cvE '^KEY=|^#|^$'` = **0** (no orphan continuation lines from any multi-line value).
9. The postfix submission log records **no** `commands=0/0` from either box after the task-30 marker,
   and at least one `commands=1/1`.
10. `ofelia` `RestartCount` is unchanged 24 h after the recreate, and memory is below its cap — or
    `OFELIA_STABLE=no` is recorded and escalated with an owner.
11. `crhs-corporate` rejects CR/LF in `firstName`, `lastName` and `businessName` on both intake routes;
    the nodemailer pin is green; locale parity is unchanged.
12. `crhs-transfer` returns **404** from the GitHub API, the mirror exists, and `TRANSFER_UNIQUE_N` was
    **recomputed** to `0` after reconciliation with `TRANSFER_README_LANDED` naming a `dc_private` sha.
13. `PWRESET_AFFILIATE=yes` and `PWRESET_ADMIN=yes`, run by a human, recorded.
14. `npm run check:backlog` prints `OPEN_DB_ITEMS 0` and exits 0; zero `backlog_*` memory files;
    `docs/superpowers/ESCALATIONS.md` exists with **every row owned**; no `→ Plan 4` forward-reference
    survives without the banner; and the Step 8 chain prints **`PLAN3_BACKLOG_CLOSED`**.

---

## Assembly notes — defects found in the skeleton and the adjudication themselves

These are reported, not silently worked around. Each is handled as stated.

1. **The skeleton's phase 4 drops eight PRs with no owner.** Slice C's C2, C3, C6–C11 (**B5, B6, B8,
   B9, B10, B11, B13, B14**) appear in no phase of the skeleton. They are spec §7.3/§7.5 work and the
   scope brief's item 13. **Handled:** ESCALATIONS row 12 + the Plan 1 / Plan 2 banner, so the split is
   recorded rather than lost. The controller may instead choose to schedule them — the row says so.
2. **No task in phases 4–5 deploys the affiliate code it writes.** Tasks 25–29 all commit; only task 30
   touches a box with a `git pull`. **Handled:** task 30 Step 4 is explicitly the deploy for tasks
   25–30 and asserts the arriving commit list; task 35 Step 1 asserts both boxes are `0` commits behind
   `origin/main`.
3. **Ordering conflict between skeleton tasks 28, 29 and 30.** Task 29's stated dependency is *"T28
   deployed (asserted on the box, not in prose)"*, but the only deploy in the plan is task 30, which
   the skeleton orders **after** 29. **Handled:** task 29 Step 1b deploys the pending affiliate commits
   to the box it is about to edit, one box at a time, before any `.env` edit; task 30 Step 4 is then
   idempotent for that box.
4. **The skeleton's "13 of the 208 live in files earlier tasks delete" is wrong** as assembled. Of
   slice C's 13, nine (`server/config/storeIPs.js`) belonged to **B13** and two
   (`server/middleware/sanitization.js`) to **B5** — both dropped from the plan (note 1), so those
   **11 errors stay and task 26 must fix them**. What genuinely disappears earlier is
   `server/middleware/explorerGuard.js` (9 `quotes`, task 17) and the two intake controllers (2, task
   16). **Handled:** task 26 pins no total and derives every batch from a re-measurement.
5. **R-13 contradicts skeleton task 17 on `ANTHROPIC_API_KEY`.** R-13 says it *"is escalated separately
   — the concierge may have other consumers"*; task 17 says it is verified explorer-only and retires
   it. The later verification wins. **Handled:** task 17 retires it, task 29 removes the key, and
   ESCALATIONS row 7 states explicitly that it is *not* a row and why.
6. **R-9's "9 assertions that cannot fail" undercounts this slice pair.** Four of the nine are in C/E
   (`C10` `ensure-indexes --dry-run` + `$?`-after-a-pipe, the slice-C `eslint | tail; EXIT=$?`,
   `E3 Step 4`'s log grep, `E8 Step 3`'s `docker ps`), and a fifth is introduced by slice E itself:
   **`E10 Step 4` echoes `TRANSFER_UNIQUE_N` instead of recomputing it**, so the gate on an
   irreversible deletion of privileged material can only be satisfied by hand-editing the record.
   **Handled:** task 33 Step 4 recomputes with the same function; every other one is replaced and
   falsified in place.
7. **The skeleton's own C14 naming collision survives** (X26): the brief's `C14` is the Lighthouse
   gate, slice C's `C14` was the indent batch. This document uses **task numbers only** and never the
   `C<n>` labels, so the collision cannot be inherited here — but the controller should say so once in
   the assembled plan's header for phases 0–3.
8. **Slice E's `E12` "gates the flip" claim is unreachable in this ordering** — the flips are phase 1
   and the round trip is task 34. **Handled:** task 34 is framed as a single post-change acceptance,
   which is what the adjudication's "Not accepted" section implies but does not spell out.
