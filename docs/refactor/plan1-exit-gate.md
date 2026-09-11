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
