'use strict';
// nodemailer is stubbed so the From-header test can capture mailOptions without
// opening a real SMTP connection. The stub is inert for the supertest cases,
// which never send mail.
jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
const request = require('supertest');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const app = require('../../server');
const authTokenService = require('../../server/services/authTokenService');
const brand = require('../../server/config/brand');
const { sendEmail } = require('../../server/services/email/transport');
const templateManager = require('../../server/services/email/template-manager');
describe('4a host canonicalization', () => {
  const asHost = (h, url = '/embed-app-v2.html') =>
    request(app).get(url).set('Host', h).set('X-Forwarded-Proto', 'https');
  test("retired 'wavemax.promo' host 301s to portal (path+query preserved)", async () => {
    const res = await asHost('wavemax.promo', '/claim-embed.html?bag=abc');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('https://portal.atxwashdryfold.com/claim-embed.html?bag=abc');
  });
  test('www./affiliate. retired hosts also 301', async () => {
    for (const h of ['www.wavemax.promo', 'affiliate.wavemax.promo']) {
      const r = await asHost(h);
      expect(r.status).toBe(301);
      expect(r.headers.location).toBe('https://portal.atxwashdryfold.com/embed-app-v2.html');
    }
  });
  test('portal.atxwashdryfold.com is served, not redirected', async () => {
    const r = await asHost('portal.atxwashdryfold.com');
    expect(r.status).toBe(200);
  });
  test('served CSP allows portal.atxwashdryfold.com in connect-src and frame-ancestors', async () => {
    const r = await asHost('portal.atxwashdryfold.com');
    const csp = r.headers['content-security-policy'];
    expect(csp).toBeTruthy();
    const directive = (name) =>
      (csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name} `)) || '');
    expect(directive('connect-src')).toContain('https://portal.atxwashdryfold.com');
    expect(directive('frame-ancestors')).toContain('https://portal.atxwashdryfold.com');
  });

  test('session cookie is named portal.sid, never the retired session cookie', async () => {
    // saveUninitialized:true mints a session cookie on any served (non-/health) request.
    const r = await asHost('portal.atxwashdryfold.com');
    const setCookie = r.headers['set-cookie'];
    expect(Array.isArray(setCookie)).toBe(true);
    // Under NODE_ENV=test the bare name is used; the __Host- prefix is prod-only.
    const sessionCookie = setCookie.find((c) => /^(?:__Host-)?portal\.sid=/.test(c));
    expect(sessionCookie).toBeTruthy();
    expect(setCookie.some((c) => /(?:__Host-)?wavemax\.sid=/.test(c))).toBe(false);
  });
});

describe('4a JWT iss/aud rename (cosmetic)', () => {
  test('generateToken stamps the portal issuer and audience', () => {
    const token = authTokenService.generateToken({ id: 'x', role: 'affiliate' });
    const decoded = jwt.decode(token);
    expect(decoded.iss).toBe('crhs-portal-api');
    expect(decoded.aud).toBe('crhs-portal-client');
  });
});

describe('4a email From uses the migrated sender domain', () => {
  const saved = {};
  let sendMail;
  beforeEach(() => {
    saved.EMAIL_FROM = process.env.EMAIL_FROM;
    saved.EMAIL_PROVIDER = process.env.EMAIL_PROVIDER;
    sendMail = jest.fn().mockResolvedValue({ messageId: 'm1' });
    nodemailer.createTransport.mockReturnValue({ sendMail });
    process.env.EMAIL_PROVIDER = 'smtp';
    process.env.EMAIL_FROM = 'no-reply@crhsent.com';
  });
  afterEach(() => {
    if (saved.EMAIL_FROM === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = saved.EMAIL_FROM;
    if (saved.EMAIL_PROVIDER === undefined) delete process.env.EMAIL_PROVIDER;
    else process.env.EMAIL_PROVIDER = saved.EMAIL_PROVIDER;
  });

  test('renders From with brand.displayName and the crhsent no-reply address', async () => {
    await sendEmail('to@example.com', 'Subj', '<p>hi</p>');
    const from = sendMail.mock.calls[0][0].from;
    // brand.displayName defaults to "Laundromat" in test; the address is the
    // migrated EMAIL_FROM sender (off the retired promo host).
    expect(from).toBe(`"${brand.displayName}" <no-reply@crhsent.com>`);
    expect(from.endsWith('<no-reply@crhsent.com>')).toBe(true);
  });
});

describe('4a email templates render links from BASE_URL', () => {
  const savedBase = process.env.BASE_URL;
  afterEach(() => {
    if (savedBase === undefined) delete process.env.BASE_URL;
    else process.env.BASE_URL = savedBase;
  });

  test('a rendered template substitutes [BASE_URL] with the configured host', async () => {
    process.env.BASE_URL = 'https://portal.atxwashdryfold.com';
    const tpl = await templateManager.loadTemplate('base-template');
    const html = templateManager.fillTemplate(tpl, {});
    expect(html).toContain('https://portal.atxwashdryfold.com/assets/');
  });
});
