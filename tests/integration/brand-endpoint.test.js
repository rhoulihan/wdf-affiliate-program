'use strict';
const request = require('supertest');
const app = require('../../server');

describe('GET /api/v1/brand', () => {
  test('returns displayName and shortName as public JSON', async () => {
    const res = await request(app).get('/api/v1/brand');
    expect(res.status).toBe(200);
    expect(typeof res.body.displayName).toBe('string');
    expect(typeof res.body.shortName).toBe('string');
    expect(res.body).not.toHaveProperty('legalName'); // endpoint exposes only display fields
  });
  test('is reachable under the legacy /api prefix too', async () => {
    const res = await request(app).get('/api/brand');
    expect(res.status).toBe(200);
  });
});
