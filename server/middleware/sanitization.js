// Input Sanitization Middleware for Laundromat Affiliate Program

const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss');

/**
 * Sanitize input to prevent XSS attacks
 * Recursively sanitizes all string values in objects
 */
const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    // Remove any HTML tags and encode special characters
    return xss(input, {
      whiteList: {}, // No HTML tags allowed
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script']
    });
  } else if (Array.isArray(input)) {
    return input.map(item => sanitizeInput(item));
  } else if (input !== null && typeof input === 'object') {
    const sanitized = {};
    for (const key in input) {
      if (input.hasOwnProperty(key)) {
        sanitized[key] = sanitizeInput(input[key]);
      }
    }
    return sanitized;
  }
  return input;
};

/**
 * Middleware to sanitize request body, query, and params
 */
const sanitizeRequest = (req, res, next) => {
  // Sanitize body
  if (req.body) {
    req.body = sanitizeInput(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeInput(req.query);
  }

  // Sanitize URL parameters
  if (req.params) {
    req.params = sanitizeInput(req.params);
  }

  next();
};

/**
 * Validate and sanitize email
 */
const sanitizeEmail = (email) => {
  if (!email || typeof email !== 'string') return '';

  // Remove any HTML and trim whitespace
  email = xss(email).trim().toLowerCase();

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) ? email : '';
};

/**
 * Validate and sanitize phone number
 */
const sanitizePhone = (phone) => {
  if (!phone || typeof phone !== 'string') return '';

  // Remove everything except digits, +, -, (, ), and spaces
  return phone.replace(/[^0-9+\-() ]/g, '').trim();
};

/**
 * Validate and sanitize alphanumeric IDs
 */
const sanitizeId = (id) => {
  if (!id || typeof id !== 'string') return '';

  // Only allow alphanumeric characters and hyphens
  return id.replace(/[^a-zA-Z0-9-]/g, '').trim();
};

/**
 * Sanitize file paths to prevent directory traversal
 */
const sanitizePath = (path) => {
  if (!path || typeof path !== 'string') return '';

  // Remove any directory traversal attempts and preserve backslashes for Windows paths
  return path.replace(/\.\./g, '').replace(/[^a-zA-Z0-9._\-\/\\:]/g, '');
};

module.exports = {
  mongoSanitize,
  sanitizeRequest,
  sanitizeEmail,
  sanitizePhone,
  sanitizeId,
  sanitizePath,
  sanitizeInput
};