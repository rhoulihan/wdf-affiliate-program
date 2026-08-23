/**
 * Language Switcher Component for Laundromat
 * Creates a dropdown UI for language selection
 */

(function(window) {
  'use strict';

  const LanguageSwitcher = {
    /**
         * Create language switcher HTML
         */
    createSwitcher(containerId, options = {}) {
      // Check if we're in embedded context and should skip creation
      if (document.body.classList.contains('is-embedded') || 
          (window.parent && window.parent !== window) ||
          (window.EMBED_CONFIG && window.EMBED_CONFIG.isEmbedded)) {
        console.log('LanguageSwitcher: Skipping creation in embedded context');
        return;
      }
      
      const container = document.getElementById(containerId);
      if (!container) {
        console.error(`Container with id '${containerId}' not found`);
        return;
      }

      const config = {
        position: 'top-right',
        style: 'dropdown', // dropdown or flags
        showLabel: true,
        ...options
      };

      const languages = [
        { code: 'en', name: 'English', flag: '🇺🇸' },
        { code: 'es', name: 'Español', flag: '🇪🇸' },
        { code: 'pt', name: 'Português', flag: '🇧🇷' },
        { code: 'de', name: 'Deutsch', flag: '🇩🇪' }
      ];

      const currentLang = window.i18n ? window.i18n.getLanguage() : 'en';

      if (config.style === 'dropdown') {
        this.createDropdown(container, languages, currentLang, config);
      } else {
        this.createFlags(container, languages, currentLang, config);
      }
    },

    /**
         * Create dropdown style switcher
         */
    createDropdown(container, languages, currentLang, config) {
      const currentLanguage = languages.find(lang => lang.code === currentLang) || languages[0];

      const html = `
                <div class="language-switcher dropdown">
                    <button class="language-switcher-toggle" type="button" data-toggle="dropdown" aria-expanded="false">
                        <span class="language-flag">${currentLanguage.flag}</span>
                        ${config.showLabel ? `<span class="language-name">${currentLanguage.name}</span>` : ''}
                        <span class="dropdown-arrow">▼</span>
                    </button>
                    <div class="language-dropdown-menu">
                        ${languages.map(lang => `
                            <a href="#" class="language-option ${lang.code === currentLang ? 'active' : ''}" 
                               data-lang="${lang.code}">
                                <span class="language-flag">${lang.flag}</span>
                                <span class="language-name">${lang.name}</span>
                            </a>
                        `).join('')}
                    </div>
                </div>
            `;

      container.innerHTML = html;
      this.attachDropdownEvents(container);
    },

    /**
         * Create flag style switcher
         */
    createFlags(container, languages, currentLang, config) {
      const html = `
                <div class="language-switcher flags">
                    ${languages.map(lang => `
                        <button class="language-flag-button ${lang.code === currentLang ? 'active' : ''}" 
                                data-lang="${lang.code}"
                                title="${lang.name}">
                            <span class="language-flag">${lang.flag}</span>
                            ${config.showLabel ? `<span class="language-name">${lang.name}</span>` : ''}
                        </button>
                    `).join('')}
                </div>
            `;

      container.innerHTML = html;
      this.attachFlagEvents(container);
    },

    /**
         * Attach events for dropdown
         */
    attachDropdownEvents(container) {
      const toggle = container.querySelector('.language-switcher-toggle');
      const menu = container.querySelector('.language-dropdown-menu');
      const options = container.querySelectorAll('.language-option');

      // Toggle dropdown
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        menu.classList.toggle('show');
        toggle.setAttribute('aria-expanded', menu.classList.contains('show'));
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
          menu.classList.remove('show');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });

      // Handle language selection
      options.forEach(option => {
        option.addEventListener('click', (e) => {
          e.preventDefault();
          const lang = option.getAttribute('data-lang');
          this.changeLanguage(lang);
          menu.classList.remove('show');
          toggle.setAttribute('aria-expanded', 'false');
        });
      });
    },

    /**
         * Attach events for flags
         */
    attachFlagEvents(container) {
      const buttons = container.querySelectorAll('.language-flag-button');

      buttons.forEach(button => {
        button.addEventListener('click', (e) => {
          e.preventDefault();
          const lang = button.getAttribute('data-lang');
          this.changeLanguage(lang);
        });
      });
    },

    /**
         * Change language
         */
    async changeLanguage(lang) {
      if (window.i18n) {
        await window.i18n.setLanguage(lang);

        // Update active state
        document.querySelectorAll('.language-option, .language-flag-button').forEach(el => {
          el.classList.toggle('active', el.getAttribute('data-lang') === lang);
        });

        // Update dropdown toggle if exists
        const toggle = document.querySelector('.language-switcher-toggle');
        if (toggle) {
          const languages = [
            { code: 'en', name: 'English', flag: '🇺🇸' },
            { code: 'es', name: 'Español', flag: '🇪🇸' },
            { code: 'pt', name: 'Português', flag: '🇧🇷' },
            { code: 'de', name: 'Deutsch', flag: '🇩🇪' }
          ];
          const currentLanguage = languages.find(l => l.code === lang);
          if (currentLanguage) {
            const flagSpan = toggle.querySelector('.language-flag');
            const nameSpan = toggle.querySelector('.language-name');
            if (flagSpan) flagSpan.textContent = currentLanguage.flag;
            if (nameSpan) nameSpan.textContent = currentLanguage.name;
          }
        }
      }
    },

    /**
         * Add default styles
         */
    addDefaultStyles() {
      // Styles are now in external CSS file /assets/css/language-switcher.css
      // This function is kept for backward compatibility but no longer injects styles
    }
  };

  // Auto-add styles
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => LanguageSwitcher.addDefaultStyles());
  } else {
    LanguageSwitcher.addDefaultStyles();
  }

  // Detect if we're in an iframe and add is-embedded class
  function detectEmbeddedContext() {
    try {
      // Check if we're in an iframe
      if (window.parent && window.parent !== window) {
        document.body.classList.add('is-embedded');
        console.log('LanguageSwitcher: Added is-embedded class (iframe detected)');
      }
      
      // Also check if embed config indicates we're embedded
      if (window.EMBED_CONFIG && window.EMBED_CONFIG.isEmbedded) {
        document.body.classList.add('is-embedded');
        console.log('LanguageSwitcher: Added is-embedded class (embed config)');
      }
    } catch (e) {
      // If we can't access parent due to cross-origin, we're likely embedded
      document.body.classList.add('is-embedded');
      console.log('LanguageSwitcher: Added is-embedded class (cross-origin exception)');
    }
  }

  // Run iframe detection immediately (multiple times to ensure it works)
  detectEmbeddedContext();
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', detectEmbeddedContext);
  } else {
    detectEmbeddedContext();
  }
  
  // Also run after a short delay to catch late-loading scenarios
  setTimeout(detectEmbeddedContext, 100);

  // Expose to global scope
  window.LanguageSwitcher = LanguageSwitcher;

})(window);