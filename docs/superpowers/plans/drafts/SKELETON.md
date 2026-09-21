# Plan 3 assembly skeleton — task order and the enforced dependency graph

Controller-owned. Assemblers fill tasks against THIS ordering; they do not re-order.
Governed by `ADJUDICATION.md` (15 rulings) over the five slice drafts and two reviews.

**Ruling R-1 is the spine: a cross-slice dependency is ASSERTED or it does not exist.**
Every `Consumes` row below names the artefact AND the command that proves it. A task whose
precondition cannot be proven mechanically does not ship.

---

## Phase 0 — prerequisites. Nothing public changes. All of it gates Phase 1.

| # | task | consumes (ASSERTED) | closes |
|:--|:--|:--|:--|
| 1 | **Corporate deploy mechanism** — rsync + verify, modelled on Plan 2 Task 75 Step 4. `/var/www/crhs-corporate` has NO `.git` on either box (verified); nothing in the slices deployed corporate at all. | — | R-7, P12 |
| 2 | `INTEREST_FORM_URL` — assign owner, set on both boxes + `.env.example`, assert the SERVED link equals the configured URL (not merely non-empty) | T1 (corporate deployed) | R-8, X1 |
| 3 | **PRE404** — 4 legal paths into `EXACT_PATHS`; move `privacy-policy`/`terms-and-conditions` canonicals to the portal; fix the A→B→A canonical loop in `public/partner-program.html:10`; make the two portal-landing scripts relative | T1 | A2, C-9, slice-A loop finding |
| 4 | **Interest-form i18n** (corporate `content/atxwashdryfold/affiliate/index.html`, 4 locales) — lands DARK so the flip's first public byte is translated | T1, T2 | B-2, C-7 |
| 5 | **Delete the nginx access gate** — provably inert (`geo default 1`), carries franchisor brand text, and its `error_page 503` would hijack the failover handler | — | A3 |
| 6 | `proxy_set_header X-Forwarded-Host $host;` on portal + crhsent.com | T5 | R-3 defence-in-depth |
| 7 | **Pre-flip C14 baseline from a NON-allowlisted vantage** — the workstation egress `70.114.167.145` is preview-allowlisted and sees `len=25991`, not the public placeholder, so the plan's own first command trips its STOP | T1–T6 | R-15 |

> **C14 is already CLEARED (R-10).** `crhs-corporate d8c421b` + affiliate `e5c103ef` are committed and
> deployed; the public page measures **mobile 99 / desktop 100, CLS 0.013**. Phase 0 records this as
> evidence; no task may re-gate on it.

## Phase 1 — the flips. One host, then both boxes, then the next host.

Order: **atxwashateria.com → rundberglaundry.com → atxwashdryfold.com**
(atxwashateria first: it serves a `noindex` placeholder to the public, so there is no indexed equity
to regress. It is NOT the lowest-traffic host — that reasoning was wrong and is corrected.)

| # | task | consumes (ASSERTED) |
|:--|:--|:--|
| 8 | Add the `:3001` proxy snippet + per-host transform + verify script. **Do NOT edit `proxy-node-app.conf`** — it is included by the PORTAL. | T1–T7 |
| 9–10 | atxwashateria.com → oci1, oci2 | T8; per-host C14 before/after |
| 11–12 | rundberglaundry.com → oci1, oci2 | T9–T10 green; T3 (its scripts + canonical) |
| 13–14 | atxwashdryfold.com → oci1, oci2 **(HUMAN-CONFIRM — the canonical host)** | T11–T12 green |
| 15 | **Graceful-degradation failover** — `503 + Retry-After` in the snippet, monitor `60→30 / retries 2→1`. The peer-fallback in the brief is NOT implementable: there is **no network path between the boxes on any port** (verified). | T13–T14 |

**Every flip task carries:** `nginx -t` before `systemctl reload nginx` (never restart); a line-count
+ brace-balance assertion (a drafter's own regex silently ate 59 lines while every grep passed); a
**structural** app discriminator, never `len=` (R-2 — 17 stale occurrences); a rollback scoped to that
host's own `include` line only (R-12); and record keys slugged to legal shell identifiers (R-4).

## Phase 2 — post-flip cleanup. Only after ALL SIX flip tasks are green.

| # | task | consumes (ASSERTED) |
|:--|:--|:--|
| 16 | Affiliate marketing content + `partner.*` locale keys removed | T9–T14 all green |
| 17 | **Retire the design explorer** — 150 files + `/api/concierge` + `EXPLORER_TOKEN` + **`ANTHROPIC_API_KEY`** (verified: single reader → single route → explorer-only clients; retiring it stops the Haiku billing) | T16 |
| 18 | Five retired CSRF intake rows (five, because T17 retires the explorer) | T17 |
| 19 | **Delete the iframe bridges** + `securityHeaders.js:81-88` (NOT `:83-88` — `:81-83` are its comment) | T16 |

## Phase 3 — web-core release (v0.3.0)

| # | task | consumes (ASSERTED) |
|:--|:--|:--|
| 20 | `injectNonce` duplicate-attribute fix — one `fillMetaContent()` replacing two divergent regexes. **LIVE defect.** Both repos' tests currently ASSERT the bug ("the regex appends content attribute, it doesn't replace it") — they must be corrected in the same change or the release turns the portal suite red. | — |
| 21 | SMTP timeouts; logger extra-args (primitives are dropped, Errors survive — the brief was half wrong); `flushAndExit`; i18n `?v=` cache fix | — |
| 22 | `wavemax-language` → `app-language` **with migration shim** (load-bearing: the legacy value on the marketing origins was written by the PORTAL's loader) | T19 |
| 23 | Prune the brandNeutral allowlist rows the bridge deletion orphaned — D7 is engineered to FAIL until this runs, which would block the release carrying T20 | T19, T22 |
| 24 | Release v0.3.0 + deploy BOTH consumers, `rm -rf node_modules/@crhs/web-core` first on each box | T20–T23 |

## Phase 4 — absorbed Plan 4 (there is no Plan 4)

| # | task | consumes (ASSERTED) |
|:--|:--|:--|
| 25 | PR B7 rate-limit adoption + fix the **verified double no-op** (store writes `ratelimit_*`; all three reset paths delete from `rate_limits`, which does not exist). Its test asserted `/Reset \d+ rate limit records/` — `\d+` matches `0`, so it was green over a total no-op. Replace with an assertion that fails on zero. | T24 |
| 26 | ESLint `server/` + `server.js` → **0** (208 exact: 155 auto-fixable layout, 53 manual), batched, full suite gating each batch. Runs LAST — 13 of the 208 live in files earlier tasks delete. | T25 |
| 27 | Repo-wide **no-increase guard** + documented accepted baseline (~10,692 outside `server/`) | T26 |

## Phase 5 — findings, closure, escalation

| # | task | consumes (ASSERTED) |
|:--|:--|:--|
| 28 | `FRONTEND_URL` → `BASE_URL` in `passwordResetService` (**improvement, NOT a flip gate** — controller measured the 301 preserving the token byte-identical; slice A was right, slice E wrong) | — |
| 29 | Remaining dead `.env` keys. **Rollback must restore a POST-purge baseline** — rolling back after the DocuSign purge would re-plant the 27-line private key (R-11). The key itself is ALREADY REMOVED from both apps on both boxes. | T28 deployed (asserted on the box, not in prose) |
| 30 | SMTP churn — self-inflicted: `connectivity-monitor.js` `checkSMTP()` opens a raw socket and `destroy()`s without speaking SMTP, in every pm2 worker = 91.8% of the postfix submission log | — |
| 31 | `ofelia` — **actively OOM-killed** every ~40 min (`RestartCount` climbing; `.State.OOMKilled` reads `false` because it describes only the last exit). Cap raise doubles the interval; it does not fix the leak. | — |
| 32 | H-1 CR/LF validator hardening (LOW severity — nodemailer 8.0.11 already folds CR/LF; defence-in-depth + a test pinning that library behaviour) | — |
| 33 | `crhs-transfer` — **mirror and reconcile into `dc_private` FIRST.** It holds privileged settlement drafts; 2 of 5 files differ and `README.md` is unique. Delete only when unique-count is 0. **HUMAN-CONFIRM.** | — |
| 34 | Password-reset end-to-end round trip — **HUMAN ONLY** | T24, T28 |
| 35 | **Backlog closure** — `check:backlog` script, zero open D-items, every memory `backlog_*` closed or rewritten, ONE `ESCALATIONS.md` (four competing lists collapse to one) | T1–T34 |

---

## Assembly rules (apply to every task)

1. **R-9 — the 9 assertions that cannot fail are replaced and each falsified once**: break it, see it
   fail, restore. Sixth instance of this class across two plans.
2. Every on-box `:3000` probe carries `-H "X-Forwarded-Proto: https"`; `:3001` must NOT (R-5).
3. No flag is trusted until grepped for in the script (`ensure-indexes.js` reads `process.argv`
   **zero** times — the "dry run" writes to the production ADB) (R-6).
4. Never `$?` after a pipe — it is always `0`. Use `PIPESTATUS` or do not pipe (R-6).
5. Any task stopping a service restores it under `trap … EXIT` (R-3).
6. Tasks never re-ask a settled owner decision; they implement it (R-14).
7. Gates that can never pass are removed, not weakened (R-15).
