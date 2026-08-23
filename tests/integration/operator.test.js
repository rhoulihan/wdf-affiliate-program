const request = require('supertest');
const app = require('../../server');
const Operator = require('../../server/models/Operator');
const Administrator = require('../../server/models/Administrator');
const Order = require('../../server/models/Order');
const { getCsrfToken, createAgent } = require('../helpers/csrfHelper');
const mongoose = require('mongoose');
const encryptionUtil = require('../../server/utils/encryption');

// Set timeout for integration tests
jest.setTimeout(90000);

describe('Operator Integration Tests', () => {
  let agent;
  let adminAgent;
  let operatorAgent;
  let csrfToken;
  let adminCsrfToken;
  let operatorCsrfToken;
  let adminToken;
  let operatorToken;
  let testAdmin;
  let testOperator;

  // Set timeout for all tests in this suite
  jest.setTimeout(60000);

  beforeEach(async () => {
    // Mock cryptoWrapper for Operator model
    if (Operator._cryptoWrapper) {
      Operator._cryptoWrapper.randomBytes = jest.fn((size) => {
        const buffer = Buffer.alloc(size);
        buffer.fill(0x61); // Fill with 'a'
        return buffer;
      });
    }
    
    // Clear database
    await Operator.deleteMany({});
    await Administrator.deleteMany({});
    await Order.deleteMany({});

    // Create agents with session support
    agent = createAgent(app);
    adminAgent = createAgent(app);
    operatorAgent = createAgent(app);

    // Get CSRF tokens for each agent
    csrfToken = await getCsrfToken(app, agent);

    // Create test administrator
    const { salt, hash } = encryptionUtil.hashPassword('CompletelyUniquePassword417!');
    testAdmin = await Administrator.create({
      adminId: 'ADMIN001',
      firstName: 'Super',
      lastName: 'User',
      email: 'superuser@laundromat.example',
      passwordSalt: salt,
      passwordHash: hash,
      permissions: ['all']
    });

    // Login as admin
    const adminLogin = await adminAgent
      .post('/api/v1/auth/administrator/login')
      .send({
        email: 'superuser@laundromat.example',
        password: 'CompletelyUniquePassword417!'
      });

    adminToken = adminLogin.body.token;

    // Get CSRF token for admin agent
    adminCsrfToken = await getCsrfToken(app, adminAgent);

    // Set up operator PIN in environment
    process.env.OPERATOR_PIN = '1234';
    process.env.DEFAULT_OPERATOR_ID = 'OPR001';
    
    // Create test operator (with 24/7 availability for testing)
    testOperator = await Operator.create({
      operatorId: 'OPR001',
      firstName: 'Test',
      lastName: 'Operator',
      email: 'operator@laundromat.example',
      username: 'testoperator',
      password: 'OperatorStrongPassword951!',
      shiftStart: '00:00',
      shiftEnd: '23:59',
      createdBy: testAdmin._id
    });

    // Login as operator using PIN
    const operatorLogin = await operatorAgent
      .post('/api/v1/auth/operator/login')
      .send({
        pinCode: '1234'
      });

    operatorToken = operatorLogin.body.token;

    // Get CSRF token for operator agent
    operatorCsrfToken = await getCsrfToken(app, operatorAgent);
  });

  afterEach(async () => {
    // Clean up any hanging connections or sessions
    if (agent) agent = null;
    if (adminAgent) adminAgent = null;
    if (operatorAgent) operatorAgent = null;
  });

  afterAll(async () => {
    // Close any server connections if needed
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('GET /api/v1/operators', () => {
    it('should get all operators with admin token', async () => {
      // Create additional operators
      await Operator.create([
        {
          operatorId: 'OPR002',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@laundromat.example',
          username: 'johndoe',
          password: 'StrongPassword951!',
          shiftStart: '09:00',
          shiftEnd: '18:00',
          currentOrderCount: 3,
          createdBy: testAdmin._id
        },
        {
          operatorId: 'OPR003',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@laundromat.example',
          username: 'janesmith',
          password: 'StrongPassword951!',
          isActive: false,
          createdBy: testAdmin._id
        }
      ]);

      const response = await adminAgent
        .get('/api/v1/operators')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.operators).toHaveLength(3);
      expect(response.body.operators[0]).toMatchObject({
        operatorId: expect.any(String),
        firstName: expect.any(String),
        lastName: expect.any(String),
        email: expect.any(String),
        role: 'operator'
      });
      expect(response.body.operators[0].password).toBeUndefined();
    });

    it('should filter by active status', async () => {
      await Operator.create({
        operatorId: 'OPR002',
        firstName: 'Inactive',
        lastName: 'Operator',
        email: 'inactive@laundromat.example',
        username: 'inactiveop',
        password: 'StrongPassword951!',
        isActive: false,
        createdBy: testAdmin._id
      });

      const response = await adminAgent
        .get('/api/v1/operators?active=true')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken);

      expect(response.status).toBe(200);
      expect(response.body.operators).toHaveLength(1);
      expect(response.body.operators[0].isActive).toBe(true);
    });


    it('should filter by on-shift status', async () => {
      // Get current time to create realistic shift schedules
      const now = new Date();
      const currentHour = now.getHours();

      // Create an operator with a shift that's currently off (3 hours ahead and 3 hours behind)
      const offShiftStart = String((currentHour + 3) % 24).padStart(2, '0') + ':00';
      const offShiftEnd = String((currentHour + 8) % 24).padStart(2, '0') + ':00';

      await Operator.create({
        operatorId: 'OPR002',
        firstName: 'Off Shift',
        lastName: 'Operator',
        email: 'offshift@laundromat.example',
        username: 'offshiftop',
        password: 'StrongPassword951!',
        shiftStart: offShiftStart,
        shiftEnd: offShiftEnd,
        createdBy: testAdmin._id
      });

      // testOperator has 24/7 availability (00:00 to 23:59), so it should always be on shift
      const response = await adminAgent
        .get('/api/v1/operators?onShift=true')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken);

      expect(response.status).toBe(200);
      expect(response.body.operators).toHaveLength(1);
      expect(response.body.operators[0].operatorId).toBe('OPR001');
    });

    it('should support pagination', async () => {
      // Create 15 operators
      const operators = [];
      for (let i = 1; i <= 15; i++) {
        operators.push({
          operatorId: `OPR${String(i).padStart(3, '0')}`,
          firstName: `Op${i}`,
          lastName: 'Test',
          email: `op${i}@laundromat.example`,
          username: `op${i}test`,
          password: 'StrongPassword951!',
          createdBy: testAdmin._id,
          createdAt: new Date(Date.now() - i * 60000)
        });
      }
      await Operator.deleteMany({}); // Clear existing
      await Operator.create(operators);

      const response = await adminAgent
        .get('/api/v1/operators?page=2&limit=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken);

      expect(response.status).toBe(200);
      expect(response.body.operators).toHaveLength(5);
      expect(response.body.pagination).toMatchObject({
        currentPage: 2,
        totalPages: 3,
        totalItems: 15,
        itemsPerPage: 5
      });
    });

    it('should require authentication', async () => {
      const response = await agent
        .get('/api/v1/operators');

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('No token provided');
    });

    it('should require operator management permissions', async () => {
      // Create limited admin
      const { salt: limitedSalt, hash: limitedHash } = encryptionUtil.hashPassword('StrongPassword951!');
      const limitedAdmin = await Administrator.create({
        adminId: 'LIMITED001',
        firstName: 'Limited',
        lastName: 'Admin',
        email: 'limited@laundromat.example',
        passwordSalt: limitedSalt,
        passwordHash: limitedHash,
        permissions: ['customers.read'] // No operator permissions
      });

      const limitedLogin = await agent
        .post('/api/v1/auth/administrator/login')
        .send({
          email: 'limited@laundromat.example',
          password: 'StrongPassword951!'
        });

      const response = await agent
        .get('/api/v1/operators')
        .set('Authorization', `Bearer ${limitedLogin.body.token}`)
        .set('x-csrf-token', csrfToken);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('permission required');
    });
  });

  describe('GET /api/v1/operators/:id', () => {
    it('should get operator by ID', async () => {
      const operator = await Operator.create({
        operatorId: 'OPR002',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        username: 'johndoe2',
        password: 'StrongPassword951!',
        shiftStart: '09:00',
        shiftEnd: '18:00',
        totalOrdersProcessed: 150,
        averageProcessingTime: 25.5,
        qualityScore: 95,
        createdBy: testAdmin._id
      });

      const response = await adminAgent
        .get(`/api/v1/administrators/operators/${operator._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.operator).toMatchObject({
        operatorId: 'OPR002',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        totalOrdersProcessed: 150,
        averageProcessingTime: 25.5,
        qualityScore: 95
      });
    });

    it('should allow operators to view their own profile', async () => {
      const response = await operatorAgent
        .get(`/api/v1/operators/${testOperator._id}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('x-csrf-token', operatorCsrfToken);

      expect(response.status).toBe(200);
      expect(response.body.operator.operatorId).toBe('OPR001');
    });

    it('should prevent operators from viewing other operators', async () => {
      const otherOperator = await Operator.create({
        operatorId: 'OPR002',
        firstName: 'Other',
        lastName: 'Operator',
        email: 'other@laundromat.example',
        username: 'otherop',
        password: 'StrongPassword951!',
        createdBy: testAdmin._id
      });

      const response = await operatorAgent
        .get(`/api/v1/operators/${otherOperator._id}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('x-csrf-token', operatorCsrfToken);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Access denied');
    });

    it('should return 404 for non-existent operator', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await adminAgent
        .get(`/api/v1/operators/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken);

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Operator not found');
    });
  });

  describe('POST /api/v1/operators', () => {
    it('should create new operator', async () => {
      const newOperator = {
        firstName: 'New',
        lastName: 'Operator',
        email: 'newop@laundromat.example',
        username: 'newoperator',
        password: 'NewPassw0rd!',
        shiftStart: '00:00',
        shiftEnd: '23:59'
      };

      const response = await adminAgent
        .post('/api/v1/operators')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken)
        .send(newOperator);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.operator).toMatchObject({
        operatorId: expect.stringMatching(/^OPR/),
        firstName: 'New',
        lastName: 'Operator',
        email: 'newop@laundromat.example',
        shiftStart: '00:00',
        shiftEnd: '23:59',
        isActive: true,
        currentOrderCount: 0,
        totalOrdersProcessed: 0,
        averageProcessingTime: 0,
        qualityScore: 100,
        createdBy: testAdmin._id.toString()
      });

      // Verify operator was created successfully
      const createdOperator = await Operator.findOne({ email: 'newop@laundromat.example' });
      expect(createdOperator).toBeDefined();
      expect(createdOperator.operatorId).toMatch(/^OPR/);
    });

    it('should validate required fields', async () => {
      const response = await adminAgent
        .post('/api/v1/operators')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          firstName: 'Test'
          // Missing required fields
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/required|validation/i);
    });

    it('should validate email format', async () => {
      const response = await adminAgent
        .post('/api/v1/operators')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          firstName: 'Test',
          lastName: 'Operator',
          email: 'invalid-email',
          password: 'StrongPassword951!'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Valid email is required');
    });

    it('should validate shift time format', async () => {
      const response = await adminAgent
        .post('/api/v1/operators')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          firstName: 'Test',
          lastName: 'Operator',
          email: 'test@laundromat.example',
          password: 'Passw0rdStr0ng!',
          shiftStart: '25:00' // Invalid time
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Valid time format');
    });

    it('should prevent duplicate emails', async () => {
      const response = await adminAgent
        .post('/api/v1/operators')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          firstName: 'Duplicate',
          lastName: 'Operator',
          email: 'operator@laundromat.example', // Already exists
          password: 'Passw0rdStr0ng!'
        });

      expect(response.status).toBe(409);
      expect(response.body.message).toContain('Email already exists');
    });

    it('should require operators.manage permission', async () => {
      // Create limited admin
      const { salt: limitedSalt2, hash: limitedHash2 } = encryptionUtil.hashPassword('StrongPassword951!');
      const limitedAdmin = await Administrator.create({
        adminId: 'LIMITED002',
        firstName: 'Limited',
        lastName: 'Admin',
        email: 'limited2@laundromat.example',
        passwordSalt: limitedSalt2,
        passwordHash: limitedHash2,
        permissions: ['customers.manage'] // No operator permissions
      });

      const limitedLogin = await agent
        .post('/api/v1/auth/administrator/login')
        .send({
          email: 'limited2@laundromat.example',
          password: 'StrongPassword951!'
        });

      const response = await agent
        .post('/api/v1/operators')
        .set('Authorization', `Bearer ${limitedLogin.body.token}`)
        .set('x-csrf-token', csrfToken)
        .send({
          firstName: 'New',
          lastName: 'Operator',
          email: 'new@laundromat.example',
          password: 'StrongPassword951!'
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('permission required');
    });
  });

  describe('PATCH /api/v1/operators/:id', () => {
    let targetOperator;

    beforeEach(async () => {
      targetOperator = await Operator.create({
        operatorId: 'TARGET001',
        firstName: 'Target',
        lastName: 'Operator',
        email: 'target@laundromat.example',
        username: 'targetop',
        password: 'StrongPassword951!',
        shiftStart: '00:00',
        shiftEnd: '23:59',
        createdBy: testAdmin._id
      });
    });

    it('should update operator details', async () => {
      const response = await adminAgent
        .patch(`/api/v1/operators/${targetOperator._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          firstName: 'Updated',
          lastName: 'Name',
          shiftStart: '10:00',
          shiftEnd: '18:00'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.operator).toMatchObject({
        operatorId: 'TARGET001',
        firstName: 'Updated',
        lastName: 'Name',
        shiftStart: '10:00',
        shiftEnd: '18:00'
      });
    });

    it('should update password', async () => {
      const response = await adminAgent
        .patch(`/api/v1/operators/${targetOperator._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          password: 'NewStrongPassword951!'
        });

      expect(response.status).toBe(200);

      // Verify password was updated
      expect(response.body.operator).toBeDefined();
      // The response should confirm the update
      expect(response.body.success).toBe(true);
    });

    it('should deactivate operator', async () => {
      const response = await adminAgent
        .patch(`/api/v1/operators/${targetOperator._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          isActive: false
        });

      expect(response.status).toBe(200);
      expect(response.body.operator.isActive).toBe(false);

      // Verify operator is deactivated in database
      const deactivatedOperator = await Operator.findById(targetOperator._id);
      expect(deactivatedOperator.isActive).toBe(false);
    });

    it('should allow operators to update their own profile (limited fields)', async () => {
      // Use the already logged in operator token from setup
      // Create a new operator to test profile update
      const newOp = await Operator.create({
        operatorId: 'OPR-PROFILE-TEST',
        firstName: 'Profile',
        lastName: 'Test',
        email: 'profiletest@laundromat.example',
        username: 'profiletest',
        password: 'ProfileTest951!',
        createdBy: testAdmin._id
      });
      
      // Create a token for this operator
      const jwt = require('jsonwebtoken');
      const targetToken = jwt.sign(
        { id: newOp._id, role: 'operator' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      const response = await agent
        .patch(`/api/v1/operators/${newOp._id}`)
        .set('Authorization', `Bearer ${targetToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          firstName: 'MyNew',
          lastName: 'Name',
          password: 'MyNewPass417!'
        });

      expect(response.status).toBe(200);
      expect(response.body.operator.firstName).toBe('MyNew');
      expect(response.body.operator.lastName).toBe('Name');
    });

    it('should prevent operators from changing their own work station', async () => {
      // Record original work station
      const originalWorkStation = targetOperator.workStation || 'STATION-01';
      
      const response = await operatorAgent
        .patch(`/api/v1/operators/${testOperator._id}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('x-csrf-token', operatorCsrfToken)
        .send({
          workStation: 'STATION-02' // Try to change work station
        });

      expect(response.status).toBe(200);
      // Verify work station was not changed
      const unchangedOp = await Operator.findById(testOperator._id);
      expect(unchangedOp.workStation).not.toBe('STATION-02');
    });

    it('should not allow updating operatorId', async () => {
      const response = await adminAgent
        .patch(`/api/v1/operators/${targetOperator._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          operatorId: 'CHANGED001'
        });

      expect(response.status).toBe(200);
      expect(response.body.operator.operatorId).toBe('TARGET001'); // Unchanged
    });

    it('should validate email uniqueness on update', async () => {
      const response = await adminAgent
        .patch(`/api/v1/operators/${targetOperator._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          email: 'operator@laundromat.example' // Already exists
        });

      expect(response.status).toBe(409);
      expect(response.body.message).toContain('Email already exists');
    });
  });

  describe('DELETE /api/v1/operators/:id', () => {
    let targetOperator;

    beforeEach(async () => {
      targetOperator = await Operator.create({
        operatorId: 'DELETE001',
        firstName: 'Delete',
        lastName: 'Me',
        email: 'delete@laundromat.example',
        username: 'deleteme',
        password: 'StrongPassword951!',
        createdBy: testAdmin._id
      });
    });

    it('should delete operator', async () => {
      const response = await adminAgent
        .delete(`/api/v1/operators/${targetOperator._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Operator deleted successfully');

      // Verify operator is deleted
      const checkOperator = await Operator.findById(targetOperator._id);
      expect(checkOperator).toBeNull();
    });

    it('should prevent deleting operator with active orders', async () => {
      // Update operator to have active orders
      targetOperator.currentOrderCount = 5;
      await targetOperator.save();

      const response = await adminAgent
        .delete(`/api/v1/operators/${targetOperator._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Cannot delete operator with active orders');
    });

    it('should require operators.manage permission', async () => {
      // Create limited admin
      const { salt: limitedSalt3, hash: limitedHash3 } = encryptionUtil.hashPassword('StrongPassword951!');
      const limitedAdmin = await Administrator.create({
        adminId: 'LIMITED003',
        firstName: 'Limited',
        lastName: 'Admin',
        email: 'limited3@laundromat.example',
        passwordSalt: limitedSalt3,
        passwordHash: limitedHash3,
        permissions: ['customers.manage'] // No operator permissions
      });

      const limitedLogin = await agent
        .post('/api/v1/auth/administrator/login')
        .send({
          email: 'limited3@laundromat.example',
          password: 'StrongPassword951!'
        });

      const response = await agent
        .delete(`/api/v1/operators/${targetOperator._id}`)
        .set('Authorization', `Bearer ${limitedLogin.body.token}`)
        .set('x-csrf-token', csrfToken);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('permission required');
    });

    it('should handle non-existent operator', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await adminAgent
        .delete(`/api/v1/operators/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken);

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Operator not found');
    });
  });

  describe('POST /api/v1/operators/:operatorId/scan-code/reset', () => {
    let targetOperator;

    beforeEach(async () => {
      targetOperator = await Operator.create({
        operatorId: 'PIN001',
        firstName: 'Pin',
        lastName: 'Reset',
        email: 'pinreset@laundromat.example',
        username: 'pinreset',
        password: 'StrongPassword951!',
        createdBy: testAdmin._id
      });
    });

    it('should reset the operator scan code and return it once', async () => {
      const response = await adminAgent
        .post(`/api/v1/operators/${targetOperator._id}/scan-code/reset`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Scan code reset successfully');
      expect(response.body.scanCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    });

    it('should persist a new scanCodeHmac matching the returned code', async () => {
      const response = await adminAgent
        .post(`/api/v1/operators/${targetOperator._id}/scan-code/reset`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken)
        .send({});

      expect(response.status).toBe(200);

      const roleCodes = require('../../server/utils/roleCodes');
      const updatedOperator = await Operator.findById(targetOperator._id);
      expect(updatedOperator.scanCodeHmac).toBe(roleCodes.hmacCode(response.body.scanCode));
      expect(updatedOperator.scanCodeSetAt).toBeInstanceOf(Date);
    });
  });

  describe('GET /api/v1/operators/available', () => {
    beforeEach(async () => {
      // Create operators with different order counts
      await Operator.create([
        {
          operatorId: 'AVAIL001',
          firstName: 'Available1',
          lastName: 'Op',
          email: 'avail1@laundromat.example',
          username: 'avail1op',
          password: 'StrongPassword951!',
          currentOrderCount: 2,
          createdBy: testAdmin._id
        },
        {
          operatorId: 'AVAIL002',
          firstName: 'Available2',
          lastName: 'Op',
          email: 'avail2@laundromat.example',
          username: 'avail2op',
          password: 'StrongPassword951!',
          currentOrderCount: 5,
          createdBy: testAdmin._id
        },
        {
          operatorId: 'BUSY001',
          firstName: 'Busy',
          lastName: 'Op',
          email: 'busy@laundromat.example',
          username: 'busyop',
          password: 'StrongPassword951!',
          currentOrderCount: 12, // Over limit
          createdBy: testAdmin._id
        },
        {
          operatorId: 'INACTIVE001',
          firstName: 'Inactive',
          lastName: 'Op',
          email: 'inactive@laundromat.example',
          username: 'inactiveop2',
          password: 'StrongPassword951!',
          currentOrderCount: 0,
          isActive: false,
          createdBy: testAdmin._id
        }
      ]);
    });

    it('should get available operators sorted by order count', async () => {
      const response = await adminAgent
        .get('/api/v1/operators/available')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.operators).toHaveLength(3); // Excludes busy and inactive
      expect(response.body.operators[0].currentOrderCount).toBe(0); // testOperator
      expect(response.body.operators[1].currentOrderCount).toBe(2);
      expect(response.body.operators[2].currentOrderCount).toBe(5);
    });

    it('should respect limit parameter', async () => {
      const response = await adminAgent
        .get('/api/v1/operators/available?limit=2')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken);

      expect(response.status).toBe(200);
      expect(response.body.operators).toHaveLength(2);
    });

    it('should only include active operators', async () => {
      const response = await adminAgent
        .get('/api/v1/operators/available')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken);

      expect(response.status).toBe(200);
      expect(response.body.operators.every(op => op.isActive === true)).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await agent
        .get('/api/v1/operators/available');

      expect(response.status).toBe(401);
    });
  });

  describe('PATCH /api/v1/operators/:id/stats', () => {
    let targetOperator;

    beforeEach(async () => {
      targetOperator = await Operator.create({
        operatorId: 'STATS001',
        firstName: 'Stats',
        lastName: 'Operator',
        email: 'stats@laundromat.example',
        username: 'statsop',
        password: 'StrongPassword951!',
        totalOrdersProcessed: 10,
        averageProcessingTime: 20,
        qualityScore: 90,
        createdBy: testAdmin._id
      });
    });

    it('should update processing statistics', async () => {
      const response = await adminAgent
        .patch(`/api/v1/operators/${targetOperator._id}/stats`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          processingTime: 30
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.operator.totalOrdersProcessed).toBe(11);
      // Average should be (20 * 10 + 30) / 11 ≈ 20.91
      expect(response.body.operator.averageProcessingTime).toBeCloseTo(20.91, 1);
    });

    it('should update quality score', async () => {
      const response = await adminAgent
        .patch(`/api/v1/operators/${targetOperator._id}/stats`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          qualityPassed: false
        });

      expect(response.status).toBe(200);
      // Score should decrease: 90 * 0.9 + 0 * 0.1 = 81
      expect(response.body.operator.qualityScore).toBeCloseTo(81, 1);
    });

    it('should update both stats in one call', async () => {
      const response = await adminAgent
        .patch(`/api/v1/operators/${targetOperator._id}/stats`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          processingTime: 15,
          qualityPassed: true
        });

      expect(response.status).toBe(200);
      expect(response.body.operator.totalOrdersProcessed).toBe(11);
      expect(response.body.operator.averageProcessingTime).toBeCloseTo(19.55, 1);
      expect(response.body.operator.qualityScore).toBeCloseTo(91, 1);
    });

    it('should validate processingTime is positive', async () => {
      const response = await adminAgent
        .patch(`/api/v1/operators/${targetOperator._id}/stats`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', adminCsrfToken)
        .send({
          processingTime: -10
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Processing time must be positive');
    });
  });
});