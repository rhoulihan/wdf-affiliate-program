#!/usr/bin/env node

// Verify Administrator Account Script
// This script checks if the default administrator account was created

require('dotenv').config();
const mongoose = require('mongoose');
const Administrator = require('../../server/models/Administrator');

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Check for administrators
    const adminCount = await Administrator.countDocuments();
    console.log(`Total administrators: ${adminCount}`);

    if (adminCount > 0) {
      // Find the default admin
      const defaultAdmin = await Administrator.findOne({
        email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@crhsent.com'
      });

      if (defaultAdmin) {
        console.log('\n✓ Default administrator found:');
        console.log(`  - Admin ID: ${defaultAdmin.adminId}`);
        console.log(`  - Name: ${defaultAdmin.firstName} ${defaultAdmin.lastName}`);
        console.log(`  - Email: ${defaultAdmin.email}`);
        console.log(`  - Permissions: ${defaultAdmin.permissions.join(', ')}`);
        console.log(`  - Require Password Change: ${defaultAdmin.requirePasswordChange}`);
        console.log(`  - Active: ${defaultAdmin.isActive}`);
        console.log(`  - Created: ${defaultAdmin.createdAt}`);
      } else {
        console.log('\n⚠ Default administrator not found with expected email');

        // List all administrators
        const allAdmins = await Administrator.find({}, 'adminId email firstName lastName');
        console.log('\nExisting administrators:');
        allAdmins.forEach(admin => {
          console.log(`  - ${admin.adminId}: ${admin.firstName} ${admin.lastName} (${admin.email})`);
        });
      }
    } else {
      console.log('\n❌ No administrators found in the database');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

main();