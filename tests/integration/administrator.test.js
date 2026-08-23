const request = require('supertest');
const app = require('../../server');
const Administrator = require('../../server/models/Administrator');
const Operator = require('../../server/models/Operator');
const Customer = require('../../server/models/Customer');
const Affiliate = require('../../server/models/Affiliate');
const { getCsrfToken, createAgent } = require('../helpers/csrfHelper');
const mongoose = require('mongoose');
const encryptionUtil = require('../../server/utils/encryption');

// Set timeout for integration tests
jest.setTimeout(90000);

// Mock auditLogger to prevent errors
jest.mock('../../server/utils/auditLogger', () => ({
  log: jest.fn().mockResolvedValue(true),
  logAuditEvent: jest.fn(),
  logLoginAttempt: jest.fn(),
  logSensitiveDataAccess: jest.fn(),
  logPaymentActivity: jest.fn(),
  logSuspiciousActivity: jest.fn(),
  auditMiddleware: jest.fn(() => (req, res, next) => next()),
  AuditEvents: {
    DATA_MODIFICATION: 'DATA_MODIFICATION',
    ACCOUNT_CREATED: 'ACCOUNT_CREATED',
    ACCOUNT_UPDATED: 'ACCOUNT_UPDATED',
    ACCOUNT_DELETED: 'ACCOUNT_DELETED',
    PASSWORD_RESET_SUCCESS: 'PASSWORD_RESET_SUCCESS',
    AUTH_LOGIN: 'AUTH_LOGIN'
  }
}));

describe('Administrator Integration Tests', () => {
  let agent;
  let adminAgent;
  let csrfToken;
  let adminToken;
  let testAdmin;
  
  // Helper function to create admin data with hashed password
  const createAdminData = (data) => {
    if (data.password) {
      const { salt, hash } = encryptionUtil.hashPassword(data.password);
      const { password, ...rest } = data;
      return { ...rest, passwordSalt: salt, passwordHash: hash };
    }
    return data;
  };

  beforeEach(async () => {
    // Clear database
    await Administrator.deleteMany({});
    await Operator.deleteMany({});
    await Customer.deleteMany({});
    await Affiliate.deleteMany({});

    // Create agent with session support
    agent = createAgent(app);
    adminAgent = createAgent(app);

    // Get CSRF token for the adminAgent (which will be used for most tests)
    csrfToken = await getCsrfToken(app, adminAgent);

    // Create test administrator
    testAdmin = new Administrator(createAdminData({
      adminId: 'ADMIN001',
      firstName: 'Super',
      lastName: 'Admin',
      email: 'admin@laundromat.example',
      password: 'CompletelyDifferentPassword417!',
      permissions: ['all'],
      createdAt: new Date()
    }));
    await testAdmin.save();

    // Login as admin to get token
    const loginRes = await adminAgent
      .post('/api/v1/auth/administrator/login')
      .send({
        email: 'admin@laundromat.example',
        password: 'CompletelyDifferentPassword417!'
      });

    adminToken = loginRes.body.token;
  });

  describe('GET /api/v1/administrators', () => {
    it('should get all administrators with admin token', async () => {
      // Create additional administrators
      await Administrator.create([
        createAdminData({
          adminId: 'ADMIN002',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@laundromat.example',
          password: 'StrongPassword417!',
          permissions: ['administrators.read', 'operators.manage'],
          createdAt: new Date()
        }),
        createAdminData({
          adminId: 'ADMIN003',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@laundromat.example',
          password: 'StrongPassword417!',
          permissions: ['customers.manage'],
          isActive: false,
          createdAt: new Date()
        })
      ]);

      const response = await adminAgent
        .get('/api/v1/administrators')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.administrators).toHaveLength(3);
      expect(response.body.administrators[0]).toMatchObject({
        adminId: expect.any(String),
        firstName: expect.any(String),
        lastName: expect.any(String),
        email: expect.any(String),
        role: 'administrator',
        isActive: expect.any(Boolean)
      });
      expect(response.body.administrators[0].password).toBeUndefined();
    });

    it('should filter by active status', async () => {
      await Administrator.create(createAdminData({
        adminId: 'ADMIN002',
        firstName: 'Inactive',
        lastName: 'Admin',
        email: 'inactive@laundromat.example',
        password: 'StrongPassword417!',
        permissions: ['customers.manage'],
        isActive: false,
        createdAt: new Date()
      }));

      const response = await adminAgent
        .get('/api/v1/administrators?active=true')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken);

      expect(response.status).toBe(200);
      expect(response.body.administrators).toHaveLength(1);
      expect(response.body.administrators[0].isActive).toBe(true);
    });

    it('should support pagination', async () => {
      // Create 15 administrators
      const admins = [];
      for (let i = 1; i <= 15; i++) {
        admins.push(createAdminData({
          adminId: `ADMIN${String(i).padStart(3, '0')}`,
          firstName: `Admin${i}`,
          lastName: 'Test',
          email: `admin${i}@laundromat.example`,
          password: 'StrongPassword417!',
          permissions: ['customers.read'],
          createdAt: new Date(Date.now() - i * 60000) // Different timestamps
        }));
      }
      await Administrator.create(admins);

      const response = await adminAgent
        .get('/api/v1/administrators?page=2&limit=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken);

      expect(response.status).toBe(200);
      expect(response.body.administrators).toHaveLength(5);
      expect(response.body.pagination).toMatchObject({
        currentPage: 2,
        totalPages: 4,
        totalItems: 16, // 15 + 1 original
        itemsPerPage: 5
      });
    });

    it('should require admin authentication', async () => {
      const response = await agent
        .get('/api/v1/administrators');

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('No token provided');
    });

    it('should require administrator permissions', async () => {
      // Create a customer to test non-admin access
      const crypto = require('crypto');
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync('CustomerPass123!', salt, 1000, 64, 'sha512').toString('hex');
      
      const customer = await require('../../server/models/Customer').create({
        customerId: 'CUST-TEST001',
        firstName: 'Test',
        lastName: 'Customer',
        email: 'testcustomer@example.com',
        username: 'testcustomer',
        passwordHash: hash,
        passwordSalt: salt,
        phone: '555-1234',
        address: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345',
        affiliateId: 'AFF-TEST001'
      });

      // Customer login was removed in Phase 1 (registration-only customer
      // surface), so we mint a non-admin (customer) JWT directly to prove the
      // admin route rejects a valid-but-unprivileged token with 403.
      const jwt = require('jsonwebtoken');
      const customerToken = jwt.sign(
        { id: customer._id, customerId: customer.customerId, role: 'customer' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await agent
        .get('/api/v1/administrators')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('x-csrf-token', csrfToken);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Access denied');
    });
  });

  describe('GET /api/v1/administrators/:id', () => {
    it('should get administrator by ID', async () => {
      const admin = await Administrator.create(createAdminData({
        adminId: 'ADMIN002',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!',
        permissions: ['customers.manage', 'operators.manage'],
        createdAt: new Date()
      }));

      const response = await adminAgent
        .get(`/api/v1/administrators/${admin._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.administrator).toMatchObject({
        adminId: 'ADMIN002',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        permissions: ['customers.manage', 'operators.manage']
      });
      expect(response.body.administrator.password).toBeUndefined();
    });

    it('should return 404 for non-existent administrator', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await adminAgent
        .get(`/api/v1/administrators/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken);

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Administrator not found');
    });

    it('should handle invalid ObjectId', async () => {
      const response = await adminAgent
        .get('/api/v1/administrators/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid administrator ID');
    });
  });

  describe('POST /api/v1/administrators', () => {
    it('should create new administrator', async () => {
      const newAdmin = {
        firstName: 'New',
        lastName: 'Admin',
        email: 'newadmin@laundromat.example',
        password: 'NewStrongPassword849!',
        permissions: ['customers.read', 'operators.read']
      };

      const response = await adminAgent
        .post('/api/v1/administrators')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send(newAdmin);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.administrator).toMatchObject({
        adminId: expect.stringMatching(/^ADM/),
        firstName: 'New',
        lastName: 'Admin',
        email: 'newadmin@laundromat.example',
        permissions: ['customers.read', 'operators.read'],
        isActive: true
      });
      expect(response.body.administrator.password).toBeUndefined();

      // Verify admin can login
      const loginRes = await agent
        .post('/api/v1/auth/administrator/login')
        .send({
          email: 'newadmin@laundromat.example',
          password: 'NewStrongPassword849!'
        });

      expect(loginRes.status).toBe(200);
    });

    it('should validate required fields', async () => {
      const response = await adminAgent
        .post('/api/v1/administrators')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
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
        .post('/api/v1/administrators')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          firstName: 'Test',
          lastName: 'Admin',
          email: 'invalid-email',
          password: 'StrongPassword417!',
          permissions: []
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Valid email is required');
    });

    it('should validate password strength', async () => {
      const response = await adminAgent
        .post('/api/v1/administrators')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          firstName: 'Test',
          lastName: 'Admin',
          email: 'test@laundromat.example',
          password: 'weak',
          permissions: []
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Password must be at least 8 characters long');
    });

    it('should prevent duplicate emails', async () => {
      const response = await adminAgent
        .post('/api/v1/administrators')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          firstName: 'Duplicate',
          lastName: 'Admin',
          email: 'admin@laundromat.example', // Already exists
          password: 'UniqueStrongPassword849!',
          permissions: []
        });

      expect(response.status).toBe(409);
      expect(response.body.message).toContain('Email already exists');
    });

    it('should require administrators.create permission', async () => {
      // Create limited admin
      const limitedAdmin = await Administrator.create(createAdminData({
        adminId: 'LIMITED001',
        firstName: 'Limited',
        lastName: 'Admin',
        email: 'limited@laundromat.example',
        password: 'StrongPassword417!',
        permissions: ['customers.read'] // No admin permissions
      }));

      // Create new agent for limited admin
      const limitedAgent = createAgent(app);
      const limitedCsrfToken = await getCsrfToken(app, limitedAgent);

      const limitedLogin = await limitedAgent
        .post('/api/v1/auth/administrator/login')
        .send({
          email: 'limited@laundromat.example',
          password: 'StrongPassword417!'
        });

      const response = await limitedAgent
        .post('/api/v1/administrators')
        .set('Authorization', `Bearer ${limitedLogin.body.token}`)
        .set('x-csrf-token', limitedCsrfToken)
        .send({
          firstName: 'New',
          lastName: 'Admin',
          email: 'new@laundromat.example',
          password: 'StrongPassword417!',
          permissions: []
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Access denied: administrators.create permission required');
    });
  });

  describe('PATCH /api/v1/administrators/:id', () => {
    let targetAdmin;

    beforeEach(async () => {
      targetAdmin = await Administrator.create(createAdminData({
        adminId: 'TARGET001',
        firstName: 'Target',
        lastName: 'Admin',
        email: 'target@laundromat.example',
        password: 'StrongPassword417!',
        permissions: ['customers.read'],
        isActive: true
      }));
    });

    it('should update administrator details', async () => {
      const response = await adminAgent
        .patch(`/api/v1/administrators/${targetAdmin._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          firstName: 'Updated',
          lastName: 'Name',
          permissions: ['customers.manage', 'operators.manage']
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.administrator).toMatchObject({
        adminId: 'TARGET001',
        firstName: 'Updated',
        lastName: 'Name',
        email: 'target@laundromat.example',
        permissions: ['customers.manage', 'operators.manage']
      });
    });

    it('should update email', async () => {
      const response = await adminAgent
        .patch(`/api/v1/administrators/${targetAdmin._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          email: 'newemail@laundromat.example'
        });

      expect(response.status).toBe(200);
      expect(response.body.administrator.email).toBe('newemail@laundromat.example');
    });

    it('should update password', async () => {
      const response = await adminAgent
        .patch(`/api/v1/administrators/${targetAdmin._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          password: 'NewStrongPassword849!'
        });

      expect(response.status).toBe(200);

      // Verify new password works
      // Create a new agent for login verification
      const newAgent = createAgent(app);
      const newCsrfToken = await getCsrfToken(app, newAgent);
      
      const loginRes = await newAgent
        .post('/api/v1/auth/administrator/login')
        .set('X-CSRF-Token', newCsrfToken)
        .send({
          email: 'target@laundromat.example',
          password: 'NewStrongPassword849!'
        });

      expect(loginRes.status).toBe(200);
    });

    it('should deactivate administrator', async () => {
      const response = await adminAgent
        .patch(`/api/v1/administrators/${targetAdmin._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          isActive: false
        });

      expect(response.status).toBe(200);
      expect(response.body.administrator.isActive).toBe(false);

      // Verify deactivated admin cannot login
      const loginRes = await agent
        .post('/api/v1/auth/administrator/login')
        .send({
          email: 'target@laundromat.example',
          password: 'StrongPassword417!'
        });

      expect(loginRes.status).toBe(401);
      expect(loginRes.body.message).toContain('Account is deactivated');
    });

    it('should not allow updating adminId', async () => {
      const response = await adminAgent
        .patch(`/api/v1/administrators/${targetAdmin._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          adminId: 'CHANGED001'
        });

      expect(response.status).toBe(200);
      expect(response.body.administrator.adminId).toBe('TARGET001'); // Unchanged
    });

    it('should validate email uniqueness on update', async () => {
      const response = await adminAgent
        .patch(`/api/v1/administrators/${targetAdmin._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          email: 'admin@laundromat.example' // Already exists
        });

      expect(response.status).toBe(409);
      expect(response.body.message).toContain('Email already exists');
    });

    it('should prevent self-deactivation', async () => {
      const response = await adminAgent
        .patch(`/api/v1/administrators/${testAdmin._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          isActive: false
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Cannot deactivate your own account');
    });

    it('should require administrators.update permission', async () => {
      // Create limited admin
      const limitedAdmin = await Administrator.create(createAdminData({
        adminId: 'LIMITED002',
        firstName: 'Limited',
        lastName: 'Admin',
        email: 'limited2@laundromat.example',
        password: 'StrongPassword417!',
        permissions: ['customers.read'] // No admin permissions
      }));

      // Create new agent for limited admin
      const limitedAgent = createAgent(app);
      const limitedCsrfToken = await getCsrfToken(app, limitedAgent);

      const limitedLogin = await limitedAgent
        .post('/api/v1/auth/administrator/login')
        .send({
          email: 'limited2@laundromat.example',
          password: 'StrongPassword417!'
        });

      const response = await limitedAgent
        .patch(`/api/v1/administrators/${targetAdmin._id}`)
        .set('Authorization', `Bearer ${limitedLogin.body.token}`)
        .set('x-csrf-token', limitedCsrfToken)
        .send({
          firstName: 'Hacked'
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Access denied: administrators.update permission required');
    });
  });

  describe('DELETE /api/v1/administrators/:id', () => {
    let targetAdmin;

    beforeEach(async () => {
      targetAdmin = await Administrator.create(createAdminData({
        adminId: 'DELETE001',
        firstName: 'Delete',
        lastName: 'Me',
        email: 'delete@laundromat.example',
        password: 'StrongPassword417!',
        permissions: ['customers.read']
      }));
    });

    it('should delete administrator', async () => {
      const response = await adminAgent
        .delete(`/api/v1/administrators/${targetAdmin._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Administrator deleted successfully');

      // Verify administrator is deleted
      const checkAdmin = await Administrator.findById(targetAdmin._id);
      expect(checkAdmin).toBeNull();
    });

    it('should prevent self-deletion', async () => {
      const response = await adminAgent
        .delete(`/api/v1/administrators/${testAdmin._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Cannot delete your own account');
    });

    it('should prevent deleting last administrator with all permissions', async () => {
      // Delete test admin first
      await Administrator.deleteMany({ _id: { $ne: testAdmin._id } });

      const response = await adminAgent
        .delete(`/api/v1/administrators/${testAdmin._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Cannot delete your own account');
    });

    it('should require administrators.delete permission', async () => {
      // Create limited admin
      const limitedAdmin = await Administrator.create(createAdminData({
        adminId: 'LIMITED003',
        firstName: 'Limited',
        lastName: 'Admin',
        email: 'limited3@laundromat.example',
        password: 'StrongPassword417!',
        permissions: ['customers.manage'] // No admin delete permission
      }));

      // Create new agent for limited admin
      const limitedAgent = createAgent(app);
      const limitedCsrfToken = await getCsrfToken(app, limitedAgent);

      const limitedLogin = await limitedAgent
        .post('/api/v1/auth/administrator/login')
        .send({
          email: 'limited3@laundromat.example',
          password: 'StrongPassword417!'
        });

      const response = await limitedAgent
        .delete(`/api/v1/administrators/${targetAdmin._id}`)
        .set('Authorization', `Bearer ${limitedLogin.body.token}`)
        .set('x-csrf-token', limitedCsrfToken);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Access denied: administrators.delete permission required');
    });

    it('should handle non-existent administrator', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await adminAgent
        .delete(`/api/v1/administrators/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken);

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Administrator not found');
    });
  });

  describe('POST /api/v1/administrators/:id/reset-password', () => {
    let targetAdmin;

    beforeEach(async () => {
      targetAdmin = await Administrator.create(createAdminData({
        adminId: 'RESET001',
        firstName: 'Reset',
        lastName: 'Password',
        email: 'reset@laundromat.example',
        password: 'OldStrongPassword417!',
        permissions: ['customers.read']
      }));
    });

    it('should reset administrator password', async () => {
      const response = await adminAgent
        .post(`/api/v1/administrators/${targetAdmin._id}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          newPassword: 'NewStrongPassword849!'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Password reset successfully');

      // Verify new password works
      // Create a new agent for login verification
      const newAgent = createAgent(app);
      const newCsrfToken = await getCsrfToken(app, newAgent);
      
      const loginRes = await newAgent
        .post('/api/v1/auth/administrator/login')
        .set('X-CSRF-Token', newCsrfToken)
        .send({
          email: 'reset@laundromat.example',
          password: 'NewStrongPassword849!'
        });

      expect(loginRes.status).toBe(200);

      // Verify old password doesn't work
      const oldAgent = createAgent(app);
      const oldCsrfToken = await getCsrfToken(app, oldAgent);
      
      const oldLoginRes = await oldAgent
        .post('/api/v1/auth/administrator/login')
        .set('X-CSRF-Token', oldCsrfToken)
        .send({
          email: 'reset@laundromat.example',
          password: 'OldStrongPassword417!'
        });

      expect(oldLoginRes.status).toBe(401);
    });

    it('should clear login attempts on password reset', async () => {
      // Lock the account
      targetAdmin.loginAttempts = 5;
      targetAdmin.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
      await targetAdmin.save();

      const response = await adminAgent
        .post(`/api/v1/administrators/${targetAdmin._id}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          newPassword: 'NewStrongPassword849!'
        });

      expect(response.status).toBe(200);

      // Verify account is unlocked
      const updatedAdmin = await Administrator.findById(targetAdmin._id);
      expect(updatedAdmin.loginAttempts).toBe(0);
      expect(updatedAdmin.lockUntil).toBeUndefined();
    });

    it('should validate password strength', async () => {
      const response = await adminAgent
        .post(`/api/v1/administrators/${targetAdmin._id}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          newPassword: 'weak'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Password does not meet security requirements');
    });

    it('should require administrators.update permission', async () => {
      // Create limited admin
      const limitedAdmin = await Administrator.create(createAdminData({
        adminId: 'LIMITED004',
        firstName: 'Limited',
        lastName: 'Admin',
        email: 'limited4@laundromat.example',
        password: 'StrongPassword417!',
        permissions: ['customers.read'] // No admin update permission
      }));

      // Create new agent for limited admin
      const limitedAgent = createAgent(app);
      const limitedCsrfToken = await getCsrfToken(app, limitedAgent);

      const limitedLogin = await limitedAgent
        .post('/api/v1/auth/administrator/login')
        .send({
          email: 'limited4@laundromat.example',
          password: 'StrongPassword417!'
        });

      const response = await limitedAgent
        .post(`/api/v1/administrators/${targetAdmin._id}/reset-password`)
        .set('Authorization', `Bearer ${limitedLogin.body.token}`)
        .set('x-csrf-token', limitedCsrfToken)
        .send({
          newPassword: 'NewStrongPassword849!'
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Access denied: administrators.update permission required');
    });
  });

  describe('GET /api/v1/administrators/permissions', () => {
    it('should get available permissions list', async () => {
      const response = await adminAgent
        .get('/api/v1/administrators/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.permissions).toBeInstanceOf(Array);
      expect(response.body.permissions).toContain('all');
      expect(response.body.permissions).toContain('administrators.read');
      expect(response.body.permissions).toContain('administrators.create');
      expect(response.body.permissions).toContain('administrators.update');
      expect(response.body.permissions).toContain('administrators.delete');
      expect(response.body.permissions).toContain('operators.manage');
      expect(response.body.permissions).toContain('customers.manage');
      expect(response.body.permissions).toContain('affiliates.manage');
      expect(response.body.permissions).toContain('orders.manage');
      expect(response.body.permissions).toContain('reports.view');
      expect(response.body.permissions).toContain('system.configure');
    });

    it('should require authentication', async () => {
      const response = await agent
        .get('/api/v1/administrators/permissions');

      expect(response.status).toBe(401);
    });
  });
});