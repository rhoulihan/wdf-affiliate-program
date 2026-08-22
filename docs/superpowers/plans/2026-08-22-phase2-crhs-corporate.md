# Phase 2 — Build `crhs-corporate` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stand up a new `crhs-corporate` app (serving only `crhsent.com`) that consumes `@crhs/web-core`, built greenfield by copying the crhsent content + gates out of the monorepo (left untouched), each verified under strict TDD.

**Architecture:** A small Express app composed from `@crhs/web-core`: `cspNonce → securityHeaders+CSP → cors → session → sanitization → rateLimiting → accessGate → mediatorGate → crhsentHandler → errorHandler`. Serves the static `crhsent/` tree with nonce-injected HTML. Shared MongoDB for the gate models + SystemConfig reads. PM2 :3001; nginx routes `crhsent.com` there.

**Tech Stack:** Node ≥18, CommonJS, Express 4, `@crhs/web-core` (v0.1.0, consumed as `file:../crhs-web-core` sibling checkout), Jest 29 + mongodb-memory-server + supertest + node-mocks-http.

**Spec:** [`docs/superpowers/specs/2026-08-22-phase2-crhs-corporate-split-design.md`](../specs/2026-08-22-phase2-crhs-corporate-split-design.md).

## Global Constraints

- **Do NOT modify the monorepo** `/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program`. All work lands in the NEW repo `/mnt/c/Users/rickh/GitHub/crhs-corporate`. Source files are **copied**, never moved. Acceptance includes the monorepo showing no tracked-file changes.
- **web-core consumption:** `@crhs/web-core` is a dependency declared as `"file:../crhs-web-core"` (the repo lives at `/mnt/c/Users/rickh/GitHub/crhs-web-core`, a sibling). Never edit web-core from here; consume its 28-key export surface.
- **Strict TDD:** failing test first (port the monorepo's existing test where one exists; adapt imports only), confirm the red, then copy/wire the implementation.
- CommonJS. `logger` (from web-core) only — no `console.*` in `server/`.
- Gates + models are **byte-faithful copies** except: (a) rewire internal `require`s to `@crhs/web-core` (`verifyPassword`/`encryption`, `logger`, `clientIp`, `email.transport.sendEmail`, `SystemConfig`) and to local `../models/*`; (b) `mediatorGate`'s `require('./adminIpGate')` is **rebuilt on `webCore.ipGate`** (no service-repo import). Header comments may change "WaveMAX…"→"CRHS corporate".
- Gates deploy **DARK**: `accessGate` no-ops unless its `access_gate_enabled` SystemConfig / `ACCESS_GATE_*` is set; `mediatorGate` no-ops unless `MEDIATOR_GATE_ENABLED=true`. Preserve that.
- Do **not** de-brand any content (Phase 3). The crhsent pages are *about* the franchisor by design — copy verbatim.
- Every commit ends with:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01UrZdSz8d85hj4C6FQRTNxK
  ```
- Source paths below are relative to `SRC=/mnt/c/Users/rickh/GitHub/wavemax-affiliate-program`; dest relative to `DST=/mnt/c/Users/rickh/GitHub/crhs-corporate`.

---

### Task 1: Scaffold + web-core wiring

**Files:** Create `crhs-corporate/{package.json, jest.config.js, tests/setup.js, .gitignore, .eslintrc.js, LICENSE, README.md, server/, content/}`; Test `tests/webcore.smoke.test.js`.

**Interfaces:** Produces the repo + a working `require('@crhs/web-core')` (28 keys) via the `file:` dep.

- [ ] **Step 1: init + dirs** — `mkdir -p /mnt/c/Users/rickh/GitHub/crhs-corporate/{server,content,tests}; cd $DST; git init -q`.
- [ ] **Step 2: package.json**
```json
{
  "name": "crhs-corporate",
  "version": "0.1.0",
  "description": "CRHS Enterprises corporate site (crhsent.com) — Phase 2 split app",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "TZ=America/Chicago jest --runInBand",
    "lint": "eslint server tests",
    "ensure-indexes": "node scripts/ensure-indexes.js"
  },
  "author": "CRHS Enterprises, LLC",
  "license": "UNLICENSED",
  "private": true,
  "dependencies": {
    "@crhs/web-core": "file:../crhs-web-core",
    "express": "^4.21.2",
    "cookie-parser": "^1.4.7"
  },
  "devDependencies": {
    "eslint": "^8.54.0",
    "jest": "^29.7.0",
    "mongodb-memory-server": "^10.1.4",
    "node-mocks-http": "^1.17.2",
    "supertest": "^6.3.3"
  },
  "engines": { "node": ">=18.0.0" }
}
```
(web-core brings helmet/cors/mongoose/nodemailer/mongodb/winston/express-*/connect-mongo/etc. transitively.)
- [ ] **Step 3:** `jest.config.js` (testEnvironment node, setupFilesAfterEnv tests/setup.js, testMatch tests/**/*.test.js, clearMocks). `tests/setup.js` = env (`ENCRYPTION_KEY`='a'*64, `JWT_SECRET`, `SESSION_SECRET`, `NODE_ENV`='test') + the mongodb-memory-server block (beforeAll create+connect mongoose / afterAll disconnect+stop / afterEach clear) — copy the exact block from `crhs-web-core/tests/setup.js`. `.gitignore` (node_modules, coverage, .env, *.log). `.eslintrc.js` — copy `crhs-web-core/.eslintrc.js` (it already has the tests override + src-strict rules; rename `src`→`server` scope). `LICENSE` — copy `SRC/LICENSE`. `README.md` — one paragraph + a "Deploy" stub filled in Task 8.
- [ ] **Step 4:** write the smoke test `tests/webcore.smoke.test.js`: `const wc=require('@crhs/web-core'); test('web-core resolves',()=>{expect(typeof wc.securityHeadersMiddleware).toBe('function'); expect(typeof wc.cspHelper.readHTMLWithNonce).toBe('function'); expect(Object.keys(wc).length).toBe(28);});`
- [ ] **Step 5:** `cd $DST && npm install && npm test` → PASS (proves the `file:` dep resolves + web-core loads).
- [ ] **Step 6:** commit `chore: scaffold crhs-corporate + wire @crhs/web-core (file: dep)`.

---

### Task 2: Copy the crhsent content tree

**Files:** Create `crhs-corporate/content/**` (copy of `SRC/crhsent/**`, 48 files); Test `tests/content-manifest.test.js`.
**Interfaces:** Produces `content/` = the crhsent site root (`index.html`, `about/`, `work/`, `capabilities/`, `contact/`, `owners/`, `wavemax/`, `assets/`, `robots.txt`, `sitemap.xml`, `404.html`).

- [ ] **Step 1:** write `tests/content-manifest.test.js` asserting the key files exist under `content/` (`index.html`, `wavemax/index.html`, `wavemax/security-audit.html`, `assets/css/site.css`, `robots.txt`, `sitemap.xml`) and that `content/index.html` is non-empty — run → FAIL.
- [ ] **Step 2:** `cp -R $SRC/crhsent/. $DST/content/` (byte-faithful; do NOT edit any file — crhsent content is verbatim). Remove `content/README.md` if it's the deploy-notes file (keep site content only) — or keep it; harmless.
- [ ] **Step 3:** run → PASS. Commit `feat: copy crhsent content tree into content/`.

---

### Task 3: crhsent host handler

**Files:** Create `server/crhsentHandler.js`; Test `tests/crhsentHandler.test.js`.
**Interfaces:** Produces `module.exports = function crhsentHandler(contentRoot)` → an Express middleware `(req,res,next)`. Consumes `webCore.cspHelper.readHTMLWithNonce`.

- [ ] **Step 1: failing test** — `tests/crhsentHandler.test.js` mounts a tiny express app: `app.use(webCore.cspNonce); app.use(crhsentHandler(path.join(__dirname,'../content')));`. Assert via supertest: `GET /` (Host crhsent.com) → 200 + `text/html` + the nonce injected into the served `content/index.html` + `Cache-Control: no-cache…`; `GET /work` → serves `content/work/index.html` (clean URL); `GET /assets/css/site.css` → 200 css; `GET /../etc/passwd` (encoded traversal) → 403; a request with `Host: other.com` → falls through to a `next()` sentinel (404). Run → FAIL (module missing).
- [ ] **Step 2:** port `SRC/server.js:583-606` into `crhsentHandler(contentRoot)`: same host guard (`host!=='crhsent.com'` → next), `decodeURIComponent(req.path)`, `path.normalize`+`path.join(contentRoot, rel)`, traversal guard against `contentRoot`, clean-URL → `index.html`, `.html` → `readHTMLWithNonce(full, res.locals.cspNonce)` + no-cache, else `res.sendFile`. Require `readHTMLWithNonce` from `@crhs/web-core` (`const { cspHelper } = require('@crhs/web-core')`).
- [ ] **Step 3:** run → PASS. Commit `feat: crhsent host handler (nonce-injected static serve)`.

---

### Task 4: Gate models

**Files:** Create `server/models/{AccessGate,AccessWhitelist,AccessClick,AccessRequest,MediatorAccess}.js`; Test `tests/models.test.js`.
**Interfaces:** Produces the 5 mongoose models (byte-faithful copies).

- [ ] **Step 1:** failing test `tests/models.test.js` (uses the mms from setup.js): `require` each model, create + read back one doc of each (asserting the schema's required fields round-trip), and assert `MediatorAccess`'s unique `passwordHash` index behavior if present. Run → FAIL.
- [ ] **Step 2:** `cp $SRC/server/models/{AccessGate,AccessWhitelist,AccessClick,AccessRequest,MediatorAccess}.js $DST/server/models/`. Rewire any `require('../utils/…')` to `@crhs/web-core` if present (most are plain mongoose; check each). Header comment rebrand.
- [ ] **Step 3:** run → PASS. Commit `feat: copy gate models (Access*, MediatorAccess)`.

---

### Task 5: accessGate middleware

**Files:** Create `server/middleware/accessGate.js`; Test `tests/accessGate.test.js`.
**Interfaces:** Produces the `accessGate` middleware with `.loadCache()` + `.startCacheRefresh()` attached (preserve the monorepo's export shape). Consumes web-core (`encryption.verifyPassword`, `logger`, `clientIp`, `email.transport.sendEmail`, `SystemConfig`) + local models.

- [ ] **Step 1:** port `SRC/tests/unit/accessGate.test.js` → `tests/accessGate.test.js`, rewiring imports (`../../server/middleware/accessGate` → `../server/middleware/accessGate`; any web-core-provided helper it stubs). Run → FAIL.
- [ ] **Step 2:** `cp $SRC/server/middleware/accessGate.js $DST/server/middleware/accessGate.js`; rewire requires: `../utils/encryption`→`@crhs/web-core` (`.encryption.verifyPassword`), `../utils/logger`→web-core, `../utils/clientIp`→web-core (`.clientIp`), `../services/email/transport`→web-core (`.email.transport.sendEmail`), `../models/SystemConfig`→web-core (`.SystemConfig`), `../models/Access*`→`../models/Access*` (local). Preserve `loadCache`/`startCacheRefresh`/the DARK gating. Rebrand header.
- [ ] **Step 3:** run → PASS (gated host 401 landing, correct password unlock cookie, whitelist bypass, admin bypass, DARK when disabled — whatever the ported suite asserts). Commit `feat: accessGate (crhsent host gate) wired to web-core`.

---

### Task 6: mediatorGate middleware

**Files:** Create `server/middleware/mediatorGate.js`; Test `tests/mediatorGate.test.js`.
**Interfaces:** Produces the `mediatorGate` middleware (crhsent.com/wavemax IP-binding gate). Consumes web-core (`logger`, `clientIp`, `ipGate`) + local `MediatorAccess`.

- [ ] **Step 1:** port `SRC/tests/unit/mediatorGate.test.js` → `tests/mediatorGate.test.js`, rewire imports. Run → FAIL.
- [ ] **Step 2:** `cp $SRC/server/middleware/mediatorGate.js $DST/server/middleware/mediatorGate.js`; rewire: `../utils/logger`/`../utils/clientIp`→web-core, `../models/MediatorAccess`→local. **Replace `require('./adminIpGate')`**: build the admin-IP check from `webCore.ipGate` (the factory) with the same `ADMIN_ALLOWLIST`/`STORE_IP_ADDRESS` inputs the monorepo's `adminIpGate` used — the mediatorGate only needs "is this request from an admin IP" to allow the reset/bypass path. Preserve the HMAC unlock-cookie logic + DARK gating (`MEDIATOR_GATE_ENABLED`). Rebrand header.
- [ ] **Step 3:** run → PASS (the 10 mediatorGate assertions: prompt/bind/deny/home-bypass/admin-reset, IPv6 cookie parse). If the ported test stubbed `adminIpGate`, update the stub to the web-core `ipGate`-based check. Commit `feat: mediatorGate wired to web-core ipGate (no service import)`.

---

### Task 7: `server.js` — compose the app

**Files:** Create `crhs-corporate/server.js`, `server/db.js`; Test `tests/server.integration.test.js`.
**Interfaces:** Produces the bootable app. Composes web-core middleware + gates + crhsentHandler.

- [ ] **Step 1: failing integration test** `tests/server.integration.test.js` — import the app (export `app` from server.js without `listen` when `require`d, listen only when run directly), drive with supertest + `Host: crhsent.com`: `GET /` → 200 crhsent home with a nonce; `GET /wavemax/` → served (gates DARK in test) with a **strict CSP header** (assert `content-security-policy` contains the nonce + `default-src 'self'` + NO `script-src 'unsafe-inline'`, and DOES allow `style-src 'unsafe-inline'`) — port the concrete assertions from `SRC/tests/integration/crhsentCsp.test.js`; `GET /health` → 200 `{status:'ok'}`; encoded path traversal → 403; `Host: other.com` `GET /` → not served by crhsent (404/next). Run → FAIL.
- [ ] **Step 2:** write `server/db.js` (mongoose connect from `MONGODB_URI`, guarded for test/already-connected) and `server.js`:
  - `const wc = require('@crhs/web-core')`; `app.set('trust proxy', 1)`.
  - `app.use(wc.cspNonce)`; CSP+headers: `app.use(wc.securityHeadersMiddleware())` and a middleware that sets `Content-Security-Policy` = `wc.serializeCspDirectives(wc.buildCspDirectives({ path:req.path, nonce:res.locals.cspNonce, useStrictCSP: wc.isStrictCspPath(req.path, {...}), isClickjackingDemo: req.path==='/wavemax/clickjacking-demo.html' }))` — mirror the monorepo's crhsent CSP application (the `/wavemax/*` path must resolve strict; pass the `strictCSPPages`/`isFranchiseHostPage`/`isDocumentationPage` inputs `isStrictCspPath` expects — for crhs-corporate, `/wavemax/*` is the franchise-host-like strict path).
  - `app.use(require('cors')(wc.corsConfig))`, `cookie-parser`, `express.json`/`urlencoded`, `wc.buildSessionMiddleware({ mongoUrl: process.env.MONGODB_URI, secret: process.env.SESSION_SECRET, ttlSeconds: 600 })`, `wc.sanitization.mongoSanitize()` + `wc.sanitization.sanitizeRequest`, `wc.rateLimiting` (apiLimiter on any `/__…` endpoints; crhsent is mostly static).
  - `app.get('/health', ...)`.
  - `app.use(accessGate)`, `app.use(mediatorGate)`, `app.use(crhsentHandler(path.join(__dirname,'content')))`.
  - `app.use(wc.errorHandler)`.
  - Boot (when run directly): connect DB → `accessGate.loadCache()` + `accessGate.startCacheRefresh()` → `app.listen(process.env.PORT||3001)`. Export `app` for tests.
- [ ] **Step 3:** run → PASS. Commit `feat: crhs-corporate server.js composed from web-core`.

---

### Task 8: Ops artifacts (ensure-indexes, PM2, deploy runbook)

**Files:** Create `scripts/ensure-indexes.js`, `ecosystem.config.js`, `.env.example`, `deploy/nginx-crhsent.conf`, and fill `README.md` Deploy section. Test `tests/ensure-indexes.test.js` (light).

- [ ] **Step 1:** `scripts/ensure-indexes.js` — connect, `createIndexes()` for the 5 gate models (mirror the monorepo's ensure-indexes pattern for MediatorAccess + Access*). Test: run it against mms, assert the indexes exist (or that it completes without error). Run → FAIL → implement → PASS.
- [ ] **Step 2 (no test — config):** `ecosystem.config.js` = `{ apps:[{ name:'crhs-corporate', script:'server.js', instances:2, exec_mode:'cluster', autorestart:true, max_memory_restart:'512M', env:{ NODE_ENV:'production', PORT:3001 } }] }`. `.env.example` = the §6 secret list (MONGODB_URI, SESSION_SECRET, JWT_SECRET, ENCRYPTION_KEY, EMAIL_*, ACCESS_GATE_*, MEDIATOR_GATE_ENABLED, ADMIN_ALLOWLIST, STORE_IP_ADDRESS, CORPORATE_SITE_URL, PORT=3001). `deploy/nginx-crhsent.conf` = a `server { server_name crhsent.com; … proxy_pass http://127.0.0.1:3001; }` block mirroring the existing proxy headers (X-Forwarded-*, Host, upgrade). `README.md` Deploy = the runbook: (1) clone `crhs-web-core` to `/var/www/crhs-web-core` at tag `v0.1.0` via the read-only deploy key; (2) clone `crhs-corporate` to `/var/www/crhs-corporate`; (3) `npm install` (resolves `file:../crhs-web-core`); (4) `.env`; (5) `pm2 start ecosystem.config.js`; (6) verify `curl -H 'Host: crhsent.com' localhost:3001/`; (7) add the nginx block + reload; (8) rollback = nginx `crhsent.com→:3000` + reload.
- [ ] **Step 3:** commit `feat: ops artifacts — ensure-indexes, PM2, nginx, deploy runbook`.

---

### Task 9: Full-app parity + final wiring check

**Files:** Test `tests/crhsent-parity.test.js`.
**Interfaces:** Consumes the assembled app; no new production code (fix wiring if the parity test finds drift).

- [ ] **Step 1:** `tests/crhsent-parity.test.js` — for a representative set of crhsent pages (`/`, `/work`, `/wavemax/`, `/wavemax/security-audit.html`), assert crhs-corporate serves HTML byte-identical (after stripping the per-request nonce) to `webCore.cspHelper.readHTMLWithNonce($SRC/crhsent/<same file>, nonce)` with the nonce normalized — i.e. the corporate app's served bytes equal the monorepo source rendered through the same helper. Run → PASS (or FIX wiring in the handler until parity holds).
- [ ] **Step 2:** confirm the monorepo is untouched: `git -C $SRC status --porcelain` shows only the 2 pre-existing PNGs. Full suite green, `npm run lint` exit 0.
- [ ] **Step 3:** commit `test: crhsent parity + final wiring verification`. Tag `v0.1.0` locally (annotated). Do NOT push/deploy — the GitHub repo + deploy-key + nginx cutover are user-authorized ops steps handled after the build.

---

## Self-Review

**Spec coverage:** §3 inventory → Tasks 2 (content), 3 (handler), 4 (models), 5 (accessGate), 6 (mediatorGate); §4 server composition → Task 7; §5 consumption → Task 1 (`file:` dep) + Task 8 runbook (deploy key/sibling checkout); §6 deployment → Task 8; §8 testing → ported tests in 3/5/6 + integration 7 + parity 9. Deferred items (§11) correctly absent. **Gate coverage (spec §3.E):** accessGate (T5) + mediatorGate (T6) each ported with allow+deny; models (T4); mediatorGate's adminIpGate cross-import rebuilt on `webCore.ipGate` (T6).

**Placeholder scan:** no TBD/TODO. Copy tasks cite exact source paths (the code exists in `SRC`); test-porting cites the exact monorepo test to adapt.

**Type consistency:** `crhsentHandler(contentRoot)` factory used in T3 test + T7 server; `accessGate.loadCache/startCacheRefresh` produced in T5, consumed in T7 boot; web-core keys used (`cspNonce`, `securityHeadersMiddleware`, `buildCspDirectives`, `serializeCspDirectives`, `isStrictCspPath`, `corsConfig`, `buildSessionMiddleware`, `sanitization`, `rateLimiting`, `errorHandler`, `cspHelper`, `encryption`, `email`, `SystemConfig`, `ipGate`, `logger`, `clientIp`) all exist in the 28-key surface.

**Risk flagged:** the `isStrictCspPath` inputs for the `/wavemax/*` strict path (T7) must reproduce the monorepo's `isFranchiseHostPage`/`strictCSPPages` decision for crhsent — the integration test (T7) ported from `crhsentCsp.test.js` is the guard.
