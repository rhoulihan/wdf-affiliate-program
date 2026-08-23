#!/usr/bin/env node

// Quick Operator Creation Script
// Creates a default operator account

require('dotenv').config();
const mongoose = require('mongoose');
const Operator = require('../../server/models/Operator');
const Administrator = require('../../server/models/Administrator');

// Configuration
const OPERATOR_USERNAME = 'operator1';
const OPERATOR_PASSWORD = 'Operator!2024';
const OPERATOR_EMAIL = 'operator@wavemaxlaundry.com';
const OPERATOR_ID = 'OP001';

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Check if operator already exists
    const existingOperator = await Operator.findOne({ username: OPERATOR_USERNAME });
    if (existingOperator) {
      console.log(`Operator with username ${OPERATOR_USERNAME} already exists!`);
      console.log(`Operator ID: ${existingOperator.operatorId}`);
      return;
    }

    // Get the admin for createdBy reference
    const admin = await Administrator.findOne();
    if (!admin) {
      console.error('❌ Error: No administrator account found!');
      console.error('Please create an administrator account first.');
      return;
    }

    // Create new operator
    console.log('Creating new operator...');
    
    const newOperator = new Operator({
      firstName: 'Default',
      lastName: 'Operator',
      email: OPERATOR_EMAIL,
      username: OPERATOR_USERNAME,
      password: OPERATOR_PASSWORD,
      operatorId: OPERATOR_ID,
      shiftStart: '00:00',
      shiftEnd: '23:59',
      isActive: true,
      totalOrdersProcessed: 0,
      averageProcessingTime: 0,
      qualityScore: 100,
      createdBy: admin._id
    });

    await newOperator.save();

    console.log('\n✅ Operator created successfully!');
    console.log('=================================');
    console.log(`Operator ID: ${newOperator.operatorId}`);
    console.log(`Username: ${newOperator.username}`);
    console.log(`Email: ${newOperator.email}`);
    console.log(`Password: ${OPERATOR_PASSWORD}`);
    console.log(`Shift: ${newOperator.shiftStart} - ${newOperator.shiftEnd}`);
    console.log('=================================');
    console.log('\nLogin URL: https://portal.atxwashdryfold.com/embed-app-v2.html?route=/operator-login');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 11000) {
      console.error('Operator with this username or email already exists!');
    }
  } finally {
    await mongoose.connection.close();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

main();