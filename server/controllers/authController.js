// Authentication Controller for Laundromat Affiliate Program

const RefreshToken = require('../models/RefreshToken');
const TokenBlacklist = require('../models/TokenBlacklist');
const Affiliate = require('../models/Affiliate');
const Administrator = require('../models/Administrator');
const Operator = require('../models/Operator');
const encryptionUtil = require('../utils/encryption');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const emailService = require('../utils/emailService');
const logger = require('../utils/logger');
const { logLoginAttempt, logAuditEvent, AuditEvents } = require('../utils/auditLogger');
const { sanitizeInput } = require('../middleware/sanitization');
const { escapeRegex } = require('../utils/securityUtils');

const passwordResetService = require('../services/passwordResetService');
const authTokenService = require('../services/authTokenService');

// Wrapper for crypto.randomBytes to allow mocking in tests
// This allows us to mock just this function without affecting the entire crypto module
const cryptoWrapper = {
  randomBytes: (size) => crypto.randomBytes(size)
};

// JWT + refresh-token helpers live in authTokenService; these thin wrappers
// preserve the original in-module signatures so the login flows below don't
// have to change.
const generateToken = authTokenService.generateToken;
const generateRefreshToken = (userId, userType, ip, replaceToken = null) =>
  authTokenService.generateRefreshToken({ userId, userType, ip, replaceToken, cryptoWrapper });

/**
 * Affiliate login controller
 */
exports.affiliateLogin = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find affiliate by username (case-insensitive)
    const affiliate = await Affiliate.findOne({
      username: { $regex: new RegExp('^' + escapeRegex(username) + '$', 'i') }
    });

    if (!affiliate) {
      logLoginAttempt(false, 'affiliate', username, req, 'User not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    // H-5: account-level lockout. Check BEFORE password verification so a
    // locked account doesn't leak timing info via the PBKDF2 hash check.
    // prod-lockdown-2026-05-20.
    if (affiliate.isLocked) {
      logLoginAttempt(false, 'affiliate', username, req, 'Account locked');
      return res.status(403).json({
        success: false,
        message: 'Account is locked due to multiple failed login attempts. Please try again later.'
      });
    }

    // Verify password
    const isPasswordValid = encryptionUtil.verifyPassword(
      password,
      affiliate.passwordSalt,
      affiliate.passwordHash
    );

    if (!isPasswordValid) {
      await affiliate.incLoginAttempts();
      logLoginAttempt(false, 'affiliate', username, req, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    // Reset failed-attempt counter on success (also sets lastLogin)
    await affiliate.resetLoginAttempts();

    // Generate token
    const token = generateToken({
      id: affiliate._id,
      affiliateId: affiliate.affiliateId,
      role: 'affiliate'
    });

    // Generate refresh token
    const refreshToken = await generateRefreshToken(
      affiliate._id,
      'affiliate',
      req.ip
    );

    // Log successful login
    logLoginAttempt(true, 'affiliate', username, req);

    res.status(200).json({
      success: true,
      token, // Access token
      refreshToken,
      affiliate: {
        affiliateId: affiliate.affiliateId,
        firstName: affiliate.firstName,
        lastName: affiliate.lastName,
        email: affiliate.email
      }
    });
  } catch (error) {
    logger.error('Affiliate login error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during login'
    });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const tokens = await authTokenService.refreshAccessToken({
      refreshToken: req.body.refreshToken,
      ip: req.ip,
      cryptoWrapper
    });
    res.status(200).json({ success: true, ...tokens });
  } catch (err) {
    if (err.isAuthTokenError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error('Refresh token error:', err);
    res.status(500).json({ success: false, message: 'An error occurred during token refresh' });
  }
};

/**
 * Administrator login controller
 */
exports.administratorLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find administrator by email
    const administrator = await Administrator.findOne({ email });

    if (!administrator) {
      logLoginAttempt(false, 'administrator', email, req, 'User not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is active
    if (!administrator.isActive) {
      logLoginAttempt(false, 'administrator', email, req, 'Account inactive');
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact system administrator.'
      });
    }

    // Check if account is locked
    if (administrator.isLocked) {
      logLoginAttempt(false, 'administrator', email, req, 'Account locked');
      return res.status(403).json({
        success: false,
        message: 'Account is locked due to multiple failed login attempts.'
      });
    }

    // Verify password
    const isPasswordValid = administrator.verifyPassword(password);

    if (!isPasswordValid) {
      // Increment failed login attempts
      await administrator.incLoginAttempts();

      logLoginAttempt(false, 'administrator', email, req, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Reset failed login attempts
    await administrator.resetLoginAttempts();

    // Check if password change is required
    if (administrator.requirePasswordChange) {
      // Generate a limited token that only allows password change
      const token = generateToken({
        id: administrator._id,
        adminId: administrator.adminId,
        role: 'administrator',
        permissions: ['change_password_required'],
        requirePasswordChange: true
      });

      // Don't generate refresh token for password change required
      return res.status(200).json({
        success: true,
        token,
        requirePasswordChange: true,
        message: 'Password change required for first login',
        user: {
          id: administrator._id,
          adminId: administrator.adminId,
          email: administrator.email,
          requirePasswordChange: true
        }
      });
    }

    // Generate token
    const token = generateToken({
      id: administrator._id,
      adminId: administrator.adminId,
      role: 'administrator',
      permissions: administrator.permissions
    });

    // Generate refresh token
    const refreshToken = await generateRefreshToken(
      administrator._id,
      'administrator',
      req.ip
    );

    // Log successful login
    logLoginAttempt(true, 'administrator', email, req);
    logAuditEvent(AuditEvents.AUTH_LOGIN, {
      userType: 'administrator',
      userId: administrator._id,
      adminId: administrator.adminId
    }, req);

    res.status(200).json({
      success: true,
      token,
      refreshToken,
      user: {
        id: administrator._id,
        adminId: administrator.adminId,
        firstName: administrator.firstName,
        lastName: administrator.lastName,
        email: administrator.email,
        role: 'administrator',
        permissions: administrator.permissions
      }
    });
  } catch (error) {
    logger.error('Administrator login error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during login'
    });
  }
};

/**
 * Operator login controller
 */
exports.operatorLogin = async (req, res) => {
  try {
    const { pinCode } = req.body;

    // Validate PIN code is provided
    if (!pinCode) {
      return res.status(400).json({
        success: false,
        message: 'PIN code is required'
      });
    }

    // Check if PIN matches the configured operator PIN
    const configuredPin = process.env.OPERATOR_PIN;
    if (!configuredPin) {
      logger.error('OPERATOR_PIN not configured in environment');
      return res.status(500).json({
        success: false,
        message: 'System configuration error'
      });
    }

    // Verify PIN code — constant-time compare to prevent timing
    // side-channel inference. timingSafeEqual requires equal-length
    // buffers, so length-mismatch is rejected up front (still constant-
    // time within the equal-length path that matters). APP-010 /
    // prod-lockdown-2026-05-20.
    const crypto = require('crypto');
    const submitted = Buffer.from(String(pinCode), 'utf8');
    const expected = Buffer.from(configuredPin, 'utf8');
    const pinMatches = submitted.length === expected.length &&
                       crypto.timingSafeEqual(submitted, expected);
    if (!pinMatches) {
      logLoginAttempt(false, 'operator', 'PIN', req, 'Invalid PIN');
      return res.status(401).json({
        success: false,
        message: 'Invalid PIN code'
      });
    }

    // Find default operator for PIN-based login
    const defaultOperatorId = process.env.DEFAULT_OPERATOR_ID || 'OP001';
    const operator = await Operator.findOne({ operatorId: defaultOperatorId });

    if (!operator) {
      logger.error('Default operator not found:', defaultOperatorId);
      return res.status(404).json({
        success: false,
        message: 'Default operator not configured'
      });
    }

    // Check if account is active
    if (!operator.isActive) {
      logLoginAttempt(false, 'operator', defaultOperatorId, req, 'Account inactive');
      return res.status(403).json({
        success: false,
        message: 'Operator account is inactive. Please contact your supervisor.'
      });
    }

    // Check shift hours
    if (!operator.isOnShift) {
      logLoginAttempt(false, 'operator', defaultOperatorId, req, 'Outside shift hours');
      return res.status(403).json({
        success: false,
        message: 'Login not allowed outside of shift hours',
        shiftHours: `${operator.shiftStart} - ${operator.shiftEnd}`
      });
    }

    // Reset login attempts
    await operator.resetLoginAttempts();

    // Generate token
    const token = generateToken({
      id: operator._id,
      operatorId: operator.operatorId,
      role: 'operator'
    });

    // Generate refresh token
    const refreshToken = await generateRefreshToken(
      operator._id,
      'operator',
      req.ip
    );

    // Log successful login
    logLoginAttempt(true, 'operator', operator.operatorId, req);
    logAuditEvent(AuditEvents.AUTH_LOGIN, {
      userType: 'operator',
      userId: operator._id,
      operatorId: operator.operatorId,
      shift: `${operator.shiftStart} - ${operator.shiftEnd}`,
      loginMethod: 'PIN'
    }, req);

    res.status(200).json({
      success: true,
      token,
      refreshToken,
      operator: {
        id: operator._id,
        operatorId: operator.operatorId,
        firstName: operator.firstName,
        lastName: operator.lastName,
        email: operator.email,
        role: 'operator',
        shiftStart: operator.shiftStart,
        shiftEnd: operator.shiftEnd,
        workStation: operator.workStation
      }
    });
  } catch (error) {
    logger.error('Operator login error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during login'
    });
  }
};

// Phase 1: customer login removed — the customer surface is bag-claim
// registration only (no customer portal). Preserved on `phase2-reference`.

/**
 * Request password reset
 */
exports.forgotPassword = async (req, res) => {
  try {
    await passwordResetService.forgotPassword({
      email: req.body.email,
      userType: req.body.userType,
      cryptoWrapper
    });
    // Intentionally generic: same response whether or not the email was
    // registered. The service silently returns when the email doesn't
    // match (no PasswordResetError thrown for the not-found case). APP-013
    // / prod-lockdown-2026-05-20.
    res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.'
    });
  } catch (err) {
    if (err.isPasswordResetError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error('Forgot password error:', err);
    res.status(500).json({
      success: false,
      message: 'An error occurred while processing your request'
    });
  }
};

/**
 * Reset password with token
 */
exports.resetPassword = async (req, res) => {
  try {
    await passwordResetService.resetPassword({
      token: req.body.token,
      userType: req.body.userType,
      password: req.body.password
    });
    res.status(200).json({ success: true, message: 'Password has been reset successfully' });
  } catch (err) {
    if (err.isPasswordResetError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error('Reset password error:', err);
    res.status(500).json({
      success: false,
      message: 'An error occurred while resetting your password'
    });
  }
};

/**
 * Verify JWT token
 */
exports.verifyToken = async (req, res) => {
  try {
    const payload = authTokenService.describeVerifiedUser(req.user);
    res.status(200).json({ success: true, ...payload });
  } catch (err) {
    if (err.isAuthTokenError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error('Token verification error:', err);
    res.status(500).json({
      success: false,
      message: 'An error occurred during token verification'
    });
  }
};

/**
 * Logout user
 */
exports.logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization || req.headers['x-auth-token'];
    let accessToken;
    if (authHeader) {
      accessToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
    }

    await authTokenService.logout({
      refreshToken: req.body.refreshToken,
      accessToken,
      user: req.user
    });
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ success: false, message: 'An error occurred during logout' });
  }
};

// Export cryptoWrapper for testing
exports._cryptoWrapper = cryptoWrapper;

module.exports = exports;
