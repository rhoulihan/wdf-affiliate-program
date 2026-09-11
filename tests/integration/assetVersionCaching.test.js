// Portal page-load performance: the SPA must not defeat its own caching.
//
// Diagnosed 2026-09-11 from a live Chrome trace of portal.atxwashdryfold.com.
// public/assets/js/embed-app-v2.js appended '?v=' + Date.now() to every page
// script and stylesheet it injected, and public/assets/js/i18n.js did the same
// to the 73 KB locales/<lang>/common.json bundle. Every URL was therefore unique
// per page load, so the year-long `public, max-age=31536000, immutable` header
// those files already ship was thrown away on EVERY visit, including repeats --
// nothing was ever served from the browser cache or the Cloudflare edge.
//
// The loader is also strictly serial (script.onload -> next request), so the
// cost was ~8 sequential origin round trips per load: 3.13 s of wall time
// measured against production.
//
// The fix is the convention this repo already uses elsewhere (a deploy-stable
// token, cf. server/modules/bags/labelSheetService.js ASSET_VERSION): one
// version that is constant within a deploy and changes with it.

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../../server');

const PUBLIC = path.join(__dirname, '..', '..', 'public');
const read = (p) => fs.readFileSync(path.join(PUBLIC, p), 'utf8');

// Matches a cache-buster built from a runtime clock in a URL, e.g.
//   '?v=' + Date.now()      `...?v=${timestamp}` where timestamp = new Date().getTime()
const RUNTIME_BUSTER = /\?v=['"`]?\s*\+?\s*(Date\.now\(\)|new Date\(\)\.getTime\(\))|\+\s*Date\.now\(\)/;

const metaOf = (html, name) => {
  const m = html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`));
  return m ? m[1] : null;
};

describe('portal asset caching — no runtime cache-busters', () => {
  describe('source: the SPA loader uses a deploy-stable version, not a clock', () => {
    it('embed-app-v2.js does not build asset URLs from Date.now()', () => {
      expect(read('assets/js/embed-app-v2.js')).not.toMatch(RUNTIME_BUSTER);
    });

    // i18n.js assigns the clock to a variable first, so RUNTIME_BUSTER (which
    // wants the call adjacent to ?v=) does NOT match it -- that spelling made
    // this guard pass while the defect was still present. `new Date().getTime()`
    // occurs exactly once in this file and IS the cache-buster, so assert on it
    // directly. Verified non-vacuous: this fails against the unfixed file.
    it('i18n.js does not build the locale URL from a runtime clock', () => {
      const src = read('assets/js/i18n.js');
      expect(src).not.toMatch(/new Date\(\)\.getTime\(\)/);
      expect(src).not.toMatch(RUNTIME_BUSTER);
    });

    // The browser is served the MINIFIED bundle. Fixing the source but
    // forgetting `npm run build:assets` would ship the defect unchanged.
    it('the built embed-app-v2.min.js carries the fix too', () => {
      expect(read('assets/js/embed-app-v2.min.js')).not.toMatch(/\+Date\.now\(\)|\?v=.{0,3}\+?Date\.now\(\)/);
    });
  });

  describe('runtime: the shell publishes a stable asset version', () => {
    it('serves a non-empty asset-version meta tag', async () => {
      const res = await request(app).get('/embed-app-v2.html');
      expect(res.status).toBe(200);
      const v = metaOf(res.text, 'asset-version');
      expect(v).toBeTruthy();
    });

    // The whole point is STABILITY: two loads must agree, or caching is
    // defeated exactly as it was by Date.now().
    it('returns the SAME version on two separate requests', async () => {
      const a = metaOf((await request(app).get('/embed-app-v2.html')).text, 'asset-version');
      const b = metaOf((await request(app).get('/embed-app-v2.html')).text, 'asset-version');
      expect(a).toBeTruthy();
      expect(b).toBe(a);
    });
  });

  describe('runtime: the main bundle token tracks ASSET_VERSION', () => {
    // Regression guard for a defect I shipped and then caught in a browser:
    // embed-app-v2.min.js was referenced with a HAND-BUMPED ?v=20260824a. The
    // bundle's contents changed but that token did not, and the file ships
    // `immutable, max-age=31536000` -- so every browser and the CF edge kept
    // serving the OLD bundle, and the page-script cache-busters it contained
    // survived the deploy. The token is now filled from ASSET_VERSION so the
    // two cannot drift.
    it('serves the bundle with the current ASSET_VERSION, not a stale literal', async () => {
      const { ASSET_VERSION } = require('../../server/config/assetVersion');
      const res = await request(app).get('/embed-app-v2.html');
      expect(res.text).toContain(`embed-app-v2.min.js?v=${ASSET_VERSION}`);
      expect(res.text).not.toContain('{{ASSET_VERSION}}');
    });

    it('the shell source keeps no hardcoded bundle version', () => {
      expect(read('embed-app-v2.html')).not.toMatch(/embed-app-v2\.min\.js\?v=\d/);
    });
  });

  describe('runtime: the locale bundle is cacheable', () => {
    // 73 KB on the critical path. Served by the generic express.static mount,
    // whose default is `public, max-age=0` -- so even with a stable URL the
    // browser revalidates on every single load.
    it('serves /locales JSON with a non-zero max-age', async () => {
      const res = await request(app).get('/locales/en/common.json');
      expect(res.status).toBe(200);
      const cc = res.headers['cache-control'] || '';
      const m = cc.match(/max-age=(\d+)/);
      expect(m).not.toBeNull();
      expect(Number(m[1])).toBeGreaterThan(0);
    });
  });
});
