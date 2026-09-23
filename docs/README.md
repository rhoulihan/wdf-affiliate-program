# WaveMAX Documentation Index

Technical documentation for the WaveMAX Affiliate Program. The application is in
its **Phase-1 redesign**: bag-registration + a 4-state scan-gate order machine
(`pending → in_progress → out_for_delivery → complete`, plus `cancelled`),
invite-only affiliate onboarding, durable per-customer bag QRs, and order
add-ons. All money/weight/payment lives externally in **Cents** — the app holds
none of it. (V1 Paygistix, V2 post-weigh payment, customer scheduling,
service-area matching, DocuSign W-9, and OAuth/social-auth were all removed.)

## 🧭 Start Here (canonical references)

- **Architecture handbook:** [`../.claude/CLAUDE.md`](../.claude/CLAUDE.md) — models, routes, security, business logic.
- **Redesign design + plan:** [`refactor/DESIGN.md`](./refactor/DESIGN.md) · [`refactor/REFACTORING_PLAN.md`](./refactor/REFACTORING_PLAN.md)
- **Authoritative specs:** [`superpowers/specs/`](./superpowers/specs/) — the Phase-1 bag-registration design and the invite/bag-workflow redesign.
- **Project rules + session startup:** root [`../CLAUDE.md`](../CLAUDE.md)

## 🛠️ Development

- [Operating Best Practices](./development/OPERATING_BEST_PRACTICES.md) — known issues and workarounds
- [Pitfalls](./development/PITFALLS.md) — common traps with fixes
- [Refactoring Guide](./development/REFACTORING_GUIDE.md) — utility modules + controller patterns
- [Lighthouse Quality Bar](./development/LIGHTHOUSE-QUALITY-BAR.md) — the per-page release gate
- [Corporate Rebuild Checklist](./CORPORATE-REBUILD-CHECKLIST.md) — corporate handoff record

## 📚 Guides

- [i18n Best Practices](./guides/i18n-best-practices.md) — four-language (en/es/pt/de) workflow
- [Mobile Parent Integration](./guides/mobile-parent-integration-guide.md) — historical: the retired iframe parent bridge (owner decision: we will never embed in the franchisor site)

## ⚙️ Operations & Setup

- [Environment Variables](./environment-variables.md)
- [OCI Install Runbook](./ops/OCI-PRIMARY-INSTALL.md) — dual-AZ active-active web tier
- [HA Failover Plan](./ops/HA-FAILOVER-PLAN.md) · [HA Phase-1 Web](./ops/HA-PHASE1-WEB.md)
- [Mail OCI Cutover Runbook](./ops/MAIL-OCI-CUTOVER-RUNBOOK.md) · [Mailcow Email Setup](./mailcow-email-setup.md)
- [Firebase Phone Verification](./setup/firebase-phone-verification.md)

## 🔐 Security

- [Encryption Key Migration](./security/ENCRYPTION_KEY_MIGRATION.md)
- [Immediate Security Actions](./security/IMMEDIATE_SECURITY_ACTIONS.md)
- [Security Remediation Plan](./security/SECURITY_REMEDIATION_PLAN.md) · [Status](./security/SECURITY_REMEDIATION_STATUS.md)

## 💡 Examples

- [Iframe Embed Examples](./examples/README.md)

## 📜 Project History

- [Changelog](./project-history/CHANGELOG.md) · [Recent Updates](./project-history/RECENT_UPDATES.md)
- [`archive/`](./archive/), [`stash/`](./stash/), [`project-history/`](./project-history/) — historical records (kept for reference; not current).

## 📊 Testing

- [Test Suite README](../tests/README.md) — how to run tests
- [Isolated Route Testing Strategy](./testing/isolated-route-testing-strategy.md)

## 📝 Contributing

When adding documentation: put implementation details in `docs/development/`,
guides in `docs/guides/`, ops runbooks in `docs/ops/`, and **update this index**.
Keep the root README focused on overview + setup, and the architecture handbook
(`.claude/CLAUDE.md`) as the source of truth for models/routes/business logic.
