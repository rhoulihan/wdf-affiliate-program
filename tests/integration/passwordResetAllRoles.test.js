// Found by Task 34's administrator pass, 2026-09-25, on production.
//
// passwordResetService declares USER_TYPES = ['affiliate','administrator','operator'],
// but ONLY the Affiliate schema defines `resetToken` / `resetTokenExpiry`. Both
// schemas are strict:true, so mongoose SILENTLY DISCARDS those assignments for
// Administrator and Operator — no error, no warning.
//
// The result is a reset flow that looks like it works at every visible step: the
// token mints, the email sends and is delivered, the link opens the form — and the
// final POST can never match a stored token, so it returns 400 "invalid or expired
// token". Administrator and operator password reset had therefore NEVER worked.
//
// These tests assert PERSISTENCE, which is the thing strict:true silently removed.
const mongoose = require('mongoose');
const encryptionUtil = require('../../server/utils/encryption');

const MODELS = {
  affiliate: require('../../server/models/Affiliate'),
  administrator: require('../../server/models/Administrator'),
  operator: require('../../server/models/Operator')
};

// The service's own list — if a type is added there, this suite must cover it.
const { USER_TYPES } = require('../../server/services/passwordResetService');


// One fixture per model, because the required fields differ by model: Administrator
// takes passwordSalt/passwordHash directly while Operator requires a plain
// `password` that its pre-save hook hashes.
const makeUser = async (type, tag) => {
  const { hash, salt } = encryptionUtil.hashPassword('Str0ng!Passw0rd!x');
  const base = { firstName: 'T', lastName: 'U', isActive: true };
  const extra = {
    affiliate: { affiliateId: `AFF-${tag}`, email: `${tag}@example.com`, phone: '555-123-4567',
      address: '1 St', city: 'Austin', state: 'TX', zipCode: '78701', username: `u-${tag}`,
      paymentMethod: 'check', passwordSalt: salt, passwordHash: hash },
    administrator: { email: `${tag}@example.com`, permissions: ['all'], passwordSalt: salt, passwordHash: hash },
    operator: { email: `${tag}@example.com`, username: `u-${tag}`, operatorId: `OP-${tag}`,
      password: 'Str0ng!Passw0rd!x', createdBy: new mongoose.Types.ObjectId() }
  }[type];
  return MODELS[type].create({ ...base, ...extra });
};

describe('every user type the reset service claims to support can actually store a token', () => {
  it('USER_TYPES is exported so this suite cannot silently drift from the service', () => {
    expect(Array.isArray(USER_TYPES)).toBe(true);
    expect(USER_TYPES.length).toBeGreaterThan(0);
  });

  it.each(['affiliate', 'administrator', 'operator'])(
    '%s schema DEFINES resetToken and resetTokenExpiry', (type) => {
      const schema = MODELS[type].schema;
      expect(schema.path('resetToken')).toBeDefined();
      expect(schema.path('resetTokenExpiry')).toBeDefined();
    });

  it.each(['affiliate', 'administrator', 'operator'])(
    '%s actually PERSISTS a reset token through save() (strict:true discards undeclared paths)', async (type) => {
      const doc = await makeUser(type, `rst-${type}`);
      const expiry = Date.now() + 3600000;
      doc.resetToken = 'a'.repeat(64);
      doc.resetTokenExpiry = expiry;
      await doc.save();

      const back = await MODELS[type].findById(doc._id).lean();
      expect(back.resetToken).toBe('a'.repeat(64));
      expect(new Date(back.resetTokenExpiry).getTime()).toBe(new Date(expiry).getTime());
    });

  it.each(['affiliate', 'administrator', 'operator'])(
    '%s can be FOUND by the exact query resetPassword() uses', async (type) => {
      const M = MODELS[type];
      const doc = await makeUser(type, `find-${type}`);
      const token = 'b'.repeat(64);
      doc.resetToken = token;
      doc.resetTokenExpiry = Date.now() + 3600000;
      await doc.save();
      const found = await M.findOne({ resetToken: token, resetTokenExpiry: { $gt: Date.now() } });
      expect(found).not.toBeNull();
      expect(String(found._id)).toBe(String(doc._id));
    });

  it.each(['affiliate', 'administrator', 'operator'])(
    '%s an EXPIRED token is not found (the $gt guard is load-bearing)', async (type) => {
      const M = MODELS[type];
      const doc = await makeUser(type, `exp-${type}`);
      doc.resetToken = 'c'.repeat(64);
      doc.resetTokenExpiry = Date.now() - 1000;
      await doc.save();
      const found = await M.findOne({ resetToken: 'c'.repeat(64), resetTokenExpiry: { $gt: Date.now() } });
      expect(found).toBeNull();
    });
});
