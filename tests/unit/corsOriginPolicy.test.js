// web-core v0.2.0 made wc.corsConfig env-only. This app does NOT consume it yet
// (server.js:282-328 is an inline allowlist), so v0.2.0 is inert here — but when
// the adoption PR (B11) swaps the inline block for cors(wc.corsConfig), every
// origin must already be named in the env. This test makes .env.example the
// executable record of that set, so the swap cannot silently lose one.

const fs = require('fs');
const path = require('path');

const REQUIRED_ORIGINS = [
  'https://portal.atxwashdryfold.com',
  'https://atxwashateria.com',
  'https://atxwashdryfold.com',
  'https://rundberglaundry.com'
];

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('CORS origin policy', () => {
  it('server.js still uses its own inline allowlist, not wc.corsConfig', () => {
    const src = read('server.js');
    expect(src).toContain('app.use(cors(corsOptions));');
    expect(src).not.toContain('webCore.corsConfig');
  });

  it('.env.example documents every inline origin for the B11 swap', () => {
    const env = read('.env.example');
    for (const origin of REQUIRED_ORIGINS) {
      expect(env).toContain(origin);
    }
  });
});
