// /claim page wiring — both router maps + excludedRoutes + i18n parity
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const routerSrc = fs.readFileSync(path.join(ROOT, 'public/assets/js/embed-app-v2.js'), 'utf8');

describe('/claim page wiring', () => {
  it('is registered in EMBED_PAGES', () => {
    expect(routerSrc).toMatch(/'\/claim':\s*'\/claim-embed\.html'/);
  });

  it('is registered in pageScripts with claim.js last', () => {
    const m = routerSrc.match(/'\/claim':\s*\[([^\]]+)\]/);
    expect(m).not.toBeNull();
    expect(m[1]).toContain('/assets/js/claim.js');
  });

  it('loads scan-session.js before claim.js for /claim', () => {
    const m = routerSrc.match(/'\/claim':\s*\[([^\]]+)\]/);
    expect(m[1]).toContain('/assets/js/scan-session.js');
    expect(m[1].indexOf('/assets/js/scan-session.js'))
      .toBeLessThan(m[1].indexOf('/assets/js/claim.js'));
  });

  it('loads modal-utils.js + swirl-spinner.js (code modal + spinner) before claim.js', () => {
    const m = routerSrc.match(/'\/claim':\s*\[([^\]]+)\]/);
    expect(m[1]).toContain('/assets/js/modal-utils.js');
    expect(m[1]).toContain('/assets/js/swirl-spinner.js');
    expect(m[1].indexOf('/assets/js/modal-utils.js'))
      .toBeLessThan(m[1].indexOf('/assets/js/claim.js'));
    expect(m[1].indexOf('/assets/js/swirl-spinner.js'))
      .toBeLessThan(m[1].indexOf('/assets/js/claim.js'));
  });

  it('claim-embed.html has the brand logo header and the shared code-entry modal', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public/claim-embed.html'), 'utf8');
    expect(html).toContain('/assets/images/brand/logo-wavemax.png');
    expect(html).toContain('id="claimCodeModal"');
    expect(html).toContain('id="claimCodeInput"');
    expect(html).toContain('id="claimCodeVerify"');
    expect(html).toContain('id="claimCodeResend"');
    // inline OTP field blocks were replaced by the modal
    expect(html).not.toContain('id="email-otp-block"');
    expect(html).not.toContain('id="phone-otp-block"');
    // loads the modal + spinner stylesheets
    expect(html).toContain('/assets/css/modal-utils.css');
    expect(html).toContain('/assets/css/swirl-spinner.css');
  });

  it('phone-first verification: email required (no inline email code), phone keeps SMS controls', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public/claim-embed.html'), 'utf8');
    // Email is verified async via the welcome-email confirm link — no inline code UI.
    expect(html).not.toContain('id="emailSendCode"');
    expect(html).not.toContain('id="email-verified-badge"');
    // Email is now a required field.
    expect(html).toMatch(/<input[^>]*id="email"[^>]*\srequired/);
    // Phone is the required verification and keeps its SMS controls + badge.
    expect(html).toContain('id="phoneSendSms"');
    expect(html).toContain('id="phone-verified-badge"');
  });

  it('order-start panel puts the customer on top, staff behind a link → staff-code modal', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public/claim-embed.html'), 'utf8');
    expect(html).toContain('id="staffCodeModal"');
    expect(html).toContain('id="scan-staff-link"');
    const panel = html.slice(html.indexOf('id="claim-scan-code-panel"'));
    // customer self-start appears before the staff link in the panel
    expect(panel.indexOf('id="scan-customer-submit"'))
      .toBeLessThan(panel.indexOf('id="scan-staff-link"'));
  });

  it('claim.js uses a full-page (global) spinner and has dropped the email-OTP flow', () => {
    const claimSrc = fs.readFileSync(path.join(ROOT, 'public/assets/js/claim.js'), 'utf8');
    expect(claimSrc).toContain('SwirlSpinnerUtils.showGlobal');
    expect(claimSrc).not.toContain('showOnButton');
    expect(claimSrc).not.toContain('email-otp/request');
    expect(claimSrc).not.toContain('email-otp/verify');
    expect(claimSrc).not.toContain('emailVerificationToken');
  });

  it('registered confirmation: Start-order button + callout + email-confirm notice + instructions', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public/claim-embed.html'), 'utf8');
    expect(html).toContain('id="requestPickupBtn"');
    expect(html).toContain('id="pickupInstructionsBlock"');
    // relabelled to "Start order" with a click-now-or-scan-QR-later callout
    expect(html).toContain('data-i18n="claim.start.button"');
    expect(html).toContain('id="start-order-callout"');
    expect(html).toContain('data-i18n="claim.start.callout"');
    // welcome-email confirm + check-spam notice
    expect(html).toContain('id="claim-email-notice"');
    expect(html).toContain('id="claim-email-address"');
    expect(html).toContain('data-i18n="claim.start.emailConfirm"');
    expect(html).toContain('data-i18n="claim.start.emailSpam"');
    const claimSrc = fs.readFileSync(path.join(ROOT, 'public/assets/js/claim.js'), 'utf8');
    expect(claimSrc).toContain('renderRegistered');
    expect(claimSrc).toContain('requestPickupNow');
    expect(claimSrc).toContain("'create-pending'");
    expect(claimSrc).toContain('showEmailNotice');
    expect(claimSrc).toContain('registeredEmail');
  });

  it('out-for-delivery scan confirms DELIVERY (complete) — not a new order', () => {
    const claimSrc = fs.readFileSync(path.join(ROOT, 'public/assets/js/claim.js'), 'utf8');
    // After the customer mints, an out_for_delivery bag routes to the confirm
    // dialog (delivery), not the "start an order" actions panel.
    expect(claimSrc).toMatch(/proposedAction === 'advance' && rd\.to === 'complete'/);
    // A completed advance shows the delivery confirmation, not "Done."
    expect(claimSrc).toMatch(/result\.newStatus === 'complete'/);
    expect(claimSrc).toContain('claim.scan.deliveredConfirmed');
    for (const lang of ['en', 'es', 'pt', 'de']) {
      const dict = JSON.parse(fs.readFileSync(path.join(ROOT, `public/locales/${lang}/common.json`), 'utf8'));
      expect(typeof dict.claim.scan.deliveredConfirmed).toBe('string');
    }
  });

  it('first-order reminders (confirm-email + Cents SMS) on the order-start screens', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public/claim-embed.html'), 'utf8');
    // scan-start result panel + post-registration confirmation each surface them
    expect(html).toContain('id="order-reminders"');
    expect(html).toContain('id="order-reminder-email"');
    expect(html).toContain('id="cents-sms-notice"');
    expect(html).toContain('data-i18n="claim.start.centsSms"');
    expect(html).toContain('data-i18n="claim.start.confirmEmailReminder"');
    const claimSrc = fs.readFileSync(path.join(ROOT, 'public/assets/js/claim.js'), 'utf8');
    expect(claimSrc).toContain('showStartReminders');
    expect(claimSrc).toMatch(/firstOrder/);
    expect(claimSrc).toMatch(/emailVerified/);
    for (const lang of ['en', 'es', 'pt', 'de']) {
      const dict = JSON.parse(fs.readFileSync(path.join(ROOT, `public/locales/${lang}/common.json`), 'utf8'));
      for (const k of ['centsSms', 'confirmEmailReminder']) {
        expect(`${lang}:claim.start.${k}:${typeof (dict.claim.start && dict.claim.start[k])}`)
          .toBe(`${lang}:claim.start.${k}:string`);
      }
    }
  });

  it('the registration phone field becomes immutable (readOnly) after SMS verification', () => {
    const claimSrc = fs.readFileSync(path.join(ROOT, 'public/assets/js/claim.js'), 'utf8');
    // In the registration verify path, the verified number is locked.
    expect(claimSrc).toMatch(/getElementById\('phone'\)[\s\S]{0,120}readOnly = true/);
  });

  it('ships claim.start.* keys (start button, callout, email confirm/spam) in all four languages', () => {
    for (const lang of ['en', 'es', 'pt', 'de']) {
      const dict = JSON.parse(fs.readFileSync(path.join(ROOT, `public/locales/${lang}/common.json`), 'utf8'));
      for (const k of ['button', 'callout', 'emailSent', 'emailConfirm', 'emailSpam']) {
        expect(`${lang}:claim.start.${k}:${typeof (dict.claim.start && dict.claim.start[k])}`)
          .toBe(`${lang}:claim.start.${k}:string`);
      }
    }
  });

  it('has the customer two-button actions panel + edit-my-info form + cents warning', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public/claim-embed.html'), 'utf8');
    expect(html).toContain('id="claim-customer-actions"');
    expect(html).toContain('id="customer-start-order"');
    expect(html).toContain('id="customer-edit-info"');
    expect(html).toContain('id="claim-edit-info"');
    expect(html).toContain('id="edit-info-save"');
    expect(html).toContain('id="scan-cents-warning"');
    const claimSrc = fs.readFileSync(path.join(ROOT, 'public/assets/js/claim.js'), 'utf8');
    expect(claimSrc).toContain('openEditInfo');
    expect(claimSrc).toContain('/api/v1/customers/me');
    expect(claimSrc).toContain('verifyNewPhoneViaSms');
    expect(claimSrc).toContain('centsSyncNeeded');
  });

  it('order-start redesign: order-result panel, no batch session affordance', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public/claim-embed.html'), 'utf8');
    // The "order received" screen exists with a title + a customer-only
    // pickup-instructions block.
    expect(html).toContain('id="claim-order-result"');
    expect(html).toContain('id="order-result-title"');
    expect(html).toContain('id="order-result-instructions"');
    expect(html).toContain('id="order-result-instructions-text"');
    // The batch "End session" / "session active" affordances are gone.
    expect(html).not.toContain('id="scan-end-session"');
    expect(html).not.toContain('id="scan-session-active"');

    const claimSrc = fs.readFileSync(path.join(ROOT, 'public/assets/js/claim.js'), 'utf8');
    // Customer self-start goes straight through (no extra confirm) and renders
    // the order-result screen; staff create-pending also lands there.
    expect(claimSrc).toContain('customerStartOrder');
    expect(claimSrc).toContain('showOrderResult');
    expect(claimSrc).toContain("'claim-order-result'");
    expect(claimSrc).toContain('claim.scan.startAnOrder');
    expect(claimSrc).toContain('claim.scan.orderReceived');
    // the batch session helper is gone
    expect(claimSrc).not.toContain('endSession');
    expect(claimSrc).not.toContain('showSessionActive');
    // Pickup instructions are CUSTOMER-only: the result panel reveals them only
    // when opts.customer is set, so the STAFF create-pending result never shows
    // partner instructions.
    expect(claimSrc).toMatch(/opts\.customer && !opts\.delivered && pendingPickupInstructions/);
    expect(claimSrc).toMatch(/showOrderResult\(\{\s*customer:\s*false\s*\}\)/);
    // The instructions text is sourced from the resolve response, not stale state.
    expect(claimSrc).toMatch(/pendingPickupInstructions = rd\.pickupInstructions/);
  });

  it('scan-session.js holds the minted session in-memory only (no cross-load persistence)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/assets/js/scan-session.js'), 'utf8');
    // No persistence across the fresh /claim load each bag QR opens: the minted
    // session must never be written to web storage (only the operator JWT is read
    // from localStorage in operator mode — a getItem read, not a session write).
    expect(src).not.toMatch(/sessionStorage\.(set|get|remove)Item/);
    expect(src).not.toMatch(/localStorage\.setItem/);
    expect(src).toMatch(/var currentSession/);
  });

  it('ships claim.scan order-start keys in all four languages', () => {
    for (const lang of ['en', 'es', 'pt', 'de']) {
      const dict = JSON.parse(fs.readFileSync(path.join(ROOT, `public/locales/${lang}/common.json`), 'utf8'));
      for (const k of ['startAnOrder', 'startBtn', 'cancelBtn', 'orderReceived', 'alreadyInProgress']) {
        expect(`${lang}:claim.scan.${k}:${typeof (dict.claim.scan && dict.claim.scan[k])}`)
          .toBe(`${lang}:claim.scan.${k}:string`);
      }
    }
  });

  it('ships claim.edit.* + claim.scan cents keys in all four languages', () => {
    for (const lang of ['en', 'es', 'pt', 'de']) {
      const dict = JSON.parse(fs.readFileSync(path.join(ROOT, `public/locales/${lang}/common.json`), 'utf8'));
      for (const k of ['button', 'title', 'save', 'cancel', 'saveError']) {
        expect(`${lang}:claim.edit.${k}:${typeof (dict.claim.edit && dict.claim.edit[k])}`).toBe(`${lang}:claim.edit.${k}:string`);
      }
      expect(typeof dict.claim.scan.centsSyncWarning).toBe('string');
      expect(typeof dict.operator.scan.centsSyncWarning).toBe('string');
    }
  });

  it('ships claim.pickup.* keys in all four languages', () => {
    for (const lang of ['en', 'es', 'pt', 'de']) {
      const dict = JSON.parse(fs.readFileSync(path.join(ROOT, `public/locales/${lang}/common.json`), 'utf8'));
      const p = dict.claim && dict.claim.pickup;
      for (const k of ['requestNow', 'requestedTitle', 'dropOffTitle', 'fallback', 'error']) {
        expect(`${lang}:claim.pickup.${k}:${typeof (p && p[k])}`).toBe(`${lang}:claim.pickup.${k}:string`);
      }
    }
  });

  it('claim.js hard-gates submit on phoneRequired (server-driven), not on SDK load success', () => {
    const claimSrc = fs.readFileSync(path.join(ROOT, 'public/assets/js/claim.js'), 'utf8');
    // The submit gate must depend on phoneRequired so an SDK load failure can't
    // silently open the gate; an SDK failure surfaces a visible error.
    expect(claimSrc).toContain('phoneRequired');
    expect(claimSrc).toMatch(/if \(phoneRequired && !phoneIdToken\) return false/);
    expect(claimSrc).toContain('onPhoneSetupFailed');
    expect(claimSrc).toContain('claim.verify.phoneUnavailable');
  });

  it('lazy-loads the Firebase compat SDK from claim.js, keeping it off the render path (PR 8 perf)', () => {
    // The ~170 KB Firebase compat SDK must NOT be eagerly injected via pageScripts —
    // that delayed revealing the registration form (the LCP element). It is loaded on
    // demand by claim.js only when phone verification is enabled.
    const m = routerSrc.match(/'\/claim':\s*\[([^\]]+)\]/);
    expect(m[1]).not.toContain('/assets/js/vendor/firebase-app-compat.js');
    expect(m[1]).not.toContain('/assets/js/vendor/firebase-auth-compat.js');

    // claim.js injects both vendored files (CSP-self) on demand, app before auth.
    const claimSrc = fs.readFileSync(path.join(ROOT, 'public/assets/js/claim.js'), 'utf8');
    expect(claimSrc).toContain('/assets/js/vendor/firebase-app-compat.js');
    expect(claimSrc).toContain('/assets/js/vendor/firebase-auth-compat.js');
    expect(claimSrc.indexOf('/assets/js/vendor/firebase-app-compat.js'))
      .toBeLessThan(claimSrc.indexOf('/assets/js/vendor/firebase-auth-compat.js'));

    // the vendored files actually exist on disk
    expect(fs.existsSync(path.join(ROOT, 'public/assets/js/vendor/firebase-app-compat.js'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'public/assets/js/vendor/firebase-auth-compat.js'))).toBe(true);
  });

  it('loads scan-session.js for /operator-scan', () => {
    const m = routerSrc.match(/'\/operator-scan':\s*\[([^\]]+)\]/);
    expect(m).not.toBeNull();
    expect(m[1]).toContain('/assets/js/scan-session.js');
    expect(m[1].indexOf('/assets/js/scan-session.js'))
      .toBeLessThan(m[1].indexOf('/assets/js/operator-scan-init.js'));
  });

  it('is in excludedRoutes (requires a ?bag= parameter, never persisted)', () => {
    const m = routerSrc.match(/const excludedRoutes = \[([\s\S]*?)\]/);
    expect(m).not.toBeNull();
    expect(m[1]).toContain("'/claim'");
  });

  it('claim-embed.html exists, is CSP-clean, and references claim assets', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public/claim-embed.html'), 'utf8');
    expect(html).toContain('/assets/css/claim.css');
    expect(html).not.toMatch(/ style="/i);
    expect(html).not.toMatch(/onclick=/i);
    expect(html).toContain('data-i18n="claim.title"');
  });

  it('ships claim.* and bag.label.* keys in all four languages', () => {
    const langs = ['en', 'es', 'pt', 'de'];
    const required = [
      'title', 'subtitle', 'resolving', 'cta',
      'registeredTitle', 'registeredBody',
      'alreadyClaimedTitle', 'alreadyClaimedBody',
      'invalidTitle', 'invalidBody', 'raceLost'
    ];
    for (const lang of langs) {
      const dict = JSON.parse(fs.readFileSync(
        path.join(ROOT, `public/locales/${lang}/common.json`), 'utf8'));
      for (const key of required) {
        const val = dict.claim && dict.claim[key];
        // typeof guard: `${undefined}` stringifies to 'undefined' and would
        // spuriously satisfy a bare .+ match.
        expect(`${lang}:claim.${key}:${typeof val}`).toBe(`${lang}:claim.${key}:string`);
        expect(`${lang}:claim.${key}=${val}`)
          .toMatch(new RegExp(`^${lang}:claim\\.${key}=.+`)); // present + non-empty
      }
      for (const key of ['affiliateHeading', 'bagRef', 'printInstructions']) {
        const val = dict.bag && dict.bag.label && dict.bag.label[key];
        expect(`${lang}:bag.label.${key}:${typeof val}`).toBe(`${lang}:bag.label.${key}:string`);
        expect(`${lang}:bag.label.${key}=${val}`)
          .toMatch(new RegExp(`^${lang}:bag\\.label\\.${key}=.+`));
      }
    }
  });
});

describe('scan UIs drive the PR 4 /scan/* engine', () => {
  const claimJs = fs.readFileSync(path.join(ROOT, 'public/assets/js/claim.js'), 'utf8');
  const kioskJs = fs.readFileSync(path.join(ROOT, 'public/assets/js/operator-scan-init.js'), 'utf8');
  const scanSessionJs = fs.readFileSync(path.join(ROOT, 'public/assets/js/scan-session.js'), 'utf8');
  const claimHtml = fs.readFileSync(path.join(ROOT, 'public/claim-embed.html'), 'utf8');
  const kioskHtml = fs.readFileSync(path.join(ROOT, 'public/operator-scan-embed.html'), 'utf8');

  it('scan-session.js posts to /scan/session, resolve, apply, undo', () => {
    expect(scanSessionJs).toContain('/api/v1/scan/session');
    expect(scanSessionJs).toMatch(/scan\/'\s*\+\s*path|scan\/resolve|scan\/apply|scan\/undo/);
    // resolve/apply/undo via the shared postScan helper
    expect(scanSessionJs).toMatch(/postScan\('resolve'/);
    expect(scanSessionJs).toMatch(/postScan\('apply'/);
    expect(scanSessionJs).toMatch(/postScan\('undo'/);
  });

  it('claim.js + kiosk reference the scan engine via ScanSession', () => {
    for (const src of [claimJs, kioskJs]) {
      expect(src).toMatch(/ScanSession\.resolve/);
      expect(src).toMatch(/ScanSession\.apply/);
    }
    // undo is the customer's own start-undo; the operator scanner dropped its
    // "undo last scan" button, so only claim.js references ScanSession.undo.
    expect(claimJs).toMatch(/ScanSession\.undo/);
    expect(claimJs).toMatch(/ScanSession\.mint/); // field/staff code flow
  });

  it('no source references the retired bag-action / operator endpoints', () => {
    const retired = [
      '/confirm-delivery', '/bags/', '/intake', '/operators/intake',
      '/operators/scan-processed', '/operators/advance'
    ];
    for (const src of [claimJs, kioskJs, scanSessionJs]) {
      for (const pat of retired) {
        expect(src).not.toContain(pat);
      }
    }
  });

  it('claim + kiosk HTML/JS are CSP-clean (no inline handlers/styles)', () => {
    for (const html of [claimHtml, kioskHtml]) {
      expect(html).not.toMatch(/onclick=/i);
      expect(html).not.toMatch(/ style="/i);
      expect(html).not.toMatch(/<style/i);
    }
    for (const src of [claimJs, kioskJs, scanSessionJs]) {
      expect(src).not.toMatch(/\.innerHTML\s*=/);
    }
  });

  it('kiosk HTML drops the jspdf/qrcode/label-print scripts', () => {
    expect(kioskHtml).not.toMatch(/jspdf/i);
    expect(kioskHtml).not.toMatch(/qrcode/i);
    expect(kioskHtml).not.toMatch(/label-print/i);
    expect(kioskHtml).toContain('/assets/js/scan-session.js');
  });
});
