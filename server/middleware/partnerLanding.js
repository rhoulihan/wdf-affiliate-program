// Partner-program landing page for the Austin per-location domains
// (rundberglaundry.com, runberglaundry.com, atxwashateria.com, atxwashdryfold.com).
//
// PREVIEW PHASE: the new pickup/delivery partner-program page is served ONLY to
// the preview allowlist (PARTNER_PREVIEW_ALLOWLIST, default = the admin IP) so it
// can be reviewed live; everyone else still gets the public "Coming soon"
// placeholder (noindex). To launch publicly, set PARTNER_PREVIEW_ALLOWLIST to a
// wildcard-free empty value AND remove the preview gate below (serve PARTNER_PAGE
// to all) — or simply delete the isPreview branch so the page goes to everyone.
//
// Exempt paths pass through to normal handling: the API, ACME cert renewal,
// static assets/fonts, the i18n locale files, favicon/robots/sitemap, and the
// privileged, login-gated affiliate-program app surfaces (the SPA shell,
// *-embed.html fragments, /admin, /operator, /scanbag). The store location
// (store IP) sees the real app on every route. This catch-all also keeps any
// other host handler (e.g. the WaveMAX franchise renderer) from leaking onto
// these domains — every non-exempt GET is answered here.
const fs = require('fs');
const path = require('path');
const storeIPs = require('../config/storeIPs');
const { clientIp } = require('../utils/clientIp');
const { parseList, entryMatches } = require('./ipGate');

const PARTNER_LANDING_HOSTS = [
  'rundberglaundry.com', 'www.rundberglaundry.com',
  'runberglaundry.com', 'www.runberglaundry.com',
  'atxwashateria.com', 'www.atxwashateria.com',
  'atxwashdryfold.com', 'www.atxwashdryfold.com'
];

// Hosts where the partner page is publicly launched (served to everyone, indexable).
const PARTNER_PUBLIC_HOSTS = ['atxwashdryfold.com', 'www.atxwashdryfold.com'];

// Read the partner page once at startup (the file ships in the repo). A reload
// requires a redeploy/pm2 restart, same as any other in-memory-cached template.
const PAGE_PATH = path.join(__dirname, '..', '..', 'public', 'partner-program.html');
let PARTNER_PAGE;
try {
  PARTNER_PAGE = fs.readFileSync(PAGE_PATH, 'utf8');
} catch (e) {
  PARTNER_PAGE = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Rundberg Laundry</title></head><body><h1>Rundberg Laundry</h1></body></html>';
}

// Public "Coming soon" placeholder (shown to everyone outside the preview
// allowlist while the partner page is still in preview). De-WaveMAX'd: just a
// "Coming soon" headline + the Google map of the Rundberg Ln location. noindex.
const COMING_SOON_PAGE = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Coming soon</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#0b1f43,#16336b 60%,#1e3a8a);color:#fff;padding:24px;text-align:center}
  .wrap{max-width:520px;width:100%}
  h1{font-size:24px;font-weight:600;margin-bottom:20px;letter-spacing:.01em}
  .map{border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.12)}
  .map iframe{width:100%;height:360px;border:0;display:block}
</style></head>
<body><div class="wrap">
  <h1>Coming soon</h1>
  <div class="map">
    <iframe title="Map — 825 E Rundberg Ln, Austin, TX 78753" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=825+E+Rundberg+Ln,+Austin,+TX+78753&amp;output=embed&amp;t=k&amp;z=16"></iframe>
  </div>
</div></body></html>`;

function reqHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase().split(':')[0].trim();
}

// The store location (STORE_IP_ADDRESS + ADDITIONAL_STORE_IPS + STORE_IP_RANGES,
// IPv4 and the store's IPv6 /64) is trusted to see the real app on EVERY route.
function isStore(req) {
  const ip = clientIp(req);
  return !!ip && storeIPs.isWhitelisted(ip);
}

// Preview allowlist — who sees the new partner page while it's still in preview.
// Defaults to the admin IP; resolved fresh each call so an env change takes
// effect on the next request without a code change.
function previewAllowlist() {
  return parseList(process.env.PARTNER_PREVIEW_ALLOWLIST || '70.114.167.145');
}
function isPreview(req) {
  const ip = clientIp(req);
  if (!ip) return false;
  return previewAllowlist().some((e) => entryMatches(ip, e));
}

function isExempt(p) {
  return (
    p === '/privacy-policy' || p === '/privacy-policy/' || p === '/privacy-policy.html' ||
    p === '/terms-of-service' || p === '/terms-of-service/' ||
    p === '/terms-and-conditions' || p === '/terms-and-conditions.html' ||
    p === '/design-explorer' || p.startsWith('/design-explorer/') || // token-gated design review tool (explorerGuard enforces the token)
    p.startsWith('/api/') ||                 // health, app API, partner-inquiry POST
    // Affiliate-program app surfaces — privileged, login-gated access, so they
    // pass through. The SPA shell, its embed page fragments, the i18n locale
    // files, and the standalone app entry points.
    p === '/embed-app-v2.html' ||
    p === '/admin' || p === '/admin/' ||     // clean admin URL (IP-gated)
    p === '/operator' || p === '/operator/' || // clean operator URL (IP-gated)
    p === '/affiliate' || p === '/affiliate/' || // public UT-student affiliate recruitment page
    p === '/wavemax-affiliate' || p === '/wavemax-affiliate/' || // public WaveMAX-themed affiliate interest page (ads)
    p === '/scanbag' || p === '/scanbag/' ||   // mobile bag-scanner PWA
    p === '/scanbag-sw.js' || p === '/scanbag-manifest.json' || // its service worker + manifest
    p.endsWith('-embed.html') ||
    p.startsWith('/locales/') ||             // i18n JSON (the page translates client-side)
    p.startsWith('/.well-known/') ||         // ACME cert renewal, etc.
    p.startsWith('/assets/') ||              // css, js, fonts, images for the page
    p === '/favicon.ico' || p === '/robots.txt' || p === '/sitemap.xml'
  );
}

function partnerLanding(req, res, next) {
  if (!PARTNER_LANDING_HOSTS.includes(reqHost(req))) return next();
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (isExempt(req.path)) return next();
  if (isStore(req)) return next(); // the store sees the real app on every route

  if (PARTNER_PUBLIC_HOSTS.includes(reqHost(req))) {
    // atxwashdryfold.com is publicly launched — serve the partner page to everyone (indexable).
    res.set('Cache-Control', 'no-store');
    return res.status(200).type('html').send(PARTNER_PAGE);
  }

  if (isPreview(req)) {
    // Preview audience sees the live partner page (indexable meta is in the page;
    // crawlers are not on the allowlist, so they only ever get the noindex hold).
    res.set('Cache-Control', 'no-store');
    return res.status(200).type('html').send(PARTNER_PAGE);
  }

  // Everyone else: the public hold (noindex).
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Cache-Control', 'no-store');
  return res.status(200).type('html').send(COMING_SOON_PAGE);
}

module.exports = partnerLanding;
module.exports._hosts = PARTNER_LANDING_HOSTS;
module.exports._publicHosts = PARTNER_PUBLIC_HOSTS;
module.exports._isExempt = isExempt;
module.exports._isStore = isStore;
module.exports._isPreview = isPreview;
module.exports._page = () => PARTNER_PAGE;
module.exports._comingSoon = () => COMING_SOON_PAGE;
