const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const Administrator = require('../../server/models/Administrator');
const { createTestToken } = require('../helpers/authHelper');
const { getCsrfToken } = require('../helpers/csrfHelper');

// Plan 3 task 25: the reset endpoint used to delete from a collection nobody
// writes, so these tests passed against a total no-op — /Reset \d+ rate limit
// records/ matches "Reset 0". The assertions below cannot match a no-op, which
// means the tests have to seed a REAL bucket for the endpoint to clear.
const NONZERO = /^Reset [1-9][0-9]* rate limit entries$/;
const FUTURE = () => new Date(Date.now() + 15 * 60 * 1000);

beforeEach(async () => {
    await Administrator.deleteMany({});
});

describe('POST /api/v1/administrators/reset-rate-limits', () => {
    let adminToken;
    let agent;
    let csrfToken;

    beforeEach(async () => {
        // Create admin with all permissions
        const admin = await Administrator.create({
            administratorId: 'ADM-123',
            firstName: 'Test',
            lastName: 'Admin',
            email: 'admin@test.com',
            username: 'testadmin',
            passwordSalt: 'salt',
            passwordHash: 'hash',
            role: 'super_admin',
            permissions: ['all']
        });

        adminToken = createTestToken(admin._id, 'administrator', admin.administratorId);
        agent = request.agent(app);
        csrfToken = await getCsrfToken(app, agent);

        await mongoose.connection.collection('ratelimit_auth').deleteMany({});
        await mongoose.connection.collection('ratelimit_auth').insertMany([
            { _id: '192.168.1.1', hits: 7, _expiresAt: FUTURE() },
            { _id: '198.51.100.4', hits: 2, _expiresAt: FUTURE() }
        ]);
    });

    it('should reset rate limits successfully when type is provided', async () => {
        const response = await agent
            .post('/api/v1/administrators/reset-rate-limits')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-csrf-token', csrfToken)
            .send({ type: 'auth' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toMatch(NONZERO);
        expect(response.body).toHaveProperty('deletedCount');
    });

    it('should reset rate limits successfully when IP is provided', async () => {
        const response = await agent
            .post('/api/v1/administrators/reset-rate-limits')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-csrf-token', csrfToken)
            .send({ ip: '192.168.1.1' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toMatch(NONZERO);
    });

    it('should reset all rate limits when no filter is provided', async () => {
        const response = await agent
            .post('/api/v1/administrators/reset-rate-limits')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-csrf-token', csrfToken)
            .send({});

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });

    it('should return 403 if user does not have required permission', async () => {
        // Create admin without all permissions
        const limitedAdmin = await Administrator.create({
            administratorId: 'ADM-456',
            firstName: 'Limited',
            lastName: 'Admin',
            email: 'limited@test.com',
            username: 'limitedadmin',
            passwordSalt: 'salt',
            passwordHash: 'hash',
            role: 'admin',
            permissions: ['view_analytics']
        });

        const limitedToken = createTestToken(limitedAdmin._id, 'administrator', limitedAdmin.administratorId);

        const response = await agent
            .post('/api/v1/administrators/reset-rate-limits')
            .set('Authorization', `Bearer ${limitedToken}`)
            .set('x-csrf-token', csrfToken)
            .send({ type: 'auth' });

        expect(response.status).toBe(403);
    });

    it('should return 401 if no token is provided', async () => {
        const response = await agent
            .post('/api/v1/administrators/reset-rate-limits')
            .set('x-csrf-token', csrfToken)
            .send({ type: 'auth' });

        expect(response.status).toBe(401);
    });
});
