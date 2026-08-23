/**
 * Laundromat Password Validator Component
 * A reusable username/password component with validation and strength indicator
 * Based on the affiliate registration form implementation
 */

(function(window) {
  'use strict';

  // Password validation logic
  function validatePasswordStrength(password, username = '', email = '') {
    const requirements = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /\d/.test(password),
      special: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)
    };

    // Check against common patterns and user data
    const hasSequential = /123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz/i.test(password);
    const hasUsername = username && password.toLowerCase().includes(username.toLowerCase());
    const hasEmail = email && password.toLowerCase().includes(email.split('@')[0].toLowerCase());
    const hasRepeated = /(.)\1{2,}/.test(password);

    requirements.noSequential = !hasSequential;
    requirements.noUsername = !hasUsername;
    requirements.noEmail = !hasEmail;
    requirements.noRepeated = !hasRepeated;

    const score = Object.values(requirements).filter(Boolean).length;
    return {
      requirements,
      score,
      isValid: score >= 5 && requirements.length && requirements.uppercase && requirements.lowercase && requirements.number && requirements.special
    };
  }

  // Component class
  class PasswordValidatorComponent {
    constructor(containerId, options = {}) {
      this.container = document.getElementById(containerId);
      if (!this.container) {
        throw new Error(`Container with id "${containerId}" not found`);
      }

      // Add debounce timer
      this.updateTimer = null;

      // Default options
      this.options = {
        showUsername: true,
        showConfirmPassword: true,
        showStrengthIndicator: true,
        showRequirements: true,
        usernameRequired: false,
        passwordRequired: true,
        // Use generic translation keys that can be reused
        translationKeys: {
          username: 'common.username',
          usernameDesc: 'common.usernameDesc',
          usernamePlaceholder: 'common.usernamePlaceholder',
          password: 'common.password',
          passwordPlaceholder: 'common.passwordPlaceholder',
          confirmPassword: 'common.confirmPassword',
          confirmPasswordPlaceholder: 'common.confirmPasswordPlaceholder',
          passwordRequirements: 'common.passwordRequirements',
          passwordLength: 'common.passwordLength',
          passwordUppercase: 'common.passwordUppercase',
          passwordLowercase: 'common.passwordLowercase',
          passwordNumber: 'common.passwordNumber',
          passwordSpecial: 'common.passwordSpecial',
          passwordsMatch: 'common.passwordsMatch',
          strongPassword: 'common.strongPassword',
          missingPrefix: 'common.passwordMissingPrefix'
        },
        ...options
      };

      // Override translation keys if provided
      if (options.translationKeys) {
        this.options.translationKeys = { ...this.options.translationKeys, ...options.translationKeys };
      }

      this.state = {
        username: '',
        password: '',
        confirmPassword: '',
        email: options.email || ''
      };

      this.render();
      this.attachEventListeners();
    }

    render() {
      // Get translation function
      const t = window.i18n && window.i18n.t ? window.i18n.t.bind(window.i18n) : (key) => key;
      const tk = this.options.translationKeys;

      let html = '<div class="password-validator-component">';

      // Two column layout on desktop, single column on mobile
      html += '<div class="grid md:grid-cols-2 gap-6">';

      // Left column: Input fields
      html += '<div class="space-y-4">';

      // Username field (optional)
      if (this.options.showUsername) {
        html += `
          <div>
            <label for="pvc-username" class="block text-gray-700 mb-2">
              <span data-i18n="${tk.username}">${t(tk.username)}${this.options.usernameRequired ? ' *' : ''}</span>
              ${this.options.showUsername ? `<span class="text-xs text-gray-500 font-normal">(<span data-i18n="${tk.usernameDesc}">${t(tk.usernameDesc)}</span>)</span>` : ''}
            </label>
            <input type="text" 
              id="pvc-username" 
              name="username" 
              ${this.options.usernameRequired ? 'required' : ''} 
              class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
              placeholder="${t(tk.usernamePlaceholder)}"
              data-i18n-placeholder="${tk.usernamePlaceholder}">
          </div>
        `;
      }

      // Password field
      html += `
        <div>
          <label for="pvc-password" class="block text-gray-700 mb-2" data-i18n="${tk.password}">${t(tk.password)}${this.options.passwordRequired ? ' *' : ''}</label>
          <input type="password" 
            id="pvc-password" 
            name="password" 
            ${this.options.passwordRequired ? 'required' : ''} 
            class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
            placeholder="${t(tk.passwordPlaceholder)}"
            data-i18n-placeholder="${tk.passwordPlaceholder}">
          ${this.options.showStrengthIndicator ? '<div id="pvc-passwordStrength" class="mt-2 text-sm"></div>' : ''}
        </div>
      `;

      // Confirm password field (optional)
      if (this.options.showConfirmPassword) {
        html += `
          <div>
            <label for="pvc-confirmPassword" class="block text-gray-700 mb-2" data-i18n="${tk.confirmPassword}">${t(tk.confirmPassword)}</label>
            <input type="password" 
              id="pvc-confirmPassword" 
              name="confirmPassword" 
              ${this.options.passwordRequired ? 'required' : ''} 
              class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
              placeholder="${t(tk.confirmPasswordPlaceholder)}"
              data-i18n-placeholder="${tk.confirmPasswordPlaceholder}">
          </div>
        `;
      }

      html += '</div>'; // End left column

      // Right column: Password requirements (optional)
      if (this.options.showRequirements) {
        html += `
          <div class="flex flex-col justify-end h-full">
            <div id="pvc-passwordRequirements" class="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg">
              <div class="mb-1 font-semibold" data-i18n="${tk.passwordRequirements}">${t(tk.passwordRequirements)}</div>
              <ul class="space-y-1">
                <li id="pvc-req-length" class="flex items-center">
                  <span class="w-4 h-4 mr-2">⚪</span>
                  <span data-i18n="${tk.passwordLength}">${t(tk.passwordLength)}</span>
                </li>
                <li id="pvc-req-uppercase" class="flex items-center">
                  <span class="w-4 h-4 mr-2">⚪</span>
                  <span data-i18n="${tk.passwordUppercase}">${t(tk.passwordUppercase)}</span>
                </li>
                <li id="pvc-req-lowercase" class="flex items-center">
                  <span class="w-4 h-4 mr-2">⚪</span>
                  <span data-i18n="${tk.passwordLowercase}">${t(tk.passwordLowercase)}</span>
                </li>
                <li id="pvc-req-number" class="flex items-center">
                  <span class="w-4 h-4 mr-2">⚪</span>
                  <span data-i18n="${tk.passwordNumber}">${t(tk.passwordNumber)}</span>
                </li>
                <li id="pvc-req-special" class="flex items-center">
                  <span class="w-4 h-4 mr-2">⚪</span>
                  <span data-i18n="${tk.passwordSpecial}">${t(tk.passwordSpecial)}</span>
                </li>
                ${this.options.showConfirmPassword ? `
                  <li id="pvc-req-match" class="flex items-center">
                    <span class="w-4 h-4 mr-2">⚪</span>
                    <span data-i18n="${tk.passwordsMatch}">${t(tk.passwordsMatch)}</span>
                  </li>
                ` : ''}
              </ul>
            </div>
          </div>
        `;
      }

      html += '</div>'; // End grid
      html += '</div>'; // End component wrapper

      this.container.innerHTML = html;
    }

    attachEventListeners() {
      // Username field
      if (this.options.showUsername) {
        const usernameField = document.getElementById('pvc-username');
        if (usernameField) {
          usernameField.addEventListener('input', (e) => {
            this.state.username = e.target.value;
            this.updatePasswordRequirements();
          });
        }
      }

      // Password field
      const passwordField = document.getElementById('pvc-password');
      if (passwordField) {
        passwordField.addEventListener('input', (e) => {
          this.state.password = e.target.value;
          this.updatePasswordRequirements();
        });
      }

      // Confirm password field
      if (this.options.showConfirmPassword) {
        const confirmPasswordField = document.getElementById('pvc-confirmPassword');
        if (confirmPasswordField) {
          confirmPasswordField.addEventListener('input', (e) => {
            this.state.confirmPassword = e.target.value;
            this.updatePasswordRequirements();
          });
        }
      }
    }

    updatePasswordRequirements() {
      // Clear existing timer
      if (this.updateTimer) {
        clearTimeout(this.updateTimer);
      }

      // Debounce updates by 150ms to reduce DOM thrashing
      this.updateTimer = setTimeout(() => {
        this.performPasswordRequirementsUpdate();
      }, 150);
    }

    performPasswordRequirementsUpdate() {
      const validation = validatePasswordStrength(this.state.password, this.state.username, this.state.email);
      const requirements = validation.requirements;

      // Add password match requirement if showing confirm password
      if (this.options.showConfirmPassword) {
        requirements.match = this.state.password !== '' && this.state.password === this.state.confirmPassword;
      }

      // Update requirement indicators
      const updateReq = (id, met) => {
        const element = document.getElementById(id);
        if (element) {
          const indicator = element.querySelector('span');
          indicator.textContent = met ? '✅' : '⚪';
          element.className = met ? 'flex items-center text-green-600' : 'flex items-center text-gray-600';
        }
      };

      if (this.options.showRequirements) {
        updateReq('pvc-req-length', requirements.length);
        updateReq('pvc-req-uppercase', requirements.uppercase);
        updateReq('pvc-req-lowercase', requirements.lowercase);
        updateReq('pvc-req-number', requirements.number);
        updateReq('pvc-req-special', requirements.special);
        if (this.options.showConfirmPassword) {
          updateReq('pvc-req-match', requirements.match);
        }
      }

      // Update strength indicator
      if (this.options.showStrengthIndicator) {
        const t = window.i18n && window.i18n.t ? window.i18n.t.bind(window.i18n) : (key) => key;
        const tk = this.options.translationKeys;

        const strengthElement = document.getElementById('pvc-passwordStrength');
        if (strengthElement) {
          if (this.state.password.length === 0) {
            strengthElement.innerHTML = '';
          } else if (validation.isValid && (!this.options.showConfirmPassword || requirements.match)) {
            strengthElement.innerHTML = `<span class="text-green-600 font-medium">${t(tk.strongPassword)}</span>`;
          } else {
            const missing = [];
            if (!requirements.length) missing.push('8+ characters');
            if (!requirements.uppercase) missing.push('uppercase letter');
            if (!requirements.lowercase) missing.push('lowercase letter');
            if (!requirements.number) missing.push('number');
            if (!requirements.special) missing.push('special character');
            if (this.options.showConfirmPassword && !requirements.match) missing.push('matching passwords');

            strengthElement.innerHTML = `<span class="text-red-600">${t(tk.missingPrefix)}${missing.join(', ')}</span>`;
          }
        }
      }

      // Dispatch custom event with validation state
      this.container.dispatchEvent(new CustomEvent('passwordValidationUpdate', {
        detail: {
          isValid: validation.isValid && (!this.options.showConfirmPassword || requirements.match),
          requirements: requirements,
          score: validation.score,
          username: this.state.username,
          password: this.state.password
        }
      }));
    }

    // Public methods
    getValues() {
      return {
        username: this.state.username,
        password: this.state.password,
        confirmPassword: this.state.confirmPassword
      };
    }

    setValues(values) {
      if (values.username !== undefined && this.options.showUsername) {
        this.state.username = values.username;
        const usernameField = document.getElementById('pvc-username');
        if (usernameField) usernameField.value = values.username;
      }

      if (values.password !== undefined) {
        this.state.password = values.password;
        const passwordField = document.getElementById('pvc-password');
        if (passwordField) passwordField.value = values.password;
      }

      if (values.confirmPassword !== undefined && this.options.showConfirmPassword) {
        this.state.confirmPassword = values.confirmPassword;
        const confirmPasswordField = document.getElementById('pvc-confirmPassword');
        if (confirmPasswordField) confirmPasswordField.value = values.confirmPassword;
      }

      this.updatePasswordRequirements();
    }

    isValid() {
      const validation = validatePasswordStrength(this.state.password, this.state.username, this.state.email);
      const passwordsMatch = !this.options.showConfirmPassword ||
                           (this.state.password === this.state.confirmPassword);

      return validation.isValid && passwordsMatch;
    }

    reset() {
      this.state = {
        username: '',
        password: '',
        confirmPassword: '',
        email: this.options.email || ''
      };

      // Clear input fields
      const fields = ['pvc-username', 'pvc-password', 'pvc-confirmPassword'];
      fields.forEach(id => {
        const field = document.getElementById(id);
        if (field) field.value = '';
      });

      // Perform immediate update without debouncing
      this.performPasswordRequirementsUpdate();
    }

    // Refresh translations when language changes
    refreshTranslations() {
      // Store current values
      const currentValues = this.getValues();

      // Re-render with new translations
      this.render();
      this.attachEventListeners();

      // Restore values
      this.setValues(currentValues);

      // Update requirements display - perform immediate update
      this.performPasswordRequirementsUpdate();
    }
  }

  // Export to window
  window.PasswordValidatorComponent = PasswordValidatorComponent;

})(window);