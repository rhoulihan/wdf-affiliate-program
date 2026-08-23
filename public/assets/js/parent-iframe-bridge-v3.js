/* Laundromat Parent-Iframe Bridge V3
 * Runs on the host (parent) page. Clean re-implementation of v2 — drops the
 * Walibu / Google Translate scaffolding, adds location-data + navigate
 * message types, integrates with native data-i18n switcher.
 *
 * Contract (PostMessage protocol):
 *   parent → iframe:
 *     parent-ready        ()
 *     current-language    { language }
 *     language-change     { language }
 *     location-data       { ...LOCATION_DATA }   [v3 addition]
 *
 *   iframe → parent:
 *     iframe-ready              { page, timestamp }
 *     request-language          ()
 *     request-location-data     ()                [v3 addition]
 *     resize                    { height, page }
 *     seo-data                  { meta, openGraph, twitter, structuredData }
 *     navigate                  { href }          [v3 addition]
 *     hide-page-header          ()                [legacy, accepted but no-op on v3]
 */
(function () {
  'use strict';

  const LANGUAGE_KEY = 'wavemax-language';
  // Origin whitelist for INCOMING messages from the iframe.
  // Outgoing parent→iframe sends use targetOrigin '*' (defensible: payloads
  // are public chrome data; the iframe's own bridge applies an origin check
  // on receipt). Incoming traffic IS validated here. Production hosts are
  // explicit; any localhost / 127.0.0.1 port is also allowed for dev (test
  // server on 3101, dev server on 3001, app server on 3000, etc.) so we
  // don't need per-environment config.
  const DEV_HOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  const ALLOWED_ORIGINS = [
    'https://rundberglaundry.com',
    'https://affiliate.rundberglaundry.com',
    // Per-location domains that proxy the Austin franchise content
    'https://atxwashateria.com',
    'https://atxwashdryfold.com',
    'https://runberglaundry.com',
    'https://rundberglaundry.com'
  ];

  let iframe = null;
  let lastIframeHeight = 0;
  let lastLanguage = null;
  let locationData = null;
  let parentReadyTimer = null;

  // Listeners that don't depend on the iframe element existing yet —
  // attach these eagerly so we don't drop events when the bridge runs
  // BEFORE the host script creates/mounts the iframe (which is exactly
  // what happens on austin-host-mock.html: the bridge's DOMContentLoaded
  // handler fires before austin-host-mock.js's loadIframeRoute() injects
  // the <iframe id="wavemax-iframe">). sendToIframe() / sendLocationData()
  // bail out cleanly when iframe is null, and findIframe() is called
  // again on every send, so late-arriving iframes are discovered.
  locationData = window.LOCATION_DATA || null;
  lastLanguage = localStorage.getItem(LANGUAGE_KEY) || 'en';
  window.addEventListener('message', handleMessage);
  window.addEventListener('languageChanged', onCustomLanguageEvent);
  window.addEventListener('storage', onStorageEvent);

  function findIframe() {
    return document.getElementById('wavemax-iframe') ||
           document.querySelector('iframe[data-wm-bridge]') ||
           document.querySelector('iframe[src*="rundberglaundry.com"]');
  }

  function init() {
    iframe = findIframe();
    if (!iframe) {
      // Iframe not mounted yet — watch for it. Once present, finish
      // setup. MutationObserver is cheap, scoped to body, and stops
      // observing as soon as the iframe is found.
      const obs = new MutationObserver(() => {
        const found = findIframe();
        if (found) {
          obs.disconnect();
          iframe = found;
          finishInit();
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      return;
    }
    finishInit();
  }

  function finishInit() {
    // Notify iframe that parent is ready (after the iframe has had time to
    // mount its own listener — small debounce instead of a fixed timer).
    parentReadyTimer = setTimeout(() => {
      sendToIframe({ type: 'parent-ready' });
    }, 250);
  }

  function isAllowedOrigin(origin) {
    if (!origin) return false;
    if (ALLOWED_ORIGINS.some(allowed => origin === allowed)) return true;
    if (DEV_HOST_PATTERN.test(origin)) return true;
    return false;
  }

  function handleMessage(event) {
    if (!isAllowedOrigin(event.origin) || !event.data || !event.data.type) {
      return;
    }

    const { type, data } = event.data;

    switch (type) {
      case 'iframe-ready':
        onIframeReady();
        break;
      case 'request-language':
        sendCurrentLanguage();
        break;
      case 'request-location-data':
        sendLocationData();
        break;
      case 'resize':
        if (data && Number.isFinite(Number(data.height))) {
          resizeIframe(Number(data.height));
        }
        break;
      case 'seo-data':
        if (data) applySeoData(data);
        break;
      case 'navigate':
        if (data && typeof data.href === 'string') {
          handleNavigate(data.href);
        }
        break;
      case 'hide-page-header':
        // Legacy v2 message — no-op on v3 because the host doesn't have a
        // hidden Walibu page-header section. Kept accepted to avoid noise.
        break;
      case 'show-modal':
        if (data) showStatusModal(data);
        break;
      case 'hide-modal':
        hideStatusModal();
        break;
      case 'scroll-to':
        if (data && Number.isFinite(Number(data.offset))) {
          scrollToIframeOffset(Number(data.offset));
        }
        break;
      default:
        // Unknown message — ignore, don't error. Forward-compat.
        break;
    }
  }

  function onIframeReady() {
    sendCurrentLanguage();
    sendLocationData();
  }

  function sendToIframe(message) {
    // Re-resolve the iframe on every send so late-mounted iframes (the
    // host script injects the iframe after our bridge initializes) and
    // route changes that swap the iframe element both work without
    // requiring an explicit re-init. iframe ref is cached but always
    // re-fetched from the DOM as a safety net.
    if (!iframe || !iframe.contentWindow) {
      iframe = findIframe();
    }
    if (iframe && iframe.contentWindow) {
      try {
        iframe.contentWindow.postMessage(message, '*');
      } catch (e) {
        // Cross-origin postMessage with '*' should not throw, but defensive.
      }
    }
  }

  function sendCurrentLanguage() {
    sendToIframe({
      type: 'current-language',
      data: { language: localStorage.getItem(LANGUAGE_KEY) || 'en' }
    });
  }

  function sendLocationData() {
    if (!locationData) return;
    sendToIframe({
      type: 'location-data',
      data: locationData
    });
  }

  function broadcastLanguageChange(language) {
    if (language === lastLanguage) return;
    lastLanguage = language;
    sendToIframe({
      type: 'language-change',
      data: { language }
    });
  }

  function onCustomLanguageEvent(e) {
    const lang = e?.detail?.language;
    if (lang) broadcastLanguageChange(lang);
  }

  function onStorageEvent(e) {
    if (e.key === LANGUAGE_KEY && e.newValue) {
      broadcastLanguageChange(e.newValue);
    }
  }

  function resizeIframe(height) {
    if (!iframe) return;
    if (Math.abs(height - lastIframeHeight) > 5) {
      lastIframeHeight = height;
      iframe.style.height = height + 'px';
    }
  }

  // The iframe runs at full content height (no internal scroll), so the
  // parent owns the scroll position. The iframe sends an offset measured
  // from its own document top; we add the iframe's position in the parent
  // document to compute the parent scroll target.
  function scrollToIframeOffset(offset) {
    if (!iframe) iframe = findIframe();
    if (!iframe) return;
    const iframeTop = iframe.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: iframeTop + offset, behavior: 'smooth' });
  }

  /* ---------- SEO injection ---------- */

  function applySeoData(seo) {
    if (seo.meta) {
      if (seo.meta.title) document.title = seo.meta.title;
      setMetaName('description', seo.meta.description);
      setMetaName('keywords', seo.meta.keywords);
      setMetaName('author', seo.meta.author);
      setLink('canonical', seo.meta.canonicalUrl);
    }

    if (seo.openGraph) {
      setMetaProperty('og:title', seo.openGraph.title);
      setMetaProperty('og:description', seo.openGraph.description);
      setMetaProperty('og:type', seo.openGraph.type);
      setMetaProperty('og:url', seo.openGraph.url);
      setMetaProperty('og:image', seo.openGraph.image);
      setMetaProperty('og:image:width', seo.openGraph.imageWidth);
      setMetaProperty('og:image:height', seo.openGraph.imageHeight);
      setMetaProperty('og:site_name', seo.openGraph.siteName);
      setMetaProperty('og:locale', seo.openGraph.locale);
    }

    if (seo.twitter) {
      setMetaName('twitter:card', seo.twitter.card);
      setMetaName('twitter:site', seo.twitter.site);
      setMetaName('twitter:title', seo.twitter.title);
      setMetaName('twitter:description', seo.twitter.description);
      setMetaName('twitter:image', seo.twitter.image);
      setMetaName('twitter:image:alt', seo.twitter.imageAlt);
    }

    if (seo.structuredData) {
      // Replace previous bridge-injected JSON-LD blocks
      document.querySelectorAll('script[type="application/ld+json"][data-wm-bridge]').forEach(el => el.remove());
      Object.keys(seo.structuredData).forEach(schemaKey => {
        const node = document.createElement('script');
        node.type = 'application/ld+json';
        node.setAttribute('data-wm-bridge', '1');
        node.setAttribute('data-wm-bridge-schema', schemaKey);
        node.textContent = JSON.stringify(seo.structuredData[schemaKey]);
        document.head.appendChild(node);
      });
    }

    if (Array.isArray(seo.alternateLanguages)) {
      // Wipe ALL existing hreflang alternates (both prior bridge-injected
      // ones AND the host page's static fallbacks) before installing the
      // iframe's set. Static fallbacks only matter pre-iframe-ready; once
      // the bridge has SEO data the iframe is the source of truth, and
      // leaving stale entries causes duplicate hreflang codes that Google
      // will ignore (or worse, treat as conflicting signals).
      document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(el => el.remove());
      seo.alternateLanguages.forEach(({ hreflang, href }) => {
        if (!hreflang || !href) return;
        const link = document.createElement('link');
        link.rel = 'alternate';
        link.hreflang = hreflang;
        link.href = href;
        link.setAttribute('data-wm-bridge', '1');
        document.head.appendChild(link);
      });
    }
  }

  function setMetaName(name, content) {
    if (!content) return;
    let meta = document.head.querySelector(`meta[name="${name}"]`);
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', name);
      meta.setAttribute('data-wm-bridge', '1');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', content);
  }

  function setMetaProperty(property, content) {
    if (!content) return;
    let meta = document.head.querySelector(`meta[property="${property}"]`);
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('property', property);
      meta.setAttribute('data-wm-bridge', '1');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', content);
  }

  function setLink(rel, href) {
    if (!href) return;
    let link = document.head.querySelector(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', rel);
      link.setAttribute('data-wm-bridge', '1');
      document.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }

  /* ---------- Navigation ---------- */

  function handleNavigate(href) {
    if (!isSafeNavigation(href)) return;
    window.location.href = href;
  }

  function isSafeNavigation(href) {
    if (typeof href !== 'string') return false;
    if (href.startsWith('/')) return true;
    try {
      const url = new URL(href, window.location.origin);
      return url.origin === window.location.origin;
    } catch (_) {
      return false;
    }
  }

  /* ---------- Public API ---------- */

  /* ──────────────────────────────────────────────────────────────────
     Status modal — rendered in the parent frame so the overlay covers
     the visible viewport and can darken the host page. Single instance
     reused across show/hide. Iframe content sends a `show-modal` /
     `hide-modal` postMessage; CSS lives in austin-host-mock.css.
     ────────────────────────────────────────────────────────────────── */
  let modalEl = null;
  let modalKeyHandler = null;

  function buildStatusModal() {
    const root = document.createElement('div');
    root.className = 'wm-status-modal';
    root.setAttribute('hidden', '');
    root.innerHTML =
      '<div class="wm-status-modal-backdrop" data-status-modal-dismiss></div>' +
      '<div class="wm-status-modal-card" role="dialog" aria-modal="true" aria-labelledby="wm-status-modal-title">' +
        '<button type="button" class="wm-status-modal-close" data-status-modal-dismiss aria-label="Close">×</button>' +
        '<div class="wm-status-modal-icon" data-status-modal-icon aria-hidden="true"></div>' +
        '<h3 class="wm-status-modal-title" id="wm-status-modal-title" data-status-modal-title></h3>' +
        '<p class="wm-status-modal-body" data-status-modal-body></p>' +
        '<div class="wm-status-modal-actions">' +
          '<button type="button" class="wm-status-modal-ok" data-status-modal-dismiss></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    root.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('[data-status-modal-dismiss]')) {
        hideStatusModal();
      }
    });
    return root;
  }

  // Lazy-load swirl-spinner (CSS + JS) only when a 'loading' modal first needs
  // it. The contact form is the only thing that shows a loading spinner, so
  // home/marketing pages no longer download ~16KB they never use. Same-origin
  // tags → script-src 'self' / style-src 'self' allow them without a nonce.
  let swirlSpinnerReady = null;
  function ensureSwirlSpinner() {
    if (window.SwirlSpinner) return Promise.resolve();
    if (swirlSpinnerReady) return swirlSpinnerReady;
    swirlSpinnerReady = new Promise((resolve) => {
      if (!document.querySelector('link[data-swirl-css]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/assets/css/swirl-spinner.css?v=20260508a';
        link.setAttribute('data-swirl-css', '');
        document.head.appendChild(link);
      }
      const s = document.createElement('script');
      s.src = '/assets/js/swirl-spinner.js?v=20260504';
      s.onload = () => resolve();
      s.onerror = () => resolve(); // graceful: modal just shows no swirl
      document.head.appendChild(s);
    });
    return swirlSpinnerReady;
  }

  function showStatusModal(data) {
    if (!modalEl) modalEl = buildStatusModal();
    const kind  = (data.kind === 'error') ? 'error'
                : (data.kind === 'loading') ? 'loading'
                : 'success';
    const title = data.title || (
      kind === 'success' ? 'Message sent' :
      kind === 'error'   ? 'Could not send' :
      'Sending message…'
    );
    const body  = data.body || '';
    const ok    = data.ok   || 'OK';
    modalEl.dataset.kind = kind;
    modalEl.querySelector('[data-status-modal-title]').textContent = title;
    modalEl.querySelector('[data-status-modal-body]').textContent  = body;

    // Icon: swirl spinner for loading, check/alert SVG otherwise.
    const iconEl = modalEl.querySelector('[data-status-modal-icon]');
    if (kind === 'loading') {
      // Tear down any prior spinner so we don't leak DOM nodes/timers.
      if (modalEl.__activeSpinner) {
        try { modalEl.__activeSpinner.destroy(); } catch (_) { /* defensive */ }
        modalEl.__activeSpinner = null;
      }
      iconEl.innerHTML = '';
      ensureSwirlSpinner().then(() => {
        // The server may have already responded (kind flipped off 'loading')
        // by the time the lazy script lands — only mount if still loading.
        if (modalEl.dataset.kind !== 'loading' || !window.SwirlSpinner) return;
        const spinner = new window.SwirlSpinner({ size: 'default', speed: 'normal', container: iconEl });
        spinner.show();
        modalEl.__activeSpinner = spinner;
      });
    } else {
      // Tear down any prior spinner so we don't leak DOM nodes.
      if (modalEl.__activeSpinner) {
        try { modalEl.__activeSpinner.destroy(); } catch (_) { /* defensive */ }
        modalEl.__activeSpinner = null;
      }
      iconEl.innerHTML = (kind === 'success')
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="10"></circle><polyline points="7 12 11 16 17 9"></polyline></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="7" x2="12" y2="13"></line><circle cx="12" cy="17" r="0.6" fill="currentColor"></circle></svg>';
    }

    // Loading state: hide dismissers (await server response).
    const closeBtn = modalEl.querySelector('.wm-status-modal-close');
    const okBtn    = modalEl.querySelector('.wm-status-modal-ok');
    const isLoading = (kind === 'loading');
    if (closeBtn) closeBtn.hidden = isLoading;
    if (okBtn) {
      okBtn.hidden = isLoading;
      okBtn.textContent = ok;
    }

    modalEl.hidden = false;
    if (!isLoading) {
      setTimeout(() => { if (okBtn) okBtn.focus(); }, 0);
      if (!modalKeyHandler) {
        modalKeyHandler = (e) => { if (e.key === 'Escape') hideStatusModal(); };
        document.addEventListener('keydown', modalKeyHandler);
      }
    } else if (modalKeyHandler) {
      document.removeEventListener('keydown', modalKeyHandler);
      modalKeyHandler = null;
    }
  }

  function hideStatusModal() {
    if (modalEl) {
      if (modalEl.__activeSpinner) {
        try { modalEl.__activeSpinner.destroy(); } catch (_) { /* defensive */ }
        modalEl.__activeSpinner = null;
      }
      modalEl.hidden = true;
    }
    if (modalKeyHandler) {
      document.removeEventListener('keydown', modalKeyHandler);
      modalKeyHandler = null;
    }
  }

  window.WaveMaxBridgeV3 = {
    sendToIframe,
    resizeIframe,
    getCurrentLanguage: () => localStorage.getItem(LANGUAGE_KEY) || 'en',
    setLanguage: (language) => {
      localStorage.setItem(LANGUAGE_KEY, language);
      window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language } }));
    },
    setLocationData: (data) => {
      locationData = data;
      sendLocationData();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
