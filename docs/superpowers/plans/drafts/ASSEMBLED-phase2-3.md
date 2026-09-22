# Plan 3 — ASSEMBLED, Phases 2 and 3 (Tasks 16–24)

**Phase 2** — post-flip cleanup. **Phase 3** — the `@crhs/web-core` v0.3.0 release.
Assembled from `plan3-sliceB-cleanup.md` (B5–B13) and `plan3-sliceD-webcore.md` (D1–D11) against
`SKELETON.md` (ordering, binding) and `ADJUDICATION.md` (15 rulings, binding). Every finding in
`REVIEW-1-cross-slice.md` and `REVIEW-2-production-safety.md` that touches slice B or D is **fixed here**,
not noted. Task numbers are the skeleton's and are not negotiable.

Everything below marked **[MEASURED]** was verified read-only against the three working trees, the live
origins, and oci1 `161.153.71.201` / oci2 `144.24.4.202` on **2026-09-21**. Nothing on any box was changed.

---

## Conventions for Tasks 16–24

**R-1 is the spine.** Every `Consumes` row names the artefact **and** the numbered step whose command
proves it. A failing proof halts the task. There are **no prose dependencies** in this document.

**The shared record.** `REC=/var/www/wavemax/cutover-logs/plan3-record.env`, one file for the whole plan
(REVIEW-1's highest-leverage fix; X13). Keys are legal shell identifiers — host segments slugged with
`HK=${H//./_}` (**R-4**). Values use one vocabulary: `yes` / `no`.

> **Controller note.** Phases 2–3 never gate on a record *key name* alone. Every cross-phase precondition
> below is proved by a **probe of production or of the tree**, with the record check as a second, corroborating
> assertion. If the Phase-1 assembler chose different key names, reconcile them in the plan header — the
> probe is the binding gate and does not move.

**Probe rules.**
- Every on-box `:3000` probe carries `-H "X-Forwarded-Proto: https"`. Every `:3001` probe must **not** (**R-5**).
  [MEASURED] without it, `:3000/health` returns `302` and `embed-app-v2.html` returns an **empty body**.
- No byte-count or hash discriminator (**R-2**). The app discriminators for phases 2–3 are structural and were
  measured on oci1 today:

  | probe | portal (`:3000`) | content app (`:3001`) |
  |:--|:--|:--|
  | `GET /health` | `200` `text/html; charset=utf-8` | `200` `application/json; charset=utf-8` |
  | `GET /embed-app-v2.html` | `200` | `301` |
  | `GET /partner-program` | `200` | `404` |
  | `POST /api/affiliate-application` `{"firstName":""}` | `400`, **no** `"code":"partner.form.` | `400`, **with** `"code":"partner.form.` |

- Never `$?` after a pipe — it is always `0`. Use `${PIPESTATUS[0]}` or do not pipe (**R-6**).
- Any step that stops or reloads a service holds the one-box interlock and restores under `trap … EXIT`
  (**R-3**, X32): `BOX_BUSY` is asserted empty before, set, and cleared in the trap.

**Boot probes (P28 fix).** The form `node -e "require('./server.js'); process.exit(0)"; echo $?` appears **12
times** across the two drafts and is an assertion that cannot fail: `process.exit(0)` runs synchronously after
`require` returns, so every async failure (mongoose connect, `SystemConfig.initializeDefaults`, port bind,
job registration) is invisible. It is replaced everywhere by:
- **local (workstation)**: `node --check server.js` for parse + the task's own jest guard test, which drives the
  real app through supertest against `mongodb-memory-server` (`tests/setup.js`). The guard test **is** the boot
  proof, and it can fail.
- **on-box**: the async form on a spare port, with handlers, because pm2 already holds `3000`/`3001`:
  ```bash
  PORT=3099 NODE_ENV=production node -e '
    process.on("unhandledRejection", (e) => { console.log("BOOT_FAIL " + e); process.exit(1); });
    process.on("uncaughtException",  (e) => { console.log("BOOT_FAIL " + e.message); process.exit(1); });
    require("./server.js");
    setTimeout(() => { console.log("BOOT_OK"); process.exit(0); }, 2500);'
  ```
  [MEASURED] both `server.js` files honour `process.env.PORT` (affiliate `:35`, corporate `:167`).

**Two production windows only**, both **HUMAN-CONFIRM**, one box at a time:
- **Task 17 Step 9** — the affiliate reaches the boxes at Tasks 16+17 together, which is the moment
  `explorerGuard` leaves deployed code; the untracked explorer tree and the two `.env` keys must go in that
  same window (see Task 17's §"Why the box work is in this task").
- **Task 24** — the web-core release plus the affiliate code from Tasks 18 and 19.

Tasks 16, 18, 19 and 20–23 are **repo-only**; each states so and names the window that delivers it.

**Baselines [MEASURED] 2026-09-21** — re-measure at task start; a different number means an unrelated change
landed and must be explained before continuing.

| | value |
|:--|:--|
| affiliate `eslint server/` | **208** problems · `eslint server.js` **1** · combined **209** (155 auto-fixable) |
| affiliate known-red suites (GC 19) | `tests/unit/branding-guard.test.js` + `tests/unit/i18n-brand-token.test.js` → `Tests: 2 failed, 4 passed, 6 total` |
| affiliate locales | `23` top-level / `1362` leaves / `109` `partner.*` leaves, identical in en/es/pt/de |
| affiliate `PUBLIC_ENDPOINTS.length` | **14** |
| `public/design-explorer` | **5** tracked files, **150** on disk (145 under `render/`, gitignored at `.gitignore:244`), **6.6 MB** — same on **both** boxes |
| web-core full suite at `v0.2.1` (`768bfdb`) | `Test Suites: 35 passed` / `Tests: 579 passed` |
| web-core selectors | `tests/utils/cspHelper.test.js` **27** · `tests/utils/logger.test.js` **2** · `tests/email` **42** (`transport.test.js` 19) · `tests/assets` **14** (`i18n.test.js` 10, `bridgeOriginAllowlist.test.js` 4) · `tests/security`+`index.smoke` **90** (`cspGolden.test.js` 31) · `tests/brandNeutral.test.js` **1** |
| web-core exported surface | **26** keys; `wc.csrf` = `{ createCsrf, CSRF_COOKIE_NAME }` |
| affiliate `tests/unit/cspHelper.test.js` + `cspHelper.brand.test.js` | **20** |
| corporate `tests/contentHandler.test.js` | **57** |

**Commit trailer**, every commit: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
Never `--no-verify`. `madge --circular server/` = 0. One concern per commit; deletion-only commits may exceed
500 lines and say so.

**Settled owner decisions — implemented, never re-asked (R-14).**
- **Explorer: RETIRE.** Task 17 deletes it, `/api/concierge`, and **both** `EXPLORER_TOKEN` and
  `ANTHROPIC_API_KEY`. [MEASURED] `ANTHROPIC_API_KEY` has exactly one reader
  (`server/controllers/conciergeController.js:44`) → one route (`server.js:713`) → explorer-only clients.
  Retiring it stops the Haiku billing. Because the explorer goes, Task 18 retires **five** CSRF rows.
  B8 Step 4's `DECISION_EXPLORER=delete|keep` question and its `keep` branch are **deleted** (X27).
- **B-4:** the bridge literals die with the bridge (Task 19); `wavemax-language` → `app-language` **with** a
  migration shim (Task 22); the legal pages and `LICENSE` are **escalated to counsel and never edited**.
  The ask is **"delete or keep"**, not "review this text": [MEASURED] web-core's three `assets/legal/*.html`
  are **unreferenced dead copies** — corporate serves exactly two files from `assetsDir`
  (`crhs-corporate/server/webCoreAssets.js:10`: `i18n.js`, `language-switcher.js`) and the portal serves its
  own `public/` copies; nothing in either app resolves `assetsDir/legal`.

**Handed off, not silently dropped** (rows for the single escalation register, `docs/superpowers/ESCALATIONS.md`,
written by Task 35 — X13):
1. **Revoke the Anthropic API key at the vendor.** Task 17 removes it from both boxes; removal is not revocation.
2. **`{{nonce}}` on `public/administrator-dashboard-embed.html`** — [MEASURED] `:6` meta, `:8` a page-level
   `<meta http-equiv="Content-Security-Policy">` naming `'nonce-{{nonce}}'`, and ~10 `<script nonce="{{nonce}}">`.
   **No code substitutes `{{nonce}}`**; Task 20 confirms the page is untouched by the fix. Teaching `injectNonce`
   a second placeholder would change that page's CSP posture inside a release whose point is a nonce fix.
3. **`logger.flushAndExit` adoption** — `crhs-corporate/server.js:172-178` (inlined copy) and the affiliate's
   four bare `process.exit(1)` sites. One line each; belongs to whichever task edits those files.
4. **web-core `assets/legal/*.html` + `LICENSE`** — 40 brand-literal lines, delete-or-keep, counsel.
5. **`ratelimit_concierge`** — Task 17 deletes `conciergeLimiter`, whose store wrote that collection. Task 25
   owns the rate-limit sweep; the collection is left in place (never `drop()` on ADB).
6. **`jest.config.js:23 forceExit: true`** in the affiliate, against the project rule (X15 — owned by Task 26's
   series, not by phases 2–3; nothing here claims it closed).

**Three gaps in the skeleton, reported not patched** (see the closing note): slice B's **B12** (the portal's
in-code marketing-host surface), **B13** (the two known-red guard suites) and **B15** (`locationQuarantine`)
are owned by no task in the skeleton's 35. Tasks 16–24 therefore never assert "no `✕`" on the affiliate suite;
they state the two baseline reds by name and STOP on any third.

---

# Phase 2 — post-flip cleanup

**Phase gate.** Every task in this phase begins by proving **all six** flip tasks (9–14) are green on **both**
boxes for **all three** flippable hosts. Deleting the affiliate's marketing content one host early takes that
domain down: `partnerLanding` is what answers `/` on those hosts today.

---

### Task 16: [affiliate] delete the marketing surface the content app now owns

> Deletion-only; ≈1 400 lines removed, and that is the concern — one commit removes the marketing surface the
> content app now owns. **Repo-only:** committed and pushed here, delivered to the boxes in Task 17 Step 9.
> Nothing public changes at commit time, because nginx already routes the three hosts to `:3001`.

**Files:**
- Delete: `public/partner-program.html` (330), `public/affiliate.html` (336),
  `public/assets/css/partner-program.css` (281), `public/assets/css/affiliate.css` (191),
  `public/assets/js/partner-inquiry.js` (120), `public/assets/js/affiliate-inquiry.js` (85),
  `public/assets/images/affiliate-og.png`, `public/assets/images/locations/austin-tx/*` (5 `.webp`),
  `server/middleware/partnerLanding.js` (147).
- Delete: `tests/unit/partnerLanding.test.js`, `tests/unit/partnerInquiryForm.test.js`,
  `tests/unit/affiliateApplicationForm.test.js`, `tests/unit/interestFormEmailBranding.test.js`,
  `tests/integration/partnerProgramOpenAccess.test.js`, `tests/integration/marketingHostFallthrough.test.js`,
  `tests/helpers/wavemaxAllowlist.js`.
- Modify: `server.js` — the `partnerLanding` require + `app.use` ([MEASURED] `:371-372`), the `/affiliate` route
  (`:819-821`) and the marketing-host fall-through (`:1029-1036`, the block that reads
  `if (!partnerLanding._hosts.includes(host)) return next();`). **Locate all three by content**, not by line
  number, and re-assert the count after editing.
- Modify: `public/locales/{en,es,pt,de}/common.json` — remove the `partner` subtree (109 leaves each).
- Modify: `tests/unit/branding-guard.test.js` — drop the `EXCLUDED_FILES` / `EXCLUDED_PREFIXES` rows for the
  deleted paths (a row that outlives its reason is the defect Task 23 exists to prevent).
- Modify: `scripts/build-assets.js` — drop any row naming a deleted asset.
- Create: `tests/integration/marketingSurfaceRemoved.test.js`.

**Interfaces:**

*Consumes — every row asserted by the named step; failure halts the task (R-1):*

| # | consumed artefact | asserted by |
|:--|:--|:--|
| C16-1 | **Tasks 9–14: all six flips green** — each of 3 hosts × 2 boxes serves the content app | **Step 1** (nginx include counts + `/health` content-type + `/embed-app-v2.html` status, per box) |
| C16-2 | the typo host `runberglaundry.com` has nothing of its own to flip (brief D-2) | **Step 1b** (public `301` to `atxwashateria.com`) |
| C16-3 | **Task 2: `INTEREST_FORM_URL`** set on both boxes and reaching the client | **Step 2** (`.env` grep = 1 per box **and** the served meta equals the configured URL) |
| C16-4 | **Task 1: corporate deployed** and owning `/`, `/affiliate` and the intake endpoints | **Step 3** (`data-i18n` count, intake `"code":"partner.form.` marker) |
| C16-5 | **Task 4: the interest-form i18n layer** is live on the public origin | **Step 3** (`data-i18n` ≥ 90 on `https://atxwashdryfold.com/affiliate`) |
| C16-6 | the deletion set has no surviving consumer inside the affiliate | **Step 4** (set-difference grep, empty output) |

*Produces:*
- an affiliate app with no marketing surface; locales at **22** top-level keys / **1253** leaves per language,
  the four key sets still identical;
- `tests/integration/marketingSurfaceRemoved.test.js`;
- `REC` gets `T16_DONE=yes` and `T16_SHA=<sha>`, consumed by Tasks 17, 18, 19.
- **Measured consequence, recorded not hidden:** `portal.atxwashdryfold.com/partner-program` goes 200 → 404.
  [MEASURED] every surviving reference to `partner-program` in the affiliate tree is a file this task or Task 18
  deletes, except `tests/unit/ops/cutoverGateS1.test.js`, which probes the **corporate** app. Step 4 asserts that.

- [ ] **Step 1: the phase gate — all six flips, from both boxes, structurally.**

```bash
REC=/var/www/wavemax/cutover-logs/plan3-record.env
for IP in 161.153.71.201 144.24.4.202; do
  for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com; do
    printf '%s %-22s ' "$IP" "$H"
    ssh -i ~/.ssh/oci_wavemax ubuntu@"$IP" "
      printf 'content=%s portal=%s ' \
        \"\$(grep -c 'proxy-content-app.conf' /etc/nginx/sites-enabled/$H)\" \
        \"\$(grep -c 'proxy-node-app.conf'  /etc/nginx/sites-enabled/$H)\"
      curl -sk -m 10 --resolve $H:443:127.0.0.1 -o /dev/null -w 'health_ct=%{content_type} ' https://$H/health
      curl -sk -m 10 --resolve $H:443:127.0.0.1 -o /dev/null -w 'embed=%{http_code}\n' https://$H/embed-app-v2.html"
  done
done
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "grep -c '^HOST_DONE_.*=yes\$' $REC; grep -c '^ALL_HOSTS_FLIPPED=yes\$' $REC"
```
  - Expected: **six** lines, each ending exactly
    `content=1 portal=0 health_ct=application/json; charset=utf-8 embed=301`;
    then `6` and `1` from the record.
  - **[MEASURED] today, unflipped, the same command prints** `content=0 portal=1 health_ct=text/html; charset=utf-8 embed=200`
    on all six lines — so this gate reads differently on a healthy and a broken system, which is the point.
  - **Any** `content=0`, any `portal=1`, any `text/html`, any `embed=200` → **STOP.** That host is still on
    `:3000`; deleting `partnerLanding` would take it down. Do not record `T16_DONE`.
  - This replaces B8 Steps 1–2 entirely (X4, P10, P11): the old gate looped over a fourth host with no nginx
    file (`grep` → `0` forever, permanent deadlock), used `curl :3001 → 200` as flip proof (**[MEASURED] 200
    before the flip too**), and grepped `plan3-flips/lighthouse-per-host.txt`, which no task writes.

- [ ] **Step 1b: the typo host, asserted transitively (brief D-2).**

```bash
curl -s -o /dev/null -m 15 -w 'runberglaundry code=%{http_code} redir=%{redirect_url}\n' \
  "https://runberglaundry.com/?p=$(date +%s)"
```
  - Expected: `runberglaundry code=301 redir=https://atxwashateria.com/?p=<same stamp>` — [MEASURED] exactly this
    today. There is **no** `/etc/nginx/sites-enabled/runberglaundry.com` on either box; it is served transitively
    and has nothing to flip. A `200` here means it acquired its own server block: **STOP** and re-plan.

- [ ] **Step 2: `INTEREST_FORM_URL` is configured AND reaches the client (X1 — severity 1).**

```bash
for IP in 161.153.71.201 144.24.4.202; do
  printf '%s ' "$IP"
  ssh -i ~/.ssh/oci_wavemax ubuntu@"$IP" \
    "grep -c '^INTEREST_FORM_URL=https://atxwashdryfold.com/affiliate$' /var/www/wavemax/wavemax-affiliate-program/.env"
done
curl -s -m 20 "https://portal.atxwashdryfold.com/embed-app-v2.html?lh=$(date +%s)" \
  | grep -o '<meta name="interest-form-url"[^>]*>'
```
  - Expected: `161.153.71.201 1`, `144.24.4.202 1`, then exactly
    `<meta name="interest-form-url" content="https://atxwashdryfold.com/affiliate">`.
  - **[MEASURED] today this step FAILS, correctly**: the `.env` grep returns `0` on oci1 and the served meta reads
    `content="/affiliate"` — the `server/config/links.js:17` fallback, which resolves only through the
    `server.js:819` route **this task deletes**. Without Task 2 deployed, the invite-only programme's only public
    application link 404s while the test suite stays green. `content="/affiliate"` → **STOP**; Task 2 is not done.

- [ ] **Step 3: prove the content app answers what the affiliate is about to stop answering.**

```bash
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com; do
  for P in / /affiliate; do
    printf '%-22s %-10s ' "$H" "$P"
    curl -s -o /dev/null -m 15 -w '%{http_code}\n' "https://$H$P?lh=$(date +%s)"
  done
done
printf 'affiliate data-i18n = '
curl -s -m 20 "https://atxwashdryfold.com/affiliate?lh=$(date +%s)" | grep -c 'data-i18n'
printf 'intake code marker = '
curl -s -m 20 -X POST -H 'Content-Type: application/json' -d '{"firstName":""}' \
  https://atxwashdryfold.com/api/affiliate-application | grep -c '"code":"partner\.form\.'
```
  - Expected: six `200` lines; then `affiliate data-i18n = <n>` with **n ≥ 90**; then `intake code marker = 1`.
  - **[MEASURED] today `/affiliate` on `:3001` has ZERO `data-i18n`** — Task 4 has not landed. `0` → **STOP**:
    deleting the portal's copy would ship an English-only page as the only public application form, against the
    four-language rule. Any `404`/`502` → **STOP**.
  - `intake code marker = 1` is the structural proof that **corporate**, not the portal, owns
    `/api/affiliate-application` on this host. [MEASURED] corporate's validation errors carry
    `"code":"partner.form.err…"`; the portal's do not. `0` means the portal is still answering: **STOP.**
    (A plain `400`/`400` comparison does **not** discriminate — both apps return `400`.)

- [ ] **Step 4: prove the deletion set has no surviving consumer (set difference, not eyeball).**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
DELETED='^(public/partner-program\.html|public/affiliate\.html|public/assets/css/(partner-program|affiliate)\.css|public/assets/js/(partner|affiliate)-inquiry\.js|server/middleware/partnerLanding\.js|tests/unit/(partnerLanding|partnerInquiryForm|affiliateApplicationForm|interestFormEmailBranding)\.test\.js|tests/integration/(partnerProgramOpenAccess|marketingHostFallthrough)\.test\.js|tests/helpers/wavemaxAllowlist\.js|server\.js|scripts/build-assets\.js|tests/unit/branding-guard\.test\.js)$'
git grep -lI -E 'partner-program|partnerLanding|wavemaxAllowlist' -- server server.js public tests scripts \
  | grep -vE "$DELETED" | grep -v '^tests/unit/ops/cutoverGateS1\.test\.js$'
echo "UNEXPECTED_CONSUMERS=${PIPESTATUS[0]}"
git grep -lI -E "'partner\.|\"partner\.|data-i18n=\"partner\." -- public server server.js \
  | grep -vE "$DELETED"
echo "UNEXPECTED_PARTNER_KEYS=${PIPESTATUS[0]}"
```
  - Expected: both lists print **nothing**, and both counters print `UNEXPECTED_…=1` (grep's no-match status).
    `${PIPESTATUS[0]}` is mandatory — `$?` after a pipe is always `0` (**R-6**).
  - `tests/unit/ops/cutoverGateS1.test.js` is excluded **by name and with a reason**: [MEASURED] it references
    `partner-program` only to assert the **corporate** app's output through the Plan 2 cutover gate, and it stays.
  - Any other path is a **STOP**.

- [ ] **Step 5: write the failing guard test (TDD — red first, for the right reason).**
      Create `tests/integration/marketingSurfaceRemoved.test.js` asserting:
      (a) each of the nine deleted source paths does **not** exist;
      (b) `server.js` contains no `partnerLanding` and no `'/affiliate'` route literal;
      (c) `GET /` on Host `rundberglaundry.com` no longer returns the partner page — it falls through exactly as a
      non-marketing host does (drive the real app through `supertest`, which is also this task's boot proof, P28);
      (d) each locale file has **22** top-level keys, **1253** leaves and no `partner` key;
      (e) the four locale key sets are identical (`expect(keys.es).toEqual(keys.en)` for each);
      (f) `tests/unit/branding-guard.test.js` names no path that no longer exists.

- [ ] **Step 6: run it red.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npx jest tests/integration/marketingSurfaceRemoved.test.js 2>&1 | tail -30
```
  - Expected: every test in the file failing, the first being
    `public/partner-program.html does not exist` → `Expected: false / Received: true`.
    A `Tests: 0 total` means the file was not written — **STOP** (P18's defect class).

- [ ] **Step 7: delete.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git rm -q public/partner-program.html public/affiliate.html \
  public/assets/css/partner-program.css public/assets/css/affiliate.css \
  public/assets/js/partner-inquiry.js public/assets/js/affiliate-inquiry.js \
  public/assets/images/affiliate-og.png server/middleware/partnerLanding.js \
  tests/unit/partnerLanding.test.js tests/unit/partnerInquiryForm.test.js \
  tests/unit/affiliateApplicationForm.test.js tests/unit/interestFormEmailBranding.test.js \
  tests/integration/partnerProgramOpenAccess.test.js tests/integration/marketingHostFallthrough.test.js \
  tests/helpers/wavemaxAllowlist.js
git rm -q -r public/assets/images/locations
node -e '
const fs = require("fs");
for (const l of ["en","es","pt","de"]) {
  const p = `public/locales/${l}/common.json`;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  if (!j.partner) throw new Error("no partner subtree in " + p);
  delete j.partner;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
}'
```
  Then hand-edit, locating each region **by content**:
  - `server.js` — remove the `partnerLanding` require + `app.use`, the `/affiliate` route and the
    marketing-host fall-through block;
  - `scripts/build-assets.js` — any row naming a deleted asset;
  - `tests/unit/branding-guard.test.js` — the `EXCLUDED_FILES` rows `server/middleware/partnerLanding.js`,
    `tests/unit/partnerLanding.test.js`, `tests/unit/affiliateApplicationForm.test.js`,
    `tests/unit/partnerInquiryForm.test.js`, and any `EXCLUDED_PREFIXES` row now empty of matching files.

```bash
node -e 'const fs=require("fs");const L=(o,p="")=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==="object"?L(v,p+k+"."):[p+k]);
for (const l of ["en","es","pt","de"]) { const j=JSON.parse(fs.readFileSync(`public/locales/${l}/common.json`,"utf8"));
  console.log(l, Object.keys(j).length, L(j).length, "partner" in j); }'
printf 'partnerLanding in server.js = '; grep -c partnerLanding server.js || true
printf 'affiliate route in server.js = '; grep -c "'/affiliate'" server.js || true
node --check server.js && echo SYNTAX_OK
```
  - Expected: four lines each `<lang> 22 1253 false`; then `partnerLanding in server.js = 0`;
    `affiliate route in server.js = 0`; then `SYNTAX_OK`.

- [ ] **Step 8: green, plus the two named baseline reds and nothing else.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npx jest tests/integration/marketingSurfaceRemoved.test.js tests/integration/interestFormLink.test.js \
         tests/integration/embedRoutes.test.js tests/integration/locationQuarantine.test.js \
         tests/unit/domain-guard.test.js 2>&1 | grep -E '^(Tests:|Test Suites:)|✕'
npx jest tests/unit/branding-guard.test.js 2>&1 | grep -E '^\s+\+\s+"' | sed 's/.*+ *//' | tr -d '",' \
  | awk -F: '{c[$1]++} END {for (f in c) printf "%3d %s\n", c[f], f}' | sort -k2
node -e 'const fs=require("fs");const L=(o,p="")=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==="object"?L(v,p+k+"."):[[p+k,v]]);
for (const l of ["en","es","pt","de"]) { const j=JSON.parse(fs.readFileSync(`public/locales/${l}/common.json`,"utf8"));
  console.log(l, L(j).filter(([k,v])=>typeof v==="string"&&/wavemax/i.test(v)).map(([k])=>k).join(",")); }'
npm run check:i18n 2>&1 | tail -3
npx madge --circular server/ 2>&1 | tail -2
npx eslint server/ 2>&1 | grep -E 'problems?' | tail -1
```
  - Expected, in order:
    1. a `Tests:` line with **no** `✕` across the five selected suites (`interestFormLink.test.js` is Task 2's);
    2. the branding-guard offender table **exactly**
       ```
        15 scripts/ops/cutover-gate.sh
         1 tests/integration/webCoreConsumptionGolden.test.js
         8 tests/unit/ops/cutoverGateS1.test.js
       ```
       (24 lines, 3 files). **[MEASURED] today it is these three plus `8 tests/helpers/wavemaxAllowlist.js`**, which
       this task deletes — so the table is the proof the deletion landed. Any **other** file → **STOP**;
    3. four lines each reading exactly `<lang> landing.footer.fulfillmentPartner` — one key, the owner-approved
       disclaimer. `partner.footer.fulfillmentPartner` went with the subtree. [MEASURED] today each line reads
       `landing.footer.fulfillmentPartner,partner.footer.fulfillmentPartner`;
    4. `check:i18n` OK; `✔ No circular dependency found!`; `✖ 208 problems` or **fewer** — a decrease is fine and is
       recorded, an **increase** is a STOP.
  - **`tests/unit/branding-guard.test.js` and `tests/unit/i18n-brand-token.test.js` remain RED.** They are the two
    GC-19 baseline failures and **no task in the skeleton closes them** (slice B's B13 is unowned — see the closing
    note). This task must not paper over them; items 2 and 3 above pin their *exact* residual shape so a third
    failure cannot hide behind "the two known reds".

- [ ] **Step 9: commit, push, record.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git add -A public server server.js scripts/build-assets.js tests
git commit -m "chore: delete the marketing surface the content app now owns (Plan 3 item 8)

All three flippable marketing hosts are served by crhs-corporate on :3001 on both
boxes -- proven by nginx include counts, an application/json /health content type and
a 301 on /embed-app-v2.html -- so the portal's copies are dead weight. Removes
partner-program.html, the interest form, their CSS/JS/images, partnerLanding and the
marketing-host fall-through, the partner.* locale subtree (109 leaves x 4; locales now
22 top-level keys / 1253 leaves) and six tests that existed only to cover them, plus
the branding-guard exclusion rows those files owned.

Proven before deletion: INTEREST_FORM_URL is set on both boxes and the served
interest-form-url meta equals it (without that the invite-only programme's only public
application link 404s); the content app answers / and /affiliate 200 on all three
hosts with a translated interest form; and /api/affiliate-application is answered by
corporate, identified by the \"code\":\"partner.form.*\" markers only it emits.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
SHA=$(git rev-parse HEAD); echo "T16_SHA=$SHA"
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 \
  "printf 'T16_DONE=%s\nT16_SHA=%s\n' yes $SHA >> /var/www/wavemax/cutover-logs/plan3-record.env"
```
  - Expected: one commit; `git show --stat HEAD | tail -1` reporting ≥ 20 files changed with deletions far
    exceeding insertions; a pushed `main`; `T16_SHA=<40 hex>`.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git revert --no-edit HEAD && git log --oneline -1
ls public/partner-program.html public/affiliate.html server/middleware/partnerLanding.js
node -e 'const j=require("./public/locales/en/common.json");console.log(Object.keys(j).length, "partner" in j)'
node --check server.js && echo SYNTAX_OK
npx jest tests/unit/branding-guard.test.js tests/unit/i18n-brand-token.test.js 2>&1 | grep -E '^Tests:'
```
- Rollback expected: the revert commit; the three paths listed; `23 true`; `SYNTAX_OK`;
  `Tests: 2 failed, 4 passed, 6 total` — back to the GC-19 baseline.
- **Not deployed by this task**, so there is no box-side rollback. If Task 17 Step 9 has already delivered it,
  roll back as a pair with Task 17: pull the reverts on both boxes and `pm2 reload wavemax --update-env`
  (`server.js` changed, so a plain pull is not enough). The marketing hosts do **not** return to `:3000` by this
  rollback — that is the per-host `include` swap in Tasks 9–14 (**R-12**).
- A revert of this commit after Task 18 conflicts on `server.js`; resolve by keeping Task 18's deletions
  (`git revert -n`, then resolve `server.js` by hand) — and note that Task 2's `A2` sibling has the mirror
  hazard on `public/partner-program.html` (X24).

---

### Task 17: [affiliate] retire the design explorer, the concierge, and both of their credentials

> The owner decided: **retire.** This task implements it (**R-14**); there is no "keep" branch and no second
> question. [MEASURED] `ANTHROPIC_API_KEY` has one reader → one route → explorer-only clients, so retiring the
> explorer is what stops the Haiku billing.
>
> **Why the box work is in this task.** `server/middleware/explorerGuard.js` is what makes
> `/design-explorer/*` 404 to the public today. [MEASURED] `public/design-explorer` holds **150** files on both
> boxes, of which only **5 are tracked** — the other **145** (6.5 MB of rendered marketing mock-ups) live under
> `render/`, which is **gitignored** at `.gitignore:244`. A `git pull` of this commit therefore removes five
> files and leaves 145 behind **with their guard deleted**, and `express.static` would serve every one of them
> publicly. So the deployment of Tasks 16+17 and the `rm -rf` of the untracked tree must happen in one window,
> before the reload. Slice B's draft left both halves to "slice A's env sweep", which disclaims them (X10).

**Files:**
- Delete: `public/design-explorer/` (5 tracked files; the 145 untracked ones are removed by path, locally and on
  both boxes), `server/middleware/explorerGuard.js` (75), `server/controllers/conciergeController.js` (141),
  `server/services/conciergeFaq.js` (91), `tests/unit/design-explorer/` (6 files, 651 lines).
- Modify: `server.js` — the `explorerGuard` mount ([MEASURED] `:648-649`) and the concierge block (`:704-713`,
  comment through `app.post('/api/concierge', …)`). Locate by content.
- Modify: `server/middleware/rateLimiting.js` — remove `conciergeLimiter` ([MEASURED] `:317-337`, comment
  through the closing `});`).
- Modify: `.gitignore` — remove `public/design-explorer/render/` (`:244`), the row whose subject no longer exists.
- Modify: `.env.example` (**HUMAN-CONFIRM**) — remove `EXPLORER_TOKEN` (`:203`) **and its 5-line comment block**
  (`:198-202`) and `ANTHROPIC_API_KEY` (`:213`) **and its 2-line comment block** (`:211-212`). `EXPEDITER_TOKEN`
  and its comment **stay** — a different, live feature.
- Modify: `tests/unit/branding-guard.test.js` — drop the `EXCLUDED_FILES` rows
  `server/controllers/conciergeController.js`, `server/services/conciergeFaq.js` and the three design-explorer
  `EXCLUDED_PREFIXES`.
- Create: `tests/unit/explorerRetired.test.js`.
- Box only (Step 9): `/var/www/wavemax/wavemax-affiliate-program` (`git pull`, `rm -rf public/design-explorer`),
  its `.env`, `/var/www/wavemax/env-backups/.env.<TS>`.
- **Not touched:** `server/config/csrfTables.js` and `tests/unit/csrfTables.test.js`. Its `PLAN 3 GUARD`
  ([MEASURED] `tests/unit/csrfTables.test.js:56-72`) pins **all five** rows together with
  `expect(tables.PUBLIC_ENDPOINTS).toContain(endpoint)`, so removing one row here reds that suite. Task 18
  retires all five in one commit. A CSRF exemption on a path that 404s is inert for exactly one task.

**Interfaces:**

*Consumes — every row asserted; failure halts the task:*

| # | consumed artefact | asserted by |
|:--|:--|:--|
| C17-1 | **Task 16 landed** in the repo (its guard is green) | **Step 1** (`T16_SHA` is an ancestor of `HEAD` **and** `marketingSurfaceRemoved.test.js` passes) |
| C17-2 | all six flips still green (the phase gate, re-asserted because Step 9 reloads the portal) | **Step 1** (the Task 16 Step 1 gate, re-run) |
| C17-3 | the concierge has exactly one client and it is inside the deletion set | **Step 2** (set-difference grep, empty output) |
| C17-4 | `ANTHROPIC_API_KEY` has exactly one reader | **Step 2** (`git grep -c` = 1, in `conciergeController.js`) |
| C17-5 | the untracked `render/` tree exists on both boxes and is gitignored | **Step 2b** (per-box `find … | wc -l` = 150, tracked = 5, `git check-ignore -v`) |
| C17-6 | no other box is mid-deploy (**R-3**, X32) | **Step 9** (`BOX_BUSY` empty, then set under `trap … EXIT`) |

*Produces:*
- no design explorer, no `/api/concierge`, no `conciergeLimiter`, no `explorerGuard` in the repo or on either box;
- `EXPLORER_TOKEN` and `ANTHROPIC_API_KEY` absent from `.env.example` **and** from both boxes' `.env`
  (exit criterion 5), with a post-purge `.env` baseline recorded for rollback (**R-11**);
- `/design-explorer/` and `/design-explorer/render/<any>` return **404** publicly from both boxes;
- `REC` gets `T17_DONE=yes`, `T17_SHA`, `ENV_BASELINE_TS_<box>`, `RELOAD_TS_AFF_T17_<box>`;
- a handed-off escalation row: **revoke the Anthropic key at the vendor** (removal ≠ revocation).

- [ ] **Step 1: gate on Task 16 and re-assert the flips.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
REC=/var/www/wavemax/cutover-logs/plan3-record.env
T16_SHA=$(ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "sed -n 's/^T16_SHA=//p' $REC" | tail -1)
test -n "$T16_SHA" || { echo 'STOP: no T16_SHA in the record'; exit 1; }
git merge-base --is-ancestor "$T16_SHA" HEAD && echo "T16_ANCESTOR=yes"
npx jest tests/integration/marketingSurfaceRemoved.test.js 2>&1 | grep -E '^Tests:'
```
  - Expected: `T16_ANCESTOR=yes`, then a `Tests:` line with `failed` absent. A missing `T16_SHA`, a non-ancestor,
    or a red guard → **STOP**: this task's box step reloads the portal onto Task 16's code.
  - Then **re-run Task 16 Step 1 verbatim** and require the same six `content=1 portal=0
    health_ct=application/json; charset=utf-8 embed=301` lines. Anything else → **STOP.**

- [ ] **Step 2: prove the blast radius is exactly the deletion set.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
KEEP='^(server\.js|server/config/csrfTables\.js|server/middleware/rateLimiting\.js|server/middleware/explorerGuard\.js|server/controllers/conciergeController\.js|server/services/conciergeFaq\.js|tests/unit/branding-guard\.test\.js|tests/unit/design-explorer/.*|public/design-explorer/.*|\.env\.example)$'
git grep -lI -E 'api/concierge|conciergeLimiter|conciergeController|conciergeFaq|explorerGuard|EXPLORER_TOKEN|ANTHROPIC_API_KEY|design-explorer' \
  -- public server server.js tests scripts .env.example | grep -vE "$KEEP"
echo "OUTSIDE_DELETION_SET=${PIPESTATUS[0]}"
printf 'ANTHROPIC readers = '; git grep -l 'ANTHROPIC_API_KEY' -- server server.js public | tr '\n' ' '; echo
git grep -n 'ANTHROPIC_API_KEY' -- server | head -3
printf 'concierge clients under public/ = '
git grep -lI 'api/concierge' -- public | tr '\n' ' '; echo
```
  - Expected: the first list prints **nothing** and `OUTSIDE_DELETION_SET=1`; then
    `ANTHROPIC readers = server/controllers/conciergeController.js` (one path) and one grep line at
    [MEASURED] `:44`; then
    `concierge clients under public/ = public/design-explorer/concierge-client.js` — one client, inside the
    deletion set.
  - A hit in any surviving `public/*.html` would mean a live page embeds the concierge: **STOP.**
  - More than one `ANTHROPIC_API_KEY` reader falsifies the owner's premise that retiring the explorer stops the
    billing: **STOP** and escalate before deleting the key.

- [ ] **Step 2b: prove the untracked tree, on both boxes.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
printf 'local tracked=%s on_disk=%s\n' "$(git ls-files public/design-explorer | wc -l)" "$(find public/design-explorer -type f | wc -l)"
git check-ignore -v public/design-explorer/render | head -1
for IP in 161.153.71.201 144.24.4.202; do
  printf '%s ' "$IP"
  ssh -i ~/.ssh/oci_wavemax ubuntu@"$IP" 'cd /var/www/wavemax/wavemax-affiliate-program && \
    printf "tracked=%s on_disk=%s size=%s\n" "$(git ls-files public/design-explorer | wc -l)" \
      "$(find public/design-explorer -type f | wc -l)" "$(du -sh public/design-explorer | cut -f1)"'
done
for P in /design-explorer/ /design-explorer/render/austin-bold-heavy-about-en.html; do
  printf '%-56s ' "$P"; curl -s -o /dev/null -m 15 -w '%{http_code}\n' "https://portal.atxwashdryfold.com$P?lh=$(date +%s)"
done
```
  - Expected: `local tracked=5 on_disk=150`; `.gitignore:244:public/design-explorer/render/ …`; then
    `161.153.71.201 tracked=5 on_disk=150 size=6.6M` and the same for oci2; then `404` for both public paths.
    **[MEASURED] all of it, today.**
  - `tracked == on_disk` on a box would mean the render tree is not there and Step 9's `rm -rf` is a no-op —
    record that and keep the `rm -rf` anyway (it is idempotent). A `200` on either public path **now** means
    `explorerGuard` is already not doing its job: **STOP** and report.

- [ ] **Step 3: write the failing guard test.** Create `tests/unit/explorerRetired.test.js` asserting:
      the five paths (`public/design-explorer`, `server/middleware/explorerGuard.js`,
      `server/controllers/conciergeController.js`, `server/services/conciergeFaq.js`,
      `tests/unit/design-explorer`) do **not** exist; `server.js` matches neither `explorerGuard` nor `concierge`;
      `require('../../server/middleware/rateLimiting').conciergeLimiter` is `undefined`;
      `POST /api/concierge` returns **404** through `supertest` (this is also the boot proof, P28);
      `GET /design-explorer/index.html` and `GET /design-explorer/render/austin-bold-heavy-about-en.html` return
      **404** *with* a `?k=<anything>` query as well as without;
      `.env.example` matches neither `EXPLORER_TOKEN` nor `ANTHROPIC_API_KEY` **nor** `design-explorer` **nor**
      `concierge` (the orphan-comment check);
      `.gitignore` does not contain `public/design-explorer/render/`.
      It must **not** assert anything about `PUBLIC_ENDPOINTS` — that is Task 18's.

- [ ] **Step 4: run it red.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npx jest tests/unit/explorerRetired.test.js 2>&1 | tail -30
```
  - Expected: every test failing, the first being `public/design-explorer does not exist` →
    `Expected: false / Received: true`. `Tests: 0 total` → the file was not written: **STOP.**

- [ ] **Step 5: delete — tracked, untracked, and the gitignore row.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git rm -q -r public/design-explorer tests/unit/design-explorer
git rm -q server/middleware/explorerGuard.js server/controllers/conciergeController.js server/services/conciergeFaq.js
rm -rf public/design-explorer                     # the 145 gitignored render files git rm cannot see
sed -i '\|^public/design-explorer/render/$|d' .gitignore
printf 'dir gone = %s\n' "$([ -e public/design-explorer ] && echo no || echo yes)"
printf 'gitignore row = %s\n' "$(grep -c 'design-explorer' .gitignore || true)"
```
  - Expected: `dir gone = yes`, `gitignore row = 0`.
  Then hand-edit, by content: `server.js` (both regions), `server/middleware/rateLimiting.js`
  (`conciergeLimiter` + its comment), `tests/unit/branding-guard.test.js` (the five stale rows).

```bash
printf 'server.js hits = %s\n' "$(grep -cE 'concierge|explorerGuard' server.js || true)"
node -e 'console.log("conciergeLimiter:", typeof require("./server/middleware/rateLimiting").conciergeLimiter)'
node -e 'const t=require("./server/config/csrfTables");console.log("PUBLIC_ENDPOINTS =",t.PUBLIC_ENDPOINTS.length,"| concierge row still present:",t.PUBLIC_ENDPOINTS.includes("/api/concierge"))'
node --check server.js && echo SYNTAX_OK
```
  - Expected: `server.js hits = 0`; `conciergeLimiter: undefined`;
    `PUBLIC_ENDPOINTS = 14 | concierge row still present: true` — **deliberate**, Task 18 retires it with the
    other four; then `SYNTAX_OK`.

- [ ] **Step 6 (HUMAN-CONFIRM): `.env.example` loses both keys and both comment blocks.** Say exactly this:
  > `.env.example` loses `EXPLORER_TOKEN` and `ANTHROPIC_API_KEY` together with the comment blocks that describe
  > them — five lines above `EXPLORER_TOKEN`, two above `ANTHROPIC_API_KEY`. Both subsystems are deleted in this
  > commit, so nothing reads either key. `EXPEDITER_TOKEN` and its comment stay: different feature, still live.
  > Step 9 removes both keys from the production `.env` on both boxes, one box at a time, with a backup.
  > Removing the Anthropic key stops the app using it; it does **not** revoke it at the vendor — that goes on the
  > escalation register. Proceed?

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
# delete each key together with the contiguous comment block immediately above it
perl -0pi -e 's/(?:^#[^\n]*\n)*^EXPLORER_TOKEN=[^\n]*\n//m; s/(?:^#[^\n]*\n)*^ANTHROPIC_API_KEY=[^\n]*\n//m' .env.example
grep -cE '^(EXPLORER_TOKEN|ANTHROPIC_API_KEY)=' .env.example || true
grep -ciE 'design-explorer|concierge' .env.example || true
grep -c '^EXPEDITER_TOKEN=' .env.example
```
  - Expected: `0`, `0`, `1` — both keys gone, **no orphan comment describing a removed key**, and
    `EXPEDITER_TOKEN` untouched. A non-zero second number means a comment block outlived its key: fix it here.
    (A bare `sed -i '/^KEY=/d'` leaves seven such lines; that is why this uses `perl -0`.)

- [ ] **Step 7: verify locally and commit.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npx jest tests/unit/explorerRetired.test.js tests/unit/csrfTables.test.js \
         tests/unit/rateLimitingMiddleware.test.js tests/integration/csrf.test.js 2>&1 | grep -E '^(Tests:|Test Suites:)|✕'
npx jest tests/unit/branding-guard.test.js 2>&1 | grep -E '^\s+\+\s+"' | sed 's/.*+ *//' | tr -d '",' \
  | awk -F: '{c[$1]++} END {for (f in c) printf "%3d %s\n", c[f], f}' | sort -k2
npx madge --circular server/ 2>&1 | tail -2
npx eslint server/ 2>&1 | grep -E 'problems?' | tail -1
git count-objects -vH | grep size-pack
```
  - Expected: a `Tests:` line with no `✕` across the four suites (`csrfTables.test.js` still green — the five
    rows are intact); the branding-guard table unchanged from Task 16 Step 8 item 2 (the three cutover-tooling
    files, 24 lines); `✔ No circular dependency found!`;
    `✖ 199 problems` — [MEASURED] the deleted files carry **9** lint errors, so 208 − 9 = 199. Any value **above**
    208 is a STOP; a different decrease is recorded and explained; then `size-pack` printed for the record (git
    history keeps the 5 tracked files; the 145 untracked ones were never in it, so the pack barely moves).

```bash
git add -A public server server.js tests .env.example .gitignore
git commit -m "chore: retire the design explorer, the concierge and both of their credentials

Owner decision, already settled: the explorer's design reviews are shipped (the Austin
Bold skin is live) and its only remaining client was the concierge panel, the sole
client of /api/concierge. Deletes the explorer tree, explorerGuard, conciergeController,
conciergeFaq, conciergeLimiter, six explorer test files, the two now-dead .env.example
keys with their comment blocks, and the .gitignore row for a directory that no longer
exists. Removes the portal's last paid-LLM endpoint: ANTHROPIC_API_KEY had exactly one
reader (conciergeController.js:44) feeding one route, so this is what stops the billing.

145 of the 150 explorer files live under public/design-explorer/render/, which was
gitignored -- git rm cannot see them, and with explorerGuard deleted express.static
would have served every one of them publicly. They are removed by path here and on both
boxes in the same window as the deploy, before the reload.

/api/concierge's CSRF exemption row is deliberately left standing: csrfTables.test.js's
PLAN 3 GUARD pins all five retired rows together, so splitting them reds that suite. The
next task retires all five with the intake routes; an exemption on a 404 path is inert.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
SHA=$(git rev-parse HEAD); echo "T17_SHA=$SHA"
```
  - Expected: one commit, pushed; `T17_SHA=<40 hex>`.

- [ ] **Step 8: record the vendor-revocation escalation** (so the credential is not "handled" by deletion alone).

```bash
REC=/var/www/wavemax/cutover-logs/plan3-record.env
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "printf '%s\n' \
  'ESCALATE_ANTHROPIC_KEY_REVOKE=yes' \
  'ESCALATE_ANTHROPIC_KEY_NOTE=removed_from_both_boxes_in_T17_not_revoked_at_vendor' >> $REC"
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "grep -c '^ESCALATE_ANTHROPIC_KEY_REVOKE=yes$' $REC"
```
  - Expected: `1`. Task 35 turns this into a row in `docs/superpowers/ESCALATIONS.md`.

- [ ] **Step 9 (HUMAN-CONFIRM): the Phase-2 production window — one box, then the other.**
  Say exactly this before the first box:
  > This is the first of two production windows in Plan 3 phases 2–3. On one box at a time it pulls the affiliate
  > to Task 17's commit (which also delivers Task 16), deletes the 145 untracked explorer files, removes
  > `EXPLORER_TOKEN` and `ANTHROPIC_API_KEY` from that box's `.env` with a timestamped backup, boot-probes on a
  > spare port, and reloads `wavemax`. Blast radius while broken: the portal on this box; the CF LB monitor
  > (`/health/origin`) fails it over to the peer. The marketing hosts are unaffected — they are on `:3001`.
  > Proceed with `oci1`?

```bash
BOX=oci1; IP=161.153.71.201          # Pass 2: BOX=oci2; IP=144.24.4.202
REC=/var/www/wavemax/cutover-logs/plan3-record.env
D=/var/www/wavemax/wavemax-affiliate-program
# --- interlock: one box degraded at a time (R-3 / X32) ---
BUSY=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "sed -n 's/^BOX_BUSY=//p' $REC | tail -1")
test -z "$BUSY" || { echo "STOP: BOX_BUSY=$BUSY"; exit 1; }
trap 'ssh -i ~/.ssh/oci_wavemax ubuntu@'"$IP"' "printf '"'"'BOX_BUSY=\n'"'"' >> '"$REC"'"' EXIT
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "printf 'BOX_BUSY=%s\n' $BOX >> $REC"
# --- baseline + snapshot ---
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y-%m-%dT%H%M%S'); echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
  cd $D
  pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>JSON.parse(s).filter(a=>a.name===\"wavemax\").forEach(a=>console.log(\"before\",a.name,a.pm2_env.status,a.pm2_env.restart_time)))'
  git rev-parse --short HEAD
  mkdir -p ~/deploy-snapshots
  tar -C $D -czf ~/deploy-snapshots/design-explorer-$TS.tgz public/design-explorer
  ls -l ~/deploy-snapshots/design-explorer-$TS.tgz
  mkdir -p /var/www/wavemax/env-backups
  cp -a $D/.env /var/www/wavemax/env-backups/.env.$TS && wc -l < /var/www/wavemax/env-backups/.env.$TS"
```
  - Expected: `TS=<stamp>`; `before wavemax online <n>` (record `<n>`); the current short sha; one `-rw-` line for
    the explorer tarball with non-zero size; the `.env` line count.
  - **R-11 note:** `/var/www/wavemax/env-backups/.env.$TS` **contains the Anthropic key**. It is a
    credential-bearing artefact: it is the rollback source until the owner signs the task off, and is then
    shredded (`shred -u`). Never restore a **pre**-purge `.env` after a later purge task has run.

```bash
# --- deliver + purge, in one ssh under set -e ---
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
  cd $D
  git pull --ff-only
  test \"\$(git rev-parse HEAD)\" = '$SHA' && echo HEAD_MATCHES_T17
  rm -rf public/design-explorer
  test ! -e public/design-explorer && echo EXPLORER_TREE_GONE
  grep -vE '^(EXPLORER_TOKEN|ANTHROPIC_API_KEY)=' .env > .env.new
  printf 'removed=%s\n' \$(( \$(wc -l < .env) - \$(wc -l < .env.new) ))
  mv .env.new .env && chmod 600 .env
  grep -cE '^(EXPLORER_TOKEN|ANTHROPIC_API_KEY)=' .env || true
  grep -c '^EXPEDITER_TOKEN=' .env"
```
  - Expected: the pull summary; `HEAD_MATCHES_T17`; `EXPLORER_TREE_GONE`; `removed=2`; then `0`; then `1`.
    `removed` anything but `2` → **STOP** and restore `.env` from the backup; do not reload.

```bash
# --- boot probe on a spare port BEFORE any reload (P28 form) ---
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "cd $D && PORT=3099 NODE_ENV=production node -e '
  process.on(\"unhandledRejection\", (e) => { console.log(\"BOOT_FAIL \" + e); process.exit(1); });
  process.on(\"uncaughtException\",  (e) => { console.log(\"BOOT_FAIL \" + e.message); process.exit(1); });
  require(\"./server.js\");
  setTimeout(() => { console.log(\"BOOT_OK\"); process.exit(0); }, 2500);'"
```
  - Expected: `BOOT_OK`. Any `BOOT_FAIL` → **STOP**, run the rollback, do not reload. The spare port is required:
    pm2 holds `3000`, so the old synchronous probe could not have detected a bind failure anyway.

```bash
# --- reload and verify ---
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%FT%T; pm2 reload wavemax --update-env'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'until curl -sf -m 5 -o /dev/null -H "Host: portal.atxwashdryfold.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/health; do sleep 2; done; echo HEALTH_UP'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "
  curl -s -o /dev/null -m 10 -w 'portal-health %{http_code}\n'  -H 'Host: portal.atxwashdryfold.com' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/health
  curl -s -o /dev/null -m 10 -w 'health-origin %{http_code}\n' -H 'Host: portal.atxwashdryfold.com' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/health/origin
  curl -s -o /dev/null -m 10 -w 'explorer      %{http_code}\n' -H 'Host: portal.atxwashdryfold.com' -H 'X-Forwarded-Proto: https' 'http://127.0.0.1:3000/design-explorer/index.html?k=anything'
  curl -s -o /dev/null -m 10 -w 'render        %{http_code}\n' -H 'Host: portal.atxwashdryfold.com' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/design-explorer/render/austin-bold-heavy-about-en.html
  curl -s -o /dev/null -m 10 -w 'concierge     %{http_code}\n' -X POST -H 'Content-Type: application/json' -H 'Host: portal.atxwashdryfold.com' -H 'X-Forwarded-Proto: https' -d '{\"message\":\"x\"}' http://127.0.0.1:3000/api/concierge
  curl -s -o /dev/null -m 10 -w 'partnerprog   %{http_code}\n' -H 'Host: portal.atxwashdryfold.com' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/partner-program
  pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>JSON.parse(s).filter(a=>a.name===\"wavemax\").forEach(a=>console.log(\"after\",a.name,a.pm2_env.status,a.pm2_env.restart_time)))'"
```
  - Expected: `HEALTH_UP`; then `portal-health 200`, `health-origin 200`, `explorer 404`, `render 404`,
    `concierge 404`, `partnerprog 404`; then `after wavemax online <n+1 at most>`.
    A climbing `restart_time` is a crash loop: **STOP**, roll back.
    `partnerprog 404` is Task 16's measured consequence on the **portal** host; it is expected here and was
    proved consumer-free in Task 16 Step 4.
  - Every `:3000` probe above carries `X-Forwarded-Proto: https`; without it [MEASURED] each returns `302` and a
    `404` would be indistinguishable from a redirect (**R-5**).

```bash
# --- record, then release the interlock via the trap ---
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "printf 'ENV_BASELINE_TS_%s=%s\nRELOAD_TS_AFF_T17_%s=%s\nT17_BOX_DONE_%s=yes\n' \
  $BOX $TS $BOX \"\$(date -u +%FT%T)\" $BOX >> $REC"
```
  - Then repeat the whole of Step 9 for `oci2`. **Never both boxes in the same window.**
  - Finally, from the workstation, confirm the public surface on both boxes through Cloudflare:
```bash
for P in /design-explorer/ /design-explorer/render/austin-bold-heavy-about-en.html; do
  printf '%-56s ' "$P"; curl -s -o /dev/null -m 15 -w '%{http_code}\n' "https://portal.atxwashdryfold.com$P?lh=$(date +%s)"
done
curl -s -o /dev/null -m 15 -w 'concierge %{http_code}\n' -X POST -H 'Content-Type: application/json' \
  -d '{"message":"x"}' "https://portal.atxwashdryfold.com/api/concierge"
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com; do
  printf '%-22s ' "$H"; curl -s -o /dev/null -m 15 -w 'health_ct=%{content_type}\n' "https://$H/health?lh=$(date +%s)"
done
```
  - Expected: `404`, `404`, `concierge 404`, then three `health_ct=application/json; charset=utf-8` lines — the
    marketing hosts are untouched by this reload, which is the claim being verified.

**Rollback (exact; per box, order: `.env` → tree → probe → reload → verify).**
```bash
BOX=oci1; IP=161.153.71.201; REC=/var/www/wavemax/cutover-logs/plan3-record.env; D=/var/www/wavemax/wavemax-affiliate-program
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "sed -n 's/^ENV_BASELINE_TS_'$BOX'=//p' $REC | tail -1"); echo "TS=$TS"
test -n "$TS" || { echo 'STOP: no snapshot timestamp for this box'; exit 1; }
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
  cd $D
  cp -a /var/www/wavemax/env-backups/.env.$TS .env && chmod 600 .env
  grep -cE '^(EXPLORER_TOKEN|ANTHROPIC_API_KEY)=' .env
  git revert --no-edit HEAD~1..HEAD >/dev/null 2>&1 || git checkout -q $TS_SHA_PLACEHOLDER
  tar -C $D -xzf ~/deploy-snapshots/design-explorer-$TS.tgz
  find public/design-explorer -type f | wc -l
  PORT=3099 NODE_ENV=production node -e '
    process.on(\"uncaughtException\", (e) => { console.log(\"BOOT_FAIL \" + e.message); process.exit(1); });
    require(\"./server.js\"); setTimeout(() => { console.log(\"BOOT_OK\"); process.exit(0); }, 2500);'"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 reload wavemax --update-env'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'until curl -sf -m 5 -o /dev/null -H "Host: portal.atxwashdryfold.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/health; do sleep 2; done; echo HEALTH_UP'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "curl -s -o /dev/null -m 10 -w 'explorer-with-k %{http_code}\n' -H 'Host: portal.atxwashdryfold.com' -H 'X-Forwarded-Proto: https' \"http://127.0.0.1:3000/design-explorer/index.html?k=\$(sed -n 's/^EXPLORER_TOKEN=//p' $D/.env)\""
```
- Rollback expected: `2` (both keys back); the revert (or the recorded pre-pull sha checked out); `150` explorer
  files restored from the tarball; `BOOT_OK`; `HEALTH_UP`; `explorer-with-k 200`.
  **The `?k=` probe is the discriminating one** — a bare `/design-explorer/` returns `404` both when the guard is
  restored and when the whole feature is gone, so it cannot be the rollback proof.
- Replace `$TS_SHA_PLACEHOLDER` with the short sha printed in Step 9's baseline before running this.
- Roll back **only the box you are on**, and clear `BOX_BUSY` when done.

---

### Task 18: [affiliate] delete the intake routes and all five retired CSRF rows, in one commit

> [MEASURED] `server/config/csrfTables.js:23-31` and `tests/unit/csrfTables.test.js:56-72` both carry an explicit
> instruction — *"Delete them in the Plan 3 PR that deletes the routes."* Pruning the rows while the routes are
> mounted 403s two live forms; deleting the routes while the rows stand leaves dead policy. One commit, both
> halves, **five** rows — five because Task 17 retired the explorer, so `/api/concierge` is routeless.
> **Repo-only:** delivered to the boxes in Task 24.

**Files:**
- Delete: `server/routes/partnerInquiryRoutes.js` (58), `server/routes/affiliateApplicationRoutes.js` (72),
  `server/controllers/partnerInquiryController.js` (46),
  `server/controllers/affiliateApplicationController.js` ([MEASURED] it **does** exist as a separate file —
  slice B's draft left this as "check `server/controllers/`"),
  `server/services/partnerInquiryService.js` (80), `server/services/affiliateApplicationService.js` (81).
- Delete: `tests/integration/partnerInquiry.test.js` (87), `tests/integration/affiliateApplication.test.js` (90).
- Modify: `server/config/csrfTables.js` — remove the five rows, the `---- PLAN 3 ----` comment block and the
  three per-row rationale comments.
- Modify: `tests/unit/csrfTables.test.js` — rewrite the `PLAN 3 GUARD` as a closed record.
- Modify: `server.js` — the two `apiV1Router.use('/', require(...))` lines ([MEASURED] `:769-770`). Locate by content.
- Modify: `server/services/email/**`, `server/templates/emails/**` — only if Step 2 finds an intake-only template.

**Interfaces:**

*Consumes — every row asserted:*

| # | consumed artefact | asserted by |
|:--|:--|:--|
| C18-1 | **Task 17 landed**: `/api/concierge` is routeless, so its row can retire with the other four | **Step 1** (`explorerRetired.test.js` green **and** `server.js` has no `concierge`) |
| C18-2 | **Task 16 landed**: no surviving affiliate client posts to the intake paths | **Step 2** (set-difference grep, empty output) |
| C18-3 | **corporate owns the live intake endpoints** on every flipped host | **Step 3** (per-host `"code":"partner.form.` marker = 1) |
| C18-4 | `PUBLIC_ENDPOINTS` is at **14** before this task | **Step 1** (`node -p`, exact) |
| C18-5 | no intake-only email template is shared with a surviving sender | **Step 2b** (template list + second-caller grep) |

*Produces:* `PUBLIC_ENDPOINTS.length === 9` — **all five** scope-brief rows retired; `POST /api/partner-inquiry`,
`/api/v1/partner-inquiry`, `/api/affiliate-application`, `/api/v1/affiliate-application` and `/api/concierge`
all **404** on the portal; `tests/unit/csrfTables.test.js` asserting the rows are **absent**;
`REC` gets `T18_DONE=yes`, `T18_SHA`.

- [ ] **Step 1: gate on Task 17 and pin the before-state.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npx jest tests/unit/explorerRetired.test.js 2>&1 | grep -E '^Tests:'
printf 'concierge in server.js = %s\n' "$(grep -cE 'concierge|explorerGuard' server.js || true)"
node -e 'const t=require("./server/config/csrfTables");console.log("PUBLIC_ENDPOINTS =",t.PUBLIC_ENDPOINTS.length)'
```
  - Expected: a `Tests:` line with `failed` absent; `concierge in server.js = 0`; `PUBLIC_ENDPOINTS = 14`.
    Any other value → **STOP**: either Task 17 has not landed or the table moved since this plan was written.

- [ ] **Step 2: prove no surviving affiliate client posts to these paths.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
KEEP='^(scripts/ops/cutover-gate\.sh|server/config/csrfTables\.js|tests/unit/csrfTables\.test\.js|tests/unit/ops/cutoverGateS1\.test\.js|tests/integration/(partnerInquiry|affiliateApplication)\.test\.js|server\.js)$'
git grep -lI -E 'api/(v1/)?(partner-inquiry|affiliate-application)' -- public server server.js tests scripts \
  | grep -vE "$KEEP"
echo "UNEXPECTED=${PIPESTATUS[0]}"
git grep -lI -E 'api/(v1/)?(partner-inquiry|affiliate-application)' -- public server server.js tests scripts | sort
```
  - Expected: the filtered list prints **nothing** and `UNEXPECTED=1`; the full list is exactly these **six**:
    ```
    scripts/ops/cutover-gate.sh
    server/config/csrfTables.js
    tests/integration/affiliateApplication.test.js
    tests/integration/partnerInquiry.test.js
    tests/unit/csrfTables.test.js
    tests/unit/ops/cutoverGateS1.test.js
    ```
    **[MEASURED]** — slice B's draft expected "exactly five paths" and omitted
    `tests/unit/ops/cutoverGateS1.test.js` while its own prose says that file stays; as written it would have
    tripped its own STOP. `scripts/ops/cutover-gate.sh` and `tests/unit/ops/cutoverGateS1.test.js` **stay**: they
    probe the **corporate** app on `:3001` and their references remain correct.
    Any `public/…` hit means a client still submits to the portal: **STOP.**

- [ ] **Step 2b: decide the email seam.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git grep -lI -E 'partnerInquiryService|affiliateApplicationService' -- server server.js tests | sort
ls server/templates/emails/en/ | grep -iE 'partner|inquiry|applicat' || echo NO_INTAKE_TEMPLATES
git grep -nI -E 'partner-inquiry|affiliate-application' -- server/services/email || echo NO_DISPATCH_REFS
```
  - Expected: the two service files plus their own tests; then `NO_INTAKE_TEMPLATES` — **[MEASURED] there are
    none**, so this task deletes no template; then `NO_DISPATCH_REFS`. If a template list appears instead, grep
    each name for a second sender and keep any template with one; record the decision in the commit body.

- [ ] **Step 3: prove corporate owns the live intake endpoints, per host.**

```bash
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com; do
  for P in /api/partner-inquiry /api/affiliate-application; do
    printf '%-22s %-28s ' "$H" "$P"
    curl -s -m 15 -X POST -H 'Content-Type: application/json' -d '{"firstName":""}' "https://$H$P" \
      | grep -c '"code":"partner\.form\.' || true
  done
done
```
  - Expected: **six** lines each ending `1` — corporate's validation payload carries the
    `"code":"partner.form.err…"` keys that [MEASURED] the portal's does **not**. A `0` means the portal is still
    answering that host and deleting the routes would break a live form: **STOP.**
    (Both apps return HTTP `400`, so a status-code check here is an assertion that cannot fail.)

- [ ] **Step 4: write the failing guard.** Replace the `PLAN 3 GUARD` block in `tests/unit/csrfTables.test.js` with:

```js
  // PLAN 3 (Task 18) — CLOSED. The intake routes moved to crhs-corporate with the
  // marketing pages and the concierge was retired with the design explorer, so all
  // five rows are gone. They were exempt only because credential-free public pages
  // POSTed with a plain fetch; there is no such page in this app any more.
  const RETIRED = ['/api/concierge',
    '/api/v1/partner-inquiry', '/api/partner-inquiry',
    '/api/v1/affiliate-application', '/api/affiliate-application'];

  it('all five retired rows are gone and every retired path 404s', async () => {
    for (const p of RETIRED) {
      expect(tables.PUBLIC_ENDPOINTS).not.toContain(p);
      expect((await request(app).post(p).send({})).status).toBe(404);
    }
  });

  it('PUBLIC_ENDPOINTS shrank by exactly the five retired rows', () => {
    expect(tables.PUBLIC_ENDPOINTS).toHaveLength(9);
  });

  it('the surviving exemptions are untouched (regression fence)', () => {
    for (const p of ['/api/health', '/api/v1/health', '/api/v1/scan/session',
      '/api/v1/scan/resolve', '/api/v1/scan/apply', '/api/v1/scan/undo',
      '/api/v1/customers/me', '/api/v1/affiliates/:affiliateId/public',
      '/api/affiliates/:affiliateId/public']) {
      expect(tables.PUBLIC_ENDPOINTS).toContain(p);
      expect(csrf.shouldEnforceCsrf({ method: 'POST', path: p })).toBe(false);
    }
  });
```
  The third case is a **fence, not a red-green**: it passes before and after, and it is the assertion that a
  clumsy edit has not taken a surviving row with it. Said plainly rather than dressed up as TDD.

- [ ] **Step 5: run it red.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npx jest tests/unit/csrfTables.test.js 2>&1 | tail -30
```
  - Expected: `Tests: 2 failed, …` — the first failure
    `expect(received).not.toContain("/api/concierge")` on `PUBLIC_ENDPOINTS`, the second
    `expect(received).toHaveLength(9) … Received length: 14`. The fence case passes. If the fence fails, STOP:
    the table is not in the state Step 1 measured.

- [ ] **Step 6: delete both halves.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git rm -q server/routes/partnerInquiryRoutes.js server/routes/affiliateApplicationRoutes.js \
          server/controllers/partnerInquiryController.js server/controllers/affiliateApplicationController.js \
          server/services/partnerInquiryService.js server/services/affiliateApplicationService.js \
          tests/integration/partnerInquiry.test.js tests/integration/affiliateApplication.test.js
```
  Then hand-edit, by content: `server/config/csrfTables.js` (the five rows, the `---- PLAN 3 ----` block and the
  three rationale comments) and `server.js` (the two `apiV1Router.use` lines and their trailing comments).

```bash
node -e 'const t=require("./server/config/csrfTables");
console.log("PUBLIC_ENDPOINTS =",t.PUBLIC_ENDPOINTS.length);
console.log("any retired row left:", ["/api/concierge","/api/v1/partner-inquiry","/api/partner-inquiry","/api/v1/affiliate-application","/api/affiliate-application"].some(p=>t.PUBLIC_ENDPOINTS.includes(p)));'
printf 'route mounts left = %s\n' "$(grep -cE 'partnerInquiryRoutes|affiliateApplicationRoutes' server.js || true)"
printf 'PLAN 3 comment left = %s\n' "$(grep -c 'PLAN 3' server/config/csrfTables.js || true)"
node --check server.js && echo SYNTAX_OK
```
  - Expected: `PUBLIC_ENDPOINTS = 9`; `any retired row left: false`; `route mounts left = 0`;
    `PLAN 3 comment left = 0`; `SYNTAX_OK`.

- [ ] **Step 7: verify and commit.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npx jest tests/unit/csrfTables.test.js tests/integration/csrf.test.js \
         tests/unit/rateLimitingMiddleware.test.js tests/unit/ops/cutoverGateS1.test.js 2>&1 | grep -E '^(Tests:|Test Suites:)|✕'
npx madge --circular server/ 2>&1 | tail -2
npx eslint server/ 2>&1 | grep -E 'problems?' | tail -1
git add -A server server.js tests
git commit -m "chore: delete the portal intake routes and all five retired CSRF rows

csrfTables.js and its test both carried a Plan 3 instruction to prune these rows in the
same PR that deletes the routes -- pruning earlier 403s two live forms, deleting later
leaves dead policy. crhs-corporate now answers /api/partner-inquiry and
/api/affiliate-application (plus the /v1 aliases) on all three flipped hosts, proven by
the \"code\":\"partner.form.*\" keys only its validator emits. /api/concierge joins them
because the preceding task retired the design explorer, its only client.
PUBLIC_ENDPOINTS 14 -> 9: all five rows retired. The test now asserts the rows are
ABSENT and every retired path 404s, plus a fence over the nine survivors.
scripts/ops/cutover-gate.sh and tests/unit/ops/cutoverGateS1.test.js keep their
references: they probe the corporate app on :3001. No email template was intake-only.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
SHA=$(git rev-parse HEAD); echo "T18_SHA=$SHA"
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 \
  "printf 'T18_DONE=%s\nT18_SHA=%s\n' yes $SHA >> /var/www/wavemax/cutover-logs/plan3-record.env"
```
  - Expected: a `Tests:` line with no `✕`; `✔ No circular dependency found!`; `✖ 199 problems` or fewer (an
    increase is a STOP); one commit, pushed; `T18_SHA=<40 hex>`.
  - **Not deployed by this task.** The portal keeps answering these paths until Task 24's window; that is
    harmless, because nginx no longer routes any marketing host to `:3000` and no surviving page posts to them.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git revert --no-edit HEAD && git log --oneline -1
node -e 'const t=require("./server/config/csrfTables");console.log(t.PUBLIC_ENDPOINTS.length, t.PUBLIC_ENDPOINTS.includes("/api/concierge"))'
ls server/routes/partnerInquiryRoutes.js server/controllers/affiliateApplicationController.js
node --check server.js && echo SYNTAX_OK
npx jest tests/unit/csrfTables.test.js 2>&1 | grep -E '^Tests:'
```
- Rollback expected: the revert commit; `14 true`; both paths listed; `SYNTAX_OK`; a `Tests:` line with `failed`
  absent (the reverted test file is the pre-Task-18 one, which matches a 14-row table).
- If Task 24 has already delivered it: pull the revert on both boxes and `pm2 reload wavemax --update-env`
  (`server.js` changed).

---

### Task 19: [three repos] delete the iframe bridges and the `securityHeaders.js:81-89` carve-out

> Owner decision 4: *"we will never embed in the franchisor site."* That kills the carve-out entirely, so this is
> a **straight deletion, not a migration** — and it discharges backlog **B-4**'s bridge row (19 brand-literal
> lines go with the two web-core files).
>
> **Internal order is fixed and each hop is asserted: 19a (affiliate) → 19b (corporate) → 19c (web-core).**
> 19b must be in corporate's tree **before** corporate installs the release carrying 19c: [MEASURED]
> `crhs-corporate/tests/contentHandler.test.js:204` does
> `fs.readFileSync(path.join(wc.assetsDir,'js',name))` over
> `['iframe-bridge-v2.js','parent-iframe-bridge-v3.js','css-async.js']`, so once 19c deletes two of those files
> that test throws `ENOENT` in any tree that has installed the new core (X8) — the same class as the recorded
> Deploy-B bidirectional boot-breaker.
>
> **Repo-only.** The affiliate half is delivered in Task 24; the corporate half is test-only; the web-core half
> ships in the v0.3.0 release (Task 24). No production window here.

**Files:**

*19a — affiliate (`/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program`)*
- Delete: `public/assets/js/iframe-bridge-v2.js`, `…/iframe-bridge-v2.min.js`,
  `…/parent-iframe-bridge-v3.js`, `…/parent-iframe-bridge-v3.min.js` (476 + 512 source lines + two generated).
- Delete: `.claude/commands/embed.md` (the `/embed` slash command; its whole procedure is wiring the bridge in).
- Modify: `scripts/build-assets.js` — drop rows [MEASURED] `:26` and `:27`.
- Modify: `tests/unit/branding-guard.test.js` — remove the `INFRA_ALLOW` entry `/WaveMaxBridgeV3/gi`
  ([MEASURED] `:91`). It is an allowlist row whose subject this task deletes; leaving it is exactly the
  "row outlives its reason" defect Task 23 exists to prevent.
- Modify: `README.md` (two lines, [MEASURED] `:124` and `:150`), `docs/README.md:29` — describe the retirement,
  not the mechanism, naming the owner decision. Leave `docs/archive/`, `docs/refactor/`,
  `docs/platform-baseline/` and `docs/austin-reference-build-plan.md` untouched: they record a system that existed.
- Create: `tests/unit/bridgeRetired.test.js`.

*19b — corporate (`/mnt/c/Users/rickh/GitHub/crhs-corporate`)*
- Modify: `tests/contentHandler.test.js` — the `:155` single-file case and the `:204` `test.each` become one
  **disk-derived** guard.
- Modify: `server/webCoreAssets.js` — the comment at `:1-3` (it says *"web-core still ships the iframe bridges
  until Plan 3"*). Behaviour unchanged.

*19c — web-core (`/mnt/c/Users/rickh/GitHub/crhs-web-core`)*
- Delete: `assets/js/iframe-bridge-v2.js` (476), `assets/js/parent-iframe-bridge-v3.js` (512),
  `tests/assets/bridgeOriginAllowlist.test.js` (4 tests).
- Modify: `src/security/securityHeaders.js` — remove lines **81–89**: [MEASURED] `:81-83` are the block's three
  comment lines, `:84-88` the conditional, `:89` the trailing blank. The scope brief says `:83-88`, which would
  strand two orphan comment lines; cutting `81-88` alone leaves a **double** blank line between the
  `Clear-Site-Data` block and the `// Allow public static assets` comment. **Also `:7`** — the file header still
  reads *"CORS overrides for the parent-iframe bridge + /assets + /locales"*, which slice B's own
  `grep -ci 'bridge' … = 0` assertion would have failed on.
- Modify: `tests/security/cspGolden.test.js` — delete the `:150` case
  `parent-iframe-bridge-v3.js -> ACAO *, ACAM GET,OPTIONS, CRP cross-origin`.
- Create: `tests/assets/bridgesRetired.test.js`.

**Interfaces:**

*Consumes — every row asserted:*

| # | consumed artefact | asserted by |
|:--|:--|:--|
| C19-1 | **Task 16 landed** (skeleton ordering; no technical coupling — stated plainly) | **Step 1** (`T16_SHA` ancestor of `HEAD`) |
| C19-2 | nothing in the affiliate loads a bridge — no page, no `pageScripts` entry, no route | **Step 2** (three greps, exact) |
| C19-3 | **19a landed**: the affiliate serves no `/assets/js/parent-iframe-bridge-v3.js`, so the shared carve-out guards nothing on a live path | **Step 9** (three-repo grep: the affiliate section holds only the absence guard) |
| C19-4 | **19b landed**: corporate's suite is filename-independent | **Step 9** (three-repo grep: the corporate section is **empty**) |
| C19-5 | the disk-derived corporate guard is **non-empty** (a `test.each([])` passes vacuously — R-9) | **Step 6** (derived list printed and length asserted ≥ 1) |
| C19-6 | web-core's `/assets/` + `/locales/` CRP override is unchanged by the cut | **Step 11** (fence case, green before and after) |

*Produces:*
- no iframe bridge in any of the three repos; `assets/js/` containing exactly `css-async.js`, `i18n.js`,
  `language-switcher.js`; **no path** receiving `Access-Control-Allow-Origin: *` from web-core's
  `securityHeaders`; the `/logout` `Clear-Site-Data` rule and the `/assets/` + `/locales/`
  `Cross-Origin-Resource-Policy: cross-origin` rule intact and fenced by a new test;
- web-core suite `579 → 578` (−1 suite/−4 tests deleted, −1 `cspGolden` case, +1 suite/+4 tests), **35** suites;
- `REC` gets `T19_DONE=yes`, `T19_AFF_SHA`, `T19_CORP_SHA`, `T19_WC_SHA`;
- **the reason Task 23 can write a clean allowlist**: with the bridges already gone, Task 23's `ALLOW` never
  contains a bridge row, which is how X6 is closed — by ordering, not by a later prune.

- [ ] **Step 1: gate on Task 16.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
REC=/var/www/wavemax/cutover-logs/plan3-record.env
T16_SHA=$(ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "sed -n 's/^T16_SHA=//p' $REC" | tail -1)
test -n "$T16_SHA" && git merge-base --is-ancestor "$T16_SHA" HEAD && echo T16_ANCESTOR=yes
```
  - Expected: `T16_ANCESTOR=yes`. This is an **ordering** gate the skeleton requires, not a technical coupling:
    the bridges are flip-independent. Said plainly so nobody reasons from a dependency that does not exist.

- [ ] **Step 2: 19a — prove nothing references the bridges (the deletion premise).**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
echo "--- runtime references, excluding the bridge files themselves ---"
git grep -lI -E 'iframe-bridge-v2|parent-iframe-bridge-v3|WaveMaxBridgeV3' -- public server server.js tests scripts \
  | grep -vE '^public/assets/js/(iframe-bridge-v2|parent-iframe-bridge-v3)'
echo "--- any page that loads a bridge ---"; git grep -c -I 'bridge' -- 'public/*.html' || echo NONE
echo "--- pageScripts entries naming a bridge ---"; git grep -c -I 'bridge' -- public/assets/js/embed-app-v2.js || echo NONE
```
  - Expected, exactly:
    ```
    --- runtime references, excluding the bridge files themselves ---
    scripts/build-assets.js
    tests/unit/branding-guard.test.js
    --- any page that loads a bridge ---
    NONE
    --- pageScripts entries naming a bridge ---
    NONE
    ```
    **[MEASURED]** — **two** lines, not the one slice B's draft expected; its `Expected: exactly the single line
    scripts/build-assets.js` would have tripped its own STOP on the `branding-guard` `INFRA_ALLOW` row, which
    this task now removes. The draft's `echo "--- exit $? ---"` after a pipe is deleted (**R-6**: always `0`).
  - Any **other** file → **STOP**: a page or the router still loading a bridge means deletion breaks a live page.

- [ ] **Step 3: 19a — write the failing guard test.** Create `tests/unit/bridgeRetired.test.js`:

```js
'use strict';
// Owner decision 4 (Plan 1, restated in the Plan 3 scope brief): "we will never embed
// in the franchisor site." The iframe bridges and their CORS carve-out are retired, not
// migrated. This guard keeps them from coming back — including the allowlist row that
// existed only to permit the bridge's global API name.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const REPO = path.resolve(__dirname, '../..');

describe('iframe bridges are retired', () => {
  test.each([
    'public/assets/js/iframe-bridge-v2.js', 'public/assets/js/iframe-bridge-v2.min.js',
    'public/assets/js/parent-iframe-bridge-v3.js', 'public/assets/js/parent-iframe-bridge-v3.min.js',
    '.claude/commands/embed.md'
  ])('%s does not exist', (p) => {
    expect(fs.existsSync(path.join(REPO, p))).toBe(false);
  });

  test('no tracked runtime file names a bridge', () => {
    const out = execSync(
      'git grep -lI -E "iframe-bridge-v2|parent-iframe-bridge-v3|WaveMaxBridgeV3" -- public server server.js tests scripts || true',
      { cwd: REPO, encoding: 'utf8' }
    ).trim();
    expect(out.split('\n').filter(Boolean).filter((f) => f !== 'tests/unit/bridgeRetired.test.js'))
      .toEqual([]);
  });

  test('the asset build no longer has a bridge row', () => {
    expect(fs.readFileSync(path.join(REPO, 'scripts/build-assets.js'), 'utf8')).not.toMatch(/bridge/i);
  });

  test('the branding guard no longer allowlists the bridge API name', () => {
    expect(fs.readFileSync(path.join(REPO, 'tests/unit/branding-guard.test.js'), 'utf8'))
      .not.toMatch(/WaveMaxBridgeV3/);
  });
});
```

- [ ] **Step 4: 19a — run it red, then delete and de-reference.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npx jest tests/unit/bridgeRetired.test.js 2>&1 | tail -25
```
  - Expected: `Tests: 8 failed, 8 total`, the first five being
    `expect(received).toBe(expected) … Received: true` for each path.

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git rm -q public/assets/js/iframe-bridge-v2.js public/assets/js/iframe-bridge-v2.min.js \
          public/assets/js/parent-iframe-bridge-v3.js public/assets/js/parent-iframe-bridge-v3.min.js \
          .claude/commands/embed.md
sed -i '/iframe-bridge-v2\.js/d;/parent-iframe-bridge-v3\.js/d' scripts/build-assets.js
sed -i '/WaveMaxBridgeV3/d' tests/unit/branding-guard.test.js
printf 'build-assets bridge rows = %s\n' "$(grep -ci bridge scripts/build-assets.js || true)"
printf 'branding-guard bridge row = %s\n' "$(grep -c WaveMaxBridgeV3 tests/unit/branding-guard.test.js || true)"
node --check scripts/build-assets.js && echo BUILD_ASSETS_PARSES
```
  - Expected: `build-assets bridge rows = 0`; `branding-guard bridge row = 0`; `BUILD_ASSETS_PARSES`.
  - Then hand-edit the three documentation lines (`README.md:124`, `README.md:150`, `docs/README.md:29`).

- [ ] **Step 5: 19a — verify the build, the guards and lint; commit.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npm run build:assets 2>&1 | tail -3
git status --porcelain public/assets/js | grep -v '^D ' || echo NO_UNEXPECTED_ASSET_CHANGES
npx jest tests/unit/bridgeRetired.test.js tests/integration/assetCaching.test.js \
         tests/integration/embedRoutes.test.js tests/unit/branding-guard.test.js 2>&1 | grep -E '^(Tests:|Test Suites:)|✕'
npx eslint server/ 2>&1 | grep -E 'problems?' | tail -1
git add -A public/assets/js scripts/build-assets.js README.md docs/README.md \
        tests/unit/bridgeRetired.test.js tests/unit/branding-guard.test.js .claude/commands/embed.md
git commit -m "chore: retire the iframe bridges from the portal (Plan 3 item 10, 19a)

Owner decision: we will never embed in the franchisor site, so the bridges are deleted,
not migrated. Nothing loaded them -- no page, no pageScripts entry, no server route --
proven by grep before deletion. Removes the four asset files, their two build rows, the
/embed slash command whose whole procedure was wiring the bridge in, three README lines,
and the branding-guard INFRA_ALLOW row for WaveMaxBridgeV3, which existed only to permit
the global API name of a file that no longer exists. Adds tests/unit/bridgeRetired.test.js
so they cannot return. The matching web-core assets and the securityHeaders CORS
carve-out follow in 19b/19c.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main; echo "T19_AFF_SHA=$(git rev-parse HEAD)"
```
  - Expected: a build that names no bridge; `NO_UNEXPECTED_ASSET_CHANGES`; a `Tests:` line whose only `✕` is
    `branding-guard › no un-allowlisted "WaveMAX" outside the shrinking baseline` — **the GC-19 baseline red,
    unchanged in shape** (its offender table must still be the three cutover-tooling files from Task 16 Step 8;
    re-run that table if in doubt); `✖ 199 problems` or fewer; one commit, pushed.
  - If `assetCaching.test.js` names a bridge filename, fix that assertion in this commit and say so in the body.

- [ ] **Step 6: 19b — measure corporate, and prove the disk-derived guard is non-vacuous.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
git grep -nI -E 'iframe-bridge-v2|parent-iframe-bridge-v3' -- .
grep -n 'SERVED = new Set' server/webCoreAssets.js
node -e 'const fs=require("fs"),p=require("path"),wc=require("@crhs/web-core");
const all=fs.readdirSync(p.join(wc.assetsDir,"js")).sort();
const served=["i18n.js","language-switcher.js"];
const guarded=all.filter(f=>!served.includes(f));
console.log("all =",all.join(" "));
console.log("guarded =",guarded.join(" "),"| count =",guarded.length);
if (guarded.length === 0) { throw new Error("derived guard list is EMPTY — test.each([]) would pass vacuously"); }'
```
  - Expected: exactly two reference lines, `tests/contentHandler.test.js:155` and `:204`;
    `10:const SERVED = new Set(['i18n.js', 'language-switcher.js']);`; then
    `all = css-async.js i18n.js iframe-bridge-v2.js language-switcher.js parent-iframe-bridge-v3.js` and
    `guarded = css-async.js iframe-bridge-v2.js parent-iframe-bridge-v3.js | count = 3`. **[MEASURED].**
  - The `throw` is the R-9 protection: after 19c the derived list is `css-async.js` alone (**count = 1**), still
    non-empty. If a future release ships only the two served files the guard would become vacuous, and this
    command fails loudly instead of passing silently.

- [ ] **Step 7: 19b — rewrite the guard disk-derived, run it against the CURRENT core (it must pass).**
      In `tests/contentHandler.test.js`, replace the `:204` `test.each([...three filenames...])` block and the
      `:155` single-file case with one helper that:
      reads `require('../server/webCoreAssets')`'s served allowlist (export it if it is not already exported),
      lists `fs.readdirSync(path.join(wc.assetsDir, 'js'))`,
      asserts the derived not-served list has `length >= 1`,
      and for **every** derived name asserts a `404` on a marketing host and that the response body does not
      contain the file's bytes. `:155`'s surviving assertion — `language-switcher.js` **is** served — stays as
      its own case.

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/contentHandler.test.js 2>&1 | grep -E '^(FAIL|Tests:|Test Suites:)'
```
  - Expected: no `FAIL`; `Tests: 57 passed, 57 total` — **[MEASURED] baseline 57**, and the generic form must pass
    against today's five-file `assets/js`, covering the two bridges **and** `css-async.js` before they go. If it
    fails, the allowlist/404 behaviour is not what the old assertion claimed: **STOP** and report.
  - This is the assertion that was actually load-bearing. Keying it to a filename being deleted would have made a
    real guard evaporate with the file — and would have thrown `ENOENT` across corporate's suite on the next core
    install (X8).

- [ ] **Step 8: 19b — fix the stale comment and commit.** `server/webCoreAssets.js:1-3` says *"web-core still
      ships the iframe bridges until Plan 3, and they must not be exposed here."* Rewrite it to the durable rule:
      the allowlist is explicit because `express.static(assetsDir/js)` would expose whatever web-core ships,
      today and in future. Behaviour unchanged.

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
printf 'bridge refs = %s\n' "$(git grep -cI -E 'iframe-bridge-v2|parent-iframe-bridge-v3' -- . | wc -l)"
npm test 2>&1 | grep -E '^(FAIL|Tests:|Test Suites:)'
npm run lint 2>&1 | tail -2
git add tests/contentHandler.test.js server/webCoreAssets.js
git commit -m "test(assets): derive the web-core asset 404 guard from disk, not filenames (19b)

The guard named iframe-bridge-v2.js and parent-iframe-bridge-v3.js, which Plan 3 deletes
from web-core -- so the assertion would have thrown ENOENT across this suite on the next
core install and the protection would have vanished with the files. It now lists
assetsDir/js, asserts the derived not-served list is non-empty (a test.each([]) passes
vacuously), and requires every file outside webCoreAssets' two-file allowlist to 404 on a
marketing host. That is what was load-bearing. Lands BEFORE the core release that drops
the bridges.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main; echo "T19_CORP_SHA=$(git rev-parse HEAD)"
```
  - Expected: `bridge refs = 0`; no `FAIL` and `Tests:`/`Test Suites:` lines without `failed`; lint clean; one
    commit, pushed.

- [ ] **Step 9: 19c — the three-repo gate (this is C19-3 and C19-4).**

```bash
for r in crhs-web-core crhs-corporate wavemax-affiliate-program; do
  echo "##### $r"
  ( cd /mnt/c/Users/rickh/GitHub/$r && git grep -lI -E 'iframe-bridge-v2|parent-iframe-bridge-v3|WaveMaxBridgeV3' -- . \
    | grep -vE '^docs/|^tasks/todo\.md$|^README\.md$' || true )
done
```
  - Expected, exactly:
    ```
    ##### crhs-web-core
    assets/js/parent-iframe-bridge-v3.js
    src/security/securityHeaders.js
    tests/assets/bridgeOriginAllowlist.test.js
    tests/security/cspGolden.test.js
    ##### crhs-corporate
    ##### wavemax-affiliate-program
    tests/unit/bridgeRetired.test.js
    ```
  - **The two empty/near-empty repo sections are the gate.** A corporate hit means 19b has not landed; an
    affiliate hit other than the absence guard means 19a has not landed. Either is a **STOP.**
  - [MEASURED] `assets/js/iframe-bridge-v2.js` does **not** appear — it never names itself. Slice B's draft
    pinned a five-line list including it and would have failed on its own expectation. This step asserts the
    set **by exclusion** instead of pinning names.

- [ ] **Step 10: 19c — write the failing guard test.** Create `tests/assets/bridgesRetired.test.js`:

```js
'use strict';
// Owner decision: we will never embed in the franchisor site. The iframe bridges and
// the parent-bridge CORS carve-out are retired outright (Plan 3 item 10). This guards
// the deletion: no bridge asset, and securityHeaders never emits ACAO: *.
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const express = require('express');
const { securityHeadersMiddleware } = require('../../src');

const ROOT = path.join(__dirname, '..', '..');
const ASSETS = path.join(ROOT, 'assets', 'js');

describe('iframe bridges retired', () => {
  test('assets/js ships exactly the three surviving client assets', () => {
    expect(fs.readdirSync(ASSETS).sort())
      .toEqual(['css-async.js', 'i18n.js', 'language-switcher.js']);
  });

  test('securityHeaders mentions no bridge and sets no ACAO — header comment included', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src', 'security', 'securityHeaders.js'), 'utf8');
    expect(src).not.toMatch(/bridge/i);
    expect(src).not.toMatch(/Access-Control-Allow-/);
  });

  test('no path gets a wildcard ACAO from securityHeaders', async () => {
    const app = express();
    app.use(securityHeadersMiddleware());
    app.get('*', (req, res) => res.send('ok'));
    for (const p of ['/assets/js/parent-iframe-bridge-v3.js', '/assets/js/i18n.js',
      '/locales/en/common.json', '/']) {
      const r = await request(app).get(p);
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
      expect(r.headers['access-control-allow-methods']).toBeUndefined();
    }
  });

  test('the asset + locales CRP override survives, and a normal path does not get it', async () => {
    const app = express();
    app.use(securityHeadersMiddleware());
    app.get('*', (req, res) => res.send('ok'));
    for (const p of ['/assets/css/x.css', '/locales/de/common.json']) {
      expect((await request(app).get(p)).headers['cross-origin-resource-policy']).toBe('cross-origin');
    }
    expect((await request(app).get('/')).headers['cross-origin-resource-policy']).toBe('same-origin');
  });

  test('the /logout Clear-Site-Data rule survives', async () => {
    const app = express();
    app.use(securityHeadersMiddleware());
    app.get('*', (req, res) => res.send('ok'));
    expect((await request(app).get('/logout')).headers['clear-site-data'])
      .toBe('"cache", "cookies", "storage"');
  });
});
```
  The last two cases are **fences, not red-green**: they pass before and after. They pin what must **not** change
  — `/assets/` and `/locales/` keep `cross-origin`, a normal path keeps helmet's `same-origin`, and the `/logout`
  rule, which sits immediately above the deleted block, is not caught by the cut.

- [ ] **Step 11: 19c — run it red.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/assets/bridgesRetired.test.js 2>&1 | tail -35
```
  - Expected: `Tests: 3 failed, 2 passed, 5 total`. The failures, in order:
    1. `assets/js ships exactly the three surviving client assets` — received the **five** current filenames;
    2. `securityHeaders mentions no bridge and sets no ACAO` — the source still matches `/bridge/i` (both at `:7`
       and `:81-84`);
    3. `no path gets a wildcard ACAO` — `/assets/js/parent-iframe-bridge-v3.js` received `'*'`.
  - The two fence cases pass from the start. If either fails now, the current behaviour is not what the deletion
    assumes: **STOP.**

- [ ] **Step 12: 19c — cut the block, including the stale file header.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
sed -n '76,92p' src/security/securityHeaders.js       # read the exact block before cutting
awk 'NR==81 && /Override CORS and resource policy/ {ok81=1}
     NR==84 && /parent-iframe-bridge-v3\.js/        {ok84=1}
     NR==88 && /^\s*}\s*$/                          {ok88=1}
     NR==89 && /^\s*$/                              {ok89=1}
     END { if (ok81 && ok84 && ok88 && ok89) print "BLOCK_CONFIRMED_81_89"; else { print "STOP: block is not at 81-89"; exit 1 } }' \
  src/security/securityHeaders.js
sed -i '81,89d' src/security/securityHeaders.js
sed -i '7s|.*|// the /logout Clear-Site-Data, and the per-path Cross-Origin-Resource-Policy for /assets + /locales).|' src/security/securityHeaders.js
sed -n '74,84p' src/security/securityHeaders.js
printf 'bridge/ACAO mentions = %s\n' "$(grep -ciE 'bridge|Access-Control-Allow-' src/security/securityHeaders.js || true)"
printf 'consecutive blank lines = %s\n' "$(grep -cA0 -Pzo '\n\n\n' src/security/securityHeaders.js 2>/dev/null || echo 0)"
node -e "require('./src/security/securityHeaders.js'); console.log('loads ok')"
node --check src/security/securityHeaders.js && echo SYNTAX_OK
```
  - Expected: the pre-cut print shows the comment starting `// Override CORS and resource policy for the parent
    bridge script:` at `:81` and the closing `}` at `:88`; then `BLOCK_CONFIRMED_81_89`; the post-cut print shows
    the `Clear-Site-Data` closing `}` running into the `// Allow public static assets …` comment with **exactly
    one** blank line between them; then `bridge/ACAO mentions = 0`; `consecutive blank lines = 0`; `loads ok`;
    `SYNTAX_OK`.
  - The `awk` guard is mandatory: it makes the cut **die on a partial or shifted match** instead of deleting nine
    arbitrary lines (P14's defect class). `81-89`, not `83-88` (strands two comment lines) and not `81-88`
    (leaves a double blank line).
  - Then delete the whole `it(...)` block for `parent-iframe-bridge-v3.js -> ACAO *` from
    `tests/security/cspGolden.test.js` ([MEASURED] at `:150`).

- [ ] **Step 13: 19c — delete the assets, run the full suite with derived arithmetic, commit.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git rm -q assets/js/iframe-bridge-v2.js assets/js/parent-iframe-bridge-v3.js tests/assets/bridgeOriginAllowlist.test.js
ls assets/js/
npx jest tests/assets/bridgesRetired.test.js 2>&1 | grep -E '^Tests:'
npx jest tests/security tests/index.smoke.test.js 2>&1 | grep -E '^(FAIL|Tests:|Test Suites:)'
npm test 2>&1 | grep -E '^(FAIL|Tests:|Test Suites:)'
npm run lint 2>&1 | tail -2
npx madge --circular src/ 2>&1 | tail -2
printf 'brand literals in assets/js = %s\n' "$(git grep -cI -iE 'wavemax|rundberglaundry|runberglaundry|atxwash|wavemaxlaundry' -- assets/js | wc -l)"
git grep -lI -iE 'wavemax|rundberglaundry|runberglaundry|atxwash|wavemaxlaundry' -- . | grep -v '^tests/' | sort
```
  - Expected:
    - `css-async.js  i18n.js  language-switcher.js`;
    - `Tests: 5 passed, 5 total` for the new guard;
    - `tests/security` + `index.smoke`: `Tests: 89 passed, 89 total` — **[MEASURED] 90 today**, minus the one
      deleted `cspGolden` case;
    - full suite: `Test Suites: 35 passed, 35 total` / `Tests: 579 passed, 579 total` — derived, not carried over:
      `579 (v0.2.1 baseline) − 4 (bridgeOriginAllowlist, deleted) − 1 (the cspGolden ACAO case) + 5 (bridgesRetired)
      = 579`, and one suite file out, one in, so **35** either way. The identical total is a coincidence of the
      arithmetic, not evidence that nothing changed — the suite **names** must differ, which `npx jest --listTests |
      grep -c bridge` confirms as `1` (`bridgesRetired`, not `bridgeOriginAllowlist`). Record the **actual** number
      into `REC` as `WC_TESTS_AFTER_T19`; it is what Task 24 builds its release total from, and a mismatch against
      this arithmetic must be accounted for before Phase 3 starts, not forced;
    - lint clean; `✔ No circular dependency found!`;
    - `brand literals in assets/js = 2` — [MEASURED] the surviving `i18n.js` (1 line, the `storageKey`, which
      Task 22 converts to the legacy-migration read) and `language-switcher.js` (1 line, its header comment, which
      Task 23 fixes). The 19 bridge lines are gone: **backlog B-4's bridge row closes here**;
    - the residual non-test brand-literal file list **derived, not pinned** — expect `LICENSE`,
      `assets/js/i18n.js`, `assets/js/language-switcher.js` and the three `assets/legal/*.html`. Record it; Task 23
      turns it into the allowlist and Task 35 escalates the legal rows.

```bash
git add -A assets/js src/security/securityHeaders.js tests
git commit -m "feat!: delete the iframe bridges and the parent-bridge CORS carve-out (19c)

Owner decision: we will never embed in the franchisor site, so item 10 is a straight
deletion, not a migration. Removes assets/js/iframe-bridge-v2.js (476 lines),
assets/js/parent-iframe-bridge-v3.js (512), their origin-allowlist test, the
securityHeaders.js:81-89 wildcard-ACAO/CRP branch and the cspGolden case that pinned it.
The scope brief said 83-88: :81-83 are the block's comment and would have been stranded,
and :89 is its trailing blank, so cutting 81-88 alone left a double blank line. The file
header at :7 also still advertised the bridge carve-out and is corrected -- without it a
grep-for-bridge assertion could never reach zero.

The /assets/ + /locales/ CRP override and the /logout Clear-Site-Data rule stay and are
fenced by new tests: the first serves sibling-host asset references, not embedding, and
the second sits immediately above the deleted block. Proven before deletion: zero
references in all three repos outside the files deleted here and the affiliate's absence
guard. Closes backlog B-4's bridge row (19 brand-literal lines go with the files).

BREAKING CHANGE: /assets/js/iframe-bridge-v2.js and parent-iframe-bridge-v3.js are no
longer shipped, and no path receives Access-Control-Allow-Origin: * from securityHeaders.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
echo "T19_WC_SHA=$(git rev-parse HEAD)"
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "printf 'T19_DONE=%s\nT19_AFF_SHA=%s\nT19_CORP_SHA=%s\nT19_WC_SHA=%s\nWC_TESTS_AFTER_T19=%s\n' \
  yes <aff-sha> <corp-sha> <wc-sha> <recorded-test-count> >> /var/www/wavemax/cutover-logs/plan3-record.env"
```
  - Expected: one commit in each of the three repos; the record carrying all four values.
  - **No tag, no version bump here** — Task 24 cuts the release. Nothing is pushed to a box by this task.

**Rollback (exact; reverse order 19c → 19b → 19a, because that is the dependency direction).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git revert --no-edit HEAD && ls assets/js/ | wc -l && npx jest tests/security tests/assets 2>&1 | grep -E '^Tests:'
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
git revert --no-edit HEAD && npm test 2>&1 | grep -E '^(FAIL|Tests:)'
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git revert --no-edit HEAD && ls public/assets/js/ | grep -c bridge && npm run build:assets 2>&1 | tail -2
```
- Rollback expected: web-core `5` files in `assets/js` and a `Tests:` line without `failed`; corporate no `FAIL`;
  affiliate `4` bridge files and a clean build.
- **Order matters and the reverse order is invalid**: reverting 19b while 19c is still applied reds corporate's
  suite with `ENOENT`, and reverting 19c alone while 19b is applied is safe but pointless. Revert 19c **first**.
- **On-box:** nothing to do — this task deploys nothing. If Task 24 has already shipped the release, its rollback
  owns the boxes: restore the per-box `~/deploy-snapshots/crhs-web-core-<TS>.tgz`,
  `rm -rf node_modules/@crhs/web-core` in **both** consumers, reinstall, re-run the gate, then `pm2 reload`.
  Never leave one box on each side of this change.
- A box carrying the new web-core (no carve-out) with the old affiliate (bridge still served) is the one
  combination that serves the bridge without its cross-origin headers. Harmless by owner decision 4 — nothing
  cross-origin loads it — but it is the state not to describe as "rolled back".

---

# Phase 3 — `@crhs/web-core` v0.3.0

**Repo:** `/mnt/c/Users/rickh/GitHub/crhs-web-core`, private, consumed by both apps as
`file:../crhs-web-core`. Deployed release today: **v0.2.1**, commit `768bfdb`, on both boxes.

**Version choice — 0.3.0, not 0.2.2.** Two changes are observable in the consumers, not internal: `injectNonce`
emits different HTML (Task 20), and the i18n `localStorage` key is renamed (Task 22, visitor-visible, migrated).
A minor bump says that out loud — and with the install trap below, the installed version must be unmistakable in
every gate line.

**⛔ The install trap** (`memory/deploy_b_bidirectional_bootbreaker.md`). `npm install` reports "up to date" and
does **not** re-copy `node_modules/@crhs/web-core` when the version string is unchanged; **only**
`rm -rf node_modules/@crhs/web-core` forces a re-copy. The version bump alone does **not** force it. A consumer
running new app code against old core — or the reverse — has killed the portal before. Every install in Task 24
is `rm -rf` → `npm install --install-links` → gate → boot probe → `pm2 reload`, for **both** consumers, on **each**
box.

**Test arithmetic, derived.** Baseline `v0.2.1` = **35 suites / 579 tests** [MEASURED]. Task 19c already moved it
(`−4` deleted suite, `−1` `cspGolden` case, `+5` new guard) and recorded the result as `WC_TESTS_AFTER_T19`.
Phase 3 adds: Task 20 **+6**, Task 21 **+17** (`transport` +3, `logger` +9, `i18n` +5), Task 22 **+7**,
Task 23 **+2** = **+32**. Every task records its own delta; Task 24 asserts
`total == WC_TESTS_AFTER_T19 + 32` from the record rather than from a literal a drafter guessed.
Suite count stays **35** — no new suite file after Task 19.

**Exported surface stays 26 keys** and `wc.csrf` stays `{ createCsrf, CSRF_COOKIE_NAME }`. `logger.flushAndExit`
attaches to the existing `logger` export rather than becoming a 27th key: `tests/index.smoke.test.js:45-47` pins
the surface at 26 and every Plan 2 box gate asserts
`Object.keys(require("@crhs/web-core")).length === 26`. Adding a key would mean editing a production gate command
in the same release as a nonce fix.

---

### Task 20: [web-core + affiliate] `injectNonce` fills the `csp-nonce` meta **in place** — one `fillMetaContent` helper replaces two divergent regexes

> **⛔ This is a LIVE production defect.** [MEASURED] through Cloudflare on 2026-09-21:
> ```
> $ curl -s "https://portal.atxwashdryfold.com/embed-app-v2.html?lh=<ts>" | grep -o '<meta name="csp-nonce"[^>]*>'
> <meta name="csp-nonce" content="" content="pmW3F72JmVwvZb5UThhXhw==">
> ```
> HTML keeps the **first** attribute, so every client-side nonce read returns `''`. It is benign only while the
> portal's CSP carries neither `'strict-dynamic'` nor a style nonce.
>
> **Root cause** — `src/utils/cspHelper.js:66-70`: capture group 1 swallows the whole inside of the tag,
> `content=""` included, and the replacement **appends** a second `content=`. The brand-name meta fill thirty
> lines above (`:35-39`) does it **correctly** — its group 1 ends *at* the opening quote, so the value lands
> *between* the quotes — which is why corporate's pages look right. **Two divergent copies of one operation.**
> This task replaces both with one helper.
>
> **Both repos' tests currently ASSERT the bug** and must be corrected in the same change or the release turns the
> portal suite red: [MEASURED] `crhs-web-core/tests/utils/cspHelper.test.js:95` and `:118`, and
> `wavemax-affiliate-program/tests/unit/cspHelper.test.js:92` and `:115` — both carrying the comment
> *"The regex appends content attribute, it doesn't replace it"* (`:94` and `:91` respectively).

**Files:**
- Modify: `crhs-web-core/src/utils/cspHelper.js` — insert the helper above the `injectNonce` JSDoc (before `:6`);
  `:35-39` the brand-name fill becomes a helper call; `:66-70` the `csp-nonce` fill becomes a helper call.
- Modify: `crhs-web-core/tests/utils/cspHelper.test.js` — six new cases inserted before `:139` (the
  `// Brand injection is OPT-IN (3rd arg). Corporate's 2-arg calls MUST stay` comment that opens the nested
  `describe`); `:91-96` and `:118` corrected.
- Modify: `wavemax-affiliate-program/tests/unit/cspHelper.test.js` — `:88-93` and `:115` corrected.
- **Not touched:** `wavemax-affiliate-program/tests/unit/cspHelper.brand.test.js:11` asserts the double-quoted
  brand-name output, which this change keeps byte-identical; the affiliate's own
  `server/utils/cspHelper.js` shim wraps `injectNonce`, it does not re-implement it.

**Interfaces:**

*Consumes — every row asserted:*

| # | consumed artefact | asserted by |
|:--|:--|:--|
| C20-1 | **Task 19c landed in web-core**: `assets/js` is three files and `cspGolden` has no bridge case | **Step 1** (`ls assets/js` + `grep -c parent-iframe-bridge tests/security/cspGolden.test.js` = 0) |
| C20-2 | the defect is real and reproducible, not inferred | **Step 3** (the new unit test fails showing the duplicate attribute) |
| C20-3 | the `{{CSP_NONCE}}` placeholder path is genuinely unaffected | **Step 3** (two of the six new cases must **pass** before the fix) |
| C20-4 | the affiliate's mirrored assertions are red against the fixed core **before** being edited | **Step 6** (exactly two named failures, no others) |

*Produces:*
- `injectNonce(html, nonce)` on a page carrying `<meta name="csp-nonce" content="">` emits **exactly one**
  `content` attribute, holding the nonce — double **and** single quotes, with or without trailing attributes;
- the same helper fixes a **latent second defect** on the brand path: the old brand regex hard-coded a closing
  `"`, so `content=''` came back as `content='value">`;
- **unchanged, byte for byte:** the `{{CSP_NONCE}}` placeholder path (corporate's 11 pages and
  `administrator-login-embed.html`), the `<script>`/`<style>`/`<link rel=stylesheet>` passes, and the
  double-quoted brand-name fill;
- `REC` gets `T20_DELTA=6`.

*Recorded, not fixed here:* [MEASURED] `public/administrator-dashboard-embed.html` uses `{{nonce}}`, not
`{{CSP_NONCE}}` — at `:6`, at `:8` in a page-level `<meta http-equiv="Content-Security-Policy">` naming
`'nonce-{{nonce}}'`, and on ~10 `<script nonce="{{nonce}}">` tags. **No code substitutes `{{nonce}}`**, and
`injectNonce`'s script pass deliberately skips tags that already carry a `nonce=` attribute, so the page ships the
literal string as its nonce. Step 5 **asserts this page is unchanged by the fix**; teaching `injectNonce` a
second, undocumented placeholder would change that page's CSP posture inside a release whose point is a nonce
fix. Escalation row 2 owns it.

*Design note — why a replacement **function**, not a `$1` string:* a string replacement makes the inserted value
part of the replacement grammar. A base64 nonce cannot contain `$`, but `b.displayName` is owner-supplied text
that can. [MEASURED] with the function form, `displayName` = `A$&B$'C$\`D$1` round-trips literally.

- [ ] **Step 1: gate on Task 19c.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
ls assets/js/ | tr '\n' ' '; echo
printf 'cspGolden bridge case = %s\n' "$(grep -c 'parent-iframe-bridge' tests/security/cspGolden.test.js || true)"
git status --porcelain | wc -l
```
  - Expected: `css-async.js i18n.js language-switcher.js `; `cspGolden bridge case = 0`; `0` (clean tree).
    Anything else → **STOP**: Task 19c has not landed, and Task 24's release arithmetic starts from it.

- [ ] **Step 2: write the failing tests.** Insert before `:139` (the line
      `    // Brand injection is OPT-IN (3rd arg). Corporate's 2-arg calls MUST stay`):

```js
    // ⛔ Plan 3 Task 20. Shipped LIVE on the portal, measured 2026-09-21:
    //   <meta name="csp-nonce" content="" content="pmW3F72JmVwvZb5UThhXhw==">
    // HTML keeps the FIRST attribute, so every client-side nonce read returned ''.
    it('fills the empty csp-nonce meta IN PLACE — exactly one content attribute', () => {
      const html = '<meta name="csp-nonce" content="">';
      const result = injectNonce(html, testNonce);
      expect(result).toBe(`<meta name="csp-nonce" content="${testNonce}">`);
      expect(result.match(/content=/g)).toHaveLength(1);
    });

    it('fills a single-quoted empty csp-nonce meta without mismatching the quotes', () => {
      const result = injectNonce("<meta name='csp-nonce' content=''>", testNonce);
      expect(result).toBe(`<meta name='csp-nonce' content='${testNonce}'>`);
    });

    it('keeps trailing attributes on the csp-nonce meta', () => {
      const result = injectNonce('<meta name="csp-nonce" content="" data-x="1">', testNonce);
      expect(result).toBe(`<meta name="csp-nonce" content="${testNonce}" data-x="1">`);
    });

    it('leaves an already-filled csp-nonce meta alone (idempotent)', () => {
      const html = `<meta name="csp-nonce" content="${testNonce}">`;
      expect(injectNonce(html, 'second-nonce')).toBe(html);
    });

    it('the {{CSP_NONCE}} meta path also yields exactly one content attribute', () => {
      const result = injectNonce('<meta name="csp-nonce" content="{{CSP_NONCE}}">', testNonce);
      expect(result).toBe(`<meta name="csp-nonce" content="${testNonce}">`);
      expect(result.match(/content=/g)).toHaveLength(1);
    });

    it('fills a single-quoted empty brand-name meta without mismatching the quotes', () => {
      const result = injectNonce("<meta name='brand-name' content=''>", testNonce, {
        displayName: 'Rundberg Laundry', shortName: 'RL', legalName: 'RL LLC',
        logoPath: '/l.png', ogImagePath: '/og.png'
      });
      expect(result).toBe("<meta name='brand-name' content='Rundberg Laundry'>");
    });
```

- [ ] **Step 3: run them and confirm they fail for the right reason.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/utils/cspHelper.test.js 2>&1 | grep -E '✕|✓ fills|✓ leaves|✓ the \{\{|Tests:'
```
  - Expected: `Tests: 4 failed, 29 passed, 33 total` (27 today + 6 new), and the four failures are exactly:
    - `fills the empty csp-nonce meta IN PLACE` —
      `Received: "<meta name=\"csp-nonce\" content=\"\" content=\"test-nonce-123\">"` — **the live defect
      reproduced in a unit test**;
    - `fills a single-quoted empty csp-nonce meta` —
      `Received: "<meta name='csp-nonce' content='' content=\"test-nonce-123\">"`;
    - `keeps trailing attributes` —
      `Received: "<meta name=\"csp-nonce\" content=\"\" data-x=\"1\" content=\"test-nonce-123\">"`;
    - `fills a single-quoted empty brand-name meta` —
      `Received: "<meta name='brand-name' content='Rundberg Laundry\">"` — the **latent** brand-path defect,
      mismatched quotes.
  - **Two of the six must PASS already**: `leaves an already-filled csp-nonce meta alone` and
    `the {{CSP_NONCE}} meta path…`. If either fails, the premise that the placeholder path is unaffected is wrong:
    **STOP** — corporate's 11 pages depend on it.

- [ ] **Step 4: implement one helper.** Insert above the `injectNonce` JSDoc (before `:6`):

```js
/**
 * Fill an EMPTY `content=""` / `content=''` on the <meta> carrying `name`, in place.
 *
 * Four things this gets right that the two hand-rolled regexes it replaces did not:
 *  - the value lands BETWEEN the existing quotes, so the tag keeps exactly ONE
 *    `content` attribute. The csp-nonce copy captured `content=""` into its group and
 *    appended a second one; HTML keeps the FIRST attribute, so every client-side nonce
 *    read returned '' — shipped live on the portal until Plan 3 Task 20;
 *  - the quote character is captured and reused, so `content=''` does not come back as
 *    `content='value">` (the brand path's latent defect);
 *  - `\sname=` and `\scontent=` require whitespace before the attribute, so a
 *    `data-name=` / `data-content=` on the same tag can never be filled by mistake;
 *  - the replacement is a FUNCTION, so the inserted value is never parsed as a
 *    `$`-replacement pattern — `displayName` is owner-supplied text that may contain `$`.
 *
 * Matching only the EMPTY value is what makes the pass idempotent: a meta that already
 * carries a value is left untouched, which is why the `{{CSP_NONCE}}` placeholder path
 * (filled earlier in injectNonce) is byte-unchanged. Like both predecessors, this
 * requires `name=` to precede `content=` in the tag; every page in both apps is written
 * that way, and widening it would be untested surface with no call site.
 *
 * `name` is always a literal from this module — never user input reaching a RegExp.
 */
const fillMetaContent = (html, name, value) => html.replace(
  new RegExp(`(<meta[^>]*\\sname=["']${name}["'][^>]*\\scontent=)(["'])\\2`, 'gi'),
  (_m, prefix, quote) => `${prefix}${quote}${value}${quote}`
);
```

  Replace `:35-39` (the comment plus the brand-name `html = html.replace(…)` call) with:

```js
    // Fill the empty brand-name meta in place (see fillMetaContent).
    html = fillMetaContent(html, 'brand-name', b.displayName);
```

  Replace `:66-70` (the comment plus the csp-nonce `html = html.replace(…)` call) with:

```js
  // Fill the empty csp-nonce meta in place (see fillMetaContent) — one attribute.
  html = fillMetaContent(html, 'csp-nonce', nonce);
```

  Then correct the two assertions that codified the defect. `:91-96` becomes:

```js
    it('should update meta tag with name="csp-nonce"', () => {
      const html = '<meta name="csp-nonce" content="">';
      const result = injectNonce(html, testNonce);
      // Was asserted as `content="" content="…"` until Plan 3 Task 20: the old regex
      // APPENDED a second attribute and HTML keeps the first, so the portal served an
      // empty nonce to every client. The test encoded the bug as expected behaviour.
      expect(result).toBe(`<meta name="csp-nonce" content="${testNonce}">`);
    });
```

  and `:118` becomes:

```js
      expect(result).toContain(`<meta name="csp-nonce" content="${testNonce}">`);
```

- [ ] **Step 5: run green, and prove the two regexes are really gone.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
npx jest tests/utils/cspHelper.test.js 2>&1 | grep -E '^(Tests:|Test Suites:)'
printf 'fillMetaContent occurrences = %s\n' "$(grep -c fillMetaContent src/utils/cspHelper.js)"
printf 'capture-the-empty-value patterns left = %s\n' "$(grep -cE 'content=\["\x27\]' src/utils/cspHelper.js || true)"
node -e '
const { injectNonce } = require("./src/utils/cspHelper");
const fs = require("fs");
for (const f of ["/mnt/c/Users/rickh/GitHub/crhs-corporate/content/crhsent/index.html",
                 "/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/public/embed-app-v2.html",
                 "/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/public/administrator-dashboard-embed.html"]) {
  const h = fs.readFileSync(f, "utf8");
  const out = injectNonce(h, "NONCE123");
  const m = (out.match(/<meta[^>]*name=["\x27]csp-nonce["\x27][^>]*>/i) || ["<none>"])[0];
  console.log(f.split("/").pop().padEnd(36), JSON.stringify(m), "| attrs:", (m.match(/content=/g)||[]).length);
}'
```
  - Expected: `Test Suites: 1 passed, 1 total`, `Tests: 33 passed, 33 total`; then
    `fillMetaContent occurrences = 3` (the helper plus its two call sites) and
    `capture-the-empty-value patterns left = 0` — neither predecessor pattern survives; then, in order:
    - `index.html  "<meta name=\"csp-nonce\" content=\"NONCE123\">" | attrs: 1` (corporate, through the
      `{{CSP_NONCE}}` placeholder path — the shape it already had);
    - `embed-app-v2.html  "<meta name=\"csp-nonce\" content=\"NONCE123\">" | attrs: 1` — **the live defect fixed**;
    - `administrator-dashboard-embed.html  "<meta name=\"csp-nonce\" content=\"{{nonce}}\">" | attrs: 1` —
      **unchanged**, because `{{nonce}}` is a non-empty value nothing substitutes. That is escalation row 2, and
      this line is the proof this release does not silently change that page's CSP posture.
  - **[MEASURED] all three lines, with this exact helper, today.**

- [ ] **Step 6: prove the affiliate suite is red against the fixed core — that IS the failing test.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npx jest tests/unit/cspHelper.test.js tests/unit/cspHelper.brand.test.js 2>&1 | grep -E '✕|Tests:'
```
  - Expected: `Tests: 2 failed, 18 passed, 20 total`; the two failures are exactly
    `should update meta tag with name="csp-nonce"` and `should handle complex HTML with multiple elements`, each
    `Expected` the duplicated `content="" content="…"` string and `Received` the single-attribute form.
    The affiliate resolves web-core through `file:../crhs-web-core`, so the local working tree is already the new
    code. **If any other test fails, STOP**: Step 4 changed more than the meta fill.

- [ ] **Step 7: correct the affiliate's two assertions.** `:88-93` becomes:

```js
    it('should update meta tag with name="csp-nonce"', () => {
      const html = '<meta name="csp-nonce" content="">';
      const result = injectNonce(html, testNonce);
      // Plan 3 Task 20: web-core's injectNonce now fills the meta IN PLACE. This
      // previously asserted `content="" content="…"`, which is what the portal actually
      // served — HTML keeps the first attribute, so window.CSP_NONCE was ''.
      expect(result).toBe(`<meta name="csp-nonce" content="${testNonce}">`);
    });
```

  and `:115` becomes:

```js
      expect(result).toContain(`<meta name="csp-nonce" content="${testNonce}">`);
```

- [ ] **Step 8: the affiliate's client-side readers still resolve the nonce.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npx jest tests/unit/cspHelper.test.js tests/unit/cspHelper.brand.test.js \
         tests/integration/webCoreConsumptionGolden.test.js tests/integration/securityHeaders.test.js \
         tests/integration/csp.test.js 2>&1 | grep -E '^(Tests:|Test Suites:)|✕'
node -e '
const { readHTMLWithNonce } = require("./server/utils/cspHelper");
readHTMLWithNonce(require("path").join(__dirname, "public/embed-app-v2.html"), "NONCE123").then((out) => {
  const meta = out.match(/<meta name="csp-nonce"[^>]*>/)[0];
  console.log(meta);
  console.log("content attrs:", (meta.match(/content=/g) || []).length);
  console.log("asset-version filled:", /<meta name="asset-version" content="[^"]+">/.test(out));
  console.log("interest-form-url filled:", /<meta name="interest-form-url" content="[^"]+">/.test(out));
});'
git grep -n 'CSP_NONCE' -- public/embed-app-v2.html public/assets/js/embed-app-v2.js public/assets/js/claim.js | head
```
  - Expected: a `Tests:` line with no `✕`; then `<meta name="csp-nonce" content="NONCE123">`,
    `content attrs: 1`, `asset-version filled: true`, `interest-form-url filled: true` — the last two prove the
    fix did not disturb the affiliate's own `injectAssetVersion` and interest-form passes, which run on the same
    string right after `injectNonce`; then the reader list, [MEASURED]
    `public/embed-app-v2.html:43` (`window.CSP_NONCE`), `public/assets/js/embed-app-v2.js:193,446,643`,
    `public/assets/js/claim.js:844-845`. Every one treats an empty value as "fall through to another source", so
    each reaches the same nonce today by a fallback and will now read it from the meta. No inverted logic, no
    behaviour change beyond the meta itself.

- [ ] **Step 9: commit both repos.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git add src/utils/cspHelper.js tests/utils/cspHelper.test.js
git commit -m "fix(cspHelper)!: fill the csp-nonce meta in place — one fillMetaContent helper (Plan 3 Task 20)" \
  -m "The csp-nonce meta pass captured content=\"\" into its capture group and appended a
second content attribute. HTML keeps the first, so every client-side nonce read
returned '' -- shipped LIVE on the portal (measured 2026-09-21:
content=\"\" content=\"pmW3F72JmVwvZb5UThhXhw==\"). The brand-name fill thirty lines
above already did it correctly, which is why corporate's pages looked right: two
divergent copies of one operation. One helper now fills both metas between the existing
quotes, reusing the captured quote character -- which also fixes the brand path's latent
single-quote defect -- and requires whitespace before the attribute so a data-content=
can never be filled by mistake. Both repos' tests asserted the duplicate output as
expected behaviour; both are corrected." \
  -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git add tests/unit/cspHelper.test.js
git commit -m "test(csp): the csp-nonce meta is filled in place, not duplicated (web-core Task 20)" \
  -m "Mirrors the web-core fix. This file asserted the duplicated content attribute as
expected behaviour, with the comment 'The regex appends content attribute, it doesn't
replace it' -- so the release carrying the fix would have turned this suite red." \
  -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 \
  "printf 'T20_DELTA=6\nT20_DONE=yes\n' >> /var/www/wavemax/cutover-logs/plan3-record.env"
```
  - Expected: one commit in each repo; the affiliate pushed; `T20_DELTA=6` recorded. **web-core is not pushed
    here** — Task 24 pushes `main` with the release commit and the tag together.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git log --oneline -1 && git revert --no-edit HEAD
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git log --oneline -1 && git revert --no-edit HEAD
npx jest tests/utils/cspHelper.test.js 2>&1 | grep -E '^Tests:'
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npx jest tests/unit/cspHelper.test.js 2>&1 | grep -E '^Tests:'
node -e 'const {injectNonce}=require("/mnt/c/Users/rickh/GitHub/crhs-web-core/src/utils/cspHelper");
console.log(injectNonce("<meta name=\"csp-nonce\" content=\"\">","N"))'
```
- Rollback expected: web-core `Tests: 27 passed, 27 total` (the pre-Task-20 file, six cases reverted away);
  the affiliate `Tests: 20 passed, 20 total`; and the last line printing
  `<meta name="csp-nonce" content="" content="N">` — **the defect restored, which is the correct rollback state.**
- **Revert both repos or neither.** The affiliate's corrected assertions go red against a reverted core, and a
  reverted affiliate test goes red against a fixed core. `git show --stat` on each revert must list only the two
  files named in **Files**.

---

### Task 21: [web-core] SMTP timeouts, a logger that drops nothing, `flushAndExit`, and a deploy-stable locale token

> Three independent fixes in one task because they are one release and touch three separate files. Each gets its
> own commit; the task is not done until all three are green together.
>
> **Decision on item 18, settled and implemented (R-14): fix the logger's format chain. Do NOT add an ESLint
> rule.** A lint rule cannot see the defect — `logger.info('From:', mailOptions.from)` and
> `logger.error('boot failed:', err.message)` are, at lint time, `MemberExpression`s syntactically identical to
> `logger.error('msg:', err)`, which works today and whose stack capture must be kept. A rule narrow enough to be
> safe (ban only `Literal` second arguments) misses every real site; a rule wide enough to catch them bans ~24
> currently-correct web-core call sites plus an unknown number in two consumers, and rewriting
> `logger.error('Encryption error:', error)` into `{ err: error.message }` would **lose the stack** winston
> captures today. And `winston.format.splat()` is **worse than the bug** (see below). The format chain fixes it
> once for every caller in every repo, including code not yet written.
>
> **The brief's logger claim is half wrong, measured.** An **`Error`** extra argument **survives** with its stack;
> an **object** merges; **primitives are DROPPED**. `logger.error('boot failed:', err.message)` logs no reason —
> live at `crhs-corporate/server.js:162` and `:172`. `winston.format.splat()` is measurably worse: with no `%s`
> token `logform/splat.js:99-113` runs `Object.assign(info, '<string>')`, exploding the string into
> character-indexed keys (`{"0":"n","1":"o","10":"r",…}`) in every JSON log line.

**Files:**
- **21a** Modify: `src/email/transport.js` (`:34-45`, the `transportConfig` object literal);
  `tests/email/transport.test.js` (three cases before `:100`, three `delete process.env.…` lines in the
  `beforeEach` teardown after `:27`).
- **21b** Modify: `src/utils/logger.js` (`:1-8` requires + `logFormat`; `flushAndExit` inserted before `:54`,
  the `module.exports`); `tests/utils/logger.test.js` (two new `describe` blocks appended after `:31`);
  `README.md` (a "Logging contract" section before the closing copyright line).
- **21c** Modify: `assets/js/i18n.js` (`SELF_SRC` after `:7`; an `assetVersion()` method after `detectLanguage()`,
  whose closing `},` is at `:84`; the timestamp lines `:95-97` become one URL line);
  `tests/assets/i18n.test.js` (a new `describe` before `:165`, the file's final `});`).

**Interfaces:**

*Consumes — every row asserted:*

| # | consumed artefact | asserted by |
|:--|:--|:--|
| C21-1 | **Task 20 landed** and the tree is clean | **Step 1** (`grep -c fillMetaContent` = 3, `git status --porcelain` = 0) |
| C21-2 | nodemailer's real defaults, so the fix is a change and not a restatement | **Step 2** (read them out of the installed package) |
| C21-3 | the logger's **current** behaviour, so the tests fail for the measured reason | **Step 5** (three cases must fail, three must pass) |
| C21-4 | `format.splat()` is not already present (it would invert Step 5's expectations) | **Step 5** (`never explodes a string into character-indexed keys` passes **before** the fix) |
| C21-5 | the surface stays 26 keys — `flushAndExit` is a `logger` property, not a 27th export | **Step 8** (`Object.keys(require('./src')).length` = 26) |

*Produces:*
- `createTransport()` returning `connectionTimeout: 10000`, `greetingTimeout: 10000`, `socketTimeout: 30000`, each
  overridable by `EMAIL_CONNECTION_TIMEOUT_MS` / `EMAIL_GREETING_TIMEOUT_MS` / `EMAIL_SOCKET_TIMEOUT_MS`.
  **No `.env` change on any box — the defaults are the fix;**
- nothing handed to `logger.*()` is dropped: a primitive is appended to the message, an object merges, an `Error`
  keeps message + stack whether it is the message or an extra argument;
- `logger.flushAndExit(code = 1, { timeoutMs = 750 })`, exiting on the logger's `finish` event with a capped
  fallback — repairing `crhs-corporate/server.js:162` and `:172` **with no consumer edit**, and the five
  `src/email/transport.js` sites;
- `/locales/<lang>/common.json?v=<token>` where the token is, in order: `<meta name="asset-version">`, then the
  `v=` already stamped on this loader's own `<script src>`, then the constant `'static'`. **Never a clock**;
- `REC` gets `T21_DELTA=17`.

*Scope fences, stated so they are not later claimed:*
- `dnsTimeout` keeps its bounded 30 s default — one unmeasured knob per release is enough.
- `sendEmail` calls `createTransport()` per message (`src/email/transport.js:89`), so there is no pool and a stall
  is per-send. **A timeout is not a fix for scope-brief item 22** (oci2 opening and dropping SMTP connections with
  `commands=0/0`); a timeout cannot produce `commands=0/0`. That stays with Task 30 and must not be recorded as
  fixed here.
- `logger.flushAndExit` **adoption** is not in this task — one line each at corporate's inlined copy and the
  affiliate's four `process.exit(1)` sites, escalation row 3.
- Corporate publishes **no** `<meta name="asset-version">`, and does not need to: precedence (2) gives the
  marketing hosts a deploy-accurate token from the `v=` corporate already stamps on the loader URL
  ([MEASURED] `content/atxwashdryfold/index.html:331` → `/assets/js/i18n.js?v=20260909a`), with **zero** content
  edits, and corporate serves `/locales/` with `maxAge: '1h'` (`server/contentHandler.js:62`), bounding worst-case
  staleness at one hour, self-healing. The portal fills the meta server-side
  ([MEASURED] live value `content="20260917a"`) and has no such window.

- [ ] **Step 1: gate on Task 20.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
printf 'fillMetaContent = %s\n' "$(grep -c fillMetaContent src/utils/cspHelper.js)"
git status --porcelain | wc -l
npx jest tests/utils/cspHelper.test.js 2>&1 | grep -E '^Tests:'
```
  - Expected: `fillMetaContent = 3`; `0`; `Tests: 33 passed, 33 total`. Anything else → **STOP.**

#### 21a — SMTP timeouts (scope-brief item 17)

- [ ] **Step 2: read nodemailer's real defaults out of the installed package (C21-2).**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
node -p "require('nodemailer/package.json').version"
grep -nE '(greeting|connection|socket|dns)Timeout' node_modules/nodemailer/lib/smtp-connection/index.js | head -6
```
  - Expected: `8.0.11`, then the default assignments — greeting **30 s**, connection **2 min**, socket **10 min**,
    dns **30 s** ([MEASURED] `index.js:54-57`). The "10-minute" figure in the brief is the **socket** default.
    If the version differs, re-read the defaults before writing the test expectations: this step exists so the fix
    is provably a change and not a restatement of a default.

- [ ] **Step 3: write the failing tests.** Insert before `:100` (the `});` closing `describe('createTransport')`):

```js
    // Item 17. nodemailer's defaults (greeting 30 s, connection 2 min, socket 10 min --
    // smtp-connection/index.js:54-57, nodemailer 8.0.11) let a hung mail host hold a
    // send for ~10 minutes; the 2026-08 mail outage was diagnosed through that silence.
    it('sets explicit connection, greeting and socket timeouts', () => {
      process.env.EMAIL_HOST = 'mail.example.com';
      transport.createTransport();
      const config = nodemailer.createTransport.mock.calls[0][0];
      expect(config.connectionTimeout).toBe(10000);
      expect(config.greetingTimeout).toBe(10000);
      expect(config.socketTimeout).toBe(30000);
    });

    it('honours the EMAIL_*_TIMEOUT_MS overrides', () => {
      process.env.EMAIL_HOST = 'mail.example.com';
      process.env.EMAIL_CONNECTION_TIMEOUT_MS = '4000';
      process.env.EMAIL_GREETING_TIMEOUT_MS = '5000';
      process.env.EMAIL_SOCKET_TIMEOUT_MS = '6000';
      transport.createTransport();
      const config = nodemailer.createTransport.mock.calls[0][0];
      expect(config.connectionTimeout).toBe(4000);
      expect(config.greetingTimeout).toBe(5000);
      expect(config.socketTimeout).toBe(6000);
    });

    it('ignores a non-numeric or non-positive override rather than sending NaN to nodemailer', () => {
      process.env.EMAIL_HOST = 'mail.example.com';
      process.env.EMAIL_SOCKET_TIMEOUT_MS = 'soon';
      process.env.EMAIL_GREETING_TIMEOUT_MS = '0';
      transport.createTransport();
      const config = nodemailer.createTransport.mock.calls[0][0];
      expect(config.socketTimeout).toBe(30000);
      expect(config.greetingTimeout).toBe(10000);
    });
```
  and add to the `beforeEach` teardown, after the `delete process.env.EMAIL_TLS_SERVERNAME;` line:

```js
    delete process.env.EMAIL_CONNECTION_TIMEOUT_MS;
    delete process.env.EMAIL_GREETING_TIMEOUT_MS;
    delete process.env.EMAIL_SOCKET_TIMEOUT_MS;
```

- [ ] **Step 4: run red, implement, run green, commit.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/email/transport.test.js 2>&1 | grep -E '✕|Expected|Received|Tests:'
```
  - Expected: `Tests: 3 failed, 19 passed, 22 total`, every failure reading `Received: undefined` against
    `Expected: 10000` / `30000` / `4000` / … — the keys are **absent** from the config object, which is exactly
    the defect (nodemailer then applies its own defaults). A failure reading `Received: 0` or `NaN` instead would
    mean someone already added the keys badly: **STOP.**

  Replace `:34-45` with:

```js
  // Explicit SMTP timeouts. nodemailer's defaults are greeting 30 s, connection 2 min
  // and socket 10 min (smtp-connection/index.js:54-57), so a hung mail host could hold a
  // send for ~10 minutes with nothing in the log but silence -- which is how the 2026-08
  // mail outage presented. dnsTimeout keeps its bounded 30 s default. Overridable per box
  // without a code change; a non-numeric or non-positive value falls back rather than
  // handing NaN to nodemailer.
  const ms = (name, fallback) => {
    const n = parseInt(process.env[name], 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  const transportConfig = {
    host: process.env.EMAIL_HOST || 'localhost',
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    secure: process.env.EMAIL_PORT === '465',
    connectionTimeout: ms('EMAIL_CONNECTION_TIMEOUT_MS', 10000),
    greetingTimeout: ms('EMAIL_GREETING_TIMEOUT_MS', 10000),
    socketTimeout: ms('EMAIL_SOCKET_TIMEOUT_MS', 30000),
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production'
    }
  };
```

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
npx jest tests/email 2>&1 | grep -E '^(FAIL|Tests:|Test Suites:)'
git add src/email/transport.js tests/email/transport.test.js
git commit -m "fix(email): explicit SMTP connection/greeting/socket timeouts (Plan 3 Task 21a)" \
  -m "nodemailer's defaults (greeting 30 s, connection 2 min, socket 10 min) let a hung mail
host hold a send for ~10 minutes with nothing in the log but silence. 10 s / 10 s / 30 s,
each overridable via EMAIL_*_TIMEOUT_MS, with a non-numeric or non-positive value falling
back rather than reaching nodemailer as NaN. No .env change on any box: the defaults are
the fix. NOT a fix for the oci2 commands=0/0 SMTP churn -- a timeout cannot produce that." \
  -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: no `FAIL`; `Test Suites: 3 passed, 3 total`; `Tests: 45 passed, 45 total` (**[MEASURED] 42 today**,
    + 3); one commit.

#### 21b — the logger drops nothing, and gains `flushAndExit` (scope-brief item 18)

- [ ] **Step 5: write the failing tests, and prove the measurement.** Append after `:31` (the `});` closing the
      existing describe):

```js

// Item 18. Measured against v0.2.1 (probe, NODE_ENV=production, LOG_DIR in a temp dir):
//   logger.error('A string arg:', 'x@y.z')  -> {"message":"A string arg:"}   value GONE
//   logger.error('A number arg:', 42)       -> {"message":"A number arg:"}   value GONE
//   logger.error('An error arg:', err)      -> message + stack               survives
//   logger.error('An object arg:', {a:1})   -> a:1 merged                    survives
//   logger.error(new Error('x'))            -> {"level":"error"}             message AND stack GONE
// winston writes primitives only into info[SPLAT] (winston/lib/winston/logger.js:258-286),
// which nothing in web-core's format chain read. logform's format.splat() is NOT the fix:
// with no %s token it Object.assigns a STRING into character-indexed keys
// (logform/splat.js:99-113) -- measurably worse than the bug.
describe('utils/logger — no argument is silently dropped', () => {
  const { Writable } = require('stream');
  const winston = require('winston');

  // Read the REAL format chain by attaching a Stream transport to the real logger, so
  // this tests the shipped pipeline and not a re-built copy of it.
  async function captured(fn) {
    const lines = [];
    const stream = new Writable({ write(chunk, _enc, cb) { lines.push(chunk.toString()); cb(); } });
    const logger = require('../../src/utils/logger');
    const transport = new winston.transports.Stream({ stream });
    logger.add(transport);
    try {
      fn(logger);
      await new Promise((r) => setImmediate(r));
    } finally {
      logger.remove(transport);
    }
    return lines.join('').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  }

  it('appends a string extra argument to the message', async () => {
    const [rec] = await captured((l) => l.error('[sendEmail] Sending email to:', 'to@example.com'));
    expect(rec.message).toBe('[sendEmail] Sending email to: to@example.com');
  });

  it('appends a non-string primitive extra argument', async () => {
    const [rec] = await captured((l) => l.warn('retry count:', 3));
    expect(rec.message).toBe('retry count: 3');
  });

  it('appends every extra argument, in order', async () => {
    const [rec] = await captured((l) => l.info('pair:', 'a', 'b'));
    expect(rec.message).toBe('pair: a b');
  });

  it('still merges an object extra argument into the record (unchanged)', async () => {
    const [rec] = await captured((l) => l.warn('geocodeAddress: non-200', { status: 503 }));
    expect(rec.status).toBe(503);
    expect(rec.message).toBe('geocodeAddress: non-200');
  });

  it('merges a SECOND object argument too', async () => {
    const [rec] = await captured((l) => l.info('two metas', { a: 1 }, { b: 2 }));
    expect([rec.a, rec.b]).toEqual([1, 2]);
  });

  it('keeps an Error extra argument as message + stack, without duplicating it', async () => {
    const err = new Error('boom');
    const [rec] = await captured((l) => l.error('Error sending email:', err));
    expect(rec.message).toBe('Error sending email: boom');
    expect(rec.stack).toContain('Error: boom');
  });

  it('captures an Error passed AS the message (message + stack)', async () => {
    const [rec] = await captured((l) => l.error(new Error('error-as-message')));
    expect(rec.message).toBe('error-as-message');
    expect(rec.stack).toContain('Error: error-as-message');
  });

  it('never explodes a string into character-indexed keys', async () => {
    const [rec] = await captured((l) => l.error('addr:', 'no-reply@crhsent.com'));
    expect(Object.keys(rec)).not.toContain('0');
  });
});

describe('utils/logger — flushAndExit', () => {
  let exitSpy;
  afterEach(() => {
    if (exitSpy) exitSpy.mockRestore();
    jest.resetModules();
  });

  it('exits on the logger finish event, not in the calling tick', async () => {
    jest.resetModules();                       // a throwaway instance: end() is terminal
    const logger = require('../../src/utils/logger');
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    logger.error('boot failed:', 'no reason today');
    logger.flushAndExit(3);
    expect(exitSpy).not.toHaveBeenCalled();    // the bug this replaces: exit in the same tick
    await new Promise((r) => logger.on('finish', r));
    await new Promise((r) => setImmediate(r));
    expect(exitSpy).toHaveBeenCalledWith(3);
  });
});
```

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/utils/logger.test.js 2>&1 | grep -E '✕|✓|Expected|Received|TypeError|Tests:'
```
  - Expected: `Tests: 6 failed, 5 passed, 11 total`, failing as:
    - the three primitive cases: `Expected: "[sendEmail] Sending email to: to@example.com"` /
      `Received: "[sendEmail] Sending email to:"` — the argument is missing, which **is** the defect;
    - `merges a SECOND object argument too`: `Expected: [1, 2]` / `Received: [1, undefined]` — winston merges only
      the **first** splat entry;
    - `captures an Error passed AS the message`: `Received: undefined` for `rec.message`;
    - `flushAndExit`: `TypeError: logger.flushAndExit is not a function`.
  - **Three must PASS already** — the object merge, the `Error` extra argument, and
    `never explodes a string into character-indexed keys`. That third pass is C21-4: if it **fails** here, somebody
    has added `format.splat()` and it must be removed before this task proceeds.

- [ ] **Step 6: implement.** Replace `src/utils/logger.js:1-8` with:

```js
const winston = require('winston');
const path = require('path');
const util = require('util');

// triple-beam's SPLAT, by value not by require: it is defined as Symbol.for('splat')
// (node_modules/triple-beam/index.js), a registry symbol, so this IS the symbol winston
// and logform use -- with no new declared dependency on a package the boxes install by
// file: copy.
const SPLAT = Symbol.for('splat');

/**
 * Nothing handed to logger.*() may be dropped.
 *
 * winston merges an OBJECT first extra argument into the record, and for an Error appends
 * its message and copies its stack (winston/lib/winston/logger.js:258-286). Extra
 * PRIMITIVES it writes only into info[SPLAT], which nothing read -- so
 * `logger.info('To:', address)` logged the label and threw the address away, and
 * `logger.error('boot failed:', err.message)` logged no reason at all.
 *
 * logform's own format.splat() is NOT the fix: with no %s token it runs
 * Object.assign(info, '<string>') (logform/splat.js:99-113), exploding the string into
 * character-indexed keys in every JSON line -- measurably worse than the bug.
 *
 * %-tokens are deliberately NOT interpolated: the value is appended instead, so it is
 * visible rather than lost, and there is no second precedence model to reason about.
 * winston merges nothing when the message carries a token, so in that case every splat
 * entry is still ours to handle.
 */
const captureExtraArgs = winston.format((info) => {
  const splat = info[SPLAT];
  if (!Array.isArray(splat) || splat.length === 0) return info;
  const mergedIndex = /%[scdjifoO%]/.test(String(info.message)) ? -1 : 0;
  const tail = [];
  splat.forEach((arg, i) => {
    if (arg instanceof Error) {
      if (i !== mergedIndex) tail.push(arg.stack || String(arg));
    } else if (arg !== null && typeof arg === 'object') {
      if (i !== mergedIndex) Object.assign(info, arg);
    } else {
      tail.push(typeof arg === 'string' ? arg : util.inspect(arg));
    }
  });
  if (tail.length) info.message = `${info.message} ${tail.join(' ')}`;
  return info;
});

// Define log format
const logFormat = winston.format.combine(
  // An Error passed AS the message kept neither its message nor its stack.
  winston.format.errors({ stack: true }),
  captureExtraArgs(),
  winston.format.timestamp(),
  winston.format.json()
);
```

  Then insert before `:54` (`module.exports = logger;`):

```js
/**
 * Exit the process only after Winston's file transports have flushed.
 *
 * process.exit() in the same tick as logger.error() loses the line entirely, and in
 * production there is no Console transport either -- a refused boot became a silent PM2
 * crash-loop. Lifted from the copy inlined at crhs-corporate/server.js:172-178 so both
 * apps share one implementation. The timeout is capped so a wedged transport can never
 * hang the exit.
 * @param {number} [code=1] process exit code
 * @param {{timeoutMs?: number}} [opts]
 */
logger.flushAndExit = (code = 1, { timeoutMs = 750 } = {}) => {
  const bail = () => process.exit(code);
  setTimeout(bail, timeoutMs).unref();
  try {
    logger.on('finish', bail);
    logger.end();
  } catch (e) {
    bail();
  }
};

```

- [ ] **Step 7: run green, then prove the repaired call sites end to end in the shape production uses.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
npx jest tests/utils/logger.test.js tests/utils/auditLogger.test.js tests/utils/auditLoggerLogDir.test.js 2>&1 | grep -E '^(FAIL|Tests:|Test Suites:)'
D=$(mktemp -d) && NODE_ENV=production LOG_DIR=$D node -e "
const logger = require('./src/utils/logger');
logger.error('crhs-corporate boot failed:', new Error('ENOTFOUND mail.crhsent.com').message);
logger.info('[sendEmail] Sending email to:', 'owner@example.com');
logger.on('finish', () => process.exit(0)); logger.end();" \
  && sed 's/,"timestamp.*//' "$D/combined.log" && rm -rf "$D"
```
  - Expected: no `FAIL`; `Tests: 11 passed, 11 total` for `logger.test.js` and the two auditLogger suites green
    (they share the transport chain); then **exactly two lines**:
    `{"level":"error","message":"crhs-corporate boot failed: ENOTFOUND mail.crhsent.com","service":"app"`
    and `{"level":"info","message":"[sendEmail] Sending email to: owner@example.com","service":"app"`.
    Against `v0.2.1` the same script prints both messages **without** the reason and **without** the address —
    which is the live consequence at `crhs-corporate/server.js:162` and `:172`, repaired here with no consumer edit.

- [ ] **Step 8: document the contract, assert the surface, commit.** Append to `README.md`, above the closing
      copyright line:

```markdown
## Logging contract

`logger.info|warn|error|debug(message, ...extra)` never drops an argument:

- a **primitive** extra argument is appended to the message — `logger.info('To:', addr)` logs `To: a@b.c`;
- an **object** merges into the JSON record as fields — `logger.warn('non-200', { status: 503 })`;
- an **Error** keeps its message and stack, whether it is the message or an extra argument.

Before v0.3.0 the primitive form was silently discarded (winston writes it only to `info[SPLAT]`), which is why a
boot failure logged `boot failed:` with no reason. `winston.format.splat()` is deliberately NOT used: with no
`%s` token logform does `Object.assign(info, '<string>')`, exploding the string into character-indexed keys.

Use `logger.flushAndExit(code)` instead of `process.exit(code)` after a final log line: `process.exit()` in the
same tick loses the line, and production has no Console transport.
```

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
node -p "Object.keys(require('./src')).length"
node -p "typeof require('./src').logger.flushAndExit"
node -p "Object.keys(require('./src').csrf)"
npx jest tests/index.smoke.test.js 2>&1 | grep -E '^Tests:'
git add src/utils/logger.js tests/utils/logger.test.js README.md
git commit -m "fix(logger): stop dropping primitive arguments; capture Errors; add flushAndExit (Plan 3 Task 21b)" \
  -m "logger.error('msg:', 'value') logged only the label -- winston writes primitives to
info[SPLAT] and nothing in the chain read it, so the corporate boot-failure line logged no
reason at all. The brief's claim was half right: an Error extra arg already survived with
its stack, an object already merged; only primitives were lost. format.splat() is not the
fix -- with no %s token logform Object.assigns a string into character-indexed keys, which
is worse than the bug -- so a 12-line captureExtraArgs format is, and no ESLint rule is
added: at lint time the losing call sites are indistinguishable from the correct ones, and
a rule wide enough to catch them would lose the stacks winston captures today.
format.errors({stack:true}) rescues an Error passed as the message. flushAndExit lifts the
exit-on-finish idiom out of crhs-corporate/server.js and attaches to the logger export, so
the index surface stays at 26 keys and every box gate command keeps working verbatim." \
  -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: `26`; `function`; `[ 'createCsrf', 'CSRF_COOKIE_NAME' ]`; the smoke suite green; one commit.
    A `27` → **STOP**: every Plan 2 box gate asserts `26`, and changing a production gate command in this release
    is not acceptable.

#### 21c — a deploy-stable locale cache token (scope-brief item 19)

- [ ] **Step 9: write the failing tests.** Insert before `:165` (the file's final `});`):

```js

// Item 19. The loader appended ?v=<new Date().getTime()> to every locale request, so
// every page load minted a unique URL and the /locales cache -- browser AND Cloudflare
// edge -- was never hit, on a file that is on the critical path. Same defect and same fix
// as the portal's own copy of this loader.
describe('locale cache token (item 19)', () => {
  // Re-stub fetch AFTER load so the request URL can be read, then load a language that
  // is not already in loadedLanguages.
  async function localeUrlFor(window, lang) {
    const urls = [];
    window.fetch = (url) => {
      urls.push(url);
      return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve({}) });
    };
    await window.i18n.loadLanguage(lang);
    return urls[0];
  }

  test('no clock appears in the loader at all', () => {
    expect(I18N_SRC).not.toMatch(/new Date\(\)\.getTime\(\)/);
    expect(I18N_SRC).not.toMatch(/Date\.now\(\)/);
  });

  test('falls back to a stable constant when nothing publishes a version', async () => {
    const window = loadI18n({});
    expect(await localeUrlFor(window, 'es')).toBe('/locales/es/common.json?v=static');
  });

  test('uses the asset-version meta when the app publishes one', async () => {
    const window = loadI18n({});
    const meta = window.document.createElement('meta');
    meta.setAttribute('name', 'asset-version');
    meta.setAttribute('content', '20260920a');
    window.document.head.appendChild(meta);
    expect(await localeUrlFor(window, 'pt')).toBe('/locales/pt/common.json?v=20260920a');
  });

  test('inherits the token already stamped on this loader\'s own script URL', async () => {
    const window = loadI18n({});
    const tag = window.document.createElement('script');
    tag.setAttribute('src', '/assets/js/i18n.js?v=20260909a');
    window.document.head.appendChild(tag);
    expect(await localeUrlFor(window, 'de')).toBe('/locales/de/common.json?v=20260909a');
  });

  test('the meta wins over the stamped script URL', async () => {
    const window = loadI18n({});
    const tag = window.document.createElement('script');
    tag.setAttribute('src', '/assets/js/i18n.js?v=20260909a');
    window.document.head.appendChild(tag);
    const meta = window.document.createElement('meta');
    meta.setAttribute('name', 'asset-version');
    meta.setAttribute('content', '20260920a');
    window.document.head.appendChild(meta);
    expect(await localeUrlFor(window, 'es')).toBe('/locales/es/common.json?v=20260920a');
  });
});
```

- [ ] **Step 10: run red.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/assets/i18n.test.js 2>&1 | grep -E '✕|Received|Tests:'
```
  - Expected: `Tests: 5 failed, 10 passed, 15 total` — all five new tests fail. Each URL failure reads
    `Expected: "/locales/es/common.json?v=static"` / `Received: "/locales/es/common.json?v=17…"`, a 13-digit
    epoch — the clock, which is the defect. `no clock appears in the loader` fails on `new Date().getTime()`
    still being present at [MEASURED] `:96`.
    A failure showing `?v=undefined` instead → **STOP**: the method name does not match the call.

- [ ] **Step 11: implement.** Insert after `:7` (`'use strict';`):

```js

  // The URL this loader was served from, captured while the script is executing. Host
  // pages already stamp a deploy token on it; assetVersion() inherits that.
  const SELF_SRC = (document.currentScript && document.currentScript.src) || '';
```

  Insert after the `detectLanguage()` method (its closing `},` at `:84`):

```js

    /**
         * Deploy-stable cache token for the locale fetch — never a clock.
         * Precedence: the app-published <meta name="asset-version">, then the v= token
         * the host page already stamps on this loader's own <script src>, then a
         * constant. Mirrors the fix in the portal's own copy of this loader.
         */
    assetVersion() {
      const meta = document.querySelector('meta[name="asset-version"]');
      const fromMeta = ((meta && meta.getAttribute('content')) || '').trim();
      if (fromMeta) return fromMeta;
      const src = SELF_SRC || ((document.querySelector('script[src*="i18n.js"]') || {}).src || '');
      const stamped = /[?&]v=([^&#]+)/.exec(src);
      return (stamped && stamped[1].trim()) || 'static';
    },
```

  Replace `:95-97` (`// Add cache-busting parameter to force reload`, the `timestamp` const and the `url` const) with:

```js
        // Deploy-stable token, not a clock: a per-load timestamp made every locale URL
        // unique and threw away the /locales cache on every visit, browser and Cloudflare
        // edge alike, on a file that is on the critical path.
        const url = `${this.config.translationsPath}/${lang}/common.json?v=${this.assetVersion()}`;
```

- [ ] **Step 12: run green and commit.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
npx jest tests/assets/i18n.test.js 2>&1 | grep -E '^(Tests:|Test Suites:)'
printf 'getTime() left = %s\n' "$(grep -c 'getTime()' assets/js/i18n.js || true)"
npm test 2>&1 | grep -E '^(FAIL|Tests:|Test Suites:)'
npm run lint 2>&1 | tail -2
npx madge --circular src/ 2>&1 | tail -2
git add assets/js/i18n.js tests/assets/i18n.test.js
git commit -m "assets(i18n): deploy-stable locale cache token, never a clock (Plan 3 Task 21c)" \
  -m "?v=<timestamp>-per-load minted a unique URL on every page load, so /locales was never
served from the browser or the Cloudflare edge. Precedence: the asset-version meta the
portal already publishes, then the v= the host page already stamps on this loader's own
script URL -- which gives the marketing hosts a deploy-accurate token with zero
content-app edits -- then a constant. Corporate serves /locales with maxAge 1h, so the
worst case if a deploy re-stamps neither source is one self-healing hour." \
  -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 \
  "printf 'T21_DELTA=17\nT21_DONE=yes\n' >> /var/www/wavemax/cutover-logs/plan3-record.env"
```
  - Expected: `Tests: 15 passed, 15 total` (**[MEASURED] 10 today**, + 5); `getTime() left = 0`;
    the full suite with no `FAIL` and a count equal to `WC_TESTS_AFTER_T19 + 6 + 17`; lint clean;
    `✔ No circular dependency found!`; three commits total for Task 21; `T21_DELTA=17` recorded.

**Rollback (exact; per sub-task, newest first).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git log --oneline -3
git revert --no-edit HEAD                                     # 21c
npx jest tests/assets/i18n.test.js 2>&1 | grep -E '^Tests:'; grep -c 'getTime()' assets/js/i18n.js
git revert --no-edit HEAD                                     # 21b
npx jest tests/utils/logger.test.js tests/utils/auditLogger.test.js 2>&1 | grep -E '^Tests:'
node -p "typeof require('./src').logger.flushAndExit"
git revert --no-edit HEAD                                     # 21a
npx jest tests/email 2>&1 | grep -E '^Tests:'
```
- Rollback expected: 21c → `Tests: 10 passed, 10 total` and `1` (the clock is back);
  21b → `Tests: 2 passed, 2 total` for `logger.test.js`, no failures in the auditLogger suites, and
  `undefined` for `flushAndExit`; 21a → `Tests: 42 passed, 42 total`.
- Rollback notes:
  - **21b is the dangerous one to revert late.** If any consumer has adopted `logger.flushAndExit`, reverting it
    is a `TypeError` at the moment of a failed boot — the worst possible time. Nothing adopts it inside Phase 3
    (escalation row 3); any adoption elsewhere must be reverted first.
  - 21c reverted restores per-load cache-busting: slow, never stale. Safe in either direction with no cache purge.
  - 21a adds no `.env` key, so a rollback needs no box-side follow-up.
  - All three are local until Task 24. Nothing on a box changes.

---

### Task 22: [web-core] the i18n `localStorage` key becomes `app-language`, **with a migration shim**

> Owner decision 1, settled: **rename, and carry existing visitors across.** Plan 2 Task 6 deliberately left the
> key alone — *"renaming it resets every visitor's saved language"* — and the shim is precisely what reverses that
> objection, so this task supersedes that note. There is no "should we rename" question to re-ask (**R-14**).
>
> New key: **`app-language`** — web-core's established neutral default (the logger's `service` tag defaults to
> `'app'`, the session cookie base to `'app.sid'`).
>
> **Why the shim is load-bearing, not politeness.** The legacy value on the marketing origins was written by the
> **portal's** copy of this loader, because nginx pointed those hosts at `:3000` until Phase 1. After a host flips
> to `:3001`, the same browser, same origin, is served **web-core's** copy. Without the shim, the flip silently
> resets the language of every returning visitor on that host — a user-visible regression caused by an
> infrastructure change, exactly the class of thing Plan 3 must not ship. `localStorage` is per-origin, so nothing
> crosses between `portal.atxwashdryfold.com` and the marketing hosts, and the portal's own copy
> (`public/assets/js/i18n.js:18`) keeps its key and is **not touched here**.

**Files:**
- Modify: `crhs-web-core/assets/js/i18n.js` — `:16` `storageKey` plus a new `legacyStorageKey` line;
  a new `migrateStoredLanguage()` method before `detectLanguage()` (its JSDoc at `:55-57`);
  `detectLanguage()`'s `localStorage` read at `:59-60`.
- Modify: `crhs-web-core/tests/assets/i18n.test.js` — a new `describe` before the file's final `});`.
- **NOT modified: `assets/js/parent-iframe-bridge-v3.js`.** Slice D's D6 edited its `LANGUAGE_KEY` at `:25` "so the
  rename is atomic if D lands before B", with the steps unconditionally assuming the file exists (X29). In this
  assembly **Task 19c deleted it two tasks ago**, so that half of D6 is dropped outright and Step 1 asserts the
  file is gone rather than wrapping an edit in `[ -f … ]`.

**Interfaces:**

*Consumes — every row asserted:*

| # | consumed artefact | asserted by |
|:--|:--|:--|
| C22-1 | **Task 19c landed**: `parent-iframe-bridge-v3.js` is gone, so there is no second copy of the key to keep in step | **Step 1** (`test ! -e` → `BRIDGE_ABSENT`) |
| C22-2 | **Task 21c landed**: this task edits the same file and must not be rebased over a clock | **Step 1** (`grep -c 'getTime()'` = 0, `grep -c assetVersion` ≥ 2, clean tree) |
| C22-3 | **Tasks 9–14 flipped the hosts** — which is *why* the shim exists, and it is asserted, not asserted-in-prose | **Step 2** (the six-line flip probe from Task 16 Step 1, re-run) |
| C22-4 | today the loader reads the legacy key directly, so the tests fail for the measured reason | **Step 4** (six of seven new cases fail; the seventh passes before and after) |

*Produces:* `i18n.config.storageKey === 'app-language'`; a preference saved under the legacy key read **once**,
rewritten under the new key, and the legacy key removed; `detectLanguage()` that cannot throw on
private-mode/disabled storage; exactly **one** surviving `wavemax-language` literal in `assets/js/i18n.js` — the
migration read, which is the single allowlisted line Task 23 counts; `REC` gets `T22_DELTA=7`.

- [ ] **Step 1: gate on Tasks 19c and 21c.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
test ! -e assets/js/parent-iframe-bridge-v3.js && echo BRIDGE_ABSENT
printf 'clock left = %s | assetVersion refs = %s\n' \
  "$(grep -c 'getTime()' assets/js/i18n.js || true)" "$(grep -c 'assetVersion' assets/js/i18n.js || true)"
printf 'legacy literal count = %s\n' "$(grep -c 'wavemax-language' assets/js/i18n.js || true)"
git status --porcelain | wc -l
```
  - Expected: `BRIDGE_ABSENT`; `clock left = 0 | assetVersion refs = 2`; `legacy literal count = 1`; `0`.
    A `BRIDGE_ABSENT` failure means Task 19c has not landed and the rename would leave two copies of the key
    diverging. A non-zero clock means Task 21c has not landed. Either → **STOP.**

- [ ] **Step 2: re-assert the flips — the reason this shim exists (C22-3).**
      Re-run **Task 16 Step 1 verbatim** and require the same six
      `content=1 portal=0 health_ct=application/json; charset=utf-8 embed=301` lines.
  - Expected: six matching lines. If a host is **not** flipped, the shim is not yet load-bearing for it and the
    rename is premature for that origin: **STOP** and finish Phase 1 first. This turns slice D's prose
    justification into a gate.

- [ ] **Step 3: write the failing tests.** Insert before the file's final `});`:

```js

// Owner decision 1. The legacy key's values on the marketing origins were written by the
// PORTAL's copy of this loader (those hosts pointed at :3000 until Plan 3 Phase 1 flipped
// them), so dropping the read would reset the language of every returning visitor at the
// moment of an infrastructure change.
describe('language storage key migration (owner decision 1)', () => {
  test('the configured key is the neutral one', () => {
    expect(loadI18n({}).i18n.config.storageKey).toBe('app-language');
  });

  test('adopts a value saved under the legacy key and clears the legacy key', () => {
    const window = loadI18n({});
    window.localStorage.setItem('wavemax-language', 'de');
    expect(window.i18n.detectLanguage()).toBe('de');
    expect(window.localStorage.getItem('app-language')).toBe('de');
    expect(window.localStorage.getItem('wavemax-language')).toBeNull();
  });

  test('a value already under the new key wins, and the legacy key is cleared', () => {
    const window = loadI18n({});
    window.localStorage.setItem('app-language', 'pt');
    window.localStorage.setItem('wavemax-language', 'de');
    expect(window.i18n.detectLanguage()).toBe('pt');
    expect(window.localStorage.getItem('wavemax-language')).toBeNull();
  });

  test('an unsupported legacy value is discarded, not adopted', () => {
    const window = loadI18n({});
    window.localStorage.setItem('wavemax-language', 'fr');
    expect(window.i18n.detectLanguage()).toBe('en');
    expect(window.localStorage.getItem('app-language')).toBeNull();
    expect(window.localStorage.getItem('wavemax-language')).toBeNull();
  });

  test('setLanguage writes only the new key', async () => {
    const window = loadI18n({ greeting: 'hi' });
    await window.i18n.setLanguage('es');
    expect(window.localStorage.getItem('app-language')).toBe('es');
    expect(window.localStorage.getItem('wavemax-language')).toBeNull();
  });

  test('storage that throws does not break language detection', () => {
    const window = loadI18n({});
    Object.defineProperty(window.localStorage, 'getItem', {
      configurable: true,
      value: () => { throw new Error('SecurityError'); }
    });
    expect(() => window.i18n.detectLanguage()).not.toThrow();
  });

  test('the legacy literal appears exactly once — the migration read (Task 23 counts this line)', () => {
    expect(I18N_SRC.split('wavemax-language').length - 1).toBe(1);
  });
});
```

- [ ] **Step 4: run red and confirm the reasons.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/assets/i18n.test.js 2>&1 | grep -E '✕|✓ the legacy literal|Expected|Received|Tests:'
```
  - Expected: `Tests: 6 failed, 16 passed, 22 total` — six of the seven new cases fail:
    - `the configured key is the neutral one`: `Expected: "app-language"` / `Received: "wavemax-language"`;
    - `adopts a value saved under the legacy key`: `Expected: "de"` / `Received: null` reading `app-language`
      (today `detectLanguage()` returns `'de'` correctly, but by reading the **legacy** key directly);
    - `a value already under the new key wins`: `Expected: "pt"` / `Received: "de"`;
    - `an unsupported legacy value is discarded`: the first two assertions pass and the **third** fails —
      `Expected: null` / `Received: "fr"` — because nothing removes the legacy key today;
    - `setLanguage writes only the new key`: `Expected: "es"` / `Received: null`;
    - `storage that throws does not break language detection`: today `detectLanguage()` calls
      `localStorage.getItem` bare, so it **did** throw `SecurityError`.
  - **`the legacy literal appears exactly once` must PASS now and still pass after the change** — it is the
    count Task 23's allowlist depends on, stated as a fence rather than dressed up as red-green.

- [ ] **Step 5: implement.** Replace `:16`:

```js
      storageKey: 'wavemax-language',
```
  with:

```js
      storageKey: 'app-language',
      // One-time migration SOURCE, read-only. The saved value on the marketing origins
      // was written by the portal's own copy of this loader while those hosts still
      // pointed at the portal, so dropping this read would reset every returning
      // visitor's language at the moment nginx flipped the host.
      // Delete this key and migrateStoredLanguage() after 2027-01-01.
      legacyStorageKey: 'wavemax-language',
```

  Insert before `detectLanguage()` (its JSDoc at `:55-57`):

```js
    /**
         * Move a preference saved under the legacy key to the current one, once.
         * Never throws: private-mode / disabled storage must not break init.
         */
    migrateStoredLanguage() {
      const { storageKey, legacyStorageKey, supportedLanguages } = this.config;
      if (!legacyStorageKey || legacyStorageKey === storageKey) return;
      try {
        const legacy = localStorage.getItem(legacyStorageKey);
        if (legacy === null) return;
        if (!localStorage.getItem(storageKey) && supportedLanguages.includes(legacy)) {
          localStorage.setItem(storageKey, legacy);
        }
        localStorage.removeItem(legacyStorageKey);
      } catch (e) {
        // no storage available — detectLanguage falls through to URL/browser/default
      }
    },

```

  and in `detectLanguage()` replace `:59-60`:

```js
      // 1. Check localStorage
      const storedLang = localStorage.getItem(this.config.storageKey);
```
  with:

```js
      // 1. Check localStorage (adopting a value saved under the legacy key once)
      this.migrateStoredLanguage();
      let storedLang = null;
      try { storedLang = localStorage.getItem(this.config.storageKey); } catch (e) { storedLang = null; }
```

- [ ] **Step 6: run green and commit.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
npx jest tests/assets 2>&1 | grep -E '^(FAIL|Tests:|Test Suites:)'
printf 'i18n.js legacy literals = %s\n' "$(grep -c 'wavemax-language' assets/js/i18n.js || true)"
printf 'any other legacy literal in assets/ = %s\n' "$(git grep -lI 'wavemax-language' -- assets | grep -vc '^assets/js/i18n\.js$' || true)"
npm test 2>&1 | grep -E '^(FAIL|Tests:|Test Suites:)'
npm run lint 2>&1 | tail -2
git add assets/js/i18n.js tests/assets/i18n.test.js
git commit -m "assets(i18n)!: storageKey 'app-language' with a one-time migration shim (Plan 3 Task 22, owner decision 1)" \
  -m "The legacy value on the marketing origins was written by the PORTAL's copy of this
loader -- those hosts pointed at :3000 until Phase 1 flipped them -- so a bare rename
would have reset every returning visitor's language the moment nginx changed, a
user-visible regression caused by an infrastructure change. The shim reads the legacy key
once, rewrites it under the new key, and removes it; an unsupported legacy value is
discarded rather than adopted; and detectLanguage can no longer throw on private-mode or
disabled storage. The one surviving legacy literal is that migration read, and the brand
guard allowlists exactly that one line. Delete the shim after 2027-01-01.

The bridge's own LANGUAGE_KEY needed no matching edit: Task 19c deleted that file." \
  -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 \
  "printf 'T22_DELTA=7\nT22_DONE=yes\n' >> /var/www/wavemax/cutover-logs/plan3-record.env"
```
  - Expected: no `FAIL`; `Test Suites: 2 passed, 2 total`; `Tests: 26 passed, 26 total` for `tests/assets`
    (14 at Phase-3 start, +5 from Task 21c, +7 here); `i18n.js legacy literals = 1`;
    `any other legacy literal in assets/ = 0`; the full suite with no `FAIL` at
    `WC_TESTS_AFTER_T19 + 6 + 17 + 7`; lint clean; one commit.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git log --oneline -1 && git revert --no-edit HEAD
npx jest tests/assets 2>&1 | grep -E '^(Tests:|Test Suites:)'
grep -c 'wavemax-language' assets/js/i18n.js
node -e 'const fs=require("fs");console.log(/storageKey: .app-language./.test(fs.readFileSync("assets/js/i18n.js","utf8")))'
```
- Rollback expected: `Test Suites: 2 passed, 2 total`, `Tests: 19 passed, 19 total` (26 − 7); `1`; `false`.
- **Rollback note — asymmetric; read before reverting after Task 24.** Once v0.3.0 has served a visitor, that
  browser holds `app-language` and no longer holds the legacy key. Reverting the code makes the loader read the
  legacy key again, so that visitor falls back to browser/default language on their next visit. It is a language
  reset, not data loss, and it affects only visitors served between the deploy and the rollback. There is no
  box-side action that restores a visitor's legacy key — a box rollback cannot reach `localStorage`.
- Task 23's allowlist count for `assets/js/i18n.js` is **1 either way** (the `storageKey` literal before, the
  `legacyStorageKey` read after), so a revert of this task does **not** require reverting Task 23.

---

### Task 23: [web-core] the brand-neutrality guard covers everything outside `src/`, with a self-expiring allowlist

> [MEASURED] `tests/brandNeutral.test.js:7` scans `src/` **only**, which is why backlog **B-4**'s remainder
> survived outside it. This task extends the guard to `assets/` and the repo-root metadata, records every
> surviving literal with its reason **and the event that removes it**, and asserts each allowlist row still names
> a real, still-matching file — so **a row cannot outlive its reason**.
>
> **This task is why the skeleton lists it separately, and it is where X6 is closed.** Slice D's D7 hard-coded
> `ALLOW` rows for `assets/js/iframe-bridge-v2.js` (7 lines) and `assets/js/parent-iframe-bridge-v3.js` (11), and
> its third test asserts every row still names an existing file — while slice B's B7 `git rm`s both files and **no
> draft pruned the rows**. Written in that order, the guard fails permanently and blocks the release carrying the
> live nonce fix. Here the ordering does the work: **Task 19c already deleted both files**, so this allowlist is
> written **without** bridge rows and additionally **asserts their absence**, which makes the row impossible to
> re-add by hand. Nothing is "pruned later".

**Files:**
- Modify (rewrite): `crhs-web-core/tests/brandNeutral.test.js` (22 lines today).
- Modify: `crhs-web-core/assets/js/language-switcher.js` — `:2`, comment only.

**Interfaces:**

*Consumes — every row asserted:*

| # | consumed artefact | asserted by |
|:--|:--|:--|
| C23-1 | **Task 19c landed**: both bridge files are gone, so no bridge row belongs in `ALLOW` | **Step 1** (`test ! -e` ×2 → `BRIDGES_ABSENT`) + the new `it('no allowlist row names a deleted bridge')` |
| C23-2 | **Task 22 landed**: `assets/js/i18n.js` carries exactly **one** literal and it is the migration read | **Step 1** (`grep -c` = 1 **and** the line matches `legacyStorageKey`) |
| C23-3 | the pre-change counts, so the one intentional failure is the only one | **Step 3** (received object differs from expected in exactly one key) |
| C23-4 | the legal pages and `LICENSE` are **escalated, not edited** | **Step 5** (`git status --porcelain` names neither `assets/legal` nor `LICENSE`) |

*Produces:* a guard that fails on **any new** brand literal anywhere in the package, and that fails when an
allowlisted file is deleted or de-branded elsewhere; `assets/js/language-switcher.js` de-branded; `REC` gets
`T23_DELTA=2` and `T23_LEGAL_ESCALATION=pending`.

*Counts after Tasks 19c and 22, re-measured 2026-09-21 with the guard's own pattern*
`/wavemax|rundberglaundry|runberglaundry|atxwash|wavemaxlaundry/i`, matching **lines**:

| path | before this task | after | disposition |
|:--|--:|--:|:--|
| `assets/js/iframe-bridge-v2.js` | — | — | **deleted by Task 19c** (was 7) |
| `assets/js/parent-iframe-bridge-v3.js` | — | — | **deleted by Task 19c** (was 12) |
| `assets/js/i18n.js` | 1 | **1** | the Task 22 migration read; deleted with the shim after 2027-01-01 |
| `assets/js/language-switcher.js` | 1 | **0** | fixed in this task |
| `assets/legal/privacy-policy.html` | 17 | **17** | owner/counsel — **delete or keep** |
| `assets/legal/refund-policy.html` | 10 | **10** | owner/counsel — **delete or keep** |
| `assets/legal/terms-and-conditions.html` | 11 | **11** | owner/counsel — **delete or keep** |
| `LICENSE` | 2 | **2** | counsel — trademark carve-out + notice address |
| `README.md`, `package.json`, `jest.config.js`, `.eslintrc.js`, `assets/js/css-async.js` | 0 | 0 | — |

*Not scanned:* `tests/` (the guard itself must spell the pattern) and `node_modules/`.

*The ask to counsel is "delete or keep", not "review this text"* (the reviewer's finding, verified): the three
legal pages are **unreferenced dead copies** — corporate serves exactly two files from `assetsDir`
(`server/webCoreAssets.js:10`), the portal serves its own `public/` copies, and nothing in either app resolves
`assetsDir/legal`. Deleting them from web-core removes the franchisor mark from the shared package without touching
any **published** legal text. The `ALLOW` reason strings point at **one** path,
`docs/superpowers/ESCALATIONS.md` (X13), which Task 35 writes; slice D's `docs/refactor/OWNER-COUNSEL-ESCALATIONS.md`
is **not** created — four competing lists was the failure mode the criterion was written against.

- [ ] **Step 1: gate on Tasks 19c and 22, and pin the pre-change counts.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
test ! -e assets/js/iframe-bridge-v2.js && test ! -e assets/js/parent-iframe-bridge-v3.js && echo BRIDGES_ABSENT
printf 'i18n literals = %s | is the migration read = %s\n' \
  "$(grep -c 'wavemax-language' assets/js/i18n.js || true)" \
  "$(grep -c 'legacyStorageKey:' assets/js/i18n.js || true)"
for f in $(find src assets -type f) README.md LICENSE package.json jest.config.js .eslintrc.js; do
  n=$(grep -Eic 'wavemax|rundberglaundry|runberglaundry|atxwash|wavemaxlaundry' "$f" 2>/dev/null || true)
  [ "${n:-0}" != 0 ] && printf '%3s %s\n' "$n" "$f"
done
git status --porcelain | wc -l
```
  - Expected: `BRIDGES_ABSENT`; `i18n literals = 1 | is the migration read = 1`; then exactly six lines —
    `1 assets/js/i18n.js`, `1 assets/js/language-switcher.js`, `17 assets/legal/privacy-policy.html`,
    `10 assets/legal/refund-policy.html`, `11 assets/legal/terms-and-conditions.html`, `2 LICENSE`
    (order as `find` yields; the **set** and the **counts** are what matter); then `0`.
  - **[MEASURED] today the same command also prints `7 assets/js/iframe-bridge-v2.js` and
    `12 assets/js/parent-iframe-bridge-v3.js`** — their absence is the proof Task 19c landed.
  - Any **other** file, or any other count → **STOP**: the counts below were measured on 2026-09-21 and something
    else changed. Re-measure and update the `ALLOW` table before editing it — never adjust a count to make the
    guard pass.
  - A `0` for `is the migration read` means Task 22 has not landed: the one `i18n.js` literal is still the live
    `storageKey`, and allowlisting it with the reason "migration read" would be a lie in a durable record.

- [ ] **Step 2: write the failing guard.** Replace the whole of `tests/brandNeutral.test.js` with:

```js
// Spec §7.2.2 brand-neutrality guard.
//
// Plan 2 Task 7 shipped this over src/ ONLY, which is why B-4's remainder survived
// outside it. Plan 3 Task 23 extends it to assets/ and the repo-root metadata.
//
// ALLOW records every literal that still exists OUTSIDE src/, its reason, and the event
// that removes it. `lines` is EXACT, so a NEW literal in an allowlisted file fails. Each
// row is also asserted to still exist and still match, so a row cannot outlive its
// reason — and a separate case asserts the two iframe-bridge rows are NOT here: Plan 3
// Task 19c deleted those files, and re-adding a row for a deleted file is the exact
// defect this guard exists to prevent.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PATTERN = /wavemax|rundberglaundry|runberglaundry|atxwash|wavemaxlaundry/i;
const DIRS = ['src', 'assets'];
const FILES = ['README.md', 'LICENSE', 'package.json', 'jest.config.js', '.eslintrc.js'];
const ESCALATIONS = 'docs/superpowers/ESCALATIONS.md (affiliate repo) — the single Plan 3 list';

const ALLOW = {
  'assets/js/i18n.js': {
    lines: 1,
    reason: `legacyStorageKey — the one-time language migration read (Plan 3 Task 22); delete with the shim after 2027-01-01`
  },
  'assets/legal/privacy-policy.html': {
    lines: 17,
    reason: `legal text in an UNREFERENCED dead copy (neither consumer resolves assetsDir/legal) — owner/counsel decide delete-or-keep; see ${ESCALATIONS}; never edited unilaterally`
  },
  'assets/legal/refund-policy.html': {
    lines: 10,
    reason: `legal text in an UNREFERENCED dead copy — owner/counsel delete-or-keep; see ${ESCALATIONS}`
  },
  'assets/legal/terms-and-conditions.html': {
    lines: 11,
    reason: `legal text in an UNREFERENCED dead copy — owner/counsel delete-or-keep; see ${ESCALATIONS}`
  },
  LICENSE: {
    lines: 2,
    reason: `licence text — counsel: does the trademark carve-out keep naming the franchisor, and does the notice address change? see ${ESCALATIONS}`
  }
};

// Files whose literals died with the file. A row here is a bug, not an omission.
const DELETED_BY_PLAN3 = [
  'assets/js/iframe-bridge-v2.js',
  'assets/js/parent-iframe-bridge-v3.js'
];

const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

const scanned = () => [
  ...DIRS.flatMap((d) => walk(path.join(ROOT, d))),
  ...FILES.map((f) => path.join(ROOT, f))
];

const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');
const countMatchingLines = (abs) => fs.readFileSync(abs, 'utf8')
  .split('\n').filter((line) => PATTERN.test(line)).length;

describe('web-core is brand-neutral (§7.2.2)', () => {
  it('no src/ file mentions the franchisor mark or a marketing/retired domain', () => {
    const offenders = [];
    for (const file of walk(path.join(ROOT, 'src'))) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (PATTERN.test(line)) offenders.push(`${rel(file)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('every literal outside src/ is allowlisted, with the exact line count', () => {
    const found = {};
    for (const abs of scanned()) {
      const n = countMatchingLines(abs);
      if (n > 0) found[rel(abs)] = n;
    }
    const expected = Object.fromEntries(Object.entries(ALLOW).map(([k, v]) => [k, v.lines]));
    expect(found).toEqual(expected);
  });

  it('every allowlist row still names a real file that still matches — no row outlives its reason', () => {
    for (const [r, row] of Object.entries(ALLOW)) {
      const abs = path.join(ROOT, r);
      expect({ rel: r, exists: fs.existsSync(abs) }).toEqual({ rel: r, exists: true });
      expect({ rel: r, lines: countMatchingLines(abs) }).toEqual({ rel: r, lines: row.lines });
      expect(row.reason.length).toBeGreaterThan(40);
    }
  });

  it('no allowlist row names a file Plan 3 deleted, and those files are really gone', () => {
    for (const r of DELETED_BY_PLAN3) {
      expect(Object.keys(ALLOW)).not.toContain(r);
      expect(fs.existsSync(path.join(ROOT, r))).toBe(false);
    }
  });

  it('every allowlist reason points at the single escalation list', () => {
    const escalated = Object.entries(ALLOW).filter(([r]) => r === 'LICENSE' || r.startsWith('assets/legal/'));
    expect(escalated).toHaveLength(4);
    for (const [, row] of escalated) expect(row.reason).toContain('ESCALATIONS.md');
  });
});
```

- [ ] **Step 3: run it and confirm exactly one failure, for exactly one reason.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/brandNeutral.test.js 2>&1 | grep -E '✕|✓|- Expected|\+ Received|language-switcher|Tests:'
```
  - Expected: `Tests: 1 failed, 4 passed, 5 total`. The **single** failure is
    `every literal outside src/ is allowlisted, with the exact line count`, with the received object carrying one
    extra entry — `"assets/js/language-switcher.js": 1` — the header comment, the only unrecorded literal left.
  - If the received object differs in **any other** key → **STOP** (C23-3): the counts were measured on
    2026-09-21 and something else changed; re-measure before editing the allowlist.
  - If `no allowlist row names a file Plan 3 deleted` fails, a bridge row was re-introduced or Task 19c was
    reverted: **STOP.** That case is the standing guard against X6 recurring.

- [ ] **Step 4: implement.** In `assets/js/language-switcher.js` replace `:2`:

```js
 * Language Switcher Component for WaveMAX
```
  with:

```js
 * Language Switcher Component
```

- [ ] **Step 5: run green, prove nothing escalated was edited, commit.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
npx jest tests/brandNeutral.test.js 2>&1 | grep -E '^(Tests:|Test Suites:)'
git status --porcelain
git status --porcelain | grep -E 'assets/legal|^.. LICENSE' && { echo 'STOP: an escalated file was edited'; exit 1; } || echo NO_ESCALATED_FILE_TOUCHED
npm test 2>&1 | grep -E '^(FAIL|Tests:|Test Suites:)'
npm run lint 2>&1 | tail -2
git add tests/brandNeutral.test.js assets/js/language-switcher.js
git commit -m "test(guard): brand-neutrality over assets/ and repo metadata, self-expiring allowlist (Plan 3 Task 23, B-4)" \
  -m "The §7.2.2 guard covered src/ only, which is why B-4's remainder survived outside it.
Every surviving literal outside src/ is now recorded with an exact line count, a reason and
its removal event, and each row is asserted to still name a real, still-matching file -- so
a row cannot outlive its reason. A further case asserts the two iframe-bridge rows are
absent AND that those files are really gone: Task 19c deleted them, and an allowlist row
for a deleted file is exactly the defect this guard prevents. The one remaining assets/js
literal is Task 22's migration read. language-switcher.js's header comment is de-branded
here.

assets/legal/*.html and LICENSE are NOT edited: the owner's instruction is explicit. They
stay allowlisted, with reasons pointing at the single escalation list, and the ask recorded
there is delete-or-keep rather than a legal rewrite -- the three legal pages are
unreferenced dead copies, since corporate serves only i18n.js and language-switcher.js out
of assetsDir and the portal serves its own public/ copies." \
  -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "printf '%s\n' \
  'T23_DELTA=2' 'T23_DONE=yes' \
  'T23_LEGAL_ESCALATION=pending' \
  'T23_LEGAL_FILES=assets/legal/privacy-policy.html:17,assets/legal/refund-policy.html:10,assets/legal/terms-and-conditions.html:11,LICENSE:2' \
  'T23_LEGAL_ASK=delete_or_keep_unreferenced_dead_copies_not_a_legal_rewrite' \
  >> /var/www/wavemax/cutover-logs/plan3-record.env"
```
  - Expected: `Test Suites: 1 passed, 1 total`, `Tests: 5 passed, 5 total`; the porcelain listing **only**
    `tests/brandNeutral.test.js` and `assets/js/language-switcher.js`; `NO_ESCALATED_FILE_TOUCHED`;
    the full suite with no `FAIL` at `WC_TESTS_AFTER_T19 + 6 + 17 + 7 + 2`; lint clean (no output); one commit;
    the five record lines written — Task 35 turns `T23_LEGAL_*` into rows L-1…L-4 of
    `docs/superpowers/ESCALATIONS.md`.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git log --oneline -1 && git revert --no-edit HEAD
npx jest tests/brandNeutral.test.js 2>&1 | grep -E '^Tests:'
grep -c 'for WaveMAX' assets/js/language-switcher.js
git show --stat HEAD | tail -3
```
- Rollback expected: `Tests: 1 passed, 1 total` (the `src/`-only guard); `1` (the comment is back); and the stat
  listing only the two files.
- Rollback notes:
  - Test-only plus one comment; **no runtime behaviour changes** and nothing on a box is affected.
  - If this guard ever fails because an allowlisted file was **deleted**, the fix is to delete that **row**, not
    to revert the guard. That is the mechanism working.
  - Reverting this task does **not** require reverting Task 22: the `i18n.js` count is `1` either way.

---

### Task 24: release `v0.3.0` and deliver it — both consumers, both boxes, with the Phase-2 affiliate code

> This is the second and last production window of phases 2–3, and it is **HUMAN-CONFIRM**. It carries: the live
> `injectNonce` fix (Task 20), the SMTP timeouts / logger / locale token (Task 21), the `app-language` migration
> (Task 22), the extended brand guard (Task 23), web-core's bridge deletion (Task 19c) — **and** the affiliate code
> from Tasks 18 and 19a, which has been committed and unshipped since Phase 2.
>
> **⛔ The lethal trap, restated because it is the reason this task exists in this shape.** `npm install` reports
> **"up to date"** and does **NOT** re-copy a `file:` dependency when the version string is unchanged; the version
> bump alone does **not** force a re-copy — **only `rm -rf node_modules/@crhs/web-core` does** (tested, recorded in
> `memory/deploy_b_bidirectional_bootbreaker.md`). A box running new app code against old core bytes under a new
> version string has killed the portal. So: `rm -rf` → install → gate → boot probe → reload, for **both**
> consumers, on **each** box, every time, including in the rollback.

**Files:**
- Modify: `crhs-web-core/package.json` (`:3` `"version": "0.2.1"` → `"0.3.0"`), `crhs-web-core/package-lock.json`.
- Modify: `crhs-corporate/tests/packageTopology.test.js` (the `:39` comment phrase and the `:48` floor
  `'0.2.1'` → `'0.3.0'`), `crhs-corporate/package-lock.json`.
- Modify: `wavemax-affiliate-program/package-lock.json`.
- Box only: `/var/www/crhs-web-core/` (rsync target),
  `/var/www/crhs-corporate/node_modules/@crhs/web-core`,
  `/var/www/wavemax/wavemax-affiliate-program` (`git pull` + `node_modules/@crhs/web-core`).
  **No `.env` change.** No corporate **application** code is delivered by this task — corporate is rsync-delivered
  and that mechanism belongs to Task 1; this task rsyncs web-core only.

**Interfaces:**

*Consumes — every row asserted:*

| # | consumed artefact | asserted by |
|:--|:--|:--|
| C24-1 | **Tasks 20, 21, 22, 23 all landed**, with their recorded deltas | **Step 1** (record deltas sum to 32 **and** five named commits on top of Task 19c's) |
| C24-2 | **Task 19c landed in web-core** and its post-deletion test count was recorded | **Step 1** (`WC_TESTS_AFTER_T19` non-empty; `assets/js` is three files) |
| C24-3 | **Task 19b landed in corporate** — else the install throws `ENOENT` across corporate's suite (X8) | **Step 6** (`git grep -c` for either bridge filename in `tests server` = 0, **before** the install) |
| C24-4 | **Task 20's affiliate half landed** — else the portal suite goes red against the release | **Step 11** (`grep -c 'content="" content='` in `tests/unit/cspHelper.test.js` = 0) |
| C24-5 | **Tasks 18 and 19a are pushed** and are what the box will pull | **Step 14** (box `HEAD` equals `T19_AFF_SHA` after the pull) |
| C24-6 | the `rm -rf` really is required — the trap is demonstrated, not asserted from memory | **Step 6** (install without `rm -rf` reports "up to date" and `require(...).version` still prints `0.2.1`) |
| C24-7 | no other box is mid-deploy (**R-3**, X32) | **Step 14** (`BOX_BUSY` empty, then set under `trap … EXIT`) |

*Produces:*
- tag `v0.3.0` pushed; both consumers recording `0.3.0`; corporate's floor raised so a stale core copy fails loudly;
- both apps on both boxes running `@crhs/web-core@0.3.0` with the **26**-key surface and
  `wc.csrf = { createCsrf, CSRF_COOKIE_NAME }` unchanged — **no new instance of the bidirectional boot-breaker**;
- the portal serving `<meta name="csp-nonce" content="<base64>">` with **one** `content` attribute — the live
  defect gone;
- `REC` gets `WC_TAG=v0.3.0`, `RELOAD_TS_AFF_T24_<box>`, `RELOAD_TS_CORP_T24_<box>`, `BOX_T24_DONE_<box>`.

*Compatibility, checked API by API (not assumed):*
- **Corporate** reads the nonce meta through `{{CSP_NONCE}}` on all 11 content pages, so Task 20 does not change a
  byte of its output (proved in Step 9); it calls `readHTMLWithNonce` with 2 args; it serves web-core's `i18n.js`,
  so Tasks 21c/22 apply there **by design**; it sets `LOG_SERVICE_NAME=crhs-corporate`, so Task 21b's `'app'`
  default is never reached; and Task 21b repairs its `server.js:162`/`:172` boot-failure lines with no edit.
- **Affiliate** wraps `injectNonce` rather than re-implementing it (`server/utils/cspHelper.js:32-34`, brand object
  as the 3rd arg — unchanged) and serves its **own** `public/assets/js/i18n.js`, so Tasks 21c/22 do not touch the
  portal's client behaviour at all.
- `wc.SystemConfig.base` is deliberately **not** probed in the affiliate — it throws `OverwriteModelError` there
  (Plan 2 Global Constraint 16e).

- [ ] **Step 1: gate on Tasks 19c and 20–23; prove the history is exactly this release.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
REC=/var/www/wavemax/cutover-logs/plan3-record.env
eval "$(ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "grep -E '^(WC_TESTS_AFTER_T19|T2[0-3]_DELTA|T19_WC_SHA|T19_AFF_SHA)=' $REC")"
echo "base=$WC_TESTS_AFTER_T19 deltas=$T20_DELTA/$T21_DELTA/$T22_DELTA/$T23_DELTA"
test -n "$WC_TESTS_AFTER_T19" || { echo 'STOP: Task 19c did not record its test count'; exit 1; }
SUM=$((T20_DELTA + T21_DELTA + T22_DELTA + T23_DELTA)); echo "SUM=$SUM"
test "$SUM" = 32 || { echo "STOP: recorded deltas sum to $SUM, expected 32"; exit 1; }
EXPECTED_TESTS=$((WC_TESTS_AFTER_T19 + SUM)); echo "EXPECTED_TESTS=$EXPECTED_TESTS"
ls assets/js/ | tr '\n' ' '; echo
git status --porcelain | wc -l
git log --oneline -6
git merge-base --is-ancestor "$T19_WC_SHA" HEAD && echo T19C_ANCESTOR=yes
```
  - Expected: the deltas `6/17/7/2`; `SUM=32`; `EXPECTED_TESTS=<base+32>`;
    `css-async.js i18n.js language-switcher.js `; `0` (clean tree); five commits — Task 23, Task 22, Task 21c,
    Task 21b, Task 21a — with Task 20's beneath them and Task 19c's below that; `T19C_ANCESTOR=yes`.
  - The expected test total is **derived from the record**, not a literal. That is the X7 fix: the drafts pinned
    `611` from two different premises, one of which did not account for Task 19c's deletions at all.

- [ ] **Step 2: the full gate, before the bump.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
npm test 2>&1 | grep -E '^(FAIL|Tests:|Test Suites:)'
npm run lint && echo LINT_CLEAN
npx madge --circular src/
node -p "Object.keys(require('./src')).length"
node -p "JSON.stringify(Object.keys(require('./src').csrf))"
node -p "typeof require('./src').logger.flushAndExit"
```
  - Expected: no `FAIL`; `Test Suites: 35 passed, 35 total`; `Tests: <EXPECTED_TESTS> passed, <EXPECTED_TESTS> total`;
    `LINT_CLEAN`; `✔ No circular dependency found!`; `26`; `["createCsrf","CSRF_COOKIE_NAME"]`; `function`.
  - A **different test total** → **STOP** and account for it against the four recorded deltas before bumping; do
    not force either number.
  - A suite that fails here must be **re-run alone** before being debugged: memory
    `test_suite_fully_green_2026-06-20` records three suites that have failed only in a full run.
  - `26` and the exact `csrf` key list are the boot-breaker fences: **[MEASURED] after Deploy B, `wc.csrf` exports
    only these two keys, and new-core+old-app *and* new-app+old-core each kill the portal.** A `27` or a different
    key list means this release changes the shape every box gate asserts: **STOP.**

- [ ] **Step 3: bump the version.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
npm version 0.3.0 --no-git-tag-version
node -p "require('./package.json').version"
grep -m1 '"version"' package-lock.json
git diff --stat
```
  - Expected: npm echoing `v0.3.0`; then `0.3.0`; then `  "version": "0.3.0",`; and a diff touching **only**
    `package.json` and `package-lock.json`.

- [ ] **Step 4: commit and tag, then prove the tag is exact and the tree clean BEFORE pushing.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git add package.json package-lock.json
git commit -m "release: v0.3.0 — csp-nonce meta filled in place (LIVE defect), bridges deleted, SMTP timeouts, logger keeps every argument, deploy-stable locale token, app-language + migration, brand guard over assets/

Surface unchanged at 26 keys; wc.csrf unchanged at { createCsrf, CSRF_COOKIE_NAME }, so
this release creates no new instance of the bidirectional boot-breaker.

Consumer-visible: injectNonce emits ONE content attribute on the csp-nonce meta (the
portal served content=\"\" content=\"…\" and every client-side nonce read was empty); the
iframe bridges and the parent-bridge wildcard-ACAO carve-out are gone; and the i18n
localStorage key is now 'app-language' with a one-time migration from the legacy key,
which matters because the legacy value on the marketing origins was written by the
portal's copy of the loader before those hosts were flipped.

Both consumers' mirrored assertions are updated in their own repos.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git tag v0.3.0
git describe --exact-match --tags
git status --porcelain | wc -l
```
  - Expected: `v0.3.0`, then `0`. Anything else → **STOP**, do **not** push; fix the tree and re-point the tag with
    `git tag -f v0.3.0` only after re-running Step 2.

- [ ] **Step 5: push.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git push origin main v0.3.0
git ls-remote --tags origin v0.3.0 | wc -l
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "printf 'WC_TAG=v0.3.0\n' >> /var/www/wavemax/cutover-logs/plan3-record.env"
```
  - Expected: `1`.

- [ ] **Step 6: corporate — assert Task 19b landed, then DEMONSTRATE the stale-copy trap (this is the failing test).**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
BRIDGE_REFS=$(git grep -cI -E 'iframe-bridge-v2|parent-iframe-bridge-v3' -- tests server | wc -l)
echo "BRIDGE_REFS=$BRIDGE_REFS"
test "$BRIDGE_REFS" = 0 || { echo 'STOP: Task 19b has not landed — installing v0.3.0 now throws ENOENT across this suite'; exit 1; }
sed -i "s/version, '0.2.1'))/version, '0.3.0'))/; s/OLDER than 0.2.1 against this code/OLDER than 0.3.0 against this code/" tests/packageTopology.test.js
git diff --stat tests/packageTopology.test.js
npm install --install-links --no-audit --no-fund 2>&1 | tail -2
node -p "require('@crhs/web-core/package.json').version"
npx jest tests/packageTopology.test.js 2>&1 | grep -E '✕|Expected|Received|Tests:'
```
  - Expected: `BRIDGE_REFS=0` (C24-3 — the single most important ordering assertion in this task);
    `1 file changed, 2 insertions(+), 2 deletions(-)`; an npm summary reporting nothing to do; then **`0.2.1`** —
    **npm did not re-copy**, which **is** the trap, demonstrated rather than recalled (C24-6); then a failure
    reading `expect(received).toBeGreaterThanOrEqual(expected)` / `Expected: >= 0` / `Received: -1`.
  - `0.3.0` at that point would mean the trap did not reproduce on this workstation — record it and **still** run
    every `rm -rf` below; the boxes are where it bites.

- [ ] **Step 7: corporate — re-copy and gate.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
rm -rf node_modules/@crhs/web-core
npm install --install-links --no-audit --no-fund 2>&1 | tail -2
node -p "require('@crhs/web-core/package.json').version"
node -p "Object.keys(require('@crhs/web-core')).length"
node -p "Object.keys(require('@crhs/web-core').csrf).includes('createCsrf')"
node -p "typeof require('@crhs/web-core').logger.flushAndExit"
node -e "const fs=require('fs'),p=require('path'),wc=require('@crhs/web-core');
console.log('assetsDir js =', fs.readdirSync(p.join(wc.assetsDir,'js')).sort().join(' '));"
```
  - Expected: `0.3.0`; `26`; `true`; `function`; and
    `assetsDir js = css-async.js i18n.js language-switcher.js` — the bridge assets gone from the **installed copy**,
    which is what Task 19b's disk-derived guard now reads.

- [ ] **Step 8: corporate — rewrite the lockfile.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
sed -i '/"node_modules\/@crhs\/web-core"/,/}/ s/"version": "0.2.1"/"version": "0.3.0"/' package-lock.json
grep -A1 '"node_modules/@crhs/web-core"' package-lock.json
```
  - Expected: `"node_modules/@crhs/web-core": {` then `      "version": "0.3.0",`.

- [ ] **Step 9: corporate — prove the nonce fix is a byte-level no-op for its own pages.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
node -e "
const wc = require('@crhs/web-core').cspHelper;
const fs = require('fs');
let pages = 0, ok = 0;
for (const f of require('child_process').execSync('git ls-files content | grep \"\\.html\$\"', {encoding:'utf8'}).trim().split('\n')) {
  const html = fs.readFileSync(f, 'utf8');
  if (!/name=[\"']csp-nonce[\"']/.test(html)) continue;
  pages++;
  const out = wc.injectNonce(html, 'NONCE123');
  const m = out.match(/<meta name=\"csp-nonce\"[^>]*>/)[0];
  const good = m === '<meta name=\"csp-nonce\" content=\"NONCE123\">' && !out.includes('{{CSP_NONCE}}');
  if (good) ok++; else console.log('MISMATCH', f, m);
}
console.log('pages with a csp-nonce meta =', pages, '| correct =', ok);
if (pages === 0) throw new Error('no page carried a csp-nonce meta — the check is vacuous');
"
```
  - Expected: `pages with a csp-nonce meta = 11 | correct = 11` and **no** `MISMATCH` line.
    The `throw` is the R-9 guard: a glob that matches nothing would otherwise print a cheerful `0 | 0`.

- [ ] **Step 10: corporate — suite, lint, cycles, against the Step 0 baseline.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
npm test 2>&1 | grep -E '^(FAIL|Tests:|Test Suites:)'
npm run lint && echo LINT_CLEAN
npx madge --circular server/
```
  - Expected: no `FAIL`; `Tests:`/`Test Suites:` lines identical to the pre-install measurement — **[MEASURED]
    `tests/contentHandler.test.js` alone is 57 today; record the whole-suite numbers immediately before Step 6 and
    compare** — then `LINT_CLEAN` and `✔ No circular dependency found!`.
    **Any** new failure is a real incompatibility: **STOP.** In particular an `ENOENT` naming
    `iframe-bridge-v2.js` means Task 19b did not land and Step 6's gate was bypassed.

- [ ] **Step 11: affiliate — assert Task 20's half landed, re-copy, gate, seam suites, the real-page proof.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
printf 'bug-asserting lines left = %s\n' "$(grep -c 'content=\"\" content=' tests/unit/cspHelper.test.js || true)"
test "$(grep -c 'content="" content=' tests/unit/cspHelper.test.js || true)" = 0 \
  || { echo 'STOP: the affiliate still asserts the duplicate attribute — Task 20 step 7 did not land'; exit 1; }
rm -rf node_modules/@crhs/web-core
npm install --install-links --no-audit --no-fund 2>&1 | tail -2
node -p "require('@crhs/web-core/package.json').version"
node -p "JSON.stringify(Object.keys(require('@crhs/web-core').csrf))"
node -p "Object.keys(require('@crhs/web-core')).length"
node -p "require.resolve('mongoose',{paths:[require.resolve('@crhs/web-core')]})===require.resolve('mongoose')"
sed -i '/"node_modules\/@crhs\/web-core"/,/}/ s/"version": "0.2.1"/"version": "0.3.0"/' package-lock.json
grep -A1 '"node_modules/@crhs/web-core"' package-lock.json
npx jest tests/unit/cspHelper.test.js tests/unit/cspHelper.brand.test.js \
         tests/integration/webCoreInstanceIdentity.test.js tests/integration/webCoreConsumptionGolden.test.js \
         tests/integration/securityHeaders.test.js tests/unit/bridgeRetired.test.js \
         tests/unit/explorerRetired.test.js tests/unit/csrfTables.test.js \
         tests/integration/marketingSurfaceRemoved.test.js 2>&1 | grep -E '^(FAIL|Tests:|Test Suites:)|✕'
npx madge --circular server/
node --check server.js && echo SYNTAX_OK
node -e "
const { readHTMLWithNonce } = require('./server/utils/cspHelper');
readHTMLWithNonce(require('path').join(__dirname,'public/embed-app-v2.html'), 'NONCE123').then((out) => {
  const meta = out.match(/<meta name=\"csp-nonce\"[^>]*>/)[0];
  console.log(meta);
  console.log('content attrs:', (meta.match(/content=/g)||[]).length);
  console.log('asset-version filled:', /<meta name=\"asset-version\" content=\"[^\"]+\">/.test(out));
});"
```
  - Expected: `bug-asserting lines left = 0`; `0.3.0`; `["createCsrf","CSRF_COOKIE_NAME"]`; `26`; `true`;
    the lock line `"version": "0.3.0",`; **no `FAIL` and no `✕`** across the nine suites; `✔ No circular dependency
    found!`; `SYNTAX_OK`; then `<meta name="csp-nonce" content="NONCE123">`, `content attrs: 1`,
    `asset-version filled: true`.
  - The last line proves Task 20 did not disturb the affiliate's `injectAssetVersion` pass, which runs on the same
    string immediately after `injectNonce`.
  - **Global Constraint 19:** the affiliate full suite (~67 min) is **not** run inside this step.

- [ ] **Step 12: the affiliate full suite — controller-run, background, exactly once.**
      Run `npm test` in the background and record `Test Suites:` and `Tests:`. Expected: **no new failure
      attributable to web-core**, and the only failing suites are the two GC-19 baseline reds
      (`tests/unit/branding-guard.test.js`, `tests/unit/i18n-brand-token.test.js`) whose exact residual shape Task 16
      Step 8 pinned. A suite that fails is **re-run alone** before being called a regression. Record the numbers in
      `REC` as `AFF_SUITES_T24` / `AFF_TESTS_T24`: there is no current published affiliate baseline (Plan 2's
      predate its own Task 23), so this run **becomes** the baseline and must be written down for Task 26 to compare
      against.

- [ ] **Step 13: commit and push both consumers.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
git add tests/packageTopology.test.js package-lock.json
git commit -m "deps: web-core 0.3.0 floor + lockfile" \
  -m "Raises the floor so a stale node_modules copy fails loudly instead of running old core
bytes under a new version string. The asset 404 guard is already disk-derived (Plan 3
Task 19b), so the release that deletes the iframe bridges installs cleanly here." \
  -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git add package-lock.json
git commit -m "deps: record web-core 0.3.0 in the lockfile" \
  -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
git rev-parse HEAD
```
  - Expected: one commit pushed in each repo; the affiliate `HEAD` printed — **this** sha is what Step 14 pulls, and
    it carries Tasks 16, 17, 18, 19a, 20 and this lockfile commit.

- [ ] **Step 14 (HUMAN-CONFIRM): the box window — `oci1`, then `oci2`.**
  Say exactly this before the first box:
  > Second and last production window of phases 2–3, one box at a time. It rsyncs web-core `v0.3.0` to
  > `/var/www/crhs-web-core`, pulls the affiliate to the sha from Step 13 (delivering Tasks 18 and 19a), then
  > `rm -rf node_modules/@crhs/web-core` and reinstalls in **both** consumers — mandatory, because npm reports
  > "up to date" and does not re-copy — gates the install, boot-probes both apps on spare ports, and reloads
  > `wavemax` then `crhs-corporate`. Blast radius while broken: crhsent.com **and** the portal on this box; the CF
  > LB monitor fails it over to the peer, with a ~1–2 min partial-502 propagation window. Both boxes are never
  > mid-deploy at once. No `.env` change. Proceed with `oci1`?

```bash
BOX=oci1; IP=161.153.71.201          # Pass 2: BOX=oci2; IP=144.24.4.202
REC=/var/www/wavemax/cutover-logs/plan3-record.env
AFF_SHA=<the sha printed by Step 13>
# --- interlock (R-3 / X32) ---
BUSY=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "sed -n 's/^BOX_BUSY=//p' $REC | tail -1")
test -z "$BUSY" || { echo "STOP: BOX_BUSY=$BUSY"; exit 1; }
trap 'ssh -i ~/.ssh/oci_wavemax ubuntu@'"$IP"' "printf '"'"'BOX_BUSY=\n'"'"' >> '"$REC"'"' EXIT
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "printf 'BOX_BUSY=%s\n' $BOX >> $REC"
# --- baseline, including the boot-marker counts Step 8 compares against (P35) ---
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%FT%T
  pm2 jlist | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>JSON.parse(s).forEach(a=>console.log(\"before\",a.name,a.pm2_env.status,a.pm2_env.restart_time)))"
  for d in /var/www/wavemax/wavemax-affiliate-program /var/www/crhs-corporate; do
    cd "$d" && echo "$d core=$(node -p "require(\"@crhs/web-core/package.json\").version")"
  done
  printf "boot_markers_aff=%s boot_markers_corp=%s\n" \
    "$(grep -c "Server running on port 3000 in production mode" /var/www/wavemax/wavemax-affiliate-program/logs/combined.log)" \
    "$(grep -c "crhs-corporate listening on 3001" /var/www/crhs-corporate/logs/combined.log)"'
```
  - Expected: a UTC timestamp; `before wavemax online <n>` and `before crhs-corporate online <m>`;
    both trees reporting `core=0.2.1`; and the two boot-marker counts. **Record `<n>`, `<m>` and both marker
    counts** — Step 8's log check asserts a *delta*, which is uncheckable without them.

```bash
# --- snapshot the current web-core tree (the rollback source) ---
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y-%m-%dT%H%M%S'); echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "mkdir -p ~/deploy-snapshots && \
  tar -C /var/www -czf ~/deploy-snapshots/crhs-web-core-$TS.tgz --exclude node_modules --exclude .git --exclude logs crhs-web-core && \
  ls -l ~/deploy-snapshots/crhs-web-core-$TS.tgz"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "printf 'TS_T24_%s=%s\n' $BOX $TS >> $REC"
```
  - Expected: `TS=<stamp>`, then one `-rw-` line with non-zero size, then the record line.

```bash
# --- deliver web-core: the tag/clean-tree check GATES the rsync (P34) ---
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git describe --exact-match --tags \
  && [ "$(git status --porcelain | wc -l)" = 0 ] \
  && rsync -az --delete --exclude node_modules --exclude .git --exclude logs --exclude coverage \
       -e "ssh -i ~/.ssh/oci_wavemax" ./ ubuntu@$IP:/var/www/crhs-web-core/ \
  && ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'node -p "require(\"/var/www/crhs-web-core/package.json\").version"'
```
  - Expected: `v0.3.0`, then `0.3.0`. The `&&` chain is mandatory: slice D's version ended the check at a newline,
    so an untagged `HEAD` or a dirty tree would have been rsynced to production **anyway**, with `--delete`, into
    the tree both apps install from.

```bash
# --- deliver the affiliate's Phase-2 code, then re-copy BOTH consumers ---
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
  cd /var/www/wavemax/wavemax-affiliate-program
  git pull --ff-only
  test \"\$(git rev-parse HEAD)\" = '$AFF_SHA' && echo AFF_HEAD_MATCHES
  test ! -e public/design-explorer && echo EXPLORER_STILL_GONE
  ls public/assets/js/ | grep -c bridge || true"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/wavemax/wavemax-affiliate-program && rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund 2>&1 | tail -2'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate && rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund 2>&1 | tail -2'
```
  - Expected: the pull summary; `AFF_HEAD_MATCHES`; `EXPLORER_STILL_GONE` (Task 17's box work has not regressed);
    `0` bridge files in `public/assets/js` (Task 19a delivered); then two npm summaries, **neither** containing
    `npm ERR!`.

```bash
# --- the pre-reload gate, both consumers (Global Constraint 16) ---
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'for d in /var/www/wavemax/wavemax-affiliate-program /var/www/crhs-corporate; do
  cd "$d" && echo "$d $(node -p "require(\"@crhs/web-core/package.json\").version") $(node -p "Object.keys(require(\"@crhs/web-core\")).length") $(node -p "Object.keys(require(\"@crhs/web-core\").csrf).includes(\"createCsrf\")") $(node -p "require.resolve(\"mongoose\",{paths:[require.resolve(\"@crhs/web-core\")]})===require.resolve(\"mongoose\")") $(node -p "typeof require(\"@crhs/web-core\").logger.flushAndExit") $(node -e "const fs=require(\"fs\"),p=require(\"path\");console.log(fs.readdirSync(p.join(require(\"@crhs/web-core\").assetsDir,\"js\")).length)")"
done'
```
  - Expected, exactly two lines:
    ```
    /var/www/wavemax/wavemax-affiliate-program 0.3.0 26 true true function 3
    /var/www/crhs-corporate 0.3.0 26 true true function 3
    ```
    Any `false`, any version other than `0.3.0`, any count other than `26`, any `undefined`, or an `assets/js`
    count other than `3` → **STOP** and run the rollback. A `0.2.1` here is the install trap having bitten
    despite the `rm -rf`.

```bash
# --- boot probes on spare ports, BEFORE any reload (P28) ---
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/wavemax/wavemax-affiliate-program && PORT=3099 NODE_ENV=production node -e "
  process.on(\"unhandledRejection\", (e) => { console.log(\"BOOT_FAIL aff \" + e); process.exit(1); });
  process.on(\"uncaughtException\",  (e) => { console.log(\"BOOT_FAIL aff \" + e.message); process.exit(1); });
  require(\"./server.js\");
  setTimeout(() => { console.log(\"BOOT_OK aff\"); process.exit(0); }, 2500);"'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate && PORT=3098 NODE_ENV=production node -e "
  process.on(\"unhandledRejection\", (e) => { console.log(\"BOOT_FAIL corp \" + e); process.exit(1); });
  process.on(\"uncaughtException\",  (e) => { console.log(\"BOOT_FAIL corp \" + e.message); process.exit(1); });
  require(\"./server.js\");
  setTimeout(() => { console.log(\"BOOT_OK corp\"); process.exit(0); }, 2500);"'
```
  - Expected: `BOOT_OK aff` and `BOOT_OK corp`. A `BOOT_FAIL` → **STOP**, run the rollback; do **not** reload.
    The spare ports are required (pm2 holds 3000/3001) and the async window is what makes this probe capable of
    failing at all — the synchronous `process.exit(0)` form in both drafts cannot.

```bash
# --- reload: portal first, then corporate; record the timestamps ---
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%FT%T; pm2 reload wavemax --update-env'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'until curl -sf -m 5 -o /dev/null -H "Host: portal.atxwashdryfold.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/health; do sleep 2; done; echo AFF_HEALTH_UP'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%FT%T; pm2 reload crhs-corporate --update-env'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'until curl -sf -m 5 -o /dev/null -H "Host: crhsent.com" http://127.0.0.1:3001/; do sleep 2; done; echo CORP_UP'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 jlist | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>JSON.parse(s).forEach(a=>console.log(\"after\",a.name,a.pm2_env.status,a.pm2_env.restart_time)))"'
```
  - Expected: two UTC timestamps (record as `RELOAD_TS_AFF_T24_<box>` / `RELOAD_TS_CORP_T24_<box>`);
    `AFF_HEALTH_UP`; `CORP_UP`; both apps `online` with each `restart_time` **at most one** higher than the
    baseline. A climbing count is a crash loop: **STOP**, roll back.
  - The `until` loops replace a fixed `sleep`: a foreground `sleep` is blocked in this harness, and a fixed wait
    is a guess either way.

- [ ] **Step 15: verify on the box — and that the LIVE defect is gone.**

```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP '
  X="X-Forwarded-Proto: https"
  curl -s -o /dev/null -m 10 -w "portal-health  %{http_code}\n" -H "Host: portal.atxwashdryfold.com" -H "$X" http://127.0.0.1:3000/health
  curl -s -o /dev/null -m 10 -w "health-origin  %{http_code}\n" -H "Host: portal.atxwashdryfold.com" -H "$X" http://127.0.0.1:3000/health/origin
  curl -s -o /dev/null -m 10 -w "crhsent        %{http_code}\n" -H "Host: crhsent.com" http://127.0.0.1:3001/
  echo -n "nonce meta:  "; curl -s -m 10 -H "Host: portal.atxwashdryfold.com" -H "$X" http://127.0.0.1:3000/embed-app-v2.html | grep -o "<meta name=\"csp-nonce\"[^>]*>"
  echo -n "nonce attrs: "; curl -s -m 10 -H "Host: portal.atxwashdryfold.com" -H "$X" http://127.0.0.1:3000/embed-app-v2.html | grep -o "<meta name=\"csp-nonce\"[^>]*>" | grep -o "content=" | wc -l
  echo -n "asset-ver:   "; curl -s -m 10 -H "Host: portal.atxwashdryfold.com" -H "$X" http://127.0.0.1:3000/embed-app-v2.html | grep -o "<meta name=\"asset-version\"[^>]*>"
  echo -n "corp nonce:  "; curl -s -m 10 -H "Host: crhsent.com" http://127.0.0.1:3001/ | grep -o "<meta name=\"csp-nonce\"[^>]*>"
  echo -n "corp locale: "; curl -s -m 10 -H "Host: atxwashdryfold.com" http://127.0.0.1:3001/assets/js/i18n.js | grep -c "app-language"
  echo -n "bridge 404:  "; curl -s -o /dev/null -m 10 -w "%{http_code}\n" -H "Host: atxwashdryfold.com" http://127.0.0.1:3001/assets/js/parent-iframe-bridge-v3.js
  echo -n "bridge ACAO: "; curl -s -D - -o /dev/null -m 10 -H "Host: atxwashdryfold.com" http://127.0.0.1:3001/assets/js/parent-iframe-bridge-v3.js | grep -ci "access-control-allow-origin" || true'
curl -s -m 20 "https://portal.atxwashdryfold.com/embed-app-v2.html?lh=$(date +%s)" | grep -o '<meta name="csp-nonce"[^>]*>'
```
  - Expected:
    - `portal-health  200`, `health-origin  200`, `crhsent        200`;
    - `nonce meta:  <meta name="csp-nonce" content="<base64>">` with a **non-empty** value, and `nonce attrs: 1`.
      **[MEASURED] against v0.2.1 this line reads `<meta name="csp-nonce" content="" content="<base64>">`** — this
      is the whole point of the release, and it is only visible because **every one of these `:3000` probes carries
      `X-Forwarded-Proto: https`.** Without it the app returns `302` with an **empty body** and the grep prints
      **nothing**, which is indistinguishable from "the fix did not land" — slice D got this wrong in 4 of 4 probes
      (P3);
    - `asset-ver:   <meta name="asset-version" content="<token>">`, non-empty;
    - `corp nonce:  <meta name="csp-nonce" content="<base64>">`, one `content` (corporate's placeholder path,
      unchanged);
    - `corp locale: 1` — the served `i18n.js` carries `app-language`, i.e. Task 22 reached the marketing hosts;
    - `bridge 404:  404` and `bridge ACAO: 0` — no wildcard ACAO from `securityHeaders` on any path;
    - through Cloudflare: the same **single-attribute** form. The page is served `no-store` by
      `serveHTMLWithNonce`, so a duplicate here after **both** boxes are done means a reload did not take.

- [ ] **Step 16: log evidence since the reload (P35 — a delta, filtered by timestamp).**

```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "
  printf 'boot_markers_aff=%s boot_markers_corp=%s\n' \
    \"\$(grep -c 'Server running on port 3000 in production mode' /var/www/wavemax/wavemax-affiliate-program/logs/combined.log)\" \
    \"\$(grep -c 'crhs-corporate listening on 3001' /var/www/crhs-corporate/logs/combined.log)\"
  echo '--- affiliate errors since the reload ---'
  awk -v t='$RELOAD_TS_AFF' '\$0 > t' /var/www/wavemax/wavemax-affiliate-program/logs/combined.log | grep '\"level\":\"error\"' | tail -10
  echo '--- corporate errors since the reload ---'
  awk -v t='$RELOAD_TS_CORP' '\$0 > t' /var/www/crhs-corporate/logs/combined.log | grep '\"level\":\"error\"' | tail -10
  echo '--- release-specific TypeErrors (must be empty) ---'
  grep -hE 'fillMetaContent|captureExtraArgs|flushAndExit|assetVersion|migrateStoredLanguage' \
    /var/www/wavemax/wavemax-affiliate-program/logs/combined.log /var/www/crhs-corporate/logs/combined.log | tail -5"
```
  - Expected: both boot-marker counts **increased by the worker count of one reload** versus the baseline recorded
    in Step 14 — that comparison is only possible because Step 14 captured them; then **no new** error lines in
    either window; then **nothing** from the release-specific grep. A `TypeError` naming any of those five symbols
    means a half-installed core: **STOP**, roll back.
  - `$LOG_DIR/combined.log` is read directly, never `pm2 logs` (**R-4**). Both apps' logs are read — slice D's
    version `cd`'d into corporate first and searched only its log.

- [ ] **Step 17: record the box as done, release the interlock, and only then start Pass 2.**

```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "printf 'RELOAD_TS_AFF_T24_%s=%s\nRELOAD_TS_CORP_T24_%s=%s\nBOX_T24_DONE_%s=yes\n' \
  $BOX \"\$RELOAD_TS_AFF\" $BOX \"\$RELOAD_TS_CORP\" $BOX >> $REC"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "grep -c '^BOX_T24_DONE_.*=yes\$' $REC"
```
  - Expected: `1` after `oci1`, `2` after `oci2`. **Pass 2 starts only when this reads `1`** and `BOX_BUSY` is empty.
  - After **both** boxes, cross-box consistency:
```bash
for IP in 161.153.71.201 144.24.4.202; do
  printf '%s ' "$IP"
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-web-core && printf "core=%s " "$(node -p "require(\"./package.json\").version")"
    cd /var/www/wavemax/wavemax-affiliate-program && printf "aff_head=%s " "$(git rev-parse --short HEAD)"
    curl -s -m 10 -H "Host: portal.atxwashdryfold.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/embed-app-v2.html | grep -o "<meta name=\"csp-nonce\"[^>]*>" | grep -o "content=" | wc -l'
done
for H in portal.atxwashdryfold.com crhsent.com atxwashateria.com rundberglaundry.com atxwashdryfold.com; do
  printf '%-30s %s\n' "$H" "$(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://$H/?lh=$(date +%s)")"
done
```
  - Expected: two lines `core=0.3.0 aff_head=<same short sha on both> 1`, then five `200` lines.
    A differing `aff_head` or a `2` in the attr count means one box is on each side of this release: **STOP** and
    finish that box.

**Rollback (exact; per box; order: tree → affiliate code → reinstall both → gate → boot probe → reload → verify).**
```bash
BOX=oci1; IP=161.153.71.201; REC=/var/www/wavemax/cutover-logs/plan3-record.env
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "sed -n 's/^TS_T24_'$BOX'=//p' $REC | tail -1"); echo "TS=$TS"
test -n "$TS" || { echo 'STOP: no T24 snapshot timestamp for this box'; exit 1; }
PREV_AFF_SHA=<the short sha printed by Step 14's baseline>
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
  R=\$(mktemp -d)
  tar -C \"\$R\" -xzf ~/deploy-snapshots/crhs-web-core-$TS.tgz
  rsync -a --delete --exclude node_modules --exclude .git --exclude logs \"\$R/crhs-web-core/\" /var/www/crhs-web-core/
  rm -rf \"\$R\"
  node -p 'require(\"/var/www/crhs-web-core/package.json\").version'
  cd /var/www/wavemax/wavemax-affiliate-program && git checkout -q $PREV_AFF_SHA && git rev-parse --short HEAD"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/wavemax/wavemax-affiliate-program && rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund 2>&1 | tail -2'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate && rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund 2>&1 | tail -2'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'for d in /var/www/wavemax/wavemax-affiliate-program /var/www/crhs-corporate; do
  cd "$d" && echo "$d $(node -p "require(\"@crhs/web-core/package.json\").version") $(node -p "Object.keys(require(\"@crhs/web-core\")).length") $(node -p "Object.keys(require(\"@crhs/web-core\").csrf).includes(\"createCsrf\")")"; done'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/wavemax/wavemax-affiliate-program && PORT=3099 NODE_ENV=production node -e "
  process.on(\"uncaughtException\", (e) => { console.log(\"BOOT_FAIL aff \" + e.message); process.exit(1); });
  require(\"./server.js\"); setTimeout(() => { console.log(\"BOOT_OK aff\"); process.exit(0); }, 2500);"'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate && PORT=3098 NODE_ENV=production node -e "
  process.on(\"uncaughtException\", (e) => { console.log(\"BOOT_FAIL corp \" + e.message); process.exit(1); });
  require(\"./server.js\"); setTimeout(() => { console.log(\"BOOT_OK corp\"); process.exit(0); }, 2500);"'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 reload wavemax --update-env'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'until curl -sf -m 5 -o /dev/null -H "Host: portal.atxwashdryfold.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/health; do sleep 2; done; echo AFF_HEALTH_UP'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 reload crhs-corporate --update-env'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'until curl -sf -m 5 -o /dev/null -H "Host: crhsent.com" http://127.0.0.1:3001/; do sleep 2; done; echo CORP_UP'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP '
  X="X-Forwarded-Proto: https"
  curl -s -o /dev/null -m 10 -w "portal-health %{http_code}\n" -H "Host: portal.atxwashdryfold.com" -H "$X" http://127.0.0.1:3000/health
  curl -s -o /dev/null -m 10 -w "crhsent %{http_code}\n" -H "Host: crhsent.com" http://127.0.0.1:3001/
  curl -s -m 10 -H "Host: portal.atxwashdryfold.com" -H "$X" http://127.0.0.1:3000/embed-app-v2.html | grep -o "<meta name=\"csp-nonce\"[^>]*>"
  curl -s -o /dev/null -m 10 -w "bridge %{http_code}\n" -H "Host: atxwashdryfold.com" http://127.0.0.1:3001/assets/js/parent-iframe-bridge-v3.js'
```
- Rollback expected, in order: `0.2.1`; the previous affiliate short sha; two npm summaries with no `npm ERR!`;
  `/var/www/wavemax/wavemax-affiliate-program 0.2.1 26 true` and `/var/www/crhs-corporate 0.2.1 26 true`;
  `BOOT_OK aff`, `BOOT_OK corp`; `AFF_HEALTH_UP`, `CORP_UP`; `portal-health 200`, `crhsent 200`; the meta line back
  to `<meta name="csp-nonce" content="" content="<base64>">` — **the defect restored, which is the correct
  rollback state** — and `bridge 200` (the old core ships the asset again).
- Rollback notes:
  - **Roll back both consumers on a box together.** One on `0.3.0` and the other on `0.2.1` is the documented
    boot-breaker shape.
  - The **affiliate suite goes red after a box rollback if Task 20's affiliate half is merged** — it asserts the
    fixed output. That is a repo state, not a box state: do **not** "fix" it by reverting a test on a box.
  - A box rollback does **not** restore a visitor's legacy `wavemax-language` key (Task 22's rollback note) — the
    reset is client-side and unreachable from here.
  - The affiliate `git checkout <sha>` leaves that box on a **detached HEAD**; the forward fix is
    `git checkout main && git pull --ff-only`, not a second checkout.
  - **Deleting the pushed `v0.3.0` tag is a remote history change: confirm with the owner first** (root
    `CLAUDE.md`). If any box has already installed `0.3.0`, roll the boxes back **first**, then the tag:
    ```bash
    cd /mnt/c/Users/rickh/GitHub/crhs-web-core
    git tag -d v0.3.0 && git push origin :refs/tags/v0.3.0 && git ls-remote --tags origin v0.3.0 | wc -l
    git revert --no-edit <the release commit> && node -p "require('./package.json').version"
    ```
    Expected `0`, then `0.2.1`. **Reverting the release commit alone leaves Tasks 20–23 in place** — a tree
    *versioned* `0.2.1` carrying `0.3.0` content, which is the exact skew the install trap punishes. Either revert
    those commits too or re-tag. Never leave that state on a box.

---

## What phases 2–3 close, and what they hand on

**Closed:** scope-brief items 8, 10, 16, 17, 18, 19; the five retired CSRF rows; the design-explorer retirement
with both of its credentials removed from production; owner decisions 1 and 4; backlog **B-4**'s bridge row and
**B-5**; web-core released at **v0.3.0** on both boxes with the live `injectNonce` defect fixed.

**Handed on, each with an owner:** the six escalation rows listed in the conventions above (Anthropic key
revocation, `{{nonce}}` on `administrator-dashboard-embed.html`, `flushAndExit` adoption, the web-core legal pages
and `LICENSE`, `ratelimit_concierge`, `jest.config.js` `forceExit`), plus the three record keys `T23_LEGAL_*`
that Task 35 turns into rows L-1…L-4 of `docs/superpowers/ESCALATIONS.md`.

**Three gaps in the skeleton, reported not patched.** No task in the skeleton's 35 owns:
1. **slice B's B12** — the portal's in-code marketing-host surface. Deleting the pages leaves the **hosts** in the
   portal's CSP `img-src`/`connect-src`, its CORS allowlist, `allowedHosts`, the sitemap, the HTTPS-redirect
   fallback and the bag-label default `BASE_URL`: live configuration granting credentialed CORS and CSP reach to
   origins this app no longer has any relationship with. X11 measured **30 residual literals across 8 files** B12
   never listed, most of them `process.env.BASE_URL || 'https://rundberglaundry.com'` fallbacks, plus
   `server/services/email/dispatcher/ops.js:44`/`:65`, which **hard-code** a
   `https://rundberglaundry.com/monitoring-dashboard.html` link into outage-alert email bodies.
2. **slice B's B13** — the two known-red affiliate guard suites. Tasks 16–24 therefore never claim a fully green
   affiliate suite; each pins the exact residual shape instead.
3. **slice B's B15** — `locationQuarantine`, which can 302 users to `www.wavemaxlaundry.com` via
   `CORPORATE_SITE_URL` when `QUARANTINE_NON_AUSTIN` is `true`. X12 notes Task 26's ESLint arithmetic also assumes
   its files are deleted.

---

## Corrections to the skeleton and the adjudication, found while assembling

1. **Skeleton Task 26's ESLint figure.** It says *"`server/` + `server.js` → 0 (208 exact: 155 auto-fixable layout,
   53 manual)"*. **[MEASURED] `eslint server/` = 208 and `eslint server.js` = 1, so the stated scope is 209
   problems**, of which 155 are auto-fixable and **54** manual. `208` is the `server/`-only figure.
2. **Skeleton Task 17's "150 files".** Correct as a file count, but **only 5 are tracked**; the other 145 live under
   `public/design-explorer/render/`, gitignored at `.gitignore:244`, and are present on **both** boxes. A `git rm`
   and a `git pull` remove five files and leave 145 behind with their guard deleted. Task 17 handles it; the
   skeleton's phrasing hides it.
3. **The `securityHeaders` block is `:81-89`, not `:81-88`.** The skeleton's correction of the brief was right to
   move off `:83-88`, but `:89` is the block's trailing blank line: cutting `81-88` leaves a double blank line.
   There is also a **second** stale reference at `:7`, in the file header, which no draft or ruling mentions and
   which any `grep -i bridge … = 0` assertion would have failed on.
4. **Slice B's B7 Step 1 expected list cannot match.** It pins `assets/js/iframe-bridge-v2.js` as a file containing
   a bridge literal; **[MEASURED] that file never names itself**, so the grep returns four paths, not five. Task 19
   asserts the set by exclusion instead.
5. **Slice B's B5 Step 1 and B10 Step 1 expected outputs are both short by one path** —
   `tests/unit/branding-guard.test.js` (which carries a `/WaveMaxBridgeV3/gi` allowlist row) and
   `tests/unit/ops/cutoverGateS1.test.js` respectively. Each would have tripped its own STOP.
6. **Slice D's D7 counts `parent-iframe-bridge-v3.js` at 12 lines, then allowlists 11** on the strength of D6
   fixing one. With the bridge deleted two tasks earlier the row does not exist at all, so the discrepancy is moot
   — but it is the reason X6 was possible.
7. **ADJUDICATION R-13 says `ANTHROPIC_API_KEY` "is escalated separately — the concierge may have other
   consumers".** [MEASURED] it has **exactly one** reader (`conciergeController.js:44`) feeding **one** route
   (`server.js:713`) whose only client is inside the deleted tree. The uncertainty is resolved; the escalation that
   remains is **vendor revocation**, which is a different thing and is recorded as such.
