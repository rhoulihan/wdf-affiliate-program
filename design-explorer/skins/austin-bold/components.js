'use strict';
/**
 * Direction 3 — "RUNDBERG PRESS" components.
 *
 * Shared chrome for the gig-poster / risograph broadside: the masthead nav,
 * the rubber-stamp / sticker seals (each carrying REAL info), the wave SEAM
 * that divides every full-bleed band, the vertical PROGRAM ticker, the
 * front-desk concierge STUB (CSS-only, never wired), and the publisher's-mark
 * footer where the white WaveMAX wordmark sits on a SOLID TEAL CHIP so it stays
 * legible on the warm paper in BOTH intensities.
 *
 * CSP-clean by construction: ZERO <script>, ZERO inline on* handlers. Every
 * "interactive" thing is CSS-only (:target, :focus-within, :hover, scroll-snap,
 * CSS animation). The map iframe is the only frame and is CSP-allowed.
 */
const model = require('../../content-model');
const { t } = require('./i18n');

const NAP = model.NAP;
const AFFILIATE = 'WaveMAX Austin'; // resolves the {{affiliateName}} content token
const tel = `tel:${NAP.phoneTel}`;

/* ---- escaping ---- */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// content strings may contain {{affiliateName}}; resolve then escape.
function fill(s) { return esc(String(s == null ? '' : s).replace(/\{\{affiliateName\}\}/g, AFFILIATE)); }

/* ---- inline SVG icons (decorative => aria-hidden) ---- */
const I = {
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.95 6.2 6.8.78-5 4.66 1.32 6.69L12 17.9 5.93 20.3l1.32-6.69-5-4.66 6.8-.78z"/></svg>',
};

/* The brand WAVE — promoted from ornament to the structural SEAM between bands.
   A single repeating path; recolored per intensity in CSS. flip=true draws the
   crests downward so a band can seat into the one above it. We render it as an
   inline SVG (no raster) sitting at the band boundary. */
function waveSeam(flip) {
  // 1440-wide viewBox tile; two arches make a recognizable wave crest line.
  const d = 'M0,28 C180,64 360,64 540,40 C720,16 900,16 1080,40 C1260,64 1380,64 1440,44 L1440,80 L0,80 Z';
  return `<div class="ap-seam${flip ? ' ap-seam--flip' : ''}" aria-hidden="true">
    <svg viewBox="0 0 1440 80" preserveAspectRatio="none" focusable="false"><path d="${d}"/></svg>
  </div>`;
}

/* ---- rubber-stamp / sticker seals (each carries REAL info) ----
   `shape`: 'round' | 'rect'. `tone`: ink class for the plate. They are skewed,
   rotated, double-struck via CSS. Decorative styling, but the TEXT is true. */
function seal(text, shape, tone, rot) {
  const cls = `ap-seal ap-seal--${shape || 'rect'}${tone ? ' ap-seal--' + tone : ''}`;
  const style = rot != null ? ` style="--rot:${rot}deg"` : '';
  if (shape === 'round') {
    return `<span class="${cls}"${style}><span class="ap-seal-in">${esc(text)}</span></span>`;
  }
  return `<span class="${cls}"${style}>${esc(text)}</span>`;
}

/* the standard seal bar used under the hero + on band edges */
function sealStrip(lang) {
  const L = t(lang);
  return `<div class="ap-seals" aria-hidden="true">
    ${seal(L.stampOpen, 'rect', 'ink', -2.2)}
    ${seal(L.stampCard, 'round', 'accent', 3)}
    ${seal(L.stampLoad, 'rect', 'deep', 1.6)}
    ${seal(L.stampUV, 'round', 'ink', -3.4)}
    ${seal(L.stampEst, 'rect', 'accent', 2.4)}
  </div>`;
}

/* the white WaveMAX wordmark on a SOLID TEAL CHIP — the legibility device.
   Teal in both intensities (the one shared brand hit on warm paper). */
function logoChip(h) {
  const hh = h || 26;
  return `<span class="ap-chip"><img src="/assets/images/brand/logo.png" alt="WaveMAX" width="${Math.round(hh * 4.39)}" height="${hh}"></span>`;
}

/* ===== masthead: wordmark chip + poster nav + a live OPEN seal ===== */
function masthead(page, intensity, lang) {
  const L = t(lang);
  const nav = [
    ['home', L.nav.home], ['self-serve', L.nav.selfServe], ['wash-dry-fold', L.nav.wdf],
    ['commercial', L.nav.commercial], ['about', L.nav.about], ['contact', L.nav.contact],
  ];
  const navHtml = nav.map(([slug, label]) =>
    `<a href="#"${slug === page ? ' aria-current="page"' : ''}>${esc(label)}</a>`
  ).join('');
  return `<a class="ap-skip" href="#main">${esc(L.skip)}</a>
<header class="ap-mast">
  <div class="ap-wrap ap-mast-in">
    <a class="ap-mast-brand" href="#" aria-label="WaveMAX Austin home">
      ${logoChip(24)}
      <span class="ap-mast-name">AUSTIN</span>
    </a>
    <nav class="ap-nav" aria-label="Primary">${navHtml}</nav>
    <span class="ap-mast-open"><span class="ap-blink" aria-hidden="true"></span>${esc(L.stampOpen)}</span>
  </div>
</header>`;
}

/* ===== vertical PROGRAM ticker (fixed rail, decorative) ===== */
function programTicker(lang) {
  const L = t(lang);
  const items = L.ticker.concat(L.ticker); // duplicate for seamless scroll
  const line = items.map(x => `<span class="ap-tick-item">${esc(x)}</span>`).join('<span class="ap-tick-dot" aria-hidden="true">●</span>');
  return `<aside class="ap-ticker" aria-hidden="true">
    <span class="ap-tick-label">${esc(L.programLabel)}</span>
    <span class="ap-tick-track"><span class="ap-tick-run">${line}</span></span>
  </aside>`;
}

/* ===== front-desk concierge (LIVE — bound by concierge-client.js to
   /api/concierge). Answers hours/pricing/machines/WDF drop-off only; NOT
   booking/pickup. The <form data-concierge> is the shared hook the external
   client binds to; the answer bubble is an aria-live region the client fills
   with textContent (CSP-clean, no innerHTML). */
function concierge(lang) {
  const L = t(lang);
  return `<section class="ap-desk" aria-labelledby="ap-desk-t">
    <form class="ap-desk-card" data-concierge aria-labelledby="ap-desk-t">
      <div class="ap-desk-head">
        <span class="ap-desk-label">${esc(L.deskLabel)}</span>
        <span class="ap-stars" aria-hidden="true">${I.star}${I.star}${I.star}${I.star}${I.star}</span>
      </div>
      <h2 id="ap-desk-t" class="ap-desk-title">${esc(L.deskTitle)}</h2>
      <p class="ap-desk-body">${esc(L.deskBody)}</p>
      <div class="ap-desk-thread">
        <p class="ap-bubble ap-bubble--q">${esc(L.deskSample)}</p>
        <p class="ap-bubble ap-bubble--a" data-concierge-response aria-live="polite"></p>
      </div>
      <div class="ap-desk-input">
        <label class="ap-sr" for="ap-desk-q">${esc(L.deskTitle)}</label>
        <input id="ap-desk-q" name="message" type="text" placeholder="${esc(L.deskPlaceholder)}" autocomplete="off" maxlength="500">
        <button class="ap-desk-send" type="submit">${esc(L.deskSend)} ${I.arrow}</button>
      </div>
      <p class="ap-desk-note">${esc(L.deskNote)}</p>
    </form>
  </section>`;
}

/* ===== closing CTA — a torn-off coupon ===== */
function ctaBanner(cta, lang) {
  if (!cta) return '';
  const L = t(lang);
  return `<section class="ap-coupon" aria-labelledby="ap-coupon-t">
    <span class="ap-coupon-stub" aria-hidden="true">${esc(L.ledgerStub)}</span>
    <span class="ap-kicker">${esc(L.ready)}</span>
    <h2 id="ap-coupon-t" class="ap-coupon-title">${fill(cta.title)}</h2>
    <p class="ap-coupon-sub">${fill(cta.sub)}</p>
    <div class="ap-actions">
      <a class="ap-btn ap-btn--hot" href="${tel}">${I.phone}<span>${esc(cta.primaryLabel || L.call)}</span></a>
      <a class="ap-btn" href="${esc(NAP.mapsDir)}" target="_blank" rel="noopener">${I.pin}<span>${esc(L.directions)}</span></a>
    </div>
  </section>`;
}

/* ===== publisher's-mark footer (above core §12.2) ===== */
function colophon(intensity, lang) {
  const L = t(lang);
  // heavy reads "WaveMAX Austin"; light reads independently-owned framing.
  const ownership = intensity === 'heavy'
    ? AFFILIATE
    : L.colophon;
  return `<footer class="ap-colophon"><div class="ap-wrap ap-colophon-in">
    <div class="ap-colophon-mark">
      ${logoChip(26)}
      <span class="ap-pressmark">${esc(L.pressmark)}</span>
    </div>
    <p class="ap-colophon-text"><b>${esc(NAP.street)}</b>, ${esc(NAP.city)} ${esc(NAP.state)} ${esc(NAP.zip)} · <a href="${tel}">${esc(NAP.phone)}</a><br>${esc(ownership)}</p>
  </div></footer>`;
}

module.exports = {
  esc, fill, I, NAP, AFFILIATE, tel, t,
  waveSeam, seal, sealStrip, logoChip,
  masthead, programTicker, concierge, ctaBanner, colophon,
};
