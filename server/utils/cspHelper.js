// Shim/wrapper — cspHelper now lives in @crhs/web-core. web-core's injectNonce
// and readHTMLWithNonce take an OPT-IN brand as their 3rd arg, and its
// serveHTMLWithNonce takes an explicit baseDir. This wrapper binds THIS app's
// brand (server/config/brand.js) and its public/ base dir so every existing
// call site (embedRoutes, docsRoutes, monitoringRoutes, server.js legal pages,
// customerController) keeps working byte-identically.
const path = require('path');
const wc = require('@crhs/web-core').cspHelper;
const logger = require('./logger');
const brand = require('../config/brand');

const injectNonce = (html, nonce) => wc.injectNonce(html, nonce, brand);
const readHTMLWithNonce = (filePath, nonce) => wc.readHTMLWithNonce(filePath, nonce, brand);

// Preserves the monorepo signature: single relative path resolved against
// public/, brand + nonce injected, no-cache headers, html sent.
const serveHTMLWithNonce = (htmlPath) => async (req, res) => {
  try {
    const fullPath = path.join(__dirname, '../../public', htmlPath);
    logger.info(`[CSP] Serving HTML with nonce: ${htmlPath}, nonce: ${res.locals.cspNonce}`);
    const html = await readHTMLWithNonce(fullPath, res.locals.cspNonce);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.type('html').send(html);
  } catch (error) {
    logger.error('Error serving HTML with nonce:', error);
    res.status(500).send('Internal Server Error');
  }
};

module.exports = { injectNonce, readHTMLWithNonce, serveHTMLWithNonce };
