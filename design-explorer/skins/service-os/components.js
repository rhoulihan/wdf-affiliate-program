'use strict';
const model = require('../../content-model');
const { t } = require('./i18n');

const NAP = model.NAP;
const AFFILIATE = 'WaveMAX Austin'; // resolves the {{affiliateName}} content token

/* ---- helpers ---- */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// content strings may contain {{affiliateName}}; resolve, then escape.
function fill(s) { return esc(String(s == null ? '' : s).replace(/\{\{affiliateName\}\}/g, AFFILIATE)); }

/* ---- inline SVG icons (no scripts; decorative => aria-hidden) ---- */
const I = {
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  wash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="13" r="5"/><path d="M8 6h.01M12 6h.01"/></svg>',
  drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2s6 6.7 6 11a6 6 0 0 1-12 0c0-4.3 6-11 6-11z"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg>',
  card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 21l1.4-4.1A8.4 8.4 0 0 1 3 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/></svg>',
  // shield-check: hygiene / UV-sanitization showcase
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3z"/><path d="M9 12l2 2 4-4"/></svg>',
};

const PAGE_PATH = {
  home: '#', 'self-serve': '#', 'wash-dry-fold': '#', commercial: '#', about: '#', contact: '#',
};
const SERVICE_ICON = { 'self-serve': I.wash, 'wash-dry-fold': I.drop, commercial: I.box };
function serviceTitle(slug, lang, content) {
  // pull each service page's hero title from the model for the tabs/tiles
  const p = content.pages[slug];
  return p && p.hero ? p.hero.title : slug;
}

/* ---- shared action links ---- */
const tel = `tel:${NAP.phoneTel}`;
function actionLinks(lang) {
  const L = t(lang);
  return { tel, dir: NAP.mapsDir, L };
}

/* ===== OS top bar ===== */
function topbar(page, intensity, lang) {
  const L = t(lang);
  const nav = [
    ['home', L.nav.home], ['self-serve', L.nav.selfServe], ['wash-dry-fold', L.nav.wdf],
    ['commercial', L.nav.commercial], ['about', L.nav.about], ['contact', L.nav.contact],
  ];
  const navHtml = nav.map(([slug, label]) =>
    `<a href="${PAGE_PATH[slug]}"${slug === page ? ' aria-current="page"' : ''}>${esc(label)}</a>`
  ).join('');
  const tag = intensity === 'heavy' ? esc(L.system) : esc(L.neighborhood);
  return `<header class="so-os"><div class="so-wrap so-os-in">
  <a class="so-brand" href="#" aria-label="WaveMAX Austin home">
    <span class="so-logo-lockup"><img src="/assets/images/brand/logo.png" alt="WaveMAX" width="140" height="28"></span>
    <span class="so-brand-meta"><span class="so-brand-name">Austin</span><span class="so-brand-tag">${tag}</span></span>
  </a>
  <span class="so-os-spacer"></span>
  <nav class="so-nav" aria-label="Primary">${navHtml}</nav>
  <span class="so-pill"><span class="so-dot"></span>${esc(L.openNow)}</span>
</div></header>`;
}

/* ===== Concierge launcher (LIVE — bound by concierge-client.js to /api/concierge).
   The <form data-concierge> is the shared hook the external client binds to.
   Input is enabled + labelled; the bot bubble is an aria-live region the client
   writes the reply into via textContent (no innerHTML, CSP-clean). ===== */
function concierge(lang) {
  const L = t(lang);
  return `<section class="so-concierge" aria-labelledby="so-cc-title">
  <div class="so-cc-bar"><span class="so-dot"></span>${esc(L.conciergeTitle)}
    <span class="so-traffic" aria-hidden="true"><span></span><span></span><span></span></span></div>
  <div class="so-cc-body">
    <div>
      <p class="so-cc-kicker">${esc(L.conciergeKicker)}</p>
      <h2 id="so-cc-title">${esc(L.conciergeTitle)}</h2>
      <p>${esc(L.conciergeBody)}</p>
    </div>
    <form class="so-cc-chat" data-concierge aria-label="${esc(L.conciergeTitle)}">
      <div class="so-bubble so-bubble--user">${esc(L.conciergeSample)}</div>
      <div class="so-bubble so-bubble--bot" data-concierge-response aria-live="polite"></div>
      <div class="so-cc-input">
        <label class="so-nap-l" for="so-cc-q" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">${esc(L.conciergeTitle)}</label>
        <input id="so-cc-q" name="message" type="text" placeholder="${esc(L.conciergePlaceholder)}" autocomplete="off" maxlength="500">
        <button class="so-cc-send" type="submit">${esc(L.conciergeSend)}</button>
      </div>
      <p class="so-cc-note">${esc(L.conciergeNote)}</p>
    </form>
  </div>
</section>`;
}

/* ===== Sticky mobile dock (CSS-only) — Call / Directions / Wash-dry-fold ===== */
function dock(lang) {
  const { tel, dir, L } = actionLinks(lang);
  return `<nav class="so-dock" aria-label="${esc(L.quickActions)}">
  <a href="${tel}">${I.phone}<span>${esc(L.call)}</span></a>
  <a href="${esc(dir)}" target="_blank" rel="noopener">${I.pin}<span>${esc(L.directions)}</span></a>
  <a class="so-dock-primary" href="${tel}">${I.drop}<span>${esc(L.wdf)}</span></a>
</nav>`;
}

/* ===== Closing CTA ===== */
function ctaBanner(cta, lang) {
  if (!cta) return '';
  const { tel, dir, L } = actionLinks(lang);
  return `<div class="so-wrap"><section class="so-cta" aria-labelledby="so-cta-t">
    <span class="so-eyebrow">${esc(L.ready)}</span>
    <h2 id="so-cta-t">${fill(cta.title)}</h2>
    <p>${fill(cta.sub)}</p>
    <div class="so-actions">
      <a class="so-btn so-btn-primary" href="${tel}">${I.phone}${esc(cta.primaryLabel || L.call)}</a>
      <a class="so-btn" href="${esc(dir)}" target="_blank" rel="noopener">${I.pin}${esc(L.directions)}</a>
    </div>
  </section></div>`;
}

/* ===== Body footer chrome (above core §12.2) ===== */
function footer(intensity, lang) {
  const L = t(lang);
  const ownership = intensity === 'heavy'
    ? (lang === 'es' ? 'WaveMAX Austin · Socio local' : 'WaveMAX Austin · Local partner')
    : (lang === 'es' ? 'Negocio local · con licencia WaveMAX' : 'Locally owned · WaveMAX-licensed');
  return `<footer class="so-footer"><div class="so-wrap so-footer-in">
    <a class="so-brand" href="#" aria-label="WaveMAX Austin">
      <span class="so-logo-lockup"><img src="/assets/images/brand/logo.png" alt="WaveMAX" width="106" height="22"></span>
    </a>
    <p class="so-footer-meta"><b>${esc(NAP.street)}</b>, ${esc(NAP.city)} ${esc(NAP.state)} · ${esc(NAP.phone)} · ${esc(ownership)}</p>
  </div></footer>`;
}

module.exports = {
  esc, fill, I, NAP, AFFILIATE, tel, actionLinks, serviceTitle, SERVICE_ICON,
  topbar, concierge, dock, ctaBanner, footer, t,
};
