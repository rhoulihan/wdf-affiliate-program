# Lessons

Patterns learned from corrections and incidents, written as rules to prevent recurrence.

## Git / committing

- **Never `git add -A` / `git add .` in this repo; stage explicit paths or `git add -u`.** (2026-06-20) Two self-inflicted mistakes in one commit sequence: (1) running `git commit` (no pathspec) while doc deletions were already staged folded 35 unrelated deletions into a "fix(tests)" commit; (2) `git add -A` for the docs commit swept in **1983** lighthouse/Chrome-profile junk files — WSL surfaces Windows `C:\Users\rickh\AppData\Local\lighthouse.*` temp profiles as backslash-named entries in the repo root. **Rules:** to build a scoped commit, `git add <explicit files>` then `git commit <those files>` (pathspec on the commit too, so other staged changes don't ride along); for "all tracked edits + deletions" use `git add -u` (never `-A`, which also adds untracked junk); after committing, sanity-check `git show --stat` file count matches intent. The lighthouse temp dirs are now gitignored (`C:\\Users*`, `lighthouse.*`).

## Infrastructure / Mail

- **Re-check `docker-compose.override.yml` memory caps after ANY mailcow version bump.** (2026-05-24 incident) Updating Ultahost mailcow to 2026-05b shipped rspamd 3.14.3, whose hyperscan/TLD compile (10,546 suffixes) needs ~365 MB, but the Feb-6 override capped `rspamd-mailcow` at 256 MB. rspamd OOM-crash-looped (RestartCount 90, `Memory cgroup out of memory ... constraint=CONSTRAINT_MEMCG`), its milter `:9900` never came up, and postfix milter-rejected **all** inbound + outbound mail with `451 4.7.1 Service unavailable` — a ~25 min live outage on the primary mail host. The "ports open + SMTP banner" check I ran post-update did NOT catch it (the banner answers before the milter is consulted). **Rule:** after a mailcow update on a memory-tuned host, (a) `docker inspect <c> --format '{{.State.Status}} {{.RestartCount}}'` on rspamd/sogo/php-fpm, (b) confirm the milter actually answers (`</dev/tcp/rspamd/9900` from the postfix container), and (c) send one real test message through, not just check the banner.

- **Validate the FULL path, not the listener.** The mail outage surfaced only because I ran an end-to-end relay *send* test, not a port check. Always prove a service with a real transaction through it.

- **mailcow relayhost on a bare IP + submission 587 needs an explicit TLS policy override.** postfix-tlspol resolves a bare-IP destination to no-DANE/no-MTA-STS → `none` → plaintext, but submission requires STARTTLS (`530 Must issue STARTTLS first`). Insert `tls_policy_override` dest=`<ip>` and `<ip>:587` policy=`encrypt`.

- **Don't store secrets with special chars through layered escaping; use exact bytes.** The mailcow API mangled the relay password (extra backslash) → `535 auth failed`. Fixed with `UPDATE relayhosts SET password = UNHEX('<hex>')` — hex round-trips any bytes with zero escaping. Verify by comparing `HEX(stored)` to the source hex (no plaintext in logs/context).

- **mailcow API from the docker host is seen as the bridge gateway IP** (`172.22.1.1`), not `127.0.0.1`. An API key's `allow_from` must include `172.22.1.1` (or `skip_ip_check=1`) for host-side curl to work. The `api` table column is `access` (enum ro/rw), not `rw`.

## Performance / caching

- **`saveUninitialized:true` + a long session TTL + a busy health-checker + a DB with no TTL sweep = unbounded session bloat that degrades the whole site over days.** (2026-05-25, the "site is slow / degrades over time" incident — the worst self-inflicted one yet.) Symptom: every page felt slow and got slower over time; a `pm2 reload` gave brief relief. Origin tested fast in isolation (5ms). Root cause: the Cloudflare **Load Balancer health monitor hits `/health` ~11/sec across both boxes (1,984 of every 2,000 origin requests were health checks)**, and `express-session` with **`saveUninitialized:true` mints + stores a session on EVERY request** (including each health check). The store is **connect-mongo on Oracle ADB, which does NOT run the MongoDB TTL sweep** — so with a **24-hour `sessionMaxAge`** the `sessions` collection grew **~1M/day to ~2 million docs**; session reads/writes (and the connect-mongo pool, capped at 3) bogged down → site-wide slowness that worsened as it grew. **Fixes:** (1) drop `sessionMaxAge` to a tight value (10 min, inactivity-based via `touchAfter < TTL`); (2) `connect-mongo autoRemove:'interval'` with a short `autoRemoveInterval` (it self-purges with a `deleteMany({expires:$lt:now})` since ADB ignores the TTL index); (3) handle `/health` BEFORE the session middleware so the LB health monitor (≈99% of origin traffic) mints **zero** sessions — the single biggest reduction; the collection then holds only real-user sessions. Bounds it to ~minutes-of-traffic instead of millions. **Two sharp traps:** (a) **NEVER `drop()` a connect-mongo collection on ADB to "purge" — ADB cannot auto-recreate it via upsert** (`ORA: change of _id` on every session write → new visitors 502 while affinity-pinned users still work, so it looks "up" to you). Recreate it explicitly (`createCollection` + the `_id` index is automatic; `createIndex` may hit `ORA-00054` table-lock on a live collection, which is fine to skip at small scale). Prefer `deleteMany({expires:$lt:now})` over `drop()`. (b) The bloat dragged even **Google PSI** down (Perf 81→100 after the purge) — a server-side DB problem masquerading as a front-end perf score. Diagnostic that cracked it: count the session collection + read the request-mix in the access log (health-check UA share).

- **Cloudflare "Browser Cache TTL: Respect Existing Headers" un-caches HTML that a fixed TTL was force-caching.** (2026-05-24) The franchise zones ran Browser-Cache-TTL=14400, which made Cloudflare edge-cache even the *HTML* host/iframe pages (they carry a session cookie + short/no-cache headers). Flipping to "respect existing headers" so the immutable asset header would pass through ALSO stopped CF caching those HTML pages → every page load became a live Phoenix origin round-trip → site-wide "snappy before, slow now." The origin tested fast the whole time (idle host, ~20ms local render); the regression was purely the CF edge no longer serving HTML from cache. **Rule:** before flipping Browser-Cache-TTL to respect-existing, confirm the HTML pages have a deliberate cache story (they didn't — they relied on the blunt 14400 force-cache). Assets cache fine under 14400 too, so the flip bought little and cost much.

- **Re-apply a bundled optimization ONE change at a time when it's reported as a regression.** A 6-in-1 perf commit was reported as slower; reverting the whole thing restored "snappy," but only re-applying each piece individually (lazy-maps, local landmarks, same-origin images, font-dedupe, …) with user verification after each isolated the culprit (the CF flip) and surfaced a second issue (the /assets-before-session middleware reorder threw errors). My headless before/after numbers were ~the same in both states and did NOT capture the real regression — the user's eyes did. Trust the user's experience over synthetic page-load numbers.

- **Prefer data-level relative paths over a client-side URL-rewrite regex.** Same-origin gallery images: storing `/assets/...` relative URLs in the franchise data (og/JSON-LD are hardcoded-absolute in the template, so SEO is unaffected) is simpler and lower-risk than a `relativizeAssetUrl()` regex stripping the host at render time.

- **Don't reorder the /assets static mount ahead of the session/CSP/embed middleware on this app — it throws errors** (cause undiagnosed; reverted twice). To get immutable `/assets` caching, add the mount AT the existing general-static location (AFTER session) with `Cache-Control: public, max-age=31536000, immutable`. Static asset GETs don't modify the session, so prod responses carry no session cookie and CF caches them fine — the immutable TTL upgrades them from CF's `max-age=14400` REVALIDATED (~0.2s origin round-trip) to a clean edge `HIT` (~20ms). This is what fixed "images load last and slow" on the franchise landing. (2026-05-24)

- **Versioned images: convert to WebP + lazy-load the rotator.** hero/interior JPEGs (1360×1020, 220–540KB) → WebP q82 (−46%). For a stacked image rotator, `loading="lazy"` is useless (all images count as in-viewport); instead set `src` only on the first slide and carry the rest in `data-src`, loading them just-in-time on advance with a 1-slide lookahead. Cut initial gallery load from ~9 images (~4MB) to ~3 (~0.8MB). (2026-05-24)

- **CF Load Balancer `session_affinity: cookie` adds a `__cflb` cookie that BYPASSes cache on the response that SETS it** (a brand-new visitor's first asset request). With a single active pool (failover-only fallback) affinity is pointless — consider `session_affinity: none` to let first-ever loads cache cleanly. The token has no Cache-Purge or Cache-Rules permission (billing/rules scope), so CF cache config beyond settings must be done in the dashboard.

- **Server-rendered HTML templates are cached in memory in prod → `git pull` alone won't deploy them; `pm2 reload` is required.** (2026-05-24) `franchiseController.js` does `if (NODE_ENV === 'production' && cachedTemplate) return cachedTemplate` — `public/franchise-host.html` is read once and held. After a `git pull` that changed the template (a11y label removal + a bumped `chrome.css?v=` stamp embedded *in the template*), the origin kept serving the OLD HTML (verified: `cf-cache-status: DYNAMIC` even with a `?lh=` cache-buster, so it wasn't Cloudflare — it was the app's in-memory copy). The runbook's "static content needs only the pull" is wrong for anything rendered through a cached template. **Rule:** if a change touches `franchise-host.html` (or any server-rendered template), `pm2 reload wavemax` on BOTH boxes after the pull. Pure `/assets/*` files served by `express.static` are fine with just the pull (but still need a `?v=` bump to beat the immutable cache).

- **When measuring a page right after deploy, hit it with a `?lh=<timestamp>` query** so any edge/proxy cache key misses and you measure the real origin output; then `curl` the served HTML and grep for the new `?v=` stamp + the changed markup to PROVE the new code is live before trusting the Lighthouse numbers. (2026-05-24 — caught the stale-template issue above before wasting a measurement run.)

- **A new OCI Ubuntu box needs `iptables` opened for 443, not just the security list — the image ships a restrictive default that REJECTs everything but :22.** (2026-05-24, standing up oci2) Launched a 2nd Ampere web box, installed the full stack, added it to the Cloudflare LB round-robin pool — and it got **zero traffic**. CF pool health showed `"144.24.4.202": {healthy:false, failure_reason:"No route to host"}` while oci1 was 200. The OCI Ubuntu image's default `/etc/iptables/rules.v4` is `ACCEPT :22` → `REJECT all --reject-with icmp-host-prohibited` (the REJECT is what produces "No route to host", not a timeout). The OCI **security list** allowing Cloudflare on 443 is necessary but **not sufficient** — the box's **local iptables** also blocks 443. Fix: `sudo iptables -I INPUT <pos-before-REJECT> -p tcp --dport 443 -j ACCEPT` then `sudo netfilter-persistent save`. oci1 already had this (runbook §7); I'd treated §7 as SL-only and skipped the iptables half. **Rule:** when cloning an OCI web node, diff `iptables -L INPUT -n` against the working box and match the ACCEPT rules, not just the security list.

- **Updating the Oracle ADB IP access-control list RESETS live connections (ORA-03113 "closed by peer") — and with an uncapped Mongo pool that becomes a connection storm.** (2026-05-24, adding oci2's IP to the ADB ACL) Right after the ACL `update --whitelisted-ips`, both app hosts logged **~170/min** `MongoServerError: ORA-03113 ... database connection closed by peer` on `/health` and every DB-backed API → 500s → the embedded iframe broke. Root cause: the driver-default **`maxPoolSize` is 100 per cluster worker**; ×4 workers ×2 hosts the pool tried to re-establish a flood of connections after the ACL reset, most failing re-auth in a tight loop. A `pm2 reload` (fresh pool) cleared it **instantly** (rate 174→4→0). Permanent fix: **cap the pools** — this app is lightweight — `mongoose maxPoolSize:5/minPoolSize:2` + `connect-mongo maxPoolSize:3/minPoolSize:1` (server.js). **Rules:** (1) an ADB ACL change is NOT zero-impact — it drops live connections; do it during a quiet window and expect a brief blip. (2) NEVER run the default 100-conn pool against the ADB — cap it. (3) When you see a connection storm, `pm2 reload` is the fast mitigation; the cap is the cure. The ACL `update` is also **interactive** (`Are you sure? [y/N]`) — needs `--force` in scripts, and the `--whitelisted-ips` list REPLACES (pass the full set incl. existing IPs).

- **A `pm2 reload` refreshes the Mongo connection pools (new worker procs = new pools)** — the go-to mitigation for any stuck/poisoned pool state, and it's rolling/zero-downtime. (2026-05-24)

## SEO

- **Cloudflare's "Manage robots.txt" injects a `Content-Signal:` directive that Lighthouse rejects → caps SEO at 92.** (2026-05-24) Lighthouse/PSI's `robots-txt` audit fails on the unknown `Content-Signal: search=yes,ai-train=no` line CF prepends (its AI-Audit / Content Signals feature). Our origin robots.txt was clean, but CF's edge injection overrode it. The LB/billing API token can't toggle that setting (`bot_management` → auth error; not in the zone-settings API) — it's dashboard-only. **Fix:** move the AI-crawler `Disallow` list into our own origin `/robots.txt` route (`server.js`, valid directives, NO Content-Signal), then disable CF's "Manage robots.txt" per-zone. Result: SEO 100 on all 6 zones, AI-bot governance preserved. Don't re-enable CF's managed robots.txt.

- **Lighthouse SEO does NOT score structured-data richness — and `curl` under-counts JS-injected schema.** (2026-05-24) Two traps in one: (1) Lighthouse's `structured-data` audit is `scoreDisplayMode: manual` (unscored) — a thin competitor page scored **SEO 100** with almost no schema while ours scored 92 purely on the robots.txt lint; rich JSON-LD is pure SERP advantage (rich results), invisible to the SEO score. (2) A `curl` JSON-LD scan reported the competitor at **0** schema entities; rendering the page with headless Chrome (`--dump-dom`, JS on, like Googlebot) showed **7** — their schema is injected client-side. **Always measure structured data with a renderer** (Google Rich Results Test, or headless Chrome), never `curl`/view-source. (The official Rich Results Test itself is un-scriptable — CAPTCHA + Google sign-in; for owned properties the Search Console URL Inspection API returns official `richResultsResult`.)

## Measurement / claims

- **Local headless Lighthouse ≠ Google PSI for throttling-dependent metrics — never cross-source a tool-attributed claim.** (2026-05-24, auditing the crhsent comparison page) The sales page cites *"Google PageSpeed Insights"* scores (MHR Austin **82 desktop / 59 mobile**). Local headless Lighthouse on the WSL box scored the **same page 49 / 35** — ~30 points lower — because local Lighthouse applies harsher CPU/network throttling than Google's PSI servers. I nearly "corrected" the table's FCP/LCP timings with my LOCAL numbers while the caption still said *"the same lab metrics PSI reports"* — which would have made the page **less** defensible (a prospect re-running at pagespeed.web.dev sees PSI's numbers, not mine). **Rules:** (1) Performance **score** and lab **timings** (FCP/LCP/TBT/Speed-Index) are throttling-dependent → local Lighthouse and Google PSI disagree, often by a lot; never substitute one for the other. (2) **Byte-count** metrics (total page weight, HTML doc size, script/stylesheet **count**) and the **Accessibility / Best-Practices / SEO** scores ARE tool-independent → local == PSI, safe to cross-source (verified: MHR A11y = 77 in both). (3) When a published number names its tool, keep the value from THAT tool, or re-attribute the metric to the tool that actually produced it ("Chrome Lighthouse DevTools" vs "Google PSI"). (4) The most bulletproof comparison rows are the ones reproducible with one obvious command: **TTFB / headers / CORS via `curl`, bytes via the network panel, console errors** — all tool-independent.

- **Re-measure comparison/marketing claims before every publish — both sites drift, and so does yours.** (2026-05-24) The crhsent "proof you can verify" audit found our own total page weight had dropped **1.76 MB → 0.98 MB** since the claim was written (the WebP + deferred-pixel work landed in between — the claim understated our advantage), the competitor's Charlotte page was **3.40 → 2.90 MB** (overstated *their* heaviness), the franchise page was **28→41 scripts / 23→21 stylesheets**, and a "1 redirect on every page" row was simply wrong (the canonical page has 0). A verifiable claim is a maintenance liability: it's only true at the moment measured. Audit the whole comparison against live data on a cadence, not just when first written.

## Process

- **Credential scanning is correctly blocked even when "the user said the key was added."** (2026-05-24) Hunting a Google PSI API key with `grep -roE "AIza..."` across `~/` and listing all `*token*`/`*key*` dotfiles was denied by the auto-mode classifier as Credential Exploration — the right call. The task didn't actually need the key: the score claims were already real PSI numbers from an earlier provisioned run, and the table could be re-grounded on tool-independent byte/curl metrics. Don't systematically scan credential stores; find the path that doesn't need the secret, or ask.

- **Production config edits on live hosts require explicit confirmation** even mid-incident — the auto-mode classifier correctly blocked an autonomous `docker-compose.override.yml` rewrite + container recreation on the live mail host until the user authorized it. Surface the incident + the exact fix, get the go-ahead, then act.

## 2026-06-09 — Subagent model selection during the redesign build
Rick's call: don't economize on subagent models for this redesign — run implementers
AND reviewers on the most capable model (Opus), not Sonnet, even for mechanical tasks.
Rationale: ultracode session, correctness >> token cost; the skill's "least powerful
model that works" heuristic optimizes the wrong variable here. (Context: PR 1 sonnet
implementers all passed first-try, but the margin isn't worth the savings.)

## 2026-06-22 — CRHS corporate site: tenure phrasing + positioning
- **Rick's tenure on crhsent.com = "over 30 years" (stat: "30+"), NOT 40.** The existing
  `crhsent/owners/index.html` says "40 years / four decades" — do NOT propagate that to the
  corporate site; Rick corrected 40 → "over 30". (If the owners page is ever rebuilt, ask
  before changing its number too.)
- **CRHS home positioning (locked rev 2):** sole proprietor + AI-driven development +
  enterprise architecture → secure, highly-available, enterprise-grade systems *without the
  enterprise price tag*. The DB/AI IP is the credibility/evidence spine, not the headline.
  Keep H1 "WE BUILD THE REAL THING." Generic competitor framing; nothing legal/tax/personal.

## 2026-09-17 — Verifying a deploy with a cache-buster can hide a half-deployed fix
Fixing the forgot-password form (the shared validator was never loaded, so it
rejected every email), I deployed `public/` changes, then verified live with
`curl "…/assets/js/embed-app-v2.min.js?lh=$(date +%s)"` and saw the fix. **That
proved nothing about real users.** The SPA shell serves the bundle as
`embed-app-v2.min.js?v={{ASSET_VERSION}}`, and those assets ship
`public, max-age=31536000, immutable`. A returning browser requests the *old*
URL it already holds and never re-fetches. New visitors were fixed; repeat
visitors were not — and every check I ran looked green.

**Rules:**
1. **Verify at the exact URL a browser will request**, never with a unique
   cache-buster appended. A `?lh=` probe answers "is the origin correct?", not
   "will a user get it?" — those are different questions and only the second
   one matters.
2. **Changing `embed-app-v2.js`'s `pageScripts`/`pageStyles` maps, or
   `public/locales/*/common.json`, requires bumping `ASSET_VERSION` in
   `server/config/assetVersion.js`.** The file documents this; I still missed
   it. That bump is server code → needs `pm2 reload`, which turns a
   "static-only, pull is enough" deploy into a reload deploy.
3. **`public/` edits are not automatically reload-free.** Check whether the
   change also requires a version token that lives in server code.
4. Related, already known but it bit again: the SPA shell serves
   `embed-app-v2.min.js`, **not** `embed-app-v2.js`. A source edit to the route
   map is inert until `npm run build:assets` regenerates the bundle.

Root defect worth remembering separately: `validateEmail` was
`!!(window.FormValidation && …)` — a **fail-closed** dependency check. When the
helper was missing it rejected every address and blamed the user's email. A
client-side validator that cannot load should fall back or defer to the server,
never deny.

## Never compare nonce-bearing pages by content hash (2026-09-19)

During Plan 2 Task 76 I hashed `crhsent.com/` on both boxes to check for split-brain after
deploying new code to oci1 only. The hashes differed (`2d9a1cf44d` vs `1cf6445c23`) and I nearly
reported a content divergence. The pages were **byte-identical in length** (18680 both) and the
only differing lines were the 5 occurrences of the **per-request CSP nonce**. There was no
divergence at all.

**Rule:** a page carrying a per-request nonce (every page in these apps — `<meta name="csp-nonce">`
plus `nonce=` on every style/script tag) has a different hash on every single request, from the same
box. Hashing it proves nothing. To compare such pages across boxes, either strip the nonce first
(`sed -E 's/nonce="[^"]*"//g; s/content="[A-Za-z0-9+\/=]{16,}"//g'`) or compare byte length + a
structural diff. Same trap applies to comparing before/after a deploy.

## On-box HTTP probes need `X-Forwarded-Proto: https` (2026-09-19)

Third instance in Plan 2. Both apps force HTTPS, so any on-box `curl http://127.0.0.1:<port>/...`
without `-H "X-Forwarded-Proto: https"` gets a **302** to the public URL instead of the real
response. Task 75 Steps 8/9 and Task 76 Step 3 all expect `200` from headerless probes and so all
report a false FAIL on a correct deploy; the Task 77 CORS probe fails the other way and would have
produced a false PASS.

**How I proved it rather than assuming:** ran the identical headerless probe against the *untouched*
oci2. It returned the same 302, so the redirect predated the deploy. Then the corrected probe
returned 200, the 302's `Location` was the https form of the same path, and the public CF URL was
200. **Always find a control that cannot have been affected by the change** before writing off an
unexpected result as a probe artifact.

## `docker compose logs --since` can silently return nothing (2026-09-19)

Verifying a live mail send on the Mailcow host, `docker compose logs --since 15m postfix-mailcow`
returned **zero lines** — not zero matches, zero output — while the container was running and
logging normally. `--tail 4000` returned the full log instantly.

The empty result reads exactly like "the mail never sent", which is the signature of the August 2026
outage, and the plan's instruction on that branch was to escalate to a rollback. **Use `--tail <n>`
against this host, not `--since`.**

**Cross-reference that actually works:** the app logs `Email sent: <message-id>`. Grep that ID in the
postfix log to get the queue ID, then grep the queue ID for `status=`/`dsn=`. That chains app-side
submission to wire-side delivery with no time filter involved.

## `orig_to=` only appears when Postfix rewrites an address (2026-09-19)

A check written as `grep 'orig_to=<recipient>'` silently fails for any recipient that is a **real
mailbox** rather than an alias — Postfix logs `orig_to=` only on a rewrite. `pickups@atxwashdryfold.com`
(an alias) logs `to=<admin@crhsent.com>, orig_to=<pickups@atxwashdryfold.com>`; `admin@crhsent.com`
(the mailbox itself) logs only `to=<admin@crhsent.com>`.

**Rule:** match `(orig_)?to=<addr>` when the recipient might be either, and know which of your
addresses are aliases and which are mailboxes before writing the assertion.

## Never put `&` inside a `run_in_background` call (2026-09-19)

Starting a 16-run Lighthouse sweep, I launched the script with `&` *inside* a Bash call that already
had `run_in_background: true`. The harness tracked only the trivial foreground part, reported
**exit 0 within seconds**, and the detached script was killed with its parent shell after **1 of 16
runs**.

**Rule:** with `run_in_background: true`, run the long command in the *foreground* of that call. The
harness backgrounds it and notifies on real completion. `&` inside is double-backgrounding and the
inner process dies.

## A gate that globs files must assert the expected COUNT (2026-09-19)

The consequence of the above was worse than the lost time. The scoring gate globbed
`*-<date>.json`, found the single report that had been written, graded it, and printed
`PASS … exit=0`. **A green gate over 1/16 of the evidence.**

The only thing that caught it was the spec printing `files 16` alongside the verdict. Any check that
iterates over "whatever matched" must assert how many it expected to match, and that assertion — not
the pass/fail of the items found — is the one that carries the safety.

## A load-balancer health monitor does not fail over instantly (2026-09-20)

During the Plan 2 P-16 drill I stopped `crhs-corporate` on one of the two OCI boxes, expecting the
Cloudflare LB to keep crhsent.com served from the other. **2 of 6 public probes returned 502.**

The CF API showed why: the pool was mid-propagation — **188 of 302 PoPs had marked the box unhealthy,
114 still routed to it**, and those hit an nginx whose `:3001` upstream was dead. The origin's own
`/health/origin` returned 503 the whole time, so the monitor was working; the gap is purely
propagation latency across PoPs.

**Rules:**
- "The LB will fail it over" is not the same as "users see no errors." Budget ~1-2 min of partial
  5xx for any origin outage, and say so in any plan step that assumes seamless failover.
- To diagnose, read the LB's per-PoP health from the API, not just the aggregate `healthy` boolean —
  the aggregate hid a 62/38 split.
- A self-healing cron can fix the box *faster than the LB converges*, which means the outage can end
  before failover completes. Both mechanisms are worth having; neither alone makes an outage invisible.

## A shared service must not branch per type on how a model stores credentials
*Pattern from 2026-09-25 (`ac91869d`), after Rick: "both resets should use the same path."*

`passwordResetService` branched on `userType` and, for administrators, assigned
`user.password` under a comment asserting a pre-save hook would hash it. No such hook
existed, `password` was not a declared path, and `strict: true` discarded the write in
silence — the reset reported success, spent the token, and left the old password live.
This was the **third** strict:true silent-discard in the same flow.

**Rules that prevent a repeat:**
1. A service may not encode per-model hashing knowledge. Give every model the same
   method (`setPassword()`) and call it unconditionally; then the service cannot target
   a path a schema does not declare.
2. Never trust a comment that claims a hook exists — open the model and read the hook.
   Grep for the path in the schema, not for the feature's name.
3. A credential test that mocks the model **passes vacuously** (a plain object accepts
   the discarded assignment). Use the real model and assert the **old** credential stops
   working and the stored hash **changes** — not merely that the call resolved.
