'use strict';

/**
 * Fail-fast topology guard for the test bootstrap.
 *
 * A dual-package install of @crhs/web-core is silent: nothing throws, and the
 * suite goes green while the app and the library write through two different
 * mongoose instances. This turns that into a loud, actionable error on the
 * first test file that loads.
 *
 * Resolvers are injected so this stays a pure function (unit-testable without
 * corrupting a real node_modules tree) and so the caller keeps control over
 * whether anything is actually LOADED — this module loads nothing.
 */

/** Deps that carry process-wide state and MUST be one instance. */
const SHARED_STATEFUL_DEPS = ['mongoose', 'express-session', 'connect-mongo', 'express-rate-limit'];

/**
 * @param {object} deps
 * @param {(name: string) => string} deps.resolveFromApp   resolve as the app would
 * @param {(name: string) => string} deps.resolveFromCore  resolve as web-core would
 * @param {string[]} [deps.names=SHARED_STATEFUL_DEPS]
 * @returns {true}
 * @throws {Error} listing every dep that resolves to two different files
 */
function assertSingleInstance({ resolveFromApp, resolveFromCore, names = SHARED_STATEFUL_DEPS }) {
  const split = [];
  for (const name of names) {
    const app = resolveFromApp(name);
    const core = resolveFromCore(name);
    if (app !== core) split.push(`  ${name}\n    app      -> ${app}\n    web-core -> ${core}`);
  }
  if (split.length) {
    throw new Error(
      'Dual-package install detected: this app and @crhs/web-core resolve '
      + 'DIFFERENT copies of:\n'
      + split.join('\n')
      + '\n\nEach copy carries its own model registry and connection pool, so '
      + 'documents written through one are invisible to the other.\n'
      + 'Fix: confirm .npmrc contains `install-links=true`, then\n'
      + '  rm -rf node_modules/@crhs && npm install --install-links'
    );
  }
  return true;
}

module.exports = { assertSingleInstance, SHARED_STATEFUL_DEPS };
