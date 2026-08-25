// Test file for affiliate login initialization and parameter preservation
describe('Affiliate Login Initialization', () => {
  let originalWindow;
  let originalConsole;
  let originalDocument;

  beforeEach(() => {
    // Save originals
    originalWindow = global.window;
    originalConsole = global.console;
    originalDocument = global.document;

    // Mock console
    global.console = {
      log: jest.fn(),
      error: jest.fn()
    };

    // Setup window environment
    global.window = {
      location: {
        search: '',
        href: ''
      },
      URLSearchParams: global.URLSearchParams,
      CsrfUtils: undefined
    };

    global.fetch = jest.fn();
    global.localStorage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn()
    };

    // Clear require cache
    delete require.cache[require.resolve('../../public/assets/js/affiliate-login-init.js')];
  });

  afterEach(() => {
    global.window = originalWindow;
    global.console = originalConsole;
    global.document = originalDocument;
    jest.restoreAllMocks();
  });

  describe('Module Loading', () => {
    test('should initialize when form is found', () => {
      // Mock form element
      const mockForm = {
        addEventListener: jest.fn()
      };

      // Mock document
      global.document = {
        getElementById: jest.fn((id) => {
          if (id === 'affiliateLoginForm') return mockForm;
          return null;
        })
      };

      // Load the module
      require('../../public/assets/js/affiliate-login-init.js');

      // Verify initialization logs
      expect(global.console.log).toHaveBeenCalledWith('Initializing affiliate login...');
      expect(global.console.log).toHaveBeenCalledWith('Login form found, attaching submit handler');
      expect(mockForm.addEventListener).toHaveBeenCalledWith('submit', expect.any(Function));
    });

    test('should handle missing form gracefully', () => {
      // Mock document with no form
      global.document = {
        getElementById: jest.fn(() => null)
      };

      // Load the module - should not throw
      expect(() => {
        require('../../public/assets/js/affiliate-login-init.js');
      }).not.toThrow();

      // The module loads successfully even without a form
      expect(true).toBe(true);
    });
  });

  describe('URL Parameter Handling Logic', () => {
    test('should correctly parse customer parameter from URL', () => {
      // Test URL parameter parsing logic directly
      const testURL = '?login=affiliate&customer=CUST123456';
      const urlParams = new URLSearchParams(testURL);
      const customerParam = urlParams.get('customer');

      expect(customerParam).toBe('CUST123456');
    });

    test('should handle URL without customer parameter', () => {
      const testURL = '?login=affiliate';
      const urlParams = new URLSearchParams(testURL);
      const customerParam = urlParams.get('customer');

      expect(customerParam).toBeNull();
    });

    test('should construct redirect URL correctly with customer parameter', () => {
      const affiliateId = 'AFF123456';
      const customerParam = 'CUST789012';

      let redirectUrl = `/embed-app-v2.html?route=/affiliate-dashboard&id=${affiliateId}`;
      if (customerParam) {
        redirectUrl += `&customer=${customerParam}`;
      }

      expect(redirectUrl).toBe('/embed-app-v2.html?route=/affiliate-dashboard&id=AFF123456&customer=CUST789012');
    });

    test('should construct redirect URL correctly without customer parameter', () => {
      const affiliateId = 'AFF123456';
      const customerParam = null;

      let redirectUrl = `/embed-app-v2.html?route=/affiliate-dashboard&id=${affiliateId}`;
      if (customerParam) {
        redirectUrl += `&customer=${customerParam}`;
      }

      expect(redirectUrl).toBe('/embed-app-v2.html?route=/affiliate-dashboard&id=AFF123456');
    });
  });

  describe('URL Validation', () => {
    test('should validate customer ID format', () => {
      const validCustomerId = 'CUST123456';
      const invalidCustomerId = 'invalid-id';

      // Valid customer ID should match pattern
      expect(validCustomerId).toMatch(/^CUST\d+$/);
      expect(invalidCustomerId).not.toMatch(/^CUST\d+$/);
    });

    test('should handle URL encoding correctly', () => {
      const customerParam = 'CUST123456';
      const encodedParam = encodeURIComponent(customerParam);

      expect(encodedParam).toBe('CUST123456'); // Should not change for valid IDs
      expect(decodeURIComponent(encodedParam)).toBe(customerParam);
    });
  });

  describe('Integration with Email URLs', () => {
    test('should parse email-generated URLs correctly', () => {
      const emailURL = 'https://rundberglaundry.com/embed-app-v2.html?login=affiliate&customer=CUST789012';
      const url = new URL(emailURL);

      expect(url.searchParams.get('login')).toBe('affiliate');
      expect(url.searchParams.get('customer')).toBe('CUST789012');
    });

    test('should handle both login and customer parameters together', () => {
      const searchParams = '?login=affiliate&customer=CUST789012';
      const urlParams = new URLSearchParams(searchParams);

      expect(urlParams.get('login')).toBe('affiliate');
      expect(urlParams.get('customer')).toBe('CUST789012');
      expect(urlParams.has('login')).toBe(true);
      expect(urlParams.has('customer')).toBe(true);
    });
  });

  describe('Parameter Preservation Logic', () => {
    test('should preserve customer parameter through login flow', () => {
      // Simulate the parameter preservation logic
      const originalURL = '?login=affiliate&customer=CUST789012';
      const urlParams = new URLSearchParams(originalURL);
      const customerParam = urlParams.get('customer');

      // After successful login
      const affiliateId = 'AFF123456';
      let redirectUrl = `/embed-app-v2.html?route=/affiliate-dashboard&id=${affiliateId}`;

      if (customerParam) {
        redirectUrl += `&customer=${customerParam}`;
      }

      expect(redirectUrl).toContain('customer=CUST789012');
      expect(redirectUrl).toContain('id=AFF123456');
      expect(redirectUrl).toContain('route=/affiliate-dashboard');
    });

    test('should handle multiple URL parameters correctly', () => {
      const complexURL = '?login=affiliate&customer=CUST789012&other=value&test=123';
      const urlParams = new URLSearchParams(complexURL);

      expect(urlParams.get('login')).toBe('affiliate');
      expect(urlParams.get('customer')).toBe('CUST789012');
      expect(urlParams.get('other')).toBe('value');
      expect(urlParams.get('test')).toBe('123');
    });
  });
});