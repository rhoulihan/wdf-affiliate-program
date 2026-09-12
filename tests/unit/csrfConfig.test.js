const httpMocks = require('node-mocks-http');
const {
  CSRF_CONFIG,
  shouldEnforceCsrf,
  conditionalCsrf,
  csrfProtection,
  csrfTokenEndpoint
} = require('../../server/config/csrf-config');

describe('CSRF Configuration', () => {
  let req;

  beforeEach(() => {
    req = {
      path: '/api/v1/test',
      method: 'POST'
    };

    // Reset environment variables
    delete process.env.CSRF_PHASE;
  });

  describe('CSRF_CONFIG', () => {
    it('should define all endpoint categories', () => {
      expect(CSRF_CONFIG.PUBLIC_ENDPOINTS).toBeDefined();
      expect(CSRF_CONFIG.AUTH_ENDPOINTS).toBeDefined();
      expect(CSRF_CONFIG.REGISTRATION_ENDPOINTS).toBeDefined();
      expect(CSRF_CONFIG.CRITICAL_ENDPOINTS).toBeDefined();
      expect(CSRF_CONFIG.HIGH_PRIORITY_ENDPOINTS).toBeDefined();
      expect(CSRF_CONFIG.READ_ONLY_ENDPOINTS).toBeDefined();
    });

    it('should have valid endpoint patterns', () => {
      // Check that all endpoints start with /api
      const allEndpoints = [
        ...CSRF_CONFIG.PUBLIC_ENDPOINTS,
        ...CSRF_CONFIG.AUTH_ENDPOINTS,
        ...CSRF_CONFIG.REGISTRATION_ENDPOINTS,
        ...CSRF_CONFIG.CRITICAL_ENDPOINTS,
        ...CSRF_CONFIG.HIGH_PRIORITY_ENDPOINTS,
        ...CSRF_CONFIG.READ_ONLY_ENDPOINTS
      ];

      allEndpoints.forEach(endpoint => {
        expect(endpoint).toMatch(/^\/api/);
      });
    });

    it('should not have duplicate endpoints across categories', () => {
      const allEndpoints = [
        ...CSRF_CONFIG.PUBLIC_ENDPOINTS,
        ...CSRF_CONFIG.AUTH_ENDPOINTS,
        ...CSRF_CONFIG.REGISTRATION_ENDPOINTS,
        ...CSRF_CONFIG.CRITICAL_ENDPOINTS,
        ...CSRF_CONFIG.HIGH_PRIORITY_ENDPOINTS,
        ...CSRF_CONFIG.READ_ONLY_ENDPOINTS
      ];

      const uniqueEndpoints = new Set(allEndpoints);
      expect(uniqueEndpoints.size).toBe(allEndpoints.length);
    });

    it('should include critical security endpoints', () => {
      // Logout must be protected to prevent CSRF logout attacks
      expect(CSRF_CONFIG.CRITICAL_ENDPOINTS).toContain('/api/v1/auth/logout');

      // Order operations must be protected
      expect(CSRF_CONFIG.CRITICAL_ENDPOINTS).toContain('/api/v1/orders');
      expect(CSRF_CONFIG.CRITICAL_ENDPOINTS).toContain('/api/v1/orders/:orderId/cancel');

      // Data deletion must be protected
      expect(CSRF_CONFIG.CRITICAL_ENDPOINTS).toContain('/api/v1/affiliates/:affiliateId/delete-all-data');
    });

    it('should exclude authentication endpoints from CSRF', () => {
      // Login endpoints should use rate limiting instead
      expect(CSRF_CONFIG.AUTH_ENDPOINTS).toContain('/api/auth/affiliate/login');
      expect(CSRF_CONFIG.AUTH_ENDPOINTS).toContain('/api/auth/administrator/login');
      expect(CSRF_CONFIG.AUTH_ENDPOINTS).toContain('/api/auth/operator/login');
    });

    it('should exclude registration endpoints from CSRF', () => {
      // Registration endpoints should use CAPTCHA instead
      expect(CSRF_CONFIG.REGISTRATION_ENDPOINTS).toContain('/api/affiliates/register');
      expect(CSRF_CONFIG.REGISTRATION_ENDPOINTS).toContain('/api/v1/customers/claim/:bagToken/register');
    });
  });

  describe('shouldEnforceCsrf', () => {
    describe('HTTP method checks', () => {
      it('should not enforce CSRF for GET requests', () => {
        req.method = 'GET';
        req.path = '/api/v1/orders';
        expect(shouldEnforceCsrf(req)).toBe(false);
      });

      it('should not enforce CSRF for HEAD requests', () => {
        req.method = 'HEAD';
        req.path = '/api/v1/orders';
        expect(shouldEnforceCsrf(req)).toBe(false);
      });

      it('should not enforce CSRF for OPTIONS requests', () => {
        req.method = 'OPTIONS';
        req.path = '/api/v1/orders';
        expect(shouldEnforceCsrf(req)).toBe(false);
      });

      it('should consider CSRF for POST requests', () => {
        req.method = 'POST';
        req.path = '/api/v1/orders';
        expect(shouldEnforceCsrf(req)).toBe(true);
      });

      it('should consider CSRF for PUT requests', () => {
        req.method = 'PUT';
        req.path = '/api/v1/orders/123';
        expect(shouldEnforceCsrf(req)).toBe(true);
      });

      it('should consider CSRF for DELETE requests', () => {
        req.method = 'DELETE';
        req.path = '/api/v1/orders/123';
        expect(shouldEnforceCsrf(req)).toBe(true);
      });

      it('should consider CSRF for PATCH requests', () => {
        req.method = 'PATCH';
        req.path = '/api/v1/orders/123';
        expect(shouldEnforceCsrf(req)).toBe(true);
      });
    });

    describe('Public endpoints', () => {
      it('should not enforce CSRF for public endpoints', () => {
        req.method = 'POST';
        req.path = '/api/v1/affiliates/123/public';
        expect(shouldEnforceCsrf(req)).toBe(false);
      });

      it('should not enforce CSRF for health check endpoints', () => {
        req.method = 'POST';
        req.path = '/api/health';
        expect(shouldEnforceCsrf(req)).toBe(false);
      });
    });

    describe('Authentication endpoints', () => {
      it('should not enforce CSRF for login endpoints', () => {
        req.method = 'POST';
        req.path = '/api/auth/affiliate/login';
        expect(shouldEnforceCsrf(req)).toBe(false);
      });

      it('should not enforce CSRF for forgot password', () => {
        req.method = 'POST';
        req.path = '/api/auth/forgot-password';
        expect(shouldEnforceCsrf(req)).toBe(false);
      });

      it('should not enforce CSRF for refresh token', () => {
        req.method = 'POST';
        req.path = '/api/v1/auth/refresh-token';
        expect(shouldEnforceCsrf(req)).toBe(false);
      });
    });

    describe('Registration endpoints', () => {
      it('should not enforce CSRF for affiliate registration', () => {
        req.method = 'POST';
        req.path = '/api/affiliates/register';
        expect(shouldEnforceCsrf(req)).toBe(false);
      });

      it('should not enforce CSRF for customer registration', () => {
        req.method = 'POST';
        req.path = '/api/v1/customers/claim/abc123/register';
        expect(shouldEnforceCsrf(req)).toBe(false);
      });
    });

    describe('Critical endpoints', () => {
      it('should enforce CSRF for logout', () => {
        req.method = 'POST';
        req.path = '/api/v1/auth/logout';
        expect(shouldEnforceCsrf(req)).toBe(true);
      });

      it('should enforce CSRF for order creation', () => {
        req.method = 'POST';
        req.path = '/api/v1/orders';
        expect(shouldEnforceCsrf(req)).toBe(true);
      });

      it('should enforce CSRF for order cancellation', () => {
        req.method = 'POST';
        req.path = '/api/v1/orders/123/cancel';
        expect(shouldEnforceCsrf(req)).toBe(true);
      });

      it('should enforce CSRF for data deletion', () => {
        req.method = 'DELETE';
        req.path = '/api/v1/affiliates/123/delete-all-data';
        expect(shouldEnforceCsrf(req)).toBe(true);
      });

      it('should enforce CSRF for admin operations', () => {
        req.method = 'POST';
        req.path = '/api/v1/administrators/operators';
        expect(shouldEnforceCsrf(req)).toBe(true);
      });

      it('should enforce CSRF for operator shift changes', () => {
        req.method = 'PUT';
        req.path = '/api/v1/operators/shift/status';
        expect(shouldEnforceCsrf(req)).toBe(true);
      });

      it('should enforce CSRF for order status updates', () => {
        req.method = 'PUT';
        req.path = '/api/v1/orders/123/status';
        expect(shouldEnforceCsrf(req)).toBe(true);
      });
    });

    describe('High priority endpoints', () => {
      it('should not enforce CSRF for high priority endpoints when CSRF_PHASE < 2', () => {
        process.env.CSRF_PHASE = '1';
        req.method = 'PUT';
        req.path = '/api/v1/affiliates/123';
        expect(shouldEnforceCsrf(req)).toBe(false);
      });

      it('should enforce CSRF for high priority endpoints when CSRF_PHASE >= 2', () => {
        process.env.CSRF_PHASE = '2';
        req.method = 'PUT';
        req.path = '/api/v1/affiliates/123';
        expect(shouldEnforceCsrf(req)).toBe(true);
      });
    });

    describe('Read-only endpoints', () => {
      it('should not enforce CSRF for dashboard endpoints', () => {
        req.method = 'POST'; // Even for POST, read-only endpoints should not enforce
        req.path = '/api/v1/affiliates/123/dashboard';
        expect(shouldEnforceCsrf(req)).toBe(false);
      });

      it('should enforce CSRF for search endpoints with state-changing methods', () => {
        req.method = 'POST';
        req.path = '/api/v1/orders/search';
        // Note: POST to search is still protected as it's a state-changing method
        expect(shouldEnforceCsrf(req)).toBe(true);
      });

      it('should enforce CSRF for export endpoints with state-changing methods', () => {
        req.method = 'POST';
        req.path = '/api/v1/orders/export';
        // Note: POST to export is still protected as it's a state-changing method
        expect(shouldEnforceCsrf(req)).toBe(true);
      });
    });

    describe('Pattern matching', () => {
      it('should match parameterized routes', () => {
        req.method = 'PUT';
        req.path = '/api/v1/orders/order-123-abc/status';
        expect(shouldEnforceCsrf(req)).toBe(true);
      });

      it('should match nested parameterized routes', () => {
        req.method = 'POST';
        req.path = '/api/v1/operators/op-456/scan-code/reset';
        expect(shouldEnforceCsrf(req)).toBe(true);
      });

      it('should not match partial paths', () => {
        req.method = 'POST';
        req.path = '/api/v1/orders/123/status/extra';
        expect(shouldEnforceCsrf(req)).toBe(true); // Default behavior
      });

      it('should handle complex IDs in paths', () => {
        req.method = 'DELETE';
        req.path = '/api/v1/affiliates/aff-123-xyz/delete-all-data';
        expect(shouldEnforceCsrf(req)).toBe(true);
      });
    });

    describe('Default behavior', () => {
      it('should enforce CSRF for unknown state-changing endpoints', () => {
        req.method = 'POST';
        req.path = '/api/v1/unknown/endpoint';
        expect(shouldEnforceCsrf(req)).toBe(true);
      });

      it('should enforce CSRF for unmatched PUT requests', () => {
        req.method = 'PUT';
        req.path = '/api/v1/some/random/path';
        expect(shouldEnforceCsrf(req)).toBe(true);
      });

      it('should not enforce CSRF for unknown GET endpoints', () => {
        req.method = 'GET';
        req.path = '/api/v1/unknown/endpoint';
        expect(shouldEnforceCsrf(req)).toBe(false);
      });
    });

    describe('Edge cases', () => {
      it('should handle missing CSRF_PHASE environment variable', () => {
        delete process.env.CSRF_PHASE;
        req.method = 'PUT';
        req.path = '/api/v1/affiliates/123';
        expect(shouldEnforceCsrf(req)).toBe(false);
      });

      it('should handle non-numeric CSRF_PHASE', () => {
        process.env.CSRF_PHASE = 'invalid';
        req.method = 'PUT';
        req.path = '/api/v1/affiliates/123';
        expect(shouldEnforceCsrf(req)).toBe(false);
      });

      it('should handle paths with query parameters', () => {
        req.method = 'POST';
        req.path = '/api/v1/orders';
        expect(shouldEnforceCsrf(req)).toBe(true);
      });

      it('should handle paths with trailing slashes', () => {
        req.method = 'POST';
        req.path = '/api/v1/orders/';
        expect(shouldEnforceCsrf(req)).toBe(true);
      });
    });
  });

  // Ported from crhs-web-core/tests/config/csrfConfig.test.js:343-381 (B4c,
  // spec §7.2.8): the export-shape cases web-core carried and this suite did
  // not. They are the characterization tests for the createCsrf({ tables })
  // rewire — conditionalCsrf and csrfTokenEndpoint must stay callable
  // middleware after server/config/csrf-config.js stops being a re-export,
  // because server.js:20 destructures both and mounts them at :629 and :632.
  describe('module exports', () => {
    it('exposes conditionalCsrf, csrfProtection, csrfTokenEndpoint as functions', () => {
      expect(typeof conditionalCsrf).toBe('function');
      expect(typeof csrfProtection).toBe('function');
      expect(typeof csrfTokenEndpoint).toBe('function');
    });

    it('conditionalCsrf calls next() for a request that does not require CSRF (GET)', () => {
      const mreq = httpMocks.createRequest({ method: 'GET', path: '/api/v1/orders' });
      const mres = httpMocks.createResponse();
      const next = jest.fn();
      conditionalCsrf(mreq, mres, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('csrfTokenEndpoint returns a token when a session is present', () => {
      const mreq = httpMocks.createRequest({
        method: 'GET',
        path: '/api/csrf-token',
        session: {},
        sessionID: 'sess-test-123'
      });
      mreq.ip = '127.0.0.1';
      const mres = httpMocks.createResponse();
      csrfTokenEndpoint(mreq, mres);
      const data = mres._getJSONData();
      expect(data.success).toBe(true);
      expect(typeof data.csrfToken).toBe('string');
      expect(data.csrfToken.length).toBeGreaterThan(0);
    });

    it('csrfTokenEndpoint returns 500 when no session is initialized', () => {
      const mreq = httpMocks.createRequest({ method: 'GET', path: '/api/csrf-token' });
      const mres = httpMocks.createResponse();
      csrfTokenEndpoint(mreq, mres);
      expect(mres.statusCode).toBe(500);
      expect(mres._getJSONData().success).toBe(false);
    });
  });
});
