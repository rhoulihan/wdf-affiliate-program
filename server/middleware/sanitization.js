// Shim — input sanitization now lives in @crhs/web-core (near-identical
// extraction; web-core v0.3.1 took this tree's prototype-safe own-property check
// and its regex fix, so the two are now equivalent — proved by a 31-case probe
// and pinned by tests/unit/webCoreShimIdentity.test.js). Kept as a thin
// re-export so existing require() call sites transparently consume the shared
// package (move-then-delete convention). Do not add logic here — edit web-core.
module.exports = require('@crhs/web-core').sanitization;
