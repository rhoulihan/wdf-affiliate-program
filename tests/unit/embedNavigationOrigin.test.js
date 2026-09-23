// The portal ships `frame-ancestors 'self'` (server.js:284), so the ONLY origin
// that can ever frame it is its own. embed-navigation.js nevertheless kept a
// literal trustedOrigins list naming the franchisor's two domains plus bare
// localhost, compared with startsWith().
//
// Two defects:
//  1. franchisor coupling — owner directive: "we will never embed in the
//     franchisor site". Unreachable under the CSP, but it is franchisor
//     coupling on a codebase in an active dispute, and a future CSP relaxation
//     would make it live.
//  2. startsWith() is a prefix test, not an origin test:
//     'https://wavemaxlaundry.com.attacker.test'.startsWith('https://wavemaxlaundry.com')
//     is true, and so is 'http://localhost.attacker.test' for 'http://localhost'.
//
// Deriving from window.location.origin makes the check exact AND keeps it in
// step with frame-ancestors automatically.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '../../public/assets/js/embed-navigation.js'), 'utf8');

describe('embed-navigation postMessage origin check', () => {
  it('the origin check names no franchisor domain', () => {
    const handler = SRC.slice(SRC.indexOf('function handleParentMessage'),
      SRC.indexOf('switch (event.data.type)'));
    expect(handler).not.toMatch(/wavemaxlaundry\.com/i);
  });

  // Owner decision 2026-09-23: the outbound utm-source was retagged from the
  // franchisor's domain to our own, so this file now carries NO franchisor
  // reference at all and the guard is absolute rather than a pinned count.
  it('carries no franchisor reference anywhere in the file', () => {
    expect(SRC).not.toMatch(/wavemaxlaundry\.com/i);
  });

  it('attributes outbound links to our own domain', () => {
    expect(SRC).toMatch(/data-utm-source'\s*,\s*'atxwashdryfold\.com'/);
  });

  it('does not trust a bare localhost/127.0.0.1 prefix', () => {
    const handler = SRC.slice(SRC.indexOf('function handleParentMessage'),
      SRC.indexOf('switch (event.data.type)'));
    expect(handler).not.toMatch(/'http:\/\/localhost'/);
    expect(handler).not.toMatch(/'http:\/\/127\.0\.0\.1'/);
  });

  it('compares origins for equality, never by prefix', () => {
    const handler = SRC.slice(SRC.indexOf('function handleParentMessage'),
      SRC.indexOf('switch (event.data.type)'));
    expect(handler).not.toMatch(/startsWith/);
  });

  it('derives the trusted origin from window.location.origin', () => {
    expect(SRC).toMatch(/event\.origin\s*!==\s*window\.location\.origin|window\.location\.origin\s*!==\s*event\.origin/);
  });

  it('still rejects and returns early on an untrusted origin', () => {
    const handler = SRC.slice(SRC.indexOf('function handleParentMessage'),
      SRC.indexOf('switch (event.data.type)'));
    expect(handler).toMatch(/!==\s*window\.location\.origin[\s\S]*?return;/);
  });
});
