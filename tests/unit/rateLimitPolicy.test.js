// Plan 3 task 25 (PR B7). server/middleware/rateLimiting.js is now the app
// POLICY module: it binds @crhs/web-core's limiter objects rather than
// re-deriving them, so a parameter change lands in one place. The affiliate's
// nine live limiters were measured parameter-identical to core's before the
// bind, so `toBe` (identity) is the assertion that proves no second copy exists.
//
// Branch C applies here: after Plan 3 tasks 16/18 the marketing/intake surface
// is gone, so `concierge=0` and `intake=0` — conciergeLimiter and the two
// contact-form limiters have zero app consumers and are NOT re-exported.

const path = require('path');
const fs = require('fs');

const policy = require('../../server/middleware/rateLimiting');
const wc = require('@crhs/web-core');

const REPO = path.join(__dirname, '..', '..');

describe('rateLimiting policy module binds web-core, never re-derives it', () => {
  const bound = [
    'authLimiter', 'passwordResetLimiter', 'registrationLimiter',
    'apiLimiter', 'sensitiveOperationLimiter', 'adminLoginLimiter'
  ];

  it.each(bound)('%s IS core\'s object, not a local copy', (name) => {
    expect(policy[name]).toBe(wc.rateLimiting[name]);
  });

  it('createCustomLimiter and _keyGenerators are core\'s too', () => {
    expect(policy.createCustomLimiter).toBe(wc.rateLimiting.createCustomLimiter);
    expect(policy._keyGenerators).toBe(wc.rateLimiting._keyGenerators);
  });

  it('the source no longer calls express-rate-limit directly', () => {
    const src = fs.readFileSync(
      path.join(REPO, 'server/middleware/rateLimiting.js'), 'utf8');
    expect(src).not.toMatch(/require\('express-rate-limit'\)/);
  });
});

describe('dead limiters are gone, not quietly re-exported', () => {
  // Zero consumers in server/ or server.js — measured at task 25 Step 0.
  it.each(['emailVerificationLimiter', 'fileUploadLimiter', 'adminOperationLimiter'])(
    '%s is undefined', (name) => {
      expect(policy[name]).toBeUndefined();
    });

  // Branch C: the intake routes were deleted in task 18, the explorer and
  // /api/concierge in task 17. Zero importers → not this app's policy.
  it.each(['contactFormBurstLimiter', 'contactFormLimiter', 'conciergeLimiter'])(
    '%s is undefined in the intake=0 / concierge=0 branch', (name) => {
      expect(policy[name]).toBeUndefined();
    });

  // --exclude the policy module itself: it DOCUMENTS why these are not bound.
  // What must not exist is a MOUNT — a route or the server entry reaching for one.
  const mounts = (name) => {
    const { execSync } = require('child_process');
    return execSync(
      `grep -rl --exclude=rateLimiting.js "${name}" server/ server.js || true`,
      { cwd: REPO }).toString().trim();
  };

  it('no route or server entry mounts the contact-form limiters', () => {
    expect(mounts('contactFormBurstLimiter\\|contactFormLimiter')).toBe('');
  });

  it('no route or server entry mounts conciergeLimiter', () => {
    expect(mounts('conciergeLimiter')).toBe('');
  });
});

describe('APP_LIMITER_NAMES is a LIVE getter over the bucket registry', () => {
  it('is defined as a getter, not a snapshot property', () => {
    const d = Object.getOwnPropertyDescriptor(
      require('../../server/middleware/rateLimiting'), 'APP_LIMITER_NAMES');
    expect(d).toBeDefined();
    expect(typeof d.get).toBe('function');
    expect(d.value).toBeUndefined();
  });

  it('sees bag_codes, which codeAttemptLockout registers AFTER this module loaded', () => {
    expect(policy.APP_LIMITER_NAMES).not.toContain('bag_codes');
    // Constructing the lockout store is what registers the bucket.
    require('../../server/services/codeAttemptLockout').storeCollectionName();
    expect(policy.APP_LIMITER_NAMES).toContain('bag_codes');
  });

  it('covers every bucket the live routes register via createCustomLimiter', () => {
    require('../../server/routes/authRoutes');
    require('../../server/routes/bagRoutes');
    require('../../server/routes/customerRoutes');
    require('../../server/routes/scanRoutes');
    const names = policy.APP_LIMITER_NAMES;
    for (const n of ['auth', 'pwreset', 'register', 'api', 'sensitive', 'admin_login',
      'bag-resolve', 'claim-resolve', 'email-verify', 'scan_actions']) {
      expect(names).toContain(n);
    }
  });
});

describe('the live collection prefix is unchanged', () => {
  it('collectionNameFor(auth) is the production bucket name', () => {
    expect(wc.rateLimiting.collectionNameFor('auth')).toBe('ratelimit_auth');
  });
});
