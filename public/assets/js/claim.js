// /claim — overloaded bag URL (Phase 1 PR 5).
//
// Two audiences hit the same URL:
//   1. A CUSTOMER scanning an unregistered ('claimable') bag → registration form.
//   2. A scan of a registered ('claimed') bag → an order-start panel.
//
// No persistent batch session (2026-06-18): each bag QR opens a fresh full-page
// /claim load with no carried-over session, so EVERY scan re-authenticates.
//   - CUSTOMER: enter the registered phone/email → mint a START-ONLY session →
//     [Start my order] starts directly and shows the partner pickup instructions
//     + "order received". (Also [Edit my info].)
//   - STAFF: behind a "Staff? Enter your code" link → a code mints a session →
//     for a new order, a "Start an order?" [Start]/[Cancel] confirm → "order
//     received" (no instructions); for an in-progress bag, the state-driven
//     advance confirm. Either start emails the customer if their email is verified.
(function () {
  'use strict';

  var bagToken = new URLSearchParams(window.location.search).get('bag');

  var SECTIONS = ['resolving', 'claimable', 'registered', 'claimed', 'invalid'];
  var PANELS = ['claim-scan-code-panel', 'claim-customer-actions', 'claim-edit-info', 'claim-scan-confirm-panel', 'claim-order-result'];

  function show(state) {
    SECTIONS.forEach(function (name) {
      var el = document.getElementById('claim-state-' + name);
      if (el) el.hidden = (name !== state);
    });
  }

  function showPanel(id) {
    show('__none__');
    PANELS.forEach(function (p) {
      var el = document.getElementById(p);
      if (el) el.hidden = (p !== id);
    });
  }

  // i18n.t returns the key when a translation is missing → fall back to English.
  function t(key, fallback) {
    var v = (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t(key) : key;
    return (v && v !== key) ? v : (fallback || key);
  }

  // ---- order options: add-ons + special instructions (start-order form) -------
  // Catalog fetched once; rendered into a container per start surface. CSP-clean
  // (DOM built via createElement/textContent — never innerHTML).
  var addonCatalogPromise = null;
  function loadAddOnCatalog() {
    if (addonCatalogPromise) return addonCatalogPromise;
    addonCatalogPromise = fetch('/api/v1/addons')
      .then(function (r) { return r.json(); })
      .then(function (body) { return (body && body.addOns) || []; })
      .catch(function () { return []; });
    return addonCatalogPromise;
  }

  // Localized add-on label: the active language's translation, else English name.
  function addonLabel(a) {
    var lang = (window.i18n && window.i18n.getLanguage && window.i18n.getLanguage()) || 'en';
    if (lang !== 'en' && a.translations && a.translations[lang]) return a.translations[lang];
    return a.name;
  }

  // Display price → "$5.00" (flat) or "$0.50/lb" (per_lb). Display-only; we
  // never weigh in-app — per-pound just changes the label.
  function formatPrice(price, unit) {
    var s = '$' + Number(price || 0).toFixed(2);
    return unit === 'per_lb' ? s + t('claim.order.perPoundSuffix', '/lb') : s;
  }

  // Build one options table (CSP-clean via createElement). `withPrice` adds a
  // right-aligned price column (Premium); omit it for the Free table. Each
  // checkbox keeps class `order-addon-check` + data-key so collectOrderOptions
  // is unchanged; the label span carries `order-addon-label`/data-key so the
  // languageChanged handler can re-localize it in place.
  function buildAddOnTable(addOns, containerId, titleKey, titleFallback, withPrice) {
    var frag = document.createDocumentFragment();
    var title = document.createElement('p');
    title.className = 'order-options-title';
    title.setAttribute('data-i18n', titleKey); // re-translates on language switch
    title.textContent = t(titleKey, titleFallback);
    frag.appendChild(title);

    var table = document.createElement('table');
    table.className = withPrice ? 'premium-options-table' : 'free-options-table';

    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    var thCheck = document.createElement('th');
    thCheck.className = 'addon-check-col';
    thCheck.setAttribute('scope', 'col');
    var thLabel = document.createElement('th');
    thLabel.setAttribute('scope', 'col');
    thLabel.setAttribute('data-i18n', 'claim.order.optionColumn');
    thLabel.textContent = t('claim.order.optionColumn', 'Option');
    hr.appendChild(thCheck);
    hr.appendChild(thLabel);
    if (withPrice) {
      var thPrice = document.createElement('th');
      thPrice.className = 'addon-price-col';
      thPrice.setAttribute('scope', 'col');
      thPrice.setAttribute('data-i18n', 'claim.order.priceColumn');
      thPrice.textContent = t('claim.order.priceColumn', 'Price');
      hr.appendChild(thPrice);
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    addOns.forEach(function (a) {
      var id = 'addon-' + containerId + '-' + a.key;
      var row = document.createElement('tr');

      var tdCheck = document.createElement('td');
      tdCheck.className = 'addon-check-cell';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'order-addon-check';
      cb.id = id;
      cb.value = a.key;
      cb.setAttribute('data-key', a.key);
      tdCheck.appendChild(cb);

      var tdLabel = document.createElement('td');
      tdLabel.className = 'addon-label-cell';
      var label = document.createElement('label');
      label.setAttribute('for', id);
      var span = document.createElement('span');
      span.className = 'order-addon-label';
      span.setAttribute('data-key', a.key);
      span.textContent = addonLabel(a);
      label.appendChild(span);
      tdLabel.appendChild(label);

      row.appendChild(tdCheck);
      row.appendChild(tdLabel);
      if (withPrice) {
        var tdPrice = document.createElement('td');
        tdPrice.className = 'addon-price-cell';
        tdPrice.textContent = formatPrice(a.price, a.priceUnit);
        row.appendChild(tdPrice);
      }
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    frag.appendChild(table);
    return frag;
  }

  // Render the add-on tables (Premium = price>0, Free = price===0) + the
  // special-instructions textarea into a container. Idempotent: renders once
  // (re-showing keeps the customer's selections). Empty groups are omitted.
  function renderOrderOptions(containerId) {
    var c = document.getElementById(containerId);
    if (!c) return Promise.resolve();
    if (c.getAttribute('data-rendered') === '1') { c.hidden = false; return Promise.resolve(); }
    return loadAddOnCatalog().then(function (addOns) {
      while (c.firstChild) c.removeChild(c.firstChild);
      var premium = addOns.filter(function (a) { return Number(a.price) > 0; });
      var free = addOns.filter(function (a) { return !(Number(a.price) > 0); });
      if (premium.length) {
        c.appendChild(buildAddOnTable(premium, containerId, 'claim.order.premiumOptionsTitle', 'Premium Options', true));
      }
      if (free.length) {
        c.appendChild(buildAddOnTable(free, containerId, 'claim.order.freeOptionsTitle', 'Free Options', false));
      }
      // Non-optional delivery-fee line item (every order has an effective fee —
      // the partner's own or the Laundromat-Associates default). Display-only.
      if (Number(currentDeliveryFee) > 0) {
        var dfRow = document.createElement('div');
        dfRow.className = 'order-delivery-fee';
        var dfLabel = document.createElement('span');
        dfLabel.className = 'order-delivery-fee-label';
        dfLabel.setAttribute('data-i18n', 'claim.order.deliveryFee');
        dfLabel.textContent = t('claim.order.deliveryFee', 'Delivery fee');
        var dfAmt = document.createElement('span');
        dfAmt.className = 'order-delivery-fee-amount';
        dfAmt.textContent = formatPrice(currentDeliveryFee);
        dfRow.appendChild(dfLabel);
        dfRow.appendChild(dfAmt);
        c.appendChild(dfRow);
      }
      var instrLabel = document.createElement('label');
      instrLabel.className = 'order-options-label';
      instrLabel.setAttribute('data-i18n', 'claim.order.instructionsLabel');
      instrLabel.textContent = t('claim.order.instructionsLabel', 'Special instructions (optional)');
      var ta = document.createElement('textarea');
      ta.className = 'order-options-textarea';
      ta.setAttribute('maxlength', '1000');
      ta.setAttribute('rows', '3');
      ta.setAttribute('data-i18n-placeholder', 'claim.order.instructionsPlaceholder');
      ta.placeholder = t('claim.order.instructionsPlaceholder', 'Anything we should know? (e.g. fold preferences)');
      c.appendChild(instrLabel);
      c.appendChild(ta);
      c.setAttribute('data-rendered', '1');
      c.hidden = false;
    });
  }

  // Read the customer's selections back out of a rendered container.
  function collectOrderOptions(containerId) {
    var c = document.getElementById(containerId);
    if (!c) return { addOns: [], specialInstructions: '' };
    var addOns = Array.prototype.slice.call(c.querySelectorAll('.order-addon-check'))
      .filter(function (cb) { return cb.checked; })
      .map(function (cb) { return cb.getAttribute('data-key'); });
    var ta = c.querySelector('.order-options-textarea');
    return { addOns: addOns, specialInstructions: ta ? ta.value.trim() : '' };
  }

  // On a language switch, re-localize the DYNAMIC add-on labels in place (the
  // static title/label/placeholder carry data-i18n and are handled by
  // i18n.translatePage()). Updating textContent in place preserves the
  // customer's checkbox selections + any typed instructions.
  window.addEventListener('languageChanged', function () {
    loadAddOnCatalog().then(function (addOns) {
      var byKey = {};
      addOns.forEach(function (a) { byKey[a.key] = a; });
      ['customer-order-options', 'pickup-order-options'].forEach(function (id) {
        var c = document.getElementById(id);
        if (!c || c.getAttribute('data-rendered') !== '1') return;
        Array.prototype.slice.call(c.querySelectorAll('.order-addon-label')).forEach(function (span) {
          var a = byKey[span.getAttribute('data-key')];
          if (a) span.textContent = addonLabel(a);
        });
      });
    });
  });

  function renderState(state, data) {
    switch (state) {
    case 'claimable': {
      var affiliate = (data && data.affiliate) || {};
      var name = affiliate.businessName ||
          ((affiliate.firstName || '') + ' ' + (affiliate.lastName || '')).trim() || ((window.BRAND && window.BRAND.name) || 'Laundromat');
      // textContent — never innerHTML (XSS)
      document.getElementById('claim-affiliate-name').textContent = name;
      show('claimable');
      // Submit stays disabled until email (and phone, when enabled) verify.
      updateSubmitState();
      // Load the Firebase phone-verification config (may enable the phone step).
      fetch('/api/v1/firebase-config')
        .then(function (res) { return res.json(); })
        .then(function (cfg) { initFirebasePhone(cfg); updateSubmitState(); })
        .catch(function () { /* phone stays disabled → email-only */ });
      break;
    }
    case 'claimed':
      // Registered bag → staff scan-session overload.
      enterStaffScan();
      break;
    case 'invalid':
    default:
      show('invalid');
      break;
    }
  }

  // ---- staff scan-session flow -----------------------------------------------

  var pending = null; // last resolveData awaiting confirm
  var pendingPickupInstructions = ''; // partner instructions from the last resolve (shown to the customer on start)
  var currentDeliveryFee = 0; // effective delivery fee (partner's own or Laundromat-Associates default) for the order form + summary

  function enterStaffScan() {
    // No persistent session anymore: every bag QR requires a fresh code, so we
    // always show the entry panel (customer phone/email, or the staff-code link).
    if (window.ScanSession) window.ScanSession.clearSession();
    showPanel('claim-scan-code-panel');
  }

  // Staff scan is behind a link that opens #staffCodeModal.
  function openStaffModal(errorText) {
    var errorEl = document.getElementById('scan-code-error');
    if (errorEl) { if (errorText) { errorEl.textContent = errorText; errorEl.hidden = false; } else { errorEl.hidden = true; } }
    var input = document.getElementById('scan-code');
    if (input) input.value = '';
    if (window.ModalSystem && typeof window.ModalSystem.showModal === 'function') {
      window.ModalSystem.showModal('staffCodeModal');
    } else {
      var m = document.getElementById('staffCodeModal');
      if (m) m.classList.add('active');
    }
    if (input) input.focus();
  }

  function closeStaffModal() {
    if (window.ModalSystem && typeof window.ModalSystem.closeActiveModal === 'function') {
      window.ModalSystem.closeActiveModal();
    } else {
      var m = document.getElementById('staffCodeModal');
      if (m) m.classList.remove('active');
    }
  }

  function startSession() {
    var codeInput = document.getElementById('scan-code');
    var errorEl = document.getElementById('scan-code-error');
    errorEl.hidden = true;
    var code = codeInput.value.trim();
    if (!code) return;
    window.ScanSession.init({ mode: 'session' });
    var s = spin(document.getElementById('scan-code-submit'));
    window.ScanSession.mint(bagToken, code)
      .then(function () {
        closeStaffModal();
        resolveAndConfirm();
      })
      .catch(function (err) {
        errorEl.textContent = err.status === 429
          ? t('claim.scan.lockedOut', 'Too many attempts. Please try again later.')
          : t('claim.scan.badCode', "That code didn't match. Please try again.");
        errorEl.hidden = false;
      })
      .then(function () { s.hide(); });
  }

  // Customer self-start (PR C): the registered customer enters their verified
  // phone/email; the server mints a START-ONLY customer session. Same mint +
  // resolve/confirm flow as the staff path — the server decides the actor type.
  function startCustomerSession() {
    var input = document.getElementById('scan-customer-contact');
    var errorEl = document.getElementById('scan-customer-error');
    errorEl.hidden = true;
    var value = input.value.trim();
    if (!value) return;
    window.ScanSession.init({ mode: 'session' });
    var s = spin(document.getElementById('scan-customer-submit'));
    window.ScanSession.mint(bagToken, value)
      .then(function () { return window.ScanSession.resolve(bagToken); })
      .then(function (rd) {
        pendingPickupInstructions = rd.pickupInstructions || '';
        currentDeliveryFee = Number(rd.deliveryFee) || 0;
        if (rd.proposedAction === 'advance' && rd.to === 'complete') {
          // Bag is out for delivery → this scan is the DELIVERY confirmation, not
          // a new order. Confirm "mark delivered?" then complete.
          resolveAndConfirm();
        } else if (rd.proposedAction === 'create-pending') {
          showCustomerActions(); // [Start my order] / [Edit my info]
        } else {
          // An in-store order is mid-flow (intake/store-pickup) or just delivered;
          // the customer is not the actor for those — just report status.
          showOrderResult({ customer: true, alreadyInProgress: true });
        }
      })
      .catch(function (err) {
        errorEl.textContent = err.status === 429
          ? t('claim.scan.lockedOut', 'Too many attempts. Please try again later.')
          : t('claim.scan.badContact', "That phone or email didn't match this bag. Please try again.");
        errorEl.hidden = false;
      })
      .then(function () { s.hide(); });
  }

  // After the customer verifies their contact, offer Edit my info / Start order.
  function showCustomerActions() {
    showPanel('claim-customer-actions');
    renderOrderOptions('customer-order-options');
  }

  // ---- Edit my info (customer self-service via the scan session) --------------
  var editOriginalPhone = '';
  var editPhoneIdToken = null;       // Firebase token for a changed phone
  var pendingPhoneVerify = null;     // { resolve, reject, e164 } while the code modal is open for an edit
  var editFirebaseReady = null;      // cached promise: Firebase loaded for the edit form
  var patchInFlight = false;         // re-entry guard on the save (PATCH /me)

  function custSessionHeaders() {
    var s = window.ScanSession && window.ScanSession.getSession();
    return (s && s.sessionToken) ? { 'x-scan-session': s.sessionToken } : {};
  }
  function setVal(id, v) { var el = document.getElementById(id); if (el) el.value = v || ''; }
  function digits(v) { return String(v || '').replace(/\D/g, ''); }

  function openEditInfo() {
    hideById('edit-info-error'); hideById('edit-info-success');
    editPhoneIdToken = null; pendingPhoneVerify = null;
    var s = spin(document.getElementById('customer-edit-info'));
    fetch('/api/v1/customers/me', { headers: custSessionHeaders() })
      .then(function (res) { return res.json(); })
      .then(function (body) {
        var c = (body && body.customer) || {};
        setVal('edit-firstName', c.firstName); setVal('edit-lastName', c.lastName);
        setVal('edit-phone', c.phone); setVal('edit-email', c.email);
        setVal('edit-address', c.address); setVal('edit-city', c.city);
        setVal('edit-state', c.state); setVal('edit-zipCode', c.zipCode);
        editOriginalPhone = c.phone || '';
        var note = document.getElementById('edit-phone-note');
        if (note) note.hidden = !phoneRequired;
        showPanel('claim-edit-info');
        ensureEditFirebase(); // ready Firebase so a phone change can re-verify
      })
      .catch(function () { showById('edit-info-error', t('claim.edit.loadError', 'Could not load your info. Please try again.')); })
      .then(function () { s.hide(); });
  }

  // Approximate E.164 the same way the SMS-verify + the server (Formatters.e164)
  // do, so client-side change detection matches the server's.
  function toE164(v) {
    var x = String(v || '').trim();
    return x.charAt(0) === '+' ? x.replace(/[^\d+]/g, '') : '+1' + digits(x);
  }

  // Returns a promise that resolves once Firebase phone-verify is ready (or
  // not needed). Claimed bags never ran the registration init, so the edit form
  // lazily loads the SDK and MUST await this before verifying a phone change.
  function ensureEditFirebase() {
    if (phoneEnabled) return Promise.resolve();          // already initialized
    if (editFirebaseReady) return editFirebaseReady;     // load in flight/done
    editFirebaseReady = fetch('/api/v1/firebase-config')
      .then(function (r) { return r.json(); })
      .then(function (cfg) {
        phoneRequired = !!(cfg && cfg.enabled);
        if (!phoneRequired) return;
        return loadFirebaseSdk().then(function () { setupFirebasePhone(cfg); });
      })
      .catch(function () { /* leave phoneEnabled false → a phone change errors clearly */ });
    return editFirebaseReady;
  }

  // Verify a NEW phone number via SMS; resolves with the Firebase ID token.
  // Reuses the shared code modal via pendingPhoneVerify.
  function verifyNewPhoneViaSms(e164) {
    return new Promise(function (resolve, reject) {
      if (!window.firebase || !recaptchaVerifier) { reject(new Error('phone verify unavailable')); return; }
      pendingPhoneVerify = null; // supersede any abandoned verify before starting
      var s = spin(document.getElementById('edit-info-save'));
      window.firebase.auth().signInWithPhoneNumber(e164, recaptchaVerifier)
        .then(function (confirmation) {
          firebaseConfirmation = confirmation;
          pendingPhoneVerify = { resolve: resolve, reject: reject, e164: e164 };
          openCodeModal(t('claim.verify.smsSent', 'Text sent. Enter the code below.'));
        })
        .catch(function (err) { reject(err); })
        .then(function () { s.hide(); });
    });
  }

  function saveEditInfo() {
    hideById('edit-info-error'); hideById('edit-info-success');
    ensureEditFirebase().then(function () {
      var payload = {
        firstName: document.getElementById('edit-firstName').value.trim(),
        lastName: document.getElementById('edit-lastName').value.trim(),
        email: document.getElementById('edit-email').value.trim(),
        address: document.getElementById('edit-address').value.trim(),
        city: document.getElementById('edit-city').value.trim(),
        state: document.getElementById('edit-state').value.trim(),
        zipCode: document.getElementById('edit-zipCode').value.trim()
      };
      var newPhone = document.getElementById('edit-phone').value.trim();
      // Normalize both to E.164 before comparing — matches the server's check.
      var phoneChanged = toE164(newPhone) !== toE164(editOriginalPhone);
      if (phoneChanged) {
        payload.phone = newPhone;
        if (phoneRequired && !editPhoneIdToken) {
          verifyNewPhoneViaSms(toE164(newPhone))
            .then(function (token) { editPhoneIdToken = token; payload.phoneIdToken = token; patchMe(payload); })
            .catch(function () { showById('edit-info-error', t('claim.edit.phoneVerifyFailed', 'Phone verification failed. Please try again.')); });
          return;
        }
        if (editPhoneIdToken) payload.phoneIdToken = editPhoneIdToken;
      }
      patchMe(payload);
    });
  }

  function patchMe(payload) {
    if (patchInFlight) return; // re-entry guard against double-save
    patchInFlight = true;
    var s = spin(document.getElementById('edit-info-save'));
    fetch('/api/v1/customers/me', {
      method: 'PATCH',
      headers: Object.assign({ 'Content-Type': 'application/json' }, custSessionHeaders()),
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.json().then(function (b) { return { status: res.status, body: b }; }); })
      .then(function (r) {
        if (r.status === 200) {
          editOriginalPhone = (r.body.customer && r.body.customer.phone) || editOriginalPhone;
          editPhoneIdToken = null;
          showById('edit-info-success');
          return;
        }
        var code = r.body && r.body.errors && r.body.errors[0] && r.body.errors[0].code;
        var msg = code === 'duplicate_email' ? t('claim.edit.dupEmail', 'That email is already in use.')
          : (code === 'phone_mismatch' || code === 'phone_not_verified') ? t('claim.edit.phoneVerifyFailed', 'Phone verification failed. Please try again.')
            : t('claim.edit.saveError', 'Could not save. Please check your info and try again.');
        showById('edit-info-error', msg);
      })
      .catch(function () { showById('edit-info-error', t('claim.edit.saveError', 'Could not save. Please check your info and try again.')); })
      .then(function () { s.hide(); patchInFlight = false; });
  }

  function resolveAndConfirm() {
    showPanel('claim-scan-confirm-panel');
    document.getElementById('scan-confirm-result').hidden = true;
    document.getElementById('scan-confirm-error').hidden = true;
    hideById('scan-cents-warning');
    window.ScanSession.resolve(bagToken)
      .then(renderConfirm)
      .catch(handleScanError);
  }

  // The confirm panel. Reached by STAFF (any advance) and now by a CUSTOMER
  // confirming their own delivery (out_for_delivery → complete). create-pending →
  // "Start an order?"; advance → the state-driven confirm.
  function renderConfirm(resolveData) {
    pending = resolveData;
    pendingPickupInstructions = resolveData.pickupInstructions || '';
    currentDeliveryFee = Number(resolveData.deliveryFee) || 0;
    // The "update this number in Cents" warning is for STORE STAFF — never show it
    // to a customer confirming their own delivery (it's an out-of-context message).
    var sess = window.ScanSession && window.ScanSession.getSession();
    var isCustomerSession = !!(sess && sess.actorType === 'customer');
    if (resolveData.centsSyncNeeded && !isCustomerSession) {
      showById('scan-cents-warning',
        t('claim.scan.centsSyncWarning', 'Phone changed — update this number in Cents:') + ' ' + (resolveData.customerPhone || ''));
    } else {
      hideById('scan-cents-warning');
    }

    var isStart = resolveData.proposedAction === 'create-pending';
    var promptKey = resolveData.promptKey ? 'claim.' + resolveData.promptKey : null;
    document.getElementById('scan-confirm-prompt').textContent = isStart
      ? t('claim.scan.startAnOrder', 'Start an order?')
      : (promptKey ? t(promptKey, t('claim.scan.confirmGeneric', 'Apply this scan?')) : t('claim.scan.confirmGeneric', 'Apply this scan?'));
    // Start/Cancel for a new order; Yes/No for an advance.
    setText('scan-confirm-yes', isStart ? t('claim.scan.startBtn', 'Start') : t('claim.scan.yes', 'Yes'));
    setText('scan-confirm-no', isStart ? t('claim.scan.cancelBtn', 'Cancel') : t('claim.scan.no', 'No'));

    var c = resolveData.customer;
    document.getElementById('scan-confirm-customer').textContent = c
      ? ((c.firstName || '') + ' ' + (c.lastName || '')).trim()
      : '';

    var needsPayment = resolveData.proposedAction === 'advance' &&
      resolveData.to === 'out_for_delivery';
    var paymentRow = document.getElementById('scan-payment-row');
    paymentRow.hidden = !needsPayment;
    document.getElementById('scan-payment-confirmed').checked = false;
  }

  function onConfirmYes() {
    if (!pending) return;
    var resolveData = pending;
    var opts = {};
    if (resolveData.proposedAction === 'advance' && resolveData.to === 'out_for_delivery') {
      opts.paymentConfirmed = document.getElementById('scan-payment-confirmed').checked;
    }
    if (resolveData.proposedAction === 'delivery-rescan-prompt') {
      opts.reopen = true;
    }
    applyAction(resolveData.proposedAction, opts);
  }

  function onConfirmNo() {
    if (pending && pending.proposedAction === 'delivery-rescan-prompt') {
      applyAction('delivery-rescan-prompt', { reopen: false });
      return;
    }
    // Cancel — no order started; back to the entry panel.
    pending = null;
    showPanel('claim-scan-code-panel');
  }

  // Customer self-start: start the order directly (no extra confirm — the
  // [Start my order] button IS the confirmation) and show the partner pickup
  // instructions + "order received".
  function customerStartOrder() {
    hideById('customer-start-error');
    var orderOptions = collectOrderOptions('customer-order-options');
    var s = spin(document.getElementById('customer-start-order'));
    window.ScanSession.resolve(bagToken)
      .then(function (rd) {
        pendingPickupInstructions = rd.pickupInstructions || '';
        currentDeliveryFee = Number(rd.deliveryFee) || 0;
        if (rd.proposedAction === 'create-pending') {
          return window.ScanSession.apply(bagToken, 'create-pending', orderOptions)
            .then(function (res) {
              showOrderResult({
                customer: true, alreadyInProgress: false,
                firstOrder: !!(res && res.firstOrder),
                emailVerified: !!(res && res.emailVerified)
              });
            });
        }
        // Customer is start-only; an order already exists for this bag.
        showOrderResult({ customer: true, alreadyInProgress: true });
      })
      .catch(function (err) {
        // Race: an order was opened between this customer's resolve and apply —
        // either the action drifted (409) or the customer is start-only and the
        // bag now has an advancing order (403). Either way it's in progress.
        if (err && (err.code === 'state_changed' || err.code === 'customer_not_allowed')) {
          showOrderResult({ customer: true, alreadyInProgress: true });
          return;
        }
        if (err && err.status === 401) {
          // Their short-lived start session lapsed — re-enter the contact.
          if (window.ScanSession) window.ScanSession.clearSession();
          showPanel('claim-scan-code-panel');
          showById('scan-customer-error', t('claim.scan.sessionExpired', 'Your session expired. Please enter your code again.'));
          return;
        }
        showById('customer-start-error', t('claim.pickup.error', 'Could not request pickup. Please try again.'));
      })
      .then(function () { s.hide(); });
  }

  // Final "order received" screen. Customers also see the partner pickup
  // instructions; staff do not.
  function showOrderResult(opts) {
    showPanel('claim-order-result');
    var title;
    if (opts.delivered) {
      title = t('claim.scan.deliveredConfirmed', 'Delivered — thank you! This order is complete.');
    } else if (opts.alreadyInProgress) {
      title = t('claim.scan.alreadyInProgress', 'Your order is already in progress.');
    } else {
      title = t('claim.scan.orderReceived', 'Order received — your provider has been notified.');
    }
    setText('order-result-title', title);
    var block = document.getElementById('order-result-instructions');
    // Pickup/drop-off instructions are for a NEW order start, not a delivery.
    if (opts.customer && !opts.delivered && pendingPickupInstructions) {
      setText('order-result-instructions-text', pendingPickupInstructions);
      if (block) block.hidden = false;
    } else if (block) {
      block.hidden = true;
    }
    // Delivery-fee line on the confirmation summary (new order start only).
    var feeEl = document.getElementById('order-result-delivery-fee');
    if (feeEl) {
      if (opts.customer && !opts.delivered && Number(currentDeliveryFee) > 0) {
        // Label as a data-i18n span so it re-localizes on a language switch;
        // amount follows as a plain text node. CSP-clean (no innerHTML).
        while (feeEl.firstChild) feeEl.removeChild(feeEl.firstChild);
        var feeLbl = document.createElement('span');
        feeLbl.setAttribute('data-i18n', 'claim.order.deliveryFee');
        feeLbl.textContent = t('claim.order.deliveryFee', 'Delivery fee');
        feeEl.appendChild(feeLbl);
        feeEl.appendChild(document.createTextNode(': ' + formatPrice(currentDeliveryFee)));
        feeEl.hidden = false;
      } else {
        feeEl.hidden = true;
      }
    }
    showStartReminders(opts);
  }

  // First-order onboarding reminders shown on the "order received" screen:
  // confirm-your-email (only if not yet verified) + the Cents payment-SMS notice.
  function showStartReminders(opts) {
    var wrap = document.getElementById('order-reminders');
    if (!wrap) return;
    if (!opts || !opts.firstOrder) { wrap.hidden = true; return; }
    var emailLine = document.getElementById('order-reminder-email');
    if (emailLine) emailLine.hidden = !!opts.emailVerified; // hide once email is confirmed
    wrap.hidden = false;
  }

  function applyAction(expectedAction, opts) {
    var resultEl = document.getElementById('scan-confirm-result');
    var errorEl = document.getElementById('scan-confirm-error');
    resultEl.hidden = true;
    errorEl.hidden = true;
    window.ScanSession.apply(bagToken, expectedAction, opts)
      .then(function (result) {
        pending = null;
        if (result.action === 'create-pending') {
          // Staff started the order → "order received" (no pickup instructions).
          showOrderResult({ customer: false });
          return;
        }
        if (result.newStatus === 'complete') {
          // Delivery confirmed (out_for_delivery → complete) — by an operator code
          // or the registered bag owner's phone. Show the delivery confirmation.
          showOrderResult({ delivered: true });
          return;
        }
        // Advance / no-op on an in-progress bag (staff). No batch "scan next".
        if (result.action !== 'no-op') {
          document.getElementById('scan-undo').hidden = false;
        }
        resultEl.textContent = t('claim.scan.applied', 'Done.');
        resultEl.hidden = false;
        document.getElementById('scan-confirm-prompt').textContent = '';
        document.getElementById('scan-confirm-customer').textContent = '';
        document.getElementById('scan-payment-row').hidden = true;
      })
      .catch(function (err) {
        if (err.status === 409 && err.code === 'state_changed') {
          errorEl.textContent = t('claim.scan.stateChanged', 'Bag state changed — please re-scan');
          errorEl.hidden = false;
          resolveAndConfirm();
          return;
        }
        if (err.status === 403 && err.code === 'customer_not_allowed') {
          errorEl.textContent = t('claim.scan.customerNotAllowed',
            'This step is handled by store staff. Your order is already in progress.');
          errorEl.hidden = false;
          return;
        }
        handleScanError(err);
      });
  }

  function onUndo() {
    window.ScanSession.undo(bagToken)
      .then(function (result) {
        var resultEl = document.getElementById('scan-confirm-result');
        if (result.undone) {
          resultEl.textContent = t('claim.scan.undone', 'Last scan undone.');
        } else {
          resultEl.textContent = t('claim.scan.nothingToUndo', 'Nothing to undo.');
        }
        resultEl.hidden = false;
        document.getElementById('scan-undo').hidden = true;
      })
      .catch(handleScanError);
  }

  function handleScanError(err) {
    var errorEl = document.getElementById('scan-confirm-error');
    if (err.status === 401) {
      // session expired/invalidated — fall back to the start panel and reopen
      // the staff code modal so a partner can re-enter their code.
      if (window.ScanSession) window.ScanSession.clearSession();
      showPanel('claim-scan-code-panel');
      openStaffModal(t('claim.scan.sessionExpired', 'Your session expired. Please enter your code again.'));
      return;
    }
    errorEl.textContent = (err.status === 404 || err.code === 'bag_not_registered')
      ? t('claim.scan.notRegistered', 'Bag not registered')
      : (err.message || t('claim.scan.networkError', 'Network error — please try again.'));
    errorEl.hidden = false;
  }

  // ---- customer registration branch (PR 7: email + phone verification) ------

  // Verification state held in the closure (never trusted by the server — the
  // server re-verifies the Firebase phone token). Email is optional/unverified.
  var phoneIdToken = null;           // Firebase phone ID token (flag on)
  var phoneRequired = false;         // server says phone verification is required (config.enabled)
  var phoneEnabled = false;          // the Firebase SDK actually loaded + initialized (Send button works)
  var firebaseConfirmation = null;   // Firebase confirmationResult
  var recaptchaVerifier = null;

  function showFormError(message) {
    var el = document.getElementById('claim-form-error');
    el.textContent = message;
    el.hidden = false;
  }

  function showById(id, text) {
    var el = document.getElementById(id);
    if (!el) return;
    if (typeof text === 'string') el.textContent = text;
    el.hidden = false;
  }
  function hideById(id) { var el = document.getElementById(id); if (el) el.hidden = true; }

  function resolveBag() {
    if (!bagToken) { renderState('invalid'); return; }
    fetch('/api/v1/customers/claim/' + encodeURIComponent(bagToken))
      .then(function (res) { return res.json(); })
      .then(function (body) { renderState(body.state, body); })
      .catch(function () { renderState('invalid'); });
  }

  // ---- spinner + confirmation-code modal -------------------------------------

  // Show a FULL-PAGE swirl spinner during a server round-trip (send SMS / verify
  // / submit); returns a handle with hide(). The passed button is also disabled
  // to prevent a double-submit. Falls back to a plain disable if the lib isn't
  // loaded.
  function spin(btn) {
    if (btn) btn.disabled = true;
    if (window.SwirlSpinnerUtils && typeof window.SwirlSpinnerUtils.showGlobal === 'function') {
      try {
        var handle = window.SwirlSpinnerUtils.showGlobal();
        return { hide: function () { try { handle.hide(); } catch (e) { /* noop */ } if (btn) btn.disabled = false; } };
      } catch (e) { /* fall through */ }
    }
    return { hide: function () { if (btn) btn.disabled = false; } };
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el && typeof text === 'string') el.textContent = text;
  }

  // The code modal is SMS-only (email is no longer verified).
  function openCodeModal(statusText) {
    setText('claimCodeTitle', t('claim.verify.modalTitlePhone', 'Enter your SMS code'));
    setText('claimCodeStatus', statusText || '');
    var input = document.getElementById('claimCodeInput');
    if (input) input.value = '';
    hideById('claimCodeError');
    if (window.ModalSystem && typeof window.ModalSystem.showModal === 'function') {
      window.ModalSystem.showModal('claimCodeModal');
    } else {
      var m = document.getElementById('claimCodeModal');
      if (m) m.classList.add('active');
    }
    if (input) input.focus();
  }

  function closeCodeModal() {
    if (window.ModalSystem && typeof window.ModalSystem.closeActiveModal === 'function') {
      window.ModalSystem.closeActiveModal();
    } else {
      var m = document.getElementById('claimCodeModal');
      if (m) m.classList.remove('active');
    }
  }

  function onCodeVerify() { verifyPhoneSms(); }
  function onCodeResend() {
    // Edit-flow re-verification resends to the new number; else the registration phone.
    if (pendingPhoneVerify && window.firebase && recaptchaVerifier) {
      var e164 = pendingPhoneVerify.e164;
      window.firebase.auth().signInWithPhoneNumber(e164, recaptchaVerifier)
        .then(function (confirmation) { firebaseConfirmation = confirmation; })
        .catch(function () { showById('claimCodeError', t('claim.verify.recaptchaError', 'Verification check failed. Please reload and try again.')); });
      return;
    }
    sendPhoneSms(true);
  }

  // ---- Firebase phone --------------------------------------------------------

  // The Firebase compat SDK (~170 KB) is only needed for the phone-verification
  // step, which is a later interaction — it MUST stay off the initial critical
  // path so it doesn't delay revealing the registration form (the LCP element).
  // So we lazy-load the two vendored SDK files on demand, only when the server
  // says phone verification is enabled. CSP-safe: self-hosted /assets/js/vendor/
  // files injected with the page nonce, loaded sequentially (app before auth).
  var firebaseSdkPromise = null;
  function loadFirebaseSdk() {
    if (firebaseSdkPromise) return firebaseSdkPromise;
    var nonce = window.CSP_NONCE ||
      (document.querySelector('meta[name="csp-nonce"]') || {}).content || '';
    function inject(src) {
      return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src;
        if (nonce) s.nonce = nonce;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    firebaseSdkPromise = inject('/assets/js/vendor/firebase-app-compat.js')
      .then(function () { return inject('/assets/js/vendor/firebase-auth-compat.js'); });
    return firebaseSdkPromise;
  }

  function initFirebasePhone(config) {
    // phoneRequired is server-driven and is the SUBMIT GATE — independent of
    // whether the SDK loads. If the SDK fails while phone is required, the form
    // stays blocked (isVerified) and we surface a clear error rather than
    // silently letting a submit through that the server will reject.
    phoneRequired = !!(config && config.enabled);
    if (!phoneRequired) { phoneEnabled = false; return; }
    // Defer SDK download until we know phone verification is on, then init.
    loadFirebaseSdk()
      .then(function () { setupFirebasePhone(config); updateSubmitState(); })
      .catch(function () { onPhoneSetupFailed(); });
  }

  function onPhoneSetupFailed() {
    phoneEnabled = false;
    // Phone is required but unavailable — keep submit disabled and explain why.
    showFormError(t('claim.verify.phoneUnavailable',
      'Phone verification is temporarily unavailable. Please reload the page and try again.'));
    updateSubmitState();
  }

  function setupFirebasePhone(config) {
    phoneEnabled = !!window.firebase;
    if (!phoneEnabled) { onPhoneSetupFailed(); return; }
    try {
      if (!window.firebase.apps || !window.firebase.apps.length) {
        window.firebase.initializeApp({
          apiKey: config.apiKey, authDomain: config.authDomain,
          projectId: config.projectId, storageBucket: config.storageBucket,
          messagingSenderId: config.messagingSenderId, appId: config.appId
        });
      }
      recaptchaVerifier = new window.firebase.auth.RecaptchaVerifier('recaptcha-container', { size: 'invisible' });
      var sendBtn = document.getElementById('phoneSendSms');
      if (sendBtn) sendBtn.hidden = false;
    } catch (e) {
      onPhoneSetupFailed();
    }
  }

  function sendPhoneSms(isResend) {
    // Registration phone verify — clear any abandoned edit-flow promise so a
    // stale pendingPhoneVerify can't hijack this registration token.
    pendingPhoneVerify = null;
    var phone = document.getElementById('phone').value.trim();
    hideById('phone-verify-error');
    hideById('claimCodeError');
    if (!phone) { showById('phone-verify-error', t('claim.verify.enterPhoneFirst', 'Enter your phone number first.')); return; }
    var e164 = phone.charAt(0) === '+' ? phone.replace(/[^\d+]/g, '') : '+1' + phone.replace(/\D/g, '');
    var s = spin(document.getElementById(isResend ? 'claimCodeResend' : 'phoneSendSms'));
    window.firebase.auth().signInWithPhoneNumber(e164, recaptchaVerifier)
      .then(function (confirmation) {
        firebaseConfirmation = confirmation;
        openCodeModal(t('claim.verify.smsSent', 'Text sent. Enter the code below.'));
      })
      .catch(function (err) {
        // Surface the actual Firebase error (code + message) so config issues
        // (auth/operation-not-allowed, auth/invalid-app-credential,
        // auth/captcha-check-failed, …) are diagnosable from the page itself
        // rather than hidden behind a generic message.
        if (window.console && console.error) console.error('signInWithPhoneNumber failed:', err);
        var detail = (err && (err.code || err.message)) ? ' [' + (err.code || '') + ' ' + (err.message || '') + ']' : '';
        var target = isResend ? 'claimCodeError' : 'phone-verify-error';
        showById(target,
          t('claim.verify.recaptchaError', 'Verification check failed. Please reload and try again.') + detail);
      })
      .then(function () { s.hide(); });
  }

  function verifyPhoneSms() {
    var code = document.getElementById('claimCodeInput').value.trim();
    hideById('claimCodeError');
    if (!firebaseConfirmation) { showById('claimCodeError', t('claim.verify.invalidSms', 'That SMS code is incorrect. Please try again.')); return; }
    var s = spin(document.getElementById('claimCodeVerify'));
    firebaseConfirmation.confirm(code)
      .then(function (result) { return result.user.getIdToken(); })
      .then(function (token) {
        closeCodeModal();
        // Edit-my-info phone re-verification: hand the token back to saveEditInfo.
        if (pendingPhoneVerify) {
          var p = pendingPhoneVerify; pendingPhoneVerify = null; p.resolve(token); return;
        }
        // Registration path.
        phoneIdToken = token;
        // Remove the Send button once verified — the badge replaces it.
        hideById('phoneSendSms');
        showById('phone-verified-badge');
        // The verified number is now immutable — editing it would invalidate the
        // SMS token. (To change it, the user reloads and re-verifies.)
        var phoneInput = document.getElementById('phone');
        if (phoneInput) { phoneInput.readOnly = true; phoneInput.setAttribute('aria-readonly', 'true'); }
        updateSubmitState();
      })
      .catch(function () {
        showById('claimCodeError', t('claim.verify.invalidSms', 'That SMS code is incorrect. Please try again.'));
      })
      .then(function () { s.hide(); });
  }

  // ---- gating + submit -------------------------------------------------------

  // ---- registered confirmation: pickup / drop-off instructions ---------------

  var registeredPhone = null;     // the phone just registered (to mint a customer session)
  var registeredEmail = null;     // the email just registered (shown in the confirm-email notice)
  var registeredAffiliate = null; // { serviceType, pickupInstructions } from the register response

  function renderRegistered(affiliateData) {
    registeredAffiliate = affiliateData || {};
    currentDeliveryFee = Number(registeredAffiliate.deliveryFee) || 0;
    show('registered');
    // Every partner type: offer to start the order now (or scan the bag QR later),
    // and tell the customer to confirm their email for future notifications.
    showById('requestPickupBtn');
    showById('start-order-callout');
    renderOrderOptions('pickup-order-options');
    showEmailNotice();
    if (registeredAffiliate.serviceType === 'full_service') {
      // Full-service: instructions appear after the order is started.
      hideById('pickupInstructionsBlock');
    } else {
      // Pickup location (or unconfigured): show the drop-off instructions now too.
      showPickupInstructions(t('claim.pickup.dropOffTitle', 'How to drop off your bag'));
    }
  }

  // Welcome-email confirmation notice: shows the address we emailed + the
  // confirm-for-notifications + check-spam guidance.
  function showEmailNotice() {
    setText('claim-email-address', registeredEmail || '');
    showById('claim-email-notice');
  }

  function instructionsText() {
    var txt = registeredAffiliate && registeredAffiliate.pickupInstructions;
    return (txt && String(txt).trim())
      ? txt
      : t('claim.pickup.fallback', 'Your laundry partner will be in touch with what to do next.');
  }

  function showPickupInstructions(title) {
    setText('pickupInstructionsTitle', title);
    setText('pickupInstructionsText', instructionsText());
    showById('pickupInstructionsBlock');
  }

  // "Request pickup now" — start the order with the just-registered phone,
  // reusing the customer-initiated scan flow (mint → resolve → create-pending).
  var pickupRequesting = false; // re-entry guard against double-taps

  function pickupErrorFor(err) {
    var s = err && err.status;
    if (s === 429) return t('claim.pickup.tooManyAttempts', 'Too many attempts. Please try again in a few minutes.');
    if (s === 401 || s === 403) return t('claim.pickup.cannotVerify', "We couldn't start your order automatically. Your provider will be in touch.");
    return t('claim.pickup.error', 'Could not request pickup. Please try again.');
  }

  function requestPickupNow() {
    hideById('requestPickupError');
    if (pickupRequesting) return; // ignore double-taps
    var orderOptions = collectOrderOptions('pickup-order-options');
    // Normalize to digits so the contact reliably matches the bag's customer
    // (matchesCustomerContact compares last-10 digits; needs ≥10).
    var contact = String(registeredPhone || '').replace(/\D/g, '');
    if (contact.length < 10 || !window.ScanSession) {
      showById('requestPickupError', t('claim.pickup.error', 'Could not request pickup. Please try again.'));
      return;
    }
    pickupRequesting = true;
    var btn = document.getElementById('requestPickupBtn');
    var s = spin(btn);
    var orderCreated = false;
    window.ScanSession.init({ mode: 'session' });
    window.ScanSession.mint(bagToken, contact)
      .then(function () { return window.ScanSession.resolve(bagToken); })
      .then(function (resolveData) {
        if (resolveData && resolveData.proposedAction && resolveData.proposedAction !== 'create-pending') {
          // An order already exists for this bag — nothing new to create.
          return null;
        }
        orderCreated = true;
        return window.ScanSession.apply(bagToken, 'create-pending', orderOptions);
      })
      .then(function (res) {
        hideById('requestPickupBtn');
        hideById('start-order-callout');
        hideById('pickup-order-options'); // order placed → retire the now-dead add-on form
        showPickupInstructions(orderCreated
          ? t('claim.pickup.requestedTitle', 'Your order request has been received')
          : t('claim.pickup.alreadyStartedTitle', 'Your order is already in progress'));
        // First order: also surface the Cents payment-SMS notice (the welcome-email
        // confirm reminder is already shown on this registration confirmation).
        if (orderCreated && res && res.firstOrder) showById('cents-sms-notice');
      })
      .catch(function (err) {
        showById('requestPickupError', pickupErrorFor(err));
      })
      .then(function () { s.hide(); pickupRequesting = false; });
  }

  function isVerified() {
    // Phone is the only required verification — gated on phoneREQUIRED (server),
    // not on whether the SDK loaded, so an SDK failure can't open the gate.
    // Email is optional.
    if (phoneRequired && !phoneIdToken) return false;
    return true;
  }

  function updateSubmitState() {
    var submit = document.getElementById('claimSubmit');
    if (submit) submit.disabled = !isVerified();
    // Show the "SMS validation required" note until the phone is verified; hide it
    // once verified (or when phone verification isn't required).
    var smsNote = document.getElementById('sms-required-note');
    if (smsNote) smsNote.hidden = !(phoneRequired && !phoneIdToken);
  }

  function submitRegistration(event) {
    event.preventDefault();
    var form = document.getElementById('claimRegistrationForm');
    var fields = form.elements;
    var submit = document.getElementById('claimSubmit');

    if (phoneRequired && !phoneIdToken) {
      showFormError(t('claim.verify.phoneRequired', 'Please verify your phone number to continue.'));
      return;
    }
    var s = spin(submit);

    var payload = {
      firstName: fields.firstName.value.trim(),
      lastName: fields.lastName.value.trim(),
      phone: fields.phone.value.trim(),
      address: fields.address.value.trim(),
      city: fields.city.value.trim(),
      state: fields.state.value.trim(),
      zipCode: fields.zipCode.value.trim(),
      languagePreference: localStorage.getItem('selectedLanguage') || 'en'
    };
    // Email is optional — only send it when provided.
    var emailVal = fields.email.value.trim();
    if (emailVal) payload.email = emailVal;
    if (phoneRequired && phoneIdToken) payload.phoneIdToken = phoneIdToken;

    fetch('/api/v1/customers/claim/' + encodeURIComponent(bagToken) + '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.json().then(function (body) { return { status: res.status, body: body }; }); })
      .then(function (result) {
        if (result.status === 201) {
          // Phase 1: registration-only — no customer portal to land in.
          // Show the success state with the right next step for this partner.
          registeredPhone = payload.phone;
          registeredEmail = (result.body && result.body.customerData && result.body.customerData.email) || payload.email || '';
          renderRegistered((result.body && result.body.affiliateData) || {});
          return;
        }
        if (result.status === 409) {
          var raceMsg = t('claim.raceLost',
            'Someone just claimed this bag. If that was you on another device, you\'re all set.');
          showFormError(raceMsg);
          return;
        }
        if (result.body && result.body.code === 'outside_service_area') {
          showFormError(t('claim.outsideServiceArea',
            'This address is outside this provider\'s service area. Please use an address within range, or contact the provider.'));
          return;
        }
        var msg = result.body.message || 'Registration failed';
        if (result.body.errors && result.body.errors.length) {
          msg = result.body.errors.map(function (e) { return e.msg; }).join(' ');
        }
        showFormError(msg);
      })
      .catch(function () {
        showFormError(t('claim.networkError', 'Network error — please try again.'));
      })
      .then(function () { s.hide(); });
  }

  function init() {
    document.getElementById('claimRegistrationForm')
      .addEventListener('submit', submitRegistration);

    // Phone verification controls (CSP: addEventListener only). Wrap the send
    // handler so the click Event isn't passed as the isResend flag.
    var phoneSendSms = document.getElementById('phoneSendSms');
    if (phoneSendSms) phoneSendSms.addEventListener('click', function () { sendPhoneSms(false); });

    // Registered-confirmation "Request pickup now" (full-service partners).
    var pickupBtn = document.getElementById('requestPickupBtn');
    if (pickupBtn) pickupBtn.addEventListener('click', requestPickupNow);

    // SMS confirmation-code modal.
    var codeVerify = document.getElementById('claimCodeVerify');
    if (codeVerify) codeVerify.addEventListener('click', onCodeVerify);
    var codeResend = document.getElementById('claimCodeResend');
    if (codeResend) codeResend.addEventListener('click', onCodeResend);
    var codeInput = document.getElementById('claimCodeInput');
    if (codeInput) codeInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); onCodeVerify(); }
    });

    // Staff scan-session controls (CSP: addEventListener only, no inline handlers).
    // Customer self-start is primary; staff code lives behind a link → modal.
    var custBtn = document.getElementById('scan-customer-submit');
    if (custBtn) custBtn.addEventListener('click', startCustomerSession);
    var custInput = document.getElementById('scan-customer-contact');
    if (custInput) custInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); startCustomerSession(); }
    });
    var staffLink = document.getElementById('scan-staff-link');
    if (staffLink) staffLink.addEventListener('click', function (e) { e.preventDefault(); openStaffModal(); });

    // Customer two-button actions + edit-my-info form.
    var startOrderBtn = document.getElementById('customer-start-order');
    if (startOrderBtn) startOrderBtn.addEventListener('click', customerStartOrder);
    var editInfoBtn = document.getElementById('customer-edit-info');
    if (editInfoBtn) editInfoBtn.addEventListener('click', openEditInfo);
    var editSave = document.getElementById('edit-info-save');
    if (editSave) editSave.addEventListener('click', saveEditInfo);
    var editCancel = document.getElementById('edit-info-cancel');
    if (editCancel) editCancel.addEventListener('click', showCustomerActions);
    var codeBtn = document.getElementById('scan-code-submit');
    if (codeBtn) codeBtn.addEventListener('click', startSession);
    var scanCodeInput = document.getElementById('scan-code');
    if (scanCodeInput) scanCodeInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); startSession(); }
    });
    var yesBtn = document.getElementById('scan-confirm-yes');
    if (yesBtn) yesBtn.addEventListener('click', onConfirmYes);
    var noBtn = document.getElementById('scan-confirm-no');
    if (noBtn) noBtn.addEventListener('click', onConfirmNo);
    var undoBtn = document.getElementById('scan-undo');
    if (undoBtn) undoBtn.addEventListener('click', onUndo);

    resolveBag();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
