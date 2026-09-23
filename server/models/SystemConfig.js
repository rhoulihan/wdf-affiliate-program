// SystemConfig — registration module (NOT a shim).
//
// @crhs/web-core owns the schema, the pre-save value validation, the statics
// (getValue / setValue / getByCategory / getPublicConfigs / initializeDefaults)
// and the one mongoose model registration under this name. Before B8 this file
// carried a byte-identical 450-line copy of all of it and registered the same
// model name at :449 — on ONE mongoose instance (which
// tests/integration/webCoreInstanceIdentity.test.js proves is the topology),
// both reachable is OverwriteModelError AT BOOT. Spec §7.1.3.
//
// This file deliberately STAYS at this path and keeps doing real work rather
// than becoming a one-line shim, because it is the one place the app's
// contribution to the config registry happens: requiring it guarantees the
// app-owned defaults are registered before anyone calls initializeDefaults().
// Four suites also mock this path relatively (adminDashboard,
// administratorController, administratorControllerEnhanced, systemConfigRoutes)
// and tests/setup.js calls initializeDefaults() through it on every test.
//
// registerDefaults() is idempotent per key, so a clustered app requiring this
// once per worker — or a test module re-requiring it after jest.resetModules()
// — registers the same 23 entries exactly once.

const { SystemConfig } = require('@crhs/web-core');
const APP_SYSTEM_CONFIG_DEFAULTS = require('../config/systemConfigDefaults');

SystemConfig.registerDefaults(APP_SYSTEM_CONFIG_DEFAULTS);

module.exports = SystemConfig;
