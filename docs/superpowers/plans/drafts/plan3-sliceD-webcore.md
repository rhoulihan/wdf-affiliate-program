# Plan 3 — SLICE D draft: `@crhs/web-core` release hygiene (B-5) → **v0.3.0**

**Status:** draft 2026-09-20, pre-review. Scope source: `docs/superpowers/specs/2026-09-20-separation-plan3-scope-brief.md`
group **D** (items 16–19) plus **owner decision 1** (the B-4 remainder). Task format mirrors
`docs/superpowers/plans/2026-09-13-separation-plan2-content-app.md` Tasks 74–82.

Repo: `/mnt/c/Users/rickh/GitHub/crhs-web-core` (private, `file:../crhs-web-core` in both consumers).
Deployed release today: **v0.2.1**, commit `768bfdb`, on both boxes.
This slice cuts **v0.3.0** and deploys it.

---

## Slice D conventions

**Baselines measured 2026-09-20 (record them again in D9 before the bump; a different number means an
unrelated change landed and must be explained before continuing).**

| Gate | Value |
|:--|:--|
| Seam suites `tests/utils/cspHelper.test.js tests/utils/logger.test.js tests/email/transport.test.js tests/assets/i18n.test.js tests/brandNeutral.test.js tests/index.smoke.test.js` | `Test Suites: 6 passed, 6 total` / `Tests: 88 passed, 88 total` |
| Full suite at v0.2.1 | 579 tests (per the slice brief) — re-measured in D9 |
| `npx madge --circular src/` | `✔ No circular dependency found!` |
| `npm run lint` | clean (no output) |
| Exported surface | **exactly 26 keys** (`tests/index.smoke.test.js:45-47`) — D adds **no** 27th key (see D4) |

Per-file baselines the task steps assert against (measured 2026-09-20):
`tests/utils/cspHelper.test.js` **27** · `tests/utils/logger.test.js` **2** ·
`tests/email/transport.test.js` **19** (`tests/email` **42**) · `tests/assets/i18n.test.js` **10**
(`tests/assets` **14**) · `tests/brandNeutral.test.js` **1** ·
affiliate `tests/unit/cspHelper.test.js` + `cspHelper.brand.test.js` **20**.

**Version choice — 0.3.0, not 0.2.2.** Two of these changes are observable in the consumers, not
internal: `injectNonce` emits different HTML (two consumer test assertions change, D2), and the i18n
`localStorage` key is renamed (visitor-visible, migrated). A minor bump says that out loud, and — with
the lethal install trap below — the installed version must be unmistakable in every gate line and log.

**⛔ The install trap (Plan 2 Global Constraint 16, `memory/deploy_b_bidirectional_bootbreaker.md`).**
`npm install` reports "up to date" and does **NOT** re-copy `node_modules/@crhs/web-core` when the
version string is unchanged; only `rm -rf node_modules/@crhs/web-core` forces a re-copy. A consumer
running new app code against old core (or the reverse) has killed the portal before. Therefore **every**
install in D10/D11 is `rm -rf` → `npm install --install-links` → gate → boot probe → `pm2 reload`, for
**both** consumers, on **each** box.

**Ordering inside the slice.** D1 → D2 → D3 → D4 → D5 → D6 → D7 → D8 → D9 (tag) → D10 (consumers,
local) → D11 (boxes). D1–D8 are independent commits in the web-core repo except D2 (affiliate repo) and
D8 (affiliate repo, docs only); D7 must run after D6 because it counts D6's surviving literal.

**Cross-slice dependencies.**
- **Slice B (iframe-bridge deletion)** removes `assets/js/iframe-bridge-v2.js` and
  `assets/js/parent-iframe-bridge-v3.js`. D does **not** duplicate that work. D7's allowlist asserts
  each allowlisted file still exists, so slice B's deletion makes D7's test fail until the two entries
  are pruned — the dependency is enforced by a test, not remembered. D6 changes **one line** in
  `parent-iframe-bridge-v3.js` (its `LANGUAGE_KEY` constant) purely so the key rename is atomic if D
  lands before B; if B lands first, the file is gone and the edit is dropped.
- **Slice A (the nginx flips)** is why D6 needs a migration shim at all — see D6's Interfaces.
- **Slice C / D-4 (affiliate ESLint)** is unaffected by D: D adds no lint rule (see the D4 decision
  record).

**Commit trailer** on every commit: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

## Verified findings (evidence, gathered 2026-09-20)

### F-D1 — root cause of the duplicate nonce attribute

`src/utils/cspHelper.js:66-70`:

```js
  // Add nonce to meta tag with name="csp-nonce"
  html = html.replace(
    /<meta([^>]*name=["']csp-nonce["'][^>]*content=["']["'][^>]*)>/gi,
    `<meta$1 content="${nonce}">`
  );
```

Capture group 1 swallows **the whole inside of the tag, `content=""` included**, and the replacement
then appends a *second* `content=`. Output: `<meta name="csp-nonce" content="" content="NONCE">`.
The fix is not a regex tweak in isolation — the brand-name meta fill 30 lines above (`:36-39`) already
does it the other way (group 1 ends *at* the opening quote, so the value lands *between* the quotes),
which is why corporate's pages look correct. Two divergent copies of one operation; D1 replaces both
with one helper.

Why corporate is unaffected: every corporate page ships `<meta name="csp-nonce" content="{{CSP_NONCE}}">`
(11 files under `content/`), so the placeholder pass at `:45` fills it and the buggy regex — which
requires an **empty** `content=""` — never matches. The portal ships literal `content=""` on
`embed-app-v2.html:6`, `affiliate-login-embed.html:6`, `affiliate-register-embed.html:6`,
`operator-scan-embed.html:6`, `scanbag.html:6`, `affiliate.html:6`, `partner-program.html:6`.

The bug is **codified as expected behaviour in two test files** — both must be corrected with the fix:
- `crhs-web-core/tests/utils/cspHelper.test.js:91-96` (`// The regex appends content attribute, it doesn't replace it`) and `:118`
- `wavemax-affiliate-program/tests/unit/cspHelper.test.js:92` and `:115`

Blast radius of the fix, checked call site by call site: every client reader treats an empty value as
"fall through to another source", so each one currently reaches the same nonce by a fallback and will
simply read it from the meta after the fix —
`public/embed-app-v2.html:43` (`window.CSP_NONCE`), `public/assets/js/embed-app-v2.js:193,446,643`,
`public/assets/js/claim.js:844-845`. No inverted logic, no behaviour change beyond the meta itself.

### F-D2 — `logger` loses *primitives*, not Errors (the brief's claim is half right)

Measured against `src/utils/logger.js` as shipped (probe: `NODE_ENV=production`, `LOG_DIR` in a temp dir):

| call | logged |
|:--|:--|
| `logger.error('A string arg:', 'no-reply@crhsent.com')` | `{"message":"A string arg:"}` — **argument gone** |
| `logger.error('A number arg:', 42)` | `{"message":"A number arg:"}` — **gone** |
| `logger.error('Two string args:', 'a', 'b')` | `{"message":"Two string args:"}` — **both gone** |
| `logger.error('With %s token:', 'tokenval')` | `{"message":"With %s token:"}` — **not interpolated** |
| `logger.error('An error arg:', err)` | `{"message":"An error arg: boom","stack":"Error: boom\n…"}` — **survives** |
| `logger.error('An object arg:', {orderId:'ORD-1'})` | `{"message":"An object arg:","orderId":"ORD-1"}` — **survives** |
| `logger.error(new Error('x'))` | `{"level":"error","timestamp":"…"}` — **message AND stack gone** |

Cause: `winston/lib/winston/logger.js:258-286` merges an **object** first-splat argument into the
record (and appends `meta.message` / copies `meta.stack` for an Error) but writes primitives only into
`info[SPLAT]`, which nothing in web-core's format chain reads.

Live consequences already in the tree:
- `src/email/transport.js:24-27` — the whole console-provider email dump (`From:`, `To:`, `Subject:`,
  `HTML:`) logs **four empty labels**.
- `src/email/transport.js:77` — `[sendEmail] Sending email to:` logs **without the recipient**.
- `crhs-corporate/server.js:172` — `crhs-corporate boot failed:` passes `err.message` (a string), so a
  refused boot logs **no reason**; `:162` has the same shape for the SystemConfig seed failure.
  (Consumer call sites; fixed for free by D4 — no consumer edit needed.)

### F-D3 — `winston.format.splat()` is **not** the fix, it is measurably worse

Probe with `format.splat()` added, same call:

```
{"0":"n","1":"o","10":"r","11":"h","12":"s",…,"level":"error","message":"A string arg:"}
```

`logform/splat.js:99-113` does `Object.assign(info, metas[i])` on a **string**, exploding it into
character-indexed keys in every JSON log line. It fixes `%s` interpolation and nothing else. This is
the decisive evidence behind the D4 decision.

### F-D4 — `i18n.js` locale cache-buster, and the fix the portal already shipped

`assets/js/i18n.js:95-97` builds `/locales/<lang>/common.json?v=<new Date().getTime()>` — a unique URL
per page load, so the locale bundle is never served from the browser cache or the Cloudflare edge.
The portal already solved this in its own copy —
`wavemax-affiliate-program/public/assets/js/i18n.js:96-102` reads `<meta name="asset-version">` and
falls back to the constant `'static'`, filled server-side from `server/config/assetVersion.js` via
`server/utils/cspHelper.js:25-30`. D5 adopts that pattern and adds one extra precedence so corporate
needs no content edit: corporate already stamps the loader's own URL
(`content/atxwashdryfold/index.html:331` → `/assets/js/i18n.js?v=20260909a`), and corporate serves
`/locales/` with `maxAge: '1h'` (`crhs-corporate/server/contentHandler.js:62`), which bounds worst-case
staleness at one hour even if a deploy forgets to re-stamp.

### F-D5 — the legal pages in web-core are **unreferenced dead copies**

`assets/legal/{privacy-policy,refund-policy,terms-and-conditions}.html` are reachable from neither
consumer: corporate serves exactly two files out of `assetsDir`
(`crhs-corporate/server/webCoreAssets.js:10` — `i18n.js`, `language-switcher.js`), and the portal serves
its own `public/privacy-policy.html`, `public/refund-policy.html`,
`public/terms-and-conditions-embed.html`. Nothing anywhere resolves `assetsDir/legal`. This changes the
question put to the owner/counsel in D8 from "review this text" to "these three files are dead; delete
or keep".

### F-D6 — reported, NOT fixed here (out of slice D): the `{{nonce}}` placeholder

`wavemax-affiliate-program/public/administrator-dashboard-embed.html` uses `{{nonce}}`, not
`{{CSP_NONCE}}` — at `:6` (the meta), `:8` (a page-level `<meta http-equiv="Content-Security-Policy">`
naming `'nonce-{{nonce}}'`) and on ~10 `<script nonce="{{nonce}}">` tags. **No code substitutes
`{{nonce}}`**, and `injectNonce`'s script pass deliberately skips tags that already carry a `nonce=`
attribute, so the page ships the literal string as its nonce. It presumably renders only because that
path is not in the affiliate's `strictCSPPages`. Teaching `injectNonce` a second, undocumented
placeholder would change that page's CSP posture in a release whose point is a nonce fix, so D leaves
it alone and escalates it as a **new Plan 3 item for the affiliate slice**.

---

## Decision record — item 18 (asked for explicitly)

**Decision: fix the logger's format chain. Do NOT add an ESLint rule.**

1. **A lint rule cannot see the defect.** The losing call sites are
   `logger.info('From:', mailOptions.from)` and `wc.logger.error('… failed:', err.message)`. At lint
   time those are `MemberExpression`s — syntactically identical to `logger.error('msg:', err)`, which
   works today and whose stack capture we want to keep. A rule narrow enough to be safe (ban only
   `Literal` second arguments) misses every real site; a rule wide enough to catch them bans ~24
   currently-correct web-core call sites plus an unknown number in two consumer repos, and rewriting
   `logger.error('Encryption error:', error)` into `{ err: error.message }` would **lose the stack**
   winston captures today. A rule that is both unenforceable and destructive is not a fix.
2. **`winston.format.splat()` is worse than the bug** — F-D3: character-indexed key explosion.
3. **The format chain fixes it once for every caller in every repo, including code not yet written** —
   the corporate boot-failure line (F-D2) is repaired without touching corporate.

So D4 adds a 12-line `captureExtraArgs` format plus `winston.format.errors({ stack: true })`, and adds
no rule. The README records the contract so the next author knows the multi-arg form is now safe.

**Also in D4:** `logger.flushAndExit(code)` — the exit-on-`finish` idiom already inlined at
`crhs-corporate/server.js:172-178`, lifted into web-core so the portal (4 `process.exit(1)` sites in
`server.js`) can adopt it. It attaches to the existing `logger` export rather than becoming a 27th
index key, because `tests/index.smoke.test.js:45-47` pins the surface at 26 and every box-side install
gate in Plan 2 Task 75 asserts `Object.keys(require("@crhs/web-core")).length` is 26. Adding a key
would mean editing a production gate command in the same release as a nonce fix.

---

## Tasks

### Task D1: web-core — `injectNonce` fills the `csp-nonce` meta **in place**; one `fillMetaContent` helper replaces both divergent meta regexes (scope-brief item 16, ⛔ LIVE)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/utils/cspHelper.js`
  - insert the helper above `injectNonce` (before `:6`, the JSDoc block);
  - `:35-39` — the brand-name meta fill becomes a helper call;
  - `:66-70` — the `csp-nonce` meta fill becomes a helper call (**the defect**).
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/utils/cspHelper.test.js`
  - new tests inserted before `:139` (the `// Brand injection is OPT-IN` comment that opens the nested `describe`);
  - `:91-96` — the test that codifies the bug is corrected;
  - `:118` — the same assertion inside `'should handle complex HTML with multiple elements'`.

**Interfaces:**
- Consumes: nothing. First task of the slice.
- Produces:
  - `injectNonce(html, nonce)` on a page carrying `<meta name="csp-nonce" content="">` emits exactly
    one `content` attribute, holding the nonce.
  - Same for `content=''` (single quotes), where the old brand-name pattern would have emitted
    mismatched quotes — so the helper fixes a latent second defect on the brand path.
  - Unchanged, byte for byte: the `{{CSP_NONCE}}` placeholder path (corporate's 11 pages and
    `administrator-login-embed.html`), the `<script>`/`<style>`/`<link rel=stylesheet>` passes, the
    double-quoted brand-name fill asserted by `wavemax-affiliate-program/tests/unit/cspHelper.brand.test.js:11`.
  - Consumed by D2 (the affiliate's two mirrored assertions) and D11 Step 8 (the live check).
- **Known limitation, unchanged:** both the old and the new matcher require `name=` to appear *before*
  `content=` in the tag. All 12 portal pages and all 11 corporate pages are written that way. Recorded
  in the helper comment; not widened, because widening it is untested surface with no call site.
- Replacement is a **function**, not a `$1`-string: a string replacement would make the inserted value
  part of the replacement-pattern grammar. A base64 nonce cannot contain `$`, but `b.displayName` is
  owner-supplied text that can.

- [ ] **Step 1: Write the failing tests.** Insert before `:139` (the line
      `    // Brand injection is OPT-IN (3rd arg). Corporate's 2-arg calls MUST stay`):
```js
    // ⛔ Plan 3 D1. Shipped live on the portal 2026-09-20 as
    //   <meta name="csp-nonce" content="" content="FrHF8VWjliu7jdXUE+Ptxg==">
    // HTML keeps the FIRST attribute, so every client-side nonce read returned ''.
    it('fills the empty csp-nonce meta IN PLACE — exactly one content attribute', () => {
      const html = '<meta name="csp-nonce" content="">';
      const result = injectNonce(html, testNonce);
      expect(result).toBe(`<meta name="csp-nonce" content="${testNonce}">`);
      expect(result.match(/content=/g)).toHaveLength(1);
    });

    it('fills a single-quoted empty csp-nonce meta without mismatching the quotes', () => {
      const result = injectNonce("<meta name='csp-nonce' content=''>", testNonce);
      expect(result).toBe(`<meta name='csp-nonce' content='${testNonce}'>`);
    });

    it('keeps trailing attributes on the csp-nonce meta', () => {
      const result = injectNonce('<meta name="csp-nonce" content="" data-x="1">', testNonce);
      expect(result).toBe(`<meta name="csp-nonce" content="${testNonce}" data-x="1">`);
    });

    it('leaves an already-filled csp-nonce meta alone (idempotent)', () => {
      const html = `<meta name="csp-nonce" content="${testNonce}">`;
      expect(injectNonce(html, 'second-nonce')).toBe(html);
    });

    it('the {{CSP_NONCE}} meta path also yields exactly one content attribute', () => {
      const result = injectNonce('<meta name="csp-nonce" content="{{CSP_NONCE}}">', testNonce);
      expect(result).toBe(`<meta name="csp-nonce" content="${testNonce}">`);
      expect(result.match(/content=/g)).toHaveLength(1);
    });

    it('fills a single-quoted empty brand-name meta without mismatching the quotes', () => {
      const result = injectNonce("<meta name='brand-name' content=''>", testNonce, {
        displayName: 'Rundberg Laundry'
      });
      expect(result).toBe("<meta name='brand-name' content='Rundberg Laundry'>");
    });
```
- [ ] **Step 2: Run the tests and confirm they fail for the right reason.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/utils/cspHelper.test.js 2>&1 | grep -E "✕|✓ fills|Tests:"
```
- Expected: `Tests:       4 failed, 29 passed, 33 total` (27 tests today + the 6 new), and the four failures are exactly:
  - `fills the empty csp-nonce meta IN PLACE` — `Expected: "<meta name=\"csp-nonce\" content=\"test-nonce-123\">"` / `Received: "<meta name=\"csp-nonce\" content=\"\" content=\"test-nonce-123\">"` (the duplicate attribute, i.e. the live defect reproduced in a unit test).
  - `fills a single-quoted empty csp-nonce meta` — `Received: "<meta name='csp-nonce' content='' content=\"test-nonce-123\">"`.
  - `keeps trailing attributes on the csp-nonce meta` — `Received: "<meta name=\"csp-nonce\" content=\"\" data-x=\"1\" content=\"test-nonce-123\">"`.
  - `fills a single-quoted empty brand-name meta` — `Received: "<meta name='brand-name' content='Rundberg Laundry\">"` (mismatched quotes — the latent brand-path defect).
  - The two tests that must **pass** already are `leaves an already-filled csp-nonce meta alone` and `the {{CSP_NONCE}} meta path…`; if either fails, STOP — the premise that the placeholder path is unaffected is wrong.
- [ ] **Step 3: Implement.** In `src/utils/cspHelper.js`, insert above the `injectNonce` JSDoc (before `:6`):
```js
/**
 * Fill an EMPTY `content=""` / `content=''` on the <meta> carrying `name`, in place.
 *
 * Two things this gets right that the two hand-rolled regexes it replaces did not:
 *  - the value lands BETWEEN the existing quotes, so the tag keeps exactly one
 *    `content` attribute. The csp-nonce copy captured `content=""` into its group
 *    and appended a second one — HTML keeps the FIRST attribute, so every
 *    client-side nonce read returned '' (shipped live on the portal, fixed here);
 *  - the quote character is captured and reused, so `content=''` does not come
 *    back as `content='value">`.
 * Matching the empty value makes the pass idempotent: a meta that already carries
 * a value is left untouched. Like both predecessors, this requires `name=` to
 * precede `content=` in the tag (every page in both apps is written that way).
 * The replacement is a function so the inserted value is never parsed as a
 * `$`-replacement pattern.
 */
const fillMetaContent = (html, name, value) => html.replace(
  new RegExp(`(<meta[^>]*name=["']${name}["'][^>]*content=)(["'])\\2`, 'gi'),
  (_m, prefix, quote) => `${prefix}${quote}${value}${quote}`
);
```
  Replace `:35-39` (the comment + the brand-name `html = html.replace(…)` call):
```js
    // Fill the empty brand-name meta (mirror the csp-nonce meta fill).
    html = fillMetaContent(html, 'brand-name', b.displayName);
```
  Replace `:66-70` (the comment + the csp-nonce `html = html.replace(…)` call):
```js
  // Fill the empty csp-nonce meta in place (see fillMetaContent).
  html = fillMetaContent(html, 'csp-nonce', nonce);
```
  Then correct the two assertions that codified the defect. `:91-96` becomes:
```js
    it('should update meta tag with name="csp-nonce"', () => {
      const html = '<meta name="csp-nonce" content="">';
      const result = injectNonce(html, testNonce);
      // Was asserted as `content="" content="…"` until Plan 3 D1: the old regex
      // APPENDED a second attribute and HTML keeps the first, so the portal
      // served an empty nonce to every client.
      expect(result).toBe(`<meta name="csp-nonce" content="${testNonce}">`);
    });
```
  and `:118` becomes:
```js
      expect(result).toContain(`<meta name="csp-nonce" content="${testNonce}">`);
```
- [ ] **Step 4: Run the tests and confirm they pass.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/utils/cspHelper.test.js 2>&1 | grep -E "Tests:|Suites:"
grep -c fillMetaContent src/utils/cspHelper.js; grep -cE 'content=\[' src/utils/cspHelper.js
```
- Expected: `Test Suites: 1 passed, 1 total`, `Tests:       33 passed, 33 total`, then `3` (the helper
  plus its two call sites) and `0` — no regex literal still spells `content=["']`, i.e. neither
  capture-the-empty-value pattern survives.
- [ ] **Step 5: Run the rest of the web-core suite — the CSP golden/parity tests must be unmoved.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/security tests/index.smoke.test.js 2>&1 | grep -E "FAIL|Tests:"
```
- Expected: no `FAIL` line; `Tests:` count matches the pre-change run of the same selector.
- [ ] **Step 6: Commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git add src/utils/cspHelper.js tests/utils/cspHelper.test.js && git commit -m "fix(cspHelper)!: fill the csp-nonce meta in place — one fillMetaContent helper (Plan 3 D1)" -m "The csp-nonce meta pass captured content=\"\" into its group and appended a
second content attribute. HTML keeps the first, so every client-side nonce read
returned '' — shipped live on the portal. One helper now fills both metas
between the existing quotes, reusing the captured quote character." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git log --oneline -1                     # confirm the D1 commit is HEAD
git revert --no-edit HEAD
npx jest tests/utils/cspHelper.test.js 2>&1 | grep -E "Tests:"
```
- Rollback expected: `Tests:       27 passed, 27 total` (the pre-D1 file, six new tests reverted away),
  and `git show --stat HEAD` lists only `src/utils/cspHelper.js` and `tests/utils/cspHelper.test.js`.
- Rollback note: if D2 has already landed in the affiliate repo, revert it too — the affiliate suite
  asserts the fixed output and would go red against a reverted core.

---

### Task D2: affiliate — correct the two assertions that mirror the D1 defect (consumer alignment, blocking for D10)

The affiliate repo carries its own copy of the same bug-codifying test. Without this, D9's release turns
the affiliate suite red, and Plan 2's rule that the portal suite stays green would block the deploy.

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/unit/cspHelper.test.js` (`:88-93`, `:115`)

**Interfaces:**
- Consumes: D1 (the new `injectNonce` behaviour), which must be committed in web-core first — the
  affiliate resolves web-core through `file:../crhs-web-core`, so the local working tree is already the
  new code once D1 lands.
- Produces: an affiliate suite that is green against v0.3.0. No `server/` or `public/` file changes —
  the portal's own `server/utils/cspHelper.js` shim is unaffected (it wraps, it does not re-implement).
- `tests/unit/cspHelper.brand.test.js:11` asserts the double-quoted brand-name output and does **not**
  change (D1 keeps that byte-identical).

- [ ] **Step 1: Prove the affiliate suite is red before the edit — that IS the failing test.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npx jest tests/unit/cspHelper.test.js tests/unit/cspHelper.brand.test.js 2>&1 | grep -E "✕|Tests:"
```
- Expected: `Tests:       2 failed, 18 passed, 20 total`; the two failures are
  `should update meta tag with name="csp-nonce"` and
  `should handle complex HTML with multiple elements`, each `Expected` the duplicated
  `content="" content="…"` string and `Received` the single-attribute form. If any *other* test fails,
  STOP: D1 changed more than the meta fill.
- [ ] **Step 2: Correct the two assertions.** `:88-93` becomes:
```js
    it('should update meta tag with name="csp-nonce"', () => {
      const html = '<meta name="csp-nonce" content="">';
      const result = injectNonce(html, testNonce);
      // Plan 3 D1: web-core's injectNonce now fills the meta IN PLACE. This
      // previously asserted `content="" content="…"`, which is what the portal
      // served — HTML keeps the first attribute, so window.CSP_NONCE was ''.
      expect(result).toBe(`<meta name="csp-nonce" content="${testNonce}">`);
    });
```
  and `:115` becomes:
```js
      expect(result).toContain(`<meta name="csp-nonce" content="${testNonce}">`);
```
- [ ] **Step 3: Re-run and confirm green.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npx jest tests/unit/cspHelper.test.js tests/unit/cspHelper.brand.test.js 2>&1 | grep -E "Tests:|Suites:"
```
- Expected: `Test Suites: 2 passed, 2 total`, `Tests:       20 passed, 20 total`.
- [ ] **Step 4: Commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git add tests/unit/cspHelper.test.js && git commit -m "test(csp): the csp-nonce meta is filled in place, not duplicated (web-core D1)" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git log --oneline -1 && git revert --no-edit HEAD
npx jest tests/unit/cspHelper.test.js 2>&1 | grep -E "Tests:"
```
- Rollback expected: `Tests:       2 failed, 18 passed, 20 total` **if** D1 is still in place — that is
  the correct, expected red. Revert D1 as well to return to a green tree.

---

### Task D3: web-core — explicit SMTP timeouts on the mail transport (scope-brief item 17)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/email/transport.js` (`:34-45`, the `transportConfig` object literal)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/email/transport.test.js` (new tests inserted before `:100`, the `});` closing `describe('createTransport')`)

**Interfaces:**
- Consumes: nothing.
- Produces: `createTransport()` returns a nodemailer config carrying `connectionTimeout: 10000`,
  `greetingTimeout: 10000`, `socketTimeout: 30000`, each overridable via
  `EMAIL_CONNECTION_TIMEOUT_MS` / `EMAIL_GREETING_TIMEOUT_MS` / `EMAIL_SOCKET_TIMEOUT_MS`.
  No `.env` change is required on any box — the defaults are the fix.
- Measured nodemailer defaults (`node_modules/nodemailer/lib/smtp-connection/index.js:54-57`,
  nodemailer 8.0.11): greeting 30 s, connection **2 min**, socket **10 min**, dns 30 s. The 10-minute
  figure in the brief is the socket default. `dnsTimeout` is left at its 30 s default: it is already
  bounded, and one unmeasured knob per release is enough.
- Context, not fixed here: `sendEmail` calls `createTransport()` per message (`src/email/transport.js:89`),
  so there is no connection pool and a stall is per-send. Relevant to scope-brief item 22 (oci2 opening
  and dropping SMTP connections with `commands=0/0`), which stays in group E — a timeout does not
  produce `commands=0/0`, so D3 is not a fix for it and must not be recorded as one.

- [ ] **Step 1: Write the failing tests.** Insert before `:100`:
```js
    // Item 17. nodemailer's defaults (greeting 30 s, connection 2 min, socket
    // 10 min) let a hung mail host hold a send for ~10 minutes; the 2026-08 mail
    // outage was diagnosed through exactly that silence.
    it('sets explicit connection, greeting and socket timeouts', () => {
      process.env.EMAIL_HOST = 'mail.example.com';
      transport.createTransport();
      const config = nodemailer.createTransport.mock.calls[0][0];
      expect(config.connectionTimeout).toBe(10000);
      expect(config.greetingTimeout).toBe(10000);
      expect(config.socketTimeout).toBe(30000);
    });

    it('honours the EMAIL_*_TIMEOUT_MS overrides', () => {
      process.env.EMAIL_HOST = 'mail.example.com';
      process.env.EMAIL_CONNECTION_TIMEOUT_MS = '4000';
      process.env.EMAIL_GREETING_TIMEOUT_MS = '5000';
      process.env.EMAIL_SOCKET_TIMEOUT_MS = '6000';
      transport.createTransport();
      const config = nodemailer.createTransport.mock.calls[0][0];
      expect(config.connectionTimeout).toBe(4000);
      expect(config.greetingTimeout).toBe(5000);
      expect(config.socketTimeout).toBe(6000);
    });

    it('ignores a non-numeric override rather than sending NaN to nodemailer', () => {
      process.env.EMAIL_HOST = 'mail.example.com';
      process.env.EMAIL_SOCKET_TIMEOUT_MS = 'soon';
      transport.createTransport();
      expect(nodemailer.createTransport.mock.calls[0][0].socketTimeout).toBe(30000);
    });
```
  and add the three new keys to the `beforeEach` teardown at `:27` (after the
  `delete process.env.EMAIL_TLS_SERVERNAME;` line):
```js
    delete process.env.EMAIL_CONNECTION_TIMEOUT_MS;
    delete process.env.EMAIL_GREETING_TIMEOUT_MS;
    delete process.env.EMAIL_SOCKET_TIMEOUT_MS;
```
- [ ] **Step 2: Run the tests and confirm they fail for the right reason.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/email/transport.test.js 2>&1 | grep -E "✕|Received|Tests:"
```
- Expected: `Tests:       3 failed, 19 passed, 22 total`, with every failure reading
  `Expected: 10000` (or `30000`, `4000`, …) / `Received: undefined` — the keys are absent from the
  config object, which is exactly the defect (nodemailer then applies its own defaults). A failure
  reading `Received: 0` or `NaN` instead would mean someone already added the keys badly.
- [ ] **Step 3: Implement.** Replace `:34-45` with:
```js
  // Explicit SMTP timeouts. nodemailer's defaults are greeting 30 s, connection
  // 2 min and socket 10 min (smtp-connection/index.js:54-57), so a hung mail host
  // could hold a send for ~10 minutes with nothing in the log but silence. dnsTimeout
  // keeps its bounded 30 s default. Overridable per box without a code change.
  const ms = (name, fallback) => {
    const n = parseInt(process.env[name], 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  const transportConfig = {
    host: process.env.EMAIL_HOST || 'localhost',
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    secure: process.env.EMAIL_PORT === '465',
    connectionTimeout: ms('EMAIL_CONNECTION_TIMEOUT_MS', 10000),
    greetingTimeout: ms('EMAIL_GREETING_TIMEOUT_MS', 10000),
    socketTimeout: ms('EMAIL_SOCKET_TIMEOUT_MS', 30000),
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production'
    }
  };
```
- [ ] **Step 4: Run the suite and confirm green.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/email 2>&1 | grep -E "FAIL|Tests:|Suites:"
```
- Expected: no `FAIL` line; `Test Suites: 3 passed, 3 total`; `Tests:       45 passed, 45 total`
  (42 today + 3).
- [ ] **Step 5: Commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git add src/email/transport.js tests/email/transport.test.js && git commit -m "fix(email): explicit SMTP connection/greeting/socket timeouts (Plan 3 D3)" -m "nodemailer's defaults let a hung mail host hold a send for ~10 minutes. 10 s /
10 s / 30 s, each overridable via EMAIL_*_TIMEOUT_MS." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git log --oneline -1 && git revert --no-edit HEAD
npx jest tests/email 2>&1 | grep -E "Tests:"
node -e "process.env.EMAIL_HOST='mail.example.com';const t=require('./src/email/transport');console.log('reverted')"
```
- Rollback expected: `Tests:       42 passed, 42 total`, then `reverted`.
- Rollback note: purely local; nothing on a box changes until D11. No `.env` key is added, so a
  rollback needs no box-side follow-up.

---

### Task D4: web-core — the logger stops dropping arguments (`captureExtraArgs` + `format.errors`) and gains `flushAndExit` (scope-brief item 18)

See the **Decision record** above for why this is a format-chain fix and not an ESLint rule.

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/utils/logger.js` (`:1-8` requires + `logFormat`; insert `flushAndExit` before `:54`, the `module.exports`)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/utils/logger.test.js` (append a second and third `describe` after `:31`)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/README.md` (append a "Logging contract" section before the closing copyright line)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Nothing passed to `logger.*()` is dropped: a primitive extra argument is appended to the message, an
    object extra argument merges into the record (as today), an Error extra argument keeps its
    message + stack (as today) and is not duplicated, and an Error passed **as** the message now keeps
    its message and stack (today it logs `{"level":"error","timestamp":"…"}` and nothing else).
  - `logger.flushAndExit(code = 1, { timeoutMs = 750 })` — exits on the logger's `finish` event with a
    capped fallback.
  - **No change to the exported index surface**: `flushAndExit` is a property of the existing `logger`
    export, so `Object.keys(require('@crhs/web-core')).length` stays **26** and every Plan 2 box gate
    command keeps working verbatim.
  - Repairs two consumer call sites with no consumer edit: `crhs-corporate/server.js:162` and `:172`
    (`… failed:', err.message` — a string, dropped today), plus the five in `src/email/transport.js`.
  - `logger.flushAndExit` is available to the portal through its shim
    (`wavemax-affiliate-program/server/utils/logger.js` = `require('@crhs/web-core').logger`); adopting it
    at the portal's four `process.exit(1)` sites and replacing corporate's inlined copy is **not** in D —
    it is a one-line change each, listed in D8's hand-off notes for the slice that touches those files.
- `SPLAT` is written as `Symbol.for('splat')` rather than `require('triple-beam')`: triple-beam defines it
  as exactly that registry symbol (`node_modules/triple-beam/index.js`), so this is the same symbol
  winston and logform use, without adding a declared dependency to a package the boxes install by
  `file:` copy.

- [ ] **Step 1: Write the failing tests.** Append after `:31` (the `});` closing the existing describe):
```js

// Item 18. Measured against v0.2.1 (probe, NODE_ENV=production):
//   logger.error('A string arg:', 'x@y.z')  -> {"message":"A string arg:"}        value GONE
//   logger.error('A number arg:', 42)       -> {"message":"A number arg:"}        value GONE
//   logger.error('An error arg:', err)      -> message + stack                    survives
//   logger.error('An object arg:', {a:1})   -> a:1 merged                         survives
//   logger.error(new Error('x'))            -> {"level":"error"}                  message AND stack GONE
// winston writes primitives only into info[SPLAT] (winston/lib/winston/logger.js:258-286),
// which nothing in the chain read. logform's format.splat() is NOT the fix: with no
// %s token it Object.assigns a STRING into character-indexed keys (logform/splat.js:99-113).
describe('utils/logger — no argument is silently dropped', () => {
  const { Writable } = require('stream');
  const winston = require('winston');

  // Read the REAL format chain's output by attaching a Stream transport to the
  // real logger, so this tests the shipped pipeline and not a re-built copy.
  async function captured(fn) {
    const lines = [];
    const stream = new Writable({ write(chunk, _enc, cb) { lines.push(chunk.toString()); cb(); } });
    const logger = require('../../src/utils/logger');
    const transport = new winston.transports.Stream({ stream });
    logger.add(transport);
    try {
      fn(logger);
      await new Promise((r) => setImmediate(r));
    } finally {
      logger.remove(transport);
    }
    return lines.join('').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  }

  it('appends a string extra argument to the message', async () => {
    const [rec] = await captured((l) => l.error('[sendEmail] Sending email to:', 'to@example.com'));
    expect(rec.message).toBe('[sendEmail] Sending email to: to@example.com');
  });

  it('appends a non-string primitive extra argument', async () => {
    const [rec] = await captured((l) => l.warn('retry count:', 3));
    expect(rec.message).toBe('retry count: 3');
  });

  it('appends every extra argument, in order', async () => {
    const [rec] = await captured((l) => l.info('pair:', 'a', 'b'));
    expect(rec.message).toBe('pair: a b');
  });

  it('still merges an object extra argument into the record (unchanged)', async () => {
    const [rec] = await captured((l) => l.warn('geocodeAddress: non-200', { status: 503 }));
    expect(rec.status).toBe(503);
    expect(rec.message).toBe('geocodeAddress: non-200');
  });

  it('merges a SECOND object argument too', async () => {
    const [rec] = await captured((l) => l.info('two metas', { a: 1 }, { b: 2 }));
    expect([rec.a, rec.b]).toEqual([1, 2]);
  });

  it('keeps an Error extra argument as message + stack, without duplicating it', async () => {
    const err = new Error('boom');
    const [rec] = await captured((l) => l.error('Error sending email:', err));
    expect(rec.message).toBe('Error sending email: boom');
    expect(rec.stack).toContain('Error: boom');
  });

  it('captures an Error passed AS the message (message + stack)', async () => {
    const [rec] = await captured((l) => l.error(new Error('error-as-message')));
    expect(rec.message).toBe('error-as-message');
    expect(rec.stack).toContain('Error: error-as-message');
  });

  it('never explodes a string into character-indexed keys', async () => {
    const [rec] = await captured((l) => l.error('addr:', 'no-reply@crhsent.com'));
    expect(Object.keys(rec)).not.toContain('0');
  });
});

describe('utils/logger — flushAndExit', () => {
  let exitSpy;
  afterEach(() => {
    if (exitSpy) exitSpy.mockRestore();
    jest.resetModules();
  });

  it('exits on the logger finish event, not in the calling tick', async () => {
    jest.resetModules();                       // a throwaway instance: end() is terminal
    const logger = require('../../src/utils/logger');
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    logger.error('boot failed:', 'no reason today');
    logger.flushAndExit(3);
    expect(exitSpy).not.toHaveBeenCalled();    // the bug this replaces: exit in the same tick
    await new Promise((r) => logger.on('finish', r));
    await new Promise((r) => setImmediate(r));
    expect(exitSpy).toHaveBeenCalledWith(3);
  });
});
```
- [ ] **Step 2: Run the tests and confirm they fail for the right reason.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/utils/logger.test.js 2>&1 | grep -E "✕|Expected|Received|TypeError|Tests:"
```
- Expected: `Tests:       6 failed, 5 passed, 11 total`, failing as:
  - the three primitive tests: `Expected: "[sendEmail] Sending email to: to@example.com"` /
    `Received: "[sendEmail] Sending email to:"` — the argument is missing, which **is** the defect;
  - `merges a SECOND object argument too`: `Expected: [1, 2]` / `Received: [1, undefined]` — winston
    merges only the FIRST splat entry, so the second object is dropped as well;
  - `captures an Error passed AS the message`: `Received: undefined` for `rec.message`;
  - `flushAndExit`: `TypeError: logger.flushAndExit is not a function`.
  - The three tests asserting today's *correct* behaviour — object merge, Error extra, no character
    keys — must **pass already**. If `never explodes a string into character-indexed keys` fails at this
    point, someone has added `format.splat()` and that must be removed first.
- [ ] **Step 3: Implement.** Replace `src/utils/logger.js:1-8` with:
```js
const winston = require('winston');
const path = require('path');
const util = require('util');

// triple-beam's SPLAT, by value not by require: it is defined as Symbol.for('splat')
// (node_modules/triple-beam/index.js), a registry symbol, so this IS the symbol
// winston and logform use — with no new declared dependency.
const SPLAT = Symbol.for('splat');

/**
 * Nothing handed to logger.*() may be dropped.
 *
 * winston merges an OBJECT first extra argument into the record, and for an Error
 * appends its message and copies its stack (winston/lib/winston/logger.js:258-286).
 * Extra PRIMITIVES it writes only into info[SPLAT], which nothing read — so
 * `logger.info('To:', address)` logged the label and threw the address away, and
 * `logger.error('boot failed:', err.message)` logged no reason at all.
 *
 * logform's own format.splat() is NOT the fix: with no %s token it runs
 * Object.assign(info, '<string>') (logform/splat.js:99-113), exploding the string
 * into character-indexed keys in every JSON line — measurably worse than the bug.
 *
 * %-tokens are deliberately NOT interpolated: the value is appended instead, so it
 * is visible rather than lost, and there is no second precedence model to reason
 * about. winston merges nothing when the message carries a token, so in that case
 * every splat entry is still ours to handle.
 */
const captureExtraArgs = winston.format((info) => {
  const splat = info[SPLAT];
  if (!Array.isArray(splat) || splat.length === 0) return info;
  const mergedIndex = /%[scdjifoO%]/.test(String(info.message)) ? -1 : 0;
  const tail = [];
  splat.forEach((arg, i) => {
    if (arg instanceof Error) {
      if (i !== mergedIndex) tail.push(arg.stack || String(arg));
    } else if (arg !== null && typeof arg === 'object') {
      if (i !== mergedIndex) Object.assign(info, arg);
    } else {
      tail.push(typeof arg === 'string' ? arg : util.inspect(arg));
    }
  });
  if (tail.length) info.message = `${info.message} ${tail.join(' ')}`;
  return info;
});

// Define log format
const logFormat = winston.format.combine(
  // An Error passed AS the message kept neither its message nor its stack.
  winston.format.errors({ stack: true }),
  captureExtraArgs(),
  winston.format.timestamp(),
  winston.format.json()
);
```
  Then insert before `:54` (`module.exports = logger;`):
```js
/**
 * Exit the process only after Winston's file transports have flushed.
 *
 * process.exit() in the same tick as logger.error() loses the line entirely, and in
 * production there is no Console transport either — a refused boot became a silent
 * PM2 crash-loop. Lifted from the copy inlined at crhs-corporate/server.js:172-178
 * so both apps share one implementation. The timeout is capped so a wedged
 * transport can never hang the exit.
 * @param {number} [code=1] process exit code
 * @param {{timeoutMs?: number}} [opts]
 */
logger.flushAndExit = (code = 1, { timeoutMs = 750 } = {}) => {
  const bail = () => process.exit(code);
  setTimeout(bail, timeoutMs).unref();
  try {
    logger.on('finish', bail);
    logger.end();
  } catch (e) {
    bail();
  }
};

```
- [ ] **Step 4: Run the tests and confirm they pass.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/utils/logger.test.js 2>&1 | grep -E "Tests:|Suites:"
```
- Expected: `Test Suites: 1 passed, 1 total`, `Tests:       11 passed, 11 total`.
- [ ] **Step 5: Prove the repaired call sites, end to end, in the shape production uses.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && D=$(mktemp -d) && NODE_ENV=production LOG_DIR=$D node -e "
const logger = require('./src/utils/logger');
logger.error('crhs-corporate boot failed:', new Error('ENOTFOUND mail.crhsent.com').message);
logger.info('[sendEmail] Sending email to:', 'owner@example.com');
logger.on('finish', () => process.exit(0)); logger.end();" && cat $D/combined.log | sed 's/,"timestamp.*//' && rm -rf $D
```
- Expected exactly two lines:
  `{"level":"error","message":"crhs-corporate boot failed: ENOTFOUND mail.crhsent.com","service":"app"`
  and `{"level":"info","message":"[sendEmail] Sending email to: owner@example.com","service":"app"`.
  Against v0.2.1 the same script prints both messages **without** the reason and **without** the address.
- [ ] **Step 6: Document the contract.** Append to `README.md`, above the closing copyright line:
```markdown
## Logging contract

`logger.info|warn|error|debug(message, ...extra)` never drops an argument:

- a **primitive** extra argument is appended to the message — `logger.info('To:', addr)` logs `To: a@b.c`;
- an **object** merges into the JSON record as fields — `logger.warn('non-200', { status: 503 })`;
- an **Error** keeps its message and stack, whether it is the message or an extra argument.

Before v0.3.0 the primitive form was silently discarded (winston writes it only to `info[SPLAT]`), which
is why a boot failure logged `boot failed:` with no reason. `winston.format.splat()` is deliberately NOT
used: with no `%s` token logform does `Object.assign(info, '<string>')`, exploding the string into
character-indexed keys.

Use `logger.flushAndExit(code)` instead of `process.exit(code)` after a final log line: `process.exit()`
in the same tick loses the line, and production has no Console transport.
```
- [ ] **Step 7: Commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git add src/utils/logger.js tests/utils/logger.test.js README.md && git commit -m "fix(logger): stop dropping primitive arguments; capture Errors; add flushAndExit (Plan 3 D4)" -m "logger.error('msg:', 'value') logged only the label -- winston writes primitives
to info[SPLAT] and nothing read it, so the corporate boot-failure line logged no
reason. format.splat() is not the fix (it Object.assigns a string into
character-indexed keys); a captureExtraArgs format is. format.errors({stack:true})
rescues an Error passed as the message. flushAndExit lifts the exit-on-finish
idiom out of crhs-corporate/server.js." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git log --oneline -1 && git revert --no-edit HEAD
npx jest tests/utils/logger.test.js tests/utils/auditLogger.test.js tests/utils/auditLoggerLogDir.test.js 2>&1 | grep -E "Tests:"
```
- Rollback expected: `Tests:       2 passed, 2 total` for `logger.test.js` (the pre-D4 file) and no failures in
  the two auditLogger suites, which share the transport chain.
- Rollback note: if a consumer has already adopted `logger.flushAndExit`, reverting D4 breaks that call
  site — it is a `TypeError` at the moment of a failed boot, i.e. the worst possible time. Nothing adopts
  it inside slice D; any adoption elsewhere must be reverted first.

---

### Task D5: web-core — the locale fetch uses a deploy-stable token, never a clock (scope-brief item 19)

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/assets/js/i18n.js`
  - insert `SELF_SRC` after `:7` (`'use strict';`);
  - `:86-97` — the `loadLanguage` JSDoc/`try` block: the timestamp lines `:95-97` become one URL line;
  - insert an `assetVersion()` method after the `detectLanguage()` method (closes at `:84`).
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/assets/i18n.test.js` (new `describe` inserted before `:165`, the final `});`)

**Interfaces:**
- Consumes: nothing.
- Produces: `/locales/<lang>/common.json?v=<token>` where the token is, in order of precedence,
  (1) `<meta name="asset-version" content="…">`, (2) the `v=` already stamped on this loader's own
  `<script src>`, (3) the constant `'static'`. Never a clock.
- Why three sources rather than the portal's two: the portal fills the meta server-side
  (`server/utils/cspHelper.js:25-30` from `server/config/assetVersion.js`) and already ships this exact
  fix in its own copy of the loader. Corporate publishes **no** meta but already stamps the loader URL
  (`crhs-corporate/content/atxwashdryfold/index.html:331` → `/assets/js/i18n.js?v=20260909a`), so
  precedence (2) gives the marketing hosts a deploy-accurate token with **zero** content-app edits —
  which matters because the content pages are a different slice.
- Staleness bound if a deploy changes a locale JSON without re-stamping either source: corporate serves
  `/locales/` with `maxAge: '1h'` (`crhs-corporate/server/contentHandler.js:62`), so at most one hour,
  self-healing. The portal's meta is bumped by `server/config/assetVersion.js` and has no such window.
- Consumed by: nothing in web-core. The cache win is measured at the edge, not in a test.

- [ ] **Step 1: Write the failing tests.** Insert before `:165` (the file's final `});`):
```js

// Item 19. The loader appended ?v=<new Date().getTime()> to every locale request,
// so every page load minted a unique URL and the /locales cache — browser AND
// Cloudflare edge — was never hit. Same defect, same fix as the portal's own copy.
describe('locale cache token (item 19)', () => {
  // Re-stub fetch AFTER load so the request URL can be read, then load a language
  // that is not already in loadedLanguages.
  async function localeUrlFor(window, lang) {
    const urls = [];
    window.fetch = (url) => {
      urls.push(url);
      return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve({}) });
    };
    await window.i18n.loadLanguage(lang);
    return urls[0];
  }

  test('no clock appears in the loader at all', () => {
    expect(I18N_SRC).not.toMatch(/new Date\(\)\.getTime\(\)/);
    expect(I18N_SRC).not.toMatch(/Date\.now\(\)/);
  });

  test('falls back to a stable constant when nothing publishes a version', async () => {
    const window = loadI18n({});
    expect(await localeUrlFor(window, 'es')).toBe('/locales/es/common.json?v=static');
  });

  test('uses the asset-version meta when the app publishes one', async () => {
    const window = loadI18n({});
    const meta = window.document.createElement('meta');
    meta.setAttribute('name', 'asset-version');
    meta.setAttribute('content', '20260920a');
    window.document.head.appendChild(meta);
    expect(await localeUrlFor(window, 'pt')).toBe('/locales/pt/common.json?v=20260920a');
  });

  test('inherits the token already stamped on this loader\'s own script URL', async () => {
    const window = loadI18n({});
    const tag = window.document.createElement('script');
    tag.setAttribute('src', '/assets/js/i18n.js?v=20260909a');
    window.document.head.appendChild(tag);
    expect(await localeUrlFor(window, 'de')).toBe('/locales/de/common.json?v=20260909a');
  });

  test('the meta wins over the stamped script URL', async () => {
    const window = loadI18n({});
    const tag = window.document.createElement('script');
    tag.setAttribute('src', '/assets/js/i18n.js?v=20260909a');
    window.document.head.appendChild(tag);
    const meta = window.document.createElement('meta');
    meta.setAttribute('name', 'asset-version');
    meta.setAttribute('content', '20260920a');
    window.document.head.appendChild(meta);
    expect(await localeUrlFor(window, 'es')).toBe('/locales/es/common.json?v=20260920a');
  });
});
```
- [ ] **Step 2: Run the tests and confirm they fail for the right reason.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/assets/i18n.test.js 2>&1 | grep -E "✕|Received|Tests:"
```
- Expected: `Tests:       5 failed, 10 passed, 15 total` — all five new tests fail. Each URL failure reads
  `Expected: "/locales/es/common.json?v=static"` /
  `Received: "/locales/es/common.json?v=17…"` — a 13-digit epoch, i.e. the clock, which is the defect.
  The `no clock appears in the loader` test fails on `new Date().getTime()` still being present.
  If a URL failure instead shows `?v=undefined`, STOP: the method name does not match the call.
- [ ] **Step 3: Implement.** Insert after `:7` (`'use strict';`):
```js

  // The URL this loader was served from, captured while the script is executing.
  // Host pages already stamp a deploy token on it; assetVersion() inherits that.
  const SELF_SRC = (document.currentScript && document.currentScript.src) || '';
```
  Insert after the `detectLanguage()` method (its closing `},` at `:84`):
```js

    /**
         * Deploy-stable cache token for the locale fetch — never a clock.
         * Precedence: the app-published <meta name="asset-version">, then the v=
         * token the host page already stamps on this loader's own <script src>,
         * then a constant. Mirrors the fix in the portal's own copy of this loader.
         */
    assetVersion() {
      const meta = document.querySelector('meta[name="asset-version"]');
      const fromMeta = ((meta && meta.getAttribute('content')) || '').trim();
      if (fromMeta) return fromMeta;
      const src = SELF_SRC || ((document.querySelector('script[src*="i18n.js"]') || {}).src || '');
      const stamped = /[?&]v=([^&#]+)/.exec(src);
      return (stamped && stamped[1].trim()) || 'static';
    },
```
  Replace `:95-97`:
```js
        // Add cache-busting parameter to force reload
        const timestamp = new Date().getTime();
        const url = `${this.config.translationsPath}/${lang}/common.json?v=${timestamp}`;
```
  with:
```js
        // Deploy-stable token, not a clock: a per-load timestamp made every locale
        // URL unique and threw away the /locales cache on every visit, browser and
        // Cloudflare edge alike, on a file that is on the critical path.
        const url = `${this.config.translationsPath}/${lang}/common.json?v=${this.assetVersion()}`;
```
- [ ] **Step 4: Run the tests and confirm they pass.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/assets/i18n.test.js 2>&1 | grep -E "Tests:|Suites:" && grep -c "getTime()" assets/js/i18n.js
```
- Expected: `Test Suites: 1 passed, 1 total`, `Tests:       15 passed, 15 total` (10 today + 5), then `0`.
- [ ] **Step 5: Commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git add assets/js/i18n.js tests/assets/i18n.test.js && git commit -m "assets(i18n): deploy-stable locale cache token, never a clock (Plan 3 D5)" -m "?v=<timestamp>-per-load made every locale URL unique, so /locales was never
served from the browser or the Cloudflare edge. Precedence: asset-version meta,
then the v= already stamped on this loader's own script URL, then a constant." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git log --oneline -1 && git revert --no-edit HEAD
npx jest tests/assets/i18n.test.js 2>&1 | grep -E "Tests:" && grep -c "getTime()" assets/js/i18n.js
```
- Rollback expected: `Tests:       10 passed, 10 total`, then `1` (the clock is back).
- Rollback note: a rollback restores per-load cache-busting, i.e. it is slow but never stale. Safe to do
  without a cache purge in either direction.

---

### Task D6: web-core — rename the i18n `localStorage` key **with a migration shim** (owner decision 1)

The owner settled this explicitly: rename, and carry existing visitors across. Plan 2 Task 6 deliberately
left the key alone ("*Renaming it resets every visitor's saved language*"); the shim is what reverses that
objection, so this task supersedes that note.

New key: **`app-language`** — web-core's established neutral default (the logger's `service` tag defaults
to `'app'`, the session cookie base to `'app.sid'`; `tests/utils/logger.test.js:3-8`).

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/assets/js/i18n.js`
  - `:16` — `storageKey`, plus a new `legacyStorageKey` line;
  - `:58-63` — `detectLanguage()`'s localStorage read gains the migration call;
  - a new `migrateStoredLanguage()` method before `detectLanguage()`.
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/assets/js/parent-iframe-bridge-v3.js` (`:25`, one line)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/assets/i18n.test.js` (new `describe` before the final `});`)

**Interfaces:**
- Consumes: D5 (same file; keeps the diffs reviewable).
- Produces: `i18n.config.storageKey === 'app-language'`; a saved preference under the legacy key is read
  once, rewritten under the new key, and the legacy key removed.
- **Why the shim is load-bearing, not politeness.** The legacy value on the marketing origins was written
  by the **portal's** copy of this loader, because nginx points those hosts at `:3000` today. After slice
  A flips a host to `:3001`, the same browser, same origin, is served *web-core's* copy. Without the
  shim, the flip silently resets the language for every returning visitor on that host — a user-visible
  regression caused by an infrastructure change, exactly the class of thing Plan 3 must not ship.
  `localStorage` is per-origin, so nothing crosses between `portal.atxwashdryfold.com` and the marketing
  hosts, and the portal's own copy (`public/assets/js/i18n.js:18`) keeps its key — it is not touched here.
- `parent-iframe-bridge-v3.js:25` (`LANGUAGE_KEY`) is updated in the **same commit** so the rename is
  atomic if D lands before slice B deletes that file. It is one line; slice B's deletion supersedes it.
- The legacy literal that survives in `assets/js/i18n.js` is the single allowlisted line D7 counts.

- [ ] **Step 1: Write the failing tests.** Insert before the final `});`:
```js

// Owner decision 1. The legacy key's values on the marketing origins were written
// by the PORTAL's copy of this loader (those hosts point at :3000 until Plan 3
// slice A flips them), so dropping the read would reset the language of every
// returning visitor at the moment of an infrastructure flip.
describe('language storage key migration (owner decision 1)', () => {
  test('the configured key is the neutral one', () => {
    expect(loadI18n({}).i18n.config.storageKey).toBe('app-language');
  });

  test('adopts a value saved under the legacy key and clears the legacy key', () => {
    const window = loadI18n({});
    window.localStorage.setItem('wavemax-language', 'de');
    expect(window.i18n.detectLanguage()).toBe('de');
    expect(window.localStorage.getItem('app-language')).toBe('de');
    expect(window.localStorage.getItem('wavemax-language')).toBeNull();
  });

  test('a value already under the new key wins, and the legacy key is cleared', () => {
    const window = loadI18n({});
    window.localStorage.setItem('app-language', 'pt');
    window.localStorage.setItem('wavemax-language', 'de');
    expect(window.i18n.detectLanguage()).toBe('pt');
    expect(window.localStorage.getItem('wavemax-language')).toBeNull();
  });

  test('an unsupported legacy value is discarded, not adopted', () => {
    const window = loadI18n({});
    window.localStorage.setItem('wavemax-language', 'fr');
    expect(window.i18n.detectLanguage()).toBe('en');
    expect(window.localStorage.getItem('app-language')).toBeNull();
    expect(window.localStorage.getItem('wavemax-language')).toBeNull();
  });

  test('setLanguage writes only the new key', async () => {
    const window = loadI18n({ greeting: 'hi' });
    await window.i18n.setLanguage('es');
    expect(window.localStorage.getItem('app-language')).toBe('es');
    expect(window.localStorage.getItem('wavemax-language')).toBeNull();
  });

  test('storage that throws does not break language detection', () => {
    const window = loadI18n({});
    Object.defineProperty(window.localStorage, 'getItem', {
      configurable: true,
      value: () => { throw new Error('SecurityError'); }
    });
    expect(() => window.i18n.detectLanguage()).not.toThrow();
  });

  test('the legacy key appears exactly once — the migration read (D7 counts this line)', () => {
    expect(I18N_SRC.split('wavemax-language').length - 1).toBe(1);
  });
});
```
- [ ] **Step 2: Run the tests and confirm they fail for the right reason.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/assets/i18n.test.js 2>&1 | grep -E "✕|Expected|Received|Tests:"
```
- Expected: `Tests:       6 failed, 16 passed, 22 total` — six of the seven new tests fail:
  - `the configured key is the neutral one`: `Expected: "app-language"` / `Received: "wavemax-language"`;
  - `adopts a value saved under the legacy key`: `Expected: "de"` / `Received: null` reading `app-language`
    (today `detectLanguage()` returns `'de'` correctly, but by reading the **legacy** key directly);
  - `a value already under the new key wins`: `Expected: "pt"` / `Received: "de"`;
  - `an unsupported legacy value is discarded`: the first two assertions pass; the third fails —
    `Expected: null` / `Received: "fr"` — because nothing removes the legacy key today;
  - `setLanguage writes only the new key`: `Expected: "es"` / `Received: null`;
  - `storage that throws does not break language detection`: today `detectLanguage()` calls
    `localStorage.getItem` bare, so the test fails with `Received function did not throw` inverted —
    i.e. it **did** throw `SecurityError`.
  Only `the legacy key appears exactly once` passes today, and it must still pass after the change.
- [ ] **Step 3: Implement.** Replace `:16`:
```js
      storageKey: 'wavemax-language',
```
  with:
```js
      storageKey: 'app-language',
      // One-time migration SOURCE, read-only. The saved value on the marketing
      // origins was written by the portal's own copy of this loader while those
      // hosts still pointed at the portal, so dropping this read would reset every
      // returning visitor's language at the moment nginx flips the host.
      // Delete this key and migrateStoredLanguage() after 2027-01-01.
      legacyStorageKey: 'wavemax-language',
```
  Insert before `detectLanguage()` (its JSDoc at `:55-57`):
```js
    /**
         * Move a preference saved under the legacy key to the current one, once.
         * Never throws: private-mode / disabled storage must not break init.
         */
    migrateStoredLanguage() {
      const { storageKey, legacyStorageKey, supportedLanguages } = this.config;
      if (!legacyStorageKey || legacyStorageKey === storageKey) return;
      try {
        const legacy = localStorage.getItem(legacyStorageKey);
        if (legacy === null) return;
        if (!localStorage.getItem(storageKey) && supportedLanguages.includes(legacy)) {
          localStorage.setItem(storageKey, legacy);
        }
        localStorage.removeItem(legacyStorageKey);
      } catch (e) {
        // no storage available — detectLanguage falls through to URL/browser/default
      }
    },

```
  and in `detectLanguage()` replace `:59-60`:
```js
      // 1. Check localStorage
      const storedLang = localStorage.getItem(this.config.storageKey);
```
  with:
```js
      // 1. Check localStorage (adopting a value saved under the legacy key once)
      this.migrateStoredLanguage();
      let storedLang = null;
      try { storedLang = localStorage.getItem(this.config.storageKey); } catch (e) { storedLang = null; }
```
  In `assets/js/parent-iframe-bridge-v3.js`, replace `:25`:
```js
  const LANGUAGE_KEY = 'wavemax-language';
```
  with:
```js
  const LANGUAGE_KEY = 'app-language';
```
- [ ] **Step 4: Run the tests and confirm they pass.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/assets 2>&1 | grep -E "FAIL|Tests:|Suites:" && grep -c "wavemax-language" assets/js/i18n.js assets/js/parent-iframe-bridge-v3.js
```
- Expected: no `FAIL`; `Test Suites: 2 passed, 2 total`; `Tests:       26 passed, 26 total`
  (14 before slice D, +5 from D5, +7 here); then `assets/js/i18n.js:1` and
  `assets/js/parent-iframe-bridge-v3.js:0`.
- [ ] **Step 5: Commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git add assets/js/i18n.js assets/js/parent-iframe-bridge-v3.js tests/assets/i18n.test.js && git commit -m "assets(i18n)!: storageKey 'app-language' with a one-time migration shim (Plan 3 D6, owner decision 1)" -m "The legacy value on the marketing origins was written by the portal's copy of
this loader, so a bare rename would have reset every returning visitor's language
the moment slice A flips the host. The shim reads the legacy key once, rewrites
it, and removes it. Delete the shim after 2027-01-01." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git log --oneline -1 && git revert --no-edit HEAD
npx jest tests/assets 2>&1 | grep -E "Tests:" && grep -c "wavemax-language" assets/js/i18n.js
```
- Rollback expected: `Test Suites: 2 passed, 2 total`, `Tests:       19 passed, 19 total`, then `1`.
- **Rollback note (asymmetric — read before reverting after D11).** Once v0.3.0 has served a visitor, that
  browser holds `app-language` and no longer holds the legacy key. Reverting the code makes the loader
  read the legacy key again, so that visitor falls back to browser/default language on the next visit.
  It is a language reset, not data loss, and it only affects visitors served between deploy and rollback.
  D7's guard count (`assets/js/i18n.js: 1`) is unchanged by a revert, so D7 does not need reverting too.

---

### Task D7: web-core — the brand-neutrality guard covers everything outside `src/`, with a self-expiring allowlist (owner decision 1, closes B-4 in web-core)

`tests/brandNeutral.test.js` scans `src/` only (`:7`), which is why B-4's remainder survived. This task
extends it to `assets/` and the repo-root metadata, records every surviving literal with its reason and
its removal event, and asserts each allowlist row is still real — so a row cannot outlive its reason.

**Files:**
- Modify (rewrite): `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/brandNeutral.test.js` (22 lines today)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/assets/js/language-switcher.js` (`:2`, comment only)

**Interfaces:**
- Consumes: D6 (the counts below include D6's one surviving legacy-key line and its one-line bridge edit).
- Produces: a guard that fails on any NEW brand literal anywhere in the package, and that fails when an
  allowlisted file is deleted or de-branded elsewhere — which is how slice B's bridge deletion is
  enforced rather than remembered.
- Counts measured 2026-09-20 with the guard's own pattern
  (`/wavemax|rundberglaundry|runberglaundry|atxwash|wavemaxlaundry/i`), matching **lines**:

  | path | lines | after |
  |:--|--:|:--|
  | `assets/js/iframe-bridge-v2.js` | 7 | deleted by slice B |
  | `assets/js/parent-iframe-bridge-v3.js` | 12 → **11** | deleted by slice B (D6 fixes one line) |
  | `assets/js/i18n.js` | 1 → **1** | the D6 migration read; deleted after 2027-01-01 |
  | `assets/js/language-switcher.js` | 1 → **0** | fixed in this task |
  | `assets/legal/privacy-policy.html` | 17 | owner/counsel (D8) |
  | `assets/legal/refund-policy.html` | 10 | owner/counsel (D8) |
  | `assets/legal/terms-and-conditions.html` | 11 | owner/counsel (D8) |
  | `LICENSE` | 2 | owner/counsel (D8) |
  | `README.md`, `package.json`, `jest.config.js`, `.eslintrc.js`, `assets/js/css-async.js` | 0 | — |

- Not scanned: `tests/` (the guard itself must spell the pattern) and `node_modules/`.

- [ ] **Step 1: Write the failing test.** Replace the whole of `tests/brandNeutral.test.js` with:
```js
// Spec §7.2.2 brand-neutrality guard.
//
// Plan 2 Task 7 shipped this over src/ only, which is why B-4's remainder survived
// outside it. Plan 3 D7 extends it to assets/ and the repo-root metadata.
//
// ALLOW records every literal that still exists OUTSIDE src/, the reason, and the
// event that removes it. `lines` is exact, so a NEW literal in an allowlisted file
// fails. Each row is also asserted to still exist and still match, so a row cannot
// outlive its reason: when Plan 3 slice B deletes the two iframe bridges, this
// suite fails until those rows are removed.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PATTERN = /wavemax|rundberglaundry|runberglaundry|atxwash|wavemaxlaundry/i;
const DIRS = ['src', 'assets'];
const FILES = ['README.md', 'LICENSE', 'package.json', 'jest.config.js', '.eslintrc.js'];

const ALLOW = {
  'assets/js/iframe-bridge-v2.js': {
    lines: 7,
    reason: 'iframe bridge — deleted whole by Plan 3 slice B (owner: never embed in the franchisor site)'
  },
  'assets/js/parent-iframe-bridge-v3.js': {
    lines: 11,
    reason: 'iframe bridge — deleted whole by Plan 3 slice B'
  },
  'assets/js/i18n.js': {
    lines: 1,
    reason: 'legacyStorageKey — the one-time language migration read (D6); delete with the shim after 2027-01-01'
  },
  'assets/legal/privacy-policy.html': {
    lines: 17,
    reason: 'legal text — owner/counsel escalation (docs/refactor/OWNER-COUNSEL-ESCALATIONS.md); never edited unilaterally'
  },
  'assets/legal/refund-policy.html': {
    lines: 10,
    reason: 'legal text — owner/counsel escalation'
  },
  'assets/legal/terms-and-conditions.html': {
    lines: 11,
    reason: 'legal text — owner/counsel escalation'
  },
  LICENSE: {
    lines: 2,
    reason: 'licence text — owner/counsel escalation (trademark carve-out + notice address)'
  }
};

const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

const scanned = () => [
  ...DIRS.flatMap((d) => walk(path.join(ROOT, d))),
  ...FILES.map((f) => path.join(ROOT, f))
];

const countMatchingLines = (abs) => fs.readFileSync(abs, 'utf8')
  .split('\n').filter((line) => PATTERN.test(line)).length;

describe('web-core is brand-neutral (§7.2.2)', () => {
  it('no src/ file mentions the franchisor mark or a marketing/retired domain', () => {
    const offenders = [];
    for (const file of walk(path.join(ROOT, 'src'))) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (PATTERN.test(line)) offenders.push(`${path.relative(ROOT, file)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('every literal outside src/ is allowlisted, with the exact line count', () => {
    const found = {};
    for (const abs of scanned()) {
      const n = countMatchingLines(abs);
      if (n > 0) found[path.relative(ROOT, abs).split(path.sep).join('/')] = n;
    }
    const expected = Object.fromEntries(Object.entries(ALLOW).map(([k, v]) => [k, v.lines]));
    expect(found).toEqual(expected);
  });

  it('every allowlist row still names a real file that still matches — no row outlives its reason', () => {
    for (const [rel, row] of Object.entries(ALLOW)) {
      const abs = path.join(ROOT, rel);
      expect({ rel, exists: fs.existsSync(abs) }).toEqual({ rel, exists: true });
      expect({ rel, lines: countMatchingLines(abs) }).toEqual({ rel, lines: row.lines });
      expect(row.reason.length).toBeGreaterThan(20);
    }
  });
});
```
- [ ] **Step 2: Run it and confirm it fails for the right reason.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/brandNeutral.test.js 2>&1 | grep -E "✕|- Expected|\+ Received|language-switcher|Tests:"
```
- Expected: `Tests:       1 failed, 2 passed, 3 total`. The single failure is
  `every literal outside src/ is allowlisted` with the received object carrying one extra entry,
  `"assets/js/language-switcher.js": 1` — the header comment, which is the only unrecorded literal left.
  If the received object differs in any **other** key, STOP: the counts were measured on 2026-09-20 and
  something else changed; re-measure before editing the allowlist.
- [ ] **Step 3: Implement.** In `assets/js/language-switcher.js` replace `:2`:
```js
 * Language Switcher Component for WaveMAX
```
  with:
```js
 * Language Switcher Component
```
- [ ] **Step 4: Run it and confirm green, plus the whole suite.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/brandNeutral.test.js 2>&1 | grep -E "Tests:|Suites:" && npm run lint
```
- Expected: `Test Suites: 1 passed, 1 total`, `Tests:       3 passed, 3 total`, then no lint output.
- [ ] **Step 5: Commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git add tests/brandNeutral.test.js assets/js/language-switcher.js && git commit -m "test(guard): brand-neutrality over assets/ and repo metadata, self-expiring allowlist (Plan 3 D7, B-4)" -m "The §7.2.2 guard covered src/ only, which is why B-4's remainder survived. Every
surviving literal outside src/ is now recorded with an exact line count, a reason
and its removal event, and each row is asserted to still name a real, still-matching
file -- so slice B's bridge deletion makes this suite fail until the rows go." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git log --oneline -1 && git revert --no-edit HEAD
npx jest tests/brandNeutral.test.js 2>&1 | grep -E "Tests:"
```
- Rollback expected: `Tests:       1 passed, 1 total` (the src/-only guard).
- Rollback note: test-only plus one comment; no runtime behaviour. If slice B lands first and this suite
  fails, the fix is to delete the two bridge rows from `ALLOW`, **not** to revert the guard.

---

### Task D8: escalation list for the owner/counsel — legal pages and LICENSE, written not edited (owner decision 1; Plan 3 exit criterion 7)

The owner's instruction is explicit: these are **not** edited unilaterally. This task produces the list,
and the finding that changes the question being asked.

**Files:**
- Create: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/docs/refactor/OWNER-COUNSEL-ESCALATIONS.md`
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tasks/todo.md` — mark B-5 closed and point
  at this file (exact line located by content at execution time; the D-item block is around `:298-311`).

**Interfaces:**
- Consumes: D7 (the same measured counts).
- Produces: the single written list Plan 3 exit criterion 7 requires, structured so other slices append
  their own section under `## Other slices`. Nothing in `assets/legal/` or `LICENSE` is edited.
- Key finding that reframes the ask (verified 2026-09-20): web-core's three legal pages are **not served
  by either consumer**. Corporate serves exactly two files from `assetsDir`
  (`crhs-corporate/server/webCoreAssets.js:10` — `i18n.js`, `language-switcher.js`); the portal serves its
  own `public/privacy-policy.html`, `public/refund-policy.html`,
  `public/terms-and-conditions-embed.html`. Nothing resolves `assetsDir/legal`. So the question for the
  owner is not "review this text" but "these are dead copies — delete them from web-core, or keep them?",
  which needs no counsel time if the answer is delete.

- [ ] **Step 1: Write the list.** Create the file with exactly this content:
```markdown
# Escalations to the owner / counsel — CRHS ↔ WaveMAX separation

Single list required by Plan 3 exit criterion 7. Nothing here is edited by an implementer. Each item
names the file, the lines, what is in them, and the decision being asked for.

## web-core (Plan 3 slice D, B-4 remainder) — measured 2026-09-20

**Finding that may close three of the four items with no legal review.** The three legal pages below are
**unreferenced dead copies**. `crhs-corporate` serves exactly two files out of web-core's `assets/`
(`server/webCoreAssets.js:10`: `i18n.js`, `language-switcher.js`), and the affiliate portal serves its own
`public/privacy-policy.html`, `public/refund-policy.html`, `public/terms-and-conditions-embed.html`.
Nothing in either app resolves `assetsDir/legal`. The live legal text lives in the portal's `public/`.

| # | File | Lines carrying the mark | What it says | Decision asked |
|:--|:--|:--|:--|:--|
| L-1 | `crhs-web-core/assets/legal/terms-and-conditions.html` | 11 lines, incl. `:6` title "Terms & Conditions — WaveMAX Laundry Austin", `:7` meta description, `:9` `<link rel="canonical" href="https://rundberglaundry.com/terms-and-conditions">` | franchisor mark + retired marketing domain in a page nothing serves | **delete the file** from web-core, or keep and have counsel restate it? |
| L-2 | `crhs-web-core/assets/legal/privacy-policy.html` | 17 lines (title/meta, canonical, and in-body references) | same | same |
| L-3 | `crhs-web-core/assets/legal/refund-policy.html` | 10 lines (title/meta, canonical, and in-body references) | same | same |
| L-4 | `crhs-web-core/LICENSE` | `:47-48` "Use any name, trademark, trade dress, brand element, or service mark of CRHS Enterprises, LLC, WaveMAX Laundry, or any …"; `:150-152` notice address "c/o WaveMAX Laundry Austin / 825 E Rundberg Ln F1 / Austin, TX 78753" | the trademark carve-out names the franchisor's mark, and the notice address is the franchise location | counsel: does the carve-out keep naming the franchisor, and is the notice address to change? |

Notes for whoever answers:
- L-1..L-3 are byte-identical in purpose to the portal's live pages; deleting them from web-core removes
  the franchisor mark from the shared package without touching any published legal text.
- L-4 is licence text on a private package. `tests/brandNeutral.test.js` allowlists it with the reason
  "owner/counsel escalation"; that row stays until this is answered.
- Nothing here blocks the v0.3.0 release. The guard records each item rather than deferring it silently.

## Other slices

_Appended by each slice as it finds an owner/counsel item._
```
- [ ] **Step 2: Verify every claim in the list, mechanically.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
for f in assets/legal/terms-and-conditions.html assets/legal/privacy-policy.html assets/legal/refund-policy.html LICENSE; do printf '%s %s\n' "$(grep -Eic 'wavemax|rundberglaundry|runberglaundry|atxwash|wavemaxlaundry' $f)" "$f"; done
grep -n "SERVED = new Set" /mnt/c/Users/rickh/GitHub/crhs-corporate/server/webCoreAssets.js
grep -rn "assetsDir" /mnt/c/Users/rickh/GitHub/crhs-corporate/server /mnt/c/Users/rickh/GitHub/crhs-corporate/server.js /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/server /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/server.js | grep -c legal
```
- Expected: `11 …terms-and-conditions.html`, `17 …privacy-policy.html`, `10 …refund-policy.html`,
  `2 LICENSE`; then `10:const SERVED = new Set(['i18n.js', 'language-switcher.js']);`; then `0` — no
  consumer reference to `assetsDir` + `legal` anywhere. A non-zero last number falsifies the "dead
  copies" finding and the table's "Decision asked" column must be rewritten before the list is committed.
- [ ] **Step 3: Close B-5 in the durable checklist.** In `tasks/todo.md`, locate the `B-5` line by content
      (`grep -n "B-5" tasks/todo.md`) and mark it done, appending:
      `— closed by Plan 3 slice D (web-core v0.3.0); owner/counsel items listed in docs/refactor/OWNER-COUNSEL-ESCALATIONS.md`.
      Expected: `grep -c "OWNER-COUNSEL-ESCALATIONS" tasks/todo.md` prints `1`.
- [ ] **Step 4: Commit.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git add docs/refactor/OWNER-COUNSEL-ESCALATIONS.md tasks/todo.md && git commit -m "docs(escalations): owner/counsel list — web-core legal pages + LICENSE (Plan 3 D8)" -m "The three legal pages in web-core are unreferenced dead copies (corporate serves
two JS files from assetsDir; the portal serves its own public/ pages), so the ask
is delete-or-keep, not a legal rewrite. LICENSE trademark carve-out and notice
address go to counsel. Nothing in assets/legal or LICENSE is edited." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git log --oneline -1 && git revert --no-edit HEAD
test ! -f docs/refactor/OWNER-COUNSEL-ESCALATIONS.md && echo REMOVED
```
- Rollback expected: `REMOVED`.
- Rollback note: docs only. Reverting it re-opens Plan 3 exit criterion 7, so do not revert without
  recording where the list moved instead.

---

### Task D9: web-core — full gate, bump to **0.3.0**, commit, tag, push

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/package.json` (`:3` `"version": "0.2.1"` → `"0.3.0"`), `/mnt/c/Users/rickh/GitHub/crhs-web-core/package-lock.json`

**Interfaces:**
- Consumes: D1, D3, D4, D5, D6, D7 committed and the tree clean (D2 and D8 live in the affiliate repo).
- Produces:
  - tag `v0.3.0`; `require('@crhs/web-core/package.json').version === '0.3.0'`.
  - Surface **26** keys, `wc.csrf` still `{ createCsrf, CSRF_COOKIE_NAME }` — so no new instance of the
    bidirectional boot-breaker (`memory/deploy_b_bidirectional_bootbreaker.md`) is created by this release.
  - `tests/packageTopology.test.js:54-74` (the "release gate — v0.2.0" describe) still passes: its floor
    is `>= 0.2.0`.
- Test arithmetic from the 2026-09-20 baseline of **579** passing tests in **35** suites:
  D1 +6, D3 +3, D4 +9, D5 +5, D6 +7, D7 +2 (1 → 3) = **+32** → **611** tests, **35** suites (no new
  suite file). Any other number → STOP and account for it before bumping.

- [ ] **Step 1: Prove the tree is clean and the history is exactly this slice.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git status --porcelain | wc -l && git log --oneline -7
```
- Expected: `0`, then the six D commits (D7, D6, D5, D4, D3, D1 newest-first) on top of
  `768bfdb release: v0.2.1 — …`.
- [ ] **Step 2: Run the full gate before bumping.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | grep -E "^(FAIL|Tests:|Test Suites:)" && npm run lint && npx madge --circular src/
```
- Expected: no `FAIL` line; `Test Suites: 35 passed, 35 total`; `Tests:       611 passed, 611 total`;
  `eslint src tests` prints nothing; `✔ No circular dependency found!`.
  A suite that fails here must be re-run **alone** before debugging (memory
  `test_suite_fully_green_2026-06-20`: three suites have historically failed only in a full run).
- [ ] **Step 3: Bump the version.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm version 0.3.0 --no-git-tag-version && node -p "require('./package.json').version" && grep -m1 '"version"' package-lock.json
```
- Expected: `v0.3.0` (npm's echo), `0.3.0`, `  "version": "0.3.0",`.
- [ ] **Step 4: Commit and tag, then prove the tag is exact and the tree clean BEFORE pushing.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git add package.json package-lock.json && git commit -m "release: v0.3.0 — csp-nonce meta filled in place (live defect), SMTP timeouts, logger keeps every argument, deploy-stable locale token, app-language key + migration, brand guard over assets/

Surface unchanged at 26 keys; wc.csrf unchanged at { createCsrf, CSRF_COOKIE_NAME }.

Consumer-visible: injectNonce emits ONE content attribute on the csp-nonce meta
(the portal served content=\"\" content=\"…\" and every client-side nonce read was
empty), and the i18n localStorage key is now 'app-language' with a one-time
migration from the legacy key. The affiliate's two mirrored test assertions are
updated in its own repo (Plan 3 D2).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git tag v0.3.0
git describe --exact-match --tags && git status --porcelain | wc -l
```
- Expected: `v0.3.0`, then `0`. Anything else → STOP, do not push; fix the tree and re-point the tag with
  `git tag -f v0.3.0` only after re-running Step 2.
- [ ] **Step 5: Push.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git push origin main v0.3.0 && git ls-remote --tags origin v0.3.0 | wc -l
```
- Expected: `1`.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git tag -d v0.3.0 && git push origin :refs/tags/v0.3.0 && git ls-remote --tags origin v0.3.0 | wc -l
git revert --no-edit HEAD && node -p "require('./package.json').version"
```
- Rollback expected: `0`, then `0.2.1`.
- Rollback notes:
  - Deleting a pushed tag is a remote history change: **confirm with the owner first** (root `CLAUDE.md`
    destructive-git rule). If any box has already installed `0.3.0`, roll the boxes back first (D11
    rollback), then the tag.
  - Reverting the release commit alone leaves the D1–D7 commits in place; that is a *versioned* tree at
    `0.2.1` with `0.3.0` content — the exact skew the install trap punishes. Either revert the D commits
    too, or re-tag. Never leave that state on a box.

---

### Task D10: consumers — adopt v0.3.0 **locally** (both repos), prove the stale-copy trap, raise corporate's floor

Local only. Nothing on a box changes until D11.

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/packageTopology.test.js` (`:39` comment phrase, `:48` floor `'0.2.1'` → `'0.3.0'`)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/package-lock.json` (`:539-540`)
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/package-lock.json` (`:667-668`)

**Interfaces:**
- Consumes: tag `v0.3.0` (D9) and D2 (the affiliate's corrected assertions).
- Produces: both consumers recording `0.3.0`; corporate's suite failing loudly on a stale core copy.
- Corporate compatibility, checked API by API: corporate reads the nonce meta through `{{CSP_NONCE}}`
  (11 pages), so D1 does not change a byte of its output; it calls `readHTMLWithNonce` with 2 args
  (`server/contentHandler.js`); it serves web-core's `i18n.js` (D5/D6 apply there, by design); it sets
  `LOG_SERVICE_NAME=crhs-corporate`, so D4's `'app'` default is not reached.
- Affiliate compatibility: it wraps `injectNonce` rather than re-implementing it
  (`server/utils/cspHelper.js:32-34`, brand object passed as the 3rd arg — unchanged by D1) and serves its
  **own** `public/assets/js/i18n.js`, so D5/D6 do not touch the portal's client behaviour at all.
- **Global Constraint 19:** the affiliate full suite (~67 min) is NOT run inside this task. Seam suites +
  a boot probe + `madge` here; the full suite runs once, controller-run, in D10 Step 7.

- [ ] **Step 0: Record each consumer's pre-change suite baseline** (Plan 2's published numbers are stale —
      `tests/crhsent-parity.test.js` was deleted by its Task 23).
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npm test 2>&1 | grep -E "^(FAIL|Tests:|Test Suites:)"
```
- Expected: recorded, not asserted. Write the two lines down; Step 5 compares against them.
- [ ] **Step 1: Prove the stale-copy trap in corporate — this is the failing test.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
sed -i "s/version, '0.2.1'))/version, '0.3.0'))/; s/OLDER than 0.2.1 against this code/OLDER than 0.3.0 against this code/" tests/packageTopology.test.js
git diff --stat tests/packageTopology.test.js
npm install --install-links --no-audit --no-fund >/dev/null 2>&1; node -p "require('@crhs/web-core/package.json').version"
npx jest tests/packageTopology.test.js 2>&1 | grep -E "✕|Expected|Received|Tests:"
```
- Expected: `1 file changed, 2 insertions(+), 2 deletions(-)`; then `0.2.1` — **npm reported nothing to do
  and did not re-copy**, which is the trap itself; then a failure reading
  `expect(received).toBeGreaterThanOrEqual(expected)` / `Expected: >= 0` / `Received:    -1`.
- [ ] **Step 2: Re-copy corporate's dependency and gate it.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund >/dev/null && node -p "require('@crhs/web-core/package.json').version" && node -p "Object.keys(require('@crhs/web-core')).length" && node -p "Object.keys(require('@crhs/web-core').csrf).includes('createCsrf')" && node -p "typeof require('@crhs/web-core').logger.flushAndExit"
```
- Expected: `0.3.0`, `26`, `true`, `function`.
- [ ] **Step 3: Rewrite corporate's lockfile.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && sed -i '/"node_modules\/@crhs\/web-core"/,/}/ s/"version": "0.2.1"/"version": "0.3.0"/' package-lock.json && grep -A1 '"node_modules/@crhs/web-core"' package-lock.json
```
- Expected: `"node_modules/@crhs/web-core": {` then `      "version": "0.3.0",`.
- [ ] **Step 4: Prove the nonce fix is a no-op for corporate's own pages.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && node -e "
const wc = require('@crhs/web-core').cspHelper;
const fs = require('fs');
const html = fs.readFileSync('content/crhsent/index.html','utf8');
const out = wc.injectNonce(html, 'NONCE123');
const m = out.match(/<meta name=\"csp-nonce\"[^>]*>/)[0];
console.log(m);
console.log('content attrs:', (m.match(/content=/g)||[]).length);
console.log('placeholder left:', out.includes('{{CSP_NONCE}}'));"
```
- Expected: `<meta name="csp-nonce" content="NONCE123">`, `content attrs: 1`, `placeholder left: false`.
- [ ] **Step 5: Corporate suite, lint, cycles.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npm test 2>&1 | grep -E "^(FAIL|Tests:|Test Suites:)"; npm run lint && npx madge --circular server/
```
- Expected: identical to the Step 0 baseline **plus nothing** — the same `Tests:`/`Test Suites:` lines and
  the same (possibly empty) `FAIL` set; then no lint output and `✔ No circular dependency found!`.
  Any new failure is a real incompatibility: STOP.
- [ ] **Step 6: Affiliate — re-copy, gate, lockfile, seam suites, boot probe, cycles.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund >/dev/null && node -p "require('@crhs/web-core/package.json').version" && node -p "Object.keys(require('@crhs/web-core').csrf)" && node -p "Object.keys(require('@crhs/web-core')).length" && node -p "require.resolve('mongoose',{paths:[require.resolve('@crhs/web-core')]})===require.resolve('mongoose')"
sed -i '/"node_modules\/@crhs\/web-core"/,/}/ s/"version": "0.2.1"/"version": "0.3.0"/' package-lock.json && grep -A1 '"node_modules/@crhs/web-core"' package-lock.json
npx jest tests/unit/cspHelper.test.js tests/unit/cspHelper.brand.test.js tests/integration/webCoreInstanceIdentity.test.js tests/integration/webCoreConsumptionGolden.test.js tests/integration/securityHeaders.test.js 2>&1 | grep -E "FAIL|Tests:"
NODE_ENV=test node -e "require('./server.js'); console.log('BOOT_OK'); process.exit(0)"
npx madge --circular server/
```
- Expected: `0.3.0`, `[ 'createCsrf', 'CSRF_COOKIE_NAME' ]`, `26`, `true`; the lock line `"version": "0.3.0",`;
  no `FAIL` line across the five suites; `BOOT_OK`; `✔ No circular dependency found!`.
  (`wc.SystemConfig.base` is deliberately not probed — it throws `OverwriteModelError` in the affiliate,
  Plan 2 Global Constraint 16e.)
- [ ] **Step 7: Prove the fix on a real portal page, and that the SPA's nonce contract still holds.**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && node -e "
const { readHTMLWithNonce } = require('./server/utils/cspHelper');
readHTMLWithNonce(require('path').join(__dirname,'public/embed-app-v2.html'), 'NONCE123').then((out) => {
  const meta = out.match(/<meta name=\"csp-nonce\"[^>]*>/)[0];
  console.log(meta);
  console.log('content attrs:', (meta.match(/content=/g)||[]).length);
  console.log('asset-version filled:', /<meta name=\"asset-version\" content=\"[^\"]+\">/.test(out));
});"
```
- Expected: `<meta name="csp-nonce" content="NONCE123">`, `content attrs: 1`,
  `asset-version filled: true`. The last line proves D1 did not disturb the affiliate's
  `injectAssetVersion` pass, which runs on the same string right after `injectNonce`.
- [ ] **Step 8: Controller-run, background: the affiliate full suite exactly once** (~67 min, Global
      Constraint 19 / R-16). Record `Test Suites:` and `Tests:` and compare against the last recorded full
      run. Expected: no new failure attributable to web-core; a suite that fails is re-run alone before
      being called a regression.
- [ ] **Step 9: Commit and push both consumers.**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && git add tests/packageTopology.test.js package-lock.json && git commit -m "deps: web-core 0.3.0 floor + lockfile" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git push origin main
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git add package-lock.json && git commit -m "deps: record web-core 0.3.0 in the lockfile" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git push origin main
```

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && git revert --no-edit HEAD && rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund >/dev/null && node -p "require('@crhs/web-core/package.json').version"
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git revert --no-edit HEAD && rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund >/dev/null && node -p "require('@crhs/web-core/package.json').version"
```
- Rollback expected: `0.3.0` **both times** — the local web-core working tree is still at 0.3.0, so the
  install re-copies 0.3.0 and the reverted corporate floor test (`>= 0.2.1`) passes. To return the
  consumers to a 0.2.1 core you must also roll web-core back (D9 rollback) and re-run both `rm -rf` +
  install steps. Stating this plainly because a half-rollback here is the documented boot-breaker.

---

### Task D11: [per box] **HUMAN-CONFIRM** — deliver `v0.3.0`, reinstall BOTH consumers, gate, boot probes, reload both apps, verify the live nonce meta

**Files:** box only — `/var/www/crhs-web-core/` (rsync target),
`/var/www/crhs-corporate/node_modules/@crhs/web-core`,
`/var/www/wavemax/wavemax-affiliate-program/node_modules/@crhs/web-core`. No `.env` change. No corporate
or affiliate application code is delivered by this task.

**Interfaces:**
- Consumes: `v0.3.0` pushed (D9), both consumers' lockfiles pushed (D10), D10 Step 8 clean.
- Produces: both apps on both boxes running `@crhs/web-core@0.3.0`; `RELOAD_TS_AFF_<box>` and
  `RELOAD_TS_CORP_<box>` recorded (box clock, UTC `YYYY-MM-DDTHH:MM:SS`).
- **Order is fixed (Plan 2 R-1 / Global Constraint 16):** web-core rsync → `rm -rf` + install in BOTH
  consumers → gate → boot probes → `pm2 reload wavemax` → `pm2 reload crhs-corporate` → verification.
- **Blast radius while broken (§9.7):** crhsent.com **and** the portal on this box. The CF LB monitor
  (`/health/origin`) fails the box over to its peer, with the ~1–2 min partial-502 propagation window
  recorded as scope-brief item 20 — so the two boxes are **never** mid-deploy at the same time.
- **Box order.** Pass 1 `BOX=oci1 IP=161.153.71.201`; Pass 2 `BOX=oci2 IP=144.24.4.202`, started only
  after Pass 1's Step 8 is green.
- **Why `rm -rf` is mandatory, every time, per consumer, per box:** `npm install` prints "up to date" and
  does not re-copy a `file:` dependency when the version is unchanged; a box that skips it runs old core
  bytes under a new version string. That combination has killed the portal
  (`memory/deploy_b_bidirectional_bootbreaker.md`).

- [ ] **Step 1: Set the box and take the read-only baseline.**
```bash
BOX=oci1; IP=161.153.71.201        # Pass 2: BOX=oci2; IP=144.24.4.202
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%FT%T; pm2 jlist | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>JSON.parse(s).forEach(a=>console.log(a.name,a.pm2_env.status,a.pm2_env.restart_time)))"; for d in /var/www/wavemax/wavemax-affiliate-program /var/www/crhs-corporate; do cd $d && echo "$d $(node -p "require(\"@crhs/web-core/package.json\").version")"; done'
```
- Expected: a UTC timestamp; `wavemax online <n>` and `crhs-corporate online <m>`; then
  `/var/www/wavemax/wavemax-affiliate-program 0.2.1` and `/var/www/crhs-corporate 0.2.1`. Record `<n>`,
  `<m>` — Step 7 compares restart counts.
- [ ] **Step 2: Snapshot the current web-core tree (the rollback source).**
```bash
TS=$(ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%Y-%m-%dT%H%M%S'); echo "TS=$TS"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "mkdir -p ~/deploy-snapshots && tar -C /var/www -czf ~/deploy-snapshots/crhs-web-core-$TS.tgz --exclude node_modules --exclude .git --exclude logs crhs-web-core && ls -l ~/deploy-snapshots/crhs-web-core-$TS.tgz"
```
- Expected: `TS=<stamp>` then one `-rw-` line for the tarball, non-zero size.
- [ ] **Step 3: Deliver the tree by rsync from the workstation** (the boxes hold no GitHub credentials —
      Plan 2 Global Constraint 1).
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && git describe --exact-match --tags && git status --porcelain | wc -l
rsync -az --delete --exclude node_modules --exclude .git --exclude logs --exclude coverage -e "ssh -i ~/.ssh/oci_wavemax" ./ ubuntu@$IP:/var/www/crhs-web-core/
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'node -p "require(\"/var/www/crhs-web-core/package.json\").version"'
```
- Expected: `v0.3.0`, `0`, then `0.3.0`.
- [ ] **Step 4: Reinstall BOTH consumers — `rm -rf` first, no exceptions.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/wavemax/wavemax-affiliate-program && rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund 2>&1 | tail -2'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate && rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund 2>&1 | tail -2'
```
- Expected: two npm summaries, neither containing `npm ERR!`.
- [ ] **Step 5: The pre-reload gate, both consumers (Global Constraint 16).**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'for d in /var/www/wavemax/wavemax-affiliate-program /var/www/crhs-corporate; do cd "$d" && echo "$d $(node -p "require(\"@crhs/web-core/package.json\").version") $(node -p "Object.keys(require(\"@crhs/web-core\")).length") $(node -p "Object.keys(require(\"@crhs/web-core\").csrf).includes(\"createCsrf\")") $(node -p "require.resolve(\"mongoose\",{paths:[require.resolve(\"@crhs/web-core\")]})===require.resolve(\"mongoose\")") $(node -p "typeof require(\"@crhs/web-core\").logger.flushAndExit")"; done'
```
- Expected, exactly:
  `/var/www/wavemax/wavemax-affiliate-program 0.3.0 26 true true function`
  `/var/www/crhs-corporate 0.3.0 26 true true function`
  Any `false`, any version other than `0.3.0`, any count other than `26` → **STOP** and run the rollback.
- [ ] **Step 6: Boot probes, before any reload.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'for d in /var/www/wavemax/wavemax-affiliate-program /var/www/crhs-corporate; do cd "$d" && node -e "try{require(\"./server.js\");console.log(\"BOOT_OK $d\");process.exit(0)}catch(e){console.log(\"BOOT_FAIL $d \"+e.message);process.exit(1)}"; done'
```
- Expected: `BOOT_OK /var/www/wavemax/wavemax-affiliate-program` and `BOOT_OK /var/www/crhs-corporate`.
  A `BOOT_FAIL` → **STOP**, run the rollback; do not reload.
- [ ] **Step 7: Reload the portal, then corporate, and record the timestamps.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%FT%T; pm2 reload wavemax --update-env'; sleep 10
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'date -u +%FT%T; pm2 reload crhs-corporate --update-env'; sleep 15
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 jlist | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>JSON.parse(s).forEach(a=>console.log(a.name,a.pm2_env.status,a.pm2_env.restart_time)))"'
```
- Expected: two UTC timestamps (record as `RELOAD_TS_AFF_<box>` / `RELOAD_TS_CORP_<box>`); both apps
  `online`; each `restart_time` at most **one** higher than Step 1's — a climbing count is a crash loop:
  **STOP**, roll back.
- [ ] **Step 8: Verify on the box, then verify the live defect is gone.**
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'curl -s -o /dev/null -w "portal-health %{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health; curl -s -o /dev/null -w "health-origin %{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health/origin; curl -s -o /dev/null -w "crhsent %{http_code}\n" -H "Host: crhsent.com" http://127.0.0.1:3001/'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'curl -s -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/embed-app-v2.html | grep -o "<meta name=\"csp-nonce\"[^>]*>"'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'curl -s -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/embed-app-v2.html | grep -o "<meta name=\"asset-version\"[^>]*>"'
curl -s "https://portal.atxwashdryfold.com/embed-app-v2.html?lh=$(date +%s)" | grep -o '<meta name="csp-nonce"[^>]*>'
```
- Expected:
  - `portal-health 200`, `health-origin 200`, `crhsent 200`;
  - on-box: exactly `<meta name="csp-nonce" content="<base64>">` — **one** `content=`, non-empty
    (against v0.2.1 this line reads `content="" content="<base64>"`, the live defect);
  - on-box: `<meta name="asset-version" content="<token>">` with a non-empty token;
  - through Cloudflare: the same single-attribute form (a cached HTML response would still show the
    duplicate — the page is served `no-store` by `serveHTMLWithNonce`, so a duplicate here after both
    boxes are done means the reload did not take).
- [ ] **Step 9: Log evidence since the reload** (R-4: read `$LOG_DIR/combined.log`, never `pm2 logs`).
```bash
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/wavemax/wavemax-affiliate-program && grep -c "Server running on port 3000 in production mode" logs/combined.log; cd /var/www/crhs-corporate && grep -c "crhs-corporate listening on 3001" logs/combined.log; grep -h "\"level\":\"error\"" logs/combined.log | tail -5'
```
- Expected: both boot-marker counts increased by the worker count of one reload; the last five error
  lines contain nothing new since `RELOAD_TS_*` — and specifically no `flushAndExit`, `captureExtraArgs`
  or `fillMetaContent` reference (a `TypeError` naming any of those means a half-installed core: STOP).
- [ ] **Step 10: Record the box as done.** Append `BOX_D_DONE_<box>=<RELOAD_TS_CORP_<box>>` to the cutover
      record and only then start Pass 2.

**Rollback (exact; per box, order: tree → reinstall → gate → boot probe → reload → verify).**
```bash
BOX=oci1; IP=161.153.71.201; TS=<the stamp recorded in Step 2>
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP "set -e
R=\$(mktemp -d)
tar -C \"\$R\" -xzf ~/deploy-snapshots/crhs-web-core-$TS.tgz
rsync -a --delete --exclude node_modules --exclude .git --exclude logs \"\$R/crhs-web-core/\" /var/www/crhs-web-core/
rm -rf \"\$R\"
node -p 'require(\"/var/www/crhs-web-core/package.json\").version'"
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/wavemax/wavemax-affiliate-program && rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund 2>&1 | tail -2'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'cd /var/www/crhs-corporate && rm -rf node_modules/@crhs/web-core && npm install --install-links --no-audit --no-fund 2>&1 | tail -2'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'for d in /var/www/wavemax/wavemax-affiliate-program /var/www/crhs-corporate; do cd "$d" && echo "$d $(node -p "require(\"@crhs/web-core/package.json\").version") $(node -p "Object.keys(require(\"@crhs/web-core\")).length") $(node -p "Object.keys(require(\"@crhs/web-core\").csrf).includes(\"createCsrf\")")" && node -e "try{require(\"./server.js\");console.log(\"BOOT_OK\");process.exit(0)}catch(e){console.log(e.message);process.exit(1)}"; done'
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 reload wavemax --update-env'; sleep 10
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'pm2 reload crhs-corporate --update-env'; sleep 15
ssh -i ~/.ssh/oci_wavemax ubuntu@$IP 'curl -s -o /dev/null -w "portal-health %{http_code}\n" -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/health; curl -s -o /dev/null -w "crhsent %{http_code}\n" -H "Host: crhsent.com" http://127.0.0.1:3001/; curl -s -H "Host: portal.atxwashdryfold.com" http://127.0.0.1:3000/embed-app-v2.html | grep -o "<meta name=\"csp-nonce\"[^>]*>"'
```
- Rollback expected, in order: `0.2.1`; two npm summaries without `npm ERR!`;
  `/var/www/wavemax/wavemax-affiliate-program 0.2.1 26 true` + `BOOT_OK` and
  `/var/www/crhs-corporate 0.2.1 26 true` + `BOOT_OK`; `portal-health 200`, `crhsent 200`; and the meta
  line back to `<meta name="csp-nonce" content="" content="<base64>">` — the defect restored, which is
  the correct rollback state.
- Rollback notes:
  - **The affiliate suite goes red after a box rollback if D2 is merged** — it asserts the fixed output.
    That is a repo state, not a box state; do not "fix" it by reverting D2 on a box.
  - Roll back **both** consumers on a box together. One consumer on 0.3.0 and the other on 0.2.1 is the
    documented boot-breaker shape.
  - A box rollback does **not** restore a visitor's legacy language key (D6 rollback note).

---

## What slice D closes, and what it hands off

**Closes:** scope-brief items 16, 17, 18, 19 and owner decision 1; Plan 3 exit criterion 6 (web-core
released with the nonce fix, SMTP timeouts, logger and the i18n cache fix) and the web-core half of exit
criterion 7 (the escalation list); memory backlog item **B-5** and the web-core part of **B-4**.

**Hands off (each one needs an owner, or Plan 3's backlog is not empty):**
1. **`{{nonce}}` on `administrator-dashboard-embed.html`** (F-D6) — an unsubstituted placeholder used as a
   nonce in a page-level CSP meta and on ~10 script tags. Needs a decision in the **affiliate** slice, not
   in a web-core release.
2. **`logger.flushAndExit` adoption** — replace the inlined copy at `crhs-corporate/server.js:172-178` and
   the four bare `process.exit(1)` sites in `wavemax-affiliate-program/server.js` (`:47`, `:66`, `:165`,
   `:1072`). One line each; belongs to whichever slice touches those files.
3. **Corporate does not publish `<meta name="asset-version">`** — D5's precedence chain means it does not
   need to, and `/locales` is `max-age=1h`, so the worst case is one hour of staleness after a locale
   change that forgets to re-stamp `i18n.js?v=`. If the owner wants zero staleness, corporate adds the
   meta (one line per content page + one fill in `contentHandler`).
4. **`assets/legal/*.html` + `LICENSE`** — escalated in D8, allowlisted in D7 until answered.
5. **The two bridge rows in D7's `ALLOW`** — slice B's deletion makes D7 fail until they are pruned. That
   is deliberate.

---

## Open questions for the controller (underspecified in the brief)

1. **Who runs D11?** It is a production write on both boxes. Plan 2 put every box write in one
   controller-owned GATE slice (R-1). If Plan 3 keeps that convention, D11 should move into Plan 3's
   own gate slice and D1–D10 stay as implementer work. Drafted standalone so either choice works.
2. **D2 and D8 touch the affiliate repo** while the rest of D is web-core. If slice ownership is per-repo,
   those two need re-homing; they are listed here because they are inseparable from the release.
3. **The affiliate full-suite baseline** is not published anywhere current (Plan 2's numbers predate its
   own Task 23). D10 Step 8 needs a recorded number to compare against, or it can only say "no new
   failures", which is weaker.
