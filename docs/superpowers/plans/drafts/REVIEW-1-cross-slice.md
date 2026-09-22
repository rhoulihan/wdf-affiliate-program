# REVIEW 1 — cross-slice integrity and sequencing (adversarial)

**Reviewer dimension:** contradictions between slices, ownership gaps and double-ownership, unenforced
cross-slice ordering, irreversibility ordering, rollback validity.
**Inputs:** `plan3-slice{A,B,C,D,E}-*.md` (10,409 lines, 76 tasks) + `2026-09-20-separation-plan3-scope-brief.md`
including its "Corrections found during drafting" section.
**Verification:** every claim below that could be checked was checked against the three working trees and,
read-only, against oci1 `161.153.71.201` / oci2 `144.24.4.202` and the live origins. Nothing was changed.

**Counts:** severity 1 — **2**; severity 2 — **19**; severity 3 — **13**. Total 34.
**Cross-slice dependencies found:** 38. **ENFORCED: 11. PROSE-ONLY or worse: 27.**

Slice A is the strongest draft: every nginx premise I re-measured (127-line vhosts, `rewrite` at `:60`,
`proxy-node-app.conf` at `:63`, `if ($access_allowed = 0)` at `:53`, absolute `include` paths, 23-line portal
vhost, `X-Origin-Box: oci-phx`, `/austin-tx/` 404 on `:3001` / 200 on `:3000`, no
`sites-enabled/runberglaundry.com`) held exactly. Its defects below are couplings to *other* slices, not
errors in its own measurements. The three owner decisions on B-4 (bridge literals die with the bridge,
`wavemax-language` renamed **with** a shim, legal pages + LICENSE escalated not edited) are correctly honoured
by B7, D6 and D8 respectively.

---

## SEVERITY 1

### X1 — `INTEREST_FORM_URL` is owned by no slice, and slice B then 404s the portal's only public application link

**Where:** brief task inventory **A.5**; slice A §"Not in this slice"; slice B **B1 Interfaces**; slice B **B9 Step 5**.

**What is wrong.** Slice A states, verbatim: *"**Not in this slice** (brief group A items 5–7):
`INTEREST_FORM_URL`, the affiliate env sweep … and the P-11 device checklist."* Slice B's B1 Interfaces
states: *"**Slice A item 5** — at cutover `INTEREST_FORM_URL=https://atxwashdryfold.com/affiliate` on both
boxes. **This task does not set it and must not.**"* Slices C, D and E never mention the key. **No task in
any of the five drafts writes it to a production `.env`.**

**Why it breaks production (measured, not inferred).**

- oci1 `/var/www/wavemax/wavemax-affiliate-program/.env` — `grep -oE '^INTEREST_FORM_URL='` returns
  **nothing**. The key is not set today.
- `server/config/links.js:17` → `const INTEREST_FORM_URL = process.env.INTEREST_FORM_URL || '/affiliate';`
- `public/assets/js/affiliate-login.js:173` →
  `const url = (meta && meta.getAttribute('content') || '').trim() || '/affiliate';`
- `server.js:819` → `app.get(['/affiliate', '/affiliate/'], …)` is what makes that fallback work today.
- **B9 deletes both** `public/affiliate.html` and the `server.js:819-821` route.

So the moment B9 lands, the invite-only portal's login page — the program's only public front door — points
every applicant at a path the portal no longer serves. B1's own test (`interestFormLink.test.js`) asserts the
meta equals `INTEREST_FORM_URL`, which passes happily with the `/affiliate` fallback, so the test suite is
green while production is broken. This is exactly PITFALLS #3 one level up: the *config* indirection works,
the *deployment* of the config is nobody's task.

**Fix.** Create one explicitly-owned task (slice A, next to A11, or a new controller GATE task) that is
**HUMAN-CONFIRM** and sets on both boxes:
`INTEREST_FORM_URL=https://atxwashdryfold.com/affiliate`, then `pm2 reload wavemax --update-env`, then
asserts through Cloudflare:
```bash
curl -s "https://portal.atxwashdryfold.com/affiliate-login-embed.html?lh=$(date +%s)" \
  | grep -o '<meta name="interest-form-url" content="[^"]*">'
# must print content="https://atxwashdryfold.com/affiliate"
```
Then add to **B9 Step 1** a hard precondition, so the deletion cannot land before the config:
```bash
for IP in 161.153.71.201 144.24.4.202; do ssh -i ~/.ssh/oci_wavemax ubuntu@$IP \
  "grep -c '^INTEREST_FORM_URL=https://atxwashdryfold.com/affiliate$' /var/www/wavemax/wavemax-affiliate-program/.env"; done
# both must print 1, else STOP
```
B9's task-level `Interfaces: Consumes` must name it.

---

### X2 — E3 deletes `FRONTEND_URL` from production with only a prose precondition that E2 is deployed; the failure mode is every password-reset link in the estate

**Where:** slice E **E3 Interfaces** ("Consumes: … **E2 merged and deployed**") and **E3 Step 2**.

**What is wrong.** E3 Step 2's `set -e` preconditions check the **`.env` file** only
(`grep -c '^OAUTH_CALLBACK_URI=…' = 1`, `^DOCUSIGN_REDIRECT_URI=`, `^FRONTEND_URL=…`, `^BASE_URL=…`,
`^ALERT_EMAIL= = 0`). Not one of them looks at the **deployed code**. If the E2 commit is merged and pushed
but that box has not been `git pull`ed (a normal state — E2 Step 3 pushes but no step pulls on a box), E3
deletes the key and `server/services/passwordResetService.js:86` — which still reads
`process.env.FRONTEND_URL` on that box — emits `undefined/embed-app-v2.html?route=/reset-password&token=…`
in every reset email, for affiliates, administrators **and** operators.

E3's own Step 4 only greps the last 200 log lines for `FRONTEND_URL|undefined/embed-app-v2`, which finds
nothing unless somebody happened to request a reset in that window. E12 (the human round trip) *would* catch
it — but E12 Step 3 explicitly lists this as one of "the two failures this task exists to catch", i.e. the
plan expects to discover it **after** shipping it. The only correct place to catch it is before the delete.

**Fix.** Add to E3 Step 2, inside the same `set -e` block, before the backup:
```bash
test "$(grep -c 'process.env.BASE_URL}/embed-app-v2.html?route=/reset-password' \
  /var/www/wavemax/wavemax-affiliate-program/server/services/passwordResetService.js)" = 1
test "$(grep -c 'FRONTEND_URL' /var/www/wavemax/wavemax-affiliate-program/server/services/passwordResetService.js)" = 0
```
and record `E2_DEPLOYED_<box>=yes` per box. Same treatment for E4 (whose "Consumes: E3 complete on both
boxes" is likewise prose-only).

---

## SEVERITY 2

### X3 — Slice A's flip discriminator `len=27477` is **already stale**; the content app now serves **27593**, so every flip verification reads as a roll-back-now condition

**Where:** slice A conventions ("Per-box discriminator" table), **A4 Step 4** (PRE-FLIP/POST-FLIP profiles),
**A5 Step 4**, **A6 Step 2**, **A7 Step 4**, **A8 Step 2**, **A9 Step 5**, **A10 Step 2**, **A11 Step 3**,
**A12 Step 2** — roughly twenty hard-coded `len=27477` / `root=200/27477` assertions.

**Measured on oci1, 2026-09-21:**
```
atxwashateria.com      3001 len=27593   3000 len=1134
rundberglaundry.com    3001 len=27593   3000 len=1134
atxwashdryfold.com     3001 len=27593   3000 len=25585
```
`27477` → `27593`. The cause is cross-slice: `crhs-corporate` commit **`d8c421b`** ("preload
big-shoulders-display-latin.woff2 — CLS 0.322 -> 0.013", 2026-09-21) added a `<link rel="preload">` line to
`content/atxwashdryfold/index.html`, and it is **already rsynced to both boxes** (verified: the preload line
is present in `/var/www/crhs-corporate/content/atxwashdryfold/index.html` on oci1 and oci2, mtime 2026-09-21).

Slice A defines a mismatch on these lines as *"a **roll-back-now** condition, not a note for later."* So as
written, the first flip verification fails and an executor either rolls back a correct flip or starts
ignoring `Expected:` lines — which is worse.

It is not a one-off: **B4** (optional) removes five attributes from the same `content/atxwashdryfold/index.html`
and would move the number again, and B4 is scheduled *before* the flips (phase B-i).

**Fix.** Stop using an exact byte count as the app discriminator. Slice A already has two robust ones
(`/health` content-type + body, and the `data-i18n="partner.meta.title"` marker). Replace every
`len=<constant>` assertion with those two, and keep the byte count only as an informational field captured
**at A1 time** into the record (`CONTENT_LEN`, `PORTAL_LEN_<host>`) and referenced by variable, never by
literal. Add one line to A1 Step 1 that measures and records it.

---

### X4 — B8's flip gate is unsatisfiable, so B9 can never legitimately start

**Where:** slice B **B8 Step 1** and **B8 Step 2**.

**Three independent breaks in one gate:**

1. **Step 1 requires a host with no config.** It loops over
   `atxwashateria.com atxwashdryfold.com rundberglaundry.com runberglaundry.com` and expects *"eight lines,
   each ending `200 1`"*, where the `1` is
   `grep -c 'proxy-content-app.conf' /etc/nginx/sites-enabled/$h 2>/dev/null || echo 0`.
   **Verified on oci1:** `ls /etc/nginx/sites-enabled/runberglaundry.com` → *No such file or directory*.
   That grep prints `0` forever. Step 1 then says: *"Any `0` in the second column means the host is still on
   `:3000`: **STOP**, record `FLIPS_VERIFIED=no`, and do not start B9."* Deadlock.
   This is precisely brief correction **D-2**, which slice A re-verified and encoded (M3, D-A6, and A10's
   note that the fourth host *"has nothing of its own to flip"*). Slice B inherited the wrong premise the
   brief told everyone to stop inheriting.
2. **Step 2 reads a file slice A never writes.** It greps
   `/var/www/wavemax/cutover-logs/plan3-flips/lighthouse-per-host.txt`. Slice A writes
   `/var/www/wavemax/cutover-logs/p3-lh-<host>.txt` and
   `/var/www/wavemax/cutover-logs/plan3-sliceA-record.env`. The grep returns nothing — and an empty grep is
   trivially mistakable for "no failing row", i.e. the gate can also fail *open*.
3. **Step 2 expects four `POST` rows.** Slice A produces three (`HOST_DONE_*` for three hosts,
   `grep -c '^HOST_DONE_.*=yes$'` = `3`).

**Fix.** Rewrite B8 Steps 1–2 against slice A's actual record:
```bash
REC=/var/www/wavemax/cutover-logs/plan3-sliceA-record.env; set -a; . "$REC"; set +a
test "$ALL_HOSTS_FLIPPED" = yes
test "$(grep -c '^HOST_DONE_.*=yes$' "$REC")" = 3
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com; do
  grep -E "^C14 $H PASS$" /var/www/wavemax/cutover-logs/p3-lh-$H.txt
done
# runberglaundry.com: no sites-enabled file (brief D-2). Assert transitively instead:
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "https://runberglaundry.com/?p=$(date +%s)"  # 301 -> atxwashateria.com
```

---

### X5 — Slice C's handshake with slice A is broken in both the file and the value

**Where:** slice C **C1 Interfaces**, **C13 Step 1**.

C1 says *"Consumes: slice A's flip verification (`ALL_HOSTS_FLIPPED=PASS` in slice A's record)"*.
C13 Step 1 is the actual gate:
```bash
set -a; . "$REC"; set +a; echo "adoption=$C_ADOPTION_DONE flips=$ALL_HOSTS_FLIPPED"
# Expected: adoption=PASS flips=PASS. Anything else — STOP.
```
Two defects: `$REC` is **slice C's own** record (`$HOME/plan3-sliceC/sliceC-record.env`), which never
contains `ALL_HOSTS_FLIPPED`; and slice A records the value as **`yes`**, not `PASS`
(A10 Step 5: `printf '%s=%q\n' "ALL_HOSTS_FLIPPED" yes`). So `flips=` prints empty and the whole ESLint
series — the owner's explicit "after the flips are verified" condition — STOPs unsatisfiably.

**Fix.** C1 Step 1 sources slice A's record explicitly and re-stamps it into slice C's:
```bash
A_REC=/var/www/wavemax/cutover-logs/plan3-sliceA-record.env; set -a; . "$A_REC"; set +a
test "$ALL_HOSTS_FLIPPED" = yes || { echo 'STOP: slice A not complete'; exit 1; }
rec C_FLIPS_VERIFIED "$ALL_HOSTS_FLIPPED"
```
and C13 tests `$C_FLIPS_VERIFIED` = `yes`. Pick one vocabulary for the whole plan (`yes` or `PASS`) and
state it in the controller's assembly note — slice A uses `yes`, slice C `PASS`, slice E `PASS|FAIL`.

---

### X6 — D7's brand-neutrality allowlist is engineered to fail when B7 lands, and **no task prunes it** — which blocks the D9 release that carries the live nonce fix

**Where:** slice D §"Cross-slice dependencies", **D7 Step 1** (`ALLOW`), **D7** third test; slice B **B7**.

D7's `ALLOW` hard-codes two rows:
```js
'assets/js/iframe-bridge-v2.js':        { lines: 7,  … },
'assets/js/parent-iframe-bridge-v3.js': { lines: 11, … },
```
and its third test asserts *"every allowlist row still names a real file that still matches — no row
outlives its reason"* (`expect({ rel, exists: fs.existsSync(abs) }).toEqual({ rel, exists: true })`).
B7 `git rm`s both files. Slice D calls this *"the dependency is enforced by a test, not remembered"* and
D7's rollback note says *"the fix is to delete the two bridge rows from `ALLOW`, **not** to revert the
guard."*

**No task in any slice deletes those rows.** B7 does not touch `tests/brandNeutral.test.js` (its Files list
is the two assets, `bridgeOriginAllowlist.test.js`, `securityHeaders.js`, `cspGolden.test.js`,
`bridgesRetired.test.js`). B7 Step 5 then expects *"a `Tests:` line with `failed` absent"* — which is
impossible once D7 has landed. And **D9 Step 2** gates the release on
`Tests: 611 passed, 611 total` with no `FAIL`. So the release that ships the **live** `injectNonce` defect
fix (brief item 16, confirmed live on the portal *and* on a marketing host by slice A escalation 6) is
blocked by a guard nobody owns.

Verified: `crhs-web-core/tests/brandNeutral.test.js:7` still scans `src/` only, so D7's premise is right —
only its cross-slice hand-off is missing.

**Fix.** Add the `ALLOW` pruning to **B7's Files list and steps** (it is the task that makes the rows false),
with the assertion in B7 Step 5:
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
grep -c 'iframe-bridge' tests/brandNeutral.test.js   # must be 0
npx jest tests/brandNeutral.test.js 2>&1 | grep -E 'Tests:'
```
and note in D7 that if B7 has already landed, the two rows are simply absent from `ALLOW` and Step 2's
expected `received` object has two fewer keys.

---

### X7 — D9's release gate cannot pass if B7 ships in the same release, and B7 says it must

**Where:** slice B **B7 Interfaces** ("**Release:** this ships in the next web-core version together with
the scope-brief group-D fixes … group D owns the version bump"); slice D **D9 Step 1** and **Step 2**.

D9 Step 1 expects `git log --oneline -7` to show *"the six D commits (D7, D6, D5, D4, D3, D1
newest-first) on top of `768bfdb`"* — B7's commit is not in that list. D9 Step 2 expects
`Test Suites: 35 passed, 35 total` and `Tests: 611 passed, 611 total`, derived as 579 + D1 6 + D3 3 + D4 9 +
D5 5 + D6 7 + D7 2 = 611, with the explicit instruction *"Any other number → STOP and account for it before
bumping."* B7 deletes one suite file (`tests/assets/bridgeOriginAllowlist.test.js`), deletes one `it()` from
`tests/security/cspGolden.test.js`, and adds one suite file with 4 tests — so both the suite count and the
test count move. Same problem hits **D1 Step 5** (*"`Tests:` count matches the pre-change run of the same
selector"* over `tests/security`).

**Fix.** Decide the release contents once, in the controller's assembly, and state it in D9: either

- B7 is in v0.3.0 → D9 Step 1 expects **seven** commits including B7's, and Step 2's arithmetic becomes
  `579 + 32 + (4 new − bridgeOriginAllowlist's N − 1 cspGolden case)`, with `Test Suites: 35` (one deleted,
  one added). Compute N from the file before writing the number; or
- B7 ships in v0.3.1 → say so in B7's Interfaces, and note that until then web-core still ships the bridges,
  so corporate's `contentHandler.test.js` needs no B6.

Either way the number must be *derived in the step* (`npm test | grep Tests:` recorded, then compared),
not a literal the drafts guessed from two different premises.

---

### X8 — D10 installs the B7 release into corporate without asserting B6 landed; the failure is `ENOENT` across corporate's suite

**Where:** slice B **B6 Interfaces** / coupling note; slice D **D10 Step 2 / Step 5**.

B6 is explicit: *"must land **before** corporate installs the web-core release that contains B7"*, because
`crhs-corporate/tests/contentHandler.test.js:204` does
`fs.readFileSync(path.join(wc.assetsDir,'js',name))` over
`['iframe-bridge-v2.js','parent-iframe-bridge-v3.js','css-async.js']` — **verified present at `:204`, plus a
single-file case at `:155`**. D10 Step 2 does `rm -rf node_modules/@crhs/web-core && npm install` in
corporate and Step 5 expects the suite *"identical to the Step 0 baseline"*. Nothing between them checks B6.

**Fix.** Add to D10 Step 2, before the install:
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
test "$(git grep -cI -E 'iframe-bridge-v2|parent-iframe-bridge-v3' -- tests server || true)" = ""
```
and name B6 in D10's `Interfaces: Consumes`. (Symmetrically, B6's rollback note already states the reverse
hazard correctly.)

---

### X9 — Slice A measures the wrong Lighthouse set: `/` on three hosts, where the committed baseline gates `/` **and** `/affiliate` on four. B3's stated quality gate therefore never runs

**Where:** slice A **A1 Interfaces** (*"Consumes: the committed baseline table in
`docs/development/LIGHTHOUSE-QUALITY-BAR.md` §'Content origin baseline (2026-09)'"*), A1 Step 2, A6/A8/A10
Step 4; slice B **B3** (*"Its post-flip Lighthouse C14 run (slice A item 3, GC 15 — `/affiliate` is
explicitly in the measured set) is the gate on the result"*).

**Verified in the cited file, `docs/development/LIGHTHOUSE-QUALITY-BAR.md:132`:**
> **Gating (C14): Accessibility 100, Best Practices 100, SEO 100** on `/` **and `/affiliate`**, mobile and
> desktop, on **all four** marketing hosts.

and its table carries 16 rows — `/` and `/affiliate` × 4 hosts × 2 form factors. Slice A's every Lighthouse
invocation is `"https://$H/?lh=$(date +%s)"` for three hosts. `/affiliate` is never measured, and
`runberglaundry.com` is never measured.

Consequence: **B3 rewrites the entire 336-line interest form and adds ~99 translated leaves in four locales,
and the page ships to the public with no post-flip Lighthouse measurement at all** — against a project rule
that a user-facing page change "isn't done until measured on mobile and desktop". The page is also the one
X1 makes the portal's only application link point at.

**Fix.** Extend A1 Step 2 and the after-gate steps to a `for P in "" affiliate` loop (doubling the run
count), and add the `/affiliate` rows to the C14-abs/-stab/-reg evaluation. Add `runberglaundry.com` as a
follow-redirect measurement or record explicitly in D-A3 why the typo host is excluded from a baseline that
names it. B3's Interfaces should then cite the specific step that measures it.

---

### X10 — `EXPLORER_TOKEN` and `ANTHROPIC_API_KEY` are never removed from the production `.env`, so exit criterion 5 fails

**Where:** slice B **B11 Step 5** (*"The production `.env` files still carry them; **slice A's env sweep**
(scope-brief item 21 …) removes them from the boxes"*); slice A §"Not in this slice"; slice E **E1 Step 2 /
E4 Step 3**.

**Verified on oci1:** `grep -cE '^(EXPLORER_TOKEN|ANTHROPIC_API_KEY)=' …/.env` → **`2`**. Both keys are live
in production today.

Slice A disclaims the env sweep. Slice E's E1 classification ran **before** the explorer was deleted, so both
keys classify `LIVE` and appear in neither the 16 `DEAD` list nor E4's 24-key deletion filter. After B11
deletes `explorerGuard`, `conciergeController`, `conciergeFaq`, `conciergeLimiter` and the 150-file explorer
tree, the two keys are dead — and no task removes them. Exit criterion 5 ("no dead `.env` keys") is not met,
and one of them is a **paid-LLM API key** left on two production boxes for a deleted subsystem.

**Fix.** Either (a) sequence E4 **after** B11 and add both keys to E4's `grep -vE` filter and to its owner
wording, or (b) give B11 its own box-side follow-up step (HUMAN-CONFIRM, backup, `grep -vE`,
`pm2 reload wavemax --update-env`). (a) is cheaper. Either way E15 row 8 should add "revoke the Anthropic
key" to the credential-revocation escalation.

---

### X11 — B12's own verification can never pass with B12's stated Files list: measured 30 residual host literals across 8 files it does not list, against an expected 16

**Where:** slice B **B12 Files**, **B12 Step 1**, **B12 Step 4**.

B12 Step 1 expects *"measured 2026-09-20: 16 lines"* and Step 4 expects the same grep to print nothing and
report `--- exit 1 ---`. **Measured now** with B12's own expression over `server server.js public`
(`portal.atxwashdryfold.com` excluded): **52 lines / 21 files**. Subtract what earlier tasks delete —
B5 (`parent-iframe-bridge-v3.js` 5 + `.min.js` 1 + `iframe-bridge-v2.js` 4 = 10) and
B9 (`partner-program.html` 7 + `affiliate.html` 5 = 12) — and **30 lines remain**, in these files, **eight of
which are absent from B12's Files list**:

```
3  server/services/email/dispatcher/operator.js      (BASE_URL || 'https://rundberglaundry.com')
2  server/services/email/dispatcher/ops.js           (:44/:65 hard-coded monitoring-dashboard link)
2  server/services/email/dispatcher/customer.js
1  server/services/email/dispatcher/affiliate.js
1  server/services/email/dispatcher/admin.js
1  server/services/email/template-manager.js
1  server/modules/onboarding/inviteService.js
1  public/affiliate-landing-embed.html               (page-level CSP connect-src)
1  public/assets/js/affiliate-landing-init.js
```
Most are `process.env.BASE_URL || 'https://rundberglaundry.com'` fallbacks — inert while `BASE_URL` is set
(it is, verified), but they are exactly the dead-literal class B12 exists to remove, and they defeat its
gate. `ops.js:44`/`:65` are **not** fallbacks: they hard-code
`https://rundberglaundry.com/monitoring-dashboard.html` in outage-alert email bodies (it survives the flip
only because `/monitoring-dashboard.html` is in `legacyPortalRedirects.EXACT_PATHS` — verified present).

**Fix.** Re-derive B12's inventory at execution time rather than pinning a number: Step 1 records the count
into the slice record, Step 4 asserts the count is **0** and lists the files if not. Add the eight files to
B12's Files list, and note explicitly that slice A escalation 8 hands `affiliate-landing-embed.html:8`'s CSP
to whoever owns the portal CSP — which is B12.

---

### X12 — C10 deletes `server/config/storeIPs.js` on a precondition that only holds if the **optional, owner-decided** B15 ran

**Where:** slice C **C10 Step 1** / Files; slice B **B15** (*"OPTIONAL — runs only on
`DECISION_QUARANTINE=delete`"*).

C10 Step 1 runs `grep -rn "config/storeIPs" server/ server.js | grep -v 'server/config/storeIPs.js'` and
expects *"`storeIPs` must show only `server/middleware/auth.js:10`"*, else **STOP**.

**Measured now:**
```
server/middleware/auth.js:10:const storeIPConfig = require('../config/storeIPs');
server/middleware/locationQuarantine.js:26:const storeIPs = require('../config/storeIPs');
server/middleware/partnerLanding.js:20:const storeIPs = require('../config/storeIPs');
```
`partnerLanding.js` goes with B9. `locationQuarantine.js` goes only with **B15**, which runs *"only on
`DECISION_QUARANTINE=delete`"* from B8 Step 5. If the owner says **keep**, C10's assertion fails, C10 STOPs,
and with it C11 → C12 → C13 → the whole ESLint series (owner decision 2). C-R6 and C13's arithmetic also
assume `storeIPs.js` −9 unconditionally.

**Fix.** Make the dependency explicit and conditional: C10's `Interfaces: Consumes` names
`DECISION_QUARANTINE=delete`; C10 Step 1 reads slice B's `record.env` and, on `keep`, keeps
`server/config/storeIPs.js` (deleting only `tests/unit/storeIPs.test.js` is not an option either — it tests
the surviving module) and records `C10_STOREIPS_KEPT=yes`, which C13 subtracts from its predicted total.
Alternatively promote B15 out of "optional" — the owner already accepted deleting the franchisor-redirect
path in spirit when they removed the admin IP gate; ask once and hard-code it.

---

### X13 — Four different "single escalation list" artefacts, at four paths, in four slices

**Where:** slice B **B14 Step 4** → `docs/superpowers/plans/plan3-escalations.md`; slice C **C20 Step 4** →
a `## Plan 3 — escalated, not forgotten` heading inside `tasks/todo.md`; slice D **D8 Step 1** →
`docs/refactor/OWNER-COUNSEL-ESCALATIONS.md`; slice E **E15** → `docs/superpowers/ESCALATIONS.md`.

Exit criterion 7 is *"**A single written list** of anything escalated to the owner/counsel"*. Each slice
builds its own and each is partial; worse, they cross-reference each other's paths inconsistently —
**D7's `ALLOW` reason strings** point at `docs/refactor/OWNER-COUNSEL-ESCALATIONS.md`, while **E13 Step 2**
and **E14** point at `docs/superpowers/ESCALATIONS.md`, and B14 Step 4 item 8 says slice A's items are
*"referenced, not owned here"* without naming a file at all. The outcome is the exact failure mode the
criterion was written against: four lists means no list.

**Fix.** The controller picks **one** path — `docs/superpowers/ESCALATIONS.md` (E15's, the most complete at
11 rows, and the only one with an owner/date/decision/blocks column per row). B14, C20 and D8 become
*append a section to that file* tasks, D7's `ALLOW` reasons are re-pointed at it, and E15's Step 2 assertion
(`grep -c '^| [0-9]'`) is raised from 11 to the merged row count. E15 must then also carry: the CLS/byte
consequence (X3), X1's `INTEREST_FORM_URL`, X10's two keys, C20's rows 1–7 and D8's L-1…L-4.

---

### X14 — B14 and E14 both own the memory `backlog_*` files and prescribe contradictory outcomes

**Where:** slice B **B14 Files / Step 3**; slice E **E14**.

- B14 modifies `backlog_interest_form_i18n.md`, `backlog_register_now_interest_form.md`,
  `backlog_webcore_brand_literals_b4.md` and `MEMORY.md`, and instructs: *"**Delete nothing**: the reasons
  are the value"* — keeping the `backlog_` filenames.
- E14 takes **all five** `backlog_*.md` plus `MEMORY.md`, and instructs: rename `backlog_* → closed_*`
  because *"a filename that still says 'backlog' is a false signal to the next session"*. Its Step 3 expects
  `0` backlog files and `5` closed files.

If B14 runs first (it is in phase B-iii, well before E14's dependencies close), E14 Step 3 finds 3 files
already rewritten under their old names and 2 untouched; if E14 runs first, B14 edits files that no longer
exist. Neither task's `Interfaces` mentions the other. These files are outside git, so a bad order is not
recoverable by `git revert` — only by E14's tarball snapshot, which B14 does not take.

**Fix.** E14 owns all five files and `MEMORY.md`, exclusively. B14 Step 3 is deleted and replaced by "hand
`closed_interest_form_i18n.md` / `closed_register_now_interest_form.md` / `closed_webcore_brand_literals_b4.md`
content to E14" — B14 supplies the commit shas and the two deliberate non-closures (the 33 SVG `<text>`
nodes, the English-canonical SEO block), E14 writes the files. Move E14's snapshot step to whichever task
touches `memory/` first.

---

### X15 — C12's `--forceExit` removal is vacuous: `jest.config.js:23` still sets `forceExit: true`. Three slices disagree on whether this is fixed or escalated

**Where:** brief correction **C-10** (*"`jest.config.js:24` sets `forceExit: true` … **Escalated, not
silently fixed**"*); slice C **global constraint 4** and **C12 Step 3**; slice B **finding 4 / B14 Step 4
item 6**; slice E (silent).

**Verified:**
```
jest.config.js:23:  forceExit: true,
package.json: "test": "TZ=America/Chicago jest --runInBand --forceExit"   (+5 more scripts)
```
C12 Step 3 does `sed -i 's/ --forceExit//g' package.json` and then claims to prove *"the suite is clean
without `--forceExit`"* with `npx jest --runInBand --detectOpenHandles`. But `forceExit: true` in the config
file still applies to that run, so the process exits regardless of open handles and the gate cannot fail for
the reason it exists. C11 Step 4's *"the suite green **without** `--forceExit`"* has the same hole. Slice C's
exit criterion 9 and the project rule are therefore asserted on evidence that cannot support them — and
slice B/E simultaneously list it as an open escalation, so the final backlog will claim both.

**Fix.** C12 Step 3 must remove the flag from **both** places and prove it:
```bash
sed -i 's/ --forceExit//g' package.json
node -e "const c=require('./jest.config.js');if(c.forceExit)throw new Error('still set')"
grep -c forceExit jest.config.js package.json   # 0 0
TZ=America/Chicago npx jest --runInBand --detectOpenHandles 2>&1 | tail -20
```
If handles are found and cannot be closed inside C12, revert the config change and escalate honestly —
then B14/E15 keep their row. What must not happen is package.json cleaned, config left, and the row closed.

---

### X16 — A3's rollback silently un-flips all three marketing hosts, contradicting its own "independent in both directions" claim

**Where:** slice A **A3 Interfaces** (*"Independent of the flips in both directions: it can be rolled back
after the flips, and the flips can be rolled back after it"*) and **A3 Rollback**.

A3's rollback does a whole-file restore:
```bash
for f in atxwashateria.com atxwashdryfold.com rundberglaundry.com portal.atxwashdryfold.com; do
  sudo cp -p ~/nginx-snapshots/$f.$TS /etc/nginx/sites-enabled/$f
done
```
Those snapshots are taken in A3 **Step 2**, i.e. pre-flip. A5–A10 then rewrite three of those same four
files. Running A3's rollback after the flips therefore restores the pre-flip vhosts: the three marketing
hosts go back to `proxy-node-app.conf` (`:3000`), the `/austin-tx/` rewrites return, and the
franchisor-branded `@maintenance` 503 comes back with `error_page 503 = @maintenance` re-intercepting A4's
graceful 503. An operator reaching for A3's rollback during an incident — trusting the stated independence —
would reverse a completed cutover without meaning to.

**Fix.** Make A3's rollback surgical: restore only the two deleted files and re-insert the gate lines with a
reverse transform, or (simpler and safer) scope the rollback per file and refuse to restore a vhost whose
current content includes `proxy-content-app.conf`:
```bash
for f in atxwashateria.com atxwashdryfold.com rundberglaundry.com portal.atxwashdryfold.com; do
  if grep -q 'proxy-content-app.conf' /etc/nginx/sites-enabled/$f; then
    echo "REFUSE $f — flipped; roll the flip back first"; continue; fi
  sudo cp -p ~/nginx-snapshots/$f.$TS /etc/nginx/sites-enabled/$f
done
```
and correct the Interfaces claim to "independent **before** the flips; after them, roll the flips back first".

---

### X17 — Rolling back E3 after E4 re-plants the 27-line plaintext RSA private key on both production boxes

**Where:** slice E **E3 Rollback**, **E4 Rollback**.

E3's rollback is `cat /var/www/wavemax/env-backups/.env.$TS_E3 > …/.env`. That backup was taken **before
E3**, i.e. it still contains `DOCUSIGN_PRIVATE_KEY` + its 26 PEM body lines, the four OAuth client secrets
and all 24 dead keys. So "roll back E3" silently undoes E4 as well and restores a live credential to
production. Neither rollback block mentions it; E3's only caveat is the benign *"restores a working but wrong
`FRONTEND_URL` that nothing reads — harmless"*.

**Fix.** Both rollbacks get a guard and a stated order (E4 first, then E3), plus an E3 refusal:
```bash
# in E3's rollback, before restoring:
if grep -q '^TS_E4_'"$BOX"'=' "$REC"; then
  echo "REFUSE: E4 has run on $BOX. Roll E4 back first, or restore .env.$TS_E4 instead."; exit 1; fi
```
and after any `.env` restore, assert `grep -c 'PRIVATE KEY' .env` is `0` unless the restore was deliberately
to a pre-E4 state approved by the owner.

---

### X18 — The owner's ESLint decision is only half implemented: no no-increase guard exists outside `server/`, and C20 re-escalates a decision already made

**Where:** owner decision (*"`server/` + `server.js` = 0; the ~10,692 errors outside `server/` become a
**documented accepted baseline with a no-increase guard** — NOT fixed"*); slice C **C19**, **C20 Step 4
item 1**.

C19 delivers `server/` + `server.js` = 0 with a programmatic guard — correct. But nothing anywhere pins the
rest. C20's escalation row 1 instead writes: *"**Owner decision needed:** schedule, or accept as permanent
debt with the guard confined to `server/`."* That re-opens a settled decision and, as written, the plan ships
with the 10,692 unguarded — any future commit can add to them silently, which is precisely what the owner's
"no-increase guard" was for.

**Fix.** Add to C19 a second, repo-wide baseline guard and a recorded number:
```js
// tests/unit/eslintRepoBaseline.test.js
const results = await new ESLint({ cwd }).lintFiles(['.']);
const errors = results.reduce((n, r) => n + r.errorCount, 0);
expect(errors).toBeLessThanOrEqual(Number(require('../../.eslint-baseline.json').errors));
```
with `.eslint-baseline.json` written from the measured value at C19 time (10,900 at draft; re-measure —
B9/B11 delete `design-explorer` 315 and a chunk of `public/`, so it will be materially lower), and an npm
script `lint:baseline`. Then C20 row 1 becomes a *record*, not a question.

---

### X19 — E12 pass 1 is declared a gate on slice A's `rundberglaundry.com` flip; slice A never mentions E12

**Where:** slice E **E12 Interfaces** (*"**Gates:** group A's `rundberglaundry.com` flip (pass 1, before) and
the post-flip acceptance (pass 2, after)"*), **E-R1**, §3 dependency order; slice A **A7 Step 0**.

This is the *second* half of the known E-vs-A contradiction, and the controller's ruling (slice A is right
that E2 is not a prerequisite) does not dispose of it. A7 Step 0 asserts C14, `PRE404_CLOSED`,
`SNIPPET_READY`, M22, M23 and M24 — a genuinely good gate — but nothing about a human having exercised
password reset end to end. Meanwhile E12 is the only task in the plan that tests the four-system flow, is
**human-executed**, needs owner-chosen accounts, and is rate-limited to 3 attempts/hour with no admin reset.
If it is genuinely a gate it must appear in A7's `Consumes` and in a step; if it is not, E12's Interfaces
must be corrected so the controller does not schedule a human round trip as a blocker that the flip task
will not wait for.

**Fix.** Controller decision, recorded in both slices. Recommended: keep E12 pass 1 as a **pre-flip
acceptance** (it is cheap insurance on a path slice A itself calls a "latent dependency" on
`EXACT_PATHS`), add to A7 Step 0:
```bash
set -a; . /var/www/wavemax/cutover-logs/plan3-record.env; set +a
echo "pwreset_pass1=$PWRESET_AFFILIATE/$PWRESET_ADMIN pass=$PWRESET_PASS_NUMBER"
test "$PWRESET_AFFILIATE" = PASS && test "$PWRESET_ADMIN" = PASS
```
and note in E12 that pass 2 follows A8 (both boxes flipped), not A7.

---

### X20 — Brief items A.6 (affiliate env sweep) and A.7 (P-11 device checklist) are owned by no slice

**Where:** brief task inventory A.6, A.7; slice A §"Not in this slice"; nothing else claims them.

A.6 is `BASE_URL`, `LOG_SERVICE_NAME`, `SESSION_COOKIE_NAME`. **Verified on oci1:** `BASE_URL` and
`LOG_SERVICE_NAME` are present; **`SESSION_COOKIE_NAME` is absent**, so the app is running on its built-in
default while slice C's C7 swaps the session mount to web-core's `buildSessionMiddleware({ cookieName })` and
C7 Step 3 warns that a cookie-name change *"would sign every logged-in portal user out on deploy"*. Nobody
verifies the box value before that swap. A.7 is a pre-flip device checklist the brief mandates *"before
Phase 1 step 3"*; no task contains it.

Slice E §4 item 10 adds a third orphan: *"Corporate `.env` may carry the same dead keys … A one-command check
of the corporate file belongs in **group A's env sweep**"* — a sweep that does not exist.

**Fix.** One new controller-owned task (the same one X1 needs) covering: `INTEREST_FORM_URL`,
`SESSION_COOKIE_NAME` (assert the value the app expects, or record that the default is intended),
`LOG_SERVICE_NAME`, `BASE_URL`, the corporate `.env` dead-key check, and the P-11 device checklist as an
explicit checkbox list with expected outputs. It must run before A5 (device checklist) and before B9
(`INTEREST_FORM_URL`).

---

### X21 — Slice C's task-order diagram contradicts slice B's own phasing, which puts B1–B4 *before* the first flip

**Where:** slice C §"Task order and why" (`slice A flips verified ──► slice B cleanup ──► C1 … C12`);
slice B §"Sequencing" (phase **B-i** = B1–B4, *"**BEFORE** slice A's first flip"*).

A controller assembling from slice C's diagram would schedule all of slice B after slice A — which puts B3
(the `/affiliate` i18n layer) after the `atxwashdryfold.com` flip, breaking B3's own stated reason for
existing (*"this lands with zero public risk and the flip then serves a translated page as its first public
byte"*) and shipping an English-only page publicly in between. It also means B1 (the `interest-form-url`
placeholder) lands after the flip, widening X1's window.

**Fix.** The controller's assembled order must be
`B-i (B1–B4) → A1..A4 → A5..A10 → B-ii / D → B-iii → C → E closure`, with slice C's diagram corrected to
`slice B phase B-i ──► slice A flips verified ──► slice B phases B-ii/B-iii ──► C1…`.

---

## SEVERITY 3

### X22 — A1's blocking premise is stale: the CLS fix is already committed **and deployed to both boxes**

`crhs-corporate` HEAD is `d8c421b` *"perf(atxwashdryfold): preload big-shoulders-display-latin.woff2 — CLS
0.322 -> 0.013"* (2026-09-21, pushed), and the preload line is present in
`/var/www/crhs-corporate/content/atxwashdryfold/index.html` on **both** boxes. Slice A's D-A1 and escalation 1
still describe it as *"a HARD PREREQUISITE … the controller must route the CLS fix to the content slice"*, and
A1 Step 3's "Expected **today**" block still predicts `performance=83` / `C14_PREFLIGHT FAIL`. Owner decision
"the CLS fix lands FIRST, before any flip" is satisfied, by a deploy no slice records.
**Fix:** rewrite A1's "expected today" to the post-fix prediction, add a Step 0 assertion that the preload
line is on both boxes (`grep -c 'big-shoulders-display-latin.woff2" crossorigin'` = 1), and record `d8c421b`
plus its deploy in the plan's change log so the fix is not re-done. See also X3 — the same commit is what
invalidated `len=27477`.

### X23 — A2 and B12 both own the two legal-page canonicals

`public/privacy-policy.html:10` and `public/terms-and-conditions.html:10` appear in **A2 Step 3**'s `sed`
block *and* in **B12's Files list** ("the canonical host"). Whichever runs second is a no-op, and B12 Step 3's
*"Expected: every test failing; the first showing the live CSP header with `https://rundberglaundry.com`"*
is wrong once A2 has run (that part of B12's guard passes).
**Fix:** A2 keeps them (it needs them for the SEO loop it is closing); B12 drops them from Files and its
guard asserts them as an invariant already satisfied.

### X24 — A2's rollback cannot run after B9

A2 Step 3 edits `public/partner-program.html:10`; B9 `git rm`s that file. `git revert <A2-sha>` after B9
conflicts. A2's rollback note covers the *flip* ordering but not this.
**Fix:** add to A2's rollback: "after B9 has landed, revert A2 with `git revert -n` and resolve
`public/partner-program.html` as deleted."

### X25 — Slice C's ESLint arithmetic is internally inconsistent and ignores three files slice B deletes

C-R6 says *"208 − 9 − 2 − 2"* = **195**; C-R6's next line predicts **≈195**; C13 Step 2 predicts **196** with
deltas that sum to **194**. None accounts for `server/middleware/explorerGuard.js` (**9** `quotes`, deleted by
B11 — and the table at C's §"The 208, by file" even marks other rows `← DELETED by slice B` but not this one),
`server/config/quarantineConfig.js` (**3** `comma-dangle`) or `server/middleware/locationQuarantine.js`
(**1**) — both deleted by B15. C14/C15/C16/C17 then hard-code `TOTAL 133`, `90`, `51`, `10`, and C16's Files
list still names `explorerGuard.js`.
**Fix:** delete every predicted total from C14–C18's `Expected:` lines and replace with "the value C13
recorded, minus this batch's recorded rule count", which C13 already computes per rule.

### X26 — Task-ID collision: the brief's "C14" is the Lighthouse gate; slice C's "C14" is the indent batch

The owner decision reads *"**C14 blocker:** the CLS fix lands FIRST"*, meaning the Lighthouse criterion.
Slice C names its first ESLint task **C14**, and slice A defines `C14-abs` / `C14-stab` / `C14-reg`. An
assembled plan with both will be misread.
**Fix:** renumber slice C's tasks (`E-1…` or `L1…`) or rename the criterion (`LH-GATE`), and state the choice
once in the assembly header.

### X27 — B8 Step 4 and C-R11/C20 re-open the settled explorer decision

The owner has decided: retire the explorer, delete `/api/concierge`, the 5th CSRF row goes with it. B11
implements exactly that — but only after **B8 Step 4** asks the owner again with a "Delete, or keep?"
question and a `DECISION_EXPLORER=keep` branch; and C20's escalation row 6 instructs *"Carry it forward even
if slice A already resolved it"*, which would put a settled item into the final escalation register.
**Fix:** hard-code `DECISION_EXPLORER=delete` with the decision date, reduce B8 Step 4 to a one-line
confirmation of scope (150 files, 6.6 MB, the last paid-LLM endpoint), and delete C20 row 6 in favour of a
one-line record.

### X28 — B7 Step 5's expected residual brand-literal list is order-dependent on D7 and nothing declares it

B7 Step 5 expects the residual list to be exactly `LICENSE`, `assets/js/i18n.js`,
`assets/js/language-switcher.js`, and the three `assets/legal/*.html`. **D7 Step 3 de-brands
`assets/js/language-switcher.js:2`**, so after D7 that file is absent from the list and B7's expectation is
wrong; before D7 it is right. Symmetrically **D6** changes `assets/js/i18n.js`'s literal count to 1 (from the
`storageKey`) — B7's list assumes the file still matches, which it does either way, but for a different
reason.
**Fix:** state the intended order (B5 → B6 → B7 → D1…D7 → D9) in both slices' cross-slice notes, and make
B7 Step 5 derive the list rather than pin it.

### X29 — D6 edits a file B7 deletes; the prose allows for it but the steps do not

D §cross-slice says *"if B lands first, the file is gone and the edit is dropped"*, but D6's Files list,
Step 3 edit and Step 4 assertion (`grep -c "wavemax-language" … assets/js/parent-iframe-bridge-v3.js` → `0`)
all assume the file exists. On the recommended order (B7 first) Step 3 fails and Step 4's grep errors.
**Fix:** wrap D6's bridge edit in `[ -f assets/js/parent-iframe-bridge-v3.js ] && …` and make Step 4's
expectation conditional, or simply delete that half of D6 and note B7 supersedes it.

### X30 — E4's `ALLOWED_ENV_VARS` guard test cannot fail first, contradicting E4's own TDD instruction

E4 Step 5 says *"add a guard test asserting `systemHealthService.ALLOWED_ENV_VARS` contains **no**
`DOCUSIGN_`, `GOOGLE_CLIENT`, `FACEBOOK_APP` or `FRONTEND_URL` entry … Write the guard test first and watch
it fail (strict TDD). Expected before the edit: `Tests: 1 failed`."* But E1 Step 2 already established that
`ALLOWED_ENV_VARS` *"contains no `DOCUSIGN_` key"*, and **E2 Step 2 already removed `FRONTEND_URL` from it**.
The guard passes on first run.
**Fix.** Either move the guard into E2 (where `FRONTEND_URL`'s removal makes it genuinely red first), or keep
it in E4 and state plainly that it is a **fence, not a red-green** — the same honest framing slice C uses for
C7 Step 1 and slice B uses for B7's CRP case.

### X31 — C20 hands the `STRIPE_*`/`AWS_*` `ALLOWED_ENV_VARS` rows to slice E; slice E does not take them

C20 escalation row 4: *"`ALLOWED_ENV_VARS` still advertises dead subsystems — `STRIPE_PUBLISHABLE_KEY`,
`STRIPE_SECRET_KEY` and four `AWS_*` keys … Adjacent to slice E item 21 (dead `.env` keys); **fold in
there**."* E4's guard covers only `DOCUSIGN_`/`GOOGLE_CLIENT`/`FACEBOOK_APP`/`FRONTEND_URL`, and E1's key
sweep is over the `.env`, not over `ALLOWED_ENV_VARS`.
**Fix:** add the six prefixes to E4's guard-test assertion and to E4 Step 5's edit list, or keep the row in
the (single, per X13) escalation register with an owner. Do not leave it as a hand-off to a task that does
not accept it.

### X32 — A12 Step 2 stops `crhs-corporate` on oci1 with no interlock against slice D's per-box deploy

A12 Step 2 runs `pm2 stop crhs-corporate` on oci1 to prove the graceful 503, relying on *"oci2 keeps
serving"*. D11 takes oci1 then oci2 through `rm -rf` + install + two `pm2 reload`s, with its own note that
*"the two boxes are **never** mid-deploy at the same time."* Neither task can see the other's state, and
both degrade one box deliberately. Overlap means crhsent.com and the portal are degraded on both boxes at
once.
**Fix:** one shared "one box degraded at a time" lock in the cutover record —
`BOX_BUSY=<box>` written before and cleared after any task that stops or reloads an app, asserted empty at
the start of A12 Step 2, D11 Step 4, E3 Step 4, E4 Step 4 and E6 Step 3.

### X33 — Four slices edit `tasks/todo.md` in four commits, and E13's gate depends on all of them

B14 (B-1/B-2/B-4), C20 (D-2/D-4 + an escalation heading), D8 (B-5) and E13 (every open `D-`/`B-`/`Owner
decision` item) all rewrite the same file. E13's `check-backlog-empty.sh` fails until all four have landed —
which is correct — but E13's Step 2 instruction is to close *all 22* items itself, duplicating what the other
three do and risking a `- [x]` with no commit sha, which the DEFERRED WORK section's own words forbid.
**Fix:** B14/C20/D8 close only their own sections; E13 becomes verification-plus-gate only (run the script,
list anything still open, refuse to hand-close). Sequence E13 last.

### X34 — `E3` adds `ALERT_EMAIL` while slice C's C5/C10 change what alerts fire, with no shared record

E3 adds `ALERT_EMAIL=admin@crhsent.com` so outage alerts stop going to an unread mailbox (a good catch), and
E5/E6 reduce the connectivity monitor to one worker every 5 minutes. C10 adds a cron (`sweep-rate-limits`)
and C4 changes an admin endpoint's audit payload. None of them records "what now pages a human". Exit
criterion 1's "clean deployment" is weaker for it.
**Fix:** one line in the slice-E record and in the escalation register naming, post-Plan-3, every path that
emails `ALERT_EMAIL`, and one probe (`ops.js` dispatch with a forced failure) that proves it arrives at
`admin@crhsent.com`.

---

## Cross-slice dependency table

`ENFORCED` = asserted in a numbered step with an expected value, in the task that depends on it.
`PROSE-ONLY` = mentioned in Interfaces/prose but never asserted. `BROKEN` = asserted, but the assertion
cannot pass as written. `UNOWNED` = the dependency's producer is not any task.

| # | Dependency (consumer ← producer) | Declared where | State |
|:--|:--|:--|:--|
| 1 | A1 C14 gate ← content-app CLS preload (`crhs-corporate`) | A1 Step 4 hand-off, A escalation 1 | **UNOWNED** (already landed `d8c421b`; X22) |
| 2 | A5/A7/A9 ← A2 `PRE404_CLOSED=yes` | A5/A7/A9 Step 0 `test "$PRE404_CLOSED" = yes` | **ENFORCED** |
| 3 | A7 ← A2 self-hosting `embed-landing.html:314/:317` (M22) | A7 Step 0 `m22_cross_origin_script_refs=0` | **ENFORCED** |
| 4 | A7/A9 ← A2 `partner-program.html:10` canonical (M24) | A7/A9 Step 0 `m24_portal_canonical` | **ENFORCED** |
| 5 | every flip ← token-preserving reset 301 (M23) | A2 Step 4, A7 Step 0, `plan3-verify-host.sh` | **ENFORCED** |
| 6 | A's flips ← E2/E3 (`FRONTEND_URL`→`BASE_URL`) | E-R1, E §3; A D-A8 rejects | **CONTRADICTED** (controller: A is right) |
| 7 | A7 ← E12 pass 1 (human round trip) | E12 Interfaces "Gates: group A's flip" | **PROSE-ONLY** (X19) |
| 8 | B9 ← `INTEREST_FORM_URL` on both boxes | B1 Interfaces names "slice A item 5"; A disclaims | **UNOWNED** (X1, sev 1) |
| 9 | A5 ← P-11 device checklist (A.7); C7 ← `SESSION_COOKIE_NAME` (A.6) | brief only | **UNOWNED** (X20) |
| 10 | A's first flip ← B-i (B1–B4) landed | B §Sequencing table; C diagram contradicts | **PROSE-ONLY** (X21) |
| 11 | B9 ← all hosts flipped + per-host C14 pass | B8 Steps 1–2 | **BROKEN** (X4) |
| 12 | B7 ← B5 (affiliate serves no bridge) | B7 Step 1 three-repo grep | **ENFORCED** |
| 13 | B7 ← B6 (corporate filename-independent) | B7 Step 1 (corporate section empty) | **ENFORCED** |
| 14 | D10 corporate install ← B6 | B6 Interfaces, D cross-slice note | **PROSE-ONLY** (X8) |
| 15 | D7 `ALLOW` ← B7 bridge deletion (rows must be pruned) | D cross-slice, D7 rollback note | **BROKEN / UNOWNED** (X6) |
| 16 | D9 release ← B7 in the same release | B7 Interfaces "Release:" | **PROSE-ONLY + contradicted** (X7) |
| 17 | D6 bridge edit ← B7 not yet landed | D cross-slice prose | **PROSE-ONLY** (X29) |
| 18 | B7 Step 5 expected literal list ← D7 not yet landed | nowhere | **UNDECLARED** (X28) |
| 19 | C1/C13 ← A `ALL_HOSTS_FLIPPED` | C1 Interfaces, C13 Step 1 | **BROKEN** (X5) |
| 20 | C5 ← B10/B11 (intake + concierge deleted) | C1 Step 3 / C5 Step 1 measured branch | **ENFORCED** (branch) |
| 21 | C10 `storeIPs` deletion ← B9 **and** optional B15 | C10 Step 1 assertion | **BROKEN when B15=keep** (X12) |
| 22 | C13–C19 ← C12 `C_ADOPTION_DONE=PASS` | C13 Step 1 | **ENFORCED** (in-slice) |
| 23 | C14–C17 totals ← B9/B11/B15 deletions | C-R6 prose | **PROSE-ONLY** (X25) |
| 24 | C18 web-core fixes ← D9 release sequencing | C open question 5 | **PROSE-ONLY** |
| 25 | D2 ← D1 | D2 Step 1 (red first) | **ENFORCED** |
| 26 | D10/D11 ← D2 merged | D10 Interfaces; D11 Step 5 gate checks version/surface only | **PROSE-ONLY** |
| 27 | D11 ← A12 monitor tightening / failover behaviour | D11 blast-radius prose | **PROSE-ONLY** (X32) |
| 28 | E3 ← E2 **deployed on the box** | E3 Interfaces prose | **PROSE-ONLY** (X2, sev 1) |
| 29 | E4 ← E3 complete on both boxes | E4 Interfaces prose | **PROSE-ONLY** |
| 30 | E12 ← E2 deployed + E3 both boxes | E12 Interfaces prose (Step 3 detects after the fact) | **PROSE-ONLY** |
| 31 | E11 ← E10 mirror + `TRANSFER_UNIQUE_N=0` + README landed | E11 Step 1 mechanical asserts | **ENFORCED** |
| 32 | E13 ← C (D-2/D-4), B (B-4), D (B-5) | E13 Interfaces + `check-backlog-empty.sh` | **ENFORCED** (by script) |
| 33 | E14 ← B14 (same five memory files) | neither declares the other | **CONTRADICTED** (X14) |
| 34 | single escalation register ← B14 / C20 / D8 / E15 | four paths, four slices | **CONTRADICTED** (X13) |
| 35 | box removal of `EXPLORER_TOKEN`/`ANTHROPIC_API_KEY` ← "slice A env sweep" | B11 Step 5 prose | **UNOWNED** (X10) |
| 36 | corporate `.env` dead-key check ← "group A's env sweep" | E §4 item 10 | **UNOWNED** (X20) |
| 37 | repo-wide ESLint no-increase guard ← owner decision | C20 row 1 re-escalates it | **UNOWNED** (X18) |
| 38 | `/affiliate` C14 measurement ← slice A item 3 | B3 Interfaces | **PROSE-ONLY / absent** (X9) |

**Totals: ENFORCED 11 · PROSE-ONLY 13 · BROKEN 4 · UNOWNED 6 · CONTRADICTED 3 (one already adjudicated) · UNDECLARED 1.**
**27 of the 38 cross-slice dependencies are not enforced by an assertion in the consuming step.**

The single highest-leverage structural fix: make every `Interfaces: Consumes` line that names another
slice's output resolve to a **variable read out of one shared record file**
(`/var/www/wavemax/cutover-logs/plan3-record.env` — slices A and E already use `/var/www/wavemax/cutover-logs/`,
slice C uses `$HOME/plan3-sliceC/`, slice B uses `/var/www/wavemax/cutover-logs/plan3-sliceB/`), with one
vocabulary for the values, and an asserting step — not a sentence.
