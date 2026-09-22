# REVIEW 2 — production-safety review of the Plan 3 drafts

**Reviewer dimension:** correctness of every command that touches production, and every assertion that
gates it. Adversarial: a defect missed here is an outage on a live public site.

**Scope reviewed:** `plan3-slice{A,B,C,D,E}-*.md` + `docs/superpowers/specs/2026-09-20-separation-plan3-scope-brief.md`.

**Method.** Every finding below marked **[MEASURED]** was verified read-only against the live systems or
by executing the plan's own code locally on 2026-09-21. Nothing on any box was changed. In particular:

- The three perl transforms (`plan3-remove-access-gate.pl`, `plan3-flip-to-content-app.pl`) were run
  against byte-copies of the **live** `sites-enabled` files from oci1, in a scratch directory.
- On-box and public HTTP probes were re-run read-only.
- The record-file variable-name convention was executed in bash.

| severity | count |
|:--|--:|
| 1 — breaks production | 6 |
| 2 — false pass / false fail / stuck cutover | 12 |
| 3 — quality | 17 |
| **total** | **35** |

**Assertions that cannot fail:** 9 (dedicated section at the end).

---

## What is clean — say so explicitly

These categories were hunted and found sound; do not re-litigate them.

1. **The three perl transforms are correct, idempotent and produce exactly the asserted numbers.**
   **[MEASURED]** Run against copies of the live oci1 files:
   ```
   GATE atxwashateria.com   removed=4 total=127->122 residual=0 braces=13/13->12/12 servers=5->5
   GATE crhsent.com         removed=0 total=94->94   residual=0 braces=9/9->9/9     servers=4->4
   GATE portal…             removed=4 total=23->18   residual=0 braces=2/2->1/1     servers=1->1
   FLIP atxwashateria.com   lines=122->111 rewrite_left=0 austin_tx=0 node_app=0 gated=0
                            content_snippet=1 servers=5 braces=11/11 mailcow=6 acme=1
                            idempotent_lines=111 bytes_identical=yes
   ```
   Identical for all three marketing hosts. The `\N`-instead-of-`/s` discipline works; the `59-line`
   class of bug the drafter warns about does not recur. The line-delta + brace + server-count + mailcow +
   acme assertion set is genuinely strong.
2. **`restart` is never used.** `systemctl reload nginx` appears 12 times; `systemctl restart` zero times.
3. **`:3001` probes are correct** — 17 of them, none carries a spurious `X-Forwarded-Proto`, and
   `:3001` confirmed **[MEASURED]** not to redirect (`crhsent.com` → `code=200`).
4. **Line-number-addressed `sed` targets are all correct** **[MEASURED]**: `embed-landing.html:314/:317`,
   `privacy-policy.html:10`, `terms-and-conditions.html:10`, `partner-program.html:10`,
   `affiliate-login-embed.html:6`.
5. **`legacyPortalRedirects.EXACT_PATHS` holds exactly 11 entries** **[MEASURED]**, so A2's `size=15` is right.
6. **Workstation prerequisites exist** **[MEASURED]**: `/var/www/wavemax/cutover-logs` (mode 700, owned by
   `rickh`), `/usr/bin/google-chrome`, `/opt/google/chrome/chrome`, `/var/www/wavemax/env-backups` on the box.
7. **The Lighthouse invocations match the committed procedure** in `docs/development/LIGHTHOUSE-QUALITY-BAR.md`
   verbatim, and the "Content origin baseline (2026-09)" section A1 consumes exists.
8. **`x-origin-box` survives Cloudflare** **[MEASURED]** (`oci-phx` / `oci-phx-ad1` returned publicly), so the
   per-box attribution loops work.

---

# SEVERITY 1 — breaks production

## P1 — Every flip rollback silently loses its snapshot timestamp: record keys contain dots

**Where:** slice A conventions (line 239) and then A5 Rollback + Step 2, A6 Rollback + Step 0 + Step 1,
A7 Rollback, A8 Rollback + Step 0, A9 Rollback + Step 3, A10 Rollback + Step 0 + Step 1.

**Offending commands (verbatim):**
```bash
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y%m%dT%H%M%SZ'); rec "FLIP_${H}_oci1" "$TS"
```
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; set -a; . "$REC"; set +a
V=FLIP_${H}_oci1; TS=${!V}; echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
sudo cp -p ~/nginx-snapshots/$H.preflip.$TS /etc/nginx/sites-enabled/$H
```

**Why it fails.** `$H` is a hostname, so the key written is `FLIP_atxwashateria.com_oci1=…`. A dot is not
legal in a shell variable name. **[MEASURED]** — executed in bash:
```
./rec.env: line 1: FLIP_atxwashateria.com_oci1=20260921T010203Z: command not found
./rec.env: line 2: HOST_DONE_atxwashateria.com=yes: command not found
source rc=0                                    <-- sourcing "succeeds"
rectest.sh: line 14: FLIP_atxwashateria.com_oci1: invalid variable name
TS=[] rc=1                                     <-- and execution continues
```
Consequences, in order of severity:
1. **The rollback for every host flip cannot find its snapshot.** `TS` is empty, so the restore becomes
   `sudo cp -p ~/nginx-snapshots/atxwashateria.com.preflip. …` → `cp: cannot stat`. `set -e` at least stops
   before the reload, so nothing garbage is installed — but the rollback **does not run**, during a live
   public regression, and the operator must hand-hunt the snapshot under time pressure.
2. **A6/A8/A10 Step 0** (`echo "oci1_flip=${!V}"`) prints empty. Its Expected says *"Either empty is a STOP"* —
   so box 2 is blocked and the host is left **half-flipped across the two boxes**, which the plan's own
   conventions forbid ("A host is never left half-flipped across a break").
3. Every task that sources the record emits two `command not found` lines on stderr and `source` still
   returns 0 — noise that trains the operator to ignore stderr on the boxes.

`HOST_DONE_<host>` happens to survive only because A7/A9 Step 0 `grep` the raw line instead of sourcing it.
Slice E's keys (`TS_E3_oci1`, …) are unaffected — box names have no dots. Plan 2's convention was safe
*because it only ever keyed on the box*; slice A extended it to hostnames and broke it.

**Fix.** Sanitise the host into the key everywhere, and never build a variable name from untrusted text:
```bash
HK=${H//./_}                       # atxwashateria_com
rec "FLIP_${HK}_oci1" "$TS"
...
V=FLIP_${HK}_oci1; TS=${!V}; test -n "$TS" || { echo "STOP: no recorded TS for $H/oci1"; exit 1; }
```
Apply the same to `HOST_DONE_${HK}` and A1's `PRE_<host>_<ff>_<cat>`, and add `test -n` guards so an empty
indirect expansion halts instead of proceeding.

---

## P2 — A12 Step 2 can leave the content app STOPPED on oci1 indefinitely

**Where:** slice A, Task A12, Step 2.

**Offending command (verbatim, abridged to the lethal part):**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
pm2 stop crhs-corporate >/dev/null 2>&1
sleep 1
curl -sk -m 8 --resolve atxwashateria.com:443:127.0.0.1 -D- -o /tmp/d.html https://atxwashateria.com/ | grep -iE '^(HTTP/|retry-after|cache-control)' | tr -d '\r'
grep -o '<title>[^<]*</title>' /tmp/d.html
grep -ci 'wavemax\|invite-only' /tmp/d.html || echo 'brand_refs=0'
...
pm2 start crhs-corporate >/dev/null 2>&1
```

**Why it fails.** `set -e` is in force and `grep -o '<title>…' /tmp/d.html` is an **unprotected** grep
(unlike the next line, which has `|| echo`). If the 503 body ever differs from the one A4 wrote — a
partially-applied A4, a CF/nginx interposition, a truncated body, an `-m 8` timeout leaving `/tmp/d.html`
empty — grep exits 1, `set -e` terminates the remote shell, and **`pm2 start crhs-corporate` never runs**.
The same happens if the ssh connection drops at any point in the ~15-second window.

Blast radius while stopped: `/health/origin` returns 503 (M13), so Cloudflare pulls **oci1 out of the pool
for all five load balancers** — including `portal.atxwashdryfold.com`. The estate runs at half capacity
until a human notices, with the measured 1–2 min partial-502 propagation window on the way in *and* out.

**[MEASURED]** pm2 runs as `ubuntu` on oci1, so `pm2 stop crhs-corporate` will succeed. This is not theoretical.

**Secondary defect in the same step:** `crhsent.com` is served by its **own inline `location /`** to
`:3001` (M5) and therefore has **no** `error_page 502 504 = @content_unavailable`. While the content app is
stopped, `crhsent.com` — the litigation-record host — returns a **bare nginx 502**, not the graceful 503.
Item 20 is therefore only half closed, contrary to the A12 decision record and the slice exit table.

**Fix.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
trap 'pm2 start crhs-corporate >/dev/null 2>&1 || true' EXIT INT TERM
pm2 stop crhs-corporate >/dev/null 2>&1
sleep 1
curl -sk -m 8 --resolve atxwashateria.com:443:127.0.0.1 -D- -o /tmp/d.html https://atxwashateria.com/ | grep -iE '^(HTTP/|retry-after|cache-control)' | tr -d '\r' || true
grep -o '<title>[^<]*</title>' /tmp/d.html || echo 'title=MISSING'
..."
```
and either add the `error_page` pair to `crhsent.com`'s inline block, or state in the A12 decision record
that crhsent.com keeps a bare 502 by choice.

---

## P3 — D11 Step 8 (and its rollback) probe `:3000` with no `X-Forwarded-Proto`, so the deploy's central proof returns nothing

**Where:** slice D, Task D11, Step 8 (lines 1708, 1709, 1710) and the D11 Rollback block (line 1745).

**Offending commands (verbatim):**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'curl -s -o /dev/null -w "portal-health %{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health; curl -s -o /dev/null -w "health-origin %{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health/origin; …'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'curl -s -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/embed-app-v2.html | grep -o "<meta name=\"csp-nonce\"[^>]*>"'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'curl -s -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/embed-app-v2.html | grep -o "<meta name=\"asset-version\"[^>]*>"'
```
> - Expected:
>   - `portal-health 200`, `health-origin 200`, `crhsent 200`;
>   - on-box: exactly `<meta name="csp-nonce" content="<base64>">` — **one** `content=`, non-empty

**Why it fails.** **[MEASURED]** on oci1, right now:
```
--- /health no XFP:            code=302 redir=https://portal.atxwashdryfold.com/health
--- /health/origin no XFP:     code=302 redir=https://portal.atxwashdryfold.com/health/origin
--- embed-app-v2 no XFP:       code=302 redir=https://portal.atxwashdryfold.com/embed-app-v2.html
--- embed-app-v2 no XFP body meta:
(end)                                        <-- empty body, grep prints NOTHING
--- embed-app-v2 WITH XFP meta:
<meta name="csp-nonce" content="" content="rKHfFrZ7ydMmVLeyMYThow==">
```
So, immediately after a production `pm2 reload` of **both** apps on a live box:
- `portal-health 200` reads **302** → looks like a failed reload;
- the nonce proof — the whole reason D11 exists — prints **nothing**, which is indistinguishable from
  "the fix did not land";
- and the **rollback verification has the identical bug**, so the operator cannot confirm the rollback
  either. They are flying blind on a production box, with both apps freshly reloaded.

The plan already knows this: slice A M19 states it explicitly, and slices A and E get it right in 9 of 9
places. Slice D got it wrong in 4 of 4.

(The measurement also confirms the brief's item 16: the live duplicate `content=""` defect is real.)

**Fix.** Add `-H "X-Forwarded-Proto: https"` to all four probes. Leave the `:3001` probe in the same line
alone — it is correct.

---

## P4 — E4 Step 4: the safety check and the `pm2 reload` are one ungated block, so a wrecked `.env` is loaded anyway

**Where:** slice E, Task E4, Step 4.

**Offending command (verbatim):**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'A=/var/www/wavemax/wavemax-affiliate-program/.env
grep -ciE "PRIVATE KEY|^DOCUSIGN_|…" $A
grep -oE "^[A-Za-z_][A-Za-z0-9_]*=" $A | tr -d "=" | sort -u | wc -l
grep -cvE "^[A-Za-z_][A-Za-z0-9_]*=|^\s*#|^\s*$" $A
cd /var/www/wavemax/wavemax-affiliate-program && node -e "require(\"dotenv\").config();console.log([\"MONGODB_URI\",\"JWT_SECRET\",\"ENCRYPTION_KEY\",\"SESSION_SECRET\",\"EMAIL_PASS\",\"BASE_URL\",\"ALERT_EMAIL\"].every(k=>process.env[k]&&process.env[k].length>0))"
pm2 reload wavemax --update-env >/dev/null; sleep 8
curl -s -o /dev/null -w "%{http_code}\n" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/health'
```
> - `false` on the fourth line means a key the app needs was caught by the filter — run the Rollback for this
>   box immediately, then **STOP**.

**Why it fails.** There is no `set -e` and no `&&`. `node -e` prints `false` and exits 0, then
`pm2 reload wavemax --update-env` runs unconditionally. By the time a human reads "false", the portal has
already been reloaded with a `.env` that is missing a required secret — and E4's own deletion is a 28-line
`sed` range delete plus a 23-name filter, i.e. exactly the operation most likely to over-delete.

E3 gets this right (Step 3 is a separate read-only verify; Step 4 is the reload). E4 collapsed them.

**Fix.** Split into two steps exactly as E3 does, and make the check exit non-zero:
```bash
# Step 4a — read-only verification, no reload
ssh … 'set -e
A=…/.env
test "$(grep -ciE "PRIVATE KEY|^DOCUSIGN_|…" $A)" = 0
test "$(grep -oE "^[A-Za-z_][A-Za-z0-9_]*=" $A | tr -d "=" | sort -u | wc -l)" = 59
test "$(grep -cvE "^[A-Za-z_][A-Za-z0-9_]*=|^\s*#|^\s*$" $A)" = 0
cd …; node -e "require(\"dotenv\").config();const m=[…].filter(k=>!process.env[k]);if(m.length){console.log(\"MISSING \"+m.join(\",\"));process.exit(1)}console.log(\"ENV_OK\")"'
# Step 4b — reload only after 4a printed ENV_OK
```
Also widen the required-key list beyond 7 of 59 (add `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_FROM`,
`CSRF_SECRET`, and anything else `validateSecrets` demands), or state that the `=59` count is the real guard.

---

## P5 — C10 Step 4 runs an index-creation script against the production database with a flag the script does not implement

**Where:** slice C, Task C10, Step 4.

**Offending command (verbatim):**
```bash
cd "$AFF" && node scripts/ensure-indexes.js --dry-run 2>&1 | tail -5; echo "AFF_EXIT=$?"
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && node scripts/ensure-indexes.js --dry-run 2>&1 | tail -5; echo "CORP_EXIT=$?"
```
> - Expected: `AFF_EXIT=0` and `CORP_EXIT=0`. If `--dry-run` is not a supported flag, run against a local
>   `mongodb-memory-server` URI instead — **never against the production ADB from this task.**

**Why it fails, twice.**

1. **`--dry-run` is not implemented.** **[MEASURED]** `scripts/ensure-indexes.js` contains no reference to
   `process.argv` at all. Its header reads *"Ensure redesign (PR 6–9) indexes exist **in production**"*, it
   does `require('dotenv').config()`, and it calls `Model.createIndexes()` on seven models. The affiliate
   working copy **has a `.env`** **[MEASURED]**. So the command as written connects to whatever
   `MONGODB_URI` that file names — the production Oracle ADB — and creates indexes. The caveat that says
   "never against the production ADB" is printed *after* the command that does it.
2. **`echo "AFF_EXIT=$?"` reports `tail`'s status, not node's.** `tail -5` always exits 0, so
   `AFF_EXIT=0` prints even when the script dies with `FATAL:`. This is a textbook assertion that cannot fail.

**Fix.**
```bash
grep -q 'dry-run' "$AFF/scripts/ensure-indexes.js" \
  || { echo 'STOP: ensure-indexes.js has no --dry-run; do not run it here'; false; }
cd "$AFF" && MONGODB_URI="$LOCAL_MEMORY_URI" node scripts/ensure-indexes.js 2>&1 | tail -5
echo "AFF_EXIT=${PIPESTATUS[0]}"
```
(and the same for corporate). If a dry run is genuinely wanted, implement `--dry-run` in the script first —
that is a code change with a test, not a flag you hope exists.

---

## P6 — E6 Step 3 pulls and reloads BOTH boxes in one ungated loop, and a failed `git pull` still reloads

**Where:** slice E, Task E6, Step 3.

**Offending command (verbatim):**
```bash
- [ ] **Step 3: Deploy and prove the log went quiet.** Deploy oci1, verify, then oci2.
for IP in 161.153.71.201 144.24.4.202; do
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/wavemax/wavemax-affiliate-program && git pull --ff-only | tail -2 && pm2 reload wavemax >/dev/null && sleep 8 && curl -s -o /dev/null -w "%{http_code}\n" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/health'; done
```

**Why it fails.**
1. **The step text says "Deploy oci1, verify, then oci2"; the command deploys both back to back with no
   gate.** Box 1's health code is printed, but the loop does not read it — oci2 is pulled and reloaded
   ~10 seconds later regardless. A bad commit takes the portal down on **both** boxes, which is a total
   outage of the affiliate application. Every other deploy task in the plan (E3 Step 4, D11, A5→A6)
   enforces one box at a time; this one silently does not.
2. **`git pull --ff-only | tail -2 && pm2 reload`** — the `&&` tests the *pipeline*, whose status is
   `tail`'s. A `git pull` that fails (non-fast-forward, network, dirty tree) still leads to a `pm2 reload`,
   which then reloads **the old code** while the operator believes the new code shipped.

**Fix.**
```bash
IP=161.153.71.201     # Pass 2: IP=144.24.4.202, only after Pass 1 prints 200
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'set -e -o pipefail
cd /var/www/wavemax/wavemax-affiliate-program
git pull --ff-only | tail -2
git log --oneline -1
pm2 reload wavemax >/dev/null
sleep 8
curl -sf -o /dev/null -w "%{http_code}\n" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/health'
```

---

# SEVERITY 2 — false pass, false fail, or a stuck cutover

## P7 — A6/A8 Step 4 record `HOST_DONE_<host>=yes` even when the C14 after-gate FAILED

**Where:** slice A, A6 Step 4 (and A8 Step 4, which says "As A6 Step 4 … record `HOST_DONE_…=yes`").

**Offending command (verbatim, the tail of the same fenced block as the gate):**
```bash
process.exit(fail?1:0)' "$LH_DATE" "$H" "$OUT" | tee -a "$EV/p3-lh-$H.txt"
echo "exit=${PIPESTATUS[0]}"
EV=/var/www/wavemax/cutover-logs; printf '%s=%q\n' "HOST_DONE_atxwashateria.com" yes >> "$EV/plan3-sliceA-record.env"
```
> - On `FAIL`: this host is **blocked**. Run A6's then A5's Rollback …

**Why it fails.** The `printf` is unconditional and lives in the same block as the gate it is supposed to
record. A7 Step 0's gate is `grep -c '^HOST_DONE_atxwashateria.com=yes$' "$REC"` → it returns `1`, and the
next host's flip proceeds **with a blocked host behind it** — the precise thing the Expected text forbids.

**Fix.**
```bash
V=${PIPESTATUS[0]}; echo "exit=$V"
[ "$V" = 0 ] && printf '%s=%q\n' "HOST_DONE_${H//./_}" yes >> "$REC" || echo "NOT RECORDED — C14 failed for $H"
```

---

## P8 — [MEASURED] The `len=27477` POST-FLIP assertion is already stale; the content app now serves 27593

**Where:** slice A conventions (discriminator table), A4 Step 4 POST-FLIP profile, A5 Step 4, A6 Step 2,
A7 Step 4, A8 Step 2, A9 Step 5, A10 Step 2 — every flip verification.

**Offending Expected line (verbatim):**
> - `GET / code=200 len=27477`, `partner_marker=1`, `comingsoon=0`
> - `root=200/27477 marker=1 comingsoon=0`
> - Any `legal_*=404`, `reset=404`, … is a **roll-back-now** condition, not a note for later.

**Why it fails.** **[MEASURED]** on oci1 today:
```
atxwashateria.com    443 code=200 len=1134  cs=1 partner=0 | 3001 code=200 len=27593
rundberglaundry.com  443 code=200 len=1134  cs=1 partner=0 | 3001 code=200 len=27593
atxwashdryfold.com   443 code=200 len=25585 cs=0 partner=1 | 3001 code=200 len=27593
```
The portal-side numbers (1134 / 25585) still hold; the **content app's** page is now 27593 bytes, not
27477. So every flip verification will report a length mismatch on a **perfectly healthy flip**, on the
canonical host, in front of the public. Either the operator rolls back a good flip, or — worse — learns to
wave the byte counts through, which disarms the only assertion that distinguishes portal from content on
`atxwashdryfold.com` through CF.

Byte-exact `Content-Length` of a live, actively-developed page is not a stable discriminator: any content
edit, asset-version stamp, or locale change moves it. It has already moved once inside the drafting window.

**Fix.** Keep the robust discriminators the plan already has and drop the exact byte count to a sanity range:
```bash
# was: len=27477
#  ->  assert the marker + a range
test "$marker" = 1 && test "$len" -gt 20000 && test "$len" -lt 40000
```
Re-measure the current value at execution time and record it as evidence, not as a gate. The
`/health` content-type (`application/json` vs `text/html`) and `data-i18n="partner.meta.title"` /
`<title>Coming soon</title>` markers are the real discriminators and they are stable.

---

## P9 — [MEASURED] The before-gates are measured from the allowlisted preview IP, so A1 Step 1 STOPs on the first command of the plan

**Where:** slice A, A1 Step 1 and Step 2; A5 Step 1; A7 Step 1; A9 Step 2.

**Offending Expected line (verbatim):**
> - Expected, exactly:
>   - `atxwashateria.com      code=200 len=1134 comingsoon=1 partner=0`
>   - `rundberglaundry.com    code=200 len=1134 comingsoon=1 partner=0`
>   - `atxwashdryfold.com     code=200 len=25585 comingsoon=0 partner=1`
>   - Any other combination means M15 has drifted — STOP and re-establish the premises.

**Why it fails.** **[MEASURED]** from this workstation (egress `70.114.167.145`, which is the admin IP in
nginx's `geo $allowed` block and in `PARTNER_PREVIEW_ALLOWLIST`):
```
atxwashateria.com      code=200 len=25991 comingsoon=0 partner=1 box=oci-phx
rundberglaundry.com    code=200 len=25991 comingsoon=0 partner=1 box=oci-phx-ad1
atxwashdryfold.com     code=200 len=25991 comingsoon=0 partner=1 box=oci-phx-ad1
```
(25585 + ~406 of Cloudflare's injected `email-decode` / beacon markup = 25991.)

So the very first command in slice A trips its own STOP and the plan cannot start. Worse, if the operator
"re-establishes the premises" from the workstation they will conclude M15 is wrong, when in fact M15 is
right *for the public* and wrong *for the runner*.

The knock-on is the substantive one: **A1 Step 2's and A5/A7 Step 1's Lighthouse "before" runs measure the
preview partner page, not the placeholder the public sees.** The draft claims those numbers are "evidence
of what the public saw" (D-A3, C14-reg). They are not.

**Fix.** Either
(a) run the before-gate from a non-allowlisted egress (a phone hotspot, a cheap VPS, or
`PAGESPEED`/PSI with the documented `GOOGLE_PLACES_API_KEY`), and say so in the task; or
(b) temporarily narrow `PARTNER_PREVIEW_ALLOWLIST` for the measurement window (a `.env` change =
HUMAN-CONFIRM + `pm2 reload --update-env`, so probably not worth it); or
(c) keep the A1 Step 1 probe but change its Expected to the two-branch form —
*"from an allowlisted IP: `partner=1 len≈25991`; from a public IP: `comingsoon=1 len=1134`"* — and record
which branch was observed. Whichever is chosen, the C14 "before" numbers must be labelled for what they are.

---

## P10 — [MEASURED] B8 Step 1's flip gate can never pass: `runberglaundry.com` has no nginx file, and half the check is vacuous

**Where:** slice B, Task B8, Step 1.

**Offending command (verbatim):**
```bash
for h in atxwashateria.com atxwashdryfold.com rundberglaundry.com runberglaundry.com; do
  for ip in 161.153.71.201 144.24.4.202; do
    printf '%s %s ' "$h" "$ip"
    ssh -i ~/.ssh/oci_wavemax ubuntu@$ip \
      "curl -s -o /dev/null -w '%{http_code} ' -H 'Host: $h' http://127.0.0.1:3001/ ;
       grep -c 'proxy-content-app.conf' /etc/nginx/sites-enabled/$h 2>/dev/null || echo 0"
  done
done | tee "$EV/flip-state.txt"
```
> - Expected: **eight** lines, each ending `200 1` … Any `0` in the second column means the host is still
>   on `:3000`: **STOP**, record `FLIPS_VERIFIED=no`, and do not start B9.

**Why it fails, twice.**
1. **[MEASURED]** `ls /etc/nginx/sites-enabled/` on oci1 returns exactly five files:
   `atxwashateria.com atxwashdryfold.com crhsent.com portal.atxwashdryfold.com rundberglaundry.com`.
   There is **no `runberglaundry.com`** — which is slice A's own D-2/M3/D-A6 finding. So
   `grep -c … /etc/nginx/sites-enabled/runberglaundry.com` fails and `|| echo 0` prints `0`, forever.
   `FLIPS_VERIFIED=no` is permanent and **B9–B15 (the whole of phase B-iii) can never start**.
2. **The first column proves nothing.** `curl -H 'Host: atxwashateria.com' http://127.0.0.1:3001/` returns
   `200` **before** the flip too — slice A's own M17 says so, and **[MEASURED]** confirms it (`3001 code=200`
   on all three hosts today, unflipped). It is 200 on a flipped system and 200 on an unflipped one.

**Fix.**
```bash
for h in atxwashateria.com atxwashdryfold.com rundberglaundry.com; do      # three, not four
  for ip in 161.153.71.201 144.24.4.202; do
    printf '%s %s ' "$h" "$ip"
    ssh -i ~/.ssh/oci_wavemax ubuntu@$ip \
      "printf 'snippet=%s ' \"\$(grep -c 'proxy-content-app.conf' /etc/nginx/sites-enabled/$h)\"
       printf 'portal_snippet=%s ' \"\$(grep -c 'proxy-node-app.conf' /etc/nginx/sites-enabled/$h)\"
       curl -sk -m 8 --resolve $h:443:127.0.0.1 -w 'health_ct=%{content_type}\n' -o /dev/null https://$h/health"
  done
done
# Expected: six lines, each 'snippet=1 portal_snippet=0 health_ct=application/json; charset=utf-8'
```
plus a separate one-line note that `runberglaundry.com` is served transitively by the implicit default
server block and has nothing to flip (cite slice A A10 Step 3).

---

## P11 — [MEASURED] B8 Step 2 gates on an evidence file no slice ever creates

**Where:** slice B, Task B8, Step 2.

**Offending command (verbatim):**
```bash
grep -E '^(atxwashateria|atxwashdryfold|rundberglaundry|runberglaundry)\.com .*POST' \
  /var/www/wavemax/cutover-logs/plan3-flips/lighthouse-per-host.txt
```
> - Expected: four `POST` rows … A missing or failing row blocks that host and therefore blocks B9.

**Why it fails.** **[MEASURED]** `plan3-flips/lighthouse-per-host.txt` appears **only** in slice B; the
string occurs nowhere in slice A. Slice A writes `/var/www/wavemax/cutover-logs/p3-lh-<host>.txt`, whose
lines look like `PASS AFTER atxwashateria.com mobile run1 performance=… seo=…` — a different path **and** a
different line shape (the host is not at the start of the line, and the token is `AFTER`, not `POST`). The
grep returns nothing and exits 1, so B9 is blocked permanently. It also expects a row for
`runberglaundry.com`, which slice A never measures because that host has no content of its own.

**Fix.** Point the gate at slice A's actual artefacts and its actual verdict lines:
```bash
for h in atxwashateria.com rundberglaundry.com atxwashdryfold.com; do
  grep -E "^C14 $h (PASS|FAIL)" /var/www/wavemax/cutover-logs/p3-lh-$h.txt | tail -1
done
# Expected: three lines, all 'C14 <host> PASS'
grep -c '^HOST_DONE_.*=yes$' /var/www/wavemax/cutover-logs/plan3-sliceA-record.env   # expect 3
```

---

## P12 — [MEASURED] The corporate deploy that every flip gates on is owned by no task

**Where:** slice A, Task A2 (`**Files:** … No file on any box changes. Deployment of both repos is the
existing rsync/`pm2 reload` path and is **not** owned by this slice.`), A2 Step 5
(`# Deployment is the existing path and is not owned by this slice; after it:`).

**Why it matters.** **[MEASURED]** on oci1:
```
/var/www/crhs-corporate                       NO .git
/var/www/wavemax/wavemax-affiliate-program    git ef80412d https://github.com/rhoulihan/wdf-affiliate-program.git
/var/www/crhs-web-core                        NO .git
```
The corporate app is **rsync-delivered** — there is no `git pull` path for it. Slice D rsyncs
`crhs-web-core` only. No slice in Plan 3 contains an rsync + `pm2 reload crhs-corporate` for the corporate
**application** tree. Yet A2's corporate change (`legacyPortalRedirects.EXACT_PATHS` += four legal paths) is
the thing that stops `/privacy-policy`, `/terms-of-service`, `/terms-and-conditions` and `/refund-policy`
returning public 404s on **every flipped host**, and `PRE404_CLOSED=yes` — a hard precondition of A5, A7 and
A9 — is asserted from it.

An unowned step on the critical path of a public cutover is how a cutover stalls at 2 a.m.

**Fix.** Add an explicit corporate-deploy task (or a step inside A2) modelled on D11 Steps 2–4 and 7:
snapshot → rsync from the workstation → `pm2 reload crhs-corporate --update-env` → per-box verify, one box
at a time. A2 Step 5's verification block already exists; it just has nothing that produces the state it
checks. The same gap applies to slice B's corporate tasks (B2, B3, B4, B6) and slice E's E9.

---

## P13 — A12 Step 3's "verify the pool returns to healthy" verifies no health, and the PATCH check omits the two fields that could down both origins

**Where:** slice A, Task A12, Step 3.

**Offending command (verbatim):**
```bash
curl -s -H "Authorization: Bearer $TOK" "https://api.cloudflare.com/client/v4/accounts/$ACC/load_balancers/pools" \
  | node -e '…for(const p of JSON.parse(s).result)console.log("POOL "+p.name+" enabled="+p.enabled+" origins="+p.origins.map(o=>o.name).join(","))'
```
> - Expected: … then `POOL wavemax-oci enabled=true origins=oci1,oci2`, then five host lines all `HTTP/2 200`

**Why it fails.** `p.enabled` and `p.origins[].name` are **static configuration**. They print
`enabled=true origins=oci1,oci2` whether both origins are healthy, one is, or neither is. The five public
curls that follow do not close the gap either: with one origin unhealthy, Cloudflare routes all five
requests to the surviving box and every line reads `HTTP/2 200`. So the step cannot detect the failure it
exists to detect — a tightened monitor that starts failing both origins.

Second defect: the PATCH verification prints `path host interval timeout retries` but **not**
`expected_codes` and **not** `expected_body`. `expected_body` being empty is load-bearing
(`memory/cf_api_token_and_lb_monitor_2026-09-09`: an empty `expected_body` is what makes the `default_server
444` and the `:3001` flip monitor-safe). `MONITOR_BEFORE` captures `codes` but never `expected_body`, so a
rollback cannot restore it either.

**Fix.**
```bash
# capture and re-assert the full monitor shape, including expected_body
… console.log(`path=${m.path} host=${m.header.Host[0]} interval=${m.interval} timeout=${m.timeout} retries=${m.retries} codes=${m.expected_codes} body=${JSON.stringify(m.expected_body)}`)
# and check real health, not config:
POOL=$(curl -s -H "Authorization: Bearer $TOK" ".../load_balancers/pools" | node -e '…print the pool id…')
curl -s -H "Authorization: Bearer $TOK" ".../load_balancers/pools/$POOL/health" \
  | node -e '…for each origin print name + healthy…'
# Expected: both origins healthy=true
```

---

## P14 — The flip transform's atomicity is asserted by eyeball, not enforced; a partial apply produces exactly the state the plan says cannot exist

**Where:** slice A, D-A4 rationale, A5 Interfaces (`**D-A4 atomicity:** … There is no intermediate state in
which the host points at `:3001` while still rewriting to `/austin-tx/``), A5 Step 3 / A6 Step 1 /
A7 Step 3 / A8 Step 1 / A9 Step 4 / A10 Step 1.

**Why the claim is wrong.** `plan3-flip-to-content-app.pl` contains five **independent** `s///`
substitutions. One `perl -0pi` invocation makes the *write* atomic; it does not make the *outcome*
all-or-nothing. If the live file has drifted such that edit 2's anchor (`# Default route …` +
`location = / { rewrite ^ /austin-tx/… }`) no longer matches — a comment reworded, an indentation change,
an extra blank line — edit 2 silently no-ops while **edit 3 (the include swap) still applies**. The file
then points at `:3001` *and* still rewrites `/` to `/austin-tx/`, which the content app 404s (M8). Every
apex request on that host 404s.

`sudo nginx -t` passes on that file — it is syntactically valid. The only thing standing between it and a
public 404 is a human reading `rewrite_left=0` in a 10-field echo line.

**[MEASURED]** the anchor is present today (`    # Default route → Austin franchise (internal rewrite, URL
bar unchanged).`), and the transform works. That is exactly why this is a *latent* defect worth fixing: it
will bite the day someone edits a comment.

**Fix.** Make the script fail loudly instead of partially:
```perl
my $n1 = s{\A\# ([a-z.]+) \N*\n(?:\#\N*\n)+\n}{…};
my $n2 = s{\n[ \t]*\# Default route \N*\n[ \t]*location = / \{\n[ \t]*rewrite \^ /austin-tx/\S* last;\n[ \t]*\}\n}{\n};
my $n3 = s{include /etc/nginx/snippets/proxy-node-app\.conf;}{include /etc/nginx/snippets/proxy-content-app.conf;};
# idempotent re-run: all three are 0 and the file already carries the content snippet
unless ( ($n1==1 && $n2==1 && $n3==1) || ($n1==0 && $n2==0 && $n3==0 && /proxy-content-app\.conf/) ) {
  die "plan3-flip: partial apply (comment=$n1 rewrite=$n2 include=$n3) — refusing\n";
}
```
With `set -e` already in the ssh block, a `die` halts before `nginx -t` and before any reload. Apply the
same `die`-on-partial pattern to `plan3-remove-access-gate.pl` and `plan3-add-xfh.pl`.

---

## P15 — E11's irreversible-delete gate can only be satisfied by hand-editing the record, and its "nothing references it" check will be non-zero by then

**Where:** slice E, E10 Step 2 / Step 4, E11 Step 1.

**Offending lines (verbatim):**
> - Record `TRANSFER_UNIQUE_N` as that count. **E11 will not run while it is non-zero.**
```bash
test "${TRANSFER_UNIQUE_N:-1}" = 0 && echo UNIQUE_ZERO || echo UNIQUE_NONZERO
```

**Why it fails.** E10 Step 2 computes `TRANSFER_UNIQUE_N` = 3 (expected) but there is no `rec` command that
writes it, and — more importantly — **no step recomputes it after Step 3's reconciliation**. Step 4 merely
echoes the same stale value. So E11's `UNIQUE_ZERO` gate is unreachable through the plan's own commands; the
only way past it is to type `TRANSFER_UNIQUE_N=0` into the record by hand, at which point the gate on a
**permanent deletion of attorney-client privileged material** proves nothing at all.

Second defect in the same step:
```bash
grep -rn "crhs-transfer" …/wavemax-affiliate-program …/crhs-corporate …/crhs-web-core …/dc_private 2>/dev/null \
  | grep -vE "/(node_modules|\.git)/" | grep -v "plan3-sliceE-findings.md" | grep -v "separation-plan3-scope-brief.md" | wc -l
```
> - Expected … `0` on the fourth line … Any … non-zero reference count … **STOP.**

E15 ships `docs/superpowers/ESCALATIONS.md` into the affiliate repo with row 10 **titled**
"`crhs-transfer` preservation", and the assembled Plan 3 document will live in the same tree. Both are
matched by this grep, so the count becomes non-zero and E11 STOPs on a condition that is expected and fine.

**Fix.** Make Step 4 *recompute* rather than echo, and scope the reference grep to code:
```bash
# E10 Step 4 — recompute after reconciliation
N=$( …the same REMOTE/LOCAL hash pipeline as Step 2… | awk '{print $2}' | sort | uniq -c | awk '$1==1' | wc -l )
rec TRANSFER_UNIQUE_N "$N"; echo "TRANSFER_UNIQUE_N=$N"
# E11 Step 1 — exclude documentation, not individual filenames
grep -rn "crhs-transfer" …/{server,public,scripts,tests} 2>/dev/null | grep -vE '/(node_modules|\.git)/' | wc -l
```

---

## P16 — E3 Step 4's post-reload log check cannot fail

**Where:** slice E, Task E3, Step 4. See also the dedicated section below.

**Offending line (verbatim):**
```bash
tail -n 200 /var/www/wavemax/wavemax-affiliate-program/logs/combined.log | grep -ciE "FRONTEND_URL|undefined/embed-app-v2" || true'
```
> - Expected: `online:1 online:1` …, `200`, `0`.

**Why it fails.** The app never logs the literal string `FRONTEND_URL`, and `undefined/embed-app-v2` can
only appear if a password-reset email is generated within the 8 seconds after the reload — which nothing in
the step causes. The output is `0` on a healthy system **and** `0` on a system where E3 just deleted
`FRONTEND_URL` while E2 was not deployed, i.e. the exact failure this task's own E12 Step 3 calls out
("the link starts `undefined/…` → **E3 deleted `FRONTEND_URL` without E2 deployed**").

**Fix.** Assert the thing that actually matters, directly:
```bash
ssh … 'cd /var/www/wavemax/wavemax-affiliate-program && node -e "
require(\"dotenv\").config();
const b=process.env.BASE_URL, f=process.env.FRONTEND_URL;
const src=require(\"fs\").readFileSync(\"server/services/passwordResetService.js\",\"utf8\");
console.log(\"BASE_URL=\"+b+\" FRONTEND_URL=\"+(f===undefined?\"unset\":f)+\" uses_base_url=\"+/process\\.env\\.BASE_URL\\}\\/embed-app-v2/.test(src));
process.exit(b && f===undefined && /process\\.env\\.BASE_URL\\}\\/embed-app-v2/.test(src) ? 0 : 1)"'
# Expected: BASE_URL=https://portal.atxwashdryfold.com FRONTEND_URL=unset uses_base_url=true
```

---

## P17 — E8 Step 3's "every mailcow container Up" check uses `docker ps`, which cannot show a container that died

**Where:** slice E, Task E8, Step 3.

**Offending command (verbatim):**
```bash
docker ps --format "{{.Names}} {{.Status}}" | sort | head -20
```
> - Expected: … every mailcow container `Up`; … A container other than `ofelia` showing a new uptime —
>   **STOP** and record it

**Why it fails.** `docker ps` lists **running** containers only. If `docker compose up -d ofelia-mailcow`
collaterally stops or crashes another service (the risk this check exists to cover on a mail host), that
container simply **disappears from the list** — and every line that *is* printed still says `Up`. The check
reads identically on a healthy host and on a host that just lost postfix. `head -20` compounds it: mailcow
runs ~18–20 containers, so anything sorting after the 20th is silently cut.

**Fix.**
```bash
# capture the set BEFORE the recreate (add to Step 2) …
docker ps -a --format '{{.Names}} {{.State}}' | sort > /tmp/mailcow-before.txt
# … and diff it after
docker ps -a --format '{{.Names}} {{.State}}' | sort > /tmp/mailcow-after.txt
diff /tmp/mailcow-before.txt /tmp/mailcow-after.txt || true
echo "not_running=$(docker ps -a --format '{{.Names}} {{.State}}' | grep -vc ' running$')"
# Expected: the diff shows only the ofelia line, and not_running=0
```

---

## P18 — [MEASURED] A2 Step 2's TDD red step runs a test that does not exist

**Where:** slice A, Task A2, Step 2.

**Offending command (verbatim):**
```bash
cd ~/GitHub/crhs-corporate   # or wherever the corporate working copy lives
npx jest tests/legacyPortalRedirects.test.js -t 'legal' 2>&1 | tail -20
```
> - Expected **before** the fix: a failing assertion naming `/privacy-policy` (the test expects a
>   301 and gets `next()`). Confirm it fails for that reason before writing the implementation.

**Why it fails.** **[MEASURED]** `tests/legacyPortalRedirects.test.js` contains 9 tests and **none**
matching `legal|privacy|terms|refund`. The step never says to *write* the test; it jumps to running it.
`jest -t 'legal'` with no matching test prints `Tests: 0 total` and exits non-zero — which superficially
resembles the expected red, so the TDD gate can be waved through with no test having ever failed for the
right reason. (This is the project's own strict-TDD rule being defeated by its own command.)

**Fix.** Add the write step before the run, and make the Expected discriminate:
```bash
# Step 2a: create the four legal cases in tests/legacyPortalRedirects.test.js (test-first).
# Step 2b:
npx jest tests/legacyPortalRedirects.test.js -t 'legal' 2>&1 | tail -20
# Expected: 'Tests: 4 failed, 4 total' with 'expected 301, received 404' naming /privacy-policy.
# 'Tests: 0 total' means the test was not written — STOP.
```

Also note the path inconsistency: this step uses `~/GitHub/crhs-corporate` while B2/B3/E9 use
`/mnt/c/Users/rickh/GitHub/crhs-corporate`. **[MEASURED]** the latter exists. Normalise.

---

# SEVERITY 3 — quality

**P19 — A1 Step 0's Chrome check prints nothing on failure and checks the wrong binary.**
`which google-chrome >/dev/null && npx --yes lighthouse --version`. The `>/dev/null` means the Expected
("`/usr/bin/google-chrome` resolves") can never print; and on a box without Chrome the whole line produces
*no output at all*. It also checks `google-chrome` on `PATH` while every Lighthouse run uses
`CHROME_PATH=/opt/google/chrome/chrome` — a different file. **[MEASURED]** both exist today, so this is
latent. Fix: `ls -l /opt/google/chrome/chrome && npx --yes lighthouse --version`.

**P20 — C14-stab is tighter than the committed doc's own stated variance.** `LIGHTHOUSE-QUALITY-BAR.md`
says *"Performance scores have run-to-run variance (±3–5 on mobile is normal)"*; D-A3 blocks a host when the
spread over 3 mobile runs exceeds 3. Ordinary noise will block a host. Either widen to ≤ 5 (and cite the
doc), or take 5 runs and gate on the median, which the doc already recommends ("trust the median").

**P21 — `nginx -t` gates by reading, not by `&&`, in every flip task.** A5 Step 3 ends with `sudo nginx -t`;
A5 Step 4 opens a *new* ssh beginning `sudo systemctl reload nginx && …`. Nothing programmatic connects
them. (Ubuntu's `ExecReload` re-tests the config, so a pure syntax error is still caught — the uncaught case
is P14's syntactically-valid-but-wrong file.) Fix: end the flip step with
`sudo nginx -t && sudo systemctl reload nginx` in the same `set -e` block, after the P14 `die` guard.

**P22 — `systemctl is-active nginx` + `nginx -T` cannot detect a reload that did not take.** Used at A3
Step 6, A4 Step 5, A5 Step 4, A6 Step 2, A7 Step 4, A8 Step 2, A9 Step 5, A10 Step 2, A11 Step 3.
`is-active` says `active` whether or not the master accepted the new config, and `nginx -T` dumps the
**on-disk** files, not the running configuration — so `nginx -T | grep -c 'access_allowed'` = 0 only
re-proves what Step 4/5 already proved. The behavioural probes that follow are what really verify the
reload; say so, and drop the `nginx -T` count from the Expected or replace it with a worker-start check
(`ps -o lstart= -p $(pgrep -f 'nginx: worker' | head -1)`).

**P23 — [MEASURED] A2 Step 3's expected `grep -c` value is wrong.** Expected:
*"`grep -c rundberglaundry.com public/embed-landing.html` is `3` (down from 5)"*. `grep -c` counts **lines**,
and line 278 carries two occurrences (`mailto:` + link text). Current value is **4**; after the fix it is
**2** — which is what the step's own prose says ("the two remaining are the mailto at `:278` and the
`/operator` link at `:294`"). Fix the number to `2` (from `4`), or use `grep -o … | wc -l`.

**P24 — [MEASURED] B1 Step 3's Expected block is off by one line.** `sed -n '4,9p'` after the insert prints
six lines beginning with `<meta charset="UTF-8">`; the Expected block shows five and starts at `viewport`.

**P25 — E3 Step 4's `online:1 online:1` assumes `restart_time` is still 0.** E3's Interfaces require
"E2 merged and **deployed**", and that deploy is itself a `pm2 reload` — so the count will already be ≥ 1 and
E3's Expected trips a spurious STOP. Fix: capture the count before the reload and assert `after == before+1`.

**P26 — `mailcow_xfh` on `proxy-node-app.conf` is structurally always 0.** A11 Step 2 computes
`mailcow_xfh=$(awk '/localhost:8443/,0' $P | grep -c X-Forwarded-Host || true)`. **[MEASURED]**
`proxy-node-app.conf` is 14 lines and contains no `localhost:8443` at all, so `awk` prints nothing and the
guard reads `0` unconditionally. On `crhsent.com` the same construct prints from the *first* 8443 line to
EOF, so its correctness depends on block order rather than on the guard working. Fix: assert per-block —
`perl -0ne 'print scalar(()=/proxy_pass https:\/\/localhost:8443[^}]*X-Forwarded-Host/gs),"\n"' $P` — or
simply assert `grep -c X-Forwarded-Host` equals the number of local-Node `location` blocks.

**P27 — E8 Step 2's python heredoc is unquoted and never asserts it substituted anything.**
`python3 - <<PY` (not `<<'PY'`) lets the remote shell expand the body; it is safe *today* only because the
body happens to contain no `$` or backtick. And `re.sub` writes the file back unchanged when the pattern
misses, silently. Fix: `<<'PY'` plus
`s, n = re.subn(...); assert n == 1, f"ofelia mem_limit substitution matched {n} times"`.

**P28 — `node -e "require('./server.js'); process.exit(0)"` boot probes are weak and DB-touching.**
Ten occurrences in slice B, two in D11 Step 6 and its rollback. `process.exit(0)` fires synchronously after
`require` returns, so **any** failure on an async path — mongoose connect, `SystemConfig.initializeDefaults`,
port bind, background-job registration — is invisible and the probe prints `boot probe: 0`. Run from the
workstation it also loads the local `.env` (**[MEASURED]** it exists) and opens a connection to whatever
`MONGODB_URI` names. Fix: run the probe with `MONGODB_URI` pointed at a memory server and give it a tick —
`node -e "require('./server.js'); setTimeout(()=>{console.log('BOOT_OK');process.exit(0)},1500)"` with an
`unhandledRejection`/`uncaughtException` handler that exits 1.

**P29 — E6 Step 3 contains a foreground `sleep 660`,** which the plan's own note two lines later says is
blocked in this harness ("the project's lesson file records that a foreground `sleep` is blocked"). Remove
the `sleep` from the fenced block and replace it with the `Monitor` until-loop the note prescribes, or split
the verification into a separate step with a recorded timestamp. (Slice E §4 item 11 flags this too — it
should be fixed, not just flagged.)

**P30 — `/tmp/cf.html` staleness in the CF attribution loops** (A5 Step 6, A6 Step 3, A9 Step 6, A10 Step 3).
`curl -o /tmp/cf.html` does not truncate the file when the request fails outright, so a timed-out iteration
re-reads the previous body and reports a stale `content`/`portal` verdict. The `x-origin-box` column would be
blank for that row, which is a partial tell. Fix: `rm -f /tmp/cf.html` at the top of each iteration and treat
a missing file as `ERR`.

**P31 — Self-contradicting Expected counts in E10/E11.** E10 Step 1: *"Expected: … `7` tracked paths (6
files + the `termination-survival` tree resolves to 3 blobs → the `ls-tree -r` count is **6**)"* — the table
above it lists seven paths. E11 Step 1: *"Expected, six lines"* followed by five. An operator cannot tell a
pass from a fail. Fix both to a single unambiguous number.

**P32 — B15 Step 1 produces four lines, not two.**
`ssh … "grep -c '^QUARANTINE_NON_AUSTIN=true' … || echo 0"` — `grep -c` prints `0` **and** exits 1, so
`|| echo 0` prints a second `0`. Expected says "two lines each ending `0`". Fix:
`grep -c … ; true` or `awk`-based counting.

**P33 — More `$?`-after-a-pipeline.** Besides P5: slice C line 2097
`npx eslint server/ --rule '…' 2>&1 | tail -5; echo "EXIT=$?"` reports `tail`'s status. Use `${PIPESTATUS[0]}`
(slice A does this correctly three times).

**P34 — D11 Step 3's tag/clean-tree assertion does not gate the rsync.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git describe --exact-match --tags && git status --porcelain | wc -l
rsync -az --delete … ./ ubuntu@$IP:/var/www/crhs-web-core/
```
The `&&` chain ends at the newline, so an untagged HEAD or a dirty working tree is rsynced to production
anyway — `--delete`, into the tree both apps install from. Fix: one `set -e` block, or
`git describe --exact-match --tags && [ "$(git status --porcelain | wc -l)" = 0 ] && rsync …`.

**P35 — D11 Step 9's boot-marker assertion has no baseline.**
*"Expected: both boot-marker counts increased by the worker count of one reload"* — but Step 1 never records
the before-counts, so "increased by" is uncheckable. And `grep -h '"level":"error"' logs/combined.log | tail -5`
prints five lines on a healthy box too (whatever the last five historical errors were); the `cd` before it
also means only **corporate's** log is searched, not the portal's. Fix: capture both counts in Step 1, assert
the delta, and filter errors by timestamp (`awk -v t="$RELOAD_TS_AFF" '$0 > t'`).

---

# ASSERTIONS THAT CANNOT FAIL

Every check below returns the same output on a broken system as on a healthy one. Each is listed with the
finding that carries its fix.

| # | slice · task · step | the check | why it cannot fail | fix in |
|:--|:--|:--|:--|:--|
| 1 | E · E3 · Step 4 | `tail -n 200 logs/combined.log \| grep -ciE "FRONTEND_URL\|undefined/embed-app-v2" \|\| true` → `0` | the app never logs `FRONTEND_URL`; the `undefined/` form only appears if a reset email is minted in the 8 s after reload. `0` either way. | **P16** |
| 2 | A · A12 · Step 3 | `POOL wavemax-oci enabled=true origins=oci1,oci2` → "the pool returns to healthy" | `enabled` and `origins[].name` are static config; they print identically with both origins down. The five public curls that follow also pass with one origin dead. | **P13** |
| 3 | E · E8 · Step 3 | `docker ps --format "{{.Names}} {{.Status}}" \| sort \| head -20` → "every mailcow container `Up`" | `docker ps` cannot list a container that died — it vanishes, and every printed line still says `Up`. `head -20` also truncates. | **P17** |
| 4 | C · C10 · Step 4 | `node scripts/ensure-indexes.js --dry-run … \| tail -5; echo "AFF_EXIT=$?"` → `AFF_EXIT=0` | `$?` is `tail`'s status; `tail` always exits 0. Prints `AFF_EXIT=0` over a `FATAL:` connection failure. | **P5** |
| 5 | C · C-lint · line 2097 | `npx eslint server/ --rule '…' 2>&1 \| tail -5; echo "EXIT=$?"` | same pipeline-status bug. | **P33** |
| 6 | B · B8 · Step 1 | `curl -H 'Host: <marketing host>' http://127.0.0.1:3001/` → `200` as proof of a flip | **[MEASURED]** `:3001` answers 200 for all three marketing Hosts **today, unflipped** (slice A's own M17). 200 before and after. | **P10** |
| 7 | A · A11 · Step 2 | `mailcow_xfh=$(awk '/localhost:8443/,0' proxy-node-app.conf \| grep -c X-Forwarded-Host)` → `0` | **[MEASURED]** `proxy-node-app.conf` contains no `localhost:8443` line, so `awk` emits nothing and the count is structurally 0. | **P26** |
| 8 | A · every reload step | `systemctl is-active nginx` → `active`, and `nginx -T \| grep -c …` → `0` | `is-active` reports `active` whether or not the master accepted the new config; `nginx -T` reads the files on disk, not the running configuration. | **P22** |
| 9 | B/D · 12 sites | `node -e "require('./server.js'); process.exit(0)"; echo "boot probe: $?"` → `0` | `process.exit(0)` runs synchronously after `require` returns, so every async boot failure (mongo connect, config init, port bind) is invisible. Prints `0` on a server that could never actually start. | **P28** |

Borderline, listed for completeness but **not** counted above (they do discriminate, just weakly):
`E3 Step 5`'s `GET /embed-app-v2.html?route=/forgot-password` → `200` proves the SPA shell is served, not
that reset links are correct; `A11 Step 3`'s forged-header probe against a *flipped* host re-tests A4's
snippet rather than A11's change; `D11 Step 9`'s `grep '"level":"error"' | tail -5` returns five lines on a
healthy box (see P35).

---

# The single most dangerous command in the plan

```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "set -e
pm2 stop crhs-corporate >/dev/null 2>&1
…
grep -o '<title>[^<]*</title>' /tmp/d.html
…
pm2 start crhs-corporate >/dev/null 2>&1"
```
**Slice A, Task A12, Step 2.** It deliberately stops a production application to observe a failure page, and
then relies on an unprotected `grep` — under `set -e`, over an ssh link, with no `trap` — to reach the line
that starts it again. Any body that does not contain a `<title>`, any 8-second timeout, any dropped
connection, and oci1's content app stays down. `/health/origin` then returns 503, Cloudflare pulls oci1 from
the pool shared by **all five** load balancers (the portal included), and `crhsent.com` — which has no
`error_page` handler — serves bare 502s the whole time. One missing `trap … EXIT` separates a 15-second
diagnostic from a half-capacity estate.

---

## Cross-cutting recommendations

1. **Never build a shell variable name from a hostname.** P1 is one root cause with nine call sites.
   Add `HK=${H//./_}` to the slice conventions and use it everywhere, with `test -n` guards after every
   indirect expansion.
2. **Separate "verify" from "act" into different steps, always.** P4 and P6 are the same mistake; E3 and
   D11 already model the correct shape. A verification that shares a block with the action it guards is not
   a gate.
3. **Never gate on a byte count of a live page** (P8). Gate on the markers and the `/health` content type,
   and record byte counts as evidence.
4. **Every `:3000` probe carries `-H "X-Forwarded-Proto: https"`.** Put it in the slice conventions as a
   one-line rule, since slices A and E got it right 9/9 and slice D got it wrong 4/4 (P3).
5. **Make every transform `die` on a partial apply** (P14), so `set -e` halts before `nginx -t` rather than
   leaving a valid-but-wrong config behind a human-read echo line.
6. **Reconcile cross-slice artefact names before assembly** (P11, P12, P18): slice B gates on a file slice A
   never writes, on a host with no config, and on a corporate deploy no task performs.
