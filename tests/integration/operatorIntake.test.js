// Kiosk first-scan / intake path — now state-driven advance (spec §3).
//   no open order      -> create-pending
//   pending            -> in_progress (intake)
// /intake is an alias of /advance; operator role required.

jest.mock('../../server/utils/emailService');

const request = require('supertest');
const app = require('../../server');
const Operator = require('../../server/models/Operator');
const Administrator = require('../../server/models/Administrator');
const Order = require('../../server/models/Order');
const Customer = require('../../server/models/Customer');
const Affiliate = require('../../server/models/Affiliate');
const Bag = require('../../server/modules/bags/Bag');
const SystemConfig = require('../../server/models/SystemConfig');
const { getCsrfToken, createAgent } = require('../helpers/csrfHelper');
const { ensureTestAffiliate, ensureTestCustomer } = require('../helpers/v2TestHelpers');
const encryptionUtil = require('../../server/utils/encryption');

jest.setTimeout(90000);

describe('POST /api/v1/operators/intake (kiosk, state-driven advance)', () => {
  let operatorAgent, adminAgent;
  let operatorToken, operatorCsrfToken, adminToken, adminCsrfToken;
  let testAdmin, testOperator, affiliate, customer, bag;
  const TOKEN = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'; // 32 hex chars

  beforeAll(async () => { await SystemConfig.initializeDefaults(); });

  beforeEach(async () => {
    await Promise.all([
      Operator.deleteMany({}), Administrator.deleteMany({}), Order.deleteMany({}),
      Customer.deleteMany({}), Affiliate.deleteMany({}), Bag.deleteMany({})
    ]);

    operatorAgent = createAgent(app);
    adminAgent = createAgent(app);

    const { salt, hash } = encryptionUtil.hashPassword('CompletelyUniquePassword417!');
    testAdmin = await Administrator.create({
      adminId: 'ADMIN001', firstName: 'Super', lastName: 'User',
      email: 'superuser@laundromat.example', passwordSalt: salt, passwordHash: hash,
      permissions: ['all']
    });
    const adminLogin = await adminAgent
      .post('/api/v1/auth/administrator/login')
      .send({ email: 'superuser@laundromat.example', password: 'CompletelyUniquePassword417!' });
    adminToken = adminLogin.body.token;
    adminCsrfToken = await getCsrfToken(app, adminAgent);

    process.env.OPERATOR_PIN = '1234';
    process.env.DEFAULT_OPERATOR_ID = 'OPR001';
    testOperator = await Operator.create({
      operatorId: 'OPR001', firstName: 'Test', lastName: 'Operator',
      email: 'operator@laundromat.example', username: 'testoperator',
      password: 'OperatorStrongPassword951!',
      shiftStart: '00:00', shiftEnd: '23:59', createdBy: testAdmin._id
    });
    const operatorLogin = await operatorAgent
      .post('/api/v1/auth/operator/login')
      .send({ pinCode: '1234' });
    operatorToken = operatorLogin.body.token;
    operatorCsrfToken = await getCsrfToken(app, operatorAgent);

    affiliate = await ensureTestAffiliate();
    customer = await ensureTestCustomer({ affiliateId: affiliate.affiliateId });
    bag = await Bag.create({
      token: TOKEN, tokenHash: Bag.hashToken(TOKEN),
      affiliateId: affiliate.affiliateId, customerId: customer.customerId,
      status: 'active', batchId: 'BATCH-int'
    });
  });

  const intake = (token, body = {}) =>
    operatorAgent
      .post('/api/v1/operators/intake')
      .set('Authorization', `Bearer ${token}`)
      .set('x-csrf-token', operatorCsrfToken)
      .send({ bagToken: TOKEN, ...body });

  it('a bag with no open order -> create-pending', async () => {
    const res = await intake(operatorToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.action).toBe('create-pending');
    expect(res.body.order.status).toBe('pending');

    const saved = await Order.findOne({ orderId: res.body.order.orderId });
    expect(saved.bagId).toBe(bag.bagId);
    expect(saved.bagToken).toBe(TOKEN);
    expect(saved.pickup.by).toBe(String(testOperator._id));
  });

  it('a pending order -> in_progress (intake advance)', async () => {
    const first = await intake(operatorToken);
    expect(first.body.order.status).toBe('pending');

    const res = await intake(operatorToken);
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('advance');
    expect(res.body.order.status).toBe('in_progress');
    expect(await Order.countDocuments({})).toBe(1);
  });

  it('rejects without a CSRF token (403)', async () => {
    const res = await operatorAgent
      .post('/api/v1/operators/intake')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ bagToken: TOKEN });
    expect(res.status).toBe(403);
    expect(await Order.countDocuments({})).toBe(0);
  });

  it('rejects a non-operator role (403)', async () => {
    const res = await adminAgent
      .post('/api/v1/operators/intake')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-csrf-token', adminCsrfToken)
      .send({ bagToken: TOKEN });
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated requests (401)', async () => {
    const agent = createAgent(app);
    const csrf = await getCsrfToken(app, agent);
    const res = await agent
      .post('/api/v1/operators/intake')
      .set('x-csrf-token', csrf)
      .send({ bagToken: TOKEN });
    expect(res.status).toBe(401);
  });

  it('an unknown bag token -> 404 invalid_bag', async () => {
    const res = await operatorAgent
      .post('/api/v1/operators/intake')
      .set('Authorization', `Bearer ${operatorToken}`)
      .set('x-csrf-token', operatorCsrfToken)
      .send({ bagToken: 'a'.repeat(32) });
    expect(res.status).toBe(404);
    expect(res.body.errors.code).toBe('invalid_bag');
  });

  it('400 when bagToken is missing', async () => {
    const res = await operatorAgent
      .post('/api/v1/operators/intake')
      .set('Authorization', `Bearer ${operatorToken}`)
      .set('x-csrf-token', operatorCsrfToken)
      .send({});
    expect(res.status).toBe(400);
  });
});
