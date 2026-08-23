// Email transport
//
// Mailcow SMTP adapter, with a console transport for development/testing.
// Extracted from utils/emailService.js in Phase 2.

const nodemailer = require('nodemailer');
const logger = require('../../utils/logger');
const brand = require('../../config/brand');

/**
 * Create the underlying mailer. Returns either a console-logging stub
 * (EMAIL_PROVIDER=console) or a configured nodemailer transport.
 */
function createTransport() {
  if (process.env.EMAIL_PROVIDER === 'console') {
    return {
      sendMail: async (mailOptions) => {
        logger.info('=== EMAIL CONSOLE LOG ===');
        logger.info('From:', mailOptions.from);
        logger.info('To:', mailOptions.to);
        logger.info('Subject:', mailOptions.subject);
        logger.info('HTML:', mailOptions.html);
        logger.info('=========================');
        return { messageId: 'console-message-id' };
      }
    };
  }

  const transportConfig = {
    host: process.env.EMAIL_HOST || 'localhost',
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    secure: process.env.EMAIL_PORT === '465',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production'
    }
  };

  // When connecting by IP, TLS verification has no hostname to validate the
  // cert against, so set the servername explicitly to match the mail server's
  // certificate. The Ultahost mail box presents a cert for mail.crhsent.com
  // (SAN: crhsent.com, mail.crhsent.com, www.crhsent.com) — override via
  // EMAIL_TLS_SERVERNAME if the mail host's cert ever changes.
  if (process.env.EMAIL_HOST && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(process.env.EMAIL_HOST)) {
    transportConfig.tls.servername = process.env.EMAIL_TLS_SERVERNAME || 'mail.crhsent.com';
  }

  return nodemailer.createTransport(transportConfig);
}

/**
 * Send an HTML email to `to`.
 * Attachments are not supported — upstream mail policy blocks them; images
 * must be referenced by URL.
 * @param {string} [fromOverride] - full From header (e.g. '"Brand Name" <admin@x>').
 *   Requires the SMTP login to be permitted to send as that address.
 */
async function sendEmail(to, subject, html, fromOverride) {
  if (!to) {
    throw new Error('No recipient email address provided');
  }

  logger.info('[sendEmail] Sending email to:', to);
  const transporter = createTransport();

  const from = fromOverride || `"${brand.displayName}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@rundberglaundry.com'}>`;
  const mailOptions = { from, to, subject, html };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error('Error sending email:', error);
    throw error;
  }
}

module.exports = { createTransport, sendEmail };
