// The portal's two public intake forms are RETIRED — Plan 3 Task 18.
//
// The partner-program inquiry and the UT affiliate application were the last two
// endpoints in this app that existed to serve a marketing page. Task 16 deleted
// those pages; crhs-corporate now answers /api/partner-inquiry and
// /api/affiliate-application (plus the /v1 aliases) on every marketing host, proven
// by the "code":"partner.form.*" keys only its validator emits. Nothing in this app
// reaches these paths any more, so route, controller, service and CSRF exemption go
// together — pruning the exemption alone would have 403'd a live form, and deleting
// the routes alone would have left dead policy behind.
//
// This is the wire half of the guard. The table half is in
// tests/unit/csrfTables.test.js, which asserts all five retired rows are absent and
// that PUBLIC_ENDPOINTS is back to nine. /api/concierge (the fifth row) gets its own
// 404 proof in tests/unit/explorerRetired.test.js, from Task 17.
//
// It lives in tests/integration/ rather than beside the table assertions because it
// boots the real app through supertest: the plan's snippet put a request(app) call
// inside csrfTables.test.js, which imports neither supertest nor the app and so would
// not have compiled.
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../../server');
const { createAgent, getCsrfToken } = require('../helpers/csrfHelper');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Route, controller and service for each form. All six go in one commit; leaving any
// one behind leaves a one-line path back to a mounted route.
const DELETED_PATHS = [
  'server/routes/partnerInquiryRoutes.js',
  'server/routes/affiliateApplicationRoutes.js',
  'server/controllers/partnerInquiryController.js',
  'server/controllers/affiliateApplicationController.js',
  'server/services/partnerInquiryService.js',
  'server/services/affiliateApplicationService.js'
];

// Both the canonical path and the /api/v1 alias, since apiV1Router mounted the same
// router at '/' — a partial deletion would leave one of each pair alive.
const RETIRED_ENDPOINTS = [
  '/api/partner-inquiry',
  '/api/v1/partner-inquiry',
  '/api/affiliate-application',
  '/api/v1/affiliate-application'
];

describe('the portal intake routes are retired', () => {
  describe('(a) the deleted files stay deleted', () => {
    for (const p of DELETED_PATHS) {
      it(`${p} does not exist`, () => {
        expect(fs.existsSync(path.join(ROOT, p))).toBe(false);
      });
    }
  });

  describe('(b) server.js has not re-acquired either mount', () => {
    const serverJs = read('server.js');

    it('names partnerInquiryRoutes nowhere — require, mount, or comment', () => {
      expect(serverJs).not.toMatch(/partnerInquiryRoutes/);
    });

    it('names affiliateApplicationRoutes nowhere', () => {
      expect(serverJs).not.toMatch(/affiliateApplicationRoutes/);
    });
  });

  // Two probes per path, because the two halves of this commit fail differently and
  // one status cannot distinguish them.
  //
  // [MEASURED] The plan expected a bare POST to 404. It does not: it 403s. Pruning
  // the PUBLIC_ENDPOINTS row is what makes conditionalCsrf enforce on these paths,
  // and that middleware runs ahead of the 404 handler — so an untokened POST is
  // rejected before routing is ever consulted. That is the standing behaviour of
  // EVERY unlisted /api path in this app (shouldEnforceCsrf defaults to true, so
  // POST /api/v1/definitely-not-a-route 403s too), which is precisely the point:
  // these five paths are no longer special-cased, they are just gone.
  //
  // So: with a valid token, CSRF steps aside and the 404 proves the ROUTE is gone;
  // without one, the 403 proves the EXEMPTION is gone. Together they pin both halves,
  // where the plan's single assertion would have pinned neither — a bare 404 is also
  // what you would get if the row were still standing and only the route deleted.
  describe('(c) every retired path is unrouted and unexempt through the real app', () => {
    for (const endpoint of RETIRED_ENDPOINTS) {
      it(`POST ${endpoint} with a valid CSRF token is 404 — the route is gone`, async () => {
        const agent = createAgent(app);
        const csrfToken = await getCsrfToken(app, agent);
        const res = await agent
          .post(endpoint)
          .set('X-Forwarded-Proto', 'https')
          .set('Accept', 'application/json')
          .set('x-csrf-token', csrfToken)
          .send({ firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '5125551212' });
        expect(res.status).toBe(404);
      });

      it(`POST ${endpoint} without a token is 403 — the CSRF exemption is gone`, async () => {
        const res = await request(app)
          .post(endpoint)
          .set('X-Forwarded-Proto', 'https')
          .set('Accept', 'application/json')
          .send({ firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '5125551212' });
        // Never 200/400: those are the deleted handler answering, which is the
        // regression this file exists to catch.
        expect(res.status).toBe(403);
      });
    }
  });
});
