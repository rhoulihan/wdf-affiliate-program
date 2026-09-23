const path = require('path');

// Stub ONLY fs.promises.readFile via a spy — NOT a whole-module mock. A
// `jest.mock('fs')` replaces the module for the entire file, which starves the
// global tests/setup.js mongodb-memory-server fallback (it needs the real
// fs.statSync/existsSync) and makes the beforeAll DB connect throw, failing
// every test here. spyOn leaves the rest of fs intact.
const fs = require('fs').promises;
const logger = require('../../server/utils/logger');
const { injectNonce, readHTMLWithNonce, serveHTMLWithNonce } = require('../../server/utils/cspHelper');

// Mock console.error and console.log
const originalConsoleError = console.error;
const originalConsoleLog = console.log;
beforeAll(() => {
  console.error = jest.fn();
  console.log = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
  console.log = originalConsoleLog;
});

describe('CSP Helper Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-create the readFile spy each test (jest config restoreMocks:true tears
    // spies down after every test). Spying — not module-mocking — keeps the rest
    // of fs real so the global mongodb-memory-server fallback can still start.
    jest.spyOn(fs, 'readFile');
    // The util logs via Winston (logger), not console (console.* is ESLint-banned
    // in server/). Spy on the logger so the log-message assertions hold.
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.spyOn(logger, 'info').mockImplementation(() => {});
  });

  describe('injectNonce', () => {
    const testNonce = 'test-nonce-123';

    it('should return original HTML if nonce is not provided', () => {
      const html = '<script>console.log("test");</script>';
      const result = injectNonce(html, '');
      expect(result).toBe(html);
    });

    it('should replace {{CSP_NONCE}} placeholders', () => {
      const html = '<script nonce="{{CSP_NONCE}}">console.log("test");</script>';
      const result = injectNonce(html, testNonce);
      expect(result).toBe(`<script nonce="${testNonce}">console.log("test");</script>`);
    });

    it('should add nonce to script tags without nonce', () => {
      const html = '<script>console.log("test");</script>';
      const result = injectNonce(html, testNonce);
      expect(result).toBe(`<script nonce="${testNonce}">console.log("test");</script>`);
    });

    it('should not add nonce to script tags that already have nonce', () => {
      const html = `<script nonce="existing-nonce">console.log("test");</script>`;
      const result = injectNonce(html, testNonce);
      expect(result).toBe(html);
    });

    it('should add nonce to style tags without nonce', () => {
      const html = '<style>body { color: red; }</style>';
      const result = injectNonce(html, testNonce);
      expect(result).toBe(`<style nonce="${testNonce}">body { color: red; }</style>`);
    });

    it('should not add nonce to style tags that already have nonce', () => {
      const html = `<style nonce="existing-nonce">body { color: red; }</style>`;
      const result = injectNonce(html, testNonce);
      expect(result).toBe(html);
    });

    it('should add nonce to stylesheet link tags', () => {
      const html = '<link rel="stylesheet" href="styles.css">';
      const result = injectNonce(html, testNonce);
      expect(result).toBe(`<link rel="stylesheet" href="styles.css" nonce="${testNonce}">`);
    });

    it('should not add nonce to non-stylesheet link tags', () => {
      const html = '<link rel="icon" href="favicon.ico">';
      const result = injectNonce(html, testNonce);
      expect(result).toBe(html);
    });

    it('should update meta tag with name="csp-nonce"', () => {
      const html = '<meta name="csp-nonce" content="">';
      const result = injectNonce(html, testNonce);
      // Plan 3 Task 20: web-core's injectNonce now fills the meta IN PLACE. This
      // previously asserted `content="" content="…"`, which is what the portal actually
      // served — HTML keeps the first attribute, so window.CSP_NONCE was ''.
      expect(result).toBe(`<meta name="csp-nonce" content="${testNonce}">`);
    });

    it('should handle complex HTML with multiple elements', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="csp-nonce" content="">
          <link rel="stylesheet" href="styles.css">
          <link rel="icon" href="favicon.ico">
          <style>body { margin: 0; }</style>
          <script nonce="{{CSP_NONCE}}">console.log("inline");</script>
        </head>
        <body>
          <script>console.log("body script");</script>
          <script nonce="existing">console.log("existing nonce");</script>
        </body>
        </html>
      `;
      
      const result = injectNonce(html, testNonce);
      
      expect(result).toContain(`<meta name="csp-nonce" content="${testNonce}">`);
      expect(result).toContain(`<link rel="stylesheet" href="styles.css" nonce="${testNonce}">`);
      expect(result).toContain('<link rel="icon" href="favicon.ico">'); // Should not change
      expect(result).toContain(`<style nonce="${testNonce}">body { margin: 0; }</style>`);
      expect(result).toContain(`<script nonce="${testNonce}">console.log("inline");</script>`);
      expect(result).toContain(`<script nonce="${testNonce}">console.log("body script");</script>`);
      expect(result).toContain('<script nonce="existing">console.log("existing nonce");</script>'); // Should not change
    });

    it('should handle script tags with attributes', () => {
      const html = '<script src="app.js" type="module" defer></script>';
      const result = injectNonce(html, testNonce);
      expect(result).toBe(`<script nonce="${testNonce}" src="app.js" type="module" defer></script>`);
    });

    it('should handle style tags with attributes', () => {
      const html = '<style type="text/css" media="screen">body { color: blue; }</style>';
      const result = injectNonce(html, testNonce);
      expect(result).toBe(`<style nonce="${testNonce}" type="text/css" media="screen">body { color: blue; }</style>`);
    });
  });

  describe('readHTMLWithNonce', () => {
    const testNonce = 'test-nonce-123';
    const testFilePath = '/path/to/test.html';
    const testHTML = '<script>console.log("test");</script>';

    it('should read file and inject nonce', async () => {
      fs.readFile.mockResolvedValue(testHTML);
      
      const result = await readHTMLWithNonce(testFilePath, testNonce);
      
      expect(fs.readFile).toHaveBeenCalledWith(testFilePath, 'utf8');
      expect(result).toBe(`<script nonce="${testNonce}">console.log("test");</script>`);
    });

    it('should handle file read errors', async () => {
      const error = new Error('File not found');
      fs.readFile.mockRejectedValue(error);
      
      await expect(readHTMLWithNonce(testFilePath, testNonce)).rejects.toThrow('File not found');
      expect(logger.error).toHaveBeenCalledWith(`Error reading HTML file ${testFilePath}:`, error);
    });

    it('should pass empty nonce through to injectNonce', async () => {
      fs.readFile.mockResolvedValue(testHTML);
      
      const result = await readHTMLWithNonce(testFilePath, '');
      
      expect(result).toBe(testHTML); // Should return original HTML when nonce is empty
    });
  });

  describe('serveHTMLWithNonce', () => {
    let req, res, middleware;
    const htmlPath = 'test.html';
    const testNonce = 'test-nonce-123';
    const testHTML = '<script>console.log("test");</script>';

    beforeEach(() => {
      req = {};
      res = {
        locals: { cspNonce: testNonce },
        setHeader: jest.fn(),
        type: jest.fn().mockReturnThis(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis()
      };
      middleware = serveHTMLWithNonce(htmlPath);
    });

    it('should serve HTML with nonce successfully', async () => {
      fs.readFile.mockResolvedValue(testHTML);
      
      await middleware(req, res);
      
      expect(logger.info).toHaveBeenCalledWith(
        `[CSP] Serving HTML with nonce: ${htmlPath}, nonce: ${testNonce}`
      );
      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(__dirname, '../../server/utils/../../public', htmlPath),
        'utf8'
      );
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-store, must-revalidate');
      expect(res.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Expires', '0');
      expect(res.type).toHaveBeenCalledWith('html');
      expect(res.send).toHaveBeenCalledWith(`<script nonce="${testNonce}">console.log("test");</script>`);
    });

    it('should handle errors when serving HTML', async () => {
      const error = new Error('File read error');
      fs.readFile.mockRejectedValue(error);
      
      await middleware(req, res);
      
      expect(logger.error).toHaveBeenCalledWith('Error serving HTML with nonce:', error);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Internal Server Error');
    });

    it('should handle missing nonce in res.locals', async () => {
      res.locals.cspNonce = undefined;
      fs.readFile.mockResolvedValue(testHTML);
      
      await middleware(req, res);
      
      expect(logger.info).toHaveBeenCalledWith(
        `[CSP] Serving HTML with nonce: ${htmlPath}, nonce: undefined`
      );
      expect(res.send).toHaveBeenCalledWith(testHTML); // Original HTML without nonce
    });

    it('should construct correct file path', async () => {
      const nestedPath = 'subfolder/page.html';
      const nestedMiddleware = serveHTMLWithNonce(nestedPath);
      fs.readFile.mockResolvedValue(testHTML);
      
      await nestedMiddleware(req, res);
      
      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(__dirname, '../../server/utils/../../public', nestedPath),
        'utf8'
      );
    });
  });
});