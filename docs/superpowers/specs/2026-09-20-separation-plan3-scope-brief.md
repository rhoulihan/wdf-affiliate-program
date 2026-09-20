# Plan 3 scope brief — the FINAL separation plan

**Status:** scope settled 2026-09-20, pre-draft. Owner goal, verbatim: *"lets make sure plan 3 will be
our complete, last and final step. when we are done i want a clean deployment and clear backlog so we
can start developing new features."*

**Therefore Plan 3 absorbs Plan 4.** There is no Plan 4. Anything not in Plan 3 must be either done,
consciously closed with a recorded rationale, or escalated to the owner — never left as an open item.

---

## Owner decisions (settled 2026-09-20)

| # | Decision |
|:--|:--|
| 1 | **B-4:** bridge literals die with the bridge deletion. `wavemax-language` localStorage key is renamed **with a migration shim** (read old key once, rewrite, so no visitor loses their language). Legal pages + LICENSE text are **flagged to Rick/counsel as a list**, not edited unilaterally. |
| 2 | **D-4:** fix **all 208** affiliate `server/` ESLint errors. Own commit series, **after** the flips are verified, never mixed into a cutover commit. |
| 3 | **Drafting:** full Plan 2 pipeline — draft → adversarial review → adjudicate → revise. Plan 3 is the first **public** change; every prior step was dark. |
| 4 | **Never embed in the franchisor site** (Plan 1 decision) — this kills the iframe-bridge carve-out entirely. Bridge retirement is a straight deletion, not a migration. |

---

## ⚠️ Three Plan 2 forward-references are WRONG. Correct them; do not inherit them.

### D-1. The flip cannot be done by editing the shared snippet

`/etc/nginx/snippets/proxy-node-app.conf` hardcodes `proxy_pass http://localhost:3000;` and is included
by **four** sites:

    atxwashateria.com   atxwashdryfold.com   portal.atxwashdryfold.com   rundberglaundry.com

`portal.atxwashdryfold.com` **must stay on :3000**. Editing the snippet would flip the portal too —
an immediate outage of the entire affiliate application.

**Required approach:** add a second snippet (e.g. `proxy-content-app.conf`, identical but
`proxy_pass http://localhost:3001;`) and flip hosts **one at a time** by changing which snippet that
host's server block includes. Rollback per host = swap the include back and reload.

### D-2. `runberglaundry.com` is NOT a valid first flip

Plan 2 §8936: *"Plan 3's first nginx flip (`runberglaundry.com`, oci1)…"*. Measured 2026-09-20:

- There is **no `sites-enabled/runberglaundry.com`** and no `default_server` anywhere.
- The origin answers `301` for that Host by falling through to the first-loaded server block.
- Publicly it `301`s to `https://atxwashateria.com/`.

It is a **typo-domain alias with no content and no config**. There is nothing to flip.
**Pick a real first flip** — `atxwashateria.com` is the lowest-traffic host with real content and is
the recommended candidate. Record the choice and why.

### D-3. Every marketing host carries a legacy `/austin-tx/` rewrite that must be removed

| host | current rewrite |
|:--|:--|
| `rundberglaundry.com` | `rewrite ^ /austin-tx/ last;` |
| `atxwashdryfold.com` | `rewrite ^ /austin-tx/wash-dry-fold/ last;` |
| `atxwashateria.com` | `rewrite ^ /austin-tx/ last;` |

These point at the **Phase-4b-retired franchise marketing tree**. The content app serves `/` directly,
so each rewrite must be deleted **in the same commit as that host's flip** — otherwise the host flips
to `:3001` and immediately 404s on a path the content app does not serve. Plan 2 never mentions them.

---

## Also discovered, must be decided in-plan

**The nginx access gate** (`/etc/nginx/conf.d/wavemax-gate.conf`) is currently **OPEN**
(`geo $allowed { default 1; }`, flipped 2026-05-19). Its `$public_path` allowlist is full of dead
franchise paths (`/austin-tx`, `*-embed.html`, `/franchise-default/`, `/api/v1/contact/austin-tx`,
`/api/austin-tx/`). Since the gate defaults open these are inert, but they are dead config on the
critical path. Decide: prune to the paths the content app actually serves, or delete the gate. Do not
leave it half-true.

---

## Task inventory — everything that must close

### A. The flips (core)
1. Second proxy snippet for `:3001`; per-host include swap; **one host at a time**.
2. Remove each host's `/austin-tx/` rewrite in the same commit as its flip.
3. Per-host Lighthouse gate through Cloudflare **immediately before and after** each flip —
   C14: ≥95 mobile and desktop; per-host spread >3 points **blocks that host**. Baseline is the
   committed table in `docs/development/LIGHTHOUSE-QUALITY-BAR.md`.
4. `proxy_set_header X-Forwarded-Host $host;` — R-3 defence in depth.
5. `INTEREST_FORM_URL` set at cutover.
6. Affiliate env sweep (`BASE_URL`, `LOG_SERVICE_NAME`, `SESSION_COOKIE_NAME`).
7. P-11 device checklist before Phase 1 step 3.

### B. Cleanup the flips unblock
8. Affiliate marketing content + `partner.*` i18n keys removed (independent commit).
9. Five retired CSRF intake rows.
10. **Iframe bridge deletion** — web-core `assets/js/` bridges + `securityHeaders.js:83-88` carve-out.
11. **B-1** — portal landing "Register now" → the interest form (4 locales).
12. **B-2** — interest-form i18n layer (`public/affiliate.html` has **zero** `data-i18n`; the layer is
    the work, not the strings — the page loads no `i18n.js` or switcher).

### C. Absorbed from the former Plan 4
13. **D-2 / PR B7** — rate-limit adoption, including the admin "reset rate limits" control that is a
    **verified double no-op** (targets `rate_limits`; production has 17 `ratelimit_*`).
14. **D-4** — all 208 affiliate `server/` ESLint errors.
15. **B5–B14** inline-copy adoption PRs.

### D. web-core release hygiene (B-5) — one of these is LIVE
16. ⛔ **`injectNonce` emits a duplicate attribute.** Verified live 2026-09-20 on the portal:
    `<meta name="csp-nonce" content="" content="FrHF8VWjliu7jdXUE+Ptxg==">`. HTML takes the **first**
    attribute, so every client-side nonce read returns `""`. Corporate is correct by contrast. Benign
    only while portal CSP does not require a nonce for injected scripts — it breaks the moment CSP is
    tightened. **Fix and add a regression test.**
17. SMTP timeouts — nodemailer defaults let a hung mail host stall ~10 min.
18. web-core logger has **no splat**: `logger.error('msg:', err)` silently drops `err`.
19. `i18n.js` appends `?v=Date.now()` per load, defeating the `/locales` cache.

### E. Findings from the 2026-09-19/20 maintenance window
20. **CF failover gap** — a single-box outage yields ~1–2 min of partial public 502s while the CF LB
    propagates (measured: 188/302 PoPs unhealthy mid-propagation). Fix in nginx (fallback to the peer
    box's `:3001`) or tighten the monitor. Same file and reload as the flips — fold in.
21. Dead portal `.env` keys: `OAUTH_CALLBACK_URI`, `DOCUSIGN_REDIRECT_URI` (both subsystems deleted
    from the code), `BACKEND_URL` (points at a host that 301s).
22. oci2 opens and drops SMTP connections to the mail host repeatedly (`commands=0/0`) — identify.
23. `ofelia` container at ~89% of its 256 MiB cap on the mail box — closest to OOM.

### F. Loose ends
24. **H-1** — CR/LF validator hardening.
25. `crhs-transfer` GitHub repo — delete (owner confirm).
26. Password-reset end-to-end round trip — **human required**, cannot be automated.

---

## Exit criteria — "clean deployment, clear backlog"

1. All four marketing hosts served by `crhs-corporate` on `:3001`; portal still on `:3000`.
2. Per-host Lighthouse C14 satisfied before and after every flip.
3. `tasks/todo.md` has **zero** open D-items; every memory `backlog_*` file is either deleted or
   rewritten as a closed record.
4. ESLint clean in all three repos (affiliate at **0**, not "no increase").
5. No dead config: no `/austin-tx/` rewrites, no franchise paths in the nginx gate, no dead `.env` keys.
6. web-core released with the nonce fix, SMTP timeouts, logger splat and the i18n cache fix.
7. A single written list of anything escalated to the owner/counsel (LICENSE, legal pages), so the
   backlog is clear **because items were closed or escalated**, never because they were forgotten.
