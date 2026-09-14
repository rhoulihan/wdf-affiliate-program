// /wavemax-affiliate — RETIRED 2026-09-14 (owner decision, following the
// 2026-08-26 trademark complaints). The franchisor-branded affiliate interest
// page and its dedicated assets are deleted; the URL answers 410 Gone.
//
// This test locks the retirement three ways, because each has its own way of
// silently un-retiring the page:
//   1. The route answers 410 with a cacheable, empty, redirect-free response —
//      a 301 to /affiliate was explicitly rejected, so a Location header here
//      would be a compliance regression, not a convenience.
//   2. The three deleted files stay deleted (a restore would re-publish the
//      mark even if the route still 410s, since /assets/ is served statically).
//   3. /affiliate — the live recruitment page — is untouched collateral.
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../../server');

const ROOT = path.join(__dirname, '..', '..');
const PATHS = ['/wavemax-affiliate', '/wavemax-affiliate/'];

describe('/wavemax-affiliate is retired (410 Gone)', () => {
  for (const p of PATHS) {
    it(`GET ${p} → 410 with a day-long cache, empty body, no redirect`, async () => {
      const res = await request(app).get(p);
      expect(res.status).toBe(410);
      expect(res.headers['cache-control']).toBe('public, max-age=86400');
      expect(res.headers.location).toBeUndefined();
      expect(res.text).toBe('');
    });
  }

  it('the page and its dedicated assets are deleted from the repo', () => {
    for (const f of [
      'public/wavemax-affiliate.html',
      'public/assets/css/affiliate-ad.css',
      'public/assets/images/affiliate-ad-og.png'
    ]) {
      expect(fs.existsSync(path.join(ROOT, f))).toBe(false);
    }
  });

  it('does not reinstate the page via a redirect to /affiliate', () => {
    const serverJs = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    expect(serverJs).toMatch(/['"]\/wavemax-affiliate['"],\s*['"]\/wavemax-affiliate\/['"]/);
    expect(serverJs).not.toContain('\'wavemax-affiliate.html\'');
  });

  it('leaves the live /affiliate recruitment page serving', async () => {
    const res = await request(app).get('/affiliate');
    expect(res.status).toBe(200);
  });

  // The host gates run BEFORE the route (partnerLanding at server.js:372, the
  // quarantine at :589), so both entries stay load-bearing: drop either and the
  // marketing host families would answer with the partner landing / a corporate
  // redirect instead of the 410.
  describe('host gates still let the path reach its 410 handler', () => {
    const partnerLanding = require('../../server/middleware/partnerLanding');
    const quarantine = require('../../server/config/quarantineConfig');
    for (const p of PATHS) {
      it(`partnerLanding exempts ${p}`, () => expect(partnerLanding._isExempt(p)).toBe(true));
      it(`quarantine allows ${p}`, () => expect(quarantine.isAllowed(p)).toBe(true));
    }
  });
});
