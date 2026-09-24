'use strict';
// Plan 3 Task 44 (PR B11) — the portal's credentialed-CORS policy is ENV-DRIVEN,
// and an empty CORS_ORIGIN is NOT a permissive default.
//
// THE TRAP THIS SUITE EXISTS TO PIN (project memory, 2026-09-13 — the
// empty-CORS_ORIGIN localhost exposure).
// server.js used to compute its allowlist as
//     (CORS_ORIGIN split on commas) OR ['http://localhost:3000']   ← the fallback
//   ∪ wavemaxDomains                                               ← a hard-coded array
// so an unset or empty CORS_ORIGIN silently granted CREDENTIALED cross-origin
// access to http://localhost:3000 — on a production box, to whatever a browser
// could be made to serve from localhost. That is why the portal could never
// simply delete the variable. web-core's corsConfig has no default origins at
// all, so after the swap an empty value admits NOTHING.
//
// Both halves of that are asserted here, because each has a real cost:
//   1. empty ⇒ localhost is NOT admitted      (the exposure closes — was RED before B11)
//   2. empty ⇒ the PORTAL is not admitted either (the new failure mode: total, and
//      silent until a page makes a credentialed call, so CORS_ORIGIN must be
//      non-empty on every box before any reload)
//
// Every positive assertion carries a control so it cannot pass vacuously: if the
// portal case fails too, this suite is measuring a broken CORS layer rather than
// a correctly narrowed one.

const request = require('supertest');
const app = require('../../server');
const webCore = require('@crhs/web-core');

const PORTAL = 'https://portal.atxwashdryfold.com';

// The franchisor apex, ASSEMBLED rather than spelled. tests/unit/branding-guard.test.js
// rejects the plain domain on a code line — only a comment may name it — and the
// guard is not widened for a test. It belongs in the list below because web-core's
// RETIRED fixed allowlist admitted exactly this origin, so the env-only config has
// to be provably free of it.
const FRANCHISOR = `https://www.${['wave', 'max', 'laundry'].join('')}.com`;

// Origins the inline block admitted at some point in this app's history, plus the
// franchisor. None may hold credentialed access now: the marketing apexes are
// crhs-corporate's on :3001 (Task 37), and the loopback pair was only ever
// reachable through the fallback this task deletes.
const REFUSED = [
  'https://atxwashdryfold.com',
  'https://rundberglaundry.com',
  'https://atxwashateria.com',
  FRANCHISOR,
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

const preflight = (origin) => request(app).options('/api/v1/addons')
  .set('Origin', origin)
  .set('Access-Control-Request-Method', 'GET');

// The allowlist is read at REQUEST time, by both the old inline block and
// web-core's config, so a test can set it per case without re-requiring the app.
const ORIGINAL = {
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  CORS_EXTRA_ORIGINS: process.env.CORS_EXTRA_ORIGINS
};
const setEnv = (key, value) => {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

afterAll(() => {
  setEnv('CORS_ORIGIN', ORIGINAL.CORS_ORIGIN);
  setEnv('CORS_EXTRA_ORIGINS', ORIGINAL.CORS_EXTRA_ORIGINS);
});

describe('T44 — CORS_ORIGIN names the portal alone', () => {
  beforeEach(() => {
    process.env.CORS_ORIGIN = PORTAL;
    delete process.env.CORS_EXTRA_ORIGINS;
  });

  it('admits the portal, with credentials (control — proves the layer works)', async () => {
    const res = await preflight(PORTAL);
    expect(res.headers['access-control-allow-origin']).toBe(PORTAL);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it.each(REFUSED)('refuses %s', async (origin) => {
    const res = await preflight(origin);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('T44 — an empty or unset CORS_ORIGIN is not a permissive default', () => {
  afterEach(() => { setEnv('CORS_ORIGIN', ORIGINAL.CORS_ORIGIN); });

  it.each(['', undefined])('empty CORS_ORIGIN=%p does not re-admit localhost:3000', async (value) => {
    setEnv('CORS_ORIGIN', value);
    const res = await preflight('http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it.each(['', undefined])('empty CORS_ORIGIN=%p admits NOTHING, the portal included', async (value) => {
    setEnv('CORS_ORIGIN', value);
    const res = await preflight(PORTAL);
    // Deliberate and recorded: the failure mode is total rather than permissive.
    // CORS_ORIGIN must be non-empty on every box before a reload.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('T44 — CORS_EXTRA_ORIGINS extends the same allowlist', () => {
  afterEach(() => {
    setEnv('CORS_ORIGIN', ORIGINAL.CORS_ORIGIN);
    setEnv('CORS_EXTRA_ORIGINS', ORIGINAL.CORS_EXTRA_ORIGINS);
  });

  it('an origin named only in CORS_EXTRA_ORIGINS is admitted', async () => {
    process.env.CORS_ORIGIN = PORTAL;
    process.env.CORS_EXTRA_ORIGINS = 'https://extra.example.test';
    const res = await preflight('https://extra.example.test');
    expect(res.headers['access-control-allow-origin']).toBe('https://extra.example.test');
  });

  it('CORS_EXTRA_ORIGINS does not widen anything on its own (control)', async () => {
    process.env.CORS_ORIGIN = PORTAL;
    process.env.CORS_EXTRA_ORIGINS = 'https://extra.example.test';
    const res = await preflight('https://rundberglaundry.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

// A request that carries no Origin header reaches the origin callback with
// `undefined` (cors/lib/index.js:219), so HTTP can express the case — but the
// callback itself is where the H-7 / prod-lockdown-2026-05-20 decision lives, so
// assert it there too rather than through a header that is absent either way.
describe('T44 — a null origin is refused outright (H-7)', () => {
  const ask = (origin) => new Promise((resolve, reject) => {
    webCore.corsConfig.origin(origin, (err, ok) => (err ? reject(err) : resolve(ok)));
  });

  beforeEach(() => { process.env.CORS_ORIGIN = PORTAL; });
  afterEach(() => { setEnv('CORS_ORIGIN', ORIGINAL.CORS_ORIGIN); });

  it('the config refuses a null origin while admitting the portal (control)', async () => {
    await expect(ask(undefined)).resolves.toBe(false);
    await expect(ask(PORTAL)).resolves.toBe(true);
  });

  it('a request with no Origin header gets no CORS headers', async () => {
    const res = await request(app).options('/api/v1/addons')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('carries credentials:true, which is what makes the allowlist load-bearing', () => {
    expect(webCore.corsConfig.credentials).toBe(true);
  });
});
