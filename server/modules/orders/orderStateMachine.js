// Single source of truth for the 4-state scan-gate order machine (spec §3/§6).
//
//   pending          -> in_progress | cancelled   (scan 2 = intake at store)
//   in_progress      -> out_for_delivery | cancelled (scan 3 = pickup at store)
//   out_for_delivery -> complete | cancelled       (scan 4 = delivery at partner)
//   complete         -> []                          (terminal)
//   cancelled        -> []                          (terminal)
//
// Scan 1 (pickup at partner) CREATES the pending order — that is not a
// transition (no prior order exists), so it lives in the transition service,
// not here. The OPEN/CLOSED partitions are centralized here (the only copy);
// callers import them rather than re-listing statuses.

const TRANSITIONS = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['complete', 'cancelled'],
  complete: [],
  cancelled: []
};

const OPEN_STATUSES = ['pending', 'in_progress', 'out_for_delivery'];
const CLOSED_STATUSES = ['complete', 'cancelled'];

class TransitionError extends Error {
  constructor(from, to) {
    super(`Invalid status transition from ${from} to ${to}`);
    this.code = 'invalid_transition';
    this.statusCode = 400;
    Error.captureStackTrace(this, this.constructor);
  }
}

function canTransition(from, to) {
  return Array.isArray(TRANSITIONS[from]) && TRANSITIONS[from].includes(to);
}

/**
 * Validate + apply a transition, stamping the matching per-scan sub-object.
 * Does NOT save — callers own persistence.
 *
 *   in_progress      -> stamps `intake`      {at, by, role}
 *   out_for_delivery -> stamps `storePickup` {at, by, role} (+ paymentConfirmedManually)
 *   complete         -> stamps `delivery`    {at, by, role} + completedAt
 *   cancelled        -> stamps cancelledAt
 *
 * @param {Object} order - mongoose Order doc (or plain object in unit tests)
 * @param {string} to - target status
 * @param {Object} [meta]
 * @param {string} [meta.by]   - scanner id (affiliateId or Operator _id, as a string)
 * @param {string} [meta.role] - 'affiliate' | 'operator'
 * @param {Date}   [meta.at]   - timestamp (defaults to now)
 * @param {boolean}[meta.paymentConfirmed] - store-pickup manual payment checkbox
 * @returns {Object} the mutated order
 * @throws {TransitionError} when TRANSITIONS does not allow the move
 */
function applyTransition(order, to, meta = {}) {
  if (!canTransition(order.status, to)) {
    throw new TransitionError(order.status, to);
  }
  // Send-out is the money gate: the laundry leaves the store here and the fee is
  // snapshotted here. Confirmation used to be enforced only by a disabled button in
  // the operator kiosk, and a comment in that UI told the reader the server rejected
  // it too — it did not, so every other caller walked straight through. Enforced for
  // real now, in the state machine rather than in one controller, so the REST status
  // route cannot bypass it either.
  if (to === 'out_for_delivery' && !meta.paymentConfirmed) {
    const err = new Error('Payment must be confirmed before an order can leave the store');
    err.code = 'payment_not_confirmed';
    // Carry the full flag set the callers map on: the scan path reads statusCode,
    // and orderController's catch maps on isTransitionError — without that flag this
    // surfaces as a 500, which tells the operator nothing and reads as our fault.
    err.status = 400;
    err.statusCode = 400;
    err.isTransitionError = true;
    throw err;
  }
  const at = meta.at || new Date();
  const event = { at, by: meta.by, role: meta.role };
  order.status = to;
  switch (to) {
  case 'in_progress':
    order.intake = event;
    break;
  case 'out_for_delivery':
    order.storePickup = event;
    order.paymentConfirmedManually = true; // guaranteed by the gate above
    break;
  case 'complete':
    order.delivery = event;
    if (!order.completedAt) order.completedAt = at;
    break;
  case 'cancelled':
    if (!order.cancelledAt) order.cancelledAt = at;
    break;
  }
  return order;
}

/**
 * Pure resolver: given a bag's current (possibly null) open order, decide what
 * a scan should do. The transition service acts on the result.
 *
 *   no order / cancelled            -> create-pending
 *   pending                         -> advance to in_progress
 *   in_progress                     -> advance to out_for_delivery
 *   out_for_delivery                -> advance to complete
 *   complete within reopen window   -> delivery-rescan-prompt (yes -> new pending)
 *   complete beyond reopen window   -> create-pending (next cycle)
 *
 * @param {Object|null} order
 * @param {Object} opts
 * @param {Date}   opts.now
 * @param {number} opts.reopenWindowMs
 * @returns {{action: string, to?: string, orderId?: string}}
 */
function resolveScanAction(order, { now, reopenWindowMs }) {
  if (!order || order.status === 'cancelled') {
    return { action: 'create-pending' };
  }
  switch (order.status) {
  case 'pending':
    return { action: 'advance', to: 'in_progress' };
  case 'in_progress':
    return { action: 'advance', to: 'out_for_delivery' };
  case 'out_for_delivery':
    return { action: 'advance', to: 'complete' };
  case 'complete': {
    const completedAt = order.completedAt ? new Date(order.completedAt).getTime() : 0;
    const age = now.getTime() - completedAt;
    if (completedAt && age <= reopenWindowMs) {
      return { action: 'delivery-rescan-prompt', orderId: order.orderId };
    }
    return { action: 'create-pending' };
  }
  default:
    return { action: 'create-pending' };
  }
}

module.exports = {
  TRANSITIONS,
  OPEN_STATUSES,
  CLOSED_STATUSES,
  canTransition,
  applyTransition,
  resolveScanAction,
  TransitionError
};
