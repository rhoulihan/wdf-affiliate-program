const mongoose = require('mongoose');
const Administrator = require('../../server/models/Administrator');
const crypto = require('crypto');
const { hashPassword } = require('../../server/utils/encryption');
const { expectSuccessResponse, expectErrorResponse } = require('../helpers/responseHelpers');
const { createFindOneMock, createFindMock, createMockDocument, createAggregateMock } = require('../helpers/mockHelpers');

describe('Administrator Model', () => {
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
    // Clear the collection before each test
    await Administrator.deleteMany({});
  });

  describe('Schema Validation', () => {
    it('should create a valid administrator', async () => {
      const adminData = createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        password: 'SecurePassword417!'
      });

      const admin = new Administrator(adminData);
      const saved = await admin.save();

      expect(saved._id).toBeDefined();
      expect(saved.adminId).toBeDefined();
      expect(saved.adminId).toMatch(/^ADM/);
      expect(saved.firstName).toBe('John');
      expect(saved.lastName).toBe('Doe');
      expect(saved.email).toBe('john.doe@laundromat.example');
      expect(saved.role).toBe('administrator');
      expect(saved.isActive).toBe(true);
      expect(saved.loginAttempts).toBe(0);
      expect(saved.permissions).toEqual(['system_config', 'operator_management', 'view_analytics', 'manage_affiliates']);
      expect(saved.createdAt).toBeDefined();
      expect(saved.updatedAt).toBeDefined();
    });

    it('should require all mandatory fields', async () => {
      const admin = new Administrator({});

      let error;
      try {
        await admin.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors.firstName).toBeDefined();
      expect(error.errors.lastName).toBeDefined();
      expect(error.errors.email).toBeDefined();
      expect(error.errors.passwordHash).toBeDefined();
      expect(error.errors.passwordSalt).toBeDefined();
    });

    it('should enforce email format validation', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'invalid-email',
        password: 'StrongPassword417!'
      }));

      let error;
      try {
        await admin.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors.email).toBeDefined();
      expect(error.errors.email.message).toContain('Please enter a valid email');
    });

    it('should enforce unique email constraint', async () => {
      // Ensure indexes are created
      await Administrator.ensureIndexes();

      const adminData = createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        password: 'StrongPassword417!'
      });

      await new Administrator(adminData).save();

      const duplicate = new Administrator(createAdminData({
        ...adminData,
        firstName: 'Jane',
        password: 'StrongPassword417!'
      }));

      let error;
      try {
        await duplicate.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.code === 11000 || error.name === 'MongoServerError').toBe(true);
    });

    it('should enforce unique adminId constraint', async () => {
      // Ensure indexes are created
      await Administrator.ensureIndexes();

      const admin1 = new Administrator(createAdminData({
        adminId: 'ADM123456',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        password: 'StrongPassword417!'
      }));
      await admin1.save();

      const admin2 = new Administrator(createAdminData({
        adminId: 'ADM123456',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@laundromat.example',
        password: 'StrongPassword849!'
      }));

      let error;
      try {
        await admin2.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.code === 11000 || error.name === 'MongoServerError').toBe(true);
    });

    it('should validate permission enum values', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!',
        permissions: ['invalid_permission']
      }));

      let error;
      try {
        await admin.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors['permissions.0']).toBeDefined();
    });

    it('should accept valid permissions', async () => {
      const validPermissions = ['system_config', 'operator_management', 'view_analytics', 'manage_affiliates'];

      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!',
        permissions: validPermissions
      }));

      const saved = await admin.save();
      expect(saved.permissions).toEqual(validPermissions);
    });

    it('should trim whitespace from string fields', async () => {
      const admin = new Administrator(createAdminData({
        firstName: '  John  ',
        lastName: '  Doe  ',
        email: '  john@laundromat.example  ',
        password: 'StrongPassword417!'
      }));

      const saved = await admin.save();
      expect(saved.firstName).toBe('John');
      expect(saved.lastName).toBe('Doe');
      expect(saved.email).toBe('john@laundromat.example');
    });

    it('should convert email to lowercase', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'John.Doe@Laundromat.example',
        password: 'StrongPassword417!'
      }));

      const saved = await admin.save();
      expect(saved.email).toBe('john.doe@laundromat.example');
    });

    it('should not allow role to be changed after creation', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!'
      }));

      const saved = await admin.save();
      expect(saved.role).toBe('administrator');

      // Try to change role
      saved.role = 'operator';
      await saved.save();

      const updated = await Administrator.findById(saved._id);
      expect(updated.role).toBe('administrator');
    });
  });

  describe('Password Handling', () => {
    it('should store password as hash and salt', async () => {
      const plainPassword = 'SecurePassword417!';
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: plainPassword
      }));

      const saved = await admin.save();

      // Check that password is stored as hash and salt
      const adminWithPassword = await Administrator.findById(saved._id).select('+passwordHash +passwordSalt');

      expect(adminWithPassword.passwordHash).toBeDefined();
      expect(adminWithPassword.passwordSalt).toBeDefined();
      expect(adminWithPassword.passwordHash).not.toBe(plainPassword);
      expect(adminWithPassword.password).toBeUndefined(); // password field should not exist
    });

    it('should verify correct password', async () => {
      const plainPassword = 'SecurePassword417!';
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: plainPassword
      }));

      await admin.save();

      const adminWithPassword = await Administrator.findByEmailWithPassword('john@laundromat.example');
      const isValid = adminWithPassword.verifyPassword(plainPassword);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'CorrectPassword417!'
      }));

      await admin.save();

      const adminWithPassword = await Administrator.findByEmailWithPassword('john@laundromat.example');
      const isValid = adminWithPassword.verifyPassword('WrongPassword123!');

      expect(isValid).toBe(false);
    });

    it('should not expose password in JSON output', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!'
      }));

      const saved = await admin.save();
      const json = saved.toJSON();

      expect(json.password).toBeUndefined();
      expect(json.passwordHash).toBeUndefined();
      expect(json.passwordSalt).toBeUndefined();
      expect(json.passwordResetToken).toBeUndefined();
      expect(json.passwordResetExpires).toBeUndefined();
      expect(json.__v).toBeUndefined();
    });
  });

  describe('Login Attempts and Account Locking', () => {
    it('should increment login attempts', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!'
      }));

      await admin.save();
      await admin.incLoginAttempts();

      const updated = await Administrator.findById(admin._id);
      expect(updated.loginAttempts).toBe(1);
    });

    it('should lock account after 5 failed attempts', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!',
        loginAttempts: 4
      }));

      await admin.save();
      await admin.incLoginAttempts();

      const updated = await Administrator.findById(admin._id);
      expect(updated.loginAttempts).toBe(5);
      expect(updated.lockUntil).toBeDefined();
      expect(updated.lockUntil).toBeInstanceOf(Date);
      expect(updated.lockUntil.getTime()).toBeGreaterThan(Date.now());
    });

    it('should reset login attempts on successful login', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!',
        loginAttempts: 3,
        lockUntil: new Date(Date.now() + 60000)
      }));

      await admin.save();
      await admin.resetLoginAttempts();

      const updated = await Administrator.findById(admin._id);
      expect(updated.loginAttempts).toBe(0);
      expect(updated.lockUntil).toBeUndefined();
      expect(updated.lastLogin).toBeDefined();
    });

    it('should reset attempts if lock has expired', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!',
        loginAttempts: 5,
        lockUntil: new Date(Date.now() - 60000) // Expired lock
      }));

      await admin.save();
      await admin.incLoginAttempts();

      const updated = await Administrator.findById(admin._id);
      expect(updated.loginAttempts).toBe(1);
      expect(updated.lockUntil).toBeUndefined();
    });

    it('should correctly identify locked accounts', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!'
      }));

      await admin.save();

      // Not locked initially
      expect(admin.isLocked).toBe(false);

      // Lock the account
      admin.lockUntil = new Date(Date.now() + 60000);
      expect(admin.isLocked).toBe(true);

      // Expired lock
      admin.lockUntil = new Date(Date.now() - 60000);
      expect(admin.isLocked).toBe(false);
    });
  });

  describe('Password Reset', () => {
    it('should generate password reset token', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!'
      }));

      await admin.save();

      const resetToken = admin.generatePasswordResetToken();

      expect(resetToken).toBeDefined();
      expect(resetToken).toHaveLength(64); // 32 bytes in hex
      expect(admin.passwordResetToken).toBeDefined();
      expect(admin.passwordResetToken).not.toBe(resetToken); // Should be hashed
      expect(admin.passwordResetExpires).toBeDefined();
      expect(admin.passwordResetExpires.getTime()).toBeGreaterThan(Date.now());
    });

    it('should set password reset expiry to 30 minutes', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!'
      }));

      await admin.save();

      const now = Date.now();
      admin.generatePasswordResetToken();

      const expiryTime = admin.passwordResetExpires.getTime();
      const timeDiff = expiryTime - now;

      // Should be approximately 30 minutes (with some tolerance)
      expect(timeDiff).toBeGreaterThan(29 * 60 * 1000);
      expect(timeDiff).toBeLessThan(31 * 60 * 1000);
    });
  });

  describe('Permissions', () => {
    it('should check single permission correctly', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!',
        permissions: ['system_config', 'view_analytics']
      }));

      await admin.save();

      expect(admin.hasPermission('system_config')).toBe(true);
      expect(admin.hasPermission('view_analytics')).toBe(true);
      expect(admin.hasPermission('operator_management')).toBe(false);
    });

    it('should check multiple permissions with AND operation', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!',
        permissions: ['system_config', 'view_analytics']
      }));

      await admin.save();

      expect(admin.hasAllPermissions(['system_config', 'view_analytics'])).toBe(true);
      expect(admin.hasAllPermissions(['system_config', 'operator_management'])).toBe(false);
      expect(admin.hasAllPermissions([])).toBe(true); // Empty array should return true
    });

    it('should check multiple permissions with OR operation', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!',
        permissions: ['system_config', 'view_analytics']
      }));

      await admin.save();

      expect(admin.hasAnyPermission(['system_config', 'operator_management'])).toBe(true);
      expect(admin.hasAnyPermission(['operator_management', 'manage_affiliates'])).toBe(false);
      expect(admin.hasAnyPermission([])).toBe(false); // Empty array should return false
    });

    it('should set default permissions if none provided', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!',
        permissions: []
      }));

      const saved = await admin.save();

      expect(saved.permissions).toEqual([
        'system_config',
        'operator_management',
        'view_analytics',
        'manage_affiliates'
      ]);
    });
  });

  describe('Static Methods', () => {
    it('should find active administrators', async () => {
      // Create mix of active and inactive admins
      await Administrator.create([
        createAdminData({
          firstName: 'Active',
          lastName: 'Admin1',
          email: 'active1@laundromat.example',
          password: 'StrongPassword417!',
          isActive: true
        }),
        createAdminData({
          firstName: 'Inactive',
          lastName: 'Admin',
          email: 'inactive@laundromat.example',
          password: 'StrongPassword417!',
          isActive: false
        }),
        createAdminData({
          firstName: 'Active',
          lastName: 'Admin2',
          email: 'active2@laundromat.example',
          password: 'StrongPassword417!',
          isActive: true
        })
      ]);

      const activeAdmins = await Administrator.findActive();

      expect(activeAdmins).toHaveLength(2);
      expect(activeAdmins.every(admin => admin.isActive === true)).toBe(true);
    });

    it('should find administrator by email with password', async () => {
      await Administrator.create(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!'
      }));

      const admin = await Administrator.findByEmailWithPassword('john@laundromat.example');

      expect(admin).toBeDefined();
      expect(admin.email).toBe('john@laundromat.example');
      expect(admin.passwordHash).toBeDefined(); // Password hash should be included
      expect(admin.passwordSalt).toBeDefined(); // Password salt should be included
    });

    it('should handle case-insensitive email search', async () => {
      await Administrator.create(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!'
      }));

      const admin = await Administrator.findByEmailWithPassword('JOHN@LAUNDROMAT.EXAMPLE');

      expect(admin).toBeDefined();
      expect(admin.email).toBe('john@laundromat.example');
    });

    it('should return null for non-existent email', async () => {
      const admin = await Administrator.findByEmailWithPassword('nonexistent@laundromat.example');
      expect(admin).toBeNull();
    });
  });

  describe('Timestamps', () => {
    it('should auto-generate timestamps on creation', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!'
      }));

      const saved = await admin.save();

      expect(saved.createdAt).toBeDefined();
      expect(saved.updatedAt).toBeDefined();
      expect(saved.createdAt).toBeInstanceOf(Date);
      expect(saved.updatedAt).toBeInstanceOf(Date);
    });

    it('should update updatedAt on modification', async () => {
      const admin = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!'
      }));

      const saved = await admin.save();
      const originalUpdatedAt = saved.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));

      saved.firstName = 'Jane';
      await saved.save();

      expect(saved.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('Admin ID Generation', () => {
    it('should auto-generate unique admin ID', async () => {
      const admin1 = new Administrator(createAdminData({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!'
      }));

      const admin2 = new Administrator(createAdminData({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@laundromat.example',
        password: 'StrongPassword849!'
      }));

      const saved1 = await admin1.save();
      const saved2 = await admin2.save();

      expect(saved1.adminId).toBeDefined();
      expect(saved2.adminId).toBeDefined();
      expect(saved1.adminId).not.toBe(saved2.adminId);
      expect(saved1.adminId).toMatch(/^ADM[A-Z0-9]+$/);
    });

    it('should not override provided admin ID', async () => {
      const customId = 'ADMCUSTOM123';
      const admin = new Administrator(createAdminData({
        adminId: customId,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        password: 'StrongPassword417!'
      }));

      const saved = await admin.save();
      expect(saved.adminId).toBe(customId);
    });
  });
});