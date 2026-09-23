// Shim — the Oracle-ADB cursor-retry patch now lives in @crhs/web-core
// (near-identical extraction; core resolves the driver class THROUGH mongoose
// rather than through a separately-resolved `mongodb`, which is the same class in
// this tree — asserted by tests/unit/webCoreShimIdentity.test.js). Kept as a thin
// re-export so existing require() call sites transparently consume the shared
// package (move-then-delete convention). Do not add logic here — edit web-core.
module.exports = require('@crhs/web-core').mongoCursorRetry;
