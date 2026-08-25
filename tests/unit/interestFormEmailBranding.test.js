// Interest-form response emails must be brand-config-driven (WaveMAX Austin),
// the same way the affiliate welcome email is — via the shared base-template
// (logo + [BRAND_NAME] header + [BRAND_LEGAL] footer), not hardcoded
// "Rundberg Laundry" HTML.
const path = require('path');

jest.mock('../../server/utils/emailService', () => ({ sendEmail: jest.fn().mockResolvedValue(true) }));
const emailService = require('../../server/utils/emailService');

describe('interest-form response emails are brand-config-driven (like the welcome email)', () => {
  const OLD_ENV = process.env.BRAND_DISPLAY_NAME;
  let brand;

  beforeAll(() => {
    process.env.BRAND_DISPLAY_NAME = 'WaveMAX Austin';
    // brand.js resolves lazily (getters), so this env is picked up on access.
    brand = require('../../server/config/brand');
  });
  afterAll(() => { process.env.BRAND_DISPLAY_NAME = OLD_ENV; });
  beforeEach(() => emailService.sendEmail.mockClear());

  function htmlsFrom(mock) { return mock.mock.calls.map((c) => c[2]); } // sendEmail(to, subject, html)

  test('affiliate-application emails use the brand + logo, not "Rundberg Laundry"', async () => {
    const svc = require('../../server/services/affiliateApplicationService');
    await svc.sendAffiliateApplication({
      firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com', phone: '512-555-0100',
      affiliation: 'ut-student', serviceArea: 'North Austin', transport: 'car',
      availability: 'weekends', message: 'excited', source: 'wavemax-affiliate'
    });
    expect(emailService.sendEmail).toHaveBeenCalledTimes(2); // notification + applicant thank-you
    for (const html of htmlsFrom(emailService.sendEmail)) {
      expect(html).toContain(brand.displayName);          // "WaveMAX Austin" header
      expect(html).toMatch(/<img[^>]+brand\/logo\.png/i);  // config-driven logo
      expect(html).not.toContain('Rundberg Laundry');      // no hardcoded old brand name
    }
  });

  test('partner-inquiry emails use the brand + logo, not "Rundberg Laundry"', async () => {
    const svc = require('../../server/services/partnerInquiryService');
    await svc.sendPartnerInquiry({
      firstName: 'Pat', lastName: 'Kim', email: 'pat@example.com', phone: '512-555-0199',
      businessName: 'Acme Co', serviceArea: 'Downtown', volume: '50/wk',
      message: 'interested in pickup/delivery', source: 'partner-program'
    });
    expect(emailService.sendEmail).toHaveBeenCalled();
    for (const html of htmlsFrom(emailService.sendEmail)) {
      expect(html).toContain(brand.displayName);
      expect(html).toMatch(/<img[^>]+brand\/logo\.png/i);
      expect(html).not.toContain('Rundberg Laundry');
    }
  });
});
