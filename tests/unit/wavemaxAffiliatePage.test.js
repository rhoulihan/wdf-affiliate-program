// /wavemax-affiliate — WaveMAX-themed generic affiliate interest page (ad
// funnel). Source-level wiring + gate guards so a future edit to any of the
// three host gates (route, partnerLanding exempt, quarantine allowlist) can't
// silently break public access on the four Austin domains.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'public/wavemax-affiliate.html'), 'utf8');
const serverJs = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

describe('/wavemax-affiliate page', () => {
  it('posts to the shared affiliate-application backend, tagged as the ad source', () => {
    expect(html).toContain('src="/assets/js/affiliate-inquiry.js"');
    expect(html).toContain('name="source" value="wavemax-affiliate-ad"');
  });

  it('carries the reusable form field ids the inquiry script reads', () => {
    for (const id of ['af-form', 'af-firstName', 'af-lastName', 'af-email',
      'af-phone', 'af-eligible', 'af-status', 'af-submit']) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('is WaveMAX-branded and omits the UT-specific affiliation field', () => {
    expect(html).toContain('/assets/images/brand/logo.png');
    expect(html).toContain('/assets/css/wavemax-affiliate.css');
    // The generic ad page must NOT reuse the UT-student affiliation select.
    expect(html).not.toContain('name="affiliation"');
    expect(html).not.toMatch(/ut-student|UT Austin|burnt.?orange/i);
  });

  it('declares its canonical URL and an og:image', () => {
    expect(html).toContain('rel="canonical" href="https://rundberglaundry.com/wavemax-affiliate"');
    expect(html).toContain('/assets/images/affiliate-ad-og.png');
  });

  it('is served by an Express route', () => {
    expect(serverJs).toMatch(/['"]\/wavemax-affiliate['"],\s*['"]\/wavemax-affiliate\/['"]/);
    expect(serverJs).toContain("'wavemax-affiliate.html'");
  });

  describe('host gates allow the path publicly', () => {
    const partnerLanding = require('../../server/middleware/partnerLanding');
    const quarantine = require('../../server/config/quarantineConfig');
    for (const p of ['/wavemax-affiliate', '/wavemax-affiliate/']) {
      it(`partnerLanding exempts ${p}`, () => expect(partnerLanding._isExempt(p)).toBe(true));
      it(`quarantine allows ${p}`, () => expect(quarantine.isAllowed(p)).toBe(true));
    }
  });
});
