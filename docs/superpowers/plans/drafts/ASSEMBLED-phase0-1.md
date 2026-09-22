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
chk target_public "$(ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 "curl -s -o /dev/null -m 20 -w '%{http_code}' 'https://atxwashdryfold.com/affiliate?p=\$(date +%s)'")" 200
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
echo -n '  link target    -> '; curl -s -o /dev/null -m 20 -w '%{http_code}\n' 'https://atxwashdryfold.com/affiliate?p=\$(date +%s)'"
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
    - `crhsent.com         / -> code=401  /health ct -> application/json; charset=utf-8  origin -> 404`
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
TOK=$(tr -d '\n' < ~/.cf_api_token); ACC=b69ef162d008b11492296d3b35cad2fe; MON=be6953d2
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
TOK=$(tr -d '\n' < ~/.cf_api_token); ACC=b69ef162d008b11492296d3b35cad2fe; MON=be6953d2
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
TOK=$(tr -d '\n' < ~/.cf_api_token); ACC=b69ef162d008b11492296d3b35cad2fe; MON=be6953d2
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
