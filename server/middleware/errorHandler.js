// Shim — the central error handler and AppError now live in @crhs/web-core
// (near-identical extraction; behaviour pinned by
// tests/unit/webCoreShimIdentity.test.js, which also asserts core logs through
// the same logger instance this tree does). Kept as a thin re-export so existing
// require() call sites transparently consume the shared package
// (move-then-delete convention). Do not add logic here — edit web-core instead.
module.exports = require('@crhs/web-core').errorHandler;
