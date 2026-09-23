#!/usr/bin/env node

// Clean Database Install Script
// This script drops the existing database and recreates it from scratch
// WARNING: This will delete all data!

require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');
const { execSync } = require('child_process');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('\n⚠️  WARNING: This will DELETE ALL DATA in the database! ⚠️\n');

  const confirm = await question('Are you sure you want to continue? Type "yes" to confirm: ');

  if (confirm.toLowerCase() !== 'yes') {
    console.log('Operation cancelled.');
    process.exit(0);
  }

  try {
    console.log('\nConnecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // Drop the database
    console.log('\nDropping existing database...');
    await mongoose.connection.db.dropDatabase();
    console.log('✓ Database dropped successfully');

    // Close connection
    await mongoose.connection.close();
    console.log('✓ Disconnected from MongoDB');

    // Run the init-mongo.js script
    console.log('\nRunning database initialization script...');
    const mongoUri = process.env.MONGODB_URI;
    const initScript = path.join(__dirname, 'init-mongo.js');

    // Extract connection details from URI
    const uriMatch = mongoUri.match(/mongodb(?:\+srv)?:\/\/([^\/]+)\/([^?]+)/);
    if (!uriMatch) {
      throw new Error('Invalid MongoDB URI format');
    }

    const [, connectionString, dbName] = uriMatch;

    // Run mongosh with the init script
    try {
      execSync(`mongosh "${mongoUri}" < "${initScript}"`, {
        stdio: 'inherit'
      });
      console.log('✓ Database initialization completed');
    } catch (error) {
      console.log('\nNote: If mongosh is not installed, the database structure will be created when the server starts.');
      console.log('The init-mongo.js script can be run manually if needed.');
    }

    console.log('\n✅ Clean database installation completed!');
    console.log('\nNext steps:');
    console.log('1. Start the server: pm2 start wavemax');
    console.log('2. The default administrator account will be created automatically');
    console.log(`3. Default admin email: ${process.env.DEFAULT_ADMIN_EMAIL || 'admin@crhsent.com'}`);
    console.log('4. Default password: WaveMAX!2024 (must be changed on first login)');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();