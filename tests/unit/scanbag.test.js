// /scanbag — standalone mobile bag-scanner PWA. Source-level wiring + gate
// exemptions (fast; matches the claimPageWiring style).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const html = fs.readFileSync(path.join(ROOT, 'public/scanbag.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public/assets/js/scanbag.js'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'public/scanbag-sw.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/scanbag-manifest.json'), 'utf8'));

describe('/scanbag mobile PWA', () => {
  it('page is mobile-first, nonce-ready, and links the manifest + scanner scripts', () => {
    // empty csp-nonce meta → injectNonce fills it + adds nonce to the bare scripts at serve time
    expect(html).toContain('name="csp-nonce" content=""');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('<link rel="manifest" href="/scanbag-manifest.json">');
    expect(html).toContain('id="scanbag-video"');
    expect(html).toMatch(/jsqr\.min\.js/);
    expect(html).toMatch(/assets\/js\/scanbag\.js/);
    expect(html).not.toContain('{{nonce}}'); // no stray placeholder (injectNonce uses content="" + bare scripts)
  });

  it('page is CSP-clean (no inline handlers/styles/innerHTML)', () => {
    expect(html).not.toMatch(/onclick=/i);
    expect(html).not.toMatch(/ style="/i);
    expect(html).not.toMatch(/<script>(?!\s*<)/); // no inline <script> bodies (only src= with nonce)
  });

  it('decodes a bag QR and redirects to a LOCALLY-built /claim URL (no open redirect)', () => {
    expect(js).toMatch(/BarcodeDetector/);                 // Android native
    expect(js).toMatch(/jsQR/);                            // iOS fallback
    expect(js).toMatch(/\[a-f0-9\]\{32\}/);                // validates a 32-hex token
    expect(js).toMatch(/'\/embed-app-v2\.html\?route=\/claim&bag='\s*\+\s*token/); // built locally
    // it must NOT navigate to the raw scanned string
    expect(js).not.toMatch(/location\.href\s*=\s*(text|decoded|res\.data|rawValue)/);
  });

  it('registers a service worker scoped to /scanbag (does not touch the main app)', () => {
    expect(js).toMatch(/serviceWorker\.register\('\/scanbag-sw\.js',\s*\{\s*scope:\s*'\/scanbag'\s*\}\)/);
    expect(sw).toMatch(/addEventListener\('fetch'/); // fetch handler → installable
  });

  it('handles install: Android beforeinstallprompt button + iOS A2HS hint', () => {
    expect(js).toMatch(/beforeinstallprompt/);
    expect(js).toMatch(/deferredPrompt\.prompt\(\)/);
    expect(js).toMatch(/iphone\|ipad\|ipod/i);
    expect(html).toContain('id="scanbag-install"');
    expect(html).toContain('id="scanbag-ios-hint"');
  });

  it('manifest is a standalone /scanbag mini-app with icons', () => {
    expect(manifest.start_url).toBe('/scanbag');
    expect(manifest.scope).toBe('/scanbag');
    expect(manifest.display).toBe('standalone');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.some(i => /192/.test(i.sizes))).toBe(true);
  });

  // Two host-scoped gates used to run ahead of these paths and each needed its own
  // exemption row: the partner-landing gate went with the marketing surface on
  // 2026-09-22 (Plan 3 Task 16), and the location quarantine went in Task 36. No
  // gate runs in front of the PWA any more, so there is nothing left to exempt it
  // from — tests/unit/quarantineRetired.test.js keeps both deletions in place.
});
