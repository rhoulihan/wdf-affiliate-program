// Shim — client-IP helpers now lives in @crhs/web-core (byte-identical extraction).
// Kept as a thin re-export so existing require() call sites transparently
// consume the shared package (move-then-delete convention; see
// docs/refactor). Do not add logic here — edit web-core instead.
module.exports = require('@crhs/web-core').clientIp;
