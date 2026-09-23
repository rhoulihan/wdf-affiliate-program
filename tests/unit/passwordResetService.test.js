// Plan 3 task 28. The reset link was built from FRONTEND_URL — a second env key
// for the same origin, pointing at a marketing host. BASE_URL is already the
// canonical portal origin on both boxes, so the duplicate goes away with it.
// (The flip does NOT break the old form: :3001 301s /embed-app-v2.html to the
// portal with the token byte-identical, measured 2026-09-21. This is hygiene,
// not a cutover blocker.)
jest.mock('../../server/utils/emailService', () => ({
  sendAffiliatePasswordResetEmail: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../server/models/Affiliate', () => ({ findOne: jest.fn() }));

const crypto = require('crypto');
const emailService = require('../../server/utils/emailService');
const Affiliate = require('../../server/models/Affiliate');
const { forgotPassword } = require('../../server/services/passwordResetService');

const TOKEN = 'ab'.repeat(32);                                   // 64 hex chars
const cryptoWrapper = { randomBytes: () => Buffer.alloc(32, 0xab) };

describe('task 28: the reset link origin', () => {
  const OLD = { ...process.env };
  let user;

  beforeEach(() => {
    jest.clearAllMocks();
    user = { email: 'aff@example.com', save: jest.fn().mockResolvedValue(undefined) };
    Affiliate.findOne.mockResolvedValue(user);
  });
  afterEach(() => { process.env = { ...OLD }; });

  const capture = async () => {
    await forgotPassword({ email: user.email, userType: 'affiliate', cryptoWrapper });
    return emailService.sendAffiliatePasswordResetEmail.mock.calls[0][1];
  };

  it('builds the link from BASE_URL', async () => {
    process.env.BASE_URL = 'https://portal.atxwashdryfold.com';
    delete process.env.FRONTEND_URL;
    expect(await capture()).toBe(
      `https://portal.atxwashdryfold.com/embed-app-v2.html?route=/reset-password&token=${TOKEN}&type=affiliate`
    );
  });

  it('ignores FRONTEND_URL even when it is set', async () => {
    process.env.BASE_URL = 'https://portal.atxwashdryfold.com';
    process.env.FRONTEND_URL = 'https://rundberglaundry.com';
    expect(await capture()).not.toContain('rundberglaundry.com');
  });

  it('refuses to mail an "undefined" origin when BASE_URL is missing', async () => {
    delete process.env.BASE_URL; delete process.env.FRONTEND_URL;
    await expect(forgotPassword({ email: user.email, userType: 'affiliate', cryptoWrapper }))
      .rejects.toThrow(/BASE_URL/);
    expect(emailService.sendAffiliatePasswordResetEmail).not.toHaveBeenCalled();
  });

  it('emails the token that was stored, hashed', async () => {
    process.env.BASE_URL = 'https://portal.atxwashdryfold.com';
    const url = await capture();
    const emailed = decodeURIComponent(new URL(url).searchParams.get('token'));
    expect(crypto.createHash('sha256').update(emailed).digest('hex')).toBe(user.resetToken);
  });
});
