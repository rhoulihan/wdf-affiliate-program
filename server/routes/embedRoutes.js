// Routes for serving embed HTML files with CSP nonces
const express = require('express');
const router = express.Router();
const { serveHTMLWithNonce } = require('../utils/cspHelper');
const operatorIpGate = require('../middleware/operatorIpGate');

// Main embed app container V2 - CSP compliant version
router.get('/embed-app-v2.html', serveHTMLWithNonce('embed-app-v2.html'));

// Main embed app container V1 - Redirect to V2 (CSP compliant)
router.get('/embed-app.html', serveHTMLWithNonce('embed-app-v2.html'));

// Terms and Conditions
router.get('/terms-and-conditions-embed.html', serveHTMLWithNonce('terms-and-conditions-embed.html'));

// Privacy Policy
router.get('/privacy-policy.html', serveHTMLWithNonce('privacy-policy.html'));

// Operator Scan
router.get('/operator-login-embed.html', operatorIpGate, serveHTMLWithNonce('operator-login-embed.html'));
router.get('/operator-scan-embed.html', operatorIpGate, serveHTMLWithNonce('operator-scan-embed.html'));

// Affiliate Login
router.get('/affiliate-login-embed.html', serveHTMLWithNonce('affiliate-login-embed.html'));

// Affiliate Register
router.get('/affiliate-register-embed.html', serveHTMLWithNonce('affiliate-register-embed.html'));

// Forgot Password
router.get('/forgot-password-embed.html', serveHTMLWithNonce('forgot-password-embed.html'));

// Reset Password
router.get('/reset-password-embed.html', serveHTMLWithNonce('reset-password-embed.html'));

// Administrator Login (IP-gated — the admin surface is restricted to the allowlist)
router.get('/administrator-login-embed.html', serveHTMLWithNonce('administrator-login-embed.html'));

// Administrator Dashboard (IP-gated)
router.get('/administrator-dashboard-embed.html', serveHTMLWithNonce('administrator-dashboard-embed.html'));

// Landing Page
router.get('/embed-landing.html', serveHTMLWithNonce('embed-landing.html'));

// Affiliate Dashboard
router.get('/affiliate-dashboard-embed.html', serveHTMLWithNonce('affiliate-dashboard-embed.html'));

// Affiliate Success
router.get('/affiliate-success-embed.html', serveHTMLWithNonce('affiliate-success-embed.html'));

// Affiliate Landing
router.get('/affiliate-landing-embed.html', serveHTMLWithNonce('affiliate-landing-embed.html'));

// Add more routes as we migrate pages...

module.exports = router;