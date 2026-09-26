// PR C — customer-initiated start at a scanned bag (START ONLY).
// A registered customer can mint a scan session with their verified phone/email
// and open a pending order, but cannot advance state or undo.
jest.mock('../../server/utils/emailService');

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const Customer = require('../../server/models/Customer');
const Affiliate = require('../../server/models/Affiliate');
const Operator = require('../../server/models/Operator');
const Bag = require('../../server/modules/bags/Bag');
const Order = require('../../server/models/Order');
const SystemConfig = require('../../server/models/SystemConfig');
const encryptionUtil = require('../../server/utils/encryption');
const roleCodes = require('../../server/utils/roleCodes');

jest.setTimeout(60000);

const OP_CODE = 'OPCODE99';
const AFF_CODE = 'AFCD23';

async function createWorld() {
  const uniq = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const { salt, hash } = encryptionUtil.hashPassword('FixturePassword417!');
  const affiliate = await Affiliate.create({
    firstName: 'Fix', lastName: 'Affiliate', email: `fixaff${uniq}@example.com`,
    phone: '5125551111', businessName: 'Fixture Wash Co',
    address: '1 Fixture St', city: 'Austin', state: 'TX', zipCode: '78701',
    username: `fixaff${uniq}`, passwordSalt: salt, passwordHash: hash, paymentMethod: 'check',
    affiliateDeliveryCodeHash: roleCodes.hashCode(AFF_CODE)
  });
  // Phase 1 customers are registration-only (no login fields).
  const customer = await Customer.create({
    affiliateId: affiliate.affiliateId,
    firstName: 'Fix', lastName: 'Customer', email: `FixCust${uniq}@Example.com`,
    phone: '512-555-2222', address: '2 Fixture St', city: 'Austin', state: 'TX', zipCode: '78702'
  });
  const operator = await Operator.create({
    firstName: 'Fix', lastName: 'Operator', email: `fixop${uniq}@example.com`,
    username: `fixop${uniq}`, password: 'StrongOperatorPass417!',
    createdBy: new mongoose.Types.ObjectId(),
    scanCodeHmac: roleCodes.hmacCode(OP_CODE), scanCodeSetAt: new Date()
  });
  const token = encryptionUtil.generateToken(16);
  const bag = await Bag.create({
    token, tokenHash: Bag.hashToken(token),
    affiliateId: affiliate.affiliateId, customerId: customer.customerId,
    status: 'active', batchId: `BATCH-${uniq}`, claimedAt: new Date()
  });
  return { affiliate, customer, operator, bag, bagToken: token };
}

const mint = (bagToken, code) =>
  request(app).post('/api/v1/scan/session').send({ bagToken, code });
const applyWith = (token, bagToken, expectedAction, extra = {}) =>
  request(app).post('/api/v1/scan/apply')
    .set('x-scan-session', token).send({ bagToken, expectedAction, ...extra });

describe('customer-initiated start (phone/email)', () => {
  beforeAll(async () => { await SystemConfig.initializeDefaults(); });

  test('registered phone mints a customer scan session', async () => {
    const { bagToken } = await createWorld();
    const res = await mint(bagToken, '(512) 555-2222'); // formatted variant of the registered phone
    expect(res.status).toBe(200);
    expect(res.body.actorType).toBe('customer');
    expect(res.body.sessionToken).toBeTruthy();
  });

  test('registered email (any case) mints a customer scan session', async () => {
    const { bagToken, customer } = await createWorld();
    const res = await mint(bagToken, customer.email.toUpperCase());
    expect(res.status).toBe(200);
    expect(res.body.actorType).toBe('customer');
  });

  test('a non-matching phone/email is rejected (generic 401)', async () => {
    const { bagToken } = await createWorld();
    const res = await mint(bagToken, '5129999999');
    expect(res.status).toBe(401);
  });

  test('customer session opens a pending order, stamped role=customer', async () => {
    const { bagToken, bag } = await createWorld();
    const session = (await mint(bagToken, '5125552222')).body.sessionToken;
    const res = await applyWith(session, bagToken, 'create-pending');
    expect(res.status).toBe(200);
    expect(res.body.newStatus).toBe('pending');
    const order = await Order.findOne({ bagId: bag.bagId });
    expect(order.status).toBe('pending');
    expect(order.pickup.role).toBe('customer');
    expect(order.pickup.by).toBe(bag.customerId);
  });

  test('customer session CANNOT advance an open order (403)', async () => {
    const { bagToken } = await createWorld();
    // operator opens + advances to in_progress
    const opSession = (await mint(bagToken, OP_CODE)).body.sessionToken;
    await applyWith(opSession, bagToken, 'create-pending');
    await applyWith(opSession, bagToken, 'advance'); // -> in_progress

    const custSession = (await mint(bagToken, '5125552222')).body.sessionToken;
    const res = await applyWith(custSession, bagToken, 'advance');
    expect(res.status).toBe(403);
    expect(res.body.errors ? res.body.errors.code : res.body.code).toBe('customer_not_allowed');
  });

  test('customer session CAN confirm delivery (out_for_delivery → complete)', async () => {
    const { bagToken, bag } = await createWorld();
    // operator drives the order to out_for_delivery
    const op = (await mint(bagToken, OP_CODE)).body.sessionToken;
    await applyWith(op, bagToken, 'create-pending');
    await applyWith(op, bagToken, 'advance'); // -> in_progress
    // send-out now requires payment confirmation server-side (money gate)
    await applyWith(op, bagToken, 'advance', { paymentConfirmed: true }); // -> out_for_delivery
    // the registered bag owner scans + confirms delivery with their phone
    const cust = (await mint(bagToken, '5125552222')).body.sessionToken;
    const res = await applyWith(cust, bagToken, 'advance'); // out_for_delivery -> complete
    expect(res.status).toBe(200);
    expect(res.body.newStatus).toBe('complete');
    const order = await Order.findOne({ bagId: bag.bagId });
    expect(order.status).toBe('complete');
    expect(order.delivery.role).toBe('customer');
  });

  test('customer session CANNOT undo (403)', async () => {
    const { bagToken } = await createWorld();
    const custSession = (await mint(bagToken, '5125552222')).body.sessionToken;
    await applyWith(custSession, bagToken, 'create-pending');
    const res = await request(app).post('/api/v1/scan/undo')
      .set('x-scan-session', custSession).send({ bagToken });
    expect(res.status).toBe(403);
  });

  test('operator code still mints an operator session (precedence intact)', async () => {
    const { bagToken } = await createWorld();
    const res = await mint(bagToken, OP_CODE);
    expect(res.status).toBe(200);
    expect(res.body.actorType).toBe('operator');
  });

  test('a customer cannot start an order on a DIFFERENT customer’s bag', async () => {
    const a = await createWorld();
    const b = await createWorld();
    // custA's (unique) email against custB's bag → bound to bag B's customer → 401
    const cross = await mint(b.bagToken, a.customer.email);
    expect(cross.status).toBe(401);
    // sanity: custB's own email works on bag B
    const ok = await mint(b.bagToken, b.customer.email);
    expect(ok.status).toBe(200);
    expect(ok.body.actorType).toBe('customer');
  });

  test('email with surrounding whitespace still matches', async () => {
    const { bagToken, customer } = await createWorld();
    const res = await mint(bagToken, '   ' + customer.email + '   ');
    expect(res.status).toBe(200);
    expect(res.body.actorType).toBe('customer');
  });

  test('+1 country-code phone formats match (last 10 digits)', async () => {
    const { bagToken } = await createWorld();
    const res = await mint(bagToken, '+1 (512) 555-2222');
    expect(res.status).toBe(200);
    expect(res.body.actorType).toBe('customer');
  });

  test('blank / whitespace-only / short inputs are rejected (401)', async () => {
    const { bagToken } = await createWorld();
    expect((await mint(bagToken, '')).status).toBe(401);
    expect((await mint(bagToken, '   ')).status).toBe(401);
    expect((await mint(bagToken, '5555')).status).toBe(401); // < 10 digits: a short code never matches a phone
  });

  test('customer CANNOT reopen a just-completed order (delivery-rescan-prompt → 403)', async () => {
    const { bagToken } = await createWorld();
    // operator drives a full cycle to complete
    const op = (await mint(bagToken, OP_CODE)).body.sessionToken;
    await applyWith(op, bagToken, 'create-pending');
    await applyWith(op, bagToken, 'advance'); // in_progress
    await applyWith(op, bagToken, 'advance', { paymentConfirmed: true }); // out_for_delivery
    await applyWith(op, bagToken, 'advance'); // complete
    // within the reopen window a fresh scan resolves to delivery-rescan-prompt
    const cust = (await mint(bagToken, '5125552222')).body.sessionToken;
    const res = await applyWith(cust, bagToken, 'delivery-rescan-prompt', { reopen: true });
    expect(res.status).toBe(403);
    expect(res.body.errors ? res.body.errors.code : res.body.code).toBe('customer_not_allowed');
  });

  test('repeated bad customer contacts trigger lockout (429)', async () => {
    const { bagToken } = await createWorld();
    let last;
    for (let i = 0; i < 6; i++) {
      last = await mint(bagToken, `nomatch${i}@example.com`);
    }
    expect(last.status).toBe(429);
  });

  test('paymentConfirmed is ignored on a customer create-pending', async () => {
    const { bagToken, bag } = await createWorld();
    const cust = (await mint(bagToken, '5125552222')).body.sessionToken;
    const res = await applyWith(cust, bagToken, 'create-pending', { paymentConfirmed: true });
    expect(res.status).toBe(200);
    const order = await Order.findOne({ bagId: bag.bagId });
    expect(order.paymentConfirmedManually).toBe(false);
  });
});
