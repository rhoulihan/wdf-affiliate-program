// Shim — the Oracle-ADB cursor diagnostics capture now lives in @crhs/web-core
// (near-identical extraction; core resolves the reported driver version THROUGH
// mongoose, which is the same copy in this tree — behaviour pinned by
// tests/unit/webCoreShimIdentity.test.js). Kept as a thin re-export so existing
// require() call sites transparently consume the shared package
// (move-then-delete convention). Do not add logic here — edit web-core instead.
module.exports = require('@crhs/web-core').mongoOracleDiagnostics;
