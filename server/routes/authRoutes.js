// Authentication Routes for Laundromat Affiliate Program

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter, passwordResetLimiter, registrationLimiter, adminLoginLimiter } = require('../middleware/rateLimiting');
const adminIpGate = require('../middleware/adminIpGate');
const operatorIpGate = require('../middleware/operatorIpGate');
const { body, validationResult } = require('express-validator');
const { customPasswordValidator } = require('../utils/passwordValidator');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => err.msg)
    });
  }
  next();
};

/**
 * @route   POST /api/auth/affiliate/login
 * @desc    Login affiliate
 * @access  Public
 */
router.post('/affiliate/login',
  authLimiter,
  [
    body('username').trim().notEmpty().withMessage('Username is required')
      .isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  validate,
  authController.affiliateLogin
);

// Phase 1: customer login removed — the customer surface is bag-claim
// registration only (no customer portal). Preserved on `phase2-reference`.

/**
 * @route   POST /api/auth/administrator/login
 * @desc    Login administrator
 * @access  Public
 */
router.post('/administrator/login',
  adminIpGate,
  adminLoginLimiter,
  [
    body('email').trim().isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  validate,
  authController.administratorLogin
);


/**
 * @route   POST /api/auth/operator/login
 * @desc    Login operator with PIN code
 * @access  Public
 */
router.post('/operator/login',
  operatorIpGate,
  authLimiter,
  [
    body('pinCode').trim().notEmpty().withMessage('PIN code is required')
      .isNumeric().withMessage('PIN code must be numeric')
      .isLength({ min: 4, max: 6 }).withMessage('PIN code must be 4-6 digits')
  ],
  validate,
  authController.operatorLogin
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post('/forgot-password',
  passwordResetLimiter,
  [
    body('email').trim().isEmail().withMessage('Valid email is required'),
    body('userType').isIn(['affiliate', 'customer', 'administrator', 'operator']).withMessage('Invalid user type')
  ],
  validate,
  authController.forgotPassword
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
router.post('/reset-password',
  passwordResetLimiter,
  [
    body('token').trim().notEmpty().withMessage('Reset token is required')
      .isLength({ min: 64, max: 64 }).withMessage('Invalid reset token'),
    body('userType').isIn(['affiliate', 'customer', 'administrator', 'operator']).withMessage('Invalid user type'),
    body('password').custom(customPasswordValidator())
  ],
  validate,
  authController.resetPassword
);

/**
 * @route   GET /api/auth/verify
 * @desc    Verify user token
 * @access  Private
 */
router.get('/verify', authenticate, authController.verifyToken);

router.post('/refresh-token',
  [
    body('refreshToken').trim().notEmpty().withMessage('Refresh token is required')
      .isLength({ min: 80, max: 80 }).withMessage('Invalid refresh token format')
  ],
  validate,
  authController.refreshToken
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout',
  authenticate,
  [
    body('refreshToken').trim().notEmpty().withMessage('Refresh token is required')
  ],
  validate,
  authController.logout
);

module.exports = router;