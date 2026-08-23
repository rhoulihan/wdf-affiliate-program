// Performance: versioned static assets under /assets must be served with a
// long-lived immutable Cache-Control so Cloudflare can serve them from edge
// without an origin revalidation round-trip on every page load. Assets are
// cache-busted via ?v= query strings, so immutable is safe — a content change
// ships a new URL. HTML must NEVER be immutable-cached (it carries the version
// stamps and per-request nonce), so that path is asserted separately.
const request = require('supertest');
const app = require('../../server');

describe('Static asset caching — /assets immutable', () => {
  it('serves CSS under /assets with a 1-year immutable Cache-Control', async () => {
    const res = await request(app).get('/assets/css/theme.css');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBeDefined();
    expect(res.headers['cache-control']).toMatch(/max-age=31536000/);
    expect(res.headers['cache-control']).toMatch(/immutable/);
    expect(res.headers['cache-control']).toMatch(/public/);
  });

  it('serves JS under /assets with a 1-year immutable Cache-Control', async () => {
    const res = await request(app).get('/assets/js/franchise-page-helpers.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/max-age=31536000/);
    expect(res.headers['cache-control']).toMatch(/immutable/);
  });

  it('serves the immutable header even when a ?v= cache-buster is present', async () => {
    const res = await request(app).get('/assets/js/franchise-page-helpers.js?v=20260524');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/immutable/);
  });

  it('serves /assets with a public, long-lived Cache-Control (Cloudflare-edge cacheable)', async () => {
    // The contract that makes images/CSS/JS clean CF edge HITs (~20ms) instead
    // of REVALIDATED origin round-trips (~0.2s): public + a long immutable TTL.
    // (Static asset GETs don't modify the session, so prod responses carry no
    // session cookie and CF caches them; the immutable TTL keeps them HIT.)
    const res = await request(app).get('/assets/images/locations/austin-tx/hero-1.webp?v=20260524');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/public/);
    expect(res.headers['cache-control']).toMatch(/max-age=31536000/);
    expect(res.headers['cache-control']).toMatch(/immutable/);
  });

  it('does NOT immutable-cache the franchise host HTML', async () => {
    // Use the default request host: the rundberglaundry.com family is served the
    // partner-program landing page by the partnerLanding middleware for non-exempt
    // paths and never reaches the franchise controller. The franchise HTML is
    // served identically on any other host, so omit the Host override.
    const res = await request(app).get('/austin-tx/');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control'] || '').not.toMatch(/immutable/);
    // The HTML keeps its short-lived cache window set by the controller.
    expect(res.headers['cache-control'] || '').toMatch(/max-age=60/);
  });
});
