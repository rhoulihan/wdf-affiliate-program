jest.mock('../../server/utils/emailService');

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const Order = require('../../server/models/Order');
const Customer = require('../../server/models/Customer');
const Affiliate = require('../../server/models/Affiliate');
const Operator = require('../../server/models/Operator');
const Bag = require('../../server/modules/bags/Bag');
const SystemConfig = require('../../server/models/SystemConfig');
const encryptionUtil = require('../../server/utils/encryption');
const roleCodes = require('../../server/utils/roleCodes');
const { createTestToken } = require('../helpers/authHelper');

jest.setTimeout(60000);

const OP_CODE = 'OPCODE99';

async function createWorld() {
  const uniq = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const { salt, hash } = encryptionUtil.hashPassword('FixturePassword417!');

  const affiliate = await Affiliate.create({
    firstName: 'Fix', lastName: 'Affiliate', email: `fixaff${uniq}@example.com`,
    phone: '5125551111', businessName: 'Fixture Wash Co',
    address: '1 Fixture St', city: 'Austin', state: 'TX', zipCode: '78701',
    username: `fixaff${uniq}`, passwordSalt: salt, passwordHash: hash,
    paymentMethod: 'check', affiliateDeliveryCodeHash: roleCodes.hashCode('AFCD23')
  });
  const customer = await Customer.create({
    affiliateId: affiliate.affiliateId,
    firstName: 'Jane', lastName: 'Doe', email: `fixcust${uniq}@example.com`,
    phone: '5125552222', address: '2 Fixture St', city: 'Austin', state: 'TX', zipCode: '78702',
    username: `fixcust${uniq}`, passwordSalt: salt, passwordHash: hash
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
  // Operator kiosk JWT (no scan-session needed)
  const opJwt = createTestToken(String(operator._id), 'operator');
  return { affiliate, customer, operator, bag, bagToken: token, opJwt };
}

function authed(req, opJwt) {
  return req.set('Authorization', `Bearer ${opJwt}`);
}

describe('Scan resolve/apply lifecycle (operator kiosk JWT)', () => {
  beforeAll(async () => { await SystemConfig.initializeDefaults(); });

  test('send-out records the orderTotal the kiosk sends, and the fee snapshot', async () => {
    // The client used to drop orderTotal before it ever reached this endpoint
    // (ScanSession.apply omitted it from the payload), so Order.orderTotal — which
    // the admin revenue view reads — stayed undefined on every kiosk send-out.
    // This asserts the server half of that round trip by re-reading the document.
    const { bagToken, opJwt, affiliate } = await createWorld();
    await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken, expectedAction: 'create-pending' });
    await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken, expectedAction: 'advance' });

    const out = await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken, expectedAction: 'advance', paymentConfirmed: true, orderTotal: 42.5 });
    expect(out.status).toBe(200);
    expect(out.body.newStatus).toBe('out_for_delivery');

    const saved = await Order.findOne({ orderId: out.body.orderId });
    expect(saved.orderTotal).toBeCloseTo(42.5, 2);
    expect(saved.deliveryFeeCharged).toBeCloseTo(Number(affiliate.deliveryFee) || 0, 2);
  });

  test('an orderTotal of 0 is recorded, not treated as absent', async () => {
    const { bagToken, opJwt } = await createWorld();
    await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken, expectedAction: 'create-pending' });
    await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken, expectedAction: 'advance' });
    const out = await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken, expectedAction: 'advance', paymentConfirmed: true, orderTotal: 0 });

    const saved = await Order.findOne({ orderId: out.body.orderId });
    expect(saved.orderTotal).toBe(0);
  });

  test('send-out WITHOUT paymentConfirmed is rejected by the server', async () => {
    // operator-scan-init.js told the reader "the server also hard-rejects the
    // transition without it". It did not — the flag was merely stamped when truthy,
    // so the only thing standing between an unpaid order and send-out was a
    // disabled button in one UI. Any other caller walked straight through.
    const { bagToken, opJwt } = await createWorld();
    await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken, expectedAction: 'create-pending' });
    await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken, expectedAction: 'advance' });

    const out = await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken, expectedAction: 'advance', orderTotal: 20 });
    expect(out.status).toBe(400);

    const Order2 = require('../../server/models/Order');
    const still = await Order2.findOne({ codeToken: bagToken }) || await Order2.findOne({ bagToken });
    expect(still.status).toBe('in_progress');
    expect(still.orderTotal).toBeUndefined();
  });

  test('a negative orderTotal is rejected rather than stored', async () => {
    const { bagToken, opJwt } = await createWorld();
    await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken, expectedAction: 'create-pending' });
    await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken, expectedAction: 'advance' });
    const out = await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken, expectedAction: 'advance', paymentConfirmed: true, orderTotal: -5 });
    expect(out.status).toBe(400);
  });

  test('full lifecycle pickup -> intake -> store-pickup -> delivery', async () => {
    const { bagToken, customer, operator, opJwt } = await createWorld();

    // Scan 1: resolve -> create-pending
    let r = await authed(request(app).post('/api/v1/scan/resolve'), opJwt).send({ bagToken });
    expect(r.status).toBe(200);
    expect(r.body.proposedAction).toBe('create-pending');
    expect(r.body.requiresConfirm).toBe(true);
    expect(r.body.promptKey).toBe('scan.confirm.createPending');
    expect(r.body.customer.firstName).toBe('Jane'); // display-only for intake

    let a = await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken, expectedAction: 'create-pending' });
    expect(a.status).toBe(200);
    expect(a.body.newStatus).toBe('pending');
    expect(a.body.action).toBe('create-pending');
    const order = await Order.findOne({ orderId: a.body.orderId });
    expect(order.pickup.by).toBe(String(operator._id));
    expect(order.pickup.role).toBe('operator');

    // Scan 2: resolve -> advance in_progress
    r = await authed(request(app).post('/api/v1/scan/resolve'), opJwt).send({ bagToken });
    expect(r.body.proposedAction).toBe('advance');
    expect(r.body.to).toBe('in_progress');
    expect(r.body.promptKey).toBe('scan.confirm.advanceToInProgress');
    a = await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken, expectedAction: 'advance' });
    expect(a.body.newStatus).toBe('in_progress');

    // Scan 3: resolve -> advance out_for_delivery, payment confirm
    r = await authed(request(app).post('/api/v1/scan/resolve'), opJwt).send({ bagToken });
    expect(r.body.to).toBe('out_for_delivery');
    expect(r.body.promptKey).toBe('scan.confirm.advanceToOutForDelivery');
    a = await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken, expectedAction: 'advance', paymentConfirmed: true });
    expect(a.body.newStatus).toBe('out_for_delivery');
    const ofd = await Order.findOne({ orderId: a.body.orderId });
    expect(ofd.paymentConfirmedManually).toBe(true);

    // Scan 4: resolve -> advance complete
    r = await authed(request(app).post('/api/v1/scan/resolve'), opJwt).send({ bagToken });
    expect(r.body.to).toBe('complete');
    expect(r.body.promptKey).toBe('scan.confirm.advanceToComplete');
    a = await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken, expectedAction: 'advance' });
    expect(a.body.newStatus).toBe('complete');
    const done = await Order.findOne({ orderId: a.body.orderId });
    expect(done.completedAt).toBeTruthy();
  });

  test('unauthenticated scan/resolve -> 401', async () => {
    const { bagToken } = await createWorld();
    const r = await request(app).post('/api/v1/scan/resolve').send({ bagToken });
    expect(r.status).toBe(401);
  });

  test('double-scan: pickup re-scan on an open (pending) order -> advance (next step), not create', async () => {
    const { bagToken, opJwt } = await createWorld();
    await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken, expectedAction: 'create-pending' });
    const r = await authed(request(app).post('/api/v1/scan/resolve'), opJwt).send({ bagToken });
    expect(r.body.proposedAction).toBe('advance');
    expect(r.body.to).toBe('in_progress');
  });

  test('delivery re-scan within reopen window -> delivery-rescan-prompt; apply reopen:true -> new pending', async () => {
    const { bagToken, opJwt } = await createWorld();
    // Walk to complete
    await authed(request(app).post('/api/v1/scan/apply'), opJwt).send({ bagToken, expectedAction: 'create-pending' });
    await authed(request(app).post('/api/v1/scan/apply'), opJwt).send({ bagToken, expectedAction: 'advance' });
    await authed(request(app).post('/api/v1/scan/apply'), opJwt).send({ bagToken, expectedAction: 'advance', paymentConfirmed: true });
    const completed = await authed(request(app).post('/api/v1/scan/apply'), opJwt).send({ bagToken, expectedAction: 'advance' });
    const firstOrderId = completed.body.orderId;

    const r = await authed(request(app).post('/api/v1/scan/resolve'), opJwt).send({ bagToken });
    expect(r.body.proposedAction).toBe('delivery-rescan-prompt');
    expect(r.body.promptKey).toBe('scan.confirm.deliveryRescan');

    const a = await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken, expectedAction: 'delivery-rescan-prompt', reopen: true });
    expect(a.body.newStatus).toBe('pending');
    expect(a.body.orderId).not.toBe(firstOrderId);
  });

  test('delivery re-scan, apply reopen:false -> no-op', async () => {
    const { bagToken, opJwt } = await createWorld();
    await authed(request(app).post('/api/v1/scan/apply'), opJwt).send({ bagToken, expectedAction: 'create-pending' });
    await authed(request(app).post('/api/v1/scan/apply'), opJwt).send({ bagToken, expectedAction: 'advance' });
    await authed(request(app).post('/api/v1/scan/apply'), opJwt).send({ bagToken, expectedAction: 'advance', paymentConfirmed: true });
    await authed(request(app).post('/api/v1/scan/apply'), opJwt).send({ bagToken, expectedAction: 'advance' });

    const a = await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken, expectedAction: 'delivery-rescan-prompt', reopen: false });
    expect(a.status).toBe(200);
    expect(a.body.action).toBe('no-op');
    const open = await Order.countDocuments({ bagToken, status: { $in: ['pending', 'in_progress', 'out_for_delivery'] } });
    expect(open).toBe(0);
  });

  test('delivery re-scan beyond reopen window -> create-pending', async () => {
    const { bagToken, opJwt } = await createWorld();
    await authed(request(app).post('/api/v1/scan/apply'), opJwt).send({ bagToken, expectedAction: 'create-pending' });
    await authed(request(app).post('/api/v1/scan/apply'), opJwt).send({ bagToken, expectedAction: 'advance' });
    await authed(request(app).post('/api/v1/scan/apply'), opJwt).send({ bagToken, expectedAction: 'advance', paymentConfirmed: true });
    const done = await authed(request(app).post('/api/v1/scan/apply'), opJwt).send({ bagToken, expectedAction: 'advance' });

    // Backdate completedAt beyond the window (240 min default).
    await Order.updateOne({ orderId: done.body.orderId },
      { $set: { completedAt: new Date(Date.now() - 1000 * 60 * 60 * 24) } });

    const r = await authed(request(app).post('/api/v1/scan/resolve'), opJwt).send({ bagToken });
    expect(r.body.proposedAction).toBe('create-pending');
  });

  test('undo reverses the last transition', async () => {
    const { bagToken, opJwt } = await createWorld();
    await authed(request(app).post('/api/v1/scan/apply'), opJwt).send({ bagToken, expectedAction: 'create-pending' });
    await authed(request(app).post('/api/v1/scan/apply'), opJwt).send({ bagToken, expectedAction: 'advance' }); // in_progress

    const u = await authed(request(app).post('/api/v1/scan/undo'), opJwt).send({ bagToken });
    expect(u.status).toBe(200);
    const order = await Order.findOne({ bagToken });
    expect(order.status).toBe('pending');
  });

  test('apply without expectedAction -> 400 (drift guard cannot be bypassed)', async () => {
    const { bagToken, opJwt } = await createWorld();
    await authed(request(app).post('/api/v1/scan/resolve'), opJwt).send({ bagToken });
    const a = await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken }); // expectedAction omitted
    expect(a.status).toBe(400);
    expect(a.body.errors.code).toBe('expected_action_required');
    // No order was created despite a valid create-pending state.
    expect(await Order.countDocuments({ bagToken })).toBe(0);
  });

  test('state-drift: stale expectedAction -> 409 state_changed', async () => {
    const { bagToken, opJwt } = await createWorld();
    // resolve says create-pending; then someone applies, changing state.
    await authed(request(app).post('/api/v1/scan/resolve'), opJwt).send({ bagToken });
    await authed(request(app).post('/api/v1/scan/apply'), opJwt).send({ bagToken, expectedAction: 'create-pending' });
    // Now applying with the stale expectedAction (create-pending) is wrong; current is advance.
    const a = await authed(request(app).post('/api/v1/scan/apply'), opJwt)
      .send({ bagToken, expectedAction: 'create-pending' });
    expect(a.status).toBe(409);
    expect(a.body.errors.code).toBe('state_changed');
  });
});

describe('Scan endpoints with a scan-session token (field path)', () => {
  beforeAll(async () => { await SystemConfig.initializeDefaults(); });

  test('mint session with affiliate code, then resolve+apply with the session token', async () => {
    const { bagToken } = await createWorld();
    const sess = await request(app).post('/api/v1/scan/session').send({ bagToken, code: 'AFCD23' });
    expect(sess.status).toBe(200);
    const sessionToken = sess.body.sessionToken;

    const r = await request(app).post('/api/v1/scan/resolve')
      .set('x-scan-session', sessionToken).send({ bagToken });
    expect(r.status).toBe(200);
    expect(r.body.proposedAction).toBe('create-pending');

    const a = await request(app).post('/api/v1/scan/apply')
      .set('x-scan-session', sessionToken).send({ bagToken, expectedAction: 'create-pending' });
    expect(a.status).toBe(200);
    expect(a.body.newStatus).toBe('pending');
    const order = await Order.findOne({ orderId: a.body.orderId });
    expect(order.pickup.role).toBe('affiliate');
  });
});
