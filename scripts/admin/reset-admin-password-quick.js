#!/usr/bin/env node

// Quick Admin Password Reset Script
// Usage: node reset-admin-password-quick.js <email> <new-password>

require('dotenv').config();
const mongoose = require('mongoose');
const Administrator = require('../../server/models/Administrator');
const encryptionUtil = require('../../server/utils/encryption');

// Get command line arguments
const args = process.argv.slice(2);
const email = args[0] || 'admin@wavemaxlaundry.com';
const newPassword = args[1] || 'Admin@2025!';

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Find the administrator
    const admin = await Administrator.findOne({ email: email.toLowerCase() });
    
    if (!admin) {
      console.log(`❌ Administrator with email ${email} not found!`);
      return;
    }

    console.log(`Found administrator: ${admin.firstName} ${admin.lastName} (${admin.adminId})`);
    console.log('Resetting password...');

    // Update the password
    const { salt, hash } = encryptionUtil.hashPassword(newPassword);
    
    await Administrator.updateOne(
      { _id: admin._id },
      {
        $set: {
          passwordSalt: salt,
          passwordHash: hash,
          requirePasswordChange: false,
          loginAttempts: 0,
          updatedAt: new Date()
        },
        $unset: {
          lockUntil: 1,
          passwordResetToken: 1,
          passwordResetExpires: 1
        }
      }
    );

    console.log('\n✅ Password reset successfully!');
    console.log('=================================');
    console.log(`Admin ID: ${admin.adminId}`);
    console.log(`Email: ${admin.email}`);
    console.log(`New Password: ${newPassword}`);
    console.log('=================================');
    console.log('\n⚠️  IMPORTANT: Please change this password after first login!');
    console.log('\nLogin URL: https://portal.atxwashdryfold.com/embed-app-v2.html?route=/administrator-login');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

// Show usage if help is requested
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node reset-admin-password-quick.js [email] [password]');
  console.log('  email    - Administrator email (default: admin@wavemaxlaundry.com)');
  console.log('  password - New password (default: Admin@2025!)');
  console.log('\nExample:');
  console.log('  node reset-admin-password-quick.js admin@wavemaxlaundry.com MyNewPassword123!');
  process.exit(0);
}

main();