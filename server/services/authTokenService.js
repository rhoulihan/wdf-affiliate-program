// Auth token service
//
// JWT issuance + refresh-token rotation + blacklist logout. The login flows
// stay in the controller (each has its own bespoke lockout/activation
// rules), but every flow hands the user+role off to this service to mint
// tokens. generateToken/generateRefreshToken are re-exported so other
// services can reuse them without importing from the controller.
//
// cryptoWrapper is passed in rather than imported so the controller's test
// seam (which mocks randomBytes) keeps working.

const jwt = require('jsonwebtoken');
const RefreshToken = require('../models/RefreshToken');
const TokenBlacklist = require('../models/TokenBlacklist');
const Affiliate = require('../models/Affiliate');
const Customer = require('../models/Customer');
const Administrator = require('../models/Administrator');
const Operator = require('../models/Operator');
const logger = require('../utils/logger');

const MODEL_BY_USER_TYPE = {
  affiliate: Affiliate,
  customer: Customer,
  administrator: Administrator,
  operator: Operator
};

const REFRESH_TOKEN_TTL_DAYS = 30;

class AuthTokenError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
    this.isAuthTokenError = true;
  }
}

function generateToken(data, expiresIn = '1h') {
  return jwt.sign(data, process.env.JWT_SECRET, {
    expiresIn,
    issuer: 'crhs-portal-api',
    audience: 'crhs-portal-client'
  });
}

async function generateRefreshToken({ userId, userType, ip, replaceToken = null, cryptoWrapper }) {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + REFRESH_TOKEN_TTL_DAYS);

  const token = cryptoWrapper.randomBytes(40).toString('hex');

  // Token rotation: old token gets replacedByToken pointer so a stolen
  // refresh token is invalidated the next time the legitimate owner uses it.
  if (replaceToken) {
    await RefreshToken.findOneAndUpdate(
      { token: replaceToken },
      { replacedByToken: token }
    );
  }

  await new RefreshToken({
    token,
    userId,
    userType,
    expiryDate,
    createdByIp: ip
  }).save();

  return token;
}

function roleIdField(userType, user) {
  if (userType === 'affiliate') return { affiliateId: user.affiliateId };
  if (userType === 'customer') return { customerId: user.customerId };
  if (userType === 'administrator') return { adminId: user.adminId };
  if (userType === 'operator') return { employeeId: user.employeeId };
  return {};
}

async function refreshAccessToken({ refreshToken, ip, cryptoWrapper }) {
  if (!refreshToken) {
    throw new AuthTokenError('missing_token', 'Refresh token is required');
  }

  // findOneAndUpdate with revoked:null → new:false swaps atomically: if
  // another concurrent request got the token first, their revoked timestamp
  // wins and our match returns null (already-consumed token).
  const storedToken = await RefreshToken.findOneAndUpdate(
    { token: refreshToken, revoked: null, expiryDate: { $gt: new Date() } },
    { revoked: new Date(), revokedByIp: ip },
    { new: false }
  );

  if (!storedToken) {
    throw new AuthTokenError('invalid_token', 'Invalid or expired refresh token', 401);
  }

  const Model = MODEL_BY_USER_TYPE[storedToken.userType];
  const user = Model ? await Model.findById(storedToken.userId) : null;
  if (!user) {
    throw new AuthTokenError('user_not_found', 'User not found', 401);
  }

  const accessToken = generateToken({
    id: user._id,
    ...roleIdField(storedToken.userType, user),
    role: storedToken.userType
  });

  const newRefreshToken = await generateRefreshToken({
    userId: user._id,
    userType: storedToken.userType,
    ip,
    replaceToken: refreshToken,
    cryptoWrapper
  });

  return { token: accessToken, refreshToken: newRefreshToken };
}

function describeVerifiedUser(user) {
  // Thrown as a plain Error (not AuthTokenError) so the controller maps it
  // to a 500 — if req.user is missing, the auth middleware misbehaved, which
  // isn't something a client can fix.
  if (!user || !user.id) throw new Error('User data not found in request');

  // Limited-scope admin token issued during a required password change —
  // verifyToken surfaces the flag so the client can route to /change-password.
  const requirePasswordChange = !!(
    user.role === 'administrator'
    && user.permissions
    && user.permissions.length === 1
    && user.permissions[0] === 'change_password_required'
  );

  return {
    requirePasswordChange,
    user: {
      id: user.id,
      role: user.role,
      ...(user.affiliateId && { affiliateId: user.affiliateId }),
      ...(user.customerId && { customerId: user.customerId }),
      ...(user.adminId && { adminId: user.adminId })
    }
  };
}

async function logout({ refreshToken, accessToken, user }) {
  // Blacklist the access token so it can't be replayed before its exp hits.
  if (accessToken && user) {
    try {
      const decoded = jwt.decode(accessToken);
      if (decoded && decoded.exp) {
        const expiresAt = new Date(decoded.exp * 1000);
        await TokenBlacklist.blacklistToken(
          accessToken,
          user.id || user.userId || user.affiliateId || user.customerId
            || user.administratorId || user.operatorId,
          user.role || user.userType,
          expiresAt,
          'logout'
        );
      }
    } catch (blacklistError) {
      // Never fail logout on blacklist issues; the refresh token is still deleted.
      logger.error('Error blacklisting token:', blacklistError);
    }
  }

  if (refreshToken) {
    try {
      await RefreshToken.findOneAndDelete({ token: refreshToken });
    } catch (error) {
      logger.error('Error deleting refresh token:', error);
    }
  }
}

module.exports = {
  generateToken,
  generateRefreshToken,
  refreshAccessToken,
  describeVerifiedUser,
  logout,
  AuthTokenError,
  REFRESH_TOKEN_TTL_DAYS
};
