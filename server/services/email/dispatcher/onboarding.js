// Onboarding email dispatchers — affiliate invites (spec §6.2).
//
// LOAD-BEARING CONSTRAINT: the mail transport blocks attachments (upstream
// policy — see transport.js). The invite is therefore a LINK, never a file.
// Never log the invite URL or raw token — only the inviteId/email.

const { loadTemplate, fillTemplate } = require('../template-manager');
const { sendEmail } = require('../transport');
const brand = require('../../../config/brand');
const logger = require('../../../utils/logger');

const SUBJECTS = {
  en: `Your ${brand.displayName} Affiliate Invitation`,
  es: `Su invitación de afiliado de ${brand.displayName}`,
  pt: `Seu convite de afiliado ${brand.displayName}`,
  de: `Ihre ${brand.displayName}-Partner-Einladung`
};

const DATE_LOCALES = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', de: 'de-DE' };

/**
 * Send the single-use affiliate invite email.
 *
 * @param {Object} params
 * @param {string} params.email      Recipient — the invite's locked email
 * @param {string} [params.firstName] Prefill first name ('' tolerated)
 * @param {string} params.inviteUrl  Full registration URL carrying the raw token
 * @param {Date|string} params.expiresAt Invite expiry timestamp
 * @param {string} [params.language='en'] en|es|pt|de (anything else → en)
 * @returns {Promise<boolean>} true once handed to the transport
 * @throws transport errors are propagated — the caller decides whether the
 *         failure is fatal (inviteService treats mint-time failure as
 *         non-fatal: the row stays resendable).
 */
exports.sendAffiliateInviteEmail = async function sendAffiliateInviteEmail({
  email, firstName, inviteUrl, expiresAt, language = 'en'
}) {
  const lang = SUBJECTS[language] ? language : 'en';
  const template = await loadTemplate('affiliate-invite', lang);
  const html = fillTemplate(template, {
    first_name: firstName || '',
    invite_url: inviteUrl,
    expires_at: new Date(expiresAt).toLocaleString(DATE_LOCALES[lang], {
      dateStyle: 'long',
      timeStyle: 'short'
    })
  });
  await sendEmail(email, SUBJECTS[lang], html);
  logger.info('Affiliate invite email sent', { email });
  return true;
};

module.exports = exports;
