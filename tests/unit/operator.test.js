const mongoose = require('mongoose');
const Operator = require('../../server/models/Operator');
const crypto = require('crypto');

describe('Operator Model', () => {
  let createdById;

  beforeAll(() => {
    // Create a fake administrator ID for createdBy field
    createdById = new mongoose.Types.ObjectId();
  });

  beforeEach(async () => {
    // Clear the collection before each test
    await Operator.deleteMany({});
  });

  describe('Schema Validation', () => {
    it('should create a valid operator', async () => {
      const operatorData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'johndoe',
        password: 'SecurePassword123!',
        shiftStart: '08:00',
        shiftEnd: '17:00',
        createdBy: createdById
      };

      const operator = new Operator(operatorData);
      const saved = await operator.save();

      expect(saved._id).toBeDefined();
      expect(saved.operatorId).toBeDefined();
      expect(saved.operatorId).toMatch(/^OPR/);
      expect(saved.firstName).toBe('John');
      expect(saved.lastName).toBe('Doe');
      expect(saved.email).toBe('john.doe@laundromat.example');
      expect(saved.username).toBe('johndoe');
      expect(saved.role).toBe('operator');
      expect(saved.isActive).toBe(true);
      expect(saved.shiftStart).toBe('08:00');
      expect(saved.shiftEnd).toBe('17:00');
      expect(saved.currentOrderCount).toBe(0);
      expect(saved.totalOrdersProcessed).toBe(0);
      expect(saved.averageProcessingTime).toBe(0);
      expect(saved.qualityScore).toBe(100);
      expect(saved.loginAttempts).toBe(0);
      expect(saved.createdAt).toBeDefined();
      expect(saved.updatedAt).toBeDefined();
    });

    it('should require all mandatory fields', async () => {
      const operator = new Operator({});

      let error;
      try {
        await operator.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors.firstName).toBeDefined();
      expect(error.errors.lastName).toBeDefined();
      expect(error.errors.email).toBeDefined();
      expect(error.errors.username).toBeDefined();
      expect(error.errors.password).toBeDefined();
      expect(error.errors.createdBy).toBeDefined();
    });

    it('should enforce email format validation', async () => {
      const operator = new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'invalid-email',
        username: 'johndoe',
        password: 'password123',
        createdBy: createdById
      });

      let error;
      try {
        await operator.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors.email).toBeDefined();
      expect(error.errors.email.message).toContain('Please enter a valid email');
    });

    it('should enforce unique email constraint', async () => {
      await Operator.ensureIndexes();

      const operatorData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'johndoe',
        password: 'password123',
        createdBy: createdById
      };

      await new Operator(operatorData).save();

      const duplicate = new Operator({
        ...operatorData,
        firstName: 'Jane',
        username: 'janedoe'
      });

      let error;
      try {
        await duplicate.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.code === 11000 || error.name === 'MongoServerError').toBe(true);
    });

    it('should enforce unique username constraint', async () => {
      await Operator.ensureIndexes();

      const operatorData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'johndoe',
        password: 'password123',
        createdBy: createdById
      };

      await new Operator(operatorData).save();

      const duplicate = new Operator({
        ...operatorData,
        email: 'jane.doe@laundromat.example',
        firstName: 'Jane'
      });

      let error;
      try {
        await duplicate.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.code === 11000 || error.name === 'MongoServerError').toBe(true);
    });

    it('should validate username format', async () => {
      const operator = new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'john doe!', // Invalid - contains space and special char
        password: 'password123',
        createdBy: createdById
      });

      let error;
      try {
        await operator.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors.username).toBeDefined();
      expect(error.errors.username.message).toContain('Username can only contain letters, numbers, underscores, and hyphens');
    });

    it('should validate shift time format', async () => {
      const operator = new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'johndoe',
        password: 'password123',
        shiftStart: '25:00', // Invalid time
        createdBy: createdById
      });

      let error;
      try {
        await operator.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors.shiftStart).toBeDefined();
      expect(error.errors.shiftStart.message).toContain('Please enter a valid time format (HH:MM)');
    });

    it('should accept valid shift times', async () => {
      const operator = new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'johndoe',
        password: 'password123',
        shiftStart: '08:30',
        shiftEnd: '17:45',
        createdBy: createdById
      });

      const saved = await operator.save();
      expect(saved.shiftStart).toBe('08:30');
      expect(saved.shiftEnd).toBe('17:45');
    });

    it('should enforce quality score range', async () => {
      const operator = new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'johndoe',
        password: 'password123',
        qualityScore: 150, // Out of range
        createdBy: createdById
      });

      let error;
      try {
        await operator.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors.qualityScore).toBeDefined();
    });

    it('should trim whitespace from string fields', async () => {
      const operator = new Operator({
        firstName: '  John  ',
        lastName: '  Doe  ',
        email: '  john.doe@laundromat.example  ',
        username: '  johndoe  ',
        password: 'password123',
        createdBy: createdById
      });

      const saved = await operator.save();
      expect(saved.firstName).toBe('John');
      expect(saved.lastName).toBe('Doe');
      expect(saved.email).toBe('john.doe@laundromat.example');
      expect(saved.username).toBe('johndoe');
    });

    it('should convert email and username to lowercase', async () => {
      const operator = new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'JOHN.DOE@LAUNDROMAT.EXAMPLE',
        username: 'JOHNDOE',
        password: 'password123',
        createdBy: createdById
      });

      const saved = await operator.save();
      expect(saved.email).toBe('john.doe@laundromat.example');
      expect(saved.username).toBe('johndoe');
    });

    it('should not allow role to be changed after creation', async () => {
      const operator = new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'johndoe',
        password: 'password123',
        createdBy: createdById
      });

      const saved = await operator.save();
      expect(saved.role).toBe('operator'); // Default role

      // Try to update role
      saved.role = 'admin';
      await saved.save();

      const reloaded = await Operator.findById(saved._id);
      expect(reloaded.role).toBe('operator'); // Should still be operator due to immutable
    });
  });

  describe('Password Handling', () => {
    it('should hash password on save', async () => {
      const plainPassword = 'MySecurePassword123!';
      const operator = new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'johndoe',
        password: plainPassword,
        createdBy: createdById
      });

      const saved = await operator.save();

      // Reload with password field
      const withPassword = await Operator.findById(saved._id).select('+password');
      expect(withPassword.password).toBeDefined();
      expect(withPassword.password).not.toBe(plainPassword);
      expect(withPassword.password).toContain(':'); // Salt separator
    });

    it('should verify correct password', async () => {
      const plainPassword = 'MySecurePassword123!';
      const operator = new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'johndoe',
        password: plainPassword,
        createdBy: createdById
      });

      await operator.save();

      const found = await Operator.findById(operator._id).select('+password');
      expect(found.verifyPassword(plainPassword)).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const operator = new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'johndoe',
        password: 'CorrectPassword123!',
        createdBy: createdById
      });

      await operator.save();

      const found = await Operator.findById(operator._id).select('+password');
      expect(found.verifyPassword('WrongPassword123!')).toBe(false);
    });

    it('should not expose password in JSON output', async () => {
      const operator = new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'johndoe',
        password: 'password123',
        createdBy: createdById
      });

      const saved = await operator.save();
      const json = saved.toJSON();

      expect(json.password).toBeUndefined();
      expect(json.passwordResetToken).toBeUndefined();
      expect(json.passwordResetExpires).toBeUndefined();
    });
  });

  describe('Login Attempts and Account Locking', () => {
    let operator;

    beforeEach(async () => {
      operator = await new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'johndoe',
        password: 'password123',
        createdBy: createdById
      }).save();
    });

    it('should increment login attempts', async () => {
      await operator.incLoginAttempts();

      const updated = await Operator.findById(operator._id);
      expect(updated.loginAttempts).toBe(1);
    });

    it('should lock account after 5 failed attempts', async () => {
      // Simulate 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await operator.incLoginAttempts();
        operator = await Operator.findById(operator._id);
      }

      expect(operator.loginAttempts).toBe(5);
      expect(operator.lockUntil).toBeDefined();
      expect(operator.lockUntil > new Date()).toBe(true);
    });

    it('should lock for 30 minutes', async () => {
      // Get to 4 attempts
      for (let i = 0; i < 4; i++) {
        await operator.incLoginAttempts();
        operator = await Operator.findById(operator._id);
      }

      const beforeLock = new Date();
      await operator.incLoginAttempts();
      operator = await Operator.findById(operator._id);

      const lockDuration = operator.lockUntil - beforeLock;
      const thirtyMinutesInMs = 30 * 60 * 1000;

      expect(lockDuration).toBeGreaterThan(thirtyMinutesInMs - 1000);
      expect(lockDuration).toBeLessThan(thirtyMinutesInMs + 1000);
    });

    it('should reset login attempts on successful login', async () => {
      // Add some failed attempts
      await operator.incLoginAttempts();
      await operator.incLoginAttempts();

      await operator.resetLoginAttempts();

      const updated = await Operator.findById(operator._id);
      expect(updated.loginAttempts).toBe(0);
      expect(updated.lockUntil).toBeUndefined();
      expect(updated.lastLogin).toBeDefined();
    });

    it('should reset attempts if lock has expired', async () => {
      // Set expired lock
      operator.lockUntil = new Date(Date.now() - 1000);
      operator.loginAttempts = 5;
      await operator.save();

      await operator.incLoginAttempts();

      const updated = await Operator.findById(operator._id);
      expect(updated.loginAttempts).toBe(1);
      expect(updated.lockUntil).toBeUndefined();
    });

    it('should correctly identify locked accounts', async () => {
      expect(operator.isLocked).toBe(false);

      operator.lockUntil = new Date(Date.now() + 60000); // 1 minute from now
      expect(operator.isLocked).toBe(true);

      operator.lockUntil = new Date(Date.now() - 60000); // 1 minute ago
      expect(operator.isLocked).toBe(false);
    });
  });

  describe('Password Reset', () => {
    it('should generate password reset token', async () => {
      const operator = new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'johndoe',
        password: 'password123',
        createdBy: createdById
      });

      const resetToken = operator.generatePasswordResetToken();

      expect(resetToken).toBeDefined();
      expect(resetToken.length).toBe(64); // 32 bytes hex = 64 chars
      expect(operator.passwordResetToken).toBeDefined();
      expect(operator.passwordResetToken).not.toBe(resetToken); // Should be hashed
      expect(operator.passwordResetExpires).toBeDefined();
    });

    it('should set password reset expiry to 30 minutes', async () => {
      const operator = new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'johndoe',
        password: 'password123',
        createdBy: createdById
      });

      const beforeGenerate = new Date();
      operator.generatePasswordResetToken();

      const expiryDuration = operator.passwordResetExpires - beforeGenerate;
      const thirtyMinutesInMs = 30 * 60 * 1000;

      expect(expiryDuration).toBeGreaterThan(thirtyMinutesInMs - 1000);
      expect(expiryDuration).toBeLessThan(thirtyMinutesInMs + 1000);
    });
  });

  describe('Shift Management', () => {
    describe('isOnShift virtual', () => {
      it('should return true when no shift times are set', async () => {
        const operator = new Operator({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@laundromat.example',
          username: 'johndoe',
          password: 'password123',
          createdBy: createdById
        });

        expect(operator.isOnShift).toBe(true);
      });

      it('should correctly identify operator on shift during normal hours', async () => {
        const now = new Date();
        const currentHour = now.getHours();

        const operator = new Operator({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@laundromat.example',
          username: 'johndoe',
          password: 'password123',
          shiftStart: `${String(currentHour).padStart(2, '0')}:00`,
          shiftEnd: `${String((currentHour + 1) % 24).padStart(2, '0')}:00`,
          createdBy: createdById
        });

        expect(operator.isOnShift).toBe(true);
      });

      it('should correctly identify operator off shift', async () => {
        const now = new Date();
        const currentHour = now.getHours();

        const operator = new Operator({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@laundromat.example',
          username: 'johndoe',
          password: 'password123',
          shiftStart: `${String((currentHour + 2) % 24).padStart(2, '0')}:00`,
          shiftEnd: `${String((currentHour + 3) % 24).padStart(2, '0')}:00`,
          createdBy: createdById
        });

        expect(operator.isOnShift).toBe(false);
      });

      it('should handle overnight shifts correctly', async () => {
        // Create operator with overnight shift (22:00 - 06:00)
        const operator = new Operator({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@laundromat.example',
          username: 'johndoe',
          password: 'password123',
          shiftStart: '22:00',
          shiftEnd: '06:00',
          createdBy: createdById
        });

        // Mock current time to be 23:00
        const now = new Date();
        const currentHour = now.getHours();

        if (currentHour >= 22 || currentHour < 6) {
          expect(operator.isOnShift).toBe(true);
        } else {
          expect(operator.isOnShift).toBe(false);
        }
      });
    });
  });

  describe('Processing Statistics', () => {
    it('should update processing stats correctly', async () => {
      const operator = await new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'johndoe',
        password: 'password123',
        totalOrdersProcessed: 10,
        averageProcessingTime: 30,
        createdBy: createdById
      }).save();

      await operator.updateProcessingStats(40);

      expect(operator.totalOrdersProcessed).toBe(11);
      expect(operator.averageProcessingTime).toBeCloseTo(30.91, 1);
    });

    it('should handle first order processing', async () => {
      const operator = await new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'johndoe',
        password: 'password123',
        createdBy: createdById
      }).save();

      await operator.updateProcessingStats(45);

      expect(operator.totalOrdersProcessed).toBe(1);
      expect(operator.averageProcessingTime).toBe(45);
    });

    it('should update quality score with passing result', async () => {
      const operator = await new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'johndoe',
        password: 'password123',
        qualityScore: 80,
        createdBy: createdById
      }).save();

      await operator.updateQualityScore(true);

      // 80 * 0.9 + 100 * 0.1 = 72 + 10 = 82
      expect(operator.qualityScore).toBe(82);
    });

    it('should update quality score with failing result', async () => {
      const operator = await new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'johndoe',
        password: 'password123',
        qualityScore: 80,
        createdBy: createdById
      }).save();

      await operator.updateQualityScore(false);

      // 80 * 0.9 + 0 * 0.1 = 72 + 0 = 72
      expect(operator.qualityScore).toBe(72);
    });
  });

  describe('Static Methods', () => {
    describe('findActive', () => {
      it('should find only active operators', async () => {
        await new Operator({
          firstName: 'Active',
          lastName: 'Op',
          email: 'active@laundromat.example',
          username: 'activeop',
          password: 'password123',
          isActive: true,
          createdBy: createdById
        }).save();

        await new Operator({
          firstName: 'Inactive',
          lastName: 'Op',
          email: 'inactive@laundromat.example',
          username: 'inactiveop',
          password: 'password123',
          isActive: false,
          createdBy: createdById
        }).save();

        const active = await Operator.findActive();
        expect(active.length).toBe(1);
        expect(active[0].firstName).toBe('Active');
      });
    });

    describe('findOnShift', () => {
      it('should find only operators on shift', async () => {
        const now = new Date();
        const currentHour = now.getHours();

        await new Operator({
          firstName: 'OnShift',
          lastName: 'Op',
          email: 'onshift@laundromat.example',
          username: 'onshiftop',
          password: 'password123',
          shiftStart: `${String(currentHour).padStart(2, '0')}:00`,
          shiftEnd: `${String((currentHour + 1) % 24).padStart(2, '0')}:00`,
          createdBy: createdById
        }).save();

        await new Operator({
          firstName: 'OffShift',
          lastName: 'Op',
          email: 'offshift@laundromat.example',
          username: 'offshiftop',
          password: 'password123',
          shiftStart: `${String((currentHour + 2) % 24).padStart(2, '0')}:00`,
          shiftEnd: `${String((currentHour + 3) % 24).padStart(2, '0')}:00`,
          createdBy: createdById
        }).save();

        const onShift = await Operator.findOnShift();
        expect(onShift.length).toBe(1);
        expect(onShift[0].firstName).toBe('OnShift');
      });
    });

    describe('findByEmailWithPassword', () => {
      it('should find operator by email with password', async () => {
        await new Operator({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@laundromat.example',
          username: 'johndoe',
          password: 'password123',
          createdBy: createdById
        }).save();

        const found = await Operator.findByEmailWithPassword('john.doe@laundromat.example');
        expect(found).toBeDefined();
        expect(found.email).toBe('john.doe@laundromat.example');
        expect(found.password).toBeDefined(); // Password should be included
      });

      it('should handle case-insensitive email search', async () => {
        await new Operator({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@laundromat.example',
          username: 'johndoe',
          password: 'password123',
          createdBy: createdById
        }).save();

        const found = await Operator.findByEmailWithPassword('JOHN.DOE@LAUNDROMAT.EXAMPLE');
        expect(found).toBeDefined();
        expect(found.email).toBe('john.doe@laundromat.example');
      });

      it('should return null for non-existent email', async () => {
        const found = await Operator.findByEmailWithPassword('nonexistent@laundromat.example');
        expect(found).toBeNull();
      });
    });

    describe('findAvailableOperators', () => {
      it('should find operators with low order count', async () => {
        await new Operator({
          firstName: 'Available',
          lastName: 'Op',
          email: 'available@laundromat.example',
          username: 'availableop',
          password: 'password123',
          currentOrderCount: 2,
          createdBy: createdById
        }).save();

        await new Operator({
          firstName: 'Busy',
          lastName: 'Op',
          email: 'busy@laundromat.example',
          username: 'busyop',
          password: 'password123',
          currentOrderCount: 10,
          createdBy: createdById
        }).save();

        const available = await Operator.findAvailableOperators();
        expect(available.length).toBe(1);
        expect(available[0].firstName).toBe('Available');
      });

      it('should sort by current order count', async () => {
        await new Operator({
          firstName: 'Less',
          lastName: 'Busy',
          email: 'less@laundromat.example',
          username: 'lessbusy',
          password: 'password123',
          currentOrderCount: 5,
          createdBy: createdById
        }).save();

        await new Operator({
          firstName: 'Least',
          lastName: 'Busy',
          email: 'least@laundromat.example',
          username: 'leastbusy',
          password: 'password123',
          currentOrderCount: 2,
          createdBy: createdById
        }).save();

        const available = await Operator.findAvailableOperators();
        expect(available[0].currentOrderCount).toBe(2);
        expect(available[1].currentOrderCount).toBe(5);
      });

      it('should respect limit parameter', async () => {
        for (let i = 0; i < 10; i++) {
          await new Operator({
            firstName: `Op${i}`,
            lastName: 'Test',
            email: `op${i}@laundromat.example`,
            username: `op${i}`,
            password: 'password123',
            currentOrderCount: i,
            createdBy: createdById
          }).save();
        }

        const available = await Operator.findAvailableOperators(3);
        expect(available.length).toBe(3);
      });
    });
  });

  describe('Timestamps', () => {
    it('should auto-generate timestamps on creation', async () => {
      const beforeCreate = new Date();

      const operator = await new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'johndoe',
        password: 'password123',
        createdBy: createdById
      }).save();

      expect(operator.createdAt).toBeDefined();
      expect(operator.updatedAt).toBeDefined();
      expect(operator.createdAt >= beforeCreate).toBe(true);
      expect(operator.updatedAt >= beforeCreate).toBe(true);
    });

    it('should update updatedAt on modification', async () => {
      const operator = await new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@laundromat.example',
        username: 'johndoe',
        password: 'password123',
        createdBy: createdById
      }).save();

      const originalUpdatedAt = operator.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));

      operator.firstName = 'Jane';
      await operator.save();

      expect(operator.updatedAt > originalUpdatedAt).toBe(true);
    });
  });

  describe('Operator ID Generation', () => {
    it('should auto-generate unique operator ID', async () => {
      const operator1 = await new Operator({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john1@laundromat.example',
        username: 'john1',
        password: 'password123',
        createdBy: createdById
      }).save();

      const operator2 = await new Operator({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@laundromat.example',
        username: 'jane',
        password: 'password123',
        createdBy: createdById
      }).save();

      expect(operator1.operatorId).toBeDefined();
      expect(operator2.operatorId).toBeDefined();
      expect(operator1.operatorId).not.toBe(operator2.operatorId);
      expect(operator1.operatorId).toMatch(/^OPR[A-Z0-9]+$/);
    });

    it('should not override provided operator ID', async () => {
      const customId = 'OPR-CUSTOM-123';

      const operator = await new Operator({
        operatorId: customId,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@laundromat.example',
        username: 'john',
        password: 'password123',
        createdBy: createdById
      }).save();

      expect(operator.operatorId).toBe(customId);
    });
  });
});