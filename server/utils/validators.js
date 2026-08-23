// Centralized Validators for Laundromat Affiliate Program
// Provides consistent validation for common fields across the application

const validator = require('validator');

// Email validation using validator library (same as express-validator uses)
const isValidEmail = (email) => {
  return validator.isEmail(email);
};

// Phone number validation - accepts various formats
const isValidPhone = (phone) => {
  // Remove all non-numeric characters for validation
  const cleaned = phone.replace(/\D/g, '');
  
  // US phone numbers should be 10 digits (or 11 with country code)
  return cleaned.length === 10 || (cleaned.length === 11 && cleaned.startsWith('1'));
};

// Username validation
const isValidUsername = (username) => {
  // 3-30 characters, alphanumeric, underscores, and hyphens
  const usernameRegex = /^[a-zA-Z0-9_-]{3,30}$/;
  return usernameRegex.test(username);
};

// Zip code validation (US)
const isValidZipCode = (zipCode) => {
  // Accepts 5 digits or 5+4 format
  const zipRegex = /^\d{5}(-\d{4})?$/;
  return zipRegex.test(zipCode);
};

// Time format validation (HH:MM)
const isValidTimeFormat = (time) => {
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
};

// Name validation (first/last names)
const isValidName = (name) => {
  // 1-50 characters, letters, spaces, hyphens, apostrophes
  const nameRegex = /^[a-zA-Z\s'-]{1,50}$/;
  return nameRegex.test(name);
};

// Mongoose schema validators
// These return arrays for use with Mongoose match validation
const mongooseValidators = {
  email: {
    validator: isValidEmail,
    message: 'Please enter a valid email address'
  },
  phone: {
    validator: isValidPhone,
    message: 'Please enter a valid phone number'
  },
  username: {
    validator: isValidUsername,
    message: 'Username must be 3-30 characters and contain only letters, numbers, underscores, and hyphens'
  },
  zipCode: {
    validator: isValidZipCode,
    message: 'Please enter a valid zip code'
  },
  timeFormat: {
    validator: isValidTimeFormat,
    message: 'Please enter a valid time format (HH:MM)'
  },
  name: {
    validator: isValidName,
    message: 'Name must be 1-50 characters and contain only letters, spaces, hyphens, and apostrophes'
  }
};

// Express-validator compatible validators
const expressValidators = {
  email: () => validator.isEmail,
  phone: () => (value) => isValidPhone(value),
  username: () => (value) => isValidUsername(value),
  zipCode: () => (value) => isValidZipCode(value),
  timeFormat: () => (value) => isValidTimeFormat(value),
  name: () => (value) => isValidName(value)
};

// Client-side compatible validation functions
// Returns object with isValid and message properties
const validateEmail = (email) => {
  return {
    isValid: isValidEmail(email),
    message: 'Please enter a valid email address'
  };
};

const validatePhone = (phone) => {
  return {
    isValid: isValidPhone(phone),
    message: 'Please enter a valid phone number'
  };
};

const validateUsername = (username) => {
  return {
    isValid: isValidUsername(username),
    message: 'Username must be 3-30 characters and contain only letters, numbers, underscores, and hyphens'
  };
};

const validateZipCode = (zipCode) => {
  return {
    isValid: isValidZipCode(zipCode),
    message: 'Please enter a valid zip code'
  };
};

const validateTimeFormat = (time) => {
  return {
    isValid: isValidTimeFormat(time),
    message: 'Please enter a valid time format (HH:MM)'
  };
};

const validateName = (name) => {
  return {
    isValid: isValidName(name),
    message: 'Name must be 1-50 characters and contain only letters, spaces, hyphens, and apostrophes'
  };
};

module.exports = {
  // Individual validation functions
  isValidEmail,
  isValidPhone,
  isValidUsername,
  isValidZipCode,
  isValidTimeFormat,
  isValidName,
  
  // Mongoose validators
  mongooseValidators,
  
  // Express-validator compatible
  expressValidators,
  
  // Client-side validation functions
  validateEmail,
  validatePhone,
  validateUsername,
  validateZipCode,
  validateTimeFormat,
  validateName
};