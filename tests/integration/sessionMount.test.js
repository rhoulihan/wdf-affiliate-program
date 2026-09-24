'use strict';
// B9 regression net for the session mount.
//
// Three production incidents converge on this file, and each has a case here:
//
//  1. 2026-05-25 — session-store bloat. `saveUninitialized: true` mints a session
//     on every request that reaches the session middleware, and the Cloudflare LB
//     monitor hits /health ~11/sec (~99% of origin traffic). With /health mounted
//     AFTER session, sessions piled to ~2M on an Oracle ADB that runs no TTL sweep.
//     /health and /health/origin must therefore stay registered BEFORE the mount.
//     Asserted behaviourally (no Set-Cookie) with /api/csrf-token as the control,
//     because "no cookie anywhere" would satisfy the first assertion vacuously.
//
//  2. 2026-09-11 — the maxAge repair path. A plain-object spread replaced the
//     express-session Cookie, whose `data` getter lives on the PROTOTYPE, so the
//     emitted Set-Cookie lost Path/HttpOnly/Secure/SameSite/Expires. Under the
//     production `__Host-` prefix (which requires Secure and Path=/) the browser
//     rejected the cookie outright and every session silently dropped. Pinned
//     behaviourally below, with the plain-object shape as a negative control so the
//     assertion provably has teeth. (This replaces the source-level guard in the
//     now-deleted tests/unit/sessionCookiePrototype.test.js, which pinned an inline
//     fixer that B9 removed.)
//
//  3. B9 itself — the cookie NAME. web-core's DEFAULT_COOKIE_BASE is 'app.sid', and
//     a default-shaped buildSessionMiddleware() call would rename the live cookie
//     from __Host-portal.sid to __Host-app.sid, signing out every logged-in
//     affiliate, customer, administrator and operator on the next reload. The mount
//     pins `cookieName: 'portal.sid'` explicitly; the cases below fail on a rename
//     in EITHER direction, in both NODE_ENV branches, and prove the explicit pin
//     outranks a SESSION_COOKIE_NAME env value.
//
// ⚠️ Never call buildSessionMiddleware() with NODE_ENV=production from a test: that
// branch builds a connect-mongo store against MONGODB_URI — the production database.
// The production cookie name is asserted through the PURE resolver instead (and a
// __Host- cookie cannot be set over the test server's plain HTTP anyway).
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const cookieSignature = require('cookie-signature');
const app = require('../../server');
const { buildSessionMiddleware } = require('@crhs/web-core');
const { resolveSessionCookieName, _maxAgeFixer, DEFAULT_TTL_SECONDS } =
  require('@crhs/web-core/src/config/sessionStore');

const SERVER_SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
const PINNED_BASE = 'portal.sid';
const PROD_NAME = `__Host-${PINNED_BASE}`;
const TTL_MS = 600000;

const setCookies = (res) => res.headers['set-cookie'] || [];

describe('B9 session mount — /health never mints a session (2026-05-25)', () => {
  it('GET /health emits no Set-Cookie', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(setCookies(res)).toEqual([]);
  });

  it('GET /health/origin emits no Set-Cookie', async () => {
    const res = await request(app).get('/health/origin');
    // 200 when the content app answers on :3001, 503 when it does not — either way
    // the probe must not mint a session.
    expect([200, 503]).toContain(res.status);
    expect(setCookies(res)).toEqual([]);
  });

  it('control: a real request DOES mint one, so the guard above is not vacuous', async () => {
    const res = await request(app).get('/api/csrf-token');
    expect(setCookies(res).length).toBeGreaterThan(0);
  });

  it('the health routes are still registered before the session mount', () => {
    const lineOf = (needle) => SERVER_SRC.split('\n').findIndex((l) => l.includes(needle)) + 1;
    const health = lineOf('app.get(\'/health\'');
    const healthOrigin = lineOf('app.get(\'/health/origin\'');
    const mount = lineOf('app.use(sessionMiddleware)');
    expect(health).toBeGreaterThan(0);
    expect(healthOrigin).toBeGreaterThan(0);
    expect(mount).toBeGreaterThan(0);
    expect(health).toBeLessThan(mount);
    expect(healthOrigin).toBeLessThan(mount);
  });
});

describe('B9 session cookie name is pinned in BOTH NODE_ENV branches', () => {
  it('the mount passes the base name explicitly, never web-core\'s default', () => {
    expect(SERVER_SRC).toMatch(/cookieName:\s*'portal\.sid'/);
  });

  it('serves exactly portal.sid under NODE_ENV=test', async () => {
    const res = await request(app).get('/api/csrf-token');
    const cookies = setCookies(res);
    expect(cookies.some((c) => c.startsWith(`${PINNED_BASE}=`))).toBe(true);
    // No drift in either direction: not web-core's default base, not the prod
    // prefix over plain HTTP, not the retired name.
    expect(cookies.some((c) => c.startsWith('app.sid='))).toBe(false);
    expect(cookies.some((c) => c.startsWith('__Host-'))).toBe(false);
    // The retired name is spelled in the PLAIN form the branding guard allowlists
    // (INFRA_ALLOW covers the plain wavemax.sid spelling): the regex-escaped form is
    // a bare mark to the guard and reds it, as it did from Task 42 until this rewrite.
    expect(cookies.some((c) => c.startsWith('wavemax.sid=') || c.startsWith('__Host-wavemax.sid='))).toBe(false);
  });

  it('resolves to __Host-portal.sid in production and portal.sid otherwise', () => {
    const saved = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(resolveSessionCookieName({ cookieName: PINNED_BASE })).toBe(PROD_NAME);
      process.env.NODE_ENV = 'test';
      expect(resolveSessionCookieName({ cookieName: PINNED_BASE })).toBe(PINNED_BASE);
      process.env.NODE_ENV = 'development';
      expect(resolveSessionCookieName({ cookieName: PINNED_BASE })).toBe(PINNED_BASE);
    } finally {
      process.env.NODE_ENV = saved;
    }
  });

  it('the explicit pin outranks a SESSION_COOKIE_NAME env value', () => {
    const savedEnv = process.env.NODE_ENV;
    const savedName = process.env.SESSION_COOKIE_NAME;
    try {
      process.env.SESSION_COOKIE_NAME = 'someone-elses.sid';
      process.env.NODE_ENV = 'production';
      expect(resolveSessionCookieName({ cookieName: PINNED_BASE })).toBe(PROD_NAME);
      process.env.NODE_ENV = 'test';
      expect(resolveSessionCookieName({ cookieName: PINNED_BASE })).toBe(PINNED_BASE);
    } finally {
      process.env.NODE_ENV = savedEnv;
      if (savedName === undefined) delete process.env.SESSION_COOKIE_NAME;
      else process.env.SESSION_COOKIE_NAME = savedName;
    }
  });

  it('web-core\'s own default would have renamed the cookie — the reason it is pinned', () => {
    // Documents the severity-1 trap: a default-shaped call signs everyone out.
    // If web-core ever adopts 'portal.sid' as its default this case is the one to
    // retire; the pin above stays regardless.
    const saved = process.env.NODE_ENV;
    const savedName = process.env.SESSION_COOKIE_NAME;
    try {
      delete process.env.SESSION_COOKIE_NAME;
      process.env.NODE_ENV = 'production';
      expect(resolveSessionCookieName()).not.toBe(PROD_NAME);
    } finally {
      process.env.NODE_ENV = saved;
      if (savedName !== undefined) process.env.SESSION_COOKIE_NAME = savedName;
    }
  });
});

describe('B9 session TTL and cookie flags are unchanged', () => {
  it('web-core\'s TTL default is the app\'s 10-minute inactivity window', () => {
    expect(DEFAULT_TTL_SECONDS * 1000).toBe(TTL_MS);
  });

  it('the built middleware reports the pinned name and the 10-minute maxAge', () => {
    const built = buildSessionMiddleware({ cookieName: PINNED_BASE, ttlSeconds: DEFAULT_TTL_SECONDS });
    expect(built.cookieName).toBe(PINNED_BASE); // NODE_ENV=test here
    expect(built.sessionMaxAge).toBe(TTL_MS);
    expect(built.store).toBeUndefined(); // MemoryStore under test, never connect-mongo
  });

  it('the issued cookie carries originalMaxAge=600000 (observable as a ~10min Expires) plus Path/HttpOnly/SameSite and no Secure in test', async () => {
    const res = await request(app).get('/api/csrf-token');
    const sid = setCookies(res).find((c) => c.startsWith(`${PINNED_BASE}=`));
    expect(sid).toBeDefined();
    expect(sid).toMatch(/Path=\//);
    expect(sid).toMatch(/HttpOnly/);
    expect(sid).toMatch(/SameSite=Lax/i);
    expect(sid).not.toMatch(/Secure/);
    const expires = new Date(/Expires=([^;]+)/.exec(sid)[1]).getTime();
    const delta = expires - Date.now();
    expect(delta).toBeGreaterThan(TTL_MS - 60000);
    expect(delta).toBeLessThanOrEqual(TTL_MS + 5000);
  });

  it('signs the session id with the SESSION_SECRET chain, unchanged', async () => {
    // The only observable proof that the secret handling did not move: the served
    // cookie's HMAC must verify under SESSION_SECRET (chain: SESSION_SECRET →
    // JWT_SECRET → dev default). A different secret would invalidate every cookie
    // already in a browser just as surely as a rename would.
    const res = await request(app).get('/api/csrf-token');
    const sid = setCookies(res).find((c) => c.startsWith(`${PINNED_BASE}=`));
    const raw = decodeURIComponent(sid.slice(`${PINNED_BASE}=`.length).split(';')[0]);
    expect(raw.startsWith('s:')).toBe(true);
    expect(cookieSignature.unsign(raw.slice(2), process.env.SESSION_SECRET)).toBeTruthy();
    expect(cookieSignature.unsign(raw.slice(2), 'not-the-session-secret')).toBe(false);
  });
});

describe('B9 the maxAge repair path keeps the express-session Cookie prototype (2026-09-11)', () => {
  // Corrupt the cookie AFTER the mount's own fixer has run, then run the fixer
  // again — the shape the 2026-09-11 outage produced, end to end through
  // express-session's Set-Cookie serialization.
  const appWith = (corrupt) => {
    const probe = express();
    const { middleware } = buildSessionMiddleware({ cookieName: PINNED_BASE, ttlSeconds: DEFAULT_TTL_SECONDS });
    probe.use(middleware);
    probe.use((req, res, next) => { corrupt(req); next(); });
    probe.use(_maxAgeFixer(TTL_MS));
    probe.get('/probe', (req, res) => {
      req.session.touched = true;
      res.json({ ok: true, originalMaxAge: req.session.cookie.originalMaxAge, maxAge: req.session.cookie.maxAge });
    });
    return probe;
  };

  it('issues a cookie whose originalMaxAge is the 10-minute window', async () => {
    const res = await request(appWith(() => {})).get('/probe');
    expect(res.body.originalMaxAge).toBe(TTL_MS);
  });

  it('restores originalMaxAge and maxAge after the NaN corruption', async () => {
    const res = await request(appWith((req) => { req.session.cookie.maxAge = NaN; })).get('/probe');
    expect(res.body.maxAge).toBe(TTL_MS);
    expect(res.body.originalMaxAge).toBe(TTL_MS);
  });

  it('repairs a NaN maxAge and still emits Path=/ and HttpOnly', async () => {
    const res = await request(appWith((req) => { req.session.cookie.maxAge = NaN; })).get('/probe');
    const sid = setCookies(res).find((c) => c.startsWith(`${PINNED_BASE}=`));
    expect(sid).toBeDefined();
    expect(sid).toMatch(/Path=\//);
    expect(sid).toMatch(/HttpOnly/);
    expect(sid).toMatch(/Expires=/);
    expect(sid).toMatch(/SameSite=Lax/i);
  });

  it('negative control: replacing the cookie with a plain object DOES lose them', async () => {
    const res = await request(appWith((req) => {
      req.session.cookie = { ...req.session.cookie, maxAge: TTL_MS };
    })).get('/probe');
    const sid = setCookies(res).find((c) => c.startsWith(`${PINNED_BASE}=`));
    expect(sid).toBeDefined();
    expect(sid).not.toMatch(/Path=\//);
    expect(sid).not.toMatch(/HttpOnly/);
  });

  it('server.js holds no second copy of the fixer and never replaces the cookie object', () => {
    expect(SERVER_SRC).not.toMatch(/req\.session\.cookie\s*=\s*\{/);
    expect(SERVER_SRC).not.toMatch(/app\.use\(session\(/);
    expect(SERVER_SRC).toMatch(/buildSessionMiddleware/);
    // connect-mongo's own MongoClient must stay reachable for the Oracle
    // cursor-error diagnostics attach (server.js:~128).
    expect(SERVER_SRC).toMatch(/sessionStore\.clientP/);
  });
});
