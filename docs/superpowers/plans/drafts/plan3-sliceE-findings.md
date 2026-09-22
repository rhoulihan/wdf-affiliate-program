# Plan 3 — SLICE E draft (scope-brief groups **E** and **F**, exit criteria **3**, **5**, **7**)

**Status:** draft for adversarial review, 2026-09-20/21. Task numbers `E1…E15` are local to this slice;
the controller renumbers on assembly.

**Scope covered:** brief items **21** (dead portal `.env` keys), **22** (SMTP churn), **23** (`ofelia`
at its cap), **24** (H-1 CR/LF validator hardening), **25** (`crhs-transfer` repo deletion),
**26** (password-reset round trip), and exit criteria **3** (zero open D-items, every `backlog_*`
memory closed), **5** (no dead `.env` keys — the `.env` half), **7** (the single escalation list).

Not in this slice: the nginx flips (group A), the cleanup they unblock (group B), the absorbed Plan-4
work (group C), web-core release hygiene (group D / B-5 — E14 only *closes the memory record* once
group D ships), CF failover gap (item 20).

---

## 0. What was measured, and where the brief is wrong

Everything below was measured read-only on 2026-09-20/21. **Four of the six brief items turned out
bigger or different than the brief states.** Those corrections drive the task list.

| # | Brief says | Measured | Consequence |
|:--|:--|:--|:--|
| 21 | three dead keys | **26 keys with no runtime consumer**, plus three *live keys with stale values* and one *missing* key. `DOCUSIGN_PRIVATE_KEY` is a live plaintext RSA key spanning **27 lines** | E1 inventories; E3 does the brief's three; **E4 is a scope expansion that needs owner approval** |
| 21 | `BACKEND_URL` "points at a host that 301s" | true, and **nothing consumes it** — it is display-only (`systemHealthService.js:14`) | correcting it is cosmetic; the owner is offered "correct" (default) or "delete" |
| 21 | — | **`FRONTEND_URL=https://rundberglaundry.com` is the *only* input to every password-reset link** (`passwordResetService.js:86`). It works today only because that host still proxies to `:3000` | ⛔ **the `rundberglaundry.com` flip breaks password reset for all three user types.** E2 must land before group A touches that host |
| 22 | oci2 only, "several per second" | **both boxes**, exactly **2 connections/min/box**, at a fixed second offset (oci1 `:50`, oci2 `:24`). "Several per second" is the *log-line* rate: 3 lines × 2 workers land in one second | source identified with certainty (E5); the fix is small (E6) |
| 22 | — | the churn is **91.8 %** of the postfix submission log (3,672 of the last 4,000 lines over 5 h 02 m) | it is an observability defect, not just noise |
| 23 | "~89 % of its 256 MiB cap — closest to OOM" | **it is already OOM-killed, repeatedly** — 22:26:59, 23:06:59, 23:41:59 UTC on 2026-09-20, `RestartCount=6`, growth ≈ 6.7 MiB/min, kill every ≈ 35–40 min | E7 is confirmation + rate measurement, not discovery; E8 is a real fix decision |
| 25 | "holds nothing unique" | **false.** 2 of 5 content files differ in size from the `dc_private` copies, and `README.md` exists nowhere else and carries three unresolved counsel questions. Contents are **attorney-client privileged settlement drafts** | E10 must prove uniqueness file-by-file and preserve a mirror **before** E11 deletes |
| 24 | "H-1 — CR/LF validator hardening" | H-1 is the crhs-corporate intake finding (`bfe8751`, `cbbda29`): the XSS input-stripper was eating lead copy, so the intake routes now **opt out** of it. The CR/LF residue is that `firstName`/`lastName`/`businessName` reach a mail **Subject** unfiltered | nodemailer 8.0.11 already folds CR/LF to a space (verified) — so this is **defence-in-depth + a pin**, severity LOW, not a live injection |

### 0.1 Measured premises (both boxes identical unless noted)

Portal `.env` = `/var/www/wavemax/wavemax-affiliate-program/.env`, oci1 `161.153.71.201`, oci2 `144.24.4.202`.

- 193 total lines = **85 `KEY=` lines** + **26 PEM continuation lines** (the `DOCUSIGN_PRIVATE_KEY` body) + comments/blanks.
  ⚠️ An earlier count of "111 keys" was wrong — it counted the PEM body lines.
- `OAUTH_CALLBACK_URI=https://wavemax.promo` (line 55), `FRONTEND_URL=https://rundberglaundry.com` (58),
  `BACKEND_URL=https://wavemax.promo` (61), `DOCUSIGN_REDIRECT_URI=https://wavemax.promo/api/auth/docusign/callback` (119),
  `DOCUSIGN_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----` (120) + 26 body lines.
- `BASE_URL=https://portal.atxwashdryfold.com` (50), `CORS_ORIGIN=https://portal.atxwashdryfold.com` (47),
  `EMAIL_USER`/`EMAIL_FROM` = `no-reply@crhsent.com` (31/36), `DEFAULT_ADMIN_EMAIL=admin@wavemax.promo` (26),
  `RUN_BACKGROUND_JOBS=true` (166), **`ALERT_EMAIL` unset**.
- `@crhs/web-core` **0.2.1** installed on both boxes and `csrf.createCsrf` is a `function` on both
  (the ⛔ bidirectional boot-breaker premise is satisfied — a `pm2 reload` is safe today).
- `GET http://127.0.0.1:3000/health` with `-H "X-Forwarded-Proto: https"` → `200` on both boxes.
- pm2: `wavemax` **2 workers** (ids 0,1), `crhs-corporate` 2 workers on `:3001`; `restart_time=0` for all four.

Mail host `158.62.198.7` (`sudo ssh wavemax-promo`, hostname `srv920133241.host`):

- RAM 3,910 MiB total / 1,025 free / 2,162 available; swap 2,047 MiB essentially unused.
- Caps live in `/opt/mailcow-dockerized/docker-compose.override.yml` (a local, non-upstream file):
  `rspamd 512m/1024m`, `sogo 256m/320m`, **`ofelia 256m/320m`**, `php-fpm 128m/192m`.
- `ofelia` image `mcuadros/ofelia:latest`, cmd `daemon --docker -f label=com.docker.compose.project=mailcowdockerized`,
  7 jobs fired **every minute**, each finishing in 130–400 ms.
- `docker inspect … .State.OOMKilled` reads **`false`** — it describes only the container's last exit. The
  **kernel** log is the truth: three `oom-kill … task=ofelia` events in 75 minutes, `anon-rss` ≈ 256 MB each time.
- ⚠️ `docker compose logs --since` returns nothing on this host — use `docker logs --tail N`.

---

## 1. Rulings this slice asks the controller to adopt

| id | ruling |
|:--|:--|
| **E-R1** | **The `rundberglaundry.com` flip is blocked on E2.** Password-reset links are built from `FRONTEND_URL`, which points at that host. E2 (code → `BASE_URL`) and E3 (delete the key) must both be green before group A flips it. Add the dependency to group A's task, not only here. |
| **E-R2** | **No `.env` key is deleted on a "looks dead" judgement.** A key is removable only when E1's recorded sweep shows zero references in `server/`, `server.js`, `ecosystem.config.js`, `public/`, `scripts/`, `tests/`, `deploy/` **and** the installed `node_modules/@crhs/web-core/src/`. E1 produces that evidence file; E3/E4 consume it. |
| **E-R3** | **`DOCUSIGN_PRIVATE_KEY` is removed by line range, never by key match.** It is a 27-line PEM; `grep -v '^DOCUSIGN_PRIVATE_KEY='` would leave 26 orphan base64 lines — dotenv ignores them, so the file would still carry the key material while *looking* clean. |
| **E-R4** | **Item 25 is a litigation-preservation question, not a housekeeping one.** The repo holds privileged settlement drafts in an active dispute. Mirror first, prove uniqueness file-by-file, reconcile the two differing files and the unique `README.md` into `dc_private`, and say the word "irreversible" to the owner. |
| **E-R5** | **Exit criterion 3 is satisfied by a command, not a claim.** E13 ships `scripts/check-backlog-empty.sh` so "zero open D-items" is re-checkable after Plan 3 closes, not a one-off assertion. |
| **E-R6** | **Every `backlog_*.md` closure states what closed it** (task id + commit), or it is not closed. A file that says only "done" is a worse record than the open item was. |

---

## 2. The tasks

### Task E1: [both boxes] Read-only `.env` + reference inventory — the evidence E3/E4 consume

**Files:** no file is modified. Creates, on the workstation:
- `/var/www/wavemax/cutover-logs/plan3-env-keys-<box>.txt` (key **names** only, never values),
- `/var/www/wavemax/cutover-logs/plan3-env-refs.txt` (per key: `LIVE`, `DISPLAY-ONLY`, `TEST-ONLY` or `DEAD`),
- appends `ENVKEYS_PORTAL_<box>`, `ENVREFS`, `DEADKEYS_N` to `/var/www/wavemax/cutover-logs/plan3-record.env`.

**Interfaces:**
- Consumes: §0.1 premises; ruling **E-R2**.
- Produces: `ENVREFS` (the classification file), `DEADKEYS_N` (the count E4's owner wording quotes),
  and the assertion that oci1 and oci2 carry the **same key set**.

**Rollback (exact).** None required — the task only reads and writes new workstation files. To undo:
```bash
EV=/var/www/wavemax/cutover-logs
rm -f "$EV"/plan3-env-keys-oci{1,2}.txt "$EV/plan3-env-refs.txt"
grep -cE '^(ENVKEYS_PORTAL_|ENVREFS=|DEADKEYS_N=)' "$EV/plan3-record.env" || true
```
- Rollback expected: `0` (no such lines left), or the grep's exit status 1 with no output if the record file was newly created.

- [ ] **Step 1: Create the record and pull both key sets (names only).**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; touch "$REC"
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
for pair in oci1:161.153.71.201 oci2:144.24.4.202; do
  BOX=${pair%%:*}; IP=${pair##*:}
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP \
    'grep -oE "^[A-Za-z_][A-Za-z0-9_]*=" /var/www/wavemax/wavemax-affiliate-program/.env | tr -d "=" | sort -u' \
    > "$EV/plan3-env-keys-$BOX.txt"
  rec "ENVKEYS_PORTAL_$BOX" "$EV/plan3-env-keys-$BOX.txt"
  printf '%s %s\n' "$BOX" "$(wc -l < "$EV/plan3-env-keys-$BOX.txt")"
done
cmp -s "$EV/plan3-env-keys-oci1.txt" "$EV/plan3-env-keys-oci2.txt" && echo KEYSETS_IDENTICAL || echo KEYSETS_DIFFER
```
  - Expected, three lines: `oci1 85`, `oci2 85`, `KEYSETS_IDENTICAL`.
  - `KEYSETS_DIFFER` — **STOP.** The boxes have drifted; diff the two files and resolve before any edit.
    A count other than `85` means the file changed since 2026-09-20; re-derive §0.1 before continuing.

- [ ] **Step 2: Classify every key against the code (ruling E-R2).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
EV=/var/www/wavemax/cutover-logs
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
grep -c '^DEAD' "$EV/plan3-env-refs.txt"
```
  - Expected (measured 2026-09-20; `uniq -c` sorts the labels alphabetically): `16 DEAD`, `59 LIVE`,
    `10 NO-RUNTIME`, then the final line `16`.
  - The 16 `DEAD`: `ACCESS_GATE_ENABLED`, `DOCUSIGN_W9_TEMPLATE_ID`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`,
    `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_PLACES_LOCATION_PLACE_ID`, `MEDIATOR_GATE_ENABLED`,
    `MEDIATOR_GATE_PASSWORDS`, `OAUTH_CALLBACK_URI`, `OPERATOR_PIN_REENTRY`, `OPERATOR_TOKEN_EXPIRY`,
    `RUN_BACKGROUND_JOBS`, `SERVICE_CITY`, `SERVICE_RADIUS_MILES`, `SERVICE_STATE`.
  - The 10 `NO-RUNTIME`: nine `DOCUSIGN_*` — `ACCOUNT_ID`, `BASE_URL`, `CLIENT_SECRET`, `INTEGRATION_KEY`,
    `OAUTH_BASE_URL`, `PRIVATE_KEY`, `REDIRECT_URI`, `USER_ID`, `WEBHOOK_SECRET` — present only in the
    `administrator-dashboard-init.js:2669` *display grouping*, which can never populate (the server filters by
    `systemHealthService.js` `ALLOWED_ENV_VARS`, which contains no `DOCUSIGN_` key), plus
    `ENABLE_TEST_PAYMENT_FORM` (`tests/integration/v1PaymentRemoval.test.js` only).
  - **`DEAD` + `NO-RUNTIME` = 26 removable keys.** `PM2_APP_NAME` classifies `LIVE` because
    `ecosystem.config.js` is in the runtime set — pm2 reads it, so it stays. That is the classifier working:
    a key referenced only by a *page* or a *test* is removable; one referenced by the process manager is not.
  - Different counts are not automatically wrong — the sweep is substring-based. Any key that moves between
    buckets must be hand-checked and the change recorded in the record file before E3/E4 act on it.

- [ ] **Step 3: Record the three stale-value live keys and the one missing key.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
rec ENVREFS "$EV/plan3-env-refs.txt"; rec DEADKEYS_N "$(grep -c '^DEAD' "$EV/plan3-env-refs.txt")"
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
grep -n 'FRONTEND_URL'   server/services/passwordResetService.js
grep -n 'DEFAULT_ADMIN_EMAIL' server/services/systemHealthService.js server/services/email/dispatcher/ops.js
grep -c 'BACKEND_URL' server/services/systemHealthService.js
```
  - Expected, four blocks:
    - `86:  const resetUrl = \`${process.env.FRONTEND_URL}/embed-app-v2.html?route=/reset-password&token=${encodeURIComponent(resetToken)}&type=${userType}\`;`
    - `server/services/systemHealthService.js:52:    || user.email === process.env.DEFAULT_ADMIN_EMAIL;` and
      `server/services/email/dispatcher/ops.js:13:    to: process.env.ALERT_EMAIL || process.env.DEFAULT_ADMIN_EMAIL || 'admin@rundberglaundry.com',`
      (line 37 of systemHealthService also lists the name in `ALLOWED_ENV_VARS`)
    - `1`
  - Findings to carry forward, all three already verified against the live mail host:
    - `FRONTEND_URL` is the **sole** input to every reset link → **E2**.
    - `DEFAULT_ADMIN_EMAIL=admin@wavemax.promo` both **grants super-admin by email equality** and is the
      **alert-mail fallback**. In Mailcow it is an alias → `admin@rundberglaundry.com`, an *active but
      unread* mailbox (`admin@crhsent.com` is the one mailbox we read). So ops alerts are **delivered and
      ignored** — the same failure shape as the 2026-08-23 outage. → owner decision in **E4 Step 1**.
    - `BACKEND_URL` has no consumer at all → owner choice in **E3 Step 1**.

---

### Task E2: `passwordResetService` builds its link from `BASE_URL`, not `FRONTEND_URL` (strict TDD)

**Files:** affiliate repo.
- `tests/unit/passwordResetService.test.js` (new or extended — the failing test first),
- `server/services/passwordResetService.js` (line 86),
- `server/services/systemHealthService.js` (drop `'FRONTEND_URL'` from `ALLOWED_ENV_VARS`),
- `public/assets/js/administrator-dashboard-init.js` (drop `'FRONTEND_URL'` from the `Application` grouping).

**Interfaces:**
- Consumes: E1 Step 3's finding; `BASE_URL=https://portal.atxwashdryfold.com` (live, both boxes, §0.1); ruling **E-R1**.
- Produces: a portal whose reset links are generated from the canonical portal origin, so
  (a) the `rundberglaundry.com` flip cannot break password reset, and (b) `FRONTEND_URL` becomes deletable (E3).
- **Blocks:** group A's `rundberglaundry.com` flip. **Gates:** E12 (the human round trip).

**Why `BASE_URL` and not "fix `FRONTEND_URL`'s value":** two env keys for one origin is the defect. `BASE_URL` is
already correct on both boxes, is already the app's canonical origin everywhere else, and deleting the duplicate
is what exit criterion 5 asks for. No new key is introduced.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git revert --no-edit <E2-sha> && npm test -- tests/unit/passwordResetService.test.js 2>&1 | tail -3
```
- Rollback expected: `Tests:` line showing the pre-E2 count, and the reverted line reads
  `${process.env.FRONTEND_URL}/embed-app-v2.html?route=/reset-password…`.
- Rollback is code-only and safe at any time **before** E3 deletes `FRONTEND_URL` from the boxes.
  After E3, reverting E2 alone yields `undefined/embed-app-v2.html…` in reset emails — revert E3 too, or don't revert.

- [ ] **Step 1: Write the failing test first.** It must fail for the right reason before any edit.
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
cat >> tests/unit/passwordResetService.test.js <<'EOF'

// E2 — the reset link is built from the canonical portal origin. FRONTEND_URL
// pointed at rundberglaundry.com, which Plan 3 flips to the content app on :3001;
// that app does not serve /embed-app-v2.html, so every reset link would 404.
describe('E2: reset link origin', () => {
  const OLD = { ...process.env };
  afterEach(() => { process.env = { ...OLD }; });

  test('uses BASE_URL', async () => {
    process.env.BASE_URL = 'https://portal.atxwashdryfold.com';
    delete process.env.FRONTEND_URL;
    const url = await captureResetUrl({ userType: 'affiliate' });
    expect(url).toMatch(/^https:\/\/portal\.atxwashdryfold\.com\/embed-app-v2\.html\?route=\/reset-password&token=[0-9a-f]{64}&type=affiliate$/);
  });

  test('never emits the string "undefined" as an origin', async () => {
    delete process.env.BASE_URL; delete process.env.FRONTEND_URL;
    const url = await captureResetUrl({ userType: 'affiliate' });
    expect(url).not.toMatch(/^undefined/);
  });

  test('ignores FRONTEND_URL even when it is set', async () => {
    process.env.BASE_URL = 'https://portal.atxwashdryfold.com';
    process.env.FRONTEND_URL = 'https://rundberglaundry.com';
    const url = await captureResetUrl({ userType: 'affiliate' });
    expect(url).not.toContain('rundberglaundry.com');
  });
});
EOF
npm test -- tests/unit/passwordResetService.test.js 2>&1 | tail -20
```
  - Expected: `Tests:       3 failed`, the first failure naming `rundberglaundry.com` (or `undefined`) as
    `Received`. `captureResetUrl` is a helper the implementer writes in the same file: it stubs the
    `RESET_EMAIL_SENDERS` dispatcher and returns the `resetUrl` argument it was called with.
  - A test that passes here proves nothing — **STOP** and fix the harness (it is not reaching line 86).
  - A test that errors on `captureResetUrl is not defined` is not yet a red test — finish the helper first.

- [ ] **Step 2: The one-line change plus its two display companions.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
sed -i 's|${process.env.FRONTEND_URL}/embed-app-v2.html|${process.env.BASE_URL}/embed-app-v2.html|' server/services/passwordResetService.js
sed -i "s/'BASE_URL', 'FRONTEND_URL', 'BACKEND_URL',/'BASE_URL', 'BACKEND_URL',/" server/services/systemHealthService.js
sed -i "s/'BASE_URL', 'FRONTEND_URL', 'BACKEND_URL', 'CORS_ORIGIN'/'BASE_URL', 'BACKEND_URL', 'CORS_ORIGIN'/" public/assets/js/administrator-dashboard-init.js
grep -c 'FRONTEND_URL' server/ -r --include=*.js
grep -rc 'FRONTEND_URL' public/assets/js/administrator-dashboard-init.js
npm test -- tests/unit/passwordResetService.test.js 2>&1 | tail -6
```
  - Expected: no `server/` file reports a non-zero count (the grep prints nothing or `…:0` lines only),
    `0` for the dashboard file, then `Tests:       3 passed`.
  - Any remaining `FRONTEND_URL` in `server/` — **STOP**: E3 must not delete a key the code still reads.

- [ ] **Step 3: Full-suite regression and commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npm test 2>&1 | tail -6
npx eslint server/services/passwordResetService.js server/services/systemHealthService.js
git add -A && git commit -m "fix(auth): build password-reset links from BASE_URL, not the retired FRONTEND_URL

FRONTEND_URL=https://rundberglaundry.com was the sole input to every reset link
(passwordResetService.js:86). Plan 3 flips that host to the content app on :3001,
which does not serve /embed-app-v2.html — every reset link would have 404'd at the
flip, for affiliates, administrators and operators alike. BASE_URL is already the
canonical portal origin on both boxes, so the duplicate key goes away with it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git push
```
  - Expected: the suite's committed baseline (Global Constraint 19: its two known failures stand — no NEW
    failure), eslint silent, `git push` reporting `main -> main`.
  - A third failure — **STOP**, fix before pushing (project rule: fix everything before advancing).

---

### Task E3: [both boxes] **HUMAN-CONFIRM** — the brief's three dead keys, `ALERT_EMAIL`, and the reload

**Files:** box only — `/var/www/wavemax/wavemax-affiliate-program/.env` on oci1 and oci2.
Creates `/var/www/wavemax/env-backups/.env.<TS>` on each box first.

**Interfaces:**
- Consumes: E1's `ENVREFS`; **E2 merged and deployed** (ruling E-R1); §0.1's `createCsrf` premise.
- Produces: `TS_E3_<box>`; a portal `.env` with `OAUTH_CALLBACK_URI`, `DOCUSIGN_REDIRECT_URI` and
  `FRONTEND_URL` gone, `BACKEND_URL` corrected (or gone, owner's choice), `ALERT_EMAIL=admin@crhsent.com`
  added, **83 keys** (85 − 3 + 1). Unblocks group A's `rundberglaundry.com` flip.
- Both apps read `.env` only at boot → `pm2 reload wavemax --update-env` is **required**, and is the only
  production-affecting action in this task.

**Rollback (exact).**
```bash
BOX=oci1; IP=161.153.71.201        # pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
V=TS_E3_$BOX; TS=${!V}; test -n "$TS" && echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
cat /var/www/wavemax/env-backups/.env.$TS > /var/www/wavemax/wavemax-affiliate-program/.env
grep -c '^FRONTEND_URL=https://rundberglaundry.com\$' /var/www/wavemax/wavemax-affiliate-program/.env
pm2 reload wavemax --update-env >/dev/null && sleep 5
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/health"
```
- Rollback expected: `TS=<value>`, `1`, `200`.
- ⚠️ If E2 is already live, rolling back only this task restores a *working but wrong* `FRONTEND_URL` that
  nothing reads — harmless. Rolling back E2 **and not** E3 is the dangerous order; see E2's rollback note.

- [ ] **Step 1 (HUMAN-CONFIRM): Ask Rick.** Say exactly this:

  > Portal `.env` on both boxes. Three keys go away and one arrives.
  >
  > `OAUTH_CALLBACK_URI` and `DOCUSIGN_REDIRECT_URI` are leftovers from the social-login and DocuSign
  > subsystems, both deleted from the code — nothing reads either key anywhere in the app, web-core, the
  > scripts or the tests.
  >
  > `FRONTEND_URL=https://rundberglaundry.com` was the **only** thing building password-reset links. That
  > matters: when we flip `rundberglaundry.com` to the content app, `/embed-app-v2.html` stops existing on
  > that host and every reset link would 404 — for you as administrator too. The code now builds the link
  > from `BASE_URL` (already `https://portal.atxwashdryfold.com`), so the key can go.
  >
  > I'm also adding `ALERT_EMAIL=admin@crhsent.com`. Today it is unset, so outage alerts fall back to
  > `DEFAULT_ADMIN_EMAIL=admin@wavemax.promo`, which aliases to `admin@rundberglaundry.com` — a live
  > mailbox you don't read. Alerts are being delivered and ignored.
  >
  > One choice for you: `BACKEND_URL=https://wavemax.promo` has **no consumer** — it only shows up in the
  > admin panel's environment view. Correct it to `https://portal.atxwashdryfold.com`, or delete it?
  > (Default if you don't care: correct it.)
  >
  > Both boxes get a `.env` backup first, then `pm2 reload wavemax --update-env` — a rolling reload, no
  > downtime, and `@crhs/web-core` 0.2.1 with `createCsrf` is confirmed installed on both, so the
  > boot-breaker premise is clear. Proceed?

  Continue only on an explicit yes. Record the `BACKEND_URL` answer as `E3_BACKEND_URL=correct|delete`.

- [ ] **Step 2 (HUMAN-CONFIRM): Back up, then edit. Repeat per box.**
```bash
BOX=oci1; IP=161.153.71.201        # pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
set -a; . "$REC"; set +a
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y%m%dT%H%M%SZ'); rec "TS_E3_$BOX" "$TS"; echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
A=/var/www/wavemax/wavemax-affiliate-program/.env
test \"\$(grep -c '^OAUTH_CALLBACK_URI=https://wavemax.promo\$' \$A)\" = 1
test \"\$(grep -c '^DOCUSIGN_REDIRECT_URI=' \$A)\" = 1
test \"\$(grep -c '^FRONTEND_URL=https://rundberglaundry.com\$' \$A)\" = 1
test \"\$(grep -c '^BASE_URL=https://portal.atxwashdryfold.com\$' \$A)\" = 1
test \"\$(grep -c '^ALERT_EMAIL=' \$A)\" = 0
test -d /var/www/wavemax/env-backups
cp -p \$A /var/www/wavemax/env-backups/.env.$TS
cmp \$A /var/www/wavemax/env-backups/.env.$TS && echo BACKUP_IDENTICAL
T=\$(mktemp); trap 'rm -f \$T' EXIT
grep -vE '^(OAUTH_CALLBACK_URI|DOCUSIGN_REDIRECT_URI|FRONTEND_URL)=' \$A > \$T
if [ '$E3_BACKEND_URL' = delete ]; then sed -i '/^BACKEND_URL=/d' \$T
else sed -i 's|^BACKEND_URL=.*|BACKEND_URL=https://portal.atxwashdryfold.com|' \$T; fi
echo 'ALERT_EMAIL=admin@crhsent.com' >> \$T
cat \$T > \$A
echo E3_ENV_WRITTEN"
```
  - Expected: `TS=<YYYYMMDDTHHMMSSZ>`, `BACKUP_IDENTICAL`, `E3_ENV_WRITTEN`.
  - Any other output: nothing was written — the `set -e` preconditions all run before `cat $T > $A`. Compare
    the failing premise against §0.1, then **STOP** and ask Rick.

- [ ] **Step 3: Verify the file before reloading (read-only).**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'A=/var/www/wavemax/wavemax-affiliate-program/.env
grep -cE "^(OAUTH_CALLBACK_URI|DOCUSIGN_REDIRECT_URI|FRONTEND_URL)=" $A
grep -cx "ALERT_EMAIL=admin@crhsent.com" $A
grep -oE "^[A-Za-z_][A-Za-z0-9_]*=" $A | tr -d "=" | sort -u | wc -l
grep -oE "^[A-Za-z_][A-Za-z0-9_]*=" $A | sort | uniq -d | wc -l
cd /var/www/wavemax/wavemax-affiliate-program && node -e "const e=require(\"dotenv\").parse(require(\"fs\").readFileSync(\".env\"));console.log(JSON.stringify([e.BASE_URL,e.ALERT_EMAIL,e.FRONTEND_URL===undefined]))"'
```
  - Expected, five lines: `0`, `1`, `83`, `0`,
    `["https://portal.atxwashdryfold.com","admin@crhsent.com",true]`.
  - With `E3_BACKEND_URL=delete` the third line is `82`.
  - Anything else: run the Rollback for this box, then **STOP**.

- [ ] **Step 4 (HUMAN-CONFIRM): Reload and prove the app is healthy. One box, verify, then the other.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 reload wavemax --update-env >/dev/null; sleep 8
pm2 jlist | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const j=JSON.parse(s).filter(p=>p.name===\"wavemax\");console.log(j.map(p=>p.pm2_env.status+\":\"+p.pm2_env.restart_time).join(\" \"))})"
curl -s -o /dev/null -w "%{http_code}\n" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/health
tail -n 200 /var/www/wavemax/wavemax-affiliate-program/logs/combined.log | grep -ciE "FRONTEND_URL|undefined/embed-app-v2" || true'
```
  - Expected: `online:1 online:1` (a reload increments `restart_time` from 0 to 1), `200`, `0`.
  - A `status` other than `online`, or a non-200: run the Rollback for this box immediately and **STOP**.
    **Do not start the second box** until the first prints all three expected values.

- [ ] **Step 5: Public proof through Cloudflare, once both boxes are done.**
```bash
for h in portal.atxwashdryfold.com; do printf '%s ' "$h"; curl -s -o /dev/null -w '%{http_code}\n' "https://$h/health?lh=$(date +%s)"; done
curl -s "https://portal.atxwashdryfold.com/embed-app-v2.html?route=/forgot-password&lh=$(date +%s)" -o /dev/null -w '%{http_code}\n'
```
  - Expected: `portal.atxwashdryfold.com 200`, then `200`.

---

### Task E4: [both boxes] **HUMAN-CONFIRM, SCOPE EXPANSION** — the 24 remaining dead keys, the 27-line dead private key, and their code companions

**Files:**
- box: `/var/www/wavemax/wavemax-affiliate-program/.env` (both boxes), backed up to `/var/www/wavemax/env-backups/.env.<TS>`;
- repo: `public/assets/js/administrator-dashboard-init.js` (delete the `DocuSign` grouping),
  `scripts/admin/rotate-credentials.sh` (drop `DOCUSIGN_WEBHOOK_SECRET`),
  `tests/unit/systemHealth.test.js` (or the suite that pins `ALLOWED_ENV_VARS`) — a guard test.

**Interfaces:**
- Consumes: E1's `ENVREFS` and `DEADKEYS_N`; E3 complete on both boxes; rulings **E-R2**, **E-R3**.
- Produces: portal `.env` at **59 keys** (83 − 24) with no PEM body lines; the `.env` half of exit criterion 5.

**Why this is flagged as scope expansion (project rule: scope changes confirm).** The brief scoped item 21 at
three keys. E1 measured **26** keys with no runtime consumer; E3 removed two of them, so **24** remain. They are
not cosmetic: one is a **plaintext RSA private key living on two production boxes for an integration that no
longer exists**, and four are OAuth client secrets for the same. Leaving them contradicts exit criterion 5
("no dead `.env` keys") in the plan whose whole purpose is an empty backlog. The controller must either take
this task or record an owner decision to keep them.

**Note on the private key.** The historic `keys/docusign_private.pem` repo-exposure finding was **corrected on
2026-09-20** (`7af31a64`): no `.pem` was ever committed on any branch or tag. This is a different exposure —
the key is in the production `.env`, not in git. Removing it needs no rotation (the integration is gone), but
the owner may still want the credential revoked in the DocuSign admin console if that account still exists.

**Rollback (exact).**
```bash
BOX=oci1; IP=161.153.71.201        # pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
V=TS_E4_$BOX; TS=${!V}; test -n "$TS" && echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
cat /var/www/wavemax/env-backups/.env.$TS > /var/www/wavemax/wavemax-affiliate-program/.env
grep -c '^DOCUSIGN_PRIVATE_KEY=' /var/www/wavemax/wavemax-affiliate-program/.env
pm2 reload wavemax --update-env >/dev/null && sleep 5
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/health"
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git revert --no-edit <E4-sha>
```
- Rollback expected: `TS=<value>`, `1`, `200`, then the revert's commit line.

- [ ] **Step 1 (HUMAN-CONFIRM): Ask Rick. Two questions, one of them a decision.** Say exactly this:

  > Follow-on to the `.env` cleanup, and it is bigger than the three keys I described. I swept all 85 keys
  > against the code: **26 have no consumer anywhere** — not the app, not web-core, not the scripts, not the
  > tests. Two of them went with the last task; these **24** remain:
  >
  > - the rest of the **DocuSign block** — nine keys (the tenth, the redirect URI, went last time), including
  >   `DOCUSIGN_PRIVATE_KEY`, which is a **live RSA private key in plaintext on both production boxes, 27 lines
  >   long**, for an integration deleted from the code.
  >   (Separate from the old `keys/docusign_private.pem` scare — you corrected that on Friday; nothing was
  >   ever committed. This copy is on the boxes, not in git.)
  > - **`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET`** — social
  >   login was deleted with `passport-config.js`.
  > - **`ACCESS_GATE_ENABLED`, `MEDIATOR_GATE_ENABLED`, `MEDIATOR_GATE_PASSWORDS`** — the crhsent gates moved
  >   to the content app. The content app keeps its own copies; deleting them from the *portal* file changes
  >   nothing about the mediator gate.
  > - **`SERVICE_CITY` / `SERVICE_STATE` / `SERVICE_RADIUS_MILES`** — the geographic service-area matching
  >   that was removed; **`OPERATOR_PIN_REENTRY` / `OPERATOR_TOKEN_EXPIRY`**; `GOOGLE_PLACES_LOCATION_PLACE_ID`;
  >   `RUN_BACKGROUND_JOBS`; `ENABLE_TEST_PAYMENT_FORM`.
  >
  > Removing the private key means deleting a **line range**, not a key — a naive delete would leave 26 orphan
  > base64 lines still holding the key. Backups first, then the same rolling reload.
  >
  > **Decision I need:** `DEFAULT_ADMIN_EMAIL=admin@wavemax.promo`. This one is **not** dead — it does two
  > live things: any administrator whose email equals it is treated as **super-admin**, and it is the outage-alert
  > fallback. It points at a retired-brand address that aliases to `admin@rundberglaundry.com`. Change it to
  > `admin@crhsent.com`? That is only safe if your administrator account's email is *already* `admin@crhsent.com` —
  > if it is still the wavemax.promo address, changing this key **removes your own super-admin rights**. I will
  > read the administrator collection and tell you which it is before we touch it. Want me to check and then decide?
  >
  > Also: if the DocuSign account still exists, you may want the key revoked in DocuSign's console. That's yours, not mine.

  Record `E4_APPROVED=yes|no` and `E4_DEFAULT_ADMIN=change|keep|decide-after-check`.

- [ ] **Step 2: Read the administrator collection (read-only) so the `DEFAULT_ADMIN_EMAIL` decision is informed.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'cd /var/www/wavemax/wavemax-affiliate-program && node -e "
require(\"dotenv\").config();
const m=require(\"mongoose\");
(async()=>{ await m.connect(process.env.MONGODB_URI);
  const A=m.connection.collection(\"administrators\");
  const rows=await A.find({},{projection:{email:1,permissions:1,isSuperAdmin:1,_id:0}}).toArray();
  console.log(JSON.stringify(rows.map(r=>({email:r.email,star:Array.isArray(r.permissions)&&r.permissions.includes(\"*\"),sa:!!r.isSuperAdmin}))));
  await m.disconnect(); })().catch(e=>{console.log(\"ERR\",e.message);process.exit(1)})"'
```
  - Expected: a JSON array of administrators. Read it as follows:
    - any row with `"star":true` or `"sa":true` keeps super-admin **regardless** of this key → the change is safe;
    - a row whose `email` is `admin@wavemax.promo` **and** has `star:false, sa:false` → that account's
      super-admin depends **only** on this key. **STOP** and tell Rick before changing it.
  - `ERR …` — the probe failed; do not guess. Fix the probe or ask Rick to read the value from the admin panel.

- [ ] **Step 3 (HUMAN-CONFIRM): Delete the 24 dead keys — by name for 23, by line range for the PEM. Per box.**
```bash
BOX=oci1; IP=161.153.71.201        # pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y%m%dT%H%M%SZ'); rec "TS_E4_$BOX" "$TS"; echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
A=/var/www/wavemax/wavemax-affiliate-program/.env
test \"\$(grep -c '^DOCUSIGN_PRIVATE_KEY=' \$A)\" = 1
test \"\$(grep -c 'BEGIN RSA PRIVATE KEY' \$A)\" = 1
test \"\$(grep -c 'END RSA PRIVATE KEY' \$A)\" = 1
cp -p \$A /var/www/wavemax/env-backups/.env.$TS
cmp \$A /var/www/wavemax/env-backups/.env.$TS && echo BACKUP_IDENTICAL
S=\$(grep -n '^DOCUSIGN_PRIVATE_KEY=' \$A | cut -d: -f1)
E=\$(grep -n 'END RSA PRIVATE KEY' \$A | cut -d: -f1)
test \"\$S\" -lt \"\$E\"; echo \"PEM_RANGE \$S-\$E\"
T=\$(mktemp); trap 'rm -f \$T' EXIT
sed \"\$S,\$E d\" \$A > \$T
grep -vE '^(ACCESS_GATE_ENABLED|DOCUSIGN_INTEGRATION_KEY|DOCUSIGN_USER_ID|DOCUSIGN_ACCOUNT_ID|DOCUSIGN_BASE_URL|DOCUSIGN_OAUTH_BASE_URL|DOCUSIGN_W9_TEMPLATE_ID|DOCUSIGN_WEBHOOK_SECRET|DOCUSIGN_CLIENT_SECRET|ENABLE_TEST_PAYMENT_FORM|FACEBOOK_APP_ID|FACEBOOK_APP_SECRET|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|GOOGLE_PLACES_LOCATION_PLACE_ID|MEDIATOR_GATE_ENABLED|MEDIATOR_GATE_PASSWORDS|OPERATOR_PIN_REENTRY|OPERATOR_TOKEN_EXPIRY|RUN_BACKGROUND_JOBS|SERVICE_CITY|SERVICE_RADIUS_MILES|SERVICE_STATE)=' \$T > \$T.2
cat \$T.2 > \$A; rm -f \$T.2
echo E4_ENV_WRITTEN"
```
  - Expected: `TS=<…>`, `BACKUP_IDENTICAL`, `PEM_RANGE 120-147` (the exact numbers shift once E3 has removed
    three earlier lines — the assertion is only that `S < E` and that the span is **27** lines: `E - S + 1`),
    `E4_ENV_WRITTEN`.
  - ⚠️ Ruling **E-R3**: the `sed "$S,$E d"` runs **before** the name filter, so the PEM body goes with its key.
    If `PEM_RANGE` spans anything other than 27 lines, **STOP** — the file is not shaped as measured.

- [ ] **Step 4: Verify, then reload. Per box, first box fully green before the second.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'A=/var/www/wavemax/wavemax-affiliate-program/.env
grep -ciE "PRIVATE KEY|^DOCUSIGN_|^GOOGLE_CLIENT|^FACEBOOK_APP|^MEDIATOR_GATE|^SERVICE_(CITY|STATE|RADIUS)|^RUN_BACKGROUND_JOBS|^ACCESS_GATE_ENABLED|^OPERATOR_(PIN_REENTRY|TOKEN_EXPIRY)|^ENABLE_TEST_PAYMENT_FORM|^GOOGLE_PLACES_LOCATION_PLACE_ID" $A
grep -oE "^[A-Za-z_][A-Za-z0-9_]*=" $A | tr -d "=" | sort -u | wc -l
grep -cvE "^[A-Za-z_][A-Za-z0-9_]*=|^\s*#|^\s*$" $A
cd /var/www/wavemax/wavemax-affiliate-program && node -e "require(\"dotenv\").config();console.log([\"MONGODB_URI\",\"JWT_SECRET\",\"ENCRYPTION_KEY\",\"SESSION_SECRET\",\"EMAIL_PASS\",\"BASE_URL\",\"ALERT_EMAIL\"].every(k=>process.env[k]&&process.env[k].length>0))"
pm2 reload wavemax --update-env >/dev/null; sleep 8
curl -s -o /dev/null -w "%{http_code}\n" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/health'
```
  - Expected, five lines: `0`, `59`, `0`, `true`, `200`. (`58` if the owner chose `E3_BACKEND_URL=delete`.)
  - The third line is the one ruling E-R3 exists for: `0` means **no orphan PEM lines remain**.
  - `false` on the fourth line means a key the app needs was caught by the filter — run the Rollback for this
    box immediately, then **STOP**.

- [ ] **Step 5: The code companions (one commit, affiliate repo).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
sed -n '40,60p;70,85p;115,125p' scripts/admin/rotate-credentials.sh   # read before editing
grep -n "'DocuSign':" public/assets/js/administrator-dashboard-init.js
```
  - Then, in the same commit: delete the `'DocuSign': [...]` grouping line, delete the four
    `DOCUSIGN_WEBHOOK_SECRET` references in `rotate-credentials.sh` (lines 48, 56, 78, 121 as of today), and add
    a guard test asserting `systemHealthService.ALLOWED_ENV_VARS` contains **no** `DOCUSIGN_`, `GOOGLE_CLIENT`,
    `FACEBOOK_APP` or `FRONTEND_URL` entry — so the dead groups cannot grow back.
  - Write the guard test first and watch it fail (strict TDD). Expected before the edit:
    `Tests:       1 failed`; after: `1 passed`, then `npm test` at the committed baseline and
    `npx eslint server/ scripts/ --ext .js` no worse than its recorded count.
  - Commit message subject: `chore(env): delete the DocuSign and social-login remnants, and guard the env allowlist`.

---

### Task E5: [read-only] **IDENTIFY** the submission-port churn before proposing any fix (brief item 22)

**Files:** none modified. Creates `/var/www/wavemax/cutover-logs/plan3-smtp-churn.txt` on the workstation.

**Interfaces:**
- Consumes: the mail-host access route (`sudo ssh wavemax-promo`) and the `--tail N` constraint
  (`docker compose logs --since` returns nothing on this host).
- Produces: `SMTP_CHURN_SOURCE`, `SMTP_CHURN_RATE_PER_BOX`, `SMTP_CHURN_LOG_SHARE` — the three facts E6's fix
  is judged against.

**The identification, already made (this task re-proves it on the live systems — do not skip Step 3).**
`server/monitoring/connectivity-monitor.js` `checkSMTP()` opens a raw `net.Socket` to
`EMAIL_HOST:EMAIL_PORT`, and on the `'connect'` event calls `client.destroy()` — it never speaks SMTP and never
sends `QUIT`. That is exactly postfix's `lost connection after CONNECT … commands=0/0`. `startMonitoring()` is
called from `server.js:1062` inside `app.listen`, so **every pm2 worker runs its own 60-second cycle**; two
workers per box, two boxes, one connection each per minute. The `Mailcow SMTP` service entry is
`critical: false`, so a failure never alerts — the probe's only consumer is the `/monitoring/status` tile.

**Rollback (exact).** None — read-only. `rm -f /var/www/wavemax/cutover-logs/plan3-smtp-churn.txt` undoes it.

- [ ] **Step 1: Measure the rate and the log share on the mail host.**
```bash
EV=/var/www/wavemax/cutover-logs
sudo ssh wavemax-promo 'L=$(docker logs --tail 4000 mailcowdockerized-postfix-mailcow-1 2>&1)
echo "WINDOW_START $(printf "%s" "$L" | head -1 | cut -c1-15)"
echo "WINDOW_END   $(printf "%s" "$L" | tail -1 | cut -c1-15)"
echo "OCI1_LINES $(printf "%s" "$L" | grep -c 161.153.71.201)"
echo "OCI2_LINES $(printf "%s" "$L" | grep -c 144.24.4.202)"
echo "TOTAL_LINES $(printf "%s" "$L" | wc -l)"
echo "--- seconds-offset histogram (oci2) ---"
printf "%s" "$L" | grep "144.24.4.202" | grep "connect from" | awk "{print substr(\$3,7,2)}" | sort | uniq -c | sort -rn | head -3
echo "--- commands!=0/0 from either box (real sends) ---"
printf "%s" "$L" | grep -E "161.153.71.201|144.24.4.202" | grep -c "commands=0/0" ' | tee "$EV/plan3-smtp-churn.txt"
```
  - Expected shape (measured 2026-09-20 21:11 UTC over a 5 h 02 m window):
    `WINDOW_START Sep 20 19:09`, `WINDOW_END Sep 21 00:11`, `OCI1_LINES 1813`, `OCI2_LINES 1859`,
    `TOTAL_LINES 4000`; the histogram showing **one dominant second offset** (`24` for oci2, `50` for oci1);
    and the last number within a few of `OCI1_LINES + OCI2_LINES` divided by 3.
  - Derived and recorded: `(1813+1859)/4000 = 91.8 %` of the submission log is this probe;
    `1859 lines / 3 lines-per-connection / 302 min ≈ 2.05` connections per minute per box.
  - A single dominant second offset is the proof it is a **timer**, not traffic. Several offsets, or a rate
    far above 2/min/box, means something else is also probing — **STOP** and investigate before E6.

- [ ] **Step 2: Confirm real sends still complete in the same log (the churn is not masking a mail failure).**
```bash
sudo ssh wavemax-promo 'docker logs --tail 4000 mailcowdockerized-postfix-mailcow-1 2>&1 | grep -E "sasl_username|status=sent|status=bounced" | tail -10'
```
  - Expected: recent `status=sent` lines, or **no output** if no mail was sent in the window. Any
    `status=bounced` or `authentication failed` for `no-reply@crhsent.com` is a **separate, higher-priority
    finding** — surface it before continuing (this is the 2026-08-23 failure shape).

- [ ] **Step 3: Prove the source on the boxes, not just by reading code.**
```bash
for IP in 161.153.71.201 144.24.4.202; do echo "== $IP =="
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'grep -n "checkInterval\|startMonitoring()" /var/www/wavemax/wavemax-affiliate-program/server/monitoring/connectivity-monitor.js | head -3
grep -nE "^EMAIL_(HOST|PORT)=" /var/www/wavemax/wavemax-affiliate-program/.env
pm2 jlist | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(\"wavemax workers: \"+JSON.parse(s).filter(p=>p.name===\"wavemax\").length))"
sudo ss -tn state all "dst 158.62.198.7" 2>/dev/null | tail -5 || echo "(ss needs sudo; optional)"'
done
```
  - Expected per box: `checkInterval: 60000`, `startMonitoring()`, `EMAIL_HOST=158.62.198.7`,
    `EMAIL_PORT=587`, `wavemax workers: 2`. `connections/min/box = workers × 60000 ms⁻¹ = 2` — the arithmetic
    must match Step 1's measurement, or the identification is wrong.
  - Record `SMTP_CHURN_SOURCE=connectivity-monitor.checkSMTP`, the measured rate and the log share.

---

### Task E6: The SMTP probe becomes polite and single-flighted (strict TDD, affiliate repo)

**Files:** `tests/unit/connectivityMonitor.test.js` (new), `server/monitoring/connectivity-monitor.js`.

**Interfaces:**
- Consumes: E5's recorded `SMTP_CHURN_SOURCE` — **this task does not start until E5 Step 3's arithmetic matches**.
- Produces: a probe that closes its connection with `QUIT` and runs in **one** worker; the postfix submission
  log stops being 92 % noise.

**The change, and why it is the smallest honest one.** Three defects, one fix each:
1. **`client.destroy()` on connect** → send `QUIT` and let the server close. Postfix then logs
   `commands=1/1` and a clean `disconnect`, i.e. the log tells the truth about what happened.
2. **Every worker runs the cycle** → gate `startMonitoring()` on `process.env.NODE_APP_INSTANCE === '0'`
   (pm2 sets it per worker; it is `undefined` outside pm2, so a bare `node server.js` still monitors).
   ⚠️ `RUN_BACKGROUND_JOBS` is **not** the hook to use — E1 proved nothing reads it, and E4 deletes it.
3. **60 s for a `critical: false` probe** → 5 minutes. A non-alerting dashboard tile does not need
   minute resolution. Total: 4 connections/min across the estate → **0.2/min**.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git revert --no-edit <E6-sha>
npm test -- tests/unit/connectivityMonitor.test.js 2>&1 | tail -3
```
- Rollback expected: the revert commit line, then the suite failing (the reverted code no longer sends `QUIT`).
- Rollback on the boxes is `git pull --ff-only && pm2 reload wavemax` — behaviour-only, no `.env` involvement.

- [ ] **Step 1: Red — three failing tests.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
cat > tests/unit/connectivityMonitor.test.js <<'EOF'
// E6 — the SMTP probe was connect-and-destroy, per worker, every 60s: 92% of the
// mail host's submission log was this probe reporting commands=0/0.
const net = require('net');

describe('E6: the SMTP probe is polite and single-flighted', () => {
  let server, port, seen;
  beforeEach((done) => {
    seen = [];
    server = net.createServer((sock) => {
      sock.write('220 test ESMTP\r\n');
      sock.on('data', (d) => { seen.push(String(d)); if (/QUIT/i.test(String(d))) { sock.write('221 bye\r\n'); sock.end(); } });
    });
    server.listen(0, '127.0.0.1', () => { port = server.address().port; done(); });
  });
  afterEach((done) => server.close(done));

  test('sends QUIT instead of destroying the socket', async () => {
    const { checkService } = require('../../server/monitoring/connectivity-monitor');
    const r = await checkService({ name: 'Mailcow SMTP', type: 'smtp', host: '127.0.0.1', port });
    expect(r.success).toBe(true);
    expect(seen.join('')).toMatch(/QUIT/i);
  });

  test('the cycle interval is at least 5 minutes', () => {
    const m = require('../../server/monitoring/connectivity-monitor');
    expect(m.MONITORING_CONFIG.checkInterval).toBeGreaterThanOrEqual(300000);
  });

  test('startMonitoring is a no-op in a non-primary pm2 worker', () => {
    const m = require('../../server/monitoring/connectivity-monitor');
    const old = process.env.NODE_APP_INSTANCE; process.env.NODE_APP_INSTANCE = '1';
    expect(m.startMonitoring()).toBe(false);
    process.env.NODE_APP_INSTANCE = '0';
    expect(m.startMonitoring()).toBe(true);
    if (old === undefined) delete process.env.NODE_APP_INSTANCE; else process.env.NODE_APP_INSTANCE = old;
  });
});
EOF
npm test -- tests/unit/connectivityMonitor.test.js 2>&1 | tail -20
```
  - Expected: `Tests:       3 failed`. Failure 1 says `seen` never matched `/QUIT/i`; failure 2 shows
    `Received: 60000`; failure 3 errors because `startMonitoring` returns `undefined`.
  - Anything passing here — **STOP**: the test is not reaching the real module.
  - ⚠️ The third test leaks a live `setInterval` — clear it in the implementation by returning the timer and
    having the test `unref()` it, or the suite will not exit without `--forceExit` (the project forbids that).

- [ ] **Step 2: Green — implement, then re-run.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npm test -- tests/unit/connectivityMonitor.test.js 2>&1 | tail -6
npx eslint server/monitoring/connectivity-monitor.js
npm test 2>&1 | tail -6
```
  - Expected: `Tests:       3 passed`, eslint silent, full suite at its committed baseline.
  - `MONITORING_CONFIG` must be exported for test 2; `startMonitoring()` must return a boolean.

- [ ] **Step 3: Deploy and prove the log went quiet.** Deploy oci1, verify, then oci2.
```bash
for IP in 161.153.71.201 144.24.4.202; do
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/wavemax/wavemax-affiliate-program && git pull --ff-only | tail -2 && pm2 reload wavemax >/dev/null && sleep 8 && curl -s -o /dev/null -w "%{http_code}\n" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/health'; done
sleep 660   # eleven minutes: two probe cycles at the new interval
sudo ssh wavemax-promo 'L=$(docker logs --tail 1500 mailcowdockerized-postfix-mailcow-1 2>&1)
echo "commands=0/0 from our boxes: $(printf "%s" "$L" | grep -E "161.153.71.201|144.24.4.202" | grep -c "commands=0/0")"
echo "commands=1/1 from our boxes: $(printf "%s" "$L" | grep -E "161.153.71.201|144.24.4.202" | grep -c "commands=1/1")"
echo "total lines: $(printf "%s" "$L" | wc -l)"'
```
  - Expected: `200` from each box; then **`commands=0/0` at or near `0`** for connections made after the reload,
    `commands=1/1` small and non-zero (the polite probe, ~2 per 5 min across the estate), and the log window
    covering far more wall-clock time than 5 hours per 4,000 lines.
  - Use `sleep` in a background-safe form; the project's lesson file records that a foreground `sleep` is
    blocked in this harness — run the wait with a `Monitor` until-loop, or simply do Step 3's second half
    in a later session and record the timestamp.
  - `commands=0/0` still arriving at the old cadence means the reload did not pick up the new code — check
    `git log -1` on the box.

---

### Task E7: [read-only] `ofelia` is not "near" its cap — it is being OOM-killed every ~35–40 minutes (brief item 23)

**Files:** none modified. Creates `/var/www/wavemax/cutover-logs/plan3-ofelia.txt`.

**Interfaces:**
- Consumes: mail-host access; the `--tail N` constraint.
- Produces: `OFELIA_OOM_COUNT`, `OFELIA_GROWTH_MIB_PER_MIN`, `OFELIA_IMAGE_DIGEST` — the inputs to E8's decision.

**What the brief got wrong, and why it matters.** `docker inspect … .State.OOMKilled` reads `false`, which is
what "89 % of cap" was inferred from. That field describes only the container's **last exit**; the kernel log
shows the truth — three `oom-kill … task=ofelia` events between 22:26:59 and 23:41:59 on 2026-09-20, each with
`anon-rss ≈ 256 MB`, and `RestartCount=6`. The container restarts cleanly each time (docker restart policy), so
mailcow's own cron jobs keep running and nothing visibly broke — which is exactly why this went unnoticed.
**Whether a job can be lost mid-run is the open question**, and it is E7 Step 4's job to answer it.

**Rollback (exact).** None — read-only. `rm -f /var/www/wavemax/cutover-logs/plan3-ofelia.txt`.

- [ ] **Step 1: Count the OOM kills and the restarts.**
```bash
EV=/var/www/wavemax/cutover-logs
sudo ssh wavemax-promo 'date -u +%FT%TZ
docker inspect mailcowdockerized-ofelia-mailcow-1 --format "started={{.State.StartedAt}} restarts={{.RestartCount}} oomkilled={{.State.OOMKilled}} exit={{.State.ExitCode}} mem={{.HostConfig.Memory}} memswap={{.HostConfig.MemorySwap}} image={{.Config.Image}}"
docker inspect mailcowdockerized-ofelia-mailcow-1 --format "{{.Image}}"
echo "--- kernel oom events for ofelia ---"
sudo dmesg -T | grep -c "task=ofelia"
sudo dmesg -T | grep "Killed process" | grep ofelia | tail -6' | tee "$EV/plan3-ofelia.txt"
```
  - Expected: `restarts=` at **6 or higher**, `mem=268435456`, `memswap=335544320`,
    `image=mcuadros/ofelia:latest`, a sha256 digest, a `task=ofelia` count of **3 or more**, and
    `Killed process … (ofelia) … anon-rss:25xxxxkB` lines roughly 35–40 minutes apart.
  - `oomkilled=false` here is expected and is **not** evidence of health — see the note above.
  - A `task=ofelia` count of `0` means the kernel ring buffer has rotated; fall back to
    `journalctl -k --since "-24h" | grep task=ofelia`.

- [ ] **Step 2: Measure the growth rate directly (two samples, five minutes apart).**
```bash
sudo ssh wavemax-promo 'for i in 1 2 3 4 5 6; do
  printf "%s %s\n" "$(date -u +%H:%M:%S)" "$(docker stats --no-stream --format "{{.MemUsage}}" mailcowdockerized-ofelia-mailcow-1)"
  [ $i -lt 6 ] && sleep 60
done'
```
  - Expected: six samples climbing monotonically by roughly **6–7 MiB per minute** (measured: 186.8 MiB at
    28 minutes of uptime → ≈ 6.7 MiB/min → the 256 MiB cap at ≈ 38 min, matching the observed kill cadence).
  - A flat series means the leak is not time-driven — record and re-scope E8 before changing any cap.
  - Record `OFELIA_GROWTH_MIB_PER_MIN` as `(last − first) / 5`.

- [ ] **Step 3: Is the cap ours, and is there room to raise it?**
```bash
sudo ssh wavemax-promo 'cat /opt/mailcow-dockerized/docker-compose.override.yml
cd /opt/mailcow-dockerized && git log --oneline -3 -- docker-compose.override.yml 2>/dev/null || echo "(override not tracked by mailcow git)"
free -m | sed -n 2p
docker stats --no-stream --format "{{.Name}} {{.MemUsage}}" | sort'
```
  - Expected: the four `mem_limit` entries from §0.1; the override is a **local** file (upstream mailcow does
    not ship one), so raising a cap is our decision, not a fork of upstream. `free -m` shows
    **≥ 2,000 MiB available** — headroom for +256 MiB exists with a wide margin.

- [ ] **Step 4: Does a kill lose a job? (the question that decides urgency)**
```bash
sudo ssh wavemax-promo 'docker logs --tail 3000 mailcowdockerized-ofelia-mailcow-1 2>&1 | grep -c "Started"
docker logs --tail 3000 mailcowdockerized-ofelia-mailcow-1 2>&1 | grep -c "Finished"
docker logs --tail 3000 mailcowdockerized-ofelia-mailcow-1 2>&1 | grep -iE "error|failed: true|panic|skipped: true" | tail -10
docker logs --tail 50 mailcowdockerized-dovecot-mailcow-1 2>&1 | grep -iE "replic|error" | tail -5'
```
  - Expected: `Started` and `Finished` counts within a handful of each other (an in-flight job at each kill is
    lost — that is the real cost), no `panic`, and `failed: true` absent or rare.
  - The jobs at risk are `dovecot_imapsync_runner`, `dovecot_repl_health`, `sogo_ealarms`, `sogo_sessions`,
    `dovecot_trim_logs`, `phpfpm_{ldap,keycloak}_sync` — all idempotent, all re-run within a minute, which is
    why a ~40-minute kill cadence has been invisible. Record that as the severity judgement: **low impact,
    certain defect, cheap fix.**

---

### Task E8: [mail host] **HUMAN-CONFIRM** — decide the `ofelia` cap, apply it, and prove the kills stop

**Files:** mail host only — `/opt/mailcow-dockerized/docker-compose.override.yml`, backed up to
`/opt/mailcow-dockerized/docker-compose.override.yml.<TS>.bak`. Recreates one container.

**Interfaces:**
- Consumes: E7's `OFELIA_OOM_COUNT`, `OFELIA_GROWTH_MIB_PER_MIN`, `OFELIA_IMAGE_DIGEST`, and the `free -m` headroom.
- Produces: an `ofelia` that survives a full day; `OFELIA_DECISION` recorded in `plan3-record.env`.

**The decision, framed.** Raising the cap treats the symptom; the leak is upstream (ofelia is a Go daemon
spawning 7 docker execs a minute, and `:latest` is an unpinned moving target). Three options:

| option | what it does | cost |
|:--|:--|:--|
| **A — raise to 512 MiB / 640 MiB swap** (recommended) | kills become ~80 min apart instead of ~40; box has 2 GiB available | 5 min, one container recreate, reversible |
| **B — pin and upgrade the image** | may fix the leak properly | `:latest` → a tag; needs an upstream check; mailcow's own updater may fight the pin |
| **C — do nothing, document it** | honest, but leaves a known OOM loop in a plan whose exit criterion is "clean deployment" | contradicts the plan |

**A does not close the leak** — say so to the owner rather than implying a fix. Recommended shape: **A now,
plus a recorded note** that if the kills persist at 512 MiB the answer is B, tracked as a closed-with-rationale
item in the escalation register (E15), not as a new backlog entry.

**Rollback (exact).**
```bash
sudo ssh wavemax-promo 'set -e
cd /opt/mailcow-dockerized
TS=$(ls -1t docker-compose.override.yml.*.bak | head -1 | sed "s/.*yml\.\(.*\)\.bak/\1/")
echo "restoring $TS"
cp -p docker-compose.override.yml.$TS.bak docker-compose.override.yml
grep -A2 "ofelia-mailcow:" docker-compose.override.yml
docker compose up -d ofelia-mailcow
sleep 10
docker inspect mailcowdockerized-ofelia-mailcow-1 --format "mem={{.HostConfig.Memory}} status={{.State.Status}}"'
```
- Rollback expected: `restoring <TS>`, the `mem_limit: 256m` / `memswap_limit: 320m` pair, then
  `mem=268435456 status=running`.

- [ ] **Step 1 (HUMAN-CONFIRM): Ask Rick.** Say exactly this:

  > The `ofelia` container on the mail box isn't "near" its limit — it is **being OOM-killed roughly every
  > 40 minutes**, and has been for at least as long as the kernel log goes back. Three kills between 22:26 and
  > 23:41 last night, six restarts. `docker inspect` says `OOMKilled: false`, which is what hid it: that field
  > only describes the last exit, and docker restarts the container cleanly each time.
  >
  > `ofelia` is mailcow's cron scheduler — it fires seven jobs a minute (imapsync, replication health, SoGo
  > session expiry, log trimming). They are all idempotent and re-run within a minute, so the only cost is a
  > job losing its in-flight run every 40 minutes. Nothing visible has broken. But it is a leak: memory climbs
  > about 6.7 MiB a minute from a cold start and hits the 256 MiB cap in ~38 minutes.
  >
  > The cap is **ours**, not mailcow's — it's in a local `docker-compose.override.yml` alongside caps for
  > rspamd, SoGo and php-fpm. The box has about 2 GiB free.
  >
  > I want to **raise `ofelia` to 512 MiB** (swap 640 MiB) and recreate that one container — about ten
  > seconds of no cron, nothing else touched, and it reverts by restoring one file. **That doubles the time
  > between kills; it does not fix the leak.** If it still gets killed at 512 MiB, the real answer is pinning
  > and upgrading the image off `:latest`, which I'd rather do as its own change than bundle in here.
  > Proceed with the cap raise?

  Record `OFELIA_DECISION=raise-512|pin-image|document-only`.

- [ ] **Step 2 (HUMAN-CONFIRM): Back up, edit, recreate — only if `OFELIA_DECISION=raise-512`.**
```bash
sudo ssh wavemax-promo 'set -e
cd /opt/mailcow-dockerized
TS=$(date -u +%Y%m%dT%H%M%SZ); echo "TS=$TS"
test "$(grep -c "mem_limit: 256m" docker-compose.override.yml)" = 2
cp -p docker-compose.override.yml docker-compose.override.yml.$TS.bak
python3 - <<PY
import re,io
p="docker-compose.override.yml"; s=open(p).read()
s=re.sub(r"(ofelia-mailcow:\s*\n\s*mem_limit: )256m(\s*\n\s*memswap_limit: )320m", r"\g<1>512m\g<2>640m", s)
open(p,"w").write(s)
PY
grep -A2 "ofelia-mailcow:" docker-compose.override.yml
docker compose config --quiet && echo COMPOSE_VALID'
```
  - Expected: `TS=<…>`, then `ofelia-mailcow:` / `mem_limit: 512m` / `memswap_limit: 640m`, then `COMPOSE_VALID`.
  - `docker compose config` failing means the file is malformed — restore the `.bak` and **STOP**. Nothing has
    been recreated yet at this point, so the running container is untouched.
  - ⚠️ The `mem_limit: 256m` precondition counts **2** because SoGo shares that value; the python replacement
    is anchored on the `ofelia-mailcow:` key so SoGo is not touched. Step 3 verifies SoGo is still `256m`.

- [ ] **Step 3: Recreate only `ofelia` and verify nothing else moved.**
```bash
sudo ssh wavemax-promo 'cd /opt/mailcow-dockerized
docker compose up -d ofelia-mailcow 2>&1 | tail -3
sleep 15
docker inspect mailcowdockerized-ofelia-mailcow-1 --format "mem={{.HostConfig.Memory}} memswap={{.HostConfig.MemorySwap}} status={{.State.Status}} restarts={{.RestartCount}}"
docker inspect mailcowdockerized-sogo-mailcow-1 --format "sogo_mem={{.HostConfig.Memory}} status={{.State.Status}}"
docker ps --format "{{.Names}} {{.Status}}" | sort | head -20
docker logs --tail 15 mailcowdockerized-ofelia-mailcow-1 2>&1 | tail -5'
```
  - Expected: `mem=536870912 memswap=671088640 status=running restarts=0`;
    `sogo_mem=268435456 status=running`; every mailcow container `Up`; ofelia log showing jobs `Started`/`Finished`.
  - A container other than `ofelia` showing a new uptime — **STOP** and record it; `docker compose up -d <svc>`
    should touch nothing else, and if it did, the override edit hit the wrong key.

- [ ] **Step 4: Prove the kills stopped — 24 hours later, not the same minute.**
```bash
sudo ssh wavemax-promo 'date -u +%FT%TZ
docker inspect mailcowdockerized-ofelia-mailcow-1 --format "uptime_since={{.State.StartedAt}} restarts={{.RestartCount}}"
sudo dmesg -T | grep "task=ofelia" | tail -3
docker stats --no-stream --format "{{.Name}} {{.MemUsage}} {{.MemPerc}}" mailcowdockerized-ofelia-mailcow-1'
```
  - Expected after 24 h: `restarts=0`, no `task=ofelia` line newer than Step 3's timestamp, and memory
    **below 512 MiB**.
  - `restarts` above 0, or a new kernel kill: the leak outruns 512 MiB → escalate to option **B** and record
    it in E15's register as an open escalation with an owner, not as a silent carry-over.

---

### Task E9: H-1's CR/LF residue — reject CR/LF in the three header-bound intake fields and pin nodemailer's behaviour (crhs-corporate)

**Files:** `crhs-corporate`:
- `tests/intakeHardening.test.js` (extend the existing `H-1b` describe block),
- `server/routes/partnerInquiryRoutes.js`, `server/routes/affiliateApplicationRoutes.js`,
- `server/validation/intakeErrorCodes.js` + `content/**/locales/{en,es,pt,de}/*.json` **only if** a new coded
  error is added (see the design note — the recommendation is **not** to add one).

**Interfaces:**
- Consumes: H-1/H-1b (`bfe8751`, `cbbda29`) — the intake routes are exempt from web-core's XSS input-stripper
  via `server/config/sanitizeExemptions.js`, so lead text reaches the mailers raw.
- Produces: intake validators that reject CR/LF in every field that lands in a mail **header**, plus a
  regression test that fails if a nodemailer upgrade ever stops folding CR/LF.

**What H-1 turned out to be, and the exact residue.** H-1 was the A7-review finding that
`wc.sanitization.sanitizeRequest` (`xss({stripIgnoreTag:true})`) deleted an unterminated `<` and everything
after it — `'<50'` became `''` and free-text leads were truncated at the first `<`. H-1b's owner-approved fix
made the four intake paths opt out of that stripper, moving the control to **output escaping**
(`escapeHtml`/`nl2br` in `server/services/intakeMail.js`).

The residue is the **header** path, which output escaping does not cover:

| field | validated as | reaches |
|:--|:--|:--|
| `firstName`, `lastName` | `isString().trim().isLength({min:1,max:50})` | `subject` — `Partner inquiry · ${businessName || fullName}` / `Affiliate application · ${firstName} ${lastName}` |
| `businessName` | `isString().isLength({max:120})` | the same `subject` |
| `email` | `isEmail()` | `replyTo` — **already safe**, `isEmail` rejects CR/LF |

`trim()` strips leading/trailing whitespace only, so an **interior** `"Jane\r\nBcc: x@y.z"` in a 50-character
field passes validation today and reaches `subject`.

**Severity: LOW, and say so.** Verified against the installed nodemailer **8.0.11**:
`lib/mime-node/index.js` `_encodeHeaderValue` sends `Subject` down its `default` branch, which does
`value.replace(/\r?\n|\r/g, ' ')` before `_encodeWords`. Measured end-to-end with `streamTransport`:
`subject: 'Partner inquiry · Jane\r\nBcc: victim@evil.com'` produced the single header
`Subject: =?UTF-8?Q?Partner_inquiry_=C2=B7_Jane_Bcc=3A_victi?=` and **no** `Bcc` header. So this is
**defence-in-depth plus a pin**, not a live injection. The pin is the valuable half: it converts an
undocumented library behaviour we rely on into a test that fails loudly if it changes.

**Design note — no new locale keys.** Adding a coded error would mean a tenth intake error code and
`9 → 10` new leaves × 4 locales, moving the `EXPECTED_PARTNER_LEAVES` assertion. A CR/LF in a name is not a
mistake a real lead makes; reuse the existing `firstNameLength` / `lastNameLength` codes by expressing the
rule as part of the same chain (`.matches(/^[^\r\n]*$/)` before `.isLength(...)`, sharing the `withMessage`).
If the reviewer prefers a distinct code, that is a locale-parity change and must be scoped as such.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && git revert --no-edit <E9-sha>
npm test -- tests/intakeHardening.test.js 2>&1 | tail -3
```
- Rollback expected: the revert commit line, then the CR/LF tests failing (`Received: 200`, expected `400`).

- [ ] **Step 1: Red — the CR/LF tests and the nodemailer pin.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
cat >> tests/intakeHardening.test.js <<'EOF'

// H-1 residue (E9): the intake routes opt out of the input sanitizer (H-1b), and
// firstName/lastName/businessName land in the mail Subject. Reject CR/LF there,
// and pin the nodemailer behaviour we currently rely on.
describe('E9: CR/LF cannot reach a mail header', () => {
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
    const res = await post(path, body);
    expect(res.status).toBe(400);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test('a bare newline is rejected too, not only CRLF', async () => {
    const res = await post('/api/partner-inquiry', { ...lead, firstName: 'Jane\nX' });
    expect(res.status).toBe(400);
  });

  test('legitimate names with spaces, hyphens and accents still pass', async () => {
    const res = await post('/api/partner-inquiry', { ...lead, firstName: 'José-María', lastName: 'de la Cruz' });
    expect(res.status).toBe(200);
  });

  // The pin: nodemailer folds CR/LF in unstructured headers. If an upgrade drops
  // that, the validator above is the only control left — fail loudly here.
  test('nodemailer still neutralises CR/LF in Subject', async () => {
    const nm = require('nodemailer');
    const t = nm.createTransport({ streamTransport: true, newline: 'unix', buffer: true });
    const info = await t.sendMail({ from: 'a@b.com', to: 'c@d.com', subject: `X ${inject}`, text: 'x' });
    const msg = info.message.toString();
    expect(msg).not.toMatch(/^Bcc:/mi);
    expect(msg.split('\n').filter((l) => /^Subject:/i.test(l))).toHaveLength(1);
  });
});
EOF
npm test -- tests/intakeHardening.test.js 2>&1 | tail -20
```
  - Expected: `Tests:       6 failed, … passed`. The six CR/LF cases fail with `Expected: 400  Received: 200`;
    the "legitimate names" and nodemailer-pin tests **pass** already.
  - If the nodemailer pin fails now, the severity assessment above is wrong — **STOP**, re-read
    `node_modules/nodemailer/lib/mime-node/index.js` `_encodeHeaderValue`, and re-rate the finding before fixing.

- [ ] **Step 2: Green — add the guard to the three fields in both routers.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
grep -n "isString().trim()" server/routes/partnerInquiryRoutes.js server/routes/affiliateApplicationRoutes.js
grep -n "body('businessName')" server/routes/partnerInquiryRoutes.js
npm test -- tests/intakeHardening.test.js 2>&1 | tail -6
```
  - Insert `.matches(/^[^\r\n]*$/)` into the `firstName` and `lastName` chains in **both** routers (after
    `.isString().trim()`, before `.isLength(...)`, sharing the existing `withMessage(coded(...))`), and into
    `businessName` in the partner router.
  - Expected after the edit: `Tests:       8 passed` for this describe block and the full file green.

- [ ] **Step 3: Full suite, lint, i18n parity, commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
npm test 2>&1 | tail -6
npm run check:i18n && npx eslint server/ tests/
git add -A && git commit -m "fix(intake): reject CR/LF in the fields that reach a mail Subject (H-1 residue)

H-1b made the four intake paths opt out of web-core's XSS input-stripper so lead
copy stops being truncated at the first '<'. The control moved to output escaping,
which covers the body but not the headers: firstName/lastName/businessName are
interpolated into the mail Subject, and isString().trim() lets an interior CRLF
through. email is safe (isEmail rejects it).

Not a live injection — nodemailer 8.0.11 folds CR/LF to a space in unstructured
headers, verified end-to-end. This is defence in depth plus a regression test that
fails if an upgrade ever stops doing that, since the validator would then be the
only control. No new error codes, so locale parity is unchanged.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git push
```
  - Expected: suite green, `check:i18n` reporting parity unchanged (119 × 4), eslint silent, push reporting `main -> main`.
  - A locale-parity failure means a coded error crept in — revert the code-adding part; see the design note.

---

### Task E10: [read-only + preservation] Prove what `crhs-transfer` uniquely holds, and reconcile it into `dc_private`

**Files:**
- creates `/var/www/wavemax/cutover-logs/crhs-transfer-mirror-<TS>.git` (a `--mirror` clone) and
  `/var/www/wavemax/cutover-logs/plan3-crhs-transfer.txt`;
- may add files under `/mnt/c/Users/rickh/GitHub/dc_private/` (a commit in **that** repo, not this one).

**Interfaces:**
- Consumes: ruling **E-R4**; `gh` auth; the `dc_private` working copy.
- Produces: `TRANSFER_MIRROR`, `TRANSFER_UNIQUE_N` — E11 refuses to run unless `TRANSFER_UNIQUE_N=0`.

**What is actually in there (measured 2026-09-20 via the GitHub API — the repo was not cloned).**
`rhoulihan/crhs-transfer`, **private**, created 2026-09-15, last push 2026-09-17, 67 KB, default branch `main`,
6 files:

| path | bytes | `dc_private` counterpart | status |
|:--|--:|:--|:--|
| `CRHS - Letter re Settlement Memorandum and Amicable Separation - DRAFT 2026-09-15.docx` | 38,839 | `docs/letters/…DRAFT 2026-09-15.docx` (39,404) | ⚠️ **differs by 565 bytes** |
| `CRHS-WaveMAX Settlement Memorandum V4 (CRHS revisions) 2026-09-15.docx` | 12,962 | `artifacts/settlement-2026-08/…V4…2026-09-15.docx` (12,962) | size matches |
| `email-to-miguel-2026-09-15.md` | 8,913 | `docs/memos/2026-09-15-email-to-miguel-FINAL-DRAFT.md` (8,913) | size matches, **name differs** |
| `termination-survival/2026-09-17-DRAFT-First-Amendment-to-Lease.md` | 10,255 | `docs/business-continuity/` same name (10,255) | size matches |
| `termination-survival/…PART1-legal-framework.md` | 12,460 | `docs/business-continuity/` same name (13,115) | ⚠️ **differs by 655 bytes** |
| `termination-survival/…PART2-the-model.md` | 11,726 | `docs/business-continuity/` same name (11,726) | size matches |
| `README.md` | 1,680 | — | ⛔ **exists nowhere else** |

So the brief's premise — "it holds nothing unique" — is **false as measured**: two files differ and the
`README.md` is unique. `dc_private` additionally holds `PART3-the-loan.md` and `PART4-the-law.md`, i.e. it is
otherwise the superset.

**The `README.md` is not boilerplate.** It records the handling rule ("Attorney-client privileged / work
product… delete the repo once the documents are sent"), the send checklist, and **three unresolved questions**:
the missing Meta Business Settings screenshot the letter says is enclosed; whether Miguel has answered the
**February 14, 2026 release** question; and **where the $50,000 sits**. Those are live counsel items. They must
land in `dc_private` — with a sourced timeline entry, per the standing rule that new evidence extends the
timeline in the same unit of work — before the repo is deleted.

**Rollback (exact).** Nothing destructive happens in this task. To undo:
```bash
EV=/var/www/wavemax/cutover-logs
rm -rf "$EV"/crhs-transfer-mirror-*.git "$EV/plan3-crhs-transfer.txt"
cd /mnt/c/Users/rickh/GitHub/dc_private && git status --short | head
```
- Rollback expected: the mirror gone, and any `dc_private` additions visible as unstaged/committed work to
  revert deliberately — **do not** revert a `dc_private` commit that carries the only copy of something.

- [ ] **Step 1: Mirror the repo before touching anything else.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
TS=$(date -u +%Y%m%dT%H%M%SZ)
git clone --mirror https://github.com/rhoulihan/crhs-transfer.git "$EV/crhs-transfer-mirror-$TS.git" 2>&1 | tail -2
rec TRANSFER_MIRROR "$EV/crhs-transfer-mirror-$TS.git"
git -C "$EV/crhs-transfer-mirror-$TS.git" log --oneline | wc -l
git -C "$EV/crhs-transfer-mirror-$TS.git" ls-tree -r --name-only HEAD | wc -l
chmod -R go-rwx "$EV/crhs-transfer-mirror-$TS.git"; ls -ld "$EV/crhs-transfer-mirror-$TS.git"
```
  - Expected: a clone summary, a non-zero commit count, `7` tracked paths (6 files + the `termination-survival`
    tree resolves to 3 blobs → the `ls-tree -r` count is **6**), and a directory mode with no group/other bits.
  - A failed clone — **STOP.** Nothing else in this task or E11 may run without a mirror in hand.
  - ⚠️ The mirror contains privileged material. It lives outside every git working tree we push, and it is
    never added to a repo. Record its path; the owner decides its long-term home.

- [ ] **Step 2: Hash every file against `dc_private` (ruling E-R4).**
```bash
EV=/var/www/wavemax/cutover-logs; set -a; . "$EV/plan3-record.env"; set +a
M=$TRANSFER_MIRROR; D=/mnt/c/Users/rickh/GitHub/dc_private
{ git -C "$M" ls-tree -r --name-only HEAD | while IFS= read -r p; do
    h=$(git -C "$M" show "HEAD:$p" | sha256sum | cut -d' ' -f1)
    printf 'REMOTE %s  %s\n' "$h" "$p"
  done
  for f in "docs/letters/CRHS - Letter re Settlement Memorandum and Amicable Separation - DRAFT 2026-09-15.docx" \
           "artifacts/settlement-2026-08/CRHS-WaveMAX Settlement Memorandum V4 (CRHS revisions) 2026-09-15.docx" \
           "docs/memos/2026-09-15-email-to-miguel-FINAL-DRAFT.md" \
           "docs/business-continuity/2026-09-17-DRAFT-First-Amendment-to-Lease.md" \
           "docs/business-continuity/2026-09-17-termination-survival-PART1-legal-framework.md" \
           "docs/business-continuity/2026-09-17-termination-survival-PART2-the-model.md"; do
    printf 'LOCAL  %s  %s\n' "$(sha256sum "$D/$f" | cut -d' ' -f1)" "$f"
  done; } | tee "$EV/plan3-crhs-transfer.txt"
awk '{print $2}' "$EV/plan3-crhs-transfer.txt" | sort | uniq -c | awk '$1==1' | wc -l
```
  - Expected: the listing, then a count of **unmatched hashes**. From the size evidence, expect **3** unmatched
    remote blobs: the cover letter, `PART1`, and `README.md` (which has no local counterpart at all).
  - Record `TRANSFER_UNIQUE_N` as that count. **E11 will not run while it is non-zero.**

- [ ] **Step 3: Reconcile each unmatched file. One decision per file, recorded.**
```bash
EV=/var/www/wavemax/cutover-logs; set -a; . "$EV/plan3-record.env"; set +a
M=$TRANSFER_MIRROR; D=/mnt/c/Users/rickh/GitHub/dc_private
mkdir -p /tmp/crhs-transfer-cmp && chmod 700 /tmp/crhs-transfer-cmp
git -C "$M" show "HEAD:README.md" > /tmp/crhs-transfer-cmp/README.md
git -C "$M" show "HEAD:termination-survival/2026-09-17-termination-survival-PART1-legal-framework.md" > /tmp/crhs-transfer-cmp/PART1.md
diff -u "$D/docs/business-continuity/2026-09-17-termination-survival-PART1-legal-framework.md" /tmp/crhs-transfer-cmp/PART1.md | head -40
git -C "$M" show "HEAD:CRHS - Letter re Settlement Memorandum and Amicable Separation - DRAFT 2026-09-15.docx" > /tmp/crhs-transfer-cmp/letter.docx
for z in /tmp/crhs-transfer-cmp/letter.docx "$D/docs/letters/CRHS - Letter re Settlement Memorandum and Amicable Separation - DRAFT 2026-09-15.docx"; do
  printf '%s  ' "$z"; unzip -p "$z" word/document.xml | sha256sum | cut -d' ' -f1
done
```
  - Expected: a readable diff for `PART1` (655 bytes of difference — most likely the local copy is the later
    revision), and two `word/document.xml` hashes for the `.docx`. **Equal `document.xml` hashes mean the
    prose is identical** and the 565-byte delta is zip metadata — record that and treat the file as matched.
  - Decide per file, and record the decision in `plan3-record.env`:
    - local copy is newer / a superset → the remote blob is superseded; record **why**, no copy needed;
    - remote copy has content the local one lacks → copy it into `dc_private` under a dated name that does not
      overwrite the existing file, and commit **in `dc_private`** with the timeline entry.
  - `README.md` is unique by construction: fold its three open questions (the Meta screenshot, the
    February 14 2026 release question, where the $50,000 sits) into `dc_private` as a memo or timeline entry
    and record the commit SHA as `TRANSFER_README_LANDED`.
  - Delete the comparison copies when done: `rm -rf /tmp/crhs-transfer-cmp`.

- [ ] **Step 4: Re-assert uniqueness is zero.**
```bash
EV=/var/www/wavemax/cutover-logs; set -a; . "$EV/plan3-record.env"; set +a
echo "TRANSFER_UNIQUE_N=$TRANSFER_UNIQUE_N  TRANSFER_README_LANDED=${TRANSFER_README_LANDED:-MISSING}"
test -d "$TRANSFER_MIRROR" && echo MIRROR_PRESENT
cd /mnt/c/Users/rickh/GitHub/dc_private && git log --oneline -3
```
  - Expected: every unmatched file either resolved with a recorded rationale or copied,
    `TRANSFER_README_LANDED=<sha>`, `MIRROR_PRESENT`, and the `dc_private` log showing the reconciliation commit.
  - `TRANSFER_README_LANDED=MISSING` — **E11 must not run.**

---

### Task E11: **HUMAN-CONFIRM, IRREVERSIBLE** — delete the `crhs-transfer` GitHub repository

**Files:** none locally. Permanently deletes `github.com/rhoulihan/crhs-transfer`.

**Interfaces:**
- Consumes: E10's `TRANSFER_MIRROR` (must exist on disk), `TRANSFER_UNIQUE_N=0`, `TRANSFER_README_LANDED=<sha>`.
- Produces: `TRANSFER_DELETED=<timestamp>`; the closure of brief item 25.

**Rollback (exact).** **There is none.** GitHub repository deletion is permanent; the name may be re-created but
the repo, its history and its settings are gone. The only recovery is E10's mirror:
```bash
EV=/var/www/wavemax/cutover-logs; set -a; . "$EV/plan3-record.env"; set +a
gh repo create rhoulihan/crhs-transfer --private --description "restored from mirror"
git -C "$TRANSFER_MIRROR" push --mirror https://github.com/rhoulihan/crhs-transfer.git
gh api repos/rhoulihan/crhs-transfer/git/trees/main?recursive=1 --jq '.tree[].path'
```
- Recovery expected: the six paths listed again. **This restores content, not the original repo object** — the
  creation date, any collaborator grants and any issue history do not come back.

- [ ] **Step 1: Assert the preconditions mechanically before speaking to the owner.**
```bash
EV=/var/www/wavemax/cutover-logs; set -a; . "$EV/plan3-record.env"; set +a
test -d "$TRANSFER_MIRROR" && echo MIRROR_OK || echo MIRROR_MISSING
test "${TRANSFER_UNIQUE_N:-1}" = 0 && echo UNIQUE_ZERO || echo UNIQUE_NONZERO
test -n "${TRANSFER_README_LANDED:-}" && echo README_LANDED || echo README_NOT_LANDED
grep -rn "crhs-transfer" /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program /mnt/c/Users/rickh/GitHub/crhs-corporate /mnt/c/Users/rickh/GitHub/crhs-web-core /mnt/c/Users/rickh/GitHub/dc_private 2>/dev/null | grep -vE "/(node_modules|\.git)/" | grep -v "plan3-sliceE-findings.md" | grep -v "separation-plan3-scope-brief.md" | wc -l
gh api repos/rhoulihan/crhs-transfer --jq '[.name,(.private|tostring),.pushed_at,(.forks_count|tostring),(.open_issues_count|tostring)]|join(" ")'
```
  - Expected, six lines: `MIRROR_OK`, `UNIQUE_ZERO`, `README_LANDED`, `0`,
    `crhs-transfer true 2026-09-17T13:44:51Z 0 0`.
  - The `0` on the fourth line is the "nothing references it" proof: the only mentions anywhere are this draft
    and the scope brief, both excluded.
  - Any `MISSING` / `NONZERO` / `NOT_LANDED`, a non-zero reference count, or a `forks_count` above 0 —
    **STOP.** Do not ask the owner to approve a deletion whose preconditions are not met.

- [ ] **Step 2 (HUMAN-CONFIRM): Ask Rick. Say exactly this:**

  > `crhs-transfer` — the private repo you used to hand the settlement memorandum and the cover letter to
  > Miguel. Its own README says to delete it once the documents were sent. Before I do, three things you
  > should know, because **deleting a GitHub repo cannot be undone**:
  >
  > 1. It is **not** a clean duplicate of the case file. Two of the five documents differ from the `dc_private`
  >    copies — the cover letter by 565 bytes and `termination-survival PART1` by 655 — and the README exists
  >    nowhere else. I have reconciled all three into `dc_private` (commit `<sha>`), including the README's
  >    three open items: the Meta Business Settings screenshot the letter says is enclosed, the February 14
  >    2026 release question for Miguel, and where the $50,000 sits.
  > 2. I have taken a **full mirror clone** — history included — to `<mirror path>`, outside every repo we
  >    push. That is the only recovery path afterwards, and it restores the *content*, not the repo object.
  > 3. The contents are **attorney-client privileged settlement drafts in an active dispute**. Destroying a
  >    copy of privileged work product during live litigation is the kind of thing opposing counsel asks
  >    about. The mirror is why I am comfortable; you may still want to mention it to Miguel first.
  >
  > Nothing anywhere references the repo — I checked all four working trees. Confirm and I will delete
  > `rhoulihan/crhs-transfer` permanently. Say **"delete crhs-transfer"** and I will proceed; anything else
  > and I leave it alone.

  Proceed only on that exact phrase. Anything short of it — including "yeah go ahead" — is a **no** for an
  irreversible action on privileged material; ask again.

- [ ] **Step 3: Delete, then prove it is gone.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env
gh repo delete rhoulihan/crhs-transfer --yes
gh api repos/rhoulihan/crhs-transfer 2>&1 | head -2
printf 'TRANSFER_DELETED=%s\n' "$(date -u +%Y%m%dT%H%M%SZ)" >> "$REC"
gh repo list rhoulihan --limit 100 --json name --jq '.[].name' | grep -c '^crhs-transfer$'
```
  - Expected: the delete succeeding with no error, then `gh api` returning a **404 / `Not Found`**, then `0`
    from the listing.
  - `gh repo delete` refusing with a scope error means the token lacks `delete_repo` — do **not** work around
    it by other means; tell the owner and let them delete it in the GitHub UI, then run the two verifications.

---

### Task E12: **HUMAN-CONFIRM, HUMAN-EXECUTED** — the password-reset round trip (brief item 26)

**Files:** none. Produces a signed record in `/var/www/wavemax/cutover-logs/plan3-record.env`.

**Interfaces:**
- Consumes: **E2 deployed** and **E3 complete on both boxes**; `passwordResetService` TTL and rate limits
  (measured: token TTL **1 hour**, SHA-256-hashed at rest; `passwordResetLimiter` = **3 requests per hour**
  in production).
- Produces: `PWRESET_AFFILIATE=PASS|FAIL`, `PWRESET_ADMIN=PASS|FAIL`, `PWRESET_RUN_BY`, `PWRESET_AT`.
- **Gates:** group A's `rundberglaundry.com` flip (pass 1, before) and the post-flip acceptance (pass 2, after).

**Why a human, and why twice.** The flow crosses four systems no automated harness spans end to end: the app
(token mint), Mailcow (delivery through the `no-reply@crhsent.com` login), a real mail client (link click),
and the SPA (`?route=/reset-password&token=…&type=…` parsed client-side in `reset-password-init.js:39`). It must
run **once before** the `rundberglaundry.com` flip — proving E2/E3 did not break a working flow — and **once
after**, proving the flip did not break it. A single run proves half of what is needed.

**Before you start, know these three things:**
- **3 attempts per hour, per IP.** A fourth returns `429` with "Too many password reset attempts". If you
  fumble, you wait an hour — there is no admin reset for this bucket (the admin "reset rate limits" control is
  a verified double no-op; that is group C's D-2 work, not this).
- **The token lives 1 hour** and is single-use. Requesting a second reset invalidates the first link.
- **Operators cannot be tested.** They authenticate by PIN; `resetPassword` rejects `userType=operator` by
  design. Coverage is **affiliate** and **administrator**.

**Rollback (exact).** A password *was* changed, so the rollback is a second reset back:
```
Run the same checklist again, setting the password back to the previous value.
If you are locked out by the 3/hour limiter, wait for the hour, or have the other
administrator reset it from the admin panel (Administrators → Reset password).
```
- Rollback expected: login succeeds with the original password.
- ⚠️ Use a **test affiliate** for pass 1 if one exists. Using the real administrator account risks locking the
  only super-admin out of the panel for an hour if the mail does not arrive.

- [ ] **Step 1 (HUMAN-CONFIRM): Ask Rick, and agree which accounts.** Say exactly this:

  > I need you to run the password-reset round trip by hand — it can't be automated, because it crosses the
  > app, Mailcow, your mail client and the SPA. Two passes: **now**, to prove the `FRONTEND_URL` → `BASE_URL`
  > change works, and **again right after** we flip `rundberglaundry.com`, because that flip is exactly what
  > would have broken it before.
  >
  > Three things to know before we start: you get **3 attempts per hour** (a fourth returns 429 and there is
  > no way to clear the bucket), the emailed token is **good for one hour and single-use**, and **operators
  > can't be tested** — they're PIN-based, so it's affiliate plus administrator.
  >
  > Which accounts do you want to use? A test affiliate would be ideal for the first one. For the
  > administrator pass, I'd rather not use your only super-admin account unless you're comfortable — if the
  > mail doesn't arrive you're locked out of the panel for an hour. Ready?

  Record `PWRESET_ACCOUNTS=<affiliate email> <administrator email>` and `PWRESET_RUN_BY`.

- [ ] **Step 2 (human): Request the reset — affiliate.**
  1. Open `https://portal.atxwashdryfold.com/embed-app-v2.html?route=/affiliate-login` in a normal browser window.
  2. Click **"Forgot password?"** (`affiliate-login-embed.html:57`).
  - Expected: the forgot-password form renders, with a language switcher and an email field. **Not** a blank
    panel and **no** console error — if the panel is blank, the page script did not load; stop and record it.
  3. Enter the affiliate email. Submit.
  - Expected: a success message that does **not** reveal whether the address exists (the endpoint is
    deliberately non-enumerating). An immediate `429` means the hour's 3 attempts are already spent.

- [ ] **Step 3 (human): The email.**
  - Expected, within about a minute, in that affiliate's mailbox:
    - **From** `no-reply@crhsent.com`, display name **WaveMAX Austin** — *not* `no-reply@wavemax.promo` and
      *not* "Rundberg Laundry". A wrong sender is the 2026-08-23 outage shape: stop and record it.
    - a reset link beginning **exactly** `https://portal.atxwashdryfold.com/embed-app-v2.html?route=/reset-password&token=`
      followed by 64 hex characters and `&type=affiliate`.
  - ⛔ **The two failures this task exists to catch:**
    - the link starts `https://rundberglaundry.com/…` → **E2 is not deployed on the box that served the
      request**. Stop; do not flip that host.
    - the link starts `undefined/…` → **E3 deleted `FRONTEND_URL` without E2 deployed**. Stop and run E3's
      rollback on both boxes.
  - Nothing arrives within 5 minutes: check the same box's `logs/combined.log` for a send failure, and the mail
    host's postfix log for that recipient. Record the outcome either way — a silent non-delivery is a finding.

- [ ] **Step 4 (human): Click the link and set a new password.**
  1. Click the link (or paste it — note which; a mail client that rewrites links is itself a finding).
  - Expected: the reset form renders with both password fields and a visible strength/requirements hint.
    "Missing token or userType parameters" in the console means the query string did not survive the click.
  2. Enter a new password twice. Submit.
  - Expected: a success message and a redirect or prompt to log in. A validation error must name the rule it
    failed, not a generic "Validation failed".
  3. Click the same link again.
  - Expected: it is **rejected** — the token is single-use. A second acceptance is a security finding: stop and
    record it.

- [ ] **Step 5 (human): Prove the new password works and the old one does not.**
  1. Log in at `?route=/affiliate-login` with the **new** password. Expected: the affiliate dashboard loads.
  2. Log out. Attempt the **old** password. Expected: rejected.
  - Both must hold. Record `PWRESET_AFFILIATE=PASS` only when they do.

- [ ] **Step 6 (human): Repeat Steps 2–5 for the administrator** at
  `?route=/administrator-login`, whose "Forgot your password?" link is `administrator-login-embed.html:69`.
  - Expected: identical behaviour, with `&type=administrator` in the link. Administrators hash via the model's
    bcrypt hook rather than PBKDF2 — a difference that has broken this path before, which is why both are tested.
  - Record `PWRESET_ADMIN=PASS|FAIL`.

- [ ] **Step 7: Record the run.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env
{ printf 'PWRESET_AFFILIATE=%s\n' "$PWRESET_AFFILIATE"
  printf 'PWRESET_ADMIN=%s\n' "$PWRESET_ADMIN"
  printf 'PWRESET_RUN_BY=%q\n' "$PWRESET_RUN_BY"
  printf 'PWRESET_AT=%s\n' "$(date -u +%Y%m%dT%H%M%SZ)"
  printf 'PWRESET_PASS_NUMBER=%s\n' "${PWRESET_PASS_NUMBER:-1}"; } >> "$REC"
grep -E '^PWRESET_' "$REC"
```
  - Expected: five `PWRESET_*` lines, both results `PASS`, `PWRESET_PASS_NUMBER=1`.
  - Pass 2 after the `rundberglaundry.com` flip re-runs Steps 2–7 with `PWRESET_PASS_NUMBER=2`. **Both passes
    are required** for exit.

---

### Task E13: `tasks/todo.md` reaches zero open D-items, and a command keeps it there (exit criterion 3, part 1)

**Files:** `tasks/todo.md`; new `scripts/check-backlog-empty.sh`; `package.json` (a `check:backlog` script).

**Interfaces:**
- Consumes: every other Plan 3 group's completion — this task **closes the record**, it does not do the work.
  D-2 → group C item 13; D-4 → group C item 14; B-4 → group B item 10 + E15; B-5 → group D.
- Produces: `BACKLOG_OPEN_N=0`; ruling **E-R5**'s re-runnable gate.

**Measured starting state (2026-09-19 file, 2026-09-20 count).** 60 open checkboxes in the file; the ones this
criterion is about:

| section | open | closed by |
|:--|--:|:--|
| `### D-1` | 0 | already closed — Phase 0a, web-core v0.2.1 `768bfdb` |
| `### D-2. Affiliate PR B7 (rate-limit adoption)` | **6** | group C item 13 |
| `### D-3` | 0 | already closed — web-core `d2725e7`, affiliate `a37dc497` |
| `### D-4. Affiliate ESLint cleanup` | **1** | group C item 14 (all 208 errors) |
| `### B-4. Brand literals outside src/` | **5** | group B item 10 (bridge deletion) + E15 (legal/LICENSE escalation) + the `wavemax-language` rename with migration shim (owner decision 1) |
| `### B-5. web-core next release` | **6** | group D items 16–19 |
| `### Owner decisions 2026-09-14 — franchisor IP exposure` | **3** | see Step 2 — two are minor follow-ups, one is an owner decision about public git history |
| `### Owner decision 2026-09-13 — marketing hero photo (COUNSEL HOLD)` | **1** | E15 — escalated, never "done" |
| **DEFERRED WORK total** | **7** | |
| **Backlog total** | **15** | |

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git revert --no-edit <E13-sha> && bash scripts/check-backlog-empty.sh; echo "exit=$?"
```
- Rollback expected: the revert line, then the script reporting the pre-E13 counts and `exit=1`.

- [ ] **Step 1: Write the gate script first, and watch it fail on today's file.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
cat > scripts/check-backlog-empty.sh <<'EOF'
#!/usr/bin/env bash
# Plan 3 exit criterion 3: tasks/todo.md carries no open D- or B- item.
# An item is open when its line matches "- [ ]" inside a "### D-<n>." or
# "### B-<n>." section, or inside an "### Owner decision" section.
set -uo pipefail
F=${1:-tasks/todo.md}
test -f "$F" || { echo "MISSING $F"; exit 2; }
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
  - Expected today: `OPEN_DB_ITEMS 22` (7 in DEFERRED WORK + 15 in Backlog), the 22 lines listed, `exit=1`.
  - `OPEN_DB_ITEMS 0` today would mean the awk scoping is wrong — **STOP** and fix the script, or the gate is
    worthless.

- [ ] **Step 2: Close each item, with its closer named (ruling E-R6).** For every one of the 22:
  - the work shipped → `- [x]` plus `— <Plan 3 task id>, <commit sha>, <date>`;
  - consciously dropped → `- [x]` plus `— CLOSED, not doing: <reason>, owner agreed <date>`;
  - escalated → `- [x]` plus `— ESCALATED to <owner|counsel> <date>, see docs/superpowers/ESCALATIONS.md#<anchor>`.
  - ⚠️ The DEFERRED WORK section's own words are binding: *"Nothing below may be closed without shipping it or
    getting Rick's explicit agreement to drop it."* A `- [x]` with no commit and no recorded agreement is a
    **violation of that promise**, not a tidy-up. The three `Owner decisions 2026-09-14` items are the ones to
    watch: **public git history still holds 451 franchisor photos** — that is an owner decision (a destructive
    rewrite of a public repo), so it is *escalated*, never marked done.

- [ ] **Step 3: Green the gate, wire it into `package.json`, commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
node -e "const f='package.json';const j=require('./'+f);j.scripts['check:backlog']='bash scripts/check-backlog-empty.sh';j.scripts=Object.fromEntries(Object.entries(j.scripts).sort());require('fs').writeFileSync(f,JSON.stringify(j,null,2)+'\n')"
npm run check:backlog; echo "exit=$?"
grep -c '^\s*- \[ \]' tasks/todo.md
git add -A && git commit -m "chore(todo): zero open D- and B- items, each closed with its closer named (Plan 3 exit 3)

Adds scripts/check-backlog-empty.sh + npm run check:backlog so 'the backlog is
empty' stays a command, not a claim.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git push
```
  - Expected: `OPEN_DB_ITEMS 0`, `exit=0`, then the remaining `- [ ]` count in the file (the historical
    Tier/Plan-1 sections keep theirs — the gate is scoped to `D-`/`B-`/`Owner decision` sections by design).
  - Record `BACKLOG_OPEN_N=0`.

---

### Task E14: Every `backlog_*.md` memory becomes a closed record or is deleted (exit criterion 3, part 2)

**Files:** in `/home/rickh/.claude/projects/-mnt-c-Users-rickh-GitHub-wavemax-affiliate-program/memory/`:
`backlog_register_now_interest_form.md`, `backlog_interest_form_i18n.md`, `backlog_marquee_sidebar_b3.md`,
`backlog_webcore_brand_literals_b4.md`, `backlog_webcore_next_release_b5.md`, and `MEMORY.md` (the index).

**Interfaces:**
- Consumes: E13's closures; group B item 12 (B-2); group B item 10 (B-4's bridge half); group D (B-5);
  E15 (the escalated half of B-4). Ruling **E-R6**.
- Produces: zero memory files whose name starts `backlog_`, and a `MEMORY.md` index with no `⏸ DEFERRED` line.

**The five files, and what closes each.** All five were read on 2026-09-20; none is a stub.

| file | today | closes when | disposition |
|:--|:--|:--|:--|
| `backlog_register_now_interest_form.md` | **already done** — affiliate `6acbf550`, deployed 2026-09-11, config-driven `INTEREST_FORM_URL`. But the filename still says `backlog_` and `MEMORY.md` indexes it as `⏸ DEFERRED`, which is now **false** | now | **rename** → `closed_register_now_interest_form.md`; fix the index line |
| `backlog_interest_form_i18n.md` (B-2) | open; `public/affiliate.html` has **zero** `data-i18n`; the page loads no `i18n.js` and no switcher — *the layer is the work* | group B item 12 ships the i18n layer in **corporate**, with the page move | **rewrite closed** → `closed_interest_form_i18n.md`, naming the corporate commit and the final locale-leaf count |
| `backlog_marquee_sidebar_b3.md` (B-3) | planned as Plan 2 Task 62; corporate `c636bf5` ("Merge B-3 into main (PR #5): marquee rail…") is **live DARK on :3001** on both boxes | the first nginx flip makes it **public** | **rewrite closed** → `closed_marquee_sidebar_b3.md`; the closer is the flip, not the merge. ⚠️ Verify the seven `partner.*` strings and the `--ap-plate-b` contrast choice actually shipped before closing |
| `backlog_webcore_brand_literals_b4.md` (B-4) | five open threads: bridge assets (19 literals), legal pages (38), `LICENSE` (2), the `wavemax-language` storage key, a header comment | bridge → group B item 10 **deletes** them; legal + `LICENSE` → **E15 escalation**; storage key → owner decision 1 (rename **with a migration shim**); comment → group D | **rewrite closed** → `closed_webcore_brand_literals_b4.md`, with the escalated items pointing at `ESCALATIONS.md` |
| `backlog_webcore_next_release_b5.md` (B-5) | six items, one of them **live on the portal** (`injectNonce` duplicate `content` attribute → every client nonce read returns `''`) | group D items 16–19 ship in a web-core release; the cron-output redirect rides along | **rewrite closed** → `closed_webcore_next_release_b5.md`, naming the version tag |

**Preserve the traps, not just the outcome.** Three things in these files are lessons that outlive the item and
must survive into the closed record (or into `lessons.md`):
- **`injectNonce`**: any page moved into a nonce-injecting app must carry `content="{{CSP_NONCE}}"`, and you must
  check the **served** HTML, not the file on disk;
- **web-core's logger has no `splat()`** — put details inside the message string, and `process.exit()` right
  after `logger.error` loses the line;
- **renaming `wavemax-language` without a read-old-key-once shim resets every visitor's language.**

**Rollback (exact).** Memory files are not in git. Snapshot before editing:
```bash
M=/home/rickh/.claude/projects/-mnt-c-Users-rickh-GitHub-wavemax-affiliate-program/memory
tar -C "$M" -czf ~/memory-backlog-$(date -u +%Y%m%dT%H%M%SZ).tgz backlog_interest_form_i18n.md backlog_marquee_sidebar_b3.md backlog_register_now_interest_form.md backlog_webcore_brand_literals_b4.md backlog_webcore_next_release_b5.md MEMORY.md
# to restore:
tar -C "$M" -xzf ~/memory-backlog-<TS>.tgz && ls "$M"/backlog_*.md | wc -l
```
- Rollback expected: `5`.

- [ ] **Step 1: Snapshot, then assert the starting state.**
```bash
M=/home/rickh/.claude/projects/-mnt-c-Users-rickh-GitHub-wavemax-affiliate-program/memory
TS=$(date -u +%Y%m%dT%H%M%SZ)
tar -C "$M" -czf ~/memory-backlog-$TS.tgz $(cd "$M" && ls backlog_*.md) MEMORY.md && echo "SNAPSHOT ~/memory-backlog-$TS.tgz"
ls -1 "$M"/backlog_*.md | wc -l
grep -c '⏸' "$M/MEMORY.md"
```
  - Expected: the snapshot line, `5`, and a non-zero `⏸` count (measured: the index carries `⏸ DEFERRED` /
    `⏸` markers for B-1 … B-5).

- [ ] **Step 2: Close each file in its dependency order.** For each, the rewritten file must state: **what it
  was**, **what closed it (task id + commit/tag + date)**, **what was escalated and to whom**, and **any trap
  worth keeping**. Then rename `backlog_*` → `closed_*` (a filename that still says "backlog" is a false signal
  to the next session).
  - Order: `register_now` (now) → `b5` (after group D) → `b4` (after group B item 10 and E15) →
    `b2` (after group B item 12) → `b3` (after the first flip).
  - A file with nothing left worth keeping may be **deleted** instead — but only if its lesson already lives in
    `tasks/lessons.md`. Check before deleting; ruling E-R6.

- [ ] **Step 3: Update the `MEMORY.md` index and prove the criterion.**
```bash
M=/home/rickh/.claude/projects/-mnt-c-Users-rickh-GitHub-wavemax-affiliate-program/memory
ls -1 "$M"/backlog_*.md 2>/dev/null | wc -l
ls -1 "$M"/closed_*.md 2>/dev/null | wc -l
grep -c 'backlog_' "$M/MEMORY.md"
grep -n '⏸' "$M/MEMORY.md" | head
```
  - Expected: `0` backlog files, `5` closed files (fewer if any were deleted — record which and why), `0`
    `backlog_` references in the index, and no `⏸` line left for B-1…B-5.
  - Every index entry must now read as a closed record, with its closer, or as an escalation pointing at
    `ESCALATIONS.md`.

---

### Task E15: `docs/superpowers/ESCALATIONS.md` — the single list of everything handed to the owner or counsel (exit criterion 7)

**Files:** new `docs/superpowers/ESCALATIONS.md` in the affiliate repo; a link to it from `tasks/todo.md` and
from `docs/superpowers/specs/2026-09-20-separation-plan3-scope-brief.md`'s exit-criteria section.

**Interfaces:**
- Consumes: E1 (the `DEFAULT_ADMIN_EMAIL` decision), E4 (the DocuSign key revocation question), E8 (an ofelia
  leak that a cap raise does not close), E10/E11 (the privileged-material preservation question), E13/E14 (the
  items closed *as escalations*), owner decision 1 (legal pages + `LICENSE` are "flagged as a list, not edited").
- Produces: the artefact exit criterion 7 asks for — **"the backlog is clear because items were closed or
  escalated, never because they were forgotten."**

**Rule for this file: it is a register, not a parking lot.** Every row carries an **owner**, a **date raised**,
what is **blocked** by it (usually nothing), and the **decision needed** — phrased so the owner can answer it
without re-reading a plan. A row with no named owner is not an escalation; it is a forgotten item wearing a
label. Nothing is added here to avoid doing it: a row is either genuinely outside our authority (legal text,
irreversible destruction, a franchisor-IP judgement) or a decision only the owner holds the facts for.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git revert --no-edit <E15-sha>
test -f docs/superpowers/ESCALATIONS.md && echo STILL_PRESENT || echo REMOVED
```
- Rollback expected: the revert line, then `REMOVED`.

- [ ] **Step 1: Write the register with these eleven rows.** Each was verified during this slice; the first six
  are the ones the brief's decision 1 and exit criterion 7 name directly.

| # | item | owner | raised | decision needed | blocks |
|:--|:--|:--|:--|:--|:--|
| 1 | **web-core `LICENSE`** — 2 brand literals: "WaveMAX Laundry" in the marks clause and the notice address | Rick / counsel | 2026-09-13 (B-4) | replacement wording | nothing |
| 2 | **web-core legal pages** — `assets/legal/privacy-policy.html` (17 literals), `refund-policy.html` (10), `terms-and-conditions.html` (11), plus a `rundberglaundry.com` canonical | Rick / counsel | 2026-09-13 (B-4) | approve revised text; never auto-edited | nothing |
| 3 | **Affiliate `public/privacy-policy.html:88`** still names **DocuSign** as a service provider that receives customer data. DocuSign was removed from the code; E4 deletes its credentials. A live privacy policy naming a processor we do not use is a factual misstatement | Rick / counsel | **2026-09-20 (this slice)** | approve the corrected service-provider list | nothing |
| 4 | **Marketing hero photo** `public/assets/images/locations/austin-tx/hero-1.webp` — storefront photo showing the franchisor's swirl logo and "WaveMAX LAUNDRY" sign, LIVE on the marketing domains (hero `<img>`, `og:image`, `twitter:image`, JSON-LD) and copied into the content app. Relevant to the 2026-08-26 DMCA + trademark complaints. Rick: "Keep it — hold for counsel" | counsel (Miguel) | 2026-09-13 | keep / replace | ⚠️ the flip makes it public **from the content app** |
| 5 | **Public git history** still holds 451 franchisor location photos (~448 MiB) and the swirl OG card. Removing them means rewriting history on a **public** repo — destructive, breaks every existing clone | Rick | 2026-09-14 | rewrite, or accept and record | nothing |
| 6 | **`wavemax-language` localStorage key** — settled 2026-09-20: rename **with** a read-old-key-once migration shim. Listed here only so the register is the complete picture; the work is in-plan | Rick (settled) | 2026-09-13 | — settled | nothing |
| 7 | **`DEFAULT_ADMIN_EMAIL=admin@wavemax.promo`** grants super-admin by email equality (`systemHealthService.js:52`) and is the alert-mail fallback (`ops.js:13`). It aliases to `admin@rundberglaundry.com`, an active but unread mailbox — alerts are delivered and ignored. Changing it may remove the owner's own super-admin rights | Rick | **2026-09-20 (this slice)** | change to `admin@crhsent.com` after E4 Step 2 confirms the administrator row, or keep | nothing |
| 8 | **DocuSign credential revocation** — E4 removes a 27-line RSA private key plus 9 DocuSign keys and 4 OAuth client secrets from both production `.env` files. If those third-party accounts still exist, the credentials should be revoked at the provider | Rick | **2026-09-20 (this slice)** | revoke at DocuSign / Google / Meta, or confirm the accounts are gone | nothing |
| 9 | **`ofelia` memory leak** — E8 raises the cap from 256 to 512 MiB, which doubles the interval between OOM kills but does **not** fix the leak. The real fix is pinning and upgrading off `mcuadros/ofelia:latest` | Rick | **2026-09-20 (this slice)** | accept the cap raise as the answer, or schedule the image pin | nothing |
| 10 | **`crhs-transfer` preservation** — the repo held privileged settlement drafts in an active dispute; E10 mirrored it and E11 deleted it. The mirror's long-term home, and whether to tell Miguel, are the owner's | Rick / counsel | **2026-09-20 (this slice)** | where the mirror lives; disclose or not | E11 |
| 11 | **Legacy `/austin-tx/` inbound links and printed-flyer QR codes** pointing at retired paths (`/wavemax-affiliate` is a deliberate 410) | Rick | 2026-09-14 | accept the 410s, or add redirects | nothing |

- [ ] **Step 2: Cross-link it so it cannot be lost, and prove every row has an owner.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
awk -F'|' '/^\| [0-9]+ \|/ {print NF, $4}' docs/superpowers/ESCALATIONS.md | sort | uniq -c
grep -c '^| [0-9]' docs/superpowers/ESCALATIONS.md
grep -n 'ESCALATIONS.md' tasks/todo.md docs/superpowers/specs/2026-09-20-separation-plan3-scope-brief.md
```
  - Expected: every row's owner column non-empty, `11` rows, and at least one link from each of the two documents.
  - A row with an empty owner — **STOP.** Per this task's rule, that is not an escalation.

- [ ] **Step 3: Commit, and hand the list to the owner as a message, not a file path.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git add -A && git commit -m "docs(escalations): the single register of everything handed to owner or counsel (Plan 3 exit 7)

Eleven rows, each with an owner, a date, the decision needed and what it blocks.
Five carried over from the Plan 1/2 backlog (LICENSE, web-core legal pages, the
hero photo counsel hold, the public git history, the language storage key) and
six raised while drafting Plan 3 slice E (the DocuSign line in the affiliate
privacy policy, DEFAULT_ADMIN_EMAIL's super-admin coupling, third-party credential
revocation, the ofelia leak behind the cap raise, the crhs-transfer mirror, and
the legacy inbound links).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git push
```
  - Expected: push reporting `main -> main`.
  - Then send the owner the **eleven questions**, each in one sentence, in one message — the register's purpose
    is that the owner can answer without opening anything. A commit is not a hand-off.

---

## 3. Dependency order

```
E1 ─┬─> E2 ──> E3 ──┬──> E4 ──> (E13/E14/E15 closure)
    │               └──> [group A: rundberglaundry.com flip]  (E-R1)
    │                        └──> E12 pass 2
    └─> (E3 also gates E12 pass 1)

E5 ──> E6                     (independent of everything else)
E7 ──> E8                     (mail host only; independent)
E9                            (crhs-corporate only; independent)
E10 ──> E11                   (irreversible; E11 refuses unless E10 is clean)

E13 <── group C items 13,14      E14 <── group B items 10,12 + group D + E15
E15 <── E1, E4, E8, E10/E11      (and feeds E13's "ESCALATED" closures)
```

**The one cross-slice dependency the controller must not drop:** *group A's `rundberglaundry.com` flip is
blocked on E2 + E3, and followed immediately by E12 pass 2.* Everything else in this slice is parallel-safe.

---

## 4. Underspecified — needs a controller or owner decision before execution

1. **E4 is a scope expansion.** The brief scoped item 21 at three keys; **26** have no runtime consumer. Take
   it, or record an owner decision to keep the 24 that E3 does not cover (including a plaintext RSA private
   key) and drop exit criterion 5's `.env` clause to "the three named keys". Recommendation: take it — the
   private key alone justifies it.
2. **`BACKEND_URL`: correct or delete?** Nothing consumes it. The caller's instruction says correct it; exit
   criterion 5 argues for deleting it. E3 Step 1 asks the owner; default is "correct".
3. **`DEFAULT_ADMIN_EMAIL` cannot be decided without reading the administrator collection.** E4 Step 2 reads it.
   If the only super-admin's email *is* the wavemax.promo address, the change de-privileges the owner and must
   be paired with an account-email update — which is a different task than a `.env` edit.
4. **E9's error-code shape.** Reusing the existing `firstNameLength`/`lastNameLength` codes keeps locale parity
   at 119 × 4 and needs no copy sign-off. A distinct CR/LF code means a tenth intake code, 4 new leaves and a
   moved `EXPECTED_PARTNER_LEAVES` assertion. Recommendation: reuse.
5. **E12 needs accounts.** Which affiliate (ideally a test account) and which administrator. If the owner's is
   the only super-admin, the 3/hour limiter makes a failed round trip an hour-long lockout. Decide before starting.
6. **E8 option B is unscoped.** If 512 MiB does not hold, pinning `mcuadros/ofelia:latest` needs an upstream
   version check and a look at whether mailcow's own updater fights the pin. Out of this slice; register row 9.
7. **E10 Step 3's `.docx` reconciliation may need the `docx-template-editor` skill** if the two cover-letter
   versions differ in prose rather than zip metadata. The `word/document.xml` hash comparison decides which.
8. **The mirror's long-term home is not decided.** `/var/www/wavemax/cutover-logs/` is a working directory, not
   an archive, and it holds privileged material. Register row 10.
9. **Brief item 20 (CF failover gap) is assigned to group A** ("same file and reload as the flips — fold in"),
   not to this slice. Confirm the controller has it; it is the one group-E finding not covered here.
10. **Corporate `.env` may carry the same dead keys.** Plan 2 Task 74 excluded `RUN_BACKGROUND_JOBS` from its
    corporate key listing, which implies corporate has it too — and E1 proved nothing reads it. This slice
    scoped only the portal `.env`. A one-command check of the corporate file belongs in group A's env sweep.
11. **E6's Step 3 wait.** An eleven-minute wait cannot be a foreground `sleep` in this harness (recorded
    lesson). Either use a `Monitor` until-loop or split the verification into a later session with a recorded
    timestamp — the controller should pick one convention for the whole plan.
