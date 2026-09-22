# Plan 3 — SLICE B draft: the cleanup the nginx flips unblock

**Status:** draft, 2026-09-20. Covers scope-brief group **B** (items 8–12). Task numbers are `B1…B15`;
the controller renumbers. Written to the Plan 2 task format (`**Files:**`, `**Interfaces:**`, numbered
`- [ ] **Step N:**` with fenced bash, an `- Expected:` line per step, a `**Rollback (exact)**` block).

**Every Plan 2 Global Constraint applies unchanged.** The four that bite hardest here:

- **GC 14** — one concern per PR, ≤ 500-line diff (deletion-only commits may exceed it: stated per task),
  move-then-delete, strict TDD with the failing test shown failing **for the right reason first**,
  every user-facing string in en/es/pt/de **in the same commit**, `logger` only in `server/`,
  never `--no-verify`, `madge --circular server/` = 0, trailer
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **GC 19** — the affiliate full suite (~67 min) is **never run inside an implementer task**. Affiliate tasks
  run targeted suites; the full suite runs **once**, controller-run, in Task **B14**. Affiliate baseline at
  slice start: exactly **2** known failing suites (`tests/unit/branding-guard.test.js`,
  `tests/unit/i18n-brand-token.test.js`) — **B13 closes both**. Affiliate `eslint server/` baseline **208**
  errors (D-4 owns the cleanup); slice B must not increase it.
- **GC 16** — `rm -rf node_modules/@crhs/web-core` before any reinstall; gate before any `pm2 reload`.
- **GC 18** — `.env` / `.env.example` / nginx / Cloudflare / Mailcow edits are **HUMAN-CONFIRM**.

---

## Sequencing — the B-1 / B-2 dependency on slice A, stated explicitly

The scope brief lists B-1 and B-2 as open. **Measured 2026-09-20, B-1 is already shipped** (affiliate
`6acbf550`): the portal login link is config-driven through `server/config/links.js` →
`INTEREST_FORM_URL`, published as `<meta name="interest-form-url">` by `server/utils/cspHelper.js:29-30`,
and the copy is `common.buttons.applyNow` / `affiliate.login.noAccount` in all four locales. What remains is
**one residual hole** (Task B1) and the fact that `INTEREST_FORM_URL` is **not in `.env.example`**.

**Measured 2026-09-20, the interest form has already MOVED.** `crhs-corporate` serves it at
`content/atxwashdryfold/affiliate/index.html` (336 lines, de-branded, `atxwashdryfold` wordmark, canonical
`https://atxwashdryfold.com/affiliate`) — Plan 2 Task 34 did the move. **It has zero `data-i18n` and loads no
`i18n.js`.** So B-2's target is the **corporate** copy, not `public/affiliate.html`; doing B-2 in the
affiliate repo would be work that Task B9 immediately deletes.

Therefore this slice is cut into three phases with a hard gate between the second and the third:

| Phase | Tasks | Position relative to slice A's flips |
|:--|:--|:--|
| **B-i** — interest form | B1–B4 | **BEFORE slice A's first flip.** Dark: corporate on `:3001` is not yet public, so B2–B4 carry zero public risk, and the flip then delivers a translated `/affiliate` as its first public byte. B1 is flip-independent (config-driven by construction) and may land any time before the flip. |
| **B-ii** — bridge retirement | B5–B7 | **Flip-independent**, but a coupled three-repo release: B5 (affiliate) → B6 (corporate) → B7 (web-core), and B6 must be in corporate's tree **before** corporate installs the web-core release that contains B7. |
| **B-iii** — affiliate deletion | B8–B15 | **AFTER all four hosts are flipped to `:3001` and each host's post-flip Lighthouse C14 gate has passed.** Deleting `partnerLanding` while any marketing host still resolves to `:3000` takes that host's public page down. The gate is slice A's record; B8 Step 1 asserts it. |

**Why B-1/B-2 could not be done earlier, and what closes the trap for good:** the destination page moves
between apps, so a same-origin `/affiliate` link 404s at cutover. B-1 already answered that with config
indirection (`INTEREST_FORM_URL`); slice A item 5 sets it to `https://atxwashdryfold.com/affiliate` at
cutover. Task B1 closes the one path where the indirection does not reach the client, and Task B14 records
both memory files as closed.

### Cross-slice findings handed to slice A (do NOT implement here)

Measured 2026-09-20. Each is an inbound URL that a marketing host serves **today** from `:3000` and that
`crhs-corporate` does **not** serve after the flip, so it 404s the moment that host flips. None is in
`server/middleware/legacyPortalRedirects.js`'s `EXACT_PATHS`/`PREFIXES`.

| URL on a marketing host | Served today by | After flip | Note |
|:--|:--|:--|:--|
| `/privacy-policy`, `/privacy-policy.html` | affiliate `server.js` legal routes | **404** | `public/privacy-policy.html:10` sets `<link rel="canonical" href="https://rundberglaundry.com/privacy-policy">` — an indexed canonical |
| `/terms-of-service`, `/terms-and-conditions`, `/terms-and-conditions.html` | affiliate legal routes | **404** | `public/terms-and-conditions.html:10` same |
| `/refund-policy` | affiliate | **404** | reachable via the SPA route map |
| `/assets/js/embed-navigation.js`, `/assets/js/revenue-calculator.js` | affiliate `express.static` | **404** | **loaded cross-origin by the portal's own page**: `public/embed-landing.html:314` and `:317` hardcode `https://rundberglaundry.com/assets/js/…`. The portal landing loses its navigation + revenue calculator at the flip. Fix = make them same-origin (`/assets/js/…`, both files exist in `public/assets/js/`). Also `public/embed-landing.html:294` links `https://rundberglaundry.com/operator`, and `public/assets/js/affiliate-landing-init.js:37` links `https://rundberglaundry.com`. |
| `/design-explorer`, `/design-explorer/*` | affiliate, token-gated | **404** | still reachable at `portal.atxwashdryfold.com/design-explorer?k=…`; Task B11 deletes it outright on the owner's word |
| `/affiliate-login-embed.html` and the other `*-embed.html` fragments | affiliate `embedRoutes` | **404** | only `/operator-scan-embed.html` is in the B7 301 list |

**Recommended disposition:** the three script/link cross-origin references in `embed-landing.html` and
`affiliate-landing-init.js` are a **portal defect that breaks at the flip** and should land in slice A's
"0b affiliate portal-only hygiene" step, before the first flip. The legal-page 404s need an owner/counsel
call: add `/privacy-policy`, `/terms-of-service`, `/terms-and-conditions`, `/refund-policy` to
`legacyPortalRedirects.EXACT_PATHS` (301 to the portal, which serves them), or publish copies in
`content/atxwashdryfold/`. Escalated in Task B14's list either way.

### Other measured findings recorded for the controller

1. **`data-i18n` on a `<meta>` is a silent no-op.** web-core's `assets/js/i18n.js:210-236` sets
   `element.textContent` for a bare `data-i18n`; a void element has no text content, so the `content`
   attribute is never touched. The shipped marketing home page carries **5** such dead attributes
   (`content/atxwashdryfold/index.html:8, 17, 21, 22` — `:8` description, `:17`/`:22` OG+Twitter
   description, `:16`/`:21` ogTitle). Task **B4** is the fix; it is flagged OPTIONAL because it belongs to
   A15's page and it moves `tests/i18nParity.test.js`'s pinned `104`.
2. **The `/affiliate` form's most likely validation failure resolves to the wrong support address.**
   `server/routes/affiliateApplicationRoutes.js:44-49` — the mandatory `message` (customer-acquisition plan,
   min 80 chars, the F-3 field) has **no** error code, so `formatValidationErrors` stamps
   `GENERIC_CODE = 'partner.form.errGeneric'`, whose copy names `pickups@atxwashdryfold.com`. Today
   `affiliate-inquiry.js` sidesteps it by preferring `errors[0].msg`; the moment B3 adds a code→i18n lookup
   the guidance is replaced by partner-program copy with the wrong mailbox. **Task B2 must land before B3.**
3. **The `/embed` slash command teaches the deleted bridge.** `.claude/commands/embed.md:22-45` instructs
   adding `/assets/js/iframe-bridge-v2.js` to a route's `pageScripts`. Task B5 retires it.
4. `jest.config.js:24` sets `forceExit: true` in the affiliate repo, so "tests pass without `--forceExit`"
   is not currently true at the config level. Out of slice-B scope; recorded in B14's escalation list.

---

## Task index

| # | Repo | Phase | Task |
|:--|:--|:--|:--|
| B1 | affiliate | B-i | B-1 residual — publish `interest-form-url` on the direct-access login page; document `INTEREST_FORM_URL` |
| B2 | corporate | B-i | `/affiliate` validator error codes (prerequisite for B3) |
| B3 | corporate | B-i | **B-2** — the i18n layer on the interest form, `affiliate.*` × 4 locales |
| B4 | corporate | B-i | *(OPTIONAL)* the 5 dead `data-i18n` attributes on `<meta>` elements |
| B5 | affiliate | B-ii | delete the affiliate's four bridge files + build + the `/embed` command |
| B6 | corporate | B-ii | retire the bridge assertions (must precede B7's install) |
| B7 | web-core | B-ii | **item 10** — delete both bridge assets + the `securityHeaders.js:81-88` carve-out |
| B8 | affiliate | B-iii | read-only deletion manifest + HUMAN-CONFIRM gate |
| B9 | affiliate | B-iii | **item 8** — marketing pages, assets, `partner.*` locales, `partnerLanding` |
| B10 | affiliate | B-iii | intake routes + **4 of the 5** CSRF rows |
| B11 | affiliate | B-iii | design explorer + concierge + the **5th** CSRF row |
| B12 | affiliate | B-iii | host-surface prune (CSP / CORS / sitemap / redirect fallbacks) |
| B13 | affiliate | B-iii | close both known guard failures → affiliate suite fully green |
| B14 | — | B-iii | slice exit: full suite once, backlog records closed, escalation list |
| B15 | affiliate | B-iii | *(OPTIONAL)* delete `locationQuarantine` — dead franchisor-redirect config |

---

# Phase B-i — the interest form (before slice A's first flip)

### Task B1: [affiliate] B-1 residual — `interest-form-url` on the direct-access login page, and `INTEREST_FORM_URL` in `.env.example`

> B-1's config indirection reaches the client through **one** injection point: `cspHelper.injectAssetVersion`
> replaces the literal `<meta name="interest-form-url" content="">`, and that placeholder exists **only** in
> `public/embed-app-v2.html:8`. `public/affiliate-login-embed.html` has no such meta and is served directly by
> `server/routes/embedRoutes.js:24`, so on that access path
> `public/assets/js/affiliate-login.js:172-174` finds no meta and falls back to the hardcoded `'/affiliate'` —
> which 404s the moment slice A flips the hosts. This is PITFALLS #3 (one access path works, the other
> breaks). One-line fix, plus the `.env.example` documentation the cutover needs.

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/public/affiliate-login-embed.html` (add the meta placeholder after `:6`).
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/.env.example` (**HUMAN-CONFIRM**).
- Create: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tests/integration/interestFormLink.test.js`.
- Not modified here: `server/config/links.js`, `server/utils/cspHelper.js`, `public/assets/js/affiliate-login.js` — all already correct.

**Interfaces:**
- **Consumes:**
  - `server/config/links.js` (`INTEREST_FORM_URL`, default `/affiliate`) and
    `server/utils/cspHelper.js:29-30`, both shipped in `6acbf550`.
  - **Slice A item 5** — at cutover `INTEREST_FORM_URL=https://atxwashdryfold.com/affiliate` on both boxes.
    This task does **not** set it and must not; it only guarantees that whatever slice A sets reaches the
    client on **both** access paths. Landing this task before or after the flips is therefore safe; landing
    it before is preferred so the flip has nothing left to break.
- **Produces:** `tests/integration/interestFormLink.test.js` — the surviving half of
  `tests/integration/partnerProgramOpenAccess.test.js` (Task B9 deletes that file). It pins: the meta is
  injected on `/`, on `/embed-app-v2.html` **and** on `/affiliate-login-embed.html`; the value equals
  `INTEREST_FORM_URL`; `affiliate-login.js` reads the meta; `links.js` reads `process.env`.

- [ ] **Step 1: Write the failing test.** Create `tests/integration/interestFormLink.test.js`:

```js
'use strict';
// B-1 (Plan 3 slice B): the invite-only portal's "Apply now" link must resolve to the
// CONFIG-DRIVEN interest-form URL on EVERY access path, not just inside the SPA shell.
// The interest form lives in the content app after the Plan 3 flip, so a hardcoded
// same-origin '/affiliate' silently 404s. PITFALLS #3: assert both access paths.
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../../server');
const { INTEREST_FORM_URL } = require('../../server/config/links');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const META = `<meta name="interest-form-url" content="${INTEREST_FORM_URL}">`;

describe('interest-form link (B-1)', () => {
  test.each(['/', '/embed-app-v2.html', '/affiliate-login-embed.html'])(
    '%s publishes the resolved interest-form URL', async (route) => {
      const res = await request(app).get(route).set('Host', 'portal.atxwashdryfold.com');
      expect(res.status).toBe(200);
      expect(res.text).toContain(META);
      expect(res.text).not.toContain('<meta name="interest-form-url" content="">');
    });

  test('the login page ships the placeholder so injection has something to replace', () => {
    expect(read('public/affiliate-login-embed.html'))
      .toContain('<meta name="interest-form-url" content="">');
  });

  test('the click handler reads the meta and the destination is env-driven', () => {
    expect(read('public/assets/js/affiliate-login.js')).toMatch(/meta\[name="interest-form-url"\]/);
    expect(read('server/config/links.js')).toMatch(/process\.env\.INTEREST_FORM_URL/);
  });

  test('.env.example documents the cutover key', () => {
    expect(read('.env.example')).toMatch(/^INTEREST_FORM_URL=/m);
  });
});
```

- [ ] **Step 2: Run it and read the failure.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npx jest tests/integration/interestFormLink.test.js 2>&1 | tail -30
```
  - Expected: `Tests: 3 failed, 3 passed, 6 total`. The three failures must be, in order:
    `/affiliate-login-embed.html publishes the resolved interest-form URL` (received HTML contains no
    `interest-form-url` meta at all), `the login page ships the placeholder …`, and
    `.env.example documents the cutover key`. `/` and `/embed-app-v2.html` must already PASS — they prove the
    injection path works and that only the direct-access page is missing the placeholder. **If `/` fails, STOP:**
    the premise (B-1 shipped and works) is wrong and this task's scope is not what it says.

- [ ] **Step 3: Add the placeholder to the login page.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
sed -i '6a\    <meta name="interest-form-url" content="">' public/affiliate-login-embed.html
sed -n '4,9p' public/affiliate-login-embed.html
grep -c '<meta name="interest-form-url" content="">' public/affiliate-login-embed.html
```
  - Expected: the printed block is exactly
    ```
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="csp-nonce" content="">
        <meta name="interest-form-url" content="">
        <meta name="brand-name" content="">
        <title>{{BRAND_NAME}} WDF Affiliate Portal — Login</title>
    ```
    then `1`.

- [ ] **Step 4 (HUMAN-CONFIRM): document `INTEREST_FORM_URL` in `.env.example`.** Say exactly this:
  > `.env.example` gains one documented key, `INTEREST_FORM_URL` (empty by default, so behaviour is
  > unchanged — `server/config/links.js` falls back to `/affiliate`). Slice A sets it to
  > `https://atxwashdryfold.com/affiliate` on the boxes at cutover. No production `.env` is touched by this
  > task. Proceed?

  Continue only on an explicit yes.

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
python3 - <<'PY'
import re, pathlib
p = pathlib.Path('.env.example'); s = p.read_text()
assert 'INTEREST_FORM_URL' not in s, 'already present — STOP and re-read'
block = (
  "\n# Interest-form destination for the portal login page's \"Apply now\" link\n"
  "# (server/config/links.js). The affiliate program is INVITE-ONLY, so the link must\n"
  "# NOT reach the invite-gated /affiliate-register flow. Empty = the same-origin\n"
  "# fallback /affiliate. At the Plan 3 nginx cutover set this to the content origin:\n"
  "#   INTEREST_FORM_URL=https://atxwashdryfold.com/affiliate\n"
  "INTEREST_FORM_URL=\n"
)
p.write_text(s.rstrip('\n') + '\n' + block)
PY
grep -n -A1 '^INTEREST_FORM_URL=' .env.example; grep -c '^INTEREST_FORM_URL=$' .env.example
```
  - Expected: the `INTEREST_FORM_URL=` line printed, then `1`.

- [ ] **Step 5: Green, and prove nothing else moved.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npx jest tests/integration/interestFormLink.test.js tests/integration/partnerProgramOpenAccess.test.js 2>&1 | grep -E '^Tests:'
npx eslint server/ 2>&1 | tail -2
git diff --stat
```
  - Expected: `Tests:` line with `failed` absent (`6 passed` from the new file plus
    `partnerProgramOpenAccess`'s existing passes); the eslint summary shows **208** problems (unchanged
    baseline, GC 19); `git diff --stat` lists exactly `.env.example` and
    `public/affiliate-login-embed.html` with `2 files changed`.

- [ ] **Step 6: Commit.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git add .env.example public/affiliate-login-embed.html tests/integration/interestFormLink.test.js
git commit -m "fix(b-1): publish interest-form-url on the direct-access login page

The config-driven destination (server/config/links.js -> INTEREST_FORM_URL) only
reached the client through embed-app-v2.html's meta placeholder, so the directly
served /affiliate-login-embed.html fell back to the hardcoded same-origin
/affiliate -- which 404s once Plan 3 flips the marketing hosts to the content app
(PITFALLS #3: both access paths must work). Adds the placeholder, documents the
cutover key in .env.example, and moves the surviving interest-form assertions into
tests/integration/interestFormLink.test.js ahead of slice B's marketing deletion.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git log --oneline -1
```
  - Expected: one commit line printed.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git revert --no-edit HEAD
git grep -c 'interest-form-url' -- public/affiliate-login-embed.html || echo 0
grep -c '^INTEREST_FORM_URL=' .env.example || echo 0
```
- Rollback expected: the revert commit, then `0`, then `0`. Nothing is deployed by this task, so no reload.

---

### Task B2: [corporate] `/affiliate` validation error codes — the prerequisite that stops B3 regressing the F-3 guidance

> `server/validation/intakeErrorCodes.js` stamps every uncoded rule with
> `GENERIC_CODE = 'partner.form.errGeneric'`, whose four locale values name **`pickups@atxwashdryfold.com`**.
> On `/affiliate` the uncoded rules are the two `message` rules (the mandatory customer-acquisition plan,
> `min: 80` — the single most likely failure on that form, added 2026-09-11 as F-3) plus the `affiliation`
> and `transport` `isIn` rules. `affiliate-inquiry.js` currently dodges this by preferring `errors[0].msg`
> over the envelope message. The moment B3 introduces a code→i18n lookup, that preference is gone and the
> user sees partner-program copy with the wrong mailbox. Codes first, localisation second.

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/server/validation/intakeErrorCodes.js`
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/server/routes/affiliateApplicationRoutes.js`
- Test (create): `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/affiliateFormErrorCodes.test.js`

**Interfaces:**
- **Consumes:** `PARTNER_FORM_CODES` (the 9 shared field codes, already emitted by
  `affiliateApplicationRoutes.js:14-32` — field-level messages such as "First name is required" are
  form-agnostic and are **reused**, not duplicated); `formatValidationErrors`; the corporate intake tests
  (`tests/intakeEndpoints.test.js`, `tests/intakeForms.test.js`) whose payload/response contract must not move.
- **Produces:**
  - `AFFILIATE_FORM_CODES` — 4 new codes: `messageRequired`, `messageLength`, `affiliationInvalid`,
    `transportInvalid`, mapping to `affiliate.form.err*`.
  - `AFFILIATE_GENERIC_CODE = 'affiliate.form.errGeneric'`.
  - `formatValidationErrors(result, genericCode)` — the generic code becomes a parameter, defaulting to
    `partner.form.errGeneric` so the partner route is byte-identical.
  - **No locale keys yet.** The five `affiliate.form.err*` keys ship in **B3**, in the commit that adds
    every other `affiliate.*` key — GC 14's "four locales in the same commit" applies to the copy, and B2
    ships no copy. B2's test asserts the codes, not their resolution; B3's parity test asserts resolution.
- **Depends on:** nothing. Must land **before B3**.

- [ ] **Step 1: Write the failing test.** Create `tests/affiliateFormErrorCodes.test.js`:

```js
'use strict';
// B-2 prerequisite: every validation failure on /affiliate must carry an
// affiliate-scoped i18n code. Uncoded rules previously fell through to
// partner.form.errGeneric, whose copy names pickups@atxwashdryfold.com -- the wrong
// mailbox for the UT application form (admin@crhsent.com), and it would have replaced
// the F-3 "at least 80 characters" guidance with a generic message.
const request = require('supertest');
const app = require('../server');
const codes = require('../server/validation/intakeErrorCodes');

const post = (body, ip) => request(app).post('/api/affiliate-application')
  .set('Host', 'atxwashdryfold.com').set('X-Forwarded-For', ip).send(body);

const VALID = {
  firstName: 'A', lastName: 'B', email: 'a@b.co', phone: '5125550100',
  message: 'x'.repeat(120)
};

describe('affiliate form error codes', () => {
  test('the affiliate codes and generic code are exported', () => {
    expect(codes.AFFILIATE_GENERIC_CODE).toBe('affiliate.form.errGeneric');
    expect(codes.AFFILIATE_FORM_CODES).toEqual({
      messageRequired: 'affiliate.form.errMessageRequired',
      messageLength: 'affiliate.form.errMessageLength',
      affiliationInvalid: 'affiliate.form.errAffiliation',
      transportInvalid: 'affiliate.form.errTransport'
    });
  });

  test('formatValidationErrors keeps partner.form.errGeneric as its default', () => {
    const fake = { array: () => [{ path: 'x', msg: 'plain english' }] };
    expect(codes.formatValidationErrors(fake)[0].code).toBe('partner.form.errGeneric');
    expect(codes.formatValidationErrors(fake, 'affiliate.form.errGeneric')[0].code)
      .toBe('affiliate.form.errGeneric');
  });

  test('a missing message yields errMessageRequired, not a partner code', async () => {
    const r = await post({ ...VALID, message: '' }, '203.0.113.31');
    expect(r.status).toBe(400);
    expect(r.body.errors[0].code).toBe('affiliate.form.errMessageRequired');
  });

  test('a too-short message yields errMessageLength and keeps the English guidance', async () => {
    const r = await post({ ...VALID, message: 'too short' }, '203.0.113.32');
    expect(r.status).toBe(400);
    expect(r.body.errors[0].code).toBe('affiliate.form.errMessageLength');
    expect(r.body.errors[0].msg).toMatch(/80/);
  });

  test('bad affiliation / transport yield their own codes', async () => {
    const a = await post({ ...VALID, affiliation: 'nope' }, '203.0.113.33');
    expect(a.body.errors[0].code).toBe('affiliate.form.errAffiliation');
    const t = await post({ ...VALID, transport: 'nope' }, '203.0.113.34');
    expect(t.body.errors[0].code).toBe('affiliate.form.errTransport');
  });

  test('no /affiliate validation failure ever emits a partner.* code', async () => {
    const r = await post({ ...VALID, email: 'not-an-email', message: '' }, '203.0.113.35');
    expect(r.body.errors.every((e) => !String(e.code).startsWith('partner.form.errGeneric'))).toBe(true);
  });
});
```
  Test IPs are in the `203.0.113.0/24` TEST-NET block and distinct per assertion, because
  `contactBurstLimiter` allows `max: 1` per 30 s keyed by client IP (Plan 2 GATE convention). Every payload
  here FAILS validation, so **no mail is sent** (Plan 2 R-13).

- [ ] **Step 2: Run it.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/affiliateFormErrorCodes.test.js 2>&1 | tail -30
```
  - Expected: `Tests: 6 failed, 6 total`, the first failure being
    `expect(received).toBe(expected) … Received: undefined` on `codes.AFFILIATE_GENERIC_CODE` — the export
    does not exist yet. Not an `ENOENT`, not a 404: if the response status is 404 the route is not mounted
    on that Host and the premise is wrong — STOP.

- [ ] **Step 3: Add the codes.** In `server/validation/intakeErrorCodes.js`, after the `GENERIC_CODE`
      definition, add `AFFILIATE_FORM_CODES` (the four keys from the test) and
      `AFFILIATE_GENERIC_CODE = 'affiliate.form.errGeneric'`; change the signature to
      `function formatValidationErrors(result, genericCode = GENERIC_CODE)` and use `genericCode` in the
      uncoded branch. Export all four names. Keep the file's existing header comment and extend it with the
      reason (the wrong-mailbox regression).

- [ ] **Step 4: Code the four rules and pass the generic code.** In
      `server/routes/affiliateApplicationRoutes.js`: import `AFFILIATE_FORM_CODES as AC` and
      `AFFILIATE_GENERIC_CODE`; wrap the four `withMessage(...)` strings at `:36`, `:41`, `:45` and `:49` in
      `coded(AC.…, '<the existing English string, byte-identical>')`; and pass `AFFILIATE_GENERIC_CODE` at
      the controller's `formatValidationErrors` call for this route only. Then:

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
grep -c 'coded(' server/routes/affiliateApplicationRoutes.js
grep -c 'coded(' server/routes/partnerInquiryRoutes.js
git diff --stat server/routes/partnerInquiryRoutes.js | wc -l
```
  - Expected: `13` (the 9 existing + 4 new), then `10` (unchanged), then `0` — the partner route must not
    be touched by this task.

- [ ] **Step 5: Green, whole suite, lint.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
npm test 2>&1 | grep -E '^Tests:' | grep -vc failed
npm run lint 2>&1 | tail -2
npm run check:i18n
```
  - Expected: `1`; lint clean (no output before the npm epilogue); `i18n parity OK: 119 keys × 4 locales`
    (unchanged — B2 adds no keys).

- [ ] **Step 6: Commit.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
git add server/validation/intakeErrorCodes.js server/routes/affiliateApplicationRoutes.js tests/affiliateFormErrorCodes.test.js
git commit -m "fix(intake): affiliate-scoped validation codes for /affiliate

Uncoded rules stamped partner.form.errGeneric, whose copy names
pickups@atxwashdryfold.com. On /affiliate the uncoded rules include the mandatory
customer-acquisition message (F-3, min 80 chars) -- the form's most likely failure --
so localising the client error path would have shown partner-program copy with the
wrong mailbox and dropped the length guidance. Adds AFFILIATE_FORM_CODES, makes the
generic code a parameter (partner default unchanged), and codes the four rules.
Locale keys ship with the rest of affiliate.* in the B-2 i18n commit.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: one commit.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
git revert --no-edit HEAD
npx jest tests/intakeEndpoints.test.js tests/intakeForms.test.js 2>&1 | grep -E '^Tests:'
```
- Rollback expected: the revert commit, then a `Tests:` line without `failed`. Nothing deployed; no reload.

---

### Task B3: [corporate] **B-2** — the i18n layer on the interest form, `affiliate.*` in all four locales

> Backlog **B-2**. `content/atxwashdryfold/affiliate/index.html` (336 lines) has **zero** `data-i18n`
> attributes and loads no `i18n.js`; **adding the layer is the work**, not translating strings. The page is
> dark on `:3001` until slice A's `atxwashdryfold.com` flip, so this lands with zero public risk and the flip
> then serves a translated page as its first public byte. Its post-flip Lighthouse C14 run (slice A item 3,
> GC 15 — `/affiliate` is explicitly in the measured set) is the gate on the result.
>
> **Diff size:** this task exceeds 500 lines (one 336-line page rewritten in place plus four locale files).
> Allowed as a single concern, the same exception A3 took for the verbatim tree copy.

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/content/atxwashdryfold/affiliate/index.html`
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/content/atxwashdryfold/assets/js/affiliate-inquiry.js`
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/content/atxwashdryfold/assets/css/affiliate.css` (the `.ap-langswitch` rules)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/content/atxwashdryfold/locales/{en,es,pt,de}/common.json`
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/scripts/check-i18n-parity.js` (`REQUIRED_PREFIXES`)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/i18nParity.test.js`
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/content-manifest.test.js` (only if the manifest pins `assets/js` or `assets/css` file counts — check first; no new file is added, so it probably does not move)
- Test (create): `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/affiliatePageI18n.test.js`

**Interfaces:**
- **Consumes:**
  - **Slice A** — this task must land **before the `atxwashdryfold.com` flip** so the flip is the single
    public change on that host and the post-flip C14 `/affiliate` measurement covers the final page. It is
    the reason B-2 was deferred: the page moved apps, and doing it in the affiliate repo would have been
    deleted by Task B9.
  - **Task B2** (validator codes). Landing B3 first makes the F-3 guidance regress.
  - web-core `assets/js/i18n.js` v0.2.1: `translationsPath` fixed to `/locales`; auto-init on
    `DOMContentLoaded`; `detectLanguage()` = localStorage → `?lang=` → `navigator.language` → `en`;
    handlers for `data-i18n` (textContent), `data-i18n-attr="name:key"`, `data-i18n-placeholder`,
    `data-i18n-title`, `data-i18n-aria-label`.
  - `server/webCoreAssets.js` — serves exactly `i18n.js` and `language-switcher.js` on marketing hosts.
  - `server/contentHandler.js:62` — `/locales/*` served from the content root, `max-age 1h`, `ACAO: *`.
  - `server/middleware/hostAwareCsp.js` — marketing profile, `script-src 'self' 'nonce-…'`. A same-origin
    `<script src>` passes on `'self'`; **no nonce is needed and none is added.** `style-src` always carries
    `'unsafe-inline'` (`crhs-web-core/src/security/cspDirectives.js:227`), so the page's pre-existing
    `style=` attributes keep working; **this task adds no new inline style or script.**
  - The 9 shared `partner.form.err*` field codes — reused, not duplicated.
- **Produces:**
  - A second top-level locale namespace, `affiliate`, so `Object.keys(json)` becomes
    `['affiliate','partner']` in all four files. `partner` stays at exactly **119** leaves.
  - `content/atxwashdryfold/locales/*/common.json` with `affiliate.*` translated in en/es/pt/de.
  - A `.ap-langswitch` control on the page, the same markup contract the home page uses
    (`content/atxwashdryfold/index.html:319-323`: `nav.ap-langswitch` + four
    `button.ap-lang[data-lang][aria-pressed]`), driven by the `initLangSwitch()` that already exists in
    `partner-inquiry.js` — **copied**, not shared, because the two pages load different scripts.
  - `tests/affiliatePageI18n.test.js` — the structural guard (see Step 1).

**Localisation rules — decided, and each one is asserted by the Step-1 test.**

1. **`data-i18n` elements contain text only.** `i18n.js` sets `textContent`, which destroys child markup. Any
   element whose copy contains `<strong>` / `<span class="hi">` is either keyed as a whole (emphasis
   dropped) or split **at a sentence boundary**, never mid-sentence — a mid-sentence split forces the
   translator into English word order and breaks German and Portuguese. Where emphasis must survive, the
   emphasised run is a whole sentence and keeps its own `<strong data-i18n="…">`.
2. **`<title>` is keyed** (`data-i18n="affiliate.meta.title"` — `textContent` works on `<title>`).
   **`<meta>`, OG, Twitter and JSON-LD stay English-canonical.** Reasons: crawlers read the served bytes,
   not the post-`i18n` DOM; `/affiliate` publishes no `hreflang` alternates; and a bare `data-i18n` on a
   `<meta>` is a **silent no-op** (finding 1 above) — copying the home page's pattern would ship five more
   dead attributes. Recorded as a conscious close, not an oversight.
3. **The workflow SVG keeps its English `<text>` nodes.** It has **33** of them, hand-positioned inside
   fixed-width plates with manual line breaks; German runs ~30 % longer and would overflow every plate. Its
   meaning is carried by `role="img"` + `aria-label`, which **is** keyed via `data-i18n-aria-label`. A
   localised diagram is a redraw, not a translation — escalated in B14, not attempted here.
4. **Attributes:** `aria-label` → `data-i18n-aria-label` (4 on the page); `placeholder` →
   `data-i18n-placeholder` (3). The `<option>` labels are text-only children and are keyed normally; the two
   identical `Select…` options share one key.
5. **Not translated:** the `atxwashdryfold` wordmark (×2), `admin@crhsent.com`, the street address, the
   numerals in the stat tiles (`100%`, `$0`, `1099`) — their captions are keyed, the figures are not.
6. **Client strings** in `affiliate-inquiry.js`: `affiliate.form.sending`, `successMsg`, `errRequired`,
   `errEligible`, `errNetwork`, `errGeneric`, plus B2's four `affiliate.form.err*` codes. `errorText()`
   resolves `errors[0].code` through `t()` exactly as `partner-inquiry.js` does, falling back to
   `affiliate.form.errGeneric` (which names **admin@crhsent.com**, never `pickups@`).

**Key namespace:** `affiliate.meta.*`, `affiliate.a11y.*`, `affiliate.nav.*`, `affiliate.hero.*`,
`affiliate.stats.*`, `affiliate.how.*`, `affiliate.why.*`, `affiliate.money.*`, `affiliate.apply.*`,
`affiliate.form.*`, `affiliate.footer.*`.

**Leaf count.** Measured inputs: **101** raw text nodes outside the SVG, **3** placeholders, **4**
`aria-label`s, 1 `<title>`, 6 script strings. After removing the 3 untranslated literals, de-duplicating
`Select…`, and merging the 6 mixed-content elements at sentence boundaries, the target is **≈99** leaves —
but the Step-1 test does **not** pin a magic number. It asserts the stronger, non-brittle invariant:
**the `affiliate.*` leaf set is exactly the set of keys the page and the script use** — no orphan key, no
missing key — and `partner` stays at 119. Pinning a guessed constant would either fail on a defensible
judgment call or, worse, be "fixed" by adding a filler key. Step 6 prints the final count for the record.

- [ ] **Step 1: Write the failing test.** Create `tests/affiliatePageI18n.test.js`:

```js
'use strict';
// Backlog B-2: the interest form had no i18n layer at all. This guards the LAYER,
// not a key count: every key the page or its script uses must resolve non-empty in
// all four locales, and no affiliate.* key may exist that nothing uses.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'content', 'atxwashdryfold');
const LANGS = ['en', 'es', 'pt', 'de'];
const PAGE = path.join(ROOT, 'affiliate', 'index.html');
const SCRIPT = path.join(ROOT, 'assets', 'js', 'affiliate-inquiry.js');

const html = () => fs.readFileSync(PAGE, 'utf8');
const script = () => fs.readFileSync(SCRIPT, 'utf8');
const load = (l) => JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', l, 'common.json'), 'utf8'));
const leaves = (o, p = '') => Object.entries(o).flatMap(([k, v]) =>
  (v && typeof v === 'object' ? leaves(v, `${p}${k}.`) : [`${p}${k}`]));
const get = (o, k) => k.split('.').reduce((a, s) => (a && typeof a === 'object' ? a[s] : undefined), o);

// keys used by the markup
const pageKeys = () => [...new Set(
  [...html().matchAll(/data-i18n(?:-placeholder|-title|-aria-label)?="([^"]+)"/g)].map((m) => m[1])
)];
// keys used by the script: t('key', …) plus the B2 validator codes it resolves
const scriptKeys = () => [...new Set(
  [...script().matchAll(/t\(\s*'((?:affiliate|partner)\.[^']+)'/g)].map((m) => m[1])
)];

describe('interest-form i18n layer (B-2)', () => {
  test('the page loads the shared i18n loader and nothing inline', () => {
    const h = html();
    expect(h).toMatch(/<script src="\/assets\/js\/i18n\.js\?v=[0-9a-z]+"><\/script>/);
    expect(h).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);   // no inline <script>
    expect(h).not.toMatch(/<style[\s>]/);                     // no inline <style> block
  });

  test('the language switcher matches the home page contract', () => {
    const h = html();
    expect(h).toMatch(/<nav class="ap-langswitch"/);
    for (const l of LANGS) expect(h).toContain(`class="ap-lang" data-lang="${l}"`);
    expect((h.match(/aria-pressed="/g) || []).length).toBe(4);
  });

  test('every data-i18n element is text-only (i18n.js sets textContent)', () => {
    const offenders = [...html().matchAll(/<([a-z0-9]+)([^>]*\bdata-i18n="[^"]+"[^>]*)>([\s\S]*?)<\/\1>/g)]
      .filter((m) => /<[a-z]/i.test(m[3]))
      .map((m) => `${m[1]}: ${m[3].slice(0, 60)}`);
    expect(offenders).toEqual([]);
  });

  test('SEO metadata stays English-canonical — no dead data-i18n on a void element', () => {
    expect(html()).not.toMatch(/<meta[^>]*\bdata-i18n=/);
    expect(html()).not.toMatch(/<link[^>]*\bdata-i18n=/);
  });

  test('the workflow diagram is described, not translated', () => {
    expect(html()).toMatch(/role="img"[^>]*data-i18n-aria-label="affiliate\.a11y\.workflow"/);
    expect(html()).not.toMatch(/<text[^>]*data-i18n/);
  });

  test('the four locale key sets are identical', () => {
    const en = leaves(load('en')).sort();
    for (const l of ['es', 'pt', 'de']) expect(leaves(load(l)).sort()).toEqual(en);
  });

  test('top level is exactly ["affiliate","partner"] and partner is untouched at 119', () => {
    for (const l of LANGS) {
      const j = load(l);
      expect(Object.keys(j).sort()).toEqual(['affiliate', 'partner']);
      expect(leaves({ partner: j.partner })).toHaveLength(119);
    }
  });

  test('affiliate.* is exactly what the page and the script use — no orphans, none missing', () => {
    const used = [...new Set([...pageKeys(), ...scriptKeys()])]
      .filter((k) => k.startsWith('affiliate.')).sort();
    for (const l of LANGS) {
      expect(leaves({ affiliate: load(l).affiliate }).sort()).toEqual(used);
    }
  });

  test('every used key resolves to a non-empty string in all four locales', () => {
    const used = [...new Set([...pageKeys(), ...scriptKeys()])];
    for (const l of LANGS) {
      const j = load(l);
      for (const k of used) {
        expect({ l, k, ok: typeof get(j, k) === 'string' && get(j, k).length > 0 })
          .toEqual({ l, k, ok: true });
      }
    }
  });

  test('the script resolves the B2 codes and never shows the partner mailbox', () => {
    expect(scriptKeys()).toEqual(expect.arrayContaining([
      'affiliate.form.errGeneric', 'affiliate.form.errNetwork', 'affiliate.form.errRequired',
      'affiliate.form.errEligible', 'affiliate.form.sending', 'affiliate.form.successMsg'
    ]));
    expect(script()).toMatch(/first\.code/);
    for (const l of LANGS) {
      const f = load(l).affiliate.form;
      for (const k of ['errGeneric', 'errNetwork']) {
        expect(f[k]).toContain('admin@crhsent.com');
        expect(f[k]).not.toContain('pickups@');
      }
    }
  });

  test('no locale value names the franchisor mark; only "WaveMAX Austin" is permitted', () => {
    for (const l of LANGS) {
      const s = JSON.stringify(load(l)).replace(/WaveMAX Austin/g, '');
      expect(/wavemax/i.test(s)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails for the right reason.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/affiliatePageI18n.test.js 2>&1 | tail -40
```
  - Expected: `Tests: 8 failed, 3 passed, 11 total`. The first failure must be
    `the page loads the shared i18n loader and nothing inline` —
    `expect(received).toMatch(/<script src="\/assets\/js\/i18n\.js\?v=…/)` with the received HTML showing
    only `affiliate-inquiry.js`. The three that pass before any implementation are
    `SEO metadata stays English-canonical` (the page has no `data-i18n` at all yet),
    `the four locale key sets are identical` and `no locale value names the franchisor mark` — all three are
    vacuously true now and become load-bearing after Step 3. **If `top level is exactly …` passes, STOP:**
    `affiliate` already exists and this task's premise is stale.

- [ ] **Step 3: Add the i18n layer to the page.** Edit
      `content/atxwashdryfold/affiliate/index.html` applying rules 1–5 above:
  - `<title data-i18n="affiliate.meta.title">`; leave every `<meta>`, `<link>` and `ld+json` block alone.
  - `data-i18n` on the skip link, nav links, nav CTA, hero eyebrow / h1 / leads / CTA labels / trust items,
    hero card tag + figure caption + its four list items, the four stat captions, each section's eyebrow /
    h2 / lead, the four why-cards' h3 + p, the money block's eyebrow / figure caption / h2 / three col
    h3+p, the apply section head, the info card's three label/value pairs and three chips, every `<label>`,
    every `<option>`, the submit button label, the form note, and the footer legal line.
  - `data-i18n-aria-label` on `nav[aria-label="Primary"]`, `aside[aria-label="Your cut at a glance"]`,
    `section[aria-label="At a glance"]` and the workflow `<svg role="img">` (`affiliate.a11y.workflow`).
  - `data-i18n-placeholder` on `#af-serviceArea`, `#af-availability`, `#af-message`.
  - Mixed content: split `h1` / `.lead` / `.lead--caveat` / `.fieldhelp` / the eligibility `<label>` /
    `.footer-text` at sentence boundaries per rule 1; the emphasised runs that are whole sentences keep
    `<strong data-i18n="…">`, the mid-sentence ones lose the `<strong>`.
  - Insert the switcher immediately before `</header>`, copying `index.html:319-323` verbatim except for the
    surrounding wrapper class.
  - Append `<script src="/assets/js/i18n.js?v=20260920a"></script>` **before** the existing
    `affiliate-inquiry.js` tag and bump that tag's `?v=` to `20260920a`.

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
grep -c 'data-i18n' content/atxwashdryfold/affiliate/index.html
grep -c 'data-i18n-placeholder' content/atxwashdryfold/affiliate/index.html
grep -c 'data-i18n-aria-label' content/atxwashdryfold/affiliate/index.html
grep -c '<text[^>]*data-i18n' content/atxwashdryfold/affiliate/index.html || echo 0
grep -c '<meta[^>]*data-i18n' content/atxwashdryfold/affiliate/index.html || echo 0
```
  - Expected: a count `≥ 90` on the first line, then `3`, then `4`, then `0`, then `0`.

- [ ] **Step 4: i18n the client script + the switcher CSS.** In
      `content/atxwashdryfold/assets/js/affiliate-inquiry.js`: add the `t(key, fallback)` helper and
      `initLangSwitch()` copied from `partner-inquiry.js`; replace the five hardcoded status strings with
      `t('affiliate.form.…', '<the existing English string>')`; rewrite `errorText()` to resolve
      `errors[0].code` through `t()` first and fall back to `t('affiliate.form.errGeneric', FALLBACK_ERR)`;
      set `FALLBACK_ERR` to the admin@crhsent.com wording; keep `init()` calling both. In
      `content/atxwashdryfold/assets/css/affiliate.css`, append the `.ap-langswitch` / `.ap-lang` rules
      adapted from `partner-program.css:259-263` using this page's tokens, and bump the stylesheet's `?v=`
      in the page to `20260920a`.

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
grep -c "t('affiliate.form." content/atxwashdryfold/assets/js/affiliate-inquiry.js
grep -c 'pickups@' content/atxwashdryfold/assets/js/affiliate-inquiry.js || echo 0
grep -c '\.ap-lang' content/atxwashdryfold/assets/css/affiliate.css
grep -c 'affiliate\.css?v=20260920a' content/atxwashdryfold/affiliate/index.html
```
  - Expected: `6`, then `0`, then a count `≥ 3`, then `1`.

- [ ] **Step 5: Write the four locale files in ONE edit (GC 14).** Add the `affiliate` namespace to all four
      `content/atxwashdryfold/locales/<lang>/common.json`, keys sorted, `partner` untouched. Translate —
      do not machine-paste English into es/pt/de; the test only proves non-empty, so the reviewer reads the
      copy. Use the terminology the existing `partner.*` subtree already uses for the recurring terms
      ("fulfillment partner", "pickup & delivery", "1099 independent contractor").

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
node -e 'const fs=require("fs");const L=(o,p="")=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==="object"?L(v,p+k+"."):[p+k]);
for (const l of ["en","es","pt","de"]) { const j=JSON.parse(fs.readFileSync(`content/atxwashdryfold/locales/${l}/common.json`,"utf8"));
  console.log(l, Object.keys(j).sort().join(","), "| affiliate:", L({affiliate:j.affiliate}).length, "| partner:", L({partner:j.partner}).length); }'
grep -c 'pickups@' content/atxwashdryfold/locales/*/common.json
```
  - Expected: four lines each reading `<lang> affiliate,partner | affiliate: <N> | partner: 119` with the
    **same** `<N>` on all four lines; then four `…:2` lines (the pre-existing `partner.form.errGeneric` and
    `errNetwork` only — if any line reads `:3` or more, an `affiliate.*` value leaked the partner mailbox).

- [ ] **Step 6: Register the namespace with the parity tooling and run everything.** In
      `scripts/check-i18n-parity.js`, change `REQUIRED_PREFIXES` to `['partner', 'affiliate']`. In
      `tests/i18nParity.test.js`, change test (2)'s `expect(Object.keys(j)).toEqual(['partner'])` to
      `expect(Object.keys(j).sort()).toEqual(['affiliate','partner'])` and scope its leaf-count assertion to
      `leaves({ partner: j.partner })` so the pinned **119** still means the partner subtree; leave test (4)'s
      `104` (it reads `index.html`, untouched here).

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
npx jest tests/affiliatePageI18n.test.js tests/i18nParity.test.js tests/affiliateFormErrorCodes.test.js 2>&1 | grep -E '^Tests:'
npm run check:i18n
npm test 2>&1 | grep -E '^Tests:' | grep -vc failed
npm run lint 2>&1 | tail -2
node -e 'const fs=require("fs");const L=(o,p="")=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==="object"?L(v,p+k+"."):[p+k]);
const j=JSON.parse(fs.readFileSync("content/atxwashdryfold/locales/en/common.json","utf8"));
console.log("RECORD affiliate.* leaves =", L({affiliate:j.affiliate}).length);'
```
  - Expected: a `Tests:` line with `failed` absent; `i18n parity OK: <119 + N> keys × 4 locales`; `1`;
    lint clean; and a final `RECORD affiliate.* leaves = <N>` line. **Copy that number into the commit
    message** — it is the recorded figure the reviewer and B14 check against.

- [ ] **Step 7: Commit (one commit — page, script, CSS, four locales, tooling, test).**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
git add content/atxwashdryfold/affiliate/index.html \
        content/atxwashdryfold/assets/js/affiliate-inquiry.js \
        content/atxwashdryfold/assets/css/affiliate.css \
        content/atxwashdryfold/locales scripts/check-i18n-parity.js \
        tests/i18nParity.test.js tests/affiliatePageI18n.test.js
git commit -m "i18n(affiliate): the interest form gets an i18n layer (backlog B-2)

The page had ZERO data-i18n and loaded no i18n.js -- adding the LAYER was the work,
not the strings. Adds the affiliate.* namespace (<N> leaves) in en/es/pt/de in this
commit, the shared /assets/js/i18n.js loader, the home page's ap-langswitch control,
and localised client status/error copy that resolves the B2 validator codes and names
admin@crhsent.com (never the partner mailbox).

Deliberately NOT localised, with reasons: the SEO/OG/JSON-LD block stays
English-canonical (crawlers read served bytes, /affiliate publishes no hreflang, and a
bare data-i18n on a void <meta> is a silent no-op in web-core's i18n.js); the workflow
SVG's 33 hand-positioned <text> nodes stay English (fixed-width plates overflow in de
and pt) and carry meaning through a translated aria-label instead.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: one commit; `git show --stat HEAD` lists 7 paths.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
git revert --no-edit HEAD
npm run check:i18n
npx jest tests/i18nParity.test.js 2>&1 | grep -E '^Tests:'
```
- Rollback expected: the revert commit, then `i18n parity OK: 119 keys × 4 locales`, then a `Tests:` line
  without `failed`. Nothing is deployed by this task; the page is still dark on `:3001`.

---

### Task B4: *(OPTIONAL — controller: assign or drop)* [corporate] the five dead `data-i18n` attributes on `<meta>` elements

> `content/atxwashdryfold/index.html` carries `data-i18n` on `<meta name="description">`,
> `<meta property="og:title">`, `<meta property="og:description">`, `<meta name="twitter:title">` and
> `<meta name="twitter:description">`. web-core's `i18n.js:210-236` sets `textContent` for a bare
> `data-i18n`, so on a void element the call does nothing and the `content` attribute stays English. They
> are **dead attributes** — exit criterion 5 says "no dead config". Two disposals are correct:
> **(a)** delete the five attributes (metadata is English-canonical, matching B3's decision), or
> **(b)** convert them to `data-i18n-attr="content:<key>"`, which `i18n.js` does support.
>
> **Recommendation: (a).** Client-side metadata localisation is invisible to crawlers, the page publishes no
> `hreflang` alternates, and it makes the two marketing pages consistent. **Cost of either:** both change the
> key set `tests/i18nParity.test.js` test (4) extracts from `index.html`, whose pinned `104` moves —
> (a) drops the two distinct keys `partner.meta.description` and `partner.meta.ogTitle` from the extracted
> set → **102**, while the locale leaves stay 119 (`partner.meta.*` keys remain, used by `<title>` and
> nothing else — which test (4) then no longer requires). Because this touches A15's page and a pinned
> number, it is flagged rather than assumed.

**Files:** `content/atxwashdryfold/index.html`; `tests/i18nParity.test.js`.

**Interfaces:**
- **Consumes:** finding 1; Task B3's rule 2 (the same decision, applied to the other page).
- **Produces:** zero `data-i18n` on a void element in the marketing tree, and a re-pinned extraction count.

- [ ] **Step 1: Write the failing assertion.** Add to `tests/i18nParity.test.js`:
      `test('(6) no data-i18n on a void element — i18n.js would silently no-op', () => { const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'); expect(html).not.toMatch(/<(meta|link|img|input|br|hr)[^>]*\bdata-i18n=/); });`

- [ ] **Step 2: Run it.** `cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/i18nParity.test.js 2>&1 | tail -20`
  - Expected: `Tests: 1 failed, 7 passed, 8 total`, the failure naming test `(6)` and the received string
    showing `<meta name="description" data-i18n="partner.meta.description"`.

- [ ] **Step 3: Remove the five attributes.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
perl -0pi -e 's/(<meta\b[^>]*?)\s+data-i18n="[^"]+"/$1/g' content/atxwashdryfold/index.html
grep -c '<meta[^>]*data-i18n' content/atxwashdryfold/index.html || echo 0
grep -c 'data-i18n' content/atxwashdryfold/index.html
wc -l < content/atxwashdryfold/index.html
```
  - Expected: `0`, then a `data-i18n` count **5 lower** than before the edit, then the **same** line count as
    before (attribute-only removal; A15's later line/anchor edits must not shift).

- [ ] **Step 4: Re-pin the extraction count and run.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
node -e 'const fs=require("fs");const h=fs.readFileSync("content/atxwashdryfold/index.html","utf8");
console.log("distinct data-i18n* keys in index.html =", new Set([...h.matchAll(/data-i18n(?:-placeholder|-aria-label)?="([^"]+)"/g)].map(m=>m[1])).size);'
```
  - Expected: `distinct data-i18n* keys in index.html = 102`. Put that number into test (4) in place of
    `104`. If it is not 102, use the printed value and say so in the commit message.

```bash
npm test 2>&1 | grep -E '^Tests:' | grep -vc failed; npm run check:i18n; npm run lint 2>&1 | tail -2
```
  - Expected: `1`; `i18n parity OK: <119 + N> keys × 4 locales`; lint clean.

- [ ] **Step 5: Commit.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
git add content/atxwashdryfold/index.html tests/i18nParity.test.js
git commit -m "fix(i18n): drop five dead data-i18n attributes from <meta> elements

web-core's i18n.js sets textContent for a bare data-i18n, so on a void element the
call does nothing and the content attribute stayed English -- five dead attributes on
the marketing home page. Metadata is English-canonical by decision (crawlers read the
served bytes; the page publishes no hreflang), matching the same call on /affiliate.
Adds a guard test and re-pins the extracted key count 104 -> 102.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: one commit.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
git revert --no-edit HEAD
grep -c '<meta[^>]*data-i18n' content/atxwashdryfold/index.html
```
- Rollback expected: the revert commit, then `5`.

---

# Phase B-ii — iframe bridge retirement (scope-brief item 10)

> **Owner decision 4:** *"we will never embed in the franchisor site."* This kills the carve-out entirely, so
> it is a **straight deletion, not a migration**. Plan 2 GC 11 already removed the franchisor origins from
> `iframe-bridge-v2.js` in both repos (`d2725e7` / `a37dc497`); the remaining origins in the bridge files are
> our own hosts. Backlog **B-4** lists the bridge assets' brand literals as "Plan 3 bridge retirement deletes
> them — don't edit first", which this phase discharges.
>
> **Coupling (read before executing).** The order is **B5 → B6 → B7**, and B6 must be in corporate's tree
> before corporate installs the web-core release that contains B7. `crhs-corporate/tests/contentHandler.test.js:204-205`
> does `fs.readFileSync(path.join(wc.assetsDir,'js',name))` over
> `['iframe-bridge-v2.js','parent-iframe-bridge-v3.js','css-async.js']`; once B7 deletes two of those files,
> that test throws `ENOENT` in any tree that has installed the new core. This is the same class of trap as
> the recorded Deploy-B bidirectional boot-breaker — a library deletion that reds a consumer's suite.

### Task B5: [affiliate] delete the affiliate's four bridge files, the build rows and the `/embed` command

**Files:**
- Delete: `public/assets/js/iframe-bridge-v2.js`, `public/assets/js/iframe-bridge-v2.min.js`,
  `public/assets/js/parent-iframe-bridge-v3.js`, `public/assets/js/parent-iframe-bridge-v3.min.js`
  (476 + 512 source lines + two generated minified files).
- Delete: `.claude/commands/embed.md` (the `/embed` slash command; its whole procedure is "wire the bridge in").
- Modify: `scripts/build-assets.js` (drop rows `:26` and `:27`).
- Modify: `README.md:124`, `README.md:150`, `docs/README.md:29`.
- Test (create): `tests/unit/bridgeRetired.test.js`.

**Interfaces:**
- **Consumes:** owner decision 4; the measured proof that no page loads a bridge (Step 1). **Flip-independent** —
  no marketing page and no SPA page references a bridge, so this can land before or after slice A.
- **Produces:** no bridge asset is served by the affiliate app; `/assets/js/parent-iframe-bridge-v3.js` 404s,
  which is the precondition that makes B7's header carve-out unreachable and therefore safe to delete.

- [ ] **Step 1: Prove nothing references the bridges (the deletion premise).**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
echo "--- runtime references (public HTML, SPA router, server, tests, scripts) ---"
git grep -lI -E 'iframe-bridge-v2|parent-iframe-bridge-v3|WaveMaxBridgeV3' -- public server server.js tests scripts \
  | grep -v '^public/assets/js/iframe-bridge-v2' \
  | grep -v '^public/assets/js/parent-iframe-bridge-v3'
echo "--- exit $? ---"
echo "--- any page that loads a bridge ---"
git grep -c -I 'bridge' -- 'public/*.html' || echo NONE
echo "--- pageScripts entries naming a bridge ---"
git grep -c -I 'bridge' -- public/assets/js/embed-app-v2.js || echo NONE
```
  - Expected, exactly:
    - the first list is the single line `scripts/build-assets.js` (the minifier's own input rows);
    - `--- exit 0 ---`;
    - `NONE` for `public/*.html`;
    - `NONE` for the SPA router.
  - **Any other output is a STOP.** A page or the router still loading a bridge means deleting it breaks a
    live page, and the task must be re-planned, not forced.

- [ ] **Step 2: Write the failing guard test.** Create `tests/unit/bridgeRetired.test.js`:

```js
'use strict';
// Owner decision (Plan 1, restated in the Plan 3 scope brief): "we will never embed in
// the franchisor site." The iframe bridges and their CORS carve-out are retired, not
// migrated. This guard keeps them from coming back.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const REPO = path.resolve(__dirname, '../..');

describe('iframe bridges are retired', () => {
  test.each([
    'public/assets/js/iframe-bridge-v2.js', 'public/assets/js/iframe-bridge-v2.min.js',
    'public/assets/js/parent-iframe-bridge-v3.js', 'public/assets/js/parent-iframe-bridge-v3.min.js'
  ])('%s does not exist', (p) => {
    expect(fs.existsSync(path.join(REPO, p))).toBe(false);
  });

  test('no tracked runtime file names a bridge', () => {
    const out = execSync(
      'git grep -lI -E "iframe-bridge-v2|parent-iframe-bridge-v3|WaveMaxBridgeV3" -- public server server.js tests scripts || true',
      { cwd: REPO, encoding: 'utf8' }
    ).trim();
    expect(out.split('\n').filter(Boolean).filter((f) => f !== 'tests/unit/bridgeRetired.test.js'))
      .toEqual([]);
  });

  test('the asset build no longer has a bridge row', () => {
    expect(fs.readFileSync(path.join(REPO, 'scripts/build-assets.js'), 'utf8'))
      .not.toMatch(/bridge/i);
  });
});
```

- [ ] **Step 3: Run it.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npx jest tests/unit/bridgeRetired.test.js 2>&1 | tail -25
```
  - Expected: `Tests: 6 failed, 6 total`, the first four failures being
    `expect(received).toBe(expected) … Received: true` for each of the four `does not exist` cases.

- [ ] **Step 4: Delete and de-reference.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git rm -q public/assets/js/iframe-bridge-v2.js public/assets/js/iframe-bridge-v2.min.js \
          public/assets/js/parent-iframe-bridge-v3.js public/assets/js/parent-iframe-bridge-v3.min.js \
          .claude/commands/embed.md
sed -i "/iframe-bridge-v2\.js/d;/parent-iframe-bridge-v3\.js/d" scripts/build-assets.js
node -e "require('./scripts/build-assets.js')" >/dev/null 2>&1; echo "build-assets loads: $?"
grep -c -i bridge scripts/build-assets.js || echo 0
```
  - Expected: `build-assets loads: 0`, then `0`.
  - Then hand-edit the three documentation lines (`README.md:124`, `README.md:150`, `docs/README.md:29`) to
    describe the retirement rather than the mechanism — one sentence each, naming the owner decision. Leave
    `docs/archive/`, `docs/refactor/`, `docs/platform-baseline/` and `docs/austin-reference-build-plan.md`
    untouched: they are historical records of a system that existed.

- [ ] **Step 5: Verify — build, guard, seams, lint.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npm run build:assets 2>&1 | tail -3
git status --porcelain public/assets/js | grep -v '^D ' || echo "NO_UNEXPECTED_ASSET_CHANGES"
npx jest tests/unit/bridgeRetired.test.js tests/integration/assetCaching.test.js tests/integration/embedRoutes.test.js 2>&1 | grep -E '^Tests:'
npx eslint server/ 2>&1 | tail -2
```
  - Expected: the build finishes without naming a bridge; `NO_UNEXPECTED_ASSET_CHANGES`; a `Tests:` line
    with `failed` absent; eslint still **208** problems.
  - If `assetCaching.test.js` names a bridge filename, fix that assertion in this commit and say so.

- [ ] **Step 6: Commit.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git add -A public/assets/js scripts/build-assets.js README.md docs/README.md \
        tests/unit/bridgeRetired.test.js .claude/commands/embed.md
git commit -m "chore: retire the iframe bridges from the portal (Plan 3 item 10)

Owner decision: we will never embed in the franchisor site, so the bridges are
deleted, not migrated. Nothing loaded them -- no page, no pageScripts entry, no
server route -- proven by grep before deletion. Removes the four asset files, their
two build rows, the /embed slash command whose whole procedure was wiring the bridge
in, and three README lines. Adds tests/unit/bridgeRetired.test.js so they cannot
return. The matching web-core assets and the securityHeaders CORS carve-out follow.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: one commit.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git revert --no-edit HEAD
ls public/assets/js/ | grep -c bridge
```
- Rollback expected: the revert commit, then `4`. **If this task has already been deployed, roll back only
  as a pair with B7** — a box with the new web-core (no carve-out) and the old affiliate (bridge served) is
  the one combination that serves the bridge without its cross-origin headers. Harmless by the owner
  decision (nothing cross-origin loads it), but it is the state to avoid describing as "rolled back".

---

### Task B6: [corporate] retire the bridge assertions — must land before corporate installs B7's web-core

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/tests/contentHandler.test.js` (`:148` area, `:155`, `:204-205`)
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-corporate/server/webCoreAssets.js` (the comment at `:1-3`)

**Interfaces:**
- **Consumes:** Task B7's file list (the two assets web-core is about to lose).
- **Produces:** a corporate tree whose suite is green against **both** the current web-core `v0.2.1` and the
  release that drops the bridges. The `test.each` list narrows from three names to the one that survives
  (`css-async.js`), and the `:155` case — `/assets/js/iframe-bridge-v2.js` returns 404 on a marketing host —
  is rewritten to assert the same protection generically: any `/assets/js/<name>` that is not in
  `webCoreAssets.SERVED` returns 404. That is the assertion that was actually load-bearing; keying it to a
  filename that is being deleted would have made a real guard evaporate with the file.

- [ ] **Step 1: Prove what corporate references, and that the narrowed guard is stronger.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
git grep -nI -E 'iframe-bridge-v2|parent-iframe-bridge-v3' -- .
echo "--- served allowlist ---"; grep -n "SERVED" server/webCoreAssets.js
echo "--- files web-core ships in assets/js today ---"; ls node_modules/@crhs/web-core/assets/js/
```
  - Expected: exactly two reference lines, `tests/contentHandler.test.js:155` and
    `tests/contentHandler.test.js:204`; then the `SERVED` set line
    `const SERVED = new Set(['i18n.js', 'language-switcher.js']);`; then five filenames
    (`css-async.js  i18n.js  iframe-bridge-v2.js  language-switcher.js  parent-iframe-bridge-v3.js`).

- [ ] **Step 2: Write the failing generic guard.** In `tests/contentHandler.test.js`, replace the `:204`
      `test.each(['iframe-bridge-v2.js','parent-iframe-bridge-v3.js','css-async.js'])` block with a test that
      reads `require('../server/webCoreAssets')`'s served allowlist, lists
      `fs.readdirSync(path.join(wc.assetsDir,'js'))`, and asserts that **every** file NOT in the allowlist
      returns 404 on a marketing host — deriving the list from disk instead of naming files. Replace the
      `:155` single-file case with a call into the same helper. Do **not** yet delete anything.

- [ ] **Step 3: Run it against the CURRENT core.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npx jest tests/contentHandler.test.js 2>&1 | tail -25
```
  - Expected: `Tests:` with `failed` **absent** — the generic form must pass against today's five-file
    `assets/js`, proving it covers the two bridges plus `css-async.js` before they go. If it fails, the
    allowlist/404 behaviour is not what the old assertion claimed; STOP and report.

- [ ] **Step 4: Update the `webCoreAssets.js` comment.** Its second line says *"web-core still ships the
      iframe bridges until Plan 3, and they must not be exposed here."* Rewrite to state the durable rule:
      the allowlist is explicit because `express.static(assetsDir/js)` would expose whatever web-core ships,
      today and in future. Behaviour unchanged.

- [ ] **Step 5: Verify and commit.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
git grep -cI -E 'iframe-bridge-v2|parent-iframe-bridge-v3' -- . || echo 0
npm test 2>&1 | grep -E '^Tests:' | grep -vc failed
npm run lint 2>&1 | tail -2
git add tests/contentHandler.test.js server/webCoreAssets.js
git commit -m "test(assets): derive the web-core asset 404 guard from disk, not filenames

The guard named iframe-bridge-v2.js and parent-iframe-bridge-v3.js, which Plan 3
deletes from web-core -- so the assertion would have thrown ENOENT on the next core
install and the protection would have vanished with the files. It now lists
assetsDir/js and asserts every file outside webCoreAssets' two-file allowlist 404s on
a marketing host, which is what was load-bearing. Lands before the core release that
drops the bridges.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: `0`, then `1`, then lint clean, then one commit.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate
git revert --no-edit HEAD
npm test 2>&1 | grep -E '^Tests:'
```
- Rollback expected: the revert commit, then a `Tests:` line without `failed` — **valid only while web-core
  still ships the bridges.** After B7 is installed, reverting this commit reds the suite with `ENOENT`; roll
  back B7 first.

---

### Task B7: [web-core] delete both bridge assets and the `securityHeaders.js:81-88` carve-out

**Files:**
- Delete: `/mnt/c/Users/rickh/GitHub/crhs-web-core/assets/js/iframe-bridge-v2.js` (476 lines)
- Delete: `/mnt/c/Users/rickh/GitHub/crhs-web-core/assets/js/parent-iframe-bridge-v3.js` (512 lines)
- Delete: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/assets/bridgeOriginAllowlist.test.js`
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/src/security/securityHeaders.js` — remove lines **81–88**
  (the comment block plus the `if (req.path === '/assets/js/parent-iframe-bridge-v3.js') { … }` body). The
  scope brief says `:83-88`; **measured 2026-09-20 the block is `:81-88`** — `:81-83` are its three comment
  lines and `:84-88` the conditional. Deleting only `83-88` would strand two orphan comment lines.
- Modify: `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/security/cspGolden.test.js` — delete the
  `:150-…` case `parent-iframe-bridge-v3.js -> ACAO *, ACAM GET,OPTIONS, CRP cross-origin`.
- Test (create): `/mnt/c/Users/rickh/GitHub/crhs-web-core/tests/assets/bridgesRetired.test.js`

**Interfaces:**
- **Consumes:**
  - owner decision 4 — a straight deletion;
  - **Task B5** — the affiliate no longer serves `/assets/js/parent-iframe-bridge-v3.js`, so the carve-out
    guards nothing on any live path. This is the ordering that matters: the carve-out lives in the *shared*
    securityHeaders and today applies to a live affiliate URL, so B5 must land first;
  - **Task B6** — corporate's suite must already be filename-independent;
  - backlog **B-4**, whose bridge-asset row this closes (19 brand-literal lines go with the two files).
- **Produces:**
  - `assets/js/` containing exactly `css-async.js`, `i18n.js`, `language-switcher.js`.
  - `securityHeaders` with **no** path-specific header branch except the `/logout` `Clear-Site-Data` rule
    and the `/assets/` + `/locales/` `Cross-Origin-Resource-Policy: cross-origin` rule (which stays — it
    serves sibling-host asset references, not embedding).
  - No `Access-Control-Allow-Origin: *` emitted by `securityHeaders` on any path.
  - A new `tests/assets/bridgesRetired.test.js`.
  - **Release:** this ships in the next web-core version together with the scope-brief group-D fixes
    (`injectNonce` duplicate attribute, SMTP timeouts, logger splat, the `/locales` cache-buster). This task
    does **not** cut or tag a release; group D owns the version bump, the `brandNeutral` re-run and the
    per-box install. Both apps consume the same release, and GC 16's `rm -rf node_modules/@crhs/web-core` +
    pre-reload gate apply to it.

- [ ] **Step 1: Prove nothing across all three repos still references either bridge.**

```bash
for r in crhs-web-core crhs-corporate wavemax-affiliate-program; do
  echo "##### $r"
  ( cd /mnt/c/Users/rickh/GitHub/$r && git grep -lI -E 'iframe-bridge-v2|parent-iframe-bridge-v3|WaveMaxBridgeV3' -- . \
    | grep -vE '^docs/|^tasks/todo\.md$' || true )
done
```
  - Expected, exactly:
    ```
    ##### crhs-web-core
    assets/js/iframe-bridge-v2.js
    assets/js/parent-iframe-bridge-v3.js
    src/security/securityHeaders.js
    tests/assets/bridgeOriginAllowlist.test.js
    tests/security/cspGolden.test.js
    ##### crhs-corporate
    ##### wavemax-affiliate-program
    tests/unit/bridgeRetired.test.js
    ```
    i.e. every surviving reference is either a file this task deletes/edits, or B5's guard test asserting
    absence. **Two empty repo sections are the gate.** A corporate hit means B6 has not landed; an affiliate
    hit other than the guard means B5 has not landed. Either is a STOP.

- [ ] **Step 2: Write the failing guard test.** Create `tests/assets/bridgesRetired.test.js`:

```js
'use strict';
// Owner decision: we will never embed in the franchisor site. The iframe bridges and
// the parent-bridge CORS carve-out are retired outright (Plan 3 item 10). This guards
// the deletion: no bridge asset, and securityHeaders never emits ACAO: *.
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const express = require('express');
const { securityHeadersMiddleware } = require('../../src');

const ASSETS = path.join(__dirname, '..', '..', 'assets', 'js');

describe('iframe bridges retired', () => {
  test('assets/js ships exactly the three surviving client assets', () => {
    expect(fs.readdirSync(ASSETS).sort())
      .toEqual(['css-async.js', 'i18n.js', 'language-switcher.js']);
  });

  test('securityHeaders has no bridge path branch', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'security', 'securityHeaders.js'), 'utf8');
    expect(src).not.toMatch(/bridge/i);
    expect(src).not.toMatch(/Access-Control-Allow-Origin/);
  });

  test('no path gets a wildcard ACAO from securityHeaders', async () => {
    const app = express();
    app.use(securityHeadersMiddleware());
    app.get('*', (req, res) => res.send('ok'));
    for (const p of ['/assets/js/parent-iframe-bridge-v3.js', '/assets/js/i18n.js', '/locales/en/common.json', '/']) {
      const r = await request(app).get(p);
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  test('the asset + locales CRP override survives (sibling-host assets, not embedding)', async () => {
    const app = express();
    app.use(securityHeadersMiddleware());
    app.get('*', (req, res) => res.send('ok'));
    for (const p of ['/assets/css/x.css', '/locales/de/common.json']) {
      expect((await request(app).get(p)).headers['cross-origin-resource-policy']).toBe('cross-origin');
    }
    expect((await request(app).get('/')).headers['cross-origin-resource-policy']).toBe('same-origin');
  });
});
```
  The last case pins what must **not** change: `/assets/` and `/locales/` keep `cross-origin`, and a normal
  path keeps helmet's `same-origin`. Deleting the carve-out must not widen or narrow that.

- [ ] **Step 3: Run it.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npx jest tests/assets/bridgesRetired.test.js 2>&1 | tail -30
```
  - Expected: `Tests: 3 failed, 1 passed, 4 total`. The first failure must be the `readdirSync` case showing
    the five current filenames; the second `securityHeaders has no bridge path branch`; the third the
    wildcard-ACAO case, where `/assets/js/parent-iframe-bridge-v3.js` received `'*'`. The CRP case passes
    from the start — it is the regression fence, not the change.

- [ ] **Step 4: Delete.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git rm -q assets/js/iframe-bridge-v2.js assets/js/parent-iframe-bridge-v3.js tests/assets/bridgeOriginAllowlist.test.js
sed -n '78,92p' src/security/securityHeaders.js       # read the exact block before cutting
sed -i '81,88d' src/security/securityHeaders.js
sed -n '76,88p' src/security/securityHeaders.js
grep -c -i 'bridge\|Access-Control-Allow-Origin' src/security/securityHeaders.js || echo 0
node -e "require('./src/security/securityHeaders.js'); console.log('loads ok')"
```
  - Expected: the pre-cut print shows the comment starting `// Override CORS and resource policy for the
    parent bridge script:` at `:81` and the closing `}` at `:88`; the post-cut print shows the
    `Clear-Site-Data` block running straight into the `// Allow public static assets …` comment with **one**
    blank line between them; then `0`; then `loads ok`.
  - Then delete the `parent-iframe-bridge-v3.js -> ACAO *` case from `tests/security/cspGolden.test.js`
    (the whole `it(...)` block).

- [ ] **Step 5: Full web-core suite + the brand guard (B-4's row closes here).**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
npm test 2>&1 | grep -E '^Tests:'
npm run lint 2>&1 | tail -2
git grep -cI -iE 'wavemax|rundberglaundry|runberglaundry|atxwash|wavemaxlaundry' -- assets/js || echo 0
git grep -lI -iE 'wavemax|rundberglaundry|runberglaundry|atxwash|wavemaxlaundry' -- . | sort
```
  - Expected: a `Tests:` line with `failed` absent and a total **4 lower** than the 572 baseline minus the
    deleted `bridgeOriginAllowlist`/`cspGolden` cases plus the 4 new ones — record the exact number, do not
    guess it; lint clean; then `0` for `assets/js`; then the residual brand-literal file list, which must be
    exactly `LICENSE`, `assets/js/i18n.js`, `assets/js/language-switcher.js`,
    `assets/legal/privacy-policy.html`, `assets/legal/refund-policy.html`,
    `assets/legal/terms-and-conditions.html`. Those six are backlog **B-4**'s remaining rows: legal pages +
    LICENSE go to Rick/counsel (scope-brief decision 1), the `wavemax-language` storage key and the
    switcher comment belong to group D's release. **Record that list in B14's escalation section.**

- [ ] **Step 6: Commit (no version bump, no tag — group D cuts the release).**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git add -A assets/js src/security/securityHeaders.js tests
git commit -m "feat!: delete the iframe bridges and the parent-bridge CORS carve-out

Owner decision: we will never embed in the franchisor site, so item 10 is a straight
deletion, not a migration. Removes assets/js/iframe-bridge-v2.js (476 lines),
assets/js/parent-iframe-bridge-v3.js (512), their origin-allowlist test, the
securityHeaders.js:81-88 wildcard-ACAO/CRP branch (the scope brief said 83-88; 81-83
are its comment and would have been stranded) and the cspGolden case that pinned it.
The /assets/ + /locales/ CRP override stays and is fenced by a new test -- it serves
sibling-host asset references, not embedding. Proven first: zero references in all
three repos outside the files deleted here and the affiliate's absence guard.
Closes backlog B-4's bridge row (19 brand-literal lines go with the files).

BREAKING CHANGE: /assets/js/iframe-bridge-v2.js and parent-iframe-bridge-v3.js are
no longer shipped, and no path receives Access-Control-Allow-Origin: * from
securityHeaders.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: one commit.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/crhs-web-core
git revert --no-edit HEAD
ls assets/js/ | wc -l
npm test 2>&1 | grep -E '^Tests:'
```
- Rollback expected: the revert commit, then `5`, then a `Tests:` line without `failed`.
- **On-box rollback** is group D's deploy rollback, not this task's: restore the per-box
  `~/deploy-snapshots/crhs-web-core-<TS>.tgz`, `rm -rf node_modules/@crhs/web-core` in **both** consumers,
  reinstall, re-run the GC 16 gate, then `pm2 reload`. Never leave one box on each side of this change.

---

# Phase B-iii — affiliate deletion (AFTER all four flips are verified)

### Task B8: [affiliate] read-only deletion manifest, the flip gate, and the two owner decisions

> No file changes. This task proves the flips are done, proves what may be deleted, and gets the two
> decisions the deletion depends on. It exists because item 8 removes the **live** public pages of four
> domains; if even one host still resolves to `:3000`, deleting `partnerLanding` takes that domain down.

**Files:** none (evidence only, written under `/var/www/wavemax/cutover-logs/plan3-sliceB/`, outside every repo).

**Interfaces:**
- **Consumes:** slice A's per-host flip record and its post-flip Lighthouse C14 results; the live origins.
- **Produces:** `sliceB-manifest.txt` (the deletion list with a reference count per entry),
  `FLIPS_VERIFIED=yes|no`, `DECISION_EXPLORER=delete|keep`, `DECISION_QUARANTINE=delete|keep`.

- [ ] **Step 1: Assert all four hosts are served by the content app.**

```bash
EV=/var/www/wavemax/cutover-logs/plan3-sliceB; mkdir -p "$EV"
for h in atxwashateria.com atxwashdryfold.com rundberglaundry.com runberglaundry.com; do
  for ip in 161.153.71.201 144.24.4.202; do
    printf '%s %s ' "$h" "$ip"
    ssh -i ~/.ssh/oci_wavemax ubuntu@$ip \
      "curl -s -o /dev/null -w '%{http_code} ' -H 'Host: $h' http://127.0.0.1:3001/ ;
       grep -c 'proxy-content-app.conf' /etc/nginx/sites-enabled/$h 2>/dev/null || echo 0"
  done
done | tee "$EV/flip-state.txt"
```
  - Expected: **eight** lines, each ending `200 1` — HTTP 200 from `:3001` for that Host, and that host's
    nginx server block including the `:3001` snippet on that box. Any `0` in the second column means the
    host is still on `:3000`: **STOP**, record `FLIPS_VERIFIED=no`, and do not start B9.

- [ ] **Step 2: Assert the post-flip Lighthouse gate passed for every host.**

```bash
grep -E '^(atxwashateria|atxwashdryfold|rundberglaundry|runberglaundry)\.com .*POST' \
  /var/www/wavemax/cutover-logs/plan3-flips/lighthouse-per-host.txt
```
  - Expected: four `POST` rows, each with Accessibility/Best-Practices/SEO `100` and Performance `≥ 95` on
    **both** mobile and desktop, and no mobile↔desktop spread over 3 points (C14). A missing or failing row
    blocks that host and therefore blocks B9.

- [ ] **Step 3: Build the deletion manifest with a reference count per entry.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
for p in public/partner-program.html public/affiliate.html \
         public/assets/css/partner-program.css public/assets/css/affiliate.css \
         public/assets/js/partner-inquiry.js public/assets/js/affiliate-inquiry.js \
         public/assets/images/affiliate-og.png \
         server/middleware/partnerLanding.js \
         server/routes/partnerInquiryRoutes.js server/routes/affiliateApplicationRoutes.js \
         server/controllers/partnerInquiryController.js server/services/partnerInquiryService.js \
         server/services/affiliateApplicationService.js \
         server/controllers/conciergeController.js server/services/conciergeFaq.js \
         server/middleware/explorerGuard.js public/design-explorer \
         tests/helpers/wavemaxAllowlist.js; do
  n=$(git grep -lI -- "$(basename "$p" .js)" -- server server.js public tests scripts | grep -vc "^${p}" || true)
  printf '%-58s refs_outside_itself=%s\n' "$p" "$n"
done | tee "$EV/sliceB-manifest.txt"
git ls-files public/design-explorer | wc -l
node -e 'const t=require("./server/config/csrfTables");console.log("PUBLIC_ENDPOINTS =",t.PUBLIC_ENDPOINTS.length)'
node -e 'const fs=require("fs");const L=(o,p="")=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==="object"?L(v,p+k+"."):[p+k]);
const j=JSON.parse(fs.readFileSync("public/locales/en/common.json","utf8"));
console.log("top-level =",Object.keys(j).length,"| leaves =",L(j).length,"| partner leaves =",L({partner:j.partner}).length);'
```
  - Expected: the manifest table; then `150` design-explorer files; then `PUBLIC_ENDPOINTS = 14`; then
    `top-level = 23 | leaves = 1362 | partner leaves = 109`. These four numbers are the **before** figures
    B9–B11 assert against; if any differs, the tree has moved since this plan was written — re-measure and
    update the later tasks rather than forcing their expected values.

- [ ] **Step 4 (HUMAN-CONFIRM): the design-explorer / concierge decision.** Say exactly this:
  > The scope brief retires **five** CSRF intake rows. Four are the partner-inquiry and
  > affiliate-application aliases, which go with the intake routes. The fifth is `/api/concierge`, and its
  > only client is `public/design-explorer/concierge-client.js` — the 150-file, 6.6 MB design-review tool
  > served on `rundberglaundry.com` behind `EXPLORER_TOKEN`. After the flip that host no longer serves it;
  > it stays reachable at `portal.atxwashdryfold.com/design-explorer?k=…`. To retire the fifth row I have to
  > delete `/api/concierge`, and with it the explorer's concierge panel. The design reviews it was built for
  > are shipped (the Austin Bold skin is live). My recommendation: delete the explorer tree, the concierge
  > route, `conciergeController`, `conciergeFaq`, `conciergeLimiter`, `explorerGuard` and the
  > `EXPLORER_TOKEN` / `ANTHROPIC_API_KEY` keys — it removes 150 files, the last paid-LLM endpoint on the
  > portal and two dead env keys. Alternative: keep the explorer and the route, and retire only **four**
  > rows. Delete, or keep?

  Record the answer as `DECISION_EXPLORER=delete` or `=keep`. On `keep`, Task B11 shrinks to "leave
  `/api/concierge` and its CSRF row in place and rewrite the `PLAN 3 GUARD` comment in
  `server/config/csrfTables.js` to say the row is permanent, with the reason" — and B14's exit record says
  four rows, not five.

- [ ] **Step 5 (HUMAN-CONFIRM): the `locationQuarantine` decision (Task B15).** Say exactly this:
  > `server/middleware/locationQuarantine.js` + `server/config/quarantineConfig.js` 302-redirect
  > non-allowlisted paths to `CORPORATE_SITE_URL`, whose default is
  > `https://www.wavemaxlaundry.com` — the franchisor. It is gated by `QUARANTINE_NON_AUSTIN`, which is
  > `false`, so it is inert today. Its allowlist is full of dead franchise paths (`/austin-tx`,
  > `/api/austin-tx/`). Given the DMCA/trademark correspondence, code that can redirect our users to the
  > franchisor is dead config I would rather not leave loaded. Delete it, or keep it?

  Record `DECISION_QUARANTINE=delete|keep`.

- [ ] **Step 6: Write the record.**

```bash
printf 'FLIPS_VERIFIED=%s\nDECISION_EXPLORER=%s\nDECISION_QUARANTINE=%s\n' yes <answer> <answer> \
  >> /var/www/wavemax/cutover-logs/plan3-sliceB/record.env
cat /var/www/wavemax/cutover-logs/plan3-sliceB/record.env
```
  - Expected: the three lines echoed, `FLIPS_VERIFIED=yes`.

**Rollback (exact).** None — this task writes nothing inside any repo and touches no box state.
```bash
rm -f /var/www/wavemax/cutover-logs/plan3-sliceB/record.env && echo RECORD_CLEARED
```
- Rollback expected: `RECORD_CLEARED`.

---

### Task B9: [affiliate] **item 8** — delete the marketing pages, assets, `partner.*` locales and `partnerLanding`

> Deletion-only; the diff exceeds 500 lines (≈1 400 removed) and that is the concern: one commit removes the
> marketing surface the content app now owns. The host-surface prune (CSP/CORS/sitemap) is **Task B12**, kept
> separate because it changes live security configuration rather than deleting dead pages.

**Files:**
- Delete: `public/partner-program.html` (330), `public/affiliate.html` (336),
  `public/assets/css/partner-program.css` (281), `public/assets/css/affiliate.css` (191),
  `public/assets/js/partner-inquiry.js` (120), `public/assets/js/affiliate-inquiry.js` (85),
  `public/assets/images/affiliate-og.png`, `public/assets/images/locations/austin-tx/*` (5 `.webp`),
  `server/middleware/partnerLanding.js` (147).
- Delete: `tests/unit/partnerLanding.test.js` (250), `tests/unit/partnerInquiryForm.test.js` (85),
  `tests/unit/affiliateApplicationForm.test.js` (66), `tests/unit/interestFormEmailBranding.test.js` (55),
  `tests/integration/partnerProgramOpenAccess.test.js` (124),
  `tests/integration/marketingHostFallthrough.test.js` (64), `tests/helpers/wavemaxAllowlist.js`.
- Modify: `server.js` — drop the `partnerLanding` require + `app.use` (`:371-372`), the `/affiliate` route
  (`:819-821`) and the marketing-host fall-through (`:1029-1036`).
- Modify: `public/locales/{en,es,pt,de}/common.json` — remove the `partner` subtree (109 leaves each).
- Modify: `tests/unit/branding-guard.test.js` — drop the now-dangling `EXCLUDED_FILES` /
  `EXCLUDED_PREFIXES` entries for the deleted paths.
- Modify: `scripts/build-assets.js` — drop any row naming a deleted asset.

**Interfaces:**
- **Consumes:** Task B8's `FLIPS_VERIFIED=yes` and the four measured before-figures. **This is the flip
  dependency in its strongest form:** `partnerLanding` is what answers `/` on the four marketing hosts
  today.
- **Produces:** an affiliate app with no marketing surface; locales at **22** top-level keys / **1253**
  leaves per language; `tests/integration/interestFormLink.test.js` (Task B1) carrying the only surviving
  assertions from `partnerProgramOpenAccess.test.js`.

- [ ] **Step 1: Prove the content app answers what the affiliate is about to stop answering.**

```bash
for h in atxwashateria.com atxwashdryfold.com rundberglaundry.com runberglaundry.com; do
  for p in / /affiliate; do
    printf '%s%s ' "$h" "$p"
    curl -s -o /dev/null -w '%{http_code}\n' "https://$h$p"
  done
done
curl -s https://atxwashdryfold.com/affiliate | grep -c 'data-i18n' 
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' \
  -d '{"firstName":""}' https://atxwashdryfold.com/api/affiliate-application
```
  - Expected: eight `200` lines; then a `data-i18n` count `≥ 90` (Task B3's layer is live on the public
    origin); then `400` — the intake endpoint is corporate's and rejects an invalid payload without sending
    mail (Plan 2 R-13). Any `404`/`502` is a **STOP**.

- [ ] **Step 2: Prove the deletion set has no live consumer inside the affiliate.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git grep -nI -E 'partner-program\.html|partnerLanding|wavemaxAllowlist' -- server server.js public tests scripts \
  | grep -vE '^(server/middleware/partnerLanding\.js|tests/unit/partnerLanding\.test\.js|tests/helpers/wavemaxAllowlist\.js|tests/unit/partnerInquiryForm\.test\.js|tests/integration/marketingHostFallthrough\.test\.js):'
echo "--- exit $? ---"
git grep -nI "'partner\.\|\"partner\.\|data-i18n=\"partner\." -- public server server.js \
  | grep -vE '^public/(partner-program\.html|assets/js/partner-inquiry\.js):'
echo "--- exit $? ---"
```
  - Expected: both greps print nothing and report `--- exit 1 ---` (grep's no-match status) apart from the
    lines in `server.js` that this task removes — if `server.js` appears, confirm the hits are exactly
    `:371`, `:372`, `:819`, `:820`, `:821`, `:1034`. Any other file is a **STOP**.

- [ ] **Step 3: Write the failing guard test.** Create `tests/integration/marketingSurfaceRemoved.test.js`:
      assert (a) the nine deleted source paths do not exist; (b) `server.js` contains no `partnerLanding`;
      (c) `GET /` on Host `rundberglaundry.com` no longer returns the partner page — it falls through to the
      portal shell exactly as any non-marketing host does; (d) each locale file has **22** top-level keys,
      **1253** leaves, and no `partner` key; (e) the four key sets remain identical.

- [ ] **Step 4: Run it.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npx jest tests/integration/marketingSurfaceRemoved.test.js 2>&1 | tail -30
```
  - Expected: every test in the file failing, the first being
    `public/partner-program.html does not exist` → `Received: true`.

- [ ] **Step 5: Delete.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git rm -q public/partner-program.html public/affiliate.html \
  public/assets/css/partner-program.css public/assets/css/affiliate.css \
  public/assets/js/partner-inquiry.js public/assets/js/affiliate-inquiry.js \
  public/assets/images/affiliate-og.png server/middleware/partnerLanding.js \
  tests/unit/partnerLanding.test.js tests/unit/partnerInquiryForm.test.js \
  tests/unit/affiliateApplicationForm.test.js tests/unit/interestFormEmailBranding.test.js \
  tests/integration/partnerProgramOpenAccess.test.js tests/integration/marketingHostFallthrough.test.js \
  tests/helpers/wavemaxAllowlist.js
git rm -q -r public/assets/images/locations
node -e '
const fs=require("fs");
for (const l of ["en","es","pt","de"]) {
  const p=`public/locales/${l}/common.json`;
  const j=JSON.parse(fs.readFileSync(p,"utf8"));
  if (!j.partner) throw new Error("no partner subtree in "+p);
  delete j.partner;
  fs.writeFileSync(p, JSON.stringify(j,null,2)+"\n");
}'
```
  Then hand-edit `server.js` (remove the three regions listed in **Files**), `scripts/build-assets.js` (any
  row naming a deleted asset) and `tests/unit/branding-guard.test.js` (drop the dangling exclusions:
  `server/middleware/partnerLanding.js`, `tests/unit/partnerLanding.test.js`,
  `tests/unit/affiliateApplicationForm.test.js`, `tests/unit/partnerInquiryForm.test.js`, and the
  `public/assets/css/` prefix only if it is now empty of relevant files).

```bash
node -e 'const fs=require("fs");const L=(o,p="")=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==="object"?L(v,p+k+"."):[p+k]);
for (const l of ["en","es","pt","de"]) { const j=JSON.parse(fs.readFileSync(`public/locales/${l}/common.json`,"utf8"));
  console.log(l, Object.keys(j).length, L(j).length, "partner" in j); }'
grep -c partnerLanding server.js || echo 0
node -e "require('./server.js'); process.exit(0)"; echo "boot probe: $?"
```
  - Expected: four lines each `<lang> 22 1253 false`; then `0`; then `boot probe: 0` (the explicit
    `process.exit(0)` is required — the affiliate calls `listen()` on require, GC 16(f)).

- [ ] **Step 6: Targeted suites, lint, cycles (GC 19 — no full suite here).**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npx jest tests/integration/marketingSurfaceRemoved.test.js tests/integration/interestFormLink.test.js \
         tests/integration/embedRoutes.test.js tests/integration/locationQuarantine.test.js \
         tests/unit/i18n-brand-token.test.js tests/unit/domain-guard.test.js 2>&1 | grep -E '^Tests:|✕'
npm run check:i18n 2>&1 | tail -3
npx madge --circular server/ 2>&1 | tail -2
npx eslint server/ 2>&1 | tail -2
```
  - Expected: a `Tests:` line whose only `✕` is `i18n-brand-token › no locale value contains a bare
    "WaveMAX"` — still failing on `landing.footer.fulfillmentPartner`, which Task **B13** fixes and which
    this task must **not** paper over; `check:i18n` reports OK; madge prints `✔ No circular dependency
    found!`; eslint still **208** problems.

- [ ] **Step 7: Commit.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git add -A public server.js scripts/build-assets.js tests
git commit -m "chore: delete the marketing surface the content app now owns (Plan 3 item 8)

All four marketing hosts are served by crhs-corporate on :3001 and each passed its
post-flip Lighthouse C14 gate, so the portal's copies are dead weight. Removes
partner-program.html, the interest form, their CSS/JS/images, partnerLanding and the
marketing-host fall-through, the partner.* locale subtree (109 leaves x 4, locales now
22 top-level keys / 1253 leaves) and six tests that existed only to cover them. The
interest-form assertions worth keeping moved to tests/integration/interestFormLink.test.js.
Proven before deletion: the four public origins answer / and /affiliate 200 from the
content app, and no surviving affiliate file references any deleted path.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: one commit; `git show --stat HEAD | tail -1` reports 20 files changed or more with the
    insertions far below the deletions.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git revert --no-edit HEAD
ls public/partner-program.html public/affiliate.html server/middleware/partnerLanding.js
node -e 'const j=require("./public/locales/en/common.json");console.log(Object.keys(j).length, "partner" in j)'
node -e "require('./server.js'); process.exit(0)"; echo "boot: $?"
```
- Rollback expected: the revert commit, the three paths listed, `23 true`, `boot: 0`.
- **If deployed:** `git pull --ff-only` the revert on both boxes and `pm2 reload wavemax --update-env` —
  `server.js` changed, so a reload is required (a plain `git pull` is not enough). Marketing hosts do not
  come back to `:3000` by this rollback; that is slice A's per-host include swap.

---

### Task B10: [affiliate] delete the intake routes and **four of the five** CSRF rows, in one commit

> `server/config/csrfTables.js:23-29` and `tests/unit/csrfTables.test.js:56-72` both carry an explicit
> `PLAN 3` instruction: *"Delete them in the Plan 3 PR that deletes the routes."* Pruning the rows while the
> routes are mounted 403s two live forms; deleting the routes while the rows stand leaves dead policy. One
> commit, both halves. (The comments name `server.js:680/:736/:737`; measured 2026-09-20 the mounts are
> `:713`, `:769`, `:770` — the line numbers drifted, the instruction did not.)

**Files:**
- Delete: `server/routes/partnerInquiryRoutes.js` (58), `server/routes/affiliateApplicationRoutes.js` (72),
  `server/controllers/partnerInquiryController.js` (46), `server/services/partnerInquiryService.js` (80),
  `server/services/affiliateApplicationService.js` (81), and the affiliate-application controller if it is
  a separate file (check `server/controllers/`).
- Delete: `tests/integration/partnerInquiry.test.js` (87), `tests/integration/affiliateApplication.test.js` (90).
- Modify: `server/config/csrfTables.js` — remove the four intake rows and the `PLAN 3` comment block.
- Modify: `tests/unit/csrfTables.test.js` — rewrite the guard as a closed record.
- Modify: `server.js` — remove the two `apiV1Router.use('/', require(...))` lines (`:769-770`).
- Modify: `server/services/email/**` and `server/templates/emails/**` — remove intake templates/dispatch
  only if nothing else uses them (Step 2 decides; a shared template stays).

**Interfaces:**
- **Consumes:** Task B9 (the forms that POST to these routes are gone); Task B8's `PUBLIC_ENDPOINTS = 14`.
  The **flip** is the real dependency: corporate owns the live intake endpoints
  (`crhs-corporate/server/routes/{partnerInquiry,affiliateApplication}Routes.js`, both with the `/v1` alias),
  proven in B9 Step 1.
- **Produces:** `PUBLIC_ENDPOINTS.length === 10`; `POST /api/partner-inquiry` and
  `POST /api/affiliate-application` return **404** on the portal; `tests/unit/csrfTables.test.js` asserting
  the four rows are **absent** rather than present.

- [ ] **Step 1: Prove no surviving affiliate client posts to these paths.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git grep -lI -E 'api/(v1/)?(partner-inquiry|affiliate-application)' -- public server server.js tests scripts
```
  - Expected exactly these five paths and nothing else:
    ```
    scripts/ops/cutover-gate.sh
    server/config/csrfTables.js
    tests/integration/affiliateApplication.test.js
    tests/integration/partnerInquiry.test.js
    tests/unit/csrfTables.test.js
    ```
    `scripts/ops/cutover-gate.sh` and `tests/unit/ops/cutoverGateS1.test.js` **stay**: the gate script probes
    the **corporate** app on `:3001` and its references remain correct after this deletion. Any
    `public/…` hit means a client still submits to the portal — **STOP**.

- [ ] **Step 2: Decide the email seam.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git grep -lI -E 'partnerInquiryService|affiliateApplicationService' -- server server.js tests
ls server/templates/emails/en/ | grep -iE 'partner|inquiry|applicat' || echo NO_INTAKE_TEMPLATES
git grep -nI -E 'partner-inquiry|affiliate-application' -- server/services/email || echo NO_DISPATCH_REFS
```
  - Expected: the service files plus their own tests; then either `NO_INTAKE_TEMPLATES` or a template list —
    each listed template must be grepped for other senders before deletion, and any template with a second
    caller **stays**. Record the decision in the commit body.

- [ ] **Step 3: Write the failing guard.** Rewrite `tests/unit/csrfTables.test.js`'s `PLAN 3 GUARD` block as:

```js
  // PLAN 3 (slice B) — CLOSED. The intake routes moved to crhs-corporate with the
  // marketing pages, so these rows are gone. They were exempt only because the public
  // pages POSTed with a plain fetch; there is no such page in this app any more.
  it('the retired intake rows are gone and the paths 404', async () => {
    for (const p of ['/api/v1/partner-inquiry', '/api/partner-inquiry',
      '/api/v1/affiliate-application', '/api/affiliate-application']) {
      expect(tables.PUBLIC_ENDPOINTS).not.toContain(p);
      expect((await request(app).post(p).send({})).status).toBe(404);
    }
  });

  it('PUBLIC_ENDPOINTS shrank by exactly the four intake rows', () => {
    expect(tables.PUBLIC_ENDPOINTS).toHaveLength(10);
  });
```
  (`10`, not 9: the fifth row, `/api/concierge`, is Task B11's.)

- [ ] **Step 4: Run it.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npx jest tests/unit/csrfTables.test.js 2>&1 | tail -25
```
  - Expected: `Tests: 2 failed, …`, the first failure being
    `expect(received).not.toContain('/api/v1/partner-inquiry')` on `PUBLIC_ENDPOINTS`, the second
    `expect(received).toHaveLength(10) … Received length: 14`.

- [ ] **Step 5: Delete both halves.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git rm -q server/routes/partnerInquiryRoutes.js server/routes/affiliateApplicationRoutes.js \
          server/controllers/partnerInquiryController.js server/services/partnerInquiryService.js \
          server/services/affiliateApplicationService.js \
          tests/integration/partnerInquiry.test.js tests/integration/affiliateApplication.test.js
```
  Then hand-edit `server/config/csrfTables.js` (remove the four rows **and** the `PLAN 3` comment block at
  `:23-29`, and the two per-form rationale comments at `:53-64`) and `server.js` (remove `:769-770`).

```bash
node -e 'const t=require("./server/config/csrfTables");console.log("PUBLIC_ENDPOINTS =",t.PUBLIC_ENDPOINTS.length);
console.log("concierge still exempt:", t.PUBLIC_ENDPOINTS.includes("/api/concierge"));'
grep -c -E 'partnerInquiryRoutes|affiliateApplicationRoutes' server.js || echo 0
node -e "require('./server.js'); process.exit(0)"; echo "boot probe: $?"
```
  - Expected: `PUBLIC_ENDPOINTS = 10`, `concierge still exempt: true`, then `0`, then `boot probe: 0`.

- [ ] **Step 6: Verify and commit.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npx jest tests/unit/csrfTables.test.js tests/integration/csrf.test.js tests/unit/rateLimitingMiddleware.test.js 2>&1 | grep -E '^Tests:'
npx madge --circular server/ 2>&1 | tail -2; npx eslint server/ 2>&1 | tail -2
git add -A server server.js tests
git commit -m "chore: delete the portal intake routes and four retired CSRF rows

csrfTables.js and its test both carried a Plan 3 instruction to prune these rows in
the same PR that deletes the routes -- pruning earlier 403s two live forms, deleting
later leaves dead policy. crhs-corporate now serves /api/partner-inquiry and
/api/affiliate-application (plus the /v1 aliases) on the flipped marketing hosts, so
the portal's copies and their CSRF exemptions go together. PUBLIC_ENDPOINTS 14 -> 10;
the test now asserts the rows are ABSENT and the paths 404. /api/concierge and its row
are handled separately. scripts/ops/cutover-gate.sh keeps its references: it probes
the corporate app on :3001.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: a `Tests:` line without `failed`; `✔ No circular dependency found!`; eslint **208**; one commit.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git revert --no-edit HEAD
node -e 'const t=require("./server/config/csrfTables");console.log(t.PUBLIC_ENDPOINTS.length)'
node -e "require('./server.js'); process.exit(0)"; echo "boot: $?"
```
- Rollback expected: the revert commit, `14`, `boot: 0`. If deployed: pull the revert on both boxes and
  `pm2 reload wavemax --update-env`.

---

### Task B11: [affiliate] delete the design explorer, the concierge and the **fifth** CSRF row

> Runs only on `DECISION_EXPLORER=delete` from Task B8 Step 4. On `keep`, this task shrinks to a
> single-commit comment rewrite in `server/config/csrfTables.js` making `/api/concierge`'s exemption
> permanent with its rationale, and B14 records **four** retired rows.

**Files:**
- Delete: `public/design-explorer/` (150 files, 6.6 MB), `server/middleware/explorerGuard.js` (75),
  `server/controllers/conciergeController.js` (141), `server/services/conciergeFaq.js` (91),
  `tests/unit/design-explorer/` (6 files, 651 lines).
- Modify: `server.js` — remove the `explorerGuard` mount (`:648-649`) and the concierge block (`:703-713`).
- Modify: `server/middleware/rateLimiting.js` — remove `conciergeLimiter` (`:317-337`).
- Modify: `server/config/csrfTables.js` — remove `/api/concierge` and its rationale comment.
- Modify: `tests/unit/csrfTables.test.js` — `PUBLIC_ENDPOINTS` `10 → 9`.
- Modify: `tests/unit/branding-guard.test.js` — drop the dangling `EXCLUDED_FILES` entries
  (`server/controllers/conciergeController.js`, `server/services/conciergeFaq.js`) and the three
  design-explorer `EXCLUDED_PREFIXES`.
- Modify: `.env.example` (**HUMAN-CONFIRM**) — remove `EXPLORER_TOKEN` (`:203`) and `ANTHROPIC_API_KEY` (`:213`).

**Interfaces:**
- **Consumes:** `DECISION_EXPLORER=delete`; Task B10 (`PUBLIC_ENDPOINTS = 10`).
- **Produces:** `PUBLIC_ENDPOINTS.length === 9` — all five scope-brief rows retired; no paid-LLM endpoint on
  the portal; two dead env keys gone (exit criterion 5, and scope-brief item 21's neighbours).

- [ ] **Step 1: Prove the concierge has exactly one client and it is inside the deletion set.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git grep -lI 'api/concierge' -- public server server.js tests scripts
git grep -lI -E 'conciergeLimiter|conciergeController|conciergeFaq|explorerGuard|EXPLORER_TOKEN|ANTHROPIC_API_KEY' \
  -- public server server.js tests scripts .env.example | sort
```
  - Expected, first grep exactly:
    ```
    public/design-explorer/concierge-client.js
    server.js
    server/config/csrfTables.js
    ```
    and the second grep listing only `.env.example`, `public/design-explorer/…`, `server.js`,
    `server/config/csrfTables.js`, `server/controllers/conciergeController.js`,
    `server/middleware/explorerGuard.js`, `server/middleware/rateLimiting.js`,
    `server/services/conciergeFaq.js`, `tests/unit/branding-guard.test.js` and
    `tests/unit/design-explorer/*`. Anything outside the deletion set or the files edited here is a **STOP** —
    in particular, a hit in `public/*.html` would mean a live page embeds the concierge.

- [ ] **Step 2: Write the failing guard.** Create `tests/unit/explorerRetired.test.js`: the five paths do not
      exist; `server.js` names neither `explorerGuard` nor `concierge`; `rateLimiting` exports no
      `conciergeLimiter`; `POST /api/concierge` returns 404; `GET /design-explorer/` returns 404 even with a
      `?k=` value; `PUBLIC_ENDPOINTS.length === 9` and does not contain `/api/concierge`; `.env.example`
      matches neither `EXPLORER_TOKEN` nor `ANTHROPIC_API_KEY`.

- [ ] **Step 3: Run it.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npx jest tests/unit/explorerRetired.test.js 2>&1 | tail -25
```
  - Expected: every test failing, the first being `public/design-explorer does not exist` → `Received: true`.

- [ ] **Step 4: Delete.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git rm -q -r public/design-explorer tests/unit/design-explorer
git rm -q server/middleware/explorerGuard.js server/controllers/conciergeController.js server/services/conciergeFaq.js
```
  Then hand-edit `server.js` (both regions), `server/middleware/rateLimiting.js`,
  `server/config/csrfTables.js`, `tests/unit/csrfTables.test.js` and `tests/unit/branding-guard.test.js`.

```bash
node -e 'const t=require("./server/config/csrfTables");console.log("PUBLIC_ENDPOINTS =",t.PUBLIC_ENDPOINTS.length, t.PUBLIC_ENDPOINTS.includes("/api/concierge"));'
node -e 'console.log("conciergeLimiter:", typeof require("./server/middleware/rateLimiting").conciergeLimiter)'
grep -c -E 'concierge|explorerGuard' server.js || echo 0
node -e "require('./server.js'); process.exit(0)"; echo "boot probe: $?"
```
  - Expected: `PUBLIC_ENDPOINTS = 9 false`; `conciergeLimiter: undefined`; `0`; `boot probe: 0`.

- [ ] **Step 5 (HUMAN-CONFIRM): remove the two dead `.env.example` keys.** Say exactly this:
  > `.env.example` loses `EXPLORER_TOKEN` and `ANTHROPIC_API_KEY`. Both subsystems are deleted in this
  > commit, so the keys read by nothing. The production `.env` files still carry them; slice A's env sweep
  > (scope-brief item 21, alongside `OAUTH_CALLBACK_URI`, `DOCUSIGN_REDIRECT_URI` and `BACKEND_URL`) removes
  > them from the boxes. Proceed?

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
sed -i '/^EXPLORER_TOKEN=/d;/^ANTHROPIC_API_KEY=/d' .env.example
grep -c -E '^(EXPLORER_TOKEN|ANTHROPIC_API_KEY)=' .env.example || echo 0
```
  - Expected: `0`. Review the surrounding comment lines by hand and delete any that now describe a removed
    key.

- [ ] **Step 6: Verify and commit.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
npx jest tests/unit/explorerRetired.test.js tests/unit/csrfTables.test.js tests/unit/rateLimitingMiddleware.test.js tests/unit/branding-guard.test.js 2>&1 | grep -E '^Tests:|✕'
npx madge --circular server/ 2>&1 | tail -2; npx eslint server/ 2>&1 | tail -2
du -sh .git; git count-objects -vH | grep size-pack
git add -A public server server.js tests .env.example
git commit -m "chore: retire the design explorer, the concierge and the fifth CSRF row

Owner decision (recorded in the slice B gate): the explorer's design reviews are
shipped and its only remaining client was the concierge panel, which was the sole
client of /api/concierge -- the fifth CSRF intake row the scope brief retires.
Deletes 150 explorer files, explorerGuard, conciergeController, conciergeFaq,
conciergeLimiter, six explorer test files and the two now-dead .env.example keys
(EXPLORER_TOKEN, ANTHROPIC_API_KEY). PUBLIC_ENDPOINTS 10 -> 9: all five rows retired.
Removes the portal's last paid-LLM endpoint.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: the `Tests:` line's only `✕` is branding-guard's offender list (now down to the three Plan-2
    GATE tooling files — B13 closes it); `✔ No circular dependency found!`; eslint **208** or fewer (the
    deleted files may have carried lint errors — a **decrease** is fine and is recorded, an increase is a
    STOP); the pack size printed for the record (git history keeps the 6.6 MB; only the working tree shrinks);
    one commit.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git revert --no-edit HEAD
git ls-files public/design-explorer | wc -l
node -e 'const t=require("./server/config/csrfTables");console.log(t.PUBLIC_ENDPOINTS.length)'
node -e "require('./server.js'); process.exit(0)"; echo "boot: $?"
```
- Rollback expected: the revert commit, `150`, `10`, `boot: 0`. If deployed: pull the revert on both boxes,
  `pm2 reload wavemax --update-env`, and note that `EXPLORER_TOKEN` / `ANTHROPIC_API_KEY` must still be
  present in the production `.env` for the explorer to work — the revert restores the code, not the env.

---

### Task B12: [affiliate] prune the marketing hosts out of the portal's live host surface

> Deleting the pages leaves the **hosts** still named in the portal's CSP, CORS, sitemap, HTTPS-redirect
> fallback and a default `BASE_URL`. That is live security configuration, not dead pages, so it is its own
> commit. **Overlaps slice A item 6** (`BASE_URL`, `LOG_SERVICE_NAME`, `SESSION_COOKIE_NAME` env sweep) —
> the split is: slice A owns the **`.env` values on the boxes**, this task owns the **in-code host lists**.
> Controller: confirm nobody is doing both.

**Files:**
- Modify: `server.js` — `allowedHosts` (`:173-181`), the HTTPS-redirect fallback (`:192`),
  `APP_LOCATION_ORIGINS` (`:245-251`), `wavemaxDomains` (`:299-304`), `managedHosts` + the sitemap fallback
  (`:952-964`).
- Modify: `server/modules/bags/labelSheetService.js:89` — the `BASE_URL` default.
- Modify: `public/privacy-policy.html:10`, `public/terms-and-conditions.html:10` — the canonical host.
- Modify: `tests/unit/domain-guard.test.js`, `tests/integration/domainMigration.test.js` — whatever pins the
  old lists.
- Test (create): `tests/integration/portalHostSurface.test.js`.

**Interfaces:**
- **Consumes:** Task B9 (nothing in this app serves a marketing host any more); slice A's flip record; the
  **decision** that `portal.atxwashdryfold.com` is the portal's only canonical host (recorded 2026-08-23).
- **Produces:** every in-code host list in the portal names only `portal.atxwashdryfold.com` (plus the
  documented retirement 301s for `wavemax.promo` / `affiliate.wavemax.promo` and `localhost:3000`). No
  marketing host in `img-src` / `connect-src` / CORS; the sitemap emits the portal host; the
  bag-label default `BASE_URL` is the portal.
- **Deliberately not done here:** no redirect is added from `portal.atxwashdryfold.com/affiliate` to the
  content origin. The only inbound paths to the interest form were the marketing hosts, which corporate now
  owns, and `INTEREST_FORM_URL` is config. Adding one would re-create exactly the cross-app link the
  separation exists to remove. Recorded as a conscious close.

- [ ] **Step 1: Inventory every in-code marketing-host literal.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git grep -nI -E "https?://(www\.)?(rundberglaundry|runberglaundry|atxwashateria|atxwashdryfold)\.com" \
  -- server server.js public 'public/**/*.html' | grep -v 'portal\.atxwashdryfold\.com' | tee /tmp/hosts-before.txt | wc -l
```
  - Expected: a count matching the **Files** list above (measured 2026-09-20: 16 lines across
    `server.js`, `server/config/quarantineConfig.js`, `server/modules/bags/labelSheetService.js`,
    `public/privacy-policy.html`, `public/terms-and-conditions.html`,
    `public/affiliate-landing-embed.html`, `public/embed-landing.html`,
    `public/assets/js/affiliate-landing-init.js` — after B9 removed `public/affiliate.html` and
    `public/partner-program.html`). Record the exact number. The `embed-landing.html` and
    `affiliate-landing-init.js` hits are the **slice A cross-origin defect** in the findings table; if slice A
    has already fixed them the count is 3 lower — either is fine, but say which.

- [ ] **Step 2: Write the failing guard.** Create `tests/integration/portalHostSurface.test.js`: the CSP
      header on `/` names no marketing apex; a credentialed CORS preflight from
      `https://rundberglaundry.com` is refused and one from `https://portal.atxwashdryfold.com` is admitted;
      `GET /sitemap.xml` on Host `portal.atxwashdryfold.com` emits only that host; `allowedHosts` excludes
      the marketing apexes; `labelSheetService`'s default `BASE_URL` is the portal; both legal pages'
      canonicals are the portal.

- [ ] **Step 3: Run it.** `cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npx jest tests/integration/portalHostSurface.test.js 2>&1 | tail -25`
  - Expected: every test failing; the first showing the live CSP header with
    `https://rundberglaundry.com` present in `img-src`.

- [ ] **Step 4: Prune, then verify.** Edit the seven files. Leave `wavemax.promo`,
      `www.wavemax.promo` and `affiliate.wavemax.promo` in `allowedHosts` — they are the documented
      retirement 301s. Change the HTTPS-redirect fallback and the sitemap fallback to
      `portal.atxwashdryfold.com`.

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git grep -nI -E "https?://(www\.)?(rundberglaundry|runberglaundry|atxwashateria|atxwashdryfold)\.com" \
  -- server server.js public | grep -v 'portal\.atxwashdryfold\.com'
echo "--- exit $? ---"
node -e "require('./server.js'); process.exit(0)"; echo "boot probe: $?"
npx jest tests/integration/portalHostSurface.test.js tests/unit/domain-guard.test.js \
         tests/integration/domainMigration.test.js tests/integration/csp.test.js 2>&1 | grep -E '^Tests:|✕'
npx eslint server/ 2>&1 | tail -2
```
  - Expected: the grep prints only the `quarantineConfig.js` line if Task B15 has not run (its
    `rundberglaundry.com` reference is in a comment) and reports `--- exit 1 ---` otherwise;
    `boot probe: 0`; a `Tests:` line with no `✕`; eslint **208**.

- [ ] **Step 5: Commit.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git add -A server server.js public tests
git commit -m "chore(hosts): the portal's host surface names only portal.atxwashdryfold.com

The marketing hosts are served by crhs-corporate and the portal's copies of their
pages are gone, but the hosts were still in the portal's CSP img-src/connect-src, its
CORS allowlist, allowedHosts, the sitemap, the HTTPS-redirect fallback and the
bag-label BASE_URL default -- live configuration granting credentialed CORS and CSP
reach to origins this app no longer has any relationship with. Retires them and
repoints the two legal-page canonicals. wavemax.promo stays in allowedHosts: it is a
documented retirement 301. No portal -> content-origin redirect is added for
/affiliate; INTEREST_FORM_URL is the config-driven answer and a redirect would
re-create the cross-app link the separation removes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: one commit.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git revert --no-edit HEAD
git grep -cI 'https://rundberglaundry.com' -- server.js
node -e "require('./server.js'); process.exit(0)"; echo "boot: $?"
```
- Rollback expected: the revert commit, a non-zero count, `boot: 0`. If deployed: pull the revert on both
  boxes and `pm2 reload wavemax --update-env` (CSP and CORS are computed at boot).

---

### Task B13: [affiliate] close both known guard failures — the suite goes fully green

> GC 19 records exactly two failing affiliate suites. B9/B11 removed 8 of branding-guard's 32 offender lines
> and one of i18n-brand-token's two hits. This task closes both, which is what exit criterion 4 and the
> "clean deployment" goal actually require.

**Files:**
- Modify: `tests/unit/i18n-brand-token.test.js`
- Modify: `tests/unit/branding-guard.test.js`

**Interfaces:**
- **Consumes:** Tasks B9 and B11; the owner decision of 2026-09-08 that **`WaveMAX Austin` is the one
  permitted use of the mark**, as the exclusive fulfillment partner — already encoded in
  `branding-guard`'s `INFRA_ALLOW` (`/WaveMAX Austin/gi`).
- **Produces:** both suites green. `i18n-brand-token`'s assertion becomes *"no locale value names a bare
  WaveMAX; `WaveMAX Austin` is permitted"* — the same rule the branding guard uses, instead of a blanket ban
  the owner reversed. `branding-guard`'s offender list reaches `[]`, with the three Plan-2 GATE tooling files
  excluded for a stated reason.

- [ ] **Step 1: Measure both failures after the deletions.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
node -e 'const fs=require("fs");const L=(o,p="")=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==="object"?L(v,p+k+"."):[[p+k,v]]);
for (const l of ["en","es","pt","de"]) { const j=JSON.parse(fs.readFileSync(`public/locales/${l}/common.json`,"utf8"));
  console.log(l, L(j).filter(([k,v])=>typeof v==="string"&&/wavemax/i.test(v)).map(([k])=>k).join(",")); }'
npx jest tests/unit/branding-guard.test.js 2>&1 | grep -E '^\s+\+\s+"' | sed 's/.*+ *//' | tr -d '",' \
  | awk -F: '{c[$1]++} END {for (f in c) printf "%3d %s\n", c[f], f}' | sort -k2
```
  - Expected: four lines each `<lang> landing.footer.fulfillmentPartner` (exactly one key, the owner-approved
    disclaimer — `partner.footer.fulfillmentPartner` went with B9); then an offender table of exactly
    ```
     15 scripts/ops/cutover-gate.sh
      1 tests/integration/webCoreConsumptionGolden.test.js
      8 tests/unit/ops/cutoverGateS1.test.js
    ```
    (24 lines, 3 files). A different set means the deletions differed from plan — re-measure before editing.

- [ ] **Step 2: Fix the i18n assertion (TDD: the new assertion must fail first if the rule is wrong).** In
      `tests/unit/i18n-brand-token.test.js`, change the first test to strip the sanctioned literal before
      matching, and add a positive control proving a bare mark still fails:

```js
  test('no locale value names a bare "WaveMAX"; only "WaveMAX Austin" is permitted', () => {
    // Owner decision 2026-09-08: the app must name WaveMAX Austin as the exclusive
    // fulfillment partner (landing.footer.fulfillmentPartner), and ONLY in that
    // capacity. The blanket ban this test used to assert was reversed that day; the
    // rule is now the same one tests/unit/branding-guard.test.js INFRA_ALLOW encodes.
    for (const l of LANGS) {
      expect(/wavemax/i.test(load(l).replace(/WaveMAX Austin/g, ''))).toBe(false);
    }
  });

  test('the sanctioned-literal strip cannot hide a bare mark (positive control)', () => {
    const sample = JSON.stringify({ a: 'WaveMAX Austin is our partner', b: 'WaveMAX Laundry' });
    expect(/wavemax/i.test(sample.replace(/WaveMAX Austin/g, ''))).toBe(true);
  });
```

- [ ] **Step 3: Close the branding guard.** Add the three measured files to `EXCLUDED_FILES` with one
      comment naming the reason: they are Plan-2 cutover **tooling** that must name the real hosts and the
      `WaveMAX Austin` mark to assert the content app's output. Then re-check that the exclusion list has no
      stale entries left by B9/B11.

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
node -e 'const fs=require("fs"),src=fs.readFileSync("tests/unit/branding-guard.test.js","utf8");
const files=[...src.matchAll(/'"'"'([^'"'"']+\.(?:js|json|html|sh|md))'"'"'/g)].map(m=>m[1])
  .filter(f=>f.includes("/")||f.endsWith(".json"));
const missing=files.filter(f=>!fs.existsSync(f));
console.log("exclusion entries naming a path that no longer exists:", missing.length, missing.join(" "));'
npx jest tests/unit/branding-guard.test.js tests/unit/i18n-brand-token.test.js 2>&1 | grep -E '^Tests:|✕'
```
  - Expected: `exclusion entries naming a path that no longer exists: 0` (any listed path must be removed
    first), then `Tests:` with **no** `✕` and `failed` absent.

- [ ] **Step 4: Commit.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git add tests/unit/branding-guard.test.js tests/unit/i18n-brand-token.test.js
git commit -m "test(guards): close the two known affiliate failures

i18n-brand-token banned every "WaveMAX" in the locales, a rule the owner reversed on
2026-09-08: the app must name WaveMAX Austin as the exclusive fulfillment partner
(landing.footer.fulfillmentPartner). It now strips that one sanctioned literal --
the same rule branding-guard's INFRA_ALLOW already used -- with a positive control
proving a bare mark still fails. branding-guard's offender list reached [] once slice B
deleted tests/helpers/wavemaxAllowlist.js; the three remaining files are Plan 2 cutover
tooling that must name the real hosts to assert the content app's output, so they are
excluded with that reason. The affiliate suite has no known failures left.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: one commit.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git revert --no-edit HEAD
npx jest tests/unit/branding-guard.test.js tests/unit/i18n-brand-token.test.js 2>&1 | grep -E '^Tests:'
```
- Rollback expected: the revert commit, then `Tests: 2 failed, 4 passed, 6 total` — back to the GC 19
  baseline. Test-only; nothing deployed.

---

### Task B14: slice exit — the one full suite, the backlog records, the escalation list

**Files:**
- Modify: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tasks/todo.md` (B-1, B-2, B-4 sections → closed records)
- Modify: `/home/rickh/.claude/projects/-mnt-c-Users-rickh-GitHub-wavemax-affiliate-program/memory/backlog_interest_form_i18n.md`
- Modify: `/home/rickh/.claude/projects/-mnt-c-Users-rickh-GitHub-wavemax-affiliate-program/memory/backlog_register_now_interest_form.md`
- Modify: `/home/rickh/.claude/projects/-mnt-c-Users-rickh-GitHub-wavemax-affiliate-program/memory/backlog_webcore_brand_literals_b4.md`
- Modify: `/home/rickh/.claude/projects/…/memory/MEMORY.md` (the index lines for the three `backlog_*` files)
- Create: `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/docs/superpowers/plans/plan3-escalations.md` (or append to slice A's, if it already exists — controller's call)

**Interfaces:**
- **Consumes:** every earlier task in this slice.
- **Produces:** exit criterion 3 for slice B's items ("every memory `backlog_*` file is either deleted or
  rewritten as a closed record") and exit criterion 7 (a single written escalation list).

- [ ] **Step 1: The one full affiliate suite (controller-run, background, GC 19).**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && npm test 2>&1 | tail -20
```
  - Expected: `Tests: … failed` **absent**, and `Test Suites: … failed` absent. This is the first and only
    full-suite run in slice B. Any failure is triaged here, not deferred: the run happens after B13 precisely
    so the answer is "green", not "green except the two known".
  - Also record: `npx eslint server/ 2>&1 | tail -2` → **≤ 208** problems (D-4 drives it to 0 in its own
    series); `npx madge --circular server/` → `✔ No circular dependency found!`;
    `npm run check:i18n` → OK.

- [ ] **Step 2: The corporate and web-core suites.**

```bash
cd /mnt/c/Users/rickh/GitHub/crhs-corporate && npm test 2>&1 | grep -E '^Tests:|^Test Suites:'; npm run lint 2>&1 | tail -2
cd /mnt/c/Users/rickh/GitHub/crhs-web-core && npm test 2>&1 | grep -E '^Tests:|^Test Suites:'; npm run lint 2>&1 | tail -2
```
  - Expected: both `Tests:`/`Test Suites:` lines without `failed`; both lints clean.

- [ ] **Step 3: Rewrite the three backlog records as closed.** Each keeps its frontmatter and gains a
      `✅ CLOSED <date> — Plan 3 slice B` header naming the commits, what shipped, and — for B-2 — the two
      things deliberately **not** done with their reasons (the SVG diagram's 33 English `<text>` nodes; the
      English-canonical SEO/OG/JSON-LD block). Update the `MEMORY.md` index lines to match. Delete nothing:
      the reasons are the value.

```bash
grep -c '✅ CLOSED' /home/rickh/.claude/projects/-mnt-c-Users-rickh-GitHub-wavemax-affiliate-program/memory/backlog_{interest_form_i18n,register_now_interest_form,webcore_brand_literals_b4}.md
grep -n 'B-1\|B-2\|B-4' /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/tasks/todo.md | head -20
```
  - Expected: three `…:1` lines; then the `todo.md` B-1/B-2/B-4 headings each carrying `✅ DONE`/`CLOSED`.

- [ ] **Step 4: Write the escalation list.** One file, one line per item, each with *what*, *why it is not in
      Plan 3*, and *who decides*:
  1. **web-core legal pages + LICENSE** (`assets/legal/{privacy-policy,refund-policy,terms-and-conditions}.html`,
     `LICENSE` — 40 brand-literal lines): Rick/counsel. Never auto-edited.
  2. **`assets/js/i18n.js` `storageKey: 'wavemax-language'`** rename + read-old-key-once migration shim
     (scope-brief decision 1): group D's web-core release.
  3. **Marketing-host 404s after the flip** — the legal-page and `*-embed.html` list in this draft's
     findings table: slice A / owner (add to `legacyPortalRedirects.EXACT_PATHS` or publish copies).
  4. **`embed-landing.html:314/:317` + `affiliate-landing-init.js:37` cross-origin references to a flipped
     host**: slice A "0b portal hygiene", **before** the first flip.
  5. **The workflow SVG on `/affiliate` is English-only** — a localised diagram is a redraw; owner decides
     whether it is worth one.
  6. **`jest.config.js:24 forceExit: true`** in the affiliate repo, against the project rule that tests run
     clean without it.
  7. **`DECISION_QUARANTINE`** if Task B8 Step 5 answered `keep`.
  8. Slice A's own items 4, 5, 6, 20, 21 are referenced, not owned here.

```bash
wc -l /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program/docs/superpowers/plans/plan3-escalations.md
```
  - Expected: a non-zero line count, and every numbered item above present.

- [ ] **Step 5: Commit the records.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git add tasks/todo.md docs/superpowers/plans/plan3-escalations.md
git commit -m "docs: slice B exit record — B-1, B-2 and B-4's bridge row closed

Full affiliate suite green with no known failures (the two GC-19 baseline failures are
closed by the guard commit, not excused). Rewrites the B-1/B-2/B-4 backlog entries as
closed records including what was deliberately NOT done and why, and lists everything
escalated to the owner or counsel so the backlog is clear because items were closed or
escalated, never because they were forgotten.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: one commit.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program && git revert --no-edit HEAD && git log --oneline -1
```
- Rollback expected: the revert commit. Documentation only.

---

### Task B15: *(OPTIONAL — runs only on `DECISION_QUARANTINE=delete`)* [affiliate] delete `locationQuarantine`

**Files:** delete `server/middleware/locationQuarantine.js`, `server/config/quarantineConfig.js`,
`tests/integration/locationQuarantine.test.js`; modify `server.js` (the mount at `:536-…`) and
`.env.example` (**HUMAN-CONFIRM**, remove `QUARANTINE_NON_AUSTIN` at `:193`).

**Interfaces:**
- **Consumes:** `DECISION_QUARANTINE=delete`; the measured fact that `QUARANTINE_NON_AUSTIN` defaults to
  `false` and the allowlist's live patterns (`/austin-tx`, `/api/austin-tx/`) point at the Phase-4b-retired
  franchise tree.
- **Produces:** no code path in the portal that can 302 a user to `www.wavemaxlaundry.com`; one fewer dead
  `.env` key; `CORPORATE_SITE_URL`'s last affiliate reader removed (Plan 2 finding F-2 already deleted it
  from corporate as litigation residue).

- [ ] **Step 1: Prove it is inert in production and unreferenced elsewhere.**

```bash
for ip in 161.153.71.201 144.24.4.202; do
  printf '%s ' "$ip"
  ssh -i ~/.ssh/oci_wavemax ubuntu@$ip \
    "grep -c '^QUARANTINE_NON_AUSTIN=true' /var/www/wavemax/wavemax-affiliate-program/.env || echo 0"
done
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git grep -lI -E 'locationQuarantine|quarantineConfig|QUARANTINE_NON_AUSTIN|CORPORATE_SITE_URL' \
  -- server server.js public tests scripts .env.example | sort
```
  - Expected: two lines each ending `0` (the flag is not `true` on either box — **a `1` is a STOP**, the
    middleware is live); then a file list containing only the three files deleted here, `server.js`,
    `.env.example` and `tests/integration/locationQuarantine.test.js`. Any other consumer is a **STOP**.

- [ ] **Step 2: Write the failing guard.** Create `tests/unit/quarantineRetired.test.js`: the three paths do
      not exist; `server.js` names neither `locationQuarantine` nor `QUARANTINE_NON_AUSTIN`; no tracked file
      under `server/` contains `wavemaxlaundry.com` as a redirect **target** (a comment naming the franchisor
      is allowed, a `res.redirect` to it is not); `.env.example` has no `QUARANTINE_NON_AUSTIN`.

- [ ] **Step 3: Run it.** `npx jest tests/unit/quarantineRetired.test.js 2>&1 | tail -20`
  - Expected: every test failing, the first being
    `server/middleware/locationQuarantine.js does not exist` → `Received: true`.

- [ ] **Step 4: Delete, verify, commit.**

```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git rm -q server/middleware/locationQuarantine.js server/config/quarantineConfig.js tests/integration/locationQuarantine.test.js
# hand-edit server.js (remove the mount + its comment block) and .env.example (HUMAN-CONFIRM)
grep -c -E 'locationQuarantine|QUARANTINE_NON_AUSTIN' server.js .env.example || echo 0
node -e "require('./server.js'); process.exit(0)"; echo "boot probe: $?"
npx jest tests/unit/quarantineRetired.test.js tests/integration/portalHostSurface.test.js 2>&1 | grep -E '^Tests:'
npx madge --circular server/ 2>&1 | tail -2; npx eslint server/ 2>&1 | tail -2
git add -A server server.js tests .env.example
git commit -m "chore: delete locationQuarantine — dead config that redirects to the franchisor

QUARANTINE_NON_AUSTIN is false on both boxes, so the middleware is inert, and its
allowlist points at the Phase-4b-retired /austin-tx franchise tree. What it would do
when enabled is 302 our users to www.wavemaxlaundry.com via CORPORATE_SITE_URL --
code worth not leaving loaded given the DMCA/trademark correspondence (owner
confirmed at the slice B gate). Removes the middleware, its config, its test, the
mount and the dead env key, and with them the affiliate's last CORPORATE_SITE_URL
reader.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
  - Expected: `0`; `boot probe: 0`; a `Tests:` line without `failed`; `✔ No circular dependency found!`;
    eslint **≤ 208**; one commit.

**Rollback (exact).**
```bash
cd /mnt/c/Users/rickh/GitHub/wavemax-affiliate-program
git revert --no-edit HEAD
ls server/middleware/locationQuarantine.js server/config/quarantineConfig.js
node -e "require('./server.js'); process.exit(0)"; echo "boot: $?"
```
- Rollback expected: the revert commit, the two paths listed, `boot: 0`. If deployed: pull the revert on both
  boxes and `pm2 reload wavemax --update-env`.

---

## Slice B exit criteria

1. `INTEREST_FORM_URL` reaches the client on **every** access path, and is documented in `.env.example`.
2. `/affiliate` on the content app is fully internationalised in en/es/pt/de, with the two non-localised
   areas recorded as conscious closes and its post-flip Lighthouse C14 row green.
3. No iframe bridge exists in any of the three repos, and no path receives
   `Access-Control-Allow-Origin: *` from web-core's `securityHeaders`.
4. The portal serves no marketing page, no intake route, no concierge and no explorer; locales are
   **22** top-level keys / **1253** leaves × 4; `PUBLIC_ENDPOINTS.length === 9` — **all five** scope-brief
   rows retired (or **10** / four rows, on `DECISION_EXPLORER=keep`).
5. Every in-code host list in the portal names only `portal.atxwashdryfold.com` plus the documented
   retirement 301s.
6. All three suites green, **zero** known affiliate failures; `madge --circular server/` = 0;
   `eslint server/` ≤ 208 and not increased.
7. `tasks/todo.md` B-1/B-2/B-4 and the three memory `backlog_*` files are closed records, and
   `plan3-escalations.md` names everything handed to the owner, counsel, slice A or group D.
