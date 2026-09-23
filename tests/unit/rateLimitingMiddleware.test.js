// Mock dependencies before requiring the module
jest.mock('express-rate-limit', () => {
  return jest.fn((config) => {
    // Return a middleware function
    return (req, res, next) => {
      // Store config for testing
      req.rateLimitConfig = config;

      // Test key generator if provided
      if (config.keyGenerator && req.keyGeneratorTest) {
        req.generatedKey = config.keyGenerator(req);
      }

      // Test skip function if provided
      if (config.skip && req.skipTest) {
        req.shouldSkip = config.skip(req);
      }

      next();
    };
  });
});

// The published `rate-limit-mongo` package was removed in the
// prod-lockdown-2026-05-20 refactor (it pulled in vulnerable
// underscore@1.12.1). It's replaced by the in-house
// server/middleware/rateLimitMongoStore.js, constructed as
// `new MongoRateLimitStore({ windowMs, name })`. Mock that instead.
jest.mock('../../server/middleware/rateLimitMongoStore', () => {
  return jest.fn().mockImplementation((options) => {
    return {
      windowMs: options.windowMs,
      name: options.name,
      _isMongoStore: true
    };
  });
});

const request = require('supertest');
const express = require('express');

describe('Rate Limiting Middleware', () => {
  let originalEnv;
  let rateLimitingModule;

  beforeAll(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('createMongoStore', () => {
    it('should return undefined in test environment', () => {
      process.env.NODE_ENV = 'test';

      rateLimitingModule = require('../../server/middleware/rateLimiting');
      const limiter = rateLimitingModule.createCustomLimiter({ windowMs: 60000 });

      const req = {};
      const res = {};
      const next = jest.fn();

      limiter(req, res, next);

      expect(req.rateLimitConfig.store).toBeUndefined();
    });

    it('should create MongoStore in non-test environment', () => {
      process.env.NODE_ENV = 'production';
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test';

      rateLimitingModule = require('../../server/middleware/rateLimiting');
      const MongoStore = require('../../server/middleware/rateLimitMongoStore');

      const limiter = rateLimitingModule.createCustomLimiter({ windowMs: 60000 });

      const req = {};
      const res = {};
      const next = jest.fn();

      limiter(req, res, next);

      expect(req.rateLimitConfig.store).toBeDefined();
      expect(req.rateLimitConfig.store._isMongoStore).toBe(true);
      // createMongoStore(windowMs, name) -> new MongoRateLimitStore({ windowMs, name }).
      // createCustomLimiter defaults the name to 'custom' when none is given.
      expect(MongoStore).toHaveBeenCalledWith({
        windowMs: 60000,
        name: 'custom'
      });
    });

    // The "should handle MongoStore creation errors" case was removed: the
    // graceful try/catch fallback to the in-memory store (which logged
    // 'Failed to create MongoDB rate limit store:') was deleted in the
    // prod-lockdown-2026-05-20 refactor (H-6). createMongoStore now simply
    // constructs the in-house MongoRateLimitStore with no error handling,
    // so there is no fallback-to-undefined behavior left to assert.
  });

  describe('Key Generators', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      rateLimitingModule = require('../../server/middleware/rateLimiting');
    });

    it('should generate key for sensitive operations based on user ID', () => {
      const app = express();
      app.use((req, res, next) => {
        req.user = { id: 'user123' };
        req.keyGeneratorTest = true;
        next();
      });
      app.use(rateLimitingModule.sensitiveOperationLimiter);
      app.get('/test', (req, res) => res.json({ key: req.generatedKey }));

      return request(app)
        .get('/test')
        .expect(200)
        .then(response => {
          expect(response.body.key).toBe('user_user123');
        });
    });

    it('should generate key for sensitive operations based on IP when no user', () => {
      const app = express();
      app.use((req, res, next) => {
        req.keyGeneratorTest = true;
        next();
      });
      app.use(rateLimitingModule.sensitiveOperationLimiter);
      app.get('/test', (req, res) => res.json({ key: req.generatedKey }));

      return request(app)
        .get('/test')
        .expect(200)
        .then(response => {
          // Supertest connects over ::ffff:127.0.0.1; ipBucketKey strips the
          // IPv4-mapped-IPv6 prefix to the canonical IPv4 form.
          expect(response.body.key).toBe('127.0.0.1');
        });
    });

    it('should generate key for email verification based on email', () => {
      const app = express();
      app.use(express.json());
      app.use((req, res, next) => {
        req.keyGeneratorTest = true;
        next();
      });
      app.post('/test', rateLimitingModule.emailVerificationLimiter, (req, res) => {
        res.json({ key: req.generatedKey });
      });

      return request(app)
        .post('/test')
        .send({ email: 'test@example.com' })
        .expect(200)
        .then(response => {
          expect(response.body.key).toBe('test@example.com');
        });
    });

    it('should generate key for email verification based on user ID when no email', () => {
      const app = express();
      app.use(express.json());
      app.use((req, res, next) => {
        req.user = { id: 'user456' };
        req.keyGeneratorTest = true;
        next();
      });
      app.post('/test', rateLimitingModule.emailVerificationLimiter, (req, res) => {
        res.json({ key: req.generatedKey });
      });

      return request(app)
        .post('/test')
        .send({})
        .expect(200)
        .then(response => {
          expect(response.body.key).toBe('user456');
        });
    });

    it('should generate key for email verification based on IP when no email or user', () => {
      const app = express();
      app.use(express.json());
      app.use((req, res, next) => {
        req.keyGeneratorTest = true;
        next();
      });
      app.post('/test', rateLimitingModule.emailVerificationLimiter, (req, res) => {
        res.json({ key: req.generatedKey });
      });

      return request(app)
        .post('/test')
        .send({})
        .expect(200)
        .then(response => {
          // Supertest connects over ::ffff:127.0.0.1; ipBucketKey strips the
          // IPv4-mapped-IPv6 prefix to the canonical IPv4 form.
          expect(response.body.key).toBe('127.0.0.1');
        });
    });

    it('should generate key for file upload based on user ID', () => {
      const app = express();
      app.use((req, res, next) => {
        req.user = { id: 'user789' };
        req.keyGeneratorTest = true;
        next();
      });
      app.use(rateLimitingModule.fileUploadLimiter);
      app.get('/test', (req, res) => res.json({ key: req.generatedKey }));

      return request(app)
        .get('/test')
        .expect(200)
        .then(response => {
          expect(response.body.key).toBe('user_user789');
        });
    });

    it('should generate key for admin login based on IP and username', () => {
      const app = express();
      app.use(express.json());
      app.use((req, res, next) => {
        req.keyGeneratorTest = true;
        next();
      });
      app.post('/test', rateLimitingModule.adminLoginLimiter, (req, res) => {
        res.json({ key: req.generatedKey });
      });

      return request(app)
        .post('/test')
        .send({ username: 'admin123' })
        .expect(200)
        .then(response => {
          expect(response.body.key).toBe('admin_login_127.0.0.1_admin123');
        });
    });

    it('should generate key for admin login based on IP and email when no username', () => {
      const app = express();
      app.use(express.json());
      app.use((req, res, next) => {
        req.keyGeneratorTest = true;
        next();
      });
      app.post('/test', rateLimitingModule.adminLoginLimiter, (req, res) => {
        res.json({ key: req.generatedKey });
      });

      return request(app)
        .post('/test')
        .send({ email: 'admin@example.com' })
        .expect(200)
        .then(response => {
          expect(response.body.key).toBe('admin_login_127.0.0.1_admin@example.com');
        });
    });
  });

  describe('Skip Functions', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      rateLimitingModule = require('../../server/middleware/rateLimiting');
    });

    it('should skip admin operation limiter for non-admin users', () => {
      const app = express();
      app.use((req, res, next) => {
        req.user = { role: 'user' };
        req.skipTest = true;
        next();
      });
      app.use(rateLimitingModule.adminOperationLimiter);
      app.get('/test', (req, res) => res.json({ shouldSkip: req.shouldSkip }));

      return request(app)
        .get('/test')
        .expect(200)
        .then(response => {
          expect(response.body.shouldSkip).toBe(true);
        });
    });

    it('should not skip admin operation limiter for admin users', () => {
      const app = express();
      app.use((req, res, next) => {
        // Role string is 'administrator' (Administrator model + token signer).
        // The prod-lockdown-2026-05-20 re-audit (N-3) corrected the skip
        // check from the unreachable 'admin' to 'administrator'; using
        // 'admin' here would (correctly) skip and is no longer valid.
        req.user = { role: 'administrator' };
        req.skipTest = true;
        next();
      });
      app.use(rateLimitingModule.adminOperationLimiter);
      app.get('/test', (req, res) => res.json({ shouldSkip: req.shouldSkip }));

      return request(app)
        .get('/test')
        .expect(200)
        .then(response => {
          expect(response.body.shouldSkip).toBe(false);
        });
    });

    it('should skip admin operation limiter when no user', () => {
      const app = express();
      app.use((req, res, next) => {
        req.skipTest = true;
        next();
      });
      app.use(rateLimitingModule.adminOperationLimiter);
      app.get('/test', (req, res) => res.json({ shouldSkip: req.shouldSkip }));

      return request(app)
        .get('/test')
        .expect(200)
        .then(response => {
          expect(response.body.shouldSkip).toBe(true);
        });
    });
  });

  describe('createCustomLimiter', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      rateLimitingModule = require('../../server/middleware/rateLimiting');
    });

    it('should create limiter with custom options', () => {
      const customOptions = {
        windowMs: 30000,
        max: 50,
        message: 'Custom rate limit message'
      };

      const limiter = rateLimitingModule.createCustomLimiter(customOptions);
      const req = {};
      const res = {};
      const next = jest.fn();

      limiter(req, res, next);

      expect(req.rateLimitConfig.windowMs).toBe(30000);
      expect(req.rateLimitConfig.max).toBe(50);
      expect(req.rateLimitConfig.message).toBe('Custom rate limit message');
      expect(req.rateLimitConfig.standardHeaders).toBe(true);
      expect(req.rateLimitConfig.legacyHeaders).toBe(false);
    });

    it('should merge defaults with custom options', () => {
      const customOptions = {
        max: 100
      };

      const limiter = rateLimitingModule.createCustomLimiter(customOptions);
      const req = {};
      const res = {};
      const next = jest.fn();

      limiter(req, res, next);

      expect(req.rateLimitConfig.max).toBe(100);
      expect(req.rateLimitConfig.message).toEqual({
        success: false,
        message: 'Too many requests, please try again later'
      });
      expect(req.rateLimitConfig.standardHeaders).toBe(true);
    });

    it('should use custom windowMs for store creation', () => {
      const MongoStore = require('../../server/middleware/rateLimitMongoStore');
      jest.clearAllMocks();

      const customOptions = {
        windowMs: 120000, // 2 minutes
        max: 200
      };

      const limiter = rateLimitingModule.createCustomLimiter(customOptions);
      const req = {};
      const res = {};
      const next = jest.fn();

      limiter(req, res, next);

      // The in-house store takes windowMs (not the old package's expireTimeMs).
      expect(MongoStore).toHaveBeenCalledWith(
        expect.objectContaining({
          windowMs: 120000
        })
      );
    });
  });

  // The limiters are skipped in NODE_ENV=test, so their keyGenerators are never
  // exercised by the integration suite. These assertions pin each limiter to the
  // canonical _keyGenerators member so an accidental revert to a bare
  // `(req) => req.ip` (the CF-edge bug) is caught at the unit level.
  describe('keyGenerator wiring', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      rateLimitingModule = require('../../server/middleware/rateLimiting');
    });

    const capture = (limiter) => {
      const req = {};
      limiter(req, {}, () => {});
      return req.rateLimitConfig;
    };

    const cases = [
      ['authLimiter', 'ip'],
      ['passwordResetLimiter', 'ip'],
      ['registrationLimiter', 'ip'],
      ['apiLimiter', 'ip'],
      ['contactFormBurstLimiter', 'ip'],
      ['contactFormLimiter', 'ip'],
      ['adminOperationLimiter', 'ip'],
      ['sensitiveOperationLimiter', 'userOrIp'],
      ['fileUploadLimiter', 'userOrIp'],
      ['emailVerificationLimiter', 'emailOrUserOrIp'],
      ['adminLoginLimiter', 'adminLogin']
    ];

    it.each(cases)('%s is wired to the canonical _keyGenerators.%s', (limiterName, genName) => {
      const cfg = capture(rateLimitingModule[limiterName]);
      expect(cfg.keyGenerator).toBe(rateLimitingModule._keyGenerators[genName]);
    });

    it('createCustomLimiter defaults to the canonical ip generator', () => {
      const cfg = capture(rateLimitingModule.createCustomLimiter({ windowMs: 1000, name: 'x' }));
      expect(cfg.keyGenerator).toBe(rateLimitingModule._keyGenerators.ip);
    });
  });
});