// GOLDEN-MASTER — locks the app's served security output so the migration to
// consume @crhs/web-core (shimming the inline security/infra copies to the
// shared package) is proven BYTE-IDENTICAL.
//
// Captured from the app BEFORE any web-core swap (probe run 2026-08-27, test
// env: NODE_ENV=test so upgrade-insecure-requests is absent and the cookie is
// the bare `portal.sid`, not the prod `__Host-` form). The nonce is the only
// per-request variable and is normalised to 'nonce-NONCE' before comparison.
//
// After the swap (server.js CSP block → wc.buildCspDirectives /
// wc.isStrictCspPath / wc.serializeCspDirectives; helmet block →
// wc.securityHeadersMiddleware), EVERY assertion here MUST still pass unchanged.
// If one fails, the swap drifted — fix the parameterisation, never the
// expectation.

const request = require('supertest');
const app = require('../../server');

const NONCE_RE = /'nonce-[^']+'/g;
const norm = (csp) => (csp || '').replace(NONCE_RE, "'nonce-NONCE'");

// Strict (nonce-based) CSP — a page in the strictCSPPages allowlist.
const EXPECTED_STRICT_CSP =
  "default-src 'self'; " +
  "script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://code.jquery.com https://www.local-marketing-reports.com https://static.cloudflareinsights.com https://maps.googleapis.com https://connect.facebook.net https://challenges.cloudflare.com https://www.gstatic.com https://www.google.com https://apis.google.com 'nonce-NONCE'; " +
  "style-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://fonts.googleapis.com https://stackpath.bootstrapcdn.com 'unsafe-inline'; " +
  "img-src 'self' data: https://atxwashateria.com https://atxwashdryfold.com https://portal.atxwashdryfold.com https://runberglaundry.com https://rundberglaundry.com https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://cdnjs.cloudflare.com https://flagcdn.com https://secure.walibu.com https://upload.wikimedia.org https://*.googleusercontent.com https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://*.gstatic.com https://www.facebook.com; " +
  "connect-src 'self' https://atxwashateria.com https://atxwashdryfold.com https://portal.atxwashdryfold.com https://runberglaundry.com https://rundberglaundry.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://stackpath.bootstrapcdn.com https://router.project-osrm.org https://graphhopper.com https://api.openrouteservice.org https://valhalla1.openstreetmap.de https://nominatim.openstreetmap.org https://www.local-marketing-reports.com https://places.googleapis.com https://maps.googleapis.com https://maps.gstatic.com https://connect.facebook.net https://www.facebook.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net; " +
  "font-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://fonts.gstatic.com; " +
  "object-src 'none'; " +
  "media-src 'self'; " +
  "frame-src 'self' https://portal.atxwashdryfold.com https://www.google.com https://maps.google.com https://my.matterport.com https://challenges.cloudflare.com https://www.recaptcha.net https://wavemax-bag-registration.firebaseapp.com; " +
  "form-action 'self'; " +
  "frame-ancestors 'self'; " +
  "base-uri 'self'; " +
  "child-src 'none'; " +
  "worker-src 'self'; " +
  "manifest-src 'self'";

// Non-strict CSP — script-src additionally carries 'unsafe-inline' (after the
// nonce). This is the ONLY difference from the strict header.
const EXPECTED_NONSTRICT_CSP = EXPECTED_STRICT_CSP.replace(
  "'nonce-NONCE';",
  "'nonce-NONCE' 'unsafe-inline';"
);

describe('GOLDEN-MASTER: @crhs/web-core consumption is byte-identical', () => {
  describe('CSP header', () => {
    it('strict page (/embed-app-v2.html) emits the exact strict CSP', async () => {
      const res = await request(app).get('/embed-app-v2.html');
      expect(norm(res.headers['content-security-policy'])).toBe(EXPECTED_STRICT_CSP);
    });

    it('non-strict path (/api/health) emits the exact non-strict CSP', async () => {
      const res = await request(app).get('/api/health');
      expect(norm(res.headers['content-security-policy'])).toBe(EXPECTED_NONSTRICT_CSP);
    });

    it('the only strict/non-strict delta is script-src unsafe-inline', () => {
      // Guards the transcription: the two golden strings differ by exactly the
      // documented single token.
      expect(EXPECTED_NONSTRICT_CSP).not.toBe(EXPECTED_STRICT_CSP);
      expect(EXPECTED_NONSTRICT_CSP.replace(" 'unsafe-inline';", ';')).toBe(EXPECTED_STRICT_CSP);
    });
  });

  describe('Session cookie name', () => {
    it('mints a session cookie named "portal.sid" (test env — prod is __Host-portal.sid)', async () => {
      const res = await request(app).get('/api/csrf-token');
      const cookies = res.headers['set-cookie'] || [];
      const sid = cookies.find((c) => c.startsWith('portal.sid='));
      expect(sid).toBeDefined();
      // Never the web-core default base name, never un-prefixed drift.
      expect(cookies.some((c) => c.startsWith('wavemax.sid='))).toBe(false);
    });
  });

  describe('Encryption round-trip (via the app require path)', () => {
    it('encrypt→decrypt returns the original plaintext', () => {
      const { encrypt, decrypt } = require('../../server/utils/encryption');
      const plain = 'golden-master-secret-🔒-value';
      const box = encrypt(plain);
      expect(box).toHaveProperty('iv');
      expect(box).toHaveProperty('encryptedData');
      expect(box).toHaveProperty('authTag');
      expect(decrypt(box)).toBe(plain);
    });
  });
});
