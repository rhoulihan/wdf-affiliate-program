// Found while executing Plan 3 task 45 (recorded there as E-45-3).
//
// Administrator.passwordSalt/passwordHash declared `select: true`. That is
// mongoose's DEFAULT for a path, so it looks inert — but an explicit `select: true`
// makes mongoose ADD the field to an INCLUSIVE projection. So
// `.populate('createdBy', 'firstName lastName')` returned firstName, lastName AND
// the PBKDF2 salt and hash, and fieldFilter whitelists `createdBy` wholesale, so
// both reached the response body of GET /api/v1/administrators/operators[/:id].
//
// Admin-authenticated only, but it is password material in an HTTP response: it
// lands in proxy logs, browser devtools, HAR exports and anything that records
// responses. No other model declares select on these fields — Administrator was
// the outlier.
const mongoose = require('mongoose');

const Administrator = require('../../server/models/Administrator');
const Operator = require('../../server/models/Operator');
const fieldFilterModule = require('../../server/utils/fieldFilter');

const SALT = 'SENTINEL_SALT_VALUE';
const HASH = 'SENTINEL_HASH_VALUE';

describe('administrator credentials never leave the database layer', () => {
  let admin, operator;

  beforeEach(async () => {
    admin = await Administrator.create({
      firstName: 'Ada', lastName: 'Lovelace', email: 'ada.leak@example.com',
      passwordSalt: SALT, passwordHash: HASH, permissions: ['all'], isActive: true
    });
    operator = await Operator.create({
      firstName: 'Op', lastName: 'One', email: 'op.leak@example.com',
      username: 'opleak1', password: 'Str0ng!Passw0rd!x',
      operatorId: 'OPLEAK1', createdBy: admin._id, isActive: true
    });
  });

  it('the schema does not force password material into a projection', () => {
    for (const path of ['passwordSalt', 'passwordHash']) {
      // An explicit `select: true` is what caused the leak. Absent (or false) is fine.
      expect(Administrator.schema.path(path).options.select).not.toBe(true);
    }
  });

  it('populate("createdBy") returns no salt or hash', async () => {
    const got = await Operator.findById(operator._id)
      .populate('createdBy', 'firstName lastName').lean();
    expect(Object.keys(got.createdBy)).toEqual(expect.arrayContaining(['firstName', 'lastName']));
    expect(got.createdBy).not.toHaveProperty('passwordSalt');
    expect(got.createdBy).not.toHaveProperty('passwordHash');
  });

  it('no sentinel survives anywhere in the serialised populated document', async () => {
    const got = await Operator.findById(operator._id)
      .populate('createdBy', 'firstName lastName').lean();
    expect(JSON.stringify(got)).not.toContain(SALT);
    expect(JSON.stringify(got)).not.toContain(HASH);
  });

  it('no sentinel survives the response filter the API uses', async () => {
    const got = await Operator.findById(operator._id)
      .populate('createdBy', 'firstName lastName').lean();
    const filtered = fieldFilterModule.fieldFilter(got, 'administrator');
    expect(JSON.stringify(filtered)).not.toContain(SALT);
    expect(JSON.stringify(filtered)).not.toContain(HASH);
  });

  // The control: removing the leak must NOT break the auth lookup, which reads
  // the credential through an unprojected findOne.
  it('an unprojected findOne still returns the credential, so login still works', async () => {
    const found = await Administrator.findOne({ email: 'ada.leak@example.com' });
    expect(found.passwordSalt).toBe(SALT);
    expect(found.passwordHash).toBe(HASH);
  });

  it('findById also still returns it (rbac.js:171 depends on this)', async () => {
    const found = await Administrator.findById(admin._id);
    expect(found.passwordHash).toBe(HASH);
  });
});
