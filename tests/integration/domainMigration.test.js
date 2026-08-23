'use strict';
const request = require('supertest');
const app = require('../../server');
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
});
