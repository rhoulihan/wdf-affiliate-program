// Location affiliates — operator-run collection points.
//
// Seam under test:
//   POST /api/v1/administrators/affiliates — admin hand-creates an affiliate
//   (no invite), server provisions a one-time temporary password + delivery
//   code and applies the affiliateType ('location' vs 'standard') fee defaults.
//
// (The old commission-zeroing seam was removed with the commission system in
// the PR 3 order rewrite — there is no money/commission on the Order anymore.)

jest.mock('../../server/utils/emailService');
jest.setTimeout(90000);

const app = require('../../server');
const Administrator = require('../../server/models/Administrator');
const Affiliate = require('../../server/models/Affiliate');
const encryptionUtil = require('../../server/utils/encryption');
const roleCodes = require('../../server/utils/roleCodes');
const { createTestToken } = require('../helpers/authHelper');
const { getCsrfToken, createAgent } = require('../helpers/csrfHelper');

describe('Location affiliates (admin manual-create)', () => {

  // ========================================================================
  // 1. Admin manual-create endpoint
  // ========================================================================
  describe('POST /api/v1/administrators/affiliates', () => {
    let agent, csrfToken, adminToken, limitedAdminToken;

    const createBody = (overrides = {}) => ({
      firstName: 'Loc',
      lastName: 'Point',
      email: 'locpoint@example.com',
      phone: '512-555-0100',
      businessName: 'North Austin Drop',
      address: '1 Collect St',
      city: 'Austin',
      state: 'TX',
      zipCode: '78753',
      username: 'locpoint1',
      pickupInstructions: 'Drop your bag at the front desk, Mon–Fri 8am–6pm.',
      ...overrides
    });

    beforeEach(async () => {
      await Administrator.deleteMany({});
      await Affiliate.deleteMany({});

      const admin = await Administrator.create({
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

    const post = (body, token = adminToken, withCsrf = true) => {
      const req = agent
        .post('/api/v1/administrators/affiliates')
        .set('Authorization', `Bearer ${token}`);
      if (withCsrf) req.set('x-csrf-token', csrfToken);
      return req.send(body);
    };

    test('201 creates a location affiliate with one-time temporary password + delivery code', async () => {
      const res = await post(createBody());

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.affiliateId).toMatch(/^AFF-/);
      expect(typeof res.body.temporaryPassword).toBe('string');
      expect(res.body.temporaryPassword.length).toBeGreaterThanOrEqual(12);
      expect(typeof res.body.deliveryCode).toBe('string');
      expect(res.body.deliveryCode.length).toBeGreaterThanOrEqual(6);

      const persisted = await Affiliate.findOne({ affiliateId: res.body.affiliateId })
        .select('+affiliateDeliveryCodeHash');
      expect(persisted).toBeTruthy();
      expect(persisted.affiliateType).toBe('location');
      expect(persisted.isActive).toBe(true);
      // Location affiliates charge no delivery fee by default (→ platform default applies)
      expect(persisted.deliveryFee).toBe(0);
      // The returned one-time secrets verify against the stored hashes
      expect(encryptionUtil.verifyPassword(
        res.body.temporaryPassword, persisted.passwordSalt, persisted.passwordHash
      )).toBe(true);
      expect(roleCodes.verifyCode(res.body.deliveryCode, persisted.affiliateDeliveryCodeHash)).toBe(true);
    });

    test("accepts affiliateType 'standard' with a provided flat delivery fee", async () => {
      const res = await post(createBody({
        email: 'std@example.com', username: 'stdaff1', affiliateType: 'standard', deliveryFee: 25
      }));
      expect(res.status).toBe(201);
      const persisted = await Affiliate.findOne({ affiliateId: res.body.affiliateId });
      expect(persisted.affiliateType).toBe('standard');
      expect(persisted.deliveryFee).toBe(25);
    });

    test('403 without the manage_affiliates permission', async () => {
      const res = await post(createBody(), limitedAdminToken);
      expect(res.status).toBe(403);
      expect(await Affiliate.countDocuments()).toBe(0);
    });

    test('403 without a CSRF token', async () => {
      const res = await post(createBody(), adminToken, false);
      expect(res.status).toBe(403);
      expect(await Affiliate.countDocuments()).toBe(0);
    });

    test('409 on duplicate email', async () => {
      await post(createBody());
      const res = await post(createBody({ username: 'otheruser' }));
      expect(res.status).toBe(409);
      expect(await Affiliate.countDocuments()).toBe(1);
    });

    test('409 on duplicate username', async () => {
      await post(createBody());
      const res = await post(createBody({ email: 'other@example.com' }));
      expect(res.status).toBe(409);
      expect(await Affiliate.countDocuments()).toBe(1);
    });

    test('400 on invalid email', async () => {
      const res = await post(createBody({ email: 'not-an-email' }));
      expect(res.status).toBe(400);
    });

    test('400 when pickupInstructions is missing (required for every partner)', async () => {
      const body = createBody();
      delete body.pickupInstructions;
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(await Affiliate.countDocuments()).toBe(0);
    });

    test('persists pickupInstructions on create', async () => {
      const res = await post(createBody({
        pickupInstructions: 'Ring the bell at the side door for pickup.'
      }));
      expect(res.status).toBe(201);
      const persisted = await Affiliate.findOne({ affiliateId: res.body.affiliateId });
      expect(persisted.pickupInstructions).toBe('Ring the bell at the side door for pickup.');
    });

    test('persists deliveryInstructions on create (separate from pickup)', async () => {
      const res = await post(createBody({
        pickupInstructions: 'Front desk drop-off.',
        deliveryInstructions: 'Leave with the doorman in the lobby.'
      }));
      expect(res.status).toBe(201);
      const persisted = await Affiliate.findOne({ affiliateId: res.body.affiliateId });
      expect(persisted.pickupInstructions).toBe('Front desk drop-off.');
      expect(persisted.deliveryInstructions).toBe('Leave with the doorman in the lobby.');
    });

    test('deliveryInstructions is optional — create succeeds without it', async () => {
      const body = createBody();
      delete body.deliveryInstructions;
      const res = await post(body);
      expect(res.status).toBe(201);
    });
  });
});
