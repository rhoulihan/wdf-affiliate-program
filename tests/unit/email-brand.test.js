'use strict';
const brand = require('../../server/config/brand');
const { fillTemplate } = require('../../server/services/email/template-manager');

describe('email brand injection', () => {
  test('fillTemplate auto-injects [BRAND_NAME] and [BRAND_LEGAL]', () => {
    const out = fillTemplate('<h1>[BRAND_NAME]</h1><footer>[BRAND_LEGAL]</footer>', {});
    expect(out).toContain(`<h1>${brand.displayName}</h1>`);
    expect(out).toContain(`<footer>${brand.legalName}</footer>`);
  });

  test('caller-supplied BRAND_NAME / BRAND_LEGAL win over the defaults', () => {
    const out = fillTemplate('[BRAND_NAME]|[BRAND_LEGAL]', {
      BRAND_NAME: 'Override Co',
      BRAND_LEGAL: 'Override Legal, LLC'
    });
    expect(out).toBe('Override Co|Override Legal, LLC');
  });
});
