#!/usr/bin/env node
// scripts/ops/lh-dark-origin-proxy.js — Phase 0a Lighthouse shim (Plan 2 slice GATE, Task 82).
// In Phase 0a nginx on <box-ip>:443 still routes every marketing host to :3000, so a
// literal `--host-resolver-rules="MAP <host> <box-ip>"` would score the OLD app. Lighthouse
// reaches the DARK :3001 instead through:
//   Chrome --host-resolver-rules="MAP <host> 127.0.0.1:18443" -> this HTTPS shim
//   -> ssh -L 13001:127.0.0.1:3001 -> box :3001.
// The Host header, method, path and query go upstream unchanged; status, headers and body
// come back unchanged. There is no nginx gzip or HTTP/2 on this path, so Performance
// measured through it is informational only.
'use strict';
const https = require('https');
const http = require('http');
const fs = require('fs');

function createProxy({ cert, key, upstreamHost, upstreamPort }) {
  return https.createServer({ cert, key }, (req, res) => {
    const up = http.request(
      { host: upstreamHost, port: upstreamPort, method: req.method, path: req.url, headers: req.headers },
      (ur) => {
        res.writeHead(ur.statusCode, ur.headers);
        ur.pipe(res);
      }
    );
    up.on('error', (e) => {
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`upstream error: ${e.message}`);
    });
    req.pipe(up);
  });
}

if (require.main === module) {
  const arg = (n) => process.argv[process.argv.indexOf(n) + 1];
  const [uh, up] = arg('--upstream').split(':');
  createProxy({
    cert: fs.readFileSync(arg('--cert')),
    key: fs.readFileSync(arg('--key')),
    upstreamHost: uh,
    upstreamPort: Number(up)
  }).listen(Number(arg('--listen')), '127.0.0.1', () => process.stdout.write(`lh shim on 127.0.0.1:${arg('--listen')}\n`));
}

module.exports = { createProxy };
