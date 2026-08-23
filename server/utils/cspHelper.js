// CSP Helper Utilities for Laundromat Affiliate Program
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const brand = require('../config/brand');

/**
 * Injects CSP nonce into HTML content
 * @param {string} html - The HTML content
 * @param {string} nonce - The CSP nonce
 * @returns {string} HTML with nonce attributes added
 */
const injectNonce = (html, nonce) => {
  // Brand placeholders (resolve from server/config/brand.js).
  html = html
    .replace(/\{\{BRAND_NAME\}\}/g, brand.displayName)
    .replace(/\{\{BRAND_SHORT\}\}/g, brand.shortName)
    .replace(/\{\{BRAND_LEGAL\}\}/g, brand.legalName);
  // Fill the empty brand-name meta (mirror the csp-nonce meta fill).
  html = html.replace(
    /<meta([^>]*name=["']brand-name["'][^>]*content=["'])["']([^>]*)>/gi,
    `<meta$1${brand.displayName}"$2>`
  );

  if (!nonce) return html;
  
  // Replace {{CSP_NONCE}} placeholders
  html = html.replace(/\{\{CSP_NONCE\}\}/g, nonce);
  
  // Add nonce to all script tags (but not in JavaScript strings)
  html = html.replace(
    /<script(?![^>]*\snonce=)(?=\s|>)/gi,
    `<script nonce="${nonce}"`
  );
  
  // Add nonce to all style tags (but not in JavaScript strings)
  html = html.replace(
    /<style(?![^>]*\snonce=)(?=\s|>)/gi,
    `<style nonce="${nonce}"`
  );
  
  // Add nonce to all link tags with rel="stylesheet" (but not in JavaScript strings)
  // Only process stylesheet links, not other types like icons
  html = html.replace(
    /<link([^>]*rel=["']stylesheet["'][^>]*)(?![^>]*\snonce=)>/gi,
    `<link$1 nonce="${nonce}">`
  );
  
  // Add nonce to meta tag with name="csp-nonce"
  html = html.replace(
    /<meta([^>]*name=["']csp-nonce["'][^>]*content=["']["'][^>]*)>/gi,
    `<meta$1 content="${nonce}">`
  );
  
  return html;
};

/**
 * Reads an HTML file and injects CSP nonce
 * @param {string} filePath - Path to the HTML file
 * @param {string} nonce - The CSP nonce
 * @returns {Promise<string>} HTML content with nonce injected
 */
const readHTMLWithNonce = async (filePath, nonce) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return injectNonce(content, nonce);
  } catch (error) {
    logger.error(`Error reading HTML file ${filePath}:`, error);
    throw error;
  }
};

/**
 * Express middleware to serve HTML files with CSP nonce
 * @param {string} htmlPath - Path to the HTML file relative to public directory
 * @returns {Function} Express middleware function
 */
const serveHTMLWithNonce = (htmlPath) => {
  return async (req, res) => {
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
};

module.exports = {
  injectNonce,
  readHTMLWithNonce,
  serveHTMLWithNonce
};