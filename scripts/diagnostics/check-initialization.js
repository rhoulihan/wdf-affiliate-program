#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');

// MongoDB connection options
const mongoOptions = {
  tls: true,
  tlsAllowInvalidCertificates: process.env.NODE_ENV !== 'production'
};

async function checkInitialization() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, mongoOptions);
    console.log('Connected to MongoDB\n');

    // Check System Configuration
    const SystemConfig = require('../../server/models/SystemConfig');
    const configCount = await SystemConfig.countDocuments();
    const configs = await SystemConfig.find({}).select('key value');
    console.log(`SystemConfig entries: ${configCount}`);
    if (configs.length > 0) {
      console.log('Sample configs:');
      configs.slice(0, 5).forEach(config => {
        console.log(`  - ${config.key}: ${config.value}`);
      });
    }
    console.log('');

    // Check Administrators
    const Administrator = require('../../server/models/Administrator');
    const adminCount = await Administrator.countDocuments();
    const admins = await Administrator.find({}).select('email firstName lastName isActive');
    console.log(`Administrator accounts: ${adminCount}`);
    if (admins.length > 0) {
      admins.forEach(admin => {
        console.log(`  - ${admin.email} (${admin.firstName} ${admin.lastName}) - Active: ${admin.isActive}`);
      });
    }
    console.log('');

    // Check Operators
    const Operator = require('../../server/models/Operator');
    const operatorCount = await Operator.countDocuments();
    const operators = await Operator.find({}).select('username operatorId firstName lastName isActive');
    console.log(`Operator accounts: ${operatorCount}`);
    if (operators.length > 0) {
      operators.forEach(op => {
        console.log(`  - ${op.username} (${op.operatorId}) - ${op.firstName} ${op.lastName} - Active: ${op.isActive}`);
      });
    }
    console.log('');

    // Summary
    console.log('=== Initialization Status ===');
    console.log(`SystemConfig initialized: ${configCount > 0 ? 'YES' : 'NO'}`);
    console.log(`Default Administrator created: ${adminCount > 0 ? 'YES' : 'NO'}`);
    console.log(`Default Operator created: ${operatorCount > 0 ? 'YES' : 'NO'}`);

    if (adminCount > 0) {
      console.log('\nDefault admin login:');
      console.log(`  Email: ${admins[0].email}`);
      console.log('  Password: (the DEFAULT_ADMIN_PASSWORD supplied at setup)');
    }

    if (operatorCount > 0) {
      console.log('\nDefault operator login:');
      console.log(`  Username: ${operators[0].username}`);
      console.log('  Password: (the DEFAULT_OPERATOR_PASSWORD supplied at setup)');
    }

    await mongoose.connection.close();
    console.log('\nDatabase connection closed');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run the check
checkInitialization();