// Forgot Password Page Initialization
(function() {
    'use strict';

    console.log('[ForgotPassword] Initializing forgot password page');

    // Configuration
    const baseUrl = window.EMBED_CONFIG?.baseUrl || window.location.origin;
    const isEmbedded = window.EMBED_CONFIG?.isEmbedded || false;

    // CSRF-aware fetch
    const csrfFetch = window.CsrfUtils && window.CsrfUtils.csrfFetch ? window.CsrfUtils.csrfFetch : fetch;

    // Initialize page when DOM is ready
    function initializeForgotPassword() {
        console.log('[ForgotPassword] DOM ready, initializing components');

        // Get form elements
        const form = document.getElementById('forgotPasswordForm');
        const userTypeSelect = document.getElementById('userType');
        const emailInput = document.getElementById('email');
        const submitButton = document.getElementById('submitButton');
        const alertContainer = document.getElementById('alertContainer');
        const backToLoginLink = document.getElementById('backToLoginLink');
        const backToLoginButton = document.getElementById('backToLoginButton');
        const formContainer = form.closest('.bg-white');
        const successMessage = document.getElementById('successMessage');

        // Validation functions — delegates to the shared helper in
        // form-validation.js so the regex lives in exactly one place.
        // Fall back if that helper is ever absent (a load failure, or a page
        // that forgets to include it) instead of rejecting every address: the
        // server validates with validator.isEmail and is the authority, and
        // failing closed here locks every user out of password reset with a
        // message that blames their perfectly valid email. The fallback is the
        // same shape the server enforces in middleware/sanitization.js.
        function validateEmail(email) {
            if (window.FormValidation && window.FormValidation.isValidEmail) {
                return window.FormValidation.isValidEmail(email);
            }
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
        }

        function showFieldError(field, show = true) {
            const feedbackElement = field.parentElement.querySelector('.invalid-feedback');
            if (show) {
                field.classList.add('is-invalid');
                if (feedbackElement) {
                    feedbackElement.classList.remove('hidden');
                }
            } else {
                field.classList.remove('is-invalid');
                if (feedbackElement) {
                    feedbackElement.classList.add('hidden');
                }
            }
        }

        function showAlert(message, type = 'error') {
            const alertClass = type === 'success' ? 'alert-success' : 
                             type === 'info' ? 'alert-info' : 'alert-error';
            
            const alertHtml = `
                <div class="alert ${alertClass} fade-in">
                    ${message}
                </div>
            `;
            
            alertContainer.innerHTML = alertHtml;
            
            // Auto-hide success messages after 5 seconds
            if (type === 'success') {
                setTimeout(() => {
                    alertContainer.innerHTML = '';
                }, 5000);
            }
        }

        function clearAlert() {
            alertContainer.innerHTML = '';
        }

        // Real-time validation
        userTypeSelect.addEventListener('change', function() {
            if (this.value) {
                showFieldError(this, false);
            }
        });

        emailInput.addEventListener('blur', function() {
            if (this.value && !validateEmail(this.value)) {
                showFieldError(this, true);
            } else if (this.value) {
                showFieldError(this, false);
            }
        });

        emailInput.addEventListener('input', function() {
            if (this.classList.contains('is-invalid') && validateEmail(this.value)) {
                showFieldError(this, false);
            }
        });

        // Form submission
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            console.log('[ForgotPassword] Form submitted');
            clearAlert();

            // Validate form
            let isValid = true;

            // Validate user type
            if (!userTypeSelect.value) {
                showFieldError(userTypeSelect, true);
                isValid = false;
            } else {
                showFieldError(userTypeSelect, false);
            }

            // Validate email
            const email = emailInput.value.trim();
            if (!email) {
                showFieldError(emailInput, true);
                emailInput.parentElement.querySelector('.invalid-feedback').textContent = 
                    window.i18n?.t('validation.emailRequired') || 'Email is required';
                isValid = false;
            } else if (!validateEmail(email)) {
                showFieldError(emailInput, true);
                isValid = false;
            } else {
                showFieldError(emailInput, false);
            }

            if (!isValid) {
                // Shake the form
                formContainer.classList.add('shake');
                setTimeout(() => formContainer.classList.remove('shake'), 600);
                return;
            }

            // Show loading state
            submitButton.disabled = true;
            submitButton.classList.add('loading-button');

            // Show spinner
            const spinner = window.SwirlSpinner ? 
                new window.SwirlSpinner({
                    container: formContainer,
                    size: 'medium',
                    overlay: true,
                    message: window.i18n?.t('forgotPassword.sendingEmail') || 'Sending email...'
                }).show() : null;

            try {
                // Send request
                const response = await csrfFetch(`${baseUrl}/api/v1/auth/forgot-password`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        email: email,
                        userType: userTypeSelect.value
                    })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    console.log('[ForgotPassword] Email sent successfully');
                    
                    // Hide form and show success message
                    formContainer.classList.add('hidden');
                    successMessage.classList.remove('hidden');
                    successMessage.classList.add('fade-in');
                    
                    // Update success message with email
                    const emailSentText = successMessage.querySelector('[data-i18n="forgotPassword.emailSent"]');
                    if (emailSentText) {
                        emailSentText.innerHTML = (window.i18n?.t('forgotPassword.emailSentTo') || 
                            `We've sent password reset instructions to <strong>${email}</strong>.`).replace('${email}', `<strong>${email}</strong>`);
                    }
                } else {
                    // Show error message
                    const errorMessage = data.message || 'An error occurred. Please try again.';
                    showAlert(errorMessage, 'error');
                    
                    // Focus on first error field
                    if (data.message?.toLowerCase().includes('email')) {
                        emailInput.focus();
                    }
                }
            } catch (error) {
                console.error('[ForgotPassword] Error:', error);
                showAlert(
                    window.i18n?.t('errors.network') || 
                    'Unable to connect to the server. Please check your connection and try again.',
                    'error'
                );
            } finally {
                // Hide spinner
                if (spinner) spinner.hide();
                
                // Reset button state
                submitButton.disabled = false;
                submitButton.classList.remove('loading-button');
            }
        });

        // Navigation functions
        function navigateToLogin() {
            const userType = userTypeSelect.value || 'affiliate';
            
            if (isEmbedded || window.parent !== window) {
                // In iframe - use parent navigation
                if (window.parent.navigateTo && typeof window.parent.navigateTo === 'function') {
                    window.parent.navigateTo(`/${userType}-login`);
                } else {
                    // Fallback for embed-app-v2.html
                    window.location.href = `/embed-app-v2.html?route=/${userType}-login`;
                }
            } else {
                // Direct navigation
                window.location.href = `/${userType}-login-embed.html`;
            }
        }

        // Back to login handlers
        backToLoginLink.addEventListener('click', function(e) {
            e.preventDefault();
            navigateToLogin();
        });

        backToLoginButton.addEventListener('click', function(e) {
            e.preventDefault();
            navigateToLogin();
        });

        // Handle URL parameters (e.g., pre-filled email)
        const urlParams = new URLSearchParams(window.location.search);
        const prefilledEmail = urlParams.get('email');
        const prefilledUserType = urlParams.get('type');

        if (prefilledEmail) {
            emailInput.value = prefilledEmail;
        }

        if (prefilledUserType && ['affiliate', 'customer', 'administrator', 'operator'].includes(prefilledUserType)) {
            userTypeSelect.value = prefilledUserType;
        }

        // Focus on first empty field
        if (!userTypeSelect.value) {
            userTypeSelect.focus();
        } else if (!emailInput.value) {
            emailInput.focus();
        }

        // Listen for escape key to go back
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && !formContainer.classList.contains('hidden')) {
                navigateToLogin();
            }
        });

        // Handle window resize for responsive design
        if (isEmbedded) {
            function notifyParentOfHeight() {
                const height = document.documentElement.scrollHeight;
                window.parent.postMessage({
                    type: 'resize-frame',
                    height: height
                }, '*');
            }

            // Notify on load and resize
            notifyParentOfHeight();
            window.addEventListener('resize', notifyParentOfHeight);
            
            // Use ResizeObserver for content changes
            if (window.ResizeObserver) {
                const resizeObserver = new ResizeObserver(() => {
                    notifyParentOfHeight();
                });
                resizeObserver.observe(document.body);
            }
        }

        console.log('[ForgotPassword] Initialization complete');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeForgotPassword);
    } else {
        initializeForgotPassword();
    }
})();