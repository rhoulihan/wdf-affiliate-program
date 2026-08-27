# Clean Stack by Friday (mediation 2026-08-28) — todo

Goal: the cleanest possible production stack by Friday. Full-send scope approved by Rick 2026-08-27.
Split is already live (both boxes: `wavemax` :3000 service + `crhs-corporate` :3001; `crhsent.com → :3001`).

## Tier 1 — nginx hygiene (SAFE, independent) [DONE 2026-08-27]
- [x] Inspected sites-enabled (real files, not symlinks; typo = 503 placeholder)
- [x] Moved stale/dup blocks off-tree to `/root/nginx-stale-backups-20260827/` (both boxes)
- [x] Both boxes reconciled to identical 5-file set (atxwashateria, atxwashdryfold, crhsent.com, portal.atxwashdryfold, rundberglaundry)
- [x] `nginx -t` ZERO conflict warnings (was 18+) → reloaded both boxes
- [x] Verified: crhsent.com/wavemax→200 (corporate), www→301, portal→200 on both boxes

## Tier 4 + Phase B — web-core parity (web-core-internal, strict TDD) [DONE 2026-08-27]
- [x] brand.js + 8 modules env-parameterized in web-core (commit `7abc699`, v0.1.1, pushed)
- [x] web-core suite green (30 suites / 539 tests); madge clean
- [x] Golden CSP verified BOTH directions (no-arg==corporate live; monorepo-args==monorepo inline)
- [x] Corporate suite green (8 suites/68 tests) with ZERO corporate change — guardrail held
- [ ] FALLOUT: corporate `crhsent-parity.test.js` ENOENT (hardcoded `SRC_CRHSENT` → monorepo's deleted crhsent/). Repoint to corporate's own `content/` or retire. Test-only, not deploy-blocking.

### Tier-3 cutover config (from Phase B)
- Monorepo env: `SESSION_COOKIE_NAME=portal.sid` (⚠ CRITICAL — else sessions drop), `LOG_SERVICE_NAME=crhs-portal`, `CORS_EXTRA_ORIGINS=https://portal.atxwashdryfold.com`, `BRAND_*` (its values)
- `buildCspDirectives` args: `{imgSrcSelfOrigins:[], connectSrcSelfOrigins:[], imgSrcExtra/connectSrcExtra/frameSrcExtra:['https://portal.atxwashdryfold.com'], frameAncestors:["'self'"]}`
- Pass truthy `brand` (3rd arg) to readHTMLWithNonce/injectNonce
- Box: git pull crhs-web-core (v0.1.1) + symlink `/var/www/wavemax/crhs-web-core → /var/www/crhs-web-core` + monorepo `npm install` + set env + pm2 reload

## Tier 2 — service-only DEPLOYED [DONE 2026-08-27]
- [x] committed e2107288, full suite: 2758 pass (2 fails BOTH pre-existing: i18n-brand-token + expediter early-AM date-boundary — neither Tier-2-caused)
- [x] deployed oci1 + oci2 (git pull --ff-only + pm2 reload); /health UP, portal+app+rundberg+crhsent all 200

## Tier 3 — service app consumes @crhs/web-core [COMMITTED 4447fec3, DEPLOY HELD 2026-08-27]
- [x] Consumes web-core for CSP builder + security headers + 10 shimmed modules (encryption, cspHelper, logger, csrf, ipGate, cspNonce, clientIp, controllerHelpers, validateSecrets, geocodingService)
- [x] Kept inline (deliberate): session (Oracle-diag store handle), CORS (excludes franchisor domains), storeIPs+template-manager+SystemConfig+utility mods (test-coupling)
- [x] Golden-master byte-identical (CSP strict+non-strict, portal.sid cookie, encryption); full suite 2764 pass (only pre-existing i18n fails)
- [x] Committed 4447fec3 + pushed
- [ ] ⛔ DEPLOY HELD — oci1 crash-looped on reload: **ORA-04036 (Oracle ADB PGA memory limit)**. `require('@crhs/web-core')` eagerly loads web-core's full index incl. DB-touching modules (SystemConfig/mongo diagnostics → likely 2nd mongoose/connection footprint), tipping the memory-constrained ADB. Rolled back oci1 to e2107288, both boxes healthy on Tier 2.
- [ ] FIX (post-Friday): make web-core index lazy-load DB modules (or monorepo requires web-core submodules directly) so no extra DB footprint; re-test; re-deploy. Box already staged: /var/www/crhs-web-core=v0.1.1, symlink /var/www/wavemax/crhs-web-core exists.

## STACK STATE (2026-08-27, live both boxes)
- Tier 1 (nginx clean) ✅ live · Tier 2 (service-only) ✅ live · corporate serves crhsent ✅ · web-core v0.1.1 ✅ committed · Tier 3 ✅ committed, ⛔ deploy held (ADB)
- Visible "independent components" separation is LIVE + the refactoring is in git; only the invisible web-core-consumption plumbing is undeployed.

## Tier 2 — service-only (strip dead crhsent/corporate code) [live app]
- [ ] Scope what crhsent/corporate code remains in the monorepo (server.js host chain, crhsent/ tree, accessGate, mediatorGate)
- [ ] Remove it (move-then-delete); service app boots; all service routes/tests green
- [ ] Deploy oci1 → verify → oci2 → verify

## KEY FINDINGS (2026-08-27 scoping)
- Full-send scope CONFIRMED by Rick (twice, incl. after I surfaced the session-drop/parity risk).
- Split already LIVE both boxes: `wavemax`:3000 + `crhs-corporate`:3001; crhsent.com→:3001 (verified 200).
- **Tier 2 DEAD set** (crhsent-only, unreachable on :3000): accessGate, mediatorGate, crhsent host-handler, crhsent/ tree (1.2M dupe of corporate). KEEP: partnerLanding (marketing domains), explorerGuard + design-explorer (LIVE on rundberg), locationQuarantine app-domain branch.
- **Tier 3 dep mechanism (proven by corporate):** `"@crhs/web-core":"file:../crhs-web-core"` + `require('@crhs/web-core')`. Box paths: web-core `/var/www/crhs-web-core`, monorepo `/var/www/wavemax/wavemax-affiliate-program` (nested) → add box symlink `/var/www/wavemax/crhs-web-core → /var/www/crhs-web-core` so `file:../crhs-web-core` resolves.
- **web-core is SHARED with live corporate** → Phase-B parity must be ENV-PARAMETERIZED (brand/cookie/CSP), not hardcoded; RE-VERIFY corporate (tests + crhsent.com live) after any web-core change.

## Post-Friday / deferred
- Repo archival/private (litigation-hold: preserve, don't delete; commit history is cited evidence)
