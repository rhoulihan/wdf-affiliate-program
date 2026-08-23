// Basic test setup
const mongoose = require('mongoose');
require('dotenv').config();

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.SESSION_SECRET = 'test-session-secret';

// Lock the test timezone to America/Chicago so immediate-pickup and other
// CDT-sensitive integration tests produce deterministic `.getHours()` /
// `.getDate()` values regardless of where the test host lives.
// Affects new `Date` parsing and toLocaleString resolution.
process.env.TZ = 'America/Chicago';

// Configure to use console transport for tests to avoid sending real emails
// but still test the email service functionality
process.env.EMAIL_PROVIDER = 'console';
process.env.EMAIL_FROM = 'test@wavemax.promo';
process.env.BASE_URL = 'https://wavemax.promo';

// Get MongoDB URI and append test database name
const baseUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wavemax_affiliate';
const testUri = baseUri.includes('?')
  ? baseUri.replace(/\/[^/\?]+\?/, '/laundromat_test?')
  : baseUri.replace(/\/[^/]+$/, '/laundromat_test');

// Global connection promise to prevent multiple connections
let connectionPromise = null;
let memoryServer = null;

async function connectWithFallback() {
  try {
    return await mongoose.connect(testUri, {
      serverSelectionTimeoutMS: 3000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 3000,
      maxPoolSize: 10,
      minPoolSize: 5
    });
  } catch (realMongoErr) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    const memoryUri = memoryServer.getUri('laundromat_test');
    console.log('Real Mongo unreachable, using mongodb-memory-server fallback');
    return mongoose.connect(memoryUri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000
    });
  }
}

// Set up MongoDB connection before tests
beforeAll(async () => {
  try {
    // Only connect if not already connected or connecting
    if (mongoose.connection.readyState === 0) {
      if (!connectionPromise) {
        connectionPromise = connectWithFallback();
      }
      await connectionPromise;
      console.log('Connected to test database:', testUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
    } else if (mongoose.connection.readyState === 2) {
      // Connecting - wait for it
      await new Promise((resolve) => {
        mongoose.connection.once('connected', resolve);
      });
    }
  } catch (error) {
    console.error('Failed to connect to test database:', error);
    throw error;
  }
});

// Clean up after tests
afterAll(async () => {
  try {
    // Only clean collections if connection is still active
    if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
      const collections = mongoose.connection.collections;
      for (const key in collections) {
        try {
          await collections[key].deleteMany({});
        } catch (error) {
          // Ignore errors if collection doesn't exist or connection is closing
          if (!error.message.includes('Client must be connected')) {
            console.error(`Error cleaning collection ${key}:`, error.message);
          }
        }
      }
    }
    
    // Only disconnect if still connected
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    if (memoryServer) {
      await memoryServer.stop();
      memoryServer = null;
    }
  } catch (error) {
    // Ignore connection errors during teardown
    if (!error.message.includes('Client must be connected')) {
      console.error('Error during test teardown:', error);
    }
  }
});

// Reset database between tests
afterEach(async () => {
  try {
    // Only clean if connection is active
    if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
      const collections = mongoose.connection.collections;
      for (const key in collections) {
        try {
          await collections[key].deleteMany({});
        } catch (error) {
          // Ignore errors if collection doesn't exist or connection is closing
          if (!error.message.includes('Client must be connected') &&
              !error.message.includes('ns not found')) {
            console.error(`Error cleaning collection ${key} in afterEach:`, error.message);
          }
        }
      }

      // Also clear any indexes that might have been created
      for (const key in collections) {
        try {
          await collections[key].dropIndexes();
        } catch (error) {
          // Ignore errors from dropping indexes on _id field or connection issues
        }
      }
    }
  } catch (error) {
    // Ignore connection errors during cleanup
    if (!error.message.includes('Client must be connected')) {
      console.error('Error in afterEach cleanup:', error);
    }
  }
});

// Seed SystemConfig defaults before each test — controllers/services rely on them,
// and the afterEach above wipes every collection.
//
// We swallow errors because some unit-test suites mock `mongoose` at the module
// level, which makes requiring SystemConfig (it reads mongoose.Schema.Types.Mixed
// at load time) throw. Those tests don't need a seeded SystemConfig; the ones
// that do have a real mongoose and succeed here.
beforeEach(async () => {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return;
  try {
    const SystemConfig = require('../server/models/SystemConfig');
    await SystemConfig.initializeDefaults();
  } catch (err) {
    // Intentionally ignored — see comment above.
  }
  try {
    const AddOn = require('../server/models/AddOn');
    await AddOn.initializeDefaults();
  } catch (err) {
    // Intentionally ignored — same module-mock caveat as SystemConfig above.
  }
});