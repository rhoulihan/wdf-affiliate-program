#!/usr/bin/env node

// Complete database setup script
// This script initializes all default data including:
// - System configuration
// - Default administrator account
// - Default operator account
// Usage: node scripts/setup-database.js

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');
const logger = require('../../server/utils/logger');

// MongoDB connection options
const mongoOptions = {
  tls: true,
  tlsAllowInvalidCertificates: process.env.NODE_ENV !== 'production'
};

async function setupDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, mongoOptions);
    logger.info('Connected to MongoDB');

    // Initialize system configuration
    logger.info('Initializing system configuration...');
    const SystemConfig = require('../../server/models/SystemConfig');
    await SystemConfig.initializeDefaults();
    logger.info('System configuration initialized');

    // Initialize default accounts
    logger.info('Initializing default accounts...');
    const { initializeDefaults } = require('../../init-defaults');
    await initializeDefaults();

    // Display summary
    logger.info('=== Database Setup Complete ===');
    logger.info('Default Administrator:');
    logger.info(`  Email: ${process.env.DEFAULT_ADMIN_EMAIL || 'admin@crhsent.com'}`);
    logger.info('  Password: (the DEFAULT_ADMIN_PASSWORD you supplied)');
    logger.info('  Note: Password must be changed on first login');
    logger.info('');
    logger.info('Default Operator:');
    logger.info('  Username: operator1');
    logger.info('  Password: (the DEFAULT_OPERATOR_PASSWORD you supplied)');
    logger.info('  Shift: 24 hours (00:00 - 23:59)');
    logger.info('  Workstation: W1');
    logger.info('');
    logger.info('System Configuration:');
    logger.info('  WDF Base Rate: $1.25/lb');
    logger.info('  Default values for all settings initialized');
    logger.info('===============================');

    process.exit(0);
  } catch (error) {
    logger.error('Error during database setup:', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Handle script termination
process.on('SIGINT', () => {
  logger.info('Setup interrupted');
  process.exit(1);
});

// Run the setup
setupDatabase();