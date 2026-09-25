// Owner request 2026-09-25, after Task 34's round trip.
//
// Password reset is keyed on EMAIL (standard), but affiliate login looked the
// account up by USERNAME only, so the address you just proved you control did not
// get you in — and the 401 says "Invalid username or password" either way, so it
// cannot tell you which half was wrong. Live example: an affiliate whose email is
// pickups@rundberglaundry.com has username "WaveMAX".
//
// Login now accepts EITHER. Username is tried FIRST so an exact username always
// wins over some other account's email — both fields are unique individually but
// nothing stops one account's username equalling another's email, and the
// precedence must be deterministic rather than whichever query happens to run.
const app = require('../../server');
const Affiliate = require('../../server/models/Affiliate');
const encryptionUtil = require('../../server/utils/encryption');
const { getCsrfToken, createAgent } = require('../helpers/csrfHelper');
const { getStrongPassword } = require('../helpers/testPasswords');

jest.setTimeout(90000);

const PW = getStrongPassword('affiliate', 1);

const makeAffiliate = async (over = {}) => {
  const { hash, salt } = encryptionUtil.hashPassword(over.password || PW);
  delete over.password;
  const a = new Affiliate({
    affiliateId: 'AFF-IDENT-1', firstName: 'Pick', lastName: 'Ups',
    email: 'pickups@example.com', phone: '555-123-4567',
    address: '123 Main St', city: 'Austin', state: 'TX', zipCode: '78701',
    serviceArea: 'Downtown', username: 'BrandName', paymentMethod: 'check',
    passwordSalt: salt, passwordHash: hash, isActive: true, ...over
  });
  await a.save();
  return a;
};

describe('affiliate login accepts a username OR an email', () => {
  let agent, csrfToken;

  beforeEach(async () => {
    agent = createAgent(app);
    csrfToken = await getCsrfToken(app, agent);
    await Affiliate.deleteMany({});
  });

  const login = (username, password = PW) => agent
    .post('/api/v1/auth/affiliate/login')
    .set('x-csrf-token', csrfToken)
    .send({ username, password });

  it('still accepts the username (regression)', async () => {
    await makeAffiliate();
    const res = await login('BrandName');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('still accepts the username case-insensitively (regression)', async () => {
    await makeAffiliate();
    expect((await login('brandname')).status).toBe(200);
  });

  it('accepts the email address', async () => {
    await makeAffiliate();
    const res = await login('pickups@example.com');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.affiliate.affiliateId).toBe('AFF-IDENT-1');
  });

  it('accepts the email case-insensitively', async () => {
    await makeAffiliate();
    expect((await login('PickUps@Example.COM')).status).toBe(200);
  });

  it('a correct email with the wrong password reaches the PASSWORD check', async () => {
    const a = await makeAffiliate();
    const res = await login('pickups@example.com', 'WrongPassword!123');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid username or password');
    // The discriminator: only the wrong-password branch increments the attempt
    // counter. Without it this case would also pass while the account was simply
    // never found, i.e. for the wrong reason.
    const after = await Affiliate.findById(a._id).lean();
    expect(after.loginAttempts).toBeGreaterThan(0);
  });

  it('an unknown identifier is the same generic 401 (no enumeration)', async () => {
    await makeAffiliate();
    const unknown = await login('nobody@example.com');
    const wrongPw = await login('pickups@example.com', 'WrongPassword!123');
    expect(unknown.status).toBe(401);
    expect(unknown.body.message).toBe(wrongPw.body.message);
  });

  // Determinism: username must win. Otherwise adding the email lookup could hand
  // an attacker who controls an email that equals someone else's username a path
  // to the wrong account.
  it('an exact username match wins over another account\'s email', async () => {
    await makeAffiliate({ affiliateId: 'AFF-BY-USERNAME', username: 'shared@example.com', email: 'other@example.com' });
    await makeAffiliate({ affiliateId: 'AFF-BY-EMAIL', username: 'SomethingElse', email: 'shared@example.com' });
    const res = await login('shared@example.com');
    expect(res.status).toBe(200);
    expect(res.body.affiliate.affiliateId).toBe('AFF-BY-USERNAME');
  });
});
