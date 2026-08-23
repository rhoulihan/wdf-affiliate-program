// manualAffiliateController — admin hand-creates an affiliate account without
// an invite. Primary use: zero-commission 'location' affiliates (Laundromat-operated
// collection points with a contact where bags are dropped/collected on a
// schedule), but 'standard' is accepted too.
//
// The server provisions BOTH one-time secrets:
//   - a temporary login password (returned once, never logged)
//   - the affiliate delivery code  (returned once, never logged)
// mirroring how invited registration provisions the delivery code (spec §4.6).

const crypto = require('crypto');
const { validationResult } = require('express-validator');
const Affiliate = require('../../models/Affiliate');
const SystemConfig = require('../../models/SystemConfig');
const geocodingService = require('../../services/geocodingService');
const encryptionUtil = require('../../utils/encryption');
const roleCodes = require('../../utils/roleCodes');
const ControllerHelpers = require('../../utils/controllerHelpers');
const { logAuditEvent, AuditEvents } = require('../../utils/auditLogger');
const logger = require('../../utils/logger');

// Character sets for the generated temporary password — one draw from each
// guarantees upper/lower/digit/symbol; the rest is uniform over the union.
const PW_SETS = [
  'ABCDEFGHJKMNPQRSTUVWXYZ',
  'abcdefghjkmnpqrstuvwxyz',
  '23456789',
  '!@#$%^*-_+'
];

/**
 * Generate a 16-char temporary password with at least one character from
 * every class (crypto-random, unbiased via crypto.randomInt).
 * @returns {string}
 */
function generateTemporaryPassword() {
  const all = PW_SETS.join('');
  const chars = PW_SETS.map(set => set[crypto.randomInt(set.length)]);
  while (chars.length < 16) {
    chars.push(all[crypto.randomInt(all.length)]);
  }
  // Fisher–Yates so the guaranteed classes aren't always in the lead positions
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * POST /api/v1/administrators/affiliates
 *
 * Create an affiliate manually (no invite). Defaults to affiliateType
 * 'location' (zero-commission collection point) with $0 delivery fees unless
 * fees are provided; accepts 'standard' too.
 *
 * Responds 201 with { affiliateId, temporaryPassword, deliveryCode } — the two
 * secrets are shown exactly once and never logged. 409 on duplicate
 * email/username.
 */
exports.createAffiliateManually = ControllerHelpers.asyncWrapper(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const {
    firstName, lastName, email, phone, businessName,
    address, city, state, zipCode, username, languagePreference,
    affiliateType = 'location',
    serviceType,
    orderNotificationsEnabled,
    pickupInstructions,
    deliveryInstructions,
    deliveryFee
  } = req.body;

  const normalizedEmail = String(email).toLowerCase().trim();
  const normalizedUsername = String(username).trim();

  const [existingEmail, existingUsername] = await Promise.all([
    Affiliate.findOne({ email: normalizedEmail }),
    Affiliate.findOne({ username: normalizedUsername })
  ]);
  if (existingEmail || existingUsername) {
    return ControllerHelpers.sendError(
      res,
      existingEmail ? 'Email already registered' : 'Username already taken',
      409,
      [{ code: existingEmail ? 'duplicate_email' : 'duplicate_username' }]
    );
  }

  // One-time secrets — generated server-side, returned once, never logged.
  const temporaryPassword = generateTemporaryPassword();
  const { salt, hash } = encryptionUtil.hashPassword(temporaryPassword);
  const deliveryCodeLength = await SystemConfig.getValue('affiliate_delivery_code_length', 6);
  const deliveryCode = roleCodes.generateNumericCode(deliveryCodeLength); // 6-digit partner staff code

  const affiliate = new Affiliate({
    affiliateType,
    // serviceType (pickup_location|full_service) is independent of commission
    // type; the model's pre-validate hook defaults notifications by serviceType
    // when orderNotificationsEnabled isn't explicitly provided.
    ...(serviceType !== undefined ? { serviceType } : {}),
    ...(orderNotificationsEnabled !== undefined ? { orderNotificationsEnabled } : {}),
    pickupInstructions: String(pickupInstructions).trim(),
    // Delivery instructions are optional (shown in the out-for-delivery email).
    ...(deliveryInstructions !== undefined ? { deliveryInstructions: String(deliveryInstructions).trim() } : {}),
    firstName, lastName,
    email: normalizedEmail,
    phone, businessName,
    address, city, state, zipCode,
    username: normalizedUsername,
    passwordSalt: salt,
    passwordHash: hash,
    paymentMethod: 'check',
    languagePreference: languagePreference || 'en',
    // Flat per-affiliate delivery fee. Defaults to 0 (→ the Laundromat Associates
    // default_delivery_fee applies); the V1 min/per-bag pair was removed.
    deliveryFee: deliveryFee !== undefined ? parseFloat(deliveryFee) : 0,
    affiliateDeliveryCodeHash: roleCodes.hashCode(deliveryCode),
    affiliateDeliveryCodeSetAt: new Date()
  });

  try {
    await affiliate.save();
  } catch (err) {
    if (err && err.code === 11000) {
      // Unique-index backstop for a create race
      return ControllerHelpers.sendError(res, 'Email or username already in use', 409,
        [{ code: 'duplicate' }]);
    }
    throw err;
  }

  logAuditEvent(AuditEvents.AFFILIATE_CREATED_MANUALLY, {
    adminId: req.user.id,
    affiliateId: affiliate.affiliateId,
    affiliateType,
    email: normalizedEmail
  }, req);
  logger.info('Affiliate created manually by administrator', {
    affiliateId: affiliate.affiliateId, affiliateType
  });

  return res.status(201).json({
    success: true,
    affiliateId: affiliate.affiliateId,
    affiliateType,
    temporaryPassword, // shown exactly once
    deliveryCode,      // shown exactly once
    message: 'Affiliate created successfully'
  });
});

/**
 * GET /api/v1/administrators/affiliates/:affiliateId
 *
 * Returns the RAW editable affiliate record for the admin edit form (unformatted
 * values — deliveryFee is a number, not a currency string). Username is included
 * so the form can show it read-only. Credentials/delivery-code are never exposed.
 * 200 with { affiliate }; 404 unknown affiliate.
 */
exports.getAffiliateForEdit = ControllerHelpers.asyncWrapper(async (req, res) => {
  const affiliate = await Affiliate.findOne({ affiliateId: req.params.affiliateId });
  if (!affiliate) {
    return ControllerHelpers.sendError(res, 'Affiliate not found', 404, [{ code: 'not_found' }]);
  }
  return ControllerHelpers.sendSuccess(res, {
    affiliate: {
      affiliateId: affiliate.affiliateId, username: affiliate.username,
      firstName: affiliate.firstName, lastName: affiliate.lastName,
      email: affiliate.email, phone: affiliate.phone, businessName: affiliate.businessName,
      address: affiliate.address, city: affiliate.city, state: affiliate.state, zipCode: affiliate.zipCode,
      languagePreference: affiliate.languagePreference, affiliateType: affiliate.affiliateType,
      serviceType: affiliate.serviceType, orderNotificationsEnabled: affiliate.orderNotificationsEnabled,
      deliveryFee: affiliate.deliveryFee, pickupInstructions: affiliate.pickupInstructions,
      deliveryInstructions: affiliate.deliveryInstructions,
      geoValidationEnabled: affiliate.geoValidationEnabled, geoRadiusMiles: affiliate.geoRadiusMiles,
      isActive: affiliate.isActive
    }
  }, 'Affiliate retrieved');
});

/**
 * PATCH /api/v1/administrators/affiliates/:affiliateId
 *
 * Admin edits an affiliate's full record (everything except the username, which
 * is the login identity, and credentials/delivery-code, which are never touched
 * here). Whitelisted fields: firstName, lastName, email (uniqueness-checked),
 * phone, businessName, address, city, state, zipCode, languagePreference,
 * affiliateType, serviceType, orderNotificationsEnabled, deliveryFee,
 * pickupInstructions, deliveryInstructions, isActive.
 * Responds 200 with the updated record; 404 unknown affiliate; 409 email taken.
 */
exports.updateAffiliateSettings = ControllerHelpers.asyncWrapper(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const affiliate = await Affiliate.findOne({ affiliateId: req.params.affiliateId });
  if (!affiliate) {
    return ControllerHelpers.sendError(res, 'Affiliate not found', 404, [{ code: 'not_found' }]);
  }

  const changed = {};

  // Email change → normalize + enforce uniqueness across other affiliates.
  if (req.body.email !== undefined) {
    const newEmail = String(req.body.email).trim().toLowerCase();
    if (newEmail && newEmail !== String(affiliate.email || '').toLowerCase()) {
      const taken = await Affiliate.findOne({
        email: newEmail, affiliateId: { $ne: affiliate.affiliateId }
      }).select('_id');
      if (taken) {
        return ControllerHelpers.sendError(res, 'Email already in use', 409, [{ code: 'duplicate_email' }]);
      }
      affiliate.email = newEmail;
      changed.email = newEmail;
    }
  }

  // Plain trimmed-string fields.
  for (const f of ['firstName', 'lastName', 'phone', 'businessName', 'address', 'city', 'state', 'zipCode',
    'pickupInstructions', 'deliveryInstructions']) {
    if (req.body[f] !== undefined) {
      affiliate[f] = String(req.body[f]).trim();
      changed[f] = affiliate[f];
    }
  }
  // Enum fields (validated at the route layer).
  for (const f of ['languagePreference', 'affiliateType']) {
    if (req.body[f] !== undefined) {
      affiliate[f] = req.body[f];
      changed[f] = affiliate[f];
    }
  }
  if (req.body.deliveryFee !== undefined) {
    affiliate.deliveryFee = parseFloat(req.body.deliveryFee);
    changed.deliveryFee = affiliate.deliveryFee;
  }
  if (req.body.isActive !== undefined) {
    affiliate.isActive = !!req.body.isActive;
    changed.isActive = affiliate.isActive;
  }

  // serviceType + notifications keep their coupled default (explicit value wins;
  // a type change without an explicit notifications value re-applies the default).
  const serviceTypeProvided = req.body.serviceType !== undefined;
  const notificationsProvided = req.body.orderNotificationsEnabled !== undefined;
  if (serviceTypeProvided) {
    affiliate.serviceType = req.body.serviceType;
    changed.serviceType = req.body.serviceType;
  }
  if (notificationsProvided) {
    affiliate.orderNotificationsEnabled = !!req.body.orderNotificationsEnabled;
    changed.orderNotificationsEnabled = affiliate.orderNotificationsEnabled;
  } else if (serviceTypeProvided) {
    affiliate.orderNotificationsEnabled = (affiliate.serviceType === 'full_service');
    changed.orderNotificationsEnabled = affiliate.orderNotificationsEnabled;
  }

  // Customer-geolocation radius gate (opt-in).
  if (req.body.geoValidationEnabled !== undefined) {
    affiliate.geoValidationEnabled = !!req.body.geoValidationEnabled;
    changed.geoValidationEnabled = affiliate.geoValidationEnabled;
  }
  if (req.body.geoRadiusMiles !== undefined && req.body.geoRadiusMiles !== null && req.body.geoRadiusMiles !== '') {
    affiliate.geoRadiusMiles = parseFloat(req.body.geoRadiusMiles);
    changed.geoRadiusMiles = affiliate.geoRadiusMiles;
  }

  // Geocode the partner's address when geo-validation is on and we lack a fresh
  // geocode (or the address changed). Non-fatal: surfaced as a warning so the
  // admin knows the radius gate will FAIL OPEN until the address geocodes.
  let geocodeWarning = null;
  if (affiliate.geoValidationEnabled) {
    const addrChanged = ['address', 'city', 'state', 'zipCode'].some((f) => changed[f] !== undefined);
    if (addrChanged || affiliate.geoLat == null || affiliate.geoLng == null) {
      const g = await geocodingService.geocodeAddress({
        address: affiliate.address, city: affiliate.city, state: affiliate.state, zipCode: affiliate.zipCode
      });
      if (g.ok) {
        affiliate.geoLat = g.lat;
        affiliate.geoLng = g.lng;
        if (g.placeId) affiliate.geoPlaceId = g.placeId;
        affiliate.geocodedAt = new Date();
      } else {
        geocodeWarning = 'partner_address_not_geocoded';
      }
    }
  }

  try {
    await affiliate.save();
  } catch (err) {
    if (err && err.code === 11000) { // unique-index backstop (email race)
      return ControllerHelpers.sendError(res, 'Email already in use', 409, [{ code: 'duplicate_email' }]);
    }
    throw err;
  }

  logAuditEvent(AuditEvents.AFFILIATE_UPDATED, {
    adminId: req.user.id, affiliateId: affiliate.affiliateId, changed: Object.keys(changed)
  }, req);
  logger.info('Affiliate updated by administrator', {
    affiliateId: affiliate.affiliateId, changed: Object.keys(changed)
  });

  return ControllerHelpers.sendSuccess(res, {
    affiliate: {
      affiliateId: affiliate.affiliateId,
      firstName: affiliate.firstName, lastName: affiliate.lastName,
      email: affiliate.email, phone: affiliate.phone, businessName: affiliate.businessName,
      address: affiliate.address, city: affiliate.city, state: affiliate.state, zipCode: affiliate.zipCode,
      languagePreference: affiliate.languagePreference, affiliateType: affiliate.affiliateType,
      serviceType: affiliate.serviceType, orderNotificationsEnabled: affiliate.orderNotificationsEnabled,
      deliveryFee: affiliate.deliveryFee, pickupInstructions: affiliate.pickupInstructions,
      deliveryInstructions: affiliate.deliveryInstructions,
      geoValidationEnabled: affiliate.geoValidationEnabled, geoRadiusMiles: affiliate.geoRadiusMiles,
      isActive: affiliate.isActive
    },
    warning: geocodeWarning
  }, 'Affiliate updated');
});
