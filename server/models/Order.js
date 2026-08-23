// Order Model — slim state record (Phase 1 PR 3, spec §6).
//
// The order is a thin bag-tracking state record: bag linkage, a 4-state
// status, and a {at, by, role} stamp per scan gate. ALL money, weight,
// pricing, payment, and commission live externally in Cents — this model
// holds none of it (those fields + the pricing/lifecycle pre-save hooks were
// removed; recoverable on the phase2-reference tag).
//
// `by` is a String, not an ObjectId: partners scan (affiliateId) and operators
// scan (Operator _id) — `role` ('affiliate' | 'operator') disambiguates.

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Per-scan stamp: who scanned, in what role, when.
const scanEventSchema = new mongoose.Schema({
  at: { type: Date },
  by: { type: String },                 // affiliateId / Operator _id / customerId (as string)
  role: { type: String, enum: ['affiliate', 'operator', 'customer'] }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    default: () => 'ORD-' + uuidv4(),
    unique: true
  },
  customerId: { type: String, required: true, ref: 'Customer' },
  affiliateId: { type: String, required: true, ref: 'Affiliate' },

  // Durable bag references (one bag = one order) — design §6.
  bagId: { type: String, required: true, ref: 'Bag', index: true },  // == Bag.bagId (BAG-uuid); the JOIN key
  bagToken: { type: String, index: true },                           // == Bag.token (32 hex); denormalized SCAN key

  // 4-state scan-gate machine (spec §3). pending is the birth state.
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'out_for_delivery', 'complete', 'cancelled'],
    default: 'pending'
  },

  // Per-scan stamps (one per gate):
  pickup: scanEventSchema,        // scan 1 — partner pickup -> pending (creation)
  intake: scanEventSchema,        // scan 2 — store intake   -> in_progress
  storePickup: scanEventSchema,   // scan 3 — store pickup    -> out_for_delivery
  delivery: scanEventSchema,      // scan 4 — partner delivery-> complete

  // Customer service selections captured at order start (spec: add-ons). These
  // are LABEL/INSTRUCTION ONLY — money/pricing lives in Cents. `addOns` holds
  // AddOn `key` slugs (validated against the active catalog at creation); the
  // operator sees them + `specialInstructions` when scanning the pending bag at
  // intake (hidden on scan-out).
  addOns: { type: [String], default: [] },
  specialInstructions: { type: String, default: '', maxlength: 1000, trim: true },

  // Manual payment confirmation at store-pickup — a flag only (no payment data;
  // money lives in Cents). Set when the operator checks the payment box.
  paymentConfirmedManually: { type: Boolean, default: false },

  // Revenue capture at the out_for_delivery ("sent out") scan — the only money
  // recorded in-app (everything else settles in Cents). `orderTotal` is the
  // amount the operator transferred from Cents; `deliveryFeeCharged` is the
  // partner's OWN delivery fee snapshotted at send-out (the partner commission)
  // — 0 when the order used the Laundromat Associates default (that fee stays house
  // revenue). Snapshotting freezes commission history against later fee changes.
  orderTotal: { type: Number, min: 0 },
  deliveryFeeCharged: { type: Number, min: 0, default: 0 },

  // Terminal timestamps. completedAt is the 4h delivery-rescan reference.
  completedAt: Date,
  cancelledAt: Date,

  // Test order flag for cleanup.
  isTestOrder: { type: Boolean, default: false }
}, { timestamps: true });

// "At most one open order per bag" (open = pending | in_progress |
// out_for_delivery) is enforced at the application layer by the read-guard in
// orderTransitionService.createPendingOrder, not by a DB constraint. A partial
// unique index would be the concurrency backstop, but the Oracle ADB Mongo API
// does not support partialFilterExpression, and at this volume the read-guard
// is sufficient (no realistic double-pickup-scan race). The plain bagId index
// above serves every lookup.
const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
