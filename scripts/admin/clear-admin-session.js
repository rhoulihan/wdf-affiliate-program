#!/usr/bin/env node

// Clear Administrator Session Script
// This script helps clear any stuck admin sessions from the database

require('dotenv').config();
const mongoose = require('mongoose');
const TokenBlacklist = require('../../server/models/TokenBlacklist');
const RefreshToken = require('../../server/models/RefreshToken');
const Administrator = require('../../server/models/Administrator');

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Find the default admin
    const defaultAdmin = await Administrator.findOne({
      email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@crhsent.com'
    });

    if (defaultAdmin) {
      console.log('Found administrator:', defaultAdmin.adminId);

      // Clear any refresh tokens for this admin
      const deletedTokens = await RefreshToken.deleteMany({
        userId: defaultAdmin._id
      });
      console.log(`✓ Deleted ${deletedTokens.deletedCount} refresh tokens`);

      // Clear any blacklisted tokens for this admin
      const deletedBlacklisted = await TokenBlacklist.deleteMany({
        userId: defaultAdmin._id.toString()
      });
      console.log(`✓ Deleted ${deletedBlacklisted.deletedCount} blacklisted tokens`);

      // Ensure requirePasswordChange is true
      if (!defaultAdmin.requirePasswordChange) {
        defaultAdmin.requirePasswordChange = true;
        await defaultAdmin.save();
        console.log('✓ Set requirePasswordChange to true');
      } else {
        console.log('✓ requirePasswordChange is already true');
      }
    } else {
      console.log('❌ Default administrator not found');
    }

    console.log('\n✅ Session cleanup completed!');
    console.log('The administrator will need to login with credentials on next access.');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

main();