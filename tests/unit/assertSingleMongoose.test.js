const {
  assertSingleInstance,
  SHARED_STATEFUL_DEPS
} = require('../helpers/assertSingleMongoose');

const APP = '/app/node_modules';
const CORE = '/app/node_modules';

function resolver(prefix, overrides = {}) {
  return (name) => overrides[name] || `${prefix}/${name}/index.js`;
}

describe('assertSingleInstance', () => {
  test('exports the four stateful deps the two apps share', () => {
    expect(SHARED_STATEFUL_DEPS).toEqual(
      ['mongoose', 'express-session', 'connect-mongo', 'express-rate-limit']
    );
  });

  test('returns true when every dep resolves to the same file', () => {
    expect(assertSingleInstance({
      resolveFromApp: resolver(APP),
      resolveFromCore: resolver(CORE)
    })).toBe(true);
  });

  test('throws naming the split dep and BOTH paths', () => {
    const call = () => assertSingleInstance({
      resolveFromApp: resolver(APP),
      resolveFromCore: resolver('/app/node_modules/@crhs/web-core/node_modules')
    });
    expect(call).toThrow(/Dual-package install detected/);
    expect(call).toThrow(/mongoose/);
    expect(call).toThrow(/\/app\/node_modules\/mongoose\/index\.js/);
    expect(call).toThrow(/@crhs\/web-core\/node_modules\/mongoose\/index\.js/);
  });

  test('lists EVERY split dep, not just the first', () => {
    let message = '';
    try {
      assertSingleInstance({
        resolveFromApp: resolver(APP),
        resolveFromCore: resolver('/elsewhere')
      });
    } catch (e) { message = e.message; }
    for (const name of SHARED_STATEFUL_DEPS) expect(message).toContain(name);
  });

  test('names only the deps that actually diverged', () => {
    let message = '';
    try {
      assertSingleInstance({
        resolveFromApp: resolver(APP),
        resolveFromCore: resolver(APP, { 'connect-mongo': '/elsewhere/connect-mongo/index.js' })
      });
    } catch (e) { message = e.message; }
    expect(message).toContain('connect-mongo');
    expect(message).not.toContain('express-session');
  });

  test('tells the operator exactly how to fix it', () => {
    expect(() => assertSingleInstance({
      resolveFromApp: resolver(APP),
      resolveFromCore: resolver('/elsewhere')
    })).toThrow(/install-links=true/);
  });

  test('honours a caller-supplied names list', () => {
    expect(assertSingleInstance({
      resolveFromApp: resolver(APP),
      resolveFromCore: resolver('/elsewhere'),
      names: []
    })).toBe(true);
  });
});
