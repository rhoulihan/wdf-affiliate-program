# Escalation register

**The single list of everything Plan 3 handed to the owner or to counsel.** Created by Plan 3
Task 35 (2026-09-25), which closed the plan.

This file exists so that *"the backlog is clear because items were closed or escalated, **never
because they were forgotten**"* (Plan 3, exit criteria 3 and 7). Ruling **R-14** made this the one
register: three rival artefacts were proposed during drafting and none was ever created, so nothing
was merged — only written.

**How to use it.** Every row names an owner and the decision needed. Rows are *recorded, not
executed*: by construction these are owner and counsel calls, not work an agent may take. Close a row
by striking it with the date and the evidence — do not delete it, because the reason is the value.

`npm run check:backlog` fails if `tasks/todo.md` regains an open item or if any row below loses its
owner.

---

## A. Raised by Plan 3 execution (drafted 2026-09-21, verified at closure)

Rows 1–18 are transplanted verbatim from the plan's own adjudicated table
(`docs/superpowers/plans/2026-09-21-separation-plan3-final.md:9634`).

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

---

## B. Raised after the table was drafted — harvested from `tasks/todo.md`

These eight rows were raised by tasks 37, 43 and 44 on 2026-09-23/24, **after** the table above was
written. Their own heading in `tasks/todo.md` instructed Task 35 to *"harvest these into it"*.

Four arrived with **no owner named**. The blank column is the failure mode this register exists to
prevent, so each is assigned below; where the original text named nobody, the decision column says so.

| # | item | owner | raised | decision needed | blocks |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 19 | **E-37-1 — published legal contact points on a live mailbox.** Two host lists in legal copy plus six `mailto:` addresses on the retired apex. | Rick + counsel | 2026-09-23 | Which mailbox legal copy should publish, and whether the six apex addresses stay deliverable | — |
| 20 | **E-37-2 — `wavemax.promo` leaves `allowedHosts`** only once the retirement 301s are switched off. | Rick | 2026-09-23 | Timing: when the 301s come down. Removing the host first breaks the redirects | — |
| 21 | **E-37-3 — stale email-infrastructure defaults on the retired apex.** `process.env.X \|\| '<literal>'` fallbacks plus three templates. | Rick + counsel | 2026-09-23 | Waits on the same mailbox decision as row 19 — do not resolve independently | row 19 |
| 22 | **E-37-4 — franchisor UTM tag in client JS.** `public/assets/js/embed-navigation.js:187` sets `data-utm-source="wavemaxlaundry.com"`. Attribution to the franchisor, not a host allowlist, so Task 37 left it. | Rick | 2026-09-23 | Remove or keep. **No owner was named originally.** Worth deciding alongside the DMCA work | — |
| 23 | **E-43-1 — admin-notification priority headers are silently dropped.** web-core's `sendEmail` has no `headers` option, so the priority a caller passes goes nowhere. | Rick | 2026-09-24 | Needs a web-core + wrapper change, or a dispatcher change that PR B10 forbade. **No owner was named originally** | web-core release |
| 24 | **E-43-2 — `ops.js:18` computes a `From` it never sends.** Dead code still holding a `rundberglaundry` literal. | Rick | 2026-09-24 | One-line deletion; out of PR B10's scope. **No owner was named originally** | — |
| 25 | **E-44-1 — `.env.example:78` tells the operator to re-grant the CORS origins Task 37 removed.** ⚠️ **HUMAN-CONFIRM**, security-relevant since PR B11. | Rick | 2026-09-24 | Approve replacing lines 72–91 with the block recorded at `tasks/todo.md:791-811`. An operator following the current text re-opens the origins | — |
| 26 | **E-44-2 — `INFRA_ALLOW` row `/wavemaxDomains/g` no longer shields any app identifier.** | Rick | 2026-09-24 | Re-scope or retire the row, and sweep for other dead rows. **No owner was named originally** | next guard pass |

---

## C. Unlabelled items — found only because Task 35 read every row

`tasks/todo.md` held 64 open rows; **44 carried no D-/B-/E- label.** An ID-driven harvest would have
closed 20 and silently left these behind. Four are live, and two of those are security- or
counsel-grade. This section is the direct reason the closure scope was widened.

Also note: four headings in that file asserted `DONE` / `SHIPPED` / `HOTFIXED` while still holding open
rows beneath them (`todo.md:13`, `:30`, `:306`, `:662`). **Heading state was never item state in that
file** — which is exactly how these stayed invisible.

| # | item | owner | raised | decision needed | blocks |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 27 | **Live accessGate bypass.** `accessGate` reads `X-Forwarded-Host` as one lowercased string; a forged **multi-value** header skips the gate. Sat under a heading marked `✅ HOTFIXED IN PRODUCTION` (`todo.md:320`), so it read as closed. Related hazard recorded in memory `host_derivation_mediator_bypass_hazard_2026-09-13`. | Rick | 2026-09-13 | Adopt one `requestHost()` (Host header only) across `accessGate`, `mediatorGate` and `crhsentHandler` **in a single commit** — a partial migration is itself a bypass | — |
| 28 | **451 franchisor photos + the swirl OG card remain in PUBLIC git history** (~448 MiB), `todo.md:675`. Live DMCA context. Removing them rewrites history on a public repo. | Rick | 2026-09-14 | Whether to rewrite public history (and coordinate every clone), or accept and document the exposure | — |
| 29 | **Marketing hero photo `public/assets/images/locations/austin-tx/hero-1.webp`** shows the franchisor swirl logo and a "WaveMAX LAUNDRY" sign. **LIVE.** Rick 2026-09-13: *"Keep it — hold for counsel."* | counsel (Miguel) | 2026-09-13 | Standing hold. Not closeable by engineering | — |
| 30 | **Cloudflare API token expired 2026-09-16** (`todo.md:233`) — needed for monitor rollback and Plan 3 purges. The row is **past its own deadline**, not pending. | Rick | 2026-09-13 | Reissue the token, or confirm nothing still depends on it | CF monitor rollback |
| 31 | **`rhoulihan/crhs-transfer` still exists** — private, 67 KB, last pushed 2026-09-17, not archived. Task 33 expected `GONE`; the Step 1 gate caught it at closure. It holds privileged settlement drafts (see row 10). **Deleting a repo is irreversible and owner-gated, so Task 35 did not touch it.** | Rick | 2026-09-25 | Mirror, reconcile, then delete — or decide to retain it deliberately | Plan 3 exit criterion |
| 32 | **Affiliate dashboard realignment — IN PROGRESS 2026-09-25.** Three of four tabs were misaligned with the Phase-1 model (Earnings is entirely dead; Pickups and Customers render into the wrong columns) and the affiliate could edit only 5 of their own fields, one of which — `email` — was silently discarded with a 200. **Correction: the earlier note here claimed the affiliate setting their own `deliveryFee` was a privilege escalation. It is not** — the fee is their own price to their customer, which they keep in full; "set your own prices" is a selling point of the program. No security issue. | Rick | 2026-09-25 | None — this is scheduled work, not a decision. Tracked by the approved dashboard plan; PR 1 (backend self-service field surface) landed 2026-09-25 | — |

---

## D. Carried forward to Plan 4 — deferred, not dropped

Accepted as deferred with Rick's explicit agreement (2026-09-11), on the standing condition that
deferral is recorded rather than forgotten. Each keeps its full reasoning in the memory corpus, in the
`closed_*.md` files Task 35 renamed.

| # | item | owner | raised | decision needed | blocks |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 33 | **D-4 — affiliate ESLint cleanup.** 208 findings in `server/`, 10,888 repo-wide at the time of measurement. `server/` itself is held at **zero** by `lint:server`. | Rick | 2026-09-11 | Schedule in Plan 4. Not a defect, a debt | — |
| 34 | **B-2 — internationalise `public/affiliate.html`.** Zero `data-i18n` attributes; the page loads neither `i18n.js` nor the switcher, so **adding the layer is the work**, not translating strings. Its stated "do it with the Plan 3 move" window has now passed. | Rick | 2026-09-11 | Schedule, and decide whether the SEO/JSON-LD block gets localised variants | — |
| 35 | **B-4 — brand literals in `@crhs/web-core` outside `src/`.** The `brandNeutral` guard scopes `src/` only, by design. Legal pages + `LICENSE` are **Rick/counsel — never auto-edited**; the `wavemax-language` storage key needs a read-old-key-once migration or every visitor's saved language resets. | Rick + counsel | 2026-09-13 | Legal text by counsel; storage-key rename is an owner decision | — |
| 36 | **B-5 — web-core reliability hygiene.** Carries two **active guardrails**, not just debt: the logger has no `splat()` so `logger.error('msg:', err)` silently drops `err`; and `injectNonce` emits a **duplicate** `content` attribute, live on the portal, which is benign **only** while the portal CSP lacks `'strict-dynamic'` and keeps `'unsafe-inline'`. | Rick | 2026-09-13 | Next web-core release after v0.2.1. ⛔ The `injectNonce` fix must land **before** any portal CSP change that adds either directive | portal CSP change |

---

## E. Recorded decisions — closed here, kept for the reason

| item | decision | date |
| :-- | :-- | :-- |
| **Plan 3 Task 46 (PR B14, remove all shims)** | **Dropped.** Rick: *"drop it and record the decision."* The one-line shim modules from tasks 39–45 are permanent; call sites keep importing `../utils/<name>`, which re-export `@crhs/web-core`. | 2026-09-22 |
| **`ofelia` container memory** | **Cap accepted, monitoring escalated.** 512m / `GOMEMLIMIT=440MiB` stopped the restart loop — 0 restarts over 50 minutes against 36 kills that day — but memory still oscillates 180–296 MiB and **the root cause was never established.** Recorded as `OFELIA_DECISION=cap-accepted-monitoring-escalated`; row 9 above keeps the open question. | 2026-09-25 |
| **Plan 3 Step 1 `ensure-indexes` gate** | **The gate itself was defective, the invariant holds.** Its check greps every mention of `scripts/ensure-indexes.js` in the plan and expects zero, but 33 are legitimate discussion. Nothing **executes** it: the only two matches are a defect-record table row and a `node --check` parse. Recorded as `C5_SPEC_GATE_DEFECTIVE=yes`, `C5_ENSURE_INDEXES_EXECUTED=no`. | 2026-09-25 |

---

## F. Surfaced by the triage itself (2026-09-25)

Rows that were **measured** during closure rather than inherited. Each was an unlabelled `- [ ]` whose
premise had to be re-tested against the post-flip world; these are the ones that did not resolve.

| # | item | owner | raised | decision needed | blocks |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 37 | **`/wavemax-affiliate` now returns 404, not the deliberate 410.** The 410 was chosen for trademark compliance and printed-flyer QR codes; after the flip the path plainly 404s [MEASURED]. | Rick | 2026-09-25 | Carry the 410 into the content app, or accept 404. Functionally equivalent for a retired path, so this is a compliance/intent call | — |
| 38 | **`/monitoring/` 404s on marketing hosts — and so does `/monitoring.html`** [MEASURED]. The original row claimed the `.html` form was redirected by B7; **that premise is false**, neither form resolves. Impact is limited to held bookmarks; the dashboard lives on the portal. | Rick | 2026-09-25 | Add a redirect for both forms, or accept that marketing-host bookmarks break | — |
| 39 | **P-11 — the device checklist is neither signed nor formally deferred.** Plan 2 asked for `P11_DEVICES_SIGNED` or `P11_DEFERRED_TO_PLAN3`; neither was ever recorded, and Plan 3 is now closing. | Rick | 2026-09-14 | Sign it, or record the deferral explicitly so it stops being ambiguous | — |
| 40 | **Cross-domain `rel=canonical` may cost the SEO 100 on the three non-canonical marketing hosts.** Plan 2's GATE Task 82 was written to STOP on this. | Rick | 2026-09-14 | Accept the SEO trade-off for canonical consolidation, or change the canonical strategy per host | — |
| 41 | **Portal CLS is 0.21 (poor)** — layout shift, independent of the caching fix that was shipped. The project's release gate targets ~100 across all four Lighthouse categories on mobile and desktop. | Rick | 2026-09-11 | Whether to schedule a layout-shift pass; it is a standing gate miss, not a regression | Lighthouse gate |
| 42 | **Portal `/assets` static error responses still carry year-long `immutable`** — affiliate `express.static` returns 416/412 with the caching headers attached (LOW). | Rick | 2026-09-13 | Strip cache headers from static error responses, or accept | — |
| 43 | **No guard stops the deleted location image tree from regrowing.** The separation spec cites `tests/unit/locationImages.test.js`; **that file does not exist** [MEASURED]. The tree was removed for DMCA reasons, so regrowth is a live risk, not a hypothetical. | Rick | 2026-09-14 | Write the guard, or accept the gap. Given the DMCA context this is the cheapest of the four to close | — |
| 44 | **Corporate clickjacking demo still frames franchisor origins.** `crhs-corporate/server/middleware/hostAwareCsp.js:21` sets `DEMO_FRAME_SRC` to `www.wavemaxlaundry.com`, `wavemaxlaundry.com` and `rundberglaundry.com`, asserted by `tests/csp.test.js:32` [MEASURED]. Plausibly deliberate — a clickjacking demo must frame its target — but it names the franchisor in a live dispute. | Rick | 2026-09-13 | Confirm the demo framing the franchisor is intended, or narrow the list | — |
