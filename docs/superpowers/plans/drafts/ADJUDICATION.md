# Plan 3 adjudication — controller rulings on 69 review findings

Two adversarial reviews over five parallel-drafted slices (76 tasks, ~10,200 lines):
**REVIEW-1 cross-slice** 34 findings (2 sev-1) · **REVIEW-2 production-safety** 35 findings (6 sev-1).
Controller re-verified every severity-1 against production before ruling.

## Binding rulings — these govern assembly

**R-1 (from X1–X27). A cross-slice dependency is ASSERTED or it does not exist.**
Only 11 of 38 were enforced. In the assembled plan every cross-slice dependency appears in
**Interfaces: Consumes** AND is asserted by a command in the consuming step whose failure halts the
task. Prose references are deleted, not downgraded. A task whose precondition cannot be asserted
mechanically does not ship.

**R-2 (X3). No byte-count discriminators.** Slice A hard-codes `len=27477` in **17** places; the real
value became 27593 when the CLS fix `d8c421b` landed — an hour after slice A measured it. Every flip
would have reported "roll back now" on success. Discriminate on a **structural string unique to each
app** (a path or marker the other app cannot serve), never a length or hash of mutable content.

**R-3 (P2). Any task that stops a service restores it under `trap … EXIT`.**
A12 stops `crhs-corporate` under `set -e` and reaches `pm2 start` only through an unprotected `grep`.
`/health/origin` then 503s and Cloudflare drops oci1 from the pool shared by **all five** LBs — the
portal with it. The 2026-09-20 P-16 drill used a trap for exactly this reason; the plan must too.

**R-4 (P1). Record keys must be legal shell identifiers.** `FLIP_atxwashateria.com_oci1` is not:
verified `command not found`, and `${!V}` gives `invalid indirect expansion`. Every flip rollback
silently loses its snapshot timestamp. Host segments are slugged (`atxwashateria_com`).

**R-5 (P3). Every on-box probe to `:3000` carries `-H "X-Forwarded-Proto: https"`.** Measured: `/health`
returns **302** without it, and `embed-app-v2.html` returns an empty body — so slice D's central proof
of the `injectNonce` fix prints nothing, immediately after reloading both apps. `:3001` does not
redirect and must NOT carry it. Fifth occurrence of this defect class in two plans.

**R-6 (P5). A flag is not honoured until proven honoured.** `ensure-indexes.js` reads `process.argv`
**zero** times and has no dry-run concept — it `dotenv.config()`s and calls `createIndexes` 4×. The
step believing `--dry-run` **writes to the production ADB**. Before any step relies on a flag, grep the
script for it. Related: `$?` after a pipe is always `0` — use `PIPESTATUS` or do not pipe.

**R-7 (P12). Plan 3 MUST deploy the corporate app.** `/var/www/crhs-corporate/.git` is **absent on both
boxes** — corporate is rsync-delivered. Slice D rsyncs only web-core and slice A calls corporate
deployment out of scope, yet `PRE404_CLOSED` gates all three flips on corporate changes. A corporate
rsync+verify task is ADDED, modelled on Plan 2 Task 75 Step 4, and every flip consumes it.

**R-8 (X1). `INTEREST_FORM_URL` gets an explicit owner, before B9.** Verified absent from the
production `.env` AND `.env.example`. Code falls back to `/affiliate`, which resolves only via
`server.js:819` — the route B9 deletes. The invite-only program's only public application link would
404 while B1's test passed on the fallback. Assembly assigns it, sets it on both boxes and in
`.env.example`, and asserts the served link is the configured URL — not merely non-empty.

**R-9 (the 9 assertions that cannot fail).** Every one is replaced with a check that provably differs
on a broken system, and each is **falsified once** before being trusted — break it deliberately, see
it fail, restore. This is the sixth instance of this defect class in two plans (`orig_to=`,
`--since`, the 1-of-16 glob, `*.tar.gz` vs `.tar.zst`, `/Reset \d+/` matching `0`).

**R-10 (X22). The C14 blocker is CLOSED — record it, stop gating on it.** `d8c421b` is committed and
deployed to both boxes; the content app's page measures **mobile perf 99, CLS 0.013, a11y/BP/SEO 100**
through the dark origin (was 83 / 0.32). Slices still describing it as blocking are corrected.
⚠️ Separately: the **portal's** copy of that page is what the public sees until the flip and still has
CLS 0.331 — a live defect, owner-notified, not silently folded in.

**R-11 (X17). Rollback must not resurrect a deleted secret.** Rolling back `E3` after `E4` re-plants
the 27-line plaintext RSA key on both boxes. All `.env` rollbacks restore from a **post-purge**
baseline; pre-purge backups are quarantined and shredded on owner sign-off.

**R-12 (X16). A per-host rollback restores only that host.** A3's whole-file snapshot restore
un-flips all three hosts while claiming independence. Rollbacks are scoped to the host's own
`include` line.

**R-13 (X10). Retiring the explorer retires its credentials.** `EXPLORER_TOKEN` and
`ANTHROPIC_API_KEY` are live in the production `.env` and no slice removes them. Owner decided to
retire the explorer; its token goes with it. `ANTHROPIC_API_KEY` is escalated separately — the
concierge may have other consumers.

**R-14 (X13/X14/X18/X27). One escalation list, one settled decision.** Four competing "single
escalation list" files collapse to `docs/superpowers/ESCALATIONS.md`. Tasks that re-ask a settled
owner decision (explorer retirement, ESLint scope) are rewritten to implement it, not re-open it.
The repo-wide ESLint **no-increase guard** that owner decision 2 implies is ADDED — `server/` +
`server.js` = 0, remainder a documented accepted baseline.

**R-15 (P-review). Gates that can never pass are removed or corrected.** B8 demands a
`sites-enabled/runberglaundry.com` that does not exist and an evidence file no slice writes; A1 Step 1
expects a 1134-byte placeholder but the workstation's egress IP is preview-allowlisted and receives
`len=25991` — so the plan's FIRST command trips its own STOP, and the Lighthouse "before" numbers are
not what the public sees. Pre-flip measurement must be taken from a non-allowlisted vantage.

## Not accepted
- Slice E's `FRONTEND_URL` cutover-blocker framing (X2 keeps the *fix*, drops the *blocker* claim):
  controller measured the end-to-end 301 preserving the token byte-identical. E2 lands as an
  improvement with its own test; it does **not** gate the flips. Slice A was right.
