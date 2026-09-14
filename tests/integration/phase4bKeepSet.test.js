/**
 * Phase 4b keep-set smoke test.
 *
 * After retiring the franchise/Austin marketing subsystem, this asserts that
 * the surfaces we deliberately KEPT still serve, and that a retired franchise
 * route resolves to a clean 404 (NOT a 500 — a 500 would signal a dangling
 * handler or a require of a deleted module).
 *
 * Kept surfaces:
 *   - GET /embed-app-v2.html  → the app SPA shell (served with a CSP nonce)
 *   - GET /affiliate          → public UT-student affiliate recruitment page
 *
 * Retired surfaces (must 404, not 500):
 *   - GET /franchise
 *   - GET /api/v1/franchises
 *
 * Also retired, but deliberately 410 rather than 404 (2026-09-14, owner
 * decision after the 2026-08-26 trademark complaints):
 *   - GET /wavemax-affiliate → 410 Gone, never a 301 to /affiliate
 */

const request = require('supertest');
const app = require('../../server');

describe('Phase 4b keep-set smoke', () => {
  describe('kept surfaces still serve (200)', () => {
    it('serves the app SPA shell at /embed-app-v2.html', async () => {
      const res = await request(app).get('/embed-app-v2.html');
      expect(res.status).toBe(200);
    });

    it('serves the affiliate recruitment page at /affiliate', async () => {
      const res = await request(app).get('/affiliate');
      expect(res.status).toBe(200);
    });

  });

  describe('the retired affiliate interest page is gone (410, never 200/301)', () => {
    it('returns 410 for /wavemax-affiliate', async () => {
      const res = await request(app).get('/wavemax-affiliate');
      expect(res.status).toBe(410);
      expect(res.headers.location).toBeUndefined();
    });
  });

  describe('retired franchise routes are gone (404, never 500)', () => {
    it('returns 404 for /franchise', async () => {
      const res = await request(app).get('/franchise');
      expect(res.status).toBe(404);
      expect(res.status).not.toBe(500);
    });

    it('returns 404 for /api/v1/franchises', async () => {
      const res = await request(app).get('/api/v1/franchises');
      expect(res.status).toBe(404);
      expect(res.status).not.toBe(500);
    });
  });
});
