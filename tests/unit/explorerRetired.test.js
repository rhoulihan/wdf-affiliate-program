// The design explorer and its FAQ concierge are RETIRED — Plan 3 Task 17.
//
// Owner decision (R-14): the explorer's design reviews are shipped (the Austin
// Bold skin is live), its only remaining client was the concierge panel, and the
// concierge was the sole client of POST /api/concierge — the portal's last paid-LLM
// endpoint. ANTHROPIC_API_KEY had exactly one reader feeding that one route, so
// this deletion is what stops the Haiku billing.
//
// This file locks the retirement seven ways, because each has its own way of
// silently coming back:
//   1. the deleted paths stay deleted — including the top-level design-explorer/
//      generator, whose `npm run build:explorer` would otherwise re-create the
//      145-file render tree that is no longer gitignored and no longer guarded;
//   2. server.js re-acquires neither explorerGuard nor the concierge route;
//   3. conciergeLimiter is gone from the rate-limiting module;
//   4. POST /api/concierge answers 404 (and, because it drives the real app
//      through supertest, this is also this commit's boot proof);
//   5. the explorer URLs 404 with a ?k=<token> query as well as without — the
//      discriminating probe, since a bare path 404s both when the guard is
//      restored and when the feature is gone;
//   6. .env.example names neither credential NOR either subsystem — a comment
//      block that outlives the key it describes is the same rot as the key;
//   7. the config rows whose subject no longer exists are gone: the .gitignore
//      row for the render tree, the quarantine allowlist row, and build:explorer.
//
// It deliberately asserts NOTHING about CSRF_CONFIG.PUBLIC_ENDPOINTS: the
// /api/concierge exemption row is left standing here on purpose (csrfTables.test.js's
// PLAN 3 GUARD pins all five retired rows together), and Task 18 retires all five
// in one commit. A CSRF exemption on a path that 404s is inert for exactly one task.
//
// Task 18 update: that exemption is now gone, and its removal changed the status
// here. conditionalCsrf runs ahead of the 404 handler, so an untokened POST to a
// no-longer-exempt path is rejected at 403 before routing is consulted — the
// standing behaviour of every unlisted /api path. The boot proof this case carries
// is worth keeping, so it now sends a valid token: CSRF steps aside and the 404 is
// once again evidence about the ROUTE rather than about the exemption.
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../../server');
const { createAgent, getCsrfToken } = require('../helpers/csrfHelper');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Every path the explorer and the concierge occupied. `design-explorer` (the
// build source) is NOT in the plan's Files list; it is here because build.js
// writes straight into public/design-explorer/render/, so leaving the generator
// behind leaves a one-command path back to publishing 6.5 MB of unguarded
// marketing mock-ups from a public repo.
const DELETED_PATHS = [
  'public/design-explorer',
  'design-explorer',
  'server/middleware/explorerGuard.js',
  'server/controllers/conciergeController.js',
  'server/services/conciergeFaq.js',
  'tests/unit/design-explorer'
];

const EXPLORER_URLS = [
  '/design-explorer/index.html',
  '/design-explorer/render/austin-bold-heavy-about-en.html'
];

describe('the design explorer and the concierge are retired', () => {
  describe('(a) the deleted paths stay deleted', () => {
    for (const p of DELETED_PATHS) {
      it(`${p} does not exist`, () => {
        expect(fs.existsSync(path.join(ROOT, p))).toBe(false);
      });
    }
  });

  describe('(b) server.js has not re-acquired the guard or the route', () => {
    it('names explorerGuard nowhere — not the require, the app.use, or a comment', () => {
      expect(read('server.js')).not.toMatch(/explorerGuard/);
    });

    it('names the concierge nowhere — not the require, the app.post, the ' +
       'limiter, or the block comment that explained the mount order', () => {
      expect(read('server.js')).not.toMatch(/concierge/i);
    });
  });

  describe('(c) conciergeLimiter is gone from the rate-limiting module', () => {
    it('rateLimiting exports no conciergeLimiter', () => {
      // eslint-disable-next-line global-require
      expect(require('../../server/middleware/rateLimiting').conciergeLimiter).toBeUndefined();
    });
  });

  describe('(d) the endpoints answer 404 through the real app', () => {
    it('POST /api/concierge is 404', async () => {
      const agent = createAgent(app);
      const csrfToken = await getCsrfToken(app, agent);
      const res = await agent
        .post('/api/concierge')
        .set('X-Forwarded-Proto', 'https')
        .set('x-csrf-token', csrfToken)
        .send({ message: 'hello' });
      expect(res.status).toBe(404);
    });

    for (const url of EXPLORER_URLS) {
      it(`GET ${url} is 404`, async () => {
        const res = await request(app).get(url).set('X-Forwarded-Proto', 'https');
        expect(res.status).toBe(404);
      });

      // The discriminating probe: with a token query a *restored* guard would
      // serve 200, so this is what distinguishes "deleted" from "still gated".
      it(`GET ${url}?k=<token> is 404 too`, async () => {
        const res = await request(app)
          .get(`${url}?k=anything`)
          .set('X-Forwarded-Proto', 'https');
        expect(res.status).toBe(404);
      });
    }
  });

  describe('(e) .env.example names neither credential nor either subsystem', () => {
    const envExample = read('.env.example');

    it('has no EXPLORER_TOKEN', () => {
      expect(envExample).not.toMatch(/EXPLORER_TOKEN/);
    });

    it('has no ANTHROPIC_API_KEY', () => {
      expect(envExample).not.toMatch(/ANTHROPIC_API_KEY/);
    });

    it('has no orphan comment describing either subsystem', () => {
      expect(envExample).not.toMatch(/design.?explorer/i);
      expect(envExample).not.toMatch(/concierge/i);
    });

    it('still has EXPEDITER_TOKEN — a different, live feature', () => {
      expect(envExample).toMatch(/^EXPEDITER_TOKEN=/m);
    });
  });

  describe('(f) the config rows whose subject no longer exists are gone', () => {
    it('.gitignore does not ignore the render tree', () => {
      expect(read('.gitignore')).not.toMatch(/design-explorer/);
    });

    it('the quarantine allowlist has no design-explorer row', () => {
      expect(read('server/config/quarantineConfig.js')).not.toMatch(/design-explorer/);
    });

    it('package.json has no build:explorer script', () => {
      // eslint-disable-next-line global-require
      expect(require('../../package.json').scripts['build:explorer']).toBeUndefined();
    });
  });
});
