#!/usr/bin/env node
/**
 * clear-customer-data.js — wipe all customer-facing operational data.
 *
 * Hard-deletes every document from:
 *   - bags       (server/modules/bags/Bag.js)   — durable QR records
 *   - orders     (server/models/Order.js)       — the scan-gate order machine
 *   - customers  (server/models/Customer.js)    — registered customers
 *
 * …and cleans the records that would otherwise dangle on the deleted ids:
 *   - transactions whose `orders[]` reference a (now-deleted) order
 *   - customer-scoped RefreshToken / TokenBlacklist entries
 *     (scoped by userType:'customer' — affiliate/operator/admin tokens are kept)
 *
 * It deliberately does NOT touch affiliates, operators, administrators,
 * affiliate invites, SystemConfig, access-gate, or rate-limit collections.
 *
 * SAFETY: dry-run by default. It prints what WOULD be deleted and exits without
 * changing anything. Pass --yes (or --confirm) to actually delete; in that mode
 * it shows the counts, gives a 5-second Ctrl-C abort window, deletes, then
 * re-counts to verify. There is intentionally NO production abort guard — this
 * is meant to be run against the production Oracle ADB *on the box* — so the
 * dry-run default + explicit flag + countdown are the guard.
 *
 * Usage (run from the repo, on the box that reaches the target DB):
 *   node scripts/admin/clear-customer-data.js            # dry-run (safe preview)
 *   node scripts/admin/clear-customer-data.js --yes      # actually delete
 *
 * npm:
 *   npm run clear:customer-data          # dry-run
 *   npm run clear:customer-data:confirm  # delete (--yes)
 */
'use strict';

const Order = require('../../server/models/Order');
const Customer = require('../../server/models/Customer');
const Bag = require('../../server/modules/bags/Bag');
const Transaction = require('../../server/models/Transaction');
const RefreshToken = require('../../server/models/RefreshToken');
const TokenBlacklist = require('../../server/models/TokenBlacklist');

// Order matters only for readability — the filters are independent. The
// transaction filter matches the transaction's own `orders[]` array (it is not
// affected by whether the referenced orders still exist), so deleting orders
// first or last is equivalent.
const TARGETS = [
  { key: 'orders', label: 'orders', model: Order, filter: {} },
  { key: 'customers', label: 'customers', model: Customer, filter: {} },
  { key: 'bags', label: 'bags', model: Bag, filter: {} },
  {
    key: 'transactions',
    label: 'transactions referencing a deleted order',
    model: Transaction,
    // any transaction that lists at least one order id — all orders are being
    // deleted, so every such entry is about to dangle. Order-less ledger rows
    // (orders: []) carry no order reference and are left untouched.
    filter: { 'orders.0': { $exists: true } }
  },
  {
    key: 'refreshTokens',
    label: 'customer refresh tokens (userType:\'customer\')',
    model: RefreshToken,
    filter: { userType: 'customer' }
  },
  {
    key: 'tokenBlacklist',
    label: 'customer token-blacklist entries (userType:\'customer\')',
    model: TokenBlacklist,
    filter: { userType: 'customer' }
  }
];

/**
 * Count (and, unless dryRun, delete) every target collection.
 * Pure data op against the already-connected default mongoose connection — no
 * connect/disconnect, no process.exit — so it is unit-testable.
 *
 * @param {Object}  [opts]
 * @param {boolean} [opts.dryRun=true]  count only; delete nothing
 * @param {Function}[opts.log]          optional line logger (message:string)
 * @returns {Promise<{dryRun:boolean, results:Object.<string,{matched:number,deleted:number}>}>}
 */
async function clearCustomerData({ dryRun = true, log = () => {} } = {}) {
  const results = {};
  for (const t of TARGETS) {
    const matched = await t.model.countDocuments(t.filter);
    let deleted = 0;
    if (!dryRun && matched > 0) {
      const res = await t.model.deleteMany(t.filter);
      deleted = res.deletedCount || 0;
    }
    results[t.key] = { matched, deleted };
    log(`${dryRun ? 'would delete' : 'deleted'} ${dryRun ? matched : deleted} ${t.label}`);
  }
  return { dryRun, results };
}

function total(results, field) {
  return Object.values(results).reduce((sum, r) => sum + r[field], 0);
}

/**
 * Decide run mode from CLI args. Pure + exported so the safety-critical default
 * (no flag => dry-run) is unit-testable without spawning a process. Matching is
 * case-sensitive on purpose: an unrecognized flag (e.g. '--YES') must NOT
 * trigger a delete — it falls through to the safe dry-run default.
 * @param {string[]} argv  argv after the node/script (process.argv.slice(2))
 * @returns {{dryRun:boolean, execute:boolean}}
 */
function decideMode(argv = []) {
  const execute = argv.includes('--yes') || argv.includes('--confirm');
  return { dryRun: !execute, execute };
}

async function main() {
  const path = require('path');
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
  const mongoose = require('mongoose');

  const { dryRun } = decideMode(process.argv.slice(2));

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('FATAL: MONGODB_URI is not set. Refusing to run.');
    process.exit(1);
  }

  // Oracle ADB Mongo API requires TLS; MONGODB_TLS=false disables it for a
  // local MongoDB. Mirror scripts/ensure-indexes.js exactly. autoIndex:false
  // so requiring the models never tries to build indexes here.
  const tls = process.env.MONGODB_TLS === 'false'
    ? {}
    : { tls: true, tlsAllowInvalidCertificates: process.env.NODE_ENV !== 'production' };

  await mongoose.connect(uri, { ...tls, autoIndex: false, serverSelectionTimeoutMS: 20000 });

  const dbName = mongoose.connection.name;
  const host = mongoose.connection.host || '(unknown host)';
  console.log(`\nConnected to DB "${dbName}" @ ${host}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no deletes) — pass --yes to actually delete' : 'EXECUTE (will permanently DELETE)'}\n`);

  try {
    // Always show the preview counts first.
    const preview = await clearCustomerData({ dryRun: true, log: (m) => console.log('  ' + m) });
    const matched = total(preview.results, 'matched');

    if (dryRun) {
      console.log(`\nDry-run complete. ${matched} document(s) would be deleted. Re-run with --yes to execute.`);
      return;
    }

    if (matched === 0) {
      console.log('\nNothing to delete. Exiting.');
      return;
    }

    console.log(`\n*** About to PERMANENTLY DELETE ${matched} document(s) from "${dbName}". ***`);
    console.log('Press Ctrl-C within 5 seconds to abort...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log('');
    const report = await clearCustomerData({ dryRun: false, log: (m) => console.log('  ' + m) });
    console.log(`\nDone. Deleted ${total(report.results, 'deleted')} document(s).`);

    // Post-verify nothing matching remains.
    const after = await clearCustomerData({ dryRun: true });
    const remaining = total(after.results, 'matched');
    console.log(`Post-verify: ${remaining} matching document(s) remain (expected 0).`);
    if (remaining !== 0) process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(process.exitCode || 0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { clearCustomerData, decideMode, TARGETS };
