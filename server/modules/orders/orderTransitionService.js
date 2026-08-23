// Order transition service — the seam the scan-session layer (PR 4/5) calls.
//
// Phase 1 model: the order is born at PICKUP (scan 1) and walks the 4-state
// machine via state-driven advances. There is no pricing, weight, payment, or
// commission here — money lives in Cents (external). Every entry point takes
// the resolved Bag plus { by, role, req }: `by` is the scanner id (affiliateId
// for partners, Operator _id for kiosk), `role` disambiguates.
//
//   createPendingOrder  scan 1  (no open order) -> pending
//   advanceOrder        scans 2-4, state-driven; also opens a new pending when
//                       the bag has no open order (or a stale-complete one)
//   cancelOrder         explicit cancel (undo / admin)
//   undoLastTransition  reverse the last applied step (mis-scan safety net)

const Order = require('../../models/Order');
const Customer = require('../../models/Customer');
const Affiliate = require('../../models/Affiliate');
const AddOn = require('../../models/AddOn');
const { effectiveDeliveryFee } = require('../../utils/deliveryFee');
const SystemConfig = require('../../models/SystemConfig');
const emailService = require('../../utils/emailService');
const {
  applyTransition, resolveScanAction, OPEN_STATUSES
} = require('./orderStateMachine');
const { logAuditEvent, AuditEvents } = require('../../utils/auditLogger');
const logger = require('../../utils/logger');

class TransitionServiceError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.statusCode = status;
    this.details = details;
    this.isTransitionError = true;
  }
}

async function getReopenWindowMs() {
  const minutes = await SystemConfig.getValue('order_reopen_window_minutes', 240);
  return minutes * 60 * 1000;
}

function findOpenOrder(bagId) {
  return Order.findOne({ bagId, status: { $in: OPEN_STATUSES } }).sort({ createdAt: -1 });
}

const MAX_INSTRUCTIONS_LEN = 1000;

/**
 * Reduce client-supplied add-on keys to the trustworthy set: strings only,
 * normalized (trim + lowercase), de-duplicated, and intersected with the
 * ACTIVE catalog. Returned in catalog order (sortOrder, name) for deterministic
 * display. Unknown / inactive / non-string entries are silently dropped — a
 * stale client must never fail an order, and these are label-only (money is in
 * Cents). Returns [] for anything non-array/empty.
 */
async function sanitizeAddOns(rawAddOns) {
  if (!Array.isArray(rawAddOns) || rawAddOns.length === 0) return [];
  const requested = new Set(
    rawAddOns
      .filter(k => typeof k === 'string')
      .map(k => k.trim().toLowerCase())
      .filter(Boolean)
  );
  if (requested.size === 0) return [];
  const active = await AddOn.getActive();
  return active.filter(a => requested.has(a.key)).map(a => a.key);
}

/** Trim + hard-cap free-text instructions; never throws. */
function sanitizeInstructions(raw) {
  if (raw === undefined || raw === null) return '';
  return String(raw).trim().slice(0, MAX_INSTRUCTIONS_LEN);
}

/**
 * Record the send-out (out_for_delivery) revenue snapshot on an order: freeze
 * the partner's OWN delivery fee as commission (0 for the Laundromat Associates
 * default — that fee is house revenue), and record the operator-entered order
 * total when present (validated ≥ 0). Frozen now so later fee changes never alter
 * this order's historical commission. The SINGLE place this snapshot is applied
 * — both the scan path (advanceOrder) and the REST path (updateOrderStatus) call
 * it so they can't diverge.
 *
 * @param {Order} order  the order being moved to out_for_delivery
 * @param {Object} [opts]
 * @param {number|string} [opts.orderTotal] operator-entered final total
 * @throws {TransitionServiceError} invalid_order_total
 */
async function recordSendOutSnapshot(order, { orderTotal } = {}) {
  const aff = await Affiliate.findOne({ affiliateId: order.affiliateId }).select('deliveryFee');
  order.deliveryFeeCharged = aff && Number(aff.deliveryFee) > 0 ? Number(aff.deliveryFee) : 0;
  if (orderTotal !== undefined && orderTotal !== null && orderTotal !== '') {
    const n = Number(orderTotal);
    if (!Number.isFinite(n) || n < 0) {
      throw new TransitionServiceError('invalid_order_total',
        'Order total must be a non-negative number', 400);
    }
    order.orderTotal = n;
  }
}

/**
 * Scan 1 — pickup at partner. Creates exactly one pending order. The customer/
 * affiliate ids come from the registered bag, never from client input.
 * @param {Object} args
 * @param {Object} args.bag   - resolved Bag doc (status 'active', has customerId)
 * @param {string} args.by    - scanner id
 * @param {string} args.role  - 'affiliate' | 'operator' | 'customer'
 * @param {string[]} [args.addOns] - selected add-on keys (validated vs catalog)
 * @param {string} [args.specialInstructions] - free-text wash notes
 * @param {Object} [args.req] - Express request (audit context)
 * @returns {Promise<{order: Order}>}
 * @throws {TransitionServiceError} bag_not_registered | order_already_open
 */
async function createPendingOrder({ bag, by, role, addOns, specialInstructions, req }) {
  if (!bag || bag.status !== 'active' || !bag.customerId) {
    throw new TransitionServiceError('bag_not_registered',
      'Bag is not registered to a customer', 409);
  }

  // Open-order guard: at most one open order per bag, enforced here at the
  // application layer (no DB constraint — the Oracle ADB Mongo API rejects the
  // partial unique index that would otherwise backstop a true concurrent race;
  // at this volume a double-pickup-scan race is not a realistic concern).
  const existing = await findOpenOrder(bag.bagId);
  if (existing) {
    throw new TransitionServiceError('order_already_open',
      `Order ${existing.orderId} is already open for this bag (${existing.status})`,
      409, { bagId: bag.bagId, orderId: existing.orderId, status: existing.status });
  }

  const now = new Date();
  const order = new Order({
    customerId: bag.customerId,
    affiliateId: bag.affiliateId,
    bagId: bag.bagId,
    bagToken: bag.token,
    status: 'pending',
    pickup: { at: now, by, role },
    addOns: await sanitizeAddOns(addOns),
    specialInstructions: sanitizeInstructions(specialInstructions)
  });

  await order.save();

  await logAuditEvent(AuditEvents.ORDER_CREATED, {
    orderId: order.orderId, bagId: bag.bagId, by, role, action: 'pickup'
  }, req);
  logger.info('Order created at pickup', { orderId: order.orderId, bagId: bag.bagId });
  await notifyTransition(order, { event: 'created' });

  // First-order + email-verified flags drive the order-start reminders on /claim
  // (confirm-your-email + the Cents payment-SMS notice shown on the first order).
  // Best-effort + non-blocking: this is cosmetic metadata fetched AFTER the order
  // is committed + the customer notified, so a DB hiccup here must NEVER fail a
  // created order — default to safe (no reminders). "First" = first non-cancelled
  // order (a cancelled-then-retried first order still counts as first); the
  // { limit: 2 } bounds the count on the hot scan path.
  let firstOrder = false;
  let emailVerified = false;
  try {
    const [activeCount, customer] = await Promise.all([
      Order.countDocuments({ customerId: bag.customerId, status: { $ne: 'cancelled' } }, { limit: 2 }),
      Customer.findOne({ customerId: bag.customerId }).select('emailVerified')
    ]);
    firstOrder = activeCount === 1;
    emailVerified = !!(customer && customer.emailVerified);
  } catch (e) {
    logger.warn('order-start reminder flags fetch failed (non-blocking)', { orderId: order.orderId, error: e.message });
  }
  return { order, firstOrder, emailVerified };
}

/**
 * State-driven advance. Resolves the bag's open order, computes the single
 * next action, and applies it. With no open order (or a stale-complete one) it
 * opens a fresh pending order. Within the reopen window a completed bag returns
 * a delivery-rescan-prompt for the scan UI (PR 4) to confirm — call
 * createPendingOrder on "yes".
 *
 * @param {Object} args
 * @param {Object} args.bag
 * @param {string} args.by
 * @param {string} args.role
 * @param {boolean} [args.paymentConfirmed] - store-pickup manual payment checkbox
 * @param {number}  [args.orderTotal] - final order total the operator transferred
 *   from Cents; recorded ONLY on the out_for_delivery ("sent out") transition.
 *   The UI requires it there; the server records it when present (validates ≥0).
 * @param {string[]} [args.addOns] - add-ons, used only if this advance opens a new pending order
 * @param {string} [args.specialInstructions] - ditto
 * @param {Object} [args.req]
 * @returns {Promise<{order?: Order, action: string, to?: string, orderId?: string}>}
 */
async function advanceOrder({ bag, by, role, paymentConfirmed, orderTotal, addOns, specialInstructions, req }) {
  if (!bag || bag.status !== 'active' || !bag.customerId) {
    throw new TransitionServiceError('bag_not_registered',
      'Bag is not registered to a customer', 409);
  }

  const order = await findOpenOrder(bag.bagId);
  const now = new Date();
  const reopenWindowMs = await getReopenWindowMs();

  // Resolve from the open order, or the most recent closed order (to honour
  // the reopen window on a freshly-completed bag).
  let referenceOrder = order;
  if (!referenceOrder) {
    referenceOrder = await Order.findOne({ bagId: bag.bagId }).sort({ createdAt: -1 });
  }

  const decision = resolveScanAction(referenceOrder, { now, reopenWindowMs });

  if (decision.action === 'create-pending') {
    const { order: created } = await createPendingOrder({ bag, by, role, addOns, specialInstructions, req });
    return { order: created, action: 'create-pending' };
  }

  if (decision.action === 'delivery-rescan-prompt') {
    return { action: 'delivery-rescan-prompt', orderId: decision.orderId };
  }

  // advance
  applyTransition(order, decision.to, { by, role, at: now, paymentConfirmed });

  // Revenue capture at send-out — the shared snapshot (see recordSendOutSnapshot).
  if (decision.to === 'out_for_delivery') {
    await recordSendOutSnapshot(order, { orderTotal });
  }
  await order.save();

  await logAuditEvent(AuditEvents.OPERATOR_SCAN, {
    orderId: order.orderId, bagId: bag.bagId, by, role,
    action: 'advance', to: order.status
  }, req);

  // Notify on the new state (in_progress / out_for_delivery / complete).
  await notifyTransition(order, { event: order.status });

  return { order, action: 'advance', to: order.status };
}

/**
 * Best-effort per-transition notifications. NEVER throws into the scan flow.
 *
 * Customer is emailed on EVERY state change (to a verified email). The start
 * email itemizes the affiliate's pickup instructions, per-affiliate delivery
 * fee (if non-zero) and any selected paid add-ons; the out_for_delivery email
 * carries the affiliate's delivery instructions. The affiliate is emailed once
 * — when an order STARTS, regardless of who started it (customer or staff) —
 * and only if they have order notifications enabled (default off; full_service
 * defaults on). No affiliate email at out_for_delivery: partners manage their
 * own pickup schedule. Sends run in parallel; failures are swallowed (logged),
 * so a flaky SMTP never blocks or fails a scan.
 *
 * @param {Order} order
 * @param {{event: 'created'|'in_progress'|'out_for_delivery'|'complete'|'cancelled'}} opts
 */
async function notifyTransition(order, { event }) {
  try {
    const [customer, affiliate] = await Promise.all([
      Customer.findOne({ customerId: order.customerId }),
      Affiliate.findOne({ affiliateId: order.affiliateId })
    ]);
    const affiliateName = affiliate
      ? (affiliate.businessName || `${affiliate.firstName} ${affiliate.lastName}`)
      : null;

    const sends = [];

    // Customer — every state change, but ONLY to a verified email. The welcome
    // email (sent at registration) is the one exception that reaches an
    // unverified address; until the customer clicks its confirm link, we send
    // no order emails.
    if (customer && customer.email && customer.emailVerified) {
      if (event === 'created') {
        // Itemize the start email: pickup instructions + per-affiliate delivery
        // fee + resolved paid add-ons (label + price).
        const addOns = await AddOn.resolveKeys(order.addOns);
        sends.push(emailService.sendOrderStatusUpdateEmail(customer, order, 'pending', {
          pickupInstructions: affiliate ? affiliate.pickupInstructions : '',
          // Effective fee (partner's own or the Laundromat Associates default) — same
          // as the customer saw on the order form.
          deliveryFee: await effectiveDeliveryFee(affiliate),
          addOns
        }));
      } else if (event === 'in_progress') {
        sends.push(emailService.sendOrderStatusUpdateEmail(customer, order, event, {}));
      } else if (event === 'out_for_delivery') {
        sends.push(emailService.sendOrderStatusUpdateEmail(customer, order, event, {
          deliveryInstructions: affiliate ? affiliate.deliveryInstructions : ''
        }));
      } else if (event === 'complete') {
        sends.push(emailService.sendCustomerDeliveredEmail(customer, order, { affiliateName }));
      } else if (event === 'cancelled') {
        sends.push(emailService.sendOrderCancellationEmail(customer, order));
      }
    }

    // Affiliate — gated on opt-in; one email when the order STARTS (any starter).
    // No out_for_delivery email: partners manage their own pickup schedule.
    if (affiliate && affiliate.orderNotificationsEnabled && affiliate.email) {
      if (event === 'created') {
        sends.push(emailService.sendAffiliateNewOrderEmail(affiliate, customer, order));
      }
    }

    await Promise.allSettled(sends);
  } catch (err) {
    logger.error(`Order notification failed for ${order.orderId} event=${event} (non-blocking):`, err);
  }
}

/**
 * Cancel an open order. by/role recorded in the audit trail.
 * @param {Object} args
 * @param {Order} args.order
 * @param {string} args.by
 * @param {string} args.role
 * @param {Object} [args.req]
 */
async function cancelOrder({ order, by, role, req }) {
  applyTransition(order, 'cancelled', { by, role });
  await order.save();
  await logAuditEvent(AuditEvents.ORDER_CANCELLED, {
    orderId: order.orderId, bagId: order.bagId, by, role
  }, req);
  await notifyTransition(order, { event: 'cancelled' });
  return { order };
}

/**
 * Reverse the last applied transition (mis-scan safety net). A just-created
 * pending order is deleted; otherwise the status rolls back one step:
 *   out_for_delivery -> in_progress -> pending. Always audited.
 *
 * @param {Object} args
 * @param {Order} args.order
 * @param {string} args.by
 * @param {Object} [args.req]
 * @returns {Promise<{undone: string, order?: Order}>}
 */
async function undoLastTransition({ order, by, req }) {
  const PREV = {
    out_for_delivery: 'in_progress',
    in_progress: 'pending'
  };

  if (order.status === 'pending') {
    const orderId = order.orderId;
    await Order.deleteOne({ orderId });
    await logAuditEvent(AuditEvents.ORDER_UNDO, {
      orderId, bagId: order.bagId, by, action: 'deleted_pending'
    }, req);
    return { undone: 'deleted' };
  }

  const prev = PREV[order.status];
  if (!prev) {
    throw new TransitionServiceError('cannot_undo',
      `Cannot undo from status ${order.status}`, 400);
  }

  const from = order.status;
  order.status = prev;
  // Clear the stamp + terminal marker for the step we reversed.
  if (from === 'out_for_delivery') {
    order.storePickup = undefined;
    order.paymentConfirmedManually = false;
    // Also clear the send-out revenue snapshot — it'll be re-entered on the
    // next out_for_delivery scan; leaving it stale would over-count revenue/
    // commission if the rolled-back order is later cancelled.
    order.orderTotal = undefined;
    order.deliveryFeeCharged = 0;
  } else if (from === 'in_progress') {
    order.intake = undefined;
  }
  await order.save();

  await logAuditEvent(AuditEvents.ORDER_UNDO, {
    orderId: order.orderId, bagId: order.bagId, by, from, to: prev
  }, req);
  return { undone: 'rolled_back', order };
}

module.exports = {
  createPendingOrder,
  advanceOrder,
  cancelOrder,
  undoLastTransition,
  recordSendOutSnapshot,
  TransitionServiceError
};
