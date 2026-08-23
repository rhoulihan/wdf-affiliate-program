// crhsent.com — verifies the sales site is served through the app under the
// full security model: strict nonce-based CSP, no inline CSS/JS, external assets.
const request = require('supertest');
const app = require('../../server');

const HOST = 'crhsent.com';

describe('crhsent.com — full security model (app-served, strict CSP)', () => {
  it('serves /wavemax/ with a strict, nonce-based CSP (no unsafe-inline in script-src)', async () => {
    const res = await request(app).get('/wavemax/').set('Host', HOST);
    expect(res.status).toBe(200);

    const csp = res.headers['content-security-policy'];
    expect(csp).toBeTruthy();
    const scriptSrc = (csp.split(';').find(d => d.trim().startsWith('script-src')) || '').trim();
    expect(scriptSrc).toMatch(/'nonce-/);              // nonce present
    expect(scriptSrc).not.toMatch(/'unsafe-inline'/);  // strict: scripts cannot be inline
  });

  it('has no inline JS, and links the external asset bundle', async () => {
    const res = await request(app).get('/wavemax/').set('Host', HOST);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Run the checks yourself');       // real page content (stable thesis heading)
    // script-src is strict (nonce-only, no 'unsafe-inline') so inline JS is forbidden:
    // every <script> must carry the per-request nonce and reference an external src.
    expect(res.text).not.toMatch(/<script(?![^>]*\bnonce=)[^>]*>/);  // no nonce-less <script>
    expect(res.text).not.toMatch(/<script\b[^>]*>\s*[^<\s]/);        // no inline <script> body
    // NOTE: inline style="" attributes are intentionally allowed — style-src always carries
    // 'unsafe-inline' by design (server.js CSP3-quirk handling). Only script-src is strict,
    // since CSS injection is a materially weaker threat than JS injection. The page links the
    // shared stylesheet but legitimately uses a few inline style attrs in the exposé callouts.
    // Asset refs carry a ?v= cache-buster, so match the path (not an exact-quote substring).
    expect(res.text).toMatch(/href="\/wavemax\/styles\.css(\?[^"]*)?"/);  // external stylesheet
    expect(res.text).toMatch(/src="\/wavemax\/app\.js(\?[^"]*)?"/);       // external script
  });

  it('injects the per-request nonce into the csp-nonce meta', async () => {
    const res = await request(app).get('/wavemax/').set('Host', HOST);
    const m = res.text.match(/<meta name="csp-nonce" content="([^"]+)"/);
    expect(m).toBeTruthy();
    expect(m[1].length).toBeGreaterThan(10);
  });

  it('serves the external stylesheet and script with correct types', async () => {
    const css = await request(app).get('/wavemax/styles.css').set('Host', HOST);
    expect(css.status).toBe(200);
    expect(css.headers['content-type']).toMatch(/css/);

    const js = await request(app).get('/wavemax/app.js').set('Host', HOST);
    expect(js.status).toBe(200);
    expect(js.headers['content-type']).toMatch(/javascript/);
  });

  it('does not leak files outside the crhsent root (path-traversal guard)', async () => {
    const res = await request(app).get('/wavemax/%2e%2e%2f%2e%2e%2fserver.js').set('Host', HOST);
    expect(res.status).not.toBe(200);
  });
});

describe('crhsent.com — corporate site (clean URLs, SEO, nonce)', () => {
  it('serves the home page at /', async () => {
    const res = await request(app).get('/').set('Host', HOST);
    expect(res.status).toBe(200);
    expect(res.text).toContain('WE BUILD THE');
    // nonce injected, placeholder consumed
    expect(res.text).not.toContain('{{CSP_NONCE}}');
    expect(res.text).toMatch(/<meta name="csp-nonce" content="[^"]{10,}"/);
    expect(res.text).toContain('og:image');
  });

  it('serves sub-pages at clean URLs WITHOUT a trailing slash', async () => {
    for (const [path, needle] of [
      ['/capabilities', 'What I build'],
      ['/work', 'Proof of work'],
      ['/about', 'Houlihan'],
      ['/contact', 'Start a']
    ]) {
      const res = await request(app).get(path).set('Host', HOST);
      expect(res.status).toBe(200);
      expect(res.text).toContain(needle);
    }
  });

  it('serves the same page WITH a trailing slash', async () => {
    const res = await request(app).get('/about/').set('Host', HOST);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Houlihan');
  });

  it('exposes the verified patent dossier on /about (links to Google Patents)', async () => {
    const res = await request(app).get('/about').set('Host', HOST);
    expect(res.text).toContain('US 11,461,302 B1');
    expect(res.text).toContain('patents.google.com/patent/US11461302B1');
  });

  it('serves robots.txt (text) pointing at the sitemap', async () => {
    const res = await request(app).get('/robots.txt').set('Host', HOST);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('Sitemap: https://crhsent.com/sitemap.xml');
  });

  it('serves sitemap.xml (xml) listing the corporate URLs', async () => {
    const res = await request(app).get('/sitemap.xml').set('Host', HOST);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toContain('https://crhsent.com/work');
  });

  it('serves the self-hosted webfont with a font content-type', async () => {
    const res = await request(app).get('/assets/fonts/inter-400.woff2').set('Host', HOST);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/font|woff2|octet-stream/);
  });
});
