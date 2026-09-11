// Deploy-stable asset version for client-side cache-busting.
//
// WHY THIS EXISTS: the SPA loader used to append '?v=' + Date.now() to every
// page script, stylesheet and locale bundle it injected. That made every URL
// unique per page load, which threw away the year-long
// `public, max-age=31536000, immutable` header those files already ship --
// nothing was ever served from the browser cache or the Cloudflare edge, on
// every visit including repeats. Combined with a strictly serial loader it cost
// ~8 sequential origin round trips per page load.
//
// The contract is: STABLE within a deploy (so everything caches) and CHANGED by
// a deploy (so nothing goes stale). A clock satisfies the second and destroys
// the first; this constant satisfies both.
//
// BUMP THIS when you change any file the SPA injects at runtime -- the page
// scripts and stylesheets in embed-app-v2.js's pageScripts/pageStyles maps, or
// public/locales/*/common.json. This is the same ritual as the hand-bumped
// `?v=` tokens in the HTML (e.g. embed-app-v2.min.js?v=20260824a) and the
// ASSET_VERSION constant in server/modules/bags/labelSheetService.js; the
// difference is that one bump here now covers every runtime-injected asset
// instead of needing a separate edit per file.
//
// ASSET_VERSION in the environment overrides it, so a deploy can force a bust
// without a code change if one is ever needed.

const ASSET_VERSION = process.env.ASSET_VERSION || '20260911b';

module.exports = { ASSET_VERSION };
