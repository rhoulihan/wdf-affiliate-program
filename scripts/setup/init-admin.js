// Initialize Default Administrator Account
// This script is called during database initialization to create the default admin account

const mongoose = require('mongoose');
const Administrator = require('./server/models/Administrator');
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
      password: 'WaveMAX!2024',
      permissions: ['all'], // Super admin with all permissions
      isActive: true,
      requirePasswordChange: true // Force password change on first login
    });

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

// Export for use in server.js and as standalone script
module.exports = { initializeDefaultAdmin };

// Allow running as standalone script
if (require.main === module) {
  require('dotenv').config();

  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      logger.info('Connected to MongoDB');
      return initializeDefaultAdmin();
    })
    .then(() => {
      logger.info('Default admin initialization complete');
      process.exit(0);
    })
    .catch(err => {
      logger.error('Error during initialization:', { error: err.message });
      process.exit(1);
    });
}