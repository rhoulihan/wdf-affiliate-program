// Routes for serving documentation HTML files with CSP nonces
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

// Middleware to serve documentation files with nonce injection
const serveDocsWithNonce = async (req, res, next) => {
  try {
    // Get the requested path
    let filePath = req.path;

    // Default to index.html for root
    if (filePath === '/' || filePath === '') {
      filePath = '/index.html';
    }

    // Ensure it's an HTML file
    if (!filePath.endsWith('.html')) {
      return next();
    }

    // Skip nonce injection for example files (they contain code snippets for users to copy)
    if (filePath.includes('/examples/')) {
      return next();
    }

    // Construct full path
    const fullPath = path.join(__dirname, '../../docs', filePath);

    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch (error) {
      return next();
    }

    // Read and serve file with nonce
    const { readHTMLWithNonce } = require('../utils/cspHelper');
    const html = await readHTMLWithNonce(fullPath, res.locals.cspNonce);
    res.type('html').send(html);
  } catch (error) {
    logger.error('Error serving documentation with nonce:', error);
    next(error);
  }
};

// Apply nonce injection to all routes
router.use(serveDocsWithNonce);

// Serve static assets (CSS, JS, images) without nonce injection
router.use(express.static(path.join(__dirname, '../../docs')));

module.exports = router;