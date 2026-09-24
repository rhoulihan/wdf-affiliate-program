// Plan 3 Task 44 (PR B11) inverted this suite. It used to assert that server.js
// still ran its own inline allowlist and that `.env.example` named every origin
// the coming swap must not lose; the swap has now happened, so the job here is to
// make sure neither half of the old mechanism can creep back in.
//
// The DISCRIMINATING line is the `|| ['http://localhost:3000']` fallback. It is
// the single expression whose presence distinguishes the two CORS behaviours
// (project memory, 2026-09-13 — the empty-CORS_ORIGIN localhost exposure): with
// it, an unset or empty CORS_ORIGIN granted CREDENTIALED cross-origin access to
// localhost on a production box. A partial revert can restore the inline block WITHOUT it, or
// restore the fallback alone, so both are asserted separately.
//
// Behaviour lives in tests/integration/cors.test.js; this file is the source
// guard, because a literal origin list is a thing you can reintroduce in a
// five-line diff that no behavioural test would notice while the env happens to
// agree with it.

const fs = require('fs');
const path = require('path');

const PORTAL = 'https://portal.atxwashdryfold.com';

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

// These guards assert on CODE, so strip the prose — the comment above
// `app.use(cors(webCore.corsConfig))` quotes the deleted fallback verbatim so a
// future reader knows what changed, and a raw grep cannot tell that apart from
// the fallback itself. Only WHOLE-LINE comments are removed, deliberately: a
// regex that also ate trailing `//` would eat the `//` inside a 'https://…'
// literal and turn the origin-list assertions vacuous.
const codeOnly = (src) => src
  .split('\n')
  .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join('\n');

describe('CORS origin policy', () => {
  const src = codeOnly(read('server.js'));

  it('server.js consumes the shared env-driven config', () => {
    expect(src).toContain('app.use(cors(webCore.corsConfig));');
  });

  it('the inline corsOptions block is gone', () => {
    expect(src).not.toMatch(/const corsOptions = \{/);
    expect(src).not.toMatch(/cors\(corsOptions\)/);
  });

  it('the localhost fallback is gone — the one line that distinguishes the two behaviours', () => {
    expect(src).not.toMatch(/\|\|\s*\[\s*'http:\/\/localhost:3000'/);
    expect(src).not.toMatch(/\[\s*'http:\/\/localhost:3000'\s*\]/);
  });

  it('server.js holds no literal CORS origin list', () => {
    expect(src).not.toMatch(/const wavemaxDomains = \[/);
    // Nothing in the CORS wiring may name an origin any more. The CSP and
    // redirect surfaces keep their own portal literal, so the check is scoped to
    // the one statement rather than the whole file — and the control below
    // proves the scope actually caught that statement.
    const corsStatements = src.split('\n').filter((line) => /cors\(/.test(line));
    expect(corsStatements).toEqual(['app.use(cors(webCore.corsConfig));']);
  });

  it('.env.example still documents the one origin production must carry', () => {
    // The swap made CORS_ORIGIN the WHOLE allowlist: an origin that is not in the
    // env is not admitted, full stop. `.env.example` is the executable record of
    // what a box has to set, so the portal origin must appear in it.
    expect(read('.env.example')).toContain(PORTAL);
  });
});
