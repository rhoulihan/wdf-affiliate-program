# De-branding via a Brand Config — Phase 3 Design

**Date:** 2026-08-22 (finalized post-split 2026-08-23)
**Status:** Design — awaiting review
**Author:** CRHS (Rick Houlihan) + Claude
**Scope:** **Phase 3** of the program in [`2026-08-22-service-corporate-split-program-design.md`](2026-08-22-service-corporate-split-program-design.md) (Phase 1 = extract `@crhs/web-core` ✅, Phase 2 = repo/deploy split ✅ live, **Phase 3 = this de-brand**, Phase 4 = domain migration + deferred Austin corporate content). Phase 3 de-brands the **monorepo `wdf-affiliate-program` only**, behind a single brand config. **`@crhs/web-core`'s own brand-literal defaults (R4b) are DEFERRED** to a later focused web-core v0.2.0 pass — they live in a private repo, are env-overridden in production (crhs-corporate/.env sets its own values), and are never user-visible, so touching the just-deployed web-core/crhs-corporate stack now is not worth it.

> **Post-split reality:** Phase 2 was a greenfield **copy**, so the monorepo still contains ALL content (6,933 WaveMAX hits). The crhsent.com content that crhs-corporate now serves (the `crhsent/` tree + `accessGate`/`mediatorGate` + their models) lives on here as **dead-but-retained** code — kept as the instant nginx→:3000 **rollback path** — and is therefore **EXCLUDED** from de-branding (§7), not moved or deleted. The `wavemax.promo` domain migration is Phase 4.

---

## 1. Goal & non-goals

**Goal.** No user-facing or generic occurrence of the literal string "WaveMAX" remains in the committed codebase. Every *display* of the brand name resolves at runtime from a single config source; in production that source is set to **"WaveMAX Austin"**, but the committed repository contains no "WaveMAX" **outside two explicitly-retained sets** — the infrastructure identifiers deferred to Phase 4 (§2, bucket 3) and the pages/code that are deliberately about — or dead-but-retained from — the franchisor (§7). The production display value ("WaveMAX Austin") lives only in the deployed environment, never in the repo.

**Non-goals (Phase 3).**
- The `wavemax.promo` domain migration and all infrastructure identifiers (domains, mail host, Mongo DB name, Firebase project id, PM2 process name) — deferred to Phase 4.
- `@crhs/web-core`'s own brand-literal defaults (R4b) — deferred to a later web-core v0.2.0 pass.
- Pages/documents *deliberately about* the franchisor (mediator/sales/comparison) **plus the now-dead-but-retained crhsent.com code** (kept as the rollback path) — left intact by design (§7).
- No behavior changes; this is a branding-source refactor.

---

## 2. The four buckets (handling rules)

The 6,933 occurrences fall into four buckets, each handled differently:

| Bucket | What | Phase-3 handling |
|---|---|---|
| **1. Display brand text** | Page titles, visible HTML copy, email-template copy, ~584 i18n locale strings | Resolve from brand config (see §3–§4). |
| **2. Generic non-display** | Code comments, internal labels, log/service strings, test-fixture emails (`john@wavemax.com`) | Replace with the literal generic **"Laundromat"** (or a neutral equivalent, e.g. `john@laundromat.example`). |
| **3. Infrastructure identifiers** | `wavemax.promo`, `mail.wavemax.promo`, Mongo DB `wavemax`, Firebase `wavemax-bag-registration`, PM2 name | **Deferred to Phase 4** (domain migration). NOT changed now, EXCEPT the app/instance *name in code* becomes a config var (§3). |
| **4. Deliberately about WaveMAX** | See §7 exclusion list | **Excluded** — left byte-for-byte intact. |

The distinguishing test for bucket 1 vs 2: *would a user read this string as the business's name?* If yes → config. If it is a comment, an identifier, a fixture, or internal telemetry → literal "Laundromat".

---

## 3. Brand config module

**`server/config/brand.js`** — the single source of truth. Values are **env-sourced with generic defaults**, so the committed file has no "WaveMAX":

```js
// server/config/brand.js
const brand = {
  displayName:  process.env.BRAND_DISPLAY_NAME  || 'Laundromat',
  legalName:    process.env.BRAND_LEGAL_NAME    || 'CRHS Enterprises, LLC',
  shortName:    process.env.BRAND_SHORT_NAME    || 'Laundromat',
  instanceName: process.env.BRAND_INSTANCE_NAME || 'laundromat', // app/service identity in code
  // domain/email intentionally NOT finalized here — Phase 4 owns them.
};
module.exports = brand;
```

Production `.env` (on the OCI boxes, **not committed**) sets:
```
BRAND_DISPLAY_NAME=WaveMAX Austin
```
`legalName` stays "CRHS Enterprises, LLC" everywhere (that is the real owner and is not the franchisor mark).

A dedicated **public brand endpoint** `GET /api/v1/brand` returns `{ displayName, shortName }` for any client that needs the value without a server-rendered injection point.

---

## 4. Consumption per layer

1. **Server-rendered HTML + email templates.** Extend the existing transform in `server/utils/cspHelper.js#injectNonce` (or add `injectBrand`) to also replace `{{BRAND_NAME}}`, `{{BRAND_SHORT}}`, `{{BRAND_LEGAL}}` placeholders from `brand.js`. Every template that shows the name uses these placeholders. A `<meta name="brand-name" content="{{BRAND_NAME}}">` tag is added to the shared `<head>` so the client can read it without a fetch.

2. **Static/embedded HTML** (served via `express.static`, no per-request transform). Two-part cover: (a) the `<meta name="brand-name">` is populated by routing embed pages through the existing nonce-injection serve path (they already need `{CSP_NONCE}` handling), and (b) a tiny always-loaded client helper `public/assets/js/brand.js` reads the meta (falling back to `GET /api/v1/brand`) and fills any `data-brand` / `data-i18n` brand slots. No page hardcodes the name.

3. **Client JS.** `window.BRAND = { name, short }` set by `brand.js` from the meta tag; string literals that displayed "WaveMAX" now read `window.BRAND.name`.

4. **i18n locales** (`public/locales/{en,es,pt,de}/common.json`). Replace the literal in every value with the i18n interpolation token **`{{brandName}}`**; register `brandName` as a global interpolation variable in `public/assets/js/i18n.js`, sourced from `window.BRAND.name`. Maintains 4-language parity; the brand becomes one variable, not 584 literals.

5. **Config/defaults** (`SystemConfig` seed defaults, `.env.example`, `package.json` description). Display-oriented defaults become generic "Laundromat"; `.env.example` documents `BRAND_DISPLAY_NAME` with a generic example value and a comment noting production sets it.

---

## 5. App/instance name (mid-flight decision)

The **PM2 process name** stays `wavemax` operationally (it is the running deployed instance; renaming it is an ops action, not code). But **code references** to an app/instance/service name (logging identity, email "from" display, health/service labels) read `brand.instanceName`. `ecosystem.config.js` parameterizes `name: process.env.PM2_APP_NAME || 'laundromat'` so the committed literal is generic, with a comment that the live process keeps its current name until re-created (Phase 4 ops).

---

## 6. Generated assets

11 minified files under `public/assets/**/*.min.{js,css}` are **regenerated** from their sources via `npm run build:assets` after the source edits — never hand-edited. `embed-app-v2.min.js` and the other bundles are part of that build.

---

## 7. Exclusions (bucket 4 — left intact)

- **The entire `crhsent/**` tree (48 files, 147 hits) + the crhsent host handler in `server.js` + `accessGate`/`mediatorGate` + their models (`AccessGate`/`AccessWhitelist`/`AccessClick`/`AccessRequest`/`MediatorAccess`)** — this is the crhsent.com content + gates, now served by **crhs-corporate** and **DEAD in the monorepo**, retained only as the instant nginx→:3000 **rollback path**. Excluded from de-branding (about-franchisor anyway) and NOT deleted. A later cleanup removes it once crhs-corporate is proven.
- `public/why-invest-in-wavemax.html`, `public/wavemax-vs-zombiemat.html`, `public/wavemax-affiliate.html`, `public/franchise*.html` and the franchise-marketing surfaces (deliberately about the franchisor; 229 hits)
- `docs/stash/**`, `docs/examples/wavemaxlaundry-*`, and any `dc_private`-style case content
- The MHR social census + evidence artifacts
- `tests/unit/wavemaxAffiliatePage.test.js` + `tests/unit/accessGate.test.js` + `tests/unit/mediatorGate.test.js` (test about-WaveMAX pages / the dead gates)

These reference the franchisor deliberately or are dead-but-retained; de-branding them would make them nonsensical or churn the rollback path.

---

## 8. Testing (TDD)

Red-first, per project rules. The load-bearing regression net:

1. **Guard test** `tests/unit/branding-guard.test.js` — greps the scoped trees for `/wavemax/i` and **fails** on any hit, with an allowlist for (a) bucket-3 infra identifiers (domain/mail/DB/firebase patterns), (b) the §7 excluded paths, and (c) `.env.example` doc comments. This is the test that would have caught a regression; it is written first and goes red against today's tree.
2. **Brand config unit test** — `brand.js` returns the env value when set, the generic default otherwise.
3. **Injection integration test** — a server-rendered page and an email template render `displayName` (assert "Laundromat" with no env, "WaveMAX Austin" with `BRAND_DISPLAY_NAME` set).
4. **i18n parity test** — all four locales carry the `{{brandName}}` token, zero literal-brand drift.

Tests run clean without `--forceExit`.

---

## 9. Acceptance criteria

- `git grep -i wavemax` over the scoped trees (excluding §7 and the bucket-3 infra allowlist) returns **0**.
- The committed `server/config/brand.js` contains no "WaveMAX"; `grep -ri "wavemax austin" .` in the repo returns 0 (the value exists only in deployed env).
- `npm run build:assets` regenerates minified bundles clean; full test suite green.
- A page served with no `BRAND_DISPLAY_NAME` shows "Laundromat"; with `BRAND_DISPLAY_NAME="WaveMAX Austin"` shows "WaveMAX Austin".
- All four languages render the brand via the interpolation token.

---

## 10. Rollout & risks

- **Rollout.** Phase 3 ships to the repo; production `.env` gains `BRAND_DISPLAY_NAME=WaveMAX Austin` (+ optional `PM2_APP_NAME=wavemax`) on both OCI boxes; `pm2 reload wavemax --update-env`. wavemax.promo and all infra stay exactly as-is until Phase 4.
- **Risk — missed display string.** Mitigated by the guard test (fails the build on any un-allowlisted "WaveMAX").
- **Risk — over-scrub of an identifier.** The bucket-3 allowlist + reviewing each infra hit prevents breaking `wavemax.promo`/DB/Firebase.
- **Risk — i18n interpolation gap.** Parity test + English fallback.
- **Risk — static pages bypass injection.** Client `brand.js` fallback to `/api/v1/brand` guarantees the name resolves even without a server transform.

---

## 11. Execution note

The scrub is large and mechanical (hundreds of files across the scoped trees). Implementation will proceed by layer (config module + injection wiring first, with the guard test red → green), then bucket-by-bucket batches (locales, HTML, server strings, client JS, comments/fixtures), each batch verified against the guard test. Parallelizable batches may be dispatched to subagents. Full plan produced via the writing-plans skill after this spec is approved.
