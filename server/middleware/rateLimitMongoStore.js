/**
 * Shim over @crhs/web-core's Mongo-backed rate-limit store (Plan 3 task 25).
 * The implementation, the bucket-name registry, the opt-in TTL index and the
 * sweep/reset primitives all live in the library now; this file exists so the
 * app's historical require path keeps working.
 */

module.exports = require('@crhs/web-core').rateLimitMongoStore;
