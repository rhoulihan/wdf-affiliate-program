// CSP Nonce Middleware for Laundromat Affiliate Program
const crypto = require('crypto');

/**
 * Generates a cryptographically secure nonce for CSP
 * @returns {string} Base64 encoded nonce
 */
const generateNonce = () => {
  return crypto.randomBytes(16).toString('base64');
};

/**
 * Middleware to generate and attach CSP nonce to response locals
 * This nonce can be used in script and style tags to comply with CSP
 */
const cspNonceMiddleware = (req, res, next) => {
  // Generate a unique nonce for this request
  const nonce = generateNonce();
  
  // Store nonce in res.locals for use in templates
  res.locals.cspNonce = nonce;
  
  // Also store in request for potential use in other middleware
  req.cspNonce = nonce;
  
  // Continue to next middleware
  next();
};

module.exports = cspNonceMiddleware;