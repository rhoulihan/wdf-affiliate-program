// Shim — the audit logger now lives in @crhs/web-core (spec §7.3). The bodies were
// already identical: the only difference was the log DESTINATION, and the local copy
// was the wrong one — it hardcoded path.join(__dirname, '../../logs') and ignored
// LOG_DIR, while web-core's csrf-config writes the portal's CSRF audit events through
// web-core's own auditLogger, which honours it. Two audit trails, one env var apart.
// tests/integration/auditLogDestination.test.js pins the destination in both
// directions; web-core 0.3.2 is required, because before it the LOG_DIR-unset fallback
// resolved inside node_modules/@crhs/web-core/logs/ — wiped by every npm install.
module.exports = require('@crhs/web-core').auditLogger;
