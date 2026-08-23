// MongoDB initialization script for Docker
// This runs when MongoDB container starts for the first time

// Switch to the app database
db = db.getSiblingDB('wavemax');

// Create indexes for better performance
db.administrators.createIndex({ email: 1 }, { unique: true });
db.administrators.createIndex({ adminId: 1 }, { unique: true });

db.operators.createIndex({ email: 1 }, { unique: true });
db.operators.createIndex({ username: 1 }, { unique: true });
db.operators.createIndex({ operatorId: 1 }, { unique: true });

db.affiliates.createIndex({ email: 1 }, { unique: true });
db.affiliates.createIndex({ affiliateId: 1 }, { unique: true });

db.customers.createIndex({ email: 1 }, { unique: true });
db.customers.createIndex({ customerId: 1 }, { unique: true });
db.customers.createIndex({ affiliateId: 1 });

db.orders.createIndex({ orderId: 1 }, { unique: true });
db.orders.createIndex({ customerId: 1 });
db.orders.createIndex({ affiliateId: 1 });
db.orders.createIndex({ status: 1 });
db.orders.createIndex({ createdAt: -1 });

// Add compound indexes for common queries
db.orders.createIndex({ affiliateId: 1, status: 1 });
db.orders.createIndex({ customerId: 1, status: 1 });
db.orders.createIndex({ status: 1, scheduledPickup: 1 });

// Log initialization
print('MongoDB indexes created successfully');
print('Database ready for Laundromat Affiliate Program');
print('');
print('Run "node scripts/setup-database.js" after containers start to initialize default data');