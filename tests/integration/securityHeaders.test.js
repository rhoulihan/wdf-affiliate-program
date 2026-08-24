// Security headers regression suite.
//
// Locks in the baseline set of HTTP security headers produced by the
// application so that future refactors can't silently drop one. Each
// assertion below ties to a specific finding ID in
// docs/security/prod-lockdown-2026-05-20.md — keep them in sync.

const request = require('supertest');
const app = require('../../server');

describe('Security Headers (regression — prod-lockdown-2026-05-20)', () => {
  // We probe a stable, public, no-auth path. /api/health is the simplest
  // and exercises the middleware chain we care about (helmet + custom
  // header middleware + CSP middleware).
  const probe = () => request(app).get('/api/health');

  describe('Helmet baseline', () => {
    it('sets HSTS with 1y max-age + includeSubDomains + preload', async () => {
      const r = await probe();
      expect(r.headers['strict-transport-security']).toBe(
        'max-age=31536000; includeSubDomains; preload'
      );
    });

    it('sets Referrer-Policy to strict-origin-when-cross-origin (APP-002)', async () => {
      const r = await probe();
      // Previously 'same-origin' — tightened so cross-origin navigations
      // send origin only (not full URL), with no leakage on HTTPS→HTTP
      // downgrade.
      expect(r.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    it('sets X-Content-Type-Options: nosniff', async () => {
      const r = await probe();
      expect(r.headers['x-content-type-options']).toBe('nosniff');
    });

    it('does not leak X-Powered-By', async () => {
      const r = await probe();
      expect(r.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('Custom security headers', () => {
    it('sets a deny-everything Permissions-Policy', async () => {
      const r = await probe();
      const pp = r.headers['permissions-policy'];
      expect(pp).toBeDefined();
      // Sensitive surfaces (camera/mic/geo/payment/usb) all gated to ()
      expect(pp).toMatch(/geolocation=\(\)/);
      expect(pp).toMatch(/camera=\(\)/);
      expect(pp).toMatch(/microphone=\(\)/);
      expect(pp).toMatch(/payment=\(\)/);
    });

    it('sets X-Permitted-Cross-Domain-Policies: none', async () => {
      const r = await probe();
      expect(r.headers['x-permitted-cross-domain-policies']).toBe('none');
    });

    it('sets X-Frame-Options: SAMEORIGIN (belt-and-suspenders with CSP frame-ancestors)', async () => {
      const r = await probe();
      expect(r.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    it('sets Cross-Origin-Opener-Policy: same-origin-allow-popups (APP-003)', async () => {
      const r = await probe();
      // 'same-origin-allow-popups' allows same-origin popups to retain an
      // opener reference while preventing reverse window.opener abuse from
      // cross-origin children.
      expect(r.headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
    });
  });

  describe('CSP baseline', () => {
    it('emits a Content-Security-Policy header on every response', async () => {
      const r = await probe();
      expect(r.headers['content-security-policy']).toBeDefined();
    });

    it("CSP includes object-src 'none'", async () => {
      const r = await probe();
      expect(r.headers['content-security-policy']).toMatch(/object-src 'none'/);
    });

    it("CSP includes base-uri 'self'", async () => {
      const r = await probe();
      expect(r.headers['content-security-policy']).toMatch(/base-uri 'self'/);
    });

    it("CSP frame-ancestors limits embedders to wavemaxlaundry.com + self", async () => {
      const r = await probe();
      const csp = r.headers['content-security-policy'];
      expect(csp).toContain("frame-ancestors 'self' https://www.wavemaxlaundry.com https://wavemaxlaundry.com");
    });

    // Hibu Social retargeting — Meta Pixel (marketing chrome only). The
    // pixel loader (connect.facebook.net/en_US/fbevents.js) must be in
    // script-src, and fbevents.js beacons to www.facebook.com/tr (covered
    // by connect-src + img-src). These assertions lock the allowlist so a
    // future CSP refactor can't silently break call/ad tracking.
    it('CSP script-src allows the Meta Pixel loader (connect.facebook.net)', async () => {
      const r = await probe();
      const csp = r.headers['content-security-policy'];
      const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src'));
      expect(scriptSrc).toContain('https://connect.facebook.net');
    });

    it('CSP connect-src + img-src allow the Meta Pixel beacon (www.facebook.com)', async () => {
      const r = await probe();
      const csp = r.headers['content-security-policy'];
      const connectSrc = csp.split(';').find((d) => d.trim().startsWith('connect-src'));
      const imgSrc = csp.split(';').find((d) => d.trim().startsWith('img-src'));
      expect(connectSrc).toContain('https://connect.facebook.net');
      expect(connectSrc).toContain('https://www.facebook.com');
      expect(imgSrc).toContain('https://www.facebook.com');
    });

    // Firebase Phone Auth's reCAPTCHA v2 fallback fetches from www.google.com
    // /recaptcha/... — without these in connect-src/frame-src the verification
    // XHRs are CSP-blocked and signInWithPhoneNumber hangs (no error surfaces).
    it('CSP connect-src + frame-src allow reCAPTCHA (www.google.com)', async () => {
      const r = await probe();
      const csp = r.headers['content-security-policy'];
      const connectSrc = csp.split(';').find((d) => d.trim().startsWith('connect-src'));
      const frameSrc = csp.split(';').find((d) => d.trim().startsWith('frame-src'));
      expect(connectSrc).toContain('https://www.google.com');
      expect(frameSrc).toContain('https://www.google.com');
    });
  });

  // Phase 4b guard: the clean-URL-slug matcher (isCleanUrlSlugPage in
  // server.js) is what gives the kept single-segment marketing/app slug
  // routes their nonce-based STRICT CSP. If that matcher is ever removed or
  // its wiring broken, these pages silently fall back to relaxed CSP
  // (server.js pushes 'unsafe-inline' into script-src when !useStrictCSP) —
  // a security + Lighthouse-quality-bar regression. Lock it: script-src must
  // NOT carry 'unsafe-inline' on /affiliate, /wavemax-affiliate, /scanbag.
  describe('Strict CSP on kept clean-URL slug pages (Phase 4b)', () => {
    for (const slug of ['/affiliate', '/wavemax-affiliate', '/scanbag']) {
      it(`GET ${slug} → script-src has no 'unsafe-inline'`, async () => {
        const r = await request(app).get(slug);
        const csp = r.headers['content-security-policy'];
        expect(csp).toBeDefined();
        const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src'));
        expect(scriptSrc).toBeDefined();
        expect(scriptSrc).not.toContain("'unsafe-inline'");
      });
    }
  });
});
