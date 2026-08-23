// Laundromat Affiliate Program
// Customer Controller
//
// Phase 1: the customer surface is bag-claim registration only. There is no
// customer login, dashboard, profile, orders, or password portal — those
// endpoints were removed (preserved on the `phase2-reference` tag). The only
// authenticated reader here is the administrator customer list.

const Customer = require('../models/Customer');
const { validationResult } = require('express-validator');

// Extracted services
const crypto = require('crypto');
const customerRegistrationService = require('../services/customerRegistrationService');
const bagClaimService = require('../services/bagClaimService');
const firebasePhoneService = require('../services/firebasePhoneService');
const emailService = require('../utils/emailService');

// Utility modules
const ControllerHelpers = require('../utils/controllerHelpers');
const AuthorizationHelpers = require('../middleware/authorizationHelpers');
const Formatters = require('../utils/formatters');
const { effectiveDeliveryFee } = require('../utils/deliveryFee');

// ============================================================================
// Customer Controllers
// ============================================================================

/**
 * Resolve a scanned bag token into a claim-page state.
 * Public; anti-enumeration — minted/retired/unknown all map to 'invalid'.
 * @route GET /api/v1/customers/claim/:bagToken
 */
exports.resolveClaim = ControllerHelpers.asyncWrapper(async (req, res) => {
  const resolved = await bagClaimService.resolveClaimToken(req.params.bagToken);
  if (resolved.state === 'claimable') {
    const { affiliate } = resolved;
    return ControllerHelpers.sendSuccess(res, {
      state: 'claimable',
      affiliate: {
        businessName: affiliate.businessName,
        firstName: affiliate.firstName,
        lastName: affiliate.lastName,
        city: affiliate.city,
        state: affiliate.state
      }
    });
  }
  if (resolved.state === 'claimed') {
    // order slot populated by PR 9 ({ status, awaitingDelivery }); no customer PII
    return ControllerHelpers.sendSuccess(res, { state: 'claimed', order: resolved.order });
  }
  return ControllerHelpers.sendSuccess(res, { state: 'invalid' });
});

/**
 * Consume an email-confirm link (single-use) → mark the customer's email
 * verified, which turns on order notifications. GET because it's a clicked link.
 * Serves a small branded landing page (CSP-clean) in the customer's language.
 * @route GET /api/v1/customers/verify-email/:token
 */
const VERIFY_LANDING = require('path').join(__dirname, '..', '..', 'public', 'email-verified.html');
const { readHTMLWithNonce } = require('../utils/cspHelper');
const VERIFY_COPY = {
  ok: {
    en: { t: 'Email confirmed', m: "Thanks — your email is confirmed. You'll now receive order updates." },
    es: { t: 'Correo confirmado', m: 'Gracias — su correo está confirmado. Ahora recibirá actualizaciones de su pedido.' },
    pt: { t: 'E-mail confirmado', m: 'Obrigado — seu e-mail está confirmado. Você agora receberá atualizações do pedido.' },
    de: { t: 'E-Mail bestätigt', m: 'Danke — Ihre E-Mail ist bestätigt. Sie erhalten ab jetzt Bestellaktualisierungen.' }
  },
  fail: {
    en: { t: 'Link invalid or expired', m: 'This confirmation link is invalid or has already been used. Contact your provider if you need help.' },
    es: { t: 'Enlace inválido o expirado', m: 'Este enlace de confirmación es inválido o ya fue utilizado. Contacte a su proveedor si necesita ayuda.' },
    pt: { t: 'Link inválido ou expirado', m: 'Este link de confirmação é inválido ou já foi usado. Contate seu provedor se precisar de ajuda.' },
    de: { t: 'Link ungültig oder abgelaufen', m: 'Dieser Bestätigungslink ist ungültig oder wurde bereits verwendet. Kontaktieren Sie Ihren Anbieter bei Bedarf.' }
  }
};

exports.verifyEmail = ControllerHelpers.asyncWrapper(async (req, res) => {
  const raw = req.params.token || '';
  let ok = false;
  let lang = 'en';
  if (raw) {
    const customer = await Customer.findOne({ emailVerifyTokenHash: Customer.hashEmailToken(raw) });
    if (customer) {
      lang = ['en', 'es', 'pt', 'de'].includes(customer.languagePreference) ? customer.languagePreference : 'en';
      if (customer.emailVerifyTokenExpires && customer.emailVerifyTokenExpires.getTime() > Date.now()) {
        customer.emailVerified = true;
        customer.emailVerifiedAt = new Date();
        customer.emailVerifyTokenHash = undefined;   // single-use
        customer.emailVerifyTokenExpires = undefined;
        await customer.save();
        ok = true;
      }
    }
  }
  const copy = (ok ? VERIFY_COPY.ok : VERIFY_COPY.fail)[lang];
  let html;
  try {
    html = await readHTMLWithNonce(VERIFY_LANDING, res.locals.cspNonce);
    html = html.replace(/\[TITLE\]/g, copy.t).replace(/\[MESSAGE\]/g, copy.m);
  } catch (e) {
    html = `<!doctype html><meta charset="utf-8"><h1>${copy.t}</h1><p>${copy.m}</p>`;
  }
  res.status(ok ? 200 : 410).type('html').send(html);
});

/**
 * GET /api/v1/customers/me — the registered customer reads their own contact
 * info to prefill the "Edit my info" form. Authorized by the customer
 * scan-session (scanAuth → req.scanActor.type === 'customer').
 */
exports.getMe = ControllerHelpers.asyncWrapper(async (req, res) => {
  if (!req.scanActor || req.scanActor.type !== 'customer') {
    return ControllerHelpers.sendError(res, 'Not authorized', 403);
  }
  const c = await Customer.findOne({ customerId: req.scanActor.id })
    .select('firstName lastName email phone address city state zipCode emailVerified');
  if (!c) return ControllerHelpers.sendError(res, 'Customer not found', 404);
  return ControllerHelpers.sendSuccess(res, {
    customer: {
      firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone,
      address: c.address, city: c.city, state: c.state, zipCode: c.zipCode,
      emailVerified: c.emailVerified
    }
  });
});

/**
 * PATCH /api/v1/customers/me — the registered customer updates their own contact
 * info. Phone change → SMS re-verify (when enabled) + Cents-sync flag for the
 * operator; email change → set unverified + send a fresh confirm link.
 */
exports.updateMe = ControllerHelpers.asyncWrapper(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return ControllerHelpers.sendError(res, 'Validation failed', 400, errors.array());
  if (!req.scanActor || req.scanActor.type !== 'customer') {
    return ControllerHelpers.sendError(res, 'Not authorized', 403);
  }
  const customer = await Customer.findOne({ customerId: req.scanActor.id });
  if (!customer) return ControllerHelpers.sendError(res, 'Customer not found', 404);

  const { firstName, lastName, email, phone, address, city, state, zipCode, phoneIdToken } = req.body;

  // Phone change (option a): re-verify the new number, flag Cents for the operator.
  if (phone !== undefined && Formatters.e164(phone, 'us') !== Formatters.e164(customer.phone, 'us')) {
    if (firebasePhoneService.isEnabled()) {
      if (!phoneIdToken) return ControllerHelpers.sendError(res, 'Phone not verified', 400, [{ code: 'phone_not_verified' }]);
      let verified;
      try { verified = await firebasePhoneService.verifyPhoneToken(phoneIdToken); }
      catch (e) { return ControllerHelpers.sendError(res, 'Phone not verified', 400, [{ code: 'phone_not_verified' }]); }
      if (Formatters.e164(phone, 'us') !== Formatters.e164(verified, 'us')) {
        return ControllerHelpers.sendError(res, 'Phone number does not match the verified number', 400, [{ code: 'phone_mismatch' }]);
      }
      customer.phoneVerifiedAt = new Date();
    }
    customer.phone = Formatters.phone(phone, 'us');
    customer.centsSyncNeeded = true; // operator must update the number in Cents
  }

  // Email change → unverified + fresh single-use confirm link.
  let emailConfirmToken = null;
  if (email !== undefined) {
    const newEmail = String(email).trim().toLowerCase();
    if (newEmail && newEmail !== customer.email) {
      const dup = await Customer.findOne({ email: newEmail, customerId: { $ne: customer.customerId } });
      if (dup) return ControllerHelpers.sendError(res, 'Email already registered', 400, [{ code: 'duplicate_email' }]);
      customer.email = newEmail;
      customer.emailVerified = false;
      emailConfirmToken = crypto.randomBytes(32).toString('hex');
      customer.emailVerifyTokenHash = Customer.hashEmailToken(emailConfirmToken);
      customer.emailVerifyTokenExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
  }

  if (firstName !== undefined) customer.firstName = Formatters.name(firstName);
  if (lastName !== undefined) customer.lastName = Formatters.name(lastName);
  if (address !== undefined) customer.address = address;
  if (city !== undefined) customer.city = city;
  if (state !== undefined) customer.state = String(state).toUpperCase();
  if (zipCode !== undefined) customer.zipCode = zipCode;

  await customer.save();

  if (emailConfirmToken) {
    // Best-effort — never fail the save on an SMTP hiccup.
    try { await emailService.sendCustomerEmailConfirmation(customer, { emailVerifyToken: emailConfirmToken }); }
    catch (e) { /* non-blocking */ }
  }

  return ControllerHelpers.sendSuccess(res, {
    customer: {
      firstName: customer.firstName, lastName: customer.lastName, email: customer.email,
      phone: customer.phone, address: customer.address, city: customer.city,
      state: customer.state, zipCode: customer.zipCode, emailVerified: customer.emailVerified
    }
  }, 'Your info was updated');
});

/**
 * Claim-bound customer registration — the affiliate is derived from the bag.
 * @route POST /api/v1/customers/claim/:bagToken/register
 */
exports.claimRegister = ControllerHelpers.asyncWrapper(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return ControllerHelpers.sendError(res, 'Validation failed', 400, errors.array());
  }

  try {
    const { customer, affiliate, bag } = await customerRegistrationService.registerCustomer({
      ...req.body,
      bagToken: req.params.bagToken
    });

    return ControllerHelpers.sendSuccess(
      res,
      {
        customerId: customer.customerId,
        bag: { bagId: bag.bagId },
        customerData: {
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          address: customer.address,
          city: customer.city,
          state: customer.state,
          zipCode: customer.zipCode,
          affiliateId: customer.affiliateId
        },
        affiliateData: {
          businessName: affiliate.businessName,
          firstName: affiliate.firstName,
          lastName: affiliate.lastName,
          // Drives the confirmation page: full_service → "Request pickup now"
          // then show the instructions; pickup_location → show them directly.
          serviceType: affiliate.serviceType,
          pickupInstructions: affiliate.pickupInstructions || '',
          // Effective delivery fee (partner's own or the Laundromat Associates
          // default) — a non-optional line item on the start form/summary.
          deliveryFee: await effectiveDeliveryFee(affiliate)
        }
      },
      'Customer registration successful',
      201
    );
  } catch (err) {
    if (err.isRegistrationError) {
      // Match the old response shape so frontends and tests keep working.
      const body = { success: false, code: err.code, message: err.message, ...err.extras };
      return res.status(err.status || 400).json(body);
    }
    throw err;
  }
});

/**
 * Get all customers (Admin only)
 * Uses role-based filtering and pagination
 */
exports.getCustomersForAdmin = [
  AuthorizationHelpers.requireRole(['admin', 'administrator']),
  ControllerHelpers.asyncWrapper(async (req, res) => {
    // Parse pagination and filters
    const { page, limit, skip, sortBy } = ControllerHelpers.parsePagination(req.query, {
      sortBy: '-createdAt',
      maxLimit: 100
    });

    // Build query from filters
    const query = ControllerHelpers.buildQuery(req.query, {
      affiliateId: 'affiliateId',
      email: 'email',
      firstName: 'firstName',
      lastName: 'lastName',
      city: 'city',
      state: 'state',
      status: 'status',
      createdAfter: 'createdAt',
      createdBefore: 'createdAt'
    });

    // Get customers with pagination (without populate)
    const [customers, totalCustomers] = await Promise.all([
      Customer.find(query)
        .sort(sortBy)
        .skip(skip)
        .limit(limit),
      Customer.countDocuments(query)
    ]);

    // Get unique affiliate IDs and customer IDs
    const affiliateIds = [...new Set(customers.map(c => c.affiliateId).filter(Boolean))];
    const customerIds = customers.map(c => c.customerId);

    // Fetch affiliates
    const Affiliate = require('../models/Affiliate');
    const affiliates = await Affiliate.find({ affiliateId: { $in: affiliateIds } })
      .select('affiliateId businessName');

    // Get order counts for each customer
    const Order = require('../models/Order');
    const orderCounts = await Order.aggregate([
      { $match: { customerId: { $in: customerIds } } },
      { $group: { _id: '$customerId', count: { $sum: 1 } } }
    ]);

    // Create lookup maps
    const affiliateMap = {};
    affiliates.forEach(aff => {
      affiliateMap[aff.affiliateId] = aff.businessName;
    });

    const orderCountMap = {};
    orderCounts.forEach(oc => {
      orderCountMap[oc._id] = oc.count;
    });

    // Format customers for response - include raw fields for frontend
    const formattedCustomers = customers.map(customer => ({
      _id: customer._id,
      customerId: customer.customerId,
      firstName: customer.firstName,
      lastName: customer.lastName,
      fullName: Formatters.fullName(customer.firstName, customer.lastName),
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      zipCode: customer.zipCode,
      formattedAddress: Formatters.address(customer, 'short'),
      affiliateId: customer.affiliateId,
      affiliateName: affiliateMap[customer.affiliateId] || 'N/A',
      registrationDate: Formatters.date(customer.createdAt),
      createdAt: customer.createdAt,
      lastActive: customer.lastLogin ? Formatters.relativeTime(customer.lastLogin) : 'Never',
      orderCount: orderCountMap[customer.customerId] || 0
    }));

    // Calculate pagination
    const pagination = ControllerHelpers.calculatePagination(totalCustomers, page, limit);

    // Send paginated response
    return ControllerHelpers.sendPaginated(res, formattedCustomers, pagination, 'customers');
  })
];

module.exports = exports;
