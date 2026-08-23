// Scan-session engine (PR 4, spec §4) — the authenticate-once, batch-scan core.
//
// Three responsibilities, all state-driven (the bag's current order decides the
// next move — no operator mode-picking):
//   mintSession  - verify a one-time code (affiliate delivery OR operator scan)
//                  and issue a short-lived scan-session JWT.
//   resolveScan  - read-only: what would the next scan do? (proposedAction +
//                  i18n promptKey for the UI to render before confirming).
//   applyScan    - re-resolve (guard against state drift), then apply via the
//                  order transition service, stamping by/role from the actor.
//   undoScan     - reverse the last transition (mis-scan safety net).
//
// Auth of the session-mint step reuses the operator/affiliate code hashing and
// the codeAttemptLockout service (same gate as the old bag-action flow). Both
// code paths are checked with no short-circuit, so a bad guess yields no oracle.

const jwt = require('jsonwebtoken');
const Affiliate = require('../../models/Affiliate');
const Operator = require('../../models/Operator');
const Customer = require('../../models/Customer');
const AddOn = require('../../models/AddOn');
const SystemConfig = require('../../models/SystemConfig');
const { effectiveDeliveryFee } = require('../../utils/deliveryFee');
const bagService = require('../bags/bagService');
const orderTransitionService = require('../orders/orderTransitionService');
const { resolveScanAction, OPEN_STATUSES } = require('../orders/orderStateMachine');
const Order = require('../../models/Order');
const codeAttemptLockout = require('../../services/codeAttemptLockout');
const roleCodes = require('../../utils/roleCodes');
const { logAuditEvent, AuditEvents } = require('../../utils/auditLogger');
const logger = require('../../utils/logger');

class ScanError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
    this.statusCode = status;
    this.isScanError = true;
  }
}

// proposedAction -> i18n key the UI renders in the confirm dialog. Defined ×4
// under claim.scan.confirm.* in public/locales/{lang}/common.json.
const PROMPT_KEYS = {
  'create-pending': 'scan.confirm.createPending',
  'advance:in_progress': 'scan.confirm.advanceToInProgress',
  'advance:out_for_delivery': 'scan.confirm.advanceToOutForDelivery',
  'advance:complete': 'scan.confirm.advanceToComplete',
  'delivery-rescan-prompt': 'scan.confirm.deliveryRescan'
};

function promptKeyFor(decision) {
  if (decision.action === 'advance') return PROMPT_KEYS[`advance:${decision.to}`];
  return PROMPT_KEYS[decision.action];
}

async function getReopenWindowMs() {
  const minutes = await SystemConfig.getValue('order_reopen_window_minutes', 240);
  return minutes * 60 * 1000;
}

/**
 * Does the entered value match the registered customer's email or phone? Lets a
 * customer authenticate a scan with the contact they verified at registration
 * (instead of an operator/affiliate code). Email: case-insensitive exact. Phone:
 * compares the last 10 digits, and only when the input clearly looks like a
 * phone (≥10 digits) so a short staff code can never accidentally match.
 */
function matchesCustomerContact(value, customer) {
  if (!value || !customer) return false;
  const v = String(value).trim();
  if (v.includes('@') && customer.email) {
    return v.toLowerCase() === String(customer.email).trim().toLowerCase();
  }
  const digits = v.replace(/\D/g, '');
  if (digits.length >= 10 && customer.phone) {
    const custDigits = String(customer.phone).replace(/\D/g, '');
    return custDigits.length >= 10 && custDigits.slice(-10) === digits.slice(-10);
  }
  return false;
}

/**
 * Resolve a registered, active bag from its token. Throws the generic
 * not-registered error for anything else (anti-enumeration: unknown / minted /
 * issued / retired all look the same).
 */
async function resolveRegisteredBag(bagToken) {
  const resolved = await bagService.resolveByToken(bagToken);
  if (!resolved || !resolved.bag || resolved.bag.status !== 'active' || !resolved.bag.customerId) {
    throw new ScanError('bag_not_registered', 'Bag is not registered', 404);
  }
  return resolved.bag;
}

/** The reference order a scan resolves against: open order, else most-recent. */
async function referenceOrderFor(bagId) {
  const open = await Order.findOne({ bagId, status: { $in: OPEN_STATUSES } }).sort({ createdAt: -1 });
  if (open) return open;
  return Order.findOne({ bagId }).sort({ createdAt: -1 });
}

/**
 * POST /api/v1/scan/session — verify a code and mint a scan-session token.
 * Tries BOTH the bag-affiliate's delivery code and the global operator scan
 * code (no short-circuit / no oracle). On failure: lockout increment + 401.
 * @returns {{sessionToken, actorType, actorId, expiresAt}}
 */
async function mintSession({ bagToken, code, req }) {
  const bag = await resolveRegisteredBag(bagToken); // generic 404 if unknown

  const key = codeAttemptLockout.attemptKey({ scope: 'scan', bagToken, req });
  const maxAttempts = await SystemConfig.getValue('operator_scan_code_max_attempts', 5);
  if (await codeAttemptLockout.isLockedOut(key, maxAttempts)) {
    throw new ScanError('locked_out', 'Too many attempts — please try again later', 429);
  }

  // Both checks run; the result is decided after, so a wrong code can't tell
  // which actor type it failed against.
  const affiliate = await Affiliate.findOne({ affiliateId: bag.affiliateId })
    .select('+affiliateDeliveryCodeHash');
  const affiliateOk = !!(code && affiliate && affiliate.affiliateDeliveryCodeHash &&
    roleCodes.verifyCode(code, affiliate.affiliateDeliveryCodeHash));

  const operator = code
    ? await Operator.findOne({ scanCodeHmac: roleCodes.hmacCode(code), isActive: true })
    : null;
  const operatorOk = !!operator;

  // Customer self-start: the bag's registered customer can authenticate with the
  // email or phone they verified at registration. Customer sessions are START-
  // ONLY (enforced in applyScan/undoScan). Checked unconditionally (no oracle).
  const customer = await Customer.findOne({ customerId: bag.customerId });
  const customerOk = !!(code && customer && matchesCustomerContact(code, customer));

  let actorType; let actorId;
  if (affiliateOk) {
    actorType = 'affiliate';
    actorId = affiliate.affiliateId;
  } else if (operatorOk) {
    actorType = 'operator';
    actorId = String(operator._id);
  } else if (customerOk) {
    actorType = 'customer';
    actorId = customer.customerId;
  } else {
    await codeAttemptLockout.registerFailure(key);
    logAuditEvent(AuditEvents.OPERATOR_CODE_FAILED,
      { ip: codeAttemptLockout.clientIp(req), path: req && req.path, context: 'scan-session' }, req);
    throw new ScanError('invalid_code', 'Invalid code', 401);
  }

  await codeAttemptLockout.clearFailures(key);

  const ttlMinutes = await SystemConfig.getValue('scan_session_ttl_minutes', 15);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  const sessionToken = jwt.sign(
    { scope: 'scan-session', actorType, actorId },
    process.env.JWT_SECRET,
    { expiresIn: `${ttlMinutes}m` }
  );

  logAuditEvent(AuditEvents.OPERATOR_SCAN,
    { action: 'scan_session_minted', actorType, actorId, bagId: bag.bagId }, req);
  logger.info('Scan session minted', { actorType, bagId: bag.bagId });
  return { sessionToken, actorType, actorId, expiresAt };
}

/**
 * POST /api/v1/scan/resolve — read-only proposed action for the next scan.
 * @returns {{bagId, currentStatus, customer, proposedAction, to?, orderId?, promptKey, requiresConfirm}}
 */
async function resolveScan({ bagToken }) {
  const bag = await resolveRegisteredBag(bagToken);
  const now = new Date();
  const reopenWindowMs = await getReopenWindowMs();
  const reference = await referenceOrderFor(bag.bagId);
  const decision = resolveScanAction(reference, { now, reopenWindowMs });

  // Customer display info for the operator scan modal — the full contact record so
  // the operator can verify/serve the order (behind scanAuth; for a customer
  // session it's the customer's own record). centsSyncNeeded warns staff that the
  // customer changed their phone and Cents needs updating.
  const customer = await Customer.findOne({ customerId: bag.customerId })
    .select('firstName lastName phone email address city state zipCode centsSyncNeeded');

  // The partner's pickup instructions — shown to the customer after they start
  // their order (not to staff). Public partner copy, not sensitive.
  const affiliate = await Affiliate.findOne({ affiliateId: bag.affiliateId })
    .select('pickupInstructions serviceType deliveryFee');

  const currentStatus = reference && OPEN_STATUSES.includes(reference.status)
    ? reference.status : 'none';

  // The operator sees the order's add-ons + special instructions ONLY at intake
  // (i.e. while the order is still PENDING — the next scan checks it in). On any
  // later scan they're suppressed (empty), per spec ("not needed on scan-out").
  let orderAddOns = [];
  let orderInstructions = '';
  if (reference && reference.status === 'pending') {
    orderInstructions = reference.specialInstructions || '';
    orderAddOns = await AddOn.resolveKeys(reference.addOns); // [{key,name,price,translations}]
  }

  return {
    bagId: bag.bagId,
    currentStatus,
    addOns: orderAddOns,
    specialInstructions: orderInstructions,
    customer: customer ? {
      firstName: customer.firstName, lastName: customer.lastName,
      phone: customer.phone, email: customer.email || '',
      address: customer.address || '', city: customer.city || '',
      state: customer.state || '', zipCode: customer.zipCode || ''
    } : null,
    proposedAction: decision.action,
    ...(decision.to ? { to: decision.to } : {}),
    ...(decision.orderId ? { orderId: decision.orderId } : {}),
    ...(customer && customer.centsSyncNeeded ? { centsSyncNeeded: true, customerPhone: customer.phone } : {}),
    pickupInstructions: affiliate ? (affiliate.pickupInstructions || '') : '',
    // Effective delivery fee (partner's own, or the Laundromat Associates default) —
    // a non-optional line item shown to the customer on the start form/summary,
    // and shown to the operator WITH price so they pick the right fee in Cents.
    deliveryFee: await effectiveDeliveryFee(affiliate),
    serviceType: affiliate ? affiliate.serviceType : undefined,
    promptKey: promptKeyFor(decision),
    requiresConfirm: true
  };
}

/**
 * POST /api/v1/scan/apply — re-resolve (drift guard), then apply via the
 * transition service stamping by/role from req.scanActor. addOns +
 * specialInstructions are honoured only when this scan CREATES the order
 * (create-pending / reopen) — they're ignored on a mid-lifecycle advance.
 * @returns {{orderId, newStatus, action}}
 */
async function applyScan({ bagToken, expectedAction, reopen, paymentConfirmed, orderTotal, addOns, specialInstructions, actor, req }) {
  // expectedAction is required: without it the drift guard below is skipped
  // entirely, so an operator could apply a stale action against a bag whose
  // state has since changed. Reject up front (400) before touching the order.
  if (!expectedAction) {
    throw new ScanError('expected_action_required', 'expectedAction required', 400);
  }

  const bag = await resolveRegisteredBag(bagToken);
  const now = new Date();
  const reopenWindowMs = await getReopenWindowMs();
  const reference = await referenceOrderFor(bag.bagId);
  const decision = resolveScanAction(reference, { now, reopenWindowMs });

  // Drift guard: the action the UI confirmed must still be the current one.
  // (expectedAction is guaranteed present by the check at the top.)
  if (expectedAction !== decision.action) {
    throw new ScanError('state_changed',
      'Bag state changed since you scanned — please re-scan', 409);
  }

  // Customer sessions are limited to the two ends they own: STARTING a brand-new
  // pending order (pickup), and CONFIRMING delivery of their own bag
  // (out_for_delivery -> complete). The store-side middle steps (intake, store
  // pickup) and reopening a just-completed order (delivery-rescan-prompt) stay
  // with staff — a customer must not be able to advance an in-store order or
  // restart a staff-completed one within the reopen window.
  const customerAllowed = decision.action === 'create-pending' ||
    (decision.action === 'advance' && decision.to === 'complete');
  if (actor.type === 'customer' && !customerAllowed) {
    throw new ScanError('customer_not_allowed',
      'Only store staff can advance or reopen this order', 403);
  }

  const by = actor.id;
  const role = actor.type; // 'operator' | 'affiliate' | 'customer' (start-only)

  let result;
  if (decision.action === 'create-pending') {
    const { order, firstOrder, emailVerified } = await orderTransitionService.createPendingOrder({
      bag, by, role, addOns, specialInstructions, req
    });
    result = { orderId: order.orderId, newStatus: order.status, action: 'create-pending', firstOrder, emailVerified };
  } else if (decision.action === 'advance') {
    const adv = await orderTransitionService.advanceOrder({
      bag, by, role, paymentConfirmed: !!paymentConfirmed, orderTotal, addOns, specialInstructions, req
    });
    result = {
      orderId: adv.order ? adv.order.orderId : decision.orderId,
      newStatus: adv.order ? adv.order.status : undefined,
      action: 'advance'
    };
  } else if (decision.action === 'delivery-rescan-prompt') {
    if (reopen === true) {
      const { order } = await orderTransitionService.createPendingOrder({ bag, by, role, addOns, specialInstructions, req });
      result = { orderId: order.orderId, newStatus: order.status, action: 'create-pending' };
    } else {
      // reopen:false -> explicit no-op (the operator chose not to start a new cycle)
      result = { orderId: decision.orderId, action: 'no-op' };
    }
  } else {
    throw new ScanError('not_applicable', 'No applicable scan action', 409);
  }

  // Staff handled the bag → clear any pending Cents phone-sync warning (the
  // operator has seen it and is processing the bag). Customers (start-only)
  // never clear it. Best-effort; never fails the scan.
  if (actor.type !== 'customer') {
    try {
      await Customer.updateOne(
        { customerId: bag.customerId, centsSyncNeeded: true },
        { $set: { centsSyncNeeded: false } }
      );
    } catch (_e) { /* non-blocking */ }
  }

  return result;
}

/** POST /api/v1/scan/undo — reverse the last transition for the bag's order. */
async function undoScan({ bagToken, actor, req }) {
  // Undo is a staff safety net — customers (start-only) cannot reverse scans.
  if (actor && actor.type === 'customer') {
    throw new ScanError('customer_not_allowed', 'Only store staff can undo a scan', 403);
  }
  const bag = await resolveRegisteredBag(bagToken);
  const order = await referenceOrderFor(bag.bagId);
  if (!order) {
    throw new ScanError('nothing_to_undo', 'No order to undo for this bag', 409);
  }
  const result = await orderTransitionService.undoLastTransition({ order, by: actor.id, req });
  return { undone: result.undone, status: result.order ? result.order.status : undefined };
}

module.exports = {
  ScanError,
  mintSession,
  resolveScan,
  applyScan,
  undoScan
};
