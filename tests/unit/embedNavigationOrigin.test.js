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
  // The origin check must name no franchisor domain. File-wide there is exactly
  // ONE pre-existing franchisor reference — a data-utm-source attribute on
  // outbound links — which is a separate concern (traffic attribution, not
  // trust). Pinning the count at 1 keeps this guard able to catch a NEW one.
  it('the origin check names no franchisor domain', () => {
    const handler = SRC.slice(SRC.indexOf('function handleParentMessage'),
      SRC.indexOf('switch (event.data.type)'));
    expect(handler).not.toMatch(/wavemaxlaundry\.com/i);
  });

  it('has exactly one franchisor reference file-wide, the known utm attribute', () => {
    const hits = SRC.match(/wavemaxlaundry\.com/gi) || [];
    expect(hits).toHaveLength(1);
    expect(SRC).toMatch(/data-utm-source'\s*,\s*'wavemaxlaundry\.com'/);
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
