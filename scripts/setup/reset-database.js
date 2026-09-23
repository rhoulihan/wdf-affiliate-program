#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');

// MongoDB connection options
const mongoOptions = {
  tls: true,
  tlsAllowInvalidCertificates: process.env.NODE_ENV !== 'production'
};

async function resetDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, mongoOptions);
    console.log('Connected to MongoDB');

    // Get all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`Found ${collections.length} collections`);

    // Delete all documents from each collection
    for (const collection of collections) {
      const collectionName = collection.name;
      try {
        const result = await mongoose.connection.db.collection(collectionName).deleteMany({});
        console.log(`Cleaned ${collectionName}: deleted ${result.deletedCount} documents`);
      } catch (error) {
        console.error(`Error cleaning ${collectionName}:`, error.message);
      }
    }

    console.log('\nAll collections cleaned successfully');
    console.log('\nDatabase reset complete!');
    console.log('\nTo initialize default data:');
    console.log('1. Start the server: pm2 start wavemax');
    console.log('2. Default accounts will be created automatically');
    console.log('3. Default admin: admin@crhsent.com / WaveMAX!2024');
    console.log('4. Default operator: operator1 / Operator!2024');

    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the reset
resetDatabase();