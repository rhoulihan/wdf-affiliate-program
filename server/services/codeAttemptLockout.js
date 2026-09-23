// Per-bag/IP failed-code attempt lockout (spec §6.6/§9).
//
// Reuses the in-house Mongo-backed rate-limit store (the same infrastructure
// the express limiters use — server/middleware/rateLimitMongoStore.js) so the
// counter is shared across PM2 cluster workers and TTL-purged by Mongo.
// Unlike the express limiters this is NOT skipped in tests: lockout is a
// security behavior under test, and it counts FAILURES (a request limiter
// counts requests).
//
// Key shape: "<scope>:<sha256(bagToken)[0..16]>:<ipBucket>" — the raw token
// never touches the store. The IP portion is the real client IP behind
// Cloudflare (req.ip is the CF edge under trust proxy = 1, so keying on it
// would lock out every user behind one edge), collapsed to an IPv6 /64 via
// the canonical ipBucketKey so an attacker can't rotate within a /64 to defeat
// the failure lockout. Audit logging still records the full visitor IP.

const crypto = require('crypto');
const mongoose = require('mongoose');
const MongoRateLimitStore = require('../middleware/rateLimitMongoStore');
const { clientIp, ipBucketKey } = require('../utils/clientIp');

const WINDOW_MS = 15 * 60 * 1000;
const STORE_NAME = 'bag_codes';

let store = null;
function getStore() {
  if (!store) {
    store = new MongoRateLimitStore({ windowMs: WINDOW_MS, name: STORE_NAME });
    store.init({ windowMs: WINDOW_MS }).catch(() => { /* TTL index best-effort */ });
  }
  return store;
}

function attemptKey({ scope, bagToken, req }) {
  const tokenDigest = crypto.createHash('sha256')
    .update(String(bagToken || '')).digest('hex').slice(0, 16);
  return `${scope}:${tokenDigest}:${ipBucketKey(req) || 'no-ip'}`;
}

/** Record a failed attempt; returns the running failure count. */
async function registerFailure(key) {
  const { totalHits } = await getStore().increment(key);
  return totalHits;
}

/**
 * The store's own collection name — the single source of truth.
 *
 * Hand-building `'ratelimit_' + STORE_NAME` here was a second source that
 * ignored RATE_LIMIT_COLLECTION_PREFIX: the store's WRITES (increment /
 * resetKey, which go through the store object) would move to the prefixed
 * collection while isLockedOut kept READING the unprefixed one — a lockout
 * that silently stopped locking out. Plan 3 task 25.
 * @returns {string} e.g. 'ratelimit_bag_codes'
 */
function storeCollectionName() {
  return getStore().collectionName;
}

/** True when the key has >= maxAttempts unexpired failures. */
async function isLockedOut(key, maxAttempts) {
  const doc = await mongoose.connection
    .collection(storeCollectionName())
    .findOne({ _id: key });
  if (!doc) return false;
  if (doc._expiresAt && doc._expiresAt < new Date()) return false;
  return doc.hits >= maxAttempts;
}

/** Wipe the counter (on a successful code entry). */
async function clearFailures(key) {
  return getStore().resetKey(key);
}

module.exports = {
  attemptKey, clientIp, registerFailure, isLockedOut, clearFailures,
  storeCollectionName, WINDOW_MS
};
