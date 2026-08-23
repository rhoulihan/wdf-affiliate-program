// Laundromat Affiliate Registration Form Validation
(function() {
  'use strict';

  // Validation patterns and rules
  const ValidationRules = {
    email: {
      pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      message: 'Please enter a valid email address'
    },
    phone: {
      pattern: /^[\+]?[1]?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/,
      message: 'Please enter a valid phone number (e.g., (555) 123-4567)'
    },
    zipCode: {
      pattern: /^\d{5}(-\d{4})?$/,
      message: 'Please enter a valid ZIP code (e.g., 12345 or 12345-6789)'
    },
    state: {
      // US State abbreviations
      validStates: [
        'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
        'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
        'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
        'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
        'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
      ],
      message: 'Please enter a valid US state abbreviation (e.g., TX, CA, NY)'
    },
    name: {
      pattern: /^[a-zA-Z\s\-']{2,50}$/,
      message: 'Name must be 2-50 characters and contain only letters, spaces, hyphens, and apostrophes'
    },
    businessName: {
      pattern: /^[a-zA-Z0-9\s\-'&.,()]{0,100}$/,
      message: 'Business name can be up to 100 characters'
    }
  };

  // Validation utility functions
  const ValidationUtils = {
    // Email validation
    validateEmail: function(email) {
      if (!email || email.trim() === '') {
        return { isValid: false, message: 'Email address is required' };
      }

      const trimmedEmail = email.trim().toLowerCase();

      if (!ValidationRules.email.pattern.test(trimmedEmail)) {
        return { isValid: false, message: ValidationRules.email.message };
      }

      // Additional checks
      if (trimmedEmail.length > 254) {
        return { isValid: false, message: 'Email address is too long' };
      }

      // Check for common typos
      const commonDomainTypos = {
        'gmail.co': 'gmail.com',
        'yahoo.co': 'yahoo.com',
        'hotmail.co': 'hotmail.com',
        'outlook.co': 'outlook.com'
      };

      const domain = trimmedEmail.split('@')[1];
      if (commonDomainTypos[domain]) {
        return {
          isValid: false,
          message: `Did you mean ${trimmedEmail.replace(domain, commonDomainTypos[domain])}?`,
          suggestion: trimmedEmail.replace(domain, commonDomainTypos[domain])
        };
      }

      return { isValid: true };
    },

    // Phone number validation and formatting
    validatePhone: function(phone) {
      if (!phone || phone.trim() === '') {
        return { isValid: false, message: 'Phone number is required' };
      }

      const trimmedPhone = phone.trim();

      // First check if there are any invalid characters (letters, special chars except allowed formatting)
      const allowedCharsPattern = /^[0-9\-\(\)\s\+\.]+$/;
      if (!allowedCharsPattern.test(trimmedPhone)) {
        return { isValid: false, message: 'Phone number can only contain numbers and formatting characters (-, (, ), +, ., space)' };
      }

      // Remove all non-digit characters for validation
      const digitsOnly = trimmedPhone.replace(/\D/g, '');

      // Check for valid US phone number lengths
      if (digitsOnly.length === 10) {
        // Format as (555) 123-4567
        const formatted = `(${digitsOnly.substr(0,3)}) ${digitsOnly.substr(3,3)}-${digitsOnly.substr(6,4)}`;
        return { isValid: true, formatted: formatted };
      } else if (digitsOnly.length === 11 && digitsOnly[0] === '1') {
        // Format as +1 (555) 123-4567
        const formatted = `+1 (${digitsOnly.substr(1,3)}) ${digitsOnly.substr(4,3)}-${digitsOnly.substr(7,4)}`;
        return { isValid: true, formatted: formatted };
      } else if (ValidationRules.phone.pattern.test(trimmedPhone)) {
        return { isValid: true, formatted: trimmedPhone };
      }

      return { isValid: false, message: ValidationRules.phone.message };
    },

    // ZIP code validation
    validateZipCode: function(zipCode) {
      if (!zipCode || zipCode.trim() === '') {
        return { isValid: false, message: 'ZIP code is required' };
      }

      const trimmedZip = zipCode.trim();

      if (!ValidationRules.zipCode.pattern.test(trimmedZip)) {
        return { isValid: false, message: ValidationRules.zipCode.message };
      }

      return { isValid: true };
    },

    // State validation
    validateState: function(state) {
      if (!state || state.trim() === '') {
        return { isValid: false, message: 'State is required' };
      }

      const trimmedState = state.trim().toUpperCase();

      if (!ValidationRules.state.validStates.includes(trimmedState)) {
        return { isValid: false, message: ValidationRules.state.message };
      }

      return { isValid: true, formatted: trimmedState };
    },

    // Name validation
    validateName: function(name, fieldName = 'Name') {
      if (!name || name.trim() === '') {
        return { isValid: false, message: `${fieldName} is required` };
      }

      const trimmedName = name.trim();

      if (!ValidationRules.name.pattern.test(trimmedName)) {
        return { isValid: false, message: ValidationRules.name.message };
      }

      return { isValid: true };
    },

    // Business name validation (optional field)
    validateBusinessName: function(businessName) {
      if (!businessName || businessName.trim() === '') {
        return { isValid: true }; // Optional field
      }

      const trimmedName = businessName.trim();

      if (!ValidationRules.businessName.pattern.test(trimmedName)) {
        return { isValid: false, message: ValidationRules.businessName.message };
      }

      return { isValid: true };
    }
  };

  // UI feedback functions
  const UIFeedback = {
    showError: function(fieldId, message, suggestion = null) {
      const field = document.getElementById(fieldId);
      if (!field) return;

      // Remove existing error
      this.clearError(fieldId);

      // Add error styling with validation-error class from CSS
      field.classList.add('validation-error');
      field.classList.remove('validation-success');

      // Create error message element
      const errorDiv = document.createElement('div');
      errorDiv.id = `${fieldId}-error`;
      errorDiv.className = 'validation-message';
      errorDiv.textContent = message;

      // Add suggestion if provided
      if (suggestion) {
        const suggestionSpan = document.createElement('span');
        suggestionSpan.className = 'validation-suggestion';
        suggestionSpan.textContent = `Did you mean: ${suggestion}`;
        suggestionSpan.onclick = () => {
          field.value = suggestion;
          this.showSuccess(fieldId);
          this.validateField(fieldId);
        };
        errorDiv.appendChild(suggestionSpan);
      }

      // Insert after the field
      field.parentNode.insertBefore(errorDiv, field.nextSibling);
    },

    showSuccess: function(fieldId) {
      const field = document.getElementById(fieldId);
      if (!field) return;

      // Clear error state and show success
      this.clearError(fieldId);
      field.classList.add('validation-success');
      field.classList.remove('validation-error');
    },

    clearError: function(fieldId) {
      const field = document.getElementById(fieldId);
      if (!field) return;

      field.classList.remove('validation-error', 'validation-success');

      const existingError = document.getElementById(`${fieldId}-error`);
      if (existingError) {
        existingError.remove();
      }
    },

    validateField: function(fieldId) {
      const field = document.getElementById(fieldId);
      if (!field) return false;

      const value = field.value;
      let result;

      switch (fieldId) {
      case 'email':
        result = ValidationUtils.validateEmail(value);
        break;
      case 'phone':
        result = ValidationUtils.validatePhone(value);
        if (result.isValid && result.formatted) {
          field.value = result.formatted;
        }
        break;
      case 'zipCode':
        result = ValidationUtils.validateZipCode(value);
        break;
      case 'state':
        result = ValidationUtils.validateState(value);
        if (result.isValid && result.formatted) {
          field.value = result.formatted;
        }
        break;
      case 'firstName':
        result = ValidationUtils.validateName(value, 'First name');
        break;
      case 'lastName':
        result = ValidationUtils.validateName(value, 'Last name');
        break;
      case 'businessName':
        result = ValidationUtils.validateBusinessName(value);
        break;
      default:
        return true;
      }

      if (result.isValid) {
        this.showSuccess(fieldId);
        return true;
      } else {
        this.showError(fieldId, result.message, result.suggestion);
        return false;
      }
    }
  };

  // Track if validation has been initialized to prevent duplicate listeners
  let validationInitialized = false;

  // Track which fields have been interacted with and need validation
  let fieldsRequiringValidation = new Set();

  // Initialize validation when DOM is ready
  function initializeValidation() {
    if (validationInitialized) {
      console.log('[Form Validation] Already initialized, skipping...');
      return;
    }

    console.log('[Form Validation] Initializing field validation...');
    console.log('[Form Validation] Document readyState:', document.readyState);
    console.log('[Form Validation] Current URL:', window.location.href);

    // Fields to validate
    const fieldsToValidate = ['email', 'phone', 'zipCode', 'state', 'firstName', 'lastName', 'businessName'];

    console.log('[Form Validation] Looking for fields:', fieldsToValidate);

    let fieldsFound = 0;
    fieldsToValidate.forEach(fieldId => {
      const field = document.getElementById(fieldId);
      console.log(`[Form Validation] Field ${fieldId}:`, field ? 'FOUND' : 'NOT FOUND');
      if (field) {
        fieldsFound++;
        console.log(`[Form Validation] Adding event listeners to ${fieldId}`);

        // Track when user starts interacting with field (input event)
        field.addEventListener('input', () => {
          console.log(`[Form Validation] User started interacting with ${fieldId}`);
          fieldsRequiringValidation.add(fieldId);

          // Only validate on input if field is already marked for validation
          if (fieldsRequiringValidation.has(fieldId)) {
            // Debounce validation
            clearTimeout(field.validationTimeout);
            field.validationTimeout = setTimeout(() => {
              console.log(`[Form Validation] Input validation for ${fieldId}: "${field.value}"`);
              UIFeedback.validateField(fieldId);
            }, 300);
          }
        });

        // Real-time validation on blur with focus trap (only for fields that were interacted with)
        field.addEventListener('blur', (event) => {
          console.log(`[Form Validation] Blur event for ${fieldId}, value: "${field.value}"`);

          // Only validate and trap focus if user has interacted with this field
          if (fieldsRequiringValidation.has(fieldId)) {
            const isValid = UIFeedback.validateField(fieldId);
            console.log(`[Form Validation] Validation result for ${fieldId}: ${isValid}`);

            // If validation fails, prevent focus from leaving the field
            if (!isValid) {
              console.log(`[Form Validation] ${fieldId} invalid - preventing focus changes`);

              // Prevent the blur event completely
              event.preventDefault();
              event.stopPropagation();

              // Immediately refocus the field
              field.focus();

              // Flash the border to draw attention to the error
              field.style.borderColor = '#ef4444';
              field.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.3)';
              setTimeout(() => {
                field.style.boxShadow = '';
              }, 300);
            } else {
              console.log(`[Form Validation] Validation passed for ${fieldId}, allowing normal blur/focus behavior`);
              // Field is valid - allow completely normal focus behavior
            }
          } else {
            console.log(`[Form Validation] ${fieldId} not interacted with yet, allowing blur without validation`);
            // Allow blur without validation if user hasn't interacted with field
          }
        });

        // Don't clear errors on focus - only clear when field becomes valid
        field.addEventListener('focus', () => {
          console.log(`[Form Validation] Focus event for ${fieldId} - keeping error state until valid`);
          // Don't clear errors here - let them persist until field is valid
        });

        // For state field, auto-format to uppercase
        if (fieldId === 'state') {
          field.addEventListener('input', () => {
            const cursorPos = field.selectionStart;
            field.value = field.value.toUpperCase();
            field.setSelectionRange(cursorPos, cursorPos);
          });
        }
      }
    });

    // Add global click handler to prevent focus changes when any interacted field is invalid
    if (fieldsFound > 0) {
      document.addEventListener('click', (event) => {
        // Check if any interacted field is invalid
        let invalidField = null;

        for (const fieldId of fieldsRequiringValidation) {
          const field = document.getElementById(fieldId);
          if (field) {
            const isValid = UIFeedback.validateField(fieldId);
            if (!isValid) {
              invalidField = field;
              break; // Found first invalid field that was interacted with
            }
          }
        }

        // If there's an invalid field and user clicks on a different form element
        if (invalidField && event.target !== invalidField &&
            (event.target.tagName === 'INPUT' || event.target.tagName === 'BUTTON' || event.target.tagName === 'SELECT' || event.target.tagName === 'TEXTAREA')) {

          console.log(`[Form Validation] Preventing click on ${event.target.id || event.target.tagName} while ${invalidField.id} is invalid`);
          event.preventDefault();
          event.stopPropagation();

          // Flash the invalid field to draw attention
          invalidField.focus();
          invalidField.style.borderColor = '#ef4444';
          invalidField.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.3)';
          setTimeout(() => {
            invalidField.style.boxShadow = '';
          }, 300);
        }
      }, true); // Use capture phase to catch events before they reach targets
    }

    // Mark as initialized only if we found some fields
    if (fieldsFound > 0) {
      validationInitialized = true;
      console.log(`[Form Validation] Validation initialized for ${fieldsFound} fields:`, fieldsToValidate);
    } else {
      console.log('[Form Validation] No fields found, not marking as initialized');
    }
  }

  // Validate entire form before submission
  function validateForm() {
    console.log('[Form Validation] Validating entire form...');

    const fieldsToValidate = ['email', 'phone', 'zipCode', 'state', 'firstName', 'lastName'];
    let isValid = true;

    fieldsToValidate.forEach(fieldId => {
      const fieldValid = UIFeedback.validateField(fieldId);
      if (!fieldValid) {
        isValid = false;
      }
    });

    // Also validate business name if present
    const businessNameField = document.getElementById('businessName');
    if (businessNameField && businessNameField.value.trim()) {
      const businessNameValid = UIFeedback.validateField('businessName');
      if (!businessNameValid) {
        isValid = false;
      }
    }

    console.log('[Form Validation] Form validation result:', isValid);
    return isValid;
  }

  // Export functions globally
  window.FormValidation = {
    initialize: initializeValidation,
    validateForm: validateForm,
    validateField: UIFeedback.validateField,
    ValidationUtils: ValidationUtils,
    ValidationRules: ValidationRules,
    UIFeedback: UIFeedback,
    // Convenience boolean shortcuts so callers don't have to destructure
    // .isValid from the full result — useful in quick "disable/enable"
    // checks. All inline email regexes in the codebase should route here.
    isValidEmail: (email) => ValidationUtils.validateEmail(email).isValid,
    isValidPhone: (phone) => ValidationUtils.validatePhone(phone).isValid,
    isValidZipCode: (zip) => ValidationUtils.validateZipCode(zip).isValid,
    isValidState: (state) => ValidationUtils.validateState(state).isValid,
    // Add debug function to manually trigger initialization
    debugInit: function() {
      console.log('[Form Validation] Manual debug initialization triggered');
      console.log('[Form Validation] Window.FormValidation exists:', !!window.FormValidation);
      console.log('[Form Validation] Available methods:', Object.keys(window.FormValidation));
      initializeValidation();
    }
  };

  // Auto-initialize when DOM is ready
  console.log('[Form Validation] Script loaded, readyState:', document.readyState);
  if (document.readyState === 'loading') {
    console.log('[Form Validation] Waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', initializeValidation);
  } else {
    console.log('[Form Validation] DOM already ready, initializing immediately...');
    initializeValidation();
  }

  // Also try delayed initialization in case fields are loaded dynamically
  setTimeout(() => {
    console.log('[Form Validation] Delayed initialization attempt...');
    initializeValidation();
  }, 1000);

})();