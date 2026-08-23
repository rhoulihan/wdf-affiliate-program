#!/usr/bin/env node

require('dotenv').config();
const mongoose = require('mongoose');
const Administrator = require('../../server/models/Administrator');
const Operator = require('../../server/models/Operator');
const encryptionUtil = require('../../server/utils/encryption');

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Delete existing administrator
    console.log('Deleting existing administrator...');
    const deletedAdmin = await Administrator.findOneAndDelete({ email: 'rickh@wavemaxlaundry.com' });
    if (deletedAdmin) {
      console.log(`✓ Deleted administrator: ${deletedAdmin.email}`);
    }

    // Create new administrator with updated email
    console.log('\nCreating new administrator...');
    
    const { salt, hash } = encryptionUtil.hashPassword('WaveMAX!2024');
    
    const newAdmin = new Administrator({
      firstName: 'System',
      lastName: 'Administrator',
      email: 'admin@crhsent.com',
      passwordSalt: salt,
      passwordHash: hash,
      permissions: ['all'],
      requirePasswordChange: true,
      isActive: true
    });

    await newAdmin.save();

    // Update operator's createdBy reference
    console.log('\nUpdating operator reference...');
    await Operator.updateMany({}, { createdBy: newAdmin._id });

    console.log('\n✅ Administrator updated successfully!');
    console.log('=================================');
    console.log(`Admin ID: ${newAdmin.adminId}`);
    console.log(`Email: ${newAdmin.email}`);
    console.log(`Password: WaveMAX!2024`);
    console.log('=================================');
    console.log('\n⚠️  Password must be changed on first login!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

main();