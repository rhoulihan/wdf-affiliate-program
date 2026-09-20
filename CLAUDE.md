# WaveMAX Affiliate Program — Project Instructions

Global operating rules from `~/.claude/CLAUDE.md` apply here (plan mode default, subagents liberally, simplicity first, verification before done, task management via `tasks/todo.md`, lessons logged to `tasks/lessons.md`). Below are the project-specific extensions.

---

## Project State (active refactor)

This codebase is mid-refactor. Canonical documents:

- **Design:** [`docs/refactor/DESIGN.md`](docs/refactor/DESIGN.md) — current state + target state
- **Plan:** [`docs/refactor/REFACTORING_PLAN.md`](docs/refactor/REFACTORING_PLAN.md) — phased execution
- **Active todo:** [`tasks/todo.md`](tasks/todo.md) — current phase checklist

**Scope context:** clean-slate redeploy — **the invite-only onboarding + durable-bags + order-at-intake redesign is built** (canonical spec: [`docs/superpowers/specs/2026-06-08-invite-bag-workflow-redesign-design.md`](docs/superpowers/specs/2026-06-08-invite-bag-workflow-redesign-design.md)). V1 Paygistix, customer scheduling / Pickup Now, BetaRequest, and the `?affid` referral funnel are removed. Superseded `.claude/CLAUDE.md` handbook sections carry a *Replaced (redesign)* note pointing at the spec.

**Security status (re-verified 2026-09-20):** the historic `keys/docusign_private.pem` finding is **no longer
present** — no `.pem`/`.key`/`.p12`/`.pfx` file has ever been added on any branch or tag, and a scan of the
commit history found no private-key blobs. DocuSign itself was removed in the redesign. No live token values
(`cfat_`, `ghp_`, `AKIA`, key blocks) appear in tracked content. **This repo is PUBLIC**
(`github.com/rhoulihan/wdf-affiliate-program`) — keep `keys/`, `secure/`, `temp/`, `*.pem`, `*.key` and every
`.env*` variant out of it, and never commit a secret value even in a test fixture.

---

## Project Rules (extensions to global)

### Testing — strict TDD

- Red → green → refactor for every non-trivial change.
- **Write the failing test first.** Confirm it fails for the right reason before writing implementation.
- No production code lands without a test that would have caught the regression.
- Prefer integration tests at controller/route seams; reserve unit tests for pure logic (pricing, encryption, formatters).
- **Fix everything before advancing.** When a refactor subtask breaks tests, fix them before moving to the next subtask. Don't leave broken tests for later — triage and fix as you go (surgical assertion updates where the change was intentional, skip-with-comment only if the test is coupled to removed functionality).
- Tests run clean without `--forceExit` after Phase 1.
- `SystemConfig.initializeDefaults()` is required in `tests/setup.js` — tests that depend on config will fail until this runs.

### Code organization (post-refactor targets)

- No file in `server/` exceeds 800 lines.
- No controller exceeds 500 lines.
- One concern per module. Split by domain (`modules/<domain>/`) not by layer.
- `logger` (Winston) only; `console.*` is blocked by ESLint in `server/`.
- `madge --circular server/` must return zero cycles.

### Internationalization

- Maintain all four languages (en / es / pt / de) whenever adding or changing user-facing copy.
- Translation files: `public/locales/{lang}/common.json`.
- English is the fallback; don't let it mask missing translations in production copy.

### Quality bar — Lighthouse (release gate)

- **Every user-facing page targets as close to 100 as possible across all four Lighthouse categories — Performance, Accessibility, Best Practices, SEO — on BOTH mobile and desktop.** This is table stakes for a properly governed AI-built app, not a stretch goal.
- A user-facing page change isn't "done" until measured on mobile **and** desktop; any regression from the prior measured state must be fixed or explained.
- Full procedure, the exact `npx lighthouse` commands, the per-category playbook, and the deploy/cache gotchas (bump `?v=` on changed assets; `pm2 reload` after a server-rendered template change; measure with a `?lh=<ts>` cache-buster) live in [`docs/development/LIGHTHOUSE-QUALITY-BAR.md`](docs/development/LIGHTHOUSE-QUALITY-BAR.md).
- This standard applies to the marketing/sales pages too (e.g. the crhsent landing page), not just the app.

### Security

- `keys/`, `temp/`, `secure/`, `*.pem`, `*.key` — never committed.
- Third-party tokens (OAuth access/refresh) and W-9 uploads encrypted at rest via `server/utils/encryption.js` (AES-256-GCM).
- `testRoutes.js` gated behind `NODE_ENV !== 'production'`.
- No inline scripts/styles; nonce-based CSP only.

### Configuration

- Runtime business values live in `SystemConfig` (MongoDB), not in code.
- Use `await SystemConfig.getValue(key, defaultValue)` — never hardcode rates, fees, limits.

### Commits & workflow automation

- **Auto-commit logical units during active refactor work.** Each completed subtask (frontend cleanup, controller split, etc.) commits with a descriptive message and pushes. No per-commit approval needed during Phase 2+ execution — the `~/.claude/settings.json` permission allowlist pre-approves `git add/commit/push` for this.
- **File deletions / moves, `npm test` / `npm install` / `npx` commands also pre-approved globally.** Proceed without asking.
- **Destructive git operations always confirm first** (even though they're listed in the `ask` set, I will also verbally confirm before running): force-push, `git push -f`, `--force-with-lease`, `filter-repo`, `reset --hard`, `branch -D`, `rm -rf` on `keys/` / `secure/` / `.git/`.
- **Production config edits still confirm:** `.env.example`, `Dockerfile`, `ecosystem.config.js`, `docker-compose.yml`, CI configs.
- **Scope changes confirm:** if a task grows to touch anything outside its plan scope, surface that before expanding.
- Never use `--no-verify` or skip hooks.

### When refactoring

- One concern per PR. Target ≤ 500-line diffs.
- Move-then-delete, not rewrite-in-place. Old file stays as a shim until next sprint.
- Every controller split includes at least one new integration test at the seam.

---

## Reference Documentation

- **`.claude/CLAUDE.md`** — detailed architecture handbook (2,000 lines). Covers models, routes, security, business logic. Note: parts describe V1 payment system being removed in Phase 2.
- **`init.prompt`** — dev persona + working style (active, read at session start).
- **`docs/development/OPERATING_BEST_PRACTICES.md`** — known issues and workarounds.
- **`docs/guides/i18n-best-practices.md`** — translation patterns.
- **`tests/README.md`** — test-suite layout.

---

## Session Startup

1. Read this file + `.claude/CLAUDE.md` (handbook).
2. Read `tasks/todo.md` for the active phase's checklist.
3. Check `git status` and recent commits.
4. If mid-phase work was paused, resume from the todo checklist.
