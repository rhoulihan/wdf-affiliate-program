const emailService = require('../utils/emailService');
const logger = require('../utils/logger');
const brand = require('../config/brand');
const { loadTemplate, fillTemplate } = require('./email/template-manager');

const RECIPIENT = process.env.PARTNER_INQUIRY_RECIPIENT || 'pickups@rundberglaundry.com';

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function nl2br(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

/**
 * Wrap an email body in the shared branded base-template (logo + [BRAND_NAME]
 * header + [BRAND_LEGAL] footer) — the same branding the affiliate welcome
 * email uses. Use `brand.displayName` directly in the body (the content is
 * inserted after fillTemplate's placeholder pass, so a `[BRAND_NAME]` token in
 * the body would not resolve).
 */
async function brandWrap(content) {
  const base = await loadTemplate('base-template');
  return fillTemplate(base, { EMAIL_CONTENT: content, CURRENT_YEAR: String(new Date().getFullYear()) });
}

/* =====================================================================
   PARTNER INQUIRY (public partner-program interest form)
   Two emails per submission:
     1. Notification (to RECIPIENT): full inquiry detail
     2. Inquirer thank-you (to email): brief confirmation
   Both are brand-config-driven (via server/config/brand.js), like the welcome email.
   ===================================================================== */

async function sendPartnerInquiry({ firstName, lastName, email, phone, businessName, serviceArea, volume, message, source }) {
  const fullName = `${firstName} ${lastName}`.trim();
  const subject = `Partner inquiry · ${businessName || fullName}`;

  // --- Notification to RECIPIENT ---
  const messageBlock = message
    ? `<h3>Message</h3>\n    <p style="white-space: pre-wrap;">${nl2br(message)}</p>`
    : '';

  const notificationContent = `
    <h2 style="margin-top:0; color:#143852;">New partner inquiry</h2>
    <table cellpadding="6" cellspacing="0" border="0">
      <tr><td><strong>Name:</strong></td><td>${escapeHtml(fullName)}</td></tr>
      <tr><td><strong>Business:</strong></td><td>${escapeHtml(businessName || '—')}</td></tr>
      <tr><td><strong>Email:</strong></td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
      <tr><td><strong>Phone:</strong></td><td>${escapeHtml(phone || '—')}</td></tr>
      <tr><td><strong>Service area:</strong></td><td>${escapeHtml(serviceArea || '—')}</td></tr>
      <tr><td><strong>Estimated volume:</strong></td><td>${escapeHtml(volume || '—')}</td></tr>
      <tr><td><strong>Source page:</strong></td><td>${escapeHtml(source || '—')}</td></tr>
    </table>
    ${messageBlock}
    <hr>
    <p style="font-size: 12px; color: #6c757d;">Reply to this email to reach ${escapeHtml(firstName)} at ${escapeHtml(email)}.</p>`;
  await emailService.sendEmail(RECIPIENT, subject, await brandWrap(notificationContent));

  // --- Inquirer thank-you ---
  const thankYouSubject = `Thanks for your interest in the ${brand.displayName} partner program`;
  const thankYouContent = `
    <h2 style="margin-top:0; color:#143852;">Thanks, ${escapeHtml(firstName)}.</h2>
    <p>We've received your inquiry about the ${escapeHtml(brand.displayName)} partner program. A member of our team will be in touch with you shortly.</p>
    <p>If there's anything else you'd like us to know in the meantime, just reply to this email.</p>`;
  await emailService.sendEmail(email, thankYouSubject, await brandWrap(thankYouContent));

  logger.info('Partner inquiry received', { email, businessName: businessName || null });
}

module.exports = {
  sendPartnerInquiry
};
