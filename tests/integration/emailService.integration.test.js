// Email Service Integration Tests
// These tests verify the email service functionality without conflicting with global mocks
//
// NOTE: this suite previously did `jest.mock('fs', ...)` to stub template reads.
// That replaced fs for the whole file, which starved the global tests/setup.js
// mongodb-memory-server fallback (it needs real fs.statSync/existsSync), so every
// test failed at DB connect. The real templates exist on disk under
// server/templates/emails/, so the production template-manager loads them fine
// with the real fs — no mock is needed.

let logger;
const path = require('path');
const brand = require('../../server/config/brand');

describe('Email Service Integration', () => {
  let emailService;
  const originalEnv = process.env;

  beforeAll(() => {
    // Unmock the email service to use real implementation
    jest.unmock('../../server/utils/emailService');
  });

  beforeEach(() => {
    // Clear module cache before each test
    jest.resetModules();
    logger = require('../../server/utils/logger');
    
    // Set up test environment - these are already set in setup.js
    // but we ensure they're correct for our tests
    process.env.EMAIL_PROVIDER = 'console';
    process.env.EMAIL_FROM = 'test@crhsent.com';
    process.env.BASE_URL = 'https://portal.atxwashdryfold.com';
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
    logger = require('../../server/utils/logger');
  });

  describe('Email Service Configuration', () => {
    it('should load and configure the email service correctly', () => {
      // This test verifies that the email service can be loaded without errors
      expect(() => {
        emailService = require('../../server/utils/emailService');
      }).not.toThrow();

      expect(emailService).toBeDefined();
      expect(emailService.sendAffiliateWelcomeEmail).toBeDefined();
      expect(emailService.sendCustomerWelcomeEmail).toBeDefined();
      expect(emailService.sendAffiliatePasswordResetEmail).toBeDefined();
    });

    it('should have all required email functions', () => {
      emailService = require('../../server/utils/emailService');

      // Affiliate emails
      expect(typeof emailService.sendAffiliateWelcomeEmail).toBe('function');
      expect(typeof emailService.sendAffiliateNewCustomerEmail).toBe('function');
      expect(typeof emailService.sendAffiliateNewOrderEmail).toBe('function');
      expect(typeof emailService.sendAffiliateOrderCancellationEmail).toBe('function');
      
      // Customer emails
      expect(typeof emailService.sendCustomerWelcomeEmail).toBe('function');
      expect(typeof emailService.sendOrderStatusUpdateEmail).toBe('function');
      expect(typeof emailService.sendOrderCancellationEmail).toBe('function');
      
      // Password reset emails (no generic sendPasswordResetEmail function)
      expect(typeof emailService.sendAffiliatePasswordResetEmail).toBe('function');

      // Administrator emails
      expect(typeof emailService.sendAdministratorWelcomeEmail).toBe('function');
      expect(typeof emailService.sendAdministratorPasswordResetEmail).toBe('function');
      
      // Operator emails
      expect(typeof emailService.sendOperatorWelcomeEmail).toBe('function');
      expect(typeof emailService.sendOperatorPasswordResetEmail).toBe('function');
    });
  });

  describe('Console Email Provider', () => {
    let consoleSpy;

    beforeEach(() => {
      consoleSpy = jest.spyOn(logger, 'info').mockImplementation();
      emailService = require('../../server/utils/emailService');
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should log affiliate welcome emails to console', async () => {
      const affiliate = {
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        affiliateId: 'AFF001',
        commissionPercentage: 10
      };

      const result = await emailService.sendAffiliateWelcomeEmail(affiliate);
      
      // Console transport logs the email content
      expect(consoleSpy).toHaveBeenCalledWith('=== EMAIL CONSOLE LOG ===');
      expect(consoleSpy).toHaveBeenCalledWith('To:', 'test@example.com');
      expect(consoleSpy).toHaveBeenCalledWith('From:', `"${brand.displayName}" <test@crhsent.com>`);
      
      // Check for subject
      const calls = consoleSpy.mock.calls.map(call => call.join(' '));
      expect(calls.some(call => call.includes('Subject:'))).toBe(true);
      expect(calls.some(call => call.includes(`Welcome to ${brand.displayName} Affiliate Program`))).toBe(true);
    });

    it('should log customer welcome emails to console', async () => {
      const customer = {
        email: 'customer@example.com',
        firstName: 'Jane',
        lastName: 'Doe'
      };
      
      const affiliate = {
        email: 'affiliate@example.com',
        firstName: 'John',
        lastName: 'Affiliate',
        businessName: 'Test Business'
      };

      const result = await emailService.sendCustomerWelcomeEmail(customer, affiliate);
      
      expect(consoleSpy).toHaveBeenCalledWith('=== EMAIL CONSOLE LOG ===');
      expect(consoleSpy).toHaveBeenCalledWith('To:', 'customer@example.com');
      expect(consoleSpy).toHaveBeenCalledWith('From:', `"${brand.displayName}" <test@crhsent.com>`);
      
      // Also logs success message
      expect(consoleSpy).toHaveBeenCalledWith('Customer welcome email sent successfully to:', 'customer@example.com');
    });

    it('should log password reset emails to console', async () => {
      const affiliate = {
        email: 'user@example.com',
        firstName: 'User',
        lastName: 'Affiliate'
      };
      
      const resetUrl = 'https://example.com/reset/reset-token-123';

      const result = await emailService.sendAffiliatePasswordResetEmail(affiliate, resetUrl);
      
      expect(consoleSpy).toHaveBeenCalledWith('=== EMAIL CONSOLE LOG ===');
      expect(consoleSpy).toHaveBeenCalledWith('To:', 'user@example.com');
      expect(consoleSpy).toHaveBeenCalledWith('From:', `"${brand.displayName}" <test@crhsent.com>`);
      
      const calls = consoleSpy.mock.calls.map(call => call.join(' '));
      expect(calls.some(call => call.includes('Password Reset'))).toBe(true);
    });
  });

  describe('Email Template Verification', () => {
    it('should verify email templates directory exists', async () => {
      const actualFs = jest.requireActual('fs').promises;
      const templateDir = path.join(__dirname, '../../server/templates/emails');
      
      const dirExists = await actualFs.access(templateDir)
        .then(() => true)
        .catch(() => false);
      
      expect(dirExists).toBe(true);
    });

    it('should verify essential email templates exist', async () => {
      const actualFs = jest.requireActual('fs').promises;
      const templateDir = path.join(__dirname, '../../server/templates/emails');
      // customer-order-confirmation.html was removed in PR 8 (orphan — no live
      // dispatcher). The old 'order-confirmation.html' entry pointed at a file
      // that never existed and was only console.logged, never asserted.
      const essentialTemplates = [
        'affiliate-welcome.html',
        'customer-welcome.html',
        'password-reset.html'
      ];

      for (const template of essentialTemplates) {
        const templatePath = path.join(templateDir, template);
        const exists = await actualFs.access(templatePath)
          .then(() => true)
          .catch(() => false);

        expect(exists).toBe(true);
      }
    });
  });

  describe('Mailcow SMTP Configuration', () => {
    it('should handle Mailcow SMTP configuration', () => {
      process.env.EMAIL_PROVIDER = 'smtp';
      process.env.EMAIL_HOST = 'smtp.mailcow.email';
      process.env.EMAIL_PORT = '587';
      process.env.EMAIL_USER = 'noreply@crhsent.com';
      process.env.EMAIL_PASS = 'testpass';

      // Verify service loads without errors with Mailcow config
      expect(() => {
        emailService = require('../../server/utils/emailService');
      }).not.toThrow();
    });

    it('should handle secure Mailcow SMTP on port 465', () => {
      process.env.EMAIL_PROVIDER = 'smtp';
      process.env.EMAIL_HOST = 'smtp.mailcow.email';
      process.env.EMAIL_PORT = '465';
      process.env.EMAIL_USER = 'noreply@crhsent.com';
      process.env.EMAIL_PASS = 'testpass';

      expect(() => {
        emailService = require('../../server/utils/emailService');
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      process.env.EMAIL_PROVIDER = 'console';
      emailService = require('../../server/utils/emailService');
    });

    it('should handle missing required fields gracefully', async () => {
      const invalidAffiliate = {
        // Missing email
        firstName: 'John',
        lastName: 'Doe'
      };

      // Console provider doesn't throw on missing email, it just logs
      const consoleSpy = jest.spyOn(logger, 'error').mockImplementation();
      
      try {
        await emailService.sendAffiliateWelcomeEmail(invalidAffiliate);
      } catch (error) {
        // Expected to throw or log error
        expect(error).toBeDefined();
      }

      consoleSpy.mockRestore();
    });

    it('should handle invalid email addresses', async () => {
      const invalidCustomer = {
        email: 'not-an-email',
        firstName: 'Invalid',
        lastName: 'Email'
      };
      
      const affiliate = {
        email: 'affiliate@example.com',
        firstName: 'John',
        lastName: 'Affiliate'
      };

      const consoleSpy = jest.spyOn(logger, 'info').mockImplementation();
      
      // Console provider will still "send" but to invalid address
      await emailService.sendCustomerWelcomeEmail(invalidCustomer, affiliate);
      
      expect(consoleSpy).toHaveBeenCalledWith('=== EMAIL CONSOLE LOG ===');
      expect(consoleSpy).toHaveBeenCalledWith('To:', 'not-an-email');
      expect(consoleSpy).toHaveBeenCalledWith('Customer welcome email sent successfully to:', 'not-an-email');
      
      consoleSpy.mockRestore();
    });
  });

  describe('Bulk Email Operations', () => {
    beforeEach(() => {
      process.env.EMAIL_PROVIDER = 'console';
      emailService = require('../../server/utils/emailService');
    });

    it('should handle multiple email sends efficiently', async () => {
      const consoleSpy = jest.spyOn(logger, 'info').mockImplementation();
      
      const recipients = [
        { email: 'user1@example.com', firstName: 'User', lastName: 'One' },
        { email: 'user2@example.com', firstName: 'User', lastName: 'Two' },
        { email: 'user3@example.com', firstName: 'User', lastName: 'Three' }
      ];

      const affiliate = {
        email: 'affiliate@example.com',
        firstName: 'John',
        lastName: 'Affiliate',
        businessName: 'Test Business'
      };
      
      await Promise.all(
        recipients.map(recipient => emailService.sendCustomerWelcomeEmail(recipient, affiliate))
      );

      // Check that console.log was called for each email
      expect(consoleSpy).toHaveBeenCalled();
      
      // Count how many times we logged email headers
      const emailLogCalls = consoleSpy.mock.calls.filter(
        call => call[0] && call[0] === '=== EMAIL CONSOLE LOG ==='
      );
      
      // Should have logged 3 emails (one for each recipient)
      expect(emailLogCalls.length).toBe(3);
      
      // Verify each recipient was sent an email
      expect(consoleSpy).toHaveBeenCalledWith('Customer welcome email sent successfully to:', 'user1@example.com');
      expect(consoleSpy).toHaveBeenCalledWith('Customer welcome email sent successfully to:', 'user2@example.com');
      expect(consoleSpy).toHaveBeenCalledWith('Customer welcome email sent successfully to:', 'user3@example.com');
      
      consoleSpy.mockRestore();
    });
  });
});