/* wm-image-config.js
 *
 * Centralized image-base configuration.
 *
 * The site is deliberately INDEPENDENT of wavemaxlaundry.com for everything
 * except per-franchise location imagery (the photos under
 * /wp-content/uploads/locations/{slug}/...). Those photos are still sourced
 * from the legacy WordPress host because that is currently the canonical
 * location-data store. When an authoritative replacement is wired up
 * (S3 / our own CDN / rundberglaundry.com upload pipeline), flipping every image
 * URL on the site is a one-line edit here.
 *
 * Usage from any other client script:
 *   const url = window.WM_LOCATION_IMAGE_BASE + '/austin-tx/hero-3.jpg';
 *
 * Usage in HTML (data attribute pattern):
 *   <img data-wm-location-image="austin-tx/hero-3.jpg" alt="...">
 *   ...and the small auto-resolver below rewrites src on DOMContentLoaded.
 *
 * Brand assets (favicons, the brand logo, anything not tied to a
 * specific franchise location) are served from /assets/images/brand/ and
 * are NOT controlled by this config — they live in the repo and never
 * touch wavemaxlaundry.com.
 */
(function () {
  'use strict';

  // === The single switch ===
  // Per-franchise photos are now served from this origin's local mirror at
  // /assets/images/locations/{slug}/{file}. To repoint at a CDN later
  // (or back to a corporate origin), change this one line. The companion
  // build script `scripts/franchise-build/mirror-location-images.js`
  // refreshes the mirror from whatever upstream is currently authoritative.
  window.WM_LOCATION_IMAGE_BASE = '/assets/images/locations';

  // Brand assets live in-repo. Exposed for symmetry so any consumer can
  // build URLs without hard-coding the path.
  window.WM_BRAND_IMAGE_BASE = '/assets/images/brand';

  /**
   * Resolve a per-location image filename to a full URL.
   *   wmLocationImage('austin-tx/hero-3.jpg')
   *     -> 'https://wavemaxlaundry.com/wp-content/uploads/locations/austin-tx/hero-3.jpg'
   * Strips a leading slash if passed.
   */
  window.wmLocationImage = function (path) {
    if (!path) return '';
    const clean = String(path).replace(/^\/+/, '');
    return window.WM_LOCATION_IMAGE_BASE + '/' + clean;
  };

  /**
   * Auto-resolver for declarative use in HTML:
   *   <img data-wm-location-image="kent-wa/hero-3.jpg" alt="...">
   * On DOMContentLoaded, every matching element gets its `src` set to the
   * resolved URL. Re-running on dynamically-added elements is the caller's
   * responsibility (call window.wmResolveLocationImages(root) after injecting).
   */
  window.wmResolveLocationImages = function (root) {
    const scope = root || document;
    scope.querySelectorAll('[data-wm-location-image]').forEach(function (el) {
      const path = el.getAttribute('data-wm-location-image');
      if (!path) return;
      const url = window.wmLocationImage(path);
      if (el.tagName === 'IMG') {
        el.src = url;
      } else {
        el.style.backgroundImage = "url('" + url + "')";
      }
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { window.wmResolveLocationImages(); });
  } else {
    window.wmResolveLocationImages();
  }
})();
