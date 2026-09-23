// Plan 3 task 25 (todo §D-2, spec §7.6.3). The admin reset targeted a collection
// named `rate_limits` that the store never writes; the store writes
// `ratelimit_<name>` keyed on `_id` (rateLimitMongoStore.js:36,85). The old
// assertion /Reset \d+ .../ matched "Reset 0", so the suite was green over a
// total no-op. Every assertion below fails on a no-op.
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const Administrator = require('../../server/models/Administrator');
const { createTestToken } = require('../helpers/authHelper');
const { getCsrfToken } = require('../helpers/csrfHelper');

const FUTURE = () => new Date(Date.now() + 15 * 60 * 1000);
const NONZERO = /^Reset [1-9][0-9]* rate limit entries$/;

describe('POST /api/v1/administrators/reset-rate-limits clears real buckets', () => {
  let adminToken; let agent; let csrfToken;

  beforeEach(async () => {
    await Administrator.deleteMany({});
    const admin = await Administrator.create({
      administratorId: 'ADM-RL1', firstName: 'Test', lastName: 'Admin',
      email: 'rl-admin@test.com', username: 'rladmin', passwordSalt: 'salt',
      passwordHash: 'hash', role: 'super_admin', permissions: ['all']
    });
    adminToken = createTestToken(admin._id, 'administrator');
    agent = request.agent(app);
    csrfToken = await getCsrfToken(app, agent);
    for (const c of ['ratelimit_auth', 'ratelimit_register']) {
      await mongoose.connection.collection(c).deleteMany({});
    }
    await mongoose.connection.collection('ratelimit_auth')
      .insertOne({ _id: '203.0.113.7', hits: 9, _expiresAt: FUTURE() });
    await mongoose.connection.collection('ratelimit_register')
      .insertOne({ _id: '203.0.113.7', hits: 4, _expiresAt: FUTURE() });
  });

  const post = (body) => agent.post('/api/v1/administrators/reset-rate-limits')
    .set('Authorization', `Bearer ${adminToken}`).set('x-csrf-token', csrfToken).send(body);

  it('deletes a seeded bucket across every limiter and says a NON-ZERO number', async () => {
    const res = await post({ ip: '203.0.113.7' });
    expect(res.status).toBe(200);
    expect(res.body.deletedCount).toBeGreaterThan(0);          // fails on the no-op
    expect(res.body.message).toMatch(NONZERO);                 // cannot match "Reset 0"
    expect(await mongoose.connection.collection('ratelimit_auth')
      .countDocuments({ _id: '203.0.113.7' })).toBe(0);        // state, not just the message
    expect(await mongoose.connection.collection('ratelimit_register')
      .countDocuments({ _id: '203.0.113.7' })).toBe(0);
  });

  it('a type filter clears that limiter and leaves the others alone', async () => {
    const res = await post({ type: 'auth' });
    expect(res.status).toBe(200);
    expect(res.body.deletedCount).toBe(1);
    expect(await mongoose.connection.collection('ratelimit_auth').countDocuments({})).toBe(0);
    expect(await mongoose.connection.collection('ratelimit_register').countDocuments({})).toBe(1);
  });

  it('never creates a collection named rate_limits', async () => {
    await post({});
    const names = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
    expect(names).not.toContain('rate_limits');
  });

  it('an unknown limiter name is a 400, not a silent success', async () => {
    const res = await post({ type: 'no-such-limiter' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('a regex-metacharacter IP is escaped, not interpreted', async () => {
    await mongoose.connection.collection('ratelimit_auth')
      .insertOne({ _id: '203a0b113c7', hits: 3, _expiresAt: FUTURE() });
    const res = await post({ ip: '203.0.113.7' });
    expect(res.status).toBe(200);
    expect(await mongoose.connection.collection('ratelimit_auth')
      .countDocuments({ _id: '203a0b113c7' })).toBe(1);
  });

  it('reports which collections it touched', async () => {
    const res = await post({ ip: '203.0.113.7' });
    expect(Array.isArray(res.body.collections)).toBe(true);
    expect(res.body.collections.map((c) => c.collection)).toContain('ratelimit_auth');
  });

  it('no test in this repo asserts the no-op message any more', () => {
    const { execSync } = require('child_process');
    // Assembled at runtime so this guard does not match its own source.
    const needle = ['rate', 'limit', 'records'].join(' ');
    const hits = execSync(`grep -rl '${needle}' tests/ || true`,
      { cwd: require('path').join(__dirname, '..', '..') }).toString().trim();
    expect(hits).toBe('');
  });
});
