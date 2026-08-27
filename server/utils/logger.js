// Shim — logger now lives in @crhs/web-core (byte-identical extraction).
// IMPORTANT: set LOG_SERVICE_NAME=crhs-portal in the environment so the log
// `service` tag stays 'crhs-portal' (web-core uses its own generic default tag
// when the env var is unset). See .env.example.
module.exports = require('@crhs/web-core').logger;
