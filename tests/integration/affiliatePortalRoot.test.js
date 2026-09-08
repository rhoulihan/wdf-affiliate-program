// Integration: the portal root (GET /) lands on the affiliate login.
//
// portal.atxwashdryfold.com/ serves the SPA shell with
// window.__DEFAULT_ROUTE='/affiliate-login' injected (clean address bar), mirroring
// the /admin and /operator clean-URL handlers — but PUBLIC (no IP gate): the affiliate
// login credentials are the gate. embed-app-v2.js reads __DEFAULT_ROUTE and routes an
// unauthenticated visitor to the login page (an authenticated affiliate to the dashboard).
jest.mock('../../server/utils/emailService');

const request = require('supertest');
const app = require('../../server');

describe('portal root → affiliate login', () => {
  it('serves the SPA shell with the affiliate-login default route injected', async () => {
    const res = await request(app).get('/').redirects(0);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain("window.__DEFAULT_ROUTE='/affiliate-login'");
    expect(res.text).toContain('embed-app-v2.min.js'); // it really is the SPA shell
  });

  it('is public — served to any IP (no stealth 404, unlike /admin and /operator)', async () => {
    const res = await request(app).get('/').set('cf-connecting-ip', '198.51.100.9').redirects(0);
    expect(res.status).toBe(200);
    expect(res.text).toContain("window.__DEFAULT_ROUTE='/affiliate-login'");
  });
});
