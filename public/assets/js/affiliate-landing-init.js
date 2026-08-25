(function() {
  'use strict';

  // Set viewport meta for mobile
  if (!document.querySelector('meta[name="viewport"]')) {
    const viewport = document.createElement('meta');
    viewport.name = 'viewport';
    viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=5.0';
    document.head.appendChild(viewport);
  }

  // Function to get URL parameters
  function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
  }

  // Function to show affiliate not found message
  function showAffiliateNotFoundMessage() {
    // Find the main content area
    const heroSection = document.querySelector('.hero-section .container');
    if (heroSection) {
      heroSection.innerHTML = `
                <div class="row align-items-center text-center">
                    <div class="col-12">
                        <div class="alert-icon mb-4">
                            <i class="bi bi-exclamation-triangle-fill" style="font-size: 4rem; color: #ffc107;"></i>
                        </div>
                        <h1 class="hero-title mb-4">Affiliate Not Found</h1>
                        <p class="hero-subtitle mb-4">
                            We couldn't find the delivery partner associated with this link.
                        </p>
                        <p class="lead mb-4">
                            Please verify the link with your delivery partner or contact them directly for the correct registration link.
                        </p>
                        <div class="mt-4">
                            <a href="https://rundberglaundry.com" class="btn btn-light btn-lg">
                                <i class="bi bi-house-door me-2"></i>Visit ${(window.BRAND && window.BRAND.name) || 'Laundromat'}
                            </a>
                        </div>
                    </div>
                </div>
            `;
    }

    // Hide other sections that depend on affiliate data
    const sectionsToHide = [
      '.py-5', // Services and other info sections
      '.cta-section' // Bottom CTA
    ];

    sectionsToHide.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (!el.classList.contains('hero-section')) {
          el.style.display = 'none';
        }
      });
    });
  }

  // Function to initialize the landing page
  function initializeLandingPage() {
    console.log('Initializing affiliate landing page...');

    // Get affiliate code from URL
    const affiliateCode = getUrlParameter('code');
    console.log('Affiliate code from URL:', affiliateCode);

    if (!affiliateCode) {
      console.error('No affiliate code provided');
      return;
    }

    // Fetch affiliate information
    // Use the actual API server URL instead of iframe origin
    const apiUrl = window.location.origin;
    const fetchUrl = `${apiUrl}/api/v1/affiliates/public/${affiliateCode}`;
    console.log('Fetching affiliate data from:', fetchUrl);

    fetch(fetchUrl)
      .then(response => {
        console.log('Fetch response status:', response.status);
        if (!response.ok) {
          if (response.status === 404) {
            console.log('Affiliate not found (404)');
            showAffiliateNotFoundMessage();
          }
          throw new Error(`Failed to fetch affiliate information: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('Affiliate data received:', data);
        // Update page with affiliate information
        updatePageContent(data, affiliateCode);
      })
      .catch(error => {
        console.error('Error fetching affiliate data:', error);
        // Still update links with affiliate code even if fetch fails
        updateLinks(affiliateCode, null);
      });
  }

  // Function to update page content with affiliate data
  function updatePageContent(affiliate, affiliateCode) {
    // Update affiliate name - prioritize business name if available
    const affiliateName = affiliate.businessName || `${affiliate.firstName} ${affiliate.lastName}`;

    // Update all affiliate name references
    const affiliateNameElements = [
      'affiliateName',
      'affiliateNameFooter',
      'affiliateNameService1',
      'affiliateNameStep2',  // Removed Step1 since it's now app-based
      'affiliateNameStep4',
      'affiliateNameFeature',
      'affiliateNameCTA',
      'affiliateBadgeName'  // Add the badge name element
    ];

    affiliateNameElements.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = affiliateName;
      }
    });

    // Update i18n parameters for dynamic content
    if (window.i18n && window.i18n.updateParams) {
      window.i18n.updateParams({
        affiliateName: affiliateName
      });
    }

    // Update pricing if available — flat delivery fee (effective fee from the API).
    if (affiliate.deliveryFee !== undefined && affiliate.deliveryFee !== null) {
      const feeEl = document.getElementById('deliveryFee');
      if (feeEl) feeEl.textContent = affiliate.deliveryFee;
    }

    // Update year in footer
    const yearElement = document.getElementById('yearFooter');
    if (yearElement) {
      yearElement.textContent = new Date().getFullYear();
    }

    // Update links
    updateLinks();
  }

  // Customer registration and login are bag-claim-only since PR 6 — customers
  // sign up by scanning the QR on an issued bag (/claim?bag=<token>) and there
  // is no customer portal, so the landing page no longer offers a login link.
  function updateLinks() {
    const loginLink = document.getElementById('loginLink');
    if (loginLink) {
      loginLink.hidden = true;
    }
  }

  // Track if already initialized
  let initialized = false;

  // Function to update affiliate name in i18n parameters
  function updateAffiliateNameParameters() {
    const affiliateName = document.getElementById('affiliateName')?.textContent || 'your local partner';
    
    // Update all elements with affiliate name parameters
    document.querySelectorAll('[data-i18n-param-affiliateName]').forEach(el => {
      el.setAttribute('data-i18n-param-affiliateName', affiliateName);
    });
    
    // Re-translate the page
    if (window.i18n && window.i18n.translatePage) {
      window.i18n.translatePage();
    }
  }

  // Initialize when DOM is ready
  async function tryInitialize() {
    console.log('tryInitialize called, initialized:', initialized, 'affiliateName element:', document.getElementById('affiliateName'));
    if (!initialized && document.getElementById('affiliateName')) {
      initialized = true;
      
      // Initialize i18n first
      if (window.i18n) {
        await window.i18n.init({
          debugMode: false
        });
        
        // Create language switcher
        if (window.LanguageSwitcher) {
          window.LanguageSwitcher.createSwitcher('language-switcher-container', {
            style: 'dropdown',
            showLabel: true
          });
        }
        
        // Update affiliate name parameters when language changes
        window.addEventListener('languageChanged', function() {
          updateAffiliateNameParameters();
        });
      }
      
      // Then initialize the landing page
      initializeLandingPage();
      
      // Update affiliate name parameters after a delay
      setTimeout(updateAffiliateNameParameters, 1000);
    }
  }

  // Log script loading
  console.log('affiliate-landing-init.js loaded, document.readyState:', document.readyState);

  // For normal page load
  if (document.readyState === 'loading') {
    console.log('Adding DOMContentLoaded listener');
    document.addEventListener('DOMContentLoaded', tryInitialize);
  } else {
    console.log('DOM already loaded, trying to initialize');
    tryInitialize();
  }

  // For dynamic loading in embed-app-v2.html
  console.log('Starting interval check for affiliateName element');
  const checkInterval = setInterval(function() {
    if (document.getElementById('affiliateName')) {
      console.log('affiliateName element found via interval check');
      clearInterval(checkInterval);
      tryInitialize();
    }
  }, 100);

  // Clear interval after 5 seconds to prevent infinite checking
  setTimeout(() => {
    console.log('Clearing interval check after 5 seconds');
    clearInterval(checkInterval);
  }, 5000);
})();