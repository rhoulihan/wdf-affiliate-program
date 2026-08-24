# Phase 4c — De-brand Tail (code brand-neutrality) — Design

**Status:** proposed (awaiting review)
**Date:** 2026-08-24
**Supersedes:** the "deferred marketing/franchise/CSS-class + asset renames" item in the debrand program (franchise marketing already deleted in Phase 4b).

## 1. Goal & non-goals

**Goal:** remove *hardcoded* `wavemax` from the **code** — CSS class/variable names and asset filenames — so the codebase is brand-neutral and the brand lives entirely in config. This drains the branding-guard baseline toward its legitimate floor and unblocks the parked white-label platform-baseline extraction.

**NOT a goal:** removing the *displayed* "WaveMAX Austin" brand. That is intentional (Phase 3) and already config-driven via `server/config/brand.js` (`BRAND_DISPLAY_NAME` etc.). Display copy stays.

**Guiding rule:** rename only tokens that are *code identifiers* (CSS selectors/variables, internal asset filenames). Never touch: display copy, URL slugs / external references, or the deliberate franchisor-evidence content.

## 2. Explicit KEEP set (never touched)
- `crhsent/wavemax/*` — mediator/evidence pages that document the franchisor by name (intentional).
- `public/wavemax-affiliate.html` **file + its display branding** — the WaveMAX-themed affiliate ad funnel (Phase 3 keep). Its internal CSS *classes* are still renamed (§4.2); the visible "WaveMAX" copy stays.
- URL slugs / external refs: `wavemax-austin-affiliate-program` (WordPress-parent path), `wavemax-affiliate-program` and any `/wavemax-affiliate` **route** literal, `www.wavemaxlaundry.com` external URLs.
- `"WaveMAX Austin"` display strings (config-driven).
- Infra/guard files that inherently carry the token (branding-guard/domain-guard, `server.js` host routing) — already guard-excluded.

## 3. Workstreams

### 3.1 Delete obsolete WordPress-embed helper pages
Verified **unreferenced, no server route**: `public/wavemaxlaundry-embed-code.html`, `public/wavemaxlaundry-embed-code-complete.html`, `public/iframe-parent-example.html`, `public/iframe-parent-example-complete.html`. The app runs standalone at portal now. `git rm` all four + drop their branding-guard exclusions.

### 3.2 Hard-rename `wavemax-*` CSS classes + custom properties (no aliases)
Classes/vars are defined across 8 CSS files (`theme.css`, `embed-landing.css`, `claim.css`, `affiliate-{dashboard,login,register,register-embed,success}.css`) and used in HTML `class="..."` + JS `classList`/`className`/template strings.

**Naming convention (brand-neutral):**
- **CSS custom properties** (color/theme palette): `--wavemax-blue → --brand-blue`, `--wavemax-primary(-light) → --brand-primary(-light)`, `--wavemax-secondary(-bg) → --brand-secondary(-bg)`, `--wavemax-light-blue → --brand-light-blue`, `--wavemax-accent → --brand-accent`, `--wavemax-primary-bg → --brand-primary-bg`.
- **Color utility classes**: `.wavemax-blue → .brand-blue`, `.wavemax-primary → .brand-primary`, `.wavemax-secondary → .brand-secondary`, `.wavemax-light-blue → .brand-light-blue`, `.wavemax-secondary-bg → .brand-secondary-bg`, `.wavemax-primary-bg → .brand-primary-bg`, `.wavemax-accent → .brand-accent`.
- **Structural classes**: `.wavemax-iframe → .app-iframe`, `.wavemax-affiliate-iframe → .affiliate-iframe`, `.wavemax-affiliate-header → .affiliate-header`, `.wavemax-embed-container → .embed-container`, `.wavemax-affiliate-container → .affiliate-container`, `.wavemax-theme → .app-theme`, `.wavemax-affiliate → .affiliate-brand`, `.wavemax-language → .language-switcher`, `.wavemax-austin-pickup → .austin-pickup`, `.wavemax-affiliate-ad → .affiliate-ad`.

**Method:** each rename touches its CSS definition **and every reference** (HTML/JS), in the same unit. Rename `.min` sources are rebuilt via `npm run build:assets`. **Per-class verification:** after each rename, `git grep` for the old token returns zero in code; a visual smoke check confirms colors/layout unrendered-unchanged. The build phase produces the exact per-token map (classifying each as var/class/keep) with the branding-guard as the net.

### 3.3 Config-driven asset paths (+ neutral internal filenames)
- **Images** — `logo-wavemax.png`, `wavemax-affiliate-og.png`: extend `server/config/brand.js` with env-sourced `logoPath` / `ogImagePath` (defaults to neutral filenames). Reference via config in the templates/CSP-helper + `<meta og:image>`; rename the files to neutral (`logo.png`, `affiliate-og.png`). This lets a future white-label swap the asset by env alone.
- **Internal CSS files** — `wavemax-theme.css`, `wavemax-components.css`, `wavemax-affiliate.css`: rename to neutral (`brand-theme.css`, `brand-components.css`, `affiliate.css` — avoid colliding with the existing `theme.css`). Update every `<link>` + the `build-assets.js` ASSETS manifest.
- **Flyer PDFs** — `wavemax-affiliate-flyer-{landscape,portrait}.pdf`: rename to `affiliate-flyer-*.pdf` + update `tools/flyers/build-flyers.js` and any download link. (Low value; include for completeness.)

## 4. Verification
- `tests/unit/branding-guard.test.js` baseline drains toward the legitimate floor (crhsent evidence, wavemax-affiliate.html display copy, guard/infra self-refs) — the remaining allow-list entries are only the intentional keeps in §2.
- Full `npm test` green (controller-run).
- **Visual smoke:** the affiliate/customer/operator/admin pages + /claim render with identical styling (the class/var rename is cosmetic-neutral) — verified in a browser before deploy.
- Deploy: `git pull` + `pm2 reload` both boxes; bump `?v=` on every changed CSS/JS asset (CF caches immutable); browser-verify styling + og image.

## 5. Approach & risk
- **Hard rename, no aliases** (per decision) — the branding-guard + full suite + visual smoke catch any missed reference. A missed class reference degrades styling (visible), not function.
- Move in small, reviewable units (color palette first, then structural classes, then assets, then deletions) so each is independently verifiable.
- Suggested execution: subagent-driven, one workstream group per task, shrinking-baseline guard as the gate (same pattern as Phase 3).
