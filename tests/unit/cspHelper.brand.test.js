'use strict';
const { injectNonce } = require('../../server/utils/cspHelper');
const brand = require('../../server/config/brand');

describe('injectNonce brand substitution', () => {
  test('replaces brand placeholders and fills the brand-name meta', () => {
    const html = '<meta name="brand-name" content=""><title>{{BRAND_NAME}}</title><p>{{BRAND_SHORT}}/{{BRAND_LEGAL}}</p>';
    const out = injectNonce(html, 'abc123');
    expect(out).toContain(`<title>${brand.displayName}</title>`);
    expect(out).toContain(`${brand.shortName}/${brand.legalName}`);
    expect(out).toContain(`<meta name="brand-name" content="${brand.displayName}">`);
    expect(out).not.toContain('{{BRAND_NAME}}');
  });
});
