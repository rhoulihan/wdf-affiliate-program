'use strict';

/**
 * Canonical real-visitor IP helpers.
 *
 * Topology: Cloudflare → nginx → Node, with Express `trust proxy = 1`. Because
 * there are TWO proxy hops, Express's `req.ip` resolves to the CLOUDFLARE EDGE
 * IP, not the visitor — so keying anything (rate limits, lockouts, gates) on
 * `req.ip` buckets every visitor behind a given edge together. Cloudflare
 * injects the true visitor IP in the `cf-connecting-ip` header; we read it
 * first.
 *
 * TRUST MODEL: `cf-connecting-ip` is trustworthy only because the origin is
 * firewalled to Cloudflare's IP ranges (UFW), NOT because the protocol
 * guarantees it — there is no nginx `set_real_ip_from`/`real_ip_header`. Any
 * host that can reach the origin off-Cloudflare could forge the header. For the
 * rate-limit BUCKET key this is contained: `ipBucketKey` only accepts a
 * *valid* IP from the header and otherwise falls back to `req.ip`, so a
 * malformed/multi-valued/garbage header cannot mint fresh buckets or collapse
 * into a shared empty key. (Hardening the nginx layer with `set_real_ip_from`
 * is the proper long-term fix — tracked separately.)
 *
 * This is the canonical resolver that the per-request IP controls
 * (adminIpGate, operatorIpGate, partnerLanding, locationQuarantine,
 * codeAttemptLockout, …) should migrate onto — they currently each inline a
 * near-identical version. (Consolidation tracked as a later audit workstream.)
 */

const ipaddr = require('ipaddr.js');

/**
 * Resolve the true visitor IP for a request (for audit/logging/gates).
 *
 * @param {object} req Express request (or null).
 * @returns {string} The visitor IP (cf-connecting-ip preferred, else req.ip,
 *                   else socket address), IPv4-mapped-IPv6 `::ffff:` prefix
 *                   stripped and trimmed, or '' when nothing is resolvable.
 */
function clientIp(req) {
  if (!req) return '';
  // Trim the header BEFORE the fallback: a whitespace-only cf-connecting-ip is
  // truthy but meaningless — let it fall through to req.ip rather than win the
  // `||` and resolve to ''.
  const hdr = ((req.headers && req.headers['cf-connecting-ip']) || '').trim();
  const raw = hdr || req.ip || (req.socket && req.socket.remoteAddress) || '';
  return String(raw).trim().replace(/^::ffff:/i, '');
}

/** Strip the IPv4-mapped-IPv6 prefix + trim a raw address-ish string. */
function normalizeRaw(value) {
  return String(value || '').trim().replace(/^::ffff:/i, '');
}

/**
 * Stable rate-limit / lockout BUCKET key for a request's visitor IP.
 *
 * IPv4 → the address itself. IPv6 → collapsed to its /64 prefix: a single
 * residential IPv6 allocation is typically a /64 (or larger), so keying on the
 * full /128 would let one visitor rotate through 2^64 addresses and trivially
 * defeat any per-IP limit.
 *
 * Robustness: prefer a VALID IP from `cf-connecting-ip`; if the header is
 * malformed/spoofed/multi-valued (not a parseable IP), fall back to `req.ip`
 * (the CF edge) so garbage can't mint a fresh per-request bucket. Only when
 * BOTH are unusable do we key on the first non-empty raw value (deterministic,
 * non-empty), and '' only when there is truly nothing to key on.
 *
 * @param {object} req Express request (or null).
 * @returns {string} An IPv4 address, an `…::/64` prefix, a raw fallback, or ''.
 */
function ipBucketKey(req) {
  let chosen = clientIp(req);
  if (!ipaddr.isValid(chosen)) {
    const fallback = normalizeRaw(req && req.ip);
    if (ipaddr.isValid(fallback)) {
      chosen = fallback;
    } else {
      chosen = chosen || fallback; // keep first non-empty for a stable key
    }
  }
  if (!chosen) return '';
  try {
    if (ipaddr.isValid(chosen)) {
      const addr = ipaddr.process(chosen); // unwraps any IPv4-mapped IPv6 to IPv4
      if (addr.kind() === 'ipv6') {
        const prefix = addr.parts.slice(0, 4).map((h) => h.toString(16)).join(':');
        return `${prefix}::/64`;
      }
      return addr.toString();
    }
  } catch (_e) {
    // fall through to the raw value
  }
  return chosen;
}

module.exports = { clientIp, ipBucketKey };
