const authController = require('../../server/controllers/authController');
const Affiliate = require('../../server/models/Affiliate');
const Customer = require('../../server/models/Customer');
const Administrator = require('../../server/models/Administrator');
const Operator = require('../../server/models/Operator');
const RefreshToken = require('../../server/models/RefreshToken');
const TokenBlacklist = require('../../server/models/TokenBlacklist');
const encryptionUtil = require('../../server/utils/encryption');
const emailService = require('../../server/utils/emailService');
const { logLoginAttempt, logAuditEvent } = require('../../server/utils/auditLogger');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { expectSuccessResponse, expectErrorResponse } = require('../helpers/responseHelpers');
const { extractHandler } = require('../helpers/testUtils');
const { createFindOneMock, createFindMock, createMockDocument, createAggregateMock } = require('../helpers/mockHelpers');

// Mock dependencies
jest.mock('../../server/models/Affiliate');
jest.mock('../../server/models/Customer');
jest.mock('../../server/models/Administrator');
jest.mock('../../server/models/Operator');
jest.mock('../../server/models/RefreshToken');
jest.mock('../../server/models/TokenBlacklist');
jest.mock('../../server/utils/encryption');
jest.mock('../../server/utils/emailService');
jest.mock('../../server/utils/auditLogger');
jest.mock('jsonwebtoken');
jest.mock('crypto');

// Restore the real crypto.timingSafeEqual — the operator-PIN controller
// uses it for constant-time comparison (APP-010 / prod-lockdown-2026-05-20).
// All other crypto methods remain auto-mocked.
crypto.timingSafeEqual = jest.requireActual('crypto').timingSafeEqual;

describe('Auth Controller', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      body: {},
      query: {},
      headers: {},
      ip: '127.0.0.1',
      session: {},
      user: null,
      get: jest.fn().mockReturnValue('User-Agent')
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis()
    };
    next = jest.fn();

    // Default mocks
    crypto.randomBytes.mockReturnValue({ toString: jest.fn().mockReturnValue('mock-token') });
    crypto.createHash = jest.fn().mockReturnValue({
      update: jest.fn().mockReturnValue({
        digest: jest.fn().mockReturnValue('hashed-token')
      })
    });
    jwt.sign.mockReturnValue('mock-jwt-token');
    jwt.verify.mockReturnValue({ id: 'user123', role: 'affiliate' });

    // Mock encryption utilities
    encryptionUtil.hashData = jest.fn().mockReturnValue('hashed-token');
    encryptionUtil.hashPassword = jest.fn().mockReturnValue({ salt: 'salt', hash: 'hash' });
    encryptionUtil.verifyPassword = jest.fn().mockReturnValue(true);

    jest.clearAllMocks();
  });

  describe('affiliateLogin', () => {
    it('should successfully login an affiliate with valid credentials', async () => {
      const mockAffiliate = {
        _id: 'affiliate123',
        affiliateId: 'AFF123',
        username: 'testaffiliate',
        passwordHash: 'hashedPassword',
        passwordSalt: 'salt',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      save: jest.fn(),
      // prod-lockdown-2026-05-20: login now records attempts via these model
      // methods instead of save() — success resets the counter.
      resetLoginAttempts: jest.fn().mockResolvedValue(true),
      incLoginAttempts: jest.fn().mockResolvedValue(true)
      };

      req.body = {
        username: 'testaffiliate',
        password: 'password123'
      };

      Affiliate.findOne = createFindOneMock(mockAffiliate);
      Affiliate.findOne.mockResolvedValue(mockAffiliate);
      encryptionUtil.verifyPassword.mockReturnValue(true);
      jwt.sign.mockReturnValue('mockToken');
      RefreshToken.prototype.save = jest.fn();
      crypto.randomBytes.mockReturnValue({
        toString: jest.fn().mockReturnValue('mock-refresh-token')
      });

      const handler = authController.affiliateLogin;
      await handler(req, res, next);

      expect(Affiliate.findOne).toHaveBeenCalledWith({ 
        username: { $regex: new RegExp('^testaffiliate$', 'i') } 
      });
      expect(encryptionUtil.verifyPassword).toHaveBeenCalledWith(
        'password123',
        'salt',
        'hashedPassword'
      );
      expect(mockAffiliate.resetLoginAttempts).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        token: 'mockToken',
        refreshToken: expect.any(String),
        affiliate: expect.objectContaining({
          affiliateId: 'AFF123',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com'
        })
      });
    });

    it('should return 401 for non-existent affiliate', async () => {
      req.body = {
        username: 'nonexistent',
        password: 'password123'
      };

      Affiliate.findOne = createFindOneMock(null);
      Affiliate.findOne.mockResolvedValue(null);

      await authController.affiliateLogin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expectErrorResponse('Invalid username or password')
      );
    });

    it('should return 401 for incorrect password', async () => {
      const mockAffiliate = {
        username: 'testaffiliate',
        passwordHash: 'hashedPassword',
        passwordSalt: 'salt'
      , save: jest.fn().mockResolvedValue(true),
        // prod-lockdown-2026-05-20: a bad password increments the lockout
        // counter via this model method before returning 401.
        incLoginAttempts: jest.fn().mockResolvedValue(true),
        resetLoginAttempts: jest.fn().mockResolvedValue(true)};

      req.body = {
        username: 'testaffiliate',
        password: 'wrongpassword'
      };

      Affiliate.findOne = createFindOneMock(mockAffiliate);
      Affiliate.findOne.mockResolvedValue(mockAffiliate);
      encryptionUtil.verifyPassword.mockReturnValue(false);

      await authController.affiliateLogin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expectErrorResponse('Invalid username or password')
      );
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid JWT token', async () => {
      const next = jest.fn();
      req.user = {
        id: 'user123',
        role: 'affiliate',
        affiliateId: 'AFF123'
      };

      const handler = authController.verifyToken;
      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        requirePasswordChange: false,
        user: {
          id: 'user123',
          role: 'affiliate',
          affiliateId: 'AFF123'
        }
      });
    });

    it('should handle missing user data', async () => {
      const next = jest.fn();
      req.user = null;

      await authController.verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('error occurred during token verification')
      });
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      req.body = {
        refreshToken: 'validRefreshToken'
      };

      const mockRefreshToken = {
        token: 'validRefreshToken',
        userId: 'user123',
        userType: 'affiliate',
        expiryDate: new Date(Date.now() + 86400000),
        isActive: true,
        save: jest.fn(),
        remove: jest.fn()
      };

      const mockAffiliate = {
        _id: 'user123',
        affiliateId: 'AFF123',
        role: 'affiliate'
,
      save: jest.fn().mockResolvedValue(true)};

      RefreshToken.findOneAndUpdate.mockResolvedValue(mockRefreshToken);
      Affiliate.findById.mockResolvedValue(mockAffiliate);
      jwt.sign.mockReturnValue('newMockToken');
      RefreshToken.prototype.save = jest.fn();
      RefreshToken.create.mockResolvedValue({
        token: 'newRefreshToken',
      save: jest.fn()
      });

      const handler = authController.refreshToken;
      await handler(req, res, next);

      expect(RefreshToken.findOneAndUpdate).toHaveBeenCalledWith(
        {
          token: 'validRefreshToken',
          revoked: null,
          expiryDate: { $gt: expect.any(Date) }
        },
        {
          revoked: expect.any(Date),
          revokedByIp: req.ip
        },
        {
          new: false
        }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        token: 'newMockToken',
        refreshToken: expect.any(String)
      });
    });

    it('should return error for invalid refresh token', async () => {
      const next = jest.fn();
      req.body = {
        refreshToken: 'invalidRefreshToken'
      };

      RefreshToken.findOne.mockResolvedValue(null);

      await authController.refreshToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expectErrorResponse('Invalid or expired refresh token')
      );
    });

    it('should return error for expired refresh token', async () => {
      req.body = {
        refreshToken: 'expiredRefreshToken'
      };

      // Expired tokens won't be found by the query
      RefreshToken.findOne.mockResolvedValue(null);

      await authController.refreshToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expectErrorResponse('Invalid or expired refresh token')
      );
    });
  });

  describe('administratorLogin', () => {
    test('should successfully login administrator', async () => {
      req.body = { email: 'admin@example.com', password: 'AdminPass123!' };

      const mockAdmin = {
        _id: 'admin123',
        adminId: 'ADM001',
        email: 'admin@example.com',
        firstName: 'Admin',
        isActive: true,
        verifyPassword: jest.fn().mockReturnValue(true),
        resetLoginAttempts: jest.fn()
      };

      Administrator.findOne = createFindOneMock(mockAdmin);
      Administrator.findOne.mockResolvedValue(mockAdmin);
      RefreshToken.prototype.save = jest.fn().mockResolvedValue(true);

      const handler = authController.administratorLogin;
      await handler(req, res, next);

      expect(Administrator.findOne).toHaveBeenCalledWith({ email: 'admin@example.com' });
      expect(mockAdmin.verifyPassword).toHaveBeenCalledWith('AdminPass123!');
      expect(mockAdmin.resetLoginAttempts).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        token: 'mock-jwt-token',
        refreshToken: 'mock-token',
        user: expect.objectContaining({
          adminId: 'ADM001'
        })
      });
    });

    test('should handle locked account', async () => {
      req.body = { email: 'locked@example.com', password: 'password' };

      const mockAdmin = {
        _id: 'admin123',
        email: 'locked@example.com',
        isActive: true,
        isLocked: true
      };

      Administrator.findOne = createFindOneMock(mockAdmin);
      Administrator.findOne.mockResolvedValue(mockAdmin);

      await authController.administratorLogin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expectErrorResponse('Account is locked due to multiple failed login attempts.')
      );
    });

    test('should handle inactive administrator', async () => {
      req.body = { email: 'inactive@example.com', password: 'password' };

      const mockAdmin = {
        email: 'inactive@example.com',
        isActive: false,
        isLocked: false
      };

      Administrator.findOne = createFindOneMock(mockAdmin);
      Administrator.findOne.mockResolvedValue(mockAdmin);

      await authController.administratorLogin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expectErrorResponse('Account is deactivated. Please contact system administrator.')
      );
    });
  });

  describe('operatorLogin', () => {
    test('should successfully login operator with PIN', async () => {
      // Set up environment for PIN-based auth
      process.env.OPERATOR_PIN = '1234';
      process.env.DEFAULT_OPERATOR_ID = 'OP001';
      
      req.body = { pinCode: '1234' };

      const mockOperator = {
        _id: 'op123',
        operatorId: 'OP001',
        email: 'operator@example.com',
        firstName: 'John',
        lastName: 'Doe',
        isActive: true,
        isOnShift: true,
        shiftStart: '00:00',
        shiftEnd: '23:59',
        resetLoginAttempts: jest.fn()
,
      save: jest.fn().mockResolvedValue(true)};

      Operator.findOne = createFindOneMock(mockOperator);
      RefreshToken.prototype.save = jest.fn().mockResolvedValue(true);

      const handler = authController.operatorLogin;
      await handler(req, res, next);

      expect(Operator.findOne).toHaveBeenCalledWith({ operatorId: 'OP001' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        token: 'mock-jwt-token',
        refreshToken: 'mock-token',
        operator: expect.objectContaining({
          operatorId: 'OP001',
          firstName: 'John'
        })
      });
    });

    test('should fail with invalid PIN', async () => {
      // Set up environment for PIN-based auth
      process.env.OPERATOR_PIN = '1234';
      process.env.DEFAULT_OPERATOR_ID = 'OP001';
      
      req.body = { pinCode: 'wrong' };

      await authController.operatorLogin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expectErrorResponse('Invalid PIN code')
      );
    });
  });

  describe('logout', () => {
    test('should logout user and blacklist token', async () => {
      req.user = { id: 'user123', role: 'affiliate' };
      req.headers.authorization = 'Bearer mock-jwt-token';
      req.body = { refreshToken: 'refresh-token' };

      TokenBlacklist.blacklistToken = jest.fn().mockResolvedValue(true);
      RefreshToken.findOneAndDelete.mockResolvedValue(true);
      jwt.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      const handler = authController.logout;
      await handler(req, res, next);

      expect(TokenBlacklist.blacklistToken).toHaveBeenCalled();
      expect(RefreshToken.findOneAndDelete).toHaveBeenCalledWith({ token: 'refresh-token' });
      expect(res.json).toHaveBeenCalledWith(
        expectSuccessResponse(null, 'Logged out successfully')
      );
    });
  });

  describe('forgotPassword', () => {
    test('should send password reset email for affiliate', async () => {
      req.body = { email: 'affiliate@example.com', userType: 'affiliate' };

      const mockAffiliate = {
        _id: 'aff123',
        email: 'affiliate@example.com',
      save: jest.fn().mockResolvedValue(true)
      };

      Affiliate.findOne = createFindOneMock(mockAffiliate);
      Affiliate.findOne.mockResolvedValue(mockAffiliate);
      emailService.sendAffiliatePasswordResetEmail = jest.fn().mockResolvedValue(true);
      emailService.sendPasswordResetEmail = jest.fn().mockResolvedValue(true);

      const handler = authController.forgotPassword;
      await handler(req, res, next);

      expect(mockAffiliate.save).toHaveBeenCalled();
      expect(emailService.sendAffiliatePasswordResetEmail).toHaveBeenCalled();
      // APP-013: generic 200 message regardless of email existence.
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    });

    test('should handle non-existent email gracefully (APP-013: no user-enumeration)', async () => {
      // PR 7: 'customer' is no longer a password-reset user type (customers are
      // registration-only). Use 'affiliate' with no matching record to exercise
      // the silent-200 (no-enumeration) path.
      req.body = { email: 'notfound@example.com', userType: 'affiliate' };

      Affiliate.findOne = createFindOneMock(null);
      Affiliate.findOne.mockResolvedValue(null);

      await authController.forgotPassword(req, res, next);

      // APP-013 / prod-lockdown-2026-05-20: do NOT signal email existence.
      // Previously this returned 404 with "No account found ..." which
      // gave any unauthenticated requester a user-enumeration primitive.
      // The new behavior is a generic 200 — same response shape for any
      // email, whether registered or not.
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    });

    test('should also return generic 200 for known emails (APP-013 symmetry)', async () => {
      req.body = { email: 'known@example.com', userType: 'affiliate' };
      const mockAffiliate = {
        _id: 'aff999',
        email: 'known@example.com',
        save: jest.fn().mockResolvedValue(true)
      };
      Affiliate.findOne = createFindOneMock(mockAffiliate);
      Affiliate.findOne.mockResolvedValue(mockAffiliate);
      emailService.sendAffiliatePasswordResetEmail = jest.fn().mockResolvedValue(true);

      await authController.forgotPassword(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    });

    // Regression guard: the emailed link must be the SPA shell
    // (/embed-app-v2.html?route=/reset-password), never the bare clean path.
    // There is no server route for GET /reset-password — only the SPA client
    // router knows it — so the bare form fell through to the marketing page
    // (HTTP 200) and the token was silently discarded.
    test.each([
      ['affiliate', () => Affiliate, 'sendAffiliatePasswordResetEmail'],
      ['administrator', () => Administrator, 'sendAdministratorPasswordResetEmail']
    ])('emails a SPA-shell reset link for %s, never the bare /reset-password path', async (userType, getModel, sender) => {
      const originalFrontendUrl = process.env.FRONTEND_URL;
      process.env.FRONTEND_URL = 'https://rundberglaundry.com';

      try {
        const Model = getModel();
        req.body = { email: `${userType}@example.com`, userType };

        const mockUser = {
          _id: 'user-1',
          email: `${userType}@example.com`,
          save: jest.fn().mockResolvedValue(true)
        };
        Model.findOne = createFindOneMock(mockUser);
        Model.findOne.mockResolvedValue(mockUser);
        emailService[sender] = jest.fn().mockResolvedValue(true);

        await authController.forgotPassword(req, res, next);

        expect(emailService[sender]).toHaveBeenCalledTimes(1);
        const resetUrl = emailService[sender].mock.calls[0][1];

        expect(resetUrl).toContain('/embed-app-v2.html?route=/reset-password');
        expect(resetUrl).toContain('token=mock-token');
        expect(resetUrl).toContain(`type=${userType}`);
        // The clean path has no server route — it must never be emailed.
        expect(resetUrl).not.toMatch(/^https?:\/\/[^/]+\/reset-password\?/);
      } finally {
        if (originalFrontendUrl === undefined) {
          delete process.env.FRONTEND_URL;
        } else {
          process.env.FRONTEND_URL = originalFrontendUrl;
        }
      }
    });
  });

  describe('resetPassword', () => {
    test('should reset password with valid token', async () => {
      req.body = {
        token: 'valid-token',
        password: 'NewPass123!',
        userType: 'affiliate'
      };

      const mockAffiliate = {
        _id: 'aff123',
        resetToken: 'hashed-token',
        resetTokenExpiry: Date.now() + 3600000,
        save: jest.fn().mockResolvedValue(true)
      };

      Affiliate.findOne = createFindOneMock(mockAffiliate);
      Affiliate.findOne.mockResolvedValue(mockAffiliate);
      encryptionUtil.hashPassword.mockReturnValue({
        salt: 'new-salt',
        hash: 'new-hash'
      });

      const handler = authController.resetPassword;
      await handler(req, res, next);

      expect(Affiliate.findOne).toHaveBeenCalledWith({
        resetToken: 'hashed-token',
        resetTokenExpiry: { $gt: expect.any(Number) }
      });
      expect(mockAffiliate.passwordSalt).toBe('new-salt');
      expect(mockAffiliate.passwordHash).toBe('new-hash');
      expect(mockAffiliate.resetToken).toBeUndefined();
      expect(mockAffiliate.resetTokenExpiry).toBeUndefined();
      expect(res.json).toHaveBeenCalledWith(
        expectSuccessResponse(null, 'Password has been reset successfully')
      );
    });

    test('should reject expired token', async () => {
      // PR 7: 'customer' is no longer a password-reset user type. Use 'affiliate'
      // with no matching record so the expired/invalid-token path is exercised.
      req.body = {
        token: 'expired-token',
        password: 'NewPass123!',
        userType: 'affiliate'
      };

      Affiliate.findOne = createFindOneMock(null);
      Affiliate.findOne.mockResolvedValue(null);

      await authController.resetPassword(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expectErrorResponse('Invalid or expired token')
      );
    });
  });
});