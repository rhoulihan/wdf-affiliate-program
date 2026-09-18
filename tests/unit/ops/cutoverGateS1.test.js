// tests/unit/ops/cutoverGateS1.test.js — drives scripts/ops/cutover-gate.sh stage S1 --on-box
// against an in-process stub origin. The script runs through the ASYNC execFile: a
// spawnSync would block this process's event loop, the stub could never answer, and
// every curl would hang.
const http = require('http');
const { execFile, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const SCRIPT = path.join(__dirname, '..', '..', '..', 'scripts', 'ops', 'cutover-gate.sh');
const MKT = ['rundberglaundry.com', 'runberglaundry.com', 'atxwashateria.com', 'atxwashdryfold.com'];
const PORTAL = 'https://portal.atxwashdryfold.com';
const LOGO = Buffer.from('fake-png-bytes');
const TOKEN = '0123456789abcdef0123456789abcdef';
const NONCE = 'abc123';
const MANUAL_IDS = ['C5-contact', 'C6-mail', 'C13-click', 'C14-baseline', 'P1', 'P2', 'P3', 'P8', 'P13', 'P14', 'R2-cors'];
const CSP_MKT = `default-src 'self'; script-src 'self' 'nonce-${NONCE}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-src 'none'; frame-ancestors 'self'; form-action 'self'; upgrade-insecure-requests`;
const CSP_CRHSENT = `default-src 'self'; script-src 'self' 'nonce-${NONCE}'; frame-ancestors 'self'`;
const FP = '<a href="https://www.wavemaxlaundry.com/austin-tx">WaveMAX Austin</a>';
const HOME = `<!doctype html><html><head><meta name="csp-nonce" content="${NONCE}"><link rel="canonical" href="https://atxwashdryfold.com/"><link rel="stylesheet" href="/assets/css/partner-program.css"></head><body><h1 data-i18n="partner.hero.title">Hero</h1><p>${Array(5).fill(FP).join(' | ')}</p><script src="/assets/js/i18n.js" nonce="${NONCE}"></script></body></html>`;
const AFF = `<!doctype html><html><head><meta name="csp-nonce" content="${NONCE}"><link rel="canonical" href="https://atxwashdryfold.com/affiliate"><link rel="stylesheet" href="/assets/css/affiliate.css"></head><body><h1>Affiliate</h1><script src="/assets/js/affiliate-inquiry.js" nonce="${NONCE}"></script></body></html>`;
const BOTS = ['GPTBot', 'ChatGPT-User', 'CCBot', 'Google-Extended', 'anthropic-ai', 'ClaudeBot', 'PerplexityBot', 'Bytespider', 'Amazonbot'];
const ROBOTS = BOTS.map((b) => `User-agent: ${b}\nDisallow: /\n\n`).join('') + 'User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://atxwashdryfold.com/sitemap.xml\n';
const SITEMAP = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://atxwashdryfold.com/</loc></url>\n  <url><loc>https://atxwashdryfold.com/affiliate</loc></url>\n</urlset>\n';
const SEC = (h) => `# RFC 9116\nContact: mailto:security@crhsent.com\nExpires: 2027-05-20T00:00:00.000Z\nPreferred-Languages: en\nCanonical: https://${h}/.well-known/security.txt\nPolicy: https://portal.atxwashdryfold.com/privacy-policy\n`;
const LEAVES = Object.fromEntries(Array.from({ length: 119 }, (_, i) => ['k' + i, 'v']));
const LEGACY = new Set(['/embed-app-v2.html', '/admin', '/admin/', '/operator', '/operator/', '/operator-scan-embed.html', '/scanbag', '/scanbag/', '/scanbag-manifest.json', '/scanbag-sw.js', '/monitoring-dashboard.html']);

function stub(breakage = {}) {
  return http.createServer((req, res) => {
    const host = (req.headers.host || '').toLowerCase();
    const u = new URL(req.url, 'http://stub');
    const send = (code, type, body, extra = {}) => { res.writeHead(code, { 'content-type': type, ...extra }); res.end(body); };
    const redirect = (code, location, extra = {}) => { res.writeHead(code, { location, ...extra }); res.end(); };
    const getLike = req.method === 'GET' || req.method === 'HEAD';
    if (u.pathname === '/health') return send(200, 'application/json; charset=utf-8', '{"status":"ok"}', { 'cache-control': 'no-store' });
    if (host === 'crhsent.com') {
      const h = { 'content-security-policy': CSP_CRHSENT };
      if (u.pathname === '/') return send(200, 'text/html; charset=utf-8', '<html>crhsent</html>', { ...h, 'set-cookie': '__Host-crhsent.sid=s%3Aabc.def; Path=/; HttpOnly; Secure; SameSite=Lax' });
      if (u.pathname === '/wavemax/') return send(200, 'text/html; charset=utf-8', '<h1>Documented record &mdash; access</h1>', h);
      if (u.pathname === '/assets/images/brand/logo.png') return send(200, 'image/png', LOGO);
      if (u.pathname === '/assets/images/brand/logo-wavemax.png') return send(410, 'text/plain; charset=utf-8', '');
      return send(401, 'text/html; charset=utf-8', '<p class="sub">This content is private.</p>', h);
    }
    if (!MKT.includes(host)) return send(404, 'text/html; charset=utf-8', 'Not Found');
    if (getLike && !breakage.b7 && (LEGACY.has(u.pathname) || u.pathname.startsWith('/api/v1/customers/verify-email/'))) return redirect(301, PORTAL + req.url);
    if (getLike && req.headers['cf-connecting-ip'] === '72.190.1.227') return redirect(302, PORTAL + req.url, { 'cache-control': 'no-store' });
    if (u.pathname.startsWith('/api/')) return send(404, 'application/json; charset=utf-8', '{"success":false,"message":"Not found"}');
    if (!getLike) return send(404, 'text/html; charset=utf-8', 'Not Found');
    const html = { 'content-security-policy': CSP_MKT, 'cache-control': 'no-cache, no-store, must-revalidate' };
    if (u.pathname === '/') return send(200, 'text/html; charset=utf-8', HOME, html);
    if (u.pathname === '/affiliate' || u.pathname === '/affiliate/') return send(200, 'text/html; charset=utf-8', AFF, html);
    if (u.pathname === '/robots.txt') return send(200, 'text/plain; charset=utf-8', ROBOTS, { 'cache-control': 'public, max-age=3600' });
    if (u.pathname === '/sitemap.xml') return send(200, 'application/xml; charset=utf-8', SITEMAP, { 'cache-control': 'public, max-age=3600' });
    if (u.pathname === '/.well-known/security.txt') return send(200, 'text/plain; charset=utf-8', SEC(host));
    if (u.pathname === '/favicon.ico') return send(200, 'image/png', LOGO);
    if (u.pathname === '/assets/images/brand/logo.png') return send(200, 'image/png', LOGO);
    if (u.pathname === '/assets/images/brand/logo-wavemax.png') {
      return breakage.logo410 ? redirect(301, '/assets/images/brand/logo.png') : send(410, 'text/plain; charset=utf-8', '');
    }
    if (u.pathname === '/assets/js/partner-inquiry.js') return send(200, 'application/javascript', "fetch('/api/partner-inquiry', {");
    if (u.pathname === '/assets/js/affiliate-inquiry.js') return send(200, 'application/javascript', "fetch('/api/affiliate-application', {");
    if (u.pathname.startsWith('/assets/css/')) return send(200, 'text/css', "@font-face{font-family:a;src:url('/assets/fonts/a.woff2')}");
    if (/^\/locales\/(en|es|pt|de)\/common\.json$/.test(u.pathname)) return send(200, 'application/json; charset=UTF-8', JSON.stringify({ partner: LEAVES }), { 'access-control-allow-origin': '*' });
    return send(404, 'text/html; charset=utf-8', 'Not Found');
  });
}

function tmpLog(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gate-')), name);
}

function run(server, extraArgs = [], extraEnv = {}) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    const log = tmpLog('s1.log');
    execFile('bash', [SCRIPT, '--stage', 'S1', '--on-box', '--base', `http://127.0.0.1:${port}`, '--log', log, ...extraArgs], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        GATE_LOGO_MD5: crypto.createHash('md5').update(LOGO).digest('hex'),
        GATE_LOGO_BYTES: String(LOGO.length),
        GATE_ATTESTED: '',
        GATE_D5: 'pending',
        ...extraEnv
      }
    }, (err, stdout, stderr) => {
      server.close();
      resolve({ status: err ? err.code : 0, stdout, stderr, log: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '' });
    });
  }));
}

function attestedLog() {
  const f = tmpLog('attested.log');
  fs.writeFileSync(f, MANUAL_IDS.map((id) => `MANUAL ${id} PASS rick 2026-09-13T00:00:00Z fixture`).join('\n') + '\n');
  return f;
}

describe('cutover-gate.sh S1 --on-box', () => {
  test('every cell PASSes against a correct origin with all MANUAL cells attested; exit 0; no token in the log', async () => {
    const r = await run(stub(), ['--attested-log', attestedLog()]);
    expect(r.stdout).not.toMatch(/^FAIL /m);
    for (const id of ['C9-health', 'R6-portal-404', 'R8-unknown-404', 'R7-crhsent', 'C11-frame-ancestors', 'R3-xfh-wavemax', 'R3-xfh-readme', 'C9b-inverse',
      'C7-logo', 'C7-logo-wavemax-410', 'C8-crhsent-not302', 'C1-home', 'C12-canonical', 'C10-csp', 'C10-static', 'C2-affiliate', 'C3-robots', 'C4-sitemap',
      'C5-securitytxt', 'C5-favicon', 'C6-pagejs', 'C6-v1-anything-else', 'C7-bagqr-301', 'C7-expediter-301', 'C7-legacy-301', 'C7-negative',
      'C8-storeip-302', 'C8-nonstore-200', 'C8-legacy-wins', 'C9b-spoof', 'C13-locales', 'C13-keysets']) {
      expect(r.stdout).toMatch(new RegExp(`^PASS ${id}`, 'm'));
    }
    expect(r.stdout).toMatch(/^SKIP C2-wavemax-affiliate atxwashdryfold\.com D5 PENDING COUNSEL$/m);
    expect(r.stdout).toMatch(/^SKIP C8b atxwashdryfold\.com on-box/m);
    expect(r.stdout).toMatch(/^PASS C6-mail attested$/m);
    expect(r.stdout).toMatch(/^SUMMARY S1 fails=0 pending=0$/m);
    expect(r.status).toBe(0);
    expect(r.log).not.toContain(TOKEN);
  });

  test('logo-wavemax answering 301 instead of 410 is a FAIL and exits 1', async () => {
    const r = await run(stub({ logo410: true }), ['--attested-log', attestedLog()]);
    expect(r.stdout).toMatch(/^FAIL C7-logo-wavemax-410 rundberglaundry\.com /m);
    expect(r.status).toBe(1);
  });

  test('a missing B7 redirect is a FAIL, and the FAIL evidence has the bag token redacted', async () => {
    const r = await run(stub({ b7: true }), ['--attested-log', attestedLog()]);
    expect(r.stdout).toMatch(/^FAIL C7-bagqr-301 rundberglaundry\.com GET .*bag=<redacted>/m);
    expect(r.log).toMatch(/^FAIL C7-bagqr-301 .*bag=<redacted>/m);
    expect(r.log).not.toContain(TOKEN);
    expect(r.log).not.toContain('k=abc');
    expect(r.status).toBe(1);
  });

  test('MANUAL cells print PENDING and hold the exit at 1 until attested', async () => {
    const r = await run(stub());
    expect(r.stdout).not.toMatch(/^FAIL /m);
    expect(r.stdout).toMatch(/^MANUAL C13-click PENDING$/m);
    expect(r.stdout).toMatch(/^MANUAL C6-mail PENDING$/m);
    expect(r.stdout).toMatch(/^SUMMARY S1 fails=0 pending=11$/m);
    expect(r.status).toBe(1);
  });

  test('GATE_ATTESTED clears MANUAL cells the same way as --attested-log', async () => {
    const r = await run(stub(), [], { GATE_ATTESTED: MANUAL_IDS.join(' ') });
    expect(r.stdout).toMatch(/^PASS C6-mail attested$/m);
    expect(r.stdout).not.toMatch(/^MANUAL .* PENDING$/m);
    expect(r.status).toBe(0);
  });

  test('--attest appends one MANUAL PASS line with an ISO-8601 UTC timestamp', () => {
    const log = tmpLog('a.log');
    const r = spawnSync('bash', [SCRIPT, '--attest', 'C13-click', '--by', 'rick', '--evidence', 'es toggle ok oci1', '--log', log], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '').toMatch(/^MANUAL C13-click PASS rick \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z es toggle ok oci1$/m);
  });
});
