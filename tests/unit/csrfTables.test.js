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

  // PLAN 3 GUARD — do NOT prune these five rows here.
  // The routes are still mounted (server.js:680 /api/concierge, :736
  // partnerInquiryRoutes, :737 affiliateApplicationRoutes) and their public
  // pages POST with a plain fetch, no CSRF token. Dropping the exemption now
  // 403s two live marketing forms and reds tests/integration/partnerInquiry.js
  // and affiliateApplication.js. They are deleted in Plan 3, in the same PR
  // that deletes the routes.
  it('keeps the credential-free public intake routes exempt while they are mounted', () => {
    ['/api/concierge',
      '/api/v1/partner-inquiry',
      '/api/partner-inquiry',
      '/api/v1/affiliate-application',
      '/api/affiliate-application'].forEach((endpoint) => {
      expect(tables.PUBLIC_ENDPOINTS).toContain(endpoint);
      expect(csrf.shouldEnforceCsrf({ method: 'POST', path: endpoint })).toBe(false);
    });
  });
});
