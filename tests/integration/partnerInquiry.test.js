jest.setTimeout(60000);

jest.mock('../../server/utils/emailService');

const request = require('supertest');
const emailService = require('../../server/utils/emailService');

const ENDPOINT = '/api/v1/partner-inquiry';
const RECIPIENT = 'pickups@rundberglaundry.com';

const validBody = () => ({
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane.doe@example.com',
  phone: '(512) 555-1212',
  businessName: 'Doe Cleaners',
  serviceArea: 'North Austin',
  volume: '50-200',
  message: 'We would love to partner on pickup and delivery.',
  source: '/partners/'
});

// /api/v1/partner-inquiry is in CSRF_CONFIG.PUBLIC_ENDPOINTS — a credential-free
// public marketing form, rate-limited only.
// So the production frontend submits with a PLAIN fetch (no CSRF token), and this
// test does the same: a bare POST must succeed. This also guards the public-
// endpoint config — if the route is ever dropped from PUBLIC_ENDPOINTS, the
// happy-path POST would start returning 403 and fail here.
async function postInquiry(app, body) {
  return request(app)
    .post(ENDPOINT)
    .set('Accept', 'application/json')
    .send(body);
}

describe('POST /api/v1/partner-inquiry', () => {
  let app;

  beforeAll(() => {
    app = require('../../server');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    emailService.sendEmail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
  });

  it('happy path — valid body returns 200, sends notification + thank-you', async () => {
    const res = await postInquiry(app, validBody());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/sent|in touch/i);

    // Two emails: notification to RECIPIENT, thank-you to the inquirer.
    expect(emailService.sendEmail).toHaveBeenCalledTimes(2);

    const recipients = emailService.sendEmail.mock.calls.map((c) => c[0]);
    expect(recipients).toContain(RECIPIENT);
    expect(recipients).toContain('jane.doe@example.com');

    // First email is the notification to the partner-program inbox.
    expect(emailService.sendEmail.mock.calls[0][0]).toBe(RECIPIENT);
  });

  it('400 — missing required email returns validation error', async () => {
    const body = validBody();
    delete body.email;

    const res = await postInquiry(app, body);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it('400 — missing required phone returns validation error', async () => {
    const body = validBody();
    delete body.phone;

    const res = await postInquiry(app, body);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });
});
