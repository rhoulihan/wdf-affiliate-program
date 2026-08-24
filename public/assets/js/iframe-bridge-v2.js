// Iframe Bridge V2 - Runs inside the embedded page
// Structured system with global and per-page actions
(function() {
    'use strict';

    console.log('[Iframe Bridge V2] Initializing...');

    // Configuration
    // Origin whitelist for INCOMING messages (parent → iframe). Outgoing
    // messages use targetOrigin '*' — we don't send anything sensitive that
    // would warrant a fixed targetOrigin, and the parent-side bridge does
    // its own origin check on receipt. This lets the iframe work under any
    // approved parent (production wavemaxlaundry.com, the rundberglaundry.com
    // staging origin, AND local dev hosts) without per-environment config.
    const DEV_HOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

    const config = {
        allowedOrigins: [
            'https://www.wavemaxlaundry.com',
            'https://wavemaxlaundry.com',
            'https://rundberglaundry.com',
            'https://affiliate.rundberglaundry.com',
            // Per-location domains that proxy the Austin franchise content
            'https://atxwashateria.com',
            'https://atxwashdryfold.com',
            'https://runberglaundry.com',
            'https://rundberglaundry.com'
        ],
        pageIdentifier: null,
        enableTranslation: true,
        enableAutoResize: true
    };

    // Global translation data structure
    const translations = {
        en: {},
        es: {},
        pt: {},
        de: {}
    };

    let currentLanguage = 'en';
    let parentReady = false;
    let seoConfig = null;
    let locationData = null;
    const locationDataListeners = [];

    // Global actions - These run for ALL pages
    const globalActions = {
        // Action 1: Hide page header on parent
        hidePageHeader: function() {
            sendToParent({
                type: 'hide-page-header'
            });
        },

        // Action 2: Initialize translation system
        initializeTranslation: function() {
            // Request current language from parent
            sendToParent({
                type: 'request-language'
            });

            // Apply saved language if exists
            const savedLanguage = localStorage.getItem('selectedLanguage') || 'en';
            if (savedLanguage !== 'en') {
                setLanguage(savedLanguage);
            }
        },

        // Action 3: Send SEO data to parent
        sendSEOData: function() {
            if (seoConfig) {
                console.log('[Iframe Bridge V2] Sending SEO data to parent');
                sendToParent({
                    type: 'seo-data',
                    data: seoConfig
                });
            }
        }
    };

    // Page-specific actions registry
    const pageActions = {};

    // Initialize bridge
    function init(pageConfig) {
        if (pageConfig) {
            Object.assign(config, pageConfig);
        }

        console.log('[Iframe Bridge V2] Config:', config);

        // Set up message listener for parent communication
        window.addEventListener('message', handleParentMessage);

        // Notify parent that iframe is ready
        sendToParent({
            type: 'iframe-ready',
            page: config.pageIdentifier,
            timestamp: Date.now()
        });

        // Execute global actions after a short delay to ensure parent is ready
        setTimeout(executeGlobalActions, 100);

        // Set up auto-resize if enabled
        if (config.enableAutoResize) {
            setupAutoResize();
        }
    }

    // Execute all global actions
    function executeGlobalActions() {
        console.log('[Iframe Bridge V2] Executing global actions...');

        Object.keys(globalActions).forEach(actionName => {
            try {
                globalActions[actionName]();
                console.log('[Iframe Bridge V2] Global action executed:', actionName);
            } catch (error) {
                console.error('[Iframe Bridge V2] Error executing global action:', actionName, error);
            }
        });
    }

    // Execute page-specific actions
    function executePageActions() {
        if (!config.pageIdentifier || !pageActions[config.pageIdentifier]) {
            console.log('[Iframe Bridge V2] No page-specific actions for:', config.pageIdentifier);
            return;
        }

        console.log('[Iframe Bridge V2] Executing page-specific actions for:', config.pageIdentifier);

        const actions = pageActions[config.pageIdentifier];
        Object.keys(actions).forEach(actionName => {
            try {
                actions[actionName]();
                console.log('[Iframe Bridge V2] Page action executed:', actionName);
            } catch (error) {
                console.error('[Iframe Bridge V2] Error executing page action:', actionName, error);
            }
        });
    }

    function isAllowedOrigin(origin) {
        if (!origin) return false;
        if (config.allowedOrigins.some(allowed => origin === allowed)) return true;
        if (DEV_HOST_PATTERN.test(origin)) return true;
        return false;
    }

    // Handle messages from parent
    function handleParentMessage(event) {
        if (!isAllowedOrigin(event.origin)) {
            console.warn('[Iframe Bridge V2] Message from unauthorized origin:', event.origin);
            return;
        }

        const { type, data } = event.data;
        console.log('[Iframe Bridge V2] Received from parent:', type, data);

        switch (type) {
            case 'parent-ready':
                handleParentReady();
                break;

            case 'language-change':
                if (data && data.language) {
                    setLanguage(data.language);
                }
                break;

            case 'current-language':
                if (data && data.language) {
                    setLanguage(data.language);
                }
                break;

            case 'location-data':
                if (data) {
                    locationData = data;
                    applyLocationDataBindings();
                    locationDataListeners.forEach(fn => {
                        try { fn(data); } catch (e) { console.error('[Iframe Bridge V2] location-data listener threw:', e); }
                    });
                }
                break;

            default:
                // Allow page-specific handlers
                if (window.iframeBridgeHandlers && window.iframeBridgeHandlers[type]) {
                    window.iframeBridgeHandlers[type](data);
                }
        }
    }

    // Send message to parent.
    // targetOrigin '*' is intentional: outgoing messages contain only public
    // data (resize height, SEO metadata destined for OG/Twitter/JSON-LD,
    // navigation requests against same-origin). The parent-side bridge
    // applies its own allowedOrigins check on receipt before acting on the
    // message. Using a fixed targetOrigin would force per-environment config
    // (prod / staging / localhost) and break embedding under any not-yet-
    // approved host the franchisor decides to use later.
    function sendToParent(message) {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage(message, '*');
        }
    }

    // Handle parent ready
    function handleParentReady() {
        console.log('[Iframe Bridge V2] Parent is ready');
        parentReady = true;

        // Execute page-specific actions now that parent is ready
        executePageActions();

        // Send initial content height
        updateHeight();
    }

    // Translation functions
    function setLanguage(language) {
        if (!translations[language]) {
            console.warn('[Iframe Bridge V2] Unsupported language:', language);
            return;
        }

        currentLanguage = language;
        console.log('[Iframe Bridge V2] Language set to:', language);

        // Save to localStorage
        localStorage.setItem('selectedLanguage', language);

        // Translate the page
        translatePage();

        // Notify listeners
        window.dispatchEvent(new CustomEvent('language-changed', {
            detail: { language }
        }));
    }

    function translatePage() {
        console.log('[Iframe Bridge V2] Translating page to:', currentLanguage);

        // Translate elements with data-i18n attribute
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = getTranslation(key);

            if (translation) {
                // Check if element has data-i18n-html attribute to preserve HTML
                if (element.hasAttribute('data-i18n-html')) {
                    element.innerHTML = translation;
                } else {
                    element.textContent = translation;
                }
            }
        });

        // Translate attributes
        const attrElements = document.querySelectorAll('[data-i18n-attr]');
        attrElements.forEach(element => {
            const attrData = element.getAttribute('data-i18n-attr');
            try {
                const attrs = JSON.parse(attrData);
                Object.keys(attrs).forEach(attr => {
                    const translation = getTranslation(attrs[attr]);
                    if (translation) {
                        element.setAttribute(attr, translation);
                    }
                });
            } catch (e) {
                console.error('[Iframe Bridge V2] Error parsing i18n-attr:', e);
            }
        });

        // Trigger page height update after translation
        setTimeout(updateHeight, 100);
    }

    // Lookup supports both dictionary shapes:
    //   nested:  translations.es.stub.title
    //   flat:    translations.es["stub.title"]
    // Existing public/locales/<lang>/common.json uses nested; the per-page
    // init scripts use flat for compactness. Either works.
    function lookupInDict(dict, key) {
        if (!dict) return null;
        if (typeof dict[key] === 'string') return dict[key];
        const parts = key.split('.');
        let cursor = dict;
        for (const p of parts) {
            if (cursor && typeof cursor === 'object' && p in cursor) {
                cursor = cursor[p];
            } else {
                return null;
            }
        }
        return typeof cursor === 'string' ? cursor : null;
    }

    function getTranslation(key) {
        return lookupInDict(translations[currentLanguage], key)
            || lookupInDict(translations['en'], key)
            || null;
    }

    function loadTranslations(translationData) {
        if (translationData) {
            // Deep merge translations
            Object.keys(translationData).forEach(lang => {
                if (!translations[lang]) {
                    translations[lang] = {};
                }
                Object.assign(translations[lang], translationData[lang]);
            });
            console.log('[Iframe Bridge V2] Translations loaded for languages:', Object.keys(translationData));
        }
    }

    /* ---------- Location data (v3 addition) ----------
     * Parent page broadcasts a single canonical LOCATION_DATA object on
     * iframe-ready and on demand via request-location-data. The iframe page
     * uses it via [data-bind="contact.phone"] declarative binding, plus
     * onLocationData() listeners for imperative work.
     */

    function applyLocationDataBindings(root) {
        if (!locationData) return;
        const scope = root || document;
        scope.querySelectorAll('[data-bind]').forEach(el => {
            const path = el.getAttribute('data-bind');
            const value = resolvePath(locationData, path);
            if (value === undefined || value === null) return;
            const attr = el.getAttribute('data-bind-attr');
            if (attr) {
                el.setAttribute(attr, String(value));
            } else if (el.tagName === 'A' && /^(tel|mailto|http|\/)/.test(String(value))) {
                el.setAttribute('href', String(value));
                if (!el.textContent.trim()) el.textContent = String(value);
            } else {
                el.textContent = String(value);
            }
        });
    }

    function resolvePath(obj, path) {
        return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
    }

    function requestLocationData() {
        sendToParent({ type: 'request-location-data' });
    }

    function onLocationData(fn) {
        if (typeof fn !== 'function') return;
        locationDataListeners.push(fn);
        if (locationData) {
            try { fn(locationData); } catch (e) { console.error('[Iframe Bridge V2] location-data listener threw:', e); }
        }
    }

    function navigateParent(href) {
        sendToParent({ type: 'navigate', data: { href } });
    }

    function loadSEOConfig(seoData) {
        if (seoData) {
            seoConfig = seoData;
            console.log('[Iframe Bridge V2] SEO config loaded');

            // If parent is already ready, send SEO data immediately
            if (parentReady) {
                globalActions.sendSEOData();
            }
        }
    }

    // Auto-resize functionality
    function setupAutoResize() {
        // Initial height
        updateHeight();

        // Update on content changes
        const observer = new MutationObserver(() => {
            updateHeight();
        });

        observer.observe(document.body, {
            attributes: true,
            childList: true,
            subtree: true
        });

        // Update on window resize
        window.addEventListener('resize', updateHeight);

        // Update periodically for dynamic content
        setInterval(updateHeight, 1000);
    }

    function updateHeight() {
        // Measure CONTENT height only. Do NOT include any of
        //   documentElement.clientHeight   (the iframe's current viewport)
        //   documentElement.scrollHeight   (max of content + viewport,
        //                                   because <html> stretches to
        //                                   fill the viewport when content
        //                                   is shorter — so this returns
        //                                   the iframe's outer height,
        //                                   not the content's)
        // Both of those ratchet to the parent's last-set iframe.style.height
        // and prevent shrink on viewport widening (mobile → desktop):
        // content reflows to 2000px but docEl.scrollHeight stays at the
        // last mobile-tall 3500px because the iframe element hasn't been
        // resized yet — Math.max keeps returning 3500, parent never
        // shrinks, white space sits above the host page footer.
        //
        // body.scrollHeight + body.offsetHeight + docEl.offsetHeight all
        // reflect natural content box height regardless of viewport.
        const height = Math.max(
            document.body.scrollHeight,
            document.body.offsetHeight,
            document.documentElement.offsetHeight
        );

        // Send under `data` envelope to match the v3 parent-bridge protocol
        // (parent does `const { type, data } = event.data` and reads
        // `data.height`). The legacy v2 parent did not require this — both
        // shapes worked there — but v3 enforces it for protocol consistency
        // with seo-data, location-data, current-language, etc.
        sendToParent({
            type: 'resize',
            data: { height: height, page: config.pageIdentifier }
        });
    }

    // Public API
    window.IframeBridge = {
        init: init,
        sendToParent: sendToParent,
        setLanguage: setLanguage,
        getCurrentLanguage: () => currentLanguage,
        translatePage: translatePage,
        updateHeight: updateHeight,
        loadTranslations: loadTranslations,
        loadSEOConfig: loadSEOConfig,
        getLocationData: () => locationData,
        onLocationData: onLocationData,
        requestLocationData: requestLocationData,
        applyLocationDataBindings: applyLocationDataBindings,
        navigateParent: navigateParent,

        // Register page-specific action
        registerPageAction: function(pageId, actionName, actionFn) {
            if (!pageActions[pageId]) {
                pageActions[pageId] = {};
            }
            pageActions[pageId][actionName] = actionFn;
            console.log('[Iframe Bridge V2] Registered page action:', pageId, actionName);
        },

        // Execute page actions manually if needed
        executePageActions: executePageActions
    };

    console.log('[Iframe Bridge V2] Ready');
})();
