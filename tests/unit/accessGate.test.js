// Unit tests for the site access-gate middleware.
// Gate scope: password-protects crhsent.com (and www.crhsent.com) ONLY. Every
// other Express-served host passes through untouched. Fully private — no
// search-crawler bypass. Unlock is the email magic-link flow on /__gate/*.
jest.mock('../../server/utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }));
jest.mock('../../server/models/AccessGate', () => ({ findOne: jest.fn(() => ({ lean: () => Promise.resolve(null) })) }));
jest.mock('../../server/models/AccessWhitelist', () => ({
  findOne: jest.fn(() => ({ lean: () => Promise.resolve(null) })),
  find: jest.fn(() => ({ lean: () => Promise.resolve([]) })),
  updateOne: jest.fn(() => Promise.resolve({})),
}));
jest.mock('../../server/models/AccessClick', () => ({ create: jest.fn(() => Promise.resolve({})) }));
jest.mock('../../server/models/AccessRequest', () => ({
  create: jest.fn(() => Promise.resolve({})),
  findOne: jest.fn(() => ({ lean: () => Promise.resolve(null) })),
  updateOne: jest.fn(() => Promise.resolve({})),
}));
jest.mock('../../server/services/email/transport', () => ({ sendEmail: jest.fn(() => Promise.resolve({ messageId: 'x' })) }));
jest.mock('../../server/models/SystemConfig', () => ({ getValue: jest.fn(() => Promise.resolve(false)) }));

const { hashPassword } = require('../../server/utils/encryption');
const AccessWhitelist = require('../../server/models/AccessWhitelist');
const AccessClick = require('../../server/models/AccessClick');
const AccessRequest = require('../../server/models/AccessRequest');
const { sendEmail } = require('../../server/services/email/transport');
const accessGate = require('../../server/middleware/accessGate');

const mkRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.type = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.redirect = jest.fn(() => res);
  res.locals = { cspNonce: 'test-nonce' };
  return res;
};
// Default request targets the gated host (crhsent.com) so the gating path is exercised.
const mkReq = (over = {}) => ({ method: 'GET', path: '/', originalUrl: '/', headers: { host: 'crhsent.com' }, query: {}, body: {}, ip: '9.9.9.9', ...over });

describe('accessGate middleware', () => {
  const { salt, hash } = hashPassword('correct-horse');
  beforeEach(() => {
    jest.clearAllMocks();
    accessGate._cache.enabled = true;
    accessGate._cache.salt = salt;
    accessGate._cache.hash = hash;
    accessGate._cache.ips = new Map();
    AccessWhitelist.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    AccessWhitelist.updateOne.mockResolvedValue({});
    AccessClick.create.mockResolvedValue({});
    AccessRequest.create.mockResolvedValue({});
    AccessRequest.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    AccessRequest.updateOne.mockResolvedValue({});
    sendEmail.mockResolvedValue({ messageId: 'x' });
  });

  it('is a no-op when the gate is disabled (access_gate_enabled=false)', async () => {
    accessGate._cache.enabled = false;
    const req = mkReq(); const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it('loadCache drives cache.enabled from the access_gate_enabled SystemConfig flag', async () => {
    const SystemConfig = require('../../server/models/SystemConfig');
    SystemConfig.getValue.mockResolvedValueOnce(true);
    await accessGate.loadCache();
    expect(accessGate._cache.enabled).toBe(true);
    SystemConfig.getValue.mockResolvedValueOnce(false);
    await accessGate.loadCache();
    expect(accessGate._cache.enabled).toBe(false);
  });

  it('lets exempt paths through (logo) without whitelist', async () => {
    const req = mkReq({ path: '/assets/images/brand/logo-wavemax.png' }); const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('GATES crhsent.com: non-whitelisted GET shows the access landing (401)', async () => {
    const req = mkReq({ ip: '8.8.8.8', path: '/wavemax/', originalUrl: '/wavemax/', headers: { host: 'crhsent.com' } });
    const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send.mock.calls[0][0]).toContain('name="email"');
    expect(res.redirect).not.toHaveBeenCalled(); // no redirect off to another site
  });

  it('EXEMPTS /wavemax when the mediator gate is enabled (mediatorGate takes over)', async () => {
    const OLD = process.env.MEDIATOR_GATE_ENABLED;
    process.env.MEDIATOR_GATE_ENABLED = 'true';
    try {
      const req = mkReq({ ip: '8.8.8.8', path: '/wavemax/', originalUrl: '/wavemax/', headers: { host: 'crhsent.com' } });
      const res = mkRes(); const next = jest.fn();
      await accessGate(req, res, next);
      expect(next).toHaveBeenCalled();               // passes accessGate → reaches mediatorGate
      expect(res.status).not.toHaveBeenCalledWith(401);
    } finally {
      if (OLD === undefined) delete process.env.MEDIATOR_GATE_ENABLED; else process.env.MEDIATOR_GATE_ENABLED = OLD;
    }
  });

  it('GATES www.crhsent.com the same way (on a non-public path)', async () => {
    const req = mkReq({ ip: '8.8.8.8', path: '/wavemax/', originalUrl: '/wavemax/', headers: { host: 'www.crhsent.com' } });
    const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send.mock.calls[0][0]).toContain('name="email"');
  });

  it('lets the public CRHS corporate routes + assets + SEO files through even when gated', async () => {
    const publicPaths = [
      '/', '/capabilities', '/capabilities/', '/work', '/work/',
      '/about', '/about/', '/contact', '/contact/',
      '/assets/css/site.css', '/assets/js/site.js', '/assets/fonts/inter-400.woff2',
      '/assets/img/og-home.png', '/robots.txt', '/sitemap.xml'
    ];
    for (const p of publicPaths) {
      const req = mkReq({ ip: '8.8.8.8', path: p, originalUrl: p, headers: { host: 'crhsent.com' } });
      const res = mkRes(); const next = jest.fn();
      await accessGate(req, res, next);
      expect(next).toHaveBeenCalled();                 // passes through
      expect(res.status).not.toHaveBeenCalledWith(401); // not gated
    }
  });

  it('does NOT gate any other host — wavemax.promo and the per-location domains pass through', async () => {
    for (const host of ['wavemax.promo', 'www.wavemax.promo', 'rundberglaundry.com', 'atxwashateria.com', 'wavemaxlaundry.com']) {
      const req = mkReq({ ip: '8.8.8.8', path: '/', originalUrl: '/', headers: { host } });
      const res = mkRes(); const next = jest.fn();
      await accessGate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(401);
      expect(res.redirect).not.toHaveBeenCalled();
    }
  });

  it('passes a whitelisted IP on the gated host and records the click when trackClicks=true', async () => {
    accessGate._cache.ips.set('1.2.3.4', { trackClicks: true });
    const req = mkReq({ ip: '1.2.3.4', path: '/wavemax/', headers: { host: 'crhsent.com' } }); const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(AccessClick.create).toHaveBeenCalledTimes(1);
  });

  it('passes the admin IP on the gated host WITHOUT recording a click (trackClicks=false)', async () => {
    accessGate._cache.ips.set('5.5.5.5', { trackClicks: false });
    const req = mkReq({ ip: '5.5.5.5', path: '/wavemax/', headers: { host: 'crhsent.com' } }); const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(AccessClick.create).not.toHaveBeenCalled();
  });

  it('uses the real client IP from CF-Connecting-IP for the whitelist check', async () => {
    accessGate._cache.ips.set('203.0.113.7', { trackClicks: true });
    const req = mkReq({ ip: '172.16.0.1', path: '/wavemax/', headers: { host: 'crhsent.com', 'cf-connecting-ip': '203.0.113.7' } });
    const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('falls back to a DB whitelist lookup on cache miss (cross-worker unlock)', async () => {
    AccessWhitelist.findOne.mockReturnValue({ lean: () => Promise.resolve({ ip: '4.4.4.4', trackClicks: true }) });
    const req = mkReq({ ip: '4.4.4.4', path: '/wavemax/', headers: { host: 'crhsent.com' } }); const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(accessGate._cache.ips.get('4.4.4.4')).toEqual({ trackClicks: true });
  });

  it('emails a single-use link on valid email+password and redirects to /__gate/sent (no immediate whitelist)', async () => {
    const req = mkReq({
      method: 'POST', path: '/__gate', ip: '7.7.7.7',
      headers: { host: 'crhsent.com' },
      body: { email: 'user@example.com', password: 'correct-horse', next: '/wavemax/' }
    });
    const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(AccessRequest.create).toHaveBeenCalledTimes(1);
    const created = AccessRequest.create.mock.calls[0][0];
    expect(created.email).toBe('user@example.com');
    expect(created.token).toEqual(expect.any(String));
    expect(created.next).toBe('/wavemax/');
    expect(created.requestIp).toBe('7.7.7.7');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][3]).toContain('admin@rundberglaundry.com'); // From override
    expect(sendEmail.mock.calls[0][2]).toContain('/__gate/confirm?token='); // link with token param
    expect(AccessWhitelist.updateOne).not.toHaveBeenCalled(); // not whitelisted yet
    expect(res.redirect).toHaveBeenCalledWith('/__gate/sent');
  });

  it('skips resending when the same IP requested a link within the throttle window (cluster-global)', async () => {
    AccessRequest.findOne.mockReturnValue({ lean: () => Promise.resolve({ token: 'recent', createdAt: new Date() }) });
    const req = mkReq({ method: 'POST', path: '/__gate', ip: '7.7.7.7', body: { email: 'user@example.com', password: 'correct-horse' } });
    const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(AccessRequest.create).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/__gate/sent');
  });

  it('re-renders the form with an error on valid password but invalid email', async () => {
    const req = mkReq({ method: 'POST', path: '/__gate', ip: '7.7.7.9', body: { email: 'not-an-email', password: 'correct-horse' } });
    const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(AccessRequest.create).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send.mock.calls[0][0]).toContain('valid email');
  });

  it('rejects a wrong password POST /__gate with 401 + error (no email sent)', async () => {
    const req = mkReq({ method: 'POST', path: '/__gate', ip: '7.7.7.8', body: { email: 'user@example.com', password: 'nope' } });
    const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(AccessWhitelist.updateOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send.mock.calls[0][0]).toContain('Incorrect password');
  });

  it('serves the landing form (email + password) on GET /__gate', async () => {
    const req = mkReq({ path: '/__gate' }); const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send.mock.calls[0][0]).toContain('name="email"');
    expect(res.send.mock.calls[0][0]).toContain('Send me a link');
  });

  it('renders the swirl spinner + a nonce-bound submit handler on the landing form', async () => {
    const req = mkReq({ path: '/__gate' });
    const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    const html = res.send.mock.calls[0][0];
    expect(html).toContain('id="gate-spinner"');
    expect(html).toContain('swirl-dot1');
    expect(html).toContain('<script nonce="test-nonce">');
    expect(html).toContain('data-spinner=');
  });

  it('GET /__gate/sent shows the check-your-email page', async () => {
    const req = mkReq({ path: '/__gate/sent', ip: '9.3.3.3' }); const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send.mock.calls[0][0]).toContain('Check your email');
  });

  it('GET /__gate/confirm with a valid token shows the confirm button (no whitelist yet)', async () => {
    AccessRequest.findOne.mockReturnValue({ lean: () => Promise.resolve({ token: 'tok1', email: 'u@e.com', next: '/wavemax/', used: false, expiresAt: new Date(Date.now() + 60000) }) });
    const req = mkReq({ path: '/__gate/confirm', query: { token: 'tok1' }, ip: '8.8.8.9' });
    const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send.mock.calls[0][0]).toContain('Enter the site');
    expect(AccessWhitelist.updateOne).not.toHaveBeenCalled();
  });

  it('GET /__gate/confirm with an expired token shows the error page', async () => {
    AccessRequest.findOne.mockReturnValue({ lean: () => Promise.resolve({ token: 'tok2', email: 'u@e.com', used: false, expiresAt: new Date(Date.now() - 1000) }) });
    const req = mkReq({ path: '/__gate/confirm', query: { token: 'tok2' }, ip: '8.8.8.10' });
    const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send.mock.calls[0][0]).toContain('expired');
    expect(AccessWhitelist.updateOne).not.toHaveBeenCalled();
  });

  it('POST /__gate/confirm with a valid token whitelists the clicking IP and redirects to next', async () => {
    AccessRequest.findOne.mockReturnValue({ lean: () => Promise.resolve({ token: 'tok3', email: 'u@e.com', next: '/wavemax/', used: false, expiresAt: new Date(Date.now() + 60000) }) });
    const req = mkReq({ method: 'POST', path: '/__gate/confirm', ip: '9.1.1.1', body: { token: 'tok3', next: '/wavemax/' } });
    const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(AccessWhitelist.updateOne.mock.calls[0][0]).toEqual({ ip: '9.1.1.1' });
    expect(AccessRequest.updateOne).toHaveBeenCalledWith({ token: 'tok3' }, expect.objectContaining({ $set: expect.objectContaining({ used: true, usedIp: '9.1.1.1' }) }));
    expect(accessGate._cache.ips.get('9.1.1.1')).toEqual({ trackClicks: true });
    expect(res.redirect).toHaveBeenCalledWith('/wavemax/');
  });

  it('POST /__gate/confirm with an already-used token shows the error page and does not whitelist', async () => {
    AccessRequest.findOne.mockReturnValue({ lean: () => Promise.resolve({ token: 'tok4', email: 'u@e.com', used: true, usedIp: '5.5.5.5', expiresAt: new Date(Date.now() + 60000) }) });
    const req = mkReq({ method: 'POST', path: '/__gate/confirm', ip: '9.2.2.2', body: { token: 'tok4' } });
    const res = mkRes(); const next = jest.fn();
    await accessGate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(AccessWhitelist.updateOne).not.toHaveBeenCalled();
  });
});
