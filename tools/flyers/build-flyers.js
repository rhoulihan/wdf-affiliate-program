#!/usr/bin/env node
/**
 * WaveMAX affiliate opportunity flyers (8.5x11, portrait + landscape).
 *
 * Self-contained print-ready PDFs: brand fonts, logo, and an offline QR code
 * (pointing at the public affiliate interest page) are all embedded as data:
 * URIs, then rendered to vector PDF via headless Chrome's --print-to-pdf.
 *
 *   node tools/flyers/build-flyers.js
 *
 * Env overrides: CHROME_BIN (default /usr/bin/google-chrome),
 *                FLYER_URL (default https://rundberglaundry.com/wavemax-affiliate)
 *
 * Outputs to public/assets/flyers/ (served under the gate-exempt /assets/ path):
 *   wavemax-affiliate-flyer-portrait.pdf
 *   wavemax-affiliate-flyer-landscape.pdf
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const QRCode = require('qrcode');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'public', 'assets', 'flyers');
const CHROME = process.env.CHROME_BIN || '/usr/bin/google-chrome';
const URL = process.env.FLYER_URL || 'https://rundberglaundry.com/wavemax-affiliate';
const URL_LABEL = URL.replace(/^https?:\/\//, '');

const b64 = (p, mime) => `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
const FONT_DISP = b64(path.join(ROOT, 'public/assets/fonts/space-grotesk-latin.woff2'), 'font/woff2');
const FONT_BODY = b64(path.join(ROOT, 'public/assets/fonts/plus-jakarta-sans-latin.woff2'), 'font/woff2');
const LOGO = b64(path.join(ROOT, 'public/assets/images/brand/logo.png'), 'image/png');

// ── content ────────────────────────────────────────────────────────────────
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
const BENEFITS = [
  ['Set your own hours &amp; rates', 'Work when you want. Price it your way.'],
  ['Pickup &amp; delivery only', 'No hands-on laundry — we do the wash, dry &amp; fold.'],
  ['Keep 100% of your fee', 'No middle-man taking a cut of your work.'],
  ['$0 to start · 1099', 'U.S. work-eligible independent contractor.'],
];
const STEPS = ['Market it', 'Pick up', 'We wash', 'Deliver', 'Get paid'];

function css(orientation) {
  const portrait = orientation === 'portrait';
  return `
  @page { size: Letter ${orientation}; margin: 0; }
  *{ box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  @font-face{ font-family:'Space Grotesk'; font-weight:400 700; src:url('${FONT_DISP}') format('woff2'); }
  @font-face{ font-family:'Plus Jakarta Sans'; font-weight:400 800; src:url('${FONT_BODY}') format('woff2'); }
  :root{
    --teal:#0C93AD; --teal-deep:#076B7E; --navy:#0A2A3A; --navy-2:#0E3446;
    --soft:#E1F3F7; --ink:#16252E; --muted:#5B6B73; --line:rgba(10,42,58,.10);
    --disp:'Space Grotesk',system-ui,sans-serif; --body:'Plus Jakarta Sans',system-ui,sans-serif;
  }
  html,body{ width:${portrait ? '8.5in' : '11in'}; height:${portrait ? '11in' : '8.5in'}; }
  body{ font-family:var(--body); color:var(--ink); background:#fff;
    display:flex; flex-direction:column; overflow:hidden; }
  h1,h2,h3,.disp{ font-family:var(--disp); letter-spacing:-.02em; }
  .hi{ color:var(--teal); }

  /* header */
  .top{ background:var(--navy); color:#fff; display:flex; align-items:center; justify-content:space-between;
    padding:${portrait ? '0.34in 0.5in' : '0.30in 0.5in'}; }
  .top img{ height:${portrait ? '0.46in' : '0.42in'}; display:block; }
  .top .tag{ font-family:var(--disp); font-weight:700; letter-spacing:.10em; font-size:${portrait ? '11.5pt' : '11pt'};
    color:#BFE9F1; border:1.5px solid rgba(191,233,241,.4); border-radius:999px; padding:.10in .22in; }

  /* body wrapper */
  .wrap{ flex:1; display:flex; ${portrait ? 'flex-direction:column;' : ''} min-height:0; }

  /* hero + benefits column */
  .main{ padding:${portrait ? '0.42in 0.55in 0.2in' : '0.42in 0.5in 0.3in'};
    ${portrait ? '' : 'flex:1.15; display:flex; flex-direction:column;'} }
  .eyebrow{ display:inline-block; font-family:var(--disp); font-weight:700; letter-spacing:.06em;
    font-size:10.5pt; color:var(--teal-deep); background:var(--soft); border-radius:999px; padding:.09in .2in; }
  h1{ font-weight:700; line-height:1.02; color:var(--navy);
    font-size:${portrait ? '37pt' : '32pt'}; margin:.16in 0 0; }
  .sub{ color:#33454E; font-size:${portrait ? '12.5pt' : '11.5pt'}; line-height:1.5; margin:.14in 0 0;
    max-width:${portrait ? '7in' : '5.4in'}; }
  .sub strong{ color:var(--teal-deep); }

  .benefits{ display:grid; grid-template-columns:1fr 1fr; gap:${portrait ? '.16in' : '.14in'};
    margin:${portrait ? '.28in 0 0' : '.24in 0 0'}; }
  .tile{ border:1.5px solid var(--line); border-radius:.14in; padding:${portrait ? '.18in .2in' : '.15in .17in'};
    background:#fff; }
  .tile .ic{ width:${portrait ? '.34in' : '.3in'}; height:${portrait ? '.34in' : '.3in'}; border-radius:50%;
    background:var(--soft); color:var(--teal-deep); display:flex; align-items:center; justify-content:center; margin-bottom:.1in; }
  .tile .ic svg{ width:${portrait ? '.19in' : '.17in'}; height:${portrait ? '.19in' : '.17in'}; }
  .tile b{ font-family:var(--disp); font-weight:700; color:var(--navy); font-size:${portrait ? '13pt' : '12pt'}; display:block; }
  .tile span{ color:var(--muted); font-size:${portrait ? '10pt' : '9.5pt'}; line-height:1.4; display:block; margin-top:.04in; }

  .steps{ display:flex; align-items:center; gap:.08in; flex-wrap:nowrap; margin:${portrait ? '.28in 0 0' : '.22in 0 0'}; }
  .chip{ font-family:var(--disp); font-weight:700; color:var(--navy); font-size:${portrait ? '10.5pt' : '9.5pt'};
    background:#F1F8FA; border:1.5px solid var(--line); border-radius:999px; padding:.08in .14in; white-space:nowrap; }
  .arw{ color:var(--teal); font-weight:800; font-size:11pt; }

  /* QR / CTA */
  .cta{ background:linear-gradient(135deg,var(--navy),var(--navy-2)); color:#fff;
    ${portrait
      ? 'margin:.3in .55in 0; border-radius:.2in; padding:.32in .4in; display:flex; align-items:center; gap:.4in;'
      : 'flex:.85; margin:0; border-radius:0; padding:.5in .45in; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; gap:.16in;'} }
  .qr{ background:#fff; border-radius:.14in; padding:.16in; width:${portrait ? '2.1in' : '2.5in'};
    height:${portrait ? '2.1in' : '2.5in'}; flex:none; }
  .qr svg{ width:100%; height:100%; display:block; }
  .cta-txt{ ${portrait ? '' : 'display:flex; flex-direction:column; align-items:center;'} }
  .cta .k{ font-family:var(--disp); font-weight:700; letter-spacing:.08em; font-size:10.5pt; color:#7FE3F4; }
  .cta h2{ font-weight:700; font-size:${portrait ? '21pt' : '19pt'}; line-height:1.08; margin:.08in 0 .1in; }
  .cta .url{ font-family:var(--disp); font-weight:700; font-size:${portrait ? '13pt' : '12.5pt'};
    background:rgba(127,227,244,.16); border:1.5px solid rgba(127,227,244,.4); border-radius:999px;
    padding:.1in .2in; display:inline-block; }
  .cta .fine{ color:#B7D6DE; font-size:9.5pt; margin-top:.12in; }

  /* footer */
  .foot{ background:var(--navy); color:#AECDD6; font-size:9pt; text-align:center;
    padding:.16in .5in; margin-top:auto; }
  .foot b{ color:#fff; }
  `;
}

function heroMain(portrait) {
  return `
    <div class="main">
      <span class="eyebrow">FLEXIBLE 1099 OPPORTUNITY</span>
      <h1>Get paid to run laundry <span class="hi">pickup &amp; delivery</span>.</h1>
      <p class="sub">A flexible side business you own. You market it and handle pickup &amp; delivery — WaveMAX does the wash, dry &amp; fold. <strong>Keep 100% of your fee.</strong></p>
      <div class="benefits">
        ${BENEFITS.map(([b, s]) => `<div class="tile"><div class="ic">${CHECK}</div><b>${b}</b><span>${s}</span></div>`).join('')}
      </div>
      <div class="steps">
        ${STEPS.map((s, i) => `<span class="chip">${s}</span>${i < STEPS.length - 1 ? '<span class="arw">›</span>' : ''}`).join('')}
      </div>
    </div>`;
}

function ctaBlock(qrSvg) {
  return `
    <div class="cta">
      <div class="qr">${qrSvg}</div>
      <div class="cta-txt">
        <div class="k">SCAN TO APPLY · 60 SECONDS</div>
        <h2>Start your laundry side business.</h2>
        <span class="url">${URL_LABEL}</span>
        <div class="fine">U.S. work-eligible · 1099 independent contractor · $0 to start</div>
      </div>
    </div>`;
}

function pageHTML(orientation, qrSvg) {
  const portrait = orientation === 'portrait';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><style>${css(orientation)}</style></head>
<body>
  <div class="top"><img src="${LOGO}" alt="WaveMAX Laundry"><span class="tag">AFFILIATE PROGRAM</span></div>
  <div class="wrap">
    ${heroMain(portrait)}
    ${ctaBlock(qrSvg)}
  </div>
  <div class="foot">Operated by <b>CRHS Enterprises, LLC</b> · admin@crhsent.com · © 2025 CRHS Enterprises, LLC. All rights reserved.</div>
</body></html>`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-flyers-'));

  const qrSvg = await QRCode.toString(URL, {
    type: 'svg', errorCorrectionLevel: 'M', margin: 1,
    color: { dark: '#0A2A3A', light: '#ffffff' },
  });

  for (const orientation of ['portrait', 'landscape']) {
    const htmlPath = path.join(tmp, `flyer-${orientation}.html`);
    const pdfPath = path.join(OUT_DIR, `wavemax-affiliate-flyer-${orientation}.pdf`);
    fs.writeFileSync(htmlPath, pageHTML(orientation, qrSvg));
    execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer',
      '--run-all-compositor-stages-before-draw', '--virtual-time-budget=4000',
      `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`,
    ], { stdio: ['ignore', 'ignore', 'inherit'] });
    const kb = Math.round(fs.statSync(pdfPath).size / 1024);
    console.log(`✓ ${orientation.padEnd(9)} -> ${path.relative(ROOT, pdfPath)} (${kb} KB)`);
  }
  console.log(`QR -> ${URL}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
