// firebasePhoneService — server-side verification of Firebase Phone Auth tokens (PR 7).
//
// The browser drives the SMS OTP (Firebase client SDK + reCAPTCHA) and returns
// a Firebase ID token; the server only verifies that token via the Admin SDK
// and extracts the verified E.164 phone number. We do NOT adopt Firebase as our
// auth system — we consume the phone number, then create our own Customer.
//
// Lazy-init: the Admin SDK is only initialized when verification is actually
// needed, so the app boots cleanly with no Firebase env (flag off → never
// touched). The service-account JSON lives on-box, off git, at
// FIREBASE_SERVICE_ACCOUNT_PATH.

const logger = require('../utils/logger');

/** Phone verification is gated behind a feature flag (off → email-only). */
function isEnabled() {
  return process.env.PHONE_VERIFICATION_ENABLED === 'true';
}

let authClient = null;
function getAuthClient() {
  if (!authClient) {
    // Required lazily, via the modular firebase-admin/* entry points the SDK
    // exposes in v14 — the old namespaced default export (`admin.credential`,
    // `admin.auth()`, `admin.apps`) was removed in v14, so requiring
    // 'firebase-admin' and reading `.credential` yields undefined. Lazy so the
    // app boots without firebase-admin until phone verification is switched on.
    // eslint-disable-next-line global-require
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    // eslint-disable-next-line global-require
    const { getAuth } = require('firebase-admin/auth');
    let app = getApps()[0];
    if (!app) {
      const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
      if (!path) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH is not configured');
      }
      // eslint-disable-next-line global-require
      const serviceAccount = require(path);
      app = initializeApp({ credential: cert(serviceAccount) });
      logger.info('Firebase Admin SDK initialized for phone verification');
    }
    authClient = getAuth(app);
  }
  return authClient;
}

/**
 * Verify a Firebase phone ID token and return the verified E.164 phone number.
 * @throws when the token is missing, invalid, or carries no phone_number.
 */
async function verifyPhoneToken(idToken) {
  if (!idToken) {
    throw new Error('Missing phone ID token');
  }
  const decoded = await getAuthClient().verifyIdToken(idToken);
  const phone = decoded && decoded.phone_number;
  if (!phone) {
    throw new Error('ID token has no verified phone number');
  }
  return phone;
}

module.exports = { isEnabled, verifyPhoneToken };
