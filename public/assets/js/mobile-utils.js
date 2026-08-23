/**
 * Mobile Utilities
 * Provides mobile detection, viewport management, and touch handling utilities
 * Used across all Laundromat embed pages for consistent mobile experience
 */

(function(window) {
  'use strict';

  // Constants
  const MOBILE_BREAKPOINT = 768;
  const TABLET_BREAKPOINT = 1024;
  const SMALL_MOBILE_BREAKPOINT = 375;

  // Mobile detection regex patterns
  const MOBILE_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  const TABLET_REGEX = /iPad|Android(?!.*Mobile)|Tablet/i;
  const IOS_REGEX = /iPhone|iPad|iPod/i;
  const ANDROID_REGEX = /Android/i;

  // Create the MobileUtils object
  const MobileUtils = {
    // Cache for performance
    _cache: {
      viewport: null,
      userAgent: null,
      lastCheck: 0
    },

    // Cache timeout (5 seconds)
    CACHE_TIMEOUT: 5000,

    /**
         * Get comprehensive viewport information
         */
    getViewportInfo() {
      const now = Date.now();
      if (this._cache.viewport && (now - this._cache.lastCheck) < this.CACHE_TIMEOUT) {
        return this._cache.viewport;
      }

      const width = window.innerWidth;
      const height = window.innerHeight;
      const info = {
        width: width,
        height: height,
        isMobile: width < MOBILE_BREAKPOINT,
        isTablet: width >= MOBILE_BREAKPOINT && width < TABLET_BREAKPOINT,
        isDesktop: width >= TABLET_BREAKPOINT,
        isSmallMobile: width < SMALL_MOBILE_BREAKPOINT,
        orientation: width > height ? 'landscape' : 'portrait',
        hasTouch: this.hasTouch(),
        pixelRatio: window.devicePixelRatio || 1,
        viewportHeight: height,
        safeAreaTop: this.getSafeAreaInset('top'),
        safeAreaBottom: this.getSafeAreaInset('bottom')
      };

      this._cache.viewport = info;
      this._cache.lastCheck = now;
      return info;
    },

    /**
         * Detect device type from user agent
         */
    getDeviceInfo() {
      if (this._cache.userAgent) {
        return this._cache.userAgent;
      }

      const ua = navigator.userAgent;
      const info = {
        isMobile: MOBILE_REGEX.test(ua),
        isTablet: TABLET_REGEX.test(ua),
        isIOS: IOS_REGEX.test(ua),
        isAndroid: ANDROID_REGEX.test(ua),
        isSafari: /Safari/i.test(ua) && !/Chrome/i.test(ua),
        isChrome: /Chrome/i.test(ua),
        isFirefox: /Firefox/i.test(ua),
        isEdge: /Edge/i.test(ua),
        userAgent: ua
      };

      this._cache.userAgent = info;
      return info;
    },

    /**
         * Check if device has touch capability
         */
    hasTouch() {
      return 'ontouchstart' in window ||
                   navigator.maxTouchPoints > 0 ||
                   navigator.msMaxTouchPoints > 0;
    },

    /**
         * Get safe area insets for devices with notches
         */
    getSafeAreaInset(position) {
      const root = document.documentElement;
      const style = getComputedStyle(root);
      const value = style.getPropertyValue(`--safe-area-inset-${position}`);
      return parseInt(value) || 0;
    },

    /**
         * Check if device is in landscape orientation
         */
    isLandscape() {
      return window.innerWidth > window.innerHeight;
    },

    /**
         * Check if device is in portrait orientation
         */
    isPortrait() {
      return window.innerHeight > window.innerWidth;
    },

    /**
         * Add mobile-specific CSS classes to body
         */
    addBodyClasses() {
      const body = document.body;
      const viewport = this.getViewportInfo();
      const device = this.getDeviceInfo();

      // Remove all classes first
      body.classList.remove('mobile', 'tablet', 'desktop', 'small-mobile',
        'landscape', 'portrait', 'touch', 'no-touch',
        'ios', 'android', 'safari', 'chrome');

      // Add viewport classes
      if (viewport.isMobile) body.classList.add('mobile');
      if (viewport.isTablet) body.classList.add('tablet');
      if (viewport.isDesktop) body.classList.add('desktop');
      if (viewport.isSmallMobile) body.classList.add('small-mobile');

      // Add orientation classes
      body.classList.add(viewport.orientation);

      // Add touch classes
      body.classList.add(viewport.hasTouch ? 'touch' : 'no-touch');

      // Add device classes
      if (device.isIOS) body.classList.add('ios');
      if (device.isAndroid) body.classList.add('android');
      if (device.isSafari) body.classList.add('safari');
      if (device.isChrome) body.classList.add('chrome');
    },

    /**
         * Handle viewport changes
         */
    onViewportChange(callback) {
      let lastWidth = window.innerWidth;
      let lastHeight = window.innerHeight;

      const handler = () => {
        const newWidth = window.innerWidth;
        const newHeight = window.innerHeight;

        if (newWidth !== lastWidth || newHeight !== lastHeight) {
          lastWidth = newWidth;
          lastHeight = newHeight;
          this._cache.viewport = null; // Clear cache
          this.addBodyClasses();
          callback(this.getViewportInfo());
        }
      };

      window.addEventListener('resize', handler);
      window.addEventListener('orientationchange', handler);

      // Return cleanup function
      return () => {
        window.removeEventListener('resize', handler);
        window.removeEventListener('orientationchange', handler);
      };
    },

    /**
         * Prevent zoom on input focus (iOS)
         */
    preventZoomOnFocus() {
      if (!this.getDeviceInfo().isIOS) return;

      const viewport = document.querySelector('meta[name="viewport"]');
      if (!viewport) return;

      const originalContent = viewport.getAttribute('content');
      const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="password"], input[type="tel"], input[type="number"], textarea, select');

      inputs.forEach(input => {
        input.addEventListener('focus', () => {
          viewport.setAttribute('content', originalContent + ', maximum-scale=1.0');
        });

        input.addEventListener('blur', () => {
          viewport.setAttribute('content', originalContent);
        });
      });
    },

    /**
         * Add smooth scroll behavior with iOS fixes
         */
    smoothScroll(target, offset = 0) {
      const element = typeof target === 'string' ? document.querySelector(target) : target;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const targetY = rect.top + scrollTop - offset;

      // Use native smooth scroll if available
      if ('scrollBehavior' in document.documentElement.style) {
        window.scrollTo({
          top: targetY,
          behavior: 'smooth'
        });
      } else {
        // Fallback for older browsers
        this.animateScroll(targetY);
      }
    },

    /**
         * Animate scroll for browsers without native smooth scroll
         */
    animateScroll(targetY) {
      const startY = window.pageYOffset;
      const distance = targetY - startY;
      const duration = 500;
      let start = null;

      const step = (timestamp) => {
        if (!start) start = timestamp;
        const progress = Math.min((timestamp - start) / duration, 1);
        const easeProgress = 0.5 - Math.cos(progress * Math.PI) / 2;
        window.scrollTo(0, startY + distance * easeProgress);

        if (progress < 1) {
          window.requestAnimationFrame(step);
        }
      };

      window.requestAnimationFrame(step);
    },

    /**
         * Handle safe area padding for iPhones with notch
         */
    applySafeAreaPadding() {
      const viewport = this.getViewportInfo();
      if (viewport.safeAreaTop > 0 || viewport.safeAreaBottom > 0) {
        document.documentElement.style.setProperty('--safe-padding-top', `${viewport.safeAreaTop}px`);
        document.documentElement.style.setProperty('--safe-padding-bottom', `${viewport.safeAreaBottom}px`);
      }
    },

    /**
         * Create mobile-friendly touch handlers
         */
    addSwipeHandler(element, callbacks) {
      let startX = 0;
      let startY = 0;
      let distX = 0;
      let distY = 0;
      const threshold = 50;
      const restraint = 100;
      const allowedTime = 300;
      let startTime = 0;

      element.addEventListener('touchstart', (e) => {
        const touch = e.changedTouches[0];
        startX = touch.pageX;
        startY = touch.pageY;
        startTime = new Date().getTime();
      }, { passive: true });

      element.addEventListener('touchend', (e) => {
        const touch = e.changedTouches[0];
        distX = touch.pageX - startX;
        distY = touch.pageY - startY;
        const elapsedTime = new Date().getTime() - startTime;

        if (elapsedTime <= allowedTime) {
          if (Math.abs(distX) >= threshold && Math.abs(distY) <= restraint) {
            if (distX > 0 && callbacks.onSwipeRight) {
              callbacks.onSwipeRight();
            } else if (distX < 0 && callbacks.onSwipeLeft) {
              callbacks.onSwipeLeft();
            }
          } else if (Math.abs(distY) >= threshold && Math.abs(distX) <= restraint) {
            if (distY > 0 && callbacks.onSwipeDown) {
              callbacks.onSwipeDown();
            } else if (distY < 0 && callbacks.onSwipeUp) {
              callbacks.onSwipeUp();
            }
          }
        }
      }, { passive: true });
    },

    /**
         * Initialize mobile utilities
         */
    init() {
      // Add body classes on load
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          this.addBodyClasses();
          this.applySafeAreaPadding();
          this.preventZoomOnFocus();
        });
      } else {
        this.addBodyClasses();
        this.applySafeAreaPadding();
        this.preventZoomOnFocus();
      }

      // Update on viewport changes
      this.onViewportChange(() => {
        this.applySafeAreaPadding();
      });
    }
  };

  // Auto-initialize
  MobileUtils.init();

  // Export to window
  window.MobileUtils = MobileUtils;

})(window);