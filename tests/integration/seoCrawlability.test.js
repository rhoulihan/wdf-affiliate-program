// Indexing fix: the app's host pages render their real content inside an iframe
// whose source is /embed-app-v2.html. robots.txt used to Disallow that route, so
// Googlebot could only ever see the thin host shell — it could not crawl/render
// the content a visitor actually sees. robots.txt must NOT block the embed
// content route, while still blocking private surfaces (api/admin/monitoring)
// and advertising the sitemap.
//
// Plan 3 Task 37: this app is served on exactly ONE host now, so robots.txt and
// sitemap.xml no longer vary by request Host — the per-location marketing hosts
// they used to serve belong to crhs-corporate on :3001, which serves its own.
const request = require('supertest');
const app = require('../../server');

const PORTAL = 'https://portal.atxwashdryfold.com';

describe('SEO — robots.txt crawlability of host-page content', () => {
  it('does NOT block the embed content route (Googlebot must be able to render iframe content)', async () => {
    const res = await request(app).get('/robots.txt').set('Host', 'portal.atxwashdryfold.com');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).not.toMatch(/Disallow:\s*\/embed-app-v2\.html/i);
  });

  it('still blocks private surfaces and advertises the portal sitemap', async () => {
    const res = await request(app).get('/robots.txt').set('Host', 'portal.atxwashdryfold.com');
    expect(res.text).toMatch(/Disallow:\s*\/api\//);
    expect(res.text).toMatch(/Disallow:\s*\/admin\//);
    expect(res.text).toMatch(/Disallow:\s*\/monitoring\//);
    expect(res.text).toMatch(/^Allow:\s*\/$/m);
    expect(res.text).toContain(`Sitemap: ${PORTAL}/sitemap.xml`);
  });

  it('robots.txt does not reflect the request Host back into its body', async () => {
    const res = await request(app).get('/robots.txt').set('Host', 'evil.example.test');
    expect(res.text).not.toContain('evil.example.test');
    expect(res.text).toContain(`Sitemap: ${PORTAL}/sitemap.xml`);
  });

  it('sitemap.xml is apex-only (the deep marketing pages were retired in Phase 4b)', async () => {
    const res = await request(app).get('/sitemap.xml').set('Host', 'portal.atxwashdryfold.com');
    expect(res.status).toBe(200);
    expect(res.text).toContain(`<loc>${PORTAL}/</loc>`);
    expect(res.text).not.toContain('/austin-tx/');
  });

  it('sitemap.xml does not reflect the request Host back into its body', async () => {
    const res = await request(app).get('/sitemap.xml').set('Host', 'evil.example.test');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('evil.example.test');
    expect(res.text).toContain(`<loc>${PORTAL}/</loc>`);
  });
});
