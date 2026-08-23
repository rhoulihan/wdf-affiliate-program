jest.setTimeout(90000);

// Mock the invite email dispatcher BEFORE requiring the app.
jest.mock('../../server/services/email/dispatcher/onboarding', () => ({
  sendAffiliateInviteEmail: jest.fn().mockResolvedValue(true)
}));

const mongoose = require('mongoose');
const app = require('../../server');
const Administrator = require('../../server/models/Administrator');
const Affiliate = require('../../server/models/Affiliate');
const AffiliateInvite = require('../../server/modules/onboarding/AffiliateInvite');
const encryptionUtil = require('../../server/utils/encryption');
const { createTestToken } = require('../helpers/authHelper');
const { getCsrfToken, createAgent } = require('../helpers/csrfHelper');
const onboardingEmail = require('../../server/services/email/dispatcher/onboarding');
const { getStrongPassword } = require('../helpers/testPasswords');
const inviteService = require('../../server/modules/onboarding/inviteService');

describe('Affiliate invites API', () => {
  let agent;
  let csrfToken;
  let admin;
  let adminToken;
  let limitedAdminToken;

  // Direct-DB invite factory (skips the admin API; used by validate/register tests)
  const seedInvite = async (overrides = {}) => {
    const raw = encryptionUtil.generateToken(32);
    const invite = await AffiliateInvite.create({
      tokenHash: AffiliateInvite.hashToken(raw),
      email: 'invitee@example.com',
      prefill: { firstName: 'Ina', lastName: 'Vite' },
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      createdBy: new mongoose.Types.ObjectId(),
      ...overrides
    });
    return { raw, invite };
  };

  beforeEach(async () => {
    await Administrator.deleteMany({});
    await Affiliate.deleteMany({});
    await AffiliateInvite.deleteMany({});
    jest.clearAllMocks();
    onboardingEmail.sendAffiliateInviteEmail.mockResolvedValue(true);

    admin = await Administrator.create({
      firstName: 'Test', lastName: 'Admin', email: 'admin@test.com',
      username: 'testadmin', passwordSalt: 'salt', passwordHash: 'hash',
      permissions: ['manage_affiliates']
    });
    adminToken = createTestToken(admin._id, 'administrator');

    const limitedAdmin = await Administrator.create({
      firstName: 'Limited', lastName: 'Admin', email: 'limited@test.com',
      username: 'limitedadmin', passwordSalt: 'salt', passwordHash: 'hash',
      permissions: ['view_analytics']
    });
    limitedAdminToken = createTestToken(limitedAdmin._id, 'administrator');

    agent = createAgent(app);
    csrfToken = await getCsrfToken(app, agent);
  });

  describe('POST /api/v1/administrators/affiliate-invites (mint)', () => {
    const mintBody = {
      email: 'New.Invitee@Example.com',
      prefill: { firstName: 'Nia', lastName: 'Liate', businessName: 'Liate LLC', phone: '555-0100' }
    };

    test('mints a pending invite, emails the link, never returns the raw token', async () => {
      const res = await agent
        .post('/api/v1/administrators/affiliate-invites')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send(mintBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.invite).toMatchObject({
        email: 'new.invitee@example.com',
        status: 'pending',
        resendCount: 0
      });
      expect(res.body.invite.inviteId).toMatch(/^INV-/);
      // Anti-leak: no 64-hex raw token anywhere in the response.
      expect(JSON.stringify(res.body)).not.toMatch(/[0-9a-f]{64}/);

      expect(onboardingEmail.sendAffiliateInviteEmail).toHaveBeenCalledTimes(1);
      const arg = onboardingEmail.sendAffiliateInviteEmail.mock.calls[0][0];
      expect(arg.inviteUrl.startsWith(
        `${process.env.BASE_URL}/embed-app-v2.html?route=/affiliate-register&invite=`
      )).toBe(true);
      expect(arg.inviteUrl).toMatch(/&invite=[0-9a-f]{64}$/);
    });

    test('403 without the manage_affiliates permission', async () => {
      const res = await agent
        .post('/api/v1/administrators/affiliate-invites')
        .set('Authorization', `Bearer ${limitedAdminToken}`)
        .set('x-csrf-token', csrfToken)
        .send(mintBody);
      expect(res.status).toBe(403);
      expect(await AffiliateInvite.countDocuments()).toBe(0);
    });

    test('403 without a CSRF token', async () => {
      const res = await agent
        .post('/api/v1/administrators/affiliate-invites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(mintBody);
      expect(res.status).toBe(403);
    });

    test('400 on a malformed email', async () => {
      const res = await agent
        .post('/api/v1/administrators/affiliate-invites')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send({ email: 'not-an-email' });
      expect(res.status).toBe(400);
    });

    test('409 when a pending invite already exists for the email', async () => {
      await seedInvite({ email: 'new.invitee@example.com' });
      const res = await agent
        .post('/api/v1/administrators/affiliate-invites')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send(mintBody);
      expect(res.status).toBe(409);
      expect(await AffiliateInvite.countDocuments()).toBe(1);
    });
  });

  describe('GET /api/v1/administrators/affiliate-invites (list)', () => {
    test('lists invites filtered by status, without token hashes', async () => {
      await seedInvite({ email: 'a@example.com' });
      await seedInvite({ email: 'b@example.com', status: 'revoked' });

      const res = await agent
        .get('/api/v1/administrators/affiliate-invites?status=pending')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.invites).toHaveLength(1);
      expect(res.body.invites[0].email).toBe('a@example.com');
      expect(res.body.invites[0].tokenHash).toBeUndefined();
    });
  });

  describe('POST /api/v1/administrators/affiliate-invites/:inviteId/resend', () => {
    test('re-mints the token and bumps resendCount', async () => {
      const { invite } = await seedInvite();
      const oldHash = invite.tokenHash;

      const res = await agent
        .post(`/api/v1/administrators/affiliate-invites/${invite.inviteId}/resend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send({});

      expect(res.status).toBe(200);
      const updated = await AffiliateInvite.findOne({ inviteId: invite.inviteId });
      expect(updated.tokenHash).not.toBe(oldHash);
      expect(updated.resendCount).toBe(1);
      expect(updated.sentAt).toBeInstanceOf(Date);
      expect(onboardingEmail.sendAffiliateInviteEmail).toHaveBeenCalledTimes(1);
    });

    test('409 when the invite is not pending', async () => {
      const { invite } = await seedInvite({ status: 'revoked' });
      const res = await agent
        .post(`/api/v1/administrators/affiliate-invites/${invite.inviteId}/resend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send({});
      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/v1/administrators/affiliate-invites/:inviteId/revoke', () => {
    test('revokes a pending invite', async () => {
      const { invite } = await seedInvite();
      const res = await agent
        .post(`/api/v1/administrators/affiliate-invites/${invite.inviteId}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send({});

      expect(res.status).toBe(200);
      const updated = await AffiliateInvite.findOne({ inviteId: invite.inviteId });
      expect(updated.status).toBe('revoked');
      expect(String(updated.revokedBy)).toBe(String(admin._id));
    });

    test('409 on revoking an accepted invite', async () => {
      const { invite } = await seedInvite({ status: 'accepted' });
      const res = await agent
        .post(`/api/v1/administrators/affiliate-invites/${invite.inviteId}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send({});
      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/v1/affiliate-invites/:token/validate (public)', () => {
    test('valid pending token → 200 { valid, email, prefill }, no auth needed', async () => {
      const { raw } = await seedInvite({ email: 'valid@example.com' });
      const res = await agent.get(`/api/v1/affiliate-invites/${raw}/validate`);

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.email).toBe('valid@example.com');
      expect(res.body.prefill).toMatchObject({ firstName: 'Ina', lastName: 'Vite' });
    });

    test('expired token → 410 reason "expired"', async () => {
      const { raw } = await seedInvite({ expiresAt: new Date(Date.now() - 1000) });
      const res = await agent.get(`/api/v1/affiliate-invites/${raw}/validate`);
      expect(res.status).toBe(410);
      expect(res.body).toEqual({ success: false, valid: false, reason: 'expired' });
    });

    test('unknown / revoked / accepted tokens all return the identical generic 410 (anti-enumeration)', async () => {
      const { raw: revokedRaw } = await seedInvite({ email: 'r@example.com', status: 'revoked' });
      const { raw: acceptedRaw } = await seedInvite({ email: 'a@example.com', status: 'accepted' });
      const unknownRaw = 'ab'.repeat(32);

      const responses = await Promise.all([
        agent.get(`/api/v1/affiliate-invites/${unknownRaw}/validate`),
        agent.get(`/api/v1/affiliate-invites/${revokedRaw}/validate`),
        agent.get(`/api/v1/affiliate-invites/${acceptedRaw}/validate`)
      ]);

      for (const res of responses) {
        expect(res.status).toBe(410);
        expect(res.body).toEqual({ success: false, valid: false, reason: 'invalid' });
      }
    });
  });

  describe('POST /api/v1/affiliates/register (invite-bound)', () => {
    // Valid Austin payload — city/state/zip must satisfy registrationAddressValidation.
    const basePayload = (overrides = {}) => ({
      firstName: 'New', lastName: 'Affiliate',
      email: 'client-sent@example.com',           // deliberately NOT the invite email
      phone: '555-5678',
      address: '456 Test St', city: 'Austin', state: 'TX', zipCode: '78701',
      serviceArea: 'Austin Area', // the plain string survives PR 2; the geo fields do NOT
      username: 'newaffiliate', password: getStrongPassword('affiliate', 7),
      paymentMethod: 'check',
      ...overrides
    });

    const register = (payload) => agent
      .post('/api/v1/affiliates/register')
      .set('x-csrf-token', csrfToken)
      .send(payload);

    test('400 without an inviteToken (the public gate is closed)', async () => {
      const res = await register(basePayload());
      expect(res.status).toBe(400);
      expect(res.body.errors.some(e => (e.path || e.param) === 'inviteToken')).toBe(true);
      expect(await Affiliate.countDocuments()).toBe(0);
    });

    test('410 with an unknown inviteToken', async () => {
      const res = await register(basePayload({ inviteToken: 'ab'.repeat(32) }));
      expect(res.status).toBe(410);
      expect(res.body.reason).toBe('invalid');
      expect(await Affiliate.countDocuments()).toBe(0);
    });

    test('410 reason expired with an expired invite', async () => {
      const { raw } = await seedInvite({ expiresAt: new Date(Date.now() - 1000) });
      const res = await register(basePayload({ inviteToken: raw }));
      expect(res.status).toBe(410);
      expect(res.body.reason).toBe('expired');
    });

    test('valid invite → 201, affiliate created, invite consumed', async () => {
      const { raw, invite } = await seedInvite({ email: 'real.invitee@example.com' });
      const res = await register(basePayload({ inviteToken: raw }));

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.affiliateId).toMatch(/^AFF-/);

      const affiliate = await Affiliate.findOne({ affiliateId: res.body.affiliateId });
      expect(affiliate).not.toBeNull();

      const consumed = await AffiliateInvite.findOne({ inviteId: invite.inviteId });
      expect(consumed.status).toBe('accepted');
      expect(consumed.acceptedAffiliateId).toBe(res.body.affiliateId);
    });

    test('non-TX address is accepted — no service-area gate (nationwide invite model)', async () => {
      const { raw } = await seedInvite({ email: 'oos.invitee@example.com' });
      const res = await register(basePayload({
        inviteToken: raw, username: 'oosaffiliate',
        address: '350 5th Ave', city: 'New York', state: 'NY', zipCode: '10118'
      }));
      expect(res.status).toBe(201);
      const affiliate = await Affiliate.findOne({ affiliateId: res.body.affiliateId });
      expect(affiliate).not.toBeNull();
      expect(affiliate.state).toBe('NY');
      expect(affiliate.city).toBe('New York');
    });

    test('client-sent email is IGNORED — the account email comes from the invite', async () => {
      const { raw } = await seedInvite({ email: 'real.invitee@example.com' });
      const res = await register(basePayload({ inviteToken: raw, email: 'attacker@evil.com' }));

      expect(res.status).toBe(201);
      const affiliate = await Affiliate.findOne({ affiliateId: res.body.affiliateId });
      expect(affiliate.email).toBe('real.invitee@example.com');
      expect(await Affiliate.countDocuments({ email: 'attacker@evil.com' })).toBe(0);
    });

    test('reused (already-accepted) invite → 409 and no second affiliate', async () => {
      const { raw } = await seedInvite({ email: 'real.invitee@example.com' });
      const first = await register(basePayload({ inviteToken: raw, username: 'firstuser' }));
      expect(first.status).toBe(201);

      const second = await register(basePayload({ inviteToken: raw, username: 'seconduser' }));
      expect(second.status).toBe(409);
      expect(await Affiliate.countDocuments()).toBe(1);
    });

    test('consume race loss rolls the affiliate back and returns 409', async () => {
      const { raw } = await seedInvite({ email: 'race@example.com' });
      // Force the loser branch deterministically: validate passes, consume loses.
      const consumeSpy = jest.spyOn(inviteService, 'consumeInvite').mockResolvedValueOnce(null);

      const res = await register(basePayload({ inviteToken: raw }));

      expect(res.status).toBe(409);
      expect(await Affiliate.countDocuments({ email: 'race@example.com' })).toBe(0); // rolled back
      consumeSpy.mockRestore();
    });

    test('two concurrent registrations on one invite → exactly one affiliate', async () => {
      const { raw, invite } = await seedInvite({ email: 'concurrent@example.com' });

      const [r1, r2] = await Promise.all([
        register(basePayload({ inviteToken: raw, username: 'racerone' })),
        register(basePayload({ inviteToken: raw, username: 'racertwo' }))
      ]);

      const statuses = [r1.status, r2.status].sort();
      expect(statuses[0]).toBe(201);          // exactly one winner...
      expect(statuses[1]).toBeGreaterThanOrEqual(400); // ...one loser (400 dup-email / 409 consume / 409 already_used)
      expect(await Affiliate.countDocuments({ email: 'concurrent@example.com' })).toBe(1);

      const final = await AffiliateInvite.findOne({ inviteId: invite.inviteId });
      expect(final.status).toBe('accepted');
    });
  });
});
