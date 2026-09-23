# WaveMAX Affiliate Program — Refactoring Plan

**Status:** Clean-slate redeploy
**Date:** 2026-04-17
**Companion doc:** [DESIGN.md](DESIGN.md)

---

## 0. Scope Revision — Clean Slate

The previous draft of this plan assumed production data had to be preserved through the refactor. It doesn't. We are doing a **complete redeployment** with a fresh MongoDB instance at cutover. That changes everything:

- **No Expand → Migrate → Contract.** We build the target schema directly.
- **No soak periods for schema changes.** We cut over at the end, in one event.
- **No backward compatibility** for V1 payment / V1 registration / `bagWeights[]` / plaintext tokens. They are deleted, not gradually retired.
- **No feature flags** for the refactor itself.
- **We work on a single long-lived `refactor` branch**, not a series of production deploys.

Guardrails that **still apply**:

- Tests still pass at each merge point.
- Current production remains live until the cutover — we don't break the `main` branch.
- Destructive git operations (history rewrites, force pushes) require explicit authorization.
- No secrets committed to git, ever. This includes purging historical commits where keys leaked.

---

## ⚠️ 0.1 URGENT SECURITY FINDING

`keys/docusign_private.pem` (RSA private key, 1,675 bytes) is committed to
`https://github.com/rhoulihan/wavemax-affiliate-program`, a **public repository**.

**Status:** the key has already been publicly exposed for however long the commit has been live. Treat it as compromised.

**Required actions, in order:**

1. Generate a new DocuSign integration key pair.
2. Register the new public key with the DocuSign app.
3. Store the new private key outside git (secret manager, or env var populated at deploy time).
4. Revoke the old public key in the DocuSign admin console.
5. Remove `keys/` from the working tree; add to `.gitignore`.
6. **(Requires authorization)** Rewrite git history via `git filter-repo --path keys --invert-paths` and force-push to origin, OR start a fresh repository for the redeployed service.
7. Verify `grep -rE "BEGIN (RSA |)PRIVATE KEY" <refs>` finds nothing.

If the redeployment uses a new repo, steps 6-7 simplify (old repo just gets archived/deleted). Decision needed: new repo or history-rewrite existing repo?

---

## 1. Strategy

### 1.1 Branch Model

```
main ──●──────────────────────────●── (current prod; frozen until cutover)
        \                        /
         ●── refactor ●──●──●──●  (all refactoring work)
```

- All work lands on `refactor`.
- Every commit on `refactor` keeps tests green and the app bootable.
- `main` is not touched until cutover.
- At cutover: fresh repo (or fast-forward `main` to `refactor` and force-push after history rewrite, per §0.1 decision), fresh Mongo instance, fresh deploy.

### 1.2 Commit Discipline

- One concern per commit. Reviewable diffs.
- No `--no-verify`, no `--amend` on pushed commits, no force-push to `main`.
- Small PRs; 500-line max where possible.

### 1.3 Test Discipline

- Red → green on every commit. Tests that break must be fixed before the commit lands, not after.
- Deletion commits are an exception (when removing V1, associated V1 tests go with the code in the same commit).

### 1.4 Rollback

- Code-only: `git revert`.
- Pre-cutover: no production impact; rollback = continue on `refactor`.
- Post-cutover: if the fresh deployment fails, we still have the pre-cutover `main` branch and the (emptied) old prod server. Stand up the old version while we fix the new.

---

## 2. Phase Overview (Revised)

| Phase | Focus | Duration | Depends on |
|:---:|---|:---:|:---:|
| **1** | Repo hygiene + secrets | 2-3 days | — |
| **2** | Backend: V1 removal + decomposition | 2 weeks | 1 |
| **3** | Frontend: V1 removal + consolidation | 1 week | 1 (can parallel 2) |
| **4** | Data model: target schema + encryption | 3-5 days | 2 |
| **5** | Testing + hardening | 1 week | 2, 3, 4 |
| **6** | Fresh deployment | 1-2 days | all |

**Total calendar time:** approximately 5-7 weeks with one engineer, 3-4 with two.

(Previous plan was ~15 weeks because it was constrained by soak periods and migration discipline that are no longer necessary.)

---

## 3. Phase 1 — Repo Hygiene (2-3 days)

**Goal:** repo root is clean. Test suite is stable. Secrets are evicted from the working tree (history rewrite tracked separately).

### 3.1 Safe Deletions (no references)

| Path | Action |
|---|---|
| `coverage-test-run.txt` (2.1 MB) | Delete. |
| `[A` (mystery file) | Delete. |
| `quarantine/` (4 subdirs of dead code) | Delete. |
| `public/coverage-analysis/` | Delete. |
| `public/filmwalk/` | Delete after confirming no live reference (grep confirms — none). |
| `public/privacy-policy-old.html`, `public/terms-of-service-old.html` | Delete. |
| `public/test-*.html`, `public/swirl-spinner-demo.html`, `public/wavemax-development-prompt.html`, `public/products-placeholder.html` | Delete (demo/dev pages not for prod). |
| `public/iframe-parent-example*.html`, `public/wavemaxlaundry-embed-code*.html` | Move to `docs/examples/`. |

### 3.2 Consolidations

| Current | Target |
|---|---|
| `.env.example` + `env.example` | Single `.env.example`. Diff and merge unique entries. |
| `REFACTORING_COMPLETE.md` (root) | Move to `docs/project-history/REFACTORING_2025-09.md`. |
| `init-defaults.js` (root) | Move to `scripts/setup/`. Update any npm script references. |
| `operator-credentials-example.json` (root) | Move to `docs/examples/`. |
| `project-logs/` | Move to `docs/implementation-logs/`. |
| `init.prompt` (root) | Keep, it's an active dev artifact. |

### 3.3 `.gitignore` hardening

Add:

```
# Secrets (working-tree eviction; history rewrite tracked separately)
keys/
*.pem
*.key
*.p12
secure/

# Runtime state
temp/

# Logs
logs/
*.log

# Coverage artifacts
coverage/
coverage-test-run.txt
*-test-run.txt

# IDE
.vscode/
.idea/
```

### 3.4 Secrets eviction from working tree

1. Move any needed key material to a secret store outside git.
2. `git rm -r --cached keys/ temp/` (keeps files locally, removes from index).
3. Verify `secure/w9-documents/` contents. If real PII, move to external storage; if empty or test-only, delete.
4. Commit.

**Does not include history rewrite** — that's an authorization-required action, tracked in §0.1.

### 3.5 Scripts reorganization

Create:

```
scripts/
├─ admin/       ← active prod admin tools
├─ setup/       ← dev env bootstrap
├─ security/    ← key management
├─ ops/         ← infra config (IMAP, Mailcow)
├─ diagnostics/ ← read-only checks
└─ README.md
```

Disposition:

- **Keep → `scripts/admin/`:** `create-admin-*.js`, `reset-admin-password*.js`, `verify-admin.js`, `clear-admin-session.js`, `backup-database.js`, `restore-database.js`, `rotate-credentials.sh`, `delete-admin-operators.js`. (`update-admin-email.js` was deleted in Plan 3 task 38's follow-up: a spent one-off migration that hardcoded an admin password.)
- **Keep → `scripts/setup/`:** `setup-database.js`, `init-defaults.js` (moved), `init-admin.js`, `clean-install-db.js`, `clean-and-reinit-db.js`, `reset-database.js`, `generate-sample-data.js`, `generate-service-area.js`.
- **Keep → `scripts/security/`:** `generate-docusign-keys.js`, `extract-public-key.js`, `fix-docusign-key.js`, `encrypt-oauth-tokens.js`.
- **Keep → `scripts/ops/`:** `configure-imap*.js`, `configure-mailcow*.js`, `clean-logs.sh`.
- **Keep → `scripts/diagnostics/`:** `check-data-distribution.js`, `check-order-distribution.js`, `check-initialization.js`.
- **Delete (clean slate — no migration needed):** all `migrate-*.js`, `add-*.js` (the "add V2 payment config" etc are irrelevant for a fresh DB), `complete-migration*.js`, `csrf-rollout.js`, `remove-*.js`, `decrypt-oauth-tokens.js`, all `test-*.js`, all `debug-*.js`, `check-customer.js`, `check-user-rhoulihan.js`, all `send-test-*`.

### 3.6 README + docs reorganization

- `README.md` (root, currently 88 KB): rewrite to ~5 KB. Overview, quick start, link hub. Move the feature list to `docs/FEATURES.md`, the file tree to `docs/architecture/REPO_LAYOUT.md`, architecture to `docs/architecture/ARCHITECTURE.md`. Save old README to `docs/archive/README-2026-04-17-full.md` for reference.
- `docs/`: restructure into `architecture/`, `integrations/`, `operations/`, `guides/`, `examples/`, `project-history/`, `refactor/` (the latter already exists).
- Delete all 23 HTML docs in `docs/` that have MD replacements. Delete entirely if orphaned.
- Consolidate 9 Paygistix docs into `docs/integrations/PAYGISTIX.md` + `docs/integrations/PAYGISTIX_QUICK_REFERENCE.md` — but note these will later be deleted in Phase 2 (V1 removal). Consider skipping the consolidation and just deleting them all in Phase 2.
- Reconcile any duplicate CLAUDE.md.
- Add `Last updated: YYYY-MM-DD` to every remaining doc.

### 3.7 Test suite stabilization

1. In `tests/setup.js`, call `await SystemConfig.initializeDefaults()` after Mongo connection. Eliminates the 48 Mailcow-config failures.
2. Run `npm test -- --detectOpenHandles`; fix each reported leak:
   - `mongoose.disconnect()` in `afterAll`.
   - `clearInterval` / `clearTimeout` for any timers.
   - Close any IMAP / HTTP connections.
3. Remove `--forceExit` from `package.json` `test` script.
4. Gate `testRoutes.js`: wrap `app.use('/api/test', testRoutes)` in `if (process.env.NODE_ENV !== 'production')`.
5. Confirm `npm test` exits cleanly with 0 failures.

### 3.8 Phase 1 acceptance

- [ ] Root file count ≤ 20 (excluding dotfiles).
- [ ] `README.md` under 10 KB.
- [ ] No HTML docs in `docs/` outside `docs/examples/`.
- [ ] `scripts/` organized by subdirectory, each subdir under 20 files.
- [ ] `quarantine/` does not exist.
- [ ] Secrets (`keys/`, `temp/`, `secure/`) gitignored and evicted from working tree index.
- [ ] Test suite passes without `--forceExit`, exits cleanly.
- [ ] `git log -- keys/` **decision made** on history rewrite (handled separately; see §0.1).

---

## 4. Phase 2 — Backend: V1 Removal + Decomposition (2 weeks)

**Goal:** V1 upfront-payment workflow removed. Post-weigh payment (previously "V2") becomes the only workflow, with all V1/V2 versioning vocabulary dropped. Paygistix remains as the payment processor; its callback-pool mechanism is how it returns status for all payments. No file over 800 lines. No circular dependencies. One concern per module.

### 4.1 V1 workflow removal — what goes

**Context:** "V1" was the *upfront-payment registration flow* (customer paid Paygistix at signup, got bag credit). "V2" is the *post-weigh payment flow* (customer registers for free, pays Paygistix — or Venmo/PayPal/CashApp — after bags are weighed). We are standardizing on the post-weigh workflow. **Paygistix itself, including the callback pool, stays** — it is the processor for all payments regardless of when capture happens.

Because there's no V1 production data to preserve, V1 workflow support can be deleted outright.

**Delete entirely (V1-only code):**

- `public/paygistix-registration-payment.html` (V1 upfront-capture registration form)
- `public/customer-register-embed.html` (V1 registration — replaced by the renamed v2 version)
- `public/schedule-pickup-embed.html` (V1 — replaced by the renamed v2 version)
- `public/assets/js/customer-register.js`, `customer-register-paygistix.js`, `customer-register-updated.js`, `customer-register-navigation.js` (V1 registration JS — V2 equivalents replace them)
- `public/assets/js/test-payment-form.js` (already flagged in Phase 1 as dev page)
- `Customer.registrationVersion` field (no more version branching; every customer is post-weigh)
- `Customer.initialBagsRequested` tracking if it's specific to the V1 upfront-bag-purchase flow (verify first)
- V1-only email templates (verify by grepping template references; any template never reached from a post-weigh path)
- V1-specific tests (e.g. anything asserting upfront Paygistix capture at registration)

**Keep (all of it — Paygistix stays):**

- `server/services/paygistix/` — payment processor integration
- `server/services/callbackPoolManager.js` — how Paygistix returns status (used by all payments)
- `server/services/paymentLinkService.js` — generates QR codes / payment links (used by post-weigh flow)
- `server/config/paygistix.config.js`
- `server/models/Payment.js` — Paygistix payment ledger
- `server/models/PaymentToken.js` — Paygistix handshake state
- `server/models/CallbackPool.js` — callback URL slot tracking
- `server/routes/paymentCallbackRoute.js`
- `server/routes/generalPaymentCallback.js`
- `server/controllers/paymentController.js` — keep as a domain module; split only if it exceeds the 500-line target after V1 cleanup
- `server/services/paymentEmailScanner.js` — IMAP scanner for Venmo/PayPal confirmations (continues to complement Paygistix for those payment methods)

**Rename (V2 → unversioned):**

- `Order.v2PaymentStatus` → `Order.paymentStatus`
- `Order.v2PaymentMethod` → `Order.paymentMethod`
- `Order.v2PaymentAmount` → `Order.paymentAmount`
- `Order.v2PaymentLinks` → `Order.paymentLinks`
- `Order.v2PaymentQRCodes` → `Order.paymentQRCodes`
- `Order.v2PaymentReminders` → `Order.paymentReminders`
- `customer-register-v2-embed.html` → `customer-register-embed.html`
- `schedule-pickup-v2-embed.html` → `schedule-pickup-embed.html`
- `parent-iframe-bridge-v2.js` → `parent-iframe-bridge.js` (Phase 3)
- `embed-app-v2.html` / `embed-app-v2.js` → `embed-app.html` / `embed-app.js` (Phase 3; redirect stub `embed-app.html` goes first)
- `server/routes/v2CustomerRoutes.js` merged into main customer routes

**Keep (V1 cleanup leaves these untouched):**

- Paygistix + callback pool (all of `server/services/paygistix/`, `callbackPoolManager.js`, `paymentLinkService.js`, `Payment`, `PaymentToken`, `CallbackPool` models, payment routes and controller)
- Post-weigh payment email scanner (IMAP-based): `server/services/paymentEmailScanner.js`
- QuickBooks, OAuth, service area, address validation

**Drop the `v1` / `v2` vocabulary everywhere** — after this phase there's only one payment workflow (post-weigh) so the versioning becomes dead weight.

**On DocuSign:** DocuSign is being deprecated separately — see §4.1.1. That removal is independent of the V1 workflow cleanup above.

### 4.1.1 DocuSign deprecation + admin manual unlock

The automated DocuSign W-9 workflow is being replaced by an out-of-band process: W-9s are collected and processed outside the application, and an administrator manually unlocks payment processing for an affiliate once their W-9 is on file.

**Delete entirely:**

- `server/services/docusignService.js` (630 lines)
- `server/controllers/w9ControllerDocuSign.js` (741 lines)
- `server/routes/w9Routes.js` (replaced by the admin unlock endpoint below)
- `server/models/DocuSignToken.js`
- `public/assets/js/docusign-w9-integration.js` (29 KB)
- `keys/` (DocuSign private key no longer needed — purged in Phase 1 history rewrite)
- All DocuSign env vars from `.env.example` (DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_ACCOUNT_ID, DOCUSIGN_BASE_URL, DOCUSIGN_W9_TEMPLATE_ID, DOCUSIGN_REDIRECT_URI, etc.)
- All DocuSign docs (`docs/docusign-jwt-setup.md`, `docs/docusign-redirect-uri-fix.md`, `docs/guides/docusign-w9-migration-guide.md`, `docs/w9-tax-compliance.html`, `docs/development/docusign-w9-integration-plan.md`)
- DocuSign-related tests (`docusignService.test.js`, `docusignToken.test.js`, `docusignW9.test.js`)
- Connectivity monitor's DocuSign healthcheck entry

**Affiliate model changes:**

Replace the DocuSign-centric `w9Information` block with a simpler payment-lock mechanism:

```javascript
// New Affiliate fields
paymentProcessingLocked: { type: Boolean, default: false },
paymentLockedAt: Date,
paymentLockReason: String,       // e.g. 'w9_required', 'admin_hold', 'compliance_review'
paymentUnlockedAt: Date,
paymentUnlockedBy: ObjectId,     // Administrator who unlocked
paymentUnlockNotes: String,      // Free-text from admin

// Simplified W-9 reference (optional, for admin context only)
w9Status: { type: String, enum: ['not_required', 'required', 'on_file', 'rejected'], default: 'not_required' },
w9OnFileAt: Date,
```

Remove these fields from the old `w9Information` block:
- `docusignEnvelopeId`, `docusignStatus`, `docusignInitiatedAt`, `docusignCompletedAt`
- `submittedAt`, `verifiedAt`, `verifiedBy`, `rejectedAt`, `rejectionReason`

(Keep `quickbooksVendorId` at the top level of Affiliate — QuickBooks integration is untouched.)

**New business rule:**

When an affiliate's year-to-date earnings cross a configurable threshold (`SystemConfig.w9_earnings_threshold`, default $600), a pre-save hook or scheduled job sets `paymentProcessingLocked = true` and `paymentLockReason = 'w9_required'`. Future commission payouts check this flag before issuing.

**New admin endpoints:**

- `POST /api/v1/administrators/affiliates/:affiliateId/lock-payments` — body: `{ reason, notes }`.
- `POST /api/v1/administrators/affiliates/:affiliateId/unlock-payments` — body: `{ notes }`. Sets `paymentUnlockedBy = adminId`, `paymentUnlockedAt = now`, flips `paymentProcessingLocked = false`, sets `w9Status = 'on_file'` (if reason was `w9_required`).
- `GET /api/v1/administrators/affiliates?locked=true` — lists locked affiliates for admin dashboard.

**Admin dashboard UI additions** (Phase 3 frontend work):

- New section in admin dashboard: "Affiliates awaiting W-9 review" — table of locked affiliates with earnings, lock reason, "Unlock payments" action.
- Unlock modal: notes field (required), confirm button.

**Affiliate dashboard UI additions:**

- Banner when `paymentProcessingLocked === true`: "Commission payouts are on hold pending W-9 submission. Contact [admin email]."

**Audit logging:**

Every lock/unlock writes to the new `AuditEvent` collection (added in Phase 4): `{ event: 'payment_lock' | 'payment_unlock', userId, targetAffiliateId, reason, notes, timestamp }`.

**Tests required:**

- Unit: payment-lock pre-save hook triggers at threshold.
- Integration: admin unlock endpoint flips the flag, records the audit event, and unblocks commission processing.
- Integration: commission payout job skips locked affiliates.
- Integration: locked affiliates can still log in, see orders, but cannot withdraw commissions.

### 4.2 Emit the target backend layout

Move to `server/modules/` for feature-scoped modules. One directory per domain:

```
server/modules/
├─ affiliate/           (controller, service, routes, __tests__)
├─ auth/                (controller, oauth-controller, password-reset-controller, token-service)
├─ customer/            (controller, registration-service)
├─ order/               (controller, pricing-service, bag-tracking-service, payment/)
├─ operator/            (auth-controller, scan-controller, service)
├─ administrator/       (controller, system-config-controller, audit-controller, analytics-controller)
├─ w9/                  (DocuSign-based W-9)
├─ quickbooks/
└─ marketing/
```

### 4.3 Replace `utils/emailService.js` (3,618 lines)

New location: `server/services/email/`.

- `transport.js` (~200 lines): Mailcow SMTP transport. `send(message)`.
- `template-manager.js` (~300 lines): loads from `server/services/email/templates/`, handles language fallback (en → xx), renders.
- `dispatcher.js` (~500 lines): public API. `sendAffiliateWelcome(affiliate)`, `sendOrderConfirmation(order)`, etc.
- Delete the monolith.

### 4.4 Resolve circular dependency

`customerController ↔ paymentController` (line 750 / line 338). Since `paymentController.js` is being deleted in §4.1, extract the shared V2 verification logic into `server/modules/order/payment/verification-service.js`. Both call sites call the service; the cycle disappears by construction.

### 4.5 Decompose god controllers

For each, split into modules under `server/modules/`. One concern per file, target ≤ 500 lines:

| Original | Split into |
|---|---|
| `administratorController.js` (2,729) | `administrator/controller.js`, `system-config-controller.js`, `audit-controller.js`, `analytics-controller.js` |
| `authController.js` (2,442) | `auth/controller.js`, `oauth-controller.js`, `password-reset-controller.js`, `token-service.js` |
| `operatorController.js` (1,887) | `operator/auth-controller.js`, `scan-controller.js`, `service.js` |
| `orderController.js` (1,746) | `order/controller.js`, `pricing-service.js`, `bag-tracking-service.js`, `payment/strategy.js` |
| `customerController.js` (1,209) | `customer/controller.js`, `registration-service.js` |

Route files split correspondingly. Keep URLs stable (pre-cutover production clients still use current URLs).

### 4.6 Consolidate RBAC middleware

_Revised 2026-04-19:_ kept as two files rather than merging.
- `rbac.js` (316 lines) — role hierarchy + `checkRole` middleware. One concern: role-based access.
- `authorizationHelpers.js` (413 lines) — entity-level checks (`canAccessCustomer`, `canAccessAffiliate`, `canAccessOrder`) + wrapper middlewares. Separate concern: instance-level authorization.

Both are already under the 800-line file cap and each has a single clear responsibility. A combined file would be 729 lines and would mix two distinct authorization layers — the underlying "one concern per file" goal is better served by the current split.

### 4.7 Standardize logging

- Grep every `console.*` in `server/`. Replace with `logger.*` with context fields.
- Add ESLint rule `no-console` in `server/**/*.js`.

### 4.8 Phase 2 acceptance

- [ ] No file in `server/controllers/` or `server/modules/` exceeds 500 lines.
- [ ] No file in `server/` exceeds 800 lines.
- [ ] `emailService.js` deleted; replaced by `services/email/{transport,template-manager,dispatcher}.js`.
- [ ] `madge --circular server/` returns 0 cycles.
- [ ] `eslint` passes with `no-console` enforced under `server/`.
- [ ] No `v2Payment*` / `v2PaymentStatus` / `v2PaymentMethod` / `registrationVersion` references in active code (all version fields renamed to unversioned names).
- [ ] No references to DocuSign (`docusign*`, `DOCUSIGN_*`) in active code — replaced by payment-lock mechanism.
- [ ] Paygistix integration still works (smoke-test: callback, token, payment completion).
- [ ] Test suite passes (tests for V1-only code + DocuSign deleted alongside the code).

---

## 5. Phase 3 — Frontend: V1 Removal + Consolidation (1 week; can parallel Phase 2)

**Goal:** `public/` contains only what ships. No demos, no dev scratch, no V1, no duplicate bridges.

### 5.1 V1 page deletions (already flagged in §4.1)

Delete all V1 customer registration / schedule-pickup / payment pages and their JS. Rename V2 pages to unversioned names.

### 5.2 Deduplicate iframe bridges

`parent-iframe-bridge-v2.js` (78 KB) and `parent-iframe-bridge-inline.js` (78 KB) both exist. Diff them, pick one, delete the other, rename the survivor to `parent-iframe-bridge.js`. Update parent-site script tag.

### 5.3 Fix `self-serve-laundry.css`

2.7 MB. Likely bundled Tailwind or unused utility classes. Rebuild with proper PurgeCSS content-path config, or use a minifier. Target ≤ 100 KB.

### 5.4 Consolidate CSS

- Keep shared primitives: `theme.css`, `modal-utils.css`, `language-switcher.css`, `mobile-embed.css`, `wavemax-embed.css`.
- For each `*-embed.css` / `*.css` pair, determine overlap; consolidate or delete the subset.

### 5.5 Deduplicate customer-register JS (simpler now — V1 deleted)

After V1 deletion (§4.1), only V2 registration remains. Flatten to one `customer-register.js` (formerly `-v2`).

### 5.6 Frontend layout

Proposed `public/assets/js/` reorganization:

```
public/assets/
├─ css/
│  ├─ pages/               (per-page stylesheets)
│  ├─ shared/              (theme, modal, language-switcher, etc.)
│  └─ embed/               (embed-specific)
├─ js/
│  ├─ pages/               (per-page init scripts)
│  ├─ shared/              (api-client, session-manager, csrf-utils, i18n, form-validation)
│  ├─ components/          (address-validation, password-validator, beta-request-modal, etc.)
│  └─ embed/               (embed-app.js, iframe-bridge.js, parent-iframe-bridge.js)
└─ vendor/                 (jspdf.min.js, qrcode.min.js)
```

### 5.7 Phase 3 acceptance

- [ ] `public/` HTML file count drops below 40 (from 65).
- [ ] No `test-*.html`, `*-demo.html`, `*-old.html`, or dev-only pages in `public/`.
- [ ] No duplicate bridge files.
- [ ] `self-serve-laundry.css` under 100 KB.
- [ ] V2 registration, order flow, operator scan, iframe embed all smoke-tested manually.
- [ ] `public/assets/` reorganized per §5.6.

---

## 6. Phase 4 — Data Model: Target Schema + Encryption (3-5 days)

**Goal:** clean-slate Mongoose schemas. No legacy fields. All sensitive tokens encrypted at rest.

Because there's no data to migrate, this is just code.

### 6.1 Target schemas

- **`Order`**: drop all `v2*` prefixes on payment fields (done in Phase 2 rename). Drop `bagWeights[]` (legacy, replaced by rich `bags[]`). Drop `Customer.registrationVersion` branching leftovers (e.g. any `isPaid`/`paymentStatus` fields tied to the V1 upfront capture at registration time, as distinct from the general Paygistix payment-status fields that remain). Keep: `bags[]`, `paymentStatus`, `paymentMethod`, `paymentAmount`, `paymentLinks`, `paymentQRCodes`, `paymentReminders`.
- **`Affiliate`**: `socialAccounts.{provider}.accessToken` and `refreshToken` go through `encryption.js` on save. Same helper, same key; add encrypt/decrypt to the pre-save / getter path. Add the payment-lock fields from §4.1.1 (`paymentProcessingLocked`, `paymentLockedAt`, `paymentLockReason`, `paymentUnlockedAt`, `paymentUnlockedBy`, `paymentUnlockNotes`, `w9Status`, `w9OnFileAt`). Drop the DocuSign-specific `w9Information.docusign*` subfields.
- **`SystemConfig`**: delete the `payment_version` key (no longer branching on version). Add `w9_earnings_threshold` (default $600) from §4.1.1.
- **Delete models:** `DocuSignToken` (DocuSign removal — §4.1.1), `BetaRequest` (verify dormant first; if kept, move to its own module).
- **Keep:** `Affiliate`, `Customer`, `Order`, `Operator`, `Administrator`, `SystemConfig`, `Transaction`, `Payment`, `PaymentToken`, `CallbackPool`, `PaymentExport`, `DataDeletionRequest`, `RefreshToken`, `TokenBlacklist`, `OAuthSession`.

Paygistix infrastructure (`Payment`, `PaymentToken`, `CallbackPool`) stays — it's the payment processor for the post-weigh workflow, not V1-specific.

### 6.2 Pricing in the model

`Order.pre('save')` currently computes pricing inline. Move to `modules/order/pricing-service.js` as a pure function. Pre-save hook calls the service.

### 6.3 Audit log as a collection

Add `AuditEvent` model. Indexes on `{ userId, userType, createdAt }` and `{ event, createdAt }`. TTL index on `createdAt` (1 year default).

`auditLogger` writes to both Winston (file) and the new collection.

### 6.4 Indexes

Add where missing — profile first. Likely candidates:

- `Order`: `{ customerId: 1, createdAt: -1 }`, `{ affiliateId: 1, status: 1, createdAt: -1 }`, `{ status: 1, createdAt: -1 }`.
- `Affiliate`: verify 2dsphere on `serviceLocation` is present and valid.
- `Transaction`: `{ affiliateId: 1, createdAt: -1 }`.

Since schema is being rebuilt, define indexes in the model file with `Schema.index(...)` rather than relying on `background: true` mongod operations.

### 6.5 Phase 4 acceptance

- [ ] All listed schema fields removed / renamed / added.
- [ ] OAuth provider tokens (`Affiliate.socialAccounts.*.accessToken`/`refreshToken`) encrypted at rest with AES-256-GCM.
- [ ] `Order.pre('save')` has no inline pricing math — delegates to `pricing-service.js`.
- [ ] `AuditEvent` collection exists; `auditLogger` writes to it.
- [ ] Indexes defined in schema files, documented in `docs/architecture/DATA_MODEL.md`.

---

## 7. Phase 5 — Testing + Hardening (1 week)

**Goal:** the system is harder to break going forward than it was before the refactor.

### 7.1 CI checks

Add to the CI pipeline:

- `npm test` — passes without `--forceExit`.
- `npm run lint` — passes with `no-console` rule enforced.
- `npx madge --circular server/` — no cycles.
- Max-file-size check — no file in `server/` over 800 lines.
- `gitleaks detect --no-git` — no secrets in working tree.
- Jest coverage thresholds raised to current post-refactor level + 2%.

### 7.2 Gaps to fill

Add tests for modules that had zero or near-zero coverage before:

- `modules/quickbooks/` (was `quickbooksController`).
- `server/services/paymentEmailScanner.js` and IMAP scanner.
- `modules/affiliate/schedule-service.js` (was `affiliateScheduleController`).
- At least one integration test per controller split in Phase 2.

### 7.3 Frontend tests

Decision point: either

- Implement: add `jest-environment-jsdom`, remove `describe.skip()`, write real tests for `operatorAddOnsDisplay`, `schedulePickupAddOns`, the payment modal, QR-scan handler, address autocomplete, at minimum.
- Or delete `tests/frontend/` and state in `docs/testing` that frontend is tested manually.

Pick one.

### 7.4 Observability

- Structured logs with `requestId` / `userId` / `orderId` propagated via `asyncLocalStorage`.
- Health dashboards for: payment verification latency, email delivery success, DocuSign envelope completion, OAuth callback success rate.
- Alerts on: any critical `AuditEvent`; payment verification job runtime over 30s; unhandled promise rejection.

### 7.5 Key rotation runbooks

Document in `docs/operations/RUNBOOKS.md`:

- Rotating `ENCRYPTION_KEY` (decrypt-all / re-encrypt / deploy).
- Rotating DocuSign private key.
- Rotating JWT secret (grace-period dual-accept).

Dry-run each against staging.

### 7.6 Phase 5 acceptance

- [ ] CI pipeline runs all §7.1 checks on every PR and blocks on failure.
- [ ] All §7.2 gaps have tests.
- [ ] `tests/frontend/` either works or is removed.
- [ ] Runbooks exist and have been dry-run at least once.
- [ ] `docs/development/BACKLOG.md` reflects post-refactor state.

---

## 8. Phase 6 — Fresh Deployment (1-2 days)

**Goal:** refactored code live on fresh infrastructure with fresh data.

### 8.1 Pre-cutover

1. All Phase 1-5 acceptance criteria met.
2. Staging environment running the `refactor` branch for ≥ 48 hours with no regressions.
3. DocuSign new key registered + old key revoked (§0.1).
4. OAuth apps (Google, Facebook, LinkedIn) callback URLs verified for the new deployment.
5. Mailcow SMTP / IMAP credentials verified on the target infra.
6. Paygistix-related services stood down (no longer used).

### 8.2 Cutover

1. Stand up fresh MongoDB instance.
2. Deploy `refactor` branch to the new prod environment.
3. Seed: `scripts/setup/init-defaults.js` + `scripts/setup/init-admin.js`.
4. Smoke test: affiliate registration → customer registration → order → operator scan → payment email verification → W-9 signing.
5. DNS cutover to the new deployment.
6. Old deployment left running (hot-standby) for 24-48 hours.

### 8.3 Post-cutover

1. If using same repo: fast-forward `main` to `refactor`, force-push with git-history cleaned per §0.1. Tag `v2.0.0`.
2. If using new repo: tag `v1.0.0` on the new repo; archive the old repo.
3. Retire old infrastructure after 48 hours of green operation.
4. Close out `docs/refactor/` — move to `docs/project-history/REFACTOR_2026_04.md`.

### 8.4 Phase 6 acceptance

- [ ] New deployment serving production traffic.
- [ ] All smoke tests pass on production.
- [ ] Old infrastructure retired.
- [ ] Monitoring dashboards show baseline within expected ranges.

---

## 9. Immediate Action List (executable now)

Starting on Phase 1 safe deletions and hygiene. Items requiring authorization are flagged.

**Safe, proceeding now:**

- Delete `coverage-test-run.txt`, `[A`, `quarantine/`, `public/coverage-analysis/`, `public/filmwalk/`, `public/privacy-policy-old.html`, `public/terms-of-service-old.html`, `public/test-*.html`, `public/swirl-spinner-demo.html`, `public/wavemax-development-prompt.html`, `public/products-placeholder.html`.
- Move `public/iframe-parent-example*.html`, `public/wavemaxlaundry-embed-code*.html` → `docs/examples/`.
- Move `REFACTORING_COMPLETE.md` → `docs/project-history/`.
- Move `init-defaults.js` → `scripts/setup/`.
- Move `operator-credentials-example.json` → `docs/examples/`.
- Move `project-logs/` → `docs/implementation-logs/`.
- Merge `env.example` into `.env.example`; delete `env.example`.
- Update `.gitignore` with §3.3 entries.
- `git rm -r --cached keys/ temp/` (working-tree eviction only — does not rewrite history).
- Audit `secure/w9-documents/` contents.
- Reorganize `scripts/` per §3.5.
- Fix `tests/setup.js` SystemConfig seeding.
- Gate `testRoutes.js` behind `NODE_ENV !== 'production'`.

**Requires authorization — stopping until confirmed:**

- **Git history rewrite** to purge `keys/` from past commits (`git filter-repo`). Destructive; force-push to origin would rewrite shared history. Needed only if we keep the existing repo. Decision: rewrite existing repo history, or cut over to a fresh repo at Phase 6?
- **DocuSign key rotation** (requires DocuSign admin console access).
- **Commits** — per instruction, no commits without explicit ask.
- **README.md rewrite** — will draft and show diff before overwriting.

---

**End of REFACTORING_PLAN.md.**
