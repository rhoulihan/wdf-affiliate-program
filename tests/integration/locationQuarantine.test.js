/**
 * Integration tests for the location quarantine middleware.
 *
 * Behavior under test:
 *   - When QUARANTINE_NON_AUSTIN is not 'true', all paths pass through (no
 *     change from baseline behavior).
 *   - When QUARANTINE_NON_AUSTIN === 'true':
 *       * Austin pages (/austin-tx/*, /api/austin-tx/*) pass through.
 *       * Affiliate-program app paths (/api/*, embed pages, assets, locales) pass.
 *       * Legal pages (/privacy-policy, /terms-*, /refund-policy) pass.
 *       * Everything else 302-redirects to the corporate site, preserving the
 *         original path (e.g., /about/ → wavemaxlaundry.com/about/).
 *       * Base URL '/' redirects to corporate root.
 *
 * The middleware reads QUARANTINE_NON_AUSTIN at request time, so tests can
 * flip the env var per-describe to exercise both modes.
 */

const request = require('supertest');
const app = require('../../server');

const CORPORATE = 'https://www.wavemaxlaundry.com';

describe('Location quarantine middleware', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.QUARANTINE_NON_AUSTIN;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.QUARANTINE_NON_AUSTIN;
    } else {
      process.env.QUARANTINE_NON_AUSTIN = originalEnv;
    }
  });

  describe('when QUARANTINE_NON_AUSTIN is unset (default)', () => {
    beforeEach(() => {
      delete process.env.QUARANTINE_NON_AUSTIN;
    });

    it('does not redirect / to corporate', async () => {
      const response = await request(app).get('/').redirects(0);
      // Existing behavior: / redirects to the app SPA shell (/embed-app-v2.html).
      // Just assert NOT corporate.
      expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
    });

    it('does not redirect /about/ to corporate', async () => {
      const response = await request(app).get('/about/').redirects(0);
      expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
    });

    it('does not redirect /dallas-tx/ to corporate', async () => {
      const response = await request(app).get('/dallas-tx/').redirects(0);
      expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
    });
  });

  describe('when QUARANTINE_NON_AUSTIN=false', () => {
    beforeEach(() => {
      process.env.QUARANTINE_NON_AUSTIN = 'false';
    });

    it('does not redirect /about/ to corporate', async () => {
      const response = await request(app).get('/about/').redirects(0);
      expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
    });
  });

  describe('when QUARANTINE_NON_AUSTIN=true', () => {
    beforeEach(() => {
      process.env.QUARANTINE_NON_AUSTIN = 'true';
    });

    // ── Allowlist: Austin ─────────────────────────────────────────────
    describe('Austin allowlist', () => {
      it('allows /austin-tx/ (does not 302 to corporate)', async () => {
        const response = await request(app).get('/austin-tx/').redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });

      it('allows /austin-tx (no trailing slash)', async () => {
        const response = await request(app).get('/austin-tx').redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });

      it('allows /austin-tx/wash-dry-fold/', async () => {
        const response = await request(app).get('/austin-tx/wash-dry-fold/').redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });

      it('allows /austin-tx/self-serve-laundry/', async () => {
        const response = await request(app).get('/austin-tx/self-serve-laundry/').redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });
    });

    // ── Allowlist: affiliate-program app ──────────────────────────────
    describe('Affiliate-program app allowlist', () => {
      it('allows /api/v1/* endpoints (may return 401, but not 302 to corporate)', async () => {
        const response = await request(app).get('/api/v1/affiliates/AFF-test/public').redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });

      it('allows /api/csrf-token', async () => {
        const response = await request(app).get('/api/csrf-token').redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });

      it('allows /api/health', async () => {
        const response = await request(app).get('/api/health').redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });

      it('allows /health', async () => {
        const response = await request(app).get('/health').redirects(0);
        expect(response.status).toBe(200);
      });

      it('allows /embed-app-v2.html', async () => {
        const response = await request(app).get('/embed-app-v2.html').redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });

      it('allows /affiliate-login-embed.html', async () => {
        const response = await request(app).get('/affiliate-login-embed.html').redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });

      it('allows /claim-embed.html', async () => {
        // The customer surface is now bag-claim registration only
        // (customer login/dashboard retired in Phase 1 PR 6).
        const response = await request(app).get('/claim-embed.html').redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });

      it('allows /operator-scan-embed.html', async () => {
        const response = await request(app).get('/operator-scan-embed.html').redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });

      it('allows /administrator-dashboard-embed.html', async () => {
        const response = await request(app).get('/administrator-dashboard-embed.html').redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });

      it('allows /assets/* static files', async () => {
        const response = await request(app).get('/assets/css/styles.css').redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });

      it('allows /locales/* translation files', async () => {
        const response = await request(app).get('/locales/en/common.json').redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });

      it('allows /franchise-default/* internal iframe content', async () => {
        const response = await request(app).get('/franchise-default/landing.html').redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });
    });

    // ── Allowlist: legal pages ────────────────────────────────────────
    describe('Legal allowlist', () => {
      it('allows /privacy-policy', async () => {
        const response = await request(app).get('/privacy-policy').redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });

      it('allows /terms-and-conditions', async () => {
        const response = await request(app).get('/terms-and-conditions').redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });

      it('allows /terms-of-service', async () => {
        const response = await request(app).get('/terms-of-service').redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });

      it('allows /refund-policy', async () => {
        const response = await request(app).get('/refund-policy').redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });
    });

    // ── Allowlist: design-explorer review tool ────────────────────────
    // The token-gated franchisor review tool. Quarantine must not 302 it to
    // corporate; explorerGuard then enforces EXPLORER_TOKEN (404 without it).
    describe('Design-explorer allowlist', () => {
      for (const p of [
        '/design-explorer', '/design-explorer/', '/design-explorer/index.html',
        '/design-explorer/explorer.js', '/design-explorer/render/manifest.json',
      ]) {
        it(`allows ${p} (does not 302 to corporate)`, async () => {
          const response = await request(app).get(p).redirects(0);
          expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
        });
      }

      it('still redirects a lookalike (/design-exploreriffic) to corporate', async () => {
        const response = await request(app).get('/design-exploreriffic').redirects(0);
        expect(response.status).toBe(302);
        expect(response.headers.location || '').toContain('wavemaxlaundry.com');
      });
    });

    // ── atxwashdryfold portal — NEVER redirect to corporate (Phase 4a app host) ──
    // The portal is CRHS's own migration-target host. Like crhsent.com it must
    // never be 302'd to the franchisor; the app serves it (content or its own
    // 404). Regression guard for the 2026-08-24 portal-login break (the SPA's
    // /embed-landing.html fragment was being redirected off-origin → CSP block).
    describe('atxwashdryfold portal host', () => {
      it('does not 302 an unknown path to corporate on portal.atxwashdryfold.com', async () => {
        const response = await request(app)
          .get('/some-unknown-path')
          .set('Host', 'portal.atxwashdryfold.com')
          .redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });

      it('does not 302 /embed-landing.html to corporate on the portal', async () => {
        const response = await request(app)
          .get('/embed-landing.html')
          .set('Host', 'portal.atxwashdryfold.com')
          .redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });

      it('allows /embed-landing.html regardless of host (SPA login fragment, now allowlisted)', async () => {
        const response = await request(app).get('/embed-landing.html').redirects(0);
        expect(response.headers.location || '').not.toContain('wavemaxlaundry.com');
      });
    });

    // ── Redirect: non-Austin franchise slugs ──────────────────────────
    describe('Non-Austin franchise slugs', () => {
      it('redirects /dallas-tx/ to corporate (preserve path)', async () => {
        const response = await request(app).get('/dallas-tx/').redirects(0);
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`${CORPORATE}/dallas-tx/`);
      });

      it('redirects /houston-tx (no trailing slash)', async () => {
        const response = await request(app).get('/houston-tx').redirects(0);
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`${CORPORATE}/houston-tx`);
      });

      it('redirects /dallas-tx/wash-dry-fold/ to corporate (preserve full path)', async () => {
        const response = await request(app).get('/dallas-tx/wash-dry-fold/').redirects(0);
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`${CORPORATE}/dallas-tx/wash-dry-fold/`);
      });
    });

    // ── Redirect: corporate marketing pages ───────────────────────────
    describe('Corporate marketing pages', () => {
      it('redirects / (base URL) to corporate root', async () => {
        const response = await request(app).get('/').redirects(0);
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`${CORPORATE}/`);
      });

      it('redirects /about/ to corporate', async () => {
        const response = await request(app).get('/about/').redirects(0);
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`${CORPORATE}/about/`);
      });

      it('redirects /franchise/ to corporate', async () => {
        const response = await request(app).get('/franchise/').redirects(0);
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`${CORPORATE}/franchise/`);
      });

      it('redirects /faq/ to corporate', async () => {
        const response = await request(app).get('/faq/').redirects(0);
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`${CORPORATE}/faq/`);
      });

      it('redirects /contact/ to corporate', async () => {
        const response = await request(app).get('/contact/').redirects(0);
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`${CORPORATE}/contact/`);
      });

      it('redirects /testimonials/ to corporate', async () => {
        const response = await request(app).get('/testimonials/').redirects(0);
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`${CORPORATE}/testimonials/`);
      });
    });

    // ── M-13: suspicious paths get redirected to corporate ROOT, not  ──
    //    path-preserved. Prevents phishing-friendly construction of links
    //    like https://rundberglaundry.com/<your-bank-login> →
    //    https://www.wavemaxlaundry.com/<your-bank-login>.
    //    prod-lockdown-2026-05-20 finding M-13.
    //
    //    Note: some paths (e.g. /.env, /.git/HEAD, /package.json,
    //    /Dockerfile) are caught EARLIER by the explicit sensitive-path
    //    404 handler in server.js (mounted before locationQuarantine).
    //    Those return 404 outright, which is strictly more secure than
    //    302→root. The patterns below are the ones that fall through to
    //    quarantine and exercise the new isSuspicious() filter.
    describe('Suspicious paths redirect to corporate root (M-13)', () => {
      const quarantineRouted = [
        '/.aws/credentials',
        '/.ssh/id_rsa',
        '/wp-admin',
        '/wp-admin/admin-ajax.php',
        '/wp-login.php',
        '/wp-content/uploads/shell.php',
        '/phpinfo.php',
        '/phpmyadmin/index.php',
        '/server-status',
        '/server-info',
        '/xmlrpc.php',
        '/cgi-bin/test.cgi',
        '/cmd.exe',
        '/etc/passwd',
        '/some/path/login.php',
        '/admin.asp',
        '/login.jsp',
      ];

      quarantineRouted.forEach((path) => {
        it(`redirects ${path} to corporate ROOT (no path preservation)`, async () => {
          const response = await request(app).get(path).redirects(0);
          expect(response.status).toBe(302);
          expect(response.headers.location).toBe(`${CORPORATE}/`);
        });
      });

      // Sanity: paths handled by the earlier explicit-404 handler return
      // 404 instead of redirecting at all (independent of quarantine
      // state but exercised here for completeness).
      const explicitly404 = [
        '/.env',
        '/.env.local',
        '/.env.production',
        '/.git/HEAD',
        '/.git/config',
        '/.svn/entries',
        '/.DS_Store',
        '/Dockerfile',
        '/docker-compose.yml',
        '/package.json',
        '/package-lock.json',
        '/composer.json',
        '/yarn.lock',
      ];

      explicitly404.forEach((path) => {
        it(`returns 404 for ${path} (sensitive-path probe handler)`, async () => {
          const response = await request(app).get(path).redirects(0);
          expect(response.status).toBe(404);
        });
      });
    });

    describe('Legitimate non-Austin paths still preserve (M-13 negative)', () => {
      // Confirm the new filter doesn't break the existing path-preserving
      // behavior for legitimate not-this-franchise navigations.
      const preserveCases = [
        ['/dallas-tx/', `${CORPORATE}/dallas-tx/`],
        ['/dallas-tx/wash-dry-fold/', `${CORPORATE}/dallas-tx/wash-dry-fold/`],
        ['/about/', `${CORPORATE}/about/`],
        ['/franchise/', `${CORPORATE}/franchise/`],
        ['/faq/', `${CORPORATE}/faq/`],
        ['/contact/', `${CORPORATE}/contact/`],
      ];

      preserveCases.forEach(([input, expected]) => {
        it(`preserves ${input}`, async () => {
          const response = await request(app).get(input).redirects(0);
          expect(response.status).toBe(302);
          expect(response.headers.location).toBe(expected);
        });
      });

      it('redirects /virtual-tour/ to corporate', async () => {
        const response = await request(app).get('/virtual-tour/').redirects(0);
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`${CORPORATE}/virtual-tour/`);
      });

      it('redirects /become-a-franchisee/ to corporate', async () => {
        const response = await request(app).get('/become-a-franchisee/').redirects(0);
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`${CORPORATE}/become-a-franchisee/`);
      });
    });

    // ── Redirect: unknown paths ───────────────────────────────────────
    describe('Unknown paths', () => {
      it('redirects an unknown path to corporate (preserve path)', async () => {
        const response = await request(app).get('/some-unknown-marketing-page').redirects(0);
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`${CORPORATE}/some-unknown-marketing-page`);
      });

      it('redirects a stale .html path to corporate', async () => {
        const response = await request(app).get('/about.html').redirects(0);
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`${CORPORATE}/about.html`);
      });

      it('preserves query string when redirecting', async () => {
        const response = await request(app).get('/about/?lang=es').redirects(0);
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`${CORPORATE}/about/?lang=es`);
      });
    });
  });
});

// Direct-call tests (isolateModules) so storeIPs loads with store env — the
// pre-loaded supertest `app` captured storeIPs before these vars were set.
describe('Location quarantine — store-IP bypass (store is never quarantined)', () => {
  const ORIG = { ...process.env };
  afterEach(() => { process.env = { ...ORIG }; });
  function freshMw(env) {
    let mod;
    jest.isolateModules(() => { Object.assign(process.env, env); mod = require('../../server/middleware/locationQuarantine'); });
    return mod;
  }
  const mkRes = () => { const r = { locals: {} }; r.redirect = jest.fn(); r.status = jest.fn(() => r); r.type = jest.fn(() => r); r.send = jest.fn(() => r); r.setHeader = jest.fn(); return r; };
  const req = (ip) => ({ path: '/about/', originalUrl: '/about/', hostname: 'rundberglaundry.com', headers: { 'cf-connecting-ip': ip } });

  it('lets a store IP (IPv4 + IPv6 /64) through a non-Austin path when quarantine is ON', () => {
    const mw = freshMw({ QUARANTINE_NON_AUSTIN: 'true', STORE_IP_ADDRESS: '72.190.1.227', STORE_IP_RANGES: '2603:8080:db00:21b9::/64' });
    for (const ip of ['72.190.1.227', '2603:8080:db00:21b9::5']) {
      const res = mkRes(); const next = jest.fn();
      mw(req(ip), res, next);
      expect(next).toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    }
  });

  it('still redirects a non-store IP on a non-Austin path', () => {
    const mw = freshMw({ QUARANTINE_NON_AUSTIN: 'true', STORE_IP_ADDRESS: '72.190.1.227', STORE_IP_RANGES: '2603:8080:db00:21b9::/64' });
    const res = mkRes(); const next = jest.fn();
    mw(req('8.8.8.8'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(302, expect.stringContaining('wavemaxlaundry.com'));
  });
});
