// Transaction Model for Laundromat Affiliate Program

const mongoose = require('mongoose');

// Transaction Schema (for tracking affiliate payments)
const transactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    default: () => 'TRX' + Math.floor(100000 + Math.random() * 900000),
    unique: true
  },
  affiliateId: { type: String, required: true, ref: 'Affiliate' },
  type: {
    type: String,
    enum: ['commission', 'payout', 'adjustment'],
    required: true
  },
  amount: { type: Number, required: true },
  description: String,
  orders: [{ type: String, ref: 'Order' }],
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  payoutMethod: {
    type: String,
    enum: ['check', 'paypal', 'venmo'],
    required: true
  },
  payoutReference: String, // Reference number for the payout
  payoutDate: Date,
  periodStart: Date,
  periodEnd: Date
}, { timestamps: true });

// Create model
const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;