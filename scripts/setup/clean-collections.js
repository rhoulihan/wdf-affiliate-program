#!/usr/bin/env node

// Clean Collections Script
// This script deletes all documents from all collections
// WARNING: This will delete all data!

require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('\n⚠️  WARNING: This will DELETE ALL DATA from all collections! ⚠️\n');

  const confirm = await question('Are you sure you want to continue? Type "yes" to confirm: ');

  if (confirm.toLowerCase() !== 'yes') {
    console.log('Operation cancelled.');
    process.exit(0);
  }

  try {
    console.log('\nConnecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // Get all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`\nFound ${collections.length} collections`);

    // Delete all documents from each collection
    for (const collection of collections) {
      const collectionName = collection.name;
      console.log(`\nCleaning collection: ${collectionName}`);

      try {
        const result = await mongoose.connection.db.collection(collectionName).deleteMany({});
        console.log(`  ✓ Deleted ${result.deletedCount} documents from ${collectionName}`);
      } catch (error) {
        console.log(`  ✗ Error cleaning ${collectionName}: ${error.message}`);
      }
    }

    console.log('\n✅ All collections cleaned!');
    console.log('\nNext steps:');
    console.log('1. Start the server: pm2 start wavemax');
    console.log('2. The default administrator account will be created automatically');
    console.log(`3. Default admin email: ${process.env.DEFAULT_ADMIN_EMAIL || 'admin@crhsent.com'}`);
    console.log('4. Default password: WaveMAX!2024 (must be changed on first login)');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    rl.close();
  }
}

main();