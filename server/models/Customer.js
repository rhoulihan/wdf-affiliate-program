// Customer Model for Laundromat Affiliate Program

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Customer Schema
const customerSchema = new mongoose.Schema({
  customerId: {
    type: String,
    default: () => 'CUST-' + uuidv4(),
    unique: true
  },
  affiliateId: { type: String, required: true, ref: 'Affiliate' },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  // Email is REQUIRED (2026-06-18) but verified ASYNCHRONOUSLY via a confirm
  // link in the welcome email — registration is gated on PHONE only. sparse+unique
  // is kept (harmless; legacy no-email records may exist).
  email: { type: String, unique: true, sparse: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  zipCode: { type: String, required: true },
  serviceFrequency: { type: String, enum: ['weekly', 'biweekly', 'monthly'], default: 'weekly' },
  deliveryInstructions: String,
  specialInstructions: String,
  affiliateSpecialInstructions: String,
  // PR 7: registration-only — no customer login/portal in Phase 1, so there is
  // no username or password. Verified contact info is the only identity stored.
  // (PR 6 removed the customer auth surface; PR 7 removes the dead credentials.)
  // Email confirm-link verification (2026-06-18): the welcome email carries a
  // single-use link; only verified addresses receive any further email.
  emailVerified: { type: Boolean, default: false },
  emailVerifiedAt: Date,            // set when the confirm link is consumed
  emailVerifyTokenHash: { type: String, index: true, sparse: true }, // sha256 of the raw token (raw lives only in the link); indexed for the verify lookup
  emailVerifyTokenExpires: Date,    // confirm link expiry (~30 days)
  phoneVerifiedAt: Date,   // set when the Firebase phone token verifies (flag on)
  // Set when a customer changes their phone via "Edit my info" — surfaces a
  // warning to the operator at scan time to update the number in Cents. Cleared
  // on the next operator/affiliate scan-apply for the bag.
  centsSyncNeeded: { type: Boolean, default: false },
  // Payment is handled externally in Cents. No payment information is stored.
  isActive: { type: Boolean, default: true },
  registrationDate: { type: Date, default: Date.now },
  lastLogin: Date,
  // Language preference for communications
  languagePreference: {
    type: String,
    enum: ['en', 'es', 'pt', 'de'],
    default: 'en'
  },
  // Bag label tracking
  bagLabelsGenerated: {
    type: Boolean,
    default: false
  },
  bagLabelsGeneratedAt: Date,
  bagLabelsGeneratedBy: String // operatorId who printed
}, { timestamps: true });

// No longer need encryption middleware as payment data is not stored.
// No login lockout machinery: Phase 1 customers have no password/login (PR 7).

// Hash an email-confirm token for at-rest storage. The raw token (high-entropy
// random) travels only in the welcome-email link; we store/look up by its sha256
// so a DB read can't replay it.
customerSchema.statics.hashEmailToken = (raw) =>
  require('crypto').createHash('sha256').update(String(raw)).digest('hex');

// Create model
const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer;