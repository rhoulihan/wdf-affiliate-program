#!/usr/bin/env node

// Direct password reset for administrator
// This bypasses the normal password change flow to fix login issues

require('dotenv').config();
const mongoose = require('mongoose');
const Administrator = require('../../server/models/Administrator');
const encryptionUtil = require('../../server/utils/encryption');

const ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || 'admin@crhsent.com';

// This repo is PUBLIC: the password must never be a committed literal. It was
// one ('R8der50!2025', since eeab1181) until Plan 3 task 38's follow-up.
const NEW_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD;
if (!NEW_PASSWORD) {
  console.error('DEFAULT_ADMIN_PASSWORD is required — refusing to reset an administrator password to a default.');
  console.error('Usage: DEFAULT_ADMIN_PASSWORD=... node scripts/admin/reset-admin-password-direct.js');
  process.exit(1);
}

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