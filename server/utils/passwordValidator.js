// Password Validation Utility for Laundromat Affiliate Program

/**
 * Strong password validation utility with comprehensive security requirements
 */

const commonPasswords = [
  'password', 'password123', '123456', '123456789', 'qwerty', 'abc123',
  'password1', 'admin', 'letmein', 'welcome', 'monkey', '1234567890',
  'qwerty123', 'password12', 'admin123', 'root', 'user', 'test',
  'guest', 'login', 'pass', 'secret', 'master', 'super', 'admin1',
  'changeme', 'default', 'temp', 'temporary', 'wavemax', 'laundry',
  'passwordextra1!', 'welcomeextra1!', 'adminextra1!', 'userextra1!',
  'testextra1!', 'guestextra1!', 'tempextra1!', 'passextra1!', 'loginextra1!'
];

/**
 * Validate password strength
 * @param {string} password - The password to validate
 * @param {object} options - Options object with username, email, passwordHistory
 * @returns {object} - Validation result with success boolean and errors array
 */
const validatePasswordStrength = (password, options = {}) => {
  const { username = '', email = '', passwordHistory = [] } = options;
  const errors = [];

  // Handle null/undefined password
  if (!password) {
    errors.push('Password is required');
    return { success: false, errors };
  }

  // Check minimum length (8 characters)
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  // Check for uppercase letters
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  // Check for lowercase letters
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  // Check for numbers
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  // Check for special characters
  if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)');
  }

  // Check against common passwords
  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('Password is too common');
  }

  // Check if password contains username or email
  const containsUsername = username && password.toLowerCase().includes(username.toLowerCase());
  const containsEmailUser = email && password.toLowerCase().includes(email.split('@')[0].toLowerCase());

  if (containsUsername || containsEmailUser) {
    errors.push('Password cannot contain your username or email');
  }

  // Check for sequential characters (3+ consecutive characters in sequence)
  const hasSequential = (() => {
    const sequences = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
    for (const seq of sequences) {
      for (let i = 0; i <= seq.length - 3; i++) {
        if (password.includes(seq.substring(i, i + 3))) {
          return true;
        }
      }
    }
    return false;
  })();

  if (hasSequential) {
    errors.push('Password cannot contain sequential characters (e.g., 123, abc)');
  }

  // Check for repeated characters (more than 2 in a row)
  if (/(.)\1{2,}/.test(password)) {
    errors.push('Password cannot have more than 2 consecutive identical characters');
  }

  // Check password history
  if (passwordHistory && passwordHistory.length > 0) {
    if (passwordHistory.includes(password)) {
      errors.push('Password cannot be one of your last 5 passwords');
    }
  }

  return {
    success: errors.length === 0,
    errors: errors
  };
};

/**
 * Express validator middleware for password validation
 */
const passwordValidationMiddleware = (req, res, next) => {
  const password = req.body.password;

  // Skip validation if no password present
  if (!password) {
    return next();
  }

  const username = req.body.username || '';
  const email = req.body.email || '';

  const validation = validatePasswordStrength(password, { username, email });

  if (!validation.success) {
    const strength = getPasswordStrength(password);
    return res.status(400).json({
      success: false,
      message: 'Password validation failed',
      errors: validation.errors,
      strength: strength
    });
  }

  next();
};

/**
 * Express validator custom validator function
 */
const customPasswordValidator = (options = {}) => {
  return (value, { req } = {}) => {
    if (!req) {
      const validation = validatePasswordStrength(value);
      if (!validation.success) {
        throw new Error(validation.errors[0]); // Throw the first error only
      }
      return true;
    }

    const username = req.body.username || '';
    const email = req.body.email || '';
    const userType = req.body.userType || '';

    // Check username/email inclusion for admin/operator/affiliate
    const shouldCheckInclusion = userType === 'admin' || userType === 'operator' || !userType;

    const validation = validatePasswordStrength(value, {
      username: shouldCheckInclusion ? username : '',
      email: shouldCheckInclusion ? email : ''
    });

    if (!validation.success) {
      throw new Error(validation.errors[0]); // Throw the first error only
    }

    return true;
  };
};

/**
 * Check if password has been used recently (for administrators/operators)
 * @param {string} newPassword - The new password to check
 * @param {Array} passwordHistory - Array of previous passwords or hashes
 * @param {string} salt - Salt to use for hashing (optional)
 * @returns {boolean} - True if password is in history
 */
const isPasswordInHistory = (newPassword, passwordHistory = [], salt = null) => {
  if (!passwordHistory || passwordHistory.length === 0) {
    return false;
  }

  // For testing, check direct string comparison first
  if (passwordHistory.includes(newPassword)) {
    return true;
  }

  // For production, use hashed comparison if salt is provided
  if (salt) {
    try {
      const encryptionUtil = require('./encryption');
      const newPasswordHash = encryptionUtil.hashPassword(newPassword, salt);
      return passwordHistory.some(historyHash => historyHash === newPasswordHash);
    } catch (error) {
      // Fall back to direct comparison if encryption fails
      return passwordHistory.includes(newPassword);
    }
  }

  return false;
};

/**
 * Generate password strength score and label
 * @param {string} password - Password to score
 * @returns {object} - Object with score (0-5) and label
 */
const getPasswordStrength = (password) => {
  let score = 0;

  // Length scoring (max 30 points)
  if (password.length >= 8) score += 15;
  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 5;

  // Character variety (max 40 points)
  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 10;
  if (/\d/.test(password)) score += 10;
  if (/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) score += 10;

  // Complexity bonus (max 30 points)
  if (!/(.)\1{1,}/.test(password)) score += 10; // No repeated chars
  if (!/123|234|345|456|567|678|789|890|abc|bcd|cde/i.test(password)) score += 10; // No sequences
  if (!commonPasswords.includes(password.toLowerCase())) score += 10; // Not common

  const finalScore = Math.min(score, 100);

  // Convert to 0-5 scale and determine label
  let strengthScore;
  let label;

  if (finalScore < 20) {
    strengthScore = 0;
    label = 'Very Weak';
  } else if (finalScore < 40) {
    strengthScore = 1;
    label = 'Weak';
  } else if (finalScore < 60) {
    strengthScore = 2;
    label = 'Fair';
  } else if (finalScore < 80) {
    strengthScore = 3;
    label = 'Good';
  } else if (finalScore < 95) {
    strengthScore = 4;
    label = 'Strong';
  } else {
    strengthScore = 5;
    label = 'Very Strong';
  }

  return {
    score: strengthScore,
    label: label
  };
};

module.exports = {
  validatePasswordStrength,
  passwordValidationMiddleware,
  customPasswordValidator,
  isPasswordInHistory,
  getPasswordStrength,
  commonPasswords
};