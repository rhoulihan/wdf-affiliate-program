// Owner-directed changes, 2026-09-11:
//   1. Remove the admin IP gate (explicitly approved after the exposure was
//      flagged). The admin surface is now reachable from any IP and protected by
//      password auth + adminLoginLimiter alone.
//   2. The invite-only program's "Register now" link must point at the PUBLIC
//      interest form, not the invite-gated /affiliate-register flow.
//   3. The interest form's free-text field becomes MANDATORY and asks how the
//      applicant would market the service and build a customer base.

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../../server');

const root = (...p) => path.join(__dirname, '..', '..', ...p);
const read = (p) => fs.readFileSync(root(p), 'utf8');

// An address deliberately outside any allowlist this app has ever used.
const OUTSIDE = '203.0.113.77';
const asOutsider = (req) => req.set('X-Forwarded-For', OUTSIDE).set('CF-Connecting-IP', OUTSIDE);

describe('admin IP gate removed (owner decision 2026-09-11)', () => {
  it('no longer mounts the gate anywhere in the request path', () => {
    for (const f of ['server.js', 'server/routes/authRoutes.js',
      'server/routes/embedRoutes.js', 'server/middleware/rbac.js']) {
      const live = read(f).split('\n')
        .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
        .join('\n');
      expect(live).not.toMatch(/adminIpGate/);
    }
  });

  it('serves the /admin shell to an off-allowlist IP (was a stealth 404)', async () => {
    const res = await asOutsider(request(app).get('/admin'));
    expect(res.status).toBe(200);
    expect(res.text).toContain("window.__DEFAULT_ROUTE='/administrator-login'");
  });

  it('serves the administrator login page to an off-allowlist IP', async () => {
    const res = await asOutsider(request(app).get('/administrator-login-embed.html'));
    expect(res.status).toBe(200);
  });

  it('reaches admin login auth from an off-allowlist IP (no pre-auth 404)', async () => {
    const res = await asOutsider(request(app).post('/api/v1/auth/administrator/login'))
      .send({ email: 'nobody@example.com', password: 'wrong-password' });
    // Anything but the stealth 404 proves the gate is gone; bad creds are fine.
    expect(res.status).not.toBe(404);
  });

  it('the operator gate is deliberately LEFT IN PLACE', () => {
    expect(read('server.js')).toMatch(/operatorIpGate/);
  });
});

describe('invite-only: the login page points at the public interest form', () => {
  it('publishes a config-driven interest-form URL as a meta tag', async () => {
    const { INTEREST_FORM_URL } = require('../../server/config/links');
    const res = await request(app).get('/embed-app-v2.html');
    expect(res.text).toContain(`<meta name="interest-form-url" content="${INTEREST_FORM_URL}">`);
  });

  it('does NOT send the link to the invite-gated register route', () => {
    const js = read('public/assets/js/affiliate-login.js');
    const handler = js.slice(js.indexOf("getElementById('registerLink')"));
    expect(handler).not.toMatch(/navigateParent\(['"]affiliate-register['"]\)/);
    expect(handler).toMatch(/interest-form-url/);
  });

  it('keeps the destination out of the source as a hardcoded absolute origin', () => {
    // Plan 3 moves the form to the content app; the URL must come from config.
    expect(read('server/config/links.js')).toMatch(/process\.env\.INTEREST_FORM_URL/);
  });

  it('relabels the call to action in all four locales', () => {
    for (const lang of ['en', 'es', 'pt', 'de']) {
      const d = JSON.parse(read(`public/locales/${lang}/common.json`));
      expect(typeof d.common.buttons.applyNow).toBe('string');
      expect(d.common.buttons.applyNow.length).toBeGreaterThan(0);
      expect(typeof d.affiliate.login.noAccount).toBe('string');
    }
    expect(read('public/affiliate-login-embed.html')).toContain('common.buttons.applyNow');
  });
});

describe('interest form: the marketing plan is mandatory', () => {
  const valid = {
    firstName: 'Test', lastName: 'Applicant',
    email: 'applicant@example.com', phone: '512-555-0100'
  };
  const plan = 'I live in Jester West and run the floor GroupMe with 400 people. '
    + 'I would post there, flyer the laundry rooms, and discount the first ten pickups for reviews.';

  it('rejects a submission with no marketing plan', async () => {
    const res = await request(app).post('/api/v1/affiliate-application').send(valid);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/market|customer base/i);
  });

  it('rejects a token one-word answer', async () => {
    const res = await request(app).post('/api/v1/affiliate-application')
      .send({ ...valid, message: 'flyers' });
    expect(res.status).toBe(400);
  });

  it('accepts a real marketing plan', async () => {
    const res = await request(app).post('/api/v1/affiliate-application')
      .send({ ...valid, message: plan });
    expect(res.status).toBeLessThan(400);
  });

  it('the form marks the field required and asks the customer-base question', () => {
    const html = read('public/affiliate.html');
    expect(html).toMatch(/How will you market this and build your customer base\?/);
    expect(html).toMatch(/<textarea[^>]*name="message"[^>]*required/);
    expect(html).not.toMatch(/Anything else\? \(optional\)/);
  });

  it('states that customer acquisition belongs to the partner', () => {
    const html = read('public/affiliate.html');
    expect(html).toMatch(/customer acquisition is yours/i);
    expect(html).toMatch(/100% of the service fees you charge/i);
  });
});
