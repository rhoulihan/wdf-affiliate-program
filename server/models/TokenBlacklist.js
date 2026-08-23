// TokenBlacklist Model for Laundromat Affiliate Program
// Stores blacklisted JWT tokens to prevent usage after logout

const mongoose = require('mongoose');

const tokenBlacklistSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: String,
    required: true
  },
  userType: {
    type: String,
    required: true,
    enum: ['affiliate', 'customer', 'administrator', 'operator']
  },
  expiresAt: {
    type: Date,
    required: true
  },
  blacklistedAt: {
    type: Date,
    default: Date.now
  },
  reason: {
    type: String,
    default: 'logout'
  }
});

// TTL index to automatically remove expired tokens after 24 hours
tokenBlacklistSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

// Static method to blacklist a token
tokenBlacklistSchema.statics.blacklistToken = async function(token, userId, userType, expiresAt, reason = 'logout') {
  try {
    const blacklistedToken = await this.create({
      token,
      userId,
      userType,
      expiresAt,
      reason
    });
    return blacklistedToken;
  } catch (error) {
    if (error.code === 11000) {
      // Token already blacklisted
      return null;
    }
    throw error;
  }
};

// Static method to check if token is blacklisted
tokenBlacklistSchema.statics.isBlacklisted = async function(token) {
  const blacklistedToken = await this.findOne({ token });
  return !!blacklistedToken;
};

// Static method to clean up expired tokens (manual cleanup if needed)
tokenBlacklistSchema.statics.cleanupExpired = async function() {
  const now = new Date();
  const result = await this.deleteMany({ expiresAt: { $lt: now } });
  return result.deletedCount;
};

const TokenBlacklist = mongoose.model('TokenBlacklist', tokenBlacklistSchema);

module.exports = TokenBlacklist;