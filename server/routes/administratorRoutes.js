const express = require('express');
const router = express.Router();
const administratorController = require('../controllers/administratorController');
const { authenticate } = require('../middleware/auth');
const { checkRole, checkAdminPermission } = require('../middleware/rbac');
const { body } = require('express-validator');
const { customPasswordValidator } = require('../utils/passwordValidator');
const inviteController = require('../modules/onboarding/inviteController');
const { sensitiveOperationLimiter } = require('../middleware/rateLimiting');

// All routes require authentication and administrator role
router.use(authenticate);
router.use(checkRole(['administrator']));

// Dashboard (must come before /:id routes)
router.get('/dashboard', administratorController.getDashboard);

// Operator Management (must come before /:id routes)
router.post('/operators', checkAdminPermission(['operator_management']), [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').custom(customPasswordValidator())
], administratorController.createOperator);
router.get('/operators', administratorController.getOperators);
router.get('/operators/:operatorId', administratorController.getOperatorById);
router.put('/operators/:operatorId', checkAdminPermission(['operator_management']), administratorController.updateOperator);
router.delete('/operators/:operatorId', checkAdminPermission(['operator_management']), administratorController.deactivateOperator);
router.post('/operators/:operatorId/reset-password', checkAdminPermission(['operator_management']), administratorController.resetOperatorPassword);

// Affiliates list (for dropdowns, filters, etc.)
router.get('/affiliates', checkAdminPermission(['view_analytics']), administratorController.getAffiliatesList);

// Manual affiliate creation (no invite) — zero-commission 'location'
// collection points by default; 'standard' accepted. CSRF: CRITICAL_ENDPOINTS.
const manualAffiliateController = require('../modules/onboarding/manualAffiliateController');
// Single affiliate — raw editable record for the admin edit form. Defined
// before the administrator '/:id' routes so '/affiliates/:affiliateId' wins.
router.get('/affiliates/:affiliateId',
  checkAdminPermission(['manage_affiliates']),
  manualAffiliateController.getAffiliateForEdit);
router.post('/affiliates',
  checkAdminPermission(['manage_affiliates']),
  sensitiveOperationLimiter,
  [
    body('firstName').notEmpty().trim().isLength({ max: 50 }).withMessage('First name is required'),
    body('lastName').notEmpty().trim().isLength({ max: 50 }).withMessage('Last name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phone').notEmpty().trim().isLength({ max: 25 }).withMessage('Phone is required'),
    body('businessName').optional().isString().trim().isLength({ max: 100 }),
    body('address').notEmpty().trim().isLength({ max: 200 }).withMessage('Address is required'),
    body('city').notEmpty().trim().isLength({ max: 100 }).withMessage('City is required'),
    body('state').notEmpty().trim().isLength({ max: 50 }).withMessage('State is required'),
    body('zipCode').notEmpty().trim().isLength({ max: 20 }).withMessage('ZIP code is required'),
    body('username').notEmpty().trim().isLength({ min: 3, max: 50 }).withMessage('Username is required'),
    body('languagePreference').optional().isIn(['en', 'es', 'pt', 'de']),
    body('affiliateType').optional().isIn(['standard', 'location']),
    body('serviceType').optional().isIn(['pickup_location', 'full_service']),
    body('orderNotificationsEnabled').optional().isBoolean(),
    // Customer-facing pickup instructions — required for every partner.
    // trim() BEFORE notEmpty() so a whitespace-only value is rejected.
    body('pickupInstructions').trim().notEmpty().isLength({ max: 2000 })
      .withMessage('Pickup instructions are required'),
    body('deliveryInstructions').optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
    body('deliveryFee').optional().isFloat({ min: 0, max: 1000 })
  ],
  manualAffiliateController.createAffiliateManually);

// Per-affiliate settings edit (serviceType / order notifications / active /
// fees). Defined before the administrator '/:id' routes below so the more
// specific '/affiliates/:affiliateId' path wins. CSRF: CRITICAL_ENDPOINTS.
router.patch('/affiliates/:affiliateId',
  checkAdminPermission(['manage_affiliates']),
  [
    // Identity/contact (username is NOT editable — login identity).
    body('firstName').optional().trim().notEmpty().isLength({ max: 50 }),
    body('lastName').optional().trim().notEmpty().isLength({ max: 50 }),
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('phone').optional().trim().notEmpty().isLength({ max: 25 }),
    body('businessName').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('address').optional().trim().notEmpty().isLength({ max: 200 }),
    body('city').optional().trim().notEmpty().isLength({ max: 100 }),
    body('state').optional().trim().notEmpty().isLength({ max: 50 }),
    body('zipCode').optional().trim().notEmpty().isLength({ max: 20 }),
    body('languagePreference').optional().isIn(['en', 'es', 'pt', 'de']),
    body('affiliateType').optional().isIn(['standard', 'location']),
    // Settings.
    body('serviceType').optional().isIn(['pickup_location', 'full_service']),
    body('orderNotificationsEnabled').optional().isBoolean(),
    body('isActive').optional().isBoolean(),
    body('deliveryFee').optional().isFloat({ min: 0, max: 1000 }),
    // Customer-geolocation radius gate (opt-in).
    body('geoValidationEnabled').optional().isBoolean(),
    body('geoRadiusMiles').optional({ nullable: true }).isFloat({ min: 1, max: 50 }),
    // Optional on edit; if present, pickup can't be blanked (trim BEFORE notEmpty).
    body('pickupInstructions').optional().trim().notEmpty().isLength({ max: 2000 })
      .withMessage('Pickup instructions cannot be empty'),
    body('deliveryInstructions').optional({ nullable: true }).isString().trim().isLength({ max: 2000 })
  ],
  manualAffiliateController.updateAffiliateSettings);

// Affiliate invites (invite-only onboarding) — spec §5 / §6.2.
// CSRF is enforced globally on POST by conditionalCsrf.
router.post('/affiliate-invites',
  checkAdminPermission(['manage_affiliates']),
  sensitiveOperationLimiter,
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('prefill.firstName').optional().isString().trim().isLength({ max: 50 }),
    body('prefill.lastName').optional().isString().trim().isLength({ max: 50 }),
    body('prefill.businessName').optional().isString().trim().isLength({ max: 100 }),
    body('prefill.phone').optional().isString().trim().isLength({ max: 25 }),
    body('ttlHours').optional().isInt({ min: 1, max: 336 })
  ],
  inviteController.mintInvite);
router.get('/affiliate-invites',
  checkAdminPermission(['manage_affiliates']),
  inviteController.listInvites);
router.post('/affiliate-invites/:inviteId/resend',
  checkAdminPermission(['manage_affiliates']),
  sensitiveOperationLimiter,
  inviteController.resendInvite);
router.post('/affiliate-invites/:inviteId/revoke',
  checkAdminPermission(['manage_affiliates']),
  sensitiveOperationLimiter,
  inviteController.revokeInvite);

// Analytics (must come before /:id routes)
router.get('/analytics/orders', checkAdminPermission(['view_analytics']), administratorController.getOrderAnalytics);
router.get('/analytics/operators', checkAdminPermission(['view_analytics']), administratorController.getOperatorAnalytics);
router.get('/analytics/affiliates', checkAdminPermission(['view_analytics']), administratorController.getAffiliateAnalytics);

// Reports
router.post('/reports/export', checkAdminPermission(['view_analytics']), administratorController.exportReport);

// System Configuration
router.get('/config', checkAdminPermission(['system_config']), administratorController.getSystemConfig);
router.put('/config', checkAdminPermission(['system_config']), administratorController.updateSystemConfig);

// Environment Variables
router.get('/env-variables', checkAdminPermission(['system_config']), administratorController.getEnvironmentVariables);

// System Health
router.get('/system/health', administratorController.getSystemHealth);

// Add-on catalog management (admin-managed order add-ons). Defined before the
// administrator '/:id' routes so '/addons' + '/addons/:addOnId' win. Perm:
// system_config (business-config surface). CSRF enforced globally on writes.
const addonController = require('../controllers/addonController');
router.get('/addons', checkAdminPermission(['system_config']), addonController.listAll);
router.post('/addons',
  checkAdminPermission(['system_config']),
  [
    body('name').trim().notEmpty().isLength({ max: 100 }).withMessage('Name is required'),
    body('key').optional().isString().trim().isLength({ max: 100 }),
    body('price').optional().isFloat({ min: 0, max: 10000 }),
    body('priceUnit').optional().isIn(['flat', 'per_lb']),
    body('sortOrder').optional().isInt({ min: 0, max: 9999 }),
    body('isActive').optional().isBoolean(),
    body('translations.es').optional().isString().trim().isLength({ max: 100 }),
    body('translations.pt').optional().isString().trim().isLength({ max: 100 }),
    body('translations.de').optional().isString().trim().isLength({ max: 100 })
  ],
  addonController.create);
router.patch('/addons/:addOnId',
  checkAdminPermission(['system_config']),
  [
    body('name').optional().trim().notEmpty().isLength({ max: 100 }).withMessage('Name cannot be empty'),
    body('price').optional().isFloat({ min: 0, max: 10000 }),
    body('priceUnit').optional().isIn(['flat', 'per_lb']),
    body('sortOrder').optional().isInt({ min: 0, max: 9999 }),
    body('isActive').optional().isBoolean(),
    body('translations.es').optional().isString().trim().isLength({ max: 100 }),
    body('translations.pt').optional().isString().trim().isLength({ max: 100 }),
    body('translations.de').optional().isString().trim().isLength({ max: 100 })
  ],
  addonController.update);
router.delete('/addons/:addOnId', checkAdminPermission(['system_config']), addonController.deactivate);

// Administrator CRUD routes (these have :id params so must come after specific routes)
router.get('/', checkAdminPermission(['administrators.read']), administratorController.getAdministrators);
router.get('/permissions', administratorController.getPermissions);
router.post('/', checkAdminPermission(['administrators.create']), [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').custom(customPasswordValidator())
], administratorController.createAdministrator);

// Change password route (for logged-in admin changing their own password)
router.post('/change-password', [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').custom(customPasswordValidator())
], administratorController.changeAdministratorPassword);

/**
 * @route   POST /api/administrators/reset-rate-limits
 * @desc    Reset rate limiting counters across every registered bucket
 * @access  Private - Administrator only (system.manage)
 */
router.post('/reset-rate-limits', checkAdminPermission(['system.manage']),
  administratorController.resetRateLimits);

// Administrator routes with :id parameter (MUST BE LAST)
router.get('/:id', checkAdminPermission(['administrators.read']), administratorController.getAdministratorById);
router.patch('/:id', checkAdminPermission(['administrators.update']), administratorController.updateAdministrator);
router.delete('/:id', checkAdminPermission(['administrators.delete']), administratorController.deleteAdministrator);
router.post('/:id/reset-password', checkAdminPermission(['administrators.update']), administratorController.resetAdministratorPassword);


module.exports = router;