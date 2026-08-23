jest.mock('../../server/utils/emailService');

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const Operator = require('../../server/models/Operator');
const Administrator = require('../../server/models/Administrator');
const encryptionUtil = require('../../server/utils/encryption');
const roleCodes = require('../../server/utils/roleCodes');
const { getCsrfToken, createAgent } = require('../helpers/csrfHelper');

jest.setTimeout(60000);

describe('Operator scan code', () => {
  let adminAgent, adminCsrf, adminToken, admin;

  beforeEach(async () => {
    const { salt, hash } = encryptionUtil.hashPassword('CompletelyUniquePassword417!');
    admin = await Administrator.create({
      adminId: `ADM${Date.now()}`, firstName: 'Ops', lastName: 'Admin',
      email: `opsadmin${Date.now()}@laundromat.example`,
      passwordSalt: salt, passwordHash: hash, permissions: ['all']
    });
    adminAgent = createAgent(app);
    const login = await adminAgent
      .post('/api/v1/auth/administrator/login')
      .send({ email: admin.email, password: 'CompletelyUniquePassword417!' });
    adminToken = login.body.token;
    adminCsrf = await getCsrfToken(app, adminAgent);
  });

  test('scanCodeHmac carries a unique sparse index', () => {
    const path = Operator.schema.path('scanCodeHmac');
    expect(path).toBeTruthy();
    expect(path.options.unique).toBe(true);
    expect(path.options.sparse).toBe(true);
  });

  test('createOperator provisions scanCodeHmac and returns scanCode once', async () => {
    const res = await adminAgent
      .post('/api/v1/operators')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-csrf-token', adminCsrf)
      .send({
        firstName: 'Scan', lastName: 'Op',
        email: `scanop${Date.now()}@laundromat.example`,
        username: `scanop${Date.now()}`,
        password: 'StrongOperatorPass417!'
      });
    expect(res.status).toBe(201);
    expect(res.body.scanCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);

    const op = await Operator.findOne({ email: res.body.operator.email });
    expect(op.scanCodeHmac).toBe(roleCodes.hmacCode(res.body.scanCode));
    expect(op.scanCodeSetAt).toBeInstanceOf(Date);
  });

  test('POST /api/v1/operators/:operatorId/scan-code/reset regenerates (admin, CSRF)', async () => {
    const operator = await Operator.create({
      firstName: 'Reset', lastName: 'Op',
      email: `resetop${Date.now()}@laundromat.example`, username: `resetop${Date.now()}`,
      password: 'StrongOperatorPass417!', createdBy: admin._id,
      scanCodeHmac: roleCodes.hmacCode('OLDCODE9'), scanCodeSetAt: new Date(Date.now() - 1000)
    });

    const res = await adminAgent
      .post(`/api/v1/operators/${operator._id}/scan-code/reset`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-csrf-token', adminCsrf)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.scanCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);

    const reloaded = await Operator.findById(operator._id);
    expect(reloaded.scanCodeHmac).toBe(roleCodes.hmacCode(res.body.scanCode));
    expect(reloaded.scanCodeHmac).not.toBe(roleCodes.hmacCode('OLDCODE9'));
  });

  test('old reset-pin route is gone; scan-code reset rejects non-admin', async () => {
    const operator = await Operator.create({
      firstName: 'Rbac', lastName: 'Op',
      email: `rbacop${Date.now()}@laundromat.example`, username: `rbacop${Date.now()}`,
      password: 'StrongOperatorPass417!', createdBy: admin._id
    });

    const gone = await adminAgent
      .post(`/api/v1/operators/${operator._id}/reset-pin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-csrf-token', adminCsrf)
      .send({ newPassword: 'whatever417!' });
    expect(gone.status).toBe(404);

    const jwt = require('jsonwebtoken');
    const opToken = jwt.sign(
      { id: operator._id.toString(), role: 'operator' },
      process.env.JWT_SECRET, { expiresIn: '1h' }
    );
    const opAgent = createAgent(app);
    const opCsrf = await getCsrfToken(app, opAgent);
    const forbidden = await opAgent
      .post(`/api/v1/operators/${operator._id}/scan-code/reset`)
      .set('Authorization', `Bearer ${opToken}`)
      .set('x-csrf-token', opCsrf)
      .send({});
    expect(forbidden.status).toBe(403);
  });
});
