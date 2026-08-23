// In-house MongoDB-backed store for express-rate-limit. Closes H-6 from
// docs/security/prod-lockdown-2026-05-20.md — the per-worker in-memory
// fallback was multiplying configured limits by the cluster size.

const mongoose = require('mongoose');

describe('rateLimitMongoStore', () => {
  let store;
  let MongoStore;

  beforeAll(async () => {
    // Ensure we have a connection — tests/setup.js handles this normally.
    if (mongoose.connection.readyState === 0) {
      // Best-effort fallback for unit-test isolation; if memory-server is
      // already wired by setup.js this is a no-op.
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mem = await MongoMemoryServer.create();
      await mongoose.connect(mem.getUri('laundromat_test'));
    }
    MongoStore = require('../../server/middleware/rateLimitMongoStore');
  });

  beforeEach(async () => {
    store = new MongoStore({ windowMs: 60 * 1000, name: 'unit-test' });
    await store.init({ windowMs: 60 * 1000 });
    // Clean any test state
    const coll = mongoose.connection.collection('ratelimit_unit-test');
    await coll.deleteMany({});
  });

  it('increment returns totalHits=1 on first hit', async () => {
    const { totalHits, resetTime } = await store.increment('user-A');
    expect(totalHits).toBe(1);
    expect(resetTime).toBeInstanceOf(Date);
    expect(resetTime.getTime()).toBeGreaterThan(Date.now());
  });

  it('increment accumulates across calls for the same key', async () => {
    await store.increment('user-B');
    await store.increment('user-B');
    const { totalHits } = await store.increment('user-B');
    expect(totalHits).toBe(3);
  });

  it('different keys are independent', async () => {
    await store.increment('alpha');
    await store.increment('alpha');
    const { totalHits: alphaHits } = await store.increment('alpha');
    const { totalHits: betaHits } = await store.increment('beta');
    expect(alphaHits).toBe(3);
    expect(betaHits).toBe(1);
  });

  it('decrement reduces the count (but never below 0)', async () => {
    await store.increment('user-C');
    await store.increment('user-C');
    await store.decrement('user-C');
    const { totalHits } = await store.increment('user-C');
    // After 2 inc, 1 dec, 1 more inc → 2
    expect(totalHits).toBe(2);
  });

  it('resetKey clears state for a single key', async () => {
    await store.increment('user-D');
    await store.increment('user-D');
    await store.resetKey('user-D');
    const { totalHits } = await store.increment('user-D');
    expect(totalHits).toBe(1);
  });

  it('RESETS the window when the prior counter has expired (Oracle ADB TTL is inert, doc lingers)', async () => {
    await store.increment('user-E');
    await store.increment('user-E');
    expect((await store.increment('user-E')).totalHits).toBe(3);
    // Force the doc to look expired while STILL present — the exact ADB case
    // where the TTL sweep never purges it.
    const coll = mongoose.connection.collection('ratelimit_unit-test');
    await coll.updateOne({ _id: 'user-E' }, { $set: { _expiresAt: new Date(Date.now() - 1000) } });
    // The next hit must START A NEW WINDOW at 1, not climb to 4 (the old bug).
    const after = await store.increment('user-E');
    expect(after.totalHits).toBe(1);
    expect(after.resetTime.getTime()).toBeGreaterThan(Date.now());
  });

  it('different store names (windowMs buckets) do not collide', async () => {
    const otherStore = new MongoStore({ windowMs: 60 * 1000, name: 'unit-test-other' });
    await otherStore.init({ windowMs: 60 * 1000 });
    await store.increment('shared-key');
    await store.increment('shared-key');
    const { totalHits: thisCount } = await store.increment('shared-key');
    const { totalHits: otherCount } = await otherStore.increment('shared-key');
    expect(thisCount).toBe(3);
    expect(otherCount).toBe(1);
  });
});
