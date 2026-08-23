#!/usr/bin/env node

// Reset Administrator Password Script
// This script allows you to reset the password for an existing administrator

require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');
const Administrator = require('../../server/models/Administrator');
const encryptionUtil = require('../../server/utils/encryption');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

function questionHidden(query) {
  return new Promise(resolve => {
    process.stdout.write(query);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    let password = '';
    process.stdin.on('data', function(char) {
      char = char + '';

      switch(char) {
      case '\n':
      case '\r':
      case '\u0004':
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write('\n');
        resolve(password);
        break;
      case '\u0003':
        process.exit();
        break;
      case '\u007f':
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
        break;
      default:
        password += char;
        process.stdout.write('*');
        break;
      }
    });
  });
}

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // List all administrators
    const admins = await Administrator.find({}, 'adminId email firstName lastName isActive');
    
    if (admins.length === 0) {
      console.log('No administrators found in the database.');
      return;
    }

    console.log('Existing administrators:');
    admins.forEach((admin, index) => {
      console.log(`${index + 1}. ${admin.adminId}: ${admin.firstName} ${admin.lastName} (${admin.email}) - ${admin.isActive ? 'Active' : 'Inactive'}`);
    });

    const selection = await question('\nSelect administrator by number (or enter email address): ');
    
    let selectedAdmin;
    if (/^\d+$/.test(selection)) {
      const index = parseInt(selection) - 1;
      if (index >= 0 && index < admins.length) {
        selectedAdmin = admins[index];
      }
    } else {
      selectedAdmin = admins.find(admin => admin.email === selection.toLowerCase());
    }

    if (!selectedAdmin) {
      console.log('Invalid selection or email not found.');
      return;
    }

    console.log(`\nResetting password for: ${selectedAdmin.firstName} ${selectedAdmin.lastName} (${selectedAdmin.email})`);
    
    const newPassword = await questionHidden('Enter new password: ');
    const confirmPassword = await questionHidden('Confirm new password: ');

    if (newPassword !== confirmPassword) {
      console.log('\n❌ Passwords do not match!');
      return;
    }

    if (newPassword.length < 8) {
      console.log('\n❌ Password must be at least 8 characters long!');
      return;
    }

    // Update the password
    const { salt, hash } = encryptionUtil.hashPassword(newPassword);
    
    await Administrator.updateOne(
      { _id: selectedAdmin._id },
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
    console.log(`Administrator ${selectedAdmin.email} can now login with the new password.`);
    console.log('\nLogin URL: https://portal.atxwashdryfold.com/embed-app-v2.html?route=/administrator-login');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    rl.close();
    await mongoose.connection.close();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

main();