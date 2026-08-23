'use strict';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const authTokenService = require('../../server/services/authTokenService');
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
