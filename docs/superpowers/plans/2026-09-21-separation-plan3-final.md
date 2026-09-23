# Plan 3 — the final separation plan

**Status:** assembled 2026-09-21, ready for execution review. **This is the last plan.** There is no
Plan 4: everything formerly deferred to it is absorbed here. Owner goal, verbatim: *"lets make sure
plan 3 will be our complete, last and final step. when we are done i want a clean deployment and
clear backlog so we can start developing new features."*

**Provenance.** Scope brief (`specs/2026-09-20-separation-plan3-scope-brief.md`, 10 corrections) →
five slices drafted in parallel (76 tasks) → two adversarial reviews (**69 findings, 8 severity-1**)
→ `drafts/ADJUDICATION.md` (15 binding rulings) → `drafts/SKELETON.md` (controller-owned ordering)
→ three assemblers → this document. Every severity-1 was re-verified against production before ruling.

**35 tasks, 6 phases.** Phase 0 prerequisites · Phase 1 the four host flips · Phase 2 post-flip
cleanup · Phase 3 web-core v0.3.0 · Phase 4 the absorbed Plan 4 · Phase 5 findings and closure.

---

## Conventions — these govern every task

1. **A dependency is ASSERTED or it does not exist.** Every `Interfaces: Consumes` row names the
   producing task AND the command that proves it, in a Step 0 gate that halts on failure. The parallel
   drafts had 27 of 38 dependencies as prose; the assembled plan has **0**.
2. **No byte-count discriminators.** Use the structural `APPID` test: `/health/origin` → 200 portal /
   404 content (route existence the content app cannot fake), `/health` content-type, and the
   `<aside class="ap-ticker"` body marker. A `len=` gate was already invalidated once by an unrelated
   one-line fix.
3. **Every `- Expected:` must differ on a broken system.** Ten assertions that could not fail were
   found and replaced; each replacement is falsified once — broken deliberately, seen to fail,
   restored — before it is trusted.
4. `:3000` probes carry `-H "X-Forwarded-Proto: https"`; `:3001` probes must NOT.
5. `nginx -t` before `systemctl reload nginx`; never `restart`; a failed test HALTS.
6. Any task stopping a service restores it under `trap … EXIT`. One box at a time, under `BOX_BUSY`.
7. Never `$?` after a pipe (always 0) — use `PIPESTATUS`.
8. No flag is trusted until grepped for in the target script.
9. Record keys are legal shell identifiers (`FLIP_atxwashateria_com_oci1`).
10. Rollbacks restore only their own scope, and never resurrect a deleted secret.

---
# Plan 3 — assembled Phases 0 and 1 (tasks 1–15): prerequisites and the nginx host flips

**Assembled 2026-09-21** from `SKELETON.md` (ordering, binding), `ADJUDICATION.md` (15 rulings, binding),
`plan3-sliceA-flips.md` (source material), `REVIEW-1-cross-slice.md`, `REVIEW-2-production-safety.md`,
and `docs/superpowers/specs/2026-09-20-separation-plan3-scope-brief.md` incl. its Corrections.

This is the production-critical half of Plan 3: it changes four live public websites. Task numbers are
the skeleton's and are not re-ordered or renumbered. Phase 2+ (tasks 16–35) is assembled separately.

---

## Assembly conventions — these bind every task below

### C-1. One record file, one vocabulary (REVIEW-1 structural fix; R-1)

`/var/www/wavemax/cutover-logs/plan3-record.env` on the **workstation** (measured: exists, mode 700,
owner `rickh`). Plan 2 convention: `printf '%s=%q\n' KEY value >> "$REC"`, read with
`set -a; . "$REC"; set +a`. **Every boolean value is `yes` or `no`. Never `PASS`.**

### C-2. Record keys are legal shell identifiers (R-4, P1)

A hostname is **never** interpolated into a variable name. Every task that keys on a host does:

```bash
HK=${H//./_}        # atxwashateria.com -> atxwashateria_com
```

and every indirect expansion is guarded:

```bash
V=FLIP_${HK}_oci1; TS=${!V}; test -n "$TS" || { echo "HALT: no recorded TS for $H/oci1"; exit 1; }
```

Verified failure without this: `FLIP_atxwashateria.com_oci1=…: command not found` on `source` (which
still returns 0), then `${!V}` → `invalid variable name`, then a rollback that `cp: cannot stat`s.

### C-3. Every `Consumes` entry is ASSERTED, in Step 0, and its failure HALTS (R-1)

Every task begins with a Step 0 that reads the record and asserts each `Consumes` row mechanically.
The shared helper, pasted at the top of each Step 0:

```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
FAIL=0
chk() { if [ "$2" = "$3" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=[$2] want=[$3]"; FAIL=1; fi; }
chkn() { if [ -n "$2" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=EMPTY"; FAIL=1; fi; }
```

and every Step 0 ends with the verdict line:

```bash
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```

A task whose Step 0 prints `gate=HALT` **stops there**. There are no prose preconditions anywhere in
this document; if a dependency is not asserted by a command it does not exist.

### C-4. The app discriminator is STRUCTURAL. No byte counts, ever (R-2, X3, P8)

Slice A hard-coded `len=27477` in 17 places. Measured 2026-09-21: the content app serves **27593** and
the portal's copy of the same page serves **25701** (both moved after the CLS fixes landed). A byte
count of a live page is not a discriminator.

**`APPID` — three independent structural facts, measured 2026-09-21 on oci1 for all three hosts:**

| probe | portal (`:3000`) | content app (`:3001`) | why it is structural |
|:--|:--|:--|:--|
| `GET /health/origin` | **200** | **404** | a **route-existence** test. `/health/origin` is defined in the portal's `server.js:445`; the content app has no such route and cannot fabricate one. |
| `GET /health` content-type + body | `text/html; charset=utf-8` (the `partnerLanding` catch-all swallows it on a marketing host) | `application/json; charset=utf-8`, body exactly `{"status":"ok"}` | different handler, different media type |
| body contains `<aside class="ap-ticker"` | **0** | **1** | the marquee rail (B-3) exists only in the content app's copy of the page. Verified absent from the portal's copy on **all three hosts including `atxwashdryfold.com`**, where the two pages are otherwise near-identical. |

All three must agree. `plan3-verify-host.sh` (Task 8) computes `app=content|portal|AMBIGUOUS` from
them and exits 2 on `AMBIGUOUS`. Byte counts are recorded as **evidence** (`root_bytes=…`) and are
never compared against a literal.

Two further structural behaviour changes are asserted per flip: `/austin-tx/` 200 → **404**, and
`/embed-app-v2.html` 200 → **301**.

### C-5. Probe rules (R-5, fifth occurrence of this defect class)

- Every on-box probe to `:3000` carries `-H "X-Forwarded-Proto: https"`. Without it `/health` returns
  **302** and `embed-app-v2.html` returns an empty body.
- `:3001` does **not** redirect and must **NOT** carry it.
- Probes through nginx on `:443` (`--resolve <host>:443:127.0.0.1`) need neither — nginx sets it.

### C-5b. `grep -c … || echo 0` prints TWO values

`grep -c` prints `0` **and** exits 1 when nothing matches, so `|| echo 0` emits a second line and every
positional-parameter offset after it shifts. Where a count must be tolerant of "no match", this plan
uses `grep -l … | wc -l`, or ends the pipeline with `; true`, never `|| echo 0`.

### C-6. Never `$?` after a pipe (R-6)

`$?` after a pipeline is the last element's status and is always `0` for `tee`/`tail`. Use
`${PIPESTATUS[0]}`, captured on the very next line, or do not pipe.

### C-7. nginx rules

- `sudo nginx -t && sudo systemctl reload nginx` in **one** `set -e` block, never two steps (P21).
- **Never** `systemctl restart`.
- A failed `nginx -t` HALTS and the task's Rollback runs.
- Every config edit asserts a **line-count delta AND brace balance AND server-block count** — a
  drafter's own `/s` regex once ate 59 lines while every `grep -c` assertion still passed.
- `systemctl is-active nginx` and `nginx -T | grep -c` are **forbidden as verdicts** (P22): `is-active`
  says `active` whether or not the master accepted the config and `nginx -T` reads the files on disk.
  The reload is proven by the **worker start time moving** plus the behavioural probes.

### C-8. Every transform `die`s on a partial apply, and leaves the file untouched (P14)

All three perl transforms count their substitutions and refuse unless the apply is all-or-nothing.
`perl -0pi` writes through a temp file and renames only on success, so a `die` leaves the original
byte-identical. **Falsified during assembly** against byte-copies of the live oci1 files:

```
reworded rewrite anchor -> plan3-flip: partial apply (comment=1 rewrite=0 include=1 apexcomment=1 flipped=1) - refusing, file NOT modified
                           rc=255  untouched=yes  content_snip=0  rewrite_left=1
```

### C-9. One box degraded at a time — the `BOX_BUSY` lock (X32)

Any task that stops or reloads an application writes `BOX_BUSY=<box>` to the record before and
`BOX_BUSY=` after, and asserts it empty first. Tasks 1, 2, 3 and 15 all reload an app.

### C-10. Any task that stops a service restores it under `trap … EXIT` (R-3, P2)

The remote shell installs `trap 'pm2 start <app> >/dev/null 2>&1 || true' EXIT INT TERM` **before**
the stop, and every grep inside the window is `|| true`-protected. Without it, one unprotected grep
under `set -e` leaves the content app down, `/health/origin` 503s, and Cloudflare pulls the box from
the pool shared by **all five** load balancers — the portal included.

### C-11. Rollbacks are scoped to what the task changed (R-12, X16)

A per-host flip rollback restores **only that host's own vhost file**. A whole-file/whole-set restore
that would un-flip a different host is refused with `REFUSE <file> — flipped; roll that flip back first`.

### C-12. The C14 gate

- **C14 is already CLEARED (R-10).** `crhs-corporate d8c421b` + affiliate `e5c103ef` are deployed.
  Measured 2026-09-21 from a **non-allowlisted vantage** (PSI): `https://atxwashdryfold.com/` mobile
  `performance=99 accessibility=100 best-practices=100 seo=100`, CLS `0`. Task 7 records this as
  evidence. **No task re-gates on it.**
- **C14-abs (after each flip):** all four categories **≥ 95**, mobile and desktop.
- **C14-stab:** across 3 mobile runs the Performance spread must be **≤ 5** — widened from slice A's
  `≤ 3` because `LIGHTHOUSE-QUALITY-BAR.md` itself documents "±3–5 on mobile is normal" (P20); a
  `≤ 3` gate blocks a host on ordinary noise.
- **C14-reg (`atxwashdryfold.com` only):** no category may drop below its Task 7 before value.
- The two placeholder hosts' "before" numbers are **evidence of what the public saw**, never a
  threshold: the `noindex` placeholder fails `is-crawlable`, so its SEO can never reach 100.

### C-13. Measurement vantage (R-15, P9)

The workstation egress `70.114.167.145` is the default `PARTNER_PREVIEW_ALLOWLIST` value
(`partnerLanding.js:82`, and the key is **not** set in either `.env`, so the code default applies).
**Measured 2026-09-21 — the workstation does not see what the public sees:**

```
workstation (70.114.167.145):  all three hosts  comingsoon=0 partner=1   (~26107 B)
oci1        (161.153.71.201):  atxwashateria    comingsoon=1 partner=0   (~1134 B)
                               rundberglaundry  comingsoon=1 partner=0   (~1134 B)
                               atxwashdryfold   comingsoon=0 partner=1   (~26107 B)
```
The discriminator is `comingsoon`/`partner`, not the byte count (C-4).

So: **public-state probes run from a box; Lighthouse runs through PSI** (Google's own infrastructure,
non-allowlisted by construction). Task 7 proves the vantage structurally rather than assuming it.

### C-14. Host and box constants

```
oci1 = 161.153.71.201   X-Origin-Box: oci-phx
oci2 = 144.24.4.202     X-Origin-Box: oci-phx-ad1
ssh  = ssh -i ~/.ssh/oci_wavemax ubuntu@<ip>          (sudo -n works for ubuntu; verified)
```

Flip order: **`atxwashateria.com` → `rundberglaundry.com` → `atxwashdryfold.com`**, oci1 then oci2 per
host, second box immediately after the first verifies. A host is never left half-flipped across a break.

`runberglaundry.com` is **not** a flip candidate: no `sites-enabled` file, no `default_server` (both
verified on both boxes), so it 301s to `atxwashateria.com` by alphabetical fall-through and is served
transitively once that host flips. Task 14 proves that.

**`/etc/nginx/snippets/proxy-node-app.conf` hardcodes `:3000` and is included by
`portal.atxwashdryfold.com`. Its `proxy_pass` is NEVER edited.** Task 6 adds one header line to it and
nothing else.

---

## Phase 0 — prerequisites. Nothing public changes. All of it gates Phase 1.

### Task 1: Corporate deploy mechanism — rsync from a tagged export, per box, with a verified snapshot

The corporate app has **no deploy path**. `/var/www/crhs-corporate/.git` is absent on **both** boxes
(verified), slice D rsyncs only `crhs-web-core`, and slice A called corporate deployment out of scope —
yet three flips gate on a corporate code change (Task 3). R-7/P12.

**Measured 2026-09-21, and this is why the task must run first:** both boxes carry 171 files and
differ from `crhs-corporate` HEAD `d8c421b` in **exactly one file**, `server.js`, whose md5 matches
commit `c636bf5`. The CLS fix `d8c421b` reached the boxes as a **hand-copied single file**; commit
`67f97ad` ("flush the logger before exit so a refused boot survives in the log files") was never
deployed. Task 1's first rsync therefore also delivers `67f97ad`, which changes the **boot-refusal**
path only. That is declared, asserted and boot-verified here rather than discovered during a flip.

**Files:**
- Creates `/var/www/wavemax/cutover-logs/plan3-record.env` (workstation).
- Creates `/tmp/plan3-corp-export` (workstation, from `git archive` — never the working tree).
- Per box: creates `~/deploy-snapshots/crhs-corporate-<TS>.tgz`; modifies `/var/www/crhs-corporate/`
  (code only — `.env`, `node_modules`, `logs` excluded).

**Interfaces:**
- **Consumes** (each asserted in Step 0/1, failure HALTS):
  - `CORP_SRC=/mnt/c/Users/rickh/GitHub/crhs-corporate` exists and is a git repo → Step 0 `chkn CORP_SHA`.
  - The corporate working tree has **no modified tracked files** → Step 0 `chk corp_tracked_dirty 0 0`.
  - `/var/www/crhs-corporate/.git` is **absent** on both boxes (rsync is the only path) → Step 1.
  - `pm2` runs `crhs-corporate` as `ubuntu`, 2 workers online per box → Step 1.
  - `BOX_BUSY` is empty → Step 0.
- **Produces:** `CORP_SRC`, `CORP_SHA`, `CORP_FILES`, `CORP_SNAP_TS_<box>`, `CORP_DEPLOYED_<box>=yes`,
  `CORP_MANIFEST_MD5` (the tree manifest hash, identical on both boxes).
- Blast radius while broken: `crhsent.com` and the three marketing hosts' *future* content on this box
  only; the portal is untouched (`:3000`). The CF monitor fails the box over if `:3001` stops serving.

**Rollback (exact).**
```bash
BOX=oci1; IP=161.153.71.201        # or BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
V=CORP_SNAP_TS_$BOX; TS=${!V}; test -n "$TS" || { echo "HALT: no snapshot TS for $BOX"; exit 1; }
echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
test -f ~/deploy-snapshots/crhs-corporate-$TS.tgz
R=\$(mktemp -d); tar -C \"\$R\" -xzf ~/deploy-snapshots/crhs-corporate-$TS.tgz
rsync -a --delete --exclude node_modules --exclude logs --exclude .env \"\$R/crhs-corporate/\" /var/www/crhs-corporate/
rm -rf \"\$R\"
test -s /var/www/crhs-corporate/.env && echo env-intact
md5sum /var/www/crhs-corporate/server.js
pm2 reload crhs-corporate --update-env >/dev/null
sleep 8
curl -s -H 'Host: crhsent.com' http://127.0.0.1:3001/health; echo
curl -s -o /dev/null -w 'health-origin %{http_code}\n' -H 'Host: portal.atxwashdryfold.com' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/health/origin
pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s))if(p.name===\"crhs-corporate\")console.log(\"worker status=\"+p.pm2_env.status)})'"
```
- Rollback expected: `TS=<value>`, `env-intact`, `2e4cb88eb346e229652e87d7feef8461  /var/www/crhs-corporate/server.js`
  (the pre-Task-1 `c636bf5` server.js), `{"status":"ok"}`, `health-origin 200`, then two
  `worker status=online` lines.
- Rolling Task 1 back after Task 3 has deployed re-opens the legal-page 404s on every flipped host.
  **Roll the flips back first** (Task 14 → 13 → 12 → 11 → 10 → 9 rollbacks), then Task 3, then this.

- [ ] **Step 0: Create the record; assert the workstation preconditions.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env
mkdir -p "$EV/lighthouse"; touch "$REC"; chmod 600 "$REC"
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
set -a; . "$REC"; set +a
FAIL=0
chk() { if [ "$2" = "$3" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=[$2] want=[$3]"; FAIL=1; fi; }
chkn() { if [ -n "$2" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=EMPTY"; FAIL=1; fi; }
SRC=/mnt/c/Users/rickh/GitHub/crhs-corporate
chk   corp_repo        "$(test -d "$SRC/.git" && echo yes || echo no)" yes
SHA=$(git -C "$SRC" rev-parse --short HEAD)
chkn  CORP_SHA         "$SHA"
chk   corp_tracked_dirty "$(git -C "$SRC" status --porcelain --untracked-files=no | wc -l)" 0
chk   box_busy         "${BOX_BUSY:-}" ""
echo "  untracked (excluded by git archive, shown so it is not a surprise):"
git -C "$SRC" status --porcelain --untracked-files=normal | grep '^??' || echo "    (none)"
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
rec CORP_SRC "$SRC"; rec CORP_SHA "$SHA"
```
  - Expected, exactly: `OK corp_repo=yes`, `OK CORP_SHA=d8c421b`, `OK corp_tracked_dirty=0`,
    `OK box_busy=`, then the untracked listing — today one line,
    `?? "content/atxwashdryfold/C:\\Users\\rickh\\AppData\\Local\\lighthouse.52689263/"` (a Windows
    Lighthouse temp directory inside the content tree) — then `gate=PASS`.
  - **That untracked directory is the reason this task exports with `git archive` and never rsyncs the
    working tree.** A working-tree rsync would publish it into `content/atxwashdryfold/`.
  - `gate=HALT`, or a *modified tracked* file, is a STOP: commit or stash it first.

- [ ] **Step 1: Assert the box preconditions and capture the exact pre-deploy divergence.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; SRC=/mnt/c/Users/rickh/GitHub/crhs-corporate
W=/tmp/plan3-corp-export; rm -rf "$W"; mkdir -p "$W"
git -C "$SRC" archive HEAD | tar -x -C "$W"
echo "export_files=$(find "$W" -type f | wc -l) env_absent=$(test ! -e "$W/.env" && echo yes || echo no)"
cd "$W" && find . -type f | sort | while read -r f; do printf '%s %s\n' "$(md5sum < "$f" | cut -d' ' -f1)" "$f"; done > "$EV/corp-head-md5.txt"
for IP in 161.153.71.201 144.24.4.202; do
  echo "##### $IP"
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'test -e /var/www/crhs-corporate/.git && echo "  git=PRESENT" || echo "  git=absent"
    pm2 jlist | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const w=JSON.parse(s).filter(p=>p.name===\"crhs-corporate\");console.log(\"  workers=\"+w.length+\" online=\"+w.filter(p=>p.pm2_env.status===\"online\").length+\" user=\"+(w[0]&&w[0].pm2_env.username))})"'
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate && find . -type f -not -path "./node_modules/*" -not -path "./logs/*" -not -name ".env" | sort | while read -r f; do printf "%s %s\n" "$(md5sum < "$f" | cut -d" " -f1)" "$f"; done' > "$EV/corp-box-$IP.txt"
  echo "  box_files=$(wc -l < "$EV/corp-box-$IP.txt")"
  echo "  differs_from_head:"; join -j 2 <(sort -k2 "$EV/corp-head-md5.txt") <(sort -k2 "$EV/corp-box-$IP.txt") | awk '$2!=$3{print "    "$1}'
  echo "  DIVERGENCE_END"
done
```
  - Expected, per box, exactly: `git=absent`, `workers=2 online=2 user=ubuntu`, `box_files=171`,
    then `differs_from_head:` followed by exactly one line `./server.js`, then `DIVERGENCE_END`.
  - `export_files=171 env_absent=yes` from the first block.
  - **`git=PRESENT` is a STOP** — the premise that rsync is the only path has changed.
  - **Any file other than `./server.js` in the divergence is a STOP.** `./server.js` is the known,
    measured, undeployed commit `67f97ad`; anything else is box-only content this rsync would destroy.
  - An **empty** divergence is also a STOP: it would mean `67f97ad` is already on the box and this
    task's premise (and its rollback md5) no longer hold — re-derive before proceeding.

- [ ] **Step 2: Show exactly what `67f97ad` will change, so the deploy is not a surprise.**
```bash
SRC=/mnt/c/Users/rickh/GitHub/crhs-corporate
git -C "$SRC" log --oneline -1 67f97ad
git -C "$SRC" show 67f97ad --stat --format='' 
git -C "$SRC" show 67f97ad -- server.js | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | head -20
```
  - Expected: `67f97ad fix(boot): flush the logger before exit so a refused boot survives in the log files`,
    a stat naming `server.js` only, then a diff that **removes one `process.exit(1);`** and adds a
    `setTimeout(bail, 750).unref()` + `wc.logger.on('finish', bail)` block.
  - The change is confined to the **boot-refusal** path (a mismatched mail identity or a missing
    template root). It cannot alter request handling. If the diff touches anything else — STOP.

- [ ] **Step 3: Snapshot the box tree, take the `BOX_BUSY` lock.**
```bash
BOX=oci1; IP=161.153.71.201        # Pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
set -a; . "$REC"; set +a
test -z "${BOX_BUSY:-}" || { echo "HALT: BOX_BUSY=$BOX_BUSY"; exit 1; }
rec BOX_BUSY "$BOX"
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y%m%dT%H%M%SZ'); rec "CORP_SNAP_TS_$BOX" "$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
mkdir -p ~/deploy-snapshots && chmod 700 ~/deploy-snapshots
tar -C /var/www --exclude=crhs-corporate/node_modules --exclude=crhs-corporate/logs -czf ~/deploy-snapshots/crhs-corporate-$TS.tgz crhs-corporate
ls -l ~/deploy-snapshots/crhs-corporate-$TS.tgz | awk '{print \"  snapshot_bytes=\"\$5}'
tar -tzf ~/deploy-snapshots/crhs-corporate-$TS.tgz | grep -c '^crhs-corporate/'
tar -tzf ~/deploy-snapshots/crhs-corporate-$TS.tgz | grep -c '^crhs-corporate/.env\$'"
echo "BOX=$BOX TS=$TS"
```
  - Expected: `snapshot_bytes=<n>` well above `1000000`, a member count `> 171`, then `1`
    (the `.env` **is** inside the snapshot, which is what makes the rollback complete), then
    `BOX=oci1 TS=<YYYYMMDDTHHMMSSZ>`.
  - A member count of `0` or a tar error is a STOP — do not rsync without a snapshot.

- [ ] **Step 4: Dry-run the rsync and assert it deletes nothing.**
```bash
BOX=oci1; IP=161.153.71.201
EV=/var/www/wavemax/cutover-logs; W=/tmp/plan3-corp-export
rsync -azn --delete --itemize-changes --exclude node_modules --exclude .git --exclude logs \
  --exclude coverage --exclude .env -e 'ssh -i ~/.ssh/oci_wavemax' "$W/" ubuntu@$IP:/var/www/crhs-corporate/ \
  > "$EV/corp-rsync-dryrun-$BOX.txt"
echo "rsync_dryrun_exit=$?"   # no pipeline here, so $? is the rsync status
echo "deletes:"; awk '$1=="*deleting"{print "  "$2}' "$EV/corp-rsync-dryrun-$BOX.txt"; echo "DELETES_END"
echo "content_changes:"; grep -E '^[<>][fd].[sc]' "$EV/corp-rsync-dryrun-$BOX.txt" | awk '{print "  "$1" "$2}'; echo "CHANGES_END"
```
  - Expected, exactly: `rsync_dryrun_exit=0`; `deletes:` immediately followed by `DELETES_END` with
    **nothing between them**; then `content_changes:` followed by exactly one line
    `<f.st...... server.js` and `CHANGES_END`.
  - **Any deletion is a STOP** — it is box-only content the snapshot holds but the rsync would remove.
  - **Any second content change is a STOP** — it is not the `67f97ad` divergence Step 1 measured.

- [ ] **Step 5: rsync for real, then prove `.env` survived and the divergence closed.**
```bash
BOX=oci1; IP=161.153.71.201
EV=/var/www/wavemax/cutover-logs; W=/tmp/plan3-corp-export
rsync -az --delete --exclude node_modules --exclude .git --exclude logs --exclude coverage --exclude .env \
  -e 'ssh -i ~/.ssh/oci_wavemax' "$W/" ubuntu@$IP:/var/www/crhs-corporate/; echo "rsync_exit=$?"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate
  echo "  env_bytes=$(wc -c < .env) env_mode=$(stat -c %a .env) owner=$(stat -c %U .env)"
  echo "  files=$(find . -type f -not -path "./node_modules/*" -not -path "./logs/*" -not -name ".env" | wc -l)"
  md5sum server.js | sed "s/^/  /"'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate && find . -type f -not -path "./node_modules/*" -not -path "./logs/*" -not -name ".env" | sort | while read -r f; do printf "%s %s\n" "$(md5sum < "$f" | cut -d" " -f1)" "$f"; done' > "$EV/corp-box-after-md5-$BOX.txt"
echo "  differs_from_head:"; join -j 2 <(sort -k2 "$EV/corp-head-md5.txt") <(sort -k2 "$EV/corp-box-after-md5-$BOX.txt") | awk '$2!=$3{print "    "$1}'; echo "  DIVERGENCE_END"
```
  - Expected: `rsync_exit=0`; `env_bytes=5410 env_mode=600 owner=ubuntu`; `files=171`;
    `718b37547c338d983b7e1faf4948c5af  server.js` (the HEAD `server.js` — it changed;
    the pre-Task-1 value was `2e4cb88eb346e229652e87d7feef8461`);
    then `differs_from_head:` immediately followed by `DIVERGENCE_END`, **nothing between**.
  - `env_bytes=0`, a missing `.env`, or a non-empty divergence is a STOP → run the Rollback.

- [ ] **Step 6: Reload corporate and verify the boot — this is where `67f97ad` lands.**
```bash
BOX=oci1; IP=161.153.71.201
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
B4=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 jlist' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const w=JSON.parse(s).filter(p=>p.name==="crhs-corporate");console.log(w.map(p=>p.pm2_env.restart_time).join(","))})')
echo "restarts_before=$B4"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
cd /var/www/crhs-corporate
node -e 'require(\"dotenv\").config();require(\"./server/bootMail\").assertMailConfig();console.log(\"MAIL_CONFIG_OK\")'
pm2 reload crhs-corporate --update-env >/dev/null
sleep 10
echo -n '  crhsent /health -> '; curl -s -H 'Host: crhsent.com' http://127.0.0.1:3001/health; echo
echo -n '  crhsent /       -> '; curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: crhsent.com' http://127.0.0.1:3001/
echo -n '  health/origin   -> '; curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: portal.atxwashdryfold.com' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/health/origin
echo -n '  marketing :3001 -> '; curl -s -o /dev/null -w '%{http_code} ticker=' -H 'Host: atxwashdryfold.com' http://127.0.0.1:3001/; curl -s -H 'Host: atxwashdryfold.com' http://127.0.0.1:3001/ | grep -c '<aside class=\"ap-ticker\"'
grep -c 'BOOT REFUSED\|level\":\"error' logs/combined.log | tail -1 || true"
A4=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 jlist' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const w=JSON.parse(s).filter(p=>p.name==="crhs-corporate");console.log(w.map(p=>p.pm2_env.status+":"+p.pm2_env.restart_time).join(","))})')
echo "after=$A4"
rec "CORP_DEPLOYED_$BOX" yes; rec BOX_BUSY ""
```
  - Expected: `restarts_before=1,1`; `MAIL_CONFIG_OK`; `crhsent /health -> {"status":"ok"}`;
    `crhsent / -> 401` (the content app's own accessGate — it must still be there);
    `health/origin -> 200`; `marketing :3001 -> 200 ticker=1`; then
    `after=online:2,online:2` — **both workers `online` and each `restart_time` exactly one higher
    than before**.
  - A `restart_time` that jumped by more than one, or a worker not `online`, means the reload
    crash-looped: run the Rollback.
  - `health/origin -> 503` means this box is advertising itself as degraded to all five LBs: Rollback.

- [ ] **Step 7: Pass 2 on oci2, then assert both boxes are byte-identical.**
      Repeat Steps 3–6 with `BOX=oci2; IP=144.24.4.202`. Start only after Step 6 recorded
      `CORP_DEPLOYED_oci1=yes` and cleared `BOX_BUSY` (C-9: one box degraded at a time).
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
echo "deployed oci1=$CORP_DEPLOYED_oci1 oci2=$CORP_DEPLOYED_oci2 box_busy=[${BOX_BUSY:-}]"
M=$(md5sum < "$EV/corp-box-after-md5-oci1.txt" | cut -d' ' -f1)
N=$(md5sum < "$EV/corp-box-after-md5-oci2.txt" | cut -d' ' -f1)
H=$(md5sum < "$EV/corp-head-md5.txt" | cut -d' ' -f1)
echo "manifest oci1=$M oci2=$N head=$H identical=$([ "$M" = "$N" ] && [ "$M" = "$H" ] && echo yes || echo NO)"
rec CORP_FILES 171; rec CORP_MANIFEST_MD5 "$M"
```
  - Expected: `deployed oci1=yes oci2=yes box_busy=[]`, then `identical=yes` with all three manifest
    hashes equal.
  - `identical=NO` is a STOP: the two boxes are not running the same corporate code, and every
    subsequent per-box assertion becomes meaningless.

---

### Task 2: `INTEREST_FORM_URL` — assign the owner, set it on both boxes and in `.env.example`, assert the SERVED link

R-8/X1. **Verified 2026-09-21:** `INTEREST_FORM_URL` is absent from the production `.env` on both boxes
**and** from `.env.example`. `server/config/links.js:17` falls back to `/affiliate`, and the portal
serves `<meta name="interest-form-url" content="/affiliate">` today — the fallback, which B1's test
passes on. The owner is assigned here: **`https://atxwashdryfold.com/affiliate`** (decision D8, the
canonical content host). The content app already serves that page (verified: `:3001/affiliate` → 200,
`<title>Get paid to run laundry for your dorm — atxwashdryfold (UT Austin)</title>`).

**Files:**
- Per box: `/var/www/wavemax/wavemax-affiliate-program/.env` (+1 line), snapshot to
  `/var/www/wavemax/env-backups/.env.<TS>` first.
- Repo `wavemax-affiliate-program`: `.env.example` (+1 documented key) and a test that pins it.

**Interfaces:**
- **Consumes** (asserted, Step 0):
  - `CORP_DEPLOYED_oci1=yes` and `CORP_DEPLOYED_oci2=yes` (Task 1) — the link's target is served by
    the corporate app, so corporate must be the deployed tree before the link points at it.
  - `BOX_BUSY` empty (C-9).
  - `GET https://atxwashdryfold.com/affiliate` resolves `200` publicly **from a box** (C-13 vantage).
- **Produces:** `INTEREST_FORM_URL_SET=yes`, `IFU_SNAP_TS_<box>`.

**Rollback (exact).** Restore the `.env` from its own pre-Task-2 backup — never a whole-estate backup
(R-11: a pre-purge `.env` restore would re-plant the 27-line `DOCUSIGN_PRIVATE_KEY`).
```bash
BOX=oci1; IP=161.153.71.201        # or BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
V=IFU_SNAP_TS_$BOX; TS=${!V}; test -n "$TS" || { echo "HALT: no IFU snapshot TS for $BOX"; exit 1; }
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
D=/var/www/wavemax/wavemax-affiliate-program
test -f /var/www/wavemax/env-backups/.env.$TS
grep -c 'PRIVATE KEY' /var/www/wavemax/env-backups/.env.$TS || true
cp /var/www/wavemax/env-backups/.env.$TS \$D/.env
echo \"  lines=\$(wc -l < \$D/.env) ifu=\$(grep -c '^INTEREST_FORM_URL=' \$D/.env || true)\"
pm2 reload wavemax --update-env >/dev/null; sleep 8
curl -s -H 'Host: portal.atxwashdryfold.com' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/embed-app-v2.html | grep -o '<meta name=\"interest-form-url\"[^>]*>'"
```
- Rollback expected: a `PRIVATE KEY` count of **`0`** (the backup is post-purge — if it is non-zero,
  **abort the rollback** and escalate: restoring would re-plant a live credential), then
  `lines=<n> ifu=0`, then `<meta name="interest-form-url" content="/affiliate">`.

- [ ] **Step 0: Assert the Consumes.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
FAIL=0
chk() { if [ "$2" = "$3" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=[$2] want=[$3]"; FAIL=1; fi; }
chk corp_oci1 "${CORP_DEPLOYED_oci1:-}" yes
chk corp_oci2 "${CORP_DEPLOYED_oci2:-}" yes
chk box_busy  "${BOX_BUSY:-}"           ""
chk target_public "$(ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "curl -s -o /dev/null -m 20 -w '%{http_code}' "https://atxwashdryfold.com/affiliate?p=\$(date +%s)"")" 200
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: four `OK` lines then `gate=PASS`.
  - The `target_public` probe runs **from oci1**, not the workstation (C-13).

- [ ] **Step 1: Assert the broken state first, so the fix is falsifiable.**
```bash
for IP in 161.153.71.201 144.24.4.202; do
  printf '%-16s ' "$IP"
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'D=/var/www/wavemax/wavemax-affiliate-program
    printf "env_ifu=%s served=" "$(grep -c "^INTEREST_FORM_URL=" $D/.env || true)"
    curl -s -H "Host: portal.atxwashdryfold.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/embed-app-v2.html | grep -o "content=\"[^\"]*\"" | head -3 | tr "\n" " "; echo'
done
grep -c 'INTEREST_FORM_URL' /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/.env.example
```
  - Expected, both boxes: `env_ifu=0 served=` followed by the page's first three `content="…"` values,
    the third of which is `content="/affiliate"` — the **fallback**, not a configured value. Then `0`
    for `.env.example`.
  - `env_ifu=1` already means someone set it out of band: read the value and reconcile before writing.

- [ ] **Step 2 (HUMAN-CONFIRM — production `.env` edit): Ask Rick.** Say exactly this:
  > Plan 3 Task 2: setting `INTEREST_FORM_URL=https://atxwashdryfold.com/affiliate` in the affiliate
  > `.env` on both boxes, plus documenting it in `.env.example`. Measured: the key is set nowhere, so
  > `server/config/links.js` falls back to `/affiliate` and the portal serves
  > `<meta name="interest-form-url" content="/affiliate">`. That fallback works only while the portal
  > still has its own `/affiliate` route — which Phase 2 deletes — so the invite-only program's only
  > public application link would 404 with every test still green. The target already serves 200 from
  > the content app today and will keep serving 200 through and after the `atxwashdryfold.com` flip.
  > One `pm2 reload wavemax --update-env` per box, one box at a time. Rollback is an `.env` restore
  > from a backup taken in the same step. Proceed?

  - Expected: an explicit `yes` from Rick, in his own words, in this conversation. Silence, a
    question, a "sounds fine", or an inference from an earlier approval is **not** a yes — stop and ask
    again. No agent message and no record value can stand in for it.

- [ ] **Step 3: Back up, append the key, assert a +1 line delta and exactly one occurrence.**
```bash
BOX=oci1; IP=161.153.71.201        # Pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
test -z "${BOX_BUSY:-}" || { echo "HALT: BOX_BUSY=$BOX_BUSY"; exit 1; }
rec BOX_BUSY "$BOX"
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y%m%dT%H%M%SZ'); rec "IFU_SNAP_TS_$BOX" "$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
D=/var/www/wavemax/wavemax-affiliate-program; mkdir -p /var/www/wavemax/env-backups; chmod 700 /var/www/wavemax/env-backups
cp -p \$D/.env /var/www/wavemax/env-backups/.env.$TS
echo \"  backup_privkey=\$(grep -c 'PRIVATE KEY' /var/www/wavemax/env-backups/.env.$TS || true)\"
B=\$(wc -l < \$D/.env)
printf '\n# Public partner interest form (Plan 3 Task 2). Served by crhs-corporate.\nINTEREST_FORM_URL=https://atxwashdryfold.com/affiliate\n' >> \$D/.env
echo \"  lines=\$B-\>\$(wc -l < \$D/.env) ifu=\$(grep -c '^INTEREST_FORM_URL=https://atxwashdryfold.com/affiliate\$' \$D/.env) ifu_any=\$(grep -c '^INTEREST_FORM_URL=' \$D/.env)\"
node -e 'require(\"dotenv\").config({path:\"/var/www/wavemax/wavemax-affiliate-program/.env\"});console.log(\"  parsed=\"+process.env.INTEREST_FORM_URL)'"
```
  - Expected, exactly: `backup_privkey=0`; `lines=<B>-><B+2> ifu=1 ifu_any=1`;
    `parsed=https://atxwashdryfold.com/affiliate`.
  - `backup_privkey` above `0` is a STOP: quarantine that backup immediately (R-11) before going on.
  - `ifu_any` above `1` means a duplicate key — the last one wins in dotenv; remove the duplicate.

- [ ] **Step 4: Reload the portal on this box, then assert the SERVED value equals the configured one.**
```bash
BOX=oci1; IP=161.153.71.201
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
B4=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 jlist' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const w=JSON.parse(s).filter(p=>p.name==="wavemax");console.log(w.map(p=>p.pm2_env.restart_time).join(","))})')
echo "restarts_before=$B4"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
pm2 reload wavemax --update-env >/dev/null; sleep 10
echo -n '  portal /health -> '; curl -s -H 'Host: portal.atxwashdryfold.com' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/health; echo
echo -n '  served meta    -> '; curl -s -H 'Host: portal.atxwashdryfold.com' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/embed-app-v2.html | grep -o '<meta name=\"interest-form-url\" content=\"[^\"]*\">'
echo -n '  link target    -> '; curl -s -o /dev/null -m 20 -w '%{http_code}\n' "https://atxwashdryfold.com/affiliate?p=\$(date +%s)""
A4=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 jlist' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const w=JSON.parse(s).filter(p=>p.name==="wavemax");console.log(w.map(p=>p.pm2_env.status+":"+p.pm2_env.restart_time).join(","))})')
echo "after=$A4"; rec BOX_BUSY ""
```
  - Expected: `portal /health -> {"status":"UP",…}`;
    `served meta -> <meta name="interest-form-url" content="https://atxwashdryfold.com/affiliate">`
    — the **configured** URL, not `/affiliate` and not empty (R-8 says explicitly: not merely
    non-empty); `link target -> 200`; `after=online:<n+1>,online:<n+1>`.
  - A served value of `/affiliate` means dotenv did not pick the key up — the reload merged the old
    environment. Re-run with `pm2 reload wavemax --update-env` and re-check before continuing.

- [ ] **Step 5: Pass 2 on oci2, then both boxes together.**
      Repeat Steps 3–4 with `BOX=oci2; IP=144.24.4.202`.
```bash
for IP in 161.153.71.201 144.24.4.202; do
  printf '%-16s ' "$IP"
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "grep -c '^INTEREST_FORM_URL=https://atxwashdryfold.com/affiliate\$' /var/www/wavemax/wavemax-affiliate-program/.env; curl -s -H 'Host: portal.atxwashdryfold.com' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/embed-app-v2.html | grep -o 'interest-form-url\" content=\"[^\"]*\"'" | tr '\n' ' '; echo
done
```
  - Expected: two lines, each `1 interest-form-url" content="https://atxwashdryfold.com/affiliate"`.

- [ ] **Step 6: Document the key in `.env.example`, test-first.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
# 6a. Write the failing test FIRST (tests/unit/envExample.test.js):
#     it('documents INTEREST_FORM_URL in .env.example', ...) reading .env.example and
#     expecting /^INTEREST_FORM_URL=/m.
npx jest tests/unit/envExample.test.js 2>&1 | tail -8
```
  - Expected **before** the fix: `Tests: 1 failed, 1 total` naming `INTEREST_FORM_URL`.
    `Tests: 0 total` means the test was not written — **STOP** (P18: a jest run with no matching test
    exits non-zero and superficially resembles a red).
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
printf '\n# Public partner interest form. Absolute URL on the content origin — the portal\n# login page links here because the affiliate program is invite-only.\nINTEREST_FORM_URL=https://atxwashdryfold.com/affiliate\n' >> .env.example
npx jest tests/unit/envExample.test.js 2>&1 | tail -6
grep -c '^INTEREST_FORM_URL=' .env.example
```
  - Expected: `Tests: 1 passed, 1 total`, then `1`.

- [ ] **Step 7: Record, and record the measured residual hole rather than discovering it in Phase 2.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
rec INTEREST_FORM_URL_SET yes
rec IFU_VALUE 'https://atxwashdryfold.com/affiliate'
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'echo -n "direct_login_page_meta_count="; curl -s -H "Host: portal.atxwashdryfold.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/affiliate-login-embed.html | grep -c "interest-form-url" || true'
grep -c '^INTEREST_FORM_URL_SET=yes$' "$REC"
```
  - Expected: `direct_login_page_meta_count=0`, then `1`.
  - **Recorded escalation (measured, not a Phase 0/1 defect):** `/affiliate-login-embed.html` served
    **directly** carries no `interest-form-url` placeholder — only `embed-app-v2.html:8` has one — so
    `affiliate-login.js:173` falls back to its hardcoded `/affiliate` on that access path (PITFALLS #3;
    brief correction C-6). Through Phase 1 that fallback still resolves, because the portal's own
    `/affiliate` route is alive until Phase 2's B9. **Phase 2 Task 16 must not delete that route until
    the placeholder is added to `affiliate-login-embed.html`.** Carried into the escalation register.

---

### Task 3: PRE404 — close every path that 404s publicly the moment a host flips

Brief C-9, adjudication A2/C-9. Three classes of URL are served by the portal on a marketing host and
**404 on the content app**. Each breaks publicly at that host's flip.

> **⚠️ The skeleton says "4 legal paths". Measured 2026-09-21, it is 6.**
> The full `:3001`=404 / `:3000`=200 set on `Host: rundberglaundry.com` is **12** paths:
>
> | path | `:3001` | `:3000` | disposition |
> |:--|--:|--:|:--|
> | `/privacy-policy` | 404 | 200 | **FIX** → `EXACT_PATHS` |
> | `/terms-and-conditions` | 404 | 200 | **FIX** → `EXACT_PATHS` |
> | `/terms-of-service` | 404 | 200 | **FIX** → `EXACT_PATHS` |
> | `/terms-of-service.html` | 404 | **200** | **FIX** → `EXACT_PATHS` — slice A missed it; the portal serves this file statically |
> | `/refund-policy` | 404 | 200 | **FIX** → `EXACT_PATHS` |
> | `/refund-policy.html` | 404 | **200** | **FIX** → `EXACT_PATHS` — same |
> | `/assets/js/embed-navigation.js` | 404 | 200 | **FIX** → self-host in the portal |
> | `/assets/js/revenue-calculator.js` | 404 | 200 | **FIX** → self-host in the portal |
> | `/partner-program` | 404 | 200 | ACCEPT — the `partnerLanding` catch-all, never a real route |
> | `/austin-tx/` | 404 | 200 | ACCEPT — removed by the flip itself |
> | `/austin-tx/wash-dry-fold/` | 404 | 200 | ACCEPT — same |
> | `/health/origin` | 404 | 200 | ACCEPT — a portal-only route; the CF monitor requests it with `Host: portal.atxwashdryfold.com`, never on a marketing host |
>
> `EXACT_PATHS` therefore grows by **6**, from 11 to **17** — not by 4.
>
> **Deliberately NOT fixed, and escalated:** `/privacy-policy.html` and `/terms-and-conditions.html`
> are `:3000`=**302 → `https://www.wavemaxlaundry.com/…`** (measured) — a live redirect from our
> origin to the franchisor's site during a trademark/DMCA dispute. Adding them to `EXACT_PATHS` would
> 301 them to the portal, which would then 302 them to the franchisor. Letting them 404 on a flipped
> host is strictly better. The portal-side franchisor redirect is a separate escalation.

**M23 — password reset is NOT broken by the flip, and the env var is the wrong thing to assert.**
`passwordResetService.js:86` builds reset links from `FRONTEND_URL=https://rundberglaundry.com`, but
`/embed-app-v2.html` is in `EXACT_PATHS` and the redirect is
`res.redirect(301, PORTAL_ORIGIN + req.originalUrl)`, which carries the query string. **Measured on
oci1 2026-09-21:**
```
3001 code=301 loc=https://portal.atxwashdryfold.com/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate
```
The token survives byte-for-byte. Asserting the env var would pass while `/embed-app-v2.html` was
being removed from `EXACT_PATHS` by Phase 2's bridge deletion — which is how this actually breaks.
Every flip task asserts the **end-to-end token-preserving 301** instead.

**M24 — the flip creates an A→B→A canonical loop unless one portal line moves first.** Measured
2026-09-21: `atxwashdryfold.com` served by `:3000` carries
`<link rel="canonical" href="https://rundberglaundry.com/">`, while `:3001` carries
`https://atxwashdryfold.com/` on all three hosts. Flip `rundberglaundry.com` while
`atxwashdryfold.com` is still on the portal and the two point at each other. Moving
`public/partner-program.html:10` makes the portal's copy self-canonical, so no loop can form **in any
flip order**.

**Files:**
- `crhs-corporate`: `server/middleware/legacyPortalRedirects.js` (`EXACT_PATHS` 11 → 17);
  `tests/legacyPortalRedirects.test.js` (+6 cases, written first).
- `wavemax-affiliate-program`: `public/embed-landing.html:314`, `:317` (absolute → relative);
  `public/privacy-policy.html:10`, `public/terms-and-conditions.html:10` (canonical → portal);
  `public/partner-program.html:10` (canonical → `https://atxwashdryfold.com/`).

**Interfaces:**
- **Consumes** (asserted, Step 0):
  - `CORP_DEPLOYED_oci1=yes` / `oci2=yes` and `CORP_MANIFEST_MD5` (Task 1) — this task's corporate
    change is only deployable through Task 1's mechanism, so it is asserted, not assumed.
  - `CORP_SRC`, `CORP_SHA` recorded.
  - The five line-addressed edit targets still contain what the `sed` expects (line-addressed edits
    are silent no-ops when a file shifts).
  - `BOX_BUSY` empty.
- **Produces:** `PRE404_CLOSED=yes` — a hard precondition of tasks 9, 11 and 13.
- **TDD:** the corporate change lands test-first; the red must name `/privacy-policy` and report
  `Tests: 6 failed, 6 total`.

**Rollback (exact).** Two independent reverts plus a redeploy of each.
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
# 1. corporate
cd "$CORP_SRC" && git revert --no-edit "$PRE404_CORP_SHA" && git log --oneline -1
#    then re-run Task 1 Steps 1,4,5,6 per box to deliver the revert (the ONLY corporate deploy path)
# 2. affiliate
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git revert --no-edit "$PRE404_AFF_SHA" && git log --oneline -1
git push && for IP in 161.153.71.201 144.24.4.202; do
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/wavemax/wavemax-affiliate-program && git checkout -- package-lock.json 2>/dev/null; git pull --ff-only && git rev-parse --short HEAD && pm2 reload wavemax --update-env >/dev/null && sleep 8 && curl -s -H "Host: portal.atxwashdryfold.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/health'; echo
done
```
- Rollback expected: one `Revert "…"` line per repo; the corporate redeploy prints
  `differs_from_head:` / `DIVERGENCE_END` with nothing between; each box prints a short sha and
  `{"status":"UP",…}`.
- **Reverting Task 3 after a flip has landed re-opens the 404s on the flipped hosts.** Roll the flips
  back first (14 → 13 → 12 → 11 → 10 → 9), then this.
- **After Phase 2 Task 16 has landed**, `public/partner-program.html` is deleted; revert this task with
  `git revert -n` and resolve that file as deleted (X24).

- [ ] **Step 0: Assert the Consumes, including that every line-addressed target still reads as expected.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
FAIL=0
chk() { if [ "$2" = "$3" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=[$2] want=[$3]"; FAIL=1; fi; }
chkn() { if [ -n "$2" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=EMPTY"; FAIL=1; fi; }
chk  corp_oci1 "${CORP_DEPLOYED_oci1:-}" yes
chk  corp_oci2 "${CORP_DEPLOYED_oci2:-}" yes
chkn corp_manifest "${CORP_MANIFEST_MD5:-}"
chkn corp_src  "${CORP_SRC:-}"
chk  box_busy  "${BOX_BUSY:-}" ""
A=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
chk line_embed_314 "$(sed -n '314p' $A/public/embed-landing.html | grep -c 'src="https://rundberglaundry.com/assets/js/embed-navigation.js"')"   1
chk line_embed_317 "$(sed -n '317p' $A/public/embed-landing.html | grep -c 'src="https://rundberglaundry.com/assets/js/revenue-calculator.js?v=20260826b"')" 1
chk line_priv_10   "$(sed -n '10p'  $A/public/privacy-policy.html | grep -c 'canonical" href="https://rundberglaundry.com/privacy-policy"')"      1
chk line_terms_10  "$(sed -n '10p'  $A/public/terms-and-conditions.html | grep -c 'canonical" href="https://rundberglaundry.com/terms-and-conditions"')" 1
chk line_partner_10 "$(sed -n '10p' $A/public/partner-program.html | grep -c 'canonical" href="https://rundberglaundry.com/"')"                   1
chk local_js "$(ls $A/public/assets/js/embed-navigation.js $A/public/assets/js/revenue-calculator.js 2>/dev/null | wc -l)" 2
chk exact_paths_size "$(cd "$CORP_SRC" && node -p 'require("./server/middleware/legacyPortalRedirects").EXACT_PATHS.size')" 11
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: twelve `OK` lines then `gate=PASS`.
  - Any `line_*` FAIL means the file shifted and the `sed` in Step 4 would silently edit the wrong
    line — re-derive the line numbers before proceeding. This is the check that makes a
    line-addressed edit safe.

- [ ] **Step 1: Re-derive the authoritative inventory. Anything outside the known set HALTS.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'KNOWN=" /privacy-policy /terms-and-conditions /terms-of-service /terms-of-service.html /refund-policy /refund-policy.html /assets/js/embed-navigation.js /assets/js/revenue-calculator.js /partner-program /austin-tx/ /austin-tx/wash-dry-fold/ /health/origin "
N=0
for P in / /affiliate /affiliate/ /privacy-policy /privacy-policy.html /terms-and-conditions /terms-and-conditions.html \
         /terms-of-service /terms-of-service.html /refund-policy /refund-policy.html /partner-program \
         /austin-tx/ /austin-tx/wash-dry-fold/ /health /health/origin \
         /assets/js/embed-navigation.js /assets/js/revenue-calculator.js /assets/js/i18n.js \
         /assets/js/partner-inquiry.js /assets/css/partner-program.css /robots.txt /sitemap.xml /favicon.ico \
         /embed-app-v2.html /admin /operator /scanbag /monitoring-dashboard.html; do
  A=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: rundberglaundry.com" http://127.0.0.1:3001$P)
  B=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: rundberglaundry.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000$P)
  if [ "$A" = 404 ] && [ "$B" = 200 ]; then
    N=$((N+1))
    case "$KNOWN" in *" $P "*) ;; *) printf "  UNACCOUNTED %-34s 3001=%s 3000=%s\n" "$P" "$A" "$B" ;; esac
  fi
done
echo "  breaks_on_flip=$N"
echo "  UNACCOUNTED_END"'
```
  - Expected, exactly: `breaks_on_flip=12`, then `UNACCOUNTED_END`, with **no `UNACCOUNTED` line
    between them**.
  - Any `UNACCOUNTED` row is a STOP: an unclassified path that would 404 publicly on flip. Classify
    it into FIX or ACCEPT *in this task*, not in Task 9.
  - A `breaks_on_flip` other than `12` means the set moved — re-derive the table above before going on.

- [ ] **Step 2: Corporate — write the six failing tests FIRST (P18), and make the red discriminate.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
# 2a. ADD six cases to tests/legacyPortalRedirects.test.js, one per FIX legal path, each asserting
#     a 301 to https://portal.atxwashdryfold.com<path> on a marketing host. Verified 2026-09-21:
#     the file has 9 tests and ZERO matching /legal|privacy|terms|refund/ — the test must be WRITTEN.
grep -cE 'privacy|terms|refund' tests/legacyPortalRedirects.test.js
npx jest tests/legacyPortalRedirects.test.js -t 'legal' 2>&1 | tail -20
```
  - Expected **before** 2a: `0`.
  - Expected **after** 2a and before the implementation: `Tests: 6 failed, 6 total`, with at least one
    failure naming `/privacy-policy` and reading like `expected 301, received 404`.
  - **`Tests: 0 total` is a STOP**, not a red: `jest -t` with no matching test exits non-zero and
    superficially resembles a failure, which would wave the TDD gate through with no test having ever
    failed for the right reason.

- [ ] **Step 3: Corporate — add the six entries, go green.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
# add to EXACT_PATHS: '/privacy-policy', '/terms-and-conditions', '/terms-of-service',
#                     '/terms-of-service.html', '/refund-policy', '/refund-policy.html'
npx jest tests/legacyPortalRedirects.test.js 2>&1 | tail -6
node -e 'const s=require("./server/middleware/legacyPortalRedirects").EXACT_PATHS;
const w=["/privacy-policy","/terms-and-conditions","/terms-of-service","/terms-of-service.html","/refund-policy","/refund-policy.html"];
console.log("size="+s.size+" added="+w.every(p=>s.has(p))+" not_added="+["/privacy-policy.html","/terms-and-conditions.html"].some(p=>s.has(p)))'
git add -A && git commit -q -m "fix(redirects): 301 the six portal-served legal paths from marketing hosts (Plan 3 T3)" && git rev-parse --short HEAD
```
  - Expected: `Tests: 15 passed, 15 total` (9 existing + 6 new), then
    `size=17 added=true not_added=false`, then a short sha.
  - `not_added=true` means the two franchisor-302 `.html` aliases were added — remove them (see the
    escalation above) and re-run.
  - Record it: `rec PRE404_CORP_SHA "<sha>"`.

- [ ] **Step 4: Affiliate — the five line-addressed edits, with a post-assert on every one.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
sed -i '314s|https://rundberglaundry.com/assets/js/embed-navigation.js|/assets/js/embed-navigation.js|' public/embed-landing.html
sed -i '317s|https://rundberglaundry.com/assets/js/revenue-calculator.js|/assets/js/revenue-calculator.js|' public/embed-landing.html
sed -i '10s|https://rundberglaundry.com/privacy-policy|https://portal.atxwashdryfold.com/privacy-policy|' public/privacy-policy.html
sed -i '10s|https://rundberglaundry.com/terms-and-conditions|https://portal.atxwashdryfold.com/terms-and-conditions|' public/terms-and-conditions.html
sed -i '10s|<link rel="canonical" href="https://rundberglaundry.com/">|<link rel="canonical" href="https://atxwashdryfold.com/">|' public/partner-program.html
echo "  314: $(sed -n '314p' public/embed-landing.html)"
echo "  317: $(sed -n '317p' public/embed-landing.html)"
echo "  priv: $(sed -n '10p' public/privacy-policy.html)"
echo "  terms: $(sed -n '10p' public/terms-and-conditions.html)"
echo "  partner: $(sed -n '10p' public/partner-program.html)"
echo "  rl_lines=$(grep -c 'rundberglaundry.com' public/embed-landing.html) rl_occurrences=$(grep -o 'rundberglaundry.com' public/embed-landing.html | wc -l)"
git add -A && git commit -q -m "fix(portal): self-host the landing scripts; move the three stale canonicals (Plan 3 T3)" && git rev-parse --short HEAD
```
  - Expected, exactly:
    - `314:     <script src="/assets/js/embed-navigation.js"></script>`
    - `317:     <script src="/assets/js/revenue-calculator.js?v=20260826b"></script>` — the `?v=` stamp
      is preserved: the bytes do not change, only the origin.
    - `priv:` and `terms:` canonicals now on `https://portal.atxwashdryfold.com/…`
    - `partner: <link rel="canonical" href="https://atxwashdryfold.com/">` — the line that prevents the
      A→B→A loop in any flip order
    - `rl_lines=2 rl_occurrences=3` — **down from `4` / `5`**. (`grep -c` counts *lines*; line 278
      carries two occurrences. Slice A's expected `3` was wrong on both counts.) The two survivors are
      the `affiliates@rundberglaundry.com` mailto at `:278` (a live Mailcow alias) and the `/operator`
      link at `:294` (already in `EXACT_PATHS`, so it 301s after the flip).
  - Record it: `rec PRE404_AFF_SHA "<sha>"`.

- [ ] **Step 5: Deploy both repos — corporate through Task 1's mechanism, asserted.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
# 5a. Corporate: re-run Task 1 Steps 1, 3, 4, 5, 6 per box with CORP_SHA = PRE404_CORP_SHA.
#     Task 1 Step 4's "deletes: DELETES_END with nothing between" and Step 5's empty divergence
#     are the assertions that the deploy actually landed. One box at a time under BOX_BUSY.
# 5b. Affiliate: git pull on each box, one at a time.
test -z "${BOX_BUSY:-}" || { echo "HALT: BOX_BUSY=$BOX_BUSY"; exit 1; }
git -C /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program push
for IP in 161.153.71.201 144.24.4.202; do
  echo "##### $IP"
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
  cd /var/www/wavemax/wavemax-affiliate-program
  git checkout -- package-lock.json 2>/dev/null || true
  git pull --ff-only | tail -1
  echo \"  head=\$(git rev-parse --short HEAD) porcelain=\$(git status --porcelain | wc -l)\"
  pm2 reload wavemax --update-env >/dev/null; sleep 10
  echo -n '  portal /health -> '; curl -s -H 'Host: portal.atxwashdryfold.com' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/health; echo
  echo -n '  cross_origin_script_refs='; curl -s -H 'Host: portal.atxwashdryfold.com' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/embed-landing.html | grep -c 'https://rundberglaundry.com/assets/js' || true
  echo -n '  portal_canonical='; curl -s -H 'Host: atxwashdryfold.com' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/ | grep -o 'canonical\" href=\"[^\"]*\"' | head -1; echo"
done
```
  - Expected per box: `head=<sha matching PRE404_AFF_SHA> porcelain=0`;
    `portal /health -> {"status":"UP",…}`; `cross_origin_script_refs=0`;
    `portal_canonical=canonical" href="https://atxwashdryfold.com/"`.
  - `cross_origin_script_refs` above `0` means the portal's landing page still fetches two scripts
    from a host that is about to flip — a **missing script, not an HTTP error**, so no status-code
    probe downstream would catch it. STOP.

- [ ] **Step 6: Verify the six legal 301s and the token-preserving reset 301, both boxes.**
```bash
for IP in 161.153.71.201 144.24.4.202; do
  echo "##### $IP"
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP '
  for P in /privacy-policy /terms-and-conditions /terms-of-service /terms-of-service.html /refund-policy /refund-policy.html; do
    printf "  %-28s 3001 -> %s %s\n" "$P" \
      "$(curl -s -o /dev/null -w "%{http_code}" -H "Host: rundberglaundry.com" http://127.0.0.1:3001$P)" \
      "$(curl -s -o /dev/null -w "%{redirect_url}" -H "Host: rundberglaundry.com" http://127.0.0.1:3001$P)"
  done
  printf "  %-28s 3001 -> %s %s\n" "reset-link" \
    "$(curl -s -o /dev/null -w "%{http_code}" -H "Host: rundberglaundry.com" "http://127.0.0.1:3001/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate")" \
    "$(curl -s -o /dev/null -w "%{redirect_url}" -H "Host: rundberglaundry.com" "http://127.0.0.1:3001/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate")"
  printf "  %-28s 3001 -> %s\n" "/privacy-policy.html (accepted 404)" \
    "$(curl -s -o /dev/null -w "%{http_code}" -H "Host: rundberglaundry.com" http://127.0.0.1:3001/privacy-policy.html)"'
done
```
  - Expected per box: six lines `<path>  3001 -> 301 https://portal.atxwashdryfold.com<path>`, then
    `reset-link 3001 -> 301 https://portal.atxwashdryfold.com/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate`
    — the token **byte-identical** — then `/privacy-policy.html (accepted 404) 3001 -> 404`.
  - A `404` on any of the six, a dropped query string, or a truncated token is a **cutover blocker**:
    either the corporate deploy did not land on that box, or `/embed-app-v2.html` has left
    `EXACT_PATHS`. STOP.

- [ ] **Step 7: The browser check `curl` cannot do — a missing script is not an HTTP error.**
```bash
node -e '
const {execSync}=require("child_process");
const out=execSync(`CHROME_PATH=/opt/google/chrome/chrome npx --yes lighthouse "https://portal.atxwashdryfold.com/embed-landing.html?lh=${Date.now()}" --output=json --output-path=stdout --only-categories=best-practices --chrome-flags="--headless=new --no-sandbox --disable-dev-shm-usage" --quiet`,{maxBuffer:1e9}).toString();
const j=JSON.parse(out);
const errs=(j.audits["errors-in-console"].details.items||[]).map(i=>i.description||i.source);
console.log("bp="+Math.round(j.categories["best-practices"].score*100));
console.log("console_errors="+errs.length+(errs.length?"\n  "+errs.join("\n  "):""));
const reqs=(j.audits["network-requests"].details.items||[]).filter(r=>/embed-navigation|revenue-calculator/.test(r.url));
console.log("matched_scripts="+reqs.length);
for(const r of reqs) console.log("script "+r.url.replace(/\?.*/,"")+" status="+r.statusCode);
'
```
  - Expected: `bp=100`, `console_errors=0`, `matched_scripts=2`, then two
    `script https://portal.atxwashdryfold.com/assets/js/… status=200` lines.
  - `matched_scripts=0` is a **failure, not a pass**: the scripts were dropped from the page entirely.
    A `status=404`, a `rundberglaundry.com` URL, or any console error means the two scripts did not
    move. (This check runs from the workstation on purpose — `portal.atxwashdryfold.com` has no
    preview allowlist, so the allowlisted-vantage problem of C-13 does not apply to it.)

- [ ] **Step 8: Record the gate — conditionally.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
# Run ONLY after Steps 6 and 7 both printed their expected output on BOTH boxes.
OK=$(for IP in 161.153.71.201 144.24.4.202; do
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'n=0; for P in /privacy-policy /terms-and-conditions /terms-of-service /terms-of-service.html /refund-policy /refund-policy.html; do
    [ "$(curl -s -o /dev/null -w "%{http_code}" -H "Host: rundberglaundry.com" http://127.0.0.1:3001$P)" = 301 ] && n=$((n+1)); done
    [ "$(curl -s -o /dev/null -w "%{http_code}" -H "Host: rundberglaundry.com" "http://127.0.0.1:3001/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate")" = 301 ] && n=$((n+1))
    [ "$(curl -s -H "Host: portal.atxwashdryfold.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/embed-landing.html | grep -c "https://rundberglaundry.com/assets/js")" = 0 ] && n=$((n+1))
    echo $n'
done | paste -sd,)
echo "per_box_score=$OK"
[ "$OK" = "9,9" ] && { rec PRE404_CLOSED yes; echo "PRE404_CLOSED=yes recorded"; } || echo "NOT RECORDED — per_box_score must be 9,9"
grep -c '^PRE404_CLOSED=yes$' "$REC"
```
  - Expected: `per_box_score=9,9`, `PRE404_CLOSED=yes recorded`, then `1`.
  - Anything other than `9,9` leaves `PRE404_CLOSED` **unset**, which halts tasks 9, 11 and 13 at their
    Step 0. The recording is conditional on purpose (P7: slice A recorded `HOST_DONE=yes`
    unconditionally in the same block as the gate that was supposed to guard it).

---

### Task 4: Interest-form i18n — the corporate page ships translated, DARK, before any flip

Brief C-7/B-2 and backlog B-2. **Verified 2026-09-21:** the interest form lives at
`crhs-corporate/content/atxwashdryfold/affiliate/index.html` (29,772 bytes on the box) and contains
**zero** `data-i18n` attributes; the corporate locale tree is
`content/atxwashdryfold/locales/{en,es,pt,de}/common.json`. The page also loads no `i18n.js` and no
language switcher — **adding the layer is the work, not the strings.**

It lands here, before the flips, so the first public byte `atxwashdryfold.com` serves after its flip
is already translated. Doing it in the affiliate repo instead would be deleted by Phase 2 Task 16.

**Files:** `crhs-corporate` only —
- `content/atxwashdryfold/affiliate/index.html` (`data-i18n` / `data-i18n-placeholder` /
  `data-i18n-aria-label` attributes, the `i18n.js` script tag with its nonce, the switcher markup);
- `content/atxwashdryfold/locales/{en,es,pt,de}/common.json` (one new `affiliate.*` namespace, the
  same leaf set in all four);
- a test that pins leaf-set parity across the four locales.

**Interfaces:**
- **Consumes** (asserted, Step 0):
  - `CORP_DEPLOYED_oci1=yes` / `oci2=yes` (Task 1) — this page can only reach production through that
    mechanism;
  - `INTEREST_FORM_URL_SET=yes` and `IFU_VALUE` (Task 2) — this is the page that link points at, so
    the link must already resolve before the page is rewritten;
  - the four locale files exist and currently parse;
  - `BOX_BUSY` empty.
- **Produces:** `IFORM_I18N=yes`, `IFORM_LEAVES` (the leaf count, identical in four locales).
- **Dark by construction:** the page is served on `atxwashdryfold.com`, which is still on the portal
  until Task 13/14 — so this change is publicly invisible until the flip, and is verified on `:3001`.

**Rollback (exact).**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
cd "$CORP_SRC" && git revert --no-edit "$IFORM_SHA" && git rev-parse --short HEAD
# then re-run Task 1 Steps 1,3,4,5,6 per box to deliver the revert
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'curl -s -H "Host: atxwashdryfold.com" http://127.0.0.1:3001/affiliate | grep -c data-i18n'
```
- Rollback expected: a `Revert "…"` line, a short sha, then `0`.

- [ ] **Step 0: Assert the Consumes and the current zero-i18n state.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
FAIL=0
chk() { if [ "$2" = "$3" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=[$2] want=[$3]"; FAIL=1; fi; }
chkn() { if [ -n "$2" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=EMPTY"; FAIL=1; fi; }
chk  corp_oci1 "${CORP_DEPLOYED_oci1:-}" yes
chk  corp_oci2 "${CORP_DEPLOYED_oci2:-}" yes
chk  ifu_set   "${INTEREST_FORM_URL_SET:-}" yes
chkn ifu_value "${IFU_VALUE:-}"
chk  box_busy  "${BOX_BUSY:-}" ""
C="$CORP_SRC"
chk  form_present "$(test -f "$C/content/atxwashdryfold/affiliate/index.html" && echo yes || echo no)" yes
chk  form_i18n_now "$(grep -c 'data-i18n' "$C/content/atxwashdryfold/affiliate/index.html" || true)" 0
chk  locales "$(ls -d "$C"/content/atxwashdryfold/locales/{en,es,pt,de} 2>/dev/null | wc -l)" 4
for L in en es pt de; do node -e "JSON.parse(require('fs').readFileSync('$C/content/atxwashdryfold/locales/$L/common.json','utf8'))" || { echo "  FAIL locale_parse=$L"; FAIL=1; }; done
chk  has_affiliate_ns "$(node -p "Object.keys(JSON.parse(require('fs').readFileSync('$C/content/atxwashdryfold/locales/en/common.json','utf8'))).includes('affiliate')")" false
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: `OK form_i18n_now=0`, `OK locales=4`, `OK has_affiliate_ns=false`, the rest `OK`,
    then `gate=PASS`.
  - `form_i18n_now` above `0` or `has_affiliate_ns=true` means part of this work already landed —
    reconcile before re-running, do not re-add keys.

- [ ] **Step 1: Write the parity test FIRST (it must fail on the missing namespace).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
# 1a. Create tests/affiliateFormI18n.test.js asserting, for the four locales:
#     - common.json parses and carries an `affiliate` namespace;
#     - the flattened leaf key SET is identical across en/es/pt/de (not just the count);
#     - every data-i18n key used in content/atxwashdryfold/affiliate/index.html exists in en;
#     - no leaf value is an empty string in any locale.
npx jest tests/affiliateFormI18n.test.js 2>&1 | tail -12
```
  - Expected: `Tests: 4 failed, 4 total` — the first failure naming the missing `affiliate` namespace
    in `en/common.json`.
  - **`Tests: 0 total` is a STOP** (P18), not a red.

- [ ] **Step 2: Add the i18n layer to the page and the `affiliate.*` keys to all four locales.**
      House rule: user-facing copy ships in en/es/pt/de **in the same commit**, never as a follow-up.
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
npx jest tests/affiliateFormI18n.test.js 2>&1 | tail -6
node -e '
const fs=require("fs");
const flat=(o,p="")=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==="object"?flat(v,p+k+"."):[p+k]);
const sets={}; for (const L of ["en","es","pt","de"]) {
  const j=JSON.parse(fs.readFileSync(`content/atxwashdryfold/locales/${L}/common.json`,"utf8"));
  sets[L]=new Set(flat(j.affiliate||{}));
}
const en=[...sets.en].sort();
console.log("leaves_en="+en.length);
for (const L of ["es","pt","de"]) {
  const miss=en.filter(k=>!sets[L].has(k)), extra=[...sets[L]].filter(k=>!sets.en.has(k));
  console.log(`${L} count=${sets[L].size} missing=${miss.length} extra=${extra.length}`+(miss.length?" "+miss.slice(0,5).join(","):""));
}
const html=fs.readFileSync("content/atxwashdryfold/affiliate/index.html","utf8");
const used=[...html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map(m=>m[1]);
console.log("html_keys="+used.length+" unresolved="+used.filter(k=>!sets.en.has(k.replace(/^affiliate\./,""))).length);
console.log("i18n_script="+(/assets\/js\/i18n\.js/.test(html)?1:0)+" switcher="+(/language-switcher|data-lang-switch/.test(html)?1:0));
'
```
  - Expected: the suite green (`Tests: 4 passed, 4 total`); then `leaves_en=<N>` with `N > 0`; three
    lines `es|pt|de count=<N> missing=0 extra=0` with the **same** `N`; then
    `html_keys=<M> unresolved=0` with `M > 0`; then `i18n_script=1 switcher=1`.
  - `unresolved` above `0` means the HTML references a key no locale defines — the page would render
    its fallback text in every language. STOP.
  - `html_keys=0` means the attributes were never added and the locale keys are dead weight. STOP.
  - Record `rec IFORM_LEAVES "<N>"`.

- [ ] **Step 3: Commit and deploy through Task 1's mechanism.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
git add -A && git commit -q -m "feat(affiliate-form): i18n layer + affiliate.* keys in en/es/pt/de (Plan 3 T4, backlog B-2)" && git rev-parse --short HEAD
# then re-run Task 1 Steps 1, 3, 4, 5, 6 per box with CORP_SHA = this sha, one box at a time.
```
  - Expected: a short sha. Record it: `rec IFORM_SHA "<sha>"`.
  - Task 1 Step 4's `DELETES_END` with nothing before it, and Step 5's empty divergence, are the
    assertions that the deploy landed — do not substitute a looser check.

- [ ] **Step 4: Verify on `:3001` — dark, because the host is still on the portal.**
```bash
for IP in 161.153.71.201 144.24.4.202; do
  printf '%-16s ' "$IP"
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'B=$(mktemp); curl -s -H "Host: atxwashdryfold.com" http://127.0.0.1:3001/affiliate -o "$B"
    printf "i18n_attrs=%s i18n_script=%s locales_en=%s locales_de=%s public_still_portal=%s\n" \
      "$(grep -c data-i18n "$B" || true)" \
      "$(grep -c "assets/js/i18n.js" "$B" || true)" \
      "$(curl -s -o /dev/null -w "%{http_code}" -H "Host: atxwashdryfold.com" http://127.0.0.1:3001/locales/en/common.json)" \
      "$(curl -s -o /dev/null -w "%{http_code}" -H "Host: atxwashdryfold.com" http://127.0.0.1:3001/locales/de/common.json)" \
      "$(curl -s -H "Host: atxwashdryfold.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/affiliate | grep -c data-i18n || true)"
    rm -f "$B"'
done
EV=/var/www/wavemax/cutover-logs; printf '%s=%q\n' IFORM_I18N yes >> "$EV/plan3-record.env"
```
  - Expected per box: `i18n_attrs=<M>` (equal to Step 2's `html_keys`), `i18n_script=1`,
    `locales_en=200 locales_de=200`, and `public_still_portal=0`.
  - `public_still_portal=0` is the **dark** proof: the portal — which is what the public still gets on
    `atxwashdryfold.com` — is unchanged by this task. A non-zero value would mean the change leaked
    into the live path.
  - `locales_*` other than `200` means the content app does not serve the locale tree at that URL and
    the switcher would fail silently at the flip. STOP.

---

### Task 5: [per box] **HUMAN-CONFIRM** — delete the inert nginx access gate and its franchisor-branded 503 page

**The gate is provably inert.** `conf.d/wavemax-gate.conf:6` reads `geo $allowed { default 1; … }`, so
`$allowed` is always `1`; `map "$allowed:$public_path" $access_allowed { "0:0" 0; default 1; }` can
therefore never yield `0`. The `return 503`, the whole `$public_path` allowlist (full of dead
`/austin-tx`, `/franchise-default/`, `*-embed.html` franchise paths) and the `@maintenance` handler
are unreachable code, and have been since 2026-05-19.

**Delete, not prune** — three reasons, in order of weight:
1. **Ordering (load-bearing).** `snippets/wavemax-maintenance.conf:3` installs
   `error_page 503 = @maintenance;` at **server** level. Task 15's graceful-degradation handler returns
   **503**, and would be re-intercepted into the franchisor-branded page. Deleting the gate first
   removes the collision instead of working around it.
2. The unreachable 503 body reads `<title>WaveMAX — Restricted</title>` and *"WaveMAX is in invite-only
   mode"* — franchisor brand text sitting on our public origin during a live trademark/DMCA dispute.
3. Pruning a dead allowlist yields config that is still dead, only tidier, and leaves a re-armable gate
   whose next operator could 503 the production portal with a stale IP list.

Live access control is unaffected: it is the content app's `accessGate` (verified: `crhsent.com/` → 401
on both boxes) and the portal's own auth, neither of which reads nginx state.

**Files:** box only, per box.
- Deletes `/etc/nginx/conf.d/wavemax-gate.conf` (43 lines) and
  `/etc/nginx/snippets/wavemax-maintenance.conf` (9 lines).
- Modifies `/etc/nginx/sites-enabled/{atxwashateria.com,atxwashdryfold.com,rundberglaundry.com,portal.atxwashdryfold.com}`
  — removes the 3-line `if ($access_allowed = 0) { return 503; }` block and the 1-line maintenance
  include from each.
- Does **not** touch `crhsent.com` (verified: it references neither; the transform is a byte no-op there,
  which is the check that proves it).
- Creates `~/nginx-snapshots/*.<TS>` (7 files per box) and `~/plan3-remove-access-gate.pl`.

**Interfaces:**
- **Consumes** (asserted, Step 0): nothing from another task — this is the one Phase-0 task with no
  upstream. Its *environmental* premises are asserted instead:
  - `sudo -n nginx -t` works for `ubuntu` and prints exactly two lines;
  - the five `sites-enabled` files have the measured shape (127/127/94/23/127 lines, 13/13/9/2/13
    brace pairs, 5/5/4/1/5 server blocks);
  - `$access_allowed` is referenced by exactly four files and `crhsent.com` by none;
  - `geo $allowed` still defaults to `1` — i.e. the gate really is inert, not merely believed to be.
- **Produces:** `GATE_SNAP_TS_<box>`, `GATE_DELETED_<box>=yes`.
- Independent of the flips **before** them. **After** them the rollback is scoped and will refuse a
  flipped vhost (C-11/R-12/X16 — slice A's whole-file restore would have silently un-flipped all three
  marketing hosts while claiming independence).

**Rollback (exact — per file, and it REFUSES a flipped vhost).**
```bash
BOX=oci1; IP=161.153.71.201        # or BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
V=GATE_SNAP_TS_$BOX; TS=${!V}; test -n "$TS" || { echo "HALT: no gate snapshot TS for $BOX"; exit 1; }
echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
sudo cp -p ~/nginx-snapshots/wavemax-gate.conf.$TS /etc/nginx/conf.d/wavemax-gate.conf
sudo cp -p ~/nginx-snapshots/wavemax-maintenance.conf.$TS /etc/nginx/snippets/wavemax-maintenance.conf
for f in atxwashateria.com atxwashdryfold.com rundberglaundry.com portal.atxwashdryfold.com; do
  P=/etc/nginx/sites-enabled/\$f
  if grep -q 'proxy-content-app.conf' \$P; then echo \"  REFUSE \$f - flipped; roll that flip back first\"; continue; fi
  sudo cp -p ~/nginx-snapshots/\$f.$TS \$P; echo \"  restored \$f\"
done
sudo nginx -t && sudo systemctl reload nginx
echo \"  access_allowed_refs=\$(grep -l access_allowed /etc/nginx/sites-enabled/* | wc -l)\"
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com crhsent.com portal.atxwashdryfold.com; do
  printf '  %-28s %s\n' \$H \"\$(curl -sk -m 8 -o /dev/null -w 'code=%{http_code}' --resolve \$H:443:127.0.0.1 https://\$H/)\"
done"
```
- Rollback expected: `TS=<value>`; four `restored <host>` lines (or a `REFUSE` line naming any host
  already flipped — in which case that host is intentionally left alone); the two `nginx -t` lines;
  `access_allowed_refs=4` minus one for each REFUSEd host; then five host lines, `code=200` except
  `crhsent.com code=401`.

- [ ] **Step 0: Set the box; assert the environment is what the transform was derived against.**
```bash
BOX=oci1; IP=161.153.71.201        # Pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
FAIL=0
chk() { if [ "$2" = "$3" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=[$2] want=[$3]"; FAIL=1; fi; }
S=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'sudo -n nginx -t 2>&1 | wc -l
  for f in atxwashateria.com atxwashdryfold.com crhsent.com portal.atxwashdryfold.com rundberglaundry.com; do
    P=/etc/nginx/sites-enabled/$f; printf "%s:%s:%s:%s " "$(wc -l < $P)" "$(tr -cd "{" < $P|wc -c)" "$(tr -cd "}" < $P|wc -c)" "$(grep -c "^server {" $P)"; done; echo
  grep -l access_allowed /etc/nginx/sites-enabled/* | wc -l
  grep -c access_allowed /etc/nginx/sites-enabled/crhsent.com || true
  perl -0ne "print((/geo \\\$allowed \{[^}]*\\bdefault\\s+1;/s)?1:0)" /etc/nginx/conf.d/wavemax-gate.conf; echo
  grep -l "proxy-content-app.conf" /etc/nginx/sites-enabled/* 2>/dev/null | wc -l')
set -- $S
chk nginx_t_lines   "$1" 2
chk vhost_shapes    "$2 $3 $4 $5 $6" "127:13:13:5 127:13:13:5 94:9:9:4 23:2:2:1 127:13:13:5"
chk gated_files     "$7" 4
chk crhsent_gated   "$8" 0
chk geo_open        "$9" 1
chk already_flipped "${10}" 0
chk box_busy        "${BOX_BUSY:-}" ""
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: `OK nginx_t_lines=2`; `OK vhost_shapes=127:13:13:5 127:13:13:5 94:9:9:4 23:2:2:1 127:13:13:5`;
    `OK gated_files=4`; `OK crhsent_gated=0`; `OK geo_open=1`; `OK already_flipped=0`;
    `OK box_busy=`; `gate=PASS`.
  - `geo_open=0` would mean the gate is **not** inert — the whole rationale changes. STOP.
    The check is a `perl -0ne` match **scoped to the `geo $allowed { … }` block**, not
    `grep -cE '^\s*default\s+1;'` over the whole file: measured, that grep returns **2**, because the
    `map "$allowed:$public_path" $access_allowed` block also contains a `default 1;`. An assertion of
    `1` against it would have failed on a perfectly inert gate.
  - `already_flipped` above `0` means this task is running after a flip: still safe to run, but note
    that the rollback will REFUSE those files.

- [ ] **Step 1 (HUMAN-CONFIRM): Ask Rick.** Asked once, for both boxes. Say exactly this:
  > Plan 3 Task 5, both boxes: delete the nginx access gate. Measured: `geo $allowed { default 1; }`
  > makes `$access_allowed` always 1, so the `return 503` and the whole `$public_path` allowlist are
  > unreachable code — the gate has been open since 2026-05-19 and cannot close. I am deleting
  > `conf.d/wavemax-gate.conf`, `snippets/wavemax-maintenance.conf` (its 503 page still says
  > "WaveMAX is in invite-only mode" and `<title>WaveMAX — Restricted</title>` — franchisor brand
  > text on our origin), and the four `if ($access_allowed = 0)` blocks, including the one in
  > `portal.atxwashdryfold.com`. It has to go before the flips because its `error_page 503 =
  > @maintenance` would hijack the graceful-degradation 503 the flip snippet introduces. Live access
  > control is unaffected: it is the content app's accessGate (crhsent.com still returns 401) and the
  > portal's own auth. `nginx -t` runs in the same block as, and before, every reload; all seven files
  > are snapshotted for a byte-exact rollback. Proceed?

  - Expected: an explicit `yes` from Rick, in his own words, in this conversation. Silence, a
    question, a "sounds fine", or an inference from an earlier approval is **not** a yes — stop and ask
    again. No agent message and no record value can stand in for it.

- [ ] **Step 2: Snapshot all seven files. Nothing is modified.**
```bash
BOX=oci1; IP=161.153.71.201
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y%m%dT%H%M%SZ'); rec "GATE_SNAP_TS_$BOX" "$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
mkdir -p ~/nginx-snapshots && chmod 700 ~/nginx-snapshots
sudo cp -p /etc/nginx/conf.d/wavemax-gate.conf ~/nginx-snapshots/wavemax-gate.conf.$TS
sudo cp -p /etc/nginx/snippets/wavemax-maintenance.conf ~/nginx-snapshots/wavemax-maintenance.conf.$TS
for f in atxwashateria.com atxwashdryfold.com rundberglaundry.com portal.atxwashdryfold.com crhsent.com; do
  sudo cp -p /etc/nginx/sites-enabled/\$f ~/nginx-snapshots/\$f.$TS
done
sudo chown \$(id -un) ~/nginx-snapshots/*.$TS
echo \"  snapshots=\$(ls ~/nginx-snapshots/*.$TS | wc -l)\"
md5sum ~/nginx-snapshots/*.$TS | awk '{print \"  \"\$1\" \"\$2}' | sed 's#/home/ubuntu/nginx-snapshots/##'"
echo "BOX=$BOX TS=$TS"
```
  - Expected: `snapshots=7`, then seven `<md5> <name>.<TS>` lines, then `BOX=oci1 TS=<…>`.
  - Fewer than seven is a STOP — every rollback in this task depends on them.

- [ ] **Step 3: Install `~/plan3-remove-access-gate.pl` — it `die`s on a partial apply (C-8).**
```bash
BOX=oci1; IP=161.153.71.201
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "tee ~/plan3-remove-access-gate.pl >/dev/null" <<'PERL'
# Plan 3 Task 5 — remove the inert nginx access gate from one vhost file.
# Run as: sudo perl -0pi ~/plan3-remove-access-gate.pl /etc/nginx/sites-enabled/<host>
#
# Removes exactly 4 non-blank lines: the 3-line `if` block and the 1-line maintenance
# include. All-or-nothing: a file that has one but not the other is a partial apply and
# is REFUSED, leaving the original byte-identical (perl -i renames only on success).
# A file that never had either (crhsent.com) is a byte no-op and exits 0.
my $n1 = 0 + s{\n[ \t]*if \(\$access_allowed = 0\) \{\n[ \t]*return 503;\n[ \t]*\}\n}{}g;
my $n2 = 0 + s{\n[ \t]*include /etc/nginx/snippets/wavemax-maintenance\.conf;\n}{\n}g;
my $residual = m{\$access_allowed|wavemax-maintenance\.conf} ? 1 : 0;
unless ( ($n1 == 1 && $n2 == 1 && !$residual) || ($n1 == 0 && $n2 == 0 && !$residual) ) {
  die "plan3-gate: partial apply (if=$n1 include=$n2 residual=$residual) - refusing, file NOT modified\n";
}
PERL
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "perl -c ~/plan3-remove-access-gate.pl 2>&1 | tail -1; md5sum ~/plan3-remove-access-gate.pl"
```
  - Expected: `/home/ubuntu/plan3-remove-access-gate.pl syntax OK`, then an md5 that Step 7 asserts is
    identical on both boxes.

- [ ] **Step 3b (R-9 falsification): prove the `die` guard fires, on a scratch copy, before trusting it.**
```bash
BOX=oci1; IP=161.153.71.201
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'T=$(mktemp); cp /etc/nginx/sites-enabled/atxwashateria.com $T
  # remove ONLY the maintenance include, leaving the `if` block -> a partial state
  perl -0pi -e "s{\n[ \t]*include /etc/nginx/snippets/wavemax-maintenance\.conf;\n}{\n}" $T
  M0=$(md5sum < $T)
  perl -0pi ~/plan3-remove-access-gate.pl $T; echo "  rc=$?"
  M1=$(md5sum < $T)
  echo "  untouched=$([ "$M0" = "$M1" ] && echo yes || echo NO) if_left=$(grep -c "access_allowed" $T)"
  rm -f $T'
```
  - Expected, exactly: `plan3-gate: partial apply (if=1 include=0 residual=0) - refusing, file NOT modified`
    on stderr, then `rc=255`, then `untouched=yes if_left=1`.
  - **`rc=0` means the guard does not work and every later assertion in this task is worthless.** STOP.
  - Nothing under `/etc/nginx` is touched: the test runs on a `mktemp` copy.

- [ ] **Step 4: Apply to all five vhosts, asserting the line delta, brace balance and server count.**
```bash
BOX=oci1; IP=161.153.71.201
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
for f in atxwashateria.com atxwashdryfold.com rundberglaundry.com portal.atxwashdryfold.com crhsent.com; do
  P=/etc/nginx/sites-enabled/\$f
  B=\$(grep -c . \$P); TB=\$(wc -l < \$P); OB=\$(tr -cd '{' < \$P | wc -c); CB=\$(tr -cd '}' < \$P | wc -c); SV=\$(grep -c '^server {' \$P)
  sudo perl -0pi ~/plan3-remove-access-gate.pl \$P
  A=\$(grep -c . \$P); TA=\$(wc -l < \$P); OA=\$(tr -cd '{' < \$P | wc -c); CA=\$(tr -cd '}' < \$P | wc -c); SA=\$(grep -c '^server {' \$P)
  echo \"  \$f removed=\$((B-A)) total=\$TB-\>\$TA residual=\$(grep -c 'access_allowed\|wavemax-maintenance' \$P || true) braces=\$OB/\$CB-\>\$OA/\$CA servers=\$SV-\>\$SA\"
done"
```
  - Expected, exactly (dry-run reproduced against byte-copies of the live oci1 files, 2026-09-21):
    - `atxwashateria.com removed=4 total=127->122 residual=0 braces=13/13->12/12 servers=5->5`
    - `atxwashdryfold.com removed=4 total=127->122 residual=0 braces=13/13->12/12 servers=5->5`
    - `rundberglaundry.com removed=4 total=127->122 residual=0 braces=13/13->12/12 servers=5->5`
    - `portal.atxwashdryfold.com removed=4 total=23->18 residual=0 braces=2/2->1/1 servers=1->1`
    - `crhsent.com removed=0 total=94->94 residual=0 braces=9/9->9/9 servers=4->4` — **the no-op that
      proves `crhsent.com` never referenced the gate**
  - `removed` counts non-blank lines; `total` counts all lines (one blank line goes with the block).
  - Any other `removed`, any non-zero `residual`, any brace or server-count change is a STOP: run the
    Rollback (the snapshots are already in place) and re-read the file. A `grep -c`-only check would
    not catch a regex that ate 59 lines; this one does.

- [ ] **Step 5: Delete the two now-unreferenced files.**
```bash
BOX=oci1; IP=161.153.71.201
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
sudo rm -f /etc/nginx/conf.d/wavemax-gate.conf /etc/nginx/snippets/wavemax-maintenance.conf
echo \"  gate_files_left=\$(ls /etc/nginx/conf.d/ /etc/nginx/snippets/ | grep -c 'wavemax-gate\|wavemax-maintenance' || true)\"
echo \"  snapshots_intact=\$(ls ~/nginx-snapshots/wavemax-*.* 2>/dev/null | wc -l)\""
```
  - Expected: `gate_files_left=0`, `snapshots_intact=2` (or higher if an earlier pass also ran).

- [ ] **Step 6: `nginx -t` AND reload, in one block, then prove the reload actually took.**
```bash
BOX=oci1; IP=161.153.71.201
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
W0=\$(ps -o lstart= -p \$(pgrep -f 'nginx: worker' | head -1))
sudo nginx -t && sudo systemctl reload nginx
sleep 3
W1=\$(ps -o lstart= -p \$(pgrep -f 'nginx: worker' | head -1))
echo \"  workers_before=\$W0\"
echo \"  workers_after =\$W1\"
echo \"  reload_took=\$([ \\\"\$W0\\\" != \\\"\$W1\\\" ] && echo yes || echo NO)\""
```
  - Expected: the two `nginx -t` lines
    (`nginx: the configuration file /etc/nginx/nginx.conf syntax is ok` /
    `nginx: configuration file /etc/nginx/nginx.conf test is successful`), then two different worker
    start times and `reload_took=yes`.
  - `nginx -t` failing — in particular `unknown "access_allowed" variable` — means a reference was
    missed. The `&&` means **the reload does not run**. Run the Rollback.
  - `reload_took=NO` means the master did not spawn new workers: the running configuration is still
    the old one. `systemctl is-active` would have said `active` either way, which is why it is not
    used here (C-7).

- [ ] **Step 7: Prove nothing a visitor sees changed — all five hosts, on-box through nginx `:443`.**
```bash
BOX=oci1; IP=161.153.71.201
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP '
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com crhsent.com portal.atxwashdryfold.com; do
  printf "  %-28s / -> %s  /health ct -> %s  origin -> %s\n" "$H" \
    "$(curl -sk -m 8 -o /dev/null -w "code=%{http_code}" --resolve $H:443:127.0.0.1 https://$H/)" \
    "$(curl -sk -m 8 -o /dev/null -w "%{content_type}" --resolve $H:443:127.0.0.1 https://$H/health)" \
    "$(curl -sk -m 8 -o /dev/null -w "%{http_code}" --resolve $H:443:127.0.0.1 https://$H/health/origin)"
done'
rec "GATE_DELETED_$BOX" yes
```
  - Expected, exactly:
    - `atxwashateria.com   / -> code=200  /health ct -> text/html; charset=utf-8         origin -> 200`
    - `rundberglaundry.com / -> code=200  /health ct -> text/html; charset=utf-8         origin -> 200`
    - `atxwashdryfold.com  / -> code=200  /health ct -> text/html; charset=utf-8         origin -> 200`
    - `crhsent.com         / -> code=200  /health ct -> application/json; charset=utf-8  origin -> 401`
      ⚠️ CORRECTED 2026-09-22 during execution. `/` is crhsent.com's **public landing page** and has
      always returned 200 (Plan 2 Task 77 measured the same). The accessGate proof is `/services`
      and `/README.md` → **401**, verified both on-box and from a spoofed non-whitelisted
      `CF-Connecting-IP`. `/health/origin` is not a corporate route, so the gate answers 401, not 404.
    - `portal.atxwash…     / -> code=200  /health ct -> application/json; charset=utf-8  origin -> 200`
  - `crhsent.com code=401` is the content app's own `accessGate` and **must still be there** — it is
    the proof that deleting the nginx gate did not delete live access control.
  - Every marketing host still reads as the **portal** by `APPID` (C-4): `text/html` + `origin -> 200`.

- [ ] **Step 8: Pass 2 on oci2, then parity.**
      Repeat Steps 0 and 2–7 with `BOX=oci2; IP=144.24.4.202`. Step 1 is asked once for both boxes.
      Start Pass 2 only after Step 7 recorded `GATE_DELETED_oci1=yes`.
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
echo "gate_deleted oci1=$GATE_DELETED_oci1 oci2=$GATE_DELETED_oci2"
for IP in 161.153.71.201 144.24.4.202; do
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "md5sum ~/plan3-remove-access-gate.pl /etc/nginx/sites-enabled/portal.atxwashdryfold.com /etc/nginx/snippets/proxy-node-app.conf
  echo \"gatefiles \$(ls /etc/nginx/conf.d/ /etc/nginx/snippets/ | grep -c 'wavemax-gate\|wavemax-maintenance' || true)\""
done | awk '{print $1}' | sort | uniq -c | sort -rn
```
  - Expected: `gate_deleted oci1=yes oci2=yes`, then four count-`2` groups — the script, the portal
    vhost and the portal snippet are byte-identical across the boxes, and both print `gatefiles 0`.
  - Any group with a count of `1` means the boxes diverged. STOP before any flip: Cloudflare
    round-robins between them, so a divergence is publicly visible half the time.

---

### Task 6: [per box] `proxy_set_header X-Forwarded-Host $host;` on the remaining two proxy paths

R-3 defence in depth. Corporate host checks read `X-Forwarded-Host` — `accessGate:90` directly,
`mediatorGate:61` and `crhsentHandler:20` via `req.hostname` + `trust proxy` — and Cloudflare/nginx
currently pass a **client-supplied** value straight through on these two paths. Setting the header to
`$host` makes nginx **overwrite** anything the client sent.

The content-app snippet ships with the header from birth (Task 8), so after this task every proxy path
on both boxes is covered.

**D-1 does not apply here.** This edit adds one header line to `proxy-node-app.conf`; it does **not**
touch its `proxy_pass http://localhost:3000`, which the portal depends on.

**Files:** box only, per box.
- Modifies `/etc/nginx/snippets/proxy-node-app.conf` (14 → 15 lines).
- Modifies `/etc/nginx/sites-enabled/crhsent.com` (94 → 95 lines) — it has its own inline `:3001`
  `location /` and includes neither snippet.
- Creates `~/plan3-add-xfh.pl` and `~/nginx-snapshots/*.xfh.<TS>`.

**Interfaces:**
- **Consumes** — each row is asserted by a `chk` in Step 0 whose failure prints `gate=HALT`:
  | Consumes | producer | asserted as |
  |:--|:--|:--|
  | `GATE_DELETED_<box>=yes` | Task 5 | `chk gate_deleted … yes` |
  | `proxy-node-app.conf` is 14 lines, has no `X-Forwarded-Host`, and still targets `:3000` | box state | `chk snippet_lines 14`, `chk snippet_xfh 0`, `chk snippet_3000 1` |
  | `crhsent.com` is 94 lines, has no `X-Forwarded-Host`, targets `:3001` inline, and has 1 Mailcow `:8443` line the transform must not touch | box state | `chk crhsent_lines 94`, `chk crhsent_xfh 0`, `chk crhsent_3001 1`, `chk crhsent_mailcow 1` |
  | `BOX_BUSY` empty | C-9 | `chk box_busy ""` |
  Task 5 is a precondition even though it does not touch `crhsent.com`: the portal snippet's consumers
  were all rewritten by it, and re-editing a vhost set mid-gate-removal makes the snapshot generations
  ambiguous.
- **Produces:** `XFH_SNAP_TS_<box>`, `XFH_DONE_<box>=yes`.

**Rollback (exact).** Byte-exact snapshot restore — no reverse regex.
```bash
BOX=oci1; IP=161.153.71.201        # or BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
V=XFH_SNAP_TS_$BOX; TS=${!V}; test -n "$TS" || { echo "HALT: no xfh snapshot TS for $BOX"; exit 1; }
echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
sudo cp -p ~/nginx-snapshots/proxy-node-app.conf.xfh.$TS /etc/nginx/snippets/proxy-node-app.conf
sudo cp -p ~/nginx-snapshots/crhsent.com.xfh.$TS /etc/nginx/sites-enabled/crhsent.com
sudo nginx -t && sudo systemctl reload nginx
grep -c 'X-Forwarded-Host' /etc/nginx/snippets/proxy-node-app.conf /etc/nginx/sites-enabled/crhsent.com || true
curl -sk -m 8 --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/health; echo
curl -sk -m 8 --resolve crhsent.com:443:127.0.0.1 https://crhsent.com/health"
```
- Rollback expected: `TS=<value>`; the two `nginx -t` lines; then
  `/etc/nginx/snippets/proxy-node-app.conf:0` and `/etc/nginx/sites-enabled/crhsent.com:0`; then
  `{"status":"UP",…}` and `{"status":"ok"}`.
- The content snippet keeps its header (it belongs to Task 8), so rolling this back leaves the flipped
  hosts protected and only the portal and `crhsent.com` unprotected — the pre-Task-6 state exactly.

- [ ] **Step 0: Assert the Consumes and the measured pre-state of both files.**
```bash
BOX=oci1; IP=161.153.71.201        # Pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
FAIL=0
chk() { if [ "$2" = "$3" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=[$2] want=[$3]"; FAIL=1; fi; }
V=GATE_DELETED_$BOX; chk gate_deleted "${!V:-}" yes
S=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'P=/etc/nginx/snippets/proxy-node-app.conf; C=/etc/nginx/sites-enabled/crhsent.com
  printf "%s %s %s %s %s %s %s\n" "$(wc -l < $P)" "$(grep -c X-Forwarded-Host $P || true)" "$(grep -c "proxy_pass http://localhost:3000;" $P)" \
    "$(wc -l < $C)" "$(grep -c X-Forwarded-Host $C || true)" "$(grep -c "proxy_pass http://localhost:3001;" $C)" "$(grep -c "proxy_pass https://localhost:8443" $C)"')
set -- $S
chk snippet_lines "$1" 14
chk snippet_xfh   "$2" 0
chk snippet_3000  "$3" 1
chk crhsent_lines "$4" 94
chk crhsent_xfh   "$5" 0
chk crhsent_3001  "$6" 1
chk crhsent_mailcow "$7" 1
chk box_busy      "${BOX_BUSY:-}" ""
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: eight `OK` lines then `gate=PASS`, with `OK crhsent_mailcow=1`.
  - `crhsent_mailcow` is the count of Mailcow `proxy_pass https://localhost:8443` lines in
    `crhsent.com` that the transform must leave alone. **Measured 2026-09-21 it is `1`** — the three
    marketing vhosts carry four such lines each, `crhsent.com` only one, so a shared literal would have
    been wrong here.

- [ ] **Step 1: Install `~/plan3-add-xfh.pl` — a guarded block walk that `die`s on anything unexpected.**
      A global substitution would hit the Mailcow `:8443` blocks, which also set `Host $host`.
```bash
BOX=oci1; IP=161.153.71.201
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "tee ~/plan3-add-xfh.pl >/dev/null" <<'PERL'
# Plan 3 Task 6 — R-3: make nginx overwrite any client-supplied X-Forwarded-Host.
# Run as: sudo perl -0pi ~/plan3-add-xfh.pl <file>
#
# Splits on `location` boundaries and edits ONLY a block that proxies to a LOCAL NODE
# APP (http://localhost:3000, :3001, or http://content_app) AND already sets Host $host.
# The Mailcow blocks (proxy_pass https://localhost:8443) also set Host $host and must
# never be touched -- which is why this is a guarded block walk, not a global s///.
# Idempotent: a block that already carries the header is counted and skipped.
# Refuses (and leaves the file byte-identical) if it edited nothing, or if the number of
# X-Forwarded-Host lines in the result is not exactly the number of local-node blocks.
my ($edited, $already, $mailcow) = (0, 0, 0);
my @out;
for my $blk (split /(?=\n[ \t]*location )/, $_) {
  $mailcow++ if $blk =~ m{proxy_pass https://localhost:8443};
  if ($blk =~ m{proxy_pass http://(?:localhost:300[01]|content_app)}
      && $blk =~ m{\n[ \t]*proxy_set_header Host \$host;}) {
    if ($blk =~ m{X-Forwarded-Host}) { $already++; }
    else {
      $blk =~ s{(\n([ \t]*)proxy_set_header Host \$host;)}{$1\n$2proxy_set_header X-Forwarded-Host \$host;};
      $edited++;
    }
  }
  push @out, $blk;
}
$_ = join '', @out;
my $total = 0; $total++ while /proxy_set_header X-Forwarded-Host \$host;/g;
unless ( ($edited + $already) >= 1 && $total == ($edited + $already) ) {
  die "plan3-xfh: refusing, file NOT modified (edited=$edited already=$already total_xfh=$total mailcow_blocks=$mailcow)\n";
}
warn "plan3-xfh: edited=$edited already=$already total_xfh=$total mailcow_blocks=$mailcow\n";
PERL
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "perl -c ~/plan3-add-xfh.pl 2>&1 | tail -1"
```
  - Expected: `/home/ubuntu/plan3-add-xfh.pl syntax OK`.

- [ ] **Step 1b (R-9 falsification): prove the guard refuses a file with no local-node block.**
```bash
BOX=oci1; IP=161.153.71.201
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'T=$(mktemp)
  printf "server {\n    location / {\n        proxy_pass https://localhost:8443;\n        proxy_set_header Host \$host;\n    }\n}\n" > $T
  M0=$(md5sum < $T); perl -0pi ~/plan3-add-xfh.pl $T; echo "  rc=$?"; M1=$(md5sum < $T)
  echo "  untouched=$([ "$M0" = "$M1" ] && echo yes || echo NO) mailcow_got_xfh=$(grep -c X-Forwarded-Host $T || true)"
  rm -f $T'
```
  - Expected, exactly: `plan3-xfh: refusing, file NOT modified (edited=0 already=0 total_xfh=0 mailcow_blocks=1)`
    on stderr, then `rc=255`, then `untouched=yes mailcow_got_xfh=0`.
  - **`rc=0` means the Mailcow guard does not work.** STOP.

- [ ] **Step 2: Snapshot, apply to both files, then `nginx -t` AND reload in one block.**
```bash
BOX=oci1; IP=161.153.71.201
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y%m%dT%H%M%SZ'); rec "XFH_SNAP_TS_$BOX" "$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
sudo cp -p /etc/nginx/snippets/proxy-node-app.conf ~/nginx-snapshots/proxy-node-app.conf.xfh.$TS
sudo cp -p /etc/nginx/sites-enabled/crhsent.com ~/nginx-snapshots/crhsent.com.xfh.$TS
sudo chown \$(id -un) ~/nginx-snapshots/*.xfh.$TS
for P in /etc/nginx/snippets/proxy-node-app.conf /etc/nginx/sites-enabled/crhsent.com; do
  B=\$(wc -l < \$P); OB=\$(tr -cd '{' < \$P|wc -c); CB=\$(tr -cd '}' < \$P|wc -c)
  sudo perl -0pi ~/plan3-add-xfh.pl \$P
  MW=\$(sudo perl -0ne 'my \$n=0; for my \$b (split /(?=\n[ \t]*location )/, \$_) { \$n++ if \$b =~ m{proxy_pass https://localhost:8443} && \$b =~ /X-Forwarded-Host/ } print \"\$n\"' \$P)
  echo \"  \$(basename \$P) lines=\$B-\>\$(wc -l < \$P) braces=\$OB/\$CB-\>\$(tr -cd '{' < \$P|wc -c)/\$(tr -cd '}' < \$P|wc -c) xfh=\$(grep -c X-Forwarded-Host \$P) mailcow_blocks_with_xfh=\$MW\"
done
W0=\$(ps -o lstart= -p \$(pgrep -f 'nginx: worker' | head -1))
sudo nginx -t && sudo systemctl reload nginx
sleep 3
echo \"  reload_took=\$([ \\\"\$W0\\\" != \\\"\$(ps -o lstart= -p \$(pgrep -f 'nginx: worker' | head -1))\\\" ] && echo yes || echo NO)\""
```
  - Expected, exactly:
    - stderr: `plan3-xfh: edited=1 already=0 total_xfh=1 mailcow_blocks=0` then
      `plan3-xfh: edited=1 already=0 total_xfh=1 mailcow_blocks=1`
    - `proxy-node-app.conf lines=14->15 braces=1/1->1/1 xfh=1 mailcow_blocks_with_xfh=0`
    - `crhsent.com lines=94->95 braces=9/9->9/9 xfh=1 mailcow_blocks_with_xfh=0`
    - the two `nginx -t` lines, then `reload_took=yes`
  - `mailcow_blocks_with_xfh` is counted **per block**, not by `awk '/8443/,0'` — that construct emits
    nothing at all on `proxy-node-app.conf` (which has no `:8443` line), so it reads `0`
    unconditionally and cannot fail.
  - Any `xfh` other than `1`, any brace change, or a non-zero `mailcow_blocks_with_xfh` is a STOP:
    run the Rollback.

- [ ] **Step 3: Prove both apps still answer and that a forged header cannot win.**
```bash
BOX=oci1; IP=161.153.71.201
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP '
echo -n "  portal   : "; curl -sk -m 8 --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/health; echo
echo -n "  crhsent  : "; curl -sk -m 8 --resolve crhsent.com:443:127.0.0.1 https://crhsent.com/health; echo
echo -n "  crhsent baseline (no forged header) : "; curl -sk -m 8 -o /dev/null -w "code=%{http_code}\n" --resolve crhsent.com:443:127.0.0.1 https://crhsent.com/
echo -n "  crhsent + forged XFH: atxwashdryfold.com : "; curl -sk -m 8 -o /dev/null -w "code=%{http_code}\n" -H "X-Forwarded-Host: atxwashdryfold.com" --resolve crhsent.com:443:127.0.0.1 https://crhsent.com/
echo -n "  portal baseline (no forged header)  : "; curl -sk -m 8 -o /dev/null -w "code=%{http_code}\n" --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/health
echo -n "  portal + forged XFH: crhsent.com    : "; curl -sk -m 8 -o /dev/null -w "code=%{http_code}\n" -H "X-Forwarded-Host: crhsent.com" --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/health'
```
  - Expected: `portal : {"status":"UP",…}`; `crhsent : {"status":"ok"}`;
    `crhsent baseline … code=401`; `crhsent + forged XFH … code=401` — **identical to the baseline**,
    i.e. the forged header did not turn `crhsent.com` into a marketing host and dodge the accessGate;
    `portal baseline … code=200`; `portal + forged XFH … code=200`.
  - Each forged probe is paired with its own baseline so the pair is meaningful: a forged probe alone
    would print the same code on a protected and an unprotected system.

- [ ] **Step 4: Pass 2 on oci2, then parity.** Repeat Steps 0–3 with `BOX=oci2; IP=144.24.4.202`.
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env
for B in oci1 oci2; do printf '%s=%q\n' "XFH_DONE_$B" yes >> "$REC"; done
for IP in 161.153.71.201 144.24.4.202; do
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "md5sum /etc/nginx/snippets/proxy-node-app.conf /etc/nginx/sites-enabled/crhsent.com ~/plan3-add-xfh.pl"
done | awk '{print $1}' | sort | uniq -c | sort -rn
```
  - Expected: three groups, each with a count of `2` — the snippet, `crhsent.com` and the script are
    byte-identical across the boxes.

---

### Task 7: Pre-flip baseline from a NON-allowlisted vantage — the last gate before Phase 1

R-15/P9. Slice A's first command would have tripped its own STOP: the workstation egress
`70.114.167.145` is the default `PARTNER_PREVIEW_ALLOWLIST` value (`partnerLanding.js:82`; the key is
set in neither `.env`, so the code default applies), so the workstation receives the **preview partner
page** on all three hosts and never sees the public placeholder.

**Measured 2026-09-21, both vantages, same minute:**

| vantage | atxwashateria | rundberglaundry | atxwashdryfold |
|:--|:--|:--|:--|
| workstation `70.114.167.145` | `comingsoon=0 partner=1 ticker=0` (~26107 B) | same | same |
| oci1 `161.153.71.201` | `comingsoon=1 partner=0 ticker=0` (~1134 B) | `comingsoon=1 partner=0 ticker=0` (~1134 B) | `comingsoon=0 partner=1 ticker=0` (~26107 B) |

The **verdict** is `comingsoon`, never the byte count; the byte figures are parenthetical evidence.

So: **public-state probes run from a box; Lighthouse runs through PSI**, whose fetch originates in
Google's infrastructure and is non-allowlisted by construction. The API key lives in the box's `.env`
and never leaves it. Measured: the key is referer-restricted — without `-H "Referer: …"` PSI answers
`Requests from referer <empty> are blocked`.

**This task does not gate on C14.** C14 is CLOSED (R-10): `crhs-corporate d8c421b` + affiliate
`e5c103ef` are deployed and the public canonical page measures mobile `performance=99
accessibility=100 best-practices=100 seo=100`, CLS `0` (PSI, 2026-09-21, two runs). This task
**records that as evidence** and captures the per-host before numbers that C14-reg (task 14) compares
against. No step here can block the flips on C14.

**Files:**
- Creates `/var/www/wavemax/cutover-logs/psi/p3-before-<host>-<mobile|desktop>-<n>-<date>.json`
  (3 hosts × 2 form factors × 3 runs = 18 files) and `/var/www/wavemax/cutover-logs/p3-baseline.txt`.
- Creates `~/plan3-psi.sh` on oci1 (read-only; it only calls the PSI API).
- **Nothing on a box's served configuration changes. Every request is a normal public GET.**

**Interfaces:**
- **Consumes** — all six Phase-0 tasks, each asserted by a `chk` in Step 0; any failure prints
  `gate=HALT` and this task stops:
  | Consumes | producer | asserted as |
  |:--|:--|:--|
  | `CORP_DEPLOYED_oci1=yes`, `CORP_DEPLOYED_oci2=yes` | Task 1 | `chk t1_oci1 … yes`, `chk t1_oci2 … yes` |
  | `INTEREST_FORM_URL_SET=yes` | Task 2 | `chk t2 … yes` |
  | `PRE404_CLOSED=yes` | Task 3 | `chk t3 … yes` |
  | `IFORM_I18N=yes` | Task 4 | `chk t4 … yes` |
  | `GATE_DELETED_oci1=yes`, `GATE_DELETED_oci2=yes` | Task 5 | `chk t5_oci1 … yes`, `chk t5_oci2 … yes` |
  | `XFH_DONE_oci1=yes`, `XFH_DONE_oci2=yes` | Task 6 | `chk t6_oci1 … yes`, `chk t6_oci2 … yes` |
  | `BOX_BUSY` empty | C-9 | `chk busy ""` |
- **Produces:** `BASELINE_DATE`, `VANTAGE_OK=yes`, `PRE_<hostkey>_<ff>_<cat>` scores,
  `LEN_CONTENT`, `LEN_PORTAL_<hostkey>` (evidence only, never a gate), `C14_EVIDENCE`,
  `PHASE0_COMPLETE=yes` — the single key tasks 8–14 assert.

**Rollback (exact).** Nothing on a box's configuration changed; this task only read public pages and
wrote local evidence.
```bash
EV=/var/www/wavemax/cutover-logs
rm -f "$EV"/psi/p3-before-*.json "$EV/p3-baseline.txt"
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'rm -f ~/plan3-psi.sh; ls ~/plan3-psi.sh 2>/dev/null | wc -l'
ls "$EV"/psi/p3-before-* 2>/dev/null | wc -l
```
- Rollback expected: `0`, then `0`.
- The record keys this task wrote are left in place (they are evidence); re-running the task appends
  fresh ones, and the last assignment wins on `source`.

- [ ] **Step 0: Assert all six Phase-0 tasks completed.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
FAIL=0
chk() { if [ "$2" = "$3" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=[$2] want=[$3]"; FAIL=1; fi; }
chk t1_oci1 "${CORP_DEPLOYED_oci1:-}"     yes
chk t1_oci2 "${CORP_DEPLOYED_oci2:-}"     yes
chk t2      "${INTEREST_FORM_URL_SET:-}"  yes
chk t3      "${PRE404_CLOSED:-}"          yes
chk t4      "${IFORM_I18N:-}"             yes
chk t5_oci1 "${GATE_DELETED_oci1:-}"      yes
chk t5_oci2 "${GATE_DELETED_oci2:-}"      yes
chk t6_oci1 "${XFH_DONE_oci1:-}"          yes
chk t6_oci2 "${XFH_DONE_oci2:-}"          yes
chk busy    "${BOX_BUSY:-}"               ""
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
D=$(date -u +%F); rec BASELINE_DATE "$D"; mkdir -p "$EV/psi"; echo "date=$D"
```
  - Expected: ten `OK` lines, `gate=PASS`, `date=<YYYY-MM-DD>`.

- [ ] **Step 1: Prove the vantage is non-allowlisted — structurally, not by asserting an IP.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
echo "=== from oci1 (the measurement vantage)"
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 '
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com; do
  B=$(mktemp); curl -s -m 20 -o "$B" -w "  $H code=%{http_code} len=%{size_download} " "https://$H/?p=$(date +%s)"
  printf "comingsoon=%s ticker=%s partner=%s\n" "$(grep -c "<title>Coming soon</title>" "$B" || true)" "$(grep -c "<aside class=\"ap-ticker\"" "$B" || true)" "$(grep -c "data-i18n=\"partner.meta.title\"" "$B" || true)"
  rm -f "$B"
done'
echo "=== from the workstation (for contrast only — NOT the measurement vantage)"
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com; do
  B=$(mktemp); curl -s -m 20 -o "$B" -w "  $H code=%{http_code} len=%{size_download} " "https://$H/?p=$(date +%s)"
  printf 'comingsoon=%s ticker=%s partner=%s\n' "$(grep -c '<title>Coming soon</title>' "$B" || true)" "$(grep -c '<aside class="ap-ticker"' "$B" || true)" "$(grep -c 'data-i18n="partner.meta.title"' "$B" || true)"
  rm -f "$B"
done
```
  - Expected **from oci1**, exactly:
    - `atxwashateria.com   code=200 len=<~1134>  comingsoon=1 ticker=0 partner=0`
    - `rundberglaundry.com code=200 len=<~1134>  comingsoon=1 ticker=0 partner=0`
    - `atxwashdryfold.com  code=200 len=<~26107> comingsoon=0 ticker=0 partner=1`
  - **The verdict is `comingsoon` / `partner` / `ticker`. `len` is printed as evidence and is not
    compared against anything** — the `<~…>` figures are last-measured values, not thresholds.
  - Expected **from the workstation**: all three `comingsoon=0 ticker=0 partner=1` — the preview page.
  - **`comingsoon=1` on the two placeholder hosts is the proof the vantage is non-allowlisted.** If
    oci1 reports `comingsoon=0` on them, either `PARTNER_PREVIEW_ALLOWLIST` has been widened or the
    hosts were launched publicly: STOP and re-establish before measuring anything.
  - `ticker=0` on all three confirms the **portal** is still serving every marketing host (C-4).
  - `len` values are recorded as **evidence only** — no later step compares against them:
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
rec VANTAGE_OK yes
rec LEN_CONTENT "$(ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'curl -s -o /dev/null -w "%{size_download}" -H "Host: atxwashdryfold.com" http://127.0.0.1:3001/')"
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com; do HK=${H//./_}
  rec "LEN_PORTAL_$HK" "$(ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "curl -s -o /dev/null -w '%{size_download}' -H 'Host: $H' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/")"
done
grep -E '^(LEN_|VANTAGE_OK)' "$REC" | tail -5
```
  - Expected: `VANTAGE_OK=yes`, `LEN_CONTENT=27593`-ish, `LEN_PORTAL_atxwashateria_com=1134`,
    `LEN_PORTAL_rundberglaundry_com=1134`, `LEN_PORTAL_atxwashdryfold_com=25701`-ish.
  - These are the numbers slice A froze into 17 literal assertions. They have already moved twice
    (`27477 → 27593`, `25585 → 25701`). **Nothing in this plan compares against them.**

- [ ] **Step 2: Install the PSI runner on oci1 (read-only) and prove the key works.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "tee ~/plan3-psi.sh >/dev/null" <<'SH'
#!/bin/bash
# Plan 3 — PageSpeed Insights runner. Read-only: it only calls the PSI API, which fetches
# the public page from Google's own infrastructure -- i.e. a vantage that is NOT in
# PARTNER_PREVIEW_ALLOWLIST, which is the whole point (R-15/P9).
# Usage: bash ~/plan3-psi.sh <url> <mobile|desktop> <outfile>
set -u
URL=${1:?url}; STRAT=${2:?mobile|desktop}; OUT=${3:?outfile}
K=$(grep -m1 '^GOOGLE_PLACES_API_KEY=' /var/www/wavemax/wavemax-affiliate-program/.env | cut -d= -f2-)
[ -n "$K" ] || { echo "PSI_ERR no key"; exit 1; }
# The key is referer-restricted: without this header PSI answers
# "Requests from referer <empty> are blocked."
curl -s -m 240 -H "Referer: https://portal.atxwashdryfold.com/" \
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=$(printf %s "$URL" | sed 's/:/%3A/g;s|/|%2F|g')&strategy=$STRAT&category=performance&category=accessibility&category=best-practices&category=seo&key=$K" \
  -o "$OUT"
node -e '
const fs=require("fs"); let j;
try { j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); } catch(e) { console.log("PSI_ERR parse"); process.exit(1); }
if (j.error) { console.log("PSI_ERR "+String(j.error.message).slice(0,120)); process.exit(1); }
const L=j.lighthouseResult, c=L.categories, a=L.audits;
const s=["performance","accessibility","best-practices","seo"].map(k=>k+"="+Math.round(c[k].score*100)).join(" ");
console.log(`PSI ${process.argv[2]} ${process.argv[3]} ${s} crawlable=${a["is-crawlable"]?a["is-crawlable"].score:"na"} cls=${a["cumulative-layout-shift"].displayValue} lh=${L.lighthouseVersion}`);
' "$OUT" "$URL" "$STRAT"
SH
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'bash -n ~/plan3-psi.sh && echo "syntax OK" && bash ~/plan3-psi.sh "https://atxwashdryfold.com/" mobile /tmp/psi-smoke.json && rm -f /tmp/psi-smoke.json'
```
  - Expected: `syntax OK`, then
    `PSI https://atxwashdryfold.com/ mobile performance=99 accessibility=100 best-practices=100 seo=100 crawlable=1 cls=0 lh=<12.x>`
    (Performance may read 98–100; the other three and `crawlable=1` are stable).
  - `PSI_ERR Requests from referer <empty> are blocked` means the `Referer` header was dropped.
  - `PSI_ERR Lighthouse returned error: Something went wrong` is a transient PSI failure — re-run once.

- [ ] **Step 3: Measure the three hosts, mobile ×3 + desktop ×3, from the PSI vantage.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
mkdir -p "$EV/psi"
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com; do
  for FF in mobile desktop; do
    for N in 1 2 3; do
      F="p3-before-$H-$FF-$N-$BASELINE_DATE.json"
      ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "bash ~/plan3-psi.sh 'https://$H/' $FF /tmp/$F"
      ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "cat /tmp/$F" > "$EV/psi/$F"
      ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "rm -f /tmp/$F"
    done
  done
done
ls "$EV/psi" | grep -c "^p3-before-.*-$BASELINE_DATE\.json$"
```
  - Expected: 18 `PSI …` lines, then `18`.
  - Any `PSI_ERR` line: re-run that one triple. Do not proceed with a partial set.

- [ ] **Step 4: Score, record, and state plainly which numbers are evidence and which are references.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
node -e '
const fs=require("fs"), dir=process.argv[1], d=process.argv[2];
const hosts=["atxwashateria.com","rundberglaundry.com","atxwashdryfold.com"];
const cats=["performance","accessibility","best-practices","seo"];
const out=[];
for (const h of hosts) for (const ff of ["mobile","desktop"]) {
  const runs=[];
  for (const n of [1,2,3]) {
    const j=JSON.parse(fs.readFileSync(`${dir}/p3-before-${h}-${ff}-${n}-${d}.json`,"utf8"));
    const c=j.lighthouseResult.categories, a=j.lighthouseResult.audits;
    const s=Object.fromEntries(cats.map(k=>[k,Math.round(c[k].score*100)]));
    s.crawlable=a["is-crawlable"]?a["is-crawlable"].score:null;
    runs.push(s);
  }
  const perf=runs.map(r=>r.performance).sort((a,b)=>a-b);
  const med=perf[1], spread=perf[2]-perf[0];
  const ref=Object.fromEntries(cats.map(k=>[k, k==="performance"?med:runs[0][k]]));
  out.push(`BEFORE ${h} ${ff} `+cats.map(k=>k+"="+ref[k]).join(" ")+` perf_runs=${perf.join(",")} spread=${spread} crawlable=${runs[0].crawlable}`);
  const hk=h.replace(/\./g,"_");
  for (const k of cats) out.push(`REC PRE_${hk}_${ff}_${k.replace(/-/g,"_")}=${ref[k]}`);
}
console.log(out.join("\n"));
' "$EV/psi" "$BASELINE_DATE" | tee "$EV/p3-baseline.txt"
V=${PIPESTATUS[0]}; echo "score_exit=$V"
grep '^REC ' "$EV/p3-baseline.txt" | sed 's/^REC //' >> "$REC"
printf '%s=%q\n' C14_EVIDENCE 'CLOSED R-10: crhs-corporate d8c421b + affiliate e5c103ef deployed; atxwashdryfold.com public mobile perf 99 a11y/bp/seo 100, CLS 0 (PSI 2026-09-21)' >> "$REC"
printf '%s=%q\n' PHASE0_COMPLETE yes >> "$REC"
grep -c '^PHASE0_COMPLETE=yes$' "$REC"
```
  - Expected: `score_exit=0`; six `BEFORE …` lines and 24 `REC PRE_…` lines; then `1`.
  - **`atxwashdryfold.com`** must read `accessibility=100 best-practices=100 seo=100 crawlable=1` on
    both form factors, with `performance` ≥ 95. These four numbers are the **C14-reg reference** that
    task 14 compares against, and this is the only host where a before/after comparison is meaningful.
  - **`atxwashateria.com` and `rundberglaundry.com`** will read `crawlable=0` and `seo` well below 100
    (measured 2026-09-21: `seo=54`, `accessibility=95`). That is the `noindex` placeholder failing
    `is-crawlable`, it is **expected**, and it is **not a blocker** — these numbers are recorded as
    evidence of what the public saw, never as a threshold. A `crawlable=1` here would instead mean the
    vantage was allowlisted after all: STOP and re-read Step 1.
  - `spread` is informational here. C14-stab (`spread ≤ 5`) applies only to the **after** runs.

---

## Phase 1 — the flips. One host, then both boxes, then the next host.

Order: **`atxwashateria.com` → `rundberglaundry.com` → `atxwashdryfold.com`.**
`atxwashateria.com` first because it serves a `noindex` placeholder to the public (measured
`crawlable=0`), so there is no indexed equity to regress — **not** because it is the lowest-traffic
host, which it is not (759 req/day vs 345 and 176; the brief's stated reason was wrong).

Box order within a host: **oci1, then oci2, immediately.** Cloudflare round-robins the shared pool, so
a host is publicly inconsistent between the two box flips. That window is minutes, never a break.

### Task 8: [per box] Add the `:3001` upstream, the content-app snippet, the flip transform and the verify script — additive, nothing switches

**Files:** box only, per box.
- Creates `/etc/nginx/conf.d/content-app-upstream.conf`.
- Creates `/etc/nginx/snippets/proxy-content-app.conf`.
- Creates `~/plan3-flip-to-content-app.pl` (tasks 9–14 apply it; nothing runs it here).
- Creates `~/plan3-verify-host.sh` (read-only; every flip task runs it before and after).
- **Modifies nothing.** No `server` block references either new nginx file yet.
- **`/etc/nginx/snippets/proxy-node-app.conf` is not touched** — it is the portal's proxy path (D-1).

**Interfaces:**
- **Consumes** (asserted, Step 0):
  - `PHASE0_COMPLETE=yes` (T7) — which is itself only recorded after T1–T6 all asserted;
  - `GATE_DELETED_<box>=yes` (T5) — so the new `error_page 503` cannot be re-intercepted by the
    deleted `@maintenance` handler, and so the flip transform's expected line counts (122 → 111, not
    127 → 116) are the right ones;
  - `XFH_DONE_<box>=yes` (T6);
  - nginx 1.18 with **no** existing `upstream` block (an `upstream` cannot live inside a `server`
    block, which is why this is a `conf.d` file).
- **Produces:** `SNIPPET_READY_<box>=yes`, plus the two nginx files and the two scripts that tasks
  9–14 consume.

**Design notes, each deliberate:**
- `proxy_http_version 1.1` + `proxy_set_header Connection "";` + `keepalive 16;` — the textbook
  pairing. The `:3000` snippet instead sends `Connection: 'upgrade'` on every request; the content app
  has no WebSocket endpoint, so `Upgrade` handling is dropped rather than copied.
- `proxy_set_header X-Forwarded-Host $host;` from birth (R-3) — nginx overwrites any client value.
- `max_fails=0` on the single upstream server: with one server, passive failure marking can only
  produce a `fail_timeout` window of hard 502s after the app has already recovered.
- `error_page 502 504 = @content_unavailable` with `proxy_intercept_errors off`: nginx's **own**
  upstream errors (connection refused, timeout) become `503 + Retry-After: 30`, while a 502 the app
  itself returns passes through untouched. This is the nginx half of brief item 20 (task 15).
- The 503 page carries **no brand name** — no franchisor mark, per the Task 5 rationale.

**Rollback (exact).** Both files are new and unreferenced, so deleting them is a no-op for traffic.
```bash
BOX=oci1; IP=161.153.71.201        # or BOX=oci2; IP=144.24.4.202
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
N=\$(grep -l 'proxy-content-app.conf' /etc/nginx/sites-enabled/* 2>/dev/null | wc -l)
[ \"\$N\" = 0 ] || { echo \"REFUSE: \$N vhost(s) still include the content snippet - roll those flips back first\"; exit 1; }
sudo rm -f /etc/nginx/conf.d/content-app-upstream.conf /etc/nginx/snippets/proxy-content-app.conf
rm -f ~/plan3-flip-to-content-app.pl
sudo nginx -t && sudo systemctl reload nginx
echo \"  content_app_refs=\$(sudo nginx -T 2>/dev/null | grep -c content_app || true)\"
curl -sk -m 8 --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/health; echo"
```
- Rollback expected: the two `nginx -t` lines, `content_app_refs=0`, `{"status":"UP",…}`.
- It **refuses** while any host still includes the snippet — removing it then would break that host.
  `~/plan3-verify-host.sh` is left in place: it is read-only and useful during a rollback.

- [ ] **Step 0: Set the box and assert every Consumes.**
```bash
BOX=oci1; IP=161.153.71.201        # Pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
FAIL=0
chk() { if [ "$2" = "$3" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=[$2] want=[$3]"; FAIL=1; fi; }
chk phase0 "${PHASE0_COMPLETE:-}" yes
V=GATE_DELETED_$BOX; chk gate_deleted "${!V:-}" yes
V=XFH_DONE_$BOX;     chk xfh_done     "${!V:-}" yes
S=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'printf "%s %s %s %s\n" \
  "$(nginx -v 2>&1 | sed "s#.*/##;s/ .*//")" \
  "$(sudo -n nginx -T 2>/dev/null | grep -cE "^[[:space:]]*upstream " || true)" \
  "$(grep -l "proxy-node-app.conf" /etc/nginx/sites-enabled/* | wc -l)" \
  "$(grep -l "proxy-content-app.conf" /etc/nginx/sites-enabled/* 2>/dev/null | wc -l)"')
set -- $S
chk nginx_version   "$1" 1.18.0
chk existing_upstreams "$2" 0
chk portal_snippet_hosts "$3" 4
chk content_snippet_hosts "$4" 0
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: seven `OK` lines then `gate=PASS`.
  - `portal_snippet_hosts=4` is the pre-flip count (three marketing hosts + the portal). It drops by
    one per host flipped and must read `1` after task 14.

- [ ] **Step 1: Write the upstream.**
```bash
BOX=oci1; IP=161.153.71.201
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "sudo tee /etc/nginx/conf.d/content-app-upstream.conf >/dev/null <<'NGINX'
# The content app (crhs-corporate) on this box. Plan 3 Task 8.
#
# http-level on purpose: an upstream cannot be declared inside a server block, which is
# why this is a conf.d file and snippets/proxy-content-app.conf is not.
#
# Single origin by design. A peer-box backup was evaluated and REJECTED: there is NO
# network path between the boxes on any port (measured -- ICMP, :22, :443 and :3001 are
# all closed on the private subnet 10.0.1.0/24 and publicly), so it would need an OCI
# VCN security-list rule plus persisted iptables on both boxes, and would open an
# unauthenticated plaintext path to the content app that bypasses Cloudflare. See Task 15.
upstream content_app {
    server 127.0.0.1:3001 max_fails=0;
    keepalive 16;
}
NGINX
sudo nginx -t"
```
  - Expected: the two `nginx -t` lines. An unused upstream is valid configuration.

- [ ] **Step 2: Write the content-app proxy snippet.**
```bash
BOX=oci1; IP=161.153.71.201
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "sudo tee /etc/nginx/snippets/proxy-content-app.conf >/dev/null <<'NGINX'
# Proxy to the content app (crhs-corporate) via upstream content_app -> :3001.
# Use inside an HTTPS server block. Plan 3 Task 8.
#
# Counterpart of proxy-node-app.conf, which proxies to the PORTAL on :3000 and must stay
# in place for portal.atxwashdryfold.com. A host is flipped by changing which of the two
# it includes; rollback is swapping the include back and reloading.
# Requires conf.d/content-app-upstream.conf.
location / {
    proxy_pass http://content_app;
    proxy_http_version 1.1;
    proxy_set_header Connection \"\";
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Original-URI \$request_uri;
    proxy_connect_timeout 2s;
    proxy_read_timeout 30s;

    # Brief item 20: while the CF pool health change is still propagating, answer with a
    # 503 + Retry-After instead of a bare nginx 502. 'off' keeps a 502 the app itself
    # returns passing through untouched.
    proxy_intercept_errors off;
    error_page 502 504 = @content_unavailable;
}

location @content_unavailable {
    internal;
    default_type text/html;
    add_header Cache-Control \"no-store\" always;
    add_header Retry-After 30 always;
    return 503 '<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Temporarily unavailable</title><style>html,body{margin:0;background:#F2E7D2;color:#1f2937;font-family:-apple-system,Segoe UI,Roboto,sans-serif;min-height:100vh}body{display:flex;align-items:center;justify-content:center;padding:24px}main{max-width:460px;text-align:center}h1{font-size:24px;margin:0 0 12px}p{font-size:16px;line-height:1.55;margin:0}</style></head><body><main><h1>Temporarily unavailable</h1><p>This page is briefly offline while the site restarts. Please try again in about 30 seconds.</p></main></body></html>';
}
NGINX
sudo nginx -t
echo \"  brand_refs=\$(grep -ciE 'wavemax|invite-only|rundberg' /etc/nginx/snippets/proxy-content-app.conf || true)\"
echo \"  xfh=\$(grep -c 'X-Forwarded-Host' /etc/nginx/snippets/proxy-content-app.conf)\"
echo \"  upgrade_header=\$(grep -c 'Upgrade' /etc/nginx/snippets/proxy-content-app.conf || true)\""
```
  - Expected: the two `nginx -t` lines, then `brand_refs=0`, `xfh=1`, `upgrade_header=0`.
  - `brand_refs` above `0` would put a franchisor mark back on our origin — the exact thing Task 5
    removed.

- [ ] **Step 3: Install `~/plan3-flip-to-content-app.pl` — one pass, all-or-nothing, idempotent.**
      Host-independent: the vhost name is captured and the rewrite pattern covers both `/austin-tx/`
      and `/austin-tx/wash-dry-fold/`. Three edits in **one** pass, so the include swap and the
      rewrite removal can never be separated — an intermediate state would 404 every apex request.
```bash
BOX=oci1; IP=161.153.71.201
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "tee ~/plan3-flip-to-content-app.pl >/dev/null" <<'PERL'
# Plan 3 Tasks 9-14 — flip one marketing vhost from the portal (:3000) to the content app (:3001).
# Run as: sudo perl -0pi ~/plan3-flip-to-content-app.pl /etc/nginx/sites-enabled/<host>
#
# ALL-OR-NOTHING. Four counted edits. If some but not all apply -- a reworded comment, a
# re-indented block -- it dies and perl -i leaves the ORIGINAL byte-identical, because -i
# renames the temp file only on success. Without this, edit 3 (the include swap) could land
# while edit 2 (the rewrite removal) silently no-ops, leaving a syntactically valid file that
# points at :3001 AND still rewrites / to /austin-tx/, which the content app 404s.
# Re-running on an already-flipped file is a byte no-op and exits 0.

# 1. Replace the stale header comment. Anchored on "mirrors wavemax.promo", which the
#    replacement text cannot contain -- that is what makes this idempotent.
my $n1 = 0 + s{\A\# ([a-z0-9.\-]+) \N*mirrors wavemax\.promo\N*\n(?:\#\N*\n)+\n}
              {\# $1 - served by the content app (crhs-corporate) on :3001.\n\# plus mail.$1 -> Mailcow at localhost:8443.\n\# www -> apex 301 (one canonical URL per domain).\n\n};

# 2. Delete the legacy /austin-tx/ rewrite. The content app serves / directly and 404s
#    /austin-tx/, so this MUST go in the same pass as the include swap.
my $n2 = 0 + s{\n[ \t]*\# Default route \N*\n[ \t]*location = / \{\n[ \t]*rewrite \^ /austin-tx/\S* last;\n[ \t]*\}\n}{\n};

# 3. Swap the proxy snippet: :3000 -> :3001. Rollback = restore the snapshot + reload.
my $n3 = 0 + s{include /etc/nginx/snippets/proxy-node-app\.conf;}
              {include /etc/nginx/snippets/proxy-content-app.conf;};

# 4. The apex server-block comment still says "Node app (gated, identical to wavemax.promo)"
#    -- both halves untrue after the flip and after the gate deletion.
my $n4 = 0 + s{^\# HTTPS \N*apex \N*Node app\N*$}
              {\# HTTPS apex -> the content app (crhs-corporate) on :3001.}m;

my $flipped = m{include /etc/nginx/snippets/proxy-content-app\.conf;} ? 1 : 0;
my $sum = $n1 + $n2 + $n3 + $n4;
unless ( ($n1==1 && $n2==1 && $n3==1 && $n4==1) || ($sum==0 && $flipped) ) {
  die "plan3-flip: partial apply (comment=$n1 rewrite=$n2 include=$n3 apexcomment=$n4 flipped=$flipped) - refusing, file NOT modified\n";
}

# 5. Collapse the blank-line runs the gate removal and edit 2 leave behind. The three live
#    files contain zero pre-existing triple-blank runs (verified), so this only tidies what
#    this plan removed.
s{\n\n\n+}{\n\n}g;
PERL
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "perl -c ~/plan3-flip-to-content-app.pl 2>&1 | tail -1; md5sum ~/plan3-flip-to-content-app.pl"
```
  - Expected: `/home/ubuntu/plan3-flip-to-content-app.pl syntax OK`, then an md5 asserted identical
    across the boxes in Step 6.

- [ ] **Step 3b (R-9 falsification — run all three cases; nothing under `/etc/nginx` is touched).**
```bash
BOX=oci1; IP=161.153.71.201
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP '
echo "--- case A: clean apply on a copy"
T=$(mktemp); cp /etc/nginx/sites-enabled/atxwashateria.com $T
B=$(wc -l < $T); perl -0pi ~/plan3-flip-to-content-app.pl $T; echo "  rc=$? lines=$B->$(wc -l < $T) rewrite_left=$(grep -c "rewrite \^ /austin-tx" $T || true) content_snip=$(grep -c proxy-content-app.conf $T) braces=$(tr -cd "{" < $T|wc -c)/$(tr -cd "}" < $T|wc -c) servers=$(grep -c "^server {" $T) mailcow=$(grep -c localhost:8443 $T) acme=$(grep -c acme-challenge $T)"
echo "--- case B: idempotent re-run must be a byte no-op"
M0=$(md5sum < $T); perl -0pi ~/plan3-flip-to-content-app.pl $T; echo "  rc=$? identical=$([ "$M0" = "$(md5sum < $T)" ] && echo yes || echo NO) lines=$(wc -l < $T)"
echo "--- case C: reworded rewrite anchor must DIE and leave the file untouched"
U=$(mktemp); cp /etc/nginx/sites-enabled/rundberglaundry.com $U
sed -i "s|^    # Default route .*|    # Default routing to the Austin tree.|" $U
M1=$(md5sum < $U); perl -0pi ~/plan3-flip-to-content-app.pl $U; echo "  rc=$?"
echo "  untouched=$([ "$M1" = "$(md5sum < $U)" ] && echo yes || echo NO) content_snip=$(grep -c proxy-content-app.conf $U || true) rewrite_left=$(grep -c "rewrite \^ /austin-tx" $U || true)"
rm -f $T $U'
```
  - Expected, exactly (reproduced during assembly against byte-copies of the live oci1 files):
    - case A: `rc=0 lines=122->111 rewrite_left=0 content_snip=1 braces=11/11 servers=5 mailcow=6 acme=1`
    - case B: `rc=0 identical=yes lines=111`
    - case C: the stderr line
      `plan3-flip: partial apply (comment=1 rewrite=0 include=1 apexcomment=1 flipped=1) - refusing, file NOT modified`,
      then `rc=255`, then `untouched=yes content_snip=0 rewrite_left=1`
  - **Case C `rc=0` means the all-or-nothing guard does not work** and the single most dangerous
    outcome in Phase 1 — a valid config that points at `:3001` while still rewriting to a path the
    content app 404s — is unguarded. STOP.
  - Case A printing `lines=127->116 … braces=12/12` instead means Task 5 did not land on this box and
    Step 0's assertion was skipped. STOP.

- [ ] **Step 4: Install `~/plan3-verify-host.sh` — the single per-host probe set (read-only).**
      One artefact instead of six hand-copied probe blocks, so no host can quietly be verified less
      thoroughly than another. It computes `app=` from the three **structural** facts of C-4 and
      refuses to guess.
```bash
BOX=oci1; IP=161.153.71.201
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "tee ~/plan3-verify-host.sh >/dev/null" <<'SH'
#!/bin/bash
# Plan 3 — per-host verification, run ON the box, through the box's own nginx.
# Usage: bash ~/plan3-verify-host.sh <marketing-host>
# Read-only. One KEY=value line per probe. Exit 2 if the app identity is ambiguous.
# NO BYTE COUNT IS EVER A VERDICT: root_bytes is printed as evidence only.
set -u
H=${1:?usage: plan3-verify-host.sh <host>}
R="--resolve $H:443:127.0.0.1"
g() { curl -sk -m 8 -o /dev/null -w "$1" $R "https://$H$2"; }
B=$(mktemp); curl -sk -m 8 $R "https://$H/" -o "$B"

# --- structural app identity (three independent facts; all must agree)
HCT=$(curl -sk -m 8 -D- -o /dev/null $R "https://$H/health" | awk 'tolower($1)=="content-type:"{print $2}' | tr -d '\r;')
HBODY=$(curl -sk -m 8 $R "https://$H/health" | head -c 32 | tr -d '\n')
HORIGIN=$(g '%{http_code}' /health/origin)     # portal-only route: 200 on :3000, 404 on :3001
TICKER=$(grep -c '<aside class="ap-ticker"' "$B" || true)
if   [ "$HCT" = "application/json" ] && [ "$HBODY" = '{"status":"ok"}' ] && [ "$HORIGIN" = 404 ] && [ "$TICKER" = 1 ]; then APP=content
elif [ "$HCT" = "text/html" ] && [ "$HORIGIN" = 200 ] && [ "$TICKER" = 0 ]; then APP=portal
else APP=AMBIGUOUS; fi

echo "host=$H"
echo "app=$APP health_ct=$HCT health_body=$HBODY health_origin=$HORIGIN ticker=$TICKER"
echo "canonical=$(grep -o '<link rel="canonical" href="[^"]*"' "$B" | head -1 | sed 's/.*href="//;s/"$//')"
echo "root_code=$(g '%{http_code}' /) root_bytes=$(g '%{size_download}' /)  # bytes = evidence, not a gate"
echo "austin_tx=$(g '%{http_code}' /austin-tx/) austin_wdf=$(g '%{http_code}' /austin-tx/wash-dry-fold/)"
for P in /privacy-policy /terms-and-conditions /terms-of-service /terms-of-service.html /refund-policy /refund-policy.html; do
  echo "legal${P//\//_}=$(g '%{http_code}' "$P")/$(g '%{redirect_url}' "$P")"
done
Q='/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate'
echo "reset=$(g '%{http_code}' "$Q")/$(g '%{redirect_url}' "$Q")"
echo "robots=$(g '%{http_code}' /robots.txt) sitemap=$(g '%{http_code}' /sitemap.xml) affiliate=$(g '%{http_code}' /affiliate)"
echo "portal_guard=$(curl -sk -m 8 --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/health | grep -o '"status":"UP"')"
echo "crhsent_guard=$(curl -sk -m 8 --resolve crhsent.com:443:127.0.0.1 https://crhsent.com/health)"
echo "crhsent_gate=$(curl -sk -m 8 -o /dev/null -w '%{http_code}' --resolve crhsent.com:443:127.0.0.1 https://crhsent.com/)"
rm -f "$B"
[ "$APP" = AMBIGUOUS ] && exit 2 || exit 0
SH
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "bash -n ~/plan3-verify-host.sh && echo 'syntax OK' && bash ~/plan3-verify-host.sh atxwashateria.com; echo rc=\$?"
```
  - Expected: `syntax OK`, then the **PRE-FLIP profile** — the reference every flip task compares
    against (captured live on oci1, 2026-09-21, after Task 3 has deployed):
```
host=atxwashateria.com
app=portal health_ct=text/html health_body=<!DOCTYPE html><html lang="en"> health_origin=200 ticker=0
canonical=
root_code=200 root_bytes=<~1134>  # bytes = evidence, not a gate
austin_tx=200 austin_wdf=200
legal_privacy-policy=200/
legal_terms-and-conditions=200/
legal_terms-of-service=200/
legal_terms-of-service.html=200/
legal_refund-policy=200/
legal_refund-policy.html=200/
reset=200/
robots=200 sitemap=200 affiliate=200
portal_guard="status":"UP"
crhsent_guard={"status":"ok"}
crhsent_gate=401
rc=0
```
  - **The POST-FLIP profile**, asserted by every flip task:
```
app=content health_ct=application/json health_body={"status":"ok"} health_origin=404 ticker=1
canonical=https://atxwashdryfold.com/
root_code=200 root_bytes=<evidence, whatever it is>
austin_tx=404 austin_wdf=404
legal_*=301/https://portal.atxwashdryfold.com<path>        (all six)
reset=301/https://portal.atxwashdryfold.com/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate
robots=200 sitemap=200 affiliate=200
portal_guard="status":"UP"   crhsent_guard={"status":"ok"}   crhsent_gate=401
rc=0
```
  - `app=AMBIGUOUS` (`rc=2`) means the three structural facts disagree — a half-applied flip or a
    degraded app. It is a **roll-back-now** condition, never a note for later. So is any
    `legal_*=404`, a `reset` that is not the token-preserving 301, `robots=404`, `sitemap=404`, a
    `portal_guard` that is not `"status":"UP"`, or a `crhsent_gate` that is not `401`.
  - On an unflipped marketing host the six `legal_*` and `reset` lines read `200/` — the Task 3
    redirects live in the **content** app, so they only appear once that host is on `:3001`.

- [ ] **Step 5: Reload and prove the new files are parsed but referenced by nothing.**
```bash
BOX=oci1; IP=161.153.71.201
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
W0=\$(ps -o lstart= -p \$(pgrep -f 'nginx: worker' | head -1))
sudo nginx -t && sudo systemctl reload nginx
sleep 3
echo \"  reload_took=\$([ \\\"\$W0\\\" != \\\"\$(ps -o lstart= -p \$(pgrep -f 'nginx: worker' | head -1))\\\" ] && echo yes || echo NO)\"
echo \"  upstream_declared=\$(sudo nginx -T 2>/dev/null | grep -c 'upstream content_app')\"
echo \"  hosts_including_content_snippet=\$(grep -l 'proxy-content-app.conf' /etc/nginx/sites-enabled/* 2>/dev/null | wc -l)\"
echo \"  hosts_including_portal_snippet=\$(grep -l 'proxy-node-app.conf' /etc/nginx/sites-enabled/* | wc -l)\""
```
  - Expected: the two `nginx -t` lines, `reload_took=yes`, `upstream_declared=1`,
    `hosts_including_content_snippet=0`, `hosts_including_portal_snippet=4`.

- [ ] **Step 6: Prove all five hosts still serve exactly what they served, then Pass 2 and parity.**
```bash
BOX=oci1; IP=161.153.71.201
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com; do
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "bash ~/plan3-verify-host.sh $H | head -2"
done
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP '
  printf "  portal / -> %s   crhsent / -> %s\n" \
    "$(curl -sk -m 8 -o /dev/null -w "%{http_code}" --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/)" \
    "$(curl -sk -m 8 -o /dev/null -w "%{http_code}" --resolve crhsent.com:443:127.0.0.1 https://crhsent.com/)"'
printf '%s=%q\n' "SNIPPET_READY_$BOX" yes >> "$REC"
```
  - Expected: three `host=…` / `app=portal …` pairs — **every marketing host still on the portal** —
    then `portal / -> 200   crhsent / -> 401`.
  - Any `app=content` here would mean a host flipped in a task that changes nothing. STOP.
```bash
# Pass 2: repeat Steps 0-6 with BOX=oci2; IP=144.24.4.202. Then parity:
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
echo "ready oci1=$SNIPPET_READY_oci1 oci2=$SNIPPET_READY_oci2"
for IP in 161.153.71.201 144.24.4.202; do
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "md5sum /etc/nginx/conf.d/content-app-upstream.conf /etc/nginx/snippets/proxy-content-app.conf ~/plan3-flip-to-content-app.pl ~/plan3-verify-host.sh"
done | awk '{print $1}' | sort | uniq -c | sort -rn
```
  - Expected: `ready oci1=yes oci2=yes`, then **four** groups each with a count of `2` — the two nginx
    files and the two scripts byte-identical across the boxes.
  - A group with a count of `1` means the boxes will behave differently for the same public request.
    STOP before any flip.

---

### Task 9: `atxwashateria.com` on **oci1** — the first public flip

**Why this host first.** It serves the `noindex` "Coming soon" placeholder to every public IP
(measured from the non-allowlisted vantage: `comingsoon=1 partner=0`, PSI `crawlable=0 seo=54`), so
there is **no indexed equity to regress** — the flip is a strict upgrade, placeholder → real indexable
page. It is not the canonical host (`canonical`, `og:url` and the sitemap all name
`atxwashdryfold.com`), so a mistake here cannot damage the canonical identity. Its rewrite is the
simple `/austin-tx/` form, and it carries no `/embed-app-v2.html` traffic.
**The brief's stated reason — "the lowest-traffic host with real content" — is wrong on both counts**
(it is the highest-request host of the three, and it has no real content); the conclusion stands.

**Files:** box only (oci1). Modifies `/etc/nginx/sites-enabled/atxwashateria.com` — **one atomic
`perl -0pi` pass** that both swaps the include and deletes the `location = / { rewrite … }` block.
Creates `~/nginx-snapshots/atxwashateria.com.preflip.<TS>`.

**Interfaces:**
- **Consumes** (asserted, Step 0 — every one of these HALTS the task):
  - `PHASE0_COMPLETE=yes` (T7);
  - `PRE404_CLOSED=yes` (T3) — without it `/privacy-policy`, `/terms-and-conditions`,
    `/terms-of-service`, `/terms-of-service.html`, `/refund-policy` and `/refund-policy.html` 404
    **publicly** on this host the moment it flips;
  - `SNIPPET_READY_oci1=yes` **and** `SNIPPET_READY_oci2=yes` (T8) — oci2's must be ready too, because
    task 10 follows within minutes and a half-flipped host is not left across a break;
  - `GATE_DELETED_oci1=yes` (T5);
  - the live file still has exactly one `location = /`, one `rewrite ^ /austin-tx/ last;` and one
    `include …/proxy-node-app.conf;`;
  - `plan3-verify-host.sh` currently reports `app=portal` for this host on oci1.
- **Produces:** `FLIP_atxwashateria_com_oci1=<TS>` (key slugged per C-2).
- **Atomicity:** the include swap and the rewrite deletion are the same pass, and the transform dies
  rather than applying one without the other (C-8, falsified in Task 8 Step 3b). There is no
  intermediate state in which the host points at `:3001` while still rewriting to `/austin-tx/`.

**Rollback (exact; independently reversible, ~5 s; scoped to this host and this box only).**
```bash
IP=161.153.71.201; H=atxwashateria.com; HK=${H//./_}
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
V=FLIP_${HK}_oci1; TS=${!V}; test -n "$TS" || { echo "HALT: no recorded TS for $H/oci1"; exit 1; }
echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
test -f ~/nginx-snapshots/$H.preflip.$TS
sudo cp -p ~/nginx-snapshots/$H.preflip.$TS /etc/nginx/sites-enabled/$H
sudo nginx -t && sudo systemctl reload nginx
sleep 2
bash ~/plan3-verify-host.sh $H | head -2
curl -sk -m 8 -o /dev/null -w 'rolled_back /austin-tx/ code=%{http_code}\n' --resolve $H:443:127.0.0.1 https://$H/austin-tx/
echo \"  other_hosts_untouched=\$(grep -l 'proxy-content-app.conf' /etc/nginx/sites-enabled/* 2>/dev/null | wc -l)\""
```
- Rollback expected: `TS=<value>`; the two `nginx -t` lines; `host=atxwashateria.com` and
  `app=portal health_ct=text/html … health_origin=200 ticker=0`; `rolled_back /austin-tx/ code=200`;
  `other_hosts_untouched=0`.
- It restores **only this host's own file**. It cannot un-flip another host (C-11/R-12).

- [ ] **Step 0: Assert every Consumes.**
```bash
IP=161.153.71.201; BOX=oci1; H=atxwashateria.com; HK=${H//./_}
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
FAIL=0
chk() { if [ "$2" = "$3" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=[$2] want=[$3]"; FAIL=1; fi; }
chk phase0   "${PHASE0_COMPLETE:-}"   yes
chk pre404   "${PRE404_CLOSED:-}"     yes
chk snip1    "${SNIPPET_READY_oci1:-}" yes
chk snip2    "${SNIPPET_READY_oci2:-}" yes
chk gate1    "${GATE_DELETED_oci1:-}"  yes
S=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "P=/etc/nginx/sites-enabled/$H
  printf '%s %s %s %s\n' \"\$(grep -c '^ *location = / {' \$P)\" \"\$(grep -c 'rewrite \^ /austin-tx/ last;' \$P)\" \"\$(grep -c 'proxy-node-app.conf' \$P)\" \"\$(wc -l < \$P)\"")
set -- $S
chk exact_location "$1" 1
chk rewrite_count  "$2" 1
chk portal_snippet "$3" 1
chk file_lines     "$4" 122
chk app_now "$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "bash ~/plan3-verify-host.sh $H | awk -F'[= ]' '/^app=/{print \$2}'")" portal
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: ten `OK` lines then `gate=PASS`.
  - `file_lines=127` instead of `122` means Task 5 did not land on this box. `app_now=content` means
    the host is already flipped. Either is a STOP.

- [ ] **Step 1: Snapshot and record the exact bytes being replaced.**
```bash
IP=161.153.71.201; H=atxwashateria.com; HK=${H//./_}
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y%m%dT%H%M%SZ'); rec "FLIP_${HK}_oci1" "$TS"; echo "TS=$TS key=FLIP_${HK}_oci1"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
sudo cp -p /etc/nginx/sites-enabled/$H ~/nginx-snapshots/$H.preflip.$TS
sudo chown \$(id -un) ~/nginx-snapshots/$H.preflip.$TS
md5sum /etc/nginx/sites-enabled/$H ~/nginx-snapshots/$H.preflip.$TS | awk '{print \"  \"\$1\" \"\$2}'
grep -n 'location = /\|rewrite \^ /austin-tx/\|proxy-node-app.conf' /etc/nginx/sites-enabled/$H | sed 's/^/  /'"
```
  - Expected: `TS=<value> key=FLIP_atxwashateria_com_oci1` — note the **slugged** key; the dotted form
    is not a legal shell variable name and every rollback would lose its snapshot.
  - Then two md5 lines with the **same** hash (the snapshot is byte-exact), then exactly three grep
    lines: a `location = / {`, a `rewrite ^ /austin-tx/ last;` and an
    `include /etc/nginx/snippets/proxy-node-app.conf;`.
  - Any other grep count is a STOP: the file has drifted from what the transform was derived against.

- [ ] **Step 2: The atomic flip, `nginx -t` and the reload — one `set -e` block.**
```bash
IP=161.153.71.201; H=atxwashateria.com
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
P=/etc/nginx/sites-enabled/$H
B=\$(wc -l < \$P)
W0=\$(ps -o lstart= -p \$(pgrep -f 'nginx: worker' | head -1))
sudo perl -0pi ~/plan3-flip-to-content-app.pl \$P
echo \"  lines=\$B-\>\$(wc -l < \$P) rewrite_left=\$(grep -c 'rewrite \^ /austin-tx' \$P || true) austin_tx=\$(grep -c austin-tx \$P || true) portal_snippet_left=\$(grep -c proxy-node-app.conf \$P || true) content_snippet=\$(grep -c proxy-content-app.conf \$P) servers=\$(grep -c '^server {' \$P) braces=\$(tr -cd '{' < \$P|wc -c)/\$(tr -cd '}' < \$P|wc -c) mailcow=\$(grep -c 'localhost:8443' \$P) acme=\$(grep -c acme-challenge \$P) gated=\$(grep -ci gated \$P || true)\"
sudo nginx -t && sudo systemctl reload nginx
sleep 3
echo \"  reload_took=\$([ \\\"\$W0\\\" != \\\"\$(ps -o lstart= -p \$(pgrep -f 'nginx: worker' | head -1))\\\" ] && echo yes || echo NO)\""
```
  - Expected, exactly:
    `lines=122->111 rewrite_left=0 austin_tx=0 portal_snippet_left=0 content_snippet=1 servers=5 braces=11/11 mailcow=6 acme=1 gated=0`,
    then the two `nginx -t` lines, then `reload_took=yes`.
  - A `plan3-flip: partial apply … refusing` line means the transform declined; `set -e` stops before
    `nginx -t` and **the file is unchanged**. Re-derive the anchors; do not hand-edit.
  - `rewrite_left` non-zero with `content_snippet=1` is the failure the brief warns about — the host
    would point at `:3001` and still rewrite `/` to a path the content app 404s. The `&&` means the
    reload cannot run after a failed `nginx -t`, but this combination is **syntactically valid**, so
    the transform's `die` is the real guard.
  - Any `servers`, `mailcow`, `acme` or brace value other than the one above means the transform ate
    more than it should — exactly the class of failure a `grep -c`-only check misses. Run the Rollback.

- [ ] **Step 3: Verify on oci1 — the full probe set against the POST-FLIP profile.**
```bash
IP=161.153.71.201; H=atxwashateria.com
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "bash ~/plan3-verify-host.sh $H"; echo "verify_rc=$?"
```
  - Expected: the POST-FLIP profile from Task 8 Step 4 verbatim —
    `app=content health_ct=application/json health_body={"status":"ok"} health_origin=404 ticker=1`;
    `canonical=https://atxwashdryfold.com/`; `austin_tx=404 austin_wdf=404`; all six
    `legal_*=301/https://portal.atxwashdryfold.com<path>`;
    `reset=301/https://portal.atxwashdryfold.com/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate`;
    `robots=200 sitemap=200 affiliate=200`; `portal_guard="status":"UP"`;
    `crhsent_guard={"status":"ok"}`; `crhsent_gate=401` — then `verify_rc=0`.
  - This is the first time the profile is asserted against a live flipped host. **Read every line.**
    `app=AMBIGUOUS`, any `legal_*=404`, a `reset` that is not the token-preserving 301, `robots=404`,
    `sitemap=404`, a `portal_guard` that is not `"status":"UP"`, or a `crhsent_gate` that is not `401`
    is a **roll-back-now** condition.

- [ ] **Step 4: Prove the other two hosts and oci2 are untouched — one host, one box at a time.**
```bash
H=atxwashateria.com
echo "=== oci1: the other two marketing hosts must still be on the portal"
for G in rundberglaundry.com atxwashdryfold.com; do
  ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "bash ~/plan3-verify-host.sh $G | sed -n '1,2p'"
done
echo "=== oci2: this host must still be on the portal"
ssh -i ~/.ssh/oci_wavemax ubuntu@144.24.4.202 "
  echo \"  portal_snippet=\$(grep -c 'proxy-node-app.conf' /etc/nginx/sites-enabled/$H) rewrite=\$(grep -c 'rewrite \^ /austin-tx' /etc/nginx/sites-enabled/$H)\"
  bash ~/plan3-verify-host.sh $H | sed -n '1,2p'"
```
  - Expected: two `host=… / app=portal …` pairs for the other hosts on oci1; then
    `portal_snippet=1 rewrite=1` and `host=atxwashateria.com` / `app=portal …` on oci2.
  - Any `app=content` on oci2 means both boxes flipped at once. STOP — that violates one box at a time
    and removes the ability to compare.

- [ ] **Step 5: Public check through Cloudflare, attributed per box.**
      Both apps serve this host publicly right now. That is expected and lasts minutes.
```bash
H=atxwashateria.com
for i in $(seq 1 20); do
  rm -f /tmp/cf.html
  BOX=$(curl -s -m 15 -D- -o /tmp/cf.html "https://$H/health?p=$(date +%s)-$i" | awk 'tolower($1)=="x-origin-box:"{b=$2} END{printf "%s", b}' | tr -d '\r')
  if [ ! -s /tmp/cf.html ]; then APP=ERR; elif grep -q '"status":"ok"' /tmp/cf.html; then APP=content; else APP=portal; fi
  echo "${BOX:-NOBOX} $APP"
done | sort | uniq -c
```
  - Expected: exactly two groups summing to 20 — `oci-phx content` and `oci-phx-ad1 portal`.
  - `/health` is used rather than `/` because it is the unambiguous structural discriminator (C-4)
    and needs no body parsing that a CF-injected script could disturb.
  - `/tmp/cf.html` is removed each iteration: `curl -o` does not truncate on a failed request, so a
    timed-out iteration would otherwise re-read the previous body and report a stale verdict. An
    `ERR` row means a failed fetch, not a flipped app — re-run.
  - Any `oci-phx portal` row means oci1 did not flip for public traffic (check CF cache; the `?p=`
    buster should prevent it). Any `oci-phx-ad1 content` row means oci2 flipped too — STOP.

---

### Task 10: `atxwashateria.com` on **oci2** — flip, verify both boxes, after-gate

Starts **immediately** after Task 9 Step 5 passes: the host is publicly inconsistent between the two
box flips, and that window is minutes, not hours.

**Files:** box only (oci2). Modifies `/etc/nginx/sites-enabled/atxwashateria.com` — the same single
atomic pass as Task 9. Creates `~/nginx-snapshots/atxwashateria.com.preflip.<TS>` on oci2, plus 6 PSI
JSON reports under `/var/www/wavemax/cutover-logs/psi/`.

**Interfaces:**
- **Consumes** — each asserted in Step 0; any failure prints `gate=HALT`:
  | Consumes | producer | asserted as |
  |:--|:--|:--|
  | `FLIP_atxwashateria_com_oci1` non-empty | Task 9 | `chkn oci1_flip_ts` |
  | oci1 is **live** on the content app for this host | Task 9, measured | `chk oci1_app … content` |
  | oci2 is still on the portal for this host | box state | `chk oci2_app … portal` |
  | `SNIPPET_READY_oci2=yes` | Task 8 | `chk snip2 … yes` |
  | `GATE_DELETED_oci2=yes` | Task 5 | `chk gate2 … yes` |
  | `BASELINE_DATE` | Task 7 | `chkn baseline` |
  | the oci2 file still has the rewrite, the portal snippet and 122 lines | box state | `chk rewrite 1`, `chk portal_snippet 1`, `chk file_lines 122` |
  A recorded TS is not proof that a flip is live, which is why `oci1_app` is asserted separately.
- **Produces:** `FLIP_atxwashateria_com_oci2=<TS>`, `HOST_DONE_atxwashateria_com=yes` (**recorded only
  if the after-gate passes**), and the after-gate scores.

**Rollback (exact).** Per box, independently.
```bash
IP=144.24.4.202; H=atxwashateria.com; HK=${H//./_}
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
V=FLIP_${HK}_oci2; TS=${!V}; test -n "$TS" || { echo "HALT: no recorded TS for $H/oci2"; exit 1; }
echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
test -f ~/nginx-snapshots/$H.preflip.$TS
sudo cp -p ~/nginx-snapshots/$H.preflip.$TS /etc/nginx/sites-enabled/$H
sudo nginx -t && sudo systemctl reload nginx
sleep 2
bash ~/plan3-verify-host.sh $H | head -2"
```
- Rollback expected: `TS=<value>`, the two `nginx -t` lines, then `host=atxwashateria.com` and
  `app=portal … health_origin=200 ticker=0`.
- To reverse the **whole host**, run this and then Task 9's Rollback. Order does not matter; each box
  is independent. Clear `HOST_DONE_atxwashateria_com` from the record if it was set.

- [ ] **Step 0: Assert Task 9 completed and oci1 is actually serving the content app.**
```bash
IP=144.24.4.202; BOX=oci2; H=atxwashateria.com; HK=${H//./_}
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
FAIL=0
chk() { if [ "$2" = "$3" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=[$2] want=[$3]"; FAIL=1; fi; }
chkn() { if [ -n "$2" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=EMPTY"; FAIL=1; fi; }
V=FLIP_${HK}_oci1; chkn oci1_flip_ts "${!V:-}"
chk  snip2      "${SNIPPET_READY_oci2:-}" yes
chk  gate2      "${GATE_DELETED_oci2:-}"  yes
chkn baseline   "${BASELINE_DATE:-}"
chk  oci1_app   "$(ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "bash ~/plan3-verify-host.sh $H | awk -F'[= ]' '/^app=/{print \$2}'")" content
chk  oci2_app   "$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "bash ~/plan3-verify-host.sh $H | awk -F'[= ]' '/^app=/{print \$2}'")" portal
S=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "P=/etc/nginx/sites-enabled/$H; printf '%s %s %s\n' \"\$(grep -c 'rewrite \^ /austin-tx/ last;' \$P)\" \"\$(grep -c 'proxy-node-app.conf' \$P)\" \"\$(wc -l < \$P)\"")
set -- $S; chk rewrite "$1" 1; chk portal_snippet "$2" 1; chk file_lines "$3" 122
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: nine `OK` lines then `gate=PASS`.
  - `oci1_app=portal` means Task 9 did not actually take effect — a recorded TS is not proof that the
    flip is live, which is why both are asserted.

- [ ] **Step 1: Snapshot, flip atomically, `nginx -t` and reload in one block.**
```bash
IP=144.24.4.202; H=atxwashateria.com; HK=${H//./_}
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y%m%dT%H%M%SZ'); rec "FLIP_${HK}_oci2" "$TS"; echo "TS=$TS key=FLIP_${HK}_oci2"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
P=/etc/nginx/sites-enabled/$H
sudo cp -p \$P ~/nginx-snapshots/$H.preflip.$TS; sudo chown \$(id -un) ~/nginx-snapshots/$H.preflip.$TS
B=\$(wc -l < \$P)
W0=\$(ps -o lstart= -p \$(pgrep -f 'nginx: worker' | head -1))
sudo perl -0pi ~/plan3-flip-to-content-app.pl \$P
echo \"  lines=\$B-\>\$(wc -l < \$P) rewrite_left=\$(grep -c 'rewrite \^ /austin-tx' \$P || true) austin_tx=\$(grep -c austin-tx \$P || true) portal_snippet_left=\$(grep -c proxy-node-app.conf \$P || true) content_snippet=\$(grep -c proxy-content-app.conf \$P) servers=\$(grep -c '^server {' \$P) braces=\$(tr -cd '{' < \$P|wc -c)/\$(tr -cd '}' < \$P|wc -c) mailcow=\$(grep -c 'localhost:8443' \$P) acme=\$(grep -c acme-challenge \$P) gated=\$(grep -ci gated \$P || true)\"
sudo nginx -t && sudo systemctl reload nginx
sleep 3
echo \"  reload_took=\$([ \\\"\$W0\\\" != \\\"\$(ps -o lstart= -p \$(pgrep -f 'nginx: worker' | head -1))\\\" ] && echo yes || echo NO)\""
```
  - Expected, exactly: `TS=<value> key=FLIP_atxwashateria_com_oci2`, then
    `lines=122->111 rewrite_left=0 austin_tx=0 portal_snippet_left=0 content_snippet=1 servers=5 braces=11/11 mailcow=6 acme=1 gated=0`,
    then the two `nginx -t` lines, then `reload_took=yes`.

- [ ] **Step 2: Both boxes must now be identical for this host.**
```bash
H=atxwashateria.com
for IP in 161.153.71.201 144.24.4.202; do echo "##### $IP"; ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "bash ~/plan3-verify-host.sh $H"; echo "  rc=$?"; done
echo "=== the other two hosts must still be on the portal, on both boxes"
for IP in 161.153.71.201 144.24.4.202; do for G in rundberglaundry.com atxwashdryfold.com; do
  printf '  %-16s %-22s ' "$IP" "$G"; ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "bash ~/plan3-verify-host.sh $G | awk -F'[= ]' '/^app=/{print \$2}'"
done; done
```
  - Expected: two identical POST-FLIP profiles differing only in nothing at all (the `host=` line is
    the same on both), each with `rc=0`; then four lines each ending `portal`.
  - **Any divergence between the two boxes is a STOP.** Cloudflare round-robins, so a divergence is
    publicly visible half the time — and the after-gate Lighthouse runs would sample both.

- [ ] **Step 3: Public check — both boxes agree, no `portal` row anywhere.**
```bash
H=atxwashateria.com
for i in $(seq 1 20); do
  rm -f /tmp/cf.html
  BOX=$(curl -s -m 15 -D- -o /tmp/cf.html "https://$H/health?p=$(date +%s)-$i" | awk 'tolower($1)=="x-origin-box:"{b=$2} END{printf "%s", b}' | tr -d '\r')
  if [ ! -s /tmp/cf.html ]; then APP=ERR; elif grep -q '"status":"ok"' /tmp/cf.html; then APP=content; else APP=portal; fi
  echo "${BOX:-NOBOX} $APP"
done | sort | uniq -c
curl -s -m 15 -o /dev/null -w "public /austin-tx/ code=%{http_code}\n" "https://$H/austin-tx/?p=$(date +%s)"
curl -s -m 15 -o /dev/null -w "public /privacy-policy code=%{http_code} -> %{redirect_url}\n" "https://$H/privacy-policy?p=$(date +%s)"
```
  - Expected: exactly two groups — `oci-phx content` and `oci-phx-ad1 content` — summing to 20, with
    **no `portal` and no `ERR` row**; then `public /austin-tx/ code=404`; then
    `public /privacy-policy code=301 -> https://portal.atxwashdryfold.com/privacy-policy`.

- [ ] **Step 4: After-gate — C14-abs and C14-stab through PSI, the same vantage as Task 7.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
H=atxwashateria.com; HK=${H//./_}
for FF in mobile desktop; do for N in 1 2 3; do
  F="p3-after-$H-$FF-$N-$BASELINE_DATE.json"
  ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "bash ~/plan3-psi.sh 'https://$H/' $FF /tmp/$F"
  ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "cat /tmp/$F" > "$EV/psi/$F"
  ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "rm -f /tmp/$F"
done; done
node -e '
const fs=require("fs"), dir=process.argv[1], h=process.argv[2], d=process.argv[3];
const cats=["performance","accessibility","best-practices","seo"]; let fail=0;
for (const ff of ["mobile","desktop"]) {
  const runs=[1,2,3].map(n=>{const j=JSON.parse(fs.readFileSync(`${dir}/p3-after-${h}-${ff}-${n}-${d}.json`,"utf8"));
    const c=j.lighthouseResult.categories, a=j.lighthouseResult.audits;
    const s=Object.fromEntries(cats.map(k=>[k,Math.round(c[k].score*100)]));
    s.crawlable=a["is-crawlable"]?a["is-crawlable"].score:null; return s;});
  const perf=runs.map(r=>r.performance).sort((a,b)=>a-b), med=perf[1], spread=perf[2]-perf[0];
  const ref=Object.fromEntries(cats.map(k=>[k, k==="performance"?med:runs[0][k]]));
  const abs=cats.every(k=>ref[k]>=95); if(!abs)fail++;
  if(spread>5)fail++;
  if(runs[0].crawlable!==1)fail++;
  console.log(`${abs?"PASS":"FAIL"} AFTER ${h} ${ff} `+cats.map(k=>k+"="+ref[k]).join(" ")+` crawlable=${runs[0].crawlable} perf_runs=${perf.join(",")} spread=${spread} ${spread<=5?"OK":"TOO_NOISY"}`);
}
console.log(`C14 ${h} `+(fail?"FAIL fails="+fail:"PASS"));
process.exit(fail?1:0)' "$EV/psi" "$H" "$BASELINE_DATE" | tee -a "$EV/p3-lh-$H.txt"
V=${PIPESTATUS[0]}; echo "exit=$V"
if [ "$V" = 0 ]; then printf '%s=%q\n' "HOST_DONE_$HK" yes >> "$REC"; echo "HOST_DONE_$HK=yes recorded"; else echo "NOT RECORDED — C14 failed for $H"; fi
```
  - Expected: two `PASS AFTER atxwashateria.com …` lines, each with all four categories ≥ 95,
    `crawlable=1` and `spread ≤ 5 OK`; then `C14 atxwashateria.com PASS`, `exit=0`, and
    `HOST_DONE_atxwashateria_com=yes recorded`.
  - **`crawlable` flipping from `0` (Task 7 baseline) to `1` is the point of this flip:** the public
    placeholder was `noindex`; the content page is indexable. A `crawlable=0` here means the
    placeholder is still being served.
  - The `HOST_DONE` write is **conditional on `exit=0`** (P7: slice A wrote it unconditionally in the
    same block as the gate it was meant to guard, so the next host's flip would proceed with a blocked
    host behind it).
  - On `FAIL`: run Task 10's then Task 9's Rollback so the host returns to the placeholder, record the
    failing categories, and hand the diagnosis to the controller. **Do not start Task 11.**
  - `TOO_NOISY`: re-run Step 4 once. Still `TOO_NOISY` → block the host. The threshold is `≤ 5`, not
    slice A's `≤ 3`, because the committed quality bar documents ±3–5 mobile variance as normal.

---

### Task 11: `rundberglaundry.com` on **oci1** — the host with three extra couplings

**Why second.** Like `atxwashateria.com` it serves the `noindex` placeholder publicly, so the flip
carries no content regression — but memory records it as *retained for SEO* and crawlers actively
fetch it (19 `/robots.txt` + 8 `/sitemap.xml` hits/day). Higher SEO stakes than atxwashateria, lower
than the canonical host. Its rewrite is the simple `/austin-tx/` form.

**It carries three couplings the other two do not, and each is asserted in Step 0:**
1. **The portal's own landing page loads two scripts cross-origin from this host.**
   `public/embed-landing.html:314`/`:317` fetched `https://rundberglaundry.com/assets/js/…`, which the
   content app 404s. Task 3 made them relative. The failure mode is a **missing script, not an HTTP
   error**, so no status-code probe downstream would catch it — it must be asserted before the flip.
2. **Every password-reset link in the estate is on this host** (`FRONTEND_URL=https://rundberglaundry.com`).
   It survives via the token-preserving 301, which Step 0 asserts **end to end** rather than gating on
   an env var: the env var would pass while `/embed-app-v2.html` was being removed from `EXACT_PATHS`,
   which is how this actually breaks.
3. **The canonical loop.** Until Task 3 moved `public/partner-program.html:10`, the portal-served
   `atxwashdryfold.com` page pointed at `rundberglaundry.com` while the content app points at
   `atxwashdryfold.com`. Flip this host with that unfixed and the two point at each other — a true
   A→B→A loop on the only host with indexed equity.

**Files:** box only (oci1). Modifies `/etc/nginx/sites-enabled/rundberglaundry.com`, one atomic pass.
Creates `~/nginx-snapshots/rundberglaundry.com.preflip.<TS>`.

**Interfaces:**
- **Consumes** — each asserted in Step 0; any failure prints `gate=HALT`:
  | Consumes | producer | asserted as |
  |:--|:--|:--|
  | `HOST_DONE_atxwashateria_com=yes` (one host at a time) | Task 10 | `chk prev_host … yes` |
  | `PHASE0_COMPLETE=yes` | Task 7 | `chk phase0 … yes` |
  | `PRE404_CLOSED=yes` | Task 3 | `chk pre404 … yes` |
  | `SNIPPET_READY_oci1=yes`, `SNIPPET_READY_oci2=yes` | Task 8 | `chk snip1`, `chk snip2` |
  | `GATE_DELETED_oci1=yes` | Task 5 | `chk gate1 … yes` |
  | coupling 1 — the portal landing fetches no script from this host, **on both boxes** | Task 3 | `chk m22_cross_origin_refs_<ip> 0` ×2 |
  | coupling 2 — the reset link 301s with the token byte-identical, **on both boxes** | Task 3 | `chk m23_reset_<ip> '301\|https://portal…token=ABC123def456…'` ×2 |
  | coupling 3 — the portal's copy of the landing page is self-canonical, **on both boxes** | Task 3 | `chk m24_portal_canonical_<ip> 'https://atxwashdryfold.com/'` ×2 |
  | the live file shape: one `location = /`, one `/austin-tx/` rewrite, one portal snippet, 122 lines, `app=portal` | box state | `chk exact_location 1`, `chk rewrite_count 1`, `chk portal_snippet 1`, `chk file_lines 122`, `chk app_now portal` |
- **Produces:** `FLIP_rundberglaundry_com_oci1=<TS>`.

**Rollback (exact).** Task 9's Rollback with `H=rundberglaundry.com`, `IP=161.153.71.201`,
`V=FLIP_rundberglaundry_com_oci1`.
- Rollback expected: `TS=<value>`; the two `nginx -t` lines; `host=rundberglaundry.com` and
  `app=portal health_ct=text/html … health_origin=200 ticker=0`; `rolled_back /austin-tx/ code=200`;
  `other_hosts_untouched=1` (`atxwashateria.com`, already flipped and correctly left alone).

- [ ] **Step 0: Assert the previous host finished, the gates hold, and all three couplings are closed.**
```bash
IP=161.153.71.201; BOX=oci1; H=rundberglaundry.com; HK=${H//./_}
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
FAIL=0
chk() { if [ "$2" = "$3" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=[$2] want=[$3]"; FAIL=1; fi; }
chk prev_host "${HOST_DONE_atxwashateria_com:-}" yes
chk phase0    "${PHASE0_COMPLETE:-}"   yes
chk pre404    "${PRE404_CLOSED:-}"     yes
chk snip1     "${SNIPPET_READY_oci1:-}" yes
chk snip2     "${SNIPPET_READY_oci2:-}" yes
chk gate1     "${GATE_DELETED_oci1:-}"  yes
# coupling 1 — the portal landing must no longer fetch scripts from this host, on BOTH boxes
for I in 161.153.71.201 144.24.4.202; do
  chk "m22_cross_origin_refs_$I" "$(ssh -i ~/.ssh/oci_wavemax ubuntu@$I 'curl -s -H "Host: portal.atxwashdryfold.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/embed-landing.html | grep -c "https://rundberglaundry.com/assets/js" || true')" 0
done
# coupling 2 — the reset link must 301 with the token byte-identical, on BOTH boxes
for I in 161.153.71.201 144.24.4.202; do
  chk "m23_reset_$I" "$(ssh -i ~/.ssh/oci_wavemax ubuntu@$I 'curl -s -o /dev/null -w "%{http_code}|%{redirect_url}" -H "Host: rundberglaundry.com" "http://127.0.0.1:3001/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate"')" '301|https://portal.atxwashdryfold.com/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate'
done
# coupling 3 — the portal's copy of the landing page must be self-canonical on atxwashdryfold.com
for I in 161.153.71.201 144.24.4.202; do
  chk "m24_portal_canonical_$I" "$(ssh -i ~/.ssh/oci_wavemax ubuntu@$I 'curl -s -H "Host: atxwashdryfold.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/ | grep -o "canonical\" href=\"[^\"]*\"" | head -1 | sed "s/.*href=\"//;s/\"$//"')" 'https://atxwashdryfold.com/'
done
S=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "P=/etc/nginx/sites-enabled/$H; printf '%s %s %s %s\n' \"\$(grep -c '^ *location = / {' \$P)\" \"\$(grep -c 'rewrite \^ /austin-tx/ last;' \$P)\" \"\$(grep -c 'proxy-node-app.conf' \$P)\" \"\$(wc -l < \$P)\"")
set -- $S; chk exact_location "$1" 1; chk rewrite_count "$2" 1; chk portal_snippet "$3" 1; chk file_lines "$4" 122
chk app_now "$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "bash ~/plan3-verify-host.sh $H | awk -F'[= ]' '/^app=/{print \$2}'")" portal
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: seventeen `OK` lines then `gate=PASS`.
  - `m22_cross_origin_refs_* ` above `0`: this flip would silently strip two scripts from the portal's
    own landing page. **STOP** — Task 3 Step 5 has not reached that box.
  - `m23_reset_*` anything other than the exact `301|https://portal…token=ABC123def456…` string:
    password reset breaks for affiliates, administrators **and** operators on this flip. **STOP.**
  - `m24_portal_canonical_*` still reading `rundberglaundry.com`: flipping this host creates the
    A→B→A canonical loop. **STOP** — Task 3 Step 4/5 has not reached that box.

- [ ] **Step 1: Snapshot and record the exact bytes being replaced.**
      Task 9 Step 1 with `H=rundberglaundry.com`, `IP=161.153.71.201`.
```bash
IP=161.153.71.201; H=rundberglaundry.com; HK=${H//./_}
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y%m%dT%H%M%SZ'); rec "FLIP_${HK}_oci1" "$TS"; echo "TS=$TS key=FLIP_${HK}_oci1"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
sudo cp -p /etc/nginx/sites-enabled/$H ~/nginx-snapshots/$H.preflip.$TS
sudo chown \$(id -un) ~/nginx-snapshots/$H.preflip.$TS
md5sum /etc/nginx/sites-enabled/$H ~/nginx-snapshots/$H.preflip.$TS | awk '{print \"  \"\$1\" \"\$2}'
grep -n 'location = /\|rewrite \^ /austin-tx/\|proxy-node-app.conf' /etc/nginx/sites-enabled/$H | sed 's/^/  /'"
```
  - Expected: `TS=<value> key=FLIP_rundberglaundry_com_oci1`, two md5 lines with the same hash, then
    exactly three grep lines (`location = / {`, `rewrite ^ /austin-tx/ last;`,
    `include …/proxy-node-app.conf;`).

- [ ] **Step 2: The atomic flip, `nginx -t` and the reload.** Task 9 Step 2 with `H=rundberglaundry.com`.
```bash
IP=161.153.71.201; H=rundberglaundry.com
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
P=/etc/nginx/sites-enabled/$H
B=\$(wc -l < \$P); W0=\$(ps -o lstart= -p \$(pgrep -f 'nginx: worker' | head -1))
sudo perl -0pi ~/plan3-flip-to-content-app.pl \$P
echo \"  lines=\$B-\>\$(wc -l < \$P) rewrite_left=\$(grep -c 'rewrite \^ /austin-tx' \$P || true) austin_tx=\$(grep -c austin-tx \$P || true) portal_snippet_left=\$(grep -c proxy-node-app.conf \$P || true) content_snippet=\$(grep -c proxy-content-app.conf \$P) servers=\$(grep -c '^server {' \$P) braces=\$(tr -cd '{' < \$P|wc -c)/\$(tr -cd '}' < \$P|wc -c) mailcow=\$(grep -c 'localhost:8443' \$P) acme=\$(grep -c acme-challenge \$P) gated=\$(grep -ci gated \$P || true)\"
sudo nginx -t && sudo systemctl reload nginx
sleep 3
echo \"  reload_took=\$([ \\\"\$W0\\\" != \\\"\$(ps -o lstart= -p \$(pgrep -f 'nginx: worker' | head -1))\\\" ] && echo yes || echo NO)\""
```
  - Expected, exactly:
    `lines=122->111 rewrite_left=0 austin_tx=0 portal_snippet_left=0 content_snippet=1 servers=5 braces=11/11 mailcow=6 acme=1 gated=0`,
    then the two `nginx -t` lines, then `reload_took=yes`.

- [ ] **Step 3: Verify on oci1, and re-assert the three couplings now that the host is live on `:3001`.**
```bash
IP=161.153.71.201; H=rundberglaundry.com
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "bash ~/plan3-verify-host.sh $H"; echo "verify_rc=$?"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP '
echo -n "  post_flip_portal_landing_scripts: "
curl -s -H "Host: portal.atxwashdryfold.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/embed-landing.html | grep -c "https://rundberglaundry.com/assets/js" || true
echo -n "  post_flip_self_hosted_scripts: "
for P in /assets/js/embed-navigation.js /assets/js/revenue-calculator.js; do printf "%s=%s " "$P" "$(curl -sk -m 8 -o /dev/null -w "%{http_code}" --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com$P)"; done; echo'
```
  - Expected: the POST-FLIP profile with `app=content`, `canonical=https://atxwashdryfold.com/`,
    all six `legal_*=301/…`, the token-preserving `reset=301/…`, `robots=200 sitemap=200`,
    `portal_guard="status":"UP"`, `crhsent_gate=401`, `verify_rc=0`; then
    `post_flip_portal_landing_scripts: 0` and
    `post_flip_self_hosted_scripts: /assets/js/embed-navigation.js=200 /assets/js/revenue-calculator.js=200`
    — the portal now serves both from **its own** origin, so the flip took nothing away from it.
  - `reset` not the token-preserving 301 here is the highest-severity outcome in this task: every
    password-reset link in the estate points at this host. Roll back immediately.

- [ ] **Step 4: Prove oci2 and the third host are untouched.**
```bash
H=rundberglaundry.com
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "printf '  oci1 atxwashdryfold.com app='; bash ~/plan3-verify-host.sh atxwashdryfold.com | awk -F'[= ]' '/^app=/{print \$2}'
printf '  oci1 atxwashateria.com  app='; bash ~/plan3-verify-host.sh atxwashateria.com | awk -F'[= ]' '/^app=/{print \$2}'"
ssh -i ~/.ssh/oci_wavemax ubuntu@144.24.4.202 "
  echo \"  oci2 portal_snippet=\$(grep -c 'proxy-node-app.conf' /etc/nginx/sites-enabled/$H) rewrite=\$(grep -c 'rewrite \^ /austin-tx' /etc/nginx/sites-enabled/$H)\"
  printf '  oci2 %s app=' $H; bash ~/plan3-verify-host.sh $H | awk -F'[= ]' '/^app=/{print \$2}'"
```
  - Expected: `oci1 atxwashdryfold.com app=portal`, `oci1 atxwashateria.com app=content`
    (flipped in tasks 9/10), `oci2 portal_snippet=1 rewrite=1`, `oci2 rundberglaundry.com app=portal`.

- [ ] **Step 5: Public check through CF, attributed.** Task 9 Step 5 with `H=rundberglaundry.com`.
```bash
H=rundberglaundry.com
for i in $(seq 1 20); do
  rm -f /tmp/cf.html
  BOX=$(curl -s -m 15 -D- -o /tmp/cf.html "https://$H/health?p=$(date +%s)-$i" | awk 'tolower($1)=="x-origin-box:"{b=$2} END{printf "%s", b}' | tr -d '\r')
  if [ ! -s /tmp/cf.html ]; then APP=ERR; elif grep -q '"status":"ok"' /tmp/cf.html; then APP=content; else APP=portal; fi
  echo "${BOX:-NOBOX} $APP"
done | sort | uniq -c
```
  - Expected: two groups summing to 20 — `oci-phx content` and `oci-phx-ad1 portal`.

---

### Task 12: `rundberglaundry.com` on **oci2** — flip, verify both boxes, after-gate

Starts immediately after Task 11 Step 5 passes.

**Files:** box only (oci2). Modifies `/etc/nginx/sites-enabled/rundberglaundry.com`, one atomic pass.
Creates `~/nginx-snapshots/rundberglaundry.com.preflip.<TS>` on oci2, plus 6 PSI JSON reports.

**Interfaces:**
- **Consumes** — each asserted in Step 0; any failure prints `gate=HALT`:
  | Consumes | producer | asserted as |
  |:--|:--|:--|
  | `FLIP_rundberglaundry_com_oci1` non-empty | Task 11 | `chkn oci1_flip_ts` |
  | oci1 is **live** on the content app for this host | Task 11, measured | `chk oci1_app … content` |
  | oci2 is still on the portal for this host | box state | `chk oci2_app … portal` |
  | `SNIPPET_READY_oci2=yes` | Task 8 | `chk snip2 … yes` |
  | `GATE_DELETED_oci2=yes` | Task 5 | `chk gate2 … yes` |
  | `BASELINE_DATE` | Task 7 | `chkn baseline` |
  | the oci2 file shape (rewrite, portal snippet, 122 lines) | box state | `chk rewrite 1`, `chk portal_snippet 1`, `chk file_lines 122` |
- **Produces:** `FLIP_rundberglaundry_com_oci2=<TS>`, `HOST_DONE_rundberglaundry_com=yes`
  (**conditional on the after-gate**), the after-gate scores.

**Rollback (exact).** Task 10's Rollback with `H=rundberglaundry.com`, `IP=144.24.4.202`,
`V=FLIP_rundberglaundry_com_oci2`.
- Rollback expected: `TS=<value>`, the two `nginx -t` lines, `host=rundberglaundry.com`,
  `app=portal … health_origin=200 ticker=0`.

- [ ] **Step 0: Assert Task 11 completed and is live.** Task 10 Step 0 with `H=rundberglaundry.com`.
```bash
IP=144.24.4.202; BOX=oci2; H=rundberglaundry.com; HK=${H//./_}
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
FAIL=0
chk() { if [ "$2" = "$3" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=[$2] want=[$3]"; FAIL=1; fi; }
chkn() { if [ -n "$2" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=EMPTY"; FAIL=1; fi; }
V=FLIP_${HK}_oci1; chkn oci1_flip_ts "${!V:-}"
chk  snip2 "${SNIPPET_READY_oci2:-}" yes
chk  gate2 "${GATE_DELETED_oci2:-}"  yes
chkn baseline "${BASELINE_DATE:-}"
chk  oci1_app "$(ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "bash ~/plan3-verify-host.sh $H | awk -F'[= ]' '/^app=/{print \$2}'")" content
chk  oci2_app "$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "bash ~/plan3-verify-host.sh $H | awk -F'[= ]' '/^app=/{print \$2}'")" portal
S=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "P=/etc/nginx/sites-enabled/$H; printf '%s %s %s\n' \"\$(grep -c 'rewrite \^ /austin-tx/ last;' \$P)\" \"\$(grep -c 'proxy-node-app.conf' \$P)\" \"\$(wc -l < \$P)\"")
set -- $S; chk rewrite "$1" 1; chk portal_snippet "$2" 1; chk file_lines "$3" 122
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: nine `OK` lines then `gate=PASS`.

- [ ] **Step 1: Snapshot, flip, `nginx -t` and reload.** Task 10 Step 1 with `H=rundberglaundry.com`.
```bash
IP=144.24.4.202; H=rundberglaundry.com; HK=${H//./_}
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y%m%dT%H%M%SZ'); rec "FLIP_${HK}_oci2" "$TS"; echo "TS=$TS key=FLIP_${HK}_oci2"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
P=/etc/nginx/sites-enabled/$H
sudo cp -p \$P ~/nginx-snapshots/$H.preflip.$TS; sudo chown \$(id -un) ~/nginx-snapshots/$H.preflip.$TS
B=\$(wc -l < \$P); W0=\$(ps -o lstart= -p \$(pgrep -f 'nginx: worker' | head -1))
sudo perl -0pi ~/plan3-flip-to-content-app.pl \$P
echo \"  lines=\$B-\>\$(wc -l < \$P) rewrite_left=\$(grep -c 'rewrite \^ /austin-tx' \$P || true) austin_tx=\$(grep -c austin-tx \$P || true) portal_snippet_left=\$(grep -c proxy-node-app.conf \$P || true) content_snippet=\$(grep -c proxy-content-app.conf \$P) servers=\$(grep -c '^server {' \$P) braces=\$(tr -cd '{' < \$P|wc -c)/\$(tr -cd '}' < \$P|wc -c) mailcow=\$(grep -c 'localhost:8443' \$P) acme=\$(grep -c acme-challenge \$P) gated=\$(grep -ci gated \$P || true)\"
sudo nginx -t && sudo systemctl reload nginx
sleep 3
echo \"  reload_took=\$([ \\\"\$W0\\\" != \\\"\$(ps -o lstart= -p \$(pgrep -f 'nginx: worker' | head -1))\\\" ] && echo yes || echo NO)\""
```
  - Expected, exactly: `TS=<value> key=FLIP_rundberglaundry_com_oci2`, then
    `lines=122->111 rewrite_left=0 austin_tx=0 portal_snippet_left=0 content_snippet=1 servers=5 braces=11/11 mailcow=6 acme=1 gated=0`,
    then the two `nginx -t` lines, then `reload_took=yes`.

- [ ] **Step 2: Both boxes identical for this host; the third host still on the portal.**
```bash
H=rundberglaundry.com
for IP in 161.153.71.201 144.24.4.202; do echo "##### $IP"; ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "bash ~/plan3-verify-host.sh $H"; echo "  rc=$?"; done
for IP in 161.153.71.201 144.24.4.202; do for G in atxwashateria.com atxwashdryfold.com; do
  printf '  %-16s %-22s app=' "$IP" "$G"; ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "bash ~/plan3-verify-host.sh $G | awk -F'[= ]' '/^app=/{print \$2}'"
done; done
```
  - Expected: two identical POST-FLIP profiles with `rc=0`; then `atxwashateria.com app=content` and
    `atxwashdryfold.com app=portal` on **both** boxes.
  - The `legal_*` and `reset` lines matter most on this host. Any `legal_*=404`, or a `reset` that is
    not the token-preserving 301, is a **roll-back-now** condition.

- [ ] **Step 3: Public check — both boxes agree.** Task 10 Step 3 with `H=rundberglaundry.com`.
```bash
H=rundberglaundry.com
for i in $(seq 1 20); do
  rm -f /tmp/cf.html
  BOX=$(curl -s -m 15 -D- -o /tmp/cf.html "https://$H/health?p=$(date +%s)-$i" | awk 'tolower($1)=="x-origin-box:"{b=$2} END{printf "%s", b}' | tr -d '\r')
  if [ ! -s /tmp/cf.html ]; then APP=ERR; elif grep -q '"status":"ok"' /tmp/cf.html; then APP=content; else APP=portal; fi
  echo "${BOX:-NOBOX} $APP"
done | sort | uniq -c
curl -s -m 15 -o /dev/null -w "public /austin-tx/ code=%{http_code}\n" "https://$H/austin-tx/?p=$(date +%s)"
curl -s -m 15 -o /dev/null -w "public reset code=%{http_code} -> %{redirect_url}\n" "https://$H/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate&p=$(date +%s)"
```
  - Expected: `oci-phx content` + `oci-phx-ad1 content` = 20, no `portal`, no `ERR`;
    `public /austin-tx/ code=404`; then
    `public reset code=301 -> https://portal.atxwashdryfold.com/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate&p=<ts>`
    — the token intact through **Cloudflare**, not just on-box.

- [ ] **Step 4: After-gate — C14-abs and C14-stab.** Task 10 Step 4 with `H=rundberglaundry.com`.
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
H=rundberglaundry.com; HK=${H//./_}
for FF in mobile desktop; do for N in 1 2 3; do
  F="p3-after-$H-$FF-$N-$BASELINE_DATE.json"
  ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "bash ~/plan3-psi.sh 'https://$H/' $FF /tmp/$F"
  ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "cat /tmp/$F" > "$EV/psi/$F"
  ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "rm -f /tmp/$F"
done; done
node -e '
const fs=require("fs"), dir=process.argv[1], h=process.argv[2], d=process.argv[3];
const cats=["performance","accessibility","best-practices","seo"]; let fail=0;
for (const ff of ["mobile","desktop"]) {
  const runs=[1,2,3].map(n=>{const j=JSON.parse(fs.readFileSync(`${dir}/p3-after-${h}-${ff}-${n}-${d}.json`,"utf8"));
    const c=j.lighthouseResult.categories, a=j.lighthouseResult.audits;
    const s=Object.fromEntries(cats.map(k=>[k,Math.round(c[k].score*100)]));
    s.crawlable=a["is-crawlable"]?a["is-crawlable"].score:null; return s;});
  const perf=runs.map(r=>r.performance).sort((a,b)=>a-b), med=perf[1], spread=perf[2]-perf[0];
  const ref=Object.fromEntries(cats.map(k=>[k, k==="performance"?med:runs[0][k]]));
  const abs=cats.every(k=>ref[k]>=95); if(!abs)fail++; if(spread>5)fail++; if(runs[0].crawlable!==1)fail++;
  console.log(`${abs?"PASS":"FAIL"} AFTER ${h} ${ff} `+cats.map(k=>k+"="+ref[k]).join(" ")+` crawlable=${runs[0].crawlable} perf_runs=${perf.join(",")} spread=${spread} ${spread<=5?"OK":"TOO_NOISY"}`);
}
console.log(`C14 ${h} `+(fail?"FAIL fails="+fail:"PASS"));
process.exit(fail?1:0)' "$EV/psi" "$H" "$BASELINE_DATE" | tee -a "$EV/p3-lh-$H.txt"
V=${PIPESTATUS[0]}; echo "exit=$V"
if [ "$V" = 0 ]; then printf '%s=%q\n' "HOST_DONE_$HK" yes >> "$REC"; echo "HOST_DONE_$HK=yes recorded"; else echo "NOT RECORDED — C14 failed for $H"; fi
```
  - Expected: two `PASS AFTER rundberglaundry.com …` lines with all four categories ≥ 95,
    `crawlable=1`, `spread ≤ 5 OK`; `C14 rundberglaundry.com PASS`; `exit=0`;
    `HOST_DONE_rundberglaundry_com=yes recorded`.
  - On `FAIL`: run Task 12's then Task 11's Rollback. **Do not start Task 13.**

---

### Task 13: **HUMAN-CONFIRM** — `atxwashdryfold.com` on **oci1**: the canonical host

**Why last, and why a human confirms.** It is the **canonical host** — `BASE_URL`, `canonical`,
`og:url`, `og:image`, the JSON-LD `url` and the sitemap all name it. It is the only marketing host
whose real content is publicly launched (it is in `PARTNER_PUBLIC_HOSTS`, so the public sees the
partner page, not the placeholder: measured `crawlable=1 seo=100` from the non-allowlisted vantage).
It carries live `/embed-app-v2.html` traffic that the content app 301s, and its rewrite is the
distinct `rewrite ^ /austin-tx/wash-dry-fold/ last;` variant. It is also the only host where a
before/after comparison is meaningful, so **C14-reg applies here** (task 14).

**Files:** box only (oci1). Modifies `/etc/nginx/sites-enabled/atxwashdryfold.com`, one atomic pass.
Creates `~/nginx-snapshots/atxwashdryfold.com.preflip.<TS>`.

**Interfaces:**
- **Consumes** — each asserted in Step 0; any failure prints `gate=HALT`:
  | Consumes | producer | asserted as |
  |:--|:--|:--|
  | `HOST_DONE_atxwashateria_com=yes` | Task 10 | `chk prev1 … yes` |
  | `HOST_DONE_rundberglaundry_com=yes` | Task 12 | `chk prev2 … yes` |
  | `PHASE0_COMPLETE=yes` | Task 7 | `chk phase0 … yes` |
  | `PRE404_CLOSED=yes` | Task 3 | `chk pre404 … yes` |
  | `SNIPPET_READY_oci1=yes`, `SNIPPET_READY_oci2=yes` | Task 8 | `chk snip1`, `chk snip2` |
  | `GATE_DELETED_oci1=yes` | Task 5 | `chk gate1 … yes` |
  | the 8 `PRE_atxwashdryfold_com_<ff>_<cat>` C14-reg references exist **before** the flip | Task 7 | `chkn c14reg_ref_<ff>_<cat>` ×8 |
  | the **WDF** rewrite variant present exactly once, and the plain variant absent | box state | `chk wdf_rewrite 1`, `chk plain_rewrite 0` |
  | one `location = /`, one portal snippet, 122 lines, `app=portal` | box state | `chk exact_location 1`, `chk portal_snippet 1`, `chk file_lines 122`, `chk app_now portal` |
  | the portal's copy of this page is already self-canonical | Task 3 | `chk portal_canonical_now 'https://atxwashdryfold.com/'` |
- **Produces:** `FLIP_atxwashdryfold_com_oci1=<TS>`.

**Rollback (exact).**
```bash
IP=161.153.71.201; H=atxwashdryfold.com; HK=${H//./_}
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
V=FLIP_${HK}_oci1; TS=${!V}; test -n "$TS" || { echo "HALT: no recorded TS for $H/oci1"; exit 1; }
echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
test -f ~/nginx-snapshots/$H.preflip.$TS
sudo cp -p ~/nginx-snapshots/$H.preflip.$TS /etc/nginx/sites-enabled/$H
sudo nginx -t && sudo systemctl reload nginx
sleep 2
bash ~/plan3-verify-host.sh $H | head -3
curl -sk -m 8 -o /dev/null -w 'rolled_back /austin-tx/wash-dry-fold/ code=%{http_code}\n' --resolve $H:443:127.0.0.1 https://$H/austin-tx/wash-dry-fold/
curl -sk -m 8 -o /dev/null -w 'rolled_back /embed-app-v2.html code=%{http_code}\n' --resolve $H:443:127.0.0.1 https://$H/embed-app-v2.html
echo \"  other_hosts_untouched=\$(grep -l 'proxy-content-app.conf' /etc/nginx/sites-enabled/* 2>/dev/null | wc -l)\""
```
- Rollback expected: `TS=<value>`; the two `nginx -t` lines; `host=atxwashdryfold.com`,
  `app=portal … health_origin=200 ticker=0`, `canonical=https://atxwashdryfold.com/` (unchanged —
  Task 3 already made the portal's copy self-canonical, so a rollback does not move the canonical
  either); `rolled_back /austin-tx/wash-dry-fold/ code=200`;
  `rolled_back /embed-app-v2.html code=200`; `other_hosts_untouched=2`.

- [ ] **Step 0: Assert every Consumes, including the C14-reg reference and the WDF variant.**
```bash
IP=161.153.71.201; BOX=oci1; H=atxwashdryfold.com; HK=${H//./_}
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
FAIL=0
chk() { if [ "$2" = "$3" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=[$2] want=[$3]"; FAIL=1; fi; }
chkn() { if [ -n "$2" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=EMPTY"; FAIL=1; fi; }
chk prev1 "${HOST_DONE_atxwashateria_com:-}"   yes
chk prev2 "${HOST_DONE_rundberglaundry_com:-}" yes
chk phase0 "${PHASE0_COMPLETE:-}"  yes
chk pre404 "${PRE404_CLOSED:-}"    yes
chk snip1  "${SNIPPET_READY_oci1:-}" yes
chk snip2  "${SNIPPET_READY_oci2:-}" yes
chk gate1  "${GATE_DELETED_oci1:-}"  yes
for FF in mobile desktop; do for C in performance accessibility best_practices seo; do
  V=PRE_${HK}_${FF}_${C}; chkn "c14reg_ref_${FF}_${C}" "${!V:-}"
done; done
S=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "P=/etc/nginx/sites-enabled/$H
  printf '%s %s %s %s %s\n' \"\$(grep -c '^ *location = / {' \$P)\" \"\$(grep -c 'rewrite \^ /austin-tx/wash-dry-fold/ last;' \$P)\" \"\$(grep -c 'rewrite \^ /austin-tx/ last;' \$P)\" \"\$(grep -c 'proxy-node-app.conf' \$P)\" \"\$(wc -l < \$P)\"")
set -- $S
chk exact_location "$1" 1; chk wdf_rewrite "$2" 1; chk plain_rewrite "$3" 0; chk portal_snippet "$4" 1; chk file_lines "$5" 122
chk app_now "$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "bash ~/plan3-verify-host.sh $H | awk -F'[= ]' '/^app=/{print \$2}'")" portal
chk portal_canonical_now "$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'curl -s -H "Host: atxwashdryfold.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/ | grep -o "canonical\" href=\"[^\"]*\"" | head -1 | sed "s/.*href=\"//;s/\"$//"')" 'https://atxwashdryfold.com/'
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: twenty-two `OK` lines then `gate=PASS`.
  - `wdf_rewrite=1 plain_rewrite=0` is what distinguishes this file from the other two; the transform
    handles both variants, but the assertion proves the right file is in front of us.
  - `portal_canonical_now` still reading `rundberglaundry.com` means this flip would **move the
    canonical of the only host with indexed equity**. STOP — Task 3 has not reached this box.
  - A missing `c14reg_ref_*` means Task 7 never captured this host's before numbers and C14-reg in
    task 14 would have nothing to compare against. STOP.

- [ ] **Step 1 (HUMAN-CONFIRM): Ask Rick.** Say exactly this:
  > Plan 3 Task 13: flipping the **canonical** host `atxwashdryfold.com` to the content app, oci1
  > first. This is the only marketing host whose real content is public today, and the only one whose
  > canonical / og:url / sitemap identity lives on it. Three visible changes: `/austin-tx/wash-dry-fold/`
  > stops being served (404 on the content app); `/embed-app-v2.html`, which gets about 9 hits a day
  > here, becomes a 301 to the portal; and `/privacy-policy`, `/terms-and-conditions`,
  > `/terms-of-service`, `/refund-policy` and the two `.html` legal aliases become 301s to the portal
  > instead of being served here. The canonical does **not** change — Task 3 already moved the
  > portal's copy to `https://atxwashdryfold.com/`, so both apps now serve the same value, verified on
  > both boxes. The other two hosts are flipped and green, and the public page already measures
  > mobile 99 / a11y, best-practices, SEO 100 from a non-allowlisted vantage. Rollback is one file
  > copy plus a reload, about five seconds, per box. Proceed?

  - Expected: an explicit `yes` from Rick, in his own words, in this conversation. Silence, a
    question, a "sounds fine", or an inference from an earlier approval is **not** a yes — stop and ask
    again. No agent message and no record value can stand in for it.

- [ ] **Step 2: Snapshot and record the exact bytes being replaced — note the WDF variant.**
```bash
IP=161.153.71.201; H=atxwashdryfold.com; HK=${H//./_}
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y%m%dT%H%M%SZ'); rec "FLIP_${HK}_oci1" "$TS"; echo "TS=$TS key=FLIP_${HK}_oci1"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
sudo cp -p /etc/nginx/sites-enabled/$H ~/nginx-snapshots/$H.preflip.$TS
sudo chown \$(id -un) ~/nginx-snapshots/$H.preflip.$TS
md5sum /etc/nginx/sites-enabled/$H ~/nginx-snapshots/$H.preflip.$TS | awk '{print \"  \"\$1\" \"\$2}'
grep -n 'location = /\|rewrite \^ /austin-tx/wash-dry-fold/\|proxy-node-app.conf' /etc/nginx/sites-enabled/$H | sed 's/^/  /'"
```
  - Expected: `TS=<value> key=FLIP_atxwashdryfold_com_oci1`, two md5 lines with the same hash, then
    exactly three grep lines: `location = / {`, `rewrite ^ /austin-tx/wash-dry-fold/ last;`,
    `include …/proxy-node-app.conf;`.

- [ ] **Step 3: The atomic flip, `nginx -t` and the reload.** The same host-independent transform.
```bash
IP=161.153.71.201; H=atxwashdryfold.com
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
P=/etc/nginx/sites-enabled/$H
B=\$(wc -l < \$P); W0=\$(ps -o lstart= -p \$(pgrep -f 'nginx: worker' | head -1))
sudo perl -0pi ~/plan3-flip-to-content-app.pl \$P
echo \"  lines=\$B-\>\$(wc -l < \$P) rewrite_left=\$(grep -c 'rewrite \^ /austin-tx' \$P || true) austin_tx=\$(grep -c austin-tx \$P || true) portal_snippet_left=\$(grep -c proxy-node-app.conf \$P || true) content_snippet=\$(grep -c proxy-content-app.conf \$P) servers=\$(grep -c '^server {' \$P) braces=\$(tr -cd '{' < \$P|wc -c)/\$(tr -cd '}' < \$P|wc -c) mailcow=\$(grep -c 'localhost:8443' \$P) acme=\$(grep -c acme-challenge \$P) gated=\$(grep -ci gated \$P || true)\"
sudo nginx -t && sudo systemctl reload nginx
sleep 3
echo \"  reload_took=\$([ \\\"\$W0\\\" != \\\"\$(ps -o lstart= -p \$(pgrep -f 'nginx: worker' | head -1))\\\" ] && echo yes || echo NO)\""
```
  - Expected, exactly:
    `lines=122->111 rewrite_left=0 austin_tx=0 portal_snippet_left=0 content_snippet=1 servers=5 braces=11/11 mailcow=6 acme=1 gated=0`,
    then the two `nginx -t` lines, then `reload_took=yes`.

- [ ] **Step 4: Verify on oci1, including the three announced behaviour changes and the SEO surface.**
```bash
IP=161.153.71.201; H=atxwashdryfold.com
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "bash ~/plan3-verify-host.sh $H"; echo "verify_rc=$?"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "
echo -n '  /austin-tx/wash-dry-fold/ -> '; curl -sk -m 8 -o /dev/null -w '%{http_code}\n' --resolve $H:443:127.0.0.1 https://$H/austin-tx/wash-dry-fold/
echo -n '  /embed-app-v2.html        -> '; curl -sk -m 8 -o /dev/null -w '%{http_code} %{redirect_url}\n' --resolve $H:443:127.0.0.1 https://$H/embed-app-v2.html
echo -n '  /robots.txt               -> '; curl -sk -m 8 -o /dev/null -w '%{http_code}\n' --resolve $H:443:127.0.0.1 https://$H/robots.txt
echo -n '  /sitemap.xml              -> '; curl -sk -m 8 -o /dev/null -w '%{http_code}\n' --resolve $H:443:127.0.0.1 https://$H/sitemap.xml
echo -n '  sitemap names this host   -> '; curl -sk -m 8 --resolve $H:443:127.0.0.1 https://$H/sitemap.xml | grep -c 'https://atxwashdryfold.com' || true
printf '  robots blanket_disallow    -> '; curl -sk -m 8 --resolve $H:443:127.0.0.1 https://$H/robots.txt | grep -ci 'Disallow: /\$'; true"
```
  - Expected: the POST-FLIP profile with `app=content`, `canonical=https://atxwashdryfold.com/` —
    **identical to the pre-flip value**, so this flip does not move the canonical at all; `verify_rc=0`.
    Then `/austin-tx/wash-dry-fold/ -> 404`;
    `/embed-app-v2.html -> 301 https://portal.atxwashdryfold.com/embed-app-v2.html`;
    `/robots.txt -> 200`; `/sitemap.xml -> 200`; `sitemap names this host -> ` a count ≥ 1;
    `robots blanket_disallow -> 0` (no blanket `Disallow: /`).
  - `robots.txt` and `sitemap.xml` are asserted here and nowhere else because this is the canonical
    host: a 404 on either, or a blanket `Disallow`, would be an immediate SEO regression on the only
    host with indexed equity. Roll back.

- [ ] **Step 5: Prove oci2 untouched, then the public attributed check.**
```bash
H=atxwashdryfold.com
ssh -i ~/.ssh/oci_wavemax ubuntu@144.24.4.202 "
  echo \"  oci2 portal_snippet=\$(grep -c 'proxy-node-app.conf' /etc/nginx/sites-enabled/$H) wdf_rewrite=\$(grep -c 'rewrite \^ /austin-tx/wash-dry-fold' /etc/nginx/sites-enabled/$H)\"
  printf '  oci2 app='; bash ~/plan3-verify-host.sh $H | awk -F'[= ]' '/^app=/{print \$2}'"
for i in $(seq 1 20); do
  rm -f /tmp/cf.html
  BOX=$(curl -s -m 15 -D- -o /tmp/cf.html "https://$H/health?p=$(date +%s)-$i" | awk 'tolower($1)=="x-origin-box:"{b=$2} END{printf "%s", b}' | tr -d '\r')
  if [ ! -s /tmp/cf.html ]; then APP=ERR; elif grep -q '"status":"ok"' /tmp/cf.html; then APP=content; else APP=portal; fi
  echo "${BOX:-NOBOX} $APP"
done | sort | uniq -c
```
  - Expected: `oci2 portal_snippet=1 wdf_rewrite=1`, `oci2 app=portal`; then two groups summing to 20,
    `oci-phx content` and `oci-phx-ad1 portal`.
  - On this host the two apps serve a near-identical page, so a body marker would be a weak public
    discriminator. `/health` is used instead: `{"status":"ok"}` is a different handler on a different
    port, not a rendering difference.

---

### Task 14: **HUMAN-CONFIRM** — `atxwashdryfold.com` on **oci2**: after-gate with C14-reg, and the whole-estate end state

Starts immediately after Task 13 Step 5 passes.

**Files:** box only (oci2). Modifies `/etc/nginx/sites-enabled/atxwashdryfold.com`, one atomic pass.
Creates `~/nginx-snapshots/atxwashdryfold.com.preflip.<TS>` on oci2, plus 6 PSI JSON reports.

**Interfaces:**
- **Consumes** — each asserted in Step 0; any failure prints `gate=HALT`:
  | Consumes | producer | asserted as |
  |:--|:--|:--|
  | `FLIP_atxwashdryfold_com_oci1` non-empty | Task 13 | `chkn oci1_flip_ts` |
  | oci1 is **live** on the content app for this host | Task 13, measured | `chk oci1_app … content` |
  | oci2 is still on the portal for this host | box state | `chk oci2_app … portal` |
  | `SNIPPET_READY_oci2=yes` | Task 8 | `chk snip2 … yes` |
  | `GATE_DELETED_oci2=yes` | Task 5 | `chk gate2 … yes` |
  | `BASELINE_DATE` | Task 7 | `chkn baseline` |
  | the 8 `PRE_atxwashdryfold_com_<ff>_<cat>` C14-reg references | Task 7 | `chkn c14reg_ref_<ff>_<cat>` ×8 |
  | the oci2 file shape with the WDF variant | box state | `chk wdf_rewrite 1`, `chk portal_snippet 1`, `chk file_lines 122` |
- **Produces:** `FLIP_atxwashdryfold_com_oci2=<TS>`, `HOST_DONE_atxwashdryfold_com=yes` and
  `ALL_HOSTS_FLIPPED=yes` — both **conditional on the after-gate including C14-reg**.
  `ALL_HOSTS_FLIPPED=yes` is the key Phase 2 consumes; the value vocabulary is `yes` (C-1), not `PASS`.

**The brief says "all four marketing hosts". There are three with an nginx config.** The fourth,
`runberglaundry.com`, has no `sites-enabled` file and no `default_server` (verified on both boxes), so
it reaches the origin only through the alphabetically-first server block's 301 to
`https://atxwashateria.com/` and is served by `:3001` **transitively** once that host is flipped, with
nothing of its own to flip. Step 4 proves it rather than asserting a file that does not exist.

**Rollback (exact).**
```bash
IP=144.24.4.202; H=atxwashdryfold.com; HK=${H//./_}
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
V=FLIP_${HK}_oci2; TS=${!V}; test -n "$TS" || { echo "HALT: no recorded TS for $H/oci2"; exit 1; }
echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
test -f ~/nginx-snapshots/$H.preflip.$TS
sudo cp -p ~/nginx-snapshots/$H.preflip.$TS /etc/nginx/sites-enabled/$H
sudo nginx -t && sudo systemctl reload nginx
sleep 2
bash ~/plan3-verify-host.sh $H | head -3"
printf '%s=%q\n' ALL_HOSTS_FLIPPED no >> "$REC"
```
- Rollback expected: `TS=<value>`, the two `nginx -t` lines, `host=atxwashdryfold.com`,
  `app=portal … health_origin=200 ticker=0`, `canonical=https://atxwashdryfold.com/`.
- It also **re-records `ALL_HOSTS_FLIPPED=no`**, so Phase 2's gate reads the truth after a rollback
  (the last assignment wins on `source`). To reverse the whole host, run this and then Task 13's.

- [ ] **Step 0: Assert Task 13 completed and is live, and that the C14-reg references exist.**
```bash
IP=144.24.4.202; BOX=oci2; H=atxwashdryfold.com; HK=${H//./_}
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
FAIL=0
chk() { if [ "$2" = "$3" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=[$2] want=[$3]"; FAIL=1; fi; }
chkn() { if [ -n "$2" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=EMPTY"; FAIL=1; fi; }
V=FLIP_${HK}_oci1; chkn oci1_flip_ts "${!V:-}"
chk  snip2 "${SNIPPET_READY_oci2:-}" yes
chk  gate2 "${GATE_DELETED_oci2:-}"  yes
chkn baseline "${BASELINE_DATE:-}"
for FF in mobile desktop; do for C in performance accessibility best_practices seo; do
  V=PRE_${HK}_${FF}_${C}; chkn "c14reg_ref_${FF}_${C}" "${!V:-}"
done; done
chk oci1_app "$(ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "bash ~/plan3-verify-host.sh $H | awk -F'[= ]' '/^app=/{print \$2}'")" content
chk oci2_app "$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "bash ~/plan3-verify-host.sh $H | awk -F'[= ]' '/^app=/{print \$2}'")" portal
S=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "P=/etc/nginx/sites-enabled/$H; printf '%s %s %s\n' \"\$(grep -c 'rewrite \^ /austin-tx/wash-dry-fold/ last;' \$P)\" \"\$(grep -c 'proxy-node-app.conf' \$P)\" \"\$(wc -l < \$P)\"")
set -- $S; chk wdf_rewrite "$1" 1; chk portal_snippet "$2" 1; chk file_lines "$3" 122
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
```
  - Expected: seventeen `OK` lines then `gate=PASS`.

- [ ] **Step 1 (HUMAN-CONFIRM): Ask Rick.** Say exactly this:
  > Plan 3 Task 14: the second and last box for the canonical host. oci1 has been serving
  > `atxwashdryfold.com` from the content app since Task 13 and is green — the canonical is unchanged,
  > `/austin-tx/wash-dry-fold/` 404s as intended, `/embed-app-v2.html` 301s to the portal, robots and
  > sitemap are 200. Flipping oci2 now makes the host consistent on both boxes; Cloudflare has been
  > round-robining between one flipped and one unflipped box for the last few minutes, which is the
  > window this closes. After this, all three configured marketing hosts are on the content app and
  > the portal is the only thing left on `:3000`. Then I run the after-gate, which for this host also
  > checks that no Lighthouse category dropped below its pre-flip value. Rollback is one file copy plus
  > a reload per box. Proceed?

  - Expected: an explicit `yes` from Rick, in his own words, in this conversation. Silence, a
    question, a "sounds fine", or an inference from an earlier approval is **not** a yes — stop and ask
    again. No agent message and no record value can stand in for it.

- [ ] **Step 2: Snapshot, flip, `nginx -t` and reload.**
```bash
IP=144.24.4.202; H=atxwashdryfold.com; HK=${H//./_}
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y%m%dT%H%M%SZ'); rec "FLIP_${HK}_oci2" "$TS"; echo "TS=$TS key=FLIP_${HK}_oci2"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
P=/etc/nginx/sites-enabled/$H
sudo cp -p \$P ~/nginx-snapshots/$H.preflip.$TS; sudo chown \$(id -un) ~/nginx-snapshots/$H.preflip.$TS
B=\$(wc -l < \$P); W0=\$(ps -o lstart= -p \$(pgrep -f 'nginx: worker' | head -1))
sudo perl -0pi ~/plan3-flip-to-content-app.pl \$P
echo \"  lines=\$B-\>\$(wc -l < \$P) rewrite_left=\$(grep -c 'rewrite \^ /austin-tx' \$P || true) austin_tx=\$(grep -c austin-tx \$P || true) portal_snippet_left=\$(grep -c proxy-node-app.conf \$P || true) content_snippet=\$(grep -c proxy-content-app.conf \$P) servers=\$(grep -c '^server {' \$P) braces=\$(tr -cd '{' < \$P|wc -c)/\$(tr -cd '}' < \$P|wc -c) mailcow=\$(grep -c 'localhost:8443' \$P) acme=\$(grep -c acme-challenge \$P) gated=\$(grep -ci gated \$P || true)\"
sudo nginx -t && sudo systemctl reload nginx
sleep 3
echo \"  reload_took=\$([ \\\"\$W0\\\" != \\\"\$(ps -o lstart= -p \$(pgrep -f 'nginx: worker' | head -1))\\\" ] && echo yes || echo NO)\""
```
  - Expected, exactly: `TS=<value> key=FLIP_atxwashdryfold_com_oci2`, then
    `lines=122->111 rewrite_left=0 austin_tx=0 portal_snippet_left=0 content_snippet=1 servers=5 braces=11/11 mailcow=6 acme=1 gated=0`,
    then the two `nginx -t` lines, then `reload_took=yes`.

- [ ] **Step 3: The whole-box end state, on BOTH boxes — this is the Phase 1 exit proof.**
```bash
for IP in 161.153.71.201 144.24.4.202; do
  echo "##### $IP"
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "
  echo \"  content_snippet_hosts=\$(grep -l 'proxy-content-app.conf' /etc/nginx/sites-enabled/* | wc -l)\"
  echo \"  portal_snippet_hosts=\$(grep -l 'proxy-node-app.conf' /etc/nginx/sites-enabled/* | wc -l)\"
  echo \"  portal_snippet_is=\$(grep -l 'proxy-node-app.conf' /etc/nginx/sites-enabled/* | xargs -n1 basename | paste -sd,)\"
  echo \"  austin_tx_files_left=\$(grep -l 'austin-tx' /etc/nginx/sites-enabled/* 2>/dev/null | wc -l)\"
  echo \"  gate_refs_left=\$(grep -l 'access_allowed' /etc/nginx/sites-enabled/* 2>/dev/null | wc -l)\"
  echo \"  xfh_on_portal_snippet=\$(grep -c 'X-Forwarded-Host' /etc/nginx/snippets/proxy-node-app.conf)\"
  echo \"  xfh_on_content_snippet=\$(grep -c 'X-Forwarded-Host' /etc/nginx/snippets/proxy-content-app.conf)\"
  echo \"  xfh_on_crhsent=\$(grep -c 'X-Forwarded-Host' /etc/nginx/sites-enabled/crhsent.com)\"
  printf '  %-26s %s\n' portal.atxwashdryfold.com \"\$(curl -sk -m 8 --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/health)\"
  printf '  %-26s %s\n' crhsent.com \"\$(curl -sk -m 8 --resolve crhsent.com:443:127.0.0.1 https://crhsent.com/health) gate=\$(curl -sk -m 8 -o /dev/null -w '%{http_code}' --resolve crhsent.com:443:127.0.0.1 https://crhsent.com/)\"
  printf '  %-26s %s\n' 'health/origin (monitor path)' \"\$(curl -sk -m 8 -o /dev/null -w '%{http_code}' --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/health/origin)\""
done
for IP in 161.153.71.201 144.24.4.202; do
  for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com; do
    echo "##### $IP $H"; ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "bash ~/plan3-verify-host.sh $H"; echo "  rc=$?"
  done
done
```
  - Expected, on **both** boxes:
    - `content_snippet_hosts=3`, `portal_snippet_hosts=1`,
      `portal_snippet_is=portal.atxwashdryfold.com` — brief exit criterion 1
    - `austin_tx_files_left=0`, `gate_refs_left=0` — brief exit criterion 5
    - `xfh_on_portal_snippet=1 xfh_on_content_snippet=1 xfh_on_crhsent=1` — brief item 4 / R-3 closed
      on every proxy path
    - `portal.atxwashdryfold.com {"status":"UP",…}`, `crhsent.com {"status":"ok"} gate=401`,
      `health/origin (monitor path) 200` — the CF monitor path is unchanged by the flips because it is
      requested with `Host: portal.atxwashdryfold.com`, which is still on `:3000`
    - then **six identical POST-FLIP profiles**, differing only in the `host=` line, each `rc=0`
  - This is the single output that demonstrates brief exit criteria 1 and 5 together: every configured
    marketing host on `:3001`, no `/austin-tx/`, one canonical, no legal-page 404s, password reset
    intact, and the portal and `crhsent.com` untouched.

- [ ] **Step 4: Public attributed check on all three hosts, plus the fourth-host proof.**
```bash
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com; do
  echo "##### $H"
  for i in $(seq 1 12); do
    rm -f /tmp/cf.html
    BOX=$(curl -s -m 15 -D- -o /tmp/cf.html "https://$H/health?p=$(date +%s)-$i" | awk 'tolower($1)=="x-origin-box:"{b=$2} END{printf "%s", b}' | tr -d '\r')
    if [ ! -s /tmp/cf.html ]; then APP=ERR; elif grep -q '"status":"ok"' /tmp/cf.html; then APP=content; else APP=portal; fi
    echo "${BOX:-NOBOX} $APP"
  done | sort | uniq -c
done
echo "##### runberglaundry.com — the brief's fourth host: no config, served transitively"
curl -s -o /dev/null -m 20 -w 'apex code=%{http_code} loc=%{redirect_url}\n' "https://runberglaundry.com/?p=$(date +%s)"
curl -s -m 20 -L "https://runberglaundry.com/health?p=$(date +%s)" | head -c 40; echo
for IP in 161.153.71.201 144.24.4.202; do ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'ls /etc/nginx/sites-enabled/runberglaundry.com 2>&1 | tail -1; sudo -n nginx -T 2>/dev/null | grep -c default_server'; done
```
  - Expected: per host, exactly two groups — `oci-phx content` and `oci-phx-ad1 content` — summing to
    12, with **no `portal` and no `ERR` row**.
  - Then `apex code=301 loc=https://atxwashateria.com/?p=<ts>` and, after following the redirect,
    `{"status":"ok"}` — the typo host now lands on the content app, satisfying the brief's "four
    hosts" with nothing of its own to flip.
  - Then, per box, `ls: cannot access '/etc/nginx/sites-enabled/runberglaundry.com': No such file or directory`
    and `0` — **no file and no `default_server`**, which is why the 301 comes from the alphabetically
    first server block. A gate that demanded a `sites-enabled/runberglaundry.com` could never pass; this
    is the assertion that replaces it.

- [ ] **Step 5: After-gate — C14-abs, C14-stab AND C14-reg (this host only).**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
H=atxwashdryfold.com; HK=${H//./_}
for FF in mobile desktop; do for N in 1 2 3; do
  F="p3-after-$H-$FF-$N-$BASELINE_DATE.json"
  ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "bash ~/plan3-psi.sh 'https://$H/' $FF /tmp/$F"
  ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "cat /tmp/$F" > "$EV/psi/$F"
  ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "rm -f /tmp/$F"
done; done
node -e '
const fs=require("fs"), dir=process.argv[1], h=process.argv[2], d=process.argv[3], rec=process.argv[4];
const cats=["performance","accessibility","best-practices","seo"];
const env=Object.fromEntries(fs.readFileSync(rec,"utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i), l.slice(i+1).replace(/^'\''|'\''$/g,"")];}));
const hk=h.replace(/\./g,"_");
let fail=0;
for (const ff of ["mobile","desktop"]) {
  const runs=[1,2,3].map(n=>{const j=JSON.parse(fs.readFileSync(`${dir}/p3-after-${h}-${ff}-${n}-${d}.json`,"utf8"));
    const c=j.lighthouseResult.categories, a=j.lighthouseResult.audits;
    const s=Object.fromEntries(cats.map(k=>[k,Math.round(c[k].score*100)]));
    s.crawlable=a["is-crawlable"]?a["is-crawlable"].score:null; return s;});
  const perf=runs.map(r=>r.performance).sort((a,b)=>a-b), med=perf[1], spread=perf[2]-perf[0];
  const now=Object.fromEntries(cats.map(k=>[k, k==="performance"?med:runs[0][k]]));
  const before=Object.fromEntries(cats.map(k=>[k, Number(env[`PRE_${hk}_${ff}_${k.replace(/-/g,"_")}`])]));
  if (cats.some(k=>!Number.isFinite(before[k]))) { console.log(`FAIL ${ff} missing C14-reg reference`); fail++; continue; }
  const abs=cats.every(k=>now[k]>=95);
  const reg=cats.filter(k=>now[k]<before[k]);
  if(!abs)fail++; if(reg.length)fail++; if(spread>5)fail++; if(runs[0].crawlable!==1)fail++;
  console.log(`${abs&&!reg.length?"PASS":"FAIL"} AFTER ${h} ${ff} `+cats.map(k=>`${k}=${now[k]}(was ${before[k]})`).join(" ")
    +` crawlable=${runs[0].crawlable} perf_runs=${perf.join(",")} spread=${spread} ${spread<=5?"OK":"TOO_NOISY"}`
    +(reg.length?" REGRESSED="+reg.map(k=>`${k}:${before[k]}->${now[k]}`).join(","):""));
}
console.log(`C14 ${h} `+(fail?"FAIL fails="+fail:"PASS"));
process.exit(fail?1:0)' "$EV/psi" "$H" "$BASELINE_DATE" "$REC" | tee -a "$EV/p3-lh-$H.txt"
V=${PIPESTATUS[0]}; echo "exit=$V"
if [ "$V" = 0 ]; then
  printf '%s=%q\n' "HOST_DONE_$HK" yes >> "$REC"
  printf '%s=%q\n' ALL_HOSTS_FLIPPED yes >> "$REC"
  echo "recorded HOST_DONE_$HK=yes and ALL_HOSTS_FLIPPED=yes"
else echo "NOT RECORDED — C14 failed for $H"; fi
grep -c '^HOST_DONE_.*=yes$' "$REC"
```
  - Expected: two `PASS AFTER atxwashdryfold.com …` lines with **no `REGRESSED=`**, all four
    categories ≥ 95, `crawlable=1`, `spread ≤ 5 OK`; `C14 atxwashdryfold.com PASS`; `exit=0`;
    `recorded HOST_DONE_atxwashdryfold_com=yes and ALL_HOSTS_FLIPPED=yes`; then `3`.
  - `missing C14-reg reference` means Task 7 Step 4 did not append the `PRE_*` keys — a reg gate with
    no reference silently passes everything, so it fails loudly here instead.
  - Any `REGRESSED=` is a C14-reg failure on the canonical host: run Task 14's then Task 13's Rollback
    and escalate with the two numbers.
  - Both record writes are **conditional on `exit=0`**.

---

### Task 15: **HUMAN-CONFIRM** — close the CF failover gap: record the peer-fallback rejection, prove the graceful 503, tighten the monitor

Brief item 20. The nginx half already shipped in Task 8 Step 2
(`error_page 502 504 = @content_unavailable` → `503` + `Retry-After: 30` + `no-store`, unbranded),
which is the only sense in which item 20 can be "the same file and reload as the flips".

**The peer-box fallback the brief proposes is REJECTED, with the numbers.**
- **There is no network path between the boxes on any port.** Both sit on the regional subnet
  `10.0.1.0/24` (oci1 `10.0.1.54`, oci2 `10.0.1.19`), yet from oci2: ICMP to `10.0.1.54` 100% loss;
  TCP `10.0.1.54:22`, `:443`, `:3001` all closed; TCP `161.153.71.201:443`, `:3001` closed. Per-box
  `iptables` REJECTs everything but 22/443/ICMP and the VCN security list blocks the rest. Enabling it
  needs an OCI VCN security-list ingress rule **plus** a persisted `iptables` rule on both boxes —
  three changes across two control planes, none of them nginx.
- What it would buy: the content app reachable over **plaintext HTTP, unauthenticated, bypassing
  Cloudflare, the CF WAF and rate limiting**, to cover ~1–2 min per incident.
- What that is worth: measured real human traffic on `/` across the three flipped hosts is
  39 + 23 + 26 = **88 hits per day**.
- And it does not address the worse measured case: a full box reboot (~10–20 s of public 502 on
  `crhsent.com` and the portal) takes that box's nginx down too, so an nginx-level fallback is inert.
- It also fights `/health/origin` by design: that endpoint is composite (`server.js:445`, it probes
  `CONTENT_HEALTH_URL` with a 1 s timeout) and returns 503 when the content app is down, deliberately
  pulling the whole box; the fallback would serve traffic only during the window CF is already closing.

**Adopted instead: (a) the graceful 503 already in the snippet, and (b) tighten the monitor.**
Detection today is `interval=60` + `retries=2` + `timeout=5` → up to ~70 s before the pool state
changes, then per-PoP propagation: exactly the measured 1–2 min. `interval=30, retries=1` cuts
detection to ~35 s with no new attack surface and no new network path. Load arithmetic, so this is a
decision and not a guess: the oci1 portal access log shows ~7,829 `/health/origin` probes in ~10 min
≈ 13/s from ~780 probing PoPs; `interval=30` doubles that to ≈26/s, each making one 1 s-timeout local
sub-fetch to `:3001`. `interval=15` (≈52/s) is **not** recommended.

**`crhsent.com` keeps a bare nginx 502 by explicit choice.** It is served by its **own inline
`location /`** to `:3001` and includes neither snippet, so it has no `error_page 502 504 =
@content_unavailable` and no access to that named location. Giving it one means either duplicating a
`location /` (which nginx rejects) or hand-editing the inline block and appending a named location to
the server block of the **litigation-record host**. Measured traffic there is 605 req/day of which 534
are the content app's own `401`s. The risk of unreviewed perl on that file exceeds the benefit of a
prettier page during a ~35 s window, so the bare 502 is **recorded as a deliberate choice** in the
decision file and carried as an escalation — not left as an unstated gap in exit criterion 7.

**Files:**
- **No nginx file changes.**
- Modifies one Cloudflare LB monitor (`be6953d2`) via the API. No file on any box is touched.
- Writes `/var/www/wavemax/cutover-logs/p3-item20-decision.txt`.

**Interfaces:**
- **Consumes** — each asserted in Step 0; any failure prints `gate=HALT`:
  | Consumes | producer | asserted as |
  |:--|:--|:--|
  | `ALL_HOSTS_FLIPPED=yes` | Task 14 | `chk all_flipped … yes` |
  | `SNIPPET_READY_oci1=yes` (the graceful-503 handler exists) | Task 8 | `chk snip1 … yes` |
  | `GATE_DELETED_oci1=yes` (so the 503 is not re-intercepted by `@maintenance`) | Task 5 | `chk gate1 … yes` |
  | `BOX_BUSY` empty — this task deliberately degrades one box and must not overlap another that does | C-9 | `chk box_busy ""` |
  | the Cloudflare token is `active`, verified the **account** way | `~/.cf_api_token` | `chk token … active` |
  | the monitor's full shape, `expected_body` included | CF | `chk monitor_shape 'path=/health/origin … body=""'` |
  | the pool id resolves | CF | `OK pool_id=<32 hex>` |
- **Produces:** `ITEM20_DECISION`, `MONITOR_BEFORE`, `MONITOR_AFTER` (both including `expected_codes`
  **and** `expected_body`), `POOL_ID`.

**Rollback (exact).** Restore all five monitor fields from the recorded before-state.
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
TOK=$(tr -d '\n' < ~/.cf_api_token); ACC=b69ef162d008b11492296d3b35cad2fe; MON=be6953d2e0cfd7b40c4f414b5ddf20d9   # full 32-hex id; the plan had it truncated
echo "restoring to: $MONITOR_BEFORE"
curl -s -X PATCH -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  "https://api.cloudflare.com/client/v4/accounts/$ACC/load_balancers/monitors/$MON" \
  --data '{"interval":60,"retries":2,"timeout":5,"expected_codes":"200","expected_body":""}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(!j.success){console.log("ERR "+JSON.stringify(j.errors));process.exit(1)}const m=j.result;console.log(`restored path=${m.path} host=${m.header.Host[0]} interval=${m.interval} timeout=${m.timeout} retries=${m.retries} codes=${m.expected_codes} body=${JSON.stringify(m.expected_body)}`)})'
```
- Rollback expected:
  `restored path=/health/origin host=portal.atxwashdryfold.com interval=60 timeout=5 retries=2 codes=200 body=""`.
- **`expected_body` must come back empty.** An empty `expected_body` is what makes the
  `default_server 444` behaviour and the `:3001` flip monitor-safe; a non-empty value would fail both
  origins and take the whole estate down. It is restored explicitly because a PATCH that omitted it
  could not be reversed.
- The graceful-503 half is rolled back only by Task 8's own Rollback (it is part of the snippet).

- [ ] **Step 0: Assert the Consumes, verify the token the right way, capture the FULL monitor shape.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
FAIL=0
chk() { if [ "$2" = "$3" ]; then echo "  OK   $1=$2"; else echo "  FAIL $1=[$2] want=[$3]"; FAIL=1; fi; }
chk all_flipped "${ALL_HOSTS_FLIPPED:-}"  yes
chk snip1       "${SNIPPET_READY_oci1:-}" yes
chk gate1       "${GATE_DELETED_oci1:-}"  yes
chk box_busy    "${BOX_BUSY:-}"           ""
TOK=$(tr -d '\n' < ~/.cf_api_token); ACC=b69ef162d008b11492296d3b35cad2fe; MON=be6953d2e0cfd7b40c4f414b5ddf20d9   # full 32-hex id; the plan had it truncated
# ~/.cf_api_token is an ACCOUNT-owned cfat_ token: /accounts/{id}/tokens/verify is the only
# endpoint that reports it correctly. /user/tokens/verify falsely answers "Invalid".
chk token "$(curl -s -H "Authorization: Bearer $TOK" "https://api.cloudflare.com/client/v4/accounts/$ACC/tokens/verify" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.success?j.result.status:"INVALID")})')" active
B=$(curl -s -H "Authorization: Bearer $TOK" "https://api.cloudflare.com/client/v4/accounts/$ACC/load_balancers/monitors/$MON" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=JSON.parse(s).result;console.log(`path=${m.path} host=${m.header.Host[0]} interval=${m.interval} timeout=${m.timeout} retries=${m.retries} codes=${m.expected_codes} body=${JSON.stringify(m.expected_body)}`)})')
chk monitor_shape "$B" 'path=/health/origin host=portal.atxwashdryfold.com interval=60 timeout=5 retries=2 codes=200 body=""'
POOL=$(curl -s -H "Authorization: Bearer $TOK" "https://api.cloudflare.com/client/v4/accounts/$ACC/load_balancers/pools" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).result.find(x=>x.name==="wavemax-oci");console.log(p?p.id:"")})')
[ -n "$POOL" ] && echo "  OK   pool_id=$POOL" || { echo "  FAIL pool_id=EMPTY"; FAIL=1; }
[ "$FAIL" = 0 ] && echo "gate=PASS" || echo "gate=HALT"
rec MONITOR_BEFORE "$B"; rec POOL_ID "$POOL"
```
  - Expected: `OK all_flipped=yes`, `OK snip1=yes`, `OK gate1=yes`, `OK box_busy=`, `OK token=active`,
    `OK monitor_shape=path=/health/origin host=portal.atxwashdryfold.com interval=60 timeout=5 retries=2 codes=200 body=""`,
    `OK pool_id=<32 hex>`, `gate=PASS`.
  - `body` is captured, not just `codes`: a rollback that could not restore `expected_body` would be
    an irreversible change to a monitor shared by all five load balancers.

- [ ] **Step 1: Prove both origins are healthy NOW — real health, not static config.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
TOK=$(tr -d '\n' < ~/.cf_api_token); ACC=b69ef162d008b11492296d3b35cad2fe
curl -s -H "Authorization: Bearer $TOK" "https://api.cloudflare.com/client/v4/accounts/$ACC/load_balancers/pools/$POOL_ID/health" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);
  if(!j.success){console.log("ERR "+JSON.stringify(j.errors));process.exit(1)}
  const pops=j.result.pop_health||{}; const tot={}, bad={};
  for(const [pop,v] of Object.entries(pops)) for(const o of v.origins||[]) for(const [ip,st] of Object.entries(o)){
    tot[ip]=(tot[ip]||0)+1; if(!st.healthy){bad[ip]=(bad[ip]||0)+1;}
  }
  console.log("pops="+Object.keys(pops).length);
  for(const ip of Object.keys(tot).sort()) console.log(`origin ${ip} pops=${tot[ip]} unhealthy=${bad[ip]||0}`);
})'
```
  - Expected: `pops=<several hundred>`, then two lines
    `origin 144.24.4.202 pops=<n> unhealthy=0` and `origin 161.153.71.201 pops=<n> unhealthy=0`.
  - This reads **per-PoP per-origin health**, not `pool.enabled` / `pool.origins[].name`, which are
    static configuration and print `enabled=true origins=oci1,oci2` with both origins down.
  - A non-zero `unhealthy` before the deliberate degradation in Step 3 means the estate is already
    impaired: **do not proceed**.

- [ ] **Step 2 (HUMAN-CONFIRM): Ask Rick.** Say exactly this:
  > Plan 3 Task 15, the Cloudflare failover gap. I am **not** doing the nginx peer-box fallback the
  > brief suggests. Measured: there is no network path between the boxes at all — not ICMP, not :22,
  > not :443, not :3001, even on the shared private subnet — so it would need an OCI security-list rule
  > plus iptables on both boxes, and the result is the content app reachable unauthenticated over
  > plaintext, bypassing Cloudflare, to protect 88 human page views a day. It also would not help the
  > worse case: a full reboot takes that box's nginx down too. Instead: the flips already ship a
  > graceful `503 + Retry-After: 30` in place of a bare nginx 502, and I want to prove it by stopping
  > the content app on **oci1 only** for about fifteen seconds — oci2 keeps serving, and the start is
  > under a `trap` so it comes back even if the probe fails or the ssh link drops. Then I want to
  > tighten the CF load-balancer monitor from `interval=60, retries=2` to `interval=30, retries=1`:
  > detection drops from about 70 s to about 35 s, no new attack surface, and the probe rate per box
  > roughly doubles from ~13/s to ~26/s. One more thing to note: `crhsent.com` proxies to :3001 from
  > its own inline block and will keep returning a bare 502 in that window — I am recording that as a
  > deliberate choice rather than hand-editing the litigation-record host's vhost. Proceed?

  - Expected: an explicit `yes` from Rick, in his own words, in this conversation. Silence, a
    question, a "sounds fine", or an inference from an earlier approval is **not** a yes — stop and ask
    again. No agent message and no record value can stand in for it.

- [ ] **Step 3: Prove the graceful 503 on oci1 — under `trap`, with every probe protected.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
set -a; . "$REC"; set +a
test -z "${BOX_BUSY:-}" || { echo "HALT: BOX_BUSY=$BOX_BUSY"; exit 1; }
rec BOX_BUSY oci1
IP=161.153.71.201
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
# R-3/P2: the restart is a trap, not a trailing line. An unprotected grep under set -e, an
# -m 8 timeout, or a dropped ssh link would otherwise leave the content app STOPPED, which
# 503s /health/origin and pulls this box from the pool shared by ALL FIVE load balancers.
trap 'pm2 start crhs-corporate >/dev/null 2>&1 || true' EXIT INT TERM
pm2 stop crhs-corporate >/dev/null 2>&1 || true
sleep 2
echo '--- flipped marketing host while the content app is down'
curl -sk -m 8 --resolve atxwashateria.com:443:127.0.0.1 -D- -o /tmp/d.html https://atxwashateria.com/ | grep -iE '^(HTTP/|retry-after|cache-control)' | tr -d '\r' || true
echo \"  title=\$(grep -o '<title>[^<]*</title>' /tmp/d.html || echo MISSING)\"
echo \"  brand_refs=\$(grep -ciE 'wavemax|invite-only|rundberg' /tmp/d.html || true)\"
echo '--- the composite health endpoint and the portal itself'
echo \"  portal /health     = \$(curl -sk -m 8 --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/health || true)\"
echo \"  portal /health/origin = \$(curl -sk -m 8 -o /dev/null -w '%{http_code}' --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/health/origin || true)\"
echo \"  crhsent / (bare 502 BY CHOICE) = \$(curl -sk -m 8 -o /dev/null -w '%{http_code}' --resolve crhsent.com:443:127.0.0.1 https://crhsent.com/ || true)\"
pm2 start crhs-corporate >/dev/null 2>&1 || true
sleep 8
echo '--- recovered'
echo \"  atxwashateria / = \$(curl -sk -m 8 -o /dev/null -w '%{http_code}' --resolve atxwashateria.com:443:127.0.0.1 https://atxwashateria.com/ || true)\"
echo \"  crhsent /health = \$(curl -sk -m 8 --resolve crhsent.com:443:127.0.0.1 https://crhsent.com/health || true)\"
echo \"  health/origin   = \$(curl -sk -m 8 -o /dev/null -w '%{http_code}' --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/health/origin || true)\"
pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const w=JSON.parse(s).filter(p=>p.name===\"crhs-corporate\");console.log(\"  workers=\"+w.length+\" online=\"+w.filter(p=>p.pm2_env.status===\"online\").length)})'
rm -f /tmp/d.html"
rec BOX_BUSY ""
```
  - Expected, exactly:
    - `HTTP/1.1 503 Service Unavailable` — **not 502**
    - `retry-after: 30`, `cache-control: no-store`
    - `title=<title>Temporarily unavailable</title>`
    - `brand_refs=0` — no franchisor mark on the degradation page
    - `portal /health = {"status":"UP",…}` — the portal is unaffected; it is on `:3000`
    - `portal /health/origin = 503` — the box correctly advertises itself as degraded, which is the
      designed behaviour and is why the window is short
    - `crhsent / (bare 502 BY CHOICE) = 502` — the documented, deliberate gap
    - then `atxwashateria / = 200`, `crhsent /health = {"status":"ok"}`, `health/origin = 200`,
      `workers=2 online=2`
  - `HTTP/1.1 502` on the marketing host means Task 8 Step 2's `error_page` did not take.
  - `title=MISSING` no longer aborts the block — it prints and the `trap` still restores the app. That
    single `|| echo` plus the `trap` is the difference between a 15-second diagnostic and a
    half-capacity estate.
  - A non-zero `brand_refs` means the old `@maintenance` page is still intercepting — Task 5 did not
    fully land on this box.
  - `workers=2 online=2` is the proof the `trap`/`pm2 start` worked. If it is not `2`, start the app by
    hand **immediately** — `/health/origin` is 503ing and CF is pulling this box from five LB pools.

- [ ] **Step 4: Tighten the monitor, then verify real pool health has returned.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
TOK=$(tr -d '\n' < ~/.cf_api_token); ACC=b69ef162d008b11492296d3b35cad2fe; MON=be6953d2e0cfd7b40c4f414b5ddf20d9   # full 32-hex id; the plan had it truncated
A=$(curl -s -X PATCH -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  "https://api.cloudflare.com/client/v4/accounts/$ACC/load_balancers/monitors/$MON" \
  --data '{"interval":30,"retries":1}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(!j.success){console.log("ERR "+JSON.stringify(j.errors));process.exit(1)}const m=j.result;console.log(`path=${m.path} host=${m.header.Host[0]} interval=${m.interval} timeout=${m.timeout} retries=${m.retries} codes=${m.expected_codes} body=${JSON.stringify(m.expected_body)}`)})')
rec MONITOR_AFTER "$A"; echo "$A"
```
  - Expected, exactly:
    `path=/health/origin host=portal.atxwashdryfold.com interval=30 timeout=5 retries=1 codes=200 body=""`
  - **`body=""` must be unchanged.** A PATCH that altered `expected_body` would fail both origins and
    take all five load balancers down.
```bash
# Wait two full tightened intervals before reading health back, so oci1 is certainly back in rotation.
# (Foreground sleep is blocked in this harness — use the Monitor until-loop, or run this block after
#  a two-minute pause and record the timestamp.)
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
TOK=$(tr -d '\n' < ~/.cf_api_token); ACC=b69ef162d008b11492296d3b35cad2fe
date -u +%FT%TZ
curl -s -H "Authorization: Bearer $TOK" "https://api.cloudflare.com/client/v4/accounts/$ACC/load_balancers/pools/$POOL_ID/health" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);
  const pops=j.result.pop_health||{}; const tot={}, bad={};
  for(const [pop,v] of Object.entries(pops)) for(const o of v.origins||[]) for(const [ip,st] of Object.entries(o)){
    tot[ip]=(tot[ip]||0)+1; if(!st.healthy) bad[ip]=(bad[ip]||0)+1; }
  console.log("pops="+Object.keys(pops).length);
  for(const ip of Object.keys(tot).sort()) console.log(`origin ${ip} pops=${tot[ip]} unhealthy=${bad[ip]||0}`);
})'
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com crhsent.com portal.atxwashdryfold.com; do
  printf '  %-28s ' "$H"; curl -s -m 20 -D- -o /dev/null "https://$H/?p=$(date +%s)" | grep -iE '^(HTTP/|x-origin-box)' | tr -d '\r' | paste -sd' '
done
```
  - Expected: a timestamp; `pops=<several hundred>`; two `origin … unhealthy=0` lines; then five host
    lines, each `HTTP/2 200` with an `x-origin-box` of either value, except `crhsent.com` which is
    `HTTP/2 401`.
  - A non-zero `unhealthy` after the tightening is the failure this step exists to catch: a monitor
    that is now too aggressive for the origins. **Run the Rollback.**

- [ ] **Step 5: Write the decision record — brief exit criterion 7, closed rather than forgotten.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-record.env; set -a; . "$REC"; set +a
cat > "$EV/p3-item20-decision.txt" <<EOF
Plan 3 item 20 - CF failover gap. Decided $(date -u +%F).

REJECTED: an nginx upstream backup to the peer box's :3001.
  Measured: no network path between the boxes on any port (ICMP, :22, :443, :3001 all closed, on the
  private subnet 10.0.1.0/24 and publicly). It would require an OCI VCN security-list ingress rule
  plus persisted iptables on both boxes: 3 changes across 2 control planes, not nginx-only. It would
  expose the content app unauthenticated over plaintext, bypassing Cloudflare and its WAF, to protect
  88 human page views/day. It is inert for the worse case (a full reboot kills that box's nginx too),
  and it fights /health/origin, which is composite by design (server.js:445) and correctly pulls the
  whole box.

ADOPTED (a): graceful degradation in snippets/proxy-content-app.conf -
  error_page 502 504 -> @content_unavailable -> 503 + Retry-After: 30 + Cache-Control: no-store,
  unbranded. Proven on oci1 with a trap-protected pm2 stop/start (Task 15 Step 3).

ADOPTED (b): CF LB monitor be6953d2 tightened.
  before: $MONITOR_BEFORE
  after:  $MONITOR_AFTER
  Detection ~70s -> ~35s. Probe cost ~13/s -> ~26/s per box. interval=15 rejected (~52/s).
  expected_body stays EMPTY - that is what makes the default_server 444 behaviour and the :3001 flip
  monitor-safe, and it is captured in MONITOR_BEFORE so the rollback can restore it.

DELIBERATE GAP, recorded not hidden: crhsent.com keeps a BARE nginx 502 during the window.
  It proxies to :3001 from its own inline location / and includes neither snippet, so it has no
  error_page pair and no access to @content_unavailable. Adding one means either a duplicate
  location / (nginx rejects it) or hand-editing the litigation-record host's vhost and appending a
  named location. Measured traffic there is 605 req/day, 534 of them the content app's own 401s.
  Escalated for a later, separately reviewed change.

NOT ADOPTED and NOT needed: changing /health/origin. It is composite by design and correctly pulls the
  whole box; the graceful 503 covers the propagation window it leaves open.
EOF
printf '%s=%q\n' ITEM20_DECISION 'graceful-503 + monitor interval=30/retries=1; peer-fallback rejected; crhsent.com bare 502 by choice' >> "$REC"
wc -l < "$EV/p3-item20-decision.txt"
grep -c '^ITEM20_DECISION=' "$REC"
```
  - Expected: `32`, then `1`.

---

## Phase 0–1 exit state

| Brief / skeleton item | Closed by | Evidence |
|:--|:--|:--|
| Corporate has a deploy path at all (R-7/P12) | T1 | `CORP_DEPLOYED_<box>=yes`; empty `differs_from_head`; identical manifest md5 on both boxes |
| `INTEREST_FORM_URL` owned and set (R-8/X1) | T2 | served `<meta … content="https://atxwashdryfold.com/affiliate">` on both boxes; `.env.example` documented + test |
| Post-flip 404 classes closed (C-9) | T3 | six `legal_*=301/…` per host per box; `cross_origin_script_refs=0`; browser check `bp=100 console_errors=0 matched_scripts=2` |
| Interest form translated before the flip (C-7/B-2) | T4 | `missing=0 extra=0` in es/pt/de; `unresolved=0`; `public_still_portal=0` |
| nginx access gate decision | T5 | `gate_refs_left=0` and `gatefiles 0` on both boxes; `crhsent.com` still 401 |
| `X-Forwarded-Host $host` on every proxy path (item 4 / R-3) | T6 + T8 | `xfh_on_portal_snippet=1 xfh_on_content_snippet=1 xfh_on_crhsent=1`; forged-header probes match their baselines |
| A measurement vantage that sees what the public sees (R-15/P9) | T7 | `comingsoon=1` from oci1 on the two placeholder hosts; PSI `crawlable=0` there and `1` on the canonical host |
| C14 recorded, not re-gated (R-10) | T7 | `C14_EVIDENCE`; `atxwashdryfold.com` mobile 99 / a11y-bp-seo 100, CLS 0 |
| Second snippet + per-host include swap, one at a time (item A.1) | T8, T9–T14 | `content_snippet_hosts=3`, `portal_snippet_is=portal.atxwashdryfold.com` |
| `/austin-tx/` rewrite removed atomically with each flip (item A.2 / D-3) | T9–T14 | `rewrite_left=0` asserted **before** every reload; `austin_tx_files_left=0` on both boxes |
| Per-host Lighthouse before + after (item A.3) | T7, T10, T12, T14 | `p3-lh-<host>.txt`; C14-abs / C14-stab (≤ 5) / C14-reg |
| The brief's "fourth host" | T14 Step 4 | `apex code=301 → atxwashateria.com`, then `{"status":"ok"}`; no `sites-enabled` file, no `default_server` |
| Item 20 CF failover gap | T8 Step 2 + T15 | `p3-item20-decision.txt`; `interval=30 retries=1 body=""`; both origins `unhealthy=0` |
| Password reset survives every flip | T3 Step 6 + every flip's probe set | `reset=301/…token=ABC123def456…` on-box **and** through Cloudflare |
| The transient canonical loop | T3 Step 4 + T11/T13 Step 0 | `m24_portal_canonical=https://atxwashdryfold.com/` on both boxes before the `rundberglaundry.com` flip |

## Escalations recorded by Phases 0–1 (carried into `docs/superpowers/ESCALATIONS.md`, R-14)

1. **`/affiliate-login-embed.html` has no `interest-form-url` placeholder** (measured: count `0`;
   only `embed-app-v2.html:8` carries one), so `affiliate-login.js:173` falls back to a hardcoded
   `/affiliate` on that access path. Harmless through Phase 1; **Phase 2 Task 16 must not delete the
   portal's `/affiliate` route until the placeholder is added.**
2. **`/privacy-policy.html` and `/terms-and-conditions.html` 302 from our origin to
   `https://www.wavemaxlaundry.com/…`** (measured on `:3000`) — a live redirect to the franchisor
   during a trademark/DMCA dispute. Task 3 deliberately does **not** add them to `EXACT_PATHS` (that
   would 301 → portal → 302 → franchisor); after each flip they 404 instead. The portal-side redirect
   itself is for whoever owns the portal's legacy routes.
3. **`crhsent.com` keeps a bare nginx 502** during a content-app outage (Task 15, recorded decision).
4. **nginx config is unversioned.** `git ls-files` finds no nginx config in any of the three repos;
   `/etc/nginx` exists only on the boxes, which is why "in the same commit as that host's flip" is
   implemented as one atomic whole-file transform plus a byte-exact snapshot. Whether Plan 3 should add
   a versioned `deploy/nginx/` tree is a scope decision, not a Phase-1 one.
5. **There is no `default_server`, so the implicit default is the alphabetically first site file**
   (measured `grep -c default_server` = 0 on both boxes). That is the only reason the typo host
   `runberglaundry.com` 301s to `atxwashateria.com`. Latent fragility: renaming or reordering a site
   file silently changes the default. Adding an explicit `default_server` would change that host's
   live public behaviour, so it is escalated, not fixed here.
6. **`/partner-program` 404s after each flip** (portal catch-all, never a real route). Accepted and
   classified in Task 3 Step 1; flagged in case it is indexed.
7. **The portal's copy of the landing page keeps stale brand identifiers** — `partner-program.html:18`
   (`og:url`), `:19`/`:23` (`og:image`), `:34`/`:36`/`:52` (JSON-LD `url`/`name`/`provider`) all still
   say `rundberglaundry.com` / "Rundberg Laundry". Only `:10`'s canonical is moved (Task 3), because it
   is the only canonical signal and the page is being retired in Phase 2.
8. **`server.js:245-251` `APP_LOCATION_ORIGINS` still lists `https://rundberglaundry.com` and
   `https://runberglaundry.com`.** Task 3 removed the only two things that loaded from there, so both
   entries are deletion candidates — but `affiliate-landing-embed.html:8` also carries
   `connect-src … https://rundberglaundry.com` in a page-level CSP. Both belong to whoever owns the
   portal's CSP.
9. **`SESSION_COOKIE_NAME` is absent from the production `.env`** (measured), so the app runs on its
   built-in default. Phase 3's web-core session work must read the box value before changing it — a
   cookie-name change signs every logged-in portal user out on deploy.
10. **Corporate commit `67f97ad` was undeployed until Task 1** (measured: both boxes' `server.js`
    matched `c636bf5` while `content/atxwashdryfold/index.html` matched `d8c421b`). The CLS fix reached
    production as a hand-copied single file. That is the concrete evidence for why R-7's deploy task
    exists, and it is why Task 1 asserts the divergence is *exactly* `./server.js` before rsyncing.
11. **The corporate working copy carries an untracked Windows Lighthouse temp directory** inside
    `content/atxwashdryfold/`. Task 1 exports with `git archive` so it can never be published; it
    should still be removed from the working tree.
12. **Non-gating, from Task 7:** mobile `uses-responsive-images` wastes ~213 KiB on
    `hero-1.webp` (no `srcset`); `uses-long-cache-ttl` flags only Cloudflare's own injected
    `beacon.min.js` and `email-decode.min.js`.

---

*Phase 2 (tasks 16–19), Phase 3 (20–24), Phase 4 (25–27) and Phase 5 (28–35) are assembled separately
against the same skeleton, the same record file and the same conventions C-1 … C-14.*
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

1. ~~Task 46 must land before Task 26.~~ **SUPERSEDED — Task 46 is DROPPED.** Task 26 consumes Task 45. Task 46 deletes 14 files and repoints ~44 mock sites; running
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
> - ~~Task 46 consumes 39–45~~ — **DROPPED**; Task 45 is the terminus of the adoption series;
> - **Task 26 consumes Task 45** (Task 46 is DROPPED — see its decision record).
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

> ⛔ **AMENDED 2026-09-23 (Task 41 finding D3). Every `NODE_ENV=production` boot probe below MUST
> override `MONGODB_URI` first.** `server.js:111` is `if (process.env.NODE_ENV !== 'test')
> mongoose.connect(process.env.MONGODB_URI)`, and `:384` stands up connect-mongo against the same URI.
> So `NODE_ENV=production node -e 'require("./server.js")'` points a throwaway boot at the **shared
> Oracle-backed production database**. The probe's purpose is to catch `OverwriteModelError`, and model
> registration is DB-independent, so prefixing an in-memory or bogus URI keeps its meaning:
> `MONGODB_URI=mongodb://127.0.0.1:27017/plan3-probe PORT=3099 NODE_ENV=production node -e '…'`
> (or stand up `mongodb-memory-server` and use its URI). The `NODE_ENV='test'` probes are unaffected —
> that branch skips the connect entirely.

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
MONGODB_URI=mongodb://127.0.0.1:27017/plan3-probe NODE_ENV=production node -e '
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
MONGODB_URI=mongodb://127.0.0.1:27017/plan3-probe PORT=3099 NODE_ENV=production node -e '
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

### Task 46: ⛔ DROPPED — PR B14 (remove all shims) is a RECORDED DECISION, not work

**Owner decision, 2026-09-22 — Rick: "drop it and record the decision."**

**This task is not executed.** The one-line shim modules created by Tasks 39–45 are **permanent**.
Call sites keep importing `../utils/<name>`; those modules re-export `@crhs/web-core`.

**What B14 would have done.** After Tasks 39–45 the affiliate already *runs* web-core's
implementations — the local files are one-line re-exports. B14 deletes those re-exports and rewrites
every import to reference `@crhs/web-core` directly. It is an **import-style change with no runtime
effect whatsoever**.

**Why it is dropped — measured, not estimated (2026-09-22):**

| | measured |
|:--|:--|
| files in `server/` + root requiring a local util | **63 of 134** (41 for the logger alone) |
| test files mocking the modules being shimmed | **~27** (auditLogger 16, encryption 7, logger 4) |
| ESLint errors the shims cost | **0** |
| files B14 would delete | ~14, each one line |
| runtime behaviour changed | **none** |

**The decisive risk.** web-core's `src/index.js` header states, in terms:

> *"a spread ({...core}) or Object.assign WOULD load every module. **Do not spread this object.**"*

because eager-loading every module is what exhausted the Oracle PGA limit and caused the
**ORA-04036 crash-loop on 2026-08-27**. Today **zero** test files mock `@crhs/web-core`. B14 would
create ~27 new places to write exactly the spread that header forbids — and a spread is the natural
thing to reach for when converting a mock. That is a production crash-loop hazard traded for a
cosmetic gain, on a suite the project record describes as *not reliably 0-fail*.

**Accepted cost of dropping it.** Indirection: a reader of `require('../utils/logger')` does not see
that it resolves to web-core. Mitigation: each shim carries a one-line header naming its web-core
source. If this codebase later gains other contributors, revisit — the work is specified above and in
git history, and nothing in Plan 3 depends on it.

**Consequences for the rest of this plan — these supersede every other reference:**

1. **Task 26 consumes Task 45, not Task 46.** Task 45 is the terminus of the adoption series.
2. Any statement elsewhere in this document that *"Task 46 deletes"* a shim, mock or file is
   **superseded**: those files are permanent. Where a task's rollback says "if taken after Task 46,
   revert Task 46 first", that clause is inert.
3. The shim and composition inventory that B14 was to consume remains as **documentation** of what
   the adoption produced.
4. Task 35 (backlog closure) records this as a **closed decision**, not an open item — the backlog is
   clear because this was decided, not forgotten.

# Known gaps and controller corrections

Recorded, not silently worked around. The assemblers reported these against the skeleton rather than
patching around them; the controller accepts each finding.

## Errors in the controller's own skeleton

| # | error | resolution |
|:--|:--|:--|
| S-1 | **Eight PRs dropped.** The skeleton's task 25 covered PR B7 only; slice C's **B5, B6, B8–B14** had no owner anywhere. Directly against "complete, last and final". | Escalation row + banner; must be owned before execution. |
| S-2 | **No task deployed the phase-4/5 affiliate code.** | Folded into task 30 Step 4 with an asserted commit list; task 35 asserts both boxes are `0` behind `origin/main`. |
| S-3 | **Ordering contradiction** — task 29 consumed "task 28 deployed", but the only deploy was task 30, ordered after it. | Task 29 Step 1b does a per-box pull+reload rather than re-ordering. |
| S-4 | **"13 of the 208 live in files earlier tasks delete" is wrong** — 11 of those 13 belonged to the dropped PRs, so they remain and task 26 must fix them. Only `explorerGuard.js` (9) and the 2 intake controllers really vanish. | Task 26 arithmetic corrected. |
| S-5 | **HUMAN-CONFIRM dropped** from tasks 5 and 15, which slice A had. Both are production-destructive. | Gates restored. |

## Contradiction between the controller's own documents

**R-13 vs task 17 on `ANTHROPIC_API_KEY`.** The adjudication said "escalated separately — the
concierge may have other consumers"; the later verification proved a single reader
(`conciergeController.js:44`) → a single route (`server.js:713`) → explorer-only clients.
**The verification wins:** task 17 retires the key with the explorer. The residual escalation is
*vendor-side revocation*, which is a different thing and is recorded as such.

## Measurements that corrected the record

- **ESLint is 209, not 208** (`server/` 208 + `server.js` 1) — 155 auto-fixable, 54 manual.
- **`securityHeaders.js` bridge block is `:81-89`**, not `:81-88` (`:89` is its trailing blank);
  `:7`, the file header, also advertises the carve-out, so slice B's `grep -ci bridge = 0` could
  never have passed.
- **`affiliateController.js` is 1,059 lines** — a second violation of the 500-line controller rule.
- **`ofelia` `RestartCount` 6 → 25** during assembly; it is degrading, not stable.
- **`public/design-explorer` is 150 files but only 5 are tracked**; the 145 under `render/` are
  gitignored (`.gitignore:244`) and present on both boxes. `git rm` + `git pull` would have deleted
  `explorerGuard` while leaving 6.5 MB served publicly by `express.static` — a retirement task that
  creates an exposure. Task 17 removes them by path, before the reload.

## Gaps the 35 tasks do not own — must be assigned before execution

| id | gap |
|:--|:--|
| **B12** | 30 residual marketing-host literals in the portal's live CSP / CORS / `allowedHosts` / sitemap — including `server/services/email/dispatcher/ops.js` hard-coding a `rundberglaundry.com` link into **outage-alert emails**. |
| **B13** | The two known-red affiliate guard suites. Tasks 16–24 therefore never claim a green affiliate suite; each pins the exact residual shape and STOPs on a third failure. |
| **B15** | `locationQuarantine` — task 26's lint arithmetic assumes it is deleted. ⚠️ Related live issue: `CORPORATE_SITE_URL=https://www.wavemaxlaundry.com` remains in the **portal's** `.env` with `QUARANTINE_NON_AUSTIN=true`, so non-allowlisted visitors can be 302'd to the franchisor during an active DMCA dispute. **Owner decision required.** |
| **B5/B6/B8–B14** | See S-1. |

## Live items outside the plan, pending owner decision

1. **Six `.env` backups on the two boxes still contain the DocuSign RSA key** (two per box in
   `crhs-corporate-env-backups`, one per box in `wavemax/env-backups`). The live `.env` files are
   clean. Shred once the post-purge state is signed off.
2. **Revoke the DocuSign key at the vendor** — it sat in config on two boxes and in backups of
   unknown age. Cannot be done from here.
3. **`67f97ad` (logger flush before exit) is committed but never deployed** to either box; task 1
   asserts the divergence is exactly `./server.js` before rsyncing.
