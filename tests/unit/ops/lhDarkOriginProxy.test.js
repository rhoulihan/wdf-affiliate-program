// tests/unit/ops/lhDarkOriginProxy.test.js
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createProxy } = require('../../../scripts/ops/lh-dark-origin-proxy');

test('forwards Host, path and query verbatim and relays status, headers and body', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhp-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${dir}/k.pem`, '-out', `${dir}/c.pem`, '-subj', '/CN=atxwashdryfold.com', '-days', '1'], { stdio: 'ignore' });
  const upstream = http.createServer((req, res) => {
    res.writeHead(418, { 'x-seen-host': req.headers.host, 'content-security-policy': "frame-ancestors 'self'" });
    res.end(req.url);
  });
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
  const proxy = createProxy({
    cert: fs.readFileSync(`${dir}/c.pem`),
    key: fs.readFileSync(`${dir}/k.pem`),
    upstreamHost: '127.0.0.1',
    upstreamPort: upstream.address().port
  });
  await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
  const res = await new Promise((resolve, reject) => https.get({
    host: '127.0.0.1',
    port: proxy.address().port,
    path: '/affiliate?lh=1&x=%2F',
    headers: { host: 'atxwashdryfold.com' },
    rejectUnauthorized: false
  }, (r) => {
    let b = '';
    r.on('data', (d) => { b += d; });
    r.on('end', () => resolve({ r, b }));
  }).on('error', reject));
  expect(res.r.statusCode).toBe(418);
  expect(res.r.headers['x-seen-host']).toBe('atxwashdryfold.com');
  expect(res.r.headers['content-security-policy']).toBe("frame-ancestors 'self'");
  expect(res.b).toBe('/affiliate?lh=1&x=%2F');
  await new Promise((r) => proxy.close(r));
  await new Promise((r) => upstream.close(r));
});
