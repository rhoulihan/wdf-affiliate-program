const request = require('supertest');
const app = require('../../server');
const SystemConfig = require('../../server/models/SystemConfig');
const Administrator = require('../../server/models/Administrator');
const jwt = require('jsonwebtoken');
const { createAgent, getCsrfToken } = require('../helpers/csrfHelper');
const encryptionUtil = require('../../server/utils/encryption');

describe('System Config API Tests', () => {
  let adminToken;
  let testAdmin;

  beforeAll(async () => {
    // Clear any existing test data
    await Administrator.deleteMany({ adminId: { $in: ['ADM998', 'ADM999'] } });
    await SystemConfig.deleteMany({});

    // Create a test administrator
    const { salt, hash } = encryptionUtil.hashPassword('Test@Admin#2025!');
    testAdmin = await Administrator.create({
      adminId: 'ADM999',
      email: 'test.admin@laundromat.example',
      passwordSalt: salt,
      passwordHash: hash,
      firstName: 'Test',
      lastName: 'Admin',
      permissions: ['system_config', 'view_analytics'],
      isActive: true
    });

    // Generate admin token
    adminToken = jwt.sign(
      {
        id: testAdmin._id,
        email: testAdmin.email,
        role: 'administrator',
        permissions: testAdmin.permissions
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  beforeEach(async () => {
    // Clear and reinitialize configs before each test
    await SystemConfig.deleteMany({});
    await SystemConfig.initializeDefaults();
  });

  afterAll(async () => {
    await Administrator.deleteMany({ adminId: { $in: ['ADM998', 'ADM999'] } });
    await SystemConfig.deleteMany({});
  });

  describe('Public Endpoints', () => {
    describe('GET /api/v1/system/config/public', () => {
      it('should return all public configurations', async () => {
        const response = await request(app)
          .get('/api/v1/system/config/public')
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBeGreaterThan(0);

        // Check that all returned configs are public
        response.body.forEach(config => {
          expect(config.isPublic).toBe(true);
          expect(config).toHaveProperty('key');
          expect(config).toHaveProperty('currentValue');
          expect(config).not.toHaveProperty('updatedBy'); // Should not expose admin info
        });

        // Verify WDF rate is included
        const wdfConfig = response.body.find(c => c.key === 'wdf_base_rate_per_pound');
        expect(wdfConfig).toBeDefined();
        expect(wdfConfig.currentValue).toBe(1.40);
        expect(wdfConfig.category).toBe('payment');
      });

      it('should not return private configurations', async () => {
        // Create a private config
        await SystemConfig.create({
          key: 'private_test_config',
          value: 'secret',
          defaultValue: 'secret',
          description: 'Private test config',
          category: 'system',
          dataType: 'string',
          isPublic: false
        });

        const response = await request(app)
          .get('/api/v1/system/config/public')
          .expect(200);

        const privateConfig = response.body.find(c => c.key === 'private_test_config');
        expect(privateConfig).toBeUndefined();

        // Cleanup
        await SystemConfig.deleteOne({ key: 'private_test_config' });
      });
    });

    describe('GET /api/v1/system/config/public/:key', () => {
      it('should return a specific public configuration', async () => {
        const response = await request(app)
          .get('/api/v1/system/config/public/wdf_base_rate_per_pound')
          .expect(200);

        expect(response.body.key).toBe('wdf_base_rate_per_pound');
        expect(response.body.currentValue).toBe(1.40);
        expect(response.body.isPublic).toBe(true);
      });

      it('should return 404 for non-existent config', async () => {
        const response = await request(app)
          .get('/api/v1/system/config/public/non_existent_key')
          .expect(404);

        expect(response.body.error).toBeDefined();
      });

      it('should return 404 for private config accessed via public endpoint', async () => {
        // Create a private config
        await SystemConfig.create({
          key: 'private_key',
          value: 'secret',
          defaultValue: 'secret',
          description: 'Private config',
          category: 'system',
          dataType: 'string',
          isPublic: false
        });

        const response = await request(app)
          .get('/api/v1/system/config/public/private_key')
          .expect(404);

        expect(response.body.error).toBeDefined();

        // Cleanup
        await SystemConfig.deleteOne({ key: 'private_key' });
      });
    });
  });

  describe('Admin Endpoints', () => {
    describe('GET /api/v1/system/config', () => {
      it('should return all configurations for admin', async () => {
        const response = await request(app)
          .get('/api/v1/system/config')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBeGreaterThan(0);

        // Should include both public and private configs
        const publicCount = response.body.filter(c => c.isPublic).length;
        const privateCount = response.body.filter(c => !c.isPublic).length;
        expect(publicCount).toBeGreaterThan(0);
        expect(privateCount).toBeGreaterThan(0);
      });

      it('should return 401 without authentication', async () => {
        await request(app)
          .get('/api/v1/system/config')
          .expect(401);
      });

      it('should return 403 for non-admin users', async () => {
        // Create a regular user token (affiliate)
        const affiliateToken = jwt.sign(
          {
            id: 'test-affiliate-id',
            email: 'affiliate@test.com',
            role: 'affiliate'
          },
          process.env.JWT_SECRET,
          { expiresIn: '1h' }
        );

        await request(app)
          .get('/api/v1/system/config')
          .set('Authorization', `Bearer ${affiliateToken}`)
          .expect(403);
      });
    });

    describe('PUT /api/v1/system/config/:key', () => {
      let agent;
      let csrfToken;

      beforeEach(async () => {
        // Create agent with session support
        agent = createAgent(app);

        // Get CSRF token for admin
        csrfToken = await getCsrfToken(app, agent);

        // Ensure test admin still exists and is active
        const admin = await Administrator.findById(testAdmin._id);
        if (!admin) {
          // Recreate admin and token if it was deleted
          const { salt, hash } = encryptionUtil.hashPassword('Test@Admin#2025!');
          testAdmin = await Administrator.create({
            adminId: 'ADM999',
            email: 'test.admin@laundromat.example',
            passwordSalt: salt,
            passwordHash: hash,
            firstName: 'Test',
            lastName: 'Admin',
            permissions: ['system_config', 'view_analytics'],
            isActive: true
          });

          // Regenerate token
          adminToken = jwt.sign(
            {
              id: testAdmin._id,
              email: testAdmin.email,
              role: 'administrator',
              permissions: testAdmin.permissions
            },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
          );
        }
      });

      it('should update a configuration value', async () => {
        const newValue = 2.50;

        const response = await agent
          .put('/api/v1/system/config/wdf_base_rate_per_pound')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-CSRF-Token', csrfToken)
          .send({ value: newValue });

        // Log the response for debugging
        if (response.status !== 200) {
          console.error('Update failed:', response.status, response.body);
        }

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.config.key).toBe('wdf_base_rate_per_pound');
        expect(response.body.config.value).toBe(newValue);
        expect(response.body.config.updatedBy).toBe(testAdmin._id.toString());

        // Verify the value was actually updated
        const updatedConfig = await SystemConfig.findOne({ key: 'wdf_base_rate_per_pound' });
        expect(updatedConfig.value).toBe(newValue);

        // Reset to default
        await SystemConfig.setValue('wdf_base_rate_per_pound', 1.25);
      });

      it('should validate value based on data type', async () => {
        // Try to set a string value for a number field
        const response = await agent
          .put('/api/v1/system/config/wdf_base_rate_per_pound')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-CSRF-Token', csrfToken)
          .send({ value: 'invalid' })
          .expect(400);

        expect(response.body.error).toContain('must be a number');
      });

      it('should validate value against min/max constraints', async () => {
        // Try to set value below minimum (0.50)
        const response = await agent
          .put('/api/v1/system/config/wdf_base_rate_per_pound')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-CSRF-Token', csrfToken)
          .send({ value: 0.25 })
          .expect(400);

        expect(response.body.error).toContain('must be at least');
      });

      it('should not allow updating non-editable configs', async () => {
        // Create a non-editable config
        await SystemConfig.create({
          key: 'non_editable_config',
          value: 'fixed',
          defaultValue: 'fixed',
          description: 'Non-editable config',
          category: 'system',
          dataType: 'string',
          isEditable: false
        });

        const response = await agent
          .put('/api/v1/system/config/non_editable_config')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-CSRF-Token', csrfToken)
          .send({ value: 'new value' })
          .expect(400);

        expect(response.body.error).toContain('not editable');

        // Cleanup
        await SystemConfig.deleteOne({ key: 'non_editable_config' });
      });

      it('should require system_config permission', async () => {
        // Create admin without system_config permission
        const { salt: limitedSalt, hash: limitedHash } = encryptionUtil.hashPassword('Limited@Admin#2025!');
        const limitedAdmin = await Administrator.create({
          adminId: 'ADM998',
          email: 'limited.admin@laundromat.example',
          passwordSalt: limitedSalt,
          passwordHash: limitedHash,
          firstName: 'Limited',
          lastName: 'Admin',
          permissions: ['view_analytics'], // No system_config
          isActive: true
        });

        const limitedToken = jwt.sign(
          {
            id: limitedAdmin._id,
            email: limitedAdmin.email,
            role: 'administrator',
            permissions: limitedAdmin.permissions
          },
          process.env.JWT_SECRET,
          { expiresIn: '1h' }
        );

        // Create new agent for limited admin
        const limitedAgent = createAgent(app);
        const limitedCsrfToken = await getCsrfToken(app, limitedAgent);

        await limitedAgent
          .put('/api/v1/system/config/wdf_base_rate_per_pound')
          .set('Authorization', `Bearer ${limitedToken}`)
          .set('X-CSRF-Token', limitedCsrfToken)
          .send({ value: 2.00 })
          .expect(403);

        // Cleanup
        await Administrator.deleteOne({ adminId: 'ADM998' });
      });
    });

    describe('POST /api/v1/system/config/initialize', () => {
      let agent;
      let csrfToken;

      beforeEach(async () => {
        // Create agent with session support
        agent = createAgent(app);

        // Get CSRF token
        csrfToken = await getCsrfToken(app, agent);
      });

      it('should initialize default configurations', async () => {
        // Delete a config to test initialization
        await SystemConfig.deleteOne({ key: 'maintenance_mode' });

        const response = await agent
          .post('/api/v1/system/config/initialize')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-CSRF-Token', csrfToken)
          .expect(200);

        expect(response.body.message).toContain('initialized');

        // Verify the deleted config was recreated
        const maintenanceConfig = await SystemConfig.findOne({ key: 'maintenance_mode' });
        expect(maintenanceConfig).toBeDefined();
        expect(maintenanceConfig.value).toBe(false);
      });

      it('should not overwrite existing configurations', async () => {
        // Update a config value
        await SystemConfig.setValue('wdf_base_rate_per_pound', 3.00);

        await agent
          .post('/api/v1/system/config/initialize')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-CSRF-Token', csrfToken)
          .expect(200);

        // Verify the value wasn't overwritten
        const wdfConfig = await SystemConfig.findOne({ key: 'wdf_base_rate_per_pound' });
        expect(wdfConfig.value).toBe(3.00); // Should keep the updated value

        // Reset to default
        await SystemConfig.setValue('wdf_base_rate_per_pound', 1.25);
      });
    });
  });

  // Removed 'Integration with Order Model' (was: 'should use SystemConfig WDF rate
  // in new orders'). Obsolete in the Phase-1 redesign: the Order model is now a slim
  // bag-tracking state record — baseRate/actualTotal/actualWeight/feeBreakdown and the
  // pricing pre-save hook were stripped (money/weight/pricing now live in Cents), so
  // the order no longer reads the WDF rate from SystemConfig. See server/models/Order.js.
});