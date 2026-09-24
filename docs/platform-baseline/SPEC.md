<!-- Generated from a multi-agent analysis of wavemax-affiliate-program (2026-06-20).
     Decisions applied: sellable/OSS starter · full commercial-grade scope ·
     Docker-first + PM2/nginx · Oracle ADB first-class. See README.md + ADDENDUM. -->

---

# SPECIFICATION — `platform-baseline`
## A content-free, white-label full-stack starter for rapid customer rollouts

**Status:** Design / extraction spec
**Source:** Extracted from `wavemax-affiliate-program` (Node/Express + MongoDB SPA)
**Audience:** Senior engineering team executing the extraction
**Stack target:** Node.js 20+ · Express 4.x · MongoDB 7+ (Mongoose) · Vanilla-JS CSP-strict SPA · Jest/Supertest/Playwright · PM2 + Cloudflare LB

---

## 1. Vision & positioning

`platform-baseline` is a **commercial-quality, security-hardened, SEO-100 full-stack starter** that a team can clone to stand up a new customer web app or marketing/web-app hybrid in days, not weeks. It carries forward every piece of production infrastructure that *any* app needs — and that the WaveMAX codebase already paid the cost to harden through real security audits (`APP-002…APP-013`, `prod-lockdown-2026-05-20`, `H-5/H-6/H-7`) and real production incidents (session-store bloat 2026-05-25, Oracle ADB cursor bug, mail TLS servername). It strips **all** laundry-affiliate business domain and **all** WaveMAX/CRHS marketing content.

The differentiator vs. a generic Express boilerplate:

- **Audit-proven security baseline** — nonce-based strict CSP, double-submit CSRF, MongoDB-backed distributed rate limiting, AES-256-GCM field encryption, PBKDF2 auth, IP gates with fail-closed semantics, algorithm-pinned JWT.
- **Lighthouse-100 release gate** baked into docs, tests, and the build pipeline.
- **Four-language i18n with an enforced parity gate** (`npm run check:i18n` fails CI on key drift).
- **A theming/content model** so brand, copy, palette, locales, pages, and Schema.org/SEO are config-driven — never hardcoded.
- **HA-ready deploy topology** (dual-AZ active-active, leader-gated background jobs, sticky LB affinity) documented and templated.

Positioning statement: *"Clone, theme, plug in your domain modules, ship — with a security and quality posture that normally takes a senior team a quarter to build."*

What "content-free" means concretely: a fresh clone boots, serves a generic themed landing + login + admin shell, passes its own test suite green, scores ~100 on Lighthouse, and contains **zero** references to laundry, affiliates, bags, orders, commissions, or any WaveMAX/CRHS/Austin string.

---

## 2. Architecture overview

### 2.1 Request path (carried over verbatim, parameterized)

```
Parent site (optional iframe host)
   └─ Cloudflare (proxied DNS, LB round-robin, __cflb affinity, /health monitor)
        └─ Nginx reverse proxy  (→ localhost:3000)   [template, not in repo today — must be captured]
             └─ Node/Express (PM2 cluster)
                   Routes → Middleware → Controllers → Services → Models (Mongoose)
                        └─ MongoDB (Atlas / self-host / Oracle ADB)
```

Express middleware order is load-bearing and must be preserved exactly (it encodes the security audit findings):

```
trust proxy(1)
 → token-redaction logger        (strips ?t=/?k= before debug log)
 → /health (BEFORE session)      (LB probes must not create sessions — 2026-05-25 fix)
 → cspNonce                      (res.locals.cspNonce, before helmet)
 → helmet + manual CSP           (per-request nonce, HSTS, frame-ancestors)
 → CORS                          (explicit allowlist, reject null-origin — H-7)
 → compression
 → mongoSanitize + sanitizeRequest
 → cookie-parser + express-session (connect-mongo store)
 → access/coming-soon/quarantine gates (host-scoped, dark by default)
 → static (/assets immutable, HTML short-TTL)
 → API routers (rate-limited, CSRF where applicable)
 → 404
 → errorHandler                  (LAST; headersSent guard)
```

### 2.2 Layers

| Layer | Directory | Responsibility |
|---|---|---|
| Bootstrap | `server.js` (to be split) | App assembly, middleware ordering, DB connect, startup hooks |
| Config | `server/config/` | CSRF policy, IP allowlists, theme/site config, SEO overrides |
| Middleware | `server/middleware/` | Security, auth, gates, rate limit, sanitization, error handling |
| Routes | `server/routes/` | HTTP surface, versioning, validation |
| Controllers | `server/controllers/` | Request/response, `asyncWrapper`, `ControllerHelpers` |
| Services | `server/services/` | Business/platform logic (email engine, auth tokens, config) |
| Models | `server/models/` | Mongoose schemas |
| Utils | `server/utils/` | Encryption, logging, audit, CSP helper, security utils |
| Frontend | `public/` | SPA shell, shared JS utilities, locales, theme assets |
| Domain (pluggable) | `server/modules/<domain>/` | **Customer-supplied** — see §6 |

### 2.3 The iframe-SPA vs. standalone-app decision — **RECOMMENDATION**

The source app is an **iframe-embedded SPA** (`embed-app-v2.html` + `embed-app-v2.js` router, `parent-iframe-bridge-v3.js` / `iframe-bridge-v2.js` postMessage protocol, height auto-resize, origin allowlist). This exists because WaveMAX embeds inside a WordPress parent (`www.wavemaxlaundry.com`). That is a *deployment constraint*, not an architectural requirement.

**Recommendation: ship the SPA as standalone-first, iframe-embeddable as an opt-in mode.**

Rationale, grounded in the code:
- The router (`getRouteFromUrl`, `loadPage`, `navigateTo`, history management, script/style dedup) is fully usable standalone — the iframe is just one consumer.
- The iframe bridge couples to hardcoded parent origins (`wavemaxlaundry.com`, `rundberglaundry.com`) and a `location-data`/franchise message type that is domain-specific. Keeping it always-on imports that coupling.
- CSP `frame-ancestors` is currently `'self' + wavemaxlaundry.com`; standalone-first means the baseline default is `frame-ancestors 'self'`, with embedding domains added via config.

Concretely: the SPA router, session manager, modal/spinner, API client, CSRF utils, i18n, and CSP-nonce handling are **platform-core** and ship in both modes. The bridge ships as an **optional module** activated by `EMBED_MODE=true` + an `EMBED_PARENT_ORIGINS` allowlist. A clone defaults to standalone (`embed-app.html` served at `/`), and a customer who needs WordPress embedding flips the flag and lists parent origins — no code edits.

---

## 3. Component catalog

Every component below is carried over. Classification: **[core]** keep ~as-is, **[generalize]** keep but parameterize. Domain/content items are *not* in this catalog — they're §6/§4.

### 3.1 Security

| Component | Files | Class | What it provides / how generalized |
|---|---|---|---|
| Helmet + manual CSP | `server.js` (helmet block + CSP builder) | [generalize] | HSTS (1y, preload), Referrer-Policy `strict-origin-when-cross-origin`, Permissions-Policy (mic/cam/geo off), frame-ancestors, COOP, Clear-Site-Data on logout, per-route strict-vs-relaxed CSP. **Generalize:** all allowed-host / third-party origins (`*.wavemaxlaundry.com`, Firebase, Maps, Facebook pixel, Matterport, OSM, local-marketing-reports) move to `server/config/csp.js` — a baseline default (`'self'` + jsDelivr) plus a per-deployment additive allowlist by directive (`script-src`, `connect-src`, `img-src`, `frame-src`, `frame-ancestors`). |
| CSP nonce | `server/middleware/cspNonce.js`, `server/utils/cspHelper.js` | [core] | `crypto.randomBytes(16)` per request → `res.locals.cspNonce` + `req.cspNonce`; `injectNonce`/`readHTMLWithNonce` regex-inject into `<script>/<style>/<link>` + `<meta name=csp-nonce>`. Zero domain coupling — ship verbatim (rename header comment). |
| CSRF (double-submit) | `server/config/csrf-config.js`, `public/assets/js/csrf-utils.js` | [generalize] | `csrf-csrf` HMAC double-submit; `__Host-x-csrf` (prod) / `x-csrf` (dev); secret fallback `CSRF_SECRET→SESSION_SECRET→JWT_SECRET`; `shouldEnforceCsrf` classification (public/auth/registration skip, critical enforce); `/api/csrf-token` endpoint; client util with caching + retry-on-403. **Generalize:** `PUBLIC_ENDPOINTS`/`AUTH_ENDPOINTS`/`CRITICAL_ENDPOINTS` arrays (hardcode `/api/v1/affiliates`, `/bags`, `/orders`, `/scan`…) → config-driven allowlist arrays passed at init. |
| Input sanitization | `server/middleware/sanitization.js` | [core] | `express-mongo-sanitize` (NoSQL `$`/`.` strip) + `xss` recursive escape of body/query/params; typed sanitizers (email/phone/id/path). **Generalize:** drop `'wavemax'` from any inline lists. |
| Encryption | `server/utils/encryption.js` | [core] | AES-256-GCM (`{iv,encryptedData,authTag}`), per-call random IV; PBKDF2-SHA512 100k; `randomBytes` tokens; `timingSafeEqual`; `encryptField`/`decryptField`. Key from `ENCRYPTION_KEY`. Pure crypto — ship verbatim. |
| Security utils | `server/utils/securityUtils.js` | [core] | `escapeRegex` (ReDoS), `validateSortField` (whitelist), `sanitizeObjectId` (24-hex). Ship verbatim. |
| Password validator | `server/utils/passwordValidator.js` | [generalize] | 8+ char policy (upper/lower/digit/special), common-password blacklist, no-username/email-substring, no sequential/repeated, history check, 0–5 strength. **Generalize:** remove `'wavemax'`/`'laundry'` from `commonPasswords`. |
| Audit logger | `server/utils/auditLogger.js` | [generalize] | Winston `audit.log` (10MB/30d) + `security-critical.log` (90d), structured JSON, `logAuditEvent`/`logLoginAttempt`. **Generalize:** keep platform `AuditEvents` (`LOGIN_*`, `PASSWORD_RESET_*`, `ACCOUNT_*`, `UNAUTHORIZED_ACCESS`, `PERMISSION_DENIED`, `CSRF_VALIDATION_FAILED`, `RATE_LIMIT_EXCEEDED`); strip domain events (`BAG_*`, `ORDER_*`, `AFFILIATE_*`, `OPERATOR_SCAN`, `COMMISSION_*`). Domain events register via an extensible `AuditEvents` registry. |
| Error handler | `server/middleware/errorHandler.js` | [core] | Single last-middleware; maps 20+ error classes (Mongoose ValidationError/dup-key, JWT, Multer) → status; `headersSent` guard; logger wrapped in try/catch; no stack leak in prod. **Note (risk fix):** add an `Accept`-aware branch so non-API routes get HTML, not JSON. **Generalize:** error log extracts a generic `req.user.id`, not role-specific IDs. |
| Security regression tests | `tests/integration/securityHeaders.test.js`, `crhsentCsp.test.js`, `tests/unit/encryption*.test.js`, `csrfConfig.test.js` | [core] | Locks in headers/CSP/nonce/path-traversal as a baseline. Keep; swap WaveMAX paths for generic fixtures. |

### 3.2 Auth / RBAC

| Component | Files | Class | Provides / generalization |
|---|---|---|---|
| Access-token service | `server/services/authTokenService.js` | [generalize] | JWT HS256 (pinned, APP-008), issuer/audience claims, refresh rotation via `RefreshToken`, `MODEL_BY_USER_TYPE` polymorphic lookup. **Generalize:** `wavemax-api`/`wavemax-client` issuer/audience → env; `MODEL_BY_USER_TYPE` and `roleIdField()` injected from a **user-type registry** (see §6). |
| Auth middleware | `server/middleware/auth.js` | [generalize] | Bearer + `x-auth-token`, HS256-pinned verify, `TokenBlacklist` check per request, `requirePasswordChange` gating. **Generalize:** populate `req.user` with `{ id, role }` only; role→ID-field mapping via registry (not hardcoded `affiliateId/customerId/...`). |
| RBAC | `server/middleware/rbac.js` | [generalize] | `checkRole`/`checkAllRoles`/`checkResourceOwnership`, permission checks with `'all'` super-perm, dot-notation field filtering, `blockedByAdminIp` authz backstop. **Generalize:** `roleHierarchy`/`allowedRoles`/permission enum are WaveMAX-specific → a **role registry** loaded at init (`server/config/roles.js`). Baseline ships only `admin > administrator` + a `staff` role; customers add roles in config. `checkOperatorStatus` → generic `checkRoleStatus(callback)`. |
| Token models | `server/models/RefreshToken.js`, `TokenBlacklist.js` | [core] | Rotation (`replacedByToken`), revocation (ip/timestamp), TTL auto-cleanup. **Generalize:** `userType` enum → free string. |
| Login controllers | `server/controllers/authController.js` | [generalize] | Account lockout (5 attempts / 2h), constant-time secret checks, audit + IP, refresh/blacklist integration, rate limiters. **Generalize (critical):** three bespoke flows (affiliate/username, admin/email, operator/PIN) → **one polymorphic `login(userType, credentials)`** dispatching to pluggable strategies. Baseline ships `email+password`; PIN/username strategies are opt-in plugins. |
| Auth routes | `server/routes/authRoutes.js` | [generalize] | `/login`, `/forgot-password`, `/reset-password`, `/verify`, `/refresh-token`, `/logout`; express-validator; per-route limiters + IP gate. **Generalize:** parameterized userType; drop removed `customer`. |
| Password reset service | `server/services/passwordResetService.js` | [generalize] | Unified flow, SHA-256 token-at-rest, 1h TTL, user-enumeration-safe silent miss (APP-013). **Generalize:** `USER_TYPES`/`MODEL_BY_USER_TYPE`/`RESET_EMAIL_SENDERS` from registry; email sender is a pluggable callback. |
| Phone auth (Firebase) | `server/services/firebasePhoneService.js`, `server/routes/firebaseConfigRoute.js` | [core/optional] | Lazy-init Firebase Admin (only if `PHONE_VERIFICATION_ENABLED`), `verifyPhoneToken`, public config route. Generic 3rd-party integration — ship as **optional module**, off by default; validate service-account path at boot when enabled. |
| Admin model (auth scaffold) | `server/models/Administrator.js` | [generalize] | `setPassword/verifyPassword`, password history (5), lockout, permissions methods, reset-token flow, indexes. **Generalize:** permission enum values → role registry; keep the auth mechanics as the **base user schema**. |

> **Architectural directive:** extract a **base `User` auth schema** (id, name, email, role-immutable, salt/hash, isActive, lastLogin, loginAttempts, lockUntil, passwordHistory, reset token) from `Administrator`. Domain user types extend it. This resolves the "user-model explosion" and the painful Customer-removal the source app already lived through.

### 3.3 Access gates & rate limiting

| Component | Files | Class | Provides / generalization |
|---|---|---|---|
| Rate limiting | `server/middleware/rateLimiting.js` | [generalize] | Named limiters (auth 5/15m, password-reset 3/h, registration, api, file-upload, sensitive, contact-form) + `createCustomLimiter` factory; `RELAX_RATE_LIMITING` (3–10×) with **prod safety check** (loud stderr if on in prod, APP-007); `skipInTest`. **Generalize:** thresholds from env; drop the Anthropic-concierge limiter (deployment-specific). |
| Mongo rate-limit store | `server/middleware/rateLimitMongoStore.js` | [core] | Cluster-wide counters per `ratelimit_<name>` collection (replaces vulnerable `rate-limit-mongo`); `validate.singleCount:false`. Pure infra — ship verbatim. Document the maintain-vs-package trade-off. |
| Admin IP gate | `server/middleware/adminIpGate.js`, `server/config/storeIPs.js` | [core] | CF-aware client IP (`cf-connecting-ip`), `ADMIN_ALLOWLIST` (+ fallback chain), CIDR v4/v6 (`::` compression), **fail-closed in prod**, stealth 404, env read at call time, path normalization. Ship as-is; only generalize the gated *path* (`ADMIN_PATH`, default `/admin`). |
| Operator/generic IP gate | `server/middleware/operatorIpGate.js` | [generalize] | Twin of admin gate, narrower scope. Ship as a **parameterized role-X gate factory** (`makeIpGate({ allowlistEnvVars, gateTestEnv, label })`) so any role-scoped surface reuses it. |
| Access gate (password content) | **now in `crhs-corporate`** (Plan 3 task 45 moved the models and seed scripts out of this repo): `server/middleware/accessGate.js`, `models/AccessGate|Whitelist|Request|Click.js`, `scripts/seed-access-gate.js` | [generalize] | Double-opt-in magic-link unlock (defeats mail-scanner prefetch: GET checks, POST confirms), PBKDF2 password, IP whitelist persisted across sessions, cluster cache + 60s refresh, per-IP send throttle, runtime toggle via `SystemConfig`, click logging. **Generalize:** `GATED_HOSTS`, `GATE_FROM`, link domain, branded HTML/CSS → config + theme templates; exempt paths configurable. Excellent generic content-gating primitive. |
| Coming-soon gate | `server/middleware/comingSoon.js` | [generalize] | Single noindex holding page to all non-whitelisted visitors (no cloaking), store-IP bypass, host-scoped, exempt paths. **Generalize:** `COMING_SOON_HOSTS` + the page body → config/theme template. |
| Location quarantine | `server/middleware/locationQuarantine.js`, `server/config/quarantineConfig.js` | [generalize] | Restrict app to an allowlist of paths; 302 to a corporate URL with path preserved; suspicious-path strip (`.env`,`.git`,`wp-admin`,`.php` → redirect to root, M-13); store bypass; host-scoped self-404. **Generalize:** allowlist patterns + `CORPORATE_SITE_URL` + location-slug regex → config. The suspicious-path filter is universal — keep. |
| Explorer/preview token guard | `server/middleware/explorerGuard.js`, `expediterGuard.js` | [generalize] | Token gate via `?k=`→cookie promotion for static sub-resources, percent-decoded path match, scoped CSP, no-store. **Generalize:** path prefix + cookie name + CSP frame/img lists → config. Reusable "gate a private static tool" pattern. |
| Self-serve preview | `server/middleware/franchisePreview.js`, `models/FranchisePreviewRequest.js` | [domain-ish/optional] | The *mechanism* (Turnstile + attestation + emailed one-time password + 1h signed unlock cookie, per-IP throttles) is reusable; the GBP/franchise specifics are domain. Ship the **unlock-flow primitive** stripped of GBP; the franchise glue stays out. |

### 3.4 SPA frontend + build

| Component | Files | Class | Provides / generalization |
|---|---|---|---|
| Router / page loader | `public/embed-app-v2.html`, `assets/js/embed-app-v2.js` (+ `.min`) | [generalize] | Route→page-template map, fetch+inject HTML, sequential CSP-nonce script injection, height observer + postMessage resize, history (pushState/popstate), query preservation, per-page cleanup (observers/intervals), dedup. **Generalize:** `EMBED_PAGES` map → externally-loaded route registry (`/config/routes.json`); `pageScripts` map → dynamic/plugin loader; remove hardcoded user-types and login-redirect logic → hook-based; rename to `app-shell.*`. |
| Session manager | `public/assets/js/session-manager.js` | [generalize] | Multi-role token storage, activity tracking, inactivity timeout, route-by-auth-state. **Generalize:** role names + `PROTECTED_ROUTES`/`LOGIN_ROUTES` + localStorage key scheme + timeout from config. |
| Modal system | `assets/js/modal-utils.js`, `css/modal-utils.css` | [core] | Promise-based confirm, templates, a11y focus, backdrop/ESC. Ship verbatim. |
| Spinner | `assets/js/swirl-spinner.js`, `css/swirl-spinner.css` | [core] | SVG loader, overlay/button/form helpers. Ship verbatim (colors → theme vars). |
| API client | `assets/js/api-client.js` | [core] | Fetch wrapper, auto-CSRF header, error handling, upload, polling w/ backoff, batch, retry. Ship verbatim. |
| CSRF client util | `assets/js/csrf-utils.js` | [core] | Token fetch/cache/inject/retry; respects `EMBED_CONFIG.baseUrl`. Ship verbatim. |
| Error handler (client) | `assets/js/errorHandler.js` | [core] | Modal-or-toast notifications. Ship verbatim. |
| Embed config | `assets/js/embed-config.js` | [core] | `baseUrl`, `isEmbedded`, postMessage helpers. Rename `EMBED_CONFIG`→`APP_CONFIG`. |
| Iframe bridges (optional) | `assets/js/iframe-bridge-v2.js`, `parent-iframe-bridge-v3.js` (+ `.min`) | [generalize/optional] | postMessage protocol (ready/resize/language/navigation/SEO), origin allowlist. Ship **only when `EMBED_MODE=true`**; `EMBED_PARENT_ORIGINS` from config; drop `location-data` franchise structure. |
| Build pipeline | `scripts/build-assets.js`, `npm run build:assets` | [core] | Terser (JS) + CSSO (CSS) → `.min` siblings w/ GENERATED banner. **Generalize:** `ASSETS` array → `assets-config.json`; add `scripts/inject-cache-busters.js` to stamp `?v=<BUILD_VERSION>` automatically (replaces hand-bumped stamps). |
| Cache strategy | `server.js` static block | [core] | `/assets` `max-age=31536000, immutable` (query-string cache-bust) + HTML `max-age=60` + no-store for admin/auth. Ship as-is. |
| Build/cache tests | `tests/integration/assetCaching.test.js`, `tests/unit/cspHelper.test.js` | [core] | Lock the delivery contract. Keep; config-drive asset paths. |

### 3.5 Internationalization

| Component | Files | Class | Provides / generalization |
|---|---|---|---|
| i18n engine | `public/assets/js/i18n.js` | [core] | Lang detect (localStorage→URL→browser→default), load `/locales/{lang}/common.json`, `data-i18n`/`-placeholder`/`-attr`/`-title` markers, `{{param}}` interpolation, `MutationObserver` for dynamic content, `Intl` currency/date. **Generalize:** `storageKey 'wavemax-language'`→`app-language`; remove hardcoded hostname check; `supportedLanguages` from config. |
| Language switcher | `assets/js/language-switcher.js`, `css/language-switcher.css` | [core] | Dropdown/flag UI, a11y, localStorage, iframe-aware skip. Ship; flag list configurable. |
| Parity checker | `scripts/check-i18n-parity.js` | [generalize/dev-ops] | Enforces: identical key sets across `en/es/pt/de`; `REQUIRED_KEYS` present in `en`; `REQUIRED_PREFIXES` non-empty; required email templates resolve per-lang; `[PLACEHOLDER]` token parity. **Generalize:** strip the WaveMAX `REQUIRED_KEYS` inventory (claim/bag/operator/affiliate) → generic `common.*`/`auth.*`/`validation.*`/`errors.*` set; `REQUIRED_EMAIL_TEMPLATES` → generic (`welcome`,`password-reset`,`invite`,`notification`). **Wire into CI** (it currently isn't). |
| DOM markers | `public/*.html` | [core] | Marker syntax is the i18n contract — carries over to all generated pages. |
| Locale serving | `server.js` `/locales` static + CORS allowlist | [core] | No-cache locale fetch; cross-origin allowlist for embedded loading. |

### 3.6 Email engine

| Component | Files | Class | Provides / generalization |
|---|---|---|---|
| Transport | `server/services/email/transport.js` | [core] | Nodemailer wrapper; console transport in dev; SMTP via env; **TLS servername override for IP-based connections** (the prod-fix for the cert-mismatch OTP outage). **Generalize:** default From/domain/servername → config. |
| Template manager | `server/services/email/template-manager.js` | [core] | `loadTemplate(name, lang)` with English fallback, `fillTemplate` `[KEY]` replacement, `TEMPLATE_ROOT`. **Generalize:** move `formatTimeSlot`/`formatSize` (domain enum formatters) to a registry; replace WaveMAX-branded `FALLBACK_TEMPLATE` with a neutral `[COMPANY_NAME]`/`[LOGO_URL]` container. |
| Dispatcher aggregator | `server/services/email/dispatcher/index.js` + `utils/emailService.js` shim | [generalize] | Re-export pattern; back-compat `sendEmail`/`formatSize`. Becomes a thin platform aggregator once domain dispatchers are removed. |
| Onboarding invite | `dispatcher/onboarding.js` | [generalize] | Single-use invite (token→URL, expiry, i18n) — generic invite pattern. Rename `affiliate`→`user`/`partner`; subject + `SUBJECTS` dict → content layer. **Keep** as platform. |
| Ops alerting | `dispatcher/ops.js` | [generalize] | Service-down alert (name/error/stats). **Keep** as platform; URLs/from → env; move inline HTML to a template. |
| Admin/Affiliate/Customer/Operator dispatchers | `dispatcher/{admin,affiliate,customer,operator}.js` | [strip→template] | The welcome/reset/notification *pattern* is reusable; the bodies are domain. **Replace** with a generic role-based template set (`<role>-welcome`, `user-invite`, `<entity>-status`) driven by the content layer; externalize all inline `en/es/pt/de` translations. |

> **Email model directive:** dispatchers must accept **abstract data bags**, not Mongoose model instances, and resolve copy from the content/i18n layer — not inline. `sendAdminNotification`'s `SystemConfig` dependency for the admin address becomes a config/env value.

### 3.7 Data / config

| Component | Files | Class | Provides / generalization |
|---|---|---|---|
| Mongo connection + resilience | `server.js` connect block, `utils/mongoCursorRetry.js`, `utils/mongoOracleDiagnostics.js` | [core] | `autoIndex:false`, `maxPoolSize:5`/`minPoolSize:2`, TLS enforcement, graceful exit. Oracle ADB cursor-retry shim + diagnostics. **Generalize:** pool sizes → env; gate Oracle shim behind `ORACLE_BACKEND`/`ORACLE_DIAG` (off by default for Atlas/self-host). |
| SystemConfig | `server/models/SystemConfig.js`, `services/systemConfigService.js` | [generalize] | Runtime KV config: `key`/`value`/`dataType`/`validation(min/max/regex/allowedValues)`/`isPublic`/`category`, pre-save validation, `getValue`/`setValue`/`getByCategory`/`getPublicConfigs`/`initializeDefaults` (upsert), audit on change. **Generalize (critical):** `initializeDefaults` ships **empty** (`defaultConfigs = []`); strip all ~40 laundry keys. `category` enum → generic (`core`,`feature`,`operational`,`security`). Domain seeds register via a hook. |
| Base User / Admin scaffold | `server/models/Administrator.js` | [generalize] | See §3.2 — extract base auth schema. |
| Token models | `RefreshToken.js`, `TokenBlacklist.js` | [core] | Ship as-is (free-string userType). |
| Access models | `AccessGate/Request/Whitelist/Click.js` | [generalize] | Generic content-gate primitives — keep with §3.3. |
| Invite lifecycle | `server/modules/onboarding/AffiliateInvite.js` | [generalize] | `tokenHash` (raw never stored), status enum, expiry, `createdBy`, single-use atomic `consume()`, prefill hints. **Generalize:** rename to `Invite`; `acceptedAffiliateId`→`acceptedResourceId`. Excellent generic invite-onboarding model. |
| Durable-token QR pattern | `server/modules/bags/Bag.js` | [pattern/optional] | `tokenHash` HMAC unique key, status FSM, atomic `claim()` lost-update safety, `hashToken` w/ `ENCRYPTION_KEY`. **Keep the pattern** as an optional `TrackedAsset` example for any physical QR good; strip laundry fields. |
| Index management | `scripts/ensure-indexes.js` | [generalize] | Explicit per-model `createIndexes()`, no `syncIndexes` (non-destructive), Oracle-compat notes, diagnostic flags. **Generalize:** auto-discover `server/models/*.js` + registered domain models instead of a hardcoded `MODELS` list. |
| Init / setup scripts | `init-defaults.js`, `scripts/setup/{init-defaults,init-admin,setup-database}.js` | [generalize] | Idempotent (count→create-once), `setPassword`, `requirePasswordChange`. **Critical security fix:** remove the hardcoded `admin@wavemaxlaundry.com` / `WaveMAX!2024` / `Operator!2024` defaults. Replace with an interactive/`--prompt` admin-setup that requires a strong password and forces change-on-first-login. No factory credentials ship in the repo. |

### 3.8 Admin shell

| Component | Files | Class | Provides / generalization |
|---|---|---|---|
| Admin auth + RBAC | `models/Administrator.js`, `controllers/administratorController.js`, `services/administratorAccountService.js`, `routes/administratorRoutes.js` | [core] | Admin CRUD, password mgmt, permission listing, RBAC gate, validators, audit, lockout. Domain-agnostic. **Generalize:** permission names → role registry; remove domain routes (`/affiliates`,`/addons`,`/analytics/*`). |
| Admin SPA shell | `public/administrator-dashboard-embed.html`, `administrator-login-embed.html` | [generalize] | Tab system (`nav-tabs`/`data-tab`), modals, login form, password toggle, config form, CSRF/nonce hooks. **Generalize:** strip brand (`data-brand-*`); keep `Dashboard`/`Users`/`Config` tabs; remove `Affiliates`/`Customers`/`Orders`/Kiosk tabs; convert to a **tab registry** so domain modules register tabs at startup. |
| Admin init scripts | `assets/js/administrator-{login,dashboard}-init.js`, `-i18n.js` | [generalize] | Auth flow, token storage, modal/tab routing, escaping, logout. **Generalize:** decouple from domain analytics endpoints; tab activation from registry. |
| Clean-URL handler | `server.js` `/admin` route + `adminIpGate` | [core] | IP-gated clean URL, `window.__DEFAULT_ROUTE` injection, nonce, no-cache, path normalization (defense-in-depth). `ADMIN_PATH` configurable. |
| SystemConfig + Health surface | `models/SystemConfig.js`, `services/systemConfigService.js`, `systemHealthService.js` | [generalize] | Config CRUD w/ audit; env-var viewer (`ALLOWED_ENV_VARS` sanitized); rate-limit reset. **Generalize:** `ALLOWED_ENV_VARS` → config schema; remove domain config keys; config UI renders from a schema endpoint. |
| Staff management | `models/Operator.js`, admin operator endpoints, `services/operatorAdminService.js` | [generalize] | Generic staff CRUD: name/email/password/active/lockout/shift. **Generalize:** strip domain fields (`scanCode`,`qualityScore`,`totalOrdersProcessed`,`processingTime`); rename `Operator`→`Staff`/`SystemUser`. |
| Audit for admin actions | `utils/auditLogger.js` | [core] | Platform admin events kept; domain events move to domain modules. |
| Admin tests | `tests/unit/{administrator,adminIpGate}*.test.js`, `tests/integration/{administratorRoutes,adminCleanUrl}.test.js` | [dev-ops] | Keep RBAC/IP-gate/clean-URL/auth tests; drop add-ons/affiliate/order admin tests. |

> **Admin shell directive:** the analytics/dashboard tabs query domain models directly (`adminDashboardService`). Replace with a **schema-driven analytics seam** (`GET /api/v1/admin/analytics/:widget`) that domain modules populate, so the shell ships with a stub and never imports domain models.

### 3.9 Testing harness

| Component | Files | Class | Provides / generalization |
|---|---|---|---|
| Jest config | `jest.config.js` | [core] | node env, 80% thresholds, testMatch/ignore, 300s timeout, `maxWorkers:1`, custom sequencer, `@/` alias, setupFilesAfterEnv. Ship verbatim. |
| Test setup | `tests/setup.js`, `setup.isolated.js` | [generalize] | `mongodb-memory-server` fallback, lifecycle hooks, per-test cleanup, `SystemConfig.initializeDefaults()` seed, `TZ=America/Chicago` lock. **Generalize:** strip `wavemax_test`/`wavemax.promo` strings; remove domain-model seeding. |
| Sequencer | `tests/testSequencer.js` | [core] | unit→integration→e2e, by size. Ship verbatim. |
| Mock factories | `tests/helpers/mockHelpers.js` | [core] | Chainable Mongoose query mocks. Ship verbatim. |
| Test utils | `tests/helpers/testUtils.js` | [core] | `extractHandler`/`callControllerMethod` (asyncWrapper unwrap), mock req/res/next. Ship verbatim. |
| Auth/CSRF/password/response helpers | `tests/helpers/{authHelper,csrfHelper,testPasswords,responseHelpers}.js` | [core/generalize] | JWT signing, CSRF agent, strong/weak passwords, response assertions. **Generalize:** drop role-default `'affiliate'` and role-keyed password names → role-parameterized. |
| Data factories | `tests/testUtils.js`, `helpers/v2TestHelpers.js` | [strip→framework] | **Strip** `createTestAffiliate/Customer/Order`. Replace with a **generic factory builder**: `createTestEntity(Model, overrides)` — deterministic IDs, password hashing, cleanup tracking. |
| Platform-agnostic tests | `tests/unit/{encryption,authMiddleware,authController,csrfConfig,cspHelper,errorHandler,securityUtils,rateLimiting*,pagination,logger,validators,helpers}.test.js`; `tests/integration/{auth,assetCaching,crhsentCsp,securityHeaders,seoCrawlability,emailService,passwordValidation,accountLockout}.test.js` | [core] | Keep — these test the platform. |
| Domain tests + e2e | `tests/**/{affiliate,customer,order,operator,bags,scan,kiosk,franchise,addon}*`, `tests/e2e/austin-reference/*` | [strip→templates] | **Delete.** Provide skeleton templates: `GenericUserModel.test.js`, `GenericResourceCRUD.integration.test.js`, `AccessControl.integration.test.js`, `tests/e2e/template-reference/` (landing/form/asset/SEO stubs). |
| Runners + Playwright | `tests/runAllTests.sh`, `runMemoryOptimizedTests.sh`, `playwright.config.js`, `tests/e2e/static-server.js` | [dev-ops] | Keep patterns; `MONGODB_URI`/`baseURL` from env; drop lint-in-test-runner. |

### 3.10 Deploy / ops

| Component | Files | Class | Provides / generalization |
|---|---|---|---|
| PM2 | `ecosystem.config.js` | [core] | cluster `max`, autorestart, `max_memory_restart 1G`, prod env. **Generalize:** app name from env. |
| Health | `server.js` `/health` | [core] | Liveness (no DB), runs before session. Ship as-is. |
| Env contract | `.env.example` (166 lines) | [core/generalize] | **Generalize:** ship a minimal platform `.env.example` — `PORT`, `NODE_ENV`, `MONGODB_URI`, `MONGODB_TLS`, pool sizes, `JWT_SECRET`/`ENCRYPTION_KEY`/`SESSION_SECRET`/`CSRF_SECRET` (w/ `openssl rand -hex 32` comments), `TRUST_PROXY`, `COOKIE_SECURE`, `CORS_ORIGIN`, `ALLOWED_HOSTS`, `BASE_URL`, `LOG_LEVEL`/`LOG_DIR`, rate-limit vars, gate vars (`ADMIN_ALLOWLIST`, `STORE_IP_*`, `*_GATE_TEST`), email vars, `EMBED_MODE`/`EMBED_PARENT_ORIGINS`, `RUN_BACKGROUND_JOBS`. Strip all domain vars (Paygistix/Stripe/Firebase/GooglePlaces/Service-location/franchise tokens). |
| Logger | `server/utils/logger.js` | [core] | Winston error/combined split, levels, `LOG_LEVEL`/`LOG_DIR`. **Generalize:** service name from env (not `wavemax-affiliate`). |
| Monitoring | `server/monitoring/connectivity-monitor.js`, `routes/monitoringRoutes.js` | [generalize] | Pluggable service checks (Mongo/SMTP/HTTPS/DNS), retry/cooldown, `/status` dashboard, email alert. **Generalize:** service registry from env, not hardcoded names; wire real data into routes. |
| Background-job leader gating | `RUN_BACKGROUND_JOBS` env + startup wrap | [core] | Single-instance cron gating in active-active. Ship `maybeStartBackgroundJobs(env)` helper + test. Document Phase-1.5 distributed-lease upgrade (`findOneAndUpdate` on `expiresAt`, no TTL index for Oracle). |
| Index/heartbeat scripts | `scripts/ensure-indexes.js`, `adb-heartbeat.js`, `ops/clean-logs.sh` | [generalize] | Keep patterns; auto-discover models; gate Oracle/heartbeat specifics. |
| HA topology docs | `docs/ops/{OCI-PRIMARY-INSTALL,HA-PHASE1-WEB,HA-FAILOVER-PLAN}.md` | [generalize/dev-ops] | Dual-AZ active-active, CF LB (round-robin, sticky `__cflb` 1800s, `/health` monitor), stateless app + shared DB, deploy=git-pull-both + `pm2 reload`, smoke-before-LB, `.env` byte-identical relay. **Generalize:** strip IPs/hosts/Ultahost; **capture Nginx config as a repo template** (currently lives only on prod boxes). |
| HTTPS redirect + trust proxy | `server.js` | [core] | Prod HTTPS redirect with host-header allowlist (injection guard), `trust proxy 1`. **Generalize:** `ALLOWED_HOSTS`/`DEFAULT_REDIRECT_HOST` from env. |

### 3.11 SEO / quality

| Component | Files | Class | Provides / generalization |
|---|---|---|---|
| Lighthouse quality bar | `docs/development/LIGHTHOUSE-QUALITY-BAR.md` | [core/dev-ops] | The 100-across-4-categories release gate, measurement procedure (`?lh=` cache-buster), proof-of-deploy (`?v=` verification), per-category playbook. **Generalize:** strip domain/IPs/pm2; keep as the universal gate. |
| robots.txt / sitemap | `server.js` dynamic routes | [core] | **Origin-served** (not CF-injected) per-hostname `robots.txt` (valid directives, AI-crawler blocklist, sitemap pointer, *does not* block the SPA shell) + per-host `sitemap.xml` (canonicals only). The SEO-100 fix. **Generalize:** managed-host list + sitemap URL registry from config; keep `/api`,`/admin` disallow defaults. |
| SSR template engine | `server/controllers/franchiseController.js`, `public/franchise-host.html`, `routes/franchiseRoutes.js` | [generalize] | `{{PLACEHOLDER}}` substitution, per-request data injection (`window.LOCATION_DATA`), nonce, self-canonical, JSON-LD, OG/Twitter, `escapeHtml`/`escapeJsonForScript`. **The core SEO/theming machine.** **Generalize:** `PAGE_SEO_SPEC` (laundry pages) → a `pages` registry; brand/city/equipment strings → theme config; rename to `pageRenderer`/`page-host.html`. |
| Per-domain SEO overrides | `server/config/domainSeoOverrides.js` | [generalize] | Multi-domain self-canonical: per-host title/description/H1/keywords/`landingPath`/schema + shared FAQ pool w/ per-domain subset + `sameAs` cross-links; `stripWww`/`getOverride`/`getSameAs`/`getFaq`/`isManagedHost`. **The dedup hierarchy is universally true.** **Generalize:** all copy → runtime config/CMS; keep structure + helpers. |
| JSON-LD schema | `franchise-host.html`, `seo-config-*.js` | [generalize] | LocalBusiness/Service/WebSite+SearchAction/BreadcrumbList/Organization/FAQPage `@graph` with `@id` disambiguation, Speakable. **Generalize:** entity *type* configurable (not just LocalBusiness), all values → theme/SEO config. |
| OG/Twitter/geo/hreflang | `franchise-host.html`, page heads | [core] | Full OG (incl. business/place props), Twitter card, `geo.*`/`ICBM`, hreflang (`en-US`/`es`/`pt`/`de`/`x-default`). Structure ships; values from config. |
| Asset minification | `scripts/build-assets.js` | [core] | (see §3.4). |
| Perf caching | `server.js` static | [core] | (see §3.4). |
| SEO tests | `tests/integration/seoCrawlability.test.js` | [core] | robots doesn't block shell; blocks `/api`,`/admin`; sitemap valid + canonicals-only. Keep; fixture-parameterize hosts. |
| Analytics/CSP governance | `docs/deployment/franchise-tracking-setup.md`, CSP block | [core/dev-ops] | GA4/GTM/Search-Console (tags-before-JS), CSP additions per service, iframe-content `noindex`. Keep; analytics IDs/CSP allowlist from config. |

---

## 4. Content / theming model

The central design move: **all brand, copy, palette, pages, locales, and SEO/schema are config + theme, never code.** A clone is rebranded by editing config + theme files and replacing locale/template content — never by editing `server/` or shared `public/assets/js`.

### 4.1 Site / brand config — `server/config/site.config.js` (or `site.config.json`)

Single source of truth, read at startup and injected into SSR/templates/CSP:

```js
{
  brand: {
    name: "Acme Co",
    logoUrl: "/assets/theme/logo.svg",
    faviconBase: "/assets/theme/favicon",
    copyright: "© 2026 Acme Co. All rights reserved.",
    legalEntity: "Acme Co, LLC"
  },
  contact: { email, phone, address, city, state, postalCode, lat, lng, hours },
  domains: {
    managedHosts: ["acme.com", "www.acme.com"],
    corporateSiteUrl: "https://www.acme.com",
    allowedHosts: ["acme.com"],            // host-header allowlist
    embedParentOrigins: []                 // [] = standalone; non-empty enables iframe
  },
  i18n: { defaultLanguage: "en", supportedLanguages: ["en","es","pt","de"], fallback: "en" },
  features: { phoneVerification: false, accessGate: false, comingSoon: false, embedMode: false },
  analytics: { ga4MeasurementId: null, searchConsoleTag: null }
}
```

### 4.2 Theme — `public/assets/theme/`

- `theme.css` — CSS custom properties only: `--brand`, `--accent`, `--ink`, `--paper`, `--lead`, gray scale, status colors, font stack. All shared JS/CSS reference variables, never literal hex (today `wavemax-blue`/`#0c93ad`/`#0b1f43` are hardcoded — these become variables).
- `logo.svg`, `favicon.*` (the 7-size set), brand imagery.
- Spinner/modal/switcher colors resolve from theme vars.

### 4.3 Pages registry — `server/config/pages.js` + `public/content/site-pages.json`

Generalize `PAGE_SEO_SPEC` + `EMBED_PAGES` + `site-pages.json` into one registry:

```js
pages: [
  { key: "/",          template: "home",     seo: { service, h1, differentiator } },
  { key: "/about",     template: "standard", seo: {...} },
  { key: "/contact",   template: "contact",  seo: {...} }
]
```

Page *content* (hero, sections, FAQs, CTAs) lives in `site-pages.json` as structured data the SSR engine renders into `page-host.html` via `{{PLACEHOLDER}}` / `LOCATION_DATA`. No business copy in code or templates.

### 4.4 Locales — `public/locales/{en,es,pt,de}/common.json`

Baseline ships ~300 **generic** keys (`common.buttons.*`, `auth.login.*`, `validation.*`, `errors.*`, `nav.*`, `status.*`) instead of the 1,553 domain keys. `es/pt/de` start as `en` copies (untranslated values) so parity passes; customers translate. `corporate.json` is removed (or stubbed). The parity checker's `REQUIRED_KEYS` reflects the generic set and runs in CI.

### 4.5 Email templates — `server/templates/emails/{en,es,pt,de}/`

Generic set with `[PLACEHOLDER]` tokens + `[COMPANY_NAME]`/`[LOGO_URL]`/`[BRAND_COLOR]`: `welcome`, `password-reset`, `invite`, `notification`, plus a `base-template`. Branding resolves from `site.config`; copy from the content layer.

### 4.6 SEO / Schema — `server/config/seo.js`

Generalized `domainSeoOverrides`: per-host title/description/H1/keywords/`landingPath`/schema + FAQ pool, all values from config. Schema `@type` configurable (LocalBusiness / Organization / SoftwareApplication / etc.). `sameAs` cross-links and canonical logic preserved.

**Net effect:** swapping a customer = edit `site.config`, drop in `theme/` assets, fill `site-pages.json` + locales + `seo.js`. Zero `server/` edits.

---

## 5. Multi-tenant / per-customer rollout model

The baseline supports **one customer per deployment** (config-per-clone), which is the right granularity for a "rapid rollout" starter and matches how the source app actually deploys (one franchise content set per origin). True runtime multi-tenancy is explicitly out of scope (see §6); the per-domain SEO/host machinery already supports *multiple domains pointing at one deployment* if needed.

### 5.1 Rollout sequence

1. **Clone** `platform-baseline` → `acme-app`.
2. **Secrets:** generate `JWT_SECRET`/`ENCRYPTION_KEY`/`SESSION_SECRET`/`CSRF_SECRET` (`openssl rand -hex 32`); set `MONGODB_URI`. (Pre-deploy hook validates secrets are byte-identical across HA boxes.)
3. **Brand/theme:** edit `site.config`, drop assets into `public/assets/theme/`, set palette vars.
4. **Content:** fill `site-pages.json`, translate locales, customize email templates, set `seo.js`.
5. **Roles:** edit `server/config/roles.js` (baseline ships `admin`,`administrator`,`staff`); add domain roles.
6. **Domain modules:** scaffold `server/modules/<domain>/` (see §6) and register routes/tabs/audit-events/config-seeds via the hooks.
7. **Admin bootstrap:** `npm run init:defaults -- --prompt` (creates admin with a chosen strong password, force-change-on-first-login).
8. **Quality gate:** `npm test` green, `npm run check:i18n` clean, `npm run build:assets`, Lighthouse ~100 mobile+desktop.
9. **Deploy:** PM2 cluster on dual-AZ boxes behind Cloudflare LB; `RUN_BACKGROUND_JOBS=true` on exactly one box; `/health` monitor; smoke-test before adding origin to LB.

### 5.2 Config precedence

`process.env` (secrets, deploy-specific) → `site.config` (brand/domains/features) → `SystemConfig` in DB (runtime-tunable business values, admin-editable). Code never hardcodes a rate, fee, limit, host, or copy string.

### 5.3 Deploy topology (default)

- 2× compute (different AZs), PM2 cluster each, stateless app, shared MongoDB.
- Cloudflare LB: round-robin, sticky `__cflb` (TTL ≥ session inactivity), `/health` liveness, fail-open.
- Nginx reverse proxy template in-repo (`deploy/nginx/app.conf.template`).
- Background jobs leader-gated by env (Phase-1.5: distributed lease).

---

## 6. What is explicitly OUT, and the plug-in seams

### 6.1 Out of the baseline (the laundry domain — strip entirely)

- **Models:** `Affiliate`, `Customer`, `Order`, `Transaction`, `AddOn`, `Bag`, `FranchisePreviewRequest`; the `Operator` *operational* fields; all of `server/modules/{bags,orders,scan}` and onboarding's affiliate-specific glue.
- **Routes/controllers/services:** affiliate/customer/order/operator/scan/bag/addon/expediter, franchise registry + render + GBP + reviews, equipment profiles, service-area/geocoding, commission/WDF/payment logic, kiosk.
- **Auth flows:** username login, operator PIN-login (shared env PIN), the three bespoke login controllers (replaced by polymorphic `login`).
- **Content:** all WaveMAX/CRHS/Austin marketing pages, copy, locales (domain keys), franchise data, corporate.json, design-explorer content, crhsent audit page, brand assets.
- **Config:** all laundry `SystemConfig` defaults, domain audit events, domain CSP allowlist entries, payment/Stripe/Paygistix/Firebase/GooglePlaces/service-location env vars.
- **Tests:** all domain unit/integration tests and the `austin-reference` e2e suite.
- **Out of scope entirely:** runtime multi-tenancy (per-request tenant resolution / row-level isolation) — the baseline is config-per-deployment.

### 6.2 The seams where domain modules plug in

A domain module lives in `server/modules/<domain>/` and self-registers through these explicit extension points (each becomes a documented contract):

| Seam | Mechanism | Replaces today's hardcoding |
|---|---|---|
| **Routes** | `registerRoutes(apiV1Router)` — module exports a router; bootstrap loads `server/modules/*/routes.js` | Direct `app.use('/api/v1/affiliates', …)` in `server.js` |
| **User types / roles** | User-type registry (`server/config/userTypes.js`, `roles.js`) feeding `MODEL_BY_USER_TYPE`, `roleIdField`, `roleHierarchy` | Hardcoded `affiliate/customer/operator` in auth/RBAC |
| **Login strategies** | `registerLoginStrategy(userType, fn)` | Three bespoke login controllers |
| **Models + indexes** | Drop in `server/modules/<domain>/models/*.js`; `ensure-indexes` auto-discovers | Hardcoded `MODELS` list |
| **SystemConfig seeds** | `registerConfigDefaults([...])` | Inline `defaultConfigs` array |
| **Audit events** | `registerAuditEvents({...})` | Inline domain events in `AuditEvents` |
| **Admin tabs** | `registerAdminTab({ id, label, scriptUrl })` (client tab registry) | Hardcoded Affiliates/Customers/Orders tabs |
| **Admin analytics** | `registerAnalyticsWidget(key, handler)` → `GET /api/v1/admin/analytics/:widget` | `adminDashboardService` querying domain models |
| **Email copy** | Templates + i18n keys in the content layer; dispatchers take data bags | Inline domain dispatchers/translations |
| **SPA pages/scripts** | `routes.json` + dynamic page-script loader | `EMBED_PAGES` + `pageScripts` maps |
| **CSP additions** | `csp.js` additive allowlist per directive | Inline domain origins |
| **Background jobs** | `registerJob(fn)` gated by `RUN_BACKGROUND_JOBS` | Inline `startMonitoring`/cron calls |

This makes the baseline a *framework*: bootstrap discovers and wires modules; the platform never imports domain code directly.

---

## 7. Quality bar baked in

These are **release gates**, enforced in CI, not aspirations:

1. **Lighthouse ~100 ×4 ×2** — Performance / Accessibility / Best-Practices / SEO on mobile **and** desktop for every user-facing page. Procedure, commands, and per-category playbook ship in `docs/development/LIGHTHOUSE-QUALITY-BAR.md`. A page change isn't "done" until measured on both. Regressions are blockers. (Realistic accepted band, per source app: A11y/BP/SEO 100; Perf 98–99 desktop / 81–99 mobile with documented 3rd-party TBT exceptions.)
2. **Strict CSP** — nonce-based, no `unsafe-inline` in `script-src`; `style-src` `unsafe-inline` documented exception only. Regression-tested (`securityHeaders.test.js`). No inline scripts/styles in any shipped HTML.
3. **i18n parity** — `npm run check:i18n` runs in CI and **fails the build** on any key drift across `en/es/pt/de` or any email-template `[PLACEHOLDER]` mismatch. (Currently runnable but not CI-wired — wire it.) Every new user-facing string ships with all four languages in the same change.
4. **TDD gate** — Jest 80% coverage thresholds; red→green→refactor; integration tests at controller/route seams; tests run clean **without `--forceExit`**; `mongodb-memory-server` for isolation; `SystemConfig.initializeDefaults()` in setup. Platform-core modules target ~90%, domain modules ~60%.
5. **Static security posture** — `madge --circular server/` zero cycles; no file in `server/` > 800 lines (no controller > 500); `logger` only (`console.*` ESLint-blocked in `server/`); secrets only via `process.env`; business values only via `SystemConfig.getValue`.
6. **Security baseline regression** — the audit-derived header/CSP/CSRF/rate-limit/IP-gate behaviors are locked by tests; fail-closed gates verified; no factory credentials in the repo.

---

### Build sequencing (suggested)

1. **Foundation:** split `server.js` into `app.js` (assembly) + `bootstrap/` (DB, startup hooks, module loader); ship `site.config` + `theme/` + config registries; minimal platform `.env.example`. Remove `init-defaults` hardcoded creds.
2. **Security + auth + gates** (highest reuse, lowest coupling): port middleware/utils/models verbatim; parameterize CSP/CORS/CSRF/role registries; extract base `User` schema + polymorphic login.
3. **SPA + build + i18n:** route registry, standalone-first shell, asset pipeline + cache-buster injector, generic locales, CI-wired parity.
4. **Email + admin shell + SEO engine:** generic dispatchers/templates, tab/analytics registries, generalized SSR + per-domain SEO + robots/sitemap.
5. **Testing harness + deploy/ops:** generic factory builder, template test suites, HA docs + Nginx template, leader-gating helper, monitoring registry.
6. **Verify:** clone-and-boot smoke test, full green suite, Lighthouse ~100, zero domain strings (`grep -rEi 'wavemax|crhs|affiliate|laundry|austin|bag|commission'` over the new repo returns nothing in code/config).

This is reusable at roughly the proportions the inventory measured: security ~100%, auth/RBAC + gates ~85%, deploy/ops ~85%, SEO ~80%, testing harness ~70%, SPA ~60%, email ~40% as-is (the rest is generalization + content extraction, not rewriting). The patterns are modern and audit-proven; the work is parameterization and content stripping, which §4–§6 specify exactly.

Key file references for the build team: bootstrap `server.js`; security `server/middleware/{cspNonce,sanitization,errorHandler,rateLimiting,rateLimitMongoStore,adminIpGate,operatorIpGate,accessGate,comingSoon,locationQuarantine,explorerGuard,auth,rbac}.js` + `server/utils/{encryption,cspHelper,securityUtils,auditLogger,passwordValidator,logger}.js` + `server/config/{csrf-config,storeIPs,domainSeoOverrides,quarantineConfig}.js`; data `server/models/{SystemConfig,Administrator,RefreshToken,TokenBlacklist,AccessGate}.js` + `server/modules/onboarding/AffiliateInvite.js`; SPA `public/assets/js/{embed-app-v2,session-manager,api-client,csrf-utils,modal-utils,swirl-spinner,i18n,language-switcher,errorHandler}.js`; email `server/services/email/{transport,template-manager,dispatcher/index,dispatcher/onboarding,dispatcher/ops}.js`; SSR/SEO `server/controllers/franchiseController.js` + `public/franchise-host.html`; build `scripts/{build-assets,check-i18n-parity,ensure-indexes}.js`; tests `jest.config.js` + `tests/{setup,testSequencer}.js` + `tests/helpers/*`.