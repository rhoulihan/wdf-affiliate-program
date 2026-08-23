/**
 * Laundromat Internationalization (i18n) Library
 * Supports: English (en), Spanish (es), Portuguese (pt), German (de)
 */

(function(window) {
  'use strict';

  const i18n = {
    // Default configuration
    config: {
      defaultLanguage: 'en',
      supportedLanguages: ['en', 'es', 'pt', 'de'],
      fallbackLanguage: 'en',
      translationsPath: window.location.hostname === 'localhost' || window.location.hostname.includes('rundberglaundry.com')
        ? '/locales'
        : window.location.origin + '/locales',
      storageKey: 'wavemax-language',
      debugMode: false
    },

    // Current state
    currentLanguage: null,
    translations: {},
    loadedLanguages: new Set(),

    /**
         * Initialize the i18n system
         */
    async init(options = {}) {
      // Merge custom options
      Object.assign(this.config, options);

      // Seed the global brand token (brand.js may re-seed it later).
      this.globalParams = Object.assign({}, this.globalParams, {
        brandName: (window.BRAND && window.BRAND.name) || 'Laundromat',
        brandLegal: (window.BRAND && window.BRAND.legal) || 'CRHS Enterprises, LLC'
      });

      // Detect initial language
      this.currentLanguage = this.detectLanguage();

      // Load translations for current language
      await this.loadLanguage(this.currentLanguage);

      // Apply translations to the page
      this.translatePage();

      // Set up mutation observer for dynamic content
      this.observeDynamicContent();

      if (this.config.debugMode) {
        console.log('i18n initialized with language:', this.currentLanguage);
      }
    },

    /**
         * Detect user's preferred language
         */
    detectLanguage() {
      // 1. Check localStorage
      const storedLang = localStorage.getItem(this.config.storageKey);
      if (storedLang && this.config.supportedLanguages.includes(storedLang)) {
        return storedLang;
      }

      // 2. Check URL parameter
      const urlParams = new URLSearchParams(window.location.search);
      const urlLang = urlParams.get('lang');
      if (urlLang && this.config.supportedLanguages.includes(urlLang)) {
        this.setLanguage(urlLang);
        return urlLang;
      }

      // 3. Check browser language
      const browserLang = navigator.language || navigator.userLanguage;
      if (browserLang) {
        const shortLang = browserLang.split('-')[0].toLowerCase();
        if (this.config.supportedLanguages.includes(shortLang)) {
          return shortLang;
        }
      }

      // 4. Fallback to default
      return this.config.defaultLanguage;
    },

    /**
         * Load translations for a specific language
         */
    async loadLanguage(lang) {
      if (this.loadedLanguages.has(lang)) {
        return; // Already loaded
      }

      try {
        // Add cache-busting parameter to force reload
        const timestamp = new Date().getTime();
        const url = `${this.config.translationsPath}/${lang}/common.json?v=${timestamp}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to load translations for ${lang}: ${response.status} ${response.statusText}`);
        }

        const translations = await response.json();
        // Use the full translations object, not just the 'common' part
        this.translations[lang] = translations;
        this.loadedLanguages.add(lang);

        if (this.config.debugMode) {
          console.log(`Loaded translations for ${lang}:`, translations);
        }
      } catch (error) {
        console.error(`Error loading language ${lang}:`, error);

        // Fallback to default language if not already loading it
        if (lang !== this.config.fallbackLanguage) {
          await this.loadLanguage(this.config.fallbackLanguage);
        }
      }
    },

    /**
         * Get a translation by key
         */
    t(key, params = {}) {
      // Split key by dots for nested access
      const keys = key.split('.');
      let value = this.translations[this.currentLanguage];

      // Navigate through nested structure
      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          // Try fallback language
          value = this.getFallbackTranslation(key);
          break;
        }
      }

      // If still not found, return the key
      if (typeof value !== 'string') {
        console.warn(`Translation not found for key: ${key}`);
        return key;
      }

      // Replace parameters
      return this.interpolate(value, Object.assign({}, this.globalParams, params));
    },

    /**
         * Get translation from fallback language
         */
    getFallbackTranslation(key) {
      const keys = key.split('.');
      let value = this.translations[this.config.fallbackLanguage];

      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          return null;
        }
      }

      return value;
    },

    /**
         * Interpolate parameters into translation string
         */
    interpolate(str, params) {
      return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return params[key] || match;
      });
    },

    /**
         * Set and apply a new language
         */
    async setLanguage(lang) {
      if (!this.config.supportedLanguages.includes(lang)) {
        console.error(`Language ${lang} is not supported`);
        return;
      }

      // Load language if not already loaded
      await this.loadLanguage(lang);

      // Update current language
      this.currentLanguage = lang;

      // Save to localStorage
      localStorage.setItem(this.config.storageKey, lang);

      // Update HTML lang attribute
      document.documentElement.lang = lang;

      // Translate the page
      this.translatePage();

      // Dispatch custom event
      window.dispatchEvent(new CustomEvent('languageChanged', {
        detail: { language: lang }
      }));
    },

    /**
         * Translate all elements on the page
         */
    translatePage() {
      // Translate elements with data-i18n attribute
      const elements = document.querySelectorAll('[data-i18n]');
      elements.forEach(element => {
        // Skip if marked to exclude
        if (element.getAttribute('data-i18n-exclude') === 'true') {
          return;
        }

        const key = element.getAttribute('data-i18n');
        const params = this.getDataParams(element);

        // Check for specific attribute translations
        const attrString = element.getAttribute('data-i18n-attr');
        if (attrString) {
          const attrs = attrString.split(',');
          attrs.forEach(attr => {
            const [attrName, attrKey] = attr.split(':');
            if (attrKey) {
              element.setAttribute(attrName, this.t(attrKey, params));
            }
          });
        } else {
          // Default to text content
          element.textContent = this.t(key, params);
        }
      });

      // Translate placeholder attributes
      const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
      placeholders.forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        element.placeholder = this.t(key);
      });

      // Translate title attributes
      const titles = document.querySelectorAll('[data-i18n-title]');
      titles.forEach(element => {
        const key = element.getAttribute('data-i18n-title');
        element.title = this.t(key);
      });
    },

    /**
         * Get data parameters from element
         */
    getDataParams(element) {
      const params = {};
      Array.from(element.attributes).forEach(attr => {
        if (attr.name.startsWith('data-i18n-param-')) {
          const paramName = attr.name.replace('data-i18n-param-', '');
          params[paramName] = attr.value;
        }
      });
      return params;
    },

    /**
         * Observe DOM changes for dynamic content
         */
    observeDynamicContent() {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === 1) { // Element node
                this.translateElement(node);
              }
            });
          }
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    },

    /**
         * Translate a specific element and its children
         */
    translateElement(element) {
      // Translate the element itself
      if (element.hasAttribute('data-i18n')) {
        const key = element.getAttribute('data-i18n');
        const params = this.getDataParams(element);
        element.textContent = this.t(key, params);
      }

      // Translate children
      const children = element.querySelectorAll('[data-i18n]');
      children.forEach(child => {
        const key = child.getAttribute('data-i18n');
        const params = this.getDataParams(child);
        child.textContent = this.t(key, params);
      });
    },

    /**
         * Get current language
         */
    getLanguage() {
      return this.currentLanguage;
    },

    /**
         * Get all supported languages
         */
    getSupportedLanguages() {
      return this.config.supportedLanguages;
    },

    /**
         * Format currency based on locale
         */
    formatCurrency(amount, currency = 'USD') {
      const locale = this.getLocale();
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency
      }).format(amount);
    },

    /**
         * Format date based on locale
         */
    formatDate(date, options = {}) {
      const locale = this.getLocale();
      return new Intl.DateTimeFormat(locale, options).format(date);
    },

    /**
         * Get full locale string
         */
    getLocale() {
      const localeMap = {
        'en': 'en-US',
        'es': 'es-ES',
        'pt': 'pt-BR',
        'de': 'de-DE'
      };
      return localeMap[this.currentLanguage] || 'en-US';
    },

    /**
         * Update global parameters and re-translate the page
         */
    updateParams(params) {
      // Store global parameters
      this.globalParams = Object.assign({}, this.globalParams || {}, params);

      // Re-translate elements that use these parameters
      const elements = document.querySelectorAll('[data-i18n]');
      elements.forEach(element => {
        // Check if element uses any of the updated parameters
        const elementParams = this.getDataParams(element);
        const hasUpdatedParam = Object.keys(params).some(key =>
          element.getAttribute(`data-i18n-param-${key}`) !== null
        );

        if (hasUpdatedParam) {
          const key = element.getAttribute('data-i18n');
          const mergedParams = Object.assign({}, this.globalParams, elementParams);
          element.textContent = this.t(key, mergedParams);
        }
      });
    }
  };

  // Expose to global scope
  window.i18n = i18n;

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => i18n.init());
  } else {
    i18n.init();
  }

})(window);