jest.setTimeout(60000);

jest.mock('../../server/utils/emailService');

const request = require('supertest');
const emailService = require('../../server/utils/emailService');

const ENDPOINT = '/api/v1/affiliate-application';
const RECIPIENT = 'admin@crhsent.com';

const validBody = () => ({
  firstName: 'Sam',
  lastName: 'Longhorn',
  email: 'sam.longhorn@utexas.edu',
  phone: '(512) 555-9090',
  affiliation: 'ut-student',
  serviceArea: 'West Campus',
  transport: 'bike',
  availability: 'Weekday evenings',
  // >= 80 chars: server/routes/affiliateApplicationRoutes.js:57 requires
  // isLength({ min: 80, max: 2000 }) on `message` as of 6acbf550.
  message: 'I would love to help with pickups near campus. I can hand out flyers at the co-ops, post in the UT housing groups, and follow up with every customer after their first order.',
  source: '/affiliates/'
});

// /api/v1/affiliate-application is in CSRF_CONFIG.PUBLIC_ENDPOINTS — a
// credential-free public marketing form (same rationale as /api/v1/partner-inquiry),
// rate-limited only. The production frontend submits with a PLAIN fetch (no CSRF
// token), and this test does the same: a bare POST must succeed. This also guards
// the public-endpoint config — if the route is ever dropped from PUBLIC_ENDPOINTS,
// the happy-path POST would start returning 403 and fail here.
async function postApplication(app, body) {
  return request(app)
    .post(ENDPOINT)
    .set('Accept', 'application/json')
    .send(body);
}

describe('POST /api/v1/affiliate-application', () => {
  let app;

  beforeAll(() => {
    app = require('../../server');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    emailService.sendEmail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
  });

  it('happy path — valid body returns 200, sends notification + thank-you', async () => {
    const res = await postApplication(app, validBody());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/application|in touch/i);

    // Two emails: notification to RECIPIENT, thank-you to the applicant.
    expect(emailService.sendEmail).toHaveBeenCalledTimes(2);

    const recipients = emailService.sendEmail.mock.calls.map((c) => c[0]);
    expect(recipients).toContain(RECIPIENT);
    expect(recipients).toContain('sam.longhorn@utexas.edu');

    // First email is the notification to the admin inbox.
    expect(emailService.sendEmail.mock.calls[0][0]).toBe(RECIPIENT);
  });

  it('400 — missing required email returns validation error', async () => {
    const body = validBody();
    delete body.email;

    const res = await postApplication(app, body);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it('400 — missing required phone returns validation error', async () => {
    const body = validBody();
    delete body.phone;

    const res = await postApplication(app, body);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });
});
