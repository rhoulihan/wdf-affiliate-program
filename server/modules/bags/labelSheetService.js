// Label sheet renderer — print-optimized HTML (spec §6.1).
//
// 4x6 thermal format (HP KE100): ONE 4in x 6in label per page. Each label,
// top to bottom: brand logo (embedded data-URI so it always prints),
// affiliate name (on EVERY label), the bag's claim QR (its durable identity),
// a blank handwriting line for the customer name, and a small staff bag ref.
//
// No PDF dependency: an external @page/@media-print stylesheet drives the
// browser's print-to-PDF / direct thermal print. CSP-clean: zero inline
// script/style. The auto-print convenience is an EXTERNAL script
// (/assets/js/print-labels.js — script-src 'self', no nonce required).
// QR + logo are data-URI <img> (img-src 'self' data: already allowed); the
// QR payload is the full claim URL so a phone camera works with no app.

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const Bag = require('./Bag');
const Affiliate = require('../../models/Affiliate');
const SystemConfig = require('../../models/SystemConfig');
const brand = require('../../config/brand');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Logo is read once and embedded as a data-URI so the printed label never
// depends on a network fetch (thermal printers/print preview often won't load
// remote assets). The thermal logo is a solid-black PNG (the brand galaxy mark
// + wordmark) so it prints cleanly on white thermal stock — the standard logo
// has white text that vanished on paper.
const LOGO_PATH = path.join(__dirname, '../../../public/assets/images/brand/logo-wavemax-thermal.png');
// Cache-buster for the label's external CSS/JS — these are served immutable
// (1y) and fronted by Cloudflare, so bump this whenever bag-labels.css or
// print-labels.js changes or stale styling will print after a deploy.
const ASSET_VERSION = '20260621b';
let logoDataUri = null;
function getLogoDataUri() {
  if (logoDataUri === null) {
    try {
      const buf = fs.readFileSync(LOGO_PATH);
      logoDataUri = `data:image/png;base64,${buf.toString('base64')}`;
    } catch {
      logoDataUri = ''; // missing asset → omit the logo rather than crash
    }
  }
  return logoDataUri;
}

/**
 * Render the printable label sheet for one mint batch — one 4x6 label per page.
 * Returns an HTML string, or null when the batch has no bags.
 * QR width comes from SystemConfig bag_label_qr_size_px; the 4x6 page geometry
 * lives in /assets/css/bag-labels.css, never inline.
 */
async function renderLabelSheet(batchId) {
  // Only render bags whose claim QR actually resolves. A 'minted' bag (issue
  // failed after mint) would print a label whose token resolves to null —
  // unclaimable. Exclude it; on the happy path freshly printed bags are
  // 'issued', so this is a no-op.
  const bags = await Bag.find({
    batchId,
    status: { $in: ['issued', 'active', 'retired'] }
  }).sort({ bagId: 1 });
  if (bags.length === 0) return null;

  const affiliate = await Affiliate.findOne({ affiliateId: bags[0].affiliateId })
    .select('businessName firstName lastName address city state zipCode');
  const affiliateName = affiliate
    ? (affiliate.businessName || `${affiliate.firstName} ${affiliate.lastName}`)
    : bags[0].affiliateId;

  // Partner address printed under the customer-name line so the bag's
  // pickup/return point (the partner) is always on the sticker.
  const cityLine = affiliate
    ? [affiliate.city, affiliate.state].filter(Boolean).join(', ')
    : '';
  const affiliateAddress = affiliate
    ? [affiliate.address, [cityLine, affiliate.zipCode].filter(Boolean).join(' ').trim()]
      .filter(Boolean).join(', ')
    : '';

  const qrSize = await SystemConfig.getValue('bag_label_qr_size_px', 300);
  const baseUrl = process.env.BASE_URL || 'https://rundberglaundry.com';
  const logo = getLogoDataUri();
  const safeName = escapeHtml(affiliateName);
  const safeAddress = escapeHtml(affiliateAddress);

  const labels = await Promise.all(bags.map(async (bag) => {
    const claimUrl = `${baseUrl}/embed-app-v2.html?route=/claim&bag=${bag.token}`;
    const qrDataUri = await QRCode.toDataURL(claimUrl, {
      width: qrSize,
      margin: 2,
      errorCorrectionLevel: 'M'
    });
    const logoImg = logo
      ? `      <img class="label-logo" src="${logo}" alt="${escapeHtml(brand.displayName)}">\n`
      : '';
    return `    <section class="label">
${logoImg}      <p class="label-affiliate">${safeName}</p>
      <img class="label-qr" src="${qrDataUri}" alt="Bag claim QR code">
      <p class="label-customer">Customer name:</p>
      <span class="label-customer-line"></span>
${safeAddress ? `      <p class="label-partner-address">${safeAddress}</p>\n` : ''}      <p class="label-ref">Bag ref: ${escapeHtml(bag.bagId.slice(-6))}</p>
    </section>`;
  }));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(brand.displayName)} Bag Labels — ${escapeHtml(batchId)}</title>
  <link rel="stylesheet" href="/assets/css/bag-labels.css?v=${ASSET_VERSION}">
</head>
<body>
  <main class="label-stack">
${labels.join('\n')}
  </main>
  <script src="/assets/js/print-labels.js?v=${ASSET_VERSION}"></script>
</body>
</html>`;
}

module.exports = { renderLabelSheet };
