// Plan 3 task 25 (PR B7). This suite used to mock `mongoose.connection.db` and
// assert `collection('rate_limits')` — it pinned the DEFECT in place, including
// an explicit "should report zero deletions correctly" expecting
// "Reset 0 rate limit entries". It now tests the real seam: the controller is a
// thin adapter over systemHealthService.resetRateLimits, and the collection
// fan-out is the service's business (tests/integration/resetRateLimits.test.js
// proves that half against a real database).

jest.mock('../../server/services/systemHealthService');

const systemHealthService = require('../../server/services/systemHealthService');
const { resetRateLimits } = require('../../server/controllers/administratorController');
const logger = require('../../server/utils/logger');

describe('administratorController.resetRateLimits', () => {
  let req, res, loggerSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    loggerSpy = jest.spyOn(logger, 'error').mockImplementation();
    req = { body: {}, user: { id: 'admin123', role: 'administrator' } };
    res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  });

  afterEach(() => loggerSpy.mockRestore());

  it('is wired to a route — it is not a dead export', () => {
    // The inline handler in administratorRoutes.js:197-237 shadowed this method
    // and was the copy carrying the bug. Deleting it without wiring the route
    // would 404 the endpoint, so assert the wiring, not just the function.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', '..',
      'server/routes/administratorRoutes.js'), 'utf8');
    expect(src).toMatch(/router\.post\('\/reset-rate-limits'[\s\S]*administratorController\.resetRateLimits/);
    expect(src).not.toMatch(/rate_limits/);
  });

  it('passes the request filters and the acting user to the service', async () => {
    req.body = { type: 'auth', ip: '203.0.113.7' };
    systemHealthService.resetRateLimits.mockResolvedValue({
      deletedCount: 3, collections: [{ collection: 'ratelimit_auth', deletedCount: 3 }]
    });

    await resetRateLimits(req, res);

    expect(systemHealthService.resetRateLimits).toHaveBeenCalledWith({
      type: 'auth', ip: '203.0.113.7', user: req.user, req
    });
  });

  it('returns the per-bucket breakdown, not just a bare count', async () => {
    const collections = [
      { collection: 'ratelimit_auth', deletedCount: 2 },
      { collection: 'ratelimit_register', deletedCount: 1 }
    ];
    systemHealthService.resetRateLimits.mockResolvedValue({ deletedCount: 3, collections });

    await resetRateLimits(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Reset 3 rate limit entries',
      deletedCount: 3,
      collections
    });
  });

  it('a 400 from the service (unknown limiter) is returned as a 400, not a 500', async () => {
    const err = new Error('Unknown rate limiter: nope');
    err.isSystemHealthError = true;
    err.status = 400;
    systemHealthService.resetRateLimits.mockRejectedValue(err);

    await resetRateLimits(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false, message: 'Unknown rate limiter: nope'
    });
  });

  it('a missing database connection is a 500 with the service message', async () => {
    const err = new Error('Database connection not available');
    err.isSystemHealthError = true;
    err.status = 500;
    systemHealthService.resetRateLimits.mockRejectedValue(err);

    await resetRateLimits(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false, message: 'Database connection not available'
    });
  });

  it('an unexpected failure is logged and returned as a 500', async () => {
    systemHealthService.resetRateLimits.mockRejectedValue(new Error('boom'));

    await resetRateLimits(req, res);

    expect(loggerSpy).toHaveBeenCalledWith('Error resetting rate limits:', expect.any(Error));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false, message: 'Failed to reset rate limits', error: 'boom'
    });
  });
});
