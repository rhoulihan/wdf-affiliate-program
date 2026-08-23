// Customer Routes for Laundromat Affiliate Program
//
// Phase 1: the customer surface is bag-claim registration only — there is no
// customer login, dashboard, profile, or order portal. The only authenticated
// reader is the administrator customer list. (Portal preserved on the
// `phase2-reference` tag.)

const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { authenticate } = require('../middleware/auth');
const { checkRole } = require('../middleware/rbac');
const { body } = require('express-validator');
const { registrationLimiter, createCustomLimiter } = require('../middleware/rateLimiting');
const { handleValidationErrors } = require('../middleware/locationValidation');

// Tight limiter on top of the global apiLimiter for the public claim
// resolver (anti-enumeration, spec §9 — mirrors bagRoutes' bag-resolve).
const claimResolveLimiter = createCustomLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  name: 'claim-resolve',
  skip: () => process.env.NODE_ENV === 'test'
});

// Backstop limiter on the email-confirm link (the token is 256-bit, so this is
// abuse protection, not the security boundary).
const emailVerifyLimiter = createCustomLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  name: 'email-verify',
  skip: () => process.env.NODE_ENV === 'test'
});

/**
 * @route   GET /api/customers/check-rate-limit
 * @desc    Check if registration rate limit would be exceeded
 * @access  Public
 */
router.get('/check-rate-limit', (req, res, next) => {
  // Apply the registration rate limiter to check
  registrationLimiter(req, res, (err) => {
    if (err) {
      // Rate limit would be exceeded
      return res.status(429).json({
        success: false,
        message: 'Too many registration attempts from this IP, please try again later',
        retryAfter: err.retryAfter || 3600
      });
    }
    // Rate limit check passed
    res.json({
      success: true,
      message: 'Rate limit check passed'
    });
  });
});

/**
 * @route   GET /api/v1/customers/claim/:bagToken
 * @desc    Resolve a scanned bag token (claimable | claimed | invalid)
 * @access  Public (rate-limited; anti-enumeration)
 */
router.get('/claim/:bagToken', claimResolveLimiter, customerController.resolveClaim);

/**
 * @route   GET /api/v1/customers/verify-email/:token
 * @desc    Consume the welcome-email confirm link → verify the customer's email
 *          (single-use). Serves a branded landing page. Public; no CSRF (GET link).
 *          Rate-limited as a backstop (the token is 256-bit; brute force is moot).
 * @access  Public
 */
router.get('/verify-email/:token', emailVerifyLimiter, customerController.verifyEmail);

/**
 * @route   GET/PATCH /api/v1/customers/me
 * @desc    The registered customer reads/updates their own contact info from the
 *          "Edit my info" form. Authorized by the customer scan-session (scanAuth);
 *          CSRF-exempt (x-scan-session header, no ambient cookie).
 * @access  Customer scan-session
 */
const scanAuth = require('../middleware/scanAuth');
router.get('/me', scanAuth, customerController.getMe);
router.patch('/me', scanAuth, [
  body('firstName').optional().trim().notEmpty().isLength({ max: 50 }),
  body('lastName').optional().trim().notEmpty().isLength({ max: 50 }),
  body('email').optional().isEmail().withMessage('A valid email is required'),
  body('phone').optional().trim().notEmpty().withMessage('Phone cannot be empty'),
  body('address').optional().trim().notEmpty().isLength({ max: 200 }),
  body('city').optional().trim().notEmpty().isLength({ max: 100 }),
  body('state').optional().trim().notEmpty().isLength({ max: 50 }),
  body('zipCode').optional().trim().notEmpty().isLength({ max: 20 }),
  body('phoneIdToken').optional().isString().isLength({ max: 4096 })
], handleValidationErrors, customerController.updateMe);

/**
 * @route   POST /api/v1/customers/claim/:bagToken/register
 * @desc    Register a new customer against an issued bag (affiliate derived from the bag).
 *          Phone is the required verification (a Firebase phoneIdToken when phone
 *          verification is enabled). Email is REQUIRED and stored unverified —
 *          verified later via the welcome-email confirm link. No username/password.
 * @access  Public (registrationLimiter; CSRF-exempt registration class)
 */
router.post('/claim/:bagToken/register', registrationLimiter, [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('A valid email is required'),
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('address').notEmpty().withMessage('Address is required'),
  body('city').notEmpty().withMessage('City is required'),
  body('state').notEmpty().withMessage('State is required'),
  body('zipCode').notEmpty().withMessage('ZIP code is required')
], handleValidationErrors, customerController.claimRegister);

/**
 * @route   GET /api/customers/admin/list
 * @desc    Get customers list for admin dashboard
 * @access  Admin only
 */
router.get('/admin/list', authenticate, checkRole(['administrator']), customerController.getCustomersForAdmin);

module.exports = router;
