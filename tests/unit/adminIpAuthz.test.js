// Admin-surface hardening: authorization-layer IP enforcement, quarantine
// allow-through for /admin, and the wiring for the /admin clean URL. These lock
// in the fixes from the adversarial review of the admin IP gate.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const { checkRole } = require('../../server/middleware/rbac');

const ENV = ['ADMIN_ALLOWLIST', 'ADMIN_IP', 'STORE_IP_ADDRESS', 'ADDITIONAL_STORE_IPS', 'STORE_IP_RANGES', 'ADMIN_IP_GATE_TEST'];
const saved = {};
beforeEach(() => {
  ENV.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
  process.env.ADMIN_IP_GATE_TEST = '1';        // make the gate live in this suite
  process.env.ADMIN_ALLOWLIST = '1.2.3.4';
});
afterEach(() => { ENV.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); });

function mockReq(role, cf) {
  return { user: role ? { role } : null, headers: cf ? { 'cf-connecting-ip': cf } : {}, originalUrl: '/api/v1/system/config/wdf_base_rate_per_pound' };
}
function mockRes() {
  const res = { statusCode: 200, body: undefined };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; res.ended = true; return res; };
  res.send = (b) => { res.body = b; res.ended = true; return res; };
  res.type = () => res;
  return res;
}

describe('rbac authz-layer admin IP enforcement (catches operator/system-config/refresh paths)', () => {
  it('lets an administrator through from an allowlisted IP', () => {
    const next = jest.fn();
    checkRole(['administrator'])(mockReq('administrator', '1.2.3.4'), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('blocks an administrator (404) from a non-allowlisted IP even on a non-/administrators admin route', () => {
    const next = jest.fn();
    const res = mockRes();
    checkRole(['administrator'])(mockReq('administrator', '9.9.9.9'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });

  it('does NOT gate a non-admin role by IP', () => {
    const next = jest.fn();
    // an operator hitting an operator-permitted route from any IP is fine
    checkRole(['operator'])(mockReq('operator', '9.9.9.9'), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('is transparent when enforcement is not active (no opt-in, non-prod)', () => {
    delete process.env.ADMIN_IP_GATE_TEST; // back to transparent test default
    const next = jest.fn();
    checkRole(['administrator'])(mockReq('administrator', '9.9.9.9'), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('quarantine lets the /admin clean URL reach its handler', () => {
  const quarantine = require('../../server/config/quarantineConfig');
  it('allows /admin and /admin/ (so it is not 302-redirected to corporate)', () => {
    expect(quarantine.isAllowed('/admin')).toBe(true);
    expect(quarantine.isAllowed('/admin/')).toBe(true);
  });
  it('still redirects an unrelated non-Austin path', () => {
    expect(quarantine.isAllowed('/some-marketing-page')).toBe(false);
  });
});

describe('/admin clean URL + gate wiring', () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const embedRoutes = fs.readFileSync(path.join(ROOT, 'server/routes/embedRoutes.js'), 'utf8');
  const authRoutes = fs.readFileSync(path.join(ROOT, 'server/routes/authRoutes.js'), 'utf8');
  const sessionMgr = fs.readFileSync(path.join(ROOT, 'public/assets/js/session-manager.js'), 'utf8');
  const embedApp = fs.readFileSync(path.join(ROOT, 'public/assets/js/embed-app-v2.js'), 'utf8');
  const embedMin = fs.readFileSync(path.join(ROOT, 'public/assets/js/embed-app-v2.min.js'), 'utf8');
  const embedHtml = fs.readFileSync(path.join(ROOT, 'public/embed-app-v2.html'), 'utf8');

  it('server.js gates the /admin route, the admin API, and the static-bypass paths', () => {
    expect(serverSrc).toMatch(/app\.get\(\['\/admin', '\/admin\/'\], adminIpGate/);
    expect(serverSrc).toMatch(/apiV1Router\.use\('\/administrators', adminIpGate/);
    expect(serverSrc).toContain("administrator-(login|dashboard)-embed");
    expect(serverSrc).toContain("'/admin'"); // in strictCSPPages
  });

  it('embedRoutes + authRoutes gate the admin pages and the admin login', () => {
    expect(embedRoutes).toMatch(/administrator-login-embed\.html', adminIpGate/);
    expect(embedRoutes).toMatch(/administrator-dashboard-embed\.html', adminIpGate/);
    expect(authRoutes).toMatch(/administrator\/login',\s*\n?\s*adminIpGate/);
  });

  it('the /admin handler injects window.__DEFAULT_ROUTE and the SPA honors it', () => {
    expect(serverSrc).toContain("window.__DEFAULT_ROUTE='/administrator-login'");
    expect(embedApp).toContain('__DEFAULT_ROUTE');
  });

  it('the dead auth-swap call-site is fixed (getAuthenticatedRoute, not adjustRouteForAuth) in source AND min bundle', () => {
    expect(embedApp).toContain('getAuthenticatedRoute');
    expect(embedApp).not.toContain('adjustRouteForAuth');
    expect(embedMin).toContain('getAuthenticatedRoute');
    expect(embedMin).not.toContain('adjustRouteForAuth');
    expect(embedMin).toContain('__DEFAULT_ROUTE'); // min was rebuilt
  });

  it('getAuthenticatedRoute redirects to the role\'s real protected route, not /${role}-dashboard', () => {
    expect(sessionMgr).toContain('return protectedRoutes[0];');
    expect(sessionMgr).not.toContain('return `/${role}-dashboard`;');
  });

  it('embed-app-v2.html cache-busts the rebuilt bundle and the changed session-manager', () => {
    expect(embedHtml).toMatch(/embed-app-v2\.min\.js\?v=20260824a/);
    expect(embedHtml).toMatch(/session-manager\.js\?v=20260619/);
  });
});
