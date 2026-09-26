/**
 * Affiliates must be able to edit ALL of their own information — including their
 * delivery fee and their pickup/delivery instructions — through
 * PUT /api/v1/affiliates/:affiliateId.
 *
 * Every assertion below re-reads the document from the database. That is
 * deliberate and not redundant: `updateAffiliateProfile` copies an allowlist of
 * field names onto the document, and any key NOT in that allowlist is accepted
 * with 200 and silently discarded. That is exactly how the live `email` bug
 * shipped — the settings form sent it, the allowlist omitted it, the API answered
 * "Affiliate profile updated successfully", and the UI then repopulated the old
 * value. A unit test with a mocked model passes vacuously against that bug, so
 * only a real round trip proves anything here.
 */
jest.setTimeout(90000);

const app = require('../../server');
const Administrator = require('../../server/models/Administrator');
const Affiliate = require('../../server/models/Affiliate');
const Order = require('../../server/models/Order');
const encryptionUtil = require('../../server/utils/encryption');
const { createTestToken } = require('../helpers/authHelper');
const { getCsrfToken, createAgent } = require('../helpers/csrfHelper');

describe('Affiliate self-service profile update', () => {
  let agent, csrfToken;

  const makeAffiliate = async (overrides = {}) => {
    const { salt, hash } = encryptionUtil.hashPassword('FixturePass123!');
    const uniq = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    return Affiliate.create({
      firstName: 'Self', lastName: 'Serve', email: `self${uniq}@example.com`,
      phone: '5125550002', address: '2 B St', city: 'Austin', state: 'TX', zipCode: '78702',
      username: `self${uniq}`, passwordSalt: salt, passwordHash: hash, paymentMethod: 'check',
      ...overrides
    });
  };

  const put = (affiliateId, token, body) =>
    agent.put(`/api/v1/affiliates/${affiliateId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-csrf-token', csrfToken)
      .send(body);

  const asSelf = (aff) => createTestToken(aff.affiliateId, 'affiliate');

  beforeEach(async () => {
    await Affiliate.deleteMany({});
    await Administrator.deleteMany({});
    await Order.deleteMany({});
    agent = createAgent(app);
    csrfToken = await getCsrfToken(app, agent);
  });

  // ── the field surface ─────────────────────────────────────────────────────
  // Everything an admin can set at onboarding, minus the two that stay
  // admin-only (affiliateType is the commission class; isActive is the admin's
  // switch). `value` is what we send; `expected` is what must come back out of
  // the database, which differs where the schema coerces.
  const FIELDS = [
    ['firstName', 'Renamed', 'Renamed'],
    ['lastName', 'Partner', 'Partner'],
    ['phone', '5125559999', '5125559999'],
    ['businessName', 'Bubbles LLC', 'Bubbles LLC'],
    ['address', '99 New St', '99 New St'],
    ['city', 'Round Rock', 'Round Rock'],
    ['state', 'TX', 'TX'],
    ['zipCode', '78664', '78664'],
    ['deliveryFee', 17.5, 17.5],
    ['email', 'moved@example.com', 'moved@example.com'],
    ['pickupInstructions', 'Ring the bell twice', 'Ring the bell twice'],
    ['deliveryInstructions', 'Leave under the awning', 'Leave under the awning'],
    ['serviceType', 'full_service', 'full_service'],
    ['orderNotificationsEnabled', true, true],
    ['languagePreference', 'es', 'es'],
    ['geoValidationEnabled', true, true],
    ['geoRadiusMiles', 12, 12]
  ];

  it.each(FIELDS)('persists %s when the affiliate edits it', async (field, value, expected) => {
    const aff = await makeAffiliate();
    const res = await put(aff.affiliateId, asSelf(aff), { [field]: value });
    expect(res.status).toBe(200);

    const after = await Affiliate.findOne({ affiliateId: aff.affiliateId });
    expect(after[field]).toBe(expected);
  });

  it('persists the whole form in one request, as the dashboard sends it', async () => {
    const aff = await makeAffiliate();
    const body = Object.fromEntries(FIELDS.map(([f, v]) => [f, v]));
    const res = await put(aff.affiliateId, asSelf(aff), body);
    expect(res.status).toBe(200);

    const after = await Affiliate.findOne({ affiliateId: aff.affiliateId });
    for (const [field, , expected] of FIELDS) {
      expect(after[field]).toBe(expected);
    }
  });

  // ── the two fields that stay admin-only ──────────────────────────────────
  it('refuses to let an affiliate change their own affiliateType', async () => {
    const aff = await makeAffiliate({ affiliateType: 'standard' });
    await put(aff.affiliateId, asSelf(aff), { affiliateType: 'location' });

    const after = await Affiliate.findOne({ affiliateId: aff.affiliateId });
    expect(after.affiliateType).toBe('standard');
  });

  it('refuses to let an affiliate reactivate themselves', async () => {
    const aff = await makeAffiliate({ isActive: false });
    await put(aff.affiliateId, asSelf(aff), { isActive: true });

    const after = await Affiliate.findOne({ affiliateId: aff.affiliateId });
    expect(after.isActive).toBe(false);
  });

  // ── silent-success is the bug class; make omissions loud ─────────────────
  it('rejects an unknown field instead of answering 200 and ignoring it', async () => {
    const aff = await makeAffiliate();
    const res = await put(aff.affiliateId, asSelf(aff), { notAField: 'x' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('notAField');
  });

  it('rejects an out-of-range deliveryFee with 400, not a 500 from the schema', async () => {
    const aff = await makeAffiliate({ deliveryFee: 10 });
    const res = await put(aff.affiliateId, asSelf(aff), { deliveryFee: 5000 });
    expect(res.status).toBe(400);

    const after = await Affiliate.findOne({ affiliateId: aff.affiliateId });
    expect(after.deliveryFee).toBe(10);
  });

  it('rejects an email already used by another affiliate with 409', async () => {
    const other = await makeAffiliate();
    const aff = await makeAffiliate();
    const res = await put(aff.affiliateId, asSelf(aff), { email: other.email });
    expect(res.status).toBe(409);

    const after = await Affiliate.findOne({ affiliateId: aff.affiliateId });
    expect(after.email).toBe(aff.email);
  });

  // ── authorization ────────────────────────────────────────────────────────
  it('forbids one affiliate from editing another', async () => {
    const victim = await makeAffiliate();
    const attacker = await makeAffiliate();
    const res = await put(victim.affiliateId, asSelf(attacker), { firstName: 'Hacked' });
    expect(res.status).toBe(403);

    const after = await Affiliate.findOne({ affiliateId: victim.affiliateId });
    expect(after.firstName).toBe(victim.firstName);
  });

  // ── password change rides this same route ─────────────────────────────────
  // The dashboard's Change Password form POSTs /change-password, a route that does
  // not exist, so it has always failed. PR 2 repoints it here, so prove it works.
  describe('password change through PUT', () => {
    it('changes the password when the current one is correct', async () => {
      const aff = await makeAffiliate();
      const res = await put(aff.affiliateId, asSelf(aff),
        { currentPassword: 'FixturePass123!', newPassword: 'BrandNewPass456!' });
      expect(res.status).toBe(200);

      const after = await Affiliate.findOne({ affiliateId: aff.affiliateId });
      expect(encryptionUtil.verifyPassword('BrandNewPass456!', after.passwordSalt, after.passwordHash)).toBe(true);
      expect(encryptionUtil.verifyPassword('FixturePass123!', after.passwordSalt, after.passwordHash)).toBe(false);
    });

    it('rejects a wrong current password and leaves the old one working', async () => {
      const aff = await makeAffiliate();
      const res = await put(aff.affiliateId, asSelf(aff),
        { currentPassword: 'WrongPass000!', newPassword: 'BrandNewPass456!' });
      expect(res.status).toBe(400);

      const after = await Affiliate.findOne({ affiliateId: aff.affiliateId });
      expect(encryptionUtil.verifyPassword('FixturePass123!', after.passwordSalt, after.passwordHash)).toBe(true);
    });
  });

  // ── the order list the Pickups tab renders ───────────────────────────────
  describe('GET /api/v1/affiliates/:affiliateId/orders projection', () => {
    const makeOrder = (affiliateId, overrides = {}) => Order.create({
      customerId: 'CUST-selfserve-1', affiliateId, bagId: 'BAG-selfserve-1',
      status: 'in_progress', ...overrides
    });

    it('surfaces the intake scan event, not a field the model never had', async () => {
      // The projection returned `processing: order.processing`. The model declares
      // the four scan events as pickup / intake / storePickup / delivery — there is
      // no `processing`, so that key was always undefined and the tab could never
      // show when a bag reached the store.
      const aff = await makeAffiliate();
      await makeOrder(aff.affiliateId, { intake: { at: new Date(), by: 'op-1' } });

      const res = await agent.get(`/api/v1/affiliates/${aff.affiliateId}/orders`)
        .set('Authorization', `Bearer ${asSelf(aff)}`);
      expect(res.status).toBe(200);

      const order = res.body.orders[0];
      expect(order.intake).toBeTruthy();
      expect(order.processing).toBeUndefined();
    });

    it('includes deliveryFeeCharged so the affiliate can see what they earned', async () => {
      const aff = await makeAffiliate();
      await makeOrder(aff.affiliateId, { status: 'complete', deliveryFeeCharged: 12.5 });

      const res = await agent.get(`/api/v1/affiliates/${aff.affiliateId}/orders`)
        .set('Authorization', `Bearer ${asSelf(aff)}`);
      expect(res.body.orders[0].deliveryFeeCharged).toBe(12.5);
    });
  });

  // ── the GET side: a form cannot edit what the API will not return ────────
  describe('GET /api/v1/affiliates/:affiliateId returns what the form must bind to', () => {
    const get = (affiliateId, token) =>
      agent.get(`/api/v1/affiliates/${affiliateId}`).set('Authorization', `Bearer ${token}`);

    it('returns RAW address and phone, not only the display-formatted versions', async () => {
      // The response formats `address` into one combined line and `phone` for
      // display. An input bound to those and PUT back would write the formatted
      // string into storage, corrupting the field a little more on every save.
      const aff = await makeAffiliate({ address: '2 B St', phone: '5125550002' });
      const res = await get(aff.affiliateId, asSelf(aff));
      expect(res.status).toBe(200);

      expect(res.body.affiliate.addressLine).toBe('2 B St');
      expect(res.body.affiliate.phoneRaw).toBe('5125550002');
    });

    it.each([
      ['pickupInstructions', 'Ring twice'],
      ['deliveryInstructions', 'Under the awning'],
      ['serviceType', 'full_service'],
      ['languagePreference', 'pt'],
      ['geoValidationEnabled', true],
      ['geoRadiusMiles', 9],
      ['affiliateType', 'location']
    ])('exposes %s so the dashboard can render it', async (field, value) => {
      const aff = await makeAffiliate({ [field]: value });
      const res = await get(aff.affiliateId, asSelf(aff));
      expect(res.body.affiliate[field]).toBe(value);
    });

    it('returns the venmo handle, as it already did for the paypal email', async () => {
      // Only paypalEmail was decrypted and returned, so a venmo affiliate could
      // never see the handle they had entered — the field looked empty and saving
      // the form would appear to wipe it.
      const aff = await makeAffiliate({ paymentMethod: 'venmo', venmoHandle: '@bubbles' });
      const res = await get(aff.affiliateId, asSelf(aff));
      expect(res.body.affiliate.venmoHandle).toBe('@bubbles');
    });

    it('exposes orderNotificationsEnabled', async () => {
      const aff = await makeAffiliate({ serviceType: 'full_service' });
      const res = await get(aff.affiliateId, asSelf(aff));
      expect(res.body.affiliate.orderNotificationsEnabled).toBe(true);
    });
  });

  it('allows a real administrator to edit an affiliate', async () => {
    // The self-check compared req.user.role against the literal 'admin', but no
    // code path ever issues that role — administrators get 'administrator', so
    // every real admin was 403'd on this route.
    const aff = await makeAffiliate();
    const admin = await Administrator.create({
      firstName: 'Real', lastName: 'Admin', email: 'realadmin@test.com',
      username: 'realadmin', passwordSalt: 'salt', passwordHash: 'hash',
      permissions: ['manage_affiliates']
    });
    const res = await put(aff.affiliateId, createTestToken(admin._id, 'administrator'),
      { firstName: 'ByAdmin' });
    expect(res.status).toBe(200);

    const after = await Affiliate.findOne({ affiliateId: aff.affiliateId });
    expect(after.firstName).toBe('ByAdmin');
  });
});
