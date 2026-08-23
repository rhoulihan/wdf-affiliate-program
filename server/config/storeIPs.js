const logger = require('../utils/logger');
// Store IP Configuration for Laundromat Affiliate Program
// These IP addresses are trusted store locations where operators work
// Sessions from these IPs will be automatically renewed

// Parse a textual IPv6 address into a 128-bit BigInt (handles `::` compression).
// Returns null for anything malformed. Pure IPv6 only — embedded IPv4
// (e.g. ::ffff:1.2.3.4) is not accepted here; callers strip the ::ffff: prefix
// before matching, so a store device's global IPv6 is what reaches this.
function ipv6ToBigInt(addr) {
  if (typeof addr !== 'string') return null;
  const s = addr.split('%')[0].trim(); // drop any zone id
  if (s === '' || s.indexOf('.') !== -1) return null;
  let groups;
  const dbl = s.indexOf('::');
  if (dbl !== -1) {
    if (s.indexOf('::', dbl + 1) !== -1) return null; // only one '::' allowed
    const headParts = s.slice(0, dbl) ? s.slice(0, dbl).split(':') : [];
    const tailParts = s.slice(dbl + 2) ? s.slice(dbl + 2).split(':') : [];
    const missing = 8 - headParts.length - tailParts.length;
    if (missing < 1) return null; // '::' must stand for >= 1 zero group
    groups = [...headParts, ...Array(missing).fill('0'), ...tailParts];
  } else {
    groups = s.split(':');
  }
  if (groups.length !== 8) return null;
  let result = 0n;
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    result = (result << 16n) | BigInt(parseInt(g, 16));
  }
  return result;
}

// Load configuration from environment variables
// Use existing STORE_IP_ADDRESS variable, with support for multiple IPs
const storeIPAddress = process.env.STORE_IP_ADDRESS;
const additionalIPs = process.env.ADDITIONAL_STORE_IPS;

const whitelistedIPs = [];
if (storeIPAddress) {
  whitelistedIPs.push(storeIPAddress.trim());
}
if (additionalIPs) {
  whitelistedIPs.push(...additionalIPs.split(',').map(ip => ip.trim()).filter(ip => ip));
}

const whitelistedRanges = process.env.STORE_IP_RANGES
  ? process.env.STORE_IP_RANGES.split(',').map(range => range.trim()).filter(range => range)
  : [];

module.exports = {
  // Store IP whitelist - loaded from environment
  whitelistedIPs,
  
  // IP ranges (CIDR notation) - for store networks
  whitelistedRanges,
  
  // Session renewal settings
  sessionRenewal: {
    // How often to check if token needs renewal (in milliseconds)
    checkInterval: parseInt(process.env.STORE_SESSION_CHECK_INTERVAL || 300000), // Default: 5 minutes
    
    // Renew token when it has less than this much time left (in milliseconds)
    renewThreshold: parseInt(process.env.STORE_SESSION_RENEW_THRESHOLD || 1800000), // Default: 30 minutes
    
    // Maximum session duration for store IPs (in milliseconds)
    maxSessionDuration: parseInt(process.env.STORE_SESSION_MAX_DURATION || 86400000), // Default: 24 hours
  },
  
  // Function to check if an IP is whitelisted
  isWhitelisted(ip) {
    // Direct IP match
    if (this.whitelistedIPs.includes(ip)) {
      return true;
    }
    
    // Check IP ranges (requires ip-range-check package)
    // Simplified check for now - can be enhanced with proper CIDR matching
    for (const range of this.whitelistedRanges) {
      if (this.isInRange(ip, range)) {
        return true;
      }
    }
    
    return false;
  },
  
  // IP range checker — supports both IPv4 and IPv6 CIDRs. The address family of
  // `ip` and `cidr` must match (no cross-family matches). (Throws on null inputs
  // are caught and logged below — intentional.)
  isInRange(ip, cidr) {
    try {
      // Basic CIDR validation and parsing
      const [network, bits] = cidr.split('/');
      if (!bits || !network) return false;

      const maskBits = parseInt(bits);
      if (isNaN(maskBits) || maskBits < 0) return false;

      const cidrIsV6 = network.includes(':');
      const ipIsV6 = ip.includes(':');
      if (cidrIsV6 !== ipIsV6) return false; // never cross IPv4/IPv6 families

      if (cidrIsV6) {
        if (maskBits > 128) return false;
        const ipInt = ipv6ToBigInt(ip);
        const netInt = ipv6ToBigInt(network);
        if (ipInt === null || netInt === null) return false;
        const full = (1n << 128n) - 1n;
        const mask = maskBits === 0 ? 0n : (full << BigInt(128 - maskBits)) & full;
        return (ipInt & mask) === (netInt & mask);
      }

      // IPv4
      if (maskBits > 32) return false;
      const ipToInt = (addr) => {
        const parts = addr.split('.');
        if (parts.length !== 4) return null;

        let result = 0;
        for (let i = 0; i < 4; i++) {
          const num = parseInt(parts[i]);
          if (isNaN(num) || num < 0 || num > 255) return null;
          result = (result * 256) + num; // Use multiplication to avoid sign issues
        }
        return result >>> 0; // Force unsigned
      };

      const ipInt = ipToInt(ip);
      const netInt = ipToInt(network);

      if (ipInt === null || netInt === null) return false;

      // Create mask - need to handle JavaScript's signed 32-bit integers
      const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;

      // Check if IP is in range
      return (ipInt & mask) === (netInt & mask);
    } catch (error) {
      logger.error('Error checking IP range:', error);
      return false;
    }
  }
};