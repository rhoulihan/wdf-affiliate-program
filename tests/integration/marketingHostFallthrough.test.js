// Marketing-host fall-through — the store must never see the API catch-all.
//
// partnerLanding answers every non-exempt GET on the four Austin per-location
// host families, so for the public nothing downstream is ever reached. The store
// IP is the one client that bypasses it (partnerLanding.js:119, "the store sees
// the real app on every route") — and until the fall-through handler below the
// bypass landed nowhere, dropping ~600 lines through to the app.use('*') API
// catch-all. Live symptom from the store network on 2026-08-24:
//   GET rundberglaundry.com/ -> 404 {"message":"API endpoint not found"}
// while every other client got the correct page.
//
// The nginx vhosts for these hosts may rewrite `location = /` to another path
// (portal's rewrite goes to /embed-app-v2.html; these likely still point at the
// /austin-tx/ tree deleted in Phase 4b), so the handler must be path-agnostic —
// hence the non-root case below.

// storeIPs reads STORE_IP_ADDRESS at module load, so this must precede the
// server require. setupFilesAfterEnv has already run by this point.
process.env.STORE_IP_ADDRESS = '72.190.1.227';

const request = require('supertest');
const app = require('../../server');

const STORE_IP = '72.190.1.227';
const PUBLIC_IP = '8.8.8.8';
const HOST = 'rundberglaundry.com';

// cf-connecting-ip is the canonical client IP header behind Cloudflare, and is
// what the middleware's clientIp() resolves.
const asClient = (path, ip) => request(app).get(path).set('Host', HOST).set('cf-connecting-ip', ip);

describe('marketing hosts — store-IP fall-through', () => {
  it('redirects the store to the app shell at the root instead of the API 404', async () => {
    const res = await asClient('/', STORE_IP);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/embed-app-v2.html');
  });

  it('does the same for a non-root path, since nginx may rewrite the root', async () => {
    const res = await asClient('/austin-tx/', STORE_IP);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/embed-app-v2.html');
  });

  it('leaves genuine API 404s as JSON', async () => {
    const res = await asClient('/api/definitely-not-a-route', STORE_IP);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('API endpoint not found');
  });

  it('does not change what the public sees — still the Coming-soon hold', async () => {
    const res = await asClient('/', PUBLIC_IP);
    expect(res.status).toBe(200);
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(res.text).toMatch(/coming soon/i);
  });
});
