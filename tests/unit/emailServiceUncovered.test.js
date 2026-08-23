// Test the uncovered email service functions
//
// Uses a jest.doMock-based logger stub rather than `spyOn` on the real logger:
// re-requiring server/utils/logger after resetModules would reinit winston
// against the jest.doMock'd `fs` below, which lacks the calls winston needs to
// create the log directory.
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

describe('Email Service - Uncovered Functions', () => {
  let emailService;
  let mockTransporter;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.doMock('../../server/utils/logger', () => mockLogger);

    consoleLogSpy = jest.spyOn(mockLogger, 'info').mockImplementation();
    consoleErrorSpy = jest.spyOn(mockLogger, 'error').mockImplementation();
    
    // Mock nodemailer
    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' })
    };
    
    jest.doMock('nodemailer', () => ({
      createTransport: jest.fn(() => mockTransporter)
    }));

    // Mock fs for template loading
    jest.doMock('fs', () => ({
      readFile: jest.fn((path, encoding, callback) => {
        if (typeof encoding === 'function') {
          callback = encoding;
          encoding = 'utf8';
        }
        // Return different templates based on path
        if (path.includes('operator-shift-reminder')) {
          callback(null, '<html>Shift reminder for [first_name] on [shift_date]</html>');
        } else if (path.includes('operator-password-reset')) {
          callback(null, '<html>Password reset for [first_name]: [reset_url]</html>');
        } else if (path.includes('service-down-alert')) {
          callback(null, '<html>Service [service_name] is down: [error_message]</html>');
        } else if (path.includes('order-ready')) {
          callback(null, '<html>Order [order_id] is ready for [customer_name]</html>');
        } else if (path.includes('order-picked-up')) {
          callback(null, '<html>Order [order_id] picked up by [customer_name]</html>');
        } else {
          callback(null, '<html>Default template</html>');
        }
      })
    }));

    // Set environment to use SMTP
    process.env.EMAIL_PROVIDER = 'smtp';
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'test@test.com';
    process.env.SMTP_PASS = 'testpass';
    process.env.EMAIL_FROM = 'noreply@test.com';
    process.env.ADMIN_EMAILS = 'admin1@test.com,admin2@test.com';
    process.env.ALERT_EMAIL = 'admin1@test.com,admin2@test.com';
    process.env.DEFAULT_ADMIN_EMAIL = 'admin1@test.com,admin2@test.com';
    
    // Now require the actual email service
    emailService = require('../../server/utils/emailService');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.resetModules();
  });

  describe('sendOperatorShiftReminderEmail', () => {
    it('should send shift reminder email successfully', async () => {
      const operator = {
        email: 'operator@test.com',
        firstName: 'John',
        lastName: 'Doe',
        operatorId: 'OPR001'
      };

      await emailService.sendOperatorShiftReminderEmail(operator);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'operator@test.com',
          subject: expect.stringContaining('Shift Reminder'),
          html: expect.stringContaining('Shift reminder for John')
        })
      );
    });

    it('should handle email sending error', async () => {
      mockTransporter.sendMail.mockRejectedValueOnce(new Error('SMTP error'));
      
      const operator = {
        email: 'operator@test.com',
        firstName: 'John'
      };

      await emailService.sendOperatorShiftReminderEmail(operator);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error sending operator shift reminder'),
        expect.any(Error)
      );
    });
  });

  describe('sendOperatorPasswordResetEmail', () => {
    it('should log error since operators use PINs', async () => {
      const operator = {
        email: 'operator@test.com',
        firstName: 'Jane',
        lastName: 'Smith',
        operatorId: 'OPR002'
      };
      const resetUrl = 'https://test.com/reset/token123';

      await emailService.sendOperatorPasswordResetEmail(operator, resetUrl);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Operators use PINs, not passwords. Use sendOperatorPinResetEmail instead.'
      );
      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
    });

    it('should still log error even with missing reset URL', async () => {
      const operator = {
        email: 'operator@test.com',
        firstName: 'Jane'
      };

      await emailService.sendOperatorPasswordResetEmail(operator, null);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Operators use PINs, not passwords. Use sendOperatorPinResetEmail instead.'
      );
      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('sendServiceDownAlert', () => {
    it('should send service down alert to all admin emails', async () => {
      const alertData = {
        serviceName: 'Payment Gateway',
        error: 'Connection timeout',
        timestamp: new Date(),
        serviceData: {
          lastSuccess: new Date('2025-01-01'),
          totalChecks: 100,
          failedChecks: 5,
          uptime: 95
        }
      };

      await emailService.sendServiceDownAlert(alertData);

      // Should send to admin email
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin1@test.com,admin2@test.com',
          subject: expect.stringContaining('CRITICAL'),
          html: expect.stringContaining('Payment Gateway')
        })
      );
    });

    it('should handle empty admin emails', async () => {
      process.env.ADMIN_EMAILS = '';
      process.env.ALERT_EMAIL = '';
      process.env.DEFAULT_ADMIN_EMAIL = '';
      
      // Re-require to pick up new env
      jest.resetModules();
      jest.doMock('../../server/utils/logger', () => mockLogger);
      emailService = require('../../server/utils/emailService');

      const alertData = {
        serviceName: 'API',
        error: 'Server error',
        timestamp: new Date(),
        serviceData: {
          lastSuccess: null,
          totalChecks: 10,
          failedChecks: 10,
          uptime: 0
        }
      };

      await emailService.sendServiceDownAlert(alertData);

      // Should still send to default fallback email.
      // Fallback domain migrated to rundberglaundry.com
      // (see server/services/email/dispatcher/ops.js).
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin@rundberglaundry.com'
        })
      );
    });

    it.skip('should handle email sending errors gracefully', async () => {
      // Create a fresh mock that rejects
      jest.resetModules();
      jest.doMock('../../server/utils/logger', () => mockLogger);
      const failingTransporter = {
        sendMail: jest.fn(() => Promise.reject(new Error('SMTP error')))
      };
      
      jest.doMock('nodemailer', () => ({
        createTransport: jest.fn(() => failingTransporter)
      }));
      
      // Set up environment for the error test
      process.env.EMAIL_PROVIDER = 'smtp';
      process.env.EMAIL_FROM = 'noreply@test.com';
      process.env.ALERT_EMAIL = 'admin@test.com';
      
      // Re-require email service with failing transporter
      const emailServiceWithError = require('../../server/utils/emailService');
const { expectSuccessResponse, expectErrorResponse } = require('../helpers/responseHelpers');
const { createFindOneMock, createFindMock, createMockDocument, createAggregateMock } = require('../helpers/mockHelpers');
      
      const alertData = {
        serviceName: 'Database',
        error: 'Connection lost',
        timestamp: new Date(),
        serviceData: {
          lastSuccess: new Date(),
          totalChecks: 50,
          failedChecks: 1,
          uptime: 49
        }
      };

      await emailServiceWithError.sendServiceDownAlert(alertData);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error sending email'),
        expect.any(Error)
      );
    });
  });

  describe('Console Email Provider', () => {
    beforeEach(() => {
      jest.resetModules();
      jest.doMock('../../server/utils/logger', () => mockLogger);
      process.env.EMAIL_PROVIDER = 'console';
      
      // Re-mock fs
      jest.doMock('fs', () => ({
        readFile: jest.fn((path, encoding, callback) => {
          if (typeof encoding === 'function') {
            callback = encoding;
          }
          callback(null, '<html>Test email: [content]</html>');
        })
      }));
      
      emailService = require('../../server/utils/emailService');
    });

    it('should log emails when using console provider', async () => {
      const operator = {
        email: 'operator@test.com',
        firstName: 'Test'
      };

      await emailService.sendOperatorShiftReminderEmail(operator);

      expect(consoleLogSpy).toHaveBeenCalledWith('=== EMAIL CONSOLE LOG ===');
      expect(consoleLogSpy).toHaveBeenCalledWith('To:', 'operator@test.com');
      expect(consoleLogSpy).toHaveBeenCalledWith('Subject:', expect.any(String));
    });
  });

  describe('Template Loading Errors', () => {
    it('should handle template file not found', async () => {
      const fs = require('fs');
      fs.readFile.mockImplementationOnce((path, encoding, callback) => {
        if (typeof encoding === 'function') {
          callback = encoding;
        }
        callback(new Error('ENOENT: no such file'));
      });

      const alertData = {
        serviceName: 'Test Service',
        error: 'Test error',
        timestamp: new Date(),
        serviceData: {
          lastSuccess: null,
          totalChecks: 1,
          failedChecks: 1,
          uptime: 0
        }
      };

      await emailService.sendServiceDownAlert(alertData);

      // sendServiceDownAlert doesn't load templates from files, 
      // so it should still send successfully
      expect(mockTransporter.sendMail).toHaveBeenCalled();
    });
  });
});