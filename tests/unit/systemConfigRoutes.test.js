// System Config Routes Unit Tests

const express = require('express');
const request = require('supertest');

// Mock the middleware and model before requiring anything else
jest.mock('../../server/middleware/auth', () => ({
  authenticate: jest.fn((req, res, next) => {
    req.user = { id: 'admin123', role: 'administrator' };
    next();
  })
}));

jest.mock('../../server/middleware/rbac', () => ({
  checkRole: jest.fn(() => (req, res, next) => next()),
  checkAdminPermission: jest.fn(() => (req, res, next) => next())
}));

jest.mock('../../server/models/SystemConfig');

// Now require the modules after mocking
const systemConfigRoutes = require('../../server/routes/systemConfigRoutes');
const SystemConfig = require('../../server/models/SystemConfig');
const { authenticate } = require('../../server/middleware/auth');
const { checkRole, checkAdminPermission } = require('../../server/middleware/rbac');

describe('System Config Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/system-config', systemConfigRoutes);

    // Mock middleware to pass through by default
    authenticate.mockImplementation((req, res, next) => {
      req.user = { id: 'admin123', role: 'administrator' };
      next();
    });
    
    checkRole.mockImplementation(() => (req, res, next) => next());
    checkAdminPermission.mockImplementation(() => (req, res, next) => next());
  });

  describe('GET /api/system-config/public', () => {
    it('should return public configurations', async () => {
      const mockConfigs = [
        {
          key: 'STORE_NAME',
          value: 'Laundromat Co',
          defaultValue: 'Laundromat',
          description: 'Store name',
          category: 'general',
          isPublic: true
        },
        {
          key: 'BUSINESS_HOURS',
          value: '7AM-10PM',
          defaultValue: '8AM-8PM',
          description: 'Business hours',
          category: 'general',
          isPublic: true
        }
      ];

      SystemConfig.getPublicConfigs.mockResolvedValue(mockConfigs);

      const response = await request(app)
        .get('/api/system-config/public')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toEqual({
        key: 'STORE_NAME',
        currentValue: 'Laundromat Co',
        defaultValue: 'Laundromat',
        description: 'Store name',
        category: 'general',
        isPublic: true
      });
      expect(SystemConfig.getPublicConfigs).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when fetching public configs', async () => {
      SystemConfig.getPublicConfigs.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/system-config/public')
        .expect(500);

      expect(response.body.error).toBe('Failed to fetch public configurations');
    });
  });

  describe('GET /api/system-config/public/:key', () => {
    it('should return specific public configuration', async () => {
      const mockConfig = {
        key: 'STORE_NAME',
        value: 'Laundromat Co',
        defaultValue: 'Laundromat',
        description: 'Store name',
        category: 'general',
        isPublic: true
      };

      SystemConfig.findOne.mockResolvedValue(mockConfig);

      const response = await request(app)
        .get('/api/system-config/public/STORE_NAME')
        .expect(200);

      expect(response.body).toEqual({
        key: 'STORE_NAME',
        currentValue: 'Laundromat Co',
        defaultValue: 'Laundromat',
        description: 'Store name',
        category: 'general',
        isPublic: true
      });

      expect(SystemConfig.findOne).toHaveBeenCalledWith({
        key: 'STORE_NAME',
        isPublic: true
      });
    });

    it('should return 404 for non-existent public config', async () => {
      SystemConfig.findOne.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/system-config/public/NON_EXISTENT')
        .expect(404);

      expect(response.body.error).toBe('Configuration not found');
    });

    it('should handle errors when fetching specific config', async () => {
      SystemConfig.findOne.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/system-config/public/STORE_NAME')
        .expect(500);

      expect(response.body.error).toBe('Failed to fetch configuration');
    });
  });

  describe('GET /api/system-config (authenticated)', () => {
    it('should return all configurations for admin', async () => {
      const mockConfigs = [
        { key: 'CONFIG1', value: 'value1', category: 'general' },
        { key: 'CONFIG2', value: 'value2', category: 'security' }
      ];

      SystemConfig.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockConfigs)
      });

      const response = await request(app)
        .get('/api/system-config')
        .set('Authorization', 'Bearer fake-token')
        .expect(200);

      expect(response.body).toEqual(mockConfigs);
      expect(SystemConfig.find).toHaveBeenCalled();
    });

    it('should filter configurations by category', async () => {
      const mockConfigs = [
        { key: 'SEC_CONFIG1', value: 'value1', category: 'security' },
        { key: 'SEC_CONFIG2', value: 'value2', category: 'security' }
      ];

      SystemConfig.getByCategory.mockResolvedValue(mockConfigs);

      const response = await request(app)
        .get('/api/system-config?category=security')
        .set('Authorization', 'Bearer fake-token')
        .expect(200);

      expect(response.body).toEqual(mockConfigs);
      expect(SystemConfig.getByCategory).toHaveBeenCalledWith('security');
    });

    it('should handle errors when fetching all configs', async () => {
      SystemConfig.find.mockReturnValue({
        sort: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      const response = await request(app)
        .get('/api/system-config')
        .set('Authorization', 'Bearer fake-token')
        .expect(500);

      expect(response.body.error).toBe('Failed to fetch configurations');
    });

    it('should require authentication', async () => {
      authenticate.mockImplementation((req, res, next) => {
        res.status(401).json({ error: 'Unauthorized' });
      });

      const response = await request(app)
        .get('/api/system-config')
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
    });

    it('should require administrator role', async () => {
      // Create a new app instance with different middleware behavior
      const testApp = express();
      testApp.use(express.json());
      
      // Create new mock instances for this test
      const authMock = jest.fn((req, res, next) => {
        req.user = { id: 'user123', role: 'customer' };
        next();
      });
      
      const roleMock = jest.fn(() => (req, res, next) => {
        // Check if user is administrator
        if (req.user && req.user.role === 'administrator') {
          next();
        } else {
          res.status(403).json({ error: 'Forbidden' });
        }
      });
      
      // Mock the modules for this specific test
      jest.doMock('../../server/middleware/auth', () => ({
        authenticate: authMock
      }));
      
      jest.doMock('../../server/middleware/rbac', () => ({
        checkRole: roleMock,
        checkAdminPermission: jest.fn(() => (req, res, next) => next())
      }));
      
      // Clear the module cache and re-require the routes
      jest.resetModules();
      const testRoutes = require('../../server/routes/systemConfigRoutes');
      
      testApp.use('/api/system-config', testRoutes);
      
      const response = await request(testApp)
        .get('/api/system-config')
        .set('Authorization', 'Bearer fake-token')
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });
  });

  describe('PUT /api/system-config/:key', () => {
    it('should update configuration value', async () => {
      const updatedConfig = {
        key: 'STORE_NAME',
        value: 'New Store Name',
        updatedBy: 'admin123',
        updatedAt: new Date()
      };

      SystemConfig.setValue.mockResolvedValue(updatedConfig);

      const response = await request(app)
        .put('/api/system-config/STORE_NAME')
        .set('Authorization', 'Bearer fake-token')
        .send({ value: 'New Store Name' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.config).toMatchObject({
        key: 'STORE_NAME',
        value: 'New Store Name',
        updatedBy: 'admin123'
      });

      expect(SystemConfig.setValue).toHaveBeenCalledWith(
        'STORE_NAME',
        'New Store Name',
        'admin123'
      );
    });

    it('should require system_config permission', async () => {
      // Create a new app instance with different middleware behavior
      const testApp = express();
      testApp.use(express.json());
      
      // Create new mock instances for this test
      const authMock = jest.fn((req, res, next) => {
        req.user = { id: 'admin123', role: 'administrator' };
        next();
      });
      
      const roleMock = jest.fn(() => (req, res, next) => next());
      
      const permissionMock = jest.fn(() => (req, res, next) => {
        // Simulate permission check failure
        res.status(403).json({ error: 'Permission denied' });
      });
      
      // Mock the modules for this specific test
      jest.doMock('../../server/middleware/auth', () => ({
        authenticate: authMock
      }));
      
      jest.doMock('../../server/middleware/rbac', () => ({
        checkRole: roleMock,
        checkAdminPermission: permissionMock
      }));
      
      // Clear the module cache and re-require the routes
      jest.resetModules();
      const testRoutes = require('../../server/routes/systemConfigRoutes');
      
      testApp.use('/api/system-config', testRoutes);
      
      const response = await request(testApp)
        .put('/api/system-config/STORE_NAME')
        .set('Authorization', 'Bearer fake-token')
        .send({ value: 'New Store Name' })
        .expect(403);

      expect(response.body.error).toBe('Permission denied');
    });

    it('should handle validation errors', async () => {
      SystemConfig.setValue.mockRejectedValue(new Error('Invalid value'));

      const response = await request(app)
        .put('/api/system-config/STORE_NAME')
        .set('Authorization', 'Bearer fake-token')
        .send({ value: 'Invalid Value' })
        .expect(400);

      expect(response.body.error).toBe('Invalid value');
    });
  });

  describe('POST /api/system-config/initialize', () => {
    it('should initialize default configurations', async () => {
      SystemConfig.initializeDefaults.mockResolvedValue();

      const response = await request(app)
        .post('/api/system-config/initialize')
        .set('Authorization', 'Bearer fake-token')
        .expect(200);

      expect(response.body.message).toBe('Default configurations initialized');
      expect(SystemConfig.initializeDefaults).toHaveBeenCalledTimes(1);
    });

    it('should handle errors during initialization', async () => {
      SystemConfig.initializeDefaults.mockRejectedValue(new Error('Init failed'));

      const response = await request(app)
        .post('/api/system-config/initialize')
        .set('Authorization', 'Bearer fake-token')
        .expect(500);

      expect(response.body.error).toBe('Failed to initialize configurations');
    });

    it('should require authentication and admin role', async () => {
      authenticate.mockImplementation((req, res, next) => {
        res.status(401).json({ error: 'Unauthorized' });
      });

      const response = await request(app)
        .post('/api/system-config/initialize')
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
    });
  });
});