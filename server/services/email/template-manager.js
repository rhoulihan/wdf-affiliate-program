// Email template manager
//
// Loads HTML templates from `server/templates/emails/{language}/`, falls back
// to the English version when a language-specific copy is missing, and fills
// `[PLACEHOLDER]` tokens with data. Also exposes a couple of small display
// helpers shared by email dispatchers.
//
// Extracted from utils/emailService.js in Phase 2.

const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const brand = require('../../config/brand');
const { promisify } = require('util');

const readFile = promisify(fs.readFile);

const TEMPLATE_ROOT = path.join(__dirname, '..', '..', 'templates', 'emails');

/**
 * Load a template by name, preferring the language-specific version and
 * falling back to English. Returns a minimal container template on error so
 * email sends don't crash outright.
 */
async function loadTemplate(templateName, language = 'en') {
  try {
    const langPath = path.join(TEMPLATE_ROOT, language, `${templateName}.html`);
    try {
      return await readFile(langPath, 'utf8');
    } catch (langError) {
      logger.info(`Language-specific template not found for ${language}/${templateName}, using default`);
      const defaultPath = path.join(TEMPLATE_ROOT, `${templateName}.html`);
      return await readFile(defaultPath, 'utf8');
    }
  } catch (error) {
    logger.error(`Error loading email template ${templateName}:`, error);
    return FALLBACK_TEMPLATE;
  }
}

/**
 * Replace `[KEY]` placeholders in `template` with values from `data`.
 * Tolerates lower/UPPER/exact casing mismatches.
 */
function fillTemplate(template, data) {
  const baseUrl = process.env.BASE_URL || 'https://rundberglaundry.com';
  data.BASE_URL = baseUrl;
  // Auto-inject the brand tokens so every template resolves them without each
  // caller having to pass them. Caller-supplied values still win.
  if (data.BRAND_NAME === undefined) data.BRAND_NAME = brand.displayName;
  if (data.BRAND_LEGAL === undefined) data.BRAND_LEGAL = brand.legalName;
  // [BRAND_LOGO] resolves to an ABSOLUTE URL (emails can't use relative paths).
  if (data.BRAND_LOGO === undefined) data.BRAND_LOGO = `${baseUrl}${brand.logoPath}`;

  return template.replace(/\[([A-Za-z0-9_]+)\]/g, (match, placeholder) => {
    const candidates = [placeholder, placeholder.toLowerCase(), placeholder.toUpperCase()];
    for (const key of candidates) {
      if (data[key] !== undefined) return data[key];
    }
    logger.warn(`Email template placeholder [${placeholder}] not found in data`);
    return '';
  });
}

/**
 * Pretty-print a pickup/delivery time slot key.
 */
function formatTimeSlot(timeSlot) {
  switch (timeSlot) {
  case 'morning':
    return 'Morning (8am - 12pm)';
  case 'afternoon':
    return 'Afternoon (12pm - 5pm)';
  case 'evening':
    return 'Evening (5pm - 8pm)';
  default:
    return timeSlot;
  }
}

/**
 * Pretty-print a bag size key.
 * Non-string inputs pass through unchanged.
 */
function formatSize(size) {
  if (typeof size !== 'string') {
    return size;
  }
  switch (size) {
  case 'small':
    return 'Small (10-15 lbs)';
  case 'medium':
    return 'Medium (16-30 lbs)';
  case 'large':
    return 'Large (31+ lbs)';
  default:
    return size;
  }
}

const FALLBACK_TEMPLATE = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background-color: #1e3a8a; color: white; padding: 20px; text-align: center; }
      .content { padding: 20px; }
      .footer { background-color: #f5f5f5; padding: 10px; text-align: center; font-size: 12px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header"><h1>[BRAND_NAME]</h1></div>
      <div class="content">[EMAIL_CONTENT]</div>
      <div class="footer">&copy; 2025 [BRAND_LEGAL]. All rights reserved.</div>
    </div>
  </body>
  </html>
`;

module.exports = {
  loadTemplate,
  fillTemplate,
  formatTimeSlot,
  formatSize,
  TEMPLATE_ROOT
};
