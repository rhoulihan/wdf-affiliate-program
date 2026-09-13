// Origin-level liveness for the Cloudflare LB monitor. The CF pool's origin is
// the BOX, and both apps run on every box, so /health/origin must return 200
// only when this app AND the content app on :3001 are both serving. Also pins
// that the route mints NO session — it sits before the session middleware, like
// /health (the 2026-05-25 ADB session-bloat incident class).
jest.mock('../../server/utils/emailService');

const request = require('supertest');
const app = require('../../server');

describe('GET /health/origin — box-level aggregate liveness', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('returns 200 UP when the content app answers 200', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    const res = await request(app).get('/health/origin');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.body.components).toEqual({ portal: 'UP', content: 'UP' });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/health',
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it('returns 503 DEGRADED when the content app returns non-2xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502 });
    const res = await request(app).get('/health/origin');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('DEGRADED');
    expect(res.body.components.content).toBe('DOWN(502)');
  });

  it('returns 503 DEGRADED when the content app is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    );
    const res = await request(app).get('/health/origin');
    expect(res.status).toBe(503);
    expect(res.body.components.content).toBe('DOWN(ECONNREFUSED)');
  });

  it('returns 503 DEGRADED when the content app times out', async () => {
    global.fetch = jest.fn().mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'AbortError' })
    );
    const res = await request(app).get('/health/origin');
    expect(res.status).toBe(503);
    expect(res.body.components.content).toBe('DOWN(timeout)');
  });

  it('mints NO session — no Set-Cookie (route sits before the session middleware)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    const res = await request(app).get('/health/origin');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('leaves the plain /health probe unchanged', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});
