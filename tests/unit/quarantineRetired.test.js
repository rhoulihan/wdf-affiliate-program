// The location quarantine is RETIRED — Plan 3 Task 36.
//
// `locationQuarantine` was the last code path in the portal that could
// `res.redirect(302, …)` a user onto the franchisor's site. QUARANTINE_NON_AUSTIN
// was `true` on BOTH boxes, so the middleware was ENABLED in production; it
// nonetheless fired on no host and no path, because isOwnPortalHost() exempted
// portal.atxwashdryfold.com / atxwashdryfold.com, and nginx routes the marketing
// hosts to the content app on :3001. So the deletion is cleanup, not an outage fix.
//
// What it removed was real, though: quarantineConfig.js hardcoded
// `process.env.CORPORATE_SITE_URL || 'https://www.wavemaxlaundry.com'`, i.e. one
// unset env var away from 302ing our own users onto the franchisor's domain
// during a live trademark/DMCA dispute. Deleting the middleware removes the
// default entirely, which beats editing it.
//
// This file locks the retirement five ways, because each has its own way of
// silently coming back:
//   1. the deleted files stay deleted;
//   2. nothing under server/ or server.js names the middleware, its config, or
//      its env var again — a re-added require is a re-added redirect;
//   3. requiring the config module throws MODULE_NOT_FOUND (the strong form of
//      (1): a stub that re-exports buildCorporateRedirect would pass (1) alone);
//   4. no tracked file under server/ or server.js contains `wavemaxlaundry.com`
//      AT ALL — not a redirect-only regex, because after this commit there is no
//      comment naming the franchisor either, and a comment is how the literal
//      creeps back in ahead of the code;
//   5. the behavioural assertion, and the only one that fails if the mount
//      survives the edit: with QUARANTINE_NON_AUSTIN=true explicitly set, a
//      marketing Host on a path nothing serves gets this app's own 404, not a
//      302 off-origin. Before the deletion this case returned
//      `302 https://www.wavemaxlaundry.com/some-marketing-page`.
//
// DEFERRED, deliberately: `.env.example` still carries QUARANTINE_NON_AUSTIN,
// CORPORATE_SITE_URL and their comment block. That file is HUMAN-CONFIRM in this
// repo and was out of scope for the commit that deleted the code, so asserting on
// it here would plant a permanently-red test. Both keys are unread as of this
// commit. When the owner clears the .env.example edit, add:
//   expect(envExample).not.toMatch(/QUARANTINE_NON_AUSTIN|CORPORATE_SITE_URL/);
//   expect(/quarantine/i.test(envExample)).toBe(false);
// (the second matters: a comment block that outlives its key is the same rot as
// the key). The box `.env` files keep both keys until Task 29 — unread is not
// harmful, and two inert values do not justify a production window.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const request = require('supertest');
const app = require('../../server');

const REPO = path.resolve(__dirname, '../..');
const SELF = 'tests/unit/quarantineRetired.test.js';

const DELETED_PATHS = [
  'server/middleware/locationQuarantine.js',
  'server/config/quarantineConfig.js',
  'tests/integration/locationQuarantine.test.js'
];

const gitGrepFiles = (pattern, pathspec) =>
  execSync(`git grep -lI -E "${pattern}" -- ${pathspec} || true`, { cwd: REPO, encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => f !== SELF);

describe('the location quarantine is retired', () => {
  describe('(a) the deleted files stay deleted', () => {
    for (const p of DELETED_PATHS) {
      it(`${p} does not exist`, () => {
        expect(fs.existsSync(path.join(REPO, p))).toBe(false);
      });
    }
  });

  describe('(b) nothing names the middleware, its config, or its env var', () => {
    it('server.js has not re-acquired the require, the mount, or the flag', () => {
      const serverJs = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
      expect(serverJs).not.toMatch(/locationQuarantine/);
      expect(serverJs).not.toMatch(/quarantineConfig/);
      expect(serverJs).not.toMatch(/QUARANTINE_NON_AUSTIN/);
    });

    it('no tracked file under server/ or server.js references either module', () => {
      expect(gitGrepFiles('locationQuarantine|quarantineConfig', 'server server.js')).toEqual([]);
    });

    it('no tracked test still requires the config module', () => {
      expect(gitGrepFiles('config/quarantineConfig', 'tests')).toEqual([]);
    });
  });

  describe('(c) the config module is gone, not stubbed', () => {
    it('requiring it throws MODULE_NOT_FOUND', () => {
      let err;
      try {
        require('../../server/config/quarantineConfig');
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.code).toBe('MODULE_NOT_FOUND');
    });
  });

  describe('(d) the franchisor literal is gone from the server', () => {
    it('no tracked file under server/ or server.js contains wavemaxlaundry.com', () => {
      expect(gitGrepFiles('wavemaxlaundry\\\\.com', 'server server.js')).toEqual([]);
    });
  });

  describe('(e) a marketing Host on a dead path gets our 404, never an off-origin 302', () => {
    let previous;

    beforeEach(() => {
      previous = process.env.QUARANTINE_NON_AUSTIN;
      // Explicitly ON: the flag the deleted middleware read is set to the value
      // that made it fire, so this case cannot pass merely because the flag is off.
      process.env.QUARANTINE_NON_AUSTIN = 'true';
    });

    afterEach(() => {
      if (previous === undefined) delete process.env.QUARANTINE_NON_AUSTIN;
      else process.env.QUARANTINE_NON_AUSTIN = previous;
    });

    it('GET /some-marketing-page → 404', async () => {
      const res = await request(app)
        .get('/some-marketing-page')
        .set('Host', 'rundberglaundry.com')
        .redirects(0);
      expect(res.headers.location || '').not.toMatch(/wavemaxlaundry\.com/);
      expect(res.status).toBe(404);
    });

    it('GET /wp-login.php (a suspicious path) → not a redirect to the franchisor', async () => {
      const res = await request(app)
        .get('/wp-login.php')
        .set('Host', 'rundberglaundry.com')
        .redirects(0);
      expect(res.headers.location || '').not.toMatch(/wavemaxlaundry\.com/);
      expect(res.status).not.toBe(302);
    });

    it('POST /some-marketing-page → not a redirect to the franchisor', async () => {
      const res = await request(app)
        .post('/some-marketing-page')
        .set('Host', 'rundberglaundry.com')
        .redirects(0);
      expect(res.headers.location || '').not.toMatch(/wavemaxlaundry\.com/);
      expect(res.status).not.toBe(302);
    });
  });
});
