# Plan 3 — Slice A draft: the nginx host flips

**Status:** draft 2026-09-20, for adversarial review. Task numbers `A1…A12`; the controller renumbers.

**Scope this slice owns.** Everything that touches `/etc/nginx` on either box:
1. A second proxy snippet for `:3001` and the per-host include swap (one host, one box at a time).
2. Removal of each host's legacy `/austin-tx/` rewrite, atomically with that host's flip.
3. The per-host Lighthouse gate through Cloudflare, before and after each host.
4. `proxy_set_header X-Forwarded-Host $host;` (R-3 defence in depth) on every proxy path.
5. The nginx access-gate decision (`/etc/nginx/conf.d/wavemax-gate.conf`).
6. The CF failover gap (scope-brief item 20).

Plus, because they are the flips' own preconditions and nothing else in Plan 3 gates on them, slice A
owns the *requirement and the assertion* (not the merge or the deploy) for the three URL classes that
would 404 publicly the moment a host flips — the four legal pages, the portal landing's two
cross-origin scripts, and the canonical that would otherwise loop. See A2.

**Not in this slice** (brief group A items 5–7): `INTEREST_FORM_URL`, the affiliate env sweep
(`BASE_URL` / `LOG_SERVICE_NAME` / `SESSION_COOKIE_NAME`), and the P-11 device checklist. They are
`.env` and app-side work with no nginx surface.

---

## Measured premises (verified 2026-09-20/21 — these override anything in Plan 2)

| # | Fact | How verified |
|:--|:--|:--|
| M1 | oci1 `161.153.71.201` (`X-Origin-Box: oci-phx`), oci2 `144.24.4.202` (`X-Origin-Box: oci-phx-ad1`). `ssh -i ~/.ssh/oci_wavemax ubuntu@<ip>`. pm2 4/4 online (2× `wavemax`, 2× `crhs-corporate`). | `pm2 list`, `cat conf.d/zz-origin-box.conf` |
| M2 | `snippets/proxy-node-app.conf` holds `location / { proxy_pass http://localhost:3000; … }` and is included by exactly four sites: `atxwashateria.com`, `atxwashdryfold.com`, `portal.atxwashdryfold.com`, `rundberglaundry.com`. **The portal must stay on :3000.** | `cat -n`, `grep -l` |
| M3 | sites-enabled: `atxwashateria.com`, `atxwashdryfold.com`, `crhsent.com`, `portal.atxwashdryfold.com`, `rundberglaundry.com`. No `runberglaundry.com` file, no `default_server`, no `upstream` block anywhere. nginx 1.18.0 (Ubuntu). | `ls`, `nginx -T \| grep` |
| M4 | The rewrite is inside an **exact-match** `location = /` block, at line 59–61 of each of the three marketing files: `location = / { rewrite ^ /austin-tx/ last; }` (`atxwashdryfold.com`: `/austin-tx/wash-dry-fold/`). `last` re-enters location matching and lands in the snippet's `location /`. | `cat -n`, both boxes |
| M5 | `crhsent.com` proxies to `http://localhost:3001` in its own inline `location /` and does **not** include the shared snippet, has **no** `$access_allowed` check and **no** maintenance include. | `cat -n` |
| M6 | The three marketing files and `portal.atxwashdryfold.com` each carry `if ($access_allowed = 0) { return 503; }` plus `include snippets/cloudflare-real-ip.conf` and `include snippets/wavemax-maintenance.conf`. | `cat -n` |
| M7 | **The nginx access gate is provably inert.** `geo $allowed { default 1; … }` always yields `1`; `map "$allowed:$public_path" $access_allowed { "0:0" 0; default 1; }` can therefore never yield `0`. `$public_path` and the `@maintenance` 503 page are unreachable code. | `cat -n conf.d/wavemax-gate.conf` |
| M8 | `/austin-tx/` → **404 on :3001**, 200 on :3000. `/partner-program` → **404 on :3001**, 200 on :3000. Both :3000 200s are the `partnerLanding` catch-all, not real routes. | on-box `curl -H "Host: …"` |
| M9 | **`/health` is a clean public app discriminator.** Portal (`:3000`) on a marketing host answers `content-type: text/html` (the `partnerLanding` catch-all swallows every non-exempt GET). Content app (`:3001`) answers `content-type: application/json` + body exactly `{"status":"ok"}`. Portal `/health` on the portal host answers `{"status":"UP",…}`. | on-box `curl --resolve <h>:443:127.0.0.1`, and public |
| M10 | **The origin `:443` is reachable only from Cloudflare IP ranges.** `curl --resolve <host>:443:<box-ip>` from the workstation returns nothing; oci2 → oci1 `:443` is CLOSED. Per-box public verification by direct origin connection is **impossible**. Use (a) on-box `curl --resolve <host>:443:127.0.0.1`, and (b) through CF grouped by the `X-Origin-Box` response header. | `curl --resolve` from WSL and from oci2 |
| M11 | **There is no network path of any kind between the boxes.** Both sit on the regional subnet `10.0.1.0/24` (oci1 `10.0.1.54`, oci2 `10.0.1.19`), yet from oci2: ICMP to `10.0.1.54` 100% loss; TCP `10.0.1.54:22`, `:443`, `:3001` all closed; TCP `161.153.71.201:443`, `:3001` closed. Per-box iptables REJECTs everything but 22/443/ICMP, and the VCN security list blocks the rest. | `ping`, `/dev/tcp`, `iptables -S` |
| M12 | The CF LB is **one** pool (`wavemax-oci`, origins oci1 + oci2) with **one** monitor (`be6953d2`: `https`, `path=/health/origin`, `Host: portal.atxwashdryfold.com`, `interval=60`, `timeout=5`, `retries=2`, `expected_codes=200`, `expected_body` empty). Five LBs share it: `atxwashateria.com`, `atxwashdryfold.com`, `portal.atxwashdryfold.com`, `rundberglaundry.com`, `crhsent.com`. | CF API `/load_balancers/{monitors,pools}`, per-zone `/load_balancers` |
| M13 | `/health/origin` is served by the **portal** on `:3000` (`server.js:445`). It probes `CONTENT_HEALTH_URL` (default `http://127.0.0.1:3001/health`, 1 s timeout) and returns **503** when the content app is down, deliberately pulling the whole box from the pool. | `sed -n 435,470p server.js` |
| M14 | **Public traffic, full day 2026-09-20, oci1 access logs.** `atxwashateria.com` 759 req / 58 IPs / 39 hits on `/`; `rundberglaundry.com` 345 / 43 / 23; `atxwashdryfold.com` 176 / 39 / 26; `crhsent.com` 605 / 88 (534 of them `401` from the app's accessGate). Most of atxwashateria's volume is vulnerability scanning (`/wp-admin/install.php`, `/.env`, `/.git/config`). | `awk` over `*.access.log.1` |
| M15 | **`atxwashateria.com` and `rundberglaundry.com` serve the `noindex` "Coming soon" placeholder to every public IP** (637 B gzipped, 1134 B raw, `<title>Coming soon</title>`). `atxwashdryfold.com` serves the real partner page (5740 B gzipped, 25585 B raw) — it is in `partnerLanding.PARTNER_PUBLIC_HOSTS`; the other two are not. | `awk '$7=="/" {print $1,$9,$10}'` over the logs; `partnerLanding.js:31-32` |
| M16 | `atxwashdryfold.com` gets live `/embed-app-v2.html` traffic (9 hits/day, all 200 from the portal). The content app 301s that path. | access log; on-box probe |
| M17 | The content app's `accessGate` 401 applies to `crhsent.com` only. `Host: atxwashateria.com` → `:3001/` returns 200 / 27477 B. A flip will not 401 the marketing hosts. | on-box `curl -H "Host: …" :3001/` |
| M18 | All three marketing hosts receive the **same** body from `:3001`, canonical `https://atxwashdryfold.com/`, `<title data-i18n="partner.meta.title">atxwashdryfold — Pickup &amp; Delivery Partner Program</title>`. Canonical is therefore an app discriminator, never a host discriminator. | on-box probes, three hosts |
| M19 | On-box HTTP probes to `:3000` need `-H "X-Forwarded-Proto: https"` (it force-redirects); `:3001` does not. Probes through nginx on `:443` need neither — nginx sets the header. | probed both ways |
| M20 | `nginx -t` on oci1 prints exactly two lines: `nginx: the configuration file /etc/nginx/nginx.conf syntax is ok` / `nginx: configuration file /etc/nginx/nginx.conf test is successful`. `sudo -n` works for `ubuntu`. | `sudo -n nginx -t` |

---

## ⚠️ Corrections to the scope brief — do not inherit these either

### D-A1. The C14 Performance gate is **not met today**. It blocks every host as written.

Measured 2026-09-20 through Cloudflare on the live canonical host `https://atxwashdryfold.com/`,
Lighthouse 12.8.2, headless Chrome, `?lh=<ts>` cache-buster:

| Form factor | Performance | Accessibility | Best Practices | SEO |
|:--|--:|--:|--:|--:|
| desktop | **100** | 100 | 100 | 100 |
| mobile | **83** | 100 | 100 | 100 |

Mobile metrics: LCP 1.8 s, FCP 1.8 s, TBT 30 ms, Speed Index 2.0 s — all good. **The entire 17-point
deficit is CLS 0.322**, a single layout shift:

- shifting node `body > main#main > section.ap-band > div.ap-grain`
- Lighthouse `layout-shifts` sub-item cause: **`Web font loaded` — `/assets/fonts/big-shoulders-display-latin.woff2`**
- The page preloads `anton-latin.woff2` but **not** `big-shoulders-display-latin.woff2`.

So `C14: ≥95 mobile and desktop` is a **content defect, not a network limit**, and it is fixable
(preload the second face, and/or `font-display: optional` with `size-adjust` metric overrides).
**That fix lives in the `crhs-corporate` repo, not in nginx — it is outside slice A.** It is a HARD
PREREQUISITE for the first flip. Task A1 measures it and STOPs; the controller must route the CLS fix
to the content slice and re-run A1 before A5 may start.

Also recorded, non-gating: `uses-responsive-images` wastes 213 KiB on mobile
(`/assets/images/locations/austin-tx/hero-1.webp`, no `srcset`); `uses-long-cache-ttl` flags
Cloudflare's own injected `static.cloudflareinsights.com/beacon.min.js` and
`/cdn-cgi/scripts/…/email-decode.min.js` — both CF-injected, not ours.

### D-A2. `atxwashateria.com` is **not** "the lowest-traffic host with real content".

Measured (M14, M15): it is the **highest**-request host of the three (759 vs 345 vs 176) and it has
**no real content** — it serves the `noindex` "Coming soon" placeholder to every public IP. The
brief's *conclusion* (flip it first) is right; its *stated reason* is wrong. The real reason is in
the A5 justification below.

### D-A3. "Per-host spread > 3 points" is ambiguous, and a before/after comparison is meaningless on two of the three hosts.

On `atxwashateria.com` and `rundberglaundry.com` the "before" page is a 1.1 KB `noindex` placeholder
and the "after" page is a 27 KB indexable content page. Comparing their Performance scores is
nonsense (the placeholder will score *higher*), and the placeholder's SEO can never be 100 because
`noindex` fails `is-crawlable`. This slice therefore **defines** the gate as three parts:

- **C14-abs (all hosts):** after the flip, all four categories **≥ 95** on mobile and desktop.
- **C14-stab (all hosts):** across **3 repeated** after-flip runs per (host, form factor), the
  Performance spread (max − min) must be **≤ 3**. Spread > 3 → re-measure once; still > 3 → **block
  that host** (the measurement cannot support C14-abs).
- **C14-reg (`atxwashdryfold.com` only):** no category may drop below its before-flip value. The
  before-flip numbers for the two placeholder hosts are recorded as **evidence of what the public
  saw**, never as a threshold.

### D-A4. "In the same commit" has no repository. nginx config is **unversioned**.

`git ls-files` finds no nginx config in any of the three repos; `/etc/nginx` exists only on the
boxes. The brief's "removed … IN THE SAME COMMIT as that host's flip" is unimplementable as written.
This slice substitutes the property the brief is actually reaching for — **the include swap and the
rewrite removal can never be separated** — by making each host's edit a single atomic whole-file
write (`cat > … <<'NGINX'`) that contains both changes, preceded by a byte-exact `.bak.<TS>`
snapshot on the box and `md5sum` recorded before and after. **Escalation for the controller:**
whether Plan 3 should also add a versioned `deploy/nginx/` tree (it would serve the "clean
deployment" exit criterion) is a scope decision, not a slice-A decision.

### D-A5. The item-20 fix is **not** "same file and reload as the flips", and the peer-fallback is not implementable in nginx alone.

M11: there is **no network path between the boxes on any port**. An nginx `upstream … backup`
pointing at the peer's `:3001` would require, before any nginx change:
1. an OCI VCN security-list / NSG ingress rule (peer private `/32` → TCP 3001), and
2. an `iptables -I INPUT -s <peer>/32 -p tcp --dport 3001 -j ACCEPT` on both boxes, persisted.

That is three changes across two control planes. **Slice A recommends NOT doing it** — see A12 for
the full cost/benefit and the alternative that *is* nginx-only. Note also that the fallback would
only ever help the `:3001`-only case: in a full box reboot (~10–20 s of public 502 on crhsent.com
and the portal, measured) the box's nginx is down too, so an nginx-level fallback does nothing.

### D-A6. There is no `default_server`, so the **alphabetically first** server block is the implicit default.

`sites-enabled/atxwashateria.com`'s first `listen 443 ssl` block is the `www.atxwashateria.com`
→ apex 301. That is the whole reason the typo host `runberglaundry.com` publicly 301s to
`https://atxwashateria.com/` — it is an artefact of **file naming**, which confirms D-2 (nothing to
flip) and is a latent fragility: renaming or reordering a site file silently changes the default.
Escalated, not fixed here (adding an explicit `default_server` would change the typo host's public
behaviour, and its CF zone `ef0cdde7…` is live).

### D-A8. The cross-slice "password reset is a cutover blocker" finding is **measurably wrong**.

Slice E reported that `passwordResetService.js:86` + `FRONTEND_URL=https://rundberglaundry.com`
breaks password reset when that host flips, and asked slice A to assert that slice E's `BASE_URL`
migration is deployed before touching nginx. Both halves of the premise are true; the conclusion is
not. `/embed-app-v2.html` **is** in `legacyPortalRedirects.EXACT_PATHS`, and the redirect is
`res.redirect(301, PORTAL_ORIGIN + req.originalUrl)` — `req.originalUrl` carries the query string.
Measured on oci1 (M23): the token arrives at the portal byte-identical and the portal serves 200.

So slice A does **not** gate on slice E's E2. Gating on an env var would also have been the weaker
test: it would pass while `/embed-app-v2.html` was being removed from `EXACT_PATHS` by slice B's
bridge deletion, which is the way this actually breaks. A2 Step 4 and every flip task instead assert
the **end-to-end token-preserving 301**, which catches both failure modes. E2 remains worth doing —
it removes a redirect hop and stops emailing a marketing domain — as an improvement, not a blocker.

### D-A9. The scope brief's `securityHeaders.js` line range is wrong.

The iframe-bridge carve-out is web-core `securityHeaders.js:81-88`, not `:83-88` — `:81-83` are its
comment. Slice A only references it once (in M23's note on the latent `EXACT_PATHS` dependency) and
uses the corrected range.

### D-A7. The access-gate decision: **delete it, and delete it FIRST.**

The brief offers "prune or delete". Slice A decides **delete** (task A3), before any flip:

- It is provably inert (M7) — pruning a dead allowlist produces a config that is still dead, only
  tidier, and leaves a re-armable gate whose next operator could 503 the production portal with a
  stale IP list.
- The unreachable `@maintenance` 503 body reads *"WaveMAX is in invite-only mode"* and
  `<title>WaveMAX — Restricted</title>` — franchisor brand text sitting on our public origin during
  a live trademark/DMCA dispute. Deleting it closes that too.
- **Ordering reason (load-bearing):** the maintenance snippet installs `error_page 503 = @maintenance;`
  at server level. A12's graceful-degradation handler returns **503**, and would be re-intercepted
  into the franchisor-branded page. Deleting the gate first removes the collision instead of working
  around it.
- Live access control is unaffected: it is the content app's `accessGate` (M14: 534 × 401/day on
  crhsent.com) and the portal's own auth, neither of which reads nginx state.
- Deletion must be **atomic across all five referencing files** — an orphan `$access_allowed`
  reference makes `nginx -t` fail with `unknown "access_allowed" variable`, which is the built-in
  safety net.

---

## Slice A conventions

**Host order (one host at a time, both boxes, verify, then the next host):**
`atxwashateria.com` → `rundberglaundry.com` → `atxwashdryfold.com`. Justification in A5/A7/A9.
`runberglaundry.com` is not a candidate (D-2, M3, D-A6).

**Box order within a host:** oci1 first, then oci2. A host is publicly inconsistent between the two
box flips (CF round-robins the shared pool, M12), so the oci1→oci2 window is **minutes, not hours**:
the second box task starts immediately after the first box's verify passes. A host is never left
half-flipped across a break.

**Every nginx change, without exception:**
1. `md5sum` the target file(s) and `cp -p` a `.<TS>` snapshot;
2. apply the edit with one of the three **committed transform scripts** below, never an ad-hoc
   inline regex;
3. assert the **line-count delta** and the **brace balance**, not only a `grep -c`;
4. `sudo nginx -t` — **before** any reload; a non-clean result is a STOP, roll back;
5. `sudo systemctl reload nginx` — **never** `restart`;
6. verify on-box through nginx `:443` loopback, then publicly through CF.

**Why step 3 is mandatory — this bit the draft itself.** The first version of the flip transform used
`s{…\# Default route .*\n…}{…}s`. With `/s`, `.*` crossed newlines and greedily swallowed **59
lines** — every `listen 80`, `www` and ACME server block — while still producing
`rewrite_left=0`, `portal_snippet_left=0`, `content_snippet=1`. Every grep-based assertion passed on
a destroyed file. A line-count delta and a brace count catch it instantly; a `grep -c` never will.

**The three transform scripts.** Each is created on the box from a **quoted** heredoc (`<<'PERL'`),
so nothing interpolates, and each is **idempotent** — re-running it on an already-edited file is a
byte-for-byte no-op. All three were dry-run against the live config of every affected file
(2026-09-20) with the results recorded in the task that creates them.

| script | created in | applies to | verified effect |
|:--|:--|:--|:--|
| `~/plan3-remove-access-gate.pl` | A3 | the 4 gated vhosts | −4 non-blank lines each (127 → 122); braces 13/13 → 12/12; byte no-op on `crhsent.com` |
| `~/plan3-flip-to-content-app.pl` | A4 | one marketing vhost | 122 → 111 lines; `austin-tx`, `proxy-node-app` and `gated` all → 0; braces 12/12 → 11/11; 5 server blocks, 6 Mailcow lines and the ACME block intact |
| `~/plan3-add-xfh.pl` | A11 | portal snippet + `crhsent.com` | +1 line each; never touches a Mailcow `:8443` block |

**Per-host, per-box verification.** Every flip task runs `bash ~/plan3-verify-host.sh <host>` (A4
Step 4) on the box immediately before and immediately after its reload, and compares against the
PRE-FLIP / POST-FLIP profiles recorded there. The inline probes each task also carries are
belt-and-braces, not a substitute. The script covers the app discriminator, the `/austin-tx/` removal,
the canonical, the four legal paths (M21), the token-preserving reset 301 (M23), `robots.txt`,
`sitemap.xml`, and the portal + crhsent.com regression guards.

**Per-box discriminator (M9, M10)** — on-box, through the box's own nginx:
```
curl -sk --resolve <host>:443:127.0.0.1 -D- -o /tmp/b.txt "https://<host>/health"
```
| probe | before flip (portal :3000) | after flip (content :3001) |
|:--|:--|:--|
| `/health` content-type | `text/html; charset=utf-8` | `application/json; charset=utf-8` |
| `/health` body | HTML | `{"status":"ok"}` |
| `/` size / marker | `1134` / `<title>Coming soon</title>` (`atxwashdryfold.com`: `25585`) | `27477` / `data-i18n="partner.meta.title"` |
| `/austin-tx/` | `200` | `404` |
| portal `/health` (regression guard) | `{"status":"UP"` | `{"status":"UP"` — unchanged |

**Through-CF per-box attribution:** group responses by the `X-Origin-Box` header —
`oci-phx` = oci1, `oci-phx-ad1` = oci2 (M1).

**Record file:** `/var/www/wavemax/cutover-logs/plan3-sliceA-record.env` on the workstation, Plan 2
convention: `printf '%s=%q\n' "KEY_<box>" "$value"`, sourced with `set -a; . "$REC"; set +a`, keyed
values read by indirection (`V=TS_$BOX; TS=${!V}`).

**Evidence:** `/var/www/wavemax/cutover-logs/` (outside every repo). Only PASS/FAIL lines and
Lighthouse category scores are ever committed.

---

### Task A1: C14 feasibility pre-flight through Cloudflare — **HARD GATE, no box changes**

**Files:**
- Creates `/var/www/wavemax/cutover-logs/plan3-sliceA-record.env`.
- Creates 12 JSON reports `/var/www/wavemax/cutover-logs/lighthouse/p3-pre-<host>-<mobile|desktop>-<n>-<YYYY-MM-DD>.json` (3 hosts × 2 form factors × … see Step 2; the 3 repeats are mobile-only).
- Creates `/var/www/wavemax/cutover-logs/p3-c14-preflight.txt`.

**Interfaces:**
- Consumes: the committed baseline table in `docs/development/LIGHTHOUSE-QUALITY-BAR.md`
  §"Content origin baseline (2026-09)" (A11y/BP/SEO = 100 on all four hosts, Performance
  informational); the C14 definition as restated in D-A3.
- Produces: `C14_FEASIBLE`, `LH_DATE`, and per-host `PRE_<host>_<ff>_<cat>` scores in the record;
  `p3-c14-preflight.txt` with one `PASS`/`FAIL` line per run.
- **Nothing on a box changes.** Every request is a normal public GET through Cloudflare.
- **This task is the slice's gate.** If mobile Performance < 95 on any host, A3 may still run
  (it is a pure dead-config deletion), but **A5 may not start** until the content-app CLS fix has
  landed and A1 has been re-run green.

- [ ] **Step 0: Create the record and the evidence directory.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; OUT=$EV/lighthouse
mkdir -p "$OUT"; touch "$REC"; chmod 600 "$REC"
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
D=$(date -u +%F); rec LH_DATE "$D"; echo "date=$D rec=$REC"
which google-chrome >/dev/null && npx --yes lighthouse --version
```
  - Expected: `date=<YYYY-MM-DD> rec=/var/www/wavemax/cutover-logs/plan3-sliceA-record.env`, then
    `/usr/bin/google-chrome` resolves and a Lighthouse version `12.x` prints.

- [ ] **Step 1: Confirm the public "before" state of all three hosts (M15) before measuring it.**
```bash
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com; do
  printf '%-22s ' "$H"
  curl -s -m 20 -o /tmp/p3pre.html -w 'code=%{http_code} len=%{size_download} ' "https://$H/?lh=$(date +%s)"
  printf 'comingsoon=%s partner=%s\n' \
    "$(grep -c '<title>Coming soon</title>' /tmp/p3pre.html)" \
    "$(grep -c 'data-i18n="partner.meta.title"' /tmp/p3pre.html)"
done
```
  - Expected, exactly:
    - `atxwashateria.com      code=200 len=1134 comingsoon=1 partner=0`
    - `rundberglaundry.com    code=200 len=1134 comingsoon=1 partner=0`
    - `atxwashdryfold.com     code=200 len=25585 comingsoon=0 partner=1`
  - Any other combination means M15 has drifted — STOP and re-establish the premises. In particular
    a `partner=1` on one of the first two hosts means the preview allowlist now matches the runner's
    egress IP, so the "before" measurement would not be what the public sees.

- [ ] **Step 2: Measure. Desktop ×1 and mobile ×3 per host (mobile is the gate and the noisy one).**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; set -a; . "$REC"; set +a; OUT=$EV/lighthouse
FLAGS='--headless=new --no-sandbox --disable-dev-shm-usage'
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com; do
  CHROME_PATH=/opt/google/chrome/chrome npx --yes lighthouse "https://$H/?lh=$(date +%s)" \
    --preset=desktop --output=json --output-path="$OUT/p3-pre-$H-desktop-1-$LH_DATE.json" \
    --chrome-flags="$FLAGS" --quiet
  for N in 1 2 3; do
    CHROME_PATH=/opt/google/chrome/chrome npx --yes lighthouse "https://$H/?lh=$(date +%s)" \
      --form-factor=mobile --screenEmulation.mobile=true --output=json \
      --output-path="$OUT/p3-pre-$H-mobile-$N-$LH_DATE.json" --chrome-flags="$FLAGS" --quiet
  done
done
ls "$OUT" | grep -c "^p3-pre-.*-$LH_DATE\.json$"
```
  - Expected: `12`.

- [ ] **Step 3: Apply C14-abs and C14-stab to the "before" numbers and record the verdict.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; set -a; . "$REC"; set +a; OUT=$EV/lighthouse
node -e '
const fs=require("fs"),dir=process.argv[1],d=process.argv[2];
const hosts=["atxwashateria.com","rundberglaundry.com","atxwashdryfold.com"];
const cats=["performance","accessibility","best-practices","seo"];
let fail=0;
for(const h of hosts) for(const ff of ["desktop","mobile"]){
  const ns=ff==="desktop"?[1]:[1,2,3], perf=[];
  for(const n of ns){
    const f=`${dir}/p3-pre-${h}-${ff}-${n}-${d}.json`;
    const c=JSON.parse(fs.readFileSync(f,"utf8")).categories;
    const s=Object.fromEntries(cats.map(k=>[k,Math.round(c[k].score*100)]));
    perf.push(s.performance);
    const ok=cats.every(k=>s[k]>=95); if(!ok)fail++;
    console.log(`${ok?"PASS":"FAIL"} ${h} ${ff} run${n} `+cats.map(k=>k+"="+s[k]).join(" "));
  }
  const spread=Math.max(...perf)-Math.min(...perf);
  console.log(`SPREAD ${h} ${ff} perf=${perf.join(",")} spread=${spread} ${spread<=3?"OK":"TOO_NOISY"}`);
  if(spread>3)fail++;
}
console.log("C14_PREFLIGHT "+(fail?"FAIL fails="+fail:"PASS"));
process.exit(fail?1:0)' "$OUT" "$LH_DATE" | tee "$EV/p3-c14-preflight.txt"
V=${PIPESTATUS[0]}; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
rec C14_FEASIBLE "$([ "$V" = 0 ] && echo yes || echo no)"; echo "exit=$V"
```
  - Expected if the CLS fix has landed: 18 `PASS` lines, 6 `SPREAD … OK` lines,
    `C14_PREFLIGHT PASS`, `exit=0`.
  - Expected **today** (2026-09-20, measured): every `mobile` line is
    `FAIL … performance=83 accessibility=100 best-practices=100 seo=100`, every `desktop` line is
    `PASS … performance=100 …`, and `C14_PREFLIGHT FAIL`, `exit=1`.
  - On `exit=1`: **STOP.** Record `C14_FEASIBLE=no` and hand the controller the diagnosis from
    Step 4. A3 and A4 may proceed (neither changes what any host serves); A5 may not.

- [ ] **Step 4: Name the blocking audits precisely, so the fix is routed to the right slice rather than guessed at.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; set -a; . "$REC"; set +a; OUT=$EV/lighthouse
node -e '
const j=require(process.argv[1]); const a=j.audits;
console.log("metrics LCP="+a["largest-contentful-paint"].displayValue+" FCP="+a["first-contentful-paint"].displayValue
  +" TBT="+a["total-blocking-time"].displayValue+" CLS="+a["cumulative-layout-shift"].displayValue
  +" SI="+a["speed-index"].displayValue);
for(const it of (a["layout-shifts"].details.items||[]))
  console.log("shift score="+it.score.toFixed(3)+" node="+it.node.selector
    +" causes="+((it.subItems&&it.subItems.items)||[]).map(s=>s.cause+":"+(s.extra&&s.extra.value||"")).join("; "));
' "$OUT/p3-pre-atxwashdryfold.com-mobile-1-$LH_DATE.json"
```
  - Expected today, measured: `metrics LCP=1.8 s FCP=1.8 s TBT=30 ms CLS=0.322 SI=2.0 s`, then
    `shift score=0.322 node=body > main#main > section.ap-band > div.ap-grain causes=Web font loaded:https://atxwashdryfold.com/assets/fonts/big-shoulders-display-latin.woff2`.
  - Hand-off, verbatim, to the controller: *the C14 mobile gate is blocked by one CLS of 0.322
    caused by `big-shoulders-display-latin.woff2` loading unpreloaded; the content page preloads
    `anton-latin.woff2` only. Fix in `crhs-corporate` (`content/atxwashdryfold/index.html` preload +
    `assets/css/partner-program.css` `font-display`/`size-adjust`), re-run A1, then start A5.*

**Rollback (exact).** Nothing on a box changed; this task only read public pages and wrote local
evidence. To discard it:
```bash
EV=/var/www/wavemax/cutover-logs
rm -f "$EV"/lighthouse/p3-pre-*.json "$EV/p3-c14-preflight.txt" "$EV/plan3-sliceA-record.env"
ls "$EV"/lighthouse/p3-pre-* 2>/dev/null | wc -l
```
- Rollback expected: `0`.

---

### Task A2: Close the three post-flip 404 classes — **cross-repo prerequisite, HARD GATE, no box changes**

Three classes of URL are served by the portal today and **404 on the content app**. Each would break
publicly the moment its host flips. All three were measured 2026-09-20 with `Host: rundberglaundry.com`
against both ports on oci1:

| path | `:3001` | `:3000` | affects | decided fix |
|:--|--:|--:|:--|:--|
| `/privacy-policy` | **404** | 200 | all 3 hosts | add to `legacyPortalRedirects.EXACT_PATHS` |
| `/terms-and-conditions` | **404** | 200 | all 3 hosts | same |
| `/terms-of-service` | **404** | 200 | all 3 hosts | same |
| `/refund-policy` | **404** | 200 | all 3 hosts | same |
| `/assets/js/embed-navigation.js` | **404** | 200 | the **portal's own** landing page | self-host in the portal |
| `/assets/js/revenue-calculator.js` | **404** | 200 | same | self-host in the portal |
| `/embed-app-v2.html?…&token=…` | 301 ✅ | 200 | password reset | **already works — assert, do not "fix"** |
| `<link rel="canonical">` on `/` | `atxwashdryfold.com` | `rundberglaundry.com` | a transient canonical **loop** | move the portal copy's canonical |

**M21 — the legal pages.** `server.js:984-990` serves all four through `serveLegalWithNonce`; none is
in `legacyPortalRedirects.EXACT_PATHS` (which today holds only `/embed-app-v2.html`, `/admin`,
`/admin/`, `/operator`, `/operator/`, `/operator-scan-embed.html`, `/scanbag`, `/scanbag/`,
`/scanbag-manifest.json`, `/scanbag-sw.js`, `/monitoring-dashboard.html`, plus the prefix
`/api/v1/customers/verify-email/`). A 301 is the right answer rather than duplicating the documents
into the content app: one canonical legal text, one place to update. **But** `privacy-policy.html:10`
and `terms-and-conditions.html:10` set `<link rel="canonical" href="https://rundberglaundry.com/…">`
— pointing at the URL that will 301 away. Redirecting without moving the canonical creates an SEO
loop, so both canonicals move to `https://portal.atxwashdryfold.com/…` **in the same commit**.

**M22 — the portal's landing page loads two scripts cross-origin from a host that flips.**
`public/embed-landing.html:314` and `:317` load
`https://rundberglaundry.com/assets/js/embed-navigation.js` and `…/revenue-calculator.js?v=20260826b`.
Both files already exist in the portal's own tree (`public/assets/js/`, 11154 B and 2893 B) and are
served 200 from `:3000`, so the fix is to make the two `src` attributes **relative** — which removes
a cross-origin dependency instead of relocating it, and lets `server.js:245-251`'s
`APP_LOCATION_ORIGINS` entry for `https://rundberglaundry.com` be re-examined. The failure mode is a
**missing script, not an HTTP error**, so `curl` cannot detect it — Step 5 verifies in a real browser.

**M23 — password reset is NOT broken by the flip; the cross-slice report's mechanism is wrong.**
`passwordResetService.js:86` builds the link from `FRONTEND_URL`, and `FRONTEND_URL=https://rundberglaundry.com`
on both boxes (verified). But `/embed-app-v2.html` **is** in `EXACT_PATHS`, and the B7 redirect is
`res.redirect(301, PORTAL_ORIGIN + req.originalUrl)` — `req.originalUrl` carries the query string.
Measured on oci1:

```
curl -H "Host: rundberglaundry.com" \
  "http://127.0.0.1:3001/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate"
→ 301  Location: https://portal.atxwashdryfold.com/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate
```

and the portal serves that 200. The token survives byte-for-byte, exactly as the comment at
`passwordResetService.js:80-85` claims. **So this is not a cutover blocker.** What it *is* is a
latent dependency: password reset works only while `/embed-app-v2.html` stays in `EXACT_PATHS`, and
slice B is deleting the iframe bridge (web-core `securityHeaders.js:81-88` and the `assets/js/`
bridges). Asserting the env var would not catch that; asserting the **end-to-end token-preserving
301** does. Step 4 asserts it, and every flip task re-asserts it per host after the flip.

**M24 — the flip creates a transient canonical loop unless one portal line moves first.** Measured
2026-09-20, `<link rel="canonical">` on `/`:

| host | served by `:3000` today | served by `:3001` after the flip |
|:--|:--|:--|
| `atxwashateria.com` | *none* (the `noindex` placeholder has no canonical) | `https://atxwashdryfold.com/` |
| `rundberglaundry.com` | *none* (same) | `https://atxwashdryfold.com/` |
| `atxwashdryfold.com` | **`https://rundberglaundry.com/`** | `https://atxwashdryfold.com/` |

So once `rundberglaundry.com` flips while `atxwashdryfold.com` has not, the two point at each other —
`rundberglaundry.com → atxwashdryfold.com → rundberglaundry.com` — a true A→B→A canonical loop on the
only host with indexed equity. Google discards looping canonicals and picks a host itself, which is
exactly the outcome the D1 one-canonical-host decision exists to prevent.

The fix is one line, not a reordering: the portal's own copy (`public/partner-program.html:10`) still
carries the pre-rename canonical. Moving it to `https://atxwashdryfold.com/` makes the portal-served
page **self-canonical** and agree with the content app, so no loop and no chain can form **in any flip
order**. Step 3 does it. (The same file's `og:url` `:18`, `og:image` `:19`/`:23` and JSON-LD `url`
`:34`/`:36`/`:52` still say `rundberglaundry.com`; they are not canonical signals and the page is
being retired, so they are listed in the escalations rather than churned here.)

**Files:**
- Modify `crhs-corporate`: `server/middleware/legacyPortalRedirects.js` — 4 entries added to
  `EXACT_PATHS`; plus its unit test.
- Modify `wavemax-affiliate-program`: `public/embed-landing.html:314`, `:317` (absolute → relative);
  `public/privacy-policy.html:10`, `public/terms-and-conditions.html:10` (canonical → portal).
- No file on any box changes. Deployment of both repos is the existing rsync/`pm2 reload` path and is
  **not** owned by this slice.

**Interfaces:**
- Consumes: M8, M21, M22, M23; `legacyPortalRedirects.EXACT_PATHS`; `serveLegalWithNonce`
  (`server.js:983-990`).
- Produces: `PRE404_CLOSED=yes` in the record — a hard precondition of A5, A7 and A9.
- **Slice boundary:** the two commits are app changes, so they are reviewed and deployed by whoever
  owns those repos in Plan 3. Slice A owns the *requirement*, the *inventory* and the *assertion*,
  and refuses to flip until the assertion passes. Nothing here is an nginx change.
- **TDD:** the corporate change lands test-first — a failing test that each legal path 301s on a
  marketing host, then the `EXACT_PATHS` addition.

**Rollback (exact).** Two independent `git revert`s; nothing on a box has changed until each repo is
redeployed, and each revert is safe in either order.
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git revert --no-edit <portal-sha> && git log --oneline -1
cd /var/www/crhs-corporate-src 2>/dev/null || cd ~/GitHub/crhs-corporate
git revert --no-edit <corporate-sha> && git log --oneline -1
```
- Rollback expected: one `Revert "…"` line per repo.
- Reverting A2 after a flip has landed **re-opens the 404s on the flipped hosts** — so if A2 must be
  reverted, roll the flips back first (A5/A7/A9 then A4/A6/A8 in reverse order).

- [ ] **Step 1: Enumerate the authoritative inventory — every path the portal answers on a marketing host that the content app does not.**
      This is the step that makes the list complete rather than anecdotal.
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 '
for P in / /affiliate /privacy-policy /privacy-policy.html /terms-and-conditions /terms-and-conditions.html \
         /terms-of-service /refund-policy /refund-policy.html /partner-program /austin-tx/ \
         /assets/js/embed-navigation.js /assets/js/revenue-calculator.js /assets/js/i18n.js \
         /assets/css/partner-program.css /robots.txt /sitemap.xml /favicon.ico \
         /embed-app-v2.html /admin /operator /scanbag /monitoring-dashboard.html; do
  A=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: rundberglaundry.com" http://127.0.0.1:3001$P)
  B=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: rundberglaundry.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000$P)
  [ "$A" = 404 ] && [ "$B" = 200 ] && M=" <== BREAKS ON FLIP" || M=""
  printf "  %-38s 3001=%s 3000=%s%s\n" "$P" "$A" "$B" "$M"
done'
```
  - Expected: exactly **six** `<== BREAKS ON FLIP` rows — the four legal paths and the two
    `embed-*`/`revenue-*` scripts. `/partner-program` and `/austin-tx/` also read `3001=404 3000=200`
    but are the `partnerLanding` catch-all, never real routes (M8) — they are listed in the
    escalations, not fixed.
  - **Any seventh row is a STOP**: an unaccounted path would 404 publicly on flip. Add it to this
    task before proceeding, do not discover it in A5.

- [ ] **Step 2: Corporate — the failing test first, then the four `EXACT_PATHS` entries.**
```bash
cd ~/GitHub/crhs-corporate   # or wherever the corporate working copy lives
npx jest tests/legacyPortalRedirects.test.js -t 'legal' 2>&1 | tail -20
```
  - Expected **before** the fix: a failing assertion naming `/privacy-policy` (the test expects a
    301 and gets `next()`). Confirm it fails for that reason before writing the implementation.
  - Then add `'/privacy-policy', '/terms-and-conditions', '/terms-of-service', '/refund-policy'` to
    `EXACT_PATHS` and re-run:
```bash
cd ~/GitHub/crhs-corporate && npx jest tests/legacyPortalRedirects.test.js 2>&1 | tail -8
node -e "const s=require('./server/middleware/legacyPortalRedirects').EXACT_PATHS; console.log('size='+s.size+' legal='+['/privacy-policy','/terms-and-conditions','/terms-of-service','/refund-policy'].every(p=>s.has(p)))"
```
  - Expected: the suite green, then `size=15 legal=true` (11 existing entries + 4).

- [ ] **Step 3: Portal — self-host the two scripts and move the two legal canonicals.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
sed -i '314s|https://rundberglaundry.com/assets/js/embed-navigation.js|/assets/js/embed-navigation.js|' public/embed-landing.html
sed -i '317s|https://rundberglaundry.com/assets/js/revenue-calculator.js|/assets/js/revenue-calculator.js|' public/embed-landing.html
sed -i '10s|https://rundberglaundry.com/privacy-policy|https://portal.atxwashdryfold.com/privacy-policy|' public/privacy-policy.html
sed -i '10s|https://rundberglaundry.com/terms-and-conditions|https://portal.atxwashdryfold.com/terms-and-conditions|' public/terms-and-conditions.html
sed -i '10s|<link rel="canonical" href="https://rundberglaundry.com/">|<link rel="canonical" href="https://atxwashdryfold.com/">|' public/partner-program.html
grep -n 'embed-navigation.js\|revenue-calculator.js' public/embed-landing.html
grep -n 'rel="canonical"' public/privacy-policy.html public/terms-and-conditions.html public/partner-program.html
grep -c 'rundberglaundry.com' public/embed-landing.html
ls -la public/assets/js/embed-navigation.js public/assets/js/revenue-calculator.js
```
  - Expected: line `314` reads `<script src="/assets/js/embed-navigation.js"></script>`; line `317`
    reads `<script src="/assets/js/revenue-calculator.js?v=20260826b"></script>`; the two legal
    canonicals now `https://portal.atxwashdryfold.com/…`; `partner-program.html:10` now
    `https://atxwashdryfold.com/` (M24 — this is the line that prevents the canonical loop);
    `grep -c rundberglaundry.com public/embed-landing.html`
    is `3` (down from 5 — the two remaining are the `affiliates@rundberglaundry.com` mailto at `:278`
    and the `/operator` link at `:294`, both of which survive the flip: the mailto is a Mailcow alias
    and `/operator` is already in `EXACT_PATHS`); and both local files exist with the sizes in M22.
  - `partner-program.html:10` is the **portal's** copy of the landing page, served today on
    `atxwashdryfold.com` via `partnerLanding`. The content app has its own copy
    (`content/atxwashdryfold/index.html`) which already says `https://atxwashdryfold.com/` — this
    edit makes the two agree so the canonical never changes value at the flip.
  - The `?v=20260826b` stamp is preserved — the bytes do not change, only the origin, and the old
    absolute URL was served `immutable`.

- [ ] **Step 4: Assert M23 — password reset survives the flip, on both boxes, with a real token shape.**
```bash
for IP in 161.153.71.201 144.24.4.202; do
  printf '%s ' "$IP"
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'curl -s -o /dev/null -w "3001 code=%{http_code} loc=%{redirect_url}\n" -H "Host: rundberglaundry.com" "http://127.0.0.1:3001/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate"'
done
```
  - Expected, both boxes: `3001 code=301 loc=https://portal.atxwashdryfold.com/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate`.
  - The token must appear **byte-identical** in the `Location`. A 404, a dropped query string, or a
    truncated token is a **cutover blocker**: `/embed-app-v2.html` has left `EXACT_PATHS` (most
    likely as part of slice B's bridge deletion) and password reset for affiliates, administrators
    and operators would break on the `rundberglaundry.com` flip. STOP and escalate.
  - Slice E's E2 (`FRONTEND_URL` → `BASE_URL`) makes the reset link point at the portal directly and
    removes the 301 hop. It is a **cosmetic and robustness improvement, not a prerequisite** — this
    assertion passes with or without it. If E2 has landed, re-run this step expecting
    `3001 code=301` still (nothing about the redirect changes) **and** additionally assert
    `grep -c '^FRONTEND_URL=' .env` is `0` on both boxes.

- [ ] **Step 5: Deploy both repos, then verify — including the browser check `curl` cannot do.**
```bash
# Deployment is the existing path and is not owned by this slice; after it:
for IP in 161.153.71.201 144.24.4.202; do
  echo "##### $IP"
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP '
  for P in /privacy-policy /terms-and-conditions /terms-of-service /refund-policy; do
    printf "  %-24s 3001 -> %s %s\n" "$P" \
      "$(curl -s -o /dev/null -w "%{http_code}" -H "Host: rundberglaundry.com" http://127.0.0.1:3001$P)" \
      "$(curl -s -o /dev/null -w "%{redirect_url}" -H "Host: rundberglaundry.com" http://127.0.0.1:3001$P)"
  done
  echo -n "  portal landing cross-origin script refs: "
  curl -s -H "Host: portal.atxwashdryfold.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/embed-landing.html | grep -c "https://rundberglaundry.com/assets/js" || true'
done
```
  - Expected per box: four lines
    `/<path>  3001 -> 301 https://portal.atxwashdryfold.com/<path>`, then
    `portal landing cross-origin script refs: 0`.
```bash
# The browser check — the failure is a missing script, not a status code.
node -e '
const {execSync}=require("child_process");
const out=execSync(`CHROME_PATH=/opt/google/chrome/chrome npx --yes lighthouse "https://portal.atxwashdryfold.com/embed-landing.html?lh=${Date.now()}" --output=json --output-path=stdout --only-categories=best-practices --chrome-flags="--headless=new --no-sandbox --disable-dev-shm-usage" --quiet`,{maxBuffer:1e9}).toString();
const j=JSON.parse(out);
const errs=(j.audits["errors-in-console"].details.items||[]).map(i=>i.description||i.source);
console.log("bp="+Math.round(j.categories["best-practices"].score*100));
console.log("console_errors="+errs.length+(errs.length?"\n  "+errs.join("\n  "):""));
const reqs=(j.audits["network-requests"].details.items||[]).filter(r=>/embed-navigation|revenue-calculator/.test(r.url));
for(const r of reqs) console.log("script "+r.url.replace(/\?.*/,"")+" status="+r.statusCode);
'
```
  - Expected: `bp=100`, `console_errors=0`, and two `script … status=200` lines whose URLs are on
    `portal.atxwashdryfold.com`, **not** `rundberglaundry.com`. A `status=404`, a
    `rundberglaundry.com` URL, or any console error means the two scripts did not move.

- [ ] **Step 6: Record the gate.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env
printf '%s=%q\n' PRE404_CLOSED yes >> "$REC"
printf '%s=%q\n' PRE404_EVIDENCE "legal x4 -> 301; embed-landing scripts self-hosted; reset 301 preserves token (both boxes)" >> "$REC"
grep -c '^PRE404_CLOSED=yes$' "$REC"
```
  - Expected: `1`.

---

### Task A3: [per box] **HUMAN-CONFIRM** — delete the inert nginx access gate and the franchisor-branded maintenance page (D-A7)

**Files:** box only. Per box:
- Deletes `/etc/nginx/conf.d/wavemax-gate.conf` and `/etc/nginx/snippets/wavemax-maintenance.conf`
  (both preserved as `.bak.<TS>` under `~/nginx-snapshots/`).
- Modifies `/etc/nginx/sites-enabled/atxwashateria.com`, `atxwashdryfold.com`,
  `rundberglaundry.com`, `portal.atxwashdryfold.com` — removes the 3-line
  `if ($access_allowed = 0) { return 503; }` and the one `include … wavemax-maintenance.conf;` line
  from each (4 files × 4 lines + the blank line left behind).
- Does **not** touch `crhsent.com` (M5: it references neither).

**Interfaces:**
- Consumes: M6, M7, M20; A1 Step 0's record (for `TS`).
- Produces: `TS_<box>`, `GATE_DELETED_<box>=yes` in the record; a box with zero `$access_allowed`,
  `$public_path`, `$allowed` and `@maintenance` references.
- Why this runs **before** the flips: the deleted `error_page 503 = @maintenance;` would otherwise
  re-intercept A12's 503 into the franchisor-branded page (D-A7, ordering reason).
- Independent of the flips in both directions: it can be rolled back after the flips, and the flips
  can be rolled back after it.

**Rollback (exact; values expand on the workstation).**
```bash
BOX=oci1; IP=161.153.71.201        # or BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; set -a; . "$REC"; set +a
V=TS_$BOX; TS=${!V}; test -n "$TS" && echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
sudo cp -p ~/nginx-snapshots/wavemax-gate.conf.$TS /etc/nginx/conf.d/wavemax-gate.conf
sudo cp -p ~/nginx-snapshots/wavemax-maintenance.conf.$TS /etc/nginx/snippets/wavemax-maintenance.conf
for f in atxwashateria.com atxwashdryfold.com rundberglaundry.com portal.atxwashdryfold.com; do
  sudo cp -p ~/nginx-snapshots/\$f.$TS /etc/nginx/sites-enabled/\$f
done
sudo nginx -t && sudo systemctl reload nginx
sudo nginx -T | grep -c 'access_allowed'"
```
- Rollback expected: `TS=<value>`, the two `nginx -t` lines from M20, then a count `> 0`
  (the gate is back).

- [ ] **Step 0: Set the box, load the record, and stamp `TS`.**
```bash
BOX=oci1; IP=161.153.71.201        # Pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y%m%dT%H%M%SZ'); rec "TS_$BOX" "$TS"
echo "BOX=$BOX IP=$IP TS=$TS"
```
  - Expected: `BOX=oci1 IP=161.153.71.201 TS=<YYYYMMDDTHHMMSSZ>`.

- [ ] **Step 1 (HUMAN-CONFIRM): Ask Rick.** Say exactly this:
  > Plan 3 slice A, `<BOX>`: delete the nginx access gate. Measured: `geo $allowed { default 1; }`
  > makes `$access_allowed` always 1, so the `return 503` and the whole `$public_path` allowlist are
  > unreachable code — the gate has been open since 2026-05-19 and cannot close. I am deleting
  > `conf.d/wavemax-gate.conf`, `snippets/wavemax-maintenance.conf` (its 503 page still says
  > "WaveMAX is in invite-only mode" — franchisor brand text on our origin), and the four
  > `if ($access_allowed = 0)` blocks, including the one in `portal.atxwashdryfold.com`. Live access
  > control is unaffected: it is the content app's accessGate (534 × 401/day on crhsent.com) and the
  > portal's own auth. `nginx -t` runs before any reload; every file is snapshotted for a byte-exact
  > rollback. Proceed?

  Continue only on an explicit yes.

- [ ] **Step 2: Snapshot all seven files and record the pre-state (nothing is modified).**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
mkdir -p ~/nginx-snapshots && chmod 700 ~/nginx-snapshots
sudo cp -p /etc/nginx/conf.d/wavemax-gate.conf ~/nginx-snapshots/wavemax-gate.conf.$TS
sudo cp -p /etc/nginx/snippets/wavemax-maintenance.conf ~/nginx-snapshots/wavemax-maintenance.conf.$TS
for f in atxwashateria.com atxwashdryfold.com rundberglaundry.com portal.atxwashdryfold.com crhsent.com; do
  sudo cp -p /etc/nginx/sites-enabled/\$f ~/nginx-snapshots/\$f.$TS
done
sudo chown \$(id -un) ~/nginx-snapshots/*.$TS
ls ~/nginx-snapshots/*.$TS | wc -l
sudo nginx -T | grep -c 'access_allowed'
grep -c 'access_allowed' /etc/nginx/sites-enabled/crhsent.com || true"
```
  - Expected: `7`, then a non-zero count (the live references), then `0` (crhsent.com has none).

- [ ] **Step 3: Install `~/plan3-remove-access-gate.pl`.** Quoted heredoc — nothing interpolates.
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "tee ~/plan3-remove-access-gate.pl >/dev/null" <<'PERL'
# Plan 3 slice A — remove the inert nginx access gate from one vhost file.
# Run as: sudo perl -0pi ~/plan3-remove-access-gate.pl /etc/nginx/sites-enabled/<host>
# Idempotent. Removes exactly 4 non-blank lines: the 3-line `if` block and the
# 1-line maintenance include. A file that never had them is left byte-identical.
s{\n[ \t]*if \(\$access_allowed = 0\) \{\n[ \t]*return 503;\n[ \t]*\}\n}{}g;
s{\n[ \t]*include /etc/nginx/snippets/wavemax-maintenance\.conf;\n}{\n}g;
PERL
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "perl -c ~/plan3-remove-access-gate.pl 2>&1 | tail -1; md5sum ~/plan3-remove-access-gate.pl"
```
  - Expected: `/home/ubuntu/plan3-remove-access-gate.pl syntax OK`, then an md5 that matches on both
    boxes (asserted in Step 7).

- [ ] **Step 4: Apply it to the four gated vhosts, asserting the line delta and the brace balance.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
for f in atxwashateria.com atxwashdryfold.com rundberglaundry.com portal.atxwashdryfold.com crhsent.com; do
  P=/etc/nginx/sites-enabled/\$f
  B=\$(grep -c . \$P); TB=\$(wc -l < \$P); OB=\$(tr -cd '{' < \$P | wc -c); CB=\$(tr -cd '}' < \$P | wc -c); SV=\$(grep -c '^server {' \$P)
  sudo perl -0pi ~/plan3-remove-access-gate.pl \$P
  A=\$(grep -c . \$P); TA=\$(wc -l < \$P); OA=\$(tr -cd '{' < \$P | wc -c); CA=\$(tr -cd '}' < \$P | wc -c); SA=\$(grep -c '^server {' \$P)
  echo \"\$f removed=\$((B-A)) total=\$TB-\>\$TA residual=\$(grep -c 'access_allowed\|wavemax-maintenance' \$P || true) braces=\$OB/\$CB-\>\$OA/\$CA servers=\$SV-\>\$SA\"
done"
```
  - Expected, exactly (dry-run verified 2026-09-20 against the live files):
    - `atxwashateria.com removed=4 total=127->122 residual=0 braces=13/13->12/12 servers=5->5`
    - `atxwashdryfold.com removed=4 total=127->122 residual=0 braces=13/13->12/12 servers=5->5`
    - `rundberglaundry.com removed=4 total=127->122 residual=0 braces=13/13->12/12 servers=5->5`
    - `portal.atxwashdryfold.com removed=4 total=23->18 residual=0 braces=2/2->1/1 servers=1->1`
    - `crhsent.com removed=0 total=94->94 residual=0 braces=9/9->9/9 servers=4->4` — the no-op that proves M5
  - `removed` counts non-blank lines; `total` counts every line (one blank line goes with the block).
  - Any other `removed`, any non-zero `residual`, any brace or server-count change is a STOP: run
    this task's Rollback (the snapshots are already in place) and re-read the file.

- [ ] **Step 5: Delete the two now-unreferenced files.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
sudo rm -f /etc/nginx/conf.d/wavemax-gate.conf /etc/nginx/snippets/wavemax-maintenance.conf
ls /etc/nginx/conf.d/ /etc/nginx/snippets/ | grep -c 'wavemax-gate\|wavemax-maintenance' || echo 0"
```
  - Expected: `0`.

- [ ] **Step 6: `nginx -t` BEFORE the reload, then reload.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "sudo nginx -t" 2>&1
```
  - Expected, exactly the two M20 lines: `nginx: the configuration file /etc/nginx/nginx.conf syntax is ok`
    and `nginx: configuration file /etc/nginx/nginx.conf test is successful`.
  - Anything else — in particular `unknown "access_allowed" variable` — means a reference was
    missed. **Do not reload.** Run the Rollback and re-read.
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "sudo systemctl reload nginx && sleep 2 && systemctl is-active nginx && sudo nginx -T | grep -c 'access_allowed\|public_path\|@maintenance'" 2>&1
```
  - Expected: `active`, then `0`.

- [ ] **Step 7: Prove nothing a visitor sees changed — all five hosts, on-box through nginx `:443`.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP '
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com crhsent.com portal.atxwashdryfold.com; do
  printf "%-28s / -> %s   /health -> " "$H" "$(curl -sk -m 8 -o /dev/null -w "code=%{http_code} len=%{size_download}" --resolve $H:443:127.0.0.1 https://$H/)"
  curl -sk -m 8 --resolve $H:443:127.0.0.1 -D- -o /dev/null https://$H/health | grep -i "^content-type" | tr -d "\r"
done'
```
  - Expected, exactly:
    - `atxwashateria.com            / -> code=200 len=1134    /health -> content-type: text/html; charset=utf-8`
    - `rundberglaundry.com          / -> code=200 len=1134    /health -> content-type: text/html; charset=utf-8`
    - `atxwashdryfold.com           / -> code=200 len=25585   /health -> content-type: text/html; charset=utf-8`
    - `crhsent.com                  / -> code=401 len=<n>     /health -> content-type: application/json; charset=utf-8`
    - `portal.atxwashdryfold.com    / -> code=200 len=<n>     /health -> content-type: application/json; charset=utf-8`
  - The `401` on `crhsent.com` is the content app's own accessGate (M14) and must still be there.

- [ ] **Step 8: Public smoke through CF and the record.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com crhsent.com portal.atxwashdryfold.com; do
  printf '%-28s ' "$H"; curl -s -m 20 -D- -o /dev/null "https://$H/?p=$(date +%s)" | grep -iE '^(HTTP/|x-origin-box)' | tr -d '\r' | paste -sd' '
done
rec "GATE_DELETED_$BOX" yes
```
  - Expected: five lines, each `HTTP/2 200` (crhsent.com `HTTP/2 401`) with an `x-origin-box` of
    `oci-phx` or `oci-phx-ad1` — CF round-robins, so either is correct here.

- [ ] **Step 9: Pass 2.** Repeat Steps 0 and 2–8 with `BOX=oci2; IP=144.24.4.202`. Step 1 is asked
      once, for both boxes. Start Pass 2 only after Step 8 recorded `GATE_DELETED_oci1=yes`.
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; set -a; . "$REC"; set +a
echo "oci1=$GATE_DELETED_oci1 oci2=$GATE_DELETED_oci2"
```
  - Expected: `oci1=yes oci2=yes`.

---

### Task A4: [per box] Add the `:3001` upstream and the content-app proxy snippet — additive, nothing switches yet

**Files:** box only. Per box:
- Creates `/etc/nginx/conf.d/content-app-upstream.conf`.
- Creates `/etc/nginx/snippets/proxy-content-app.conf`.
- Creates `~/plan3-flip-to-content-app.pl` (the transform A5–A10 apply; nothing runs it here).
- Creates `~/plan3-verify-host.sh` (the per-host probe set every flip task runs; read-only).
- Modifies nothing. No `server` block references either nginx file yet.

**Interfaces:**
- Consumes: M2 (the portal must stay on `:3000`, so the existing snippet is left untouched — D-1);
  M3 (nginx 1.18, no existing `upstream`); A3's `GATE_DELETED_<box>=yes` (so the new `error_page 503`
  cannot be re-intercepted by `@maintenance`, D-A7).
- Produces: `SNIPPET_READY_<box>=yes`; the two files A5–A10 include.
- Design notes, each deliberate:
  - **An `upstream` cannot live inside a `server` block**, which is why the upstream is a `conf.d`
    file and not part of the snippet. The snippet is included *inside* a server block, like its
    `:3000` counterpart.
  - `proxy_http_version 1.1` + `proxy_set_header Connection "";` + `keepalive 16;` — the textbook
    pairing. The existing `:3000` snippet instead sends `Connection: 'upgrade'` unconditionally on
    every request, a latent HTTP/1.1 wart; the content app has no WebSocket endpoint, so `Upgrade`
    handling is dropped rather than copied. Keepalive to a local Node app also removes a TCP
    handshake per request, which helps the C14 Performance gate.
  - `proxy_set_header X-Forwarded-Host $host;` — brief item 4 / R-3. nginx **overwrites** any
    client-supplied value, so a forged `X-Forwarded-Host` can no longer reach the app.
  - `max_fails=0` on the single upstream server: with one server, passive failure marking can only
    produce a `fail_timeout` window of hard 502s after the app recovers.
  - `error_page 502 504 = @content_unavailable` with `proxy_intercept_errors off`: nginx's *own*
    upstream errors (connection refused, timeout) become a `503 + Retry-After: 30`, while a 502 the
    app itself returns passes through untouched. This is the nginx-only half of item 20 (A12).

**Rollback (exact).** Both files are new and unreferenced, so deleting them is a no-op for traffic.
```bash
BOX=oci1; IP=161.153.71.201        # or BOX=oci2; IP=144.24.4.202
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
sudo rm -f /etc/nginx/conf.d/content-app-upstream.conf /etc/nginx/snippets/proxy-content-app.conf
sudo nginx -t && sudo systemctl reload nginx
sudo nginx -T | grep -c 'content_app'"
```
- Rollback expected: the two M20 `nginx -t` lines, then `0`.
- Refuse the rollback if any `sites-enabled` file still includes `proxy-content-app.conf`
  (`nginx -t` will say `unknown directive` / the include will fail) — roll the flips back first.

- [ ] **Step 0: Set the box and confirm A3 landed here.**
```bash
BOX=oci1; IP=161.153.71.201        # Pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
V=GATE_DELETED_$BOX; echo "BOX=$BOX gate_deleted=${!V}"
```
  - Expected: `BOX=oci1 gate_deleted=yes`. Empty means A3 did not complete on this box — STOP.

- [ ] **Step 1: Write the upstream.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "sudo tee /etc/nginx/conf.d/content-app-upstream.conf >/dev/null <<'NGINX'
# The content app (crhs-corporate) on this box. Plan 3 slice A.
#
# http-level on purpose: an upstream cannot be declared inside a server block,
# which is why this is a conf.d file and snippets/proxy-content-app.conf is not.
#
# Single origin by design. A peer-box backup was evaluated and REJECTED: there is
# no network path between the boxes (measured 2026-09-20 — ICMP, :22, :443 and
# :3001 are all closed on the private subnet and publicly), so it would require a
# VCN security-list rule plus iptables on both boxes, opening an unauthenticated
# plaintext path to the content app that bypasses Cloudflare. See Plan 3 A12.
upstream content_app {
    server 127.0.0.1:3001 max_fails=0;
    keepalive 16;
}
NGINX
sudo nginx -t"
```
  - Expected: the two M20 `nginx -t` lines. (An unused upstream is valid config.)

- [ ] **Step 2: Write the content-app proxy snippet.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "sudo tee /etc/nginx/snippets/proxy-content-app.conf >/dev/null <<'NGINX'
# Proxy to the content app (crhs-corporate) via upstream content_app -> :3001.
# Use inside an HTTPS server block. Plan 3 slice A.
#
# Counterpart of proxy-node-app.conf, which proxies to the PORTAL on :3000 and
# must stay in place for portal.atxwashdryfold.com. A host is flipped by changing
# which of the two it includes; rollback is swapping the include back + reload.
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

    # Item 20: while the CF pool health change is still propagating, answer with a
    # 503 + Retry-After instead of a bare nginx 502. 'off' keeps a 502 the app
    # itself returns passing through untouched.
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
sudo nginx -t"
```
  - Expected: the two M20 `nginx -t` lines.
  - The 503 page carries **no brand name** — no franchisor mark, per the A3 rationale.

- [ ] **Step 3: Install `~/plan3-flip-to-content-app.pl` — the one transform A5–A10 apply.**
      Quoted heredoc, so nothing interpolates; host-independent, so one script serves all three
      hosts (the vhost name is captured, and the rewrite pattern matches both `/austin-tx/` and
      `/austin-tx/wash-dry-fold/`).
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "tee ~/plan3-flip-to-content-app.pl >/dev/null" <<'PERL'
# Plan 3 slice A — flip one marketing vhost from the portal (:3000) to the content app (:3001).
# Run as: sudo perl -0pi ~/plan3-flip-to-content-app.pl /etc/nginx/sites-enabled/<host>
#
# Host-independent by design: the vhost name is captured, and the rewrite target
# matches both the /austin-tx/ and /austin-tx/wash-dry-fold/ variants.
# Three edits in ONE pass, so the include swap and the rewrite removal can never be
# separated (an intermediate state would 404 every apex request). Idempotent.

# 1. Replace the stale leading comment block. It documents the /austin-tx/ rewrite and
#    "mirrors wavemax.promo (gated Austin content + affiliate-program)", both untrue after
#    the flip -- and it is the reason a bare `grep -c austin-tx` is not 0 without this edit.
s{\A\# ([a-z.]+) \N*\n(?:\#\N*\n)+\n}
 {\# $1 — served by the content app (crhs-corporate) on :3001.\n\# plus mail.$1 -> Mailcow at localhost:8443.\n\# www -> apex 301 (one canonical URL per domain).\n\n};

# 2. Delete the legacy /austin-tx/ rewrite. The content app serves / directly and 404s
#    /austin-tx/, so this must go in the same edit as the include swap.
s{\n[ \t]*\# Default route \N*\n[ \t]*location = / \{\n[ \t]*rewrite \^ /austin-tx/\S* last;\n[ \t]*\}\n}
 {\n};

# 3. Swap the proxy snippet: :3000 -> :3001. Rollback = restore the snapshot + reload.
s{include /etc/nginx/snippets/proxy-node-app\.conf;}
 {include /etc/nginx/snippets/proxy-content-app.conf;};

# 4. The apex server-block comment still says "Node app (gated, identical to
#    wavemax.promo)" -- both halves untrue after the flip and after A3.
s{^\# HTTPS \N*apex \N*Node app\N*$}
 {\# HTTPS apex -> the content app (crhs-corporate) on :3001.}m;

# 5. Collapse the blank-line runs the A3 gate removal and edit 2 leave behind. The
#    three live files contain zero pre-existing triple-blank runs (verified), so this
#    only tidies what this plan removed.
s{\n\n\n+}{\n\n}g;
PERL
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "perl -c ~/plan3-flip-to-content-app.pl 2>&1 | tail -1
T=\$(mktemp); cp /etc/nginx/sites-enabled/atxwashateria.com \$T
B=\$(wc -l < \$T); perl -0pi ~/plan3-flip-to-content-app.pl \$T
echo \"dryrun lines=\$B-\>\$(wc -l < \$T) austin_tx=\$(grep -c austin-tx \$T || true) node_app=\$(grep -c 'Node app\|proxy-node-app' \$T || true) gated=\$(grep -ci gated \$T || true) content_snip=\$(grep -c proxy-content-app.conf \$T) servers=\$(grep -c '^server {' \$T) braces=\$(tr -cd '{' < \$T|wc -c)/\$(tr -cd '}' < \$T|wc -c) mailcow=\$(grep -c 'localhost:8443' \$T) acme=\$(grep -c acme-challenge \$T)\"
perl -0pi ~/plan3-flip-to-content-app.pl \$T; echo \"idempotent_lines=\$(wc -l < \$T)\"; rm -f \$T"
```
  - Expected: `/home/ubuntu/plan3-flip-to-content-app.pl syntax OK`, then
    `dryrun lines=122->111 austin_tx=0 node_app=0 gated=0 content_snip=1 servers=5 braces=11/11 mailcow=6 acme=1`,
    then `idempotent_lines=111`.
  - The `122` is the post-A2 line count (A3 removed 5 lines from 127). Running A4 **before** A3 on a
    box would instead print `lines=127->116 … braces=12/12` — if you see that, A3 did not land here
    and Step 0's assertion was skipped: STOP.
  - The dry run is on a **copy in `/tmp`**; nothing in `/etc/nginx` is touched by this step. These
    are the values measured against the live files on 2026-09-20, identical for all three hosts.
  - Any other `lines`, `servers`, `mailcow`, `acme` or brace count is a STOP: the live file has
    drifted from M4/M6 and the transform must be re-derived before any flip.

- [ ] **Step 4: Install `~/plan3-verify-host.sh` — the single per-host probe set every flip task runs before and after.**
      One artifact instead of six hand-copied probe blocks, so no host can quietly be verified less
      thoroughly than another. Read-only; safe to run at any time.
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "tee ~/plan3-verify-host.sh >/dev/null" <<'SH'
#!/bin/bash
# Plan 3 slice A — per-host verification, run ON the box, through the box's own nginx.
# Usage: bash ~/plan3-verify-host.sh <marketing-host>
# One KEY=value line per probe. No writes, no state.
H=${1:?usage: plan3-verify-host.sh <host>}
R="--resolve $H:443:127.0.0.1"
g() { curl -sk -m 8 -o /dev/null -w "$1" $R "https://$H$2"; }
B=$(mktemp); curl -sk -m 8 $R "https://$H/" -o "$B"
echo "host=$H"
echo "canonical=$(grep -o '<link rel="canonical" href="[^"]*"' "$B" | head -1 | sed 's/.*href="//;s/"$//')"
echo "root=$(g '%{http_code}/%{size_download}' /) marker=$(grep -c 'data-i18n="partner.meta.title"' "$B" || true) comingsoon=$(grep -c '<title>Coming soon</title>' "$B" || true)"
echo "health_ct=$(curl -sk -m 8 -D- -o /dev/null $R "https://$H/health" | awk 'tolower($1)=="content-type:"{print $2}' | tr -d '\r')"
echo "health_body=$(curl -sk -m 8 $R "https://$H/health" | head -c 40 | tr -d '\n')"
echo "austin_tx=$(g '%{http_code}' /austin-tx/) austin_wdf=$(g '%{http_code}' /austin-tx/wash-dry-fold/)"
for P in /privacy-policy /terms-and-conditions /terms-of-service /refund-policy; do
  echo "legal${P//\//_}=$(g '%{http_code}' "$P")/$(g '%{redirect_url}' "$P")"
done
Q='/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate'
echo "reset=$(g '%{http_code}' "$Q")/$(g '%{redirect_url}' "$Q")"
echo "robots=$(g '%{http_code}' /robots.txt) sitemap=$(g '%{http_code}' /sitemap.xml) affiliate=$(g '%{http_code}' /affiliate)"
echo "portal_guard=$(curl -sk -m 8 --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/health)"
echo "crhsent_guard=$(curl -sk -m 8 --resolve crhsent.com:443:127.0.0.1 https://crhsent.com/health)"
rm -f "$B"
SH
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "bash -n ~/plan3-verify-host.sh && echo 'syntax OK' && bash ~/plan3-verify-host.sh atxwashateria.com"
```
  - Expected: `syntax OK`, then the **PRE-FLIP** profile, which is the reference every flip task
    compares against (captured live on oci1, 2026-09-20, before A2 was applied):
```
host=atxwashateria.com
canonical=
root=200/1134 marker=0 comingsoon=1
health_ct=text/html;
health_body=<!DOCTYPE html><html lang="en"><head><
austin_tx=200 austin_wdf=200
legal_privacy-policy=200/
legal_terms-and-conditions=200/
legal_terms-of-service=200/
legal_refund-policy=200/
reset=200/
robots=200 sitemap=200 affiliate=200
portal_guard={"status":"UP",…}
crhsent_guard={"status":"ok"}
```
  - After A2 is deployed the four `legal_*` lines become `301/https://portal.atxwashdryfold.com/<path>`
    and `reset` becomes `301/https://portal.atxwashdryfold.com/embed-app-v2.html?route=…` even before
    any flip — because the A2 redirects live in the **content** app and `crhsent.com` already reaches
    it. On a still-unflipped marketing host they stay `200/` until that host flips.
  - **The POST-FLIP profile**, asserted by every flip task (M15, M18, M21, M23, M24):
```
canonical=https://atxwashdryfold.com/
root=200/27477 marker=1 comingsoon=0
health_ct=application/json;
health_body={"status":"ok"}
austin_tx=404 austin_wdf=404
legal_*=301/https://portal.atxwashdryfold.com/<path>        (all four)
reset=301/https://portal.atxwashdryfold.com/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate
robots=200 sitemap=200 affiliate=200
portal_guard={"status":"UP",…}   crhsent_guard={"status":"ok"}
```
  - `root=200/25585` is the pre-flip value for `atxwashdryfold.com` only (M15); the other two are
    `200/1134`.
  - Any `legal_*=404`, `reset=404`, `robots=404`, `sitemap=404`, or a `portal_guard` that is not
    `{"status":"UP"` is a **roll-back-now** condition, not a note for later.

- [ ] **Step 5: Reload and prove the new files are parsed but unreferenced.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "sudo systemctl reload nginx && sleep 2 && systemctl is-active nginx
echo -n 'upstream_present='; sudo nginx -T | grep -c 'upstream content_app'
echo -n 'hosts_including_content_snippet='; grep -l 'proxy-content-app.conf' /etc/nginx/sites-enabled/* 2>/dev/null | wc -l
echo -n 'hosts_including_portal_snippet='; grep -l 'proxy-node-app.conf' /etc/nginx/sites-enabled/* 2>/dev/null | wc -l"
```
  - Expected: `active`, `upstream_present=1`, `hosts_including_content_snippet=0`,
    `hosts_including_portal_snippet=4`.

- [ ] **Step 6: Prove all five hosts still serve exactly what they served before.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP '
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com crhsent.com portal.atxwashdryfold.com; do
  printf "%-28s / -> %s\n" "$H" "$(curl -sk -m 8 -o /dev/null -w "code=%{http_code} len=%{size_download}" --resolve $H:443:127.0.0.1 https://$H/)"
done'
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env
printf '%s=%q\n' "SNIPPET_READY_$BOX" yes >> "$REC"
```
  - Expected: the same five lines as A3 Step 5 — `1134`, `1134`, `25585`, `401`, portal `200`.

- [ ] **Step 7: Pass 2.** Repeat Steps 0–6 with `BOX=oci2; IP=144.24.4.202`, then assert parity.
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; set -a; . "$REC"; set +a
echo "ready oci1=$SNIPPET_READY_oci1 oci2=$SNIPPET_READY_oci2"
for IP in 161.153.71.201 144.24.4.202; do
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "md5sum /etc/nginx/conf.d/content-app-upstream.conf /etc/nginx/snippets/proxy-content-app.conf ~/plan3-flip-to-content-app.pl ~/plan3-verify-host.sh"
done | awk '{print $1}' | sort | uniq -c
```
  - Expected: `ready oci1=yes oci2=yes`, then four lines each beginning with `2` — the two nginx
    files and the two scripts are byte-identical across the boxes.

---

### Task A5: `atxwashateria.com` on **oci1** — before-gate, atomic flip, verify

**Why this host first (D-A2 corrects the brief's reason, not its conclusion):**
1. It serves the `noindex` **"Coming soon" placeholder to every public IP** (M15) — there is no
   indexed content and no SEO equity to regress. The flip is a strict upgrade, placeholder → real
   indexable page.
2. It is **not** the canonical host: `BASE_URL`, `<link rel="canonical">`, `og:url` and the sitemap
   all point at `atxwashdryfold.com` (M18), so a mistake here cannot damage the canonical identity.
3. Its rewrite is the simple `rewrite ^ /austin-tx/ last;` form, not the WDF variant (M4) — the
   simplest of the three removals.
4. Real human traffic on `/` is 39 hits/day; the bulk of its 759 requests are vulnerability scanners
   (M14).
5. It carries no live `/embed-app-v2.html` traffic, unlike `atxwashdryfold.com` (M16).

**Files:** box only (oci1).
- Modifies `/etc/nginx/sites-enabled/atxwashateria.com` — **one atomic write** that both swaps the
  include (`proxy-node-app.conf` → `proxy-content-app.conf`) and deletes the `location = { rewrite … }`
  block. Snapshot `~/nginx-snapshots/atxwashateria.com.<TS>` already exists from A3 Step 2; a fresh
  `.preflip.<TS>` is taken here.

**Interfaces:**
- Consumes: `C14_FEASIBLE=yes` (A1 — **a hard precondition**), `SNIPPET_READY_oci1=yes` (A4),
  `GATE_DELETED_oci1=yes` (A3); the discriminator table in the conventions; M4, M8, M9.
- Produces: `PRE_ATXW_DONE=yes`, `FLIP_atxwashateria.com_oci1=<TS>` in the record; 8 JSON
  before-gate reports.
- **D-A4 atomicity:** the include swap and the rewrite deletion are the same `perl -0pi` pass over
  one file. There is no intermediate state in which the host points at `:3001` while still
  rewriting to `/austin-tx/` — which would 404 every apex request (M8).

**Rollback (exact; independently reversible, ~5 s).**
```bash
IP=161.153.71.201; H=atxwashateria.com
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; set -a; . "$REC"; set +a
V=FLIP_${H}_oci1; TS=${!V}; echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
sudo cp -p ~/nginx-snapshots/$H.preflip.$TS /etc/nginx/sites-enabled/$H
sudo nginx -t && sudo systemctl reload nginx
curl -sk -m 8 -o /dev/null -w 'rolled_back / code=%{http_code} len=%{size_download}\n' --resolve $H:443:127.0.0.1 https://$H/
curl -sk -m 8 -o /dev/null -w 'rolled_back /austin-tx/ code=%{http_code}\n' --resolve $H:443:127.0.0.1 https://$H/austin-tx/"
```
- Rollback expected: `TS=<value>`, the two M20 `nginx -t` lines, `rolled_back / code=200 len=1134`,
  `rolled_back /austin-tx/ code=200`.

- [ ] **Step 0: Load the record and assert every precondition.**
```bash
IP=161.153.71.201; BOX=oci1; H=atxwashateria.com
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
echo "c14=$C14_FEASIBLE pre404=$PRE404_CLOSED gate=$GATE_DELETED_oci1/$GATE_DELETED_oci2 snip=$SNIPPET_READY_oci1/$SNIPPET_READY_oci2"
test "$C14_FEASIBLE" = yes || echo 'STOP: A1 has not passed — see D-A1'
test "$PRE404_CLOSED" = yes || echo 'STOP: A2 has not passed — the four legal paths would 404 on this host'
```
  - Expected: `c14=yes pre404=yes gate=yes/yes snip=yes/yes` and no `STOP` line.
  - `c14=no` is a **STOP**: the content-app CLS fix (A1 Step 4) must land and A1 must be re-run.
  - `pre404` empty or `no` is a **STOP**: A2 must land first, or `/privacy-policy`,
    `/terms-and-conditions`, `/terms-of-service` and `/refund-policy` 404 publicly on this host the
    moment it flips (M21).

- [ ] **Step 1: Before-gate — measure `atxwashateria.com` through Cloudflare, desktop ×1 + mobile ×3.**
```bash
EV=/var/www/wavemax/cutover-logs; OUT=$EV/lighthouse; set -a; . "$EV/plan3-sliceA-record.env"; set +a
H=atxwashateria.com; FLAGS='--headless=new --no-sandbox --disable-dev-shm-usage'
CHROME_PATH=/opt/google/chrome/chrome npx --yes lighthouse "https://$H/?lh=$(date +%s)" --preset=desktop \
  --output=json --output-path="$OUT/p3-before-$H-desktop-1-$LH_DATE.json" --chrome-flags="$FLAGS" --quiet
for N in 1 2 3; do
  CHROME_PATH=/opt/google/chrome/chrome npx --yes lighthouse "https://$H/?lh=$(date +%s)" --form-factor=mobile \
    --screenEmulation.mobile=true --output=json --output-path="$OUT/p3-before-$H-mobile-$N-$LH_DATE.json" \
    --chrome-flags="$FLAGS" --quiet
done
node -e '
const fs=require("fs"),d=process.argv[1],h=process.argv[2],dir=process.argv[3];
for(const [ff,ns] of [["desktop",[1]],["mobile",[1,2,3]]]) for(const n of ns){
  const c=JSON.parse(fs.readFileSync(`${dir}/p3-before-${h}-${ff}-${n}-${d}.json`,"utf8")).categories;
  console.log(`BEFORE ${h} ${ff} run${n} `+["performance","accessibility","best-practices","seo"].map(k=>k+"="+Math.round(c[k].score*100)).join(" "));
}' "$LH_DATE" "$H" "$OUT" | tee -a "$EV/p3-lh-$H.txt"
```
  - Expected: 4 `BEFORE atxwashateria.com …` lines, recorded verbatim.
  - **These numbers are evidence of what the public saw, not a threshold** (D-A3, C14-reg applies to
    `atxwashdryfold.com` only). The page measured here is the `noindex` placeholder, so its `seo`
    will be **below 100** (`is-crawlable` fails). That is expected and is **not** a blocker.

- [ ] **Step 2: Snapshot the file and record the exact bytes being replaced.**
```bash
IP=161.153.71.201; H=atxwashateria.com
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y%m%dT%H%M%SZ'); rec "FLIP_${H}_oci1" "$TS"; echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
sudo cp -p /etc/nginx/sites-enabled/$H ~/nginx-snapshots/$H.preflip.$TS
sudo chown \$(id -un) ~/nginx-snapshots/$H.preflip.$TS
md5sum /etc/nginx/sites-enabled/$H
grep -n 'location = /\|rewrite \^ /austin-tx/\|proxy-node-app.conf' /etc/nginx/sites-enabled/$H"
```
  - Expected: `TS=<value>`, an md5, then exactly three grep lines — a `location = / {`, a
    `rewrite ^ /austin-tx/ last;` and an `include /etc/nginx/snippets/proxy-node-app.conf;`.
  - Any other count is a STOP: the file has drifted from M4/M2.

- [ ] **Step 3: The atomic flip — the A4 transform, one pass, then `nginx -t` BEFORE reloading.**
```bash
IP=161.153.71.201; H=atxwashateria.com
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
P=/etc/nginx/sites-enabled/$H
B=\$(wc -l < \$P)
sudo perl -0pi ~/plan3-flip-to-content-app.pl \$P
echo \"lines=\$B-\>\$(wc -l < \$P) rewrite_left=\$(grep -c 'rewrite \^ /austin-tx' \$P || true) austin_tx=\$(grep -c austin-tx \$P || true) portal_snippet_left=\$(grep -c proxy-node-app.conf \$P || true) content_snippet=\$(grep -c proxy-content-app.conf \$P) servers=\$(grep -c '^server {' \$P) braces=\$(tr -cd '{' < \$P|wc -c)/\$(tr -cd '}' < \$P|wc -c) mailcow=\$(grep -c 'localhost:8443' \$P) acme=\$(grep -c acme-challenge \$P)\"
sudo nginx -t"
```
  - Expected, exactly:
    `lines=122->111 rewrite_left=0 austin_tx=0 portal_snippet_left=0 content_snippet=1 servers=5 braces=11/11 mailcow=6 acme=1`,
    then the two M20 `nginx -t` lines.
  - `rewrite_left` non-zero with `content_snippet=1` is the exact failure the brief warns about
    (M8: `/austin-tx/` is a 404 on `:3001`). **Do not reload.** Run the Rollback.
  - A `servers`, `mailcow`, `acme` or brace value other than the one above means the transform ate
    more than it should — the exact class of failure that a `grep -c`-only check misses (see the
    conventions). **Do not reload.** Run the Rollback.

- [ ] **Step 4: Reload, then verify on oci1 — the content app, no `/austin-tx/`, portal untouched.**
```bash
IP=161.153.71.201; H=atxwashateria.com
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "sudo systemctl reload nginx && sleep 2 && systemctl is-active nginx
echo '--- flipped host'
curl -sk -m 8 --resolve $H:443:127.0.0.1 -o /tmp/f.html -w 'GET / code=%{http_code} len=%{size_download}\n' https://$H/
echo -n '  partner_marker='; grep -c 'data-i18n=\"partner.meta.title\"' /tmp/f.html || true
echo -n '  comingsoon='; grep -c '<title>Coming soon</title>' /tmp/f.html || true
curl -sk -m 8 --resolve $H:443:127.0.0.1 -D- -o /tmp/h.txt https://$H/health | grep -i '^content-type' | tr -d '\r'
echo \"  health_body=\$(cat /tmp/h.txt)\"
curl -sk -m 8 -o /dev/null -w '  GET /austin-tx/ code=%{http_code}\n' --resolve $H:443:127.0.0.1 https://$H/austin-tx/
echo '--- A2 gate classes: the four legal paths and the reset link (M21, M23)'
for P in /privacy-policy /terms-and-conditions /terms-of-service /refund-policy; do
  printf '  %-24s %s %s\n' \$P \
    \"\$(curl -sk -m 8 -o /dev/null -w '%{http_code}' --resolve $H:443:127.0.0.1 https://$H\$P)\" \
    \"\$(curl -sk -m 8 -o /dev/null -w '%{redirect_url}' --resolve $H:443:127.0.0.1 https://$H\$P)\"
done
curl -sk -m 8 -o /dev/null -w '  reset link code=%{http_code} loc=%{redirect_url}\n' --resolve $H:443:127.0.0.1 \
  \"https://$H/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate\"
echo '--- regression guards (must be unchanged)'
curl -sk -m 8 --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/health; echo
for G in rundberglaundry.com atxwashdryfold.com; do
  printf '  %-22s / -> %s\n' \$G \"\$(curl -sk -m 8 -o /dev/null -w 'code=%{http_code} len=%{size_download}' --resolve \$G:443:127.0.0.1 https://\$G/)\"
done"
```
  - Expected, exactly:
    - `active`
    - `GET / code=200 len=27477`, `partner_marker=1`, `comingsoon=0`
    - `content-type: application/json; charset=utf-8`, `health_body={"status":"ok"}`
    - `GET /austin-tx/ code=404`
    - four legal lines, each `<path>  301 https://portal.atxwashdryfold.com<path>` — **not** `404`.
      A `404` here means A2 was not deployed to this box: **roll this flip back immediately**, the
      host is publicly serving 404s on its privacy policy and terms.
    - `reset link code=301 loc=https://portal.atxwashdryfold.com/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate`
      — the token byte-identical. Anything else and password reset is broken on this host (M23):
      roll back.
    - `{"status":"UP","timestamp":"…","environment":"production"}` — the portal, still on `:3000`
    - `rundberglaundry.com / -> code=200 len=1134` and `atxwashdryfold.com / -> code=200 len=25585`
      — both still on the portal snippet, proving one host at a time.

- [ ] **Step 4b: Run the full probe set on oci1 and compare against the POST-FLIP profile (A4 Step 4).**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@161.153.71.201 'bash ~/plan3-verify-host.sh atxwashateria.com'
```
  - Expected: the POST-FLIP profile verbatim. This is the first time the profile is asserted against a
    live flipped host, so read every line: a `legal_*=404`, a `reset` that is not the token-preserving
    301, `robots=404`, `sitemap=404`, or a `portal_guard` other than `{"status":"UP"` is a
    **roll-back-now** condition.

- [ ] **Step 5: Verify oci2 is untouched — proving one box at a time.**
```bash
H=atxwashateria.com
ssh -i ~/.ssh/oci_wavemax ubuntu@144.24.4.202 "
grep -c 'proxy-node-app.conf' /etc/nginx/sites-enabled/$H
grep -c 'austin-tx' /etc/nginx/sites-enabled/$H
curl -sk -m 8 -o /dev/null -w 'oci2 / code=%{http_code} len=%{size_download}\n' --resolve $H:443:127.0.0.1 https://$H/"
```
  - Expected: `1`, `1`, `oci2 / code=200 len=1134` — oci2 still serves the placeholder.

- [ ] **Step 6: Public check through CF, attributed per box. Both apps are live for this host now — that is expected and temporary.**
```bash
H=atxwashateria.com
for i in $(seq 1 20); do
  curl -s -m 15 -D- -o /tmp/cf.html "https://$H/?p=$(date +%s)-$i" \
    | awk 'tolower($1)=="x-origin-box:"{b=$2} END{printf "%s", b}' | tr -d '\r'
  printf ' %s\n' "$(grep -qc 'data-i18n="partner.meta.title"' /tmp/cf.html && echo content || echo portal)"
done | sort | uniq -c
```
  - Expected: two groups — `"oci-phx" content` and `"oci-phx-ad1" portal` — summing to 20.
  - Any `"oci-phx" portal` row means oci1 did not actually flip for public traffic (check CF cache;
    the `?p=` buster should prevent it). Any `"oci-phx-ad1" content` row means oci2 flipped too —
    STOP, that violates one box at a time.

---

### Task A6: `atxwashateria.com` on **oci2** — flip, verify both boxes, after-gate (C14-abs + C14-stab)

**Files:** box only (oci2). Modifies `/etc/nginx/sites-enabled/atxwashateria.com` — the same single
atomic write as A5 Step 3. Snapshot `~/nginx-snapshots/atxwashateria.com.preflip.<TS>` on oci2.

**Interfaces:**
- Consumes: `FLIP_atxwashateria.com_oci1` (A5, must be recorded), `SNIPPET_READY_oci2=yes` (A4).
- Produces: `FLIP_atxwashateria.com_oci2=<TS>`, `HOST_DONE_atxwashateria.com=yes`, and the
  after-gate scores; 8 JSON after-gate reports.
- **Starts immediately after A5 Step 6 passes** — the host is publicly inconsistent between the two
  box flips (conventions, box order).

**Rollback (exact).** Per box, independently. To reverse oci2 only:
```bash
IP=144.24.4.202; H=atxwashateria.com
EV=/var/www/wavemax/cutover-logs; set -a; . "$EV/plan3-sliceA-record.env"; set +a
V=FLIP_${H}_oci2; TS=${!V}; echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
sudo cp -p ~/nginx-snapshots/$H.preflip.$TS /etc/nginx/sites-enabled/$H
sudo nginx -t && sudo systemctl reload nginx
curl -sk -m 8 -o /dev/null -w 'oci2 rolled_back / code=%{http_code} len=%{size_download}\n' --resolve $H:443:127.0.0.1 https://$H/"
```
- Rollback expected: `TS=<value>`, the two M20 lines, `oci2 rolled_back / code=200 len=1134`.
- To reverse the **whole host**, run this and then A5's Rollback. Order does not matter; each box is
  independent.

- [ ] **Step 0: Load the record and assert A5 completed.**
```bash
IP=144.24.4.202; BOX=oci2; H=atxwashateria.com
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
V=FLIP_${H}_oci1; echo "oci1_flip=${!V} snip_oci2=$SNIPPET_READY_oci2"
```
  - Expected: `oci1_flip=<TS> snip_oci2=yes`. Either empty is a STOP.

- [ ] **Step 1: Snapshot, assert the pre-state, flip atomically, `nginx -t` before reloading.**
```bash
IP=144.24.4.202; H=atxwashateria.com
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y%m%dT%H%M%SZ'); rec "FLIP_${H}_oci2" "$TS"; echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
P=/etc/nginx/sites-enabled/$H
sudo cp -p \$P ~/nginx-snapshots/$H.preflip.$TS; sudo chown \$(id -un) ~/nginx-snapshots/$H.preflip.$TS
test \$(grep -c 'rewrite \^ /austin-tx/ last;' \$P) = 1
test \$(grep -c 'proxy-node-app.conf' \$P) = 1
B=\$(wc -l < \$P)
sudo perl -0pi ~/plan3-flip-to-content-app.pl \$P
echo \"lines=\$B-\>\$(wc -l < \$P) rewrite_left=\$(grep -c 'rewrite \^ /austin-tx' \$P || true) austin_tx=\$(grep -c austin-tx \$P || true) content_snippet=\$(grep -c proxy-content-app.conf \$P) servers=\$(grep -c '^server {' \$P) braces=\$(tr -cd '{' < \$P|wc -c)/\$(tr -cd '}' < \$P|wc -c) mailcow=\$(grep -c 'localhost:8443' \$P) acme=\$(grep -c acme-challenge \$P)\"
sudo nginx -t"
```
  - Expected: `TS=<value>`, then
    `lines=122->111 rewrite_left=0 austin_tx=0 content_snippet=1 servers=5 braces=11/11 mailcow=6 acme=1`,
    then the two M20 `nginx -t` lines.

- [ ] **Step 2: Reload and verify oci2, plus the regression guards.**
```bash
IP=144.24.4.202; H=atxwashateria.com
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "sudo systemctl reload nginx && sleep 2 && systemctl is-active nginx
curl -sk -m 8 --resolve $H:443:127.0.0.1 -o /tmp/f.html -w 'GET / code=%{http_code} len=%{size_download}\n' https://$H/
echo -n '  partner_marker='; grep -c 'data-i18n=\"partner.meta.title\"' /tmp/f.html || true
echo \"  health=\$(curl -sk -m 8 --resolve $H:443:127.0.0.1 https://$H/health)\"
curl -sk -m 8 -o /dev/null -w '  GET /austin-tx/ code=%{http_code}\n' --resolve $H:443:127.0.0.1 https://$H/austin-tx/
curl -sk -m 8 --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/health; echo
for G in rundberglaundry.com atxwashdryfold.com; do
  printf '  %-22s / -> %s\n' \$G \"\$(curl -sk -m 8 -o /dev/null -w 'code=%{http_code} len=%{size_download}' --resolve \$G:443:127.0.0.1 https://\$G/)\"
done"
```
  - Expected: `active`, `GET / code=200 len=27477`, `partner_marker=1`, `health={"status":"ok"}`,
    `GET /austin-tx/ code=404`, the portal `{"status":"UP",…}`, and
    `rundberglaundry.com / -> code=200 len=1134`, `atxwashdryfold.com / -> code=200 len=25585`.

- [ ] **Step 2b: Run the full per-host probe set on BOTH boxes and compare against the POST-FLIP profile (A4 Step 4).**
```bash
H=atxwashateria.com
for IP in 161.153.71.201 144.24.4.202; do
  echo "##### $IP"; ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "bash ~/plan3-verify-host.sh $H"
done
```
  - Expected: both boxes print the POST-FLIP profile from A4 Step 4 verbatim —
    `canonical=https://atxwashdryfold.com/`, `root=200/27477 marker=1 comingsoon=0`,
    `health_ct=application/json;`, `health_body={"status":"ok"}`, `austin_tx=404 austin_wdf=404`,
    all four `legal_*=301/https://portal.atxwashdryfold.com/<path>`, the `reset=301/…token=ABC123def456…`
    line, `robots=200 sitemap=200 affiliate=200`, `portal_guard={"status":"UP"…}`,
    `crhsent_guard={"status":"ok"}`.
  - Any divergence between the two boxes is a STOP: the boxes must be identical before the after-gate
    Lighthouse runs, because CF round-robins between them.

- [ ] **Step 3: Both boxes now agree — public check through CF, attributed.**
```bash
H=atxwashateria.com
for i in $(seq 1 20); do
  curl -s -m 15 -D- -o /tmp/cf.html "https://$H/?p=$(date +%s)-$i" \
    | awk 'tolower($1)=="x-origin-box:"{b=$2} END{printf "%s", b}' | tr -d '\r'
  printf ' %s\n' "$(grep -qc 'data-i18n="partner.meta.title"' /tmp/cf.html && echo content || echo portal)"
done | sort | uniq -c
curl -s -m 15 "https://$H/health?p=$(date +%s)"; echo
curl -s -m 15 -o /dev/null -w "public /austin-tx/ code=%{http_code}\n" "https://$H/austin-tx/?p=$(date +%s)"
```
  - Expected: exactly two groups, `"oci-phx" content` and `"oci-phx-ad1" content`, summing to 20 —
    **no `portal` row**. Then `{"status":"ok"}` and `public /austin-tx/ code=404`.

- [ ] **Step 4: After-gate — C14-abs and C14-stab through Cloudflare (D-A3).**
```bash
EV=/var/www/wavemax/cutover-logs; OUT=$EV/lighthouse; set -a; . "$EV/plan3-sliceA-record.env"; set +a
H=atxwashateria.com; FLAGS='--headless=new --no-sandbox --disable-dev-shm-usage'
CHROME_PATH=/opt/google/chrome/chrome npx --yes lighthouse "https://$H/?lh=$(date +%s)" --preset=desktop \
  --output=json --output-path="$OUT/p3-after-$H-desktop-1-$LH_DATE.json" --chrome-flags="$FLAGS" --quiet
for N in 1 2 3; do
  CHROME_PATH=/opt/google/chrome/chrome npx --yes lighthouse "https://$H/?lh=$(date +%s)" --form-factor=mobile \
    --screenEmulation.mobile=true --output=json --output-path="$OUT/p3-after-$H-mobile-$N-$LH_DATE.json" \
    --chrome-flags="$FLAGS" --quiet
done
node -e '
const fs=require("fs"),d=process.argv[1],h=process.argv[2],dir=process.argv[3];
const cats=["performance","accessibility","best-practices","seo"]; let fail=0;
for(const [ff,ns] of [["desktop",[1]],["mobile",[1,2,3]]]){
  const perf=[];
  for(const n of ns){
    const c=JSON.parse(fs.readFileSync(`${dir}/p3-after-${h}-${ff}-${n}-${d}.json`,"utf8")).categories;
    const s=Object.fromEntries(cats.map(k=>[k,Math.round(c[k].score*100)])); perf.push(s.performance);
    const ok=cats.every(k=>s[k]>=95); if(!ok)fail++;
    console.log(`${ok?"PASS":"FAIL"} AFTER ${h} ${ff} run${n} `+cats.map(k=>k+"="+s[k]).join(" "));
  }
  const sp=Math.max(...perf)-Math.min(...perf);
  console.log(`SPREAD ${h} ${ff} perf=${perf.join(",")} spread=${sp} ${sp<=3?"OK":"TOO_NOISY"}`);
  if(sp>3)fail++;
}
console.log(`C14 ${h} `+(fail?"FAIL fails="+fail:"PASS"));
process.exit(fail?1:0)' "$LH_DATE" "$H" "$OUT" | tee -a "$EV/p3-lh-$H.txt"
echo "exit=${PIPESTATUS[0]}"
EV=/var/www/wavemax/cutover-logs; printf '%s=%q\n' "HOST_DONE_atxwashateria.com" yes >> "$EV/plan3-sliceA-record.env"
```
  - Expected: 4 `PASS AFTER …` lines, 2 `SPREAD … OK` lines, `C14 atxwashateria.com PASS`, `exit=0`.
  - On `FAIL`: this host is **blocked**. Run A6's then A5's Rollback so the host returns to the
    placeholder, record the failing categories, and hand the diagnosis to the controller. Do **not**
    start A7 with a blocked host behind you.
  - `TOO_NOISY`: re-run Step 4 once. Still `TOO_NOISY` → block (D-A3, C14-stab).

---

### Task A7: `rundberglaundry.com` on **oci1** — before-gate, atomic flip, verify

**Why second:** like `atxwashateria.com` it serves the `noindex` placeholder publicly (M15), so the
flip carries no content regression — but memory records it as **retained for SEO**, and crawlers are
actively fetching it (19 `/robots.txt` + 8 `/sitemap.xml` hits/day, M14). Higher SEO stakes than
atxwashateria, lower than the canonical host. Its rewrite is the simple `/austin-tx/` form (M4).

**Files:** box only (oci1). Modifies `/etc/nginx/sites-enabled/rundberglaundry.com`, one atomic
write. Creates `~/nginx-snapshots/rundberglaundry.com.preflip.<TS>`.

**Interfaces:**
- Consumes: `HOST_DONE_atxwashateria.com=yes` (A6 — **one host at a time**), `C14_FEASIBLE=yes`
  (A1), `SNIPPET_READY_oci1=yes` (A4), and **`PRE404_CLOSED=yes` (A2) as a hard prerequisite** —
  this host carries three couplings the other two do not:
  - **M22 (hard):** `public/embed-landing.html:314`/`:317` load two scripts cross-origin from
    `https://rundberglaundry.com/assets/js/`, which the content app 404s. Until A2 has self-hosted
    them, this flip silently strips two scripts from the **portal's own landing page** — a missing
    script, not an HTTP error, so no status-code probe detects it. Step 0 asserts it.
  - **M23 (assert, not gate):** `FRONTEND_URL=https://rundberglaundry.com`, so every affiliate,
    administrator and operator password-reset link is on this host. It survives via the B7
    token-preserving 301 (D-A8); Step 0 asserts the 301 end-to-end rather than gating on slice E's
    E2, because the 301 — not the env var — is what actually carries the token.
  - **M24 (closed by A2):** `public/partner-program.html:10` must already point at
    `https://atxwashdryfold.com/`, or flipping this host creates an A→B→A canonical loop with the
    still-unflipped `atxwashdryfold.com`.
- Produces: `FLIP_rundberglaundry.com_oci1=<TS>` and 4 JSON before-gate reports.

**Rollback (exact).** Identical in shape to A5's, with `H=rundberglaundry.com`:
```bash
IP=161.153.71.201; H=rundberglaundry.com
EV=/var/www/wavemax/cutover-logs; set -a; . "$EV/plan3-sliceA-record.env"; set +a
V=FLIP_${H}_oci1; TS=${!V}; echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
sudo cp -p ~/nginx-snapshots/$H.preflip.$TS /etc/nginx/sites-enabled/$H
sudo nginx -t && sudo systemctl reload nginx
curl -sk -m 8 -o /dev/null -w 'rolled_back / code=%{http_code} len=%{size_download}\n' --resolve $H:443:127.0.0.1 https://$H/
curl -sk -m 8 -o /dev/null -w 'rolled_back /austin-tx/ code=%{http_code}\n' --resolve $H:443:127.0.0.1 https://$H/austin-tx/"
```
- Rollback expected: `TS=<value>`, the two M20 lines, `rolled_back / code=200 len=1134`,
  `rolled_back /austin-tx/ code=200`.

- [ ] **Step 0: Assert the previous host finished, the gates hold, and this host's three couplings are closed.**
```bash
IP=161.153.71.201; BOX=oci1; H=rundberglaundry.com
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; set -a; . "$REC"; set +a
echo "c14=$C14_FEASIBLE pre404=$PRE404_CLOSED snip=$SNIPPET_READY_oci1"
grep -c '^HOST_DONE_atxwashateria.com=yes$' "$REC"
test "$PRE404_CLOSED" = yes || echo 'STOP: A2 has not passed'
# M22 — the portal landing must no longer fetch scripts from this host
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'echo -n "m22_cross_origin_script_refs="; curl -s -H "Host: portal.atxwashdryfold.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/embed-landing.html | grep -c "https://rundberglaundry.com/assets/js" || true'
# M23 — the reset link must 301 with the token intact
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'curl -s -o /dev/null -w "m23_reset=%{http_code} loc=%{redirect_url}\n" -H "Host: rundberglaundry.com" "http://127.0.0.1:3001/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate"'
# M24 — the portal copy of the landing page must be self-canonical on atxwashdryfold.com
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'echo -n "m24_portal_canonical="; curl -s -H "Host: atxwashdryfold.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/ | grep -o "canonical\" href=\"[^\"]*\"" | head -1'
```
  - Expected, exactly:
    - `c14=yes pre404=yes snip=yes`
    - `1`
    - no `STOP` line
    - `m22_cross_origin_script_refs=0` — non-zero means this flip would strip two scripts from the
      portal's landing page. **STOP**; A2 Step 3 has not been deployed.
    - `m23_reset=301 loc=https://portal.atxwashdryfold.com/embed-app-v2.html?route=/reset-password&token=ABC123def456&type=affiliate`
      — any other value means password reset breaks for affiliates, administrators **and** operators
      on this flip. **STOP.**
    - `m24_portal_canonical=canonical" href="https://atxwashdryfold.com/"` — if it still reads
      `rundberglaundry.com`, flipping this host creates a canonical loop. **STOP**; A2 Step 3 has not
      been deployed.

- [ ] **Step 1: Before-gate through Cloudflare (desktop ×1, mobile ×3).** Identical to A5 Step 1
      with `H=rundberglaundry.com` and the `p3-before-` prefix.
  - Expected: 4 `BEFORE rundberglaundry.com …` lines. As with atxwashateria, `seo` will be below 100
    — the `noindex` placeholder (M15). Evidence, not a threshold (D-A3).

- [ ] **Step 2: Snapshot and assert the pre-state.** Identical to A5 Step 2 with
      `H=rundberglaundry.com`.
  - Expected: `TS=<value>`, an md5, then exactly three grep lines — `location = / {`,
    `rewrite ^ /austin-tx/ last;`, `include …/proxy-node-app.conf;`.

- [ ] **Step 3: The atomic flip + `nginx -t` before reload.** Identical to A5 Step 3 with
      `H=rundberglaundry.com` (the same A4 transform — it is host-independent).
  - Expected, exactly:
    `lines=122->111 rewrite_left=0 austin_tx=0 portal_snippet_left=0 content_snippet=1 servers=5 braces=11/11 mailcow=6 acme=1`,
    then the two M20 lines.

- [ ] **Step 4: Reload and verify oci1 + regression guards.** Identical to A5 Step 4 with
      `H=rundberglaundry.com` and guards `G` = `atxwashdryfold.com` (must still be `len=25585`,
      portal snippet) and `atxwashateria.com` (must be `len=27477`, already flipped).
```bash
IP=161.153.71.201; H=rundberglaundry.com
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "sudo systemctl reload nginx && sleep 2 && systemctl is-active nginx
curl -sk -m 8 --resolve $H:443:127.0.0.1 -o /tmp/f.html -w 'GET / code=%{http_code} len=%{size_download}\n' https://$H/
echo -n '  partner_marker='; grep -c 'data-i18n=\"partner.meta.title\"' /tmp/f.html || true
echo \"  health=\$(curl -sk -m 8 --resolve $H:443:127.0.0.1 https://$H/health)\"
curl -sk -m 8 -o /dev/null -w '  GET /austin-tx/ code=%{http_code}\n' --resolve $H:443:127.0.0.1 https://$H/austin-tx/
curl -sk -m 8 --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/health; echo
printf '  atxwashateria.com  / -> %s\n' \"\$(curl -sk -m 8 -o /dev/null -w 'code=%{http_code} len=%{size_download}' --resolve atxwashateria.com:443:127.0.0.1 https://atxwashateria.com/)\"
printf '  atxwashdryfold.com / -> %s\n' \"\$(curl -sk -m 8 -o /dev/null -w 'code=%{http_code} len=%{size_download}' --resolve atxwashdryfold.com:443:127.0.0.1 https://atxwashdryfold.com/)\""
```
  - Expected: `active`, `GET / code=200 len=27477`, `partner_marker=1`, `health={"status":"ok"}`,
    `GET /austin-tx/ code=404`, portal `{"status":"UP",…}`,
    `atxwashateria.com  / -> code=200 len=27477` (flipped in A5/A6),
    `atxwashdryfold.com / -> code=200 len=25585` (still the portal).

- [ ] **Step 5: Verify oci2 untouched for this host.** Identical to A5 Step 5 with
      `H=rundberglaundry.com`.
  - Expected: `1`, `1`, `oci2 / code=200 len=1134`.

- [ ] **Step 6: Public check through CF, attributed.** Identical to A5 Step 6 with
      `H=rundberglaundry.com`.
  - Expected: `"oci-phx" content` and `"oci-phx-ad1" portal`, summing to 20.

---

### Task A8: `rundberglaundry.com` on **oci2** — flip, verify both boxes, after-gate

**Files:** box only (oci2). Modifies `/etc/nginx/sites-enabled/rundberglaundry.com`, one atomic
write. Creates `~/nginx-snapshots/rundberglaundry.com.preflip.<TS>` on oci2.

**Interfaces:**
- Consumes: `FLIP_rundberglaundry.com_oci1` (A7), `SNIPPET_READY_oci2=yes`.
- Produces: `FLIP_rundberglaundry.com_oci2=<TS>`, `HOST_DONE_rundberglaundry.com=yes`, the
  after-gate scores, 4 JSON after-gate reports.
- Starts immediately after A7 Step 6 passes.

**Rollback (exact).** As A6's, with `H=rundberglaundry.com` and `IP=144.24.4.202`.
- Rollback expected: `TS=<value>`, the two M20 lines, `oci2 rolled_back / code=200 len=1134`.

- [ ] **Step 0: Assert A7 completed.** As A6 Step 0 with `H=rundberglaundry.com`.
  - Expected: `oci1_flip=<TS> snip_oci2=yes`.

- [ ] **Step 1: Snapshot, assert, flip, `nginx -t`.** As A6 Step 1 with `H=rundberglaundry.com`.
  - Expected: `TS=<value>`, then
    `lines=122->111 rewrite_left=0 austin_tx=0 content_snippet=1 servers=5 braces=11/11 mailcow=6 acme=1`,
    then the two M20 lines.

- [ ] **Step 2: Reload and verify oci2 + guards.** As A6 Step 2 with `H=rundberglaundry.com`;
      guards: `atxwashateria.com` → `len=27477`, `atxwashdryfold.com` → `len=25585`, portal `UP`.
  - Expected: `active`, `GET / code=200 len=27477`, `partner_marker=1`, `health={"status":"ok"}`,
    `GET /austin-tx/ code=404`, portal `{"status":"UP",…}`, and the two guard lines as stated.

- [ ] **Step 2b: Full per-host probe set on BOTH boxes.** As A6 Step 2b with `H=rundberglaundry.com`.
  - Expected: both boxes print the POST-FLIP profile from A4 Step 4 verbatim. The `legal_*` and
    `reset` lines matter most on this host (M21/M22/M23): a `legal_*=404` or a `reset` that is not the
    token-preserving 301 is a **roll-back-now** condition.

- [ ] **Step 3: Public check, both boxes agree.** As A6 Step 3 with `H=rundberglaundry.com`.
  - Expected: `"oci-phx" content` + `"oci-phx-ad1" content` = 20, no `portal` row; then
    `{"status":"ok"}` and `public /austin-tx/ code=404`.

- [ ] **Step 4: After-gate (C14-abs + C14-stab).** As A6 Step 4 with `H=rundberglaundry.com`;
      record `HOST_DONE_rundberglaundry.com=yes`.
  - Expected: 4 `PASS AFTER …`, 2 `SPREAD … OK`, `C14 rundberglaundry.com PASS`, `exit=0`.
  - On `FAIL`: roll A8 then A7 back; the host returns to the placeholder. Do not start A9.

---

### Task A9: **HUMAN-CONFIRM** — `atxwashdryfold.com` on **oci1**: before-gate, atomic flip, verify

**Why last, and why this one needs a human:** it is the **canonical host** — `BASE_URL`,
`<link rel="canonical">`, `og:url`, `og:image`, the JSON-LD `url` and the sitemap all point at it
(M18) — it is the only marketing host whose **real content is publicly launched** (M15,
`PARTNER_PUBLIC_HOSTS`), it carries live `/embed-app-v2.html` traffic (M16) that the content app
301s, and its rewrite is the distinct `rewrite ^ /austin-tx/wash-dry-fold/ last;` variant (M4).
It is also the only host where a before/after Lighthouse comparison is meaningful, so **C14-reg
applies here** (D-A3).

**Files:** box only (oci1). Modifies `/etc/nginx/sites-enabled/atxwashdryfold.com`, one atomic
write. Creates `~/nginx-snapshots/atxwashdryfold.com.preflip.<TS>`.

**Interfaces:**
- Consumes: `HOST_DONE_rundberglaundry.com=yes` (A8), `C14_FEASIBLE=yes`, `SNIPPET_READY_oci1=yes`;
  the A1 pre-flight numbers for this host (they are the C14-reg reference).
- Produces: `FLIP_atxwashdryfold.com_oci1=<TS>`, 4 JSON before-gate reports.

**Rollback (exact).**
```bash
IP=161.153.71.201; H=atxwashdryfold.com
EV=/var/www/wavemax/cutover-logs; set -a; . "$EV/plan3-sliceA-record.env"; set +a
V=FLIP_${H}_oci1; TS=${!V}; echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
sudo cp -p ~/nginx-snapshots/$H.preflip.$TS /etc/nginx/sites-enabled/$H
sudo nginx -t && sudo systemctl reload nginx
curl -sk -m 8 -o /dev/null -w 'rolled_back / code=%{http_code} len=%{size_download}\n' --resolve $H:443:127.0.0.1 https://$H/
curl -sk -m 8 -o /dev/null -w 'rolled_back /embed-app-v2.html code=%{http_code}\n' --resolve $H:443:127.0.0.1 https://$H/embed-app-v2.html"
```
- Rollback expected: `TS=<value>`, the two M20 lines, `rolled_back / code=200 len=25585`,
  `rolled_back /embed-app-v2.html code=200`.

- [ ] **Step 0: Assert the previous host finished.**
```bash
IP=161.153.71.201; BOX=oci1; H=atxwashdryfold.com
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; set -a; . "$REC"; set +a
grep -c '^HOST_DONE_rundberglaundry.com=yes$' "$REC"; echo "c14=$C14_FEASIBLE pre404=$PRE404_CLOSED snip=$SNIPPET_READY_oci1"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'echo -n "portal_canonical_now="; curl -s -H "Host: atxwashdryfold.com" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/ | grep -o "canonical\" href=\"[^\"]*\"" | head -1'
```
  - Expected: `1`, then `c14=yes pre404=yes snip=yes`, then
    `portal_canonical_now=canonical" href="https://atxwashdryfold.com/"`.
  - That last line matters here more than anywhere: after A2 the portal and the content app serve the
    **same** canonical for this host, so this flip does not change the canonical value at all (M24).
    If it still reads `rundberglaundry.com`, this flip would move the canonical of the only host with
    indexed equity — **STOP** and land A2 Step 3 first.

- [ ] **Step 1 (HUMAN-CONFIRM): Ask Rick.** Say exactly this:
  > Plan 3 slice A: flipping the **canonical** host `atxwashdryfold.com` to the content app,
  > oci1 first. This is the only marketing host whose real content is public today (25585 B from the
  > portal vs 27477 B from the content app — same page, different app), and the only one where the
  > canonical/og:url/sitemap identity lives. Two visible changes: `/austin-tx/wash-dry-fold/` stops
  > being served (404 — it is a 404 on the content app), and `/embed-app-v2.html`, which gets ~9
  > hits/day here, changes from a 200 to a 301 to the portal. Its `/privacy-policy`,
  > `/terms-and-conditions`, `/terms-of-service` and `/refund-policy` become 301s to the portal
  > instead of being served here. The canonical does **not** change — A2 already moved the portal
  > copy's canonical to `https://atxwashdryfold.com/`, so both apps now serve the same value. The
  > other two hosts are already flipped and green. Rollback is one file copy plus a reload, ~5
  > seconds, per box. Proceed?

  Continue only on an explicit yes.

- [ ] **Step 2: Before-gate through Cloudflare (desktop ×1, mobile ×3) — this one IS the C14-reg reference.**
      Identical to A5 Step 1 with `H=atxwashdryfold.com`.
  - Expected: 4 `BEFORE atxwashdryfold.com …` lines. Unlike the other two hosts these should read
    `accessibility=100 best-practices=100 seo=100`, with `performance=100` desktop and
    `performance=83`-ish mobile before the CLS fix / `>=95` after it (D-A1). Record the exact values;
    C14-reg compares against them.

- [ ] **Step 3: Snapshot and assert the pre-state — note the WDF rewrite variant.**
```bash
IP=161.153.71.201; H=atxwashdryfold.com
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y%m%dT%H%M%SZ'); rec "FLIP_${H}_oci1" "$TS"; echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
sudo cp -p /etc/nginx/sites-enabled/$H ~/nginx-snapshots/$H.preflip.$TS
sudo chown \$(id -un) ~/nginx-snapshots/$H.preflip.$TS
md5sum /etc/nginx/sites-enabled/$H
grep -n 'location = /\|rewrite \^ /austin-tx/wash-dry-fold/\|proxy-node-app.conf' /etc/nginx/sites-enabled/$H"
```
  - Expected: `TS=<value>`, an md5, then exactly three grep lines — `location = / {`,
    `rewrite ^ /austin-tx/wash-dry-fold/ last;`, `include …/proxy-node-app.conf;`.

- [ ] **Step 4: The atomic flip — the same A4 transform (its rewrite pattern covers the WDF variant) — then `nginx -t` before reloading.**
```bash
IP=161.153.71.201; H=atxwashdryfold.com
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
P=/etc/nginx/sites-enabled/$H
test \$(grep -c 'rewrite \^ /austin-tx/wash-dry-fold/ last;' \$P) = 1
B=\$(wc -l < \$P)
sudo perl -0pi ~/plan3-flip-to-content-app.pl \$P
echo \"lines=\$B-\>\$(wc -l < \$P) rewrite_left=\$(grep -c 'rewrite \^ /austin-tx' \$P || true) austin_tx=\$(grep -c austin-tx \$P || true) portal_snippet_left=\$(grep -c proxy-node-app.conf \$P || true) content_snippet=\$(grep -c proxy-content-app.conf \$P) servers=\$(grep -c '^server {' \$P) braces=\$(tr -cd '{' < \$P|wc -c)/\$(tr -cd '}' < \$P|wc -c) mailcow=\$(grep -c 'localhost:8443' \$P) acme=\$(grep -c acme-challenge \$P)\"
sudo nginx -t"
```
  - Expected, exactly (dry-run verified: the WDF file transforms to the same shape as the other two):
    `lines=122->111 rewrite_left=0 austin_tx=0 portal_snippet_left=0 content_snippet=1 servers=5 braces=11/11 mailcow=6 acme=1`,
    then the two M20 lines.

- [ ] **Step 5: Reload and verify oci1, including the two announced behaviour changes.**
```bash
IP=161.153.71.201; H=atxwashdryfold.com
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "sudo systemctl reload nginx && sleep 2 && systemctl is-active nginx
curl -sk -m 8 --resolve $H:443:127.0.0.1 -o /tmp/f.html -w 'GET / code=%{http_code} len=%{size_download}\n' https://$H/
echo -n '  partner_marker='; grep -c 'data-i18n=\"partner.meta.title\"' /tmp/f.html || true
echo -n '  canonical='; grep -o '<link rel=\"canonical\" href=\"[^\"]*\"' /tmp/f.html | head -1
echo \"  health=\$(curl -sk -m 8 --resolve $H:443:127.0.0.1 https://$H/health)\"
curl -sk -m 8 -o /dev/null -w '  /austin-tx/wash-dry-fold/ code=%{http_code}\n' --resolve $H:443:127.0.0.1 https://$H/austin-tx/wash-dry-fold/
curl -sk -m 8 -o /dev/null -w '  /embed-app-v2.html code=%{http_code} -> %{redirect_url}\n' --resolve $H:443:127.0.0.1 https://$H/embed-app-v2.html
curl -sk -m 8 -o /dev/null -w '  /robots.txt code=%{http_code}   ' --resolve $H:443:127.0.0.1 https://$H/robots.txt
curl -sk -m 8 -o /dev/null -w '/sitemap.xml code=%{http_code}\n' --resolve $H:443:127.0.0.1 https://$H/sitemap.xml
curl -sk -m 8 --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/health; echo"
```
  - Expected: `active`, `GET / code=200 len=27477`, `partner_marker=1`,
    `canonical=<link rel="canonical" href="https://atxwashdryfold.com/"`,
    `health={"status":"ok"}`, `/austin-tx/wash-dry-fold/ code=404`,
    `/embed-app-v2.html code=301 -> https://portal.atxwashdryfold.com/embed-app-v2.html`,
    `/robots.txt code=200   /sitemap.xml code=200`, portal `{"status":"UP",…}`.
  - `robots.txt` and `sitemap.xml` are asserted here and nowhere else because this is the canonical
    host: a 404 on either would be an immediate SEO regression. Both are 200 on `:3001` (M8).

- [ ] **Step 6: Verify oci2 untouched, then the public attributed check.**
```bash
H=atxwashdryfold.com
ssh -i ~/.ssh/oci_wavemax ubuntu@144.24.4.202 "
grep -c 'proxy-node-app.conf' /etc/nginx/sites-enabled/$H
curl -sk -m 8 -o /dev/null -w 'oci2 / code=%{http_code} len=%{size_download}\n' --resolve $H:443:127.0.0.1 https://$H/"
for i in $(seq 1 20); do
  curl -s -m 15 -D- -o /tmp/cf.html "https://$H/?p=$(date +%s)-$i" \
    | awk 'tolower($1)=="x-origin-box:"{b=$2} END{printf "%s", b}' | tr -d '\r'
  printf ' %s\n' "$(grep -qc 'data-i18n="partner.meta.title"' /tmp/cf.html && echo content || echo portal)"
done | sort | uniq -c
```
  - Expected: `1`, `oci2 / code=200 len=25585`, then `"oci-phx" content` and
    `"oci-phx-ad1" portal` summing to 20.
  - **Note:** on this host both apps serve a near-identical page, so `partner_marker` cannot
    distinguish them through CF. The marker check here proves only that a content page is served;
    the authoritative per-box proof is the on-box `len=27477` (content) vs `len=25585` (portal) in
    Step 5 and this step's oci2 line.

---

### Task A10: `atxwashdryfold.com` on **oci2** — flip, verify, after-gate with C14-reg; every configured marketing host on `:3001`

**Files:** box only (oci2). Modifies `/etc/nginx/sites-enabled/atxwashdryfold.com`, one atomic
write. Creates `~/nginx-snapshots/atxwashdryfold.com.preflip.<TS>` on oci2.

**Interfaces:**
- Consumes: `FLIP_atxwashdryfold.com_oci1` (A9), `SNIPPET_READY_oci2=yes`, the A9 Step 2 before-gate
  numbers (C14-reg reference).
- Produces: `FLIP_atxwashdryfold.com_oci2=<TS>`, `HOST_DONE_atxwashdryfold.com=yes`,
  `ALL_HOSTS_FLIPPED=yes` — the brief's exit criterion 1. The brief says "all **four** marketing
  hosts"; there are only **three** with an nginx config. The fourth, `runberglaundry.com`, has no
  `sites-enabled` file and reaches the origin only as the implicit default server's 301 to
  `atxwashateria.com` (D-2, M3, D-A6) — so it is served by `:3001` transitively once
  `atxwashateria.com` is flipped, with nothing of its own to flip. A10 Step 3 proves that.
- Starts immediately after A9 Step 6 passes.

**Rollback (exact).** As A6's, with `H=atxwashdryfold.com`, `IP=144.24.4.202`.
- Rollback expected: `TS=<value>`, the two M20 lines, `oci2 rolled_back / code=200 len=25585`.

- [ ] **Step 0: Assert A9 completed.** As A6 Step 0 with `H=atxwashdryfold.com`.
  - Expected: `oci1_flip=<TS> snip_oci2=yes`.

- [ ] **Step 1: Snapshot, assert the WDF pre-state, flip, `nginx -t`.**
```bash
IP=144.24.4.202; H=atxwashdryfold.com
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y%m%dT%H%M%SZ'); rec "FLIP_${H}_oci2" "$TS"; echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
P=/etc/nginx/sites-enabled/$H
sudo cp -p \$P ~/nginx-snapshots/$H.preflip.$TS; sudo chown \$(id -un) ~/nginx-snapshots/$H.preflip.$TS
test \$(grep -c 'rewrite \^ /austin-tx/wash-dry-fold/ last;' \$P) = 1
test \$(grep -c 'proxy-node-app.conf' \$P) = 1
B=\$(wc -l < \$P)
sudo perl -0pi ~/plan3-flip-to-content-app.pl \$P
echo \"lines=\$B-\>\$(wc -l < \$P) rewrite_left=\$(grep -c 'rewrite \^ /austin-tx' \$P || true) austin_tx=\$(grep -c austin-tx \$P || true) content_snippet=\$(grep -c proxy-content-app.conf \$P) servers=\$(grep -c '^server {' \$P) braces=\$(tr -cd '{' < \$P|wc -c)/\$(tr -cd '}' < \$P|wc -c) mailcow=\$(grep -c 'localhost:8443' \$P) acme=\$(grep -c acme-challenge \$P)\"
sudo nginx -t"
```
  - Expected: `TS=<value>`, then
    `lines=122->111 rewrite_left=0 austin_tx=0 content_snippet=1 servers=5 braces=11/11 mailcow=6 acme=1`,
    then the two M20 lines.

- [ ] **Step 2: Reload and verify oci2, then assert the whole-box end state on BOTH boxes.**
```bash
for IP in 144.24.4.202 161.153.71.201; do
  echo "##### $IP"
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "
[ $IP = 144.24.4.202 ] && { sudo systemctl reload nginx; sleep 2; }
systemctl is-active nginx
echo -n '  content_snippet_hosts='; grep -l 'proxy-content-app.conf' /etc/nginx/sites-enabled/* | wc -l
echo -n '  portal_snippet_hosts=';  grep -l 'proxy-node-app.conf'    /etc/nginx/sites-enabled/* | wc -l
echo -n '  portal_snippet_is_portal_only='; grep -l 'proxy-node-app.conf' /etc/nginx/sites-enabled/* | xargs -n1 basename | paste -sd,
echo -n '  austin_tx_rewrites_left='; grep -c 'austin-tx' /etc/nginx/sites-enabled/* | grep -v ':0' | wc -l
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com; do
  printf '  %-22s / -> %s  /austin-tx -> %s  /health -> %s\n' \$H \
    \"\$(curl -sk -m 8 -o /dev/null -w 'code=%{http_code} len=%{size_download}' --resolve \$H:443:127.0.0.1 https://\$H/)\" \
    \"\$(curl -sk -m 8 -o /dev/null -w '%{http_code}' --resolve \$H:443:127.0.0.1 https://\$H/austin-tx/)\" \
    \"\$(curl -sk -m 8 --resolve \$H:443:127.0.0.1 https://\$H/health)\"
done
printf '  %-22s /health -> %s\n' portal.atxwashdryfold.com \"\$(curl -sk -m 8 --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/health)\"
printf '  %-22s /health -> %s\n' crhsent.com \"\$(curl -sk -m 8 --resolve crhsent.com:443:127.0.0.1 https://crhsent.com/health)\""
done
```
  - Expected, on **both** boxes:
    - `active`
    - `content_snippet_hosts=3`, `portal_snippet_hosts=1`,
      `portal_snippet_is_portal_only=portal.atxwashdryfold.com`
    - `austin_tx_rewrites_left=0`
    - all three marketing hosts `/ -> code=200 len=27477  /austin-tx -> 404  /health -> {"status":"ok"}`
    - `portal.atxwashdryfold.com /health -> {"status":"UP",…}` — brief exit criterion 1's second half
    - `crhsent.com /health -> {"status":"ok"}` — unchanged, its own inline `:3001` block (M5)

- [ ] **Step 2b: Full per-host probe set for all three hosts on BOTH boxes — the slice's end-state proof.**
```bash
for IP in 161.153.71.201 144.24.4.202; do
  for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com; do
    echo "##### $IP $H"; ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "bash ~/plan3-verify-host.sh $H"
  done
done
```
  - Expected: **six** identical POST-FLIP profiles (A4 Step 4), differing only in the `host=` line.
  - This is the single output that demonstrates brief exit criteria 1 and 5 together: every marketing
    host on `:3001`, no `/austin-tx/`, one canonical, no legal-page 404s, password reset intact, and
    the portal and crhsent.com untouched.

- [ ] **Step 3: Public attributed check on all three hosts — no `portal` row anywhere.**
```bash
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com; do
  echo "##### $H"
  for i in $(seq 1 12); do
    curl -s -m 15 -D- -o /tmp/cf.html "https://$H/health?p=$(date +%s)-$i" \
      | awk 'tolower($1)=="x-origin-box:"{b=$2} END{printf "%s", b}' | tr -d '\r'
    printf ' %s\n' "$(grep -q '"status":"ok"' /tmp/cf.html && echo content || echo portal)"
  done | sort | uniq -c
done
```
  - Expected per host: exactly two groups, `"oci-phx" content` and `"oci-phx-ad1" content`, summing
    to 12. `/health` is used rather than `/` because it is the unambiguous app discriminator (M9) and
    is identical on both boxes once flipped.
```bash
# The fourth host in the brief's count: it has no config and is served transitively (D-2, D-A6).
curl -s -o /dev/null -w 'runberglaundry.com / -> code=%{http_code} loc=%{redirect_url}\n' -m 15 "https://runberglaundry.com/?p=$(date +%s)"
curl -s -m 15 "https://runberglaundry.com/health?p=$(date +%s)" -L | head -c 40; echo
```
  - Expected: `runberglaundry.com / -> code=301 loc=https://atxwashateria.com/?p=<ts>` (measured
    2026-09-20 — unchanged by the flips, because the 301 comes from the implicit default server block,
    not from either app), then `{"status":"ok"}` after following the redirect — i.e. the typo host now
    lands on the content app, satisfying the brief's "four hosts" with nothing of its own to flip.

- [ ] **Step 4: After-gate — C14-abs, C14-stab and C14-reg (this host only).**
```bash
EV=/var/www/wavemax/cutover-logs; OUT=$EV/lighthouse; set -a; . "$EV/plan3-sliceA-record.env"; set +a
H=atxwashdryfold.com; FLAGS='--headless=new --no-sandbox --disable-dev-shm-usage'
CHROME_PATH=/opt/google/chrome/chrome npx --yes lighthouse "https://$H/?lh=$(date +%s)" --preset=desktop \
  --output=json --output-path="$OUT/p3-after-$H-desktop-1-$LH_DATE.json" --chrome-flags="$FLAGS" --quiet
for N in 1 2 3; do
  CHROME_PATH=/opt/google/chrome/chrome npx --yes lighthouse "https://$H/?lh=$(date +%s)" --form-factor=mobile \
    --screenEmulation.mobile=true --output=json --output-path="$OUT/p3-after-$H-mobile-$N-$LH_DATE.json" \
    --chrome-flags="$FLAGS" --quiet
done
node -e '
const fs=require("fs"),d=process.argv[1],h=process.argv[2],dir=process.argv[3];
const cats=["performance","accessibility","best-practices","seo"];
const rd=(p,ff,n)=>{const c=JSON.parse(fs.readFileSync(`${dir}/p3-${p}-${h}-${ff}-${n}-${d}.json`,"utf8")).categories;
  return Object.fromEntries(cats.map(k=>[k,Math.round(c[k].score*100)]));};
let fail=0;
for(const [ff,ns] of [["desktop",[1]],["mobile",[1,2,3]]]){
  const perf=[]; const before=rd("before",ff,1);
  for(const n of ns){
    const s=rd("after",ff,n); perf.push(s.performance);
    const abs=cats.every(k=>s[k]>=95);
    const reg=cats.filter(k=>s[k]<before[k]);
    if(!abs)fail++; if(reg.length)fail++;
    console.log(`${abs&&!reg.length?"PASS":"FAIL"} AFTER ${h} ${ff} run${n} `+cats.map(k=>k+"="+s[k]).join(" ")
      +(reg.length?" REGRESSED="+reg.map(k=>k+":"+before[k]+"->"+s[k]).join(","):""));
  }
  const sp=Math.max(...perf)-Math.min(...perf);
  console.log(`SPREAD ${h} ${ff} perf=${perf.join(",")} spread=${sp} ${sp<=3?"OK":"TOO_NOISY"}`);
  if(sp>3)fail++;
}
console.log(`C14 ${h} `+(fail?"FAIL fails="+fail:"PASS"));
process.exit(fail?1:0)' "$LH_DATE" "$H" "$OUT" | tee -a "$EV/p3-lh-$H.txt"
echo "exit=${PIPESTATUS[0]}"
```
  - Expected: 4 `PASS AFTER …` lines with no `REGRESSED=`, 2 `SPREAD … OK`,
    `C14 atxwashdryfold.com PASS`, `exit=0`.
  - Any `REGRESSED=` is a C14-reg failure on the canonical host: roll A10 then A9 back and escalate.

- [ ] **Step 5: Record the slice's core exit state.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env
printf '%s=%q\n' "HOST_DONE_atxwashdryfold.com" yes >> "$REC"
printf '%s=%q\n' "ALL_HOSTS_FLIPPED" yes >> "$REC"
grep -c '^HOST_DONE_.*=yes$' "$REC"
```
  - Expected: `3`.

---

### Task A11: Complete R-3 — `X-Forwarded-Host $host` on the remaining two proxy paths

**Files:** box only, per box:
- Modifies `/etc/nginx/snippets/proxy-node-app.conf` — adds one `proxy_set_header X-Forwarded-Host $host;`
  line. After A10 this snippet serves **only** `portal.atxwashdryfold.com` (A10 Step 2:
  `portal_snippet_is_portal_only`), so D-1's hazard no longer applies — but the `proxy_pass` target
  is still not touched.
- Modifies `/etc/nginx/sites-enabled/crhsent.com` — adds the same line to its inline `:3001`
  `location /` (M5: it does not include either snippet).

**Interfaces:**
- Consumes: `ALL_HOSTS_FLIPPED=yes` (A10); R-3 (`accessGate:90` reads `X-Forwarded-Host` directly;
  `mediatorGate:61` and `crhsentHandler:20` read it via `req.hostname` + trust proxy).
- Produces: `XFH_DONE_<box>=yes`. Every proxy path on both boxes now **overwrites** any
  client-supplied `X-Forwarded-Host` with the real `Host`, so a forged header can no longer reach
  either app through any route. The content snippet already carries it (A4 Step 2).
- This runs **after** all flips so that a flip rollback never has to contend with a snippet change,
  and so the portal snippet is edited when exactly one host depends on it.

**Rollback (exact).** Byte-exact snapshot restore — no reverse regex.
```bash
BOX=oci1; IP=161.153.71.201        # or BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; set -a; . "$EV/plan3-sliceA-record.env"; set +a
V=TS_$BOX; TS=${!V}; echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
sudo cp -p ~/nginx-snapshots/proxy-node-app.conf.xfh.$TS /etc/nginx/snippets/proxy-node-app.conf
sudo cp -p ~/nginx-snapshots/crhsent.com.xfh.$TS /etc/nginx/sites-enabled/crhsent.com
sudo nginx -t && sudo systemctl reload nginx
grep -c 'X-Forwarded-Host' /etc/nginx/snippets/proxy-node-app.conf /etc/nginx/sites-enabled/crhsent.com || true
curl -sk -m 8 --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/health"
```
- Rollback expected: `TS=<value>`, the two M20 lines, then
  `/etc/nginx/snippets/proxy-node-app.conf:0` and `/etc/nginx/sites-enabled/crhsent.com:0`, then
  `{"status":"UP",…}`.
- The content snippet keeps its `X-Forwarded-Host` (it is part of A4, not A11) — rolling A11 back
  leaves the three flipped hosts protected and only the portal and crhsent.com unprotected, i.e. the
  pre-A10 state.

- [ ] **Step 0: Set the box and assert the flips are done.**
```bash
BOX=oci1; IP=161.153.71.201        # Pass 2: BOX=oci2; IP=144.24.4.202
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; set -a; . "$REC"; set +a
echo "BOX=$BOX all_flipped=$ALL_HOSTS_FLIPPED"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "grep -l 'proxy-node-app.conf' /etc/nginx/sites-enabled/* | xargs -n1 basename"
```
  - Expected: `BOX=oci1 all_flipped=yes`, then exactly `portal.atxwashdryfold.com`.

- [ ] **Step 1: Install `~/plan3-add-xfh.pl`.** It edits only a proxy block that *both* sets
      `Host $host` *and* targets a local Node app, so the Mailcow `proxy_pass https://localhost:8443`
      blocks — which also set `Host $host` — are never touched. Idempotent.
```bash
BOX=oci1; IP=161.153.71.201
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "tee ~/plan3-add-xfh.pl >/dev/null" <<'PERL'
# Plan 3 slice A — R-3: make nginx overwrite any client-supplied X-Forwarded-Host.
# Run as: sudo perl -0pi ~/plan3-add-xfh.pl <file>
# Splits the file on `location` boundaries and edits only a block that proxies to a
# LOCAL NODE APP (http://localhost:3000, :3001, or http://content_app). The Mailcow
# blocks (proxy_pass https://localhost:8443) also set `Host $host` and must not be
# touched -- which is why this is a guarded block walk, not a global substitution.
# Idempotent: a block that already carries the header is skipped.
my @out;
for my $blk (split /(?=\n[ \t]*location )/, $_) {
  if ($blk =~ m{proxy_pass http://(?:localhost:300[01]|content_app)}
      && $blk =~ m{\n([ \t]*)proxy_set_header Host \$host;}
      && $blk !~ m{X-Forwarded-Host}) {
    $blk =~ s{(\n([ \t]*)proxy_set_header Host \$host;)}{$1\n$2proxy_set_header X-Forwarded-Host \$host;};
  }
  push @out, $blk;
}
$_ = join '', @out;
PERL
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "perl -c ~/plan3-add-xfh.pl 2>&1 | tail -1"
```
  - Expected: `/home/ubuntu/plan3-add-xfh.pl syntax OK`.

- [ ] **Step 2: Snapshot, apply to both files, `nginx -t` before reloading.**
```bash
BOX=oci1; IP=161.153.71.201
EV=/var/www/wavemax/cutover-logs; set -a; . "$EV/plan3-sliceA-record.env"; set +a; V=TS_$BOX; TS=${!V}
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
sudo cp -p /etc/nginx/snippets/proxy-node-app.conf ~/nginx-snapshots/proxy-node-app.conf.xfh.$TS
sudo cp -p /etc/nginx/sites-enabled/crhsent.com ~/nginx-snapshots/crhsent.com.xfh.$TS
sudo chown \$(id -un) ~/nginx-snapshots/*.xfh.$TS
for P in /etc/nginx/snippets/proxy-node-app.conf /etc/nginx/sites-enabled/crhsent.com; do
  B=\$(wc -l < \$P)
  sudo perl -0pi ~/plan3-add-xfh.pl \$P
  echo \"\$(basename \$P) lines=\$B-\>\$(wc -l < \$P) xfh=\$(grep -c X-Forwarded-Host \$P) mailcow_xfh=\$(awk '/localhost:8443/,0' \$P | grep -c X-Forwarded-Host || true)\"
done
sudo nginx -t"
```
  - Expected, exactly (dry-run verified 2026-09-20):
    - `proxy-node-app.conf lines=14->15 xfh=1 mailcow_xfh=0`
    - `crhsent.com lines=94->95 xfh=1 mailcow_xfh=0`
    - then the two M20 lines.
  - Any `mailcow_xfh` above `0`, or an `xfh` above `1`, means the guard failed: run the Rollback.

- [ ] **Step 3: Reload and verify both apps still answer, and that a forged header cannot win.**
```bash
IP=161.153.71.201
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "sudo systemctl reload nginx && sleep 2 && systemctl is-active nginx
echo -n 'portal: '; curl -sk -m 8 --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/health; echo
echo -n 'crhsent: '; curl -sk -m 8 --resolve crhsent.com:443:127.0.0.1 https://crhsent.com/health; echo
echo -n 'forged XFH on crhsent (must behave as crhsent, not as a marketing host): '
curl -sk -m 8 -o /dev/null -w 'code=%{http_code}\n' -H 'X-Forwarded-Host: atxwashdryfold.com' --resolve crhsent.com:443:127.0.0.1 https://crhsent.com/
echo -n 'forged XFH on a flipped host: '
curl -sk -m 8 -o /dev/null -w 'code=%{http_code} len=%{size_download}\n' -H 'X-Forwarded-Host: crhsent.com' --resolve atxwashateria.com:443:127.0.0.1 https://atxwashateria.com/"
```
  - Expected: `active`; `portal: {"status":"UP",…}`; `crhsent: {"status":"ok"}`;
    `forged XFH on crhsent … code=401` (the accessGate still applies — the forged header did not
    turn crhsent.com into a marketing host); `forged XFH on a flipped host: code=200 len=27477`
    (the forged header did not turn a marketing host into crhsent.com, which would have been a 401).

- [ ] **Step 4: Pass 2 and parity.** Repeat Steps 0–3 with `BOX=oci2; IP=144.24.4.202`, then:
```bash
for IP in 161.153.71.201 144.24.4.202; do
  ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "md5sum /etc/nginx/snippets/proxy-node-app.conf /etc/nginx/snippets/proxy-content-app.conf /etc/nginx/conf.d/content-app-upstream.conf; grep -c 'X-Forwarded-Host' /etc/nginx/sites-enabled/crhsent.com"
done | awk '{print $1}' | sort | uniq -c
EV=/var/www/wavemax/cutover-logs; for B in oci1 oci2; do printf '%s=%q\n' "XFH_DONE_$B" yes >> "$EV/plan3-sliceA-record.env"; done
```
  - Expected: four lines each beginning with `2` — three identical md5s across the boxes plus the
    identical `1` count for `crhsent.com`.

---

### Task A12: **HUMAN-CONFIRM** — close the CF failover gap (brief item 20): record the peer-fallback rejection, tighten the monitor

**Files:**
- No nginx file changes. The nginx half of item 20 already shipped in A4 Step 2
  (`error_page 502 504 = @content_unavailable` → `503` + `Retry-After: 30`), which is why it is
  "same file and reload as the flips" in the only sense that is implementable.
- Modifies one Cloudflare LB monitor (`be6953d2`) via the API. No file on any box is touched.
- Writes the decision record to `/var/www/wavemax/cutover-logs/p3-item20-decision.txt`.

**Interfaces:**
- Consumes: M11 (no network path between the boxes), M12 (one pool, one monitor, five LBs),
  M13 (`/health/origin` is composite and deliberately pulls the whole box), `ALL_HOSTS_FLIPPED=yes`,
  `~/.cf_api_token` (an **account**-owned `cfat_` token — verify via
  `/accounts/{id}/tokens/verify`, never `/user/tokens/verify`).
- Produces: `ITEM20_DECISION`, `MONITOR_BEFORE`, `MONITOR_AFTER` in the record.

**The decision, with the numbers.**

*Rejected — nginx `upstream … backup` to the peer box's `:3001`.* The brief proposes it; measured, it
is not an nginx-only change and it is a bad trade:
- M11: from oci2, `10.0.1.54` is unreachable by ICMP and TCP `:22`/`:443`/`:3001`; `161.153.71.201:443`
  and `:3001` are likewise closed. Origin `:443` accepts Cloudflare ranges only (M10). Enabling the
  fallback needs an OCI VCN security-list ingress rule **and** a persisted `iptables` rule on both
  boxes — three changes across two control planes, none of them nginx.
- What it would buy: the content app reachable over **plaintext HTTP, unauthenticated, bypassing
  Cloudflare, the CF WAF and rate limiting**, to cover ~1–2 min per incident.
- What it is worth: measured real human traffic on the three flipped hosts is 39 + 23 + 26 = **88
  `/` hits per day** (M14).
- And it does not even address the worse measured case: a full box reboot (~10–20 s of public 502 on
  crhsent.com and the portal) takes that box's nginx down too, so an nginx-level fallback is inert.
- It also fights M13 by design: `/health/origin` would still report `content: DOWN` and CF would
  still pull the box, so the fallback would serve traffic only during the very window CF is closing.

*Adopted — (a) the graceful 503 already in A4, and (b) tighten the monitor.* Detection today is
`interval=60` + `retries=2` + `timeout=5` (M12) → up to ~70 s before the pool state changes, then
per-PoP propagation: exactly the measured 1–2 min. `interval=30, retries=1` cuts detection to ~35 s
with no new attack surface and no new network path.
- Load arithmetic, so this is a decision and not a guess: the oci1 portal access log shows **7829
  `/health/origin` probes in ~10 min** (M14 method) ≈ 13/s at `interval=60`, from ~780 probing PoPs.
  `interval=30` doubles that to ≈26/s. Each probe makes one 1 s-timeout sub-fetch to `:3001`
  (M13), so the added cost is ~13 extra local HTTP round trips per second on each box. That is
  acceptable; `interval=15` (≈52/s) is not recommended.

**Rollback (exact).** Restore the monitor's three fields from the recorded before-state.
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; set -a; . "$REC"; set +a
TOK=$(tr -d '\n' < ~/.cf_api_token); ACC=b69ef162d008b11492296d3b35cad2fe; MON=be6953d2
echo "restoring to: $MONITOR_BEFORE"
curl -s -X PATCH -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  "https://api.cloudflare.com/client/v4/accounts/$ACC/load_balancers/monitors/$MON" \
  --data '{"interval":60,"retries":2,"timeout":5}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.success?`restored interval=${j.result.interval} retries=${j.result.retries} timeout=${j.result.timeout}`:JSON.stringify(j.errors))})'
```
- Rollback expected: `restored interval=60 retries=2 timeout=5`.
- The A4 graceful-503 half is rolled back only by A4's own Rollback (it is part of the snippet).

- [ ] **Step 0: Load the record, verify the token the right way, and capture the before-state.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; set -a; . "$REC"; set +a
rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
TOK=$(tr -d '\n' < ~/.cf_api_token); ACC=b69ef162d008b11492296d3b35cad2fe; MON=be6953d2
curl -s -H "Authorization: Bearer $TOK" "https://api.cloudflare.com/client/v4/accounts/$ACC/tokens/verify" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("token="+(j.success?j.result.status:"INVALID"))})'
B=$(curl -s -H "Authorization: Bearer $TOK" "https://api.cloudflare.com/client/v4/accounts/$ACC/load_balancers/monitors/$MON" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=JSON.parse(s).result;console.log(`path=${m.path} host=${m.header.Host[0]} interval=${m.interval} timeout=${m.timeout} retries=${m.retries} codes=${m.expected_codes}`)})')
rec MONITOR_BEFORE "$B"; echo "$B"
echo "all_flipped=$ALL_HOSTS_FLIPPED"
```
  - Expected: `token=active`, then exactly
    `path=/health/origin host=portal.atxwashdryfold.com interval=60 timeout=5 retries=2 codes=200`
    (M12), then `all_flipped=yes`.
  - A different monitor shape means M12 has drifted — STOP and re-establish it.

- [ ] **Step 1 (HUMAN-CONFIRM): Ask Rick.** Say exactly this:
  > Plan 3 item 20, the CF failover gap. I am **not** doing the nginx peer-box fallback the brief
  > suggests. Measured: there is no network path between the boxes at all — not ICMP, not :22, not
  > :443, not :3001, even on the shared private subnet — so it would need an OCI security-list rule
  > plus iptables on both boxes, and the result is the content app reachable unauthenticated over
  > plaintext, bypassing Cloudflare, to protect 88 human page views a day. It also would not help
  > the worse case (a full reboot takes that box's nginx down too). Instead: the flips already ship a
  > graceful `503 + Retry-After: 30` in place of a bare nginx 502, and I want to tighten the CF LB
  > monitor from `interval=60, retries=2` to `interval=30, retries=1` — detection drops from ~70 s
  > to ~35 s, no new attack surface. Cost: the monitor's `/health/origin` probe rate doubles from
  > ~13/s to ~26/s per box. Proceed?

  Continue only on an explicit yes.

- [ ] **Step 2: Prove the graceful 503 works, on oci1, without breaking anything.**
  - A `pm2 reload crhs-corporate` is a rolling restart; to see the handler, both workers must be
    briefly absent. `pm2 stop` then `pm2 start` on **oci1 only** does that. oci2 keeps serving, and
    the monitor pulls oci1 within ~70 s — comfortably longer than this probe.
```bash
IP=161.153.71.201
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
pm2 stop crhs-corporate >/dev/null 2>&1
sleep 1
curl -sk -m 8 --resolve atxwashateria.com:443:127.0.0.1 -D- -o /tmp/d.html https://atxwashateria.com/ | grep -iE '^(HTTP/|retry-after|cache-control)' | tr -d '\r'
grep -o '<title>[^<]*</title>' /tmp/d.html
grep -ci 'wavemax\|invite-only' /tmp/d.html || echo 'brand_refs=0'
curl -sk -m 8 --resolve portal.atxwashdryfold.com:443:127.0.0.1 https://portal.atxwashdryfold.com/health; echo
curl -sk -m 8 --resolve portal.atxwashdryfold.com:443:127.0.0.1 -o /dev/null -w 'health/origin code=%{http_code}\n' https://portal.atxwashdryfold.com/health/origin
pm2 start crhs-corporate >/dev/null 2>&1
sleep 3
curl -sk -m 8 -o /dev/null -w 'recovered / code=%{http_code} len=%{size_download}\n' --resolve atxwashateria.com:443:127.0.0.1 https://atxwashateria.com/
pm2 list | grep -c 'crhs-corporate.*online'"
```
  - Expected: `HTTP/1.1 503 Service Unavailable` (not 502), `retry-after: 30`,
    `cache-control: no-store`, `<title>Temporarily unavailable</title>`, `brand_refs=0`,
    then the portal still `{"status":"UP",…}` on `/health` while `health/origin code=503`
    (M13 — the box correctly advertises itself as degraded), then
    `recovered / code=200 len=27477` and `2`.
  - `HTTP/1.1 502` instead of 503 means the `error_page` did not take — A4 Step 2 needs re-checking.
  - Any non-zero `brand_refs` means the old `@maintenance` page is still intercepting: A3 did not
    fully land on this box (D-A7, ordering reason).

- [ ] **Step 3: Tighten the monitor and verify the pool returns to healthy.**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; rec() { printf '%s=%q\n' "$1" "$2" >> "$REC"; }
TOK=$(tr -d '\n' < ~/.cf_api_token); ACC=b69ef162d008b11492296d3b35cad2fe; MON=be6953d2
A=$(curl -s -X PATCH -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  "https://api.cloudflare.com/client/v4/accounts/$ACC/load_balancers/monitors/$MON" \
  --data '{"interval":30,"retries":1}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(!j.success){console.log("ERR "+JSON.stringify(j.errors));process.exit(1)}const m=j.result;console.log(`path=${m.path} host=${m.header.Host[0]} interval=${m.interval} timeout=${m.timeout} retries=${m.retries}`)})')
rec MONITOR_AFTER "$A"; echo "$A"
sleep 90
curl -s -H "Authorization: Bearer $TOK" "https://api.cloudflare.com/client/v4/accounts/$ACC/load_balancers/pools" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s).result)console.log("POOL "+p.name+" enabled="+p.enabled+" origins="+p.origins.map(o=>o.name).join(","))})'
for H in atxwashateria.com rundberglaundry.com atxwashdryfold.com crhsent.com portal.atxwashdryfold.com; do
  printf '%-28s ' "$H"; curl -s -m 15 -D- -o /dev/null "https://$H/?p=$(date +%s)" | grep -iE '^(HTTP/|x-origin-box)' | tr -d '\r' | paste -sd' '
done
```
  - Expected: `path=/health/origin host=portal.atxwashdryfold.com interval=30 timeout=5 retries=1`,
    then `POOL wavemax-oci enabled=true origins=oci1,oci2`, then five host lines all `HTTP/2 200`
    (crhsent.com `HTTP/2 401`) with an `x-origin-box` of either value.
  - The 90 s wait is two full tightened intervals, so oci1 is back in rotation before the check.

- [ ] **Step 4: Write the decision record (the brief's exit criterion 7 — closed, not forgotten).**
```bash
EV=/var/www/wavemax/cutover-logs; REC=$EV/plan3-sliceA-record.env; set -a; . "$REC"; set +a
cat > "$EV/p3-item20-decision.txt" <<EOF
Plan 3 item 20 — CF failover gap. Decided $(date -u +%F).
REJECTED: nginx upstream backup to the peer box's :3001.
  Measured 2026-09-20: no network path between the boxes on any port (ICMP, :22, :443, :3001 all
  closed, private subnet 10.0.1.0/24 and public). Would require an OCI VCN security-list ingress
  rule + persisted iptables on both boxes: 3 changes across 2 control planes, not nginx-only.
  Would expose the content app unauthenticated over plaintext, bypassing Cloudflare and its WAF,
  to protect 88 human page views/day. Inert for the worse case (a full reboot kills that box's
  nginx too).
ADOPTED (a): graceful degradation in snippets/proxy-content-app.conf —
  error_page 502 504 -> @content_unavailable -> 503 + Retry-After: 30 + no-store, unbranded.
  Proven on oci1 with pm2 stop/start (A12 Step 2).
ADOPTED (b): CF LB monitor be6953d2 tightened.
  before: $MONITOR_BEFORE
  after:  $MONITOR_AFTER
  Detection ~70s -> ~35s. Probe cost ~13/s -> ~26/s per box. interval=15 rejected (~52/s).
NOT ADOPTED and NOT needed: changing /health/origin. It is composite by design (server.js:445) and
  correctly pulls the whole box; the graceful 503 covers the propagation window it leaves open.
EOF
printf '%s=%q\n' ITEM20_DECISION "graceful-503+monitor-30s; peer-fallback rejected" >> "$REC"
wc -l < "$EV/p3-item20-decision.txt"
```
  - Expected: `20`.

---

## Slice A exit state

| Brief item | Closed by | Evidence |
|:--|:--|:--|
| A.1 second snippet + per-host include swap, one at a time | A4, A5–A10 | `content_snippet_hosts=3`, `portal_snippet_is_portal_only=portal.atxwashdryfold.com` |
| A.2 `/austin-tx/` rewrite removed atomically with each flip | A5/A7/A9 Step 3–4, A6/A8/A10 Step 1 | `rewrite_left=0` asserted **before** every reload; `austin_tx_rewrites_left=0` on both boxes |
| A.3 per-host Lighthouse before + after through CF | A1, A5/A7/A9 (before), A6/A8/A10 (after) | `p3-lh-<host>.txt`; C14-abs / C14-stab / C14-reg per D-A3 |
| A.4 `X-Forwarded-Host $host` | A4 Step 2 (content path), A11 (portal + crhsent) | forged-header probes return 401 / 200 as appropriate |
| nginx access-gate decision | A3 | `nginx -T \| grep -c 'access_allowed\|public_path\|@maintenance'` = `0` on both boxes |
| item 20 CF failover gap | A4 Step 2 + A12 | `p3-item20-decision.txt`; `interval=30 retries=1` |
| legal pages 404 after each flip (cross-slice #3) | A2 + every flip task's probe set | four `legal_*=301/https://portal.atxwashdryfold.com/<path>` lines per host per box |
| portal landing's cross-origin scripts (cross-slice #2) | A2 Steps 3 + 5 | `m22_cross_origin_script_refs=0`; browser check `bp=100 console_errors=0`, both scripts `status=200` on the portal origin |
| password reset (cross-slice #1) | A2 Step 4 + every flip task | `reset=301/…token=ABC123def456…` — measured, not assumed (D-A8) |
| transient canonical loop | A2 Step 3 | `m24_portal_canonical=…atxwashdryfold.com/` before the rundberglaundry flip |

**Escalations for the controller (recorded, not silently dropped):**
1. **Blocking:** the content-app CLS fix (D-A1). A1 fails today; A5 cannot start until it lands.
   `big-shoulders-display-latin.woff2` is not preloaded — a `crhs-corporate` change.
1b. **Blocking:** A2's two commits (corporate `EXACT_PATHS` + the four portal HTML lines). They are
   app changes, so slice A owns the requirement and the assertion but not the merge or the deploy.
6. **Confirmed live on a marketing host, not just the portal** — brief item 16. The `:3000`-served
   `atxwashdryfold.com` page carries `<meta name="csp-nonce" content="">`, i.e. the `injectNonce`
   duplicate-attribute bug reading empty client-side. The `:3001` copy is correct
   (`content="IrES8QPi/SAQJeQpfLzKqw=="`), so **each flip incidentally fixes it for that host** and the
   residual exposure after slice A is the portal only. Slice D still needs the web-core fix plus its
   regression test; recorded here because the flip changes the blast radius.
7. Stale brand identifiers in the **portal's** copy of the landing page, left deliberately unchanged
   because the page is being retired and they are not canonical signals: `partner-program.html:18`
   (`og:url`), `:19`/`:23` (`og:image`), `:34`/`:36`/`:52` (JSON-LD `url` / `name` / `provider`) all
   still say `rundberglaundry.com` / "Rundberg Laundry". Only `:10`'s canonical is moved (A2, M24).
   The content app's copy is already correct. Flag for whoever retires the portal copy.
8. `server.js:245-251` `APP_LOCATION_ORIGINS` still lists `https://rundberglaundry.com` and
   `https://runberglaundry.com`. A2 removes the only two things that loaded from there, so the entries
   are candidates for deletion — but `affiliate-landing-embed.html:8` also has
   `connect-src … https://rundberglaundry.com` in a page-level CSP. Both belong to whoever owns the
   portal's CSP, not to slice A.
2. Whether Plan 3 should add a versioned `deploy/nginx/` tree, since nginx config is unversioned and
   "the same commit" is otherwise unimplementable (D-A4). Exit criterion "clean deployment" argues
   yes; it is a scope decision.
3. The implicit `default_server` is whichever site file sorts first (D-A6). Latent fragility;
   fixing it would change the live typo host `runberglaundry.com`'s public 301.
4. `/partner-program` returns 200 from the portal's catch-all today and 404 from the content app
   (M8). It was never a real route, so slice A lets it 404 — flagged in case it is indexed.
5. Non-gating, recorded from A1: mobile `uses-responsive-images` wastes 213 KiB
   (`hero-1.webp`, no `srcset`); `uses-long-cache-ttl` flags only Cloudflare's own injected
   `beacon.min.js` and `email-decode.min.js`.
