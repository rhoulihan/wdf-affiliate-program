# Phase 4c — De-brand Tail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** remove hardcoded `wavemax` from code — CSS class/variable names + asset filenames — so the code is brand-neutral; displayed "WaveMAX Austin" stays (config-driven).

**Architecture:** hard rename (no aliases) of CSS custom properties + classes across the 8 defining CSS files and all HTML/JS references; config-driven image paths via `server/config/brand.js`; rename internal CSS/asset files; delete 4 obsolete embed-code pages. Guard + full suite + visual smoke are the safety net.

**Spec:** `docs/superpowers/specs/2026-08-24-phase4c-debrand-tail-design.md`

## Global Constraints
- **Rename only code identifiers.** Never touch: display copy, the `crhsent/wavemax/*` evidence pages, `wavemax-affiliate.html` visible branding, URL slugs (`wavemax-austin-affiliate-program`, `/wavemax-affiliate` route literal), `www.wavemaxlaundry.com` external URLs, or the guard/`server.js` host-routing self-refs (already guard-excluded).
- **No backward-compat aliases** — every reference updated in the same task.
- Rebuild `.min` via `npm run build:assets` whenever a source CSS/JS changes; stage the min.
- Maintain i18n parity (no user-facing copy changes here, but if any `data-i18n` markup moves, keep 4 languages).
- After each task: `git grep` the renamed token → zero in code (outside KEEP); `npm test` for touched suites; `npx jest tests/unit/branding-guard.test.js` still green.
- No file in `server/` over 800 lines; `console.*` blocked in `server/` (logger only).

## Naming map (authoritative)
- Custom props: `--wavemax-blue→--brand-blue`, `--wavemax-primary(-light)→--brand-primary(-light)`, `--wavemax-secondary(-bg)→--brand-secondary(-bg)`, `--wavemax-light-blue→--brand-light-blue`, `--wavemax-accent→--brand-accent`, `--wavemax-primary-bg→--brand-primary-bg`.
- Color utility classes: `.wavemax-{blue,primary,secondary,light-blue,secondary-bg,primary-bg,accent,primary-light}→.brand-{same}`.
- Structural classes: `.wavemax-iframe→.app-iframe`, `.wavemax-affiliate-iframe→.affiliate-iframe`, `.wavemax-affiliate-header→.affiliate-header`, `.wavemax-embed-container→.embed-container`, `.wavemax-affiliate-container→.affiliate-container`, `.wavemax-theme→.app-theme`, `.wavemax-affiliate→.affiliate-brand`, `.wavemax-language→.language-switcher`, `.wavemax-austin-pickup→.austin-pickup`, `.wavemax-affiliate-ad→.affiliate-ad`.
- Assets: `logo-wavemax.png→logo.png`, `wavemax-affiliate-og.png→affiliate-og.png`, `wavemax-theme.css→brand-theme.css`, `wavemax-components.css→brand-components.css`, `wavemax-affiliate.css→affiliate.css`, `wavemax-affiliate-flyer-{landscape,portrait}.pdf→affiliate-flyer-{landscape,portrait}.pdf`.

---

### Task 1: Delete obsolete WordPress-embed helper pages
**Files:** delete `public/wavemaxlaundry-embed-code.html`, `public/wavemaxlaundry-embed-code-complete.html`, `public/iframe-parent-example.html`, `public/iframe-parent-example-complete.html`; edit `tests/unit/branding-guard.test.js` (drop their exclusions).

- [ ] **Step 1:** Re-verify unreferenced: `git grep -lE "wavemaxlaundry-embed-code|iframe-parent-example" -- server/ public/ ':!public/wavemaxlaundry-embed-code*.html' ':!public/iframe-parent-example*.html'` → nothing. `grep -nE "iframe-parent-example|wavemaxlaundry-embed-code" server.js` → no route.
- [ ] **Step 2:** `git rm` the 4 files.
- [ ] **Step 3:** In `branding-guard.test.js`, remove any EXCLUDED_FILES entries pointing at the 4 deleted files (verify with `test -e` they're gone). Run `npx jest tests/unit/branding-guard.test.js` → green.
- [ ] **Step 4:** Commit `chore(phase4c): delete obsolete WordPress embed-code + iframe-example pages`.

### Task 2: Rename color palette — CSS custom properties + color utility classes → `brand-*`
**Files:** the 8 CSS files defining them (`public/assets/css/{theme,embed-landing,claim,affiliate-dashboard,affiliate-login,affiliate-register,affiliate-register-embed,affiliate-success}.css`) + every HTML/JS reference; rebuilt `.min`.

- [ ] **Step 1:** Enumerate exact tokens: `git grep -hoE "\-\-wavemax-[a-z-]+|\.wavemax-(blue|primary|secondary|light-blue|accent|primary-light|primary-bg|secondary-bg)" -- public/ ':!*.min.*' | sort -u`. Map each per the naming map.
- [ ] **Step 2:** Rename every custom-property definition + `var(--wavemax-*)` usage, and every color utility class definition + `class=`/`classList`/template usage, across CSS + HTML + JS. Do NOT touch KEEP tokens.
- [ ] **Step 3:** `npm run build:assets`; stage rebuilt `.min`.
- [ ] **Step 4:** `git grep -nE "\-\-wavemax-|\.wavemax-(blue|primary|secondary|light-blue|accent|primary-light|primary-bg|secondary-bg)|wavemax-(blue|primary|secondary|light-blue|accent)" -- public/ ':!*.min.*'` → nothing. Run any CSS/asset-related tests + `branding-guard` → green.
- [ ] **Step 5:** Commit `refactor(phase4c): rename color palette wavemax-*→brand-* (CSS vars + utility classes)`.

### Task 3: Rename structural classes → semantic
**Files:** the CSS files defining them + every HTML/JS reference; rebuilt `.min`.

- [ ] **Step 1:** Enumerate: `git grep -hoE "wavemax-(iframe|affiliate-iframe|affiliate-header|embed-container|affiliate-container|theme|affiliate|language|austin-pickup|affiliate-ad)" -- public/ ':!*.min.*' | sort -u`. Confirm each is a CSS class / class-usage (NOT a URL slug or the `wavemax-affiliate.html` filename or the `wavemax-austin-affiliate-program` slug — leave those).
- [ ] **Step 2:** Rename per the naming map (definition + all `class=`/`classList`/`querySelector`/template refs). `.wavemax-affiliate` → `.affiliate-brand` only where it is a class; leave the `/wavemax-affiliate` route literal and the `wavemax-affiliate.html` filename.
- [ ] **Step 3:** `npm run build:assets`; stage `.min`.
- [ ] **Step 4:** `git grep -nE "class=\"[^\"]*wavemax-(iframe|affiliate-iframe|affiliate-header|embed-container|affiliate-container|theme|language|austin-pickup|affiliate-ad)\b|\.wavemax-(iframe|affiliate-iframe|affiliate-header|embed-container|affiliate-container|theme|language|austin-pickup|affiliate-ad)" -- public/ ':!*.min.*'` → nothing. Tests + `branding-guard` green.
- [ ] **Step 5:** Commit `refactor(phase4c): rename structural wavemax-* classes to semantic names`.

### Task 4: Config-driven image paths + rename image files
**Files:** `server/config/brand.js`, the templates/CSP-helper + `<meta og:image>` refs, `public/assets/images/brand/logo-wavemax.png`, `public/assets/images/wavemax-affiliate-og.png`.

- [ ] **Step 1 (test-first):** add a unit test asserting `brand.logoPath` / `brand.ogImagePath` resolve from env with neutral defaults (`/assets/images/brand/logo.png`, `/assets/images/affiliate-og.png`). Run → fails.
- [ ] **Step 2:** Extend `server/config/brand.js`: `const logoPath = process.env.BRAND_LOGO_PATH || '/assets/images/brand/logo.png'; const ogImagePath = process.env.BRAND_OG_IMAGE_PATH || '/assets/images/affiliate-og.png';` export both. Test → green.
- [ ] **Step 3:** `git mv` `logo-wavemax.png→logo.png`, `wavemax-affiliate-og.png→affiliate-og.png`. Update every reference: hardcoded `logo-wavemax.png` / `wavemax-affiliate-og.png` in HTML/CSS/JS → the new filename; where the reference is server-rendered (templates via cspHelper, og:image meta), inject `brand.logoPath`/`brand.ogImagePath`.
- [ ] **Step 4:** `git grep -nE "logo-wavemax\.png|wavemax-affiliate-og\.png" -- .` → nothing (outside docs). Tests green.
- [ ] **Step 5:** Commit `refactor(phase4c): config-driven brand image paths + neutral filenames`.

### Task 5: Rename internal CSS + flyer files + build manifest, then finalize
**Files:** `public/assets/css/wavemax-{theme,components,affiliate}.css`, the flyer PDFs, `scripts/build-assets.js`, `tools/flyers/build-flyers.js`, all `<link>`/download refs; guard baseline.

- [ ] **Step 1:** `git mv` `wavemax-theme.css→brand-theme.css`, `wavemax-components.css→brand-components.css`, `wavemax-affiliate.css→affiliate.css`, `wavemax-affiliate-flyer-{landscape,portrait}.pdf→affiliate-flyer-{landscape,portrait}.pdf` (+ their `.min.css` if present). Update every `<link href>` + download link + the `ASSETS` rows in `scripts/build-assets.js` + `tools/flyers/build-flyers.js` output names.
- [ ] **Step 2:** `npm run build:assets` → succeeds (no ENOENT); stage `.min`.
- [ ] **Step 3:** `git grep -nE "wavemax-(theme|components|affiliate)\.css|wavemax-affiliate-flyer" -- . ':!docs'` → nothing.
- [ ] **Step 4:** Guard cleanup: in `branding-guard.test.js`, remove EXCLUDED entries for every file/class/asset renamed in Tasks 2–5 (verify each old path is gone). The remaining exclusions must be only the §2 KEEP set. Run both guards → green.
- [ ] **Step 5:** Commit `refactor(phase4c): rename internal css/flyer files + prune build manifest & guard exclusions`.

### Task 6: Finalize — guard drain, full suite, visual smoke, cache-busters
- [ ] **Step 1:** `git grep -ciI wavemax -- . ':!docs' ':!*.md' ':!design-explorer' ':!public/design-explorer' ':!tests/unit/branding-guard.test.js' ':!tests/unit/domain-guard.test.js'` — report the count; the remainder must be only the §2 KEEP set (crhsent evidence, wavemax-affiliate.html display copy, guard/host-routing self-refs). List any surprise.
- [ ] **Step 2:** Bump `?v=` cache-buster on every changed CSS/JS asset referenced from HTML shells (CF caches immutable).
- [ ] **Step 3:** `npm run build:assets` final; stage `.min`. Controller runs full `npm test` → green.
- [ ] **Step 4:** Controller does a browser visual smoke on portal (affiliate login/register, customer, operator, admin, /claim) — styling + og image identical to pre-rename.
- [ ] **Step 5:** Commit. Whole-branch review, then deploy (`git pull` + `pm2 reload` both boxes; verify byte-identical tree; browser-verify styling).
