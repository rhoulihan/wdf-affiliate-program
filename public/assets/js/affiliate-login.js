// Affiliate Login JavaScript
console.log('🚀 Affiliate login script loaded!');

(function() {
    'use strict';

    console.log('🚀 Affiliate login script starting...');
    
    // Configuration for embedded environment
    const baseUrl = window.location.protocol + '//' + window.location.host;
    const isEmbedded = true;
    
    // Helper function to get csrfFetch
    function getCsrfFetch() {
        return window.CsrfUtils && window.CsrfUtils.csrfFetch ? window.CsrfUtils.csrfFetch : fetch;
    }
    
    console.log('🔧 Affiliate Login Configuration:', {
        baseUrl: baseUrl,
        isEmbedded: isEmbedded,
        hasCsrfUtils: !!window.CsrfUtils
    });

    // PostMessage communication with parent window
    function sendMessageToParent(type, data) {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: type,
                source: 'wavemax-embed',
                data: data
            }, '*');
        }
    }

    // Navigate parent frame
    function navigateParent(page) {
        console.log('navigateParent called with:', page);
        
        // Convert page names to routes
        const routeMap = {
            'forgot-password': '/forgot-password',
            'affiliate-register': '/affiliate-register',
            'affiliate-dashboard': '/affiliate-dashboard'
        };
        
        const route = routeMap[page] || '/' + page;
        console.log('Mapped route:', route);
        
        // Check if navigateTo function exists (from embed-app-v2.js)
        if (window.navigateTo && typeof window.navigateTo === 'function') {
            console.log('Using navigateTo directly:', route);
            window.navigateTo(route);
        } else if (window.parent && window.parent !== window) {
            // We're in an iframe, send message to parent
            console.log('Sending navigation message to parent:', {
                type: 'navigate',
                route: route
            });
            window.parent.postMessage({
                type: 'navigate',
                route: route
            }, '*');
        } else {
            console.log('Cannot navigate - no navigateTo function and not in iframe');
        }
    }

    // Form submission handler
    function handleFormSubmit(e) {
        e.preventDefault();

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        // Send login status to parent
        sendMessageToParent('form-submit', { form: 'affiliate-login' });

        // API call with full URL
        const csrfFetch = getCsrfFetch();
        csrfFetch(`${baseUrl}/api/v1/auth/affiliate/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Login failed');
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                // Store token
                localStorage.setItem('affiliateToken', data.token);
                localStorage.setItem('currentAffiliate', JSON.stringify(data.affiliate));

                // Notify parent of successful login
                sendMessageToParent('login-success', {
                    userType: 'affiliate',
                    affiliateId: data.affiliate.affiliateId
                });

                // Navigate to dashboard
                navigateParent('affiliate-dashboard');
            } else {
                sendMessageToParent('login-error', {
                    message: data.message || 'Login failed'
                });
                window.modalAlert(data.message || (window.i18n ? window.i18n.t('common.messages.loginFailed') : 'Login failed. Please check your credentials and try again.'), window.i18n ? window.i18n.t('common.messages.loginFailed') : 'Login Failed');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            sendMessageToParent('login-error', {
                message: 'Login failed. Please check your credentials and try again.'
            });
            window.modalAlert(window.i18n ? window.i18n.t('common.messages.loginFailed') : 'Login failed. Please check your credentials and try again.', window.i18n ? window.i18n.t('common.messages.error') : 'Login Error');
        });
    }

    // Initialize function
    async function initialize() {
        console.log('🔧 Initializing affiliate login...');
        // Initialize CSRF token
        if (window.CsrfUtils && window.CsrfUtils.fetchCsrfToken) {
            try {
                await window.CsrfUtils.fetchCsrfToken();
                console.log('CSRF token initialized');
            } catch (error) {
                console.error('Failed to initialize CSRF token:', error);
            }
        }
        
        // Initialize i18n
        await window.i18n.init({ debugMode: false });
        window.LanguageSwitcher.createSwitcher('language-switcher-container', {
            style: 'dropdown',
            showLabel: false
        });

        // Form submission
        const loginForm = document.getElementById('affiliateLoginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', handleFormSubmit);
        }

        // Navigation link handlers
        console.log('Setting up navigation link handlers...');
        const forgotPasswordLink = document.getElementById('forgotPasswordLink');
        console.log('Forgot password link found:', !!forgotPasswordLink);
        if (forgotPasswordLink) {
            forgotPasswordLink.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Forgot password clicked!');
                navigateParent('forgot-password');
            });
        }

        // The affiliate program is INVITE-ONLY, so this link must NOT go to the
        // invite-gated /affiliate-register SPA route -- someone without an invite
        // dead-ends there. It goes to the public interest form instead.
        // The destination is config-driven (server/config/links.js, published as
        // a meta tag) because the interest form MOVES to the content app in
        // Plan 3; a hardcoded same-origin path would silently 404 at cutover.
        const registerLink = document.getElementById('registerLink');
        if (registerLink) {
            registerLink.addEventListener('click', function(e) {
                e.preventDefault();
                const meta = document.querySelector('meta[name="interest-form-url"]');
                const url = (meta && meta.getAttribute('content') || '').trim() || '/affiliate';
                // Full navigation, not an SPA route change: the interest form is a
                // standalone page. Break out of the iframe when embedded so the
                // form does not render inside the portal shell.
                try {
                    if (window.top && window.top !== window) { window.top.location.href = url; return; }
                } catch (_e) { /* cross-origin parent: fall through to self-navigation */ }
                window.location.href = url;
            });
        }
    }
    
    // Check if DOM is already loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        // DOM is already loaded, initialize immediately
        initialize();
    }

    // Notify parent that iframe is loaded
    window.addEventListener('load', function() {
        sendMessageToParent('iframe-loaded', { page: 'affiliate-login' });
    });

    // Export functions to global scope if needed
    window.navigateParent = navigateParent;
})();