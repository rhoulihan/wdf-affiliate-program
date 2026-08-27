# Split Catch-up — Gap Analysis (monorepo → web-core / corporate)

**Date:** 2026-08-27
**Author:** Claude (read-only analysis; nothing applied)
**Scope:** the 79 monorepo commits `aad2cd3d..HEAD` (split-spec → now) that post-date the
2026-08-22 copy-out of `crhs-web-core` and `crhs-corporate`. Classifies each by target using
the split inventory (`2026-08-22-service-corporate-split-program-design.md` §3) and records what
must be replicated. **Decided end-state:** monorepo stays the SERVICE app; service-only changes
need no action.

---

## Summary

| Bucket | Count (approx.) | Meaning |
|---|---:|---|
| **Total commits** `aad2cd3d..HEAD` | **79** | includes the 7 trailing split-planning-doc commits |
| **Service-only (no action)** | ~50 | service routes/controllers/models/embed HTML/service locales/tests/docs, plus all Phase-4b franchise-retirement deletions (target never existed in corporate) |
| **Touch web-core (SHARED)** | ~18 | mostly Phase-3 de-brand + Phase-4a domain-migration edits to shared modules; 3 are functional |
| **Touch corporate** | ~5 | but only the **logo-asset-path rename** has a live target in the crhsent-only corporate build |
| **Mixed** | ~15 | counted in both of the above where a single commit spans targets |

**Frozen-repo reality (verified):**
- `crhs-web-core` is a **pre-Phase-3 / pre-Phase-4a snapshot**: 29 `wavemax` hits in `src/`, 31 in
  `assets/`; no `brand.js`; `SystemConfig` default rate still `1.25`; `iframe-bridge-v2.js` still
  carries Austin-franchise standalone code; legal pages still say "10% of WDF revenue".
- `crhs-corporate` was built **crhsent.com-only** (Phase-2 narrowed scope). It contains **no**
  franchise marketing, design-explorer, `partnerLanding`, `franchisePreview`, `explorerGuard`,
  `corporate.json`, or interest-form services — so everything Phase-4b deleted was **never there**.

---

## web-core replication tasks

> All are edits to files that already exist in `crhs-web-core`. web-core is intended to be
> brand-neutral, so the many "genericize brand string / comment" edits are **cosmetic** and only
> matter if you decide to de-brand web-core now (Decision C). The **functional** ones (⚠) matter
> regardless.

1. ⚠ **`src/models/SystemConfig.js`** — bump `wdf_base_rate_per_pound` default `1.25 → 1.40`
   (value + defaultValue, ~L250-252). Source: `c657aff6`. Also `a36288e4` genericized brand
   strings here. *(web-core ships the defaults; confirm init ownership — Decision D.)*
2. ⚠ **`assets/js/iframe-bridge-v2.js`** — port the franchise/Austin cleanup: remove the
   standalone `fetch('/data/franchises/austin-tx.json')` + `window.FranchisePage` block (still
   present, ~L117-138) and re-minify. Source: `427bf3f0`.
3. ⚠ **`assets/legal/terms-and-conditions.html`**, **`assets/legal/privacy-policy.html`**,
   **`assets/legal/refund-policy.html`** — all three DIFFER from the monorepo's `public/*.html`.
   Port: commission text `10% of WDF revenue plus 100% of delivery fees` → `100% of your flat
   delivery fee` (terms), brand tokenization, and logo-path refs. Sources: `0768dfd3` (terms,
   commission), `c0bb9a2c` (logo path, all 3), `a1ae96eb` + `c1dfff6f` (brand tokens, all 3).
4. **`src/security/cspDirectives.js`** — domain-migration CSP drift: add
   `portal.atxwashdryfold.com` to self-origins (`96086156`), `frame-ancestors → 'self'`
   (`1e5e5b05`), drop redundant portal from frame-ancestors (`0171dcf4`). *(Phase-4 change — may
   be intentionally deferred for web-core too; see Decision C.)*
5. **`src/utils/cspHelper.js`** — brand-token injection into served HTML is absent in web-core
   (verified: no `brand` refs). Added in monorepo by `a23aaaaf` + `7779b5c0`; `a36288e4`
   genericized. **Blocked on Decision B** (does web-core own brand?).
6. **`assets/js/i18n.js`** — brand-token support (`window.BRAND` / `{{brandName}}`) absent in
   web-core. Sources: `9d6cd0ed`, `cd0b42a8`, `a23aaaaf`. **Blocked on Decision B.**
7. **`src/email/template-manager.js`** — brand-resolve in base template (still hardcodes
   `<h1>WaveMAX Laundry</h1>`, ~L129) + config-driven og path. Sources: `154b021a`, `7779b5c0`.
   **Blocked on Decision B.**
8. **`src/email/transport.js`** — brand-resolve of the default `From` (still hardcodes
   `"WaveMAX Laundry"`, ~L68). Source: `154b021a`. **Blocked on Decision B.**
9. **`src/config/sessionStore.js`** — session cookie name `wavemax.sid` / `__Host-wavemax.sid`
   → `portal.sid` (monorepo renamed in `0f38f0a1`). *(Cookie name; Phase-4a. Cosmetic unless you
   want parity — but note cookie-name changes invalidate live sessions.)*
10. **`src/utils/logger.js`** — `defaultMeta.service` `wavemax-affiliate` → `crhs-portal`
    (`6a605cda`). *App-specific tag; better handled by each app overriding `defaultMeta` than
    hardcoding in web-core.*
11. **cosmetic brand-string genericization** (only if Decision C = "de-brand web-core now"):
    `src/config/storeIPs.js` (`a36288e4`,`00c2ef97`), `src/middleware/cspNonce.js`,
    `sanitization.js`, `rateLimiting.js`, `src/utils/encryption.js`, `src/config/csrf-config.js`
    (comment), `assets/js/language-switcher.js`, `assets/js/parent-iframe-bridge-v3.js`
    (`9d6cd0ed`). All are comments / neutral labels — no behavior change.

**Non-action divergence to note:** `0df8d96d` deleted `previewUnlockCookie.js` from the monorepo
(orphaned after franchise retirement). web-core **legitimately keeps** `src/utils/previewUnlockCookie.js`
(corporate `franchisePreview` will use it). Do **not** delete it from web-core.

---

## corporate replication tasks

> Only files that exist in the crhsent-only `crhs-corporate` build. Corporate deliberately keeps
> "WaveMAX" (it is the mediator/corporate site) — do **not** de-brand it.

1. ⚠ **`server/middleware/accessGate.js`** — logo asset path is stale and now 404s. Monorepo
   renamed `logo-wavemax.png → logo.png` (`7779b5c0`) and the served franchisor logo was replaced
   with a wordmark (`c48785ca`); per memory `logo-wavemax.png` now 404s. Corporate still points at
   it in two places: L97 (`p === '/assets/images/brand/logo-wavemax.png'`) and L250
   (`<img src="https://rundberglaundry.com/assets/images/brand/logo-wavemax.png">`). Update both to
   `logo.png`. *(Monorepo also moved these to `brand.logoPath`/`brand.displayName`; corporate has
   no `brand.js`, so hardcode `logo.png` unless Decision B moves brand → web-core.)*
2. ⚠ **`content/owners/index.html`** — same stale ref: L30
   `<img src="/assets/images/brand/logo-wavemax.png">` → `logo.png`. Source: `7779b5c0`
   (only crhsent file changed in the monorepo since the split).

**Corporate-destined-but-no-target (record only; no action):** interest-form email fixes
(`ee567c9f`, `f6633551`, parts of `78e3bd6a`) touch `affiliateApplicationService.js` /
`partnerInquiryService.js`; `9df799d1` touches `partner-program.html`; `c00c49bd` a crhsent test.
None of these files were migrated to corporate (Phase-2 = crhsent-only), so there is nothing to
replicate until/unless that intake is moved (Decision A / §3.D).

---

## Decisions needed

- **A. Franchise-marketing retirement vs. the split design.** `crhs-corporate` was built
  crhsent-only and **never contained** the franchise/Austin marketing, design-explorer,
  `franchiseController`, `franchisePreview`, `partnerLanding`, `corporateInquiry`, or
  `networkReviews` that split-design §3.B still lists as corporate-destined. Phase-4b then
  **deleted all of it** from the monorepo (deliberate, deployed, ~-63k lines). So the 4b retirement
  needs **no** re-application to corporate. **Recommendation:** treat it as permanently retired —
  amend §3.B to strike that inventory and declare corporate's scope = crhsent.com. Separately decide
  the one kept piece: the recruitment intake (`affiliateApplication*` / `partnerInquiry*` /
  `public/affiliate.html`, §3.D) — leave it in the service app, or still move it to corporate later?
  *Recommend: leave in service for now; revisit if/when corporate expands.*
- **B. Does `brand.js` become a web-core concern?** `brand.js` was born in the service repo during
  Phase-3, but the brand hooks were wired into web-core-owned modules (`cspHelper`, `i18n.js`,
  `template-manager`, `transport`). web-core has none of it. **Recommendation:** move `brand.js`
  into web-core and port the four brand hooks, giving one brand source; the service app sets
  `BRAND_DISPLAY_NAME="WaveMAX Austin"`, corporate sets `="WaveMAX"`. Keeping brand.js service-only
  would force the service repo to fork cspHelper/i18n locally, defeating web-core. (Unblocks
  web-core tasks 5-8.)
- **C. web-core de-brand + domain-migration sync scope — now or with Phase 3/4?** web-core is a
  pre-de-brand / pre-domain-migration snapshot. Per program spec §2/§5 the service-repo de-brand
  (Phase 3) and domain migration (Phase 4) were explicitly **deferred until after the split is live
  and stable**. **Recommendation:** port only the 3 **functional** web-core deltas now (tasks 1-3:
  SystemConfig rate, iframe-bridge franchise cleanup, legal-page commission text) and defer the
  cosmetic brand-string + CSP-origin/cookie/logger-tag genericization (tasks 4,9,10,11) to a
  dedicated web-core de-brand pass aligned with Phase 3/4. Note cookie-name (task 9) changes
  invalidate live sessions — sequence with the service cutover.
- **D. `SystemConfig.initializeDefaults` ownership vs the shipped default.** Spec §4 says the
  service app owns running init; web-core ships the model *with* the `1.25` default. Confirm the
  rate source-of-truth and sync web-core to `1.40` (the stale value only bites on a fresh-DB init,
  but it is a real source-of-truth drift).

---

## Commits requiring no action (service-only)

Claim/app/SPA, service business logic, service locales, operational email dispatchers+templates,
service tests/docs, and all Phase-4b franchise-retirement deletions (no corporate target existed):

```
7428a676 50b56177 6e22c1fa 78e3bd6a 631ea9af cf920b78 0872d0b7 4be836f5 1190bee4 2c3a7fe5
4372cc98 a90d587c 4e031cb6 933a9127 2788c7dc 0df8d96d 565ad34b f51a943b 4ab0898b 16047ace
ab485bae 789b09b7 e8b44da0 1e632538 9e2e8133 36fec473 a66f8411 d70e2ac2 a4b0da47 c03bb3e1
0f38f0a1 2e8ec0a4 e09097a7 32caf5f7 bf29949b 4052a192 c00c49bd b85dd847 b4e49153 d63f27a2
87ea6914 776b2b26 0aeee07a befced3e d00763f3 8b044dac c680c25e 83df7334 9746ffd4 b273a07f
f927b597 235a464e
```

**Mixed commits** (service portion needs no action; web-core/corporate portions are itemized in the
task lists above): `0768dfd3 9df799d1 c48785ca c657aff6 1e5e5b05 f6633551 ee567c9f 3920e863
2bb86689 7779b5c0 427bf3f0 0171dcf4 01f61cda 32c1dbee c0bb9a2c 6a605cda 96086156 00c2ef97
a36288e4 154b021a 9d6cd0ed a1ae96eb c1dfff6f cd0b42a8 a23aaaaf ae0c1fcb`.
