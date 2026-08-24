// Laundromat Affiliate Program
// Main Server Entry Point

require('dotenv').config();
const { errorHandler } = require('./server/middleware/errorHandler');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
// Rate limiting is now handled by centralized middleware
const compression = require('compression');

// Import middleware
const { mongoSanitize, sanitizeRequest } = require('./server/middleware/sanitization');
const { conditionalCsrf, csrfTokenEndpoint } = require('./server/config/csrf-config');

// Import routes
const authRoutes = require('./server/routes/authRoutes');
const affiliateRoutes = require('./server/routes/affiliateRoutes');
const customerRoutes = require('./server/routes/customerRoutes');
const orderRoutes = require('./server/routes/orderRoutes');
const administratorRoutes = require('./server/routes/administratorRoutes');
const adminIpGate = require('./server/middleware/adminIpGate');
const operatorIpGate = require('./server/middleware/operatorIpGate');
const operatorRoutes = require('./server/routes/operatorRoutes');
const monitoringRoutes = require('./server/routes/monitoringRoutes');
const systemConfigRoutes = require('./server/routes/systemConfigRoutes');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

const logger = require('./server/utils/logger');
const brand = require('./server/config/brand');

// Fail-fast secret validation (production only): a missing/short secret must
// surface at boot, not silently fall back to a dev-default HMAC (session /
// preview-unlock cookies) or blow up on the first AES-256-GCM encrypt.
if (process.env.NODE_ENV === 'production') {
  const { validateRequiredSecrets } = require('./server/utils/validateSecrets');
  const secretProblems = validateRequiredSecrets();
  if (secretProblems.length) {
    logger.error('FATAL: missing or invalid required secrets at boot', { problems: secretProblems });
    process.exit(1);
  }
}

const MongoStore = require('connect-mongo');

// Oracle ADB MongoDB-API resilience: transparently retry the intermittent
// "BSON element cursor is missing" error on findOne (degraded long-lived
// pooled connections). Patches the shared mongodb driver Collection prototype,
// so it covers BOTH the mongoose pool and connect-mongo's own session-store
// pool. Must run before any DB use. See server/utils/mongoCursorRetry.js.
const { installCursorRetry } = require('./server/utils/mongoCursorRetry');
installCursorRetry({ logger });

app.set('trust proxy', 1);

// Update logging statements
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION:', { error: err.message, stack: err.stack });
  process.exit(1);
});

app.use((req, res, next) => {
  // Redact short-lived tokens that ride in the query string so they never land
  // in debug logs: ?t= (label tokens) and ?k= (expediter / explorer display tokens).
  const safeUrl = req.url.replace(/([?&](?:t|k)=)[^&]+/g, '$1<redacted>');
  logger.debug(`${req.method} ${safeUrl}`);
  next();
});

// Define MongoDB connection options
const mongoOptions = {
  // Do NOT auto-build schema indexes on connect. The Oracle Autonomous DB
  // MongoDB API rejects geospatial and TTL index builds, so an autoIndex
  // pass could throw at startup. Indexes are managed explicitly (the
  // migration creates the Oracle-compatible set). Disabling autoIndex is
  // also standard practice for production regardless of backend.
  autoIndex: false,
  // Cap the pool — this app is lightweight and does NOT need many connections.
  // The driver default maxPoolSize is 100; across cluster workers and multiple
  // hosts that floods the Oracle ADB's connection capacity, and on a connection
  // reset (e.g. an ADB ACL change) it becomes a storm of failed re-auths
  // (ORA-03113 ~170/min until a pool refresh). A small steady pool is plenty.
  maxPoolSize: 5,
  minPoolSize: 2,
  // No maxIdleTimeMS: keep pooled connections alive and REUSED. Oracle's command
  // logs (2026-05-23) showed the app reconstructs connections far too often (poor
  // pooling — ~1 hello+saslStart handshake per few queries); idle-churning made it
  // worse, so we let the driver maintain a steady-state pool instead.
  // Emit command-monitoring events so the Oracle-cursor diagnostics can capture
  // the exact malformed find/getMore replies (missing the cursor envelope) for
  // the Oracle support case. Disable with ORACLE_DIAG=false once we have enough.
  monitorCommands: process.env.ORACLE_DIAG !== 'false',
  // TLS enforced everywhere except local dev. Set MONGODB_TLS=false to
  // disable (e.g. plain local mongod that doesn't speak TLS).
  ...(process.env.MONGODB_TLS === 'false'
    ? {}
    : {
      tls: true,
      tlsAllowInvalidCertificates: process.env.NODE_ENV !== 'production'
    })
};

// Connect to MongoDB with consistent options (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  mongoose.connect(process.env.MONGODB_URI, mongoOptions)
    .then(async () => {
      logger.info('Connected to MongoDB');

      // Oracle ADB cursor-error diagnostics capture (for the Oracle support case).
      // Records each malformed find/getMore reply (missing the cursor envelope) to
      // logs/oracle-cursor-diagnostics.log with the command shape, backend node, and
      // connection age. Read-only, PII-free. Disable with ORACLE_DIAG=false.
      if (process.env.ORACLE_DIAG !== 'false') {
        try {
          const { installOracleDiagnostics, fileWriter } = require('./server/utils/mongoOracleDiagnostics');
          const write = fileWriter(path.join(__dirname, 'logs', 'oracle-cursor-diagnostics.log'));
          installOracleDiagnostics({ client: mongoose.connection.getClient(), label: 'mongoose', write, logger });
          // connect-mongo runs its own MongoClient (connect-mongo 5 exposes it as
          // `clientP`, a Promise<MongoClient>). 100% of observed cursor errors are on
          // its sessions.findOne, so this is the attach that actually matters.
          if (sessionStore && sessionStore.clientP) {
            Promise.resolve(sessionStore.clientP)
              .then((cm) => { if (cm && typeof cm.on === 'function') installOracleDiagnostics({ client: cm, label: 'connect-mongo', write, logger }); })
              .catch((e) => logger.error('Oracle diagnostics (connect-mongo) attach failed:', e.message));
          }
        } catch (e) { logger.error('Oracle diagnostics init failed:', e.message); }
      }

      // Warm the access-gate whitelist/password cache + start periodic refresh.
      const gate = require('./server/middleware/accessGate');
      gate.loadCache().then(() => gate.startCacheRefresh())
        .catch((e) => logger.error('Access gate cache init failed:', e.message));

      // Initialize system configuration defaults
      try {
        const SystemConfig = require('./server/models/SystemConfig');
        await SystemConfig.initializeDefaults();
        logger.info('System configuration defaults initialized');
      } catch (error) {
        logger.error('Error initializing system config:', { error: error.message });
      }

      // Seed the add-on catalog defaults (idempotent, non-clobbering).
      try {
        const AddOn = require('./server/models/AddOn');
        await AddOn.initializeDefaults();
        logger.info('Add-on catalog defaults initialized');
      } catch (error) {
        logger.error('Error initializing add-on catalog:', { error: error.message });
      }

      // Initialize default accounts (admin and operator)
      try {
        const { initializeDefaults } = require('./init-defaults');
        await initializeDefaults();
      } catch (error) {
        logger.error('Error initializing default accounts:', { error: error.message });
      }

    })
    .catch(err => {
      logger.error('MongoDB connection error:', { error: err.message });
      process.exit(1);
    });
}

// Middleware
// HTTPS redirect in production with host validation
if (process.env.NODE_ENV === 'production') {
  // Define allowed hosts
  const allowedHosts = [
    'rundberglaundry.com',
    'www.rundberglaundry.com',
    'portal.atxwashdryfold.com', // canonical portal host (migration target)
    'wavemax.promo',          // transition: still 301s during retirement
    'www.wavemax.promo',
    'affiliate.wavemax.promo',
    'localhost:3000' // For development if needed
  ];

  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      const host = req.header('host');

      // Validate host header against whitelist
      if (host && allowedHosts.includes(host.toLowerCase())) {
        res.redirect(`https://${host}${req.url}`);
      } else {
        // Use default domain if host is invalid
        res.redirect(`https://rundberglaundry.com${req.url}`);
      }
    } else {
      next();
    }
  });
}

// Canonical-host retirement: 301 the old promo hosts to the portal host,
// preserving path + query. Wired unconditionally (not env-gated) so it is
// exercisable in every environment; it only acts on the retired hosts, which are
// never used in dev/test, so all other traffic passes straight through. Runs
// after the production HTTPS-upgrade block, which keeps the retired hosts in
// `allowedHosts` so an http→https upgrade still lands here rather than defaulting.
const RETIRED_HOSTS = new Set(['wavemax.promo', 'www.wavemax.promo', 'affiliate.wavemax.promo']);
app.use((req, res, next) => {
  const host = (req.header('host') || '').toLowerCase();
  if (RETIRED_HOSTS.has(host)) {
    return res.redirect(301, `https://portal.atxwashdryfold.com${req.originalUrl}`);
  }
  next();
});

// CSP Nonce Middleware - must come before helmet
const cspNonceMiddleware = require('./server/middleware/cspNonce');
app.use(cspNonceMiddleware);

// Security headers with iframe embedding support
app.use(helmet({
  // Disable helmet's CSP - we'll implement it manually to support nonces
  contentSecurityPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  xssFilter: true,
  noSniff: true,
  // 'strict-origin-when-cross-origin' is the modern default — sends full
  // URL on same-origin, origin only on cross-origin HTTPS→HTTPS, nothing
  // on HTTPS→HTTP downgrade. Tighter than the previous 'same-origin' which
  // sent full URL (including query) to internal log sinks on same-origin
  // navigation. APP-002 / prod-lockdown-2026-05-20.
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // Remove frameguard to use CSP frame-ancestors instead
  frameguard: false,
  // Additional security headers
  permittedCrossDomainPolicies: false,
  hidePoweredBy: true,
  ieNoOpen: true,
  dnsPrefetchControl: { allow: false }
}));

// Add custom security headers not covered by helmet
app.use((req, res, next) => {
  // Permissions Policy (previously Feature Policy)
  res.setHeader('Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()'
  );

  // X-Permitted-Cross-Domain-Policies
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  // X-Frame-Options — belt-and-suspenders alongside the CSP
  // frame-ancestors directive (modern browsers honor frame-ancestors and
  // ignore XFO, but XFO catches older browsers + legacy security
  // scanners and observability tools that grade this control literally).
  // SAMEORIGIN matches the CSP frame-ancestors allowlist semantics for
  // the routes that aren't explicitly listed by the franchisor for
  // embedding (wavemaxlaundry.com is already whitelisted via the CSP
  // frame-ancestors directive, which a browser will prefer over XFO).
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Cross-Origin-Opener-Policy. 'same-origin-allow-popups' keeps
  // opener-isolation against reverse window.opener abuse from cross-origin
  // CHILD pages while still allowing same-origin popups to retain a
  // reference. APP-003 / prod-lockdown-2026-05-20. (OAuth popup flow was
  // removed; this MAY be tightened to 'same-origin' in a follow-up.)
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  // Clear-Site-Data header for logout endpoints
  if (req.path.includes('/logout')) {
    res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
  }

  // Override CORS and resource policy for parent bridge script. Franchise
  // host pages on wavemaxlaundry.com (or any other parent domain) load
  // the bridge from rundberglaundry.com and need cross-origin permission.
  if (req.path === '/assets/js/parent-iframe-bridge-v3.js') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }

  // Allow public static assets (images, CSS, JS, fonts, locales) to be
  // embedded by pages on other origins. LOCATION_DATA holds absolute URLs
  // pointing at rundberglaundry.com's /assets/ tree; without this the per-
  // location domains (atxwashateria.com, etc.) fail with
  // ERR_BLOCKED_BY_RESPONSE.NotSameOrigin even when the request itself
  // returns 200. Helmet's default Cross-Origin-Resource-Policy is
  // 'same-origin' so we override here for the asset path tree.
  if (req.path.startsWith('/assets/') || req.path.startsWith('/locales/')) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }

  next();
});

// Manual CSP implementation with nonce support
app.use((req, res, next) => {
  const nonce = res.locals.cspNonce;

  // Check if this is a migrated page that should use strict CSP
  const strictCSPPages = [
    '/terms-and-conditions-embed.html',
    '/privacy-policy.html',
    '/operator-scan-embed.html',
    '/affiliate-success-embed.html',
    '/affiliate-landing-embed.html',
    '/embed-landing.html',
    '/embed-app-v2.html',
    '/admin',
    '/operator',
    '/operator-login-embed.html',
    '/affiliate-register-embed.html',
    '/affiliate-login-embed.html',
    '/affiliate-dashboard-embed.html',
    '/customer-login-embed.html',
    '/customer-dashboard-embed.html',
    '/forgot-password-embed.html',
    '/reset-password-embed.html',
    '/site-page-content-only.html',
    // Austin franchisee content surfaces — embed pages have zero inline
    // executable scripts after the 2026-05-20 sweep that converted the
    // off-screen `style="position:absolute…"` attrs to .wm-sr-only.
    '/austin-landing-v3-embed.html',
    '/contact-embed.html',
    '/wash-dry-fold-embed.html',
    '/self-serve-laundry-embed.html',
    '/commercial-embed.html',
    '/about-us-embed.html'
  ];

  // Apply strict CSP to documentation pages as well (but not examples)
  const isDocumentationPage = req.path.startsWith('/docs/') &&
                             req.path.endsWith('.html') &&
                             !req.path.includes('/examples/');

  // Apply strict CSP to franchise-host renders (/<slug>/ and
  // /<slug>/<page> routes served by franchiseController). Enabled
  // 2026-05-20 after the SEC L-1/L-2 sweep replaced inline-style
  // mutations in austin-host-mock.js (modal scroll lock + search
  // filter) and corporate-locations-modal.js with the .wm-noscroll /
  // .wm-hidden class-toggle utilities. The controller's
  // FRANCHISE_DATA_INJECTION inline script already carries the
  // per-request nonce. Pattern: single-segment slug or slug + page,
  // lowercase + digits + hyphens, no dots (i.e. not a static-file
  // request like .html or .js).
  const isFranchiseHostPage = /^\/[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)?\/?$/.test(req.path)
                              && !req.path.startsWith('/api/')
                              && !req.path.startsWith('/assets/')
                              && !req.path.startsWith('/locales/')
                              && !req.path.startsWith('/docs/')
                              && !req.path.startsWith('/dev/');

  const useStrictCSP = strictCSPPages.includes(req.path) || isDocumentationPage || isFranchiseHostPage;

  // /wavemax/clickjacking-demo.html — the educational clickjacking demonstration
  // page on crhsent.com. Its sole purpose is to load the franchisor's headerless
  // wavemaxlaundry.com pages in an iframe (the entire point of the demo is to
  // show that exactly this works because the franchisor's site doesn't set
  // X-Frame-Options / CSP frame-ancestors). Standard frame-src doesn't include
  // those origins; adding them here for this one route, not globally, keeps the
  // strict frame-src on every other page intact.
  const isClickjackingDemo = req.path === '/wavemax/clickjacking-demo.html';

  // All embed pages now use nonces since embed-app.html was converted to CSP-compliant redirect to embed-app-v2.html
  const skipNonce = false;

  // Build CSP directives
  const directives = {
    'default-src': ['\'self\''],
    'script-src': [
      '\'self\'',
      'https://cdnjs.cloudflare.com',
      'https://cdn.jsdelivr.net',
      'https://code.jquery.com',
      'https://www.local-marketing-reports.com',
      'https://static.cloudflareinsights.com',
      // Google Maps JS API loader + bootstrap (locations modal)
      'https://maps.googleapis.com',
      // Hibu Social retargeting — Meta Pixel loader (connect.facebook.net/
      // en_US/fbevents.js), injected by public/assets/js/austin-fb-pixel.js.
      // Marketing chrome only (franchise-host.html), never the app pages.
      'https://connect.facebook.net',
      // Cloudflare Turnstile (franchise self-serve preview modal on crhsent.com):
      // loads its api.js + challenge widget from this origin. Lazy-loaded by the
      // modal, so it only costs weight when a franchisee opens the preview form.
      'https://challenges.cloudflare.com',
      // Firebase Phone Auth (PR 7) — the reCAPTCHA Enterprise widget + Firebase
      // helpers load at runtime from Google origins even though the Firebase SDK
      // itself is self-hosted (vendored). Registration page only.
      'https://www.gstatic.com',
      'https://www.google.com',
      'https://apis.google.com'
    ],
    'style-src': [
      '\'self\'',
      'https://cdnjs.cloudflare.com',
      'https://cdn.jsdelivr.net',
      'https://fonts.googleapis.com',
      'https://stackpath.bootstrapcdn.com'
    ],
    'img-src': ['\'self\'', 'data:', 'https://atxwashateria.com', 'https://atxwashdryfold.com', 'https://portal.atxwashdryfold.com', 'https://runberglaundry.com', 'https://rundberglaundry.com', 'https://*.tile.openstreetmap.org', 'https://tile.openstreetmap.org', 'https://cdnjs.cloudflare.com', 'https://flagcdn.com', 'https://secure.walibu.com', 'https://upload.wikimedia.org', 'https://*.googleusercontent.com', 'https://maps.googleapis.com', 'https://maps.gstatic.com', 'https://*.googleapis.com', 'https://*.gstatic.com', 'https://www.facebook.com'],
    'connect-src': ['\'self\'', 'https://atxwashateria.com', 'https://atxwashdryfold.com', 'https://portal.atxwashdryfold.com', 'https://runberglaundry.com', 'https://rundberglaundry.com', 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://stackpath.bootstrapcdn.com', 'https://router.project-osrm.org', 'https://graphhopper.com', 'https://api.openrouteservice.org', 'https://valhalla1.openstreetmap.de', 'https://nominatim.openstreetmap.org', 'https://www.local-marketing-reports.com', 'https://places.googleapis.com', 'https://maps.googleapis.com', 'https://maps.gstatic.com', 'https://connect.facebook.net', 'https://www.facebook.com',
      // Firebase Phone Auth (PR 7) — Identity Toolkit + secure-token endpoints,
      // plus the reCAPTCHA origins the v2 fallback fetches from (www.google.com
      // /recaptcha/... and gstatic). Without www.google.com here the reCAPTCHA
      // verification XHRs are CSP-blocked and signInWithPhoneNumber hangs.
      'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com', 'https://www.googleapis.com',
      'https://www.google.com', 'https://www.gstatic.com', 'https://www.recaptcha.net'],
    'font-src': ['\'self\'', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://fonts.gstatic.com'],
    'object-src': ['\'none\''],
    'media-src': ['\'self\''],
    'frame-src': isClickjackingDemo
      ? ['\'self\'', 'https://portal.atxwashdryfold.com', 'https://www.google.com', 'https://maps.google.com', 'https://my.matterport.com', 'https://challenges.cloudflare.com',
        // Firebase Phone Auth (PR 7) — the auth helper iframe.
        'https://wavemax-bag-registration.firebaseapp.com',
        // Educational clickjacking demo only — see isClickjackingDemo comment above.
        'https://www.wavemaxlaundry.com', 'https://wavemaxlaundry.com', 'https://rundberglaundry.com']
      : ['\'self\'', 'https://portal.atxwashdryfold.com', 'https://www.google.com', 'https://maps.google.com', 'https://my.matterport.com', 'https://challenges.cloudflare.com',
        // reCAPTCHA v2 challenge iframe (fallback when Enterprise can't init).
        'https://www.recaptcha.net',
        // Firebase Phone Auth (PR 7) — the auth helper iframe.
        'https://wavemax-bag-registration.firebaseapp.com'],
    'form-action': ['\'self\''],
    'frame-ancestors': ['\'self\'', 'https://www.wavemaxlaundry.com', 'https://wavemaxlaundry.com'],
    'base-uri': ['\'self\''],
    'child-src': ['\'none\''],
    'worker-src': ['\'self\''],
    'manifest-src': ['\'self\'']
  };

  // CSP3 quirk: when a nonce is present in a directive, `'unsafe-inline'`
  // is silently ignored for that directive — even for JS-driven inline
  // style mutations like `el.style.display = 'block'`. The language
  // switcher dropdown toggles inline display, and the self-hosted Hibu
  // analytics loader rewrites body.innerHTML which forces the browser to
  // re-evaluate every inline `style="..."` attribute against style-src.
  // Both legitimately need inline styles. We keep the strict script-src
  // (that's the XSS-relevant directive) but always allow 'unsafe-inline'
  // on style-src — the CSS-injection threat model is materially weaker
  // than JS injection, and gating styles by class-toggle would require
  // forking Hibu's script.
  if (!skipNonce && nonce) {
    directives['script-src'].push(`'nonce-${nonce}'`);
    // Intentionally NOT adding the nonce to style-src: the CSP3 quirk
    // above would then silently kill 'unsafe-inline' for styles.
  }
  directives['style-src'].push('\'unsafe-inline\'');

  // Add unsafe-inline for non-migrated pages (script-src only — style-src
  // is already permissive above).
  if (!useStrictCSP) {
    directives['script-src'].push('\'unsafe-inline\'');
  }

  // Add upgrade-insecure-requests in production
  if (process.env.NODE_ENV === 'production') {
    directives['upgrade-insecure-requests'] = [];
  }

  // Build CSP header string
  const cspHeader = Object.entries(directives)
    .map(([key, values]) => {
      if (values.length === 0) return key;
      return `${key} ${values.join(' ')}`;
    })
    .join('; ');

  res.setHeader('Content-Security-Policy', cspHeader);
  next();
});

// NOTE: the crhsent.com host handler is mounted further down — AFTER the access
// gate — so the gate can password-protect the CRHS content. See below.

// CORS setup
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
      : ['http://localhost:3000'];

    // Add corporate site domains to allowed origins
    const wavemaxDomains = [
      'https://www.wavemaxlaundry.com',
      'https://wavemaxlaundry.com',
      'https://portal.atxwashdryfold.com', // Our own app domain for iframe same-origin
      // Per-location domains that proxy the Austin franchise content
      'https://atxwashateria.com',
      'https://atxwashdryfold.com',
      'https://runberglaundry.com',
      'https://rundberglaundry.com'
    ];

    const allAllowedOrigins = [...allowedOrigins, ...wavemaxDomains];

    // H-7 / prod-lockdown-2026-05-20: previously this branch returned
    // callback(null, true), admitting any null-origin request (curl,
    // Postman, server-to-server) with credentials:true cookie clearance.
    // The only legitimate consumers of /api are browsers (allowlisted via
    // wavemaxDomains) and authenticated bots that present a JWT — neither
    // depends on permissive null-origin CORS. Reject by default; explicit
    // server-to-server callers can identify themselves by other means
    // (mTLS, signed webhook, allowlisted IP).
    if (!origin) return callback(null, false);

    if (allAllowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // CORS rejection should be CLEAN — callback(null, false) makes the
      // cors middleware respond 204/200 without CORS headers, leaving the
      // browser to reject the cross-origin request itself. Throwing here
      // surfaces as a 500 with a server stack trace in the JSON body,
      // which (a) is the wrong HTTP semantic for a CORS rejection, and
      // (b) leaks server-side paths + impl details via the error handler.
      // The actual CORS protection is identical either way (no
      // Access-Control-Allow-Origin returned), but the cleaner response
      // is 204 with no body.
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token', 'csrf-token', 'xsrf-token', 'x-xsrf-token'],
  maxAge: 86400 // 24 hours
};
app.use(cors(corsOptions));

// Request logging. Redact query-string tokens (?t= labels, ?k= display tokens)
// from the logged URL so they never land in access logs ('dev' + 'combined'
// both render :url).
morgan.token('url', (req) =>
  (req.originalUrl || req.url || '').replace(/([?&](?:t|k)=)[^&]+/g, '$1<redacted>'));
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Request body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
// cookie-parser is required by csrf-csrf (SEC M-5 migration) so it can
// read its double-submit cookie from req.cookies.
app.use(require('cookie-parser')());

// Sanitization middleware
app.use(mongoSanitize()); // Prevent NoSQL injection
app.use(sanitizeRequest); // Sanitize all inputs for XSS prevention

// Compression for all responses
app.use(compression());

// Access gate — password-protects ALL web traffic to the Express-served
// domains unless the client IP is whitelisted. No-op unless
// ACCESS_GATE_ENABLED=true, so it deploys dark; mounted here so it fronts
// every route and has body+cookie parsing (above) for the password POST,
// but runs before the API rate limiter and session creation.
const accessGate = require('./server/middleware/accessGate');
app.use(accessGate);

// Partner-program landing page for the Austin per-location domains
// (rundberglaundry.com + the runberg/atxwashateria/atxwashdryfold aliases).
// Indexable public recruitment page for the pickup/delivery partner program;
// runs before the location quarantine and content routes so it covers every
// marketing path and prevents any other host handler from leaking onto these
// domains. Exempt paths (API, .well-known, assets, locales, app surfaces,
// favicon/robots/sitemap) pass through. crhsent.com is unaffected (gated above).
const partnerLanding = require('./server/middleware/partnerLanding');
app.use(partnerLanding);

// ---- crhsent.com — first-class app page, mounted AFTER the access gate so the
// gate fronts the CRHS content (gated when access_gate_enabled=true). Served
// through the app (not static nginx) for the full security model: nonce-based
// CSP (the mediator path matches isFranchiseHostPage -> strict), HSTS,
// frame-ancestors, etc. HTML is nonce-injected via cspHelper; assets sent
// directly. Path-traversal guarded. ----
const { readHTMLWithNonce: crhsentReadHTML } = require('./server/utils/cspHelper');
const CRHSENT_ROOT = path.join(__dirname, 'crhsent');

// mediatorGate — password + IP-binding gate fronting crhsent.com/wavemax (the
// documented-record package prepared for the mediator). Deploys DARK (no-op
// unless MEDIATOR_GATE_ENABLED=true); mounted here so it has body + cookie
// parsing and runs BEFORE the crhsent host handler that would otherwise serve
// the mediator's public content ungated.
app.use(require('./server/middleware/mediatorGate'));

app.use(async (req, res, next) => {
  const host = (req.hostname || '').toLowerCase().replace(/^www\./, '');
  if (host !== 'crhsent.com') return next();
  try {
    const rel = decodeURIComponent(req.path);
    let full = path.normalize(path.join(CRHSENT_ROOT, rel));
    if (full !== CRHSENT_ROOT && !full.startsWith(CRHSENT_ROOT + path.sep)) {
      return res.status(403).end();
    }
    // Clean URLs: any path without a file extension maps to its folder's
    // index.html, so "/", "/work" and "/work/" all serve the same page.
    if (!path.extname(full)) {
      full = path.join(full, 'index.html');
    }
    if (full.endsWith('.html')) {
      const html = await crhsentReadHTML(full, res.locals.cspNonce);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.type('html').send(html);
    }
    return res.sendFile(full, (err) => { if (err) next(); });
  } catch (e) {
    return next();
  }
});

// Franchise self-serve preview endpoints (crhsent.com host only). Deploys DARK —
// a no-op unless FRANCHISE_PREVIEW_ENABLED=true. Mounted here so it has body +
// cookie parsing (above) and runs BEFORE the location quarantine (which would
// otherwise redirect these crhsent /__preview/* paths to the corporate site).
app.use(require('./server/middleware/franchisePreview'));

// Rate limiting for API endpoints
// Import centralized rate limiting configuration
const { apiLimiter } = require('./server/middleware/rateLimiting');

// Apply general API rate limiting to all /api routes
// The middleware itself handles test environment and relaxed mode
app.use('/api/', apiLimiter);

// Setup session middleware - add this after other middleware like helmet, cors, etc.
const session = require('express-session');

// Calculate maxAge once to ensure consistency
const sessionMaxAge = 10 * 60 * 1000; // 10 minutes — inactivity TTL (extended on activity via touchAfter). Was 24h, which let CF load-balancer health-check sessions (~11/sec, one per request via saveUninitialized) pile to ~2M on ADB, which never runs a TTL sweep.

// Configure session store based on environment
const sessionStore = process.env.NODE_ENV === 'test'
  ? undefined // Use default MemoryStore for tests
  : MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    // connect-mongo runs its OWN MongoClient pool. Keep its connections pooled
    // (no idle churn) + enable command monitoring so the Oracle diagnostics capture
    // the sessions.findOne malformed replies (where 100% of the cursor errors are).
    mongoOptions: {
      // connect-mongo has its OWN pool — cap it too (sessions are infrequent).
      maxPoolSize: 3,
      minPoolSize: 1,
      monitorCommands: process.env.ORACLE_DIAG !== 'false'
    },
    touchAfter: 60, // seconds — re-save an active session at most once/min so the 10-min TTL is inactivity-based (a busy user isn't dropped mid-session), without writing on every request
    // Purge expired sessions with a periodic deleteMany rather than a Mongo
    // TTL index. The Oracle ADB MongoDB API rejects TTL index creation unless
    // the schema holds CREATE JOB, and connect-mongo's default
    // autoRemove:'native' throws an unhandled rejection on connect there
    // (crash-loops startup). 'interval' performs cleanup with a plain query
    // Oracle supports; session validity is also enforced on read via the
    // `expires` field, so correctness never depended on the TTL sweep.
    autoRemove: 'interval',
    autoRemoveInterval: 2 // minutes — purge expired sessions fast (ADB runs no TTL sweep, so this deleteMany is the only cleanup)
  });

// __Host- prefix in production: enforces Secure + Path=/ + no Domain
// attribute, blocking sub-domain cookie injection. In dev/test we keep
// the bare name because __Host- requires Secure which we only set in
// prod. APP-009 / prod-lockdown-2026-05-20.
const sessionCookieName = process.env.NODE_ENV === 'production'
  ? '__Host-portal.sid'
  : 'portal.sid';

// Liveness probe — handled BEFORE the session middleware so the Cloudflare
// Load Balancer health monitor (~11/sec, ~99% of origin traffic) does NOT mint
// a session per check. Leaving it after session re-bloats the ADB session store
// (the 2026-05-25 incident). saveUninitialized stays on for real page/API
// requests (click-tracking); only this probe opts out of session creation.
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use(session({
  name: sessionCookieName,
  secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'default-dev-secret'),
  resave: false, // Don't resave session if unmodified
  saveUninitialized: true, // Changed to true to ensure sessions are created for CSRF
  rolling: false, // Disable rolling to avoid maxAge issues
  store: sessionStore,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Only use secure in production
    httpOnly: true,
    maxAge: sessionMaxAge, // Use pre-calculated value
    originalMaxAge: sessionMaxAge, // Store original maxAge
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' required for cross-site iframe in production
    path: '/', // Ensure cookie is available for all paths
    domain: undefined // Let browser handle domain (works better for same-origin)
  },
  // Add genid to ensure consistent session IDs
  genid: function(req) {
    // For iframe contexts, try to use a consistent ID based on authorization token
    if (req.headers.authorization) {
      const crypto = require('crypto');
      const token = req.headers.authorization.replace('Bearer ', '');
      // Create a deterministic session ID based on the auth token
      return 'sess_' + crypto.createHash('sha256').update(token).digest('hex').substring(0, 32);
    }
    // Default to random ID
    return require('crypto').randomBytes(16).toString('hex');
  }
}));

// Add middleware to ensure session cookie maxAge is always valid
app.use((req, res, next) => {
  if (req.session && req.session.cookie) {
    // Force reset cookie properties to ensure they're valid
    const originalMaxAge = req.session.cookie.maxAge;
    const originalExpires = req.session.cookie._expires;

    // Always ensure maxAge is a valid number
    if (typeof originalMaxAge !== 'number' || isNaN(originalMaxAge) || originalMaxAge < 0) {
      // Create a new cookie object to avoid prototype issues
      req.session.cookie = {
        ...req.session.cookie,
        maxAge: sessionMaxAge,
        originalMaxAge: sessionMaxAge,
        expires: new Date(Date.now() + sessionMaxAge),
        _expires: new Date(Date.now() + sessionMaxAge)
      };
    }

    // Double-check the maxAge is still valid
    if (typeof req.session.cookie.maxAge !== 'number') {
      req.session.cookie.maxAge = sessionMaxAge;
    }
  }
  next();
});

// Location quarantine — lock deployment down to Austin + affiliate-program
// app. Activated by env var QUARANTINE_NON_AUSTIN=true. Mounted here so it
// runs before all route handlers and static middleware, redirecting any
// non-Austin/non-app request to the corporate site (wavemaxlaundry.com).
// No-op when the env var is unset/false.
const locationQuarantine = require('./server/middleware/locationQuarantine');

// IMPORTANT ORDERING — these two handlers must run BEFORE
// locationQuarantine. The quarantine middleware redirects any request
// it doesn't recognize as Austin/app content to www.wavemaxlaundry.com.
// Without an explicit short-circuit for these paths, our security.txt
// route and sensitive-path 404 handler are bypassed and the responses
// turn into 302s back to the franchisor's domain (which itself 404s,
// producing the broken-redirect chain the comparative audit flagged).

// .well-known/security.txt — RFC 9116 disclosure policy.
// Explicit route because Express's serve-static ignores dotfiles by
// default (and globally allowing dotfiles would expose other dot-paths
// we don't want public).
app.get('/.well-known/security.txt', (req, res) => {
  res.type('text/plain').sendFile(path.join(__dirname, 'public', '.well-known', 'security.txt'));
});

// Favicon — serve the brand icon directly. Must run BEFORE locationQuarantine:
// without it, /favicon.ico falls through to the quarantine redirect (302 to
// www.wavemaxlaundry.com/favicon.ico), which then trips CSP img-src 'self' in
// every embedded page and iframe whose document declares no favicon. Serving a
// same-origin icon here kills that console error site-wide in one place.
app.get('/favicon.ico', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('image/png').sendFile(path.join(__dirname, 'public', 'assets', 'images', 'brand', 'favicon-32x32.png'));
});

// Explicit 404s for common sensitive-path probes — closes the 302 leak
// the comparative audit flagged. Files are not exposed either way; this
// just produces the clean response semantic scanners and audit tools
// expect. List intentionally short — common scanner targets only.
const sensitiveProbePaths = [
  '/.env', '/.env.local', '/.env.production',
  '/.git', '/.git/config', '/.git/HEAD',
  '/.svn', '/.svn/entries',
  '/.DS_Store',
  '/package.json', '/package-lock.json',
  '/Dockerfile', '/docker-compose.yml',
  '/composer.json', '/composer.lock',
  '/yarn.lock'
];
app.use((req, res, next) => {
  if (sensitiveProbePaths.includes(req.path)) {
    return res.status(404).type('text/plain').send('Not Found');
  }
  next();
});

// NOW the quarantine — runs after the two early-route handlers above.
app.use(locationQuarantine);

// Mount embed routes with CSP nonce support BEFORE static file serving
const embedRoutes = require('./server/routes/embedRoutes');

// Defense-in-depth for the admin IP gate: express.static (mounted below) resolves
// paths with its own normalization, so a variant like //administrator-dashboard-
// embed.html or a %2F-encoded path could serve the admin HTML while skipping the
// exact-match gated routes. Normalize the path and apply the IP gate to any admin
// embed page or the /admin clean URL BEFORE any handler (embedRoutes or static)
// can serve it. (Idempotent with the per-route gates — a second pass just re-checks.)
app.use((req, res, next) => {
  let p = req.path || '';
  try { p = decodeURIComponent(p); } catch (_e) { /* keep raw on malformed escapes */ }
  p = p.replace(/\/{2,}/g, '/');
  if (/^\/admin\/?$/i.test(p) || /administrator-(login|dashboard)-embed\.html$/i.test(p)) {
    return adminIpGate(req, res, next);
  }
  // Same defense for the operator surface (store-IP gated).
  if (/^\/operator\/?$/i.test(p) || /operator-(login|scan)-embed\.html$/i.test(p)) {
    return operatorIpGate(req, res, next);
  }
  return next();
});

app.use('/', embedRoutes);


// Mount monitoring dashboard BEFORE static files for CSP nonce injection.
// IP-gated to the admin allowlist (same as /admin): /monitoring/status serves
// real connectivity-monitor data (service names, host error strings), so it must
// not be publicly reachable. adminIpGate fails CLOSED in prod (stealth 404) and
// is transparent in dev/test.
app.use('/monitoring', adminIpGate, monitoringRoutes);

// Handle direct monitoring-dashboard.html path
app.get('/monitoring-dashboard.html', (req, res) => {
  res.redirect('/monitoring/');
});


// ─── Austin reference build: server-rendered config ────────────────
// Provides the Google Places API key + Place ID to the browser without
// committing them to source control. The browser-direct call to the
// Places API needs the key in the page; key abuse is bounded by HTTP
// referrer restrictions configured on the key in Google Cloud Console
// (rundberglaundry.com, the per-location domains, and localhost). Both values
// are read from process.env so we can rotate by editing .env + pm2
// restart, without redeploying or touching public/.
//
// The URL deliberately lives under /api/ and has no .js extension —
// Cloudflare's default cache rules ignore /api/* AND don't auto-cache
// extensionless paths, so a key rotation hits browsers immediately.
// The HTML loads it with <script src="..."> + the Content-Type below.
app.get('/api/austin-tx/places-config', (req, res) => {
  const apiKey  = (process.env.GOOGLE_PLACES_API_KEY  || '').replace(/['"\\\n\r]/g, '');
  const placeId = (process.env.GOOGLE_PLACES_LOCATION_PLACE_ID || '').replace(/['"\\\n\r]/g, '');
  res.set('Content-Type', 'application/javascript; charset=utf-8');
  // Belt-and-suspenders no-cache: standard Cache-Control + the
  // Cloudflare-specific cdn-cache-control directive so neither origin
  // browser cache nor any intermediate CDN layer holds this.
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('CDN-Cache-Control', 'no-store');
  res.set('Cloudflare-CDN-Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  res.send(
    '/* Server-rendered. Reads from process.env at request time. */\n' +
    '(function () {\n' +
    '  \'use strict\';\n' +
    '  window.GOOGLE_PLACES_API_KEY = window.GOOGLE_PLACES_API_KEY || \'' + apiKey + '\';\n' +
    '  window.LOCATION_PLACE_ID     = window.LOCATION_PLACE_ID     || \'' + placeId + '\';\n' +
    '})();\n'
  );
});

// Legacy URL redirect: /dev/austin-host-mock.html?route=/path → /austin-tx/path/
// The /dev/ page was the pre-resolver demo; production URLs now live at
// /<slug>/. Mounted BEFORE the static middleware so the file isn't served
// instead.
app.get('/dev/austin-host-mock.html', (req, res, next) => {
  const r = (req.query.route || '/').toString();
  // Sanity-check: must start with / and contain only slug-safe chars,
  // otherwise fall through to static (or just 404).
  if (!/^\/[a-z0-9/_-]*$/i.test(r)) return next();
  const tail = r === '/' ? '' : r.replace(/^\/+/, '').replace(/\/+$/, '') + '/';
  // Preserve any other query params (e.g. ?lang=es), drop the route one.
  const qs = new URLSearchParams(req.query);
  qs.delete('route');
  const queryString = qs.toString();
  res.redirect(301, `/austin-tx/${tail}${queryString ? '?' + queryString : ''}`);
});

// Performance: versioned static assets under /assets are immutable. They're
// ?v=-cache-busted, so the bytes at any URL never change → a long immutable
// Cache-Control lets Cloudflare serve them as clean edge HITs (~20ms) instead
// of revalidating to the Phoenix origin every few hours (~0.2s, the slow
// "images come in last" symptom). Placed here, AT the existing general-static
// location (after session/CSP — NOT before it, which reordered middleware and
// threw errors). Static asset responses don't carry the session cookie, so
// there's no Cloudflare BYPASS to worry about; the immutable TTL simply
// upgrades them from CF's 14400 revalidation to a long clean HIT.
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), {
  immutable: true,
  maxAge: '1y',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}));

// Guard /design-explorer/* behind ?k=EXPLORER_TOKEN before static files can serve them
app.use(require('./server/middleware/explorerGuard'));

// Serve static files in all environments
app.use(express.static(path.join(__dirname, 'public')));

// Serve documentation if enabled
if (process.env.SHOW_DOCS === 'true') {
  const docsRoutes = require('./server/routes/docsRoutes');
  app.use('/docs', docsRoutes);
}

// Coverage routes are mounted earlier, before static files

// Apply CSRF protection with new configuration
app.use(conditionalCsrf);

// CSRF token endpoint
app.get('/api/csrf-token', csrfTokenEndpoint);

// Concierge — LIVE, FAQ-scoped Claude-backed assistant for the design explorer
// (and any Austin marketing page). POST /api/concierge { message, history? }.
// Registered here — AFTER conditionalCsrf (the path is on the CSRF public
// allowlist) and express.json (applied globally above), but BEFORE the
// apiVersioning middleware that rewrites /api/* → /api/v1/* (which would
// otherwise steal this path before the route can match). A dedicated
// conciergeLimiter caps per-IP usage of the paid LLM endpoint; the controller
// fails gracefully and never leaks the API key or errors.
const { conciergeLimiter } = require('./server/middleware/rateLimiting');
const conciergeController = require('./server/controllers/conciergeController');
app.post('/api/concierge', conciergeLimiter, express.json({ limit: '16kb' }), conciergeController.handle);

// API Versioning middleware
const API_VERSION = 'v1';
const apiVersioning = (req, res, next) => {
  // Extract version from header or URL
  const versionFromHeader = req.headers['api-version'];
  const versionFromUrl = req.path.match(/^\/api\/(v\d+)\//)?.[1];

  // Use version from URL first, then header, then default
  req.apiVersion = versionFromUrl || versionFromHeader || API_VERSION;

  // Rewrite URL if version is in header but not in URL
  if (!versionFromUrl && req.path.startsWith('/api/')) {
    req.url = req.path.replace('/api/', `/api/${req.apiVersion}/`);
  }

  next();
};

// Apply API versioning
app.use(apiVersioning);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    // Add CORS headers for translation files
    if (path.includes('/locales/')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
    }
  }
}));

// API Routes with versioning
const apiV1Router = express.Router();

// Franchise registry listing — drives the /locations/ finder UI on the
// corporate clone. Mounted under /api/v1/ so the legacy /api → /api/v1
// rewrite covers it too.
apiV1Router.get('/franchises', require('./server/controllers/franchiseController').listFranchises);

// Environment endpoint (for checking if in dev/test mode)
apiV1Router.get('/environment', (req, res) => {
  res.json({
    success: true,
    nodeEnv: process.env.NODE_ENV || 'development',
    enableDeleteDataFeature: process.env.ENABLE_DELETE_DATA_FEATURE === 'true'
  });
});

// Mount v1 routes
apiV1Router.use('/auth', authRoutes);
apiV1Router.use('/affiliates', affiliateRoutes);
apiV1Router.use('/affiliate-invites', require('./server/routes/affiliateInviteRoutes'));  // Public invite validate (invite-only onboarding)
apiV1Router.use('/customers', customerRoutes);
apiV1Router.use('/bags', require('./server/routes/bagRoutes'));  // Durable bags: mint/issue/labels/resolve/inventory
apiV1Router.use('/scan', require('./server/routes/scanRoutes'));  // PR 4 — scan-session engine (auth-once, state-driven resolve/apply/undo)
apiV1Router.use('/expediter', require('./server/routes/expediterRoutes'));  // Order Expediter — read-only in-store display (EXPEDITER_TOKEN)
apiV1Router.use('/addons', require('./server/routes/addonRoutes'));  // Public add-on catalog (active only) for the order form
apiV1Router.use('/orders', orderRoutes);
apiV1Router.use('/administrators', adminIpGate, administratorRoutes);
apiV1Router.use('/operators', operatorRoutes);
apiV1Router.use('/system/config', systemConfigRoutes);
apiV1Router.use('/location', require('./server/routes/locationRoutes'));  // Per-location reads (reviews, etc.)
apiV1Router.use('/contact', require('./server/routes/contactRoutes'));  // Per-location contact-form submissions
apiV1Router.use('/', require('./server/routes/corporateInquiryRoutes'));  // /corporate-contact + /franchise-lead
apiV1Router.use('/', require('./server/routes/partnerInquiryRoutes'));  // /partner-inquiry
apiV1Router.use('/', require('./server/routes/affiliateApplicationRoutes'));  // /affiliate-application
apiV1Router.use('/', require('./server/routes/mapsConfigRoute'));  // /maps-config — Maps API key for corporate pages
apiV1Router.use('/', require('./server/routes/firebaseConfigRoute'));  // /firebase-config — Firebase web config + phone-verify flag (PR 7)
apiV1Router.use('/', require('./server/routes/brandRoute'));  // /brand — public display-name config (Phase 3 de-brand)
// Environment endpoint
apiV1Router.get('/environment', (req, res) => {
  res.json({
    environment: process.env.NODE_ENV || 'development',
    enableDeleteDataFeature: process.env.ENABLE_DELETE_DATA_FEATURE === 'true'
  });
});


// GET /monitoring/status is served by monitoringRoutes (mounted at /monitoring
// above) from the real connectivity-monitor — single source, no duplicate here.

// Mount versioned API
app.use('/api/v1', apiV1Router);

// Legacy support - redirect unversioned API calls to v1
app.use('/api', (req, res, next) => {
  if (!req.path.match(/^\/v\d+\//)) {
    req.url = `/v1${req.path}`;
  }
  next();
}, apiV1Router);

// Corporate-level pages — Phase 5c clone. These live on top-level paths
// like /franchise, /about/, etc. and are static V3-styled marketing
// pages with no per-franchise data. Mounted BEFORE the slug router so
// these top-level slugs don't get picked up as (nonexistent) franchise slugs.
app.get('/', (req, res) => {
  res.redirect(302, '/franchise/');
});
app.get(['/franchise', '/franchise/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'franchise.html'));
});
app.get(['/become-a-franchisee', '/become-a-franchisee/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'become-a-franchisee.html'));
});
app.get(['/about', '/about/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'about.html'));
});
app.get(['/testimonials', '/testimonials/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'testimonials.html'));
});
app.get(['/why-invest-in-wavemax', '/why-invest-in-wavemax/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'why-invest-in-wavemax.html'));
});
app.get(['/wavemax-vs-zombiemat', '/wavemax-vs-zombiemat/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'wavemax-vs-zombiemat.html'));
});
app.get(['/virtual-tour', '/virtual-tour/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'virtual-tour.html'));
});
app.get(['/faq', '/faq/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'faq.html'));
});
app.get(['/contact', '/contact/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});
app.get(['/laundromat-investment-guide', '/laundromat-investment-guide/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'laundromat-investment-guide.html'));
});
// Public UT-student affiliate recruitment landing page (rundberglaundry.com/affiliate).
// Exempted from partnerLanding + the quarantine allowlist so it is fully public.
app.get(['/affiliate', '/affiliate/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'affiliate.html'));
});
// Generic affiliate interest form (for ad campaigns).
app.get(['/wavemax-affiliate', '/wavemax-affiliate/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'wavemax-affiliate.html'));
});

// Per-franchise dynamic routes — Phase 5a. Mounted AFTER /api/* and the
// static middleware so unknown slugs fall through to a 404 instead of
// shadowing real asset paths. The controller's registry-lookup gate is
// the slug allowlist; anything not in /public/data/franchises/ calls
// next() and Express returns the standard 404.
app.use('/', require('./server/routes/franchiseRoutes'));

// Clean admin URL: GET /admin serves the SPA shell pointed at the administrator
// portal (no visible ?route= in the address bar). IP-gated to the admin allowlist
// (stealth 404 otherwise). The injected window.__DEFAULT_ROUTE is read by
// embed-app-v2.js getRouteFromUrl(); SessionManager then routes an authenticated
// admin to the dashboard and everyone else to the login page.
const { readHTMLWithNonce: adminReadHTML } = require('./server/utils/cspHelper');
app.get(['/admin', '/admin/'], adminIpGate, async (req, res) => {
  try {
    const nonce = res.locals.cspNonce;
    let html = await adminReadHTML(path.join(__dirname, 'public', 'embed-app-v2.html'), nonce);
    const inject = `<script nonce="${nonce}">window.__DEFAULT_ROUTE='/administrator-login';</script>`;
    html = html.replace('</head>', `${inject}</head>`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('html').send(html);
  } catch (err) {
    logger.error('Error serving /admin shell:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Admin routes with CSRF
app.get('/admin/*', adminIpGate, (req, res, next) => {
  res.locals.csrfToken = req.csrfToken ? req.csrfToken() : null;
  next();
});

// Clean operator URL: GET /operator serves the SPA shell pointed at the operator
// login (clean address bar), IP-gated to the store location(s) + admin IP. Mirrors
// the /admin handler; SessionManager then sends an authenticated operator to the
// scan page and everyone else to the PIN login.
app.get(['/operator', '/operator/'], operatorIpGate, async (req, res) => {
  try {
    const nonce = res.locals.cspNonce;
    let html = await adminReadHTML(path.join(__dirname, 'public', 'embed-app-v2.html'), nonce);
    const inject = `<script nonce="${nonce}">window.__DEFAULT_ROUTE='/operator-login';</script>`;
    html = html.replace('</head>', `${inject}</head>`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('html').send(html);
  } catch (err) {
    logger.error('Error serving /operator shell:', err);
    res.status(500).send('Internal Server Error');
  }
});

// /scanbag — standalone mobile PWA that scans a bag QR with the phone camera and
// hands off to the /claim flow (start/complete an order). PUBLIC (it adds no
// access beyond pointing a phone camera at the QR, which opens /claim anyway).
// The camera needs a Permissions-Policy carve-out (the global header disables it).
app.get(['/scanbag', '/scanbag/'], async (req, res) => {
  try {
    const nonce = res.locals.cspNonce;
    const html = await adminReadHTML(path.join(__dirname, 'public', 'scanbag.html'), nonce);
    res.setHeader('Permissions-Policy',
      'geolocation=(), microphone=(), camera=(self), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('html').send(html);
  } catch (err) {
    logger.error('Error serving /scanbag page:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Health check endpoint
// (/health is defined earlier, before the session middleware, so health-check
// traffic doesn't create sessions.)

// API documentation endpoint
app.get('/api/docs', (req, res) => {
  res.redirect('/api-docs.html');
});

// Root endpoint - API server info
app.get('/', (req, res) => {
  res.json({
    name: `${brand.displayName} Affiliate Program API`,
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      docs: '/api/docs',
      auth: '/api/v1/auth',
      affiliates: '/api/v1/affiliates',
      customers: '/api/v1/customers',
      orders: '/api/v1/orders'
    },
    timestamp: new Date().toISOString()
  });
});

// Per-hostname robots.txt and sitemap.xml. Each managed host serves its
// own — required for self-canonical multi-domain SEO. Hosts that aren't
// in the override map fall back to a generic robots that allows everything
// and points to rundberglaundry.com's sitemap.
app.get('/robots.txt', (req, res) => {
  const host = (req.hostname || 'rundberglaundry.com').toLowerCase().replace(/^www\./, '');
  res.type('text/plain');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(
    // AI / LLM crawlers — disallowed (training + scraping). This mirrors the
    // block list Cloudflare's "Manage robots.txt" used to inject, kept here
    // in-repo and under our control. Crucially this carries NO `Content-Signal:`
    // directive — that line (a Cloudflare Content Signals addition) is an
    // unknown directive Lighthouse flags as "robots.txt is not valid", capping
    // SEO at 92. Standard `User-agent`/`Disallow` directives are valid, so
    // governance is preserved while SEO scores 100. (Disable CF's "Manage
    // robots.txt" so this origin file is served, not CF's injected one.)
    'User-agent: Amazonbot\nDisallow: /\n\n' +
    'User-agent: Applebot-Extended\nDisallow: /\n\n' +
    'User-agent: Bytespider\nDisallow: /\n\n' +
    'User-agent: CCBot\nDisallow: /\n\n' +
    'User-agent: ClaudeBot\nDisallow: /\n\n' +
    'User-agent: CloudflareBrowserRenderingCrawler\nDisallow: /\n\n' +
    'User-agent: Google-Extended\nDisallow: /\n\n' +
    'User-agent: GPTBot\nDisallow: /\n\n' +
    'User-agent: meta-externalagent\nDisallow: /\n\n' +
    // NOTE: do NOT Disallow /embed-app-v2.html — the franchise host pages render
    // their real content inside an iframe pointed at that route. Blocking it left
    // Googlebot able to crawl only the thin host shell, never the content a
    // visitor actually sees. It carries no inbound links and is in no sitemap, so
    // it won't index standalone; allowing it lets crawlers render the full page.
    'User-agent: *\n' +
    'Allow: /\n' +
    'Disallow: /api/\n' +
    'Disallow: /admin/\n' +
    'Disallow: /monitoring/\n' +
    '\n' +
    `Sitemap: https://${host}/sitemap.xml\n`
  );
});

app.get('/sitemap.xml', (req, res) => {
  const host = (req.hostname || 'rundberglaundry.com').toLowerCase().replace(/^www\./, '');
  const { isManagedHost } = require('./server/config/domainSeoOverrides');
  const now = new Date().toISOString().slice(0, 10);

  // rundberglaundry.com is the primary domain — its sitemap lists every
  // Austin page so Google indexes the full site. The three sister domains
  // each target a single query and ship a minimal sitemap (apex only).
  // A retired or unknown host is locked down (301s at the edge), so its
  // sitemap simply points at the primary rundberglaundry.com domain.
  const urls = [];
  if (host === 'rundberglaundry.com') {
    urls.push(
      { loc: `https://${host}/`,                                priority: '1.0' },
      { loc: `https://${host}/austin-tx/wash-dry-fold/`,         priority: '0.9' },
      { loc: `https://${host}/austin-tx/self-serve-laundry/`,    priority: '0.9' },
      { loc: `https://${host}/austin-tx/commercial/`,            priority: '0.8' },
      { loc: `https://${host}/austin-tx/about-us/`,              priority: '0.7' },
      { loc: `https://${host}/austin-tx/contact/`,               priority: '0.7' }
    );
  } else if (host === 'atxwashdryfold.com') {
    // Apex-only. The deep WDF page (/austin-tx/wash-dry-fold/) self-canonicals
    // to this apex — the apex *is* this domain's wash-dry-fold landing — so the
    // sitemap must list only the canonical URL. Listing the deep page made
    // Search Console report it "Discovered - currently not indexed": its
    // canonical points away to the apex, so it was never going to index on its own.
    urls.push({ loc: `https://${host}/`, priority: '1.0' });
  } else if (host === 'portal.atxwashdryfold.com') {
    // The affiliate app's own canonical host (migration target for the retired
    // promo hosts). Self-canonical to the portal apex — the app must not point
    // its sitemap at the marketing primary domain.
    urls.push({ loc: `https://${host}/`, priority: '1.0' });
  } else if (isManagedHost(host)) {
    // atxwashateria.com, runberglaundry.com — apex only.
    urls.push({ loc: `https://${host}/`, priority: '1.0' });
  } else {
    // Retired or unknown host — falls back to the primary domain.
    urls.push({ loc: 'https://rundberglaundry.com/', priority: '1.0' });
  }

  res.type('application/xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(({ loc, priority }) => (
      `  <url><loc>${loc}</loc><lastmod>${now}</lastmod><priority>${priority}</priority></url>`
    )),
    '</urlset>'
  ].join('\n');
  res.send(body);
});

// Direct routes for legal pages (for Google and external access).
// Served through serveHTMLWithNonce so the {{BRAND_NAME}} placeholder + the
// empty brand-name meta resolve server-side (Phase 3 de-brand).
const { serveHTMLWithNonce: serveLegalWithNonce } = require('./server/utils/cspHelper');
app.get('/terms-of-service', serveLegalWithNonce('terms-and-conditions.html'));

app.get('/terms-and-conditions', serveLegalWithNonce('terms-and-conditions.html'));

app.get('/privacy-policy', serveLegalWithNonce('privacy-policy.html'));

app.get('/refund-policy', serveLegalWithNonce('refund-policy.html'));

// Block common WordPress scanning paths
app.use((req, res, next) => {
  const blockedPaths = [
    '/wp-admin',
    '/wp-login',
    '/wp-content',
    '/wp-includes',
    '/wordpress',
    '.php',
    'wp-',
    'xmlrpc',
    'wlwmanifest'
  ];

  const isBlocked = blockedPaths.some(path =>
    req.path.toLowerCase().includes(path)
  );

  if (isBlocked) {
    // Return 404 to discourage scanners
    return res.status(404).json({
      success: false,
      message: 'Not found'
    });
  }

  next();
});

// Catch all other routes and return API error
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.path,
    method: req.method,
    hint: 'Check the API documentation at /api/docs'
  });
});

// Central error handler (server/middleware/errorHandler.js). This is the
// single, final error-handling middleware. A second duplicate handler used
// to live here; with errorHandler already responding, the duplicate only
// ever ran when errorHandler itself threw ERR_HTTP_HEADERS_SENT, producing a
// second throw and escalating to an uncaughtException. Removed 2026-05-21.
app.use(errorHandler);

// Start server (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);

    // Start connectivity monitoring
    const { startMonitoring } = require('./server/monitoring/connectivity-monitor');
    startMonitoring();
  });
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  // Don't crash the server in production
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

module.exports = app;