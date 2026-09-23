// inviteService — mint / validate / consume / resend / revoke single-use
// affiliate invites (spec §6.2). Raw tokens exist only in the emailed link;
// the DB stores sha256 hashes. Never log a raw token.

const AffiliateInvite = require('./AffiliateInvite');
const SystemConfig = require('../../models/SystemConfig');
const encryptionUtil = require('../../utils/encryption');
const onboardingEmail = require('../../services/email/dispatcher/onboarding');
const logger = require('../../utils/logger');
const { logAuditEvent, AuditEvents } = require('../../utils/auditLogger');

/**
 * Typed domain error. `code` is machine-readable; `statusCode` maps to HTTP.
 * Codes: invalid | expired | already_used | duplicate_pending | not_found | not_pending
 */
class InviteError extends Error {
  constructor(code, statusCode) {
    super(code);
    this.name = 'InviteError';
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

function buildInviteUrl(rawToken) {
  const baseUrl = process.env.BASE_URL || 'https://portal.atxwashdryfold.com';
  return `${baseUrl}/embed-app-v2.html?route=/affiliate-register&invite=${rawToken}`;
}

async function inviteTtlHours() {
  return SystemConfig.getValue('invite_token_ttl_hours', 72);
}

/**
 * Mint a single-use invite and email the link.
 * Email-send failure is NOT fatal — the row stays pending and resendable.
 * @returns {{ invite, rawToken }} rawToken is returned ONLY so the caller can
 *          build flows in-process (tests, registration); it must never be
 *          exposed on an API response or logged.
 * @throws InviteError('duplicate_pending', 409) if a live pending invite exists.
 */
async function createInvite({ email, prefill = {}, ttlHours, adminId }) {
  const normalizedEmail = String(email).toLowerCase().trim();

  const existing = await AffiliateInvite.findOne({
    email: normalizedEmail,
    status: 'pending',
    expiresAt: { $gt: new Date() }
  });
  if (existing) throw new InviteError('duplicate_pending', 409);

  const ttl = ttlHours || await inviteTtlHours();
  const rawToken = encryptionUtil.generateToken(32); // 64 hex chars, CSPRNG
  const invite = await AffiliateInvite.create({
    tokenHash: AffiliateInvite.hashToken(rawToken),
    email: normalizedEmail,
    prefill: {
      firstName: prefill.firstName,
      lastName: prefill.lastName,
      businessName: prefill.businessName,
      phone: prefill.phone
    },
    expiresAt: new Date(Date.now() + ttl * 60 * 60 * 1000),
    createdBy: adminId
  });

  try {
    await onboardingEmail.sendAffiliateInviteEmail({
      email: invite.email,
      firstName: invite.prefill.firstName,
      inviteUrl: buildInviteUrl(rawToken),
      expiresAt: invite.expiresAt
    });
    invite.sentAt = new Date();
    await invite.save();
  } catch (err) {
    logger.warn('Invite email failed to send; invite remains resendable', {
      inviteId: invite.inviteId, error: err.message
    });
  }

  return { invite, rawToken };
}

/**
 * Resolve a raw token to its live pending invite.
 * @throws InviteError invalid(410) | expired(410) | already_used(409)
 */
async function validateInvite(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') throw new InviteError('invalid', 410);
  const invite = await AffiliateInvite.findOne({ tokenHash: AffiliateInvite.hashToken(rawToken) });
  if (!invite) throw new InviteError('invalid', 410);
  if (invite.status === 'accepted') throw new InviteError('already_used', 409);
  if (invite.status !== 'pending') throw new InviteError('invalid', 410); // revoked/expired-status — no oracle
  if (invite.expiresAt <= new Date()) throw new InviteError('expired', 410); // lazy expiry
  return invite;
}

/**
 * Atomic single-use consume (thin wrapper over the model static).
 * @returns the accepted invite, or null if the caller lost the race.
 */
async function consumeInvite(rawToken, affiliateId) {
  return AffiliateInvite.consume(rawToken, { affiliateId });
}

/**
 * Re-mint the token for a pending invite (old link dies), refresh expiry,
 * bump resendCount, re-send the email. Unlike mint, a resend email failure
 * IS surfaced (the admin explicitly asked for a send).
 */
async function resendInvite({ inviteId, adminId }) {
  const invite = await AffiliateInvite.findOne({ inviteId });
  if (!invite) throw new InviteError('not_found', 404);
  if (invite.status !== 'pending') throw new InviteError('not_pending', 409);

  const ttl = await inviteTtlHours();
  const rawToken = encryptionUtil.generateToken(32);
  invite.tokenHash = AffiliateInvite.hashToken(rawToken);
  invite.expiresAt = new Date(Date.now() + ttl * 60 * 60 * 1000);
  invite.resendCount += 1;
  await invite.save();

  await onboardingEmail.sendAffiliateInviteEmail({
    email: invite.email,
    firstName: invite.prefill.firstName,
    inviteUrl: buildInviteUrl(rawToken),
    expiresAt: invite.expiresAt
  });
  invite.sentAt = new Date();
  await invite.save();

  logger.info('Affiliate invite re-sent', { inviteId: invite.inviteId, resendCount: invite.resendCount });
  logAuditEvent(AuditEvents.INVITE_RESENT, { inviteId: invite.inviteId, adminId });
  return { invite, rawToken };
}

/**
 * Revoke a pending invite. Guarded findOneAndUpdate so only pending flips.
 * @throws InviteError('not_pending', 409) when missing or not pending (same
 *         answer for both — no existence oracle).
 */
async function revokeInvite({ inviteId, adminId }) {
  const invite = await AffiliateInvite.findOneAndUpdate(
    { inviteId, status: 'pending' },
    { $set: { status: 'revoked', revokedAt: new Date(), revokedBy: adminId } },
    { new: true }
  );
  if (!invite) throw new InviteError('not_pending', 409);
  return invite;
}

module.exports = {
  createInvite,
  validateInvite,
  consumeInvite,
  resendInvite,
  revokeInvite,
  buildInviteUrl,
  InviteError
};
