#!/usr/bin/env node

// Clean and Reinitialize Database Script
// This script cleans all collections and reinitializes with default data
// No confirmation required - use with caution!

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');
const logger = require('../../server/utils/logger');


// This repo is PUBLIC: no default admin password may live here. Fail loudly
// rather than provision an all-permissions account with a guessable secret.
function requireOperatorPassword() {
  const pw = process.env.DEFAULT_OPERATOR_PASSWORD;
  if (!pw) {
    console.error('DEFAULT_OPERATOR_PASSWORD is required — refusing to create an operator with a default password.');
    process.exit(1);
  }
  return pw;
}

function requireAdminPassword() {
  const pw = process.env.DEFAULT_ADMIN_PASSWORD;
  if (!pw) {
    console.error('DEFAULT_ADMIN_PASSWORD is required — refusing to create an administrator with a default password.');
    console.error('Set it in the environment, e.g. DEFAULT_ADMIN_PASSWORD=... node <script>');
    process.exit(1);
  }
  return pw;
}

// MongoDB connection options
const mongoOptions = {
  tls: true,
  tlsAllowInvalidCertificates: process.env.NODE_ENV !== 'production'
};

async function cleanAndReinitialize() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, mongoOptions);
    logger.info('Connected to MongoDB');

    // Get all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    logger.info(`Found ${collections.length} collections to clean`);

    // Delete all documents from each collection
    for (const collection of collections) {
      const collectionName = collection.name;
      try {
        const result = await mongoose.connection.db.collection(collectionName).deleteMany({});
        logger.info(`Cleaned ${collectionName}: deleted ${result.deletedCount} documents`);
      } catch (error) {
        logger.error(`Error cleaning ${collectionName}:`, error.message);
      }
    }

    logger.info('All collections cleaned successfully');

    // Initialize system configuration
    logger.info('Initializing system configuration...');
    const SystemConfig = require('../../server/models/SystemConfig');
    await SystemConfig.initializeDefaults();
    logger.info('System configuration initialized');

    // Initialize default accounts
    logger.info('Initializing default accounts...');

    // First, create the default administrator
    const Administrator = require('../../server/models/Administrator');
    const Operator = require('../../server/models/Operator');

    // Check if any administrator exists
    const existingAdminCount = await Administrator.countDocuments();
    let defaultAdmin;

    if (existingAdminCount === 0) {
      const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@crhsent.com';
      defaultAdmin = new Administrator({
        firstName: 'System',
        lastName: 'Administrator',
        email: adminEmail,
        password: requireAdminPassword(),
        permissions: ['all'],
        isActive: true,
        requirePasswordChange: true
      });
      await defaultAdmin.save();
      logger.info('Default administrator account created');
    } else {
      // Get existing admin for createdBy reference
      defaultAdmin = await Administrator.findOne();
    }

    // Then, create the default operator
    const existingOperatorCount = await Operator.countDocuments();

    if (existingOperatorCount === 0) {
      const defaultOperator = new Operator({
        firstName: 'Default',
        lastName: 'Operator',
        email: 'operator@crhsent.com',
        username: 'operator1',
        password: requireOperatorPassword(),
        operatorId: 'OP001',
        shiftStart: '00:00',
        shiftEnd: '23:59',
        isActive: true,
        totalOrdersProcessed: 0,
        averageProcessingTime: 0,
        qualityScore: 100,
        createdBy: defaultAdmin._id // Use the admin ID
      });
      await defaultOperator.save();
      logger.info('Default operator account created');
    }

    // Display summary
    logger.info('=== Database Cleanup and Reinitialization Complete ===');
    logger.info('');
    logger.info('Default Administrator Account:');
    logger.info(`  Email: ${process.env.DEFAULT_ADMIN_EMAIL || 'admin@crhsent.com'}`);
    logger.info('  Password: (the DEFAULT_ADMIN_PASSWORD you supplied)');
    logger.info('  Note: Password must be changed on first login');
    logger.info('');
    logger.info('Default Operator Account:');
    logger.info('  Username: operator1');
    logger.info('  Password: (the DEFAULT_OPERATOR_PASSWORD you supplied)');
    logger.info('  Shift: 24 hours (00:00 - 23:59)');
    logger.info('  Workstation: W1');
    logger.info('  Operator ID: OP001');
    logger.info('');
    logger.info('System Configuration:');
    logger.info('  WDF Base Rate: $1.25/lb');
    logger.info('  Default Delivery Fee: $5.00 + $2.00/bag');
    logger.info('  All default values initialized');
    logger.info('====================================================');

    await mongoose.connection.close();
    logger.info('Database connection closed');

    process.exit(0);
  } catch (error) {
    logger.error('Error during database cleanup and reinitialization:', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Handle script termination
process.on('SIGINT', () => {
  logger.info('Process interrupted');
  process.exit(1);
});

// Run the cleanup and reinitialization
cleanAndReinitialize();