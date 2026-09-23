'use strict';
// Plan 3 Task 37 — the portal's HOST SURFACE names only portal.atxwashdryfold.com.
//
// Task 16 deleted the marketing PAGES; the marketing HOSTS stayed behind in the
// portal's live security configuration: the CSP img-src/connect-src extras, the
// credentialed CORS allowlist, allowedHosts, the HTTPS-redirect fallback, the
// per-host sitemap/robots map, and ten `process.env.BASE_URL || 'https://
// rundberglaundry.com'` defaults. crhs-corporate on :3001 owns those hosts now,
// so every one of those entries is grant-of-reach to an origin this app has no
// relationship with.
//
// Two of them were not merely stale: dispatcher/ops.js hard-coded
// https://rundberglaundry.com/monitoring-dashboard.html into both halves of the
// service-down alert with no BASE_URL and no override, so an outage alert told
// the operator to open a dashboard on a host the portal no longer serves.
//
// Every assertion here carries a POSITIVE CONTROL so it cannot pass vacuously.

// Captured so the ops.js alert body can be inspected without sending mail.
jest.mock('../../server/services/email/transport', () => ({
  sendEmail: jest.fn()
}));

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../../server');
const { sendEmail } = require('../../server/services/email/transport');
const inviteService = require('../../server/modules/onboarding/inviteService');
const templateManager = require('../../server/services/email/template-manager');
const opsEmail = require('../../server/services/email/dispatcher/ops');

const REPO = path.resolve(__dirname, '../..');
const PORTAL = 'https://portal.atxwashdryfold.com';

// Any marketing apex, but NOT the portal subdomain of atxwashdryfold.com.
const MARKETING_APEX =
  /(?:www\.)?(?<!portal\.)(?:rundberglaundry|runberglaundry|atxwashateria|atxwashdryfold)\.com/;

const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const directive = (csp, name) =>
  (csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name} `)) || '');

// Every `process.env.BASE_URL || '<literal>'` default in server/, with its file.
// A source scan rather than ten call-site fixtures: it is exhaustive by
// construction, so a newly-added eleventh default cannot slip past this guard.
function baseUrlDefaults() {
  const { execSync } = require('child_process');
  const raw = execSync(
    'git grep -nI -E "process\\.env\\.BASE_URL \\|\\| \'[^\']+\'" -- server server.js',
    { cwd: REPO, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
  ).trim();
  return (raw ? raw.split('\n') : []).map((line) => {
    const m = line.match(/^([^:]+):(\d+):.*process\.env\.BASE_URL \|\| '([^']+)'/);
    return m ? { file: m[1], line: Number(m[2]), fallback: m[3] } : null;
  }).filter(Boolean);
}

describe('T37 — served CSP names no marketing origin', () => {
  let csp;
  beforeAll(async () => {
    const res = await request(app).get('/')
      .set('Host', 'portal.atxwashdryfold.com')
      .set('X-Forwarded-Proto', 'https');
    csp = res.headers['content-security-policy'];
  });

  it('emits a CSP header naming the portal origin (positive control)', () => {
    expect(csp).toBeTruthy();
    expect(csp).toContain(PORTAL);
  });

  it('img-src carries the portal and no marketing apex', () => {
    const d = directive(csp, 'img-src');
    expect(d).toContain(PORTAL); // control: the directive really is populated
    expect(d).not.toMatch(MARKETING_APEX);
  });

  it('connect-src carries the portal and no marketing apex', () => {
    const d = directive(csp, 'connect-src');
    expect(d).toContain(PORTAL);
    expect(d).not.toMatch(MARKETING_APEX);
  });
});

describe('T37 — credentialed CORS admits only the portal', () => {
  const preflight = (origin) => request(app).options('/api/v1/addons')
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'GET');

  it('the portal origin is admitted (positive control — proves the CORS layer works)', async () => {
    const res = await preflight(PORTAL);
    expect(res.headers['access-control-allow-origin']).toBe(PORTAL);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it.each([
    'https://rundberglaundry.com',
    'https://atxwashateria.com',
    'https://atxwashdryfold.com'
  ])('a marketing origin is refused: %s', async (origin) => {
    const res = await preflight(origin);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('T37 — sitemap.xml and robots.txt name only the portal', () => {
  it('sitemap on the portal host lists the portal apex and nothing else', async () => {
    const res = await request(app).get('/sitemap.xml').set('Host', 'portal.atxwashdryfold.com');
    expect(res.status).toBe(200);
    const locs = [...res.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([`${PORTAL}/`]); // control: exactly one url, and it is the portal
  });

  it('sitemap on an unknown host falls back to the portal, not a marketing apex', async () => {
    const res = await request(app).get('/sitemap.xml').set('Host', 'not-a-managed-host.test');
    expect(res.status).toBe(200);
    const locs = [...res.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([`${PORTAL}/`]);
  });

  it('robots on an unknown host advertises the portal sitemap', async () => {
    const res = await request(app).get('/robots.txt').set('Host', 'not-a-managed-host.test');
    expect(res.status).toBe(200);
    expect(res.text).toContain(`Sitemap: ${PORTAL}/sitemap.xml`); // control
    expect(res.text).not.toMatch(MARKETING_APEX);
  });
});

describe('T37 — every BASE_URL default resolves to the portal', () => {
  const saved = process.env.BASE_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.BASE_URL;
    else process.env.BASE_URL = saved;
  });

  it('buildInviteUrl falls back to the portal with BASE_URL unset', () => {
    delete process.env.BASE_URL;
    expect(inviteService.buildInviteUrl('tok123'))
      .toBe(`${PORTAL}/embed-app-v2.html?route=/affiliate-register&invite=tok123`);
  });

  it('buildInviteUrl still honours BASE_URL when set (control)', () => {
    process.env.BASE_URL = 'https://base.example.test';
    expect(inviteService.buildInviteUrl('tok123')).toContain('https://base.example.test/');
  });

  it('fillTemplate resolves [BASE_URL] to the portal with BASE_URL unset', () => {
    delete process.env.BASE_URL;
    expect(templateManager.fillTemplate('link=[BASE_URL]/x', {})).toBe(`link=${PORTAL}/x`);
  });

  it('no BASE_URL default anywhere in server/ names a marketing apex', () => {
    const defaults = baseUrlDefaults();
    expect(defaults.length).toBeGreaterThan(5); // control: the scan found the family
    const offenders = defaults
      .filter((d) => MARKETING_APEX.test(d.fallback))
      .map((d) => `${d.file}:${d.line} -> ${d.fallback}`);
    expect(offenders).toEqual([]);
  });

  it('labelSheetService names the portal as its claim-URL default', () => {
    const src = read('server/modules/bags/labelSheetService.js');
    expect(src).toContain(`process.env.BASE_URL || '${PORTAL}'`); // control
    expect(src).not.toMatch(MARKETING_APEX);
  });
});

describe('T37 — the outage alert links to a dashboard the portal serves', () => {
  const saved = process.env.BASE_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.BASE_URL;
    else process.env.BASE_URL = saved;
  });

  const alert = () => opsEmail.sendServiceDownAlert({
    serviceName: 'mongodb',
    error: 'Connection timeout',
    timestamp: new Date('2026-09-23T12:00:00Z'),
    serviceData: { lastSuccess: null, totalChecks: 10, failedChecks: 3, uptime: 7 }
  });

  it('the rendered HTML links to the portal dashboard, never a marketing host', async () => {
    delete process.env.BASE_URL;
    sendEmail.mockResolvedValue(true);
    await alert();
    expect(sendEmail).toHaveBeenCalled();
    const html = sendEmail.mock.calls[0][2];
    expect(html).toContain(`${PORTAL}/monitoring-dashboard.html`); // control
    expect(html).not.toMatch(MARKETING_APEX);
  });

  // sendServiceDownAlert only ever passes its HTML half to sendEmail, so the
  // plain-text half is not observable through the mock. One hoisted
  // `dashboardUrl` is what makes the two halves unable to drift; assert the
  // hoist, and that no marketing host remains anywhere in the dispatcher.
  it('both halves share one hoisted dashboardUrl', () => {
    const src = read('server/services/email/dispatcher/ops.js');
    expect((src.match(/const dashboardUrl\b/g) || []).length).toBe(1);
    expect((src.match(/\$\{dashboardUrl\}/g) || []).length).toBe(2);
    expect(src).not.toMatch(/https?:\/\/(?:www\.)?(?<!portal\.)(?:rundberglaundry|runberglaundry|atxwashateria|atxwashdryfold)\.com/);
  });
});

describe('T37 — server.js host lists name only the portal', () => {
  const src = read('server.js');

  it('allowedHosts keeps the portal and the retirement 301 hosts only', () => {
    const block = src.match(/const allowedHosts = \[([\s\S]*?)\];/);
    expect(block).toBeTruthy(); // control: the region still exists
    const hosts = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(hosts).toEqual([
      'portal.atxwashdryfold.com',
      'wavemax.promo',
      'www.wavemax.promo',
      'affiliate.wavemax.promo',
      'localhost:3000'
    ]);
  });

  it('the invalid-host HTTPS redirect falls back to the portal', () => {
    expect(src).toContain('res.redirect(`https://portal.atxwashdryfold.com${req.url}`)');
  });

  it('APP_LOCATION_ORIGINS is the portal alone', () => {
    const block = src.match(/const APP_LOCATION_ORIGINS = \[([\s\S]*?)\];/);
    expect(block).toBeTruthy();
    expect([...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([PORTAL]);
  });

  it('the CORS app-origin allowlist is the portal alone', () => {
    const block = src.match(/const wavemaxDomains = \[([\s\S]*?)\];/);
    expect(block).toBeTruthy();
    expect([...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([PORTAL]);
  });
});

describe('T37 — no surviving portal page names a marketing origin', () => {
  it.each([
    'public/affiliate-landing-embed.html',
    'public/assets/js/affiliate-landing-init.js',
    'public/embed-landing.html',
    // Not in Task 37's Files list — the plan's derivation grep required a
    // scheme, so it missed this bare-host branch on the translations path.
    'public/assets/js/i18n.js'
  ])('%s', (rel) => {
    const src = read(rel);
    // mailto: contact addresses are a live-mailbox/owner decision, not host
    // surface — strip them before asserting on hosts.
    const withoutMailto = src.replace(/mailto:[^"'\s>]+/g, '').replace(/[\w.+-]+@[\w.-]+/g, '');
    expect(withoutMailto).not.toMatch(MARKETING_APEX);
  });
});
