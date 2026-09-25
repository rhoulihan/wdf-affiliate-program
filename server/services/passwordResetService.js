// Password reset service
//
// Unified forgot-password / reset-password flow across all four user types.
// Token is generated with the injected cryptoWrapper (so the auth
// controller's test seam keeps working), hashed with SHA-256 before being
// stored, and compared against the stored hash on reset. 1-hour TTL.
//
// Operators don't have passwords (PIN-based) — resetPassword rejects them.
// Administrators use the model's pre-save bcrypt hook; affiliates/customers
// get PBKDF2 via encryptionUtil.

const crypto = require('crypto');
const Affiliate = require('../models/Affiliate');
const Administrator = require('../models/Administrator');
const Operator = require('../models/Operator');
const encryptionUtil = require('../utils/encryption');
const emailService = require('../utils/emailService');

// PR 7: customers are registration-only (no password/login), so there's no
// customer password to reset — the 'customer' user type is gone from this flow.
const USER_TYPES = ['affiliate', 'administrator', 'operator'];

const MODEL_BY_USER_TYPE = {
  affiliate: Affiliate,
  administrator: Administrator,
  operator: Operator
};

const RESET_EMAIL_SENDERS = {
  affiliate: 'sendAffiliatePasswordResetEmail',
  administrator: 'sendAdministratorPasswordResetEmail',
  operator: 'sendOperatorPasswordResetEmail'
};

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

class PasswordResetError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
    this.isPasswordResetError = true;
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function forgotPassword({ email, userType, cryptoWrapper }) {
  if (!email || !userType) {
    throw new PasswordResetError('missing_fields', 'Email and user type are required');
  }
  if (!USER_TYPES.includes(userType)) {
    throw new PasswordResetError('invalid_user_type', 'Invalid user type');
  }

  const Model = MODEL_BY_USER_TYPE[userType];
  const user = await Model.findOne({ email });

  // APP-013 / prod-lockdown-2026-05-20: do NOT signal whether the email
  // exists. Previously this threw a 404, which let any unauthenticated
  // requester probe email existence one POST at a time (a user-enumeration
  // primitive). Now the caller always sees the service complete normally
  // and returns a generic "if an account exists, we sent a link" message
  // to the client. The internal log records the miss for debugging.
  if (!user) {
    const logger = require('../utils/logger');
    logger.info('forgotPassword: no account for email (silent)', { userType });
    return;
  }

  const resetToken = cryptoWrapper.randomBytes(32).toString('hex');
  user.resetToken = hashToken(resetToken);
  user.resetTokenExpiry = Date.now() + RESET_TOKEN_TTL_MS;
  await user.save();

  // Link to the SPA shell, not the bare `/reset-password` clean path: that path
  // exists only in the client-side router (public/assets/js/embed-app-v2.js),
  // so no server route serves it — on the marketing hosts it fell through to
  // the marketing page (HTTP 200) and the token was silently discarded. The
  // shell form is what every other emailed app link uses (see
  // services/email/dispatcher/customer.js, modules/onboarding/inviteService.js)
  // and it survives the Plan 3 cutover, where /embed-app-v2.html is 301'd from
  // the marketing hosts to the portal by the B7 legacy redirects.
  if (!process.env.BASE_URL) {
    throw new PasswordResetError('missing_base_url',
      'BASE_URL is not configured; refusing to email a reset link with an undefined origin', 500);
  }
  const resetUrl = `${process.env.BASE_URL}/embed-app-v2.html?route=/reset-password&token=${encodeURIComponent(resetToken)}&type=${userType}`;
  await emailService[RESET_EMAIL_SENDERS[userType]](user, resetUrl);
}

async function resetPassword({ token, userType, password }) {
  if (!token || !userType || !password) {
    throw new PasswordResetError(
      'missing_fields',
      'Token, user type, and new password are required'
    );
  }
  if (!USER_TYPES.includes(userType)) {
    throw new PasswordResetError('invalid_user_type', 'Invalid user type');
  }

  const Model = MODEL_BY_USER_TYPE[userType];
  const hashedToken = hashToken(token);
  const user = await Model.findOne({
    resetToken: hashedToken,
    resetTokenExpiry: { $gt: Date.now() }
  });
  if (!user) {
    throw new PasswordResetError('invalid_token', 'Invalid or expired token');
  }

  if (userType === 'operator') {
    // Operators authenticate by PIN; there's no password to reset here.
    throw new PasswordResetError(
      'operator_uses_pin',
      'Operators cannot reset passwords. Please contact your supervisor to reset your PIN.'
    );
  }

  if (userType === 'administrator') {
    // Administrator model's pre-save hook bcrypts the plain password.
    user.password = password;
  } else {
    // Affiliates + customers use PBKDF2 via encryptionUtil.
    const { salt, hash } = encryptionUtil.hashPassword(password);
    user.passwordSalt = salt;
    user.passwordHash = hash;
  }

  user.resetToken = undefined;
  user.resetTokenExpiry = undefined;
  await user.save();
}

module.exports = {
  // Exported so tests can assert every declared type is actually supported
  // end to end, rather than hardcoding a list that drifts from this one.
  USER_TYPES,
  forgotPassword,
  resetPassword,
  PasswordResetError,
  RESET_TOKEN_TTL_MS
};
