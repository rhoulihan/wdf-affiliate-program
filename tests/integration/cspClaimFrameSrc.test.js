// web-core v0.2.0 carries no project-specific origins, so THIS APP must supply
// the Firebase auth-helper frame origin. Dropping it CSP-blocks the auth helper
// iframe and signInWithPhoneNumber hangs on the claim page (public/assets/js/
// claim.js:888 boots Firebase with the server-provided authDomain).
const request = require('supertest');
const app = require('../../server');

const FIREBASE_AUTH_HELPER = 'https://wavemax-bag-registration.firebaseapp.com';
const PORTAL = 'https://portal.atxwashdryfold.com';
const LOCATION_ORIGINS = [
  'https://atxwashateria.com',
  'https://atxwashdryfold.com',
  PORTAL,
  'https://runberglaundry.com',
  'https://rundberglaundry.com'
];
const dir = (csp, name) => (csp.split(';').find((d) => d.trim().startsWith(name)) || '').trim();
const cspOf = async (p) => (await request(app).get(p)).headers['content-security-policy'];

describe('portal CSP — app-supplied origins survive the web-core profile swap', () => {
  it('frame-src allows the Firebase auth-helper iframe (claim page phone auth)', async () => {
    expect(dir(await cspOf('/embed-app-v2.html'), 'frame-src')).toContain(FIREBASE_AUTH_HELPER);
  });

  it('frame-src allows the portal origin', async () => {
    expect(dir(await cspOf('/embed-app-v2.html'), 'frame-src')).toContain(PORTAL);
  });

  it('img-src and connect-src keep all five location origins', async () => {
    const csp = await cspOf('/embed-app-v2.html');
    for (const origin of LOCATION_ORIGINS) {
      expect(dir(csp, 'img-src')).toContain(origin);
      expect(dir(csp, 'connect-src')).toContain(origin);
    }
  });
});
