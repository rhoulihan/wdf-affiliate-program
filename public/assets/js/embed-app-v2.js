// Embed App V2 - CSP Compliant Version
// Single page embedded application
const BASE_URL = window.location.protocol + '//' + window.location.host;

// Mobile and parent communication state
let viewportInfo = null;
let chromeHidden = false;

// Helper function to check if any user is authenticated
function isAnyUserAuthenticated() {
    // First check if SessionManager exists and has the method we need
    if (!window.SessionManager || typeof window.SessionManager.isAuthenticated !== 'function') {
        return false;
    }
    
    // Check all possible user types
    const userTypes = ['administrator', 'affiliate', 'operator'];
    return userTypes.some(type => window.SessionManager.isAuthenticated(type));
}

// Helper function to check if a specific user type is authenticated
function isUserAuthenticated(userType) {
    if (!window.SessionManager || typeof window.SessionManager.isAuthenticated !== 'function') {
        return false;
    }
    return window.SessionManager.isAuthenticated(userType);
}

// Helper function to get the currently authenticated user type
function getAuthenticatedUserType() {
    if (!window.SessionManager || typeof window.SessionManager.isAuthenticated !== 'function') {
        return null;
    }
    
    const userTypes = ['administrator', 'affiliate', 'operator'];
    return userTypes.find(type => window.SessionManager.isAuthenticated(type)) || null;
}

// Define pages that have been migrated to CSP-compliant version
const EMBED_PAGES = {
    '/': '/embed-landing.html',
    '/landing': '/embed-landing.html',
    '/terms-of-service': '/terms-and-conditions-embed.html',
    '/terms-and-conditions': '/terms-and-conditions-embed.html',
    '/privacy-policy': '/privacy-policy.html',
    '/refund-policy': '/refund-policy.html',
    '/operator-scan': '/operator-scan-embed.html',
    '/order-expediter': '/order-expediter-embed.html',
    '/operator-login': '/operator-login-embed.html',
    '/affiliate-login': '/affiliate-login-embed.html',
    '/affiliate-register': '/affiliate-register-embed.html',
    '/affiliate-dashboard': '/affiliate-dashboard-embed.html',
    '/claim': '/claim-embed.html',
    '/forgot-password': '/forgot-password-embed.html',
    '/reset-password': '/reset-password-embed.html',
    '/administrator-login': '/administrator-login-embed.html',
    '/administrator-dashboard': '/administrator-dashboard-embed.html',
    '/affiliate-success': '/affiliate-success-embed.html',
    '/affiliate-landing': '/affiliate-landing-embed.html',
    '/affiliate-program': '/affiliate-landing-embed.html'
    // Add more pages here as they are migrated to CSP compliance
};

let currentRoute = '/';

// Get route from URL parameter
function getRouteFromUrl() {
    const params = new URLSearchParams(window.location.search);

    // window.__DEFAULT_ROUTE is set by a server-injected inline script on clean
    // URLs (e.g. GET /admin) so the SPA loads the right page without a visible
    // ?route= in the address bar. An explicit ?route= still wins.
    let route = params.get('route') || (typeof window !== 'undefined' ? window.__DEFAULT_ROUTE : null) || null;

    // Handle legacy login parameter for backward compatibility with emails
    if (!route && params.get('login')) {
        const loginType = params.get('login');
        // Customer login removed (Phase 1: registration-only customer surface).
        if (loginType === 'affiliate') {
            route = '/affiliate-login';
        } else if (loginType === 'administrator') {
            route = '/administrator-login';
        }
        console.log('Mapped login parameter to route:', loginType, '->', route);
    }
    
    // If no route in URL, check localStorage for saved route ONLY if authenticated
    if (!route) {
        // Check if user is authenticated before using saved route
        if (isAnyUserAuthenticated()) {
            route = localStorage.getItem('currentRoute') || '/';
            console.log('No route in URL, authenticated user, using saved route:', route);
        } else {
            // No auth, clear saved route and use default
            localStorage.removeItem('currentRoute');
            route = '/';
            console.log('No route in URL, no auth, using default route');
        }
    }

    // Ensure route starts with a leading slash
    if (route && !route.startsWith('/')) {
        route = '/' + route;
    }

    console.log('Final route:', route);
    return route;
}

// Clean up function to disconnect all observers
function cleanupCurrentPage() {
    // Dispatch a custom event to notify scripts to clean up
    window.dispatchEvent(new CustomEvent('page-cleanup'));
    
    // Disconnect observers to prevent memory leaks and conflicts
    if (window.currentResizeObserver) {
        window.currentResizeObserver.disconnect();
        window.currentResizeObserver = null;
    }
    
    if (window.currentMutationObserver) {
        window.currentMutationObserver.disconnect();
        window.currentMutationObserver = null;
    }
    
    // Remove all ResizeObservers by triggering cleanup in child scripts
    if (window.ResizeObserver) {
        // This will be caught by scripts that set up observers
        window.dispatchEvent(new CustomEvent('disconnect-observers'));
    }
    
    // Remove route-specific styles from previous page
    document.querySelectorAll('style[data-route]').forEach(style => {
        style.remove();
    });
    
    // Remove dynamically loaded scripts from previous page
    document.querySelectorAll('script[data-page-script]').forEach(script => {
        script.remove();
    });
    
    // Clear any intervals that might have been set by page scripts
    if (window.statsInterval) {
        clearInterval(window.statsInterval);
        window.statsInterval = null;
    }
    
    // Reset height tracking
    heightUpdateCount = 0;
    lastSentHeight = 0;
    isUpdatingHeight = false;
    clearTimeout(heightUpdateTimeout);
}

// Function to process HTML and remove inline styles for CSP compliance
function processHtmlForCSP(html) {
    // Extract inline styles and move them to a style element with nonce
    let processedHtml = html;
    const inlineStyles = [];
    let styleCounter = 0;
    
    // Match elements with style attributes
    processedHtml = processedHtml.replace(/style\s*=\s*["']([^"']+)["']/gi, (match, styles) => {
        const className = `csp-style-${Date.now()}-${styleCounter++}`;
        inlineStyles.push(`.${className} { ${styles} }`);
        return `class="${className}"`;
    });
    
    // If we found inline styles, create a style element for them
    if (inlineStyles.length > 0) {
        // Get nonce from current document
        let nonce = null;
        
        // Try from window.CSP_NONCE first
        if (window.CSP_NONCE && window.CSP_NONCE.trim()) {
            nonce = window.CSP_NONCE;
        }
        
        // Try from any existing element with nonce
        if (!nonce) {
            const elementsWithNonce = document.querySelectorAll('[nonce]');
            for (const element of elementsWithNonce) {
                const elementNonce = element.getAttribute('nonce');
                if (elementNonce) {
                    nonce = elementNonce;
                    break;
                }
            }
        }
        
        // Try from meta tag
        if (!nonce) {
            const nonceMeta = document.querySelector('meta[name="csp-nonce"]');
            if (nonceMeta) {
                nonce = nonceMeta.getAttribute('content');
            }
        }
        
        // Create and append style element
        const styleElement = document.createElement('style');
        styleElement.setAttribute('data-csp-extracted', 'true');
        if (nonce) {
            styleElement.setAttribute('nonce', nonce);
        }
        styleElement.textContent = inlineStyles.join('\n');
        document.head.appendChild(styleElement);
    }
    
    return processedHtml;
}

// Height tracking variables
let lastSentHeight = 0;
let heightUpdateTimeout = null;
let isUpdatingHeight = false;
let heightUpdateCount = 0;
let heightUpdateResetTimeout = null;
const MAX_HEIGHT_UPDATES = 10; // Increased limit
const HEIGHT_UPDATE_RESET_DELAY = 5000; // Reset counter after 5 seconds of stability

// Update iframe height
function updateHeight() {
    if (isUpdatingHeight) return;
    
    // Check if there are active animations (spinners, etc)
    const hasActiveSpinner = document.querySelector('.swirl-spinner-overlay:not(.hidden)');
    if (hasActiveSpinner) {
        // Skip height updates while spinner is active to prevent flickering
        return;
    }
    
    // Prevent infinite loops
    heightUpdateCount++;
    if (heightUpdateCount > MAX_HEIGHT_UPDATES) {
        console.warn('Height update limit reached, preventing infinite loop');
        // Schedule a reset of the counter after some time
        if (!heightUpdateResetTimeout) {
            heightUpdateResetTimeout = setTimeout(() => {
                heightUpdateCount = 0;
                heightUpdateResetTimeout = null;
                console.log('Height update counter reset');
            }, HEIGHT_UPDATE_RESET_DELAY);
        }
        return;
    }
    
    clearTimeout(heightUpdateTimeout);
    heightUpdateTimeout = setTimeout(() => {
        const body = document.body;
        const html = document.documentElement;
        
        const height = Math.max(
            body.scrollHeight,
            body.offsetHeight,
            html.clientHeight,
            html.scrollHeight,
            html.offsetHeight
        );
        
        // Only send if height changed significantly (more than 30px) to prevent minor fluctuations
        if (Math.abs(height - lastSentHeight) > 30) {
            lastSentHeight = height;
            isUpdatingHeight = true;
            
            if (window.parent !== window) {
                window.parent.postMessage({
                    type: 'resize',
                    data: { height: height + 20 } // Minimal padding to prevent cutoff
                }, '*');
            }
            
            // Reset flag after a delay
            setTimeout(() => {
                isUpdatingHeight = false;
                // Reset counter after successful update
                if (heightUpdateCount > 5) {
                    setTimeout(() => {
                        heightUpdateCount = 0;
                        console.log('Height update counter reset after successful update');
                    }, 2000);
                }
                // Reset counter after successful update
                heightUpdateCount = 0;
            }, 200);
        } else {
            // Reset counter for unchanged heights
            heightUpdateCount = Math.max(0, heightUpdateCount - 1);
        }
    }, 150);
}

// Load page content - CSP compliant version
async function loadPage(route) {
    console.log('Loading page for route:', route);
    console.log('Current window.location.search:', window.location.search);
    
    // Check if route needs authentication adjustment. (An earlier typo called a
    // non-existent SessionManager method here, leaving this swap dead; using the
    // real getAuthenticatedRoute now sends an authenticated admin hitting
    // /administrator-login to the dashboard, and an unauthenticated user hitting a
    // protected route to login.)
    if (window.SessionManager && window.SessionManager.getAuthenticatedRoute) {
        const adjustedRoute = window.SessionManager.getAuthenticatedRoute(route);
        if (adjustedRoute !== route) {
            console.log(`SessionManager adjusted route from ${route} to: ${adjustedRoute}`);
            route = adjustedRoute;
            console.log('Final route:', route);
        }
    }
    
    // Clean up current page before loading new one
    cleanupCurrentPage();
    
    // Reset height tracking for new page
    lastSentHeight = 0;
    isUpdatingHeight = false;
    
    // Send a smaller height to trigger resize on new page
    if (window.parent !== window) {
        window.parent.postMessage({
            type: 'resize',
            data: { height: 600 } // Reset to minimum height
        }, '*');
    }
    
    const container = document.getElementById('app-container');
    
    // Extract base route without query parameters for page mapping
    const baseRoute = route.split('?')[0];
    const pagePath = EMBED_PAGES[baseRoute] || EMBED_PAGES['/'];

    console.log('Base route:', baseRoute, 'Page path:', pagePath);
    
    try {
        container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin me-2"></i>Loading...</div>';
        
        // Build URL with current query parameters
        const currentParams = new URLSearchParams(window.location.search);
        console.log('Current params for fetch:', Array.from(currentParams.entries()));
        const fetchUrl = BASE_URL + pagePath + (currentParams.toString() ? '?' + currentParams.toString() : '');
        console.log('Fetching URL:', fetchUrl);
        
        // Add credentials to ensure we get the server-processed version with nonces
        const response = await fetch(fetchUrl, {
            credentials: 'include',
            headers: {
                'Accept': 'text/html'
            }
        });
        if (!response.ok) throw new Error('Failed to load page');
        
        let html = await response.text();
        
        // Extract head and body content
        const headMatch = html.match(/<head[^>]*>([\s\S]*)<\/head>/i);
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        
        if (headMatch && bodyMatch) {
            // Extract styles and links from head
            const headContent = headMatch[1];
            const styleRegex = /<style[^>]*>[\s\S]*?<\/style>/gi;
            const styles = headContent.match(styleRegex) || [];
            const linkRegex = /<link[^>]*rel=["']stylesheet["'][^>]*>/gi;
            const styleLinks = headContent.match(linkRegex) || [];
            
            // Get body content
            let bodyContent = bodyMatch[1];
            
            // Remove script tags to prevent duplicate execution
            const scriptRegex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
            bodyContent = bodyContent.replace(scriptRegex, '');
            
            // Update relative URLs to absolute
            bodyContent = bodyContent.replace(/src=["'](?!http|\/\/)([^"']+)["']/g, (match, path) => {
                return `src="${BASE_URL}${path.startsWith('/') ? '' : '/'}${path}"`;
            });
            bodyContent = bodyContent.replace(/href=["'](?!http|\/\/|#)([^"']+)["']/g, (match, path) => {
                return `href="${BASE_URL}${path.startsWith('/') ? '' : '/'}${path}"`;
            });
            
            // Add external stylesheets to head if not already present
            styleLinks.forEach(link => {
                // Update relative paths in link tags
                const updatedLink = link.replace(/href=["'](?!http|\/\/)([^"']+)["']/g, (match, path) => {
                    return `href="${BASE_URL}${path.startsWith('/') ? '' : '/'}${path}"`;
                });
                // Check if this stylesheet is already in the document
                const linkHref = updatedLink.match(/href=["']([^"']+)["']/);
                if (linkHref && !document.querySelector(`link[href="${linkHref[1]}"]`)) {
                    const linkElement = document.createElement('link');
                    linkElement.rel = 'stylesheet';
                    linkElement.href = linkHref[1];
                    
                    // Get nonce from existing script tag
                    const currentScript = document.querySelector('script[nonce]');
                    if (currentScript) {
                        const nonce = currentScript.getAttribute('nonce');
                        if (nonce) {
                            linkElement.setAttribute('nonce', nonce);
                        }
                    }
                    
                    document.head.appendChild(linkElement);
                }
            });
            
            // Add styles to document head
            styles.forEach(style => {
                // Skip empty styles
                const styleContent = style.replace(/<style[^>]*>/gi, '').replace(/<\/style>/gi, '').trim();
                if (!styleContent) return;
                
                // Check if this style already has a nonce attribute
                const existingNonceMatch = style.match(/nonce=["']([^"']+)["']/);
                if (existingNonceMatch) {
                    // Use the existing nonce from the fetched content
                    const existingNonce = existingNonceMatch[1];
                    const styleElement = document.createElement('style');
                    styleElement.setAttribute('data-route', route);
                    styleElement.setAttribute('nonce', existingNonce);
                    styleElement.textContent = styleContent;
                    document.head.appendChild(styleElement);
                    return;
                }
                
                // Skip adding style elements that would violate CSP
                // Instead, we'll handle styles differently for dynamic content
                console.log('[embed-app-v2] Skipping style element to avoid CSP violation');
                
                // Option 1: Try to get the actual nonce from the parent document
                let nonce = null;
                
                // The most reliable way - get nonce from existing scripts
                const scriptsWithNonce = document.querySelectorAll('script[nonce]');
                if (scriptsWithNonce.length > 0) {
                    nonce = scriptsWithNonce[0].nonce || scriptsWithNonce[0].getAttribute('nonce');
                }
                
                // Try from window.CSP_NONCE
                if (!nonce && window.CSP_NONCE) {
                    nonce = window.CSP_NONCE;
                }
                
                // Try from meta tag
                if (!nonce) {
                    const nonceMeta = document.querySelector('meta[name="csp-nonce"]');
                    if (nonceMeta) {
                        nonce = nonceMeta.getAttribute('content');
                    }
                }
                
                // If we have a valid nonce and style content, add it
                if (nonce && styleContent) {
                    const styleElement = document.createElement('style');
                    styleElement.setAttribute('data-route', route);
                    styleElement.nonce = nonce;  // Use property instead of setAttribute
                    styleElement.textContent = styleContent;
                    document.head.appendChild(styleElement);
                } else if (styleContent) {
                    // If no nonce available, skip adding styles to avoid CSP violation
                    console.warn('[embed-app-v2] Cannot add styles without nonce, skipping to avoid CSP violation');
                }
            });
            
            html = bodyContent;
        }
        
        // Process HTML to handle inline styles with CSP
        const processedHtml = processHtmlForCSP(html);
        container.innerHTML = processedHtml;
        currentRoute = route;
        
        // Only store the base route path without query parameters
        const baseRoute = route.split('?')[0];
        
        // Don't persist certain pages that require specific parameters or are entry points
        const excludedRoutes = [
            '/affiliate-landing',  // Requires specific affiliate code
            '/claim',              // Requires a ?bag= token parameter
            '/order-expediter',    // Requires a ?k= display token
            '/affiliate-login',    // Entry point
            '/affiliate-register', // Entry point
            '/administrator-login' // Entry point
        ];
        
        // Store the current route for persistence ONLY if authenticated AND not an excluded route
        if (isAnyUserAuthenticated() && !excludedRoutes.includes(baseRoute)) {
            localStorage.setItem('currentRoute', baseRoute);
        } else if (!isAnyUserAuthenticated()) {
            // Clear any saved route if not authenticated
            localStorage.removeItem('currentRoute');
        }
        
        // Set route data attribute on body
        document.body.setAttribute('data-route', route);
        
        // Initialize scripts for the loaded page
        initializePageScripts(route);
        
        // Update parent about page load and user type
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'page-loaded',
                data: { 
                    route: route,
                    userType: getAuthenticatedUserType()
                }
            }, '*');
            
            // Send current auth state
            window.parent.postMessage({
                type: 'auth-state',
                data: {
                    isAuthenticated: isAnyUserAuthenticated(),
                    userType: getAuthenticatedUserType()
                }
            }, '*');
        }
        
        // Update height after content loads
        setTimeout(updateHeight, 100);
        
        // Set up observer for dynamic content changes
        setupHeightObserver();
        
    } catch (error) {
        console.error('Error loading page:', error);
        container.innerHTML = `
            <div class="error">
                <h3>Failed to load page</h3>
                <p>${error.message}</p>
                <button class="btn btn-primary mt-3" onclick="location.reload()">Try Again</button>
            </div>
        `;
    }
}

// Initialize page-specific scripts
function initializePageScripts(route) {
    // Common initialization
    // Handle back button clicks
    const backButtons = document.querySelectorAll('[data-action="back"], [data-action="navigate-back"]');
    backButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            handleNavigation('back');
        });
    });
    
    // Handle navigation links
    const navLinks = document.querySelectorAll('[data-navigate]');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetRoute = link.getAttribute('data-navigate');
            navigateTo(targetRoute);
        });
    });
    
    // Re-initialize any forms
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        // Trigger form initialization event
        form.dispatchEvent(new Event('form-init'));
    });
    
    // Define page-specific scripts
    const pageScripts = {
        '/': ['/assets/js/i18n.js', '/assets/js/language-switcher.js', '/assets/js/embed-navigation.js', '/assets/js/revenue-calculator.js', '/assets/js/embed-landing-init.js'],
        '/landing': ['/assets/js/i18n.js', '/assets/js/language-switcher.js', '/assets/js/embed-navigation.js', '/assets/js/revenue-calculator.js', '/assets/js/embed-landing-init.js'],
        '/terms-of-service': ['/assets/js/terms-and-conditions.js'],
        '/terms-and-conditions': ['/assets/js/terms-and-conditions.js'],
        '/operator-login': ['/assets/js/embed-config.js', '/assets/js/i18n.js', '/assets/js/language-switcher.js', '/assets/js/csrf-utils.js', '/assets/js/api-client.js', '/assets/js/operator-login-init.js'],
        '/operator-scan': ['/assets/js/embed-config.js', '/assets/js/i18n.js', '/assets/js/language-switcher.js', '/assets/js/modal-utils.js', '/assets/js/errorHandler.js', '/assets/js/csrf-utils.js', '/assets/js/api-client.js', '/assets/js/bag-token-parser.js', '/assets/js/scan-session.js', '/assets/js/operator-scan-init.js'],
        '/order-expediter': ['/assets/js/i18n.js', '/assets/js/order-expediter-init.js'],
        '/affiliate-login': ['/assets/js/i18n.js', '/assets/js/language-switcher.js', '/assets/js/modal-utils.js', '/assets/js/csrf-utils.js', '/assets/js/swirl-spinner.js', '/assets/js/api-client.js', '/assets/js/affiliate-login.js'],
        '/affiliate-register': ['/assets/js/embed-config.js', '/assets/js/i18n.js', '/assets/js/language-switcher.js', '/assets/js/modal-utils.js', '/assets/js/errorHandler.js', '/assets/js/csrf-utils.js', '/assets/js/swirl-spinner.js', '/assets/js/api-client.js', '/assets/js/form-validation.js', '/assets/js/pricing-preview-component.js?v=20260623a', '/assets/js/affiliate-register-init.js?v=20260624a', '/assets/js/affiliate-register-page-init.js', '/assets/js/affiliate-register-invite.js'],
        '/affiliate-dashboard': ['/assets/js/i18n.js', '/assets/js/language-switcher.js', '/assets/js/pricing-preview-component.js?v=20260623a', '/assets/js/csrf-utils.js', '/assets/js/api-client.js', '/assets/js/affiliate-dashboard-init.js?v=20260623a', '/assets/js/affiliate-dashboard-embed.js', '/assets/js/affiliate-dashboard-i18n.js'],
        // Firebase compat SDK is lazy-loaded on demand by claim.js (only when phone
        // verification is enabled) so its ~170 KB stays off the form's render path.
        '/claim': ['/assets/js/i18n.js', '/assets/js/language-switcher.js', '/assets/js/modal-utils.js', '/assets/js/swirl-spinner.js', '/assets/js/scan-session.js', '/assets/js/claim.js?v=20260826a'],
        '/forgot-password': ['/assets/js/embed-config.js', '/assets/js/i18n.js', '/assets/js/language-switcher.js', '/assets/js/modal-utils.js', '/assets/js/csrf-utils.js', '/assets/js/swirl-spinner.js', '/assets/js/api-client.js', '/assets/js/forgot-password-init.js?v=20260613'],
        '/reset-password': ['/assets/js/embed-config.js', '/assets/js/i18n.js', '/assets/js/language-switcher.js', '/assets/js/modal-utils.js', '/assets/js/csrf-utils.js', '/assets/js/swirl-spinner.js', '/assets/js/api-client.js', '/assets/js/reset-password-init.js?v=20260613'],
        '/administrator-login': ['/assets/js/i18n.js', '/assets/js/language-switcher.js', '/assets/js/csrf-utils.js', '/assets/js/api-client.js', '/assets/js/administrator-login-init.js'],
        '/administrator-dashboard': ['https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js', '/assets/js/i18n.js', '/assets/js/language-switcher.js', '/assets/js/modal-utils.js', '/assets/js/errorHandler.js', '/assets/js/csrf-utils.js', '/assets/js/api-client.js', '/assets/js/password-validator-component.js', '/assets/js/qrcode.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', '/assets/js/label-print-utils.js', '/assets/js/administrator-dashboard-init.js?v=20260624c', '/assets/js/admin-operator-fix.js', '/assets/js/administrator-dashboard-i18n.js'],
        '/affiliate-success': ['/assets/js/i18n.js', '/assets/js/language-switcher.js', '/assets/js/modal-utils.js', '/assets/js/affiliate-success-init.js'],
        '/affiliate-landing': ['/assets/js/i18n.js', '/assets/js/language-switcher.js', '/assets/js/api-client.js', '/assets/js/affiliate-landing-init.js?v=20260623a']
    };

    // Define page-specific stylesheets
    const pageStyles = {};

    // Load scripts for the current route (use base route without query params)
    const baseRoute = route.split('?')[0];
    const scripts = pageScripts[baseRoute] || [];
    if (scripts.length > 0) {
        loadPageScripts(scripts);
    }

    // Load stylesheets for the current route
    const styles = pageStyles[baseRoute] || [];
    if (styles.length > 0) {
        loadPageStyles(styles);
    }
}

// Load scripts sequentially
function loadPageScripts(scripts) {
    let scriptIndex = 0;
    
    function loadNextScript() {
        if (scriptIndex < scripts.length) {
            const scriptPath = scripts[scriptIndex];
            
            // Check if script is already loaded
            const existingScript = document.querySelector(`script[src*="${scriptPath}"]`);
            if (existingScript) {
                scriptIndex++;
                loadNextScript();
                return;
            }
            
            const script = document.createElement('script');
            // Check if it's an external URL
            if (scriptPath.startsWith('http://') || scriptPath.startsWith('https://')) {
                script.src = scriptPath;
            } else {
                script.src = BASE_URL + scriptPath + '?v=' + Date.now();
            }
            
            // Get nonce from meta tag or existing script
            const nonceMeta = document.querySelector('meta[name="csp-nonce"]');
            const existingScriptWithNonce = document.querySelector('script[nonce]');
            const nonce = nonceMeta?.getAttribute('content') || existingScriptWithNonce?.getAttribute('nonce');
            
            if (nonce) {
                script.setAttribute('nonce', nonce);
            }
            
            script.setAttribute('data-page-script', 'true');
            script.onload = function() {
                console.log('Loaded script:', scripts[scriptIndex]);
                scriptIndex++;
                loadNextScript();
            };
            script.onerror = function() {
                console.error('Failed to load script:', scripts[scriptIndex]);
                scriptIndex++;
                loadNextScript();
            };
            document.body.appendChild(script);
        } else {
            // All scripts loaded, initialize and trigger translation if available
            setTimeout(async () => {
                // Get the saved language preference
                const savedLanguage = localStorage.getItem('selectedLanguage') || 'en';
                console.log('[Embed-App-V2] Saved language preference:', savedLanguage);
                
                // Initialize i18n if not already initialized
                if (window.i18n) {
                    if (!window.i18n.currentLanguage) {
                        console.log('[Embed-App-V2] Initializing i18n with language:', savedLanguage);
                        await window.i18n.init();
                    }
                    
                    // Set the correct language if different
                    if (window.i18n.currentLanguage !== savedLanguage) {
                        console.log('[Embed-App-V2] Setting language to:', savedLanguage);
                        await window.i18n.setLanguage(savedLanguage);
                    }
                    
                    // Trigger translation
                    console.log('[Embed-App-V2] Triggering i18n translation after scripts loaded');
                    window.i18n.translatePage();
                }
            }, 200);
        }
    }
    
    loadNextScript();
}

// Load stylesheets for the current page
function loadPageStyles(styles) {
    styles.forEach(stylePath => {
        // Check if stylesheet is already loaded
        const existingLink = document.querySelector(`link[href*="${stylePath}"]`);
        if (existingLink) {
            console.log('Stylesheet already loaded:', stylePath);
            return;
        }

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';

        // Check if it's an external URL
        if (stylePath.startsWith('http://') || stylePath.startsWith('https://')) {
            link.href = stylePath;
        } else {
            link.href = BASE_URL + stylePath + '?v=' + Date.now();
        }

        link.setAttribute('data-page-style', 'true');
        link.onload = function() {
            console.log('Loaded stylesheet:', stylePath);
        };
        link.onerror = function() {
            console.error('Failed to load stylesheet:', stylePath);
        };

        document.head.appendChild(link);
    });
}

// Handle navigation
function handleNavigation(action) {
    console.log('Handling navigation:', action);
    
    if (action === 'back') {
        // Check if we're in an iframe
        if (window.parent !== window) {
            // Send message to parent
            window.parent.postMessage({
                type: 'navigate-back',
                data: {}
            }, '*');
        } else {
            // Not in iframe, use browser history
            window.history.back();
        }
    }
}

// Navigate to a specific route
function navigateTo(route) {
    console.log('Navigating to:', route);
    
    // Update URL without reload
    const params = new URLSearchParams(window.location.search);
    params.set('route', route);
    const newUrl = window.location.pathname + '?' + params.toString() + window.location.hash;
    window.history.pushState({ route }, '', newUrl);
    
    // Load the new page
    loadPage(route);
}

// Set up height observer
function setupHeightObserver() {
    // Observe changes to the app container
    const container = document.getElementById('app-container');
    if (!container) return;
    
    // Debounced update function to prevent excessive calls
    let observerTimeout = null;
    let lastObservedHeight = 0;
    
    const debouncedUpdate = (entries) => {
        clearTimeout(observerTimeout);
        
        // Check if the height actually changed significantly
        if (entries && entries[0]) {
            const newHeight = entries[0].contentRect.height;
            // Only trigger update if height changed by more than 10px
            if (Math.abs(newHeight - lastObservedHeight) < 10) {
                return;
            }
            lastObservedHeight = newHeight;
        }
        
        observerTimeout = setTimeout(updateHeight, 300);
    };
    
    // Create a ResizeObserver to watch for size changes
    const resizeObserver = new ResizeObserver(debouncedUpdate);
    
    // Start observing
    resizeObserver.observe(container);
    
    // Create a MutationObserver to watch for DOM changes (less aggressive)
    const mutationObserver = new MutationObserver((mutations) => {
        // Only trigger for significant changes
        const hasSignificantChange = mutations.some(mutation => 
            mutation.type === 'childList' && 
            (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
        );
        
        if (hasSignificantChange) {
            debouncedUpdate();
        }
    });
    
    // Start observing with less aggressive settings
    mutationObserver.observe(container, {
        childList: true,
        subtree: true
        // Removed attributes and characterData to reduce noise
    });
    
    // Store observers for cleanup
    window.currentResizeObserver = resizeObserver;
    window.currentMutationObserver = mutationObserver;
    
    // Listen for cleanup event
    window.addEventListener('disconnect-observers', () => {
        if (window.currentResizeObserver) {
            window.currentResizeObserver.disconnect();
            window.currentResizeObserver = null;
        }
        if (window.currentMutationObserver) {
            window.currentMutationObserver.disconnect();
            window.currentMutationObserver = null;
        }
    }, { once: true });
}

// Listen for messages from parent
window.addEventListener('message', (event) => {
    console.log('Received message:', event.data, 'from origin:', event.origin);
    
    // Handle navigation messages from child iframes
    if (event.data.type === 'navigate' && event.data.route) {
        console.log('Navigation message from child iframe:', event.data.route);
        navigateTo(event.data.route);
        return;
    }
    
    // Handle different message types
    switch(event.data.type) {
        case 'navigate':
            if (event.data.route) {
                navigateTo(event.data.route);
            }
            break;
            
        case 'viewport-info':
            viewportInfo = event.data.data;
            console.log('Received viewport info:', viewportInfo);
            
            // Apply mobile-specific classes if needed
            if (viewportInfo.isMobile) {
                document.body.classList.add('is-mobile');
                // Request chrome hiding on mobile
                console.log('Mobile detected, requesting chrome hide');
                window.parent.postMessage({ type: 'hide-chrome' }, '*');
            } else if (viewportInfo.isTablet) {
                document.body.classList.add('is-tablet');
                // Also hide chrome on tablets for better experience
                console.log('Tablet detected, requesting chrome hide');
                window.parent.postMessage({ type: 'hide-chrome' }, '*');
            }
            break;
            
        case 'hide-chrome':
            chromeHidden = event.data.hidden;
            if (chromeHidden) {
                document.body.classList.add('chrome-hidden');
            } else {
                document.body.classList.remove('chrome-hidden');
            }
            updateHeight();
            break;
            
        case 'auth-check':
            // Respond with current auth state
            event.source.postMessage({
                type: 'auth-state',
                data: {
                    isAuthenticated: isAnyUserAuthenticated(),
                    userType: getAuthenticatedUserType()
                }
            }, event.origin);
            break;
            
        case 'session-update':
            // Session was updated, reload current page
            console.log('Session update received, reloading page');
            loadPage(currentRoute);
            break;
            
        case 'logout':
            // Handle logout
            console.log('Logout message received');
            if (window.SessionManager) {
                window.SessionManager.logout(event.data.userType || 'all');
            }
            // Redirect to landing page
            navigateTo('/');
            break;
            
        case 'language-change':
            // Handle language change from parent
            console.log('[Embed-App-V2] Language change received:', event.data.data?.language);
            const newLanguage = event.data.data?.language;
            if (newLanguage) {
                // Update localStorage
                localStorage.setItem('selectedLanguage', newLanguage);
                console.log('[Embed-App-V2] Saved language to localStorage:', newLanguage);
                
                // Update language preference field if it exists
                const langPrefField = document.getElementById('languagePreference');
                if (langPrefField) {
                    langPrefField.value = newLanguage;
                }
                
                // Trigger i18n language change if available
                if (window.i18n) {
                    (async () => {
                        // Ensure i18n is initialized
                        if (!window.i18n.currentLanguage) {
                            console.log('[Embed-App-V2] Initializing i18n before language change');
                            await window.i18n.init();
                        }
                        
                        // Set the new language
                        console.log('[Embed-App-V2] Changing i18n language to:', newLanguage);
                        await window.i18n.setLanguage(newLanguage);
                        
                        // Force re-translation of the page
                        console.log('[Embed-App-V2] Triggering page translation');
                        window.i18n.translatePage();
                    })();
                }
                
                // Also trigger language switcher update if available
                if (window.LanguageSwitcher && window.LanguageSwitcher.updateLanguage) {
                    window.LanguageSwitcher.updateLanguage(newLanguage);
                }
            }
            break;
    }
});

// Handle browser back/forward buttons
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.route) {
        loadPage(event.state.route);
    } else {
        loadPage(getRouteFromUrl());
    }
});

// Make navigateTo available globally for embedded scripts
window.navigateTo = navigateTo;

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing embed app v2');
    
    // Get initial route
    const route = getRouteFromUrl();
    
    // Check if this route is supported in V2 (check base route without query params)
    const baseRoute = route.split('?')[0];
    if (!EMBED_PAGES[baseRoute]) {
        // Route not migrated yet, show message
        const container = document.getElementById('app-container');
        container.innerHTML = `
            <div class="error">
                <h3>Page Not Available</h3>
                <p>This page is not yet available in the new version.</p>
                <p>Route: ${route}</p>
                <button class="btn btn-primary mt-3" onclick="window.location.href='/embed-app-v2.html' + window.location.search">Use Legacy Version</button>
            </div>
        `;
        return;
    }
    
    // Load initial page
    loadPage(route);
    
    // Set up periodic height updates
    setInterval(updateHeight, 1000);
    
    // Request viewport info from parent
    if (window.parent !== window) {
        window.parent.postMessage({ type: 'request-viewport-info' }, '*');
    }
});