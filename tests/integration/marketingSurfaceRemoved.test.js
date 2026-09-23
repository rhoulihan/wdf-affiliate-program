// The affiliate portal's marketing surface is GONE — Plan 3 Task 16.
//
// crhs-corporate on :3001 owns atxwashateria.com, rundberglaundry.com and
// atxwashdryfold.com (plus the runberglaundry.com typo alias) on both boxes, so
// the portal's own partner-program landing, its UT-student interest form, their
// CSS/JS/images, the partnerLanding host middleware and the marketing-host
// fall-through are dead weight. This file locks the removal five ways, because
// each has its own way of silently coming back:
//   1. the deleted source paths stay deleted (a restore re-publishes the page,
//      since /assets/ is served statically even with no route pointing at it);
//   2. server.js re-acquires neither the middleware nor the /affiliate route;
//   3. a marketing host gets exactly what a non-marketing host gets — the proof
//      that the host gate is gone rather than merely bypassed (and, because it
//      drives the real app through supertest, this file's boot proof too);
//   4. the partner.* locale subtree went with it, in all four languages;
//   5. the branding-guard exclusion list names no path that no longer exists —
//      a row that outlives its reason is exactly the rot this deletion removes.
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../../server');

const ROOT = path.join(__dirname, '..', '..');
const LANGS = ['en', 'es', 'pt', 'de'];

// The nine source paths the marketing surface occupied.
const DELETED_PATHS = [
  'public/partner-program.html',
  'public/affiliate.html',
  'public/assets/css/partner-program.css',
  'public/assets/css/affiliate.css',
  'public/assets/js/partner-inquiry.js',
  'public/assets/js/affiliate-inquiry.js',
  'public/assets/images/affiliate-og.png',
  'public/assets/images/locations',
  'server/middleware/partnerLanding.js'
];

const leaves = (o, p = '') => Object.entries(o)
  .flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v, `${p}${k}.`) : [`${p}${k}`]));

const localeOf = (l) => JSON.parse(
  fs.readFileSync(path.join(ROOT, 'public', 'locales', l, 'common.json'), 'utf8')
);

describe('the marketing surface is removed from the affiliate portal', () => {
  describe('(a) the deleted source paths stay deleted', () => {
    for (const p of DELETED_PATHS) {
      it(`${p} does not exist`, () => {
        expect(fs.existsSync(path.join(ROOT, p))).toBe(false);
      });
    }
  });

  describe('(b) server.js has not re-acquired the middleware or the route', () => {
    const serverJs = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

    it('names partnerLanding nowhere — not the require, the app.use, the ' +
       'fall-through host list, or a leftover comment', () => {
      expect(serverJs).not.toMatch(/partnerLanding/);
    });

    it("carries no '/affiliate' route literal (the interest form moved to crhs-corporate)", () => {
      expect(serverJs).not.toMatch(/'\/affiliate'/);
    });

    it('still answers the /wavemax-affiliate 410, which is separate collateral', () => {
      expect(serverJs).toMatch(/['"]\/wavemax-affiliate['"],\s*['"]\/wavemax-affiliate\/['"]/);
    });
  });

  describe('(c) a marketing host is served exactly like a non-marketing host', () => {
    // 8.8.8.8 stands in for the public: neither the store IP nor a preview
    // allowlist entry, i.e. the audience partnerLanding used to hold back with
    // the noindex "Coming soon" page.
    const get = (host) => request(app).get('/')
      .set('Host', host)
      .set('cf-connecting-ip', '8.8.8.8');

    it('GET / on rundberglaundry.com serves the app shell, not the partner page', async () => {
      const res = await get('rundberglaundry.com');
      expect(res.status).toBe(200);
      expect(res.text).toContain("window.__DEFAULT_ROUTE='/affiliate-login'");
      expect(res.text).not.toMatch(/coming soon/i);
      expect(res.headers['x-robots-tag']).toBeUndefined();
    });

    it('and gets byte-identical treatment to the app host', async () => {
      const marketing = await get('rundberglaundry.com');
      const control = await get('portal.atxwashdryfold.com');
      expect(marketing.status).toBe(control.status);
      // The CSP nonce differs per request, so compare with it neutralised. It appears
      // twice and in two shapes: as a nonce= attribute on each script, and inside the
      // csp-nonce meta — which injectNonce fills by APPENDING a second content=
      // attribute rather than replacing the empty one, so collapse that whole tag.
      const strip = (s) => s
        .replace(/<meta name="csp-nonce"[^>]*>/g, '<meta name="csp-nonce" content="N">')
        .replace(/nonce="[^"]*"/g, 'nonce="N"');
      expect(strip(marketing.text)).toBe(strip(control.text));
    });

    it('leaves genuine API 404s as JSON on a marketing host', async () => {
      const res = await request(app).get('/api/definitely-not-a-route')
        .set('Host', 'rundberglaundry.com')
        .set('cf-connecting-ip', '8.8.8.8');
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('API endpoint not found');
    });
  });

  describe('(d) the partner.* locale subtree is gone from every language', () => {
    for (const l of LANGS) {
      it(`${l} has 22 top-level keys, 1253 leaves and no partner key`, () => {
        const j = localeOf(l);
        expect('partner' in j).toBe(false);
        expect(Object.keys(j).length).toBe(22);
        expect(leaves(j).length).toBe(1253);
      });
    }
  });

  describe('(e) the four locale key sets are still identical', () => {
    const keys = Object.fromEntries(LANGS.map((l) => [l, leaves(localeOf(l)).sort()]));
    for (const l of LANGS.filter((x) => x !== 'en')) {
      it(`${l} matches en key for key`, () => {
        expect(keys[l]).toEqual(keys.en);
      });
    }
  });

  describe('(f) the branding guard names no path that no longer exists', () => {
    // EXCLUDED_PREFIXES is deliberately NOT asserted here: dc_private/ is a
    // sibling repo and node_modules/ + .git/ are untracked, so "the prefix
    // matches a file" is not a property this repo can assert. EXCLUDED_FILES is
    // the list of concrete named paths, and it is the one that rots.
    const src = fs.readFileSync(path.join(ROOT, 'tests/unit/branding-guard.test.js'), 'utf8');
    const block = src.match(/const EXCLUDED_FILES = new Set\(\[([\s\S]*?)\]\);/);

    it('exposes a parseable EXCLUDED_FILES list', () => {
      expect(block).not.toBeNull();
    });

    it('every excluded path still exists', () => {
      // Strip the // comments first: they quote bare brand tokens, which are prose,
      // not paths, and would otherwise read as permanently-missing files.
      const code = block[1].replace(/^\s*\/\/.*$/gm, '');
      const named = [...code.matchAll(/'([^']+)'/g)].map((m) => m[1]);
      expect(named.length).toBeGreaterThan(20);
      const missing = named.filter((p) => !fs.existsSync(path.join(ROOT, p)));
      expect(missing).toEqual([]);
    });
  });
});
