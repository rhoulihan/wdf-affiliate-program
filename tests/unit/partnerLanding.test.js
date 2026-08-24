// Unit tests for the partner-program landing middleware.
//
// PREVIEW PHASE: the four Austin per-location domains serve the new partner page
// ONLY to the preview allowlist (default = admin IP 70.114.167.145); everyone
// else still gets the public "Coming soon" hold (noindex). Exempt paths pass
// through; the store IP sees the real app.
const partnerLanding = require('../../server/middleware/partnerLanding');

const PREVIEW_IP = '70.114.167.145';

const mkRes = () => {
  const res = { headers: {} };
  res.status = jest.fn(() => res);
  res.type = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.set = jest.fn((k, v) => { res.headers[k] = v; return res; });
  return res;
};
// req(host, path, ip?) — ip becomes cf-connecting-ip (the canonical client IP).
const req = (host = 'rundberglaundry.com', path = '/', ip) => ({
  method: 'GET', path,
  headers: { host, ...(ip ? { 'cf-connecting-ip': ip } : {}) }
});

describe('partnerLanding — preview gate', () => {
  it('serves the partner page to the preview IP on rundberglaundry.com', () => {
    const res = mkRes(); const next = jest.fn();
    partnerLanding(req('rundberglaundry.com', '/', PREVIEW_IP), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const html = res.send.mock.calls[0][0];
    expect(html).toMatch(/Rundberg Laundry/);
    expect(html).toMatch(/partner/i);
    expect(html).not.toMatch(/wavemax/i);
    expect(res.headers['X-Robots-Tag']).toBeUndefined();          // partner page is indexable-by-meta
    expect(html).toContain('https://rundberglaundry.com/');        // canonical
  });

  it('serves the partner page to the preview IP across all four host families', () => {
    for (const host of [
      'www.rundberglaundry.com',
      'runberglaundry.com', 'www.runberglaundry.com',
      'atxwashateria.com', 'www.atxwashateria.com',
      'atxwashdryfold.com', 'www.atxwashdryfold.com'
    ]) {
      const res = mkRes(); const next = jest.fn();
      partnerLanding(req(host, '/', PREVIEW_IP), res, next);
      expect(next).not.toHaveBeenCalled();
      const html = res.send.mock.calls[0][0];
      expect(html).toMatch(/Rundberg Laundry/);
    }
  });

  it('serves the public "Coming soon" hold to a non-preview visitor (noindex)', () => {
    const res = mkRes(); const next = jest.fn();
    partnerLanding(req('rundberglaundry.com', '/austin-tx/', '8.8.8.8'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const html = res.send.mock.calls[0][0];
    expect(html).toMatch(/coming soon/i);
    expect(html).toContain('google.com/maps');
    expect(html).not.toMatch(/partner/i);
    expect(html).not.toMatch(/wavemax/i);
    expect(res.headers['X-Robots-Tag']).toBe('noindex, nofollow');
  });

  it('holds for a visitor with no resolvable IP', () => {
    const res = mkRes(); const next = jest.fn();
    partnerLanding(req('atxwashateria.com', '/'), res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send.mock.calls[0][0]).toMatch(/coming soon/i);
  });

  it('catches arbitrary non-exempt paths too (no other handler leaks onto these hosts)', () => {
    for (const path of ['/austin-tx/', '/commercial', '/anything']) {
      const res = mkRes(); const next = jest.fn();
      partnerLanding(req('rundberglaundry.com', path, '8.8.8.8'), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    }
  });

  it('lets exempt paths through regardless of IP (api/assets/locales/well-known/app surfaces)', () => {
    for (const path of [
      '/api/v1/partner-inquiry', '/api/health',
      '/assets/css/partner-program.css', '/assets/js/partner-inquiry.js', '/assets/fonts/anton-latin.woff2',
      '/locales/es/common.json',
      '/.well-known/acme-challenge/abc',
      '/favicon.ico', '/robots.txt', '/sitemap.xml',
      '/embed-app-v2.html', '/admin', '/operator', '/scanbag', '/affiliate', '/affiliate/',
      '/wavemax-affiliate', '/wavemax-affiliate/',
      '/privacy-policy', '/terms-and-conditions',
    ]) {
      const res = mkRes(); const next = jest.fn();
      partnerLanding(req('rundberglaundry.com', path, '8.8.8.8'), res, next);
      expect(next).toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalled();
    }
  });

  it('lets non-GET requests through (POSTs are handled by the real routes)', () => {
    const res = mkRes(); const next = jest.fn();
    partnerLanding({ method: 'POST', path: '/', headers: { host: 'rundberglaundry.com' } }, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it('does NOT touch other hosts — wavemax.promo and crhsent.com pass through', () => {
    for (const host of ['wavemax.promo', 'www.wavemax.promo', 'crhsent.com', 'wavemaxlaundry.com']) {
      const res = mkRes(); const next = jest.fn();
      partnerLanding(req(host, '/', PREVIEW_IP), res, next);
      expect(next).toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalled();
    }
  });

  it('uses x-forwarded-host when present (behind the proxy)', () => {
    const preview = { method: 'GET', path: '/', headers: { host: 'localhost', 'x-forwarded-host': 'atxwashateria.com', 'cf-connecting-ip': PREVIEW_IP } };
    const res = mkRes(); const next = jest.fn();
    partnerLanding(preview, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send.mock.calls[0][0]).toMatch(/Rundberg Laundry/);
  });

  it('honors a custom PARTNER_PREVIEW_ALLOWLIST (CIDR)', () => {
    const ORIG = process.env.PARTNER_PREVIEW_ALLOWLIST;
    process.env.PARTNER_PREVIEW_ALLOWLIST = '203.0.113.0/24';
    try {
      const inRange = mkRes();
      partnerLanding(req('rundberglaundry.com', '/', '203.0.113.7'), inRange, jest.fn());
      expect(inRange.send.mock.calls[0][0]).toMatch(/Rundberg Laundry/);
      const outRange = mkRes();
      partnerLanding(req('rundberglaundry.com', '/', '70.114.167.145'), outRange, jest.fn());
      expect(outRange.send.mock.calls[0][0]).toMatch(/coming soon/i);
    } finally {
      if (ORIG === undefined) delete process.env.PARTNER_PREVIEW_ALLOWLIST;
      else process.env.PARTNER_PREVIEW_ALLOWLIST = ORIG;
    }
  });
});

// The store location must reach the REAL app on EVERY route — a store-IP bypass
// (IPv4 + the store's IPv6 /64), independent of the preview gate.
describe('partnerLanding store-IP bypass', () => {
  const ORIG = { ...process.env };
  afterEach(() => { process.env = { ...ORIG }; });

  function fresh(env) {
    let mod;
    jest.isolateModules(() => {
      Object.assign(process.env, env);
      mod = require('../../server/middleware/partnerLanding');
    });
    return mod;
  }
  const STORE_ENV = { STORE_IP_ADDRESS: '72.190.1.227', STORE_IP_RANGES: '2603:8080:db00:21b9::/64' };
  const mkRes2 = () => { const r = { headers: {} }; r.status = jest.fn(() => r); r.type = jest.fn(() => r); r.send = jest.fn(() => r); r.set = jest.fn((k, v) => { r.headers[k] = v; return r; }); return r; };
  const storeReq = (ip) => ({ method: 'GET', path: '/', headers: { host: 'rundberglaundry.com', 'cf-connecting-ip': ip } });

  it('serves the real app (next) for the store IPv4', () => {
    const pl = fresh(STORE_ENV);
    const res = mkRes2(); const next = jest.fn();
    pl(storeReq('72.190.1.227'), res, next);
    expect(next).toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it('serves the real app for a store IPv6 within the /64 (incl. IPv4-mapped form)', () => {
    const pl = fresh(STORE_ENV);
    for (const ip of ['2603:8080:db00:21b9:1d5b:e02c:7105:97f6', '::ffff:72.190.1.227']) {
      const res = mkRes2(); const next = jest.fn();
      pl(storeReq(ip), res, next);
      expect(next).toHaveBeenCalled();
    }
  });

  it('still holds (Coming soon) for a non-store, non-preview IP', () => {
    const pl = fresh(STORE_ENV);
    const res = mkRes2(); const next = jest.fn();
    pl(storeReq('8.8.8.8'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send.mock.calls[0][0]).toMatch(/coming soon/i);
  });
});

// Phase 4b public launch: atxwashdryfold.com is un-gated — its `/` serves the
// partner interest form to EVERYONE (indexable, no preview allowlist), while
// rundberglaundry.com (and the other host families) stay behind the preview gate.
describe('partnerLanding — atxwashdryfold public launch', () => {
  it('serves the partner page to a non-preview, non-store visitor on atxwashdryfold.com', () => {
    for (const host of ['atxwashdryfold.com', 'www.atxwashdryfold.com']) {
      const res = mkRes(); const next = jest.fn();
      partnerLanding(req(host, '/', '8.8.8.8'), res, next);   // arbitrary public IP, not the preview allowlist
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      const html = res.send.mock.calls[0][0];
      expect(html).toMatch(/Rundberg Laundry/);
      expect(html).toMatch(/partner/i);
      expect(html).not.toMatch(/coming soon/i);
      // The public marketing page MUST be indexable — no noindex header on this branch.
      expect(res.headers['X-Robots-Tag']).toBeUndefined();
    }
  });

  it('holds for a visitor with no resolvable IP too — the ungate is host-based, not IP-based', () => {
    const res = mkRes(); const next = jest.fn();
    partnerLanding(req('atxwashdryfold.com', '/'), res, next); // no IP at all
    expect(res.status).toHaveBeenCalledWith(200);
    const html = res.send.mock.calls[0][0];
    expect(html).toMatch(/Rundberg Laundry/);
    expect(html).not.toMatch(/coming soon/i);
    expect(res.headers['X-Robots-Tag']).toBeUndefined();
  });

  it('does NOT ungate rundberglaundry.com — a non-preview visitor there still gets the noindex hold', () => {
    const res = mkRes(); const next = jest.fn();
    partnerLanding(req('rundberglaundry.com', '/', '8.8.8.8'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const html = res.send.mock.calls[0][0];
    expect(html).toMatch(/coming soon/i);
    expect(html).not.toMatch(/partner/i);
    expect(res.headers['X-Robots-Tag']).toBe('noindex, nofollow');
  });

  it('still exempts app surfaces on atxwashdryfold.com (the SPA shell passes through, not the partner page)', () => {
    const res = mkRes(); const next = jest.fn();
    partnerLanding(req('atxwashdryfold.com', '/embed-app-v2.html', '8.8.8.8'), res, next);
    expect(next).toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it('exports the public-host list for testability', () => {
    expect(partnerLanding._publicHosts).toEqual(['atxwashdryfold.com', 'www.atxwashdryfold.com']);
  });
});
