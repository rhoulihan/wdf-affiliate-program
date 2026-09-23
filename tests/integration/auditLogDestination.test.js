// PR B6 acceptance (spec §7.5). The portal's audit trail is security evidence in an
// active dispute, so WHERE it lands is pinned in BOTH directions, by writing a real
// event and finding it — never by reading the code:
//
//   1. LOG_DIR set   -> the event lands in $LOG_DIR and nowhere else. This is the half
//      the local implementation FAILED: server/utils/auditLogger.js hardcoded
//      path.join(__dirname, '../../logs') and ignored LOG_DIR outright, so the app's
//      own audit events and web-core's (the CSRF ones, written through
//      wc.csrf.createCsrf) could split across two directories the moment a box set
//      LOG_DIR anywhere but <repo>/logs.
//   2. LOG_DIR unset -> the event still lands in <repo>/logs, and NOT under
//      node_modules/@crhs/web-core/logs/. web-core resolves its own fallback from
//      __dirname, and installed as a `file:` dependency that __dirname is INSIDE
//      node_modules — a directory `npm install` wipes and the documented boot-breaker
//      remedy (`rm -rf node_modules/@crhs/web-core`) deletes outright. MEASURED: that
//      directory held combined.log and error.log before web-core 0.3.2 moved the
//      fallback out of the package tree, and the next npm install destroyed them.
//
// Two traps this suite is written around, both of which silently defeated the first
// draft of it:
//   * AuditEvents has no CSRF_VALIDATION_FAILED — the real key is INVALID_CSRF_TOKEN.
//     An undefined event type still writes a line, so the event name is asserted.
//   * logAuditEvent records req.path, never req.originalUrl, and audit.log ROTATES at
//     10 MB (audit.log -> audit1.log -> ...). A marker passed as originalUrl is never
//     written, and a fixed `audit.log` filename is the wrong file on a rotated repo.
//     So the marker travels in `details` and the search covers audit*.log.

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.join(__dirname, '..', '..');
const REPO_LOGS = path.join(REPO, 'logs');
const STRAY_DIR = path.join(REPO, 'node_modules', '@crhs', 'web-core', 'logs');
const AUDIT = /^audit\d*\.log$/;

const snapshot = (dir) => (fs.existsSync(dir)
  ? fs.readdirSync(dir).sort().map((f) => `${f}:${fs.statSync(path.join(dir, f)).size}`).join(',')
  : '<absent>');

const findMarker = (dir, marker, match = AUDIT) => {
  if (!fs.existsSync(dir)) return null;
  for (const f of fs.readdirSync(dir).filter((n) => match.test(n))) {
    if (fs.readFileSync(path.join(dir, f), 'utf8').includes(marker)) return f;
  }
  return null;
};

const waitForMarker = async (dir, marker, match = AUDIT, timeoutMs = 8000) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = findMarker(dir, marker, match);
    if (hit || Date.now() > deadline) return hit;
    await new Promise((r) => setTimeout(r, 25));
  }
};

// The File transports are built at require time from LOG_DIR, so each case needs a
// fresh module registry — and it must go through server/utils/auditLogger, the path
// the 18 mock / requireActual sites reach.
const emit = (logDir, marker) => {
  const saved = process.env.LOG_DIR;
  if (logDir === null) delete process.env.LOG_DIR;
  else process.env.LOG_DIR = logDir;
  try {
    let mod;
    jest.isolateModules(() => { mod = require('../../server/utils/auditLogger'); });
    // INVALID_CSRF_TOKEN is in the critical set, so it is logged at error level and
    // must reach security-critical.log as well as audit.log.
    expect(typeof mod.AuditEvents.INVALID_CSRF_TOKEN).toBe('string');
    mod.logAuditEvent(mod.AuditEvents.INVALID_CSRF_TOKEN, { probe: marker }, {
      ip: '203.0.113.9', method: 'POST', path: '/b6-probe', get: () => undefined
    });
  } finally {
    if (saved === undefined) delete process.env.LOG_DIR;
    else process.env.LOG_DIR = saved;
  }
};

describe('B6 — where audit events land', () => {
  it('LOG_DIR set: the event lands in $LOG_DIR, not in <repo>/logs and not under node_modules', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b6-logdir-'));
    const marker = `b6-set-${process.pid}-${Date.now()}`;
    const strayBefore = snapshot(STRAY_DIR);

    emit(dir, marker);

    expect(await waitForMarker(dir, marker)).toMatch(AUDIT);
    expect(await waitForMarker(dir, marker, /^security-critical\d*\.log$/)).toBeTruthy();
    // LOG_DIR is honoured, so the repo's own logs/ must NOT have received it.
    expect(findMarker(REPO_LOGS, marker)).toBeNull();
    expect(snapshot(STRAY_DIR)).toBe(strayBefore);
  });

  it('LOG_DIR unset: the event lands in <repo>/logs, never under node_modules/@crhs/web-core/logs', async () => {
    const marker = `b6-unset-${process.pid}-${Date.now()}`;
    const strayBefore = snapshot(STRAY_DIR);

    emit(null, marker);

    expect(await waitForMarker(REPO_LOGS, marker)).toMatch(AUDIT);
    expect(snapshot(STRAY_DIR)).toBe(strayBefore);
    expect(findMarker(STRAY_DIR, marker)).toBeNull();
  });
});
