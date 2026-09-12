// Consumer proof for web-core §7.2.7 (B3a). The portal's CSRF audit trail is
// written by WEB-CORE's auditLogger — server/config/csrf-config.js delegates to
// wc.csrf.createCsrf({ tables }) (B4c; it was a 5-line re-export before that),
// and web-core's src/config/csrf-config.js requires its OWN auditLogger.
// Before the LOG_DIR fix every CSRF_VALIDATION_FAILED event landed in
// node_modules/@crhs/web-core/logs/audit.log, invisible in this app's logs/
// and deleted by the next npm install.
//
// LOG_DIR must be set BEFORE require('../../server') — the transports are built
// at require time.

const fs = require('fs');
const os = require('os');
const path = require('path');

const LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-audit-'));
const SAVED_LOG_DIR = process.env.LOG_DIR;
process.env.LOG_DIR = LOG_DIR;

const request = require('supertest');
const app = require('../../server');

const STRAY = path.join(__dirname, '..', '..', 'node_modules', '@crhs', 'web-core', 'logs', 'audit.log');
const sizeOf = (f) => (fs.existsSync(f) ? fs.statSync(f).size : 0);

const waitForNeedle = async (file, needle, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(needle)) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
};

describe('portal audit trail honours LOG_DIR', () => {
  afterAll(() => {
    if (SAVED_LOG_DIR === undefined) delete process.env.LOG_DIR;
    else process.env.LOG_DIR = SAVED_LOG_DIR;
  });

  it('a rejected CSRF mutation writes CSRF_VALIDATION_FAILED to $LOG_DIR/audit.log, not into node_modules', async () => {
    const strayBefore = sizeOf(STRAY);

    // Any POST that is not on the public/auth/registration allowlist is CSRF
    // enforced by default (shouldEnforceCsrf ends in `return true`), so this
    // probe does not depend on the route tables.
    const res = await request(app).post('/api/v1/__csrf-probe').send({ probe: true });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_VALIDATION_FAILED');

    await expect(waitForNeedle(path.join(LOG_DIR, 'audit.log'), 'CSRF_VALIDATION_FAILED'))
      .resolves.toBe(true);
    expect(sizeOf(STRAY)).toBe(strayBefore);
  });
});
