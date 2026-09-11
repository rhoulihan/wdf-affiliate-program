const express = require('express');
const { body } = require('express-validator');

const affiliateApplicationController = require('../controllers/affiliateApplicationController');
const { contactFormBurstLimiter, contactFormLimiter } = require('../middleware/rateLimiting');

const router = express.Router();

const ALLOWED_AFFILIATIONS = ['ut-student', 'ut-alum', 'other'];
const ALLOWED_TRANSPORT = ['car', 'bike', 'scooter', 'on-foot', 'other'];

const affiliateApplicationValidators = [
  body('firstName')
    .exists({ checkFalsy: true }).withMessage('First name is required')
    .bail()
    .isString().trim()
    .isLength({ min: 1, max: 50 }).withMessage('First name must be 1–50 characters'),
  body('lastName')
    .exists({ checkFalsy: true }).withMessage('Last name is required')
    .bail()
    .isString().trim()
    .isLength({ min: 1, max: 50 }).withMessage('Last name must be 1–50 characters'),
  body('email')
    .exists({ checkFalsy: true }).withMessage('Email is required')
    .bail()
    .isEmail().withMessage('Valid email is required')
    .bail()
    .isLength({ max: 100 }).withMessage('Email must be 100 characters or fewer'),
  body('phone')
    .exists({ checkFalsy: true }).withMessage('Phone is required')
    .bail()
    .isString().isLength({ max: 30 }),
  body('affiliation')
    .optional({ checkFalsy: true })
    .isString()
    .isIn(ALLOWED_AFFILIATIONS).withMessage('Affiliation must be one of: ' + ALLOWED_AFFILIATIONS.join(', ')),
  body('serviceArea')
    .optional({ checkFalsy: true })
    .isString().isLength({ max: 200 }),
  body('transport')
    .optional({ checkFalsy: true })
    .isString()
    .isIn(ALLOWED_TRANSPORT).withMessage('Transport must be one of: ' + ALLOWED_TRANSPORT.join(', ')),
  body('availability')
    .optional({ checkFalsy: true })
    .isString().isLength({ max: 200 }),
  // REQUIRED as of 2026-09-11: this is the marketing / customer-acquisition
  // plan, and it is the field the program actually screens on. The partner owns
  // customer acquisition (that is why they keep 100% of the service fees), so an
  // applicant who cannot describe how they would build a customer base is not a
  // fit. Enforced server-side because the HTML `required` attribute is trivially
  // bypassed by posting directly to the API.
  body('message')
    .exists({ checkFalsy: true }).withMessage('Please describe how you would market the service and build your customer base')
    .bail()
    .isString().trim()
    .isLength({ min: 80, max: 2000 })
    .withMessage('Please give us at least a couple of sentences (80–2000 characters) on how you would find and keep customers'),
  body('source')
    .optional({ checkFalsy: true })
    .isString().isLength({ max: 200 })
];

router.post(
  '/affiliate-application',
  contactFormBurstLimiter,
  contactFormLimiter,
  affiliateApplicationValidators,
  affiliateApplicationController.submitAffiliateApplication
);

module.exports = router;
