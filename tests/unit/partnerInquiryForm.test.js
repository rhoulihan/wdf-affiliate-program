// Guard test: the partner-program landing page's inquiry form must stay in sync
// with the server validators (server/routes/partnerInquiryRoutes.js), and any
// WaveMAX branding on the page must stay confined to the sanctioned
// fulfillment-partner references (see the allowlist test below). If a field
// is renamed on one side but not the other, the form silently breaks — this
// catches that.
const fs = require('fs');
const path = require('path');
const { allWavemaxOccurrencesAreSanctioned } = require('../helpers/wavemaxAllowlist');

const HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'partner-program.html'), 'utf8');
const JS = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'assets', 'js', 'partner-inquiry.js'), 'utf8');

// the server-side validator field set (must match partnerInquiryRoutes.js)
const VALIDATOR_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'businessName', 'serviceArea', 'volume', 'message', 'source'];
const VOLUME_VALUES = ['just-exploring', '<50', '50-200', '200+'];

function formNames(html) {
  const names = new Set();
  const re = /<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) names.add(m[1]);
  return names;
}

describe('partner-program inquiry form ↔ server contract', () => {
  const names = formNames(HTML);

  test('every server validator field has a matching form control', () => {
    for (const f of VALIDATOR_FIELDS) {
      expect(names.has(f)).toBe(true);
    }
  });

  test('the form introduces no field the server does not validate', () => {
    for (const n of names) {
      expect(VALIDATOR_FIELDS).toContain(n);
    }
  });

  test('volume option values match the server enum', () => {
    for (const v of VOLUME_VALUES) {
      // values are HTML-escaped in the markup (e.g. &lt;50)
      const escaped = v.replace(/</g, '&lt;');
      expect(HTML).toContain(`value="${escaped}"`);
    }
  });

  test('required fields are marked required in the markup', () => {
    for (const f of ['firstName', 'lastName', 'email', 'phone']) {
      const re = new RegExp(`name="${f}"[^>]*\\brequired`);
      expect(re.test(HTML)).toBe(true);
    }
  });

  // The owner reversed the "zero WaveMAX branding" rule on 2026-09-08: the
  // partner page must now name WaveMAX Austin as the exclusive fulfillment
  // partner for the atxwashdryfold program. So a blanket ban is permanently
  // obsolete — but any UNSANCTIONED WaveMAX mention (e.g. a stray marketing
  // tagline) must still fail the suite. This guard is now an ALLOWLIST:
  // every occurrence of /wavemax/i must land inside one of the sanctioned
  // fulfillment-partner references below.
  test('the only WaveMAX references are the sanctioned fulfillment-partner links', () => {
    expect(allWavemaxOccurrencesAreSanctioned(HTML)).toEqual({ unsanctioned: [] });
  });

  test('canonical points at the primary domain (rundberglaundry.com)', () => {
    expect(HTML).toMatch(/<link rel="canonical" href="https:\/\/rundberglaundry\.com\/">/);
  });

  test('page is marked indexable (not noindex)', () => {
    expect(HTML).toMatch(/<meta name="robots" content="index, follow">/);
    expect(HTML).not.toMatch(/noindex/);
  });

  test('the form handler posts to the public partner-inquiry endpoint', () => {
    expect(JS).toContain('/api/v1/partner-inquiry');
  });

  test('self-hosted fonts + external (non-inline) css/js are referenced', () => {
    expect(HTML).toContain('/assets/css/partner-program.css');
    expect(HTML).toContain('/assets/js/partner-inquiry.js');
    expect(HTML).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
  });
});
