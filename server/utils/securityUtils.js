/**
 * Security Utilities for Laundromat Affiliate Program
 * Contains functions to prevent common security vulnerabilities
 */

/**
 * Escapes special regex characters to prevent ReDoS attacks
 * @param {string} string - User input to escape
 * @returns {string} - Escaped string safe for regex use
 */
function escapeRegex(string) {
  if (typeof string !== 'string') return '';
  // Escape all special regex characters
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validates and sanitizes sort field names to prevent injection
 * @param {string} field - Field name to validate
 * @param {string[]} allowedFields - Array of allowed field names
 * @returns {string|null} - Valid field name or null
 */
function validateSortField(field, allowedFields) {
  if (!field || typeof field !== 'string') return null;
  
  // Remove any potential injection attempts
  const cleanField = field.replace(/[^a-zA-Z0-9._-]/g, '');
  
  // Check against whitelist
  return allowedFields.includes(cleanField) ? cleanField : null;
}

/**
 * Sanitizes object IDs to prevent injection
 * @param {string} id - ID to sanitize
 * @returns {string|null} - Sanitized ID or null
 */
function sanitizeObjectId(id) {
  if (!id || typeof id !== 'string') return null;
  
  // MongoDB ObjectIds are 24 character hex strings
  const objectIdRegex = /^[a-fA-F0-9]{24}$/;
  return objectIdRegex.test(id) ? id : null;
}

module.exports = {
  escapeRegex,
  validateSortField,
  sanitizeObjectId
};