// Indexing fix: the franchise host pages render their real content inside an
// iframe whose source is /embed-app-v2.html. robots.txt used to Disallow that
// route, so Googlebot could only ever see the thin host shell — it could not
// crawl/render the content a visitor actually sees. robots.txt must NOT block
// the embed content route, while still blocking private surfaces (api/admin/
// monitoring) and pointing each managed host at its own sitemap.
const request = require('supertest');
const app = require('../../server');

describe('SEO — robots.txt crawlability of host-page content', () => {
  it('does NOT block the embed content route (Googlebot must be able to render iframe content)', async () => {
    const res = await request(app).get('/robots.txt').set('Host', 'rundberglaundry.com');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).not.toMatch(/Disallow:\s*\/embed-app-v2\.html/i);
  });

  it('still blocks private surfaces and advertises the per-host sitemap', async () => {
    const res = await request(app).get('/robots.txt').set('Host', 'rundberglaundry.com');
    expect(res.text).toMatch(/Disallow:\s*\/api\//);
    expect(res.text).toMatch(/Disallow:\s*\/admin\//);
    expect(res.text).toMatch(/Disallow:\s*\/monitoring\//);
    expect(res.text).toMatch(/^Allow:\s*\/$/m);
    expect(res.text).toMatch(/Sitemap:\s*https:\/\/rundberglaundry\.com\/sitemap\.xml/);
  });

  it('sitemap.xml for rundberglaundry is apex-only (Austin deep pages retired in Phase 4b)', async () => {
    const res = await request(app).get('/sitemap.xml').set('Host', 'rundberglaundry.com');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<loc>https://rundberglaundry.com/</loc>');
    expect(res.text).not.toContain('/austin-tx/');
  });

  it('sitemap.xml for atxwashdryfold is apex-only (its deep WDF page self-canonicals to the apex)', async () => {
    const res = await request(app).get('/sitemap.xml').set('Host', 'atxwashdryfold.com');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<loc>https://atxwashdryfold.com/</loc>');
    // The deep page canonicals to the apex, so it must NOT appear in the sitemap
    // (a non-canonical sitemap URL is what made GSC flag "Discovered - not indexed").
    expect(res.text).not.toContain('/austin-tx/wash-dry-fold/');
  });
});
