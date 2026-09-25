/**
 * Password reset drives every supported user type through ONE path.
 *
 * The service used to branch on userType and, for administrators, assign
 * `user.password` in the belief that a pre-save hook would hash it. No such
 * hook exists on that schema and `password` is not a declared path, so
 * strict:true silently discarded the write: the reset reported success,
 * consumed the token, and left the previous password working.
 *
 * The contract that prevents a repeat is structural — any model reachable by
 * resetPassword() must own its hashing behind setPassword() — so it is asserted
 * on the models themselves rather than on a mock.
 */
const { USER_TYPES } = require('../../server/services/passwordResetService');
const Affiliate = require('../../server/models/Affiliate');
const Administrator = require('../../server/models/Administrator');
const Operator = require('../../server/models/Operator');

const MODELS = { affiliate: Affiliate, administrator: Administrator, operator: Operator };

// Operators authenticate by PIN; resetPassword() rejects them before any write.
const PASSWORD_TYPES = USER_TYPES.filter(t => t !== 'operator');

describe('every password-reset user type shares one path', () => {
  it('covers the service\'s own declared list (no drift)', () => {
    expect(PASSWORD_TYPES.length).toBeGreaterThan(1);
    expect(PASSWORD_TYPES).toEqual(expect.arrayContaining(['affiliate', 'administrator']));
  });

  it.each(PASSWORD_TYPES)('%s implements setPassword()', (userType) => {
    expect(typeof MODELS[userType].schema.methods.setPassword).toBe('function');
  });

  it.each(PASSWORD_TYPES)(
    '%s setPassword() writes the salt/hash that login verifies against',
    (userType) => {
      const doc = new MODELS[userType]();
      doc.setPassword('SomeNewPassw0rd!');
      expect(typeof doc.passwordSalt).toBe('string');
      expect(typeof doc.passwordHash).toBe('string');
      expect(doc.passwordSalt.length).toBeGreaterThan(0);
      expect(doc.passwordHash.length).toBeGreaterThan(0);
    }
  );

  it.each(PASSWORD_TYPES)(
    '%s produces a verifiable hash (not a discarded write)',
    (userType) => {
      const encryptionUtil = require('../../server/utils/encryption');
      const doc = new MODELS[userType]();
      doc.setPassword('SomeNewPassw0rd!');
      expect(encryptionUtil.verifyPassword('SomeNewPassw0rd!', doc.passwordSalt, doc.passwordHash)).toBe(true);
      expect(encryptionUtil.verifyPassword('WrongPassw0rd!', doc.passwordSalt, doc.passwordHash)).toBe(false);
    }
  );
});
