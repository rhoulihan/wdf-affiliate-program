# INFRA_ALLOW re-audit — remediation (2026-08-24)

Audit found the branding-guard "floor" masks live defects. Fixing all findings + pruning dead allowlist entries so the guard itself enforces the de-brand going forward.

## G1 — my regression (branding guard RED from ee567c9f)
- [ ] `affiliateApplicationService.js:39` comment — drop "WaveMAX Austin" literal
- [ ] `partnerInquiryService.js:39` comment — drop "WaveMAX Austin" literal
- [ ] `interestFormEmailBranding.test.js` — make brand-agnostic (neutral fixture values; lines 1,15,29,33)

## D1 — client-JS franchisor recruitment links (CRITICAL, live)
- [ ] `affiliate-dashboard-init.js:501,887` → `${baseUrl}/embed-app-v2.html?route=/affiliate-landing&code=…`
- [ ] `affiliate-success-init.js:131` → same
- [ ] update test fixtures that hardcode the franchisor URL: `affiliateCustomerFiltering.test.js:80,162,203`, `affiliateLoginInit.test.js:151`
- [ ] prune INFRA_ALLOW `wavemax-austin-affiliate-program` (now dead → guard enforces)

## D2 — ToS contact emails → admin@crhsent.com
- [ ] `terms-and-conditions-embed.html:216,222` support@/legal@wavemax.com → admin@crhsent.com
- [ ] standalone `terms-and-conditions.html` if it has the same
- [ ] prune INFRA_ALLOW `support@wavemax.com` + `legal@wavemax.com`

## R1 — franchisor homepage button
- [ ] `affiliate-landing-init.js:37` `<a href="https://www.wavemaxlaundry.com">` → our site

## R2 — stale CSP entry
- [ ] `affiliate-success-embed.html:8` remove `api.wavemax.com` from CSP
- [ ] prune INFRA_ALLOW `api.wavemax.com`

## R3 — franchisor fallback defaults
- [ ] `init-defaults.js:19,70` admin/operator @wavemaxlaundry.com → @crhsent.com
- [ ] `dispatcher/admin.js:175` fallback → admin@crhsent.com
- [ ] quarantine `CORPORATE_SITE_URL` default — check prod env first; repoint default if safe

## Prune dead INFRA_ALLOW patterns (match nothing)
- [ ] mail.wavemax, wavemax.firebaseapp.com, wavemax.appspot.com, UploadedImages/WaveMAX/, wavemax.sid, wavemax-api, wavemax-client, service:'wavemax-affiliate', why-invest-in-wavemax

## Verify
- [ ] `npx jest branding-guard interestFormEmailBranding affiliateLoginInit affiliateCustomerFiltering domain-guard` green
- [ ] full-ish affected-suite run; commit; offer deploy
