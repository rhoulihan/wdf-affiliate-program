// The session cookie must never be REPLACED by a plain object.
//
// express-session serialises Set-Cookie from Cookie#data -- a getter on the Cookie
// PROTOTYPE. Replacing req.session.cookie with a plain-object spread (which this
// app's maxAge fixer used to do, "to avoid prototype issues") drops that getter, so
// the emitted cookie loses Path, HttpOnly, Secure, SameSite and Expires. This app's
// production cookie is __Host-portal.sid, and the __Host- prefix REQUIRES Secure and
// Path=/, so the browser rejects such a cookie outright and the session silently
// drops. Verified 2026-09-11 with a live express-session round-trip in @crhs/web-core,
// where the same defect was fixed in _maxAgeFixer and is covered behaviourally.
//
// This app's fixer is inline in server.js and not exported, and the session block is
// frozen until Plan 4 adopts the shared builder -- so this is a source-level guard.
// When Plan 4 replaces the block, delete this file; web-core's behavioural test is
// the permanent cover.
const fs = require('fs');
const path = require('path');

describe('session maxAge fixer keeps the express-session Cookie prototype', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');

  it('never assigns a fresh object literal to req.session.cookie', () => {
    expect(src).not.toMatch(/req\.session\.cookie\s*=\s*\{/);
  });

  it('still repairs an invalid maxAge', () => {
    expect(src).toMatch(/cookie\.maxAge\s*=\s*sessionMaxAge/);
  });

  it('keeps the guard that decides when to repair', () => {
    expect(src).toMatch(/typeof originalMaxAge !== 'number' \|\| isNaN\(originalMaxAge\) \|\| originalMaxAge < 0/);
  });
});
