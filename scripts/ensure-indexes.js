// Ensure redesign (PR 6–9) indexes exist in production.
//
//   node scripts/ensure-indexes.js        (or: npm run ensure-indexes)
//
// Production runs with mongoose autoIndex: false (server.js — Oracle ADB),
// so nothing provisions new schema indexes automatically. This script calls
// Model.createIndexes() (never drops anything — deliberately NOT syncIndexes)
// for every model carrying redesign indexes:
//   - Bag            (tokenHash unique, bagId unique, affiliate/customer/status)
//   - Order          (orderId unique, plain bagId/bagToken lookup indexes)
//   - Operator       (scanCodeHmac unique sparse)
//   - AffiliateInvite (inviteId unique, tokenHash/email/status/expiresAt)
//   - Customer       (customerId unique, email unique SPARSE — email is optional)
//   - AddOn          (addOnId unique, key unique — order add-on catalog)
//
// Note: "at most one open order per bag" is enforced at the application layer
// (orderTransitionService read-guard), not by a partial unique index — the
// Oracle ADB Mongo API does not support partialFilterExpression, and the volume
// does not warrant a DB-level concurrency backstop.
//
// Exits 0 on success, 1 on connection/creation failure.
// (console.* is the established convention in scripts/ — see scripts/admin/.)

require('dotenv').config();
const mongoose = require('mongoose');

const Bag = require('../server/modules/bags/Bag');
const Order = require('../server/models/Order');
const Operator = require('../server/models/Operator');
const AffiliateInvite = require('../server/modules/onboarding/AffiliateInvite');
const Customer = require('../server/models/Customer');
const AddOn = require('../server/models/AddOn');

const MODELS = [Bag, Order, Operator, AffiliateInvite, Customer, AddOn];

(async () => {
  let failed = false;
  try {
    const tls = process.env.MONGODB_TLS === 'false'
      ? {}
      : { tls: true, tlsAllowInvalidCertificates: process.env.NODE_ENV !== 'production' };
    await mongoose.connect(process.env.MONGODB_URI, { ...tls, autoIndex: false });
    console.log('connected to', mongoose.connection.name);

    for (const model of MODELS) {
      const label = `${model.modelName} (${model.collection.collectionName})`;
      try {
        await model.createIndexes();
        console.log('createIndexes ok:', label);
      } catch (e) {
        failed = true;
        console.error('createIndexes FAILED:', label, '-', e.message.split('\n')[0]);
      }
      try {
        const indexes = await model.collection.indexes();
        console.log(`indexes on ${label}:`);
        for (const idx of indexes) {
          const flags = [
            idx.unique ? 'unique' : null,
            idx.sparse ? 'sparse' : null,
            idx.partialFilterExpression ? `partial=${JSON.stringify(idx.partialFilterExpression)}` : null,
            idx.expireAfterSeconds !== undefined ? `ttl=${idx.expireAfterSeconds}s` : null
          ].filter(Boolean).join(' ');
          console.log(`  - ${idx.name} ${JSON.stringify(idx.key)} ${flags}`);
        }
      } catch (e) {
        failed = true;
        console.error('listing indexes FAILED:', label, '-', e.message.split('\n')[0]);
      }
    }
  } catch (e) {
    failed = true;
    console.error('FATAL:', e.message);
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
  process.exit(failed ? 1 : 0);
})();
