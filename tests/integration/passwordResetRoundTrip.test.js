/**
 * Password reset must actually change the password — for EVERY user type that
 * declares support, through ONE shared code path.
 *
 * These tests use the REAL Mongoose models on purpose. The bug they pin down is
 * invisible to a mocked model: `passwordResetService` assigned `user.password`
 * for administrators, trusting a pre-save hook that does not exist on that
 * schema. A plain mock object accepts that assignment happily, so a unit test
 * with `jest.mock('../../server/models/Administrator')` passes vacuously while
 * production silently discards the write (strict:true drops undeclared paths).
 *
 * The round trip asserted here — mint a token, spend it, then verify the NEW
 * password and reject the OLD one — is the only assertion that cannot pass for
 * the wrong reason.
 */
jest.mock('../../server/utils/emailService', () => ({
  sendAffiliatePasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendAdministratorPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendOperatorPasswordResetEmail: jest.fn().mockResolvedValue(undefined)
}));

const crypto = require('crypto');
// The service takes its RNG by injection, exactly as authController does
// (authController.js:17) — passing the real one keeps this a true round trip.
const cryptoWrapper = { randomBytes: (size) => crypto.randomBytes(size) };

const emailService = require('../../server/utils/emailService');
const encryptionUtil = require('../../server/utils/encryption');
const Affiliate = require('../../server/models/Affiliate');
const Administrator = require('../../server/models/Administrator');
const {
  forgotPassword,
  resetPassword
} = require('../../server/services/passwordResetService');

const OLD_PASSWORD = 'OldPassw0rd!aaa';
const NEW_PASSWORD = 'BrandNewPassw0rd!zzz';

/** Build a persisted user of the given type with OLD_PASSWORD already set. */
async function seedUser(userType, email) {
  const { salt, hash } = encryptionUtil.hashPassword(OLD_PASSWORD);
  if (userType === 'affiliate') {
    return Affiliate.create({
      firstName: 'Reset', lastName: 'Probe', email, phone: '512-555-0100',
      address: '1 Test Ln', city: 'Austin', state: 'TX', zipCode: '78758',
      username: `reset_probe_${Date.now()}`, paymentMethod: 'check',
      passwordSalt: salt, passwordHash: hash
    });
  }
  return Administrator.create({
    firstName: 'Reset', lastName: 'Probe', email,
    passwordSalt: salt, passwordHash: hash
  });
}

const SENDER = {
  affiliate: 'sendAffiliatePasswordResetEmail',
  administrator: 'sendAdministratorPasswordResetEmail'
};

/** Pull the plaintext token out of the emailed URL, as a real user would. */
function tokenFromEmail(userType) {
  const url = emailService[SENDER[userType]].mock.calls[0][1];
  return new URL(url).searchParams.get('token');
}

describe.each(['affiliate', 'administrator'])(
  'password reset round trip: %s',
  (userType) => {
    const Model = userType === 'affiliate' ? Affiliate : Administrator;
    const email = `reset-${userType}@example.test`;

    beforeEach(async () => {
      jest.clearAllMocks();
      process.env.BASE_URL = 'https://portal.example.test';
      await Model.deleteMany({});
      await seedUser(userType, email);
    });

    it('sets the NEW password so the user can log in with it', async () => {
      await forgotPassword({ email, userType, cryptoWrapper });
      const token = tokenFromEmail(userType);
      expect(token).toBeTruthy();

      await resetPassword({ token, userType, password: NEW_PASSWORD });

      const user = await Model.findOne({ email });
      expect(
        encryptionUtil.verifyPassword(NEW_PASSWORD, user.passwordSalt, user.passwordHash)
      ).toBe(true);
    });

    it('stops accepting the OLD password', async () => {
      await forgotPassword({ email, userType, cryptoWrapper });
      await resetPassword({
        token: tokenFromEmail(userType), userType, password: NEW_PASSWORD
      });

      const user = await Model.findOne({ email });
      expect(
        encryptionUtil.verifyPassword(OLD_PASSWORD, user.passwordSalt, user.passwordHash)
      ).toBe(false);
    });

    it('actually rewrites the stored hash', async () => {
      const before = (await Model.findOne({ email })).passwordHash;

      await forgotPassword({ email, userType, cryptoWrapper });
      await resetPassword({
        token: tokenFromEmail(userType), userType, password: NEW_PASSWORD
      });

      const after = (await Model.findOne({ email })).passwordHash;
      expect(after).not.toBe(before);
    });
  }
);
