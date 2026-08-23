// Additional tests for Administrator model to improve coverage
const mongoose = require('mongoose');
const Administrator = require('../../server/models/Administrator');
const { hashPassword } = require('../../server/utils/encryption');

describe('Administrator Model - Additional Coverage', () => {
  // Helper function to create admin data with hashed password
  const createAdminData = (adminData) => {
    if (adminData.password) {
      const { salt, hash } = hashPassword(adminData.password);
      const { password, ...rest } = adminData;
      return {
        ...rest,
        passwordSalt: salt,
        passwordHash: hash
      };
    }
    return adminData;
  };

  beforeEach(async () => {
    await Administrator.deleteMany({});
  });

  describe('Permission Methods', () => {
    it('should check single permission with hasPermission', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!',
        permissions: ['system_config', 'view_analytics']
      }));

      await admin.save();

      expect(admin.hasPermission('system_config')).toBe(true);
      expect(admin.hasPermission('operator_management')).toBe(false);
      expect(admin.hasPermission('')).toBe(false);
      expect(admin.hasPermission(null)).toBe(false);
    });

    it('should check all permissions with hasAllPermissions', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@laundromat.example',
        password: 'StrongPassword417!',
        permissions: ['system_config', 'view_analytics', 'operator_management']
      }));

      await admin.save();

      expect(admin.hasAllPermissions(['system_config', 'view_analytics'])).toBe(true);
      expect(admin.hasAllPermissions(['system_config', 'manage_affiliates'])).toBe(false);
      expect(admin.hasAllPermissions([])).toBe(true); // Empty array should return true
      expect(admin.hasAllPermissions(['system_config'])).toBe(true);
    });
  });

  describe('Password History', () => {
    it('should check if password is in history', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'InitialPassword417!'
      }));

      // Add some password history
      const oldPassword1 = hashPassword('OldPassword1!');
      const oldPassword2 = hashPassword('OldPassword2!');
      
      admin.passwordHistory = [
        {
          passwordHash: oldPassword1.hash,
          passwordSalt: oldPassword1.salt,
          changedAt: new Date()
        },
        {
          passwordHash: oldPassword2.hash,
          passwordSalt: oldPassword2.salt,
          changedAt: new Date()
        }
      ];

      await admin.save();

      expect(admin.isPasswordInHistory('OldPassword1!')).toBe(true);
      expect(admin.isPasswordInHistory('OldPassword2!')).toBe(true);
      expect(admin.isPasswordInHistory('NewPassword3!')).toBe(false);
      expect(admin.isPasswordInHistory('')).toBe(false);
    });

    it('should handle empty password history', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!'
      }));

      admin.passwordHistory = [];
      await admin.save();

      expect(admin.isPasswordInHistory('AnyPassword!')).toBe(false);
    });
  });

  describe('Virtual Properties', () => {
    it('should calculate isLocked virtual property correctly', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!'
      }));

      // Not locked initially (no lockUntil date)
      expect(admin.isLocked).toBe(false);

      // Set lockUntil in the past - should not be locked
      admin.lockUntil = new Date(Date.now() - 1000);
      expect(admin.isLocked).toBe(false);

      // Set lockUntil in the future - should be locked
      admin.lockUntil = new Date(Date.now() + 10000);
      expect(admin.isLocked).toBe(true);

      // Clear lockUntil - should not be locked
      admin.lockUntil = null;
      expect(admin.isLocked).toBe(false);

      // Set loginAttempts without lockUntil - should not be locked (isLocked only checks lockUntil)
      admin.loginAttempts = 5;
      expect(admin.isLocked).toBe(false);
    });
  });
});