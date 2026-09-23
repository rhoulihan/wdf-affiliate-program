// Embed Navigation Handler
// This external script handles navigation for embedded pages without inline event handlers

(function() {
  'use strict';

  // Configuration
  const BASE_URL = window.location.origin;
  const EMBED_SUFFIX = '';

  // Navigation function for embedded context
  window.navigateToPage = function(route) {
    // Check if navigateTo function exists (from embed-app-v2.js)
    if (window.navigateTo && typeof window.navigateTo === 'function') {
      console.log('[Embed Navigation] Using navigateTo directly:', route);
      window.navigateTo(route);
    } else if (window.parent !== window) {
      // If in iframe, use postMessage to navigate
      window.parent.postMessage({
        type: 'navigate',
        route: route
      }, '*');
    } else {
      // If not in iframe, navigate directly
      window.location.href = route;
    }
  };

  // Handle messages from parent window
  function handleParentMessage(event) {
    console.log('[Embed Navigation] Message received:', event.data);

    // Security: same-origin only. server.js sets `frame-ancestors 'self'`, so the
    // only page that can ever frame this app is the app itself — deriving the
    // trusted origin from the document keeps this check in step with the CSP
    // instead of duplicating it as a literal list that can drift from it.
    //
    // This replaced a hardcoded allowlist that named two retired third-party
    // domains plus a bare loopback host, matched by string prefix. A prefix
    // match is not an origin match: any host that merely BEGINS with an allowed
    // origin satisfies it, so an attacker-controlled subdomain of a lookalike
    // domain passed. Exact equality is the only correct comparison here.
    // Guarded by tests/unit/embedNavigationOrigin.test.js.
    if (event.origin !== window.location.origin) {
      console.log('[Embed Navigation] Message rejected - untrusted origin:', event.origin);
      return;
    }

    if (!event.data || !event.data.type) return;

    switch (event.data.type) {
    case 'viewport-info':
      console.log('[Embed Navigation] Viewport info received:', event.data.data);
      // Handle viewport info
      if (event.data.data) {
        const viewportData = event.data.data;

        // Store viewport info for later use
        window.viewportInfo = viewportData;

        // If language is included, apply it
        if (viewportData.language && window.i18n) {
          console.log('[Embed Navigation] Setting language from viewport info:', viewportData.language);
          window.i18n.setLanguage(viewportData.language);
        }

        // Handle mobile/desktop view adjustments
        if (viewportData.isMobile || viewportData.isTablet) {
          document.body.classList.add('is-mobile-view');
          if (viewportData.isTablet) {
            document.body.classList.add('is-tablet-view');
          }
          
          // Request chrome hiding on mobile/tablet
          if (window.parent !== window) {
            window.parent.postMessage({
              type: 'manage-chrome',
              data: {
                hideChrome: true,
                isMobile: viewportData.isMobile,
                isTablet: viewportData.isTablet,
                width: viewportData.width,
                height: viewportData.height
              }
            }, '*');
          }
        } else {
          document.body.classList.remove('is-mobile-view', 'is-tablet-view');
          
          // Request chrome showing on desktop
          if (window.parent !== window) {
            window.parent.postMessage({
              type: 'manage-chrome',
              data: {
                hideChrome: false,
                isMobile: false,
                isTablet: false,
                width: viewportData.width,
                height: viewportData.height
              }
            }, '*');
          }
        }
      }
      break;

    case 'language-change':
      console.log('[Embed Navigation] Language change received:', event.data.data);
      if (event.data.data && event.data.data.language && window.i18n) {
        console.log('[Embed Navigation] Applying language change:', event.data.data.language);
        window.i18n.setLanguage(event.data.data.language);
      }
      break;

    case 'chrome-hidden':
      console.log('[Embed Navigation] Chrome hidden status:', event.data.data);
      if (event.data.data && event.data.data.hidden) {
        document.body.classList.add('parent-chrome-hidden');
      } else {
        document.body.classList.remove('parent-chrome-hidden');
      }
      break;

    default:
      console.log('[Embed Navigation] Unknown message type:', event.data.type);
    }
  }

  // Initialize when DOM is ready
  function init() {
    console.log('Embed navigation initialized');

    // Set up message listener for parent communication
    window.addEventListener('message', handleParentMessage);

    // Handle all navigation links with data-navigate attribute
    document.addEventListener('click', function(e) {
      const navLink = e.target.closest('[data-navigate]');
      if (navLink) {
        e.preventDefault();
        const route = navLink.getAttribute('data-navigate');
        console.log('Navigation clicked:', route);
        navigateToPage(route);
      }
    });

    // Handle links with href="#" and data-href for navigation
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a[data-href]');
      if (link) {
        e.preventDefault();
        const href = link.getAttribute('data-href');
        if (href.startsWith('/')) {
          const route = href.replace('.html', '').replace('-embed', '');
          navigateToPage(route);
        } else {
          // External link
          window.open(href, '_blank', 'noopener,noreferrer');
        }
      }
    });

    // Update existing links to use data attributes
    const links = document.querySelectorAll('a[href^="/"]');
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && !link.hasAttribute('data-navigate') && !link.hasAttribute('data-href')) {
        // Convert onclick links to data-navigate
        const onclick = link.getAttribute('onclick');
        if (onclick && onclick.includes('navigateToPage')) {
          const match = onclick.match(/navigateToPage\(['"]([^'"]+)['"]\)/);
          if (match) {
            link.setAttribute('data-navigate', match[1]);
            link.removeAttribute('onclick');
          }
        } else {
          // Regular links
          link.setAttribute('data-href', href);
          link.setAttribute('href', '#');
        }
      }
    });

    // Add UTM tracking for affiliate links
    const affiliateLinks = document.querySelectorAll('[data-navigate*="affiliate"], [data-href*="affiliate"]');
    affiliateLinks.forEach(link => {
      link.setAttribute('data-utm-source', 'wavemaxlaundry.com');
      link.setAttribute('data-utm-medium', 'embedded');
      link.setAttribute('data-utm-campaign', 'austin-affiliate');
    });

    // Handle iframe resizing
    if (window.parent !== window) {
      let lastSentHeight = 0;  // Track the last height we actually sent to parent
      let heightTimeout = null;

      function sendHeight(force = false) {
        // Get all possible height values
        const heights = [
          document.body.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.clientHeight,
          document.documentElement.scrollHeight,
          document.documentElement.offsetHeight,
          document.body.clientHeight
        ];
        
        // For shrinking content, we need the actual content height, not the viewport
        // Remove any artificial minimums to allow proper shrinking
        const height = Math.max(...heights.filter(h => h > 0));

        // Only send if height has changed by more than 5px (increase or decrease)
        // Lower threshold for better responsiveness
        const heightDifference = Math.abs(height - lastSentHeight);

        if (force || heightDifference > 5) {
          // Clear any pending timeout
          if (heightTimeout) {
            clearTimeout(heightTimeout);
          }

          // Shorter debounce for more responsive resizing
          heightTimeout = setTimeout(() => {
            console.log(`[Resize] Height changed from ${lastSentHeight} to ${height} (diff: ${height - lastSentHeight}px)`);
            lastSentHeight = height;  // Update last sent height

            window.parent.postMessage({
              type: 'resize',
              data: { 
                height: height,
                timestamp: Date.now() // Add timestamp for debugging
              }
            }, '*');
          }, 100); // 100ms debounce (reduced from 200ms)
        }
      }

      // Expose sendHeight function globally for manual control
      window.embedNavigation = window.embedNavigation || {};
      window.embedNavigation.sendHeight = sendHeight;

      // Check if auto-resize is disabled
      const autoResizeDisabled = document.body.hasAttribute('data-disable-auto-resize');
      let resizeObserver = null; // Define at function scope
      let mutationObserver = null; // Define at function scope

      if (!autoResizeDisabled) {
        // Send initial height (force to ensure it's sent)
        sendHeight(true);

        // Monitor for changes
        resizeObserver = new ResizeObserver(() => {
          sendHeight();
        });
        resizeObserver.observe(document.body);
        
        // Also observe documentElement for more comprehensive monitoring
        resizeObserver.observe(document.documentElement);

        // Also send height on window resize
        window.addEventListener('resize', () => sendHeight());

        // Send height after images load (force to ensure proper height)
        window.addEventListener('load', () => sendHeight(true));
        
        // Monitor for DOM changes that might affect height
        mutationObserver = new MutationObserver(() => {
          // Check for display changes that affect layout
          sendHeight();
        });
        
        // Watch for style and class changes that might hide/show content
        mutationObserver.observe(document.body, {
          attributes: true,
          attributeFilter: ['style', 'class'],
          childList: true,
          subtree: true
        });
        
        // Listen for custom height update events
        window.addEventListener('content-changed', () => sendHeight(true));
        window.addEventListener('section-toggled', () => sendHeight(true));
      } else {
        console.log('[Embed Navigation] Auto-resize disabled, manual resize control enabled');
        // Still send initial height once (force)
        sendHeight(true);
      }

      // Clean up function
      const cleanupObservers = function() {
        if (resizeObserver) {
          resizeObserver.disconnect();
        }
        if (mutationObserver) {
          mutationObserver.disconnect();
        }
        if (heightTimeout) {
          clearTimeout(heightTimeout);
        }
      };

      // Clean up on page unload
      window.addEventListener('beforeunload', cleanupObservers);

      // Also clean up on custom events
      window.addEventListener('page-cleanup', cleanupObservers);
      window.addEventListener('disconnect-observers', cleanupObservers);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();