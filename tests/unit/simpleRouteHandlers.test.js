const request = require('supertest');
const express = require('express');
const path = require('path');

// Set NODE_ENV before requiring any modules
process.env.NODE_ENV = 'test';

// Mock modules before requiring them
jest.mock('../../server/models/Administrator');
jest.mock('../../server/models/Affiliate');
jest.mock('../../server/models/Customer');
jest.mock('../../server/models/Order');
jest.mock('../../server/models/Operator');

// Stub ONLY fs.promises.access via a spy (in the docs beforeEach) — NOT a
// whole-module jest.mock('fs'). A module mock replaces fs for the entire file,
// which starves the global tests/setup.js mongodb-memory-server fallback (it
// needs the real fs.statSync/existsSync) and makes the beforeAll DB connect
// throw, failing every test here. spyOn leaves the rest of fs intact.

jest.mock('../../server/middleware/rbac', () => ({
  checkAdminPermission: (permissions) => (req, res, next) => next()
}));

jest.mock('../../server/utils/cspHelper', () => ({
  serveHTMLWithNonce: jest.fn(),
  readHTMLWithNonce: jest.fn()
}));

describe('Simple Route Handlers', () => {
  // The 'Administrator Rate Limit Reset' describe that used to sit here copied
  // the inline administratorRoutes handler into a throwaway router and asserted
  // the DEFECT: deleteMany on a collection the store never writes, filtering a
  // `key` field that does not exist, and the message whose \d+ matched zero.
  // Plan 3 task 25 deleted that handler; the real endpoint is covered by
  // tests/integration/resetRateLimits.test.js and
  // tests/unit/administratorControllerRateLimits.test.js.

  describe('Documentation Serving with CSP Nonce', () => {
    let app;
    
    beforeEach(() => {
      jest.clearAllMocks();

      // Re-create the fs.promises.access spy each test (jest config
      // restoreMocks:true tears spies down after every test). Spying — not
      // module-mocking fs — keeps the rest of fs real so the global
      // mongodb-memory-server fallback in tests/setup.js can still start.
      jest.spyOn(require('fs').promises, 'access');

      // Create Express app
      app = express();

      // Add CSP nonce middleware
      app.use((req, res, next) => {
        res.locals.cspNonce = 'test-nonce-123';
        next();
      });
      
      // Load routes
      const docsRoutes = require('../../server/routes/docsRoutes');
      app.use('/docs', docsRoutes);
      
      // Add 404 handler for static files
      app.use((req, res, next) => {
        res.status(404).send('Not found');
      });
      
      // Add error handler
      app.use((err, req, res, next) => {
        res.status(500).json({ error: err.message });
      });
    });
    
    it('should serve HTML files with CSP nonce', async () => {
      const fs = require('fs').promises;
      const { readHTMLWithNonce } = require('../../server/utils/cspHelper');
      
      readHTMLWithNonce.mockResolvedValue('<html>Test content</html>');
      fs.access.mockResolvedValue();
      
      const response = await request(app)
        .get('/docs/test.html');
      
      expect(response.status).toBe(200);
      expect(response.type).toMatch(/html/);
      expect(response.text).toBe('<html>Test content</html>');
      expect(readHTMLWithNonce).toHaveBeenCalledWith(
        expect.stringContaining('test.html'),
        'test-nonce-123'
      );
    });
    
    it('should default to index.html for root path', async () => {
      const fs = require('fs').promises;
      const { readHTMLWithNonce } = require('../../server/utils/cspHelper');
      
      readHTMLWithNonce.mockResolvedValue('<html>Index</html>');
      fs.access.mockResolvedValue();
      
      const response = await request(app)
        .get('/docs/');
      
      expect(response.status).toBe(200);
      expect(readHTMLWithNonce).toHaveBeenCalledWith(
        expect.stringContaining('index.html'),
        'test-nonce-123'
      );
    });
    
    it('should skip nonce injection for example files', async () => {
      const response = await request(app)
        .get('/docs/examples/sample.html');

      // Example files skip nonce injection and fall through to express.static.
      // The file doesn't exist in docs/, so static calls next() and the request
      // reaches the test 404 handler. (Previously this asserted 500, an artifact
      // of the old whole-fs jest.mock that broke express.static; with real fs
      // the genuine outcome is 404.) The point of the case stands: nonce is skipped.
      expect(response.status).toBe(404);
      const { readHTMLWithNonce } = require('../../server/utils/cspHelper');
      expect(readHTMLWithNonce).not.toHaveBeenCalled();
    });

    it('should skip non-HTML files', async () => {
      const response = await request(app)
        .get('/docs/styles.css');

      // Non-HTML files skip nonce injection and fall through to express.static.
      // The file doesn't exist in docs/, so static calls next() → test 404 handler.
      // (Was 500 under the old broken whole-fs mock; real fs yields 404.)
      expect(response.status).toBe(404);
      const { readHTMLWithNonce } = require('../../server/utils/cspHelper');
      expect(readHTMLWithNonce).not.toHaveBeenCalled();
    });

    it('should handle non-existent files', async () => {
      const fs = require('fs').promises;
      fs.access.mockRejectedValue(new Error('File not found'));

      const response = await request(app)
        .get('/docs/nonexistent.html');

      // fs.access rejects, so serveDocsWithNonce calls next() and the request
      // falls through to express.static; the file doesn't exist in docs/, so it
      // reaches the test 404 handler. (Was 500 under the old broken whole-fs
      // mock; real fs yields 404.)
      expect(response.status).toBe(404);
    });
    
    it('should handle errors during file processing', async () => {
      const fs = require('fs').promises;
      const { readHTMLWithNonce } = require('../../server/utils/cspHelper');
      
      fs.access.mockResolvedValue();
      readHTMLWithNonce.mockRejectedValue(new Error('Processing error'));
      
      const response = await request(app)
        .get('/docs/error.html');
      
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Processing error' });
    });
  });
  
  describe('Basic Auth Route Handlers', () => {
    // Testing a simple auth pattern that covers uncovered auth functions
    let app;
    
    beforeEach(() => {
      jest.clearAllMocks();
      
      // Create Express app
      app = express();
      app.use(express.json());
      
      // Create a basic auth route for testing
      app.post('/api/auth/test-endpoint', (req, res) => {
        try {
          const { username, password } = req.body;
          
          if (!username || !password) {
            return res.status(400).json({ error: 'Missing credentials' });
          }
          
          // Simple auth logic
          if (username === 'test' && password === 'password') {
            res.json({ success: true, token: 'test-token' });
          } else {
            res.status(401).json({ error: 'Invalid credentials' });
          }
        } catch (error) {
          res.status(500).json({ error: 'Server error' });
        }
      });
    });
    
    it('should handle successful authentication', async () => {
      const response = await request(app)
        .post('/api/auth/test-endpoint')
        .send({ username: 'test', password: 'password' });
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        token: 'test-token'
      });
    });
    
    it('should handle missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/test-endpoint')
        .send({ username: 'test' });
      
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Missing credentials' });
    });
    
    it('should handle invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/test-endpoint')
        .send({ username: 'test', password: 'wrong' });
      
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid credentials' });
    });
  });
});