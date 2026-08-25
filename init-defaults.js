// Initialize Default Accounts
// This module is called during database initialization to create default admin and operator accounts

const Administrator = require('./server/models/Administrator');
const Operator = require('./server/models/Operator');
const logger = require('./server/utils/logger');

async function initializeDefaultAdmin() {
  try {
    // Check if any administrator exists
    const existingAdminCount = await Administrator.countDocuments();

    if (existingAdminCount > 0) {
      logger.info('Administrator accounts already exist, skipping default admin creation');
      return;
    }

    // Create default administrator account
    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@crhsent.com';
    const defaultAdmin = new Administrator({
      firstName: 'System',
      lastName: 'Administrator',
      email: adminEmail,
      permissions: ['all'], // Super admin with all permissions
      isActive: true,
      requirePasswordChange: true // Force password change on first login
    });
    // Administrator model doesn't hash `password` in a pre-save hook — it
    // stores passwordSalt/passwordHash directly. setPassword fills both.
    defaultAdmin.setPassword('WaveMAX!2024');

    await defaultAdmin.save();

    logger.info('Default administrator account created successfully');
    logger.info(`Email: ${adminEmail}`);
    logger.info('Default Password: WaveMAX!2024 (must be changed on first login)');

    return defaultAdmin;
  } catch (error) {
    logger.error('Failed to create default administrator:', { error: error.message });
    throw error;
  }
}

async function initializeDefaultOperator(createdBy) {
  try {
    // Check if any operator exists
    const existingOperatorCount = await Operator.countDocuments();

    if (existingOperatorCount > 0) {
      logger.info('Operator accounts already exist, skipping default operator creation');
      return;
    }

    // Operator.createdBy is required — fall back to any active admin if a
    // reference wasn't passed in explicitly.
    let creator = createdBy;
    if (!creator) {
      const admin = await Administrator.findOne({ isActive: true });
      if (!admin) {
        throw new Error('No administrator available to set as operator.createdBy');
      }
      creator = admin._id;
    }

    // Create default operator account with 24-hour shift
    const defaultOperator = new Operator({
      firstName: 'Default',
      lastName: 'Operator',
      email: 'operator@crhsent.com',
      username: 'operator1',
      password: 'Operator!2024',
      operatorId: 'OP001',
      shiftStart: '00:00', // Start of 24-hour shift
      shiftEnd: '23:59',   // End of 24-hour shift
      workStation: 'W1',    // Default to workstation 1
      isActive: true,
      totalOrdersProcessed: 0,
      averageProcessingTime: 0,
      qualityScore: 100,    // Start with perfect quality score
      createdBy: creator
    });

    await defaultOperator.save();

    logger.info('Default operator account created successfully');
    logger.info('Operator ID: OP001');
    logger.info('Username: operator1');
    logger.info('Default Password: Operator!2024');
    logger.info('Shift: 24 hours (00:00 - 23:59)');
    logger.info('Workstation: W1');

    return defaultOperator;
  } catch (error) {
    logger.error('Failed to create default operator:', { error: error.message });
    throw error;
  }
}

async function initializeDefaults() {
  try {
    // Initialize default administrator
    const admin = await initializeDefaultAdmin();

    // Initialize default operator; pass the admin's _id as createdBy when
    // we just created one, otherwise initializeDefaultOperator finds any.
    await initializeDefaultOperator(admin ? admin._id : null);
    
    logger.info('Default accounts initialization complete');
  } catch (error) {
    logger.error('Error during default accounts initialization:', { error: error.message });
    throw error;
  }
}

// Export functions
module.exports = { 
  initializeDefaultAdmin,
  initializeDefaultOperator,
  initializeDefaults
};

// Allow running as standalone script
if (require.main === module) {
  require('dotenv').config();
  const mongoose = require('mongoose');

  // MongoDB connection options
  const mongoOptions = {
    tls: true,
    tlsAllowInvalidCertificates: process.env.NODE_ENV !== 'production'
  };

  mongoose.connect(process.env.MONGODB_URI, mongoOptions)
    .then(() => {
      logger.info('Connected to MongoDB');
      return initializeDefaults();
    })
    .then(() => {
      logger.info('Default initialization complete');
      process.exit(0);
    })
    .catch(err => {
      logger.error('Error during initialization:', { error: err.message });
      process.exit(1);
    });
}