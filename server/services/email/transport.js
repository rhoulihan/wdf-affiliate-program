// Email transport — a WRAPPER over @crhs/web-core's shared transport (PR B10).
//
// web-core owns the Mailcow/nodemailer adapter, the console adapter, the by-IP TLS
// servername default, the From-resolution chain and validateMailConfig (spec §7.2.4).
// This module exists for one reason: to bind THIS app's brand and THIS app's template
// root, so every dispatcher keeps calling sendEmail(to, subject, html) unchanged.
//
// Follows the server/utils/cspHelper.js pattern — nothing is read from the
// environment at module scope. `brand` is read through its getters and NEVER
// destructured: server/config/brand.js used to snapshot process.env at import, and
// any script that loaded before dotenv then sent mail as "Laundromat"
// (memory brand_config_lazy_resolve_2026-08-24).

const core = require('@crhs/web-core').email.transport;
const brand = require('../../config/brand');

/**
 * Create the underlying mailer (console stub when EMAIL_PROVIDER=console).
 * Delegates wholesale — the SMTP timeouts and the by-IP TLS servername default
 * (mail.crhsent.com) live in web-core.
 */
function createTransport() {
  return core.createTransport();
}

/**
 * The boot-time mail-configuration hard check (R-24 + R-25), bound to this app's
 * own template root so the check can never validate web-core's (empty) tree.
 * Throws when EMAIL_FROM's domain differs from EMAIL_USER's — the HARD RULE behind
 * the 2026-08-23 outage, where EMAIL_FROM was @crhsent.com while EMAIL_USER was
 * still @wavemax.promo and every send came back 553 for a day.
 * @param {{templateRoot?: string}} [opts]
 */
function validateMailConfig(opts = {}) {
  // Required lazily: keeps the two wrappers independent at load time and keeps the
  // template root defined in exactly one place.
  const { TEMPLATE_ROOT } = require('./template-manager');
  return core.validateMailConfig({ templateRoot: TEMPLATE_ROOT, ...opts });
}

/**
 * Send an HTML email to `to`.
 * Attachments are not supported — upstream mail policy blocks them; images must be
 * referenced by URL.
 * @param {string} to
 * @param {string} subject
 * @param {string} html
 * @param {string|object} [from] a complete From header used verbatim (the SMTP login
 *   must be permitted to send as that address), OR an options bag — spec §7.2.4.
 *   A non-string value is options, never a From header: dispatcher/admin.js:205 passes
 *   its priority-headers object here, and treating that object as the From made
 *   nodemailer emit a message with NO From header at all.
 * @param {{replyTo?: string, fromName?: string}} [options] wins over an options bag
 *   passed as `from`.
 */
async function sendEmail(to, subject, html, from, options) {
  // NOT the place for the EMAIL_USER-owns-EMAIL_FROM check. Every dispatcher wraps its
  // send in try/catch and logs, so a throw here would be swallowed by exactly the
  // pattern that hid the 2026-08-23 outage for a day — and it would take a box whose
  // pair merely drifted from "mail with a wrong From" to "no mail at all", at 3am.
  // validateMailConfig() is the gate, and it belongs in boot (spec §7.2.4),
  // where a mismatch refuses to start the process while a human is watching.
  const fromIsHeader = typeof from === 'string';
  return core.sendEmail(to, subject, html, fromIsHeader ? from : undefined, {
    // This app's brand is the default display name; a caller may override it.
    fromName: brand.displayName,
    ...(fromIsHeader ? null : from),
    ...options
  });
}

module.exports = { createTransport, sendEmail, validateMailConfig };
