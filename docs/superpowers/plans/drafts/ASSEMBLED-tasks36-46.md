# Plan 3 — ASSEMBLED tasks 36–46: the eleven drafted tasks the assembly lost

Assembled 2026-09-21 against `SKELETON.md` (ordering, binding), `ADJUDICATION.md` (15 rulings, binding),
`plan3-sliceB-cleanup.md` (B12, B13, B15) and `plan3-sliceC-plan4-absorbed.md` (C2, C3, C6–C11), with
every `REVIEW-1` / `REVIEW-2` finding that touches those tasks **fixed in the task**, not noted.

These eleven tasks are the three gaps the Phases 2–3 assembler reported ("**Three gaps in the skeleton,
reported not patched**": slice B's B12, B13, B15) plus the eight adoption PRs the Phase 4 assembler
reported ("**Scope note the controller must read** … C2, C3, C6–C11 … No other phase covers them").
They are the owner's stated goal — *"a clean deployment and clear backlog"* — so they become **numbered
tasks, not escalation rows**.

**Tasks 1–35 are NOT renumbered.** Their `Consumes` rows cross-reference task numbers and renumbering
would break the dependency graph. Each task below therefore states its **execution position** in prose
*and* asserts it mechanically in Step 0.

**Insertion order (execution, not document, order is identical below):**

| # | task | insert | repo effect |
|:--|:--|:--|:--|
| 36 | B15 — delete `locationQuarantine` + `quarantineConfig` | **Phase 2, after Task 17** | repo-only; delivered in Task 24 |
| 37 | B12 — prune the marketing hosts out of the portal's host surface | **Phase 2, after Task 19** | repo-only; delivered in Task 24 |
| 38 | B13 — close both known-red affiliate guard suites | **Phase 4, FIRST — before Task 25** | test-only |
| 39 | PR B5 — shim `sanitization`/`errorHandler`/`mongoCursorRetry`/`mongoOracleDiagnostics` | **Phase 4, after Task 25** | repo-only |
| 40 | PR B6 — shim `auditLogger` | after 39 | repo-only |
| 41 | PR B8 — `SystemConfig` registration module | after 40 | repo-only |
| 42 | PR B9 — session adoption | after 41 | repo-only |
| 43 | PR B10 — email wrapper modules | after 42 | repo-only |
| 44 | PR B11 — CORS adoption + `CORS_ORIGIN` | after 43 | repo + `.env.example` |
| 45 | PR B13 — shared-DB ownership; two seed scripts move to corporate | after 44 | two repos + one cron |
| 46 | PR B14 — remove all shims; call sites import `@crhs/web-core` directly | after 45, **before Task 26** | repo-only |

**Everything marked [MEASURED] was measured read-only on 2026-09-21** against the three working trees
and both boxes (oci1 `161.153.71.201`, oci2 `144.24.4.202`) over `ssh -i ~/.ssh/oci_wavemax ubuntu@<ip>`.
Nothing was changed anywhere.

---

## 0. What re-measurement changed in the source drafts

| # | draft said | **[MEASURED] 2026-09-21** | consequence |
|:--|:--|:--|:--|
| 1 | B15 Step 1: `QUARANTINE_NON_AUSTIN` is not `true` on either box — "**a `1` is a STOP**, the middleware is live" | **`QUARANTINE_NON_AUSTIN=true` on BOTH boxes** | the draft's first gate is **inverted** and would halt the task forever. Task 36 asserts the true state and proves inertness **structurally** instead (`isOwnPortalHost()` + the flips), with a positive control |
| 2 | B15: `CORPORATE_SITE_URL` is the franchisor | box `.env` = **`https://atxwashdryfold.com`** on both; `quarantineConfig.js:14` still hardcodes **`https://www.wavemaxlaundry.com`** as the fallback default | the repo default is the live defect the deletion removes. It is **cleanup, not an emergency** — measured, the quarantine fires on **no host and no path** today |
| 3 | B15: the only consumers are the 3 deleted files + `server.js` + `.env.example` | **three more**: `tests/unit/adminIpAuthz.test.js:65`, `tests/unit/scanbag.test.js:62`, `tests/unit/wavemaxAffiliatePage.test.js:59` all `require('../../server/config/quarantineConfig')` | the draft's Step-1 "any other consumer is a **STOP**" would have halted. Task 36 handles all three, and two of them also call `partnerLanding._isExempt` — deleted by Task 16 — so Task 36 **measures and branches** |
| 4 | B12: "16 lines across 8 files" / X11: "30 residual literals across 8 files" | **52** matching lines today across **26** files; after Tasks 3, 16, 19 and 36 the residual is **32 lines in 14 files** (derived in Task 37 Step 1, never pinned) | Task 37 derives its own count at execution time and records it; no literal |
| 5 | B12: modify `public/privacy-policy.html:10` and `public/terms-and-conditions.html:10` | **Task 3 already moves both canonicals** to the portal | removed from Task 37's scope — a second edit would be a no-op that silently masks Task 3 not having run |
| 6 | B12: "the `embed-landing.html` / `affiliate-landing-init.js` hits are the slice A cross-origin defect" | **Task 3 fixes `embed-landing.html:314`/`:317` only.** `:294` (an `<a href>`), `affiliate-landing-init.js:37` and `affiliate-landing-embed.html:8` (a page-level CSP `connect-src`) are **untouched by any of tasks 1–35** | all three are Task 37's, and `affiliate-landing-embed.html` **survives** Phase 2 (`embed-app-v2.js:59-60` routes `/affiliate-landing` and `/affiliate-program` to it) |
| 7 | C10 Step 1: "`storeIPs` must show only `server/middleware/auth.js:10`" | **three** runtime consumers: `auth.js:10`, `locationQuarantine.js:26`, `partnerLanding.js:20` | true only **after** Task 16 (deletes `partnerLanding.js`) and Task 36 (deletes `locationQuarantine.js`). Task 45 asserts both as `Consumes`, so the expectation can pass |
| 8 | C10 Step 4: `node scripts/ensure-indexes.js --dry-run` | `scripts/ensure-indexes.js` reads `process.argv` **zero** times, has no dry-run concept, and is a bare **IIFE** — `require()`-ing it `dotenv.config()`s and `mongoose.connect()`s to whatever `MONGODB_URI` names, i.e. **the production ADB** (R-6) | Task 45 **never executes it.** It verifies the `MODELS` array **statically** (text + `node --check`) and pins the change with a test that reads the file as a string |
| 9 | C10: add `SystemConfig`, `RefreshToken`, `TokenBlacklist`, `Affiliate`, `Administrator`, `Transaction` to affiliate `MODELS` | all six models exist, but adding them makes an **index-provisioning script that runs `createIndexes` against the production ADB** provision six more collections | **CUT from the port** and recorded as an ESCALATIONS row with its exact fix (corporate's `ensure-indexes.js` already exports `{ ensureIndexes, MODELS }` and takes an injectable model list — that is the pattern). Task 45 only **removes** `MediatorAccess`, the one corporate-owned model in the list |
| 10 | C10: corporate needs the four `Access*` + `MediatorAccess` models created | **corporate already has all five** (`crhs-corporate/server/models/`), and its `scripts/ensure-indexes.js:40` already provisions them | Task 45 moves only the **two seed scripts**, which corporate does **not** have |
| 11 | C10: `--drop-orphans` "must use `deleteMany({})` … **or** be explicitly approved by the owner as a `drop`" | ⚠️ memory `lighthouse_psi_quality_bar`: **never `drop()` a collection on Oracle ADB** (the sessions incident) | the **capability is cut**: Task 45 ships an orphan **report** only. There is no flag that deletes. The deletion is an ESCALATIONS row |
| 12 | C2/C3: the four+one modules are byte-identical to core's | `diff` line counts: `sanitization` **4**, `errorHandler` **4**, `mongoCursorRetry` **5**, `mongoOracleDiagnostics` **10**, `auditLogger` **10** | the two larger diffs are **not** comment-only by inspection alone. Tasks 39/40 gate on an **export-key + behaviour** comparison, not on a diff line count |
| 13 | C1/C12: 11 shim/composition files; 12 duplicate suites | **11** files name `@crhs/web-core` in `server/`; **8** of them are single-statement shims; `csrf-config.js` is 2 statements, `cspHelper.js` 30, `csrfTables.js` 85. All 12 suites present at the drafted line counts | Task 46's acceptance grep is stated against the measured set, and its arithmetic is derived |
| 14 | C-R6/C13: `server/` = 208, `TOTAL 196` predicted after the adoption series | `npx eslint server/ server.js` = **209** (`server/` 208 + `server.js` 1): `indent` 63 · `no-trailing-spaces` 51 · `no-unused-vars` 43 · `comma-dangle` 29 · `quotes` 12 · `no-useless-escape` 6 · `no-prototype-builtins` 2 · `no-useless-catch` 1 · `import/no-dynamic-require` 1 · `no-case-declarations` 1 | see §1 below. Every batch total in Task 26 is already derived from its own Step 0, so these tasks **shift the baseline, they do not invalidate it** |
| 15 | C12 removes `--forceExit` | ESCALATIONS **row 13** already owns this, assigned to Rick 2026-09-21, explicitly noting *"slice C's C12 was not absorbed"* | C12 is **not** ported. Task 46 makes spec §7.7 criteria 1 and 2 verifiable; it does **not** remove `--forceExit`, and row 13 stands unchanged |

---

## 1. The ESLint interaction with Task 26 — stated, not left implicit

Task 26 says *"**No total in this task is a literal**… Every batch asserts `new_total == recorded_total −
recorded_count(this batch's rules)`, both sides read from the record"*, and its Step 0 re-measures. That
design is what makes these eleven tasks safe to insert. For the record, here is the arithmetic they move,
**[MEASURED] per file today**:

| landing before Task 26 | file | errors | rules |
|:--|:--|--:|:--|
| Task 17 | `server/middleware/explorerGuard.js` (deleted) | 9 | `quotes` |
| Task 18 | `server/controllers/affiliateApplicationController.js`, `partnerInquiryController.js` (deleted) | 1 + 1 | |
| **Task 36** | `server/config/quarantineConfig.js` (deleted) | **3** | `comma-dangle` |
| **Task 36** | `server/middleware/locationQuarantine.js` (deleted) | **1** | |
| **Task 39** | `server/middleware/sanitization.js` (→ 1-line shim) | **2** | `no-prototype-builtins` 1, `no-useless-escape` 1 |
| **Task 42** | `server.js` (the `originalExpires` binding) | **1** | `no-unused-vars` |
| **Task 45** | `server/config/storeIPs.js` (deleted) | **9** | `no-trailing-spaces` 8, `comma-dangle` 1 |
| **Task 45** | `server/middleware/auth.js` (the `storeIPConfig` import) | **1 of its 6** | `no-unused-vars` |
| **Tasks 40, 41, 43, 44, 46** | `auditLogger.js`, `SystemConfig.js`, `email/transport.js`, `email/template-manager.js`, the 8 existing shims | **0** | — |

Sum removed before Task 26 runs: **28**, so Task 26 starts from a **derived ~181**, not 209.

⚠️ **This is evidence, never a gate.** Task 26 Step 0's `rec LINT_TOTAL_0 "$(lintcount …)"` is the single
source of truth, and its *"Any value **above** 208 is a STOP"* guard still holds. **Do not** edit Task 26
to pin 181. The two rules that matter:

1. **Task 46 must land before Task 26.** Task 46 deletes 14 files and repoints ~44 mock sites; running
   `eslint --fix` first and *then* deleting the files wastes the batch and invalidates every recorded
   per-rule count.
2. **Task 26 must not run before Task 45.** `storeIPs.js` carries 9 of the 51 `no-trailing-spaces` errors
   (18 %) in a file Task 45 deletes.

---

## 2. Conventions

Phase 4's conventions **C-1 … C-13** (assembled plan, §1 of the phases 4–5 header) govern every task
below, unchanged. Three additions, each forced by something measured while assembling:

### C-14. The record lives in two places in the assembled plan. Read both.

[MEASURED] the Phase 0–1 header declares `/var/www/wavemax/cutover-logs/plan3-record.env` **on the
workstation** (mode 700, owner `rickh`); Phase 4's C-2 declares the same path with **local** helpers; and
Task 17 Steps 1/8/9 read and write it **over ssh on oci1**. A task that reads only one location will see
an empty value for a row the other half wrote, and `req_yes` will halt on a dependency that is satisfied.
Every task below therefore uses:

```bash
WS_REC=/var/www/wavemax/cutover-logs/plan3-record.env
recget() {                       # $1 = key. Workstation first, then oci1. Empty if absent in both.
  local k="$1" v
  v=$(sed -n "s/^$k=//p" "$WS_REC" 2>/dev/null | tail -1)
  [ -n "$v" ] || v=$(ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 \
                      "sed -n 's/^$k=//p' $WS_REC 2>/dev/null | tail -1")
  v=${v#\'}; v=${v%\'}; printf '%s' "$v"       # values are written with printf %q
}
recput() { printf '%s=%q\n' "$1" "$2" >> "$WS_REC"; \
  ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 \
    "printf '%s=%s\n' '$1' '$2' >> $WS_REC"; }   # write BOTH, so either reader finds it
```

**This is a fix, not a workaround**: it removes the only failure mode in which an asserted dependency
reads as unmet. Task 35's backlog closure should reconcile the two copies; a row written by `recput` is
byte-identical in both, so reconciliation is a `sort -u`.

### C-15. Prefer the artefact. Every `Consumes` row below that has a physical artefact asserts **it**.

A deleted file is asserted with `test ! -e`, a landed commit with `git merge-base --is-ancestor`, a live
route with `curl`, an installed package with `require(…/package.json).version`. Record rows are used only
for human sign-offs and measured baselines — never as a proxy for work that left a trace on disk.

### C-16. Repo-only tasks name their delivery task explicitly.

Tasks 36, 37, 39–43, 46 change nothing on a box. **Task 24** (`release v0.3.0` and deliver it — both
consumers, both boxes, with the Phase-2 affiliate code) is the delivery vehicle for tasks 36 and 37;
**Task 30**'s `git pull` is the delivery vehicle for tasks 38–46 (its own note: *"task 30's `git pull` is
what carries tasks 25–29 to the boxes"*). A task that says "repo-only" and then reloads pm2 is the P4/P6
defect; none below does.

---

### Task 36: [affiliate] delete `locationQuarantine` and `quarantineConfig` — the last code path that can 302 a user to the franchisor

> **Execution position: Phase 2, immediately after Task 17.** Repo-only; delivered to the boxes by Task 24.
> Task 17's Step 9 is the window that removes `partnerLanding` from both boxes, which is what makes this
> middleware's last non-inert role provably gone.
>
> **What this is, precisely.** [MEASURED] `QUARANTINE_NON_AUSTIN=true` on **both** boxes — the middleware is
> **enabled in production**, which is the opposite of what slice B's draft asserted. It nonetheless fires on
> **no host and no path**, for two structural reasons, both measured today on oci1:
>
> | `Host:` | `/not-a-real-path` | `/partner-program` | `/wp-login.php` | why |
> |:--|:--|:--|:--|:--|
> | `portal.atxwashdryfold.com` | 404 | 404 | 404 | `locationQuarantine.js:44-47` `isOwnPortalHost()` exempts it |
> | `atxwashdryfold.com` | 200 | 200 | 200 | same exemption, then `partnerLanding` |
> | `rundberglaundry.com` | 200 | 200 | 200 | `partnerLanding` (mounted `:371`) pre-empts the quarantine (`:590`) |
> | `atxwashateria.com` | 200 | 200 | 200 | same |
>
> So this is **cleanup, not an emergency** — and it should be said in exactly those words, because the
> franchisor reference it removes is real: [MEASURED] `CORPORATE_SITE_URL` was repointed on both boxes from
> `https://www.wavemaxlaundry.com` to `https://atxwashdryfold.com`, but `server/config/quarantineConfig.js:14`
> **still hardcodes the franchisor as the fallback default**:
> `(process.env.CORPORATE_SITE_URL || 'https://www.wavemaxlaundry.com')`. One unset env var on one box and
> the portal 302s our users onto the franchisor's site, during a live trademark/DMCA dispute. Deleting the
> middleware removes the hardcoded default entirely, which is strictly better than editing it.
>
> **Post-Task-16 hazard this closes, recorded not hidden.** Task 16 deletes `partnerLanding.js`. Between
> Task 17's deploy and this task's, the portal on `:3000` would answer a marketing `Host:` on an
> un-allowlisted path with a **302 to the content app** instead of its own 404. nginx no longer routes those
> hosts to `:3000` after the flips, so nothing reaches it — but "unreachable" is not "absent", and this task
> is what makes it absent.
>
> [MEASURED] the allowlist (`quarantineConfig.js:19-55`) still admits `/austin-tx`, `/api/austin-tx/`,
> `/franchise-default/`, `/data/franchises.json` and `/design-explorer` — four retired subsystems and one
> Task-17 deletion. An allowlist whose entries name things that no longer exist is the "row outlives its
> reason" defect Task 23 exists to prevent.

**Files:**
- Delete: `server/middleware/locationQuarantine.js` (59), `server/config/quarantineConfig.js` (165),
  `tests/integration/locationQuarantine.test.js` (452).
- Modify: `server.js` — the require ([MEASURED] `:540`), the mount (`:590`) and the three comment blocks that
  describe it (`:536-538`, `:543-…`, and the `:558` favicon note *"Must run BEFORE locationQuarantine"*).
  **Locate all of them by content**, then re-assert the count.
- Modify (measure and branch, §0 #3): `tests/unit/adminIpAuthz.test.js` (the
  `describe('quarantine lets the /admin clean URL reach its handler', …)` block, [MEASURED] `:64-73`),
  `tests/unit/scanbag.test.js` (`:60-67`), `tests/unit/wavemaxAffiliatePage.test.js` (`:57-64`). The last two
  also call `partnerLanding._isExempt`, which **Task 16 deletes** — so Task 16 may already have removed the
  whole `describe`. Step 2 measures which of the three still reference `quarantineConfig` and records it.
- Modify (**HUMAN-CONFIRM**): `.env.example` — remove `QUARANTINE_NON_AUSTIN` ([MEASURED] `:193`) and
  `CORPORATE_SITE_URL` (`:195`) **with the comment block above them** (`:190-192`).
- Create: `tests/unit/quarantineRetired.test.js`.
- **Not touched:** either box's `.env`. The two keys become unread the moment the code is gone; removing
  them from a box is **Task 29's** job and opening a second production window for two inert keys is the
  defect C-6 exists to prevent. Step 7 records them so Task 29's classifier finds them.
- **Not touched:** `server/config/links.js:10,13`. Those comments name `atxwashdryfold.com` deliberately, as
  the content origin. They are correct.

**Interfaces:**

*Consumes — every row asserted by the named step; failure halts the task (R-1):*

| # | consumed artefact | asserted by |
|:--|:--|:--|
| C36-1 | **Task 16 landed**: `server/middleware/partnerLanding.js` is gone from the repo, so `locationQuarantine` is the *only* host-scoped middleware left | **Step 1** (`test ! -e` **and** `T16_SHA` is an ancestor of `HEAD`) |
| C36-2 | **Task 17 deployed on both boxes**: the pulled tree has no `partnerLanding.js`, so the marketing-`Host:` 200s above are gone and this task's before/after probe is honest | **Step 1** (per box `test ! -e` on `/var/www/wavemax/wavemax-affiliate-program`, and `/design-explorer/ → 404`) |
| C36-3 | all six flips still green — the marketing hosts are on `:3001`, so nothing routes a marketing `Host:` to the portal | **Step 1** (six-line structural gate: `content=1 portal=0 health_ct=application/json; charset=utf-8 embed=301`) |
| C36-4 | the middleware's live state, as it actually is: `QUARANTINE_NON_AUSTIN=true` on both boxes | **Step 2** (per-box `grep -c` = **1**, not 0 — §0 #1) |
| C36-5 | nothing outside the deletion set consumes it | **Step 2** (set-difference grep, empty output) |
| C36-6 | the quarantine currently 302s **nothing** — the fact the deletion must not change | **Step 3** (the 12-row on-box probe above, plus a local **positive control** proving the middleware *can* 302, so Step 8's "no 302" is falsifiable — R-9/C-11) |

*Produces:*
- no code path in the portal that can `res.redirect` to `www.wavemaxlaundry.com`, and no hardcoded
  franchisor URL anywhere in `server/`;
- `server/config/storeIPs.js` drops to **two** runtime consumers (`auth.js:10`, and `partnerLanding.js` only
  if C36-1 somehow failed) — a `Consumes` row of **Task 45**;
- `tests/unit/quarantineRetired.test.js`, falsified once;
- `server/` ESLint −4 ([MEASURED] `quarantineConfig.js` 3 `comma-dangle`, `locationQuarantine.js` 1) — §1;
- record: `T36_DONE=yes`, `T36_SHA`, `T36_DEAD_ENV_KEYS=QUARANTINE_NON_AUSTIN,CORPORATE_SITE_URL` (Task 29),
  `T36_QUARANTINE_TEST_CONSUMERS_REMAINING=0`;
- an ESCALATIONS row: **the allowlist named four retired subsystems** (`/austin-tx`, `/api/austin-tx/`,
  `/franchise-default/`, `/data/franchises.json`) — if any of those paths is still *served* by the portal it
  is separately dead surface, and Step 2 reports it.

- [ ] **Step 1: gate on Tasks 16 and 17, in the repo and on both boxes.**

```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; cd "$AFF"
WS_REC=/var/www/wavemax/cutover-logs/plan3-record.env
recget() { local k="$1" v; v=$(sed -n "s/^$k=//p" "$WS_REC" 2>/dev/null | tail -1); \
  [ -n "$v" ] || v=$(ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "sed -n 's/^$k=//p' $WS_REC 2>/dev/null | tail -1"); \
  v=${v#\'}; v=${v%\'}; printf '%s' "$v"; }

FAIL=0
chk()  { if [ "$2" = "$3" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=[$2] want=[$3]"; FAIL=1; fi; }
gone() { if [ ! -e "$1" ]; then echo "  OK   gone $1"; else echo "  FAIL still present $1"; FAIL=1; fi; }
anc()  { local v; v=$(recget "$1"); if [ -n "$v" ] && git merge-base --is-ancestor "$v" HEAD 2>/dev/null; \
  then echo "  OK   $1 ancestor"; else echo "  FAIL $1=[$v] not an ancestor of HEAD"; FAIL=1; fi; }

anc T16_SHA; anc T17_SHA
gone server/middleware/partnerLanding.js
chk tree_clean "$(git status --porcelain | wc -l)" 0

for IP in 161.153.71.201 144.24.4.202; do
  printf '%s ' "$IP"
  ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@"$IP" '
    cd /var/www/wavemax/wavemax-affiliate-program
    printf "pl=%s expl=%s head=%s " \
      "$([ -e server/middleware/partnerLanding.js ] && echo present || echo gone)" \
      "$([ -e public/design-explorer ] && echo present || echo gone)" \
      "$(git rev-parse --short HEAD)"
    curl -s -o /dev/null -m 10 -H "Host: portal.atxwashdryfold.com" -H "X-Forwarded-Proto: https" \
      -w "portal_health=%{http_code}\n" http://127.0.0.1:3000/health'
done

for IP in 161.153.71.201 144.24.4.202; do
  for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com; do
    printf '%s %-22s ' "$IP" "$H"
    ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@"$IP" "
      printf 'content=%s portal=%s ' \
        \"\$(grep -c 'proxy-content-app.conf' /etc/nginx/sites-enabled/$H)\" \
        \"\$(grep -c 'proxy-node-app.conf'  /etc/nginx/sites-enabled/$H)\"
      curl -sk -m 10 --resolve $H:443:127.0.0.1 -o /dev/null -w 'health_ct=%{content_type} ' https://$H/health
      curl -sk -m 10 --resolve $H:443:127.0.0.1 -o /dev/null -w 'embed=%{http_code}\n' https://$H/embed-app-v2.html"
  done
done
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: `OK T16_SHA ancestor`, `OK T17_SHA ancestor`, `OK gone server/middleware/partnerLanding.js`,
    `OK tree_clean=0`; then two box lines each `pl=gone expl=gone head=<sha> portal_health=200`; then **six**
    lines each ending exactly `content=1 portal=0 health_ct=application/json; charset=utf-8 embed=301`; then
    **`gate=PASS`**.
  - `gate=HALT` **stops the task.** The per-box and per-host lines are printed for the record and read by eye
    against the three bullets below; the `gate` line covers the repo-side rows mechanically.
  - `pl=present` on a box → **STOP**, Task 17 Step 9 did not complete there; this task's before/after probe
    would measure `partnerLanding`, not the quarantine.
  - Any `content=0`, `portal=1`, `text/html` or `embed=200` → **STOP**: that host is back on `:3000` and
    deleting the quarantine changes live behaviour on it.
  - `tree_clean` ≠ 0 → **STOP** (an uncommitted edit would ride along in this commit).

- [ ] **Step 2: the live state, and the blast radius.** This is the step the draft got backwards.

```bash
cd "$AFF"
for IP in 161.153.71.201 144.24.4.202; do
  printf '%s ' "$IP"
  ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@"$IP" "cd /var/www/wavemax/wavemax-affiliate-program && \
    printf 'quarantine_true=%s corporate=%s\n' \
      \"\$(grep -c '^QUARANTINE_NON_AUSTIN=true\$' .env)\" \
      \"\$(sed -n 's/^CORPORATE_SITE_URL=//p' .env | tail -1)\""
done
grep -n "CORPORATE_SITE_URL ||" server/config/quarantineConfig.js
KEEP='^(server\.js|server/middleware/locationQuarantine\.js|server/config/quarantineConfig\.js|tests/integration/locationQuarantine\.test\.js|tests/unit/(adminIpAuthz|scanbag|wavemaxAffiliatePage)\.test\.js|\.env\.example)$'
git grep -lI -E 'locationQuarantine|quarantineConfig|QUARANTINE_NON_AUSTIN|CORPORATE_SITE_URL' \
  -- server server.js public tests scripts .env.example | grep -vE "$KEEP"
echo "OUTSIDE_DELETION_SET=${PIPESTATUS[1]}"
printf 'quarantine test consumers = '
git grep -lI 'config/quarantineConfig' -- tests | tr '\n' ' '; echo
printf 'franchisor literal in server/ = %s\n' "$(git grep -lI 'www\.wavemaxlaundry\.com' -- server server.js | tr '\n' ' ')"
for P in /austin-tx/ /api/austin-tx/x /franchise-default/x /data/franchises.json; do
  printf 'portal %-26s ' "$P"
  ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 \
    "curl -s -o /dev/null -m 10 -H 'Host: portal.atxwashdryfold.com' -H 'X-Forwarded-Proto: https' -w '%{http_code}\n' http://127.0.0.1:3000$P"
done
```
  - Expected: two lines `quarantine_true=1 corporate=https://atxwashdryfold.com` — **[MEASURED] exactly this
    today.** A `0` would mean the flag was turned off between assembly and execution: record it and continue
    (the deletion is correct either way); **do not** treat it as a STOP, and **do not** treat `1` as one.
  - Then `14:  (process.env.CORPORATE_SITE_URL || 'https://www.wavemaxlaundry.com').replace(/\/+$/, '');` —
    the hardcoded franchisor default, in one line.
  - Then the set-difference grep prints **nothing** and `OUTSIDE_DELETION_SET=1`. Any path printed is a
    consumer this task does not handle → **STOP** and add it to **Files** before deleting.
  - Then `quarantine test consumers = ` followed by **0, 1, 2 or 3** of
    `tests/unit/adminIpAuthz.test.js tests/unit/scanbag.test.js tests/unit/wavemaxAffiliatePage.test.js`
    ([MEASURED] all **three** today; fewer means Task 16 already removed a `describe` that also used
    `partnerLanding._isExempt`). Record the number; Step 5 edits exactly those files.
  - Then `franchisor literal in server/ = server/config/quarantineConfig.js` — **one** path, the file being
    deleted. A second path means `server/` has another franchisor reference this task does not remove →
    record it as an ESCALATIONS row and continue.
  - Then four `portal … 404` lines: the retired allowlist entries name nothing the portal still serves. A
    `200` on any of them is live retired surface → record an ESCALATIONS row; it is **not** a STOP for this
    task (the quarantine allows those paths, so deleting it cannot expose them).

- [ ] **Step 3: falsify the "nothing 302s" assertion before trusting it (R-9 / C-11).** Step 8 asserts that
      deleting the middleware changes no status code. That assertion is worthless unless the middleware
      *can* 302 — so break it deliberately, see it fire, restore.

```bash
cd "$AFF"
# positive control: force the quarantine on, with a host that is NOT the portal and NOT store-IP
NODE_ENV=test QUARANTINE_NON_AUSTIN=true CORPORATE_SITE_URL=https://example.invalid node -e '
const q = require("./server/config/quarantineConfig");
const mw = require("./server/middleware/locationQuarantine");
const run = (host, path) => new Promise((res) => {
  const req = { path, originalUrl: path, hostname: host, headers: {}, get: () => undefined,
                ip: "203.0.113.9", connection: { remoteAddress: "203.0.113.9" } };
  const r = { redirect: (c, l) => res(`${c} ${l}`) };
  mw(req, r, () => res("next"));
});
(async () => {
  console.log("enabled            =", q.isQuarantineEnabled());
  console.log("marketing/dead     =", await run("rundberglaundry.com", "/some-marketing-page"));
  console.log("marketing/suspect  =", await run("rundberglaundry.com", "/wp-login.php"));
  console.log("portal/dead        =", await run("portal.atxwashdryfold.com", "/some-marketing-page"));
  console.log("allowlisted        =", await run("rundberglaundry.com", "/health"));
  console.log("default_when_unset =", require("./server/config/quarantineConfig").CORPORATE_SITE_URL);
})();'
NODE_ENV=test QUARANTINE_NON_AUSTIN=true node -e '
delete process.env.CORPORATE_SITE_URL;
console.log("hardcoded_fallback =", require("./server/config/quarantineConfig").CORPORATE_SITE_URL);'
```
  - Expected, exactly:
    ```
    enabled            = true
    marketing/dead     = 302 https://example.invalid/some-marketing-page
    marketing/suspect  = 302 https://example.invalid/
    portal/dead        = next
    allowlisted        = next
    default_when_unset = https://example.invalid
    hardcoded_fallback = https://www.wavemaxlaundry.com
    ```
  - **This is the whole task in seven lines.** The middleware 302s (so Step 8's "no 302" can fail); the portal
    host is exempt (so it fires on nothing today); and with `CORPORATE_SITE_URL` unset it points at the
    **franchisor**, which is the live defect the deletion removes.
  - `marketing/dead = next` → the middleware is already inert for a reason this plan has not measured:
    **STOP** and re-measure before deleting anything.
  - Record both outputs in the PR body. Nothing was changed on any box; the env vars are process-local.

- [ ] **Step 4: write the failing guard.** Create `tests/unit/quarantineRetired.test.js` asserting:
      the three deleted paths do **not** exist (`fs.existsSync` → `false`);
      `server.js` matches neither `locationQuarantine` nor `quarantineConfig` nor `QUARANTINE_NON_AUSTIN`;
      `require('../../server/config/quarantineConfig')` **throws** `MODULE_NOT_FOUND`;
      no tracked file under `server/` contains `wavemaxlaundry.com` **at all** (a `res.redirect` to it is the
      hazard, and after this commit there is no comment naming it either — so the assertion is the strong
      form, `git grep -c` = 0, not a redirect-only regex);
      `.env.example` matches neither `QUARANTINE_NON_AUSTIN` nor `CORPORATE_SITE_URL` **nor the orphan comment**
      (`grep -ci 'quarantine' .env.example` = 0);
      and `POST`/`GET` on `/some-marketing-page` with `Host: rundberglaundry.com` returns **404**, not 302,
      through `supertest` with `QUARANTINE_NON_AUSTIN=true` explicitly set — the positive control from Step 3,
      inverted, which is the one assertion that fails if the mount survives the edit.

- [ ] **Step 5: run it red.**

```bash
cd "$AFF" && npx jest tests/unit/quarantineRetired.test.js 2>&1 | tail -30
```
  - Expected: every test failing, the first being
    `server/middleware/locationQuarantine.js does not exist` → `Expected: false / Received: true`, and the
    supertest case failing with `302` where `404` was expected.
  - `Tests: 0 total` → the file was not written: **STOP.**

- [ ] **Step 6: delete, and edit by content.**

```bash
cd "$AFF"
git rm -q server/middleware/locationQuarantine.js server/config/quarantineConfig.js \
          tests/integration/locationQuarantine.test.js
```
  Then hand-edit, **locating by content, never by line number**:
  `server.js` — the `require('./server/middleware/locationQuarantine')` line, the `app.use(locationQuarantine)`
  line, and the three comment blocks that describe it (including the favicon note *"Must run BEFORE
  locationQuarantine"*, which must lose the clause, not the comment);
  and each test file Step 2 named — remove the whole `describe` block that requires `quarantineConfig`. In
  `scanbag.test.js` and `wavemaxAffiliatePage.test.js` the block's loop asserts **both**
  `partnerLanding._isExempt(p)` and `quarantine.isAllowed(p)`; `partnerLanding` is already gone, so the whole
  `describe` goes.

```bash
cd "$AFF"
printf 'server.js hits  = %s\n' "$(grep -cE 'locationQuarantine|quarantineConfig|QUARANTINE_NON_AUSTIN' server.js || true)"
printf 'tests hits      = %s\n' "$(git grep -c 'quarantineConfig' -- tests | wc -l)"
printf 'partnerLanding in tests = %s\n' "$(git grep -l 'partnerLanding' -- tests | tr '\n' ' ')"
node --check server.js && echo SYNTAX_OK
node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK')" 2>&1 | tail -2
```
  - Expected: `server.js hits = 0`; `tests hits = 0`; `partnerLanding in tests = ` (empty — Task 16 removed
    the rest); `SYNTAX_OK`; `BOOT_OK`.
  - A non-empty `partnerLanding in tests` is **Task 16's** unfinished business, not this task's: record it,
    fix it here (the project rule is *fix everything before advancing*), and name it in the commit body.

- [ ] **Step 7 (HUMAN-CONFIRM): `.env.example` loses both keys and their comment block.** Say exactly this:
  > `.env.example` loses `QUARANTINE_NON_AUSTIN` and `CORPORATE_SITE_URL` together with the three comment
  > lines above them. The middleware that read both is deleted in this commit, so nothing reads either key.
  > Both keys **stay** in each box's `.env` for now — they become unread, not harmful, and Task 29 removes
  > them from the boxes with the rest of the dead keys rather than opening a production window for two inert
  > values. Note that `QUARANTINE_NON_AUSTIN` is currently `true` on both boxes and
  > `CORPORATE_SITE_URL=https://atxwashdryfold.com`; the repo's hardcoded fallback was still the franchisor,
  > and that is what this removes. Proceed?

```bash
cd "$AFF"
perl -0pi -e 's/(?:^#[^\n]*\n)*^QUARANTINE_NON_AUSTIN=[^\n]*\n//m; s/(?:^#[^\n]*\n)*^CORPORATE_SITE_URL=[^\n]*\n//m' .env.example
grep -cE '^(QUARANTINE_NON_AUSTIN|CORPORATE_SITE_URL)=' .env.example || true
grep -ciE 'quarantine|wavemaxlaundry' .env.example || true
grep -c '^EXPEDITER_TOKEN=' .env.example
```
  - Expected: `0`, `0`, `1` — both keys gone, **no orphan comment describing a removed key**, and an unrelated
    key untouched (the negative control that proves the `perl -0` did not over-match). A non-zero second
    number means a comment block outlived its key: fix it here. A bare `sed -i '/^KEY=/d'` leaves three such
    lines, which is why this is `perl -0`.

```bash
cd "$AFF"
WS_REC=/var/www/wavemax/cutover-logs/plan3-record.env
recput() { printf '%s=%q\n' "$1" "$2" >> "$WS_REC"; ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "printf '%s=%s\n' '$1' '$2' >> $WS_REC"; }
recput T36_DEAD_ENV_KEYS 'QUARANTINE_NON_AUSTIN,CORPORATE_SITE_URL'
# re-derive from git rather than re-typing Step 2's number (the edits are already staged,
# so this counts what SURVIVED; it must be 0 by now)
recput T36_QUARANTINE_TEST_CONSUMERS_REMAINING "$(git grep -l 'config/quarantineConfig' -- tests | wc -l)"
grep -cE '^T36_DEAD_ENV_KEYS=' "$WS_REC"
grep -E '^T36_QUARANTINE_TEST_CONSUMERS_REMAINING=' "$WS_REC" | tail -1
```
  - Expected: `1`, then `T36_QUARANTINE_TEST_CONSUMERS_REMAINING=0`. Task 29's classifier reads the two keys as
    newly dead on both boxes.
  - A non-zero `…_REMAINING` means a test file still requires `quarantineConfig` and the commit would red on
    `Cannot find module`: fix it before Step 8.

- [ ] **Step 8: green, and prove the box behaviour is unchanged.**

```bash
cd "$AFF"
npx jest tests/unit/quarantineRetired.test.js tests/unit/adminIpAuthz.test.js tests/unit/scanbag.test.js \
         tests/unit/wavemaxAffiliatePage.test.js tests/unit/authMiddleware.test.js 2>&1 | grep -E '^(Tests:|Test Suites:)|✕'
npx madge --circular server/ 2>&1 | tail -2
npx eslint server/ server.js 2>&1 | grep -E 'problems?' | tail -1
printf 'storeIPs consumers = %s\n' "$(git grep -l "config/storeIPs" -- server server.js | grep -v 'server/config/storeIPs.js' | tr '\n' ' ')"
```
  - Expected: a `Tests:` line with no `✕` and `failed` absent across the five suites;
    `✔ No circular dependency found!`; an ESLint total **4 lower** than the value recorded before this task
    ([MEASURED] 209 → **205** if this runs before tasks 39/42/45; Task 17 and Task 18 have already removed 11,
    so the live number will be lower — assert the **delta**, not the total);
    then `storeIPs consumers = server/middleware/auth.js` — **one** path, which is exactly what **Task 45**
    Step 1 needs to pass.
  - `storeIPs consumers` naming `partnerLanding.js` → C36-1 lied: **STOP.**

- [ ] **Step 9: commit.**

```bash
cd "$AFF"
git add -A server server.js tests .env.example
git commit -m "chore: delete locationQuarantine -- the last code path that can 302 a user to the franchisor

QUARANTINE_NON_AUSTIN is true on BOTH boxes, so the middleware is ENABLED in
production -- the opposite of what the draft assumed. It nonetheless fires on no
host and no path: locationQuarantine.js's isOwnPortalHost() exempts
portal.atxwashdryfold.com and atxwashdryfold.com, and on the marketing hosts
partnerLanding pre-empted it before Task 16 deleted it and nginx now routes those
hosts to the content app on :3001. Measured on oci1 across four hosts x three
paths: twelve non-302 responses. This is cleanup, not an emergency.

What it removes is real, though. CORPORATE_SITE_URL was repointed on both boxes
from the franchisor to https://atxwashdryfold.com, but quarantineConfig.js:14
still hardcoded '|| https://www.wavemaxlaundry.com' as the fallback -- one unset
env var away from 302ing our own users onto the franchisor's site during a live
trademark/DMCA dispute. Deleting the middleware removes the default entirely,
which beats editing it. server/ now contains no wavemaxlaundry.com literal at all.

Its allowlist also still admitted /austin-tx, /api/austin-tx/, /franchise-default/
and /data/franchises.json -- four subsystems retired in Phase 4b -- plus
/design-explorer, retired in Task 17. All four paths measure 404 on the portal.

The two env keys stay on the boxes: unread is not harmful, and Task 29 removes
them with the rest of the dead keys rather than opening a window for two inert
values. .env.example loses both, with their comment block.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
SHA=$(git rev-parse HEAD); echo "T36_SHA=$SHA"
WS_REC=/var/www/wavemax/cutover-logs/plan3-record.env
printf 'T36_SHA=%s\nT36_DONE=yes\n' "$SHA" >> "$WS_REC"
ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "printf 'T36_SHA=%s\nT36_DONE=yes\n' '$SHA' >> $WS_REC"
```
  - Expected: one commit, pushed; `T36_SHA=<40 hex>`; the record rows written in both copies (C-14).

**Rollback (exact; repo-only — nothing is deployed by this task).**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; cd "$AFF"
WS_REC=/var/www/wavemax/cutover-logs/plan3-record.env
T36_SHA=$(sed -n 's/^T36_SHA=//p' "$WS_REC" | tail -1); test -n "$T36_SHA" || { echo 'STOP: no T36_SHA'; exit 1; }
git revert --no-edit "$T36_SHA"
ls server/middleware/locationQuarantine.js server/config/quarantineConfig.js
NODE_ENV=test QUARANTINE_NON_AUSTIN=true CORPORATE_SITE_URL=https://example.invalid node -e '
const mw=require("./server/middleware/locationQuarantine");
mw({path:"/some-marketing-page",originalUrl:"/some-marketing-page",hostname:"rundberglaundry.com",headers:{},get:()=>undefined,ip:"203.0.113.9",connection:{remoteAddress:"203.0.113.9"}},
   {redirect:(c,l)=>console.log("RESTORED",c,l)},()=>console.log("STILL_GONE"));'
node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK')" | tail -1
grep -cE '^(QUARANTINE_NON_AUSTIN|CORPORATE_SITE_URL)=' .env.example
```
- Rollback expected: the revert commit line; both paths listed;
  `RESTORED 302 https://example.invalid/some-marketing-page`; `BOOT_OK`; `2`.
- **`RESTORED 302 …` is the discriminating assertion.** `ls` succeeding proves the files came back;
  only exercising the middleware proves it is *mounted and functioning*. `STILL_GONE` means the revert was
  partial: `git checkout "$T36_SHA"~1 -- server/ server.js tests/ .env.example`.
- Neither box `.env` is touched by this task, so the rollback does not resurrect a secret (**R-11**) and has
  no box step. If the revert is taken **after Task 24 deployed**, `git pull --ff-only && pm2 reload wavemax
  --update-env` on one box at a time under `BOX_BUSY` (C-7).

---

### Task 37: [affiliate] the portal's host surface names only `portal.atxwashdryfold.com`

> **Execution position: Phase 2, immediately after Task 19** (so the bridges' host allowlists are already
> gone) **and after Task 36** (so `quarantineConfig.js`'s franchisor comment is already gone). Repo-only;
> delivered to the boxes by Task 24.
>
> **Why this is its own commit and not part of Task 16.** Deleting the marketing *pages* leaves the marketing
> *hosts* named throughout the portal's **live security configuration**: the CSP `img-src`/`connect-src`
> extras, the credentialed CORS allowlist, `allowedHosts`, the HTTPS-redirect fallback, the per-host sitemap
> and robots map, and a family of `process.env.BASE_URL || 'https://rundberglaundry.com'` defaults. That is
> grant-of-reach to origins this app no longer has any relationship with.
>
> **The one that is not merely stale.** [MEASURED] `server/services/email/dispatcher/ops.js:44` and `:65`
> **hard-code** `https://rundberglaundry.com/monitoring-dashboard.html` into the body of the
> `sendServiceDownAlert` email — HTML and plain-text halves, with **no `BASE_URL`** and no env override. Its
> caller is `server/monitoring/connectivity-monitor.js:279`. So the portal's outage alert tells an operator to
> open a dashboard on a host the portal no longer serves: after the flips that URL reaches the **content app**,
> which 404s it. Every other marketing-host literal in `server/` is a `BASE_URL ||` fallback that production
> never takes (`BASE_URL=https://portal.atxwashdryfold.com` on both boxes, [MEASURED]); these two are the live
> ones.
>
> **Scope is derived, not pinned.** X11 said "30 residual literals across 8 files"; slice B said 16.
> [MEASURED] today, before tasks 3/16/19/36: **52** matching lines across **26** files, most of them inside
> files those tasks delete. Step 1 derives the residual set at execution time and records it; no number in
> this task is a literal.

**Files:**
- Modify: `server.js` — five regions, **located by content**:
  `allowedHosts` ([MEASURED] `:173-181` — drop `rundberglaundry.com` and `www.rundberglaundry.com`);
  the HTTPS-redirect fallback (`:192` — `rundberglaundry.com` → `portal.atxwashdryfold.com`);
  `APP_LOCATION_ORIGINS` (`:245-251` — keep only `https://portal.atxwashdryfold.com`);
  `wavemaxDomains` inside `corsOptions` (`:299-303` — keep only the portal, or delete the array and rely on
  `CORS_ORIGIN`, which is Task 44's shape — **this task keeps the array with one entry** so the two changes
  stay independently revertable);
  the sitemap/robots host handling (`:907`, `:944` `req.hostname` defaults; `managedHosts` `:952-958`;
  the fallback `:964`) — all → `portal.atxwashdryfold.com`.
- Modify: `server/modules/bags/labelSheetService.js:89`, `server/modules/onboarding/inviteService.js:27`,
  `server/services/email/dispatcher/admin.js:103`, `…/affiliate.js:14`, `…/customer.js:108`, `…/customer.js:614`,
  `…/operator.js:105`, `…/operator.js:221`, `…/operator.js:342`,
  `server/services/email/template-manager.js:46` — the ten `BASE_URL ||` defaults → the portal.
- Modify: `server/services/email/dispatcher/ops.js` — `:44` and `:65` become
  `${process.env.BASE_URL || 'https://portal.atxwashdryfold.com'}/monitoring-dashboard.html`, hoisted to one
  `const dashboardUrl` so the HTML and text halves cannot drift.
- Modify: `public/affiliate-landing-embed.html:8` (page-level CSP `connect-src` — drop
  `https://rundberglaundry.com`), `public/assets/js/affiliate-landing-init.js:37` (`<a href>` → `/`),
  `public/embed-landing.html:294` (`<a href="https://rundberglaundry.com/operator">` → `/operator`).
- Modify: whatever `tests/unit/domain-guard.test.js`, `tests/fixtures/domain-guard-baseline.json` and
  `tests/integration/domainMigration.test.js` pin about the old lists (Step 1 measures which).
- Create: `tests/integration/portalHostSurface.test.js`.
- **Deliberately NOT changed, and escalated rather than silently skipped:**
  - `public/privacy-policy.html:35-39` and `public/terms-and-conditions.html:34` — the `<code>`-wrapped
    host lists in **legal body copy**, and the four `privacy@rundberglaundry.com` / `legal@rundberglaundry.com`
    mailto addresses (`privacy-policy.html:119,129,150,183`, `terms-and-conditions.html:139,164`). Those are
    published legal contact points on a **live mailbox**; changing them is an owner/counsel decision, not a
    host-surface cleanup. → ESCALATIONS row.
  - `server/config/links.js:10,13` — comments that name `atxwashdryfold.com` as the content origin. Correct.
  - No redirect is added from `portal.atxwashdryfold.com/affiliate` to the content origin. The only inbound
    paths to the interest form were the marketing hosts, corporate now owns them, and `INTEREST_FORM_URL`
    (Task 2) is the config-driven answer. A redirect would re-create exactly the cross-app link the
    separation exists to remove. **Recorded as a conscious close**, per slice B.

**Interfaces:**

*Consumes — every row asserted by the named step; failure halts the task:*

| # | consumed artefact | asserted by |
|:--|:--|:--|
| C37-1 | **Task 16 landed**: `public/partner-program.html`, `public/affiliate.html` and `server/middleware/partnerLanding.js` are gone, so their ~20 marketing-host literals are not in this task's scope | **Step 0** (three `test ! -e`) |
| C37-2 | **Task 19 landed**: the four bridge files are gone, so their 10 host-allowlist literals are not in scope | **Step 0** (four `test ! -e`) |
| C37-3 | **Task 36 landed**: `server/config/quarantineConfig.js` is gone, so `server/` holds no `wavemaxlaundry.com` literal and the CORS/CSP narrowing cannot strand a redirect target | **Step 0** (`test ! -e` **and** `git grep -c 'wavemaxlaundry\.com' -- server server.js` = 0) |
| C37-4 | **Task 3 landed**: both legal canonicals already point at the portal and `embed-landing.html:314`/`:317` are already relative — so a second edit here would be a silent no-op | **Step 0** (four greps: 2 canonicals = portal, 2 script `src` = relative) |
| C37-5 | no page the portal still serves loads an asset from a marketing origin — narrowing CSP `img-src`/`connect-src` therefore breaks nothing | **Step 2** (grep over surviving `public/**` for a marketing-origin `src`/`href`/`fetch`, after this task's own three fixes are excluded) |
| C37-6 | **no corporate page makes a credentialed cross-origin call to the portal API** — narrowing CORS therefore breaks nothing | **Step 2b** (grep the corporate content tree for `portal.atxwashdryfold.com` + `credentials`, empty; and the live `Access-Control-Allow-Origin` probe before/after) |
| C37-7 | production `BASE_URL` is the portal on both boxes, so the ten `||` fallbacks are unreachable today and this is a latent-defect fix, not a behaviour change | **Step 0** (per-box `grep -c '^BASE_URL=https://portal\.atxwashdryfold\.com$'` = 1) |

*Produces:*
- every in-code host list in the portal names only `portal.atxwashdryfold.com`, plus the three documented
  retirement-301 hosts (`wavemax.promo`, `www.wavemax.promo`, `affiliate.wavemax.promo`) and `localhost:3000`
  in `allowedHosts`;
- outage-alert emails link to a dashboard the portal actually serves;
- `tests/integration/portalHostSurface.test.js`, falsified once;
- record: `T37_DONE=yes`, `T37_SHA`, `T37_LITERALS_BEFORE`, `T37_LITERALS_AFTER`,
  `T37_ESCALATE_LEGAL_CONTACTS=yes`;
- ESCALATIONS rows: the legal-copy host lists + four mailto addresses (owner/counsel); `wavemax.promo`'s
  eventual removal from `allowedHosts` when the retirement 301s are switched off.

- [ ] **Step 0: assert every Consumes row, then derive this task's scope.**

```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; CORP=/mnt/c/Users/rickh/GitHub/crhs-corporate
cd "$AFF"
FAIL=0
chk()  { if [ "$2" = "$3" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=[$2] want=[$3]"; FAIL=1; fi; }
gone() { if [ ! -e "$1" ]; then echo "  OK   gone $1"; else echo "  FAIL still present $1"; FAIL=1; fi; }

gone public/partner-program.html; gone public/affiliate.html; gone server/middleware/partnerLanding.js
gone public/assets/js/iframe-bridge-v2.js; gone public/assets/js/iframe-bridge-v2.min.js
gone public/assets/js/parent-iframe-bridge-v3.js; gone public/assets/js/parent-iframe-bridge-v3.min.js
gone server/config/quarantineConfig.js; gone server/middleware/locationQuarantine.js
chk franchisor_in_server "$(git grep -c 'wavemaxlaundry\.com' -- server server.js | wc -l)" 0
chk t3_canon_privacy "$(grep -c 'rel="canonical" href="https://portal\.atxwashdryfold\.com/privacy-policy"' public/privacy-policy.html)" 1
chk t3_canon_terms   "$(grep -c 'rel="canonical" href="https://portal\.atxwashdryfold\.com/terms-and-conditions"' public/terms-and-conditions.html)" 1
chk t3_rel_314 "$(sed -n '314p' public/embed-landing.html | grep -c 'src="/assets/js/embed-navigation.js"')" 1
chk t3_rel_317 "$(sed -n '317p' public/embed-landing.html | grep -c 'src="/assets/js/revenue-calculator.js')" 1
chk tree_clean "$(git status --porcelain | wc -l)" 0
for IP in 161.153.71.201 144.24.4.202; do
  chk "base_url_$IP" "$(ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@$IP \
    "grep -c '^BASE_URL=https://portal\.atxwashdryfold\.com\$' /var/www/wavemax/wavemax-affiliate-program/.env")" 1
done
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: nine `OK gone …` lines, then every `chk` line `OK`, then `gate=PASS`.
  - `gate=HALT` **stops the task.** A `FAIL still present public/partner-program.html` means Task 16 has not
    landed and this task's scope is 20 literals larger than **Files** says. A `FAIL t3_canon_privacy` means
    Task 3 has not landed and the two canonical edits this task deliberately omits are still open.

```bash
cd "$AFF"
RE="https?://(www\.)?(rundberglaundry|runberglaundry|atxwashateria|atxwashdryfold)\.com"
git grep -nI -E "$RE" -- server server.js public | grep -v 'portal\.atxwashdryfold\.com' | tee /tmp/t37-before.txt
printf 'T37_LITERALS_BEFORE=%s files=%s\n' "$(wc -l < /tmp/t37-before.txt)" "$(cut -d: -f1 /tmp/t37-before.txt | sort -u | wc -l)"
cut -d: -f1 /tmp/t37-before.txt | sort | uniq -c | sort -rn
```
  - Expected: a line count and a per-file histogram. **[MEASURED] today, before tasks 3/16/19/36: 52 lines in
    26 files.** After those four have landed the derived figure is **32 lines in 14 files** — but record what
    the command prints, not that number, and reconcile any difference against **Files** before editing. A
    file in the histogram that **Files** does not name is either newly introduced or a task-16/19 miss:
    **STOP** and reconcile.
  - `recput T37_LITERALS_BEFORE <n>`.

- [ ] **Step 1: write the failing guard.** Create `tests/integration/portalHostSurface.test.js` asserting,
      each with a **positive control** so it cannot pass vacuously:
      the CSP header on `GET /` (Host `portal.atxwashdryfold.com`) contains `portal.atxwashdryfold.com` **and**
      matches no marketing apex in `img-src` or `connect-src`;
      a credentialed CORS preflight from `https://rundberglaundry.com` gets **no**
      `Access-Control-Allow-Origin`, while one from `https://portal.atxwashdryfold.com` gets exactly that
      origin (the second is the control — if both are refused the test is measuring a broken CORS layer);
      `GET /sitemap.xml` on Host `portal.atxwashdryfold.com` emits `https://portal.atxwashdryfold.com/` and
      nothing else, and on an unknown Host falls back to the **portal**, not `rundberglaundry.com`;
      `GET /robots.txt` on an unknown Host emits `Sitemap: https://portal.atxwashdryfold.com/sitemap.xml`;
      `labelSheetService` and `inviteService` resolve their default base URL to the portal with `BASE_URL`
      **deleted from `process.env`** (that deletion is what makes the assertion able to fail);
      `sendServiceDownAlert`'s rendered HTML **and** text both contain
      `https://portal.atxwashdryfold.com/monitoring-dashboard.html` and neither contains `rundberglaundry.com`,
      with `BASE_URL` unset — asserted by capturing the `sendEmail` argument through a `jest.mock`;
      and `grep`-style assertions over `public/affiliate-landing-embed.html`,
      `public/assets/js/affiliate-landing-init.js` and `public/embed-landing.html` that none names a marketing
      apex.

- [ ] **Step 2: run it red, and prove nothing loads from a marketing origin.**

```bash
cd "$AFF"
npx jest tests/integration/portalHostSurface.test.js 2>&1 | tail -30
RE="https?://(www\.)?(rundberglaundry|runberglaundry|atxwashateria|atxwashdryfold)\.com"
git grep -nI -E "(src|href)=\"$RE|fetch\(\s*[\"'\`]$RE" -- public \
  | grep -v 'portal\.atxwashdryfold\.com' \
  | grep -vE '^(public/affiliate-landing-embed\.html|public/assets/js/affiliate-landing-init\.js|public/embed-landing\.html):'
echo "OTHER_PAGES_LOADING_MARKETING_ORIGIN=${PIPESTATUS[2]}"
```
  - Expected: every test failing — the first showing the live CSP header with `https://rundberglaundry.com`
    present in `img-src`, and the `ops.js` case failing with `rundberglaundry.com` in the captured body.
  - Then the grep prints **nothing** and `OTHER_PAGES_LOADING_MARKETING_ORIGIN=1`: the only three surviving
    pages that reference a marketing origin are the three this task fixes. **Any fourth path → STOP**: it
    would break when CSP `connect-src`/`img-src` is narrowed.

- [ ] **Step 2b: prove no corporate page calls the portal API with credentials.**

```bash
CORP=/mnt/c/Users/rickh/GitHub/crhs-corporate; cd "$CORP"
git grep -nI 'portal\.atxwashdryfold\.com' -- content public server 2>/dev/null | head -20
printf 'corp_refs=%s corp_credentialed=%s\n' \
  "$(git grep -lI 'portal\.atxwashdryfold\.com' -- content public server 2>/dev/null | wc -l)" \
  "$(git grep -lI -E "credentials:\s*['\"]include" -- content public 2>/dev/null | wc -l)"
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com; do
  printf '%-22s ' "$H"
  curl -s -o /dev/null -m 15 -H "Origin: https://$H" \
    -w 'preflight_acao=[%{header_json}]\n' -X OPTIONS "https://portal.atxwashdryfold.com/api/v1/addons" 2>/dev/null \
    | grep -o '"access-control-allow-origin":[^]]*]' || echo 'acao=absent'
done
```
  - Expected: `corp_credentialed=0`; and for all three hosts `acao=absent` **or** an
    `access-control-allow-origin` echoing that marketing origin. Whichever it is, **record it** — it is the
    before-state that Step 5 re-probes.
  - `corp_credentialed` > 0 → **STOP** and read the file: a corporate page making a credentialed call to the
    portal API is exactly what the `wavemaxDomains` entries were for, and removing them would break it.
  - ⚠️ A cross-origin `OPTIONS` through Cloudflare may be answered by the edge. If the header is ambiguous,
    re-probe on-box against `:3000` with `-H "X-Forwarded-Proto: https"` (**R-5**) before and after Step 4.

- [ ] **Step 3: falsify the CORS assertion (R-9 / C-11).** The "marketing origin is refused" assertion must
      be shown able to fail.

```bash
cd "$AFF"
NODE_ENV=test CORS_ORIGIN=https://portal.atxwashdryfold.com node -e '
const src = require("fs").readFileSync("server.js","utf8");
const m = src.match(/const wavemaxDomains = \[([^\]]*)\]/);
console.log("wavemaxDomains today =", m ? m[1].replace(/\s+/g," ").trim() : "NOT FOUND");
console.log("marketing_entries    =", m ? (m[1].match(/rundberglaundry|atxwashateria|(?<!portal\.)atxwashdryfold/g)||[]).length : "n/a");'
```
  - Expected: the array printed verbatim, and `marketing_entries = 3` ([MEASURED]
    `https://atxwashateria.com`, `https://atxwashdryfold.com`, `https://rundberglaundry.com`).
  - `NOT FOUND` means the array was renamed or already removed: **STOP** and re-read `server.js` — a
    content-located edit against a region that no longer exists is the silent-no-op defect.
  - `marketing_entries = 0` means the narrowing has already happened and Step 2's red test could not have
    failed for the stated reason: **STOP** and re-measure.

- [ ] **Step 4: edit, by content, then re-derive the count.**

```bash
cd "$AFF"
# after the hand edits:
RE="https?://(www\.)?(rundberglaundry|runberglaundry|atxwashateria|atxwashdryfold)\.com"
git grep -nI -E "$RE" -- server server.js public | grep -v 'portal\.atxwashdryfold\.com' | tee /tmp/t37-after.txt
printf 'T37_LITERALS_AFTER=%s files=%s\n' "$(wc -l < /tmp/t37-after.txt)" "$(cut -d: -f1 /tmp/t37-after.txt | sort -u | wc -l)"
cut -d: -f1 /tmp/t37-after.txt | sort -u
node --check server.js && echo SYNTAX_OK
node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK')" 2>&1 | tail -2
printf 'ops dashboard hoisted = %s\n' "$(grep -c 'const dashboardUrl' server/services/email/dispatcher/ops.js)"
printf 'ops marketing refs    = %s\n' "$(grep -cE "$RE" server/services/email/dispatcher/ops.js || true)"
printf 'allowedHosts kept     = '; sed -n '/const allowedHosts = \[/,/\];/p' server.js | grep -oE "'[^']+'" | tr '\n' ' '; echo
```
  - Expected: `/tmp/t37-after.txt` lists **only** `public/privacy-policy.html` and
    `public/terms-and-conditions.html` — the deliberately-excluded legal copy and mailto addresses — and
    nothing under `server/` or `server.js`; `SYNTAX_OK`; `BOOT_OK`;
    `ops dashboard hoisted = 1`; `ops marketing refs = 0`;
    and `allowedHosts kept = 'portal.atxwashdryfold.com' 'wavemax.promo' 'www.wavemax.promo'
    'affiliate.wavemax.promo' 'localhost:3000'` — five entries, the three `wavemax.promo` rows kept because
    they are the documented retirement 301s.
  - Any surviving `server/` or `server.js` line → the content-located edit missed a region: fix it here.
  - `ops dashboard hoisted = 0` → the HTML and text halves can still drift; hoist it.

- [ ] **Step 5: green, and re-probe the live CORS/CSP before-state for the record.**

```bash
cd "$AFF"
npx jest tests/integration/portalHostSurface.test.js tests/unit/domain-guard.test.js \
         tests/integration/domainMigration.test.js tests/integration/csp.test.js \
         tests/integration/cors.test.js tests/unit/affiliateEmailUrls.test.js \
         tests/unit/branding-guard.test.js 2>&1 | grep -E '^(Tests:|Test Suites:)|✕'
npx madge --circular server/ 2>&1 | tail -2
npx eslint server/ server.js 2>&1 | grep -E 'problems?' | tail -1
```
  - Expected: a `Tests:` line with no `✕` and `failed` absent across the seven suites;
    `✔ No circular dependency found!`; an ESLint total **unchanged** from before this task (the edits are
    in-line replacements, so the delta is 0 — any change means a line was added or removed carelessly, and
    Task 26's derived arithmetic would drift).
  - ⚠️ `tests/unit/affiliateEmailUrls.test.js` is in `branding-guard`'s `EXCLUDED_FILES` *because it asserts
    the ABSENCE of the franchisor host in the affiliate email dispatcher*. It is the existing guard closest to
    this change; if it reds, this task changed a dispatcher URL in a way that suite pins.

- [ ] **Step 6: record the escalations, then commit.**

```bash
cd "$AFF"
WS_REC=/var/www/wavemax/cutover-logs/plan3-record.env
recput() { printf '%s=%q\n' "$1" "$2" >> "$WS_REC"; ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "printf '%s=%s\n' '$1' '$2' >> $WS_REC"; }
recput T37_LITERALS_AFTER "$(wc -l < /tmp/t37-after.txt)"
recput T37_ESCALATE_LEGAL_CONTACTS yes
recput T37_ESCALATE_LEGAL_NOTE 'privacy@/legal@rundberglaundry.com mailto + the <code> host lists in privacy-policy.html and terms-and-conditions.html are published legal contact points on a live mailbox: owner/counsel decision, not host cleanup'
grep -c '^T37_ESCALATE_LEGAL_CONTACTS=yes$' "$WS_REC"

git add -A server server.js public tests
git commit -m "chore(hosts): the portal's host surface names only portal.atxwashdryfold.com

The marketing hosts are served by crhs-corporate on :3001 and the portal's copies
of their pages are gone, but the HOSTS were still in the portal's CSP
img-src/connect-src extras, its credentialed CORS allowlist, allowedHosts, the
HTTPS-redirect fallback, the per-host sitemap/robots map and ten
'BASE_URL || https://rundberglaundry.com' defaults -- live configuration granting
CORS and CSP reach to origins this app no longer has any relationship with.

One of them was not merely stale. dispatcher/ops.js:44 and :65 HARD-CODED
https://rundberglaundry.com/monitoring-dashboard.html into both halves of the
outage-alert email, with no BASE_URL and no override, so a service-down alert
told the operator to open a dashboard on a host the portal no longer serves --
post-flip that URL reaches the content app, which 404s it. Both halves now read
one hoisted dashboardUrl so they cannot drift again.

wavemax.promo, www.wavemax.promo and affiliate.wavemax.promo stay in allowedHosts:
they are documented retirement 301s. No portal -> content-origin redirect is added
for /affiliate; INTEREST_FORM_URL is the config-driven answer and a redirect would
re-create exactly the cross-app link the separation removes.

Deliberately NOT changed: the <code> host lists in privacy-policy.html and
terms-and-conditions.html and the four privacy@/legal@rundberglaundry.com mailto
addresses. Those are published legal contact points on a live mailbox -- an
owner/counsel decision, escalated, not folded into a host-surface cleanup.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
SHA=$(git rev-parse HEAD); echo "T37_SHA=$SHA"
printf 'T37_SHA=%s\nT37_DONE=yes\n' "$SHA" >> "$WS_REC"
ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "printf 'T37_SHA=%s\nT37_DONE=yes\n' '$SHA' >> $WS_REC"
```
  - Expected: `1`, then one commit pushed, `T37_SHA=<40 hex>`, and the record rows in both copies.

**Rollback (exact; repo-only).**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; cd "$AFF"
WS_REC=/var/www/wavemax/cutover-logs/plan3-record.env
T37_SHA=$(sed -n 's/^T37_SHA=//p' "$WS_REC" | tail -1); test -n "$T37_SHA" || { echo 'STOP: no T37_SHA'; exit 1; }
git revert --no-edit "$T37_SHA"
node -e 'const s=require("fs").readFileSync("server.js","utf8");
const m=s.match(/const wavemaxDomains = \[([^\]]*)\]/);
console.log("marketing_entries_back="+(m?(m[1].match(/rundberglaundry|atxwashateria/g)||[]).length:0));'
grep -c 'rundberglaundry\.com' server/services/email/dispatcher/ops.js
node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK')" | tail -1
```
- Rollback expected: the revert commit; `marketing_entries_back=2` (or more); `2` from `ops.js`; `BOOT_OK`.
- **`marketing_entries_back` is the discriminating assertion** — a `git revert` that conflicts on `server.js`
  can leave the file half-reverted while `git log` shows a clean revert. A `0` means the revert did not
  restore the CORS array: `git checkout "$T37_SHA"~1 -- server.js server/ public/ tests/`.
- If the revert is taken **after Task 24 deployed**: CSP and CORS are computed at boot, so
  `git pull --ff-only && pm2 reload wavemax --update-env`, **one box at a time under `BOX_BUSY`** (C-7), then
  re-run Step 2b's live probe.

---

### Task 38: [affiliate] close both known-red guard suites — the affiliate suite has no known failures left

> **Execution position: Phase 4, FIRST — immediately before Task 25.**
>
> The skeleton's Phase 2–3 assembler wrote: *"Tasks 16–24 therefore never claim a fully green affiliate
> suite; each pins the exact residual shape instead."* That is honest, but it means every full-suite gate from
> Task 25 onward — and there are many, including all six of Task 26's batch gates and the eight adoption PRs —
> runs against a baseline that contains two real failures. A gate whose baseline is "2 failed" cannot
> distinguish "still 2" from "a different 2". Closing them **before** Task 25 makes every later gate mean what
> it says, which is why this goes first in Phase 4 rather than merely before Task 26.
>
> [MEASURED] today, with tasks 16–19 **not** yet landed:
> `npx jest tests/unit/branding-guard.test.js tests/unit/i18n-brand-token.test.js` →
> **`Test Suites: 2 failed, 2 total` / `Tests: 2 failed, 4 passed, 6 total`.**
>
> **Failure 1 — `i18n-brand-token.test.js:8`.** `expect(/wavemax/i.test(load(l))).toBe(false)` →
> `Expected: false / Received: true`, for all four languages. The hits are exactly two keys per language:
> `landing.footer.fulfillmentPartner` and `partner.footer.fulfillmentPartner`, both reading (en)
> *"WaveMAX Austin is the fulfillment partner for the atxwashdryfold program."* The test asserts a **blanket
> ban the owner reversed on 2026-09-08**: the app must name WaveMAX Austin as the exclusive fulfillment
> partner. `branding-guard`'s own `INFRA_ALLOW` already encodes the correct rule (`/WaveMAX Austin/gi`, with
> the comment *"the ONE permitted use of the mark"*). Task 16 removes the `partner` subtree, leaving one key
> per language. So this is a **stale assertion**, not a copy defect.
>
> **Failure 2 — `branding-guard.test.js:144`, `expect(offenders).toEqual([])`.** [MEASURED] the offender list
> today is **32 lines across 4 files**: `scripts/ops/cutover-gate.sh` (15),
> `tests/unit/ops/cutoverGateS1.test.js` (8), `tests/helpers/wavemaxAllowlist.js` (8),
> `tests/integration/webCoreConsumptionGolden.test.js` (1). **Task 16 deletes `tests/helpers/wavemaxAllowlist.js`**,
> leaving **24 lines across 3 files** — which is exactly the shape Task 17 Step 7 already expects
> (*"the three cutover-tooling files, 24 lines"*). All three are **Plan 2 cutover tooling** that must name the
> real hosts and the `WaveMAX Austin` mark in order to assert the content app's output.

**Files:**
- Modify: `tests/unit/i18n-brand-token.test.js` (the first test; **add** a positive control).
- Modify: `tests/unit/branding-guard.test.js` (`EXCLUDED_FILES` + a stale-entry check).
- **Not touched:** `public/locales/*/common.json`. The copy is owner-approved; the *test* is wrong.
- **Not touched:** `tests/fixtures/branding-guard-baseline.json` — the shrinking baseline is a separate
  mechanism from `EXCLUDED_FILES`, and Step 3 asserts it has no stale rows rather than editing it.

**Interfaces:**

*Consumes — every row asserted in Step 0; failure halts the task:*

| # | consumed artefact | asserted by |
|:--|:--|:--|
| C38-1 | **Task 16 landed**: `tests/helpers/wavemaxAllowlist.js` is gone (8 offender lines) and the `partner` locale subtree is gone (one `wavemax` key per language, not two) | **Step 0** (`test ! -e`, plus a four-language key count = 1) |
| C38-2 | **Tasks 17, 18, 19 landed**: their `EXCLUDED_FILES` / `EXCLUDED_PREFIXES` pruning is done, so any stale row this task finds is genuinely this task's | **Step 0** (`T19_SHA` is an ancestor of `HEAD`; `test ! -e` on `explorerGuard.js`, `partnerInquiryRoutes.js`, `iframe-bridge-v2.js`) |
| C38-3 | **Tasks 36, 37 landed** — they are the last Phase-2 commits that delete or edit tracked files, so the offender list is stable when this task pins it | **Step 0** (`test ! -e server/config/quarantineConfig.js`; `T37_SHA` ancestor) |
| C38-4 | the owner decision of 2026-09-08 — `WaveMAX Austin` is the one permitted use of the mark — is already encoded in the guard this task aligns to | **Step 0** (`grep -c '/WaveMAX Austin/gi' tests/unit/branding-guard.test.js` = 1) |

*Produces:*
- `npx jest tests/unit/branding-guard.test.js tests/unit/i18n-brand-token.test.js` →
  `Tests: 0 failed`; the affiliate suite has **no known failures**;
- `i18n-brand-token`'s rule becomes *"no locale value names a bare WaveMAX; `WaveMAX Austin` is permitted"* —
  the same rule `branding-guard` uses — with a positive control proving a bare mark still fails;
- record: `T38_DONE=yes`, `T38_SHA`, `SUITE_KNOWN_FAILURES=0`, `T38_FULL_SUITE_BASELINE=<Tests: line>` —
  the honest baseline every later full-suite gate compares against;
- Closes `tasks/todo.md`'s "two known-red suites" item (Task 35 records the closure).

- [ ] **Step 0: assert the Consumes rows and re-measure both failures.**

```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; cd "$AFF"
WS_REC=/var/www/wavemax/cutover-logs/plan3-record.env
recget() { local k="$1" v; v=$(sed -n "s/^$k=//p" "$WS_REC" 2>/dev/null | tail -1); \
  [ -n "$v" ] || v=$(ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "sed -n 's/^$k=//p' $WS_REC 2>/dev/null | tail -1"); \
  v=${v#\'}; v=${v%\'}; printf '%s' "$v"; }
FAIL=0
chk()  { if [ "$2" = "$3" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=[$2] want=[$3]"; FAIL=1; fi; }
gone() { if [ ! -e "$1" ]; then echo "  OK   gone $1"; else echo "  FAIL still present $1"; FAIL=1; fi; }

gone tests/helpers/wavemaxAllowlist.js
gone server/middleware/explorerGuard.js
gone server/routes/partnerInquiryRoutes.js
gone public/assets/js/iframe-bridge-v2.js
gone server/config/quarantineConfig.js
for S in T19_SHA T37_SHA; do
  V=$(recget $S); test -n "$V" && git merge-base --is-ancestor "$V" HEAD \
    && echo "  OK   ${S}_ancestor" || { echo "  FAIL ${S}=[$V] not an ancestor of HEAD"; FAIL=1; }
done
chk owner_rule_encoded "$(grep -c '/WaveMAX Austin/gi' tests/unit/branding-guard.test.js)" 1
chk tree_clean "$(git status --porcelain | wc -l)" 0
node -e 'const fs=require("fs");const L=(o,p="")=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==="object"?L(v,p+k+"."):[[p+k,v]]);
for (const l of ["en","es","pt","de"]) { const j=JSON.parse(fs.readFileSync(`public/locales/${l}/common.json`,"utf8"));
  const hits=L(j).filter(([k,v])=>typeof v==="string"&&/wavemax/i.test(v)).map(([k])=>k);
  console.log("  locale", l, "wavemax_keys="+hits.length, hits.join(",")); }'
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: five `OK gone …`; `OK T19_SHA_ancestor`, `OK T37_SHA_ancestor`; `OK owner_rule_encoded=1`;
    `OK tree_clean=0`; then four lines `locale <l> wavemax_keys=1 landing.footer.fulfillmentPartner`; then
    `gate=PASS`.
  - **[MEASURED] today, pre-Task-16, the locale lines read `wavemax_keys=2 landing.footer.fulfillmentPartner,partner.footer.fulfillmentPartner`** — so this gate reads differently before and after Task 16, which is the point.
  - `wavemax_keys=2` → Task 16 has not removed the `partner` subtree: **STOP.** `wavemax_keys=0` → the
    owner-approved disclaimer was deleted: **STOP** and report, do not "fix" the test.

```bash
cd "$AFF"
npx jest tests/unit/branding-guard.test.js tests/unit/i18n-brand-token.test.js 2>&1 | grep -E '^(Tests:|Test Suites:)|✕'
npx jest tests/unit/branding-guard.test.js 2>&1 | grep -E '^\s+\+\s+"' | sed 's/.*+ *//' | tr -d '",' \
  | awk -F: '{c[$1]++} END {for (f in c) printf "%3d %s\n", c[f], f}' | sort -k2
```
  - Expected: `Test Suites: 2 failed, 2 total`, `Tests: 2 failed, 4 passed, 6 total`, two `✕` lines; then the
    offender table:
    ```
     15 scripts/ops/cutover-gate.sh
      1 tests/integration/webCoreConsumptionGolden.test.js
      8 tests/unit/ops/cutoverGateS1.test.js
    ```
    — **24 lines, 3 files**, matching what Task 17 Step 7 already expects.
  - **[MEASURED] today, pre-Task-16, the same table has a fourth row `8 tests/helpers/wavemaxAllowlist.js` and
    totals 32 lines** — the gate discriminates.
  - `Tests: 0 failed` here means both were already closed: record it and skip to Step 4's record write.
  - A **different** file set → the deletions differed from plan: **STOP** and reconcile before editing.

- [ ] **Step 1: falsify the replacement rule before writing it (R-9 / C-11).**

```bash
node -e '
const strip = (s) => s.replace(/WaveMAX Austin/g, "");
const cases = [
  ["sanctioned only",   JSON.stringify({a:"WaveMAX Austin is the fulfillment partner."})],
  ["bare mark",         JSON.stringify({a:"WaveMAX Austin is our partner", b:"WaveMAX Laundry"})],
  ["bare mark alone",   JSON.stringify({a:"Powered by WaveMAX"})],
  ["lowercase variant", JSON.stringify({a:"wavemax austin", b:"wavemax laundry"})]
];
for (const [name, s] of cases) console.log(name.padEnd(18), "fails_guard=" + /wavemax/i.test(strip(s)));'
```
  - Expected, exactly four lines: `sanctioned only    fails_guard=false`, `bare mark          fails_guard=true`,
    `bare mark alone    fails_guard=true`, `lowercase variant  fails_guard=true`.
  - ⚠️ **`lowercase variant fails_guard=true` is the load-bearing line.** The strip is case-**sensitive**
    (`/WaveMAX Austin/g`, not `/gi`) on purpose: a lowercase `wavemax austin` in a locale file is a
    typo/diff-in-copy, not the sanctioned mark, and must still fail. If this prints `false`, the replacement
    rule is too loose and would have hidden a real bare mark — **STOP** and do not weaken it to `/gi`.
  - Paste this output into the PR body; it is the proof that the new assertion can fail.

- [ ] **Step 2: rewrite the i18n assertion, with its positive control.** In
      `tests/unit/i18n-brand-token.test.js`, replace the first test and add the control:

```js
  test('no locale value names a bare "WaveMAX"; only "WaveMAX Austin" is permitted', () => {
    // Owner decision 2026-09-08: the app must name WaveMAX Austin as the exclusive
    // fulfillment partner (landing.footer.fulfillmentPartner) and ONLY in that
    // capacity. The blanket ban this test used to assert was reversed that day; the
    // rule is now the one tests/unit/branding-guard.test.js INFRA_ALLOW encodes
    // (/WaveMAX Austin/gi, "the ONE permitted use of the mark"). The strip below is
    // case-SENSITIVE on purpose: a lowercase "wavemax austin" is not the mark.
    for (const l of LANGS) {
      expect(/wavemax/i.test(load(l).replace(/WaveMAX Austin/g, ''))).toBe(false);
    }
  });

  test('the sanctioned-literal strip cannot hide a bare mark (positive control)', () => {
    const strip = (s) => s.replace(/WaveMAX Austin/g, '');
    expect(/wavemax/i.test(strip('WaveMAX Austin is our partner'))).toBe(false);
    expect(/wavemax/i.test(strip('WaveMAX Laundry'))).toBe(true);
    expect(/wavemax/i.test(strip('Powered by WaveMAX'))).toBe(true);
    expect(/wavemax/i.test(strip('wavemax austin'))).toBe(true);
  });

  test('the sanctioned disclaimer is actually present (the rule has a subject)', () => {
    // Without this, deleting landing.footer.fulfillmentPartner from all four locales
    // would make the test above pass vacuously.
    for (const l of LANGS) expect(load(l)).toContain('WaveMAX Austin');
  });
```

- [ ] **Step 3: close the branding guard, and check for stale exclusions.** Add the three measured
      cutover-tooling files to `EXCLUDED_FILES` with one comment naming the reason, then add a test that
      fails when an `EXCLUDED_FILES` entry names a path that no longer exists.

```bash
cd "$AFF"
node -e 'const fs=require("fs"),src=fs.readFileSync("tests/unit/branding-guard.test.js","utf8");
const block=src.match(/const EXCLUDED_FILES = new Set\(\[([\s\S]*?)\]\);/);
if(!block){console.log("EXCLUDED_FILES BLOCK NOT FOUND");process.exit(1);}
const files=[...block[1].matchAll(/'"'"'([^'"'"']+)'"'"'/g)].map(m=>m[1]);
const missing=files.filter(f=>!fs.existsSync(f));
console.log("excluded_entries="+files.length, "missing="+missing.length);
missing.forEach(f=>console.log("  STALE", f));'
```
  - Expected: `excluded_entries=<n> missing=0`.
  - **[MEASURED] today this prints `missing=0`, but after Tasks 16–19 it would print several** —
    `server/middleware/partnerLanding.js`, `tests/unit/partnerLanding.test.js`,
    `tests/unit/partnerInquiryForm.test.js`, `tests/unit/affiliateApplicationForm.test.js`,
    `server/controllers/conciergeController.js`, `server/services/conciergeFaq.js`,
    `tests/unit/wavemaxAffiliatePage.test.js` (if Task 36's edit removed it) — unless those tasks pruned their
    own rows as their **Files** lists say. **Any `STALE` line printed here is a row that outlived its reason:
    remove it in this commit and name it in the commit body.** That is the same defect class Task 23 exists to
    prevent, on the affiliate side.
  - Then encode the check as a test so it cannot regress:

```js
  test('EXCLUDED_FILES has no entry naming a path that no longer exists', () => {
    const missing = [...EXCLUDED_FILES].filter((f) => !fs.existsSync(path.join(REPO, f)));
    expect(missing).toEqual([]);
  });
```

```bash
cd "$AFF"
npx jest tests/unit/branding-guard.test.js tests/unit/i18n-brand-token.test.js 2>&1 | grep -E '^(Tests:|Test Suites:)|✕'
```
  - Expected: `Test Suites: 2 passed, 2 total` and a `Tests:` line with **no** `✕` and `failed` absent.

- [ ] **Step 4: record the honest full-suite baseline, then commit.** This is the number Task 25, Task 26's
      six batches and tasks 39–46 all compare against, so it is measured **once, here**.

```bash
cd "$AFF"
TZ=America/Chicago npx jest --runInBand 2>&1 | tee /tmp/t38-full.txt | tail -8
BASE=$(grep -E '^Tests:' /tmp/t38-full.txt | tail -1); echo "BASELINE=[$BASE]"
printf 'failed_suites=%s\n' "$(grep -cE '^FAIL ' /tmp/t38-full.txt || true)"
```
  - Expected: a `Tests:` line in which **`failed` does not appear**, and `failed_suites=0`.
  - ⚠️ Memory note (`test_suite_fully_green_2026-06-20`, amended 2026-08-24): the suite is **no longer
    reliably 0-fail** — three suites have failed in a full run and passed in isolation. **Re-run any failing
    suite alone before debugging it**, and if it passes alone, record it by name in
    `T38_FLAKY_SUITES` rather than editing it. A flaky suite is not a licence to record a non-zero baseline:
    the recorded baseline is `failed=0`, and a later gate that sees a failure re-runs that suite alone before
    stopping.

```bash
cd "$AFF"
WS_REC=/var/www/wavemax/cutover-logs/plan3-record.env
recput() { printf '%s=%q\n' "$1" "$2" >> "$WS_REC"; ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "printf '%s=%s\n' '$1' '$2' >> $WS_REC"; }
recput SUITE_KNOWN_FAILURES 0
recput T38_FULL_SUITE_BASELINE "$BASE"
git add tests/unit/branding-guard.test.js tests/unit/i18n-brand-token.test.js
git commit -m "test(guards): close the two known affiliate failures -- the suite has no known red

i18n-brand-token banned every \"WaveMAX\" in the locales, a rule the owner reversed
on 2026-09-08: the app must name WaveMAX Austin as the exclusive fulfillment
partner (landing.footer.fulfillmentPartner). The test now strips that one
sanctioned literal -- the same rule branding-guard's INFRA_ALLOW already used --
with two new tests holding the line: a positive control proving a bare \"WaveMAX\",
\"WaveMAX Laundry\" and a lowercase \"wavemax austin\" all still fail, and a
subject check proving the disclaimer is actually present so the rule cannot pass
vacuously if the copy is deleted. The strip is case-SENSITIVE on purpose.

branding-guard's offender list reached [] once Task 16 deleted
tests/helpers/wavemaxAllowlist.js (8 of the 32 lines). The remaining 24 lines in
three files are Plan 2 cutover tooling that must name the real hosts and the mark
in order to assert the content app's output, so they are excluded with that reason.
A new test fails on any EXCLUDED_FILES entry naming a path that no longer exists --
the same 'row outlives its reason' defect Task 23 prevents in web-core.

This runs first in Phase 4 on purpose: every full-suite gate from Task 25 onward,
including all six of Task 26's batches, compares against a baseline recorded here.
A baseline of '2 failed' cannot distinguish 'still 2' from 'a different 2'.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
SHA=$(git rev-parse HEAD); echo "T38_SHA=$SHA"
printf 'T38_SHA=%s\nT38_DONE=yes\n' "$SHA" >> "$WS_REC"
ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "printf 'T38_SHA=%s\nT38_DONE=yes\n' '$SHA' >> $WS_REC"
```
  - Expected: one commit, pushed; `T38_SHA=<40 hex>`; both record copies carry
    `SUITE_KNOWN_FAILURES=0` and `T38_FULL_SUITE_BASELINE`.

**Rollback (exact; test-only — nothing is deployed and no production behaviour changes).**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; cd "$AFF"
WS_REC=/var/www/wavemax/cutover-logs/plan3-record.env
T38_SHA=$(sed -n 's/^T38_SHA=//p' "$WS_REC" | tail -1); test -n "$T38_SHA" || { echo 'STOP: no T38_SHA'; exit 1; }
git revert --no-edit "$T38_SHA"
npx jest tests/unit/branding-guard.test.js tests/unit/i18n-brand-token.test.js 2>&1 | grep -E '^(Tests:|Test Suites:)'
printf 'SUITE_KNOWN_FAILURES now stale in the record: %s\n' "$(sed -n 's/^SUITE_KNOWN_FAILURES=//p' "$WS_REC" | tail -1)"
```
- Rollback expected: the revert commit, then `Test Suites: 2 failed, 2 total` /
  `Tests: 2 failed, 4 passed, 6 total` — back to the measured red baseline.
- **`2 failed` is the discriminating assertion**: a revert that restored only one file would show `1 failed`.
- ⚠️ The record still says `SUITE_KNOWN_FAILURES=0`. Append `SUITE_KNOWN_FAILURES=2` to **both** copies
  immediately, or every later full-suite gate is comparing against a lie. Record rows are append-only; the
  last value wins (C-2).

---

# The adoption series — tasks 39–46 (PRs B5, B6, B8, B9, B10, B11, B13, B14)

> ⚠️ **Scope note the controller must read.** The Phase-4 assembler wrote: *"It does **not** absorb the rest
> of the adoption series — slice C's C2, C3, C6–C11 … No other phase covers them."* These eight tasks are that
> series, restored as numbered tasks. **PR B7 is already Task 25** and is not re-ported; **PR B12 already
> landed as B4c** (`server/config/csrfTables.js` exists, [MEASURED] 85 statements) and has no task; **slice C's
> C1 (preflight) is folded into the shared Step 0 below**; and **slice C's C12** is *not* ported — its
> `--forceExit` removal is ESCALATIONS **row 13**, already assigned to Rick, and its §7.7 acceptance greps live
> in Task 46 Steps 3–4.
>
> **Real dependency order, and why it is not the spec's §7.5 order.** B5 and B6 precede B7 in the spec, but
> Task 25 (B7) is already numbered 25, and nothing in B7 consumes B5 or B6. What *is* a hard constraint:
> - **Task 46 (B14) consumes Task 25**, because Task 25 turns `server/middleware/rateLimitMongoStore.js` into a
>   5-line shim and B14's deletion set includes it;
> - **Task 45 (B13) consumes Task 25**, because its sweep script reads `APP_LIMITER_NAMES` as a live getter;
> - **Task 45 consumes Tasks 16 and 36**, because `server/config/storeIPs.js` has [MEASURED] **three** runtime
>   consumers today (`auth.js:10`, `partnerLanding.js:20`, `locationQuarantine.js:26`) and only those two tasks
>   remove the other two;
> - **Task 46 consumes 39–45**, it is their terminus;
> - **Task 26 consumes Task 46** (§1 above).
>
> So: 25 → 39 → 40 → 41 → 42 → 43 → 44 → 45 → 46 → 26. Each link is asserted.
>
> **[MEASURED] web-core v0.2.1 already exports everything this series consumes** — `registerDefaults`
> (`src/models/SystemConfig.js:230`), `buildSessionMiddleware` + `_maxAgeFixer`
> (`src/config/sessionStore.js:117,48,201`), `corsConfig` (`src/security/corsConfig.js`), `email`
> (`src/email/index.js`), `sanitization`, `errorHandler`, `auditLogger`, `mongoCursorRetry`,
> `mongoOracleDiagnostics`, `rateLimiting` (incl. `collectionPrefix`, `collectionNameFor`, `sweepExpired`,
> `resetBuckets`, `createCustomLimiter` and the live `LIMITER_NAMES` getter). Nothing in this series waits on a
> web-core feature. It waits on the **v0.3.0 install** only because Task 25 does, and because installing a new
> core mid-series is the ⛔ bidirectional boot-breaker.

## The shared Step 0 — pasted verbatim at the top of every task 39–46

```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
WC=/mnt/c/Users/rickh/GitHub/crhs-web-core
CORP=/mnt/c/Users/rickh/GitHub/crhs-corporate
WS_REC=/var/www/wavemax/cutover-logs/plan3-record.env
cd "$AFF"
recget() { local k="$1" v; v=$(sed -n "s/^$k=//p" "$WS_REC" 2>/dev/null | tail -1); \
  [ -n "$v" ] || v=$(ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "sed -n 's/^$k=//p' $WS_REC 2>/dev/null | tail -1"); \
  v=${v#\'}; v=${v%\'}; printf '%s' "$v"; }
recput() { printf '%s=%q\n' "$1" "$2" >> "$WS_REC"; \
  ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "printf '%s=%s\n' '$1' '$2' >> $WS_REC"; }
FAIL=0
chk()  { if [ "$2" = "$3" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=[$2] want=[$3]"; FAIL=1; fi; }
gone() { if [ ! -e "$1" ]; then echo "  OK   gone $1"; else echo "  FAIL still present $1"; FAIL=1; fi; }
anc()  { local v; v=$(recget "$1"); if [ -n "$v" ] && git merge-base --is-ancestor "$v" HEAD 2>/dev/null; \
  then echo "  OK   $1 ancestor"; else echo "  FAIL $1=[$v] not an ancestor of HEAD"; FAIL=1; fi; }

# --- S0-a. web-core v0.3.0 installed, with the full surface this series consumes (Task 24) ---
node -e '
const v  = require("@crhs/web-core/package.json").version;
const wc = require("@crhs/web-core");
const rl = wc.rateLimiting;
const need = { "rateLimiting.resetBuckets":        typeof rl.resetBuckets,
               "rateLimiting.sweepExpired":        typeof rl.sweepExpired,
               "rateLimiting.collectionPrefix":    typeof rl.collectionPrefix,
               "rateLimiting.collectionNameFor":   typeof rl.collectionNameFor,
               "rateLimiting.createCustomLimiter": typeof rl.createCustomLimiter,
               "csrf.createCsrf":                  typeof wc.csrf.createCsrf,
               "buildSessionMiddleware":           typeof wc.buildSessionMiddleware,
               "SystemConfig.registerDefaults":    typeof wc.SystemConfig.registerDefaults,
               "corsConfig":                       typeof wc.corsConfig,
               "email.transport.sendEmail":        typeof wc.email.transport.sendEmail,
               "auditLogger.logAuditEvent":        typeof wc.auditLogger.logAuditEvent };
const bad = Object.entries(need).filter(([, t]) => t !== "function" && t !== "object");
const d = Object.getOwnPropertyDescriptor(rl, "LIMITER_NAMES");
const getter = !!(d && typeof d.get === "function");
const [maj, min] = v.split(".").map(Number);
console.log(`wc=${v} missing=${bad.map(([k]) => k).join(",") || "none"} limiter_names_getter=${getter}`);
process.exit((maj > 0 || min >= 3) && !bad.length && getter ? 0 : 1)'
echo "  WC_EXIT=$?"

# --- S0-b. Task 38: the suite has no known failures, asserted LIVE, not from the record ---
npx jest tests/unit/branding-guard.test.js tests/unit/i18n-brand-token.test.js 2>&1 | grep -E '^Tests:' | tail -1
chk suite_known_failures "$(recget SUITE_KNOWN_FAILURES)" 0

# --- S0-c. Task 25 landed, asserted on the artefact (Phase-4 C-1) ---
node -e "const d=Object.getOwnPropertyDescriptor(require('./server/middleware/rateLimiting'),'APP_LIMITER_NAMES');
process.stdout.write('  app_limiter_names_getter='+!!(d&&typeof d.get==='function')+'\n');process.exit(d&&d.get?0:1)"
echo "  T25_EXIT=$?"
chk rate_limits_gone "$(grep -rl 'rate_limits' server/ 2>/dev/null | wc -l)" 0
chk t25_regression_suite "$(test -f tests/integration/resetRateLimits.test.js && echo 1 || echo 0)" 1

# --- S0-d. Phase 1 + Phase 2 landed ---
chk all_hosts_flipped "$(recget ALL_HOSTS_FLIPPED)" yes
anc T36_SHA; anc T37_SHA; anc T38_SHA

# --- S0-e. clean tree (an eslint autofix or a git rm over uncommitted work is unrecoverable) ---
chk tree_clean "$(git status --porcelain | wc -l)" 0
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected, for every task 39–46: `wc=0.3.x missing=none limiter_names_getter=true`, `WC_EXIT=0`;
    a `Tests:` line in which `failed` **does not appear**; `OK suite_known_failures=0`;
    `app_limiter_names_getter=true`, `T25_EXIT=0`, `OK rate_limits_gone=0`, `OK t25_regression_suite=1`;
    `OK all_hosts_flipped=yes`; three `OK …_SHA ancestor`; `OK tree_clean=0`; then **`gate=PASS`**.
  - **`gate=HALT` stops the task.** There is no prose precondition anywhere in this series.
  - `WC_EXIT=1` with `missing=csrf.createCsrf` is the ⛔ **bidirectional boot-breaker** (memory
    `deploy_b_bidirectional_bootbreaker`): after B3h `wc.csrf` exports only `{createCsrf, CSRF_COOKIE_NAME}`,
    and new-core+old-app **and** new-app+old-core each kill the portal. Do not proceed; re-run Task 24's
    `rm -rf node_modules/@crhs/web-core && npm install` — a version bump alone does **not** force a re-copy.

Each task below adds its own `Consumes` rows to this block and then proceeds. **Full-suite gates are run by
the controller, never inside a subagent** (slice C global constraint 6), and every full-suite result is
compared to `T38_FULL_SUITE_BASELINE`.

---

### Task 39: [affiliate] PR B5 — shim `sanitization`, `errorHandler`, `mongoCursorRetry`, `mongoOracleDiagnostics`; delete four duplicate suites

> **Execution position: Phase 4, immediately after Task 25.** Repo-only; delivered by Task 30's `git pull`.
>
> Four `server/` modules are near-copies of web-core's. [MEASURED] `diff` line counts against
> `crhs-web-core/src/`: `sanitization` **4**, `errorHandler` **4**, `mongoCursorRetry` **5**,
> `mongoOracleDiagnostics` **10** — and the four unit suites that shadow core's own total **958 lines**
> (`sanitization` 449, `errorHandler` 330, `mongoCursorRetry` 100, `mongoOracleDiagnostics` 79).
>
> ⚠️ **The draft's Step-1 gate cannot be trusted as written.** It expects "a count that is **only**
> comment/header lines" and tells the executor to eyeball each diff. `mongoOracleDiagnostics` at 10 diff lines
> is not obviously comment-only, and "inspect by eye" is not an assertion. Step 2 below replaces it with a
> **mechanical** two-part gate: identical exported key sets, and — for the two modules with behaviour worth
> pinning — identical observable behaviour on a fixed input. A difference in a *statement* halts the task.
>
> ⚠️ **C-R9, kept visible.** Shimming moves these files into a repo where four ESLint rule families are
> switched off. [MEASURED] `server/middleware/sanitization.js` carries **2** of the affiliate's 209 errors
> (`no-prototype-builtins` 1, `no-useless-escape` 1); web-core's `npm run lint` covers `src tests`, so they are
> not lost, but they are no longer counted by Task 26. That is a **deliberate, recorded** consequence, not a
> reduction earned by fixing anything.

**Files:**
- Modify: `server/middleware/sanitization.js` (105 → 1 statement), `server/middleware/errorHandler.js` (149 → 1),
  `server/utils/mongoCursorRetry.js` (101 → 1), `server/utils/mongoOracleDiagnostics.js` (163 → 1).
- Delete: `tests/unit/sanitization.test.js` (449), `tests/unit/errorHandler.test.js` (330),
  `tests/unit/mongoCursorRetry.test.js` (100), `tests/unit/mongoOracleDiagnostics.test.js` (79).
- Create: `tests/unit/webCoreShimIdentity.test.js`.

**Interfaces:**

*Consumes — the shared Step 0, plus:*

| # | consumed artefact | asserted by |
|:--|:--|:--|
| C39-1 | core's four modules exist and expose the **same exported keys** as the app's | **Step 1** (key-set comparison, `node`, exit 1 on difference) |
| C39-2 | core's four modules behave identically on a fixed input | **Step 2** (behaviour probe: `sanitizeRequest` over a `$`-keyed body, `errorHandler` over an `AppError`, `mongoCursorRetry` over a throwing cursor) |
| C39-3 | the four mount points in `server.js` are still where the require lands | **Step 3** (four content-located greps, each = 1) |
| C39-4 | no test outside the four deleted suites requires the four modules **as implementations** | **Step 1b** (set-difference grep over `tests/`) |

*Produces:*
- four 1-statement shims; `server/` files naming `@crhs/web-core` goes **11 → 15** ([MEASURED] 11 today, 8 of
  them already 1-statement);
- `tests/unit/webCoreShimIdentity.test.js` — the seam, falsified once;
- 958 duplicate test lines deleted;
- `server/` ESLint **−2** ([MEASURED] both in `sanitization.js`) — §1;
- record: `T39_SHA`, `T39_DONE=yes`, `ADOPT_SHIMS_AFTER_39=15`, `T39_LINT_DELTA=-2`.

- [ ] **Step 0: the shared adoption-series Step 0** (above), verbatim. Add:

```bash
for m in middleware/sanitization middleware/errorHandler utils/mongoCursorRetry utils/mongoOracleDiagnostics; do
  chk "core_has_$(basename $m)" "$(test -f "$WC/src/$m.js" && echo 1 || echo 0)" 1
done
chk shims_before "$(grep -rl '@crhs/web-core' server/ | wc -l)" 11
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: four `OK core_has_*=1`, `OK shims_before=11`, `gate=PASS`.
  - `shims_before` ≠ 11 → the shim set drifted since assembly: record the real number and derive
    `ADOPT_SHIMS_AFTER_39 = <that> + 4` rather than pinning 15.

- [ ] **Step 1: mechanical equivalence — exported keys — and the blast radius.**

```bash
cd "$AFF"
node -e '
const path = require("path");
const WC = "/mnt/c/Users/rickh/GitHub/crhs-web-core";
const pairs = [["server/middleware/sanitization.js","src/middleware/sanitization.js","sanitization"],
                ["server/middleware/errorHandler.js","src/middleware/errorHandler.js","errorHandler"],
                ["server/utils/mongoCursorRetry.js","src/utils/mongoCursorRetry.js","mongoCursorRetry"],
                ["server/utils/mongoOracleDiagnostics.js","src/utils/mongoOracleDiagnostics.js","mongoOracleDiagnostics"]];
let bad = 0;
const ks = (m) => (typeof m === "function" ? ["<function>", ...Object.keys(m)] : Object.keys(m)).sort();
for (const [a, b, name] of pairs) {
  const A = ks(require(path.join(process.cwd(), a)));
  const B = ks(require(path.join(WC, b)));
  const same = A.length === B.length && A.every((k, i) => k === B[i]);
  if (!same) bad++;
  console.log(`${same ? "SAME " : "DIFF "} ${name.padEnd(24)} app=[${A.join(",")}] core=[${B.join(",")}]`);
}
process.exit(bad ? 1 : 0)'
echo "KEYS_EXIT=$?"
# A *duplicate suite* is a tests/unit file NAMED after one of the four modules. A
# *consumer* is any other test that requires one. Only the first class must be
# deleted, so the grep is scoped to that class and CAN therefore fail.
ls tests/unit/ | grep -iE '^(sanitization|errorHandler|mongoCursorRetry|mongoOracleDiagnostics)[^/]*\.test\.js$' | sort
echo "DUPLICATE_SUITES_FOUND=$(ls tests/unit/ | grep -icE '^(sanitization|errorHandler|mongoCursorRetry|mongoOracleDiagnostics)[^/]*\.test\.js$'; true)"
printf 'consumers (not deleted, just listed): '
git grep -lI -E "require\(['\"].*(middleware/(sanitization|errorHandler)|utils/(mongoCursorRetry|mongoOracleDiagnostics))" \
  -- tests | grep -viE '^tests/unit/(sanitization|errorHandler|mongoCursorRetry|mongoOracleDiagnostics)[^/]*\.test\.js$' | tr '\n' ' '; echo
```
  - Expected: four `SAME <name> app=[…] core=[…]` lines with **identical bracketed lists**, then `KEYS_EXIT=0`;
    then exactly the four filenames in the deletion set and **`DUPLICATE_SUITES_FOUND=4`**; then a
    `consumers (not deleted, just listed):` line.
  - **`DUPLICATE_SUITES_FOUND` must be exactly 4.** A **5th** name (e.g. `sanitizationExtra.test.js`) is a
    duplicate suite this task must also delete — add it to **Files** before proceeding. Fewer than 4 means one
    is already gone, so this PR is smaller than **Files** claims: say which.
  - A `DIFF` line → the shim would change an export. **STOP.** The fix is to bring core's copy up to the app's
    in a web-core release, not to shim over a divergence.
  - `KEYS_EXIT=1` → same.

- [ ] **Step 2: mechanical equivalence — behaviour — before deleting anything (this replaces "inspect by eye").**

```bash
cd "$AFF"
NODE_ENV=test node -e '
const WC = "/mnt/c/Users/rickh/GitHub/crhs-web-core";
const probe = (san) => {
  const req = { body: { "$gt": 1, ok: "<script>x</script>", nested: { "a.b": 2 } }, query: {}, params: {}, headers: {} };
  try { san.sanitizeRequest(req, {}, () => {}); } catch (e) { return "THREW:" + e.message; }
  return JSON.stringify(req.body);
};
const a = probe(require("./server/middleware/sanitization"));
const b = probe(require(WC + "/src/middleware/sanitization"));
console.log("sanitize app  =", a);
console.log("sanitize core =", b);
console.log("sanitize_same =", a === b);

const errProbe = (eh) => {
  const handler = typeof eh === "function" ? eh : (eh.errorHandler || eh.handle || eh.default);
  if (typeof handler !== "function") return "NO_HANDLER";
  let out = "";
  const err = Object.assign(new Error("probe"), { statusCode: 403 });
  const res = { status: (c) => { out += "status=" + c + " "; return res; },
                json: (o) => { out += "json=" + JSON.stringify(o); return res; },
                headersSent: false, setHeader: () => {} };
  try { handler(err, { originalUrl: "/p", method: "GET", headers: {}, get: () => undefined, ip: "203.0.113.9" }, res, () => {}); }
  catch (e) { return "THREW:" + e.message; }
  return out.trim();
};
const c = errProbe(require("./server/middleware/errorHandler"));
const d = errProbe(require(WC + "/src/middleware/errorHandler"));
console.log("errh app      =", c);
console.log("errh core     =", d);
console.log("errh_same     =", c === d);
process.exit((a === b && c === d && a.indexOf("THREW") < 0 && c.indexOf("THREW") < 0) ? 0 : 1)'
echo "BEHAVIOUR_EXIT=$?"
```
  - Expected: `sanitize_same = true` and `errh_same = true` with **neither probe printing `THREW` or
    `NO_HANDLER`**, then `BEHAVIOUR_EXIT=0`. Capture both `app  =` lines — Step 5 re-runs the identical probe
    against the shim and the output must be byte-identical.
  - ⚠️ `NO_HANDLER` means `errorHandler`'s export shape is not what this probe assumes: fix the probe, do not
    skip the step. A skipped equivalence gate is how a "shim" silently changes an error response.
  - `sanitize_same = false` or `errh_same = false` → **STOP**, exactly as a `DIFF` in Step 1.

- [ ] **Step 3: write the failing seam test, then run it red.** Create `tests/unit/webCoreShimIdentity.test.js`:

```js
// PR B5 (spec §7.3): four modules become 1-statement re-exports of @crhs/web-core.
// This is the seam: it fails while a local implementation still shadows core's.
const fs = require('fs');
const path = require('path');
const wc = require('@crhs/web-core');
const REPO = path.join(__dirname, '..', '..');
const SHIMS = [
  ['../../server/middleware/sanitization', 'sanitization', 'server/middleware/sanitization.js'],
  ['../../server/middleware/errorHandler', 'errorHandler', 'server/middleware/errorHandler.js'],
  ['../../server/utils/mongoCursorRetry', 'mongoCursorRetry', 'server/utils/mongoCursorRetry.js'],
  ['../../server/utils/mongoOracleDiagnostics', 'mongoOracleDiagnostics', 'server/utils/mongoOracleDiagnostics.js']
];

describe('B5 shims re-export @crhs/web-core, not a local copy', () => {
  it.each(SHIMS)('%s is core.%s by identity', (appPath, coreKey) => {
    expect(require(appPath)).toBe(wc[coreKey]);
  });

  it.each(SHIMS)('%s is a re-export, not an implementation', (appPath, coreKey, file) => {
    const src = fs.readFileSync(path.join(REPO, file), 'utf8');
    expect(src).toMatch(/require\('@crhs\/web-core'\)/);
    const statements = src.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
    expect(statements).toHaveLength(1);
  });

  it('the four mount points in server.js still resolve through the shim paths', () => {
    const src = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
    for (const [, , file] of SHIMS) {
      const mod = file.replace(/^server\//, './server/').replace(/\.js$/, '');
      expect(src).toContain(mod);
    }
  });
});
```
```bash
cd "$AFF" && npx jest tests/unit/webCoreShimIdentity.test.js 2>&1 | tail -30
```
  - Expected: `Tests: 8 failed, 1 passed, 9 total`. The four identity cases fail with
    `expect(received).toBe(expected) // Object.is equality`; the four shape cases fail on
    `Expected length: 1`; the mount-point case **passes** (it is the C39-3 assertion and must be green both
    before and after — it is a guard against the edit moving a require, not a red-first test).
  - Any identity case **passing** → that module is already shimmed. Remove it from this PR and say so in the
    commit body; do not leave a vacuous case.
  - `Tests: 0 total` → the file was not written: **STOP.**

- [ ] **Step 4: replace each body with the 1-statement shim**, matching `server/utils/clientIp.js` verbatim in
      shape ([MEASURED] 1 statement, the established convention):

```js
// Shim — <what> now lives in @crhs/web-core (extracted; behaviour pinned by
// tests/unit/webCoreShimIdentity.test.js). Kept as a thin re-export so existing
// require() call sites transparently consume the shared package (move-then-delete
// convention). Do not add logic here — edit web-core instead.
module.exports = require('@crhs/web-core').<key>;
```

  Whole-module re-export form is required for `sanitization` and `errorHandler` so that
  `const { sanitizeRequest } = require('../middleware/sanitization')` keeps working.

- [ ] **Step 5: re-run the equivalence probe against the shims, then delete the four suites.**

```bash
cd "$AFF"
# byte-identical to Step 2's probe; the app half now goes through the shim
NODE_ENV=test node -e '<paste Step 2 verbatim>'
echo "BEHAVIOUR_AFTER_EXIT=$?"
git rm -q tests/unit/sanitization.test.js tests/unit/errorHandler.test.js \
          tests/unit/mongoCursorRetry.test.js tests/unit/mongoOracleDiagnostics.test.js
npx jest tests/unit/webCoreShimIdentity.test.js 2>&1 | grep -E '^Tests:|✕'
```
  - Expected: the probe prints the **same four `app  =` / `core =` values as Step 2** with
    `sanitize_same = true`, `errh_same = true`, `BEHAVIOUR_AFTER_EXIT=0`; then
    `Tests: 9 passed, 9 total` with no `✕`.
  - **The re-run is the point.** Step 2 proved core matches the app; this proves the *shim* matches, which is a
    different claim — a re-export of the wrong key passes Step 2 and fails here.

- [ ] **Step 6: boot, cycles, lint delta, full suite, commit.**

```bash
cd "$AFF"
node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK')" 2>&1 | tail -2
npx madge --circular server/ 2>&1 | tail -2
printf 'shims_after=%s\n' "$(grep -rl '@crhs/web-core' server/ | wc -l)"
for f in $(grep -rl '@crhs/web-core' server/); do n=$(grep -vc '^\s*\(//.*\)\?$' "$f"); echo "$n $f"; done | sort -n | head -16
npx eslint server/ server.js 2>&1 | grep -E 'problems?' | tail -1
```
  - Expected: `BOOT_OK`; `✔ No circular dependency found!`; `shims_after=15`; a sorted list whose first
    **twelve** rows read `1 <path>` (the 8 pre-existing + the 4 new); and an ESLint total exactly **2 lower**
    than the value recorded before this task. Assert the **delta**, never the absolute (§1).
  - A first row of `0` means a shim file is empty. Any of the four new paths showing `> 1` means it still holds
    an implementation.

```bash
cd "$AFF"
TZ=America/Chicago npx jest --runInBand 2>&1 | tail -8          # controller runs this, not a subagent
git add -A server tests && git commit -m "refactor(webcore): B5 -- shim sanitization, errorHandler, cursor-retry, oracle diagnostics

Four server/ modules were near-copies of @crhs/web-core's (spec §7.3). Each becomes
a 1-statement re-export and the four duplicate unit suites they shadowed are deleted
(958 lines). tests/unit/webCoreShimIdentity.test.js is the new seam: it pins module
identity (Object.is against core), the 1-statement shape, and that server.js still
requires the shim paths.

Equivalence was proved MECHANICALLY before the deletion, not by reading diffs: the
exported key sets are compared programmatically, and sanitizeRequest and the error
handler are exercised on fixed inputs against both copies, then the identical probe
is re-run against the shim. diff line counts alone (4/4/5/10) would not have caught
an export or behaviour change, and mongoOracleDiagnostics at 10 is not obviously
comment-only.

Recorded consequence, not a win: server/ ESLint drops 2 because
sanitization.js's no-prototype-builtins and no-useless-escape errors leave this
tree. web-core's own lint covers src and tests, so they are not lost -- but they are
no longer counted by Task 26's arithmetic. Nothing was fixed to earn that drop.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
SHA=$(git rev-parse HEAD); echo "T39_SHA=$SHA"
recput T39_SHA "$SHA"; recput T39_DONE yes
recput ADOPT_SHIMS_AFTER_39 "$(grep -rl '@crhs/web-core' server/ | wc -l)"
recput T39_LINT_TOTAL "$(npx eslint server/ server.js 2>&1 | grep -oE '[0-9]+ problems' | grep -oE '^[0-9]+')"
```
  - Expected: a `Tests:` line matching `T38_FULL_SUITE_BASELINE` with `failed` absent, then one commit pushed.
  - **Any new failure is fixed in this commit, not deferred** (project rule). Re-run a failing suite alone
    first (the flaky-suite memory note).

**Rollback (exact; repo-only).**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; cd "$AFF"
WS_REC=/var/www/wavemax/cutover-logs/plan3-record.env
S=$(sed -n 's/^T39_SHA=//p' "$WS_REC" | tail -1); test -n "$S" || { echo 'STOP: no T39_SHA'; exit 1; }
git revert --no-edit "$S"
node -e 'const wc=require("@crhs/web-core");
for (const [p,k] of [["./server/middleware/sanitization","sanitization"],["./server/middleware/errorHandler","errorHandler"],
                     ["./server/utils/mongoCursorRetry","mongoCursorRetry"],["./server/utils/mongoOracleDiagnostics","mongoOracleDiagnostics"]])
  console.log(k, "is_local_again=" + (require(p) !== wc[k]));'
ls tests/unit/sanitization.test.js tests/unit/errorHandler.test.js
node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK')" | tail -1
```
- Rollback expected: the revert commit; four `… is_local_again=true` lines; both suite paths listed; `BOOT_OK`.
- **`is_local_again=true` is the discriminating assertion** — `ls` succeeding only proves files returned;
  only an identity check proves the *implementations* are back in front of core's.
- ⚠️ If the revert is taken after **tasks 40–46** have landed, revert those first, **newest first**: the shims
  are a dependency chain and Task 46 deletes every one of them. Deterministic fallback:
  `git checkout "$S"~1 -- server/ tests/`.

---

### Task 40: [affiliate] PR B6 — shim `auditLogger`, and prove audit events land in the repo's `logs/`, not under `node_modules/`

> **Execution position: Phase 4, immediately after Task 39.** Repo-only.
>
> [MEASURED] `server/utils/auditLogger.js` is 267 lines, core's is 273, `diff` shows **10** changed lines;
> `tests/unit/auditLogger.test.js` is **500** lines of duplicate coverage. `LOG_DIR` is set on **both** boxes
> to `/var/www/wavemax/wavemax-affiliate-program/logs` ([MEASURED]), so the destination defect spec §7.5 B6
> names — audit events landing under `node_modules/@crhs/web-core/logs/` — is a real, testable behaviour and
> not a theory.
>
> ⚠️ The draft says *"if it passes before the shim, the defect is already closed: keep the test, say so, and
> skip the defect claim."* That is right, and Step 1 records **which** outcome occurred, because the commit
> message must not claim to fix a defect that did not exist.

**Files:**
- Modify: `server/utils/auditLogger.js` (267 → 1 statement).
- Delete: `tests/unit/auditLogger.test.js` (500).
- Create: `tests/integration/auditLogDestination.test.js`.
- **Not touched:** the [MEASURED] 16 `jest.mock('../../server/utils/auditLogger')` sites and the two
  `jest.requireActual` sites (`tests/integration/addons.test.js:12`, `tests/unit/bags/bagService.test.js:3`).
  They resolve **through** the shim path unchanged; Step 4 proves it.

**Interfaces:**

*Consumes — the shared Step 0, plus:*

| # | consumed artefact | asserted by |
|:--|:--|:--|
| C40-1 | **Task 39 landed** — the shim convention and the seam test exist | **Step 0** (`T39_SHA` ancestor **and** `require('./server/middleware/sanitization') === wc.sanitization`) |
| C40-2 | core's `auditLogger` exposes the same keys, including `AuditEvents` | **Step 0** (key-set comparison, exit 1 on difference) |
| C40-3 | `LOG_DIR` is set on both boxes, so the destination this task pins is the one production uses | **Step 0** (per-box `grep -c '^LOG_DIR='` = 1, value printed) |

*Produces:*
- `ADOPT_SHIMS_AFTER_40 = 16`; 500 duplicate test lines deleted; **0** ESLint change ([MEASURED]
  `auditLogger.js` carries no errors);
- `tests/integration/auditLogDestination.test.js`, pinning the destination in both directions;
- record: `T40_SHA`, `T40_DONE=yes`, `T40_DEFECT_WAS_LIVE=yes|no` — the honest answer to whether the
  destination was actually wrong before the shim.

- [ ] **Step 0: the shared Step 0**, verbatim. Add:

```bash
anc T39_SHA
node -e 'const wc=require("@crhs/web-core");
console.log("  t39_shim_live="+(require("./server/middleware/sanitization")===wc.sanitization));
process.exit(require("./server/middleware/sanitization")===wc.sanitization?0:1)'; echo "  T39_EXIT=$?"
node -e '
const WC="/mnt/c/Users/rickh/GitHub/crhs-web-core";
const A=Object.keys(require("./server/utils/auditLogger")).sort();
const B=Object.keys(require(WC+"/src/utils/auditLogger")).sort();
const same=A.length===B.length&&A.every((k,i)=>k===B[i]);
console.log("  auditLogger keys same="+same+" app=["+A.join(",")+"] core=["+B.join(",")+"]");
process.exit(same?0:1)'; echo "  KEYS_EXIT=$?"
for IP in 161.153.71.201 144.24.4.202; do
  printf '  %s LOG_DIR=' "$IP"
  ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@$IP \
    "sed -n 's/^LOG_DIR=//p' /var/www/wavemax/wavemax-affiliate-program/.env | tail -1"
done
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: `OK T39_SHA ancestor`, `t39_shim_live=true`, `T39_EXIT=0`; `auditLogger keys same=true` with two
    identical bracketed lists (they must both contain `logAuditEvent` and `AuditEvents`), `KEYS_EXIT=0`; two
    `LOG_DIR=/var/www/wavemax/wavemax-affiliate-program/logs` lines; `gate=PASS`.
  - `keys same=false` → **STOP**: the shim would change an export that 18 test files reach through.

- [ ] **Step 1: write the failing destination test and record which way it fails.**
      Create `tests/integration/auditLogDestination.test.js`:

```js
// PR B6 acceptance (spec §7.5): with LOG_DIR=logs an audit event must land in
// <repo>/logs/audit.log and NOT under node_modules/@crhs/web-core/logs/.
// Both halves matter: the first alone passes if the event is written to both.
const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..', '..');

describe('B6 — audit events write to the repo LOG_DIR', () => {
  const target = path.join(REPO, 'logs', 'audit.log');
  const stray = path.join(REPO, 'node_modules', '@crhs', 'web-core', 'logs', 'audit.log');
  const size = (p) => (fs.existsSync(p) ? fs.statSync(p).size : 0);

  it('writes CSRF_VALIDATION_FAILED to <repo>/logs/audit.log and nowhere else', async () => {
    const before = size(target);
    const strayBefore = size(stray);
    const marker = `/b6-probe-${Date.now()}`;
    const { logAuditEvent, AuditEvents } = require('../../server/utils/auditLogger');
    await logAuditEvent(AuditEvents.CSRF_VALIDATION_FAILED, { probe: 'B6' },
      { ip: '203.0.113.9', originalUrl: marker, method: 'POST', get: () => undefined });
    await new Promise((r) => setTimeout(r, 400));
    expect(fs.existsSync(target)).toBe(true);
    expect(size(target)).toBeGreaterThan(before);
    expect(fs.readFileSync(target, 'utf8')).toContain(marker);   // the unique marker, not just "grew"
    expect(size(stray)).toBe(strayBefore);
  });
});
```
```bash
cd "$AFF" && LOG_DIR=logs npx jest tests/integration/auditLogDestination.test.js 2>&1 | tail -25
```
  - Expected while the local implementation is still in place: **either** `1 failed` (record the exact failing
    assertion — `toBeGreaterThan` on the repo file, or `toContain` on the marker, or `size(stray)` having
    grown) **or** `1 passed`.
  - ⚠️ **Both outcomes are valid and the difference must be recorded.** `recput T40_DEFECT_WAS_LIVE yes|no`.
    If it **passes** before the shim, the destination defect was already closed and the commit body says so;
    the test is still kept, as a regression net for the swap. Claiming a fix that did not happen is the defect
    this step exists to prevent.
  - The unique `marker` is what makes this falsifiable: a `size(target) > before` check alone passes on **any**
    concurrent write to `audit.log`, including one from another test in the same run.

- [ ] **Step 2: shim, then re-run both halves.**

```bash
cd "$AFF"
# after replacing the body with the 1-statement shim:
node -e 'const wc=require("@crhs/web-core");const a=require("./server/utils/auditLogger");
console.log("identity="+(a===wc.auditLogger), "keys="+Object.keys(a).sort().join(","));'
git rm -q tests/unit/auditLogger.test.js
LOG_DIR=logs npx jest tests/integration/auditLogDestination.test.js tests/unit/webCoreShimIdentity.test.js 2>&1 | grep -E '^Tests:|✕'
```
  - Expected: `identity=true` and a `keys=` list **identical to Step 0's** (re-read it, do not assume); then
    `Tests: 10 passed, 10 total` with no `✕`.
  - A shorter `keys=` list is the silent breakage: 18 test files destructure `{ logAuditEvent, AuditEvents }`
    from this path.

- [ ] **Step 3: prove the 18 mock / `requireActual` sites still resolve.**

```bash
cd "$AFF"
printf 'mock sites = %s\n' "$(git grep -c "server/utils/auditLogger" -- tests | wc -l)"
git grep -n 'requireActual.*auditLogger' -- tests
LOG_DIR=logs npx jest tests/integration/addons.test.js tests/unit/bags/bagService.test.js 2>&1 | grep -E '^Tests:|✕'
```
  - Expected: a non-zero `mock sites` count (**[MEASURED] 18 today**); two `requireActual` lines
    ([MEASURED] `tests/integration/addons.test.js:12`, `tests/unit/bags/bagService.test.js:3`); then a
    `Tests:` line with no `✕`.
  - **The `requireActual` pair is the discriminating case.** A `jest.mock` of a shim path passes whatever the
    shim does; only `requireActual` exercises the real module through the shim, which is what proves the shim
    is transparent to jest's module registry.

- [ ] **Step 4: boot, full suite, commit.**

```bash
cd "$AFF"
node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK')" 2>&1 | tail -2
npx madge --circular server/ 2>&1 | tail -2
printf 'shims_after=%s\n' "$(grep -rl '@crhs/web-core' server/ | wc -l)"
npx eslint server/ server.js 2>&1 | grep -E 'problems?' | tail -1
TZ=America/Chicago npx jest --runInBand 2>&1 | tail -8
git add -A server tests && git commit -m "refactor(webcore): B6 -- shim auditLogger; audit events land in the repo LOG_DIR

server/utils/auditLogger.js becomes a 1-statement re-export of @crhs/web-core
(spec §7.3) and tests/unit/auditLogger.test.js (500 lines, duplicate of core's) is
deleted. Export keys were compared programmatically first: 18 test files reach
logAuditEvent and AuditEvents through this path, 16 by jest.mock and two by
requireActual, and the requireActual pair is what proves the shim is transparent
to jest's module registry.

The new integration test pins the destination in BOTH directions -- <repo>/logs/
audit.log must contain a unique per-run marker, and node_modules/@crhs/web-core/
logs/audit.log must not grow. A 'the file got bigger' assertion alone would pass
on any concurrent write during the same run. LOG_DIR is set on both boxes, so the
destination this pins is the one production uses.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
SHA=$(git rev-parse HEAD); recput T40_SHA "$SHA"; recput T40_DONE yes
recput ADOPT_SHIMS_AFTER_40 "$(grep -rl '@crhs/web-core' server/ | wc -l)"
echo "T40_SHA=$SHA"
```
  - Expected: `BOOT_OK`; `✔ No circular dependency found!`; `shims_after=16`; an ESLint total **unchanged**
    from Task 39's recorded value ([MEASURED] `auditLogger.js` carries 0 errors, so the delta is 0 — a
    non-zero delta means the shim edit touched something else); a `Tests:` line matching the baseline; one
    commit pushed.
  - ⚠️ The commit body above assumes `T40_DEFECT_WAS_LIVE=yes`. If Step 1 recorded `no`, replace the
    destination paragraph with *"the destination was already correct before the shim (measured); the test is
    kept as a regression net"* — do not ship the fix claim.

**Rollback (exact; repo-only).**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; cd "$AFF"
WS_REC=/var/www/wavemax/cutover-logs/plan3-record.env
S=$(sed -n 's/^T40_SHA=//p' "$WS_REC" | tail -1); test -n "$S" || { echo 'STOP: no T40_SHA'; exit 1; }
git revert --no-edit "$S"
node -e 'const wc=require("@crhs/web-core");console.log("is_local_again="+(require("./server/utils/auditLogger")!==wc.auditLogger));'
wc -l tests/unit/auditLogger.test.js
LOG_DIR=logs npx jest tests/integration/auditLogDestination.test.js 2>&1 | grep -E '^Tests:'
```
- Rollback expected: the revert commit; `is_local_again=true`; `500 tests/unit/auditLogger.test.js`; and the
  destination test back to whatever Step 1 recorded (`1 failed` if `T40_DEFECT_WAS_LIVE=yes`, `1 passed` if
  `no`) — **compare against the recorded value, not against an assumption.**
- If the revert is taken after Task 46, revert Task 46 first (it deletes this shim).

---

### Task 41: [affiliate] PR B8 — `SystemConfig` becomes a registration module, in ONE commit

> **Execution position: Phase 4, immediately after Task 40.** Repo-only.
>
> ⛔ **Spec §7.1.3 hard rule, and the reason this task cannot be split.** [MEASURED]
> `server/models/SystemConfig.js:449` is `const SystemConfig = mongoose.model('SystemConfig', systemConfigSchema);`
> and web-core's `src/models/SystemConfig.js:301` registers the same name. On one mongoose instance, both
> reachable is **`OverwriteModelError` at boot**. The model file's body is therefore replaced in the **same
> commit** that creates the defaults file. There is no intermediate state and no two-step variant.
>
> [MEASURED] the file is **450** lines with **38** `key:` occurrences; web-core already ships
> `SystemConfig.registerDefaults(configs)` (`src/models/SystemConfig.js:230`) with validation on
> `key`/`category`/`dataType` and a same-key-different-definition guard, plus `initializeDefaults()` at `:272`.
> So this task moves app-owned defaults into `server/config/systemConfigDefaults.js` and calls
> `registerDefaults` — it does **not** need a web-core change.
>
> ⚠️ **`SystemConfig.js` stays at its path as a registration module, not a shim.** Four suites mock it by
> relative path ([MEASURED] `tests/unit/adminDashboard.test.js`, `administratorController.test.js`,
> `administratorControllerEnhanced.test.js`, `systemConfigRoutes.test.js`), and `tests/setup.js` calls
> `SystemConfig.initializeDefaults()` — which the root `CLAUDE.md` names as required. Turning it into a 1-line
> shim would work; keeping it as *the one place registration happens* is what keeps those four mocks and
> `tests/setup.js` working unchanged, and it is why Task 46's acceptance list names it as a **composition
> module**, not a shim.

**Files:**
- Create: `server/config/systemConfigDefaults.js` — the app-owned default entries moved **verbatim** out of
  `server/models/SystemConfig.js` (the block the draft calls `:167-394`; Step 1 re-derives the real bounds).
- Modify: `server/models/SystemConfig.js` (450 → registration module; **permanent**, not a shim).
- Delete: `tests/unit/systemConfig.test.js` (904, duplicate of core's).
- Create: `tests/unit/systemConfigDefaults.test.js`, `tests/unit/noDuplicateModelRegistration.test.js`.
- Modify: `tests/integration/webCoreInstanceIdentity.test.js` — add the `.base` identity assertions that are
  only **legal** once a single registration exists.

**Interfaces:**

*Consumes — the shared Step 0, plus:*

| # | consumed artefact | asserted by |
|:--|:--|:--|
| C41-1 | **Task 40 landed** | **Step 0** (`T40_SHA` ancestor **and** `require('./server/utils/auditLogger') === wc.auditLogger`) |
| C41-2 | web-core's `SystemConfig` exposes `registerDefaults` **and** `initializeDefaults`, and validates category/dataType | **Step 0** (`typeof` both = `function`; one deliberate bad-entry call that **throws**) |
| C41-3 | there is exactly **one** `mongoose.model('SystemConfig'` in `server/` today, at a known line, and exactly one in core | **Step 1** (grep counts, 1 and 1) |
| C41-4 | the four relative-path mock sites and `tests/setup.js`'s `initializeDefaults()` call exist, so the "keep the path" decision has a subject | **Step 1** (five greps, each ≥ 1) |

*Produces:*
- one `mongoose.model('SystemConfig', …)` registration process-wide, which is what makes the `.base` identity
  assertions legal (spec §10.3 P3);
- `server/config/systemConfigDefaults.js`, with every moved entry byte-accounted;
- 904 duplicate test lines deleted; **0** ESLint change ([MEASURED] `SystemConfig.js` carries no errors);
- record: `T41_SHA`, `T41_DONE=yes`, `T41_DEFAULTS_MOVED=<n>`, `T41_SEEDED_TOTAL=<n>`.

- [ ] **Step 0: the shared Step 0**, verbatim. Add:

```bash
anc T40_SHA
node -e 'const wc=require("@crhs/web-core");
console.log("  t40_shim_live="+(require("./server/utils/auditLogger")===wc.auditLogger));
const SC=wc.SystemConfig;
console.log("  registerDefaults="+typeof SC.registerDefaults, "initializeDefaults="+typeof SC.initializeDefaults);
let threw=false; try { SC.registerDefaults([{ key:"plan3_probe", category:"__nope__", dataType:"string" }]); }
catch (e) { threw = /category/.test(e.message); }
console.log("  validates_category="+threw);
process.exit(typeof SC.registerDefaults==="function" && typeof SC.initializeDefaults==="function" && threw ? 0 : 1)'
echo "  CORE_SC_EXIT=$?"
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: `OK T40_SHA ancestor`; `t40_shim_live=true`; `registerDefaults=function initializeDefaults=function`;
    `validates_category=true`; `CORE_SC_EXIT=0`; `gate=PASS`.
  - **`validates_category=true` is the load-bearing line**: it proves `registerDefaults` rejects a bad entry,
    so Step 3's "all entries registered cleanly" means something. If it prints `false`, the 24-odd moved
    entries would be accepted unvalidated and a typo'd `category` would surface at boot in production.

- [ ] **Step 1: derive the move, exactly. No line number from the draft is trusted.**

```bash
cd "$AFF"
printf 'file lines      = %s\n' "$(wc -l < server/models/SystemConfig.js)"
grep -n "mongoose.model('SystemConfig'" server/models/SystemConfig.js
printf 'app registrations  = %s\n' "$(grep -c "mongoose.model('SystemConfig'" server/models/SystemConfig.js)"
printf 'core registrations = %s\n' "$(grep -c "mongoose.model('SystemConfig'" "$WC/src/models/SystemConfig.js")"
node -e '
const src = require("fs").readFileSync("server/models/SystemConfig.js","utf8").split("\n");
let start = -1, end = -1, depth = 0;
src.forEach((l, i) => {
  if (start < 0 && /(defaultConfigs|DEFAULTS|defaults)\s*=\s*\[/.test(l)) { start = i + 1; depth = 1; return; }
  if (start > 0 && end < 0) { depth += (l.match(/\[/g)||[]).length - (l.match(/\]/g)||[]).length;
                              if (depth <= 0) end = i + 1; }
});
console.log("defaults array lines =", start + "-" + end, "span=" + (end - start + 1));
const block = src.slice(start - 1, end).join("\n");
console.log("entries (key: count) =", (block.match(/^\s*key:/gm)||[]).length);
console.log("brand leaks          =", (block.match(/wavemax/gi)||[]).length);'
for f in tests/unit/adminDashboard.test.js tests/unit/administratorController.test.js \
         tests/unit/administratorControllerEnhanced.test.js tests/unit/systemConfigRoutes.test.js tests/setup.js; do
  printf '%-52s %s\n' "$f" "$(grep -c 'SystemConfig' "$f")"
done
```
  - Expected: `file lines = 450`; `449:const SystemConfig = mongoose.model('SystemConfig', …`;
    `app registrations = 1`, `core registrations = 1`; a derived `defaults array lines = <a>-<b>` with an
    `entries (key: count)` figure and `brand leaks = 0`; then five files each with a non-zero count.
  - **`brand leaks = 0` is load-bearing.** The draft notes `L175` must already read `house Associates` after
    B3e's de-brand; if this prints non-zero, a brand-neutrality regression is being moved into a new file and
    must be fixed **in this commit** — `tests/unit/branding-guard.test.js` would catch it, but after the move,
    naming a file that did not exist when the baseline was written.
  - `app registrations` ≠ 1 or `core registrations` ≠ 1 → **STOP**: the §7.1.3 premise does not hold.
  - `recput T41_DEFAULTS_MOVED "<entries count>"`. Put both the span and the count in the PR body so a
    reviewer can verify nothing was dropped.

- [ ] **Step 2: write both guards, failing.**
      `tests/unit/noDuplicateModelRegistration.test.js`:

```js
const { execSync } = require('child_process');
const path = require('path');
const REPO = path.join(__dirname, '..', '..');

it('server/ registers SystemConfig nowhere — web-core owns the registration', () => {
  const out = execSync("grep -rn \"mongoose.model('SystemConfig'\" server/ || true", { cwd: REPO }).toString().trim();
  expect(out).toBe('');
});

it('the model is registered exactly once at runtime', () => {
  require('../../server/models/SystemConfig');
  const names = require('mongoose').modelNames().filter((n) => n === 'SystemConfig');
  expect(names).toHaveLength(1);
});

it('requiring the model twice does not throw OverwriteModelError (the §7.1.3 hazard)', () => {
  expect(() => {
    jest.resetModules();
    require('../../server/models/SystemConfig');
    require('../../server/models/SystemConfig');
  }).not.toThrow();
});
```
      `tests/unit/systemConfigDefaults.test.js` pins the **derived** entry count from Step 1 (not a literal
      typed from the draft), asserts no `wavemax` substring in any description, asserts every entry's
      `category` and `dataType` are values core accepts, and asserts `initializeDefaults()` seeds
      `core_count + app_count`.

```bash
cd "$AFF" && npx jest tests/unit/noDuplicateModelRegistration.test.js tests/unit/systemConfigDefaults.test.js 2>&1 | tail -20
```
  - Expected: the grep test fails printing
    `server/models/SystemConfig.js:449:  mongoose.model('SystemConfig', …` (the exact line Step 1 located),
    and the defaults suite fails with
    `Cannot find module '../../server/config/systemConfigDefaults'`.
  - The third case (`not.toThrow`) may **pass** today — it is a regression net for the swap, not a repro. Say
    so; do not "fix" it into failing.

- [ ] **Step 3: move the entries verbatim, make the model the registration module, and prove the identity
      assertions that only become legal now.** One commit, both files.

```bash
cd "$AFF"
printf 'server/ registrations after = %s\n' "$(grep -rc "mongoose.model('SystemConfig'" server/ | grep -v ':0' | wc -l)"
node -e '
const wc = require("@crhs/web-core");
const m  = require("mongoose");
const SC = require("./server/models/SystemConfig");
const defs = require("./server/config/systemConfigDefaults");
console.log("model_is_core      =", SC === wc.SystemConfig || SC.modelName === wc.SystemConfig.modelName);
console.log("SC.base_is_mongoose=", SC.base === m);
console.log("core.base_is_same  =", wc.SystemConfig.base === m);
console.log("driver_shared      =", m.mongo.Collection === require("mongodb").Collection);
console.log("registrations      =", m.modelNames().filter((n) => n === "SystemConfig").length);
console.log("app_defaults       =", Array.isArray(defs) ? defs.length : Object.keys(defs).length);
console.log("wc_version         =", require("@crhs/web-core/package.json").version);'
node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK')" 2>&1 | tail -2
PORT=3099 NODE_ENV=production node -e '
process.on("uncaughtException",(e)=>{console.log("BOOT_FAIL "+e.message);process.exit(1);});
process.on("unhandledRejection",(e)=>{console.log("BOOT_FAIL "+e);process.exit(1);});
require("./server.js"); setTimeout(()=>{console.log("PROD_BOOT_OK");process.exit(0);},2500);'
```
  - Expected: `server/ registrations after = 0`; then
    `model_is_core = true`, `SC.base_is_mongoose = true`, `core.base_is_same = true`,
    `driver_shared = true`, `registrations = 1`, `app_defaults = <Step 1's count>`, `wc_version = 0.3.x`;
    then `BOOT_OK` and `PROD_BOOT_OK`.
  - **`PROD_BOOT_OK` with `NODE_ENV=production` on a spare port is the §7.1.3 gate.** `OverwriteModelError`
    is a *boot* failure, and `NODE_ENV=test` short-circuits enough of `server.js` that the test-mode boot is
    not proof. Any `BOOT_FAIL … Cannot overwrite \`SystemConfig\` model` → **STOP** and revert the working
    tree; a partial move is the one state §7.1.3 forbids.
  - `registrations = 2` → same.

- [ ] **Step 4: the four relative-path mocks and `tests/setup.js` still work — the reason the path was kept.**

```bash
cd "$AFF"
git rm -q tests/unit/systemConfig.test.js
npx jest tests/unit/noDuplicateModelRegistration.test.js tests/unit/systemConfigDefaults.test.js \
         tests/integration/webCoreInstanceIdentity.test.js tests/unit/systemConfigRoutes.test.js \
         tests/unit/adminDashboard.test.js tests/unit/administratorController.test.js \
         tests/unit/administratorControllerEnhanced.test.js 2>&1 | grep -E '^(Tests:|Test Suites:)|✕'
node -e 'process.env.NODE_ENV="test";
const SC=require("./server/models/SystemConfig");
SC.initializeDefaults().then(async()=>{
  const n=await SC.countDocuments({}); console.log("seeded_total="+n); process.exit(0);
}).catch((e)=>{console.log("SEED_FAIL "+e.message);process.exit(1);});'
```
  - Expected: a `Tests:` line with no `✕` across the seven suites; then `seeded_total=<core + app>`, a number
    that must equal `core_defaults + T41_DEFAULTS_MOVED`. `recput T41_SEEDED_TOTAL "<n>"`.
  - `SEED_FAIL` naming a `category` or `dataType` → an entry was mis-transcribed in the move: fix it here.
  - A red `adminDashboard.test.js` / `administratorController*.test.js` / `systemConfigRoutes.test.js` means
    the relative-path mocks broke — i.e. the model file became a shim rather than staying the registration
    module. That is the decision this task deliberately made; **STOP** rather than editing four suites to
    accommodate a design the plan rejected.

- [ ] **Step 5: full suite, then commit — one commit, both files.**

```bash
cd "$AFF"
npx madge --circular server/ 2>&1 | tail -2
npx eslint server/ server.js 2>&1 | grep -E 'problems?' | tail -1
TZ=America/Chicago npx jest --runInBand 2>&1 | tail -8
git add -A server tests && git commit -m "refactor(webcore): B8 -- SystemConfig becomes a registration module (spec §7.1.3)

The app's 450-line copy of SystemConfig registered mongoose.model('SystemConfig')
at :449, and so does @crhs/web-core -- on one mongoose instance, both reachable is
OverwriteModelError AT BOOT. §7.1.3 therefore forbids any intermediate state, so
this is ONE commit: the app-owned default entries move verbatim into
server/config/systemConfigDefaults.js and the model file becomes the single place
registration happens, via core's SystemConfig.registerDefaults().

The file STAYS at server/models/SystemConfig.js rather than becoming a shim,
because four suites mock it by relative path and tests/setup.js calls
initializeDefaults() -- which the project rules require. Task 46 therefore lists it
as a composition module, not a shim.

The boot proof is NODE_ENV=production on a spare port, not the test-mode require:
OverwriteModelError is a boot failure and NODE_ENV=test short-circuits enough of
server.js that a test boot is not evidence. The entry count, the array span and the
post-seed document total are all derived and recorded, so a reviewer can verify
nothing was dropped in the move. tests/unit/systemConfig.test.js (904 lines,
duplicate of core's) is deleted; the new suites instead pin the single registration,
the entry set, and the .base identity assertions that were illegal before B8.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
SHA=$(git rev-parse HEAD); recput T41_SHA "$SHA"; recput T41_DONE yes; echo "T41_SHA=$SHA"
```
  - Expected: `✔ No circular dependency found!`; an ESLint total **unchanged** from Task 40's recorded value;
    a `Tests:` line matching the baseline; one commit pushed.

**Rollback (exact; repo-only — and the one rollback in this series that can leave a non-booting tree).**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; cd "$AFF"
WS_REC=/var/www/wavemax/cutover-logs/plan3-record.env
S=$(sed -n 's/^T41_SHA=//p' "$WS_REC" | tail -1); test -n "$S" || { echo 'STOP: no T41_SHA'; exit 1; }
git revert --no-edit "$S"
printf 'registrations in server/ = %s\n' "$(grep -rc "mongoose.model('SystemConfig'" server/ | grep -v ':0' | wc -l)"
node -e 'require("./server/models/SystemConfig");console.log("MODEL_OK")' 2>&1 | tail -2
PORT=3099 NODE_ENV=production node -e '
process.on("uncaughtException",(e)=>{console.log("BOOT_FAIL "+e.message);process.exit(1);});
require("./server.js"); setTimeout(()=>{console.log("PROD_BOOT_OK");process.exit(0);},2500);'
ls server/config/systemConfigDefaults.js 2>&1 | tail -1
```
- Rollback expected: the revert commit; `registrations in server/ = 1`; `MODEL_OK`; `PROD_BOOT_OK`; and
  `No such file or directory` for the defaults file.
- ⚠️ **`MODEL_OK` and `PROD_BOOT_OK` are both required.** The revert restores both files together, so no
  `OverwriteModelError` window should open — but if either prints `Cannot overwrite \`SystemConfig\` model`
  the revert was **partial**, and the deterministic fix is
  `git checkout "$S"~1 -- server/models/SystemConfig.js server/config/ tests/` followed by a re-run of both
  boot probes. Do **not** leave this tree in a half-reverted state: it does not boot.

---

### Task 42: [affiliate] PR B9 — session adoption, with the cookie name pinned explicitly

> **Execution position: Phase 4, immediately after Task 41.** Repo-only.
>
> 🚨 **A severity-1 defect found while assembling this task. Read this before writing any code.**
>
> [MEASURED] `server.js:418-420` resolves the session cookie name as
> `NODE_ENV === 'production' ? '__Host-portal.sid' : 'portal.sid'`. web-core's
> `resolveSessionCookieName()` (`src/config/sessionStore.js:35-38`) resolves
> `opts.cookieName || process.env.SESSION_COOKIE_NAME || DEFAULT_COOKIE_BASE`, and
> **`DEFAULT_COOKIE_BASE = 'app.sid'`** (`:22`). Run for real:
>
> ```
> NODE_ENV=production → core prod name = __Host-app.sid      (app today: __Host-portal.sid)
> NODE_ENV=test       → core test name = app.sid             (app today: portal.sid)
> ```
>
> And [MEASURED] **`SESSION_COOKIE_NAME` is absent from both boxes' `.env`** (`grep -c` = 0 on oci1 and oci2).
> So `buildSessionMiddleware({ mongoUrl, secret, ttlSeconds })` **without an explicit `cookieName`** renames
> the production session cookie from `__Host-portal.sid` to `__Host-app.sid`, and **every logged-in
> affiliate, customer, administrator and operator is signed out the moment Task 30 reloads pm2.** The
> Phase 0–1 assembler recorded the premise (finding 9: *"`SESSION_COOKIE_NAME` is absent from the production
> `.env`… a cookie-name change signs every logged-in portal user out on deploy"*) but no task resolved it.
>
> **Resolution:** pass `cookieName: 'portal.sid'` **explicitly** in the `buildSessionMiddleware` call, and gate
> on the resolved name matching the current value in **both** `NODE_ENV` branches, measured before the swap.
> Do **not** "fix" this by setting `SESSION_COOKIE_NAME` on the boxes: that is a production `.env` edit
> (C-10, HUMAN-CONFIRM, a reload) to achieve what one argument achieves in code, and it leaves the default
> still wrong for any future consumer.
>
> **Why the swap is worth doing at all.** The hand-rolled `maxAge` fixer at `server.js:~500-520` and
> web-core's `_maxAgeFixer` (`src/config/sessionStore.js:48`) are **two copies of the fix for a real 2026-09-11
> production outage** — a plain-object spread replaced the express-session `Cookie` prototype, the emitted
> cookie lost `Path`/`HttpOnly`/`Secure`/`SameSite`/`Expires`, and the `__Host-` prefix made the browser reject
> it outright, silently dropping every session. Two divergent copies of an outage fix is the hazard; one is the
> point. [MEASURED] both copies still carry the `MUTATE IN PLACE -- never replace this object` comment, and
> `DEFAULT_TTL_SECONDS = 600` matches the app's `sessionMaxAge = 10 * 60 * 1000` exactly.
>
> **`/health` must stay registered before the session middleware.** [MEASURED] `app.get('/health')` is
> `server.js:427` and `app.get('/health/origin')` is `:445`, both **before** `app.use(session({` at `:468` —
> deliberately, per the comment at `:421-426`: the Cloudflare LB monitor hits `/health` ~11/sec (~99 % of origin
> traffic) and `saveUninitialized: true` would mint a session per check. That is the **2026-05-25 ADB
> session-store incident**; sessions piled to ~2 M because ADB never runs a TTL sweep.

**Files:**
- Modify: `server.js` — the inline `session` require (`:383`), `sessionStore` (`:389-…`), `sessionCookieName`
  (`:418-420`), the `app.use(session({…}))` block (`:468-…`) and the hand-rolled `maxAge` fixer that follows
  it. **Located by content.** `sessionStore.clientP` must keep reaching `server.js:128-132` (the Oracle
  diagnostics attach for connect-mongo's own `MongoClient`).
- Create: `tests/integration/sessionMount.test.js`.

**Interfaces:**

*Consumes — the shared Step 0, plus:*

| # | consumed artefact | asserted by |
|:--|:--|:--|
| C42-1 | **Task 41 landed** | **Step 0** (`T41_SHA` ancestor **and** `server/` has 0 `mongoose.model('SystemConfig'`) |
| C42-2 | 🚨 **the cookie name web-core will resolve equals the name in production today, in both `NODE_ENV` branches** | **Step 1** (two-branch comparison, exit 1 on mismatch — this is the sign-everyone-out gate) |
| C42-3 | `SESSION_COOKIE_NAME` is absent from both boxes, so the default path is the live path | **Step 1** (per-box `grep -c` = 0, via `; true` not `\|\| echo 0` — C-5b) |
| C42-4 | web-core's TTL default equals the app's `sessionMaxAge` | **Step 1** (`DEFAULT_TTL_SECONDS * 1000 === 600000`) |
| C42-5 | `/health` and `/health/origin` are registered **before** the session middleware | **Step 1** (line ordering derived from `grep -n`, asserted numerically) |
| C42-6 | `sessionStore.clientP` is consumed for the Oracle diagnostics attach | **Step 1** (`grep -c 'sessionStore.clientP'` = 1) |

*Produces:*
- `server.js` ~107 lines shorter; one `_maxAgeFixer`, in web-core, instead of two divergent copies;
- the production cookie name **unchanged** (`__Host-portal.sid`) and the test name unchanged (`portal.sid`),
  pinned by a test;
- `server.js`'s single ESLint error gone ([MEASURED] `no-unused-vars` on the `originalExpires` binding at
  `:503`) — the only error outside `server/` this series closes;
- `tests/integration/sessionMount.test.js`;
- record: `T42_SHA`, `T42_DONE=yes`, `T42_COOKIE_PROD`, `T42_COOKIE_TEST`.

- [ ] **Step 0: the shared Step 0**, verbatim. Add:

```bash
anc T41_SHA
chk sysconfig_registrations "$(grep -rc "mongoose.model('SystemConfig'" server/ | grep -v ':0' | wc -l)" 0
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: `OK T41_SHA ancestor`, `OK sysconfig_registrations=0`, `gate=PASS`.

- [ ] **Step 1: 🚨 the cookie-name gate. Nothing else in this task runs until it passes.**

```bash
cd "$AFF"
# what the app resolves today, read from server.js itself
node -e '
const src = require("fs").readFileSync("server.js", "utf8");
const m = src.match(/const sessionCookieName = [\s\S]{0,200}?;/);
console.log("app resolver source:\n" + (m ? m[0] : "NOT FOUND"));
process.exit(m ? 0 : 1)'
echo "APP_RESOLVER_EXIT=$?"

for E in production test development; do
  APP=$(NODE_ENV=$E node -e 'console.log(process.env.NODE_ENV === "production" ? "__Host-portal.sid" : "portal.sid")')
  CORE_DEFAULT=$(NODE_ENV=$E node -e 'console.log(require("@crhs/web-core/src/config/sessionStore").resolveSessionCookieName())' 2>/dev/null \
    || NODE_ENV=$E node -e 'const p=require.resolve("@crhs/web-core/package.json").replace(/package\.json$/,"src/config/sessionStore");console.log(require(p).resolveSessionCookieName())')
  CORE_PINNED=$(NODE_ENV=$E node -e 'const p=require.resolve("@crhs/web-core/package.json").replace(/package\.json$/,"src/config/sessionStore");console.log(require(p).resolveSessionCookieName({cookieName:"portal.sid"}))')
  printf '%-12s app=%-20s core_default=%-20s core_pinned=%-20s default_ok=%s pinned_ok=%s\n' \
    "$E" "$APP" "$CORE_DEFAULT" "$CORE_PINNED" \
    "$([ "$APP" = "$CORE_DEFAULT" ] && echo yes || echo NO)" \
    "$([ "$APP" = "$CORE_PINNED" ] && echo yes || echo NO)"
done

for IP in 161.153.71.201 144.24.4.202; do
  printf '%s SESSION_COOKIE_NAME_set=' "$IP"
  ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@$IP \
    "grep -c '^SESSION_COOKIE_NAME=' /var/www/wavemax/wavemax-affiliate-program/.env; true"
done

node -e 'const s=require.resolve("@crhs/web-core/package.json").replace(/package\.json$/,"src/config/sessionStore");
const m=require(s);console.log("core_ttl_ms="+(m.DEFAULT_TTL_SECONDS*1000), "core_cookie_base_default="+m.resolveSessionCookieName({}));'
grep -n 'sessionMaxAge = ' server.js | head -1
printf 'health=%s health_origin=%s session=%s\n' \
  "$(grep -n "app.get('/health'" server.js | cut -d: -f1)" \
  "$(grep -n "app.get('/health/origin'" server.js | cut -d: -f1)" \
  "$(grep -n 'app.use(session(' server.js | cut -d: -f1)"
printf 'clientP consumers = %s\n' "$(grep -c 'sessionStore.clientP' server.js)"
```
  - Expected, and **[MEASURED] verbatim today**:
    ```
    production   app=__Host-portal.sid    core_default=__Host-app.sid   core_pinned=__Host-portal.sid   default_ok=NO  pinned_ok=yes
    test         app=portal.sid           core_default=app.sid          core_pinned=portal.sid          default_ok=NO  pinned_ok=yes
    development  app=portal.sid           core_default=app.sid          core_pinned=portal.sid          default_ok=NO  pinned_ok=yes
    ```
    then `161.153.71.201 SESSION_COOKIE_NAME_set=0` and the same for oci2; then
    `core_ttl_ms=600000 core_cookie_base_default=app.sid` and `const sessionMaxAge = 10 * 60 * 1000;`;
    then `health=427 health_origin=445 session=468`; then `clientP consumers = 1`.
  - 🚨 **`default_ok=NO` in all three rows is the finding, and it is expected.** It means the swap **must**
    pass `cookieName: 'portal.sid'` explicitly. `pinned_ok=yes` in all three rows is the **only** condition
    under which Step 3 may proceed. A `pinned_ok=NO` anywhere → **STOP**: there is no safe call shape and the
    task needs a web-core change first.
  - `SESSION_COOKIE_NAME_set` = 1 on a box → read the value; if it is not `portal.sid`, the box is already
    running a different cookie name than `server.js` implies and this whole analysis must be redone.
  - `core_ttl_ms` ≠ `600000` → the TTL would change, which re-opens the 2026-05-25 session-bloat risk from the
    other direction: **STOP**.
  - `health=427 health_origin=445 session=468` — both numbers must be **less than** the session number. If
    either exceeds it, `/health` is already minting a session per Cloudflare probe (~11/sec) and that is a live
    incident, not a refactor precondition: **STOP** and report.
  - `clientP consumers = 0` → the Oracle diagnostics attach was already removed; record it, because Step 3's
    "unchanged" claim would be false.
  - ⚠️ Note the `; true` after `grep -c` (C-5b): `grep -c` prints `0` **and** exits 1, so `|| echo 0` emits a
    *second* line and every offset after it shifts. That exact defect is visible in the source draft.

- [ ] **Step 2: write the mount test, and record which cases are green BEFORE the swap.**
      Create `tests/integration/sessionMount.test.js` asserting:
      `GET /health` emits **no** `Set-Cookie` (the 2026-05-25 guard) while `GET /api/csrf-token` **does** — the
      second is the control, because "no cookie anywhere" would pass the first vacuously;
      the cookie name is `portal.sid` under `NODE_ENV=test` and the code path that produces `__Host-portal.sid`
      is unit-asserted for `production` (a `__Host-` cookie cannot be set over the test server's plain HTTP, so
      assert the **resolver**, not the header, for that branch);
      `originalMaxAge === 600000` on the issued cookie;
      the `maxAge` repair path keeps a real `Cookie` prototype — set `req.session.cookie.maxAge = NaN`, run the
      fixer, and assert the emitted `Set-Cookie` still carries `Path=/` **and** `HttpOnly` (this is the
      2026-09-11 outage, pinned: a plain-object spread loses both).

```bash
cd "$AFF" && npx jest tests/integration/sessionMount.test.js 2>&1 | tail -20
```
  - Expected: it may **pass entirely** on the current inline block — [MEASURED] the ordering at `:427/:445`
    vs `:468` is already correct and the fixer already mutates in place. **State that plainly: this suite is a
    regression net for the swap, not a defect repro.** Record which cases were green before the change; any
    case that is red **now** is a live defect and must be fixed before the swap, not by it.

- [ ] **Step 3: swap the block, with the cookie name pinned.**

```bash
cd "$AFF"
# after the edit:
grep -n 'buildSessionMiddleware\|cookieName\|originalExpires\|_maxAgeFixer\|sessionStore.clientP' server.js
printf 'cookieName pinned = %s\n' "$(grep -c "cookieName: 'portal.sid'" server.js)"
printf 'originalExpires   = %s\n' "$(grep -c 'originalExpires' server.js || true)"
npx eslint server.js 2>&1 | tail -3
node --check server.js && echo SYNTAX_OK
printf 'health=%s health_origin=%s session=%s\n' \
  "$(grep -n "app.get('/health'" server.js | cut -d: -f1)" \
  "$(grep -n "app.get('/health/origin'" server.js | cut -d: -f1)" \
  "$(grep -n 'buildSessionMiddleware' server.js | tail -1 | cut -d: -f1)"
```
  - Expected: a `buildSessionMiddleware({ … cookieName: 'portal.sid' … })` line, a `sessionStore.clientP` line
    still present, **no** `originalExpires` line; `cookieName pinned = 1`; `originalExpires = 0`;
    `npx eslint server.js` printing **nothing** (1 error → 0, the only out-of-`server/` error this series
    closes); `SYNTAX_OK`; and the two health line numbers still **less than** the mount line number.
  - `cookieName pinned = 0` → 🚨 **STOP.** This is the sign-everyone-out defect; the call must not ship without
    the explicit name.
  - eslint still reporting `server.js` → the `originalExpires` binding survived; remove it.

- [ ] **Step 4: prove nobody is logged out, and the fixer still emits a `__Host-`-legal cookie.**

```bash
cd "$AFF"
npx jest tests/integration/sessionMount.test.js tests/integration/domainMigration.test.js \
         tests/integration/webCoreConsumptionGolden.test.js tests/integration/csrf.test.js 2>&1 | grep -E '^(Tests:|Test Suites:)|✕'
NODE_ENV=production node -e '
const src=require("fs").readFileSync("server.js","utf8");
const m=src.match(/cookieName:\s*'\''([^'\'']+)'\''/);
const p=require.resolve("@crhs/web-core/package.json").replace(/package\.json$/,"src/config/sessionStore");
console.log("configured_base   =", m ? m[1] : "NONE");
console.log("resolved_prod_name=", require(p).resolveSessionCookieName({ cookieName: m ? m[1] : undefined }));
console.log("matches_live      =", require(p).resolveSessionCookieName({ cookieName: m ? m[1] : undefined }) === "__Host-portal.sid");'
```
  - Expected: a `Tests:` line with no `✕`; then `configured_base = portal.sid`,
    `resolved_prod_name = __Host-portal.sid`, `matches_live = true`.
  - ⚠️ `domainMigration.test.js:46-55` and `webCoreConsumptionGolden.test.js:67-76` **pin the cookie name**.
    If either reds, **STOP**: that is the signature of every logged-in portal user being signed out on deploy.
  - `matches_live = false` → **STOP**, regardless of what the suites say.
  - `recput T42_COOKIE_PROD __Host-portal.sid; recput T42_COOKIE_TEST portal.sid`.

- [ ] **Step 5: boot both ways, full suite, commit.**

```bash
cd "$AFF"
node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK')" 2>&1 | tail -2
PORT=3099 NODE_ENV=production node -e '
process.on("uncaughtException",(e)=>{console.log("BOOT_FAIL "+e.message);process.exit(1);});
process.on("unhandledRejection",(e)=>{console.log("BOOT_FAIL "+e);process.exit(1);});
require("./server.js"); setTimeout(()=>{console.log("PROD_BOOT_OK");process.exit(0);},2500);'
npx madge --circular server/ 2>&1 | tail -2
npx eslint server/ server.js 2>&1 | grep -E 'problems?' | tail -1
TZ=America/Chicago npx jest --runInBand 2>&1 | tail -8
git add -A server.js tests && git commit -m "refactor(webcore): B9 -- session adoption, with the cookie name pinned explicitly

server.js's inline express-session block and its hand-rolled maxAge fixer move to
@crhs/web-core's buildSessionMiddleware (spec §7.2). /health (:427) and
/health/origin (:445) stay registered BEFORE the mount -- the Cloudflare LB monitor
hits /health ~11/sec and saveUninitialized:true would mint a session per check,
which is the 2026-05-25 incident that piled ~2M sessions onto an ADB that never
runs a TTL sweep.

SEVERITY-1 CAUGHT BEFORE THE SWAP: web-core's DEFAULT_COOKIE_BASE is 'app.sid',
and SESSION_COOKIE_NAME is absent from BOTH boxes' .env -- so a default-shaped
buildSessionMiddleware() call would have renamed the production cookie from
__Host-portal.sid to __Host-app.sid and signed out every logged-in affiliate,
customer, administrator and operator the moment pm2 reloaded. The call therefore
passes cookieName: 'portal.sid' EXPLICITLY, and the gate compares the resolved name
against the live one in every NODE_ENV branch. Fixing it by setting
SESSION_COOKIE_NAME on the boxes was rejected: that is a production .env edit plus
a reload to achieve what one argument achieves in code, and it leaves core's default
wrong for the next consumer.

Deleting the local maxAge fixer removes the second copy of a real outage fix. On
2026-09-11 a plain-object spread replaced the express-session Cookie prototype, the
emitted cookie lost Path/HttpOnly/Secure/SameSite/Expires, and under the __Host-
prefix the browser rejected it outright -- sessions silently dropped. The new test
pins that repair path: NaN maxAge in, Path=/ and HttpOnly still out.

Closes server.js's only ESLint error (no-unused-vars on the originalExpires
binding) -- the one error outside server/ this series closes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
SHA=$(git rev-parse HEAD); recput T42_SHA "$SHA"; recput T42_DONE yes; echo "T42_SHA=$SHA"
```
  - Expected: `BOOT_OK`; `PROD_BOOT_OK`; `✔ No circular dependency found!`; an ESLint total exactly **1 lower**
    than Task 41's recorded value; a `Tests:` line matching the baseline; one commit pushed.

**Rollback (exact; repo-only — but the one rollback in this series with a session-visible effect).**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; cd "$AFF"
WS_REC=/var/www/wavemax/cutover-logs/plan3-record.env
S=$(sed -n 's/^T42_SHA=//p' "$WS_REC" | tail -1); test -n "$S" || { echo 'STOP: no T42_SHA'; exit 1; }
git revert --no-edit "$S"
grep -c 'buildSessionMiddleware' server.js
NODE_ENV=production node -e 'const src=require("fs").readFileSync("server.js","utf8");
const m=src.match(/const sessionCookieName = [\s\S]{0,200}?;/);
console.log("inline_resolver_back="+!!m);
console.log("prod_name=", process.env.NODE_ENV==="production" ? "__Host-portal.sid" : "portal.sid");'
npx jest tests/integration/sessionMount.test.js tests/integration/domainMigration.test.js 2>&1 | grep -E '^Tests:'
node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK')" | tail -1
```
- Rollback expected: the revert commit; `0` `buildSessionMiddleware` occurrences;
  `inline_resolver_back=true` and `prod_name= __Host-portal.sid`; a `Tests:` line with no failures; `BOOT_OK`.
- **The cookie name is `__Host-portal.sid` in both directions**, so sessions survive the revert as well as the
  change — which is the entire reason the name was pinned rather than defaulted. The `sessions` collection and
  the TTL are unchanged either way.
- If reverted after Task 30 deployed: `git pull --ff-only && pm2 reload wavemax --update-env` on **one box at a
  time under `BOX_BUSY`** (C-7), then confirm the cookie name on the wire:
  `curl -sI https://portal.atxwashdryfold.com/api/csrf-token | grep -i '^set-cookie' | grep -c '__Host-portal.sid'` → `1`.

---

### Task 43: [affiliate] PR B10 — email wrapper modules; **zero dispatcher edits** is the acceptance

> **Execution position: Phase 4, immediately after Task 42.** Repo-only.
>
> [MEASURED] `server/services/email/transport.js` (82 lines) and `server/services/email/template-manager.js`
> (129) duplicate web-core's `src/email/transport.js` and `src/email/template-manager.js`, which already ship
> the 5-arg brand-parameterised `sendEmail` with `replyTo` (B3g) and `loadTemplate`/`fillTemplate` (B3k).
> These two become **wrappers**, not shims: they bind the app's brand and its own `TEMPLATE_ROOT`, so the
> **19 two-arg `loadTemplate` call sites across the six dispatchers stay untouched.** Zero dispatcher edits
> is the acceptance criterion.
>
> ⚠️ **The 2026-08-23 outage rule is absolute: `EMAIL_USER` must own `EMAIL_FROM`.** All app mail was dead for
> a day because `EMAIL_FROM=no-reply@crhsent.com` while `EMAIL_USER` was still `@wavemax.promo` (unowned) →
> `553 rejected`, masked because the welcome-email path only `logger.warn`ed. web-core's `validateMailConfig()`
> (B3j) enforces it; the wrapper must keep calling it, and Step 1 asserts that the check **fails** on a
> deliberately mismatched pair.
>
> ⚠️ **Never destructure `brand`** (memory `brand_config_lazy_resolve_2026-08-24`): `server/config/brand.js`
> snapshotted `process.env` at import and sent mail as *"Laundromat"* from any script that loaded before
> dotenv. It is lazy getters now. `const { brandName } = require('../config/brand')` re-introduces the bug.
>
> ⚠️ `TEMPLATE_ROOT` must resolve to **the app's own** `server/templates/emails`, not web-core's. This is the
> same class as B6's audit-log destination, and it is asserted the same way — with a per-run marker, not a
> "directory exists" check.

**Files:**
- Modify: `server/services/email/transport.js` (82 → wrapper), `server/services/email/template-manager.js`
  (129 → wrapper), following the `server/utils/cspHelper.js:1-31` pattern ([MEASURED] 30 statements, **no env
  dependency at module scope**).
- Delete: `tests/unit/emailTransport.test.js` (63).
- Create/extend: `tests/unit/email-brand.test.js`.
- **Not touched:** the six dispatchers. [MEASURED] the 19 `loadTemplate(` call sites are
  `dispatcher/affiliate.js:25,188,349,488,559,663`, `admin.js:18,135`,
  `customer.js:98,256,420,518,613`, `operator.js:18,137,253`, `onboarding.js:39`.
  ⚠️ Task 37 edits the dispatchers' `BASE_URL ||` defaults; those are **different lines** from these call
  sites, and Step 0 asserts both facts independently.

**Interfaces:**

*Consumes — the shared Step 0, plus:*

| # | consumed artefact | asserted by |
|:--|:--|:--|
| C43-1 | **Task 42 landed** | **Step 0** (`T42_SHA` ancestor **and** `grep -c buildSessionMiddleware server.js` = 1) |
| C43-2 | **Task 37 landed** — the dispatchers' `BASE_URL` defaults are already the portal, so a dispatcher diff in *this* task is a bug, not leftover work | **Step 0** (`git grep -c rundberglaundry -- server/services/email` = 0) |
| C43-3 | web-core's `email.transport.sendEmail` takes brand parameters and `replyTo`, and `email.templateManager` exposes `loadTemplate`/`fillTemplate` | **Step 0** (arity + `typeof` probe) |
| C43-4 | `validateMailConfig()` exists and **rejects** a mismatched `EMAIL_USER`/`EMAIL_FROM` pair | **Step 1** (two calls: one matched → ok, one mismatched → throws/returns falsy) |
| C43-5 | the 19 `loadTemplate(` call sites are countable before the change, so "zero dispatcher edits" is verifiable | **Step 0** (per-file counts summing to 19) |

*Produces:*
- two wrapper modules, permanent (composition, not shims — Task 46 lists them as such);
- 63 duplicate test lines deleted; **0** ESLint change ([MEASURED] neither file carries an error);
- `tests/unit/email-brand.test.js` pinning the brand passthrough, `TEMPLATE_ROOT`, and the
  `EMAIL_USER`-owns-`EMAIL_FROM` rule;
- **`git diff --stat` naming no file under `server/services/email/dispatcher/`** — the acceptance;
- record: `T43_SHA`, `T43_DONE=yes`, `T43_CALLSITES=19`.

- [ ] **Step 0: the shared Step 0**, verbatim. Add:

```bash
anc T42_SHA
chk session_adopted "$(grep -c 'buildSessionMiddleware' server.js)" 1
chk dispatcher_hosts_clean "$(git grep -c 'rundberglaundry' -- server/services/email | wc -l)" 0
node -e '
const wc = require("@crhs/web-core");
const t  = wc.email.transport, tm = wc.email.templateManager || wc.email["template-manager"];
console.log("  sendEmail arity =", t.sendEmail.length, "| loadTemplate =", typeof (tm && tm.loadTemplate),
            "| fillTemplate =", typeof (tm && tm.fillTemplate),
            "| validateMailConfig =", typeof (t.validateMailConfig || wc.email.validateMailConfig));'
printf '  loadTemplate call sites:\n'
grep -c 'loadTemplate(' server/services/email/dispatcher/*.js server/services/email/*.js | grep -v ':0' | sed 's/^/    /'
printf '  total=%s\n' "$(grep -o 'loadTemplate(' server/services/email/dispatcher/*.js server/services/email/*.js | wc -l)"
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: `OK T42_SHA ancestor`, `OK session_adopted=1`, `OK dispatcher_hosts_clean=0`;
    `sendEmail arity = 5 | loadTemplate = function | fillTemplate = function | validateMailConfig = function`;
    a per-file list summing to `total=19`; `gate=PASS`.
  - `dispatcher_hosts_clean` ≠ 0 → Task 37 did not land: **STOP**, otherwise this task's "zero dispatcher
    edits" acceptance cannot distinguish its own diff from Task 37's leftover work.
  - `total` ≠ 19 → record the real number and use it; the acceptance is *"the count is unchanged"*, not *"19"*.

- [ ] **Step 1: falsify the mail-config rule before relying on it (R-9 / C-11).**

```bash
cd "$AFF"
node -e '
const wc = require("@crhs/web-core");
const v  = wc.email.transport.validateMailConfig || wc.email.validateMailConfig;
const probe = (user, from) => {
  const save = { u: process.env.EMAIL_USER, f: process.env.EMAIL_FROM };
  process.env.EMAIL_USER = user; process.env.EMAIL_FROM = from;
  let out;
  try { const r = v(); out = "ok:" + JSON.stringify(r === undefined ? true : r); }
  catch (e) { out = "THREW:" + e.message.slice(0, 80); }
  process.env.EMAIL_USER = save.u; process.env.EMAIL_FROM = save.f;
  return out;
};
console.log("matched    ", probe("no-reply@crhsent.com", "no-reply@crhsent.com"));
console.log("same domain", probe("admin@crhsent.com",    "no-reply@crhsent.com"));
console.log("MISMATCHED ", probe("no-reply@wavemax.promo", "no-reply@crhsent.com"));'
```
  - Expected: `matched` and `same domain` both `ok:…`, and **`MISMATCHED` printing `THREW:…`** naming the
    domain mismatch.
  - 🚨 **`MISMATCHED  ok:…` means `validateMailConfig` does not enforce the 2026-08-23 rule.** That outage
    killed all app mail for a day and was masked by a `logger.warn`. **STOP** and fix web-core first; do not
    build a wrapper on a check that does not check.
  - Paste this output into the PR body.

- [ ] **Step 2: write the failing seam test.** `tests/unit/email-brand.test.js` asserts:
      `fromName` reaches core's `sendEmail` unchanged (assert on the captured argument, not on a send);
      a **string** 4th argument passes through unchanged (the wrapper must not swallow or reorder args);
      `TEMPLATE_ROOT` resolves to the app's own `server/templates/emails` — proved by loading a template that
      exists **only** in the app tree and asserting its content, not by `fs.existsSync` on a directory;
      `brand` is accessed through its getters, never destructured — asserted by requiring `config/brand`,
      mutating `process.env` **after** the require, and observing the new value (a snapshot fails this);
      and `validateMailConfig()` is still called on the send path, proved by the mismatched pair from Step 1
      making a send **fail**.

```bash
cd "$AFF" && npx jest tests/unit/email-brand.test.js 2>&1 | tail -20
```
  - Expected: failures naming the wrapper exports that do not exist yet. `Tests: 0 total` → the file was not
    written: **STOP.**

- [ ] **Step 3: write both wrappers** per spec §7.2.4, with **no env read at module scope** (the
      `server/utils/cspHelper.js` pattern) and **no `brand` destructuring**.

```bash
cd "$AFF"
printf 'brand destructured = %s\n' "$(grep -cE "const \{[^}]*\} = require\(['\"].*config/brand" server/services/email/*.js || true)"
printf 'module-scope env   = %s\n' "$(awk '/^(const|let|var) /&&/process\.env/' server/services/email/transport.js server/services/email/template-manager.js | wc -l)"
node -e 'const t=require("./server/services/email/transport"), tm=require("./server/services/email/template-manager");
console.log("transport keys =", Object.keys(t).sort().join(","));
console.log("tm keys        =", Object.keys(tm).sort().join(","));'
```
  - Expected: `brand destructured = 0`; `module-scope env = 0`; and two `keys =` lines **identical to what the
    same command printed before the change** (capture them in Step 0 if you did not). A missing key is a broken
    call site at boot.

- [ ] **Step 4: the acceptance — zero dispatcher edits — and the 19 call sites still work.**

```bash
cd "$AFF"
git rm -q tests/unit/emailTransport.test.js
# The acceptance: NO dispatcher file appears in this task's diff, staged or unstaged.
DISP=$( { git diff --name-only; git diff --cached --name-only; } | sort -u | grep -c 'server/services/email/dispatcher/'; true )
echo "DISPATCHER_FILES_IN_DIFF=$DISP"
{ git diff --name-only; git diff --cached --name-only; } | sort -u | grep 'server/services/email/dispatcher/' || echo '  (none — correct)'
printf 'loadTemplate total = %s\n' "$(grep -o 'loadTemplate(' server/services/email/dispatcher/*.js server/services/email/*.js | wc -l)"
npx jest tests/unit/email-brand.test.js tests/integration/emailService.integration.test.js \
         tests/unit/emailServiceUncovered.test.js tests/unit/emailServiceAdditional.test.js \
         tests/unit/affiliateEmailUrls.test.js 2>&1 | grep -E '^(Tests:|Test Suites:)|✕'
```
  - Expected: `DISPATCHER_FILES_IN_DIFF=0` followed by `  (none — correct)`; `loadTemplate total = 19`
    (unchanged from Step 0); then a `Tests:` line with no `✕` across the five suites.
  - **`DISPATCHER_FILES_IN_DIFF=0` is the acceptance criterion in one number**, and it is a count, not an exit
    status, so it rises the moment a dispatcher is edited. Any non-zero value means the wrapper is not
    signature-compatible: **STOP** and fix the wrapper, not the dispatcher.
  - `loadTemplate total` ≠ Step 0's figure means a call site was added or removed — the same failure by another
    route.
  - `tests/integration/emailService.integration.test.js:161-193` is the named acceptance in the spec.

- [ ] **Step 5: boot, full suite, commit.**

```bash
cd "$AFF"
node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK')" 2>&1 | tail -2
npx madge --circular server/ 2>&1 | tail -2
npx eslint server/ server.js 2>&1 | grep -E 'problems?' | tail -1
TZ=America/Chicago npx jest --runInBand 2>&1 | tail -8
git add -A server tests && git commit -m "refactor(webcore): B10 -- email transport + template-manager become wrappers

transport.js (82 lines) and template-manager.js (129) duplicated web-core's copies,
which already ship the 5-arg brand-parameterised sendEmail with replyTo and
loadTemplate/fillTemplate. Both become WRAPPERS, not shims: they bind this app's
brand and its own TEMPLATE_ROOT, so all 19 two-arg loadTemplate call sites across
the six dispatchers keep their signature. ZERO dispatcher edits is the acceptance,
and it is asserted -- git status prints nothing for the dispatcher directory and the
loadTemplate count is unchanged at 19.

Three hazards pinned by the new tests rather than trusted:
- EMAIL_USER must own EMAIL_FROM. On 2026-08-23 all app mail was dead for a day
  because EMAIL_FROM was @crhsent.com while EMAIL_USER was still @wavemax.promo
  (553 rejected), masked by a logger.warn. validateMailConfig's rejection of a
  mismatched pair is falsified before the wrapper relies on it.
- brand is never destructured. config/brand.js used to snapshot process.env at
  import and sent mail as 'Laundromat' from any script loading before dotenv; it is
  lazy getters now, and the test mutates env AFTER the require to prove it.
- TEMPLATE_ROOT resolves to this app's server/templates/emails, proved by loading a
  template that exists only in the app tree -- not by an existsSync on a directory.

No env is read at module scope (the cspHelper.js pattern).
tests/unit/emailTransport.test.js (63 lines, duplicate) is deleted.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
SHA=$(git rev-parse HEAD); recput T43_SHA "$SHA"; recput T43_DONE yes; echo "T43_SHA=$SHA"
```
  - Expected: `BOOT_OK`; `✔ No circular dependency found!`; an ESLint total **unchanged** from Task 42's
    recorded value; a `Tests:` line matching the baseline; one commit pushed.

**Rollback (exact; repo-only).**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; cd "$AFF"
WS_REC=/var/www/wavemax/cutover-logs/plan3-record.env
S=$(sed -n 's/^T43_SHA=//p' "$WS_REC" | tail -1); test -n "$S" || { echo 'STOP: no T43_SHA'; exit 1; }
git revert --no-edit "$S"
wc -l server/services/email/transport.js server/services/email/template-manager.js
printf 'wrapper markers = %s\n' "$(grep -c '@crhs/web-core' server/services/email/transport.js || true)"
npx jest tests/integration/emailService.integration.test.js 2>&1 | grep -E '^Tests:'
node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK')" | tail -1
```
- Rollback expected: the revert commit; `82` and `129` line counts restored; `wrapper markers = 0`; a `Tests:`
  line with no failures; `BOOT_OK`.
- **`wrapper markers = 0` is the discriminating assertion** — the line counts alone can be restored by a
  partial revert that leaves the `@crhs/web-core` require behind.
- **No mail is sent by the revert.** If reverted after Task 30 deployed, `pm2 reload wavemax` one box at a time
  and send exactly one probe:
  `node -e "require('dotenv').config();require('./server/services/email/transport').sendEmail('admin@crhsent.com','B10 revert probe','<p>ok</p>')"`
  → expect no `553`.

---

### Task 44: [affiliate] PR B11 — CORS adoption, and the empty-`CORS_ORIGIN` trap

> **Execution position: Phase 4, immediately after Task 43.** Repo + `.env.example`; no box `.env` edit.
>
> [MEASURED] `server.js:291-337` is a 47-line inline `corsOptions` whose `origin` callback computes
> `allowedOrigins ∪ wavemaxDomains`, where `allowedOrigins` is `CORS_ORIGIN` split on commas **or**
> `['http://localhost:3000']` when `CORS_ORIGIN` is unset/empty (`:293-295`), and `wavemaxDomains` is a
> hard-coded array. **Task 37 already reduces `wavemaxDomains` to the portal alone**, so by the time this task
> runs the inline block's effective allowlist is `CORS_ORIGIN` ∪ `{portal}` — and production `CORS_ORIGIN` is
> [MEASURED] `https://portal.atxwashdryfold.com` on **both** boxes. So this swap is a **de-duplication with no
> behaviour change**, which is only true because Task 37 ran first. That ordering is asserted, not assumed.
>
> ⚠️ **The trap, from memory `cors_localhost_wavemax_promo_exposure_2026-09-13`.** Today an unset or empty
> `CORS_ORIGIN` falls back to `localhost:3000` at `:293-295`. After the swap, web-core's `corsConfig` has **no
> default origins**, so an empty value **rejects everything** — a *different* failure mode in which the
> portal's own pages lose credentialed API access. The value must be **non-empty on both boxes before any
> reload**, and it already is; Step 1 asserts it and Step 5 re-asserts it after Task 30's deploy window.
>
> ⚠️ `.env.example:72-91` currently documents this in prose and sets `CORS_ORIGIN=http://localhost:3000`
> ([MEASURED] `:87`), with a comment block explicitly saying *"B11 must therefore set `CORS_ORIGIN` to that
> union, not to either half alone"*. That advice was written **before** Task 37 removed the union's other half;
> Step 4 rewrites the comment to match reality rather than leaving a note that contradicts the code.

**Files:**
- Modify: `server.js` — delete the inline `corsOptions` block (`:291-336`) and `app.use(cors(corsOptions))`
  (`:337`) becomes `app.use(cors(webCore.corsConfig))`. **Located by content.**
- Modify (**HUMAN-CONFIRM**): `.env.example:72-91` — the value and the now-stale comment block.
- Extend: `tests/integration/cors.test.js`.

**Interfaces:**

*Consumes — the shared Step 0, plus:*

| # | consumed artefact | asserted by |
|:--|:--|:--|
| C44-1 | **Task 43 landed** | **Step 0** (`T43_SHA` ancestor **and** `grep -c '@crhs/web-core' server/services/email/transport.js` = 1) |
| C44-2 | 🚨 **Task 37 landed**: `wavemaxDomains` contains no marketing origin, so the swap drops nothing | **Step 1** (parse the array out of `server.js`; marketing-entry count = **0**) |
| C44-3 | `CORS_ORIGIN` is **non-empty** on both boxes, so the no-default-origins behaviour is safe | **Step 1** (per-box value printed and length-checked) |
| C44-4 | web-core's `corsConfig` has `credentials: true`, rejects a null origin, and has **no** built-in origins | **Step 1** (three behaviour probes against the config's `origin` callback) |
| C44-5 | every origin the inline block admitted is either in `CORS_ORIGIN` or on this plan's deliberate drop list | **Step 3** (origin-set difference, printed and named in the commit body) |

*Produces:*
- `app.use(cors(webCore.corsConfig))`; one CORS policy, env-driven;
- `.env.example` documenting `CORS_ORIGIN=https://portal.atxwashdryfold.com` with a comment that matches the
  code;
- record: `T44_SHA`, `T44_DONE=yes`, `T44_DROPPED_ORIGINS=<comma list>`;
- an ESCALATIONS row: `CORS_ORIGIN` must never be emptied on a box (the failure mode is total, and silent
  until a page makes a credentialed call).

- [ ] **Step 0: the shared Step 0**, verbatim. Add:

```bash
anc T43_SHA
chk email_wrapped "$(grep -c '@crhs/web-core' server/services/email/transport.js)" 1
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```

- [ ] **Step 1: 🚨 the ordering gate and the three behaviour probes.**

```bash
cd "$AFF"
node -e '
const s = require("fs").readFileSync("server.js","utf8");
const m = s.match(/const wavemaxDomains = \[([^\]]*)\]/);
if (!m) { console.log("wavemaxDomains NOT FOUND (already removed?)"); process.exit(2); }
const entries = m[1].match(/https?:\/\/[^'\''"]+/g) || [];
const marketing = entries.filter((e) => !/portal\.atxwashdryfold\.com/.test(e));
console.log("wavemaxDomains  =", entries.join(" "));
console.log("marketing_left  =", marketing.length, marketing.join(" "));
process.exit(marketing.length === 0 ? 0 : 1)'
echo "T37_ORDERING_EXIT=$?"

for IP in 161.153.71.201 144.24.4.202; do
  V=$(ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@$IP \
        "sed -n 's/^CORS_ORIGIN=//p' /var/www/wavemax/wavemax-affiliate-program/.env | tail -1")
  printf '%s CORS_ORIGIN=[%s] len=%s\n' "$IP" "$V" "${#V}"
done

node -e '
const cfg = require("@crhs/web-core").corsConfig;
const ask = (origin) => new Promise((res) => cfg.origin(origin, (e, ok) => res(e ? "ERR" : (ok ? "ALLOW" : "DENY"))));
(async () => {
  process.env.CORS_ORIGIN = "https://portal.atxwashdryfold.com";
  console.log("credentials      =", cfg.credentials);
  console.log("portal           =", await ask("https://portal.atxwashdryfold.com"));
  console.log("marketing        =", await ask("https://rundberglaundry.com"));
  console.log("franchisor       =", await ask("https://www.wavemaxlaundry.com"));
  console.log("localhost        =", await ask("http://localhost:3000"));
  console.log("null origin      =", await ask(undefined));
  process.env.CORS_ORIGIN = "";
  console.log("empty CORS_ORIGIN -> portal =", await ask("https://portal.atxwashdryfold.com"));
})();'
```
  - Expected: `wavemaxDomains  = https://portal.atxwashdryfold.com`, `marketing_left  = 0`,
    `T37_ORDERING_EXIT=0`;
    two `CORS_ORIGIN=[https://portal.atxwashdryfold.com] len=37` lines;
    then `credentials = true`, `portal = ALLOW`, `marketing = DENY|ERR`, `franchisor = DENY|ERR`,
    `localhost = DENY|ERR`, `null origin = DENY|ERR`, and
    `empty CORS_ORIGIN -> portal = DENY|ERR`.
  - 🚨 `marketing_left` > 0 → **STOP.** Task 37 has not landed and the swap would silently revoke CORS for
    three origins in the same commit that changes the mechanism — two changes, one revert.
  - 🚨 `len=0` on a box → **STOP.** `empty CORS_ORIGIN -> portal = DENY` is the proof of what that costs:
    after the swap an empty value rejects **the portal's own pages**, whereas today it falls back to
    `localhost:3000`. This must be fixed on the box *before* Task 30's deploy, and it is an ESCALATIONS row
    either way.
  - `empty CORS_ORIGIN -> portal = ALLOW` → web-core **does** carry default origins and the trap does not
    exist; record that and adjust `.env.example`'s warning accordingly rather than shipping a false claim.
  - `wavemaxDomains NOT FOUND` (exit 2) → Task 37 removed the array entirely rather than reducing it to one
    entry. That is acceptable; record it and skip the `marketing_left` assertion, but **read** `server.js` to
    confirm no other origin list survives.

- [ ] **Step 2: extend the test, red first.** In `tests/integration/cors.test.js`, add cases mirroring Step 1's
      probes — portal admitted; `https://atxwashdryfold.com`, `https://rundberglaundry.com`,
      `https://www.wavemaxlaundry.com` and `http://localhost:3000` refused with `CORS_ORIGIN` set to the portal
      only; a **null** origin refused; and `credentials: true` present on an allowed response. The portal case
      is the control: if it is also refused, the test is measuring a broken CORS layer, not a narrowed one.

```bash
cd "$AFF" && CORS_ORIGIN=https://portal.atxwashdryfold.com npx jest tests/integration/cors.test.js 2>&1 | tail -20
```
  - Expected: the franchisor and `localhost` cases **fail** while the inline block still runs (it unions
    `CORS_ORIGIN` with `wavemaxDomains` and, more importantly, `localhost:3000` is only excluded once the
    fallback is gone); the portal case passes.
  - If **nothing** fails, the inline block is already equivalent to `corsConfig`: record that, keep the tests
    as a regression net, and drop the defect language from the commit body.

- [ ] **Step 3: swap, and account for every dropped origin.**

```bash
cd "$AFF"
# BEFORE the edit, capture the inline block's origin set from git
git show HEAD:server.js | sed -n '/const corsOptions = {/,/^app.use(cors(/p' \
  | grep -oE "https?://[a-zA-Z0-9.:-]+" | sort -u | tee /tmp/t44-origins-before.txt
# after the edit:
grep -n 'cors(webCore.corsConfig)\|cors(corsOptions)\|const corsOptions' server.js
node --check server.js && echo SYNTAX_OK
CORS_ORIGIN=https://portal.atxwashdryfold.com npx jest tests/integration/cors.test.js 2>&1 | grep -E '^Tests:|✕'
comm -23 /tmp/t44-origins-before.txt <(printf 'https://portal.atxwashdryfold.com\n')
echo "--- the lines above are the DROPPED origins; every one must be on the deliberate list ---"
```
  - Expected: one `app.use(cors(webCore.corsConfig));` line and **no** `const corsOptions` / `cors(corsOptions)`
    line; `SYNTAX_OK`; a `Tests:` line with no `✕`; and a dropped-origin list containing only
    `http://localhost:3000` (and `http://127.0.0.1:3000` if present) — the deliberate drops. Everything else
    was already removed by Task 37.
  - **Any dropped origin that is not on the deliberate list → STOP.** Naming that list in the commit body is
    the whole point of Plan 1 Task 20's executable `.env.example` contract.
  - `recput T44_DROPPED_ORIGINS "<comma-separated list>"`.

- [ ] **Step 4 (HUMAN-CONFIRM): `.env.example`.** Say exactly this:
  > `.env.example:87` changes from `CORS_ORIGIN=http://localhost:3000` to
  > `CORS_ORIGIN=https://portal.atxwashdryfold.com`, and the comment block at `:72-91` is rewritten. The
  > existing comment says *"B11 must therefore set `CORS_ORIGIN` to that union, not to either half alone"* —
  > that advice predates Task 37, which removed the union's other half, so leaving it would contradict the
  > code. The new comment states the one thing that matters operationally: after this change an **empty or
  > unset** `CORS_ORIGIN` rejects **every** origin including the portal's own pages, where today it silently
  > falls back to `localhost:3000`. Both boxes already carry
  > `CORS_ORIGIN=https://portal.atxwashdryfold.com`, and **no box `.env` is edited by this task**. Proceed?

```bash
cd "$AFF"
grep -n 'CORS_ORIGIN\|CORS_EXTRA_ORIGINS' .env.example
printf 'stale union advice = %s\n' "$(grep -ci 'union, not to either half' .env.example || true)"
printf 'localhost default  = %s\n' "$(grep -c '^CORS_ORIGIN=http://localhost:3000$' .env.example || true)"
```
  - Expected: `CORS_ORIGIN=https://portal.atxwashdryfold.com` on one line, the `CORS_EXTRA_ORIGINS` comment
    retained, `stale union advice = 0` and `localhost default = 0`.

- [ ] **Step 5: boot, full suite, commit, and record the deploy-time precondition.**

```bash
cd "$AFF"
node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK')" 2>&1 | tail -2
npx eslint server/ server.js 2>&1 | grep -E 'problems?' | tail -1
TZ=America/Chicago npx jest --runInBand 2>&1 | tail -8
recput T44_DEPLOY_PRECONDITION 'CORS_ORIGIN must be non-empty on BOTH boxes before Task 30 reloads; empty rejects every origin including the portal'
git add -A server.js .env.example tests && git commit -m "refactor(webcore): B11 -- one env-driven CORS policy

server.js's 47-line inline corsOptions becomes app.use(cors(webCore.corsConfig)).
This is a de-duplication with NO behaviour change, and that is only true because
Task 37 already reduced wavemaxDomains to the portal alone: the inline block's
effective allowlist was CORS_ORIGIN union {portal}, and CORS_ORIGIN is
https://portal.atxwashdryfold.com on both boxes. The ordering is asserted, not
assumed -- the gate parses wavemaxDomains out of server.js and halts if any
marketing origin is still there, so the mechanism change and an allowlist change
can never land in one commit (one revert, two effects).

THE TRAP, RECORDED: today an unset or empty CORS_ORIGIN falls back to
localhost:3000 at server.js:293-295. web-core's corsConfig has no default origins,
so after this change an empty value rejects EVERY origin -- including the portal's
own pages, silently, until something makes a credentialed call. Proved by probe.
.env.example's comment block is rewritten to say that instead of the pre-Task-37
advice to set CORS_ORIGIN to a 'union' whose other half no longer exists. No box
.env is edited here; both already carry the right value, and 'CORS_ORIGIN must be
non-empty before the reload' is recorded as a Task 30 precondition.

Dropped origins, named deliberately: http://localhost:3000 (and 127.0.0.1:3000).
Every other origin the inline block admitted was already removed by Task 37.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
SHA=$(git rev-parse HEAD); recput T44_SHA "$SHA"; recput T44_DONE yes; echo "T44_SHA=$SHA"
```
  - Expected: `BOOT_OK`; an ESLint total **unchanged** from Task 43's recorded value; a `Tests:` line matching
    the baseline; one commit pushed.

**Rollback (exact).**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; cd "$AFF"
WS_REC=/var/www/wavemax/cutover-logs/plan3-record.env
S=$(sed -n 's/^T44_SHA=//p' "$WS_REC" | tail -1); test -n "$S" || { echo 'STOP: no T44_SHA'; exit 1; }
git revert --no-edit "$S"
printf 'inline block back = %s\n' "$(grep -c 'const corsOptions' server.js)"
printf 'localhost fallback back = %s\n' "$(grep -c "\['http://localhost:3000'\]" server.js)"
node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK')" | tail -1
```
- Rollback expected: the revert commit; `inline block back = 1`; `localhost fallback back = 1`; `BOOT_OK`.
- **`localhost fallback back = 1` is the discriminating assertion** — it is the single line whose presence
  distinguishes the two CORS behaviours, and a partial revert can restore the block without it.
- If reverted **after Task 30 deployed**: `git pull --ff-only && pm2 reload wavemax --update-env` one box at a
  time under `BOX_BUSY`, then verify on the wire:
  `curl -sI -H 'Origin: https://portal.atxwashdryfold.com' https://portal.atxwashdryfold.com/api/health | grep -ci '^access-control-allow-origin'` → `1`.
- **Do not** "fix" a CORS regression by editing a box `.env` during a rollback; restore the previous
  `CORS_ORIGIN` line from `/var/www/wavemax/env-backups/` only, and only from a **post-purge** baseline (R-11).

---

### Task 45: [affiliate + corporate] PR B13 — shared-DB ownership: five models and two seed scripts leave the portal; the unbounded-growth gap closes

> **Execution position: Phase 4, immediately after Task 44.** **Two repos and one cron**: the corporate commit
> lands **first** (so the seed scripts exist before the affiliate deletes them), then the affiliate commit,
> then the cron (HUMAN-CONFIRM, box action).
>
> **What is actually duplicated.** [MEASURED] the affiliate carries `server/models/AccessClick.js` (18),
> `AccessGate.js` (14), `AccessRequest.js` (20), `AccessWhitelist.js` (17) and `MediatorAccess.js` (81) — and
> **`crhs-corporate/server/models/` already contains all five**, with
> `crhs-corporate/scripts/ensure-indexes.js:40` already provisioning them. The affiliate's copies have exactly
> three consumers, all of them scripts: `scripts/seed-access-gate.js` (56), `scripts/whitelist-access-ip.js`
> (55), and `scripts/ensure-indexes.js` (`MediatorAccess` only). **No controller, route or middleware touches
> any of the five.** That is the whole finding: two processes register the same five models against the same
> database, and only one of them owns the feature.
>
> **`storeIPs` — and why this task could not have run earlier.** [MEASURED] `server/config/storeIPs.js` (144)
> has **three** runtime consumers today: `server/middleware/auth.js:10`, `server/middleware/partnerLanding.js:20`
> and `server/middleware/locationQuarantine.js:26`. **Task 16** deletes `partnerLanding.js` and **Task 36**
> deletes `locationQuarantine.js`, leaving only `auth.js:10` — which ESLint reports as
> `'storeIPConfig' is assigned a value but never used` (a **dead import**: the store-IP token-renewal bypass was
> removed as a security fix, and `tests/unit/authMiddleware.test.js:419` is the *negative* test that pins its
> absence). The draft's *"`storeIPs` must show only `auth.js:10`"* is therefore an expectation that can only
> pass after those two tasks, and it is asserted as such.
>
> ✅ **`operatorIpGate` is unaffected and stays.** [MEASURED] it requires `./ipGate` (`operatorIpGate.js:20`),
> **not** `storeIPs`, and it is live in five places (`server.js:28,610,861`, `authRoutes.js:8,66`,
> `embedRoutes.js:5,20,21`). Nothing in this task touches the operator IP gate. Step 1 asserts that explicitly,
> because deleting a config file named `storeIPs` while an IP gate is live is exactly the shape that deserves a
> written negative assertion.
>
> **The growth gap this closes.** [MEASURED] `TokenBlacklist.cleanupExpired()` exists at
> `server/models/TokenBlacklist.js:66` and has **zero callers** anywhere in `server/`, `server.js` or
> `scripts/`. Nothing prunes it. web-core ships `rateLimiting.sweepExpired({ prefix, names })`, and Task 25
> exposes `APP_LIMITER_NAMES` as a **live getter**. `scripts/ops/sweep-rate-limits.js` wires the three together.
>
> ⛔ **Two things the source draft asked for are CUT, deliberately, and recorded as ESCALATIONS rows.**
>
> 1. **`--drop-orphans` does not ship in any form.** The draft offered `deleteMany({})` *or* an owner-approved
>    `drop()`. Memory `lighthouse_psi_quality_bar` is unambiguous: **never `drop()` a collection on Oracle ADB**
>    — that is the sessions incident. A destructive DB operation guarded only by a flag, on the platform where
>    the identical operation caused a documented outage, to reclaim about five empty collections, is not worth
>    the surface. This task ships an orphan **report** and no code path that deletes a collection. The deletion
>    is an ESCALATIONS row with the exact `mongosh` command an operator would run by hand.
> 2. **No models are ADDED to `scripts/ensure-indexes.js`.** The draft asked for six more (`SystemConfig`,
>    `RefreshToken`, `TokenBlacklist`, `Affiliate`, `Administrator`, `Transaction` — all six models exist).
>    [MEASURED] that script is a bare **IIFE** that `dotenv.config()`s and `mongoose.connect()`s on require,
>    then calls `createIndexes()` on every model in `MODELS` against **whatever `MONGODB_URI` names, i.e. the
>    production ADB** — and it reads `process.argv` **zero** times, so the draft's `--dry-run` writes to
>    production (**R-6**). Adding six models to it is a separate, riskier change: `createIndexes` on a
>    collection whose existing data violates a new unique index fails at provision time. This task only
>    **removes** `MediatorAccess`. The fix pattern is already written — `crhs-corporate/scripts/ensure-indexes.js`
>    exports `{ ensureIndexes, MODELS }`, takes an injectable model list, and runs only under
>    `if (require.main === module)` — and that is the ESCALATIONS row.
>
> **This task never executes `scripts/ensure-indexes.js`.** Phase 4 convention C-5 requires it, Task 35 asserts
> it mechanically, and the `MODELS` change here is verified **statically** — as text plus `node --check` plus a
> test that reads the file as a string.

**Files:**

*45a — corporate (`/mnt/c/Users/rickh/GitHub/crhs-corporate`), lands FIRST*
- Create: `scripts/seed-access-gate.js`, `scripts/whitelist-access-ip.js` — retargeted to corporate's own five
  models, `require('@crhs/web-core').logger` and `require('@crhs/web-core').encryption.hashPassword`
  ([MEASURED] web-core's `encryption` exports `hashPassword` and `verifyPassword`), and wrapped in
  `if (require.main === module)` like corporate's `ensure-indexes.js`.
- Modify: `package.json` — add `seed:access-gate` and `whitelist:ip` npm scripts.
- Create: `tests/accessGateSeedScripts.test.js` — requires both scripts and asserts they **do not connect**
  (the affiliate's IIFE defect, not repeated).

*45b — affiliate (`/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program`)*
- Delete: `server/config/storeIPs.js` (144), `tests/unit/storeIPs.test.js` (356),
  `server/models/AccessClick.js`, `AccessGate.js`, `AccessRequest.js`, `AccessWhitelist.js`,
  `MediatorAccess.js`, `scripts/seed-access-gate.js`, `scripts/whitelist-access-ip.js`.
- Modify: `server/middleware/auth.js` — delete the dead `storeIPConfig` import ([MEASURED] `:10`).
- Modify: `tests/unit/authMiddleware.test.js` — the `jest.mock('../../server/config/storeIPs', …)` at `:15-16`
  and the `require`/`mockReturnValue` pair at `:421-422`. ⚠️ A `jest.mock` of a **deleted** module throws
  `Cannot find module`, so this edit is mandatory, not cosmetic. The test at `:419` (*"should NOT renew
  operator tokens from store IP"*) **keeps its assertion** — it pins a security fix — and loses only its
  now-meaningless mock setup.
- Modify: `scripts/ensure-indexes.js` — remove the `MediatorAccess` require and its `MODELS` entry, and the
  header comment line that describes it. **Nothing is added.**
- Modify: `tests/unit/branding-guard.test.js` — drop the five `EXCLUDED_FILES` rows for the deleted models
  ([MEASURED] `server/models/{AccessGate,AccessWhitelist,AccessClick,AccessRequest,MediatorAccess}.js`).
  Task 38's new stale-entry test **fails** until this is done, which is the mechanism working.
- Create: `scripts/ops/sweep-rate-limits.js`, `deploy/cron/wavemax-sweep-rate-limits`,
  `tests/unit/sweepRateLimits.test.js`, `tests/unit/ensureIndexesModels.test.js`.
- Modify: `package.json` — add `sweep:rate-limits`.
- **Not touched:** `server/middleware/operatorIpGate.js`, `server/middleware/ipGate.js`, and every box `.env`.
  Step 6 records which `STORE_IP*` keys lose their last reader, for **Task 29**.

**Interfaces:**

*Consumes — the shared Step 0, plus:*

| # | consumed artefact | asserted by |
|:--|:--|:--|
| C45-1 | **Task 44 landed** | **Step 0** (`T44_SHA` ancestor **and** `grep -c 'cors(webCore.corsConfig)' server.js` = 1) |
| C45-2 | 🚨 **Tasks 16 and 36 landed**: `partnerLanding.js` and `locationQuarantine.js` are gone, so `storeIPs` has exactly **one** consumer and it is dead | **Step 1** (two `test ! -e`; consumer list = `server/middleware/auth.js` alone; ESLint reports `storeIPConfig` unused) |
| C45-3 | **`operatorIpGate` does not consume `storeIPs`** and is still mounted | **Step 1** (`grep -c storeIPs operatorIpGate.js` = 0, and five live mount points) |
| C45-4 | corporate already owns all five models and provisions them | **Step 1** (five `test -f` in `$CORP/server/models/`, and `MODELS` in corporate's `ensure-indexes.js` naming all five) |
| C45-5 | **45a landed before 45b** | **Step 4** (`$CORP` has both scripts, committed, and its suite is green — asserted from the affiliate side before the affiliate `git rm`) |
| C45-6 | **Task 25** exposes `APP_LIMITER_NAMES` as a live **getter**, and core exposes `sweepExpired` | shared **Step 0** |
| C45-7 | `TokenBlacklist.cleanupExpired` exists and has no caller — the gap the sweep closes | **Step 1** (`grep -c` = 1 in the model, 0 elsewhere) |

*Produces:*
- exactly **one** process registering the five gate models (corporate);
- `scripts/ops/sweep-rate-limits.js` + an hourly cron: expired rate-limit rows swept, `TokenBlacklist` and
  `RefreshToken` expiry pruned, orphan `ratelimit_*` collections **reported**;
- `server/` ESLint **−10** ([MEASURED] `storeIPs.js` 9 + one `no-unused-vars` in `auth.js`) — §1;
- record: `T45_SHA_CORP`, `T45_SHA_AFF`, `T45_DONE=yes`, `T45_ORPHAN_COLLECTIONS=<list>`,
  `T45_DEAD_ENV_KEYS=<list>`, `T45_CRON_INSTALLED_<box>`;
- three ESCALATIONS rows: the `ensure-indexes.js` IIFE/no-argv defect **with its fix**; the orphan-collection
  deletion; the six models not added.

- [ ] **Step 0: the shared Step 0**, verbatim. Add:

```bash
anc T44_SHA
chk cors_adopted "$(grep -c 'cors(webCore.corsConfig)' server.js)" 1
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```

- [ ] **Step 1: 🚨 the ownership and safety gate. Read every line of output.**

```bash
cd "$AFF"
FAIL=0
gone server/middleware/partnerLanding.js
gone server/middleware/locationQuarantine.js
printf 'storeIPs consumers      = %s\n' "$(git grep -l "config/storeIPs" -- server server.js | grep -v 'server/config/storeIPs.js' | tr '\n' ' ')"
npx eslint server/middleware/auth.js -f json 2>/dev/null | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);
const hit=r.flatMap(f=>f.messages).find(m=>/storeIPConfig/.test(m.message));
console.log('auth.js storeIPConfig unused =', hit ? 'yes (line '+hit.line+')' : 'NO');
process.exit(hit?0:1)});"
echo "DEAD_IMPORT_EXIT=${PIPESTATUS[1]}"   # index 1 = node, NOT $? after a pipe (C-4 / R-6)
printf 'operatorIpGate uses storeIPs = %s\n' "$(grep -c 'storeIPs' server/middleware/operatorIpGate.js || true)"
printf 'operatorIpGate mount points  = %s\n' "$(git grep -c 'operatorIpGate' -- server server.js | awk -F: '{s+=$2} END{print s+0}')"
for m in AccessClick AccessGate AccessRequest AccessWhitelist MediatorAccess; do
  printf '%-16s affiliate_consumers = %s\n' "$m" \
    "$(git grep -rln "models/$m" -- server server.js scripts tests | grep -v "server/models/$m" | tr '\n' ' ')"
done
printf 'cleanupExpired defined = %s | callers elsewhere = %s\n' \
  "$(grep -c 'cleanupExpired' server/models/TokenBlacklist.js)" \
  "$(git grep -l 'cleanupExpired' -- server server.js scripts | grep -v 'server/models/TokenBlacklist.js' | wc -l)"
for m in AccessClick AccessGate AccessRequest AccessWhitelist MediatorAccess; do
  printf 'corporate has %-16s %s\n' "$m" "$(test -f "$CORP/server/models/$m.js" && echo yes || echo NO)"
done
grep -n 'const MODELS' "$CORP/scripts/ensure-indexes.js"
grep -c 'process.argv' scripts/ensure-indexes.js
grep -n 'require.main' scripts/ensure-indexes.js "$CORP/scripts/ensure-indexes.js"
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected, and this is the whole safety case:
    - `OK gone server/middleware/partnerLanding.js`, `OK gone server/middleware/locationQuarantine.js`;
    - `storeIPs consumers      = server/middleware/auth.js` — **exactly one path**;
    - `auth.js storeIPConfig unused = yes (line 10)` and `DEAD_IMPORT_EXIT=0`;
    - `operatorIpGate uses storeIPs = 0` and `operatorIpGate mount points  = 8` ([MEASURED] `server.js` 3,
      `authRoutes.js` 2, `embedRoutes.js` 3) — the live operator gate is untouched by this task;
    - five `affiliate_consumers = scripts/seed-access-gate.js …` / `scripts/whitelist-access-ip.js` /
      `scripts/ensure-indexes.js` / `tests/unit/branding-guard.test.js` lines and **no** controller, route or
      middleware path among them;
    - `cleanupExpired defined = 1 | callers elsewhere = 0` — the growth gap, in one line;
    - five `corporate has <m> yes`;
    - `const MODELS = [AccessGate, AccessWhitelist, AccessClick, AccessRequest, MediatorAccess];`;
    - `0` — the affiliate script's `process.argv` count, i.e. **no flag is honoured**;
    - one `require.main` hit, in **corporate's** script only — the affiliate's is a bare IIFE.
  - 🚨 `storeIPs consumers` naming more than `auth.js` → **STOP.** C45-2 has failed and deleting the config
    breaks a live path.
  - 🚨 `operatorIpGate uses storeIPs` ≠ 0 → **STOP.** The live operator IP gate would lose its allowlist.
  - `DEAD_IMPORT_EXIT=1` → the import is **not** dead. **STOP** and read `auth.js`: either it is used (so the
    file cannot be deleted) or ESLint is misconfigured.
  - Any `corporate has … NO` → 45a must create that model too; reconcile **Files** before proceeding.
  - `callers elsewhere` > 0 → something already prunes the blacklist; record it and drop that half of the sweep.

- [ ] **Step 2 (45a): corporate first — write the two scripts, and prove they do not connect on require.**

```bash
cd "$CORP"
printf 'web-core installed = %s\n' "$(node -e "console.log(require('@crhs/web-core/package.json').version)")"
node -e "console.log('hashPassword =', typeof require('@crhs/web-core').encryption.hashPassword)"
```
  - Expected: a `0.3.x` version and `hashPassword = function`.

  Then write `scripts/seed-access-gate.js` and `scripts/whitelist-access-ip.js` against corporate's own five
  models, `wc.logger` and `wc.encryption.hashPassword`, each with its work inside a `main()` and
  `if (require.main === module) main();` — **copying corporate's `ensure-indexes.js` shape verbatim**, which is
  the pattern the affiliate's IIFE lacks. Write `tests/accessGateSeedScripts.test.js` first, asserting:
  both modules `require` cleanly with `MONGODB_URI` set to an **unroutable** value and **do not throw and do
  not connect** within 1 s; both export a callable `main`; and the seeded document shape stores only
  `salt`/`hash` (never plaintext).

```bash
cd "$CORP"
MONGODB_URI='mongodb://127.0.0.1:1/plan3-must-not-connect' npx jest tests/accessGateSeedScripts.test.js 2>&1 | tail -20
```
  - Expected **before** the scripts exist: `Cannot find module '../scripts/seed-access-gate'`.
  - Expected **after**: the suite passes, with **no connection attempt** — i.e. the test completes in well
    under the 1 s window rather than hanging on a TCP timeout to `127.0.0.1:1`.
  - ⚠️ **The unroutable `MONGODB_URI` is what makes this falsifiable.** A test that requires an IIFE script
    with a *working* URI would connect to the production ADB and still pass. Port 1 cannot accept.

```bash
cd "$CORP"
npm test 2>&1 | tail -8
node -e "const s=require('./scripts/seed-access-gate.js'); console.log('exports =', Object.keys(s).join(','));"
git add -A scripts package.json tests && git commit -m "feat(scripts): own the access-gate seed scripts (Plan 3 B13)

The four Access* models and MediatorAccess live here and are provisioned by this
repo's ensure-indexes.js, but the two scripts that seed the gate and whitelist an IP
lived in the affiliate -- so two processes registered the same five models against
the same database and only one owned the feature. The scripts move here, retargeted
to these models and to @crhs/web-core's logger and encryption.hashPassword
(plaintext is still never persisted).

Both are wrapped in 'if (require.main === module)' like ensure-indexes.js, and the
new test requires them with an unroutable MONGODB_URI to prove they do NOT connect
at require time -- the defect the affiliate's copies had, where requiring the module
dialled the production ADB.

Lands BEFORE the affiliate deletes its copies, so no window exists in which neither
repo owns them.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
CORP_SHA=$(git rev-parse HEAD); recput T45_SHA_CORP "$CORP_SHA"; echo "T45_SHA_CORP=$CORP_SHA"
```
  - Expected: corporate `Tests: … 0 failed` with `ensure-indexes.test.js` still asserting **≥ 5** models;
    `exports = main` (or `main,seed`); one commit pushed.

- [ ] **Step 3 (45b): write the affiliate's failing guards.**
      `tests/unit/sweepRateLimits.test.js` — `sweepExpired` is called with the **live** `APP_LIMITER_NAMES`
      getter (mutate the limiter set after require and observe the new name reach the call; a snapshot fails
      this); the `TokenBlacklist` and `RefreshToken` purges run; **there is no code path that deletes or drops a
      collection** — asserted by a source grep for `\.drop\(` and `dropCollection` returning 0, and by the
      orphan report being read-only.
      `tests/unit/ensureIndexesModels.test.js` — reads `scripts/ensure-indexes.js` **as text** and asserts:
      it names none of the five gate models; its `MODELS` array has the expected members; the header comment
      does not describe `MediatorAccess`; and — the one that matters — **the file is never `require`d by this
      suite** (the test asserts on a string, so the production ADB is never dialled).

```bash
cd "$AFF" && npx jest tests/unit/sweepRateLimits.test.js tests/unit/ensureIndexesModels.test.js 2>&1 | tail -20
```
  - Expected: `Cannot find module '../../scripts/ops/sweep-rate-limits'` and, from the second suite, a failure
    naming `MediatorAccess` as still present in `scripts/ensure-indexes.js`.

- [ ] **Step 4: 45a is on disk and green before a single affiliate deletion.**

```bash
cd "$AFF"
CORP_SHA=$(recget T45_SHA_CORP); test -n "$CORP_SHA" || { echo 'STOP: 45a not recorded'; exit 1; }
( cd "$CORP" && git merge-base --is-ancestor "$CORP_SHA" HEAD && echo CORP_45A_LANDED=yes )
for f in scripts/seed-access-gate.js scripts/whitelist-access-ip.js; do
  printf 'corporate %-34s %s\n' "$f" "$(test -f "$CORP/$f" && echo present || echo MISSING)"
done
( cd "$CORP" && git status --porcelain | wc -l )
```
  - Expected: `CORP_45A_LANDED=yes`; both files `present`; `0` uncommitted files in corporate.
  - **Any `MISSING` → STOP.** Deleting the affiliate's copies now would leave no repo owning them, which is
    the exact window the corporate-first ordering exists to prevent.

- [ ] **Step 5: delete, implement the sweep, and verify the `MODELS` change STATICALLY.**

```bash
cd "$AFF"
git rm -q server/config/storeIPs.js tests/unit/storeIPs.test.js \
          server/models/AccessClick.js server/models/AccessGate.js \
          server/models/AccessRequest.js server/models/AccessWhitelist.js \
          server/models/MediatorAccess.js \
          scripts/seed-access-gate.js scripts/whitelist-access-ip.js
```
  Then hand-edit `server/middleware/auth.js` (drop `:10`), `tests/unit/authMiddleware.test.js` (the
  `jest.mock` at `:15-16` and the `require`/`mockReturnValue` at `:421-422` — **keep the assertion**),
  `scripts/ensure-indexes.js` (the `MediatorAccess` require, its `MODELS` entry, and its header comment line),
  `tests/unit/branding-guard.test.js` (the five `EXCLUDED_FILES` rows), and write
  `scripts/ops/sweep-rate-limits.js` + `deploy/cron/wavemax-sweep-rate-limits`.

```bash
cd "$AFF"
# --- STATIC verification of ensure-indexes.js. The script is NEVER executed (C-5, R-6). ---
node -e '
const src = require("fs").readFileSync("scripts/ensure-indexes.js", "utf8");
const gate = ["AccessClick","AccessGate","AccessRequest","AccessWhitelist","MediatorAccess"];
console.log("gate models named  =", gate.filter((m) => src.includes(m)).join(",") || "none");
const m = src.match(/const MODELS = \[([^\]]*)\]/);
console.log("MODELS             =", m ? m[1].replace(/\s+/g, " ").trim() : "NOT FOUND");
console.log("argv reads          =", (src.match(/process\.argv/g) || []).length);
console.log("connects on require =", !/require\.main\s*===\s*module/.test(src));
process.exit(gate.some((x) => src.includes(x)) ? 1 : 0)'
echo "ENSURE_INDEXES_EXIT=$?"
node --check scripts/ensure-indexes.js && echo ENSURE_INDEXES_SYNTAX_OK
printf 'sweep has drop() = %s\n' "$(grep -cE '\.drop\(|dropCollection' scripts/ops/sweep-rate-limits.js || true)"
printf 'storeIPs refs    = %s\n' "$(git grep -c 'storeIPs' -- server server.js tests scripts | wc -l)"
printf 'cron content:\n'; cat deploy/cron/wavemax-sweep-rate-limits
node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK')" 2>&1 | tail -2
```
  - Expected: `gate models named  = none`; a `MODELS = Bag, Order, Operator, AffiliateInvite, Customer, AddOn`
    line (six entries — `MediatorAccess` removed, **nothing added**); `argv reads          = 0`;
    `connects on require = true`; `ENSURE_INDEXES_EXIT=0`; `ENSURE_INDEXES_SYNTAX_OK`;
    `sweep has drop() = 0`; `storeIPs refs    = 0`; the cron file printed
    (`5 * * * * ubuntu cd /var/www/wavemax/wavemax-affiliate-program && /usr/bin/node scripts/ops/sweep-rate-limits.js >> /var/log/wavemax-sweep.log 2>&1`);
    then `BOOT_OK`.
  - ⚠️ `argv reads = 0` and `connects on require = true` are recorded as **evidence for the ESCALATIONS row**,
    not as a failure of this task — this task does not fix the script's shape, it only shortens its model list.
    Adding six models to a script in that shape is what was cut.
  - `sweep has drop() ≠ 0` → **STOP.** The one thing this task must never ship (Oracle ADB, the sessions
    incident).
  - `MODELS = NOT FOUND` → the array was renamed; re-read the file before trusting the edit.

- [ ] **Step 6: green, record the newly-dead env keys and the orphan report, then commit.**

```bash
cd "$AFF"
npx jest tests/unit/sweepRateLimits.test.js tests/unit/ensureIndexesModels.test.js \
         tests/unit/authMiddleware.test.js tests/unit/branding-guard.test.js \
         tests/unit/i18n-brand-token.test.js 2>&1 | grep -E '^(Tests:|Test Suites:)|✕'
npx madge --circular server/ 2>&1 | tail -2
npx eslint server/ server.js 2>&1 | grep -E 'problems?' | tail -1
# which STORE_IP* keys lose their last reader -> Task 29
for K in STORE_IP_ADDRESS ADDITIONAL_STORE_IPS STORE_IP_RANGES OPERATOR_ALLOWLIST ADMIN_ALLOWLIST; do
  printf '%-22s readers_left=%s\n' "$K" "$(git grep -l "$K" -- server server.js scripts | tr '\n' ' ')"
done
# orphan report, READ-ONLY, from the sweep script's own report mode
node scripts/ops/sweep-rate-limits.js --report 2>&1 | tail -20
```
  - Expected: a `Tests:` line with no `✕` across the five suites — **`branding-guard.test.js` passing is the
    proof that the five `EXCLUDED_FILES` rows were pruned**, because Task 38's stale-entry test fails on any
    row naming a deleted path; `✔ No circular dependency found!`; an ESLint total exactly **10 lower** than
    Task 44's recorded value; a per-key reader list; then a report naming any `ratelimit_*` collection absent
    from `APP_LIMITER_NAMES`.
  - `readers_left=` **empty** for a key → that key is newly dead: `recput T45_DEAD_ENV_KEYS "<list>"` for
    **Task 29**. `OPERATOR_ALLOWLIST` and `ADMIN_ALLOWLIST` are expected to keep readers
    (`operatorIpGate`/`ipGate`); if either shows empty, **STOP and report** — that would mean an IP gate lost
    its configuration source, which is a security regression, not a cleanup.
  - `recput T45_ORPHAN_COLLECTIONS "<comma list>"`. **The report deletes nothing.** The ESCALATIONS row
    carries the by-hand command:
    `db.getCollection('ratelimit_<orphan>').deleteMany({})` — never `.drop()`.
  - ⚠️ `--report` must be **grepped for in the script** before being trusted (C-5 / R-6 — this is the very
    defect class this task documents):
    `grep -c "'--report'" scripts/ops/sweep-rate-limits.js` → must be ≥ 1, and the script must read
    `process.argv`. If it does not, the "report" ran the **default** path.

```bash
cd "$AFF"
printf 'report flag honoured = %s | argv reads = %s\n' \
  "$(grep -c -- "--report" scripts/ops/sweep-rate-limits.js)" \
  "$(grep -c 'process.argv' scripts/ops/sweep-rate-limits.js)"
TZ=America/Chicago npx jest --runInBand 2>&1 | tail -8
git add -A server server.js scripts tests deploy package.json
git commit -m "refactor: shared-DB ownership -- five gate models and two seed scripts leave the portal

crhs-corporate already owns AccessClick/AccessGate/AccessRequest/AccessWhitelist
and MediatorAccess and already provisions them in its own ensure-indexes.js, yet the
affiliate carried duplicate copies -- two processes registering the same five models
against the same database, one of which does not own the feature. Their only
affiliate consumers were three scripts; no controller, route or middleware touched
any of them. The two seed scripts landed in corporate FIRST (previous commit), so no
window existed in which neither repo owned them.

server/config/storeIPs.js goes with them. It had three runtime consumers until Task
16 deleted partnerLanding and Task 36 deleted locationQuarantine; the last one,
auth.js:10, is a dead import ESLint has been reporting -- the store-IP token-renewal
bypass was removed as a security fix, and authMiddleware.test.js:419 is the negative
test that pins its absence. That assertion is kept; only its now-meaningless mock
setup goes (a jest.mock of a deleted module throws). operatorIpGate is UNAFFECTED:
it requires ./ipGate, not storeIPs, and stays mounted in all eight places.

Closes a real unbounded-growth gap: TokenBlacklist.cleanupExpired() has existed with
ZERO callers, and nothing swept expired rate-limit rows. scripts/ops/
sweep-rate-limits.js wires core's sweepExpired to Task 25's live APP_LIMITER_NAMES
getter and prunes the token collections hourly.

TWO THINGS DELIBERATELY CUT, both escalated with their fixes:
- No --drop-orphans, in any form. Never drop() a collection on Oracle ADB (the
  sessions incident). The script REPORTS orphan ratelimit_* collections and has no
  code path that deletes one; a source grep for .drop(/dropCollection asserts it.
- No models ADDED to scripts/ensure-indexes.js. That script is a bare IIFE which
  connects on require and reads process.argv ZERO times -- so the '--dry-run' the
  draft relied on would have written to the production ADB. Only MediatorAccess is
  removed, verified STATICALLY (the script is never executed by this task or its
  tests). The fix pattern is corporate's own ensure-indexes.js: exported
  { ensureIndexes, MODELS }, injectable model list, if (require.main === module).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
SHA=$(git rev-parse HEAD); recput T45_SHA_AFF "$SHA"; recput T45_DONE yes; echo "T45_SHA_AFF=$SHA"
```
  - Expected: `report flag honoured = <≥1> | argv reads = <≥1>`; a `Tests:` line matching the baseline; one
    commit pushed.

- [ ] **Step 7 (HUMAN-CONFIRM, box action): install the cron, one box at a time.** Say exactly this:
  > This installs `/etc/cron.d/wavemax-sweep-rate-limits` on one box (hourly, at :05). It runs
  > `scripts/ops/sweep-rate-limits.js`, which deletes **expired rows** from the `ratelimit_*` collections and
  > from `TokenBlacklist`/`RefreshToken`. It does **not** drop or empty any collection, and it has no code path
  > that could — that is asserted by a source grep in the commit. The script must already be on the box, so
  > this runs **after Task 30's `git pull`**. It is idempotent, so both boxes may run it. Blast radius if it
  > misbehaves: expired rate-limit rows are removed early, which relaxes a limit; nothing user-visible.
  > Install on `oci1`?

```bash
BOX=oci1; IP=161.153.71.201          # pass 2: BOX=oci2; IP=144.24.4.202
WS_REC=/var/www/wavemax/cutover-logs/plan3-record.env
BUSY=$(ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@$IP "sed -n 's/^BOX_BUSY=//p' $WS_REC | tail -1")
test -z "$BUSY" || { echo "STOP: BOX_BUSY=$BUSY"; exit 1; }
trap 'ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@'"$IP"' "printf '"'"'BOX_BUSY=\n'"'"' >> '"$WS_REC"'"' EXIT INT TERM
ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@$IP "printf 'BOX_BUSY=%s\n' $BOX >> $WS_REC"
ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
  cd /var/www/wavemax/wavemax-affiliate-program
  test -f scripts/ops/sweep-rate-limits.js && echo SCRIPT_PRESENT
  node scripts/ops/sweep-rate-limits.js --report | tail -10
  sudo install -m 644 deploy/cron/wavemax-sweep-rate-limits /etc/cron.d/wavemax-sweep-rate-limits
  sudo cat /etc/cron.d/wavemax-sweep-rate-limits
  sudo systemctl status cron --no-pager | head -3"
```
  - Expected: `SCRIPT_PRESENT`; a report listing zero or more orphan collections **and deleting nothing**;
    the installed cron file echoed back byte-identical to the repo copy; `Active: active (running)` for cron.
  - **Run `--report` BEFORE installing** (C-6: verify and act are different steps). A `--report` that errors is
    a cron that will error hourly into a log nobody reads.
  - `recput "T45_CRON_INSTALLED_$BOX" yes`, then let the `trap` clear `BOX_BUSY`. **Never both boxes in one
    window.**

**Rollback (exact; reverse order — affiliate first, then corporate, then the cron).**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; CORP=/mnt/c/Users/rickh/GitHub/crhs-corporate
WS_REC=/var/www/wavemax/cutover-logs/plan3-record.env
A=$(sed -n 's/^T45_SHA_AFF=//p' "$WS_REC" | tail -1); C=$(sed -n 's/^T45_SHA_CORP=//p' "$WS_REC" | tail -1)
test -n "$A" -a -n "$C" || { echo 'STOP: missing T45 shas'; exit 1; }
cd "$AFF" && git revert --no-edit "$A"
ls server/config/storeIPs.js server/models/MediatorAccess.js
grep -c 'MediatorAccess' scripts/ensure-indexes.js
node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK')" | tail -1
npx jest tests/unit/authMiddleware.test.js tests/unit/branding-guard.test.js 2>&1 | grep -E '^Tests:'
cd "$CORP" && git revert --no-edit "$C" && npm test 2>&1 | tail -6
for IP in 161.153.71.201 144.24.4.202; do
  ssh -o ConnectTimeout=15 -i ~/.ssh/oci_wavemax ubuntu@$IP 'sudo rm -f /etc/cron.d/wavemax-sweep-rate-limits; ls /etc/cron.d/ | grep -c wavemax-sweep; true'
done
```
- Rollback expected: the affiliate revert; both paths listed; a non-zero `MediatorAccess` count in
  `ensure-indexes.js`; `BOOT_OK`; a `Tests:` line with no failures; then corporate's revert and green suite;
  then `0` from each box's `/etc/cron.d`.
- **Revert the affiliate FIRST, then corporate** — the reverse of the landing order — so no window exists in
  which neither repo owns the seed scripts.
- ⚠️ `grep -c 'MediatorAccess' scripts/ensure-indexes.js` returning **0** after the revert means the revert was
  partial: `git checkout "$A"~1 -- server/ scripts/ tests/ package.json`. **No data is touched by either
  revert** — the sweep only ever deleted expired rows, and no collection was ever dropped.
- The cron removal is safe and independent; removing it stops the sweep and restores the (pre-existing)
  unbounded growth, which is a documented regression, not a failure.

---

### Task 46: [affiliate] PR B14 — remove all shims; call sites import `@crhs/web-core` directly

> **Execution position: Phase 4, immediately after Task 45 and immediately BEFORE Task 26.** Repo-only.
>
> ⚠️ **CONTROLLER NOTE — read before scheduling this task.** This is the largest single diff in Plan 3, and the
> only one in this series whose benefit is a **spec criterion rather than a behaviour**. Measured scope:
> **14 shim files deleted**, **~101 `server/`+`server.js` files repointed** (`logger` alone is required in
> **43** files; `auditLogger` 17, `encryption` 13, `controllerHelpers` 13, `clientIp` 4, `ipGate` 3,
> `geocodingService` 2, `sanitization` 2, and one each for `validateSecrets`, `cspNonce`, `errorHandler`,
> `mongoCursorRetry`, `mongoOracleDiagnostics`, `rateLimitMongoStore`), and **41 test mock sites rewritten**
> (16 `jest.mock` + 2 `requireActual` for `auditLogger`, 7 `encryption`, 6 `controllerHelpers`, 4 `jest.mock` +
> 7 `jest.doMock` for `logger`, 2 + 2 `requireActual` for `geocodingService`) — on a repo whose suite the
> project memory records as *not reliably 0-fail*.
>
> What it buys: spec §7.7 criterion 1, *"zero 5-line shims remain."* What the shims cost today: nothing at
> runtime, **zero** ESLint errors, ~14 lines. What they buy: every call site and every mock site keeps working
> untouched, and `require('../utils/logger')` is a **swappable seam** while
> `require('@crhs/web-core').logger` is not. And 41 direct `jest.mock('@crhs/web-core', …)` sites are 41
> opportunities to write the one thing `src/index.js`'s own header forbids.
>
> **The recommendation in the final report is that this task be converted to a documented decision** — the
> shims stay as the permanent seam, `tasks/todo.md` records why, and Task 35 closes it as a deliberate
> non-goal rather than an open item. *"A clean backlog"* can legitimately mean a written decision not to do
> something. **The task is written in full here so the owner is choosing between two specified options, not
> between doing it and forgetting it.** If it is dropped, §1's arithmetic is unaffected (the shims carry 0
> ESLint errors) and Task 26 may follow Task 45 directly.
>
> ⛔ **`src/index.js` forbids spreading, and this is the one hazard that can take production down.** Its header
> says, verbatim: *"Getters are enumerable so `Object.keys()` lists them (`Object.keys` does NOT invoke a
> getter) — but a spread (`{...core}`) or `Object.assign` WOULD load every module. Do not spread this object."*
> The DB-touching props (`SystemConfig`, `rateLimiting`, `rateLimitMongoStore`, `mongoOracleDiagnostics`,
> `mongoCursorRetry`, `buildSessionMiddleware`) must never load unless accessed, because eager-loading them
> stands up a **second mongoose footprint** per PM2 worker and tipped the PGA-constrained Oracle ADB over
> `PGA_AGGREGATE_LIMIT` — the **ORA-04036 startup crash-loop of 2026-08-27**. A test writing
> `jest.mock('@crhs/web-core', () => ({ ...jest.requireActual('@crhs/web-core'), logger: fake }))` reproduces
> that shape exactly. `tests/helpers/mockWebCore.js` exists to make the safe form the easy form, and Step 1
> proves the Proxy preserves laziness **and** that a spread does not.
>
> ⚠️ **`server/services/geocodingService.js` is a shim, and geocoding is a live gate.** The bag-claim
> registration radius gate (memory `geo_radius_gate_2026-06-22`) calls it; it is default-off and fail-open, but
> repointing it is a live path, not a utility.
>
> **The composition modules stay.** [MEASURED] after tasks 39–45 the `server/` files naming `@crhs/web-core`
> that are **not** 1-statement shims are: `server/models/SystemConfig.js` (Task 41),
> `server/middleware/rateLimiting.js` (Task 25), `server/config/csrf-config.js` (2 statements),
> `server/config/csrfTables.js` (85), `server/utils/cspHelper.js` (30),
> `server/services/email/transport.js` and `…/template-manager.js` (Task 43) — **seven**, exactly the spec's
> list. Those are compositions, not re-exports, and Step 4 asserts the distinction by statement count.

**Files:**
- Delete (**14 shims**): `server/middleware/{sanitization,errorHandler,cspNonce,ipGate,rateLimitMongoStore}.js`,
  `server/utils/{mongoCursorRetry,mongoOracleDiagnostics,auditLogger,clientIp,controllerHelpers,encryption,logger,validateSecrets}.js`,
  `server/services/geocodingService.js`.
- Delete: `tests/unit/logger.test.js` (39, duplicate — note its env-reload at `:5`).
- Modify: every call site (**~101 files**) to `require('@crhs/web-core')` directly.
- Create: `tests/helpers/mockWebCore.js`, `tests/unit/mockWebCoreHelper.test.js`.
- Modify: the **41** mock sites.
- Create: `tests/unit/noShimsRemain.test.js`.

**Interfaces:**

*Consumes — the shared Step 0, plus:*

| # | consumed artefact | asserted by |
|:--|:--|:--|
| C46-1 | **Task 45 landed** | **Step 0** (`T45_SHA_AFF` ancestor **and** `test ! -e server/config/storeIPs.js`) |
| C46-2 | all 14 shims exist and are each **exactly 1 statement** — the set this task deletes is derived, never typed | **Step 0** (statement-count scan; list printed and counted) |
| C46-3 | ⛔ web-core's index is **lazy**, and a spread breaks that laziness | **Step 1** (`Object.keys` touches nothing; a spread loads every module — both measured) |
| C46-4 | the mock-site inventory is complete before any edit | **Step 2** (per-module counts, summed and recorded) |
| C46-5 | the suite is at the honest baseline (Task 38) — this is the task most likely to surface a flaky suite | **shared Step 0** + **Step 5** (full suite compared to `T38_FULL_SUITE_BASELINE`) |

*Produces:*
- spec §7.7 criterion 1: the only `server/` modules naming `@crhs/web-core` are the **seven** composition
  modules; **zero** 1-statement shims;
- spec §7.7 criterion 2: all 12 duplicate suites gone, `tests/unit/brand-config.test.js` (53, app-owned) kept;
- `tests/helpers/mockWebCore.js` — the Proxy helper, with its own test proving laziness is preserved;
- `tests/unit/noShimsRemain.test.js`;
- **0** ESLint change ([MEASURED] the 14 shims carry no errors) — but the *file set* Task 26 lints shrinks by
  14, which is why Task 26 must run after this (§1);
- record: `T46_SHA`, `T46_DONE=yes`, `T46_CALLSITES_REPOINTED`, `T46_MOCKS_REWRITTEN`, `ADOPTION_DONE=yes`.
- **Does NOT produce:** removal of `--forceExit`. That is ESCALATIONS **row 13** and stays with the owner.

- [ ] **Step 0: the shared Step 0**, verbatim. Add:

```bash
cd "$AFF"
anc T45_SHA_AFF
gone server/config/storeIPs.js
printf 'web-core consumers in server/ (statements  path):\n'
for f in $(grep -rl '@crhs/web-core' server/ | sort); do
  n=$(grep -vc '^\s*\(//.*\)\?$' "$f"); printf '  %4d  %s\n' "$n" "$f"
done | sort -n
SHIMS=$(for f in $(grep -rl '@crhs/web-core' server/); do \
  [ "$(grep -vc '^\s*\(//.*\)\?$' "$f")" = 1 ] && echo "$f"; done | sort)
printf 'shims (1 statement) = %s\n' "$(echo "$SHIMS" | wc -l)"
echo "$SHIMS" | sed 's/^/  /'
chk shim_count "$(echo "$SHIMS" | wc -l)" 14
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: `OK T45_SHA_AFF ancestor`, `OK gone server/config/storeIPs.js`; a statement-count table whose
    first **14** rows read `1 <path>` and whose remaining **seven** rows are the composition modules
    (`server/config/csrf-config.js` 2, `server/utils/cspHelper.js` 30, `server/config/csrfTables.js` 85, plus
    `SystemConfig.js`, `rateLimiting.js`, `email/transport.js`, `email/template-manager.js`);
    `shims (1 statement) = 14` with the 14 paths listed; `OK shim_count=14`; `gate=PASS`.
  - **The deletion set is `$SHIMS`, derived here.** Do not type a path list from this document; if
    `shim_count` ≠ 14, record the real number, use the derived list, and say so in the commit body.
  - A composition module appearing in `$SHIMS` (statement count 1) means an earlier task turned it into a
    re-export: **STOP** — it is in the spec's keep list for a reason.

- [ ] **Step 1: ⛔ prove the Proxy preserves laziness and a spread destroys it. Write the helper first.**
      Create `tests/helpers/mockWebCore.js`:

```js
// Preserves laziness. A spread ({...jest.requireActual('@crhs/web-core')}) would
// invoke every enumerable getter in src/index.js and load every module -- including
// SystemConfig, rateLimiting, rateLimitMongoStore, mongoOracleDiagnostics,
// mongoCursorRetry and buildSessionMiddleware, which stand up a second mongoose
// footprint per worker. That is the eager-load shape behind the ORA-04036 startup
// crash-loop of 2026-08-27, and src/index.js's own header forbids it in writing.
// NEVER replace this with a spread.
module.exports.mockWebCoreKey = (key, impl) => jest.mock('@crhs/web-core', () =>
  new Proxy(jest.requireActual('@crhs/web-core'), {
    get: (t, k) => (k === key ? impl : t[k])
  }));
```
      and `tests/unit/mockWebCoreHelper.test.js`, which must assert **both** directions:

```js
// The DB-touching keys, from src/index.js's header.
const DB_KEYS = ['SystemConfig', 'rateLimiting', 'rateLimitMongoStore',
                 'mongoOracleDiagnostics', 'mongoCursorRetry', 'buildSessionMiddleware'];
const loadedModules = () => Object.keys(require.cache).filter((p) => p.includes('@crhs/web-core/src'));

it('Object.keys does not invoke a getter (the lazy-surface premise)', () => {
  const before = loadedModules().length;
  Object.keys(require('@crhs/web-core'));
  expect(loadedModules().length).toBe(before);
});

it('reading ONE key does not load the DB-touching modules', () => {
  const wc = require('@crhs/web-core');
  void wc.auditLogger;
  const loaded = loadedModules().join('|');
  for (const k of DB_KEYS) expect(loaded).not.toContain(`/${k}`);
});

it('POSITIVE CONTROL: a spread DOES load them — this is the forbidden shape', () => {
  jest.resetModules();
  const before = loadedModules().length;
  // eslint-disable-next-line no-unused-vars
  const spread = { ...require('@crhs/web-core') };
  expect(loadedModules().length).toBeGreaterThan(before);
});
```
```bash
cd "$AFF" && npx jest tests/unit/mockWebCoreHelper.test.js 2>&1 | tail -25
```
  - Expected **before** the helper exists: `Cannot find module '../helpers/mockWebCore'`.
  - Expected **after**: all three pass. The third is the load-bearing one: **`toBeGreaterThan(before)` must
    actually be satisfied**, i.e. a spread really does load modules a single-key read does not. If it prints
    "equal", the lazy surface is not lazy in this jest environment and the Proxy buys nothing — **STOP** and
    re-read `src/index.js`, because the whole safety argument for 41 direct-mock sites rests on this.
  - Paste the third test's output into the PR body; it is the ORA-04036 guard in one assertion.

- [ ] **Step 2: inventory the call sites and mock sites before touching anything.**

```bash
cd "$AFF"
printf '%-26s %-8s %-8s %-10s %s\n' MODULE mock doMock reqActual server_callsites
for m in auditLogger encryption controllerHelpers logger geocodingService clientIp validateSecrets \
         cspNonce ipGate sanitization errorHandler mongoCursorRetry mongoOracleDiagnostics rateLimitMongoStore; do
  printf '%-26s %-8s %-8s %-10s %s\n' "$m" \
    "$(git grep -c "jest.mock(.*$m"        -- tests | awk -F: '{s+=$2} END{print s+0}')" \
    "$(git grep -c "jest.doMock(.*$m"      -- tests | awk -F: '{s+=$2} END{print s+0}')" \
    "$(git grep -c "requireActual(.*$m"    -- tests | awk -F: '{s+=$2} END{print s+0}')" \
    "$(git grep -l "require(.*[/']$m'"     -- server server.js | grep -v "server/.*/$m\.js" | wc -l)"
done
git grep -l -E "require\(['\"]\.\.?/.*(utils|middleware|services)/(sanitization|errorHandler|cspNonce|ipGate|rateLimitMongoStore|mongoCursorRetry|mongoOracleDiagnostics|auditLogger|clientIp|controllerHelpers|encryption|logger|validateSecrets|geocodingService)['\"]\)" \
  -- server server.js | sort > /tmp/t46-callsites.txt
wc -l < /tmp/t46-callsites.txt
```
  - Expected, **[MEASURED] today**: `logger` `mock=4 doMock=7 callsites=43`; `auditLogger` `mock=16 reqActual=2
    callsites=17`; `encryption` `mock=7 callsites=13`; `controllerHelpers` `mock=6 callsites=13`;
    `geocodingService` `mock=2 reqActual=2 callsites=2`; `clientIp` `callsites=4`; `ipGate` `callsites=3`;
    `sanitization` `callsites=2`; and 1 each for the rest — **41 mock/doMock/requireActual sites and ~101
    files**.
  - `recput T46_CALLSITES_REPOINTED "$(wc -l < /tmp/t46-callsites.txt)"` and
    `recput T46_MOCKS_REWRITTEN "<sum of the three mock columns>"`. These are the numbers the commit body
    quotes, and the numbers a reviewer checks the diff against.
  - ⚠️ If `logger`'s `callsites` is materially different from 43, **re-scope before starting.** A ~101-file
    mechanical edit whose size was misjudged is how a "one commit" task becomes an unreviewable one.

- [ ] **Step 3: write the terminus guard, red.** Create `tests/unit/noShimsRemain.test.js` asserting:
      each of the 14 paths does **not** exist; every `server/` file naming `@crhs/web-core` has **more than one
      statement** (the acceptance grep, as a test); the seven composition modules **do** exist and each names
      `@crhs/web-core`; no file under `tests/` contains `...jest.requireActual('@crhs/web-core')` or
      `Object.assign({}, require('@crhs/web-core')` — the forbidden spread, banned by a test, not a comment;
      and `POST`-booting the app under `supertest` still answers `/health` **200** (the boot proof).

```bash
cd "$AFF" && npx jest tests/unit/noShimsRemain.test.js 2>&1 | tail -25
```
  - Expected: 14 existence cases failing with `Expected: false / Received: true`, and the statement-count case
    failing with the 14 shim paths listed. The `/health` case **passes** (it is a regression net).

- [ ] **Step 4: delete the shims, repoint every call site, rewrite every mock, then run the acceptance greps.**

```bash
cd "$AFF"
git rm -q $(cat /tmp/t46-shims.txt)      # the derived $SHIMS list from Step 0, written to a file
git rm -q tests/unit/logger.test.js
# after repointing all ~101 call sites and all 41 mock sites:
printf 'web-core consumers in server/ (statements  path):\n'
for f in $(grep -rl '@crhs/web-core' server/ | sort); do
  n=$(grep -vc '^\s*\(//.*\)\?$' "$f"); printf '  %4d  %s\n' "$n" "$f"
done | sort -n
printf 'one-statement files remaining = %s\n' \
  "$(for f in $(grep -rl '@crhs/web-core' server/); do [ "$(grep -vc '^\s*\(//.*\)\?$' "$f")" = 1 ] && echo "$f"; done | wc -l)"
printf 'forbidden spreads = %s\n' \
  "$(git grep -c -E "\.\.\.\s*jest\.requireActual\(['\"]@crhs/web-core|Object\.assign\(\{\}\s*,\s*require\(['\"]@crhs/web-core" -- tests | wc -l)"
printf 'stale relative requires = %s\n' \
  "$(git grep -c -E "require\(['\"]\.\.?/.*(utils|middleware|services)/(sanitization|errorHandler|cspNonce|ipGate|rateLimitMongoStore|mongoCursorRetry|mongoOracleDiagnostics|auditLogger|clientIp|controllerHelpers|encryption|logger|validateSecrets|geocodingService)['\"]\)" -- server server.js tests | wc -l)"
node --check server.js && echo SYNTAX_OK
node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK')" 2>&1 | tail -2
PORT=3099 NODE_ENV=production node -e '
process.on("uncaughtException",(e)=>{console.log("BOOT_FAIL "+e.message);process.exit(1);});
process.on("unhandledRejection",(e)=>{console.log("BOOT_FAIL "+e);process.exit(1);});
require("./server.js"); setTimeout(()=>{console.log("PROD_BOOT_OK");process.exit(0);},2500);'
```
  - Expected: a statement table with **exactly seven rows**, each `> 1`, naming the seven composition modules;
    `one-statement files remaining = 0`; `forbidden spreads = 0`; `stale relative requires = 0`;
    `SYNTAX_OK`; `BOOT_OK`; `PROD_BOOT_OK`.
  - **`one-statement files remaining = 0` is spec §7.7 criterion 1 in one number.**
  - 🚨 `forbidden spreads` ≠ 0 → **STOP.** That is the ORA-04036 eager-load shape, in a test file, on a repo
    that runs in PM2 cluster mode against a PGA-constrained ADB. Convert it to `mockWebCoreKey`.
  - `stale relative requires` ≠ 0 → a call site still points at a deleted path; the app may still boot if the
    file is not on the boot path, so **the grep, not the boot probe, is the gate here**.
  - `PROD_BOOT_OK` is required in addition to `BOOT_OK`: `NODE_ENV=test` short-circuits enough of `server.js`
    that a test boot does not exercise the session/DB paths this deletion touches.

- [ ] **Step 5: §7.7 criteria 1 and 2, the size rules, and the full suite.**

```bash
cd "$AFF"
# §7.7 criterion 1 — no file exists twice in both repos.
# Counted, not inferred from an exit status: `$?` after a for-loop is the last
# iteration's status and would be 0 whether or not a duplicate was printed (R-9).
DUP=0
for f in $(cd server && find . -name '*.js'); do
  c="$WC/src/${f#./}"
  if [ -f "$c" ] && diff -q "server/$f" "$c" >/dev/null 2>&1; then echo "IDENTICAL server/$f"; DUP=$((DUP+1)); fi
done
echo "DUPLICATE_FILES=$DUP"
# §7.7 criterion 2 — the 12 duplicate suites are gone, brand-config.test.js is kept
for s in systemConfig rateLimitMongoStore rateLimitKeyGen rateLimitingMiddleware sanitization errorHandler \
         auditLogger storeIPs mongoCursorRetry mongoOracleDiagnostics logger emailTransport; do
  printf '%-26s %s\n' "$s" "$(test -e "tests/unit/$s.test.js" && echo STILL_PRESENT || echo gone)"
done
wc -l tests/unit/brand-config.test.js
npx madge --circular server/ 2>&1 | tail -2
find server -name '*.js' -exec wc -l {} + | sort -rn | sed -n '2,6p'
find server/controllers -name '*.js' -exec wc -l {} + | sort -rn | sed -n '2,4p'
npx eslint server/ server.js 2>&1 | grep -E 'problems?' | tail -1
TZ=America/Chicago npx jest --runInBand 2>&1 | tee /tmp/t46-full.txt | tail -10
grep -cE '^FAIL ' /tmp/t46-full.txt; true
```
  - Expected: **no `IDENTICAL` line** and `DUPLICATE_FILES=0` (any `IDENTICAL` line is a file that exists twice
    — the exact condition this series exists to remove); **twelve `gone` lines**; `53 tests/unit/brand-config.test.js` (app-owned, kept);
    `✔ No circular dependency found!`; **nothing in `server/` over 800 lines**; an ESLint total **unchanged**
    from Task 45's recorded value; a `Tests:` line matching `T38_FULL_SUITE_BASELINE`; and `0` failing suites.
  - ⚠️ **`server/controllers/administratorController.js` is [MEASURED] 716 lines — over the 500-line controller
    rule.** It is a **pre-existing** violation; this task neither causes nor fixes it, and it must be recorded
    as a named ESCALATIONS row, not silently accepted and not opportunistically split (the opposite of "one
    concern per PR"). [MEASURED] it also carries **13** of the ESLint errors Task 26 will fix.
  - A failing suite: **re-run it alone first** (memory `test_suite_fully_green_2026-06-20`, amended
    2026-08-24 — three suites have failed in a full run and passed in isolation). If it passes alone, record
    it in `T46_FLAKY_SUITES`; if it fails alone, fix it **in this commit**.

- [ ] **Step 6: commit.**

```bash
cd "$AFF"
git add -A server server.js tests
git commit -m "refactor(webcore): B14 -- the shim terminus; call sites import @crhs/web-core directly

Removes the 14 one-statement shims left by the move-then-delete convention and
repoints every call site (~101 files in server/ + server.js; logger alone was
required in 43) and every test mock site (41: 16 jest.mock + 2 requireActual for
auditLogger, 7 encryption, 6 controllerHelpers, 4 jest.mock + 7 jest.doMock for
logger, 2 + 2 requireActual for geocodingService). Spec §7.7 criterion 1 is now
mechanically true: the only server/ modules naming @crhs/web-core are the SEVEN
composition modules -- SystemConfig, rateLimiting, csrf-config, csrfTables,
cspHelper, email/transport and email/template-manager -- and a test asserts it by
statement count rather than by a path list.

THE HAZARD THIS TASK IS DESIGNED AROUND: src/index.js's surface is lazy, by its own
header, because the eager index used to stand up web-core's SystemConfig, 12 rate
limiters and a session/store footprint at require -- a second mongoose footprint per
PM2 worker that tipped the PGA-constrained Oracle ADB over PGA_AGGREGATE_LIMIT and
crash-looped startup on 2026-08-27 (ORA-04036). Spreading that object loads every
getter. tests/helpers/mockWebCore.js makes the safe Proxy form the easy form, its
own test proves reading one key loads no DB module AND that a spread does load them
(the positive control), and a repo-wide grep for the forbidden spread is now a test.
Never replace the Proxy with a spread.

Recorded, not fixed: server/controllers/administratorController.js is 716 lines,
over the 500-line controller rule. Pre-existing, untouched by this task, escalated
by name rather than silently accepted or opportunistically split.

Does NOT remove --forceExit: that is an escalation row with its own owner, and the
open-handle work it needs is not this task's concern.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
SHA=$(git rev-parse HEAD); recput T46_SHA "$SHA"; recput T46_DONE yes; recput ADOPTION_DONE yes
echo "T46_SHA=$SHA  — Task 26 may now run"
```
  - Expected: one commit, pushed; `ADOPTION_DONE=yes` in both record copies. **Task 26's Step 0 re-measures
    `LINT_TOTAL_0` from scratch, so no number needs handing over** — only the ordering does (§1).

**Rollback (exact; repo-only — the largest revert in the plan).**
```bash
AFF=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program; cd "$AFF"
WS_REC=/var/www/wavemax/cutover-logs/plan3-record.env
S=$(sed -n 's/^T46_SHA=//p' "$WS_REC" | tail -1); test -n "$S" || { echo 'STOP: no T46_SHA'; exit 1; }
git revert --no-edit "$S" || { echo 'REVERT CONFLICTED — using the deterministic fallback'; \
  git revert --abort; git checkout "$S"~1 -- server/ server.js tests/; git commit -m "revert: B14 (checkout fallback)"; }
printf 'shims back = %s\n' \
  "$(for f in $(grep -rl '@crhs/web-core' server/); do [ "$(grep -vc '^\s*\(//.*\)\?$' "$f")" = 1 ] && echo "$f"; done | wc -l)"
ls server/utils/logger.js server/utils/auditLogger.js server/services/geocodingService.js
node -e "process.env.NODE_ENV='test';require('./server.js');console.log('BOOT_OK')" | tail -1
PORT=3099 NODE_ENV=production node -e '
process.on("uncaughtException",(e)=>{console.log("BOOT_FAIL "+e.message);process.exit(1);});
require("./server.js"); setTimeout(()=>{console.log("PROD_BOOT_OK");process.exit(0);},2500);'
TZ=America/Chicago npx jest --runInBand 2>&1 | tail -6
```
- Rollback expected: the revert (or the fallback commit); **`shims back = 14`**; the three paths listed;
  `BOOT_OK`; `PROD_BOOT_OK`; a `Tests:` line matching `T38_FULL_SUITE_BASELINE`.
- **`shims back = 14` is the discriminating assertion.** A ~101-file revert that conflicts on even one call
  site leaves a tree that requires a deleted path; `ls` and a test-mode boot can both succeed while a
  production boot path is broken, which is why `PROD_BOOT_OK` is also required.
- `git checkout "$S"~1 -- server/ server.js tests/` is the deterministic fallback and is **preferred over
  resolving conflicts by hand** at this size.
- ⚠️ If this is reverted, **Task 26 must be re-baselined**: its Step 0 re-measures, so simply run Task 26's
  Step 0 again before its first batch. Do not carry a `LINT_TOTAL_0` recorded on the post-B14 tree into a
  pre-B14 tree.

---

## Exit criteria for tasks 36–46

1. **36** — no code path in the portal can `res.redirect` to `www.wavemaxlaundry.com`; `server/` contains no
   `wavemaxlaundry.com` literal; `QUARANTINE_NON_AUSTIN` and `CORPORATE_SITE_URL` recorded as dead for Task 29.
2. **37** — every in-code host list in the portal names only `portal.atxwashdryfold.com` plus the three
   documented retirement-301 hosts; outage-alert emails link to a dashboard the portal serves; the legal-copy
   host lists and four mailto addresses are an owner/counsel ESCALATIONS row, not a silent skip.
3. **38** — `SUITE_KNOWN_FAILURES=0`, `T38_FULL_SUITE_BASELINE` recorded, and every later full-suite gate in
   Plan 3 compares against it.
4. **39–46** — spec §7.7 criteria 1 and 2 hold mechanically: no `server/` file is byte-identical to a
   `crhs-web-core/src/` file; the 12 duplicate suites are gone and `brand-config.test.js` is kept; the only
   `server/` modules naming `@crhs/web-core` are the seven composition modules; `madge --circular server/` = 0;
   nothing in `server/` over 800 lines.
5. **42** — the production session cookie is still `__Host-portal.sid`, pinned explicitly and asserted on the
   wire after Task 30's deploy.
6. **45** — exactly one process registers the five gate models; the sweep cron is installed on at least oci1;
   no code path in the repo can `drop()` a collection.
7. **26 runs after 46**, and its Step 0 re-derives every total (§1).
8. Every ESCALATIONS row this document creates is in `docs/superpowers/ESCALATIONS.md` before Task 35 closes:
   the Anthropic-adjacent rows are Task 17's; these are — `ensure-indexes.js` is an IIFE that connects on
   require and honours no flag (**with its fix**: corporate's exported/injectable shape); orphan `ratelimit_*`
   collections need a by-hand `deleteMany({})`, never a `drop()`; six models were **not** added to
   `ensure-indexes.js`; `CORS_ORIGIN` must never be emptied on a box; the legal-copy host lists and four
   `@rundberglaundry.com` mailto addresses; `administratorController.js` is 716 lines against a 500-line rule;
   and web-core's `DEFAULT_COOKIE_BASE` is `app.sid`, which is wrong for every existing consumer.
