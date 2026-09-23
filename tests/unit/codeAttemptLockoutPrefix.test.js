// Plan 3 task 25 (PR B7). codeAttemptLockout hand-built its collection name as
// `ratelimit_${STORE_NAME}`, so setting RATE_LIMIT_COLLECTION_PREFIX moved the
// store's WRITES (increment/resetKey, which go through the store object) while
// isLockedOut kept READING the unprefixed collection — a lockout that silently
// stopped locking out. The name now comes from the store itself.

const path = require('path');
const fs = require('fs');

const SRC = path.join(__dirname, '..', '..', 'server/services/codeAttemptLockout.js');

describe('codeAttemptLockout collection naming', () => {
  it('exports storeCollectionName()', () => {
    const lockout = require('../../server/services/codeAttemptLockout');
    expect(typeof lockout.storeCollectionName).toBe('function');
  });

  it('defaults to the live bucket name ratelimit_bag_codes', () => {
    const lockout = require('../../server/services/codeAttemptLockout');
    expect(lockout.storeCollectionName()).toBe('ratelimit_bag_codes');
  });

  it('honours RATE_LIMIT_COLLECTION_PREFIX', () => {
    const original = process.env.RATE_LIMIT_COLLECTION_PREFIX;
    process.env.RATE_LIMIT_COLLECTION_PREFIX = 'corp_rl_';
    try {
      let name;
      jest.isolateModules(() => {
        name = require('../../server/services/codeAttemptLockout').storeCollectionName();
      });
      expect(name).toBe('corp_rl_bag_codes');
    } finally {
      if (original === undefined) delete process.env.RATE_LIMIT_COLLECTION_PREFIX;
      else process.env.RATE_LIMIT_COLLECTION_PREFIX = original;
    }
  });

  it('the source hand-builds no collection name — comments aside', () => {
    const code = fs.readFileSync(SRC, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments (incl. JSDoc examples)
      .replace(/^\s*\/\/.*$/gm, '');       // line comments
    expect(code).not.toMatch(/ratelimit_/);
  });
});
