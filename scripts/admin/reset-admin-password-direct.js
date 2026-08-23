#!/usr/bin/env node

// Direct password reset for administrator
// This bypasses the normal password change flow to fix login issues

require('dotenv').config();
const mongoose = require('mongoose');
const Administrator = require('../../server/models/Administrator');
const encryptionUtil = require('../../server/utils/encryption');

const ADMIN_EMAIL = 'admin@crhsent.com';
const NEW_PASSWORD = 'R8der50!2025';

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Find the administrator
    const admin = await Administrator.findOne({ email: ADMIN_EMAIL });
    if (!admin) {
      console.error(`❌ Administrator with email ${ADMIN_EMAIL} not found!`);
      return;
    }

    console.log(`Found administrator: ${admin.email} (${admin.adminId})`);
    
    // Hash the new password
    const { salt, hash } = encryptionUtil.hashPassword(NEW_PASSWORD);
    
    // Update the password directly
    admin.passwordSalt = salt;
    admin.passwordHash = hash;
    admin.requirePasswordChange = false; // Clear any password change requirements
    admin.loginAttempts = 0; // Reset login attempts
    admin.lockUntil = undefined; // Clear any account locks
    
    await admin.save();

    console.log('\n✅ Password reset successfully!');
    console.log('=================================');
    console.log(`Email: ${admin.email}`);
    console.log(`Password: ${NEW_PASSWORD}`);
    console.log('=================================');
    console.log('\nYou should now be able to login.');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

main();