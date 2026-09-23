// Laundromat Affiliate Program
// Main Server Entry Point

require('dotenv').config();
const { errorHandler } = require('./server/middleware/errorHandler');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');
// Shared security & infrastructure core. Provides the security-header
// middleware and the CSP directive builder consumed below (byte-identical
// extractions of the former inline blocks). See docs/refactor.
const webCore = require('@crhs/web-core');
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
const operatorIpGate = require('./server/middleware/operatorIpGate');
const operatorRoutes = require('./server/routes/operatorRoutes');
const monitoringRoutes = require('./server/routes/monitoringRoutes');
const systemConfigRoutes = require('./server/routes/systemConfigRoutes');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

const logger = require('./server/utils/logger');

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
        // Use the canonical portal host if the host header is invalid.
        res.redirect(`https://portal.atxwashdryfold.com${req.url}`);
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

// Security headers with iframe embedding support — Helmet baseline + the
// custom header block (Permissions-Policy, X-Permitted-Cross-Domain-Policies,
// X-Frame-Options, COOP, /logout Clear-Site-Data, and the per-path CORP/CORS
// overrides for the parent-iframe bridge + /assets + /locales) now come from
// @crhs/web-core (byte-identical extraction; regression-locked by
// tests/integration/securityHeaders.test.js). Composed as one middleware:
// helmet runs first, then the custom setHeader() block — same order as before.
app.use(webCore.securityHeadersMiddleware());

// Manual CSP implementation with nonce support — the directive template and
// the document-page / clean-URL-slug strict predicates now come from
// @crhs/web-core's buildCspDirectives / isStrictCspPath / serializeCspDirectives
// (byte-identical extraction; parity pinned by web-core's
// cspMonorepoParity.test.js and this app's webCoreConsumptionGolden.test.js).
//
// The strict-page allowlist stays LOCAL to this app (it's the app's own set,
// distinct from corporate's). web-core's isStrictCspPath falls back to its
// built-in documentation-page + franchise-slug predicates, which reproduce the
// former inline `isDocumentationPage` / `isCleanUrlSlugPage` regexes verbatim.
//
// web-core v0.2.0 carries no app or host literals: this app supplies its own
// origins. profile 'full' = the shared vendor allowlist. The portal serves
// exactly ONE host, so that is the only app origin in img/connect: the four
// per-location marketing origins that sat here until Plan 3 Task 37 were
// grant-of-reach to hosts crhs-corporate owns on :3001, and no page the portal
// still serves loads anything from them. frame-src carries the portal origin
// plus the Firebase auth-helper iframe (dropping it CSP-blocks
// signInWithPhoneNumber on the claim page). frame-ancestors is tightened to
// 'self' — this app is only framed by its own pages.
const APP_LOCATION_ORIGINS = [
  'https://portal.atxwashdryfold.com'
];
const APP_FRAME_SRC_ORIGINS = [
  'https://portal.atxwashdryfold.com',
  'https://wavemax-bag-registration.firebaseapp.com'
];
const APP_STRICT_CSP_PAGES = [
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
  '/reset-password-embed.html'
];
app.use((req, res, next) => {
  const useStrictCSP = webCore.isStrictCspPath(req.path, { strictCSPPages: APP_STRICT_CSP_PAGES });
  const directives = webCore.buildCspDirectives({
    nonce: res.locals.cspNonce,
    useStrictCSP,
    profile: 'full',
    imgSrcExtra: APP_LOCATION_ORIGINS,
    connectSrcExtra: APP_LOCATION_ORIGINS,
    frameSrcExtra: APP_FRAME_SRC_ORIGINS,
    frameAncestors: ['\'self\'']
  });
  res.setHeader('Content-Security-Policy', webCore.serializeCspDirectives(directives));
  next();
});

// CORS setup
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
      : ['http://localhost:3000'];

    // The only browser origin allowed to make a credentialed call to this API.
    // The per-location marketing origins were removed by Plan 3 Task 37: those
    // hosts are crhs-corporate's on :3001 and no corporate page makes a
    // credentialed cross-origin call to the portal API (verified at the T37
    // gate). Kept as a one-entry array rather than folded into CORS_ORIGIN so
    // that change (Task 44) stays independently revertable.
    const wavemaxDomains = [
      'https://portal.atxwashdryfold.com' // canonical app domain
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

// (The partner-program landing middleware for the Austin per-location domains
// lived here until 2026-09-22. crhs-corporate on :3001 now owns rundberglaundry.com,
// atxwashateria.com, atxwashdryfold.com and the runberglaundry.com typo alias
// outright — nginx routes those host families there on both boxes — so this app
// no longer has a marketing surface to gate. See Plan 3 Task 16.)

// Rate limiting for API endpoints
// Import centralized rate limiting configuration
const { apiLimiter } = require('./server/middleware/rateLimiting');

// Apply general API rate limiting to all /api routes
// The middleware itself handles test environment and relaxed mode
app.use('/api/', apiLimiter);

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

// Origin-level liveness — the Cloudflare LB monitor's target (2026-09-10 HA
// design, Option A). The CF pool's origin is the BOX, and both apps run on every
// box, so one monitor must answer "can this box serve EVERY hostname?" — this app
// AND the content app on :3001. Returning 503 when the content app is down pulls
// the whole box from rotation, which is the correct signal for a shared origin:
// the surviving box absorbs all traffic. Handled BEFORE the session middleware
// for the same reason /health is (no probe-minted sessions).
const ORIGIN_PROBE_URL = process.env.CONTENT_HEALTH_URL || 'http://127.0.0.1:3001/health';
const ORIGIN_PROBE_TIMEOUT_MS = Number(process.env.CONTENT_HEALTH_TIMEOUT_MS || 1000);

app.get('/health/origin', async (req, res) => {
  const components = { portal: 'UP', content: 'UNKNOWN' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ORIGIN_PROBE_TIMEOUT_MS);
  try {
    const probe = await fetch(ORIGIN_PROBE_URL, { signal: controller.signal });
    components.content = probe.ok ? 'UP' : `DOWN(${probe.status})`;
  } catch (err) {
    components.content = `DOWN(${err.name === 'AbortError' ? 'timeout' : (err.code || err.message)})`;
  } finally {
    clearTimeout(timer);
  }
  const healthy = components.content === 'UP';
  if (!healthy) {
    logger.warn('Origin health degraded — box will be pulled from the CF pool', { components });
  }
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'UP' : 'DEGRADED',
    components,
    timestamp: new Date().toISOString()
  });
});

// Session middleware — @crhs/web-core's shared builder (spec §7.2). The cookie
// config, connect-mongo store options, TTL, genid and the maxAge repair path are a
// verbatim extraction of the block that used to live here, so ONE copy of the
// 2026-09-11 outage fix exists instead of two divergent ones. Core returns
// express-session already composed WITH its _maxAgeFixer, so that guard cannot be
// mounted away by accident.
//
// cookieName is pinned EXPLICITLY. web-core's DEFAULT_COOKIE_BASE is 'app.sid', so a
// default-shaped call would rename the production cookie from __Host-portal.sid to
// __Host-app.sid and sign out every logged-in affiliate, customer, administrator and
// operator on the next reload. Core applies the __Host- prefix in production
// (enforces Secure + Path=/ + no Domain attribute, blocking sub-domain cookie
// injection — APP-009 / prod-lockdown-2026-05-20); dev/test keeps the bare name
// because __Host- requires Secure. An explicit argument also outranks
// SESSION_COOKIE_NAME, so no box-level env value can rename the live cookie.
// Pinned both ways by tests/integration/sessionMount.test.js.
//
// ttlSeconds 600 is the 10-minute inactivity TTL (extended on activity via core's
// touchAfter: 60). It was 24h, which let CF load-balancer health-check sessions
// (~11/sec, one per request via saveUninitialized) pile to ~2M on ADB, which never
// runs a TTL sweep — hence also the two /health routes registered above this mount.
// The session secret chain is core's and is character-identical to the one this
// block used: SESSION_SECRET → JWT_SECRET → a dev default, and '' in production so
// the fail-fast secret validation at the top of this file is what surfaces a
// missing value.
//
// `sessionStore` stays a named binding: the Oracle ADB cursor diagnostics attach
// above reaches connect-mongo's OWN MongoClient through sessionStore.clientP, where
// 100% of the observed malformed cursor replies occur.
const { middleware: sessionMiddleware, store: sessionStore } = webCore.buildSessionMiddleware({
  mongoUrl: process.env.MONGODB_URI,
  ttlSeconds: 600,
  cookieName: 'portal.sid'
});

app.use(sessionMiddleware);

// .well-known/security.txt — RFC 9116 disclosure policy.
// Explicit route because Express's serve-static ignores dotfiles by
// default (and globally allowing dotfiles would expose other dot-paths
// we don't want public).
app.get('/.well-known/security.txt', (req, res) => {
  res.type('text/plain').sendFile(path.join(__dirname, 'public', '.well-known', 'security.txt'));
});

// Favicon — serve the brand icon directly. Without an explicit route,
// /favicon.ico falls through to a cross-origin or missing icon, which trips CSP
// img-src 'self' in every embedded page and iframe whose document declares no
// favicon. Serving a same-origin icon here kills that console error site-wide in
// one place.
app.get('/favicon.ico', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('image/png').sendFile(path.join(__dirname, 'public', 'assets', 'images', 'brand', 'favicon-32x32.png'));
});

// Explicit 404s for common sensitive-path probes — closes the 302 leak
// the comparative audit flagged (the quarantine middleware that produced
// those 302s was deleted in Plan 3 Task 36; these 404s are the standing
// behaviour now). Files are not exposed either way; this just produces the
// clean response semantic scanners and audit tools expect. List
// intentionally short — common scanner targets only.
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
  // ADMIN IP GATE REMOVED (owner decision, 2026-09-11): the admin surface is
  // now reachable from any IP and is protected by password auth + authLimiter
  // (5 attempts / 15 min) alone. The operator surface stays store-IP gated.
  // Same defense for the operator surface (store-IP gated).
  if (/^\/operator\/?$/i.test(p) || /operator-(login|scan)-embed\.html$/i.test(p)) {
    return operatorIpGate(req, res, next);
  }
  return next();
});

app.use('/', embedRoutes);


// Mount monitoring dashboard BEFORE static files for CSP nonce injection.
// NOTE: this was IP-gated to the admin allowlist because /monitoring/status
// serves real connectivity-monitor data (service names, host error strings).
// The gate was removed by owner decision 2026-09-11, so that data is now
// publicly reachable.
app.use('/monitoring', monitoringRoutes);

// Handle direct monitoring-dashboard.html path
app.get('/monitoring-dashboard.html', (req, res) => {
  res.redirect('/monitoring/');
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

// /scanbag-manifest.json — the scan-bag PWA manifest, brand-filled so the installed
// app name matches the configured brand ({{BRAND_NAME}} resolves from
// server/config/brand.js). Must precede express.static, which would otherwise serve
// the raw template with the placeholder unresolved.
app.get('/scanbag-manifest.json', async (req, res) => {
  try {
    const brand = require('./server/config/brand');
    const raw = await require('fs').promises.readFile(
      path.join(__dirname, 'public', 'scanbag-manifest.json'), 'utf8');
    res.type('application/manifest+json')
      .set('Cache-Control', 'no-cache, no-store, must-revalidate')
      .send(raw.replace(/\{\{BRAND_NAME\}\}/g, brand.displayName));
  } catch (err) {
    logger.error('Error serving /scanbag-manifest.json:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Serve static files in all environments.
// NOTE: this is the mount that actually serves everything under public/ -- it
// precedes the second express.static(public) mount further down, so ANY option
// set there is dead code (verified in production: the locale CORS headers that
// mount intends were absent from the live response). Configure static file
// headers HERE.
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.includes('/locales/') || filePath.includes('\\locales\\')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      // express.static defaults to max-age=0, so this 73 KB bundle revalidated
      // on EVERY page load even once its URL became stable. It is requested
      // with the deploy-stable ?v= token (see server/config/assetVersion.js),
      // so a TTL is safe: a deploy changes the URL, not the cached entry.
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

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

// Serve static files from public directory.
// SHADOWED: the express.static(public) mount above already serves every file
// under public/ and short-circuits, so this mount is only reachable for paths
// that do not resolve to a file -- where it is a no-op. Its former setHeaders
// block (locale CORS headers) never ran in production. Kept as a harmless
// fall-through; put static header config on the FIRST mount, not here.
app.use(express.static(path.join(__dirname, 'public')));

// API Routes with versioning
const apiV1Router = express.Router();

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
apiV1Router.use('/administrators', administratorRoutes);
apiV1Router.use('/operators', operatorRoutes);
apiV1Router.use('/system/config', systemConfigRoutes);
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

// Root route: portal.atxwashdryfold.com/ lands on the affiliate login. Serve the
// affiliate-program SPA shell with window.__DEFAULT_ROUTE='/affiliate-login' injected
// (clean address bar, mirrors the /admin and /operator handlers). PUBLIC — the affiliate
// login credentials are the gate. Since the marketing host families moved to
// crhs-corporate on :3001 (Plan 3), nothing pre-empts `/` any more: every host that
// reaches this app — the portal and any other — gets the affiliate-login shell.
const { readHTMLWithNonce: adminReadHTML } = require('./server/utils/cspHelper');
app.get('/', async (req, res) => {
  try {
    const nonce = res.locals.cspNonce;
    let html = await adminReadHTML(path.join(__dirname, 'public', 'embed-app-v2.html'), nonce);
    const inject = `<script nonce="${nonce}">window.__DEFAULT_ROUTE='/affiliate-login';</script>`;
    html = html.replace('</head>', `${inject}</head>`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('html').send(html);
  } catch (err) {
    logger.error('Error serving / (affiliate-login shell):', err);
    res.status(500).send('Internal Server Error');
  }
});
// (The public affiliate-interest form served here until 2026-09-22. It is now
// crhs-corporate's, at https://atxwashdryfold.com/affiliate — translated into all
// four languages, which the portal's copy never was. The portal links to it through
// INTEREST_FORM_URL / server/config/links.js, so nothing here should route /affiliate
// again: a local route would silently shadow the configured URL. Plan 3 Task 16.)

// RETIRED 2026-09-14 (owner decision). This slug served a franchisor-branded
// affiliate interest page; it is withdrawn following the 2026-08-26 trademark
// complaints. The URL answers 410 Gone — deliberately NOT a 301 to /affiliate,
// so crawlers and printed-flyer QR scans see the page as permanently removed
// rather than as a renamed one. Day-long cache so the 410 is cheap to serve.
app.get(['/wavemax-affiliate', '/wavemax-affiliate/'], (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.status(410).end();
});

// Clean admin URL: GET /admin serves the SPA shell pointed at the administrator
// portal (no visible ?route= in the address bar). IP-gated to the admin allowlist
// (stealth 404 otherwise). The injected window.__DEFAULT_ROUTE is read by
// embed-app-v2.js getRouteFromUrl(); SessionManager then routes an authenticated
// admin to the dashboard and everyone else to the login page.
app.get(['/admin', '/admin/'], async (req, res) => {
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
app.get('/admin/*', (req, res, next) => {
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

// robots.txt and sitemap.xml. This app is served on exactly ONE host now, so
// there is no per-hostname map to maintain: both documents name the canonical
// portal origin unconditionally. Reflecting `req.hostname` back into the body
// (which is what the retired multi-domain map did) would put an attacker-chosen
// Host into a cached, crawler-read document; the marketing hosts that map
// existed for belong to crhs-corporate on :3001, which serves its own.
// Plan 3 Task 37.
const PORTAL_ORIGIN = 'https://portal.atxwashdryfold.com';
app.get('/robots.txt', (req, res) => {
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
    `Sitemap: ${PORTAL_ORIGIN}/sitemap.xml\n`
  );
});

app.get('/sitemap.xml', (req, res) => {
  const now = new Date().toISOString().slice(0, 10);

  // Apex-only and single-host: Phase 4b retired the deep marketing pages and
  // Plan 3 Task 16 moved the marketing hosts to crhs-corporate, so the only
  // canonical URL this app has to advertise is the portal apex. The retired
  // promo hosts 301 to it, so they need no entry of their own.
  const urls = [{ loc: `${PORTAL_ORIGIN}/`, priority: '1.0' }];

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

// (The marketing-host fall-through lived here until 2026-09-22. It existed only to
// catch the store IP, the one client that bypassed the partner-landing gate on those
// host families, and send it to the app shell instead of the API JSON 404. With those
// hosts now served entirely by crhs-corporate on :3001, no request on them reaches
// this app at all, so the handler had nothing left to catch. Plan 3 Task 16.)

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