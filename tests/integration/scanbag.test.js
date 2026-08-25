// /scanbag route — serves the standalone PWA with a camera Permissions-Policy
// carve-out, and its manifest + service worker.
jest.setTimeout(60000);
const request = require('supertest');
const app = require('../../server');

describe('GET /scanbag (mobile PWA)', () => {
  it('serves the page (200 HTML) with the nonce filled and camera allowed', async () => {
    const res = await request(app).get('/scanbag');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('id="scanbag-video"');
    expect(res.text).not.toContain('{{nonce}}');           // nonce was injected
    expect(res.headers['permissions-policy']).toMatch(/camera=\(self\)/);
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });

  it('serves the web app manifest, brand-filled server-side', async () => {
    const brand = require('../../server/config/brand');
    const res = await request(app).get('/scanbag-manifest.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/manifest\+json/);
    expect(res.body.start_url).toBe('/scanbag');
    expect(res.body.display).toBe('standalone');
    // The install name must reflect the CONFIGURED brand, not the raw
    // {{BRAND_NAME}} template and not a hardcoded generic fallback.
    expect(res.body.name).toBe(`${brand.displayName} Scan Bag`);
    expect(res.body.name).not.toContain('{{BRAND_NAME}}');
    expect(res.body.description).toContain(brand.displayName);
  });

  it('serves the service worker as JavaScript', async () => {
    const res = await request(app).get('/scanbag-sw.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.text).toMatch(/addEventListener\('fetch'/);
  });

  it('does NOT leak camera on a normal page (global policy still disables it)', async () => {
    const res = await request(app).get('/embed-app-v2.html');
    expect(res.headers['permissions-policy']).toMatch(/camera=\(\)/);
  });
});
