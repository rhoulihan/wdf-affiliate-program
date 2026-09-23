// B4c (spec §7.2.8 / D20): the CSRF route policy is this app's, not web-core's.
// server/config/csrfTables.js owns the six tables; server/config/csrf-config.js
// is a thin call to wc.csrf.createCsrf({ tables }) and must keep exporting the
// exact names server.js:20 destructures and mounts at :665 / :668.
const tables = require('../../server/config/csrfTables');
const csrf = require('../../server/config/csrf-config');
const webCore = require('@crhs/web-core');

const CATEGORIES = [
  'PUBLIC_ENDPOINTS',
  'AUTH_ENDPOINTS',
  'REGISTRATION_ENDPOINTS',
  'CRITICAL_ENDPOINTS',
  'HIGH_PRIORITY_ENDPOINTS',
  'READ_ONLY_ENDPOINTS'
];

describe('server/config/csrfTables', () => {
  it('exports all six categories as non-empty arrays of /api paths', () => {
    CATEGORIES.forEach((key) => {
      expect(Array.isArray(tables[key])).toBe(true);
      expect(tables[key].length).toBeGreaterThan(0);
      tables[key].forEach((endpoint) => expect(endpoint).toMatch(/^\/api/));
    });
  });

  it('has no duplicate endpoint across categories', () => {
    const all = CATEGORIES.flatMap((key) => tables[key]);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('server/config/csrf-config wiring', () => {
  it('is built from csrfTables, not from a web-core table', () => {
    expect(csrf.CSRF_CONFIG).toEqual(tables);
  });

  it('still exports the names server.js:20 destructures', () => {
    expect(typeof csrf.conditionalCsrf).toBe('function');
    expect(typeof csrf.csrfTokenEndpoint).toBe('function');
    expect(typeof csrf.shouldEnforceCsrf).toBe('function');
    expect(typeof csrf.csrfProtection).toBe('function');
  });

  it('web-core exposes only the primitive — the policy has left the library', () => {
    expect(typeof webCore.csrf.createCsrf).toBe('function');
    expect(webCore.csrf.CSRF_CONFIG).toBeUndefined();
  });

  it('enforces and exempts exactly as before the move', () => {
    expect(csrf.shouldEnforceCsrf({ method: 'POST', path: '/api/v1/orders/ORD-1/cancel' })).toBe(true);
    expect(csrf.shouldEnforceCsrf({ method: 'GET', path: '/api/v1/orders' })).toBe(false);
    expect(csrf.shouldEnforceCsrf({ method: 'POST', path: '/api/v1/auth/affiliate/login' })).toBe(false);
  });

  // PLAN 3 (Task 18) — CLOSED. The intake routes moved to crhs-corporate with the
  // marketing pages, and the concierge was retired with the design explorer, so all
  // five rows are gone. They were exempt only because credential-free public pages
  // POSTed with a plain fetch; there is no such page in this app any more.
  //
  // This file stays a UNIT test: it asserts the TABLE, not the wire. The plan's
  // snippet called request(app) here, but this file imports neither supertest nor
  // the app, so it would not have compiled. The 404-on-the-wire half lives where it
  // belongs — tests/integration/intakeRetired.test.js for the four intake paths, and
  // tests/unit/explorerRetired.test.js (Task 17) for /api/concierge.
  const RETIRED = ['/api/concierge',
    '/api/v1/partner-inquiry', '/api/partner-inquiry',
    '/api/v1/affiliate-application', '/api/affiliate-application'];

  it('all five retired rows are gone from the table', () => {
    for (const p of RETIRED) {
      expect(tables.PUBLIC_ENDPOINTS).not.toContain(p);
    }
  });

  it('PUBLIC_ENDPOINTS shrank by exactly the five retired rows', () => {
    expect(tables.PUBLIC_ENDPOINTS).toHaveLength(9);
  });

  // A fence, not a red-green: it passes before and after. It is the assertion that a
  // clumsy edit has not taken a surviving row with it.
  it('the surviving exemptions are untouched (regression fence)', () => {
    for (const p of ['/api/health', '/api/v1/health', '/api/v1/scan/session',
      '/api/v1/scan/resolve', '/api/v1/scan/apply', '/api/v1/scan/undo',
      '/api/v1/customers/me', '/api/v1/affiliates/:affiliateId/public',
      '/api/affiliates/:affiliateId/public']) {
      expect(tables.PUBLIC_ENDPOINTS).toContain(p);
      expect(csrf.shouldEnforceCsrf({ method: 'POST', path: p })).toBe(false);
    }
  });
});
