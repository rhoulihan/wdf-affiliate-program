// Affiliate emails must link to OUR app, never to the franchisor.
//
// dispatcher/affiliate.js was missed by the Phase 4a domain migration and still
// hardcoded https://www.wavemaxlaundry.com/austin-tx/wavemax-austin-affiliate-program
// in seven places, so every affiliate welcome email sent the affiliate — and the
// customers they shared their landing link with — to the franchisor's website.
// The sibling dispatchers (admin/customer/operator) all build URLs from BASE_URL.
//
// The branding guard did not catch this: /wavemax-austin-affiliate-program/gi sits
// in its INFRA_ALLOW list (branding-guard.test.js:94), classified in Phase 4c as an
// intentional keep. It was not — it was a stale franchisor link.

// Mock the transport BEFORE requiring the dispatcher (house rule).
jest.mock('../../server/services/email/transport', () => ({
  sendEmail: jest.fn().mockResolvedValue(true)
}));

const fs = require('fs');
const path = require('path');
const { sendEmail } = require('../../server/services/email/transport');
const affiliateEmails = require('../../server/services/email/dispatcher/affiliate');

const DISPATCHER = path.join(__dirname, '../../server/services/email/dispatcher/affiliate.js');
const BASE = 'https://portal.example.test';

const AFFILIATE = {
  affiliateId: 'AFF-0000-test',
  firstName: 'Ada',
  lastName: 'Tester',
  email: 'ada@example.test',
  languagePreference: 'en'
};

describe('affiliate email URLs', () => {
  const ORIG = process.env.BASE_URL;
  beforeEach(() => { jest.clearAllMocks(); process.env.BASE_URL = BASE; });
  afterEach(() => {
    if (ORIG === undefined) delete process.env.BASE_URL; else process.env.BASE_URL = ORIG;
  });

  test('welcome email builds its landing + login links from BASE_URL', async () => {
    await affiliateEmails.sendAffiliateWelcomeEmail(AFFILIATE);
    expect(sendEmail).toHaveBeenCalled();

    const html = sendEmail.mock.calls[0][2];
    // pin the exact links, not just the host — a bare host assertion passes on the
    // template's logo URL alone and would not have caught the original defect
    expect(html).toContain(`${BASE}/embed-app-v2.html?route=/affiliate-landing&code=${AFFILIATE.affiliateId}`);
    expect(html).toContain(`${BASE}/embed-app-v2.html?login=affiliate`);
  });

  test('welcome email never links to the franchisor', async () => {
    await affiliateEmails.sendAffiliateWelcomeEmail(AFFILIATE);
    const html = sendEmail.mock.calls[0][2];
    expect(html).not.toMatch(/wavemaxlaundry\.com/i);
    expect(html).not.toMatch(/austin-tx/i);
  });

  // Covers sendAffiliateNewCustomerEmail (was line 314) and
  // sendAffiliateOrderCancellationEmail (was line 629) without having to
  // construct their full order/customer fixtures.
  test('no franchisor host remains anywhere in the affiliate dispatcher', () => {
    const src = fs.readFileSync(DISPATCHER, 'utf8');
    expect(src).not.toMatch(/wavemaxlaundry\.com/i);
  });
});
