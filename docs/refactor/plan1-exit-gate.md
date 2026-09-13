# Plan 1 (Release R1/R2) — exit-gate evidence

Evidence file for the separation Plan 1 gates. Each section is backed by pasted,
real command output. Created at Task 16; the Deploy A / G1 records that Tasks 11
and 12 produced live in the (gitignored) plan working notes rather than here —
see the divergence note under the LOG_DIR section.

## LOG_DIR evidence (read-only, 2026-09-11) — the WRITE is Plan 2 Phase 0a

| box | affiliate LOG_DIR | corporate LOG_DIR | stray logs inside node_modules/@crhs/web-core/logs |
|---|---|---|---|
| oci1 161.153.71.201 | `LOG_DIR=logs` (.env line 65, **relative**) | `LOG_DIR=logs` (.env line 65, **relative**) | affiliate: `audit.log` (1201 B) + `security-critical.log` (1201 B), dir created Sep 10 22:24 (Deploy A), last written **Sep 11 05:04**. corporate: **no such directory** |
| oci2 144.24.4.202 | `LOG_DIR=logs` (.env line 65, **relative**) | `LOG_DIR=logs` (.env line 65, **relative**) | affiliate: `audit.log` (404 B) + `security-critical.log` (404 B), dir created Sep 10 22:26 (Deploy A), last written **Sep 11 07:41**. corporate: **no such directory** |

**LOG_DIR is SET on all four .env files, not unset** — but to the relative value
`logs`, which resolves against `process.cwd()` (the pm2 app cwd), not against an
absolute path. It works today only because pm2 starts both apps from their app
root.

The defect is live and confirmed by mechanism, not just by inference. On both
boxes the deployed web-core v0.1.3 resolves the two loggers differently:

```
node_modules/@crhs/web-core/src/utils/logger.js:11
  const logDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');   # honours LOG_DIR
node_modules/@crhs/web-core/src/utils/auditLogger.js:17,23
  filename: path.join(__dirname, '../../logs/audit.log'),                     # ignores LOG_DIR
  filename: path.join(__dirname, '../../logs/security-critical.log'),
```

So `combined.log` / `error.log` already land correctly (affiliate
`/var/www/wavemax/wavemax-affiliate-program/logs/`, corporate
`/var/www/crhs-corporate/logs/`, both written within the last minute when
sampled), while the **security audit trail is being written inside the installed
package**: four `SUSPICIOUS_ACTIVITY` events dated 2026-09-11T01:29Z, 03:31Z,
05:04Z (oci1) and 07:41Z (oci2). Those directories carry the Deploy A mtime,
which means every `npm install --install-links` re-copy of the package very
likely discards the audit trail accumulated since the previous deploy.

web-core v0.2.0 makes LOG_DIR effective for auditLogger (B3a, Task 14). Plan 1 writes
NO prod .env key (Global Constraints 14/17). Plan 2 Phase 0a must, confirm-first,
per box, replace the **relative** `LOG_DIR=logs` with an absolute path:
`LOG_DIR=/var/www/crhs-corporate/logs` in the corporate .env (spec §7.2.7,
§7.6.6) and `LOG_DIR=/var/www/wavemax/wavemax-affiliate-program/logs` in the
affiliate .env — backing up each .env to /var/www/wavemax/env-backups/ (NEVER
inside a repo checkout — 2026-08-24 .env.bak exposure lesson) and reloading with
`pm2 reload <app> --update-env`.

Two constraints on the value Plan 2 0a picks for the affiliate:

1. The affiliate's **own** `server/utils/auditLogger.js:17,23` also hardcodes
   `path.join(__dirname, '../../logs/...')` and ignores LOG_DIR entirely. Any
   affiliate LOG_DIR other than
   `/var/www/wavemax/wavemax-affiliate-program/logs` therefore **splits the
   audit trail** between web-core events and app events. The value above keeps
   them in one file.
2. Because the current value is relative rather than unset, shipping Task 14
   alone would already relocate the stray audit writes to `<cwd>/logs`. The
   Phase 0a write is still required: relative-to-cwd is silently wrong for
   anything not started by pm2 from the app root (cron jobs, one-off scripts).

## Plan 1 exit gate — SIGNED OFF 2026-09-12

`@crhs/web-core@0.2.0` (tag `v0.2.0`, commit `2dcd6ff`) is live on both boxes with
its co-requisite consumer PRs. Both apps run ONE mongoose. Suites green. Zero
user-visible change.

### Evidence
| check | result |
|---|---|
| web-core suite | 572 passed / 572, 33 suites |
| corporate suite | 99 passed, exactly the 4 accepted `crhsent-parity` ENOENT failures |
| one mongoose — affiliate + corporate, oci1 + oci2 | `mongoose_same=true` ×4 |
| installed core — both apps, both boxes | `0.2.0`, surface `26` keys ×4 |
| 6 hostnames through Cloudflare | 5×200 + 1×301 (intended redirect) |
| CF LB pool | healthy, 2 origins |
| corporate session cookie | `__Host-wavemax.sid` unchanged — **zero gated sessions dropped** |
| access gate | enforcing (`/services` 401), exempt paths public by design |
| CSRF (boot-breaker #2) | `/api/csrf-token` 200; token-less POST reaches validation (400), not 403 |
| CSP | Firebase auth-helper origin present; **0** franchisor references |
| operator IP gate | still 404s an outside IP (owner decision: KEEP) |
| admin surface | reachable (owner decision: OPEN); admin API unauth still 401 |

### Spec deviations Plans 2/3/4 inherit
- **B3g / B3j / B3k → v0.2.1** with Plan 2 Phase 0a, and with them spec §7.2.2's
  repo-wide `tests/brandNeutral.test.js`. Plan 1 ships two file-scoped substitutes
  only — do not mistake those for the guard.
- **corporate `SESSION_COOKIE_NAME` + `collectionName: 'sessions_corporate'` → Plan 2
  Phase 0a.** Verified UNSET on both boxes; the live cookie base is pinned explicitly.
- **The five retired CSRF intake rows → Plan 3**, deleted with the routes. Verified
  still exempt in production; pruning early 403s two live public forms.
- **`securityHeaders.js:83-88` + the bridges → Plan 3.** ⚠️ PARTIALLY OVERTAKEN: the
  franchisor origins were removed from `iframe-bridge-v2.js` in BOTH repos on
  2026-09-11 (owner: "we will never embed in the franchisor site"), which voided that
  half of the carve-out's premise.
- **Affiliate PR B7 → Plan 4.** Includes three LIVE defects, notably that the admin
  "reset rate limits" control targets a `rate_limits` collection that does not exist
  while the store writes 17 `ratelimit_*` collections — it deletes nothing and reports
  success. Verified against the production database.
- **The production `LOG_DIR` write → Plan 2 Phase 0a.** `LOG_DIR=logs` (RELATIVE) on
  all four .env files — the Plan 2 wording "if UNSET, add" would wrongly skip both.

### Operational findings that outlived the plan
1. **`npm install --install-links` does NOT re-copy a `file:` dependency when the
   version is unchanged** — and, disproving this plan's own Task 54 premise, it does
   not re-copy on a version BUMP either. Measured: plain install, `--force` and
   `--package-lock-only` all leave the old copy. Only
   `rm -rf node_modules/@crhs/web-core` works, and it leaves the lockfile stale,
   re-arming the trap. **Mandatory on every deploy.**
2. **The affiliate and web-core are a BIDIRECTIONAL boot-breaker pair.** Core no
   longer exports `conditionalCsrf`/`csrfTokenEndpoint`; either half deployed alone
   stops the portal booting. Always verify the installed version + `createCsrf` +
   26-key surface BEFORE `pm2 reload`.
3. **A boot probe on a box where the app is already running must `process.exit(0)`
   after the require**, or it measures port availability (EADDRINUSE) instead of boot
   health and fails safe for the wrong reason.
4. ~~corporate's pm2 out-log has been stale since 2026-08-23~~ **CORRECTED 2026-09-13:
   not a defect.** web-core's production logger has no Console transport
   (`crhs-web-core/src/utils/logger.js:45` adds Console only when
   `NODE_ENV !== 'production'`), so pm2 stdout is empty BY DESIGN for both apps.
   Application logs are in `$LOG_DIR/combined.log` — corporate's is live at
   `/var/www/crhs-corporate/logs/combined.log` (10 MB, written continuously). Boot
   evidence was available all along; Task 57 should have read that file. The file
   does expose two real defects: corporate lines are tagged
   `service: "wavemax-affiliate"` (`LOG_SERVICE_NAME` unset → web-core's branded
   default), and accessGate's 60-second cache refresh writes
   `Access gate cache loaded` every minute per worker (~61,000 lines), so that line
   is NOT a boot marker.
