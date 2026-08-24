'use strict';
const model = require('../../content-model');
const { t } = require('./i18n');

const NAP = model.NAP;
const AFFILIATE = 'WaveMAX Austin'; // resolves {{affiliateName}} content tokens

/* ---- escaping ---- */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fill(s) { return esc(String(s == null ? '' : s).replace(/\{\{affiliateName\}\}/g, AFFILIATE)); }

/* ---- real Austin store photography (assets verified present) ---- */
const PHOTOS = {
  storefront: '/assets/images/locations/austin-tx/hero-1.webp',
  interior: '/assets/images/locations/austin-tx/interior-1.webp',
  door: '/assets/images/locations/austin-tx/interior-3.webp',
  floor: '/assets/images/locations/austin-tx/interior-5.webp',
  // shop signage on the wall — the branded "WaveMAX · Lavandería · Laundry"
  // sign mounted on the storefront's brick fascia. (Interior wall signage is
  // present but too small/illegible to read; this is the strongest sign shot.)
  signage: '/assets/images/locations/austin-tx/hero-1.webp',
};

/* ---- inline SVG icons (decorative => aria-hidden) ---- */
const I = {
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  wash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="13" r="5"/><path d="M8 6h.01M12 6h.01"/></svg>',
  drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2s6 6.7 6 11a6 6 0 0 1-12 0c0-4.3 6-11 6-11z"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3z"/><path d="M9 12l2 2 4-4"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg>',
  card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.18 2 8a7 7 0 0 1-7 7h-3z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></svg>',
};

const SERVICE_ICON = { 'self-serve': I.wash, 'wash-dry-fold': I.drop, commercial: I.box };

const tel = `tel:${NAP.phoneTel}`;
const NAV = [
  ['home', 'home'], ['self-serve', 'selfServe'], ['wash-dry-fold', 'wdf'],
  ['commercial', 'commercial'], ['about', 'about'], ['contact', 'contact'],
];

/* the WaveMAX white wordmark on a dark brand chip — legible on cream/paper */
function logoChip(h) {
  const hh = h || 26;
  return `<span class="ne-logo-chip"><img src="/assets/images/brand/logo.png" alt="WaveMAX" width="${Math.round(hh * 4.39)}" height="${hh}"></span>`;
}

/* ===== Masthead + nav ===== */
function masthead(page, intensity, lang) {
  const L = t(lang);
  const navHtml = NAV.map(([slug, key]) =>
    `<a href="#"${slug === page ? ' aria-current="page"' : ''}>${esc(L.nav[key])}</a>`
  ).join('');

  return `<header class="ne-masthead">
  <div class="ne-wrap">
    <div class="ne-mast-top">
      <span class="ne-mast-open"><span class="ne-dot"></span>${esc(L.openNow)}</span>
      <span class="ne-mast-spacer"></span>
      <span>${esc(L.issue)}</span>
    </div>
    <div class="ne-mast-main">
      <div class="ne-mast-flag">
        ${logoChip(30)}
        <span class="ne-flag-text">
          <span class="ne-flag-kicker">${esc(L.mastheadKicker)}</span>
          <span class="ne-flag-name">WaveMAX <em>Austin</em></span>
        </span>
      </div>
      <span class="ne-mast-spacer"></span>
      <p class="ne-mast-rating">${esc(L.ratingLabel)}<b>★ ★ ★ ★ ★</b>${esc(L.edition)}</p>
      <a class="ne-nav-toggle" href="#ne-nav" aria-label="${esc(L.inThisIssue)}">${esc(L.inThisIssue)} <span aria-hidden="true">▾</span></a>
    </div>
  </div>
  <nav class="ne-nav" id="ne-nav" aria-label="Primary">
    <div class="ne-wrap ne-nav-in">
      <a class="ne-nav-close" href="#" aria-label="Close">×</a>
      ${navHtml}
    </div>
  </nav>
</header>`;
}

/* ===== Photo figure (real asset, duotone-tinted) ===== */
function figure(src, alt, cap, tag, klass) {
  return `<figure class="ne-figure ${klass || 'ne-figure--wide'}">
    ${tag ? `<span class="ne-photo-tag">${esc(tag)}</span>` : ''}
    <img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async">
    ${cap ? `<figcaption class="ne-figcap">${cap}</figcaption>` : ''}
  </figure>`;
}

/* ===== Section divider ornament ===== */
function divider(label) {
  return `<div class="ne-divider"><span>${esc(label)}</span>${I.leaf}<span style="flex:0">·</span></div>`;
}

/* ===== Neighborhood desk (concierge LIVE — bound by concierge-client.js to
   /api/concierge). The <form data-concierge> is the shared hook; the answer
   bubble is an aria-live region the client fills with textContent (CSP-clean).
   A sample question stays visible as the conversation opener. ===== */
function desk(lang) {
  const L = t(lang);
  return `<div class="ne-wrap"><section class="ne-desk" aria-labelledby="ne-desk-t">
  <div class="ne-desk-in">
    <div class="ne-desk-copy">
      <p class="ne-kicker">${esc(L.deskKicker)}</p>
      <h2 id="ne-desk-t">${esc(L.deskTitle)}</h2>
      <p>${esc(L.deskBody)}</p>
    </div>
    <form class="ne-desk-chat" data-concierge aria-label="${esc(L.deskTitle)}">
      <div class="ne-bubble ne-bubble--q">${esc(L.deskSample)}</div>
      <div class="ne-bubble ne-bubble--a" data-concierge-response aria-live="polite"></div>
      <div class="ne-desk-input">
        <label for="ne-desk-q" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">${esc(L.deskTitle)}</label>
        <input id="ne-desk-q" name="message" type="text" placeholder="${esc(L.deskPlaceholder)}" autocomplete="off" maxlength="500">
        <button class="ne-desk-send" type="submit">${esc(L.deskSend)}</button>
      </div>
      <p class="ne-desk-note">${esc(L.deskNote)}</p>
    </form>
  </div>
</section></div>`;
}

/* ===== Closing CTA ("Visit us") — paired with a satellite map control.
   The map is included on every page EXCEPT contact (which has its own large map). ===== */
function closer(cta, lang, page) {
  if (!cta) return '';
  const L = t(lang);
  const withMap = page !== 'contact';
  const mapHtml = withMap ? `<div class="ne-closer-map">
        <iframe title="${esc(NAP.name)} — ${esc(L.visit)}" src="${esc(NAP.mapsEmbed)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
      </div>` : '';
  return `<div class="ne-wrap"><section class="ne-closer${withMap ? ' ne-closer--map' : ''}" aria-labelledby="ne-closer-t">
    <div class="ne-closer-in${withMap ? ' ne-closer-in--map' : ''}">
      <div class="ne-closer-copy">
      <span class="ne-eyebrow">${esc(L.visit)}</span>
      <h2 id="ne-closer-t">${fill(cta.title)}</h2>
      <p>${fill(cta.sub)}</p>
      <div class="ne-cta-row">
        <a class="ne-btn ne-btn-primary" href="${tel}">${I.phone}${esc(cta.primaryLabel || L.call)}</a>
        <a class="ne-btn ne-btn-ghost" href="${esc(NAP.mapsDir)}" target="_blank" rel="noopener">${I.pin}${esc(L.directions)}</a>
      </div>
      </div>
      ${mapHtml}
    </div>
  </section></div>`;
}

/* ===== Body colophon (above core §12.2) ===== */
function colophon(intensity, lang) {
  const L = t(lang);
  const owned = intensity === 'heavy' ? L.ownedHeavy : L.ownedLight;
  return `<footer class="ne-colophon"><div class="ne-wrap ne-colophon-in">
    ${logoChip(24)}
    <p class="ne-colo-text"><b>${esc(NAP.street)}</b>, ${esc(NAP.city)} ${esc(NAP.state)} ${esc(NAP.zip)} · ${esc(NAP.phone)}<br>${esc(L.colophon)}</p>
    <span class="ne-mast-spacer"></span>
    <p class="ne-colo-own">${esc(owned)}</p>
  </div></footer>`;
}

module.exports = {
  esc, fill, I, NAP, AFFILIATE, tel, PHOTOS, SERVICE_ICON, NAV,
  logoChip, masthead, figure, divider, desk, closer, colophon, t,
};
