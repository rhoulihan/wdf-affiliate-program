#!/usr/bin/env node

// Quick Administrator Creation Script
// Creates an admin account with specified credentials

require('dotenv').config();
const mongoose = require('mongoose');
const Administrator = require('../../server/models/Administrator');
const encryptionUtil = require('../../server/utils/encryption');

// Configuration - CHANGE THESE VALUES
const ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || 'admin@wavemaxlaundry.com';
const ADMIN_PASSWORD = 'WaveMAX!2024';  // Default password as per README
const ADMIN_FIRST_NAME = 'System';
const ADMIN_LAST_NAME = 'Administrator';

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Check if admin already exists
    const existingAdmin = await Administrator.findOne({ email: ADMIN_EMAIL });
    if (existingAdmin) {
      console.log(`Administrator with email ${ADMIN_EMAIL} already exists!`);
      console.log(`Admin ID: ${existingAdmin.adminId}`);
      console.log('\nTo update the password, you can delete and recreate the account.');
      return;
    }

    // Create new administrator
    console.log('Creating new administrator...');
    
    // Create password hash
    const { salt, hash } = encryptionUtil.hashPassword(ADMIN_PASSWORD);
    
    const newAdmin = new Administrator({
      firstName: ADMIN_FIRST_NAME,
      lastName: ADMIN_LAST_NAME,
      email: ADMIN_EMAIL,
      passwordSalt: salt,
      passwordHash: hash,
      permissions: [
        'all' // Super admin with all permissions
      ],
      requirePasswordChange: false,
      isActive: true
    });

    await newAdmin.save();

    console.log('\n✅ Administrator created successfully!');
    console.log('=================================');
    console.log(`Admin ID: ${newAdmin.adminId}`);
    console.log(`Email: ${newAdmin.email}`);
    console.log(`Password: ${ADMIN_PASSWORD}`);
    console.log('=================================');
    console.log('\n⚠️  IMPORTANT: Please change the password after first login!');
    console.log('\nLogin URL: https://portal.atxwashdryfold.com/embed-app-v2.html?route=/administrator-login');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 11000) {
      console.error('Administrator with this email already exists!');
    }
  } finally {
    await mongoose.connection.close();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

main();