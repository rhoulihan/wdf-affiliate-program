// End-to-end guard for the B4c rewire: server.js:668 mounts
// csrfTokenEndpoint from server/config/csrf-config, which is now built by
// wc.csrf.createCsrf({ tables }). If the factory ever stops returning a
// callable, server.js throws at boot — this test fails first.
const request = require('supertest');

describe('GET /api/csrf-token', () => {
  let app;

  beforeAll(() => {
    app = require('../../server');
  });

  it('issues a token to an agent with a session', async () => {
    const agent = request.agent(app);
    const res = await agent.get('/api/csrf-token');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.csrfToken).toBe('string');
    expect(res.body.csrfToken.length).toBeGreaterThan(0);
  });

  it('sets the double-submit cookie alongside the header token', async () => {
    const agent = request.agent(app);
    const res = await agent.get('/api/csrf-token');
    const cookies = res.headers['set-cookie'] || [];
    expect(cookies.join(';')).toMatch(/x-csrf/);
  });
});
